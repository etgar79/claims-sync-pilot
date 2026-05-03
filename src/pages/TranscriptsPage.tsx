import { useEffect, useMemo, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Search, Eye, Download, FileDown, Loader2, Mic, Pencil, Copy,
  Sparkles, Zap, ExternalLink, Tag, CheckCircle2, Clock, AlertCircle, Filter,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { ExpandableTranscriptPanel } from "@/components/ExpandableTranscriptPanel";
import { exportTranscriptToPdf, downloadTranscriptTxt } from "@/lib/exportTranscriptPdf";
import { WorkspaceFolderBanner } from "@/components/WorkspaceFolderBanner";
import { useDriveSync } from "@/hooks/useDriveSync";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { useUserRoles } from "@/hooks/useUserRoles";
import { serviceLabel } from "@/lib/serviceLabels";
import { AssignRecordingDialog } from "@/components/AssignRecordingDialog";
import { AssignToMeetingDialog } from "@/components/AssignToMeetingDialog";
import { TranscribeDialog } from "@/components/TranscribeDialog";

type Workspace = "appraiser" | "architect";

interface Item {
  id: string;
  table: "recordings" | "meeting_recordings";
  filename: string;
  recorded_at: string;
  transcript: string | null;
  transcript_status: string;
  transcription_service: string | null;
  drive_url: string | null;
  context?: string | null;
  context_id?: string | null;
  client?: string | null;
}

interface Props { workspace: Workspace; title?: string; }

const STATUS = {
  pending: { label: "ממתין לתמלול", icon: Clock, cls: "bg-muted text-muted-foreground border-border" },
  processing: { label: "מתמלל...", icon: Loader2, cls: "bg-primary/10 text-primary border-primary/30" },
  completed: { label: "מוכן", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700 border-green-500/30" },
  failed: { label: "נכשל", icon: AlertCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
} as const;

type FilterMode = "all" | "ready" | "pending";

export default function TranscriptsPage({ workspace, title }: Props) {
  const headerTitle = title ?? (workspace === "architect" ? "תמלולי פגישות" : "תמלולים");
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterMode, setFilterMode] = useState<FilterMode>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [openTarget, setOpenTarget] = useState<Item | null>(null);
  const [openMode, setOpenMode] = useState<"view" | "edit">("view");
  const [assignTarget, setAssignTarget] = useState<Item | null>(null);
  const [transcribeTarget, setTranscribeTarget] = useState<Item | null>(null);
  const { sync, syncing } = useDriveSync(workspace);
  const { runAll, running } = useTranscribeAll();
  const { displayName, email } = useUserRoles();

  const userLabel = displayName || (email ? email.split("@")[0] : "");

  const load = async () => {
    setLoading(true);
    try {
      if (workspace === "appraiser") {
        const { data, error } = await supabase
          .from("recordings")
          .select("id, filename, recorded_at, transcript, transcript_status, transcription_service, drive_url, case_id")
          .order("recorded_at", { ascending: false });
        if (error) throw error;
        const recs = data ?? [];
        const ids = Array.from(new Set(recs.map((r: any) => r.case_id).filter(Boolean)));
        const map = new Map<string, any>();
        if (ids.length) {
          const { data: cs } = await supabase.from("cases").select("id, title, case_number, client_name").in("id", ids);
          (cs ?? []).forEach((c: any) => map.set(c.id, c));
        }
        setItems(recs.map((r: any): Item => {
          const c = r.case_id ? map.get(r.case_id) : null;
          return {
            id: r.id, table: "recordings",
            filename: r.filename, recorded_at: r.recorded_at,
            transcript: r.transcript, transcript_status: r.transcript_status,
            transcription_service: r.transcription_service, drive_url: r.drive_url,
            context: c ? `תיק ${c.case_number} • ${c.title}` : null,
            context_id: r.case_id ?? null,
            client: c?.client_name ?? null,
          };
        }));
      } else {
        const { data, error } = await supabase
          .from("meeting_recordings")
          .select("id, filename, recorded_at, transcript, transcript_status, transcription_service, drive_url, meeting_id")
          .order("recorded_at", { ascending: false });
        if (error) throw error;
        const recs = data ?? [];
        const ids = Array.from(new Set(recs.map((r: any) => r.meeting_id).filter(Boolean)));
        const map = new Map<string, any>();
        if (ids.length) {
          const { data: ms } = await supabase.from("meetings").select("id, title, client_name").in("id", ids);
          (ms ?? []).forEach((m: any) => map.set(m.id, m));
        }
        setItems(recs.map((r: any): Item => {
          const m = r.meeting_id ? map.get(r.meeting_id) : null;
          return {
            id: r.id, table: "meeting_recordings",
            filename: r.filename, recorded_at: r.recorded_at,
            transcript: r.transcript, transcript_status: r.transcript_status,
            transcription_service: r.transcription_service, drive_url: r.drive_url,
            context: m ? `פגישה: ${m.title}` : null,
            context_id: r.meeting_id ?? null,
            client: m?.client_name ?? null,
          };
        }));
      }
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    void sync().then((r) => { if (r && r.added > 0) load(); });
    const id = window.setInterval(() => {
      void sync().then((r) => { if (r && r.added > 0) load(); });
    }, 120_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace]);

  const stats = useMemo(() => {
    const ready = items.filter((i) => !!i.transcript).length;
    const pending = items.length - ready;
    const totalWords = items.reduce((s, i) => s + (i.transcript ? i.transcript.trim().split(/\s+/).length : 0), 0);
    return { total: items.length, ready, pending, totalWords };
  }, [items]);

  const filtered = items.filter((r) => {
    if (filterMode === "ready" && !r.transcript) return false;
    if (filterMode === "pending" && r.transcript) return false;
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.filename.toLowerCase().includes(q) ||
      (r.transcript ?? "").toLowerCase().includes(q) ||
      (r.context ?? "").toLowerCase().includes(q) ||
      (r.client ?? "").toLowerCase().includes(q)
    );
  });

  const openView = (r: Item) => { setOpenMode("view"); setOpenTarget(r); };
  const openEdit = (r: Item) => { setOpenMode("edit"); setOpenTarget(r); };

  const downloadPdf = (r: Item) => {
    if (!r.transcript) return;
    exportTranscriptToPdf(r.transcript, {
      filename: r.filename, recordedAt: r.recorded_at, context: r.context, client: r.client,
    });
    toast.success("PDF ירד");
  };
  const downloadTxt = (r: Item) => {
    if (!r.transcript) return;
    downloadTranscriptTxt(r.transcript, r.filename);
    toast.success("TXT ירד");
  };
  const copyText = async (r: Item) => {
    if (!r.transcript) return;
    try { await navigator.clipboard.writeText(r.transcript); toast.success("הועתק ללוח"); }
    catch { toast.error("שגיאה בהעתקה"); }
  };

  const runSuper = async (r: Item) => {
    if (!r.drive_url) { toast.error("אין קובץ אודיו זמין"); return; }
    await supabase.from(r.table).update({ transcript_status: "processing" }).eq("id", r.id);
    load();
    await runAll({
      recordingId: r.id, audioUrl: r.drive_url, table: r.table,
      context: { title: r.filename, client: r.client ?? undefined },
      onCompleted: load,
    });
  };

  return (
    <TooltipProvider delayDuration={200}>
      <SidebarProvider defaultOpen>
        <div className="flex min-h-screen w-full bg-gradient-to-b from-background via-background to-primary/[0.02]">
          <AppSidebar />
          <SidebarInset className="flex flex-col">
            {/* Top bar */}
            <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-3 shrink-0 sticky top-0 z-20">
              <SidebarTrigger />
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary-foreground" />
              </div>
              <div className="flex-1 min-w-0">
                <h1 className="text-base font-semibold leading-tight truncate">{headerTitle}</h1>
                {userLabel && (
                  <p className="text-[11px] text-muted-foreground leading-tight truncate">
                    התמלולים של {userLabel}
                  </p>
                )}
              </div>
              <div className="relative w-72 max-w-full hidden md:block">
                <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש בטקסט, קובץ, לקוח..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-8 h-9"
                />
              </div>
            </header>

            <ScrollArea className="flex-1">
              <div className="p-4 lg:p-6 space-y-5 max-w-6xl mx-auto w-full">
                {/* Hero */}
                <div className="rounded-2xl border bg-gradient-to-l from-primary/5 via-card to-card p-5 shadow-sm">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="min-w-0">
                      <div className="text-xs text-muted-foreground mb-1">סקירה</div>
                      <h2 className="text-xl md:text-2xl font-bold leading-tight">
                        {stats.total === 0 ? "עוד אין תמלולים" : `${stats.ready} תמלולים מוכנים`}
                      </h2>
                      {stats.total > 0 && (
                        <p className="text-sm text-muted-foreground mt-1">
                          סה״כ {stats.total} פריטים · {stats.totalWords.toLocaleString("he-IL")} מילים תמללת עד היום
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2 flex-wrap">
                      <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5 bg-green-500/5 border-green-500/30 text-green-700">
                        <CheckCircle2 className="h-3 w-3" /> {stats.ready} מוכנים
                      </Badge>
                      <Badge variant="outline" className="gap-1.5 text-xs py-1 px-2.5 bg-amber-500/5 border-amber-500/30 text-amber-700">
                        <Clock className="h-3 w-3" /> {stats.pending} ממתינים
                      </Badge>
                    </div>
                  </div>
                </div>

                {/* Sync banner — בולט */}
                <WorkspaceFolderBanner workspace={workspace} onSynced={load} />

                {/* Mobile search + filter row */}
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

                {/* List */}
                {loading ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                    טוען תמלולים...
                  </div>
                ) : filtered.length === 0 ? (
                  <Card className="p-12 text-center border-dashed">
                    <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                      <FileText className="h-8 w-8 text-primary" />
                    </div>
                    <h3 className="font-semibold text-base mb-1">
                      {items.length === 0 ? "עוד אין תמלולים" : "אין תוצאות מתאימות"}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                      {items.length === 0
                        ? "סנכרני מ-Drive או הקליטי שיחה במסך ההקלטות כדי להתחיל"
                        : "נסי חיפוש אחר או שני את הסינון"}
                    </p>
                  </Card>
                ) : (
                  <div className="space-y-2.5">
                    {filtered.map((r) => (
                      <div key={`${r.table}-${r.id}`}>
                        <TranscriptRow
                          item={r}
                          workspace={workspace}
                          isRunning={running === r.id}
                          expanded={expandedId === `${r.table}-${r.id}`}
                          onToggleExpand={() => setExpandedId((prev) => prev === `${r.table}-${r.id}` ? null : `${r.table}-${r.id}`)}
                          onView={() => openView(r)}
                          onEdit={() => openEdit(r)}
                          onPdf={() => downloadPdf(r)}
                          onTxt={() => downloadTxt(r)}
                          onCopy={() => copyText(r)}
                          onAssign={() => setAssignTarget(r)}
                          onSuperTranscribe={() => runSuper(r)}
                          onQuickTranscribe={() => setTranscribeTarget(r)}
                        />
                        <ExpandableTranscriptPanel
                          open={expandedId === `${r.table}-${r.id}`}
                          mode="view"
                          item={{
                            id: r.id,
                            table: r.table,
                            filename: r.filename,
                            recordedAt: r.recorded_at,
                            transcript: r.transcript,
                            transcriptStatus: r.transcript_status,
                            transcriptionService: r.transcription_service,
                            audioUrl: r.drive_url,
                            context: r.context,
                            client: r.client,
                            assignLabel: r.context_id ? "החלף שיוך" : workspace === "appraiser" ? "שייך לתיק" : "שייך לפגישה",
                          }}
                          onToggle={() => setExpandedId((prev) => prev === `${r.table}-${r.id}` ? null : `${r.table}-${r.id}`)}
                          onAssign={() => setAssignTarget(r)}
                          onOpenDialog={() => openEdit(r)}
                          onQuickTranscribe={() => setTranscribeTarget(r)}
                          onUpdated={load}
                        />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </ScrollArea>
          </SidebarInset>
        </div>

        {openTarget && (
          <TranscriptViewerDialog
            open={!!openTarget}
            onOpenChange={(o) => !o && setOpenTarget(null)}
            recordingId={openTarget.id}
            table={openTarget.table}
            filename={openTarget.filename}
            recordedAt={openTarget.recorded_at}
            audioUrl={openTarget.drive_url}
            transcript={openTarget.transcript}
            transcriptionService={openTarget.transcription_service}
            context={openTarget.context}
            client={openTarget.client}
            defaultTab={openMode}
            onUpdated={load}
          />
        )}

        {assignTarget && workspace === "appraiser" && (
          <AssignRecordingDialog
            open={!!assignTarget}
            onOpenChange={(o) => !o && setAssignTarget(null)}
            recordingId={assignTarget.id}
            recordingFilename={assignTarget.filename}
            initialTags={[]}
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

        {transcribeTarget && (
          <TranscribeDialog
            open={!!transcribeTarget}
            onOpenChange={(o) => !o && setTranscribeTarget(null)}
            recordingId={transcribeTarget.id}
            audioUrl={transcribeTarget.drive_url ?? ""}
            table={transcribeTarget.table}
            trigger={null}
            onCompleted={load}
          />
        )}
      </SidebarProvider>
    </TooltipProvider>
  );
}

/* ---------------- Row ---------------- */

interface RowProps {
  item: Item;
  workspace: Workspace;
  isRunning: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
  onView: () => void;
  onEdit: () => void;
  onPdf: () => void;
  onTxt: () => void;
  onCopy: () => void;
  onAssign: () => void;
  onSuperTranscribe: () => void;
  onQuickTranscribe: () => void;
}

function TranscriptRow({
  item: r, workspace, isRunning, expanded, onToggleExpand, onView, onEdit, onPdf, onTxt, onCopy, onAssign,
  onSuperTranscribe, onQuickTranscribe,
}: RowProps) {
  const has = !!r.transcript;
  const status = isRunning
    ? STATUS.processing
    : (STATUS as any)[r.transcript_status] ?? STATUS.pending;
  const Icon = status.icon;
  const wordCount = has ? r.transcript!.trim().split(/\s+/).length : 0;

  return (
    <Card className="group relative overflow-hidden border-border/60 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all">
      <div className={`absolute top-0 right-0 left-0 h-0.5 ${
        r.transcript_status === "completed" ? "bg-gradient-to-l from-green-400 to-green-600" :
        r.transcript_status === "processing" || isRunning ? "bg-gradient-to-l from-primary/60 to-primary" :
        r.transcript_status === "failed" ? "bg-gradient-to-l from-destructive/60 to-destructive" :
        "bg-gradient-to-l from-muted-foreground/20 to-muted-foreground/40"
      }`} />

      <div className="p-4 flex items-start gap-3">
        <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 ${
          has ? "bg-gradient-to-br from-primary/15 to-primary/5" : "bg-muted"
        }`}>
          <Mic className={`h-5 w-5 ${has ? "text-primary" : "text-muted-foreground"}`} />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-semibold text-sm truncate">{r.filename}</h3>
            <Badge variant="outline" className={`gap-1 text-[10px] py-0 h-5 ${status.cls}`}>
              <Icon className={`h-3 w-3 ${r.transcript_status === "processing" || isRunning ? "animate-spin" : ""}`} />
              {status.label}
            </Badge>
            {has && (
              <Badge variant="secondary" className="text-[10px] py-0 h-5">
                {serviceLabel(r.transcription_service)}
              </Badge>
            )}
            {has && (
              <Badge variant="outline" className="text-[10px] py-0 h-5">
                {wordCount.toLocaleString("he-IL")} מילים
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-muted-foreground">
            {r.context ? (
              <span className="text-primary/90">{r.context}</span>
            ) : (
              <span className="text-warning font-medium">לא משויך</span>
            )}
            {r.client && <><span>•</span><span>לקוח: {r.client}</span></>}
            <span>•</span>
            <span>{new Date(r.recorded_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
          </div>

          {has && (
            <p className="text-xs text-muted-foreground/90 mt-2 line-clamp-2 leading-relaxed" dir="rtl">
              {r.transcript!.slice(0, 240)}{r.transcript!.length > 240 ? "…" : ""}
            </p>
          )}
        </div>
      </div>

      {/* Inline action bar — all options visible */}
      <div className="border-t border-border/40 bg-muted/20 px-2 py-1.5 flex items-center gap-0.5 flex-wrap">
        {has ? (
          <>
            <Tooltip><TooltipTrigger asChild>
              <Button size="sm" onClick={onToggleExpand} className="h-8 gap-1.5 text-xs">
                <Eye className="h-3.5 w-3.5" /> {expanded ? "סגור" : "צפה"}
              </Button>
            </TooltipTrigger><TooltipContent>פתח את סביבת העבודה המורחבת</TooltipContent></Tooltip>

            <Tooltip><TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={() => { onToggleExpand(); onEdit(); }} className="h-8 gap-1.5 text-xs">
                <Pencil className="h-3.5 w-3.5" /> ערוך
              </Button>
            </TooltipTrigger><TooltipContent>עריכה עם שמירה אוטומטית</TooltipContent></Tooltip>

            <div className="h-4 w-px bg-border mx-0.5" />

            <Tooltip><TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onPdf} className="h-8 gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
            </TooltipTrigger><TooltipContent>הורד כ־PDF</TooltipContent></Tooltip>

            <Tooltip><TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onTxt} className="h-8 gap-1.5 text-xs">
                <FileDown className="h-3.5 w-3.5" /> TXT
              </Button>
            </TooltipTrigger><TooltipContent>הורד כקובץ טקסט</TooltipContent></Tooltip>

            <Tooltip><TooltipTrigger asChild>
              <Button size="icon" variant="ghost" onClick={onCopy} className="h-8 w-8">
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger><TooltipContent>העתק ללוח</TooltipContent></Tooltip>
          </>
        ) : (
          <>
            <Button
              size="sm"
              onClick={onSuperTranscribe}
              disabled={isRunning || !r.drive_url}
              className="h-8 gap-1.5 text-xs bg-gradient-to-l from-primary to-primary-glow hover:opacity-90"
            >
              {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              תמלול-על
            </Button>
            <Button size="sm" variant="ghost" onClick={onQuickTranscribe} disabled={isRunning || !r.drive_url} className="h-8 gap-1.5 text-xs">
              <Zap className="h-3.5 w-3.5" /> מהיר
            </Button>
          </>
        )}

        <div className="flex-1" />

        <Tooltip><TooltipTrigger asChild>
          <Button size="sm" variant="ghost" onClick={onAssign} className="h-8 gap-1.5 text-xs">
            <Tag className="h-3.5 w-3.5" />
            {r.context_id
              ? "החלף שיוך"
              : workspace === "appraiser" ? "שייך לתיק" : "שייך לפגישה"}
          </Button>
        </TooltipTrigger><TooltipContent>{workspace === "appraiser" ? "שייך לתיק" : "שייך לפגישה"}</TooltipContent></Tooltip>

        {r.drive_url && (
          <Tooltip><TooltipTrigger asChild>
            <Button asChild size="icon" variant="ghost" className="h-8 w-8">
              <a href={r.drive_url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          </TooltipTrigger><TooltipContent>פתח ב-Drive</TooltipContent></Tooltip>
        )}
      </div>
    </Card>
  );
}
