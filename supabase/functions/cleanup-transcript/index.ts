import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { logAiUsage } from "../_shared/usage-log.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await supabase.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { transcript, workspace_kind, recording_id, table } = await req.json() as {
      transcript: string;
      workspace_kind?: string;
      recording_id?: string;
      table?: "recordings" | "meeting_recordings";
    };
    if (!transcript || transcript.length < 10) {
      return new Response(JSON.stringify({ error: "טקסט קצר מדי" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const { data: glossaryRows } = await supabase
      .from("user_glossary")
      .select("term, replacement, notes")
      .eq("user_id", user.id)
      .in("workspace_kind", [workspace_kind ?? "all", "all"])
      .limit(200);

    const glossaryBlock = (glossaryRows && glossaryRows.length > 0)
      ? `\n\nמילון מונחים מקצועיים:\n${glossaryRows.map((g: any) => `- "${g.term}"${g.replacement ? ` → "${g.replacement}"` : ""}${g.notes ? ` (${g.notes})` : ""}`).join("\n")}`
      : "";

    const systemPrompt = `אתה עורך תמלול מקצועי בעברית. המשימה שלך לנקות תמלול גולמי בלי לשנות את התוכן או הטון:
- תקן שגיאות הקלדה ושמיעה ברורות (מילים שנשמעות דומה)
- הסר חזרות וגמגום (אה, אמ, יעני, כאילו) רק כשברור שאינן חלק מהמסר
- תקן פיסוק וחלוקה לפסקאות
- תקן מספרים, סכומים, כתובות, גושים וחלקות לפי הקשר
- שמור את כל המידע, אל תקצר ואל תסכם
- אם יש שמות דוברים בתמלול - שמור עליהם בפורמט המקורי
- אסור להמציא מילים שלא נאמרו${glossaryBlock}

החזר תשובה בפורמט JSON תקני בלבד (ללא markdown):
{
  "transcript": "התמלול המנוקה כאן",
  "quality_score": מספר בין 0 ל-100,
  "quality_notes": "הערה קצרה על איכות"
}`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: `נקה את התמלול הבא:\n\n${transcript}` },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "חרגת ממגבלת בקשות, נסה שוב בעוד דקה" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "נגמרו הקרדיטים" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content as string;
    if (!raw) throw new Error("AI לא החזיר תוצאה");

    let cleaned = raw;
    let qualityScore: number | null = null;
    let qualityNotes: string | null = null;
    try {
      const stripped = raw.trim().replace(/^```json\s*/i, "").replace(/```\s*$/i, "");
      const parsed = JSON.parse(stripped);
      if (parsed?.transcript) {
        cleaned = parsed.transcript;
        qualityScore = typeof parsed.quality_score === "number" ? Math.max(0, Math.min(100, Math.round(parsed.quality_score))) : null;
        qualityNotes = typeof parsed.quality_notes === "string" ? parsed.quality_notes : null;
      }
    } catch {}

    if (recording_id && table) {
      await supabase.from(table)
        .update({
          transcript: cleaned,
          quality_score: qualityScore,
          quality_notes: qualityNotes,
        })
        .eq("id", recording_id)
        .eq("user_id", user.id);
    }

    await logAiUsage({
      userId: user.id,
      model: "google/gemini-2.5-flash",
      usage: aiData.usage,
      eventType: "transcript_cleanup",
      meta: { char_count: cleaned.length, quality_score: qualityScore, glossary_terms: glossaryRows?.length ?? 0 },
    });

    return new Response(JSON.stringify({
      cleaned_transcript: cleaned,
      quality_score: qualityScore,
      quality_notes: qualityNotes,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("cleanup-transcript error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
