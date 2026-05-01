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
  price: string;
  badge?: { label: string; icon: React.ReactNode; className: string };
}

const SERVICES: ServiceOption[] = [
  {
    id: "ivrit_ai",
    name: "ivrit.ai",
    tagline: "מודל ייעודי לעברית 🇮🇱",
    pros: ["דיוק הכי גבוה בעברית", "מבין סלנג ומונחי מקצוע", "פותח בישראל"],
    price: "חינם / זול",
    badge: { label: "מומלץ לעברית", icon: <Star className="h-3 w-3" />, className: "bg-primary text-primary-foreground" },
  },
  {
    id: "whisper",
    name: "OpenAI Whisper",
    tagline: "האיזון המושלם בין מחיר ואיכות",
    pros: ["דיוק מצוין בעברית", "מהיר מאוד", "$0.006 לדקה"],
    price: "~$0.36 לשעה",
    badge: { label: "משתלם", icon: <Zap className="h-3 w-3" />, className: "bg-secondary text-secondary-foreground" },
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs Scribe",
    tagline: "עם פיצ'רים מתקדמים",
    pros: ["זיהוי דוברים (Diarization)", "תיוג אירועי שמע", "חותמות זמן מדויקות"],
    price: "~$0.40 לשעה",
    badge: { label: "פרימיום", icon: <Sparkles className="h-3 w-3" />, className: "bg-accent text-accent-foreground" },
  },
];

interface Props {
  recordingId: string;
  audioUrl?: string;
  audioFile?: File;
  table?: "recordings" | "meeting_recordings";
  onCompleted?: (transcript: string, service: TranscriptionService) => void;
  trigger?: React.ReactNode;
}

export function TranscribeDialog({ recordingId, audioUrl, audioFile, table = "recordings", onCompleted, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<TranscriptionService | null>(null);

  const handleSelect = async (service: TranscriptionService) => {
    setLoading(service);
    try {
      let file: File | undefined = audioFile;
      if (!file && audioUrl) {
        const res = await fetch(audioUrl);
        const blob = await res.blob();
        file = new File([blob], "audio.mp3", { type: blob.type || "audio/mpeg" });
      }
      if (!file) throw new Error("לא נמצא קובץ אודיו לתמלול");

      const fd = new FormData();
      fd.append("file", file);
      fd.append("service", service);

      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
      const res = await fetch(url, {
        method: "POST",
        headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || `שגיאה ${res.status}`);

      const { error: updErr } = await supabase
        .from(table)
        .update({
          transcript: data.transcript,
          transcript_status: "completed",
          transcription_service: service,
        })
        .eq("id", recordingId);
      if (updErr) throw updErr;

      toast.success(`התמלול הושלם בהצלחה (${SERVICES.find((s) => s.id === service)?.name})`);
      onCompleted?.(data.transcript, service);
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
          <DialogTitle>בחר שירות תמלול</DialogTitle>
          <DialogDescription>3 שירותי תמלול מובילים - בחר את המתאים לצרכים שלך</DialogDescription>
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
              <div className="text-xs text-muted-foreground border-t pt-2">{svc.price}</div>
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
