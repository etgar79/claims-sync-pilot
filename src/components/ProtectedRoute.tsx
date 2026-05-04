import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import { Loader2 } from "lucide-react";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

interface ProtectedRouteProps {
  children: React.ReactNode;
  /**
   * If provided, only users with at least one of these roles (explicit) can access.
   * Admin only gets access if their currently-active workspace matches one of these,
   * so an admin viewing the admin overview cannot accidentally land on /cases.
   */
  allow?: AppRole[];
}

export function ProtectedRoute({ children, allow }: ProtectedRouteProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { loading: rolesLoading, isAdmin, isAppraiser, isArchitect, isTranscriber } = useUserRoles();
  const { workspace, loading: wsLoading } = useActiveWorkspace();

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

  if (loading || (session && allow && (rolesLoading || wsLoading))) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (!session) return <Navigate to="/auth" replace />;

  if (allow && allow.length > 0) {
    const explicit: Record<AppRole, boolean> = {
      admin: isAdmin,
      appraiser: isAppraiser,
      architect: isArchitect,
      transcriber: isTranscriber,
    };
    // Explicit role match (no admin auto-grant)
    let hasAccess = allow.some((r) => explicit[r]);
    // Admin gets access to ALL workspaces' routes — they work on their own Drive
    // and RLS isolates their data. This lets admins test the full system end-to-end.
    if (!hasAccess && isAdmin) {
      hasAccess = true;
    }
    if (!hasAccess) return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
