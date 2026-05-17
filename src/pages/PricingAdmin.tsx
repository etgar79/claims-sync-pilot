import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Tag, Plus, Save, Trash2, Percent, Building2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { serviceLabel } from "@/lib/serviceLabels";
import { usdToIls, ilsToUsd, USD_TO_ILS } from "@/lib/currency";
import { toast } from "sonner";

interface PricingRow {
  id: string;
  service: string;
  unit: string;
  cost_per_unit_usd: number;
  markup_pct: number;
  is_active: boolean;
  effective_from: string;
  notes: string | null;
}

const UNIT_LABELS: Record<string, string> = {
  seconds: "שניות (אודיו)",
  input_tokens: "טוקני קלט",
  output_tokens: "טוקני פלט",
  tokens: "טוקנים",
  versions: "גרסאות",
};

const PricingAdmin = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [rows, setRows] = useState<PricingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState<Record<string, Partial<PricingRow>>>({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ service: "", unit: "seconds", cost: "", markup: "0" });
  const [bulkMarkup, setBulkMarkup] = useState("");
  const [platformFee, setPlatformFee] = useState("0");
  const [savingFee, setSavingFee] = useState(false);
  const [savingBulk, setSavingBulk] = useState(false);
  const [calcCost, setCalcCost] = useState("40");
  const [calcUsers, setCalcUsers] = useState("10");
  const [calcRecover, setCalcRecover] = useState("50");

  const load = async () => {
    setLoading(true);
    const [pricingRes, settingsRes] = await Promise.all([
      supabase
        .from("service_pricing")
        .select("*")
        .order("service")
        .order("unit")
        .order("effective_from", { ascending: false }),
      supabase.from("app_settings").select("platform_monthly_fee_usd").eq("id", true).maybeSingle(),
    ]);
    if (pricingRes.error) toast.error("שגיאה בטעינה: " + pricingRes.error.message);
    setRows(pricingRes.data ?? []);
    setPlatformFee(usdToIls(Number(settingsRes.data?.platform_monthly_fee_usd ?? 0)).toFixed(2));
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const currentRows = useMemo(() => {
    const seen = new Set<string>();
    return rows.filter((r) => {
      if (!r.is_active) return false;
      const k = `${r.service}::${r.unit}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [rows]);

  const saveRow = async (id: string) => {
    const d = draft[id];
    if (!d) return;
    const orig = rows.find((r) => r.id === id);
    if (!orig) return;
    // d.cost_per_unit_usd actually stores ILS while editing — convert to USD for DB
    const cost = d.cost_per_unit_usd !== undefined ? ilsToUsd(d.cost_per_unit_usd) : orig.cost_per_unit_usd;
    const markup = d.markup_pct ?? orig.markup_pct;
    const { error } = await supabase.rpc("apply_pricing_change", {
      p_service: orig.service,
      p_unit: orig.unit,
      p_cost: cost,
      p_markup: markup,
      p_notes: d.notes ?? orig.notes,
    });
    if (error) return toast.error(error.message);
    toast.success("עודכן + הוחל רטרואקטיבית על כל ההיסטוריה");
    setDraft((prev) => { const { [id]: _, ...rest } = prev; return rest; });
    load();
  };

  const addRow = async () => {
    if (!newRow.service.trim() || !newRow.cost) return toast.error("חסר שירות או מחיר");
    const { error } = await supabase.rpc("apply_pricing_change", {
      p_service: newRow.service.trim(),
      p_unit: newRow.unit,
      p_cost: ilsToUsd(Number(newRow.cost)),
      p_markup: Number(newRow.markup) || 0,
      p_notes: null,
    });
    if (error) return toast.error(error.message);
    toast.success("נוסף מחיר חדש");
    setAdding(false);
    setNewRow({ service: "", unit: "seconds", cost: "", markup: "0" });
    load();
  };

  const deactivate = async (id: string) => {
    if (!confirm("להשבית את המחיר הזה?")) return;
    const { error } = await supabase.from("service_pricing").update({ is_active: false }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("הושבת");
    load();
  };

  const applyBulkMarkup = async () => {
    const m = Number(bulkMarkup);
    if (Number.isNaN(m)) return toast.error("מספר לא תקין");
    if (!confirm(`לקבוע ${m}% רווח לכל השירותים הפעילים + לעדכן רטרואקטיבית את כל ההיסטוריה?`)) return;
    setSavingBulk(true);
    const { error } = await supabase.rpc("apply_bulk_markup", { p_markup: m });
    setSavingBulk(false);
    if (error) return toast.error(error.message);
    toast.success(`רווח ${m}% הוחל על כל השירותים וההיסטוריה`);
    setBulkMarkup("");
    load();
  };

  const savePlatformFee = async () => {
    const ils = Number(platformFee);
    if (Number.isNaN(ils) || ils < 0) return toast.error("מספר לא תקין");
    const fee = ilsToUsd(ils);
    setSavingFee(true);
    const { error } = await supabase
      .from("app_settings")
      .update({ platform_monthly_fee_usd: fee, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSavingFee(false);
    if (error) return toast.error(error.message);
    toast.success("דמי המנוי החודשיים עודכנו");
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
              <Tag className="h-6 w-6" />
              <div>
                <h1 className="text-2xl font-bold">ניהול תמחור</h1>
                <p className="text-sm text-muted-foreground">מחירי שירותים, אחוזי רווח ודמי מנוי קבועים — הסכומים בש"ח (₪). שינויים מוחלים רטרואקטיבית על כל ההיסטוריה. שער המרה: 1$ ≈ ₪{USD_TO_ILS}</p>
              </div>
            </div>
            <Button onClick={() => setAdding(true)} variant="outline">
              <Plus className="h-4 w-4 ml-1" /> מחיר חדש
            </Button>
          </header>

          <div className="flex-1 p-6 space-y-6">
            {/* Platform fixed monthly fee */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Building2 className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">דמי מנוי קבועים על המערכת</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                סכום קבוע ב-₪ שמתווסף לכל יוזר פעיל בכל חודש — כדי להחזיר עלויות תשתית קבועות. (לדוגמה: אם המערכת עולה ₪75/חודש ל-10 יוזרים, הגדר ₪3.75 כדי להחזיר חצי).
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <Label className="text-xs">₪ לכל יוזר פעיל / חודש</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={platformFee}
                    onChange={(e) => setPlatformFee(e.target.value)}
                    className="w-40 mt-1"
                  />
                </div>
                <Button onClick={savePlatformFee} disabled={savingFee}>
                  {savingFee ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 ml-1" />} שמור
                </Button>
              </div>

              {/* Calculator */}
              <div className="mt-4 p-3 rounded-lg border bg-muted/30">
                <div className="text-xs font-semibold mb-2">🧮 מחשבון דמי מנוי</div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end">
                  <div>
                    <Label className="text-xs">עלות תשתית ₪/חודש</Label>
                    <Input
                      type="number" step="0.01" value={calcCost}
                      onChange={(e) => setCalcCost(e.target.value)} className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">יוזרים פעילים</Label>
                    <Input
                      type="number" step="1" min="1" value={calcUsers}
                      onChange={(e) => setCalcUsers(e.target.value)} className="mt-1"
                    />
                  </div>
                  <div>
                    <Label className="text-xs">% להחזיר</Label>
                    <Input
                      type="number" step="1" min="0" max="100" value={calcRecover}
                      onChange={(e) => setCalcRecover(e.target.value)} className="mt-1"
                    />
                  </div>
                  <div className="text-sm">
                    {(() => {
                      const c = Number(calcCost) || 0;
                      const u = Math.max(1, Number(calcUsers) || 1);
                      const r = Number(calcRecover) || 0;
                      const perUser = (c * (r / 100)) / u;
                      return (
                        <div className="space-y-1">
                          <div className="text-muted-foreground text-xs">דמי מנוי ליוזר:</div>
                          <div className="text-lg font-bold text-primary">${perUser.toFixed(2)}</div>
                          <Button
                            size="sm" variant="outline" className="h-7 text-xs"
                            onClick={() => setPlatformFee(perUser.toFixed(2))}
                            disabled={!perUser}
                          >
                            השתמש בערך הזה
                          </Button>
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </div>
            </Card>

            {/* Bulk markup */}
            <Card className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <Percent className="h-5 w-5 text-primary" />
                <h2 className="font-semibold">רווח אחיד לכל השירותים</h2>
              </div>
              <p className="text-sm text-muted-foreground mb-3">
                קביעת אחוז רווח אחיד על כל השירותים הפעילים בבת אחת. השינוי מוחל גם רטרואקטיבית על כל ההיסטוריה.
              </p>
              <div className="flex items-end gap-3">
                <div>
                  <Label className="text-xs">רווח % לכל השירותים</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="לדוגמה: 200"
                    value={bulkMarkup}
                    onChange={(e) => setBulkMarkup(e.target.value)}
                    className="w-40 mt-1"
                  />
                </div>
                <Button onClick={applyBulkMarkup} disabled={savingBulk || !bulkMarkup}>
                  {savingBulk ? <Loader2 className="h-4 w-4 animate-spin" /> : <Percent className="h-4 w-4 ml-1" />} החל על כולם + רטרו
                </Button>
              </div>
            </Card>

            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Card className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-right p-3">שירות</th>
                        <th className="text-right p-3">יחידה</th>
                        <th className="text-right p-3">מחיר ליחידה (USD)</th>
                        <th className="text-right p-3">רווח %</th>
                        <th className="text-right p-3">בתוקף מ-</th>
                        <th className="text-right p-3">הערות</th>
                        <th className="text-right p-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {adding && (
                        <tr className="border-t border-border bg-accent/20">
                          <td className="p-2">
                            <Input
                              placeholder="whisper / google/gemini-2.5-flash"
                              value={newRow.service}
                              onChange={(e) => setNewRow({ ...newRow, service: e.target.value })}
                            />
                          </td>
                          <td className="p-2">
                            <select
                              className="border rounded px-2 py-1 bg-background"
                              value={newRow.unit}
                              onChange={(e) => setNewRow({ ...newRow, unit: e.target.value })}
                            >
                              {Object.entries(UNIT_LABELS).map(([k, v]) => (
                                <option key={k} value={k}>{v}</option>
                              ))}
                            </select>
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.000000001"
                              value={newRow.cost}
                              onChange={(e) => setNewRow({ ...newRow, cost: e.target.value })}
                            />
                          </td>
                          <td className="p-2">
                            <Input
                              type="number"
                              step="0.01"
                              value={newRow.markup}
                              onChange={(e) => setNewRow({ ...newRow, markup: e.target.value })}
                            />
                          </td>
                          <td className="p-2 text-muted-foreground">עכשיו</td>
                          <td className="p-2 text-muted-foreground">—</td>
                          <td className="p-2">
                            <Button size="sm" onClick={addRow}><Save className="h-3 w-3 ml-1" /> שמור</Button>
                            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>בטל</Button>
                          </td>
                        </tr>
                      )}
                      {currentRows.map((r) => {
                        const d = draft[r.id] ?? {};
                        const dirty = Object.keys(d).length > 0;
                        return (
                          <tr key={r.id} className="border-t border-border hover:bg-muted/30">
                            <td className="p-3 font-medium">{serviceLabel(r.service)} <span className="text-xs text-muted-foreground">({r.service})</span></td>
                            <td className="p-3"><Badge variant="outline">{UNIT_LABELS[r.unit] ?? r.unit}</Badge></td>
                            <td className="p-2 w-44">
                              <Input
                                type="number"
                                step="0.000000001"
                                defaultValue={r.cost_per_unit_usd}
                                onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, cost_per_unit_usd: Number(e.target.value) } })}
                              />
                            </td>
                            <td className="p-2 w-24">
                              <Input
                                type="number"
                                step="0.01"
                                defaultValue={r.markup_pct}
                                onChange={(e) => setDraft({ ...draft, [r.id]: { ...d, markup_pct: Number(e.target.value) } })}
                              />
                            </td>
                            <td className="p-3 text-xs text-muted-foreground">{new Date(r.effective_from).toLocaleDateString("he-IL")}</td>
                            <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">{r.notes}</td>
                            <td className="p-3 flex gap-1">
                              {dirty && (
                                <Button size="sm" onClick={() => saveRow(r.id)}>
                                  <Save className="h-3 w-3 ml-1" /> שמור + רטרו
                                </Button>
                              )}
                              <Button size="sm" variant="ghost" onClick={() => deactivate(r.id)}>
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="p-3 text-xs text-muted-foreground border-t bg-muted/20">
                  שמירה יוצרת גרסת מחיר חדשה ומעדכנת רטרואקטיבית את כל החיובים הקודמים של אותו שירות.
                </div>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default PricingAdmin;
