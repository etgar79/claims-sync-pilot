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

    // Accept multipart/form-data (preferred) or JSON.
    const contentType = req.headers.get("content-type") || "";
    let workspace: "appraiser" | "architect";
    let filename = "";
    let mimeType = "";
    let durationSeconds: number | undefined;
    let purposeIn: string | undefined;
    let bytes: Uint8Array;

    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (!(file instanceof File)) {
        return new Response(JSON.stringify({ error: "missing file" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      workspace = String(form.get("workspace") || "") as any;
      filename = String(form.get("filename") || file.name || "audio");
      mimeType = String(form.get("mimeType") || file.type || "audio/webm");
      const dur = form.get("durationSeconds");
      durationSeconds = dur ? Number(dur) : undefined;
      purposeIn = (form.get("purpose") as string) || undefined;
      bytes = new Uint8Array(await file.arrayBuffer());
    } else {
      const body = (await req.json()) as Payload;
      workspace = body?.workspace;
      filename = body?.filename;
      mimeType = body?.mimeType;
      durationSeconds = body?.durationSeconds;
      purposeIn = body?.purpose;
      if (!body?.dataBase64) {
        return new Response(JSON.stringify({ error: "חסרים filename / mimeType / dataBase64" }), {
          status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      bytes = decodeBase64(body.dataBase64);
    }

    if (workspace !== "appraiser" && workspace !== "architect") {
      return new Response(JSON.stringify({ error: "workspace חייב להיות appraiser או architect" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!filename || !mimeType) {
      return new Response(JSON.stringify({ error: "חסרים filename / mimeType" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve user's parent folder for this workspace + purpose
    const purpose: "recordings" | "calls" = purposeIn === "calls" ? "calls" : "recordings";
    let folderTypes: string[];
    if (purpose === "calls") {
      folderTypes = workspace === "appraiser" ? ["appraiser_calls"] : ["architect_calls"];
    } else {
      folderTypes = workspace === "architect"
        ? ["architect_recordings", "architect_meetings"]
        : ["appraiser_recordings"];
    }

    const { data: folder } = await admin
      .from("drive_work_folders")
      .select("folder_id")
      .eq("user_id", userId)
      .in("folder_type", folderTypes)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!folder?.folder_id) {
      return new Response(JSON.stringify({
        error: "no_parent_folder",
        message: purpose === "calls"
          ? "לא הוגדרה תיקיית שיחות טלפון ב-Drive. עבור להגדרות והגדר תיקיית שיחות."
          : "לא הוגדרה תיקיית הקלטות ב-Drive. עבור להגדרות והגדר תיקיית הקלטות.",
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { accessToken } = await getValidGoogleToken(admin, userId);
    const uploaded = await uploadToDrive(accessToken, folder.folder_id, filename, mimeType, bytes);

    const driveUrl = uploaded.webViewLink || `https://drive.google.com/file/d/${uploaded.id}/view`;
    const duration = fmtDuration(durationSeconds);

    // Insert recording row into the right table
    const tableName = workspace === "appraiser" ? "recordings" : "meeting_recordings";
    const insertRow: any = {
      user_id: userId,
      filename,
      drive_url: driveUrl,
      drive_file_id: uploaded.id,
      source: purpose === "calls" ? "phone_call" : "manual_upload",
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
