// Shared helper to get a valid Google access token for a given user.
// Refreshes the token automatically if expired.
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export async function getValidGoogleToken(
  adminClient: SupabaseClient,
  userId: string,
): Promise<{ accessToken: string; email: string }> {
  const { data: conn, error } = await adminClient
    .from("google_drive_connections")
    .select("access_token, refresh_token, token_expires_at, google_email")
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !conn) {
    throw new Error("המשתמש לא חיבר חשבון Google. עבור להגדרות וחבר.");
  }

  const expiresAt = new Date(conn.token_expires_at).getTime();
  const now = Date.now();
  // Refresh if expires in less than 60 seconds
  if (expiresAt - now > 60_000) {
    return { accessToken: conn.access_token, email: conn.google_email };
  }

  // Refresh
  const clientId = Deno.env.get("GOOGLE_OAUTH_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_OAUTH_CLIENT_SECRET")!;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: conn.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    console.error("Token refresh failed", data);
    throw new Error(
      `רענון טוקן נכשל - ייתכן שצריך לחבר מחדש את חשבון Google. (${data.error_description ?? data.error ?? "unknown"})`,
    );
  }

  const newAccess = data.access_token as string;
  const expiresIn = (data.expires_in as number) ?? 3600;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  await adminClient
    .from("google_drive_connections")
    .update({
      access_token: newAccess,
      token_expires_at: newExpiresAt,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userId);

  return { accessToken: newAccess, email: conn.google_email };
}

export function adminSupabase(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export async function authedUser(req: Request): Promise<string> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) throw new Error("Unauthorized");
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: { user }, error } = await userClient.auth.getUser();
  if (error || !user) throw new Error("Unauthorized");
  return user.id;
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
