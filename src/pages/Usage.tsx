import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DollarSign, Activity, Mic, Sparkles, Download, ChevronDown, ChevronLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { serviceLabel } from "@/lib/serviceLabels";

interface UsageRow {
  id: string;
  user_id: string;
  event_type: string;
  service: string;
  quantity: number;
  unit: string;
  cost_usd: number;
  metadata: any;
  created_at: string;
}

interface Profile {
  user_id: string;
  display_name: string | null;
}

const RANGE_DAYS: Record<string, number> = {
  "7": 7,
  "30": 30,
  "90": 90,
  "365": 365,
};

const Usage = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [events, setEvents] = useState<UsageRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86400_000).toISOString();
    const [usageRes, profilesRes] = await Promise.all([
      supabase
        .from("usage_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("profiles").select("user_id, display_name"),
    ]);
    setEvents(usageRes.data || []);
    setProfiles(profilesRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, range]);

  const profileMap = useMemo(() => {
    const m = new Map<string, string>();
    profiles.forEach((p) => m.set(p.user_id, p.display_name || "ללא שם"));
    return m;
  }, [profiles]);

  // Aggregate per user
  const perUser = useMemo(() => {
    const map = new Map<
      string,
      {
        user_id: string;
        name: string;
        totalCost: number;
        events: number;
        transcriptionSec: number;
        aiTokens: number;
        byService: Record<string, { count: number; cost: number }>;
      }
    >();
    events.forEach((e) => {
      const cur = map.get(e.user_id) ?? {
        user_id: e.user_id,
        name: profileMap.get(e.user_id) || `${e.user_id.slice(0, 8)}...`,
        totalCost: 0,
        events: 0,
        transcriptionSec: 0,
        aiTokens: 0,
        byService: {},
      };
      cur.totalCost += Number(e.cost_usd);
      cur.events += 1;
      if (e.event_type === "transcription") cur.transcriptionSec += Number(e.quantity);
      if (e.event_type === "ai_summary") cur.aiTokens += Number(e.quantity);
      const s = cur.byService[e.service] ?? { count: 0, cost: 0 };
      s.count += 1;
      s.cost += Number(e.cost_usd);
      cur.byService[e.service] = s;
      map.set(e.user_id, cur);
    });
    return Array.from(map.values()).sort((a, b) => b.totalCost - a.totalCost);
  }, [events, profileMap]);

  const totals = useMemo(() => {
    return perUser.reduce(
      (acc, u) => ({
        cost: acc.cost + u.totalCost,
        events: acc.events + u.events,
        transcriptionMin: acc.transcriptionMin + u.transcriptionSec / 60,
        aiTokens: acc.aiTokens + u.aiTokens,
      }),
      { cost: 0, events: 0, transcriptionMin: 0, aiTokens: 0 },
    );
  }, [perUser]);

  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  const fmtMin = (sec: number) => `${(sec / 60).toFixed(1)} דק'`;

  const exportCsv = () => {
    const header = ["משתמש", "תאריך", "סוג", "שירות", "כמות", "יחידה", "עלות (USD)"];
    const rows = events.map((e) => [
      profileMap.get(e.user_id) || e.user_id,
      new Date(e.created_at).toLocaleString("he-IL"),
      e.event_type === "transcription" ? "תמלול" : "סיכום AI",
      serviceLabel(e.service),
      Number(e.quantity).toFixed(2),
      e.unit === "seconds" ? "שניות" : "טוקנים",
      Number(e.cost_usd).toFixed(6),
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `usage_${range}d.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (rolesLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <DollarSign className="h-6 w-6" />
              <div>
                <h1 className="text-2xl font-bold">צריכת שירותים ועלויות</h1>
                <p className="text-sm text-muted-foreground">מעקב עלויות AI לכל משתמש</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 ימים אחרונים</SelectItem>
                  <SelectItem value="30">30 ימים אחרונים</SelectItem>
                  <SelectItem value="90">90 ימים אחרונים</SelectItem>
                  <SelectItem value="365">שנה אחרונה</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCsv} disabled={events.length === 0}>
                <Download className="h-4 w-4 ml-2" />
                ייצוא CSV
              </Button>
            </div>
          </header>

          <div className="flex-1 p-6 space-y-6">
            {/* Totals */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">עלות כוללת</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-green-500" />
                  {fmtUsd(totals.cost)}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">סה"כ פעולות</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500" />
                  {totals.events}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">דקות תמלול</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Mic className="h-5 w-5 text-purple-500" />
                  {totals.transcriptionMin.toFixed(1)}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">טוקני AI</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-orange-500" />
                  {totals.aiTokens.toLocaleString("he-IL")}
                </div>
              </Card>
            </div>

            {/* Per-user breakdown */}
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : perUser.length === 0 ? (
              <Card className="p-12 text-center">
                <h3 className="text-lg font-semibold mb-2">אין שימוש בטווח שנבחר</h3>
                <p className="text-muted-foreground">ברגע שמשתמשים יבצעו תמלול או סיכום AI, השימוש יוצג כאן</p>
              </Card>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-right p-3"></th>
                        <th className="text-right p-3">משתמש</th>
                        <th className="text-right p-3">פעולות</th>
                        <th className="text-right p-3">דקות תמלול</th>
                        <th className="text-right p-3">טוקני AI</th>
                        <th className="text-right p-3">עלות כוללת</th>
                      </tr>
                    </thead>
                    <tbody>
                      {perUser.map((u) => {
                        const isOpen = expanded === u.user_id;
                        const userEvents = events.filter((e) => e.user_id === u.user_id);
                        return (
                          <>
                            <tr
                              key={u.user_id}
                              className="border-t border-border hover:bg-muted/50 cursor-pointer"
                              onClick={() => setExpanded(isOpen ? null : u.user_id)}
                            >
                              <td className="p-3 w-8">
                                {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
                              </td>
                              <td className="p-3 font-medium">{u.name}</td>
                              <td className="p-3">{u.events}</td>
                              <td className="p-3">{fmtMin(u.transcriptionSec)}</td>
                              <td className="p-3">{u.aiTokens.toLocaleString("he-IL")}</td>
                              <td className="p-3 font-bold text-green-600">{fmtUsd(u.totalCost)}</td>
                            </tr>
                            {isOpen && (
                              <tr key={`${u.user_id}-detail`} className="border-t border-border bg-muted/30">
                                <td colSpan={6} className="p-4">
                                  <div className="space-y-3">
                                    <div>
                                      <h4 className="font-semibold text-sm mb-2">פירוט לפי שירות</h4>
                                      <div className="flex gap-2 flex-wrap">
                                        {Object.entries(u.byService).map(([svc, info]) => (
                                          <Badge key={svc} variant="outline" className="gap-1">
                                            {serviceLabel(svc)}: {info.count} פעולות • {fmtUsd(info.cost)}
                                          </Badge>
                                        ))}
                                      </div>
                                    </div>
                                    <div>
                                      <h4 className="font-semibold text-sm mb-2">פעולות אחרונות ({userEvents.length})</h4>
                                      <div className="max-h-64 overflow-y-auto border rounded">
                                        <table className="w-full text-sm">
                                          <thead className="bg-background sticky top-0">
                                            <tr>
                                              <th className="text-right p-2">תאריך</th>
                                              <th className="text-right p-2">סוג</th>
                                              <th className="text-right p-2">שירות</th>
                                              <th className="text-right p-2">כמות</th>
                                              <th className="text-right p-2">עלות</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {userEvents.slice(0, 50).map((e) => (
                                              <tr key={e.id} className="border-t border-border">
                                                <td className="p-2">{new Date(e.created_at).toLocaleString("he-IL")}</td>
                                                <td className="p-2">{e.event_type === "transcription" ? "תמלול" : "סיכום AI"}</td>
                                                <td className="p-2">{serviceLabel(e.service)}</td>
                                                <td className="p-2">
                                                  {e.unit === "seconds"
                                                    ? `${(Number(e.quantity) / 60).toFixed(2)} דק'`
                                                    : `${Number(e.quantity).toLocaleString("he-IL")} טוקנים`}
                                                </td>
                                                <td className="p-2 font-medium">{fmtUsd(Number(e.cost_usd))}</td>
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Usage;
