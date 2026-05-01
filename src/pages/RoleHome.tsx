import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, FolderOpen, Calendar } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import Index from "./Index";

const RoleHome = () => {
  const { loading, roles, isArchitect, isAppraiser, isAdmin } = useUserRoles();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Pure architect - go to meetings
  const onlyArchitect = roles.includes("architect") && !roles.includes("appraiser") && !isAdmin;
  if (onlyArchitect) {
    return <Navigate to="/meetings" replace />;
  }

  // User has both explicit roles → show selector
  const hasBoth = roles.includes("architect") && roles.includes("appraiser");
  if (hasBoth && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">ברוך הבא</h1>
            <p className="text-muted-foreground">בחר באיזו מערכת תרצה לעבוד עכשיו</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Card
              className="p-6 cursor-pointer hover:border-primary transition-colors"
              onClick={() => navigate("/cases")}
            >
              <FolderOpen className="h-8 w-8 text-primary mb-3" />
              <h2 className="text-xl font-semibold mb-1">ניהול תיקים</h2>
              <p className="text-sm text-muted-foreground mb-4">
                שמאות - תיקים, לקוחות, הקלטות ודוחות
              </p>
              <Button className="w-full">כניסה</Button>
            </Card>
            <Card
              className="p-6 cursor-pointer hover:border-primary transition-colors"
              onClick={() => navigate("/meetings")}
            >
              <Calendar className="h-8 w-8 text-primary mb-3" />
              <h2 className="text-xl font-semibold mb-1">ניהול פגישות</h2>
              <p className="text-sm text-muted-foreground mb-4">
                אדריכלות - פגישות, תמלולים וסיכומי AI
              </p>
              <Button className="w-full">כניסה</Button>
            </Card>
          </div>
        </div>
      </div>
    );
  }

  // Admin & Appraiser - cases dashboard
  if (isAdmin || isAppraiser) {
    return <Index />;
  }

  // Fallback (architect via isArchitect including admin)
  if (isArchitect) {
    return <Navigate to="/meetings" replace />;
  }

  return <Index />;
};

export default RoleHome;
