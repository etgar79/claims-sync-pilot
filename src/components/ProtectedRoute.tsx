import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * If provided, only users with at least one of these roles can access.
   * Admin always has access regardless of this list.
   */
  allow?: AppRole[];
}

export function ProtectedRoute({ children, allow }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { loading: rolesLoading, isAdmin, isAppraiser, isArchitect } = useUserRoles();

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, sess) => {
      setSession(sess);
    });
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (loading || (session && allow && rolesLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;

  if (allow && allow.length > 0) {
    const roleMap: Record<AppRole, boolean> = {
      admin: isAdmin,
      appraiser: isAppraiser,
      architect: isArchitect,
    };
    const hasAccess = isAdmin || allow.some((r) => roleMap[r]);
    if (!hasAccess) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
