import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, Tag, Plus, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { serviceLabel } from "@/lib/serviceLabels";
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

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("service_pricing")
      .select("*")
      .order("service")
      .order("unit")
      .order("effective_from", { ascending: false });
    if (error) toast.error("שגיאה בטעינה: " + error.message);
    setRows(data ?? []);
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  // Group: only show the most recent active row per (service, unit)
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
    // Strategy: insert a new effective row, mark old inactive — preserves history.
    const { error: insertErr } = await supabase.from("service_pricing").insert({
      service: orig.service,
      unit: orig.unit,
      cost_per_unit_usd: d.cost_per_unit_usd ?? orig.cost_per_unit_usd,
      markup_pct: d.markup_pct ?? orig.markup_pct,
      notes: d.notes ?? orig.notes,
      is_active: true,
    });
    if (insertErr) return toast.error(insertErr.message);
    await supabase.from("service_pricing").update({ is_active: false }).eq("id", id);
    toast.success("המחיר עודכן (נוצרה גרסה חדשה)");
    setDraft((prev) => {
      const { [id]: _, ...rest } = prev;
      return rest;
    });
    load();
  };

  const addRow = async () => {
    if (!newRow.service.trim() || !newRow.cost) return toast.error("חסר שירות או מחיר");
    const { error } = await supabase.from("service_pricing").insert({
      service: newRow.service.trim(),
      unit: newRow.unit,
      cost_per_unit_usd: Number(newRow.cost),
      markup_pct: Number(newRow.markup) || 0,
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
                <p className="text-sm text-muted-foreground">מחירי שירותים ואחוזי רווח לחיוב — כל עדכון נשמר כגרסה חדשה</p>
              </div>
            </div>
            <Button onClick={() => setAdding(true)} variant="outline">
              <Plus className="h-4 w-4 ml-1" /> מחיר חדש
            </Button>
          </header>

          <div className="flex-1 p-6 space-y-6">
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
                                  <Save className="h-3 w-3 ml-1" /> שמור
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
                  שמירה יוצרת גרסת מחיר חדשה. עסקאות עבר נשארות עם המחיר ההיסטורי שלהן.
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
