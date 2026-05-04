// Upload a photo to Google Drive.
// Destination:
//   - With caseId (or meetingId): "<case-or-meeting-folder>/תמונות"
//   - Else: workspace photos folder → "ללא שיוך/תמונות"
// Also inserts a row in `photos` table when caseId is provided (appraiser).
import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

interface Payload {
  workspace: "appraiser" | "architect";
  filename: string;
  mimeType: string;
  dataBase64: string;
  caseId?: string | null;     // appraiser
  meetingId?: string | null;  // architect
  caption?: string | null;
}

function decodeBase64(b64: string): Uint8Array {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function findOrCreateFolder(
  accessToken: string,
  parentId: string,
  name: string,
): Promise<string> {
  const safe = name.replace(/[\\/:*?"<>|]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120) || "folder";
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${safe.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const find = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const fdata = await find.json();
  if (find.ok && fdata.files?.length) return fdata.files[0].id;

  const res = await fetch("https://www.googleapis.com/drive/v3/files?fields=id", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: safe, mimeType: "application/vnd.google-apps.folder", parents: [parentId] }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`folder create failed: ${JSON.stringify(data)}`);
  return data.id;
}

async function uploadBinary(
  accessToken: string,
  parentId: string,
  filename: string,
  mimeType: string,
  data: Uint8Array,
): Promise<{ id: string; webViewLink: string }> {
  const boundary = "lvbl_" + Math.random().toString(36).slice(2);
  const metadata = { name: filename, parents: [parentId], mimeType };
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
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
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const out = await res.json();
  if (!res.ok) throw new Error(`upload failed: ${JSON.stringify(out)}`);
  return out;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();
    const body = (await req.json()) as Payload;

    if (!body || (body.workspace !== "appraiser" && body.workspace !== "architect")) {
      return new Response(JSON.stringify({ error: "workspace required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.filename || !body.mimeType || !body.dataBase64) {
      return new Response(JSON.stringify({ error: "missing filename/mimeType/dataBase64" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve target parent
    let targetParentId: string | null = null;
    if (body.workspace === "appraiser" && body.caseId) {
      const { data: c } = await admin.from("cases").select("drive_folder_id").eq("id", body.caseId).maybeSingle();
      if (c?.drive_folder_id) targetParentId = c.drive_folder_id;
    }
    if (body.workspace === "architect" && body.meetingId) {
      const { data: m } = await admin.from("meetings").select("drive_folder_id").eq("id", body.meetingId).maybeSingle();
      if (m?.drive_folder_id) targetParentId = m.drive_folder_id;
    }

    const { accessToken } = await getValidGoogleToken(admin, userId);

    if (!targetParentId) {
      // Fallback to workspace photos folder → "ללא שיוך"
      const folderType = body.workspace === "appraiser" ? "appraiser_photos" : "architect_photos";
      const { data: wf } = await admin
        .from("drive_work_folders")
        .select("folder_id")
        .eq("user_id", userId)
        .eq("folder_type", folderType)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!wf?.folder_id) {
        return new Response(JSON.stringify({
          error: "no_parent_folder",
          message: "לא הוגדרה תיקיית תמונות ב-Drive. עבור להגדרות.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      targetParentId = await findOrCreateFolder(accessToken, wf.folder_id, "ללא שיוך");
    }

    // Always nest under "תמונות"
    const photosFolderId = await findOrCreateFolder(accessToken, targetParentId, "תמונות");

    const bytes = decodeBase64(body.dataBase64);
    const uploaded = await uploadBinary(accessToken, photosFolderId, body.filename, body.mimeType, bytes);
    const driveUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;

    // Insert into photos table for appraiser cases (lets photos appear in the app)
    let photoRowId: string | null = null;
    if (body.workspace === "appraiser" && body.caseId) {
      const { data: row, error: insErr } = await admin
        .from("photos")
        .insert({
          user_id: userId,
          case_id: body.caseId,
          url: driveUrl,
          source: "drive_upload",
          caption: body.caption ?? null,
        })
        .select("id")
        .single();
      if (insErr) console.warn("photos insert failed", insErr);
      else photoRowId = row.id;
    }

    return new Response(JSON.stringify({
      drive_file_id: uploaded.id,
      drive_url: driveUrl,
      photo_id: photoRowId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("upload-photo-to-drive error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
