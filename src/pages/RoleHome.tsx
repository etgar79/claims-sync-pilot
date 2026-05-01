import { Navigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import Index from "./Index";

const RoleHome = () => {
  const { loading, isArchitect, isAppraiser, isAdmin } = useUserRoles();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Admin & Appraiser - go to the cases dashboard (Index)
  if (isAdmin || isAppraiser) {
    return <Index />;
  }

  // Pure Architect - go to meetings
  if (isArchitect) {
    return <Navigate to="/meetings" replace />;
  }

  // Fallback
  return <Index />;
};

export default RoleHome;
