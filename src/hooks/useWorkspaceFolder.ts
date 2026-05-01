import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceKind = "appraiser" | "architect";

export interface WorkspaceFolder {
  id: string;
  folder_id: string;
  folder_name: string;
  folder_type: string;
}

const folderTypeFor = (workspace: WorkspaceKind) =>
  workspace === "appraiser" ? "appraiser_recordings" : "architect_meetings";

/**
 * Per-workspace Drive work folder. Each user has at most one folder per workspace type.
 */
export function useWorkspaceFolder(workspace: WorkspaceKind) {
  const [folder, setFolder] = useState<WorkspaceFolder | null>(null);
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
      .eq("folder_type", folderTypeFor(workspace))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setFolder(data ?? null);
    setLoading(false);
  }, [workspace]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const folderUrl = folder ? `https://drive.google.com/drive/folders/${folder.folder_id}` : null;

  return { folder, folderUrl, loading, reload: load, folderType: folderTypeFor(workspace) };
}
