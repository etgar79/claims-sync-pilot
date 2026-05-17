import { useEffect, useMemo, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, DollarSign, Activity, Mic, Sparkles, Download, ChevronDown, ChevronLeft, Tag, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { serviceLabel } from "@/lib/serviceLabels";
import { fmtIls, usdToIls } from "@/lib/currency";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface UsageRow {
  id: string;
  user_id: string;
  event_type: string;
  service: string;
  quantity: number;
  unit: string;
  cost_usd: number;
  billable_usd: number;
  metadata: any;
  created_at: string;
}

interface Profile {
  user_id: string;
  display_name: string | null;
}

const RANGE_DAYS: Record<string, number> = { "7": 7, "30": 30, "90": 90, "365": 365 };

const Usage = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [events, setEvents] = useState<UsageRow[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState("30");
  const [userFilter, setUserFilter] = useState<string>("all");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [platformFee, setPlatformFee] = useState(0);

  const load = async () => {
    setLoading(true);
    const since = new Date(Date.now() - RANGE_DAYS[range] * 86400_000).toISOString();
    const [usageRes, profilesRes, settingsRes] = await Promise.all([
      supabase
        .from("usage_events")
        .select("*")
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(5000),
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("app_settings").select("platform_monthly_fee_usd").eq("id", true).maybeSingle(),
    ]);
    setEvents(usageRes.data || []);
    setProfiles(profilesRes.data || []);
    setPlatformFee(Number(settingsRes.data?.platform_monthly_fee_usd ?? 0));
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

  const filteredEvents = useMemo(
    () => (userFilter === "all" ? events : events.filter((e) => e.user_id === userFilter)),
    [events, userFilter],
  );

  // Aggregate per user
  const perUser = useMemo(() => {
    const map = new Map<string, {
      user_id: string;
      name: string;
      totalCost: number;
      totalBillable: number;
      platformFeeTotal: number;
      activeMonths: number;
      events: number;
      transcriptionSec: number;
      aiTokens: number;
      byService: Record<string, { count: number; cost: number; billable: number }>;
      _months: Set<string>;
    }>();
    filteredEvents.forEach((e) => {
      const cur = map.get(e.user_id) ?? {
        user_id: e.user_id,
        name: profileMap.get(e.user_id) || `${e.user_id.slice(0, 8)}...`,
        totalCost: 0,
        totalBillable: 0,
        platformFeeTotal: 0,
        activeMonths: 0,
        events: 0,
        transcriptionSec: 0,
        aiTokens: 0,
        byService: {},
        _months: new Set<string>(),
      };
      cur.totalCost += Number(e.cost_usd);
      cur.totalBillable += Number(e.billable_usd ?? e.cost_usd);
      cur.events += 1;
      if (e.unit === "seconds") cur.transcriptionSec += Number(e.quantity);
      if (e.unit === "tokens") cur.aiTokens += Number(e.quantity);
      const d = new Date(e.created_at);
      cur._months.add(`${d.getFullYear()}-${d.getMonth() + 1}`);
      const s = cur.byService[e.service] ?? { count: 0, cost: 0, billable: 0 };
      s.count += 1;
      s.cost += Number(e.cost_usd);
      s.billable += Number(e.billable_usd ?? e.cost_usd);
      cur.byService[e.service] = s;
      map.set(e.user_id, cur);
    });
    // apply platform fee per active month
    map.forEach((u) => {
      u.activeMonths = u._months.size;
      u.platformFeeTotal = u.activeMonths * platformFee;
      u.totalBillable += u.platformFeeTotal;
    });
    return Array.from(map.values()).sort((a, b) => b.totalBillable - a.totalBillable);
  }, [filteredEvents, profileMap, platformFee]);

  const totals = useMemo(() => {
    return perUser.reduce(
      (acc, u) => ({
        cost: acc.cost + u.totalCost,
        billable: acc.billable + u.totalBillable,
        events: acc.events + u.events,
        transcriptionMin: acc.transcriptionMin + u.transcriptionSec / 60,
        aiTokens: acc.aiTokens + u.aiTokens,
      }),
      { cost: 0, billable: 0, events: 0, transcriptionMin: 0, aiTokens: 0 },
    );
  }, [perUser]);

  // Monthly chart data: bars per user per month
  const chartData = useMemo(() => {
    const byMonth = new Map<string, Record<string, number>>();
    filteredEvents.forEach((e) => {
      const d = new Date(e.created_at);
      const month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const name = profileMap.get(e.user_id) || `${e.user_id.slice(0, 6)}`;
      const m = byMonth.get(month) ?? {};
      m[name] = (m[name] ?? 0) + Number(e.billable_usd ?? e.cost_usd);
      byMonth.set(month, m);
    });
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, vals]) => ({ month, ...vals }));
  }, [filteredEvents, profileMap]);
  const topUserNames = useMemo(() => perUser.slice(0, 5).map((u) => u.name), [perUser]);

  const fmtUsd = (n: number) => `$${n.toFixed(4)}`;
  const fmtMin = (sec: number) => `${(sec / 60).toFixed(1)} דק'`;

  const exportCsv = () => {
    const header = ["משתמש", "תאריך", "סוג", "שירות", "כמות", "יחידה", "עלות גלם (USD)", "לחיוב (USD)"];
    const rows = filteredEvents.map((e) => [
      profileMap.get(e.user_id) || e.user_id,
      new Date(e.created_at).toLocaleString("he-IL"),
      e.event_type,
      serviceLabel(e.service),
      Number(e.quantity).toFixed(2),
      e.unit,
      Number(e.cost_usd).toFixed(6),
      Number(e.billable_usd ?? e.cost_usd).toFixed(6),
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

  const exportInvoice = (userId: string) => {
    const u = perUser.find((p) => p.user_id === userId);
    if (!u) return;
    const userEvents = filteredEvents.filter((e) => e.user_id === userId);
    const lines: string[] = [];
    lines.push(`חשבונית טיוטה — ${u.name}`);
    lines.push(`טווח: ${RANGE_DAYS[range]} ימים אחרונים`);
    lines.push("");
    lines.push("פירוט לפי שירות:");
    Object.entries(u.byService).forEach(([svc, info]) => {
      lines.push(`  ${serviceLabel(svc)}: ${info.count} פעולות — לחיוב $${info.billable.toFixed(4)} (עלות גלם $${info.cost.toFixed(4)})`);
    });
    lines.push("");
    lines.push(`סה"כ עלות גלם: $${u.totalCost.toFixed(4)}`);
    lines.push(`סה"כ לחיוב:   $${u.totalBillable.toFixed(4)}`);
    lines.push("");
    lines.push("פעולות:");
    userEvents.forEach((e) => {
      lines.push(`  ${new Date(e.created_at).toLocaleString("he-IL")} | ${serviceLabel(e.service)} | ${Number(e.quantity).toFixed(2)} ${e.unit} | $${Number(e.billable_usd ?? e.cost_usd).toFixed(6)}`);
    });
    const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoice_${u.name}_${range}d.txt`;
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
          <header className="flex items-center justify-between border-b border-border bg-card p-4 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <DollarSign className="h-6 w-6" />
              <div>
                <h1 className="text-2xl font-bold">צריכה ועלויות אמיתיות</h1>
                <p className="text-sm text-muted-foreground">עלות גלם ולחיוב לפי יוזר — מבוסס על המחירים שב-<Link to="/admin/pricing" className="underline">ניהול תמחור</Link></p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל המשתמשים</SelectItem>
                  {profiles.map((p) => (
                    <SelectItem key={p.user_id} value={p.user_id}>{p.display_name || p.user_id.slice(0, 8)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={range} onValueChange={setRange}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="7">7 ימים</SelectItem>
                  <SelectItem value="30">30 ימים</SelectItem>
                  <SelectItem value="90">90 ימים</SelectItem>
                  <SelectItem value="365">שנה</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={exportCsv} disabled={filteredEvents.length === 0}>
                <Download className="h-4 w-4 ml-2" /> CSV
              </Button>
              <Link to="/admin/pricing">
                <Button variant="outline"><Tag className="h-4 w-4 ml-2" /> מחירים</Button>
              </Link>
            </div>
          </header>

          <div className="flex-1 p-6 space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">עלות גלם</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <DollarSign className="h-5 w-5 text-muted-foreground" />
                  {fmtUsd(totals.cost)}
                </div>
              </Card>
              <Card className="p-4 ring-2 ring-primary/30">
                <div className="text-sm text-muted-foreground">לחיוב (כולל רווח{platformFee > 0 ? " + מנוי" : ""})</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-green-600" />
                  {fmtUsd(totals.billable)}
                </div>
                {platformFee > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">+${platformFee.toFixed(2)}/יוזר/חודש דמי מנוי</div>
                )}
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">פעולות</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2"><Activity className="h-5 w-5 text-blue-500" />{totals.events}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">דקות תמלול</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2"><Mic className="h-5 w-5 text-purple-500" />{totals.transcriptionMin.toFixed(1)}</div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">טוקני AI</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2"><Sparkles className="h-5 w-5 text-orange-500" />{totals.aiTokens.toLocaleString("he-IL")}</div>
              </Card>
            </div>

            {chartData.length > 0 && (
              <Card className="p-4">
                <h3 className="text-sm font-semibold mb-3">לחיוב לפי חודש (5 יוזרים מובילים)</h3>
                <div style={{ width: "100%", height: 260 }}>
                  <ResponsiveContainer>
                    <BarChart data={chartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" />
                      <YAxis tickFormatter={(v) => `$${Number(v).toFixed(2)}`} />
                      <Tooltip formatter={(v: number) => `$${Number(v).toFixed(4)}`} />
                      <Legend />
                      {topUserNames.map((name, i) => (
                        <Bar key={name} dataKey={name} stackId="a" fill={`hsl(${(i * 67) % 360} 70% 50%)`} />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            )}

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : perUser.length === 0 ? (
              <Card className="p-12 text-center">
                <h3 className="text-lg font-semibold mb-2">אין שימוש בטווח שנבחר</h3>
                <p className="text-muted-foreground">ברגע שמשתמשים יבצעו תמלול או סיכום, השימוש יוצג כאן</p>
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
                        <th className="text-right p-3">עלות גלם</th>
                        <th className="text-right p-3">לחיוב</th>
                        <th className="text-right p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {perUser.map((u) => {
                        const isOpen = expanded === u.user_id;
                        const userEvents = filteredEvents.filter((e) => e.user_id === u.user_id);
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
                              <td className="p-3 text-muted-foreground">{fmtUsd(u.totalCost)}</td>
                              <td className="p-3 font-bold text-green-600">{fmtUsd(u.totalBillable)}</td>
                              <td className="p-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(ev) => { ev.stopPropagation(); exportInvoice(u.user_id); }}
                                >
                                  <Receipt className="h-3 w-3 ml-1" /> חשבונית
                                </Button>
                              </td>
                            </tr>
                            {isOpen && (
                              <tr key={`${u.user_id}-detail`} className="border-t border-border bg-muted/30">
                                <td colSpan={8} className="p-4">
                                  <div className="space-y-3">
                                    <div>
                                      <h4 className="font-semibold text-sm mb-2">פירוט לפי שירות</h4>
                                      <div className="flex gap-2 flex-wrap">
                                        {Object.entries(u.byService).map(([svc, info]) => (
                                          <Badge key={svc} variant="outline" className="gap-1">
                                            {serviceLabel(svc)}: {info.count} • לחיוב {fmtUsd(info.billable)}
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
                                              <th className="text-right p-2">לחיוב</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {userEvents.slice(0, 50).map((e) => (
                                              <tr key={e.id} className="border-t border-border">
                                                <td className="p-2">{new Date(e.created_at).toLocaleString("he-IL")}</td>
                                                <td className="p-2">{e.event_type}</td>
                                                <td className="p-2">{serviceLabel(e.service)}</td>
                                                <td className="p-2">
                                                  {e.unit === "seconds"
                                                    ? `${(Number(e.quantity) / 60).toFixed(2)} דק'`
                                                    : `${Number(e.quantity).toLocaleString("he-IL")} ${e.unit}`}
                                                </td>
                                                <td className="p-2 text-muted-foreground">{fmtUsd(Number(e.cost_usd))}</td>
                                                <td className="p-2 font-medium text-green-700">{fmtUsd(Number(e.billable_usd ?? e.cost_usd))}</td>
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
