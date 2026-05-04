import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { RecordingCard } from "@/components/RecordingCard";
import { RecordingsHero } from "@/components/RecordingsHero";
import { Mic, Loader2, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { AssignRecordingDialog } from "@/components/AssignRecordingDialog";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { ExpandableTranscriptPanel } from "@/components/ExpandableTranscriptPanel";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { RecordCallButton } from "@/components/RecordCallButton";
import { useDriveSync } from "@/hooks/useDriveSync";

type FilterMode = "all" | "ready" | "pending";

interface RecordingRow {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript: string | null;
  drive_url: string | null;
  drive_file_id: string | null;
  case_id: string | null;
  source: string | null;
  tags: string[] | null;
  case_title?: string;
  case_number?: string;
  client_name?: string;
}


const Recordings = () => {
  const [items, setItems] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<RecordingRow | null>(null);
  const [transcribeTarget, setTranscribeTarget] = useState<RecordingRow | null>(null);
  const [viewTarget, setViewTarget] = useState<RecordingRow | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<"view" | "edit">("view");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const { runAll, running } = useTranscribeAll();
  const { sync, syncing } = useDriveSync("appraiser");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recordings")
      .select("id, filename, duration, recorded_at, transcript_status, transcript, drive_url, drive_file_id, case_id, source, tags")
      .order("recorded_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const recs = (data ?? []) as RecordingRow[];
    const caseIds = Array.from(new Set(recs.map((r) => r.case_id).filter(Boolean) as string[]));
    if (caseIds.length > 0) {
      const { data: cases } = await supabase
        .from("cases")
        .select("id, title, case_number, client_name")
        .in("id", caseIds);
      const m = new Map<string, any>((cases ?? []).map((c: any) => [c.id, c]));
      recs.forEach((r) => {
        if (!r.case_id) return;
        const c = m.get(r.case_id);
        if (c) {
          r.case_title = c.title;
          r.case_number = c.case_number;
          r.client_name = c.client_name;
        }
      });
    }
    setItems(recs);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // Auto-sync from Drive on mount (silent — no toast spam)
    void sync().then((r) => { if (r && r.added > 0) load(); });
    // Re-sync periodically while page is open (every 2 minutes)
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
      (r.case_title ?? "").toLowerCase().includes(q) ||
      (r.case_number ?? "").toLowerCase().includes(q) ||
      (r.client_name ?? "").toLowerCase().includes(q)
    );
  });

  const unassigned = filtered.filter((r) => !r.case_id);
  const tagged = filtered.filter((r) => !!r.case_id);

  const handleQuickTranscribe = async (r: RecordingRow) => {
    if (!r.drive_url) {
      toast.error("אין קובץ אודיו זמין");
      return;
    }
    // mark processing immediately for UX
    await supabase.from("recordings").update({ transcript_status: "processing" }).eq("id", r.id);
    load();
    await runAll({
      recordingId: r.id,
      audioUrl: r.drive_url,
      table: "recordings",
      context: { title: r.filename, client: r.client_name, project: r.case_title },
      onCompleted: load,
    });
  };

  const renderCard = (r: RecordingRow) => {
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
        workspace="appraiser"
        table="recordings"
        onView={() => toggleExpand("view")}
        onEdit={() => toggleExpand("edit")}
        onAssign={() => setAssignTarget(r)}
        onSuperTranscribe={() => handleQuickTranscribe(r)}
        onQuickTranscribe={() => setTranscribeTarget(r)}
        onRenamed={load}
        expanded={isExpanded}
        expandedSlot={
          <ExpandableTranscriptPanel
            open={isExpanded}
            mode={expandedMode}
            item={{
              id: r.id,
              table: "recordings",
              filename: r.filename,
              recordedAt: r.recorded_at,
              duration: r.duration,
              transcript: r.transcript,
              transcriptStatus: r.transcript_status,
              audioUrl: r.drive_url,
              driveFileId: r.drive_file_id,
              context: r.case_id && r.case_number ? `תיק ${r.case_number} • ${r.case_title ?? ""}` : null,
              client: r.client_name ?? null,
              assignLabel: r.case_id ? "החלף תיק" : "שייך",
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
              <h1 className="text-base font-semibold leading-tight truncate">הקלטות שטח</h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">
                {items.length} פריטים
              </p>
            </div>
            <div className="relative w-72 max-w-full hidden md:block">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי קובץ, תיק, לקוח..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8 h-9"
              />
            </div>
            <RecordCallButton workspace="appraiser" onCreated={load} />
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4 lg:p-6 space-y-5 max-w-6xl mx-auto w-full">
              <RecordingsHero title="הקלטות שטח" items={items} subjectLabel="ההקלטות" />

              <WorkspaceFolderBanner workspace="appraiser" onSynced={load} />

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
                      <RecordCallButton workspace="appraiser" onCreated={load} />
                    </div>
                  )}
                </Card>
              ) : (
                <>
                  {unassigned.length > 0 && (
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 px-1">
                        <h2 className="text-sm font-semibold text-warning">הקלטות חדשות לתיוג</h2>
                        <Badge variant="outline">{unassigned.length}</Badge>
                      </div>
                      <div className="space-y-2.5">{unassigned.map(renderCard)}</div>
                    </div>
                  )}

                  {tagged.length > 0 && (
                    <div className="space-y-2.5">
                      {unassigned.length > 0 && (
                        <h2 className="text-sm font-semibold text-muted-foreground px-1 pt-2">
                          הקלטות מתויגות
                        </h2>
                      )}
                      <div className="space-y-2.5">{tagged.map(renderCard)}</div>
                    </div>
                  )}
                </>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>

      {assignTarget && (
        <AssignRecordingDialog
          open={!!assignTarget}
          onOpenChange={(o) => !o && setAssignTarget(null)}
          recordingId={assignTarget.id}
          recordingFilename={assignTarget.filename}
          initialTags={assignTarget.tags ?? []}
          initialCaseId={assignTarget.case_id}
          onAssigned={load}
        />
      )}

      {transcribeTarget && (
        <TranscribeDialog
          recordingId={transcribeTarget.id}
          audioUrl={transcribeTarget.drive_url ?? undefined}
          table="recordings"
          open={!!transcribeTarget}
          onOpenChange={(o) => !o && setTranscribeTarget(null)}
          trigger={null}
          onCompleted={() => {
            setTranscribeTarget(null);
            load();
          }}
        />
      )}

      {viewTarget && (
        <TranscriptViewerDialog
          open={!!viewTarget}
          onOpenChange={(o) => !o && setViewTarget(null)}
          recordingId={viewTarget.id}
          table="recordings"
          filename={viewTarget.filename}
          recordedAt={viewTarget.recorded_at}
          audioUrl={viewTarget.drive_url}
          transcript={viewTarget.transcript}
          context={viewTarget.case_id && viewTarget.case_number ? `תיק ${viewTarget.case_number} • ${viewTarget.case_title ?? ""}` : null}
          client={viewTarget.client_name ?? null}
          defaultTab="view"
          onUpdated={load}
        />
      )}
    </SidebarProvider>
  );
};

export default Recordings;
