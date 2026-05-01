// Edge function: transcribe-audio
// Supports 3 services: ivrit_ai, whisper (OpenAI), elevenlabs
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY");
const ELEVENLABS_API_KEY = Deno.env.get("ELEVENLABS_API_KEY");
const IVRIT_AI_API_KEY = Deno.env.get("IVRIT_AI_API_KEY");

type Service = "ivrit_ai" | "whisper" | "elevenlabs";

async function transcribeWhisper(file: File): Promise<string> {
  if (!OPENAI_API_KEY) throw new Error("OPENAI_API_KEY is not configured");
  const fd = new FormData();
  fd.append("file", file);
  fd.append("model", "whisper-1");
  fd.append("language", "he");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Whisper failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.text ?? "";
}

async function transcribeElevenLabs(file: File): Promise<string> {
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
  return data.text ?? "";
}

async function transcribeIvritAi(file: File): Promise<string> {
  if (!IVRIT_AI_API_KEY) throw new Error("IVRIT_AI_API_KEY is not configured");
  const fd = new FormData();
  fd.append("file", file);
  // ivrit.ai exposes an OpenAI-compatible Whisper endpoint
  fd.append("model", "ivrit-ai/whisper-large-v3-turbo");
  fd.append("language", "he");
  const res = await fetch("https://api.ivrit.ai/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${IVRIT_AI_API_KEY}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`ivrit.ai failed [${res.status}]: ${await res.text()}`);
  const data = await res.json();
  return data.text ?? "";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const service = (form.get("service") as Service) ?? "whisper";

    if (!file) {
      return new Response(JSON.stringify({ error: "Missing 'file' field" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let transcript = "";
    if (service === "whisper") transcript = await transcribeWhisper(file);
    else if (service === "elevenlabs") transcript = await transcribeElevenLabs(file);
    else if (service === "ivrit_ai") transcript = await transcribeIvritAi(file);
    else throw new Error(`Unknown service: ${service}`);

    return new Response(JSON.stringify({ transcript, service }), {
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
