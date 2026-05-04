import { useEffect, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { Loader2, Calendar, Mic, FolderOpen, Users, Shield, DollarSign, ClipboardList, FileText, LogOut, Headphones } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { supabase } from "@/integrations/supabase/client";
import Index from "./Index";

const RoleHome = () => {
  const { loading: rolesLoading, roles, isAdmin, displayName } = useUserRoles();
  const { workspace, loading: wsLoading, available, setWorkspace } = useActiveWorkspace();
  const navigate = useNavigate();

  if (rolesLoading || wsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // No roles means no workspace access. Never fall back to the appraiser/cases dashboard.
  if (!isAdmin && roles.length === 0) {
    return <NoRoleScreen />;
  }

  // Non-admin with both roles, no preference set yet -> selector
  if (!isAdmin && available.length > 1 && !localStorage.getItem("active_workspace")) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <div className="max-w-2xl w-full space-y-6">
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold">ברוך הבא{displayName ? `, ${displayName}` : ""}</h1>
            <p className="text-muted-foreground">בחר באיזו מערכת תרצה לעבוד עכשיו</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {available.includes("appraiser") && (
              <Card className="p-6 cursor-pointer hover:border-primary transition-colors"
                onClick={() => { setWorkspace("appraiser"); navigate("/cases"); }}>
                <FolderOpen className="h-8 w-8 text-primary mb-3" />
                <h2 className="text-xl font-semibold mb-1">מערכת שמאות</h2>
                <p className="text-sm text-muted-foreground mb-4">תיקים, לקוחות, הקלטות שטח ודוחות</p>
                <Button className="w-full">כניסה</Button>
              </Card>
            )}
            {available.includes("architect") && (
              <Card className="p-6 cursor-pointer hover:border-primary transition-colors"
                onClick={() => { setWorkspace("architect"); navigate("/meetings"); }}>
                <Calendar className="h-8 w-8 text-primary mb-3" />
                <h2 className="text-xl font-semibold mb-1">מערכת ניהול פגישות</h2>
                <p className="text-sm text-muted-foreground mb-4">פגישות, תמלולים וסיכומי AI</p>
                <Button className="w-full">כניסה</Button>
              </Card>
            )}
            {available.includes("transcriber") && (
              <Card className="p-6 cursor-pointer hover:border-primary transition-colors"
                onClick={() => { setWorkspace("transcriber"); navigate("/transcribe"); }}>
                <Headphones className="h-8 w-8 text-primary mb-3" />
                <h2 className="text-xl font-semibold mb-1">מערכת תמלול</h2>
                <p className="text-sm text-muted-foreground mb-4">העלאה / הקלטה — וקבלת תמלול מלא</p>
                <Button className="w-full">כניסה</Button>
              </Card>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Architect-only redirect
  if (workspace === "architect" && !isAdmin) {
    return <Navigate to="/meetings" replace />;
  }

  // Transcriber redirects straight to the transcribe page (no separate dashboard)
  if (workspace === "transcriber") {
    return <Navigate to="/transcribe" replace />;
  }

  if (workspace === "admin") {
    return <AdminOverview />;
  }

  if (workspace === "architect") {
    return <ArchitectDashboard />;
  }

  if (workspace === "appraiser") {
    return <Index />;
  }

  return <NoRoleScreen />;
};

function NoRoleScreen() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate("/auth", { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-6" dir="rtl">
      <Card className="w-full max-w-md p-6 text-center space-y-4">
        <Shield className="h-9 w-9 mx-auto text-muted-foreground" />
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">לא הוגדר תפקיד לחשבון הזה</h1>
          <p className="text-sm text-muted-foreground">
            מנהל המערכת צריך לשייך לחשבון תפקיד אדריכל או שמאי לפני כניסה למערכת.
          </p>
        </div>
        <Button variant="outline" onClick={handleLogout} className="w-full gap-2">
          <LogOut className="h-4 w-4" />
          יציאה
        </Button>
      </Card>
    </div>
  );
}

// ====== Architect dashboard ======
function ArchitectDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ total: 0, active: 0, withSummary: 0 });
  const [recent, setRecent] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("meetings")
        .select("id, title, client_name, meeting_date, status, ai_summary")
        .order("meeting_date", { ascending: false, nullsFirst: false })
        .limit(5);
      const all = await supabase.from("meetings").select("id, status, ai_summary");
      const list = all.data ?? [];
      setStats({
        total: list.length,
        active: list.filter((m: any) => m.status === "active").length,
        withSummary: list.filter((m: any) => m.ai_summary).length,
      });
      setRecent(data ?? []);
      setLoading(false);
    })();
  }, []);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
            <Calendar className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">דשבורד פגישות</h1>
          </header>
          <div className="flex-1 p-6 space-y-6 overflow-auto">
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin" />
            ) : (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <StatCard icon={Calendar} label="סך הפגישות" value={stats.total} />
                  <StatCard icon={Mic} label="פעילות" value={stats.active} />
                  <StatCard icon={ClipboardList} label="עם סיכום AI" value={stats.withSummary} />
                </div>
                <Card className="p-5">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="font-semibold">פגישות אחרונות</h2>
                    <Button size="sm" variant="outline" onClick={() => navigate("/meetings")}>כל הפגישות</Button>
                  </div>
                  {recent.length === 0 ? (
                    <p className="text-sm text-muted-foreground">אין פגישות עדיין.</p>
                  ) : (
                    <div className="space-y-2">
                      {recent.map((m) => (
                        <div key={m.id} onClick={() => navigate(`/meetings/${m.id}`)}
                          className="p-3 rounded-md border hover:border-primary cursor-pointer flex items-center justify-between">
                          <div>
                            <div className="font-medium">{m.title}</div>
                            <div className="text-xs text-muted-foreground">
                              {m.client_name ?? "ללא לקוח"} • {m.meeting_date ? new Date(m.meeting_date).toLocaleDateString("he-IL") : "ללא תאריך"}
                            </div>
                          </div>
                          {m.ai_summary && <ClipboardList className="h-4 w-4 text-primary" />}
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              </>
            )}
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

// ====== Admin overview ======
function AdminOverview() {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ users: 0, meetings: 0, cases: 0, recordings: 0 });

  useEffect(() => {
    (async () => {
      const [u, m, c, r] = await Promise.all([
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("meetings").select("id", { count: "exact", head: true }),
        supabase.from("cases").select("id", { count: "exact", head: true }),
        supabase.from("recordings").select("id", { count: "exact", head: true }),
      ]);
      setCounts({
        users: u.count ?? 0,
        meetings: m.count ?? 0,
        cases: c.count ?? 0,
        recordings: r.count ?? 0,
      });
    })();
  }, []);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
            <Shield className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">סקירת מערכת</h1>
          </header>
          <div className="flex-1 p-6 space-y-6 overflow-auto">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard icon={Users} label="משתמשים" value={counts.users} />
              <StatCard icon={FolderOpen} label="תיקי שומה" value={counts.cases} />
              <StatCard icon={Calendar} label="פגישות" value={counts.meetings} />
              <StatCard icon={Mic} label="הקלטות" value={counts.recordings} />
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <ShortcutCard icon={Shield} title="ניהול משתמשים" desc="צור משתמשים, הקצה תפקידים" onClick={() => navigate("/admin")} />
              <ShortcutCard icon={DollarSign} title="צריכה ועלויות" desc="עקוב אחרי שימוש בשירותי AI" onClick={() => navigate("/usage")} />
              <ShortcutCard icon={FileText} title="הגדרות מערכת" desc="חיבור Drive, פרופיל" onClick={() => navigate("/settings")} />
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: any; label: string; value: number }) {
  return (
    <Card className="p-4 flex items-center gap-3">
      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <div className="text-2xl font-bold">{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </div>
    </Card>
  );
}

function ShortcutCard({ icon: Icon, title, desc, onClick }: { icon: any; title: string; desc: string; onClick: () => void }) {
  return (
    <Card className="p-5 cursor-pointer hover:border-primary transition-colors" onClick={onClick}>
      <Icon className="h-6 w-6 text-primary mb-2" />
      <div className="font-semibold mb-1">{title}</div>
      <div className="text-sm text-muted-foreground">{desc}</div>
    </Card>
  );
}

export default RoleHome;
