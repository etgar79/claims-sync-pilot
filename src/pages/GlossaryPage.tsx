import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, BookOpen, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getEffectiveUserId } from "@/lib/actAs";

interface GlossaryItem {
  id: string;
  term: string;
  replacement: string | null;
  notes: string | null;
  workspace_kind: string;
}

export default function GlossaryPage() {
  const [items, setItems] = useState<GlossaryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [term, setTerm] = useState("");
  const [replacement, setReplacement] = useState("");
  const [notes, setNotes] = useState("");
  const [workspaceKind, setWorkspaceKind] = useState<string>("all");

  const load = async () => {
    setLoading(true);
    const acting = await getEffectiveUserId();
    if (!acting) { setLoading(false); return; }
    const { data, error } = await supabase
      .from("user_glossary")
      .select("id, term, replacement, notes, workspace_kind")
      .eq("user_id", acting)
      .order("created_at", { ascending: false });
    if (error) toast.error("שגיאה בטעינת המילון", { description: error.message });
    setItems(data ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    if (!term.trim()) { toast.error("יש להזין מונח"); return; }
    setSaving(true);
    const acting = await getEffectiveUserId();
    if (!acting) { setSaving(false); return; }
    const { error } = await supabase.from("user_glossary").insert({
      user_id: acting,
      term: term.trim(),
      replacement: replacement.trim() || null,
      notes: notes.trim() || null,
      workspace_kind: workspaceKind,
    });
    setSaving(false);
    if (error) { toast.error("שגיאה בשמירה", { description: error.message }); return; }
    setTerm(""); setReplacement(""); setNotes("");
    toast.success("נוסף למילון");
    load();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("user_glossary").delete().eq("id", id);
    if (error) { toast.error("שגיאה במחיקה", { description: error.message }); return; }
    toast.success("נמחק");
    load();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar />
        <SidebarInset>
          <header className="flex h-14 items-center gap-2 border-b px-4">
            <SidebarTrigger />
            <BookOpen className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">מילון מונחים מקצועיים</h1>
          </header>
          <main className="p-6 max-w-4xl mx-auto space-y-6">
            <p className="text-sm text-muted-foreground">
              המונחים שתוסיפי כאן ישמשו את ה-AI לשיפור דיוק התמלול והסיכומים — שמות מקומות, מונחים מקצועיים, קיצורים, שמות לקוחות חוזרים וכו׳.
            </p>

            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="space-y-1.5">
                  <Label>מונח / כתיב נכון</Label>
                  <Input value={term} onChange={(e) => setTerm(e.target.value)} placeholder="לדוגמה: גוש 6638" />
                </div>
                <div className="space-y-1.5">
                  <Label>החלפה (אם המנוע טועה)</Label>
                  <Input value={replacement} onChange={(e) => setReplacement(e.target.value)} placeholder="לדוגמה: 'גוש שש שש' → 'גוש 6638'" />
                </div>
                <div className="space-y-1.5">
                  <Label>שייך ל-Workspace</Label>
                  <Select value={workspaceKind} onValueChange={setWorkspaceKind}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כולם</SelectItem>
                      <SelectItem value="appraiser">שמאי</SelectItem>
                      <SelectItem value="architect">אדריכל</SelectItem>
                      <SelectItem value="transcriber">תמלול</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>הערה (אופציונלי)</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הקשר, הסבר, או דוגמה" rows={2} />
              </div>
              <div className="flex justify-end">
                <Button onClick={handleAdd} disabled={saving} className="gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                  הוסף למילון
                </Button>
              </div>
            </Card>

            <div className="space-y-2">
              <h2 className="text-sm font-medium text-muted-foreground">{items.length} מונחים במילון</h2>
              {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : items.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground text-sm">עדיין אין מונחים. הוסיפי את הראשון למעלה.</Card>
              ) : (
                items.map((it) => (
                  <Card key={it.id} className="p-3 flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{it.term}</span>
                        {it.replacement && <span className="text-xs text-muted-foreground">→ {it.replacement}</span>}
                        <span className="text-[10px] uppercase tracking-wide bg-muted px-1.5 py-0.5 rounded">{it.workspace_kind}</span>
                      </div>
                      {it.notes && <p className="text-xs text-muted-foreground mt-1">{it.notes}</p>}
                    </div>
                    <Button size="icon" variant="ghost" onClick={() => handleDelete(it.id)} className="text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </Card>
                ))
              )}
            </div>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
