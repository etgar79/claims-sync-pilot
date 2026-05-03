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

  const renderCard = (r: RecordingRow) => {
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
              {isRunning ? "מתמלל-על..." : st.label}
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
              <Link to={`/cases?id=${r.case_id}`} className="hover:text-primary">
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

        <div className="flex flex-col gap-1.5 shrink-0">
          {/* View transcript button — always available when transcript exists */}
          {r.transcript && (
            <Button size="sm" variant="default" className="gap-1" onClick={() => setViewTarget(r)}>
              <Eye className="h-3.5 w-3.5" />
              צפה בתמלול
            </Button>
          )}

          {/* Transcribe split-button (only when no transcript yet) */}
          {!r.transcript && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="default" className="gap-1" disabled={isRunning}>
                  {isRunning ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Mic className="h-3.5 w-3.5" />
                  )}
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
                    <span className="text-xs text-muted-foreground">3 מנועים + מיזוג AI</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTranscribeTarget(r)} className="gap-2">
                  <Zap className="h-4 w-4 text-primary" />
                  <div className="flex flex-col">
                    <span className="font-medium">תמלול מהיר</span>
                    <span className="text-xs text-muted-foreground">בחר מנוע יחיד</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}

          <Button size="sm" variant="outline" className="gap-1" onClick={() => setAssignTarget(r)}>
            <Tag className="h-3.5 w-3.5" />
            {r.case_id ? "החלף תיק" : "שייך לתיק"}
          </Button>

          {r.drive_url && (
            <a
              href={r.drive_url}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-primary inline-flex items-center gap-1 justify-center"
            >
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
    </SidebarProvider>
  );
};

export default Recordings;
