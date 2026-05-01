import { useEffect, useState, useCallback, useMemo } from "react";
import { useUserRoles } from "@/hooks/useUserRoles";

export type Workspace = "appraiser" | "architect" | "admin";

const STORAGE_KEY = "active_workspace";

function readStored(): Workspace | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "appraiser" || v === "architect" || v === "admin") return v;
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
      list.push("admin", "appraiser", "architect");
    } else {
      if (roles.includes("appraiser")) list.push("appraiser");
      if (roles.includes("architect")) list.push("architect");
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
    // Default selection
    if (isAdmin) setWorkspaceState("admin");
    else if (available.length === 1) setWorkspaceState(available[0]);
    else if (available.includes("architect")) setWorkspaceState("architect");
    else setWorkspaceState(available[0]);
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
