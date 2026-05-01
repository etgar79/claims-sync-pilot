import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mic, Loader2, Search, FileText, Clock, AlertCircle, CheckCircle2,
  ExternalLink, Tag, Cloud, Sparkles, Zap, ChevronDown,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { AssignToMeetingDialog } from "@/components/AssignToMeetingDialog";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";

interface Row {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript: string | null;
  drive_url: string | null;
  meeting_id: string | null;
  source: string | null;
  tags: string[] | null;
  meeting_title?: string;
}

const STATUS: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: "ממתין", icon: Clock, cls: "bg-muted text-muted-foreground" },
  processing: { label: "מתמלל", icon: Loader2, cls: "bg-primary/10 text-primary" },
  completed: { label: "הושלם", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700" },
  failed: { label: "נכשל", icon: AlertCircle, cls: "bg-destructive/10 text-destructive" },
};

const MeetingRecordings = () => {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);
  const [transcribeTarget, setTranscribeTarget] = useState<Row | null>(null);
  const { runAll, running } = useTranscribeAll();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meeting_recordings")
      .select("id, filename, duration, recorded_at, transcript_status, transcript, drive_url, meeting_id, source, tags")
      .order("recorded_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const recs = (data ?? []) as Row[];
    const ids = Array.from(new Set(recs.map(r => r.meeting_id).filter(Boolean) as string[]));
    if (ids.length) {
      const { data: meetings } = await supabase.from("meetings").select("id, title").in("id", ids);
      const m = new Map<string, any>((meetings ?? []).map((x: any) => [x.id, x]));
      recs.forEach(r => { if (r.meeting_id) r.meeting_title = m.get(r.meeting_id)?.title; });
    }
    setItems(recs);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = items.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.filename.toLowerCase().includes(q) ||
      (r.meeting_title ?? "").toLowerCase().includes(q) ||
      (r.tags ?? []).some(t => t.toLowerCase().includes(q))
    );
  });

  const unassigned = filtered.filter(r => !r.meeting_id);
  const assigned = filtered.filter(r => !!r.meeting_id);

  const handleQuickTranscribe = async (r: Row) => {
    if (!r.drive_url) { toast.error("אין קובץ אודיו זמין"); return; }
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

  const renderCard = (r: Row) => {
    const st = STATUS[r.transcript_status] ?? STATUS.pending;
    const Icon = st.icon;
    const isRunning = running === r.id;
    return (
      <Card key={r.id} className="p-4 flex items-start gap-4 hover:border-primary/50 transition-colors">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Mic className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{r.filename}</span>
            <Badge className={`gap-1 ${st.cls}`} variant="secondary">
              <Icon className={`h-3 w-3 ${r.transcript_status === "processing" || isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "מתמלל..." : st.label}
            </Badge>
            {r.transcript && <Badge variant="outline" className="gap-1"><FileText className="h-3 w-3" />תמלול</Badge>}
            {r.source === "drive_sync" && <Badge variant="outline" className="gap-1 text-xs"><Cloud className="h-3 w-3" />Drive</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {r.meeting_id && r.meeting_title ? (
              <Link to={`/meetings/${r.meeting_id}`} className="hover:text-primary">פגישה: {r.meeting_title}</Link>
            ) : (
              <span className="text-warning">ללא שיוך</span>
            )}
            <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
            {r.duration && <span>{r.duration}</span>}
          </div>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          {!r.transcript && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="gap-1" disabled={isRunning}>
                  {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Mic className="h-3.5 w-3.5" />}
                  תמלל
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>בחר רמת תמלול</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => handleQuickTranscribe(r)} className="gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">תמלול-על</span>
                    <span className="text-xs text-muted-foreground">איכות מקסימלית</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTranscribeTarget(r)} className="gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">תמלול מהיר</span>
                    <span className="text-xs text-muted-foreground">מהיר וחסכוני</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAssignTarget(r)}>
            <Tag className="h-3.5 w-3.5" />
            {r.meeting_id ? "שנה שיוך" : "שייך לפגישה"}
          </Button>
          {r.drive_url && (
            <a href={r.drive_url} target="_blank" rel="noreferrer" className="text-xs text-primary inline-flex items-center gap-1 justify-center">
              Drive <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
      </Card>
    );
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
            <Mic className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">הקלטות פגישה</h1>
          </header>
          <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
            <WorkspaceFolderBanner workspace="architect" onSynced={load} />
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="חיפוש לפי קובץ, פגישה או תגית..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : items.length === 0 ? (
              <Card className="p-12 text-center text-muted-foreground">
                <Mic className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>אין הקלטות עדיין. סנכרן את תיקיית ה-Drive שלך כדי למשוך הקלטות.</p>
              </Card>
            ) : (
              <>
                {unassigned.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">הקלטות לשיוך ({unassigned.length})</h2>
                    {unassigned.map(renderCard)}
                  </div>
                )}
                {assigned.length > 0 && (
                  <div className="space-y-2">
                    <h2 className="text-sm font-semibold text-muted-foreground">הקלטות משויכות ({assigned.length})</h2>
                    {assigned.map(renderCard)}
                  </div>
                )}
              </>
            )}
          </div>
        </SidebarInset>
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
      {transcribeTarget && (
        <TranscribeDialog
          open={!!transcribeTarget}
          onOpenChange={(o) => !o && setTranscribeTarget(null)}
          recordingId={transcribeTarget.id}
          audioUrl={transcribeTarget.drive_url ?? ""}
          table="meeting_recordings"
          onCompleted={load}
        />
      )}
    </SidebarProvider>
  );
};

export default MeetingRecordings;
