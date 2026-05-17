// Centralized usage logging — reads prices from `service_pricing` table.
// Call once per AI/transcription request to record true cost (and billable amount).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

let cachedAdmin: ReturnType<typeof createClient> | null = null;
function admin() {
  if (!cachedAdmin) {
    cachedAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return cachedAdmin;
}

// Tiny in-memory cache, refreshed per cold-start.
const priceCache = new Map<string, { unit: string; rate: number; markup: number; ts: number }>();
const CACHE_MS = 5 * 60 * 1000;

async function getPrice(service: string, unit: string): Promise<{ rate: number; markup: number }> {
  const key = `${service}::${unit}`;
  const c = priceCache.get(key);
  if (c && Date.now() - c.ts < CACHE_MS) return { rate: c.rate, markup: c.markup };
  const { data } = await admin()
    .from("service_pricing")
    .select("cost_per_unit_usd, markup_pct")
    .eq("service", service)
    .eq("unit", unit)
    .eq("is_active", true)
    .lte("effective_from", new Date().toISOString())
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  const rate = Number(data?.cost_per_unit_usd ?? 0);
  const markup = Number(data?.markup_pct ?? 0);
  priceCache.set(key, { unit, rate, markup, ts: Date.now() });
  return { rate, markup };
}

export async function logAudioUsage(opts: {
  userId: string;
  service: string;           // "whisper" | "elevenlabs" | "ivrit_ai" | "lovable_ai"
  durationSec: number;
  meta?: Record<string, unknown>;
}) {
  try {
    if (!opts.userId || !opts.durationSec) return;
    const { rate, markup } = await getPrice(opts.service, "seconds");
    const cost = rate * opts.durationSec;
    const billable = cost * (1 + markup / 100);
    await admin().from("usage_events").insert({
      user_id: opts.userId,
      event_type: "transcription",
      service: opts.service,
      quantity: opts.durationSec,
      unit: "seconds",
      cost_usd: cost,
      billable_usd: billable,
      metadata: opts.meta ?? null,
    });
  } catch (e) {
    console.error("logAudioUsage failed:", e);
  }
}

export async function logAiUsage(opts: {
  userId: string;
  model: string;             // e.g. "google/gemini-2.5-flash"
  usage: unknown;            // OpenAI-style { prompt_tokens, completion_tokens }
  eventType?: string;        // default "ai_call"
  meta?: Record<string, unknown>;
}) {
  try {
    if (!opts.userId || !opts.usage) return;
    const u = opts.usage as Record<string, number | undefined>;
    const input = Number(u.prompt_tokens ?? u.input_tokens ?? 0);
    const output = Number(u.completion_tokens ?? u.output_tokens ?? 0);
    const [{ rate: inRate, markup }, { rate: outRate }] = await Promise.all([
      getPrice(opts.model, "input_tokens"),
      getPrice(opts.model, "output_tokens"),
    ]);
    const cost = input * inRate + output * outRate;
    const billable = cost * (1 + markup / 100);
    await admin().from("usage_events").insert({
      user_id: opts.userId,
      event_type: opts.eventType ?? "ai_call",
      service: opts.model,
      quantity: input + output,
      unit: "tokens",
      cost_usd: cost,
      billable_usd: billable,
      metadata: { input_tokens: input, output_tokens: output, ...(opts.meta ?? {}) },
    });
  } catch (e) {
    console.error("logAiUsage failed:", e);
  }
}
