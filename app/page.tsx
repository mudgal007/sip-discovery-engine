"use client";

import { useState } from "react";
import summary from "@/data/summary.json";
import sources from "@/data/sources.json";
import golden from "@/data/golden.json";

const PRETTY: Record<string, string> = {
  belief_collapse: "Decided it wasn't working",
  income_shock: "Money got tight",
  involuntary: "Stopped without a decision",
  goal_reallocation: "Needed the money for something",
  better_alternative: "Moved to something else",
  market_fear: "Market fall (stated explicitly)",
  friction: "Friction in the SIP journey",
  advice_change: "Someone advised them to stop",
  payment_mandate_mechanics: "Payment and mandate rules",
  exit_withdrawal_rules: "Exit and withdrawal rules",
  how_returns_work: "How returns work",
  fund_choice: "Which fund",
  risk_volatility: "Risk and volatility",
  in_app_support: "The app's own help",
  reddit_forum: "Reddit or a forum",
  friend_family: "A friend or family",
  ai_chatbot: "ChatGPT or similar",
};
const nice = (k: string) => PRETTY[k] || k.replace(/_/g, " ");

export default function Page() {
  const [tab, setTab] = useState<"run" | "evidence" | "try">("run");
  return (
    <div className="wrap">
      <h1>SIP continuation — discovery engine</h1>
      <p className="sub">
        Labels public investor conversation against a fixed 12-field schema, refuses to count
        anything it cannot quote, and reports where 12-month SIP continuation breaks down. Not a
        summariser: the labels were decided in advance and every count is checkable.
      </p>
      <div className="tabs">
        <button className="tab" data-on={tab === "run"} onClick={() => setTab("run")}>Corpus &amp; opportunities</button>
        <button className="tab" data-on={tab === "evidence"} onClick={() => setTab("evidence")}>Evidence log</button>
        <button className="tab" data-on={tab === "try"} onClick={() => setTab("try")}>Try it on your own text</button>
      </div>
      {tab === "run" && <RunTab />}
      {tab === "evidence" && <EvidenceTab />}
      {tab === "try" && <TryTab />}
    </div>
  );
}

