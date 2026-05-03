import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { exportTranscriptToPdf, downloadTranscriptTxt } from "@/lib/exportTranscriptPdf";
import { serviceLabel } from "@/lib/serviceLabels";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";
import { MergeTranscriptsDialog } from "@/components/MergeTranscriptsDialog";
import { EditMeetingDialog } from "@/components/EditMeetingDialog";
import {
  AudioLines,
  Check,
  CheckCircle2,
  ChevronDown,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  History,
  Loader2,
  PencilLine,
  PlayCircle,
  RefreshCw,
  Sparkles,
  Tag,
  Users,
  Volume2,
  Wand2,
  X,
} from "lucide-react";

interface Version {
  id: string;
  service: string;
  transcript: string;
  is_merged: boolean;
  created_at: string;
}

type TableName = "recordings" | "meeting_recordings";
type SaveState = "idle" | "saving" | "saved";
type PanelMode = "view" | "edit";

export interface ExpandableTranscriptItem {
  id: string;
  table: TableName;
  filename: string;
  recordedAt?: string | null;
  duration?: string | null;
  transcript: string | null;
  transcriptStatus: string;
  transcriptionService?: string | null;
  audioUrl?: string | null;
  context?: string | null;
  client?: string | null;
  assignLabel?: string;
  meetingId?: string | null;
  meetingTitle?: string | null;
}

