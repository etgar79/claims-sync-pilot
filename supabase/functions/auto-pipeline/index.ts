// auto-pipeline: orchestrator that runs after a transcript is saved.
// Steps: 1) generate summary  2) extract action items  3) save to extracted_tasks
// Updates pipeline_status on the source row.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type SourceTable = "recordings" | "meeting_recordings";

interface Body {
  recording_id: string;
  table: SourceTable;
  workspace_kind?: "appraiser" | "architect" | "transcriber";
  force?: boolean;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

async function callAi(system: string, user: string, model = "google/gemini-2.5-flash") {
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: [{ role: "system", content: system }, { role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`AI ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

async function extractTasks(text: string, contextHint: string) {
  const today = new Date().toISOString().split("T")[0];
  const sys = `אתה עוזר אישי. מהטקסט הבא, חלץ רק משימות מעשיות שמישהו צריך לבצע (action items).
לכל משימה: title (קצר, פעולה), notes (אופציונלי), due (YYYY-MM-DD אם הוזכר; היום ${today}).
אל תמציא. אם אין משימות — החזר מערך ריק. החזר רק JSON תקני.`;
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [
        { role: "system", content: sys },
        { role: "user", content: `${contextHint}\n\nתוכן:\n${text}` },
      ],
      tools: [{
        type: "function",
        function: {
          name: "extract",
          description: "Return action items",
          parameters: {
            type: "object",
            properties: {
              tasks: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    title: { type: "string" },
                    notes: { type: "string" },
                    due: { type: "string" },
                  },
                  required: ["title"],
                },
              },
            },
            required: ["tasks"],
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "extract" } },
    }),
  });
  if (!res.ok) throw new Error(`extract ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const args = JSON.parse(data.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments ?? "{}");
  return (args.tasks ?? []) as Array<{ title: string; notes?: string; due?: string }>;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const auth = req.headers.get("Authorization") || "";
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: auth } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = (await req.json()) as Body;
    const { recording_id, table, workspace_kind = "appraiser", force = false } = body;
    if (!recording_id || !table) {
      return new Response(JSON.stringify({ error: "missing recording_id/table" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(SUPABASE_URL, SERVICE);

    // Load recording
    const { data: rec, error: recErr } = await admin
      .from(table)
      .select("*")
      .eq("id", recording_id)
      .maybeSingle();
    if (recErr || !rec) throw new Error(recErr?.message || "recording not found");
    if (rec.user_id !== user.id) throw new Error("forbidden");

    if (!rec.transcript || rec.transcript.trim().length < 10) {
      throw new Error("no transcript yet");
    }

    // Skip if already done
    if (!force && rec.pipeline_status === "tasks_ready") {
      return new Response(JSON.stringify({ skipped: true, status: rec.pipeline_status }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Mark summarizing
    await admin.from(table).update({ pipeline_status: "summarizing" }).eq("id", recording_id);

    // Build context
    let context = "";
    if (table === "meeting_recordings" && rec.meeting_id) {
      const { data: meeting } = await admin.from("meetings").select("title,client_name,project_name").eq("id", rec.meeting_id).maybeSingle();
      if (meeting) context = `פגישה: ${meeting.title}${meeting.client_name ? ` | לקוח: ${meeting.client_name}` : ""}${meeting.project_name ? ` | פרויקט: ${meeting.project_name}` : ""}`;
    } else if (table === "recordings" && rec.case_id) {
      const { data: c } = await admin.from("cases").select("title,client_name").eq("id", rec.case_id).maybeSingle();
      if (c) context = `תיק: ${c.title}${c.client_name ? ` | לקוח: ${c.client_name}` : ""}`;
    }

    // Choose default template prompt by workspace
    const defaultPrompt =
      workspace_kind === "architect"
        ? "אתה עוזר למשרד אדריכלים. צור סיכום פגישה מקצועי בעברית בפורמט Markdown: נושאים, החלטות, משימות, נקודות פתוחות."
        : workspace_kind === "transcriber"
        ? "אתה עוזר תמלול. צור תקציר ענייני וקצר של ההקלטה בעברית עם נקודות עיקריות (bullets)."
        : "אתה עוזר לשמאי מקרקעין. צור סיכום מקצועי בעברית בפורמט Markdown: נושאים שעלו, ממצאים, משימות המשך, פרטים נדרשים.";

    // Optional: user's default template
    const { data: tpl } = await admin
      .from("summary_templates")
      .select("prompt")
      .eq("user_id", user.id)
      .eq("workspace_kind", workspace_kind)
      .eq("is_default", true)
      .limit(1)
      .maybeSingle();
    const sysPrompt = tpl?.prompt || defaultPrompt;

    const summary = await callAi(
      sysPrompt,
      `${context ? `הקשר: ${context}\n\n` : ""}תמלול:\n${rec.transcript}`,
      "google/gemini-2.5-flash",
    );

    await admin.from(table).update({
      summary,
      summary_generated_at: new Date().toISOString(),
      pipeline_status: "extracting",
    }).eq("id", recording_id);

    // Extract tasks
    let tasks: Array<{ title: string; notes?: string; due?: string }> = [];
    try {
      tasks = await extractTasks(summary || rec.transcript, context);
    } catch (e) {
      console.error("extract failed", e);
    }

    if (tasks.length > 0) {
      const rows = tasks.slice(0, 30).map((t) => ({
        user_id: user.id,
        title: t.title.slice(0, 280),
        notes: t.notes?.slice(0, 1000) || null,
        due: t.due && /^\d{4}-\d{2}-\d{2}$/.test(t.due) ? t.due : null,
        status: "pending_review",
        source_recording_id: table === "recordings" ? recording_id : null,
        source_meeting_recording_id: table === "meeting_recordings" ? recording_id : null,
        source_meeting_id: table === "meeting_recordings" ? rec.meeting_id : null,
        source_case_id: table === "recordings" ? rec.case_id : null,
        workspace_kind,
      }));
      await admin.from("extracted_tasks").insert(rows);
    }

    await admin.from(table).update({ pipeline_status: "tasks_ready" }).eq("id", recording_id);

    return new Response(JSON.stringify({
      ok: true,
      summary_chars: (summary || "").length,
      tasks_extracted: tasks.length,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("auto-pipeline error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
