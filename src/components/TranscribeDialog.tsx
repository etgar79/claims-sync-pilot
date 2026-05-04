import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Mic, Sparkles, Star, Zap, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { needsSplitting, splitAudioFile, type AudioChunk } from "@/lib/audioSplitter";

export type TranscriptionService = "lovable_ai" | "ivrit_ai" | "whisper" | "elevenlabs";

interface ServiceOption {
  id: TranscriptionService;
  name: string;
  tagline: string;
  pros: string[];
  badge?: { label: string; icon: React.ReactNode; className: string };
}

// Generic, white-label tiers - no third-party brand names exposed to users.
const SERVICES: ServiceOption[] = [
  {
    id: "lovable_ai",
    name: "AI מובנה",
    tagline: "תמלול חכם ללא הגדרות נוספות ⭐",
    pros: ["פועל מיידית — ללא צורך במפתחות API", "עברית מדויקת עם הבנת הקשר", "כלול במערכת"],
    badge: { label: "מומלץ", icon: <Sparkles className="h-3 w-3" />, className: "bg-primary text-primary-foreground" },
  },
  {
    id: "ivrit_ai",
    name: "AI חסכוני",
    tagline: "המחיר המשתלם ביותר 💰",
    pros: ["הדיוק הטוב ביותר בעברית", "מבין סלנג ומונחים מקצועיים", "עלות מינימלית"],
    badge: { label: "חסכוני", icon: <Star className="h-3 w-3" />, className: "bg-secondary text-secondary-foreground" },
  },
  {
    id: "whisper",
    name: "AI מהיר",
    tagline: "תמלול מהיר ואמין",
    pros: ["דיוק מצוין בעברית", "מהירות גבוהה במיוחד", "מתאים לרוב המקרים"],
    badge: { label: "מהיר", icon: <Zap className="h-3 w-3" />, className: "bg-accent text-accent-foreground" },
  },
  {
    id: "elevenlabs",
    name: "AI איכות גבוהה",
    tagline: "התמלול המתקדם ביותר ✨",
    pros: ["זיהוי דוברים אוטומטי", "תיוג אירועי שמע", "חותמות זמן מדויקות"],
    badge: { label: "איכות גבוהה", icon: <Sparkles className="h-3 w-3" />, className: "bg-secondary text-secondary-foreground" },
  },
];

interface Props {
  recordingId: string;
  audioUrl?: string;
  audioFile?: File;
  table?: "recordings" | "meeting_recordings";
  onCompleted?: (transcript: string, service: TranscriptionService) => void;
  trigger?: React.ReactNode;
  /** Controlled mode */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}

// Read audio duration in seconds in the browser, used as a fallback for usage tracking.
async function getAudioDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.onloadedmetadata = () => {
        const d = isFinite(audio.duration) ? audio.duration : 0;
        URL.revokeObjectURL(url);
        resolve(d);
      };
      audio.onerror = () => {
        URL.revokeObjectURL(url);
        resolve(0);
      };
      audio.src = url;
    } catch {
      resolve(0);
    }
  });
}

