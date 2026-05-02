// List files inside a specific Google Drive folder for the authenticated user.
// Query params: ?folderId=...&mimeStartsWith=image/  (mimeStartsWith optional)
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminSupabase, authedUser, corsHeaders, getValidGoogleToken } from "../_shared/google-token.ts";

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const { accessToken } = await getValidGoogleToken(adminSupabase(), userId);

    const url = new URL(req.url);
    const folderId = (url.searchParams.get("folderId") ?? "").trim();
    const mimeStartsWith = (url.searchParams.get("mimeStartsWith") ?? "").trim();
    if (!folderId) {
      return new Response(JSON.stringify({ error: "folderId is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const safeFolder = folderId.replace(/'/g, "\\'");
    const parts = [
      `'${safeFolder}' in parents`,
      "trashed = false",
      "mimeType != 'application/vnd.google-apps.folder'",
    ];
    const q = parts.join(" and ");

    const params = new URLSearchParams({
      q,
      fields: "files(id, name, mimeType, modifiedTime, size, webViewLink, thumbnailLink, webContentLink)",
      orderBy: "modifiedTime desc",
      pageSize: "200",
      includeItemsFromAllDrives: "true",
      supportsAllDrives: "true",
      corpora: "user",
    });

    const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: data.error?.message ?? "Drive list failed" }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let files = (data.files ?? []) as any[];
    if (mimeStartsWith) {
      files = files.filter((f) => typeof f.mimeType === "string" && f.mimeType.startsWith(mimeStartsWith));
    }

    return new Response(JSON.stringify({ files }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
