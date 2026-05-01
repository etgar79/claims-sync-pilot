import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface WorkFolder {
  id: string;
  folder_id: string;
  folder_name: string;
  folder_type: string;
}

/**
 * Returns the user's primary work folder from Google Drive (folder_type = 'input').
 * Provides a direct URL to open that folder in Drive.
 */
export function useWorkFolder() {
  const [folder, setFolder] = useState<WorkFolder | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setFolder(null);
      setLoading(false);
      return;
    }
    const { data } = await supabase
      .from("drive_work_folders")
      .select("id, folder_id, folder_name, folder_type")
      .eq("user_id", user.id)
      .eq("folder_type", "input")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setFolder(data ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const folderUrl = folder ? `https://drive.google.com/drive/folders/${folder.folder_id}` : null;

  return { folder, folderUrl, loading, reload: load };
}
