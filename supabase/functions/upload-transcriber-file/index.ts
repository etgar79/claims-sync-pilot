// Initialize a Google Drive resumable upload session for a transcriber's file.
// The browser then PUTs the file bytes directly to Google — bytes never pass
// through this Edge Function (which has a tight memory limit).
//
// Request (JSON):
//   { filename, mimeType, sizeBytes, bucket, durationSeconds?, createRecordingRow? }
// Response:
//   { sessionUrl, recordingId?, userFolderId, bucketFolderId }
//
// After PUT succeeds, the browser parses Drive's response { id, webViewLink }
// and PATCHes the recordings row (RLS allows the owner).

import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

type Bucket = "recordings" | "chunks" | "transcripts";

function fmtDuration(sec?: number): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sanitizeFolderName(name: string): string {
  return (name || "user").replace(/[\/\\?%*:|"<>]/g, "_").trim() || "user";
}

async function findOrCreateFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const q = encodeURIComponent(
    `'${parentId}' in parents and name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  const res = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(`Drive folder lookup failed: ${JSON.stringify(data)}`);
  if (data.files && data.files.length > 0) return data.files[0].id as string;

  const createRes = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id",
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentId],
      }),
    },
  );
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${JSON.stringify(created)}`);
  return created.id as string;
}

async function initResumableSession(
  accessToken: string,
  parentId: string,
  filename: string,
  mimeType: string,
  sizeBytes?: number,
): Promise<string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": mimeType,
    // Allow the browser to PUT from any origin (Google honours these on the session).
    "Origin": "https://lovable.app",
  };
  if (sizeBytes && sizeBytes > 0) headers["X-Upload-Content-Length"] = String(sizeBytes);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    {
      method: "POST",
      headers,
      body: JSON.stringify({ name: filename, parents: [parentId], mimeType }),
    },
  );
  if (!res.ok) {
    const errTxt = await res.text();
    throw new Error(`Drive resumable init failed [${res.status}]: ${errTxt}`);
  }
  const sessionUrl = res.headers.get("location");
  if (!sessionUrl) throw new Error("Drive resumable: missing session URL");
  return sessionUrl;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();

    const body = await req.json().catch(() => ({}));
    const filename: string = body.filename || "audio";
    const mimeType: string = body.mimeType || "application/octet-stream";
    const bucket: Bucket = (body.bucket || "recordings") as Bucket;
    const sizeBytes: number | undefined = body.sizeBytes ? Number(body.sizeBytes) : undefined;
    const durationSeconds: number | undefined = body.durationSeconds ? Number(body.durationSeconds) : undefined;
    const createRecordingRow: boolean = !!body.createRecordingRow;

    if (!["recordings", "chunks", "transcripts"].includes(bucket)) {
      return new Response(JSON.stringify({ error: "bucket לא חוקי" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Resolve admin's central transcriber folder
    const { data: root, error: rootErr } = await admin
      .from("transcriber_root_folder")
      .select("admin_user_id, folder_id")
      .eq("id", true)
      .maybeSingle();
    if (rootErr) throw rootErr;
    if (!root?.folder_id || !root?.admin_user_id) {
      return new Response(JSON.stringify({
        error: "no_root_folder",
        message: "האדמין עדיין לא הגדיר תיקיית תמלולים מרכזית. פנה למנהל המערכת.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // 2. Use admin's Google token (admin owns the central drive)
    const { accessToken } = await getValidGoogleToken(admin, root.admin_user_id);

    // 3. Per-user subfolder name
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const userFolderName = sanitizeFolderName(profile?.display_name || userId.slice(0, 8));

    // 4. Find/create {root}/{user}/{bucket}
    const userFolderId = await findOrCreateFolder(accessToken, root.folder_id, userFolderName);
    const bucketFolderId = await findOrCreateFolder(accessToken, userFolderId, bucket);

    // 5. Initiate resumable upload session — browser will PUT bytes directly.
    const sessionUrl = await initResumableSession(accessToken, bucketFolderId, filename, mimeType, sizeBytes);

    // 6. Optionally create a placeholder recordings row up-front so the user
    //    sees something in the list immediately. The client patches drive_url +
    //    drive_file_id once the PUT completes.
    let recordingId: string | null = null;
    if (createRecordingRow && bucket === "recordings") {
      const duration = fmtDuration(durationSeconds);
      const { data: inserted, error: insErr } = await admin
        .from("recordings")
        .insert({
          user_id: userId,
          filename,
          source: "manual_upload",
          transcript_status: "pending",
          duration,
          recorded_at: new Date().toISOString(),
        } as any)
        .select("id")
        .single();
      if (insErr) throw insErr;
      recordingId = inserted.id;
    }

    return new Response(JSON.stringify({
      sessionUrl,
      recordingId,
      userFolderId,
      bucketFolderId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("upload-transcriber-file error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
