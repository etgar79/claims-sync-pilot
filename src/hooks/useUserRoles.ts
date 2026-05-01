import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "appraiser" | "architect" | "admin";

export function useUserRoles() {
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      setRoles([]);
      setLoading(false);
      return;
    }
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

  return {
    roles,
    loading,
    isAppraiser: roles.includes("appraiser") || roles.length === 0,
    isArchitect: roles.includes("architect"),
    isAdmin: roles.includes("admin"),
    reload: load,
  };
}
