import Anthropic from "@anthropic-ai/sdk";

let cachedModel: string | null = null;

export function client() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY is not set");
  return new Anthropic({ apiKey: key });
}

/**
 * Model ids change over time, so rather than hardcoding one we ask the account
 * what it has and prefer the cheapest fast model. ANTHROPIC_MODEL overrides.
 */
export async function pickModel(): Promise<string> {
  if (process.env.ANTHROPIC_MODEL) return process.env.ANTHROPIC_MODEL;
  if (cachedModel) return cachedModel;
  const list = await client().models.list({ limit: 50 });
  const ids = list.data.map((m) => m.id);
  const haiku = ids.find((i) => i.includes("haiku"));
  const sonnet = ids.find((i) => i.includes("sonnet"));
  cachedModel = haiku || sonnet || ids[0];
  if (!cachedModel) throw new Error("No models available on this API key");
  return cachedModel;
}
