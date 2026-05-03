import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Phone, Loader2, RefreshCw, Search, ExternalLink, Settings as SettingsIcon, FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspaceFolder, type WorkspaceKind } from "@/hooks/useWorkspaceFolder";
import { useDriveSync } from "@/hooks/useDriveSync";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { RecordCallButton } from "@/components/RecordCallButton";
import { RecordingCard } from "@/components/RecordingCard";
import { ExpandableTranscriptPanel } from "@/components/ExpandableTranscriptPanel";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { AssignRecordingDialog } from "@/components/AssignRecordingDialog";
import { AssignToMeetingDialog } from "@/components/AssignToMeetingDialog";

interface PhoneCallsPageProps {
  workspace: WorkspaceKind;
  title: string;
}

interface Row {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript: string | null;
  drive_url: string | null;
  source: string | null;
  case_id?: string | null;
  meeting_id?: string | null;
  case_title?: string;
  case_number?: string;
  client_name?: string;
  meeting_title?: string;
}

type FilterMode = "all" | "ready" | "pending";

export default function PhoneCallsPage({ workspace, title }: PhoneCallsPageProps) {
  const { folder, folderUrl, loading: folderLoading } = useWorkspaceFolder(workspace, "calls");
  const { sync, syncing } = useDriveSync(workspace, "calls");
  const { runAll, running } = useTranscribeAll();
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedMode, setExpandedMode] = useState<"view" | "edit">("view");
  const [transcribeTarget, setTranscribeTarget] = useState<Row | null>(null);
  const [viewTarget, setViewTarget] = useState<Row | null>(null);
  const [assignTarget, setAssignTarget] = useState<Row | null>(null);

  const table = workspace === "appraiser" ? "recordings" : "meeting_recordings";

  const load = async () => {
    setLoading(true);
    const baseSelect = workspace === "appraiser"
      ? "id, filename, duration, recorded_at, transcript_status, transcript, drive_url, source, case_id"
      : "id, filename, duration, recorded_at, transcript_status, transcript, drive_url, source, meeting_id";
    const { data, error } = await supabase
      .from(table)
      .select(baseSelect)
      .eq("source", "phone_call")
      .order("recorded_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const rows = (data ?? []) as Row[];
    if (workspace === "appraiser") {
      const ids = Array.from(new Set(rows.map((r) => r.case_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: cases } = await supabase
          .from("cases")
          .select("id, title, case_number, client_name")
          .in("id", ids);
        const m = new Map<string, any>((cases ?? []).map((c: any) => [c.id, c]));
        rows.forEach((r) => {
          if (!r.case_id) return;
          const c = m.get(r.case_id);
          if (c) { r.case_title = c.title; r.case_number = c.case_number; r.client_name = c.client_name; }
        });
      }
    } else {
      const ids = Array.from(new Set(rows.map((r) => r.meeting_id).filter(Boolean) as string[]));
      if (ids.length) {
        const { data: meetings } = await supabase.from("meetings").select("id, title").in("id", ids);
        const m = new Map<string, any>((meetings ?? []).map((x: any) => [x.id, x]));
        rows.forEach((r) => { if (r.meeting_id) r.meeting_title = m.get(r.meeting_id)?.title; });
      }
    }
    setItems(rows);
    setLoading(false);
  };

  useEffect(() => {
    load();
    void sync(true).then((r) => { if (r && r.added > 0) load(); });
    const id = window.setInterval(() => {
      void sync(true).then((r) => { if (r && r.added > 0) load(); });
    }, 120_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [folder?.folder_id, workspace]);

  const filtered = items.filter((r) => {
    if (filterMode === "ready" && !r.transcript) return false;
    if (filterMode === "pending" && r.transcript) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.filename.toLowerCase().includes(q) ||
      (r.case_title ?? "").toLowerCase().includes(q) ||
      (r.client_name ?? "").toLowerCase().includes(q) ||
      (r.meeting_title ?? "").toLowerCase().includes(q)
    );
  });

  const handleSuper = async (r: Row) => {
    if (!r.drive_url) { toast.error("אין קובץ אודיו זמין"); return; }
    await supabase.from(table).update({ transcript_status: "processing" }).eq("id", r.id);
    load();
    await runAll({
      recordingId: r.id,
      audioUrl: r.drive_url,
      table,
      context: { title: r.filename, client: r.client_name },
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
        data={r as any}
        isRunning={running === r.id}
        workspace={workspace}
        onView={() => toggleExpand("view")}
        onEdit={() => toggleExpand("edit")}
        onAssign={() => setAssignTarget(r)}
        onSuperTranscribe={() => handleSuper(r)}
        onQuickTranscribe={() => setTranscribeTarget(r)}
        expanded={isExpanded}
        expandedSlot={
          <ExpandableTranscriptPanel
            open={isExpanded}
            mode={expandedMode}
            item={{
              id: r.id,
              table,
              filename: r.filename,
              recordedAt: r.recorded_at,
              duration: r.duration,
              transcript: r.transcript,
              transcriptStatus: r.transcript_status,
              audioUrl: r.drive_url,
              context: workspace === "appraiser"
                ? (r.case_id && r.case_number ? `תיק ${r.case_number} • ${r.case_title ?? ""}` : null)
                : (r.meeting_title ? `פגישה: ${r.meeting_title}` : null),
              client: r.client_name ?? null,
              meetingId: r.meeting_id ?? null,
              meetingTitle: r.meeting_title ?? null,
              assignLabel: workspace === "appraiser"
                ? (r.case_id ? "החלף תיק" : "שייך")
                : (r.meeting_id ? "החלף" : "שייך"),
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
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0 sticky top-0 z-20">
            <SidebarTrigger />
            <Phone className="h-5 w-5 text-primary shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold leading-tight truncate">{title}</h1>
              <p className="text-[11px] text-muted-foreground leading-tight truncate">
                {items.length} שיחות
              </p>
            </div>
            <div className="relative w-64 max-w-full hidden md:block">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8 h-9"
              />
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={() => sync().then((r) => { if (r && r.added > 0) load(); })} disabled={syncing || !folder}>
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              סנכרן
            </Button>
            <RecordCallButton workspace={workspace} purpose="calls" label="שיחה חדשה" onCreated={() => { load(); void sync(true); }} />
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3 max-w-5xl mx-auto">
              {!folder && !folderLoading && (
                <Card className="p-6 flex items-center gap-4">
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">לא הוגדרה תיקיית שיחות טלפון</div>
                    <div className="text-sm text-muted-foreground">
                      קבע ב-Drive תיקייה ייעודית לשיחות שמוקלטות אוטומטית מהטלפון, ושייך אותה כאן.
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/settings" className="gap-2">
                      <SettingsIcon className="h-4 w-4" />
                      פתח הגדרות
                    </Link>
                  </Button>
                </Card>
              )}

              {folder && (
                <Card className="p-3 flex items-center gap-3 bg-muted/30">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">תיקיית שיחות טלפון</div>
                    <div className="text-sm font-medium truncate">{folder.folder_name}</div>
                  </div>
                  {folderUrl && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={folderUrl} target="_blank" rel="noreferrer" className="gap-1">
                        פתח ב-Drive <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </Card>
              )}

              <div className="flex items-center gap-2 flex-wrap">
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

              {loading && items.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  טוען שיחות...
                </div>
              ) : filtered.length === 0 ? (
                <Card className="p-10 text-center text-muted-foreground border-dashed">
                  <Phone className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  אין שיחות להצגה. הקלטות שיועלו ל-Drive או יוקלטו דרך הכפתור יופיעו כאן אוטומטית.
                </Card>
              ) : (
                <div className="space-y-2.5">{filtered.map(renderCard)}</div>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>

      {transcribeTarget && (
        <TranscribeDialog
          open={!!transcribeTarget}
          onOpenChange={(o) => !o && setTranscribeTarget(null)}
          recordingId={transcribeTarget.id}
          audioUrl={transcribeTarget.drive_url ?? ""}
          table={table}
          onCompleted={load}
        />
      )}
      {viewTarget && (
        <TranscriptViewerDialog
          open={!!viewTarget}
          onOpenChange={(o) => !o && setViewTarget(null)}
          recordingId={viewTarget.id}
          table={table}
          filename={viewTarget.filename}
          recordedAt={viewTarget.recorded_at}
          audioUrl={viewTarget.drive_url}
          transcript={viewTarget.transcript}
          context={
            workspace === "appraiser"
              ? (viewTarget.case_id && viewTarget.case_number ? `תיק ${viewTarget.case_number}` : null)
              : (viewTarget.meeting_title ? `פגישה: ${viewTarget.meeting_title}` : null)
          }
          defaultTab="view"
          onUpdated={load}
        />
      )}
      {assignTarget && workspace === "appraiser" && (
        <AssignRecordingDialog
          open={!!assignTarget}
          onOpenChange={(o) => !o && setAssignTarget(null)}
          recordingId={assignTarget.id}
          recordingFilename={assignTarget.filename}
          onAssigned={load}
        />
      )}
      {assignTarget && workspace === "architect" && (
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
}
