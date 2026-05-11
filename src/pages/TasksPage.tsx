import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, CheckCircle2, X, Pencil, ListChecks, Send, Calendar as CalIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getActAsUserId } from "@/lib/actAs";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";

interface ExtractedTask {
  id: string;
  user_id: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: string;
  workspace_kind: string;
  source_meeting_id: string | null;
  source_case_id: string | null;
  created_at: string;
}

interface Task {
  id: string;
  title: string;
  notes: string | null;
  due: string | null;
  status: string;
  google_task_id: string | null;
  completed_at: string | null;
  created_at: string;
}

export default function TasksPage() {
  const [pending, setPending] = useState<ExtractedTask[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDue, setEditDue] = useState("");
  const { workspace } = useActiveWorkspace();

  const userIdFilter = async (): Promise<string | null> => {
    const acting = getActAsUserId();
    if (acting) return acting;
    const { data } = await supabase.auth.getUser();
    return data.user?.id ?? null;
  };

  const load = async () => {
    setLoading(true);
    try {
      const uid = await userIdFilter();
      if (!uid) return;
      const [{ data: ext }, { data: ts }] = await Promise.all([
        supabase.from("extracted_tasks").select("*").eq("user_id", uid).eq("status", "pending_review").order("created_at", { ascending: false }),
        supabase.from("tasks").select("*").eq("user_id", uid).order("created_at", { ascending: false }).limit(200),
      ]);
      setPending((ext as ExtractedTask[]) ?? []);
      setTasks((ts as Task[]) ?? []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const channel = supabase
      .channel("tasks-page")
      .on("postgres_changes", { event: "*", schema: "public", table: "extracted_tasks" }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const reject = async (id: string) => {
    await supabase.from("extracted_tasks").update({ status: "rejected" }).eq("id", id);
    toast.success("נדחה");
  };

  const approve = async (et: ExtractedTask, sendToGoogle = false) => {
    const { data: inserted, error } = await supabase
      .from("tasks")
      .insert({
        user_id: et.user_id ?? (await supabase.auth.getUser()).data.user?.id,
        title: et.title,
        notes: et.notes,
        due: et.due,
        status: "pending",
        source_meeting_id: et.source_meeting_id,
        source_case_id: et.source_case_id,
        source_extracted_id: et.id,
        workspace_kind: et.workspace_kind,
      } as any)
      .select()
      .single();
    if (error) { toast.error(error.message); return; }
    await supabase.from("extracted_tasks").update({ status: "approved" }).eq("id", et.id);

    if (sendToGoogle) {
      try {
        const res = await supabase.functions.invoke("google-tasks-create", {
          body: {
            tasks: [{ title: et.title, notes: et.notes ?? "", due: et.due ?? "" }],
          },
        });
        if (res.error) throw res.error;
        const gid = (res.data as any)?.created?.[0]?.id;
        if (gid && inserted) {
          await supabase.from("tasks").update({ google_task_id: gid }).eq("id", inserted.id);
        }
        toast.success("נוסף ל-Google Tasks");
      } catch (e: any) {
        toast.warning(`נשמר. שליחה ל-Google נכשלה: ${e?.message || ""}`);
      }
    } else {
      toast.success("אושר");
    }
  };

  const startEdit = (et: ExtractedTask) => {
    setEditingId(et.id);
    setEditTitle(et.title);
    setEditDue(et.due ?? "");
  };

  const saveEdit = async (id: string) => {
    await supabase.from("extracted_tasks").update({ title: editTitle, due: editDue || null }).eq("id", id);
    setEditingId(null);
    toast.success("עודכן");
  };

  const toggleDone = async (t: Task) => {
    const next = t.status === "done" ? "pending" : "done";
    await supabase.from("tasks").update({
      status: next,
      completed_at: next === "done" ? new Date().toISOString() : null,
    }).eq("id", t.id);
  };

  const counts = useMemo(() => ({
    pending: pending.length,
    open: tasks.filter((t) => t.status !== "done").length,
    done: tasks.filter((t) => t.status === "done").length,
  }), [pending, tasks]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 flex items-center justify-between border-b px-4 bg-card">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <ListChecks className="h-5 w-5 text-primary" />
              <h1 className="font-semibold">משימות</h1>
            </div>
            <Button variant="outline" size="sm" onClick={load}>רענן</Button>
          </header>

          <div className="flex-1 p-6 max-w-5xl w-full mx-auto">
            <Tabs defaultValue="pending">
              <TabsList>
                <TabsTrigger value="pending">לאישור <Badge variant="secondary" className="ms-2">{counts.pending}</Badge></TabsTrigger>
                <TabsTrigger value="open">פתוחות <Badge variant="secondary" className="ms-2">{counts.open}</Badge></TabsTrigger>
                <TabsTrigger value="done">הושלמו <Badge variant="secondary" className="ms-2">{counts.done}</Badge></TabsTrigger>
              </TabsList>

              <TabsContent value="pending" className="mt-4 space-y-2">
                {loading && <div className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />טוען…</div>}
                {!loading && pending.length === 0 && (
                  <Card className="p-8 text-center text-muted-foreground">
                    אין משימות חדשות לאישור. כשהמערכת תזהה משימות מתמלולים — הן יופיעו כאן.
                  </Card>
                )}
                {pending.map((et) => (
                  <Card key={et.id} className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        {editingId === et.id ? (
                          <div className="space-y-2">
                            <Input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
                            <Input type="date" value={editDue} onChange={(e) => setEditDue(e.target.value)} />
                          </div>
                        ) : (
                          <>
                            <div className="font-medium">{et.title}</div>
                            {et.notes && <div className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">{et.notes}</div>}
                            <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                              {et.due && <Badge variant="outline" className="gap-1"><CalIcon className="h-3 w-3" />{et.due}</Badge>}
                              <Badge variant="outline">{et.workspace_kind === "architect" ? "פגישה" : et.workspace_kind === "transcriber" ? "תמלול" : "תיק"}</Badge>
                            </div>
                          </>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        {editingId === et.id ? (
                          <>
                            <Button size="sm" onClick={() => saveEdit(et.id)}>שמור</Button>
                            <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>בטל</Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" onClick={() => approve(et, true)} className="gap-1"><Send className="h-3.5 w-3.5" />אשר ושלח</Button>
                            <Button size="sm" variant="outline" onClick={() => approve(et, false)} className="gap-1"><CheckCircle2 className="h-3.5 w-3.5" />אשר</Button>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(et)} className="gap-1"><Pencil className="h-3.5 w-3.5" />ערוך</Button>
                            <Button size="sm" variant="ghost" onClick={() => reject(et.id)} className="gap-1 text-destructive"><X className="h-3.5 w-3.5" />דחה</Button>
                          </>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </TabsContent>

              <TabsContent value="open" className="mt-4 space-y-2">
                {tasks.filter((t) => t.status !== "done").map((t) => (
                  <Card key={t.id} className="p-3 flex items-center gap-3">
                    <Button size="icon" variant="ghost" onClick={() => toggleDone(t)}>
                      <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{t.title}</div>
                      {t.due && <div className="text-xs text-muted-foreground">יעד: {t.due}</div>}
                    </div>
                    {t.google_task_id && <Badge variant="outline" className="text-xs">Google</Badge>}
                  </Card>
                ))}
                {tasks.filter((t) => t.status !== "done").length === 0 && !loading && (
                  <Card className="p-8 text-center text-muted-foreground">אין משימות פתוחות</Card>
                )}
              </TabsContent>

              <TabsContent value="done" className="mt-4 space-y-2">
                {tasks.filter((t) => t.status === "done").map((t) => (
                  <Card key={t.id} className="p-3 flex items-center gap-3 opacity-70">
                    <Button size="icon" variant="ghost" onClick={() => toggleDone(t)}>
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    </Button>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate line-through">{t.title}</div>
                    </div>
                  </Card>
                ))}
              </TabsContent>
            </Tabs>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
}
