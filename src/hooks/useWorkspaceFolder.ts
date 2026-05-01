import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type WorkspaceKind = "appraiser" | "architect";
export type FolderPurpose = "recordings" | "photos";

export interface WorkspaceFolder {
  id: string;
  folder_id: string;
  folder_name: string;
  folder_type: string;
}

export const folderTypeFor = (workspace: WorkspaceKind, purpose: FolderPurpose = "recordings") => {
  if (workspace === "appraiser") {
    return purpose === "recordings" ? "appraiser_recordings" : "appraiser_photos";
  }
  return purpose === "recordings" ? "architect_recordings" : "architect_photos";
};

/**
 * Per-workspace + per-purpose Drive work folder.
 * Each user has at most one folder per (workspace, purpose) combination.
 */
export function useWorkspaceFolder(workspace: WorkspaceKind, purpose: FolderPurpose = "recordings") {
  const [folder, setFolder] = useState<WorkspaceFolder | null>(null);
  const [loading, setLoading] = useState(true);

  const folderType = folderTypeFor(workspace, purpose);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setFolder(null);
      setLoading(false);
      return;
    }
    // For backward compatibility: architect recordings used to be saved as
    // "architect_meetings". Read both, prefer the new key.
    const legacyFallback = workspace === "architect" && purpose === "recordings"
      ? ["architect_recordings", "architect_meetings"]
      : [folderType];

    const { data } = await supabase
      .from("drive_work_folders")
      .select("id, folder_id, folder_name, folder_type")
      .eq("user_id", user.id)
      .in("folder_type", legacyFallback)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setFolder(data ?? null);
    setLoading(false);
  }, [folderType, workspace, purpose]);

  useEffect(() => {
    load();
    const onFocus = () => load();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [load]);

  const folderUrl = folder ? `https://drive.google.com/drive/folders/${folder.folder_id}` : null;

  return { folder, folderUrl, loading, reload: load, folderType };
}
