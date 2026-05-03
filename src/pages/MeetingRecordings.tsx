import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Mic, Loader2, Search } from "lucide-react";
import { RecordingCard } from "@/components/RecordingCard";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { AssignToMeetingDialog } from "@/components/AssignToMeetingDialog";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { RecordCallButton } from "@/components/RecordCallButton";
import { useDriveSync } from "@/hooks/useDriveSync";

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


const MeetingRecordings = () => {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);
  const [transcribeTarget, setTranscribeTarget] = useState<Row | null>(null);
  const [viewTarget, setViewTarget] = useState<Row | null>(null);
  const { runAll, running } = useTranscribeAll();
  const { sync, syncing } = useDriveSync("architect");

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

  useEffect(() => {
    load();
    void sync().then((r) => { if (r && r.added > 0) load(); });
    const id = window.setInterval(() => {
      void sync().then((r) => { if (r && r.added > 0) load(); });
    }, 120_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const renderCard = (r: Row) => (
    <RecordingCard
      key={r.id}
      data={r}
      isRunning={running === r.id}
      workspace="architect"
      onView={() => setViewTarget(r)}
      onEdit={() => setViewTarget(r)}
      onAssign={() => setAssignTarget(r)}
      onSuperTranscribe={() => handleQuickTranscribe(r)}
      onQuickTranscribe={() => setTranscribeTarget(r)}
    />
  );

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
            <Mic className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold flex-1">הקלטות פגישה</h1>
            <RecordCallButton workspace="architect" onCreated={load} />
          </header>
          <div className="flex-1 overflow-auto p-4 lg:p-6 space-y-4">
            <WorkspaceFolderBanner workspace="architect" onSynced={load} />
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input className="pr-9" placeholder="חיפוש לפי קובץ, פגישה או תגית..." value={search} onChange={e => setSearch(e.target.value)} />
            </div>
            {syncing && (
              <div className="text-xs text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-3 w-3 animate-spin" />
                מסנכרן מ-Drive...
              </div>
            )}
            {loading ? (
              <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : items.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <Mic className="h-8 w-8 text-primary" />
                </div>
                <h3 className="font-semibold text-base mb-1">אין הקלטות עדיין</h3>
                <p className="text-sm text-muted-foreground mb-4">
                  סנכרני מ-Drive או הקליטי שיחה חדשה כדי להתחיל
                </p>
                <div className="flex justify-center">
                  <RecordCallButton workspace="architect" onCreated={load} />
                </div>
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
      {viewTarget && (
        <TranscriptViewerDialog
          open={!!viewTarget}
          onOpenChange={(o) => !o && setViewTarget(null)}
          recordingId={viewTarget.id}
          table="meeting_recordings"
          filename={viewTarget.filename}
          recordedAt={viewTarget.recorded_at}
          audioUrl={viewTarget.drive_url}
          transcript={viewTarget.transcript}
          context={viewTarget.meeting_title ? `פגישה: ${viewTarget.meeting_title}` : null}
          defaultTab="view"
          onUpdated={load}
        />
      )}
    </SidebarProvider>
  );
};

export default MeetingRecordings;
