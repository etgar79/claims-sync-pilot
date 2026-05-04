// Edge function: transcribe-audio
// Supports 3 services exposed to the user as generic tiers:
// - ivrit_ai → "חסכוני"
// - whisper → "מהיר"
// - elevenlabs → "איכות גבוהה"
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const IVRIT_AI_API_KEY = Deno.env.get("IVRIT_AI_API_KEY");
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

type Service = "ivrit_ai" | "whisper" | "elevenlabs" | "lovable_ai";

// Cost per second of audio (USD). Conservative estimates.
// Lovable AI runs on Gemini 2.5 Flash with audio input — billed per token.
// Audio input ≈ 32 tokens/sec; pricing ~$0.30/M input tokens → ~$0.0000096/sec.
const COST_PER_SECOND_USD: Record<Service, number> = {
  ivrit_ai: 0.10 / 3600,    // ~$0.10/hour
  whisper: 0.006 / 60,      // $0.006/minute = $0.36/hour
  elevenlabs: 0.40 / 3600,  // ~$0.40/hour
  lovable_ai: 32 * 0.30 / 1_000_000, // ≈ $0.0000096/sec ≈ $0.0346/hour
};

async function transcribeWhisper(file: File): Promise<{ text: string; duration?: number }> {
  if (file.size > 25 * 1024 * 1024) throw new Error(`Whisper לא תומך בקבצים מעל 25MB (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("model", "whisper-1");
  fd.append("language", "he");
  fd.append("response_format", "verbose_json");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Whisper failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return { text: data.text ?? "", duration: typeof data.duration === "number" ? data.duration : undefined };
}

async function transcribeElevenLabs(file: File): Promise<{ text: string; duration?: number }> {
  if (!ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY is not configured");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("model_id", "scribe_v2");
  fd.append("language_code", "heb");
  fd.append("diarize", "true");
  fd.append("tag_audio_events", "true");
  const res = await fetch("https://api.elevenlabs.io/v1/speech-to-text", {
    method: "POST",
    headers: { "xi-api-key": ELEVENLABS_API_KEY },
    body: fd,
  });
  if (!res.ok) throw new Error(`ElevenLabs failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  // ElevenLabs may return audio_duration in some shapes
  const duration = data.audio_duration ?? data.duration;
  return { text: data.text ?? "", duration: typeof duration === "number" ? duration : undefined };
}

async function transcribeIvritAi(file: File): Promise<{ text: string; duration?: number }> {
  if (!IVRIT_AI_API_KEY) throw new Error("IVRIT_AI_API_KEY is not configured");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("model", "ivrit-ai/whisper-large-v3-turbo");
  fd.append("language", "he");
  fd.append("response_format", "verbose_json");
  const res = await fetch("https://api.ivrit.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${IVRIT_AI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`ivrit.ai failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return { text: data.text ?? "", duration: typeof data.duration === "number" ? data.duration : undefined };
}

// Memory-efficient base64 (avoids huge intermediate strings on big files)
async function fileToBase64(file: File): Promise<string> {
  const buf = new Uint8Array(await file.arrayBuffer());
  // Use FileReader-style chunked encoding via btoa with small chunks
  const CHUNK = 0x8000; // 32KB
  let out = "";
  for (let i = 0; i < buf.length; i += CHUNK) {
    const slice = buf.subarray(i, Math.min(i + CHUNK, buf.length));
    let s = "";
    for (let j = 0; j < slice.length; j++) s += String.fromCharCode(slice[j]);
    out += btoa(s);
  }
  return out;
}

// Fallback: transcribe using Lovable AI Gateway (Gemini multimodal). Always available.
async function transcribeLovableAi(file: File): Promise<{ text: string; duration?: number }> {
  if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");
  // Gemini accepts up to ~20MB inline audio; larger files would blow memory in edge runtime.
  if (file.size > 20 * 1024 * 1024) {
    throw new Error(`קובץ גדול מדי לתמלול מובנה (${(file.size / 1024 / 1024).toFixed(1)}MB). פצלי לקבצים קטנים יותר או השתמשי בשירות אחר.`);
  }
  const b64 = await fileToBase64(file);
  const mime = (file.type || "audio/mpeg").toLowerCase();
  const fname = (file.name || "").toLowerCase();
  // Normalize to formats Gemini accepts: wav, mp3, aiff, aac, ogg, flac
  let format = (mime.split("/")[1] || "mp3").split(";")[0].replace("x-", "");
  if (format === "mpeg" || format === "mpg" || fname.endsWith(".mp3")) format = "mp3";
  else if (format === "mp4" || format === "m4a" || fname.endsWith(".m4a") || fname.endsWith(".mp4")) format = "aac";
  else if (fname.endsWith(".wav")) format = "wav";
  else if (fname.endsWith(".ogg") || fname.endsWith(".opus")) format = "ogg";
  else if (fname.endsWith(".flac")) format = "flac";
  else if (fname.endsWith(".aac")) format = "aac";

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        {
          role: "system",
          content: "אתה מערכת תמלול. תמלל את ההקלטה לעברית במדויק. החזר רק את הטקסט המתומלל, ללא הקדמות או הערות.",
        },
        {
          role: "user",
          content: [
            { type: "text", text: "תמלל את ההקלטה הבאה לעברית:" },
            { type: "input_audio", input_audio: { data: b64, format } },
          ],
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Lovable AI failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content ?? "";
  return { text, duration: undefined };
}

async function logUsage(opts: {
  userId: string;
  service: Service;
  durationSec: number;
  meta?: Record<string, unknown>;
}) {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const cost = (COST_PER_SECOND_USD[opts.service] ?? 0) * opts.durationSec;
    await admin.from("usage_events").insert({
      user_id: opts.userId,
      event_type: "transcription",
      service: opts.service,
      quantity: opts.durationSec,
      unit: "seconds",
      cost_usd: cost,
      metadata: opts.meta ?? null,
    });
  } catch (e) {
    console.error("usage log failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Identify caller via JWT (verify_jwt is off; do it manually so we can log usage)
    const authHeader = req.headers.get("Authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    let userId: string | null = null;
    if (token) {
      const userClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_ANON_KEY")!,
        { global: { headers: { Authorization: `Bearer ${token}` } } },
      );
      const { data } = await userClient.auth.getUser();
      userId = data.user?.id ?? null;
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const service = (form.get("service") as Service) ?? "lovable_ai";
    const clientDurationRaw = form.get("client_duration");
    const clientDuration = clientDurationRaw ? Number(clientDurationRaw) : NaN;

    if (!file) {
      return new Response(JSON.stringify({ error: "Missing 'file' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build fallback chain: requested service first, then others, then Lovable AI as final safety net.
    const runners: Record<Service, () => Promise<{ text: string; duration?: number }>> = {
      whisper: () => transcribeWhisper(file),
      elevenlabs: () => transcribeElevenLabs(file),
      ivrit_ai: () => transcribeIvritAi(file),
      lovable_ai: () => transcribeLovableAi(file),
    };
    const order: Service[] = [service];
    for (const s of ["lovable_ai", "ivrit_ai", "whisper", "elevenlabs"] as Service[]) {
      if (!order.includes(s)) order.push(s);
    }

    let result: { text: string; duration?: number } | null = null;
    let usedService: Service = service;
    const warnings: string[] = [];
    for (const s of order) {
      try {
        result = await runners[s]();
        usedService = s;
        if (s !== service) {
          warnings.push(`השירות שנבחר לא היה זמין, התמלול בוצע עם שירות חלופי`);
        }
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`[transcribe] ${s} failed:`, msg);
        warnings.push(`${s}: ${msg}`);
      }
    }
    if (!result) {
      throw new Error(`כל שירותי התמלול נכשלו. ${warnings.join(" | ")}`);
    }

    // Choose best duration estimate: provider response > client-provided > rough size estimate
    const sizeEstimate = file.size > 0 ? file.size / (16_000) : 0; // ~16KB/s rough fallback
    const durationSec = Number.isFinite(result.duration) && (result.duration as number) > 0
      ? (result.duration as number)
      : Number.isFinite(clientDuration) && clientDuration > 0
      ? clientDuration
      : sizeEstimate;

    if (userId && durationSec > 0) {
      await logUsage({
        userId,
        service: usedService,
        durationSec,
        meta: { filename: file.name, size_bytes: file.size, requested_service: service, warnings },
      });
    }

    return new Response(JSON.stringify({
      transcript: result.text,
      service: usedService,
      requested_service: service,
      fallback_used: usedService !== service,
      warnings,
      duration: durationSec,
    }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("transcribe-audio error:", e);
    const msg = e instanceof Error ? e.message : "Unknown error";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
