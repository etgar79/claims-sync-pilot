import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { TranscriptionService } from "@/components/TranscribeDialog";
import { needsSplitting, splitAudioFile } from "@/lib/audioSplitter";

// Always include lovable_ai as the guaranteed-available engine. If external
// engines (ivrit_ai/whisper/elevenlabs) are misconfigured or rate-limited,
// lovable_ai still produces a transcript so the user is never left empty-handed.
const SERVICES: TranscriptionService[] = ["lovable_ai", "ivrit_ai", "whisper", "elevenlabs"];

const SERVICE_NAMES: Record<TranscriptionService, string> = {
  lovable_ai: "AI מובנה",
  ivrit_ai: "AI חסכוני",
  whisper: "AI מהיר",
  elevenlabs: "AI איכות גבוהה",
};

interface RunAllOptions {
  recordingId: string;
  audioFile?: File;
  audioUrl?: string;
  table?: "recordings" | "meeting_recordings";
  context?: { title?: string; client?: string; project?: string };
  onProgress?: (status: string) => void;
  onCompleted?: () => void;
}

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

async function callTranscribeEdge(
  file: File | Blob,
  service: TranscriptionService,
  duration: number,
): Promise<string> {
  const fd = new FormData();
  const f = file instanceof File ? file : new File([file], "chunk.wav", { type: "audio/wav" });
  fd.append("file", f);
  fd.append("service", service);
  if (duration > 0) fd.append("client_duration", String(duration));

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
  return (data.transcript as string) ?? "";
}

async function runOne(opts: {
  service: TranscriptionService;
  file: File;
  recordingId: string;
  userId: string;
  duration: number;
  onProgress?: (status: string) => void;
}): Promise<string> {
  let transcript = "";

  if (needsSplitting(opts.file)) {
    opts.onProgress?.(`מפצל קובץ גדול לחלקים...`);
    const chunks = await splitAudioFile(opts.file);
    const parts: (string | null)[] = new Array(chunks.length).fill(null);
    // Sequential to keep load gentle when running for multiple engines.
    for (let i = 0; i < chunks.length; i++) {
      const c = chunks[i];
      opts.onProgress?.(`מתמלל חלק ${i + 1}/${chunks.length}...`);
      try {
        parts[i] = await callTranscribeEdge(c.blob, opts.service, c.endSec - c.startSec);
      } catch (e) {
        console.error(`chunk ${i} failed:`, e);
        parts[i] = null;
      }
    }
    if (parts.every((p) => p == null)) throw new Error("כל החלקים נכשלו");
    transcript = parts.map((t, i) => (t == null ? `\n[חלק ${i + 1} לא תומלל]\n` : t)).join("\n\n");
  } else {
    transcript = await callTranscribeEdge(opts.file, opts.service, opts.duration);
  }

  // Save as a version
  await supabase.from("transcript_versions").insert({
    recording_id: opts.recordingId,
    user_id: opts.userId,
    service: opts.service,
    transcript,
    is_merged: false,
  });

  return transcript;
}

export function useTranscribeAll() {
  const [running, setRunning] = useState<string | null>(null); // recordingId being processed

  const runAll = async (opts: RunAllOptions): Promise<boolean> => {
    const { recordingId, audioFile, audioUrl, table = "meeting_recordings", context, onProgress, onCompleted } = opts;
    const toastId = `transcribe-all-${recordingId}`;
    const setProgress = (status: string) => {
      onProgress?.(status);
      toast.loading(status, { id: toastId });
    };

    setRunning(recordingId);
    try {
      setProgress("מתחיל תמלול...");
      const { error: statusError } = await supabase
        .from(table)
        .update({ transcript_status: "processing" })
        .eq("id", recordingId);
      if (statusError) throw statusError;

      // Resolve file
      let file: File | undefined = audioFile;

      // Detect Google Drive URLs and fetch via authenticated edge function (avoids CORS)
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
        const r = await fetch(audioUrl);
        const blob = await r.blob();
        file = new File([blob], "audio.mp3", { type: blob.type || "audio/mpeg" });
      }
      if (!file) throw new Error("לא נמצא קובץ אודיו לתמלול");

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("יש להתחבר");

      const duration = await getAudioDuration(file);

      // Run all services in sequence (so failures are isolated and to be gentle on rate limits)
      const versions: { service: string; text: string }[] = [];
      const failures: { service: string; error: string }[] = [];

      for (const svc of SERVICES) {
        setProgress(`מתמלל עם ${SERVICE_NAMES[svc]}...`);
        try {
          const text = await runOne({ service: svc, file, recordingId, userId: user.id, duration, onProgress: setProgress });
          if (text?.trim()) versions.push({ service: svc, text });
        } catch (e: any) {
          console.error(`Service ${svc} failed:`, e);
          failures.push({ service: svc, error: e?.message || "שגיאה" });
        }
      }

      if (versions.length === 0) {
        throw new Error("כל התמלולים נכשלו: " + failures.map((f) => `${f.service}: ${f.error}`).join("; "));
      }

      if (failures.length > 0) {
        toast.warning(`חלק מהמנועים נכשלו (${failures.length}/${SERVICES.length})`, {
          description: failures.map((f) => SERVICE_NAMES[f.service as TranscriptionService] ?? f.service).join(", "),
        });
      }

      // If only one succeeded - just use it directly
      if (versions.length === 1) {
        const single = versions[0];
        await supabase
          .from(table)
          .update({
            transcript: single.text,
            transcript_status: "completed",
            transcription_service: single.service,
          })
          .eq("id", recordingId);
        toast.success(`תמלול הושלם (רק ${SERVICE_NAMES[single.service as TranscriptionService]} הצליח)`, { id: toastId });
        onCompleted?.();
        return true;
      }

      // Merge with the configured AI engine
      setProgress("ממזג את כל הגרסאות עם AI...");
      const mergeRes = await supabase.functions.invoke("merge-transcripts", {
        body: { versions, language: "he", context },
      });
      if (mergeRes.error) throw mergeRes.error;
      const merged: string = mergeRes.data?.merged_transcript;
      if (!merged) throw new Error("המיזוג לא החזיר תוצאה");

      // Save merged version
      await supabase.from("transcript_versions").insert({
        recording_id: recordingId,
        user_id: user.id,
        service: "merged",
        transcript: merged,
        is_merged: true,
      });

      // Set the merged transcript as the recording's main transcript
      await supabase
        .from(table)
        .update({
          transcript: merged,
          transcript_status: "completed",
          transcription_service: "merged",
        })
        .eq("id", recordingId);

      toast.success(`תמלול הושלם בהצלחה! (${versions.length} מנועים + מיזוג AI)`, { id: toastId });
      onCompleted?.();
      return true;
    } catch (e: any) {
      await supabase
        .from(table)
        .update({ transcript_status: "failed" })
        .eq("id", recordingId);
      toast.error(e?.message || "שגיאה בתמלול", { id: toastId });
      return false;
    } finally {
      setRunning(null);
    }
  };

  return { runAll, running };
}
