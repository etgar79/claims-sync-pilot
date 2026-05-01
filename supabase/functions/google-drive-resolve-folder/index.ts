// Resolve a folder by ID or Google Drive URL — returns folder metadata.
// Used to validate a pasted link/ID before saving as the user's work folder.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { adminSupabase, authedUser, corsHeaders, getValidGoogleToken } from "../_shared/google-token.ts";

function extractFolderId(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  // /folders/<id>
  const m1 = s.match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (m1) return m1[1];
  // ?id=<id>
  const m2 = s.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (m2) return m2[1];
  // Bare ID
  if (/^[a-zA-Z0-9_-]{10,}$/.test(s)) return s;
  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const userId = await authedUser(req);
    const { accessToken } = await getValidGoogleToken(adminSupabase(), userId);

    const body = await req.json().catch(() => ({}));
    const input = (body.input ?? "") as string;
    const folderId = extractFolderId(input);
    if (!folderId) {
      return new Response(JSON.stringify({ error: "לא הצלחתי לזהות מזהה תיקייה מהקישור." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const params = new URLSearchParams({
      fields: "id, name, mimeType, parents, webViewLink",
      supportsAllDrives: "true",
    });
    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${folderId}?${params}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const data = await res.json();
    if (!res.ok) {
      console.error("Drive get failed", data);
      const msg = res.status === 404
        ? "לא נמצאה תיקייה עם המזהה הזה (ייתכן שאין לך גישה אליה בחשבון המחובר)."
        : (data.error?.message ?? "שגיאה בשליפת התיקייה");
      return new Response(JSON.stringify({ error: msg }), {
        status: res.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (data.mimeType !== "application/vnd.google-apps.folder") {
      return new Response(JSON.stringify({ error: "המזהה שייך לקובץ ולא לתיקייה." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({ id: data.id, name: data.name, webViewLink: data.webViewLink }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
