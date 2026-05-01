import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getValidAccessToken(supabase: any, userId: string): Promise<string> {
  const { data: conn, error } = await supabase
    .from("google_drive_connections")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !conn) throw new Error("חשבון Google Drive לא מחובר");

  const expiresAt = new Date(conn.token_expires_at).getTime();
  if (expiresAt - Date.now() > 2 * 60 * 1000) return conn.access_token;

  const refreshRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!,
      client_secret: Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const tokenData = await refreshRes.json();
  if (!refreshRes.ok) throw new Error(`רענון טוקן נכשל: ${tokenData.error_description ?? tokenData.error}`);

  const newAccessToken = tokenData.access_token as string;
  const newExpiresAt = new Date(Date.now() + ((tokenData.expires_in as number) ?? 3600) * 1000).toISOString();

  await supabase
    .from("google_drive_connections")
    .update({
      access_token: newAccessToken,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return newAccessToken;
}

async function createDriveFolder(accessToken: string, name: string, parentId: string): Promise<{ id: string; name: string }> {
  // Check if a folder with this name already exists under parent (avoid duplicates)
  const q = encodeURIComponent(
    `'${parentId}' in parents and name='${name.replace(/'/g, "\\'")}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
  );
  const findRes = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&pageSize=1`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  const findData = await findRes.json();
  if (findRes.ok && findData.files && findData.files.length > 0) {
    return findData.files[0];
  }
  const res = await fetch(
    "https://www.googleapis.com/drive/v3/files?fields=id,name",
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
  const data = await res.json();
  if (!res.ok) throw new Error(`יצירת תיקייה נכשלה: ${JSON.stringify(data)}`);
  return data;
}

function sanitizeFolderName(name: string): string {
  // Trim, collapse whitespace, strip Drive-unfriendly chars
  return name
    .replace(/[\\/:*?"<>|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120) || "תיק ללא שם";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: { user }, error: userErr } = await userClient.auth.getUser();
    if (userErr || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const body = await req.json().catch(() => ({}));
    const { kind, id, name } = body as { kind?: "case" | "meeting"; id?: string; name?: string };

    if (kind !== "case" && kind !== "meeting") {
      return new Response(JSON.stringify({ error: "kind חייב להיות case או meeting" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!id || !name) {
      return new Response(JSON.stringify({ error: "חסרים id או name" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Resolve the user's recordings parent folder for this kind
    const folderType = kind === "case" ? "appraiser_recordings" : "architect_recordings";
    const { data: parentFolder } = await adminClient
      .from("drive_work_folders")
      .select("folder_id, folder_name")
      .eq("user_id", user.id)
      .eq("folder_type", folderType)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!parentFolder?.folder_id) {
      return new Response(JSON.stringify({
        error: "no_parent_folder",
        message: kind === "case"
          ? "לא הוגדרה תיקיית הקלטות שמאי ב-Drive. הגדר אותה במסך הגדרות."
          : "לא הוגדרה תיקיית הקלטות פגישות ב-Drive. הגדר אותה במסך הגדרות.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accessToken = await getValidAccessToken(adminClient, user.id);
    const safeName = sanitizeFolderName(name);

    // Create the case/meeting root folder
    const root = await createDriveFolder(accessToken, safeName, parentFolder.folder_id);
    // Create the two sub-folders
    await createDriveFolder(accessToken, "הקלטות", root.id);
    await createDriveFolder(accessToken, "תמונות", root.id);

    const url = `https://drive.google.com/drive/folders/${root.id}`;

    // Persist on the source row (use service client so we can update regardless)
    const tableName = kind === "case" ? "cases" : "meetings";
    const { error: upErr } = await adminClient
      .from(tableName)
      .update({ drive_folder_id: root.id, drive_folder_url: url })
      .eq("id", id)
      .eq("user_id", user.id);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ folder_id: root.id, folder_url: url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("create-case-folder error", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
