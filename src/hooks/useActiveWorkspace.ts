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

  // Available workspaces for this user
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
    if (loading || available.length === 0) return;
    const stored = readStored();
    if (stored && available.includes(stored)) {
      setWorkspaceState(stored);
      return;
    }
    // Default: admin -> admin; single role -> that role
    if (isAdmin) setWorkspaceState("admin");
    else if (available.length === 1) setWorkspaceState(available[0]);
    else if (available.includes("appraiser")) setWorkspaceState("appraiser");
    else if (available.includes("architect")) setWorkspaceState("architect");
  }, [loading, isAdmin, available]);

  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w);
    try {
      localStorage.setItem(STORAGE_KEY, w);
    } catch {}
  }, []);

  const canSwitch = available.length > 1;

  // While loading or workspace not yet determined, treat as loading
  const resolved = workspace ?? (available[0] || "appraiser");

  return {
    workspace: resolved,
    setWorkspace,
    available,
    canSwitch,
    loading: loading || workspace === null,
    isAdminWorkspace: resolved === "admin",
    isAppraiserWorkspace: resolved === "appraiser" || (isAdmin && resolved === "admin"),
    isArchitectWorkspace: resolved === "architect" || (isAdmin && resolved === "admin"),
  };
}
