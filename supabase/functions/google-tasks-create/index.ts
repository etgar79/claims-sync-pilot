// Create one or more Google Tasks in the user's default task list.
import {
  adminSupabase,
  authedUser,
  corsHeaders,
  getValidGoogleToken,
} from "../_shared/google-token.ts";

interface TaskInput {
  title: string;
  notes?: string;
  due?: string; // ISO date
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();
    const { accessToken } = await getValidGoogleToken(admin, userId);

    const body = await req.json() as { tasks: TaskInput[] };
    if (!body.tasks || !Array.isArray(body.tasks) || body.tasks.length === 0) {
      return new Response(
        JSON.stringify({ error: "צריך לפחות משימה אחת" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Get default task list
    const listsRes = await fetch(
      "https://tasks.googleapis.com/tasks/v1/users/@me/lists",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const lists = await listsRes.json();
    if (!listsRes.ok) {
      console.error("Tasks lists error", lists);
      throw new Error(lists.error?.message ?? "Tasks API error");
    }
    const defaultListId = lists.items?.[0]?.id;
    if (!defaultListId) throw new Error("לא נמצאה רשימת משימות בחשבון");

    const created: Array<{ id: string; title: string; selfLink: string }> = [];
    for (const t of body.tasks) {
      const taskBody: Record<string, unknown> = { title: t.title };
      if (t.notes) taskBody.notes = t.notes;
      if (t.due) taskBody.due = t.due;

      const res = await fetch(
        `https://tasks.googleapis.com/tasks/v1/lists/${defaultListId}/tasks`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(taskBody),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        console.error("Create task failed", data);
        continue;
      }
      created.push({ id: data.id, title: data.title, selfLink: data.selfLink });
    }

    return new Response(
      JSON.stringify({ created, count: created.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("google-tasks-create error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
