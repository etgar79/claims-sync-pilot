import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "appraiser" | "architect" | "admin";

export function useUserRoles() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [displayName, setDisplayName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setRoles([]);
      setDisplayName("");
      setEmail("");
      setLoading(false);
      return;
    }
    setEmail(auth.user.email ?? "");
    const meta: any = auth.user.user_metadata ?? {};
    setDisplayName(meta.display_name || meta.full_name || meta.name || (auth.user.email ?? "").split("@")[0]);
    const { data } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", auth.user.id);
    setRoles((data ?? []).map((r: any) => r.role as AppRole));
    setLoading(false);
  };

  useEffect(() => {
    load();
    const { data: sub } = supabase.auth.onAuthStateChange(() => load());
    return () => sub.subscription.unsubscribe();
  }, []);

  const isAdmin = roles.includes("admin");
  const isArchitect = roles.includes("architect");
  // Appraiser is true only if explicitly assigned, OR if admin (admin sees everything),
  // OR if user has no roles at all AND is not an architect (legacy default for old users).
  const isAppraiser = roles.includes("appraiser") || isAdmin || (roles.length === 0 && !isArchitect);

  return {
    roles,
    loading,
    displayName,
    email,
    isAppraiser,
    isArchitect: isArchitect || isAdmin,
    isAdmin,
    reload: load,
  };
}
