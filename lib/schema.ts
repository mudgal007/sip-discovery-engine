/**
 * The coding schema.
 *
 * This is the part that makes this a discovery engine rather than a summariser:
 * every item is labelled against a FIXED set of dimensions decided in advance,
 * so results can be counted, compared across segments, and checked against a
 * hand-labelled golden set.
 */

export const TRIGGERS = {
  income_shock:
    "Money stopped or got tight — job loss, salary delay, a month where they could not afford it.",
  goal_reallocation:
    "They deliberately took the money for something else they wanted or needed. Not a shortage, a reallocation.",
  belief_collapse:
    "They concluded it was not working. Returns looked flat, low or negative relative to what they expected, so they judged the product as failing.",
  market_fear:
    "They explicitly reference a market fall, crash or correction as the reason.",
  involuntary:
    "It stopped without a decision — mandate or autopay failure, bounced instalment, KYC issue, auto-cancellation after failed debits.",
  better_alternative:
    "They moved the money somewhere they expected to do better — stocks, FD, gold, crypto, real estate.",
  advice_change:
    "Someone they trust told them to stop, switch or redeem.",
  friction:
    "The app or process got in the way — confusing flow, could not find how, support failure.",
  none: "No stop or near-stop is described in this item.",
} as const;

export const INFO_GAPS = {
  exit_withdrawal_rules:
    "How and when money can be taken out, lock-ins, exit load, settlement time.",
  how_returns_work:
    "What the displayed number means, NAV, units, compounding, why it moves, why it can be negative early.",
  fund_choice: "Which fund, comparing funds, whether theirs is the right one.",
  tax: "Tax treatment, LTCG/STCG, ELSS rules.",
  payment_mandate_mechanics:
    "Autopay, mandate, debit dates, what happens when a payment fails.",
  risk_volatility: "How much it can fall, whether losses are normal, risk level.",
  none: "No information gap is expressed.",
} as const;

export const HELP_CHANNELS = {
  friend_family: "Asked a person they know.",
  youtube: "Watched videos.",
  reddit_forum: "Reddit, TradingQ&A, Quora, other forums.",
  google: "Searched the web.",
  in_app_support: "Used the app's own help, chat or support ticket.",
  ai_chatbot: "Asked ChatGPT or another AI assistant.",
  advisor: "Asked a distributor, agent, bank RM or paid advisor.",
  none: "No help-seeking described.",
} as const;

export type Label = {
  relevant: boolean;
  stage: "pre_start" | "first_3_months" | "3_to_12_months" | "after_12_months" | "unclear";
  outcome:
    | "continuing"
    | "paused"
    | "stopped"
    | "reduced"
    | "resumed"
    | "never_started"
    | "unclear";
  primary_trigger: keyof typeof TRIGGERS;
  all_triggers: (keyof typeof TRIGGERS)[];
  expectation:
    | "monthly_profit"
    | "long_term_growth"
    | "savings_discipline"
    | "tax_saving"
    | "goal_specific"
    | "unclear";
  info_gaps: (keyof typeof INFO_GAPS)[];
  help_channels: (keyof typeof HELP_CHANNELS)[];
  knew_flexibility: "yes" | "no" | "unclear";
  income_stability: "fixed" | "variable" | "dependent" | "unclear";
  first_time_investor: "yes" | "no" | "unclear";
  evidence: string;
  confidence: "high" | "medium" | "low";
};

/** Fields the golden set is scored on. Keep this small and meaningful. */
export const SCORED_FIELDS: (keyof Label)[] = [
  "relevant",
  "outcome",
  "primary_trigger",
  "expectation",
];

/**
 * The quality gate.
 *
 * An item is only counted in the opportunity tables if the model found an actual
 * span of text to stand behind. Low confidence or a missing/ungrounded evidence
 * quote sends the item to "insufficient evidence" instead of into a bucket.
 * This is what stops the engine inventing a tidy distribution.
 */
export function passesGate(label: Label, sourceText: string) {
  if (!label.evidence || label.evidence.trim().length < 8) return false;
  if (label.confidence === "low") return false;
  // the quote must actually appear in the source, allowing for whitespace drift
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();
  if (!norm(sourceText).includes(norm(label.evidence).slice(0, 40))) return false;
  return true;
}

const describe = (o: Record<string, string>) =>
  Object.entries(o)
    .map(([k, v]) => `  - ${k}: ${v}`)
    .join("\n");

export const SYSTEM_PROMPT = `You are a labelling engine for product research into why first-time Indian mutual fund investors stop their SIPs.

You are given short pieces of text written by real people — app store reviews, forum posts, survey answers, interview fragments. Label each one against the schema. You are not summarising and not giving opinions.

WHAT COUNTS AS RELEVANT — read this first and apply it strictly

This corpus is mostly app-store reviews about a broking app that does many things. Most
of it has nothing to do with SIPs. Set relevant=false unless the item describes a real
person's experience of a MUTUAL FUND or SIP investment: starting one, continuing one,
skipping, pausing, reducing, stopping or redeeming one, an instalment or mandate for one,
or what they understood or felt about its value, returns or rules.

Set relevant=FALSE, with primary_trigger="none", for all of these even when the person is
clearly unhappy:
  - stock, intraday, F&O, options or trading complaints; charts, indicators, order
    execution, scalping, brokerage or charges
  - app quality in general: crashes, lag, glitches, UI changes, update broke something
  - login, KYC, account opening or reactivation, OTP, password
  - customer support being slow or unreachable, with no SIP subject
  - deposits, withdrawals or wallet mechanics not tied to a SIP instalment
  - praise, insults, ratings with no content ("best app", "scam app")

A useful test: if the words SIP, mutual fund, fund, NAV, folio, instalment, or an obvious
synonym do not appear, AND the item does not plainly describe a recurring monthly
investment, then relevant is false. Being unhappy with the app is not the same as having
a SIP problem.

"friction" is only for friction INSIDE the mutual fund or SIP journey — could not find
how to pause a SIP, the stop flow failed, the mandate screen was confusing. A general app
glitch is NOT friction; it is irrelevant.

Expect most of this corpus to be irrelevant. A low relevance rate is the correct answer
and is itself a finding. Do not stretch to find signal.

RULES
1. Label only what the text actually says. Never infer a reason that is not stated.
2. The evidence field must be an EXACT substring quoted from the item. If you cannot find one that supports your labels, set confidence to "low".
3. "market_fear" means the person explicitly mentions the market falling. Someone saying returns look bad or flat is belief_collapse, NOT market_fear. Keep these separate.
4. "involuntary" is for SIPs that stopped without a decision — failed mandates, bounced payments, auto-cancellation. Look for this; it is easy to miss.
5. Most items will be irrelevant (login bugs, KYC complaints, praise, spam). Set relevant=false and do not strain to find a trigger.
6. If the text is too thin to judge, use "unclear" and confidence "low". Being unsure is a valid and useful answer.

TRIGGERS
${describe(TRIGGERS)}

INFORMATION GAPS
${describe(INFO_GAPS)}

HELP CHANNELS
${describe(HELP_CHANNELS)}`;
