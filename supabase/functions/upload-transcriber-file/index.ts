// Upload a file from the /transcribe page directly to the USER's own Google Drive,
// then create a recordings row only after Drive returns a valid file id.
//
// Accepts multipart/form-data with fields:
//   file       - the audio blob (required)
//   filename   - (optional) override file.name
//   mimeType   - (optional) override file.type
//   durationSeconds - (optional) numeric duration
//
// Strategy: stream the file into a Drive resumable upload from inside the
// edge function. We do NOT return a session URL to the browser, because the
// browser cannot PUT to Google's resumable endpoint directly (CORS blocks it
// from arbitrary lovable.app subdomains).

import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

function fmtDuration(sec?: number): string | null {
  if (!sec || sec <= 0) return null;
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

async function findOrCreateFolder(
  accessToken: string,
  parentId: string | null, // null => Drive root ("My Drive")
  name: string,
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const parentClause = parentId ? `'${parentId}' in parents and ` : `'root' in parents and `;
  const q = encodeURIComponent(
    `${parentClause}name = '${escaped}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
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
        parents: [parentId ?? "root"],
      }),
    },
  );
  const created = await createRes.json();
  if (!createRes.ok) throw new Error(`Drive folder create failed: ${JSON.stringify(created)}`);
  return created.id as string;
}

async function resolveTargetFolder(admin: any, accessToken: string, userId: string): Promise<string> {
  // Reuse any existing per-user recordings folder if one is set up.
  const { data: existing } = await admin
    .from("drive_work_folders")
    .select("folder_id, folder_type")
    .eq("user_id", userId)
    .in("folder_type", [
      "transcriber_recordings",
      "appraiser_recordings",
      "architect_recordings",
      "architect_meetings",
    ])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing?.folder_id) return existing.folder_id as string;

  // Otherwise, create a "תמלולים" folder in the user's Drive root and remember it.
  const folderId = await findOrCreateFolder(accessToken, null, "תמלולים");
  await admin.from("drive_work_folders").insert({
    user_id: userId,
    folder_type: "transcriber_recordings",
    folder_name: "תמלולים",
    folder_id: folderId,
  });
  return folderId;
}

async function uploadToDrive(
  accessToken: string,
  parentId: string,
  filename: string,
  mimeType: string,
  data: Uint8Array,
): Promise<{ id: string; webViewLink: string }> {
  const initRes = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(data.byteLength),
      },
      body: JSON.stringify({ name: filename, parents: [parentId], mimeType }),
    },
  );
  if (!initRes.ok) {
    const errTxt = await initRes.text();
    throw new Error(`Drive resumable init failed [${initRes.status}]: ${errTxt}`);
  }
  const sessionUrl = initRes.headers.get("location");
  if (!sessionUrl) throw new Error("Drive resumable: missing session URL");

  const putRes = await fetch(sessionUrl, {
    method: "PUT",
    headers: { "Content-Type": mimeType, "Content-Length": String(data.byteLength) },
    body: data,
  });
  const out = await putRes.json();
  if (!putRes.ok) throw new Error(`Drive upload failed [${putRes.status}]: ${JSON.stringify(out)}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();

    const contentType = req.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return new Response(JSON.stringify({
        error: "bad_request",
        message: "יש לשלוח את הקובץ כ-multipart/form-data.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return new Response(JSON.stringify({
        error: "missing_file",
        message: "לא נמצא קובץ בבקשה.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const filename = String(form.get("filename") || file.name || "audio");
    const mimeType = String(form.get("mimeType") || file.type || "audio/webm");
    const durRaw = form.get("durationSeconds");
    const durationSeconds = durRaw ? Number(durRaw) : undefined;

    // Use the USER's own Drive (not the admin's central folder).
    const { accessToken } = await getValidGoogleToken(admin, userId);
    const parentFolderId = await resolveTargetFolder(admin, accessToken, userId);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const uploaded = await uploadToDrive(accessToken, parentFolderId, filename, mimeType, bytes);
    const driveUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;

    // Only NOW create the recordings row — we have a real Drive file id.
    const { data: inserted, error: insErr } = await admin
      .from("recordings")
      .insert({
        user_id: userId,
        filename,
        drive_url: driveUrl,
        drive_file_id: uploaded.id,
        source: "manual_upload",
        transcript_status: "pending",
        duration: fmtDuration(durationSeconds),
        recorded_at: new Date().toISOString(),
      } as any)
      .select("id")
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      id: inserted.id,
      drive_file_id: uploaded.id,
      drive_url: driveUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    console.error("upload-transcriber-file error", msg);
    return new Response(JSON.stringify({
      error: "upload_failed",
      message: msg.includes("חיבר") ? msg : `העלאה ל-Drive נכשלה: ${msg}`,
    }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
