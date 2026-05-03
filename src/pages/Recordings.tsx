import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Mic,
  Loader2,
  Search,
  FileText,
  Clock,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Tag,
  Cloud,
  Sparkles,
  Zap,
  ChevronDown,
  Eye,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { AssignRecordingDialog } from "@/components/AssignRecordingDialog";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { RecordCallButton } from "@/components/RecordCallButton";
import { useDriveSync } from "@/hooks/useDriveSync";

interface RecordingRow {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript: string | null;
  drive_url: string | null;
  case_id: string | null;
  source: string | null;
  tags: string[] | null;
  case_title?: string;
  case_number?: string;
  client_name?: string;
}

const STATUS: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: "ממתין", icon: Clock, cls: "bg-muted text-muted-foreground" },
  processing: { label: "מתמלל", icon: Loader2, cls: "bg-primary/10 text-primary" },
  completed: { label: "הושלם", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700" },
  failed: { label: "נכשל", icon: AlertCircle, cls: "bg-destructive/10 text-destructive" },
};

const Recordings = () => {
  const [items, setItems] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [assignTarget, setAssignTarget] = useState<RecordingRow | null>(null);
  const [transcribeTarget, setTranscribeTarget] = useState<RecordingRow | null>(null);
  const [viewTarget, setViewTarget] = useState<RecordingRow | null>(null);
  const { runAll, running } = useTranscribeAll();
  const { sync, syncing } = useDriveSync("appraiser");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recordings")
      .select("id, filename, duration, recorded_at, transcript_status, transcript, drive_url, case_id, source, tags")
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
    const q = search.trim().toLowerCase();
    if (!q) return true;
    const hit =
      r.filename.toLowerCase().includes(q) ||
      (r.case_title ?? "").toLowerCase().includes(q) ||
      (r.case_number ?? "").toLowerCase().includes(q) ||
      (r.client_name ?? "").toLowerCase().includes(q);
    return hit;
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

  const handleCardClick = (r: RecordingRow) => {
    if (r.transcript) {
      setViewTarget(r);
    } else {
      // open viewer (which contains transcribe options) for unified flow
      setViewTarget(r);
    }
  };

  const renderCard = (r: RecordingRow) => {
    const st = STATUS[r.transcript_status] ?? STATUS.pending;
    const Icon = st.icon;
    const isRunning = running === r.id;
    return (
      <Card
        key={r.id}
        onClick={() => handleCardClick(r)}
        className="p-4 flex items-start gap-4 hover:border-primary hover:shadow-md transition-all cursor-pointer group"
      >
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:bg-primary/20 transition-colors">
          <Mic className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{r.filename}</span>
            <Badge className={`gap-1 ${st.cls}`} variant="secondary">
              <Icon className={`h-3 w-3 ${r.transcript_status === "processing" || isRunning ? "animate-spin" : ""}`} />
              {isRunning ? "מתמלל..." : st.label}
            </Badge>
            {r.transcript && (
              <Badge variant="outline" className="gap-1">
                <FileText className="h-3 w-3" />
                תמלול
              </Badge>
            )}
            {r.source === "drive_sync" && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Cloud className="h-3 w-3" />
                Drive
              </Badge>
            )}
          </div>

          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
            {r.case_id && r.case_number ? (
              <Link to={`/cases?id=${r.case_id}`} onClick={(e) => e.stopPropagation()} className="hover:text-primary">
                תיק {r.case_number} • {r.case_title}
              </Link>
            ) : (
              <span className="text-warning">לא משויך לתיק</span>
            )}
            {r.client_name && <span>לקוח: {r.client_name}</span>}
            <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
            {r.duration && <span>{r.duration}</span>}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {!r.transcript && (
            <Button
              size="sm"
              variant="default"
              className="gap-1"
              disabled={isRunning}
              onClick={() => handleQuickTranscribe(r)}
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              תמלל-על
            </Button>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {r.transcript && (
                <>
                  <DropdownMenuItem onClick={() => setViewTarget(r)}>
                    <Eye className="h-4 w-4 ml-2" /> פתח תמלול לעריכה
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              {!r.transcript && (
                <>
                  <DropdownMenuLabel>תמלול</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => handleQuickTranscribe(r)}>
                    <Sparkles className="h-4 w-4 ml-2 text-primary" /> תמלול-על
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setTranscribeTarget(r)}>
                    <Zap className="h-4 w-4 ml-2 text-primary" /> תמלול מהיר
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              )}
              <DropdownMenuItem onClick={() => setAssignTarget(r)}>
                <Tag className="h-4 w-4 ml-2" /> {r.case_id ? "החלף תיק" : "שייך לתיק"}
              </DropdownMenuItem>
              {r.drive_url && (
                <DropdownMenuItem asChild>
                  <a href={r.drive_url} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4 ml-2" /> פתח ב-Drive
                  </a>
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </Card>
    );
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1 flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">הקלטות שטח</h1>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="relative w-72 max-w-full">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי קובץ, תיק, תווית..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8"
              />
            </div>
            <RecordCallButton workspace="appraiser" onCreated={load} />
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4">
              <WorkspaceFolderBanner workspace="appraiser" onSynced={load} />

              {syncing && (
                <div className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  מסנכרן מ-Drive...
                </div>
              )}

              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  טוען הקלטות...
                </div>
              ) : filtered.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Mic className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  אין הקלטות עדיין. הגדר תיקיית Drive וסנכרן, או הוסף הקלטה מתיק.
                </Card>
              ) : (
                <>
                  {unassigned.length > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 px-1">
                        <h2 className="text-sm font-semibold text-warning">
                          הקלטות חדשות לתיוג
                        </h2>
                        <Badge variant="outline">{unassigned.length}</Badge>
                      </div>
                      <div className="space-y-2">{unassigned.map(renderCard)}</div>
                    </div>
                  )}

                  {tagged.length > 0 && (
                    <div className="space-y-2">
                      {unassigned.length > 0 && (
                        <h2 className="text-sm font-semibold text-muted-foreground px-1 pt-2">
                          הקלטות מתויגות
                        </h2>
                      )}
                      <div className="space-y-2">{tagged.map(renderCard)}</div>
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
