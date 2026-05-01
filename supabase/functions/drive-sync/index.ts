// Sync audio/video files from a user's Drive folder into the DB.
// Body: { workspace: 'appraiser' | 'architect' }
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminSupabase, authedUser, corsHeaders, getValidGoogleToken } from "../_shared/google-token.ts";

const AUDIO_VIDEO_REGEX = /^(audio|video)\//;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const { workspace } = await req.json().catch(() => ({}));
    if (workspace !== "appraiser" && workspace !== "architect") {
      return new Response(JSON.stringify({ error: "workspace חייב להיות appraiser או architect" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const folderType = workspace === "appraiser" ? "appraiser_recordings" : "architect_meetings";
    const admin = adminSupabase();

    // Find user's folder for this workspace
    const { data: folderRow } = await admin
      .from("drive_work_folders")
      .select("folder_id, folder_name")
      .eq("user_id", userId)
      .eq("folder_type", folderType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!folderRow) {
      return new Response(
        JSON.stringify({ error: "לא הוגדרה תיקיית עבודה. עבור להגדרות ובחר תיקייה." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { accessToken } = await getValidGoogleToken(admin, userId);

    // List all audio/video files inside the folder (page through if needed)
    const driveFiles: Array<{ id: string; name: string; mimeType: string; modifiedTime?: string; webViewLink?: string }> = [];
    let pageToken: string | undefined;
    do {
      const params = new URLSearchParams({
        q: `'${folderRow.folder_id}' in parents and trashed = false`,
        fields: "nextPageToken, files(id, name, mimeType, modifiedTime, webViewLink)",
        pageSize: "200",
        includeItemsFromAllDrives: "true",
        supportsAllDrives: "true",
        corpora: "user",
      });
      if (pageToken) params.set("pageToken", pageToken);
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${params}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      const body = await res.json();
      if (!res.ok) {
        return new Response(
          JSON.stringify({ error: body?.error?.message ?? "Drive list failed" }),
          { status: res.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      for (const f of body.files ?? []) {
        if (AUDIO_VIDEO_REGEX.test(f.mimeType)) driveFiles.push(f);
      }
      pageToken = body.nextPageToken;
    } while (pageToken);

    if (driveFiles.length === 0) {
      return new Response(
        JSON.stringify({ added: 0, existing: 0, total: 0, folderName: folderRow.folder_name }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const table = workspace === "appraiser" ? "recordings" : "meeting_recordings";

    // Find which drive_file_ids already exist for this user
    const ids = driveFiles.map((f) => f.id);
    const { data: existing } = await admin
      .from(table)
      .select("drive_file_id")
      .eq("user_id", userId)
      .in("drive_file_id", ids);
    const existingSet = new Set((existing ?? []).map((r: { drive_file_id: string }) => r.drive_file_id));

    const toInsert = driveFiles.filter((f) => !existingSet.has(f.id));

    let added = 0;
    if (toInsert.length > 0) {
      const rows = toInsert.map((f) => ({
        user_id: userId,
        filename: f.name,
        recorded_at: f.modifiedTime ?? new Date().toISOString(),
        drive_url: f.webViewLink ?? `https://drive.google.com/file/d/${f.id}/view`,
        drive_file_id: f.id,
        source: "drive_sync",
        transcript_status: "pending",
        // case_id / meeting_id intentionally NULL (unassigned)
      }));
      const { error: insErr, count } = await admin.from(table).insert(rows, { count: "exact" });
      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      added = count ?? rows.length;
    }

    return new Response(
      JSON.stringify({
        added,
        existing: existingSet.size,
        total: driveFiles.length,
        folderName: folderRow.folder_name,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error("drive-sync error:", msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
