# SIP Continuation — AI Discovery Engine

Labels public investor conversation against a fixed schema, refuses to count anything
it cannot quote evidence for, and reports how often it agrees with hand labels.

## Run it

```bash
npm install
cp .env.example .env.local      # paste your Anthropic key into it
npm run dev
```

## Deploy (Vercel)

1. Push this folder to a GitHub repo.
2. vercel.com → Add New → Project → import the repo.
3. Settings → Environment Variables → add `ANTHROPIC_API_KEY`.
4. Deploy. Redeploy after adding the key if the first build ran without it.

The model id is not hardcoded — the app asks your account which models it has and picks
the cheapest fast one. Set `ANTHROPIC_MODEL` if you want to pin a specific one.

## How it works

| Stage | What happens | Where |
|---|---|---|
| 1. Collect | Reviews, forum posts and survey answers become `{id, source, text}` rows | `data/corpus.json` |
| 2. Triage | Each item labelled `relevant` — most public feedback is about logins and KYC, not continuation | `lib/schema.ts` |
| 3. Code | 12 fields per item: stage, outcome, trigger, expectation, info gaps, help channels, segment signals | `lib/classify.ts` |
| 4. Gate | An item is only counted if the model quotes a span that actually appears in the source **and** is not low-confidence | `passesGate()` |
| 5. Quantify | Counts and shares by trigger, gap, channel and expectation | `app/page.tsx` |
| 6. Validate | Engine is scored against hand labels, disagreements shown | `app/api/eval/route.ts` |

### The quality gate

This is the part that stops the engine producing a tidy distribution out of thin air.
`passesGate()` requires the `evidence` string to be at least 8 characters, to not come
from a low-confidence labelling, and to **actually appear in the source text**. Items
failing any of these are displayed in a separate "held back" table rather than silently
dropped or silently counted.

### Deliberate schema choices

- `market_fear` and `belief_collapse` are **separate triggers**. Someone saying "returns
  looked flat so I stopped" is not the same as "the market crashed". Collapsing them is
  what produces the lazy conclusion the brief explicitly rules out.
- `involuntary` exists because some SIPs stop with no decision at all — a failed mandate,
  an auto-cancellation. Survey response r3 said the portfolio "got cancelled by it own".
  Without a label for it, that becomes invisible.
- `knew_flexibility` captures whether the person knew they could pause or reduce rather
  than stop. If they didn't, that is a product gap sitting directly on the metric.

## Adding collected data

Append to `data/corpus.json`:

```json
{ "id": "play_0412", "source": "play_store", "text": "…", "date": "2026-03-11" }
```

Sources used so far are listed on the Corpus tab, which counts them automatically.

## Golden set (Evidence Log)

`data/golden.json` holds the items to be hand-labelled. For each one, fill in `human`
with your own judgement **before** running the engine on it:

```json
{
  "id": "r4",
  "text": "…",
  "human": {
    "relevant": true,
    "outcome": "stopped",
    "primary_trigger": "belief_collapse",
    "expectation": "long_term_growth"
  }
}
```

You do not have to label every field — only the ones you fill are scored. Leave a field
out when you genuinely cannot tell; that keeps the agreement rate honest.

Once the real corpus is collected, rebuild the golden set as a **random sample across
sources**, not just survey answers, or the agreement rate will flatter the engine.
