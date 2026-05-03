import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Search, Eye, Download, Loader2, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";
import { exportTranscriptToPdf } from "@/lib/exportTranscriptPdf";

type Workspace = "appraiser" | "architect";

interface TranscriptItem {
  id: string;
  table: "recordings" | "meeting_recordings";
  filename: string;
  recorded_at: string;
  transcript: string;
  transcription_service: string | null;
  drive_url: string | null;
  context?: string | null;
  client?: string | null;
}

interface Props { workspace: Workspace; title?: string; }

const serviceLabel = (svc?: string | null) => {
  if (!svc) return "תמלול";
  if (svc === "merged") return "תמלול-על";
  if (svc === "edited") return "ערוך ידנית";
  if (svc === "elevenlabs") return "AI איכות גבוהה";
  if (svc === "whisper") return "AI מהיר";
  if (svc === "ivrit_ai") return "AI חסכוני";
  return "תמלול";
};

export default function TranscriptsPage({ workspace, title = "תמלולים" }: Props) {
  const [items, setItems] = useState<TranscriptItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [openTarget, setOpenTarget] = useState<TranscriptItem | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      if (workspace === "appraiser") {
        const { data, error } = await supabase
          .from("recordings")
          .select("id, filename, recorded_at, transcript, transcription_service, drive_url, case_id")
          .not("transcript", "is", null)
          .order("recorded_at", { ascending: false });
        if (error) throw error;
        const recs = data ?? [];
        const caseIds = Array.from(new Set(recs.map((r: any) => r.case_id).filter(Boolean)));
        const caseMap = new Map<string, any>();
        if (caseIds.length) {
          const { data: cs } = await supabase.from("cases").select("id, title, case_number, client_name").in("id", caseIds);
          (cs ?? []).forEach((c: any) => caseMap.set(c.id, c));
        }
        setItems(recs.map((r: any): TranscriptItem => {
          const c = r.case_id ? caseMap.get(r.case_id) : null;
          return {
            id: r.id,
            table: "recordings",
            filename: r.filename,
            recorded_at: r.recorded_at,
            transcript: r.transcript,
            transcription_service: r.transcription_service,
            drive_url: r.drive_url,
            context: c ? `תיק ${c.case_number} • ${c.title}` : null,
            client: c?.client_name ?? null,
          };
        }));
      } else {
        const { data, error } = await supabase
          .from("meeting_recordings")
          .select("id, filename, recorded_at, transcript, transcription_service, drive_url, meeting_id")
          .not("transcript", "is", null)
          .order("recorded_at", { ascending: false });
        if (error) throw error;
        const recs = data ?? [];
        const ids = Array.from(new Set(recs.map((r: any) => r.meeting_id).filter(Boolean)));
        const mMap = new Map<string, any>();
        if (ids.length) {
          const { data: ms } = await supabase.from("meetings").select("id, title, client_name").in("id", ids);
          (ms ?? []).forEach((m: any) => mMap.set(m.id, m));
        }
        setItems(recs.map((r: any): TranscriptItem => {
          const m = r.meeting_id ? mMap.get(r.meeting_id) : null;
          return {
            id: r.id,
            table: "meeting_recordings",
            filename: r.filename,
            recorded_at: r.recorded_at,
            transcript: r.transcript,
            transcription_service: r.transcription_service,
            drive_url: r.drive_url,
            context: m ? `פגישה: ${m.title}` : null,
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

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [workspace]);

  const filtered = items.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.filename.toLowerCase().includes(q) ||
      (r.transcript ?? "").toLowerCase().includes(q) ||
      (r.context ?? "").toLowerCase().includes(q) ||
      (r.client ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
            <FileText className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold flex-1">{title}</h1>
            <Badge variant="secondary">{items.length}</Badge>
            <div className="relative w-72 max-w-full">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש בטקסט, קובץ, לקוח..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8"
              />
            </div>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-3">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  טוען תמלולים...
                </div>
              ) : filtered.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <FileText className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  אין תמלולים זמינים עדיין. הקלט או סנכרן קובץ ולחץ "תמלל".
                </Card>
              ) : (
                filtered.map((r) => {
                  const wordCount = r.transcript.trim().split(/\s+/).length;
                  return (
                    <Card key={`${r.table}-${r.id}`} className="p-4 flex items-start gap-4 hover:border-primary/50 transition-colors">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Mic className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium truncate">{r.filename}</span>
                          <Badge variant="secondary">{serviceLabel(r.transcription_service)}</Badge>
                          <Badge variant="outline" className="text-xs">{wordCount} מילים</Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                          {r.context && <span>{r.context}</span>}
                          {r.client && <span>לקוח: {r.client}</span>}
                          <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-2 line-clamp-2" dir="rtl">
                          {r.transcript.slice(0, 240)}{r.transcript.length > 240 ? "..." : ""}
                        </p>
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        <Button size="sm" onClick={() => setOpenTarget(r)} className="gap-1">
                          <Eye className="h-3.5 w-3.5" /> צפה
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1"
                          onClick={() => exportTranscriptToPdf(r.transcript, {
                            filename: r.filename,
                            recordedAt: r.recorded_at,
                            context: r.context,
                            client: r.client,
                          })}
                        >
                          <Download className="h-3.5 w-3.5" /> PDF
                        </Button>
                      </div>
                    </Card>
                  );
                })
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
          defaultTab="view"
          onUpdated={load}
        />
      )}
    </SidebarProvider>
  );
}
