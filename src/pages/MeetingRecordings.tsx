import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Loader2, Search } from "lucide-react";
import { RecordingCard } from "@/components/RecordingCard";
import { RecordingsHero } from "@/components/RecordingsHero";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { AssignToMeetingDialog } from "@/components/AssignToMeetingDialog";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { ExpandableTranscriptPanel } from "@/components/ExpandableTranscriptPanel";
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
  drive_file_id: string | null;
  meeting_id: string | null;
  source: string | null;
  tags: string[] | null;
  meeting_title?: string;
}

type FilterMode = "all" | "ready" | "pending";

const MeetingRecordings = () => {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);
  const [transcribeTarget, setTranscribeTarget] = useState<Row | null>(null);
  const [viewTarget, setViewTarget] = useState<Row | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<"view" | "edit">("view");
  const { runAll, running } = useTranscribeAll();
  const { sync, syncing } = useDriveSync("architect");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meeting_recordings")
      .select("id, filename, duration, recorded_at, transcript_status, transcript, drive_url, drive_file_id, meeting_id, source, tags")
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
    if (filterMode === "ready" && !r.transcript) return false;
    if (filterMode === "pending" && r.transcript) return false;
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
    const isExpanded = expandedId === r.id;
    const toggleExpand = (mode: "view" | "edit") => {
      if (isExpanded && expandedMode === mode) setExpandedId(null);
      else { setExpandedMode(mode); setExpandedId(r.id); }
    };
    return (
      <RecordingCard
        key={r.id}
        data={r}
        isRunning={running === r.id}
        workspace="architect"
        onView={() => toggleExpand("view")}
        onEdit={() => toggleExpand("edit")}
        onAssign={() => setAssignTarget(r)}
        onSuperTranscribe={() => handleQuickTranscribe(r)}
        onQuickTranscribe={() => setTranscribeTarget(r)}
        expanded={isExpanded}
        expandedSlot={
          <ExpandableTranscriptPanel
            open={isExpanded}
            mode={expandedMode}
            item={{
              id: r.id,
              table: "meeting_recordings",
              filename: r.filename,
              recordedAt: r.recorded_at,
              duration: r.duration,
              transcript: r.transcript,
              transcriptStatus: r.transcript_status,
              audioUrl: r.drive_url,
              context: r.meeting_title ? `פגישה: ${r.meeting_title}` : null,
              meetingId: r.meeting_id,
              meetingTitle: r.meeting_title ?? null,
              assignLabel: r.meeting_id ? "החלף" : "שייך",
            }}
            onToggle={() => setExpandedId(null)}
            onAssign={() => setAssignTarget(r)}
            onOpenDialog={() => setViewTarget(r)}
            onQuickTranscribe={() => setTranscribeTarget(r)}
            onUpdated={load}
          />
        }
      />
    );
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-gradient-to-b from-background via-background to-primary/[0.02]">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-3 shrink-0 sticky top-0 z-20">
            <SidebarTrigger />
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shrink-0">
              <Mic className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold leading-tight truncate">הקלטות פגישה</h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">
                {items.length} פריטים
              </p>
            </div>
            <div className="relative w-72 max-w-full hidden md:block">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pr-8 h-9"
                placeholder="חיפוש לפי קובץ, פגישה או תגית..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
            <RecordCallButton workspace="architect" onCreated={load} />
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4 lg:p-6 space-y-5 max-w-6xl mx-auto w-full">
              <RecordingsHero title="הקלטות פגישה" items={items} subjectLabel="ההקלטות" />

              <WorkspaceFolderBanner workspace="architect" onSynced={load} />

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px] md:hidden">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="חיפוש..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-8 h-9"
                  />
                </div>
                <div className="inline-flex items-center rounded-lg border bg-card p-0.5 text-xs">
                  {([
                    { k: "all", label: "הכל" },
                    { k: "ready", label: "מוכנים" },
                    { k: "pending", label: "ממתינים" },
                  ] as const).map((opt) => (
                    <button
                      key={opt.k}
                      onClick={() => setFilterMode(opt.k)}
                      className={`px-3 h-8 rounded-md transition-colors ${
                        filterMode === opt.k
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {syncing && (
                  <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3 w-3 animate-spin" /> מסנכרן...
                  </span>
                )}
              </div>

              {loading ? (
                <div className="text-center py-16 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  טוען הקלטות...
                </div>
              ) : filtered.length === 0 ? (
                <Card className="p-12 text-center border-dashed">
                  <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                    <Mic className="h-8 w-8 text-primary" />
                  </div>
                  <h3 className="font-semibold text-base mb-1">
                    {items.length === 0 ? "אין הקלטות עדיין" : "אין תוצאות מתאימות"}
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    {items.length === 0
                      ? "סנכרני מ-Drive או הקליטי שיחה חדשה כדי להתחיל"
                      : "נסי חיפוש אחר או שני את הסינון"}
                  </p>
                  {items.length === 0 && (
                    <div className="flex justify-center">
                      <RecordCallButton workspace="architect" onCreated={load} />
                    </div>
                  )}
                </Card>
              ) : (
                <>
                  {unassigned.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 px-1">
                        <h2 className="text-sm font-semibold text-warning">הקלטות לשיוך</h2>
                        <Badge variant="outline">{unassigned.length}</Badge>
                      </div>
                      <div className="space-y-2.5">{unassigned.map(renderCard)}</div>
                    </div>
                  )}
                  {assigned.length > 0 && (
                    <div className="space-y-2.5">
                      {unassigned.length > 0 && (
                        <h2 className="text-sm font-semibold text-muted-foreground px-1 pt-2">
                          הקלטות משויכות
                        </h2>
                      )}
                      <div className="space-y-2.5">{assigned.map(renderCard)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
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
