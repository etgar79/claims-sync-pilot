import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Mic, Sparkles, Star, Zap, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type TranscriptionService = "ivrit_ai" | "whisper" | "elevenlabs";

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
    badge: { label: "מהיר", icon: <Zap className="h-3 w-3" />, className: "bg-primary text-primary-foreground" },
  },
  {
    id: "elevenlabs",
    name: "AI איכות גבוהה",
    tagline: "התמלול המתקדם ביותר ✨",
    pros: ["זיהוי דוברים אוטומטי", "תיוג אירועי שמע", "חותמות זמן מדויקות"],
    badge: { label: "איכות גבוהה", icon: <Sparkles className="h-3 w-3" />, className: "bg-accent text-accent-foreground" },
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

  const handleSelect = async (service: TranscriptionService) => {
    setLoading(service);
    try {
      let file: File | undefined = audioFile;

      // If we only have a Drive URL, fetch the file via authenticated edge function
      const driveMatch = audioUrl?.match(/\/file\/d\/([^/]+)|[?&]id=([^&]+)/);
      const driveFileId = driveMatch ? (driveMatch[1] || driveMatch[2]) : null;

      if (!file && driveFileId) {
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

      const fd = new FormData();
      fd.append("file", file);
      fd.append("service", service);
      if (clientDuration > 0) fd.append("client_duration", String(clientDuration));

      // Use the user's session token so the edge function can attribute usage.
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `שגיאה ${res.status}`);

      const usedService: TranscriptionService = data.service ?? service;
      const { error: updErr } = await supabase
        .from(table)
        .update({
          transcript: data.transcript,
          transcript_status: "completed",
          transcription_service: usedService,
        })
        .eq("id", recordingId);
      if (updErr) throw updErr;

      // Save as a separate version too (for merged super-transcripts)
      const { data: { user } } = await supabase.auth.getUser();
      if (user && data.transcript) {
        await supabase.from("transcript_versions").insert({
          recording_id: recordingId,
          user_id: user.id,
          service: usedService,
          transcript: data.transcript,
          is_merged: false,
        });
      }

      const label = SERVICES.find((s) => s.id === usedService)?.name ?? "תמלול חלופי";
      if (data.fallback_used) {
        toast.warning(`השירות שנבחר לא היה זמין - בוצע תמלול חלופי (${label})`);
      } else {
        toast.success(`התמלול הושלם בהצלחה (${label})`);
      }
      onCompleted?.(data.transcript, usedService);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בתמלול");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="default">
            <Mic className="h-4 w-4 ml-2" />
            תמלל
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>בחר רמת תמלול</DialogTitle>
          <DialogDescription>3 רמות תמלול - בחר את המתאימה לצרכים שלך</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
          {SERVICES.map((svc) => (
            <Card key={svc.id} className="p-4 flex flex-col gap-3 border-2 hover:border-primary transition-colors">
              <div className="flex items-start justify-between">
                <h3 className="font-bold text-lg">{svc.name}</h3>
                {svc.badge && (
                  <Badge className={`gap-1 ${svc.badge.className}`}>
                    {svc.badge.icon}
                    {svc.badge.label}
                  </Badge>
                )}
              </div>
              <p className="text-sm text-muted-foreground">{svc.tagline}</p>
              <ul className="text-sm space-y-1 flex-1">
                {svc.pros.map((p) => (
                  <li key={p} className="flex gap-2">
                    <span className="text-primary">✓</span>
                    <span>{p}</span>
                  </li>
                ))}
              </ul>
              <Button
                onClick={() => handleSelect(svc.id)}
                disabled={loading !== null}
                className="w-full"
              >
                {loading === svc.id ? (
                  <>
                    <Loader2 className="h-4 w-4 ml-2 animate-spin" />
                    מתמלל...
                  </>
                ) : (
                  "בחר ותמלל"
                )}
              </Button>
            </Card>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
