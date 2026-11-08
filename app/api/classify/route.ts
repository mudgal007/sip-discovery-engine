import { NextRequest, NextResponse } from "next/server";
import { classifyAll, Item } from "@/lib/classify";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const { items, batchSize = 8 } = (await req.json()) as { items: Item[]; batchSize?: number };
    if (!Array.isArray(items) || items.length === 0) {
      return NextResponse.json({ error: "Send { items: [{id, text}] }" }, { status: 400 });
    }
    if (items.length > 400) {
      return NextResponse.json({ error: "Max 400 items per request" }, { status: 400 });
    }
    const { model, results } = await classifyAll(items, batchSize);
    return NextResponse.json({ model, count: results.length, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
