import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "appraiser" | "architect" | "admin";

export function useUserRoles() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        setRoles([]);
        setDisplayName("");
        setEmail("");
        return;
      }
      setEmail(auth.user.email ?? "");
      const meta: any = auth.user.user_metadata ?? {};
      setDisplayName(
        meta.display_name || meta.full_name || meta.name || (auth.user.email ?? "").split("@")[0]
      );
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", auth.user.id);
      setRoles((data ?? []).map((r: any) => r.role as AppRole));
    } catch (e) {
      console.error("useUserRoles load error", e);
      setRoles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    load();
    const { data: sub } = supabase.auth.onAuthStateChange((_event, _session) => {
      // Defer to avoid deadlock with the auth callback
      if (!mounted) return;
      setTimeout(() => {
        if (mounted) load();
      }, 0);
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const isAdmin = roles.includes("admin");
  const isArchitectRaw = roles.includes("architect");
  const isAppraiserRaw = roles.includes("appraiser");
  // Appraiser is true only if explicitly assigned, OR if admin (admin sees everything),
  // OR if user has no roles at all AND is not an architect (legacy default for old users).
  const isAppraiser = isAppraiserRaw || isAdmin || (roles.length === 0 && !isArchitectRaw);
  const isArchitect = isArchitectRaw || isAdmin;

  return {
    roles,
    loading,
    displayName,
    email,
    isAppraiser,
    isArchitect,
    isAdmin,
    reload: load,
  };
}
