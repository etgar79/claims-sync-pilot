import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  FileText, Copy, Download, Loader2, History, Users, Replace,
  Plus, X, ChevronDown, MoreVertical, Sparkles, Zap, Check, RotateCcw,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportTranscriptToPdf, downloadTranscriptTxt } from "@/lib/exportTranscriptPdf";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { TranscribeDialog } from "@/components/TranscribeDialog";

type TableName = "recordings" | "meeting_recordings";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  recordingId: string;
  table: TableName;
  filename: string;
  recordedAt?: string | null;
  audioUrl?: string | null;
  transcript: string | null;
  transcriptionService?: string | null;
  context?: string | null;
  client?: string | null;
  defaultTab?: "view" | "edit" | "regenerate";
  onUpdated?: () => void;
}

const serviceLabel = (svc?: string | null) => {
  if (!svc) return "תמלול";
  if (svc === "merged") return "תמלול-על";
  if (svc === "edited") return "ערוך ידנית";
  return "תמלול";
};

interface Version {
  id: string;
  service: string;
  transcript: string;
  is_merged: boolean;
  created_at: string;
}

type SaveState = "idle" | "saving" | "saved";

export function TranscriptViewerDialog({
  open, onOpenChange, recordingId, table, filename, recordedAt, audioUrl,
  transcript, transcriptionService, context, client, onUpdated,
}: Props) {
  const [edited, setEdited] = useState(transcript ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [versions, setVersions] = useState<Version[]>([]);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const [showReplacements, setShowReplacements] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const { runAll, running } = useTranscribeAll();
  const lastSavedRef = useRef<string>(transcript ?? "");
  const debounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (open) {
      setEdited(transcript ?? "");
      lastSavedRef.current = transcript ?? "";
      setSaveState("idle");
      void loadVersions();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, recordingId]);

  const loadVersions = async () => {
    const { data } = await supabase
      .from("transcript_versions")
      .select("id, service, transcript, is_merged, created_at")
      .eq("recording_id", recordingId)
      .order("created_at", { ascending: false });
    setVersions(data ?? []);
  };

  // Auto-save with debounce
  useEffect(() => {
    if (!open) return;
    if (edited === lastSavedRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setSaveState("saving");
    debounceRef.current = window.setTimeout(() => {
      void persist(edited);
    }, 1500);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [edited, open]);

  const persist = async (text: string) => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");
      const { error } = await supabase
        .from(table)
        .update({ transcript: text, transcript_status: "completed" })
        .eq("id", recordingId);
      if (error) throw error;
      lastSavedRef.current = text;
      setSaveState("saved");
      onUpdated?.();
      window.setTimeout(() => setSaveState((s) => (s === "saved" ? "idle" : s)), 1800);
    } catch (e: any) {
      setSaveState("idle");
      toast.error("שגיאה בשמירה", { description: e?.message });
    }
  };

  const saveVersionSnapshot = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transcript_versions").insert({
      recording_id: recordingId,
      user_id: user.id,
      service: "edited",
      transcript: edited,
      is_merged: false,
    });
    await loadVersions();
    toast.success("נשמרה גרסה להיסטוריה");
  };

  // Detect speakers
  const detectedSpeakers = useMemo(() => {
    const set = new Set<string>();
    const re1 = /(?:^|\n)\s*((?:דובר|דוברת|Speaker|S)\s*[\u05D0-\u05EA0-9]+)\s*[:\-]/g;
    let m;
    while ((m = re1.exec(edited)) !== null) set.add(m[1].trim());
    return Array.from(set).slice(0, 20);
  }, [edited]);

  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  useEffect(() => {
    setSpeakerMap((prev) => {
      const next: Record<string, string> = {};
      detectedSpeakers.forEach((s) => (next[s] = prev[s] ?? ""));
      return next;
    });
  }, [detectedSpeakers.join("|")]);

  const [keywordPairs, setKeywordPairs] = useState<Array<{ from: string; to: string }>>([{ from: "", to: "" }]);
  const updatePair = (i: number, k: "from" | "to", v: string) =>
    setKeywordPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPair = () => setKeywordPairs((prev) => [...prev, { from: "", to: "" }]);
  const removePair = (i: number) => setKeywordPairs((prev) => prev.filter((_, idx) => idx !== i));

  const applyReplacements = () => {
    let next = edited;
    let changed = 0;
    Object.entries(speakerMap).forEach(([orig, name]) => {
      if (!name.trim() || name.trim() === orig) return;
      const re = new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const before = next;
      next = next.replace(re, name.trim());
      if (before !== next) changed++;
    });
    keywordPairs.forEach(({ from, to }) => {
      if (!from.trim()) return;
      const re = new RegExp(from.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const before = next;
      next = next.replace(re, to);
      if (before !== next) changed++;
    });
    if (changed === 0) { toast.info("אין מה להחליף"); return; }
    setEdited(next);
    toast.success(`הוחלפו ${changed} פריטים — נשמר אוטומטית`);
  };

  const copyToClipboard = async () => {
    try { await navigator.clipboard.writeText(edited); toast.success("הועתק"); }
    catch { toast.error("שגיאה בהעתקה"); }
  };
  const downloadPdf = () => edited && exportTranscriptToPdf(edited, { filename, recordedAt, context, client });
  const downloadTxt = () => edited && downloadTranscriptTxt(edited, filename);

  const restoreVersion = (v: Version) => {
    setEdited(v.transcript);
    setShowHistory(false);
    toast.success("הגרסה נטענה — נשמר אוטומטית");
  };

  const runSuper = async () => {
    if (!audioUrl) { toast.error("אין קובץ אודיו זמין"); return; }
    await supabase.from(table).update({ transcript_status: "processing" }).eq("id", recordingId);
    onUpdated?.();
    await runAll({
      recordingId, audioUrl, table,
      context: { title: filename },
      onCompleted: () => { onUpdated?.(); loadVersions(); },
    });
  };

  const StatusChip = () => {
    if (saveState === "saving") return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" /> שומר…
      </span>
    );
    if (saveState === "saved") return (
      <span className="inline-flex items-center gap-1 text-xs text-green-600">
        <Check className="h-3 w-3" /> נשמר
      </span>
    );
    return null;
  };

  return (
    <TooltipProvider delayDuration={200}>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          {/* Header */}
          <DialogHeader className="px-5 py-3 border-b bg-muted/30">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <FileText className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <DialogTitle className="text-base truncate text-right">{filename}</DialogTitle>
                <DialogDescription className="text-xs flex items-center gap-2 flex-wrap mt-0.5">
                  <Badge variant="secondary" className="text-[10px] py-0">{serviceLabel(transcriptionService)}</Badge>
                  {recordedAt && <span>{new Date(recordedAt).toLocaleString("he-IL")}</span>}
                  {context && <span>• {context}</span>}
                  <StatusChip />
                </DialogDescription>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={copyToClipboard}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </TooltipTrigger><TooltipContent>העתק טקסט</TooltipContent></Tooltip>

                <Tooltip><TooltipTrigger asChild>
                  <Button size="icon" variant="ghost" className="h-8 w-8" onClick={downloadPdf} disabled={!edited}>
                    <Download className="h-4 w-4" />
                  </Button>
                </TooltipTrigger><TooltipContent>הורד PDF</TooltipContent></Tooltip>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-8 w-8">
                      <MoreVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>פעולות</DropdownMenuLabel>
                    <DropdownMenuItem onClick={downloadTxt} disabled={!edited}>
                      <Download className="h-4 w-4 ml-2" /> הורד TXT
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={saveVersionSnapshot}>
                      <History className="h-4 w-4 ml-2" /> שמור גרסה להיסטוריה
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => { setEdited(transcript ?? ""); }}>
                      <RotateCcw className="h-4 w-4 ml-2" /> שחזר טקסט מקורי
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>הפק מחדש</DropdownMenuLabel>
                    <DropdownMenuItem onClick={runSuper} disabled={!audioUrl || running === recordingId}>
                      <Sparkles className="h-4 w-4 ml-2 text-primary" /> תמלול-על
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setShowQuickPick(true)} disabled={!audioUrl}>
                      <Zap className="h-4 w-4 ml-2 text-primary" /> תמלול מהיר
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </DialogHeader>

          {/* Body — single editor */}
          <div className="flex-1 min-h-0 flex flex-col md:flex-row">
            <div className="flex-1 min-h-0 p-4 md:p-5">
              <Textarea
                dir="rtl"
                value={edited}
                onChange={(e) => setEdited(e.target.value)}
                placeholder={transcript ? "" : "אין תמלול עדיין — לחץ על ⋯ כדי להפיק תמלול"}
                className="h-full min-h-[400px] resize-none text-sm leading-relaxed font-sans border-0 focus-visible:ring-0 shadow-none p-0 bg-transparent"
              />
            </div>

            {/* Right rail — collapsible tools */}
            <div className="md:w-72 border-t md:border-t-0 md:border-r bg-muted/20 flex flex-col">
              <button
                onClick={() => setShowReplacements((v) => !v)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors text-right"
              >
                <Replace className="h-4 w-4 text-primary" />
                <span className="flex-1 text-right">החלפות בטקסט</span>
                {(detectedSpeakers.length > 0 || keywordPairs.some(p => p.from)) && (
                  <Badge variant="secondary" className="text-[10px] h-5">
                    {detectedSpeakers.length + keywordPairs.filter(p => p.from).length}
                  </Badge>
                )}
                <ChevronDown className={`h-4 w-4 transition-transform ${showReplacements ? "rotate-180" : ""}`} />
              </button>
              {showReplacements && (
                <div className="px-4 pb-4 space-y-2 border-b">
                  {detectedSpeakers.length > 0 && (
                    <div className="flex items-center gap-1 text-[11px] text-muted-foreground pt-1">
                      <Users className="h-3 w-3" /> דוברים שזוהו
                    </div>
                  )}
                  {detectedSpeakers.map((s) => (
                    <div key={s} className="flex gap-1.5 items-center">
                      <Badge variant="outline" className="shrink-0 min-w-[64px] justify-center text-[11px] py-0.5">{s}</Badge>
                      <span className="text-muted-foreground text-xs">→</span>
                      <Input
                        dir="rtl" placeholder="שם..."
                        value={speakerMap[s] ?? ""}
                        onChange={(e) => setSpeakerMap((p) => ({ ...p, [s]: e.target.value }))}
                        className="h-8 text-sm"
                      />
                    </div>
                  ))}

                  {detectedSpeakers.length > 0 && <div className="border-t my-2" />}

                  <div className="text-[11px] text-muted-foreground">מילים להחלפה</div>
                  {keywordPairs.map((p, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <Input dir="rtl" placeholder="חפש" value={p.from} onChange={(e) => updatePair(i, "from", e.target.value)} className="h-8 text-sm" />
                      <span className="text-muted-foreground text-xs">→</span>
                      <Input dir="rtl" placeholder="החלף" value={p.to} onChange={(e) => updatePair(i, "to", e.target.value)} className="h-8 text-sm" />
                      <Button size="icon" variant="ghost" onClick={() => removePair(i)} disabled={keywordPairs.length === 1} className="h-8 w-8 shrink-0">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" onClick={addPair} className="w-full gap-1 h-8">
                    <Plus className="h-3.5 w-3.5" /> הוסף שורה
                  </Button>
                  <Button size="sm" onClick={applyReplacements} className="w-full mt-1">
                    החלף בכל הטקסט
                  </Button>
                </div>
              )}

              <button
                onClick={() => setShowHistory((v) => !v)}
                className="flex items-center gap-2 px-4 py-3 text-sm font-medium hover:bg-muted/40 transition-colors text-right"
              >
                <History className="h-4 w-4 text-primary" />
                <span className="flex-1 text-right">היסטוריית גרסאות</span>
                <Badge variant="secondary" className="text-[10px] h-5">{versions.length}</Badge>
                <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
              </button>
              {showHistory && (
                <ScrollArea className="px-4 pb-4 max-h-72">
                  <div className="space-y-2">
                    {versions.length === 0 && <p className="text-xs text-muted-foreground">אין היסטוריה</p>}
                    {versions.map((v) => (
                      <div key={v.id} className="border rounded p-2 text-xs space-y-1 bg-background">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-[10px]">{serviceLabel(v.service)}</Badge>
                          <span className="text-muted-foreground">{new Date(v.created_at).toLocaleString("he-IL")}</span>
                        </div>
                        <p className="line-clamp-2 text-muted-foreground">{v.transcript.slice(0, 120)}</p>
                        <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={() => restoreVersion(v)}>
                          טען לעריכה
                        </Button>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              )}

              {!transcript && audioUrl && (
                <div className="p-4 mt-auto border-t space-y-2">
                  <p className="text-xs text-muted-foreground text-center">אין תמלול עדיין</p>
                  <Button onClick={runSuper} disabled={running === recordingId} className="w-full gap-1.5">
                    {running === recordingId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                    תמלול-על
                  </Button>
                  <Button onClick={() => setShowQuickPick(true)} variant="outline" className="w-full gap-1.5">
                    <Zap className="h-4 w-4" /> תמלול מהיר
                  </Button>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {showQuickPick && (
        <TranscribeDialog
          open={showQuickPick}
          onOpenChange={setShowQuickPick}
          recordingId={recordingId}
          audioUrl={audioUrl ?? undefined}
          table={table}
          trigger={null}
          onCompleted={() => {
            setShowQuickPick(false);
            onUpdated?.();
            loadVersions();
          }}
        />
      )}
    </TooltipProvider>
  );
}
