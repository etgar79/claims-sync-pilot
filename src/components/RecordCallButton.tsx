import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Mic, Square, Upload, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { WorkspaceKind } from "@/hooks/useWorkspaceFolder";

interface Props {
  workspace: WorkspaceKind;
  onCreated?: () => void;
  size?: "sm" | "default";
  purpose?: "recordings" | "calls";
  label?: string;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onloadend = () => {
      const res = r.result as string;
      // strip "data:<mime>;base64,"
      const idx = res.indexOf(",");
      resolve(idx >= 0 ? res.slice(idx + 1) : res);
    };
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function fmtTime(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function RecordCallButton({ workspace, onCreated, size = "sm" }: Props) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [uploading, setUploading] = useState(false);
  const mediaRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      // cleanup on unmount
      if (tickRef.current) window.clearInterval(tickRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  const cleanup = () => {
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRef.current = null;
    chunksRef.current = [];
    setRecording(false);
    setPaused(false);
    setSeconds(0);
  };

  const startRec = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const mr = new MediaRecorder(stream, { mimeType: mime });
      chunksRef.current = [];
      mr.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };
      mr.start(1000);
      mediaRef.current = mr;
      setRecording(true);
      setPaused(false);
      setSeconds(0);
      tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    } catch (e) {
      console.error("getUserMedia failed", e);
      toast.error("לא ניתן לגשת למיקרופון", {
        description: "ודא שהענקת הרשאת מיקרופון בדפדפן",
      });
    }
  };

  const togglePause = () => {
    const mr = mediaRef.current;
    if (!mr) return;
    if (mr.state === "recording") {
      mr.pause();
      setPaused(true);
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    } else if (mr.state === "paused") {
      mr.resume();
      setPaused(false);
      tickRef.current = window.setInterval(() => setSeconds((s) => s + 1), 1000);
    }
  };

  const stopAndUpload = async () => {
    const mr = mediaRef.current;
    if (!mr) return;
    const recordedSeconds = seconds;
    await new Promise<void>((resolve) => {
      mr.onstop = () => resolve();
      mr.stop();
    });
    if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
    streamRef.current?.getTracks().forEach((t) => t.stop());

    const blob = new Blob(chunksRef.current, { type: mr.mimeType || "audio/webm" });
    chunksRef.current = [];
    setRecording(false);
    setPaused(false);

    if (blob.size === 0) {
      toast.error("ההקלטה ריקה");
      cleanup();
      return;
    }

    await uploadBlob(blob, recordedSeconds, defaultName("rec"));
  };

  const uploadBlob = async (blob: Blob, durationSeconds: number, filename: string) => {
    setUploading(true);
    try {
      const dataBase64 = await blobToBase64(blob);
      const { data, error } = await supabase.functions.invoke("upload-recording", {
        body: {
          workspace,
          filename,
          mimeType: blob.type || "audio/webm",
          dataBase64,
          durationSeconds,
        },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        if (ctx?.json) {
          try { const b = await ctx.json(); msg = b?.message || b?.error || msg; } catch {}
        }
        throw new Error(msg);
      }
      toast.success("ההקלטה נשמרה ונשלחה ל-Drive");
      onCreated?.();
      setOpen(false);
      cleanup();
    } catch (e) {
      toast.error("שגיאה בהעלאת ההקלטה", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setUploading(false);
    }
  };

  const onPickFile = async (file: File) => {
    if (!file) return;
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|m4a|webm|ogg|aac)$/i.test(file.name)) {
      toast.error("יש לבחור קובץ אודיו");
      return;
    }
    await uploadBlob(file, 0, file.name);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o && recording) {
          // user closed mid-recording; stop tracks
          mediaRef.current?.stop();
          cleanup();
        }
        setOpen(o);
      }}
    >
      <DialogTrigger asChild>
        <Button size={size} variant="default" className="gap-2">
          <Mic className="h-4 w-4" />
          הקלט שיחה
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>הקלטת שיחה</DialogTitle>
          <DialogDescription>
            הקלט מהמיקרופון של המכשיר, או העלה קובץ הקלטה קיים. הקובץ יישמר אוטומטית בתיקיית ה-Drive שלך.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="rounded-lg border border-border p-4 flex flex-col items-center gap-3">
            <div className={`h-16 w-16 rounded-full flex items-center justify-center ${recording ? "bg-destructive/10" : "bg-primary/10"}`}>
              <Mic className={`h-7 w-7 ${recording ? "text-destructive animate-pulse" : "text-primary"}`} />
            </div>
            <div className="text-2xl font-mono tabular-nums">{fmtTime(seconds)}</div>
            <div className="flex gap-2">
              {!recording && !uploading && (
                <Button onClick={startRec} className="gap-2">
                  <Mic className="h-4 w-4" />
                  התחל הקלטה
                </Button>
              )}
              {recording && (
                <>
                  <Button onClick={togglePause} variant="outline" className="gap-2">
                    {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />}
                    {paused ? "המשך" : "השהה"}
                  </Button>
                  <Button onClick={stopAndUpload} variant="destructive" className="gap-2" disabled={uploading}>
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Square className="h-4 w-4" />}
                    סיים ושמור
                  </Button>
                </>
              )}
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border" /></div>
            <div className="relative flex justify-center text-xs"><span className="bg-background px-2 text-muted-foreground">או</span></div>
          </div>

          <label className={`flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 cursor-pointer hover:bg-muted/40 ${uploading || recording ? "pointer-events-none opacity-50" : ""}`}>
            <Upload className="h-4 w-4" />
            <span className="text-sm">העלה קובץ אודיו קיים</span>
            <input
              type="file"
              accept="audio/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onPickFile(f);
                e.currentTarget.value = "";
              }}
              disabled={uploading || recording}
            />
          </label>

          {uploading && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              מעלה ל-Drive...
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { if (recording) { mediaRef.current?.stop(); cleanup(); } setOpen(false); }}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function defaultName(prefix: string): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${prefix}-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.webm`;
}