export function TranscribeDialog({ recordingId, audioUrl, audioFile, table = "recordings", onCompleted, trigger, open: controlledOpen, onOpenChange: controlledOnOpenChange }: Props) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = controlledOnOpenChange ?? setInternalOpen;
  const [loading, setLoading] = useState<TranscriptionService | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);

  // Send a single chunk (or full file) to the transcribe-audio edge function.
  async function transcribeOne(
    file: File | Blob,
    service: TranscriptionService,
    token: string,
    clientDuration?: number,
  ): Promise<{ transcript: string; service: TranscriptionService; fallback_used?: boolean }> {
    const fd = new FormData();
    const f = file instanceof File ? file : new File([file], "chunk.wav", { type: "audio/wav" });
    fd.append("file", f);
    fd.append("service", service);
    if (clientDuration && clientDuration > 0) fd.append("client_duration", String(clientDuration));
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}` },
      body: fd,
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || `שגיאה ${res.status}`);
    return data;
  }

  async function transcribeOneWithRetry(
    file: File | Blob,
    service: TranscriptionService,
    token: string,
    clientDuration?: number,
  ) {
    let lastErr: unknown = null;
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        return await transcribeOne(file, service, token, clientDuration);
      } catch (e) {
        lastErr = e;
        await new Promise((r) => setTimeout(r, 800 * attempt));
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  const handleSelect = async (service: TranscriptionService) => {
    setLoading(service);
    setChunkProgress(null);
    const toastId = `transcribe-${recordingId}`;
    const selectedLabel = SERVICES.find((s) => s.id === service)?.name ?? "תמלול";
    try {
      toast.loading(`מתחיל ${selectedLabel}...`, { id: toastId });
      const { error: statusError } = await supabase
        .from(table)
        .update({ transcript_status: "processing" })
        .eq("id", recordingId);
      if (statusError) throw statusError;

      let file: File | undefined = audioFile;

      // If we only have a Drive URL, fetch the file via authenticated edge function
      const driveMatch = audioUrl?.match(/\/file\/d\/([^/]+)|[?&]id=([^&]+)/);
      const driveFileId = driveMatch ? (driveMatch[1] || driveMatch[2]) : null;

      if (!file && driveFileId) {
        toast.loading("מוריד את קובץ האודיו...", { id: toastId });
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
          throw new Error(`הורדה מ-Drive נכשלה: ${errText}`);
        }
        const blob = await dlRes.blob();
        const fname = decodeURIComponent(dlRes.headers.get("X-Filename") || "audio.mp3");
        file = new File([blob], fname, { type: blob.type || "audio/mpeg" });
      } else if (!file && audioUrl) {
        const res = await fetch(audioUrl);
        const blob = await res.blob();
        file = new File([blob], "audio.mp3", { type: blob.type || "audio/mpeg" });
      }
      if (!file) throw new Error("לא נמצא קובץ אודיו לתמלול");

      const clientDuration = await getAudioDuration(file);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      let finalTranscript = "";
      let usedService: TranscriptionService = service;
      let fallbackUsed = false;
      const failedChunks: number[] = [];

      if (needsSplitting(file)) {
        // Big file → split locally then transcribe each chunk in order.
        toast.loading(`קובץ גדול — מפצל לחלקים...`, { id: toastId });
        const chunks: AudioChunk[] = await splitAudioFile(file, {
          onProgress: (decoded, encoded, total) => {
            if (decoded && total > 0) setChunkProgress({ done: encoded, total });
          },
        });
        setChunkProgress({ done: 0, total: chunks.length });
        toast.loading(`מתמלל ${chunks.length} חלקים...`, { id: toastId });

        // Concurrency: 2 parallel chunks keeps UI responsive and avoids rate limits.
        const results: (string | null)[] = new Array(chunks.length).fill(null);
        const queue = [...chunks];
        let completed = 0;
        const workers = Array.from({ length: Math.min(2, chunks.length) }, async () => {
          while (queue.length > 0) {
            const c = queue.shift();
            if (!c) break;
            try {
              const r = await transcribeOneWithRetry(c.blob, service, token, c.endSec - c.startSec);
              results[c.index] = r.transcript ?? "";
              if (r.service && r.service !== service) {
                usedService = r.service;
                fallbackUsed = true;
              }
            } catch (e) {
              console.error(`chunk ${c.index} failed:`, e);
              results[c.index] = null;
              failedChunks.push(c.index + 1);
            } finally {
              completed += 1;
              setChunkProgress({ done: completed, total: chunks.length });
              toast.loading(`מתמלל חלק ${completed} מתוך ${chunks.length}...`, { id: toastId });
            }
          }
        });
        await Promise.all(workers);

        finalTranscript = results
          .map((t, i) => (t == null ? `\n[חלק ${i + 1} לא תומלל]\n` : t))
          .join("\n\n");

        if (failedChunks.length === chunks.length) {
          throw new Error("כל החלקים נכשלו בתמלול");
        }
      } else {
        toast.loading("שולח לתמלול...", { id: toastId });
        const data = await transcribeOneWithRetry(file, service, token, clientDuration);
        finalTranscript = data.transcript ?? "";
        usedService = (data.service as TranscriptionService) ?? service;
        fallbackUsed = !!data.fallback_used;
      }

      const { error: updErr } = await supabase
        .from(table)
        .update({
          transcript: finalTranscript,
          transcript_status: "completed",
          transcription_service: usedService,
        })
        .eq("id", recordingId);
      if (updErr) throw updErr;

      const { data: { user } } = await supabase.auth.getUser();
      if (user && finalTranscript) {
        await supabase.from("transcript_versions").insert({
          recording_id: recordingId,
          user_id: user.id,
          service: usedService,
          transcript: finalTranscript,
          is_merged: false,
        });
      }

      const label = SERVICES.find((s) => s.id === usedService)?.name ?? "תמלול חלופי";
      if (failedChunks.length > 0) {
        toast.warning(`הושלם תמלול חלקי (${label}). חלקים שנכשלו: ${failedChunks.join(", ")}`, { id: toastId });
      } else if (fallbackUsed) {
        toast.warning(`השירות שנבחר לא היה זמין - בוצע תמלול חלופי (${label})`, { id: toastId });
      } else {
        toast.success(`התמלול הושלם בהצלחה (${label})`, { id: toastId });
      }
      onCompleted?.(finalTranscript, usedService);
      setOpen(false);
    } catch (e: any) {
      await supabase
        .from(table)
        .update({ transcript_status: "failed" })
        .eq("id", recordingId);
      toast.error(e?.message || "שגיאה בתמלול", { id: toastId });
    } finally {
      setLoading(null);
      setChunkProgress(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button size="sm" variant="default">
              <Mic className="h-4 w-4 ml-2" />
              תמלל
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>תמלול מהיר</DialogTitle>
          <DialogDescription>בחרי איכות — והמערכת תתחיל</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 mt-2">
          {SERVICES.map((svc) => (
            <button
              key={svc.id}
              onClick={() => handleSelect(svc.id)}
              disabled={loading !== null}
              className="w-full text-right border rounded-lg p-3 hover:border-primary hover:bg-muted/30 transition-all disabled:opacity-50 flex items-center gap-3"
            >
              <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
                {loading === svc.id ? (
                  <Loader2 className="h-4 w-4 text-primary animate-spin" />
                ) : (
                  <Mic className="h-4 w-4 text-primary" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm">{svc.name}</span>
                  {svc.badge && (
                    <Badge className={`gap-1 text-[10px] py-0 ${svc.badge.className}`}>
                      {svc.badge.icon}
                      {svc.badge.label}
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">{svc.tagline}</p>
              </div>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
