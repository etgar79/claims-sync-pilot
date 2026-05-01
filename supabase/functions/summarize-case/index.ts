import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Pricing for google/gemini-2.5-flash via Lovable AI Gateway (USD per token, conservative)
const PRICE_PER_INPUT_TOKEN = 0.075 / 1_000_000;
const PRICE_PER_OUTPUT_TOKEN = 0.30 / 1_000_000;

async function logAiUsage(userId: string, usage: any, mode: string) {
  if (!userId || !usage) return;
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const inputTokens = Number(usage.prompt_tokens ?? usage.input_tokens ?? 0);
    const outputTokens = Number(usage.completion_tokens ?? usage.output_tokens ?? 0);
    const totalTokens = inputTokens + outputTokens;
    const cost = inputTokens * PRICE_PER_INPUT_TOKEN + outputTokens * PRICE_PER_OUTPUT_TOKEN;
    await admin.from("usage_events").insert({
      user_id: userId,
      event_type: "ai_summary",
      service: "lovable_ai",
      quantity: totalTokens,
      unit: "tokens",
      cost_usd: cost,
      metadata: { mode, input_tokens: inputTokens, output_tokens: outputTokens },
    });
  } catch (e) {
    console.error("ai usage log failed:", e);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();

    // === MEETING MODE (architect meetings) ===
    if (body.mode === "meeting") {
      const { title, client, project, transcripts, notes } = body;
      const userPrompt = `פרטי הפגישה:
- כותרת: ${title ?? ""}
${client ? `- לקוח: ${client}` : ""}
${project ? `- פרויקט: ${project}` : ""}

${transcripts ? `תמלולי הקלטות:\n${transcripts}\n` : ""}
${notes ? `הערות:\n${notes}\n` : ""}

צור סיכום פגישה מקצועי בעברית עבור משרד אדריכלים. כלול: נושאים שעלו, החלטות שהתקבלו, משימות לביצוע (action items) עם אחראים אם צוין, נקודות פתוחות להמשך, והמלצות. השתמש בכותרות ורשימות בפורמט Markdown.`;

      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

      const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: "אתה עוזר למשרד אדריכלים. צור סיכומי פגישות מקצועיים, מובנים ותמציתיים בעברית בפורמט Markdown." },
            { role: "user", content: userPrompt },
          ],
        }),
      });

      if (!aiResp.ok) {
        if (aiResp.status === 429) return new Response(JSON.stringify({ error: "חרגת ממגבלת הבקשות." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        if (aiResp.status === 402) return new Response(JSON.stringify({ error: "נדרשת טעינת קרדיטים ל-Lovable AI." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        return new Response(JSON.stringify({ error: "שגיאה ביצירת הסיכום" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }

      const aiData = await aiResp.json();
      const summary = aiData.choices?.[0]?.message?.content ?? "";
      await logAiUsage(userData.user.id, aiData.usage, "meeting");
      return new Response(JSON.stringify({ summary }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { caseId } = body;
    if (!caseId || typeof caseId !== "string") {
      return new Response(JSON.stringify({ error: "caseId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch case + related data (RLS enforces ownership)
    const { data: appraisalCase, error: caseErr } = await supabase
      .from("cases")
      .select("*")
      .eq("id", caseId)
      .maybeSingle();

    if (caseErr || !appraisalCase) {
      return new Response(JSON.stringify({ error: "Case not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [recordingsRes, notesRes, photosRes] = await Promise.all([
      supabase.from("recordings").select("*").eq("case_id", caseId),
      supabase.from("notes").select("*").eq("case_id", caseId),
      supabase.from("photos").select("*").eq("case_id", caseId),
    ]);

    const recordings = recordingsRes.data ?? [];
    const notes = notesRes.data ?? [];
    const photos = photosRes.data ?? [];

    // Build prompt
    const transcripts = recordings
      .filter((r: any) => r.transcript)
      .map((r: any, i: number) => `הקלטה ${i + 1} (${r.filename}, ${r.duration ?? ""}):\n${r.transcript}`)
      .join("\n\n");

    const notesText = notes.map((n: any, i: number) => `הערה ${i + 1}: ${n.content}`).join("\n");
    const photoCaptions = photos
      .filter((p: any) => p.caption)
      .map((p: any) => `- ${p.caption}`)
      .join("\n");

    const userPrompt = `פרטי התיק:
- מספר תיק: ${appraisalCase.case_number}
- כותרת: ${appraisalCase.title}
- לקוח: ${appraisalCase.client_name}
- כתובת: ${appraisalCase.address ?? "לא צוינה"}
- סוג: ${appraisalCase.type}
- סטטוס: ${appraisalCase.status}
${appraisalCase.estimated_value ? `- הערכת שווי: ₪${Number(appraisalCase.estimated_value).toLocaleString("he-IL")}` : ""}

${transcripts ? `תמלולי הקלטות:\n${transcripts}\n` : ""}
${notesText ? `הערות:\n${notesText}\n` : ""}
${photoCaptions ? `תמונות בתיק:\n${photoCaptions}\n` : ""}

צור סיכום שמאי תמציתי ומקצועי בעברית של התיק. כלול: מצב הנכס/הרכוש, ממצאים עיקריים, נקודות שדורשות תשומת לב, והמלצות. השתמש בכותרות וברשימות.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
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
            content:
              "אתה עוזר לשמאי מקצועי. צור סיכומים תמציתיים, מובנים ומקצועיים בעברית. השתמש בפורמט Markdown.",
          },
          { role: "user", content: userPrompt },
        ],
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: "חרגת ממגבלת הבקשות. נסה שוב בעוד מספר דקות." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: "נדרשת טעינת קרדיטים ל-Lovable AI." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await aiResp.text();
      console.error("AI gateway error:", aiResp.status, t);
      return new Response(JSON.stringify({ error: "שגיאה ביצירת הסיכום" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResp.json();
    const summary = aiData.choices?.[0]?.message?.content ?? "";

    // Save summary to case
    const { error: updateErr } = await supabase
      .from("cases")
      .update({
        ai_summary: summary,
        ai_summary_generated_at: new Date().toISOString(),
      })
      .eq("id", caseId);

    if (updateErr) {
      console.error("Update error:", updateErr);
    }

    return new Response(JSON.stringify({ summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("summarize-case error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
