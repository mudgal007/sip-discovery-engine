import { NextRequest, NextResponse } from "next/server";
import { classifyAll } from "@/lib/classify";
import { SCORED_FIELDS, Label } from "@/lib/schema";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

type GoldenItem = { id: string; text: string; source?: string; human: Partial<Label> };

/**
 * Runs the engine over the hand-labelled golden set and reports agreement,
 * field by field, plus every disagreement so they can be inspected.
 * This endpoint is the Evidence Log.
 */
export async function POST(req: NextRequest) {
  try {
    const { golden } = (await req.json()) as { golden: GoldenItem[] };
    if (!Array.isArray(golden) || golden.length === 0) {
      return NextResponse.json({ error: "Send { golden: [{id, text, human:{...}}] }" }, { status: 400 });
    }

    const { model, results } = await classifyAll(
      golden.map(({ id, text, source }) => ({ id, text, source }))
    );
    const byId = new Map(results.map((r) => [r.id, r]));

    const perField: Record<string, { agreed: number; scored: number; rate: number }> = {};
    const disagreements: Array<{
      id: string;
      field: string;
      human: unknown;
      engine: unknown;
      text: string;
      evidence: string;
      confidence: string;
    }> = [];

    for (const field of SCORED_FIELDS) {
      let agreed = 0;
      let scored = 0;
      for (const g of golden) {
        const h = g.human[field];
        if (h === undefined || h === null || h === "") continue; // not hand-labelled on this field
        scored++;
        const r = byId.get(g.id);
        const e = r?.label[field];
        if (JSON.stringify(h) === JSON.stringify(e)) agreed++;
        else
          disagreements.push({
            id: g.id,
            field: String(field),
            human: h,
            engine: e,
            text: g.text.slice(0, 400),
            evidence: r?.label.evidence ?? "",
            confidence: r?.label.confidence ?? "low",
          });
      }
      perField[String(field)] = { agreed, scored, rate: scored ? agreed / scored : 0 };
    }

    const totalAgreed = Object.values(perField).reduce((a, b) => a + b.agreed, 0);
    const totalScored = Object.values(perField).reduce((a, b) => a + b.scored, 0);

    const gated = results.filter((r) => !r.gated).length;

    return NextResponse.json({
      model,
      n: golden.length,
      overall: { agreed: totalAgreed, scored: totalScored, rate: totalScored ? totalAgreed / totalScored : 0 },
      perField,
      heldBackByQualityGate: gated,
      disagreements,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
