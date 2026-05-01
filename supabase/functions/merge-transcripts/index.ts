import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface TranscriptVersion {
  service: string;
  text: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

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

    const { versions, language } = await req.json() as {
      versions: TranscriptVersion[];
      language?: string;
    };

    if (!versions || !Array.isArray(versions) || versions.length < 2) {
      return new Response(
        JSON.stringify({ error: "צריך לפחות 2 גרסאות תמלול לאיחוד" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const langName = language === "en" ? "אנגלית" : "עברית";

    const versionsBlock = versions
      .map((v, i) => `### גרסה ${i + 1} - ${v.service}\n${v.text}`)
      .join("\n\n");

    const systemPrompt = `אתה מומחה לעיבוד תמלולים ב${langName}. קיבלת מספר תמלולים שונים של אותה הקלטה ממנועי תמלול שונים.

המשימה שלך:
1. **השווה** בין כל הגרסאות והבן את המסר הכולל
2. **בחר את הניסוח הטוב ביותר** לכל קטע - על בסיס קונצנזוס בין מנועים, הקשר לשוני, והגיון
3. **תקן שמות, מספרים, מונחים מקצועיים** - השתמש בגרסה שנראית מדויקת ביותר
4. **שמר את כל המידע** - אל תקצר ואל תסכם
5. **סמן בסוגריים מרובעים [?]** קטעים שיש בהם חוסר ודאות גבוהה בין הגרסאות
6. **הוסף סימני פיסוק וחלוקה לפסקאות** לקריאות טובה
7. **שמור על דובר** - אם יש סימון דוברים בגרסאות, שמר אותו

חשוב מאוד: התוצאה חייבת להיות בעברית תקנית (אם השפה היא עברית), עם פיסוק תקין, ובלי הוספת מידע שלא נמצא באף אחת מהגרסאות.`;

    const userPrompt = `להלן ${versions.length} גרסאות תמלול שונות של אותה הקלטה:

${versionsBlock}

צור תמלול-על משולב שמשלב את הטוב מכל הגרסאות. החזר רק את התמלול המאוחד, ללא הסברים נוספים.`;

    const aiRes = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
        }),
      },
    );

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(
          JSON.stringify({ error: "חרגת ממגבלת בקשות, נסה שוב בעוד דקה" }),
          {
            status: 429,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      if (aiRes.status === 402) {
        return new Response(
          JSON.stringify({ error: "נגמרו הקרדיטים ב-Lovable AI workspace" }),
          {
            status: 402,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }
      const errText = await aiRes.text();
      console.error("AI gateway error", aiRes.status, errText);
      throw new Error(`AI gateway error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const mergedTranscript = aiData.choices?.[0]?.message?.content as string;
    if (!mergedTranscript) throw new Error("AI לא החזיר תוצאה");

    // Track usage
    await supabase.from("usage_events").insert({
      user_id: user.id,
      event_type: "transcript_merge",
      service: "gemini-2.5-pro",
      quantity: versions.length,
      unit: "versions",
      cost_usd: 0,
      metadata: {
        services: versions.map((v) => v.service),
        char_count: mergedTranscript.length,
      },
    });

    return new Response(
      JSON.stringify({
        merged_transcript: mergedTranscript,
        source_versions: versions.length,
        services: versions.map((v) => v.service),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("merge-transcripts error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
