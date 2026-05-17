// Admin overview dashboard — table of all users with their data counts.
// Click a row to switch into "act as that user" mode.

import { useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Loader2,
  Users,
  Search,
  Shield,
  Briefcase,
  Building2,
  Mic,
  UserCog,
  AlertTriangle,
  ExternalLink,
  ArrowUpDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { setActAs } from "@/lib/actAs";
import { toast } from "sonner";

interface Row {
  user_id: string;
  name: string;
  roles: AppRole[];
  cases: number;
  meetings: number;
  recordings: number;
  transcripts: number;
  tasksOpen: number;
  lastActivity: string | null;
  errors: number;
}

const ROLE_META: Record<AppRole, { label: string; icon: any; cls: string }> = {
  appraiser: { label: "שמאי", icon: Briefcase, cls: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  architect: { label: "אדריכל", icon: Building2, cls: "bg-purple-500/10 text-purple-700 border-purple-500/30" },
  admin: { label: "מנהל", icon: Shield, cls: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
  transcriber: { label: "תמלול", icon: Mic, cls: "bg-emerald-500/10 text-emerald-700 border-emerald-500/30" },
};

type SortKey = "name" | "cases" | "meetings" | "recordings" | "transcripts" | "tasksOpen" | "errors" | "lastActivity";

const AdminOverview = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("lastActivity");
  const [sortAsc, setSortAsc] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [profiles, roles, cases, meetings, recordings, mrecs, tasks, logs] = await Promise.all([
        supabase.from("profiles").select("user_id, display_name"),
        supabase.from("user_roles").select("user_id, role"),
        supabase.from("cases").select("user_id, updated_at"),
        supabase.from("meetings").select("user_id, updated_at"),
        supabase.from("recordings").select("user_id, transcript, recorded_at"),
        supabase.from("meeting_recordings").select("user_id, transcript, recorded_at"),
        supabase.from("tasks").select("user_id, status"),
        supabase
          .from("system_logs")
          .select("user_id, level, created_at")
          .eq("level", "error")
          .gte("created_at", new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()),
      ]);

      const map = new Map<string, Row>();
      (profiles.data ?? []).forEach((p: any) => {
        map.set(p.user_id, {
          user_id: p.user_id,
          name: p.display_name || "ללא שם",
          roles: [],
          cases: 0,
          meetings: 0,
          recordings: 0,
          transcripts: 0,
          tasksOpen: 0,
          lastActivity: null,
          errors: 0,
        });
      });

      const touch = (uid: string, ts?: string | null) => {
        const r = map.get(uid);
        if (!r) return;
        if (ts && (!r.lastActivity || ts > r.lastActivity)) r.lastActivity = ts;
      };

      (roles.data ?? []).forEach((r: any) => {
        const u = map.get(r.user_id);
        if (u && !u.roles.includes(r.role)) u.roles.push(r.role);
      });
      (cases.data ?? []).forEach((x: any) => {
        const u = map.get(x.user_id);
        if (u) u.cases++;
        touch(x.user_id, x.updated_at);
      });
      (meetings.data ?? []).forEach((x: any) => {
        const u = map.get(x.user_id);
        if (u) u.meetings++;
        touch(x.user_id, x.updated_at);
      });
      (recordings.data ?? []).forEach((x: any) => {
        const u = map.get(x.user_id);
        if (!u) return;
        u.recordings++;
        if (x.transcript) u.transcripts++;
        touch(x.user_id, x.recorded_at);
      });
      (mrecs.data ?? []).forEach((x: any) => {
        const u = map.get(x.user_id);
        if (!u) return;
        u.recordings++;
        if (x.transcript) u.transcripts++;
        touch(x.user_id, x.recorded_at);
      });
      (tasks.data ?? []).forEach((x: any) => {
        const u = map.get(x.user_id);
        if (!u) return;
        if (x.status === "pending" || x.status === "in_progress") u.tasksOpen++;
      });
      (logs.data ?? []).forEach((x: any) => {
        if (!x.user_id) return;
        const u = map.get(x.user_id);
        if (u) u.errors++;
      });

      setRows(Array.from(map.values()));
    } catch (e) {
      console.error(e);
      toast.error("שגיאה בטעינת סקירת המשתמשים");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = q
      ? rows.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.user_id.toLowerCase().includes(q) ||
            r.roles.some((role) => ROLE_META[role]?.label.includes(q))
        )
      : rows;
    const sorted = [...base].sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (sortKey === "name") {
        va = (va ?? "").toString();
        vb = (vb ?? "").toString();
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      if (sortKey === "lastActivity") {
        va = va ?? "";
        vb = vb ?? "";
        return sortAsc ? va.localeCompare(vb) : vb.localeCompare(va);
      }
      const na = Number(va ?? 0);
      const nb = Number(vb ?? 0);
      return sortAsc ? na - nb : nb - na;
    });
    return sorted;
  }, [rows, search, sortKey, sortAsc]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortAsc(!sortAsc);
    else {
      setSortKey(key);
      setSortAsc(false);
    }
  };

  const handleActAs = (r: Row) => {
    setActAs(r.user_id, r.name);
    toast.success(`כעת אתה צופה בנתונים של ${r.name}`);
    navigate("/");
  };

  if (rolesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  const totals = rows.reduce(
    (acc, r) => ({
      users: acc.users + 1,
      cases: acc.cases + r.cases,
      meetings: acc.meetings + r.meetings,
      recordings: acc.recordings + r.recordings,
      errors: acc.errors + r.errors,
    }),
    { users: 0, cases: 0, meetings: 0, recordings: 0, errors: 0 }
  );

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-b from-background via-background to-primary/[0.02]">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-3 sticky top-0 z-20">
            <SidebarTrigger />
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Users className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold leading-tight">סקירת משתמשים</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">
                כל המשתמשים במערכת זה ליד זה — נתוני שימוש ושגיאות מהשבוע האחרון
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => navigate("/admin/users")}>
              <ExternalLink className="h-4 w-4 ml-1" /> תוכן לפי משתמש
            </Button>
          </header>

          <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <Stat label="משתמשים" value={totals.users} />
              <Stat label="תיקים" value={totals.cases} />
              <Stat label="פגישות" value={totals.meetings} />
              <Stat label="הקלטות" value={totals.recordings} />
              <Stat label="שגיאות 7 ימים" value={totals.errors} alert={totals.errors > 0} />
            </div>

            <Card className="p-3">
              <div className="relative mb-3">
                <Search className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="חיפוש לפי שם, מזהה, או תפקיד..."
                  className="pr-8 h-9"
                />
              </div>

              {loading ? (
                <div className="py-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                </div>
              ) : (
                <div className="rounded-lg border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>
                          <SortBtn k="name" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            משתמש
                          </SortBtn>
                        </TableHead>
                        <TableHead>תפקידים</TableHead>
                        <TableHead className="text-center">
                          <SortBtn k="cases" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            תיקים
                          </SortBtn>
                        </TableHead>
                        <TableHead className="text-center">
                          <SortBtn k="meetings" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            פגישות
                          </SortBtn>
                        </TableHead>
                        <TableHead className="text-center">
                          <SortBtn k="recordings" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            הקלטות
                          </SortBtn>
                        </TableHead>
                        <TableHead className="text-center">
                          <SortBtn k="transcripts" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            תמלולים
                          </SortBtn>
                        </TableHead>
                        <TableHead className="text-center">
                          <SortBtn k="tasksOpen" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            משימות
                          </SortBtn>
                        </TableHead>
                        <TableHead className="text-center">
                          <SortBtn k="errors" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            שגיאות
                          </SortBtn>
                        </TableHead>
                        <TableHead>
                          <SortBtn k="lastActivity" sortKey={sortKey} asc={sortAsc} onClick={handleSort}>
                            פעילות אחרונה
                          </SortBtn>
                        </TableHead>
                        <TableHead className="w-10" />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                            אין משתמשים תואמים
                          </TableCell>
                        </TableRow>
                      ) : (
                        filtered.map((r) => (
                          <TableRow
                            key={r.user_id}
                            className="cursor-pointer hover:bg-muted/40"
                            onClick={() => handleActAs(r)}
                          >
                            <TableCell>
                              <div className="font-medium text-sm">{r.name}</div>
                              <div className="text-[10px] text-muted-foreground font-mono truncate max-w-[160px]">
                                {r.user_id}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1 flex-wrap">
                                {r.roles.length === 0 && (
                                  <span className="text-[11px] text-muted-foreground">—</span>
                                )}
                                {r.roles.map((role) => {
                                  const m = ROLE_META[role];
                                  if (!m) return null;
                                  return (
                                    <Badge
                                      key={role}
                                      variant="outline"
                                      className={`text-[10px] h-5 px-1.5 gap-0.5 ${m.cls}`}
                                    >
                                      <m.icon className="h-2.5 w-2.5" />
                                      {m.label}
                                    </Badge>
                                  );
                                })}
                              </div>
                            </TableCell>
                            <TableCell className="text-center font-medium">{r.cases || ""}</TableCell>
                            <TableCell className="text-center font-medium">{r.meetings || ""}</TableCell>
                            <TableCell className="text-center font-medium">{r.recordings || ""}</TableCell>
                            <TableCell className="text-center font-medium">{r.transcripts || ""}</TableCell>
                            <TableCell className="text-center font-medium">{r.tasksOpen || ""}</TableCell>
                            <TableCell className="text-center">
                              {r.errors > 0 ? (
                                <Badge variant="outline" className="bg-red-500/10 text-red-700 border-red-500/30 gap-1">
                                  <AlertTriangle className="h-2.5 w-2.5" />
                                  {r.errors}
                                </Badge>
                              ) : null}
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">
                              {r.lastActivity
                                ? new Date(r.lastActivity).toLocaleDateString("he-IL", {
                                    day: "2-digit",
                                    month: "2-digit",
                                    year: "2-digit",
                                  })
                                : "—"}
                            </TableCell>
                            <TableCell>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-7 w-7"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleActAs(r);
                                }}
                                title="פעל כמשתמש זה"
                              >
                                <UserCog className="h-3.5 w-3.5" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

function Stat({ label, value, alert }: { label: string; value: number; alert?: boolean }) {
  return (
    <Card className={`p-3 ${alert ? "border-red-500/40 bg-red-500/5" : ""}`}>
      <div className={`text-2xl font-bold ${alert ? "text-red-700" : ""}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </Card>
  );
}

function SortBtn({
  k,
  sortKey,
  asc,
  onClick,
  children,
}: {
  k: SortKey;
  sortKey: SortKey;
  asc: boolean;
  onClick: (k: SortKey) => void;
  children: React.ReactNode;
}) {
  const active = sortKey === k;
  return (
    <button
      type="button"
      onClick={() => onClick(k)}
      className={`inline-flex items-center gap-1 text-xs font-semibold hover:text-primary transition-colors ${
        active ? "text-primary" : ""
      }`}
    >
      {children}
      <ArrowUpDown className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      {active && <span className="text-[9px]">{asc ? "↑" : "↓"}</span>}
    </button>
  );
}

export default AdminOverview;
