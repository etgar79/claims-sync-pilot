import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Calendar, MapPin, Users, Loader2, Search, Sparkles, Clock, CheckCircle2, LogOut } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles } from "@/hooks/useUserRoles";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { AssignToMeetingDialog } from "@/components/AssignToMeetingDialog";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { Mic, Tag, Cloud } from "lucide-react";

interface Meeting {
  id: string;
  title: string;
  client_name: string | null;
  project_name: string | null;
  location: string | null;
  meeting_date: string | null;
  status: string;
  tags: string[] | null;
  ai_summary: string | null;
  notes: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  active: "פעילה",
  scheduled: "מתוזמנת",
  completed: "הושלמה",
  cancelled: "בוטלה",
};

interface UnassignedRecording {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  drive_url: string | null;
  source: string | null;
}

const Meetings = () => {
  const { displayName } = useUserRoles();
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [unassignedRecs, setUnassignedRecs] = useState<UnassignedRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [assignTarget, setAssignTarget] = useState<UnassignedRecording | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [form, setForm] = useState({
    title: "",
    client_name: "",
    project_name: "",
    location: "",
    meeting_date: "",
  });
  const navigate = useNavigate();
  const { runAll, running: transcribing } = useTranscribeAll();

  const handleQuickTranscribe = async (r: UnassignedRecording) => {
    if (!r.drive_url) {
      toast.error("אין קובץ אודיו זמין");
      return;
    }
    await supabase.from("meeting_recordings").update({ transcript_status: "processing" }).eq("id", r.id);
    load();
    await runAll({
      recordingId: r.id,
      audioUrl: r.drive_url,
      table: "meeting_recordings",
      context: { title: r.filename },
      onCompleted: load,
    });
  };

  const load = async () => {
    setLoading(true);
    const [mRes, urRes] = await Promise.all([
      supabase
        .from("meetings")
        .select("*")
        .order("meeting_date", { ascending: false, nullsFirst: false }),
      supabase
        .from("meeting_recordings")
        .select("id, filename, duration, recorded_at, drive_url, source")
        .is("meeting_id", null)
        .order("recorded_at", { ascending: false }),
    ]);
    if (mRes.error) toast.error(mRes.error.message);
    setMeetings(mRes.data || []);
    setUnassignedRecs((urRes.data as UnassignedRecording[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error("יש להזין כותרת");
      return;
    }
    setCreating(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("יש להתחבר תחילה");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase
      .from("meetings")
      .insert({
        user_id: auth.user.id,
        title: form.title,
        client_name: form.client_name || null,
        project_name: form.project_name || null,
        location: form.location || null,
        meeting_date: form.meeting_date || null,
        status: form.meeting_date && new Date(form.meeting_date) > new Date() ? "scheduled" : "active",
      })
      .select("id, title")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("פגישה נוצרה בהצלחה");
    // Fire-and-forget: create matching Drive sub-folder
    if (data?.id) {
      supabase.functions
        .invoke("google-drive-create-case-folder", {
          body: { kind: "meeting", id: data.id, name: data.title },
        })
        .then(({ error: fnErr }) => {
          if (fnErr) console.warn("Drive folder creation skipped:", fnErr);
        });
    }
    setOpen(false);
    setForm({ title: "", client_name: "", project_name: "", location: "", meeting_date: "" });
    if (data?.id) navigate(`/meetings/${data.id}`);
    else load();
  };

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate("/auth");
  };

  const filtered = useMemo(() => {
    return meetings.filter((m) => {
      const q = search.trim();
      const matchSearch =
        !q ||
        m.title?.includes(q) ||
        m.client_name?.includes(q) ||
        m.project_name?.includes(q) ||
        m.location?.includes(q);
      const matchStatus = statusFilter === "all" || m.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [meetings, search, statusFilter]);

  const stats = useMemo(() => {
    const total = meetings.length;
    const active = meetings.filter((m) => m.status === "active" || m.status === "scheduled").length;
    const completed = meetings.filter((m) => m.status === "completed").length;
    const withSummary = meetings.filter((m) => !!m.ai_summary).length;
    return { total, active, completed, withSummary };
  }, [meetings]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div>
                <h1 className="text-2xl font-bold">פגישות</h1>
                <p className="text-sm text-muted-foreground">
                  {displayName ? `שלום ${displayName} • ` : ""}ניהול פגישות, תמלולים וסיכומי AI
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {/* Drive sync moved to WorkspaceFolderBanner below */}
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="h-4 w-4 ml-2" />
                    פגישה חדשה
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>צור פגישה חדשה</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div>
                      <Label>כותרת *</Label>
                      <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="פגישה עם לקוח..." />
                    </div>
                    <div>
                      <Label>שם לקוח</Label>
                      <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                    </div>
                    <div>
                      <Label>שם פרויקט</Label>
                      <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
                    </div>
                    <div>
                      <Label>מיקום</Label>
                      <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                    </div>
                    <div>
                      <Label>תאריך פגישה</Label>
                      <Input type="datetime-local" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
                    <Button onClick={handleCreate} disabled={creating}>
                      {creating && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                      צור
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4 ml-2" />
                יציאה
              </Button>
            </div>
          </header>

          <div className="flex-1 p-6 space-y-6">
            {/* Drive folder banner with sync */}
            <WorkspaceFolderBanner workspace="architect" onSynced={load} />

            {/* Unassigned recordings from Drive */}
            {unassignedRecs.length > 0 && (
              <Card className="p-4 border-warning/40 bg-warning/5">
                <div className="flex items-center gap-2 mb-3">
                  <Mic className="h-4 w-4 text-warning" />
                  <h3 className="font-semibold">הקלטות חדשות לשיוך</h3>
                  <Badge variant="outline">{unassignedRecs.length}</Badge>
                </div>
                <div className="space-y-2">
                  {unassignedRecs.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 p-2 rounded bg-background border">
                      <Mic className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{r.filename}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                          <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
                          {r.duration && <span>{r.duration}</span>}
                          {r.source === "drive_sync" && (
                            <Badge variant="outline" className="gap-1 text-xs">
                              <Cloud className="h-3 w-3" /> Drive
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        disabled={transcribing === r.id || !r.drive_url}
                        onClick={() => handleQuickTranscribe(r)}
                        className="gap-1 shrink-0"
                      >
                        {transcribing === r.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Sparkles className="h-3.5 w-3.5" />
                        )}
                        תמלל-על
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setAssignTarget(r)} className="gap-1 shrink-0">
                        <Tag className="h-3.5 w-3.5" />
                        שייך לפגישה
                      </Button>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">סה"כ פגישות</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Calendar className="h-5 w-5 text-primary" />
                  {stats.total}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">פעילות</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Clock className="h-5 w-5 text-blue-500" />
                  {stats.active}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">הושלמו</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-green-500" />
                  {stats.completed}
                </div>
              </Card>
              <Card className="p-4">
                <div className="text-sm text-muted-foreground">עם סיכום AI</div>
                <div className="text-2xl font-bold mt-1 flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  {stats.withSummary}
                </div>
              </Card>
            </div>

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pr-9"
                  placeholder="חיפוש לפי כותרת, לקוח, פרויקט או מיקום..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">כל הסטטוסים</SelectItem>
                  <SelectItem value="scheduled">מתוזמנות</SelectItem>
                  <SelectItem value="active">פעילות</SelectItem>
                  <SelectItem value="completed">הושלמו</SelectItem>
                  <SelectItem value="cancelled">בוטלו</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* List */}
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : filtered.length === 0 ? (
              <Card className="p-12 text-center">
                <h3 className="text-lg font-semibold mb-2">
                  {meetings.length === 0 ? "אין פגישות עדיין" : "לא נמצאו פגישות תואמות"}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {meetings.length === 0 ? "צור את הפגישה הראשונה שלך כדי להתחיל" : "נסה לשנות את החיפוש או הפילטר"}
                </p>
                {meetings.length === 0 && (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="h-4 w-4 ml-2" />
                    פגישה ראשונה
                  </Button>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filtered.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}`}>
                    <Card className="p-4 hover:border-primary transition-colors cursor-pointer h-full">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <h3 className="font-bold text-lg leading-tight">{m.title}</h3>
                        <Badge variant={m.status === "completed" ? "secondary" : "default"} className="shrink-0">
                          {STATUS_LABEL[m.status] || m.status}
                        </Badge>
                      </div>
                      {m.project_name && <p className="text-sm font-medium">{m.project_name}</p>}
                      {m.client_name && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Users className="h-3 w-3" />
                          {m.client_name}
                        </p>
                      )}
                      {m.location && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {m.location}
                        </p>
                      )}
                      {m.meeting_date && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(m.meeting_date).toLocaleString("he-IL")}
                        </p>
                      )}
                      {m.ai_summary && (
                        <Badge variant="outline" className="mt-3 gap-1">
                          <Sparkles className="h-3 w-3" />
                          סיכום AI מוכן
                        </Badge>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
      {assignTarget && (
        <AssignToMeetingDialog
          open={!!assignTarget}
          onOpenChange={(o) => !o && setAssignTarget(null)}
          recordingId={assignTarget.id}
          recordingFilename={assignTarget.filename}
          onAssigned={load}
        />
      )}
    </SidebarProvider>
  );
};

export default Meetings;
