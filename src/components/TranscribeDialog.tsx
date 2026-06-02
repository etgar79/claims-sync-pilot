import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Mic, Sparkles, Zap, Loader2, Wand2 } from "lucide-react";
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

// Internal label lookup only — UI no longer exposes per-service buttons.
const SERVICES: ServiceOption[] = [
  { id: "lovable_ai", name: "AI מובנה", tagline: "", pros: [] },
  { id: "ivrit_ai", name: "AI חסכוני", tagline: "", pros: [] },
  { id: "whisper", name: "AI מהיר", tagline: "", pros: [] },
  { id: "elevenlabs", name: "AI איכות גבוהה", tagline: "", pros: [] },
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
  const [loading, setLoading] = useState<TranscriptionService | "turbo" | "super" | null>(null);
  const [chunkProgress, setChunkProgress] = useState<{ done: number; total: number } | null>(null);
  const [superProgress, setSuperProgress] = useState<{ done: number; total: number } | null>(null);

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

  // Try services in order until one succeeds for a single chunk/file.
  async function transcribeOneWithFallback(
    file: File | Blob,
    order: TranscriptionService[],
    token: string,
    clientDuration?: number,
  ): Promise<{ transcript: string; service: TranscriptionService; segments?: any[] | null }> {
    let lastErr: unknown = null;
    for (const svc of order) {
      try {
        const r: any = await transcribeOneWithRetry(file, svc, token, clientDuration);
        return { transcript: r.transcript ?? "", service: (r.service as TranscriptionService) ?? svc, segments: r.segments ?? null };
      } catch (e) {
        lastErr = e;
        console.warn(`[turbo] ${svc} failed, trying next:`, e);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
  }

  // Load the audio file (from prop, Drive, or URL). Shared by quick & turbo paths.
  async function loadAudioFile(toastId: string): Promise<{ file: File; token: string }> {
    let file: File | undefined = audioFile;
    const driveMatch = audioUrl?.match(/\/file\/d\/([^/]+)|[?&]id=([^&]+)/);
    const driveFileId = driveMatch ? (driveMatch[1] || driveMatch[2]) : null;
    const { data: sess } = await supabase.auth.getSession();
    const token = sess.session?.access_token || import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

    if (!file && (driveFileId || recordingId)) {
      toast.loading("מוריד את קובץ האודיו...", { id: toastId });
      if (!sess.session?.access_token) throw new Error("נדרשת התחברות");
      const authToken = sess.session.access_token;
      let blob: Blob | null = null;
      let fname = "audio.mp3";
      if (driveFileId && table === "recordings") {
        try {
          const ownRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-api`, {
            method: "POST",
            headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
            body: JSON.stringify({ action: "download_file", fileId: driveFileId }),
          });
          if (ownRes.ok) {
            blob = await ownRes.blob();
            fname = decodeURIComponent(ownRes.headers.get("X-Filename") || fname);
          }
        } catch {/* fallthrough */}
      }
      if (!blob) {
        const dlRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-transcriber-file`, {
          method: "POST",
          headers: { Authorization: `Bearer ${authToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ recordingId, driveFileId }),
        });
        if (!dlRes.ok) throw new Error(`הורדה מ-Drive נכשלה: ${await dlRes.text()}`);
        blob = await dlRes.blob();
        fname = decodeURIComponent(dlRes.headers.get("X-Filename") || fname);
      }
      file = new File([blob], fname, { type: blob.type || "audio/mpeg" });
    } else if (!file && audioUrl) {
      const res = await fetch(audioUrl);
      const blob = await res.blob();
      file = new File([blob], "audio.mp3", { type: blob.type || "audio/mpeg" });
    }
    if (!file) throw new Error("לא נמצא קובץ אודיו לתמלול");
    return { file, token };
  }

  async function persistAndPipeline(transcript: string, segments: any[] | null, usedService: TranscriptionService) {
    const { error: updErr } = await supabase
      .from(table)
      .update({ transcript, segments, transcript_status: "completed", transcription_service: usedService })
      .eq("id", recordingId);
    if (updErr) throw updErr;
    const { data: { user } } = await supabase.auth.getUser();
    if (user && transcript) {
      await supabase.from("transcript_versions").insert({
        recording_id: recordingId,
        user_id: user.id,
        service: usedService,
        transcript,
        segments,
        is_merged: false,
      });
    }
    try {
      const { triggerAutoPipeline } = await import("@/lib/autoPipeline");
      triggerAutoPipeline({
        recordingId,
        table,
        workspaceKind: table === "meeting_recordings" ? "architect" : "appraiser",
      });
    } catch {}
  }

  // ⚡ Turbo: always split into small chunks, parallel x4, per-chunk fallback across 3 services.
  const handleTurbo = async () => {
    setLoading("turbo");
    setChunkProgress(null);
    const toastId = `transcribe-${recordingId}`;
    try {
      toast.loading("⚡ מתחיל תמלול טורבו...", { id: toastId });
      await supabase.from(table).update({ transcript_status: "processing" }).eq("id", recordingId);

      const { file, token } = await loadAudioFile(toastId);
      const clientDuration = await getAudioDuration(file);
      const fallbackOrder: TranscriptionService[] = ["whisper", "elevenlabs", "lovable_ai"];

      let finalTranscript = "";
      let finalSegments: any[] | null = null;
      let usedService: TranscriptionService = "whisper";
      const failedChunks: number[] = [];

      // Try to split. If decode fails (problematic m4a codec), send whole file to ElevenLabs.
      let chunks: AudioChunk[] | null = null;
      try {
        toast.loading("מפצל לחלקים קטנים...", { id: toastId });
        chunks = await splitAudioFile(file, {
          targetSeconds: 300,
          onProgress: (decoded, encoded, total) => {
            if (decoded && total > 0) setChunkProgress({ done: encoded, total });
          },
        });
      } catch (splitErr) {
        console.warn("[turbo] split failed, falling back to whole-file ElevenLabs:", splitErr);
        toast.loading("פיצול נכשל — שולח לתמלול בענן...", { id: toastId });
        const r = await transcribeOneWithFallback(file, ["elevenlabs", "lovable_ai"], token, clientDuration);
        await persistAndPipeline(r.transcript, r.segments ?? null, r.service);
        toast.success("✨ תמלול טורבו הושלם", { id: toastId });
        onCompleted?.(r.transcript, r.service);
        setOpen(false);
        return;
      }

      setChunkProgress({ done: 0, total: chunks.length });
      toast.loading(`⚡ מתמלל ${chunks.length} חלקים במקביל...`, { id: toastId });

      const results: ({ text: string; segments: any[] | null } | null)[] = new Array(chunks.length).fill(null);
      const queue = [...chunks];
      let completed = 0;
      const concurrency = Math.min(4, chunks.length);
      const workers = Array.from({ length: concurrency }, async () => {
        while (queue.length > 0) {
          const c = queue.shift();
          if (!c) break;
          try {
            const r = await transcribeOneWithFallback(c.blob, fallbackOrder, token, c.endSec - c.startSec);
            results[c.index] = { text: r.transcript, segments: r.segments ?? null };
            usedService = r.service;
          } catch (e) {
            console.error(`[turbo] chunk ${c.index} failed all services:`, e);
            results[c.index] = null;
            failedChunks.push(c.index + 1);
          } finally {
            completed += 1;
            setChunkProgress({ done: completed, total: chunks!.length });
            toast.loading(`⚡ חלק ${completed}/${chunks!.length}`, { id: toastId });
          }
        }
      });
      await Promise.all(workers);

      finalTranscript = results
        .map((r, i) => (r == null ? `\n[חלק ${i + 1} לא תומלל]\n` : r.text))
        .join("\n\n");
      const { stitchChunkSegments } = await import("@/lib/stitchSegments");
      const stitched = stitchChunkSegments(
        results.map((r, idx) => ({ segments: r?.segments ?? null, startSec: chunks![idx].startSec || 0 })),
      );
      finalSegments = stitched.length ? stitched : null;

      if (failedChunks.length === chunks.length) throw new Error("כל החלקים נכשלו בתמלול");

      await persistAndPipeline(finalTranscript, finalSegments, usedService);
      if (failedChunks.length > 0) {
        toast.warning(`✨ תמלול טורבו הושלם חלקית. חלקים שנכשלו: ${failedChunks.join(", ")}`, { id: toastId });
      } else {
        toast.success("✨ תמלול טורבו הושלם בהצלחה", { id: toastId });
      }
      onCompleted?.(finalTranscript, usedService);
      setOpen(false);
    } catch (e: any) {
      await supabase.from(table).update({ transcript_status: "failed" }).eq("id", recordingId);
      toast.error(e?.message || "שגיאה בתמלול טורבו", { id: toastId });
    } finally {
      setLoading(null);
      setChunkProgress(null);
    }
  };

  // 💎 Super: run 3 engines in parallel, then merge with Gemini for max quality.
  const handleSuper = async () => {
    setLoading("super");
    setChunkProgress(null);
    setSuperProgress({ done: 0, total: 3 });
    const toastId = `transcribe-${recordingId}`;
    try {
      toast.loading("💎 מתחיל תמלול-על (3 מנועים)...", { id: toastId });
      await supabase.from(table).update({ transcript_status: "processing" }).eq("id", recordingId);

      const { file, token } = await loadAudioFile(toastId);
      const clientDuration = await getAudioDuration(file);
      const big = needsSplitting(file);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("נדרשת התחברות");

      const engines: TranscriptionService[] = ["whisper", "elevenlabs", "ivrit_ai"];
      let done = 0;

      const runOne = async (svc: TranscriptionService): Promise<{ service: TranscriptionService; text: string } | null> => {
        try {
          let text = "";
          if (big) {
            const chunks = await splitAudioFile(file, { targetSeconds: 300 });
            const parts = await Promise.all(
              chunks.map(async (c) => {
                try {
                  const r: any = await transcribeOneWithRetry(c.blob, svc, token, c.endSec - c.startSec);
                  return r.transcript ?? "";
                } catch (e) {
                  console.warn(`[super] ${svc} chunk ${c.index} failed`, e);
                  return "";
                }
              }),
            );
            text = parts.join("\n\n").trim();
          } else {
            const r: any = await transcribeOneWithRetry(file, svc, token, clientDuration);
            text = (r.transcript ?? "").trim();
          }
          if (!text) return null;
          await supabase.from("transcript_versions").insert({
            recording_id: recordingId, user_id: user.id, service: svc, transcript: text, is_merged: false,
          });
          return { service: svc, text };
        } catch (e) {
          console.error(`[super] engine ${svc} failed`, e);
          return null;
        } finally {
          done += 1;
          setSuperProgress({ done, total: engines.length });
          toast.loading(`💎 הושלמו ${done}/${engines.length} מנועים...`, { id: toastId });
        }
      };

      const results = (await Promise.all(engines.map(runOne))).filter(Boolean) as { service: TranscriptionService; text: string }[];
      if (results.length === 0) throw new Error("כל המנועים נכשלו");

      let finalTranscript = "";
      let finalService: TranscriptionService | "merged" = "merged";
      let qualityScore: number | null = null;
      let qualityNotes: string | null = null;

      if (results.length >= 2) {
        toast.loading("💎 ממזג גרסאות ל-תמלול-על...", { id: toastId });
        const workspaceKind = table === "meeting_recordings" ? "architect" : "appraiser";
        const { data, error } = await supabase.functions.invoke("merge-transcripts", {
          body: {
            versions: results.map((v) => ({ service: v.service, text: v.text })),
            language: "he",
            workspace_kind: workspaceKind,
          },
        });
        if (error) throw error;
        if ((data as any)?.error) throw new Error((data as any).error);
        finalTranscript = (data as any).merged_transcript as string;
        qualityScore = (data as any).quality_score ?? null;
        qualityNotes = (data as any).quality_notes ?? null;
        await supabase.from("transcript_versions").insert({
          recording_id: recordingId, user_id: user.id, service: "merged",
          transcript: finalTranscript, is_merged: true,
          source_version_ids: null, quality_score: qualityScore, quality_notes: qualityNotes,
        });
      } else {
        finalTranscript = results[0].text;
        finalService = results[0].service;
      }

      await supabase.from(table).update({
        transcript: finalTranscript,
        transcript_status: "completed",
        transcription_service: finalService,
        quality_score: qualityScore,
        quality_notes: qualityNotes,
      }).eq("id", recordingId);

      try {
        const { triggerAutoPipeline } = await import("@/lib/autoPipeline");
        triggerAutoPipeline({
          recordingId, table,
          workspaceKind: table === "meeting_recordings" ? "architect" : "appraiser",
        });
      } catch {}

      toast.success(results.length >= 2 ? "💎 תמלול-על הושלם בהצלחה" : "תמלול הושלם (מנוע יחיד הצליח)", { id: toastId });
      onCompleted?.(finalTranscript, finalService as TranscriptionService);
      setOpen(false);
    } catch (e: any) {
      await supabase.from(table).update({ transcript_status: "failed" }).eq("id", recordingId);
      toast.error(e?.message || "שגיאה בתמלול-על", { id: toastId });
    } finally {
      setLoading(null);
      setSuperProgress(null);
    }
  };

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

      if (!file && (driveFileId || recordingId)) {
        toast.loading("מוריד את קובץ האודיו...", { id: toastId });
        const { data: sess } = await supabase.auth.getSession();
        const token = sess.session?.access_token;
        if (!token) throw new Error("נדרשת התחברות");

        // Try the user's own Drive first (architect/appraiser flows). If the
        // user has no Drive connected (transcriber role), fall back to the
        // admin-owned central Drive via download-transcriber-file.
        let blob: Blob | null = null;
        let fname = "audio.mp3";
        if (driveFileId && table === "recordings") {
          try {
            const ownRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-api`, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ action: "download_file", fileId: driveFileId }),
            });
            if (ownRes.ok) {
              blob = await ownRes.blob();
              fname = decodeURIComponent(ownRes.headers.get("X-Filename") || fname);
            }
          } catch {/* fallthrough */}
        }
        if (!blob) {
          const dlRes = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/download-transcriber-file`, {
            method: "POST",
            headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
            body: JSON.stringify({ recordingId, driveFileId }),
          });
          if (!dlRes.ok) {
            const errText = await dlRes.text();
            throw new Error(`הורדה מ-Drive נכשלה: ${errText}`);
          }
          blob = await dlRes.blob();
          fname = decodeURIComponent(dlRes.headers.get("X-Filename") || fname);
        }
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
      let finalSegments: any[] | null = null;
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
        const results: ({ text: string; segments: any[] | null } | null)[] = new Array(chunks.length).fill(null);
        const queue = [...chunks];
        let completed = 0;
        const workers = Array.from({ length: Math.min(2, chunks.length) }, async () => {
          while (queue.length > 0) {
            const c = queue.shift();
            if (!c) break;
            try {
              const r: any = await transcribeOneWithRetry(c.blob, service, token, c.endSec - c.startSec);
              results[c.index] = { text: r.transcript ?? "", segments: Array.isArray(r.segments) ? r.segments : null };
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
          .map((r, i) => (r == null ? `\n[חלק ${i + 1} לא תומלל]\n` : r.text))
          .join("\n\n");

        // Stitch segments using each chunk's startSec offset (and remap speakers globally).
        const { stitchChunkSegments } = await import("@/lib/stitchSegments");
        const stitched = stitchChunkSegments(
          results.map((r, idx) => ({ segments: r?.segments ?? null, startSec: chunks[idx].startSec || 0 })),
        );
        finalSegments = stitched.length ? stitched : null;

        if (failedChunks.length === chunks.length) {
          throw new Error("כל החלקים נכשלו בתמלול");
        }
      } else {
        toast.loading("שולח לתמלול...", { id: toastId });
        const data: any = await transcribeOneWithRetry(file, service, token, clientDuration);
        finalTranscript = data.transcript ?? "";
        finalSegments = Array.isArray(data.segments) ? data.segments : null;
        usedService = (data.service as TranscriptionService) ?? service;
        fallbackUsed = !!data.fallback_used;
      }

      const { error: updErr } = await supabase
        .from(table)
        .update({
          transcript: finalTranscript,
          segments: finalSegments,
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
          segments: finalSegments,
          is_merged: false,
        });
      }

      // Trigger auto-pipeline (summary + extract tasks) in background
      try {
        const { triggerAutoPipeline } = await import("@/lib/autoPipeline");
        triggerAutoPipeline({
          recordingId,
          table,
          workspaceKind: table === "meeting_recordings" ? "architect" : "appraiser",
        });
      } catch {}

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
          <DialogDescription>בחרי איכות — והמערכת תתחיל. קבצים גדולים יפוצלו אוטומטית לחלקים.</DialogDescription>
        </DialogHeader>

        {chunkProgress && chunkProgress.total > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-muted/40 border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">
                מתמלל קובץ גדול — חלק {chunkProgress.done} מתוך {chunkProgress.total}
              </span>
              <span className="text-muted-foreground">
                {Math.round((chunkProgress.done / chunkProgress.total) * 100)}%
              </span>
            </div>
            <Progress value={(chunkProgress.done / chunkProgress.total) * 100} />
          </div>
        )}

        {superProgress && superProgress.total > 0 && (
          <div className="mt-3 p-3 rounded-lg bg-muted/40 border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium">תמלול-על — {superProgress.done}/{superProgress.total} מנועים הסתיימו</span>
              <span className="text-muted-foreground">{Math.round((superProgress.done / superProgress.total) * 100)}%</span>
            </div>
            <Progress value={(superProgress.done / superProgress.total) * 100} />
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
          {/* ⚡ Fast: single best engine + fallback, chunking for large files */}
          <button
            onClick={handleTurbo}
            disabled={loading !== null}
            className="text-right rounded-lg p-4 transition-all disabled:opacity-50 flex flex-col gap-2 bg-gradient-to-br from-primary to-primary/70 text-primary-foreground hover:shadow-lg hover:scale-[1.01]"
          >
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-md bg-white/20 flex items-center justify-center shrink-0">
                {loading === "turbo" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Zap className="h-5 w-5" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">⚡ תמלול מהיר</span>
                <Badge className="bg-white/25 text-white border-0 text-[10px] py-0">מומלץ</Badge>
              </div>
            </div>
            <p className="text-xs opacity-90 leading-snug">מהיר, חכם, מתאים לרוב המקרים — כולל קבצים גדולים</p>
          </button>

          {/* 💎 Super: 3 engines in parallel + Gemini merge */}
          <button
            onClick={handleSuper}
            disabled={loading !== null}
            className="text-right rounded-lg p-4 transition-all disabled:opacity-50 flex flex-col gap-2 bg-gradient-to-br from-accent to-accent/60 text-accent-foreground hover:shadow-lg hover:scale-[1.01] border border-accent-foreground/10"
          >
            <div className="flex items-center gap-2">
              <div className="h-9 w-9 rounded-md bg-foreground/10 flex items-center justify-center shrink-0">
                {loading === "super" ? <Loader2 className="h-5 w-5 animate-spin" /> : <Wand2 className="h-5 w-5" />}
              </div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">💎 תמלול-על</span>
                <Badge variant="secondary" className="text-[10px] py-0">איכות מקס׳</Badge>
              </div>
            </div>
            <p className="text-xs opacity-90 leading-snug">משלב 3 מנועים לאיכות מקסימלית — לפגישות חשובות / שמע ירוד</p>
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
