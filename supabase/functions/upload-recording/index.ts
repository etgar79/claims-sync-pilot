// Upload an audio recording (from browser mic or file upload) to the user's
// Google Drive workspace folder, then create a row in recordings/meeting_recordings.
import { adminSupabase, authedUser, getValidGoogleToken, corsHeaders } from "../_shared/google-token.ts";

interface Payload {
  workspace: "appraiser" | "architect";
  filename: string;
  mimeType: string;
  // base64-encoded audio (without data: prefix)
  dataBase64: string;
  durationSeconds?: number;
  purpose?: "recordings" | "calls";
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const admin = adminSupabase();
    const body = (await req.json()) as Payload;

    if (!body || (body.workspace !== "appraiser" && body.workspace !== "architect")) {
      return new Response(JSON.stringify({ error: "workspace חייב להיות appraiser או architect" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!body.filename || !body.mimeType || !body.dataBase64) {
      return new Response(JSON.stringify({ error: "חסרים filename / mimeType / dataBase64" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve user's recordings parent folder for this workspace
    const folderType = body.workspace === "appraiser" ? "appraiser_recordings" : "architect_recordings";
    const { data: folder } = await admin
      .from("drive_work_folders")
      .select("folder_id")
      .eq("user_id", userId)
      .in("folder_type", folderType === "architect_recordings"
        ? ["architect_recordings", "architect_meetings"]
        : [folderType])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!folder?.folder_id) {
      return new Response(JSON.stringify({
        error: "no_parent_folder",
        message: "לא הוגדרה תיקיית הקלטות ב-Drive. עבור להגדרות והגדר תיקיית הקלטות.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { accessToken } = await getValidGoogleToken(admin, userId);
    const bytes = decodeBase64(body.dataBase64);
    const uploaded = await uploadToDrive(accessToken, folder.folder_id, body.filename, body.mimeType, bytes);

    const driveUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
    const duration = fmtDuration(body.durationSeconds);

    // Insert recording row into the right table
    const tableName = body.workspace === "appraiser" ? "recordings" : "meeting_recordings";
    const insertRow: any = {
      user_id: userId,
      filename: body.filename,
      drive_url: driveUrl,
      drive_file_id: uploaded.id,
      source: "manual_upload",
      transcript_status: "pending",
      duration,
      recorded_at: new Date().toISOString(),
    };

    const { data: inserted, error: insErr } = await admin
      .from(tableName)
      .insert(insertRow)
      .select("id")
      .single();
    if (insErr) throw insErr;

    return new Response(JSON.stringify({
      id: inserted.id,
      drive_file_id: uploaded.id,
      drive_url: driveUrl,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("upload-recording error", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