function Bars({ data, total, highlight = 1 }: { data: Record<string, number>; total: number; highlight?: number }) {
  const keys = Object.keys(data);
  if (!keys.length) return <p className="muted">Nothing counted.</p>;
  const max = Math.max(...keys.map((k) => data[k]));
  return (
    <table>
      <tbody>
        {keys.map((k, i) => (
          <tr key={k}>
            <td style={{ width: "38%" }}>{nice(k)}</td>
            <td className="num" style={{ width: 54 }}>{data[k]}</td>
            <td className="num muted" style={{ width: 66 }}>{Math.round((data[k] / total) * 1000) / 10}%</td>
            <td>
              <span className="bar" style={{ width: `${(data[k] / max) * 100}%`, background: i < highlight ? "#B2560D" : "#1F4FBF" }} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function RunTab() {
  const s = summary as any;
  const t = s.totals;
  return (
    <>
      <h2>What was collected</h2>
      <table>
        <thead>
          <tr><th>Source</th><th className="num">Items</th><th className="num">About SIPs</th><th className="num">Counted after the gate</th></tr>
        </thead>
        <tbody>
          {Object.entries(s.by_source).map(([k, v]: any) => (
            <tr key={k}>
              <td>{k.replace(/_/g, " ")}</td>
              <td className="num">{v.total}</td>
              <td className="num">{v.relevant} <span className="muted">({Math.round((v.relevant / v.total) * 100)}%)</span></td>
              <td className="num">{v.counted} <span className="muted">({Math.round((v.counted / v.total) * 100)}%)</span></td>
            </tr>
          ))}
          <tr>
            <td><strong>Total</strong></td>
            <td className="num"><strong>{t.items}</strong></td>
            <td className="num"><strong>{t.relevant}</strong></td>
            <td className="num"><strong>{t.counted}</strong></td>
          </tr>
        </tbody>
      </table>
      <p className="muted small">
        Collection: {(sources as any).play_store?.total_reviews_pulled ?? "9,900"} Play reviews and 500 App Store
        reviews pulled, kept at ≥40 characters; TradingQ&amp;A searched across 16 discontinuation queries; plus
        screener free-text. Reddit was unreachable from the collection environment and is declared rather than
        substituted. {t.held_back} relevant items were held back by the quality gate and are listed at the bottom.
      </p>

      <h2>Why continuation breaks down</h2>
      <Bars data={s.primary_trigger} total={t.counted} highlight={2} />

      <h2>What they did not understand</h2>
      <Bars data={s.info_gaps} total={t.counted} />

      <h2>Where they went when unsure</h2>
      <Bars data={s.help_channels} total={t.counted} />

      <h2>Awareness that pause or reduce exists</h2>
      <table><tbody>
        {Object.entries(s.knew_flexibility).map(([k, v]: any) => (
          <tr key={k}><td style={{ width: "38%" }}>{k}</td><td className="num">{v}</td><td /></tr>
        ))}
      </tbody></table>

      <h2>Counted items, with the quote each rests on</h2>
      <p className="muted small">First {s.examples.length} of {t.counted}.</p>
      <table>
        <thead><tr><th>Source</th><th>Trigger</th><th>Evidence the engine quoted</th><th>Conf.</th></tr></thead>
        <tbody>
          {s.examples.map((e: any, i: number) => (
            <tr key={i}>
              <td className="muted">{e.source}</td>
              <td>{nice(e.trigger)}</td>
              <td><div className="quote">{e.evidence}</div></td>
              <td><span className={"tag " + (e.confidence === "high" ? "ok" : "")}>{e.confidence}</span></td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Held back — counted nowhere</h2>
      <p className="muted small">
        Relevant items the engine could not ground in a quote it was confident about. Shown rather than dropped.
      </p>
      <table><tbody>
        {s.held_back_examples.map((e: any, i: number) => (
          <tr key={i}><td className="muted" style={{ width: 90 }}>{e.source}</td><td>{e.text}</td></tr>
        ))}
      </tbody></table>
    </>
  );
}

function EvidenceTab() {
  const [res, setRes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const labelled = (golden as any[]).filter(
    (g) => g.human && Object.values(g.human).some((v) => v !== null && v !== "")
  );

  async function run() {
    setBusy(true); setErr("");
    try {
      const r = await fetch("/api/eval", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ golden: labelled }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      setRes(j);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h2>How far can this engine be trusted?</h2>
      <p className="sub">
        {labelled.length} items were labelled by hand first, blind, sampled across all four sources. The engine then
        labelled the same items. Agreement is reported field by field and every disagreement is shown.
      </p>
      {labelled.length === 0 && (
        <div className="err">No hand labels yet — fill the <code>human</code> fields in <code>data/golden.json</code>.</div>
      )}
      <button className="go" onClick={run} disabled={busy || labelled.length === 0}>
        {busy ? "Scoring…" : "Score the engine against the hand labels"}
      </button>
      {err && <div className="err">{err}</div>}
      {res && (
        <>
          <div className="grid" style={{ marginTop: 18 }}>
            <div className="card"><div className="n">{Math.round(res.overall.rate * 100)}%</div>
              <div className="k">overall agreement ({res.overall.agreed}/{res.overall.scored} field decisions)</div></div>
            {Object.entries(res.perField).map(([f, v]: any) => (
              <div className="card" key={f}><div className="n">{Math.round(v.rate * 100)}%</div>
                <div className="k">{f.replace(/_/g, " ")} ({v.agreed}/{v.scored})</div></div>
            ))}
          </div>
          <h2>Where it disagreed with me</h2>
          {res.disagreements.length === 0 && <p className="muted">No disagreements.</p>}
          <table>
            <thead><tr><th>Field</th><th>I said</th><th>Engine said</th><th>Item</th></tr></thead>
            <tbody>
              {res.disagreements.map((d: any, i: number) => (
                <tr key={i}>
                  <td>{d.field.replace(/_/g, " ")}</td>
                  <td><span className="tag ok">{String(d.human)}</span></td>
                  <td><span className="tag warn">{String(d.engine)}</span></td>
                  <td><div className="quote">{d.text}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}

function TryTab() {
  const [text, setText] = useState(
    "I started my SIP last year thinking I would see some profit every month. After 6 months the amount was almost the same as what I put in, so I felt it is not working and stopped it. Nobody told me how long it takes."
  );
  const [out, setOut] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function run() {
    setBusy(true); setErr(""); setOut(null);
    try {
      const r = await fetch("/api/classify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ items: [{ id: "x1", text }] }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || "Request failed");
      setOut(j.results[0]);
    } catch (e) { setErr(e instanceof Error ? e.message : "Failed"); }
    finally { setBusy(false); }
  }

  return (
    <>
      <h2>Paste anything a real investor wrote</h2>
      <p className="sub">
        A review, a forum post, a message. The engine labels it against the same schema and must quote the span it
        relied on. If it cannot, it says so rather than guessing.
      </p>
      <textarea rows={6} value={text} onChange={(e) => setText(e.target.value)} />
      <div style={{ marginTop: 12 }}>
        <button className="go" onClick={run} disabled={busy}>{busy ? "Labelling…" : "Label it"}</button>
      </div>
      {err && <div className="err">{err}</div>}
      {out && (
        <div className="note" style={{ marginTop: 18 }}>
          {!out.gated && (
            <p><span className="tag warn">held back</span> Could not be grounded in a quote it was confident about, so it is not counted. That is the intended behaviour.</p>
          )}
          <table><tbody>
            {Object.entries(out.label).map(([k, v]) => (
              <tr key={k}><td style={{ width: "30%" }} className="muted">{k.replace(/_/g, " ")}</td>
                <td>{Array.isArray(v) ? (v as string[]).join(", ") : String(v)}</td></tr>
            ))}
          </tbody></table>
        </div>
      )}
    </>
  );
}
