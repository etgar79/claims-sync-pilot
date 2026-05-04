// Download a recording file from the admin's Google Drive on behalf of a
// transcriber user. Verifies that the requested drive_file_id is referenced by
// a recordings row owned by the calling user.
import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

interface Payload {
  recordingId?: string;
  driveFileId?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();
    const body = (await req.json()) as Payload;

    if (!body?.recordingId && !body?.driveFileId) {
      return new Response(JSON.stringify({ error: "missing recordingId or driveFileId" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the recording (by id or drive_file_id) and verify ownership.
    const query = admin.from("recordings").select("id, user_id, filename, drive_file_id, drive_url").eq("user_id", userId);
    const { data: rec, error: recErr } = body.recordingId
      ? await query.eq("id", body.recordingId).maybeSingle()
      : await query.eq("drive_file_id", body.driveFileId!).maybeSingle();
    if (recErr) throw recErr;
    if (!rec) {
      return new Response(JSON.stringify({ error: "recording not found or not yours" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let driveFileId = rec.drive_file_id as string | null;
    if (!driveFileId && rec.drive_url) {
      const m = rec.drive_url.match(/\/file\/d\/([^/]+)|[?&]id=([^&]+)/);
      driveFileId = m ? (m[1] || m[2]) : null;
    }
    if (!driveFileId) {
      return new Response(JSON.stringify({ error: "no drive file linked to recording" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get the central admin's token
    const { data: root, error: rootErr } = await admin
      .from("transcriber_root_folder")
      .select("admin_user_id")
      .eq("id", true)
      .maybeSingle();
    if (rootErr) throw rootErr;
    if (!root?.admin_user_id) {
      return new Response(JSON.stringify({ error: "transcriber root folder not configured" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { accessToken } = await getValidGoogleToken(admin, root.admin_user_id);

    // Fetch metadata (for filename + mime)
    const metaRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?fields=id,name,mimeType,size`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const meta = await metaRes.json();
    if (!metaRes.ok) {
      return new Response(JSON.stringify({ error: "drive metadata failed", details: meta }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Download bytes
    const dlRes = await fetch(
      `https://www.googleapis.com/drive/v3/files/${driveFileId}?alt=media`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!dlRes.ok) {
      const errText = await dlRes.text();
      return new Response(JSON.stringify({ error: "drive download failed", details: errText }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const buf = await dlRes.arrayBuffer();
    const filename = meta.name || rec.filename || "audio";
    const mimeType = meta.mimeType || "application/octet-stream";

    return new Response(buf, {
      headers: {
        ...corsHeaders,
        "Content-Type": mimeType,
        "X-Filename": encodeURIComponent(filename),
      },
    });
  } catch (e) {
    console.error("download-transcriber-file error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
