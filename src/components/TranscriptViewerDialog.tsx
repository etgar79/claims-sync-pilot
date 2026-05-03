import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FileText, Copy, Download, Save, Sparkles, Zap, Loader2, History, RotateCcw, Users, Replace, Plus, X } from "lucide-react";
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
  if (svc === "ivrit_ai") return "AI חסכוני";
  if (svc === "whisper") return "AI מהיר";
  if (svc === "elevenlabs") return "AI איכות גבוהה";
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

export function TranscriptViewerDialog({
  open, onOpenChange, recordingId, table, filename, recordedAt, audioUrl,
  transcript, transcriptionService, context, client, defaultTab, onUpdated,
}: Props) {
  const initialTab = defaultTab ?? (transcript ? "view" : "regenerate");
  const [tab, setTab] = useState<string>(initialTab);
  const [edited, setEdited] = useState(transcript ?? "");
  const [saving, setSaving] = useState(false);
  const [versions, setVersions] = useState<Version[]>([]);
  const [showQuickPick, setShowQuickPick] = useState(false);
  const { runAll, running } = useTranscribeAll();

  useEffect(() => {
    if (open) {
      setEdited(transcript ?? "");
      setTab(defaultTab ?? (transcript ? "view" : "regenerate"));
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

  // Detect speakers — supports digits, Hebrew letters, English, and renamed labels
  const detectedSpeakers = useMemo(() => {
    const set = new Set<string>();
    const re1 = /(?:^|\n)\s*((?:דובר|דוברת|Speaker|S)\s*[\u05D0-\u05EA0-9]+)\s*[:\-]/g;
    const re2 = /(?:^|\n)\s*([^\n:]{1,30}?)\s*:/g;
    let m;
    while ((m = re1.exec(edited)) !== null) set.add(m[1].trim());
    while ((m = re2.exec(edited)) !== null) {
      const candidate = m[1].trim();
      if (!candidate || candidate.length > 30) continue;
      if (/[.?!]/.test(candidate)) continue;
      set.add(candidate);
    }
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

  // Free-form keyword find/replace pairs
  const [keywordPairs, setKeywordPairs] = useState<Array<{ from: string; to: string }>>([{ from: "", to: "" }]);
  const updatePair = (i: number, k: "from" | "to", v: string) =>
    setKeywordPairs((prev) => prev.map((p, idx) => (idx === i ? { ...p, [k]: v } : p)));
  const addPair = () => setKeywordPairs((prev) => [...prev, { from: "", to: "" }]);
  const removePair = (i: number) => setKeywordPairs((prev) => prev.filter((_, idx) => idx !== i));

  const computeRenamed = () => {
    let next = edited;
    let changed = 0;
    // Speakers first
    Object.entries(speakerMap).forEach(([orig, name]) => {
      if (!name.trim() || name.trim() === orig) return;
      const re = new RegExp(orig.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const before = next;
      next = next.replace(re, name.trim());
      if (before !== next) changed++;
    });
    // Keywords
    keywordPairs.forEach(({ from, to }) => {
      if (!from.trim()) return;
      const re = new RegExp(from.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g");
      const before = next;
      next = next.replace(re, to);
      if (before !== next) changed++;
    });
    return { next, changed };
  };

  const applySpeakerRenames = () => {
    const { next, changed } = computeRenamed();
    if (changed === 0) { toast.info("אין שינויים להחליף"); return; }
    setEdited(next);
    toast.success(`הוחלפו ${changed} פריטים (לחץ 'שמור' כדי להחיל לכולם)`);
  };

  const applyAndSave = async () => {
    const { next, changed } = computeRenamed();
    if (changed === 0) { toast.info("אין שינויים להחליף"); return; }
    setEdited(next);
    await saveEditWithText(next);
  };


  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(transcript ?? "");
      toast.success("הועתק");
    } catch {
      toast.error("שגיאה בהעתקה");
    }
  };

  const downloadPdf = () => {
    if (!transcript) return;
    exportTranscriptToPdf(transcript, { filename, recordedAt, context, client });
  };

  const downloadTxt = () => {
    if (!transcript) return;
    downloadTranscriptTxt(transcript, filename);
  };

  const saveEditWithText = async (text: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      const { error } = await supabase
        .from(table)
        .update({ transcript: text, transcript_status: "completed" })
        .eq("id", recordingId);
      if (error) throw error;

      await supabase.from("transcript_versions").insert({
        recording_id: recordingId,
        user_id: user.id,
        service: "edited",
        transcript: text,
        is_merged: false,
      });

      toast.success("התמלול נשמר");
      onUpdated?.();
      await loadVersions();
    } catch (e: any) {
      toast.error("שגיאה בשמירה", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const saveEdit = async () => {
    await saveEditWithText(edited);
    setTab("view");
  };


  const restoreVersion = async (v: Version) => {
    setEdited(v.transcript);
    toast.info("הגרסה נטענה לעריכה — לחץ 'שמור' כדי להחיל");
    setTab("edit");
  };

  const runSuper = async () => {
    if (!audioUrl) { toast.error("אין קובץ אודיו זמין"); return; }
    await supabase.from(table).update({ transcript_status: "processing" }).eq("id", recordingId);
    onUpdated?.();
    await runAll({
      recordingId,
      audioUrl,
      table,
      context: { title: filename },
      onCompleted: () => { onUpdated?.(); loadVersions(); },
    });
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[92vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              תמלול — {filename}
            </DialogTitle>
            <DialogDescription className="flex items-center gap-2 flex-wrap">
              <Badge variant="secondary">{serviceLabel(transcriptionService)}</Badge>
              {recordedAt && <span className="text-xs">{new Date(recordedAt).toLocaleString("he-IL")}</span>}
              {context && <span className="text-xs">• {context}</span>}
            </DialogDescription>
          </DialogHeader>

          <Tabs value={tab} onValueChange={setTab} className="flex-1 flex flex-col min-h-0">
            <TabsList className="grid grid-cols-3 w-full">
              <TabsTrigger value="view" disabled={!transcript}>תצוגה</TabsTrigger>
              <TabsTrigger value="edit" disabled={!transcript && !edited}>עריכה</TabsTrigger>
              <TabsTrigger value="regenerate">הפקה מחדש</TabsTrigger>
            </TabsList>

            {/* VIEW */}
            <TabsContent value="view" className="flex-1 min-h-0 flex flex-col gap-3 mt-3">
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="outline" onClick={copyToClipboard} className="gap-1">
                  <Copy className="h-4 w-4" /> העתק
                </Button>
                <Button size="sm" variant="outline" onClick={downloadPdf} className="gap-1">
                  <Download className="h-4 w-4" /> הורד PDF
                </Button>
                <Button size="sm" variant="outline" onClick={downloadTxt} className="gap-1">
                  <Download className="h-4 w-4" /> הורד TXT
                </Button>
              </div>
              <ScrollArea className="flex-1 border rounded-md p-4 bg-muted/30">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed text-right" dir="rtl">
                  {transcript || "אין תמלול"}
                </pre>
              </ScrollArea>
            </TabsContent>

            {/* EDIT */}
            <TabsContent value="edit" className="flex-1 min-h-0 mt-3">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 h-full min-h-0">
                <div className="md:col-span-2 flex flex-col min-h-0 gap-2">
                  <Textarea
                    dir="rtl"
                    value={edited}
                    onChange={(e) => setEdited(e.target.value)}
                    className="flex-1 min-h-[300px] font-sans text-sm leading-relaxed"
                  />
                  <div className="flex gap-2 justify-between">
                    <Button size="sm" variant="ghost" onClick={() => setEdited(transcript ?? "")} className="gap-1">
                      <RotateCcw className="h-4 w-4" /> איפוס
                    </Button>
                    <Button size="sm" onClick={saveEdit} disabled={saving} className="gap-1">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                      שמור
                    </Button>
                  </div>
                </div>

                <div className="flex flex-col min-h-0 gap-3">
                  <div className="border rounded-md p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                      <Users className="h-4 w-4" /> דוברים
                    </div>
                    {detectedSpeakers.length === 0 ? (
                      <p className="text-xs text-muted-foreground">לא זוהו תוויות דוברים בטקסט.</p>
                    ) : (
                      <div className="space-y-2">
                        {detectedSpeakers.map((s) => (
                          <div key={s} className="flex gap-2 items-center">
                            <Badge variant="outline" className="shrink-0 min-w-[70px] justify-center">{s}</Badge>
                            <Input
                              dir="rtl"
                              placeholder="שם חדש..."
                              value={speakerMap[s] ?? ""}
                              onChange={(e) => setSpeakerMap((p) => ({ ...p, [s]: e.target.value }))}
                              className="h-8 text-sm"
                            />
                          </div>
                        ))}
                        <div className="flex gap-1.5 mt-1">
                          <Button size="sm" variant="secondary" onClick={applySpeakerRenames} className="flex-1">
                            החלף בטקסט
                          </Button>
                          <Button size="sm" onClick={applyAndSave} disabled={saving} className="flex-1 gap-1">
                            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
                            החלף ושמור
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="border rounded-md p-3 flex-1 min-h-0 flex flex-col">
                    <div className="flex items-center gap-2 mb-2 text-sm font-semibold">
                      <History className="h-4 w-4" /> גרסאות ({versions.length})
                    </div>
                    <ScrollArea className="flex-1 min-h-[120px]">
                      <div className="space-y-2">
                        {versions.map((v) => (
                          <div key={v.id} className="border rounded p-2 text-xs space-y-1">
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
                        {versions.length === 0 && (
                          <p className="text-xs text-muted-foreground">אין היסטוריה</p>
                        )}
                      </div>
                    </ScrollArea>
                  </div>
                </div>
              </div>
            </TabsContent>

            {/* REGENERATE */}
            <TabsContent value="regenerate" className="flex-1 mt-3">
              <div className="space-y-3">
                {transcript && (
                  <div className="border rounded p-3 bg-yellow-500/10 text-sm">
                    שים לב: הפקה מחדש תדרוס את התמלול הנוכחי. הגרסה הקיימת תישמר בהיסטוריה.
                  </div>
                )}
                <button
                  onClick={runSuper}
                  disabled={running === recordingId || !audioUrl}
                  className="w-full text-right border rounded-lg p-4 hover:border-primary transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    {running === recordingId ? (
                      <Loader2 className="h-6 w-6 text-primary animate-spin" />
                    ) : (
                      <Sparkles className="h-6 w-6 text-primary" />
                    )}
                    <div>
                      <div className="font-semibold">תמלול-על</div>
                      <div className="text-xs text-muted-foreground">3 מנועים + מיזוג AI לאיכות מקסימלית</div>
                    </div>
                  </div>
                </button>
                <button
                  onClick={() => setShowQuickPick(true)}
                  disabled={!audioUrl}
                  className="w-full text-right border rounded-lg p-4 hover:border-primary transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-3">
                    <Zap className="h-6 w-6 text-primary" />
                    <div>
                      <div className="font-semibold">תמלול מהיר</div>
                      <div className="text-xs text-muted-foreground">מנוע יחיד — מהיר וחסכוני</div>
                    </div>
                  </div>
                </button>
                {!audioUrl && (
                  <p className="text-xs text-destructive">אין קובץ אודיו זמין להקלטה זו.</p>
                )}
              </div>
            </TabsContent>
          </Tabs>
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
    </>
  );
}
