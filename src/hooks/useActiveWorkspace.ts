import { useEffect, useState, useCallback } from "react";
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
  const [workspace, setWorkspaceState] = useState<Workspace>("appraiser");

  // Available workspaces for this user
  const available: Workspace[] = [];
  if (isAdmin) {
    available.push("admin", "appraiser", "architect");
  } else {
    if (roles.includes("appraiser")) available.push("appraiser");
    if (roles.includes("architect")) available.push("architect");
  }

  useEffect(() => {
    if (loading) return;
    const stored = readStored();
    if (stored && available.includes(stored)) {
      setWorkspaceState(stored);
      return;
    }
    // Default: admin -> admin; pure architect -> architect; otherwise appraiser
    if (isAdmin) setWorkspaceState("admin");
    else if (available.length === 1) setWorkspaceState(available[0]);
    else if (available.includes("appraiser")) setWorkspaceState("appraiser");
    else if (available.includes("architect")) setWorkspaceState("architect");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isAdmin, roles.join(",")]);

  const setWorkspace = useCallback((w: Workspace) => {
    setWorkspaceState(w);
    try {
      localStorage.setItem(STORAGE_KEY, w);
    } catch {}
  }, []);

  const canSwitch = available.length > 1;

  return {
    workspace,
    setWorkspace,
    available,
    canSwitch,
    loading,
    isAdminWorkspace: workspace === "admin",
    isAppraiserWorkspace: workspace === "appraiser" || (isAdmin && workspace === "admin"),
    isArchitectWorkspace: workspace === "architect" || (isAdmin && workspace === "admin"),
  };
}
