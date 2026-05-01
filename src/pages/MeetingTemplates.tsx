import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { ClipboardList, Plus, Pencil, Trash2, Star, Save, Loader2, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Template {
  id: string;
  name: string;
  description: string | null;
  content: string;
  is_default: boolean;
  updated_at: string;
}

const DEFAULT_MEETING_CONTENT = `# סיכום פגישה: {{title}}

**תאריך:** {{meetingDate}}
**לקוח / פרויקט:** {{clientName}} / {{projectName}}
**מיקום:** {{location}}

## נושאים שנדונו
{{aiSummary}}

## תמלול מלא
{{transcripts}}

## הערות נוספות
{{notes}}

## משימות להמשך
- 
`;

const MeetingTemplates = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Template | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("report_templates")
      .select("*")
      .eq("template_kind", "meeting")
      .order("is_default", { ascending: false })
      .order("updated_at", { ascending: false });
    if (error) toast.error("שגיאה בטעינת התבניות");
    let list = (data ?? []) as Template[];

    if (list.length === 0) {
      const { data: userData } = await supabase.auth.getUser();
      if (userData.user) {
        const { data: created } = await supabase
          .from("report_templates")
          .insert({
            user_id: userData.user.id,
            name: "סיכום פגישה ברירת מחדל",
            description: "תבנית בסיסית לסיכום פגישות",
            content: DEFAULT_MEETING_CONTENT,
            is_default: true,
            template_kind: "meeting",
          })
          .select()
          .single();
        if (created) list = [created as Template];
      }
    }
    setTemplates(list);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleNew = () => {
    setEditing({
      id: "",
      name: "",
      description: "",
      content: DEFAULT_MEETING_CONTENT,
      is_default: false,
      updated_at: new Date().toISOString(),
    });
  };

  const handleSave = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("יש להזין שם לתבנית"); return; }
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { toast.error("יש להתחבר"); setSaving(false); return; }

    if (editing.id) {
      const { error } = await supabase.from("report_templates").update({
        name: editing.name, description: editing.description,
        content: editing.content, is_default: editing.is_default,
      }).eq("id", editing.id);
      if (error) { toast.error("שגיאה בשמירה"); setSaving(false); return; }
    } else {
      const { error } = await supabase.from("report_templates").insert({
        user_id: userData.user.id,
        name: editing.name, description: editing.description,
        content: editing.content, is_default: editing.is_default,
        template_kind: "meeting",
      });
      if (error) { toast.error("שגיאה ביצירה"); setSaving(false); return; }
    }

    if (editing.is_default) {
      await supabase.from("report_templates")
        .update({ is_default: false })
        .eq("user_id", userData.user.id)
        .eq("template_kind", "meeting")
        .neq("id", editing.id || "00000000-0000-0000-0000-000000000000");
    }

    toast.success("התבנית נשמרה");
    setEditing(null); setSaving(false); load();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase.from("report_templates").delete().eq("id", deleteId);
    if (error) { toast.error("שגיאה במחיקה"); return; }
    toast.success("התבנית נמחקה");
    setDeleteId(null); load();
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1 flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">תבניות סיכום פגישה</h1>
              <Badge variant="secondary">{templates.length}</Badge>
            </div>
            <Button size="sm" onClick={handleNew} className="gap-2">
              <Plus className="h-4 w-4" /> תבנית חדשה
            </Button>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" /> טוען...
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {templates.map((t) => (
                    <Card key={t.id} className="p-5 flex flex-col">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <ClipboardList className="h-5 w-5 text-primary shrink-0" />
                          <h3 className="font-semibold truncate">{t.name}</h3>
                        </div>
                        {t.is_default && (
                          <Badge className="gap-1 shrink-0">
                            <Star className="h-3 w-3" /> ברירת מחדל
                          </Badge>
                        )}
                      </div>
                      {t.description && <p className="text-sm text-muted-foreground mb-3 line-clamp-2">{t.description}</p>}
                      <div className="text-xs text-muted-foreground mb-4">
                        עודכן: {new Date(t.updated_at).toLocaleDateString("he-IL")}
                      </div>
                      <div className="flex items-center gap-2 mt-auto">
                        <Button size="sm" variant="outline" className="flex-1" onClick={() => setEditing(t)}>
                          <Pencil className="h-3.5 w-3.5 ml-1" /> ערוך
                        </Button>
                        <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteId(t.id)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-3xl h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <DialogTitle>{editing?.id ? "עריכת תבנית" : "תבנית חדשה"}</DialogTitle>
            <DialogDescription>
              השתמש בתגי החלפה כמו {`{{title}}, {{clientName}}, {{transcripts}}, {{aiSummary}}`}.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <ScrollArea className="flex-1">
              <div className="p-6 space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="name">שם התבנית *</Label>
                  <Input id="name" value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                    placeholder="למשל: פגישת תכנון ראשונית" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">תיאור</Label>
                  <Input id="description" value={editing.description ?? ""}
                    onChange={(e) => setEditing({ ...editing, description: e.target.value })} />
                </div>
                <div className="flex items-center gap-2">
                  <input id="default" type="checkbox" checked={editing.is_default}
                    onChange={(e) => setEditing({ ...editing, is_default: e.target.checked })}
                    className="h-4 w-4" />
                  <Label htmlFor="default" className="cursor-pointer">הגדר כברירת מחדל</Label>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="content">תוכן הסיכום *</Label>
                  <Textarea id="content" value={editing.content}
                    onChange={(e) => setEditing({ ...editing, content: e.target.value })}
                    rows={20} className="font-mono text-sm leading-relaxed" />
                </div>
                <Card className="p-4 bg-muted/40 text-sm space-y-2">
                  <div className="font-semibold">תגי החלפה זמינים:</div>
                  <div className="grid grid-cols-2 gap-1 text-xs font-mono text-muted-foreground">
                    <div>{`{{title}}`} - כותרת הפגישה</div>
                    <div>{`{{meetingDate}}`} - תאריך</div>
                    <div>{`{{clientName}}`} - לקוח</div>
                    <div>{`{{projectName}}`} - שם פרויקט</div>
                    <div>{`{{location}}`} - מיקום</div>
                    <div>{`{{transcripts}}`} - תמלולים</div>
                    <div>{`{{aiSummary}}`} - סיכום AI</div>
                    <div>{`{{notes}}`} - הערות</div>
                  </div>
                </Card>
              </div>
            </ScrollArea>
          )}
          <div className="border-t border-border p-4 flex justify-end gap-2 shrink-0">
            <Button variant="ghost" onClick={() => setEditing(null)} disabled={saving}>
              <X className="h-4 w-4 ml-1" /> ביטול
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Save className="h-4 w-4 ml-1" />}
              שמור
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>מחיקת תבנית</AlertDialogTitle>
            <AlertDialogDescription>פעולה זו לא ניתנת לביטול.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">מחק</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SidebarProvider>
  );
};

export default MeetingTemplates;
