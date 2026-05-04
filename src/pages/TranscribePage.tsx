import { useEffect, useRef, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Headphones, Mic, Upload, Loader2, FileText, Eye, Trash2, Square, Pause, Play, CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";

interface Row {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript: string | null;
  transcript_status: string;
  transcription_service: string | null;
  drive_url: string | null;
}

const STATUS_META: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: "ממתין לתמלול", icon: Clock, cls: "bg-muted text-muted-foreground" },
  processing: { label: "מתמלל...", icon: Loader2, cls: "bg-primary/10 text-primary" },
  completed: { label: "תמלול מוכן", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700" },
  failed: { label: "נכשל", icon: AlertCircle, cls: "bg-destructive/10 text-destructive" },
};

function fmtTime(sec: number) {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const res = r.result as string;
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

const TranscribePage = () => {
  const [items, setItems] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [transcribeTarget, setTranscribeTarget] = useState<Row | null>(null);
  const [viewTarget, setViewTarget] = useState<Row | null>(null);

  // Recording state
  const [recOpen, setRecOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recordings")
      .select("id, filename, duration, recorded_at, transcript, transcript_status, transcription_service, drive_url")
      .order("recorded_at", { ascending: false });
    if (error) {
      toast.error(error.message);
    } else {
      setItems((data ?? []) as Row[]);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // === Upload from disk ===
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("יש להתחבר");
      return;
    }
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        try {
          const b64 = await blobToBase64(file);
          const res = await supabase.functions.invoke("upload-transcriber-file", {
            body: {
              filename: file.name,
              mimeType: file.type || "audio/webm",
              dataBase64: b64,
              bucket: "recordings",
              createRecordingRow: true,
            },
          });
          const errMsg = res.error?.message || (res.data as any)?.error;
          if (errMsg) {
            toast.error("העלאה נכשלה", { description: (res.data as any)?.message || errMsg });
            continue;
          }
        } catch (e: any) {
          toast.error("שגיאה בהעלאה", { description: e?.message });
          continue;
        }
      }
      toast.success("הקובץ נוסף — תוכל לתמלל אותו עכשיו");
      await load();
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // === Mic recording ===
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      mediaRef.current = mr;
      chunksRef.current = [];
      mr.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      mr.start();
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e: any) {
      toast.error(e?.message || "לא ניתן לגשת למיקרופון");
    }
  };

  const togglePause = () => {
    const mr = mediaRef.current;
    if (!mr) return;
    if (paused) {
      mr.resume();
      tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } else {
      mr.pause();
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    }
    setPaused(!paused);
  };

  const stopAndSave = async () => {
    const mr = mediaRef.current;
    if (!mr) return;
    setUploading(true);
    const stopped = new Promise<Blob>((resolve) => {
      mr.onstop = () => resolve(new Blob(chunksRef.current, { type: "audio/webm" }));
    });
    mr.stop();
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    setRecording(false);
    setPaused(false);

    const blob = await stopped;
    const filename = `הקלטה-${new Date().toISOString().replace(/[:.]/g, "-")}.webm`;
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("יש להתחבר");
      setUploading(false);
      return;
    }
    try {
      const b64 = await blobToBase64(blob);
      const res = await supabase.functions.invoke("upload-transcriber-file", {
        body: {
          filename,
          mimeType: "audio/webm",
          dataBase64: b64,
          bucket: "recordings",
          createRecordingRow: true,
          durationSeconds: seconds,
        },
      });
      const errMsg = res.error?.message || (res.data as any)?.error;
      if (errMsg) {
        toast.error("העלאה נכשלה", { description: (res.data as any)?.message || errMsg });
        setUploading(false);
        return;
      }
    } catch (e: any) {
      toast.error("שגיאה בהעלאה", { description: e?.message });
      setUploading(false);
      return;
    }
    toast.success("ההקלטה נוספה");
    setRecOpen(false);
    setUploading(false);
    setSeconds(0);
    await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("למחוק את ההקלטה?")) return;
    const { error } = await supabase.from("recordings").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("נמחק");
    load();
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-3 shrink-0">
            <SidebarTrigger />
            <Headphones className="h-5 w-5 text-primary" />
            <h1 className="text-lg font-semibold">תמלול</h1>
          </header>

          <div className="flex-1 p-6 space-y-6 overflow-auto max-w-5xl mx-auto w-full">
            {/* Action zone */}
            <Card className="p-6 bg-gradient-to-l from-primary/5 via-card to-card">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <Button
                  size="lg"
                  className="flex-1 h-16 text-base"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  {uploading ? <Loader2 className="h-5 w-5 ml-2 animate-spin" /> : <Upload className="h-5 w-5 ml-2" />}
                  העלה קובץ אודיו
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="flex-1 h-16 text-base"
                  onClick={() => { setRecOpen(true); startRecording(); }}
                >
                  <Mic className="h-5 w-5 ml-2" />
                  הקלט עכשיו
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                העלה קובץ או הקלט מהמיקרופון — לאחר מכן לחץ "תמלל" כדי לקבל תמלול בעברית.
              </p>
            </Card>

            {/* Recordings list */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-muted-foreground px-1">ההקלטות שלי</h2>
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : items.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground text-sm">
                  אין הקלטות עדיין. העלה קובץ או הקלט כדי להתחיל.
                </Card>
              ) : (
                items.map((r) => {
                  const meta = STATUS_META[r.transcript_status] ?? STATUS_META.pending;
                  const Icon = meta.icon;
                  return (
                    <Card key={r.id} className="p-3 flex items-center gap-3">
                      <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        <Mic className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{r.filename}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                          <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
                          {r.duration && <span>• {r.duration}</span>}
                          <Badge variant="outline" className={`gap-1 text-[10px] h-5 ${meta.cls}`}>
                            <Icon className={`h-3 w-3 ${r.transcript_status === "processing" ? "animate-spin" : ""}`} />
                            {meta.label}
                          </Badge>
                        </div>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {r.transcript ? (
                          <Button size="sm" variant="outline" onClick={() => setViewTarget(r)}>
                            <Eye className="h-3.5 w-3.5 ml-1" />
                            צפייה
                          </Button>
                        ) : (
                          <Button size="sm" onClick={() => setTranscribeTarget(r)}>
                            <FileText className="h-3.5 w-3.5 ml-1" />
                            תמלל
                          </Button>
                        )}
                        <Button size="icon" variant="ghost" onClick={() => handleDelete(r.id)} title="מחק">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        </SidebarInset>
      </div>

      {/* Recording dialog */}
      {recOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !recording && setRecOpen(false)}>
          <Card className="p-6 max-w-md w-full mx-4 space-y-4" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-semibold text-center">הקלטה מהמיקרופון</h2>
            <div className="text-center py-4">
              <div className={`h-20 w-20 mx-auto rounded-full flex items-center justify-center ${recording && !paused ? "bg-destructive/10 animate-pulse" : "bg-muted"}`}>
                <Mic className={`h-10 w-10 ${recording && !paused ? "text-destructive" : "text-muted-foreground"}`} />
              </div>
              <div className="text-3xl font-mono mt-3">{fmtTime(seconds)}</div>
            </div>
            <div className="flex gap-2">
              {recording && (
                <Button variant="outline" className="flex-1" onClick={togglePause} disabled={uploading}>
                  {paused ? <Play className="h-4 w-4 ml-1" /> : <Pause className="h-4 w-4 ml-1" />}
                  {paused ? "המשך" : "השהה"}
                </Button>
              )}
              <Button className="flex-1" onClick={stopAndSave} disabled={!recording || uploading}>
                {uploading ? <Loader2 className="h-4 w-4 ml-1 animate-spin" /> : <Square className="h-4 w-4 ml-1" />}
                עצור ושמור
              </Button>
            </div>
            <Button variant="ghost" className="w-full" onClick={() => {
              if (recording) {
                mediaRef.current?.stop();
                if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
                streamRef.current?.getTracks().forEach((t) => t.stop());
              }
              setRecording(false);
              setPaused(false);
              setSeconds(0);
              setRecOpen(false);
            }} disabled={uploading}>
              ביטול
            </Button>
          </Card>
        </div>
      )}

      {transcribeTarget && (
        <TranscribeDialog
          recordingId={transcribeTarget.id}
          audioUrl={transcribeTarget.drive_url ?? undefined}
          table="recordings"
          open={!!transcribeTarget}
          onOpenChange={(o) => !o && setTranscribeTarget(null)}
          onCompleted={() => { setTranscribeTarget(null); load(); }}
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
          transcriptionService={viewTarget.transcription_service}
          defaultTab="view"
          onUpdated={load}
        />
      )}
    </SidebarProvider>
  );
};

export default TranscribePage;
