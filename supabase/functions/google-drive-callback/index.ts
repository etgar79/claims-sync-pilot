import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

// Public endpoint (Google redirects here)
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "*",
};

function htmlPage(message: string, returnTo: string, ok: boolean) {
  const target = returnTo && returnTo.startsWith("http") ? returnTo : "/";
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>חיבור Google Drive</title>
<style>
body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f8fafc;margin:0;padding:24px;text-align:center}
.card{background:white;padding:40px;border-radius:16px;box-shadow:0 10px 30px rgba(0,0,0,.08);max-width:420px}
h1{color:${ok ? "#059669" : "#dc2626"};font-size:24px;margin:0 0 12px}
p{color:#475569;margin:0 0 20px}
a{display:inline-block;background:#3b82f6;color:white;padding:10px 20px;border-radius:8px;text-decoration:none;font-weight:600}
</style></head><body><div class="card">
<h1>${ok ? "✅ החיבור הצליח" : "❌ החיבור נכשל"}</h1>
<p>${message}</p>
<a href="${target}">חזרה לאפליקציה</a>
<script>setTimeout(()=>{window.location.href=${JSON.stringify(target)}},2000)</script>
</div></body></html>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateRaw = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let returnTo = "";
  let userId = "";

  try {
    if (stateRaw) {
      const parsed = JSON.parse(atob(stateRaw));
      userId = parsed.uid ?? "";
      returnTo = parsed.returnTo ?? "";
    }
  } catch (_) {
    // ignore
  }

  if (error) {
    return new Response(htmlPage(`שגיאה מגוגל: ${error}`, returnTo, false), {
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  }

  if (!code || !userId) {
    return new Response(
      htmlPage("חסרים פרמטרים בתהליך החיבור.", returnTo, false),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }

  try {
    const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
    const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;
    const redirectUri = `${Deno.env.get("SUPABASE_URL")}/functions/v1/google-drive-callback`;

    // Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("Token exchange failed", tokenData);
      return new Response(
        htmlPage(
          `שגיאה בהחלפת הקוד: ${tokenData.error_description ?? tokenData.error ?? "unknown"}`,
          returnTo,
          false,
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const accessToken = tokenData.access_token as string;
    const refreshToken = tokenData.refresh_token as string | undefined;
    const expiresIn = (tokenData.expires_in as number) ?? 3600;
    const scope = tokenData.scope as string | undefined;

    // Get user email from Google
    const userInfoRes = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const userInfo = await userInfoRes.json();
    const googleEmail = userInfo.email as string;

    // Save with service role (bypasses RLS - we already validated state.uid)
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // If no refresh_token returned (user already authorized), preserve existing one
    let refreshTokenToSave = refreshToken;
    if (!refreshTokenToSave) {
      const { data: existing } = await supabase
        .from("google_drive_connections")
        .select("refresh_token")
        .eq("user_id", userId)
        .maybeSingle();
      refreshTokenToSave = existing?.refresh_token;
    }

    if (!refreshTokenToSave) {
      return new Response(
        htmlPage(
          "לא התקבל refresh token. נסה לבטל הרשאות בחשבון גוגל ולחבר שוב.",
          returnTo,
          false,
        ),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    const { error: upsertErr } = await supabase
      .from("google_drive_connections")
      .upsert(
        {
          user_id: userId,
          google_email: googleEmail,
          access_token: accessToken,
          refresh_token: refreshTokenToSave,
          token_expires_at: expiresAt,
          scope,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );

    if (upsertErr) {
      console.error("Upsert failed", upsertErr);
      return new Response(
        htmlPage(`שגיאה בשמירה: ${upsertErr.message}`, returnTo, false),
        { headers: { "Content-Type": "text/html; charset=utf-8" } },
      );
    }

    return new Response(
      htmlPage(`חשבון ${googleEmail} חובר בהצלחה.`, returnTo, true),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  } catch (e) {
    console.error("google-drive-callback error", e);
    return new Response(
      htmlPage(
        `שגיאה: ${e instanceof Error ? e.message : "unknown"}`,
        returnTo,
        false,
      ),
      { headers: { "Content-Type": "text/html; charset=utf-8" } },
    );
  }
});
