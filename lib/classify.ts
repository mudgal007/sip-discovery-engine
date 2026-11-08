import { client, pickModel } from "./anthropic";
import { SYSTEM_PROMPT, TRIGGERS, INFO_GAPS, HELP_CHANNELS, Label, passesGate } from "./schema";

export type Item = { id: string; text: string; source?: string; date?: string };
export type Labelled = Item & { label: Label; gated: boolean };

export const EMPTY_LABEL: Label = {
  relevant: false,
  stage: "unclear",
  outcome: "unclear",
  primary_trigger: "none",
  all_triggers: [],
  expectation: "unclear",
  info_gaps: [],
  help_channels: [],
  knew_flexibility: "unclear",
  income_stability: "unclear",
  first_time_investor: "unclear",
  evidence: "",
  confidence: "low",
};

export const TOOL = {
  name: "record_labels",
  description: "Record the schema labels for each item, in the same order they were given.",
  input_schema: {
    type: "object" as const,
    properties: {
      labels: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            relevant: { type: "boolean" },
            stage: { type: "string", enum: ["pre_start", "first_3_months", "3_to_12_months", "after_12_months", "unclear"] },
            outcome: { type: "string", enum: ["continuing", "paused", "stopped", "reduced", "resumed", "never_started", "unclear"] },
            primary_trigger: { type: "string", enum: Object.keys(TRIGGERS) },
            all_triggers: { type: "array", items: { type: "string", enum: Object.keys(TRIGGERS) } },
            expectation: { type: "string", enum: ["monthly_profit", "long_term_growth", "savings_discipline", "tax_saving", "goal_specific", "unclear"] },
            info_gaps: { type: "array", items: { type: "string", enum: Object.keys(INFO_GAPS) } },
            help_channels: { type: "array", items: { type: "string", enum: Object.keys(HELP_CHANNELS) } },
            knew_flexibility: { type: "string", enum: ["yes", "no", "unclear"] },
            income_stability: { type: "string", enum: ["fixed", "variable", "dependent", "unclear"] },
            first_time_investor: { type: "string", enum: ["yes", "no", "unclear"] },
            evidence: { type: "string", description: "Exact substring from the item supporting these labels. Empty string if none exists." },
            confidence: { type: "string", enum: ["high", "medium", "low"] },
          },
          required: ["id", "relevant", "stage", "outcome", "primary_trigger", "all_triggers", "expectation", "info_gaps", "help_channels", "knew_flexibility", "income_stability", "first_time_investor", "evidence", "confidence"],
        },
      },
    },
    required: ["labels"],
  },
};

async function labelBatch(items: Item[], model: string): Promise<Labelled[]> {
  const payload = items.map((i) => `<item id="${i.id}">\n${i.text}\n</item>`).join("\n\n");
  const res = await client().messages.create({
    model,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    tools: [TOOL],
    tool_choice: { type: "tool", name: "record_labels" },
    messages: [{ role: "user", content: `Label every item below.\n\n${payload}` }],
  });
  const block = res.content.find((c) => c.type === "tool_use");
  if (!block || block.type !== "tool_use") throw new Error("Model returned no labels");
  const labels = (block.input as { labels: (Label & { id: string })[] }).labels || [];
  const byId = new Map(labels.map((l) => [String(l.id), l]));
  return items.map((it) => {
    const l = byId.get(it.id);
    if (!l) return { ...it, label: { ...EMPTY_LABEL }, gated: false };
    return { ...it, label: l, gated: passesGate(l, it.text) };
  });
}

export async function classifyAll(items: Item[], batchSize = 8) {
  const model = await pickModel();
  const out: Labelled[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    try {
      out.push(...(await labelBatch(batch, model)));
    } catch {
      for (const it of batch) out.push({ ...it, label: { ...EMPTY_LABEL }, gated: false });
    }
  }
  return { model, results: out };
}
