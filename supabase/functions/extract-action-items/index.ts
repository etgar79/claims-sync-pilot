// Extract action items + follow-up meetings from a meeting summary/transcript using Lovable AI.
// Returns structured tasks and calendar event suggestions.
import { corsHeaders } from "../_shared/google-token.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, summary, meeting_title, client_name } = await req.json() as {
      transcript?: string;
      summary?: string;
      meeting_title?: string;
      client_name?: string;
    };

    const text = (summary && summary.trim()) || transcript;
    if (!text) {
      return new Response(
        JSON.stringify({ error: "צריך תמלול או סיכום" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const today = new Date().toISOString().split("T")[0];

    const systemPrompt = `אתה עוזר אישי של שמאי מקרקעין. מהפגישה שצורפה, חלץ:
1. **משימות מעשיות (action items)** - דברים שהשמאי צריך לעשות בעצמו
2. **פגישות המשך** - אם הוסכם על פגישה נוספת או ביקור חוזר

לכל משימה:
- title: קצר וברור (עד 80 תווים), בעברית, מנוסח כפעולה ("להזמין נסח טאבו", "לשלוח הצעת מחיר")
- notes: הקשר קצר (אופציונלי, עד 200 תווים)
- due: תאריך יעד בפורמט YYYY-MM-DD אם הוזכר זמן יחסי או מפורש (היום ${today}). אם לא הוזכר - השאר ריק.

לכל פגישת המשך:
- summary: כותרת קצרה
- description: פרטים נוספים
- start: ISO datetime עם אזור Asia/Jerusalem אם הוזכר
- end: ISO datetime (ברירת מחדל - שעה אחרי start)
- location: כתובת אם הוזכרה

אל תמציא משימות שלא הוזכרו. אם אין כלום - החזר מערכים ריקים. החזר רק JSON תקני.`;

    const userPrompt = `${meeting_title ? `כותרת פגישה: ${meeting_title}\n` : ""}${client_name ? `לקוח: ${client_name}\n` : ""}\nתוכן הפגישה:\n${text}`;

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
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_actions",
              description: "Return action items and follow-up meetings",
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
                        due: { type: "string", description: "YYYY-MM-DD or empty" },
                      },
                      required: ["title"],
                    },
                  },
                  follow_up_meetings: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        summary: { type: "string" },
                        description: { type: "string" },
                        start: { type: "string" },
                        end: { type: "string" },
                        location: { type: "string" },
                      },
                      required: ["summary", "start", "end"],
                    },
                  },
                },
                required: ["tasks", "follow_up_meetings"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_actions" } },
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "חרגת ממגבלת בקשות, נסה שוב בעוד דקה" }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "נגמרו הקרדיטים ב-Lovable AI workspace" }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) throw new Error("AI לא החזיר תוצאה תקינה");
    const args = JSON.parse(toolCall.function.arguments);

    return new Response(
      JSON.stringify({
        tasks: args.tasks ?? [],
        follow_up_meetings: args.follow_up_meetings ?? [],
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-action-items error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
