/**
 * Labels the whole corpus once, offline, and writes data/labelled.json.
 *
 *   node scripts/label.mjs            # label everything not yet done
 *   node scripts/label.mjs --limit 200
 *   node scripts/label.mjs --fresh    # ignore previous results
 *
 * Resumable: re-running only labels items that are missing, so a crash or a
 * Ctrl-C costs nothing. The deployed app reads data/labelled.json, so mentors
 * testing the site never spend your API credit.
 */
import fs from "node:fs";
import path from "node:path";
import Anthropic from "@anthropic-ai/sdk";

const ROOT = path.resolve(import.meta.dirname, "..");
const CORPUS = path.join(ROOT, "data", "corpus.json");
const OUT = path.join(ROOT, "data", "labelled.json");

const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const fresh = args.includes("--fresh");

// Read .env.local if present, so the key lives in one place and is never typed
// into a terminal (where it ends up in shell history and screenshots).
function loadEnvLocal() {
  for (const name of [".env.local", ".env"]) {
    const f = path.join(ROOT, name);
    if (!fs.existsSync(f)) continue;
    for (const raw of fs.readFileSync(f, "utf8").split(/\r?\n/)) {
      const line = raw.trim();
      if (!line || line.startsWith("#")) continue;
      const eq = line.indexOf("=");
      if (eq === -1) continue;
      const k = line.slice(0, eq).trim();
      let v = line.slice(eq + 1).trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[k]) process.env[k] = v;
    }
  }
}
loadEnvLocal();

const key = process.env.ANTHROPIC_API_KEY;
if (!key) {
  console.error(
    "No API key found.\n" +
    "  Put it in .env.local next to package.json:\n" +
    "      ANTHROPIC_API_KEY=sk-ant-...\n" +
    "  or in PowerShell:  $env:ANTHROPIC_API_KEY=\"sk-ant-...\""
  );
  process.exit(1);
}
const client = new Anthropic({ apiKey: key });

// ── schema (kept in step with lib/schema.ts) ──────────────────────────────
const TRIGGERS = ["income_shock","goal_reallocation","belief_collapse","market_fear","involuntary","better_alternative","advice_change","friction","none"];
const GAPS = ["exit_withdrawal_rules","how_returns_work","fund_choice","tax","payment_mandate_mechanics","risk_volatility","none"];
const CHANNELS = ["friend_family","youtube","reddit_forum","google","in_app_support","ai_chatbot","advisor","none"];

const SYSTEM = fs.readFileSync(path.join(ROOT, "lib", "schema.ts"), "utf8")
  .split("export const SYSTEM_PROMPT = `")[1].split("`;")[0]
  .replace("${describe(TRIGGERS)}", TRIGGERS.join(", "))
  .replace("${describe(INFO_GAPS)}", GAPS.join(", "))
  .replace("${describe(HELP_CHANNELS)}", CHANNELS.join(", "));

const TOOL = {
  name: "record_labels",
  description: "Record the schema labels for each item.",
  input_schema: {
    type: "object",
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            relevant: { type: "boolean" },
            stage: { type: "string", enum: ["pre_start","first_3_months","3_to_12_months","after_12_months","unclear"] },
            outcome: { type: "string", enum: ["continuing","paused","stopped","reduced","resumed","never_started","unclear"] },
            primary_trigger: { type: "string", enum: TRIGGERS },
            all_triggers: { type: "array", items: { type: "string", enum: TRIGGERS } },
            expectation: { type: "string", enum: ["monthly_profit","long_term_growth","savings_discipline","tax_saving","goal_specific","unclear"] },
            info_gaps: { type: "array", items: { type: "string", enum: GAPS } },
            help_channels: { type: "array", items: { type: "string", enum: CHANNELS } },
            knew_flexibility: { type: "string", enum: ["yes","no","unclear"] },
            income_stability: { type: "string", enum: ["fixed","variable","dependent","unclear"] },
            first_time_investor: { type: "string", enum: ["yes","no","unclear"] },
            evidence: { type: "string" },
            confidence: { type: "string", enum: ["high","medium","low"] },
          },
          required: ["id","relevant","stage","outcome","primary_trigger","all_triggers","expectation","info_gaps","help_channels","knew_flexibility","income_stability","first_time_investor","evidence","confidence"],
        },
      },
    },
    required: ["labels"],
  },
};

function passesGate(label, text) {
  if (!label?.evidence || label.evidence.trim().length < 8) return false;
  if (label.confidence === "low") return false;
  const norm = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();
  return norm(text).includes(norm(label.evidence).slice(0, 40));
}

async function pickModel() {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  const list = await client.models.list({ limit: 50 });
  const ids = list.data.map((m) => m.id);
  return ids.find((i) => i.includes("haiku")) || ids.find((i) => i.includes("sonnet")) || ids[0];
}

async function labelBatch(batch, model) {
  const payload = batch.map((i) => `<item id="${i.id}">\n${i.text}\n</item>`).join("\n\n");
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await client.messages.create({
        model, max_tokens: 4096, system: SYSTEM, tools: [TOOL],
        tool_choice: { type: "tool", name: "record_labels" },
        messages: [{ role: "user", content: `Label every item below.\n\n${payload}` }],
      });
      const block = res.content.find((c) => c.type === "tool_use");
      const labels = block?.input?.labels ?? [];
      const byId = new Map(labels.map((l) => [String(l.id), l]));
      return batch.map((it) => {
        const l = byId.get(it.id);
        return l ? { ...it, label: l, gated: passesGate(l, it.text) } : null;
      }).filter(Boolean);
    } catch (e) {
      if (attempt === 2) { console.warn("  batch failed:", e.message); return []; }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }
  return [];
}

const corpus = JSON.parse(fs.readFileSync(CORPUS, "utf8"));
let done = [];
if (!fresh && fs.existsSync(OUT)) {
  try { done = JSON.parse(fs.readFileSync(OUT, "utf8")).results ?? []; } catch {}
}
const doneIds = new Set(done.map((d) => d.id));
const todo = corpus.filter((c) => !doneIds.has(c.id)).slice(0, limit);

console.log(`corpus ${corpus.length} · already labelled ${done.length} · to do ${todo.length}`);
if (todo.length === 0) process.exit(0);

const model = await pickModel();
console.log("model:", model);

const BATCH = 8, CONCURRENCY = 4;
const batches = [];
for (let i = 0; i < todo.length; i += BATCH) batches.push(todo.slice(i, i + BATCH));

let completed = 0;
for (let i = 0; i < batches.length; i += CONCURRENCY) {
  const slice = batches.slice(i, i + CONCURRENCY);
  const got = await Promise.all(slice.map((b) => labelBatch(b, model)));
  for (const g of got) done.push(...g);
  completed += slice.length;
  fs.writeFileSync(OUT, JSON.stringify({ model, labelled_at: new Date().toISOString(), results: done }, null, 1));
  process.stdout.write(`\r  ${done.length}/${corpus.length} laboured through…   `);
}
console.log(`\ndone → data/labelled.json (${done.length} items)`);
