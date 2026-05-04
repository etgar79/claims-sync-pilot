// Upload a transcriber's file (recording, chunk, or transcript text) into the
// admin's Google Drive central folder. Creates a per-user subfolder and the
// proper bucket subfolder (recordings/chunks/transcripts) on demand.
import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

type Bucket = "recordings" | "chunks" | "transcripts";

interface Payload {
  filename: string;
  mimeType: string;
  dataBase64: string;
  bucket: Bucket;
  // Optional — used only when bucket === "recordings" so we also create a row
  durationSeconds?: number;
  // When true, also insert a row into public.recordings for the calling user
  createRecordingRow?: boolean;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function fmtDuration(sec?: number): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function sanitizeFolderName(name: string): string {
  return (name || "user").replace(/[\/\\?%*:|"<>]/g, "_").trim() || "user";
}

async function uploadToDrive(
  accessToken: string,
  parentId: string,
  filename: string,
  mimeType: string,
  data: Uint8Array,
): Promise<{ id: string; webViewLink: string }> {
  const boundary = "lovable_upload_" + Math.random().toString(36).slice(2);
  const metadata = { name: filename, parents: [parentId], mimeType };
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + data.length + tail.length);
  body.set(head, 0);
  body.set(data, head.length);
  body.set(tail, head.length + data.length);

  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
    },
  );
  const out = await res.json();
  if (!res.ok) throw new Error(`Drive upload failed: ${JSON.stringify(out)}`);
  return out;
}

async function findOrCreateFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  // Search for existing
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

  // Create
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();

    // Accept either multipart/form-data (preferred, no base64 overhead) or JSON.
    const contentType = req.headers.get("content-type") || "";
    let filename = "";
    let mimeType = "";
    let bucket: Bucket = "recordings";
    let durationSeconds: number | undefined;
    let createRecordingRow = false;
    let bytes: Uint8Array;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "missing file" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      filename = String(form.get("filename") || file.name || "audio");
      mimeType = String(form.get("mimeType") || file.type || "application/octet-stream");
      bucket = (String(form.get("bucket") || "recordings")) as Bucket;
      const dur = form.get("durationSeconds");
      durationSeconds = dur ? Number(dur) : undefined;
      createRecordingRow = String(form.get("createRecordingRow") || "") === "true";
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = (await req.json()) as Payload;
      if (!body?.filename || !body?.mimeType || !body?.dataBase64 || !body?.bucket) {
        return new Response(JSON.stringify({ error: "חסרים filename / mimeType / dataBase64 / bucket" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      filename = body.filename;
      mimeType = body.mimeType;
      bucket = body.bucket;
      durationSeconds = body.durationSeconds;
      createRecordingRow = !!body.createRecordingRow;
      bytes = decodeBase64(body.dataBase64);
    }

    if (!["recordings", "chunks", "transcripts"].includes(bucket)) {
      return new Response(JSON.stringify({ error: "bucket לא חוקי" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get the central folder + admin user_id
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

    // 2. Get the admin's Google token
    const { accessToken } = await getValidGoogleToken(admin, root.admin_user_id);

    // 3. Resolve user display name for the subfolder
    const { data: profile } = await admin
      .from("profiles")
      .select("display_name")
      .eq("user_id", userId)
      .maybeSingle();
    const userFolderName = sanitizeFolderName(profile?.display_name || userId.slice(0, 8));

    // 4. Find/create {root}/{user}/{bucket}
    const userFolderId = await findOrCreateFolder(accessToken, root.folder_id, userFolderName);
    const bucketFolderId = await findOrCreateFolder(accessToken, userFolderId, bucket);

    // 5. Upload the file
    const uploaded = await uploadToDrive(accessToken, bucketFolderId, filename, mimeType, bytes);
    const driveUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;

    // 6. Optionally create a recordings row (for original-recording uploads)
    let recordingId: string | null = null;
    if (createRecordingRow && bucket === "recordings") {
      const duration = fmtDuration(durationSeconds);
      const { data: inserted, error: insErr } = await admin
        .from("recordings")
        .insert({
          user_id: userId,
          filename,
          drive_url: driveUrl,
          drive_file_id: uploaded.id,
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
      id: recordingId,
      drive_file_id: uploaded.id,
      drive_url: driveUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("upload-transcriber-file error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

