// List Google Drive folders for the authenticated user.
// Optional ?q= search filter (matches folder names).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminSupabase, authedUser, corsHeaders, getValidGoogleToken } from "../_shared/google-token.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const { accessToken } = await getValidGoogleToken(adminSupabase(), userId);

    const url = new URL(req.url);
    const search = (url.searchParams.get("q") ?? "").trim();
    const pageToken = url.searchParams.get("pageToken") ?? "";

    // Build Drive query: only folders, not trashed, optional name match
    const parts = [
      "mimeType = 'application/vnd.google-apps.folder'",
      "trashed = false",
    ];
    if (search) {
      const safe = search.replace(/'/g, "\\'");
      parts.push(`name contains '${safe}'`);
    }
    const q = parts.join(" and ");

    const params = new URLSearchParams({
      q,
      fields: "nextPageToken, files(id, name, parents, modifiedTime, owners(emailAddress, displayName))",
      orderBy: "modifiedTime desc",
      pageSize: "50",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      corpora: "user",
    });
    if (pageToken) params.set("pageToken", pageToken);

    const driveRes = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await driveRes.json();
    if (!driveRes.ok) {
      console.error("Drive list failed", data);
      return new Response(JSON.stringify({ error: data.error?.message ?? "Drive list failed" }), {
        status: driveRes.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        folders: data.files ?? [],
        nextPageToken: data.nextPageToken ?? null,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
