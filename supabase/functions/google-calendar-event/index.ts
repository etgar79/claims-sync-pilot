// Create a Google Calendar event in the user's primary calendar.
import {
  adminSupabase,
  authedUser,
  corsHeaders,
  getValidGoogleToken,
} from "../_shared/google-token.ts";

interface EventInput {
  summary: string;
  description?: string;
  location?: string;
  start: string; // ISO datetime
  end: string;   // ISO datetime
  attendees?: string[]; // emails
  reminders_minutes?: number; // single popup reminder
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();
    const { accessToken } = await getValidGoogleToken(admin, userId);

    const body = await req.json() as EventInput;
    if (!body.summary || !body.start || !body.end) {
      return new Response(
        JSON.stringify({ error: "summary, start, end נדרשים" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const eventBody: Record<string, unknown> = {
      summary: body.summary,
      description: body.description,
      location: body.location,
      start: { dateTime: body.start, timeZone: "Asia/Jerusalem" },
      end: { dateTime: body.end, timeZone: "Asia/Jerusalem" },
    };
    if (body.attendees?.length) {
      eventBody.attendees = body.attendees.map((email) => ({ email }));
    }
    if (typeof body.reminders_minutes === "number") {
      eventBody.reminders = {
        useDefault: false,
        overrides: [{ method: "popup", minutes: body.reminders_minutes }],
      };
    }

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(eventBody),
      },
    );
    const data = await res.json();
    if (!res.ok) {
      console.error("Calendar API error", data);
      return new Response(
        JSON.stringify({ error: data.error?.message ?? "Calendar error" }),
        { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ id: data.id, htmlLink: data.htmlLink, summary: data.summary }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("google-calendar-event error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