interface Props {
  open: boolean;
  mode?: PanelMode;
  item: ExpandableTranscriptItem;
  onToggle: () => void;
  onAssign?: () => void;
  onOpenDialog?: () => void;
  onQuickTranscribe?: () => void;
  onUpdated?: () => void;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function fetchDriveAudioBlob(audioUrl: string): Promise<{ blob: Blob; filename: string }> {
  const driveMatch = audioUrl.match(/\/file\/d\/([^/]+)|[?&]id=([^&]+)/);
  const driveFileId = driveMatch ? (driveMatch[1] || driveMatch[2]) : null;

  if (!driveFileId) {
    const res = await fetch(audioUrl);
    if (!res.ok) throw new Error("לא הצלחתי לטעון את האודיו");
    const blob = await res.blob();
    return { blob, filename: "audio" };
  }

  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("נדרשת התחברות");

  const dlUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-api`;
  const dlRes = await fetch(dlUrl, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ action: "download_file", fileId: driveFileId }),
  });

  if (!dlRes.ok) {
    const errText = await dlRes.text();
    throw new Error(`טעינת אודיו נכשלה: ${errText}`);
  }

  const blob = await dlRes.blob();
  const filename = decodeURIComponent(dlRes.headers.get("X-Filename") || "audio.mp3");
  return { blob, filename };
}

export function ExpandableTranscriptPanel({
  open,
  mode = "view",
  item,
  onToggle,
  onAssign,
  onOpenDialog,
  onQuickTranscribe,
  onUpdated,
}: Props) {
  const [panelMode, setPanelMode] = useState<PanelMode>(mode);
  const [edited, setEdited] = useState(item.transcript ?? "");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [versions, setVersions] = useState<Version[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [speakerMap, setSpeakerMap] = useState<Record<string, string>>({});
  const [keywordPairs, setKeywordPairs] = useState<Array<{ from: string; to: string }>>([{ from: "", to: "" }]);
  const lastSavedRef = useRef(item.transcript ?? "");
  const debounceRef = useRef<number | null>(null);
  const { runAll, running } = useTranscribeAll();

  useEffect(() => {
    if (!open) return;
    setPanelMode(mode);
    setEdited(item.transcript ?? "");
    lastSavedRef.current = item.transcript ?? "";
    setSaveState("idle");
    void loadVersions();
  }, [open, mode, item.id, item.transcript]);

  useEffect(() => {
    if (!open || !item.audioUrl) return;
    let revoked: string | null = null;
    let cancelled = false;

    const loadAudio = async () => {
      setAudioLoading(true);
      try {
        const { blob } = await fetchDriveAudioBlob(item.audioUrl!);
        if (cancelled) return;
        const objectUrl = URL.createObjectURL(blob);
        revoked = objectUrl;
        setAudioSrc(objectUrl);
      } catch (e: any) {
        if (!cancelled) {
          setAudioSrc(item.audioUrl ?? null);
          toast.error("לא ניתן לטעון נגן אודיו", { description: e?.message });
        }
      } finally {
        if (!cancelled) setAudioLoading(false);
      }
    };

    void loadAudio();

    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
      setAudioSrc(null);
    };
  }, [open, item.audioUrl, item.id]);

  useEffect(() => {
    if (!open) return;
    if (edited === lastSavedRef.current) return;
    if (debounceRef.current) window.clearTimeout(debounceRef.current);
    setSaveState("saving");
    debounceRef.current = window.setTimeout(() => {
      void persist(edited);
    }, 1200);
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current);
    };
  }, [edited, open]);

  const detectedSpeakers = useMemo(() => {
    const set = new Set<string>();
    const re1 = /(?:^|\n)\s*((?:דובר|דוברת|Speaker|S)\s*[\u05D0-\u05EA0-9A-Za-z]+)\s*[:\-]/g;
    let m;
    while ((m = re1.exec(edited)) !== null) set.add(m[1].trim());
    return Array.from(set).slice(0, 20);
  }, [edited]);

  useEffect(() => {
    setSpeakerMap((prev) => {
      const next: Record<string, string> = {};
      detectedSpeakers.forEach((speaker) => {
        next[speaker] = prev[speaker] ?? "";
      });
      return next;
    });
  }, [detectedSpeakers.join("|")]);

  const loadVersions = async () => {
    const { data } = await supabase
      .from("transcript_versions")
      .select("id, service, transcript, is_merged, created_at")
      .eq("recording_id", item.id)
      .order("created_at", { ascending: false });
    setVersions(data ?? []);
  };

  const persist = async (text: string) => {
    try {
      const { error } = await supabase
        .from(item.table)
        .update({ transcript: text, transcript_status: "completed" })
        .eq("id", item.id);
      if (error) throw error;
      lastSavedRef.current = text;
      setSaveState("saved");
      onUpdated?.();
      window.setTimeout(() => setSaveState((state) => (state === "saved" ? "idle" : state)), 1400);
    } catch (e: any) {
      setSaveState("idle");
      toast.error("שגיאה בשמירה", { description: e?.message });
    }
  };

  const saveVersionSnapshot = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("transcript_versions").insert({
      recording_id: item.id,
      user_id: user.id,
      service: "edited",
      transcript: edited,
      is_merged: false,
    });
    await loadVersions();
    toast.success("נשמרה גרסה חדשה");
  };

  const applyReplacements = () => {
    let next = edited;
    let changed = 0;

    Object.entries(speakerMap).forEach(([orig, name]) => {
      if (!name.trim() || name.trim() === orig) return;
      const re = new RegExp(escapeRegExp(orig), "g");
      const before = next;
      next = next.replace(re, name.trim());
      if (before !== next) changed++;
    });

    keywordPairs.forEach(({ from, to }) => {
      if (!from.trim()) return;
      const re = new RegExp(escapeRegExp(from.trim()), "g");
      const before = next;
      next = next.replace(re, to);
      if (before !== next) changed++;
    });

    if (changed === 0) {
      toast.info("אין שינויים להחלה");
      return;
    }

    setEdited(next);
    toast.success(`עודכנו ${changed} החלפות`);
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(edited);
      toast.success("הועתק ללוח");
    } catch {
      toast.error("שגיאה בהעתקה");
    }
  };

  const runSuper = async () => {
    if (!item.audioUrl) {
      toast.error("אין קובץ אודיו זמין");
      return;
    }
    await supabase.from(item.table).update({ transcript_status: "processing" }).eq("id", item.id);
    onUpdated?.();
    await runAll({
      recordingId: item.id,
      audioUrl: item.audioUrl,
      table: item.table,
      context: { title: item.filename, client: item.client ?? undefined },
      onCompleted: async () => {
        await loadVersions();
        onUpdated?.();
      },
    });
  };

  const restoreVersion = (version: Version) => {
    setEdited(version.transcript);
    setPanelMode("edit");
    setShowHistory(false);
    toast.success("הגרסה נטענה לעריכה");
  };

  const statusTone = item.transcriptStatus === "completed"
    ? "border-green-500/30 bg-green-500/10 text-green-700"
    : item.transcriptStatus === "processing"
    ? "border-primary/30 bg-primary/10 text-primary"
    : item.transcriptStatus === "failed"
    ? "border-destructive/30 bg-destructive/10 text-destructive"
    : "border-border bg-muted text-muted-foreground";

  if (!open) return null;

  return (
    <Card className="mt-2 overflow-hidden border-border/60 bg-card/90 shadow-sm">
      <div className="border-t bg-gradient-to-l from-primary/5 via-background to-background px-4 py-4 md:px-5">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0 space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={`text-[10px] py-0 h-5 ${statusTone}`}>
                  {item.transcriptStatus === "processing" || running === item.id ? (
                    <Loader2 className="ml-1 h-3 w-3 animate-spin" />
                  ) : (
                    <AudioLines className="ml-1 h-3 w-3" />
                  )}
                  {item.transcriptStatus === "completed"
                    ? "מוכן"
                    : item.transcriptStatus === "processing"
                    ? "מתמלל"
                    : item.transcriptStatus === "failed"
                    ? "נכשל"
                    : "ממתין"}
                </Badge>
                <Badge variant="secondary" className="text-[10px] py-0 h-5">
                  {serviceLabel(item.transcriptionService)}
                </Badge>
                {item.duration && <Badge variant="outline" className="text-[10px] py-0 h-5">{item.duration}</Badge>}
                {item.context && <Badge variant="outline" className="text-[10px] py-0 h-5">{item.context}</Badge>}
              </div>

              <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                {item.recordedAt && <span>{new Date(item.recordedAt).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>}
                {item.client && <span>לקוח: {item.client}</span>}
                {saveState === "saving" && <span className="inline-flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> שומר...</span>}
                {saveState === "saved" && <span className="inline-flex items-center gap-1 text-green-700"><Check className="h-3 w-3" /> נשמר</span>}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <Button size="sm" onClick={() => setPanelMode("view")} variant={panelMode === "view" ? "default" : "outline"} className="gap-1.5">
                <PlayCircle className="h-3.5 w-3.5" /> תצוגה
              </Button>
              <Button size="sm" onClick={() => setPanelMode("edit")} variant={panelMode === "edit" ? "default" : "outline"} className="gap-1.5">
                <PencilLine className="h-3.5 w-3.5" /> עריכה
              </Button>
              <Button size="sm" variant="outline" onClick={copyText} className="gap-1.5">
                <Copy className="h-3.5 w-3.5" /> העתק
              </Button>
              <Button size="sm" variant="outline" onClick={() => exportTranscriptToPdf(edited, {
                filename: item.filename,
                recordedAt: item.recordedAt,
                context: item.context,
                client: item.client,
              })} className="gap-1.5" disabled={!edited}>
                <Download className="h-3.5 w-3.5" /> PDF
              </Button>
              <Button size="sm" variant="outline" onClick={() => downloadTranscriptTxt(edited, item.filename)} className="gap-1.5" disabled={!edited}>
                <FileDown className="h-3.5 w-3.5" /> TXT
              </Button>
              {onAssign && (
                <Button size="sm" variant="outline" onClick={onAssign} className="gap-1.5">
                  <Tag className="h-3.5 w-3.5" /> {item.assignLabel ?? "שייך"}
                </Button>
              )}
              {item.audioUrl && (
                <Button size="icon" variant="ghost" asChild>
                  <a href={item.audioUrl} target="_blank" rel="noreferrer">
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              )}
              {onOpenDialog && (
                <Button size="sm" variant="ghost" onClick={onOpenDialog}>חלון מלא</Button>
              )}
              <Button size="icon" variant="ghost" onClick={onToggle}>
                <X className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[1.1fr,1.4fr]">
            <div className="space-y-3">
              <div className="rounded-xl border bg-background/80 p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Volume2 className="h-4 w-4 text-primary" /> שמע את ההקלטה
                </div>
                {audioLoading ? (
                  <div className="flex h-16 items-center justify-center text-sm text-muted-foreground">
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" /> טוען נגן...
                  </div>
                ) : audioSrc ? (
                  <audio controls preload="metadata" className="w-full">
                    <source src={audioSrc} />
                  </audio>
                ) : (
                  <div className="text-sm text-muted-foreground">אין קובץ אודיו זמין</div>
                )}
              </div>

              <div className="rounded-xl border bg-background/80 p-3">
                <button
                  onClick={() => setShowAdvanced((prev) => !prev)}
                  className="flex w-full items-center gap-2 text-right text-sm font-medium"
                >
                  <Wand2 className="h-4 w-4 text-primary" />
                  <span className="flex-1">דוברים והחלפות</span>
                  <Badge variant="secondary" className="h-5 text-[10px]">
                    {detectedSpeakers.length + keywordPairs.filter((pair) => pair.from).length}
                  </Badge>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? "rotate-180" : ""}`} />
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-3">
                    {detectedSpeakers.length > 0 && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Users className="h-3 w-3" /> דוברים שזוהו אוטומטית
                        </div>
                        {detectedSpeakers.map((speaker) => (
                          <div key={speaker} className="flex items-center gap-2">
                            <Badge variant="outline" className="min-w-[78px] justify-center py-0.5 text-[11px]">{speaker}</Badge>
                            <Input
                              value={speakerMap[speaker] ?? ""}
                              onChange={(e) => setSpeakerMap((prev) => ({ ...prev, [speaker]: e.target.value }))}
                              placeholder="שם דובר"
                              className="h-8"
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="space-y-2">
                      <div className="text-[11px] text-muted-foreground">החלפות טקסט מהירות</div>
                      {keywordPairs.map((pair, index) => (
                        <div key={index} className="flex items-center gap-2">
                          <Input
                            value={pair.from}
                            onChange={(e) => setKeywordPairs((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, from: e.target.value } : row))}
                            placeholder="חפש"
                            className="h-8"
                          />
                          <Input
                            value={pair.to}
                            onChange={(e) => setKeywordPairs((prev) => prev.map((row, rowIndex) => rowIndex === index ? { ...row, to: e.target.value } : row))}
                            placeholder="החלף"
                            className="h-8"
                          />
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 shrink-0"
                            onClick={() => setKeywordPairs((prev) => prev.filter((_, rowIndex) => rowIndex !== index || prev.length === 1))}
                            disabled={keywordPairs.length === 1}
                          >
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={() => setKeywordPairs((prev) => [...prev, { from: "", to: "" }])}>הוסף שורה</Button>
                        <Button size="sm" onClick={applyReplacements}>החל על כל התמלול</Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-xl border bg-background/80 p-3">
                <button
                  onClick={() => setShowHistory((prev) => !prev)}
                  className="flex w-full items-center gap-2 text-right text-sm font-medium"
                >
                  <History className="h-4 w-4 text-primary" />
                  <span className="flex-1">היסטוריית גרסאות</span>
                  <Badge variant="secondary" className="h-5 text-[10px]">{versions.length}</Badge>
                  <ChevronDown className={`h-4 w-4 transition-transform ${showHistory ? "rotate-180" : ""}`} />
                </button>
                {showHistory && (
                  <ScrollArea className="mt-3 max-h-44">
                    <div className="space-y-2">
                      {versions.length === 0 && <div className="text-xs text-muted-foreground">אין גרסאות עדיין</div>}
                      {versions.map((version) => (
                        <div key={version.id} className="rounded-lg border bg-card p-2 text-xs">
                          <div className="mb-1 flex items-center justify-between gap-2">
                            <Badge variant="secondary" className="text-[10px]">{serviceLabel(version.service)}</Badge>
                            <span className="text-muted-foreground">{new Date(version.created_at).toLocaleString("he-IL")}</span>
                          </div>
                          <p className="line-clamp-2 text-muted-foreground">{version.transcript.slice(0, 120)}</p>
                          <Button size="sm" variant="ghost" className="mt-1 h-7 text-xs" onClick={() => restoreVersion(version)}>
                            טען לגרסה הזאת
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </div>
            </div>

            <div className="min-h-[360px] rounded-xl border bg-background/80 p-3 md:p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium">{panelMode === "edit" ? "עריכת תמלול" : "תצוגת תמלול"}</div>
                  <div className="text-xs text-muted-foreground">
                    {edited ? `${edited.trim().split(/\s+/).filter(Boolean).length.toLocaleString("he-IL")} מילים` : "אין תמלול עדיין"}
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={saveVersionSnapshot} disabled={!edited}>שמור גרסה</Button>
                  <Button size="sm" variant="outline" onClick={onQuickTranscribe} disabled={!item.audioUrl || !onQuickTranscribe}>תמלול מהיר</Button>
                  <Button size="sm" onClick={runSuper} disabled={!item.audioUrl || running === item.id} className="gap-1.5">
                    {running === item.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                    תמלול-על
                  </Button>
                </div>
              </div>

              {panelMode === "edit" ? (
                <Textarea
                  value={edited}
                  onChange={(e) => setEdited(e.target.value)}
                  placeholder="אין תמלול עדיין"
                  className="min-h-[320px] resize-none border-0 bg-transparent p-0 text-sm leading-relaxed shadow-none focus-visible:ring-0"
                />
              ) : (
                <ScrollArea className="h-[340px] rounded-lg border bg-card px-4 py-3">
                  <div className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                    {edited || "אין תמלול עדיין — אפשר להתחיל תמלול מהיר או תמלול-על."}
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
