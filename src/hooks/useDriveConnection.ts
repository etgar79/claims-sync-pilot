import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface DriveConnection {
  id: string;
  google_email: string;
  token_expires_at: string;
  created_at: string;
  updated_at: string;
}

export function useDriveConnection() {
  const [connection, setConnection] = useState<DriveConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setConnection(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("google_drive_connections")
      .select("id, google_email, token_expires_at, created_at, updated_at")
      .eq("user_id", user.id)
      .maybeSingle();
    setConnection(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    // Refresh on window focus (after returning from OAuth flow)
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const connect = useCallback(async () => {
    setConnecting(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "google-drive-auth",
        {
          body: { return_to: window.location.href },
          method: "POST",
        },
      );
      // invoke uses POST; we expect { url }
      if (error) throw error;
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("לא התקבלה כתובת התחברות");
      // Open in same tab so the callback returns user back
      window.location.href = url;
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בהתחלת התחברות", {
        description: e instanceof Error ? e.message : undefined,
      });
      setConnecting(false);
    }
  }, []);

  const disconnect = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase
      .from("google_drive_connections")
      .delete()
      .eq("user_id", user.id);
    if (error) {
      toast.error("שגיאה בניתוק", { description: error.message });
      return;
    }
    setConnection(null);
    toast.success("חשבון Google Drive נותק");
  }, []);

  return {
    connection,
    isConnected: !!connection,
    loading,
    connecting,
    connect,
    disconnect,
    reload: load,
  };
}
