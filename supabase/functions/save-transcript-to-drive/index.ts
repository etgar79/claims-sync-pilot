// Save a recording's transcript as a TXT file to Google Drive.
// Destination logic:
//   - Appraiser: if recording is linked to a case AND case has drive_folder_id → "<case>/תמלולים"
//   - Architect: if recording is linked to a meeting AND meeting has drive_folder_id → "<meeting>/תמלולים"
//   - Otherwise → workspace recordings folder → "ללא שיוך/תמלולים"
import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

interface Payload {
  recordingId: string;
  workspace: "appraiser" | "architect";
  format?: "txt"; // future: pdf
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

async function uploadTextFile(
  accessToken: string,
  parentId: string,
  filename: string,
  content: string,
): Promise<{ id: string; webViewLink: string }> {
  const boundary = "lvbl_" + Math.random().toString(36).slice(2);
  const metadata = { name: filename, parents: [parentId], mimeType: "text/plain" };
  const enc = new TextEncoder();
  // BOM for Hebrew compatibility in Windows readers
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n\uFEFF${content}\r\n--${boundary}--`;
  const res = await fetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: enc.encode(body),
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

    if (!body?.recordingId || (body.workspace !== "appraiser" && body.workspace !== "architect")) {
      return new Response(JSON.stringify({ error: "recordingId + workspace required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tableName = body.workspace === "appraiser" ? "recordings" : "meeting_recordings";
    const linkCol = body.workspace === "appraiser" ? "case_id" : "meeting_id";

    const { data: rec, error: recErr } = await admin
      .from(tableName)
      .select(`id, filename, transcript, recorded_at, ${linkCol}`)
      .eq("id", body.recordingId)
      .eq("user_id", userId)
      .maybeSingle();
    if (recErr) throw recErr;
    if (!rec) throw new Error("ההקלטה לא נמצאה");
    if (!rec.transcript || !rec.transcript.trim()) {
      return new Response(JSON.stringify({ error: "no_transcript", message: "אין תמלול לשמור" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Find target parent folder
    let targetParentId: string | null = null;
    let contextLabel = "ללא שיוך";

    const linkedId = (rec as any)[linkCol] as string | null;
    if (linkedId) {
      const parentTable = body.workspace === "appraiser" ? "cases" : "meetings";
      const { data: parentRow } = await admin
        .from(parentTable)
        .select("drive_folder_id, title")
        .eq("id", linkedId)
        .maybeSingle();
      if (parentRow?.drive_folder_id) {
        targetParentId = parentRow.drive_folder_id;
        contextLabel = parentRow.title ?? contextLabel;
      }
    }

    const { accessToken } = await getValidGoogleToken(admin, userId);

    // Fallback: workspace folder → "ללא שיוך"
    if (!targetParentId) {
      const folderTypes = body.workspace === "appraiser"
        ? ["appraiser_recordings"]
        : ["architect_recordings", "architect_meetings"];
      const { data: wf } = await admin
        .from("drive_work_folders")
        .select("folder_id")
        .eq("user_id", userId)
        .in("folder_type", folderTypes)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!wf?.folder_id) {
        return new Response(JSON.stringify({
          error: "no_parent_folder",
          message: "לא הוגדרה תיקיית עבודה ב-Drive. עבור להגדרות והגדר.",
        }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      targetParentId = await findOrCreateFolder(accessToken, wf.folder_id, "ללא שיוך");
    }

    // Always nest under "תמלולים" sub-folder
    const transcriptsFolderId = await findOrCreateFolder(accessToken, targetParentId, "תמלולים");

    // Build TXT content
    const baseName = rec.filename.replace(/\.[^.]+$/, "") || "transcript";
    const safeName = `${baseName} - תמלול.txt`;
    const header =
      `קובץ: ${rec.filename}\n` +
      `תאריך הקלטה: ${new Date(rec.recorded_at).toLocaleString("he-IL")}\n` +
      `שיוך: ${contextLabel}\n` +
      `נשמר ב: ${new Date().toLocaleString("he-IL")}\n` +
      `${"-".repeat(60)}\n\n`;

    const uploaded = await uploadTextFile(accessToken, transcriptsFolderId, safeName, header + rec.transcript);

    return new Response(JSON.stringify({
      drive_file_id: uploaded.id,
      drive_url: uploaded.webViewLink,
      filename: safeName,
      context: contextLabel,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("save-transcript-to-drive error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
