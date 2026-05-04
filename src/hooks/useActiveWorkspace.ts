import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserRoles } from "@/hooks/useUserRoles";

export type Workspace = "appraiser" | "architect" | "admin" | "transcriber";

const STORAGE_KEY = "active_workspace";

function readStored(): Workspace | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "appraiser" || v === "architect" || v === "admin" || v === "transcriber") return v;
  } catch {}
  return null;
}

export function useActiveWorkspace() {
  const { roles, isAdmin, loading } = useUserRoles();
  const [workspace, setWorkspaceState] = useState<Workspace | null>(null);

  // Available workspaces — STRICT: only what the user actually has.
  const available: Workspace[] = useMemo(() => {
    if (loading) return [];
    const list: Workspace[] = [];
    if (isAdmin) {
      list.push("admin", "appraiser", "architect", "transcriber");
    } else {
      if (roles.includes("appraiser")) list.push("appraiser");
      if (roles.includes("architect")) list.push("architect");
      if (roles.includes("transcriber")) list.push("transcriber");
    }
    return list;
  }, [loading, isAdmin, roles]);

  useEffect(() => {
    if (loading) return;
    if (available.length === 0) {
      setWorkspaceState(null);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
      return;
    }
    const stored = readStored();
    // If stored workspace is NOT in the user's available list — discard it.
    if (stored && available.includes(stored)) {
      setWorkspaceState(stored);
      return;
    }
    if (stored && !available.includes(stored)) {
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
    // Default selection — admin starts as a regular work mode (not admin panel).
    // To enter admin panel they explicitly press "ניהול מערכת" in the sidebar.
    const workModes = available.filter((w) => w !== "admin");
    if (workModes.length >= 1) {
      if (workModes.includes("architect")) setWorkspaceState("architect");
      else setWorkspaceState(workModes[0]);
    } else {
      // Only admin role and nothing else — fall back to admin
      setWorkspaceState(available[0]);
    }
  }, [loading, isAdmin, available]);

  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w);
    try {
      localStorage.setItem(STORAGE_KEY, w);
    } catch {}
  }, []);

  const canSwitch = available.length > 1;

  const resolved = workspace ?? available[0] ?? null;
  const isResolvingWorkspace = !loading && available.length > 0 && resolved === null;

  return {
    workspace: resolved,
    setWorkspace,
    available,
    canSwitch,
    loading: loading || isResolvingWorkspace,
    isAdminWorkspace: resolved === "admin",
    // STRICT workspace flags — admin acting as a workspace switches by selection only.
    isAppraiserWorkspace: resolved === "appraiser",
    isArchitectWorkspace: resolved === "architect",
  };
}
