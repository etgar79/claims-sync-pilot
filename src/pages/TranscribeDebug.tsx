import { useEffect, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle2, XCircle, PlayCircle, Bug } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { needsSplitting, splitAudioFile } from "@/lib/audioSplitter";
import type { TranscriptionService } from "@/components/TranscribeDialog";
import { serviceLabel } from "@/lib/serviceLabels";

const SERVICES: TranscriptionService[] = ["lovable_ai", "ivrit_ai", "whisper", "elevenlabs"];

type EngineState = {
  status: "idle" | "running" | "ok" | "fail";
  ms?: number;
  chars?: number;
  preview?: string;
  error?: string;
  httpStatus?: number;
  rawError?: any;
};

interface Rec {
  id: string;
  filename: string;
  recorded_at: string;
  drive_url: string | null;
  drive_file_id: string | null;
  duration: string | null;
}

async function fetchAudio(rec: Rec): Promise<File> {
  const driveMatch = rec.drive_url?.match(/\/file\/d\/([^/]+)|[?&]id=([^&]+)/);
  const driveFileId = rec.drive_file_id || (driveMatch ? driveMatch[1] || driveMatch[2] : null);
  const { data: sess } = await supabase.auth.getSession();
  const token = sess.session?.access_token;
  if (!token) throw new Error("נדרשת התחברות");

  if (driveFileId) {
    const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-api`;
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action: "download_file", fileId: driveFileId }),
    });
    if (!res.ok) throw new Error(`Drive download נכשל (${res.status}): ${await res.text()}`);
    const blob = await res.blob();
    const name = decodeURIComponent(res.headers.get("X-Filename") || rec.filename || "audio.mp3");
    return new File([blob], name, { type: blob.type || "audio/mpeg" });
  }
  if (rec.drive_url) {
    const r = await fetch(rec.drive_url);
    if (!r.ok) throw new Error(`הורדה ישירה נכשלה (${r.status})`);
    const blob = await r.blob();
    return new File([blob], rec.filename || "audio.mp3", { type: blob.type || "audio/mpeg" });
  }
  throw new Error("אין מקור אודיו (drive_url / drive_file_id ריקים)");
}

async function callEngine(file: File | Blob, service: TranscriptionService, duration: number) {
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
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!res.ok) {
    const err: any = new Error(json?.error || `שגיאה ${res.status}`);
    err.httpStatus = res.status;
    err.raw = json;
    throw err;
  }
  return json.transcript as string ?? "";
}

async function getDuration(file: File): Promise<number> {
  return new Promise((resolve) => {
    try {
      const url = URL.createObjectURL(file);
      const a = document.createElement("audio");
      a.preload = "metadata";
      a.onloadedmetadata = () => { const d = isFinite(a.duration) ? a.duration : 0; URL.revokeObjectURL(url); resolve(d); };
      a.onerror = () => { URL.revokeObjectURL(url); resolve(0); };
      a.src = url;
    } catch { resolve(0); }
  });
}

const TranscribeDebug = () => {
  const [recordings, setRecordings] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, EngineState>>({});
  const [running, setRunning] = useState(false);
  const [fileInfo, setFileInfo] = useState<{ name: string; sizeMB: string; durationSec: number; chunks: number } | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("recordings")
        .select("id, filename, recorded_at, drive_url, drive_file_id, duration")
        .order("recorded_at", { ascending: false })
        .limit(100);
      if (error) toast.error(error.message);
      setRecordings(data || []);
      setLoading(false);
    })();
  }, []);

  const updateEngine = (svc: string, patch: Partial<EngineState>) =>
    setResults((p) => ({ ...p, [svc]: { ...(p[svc] || { status: "idle" }), ...patch } }));

  const runDiagnostic = async () => {
    if (!selectedId) return;
    const rec = recordings.find((r) => r.id === selectedId);
    if (!rec) return;
    setRunning(true);
    setGlobalError(null);
    setResults(Object.fromEntries(SERVICES.map((s) => [s, { status: "idle" } as EngineState])));
    setFileInfo(null);

    try {
      toast.loading("מוריד את הקובץ...", { id: "dbg" });
      const file = await fetchAudio(rec);
      const duration = await getDuration(file);
      const chunks = needsSplitting(file) ? (await splitAudioFile(file)).length : 1;
      setFileInfo({
        name: file.name,
        sizeMB: (file.size / 1024 / 1024).toFixed(2),
        durationSec: Math.round(duration),
        chunks,
      });
      toast.dismiss("dbg");

      for (const svc of SERVICES) {
        updateEngine(svc, { status: "running" });
        const t0 = performance.now();
        try {
          let transcript = "";
          if (needsSplitting(file)) {
            const parts = await splitAudioFile(file);
            const out: string[] = [];
            for (let i = 0; i < parts.length; i++) {
              const c = parts[i];
              try {
                out.push(await callEngine(c.blob, svc, c.endSec - c.startSec));
              } catch (e: any) {
                out.push(`[חלק ${i + 1} נכשל: ${e?.message || e}]`);
              }
            }
            transcript = out.join("\n\n");
          } else {
            transcript = await callEngine(file, svc, duration);
          }
          const ms = Math.round(performance.now() - t0);
          updateEngine(svc, {
            status: transcript?.trim() ? "ok" : "fail",
            ms,
            chars: transcript?.length || 0,
            preview: (transcript || "").slice(0, 240),
            error: transcript?.trim() ? undefined : "החזיר תמלול ריק",
          });
        } catch (e: any) {
          updateEngine(svc, {
            status: "fail",
            ms: Math.round(performance.now() - t0),
            error: e?.message || String(e),
            httpStatus: e?.httpStatus,
            rawError: e?.raw,
          });
        }
      }
    } catch (e: any) {
      setGlobalError(e?.message || String(e));
      toast.error(e?.message || "שגיאה כללית", { id: "dbg" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full" dir="rtl">
        <AppSidebar />
        <SidebarInset>
          <header className="h-14 flex items-center border-b px-4 gap-3">
            <SidebarTrigger />
            <Bug className="h-5 w-5 text-primary" />
            <h1 className="font-semibold">בדיקת מנועי תמלול</h1>
          </header>

          <div className="p-6 space-y-6 max-w-5xl">
            <Card className="p-4">
              <h2 className="font-semibold mb-3">1. בחר הקלטה</h2>
              {loading ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : recordings.length === 0 ? (
                <p className="text-sm text-muted-foreground">אין הקלטות. צור הקלטה ולאחר מכן חזור לכאן.</p>
              ) : (
                <ScrollArea className="h-64 border rounded-md">
                  <div className="divide-y">
                    {recordings.map((r) => (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className={`w-full text-right p-3 hover:bg-accent transition-colors ${selectedId === r.id ? "bg-accent" : ""}`}
                      >
                        <div className="font-medium text-sm truncate">{r.filename}</div>
                        <div className="text-xs text-muted-foreground flex gap-3">
                          <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
                          {r.duration && <span>משך: {r.duration}</span>}
                          {!r.drive_url && !r.drive_file_id && <Badge variant="destructive">אין מקור</Badge>}
                        </div>
                      </button>
                    ))}
                  </div>
                </ScrollArea>
              )}
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">2. הרץ אבחון</h2>
                <Button onClick={runDiagnostic} disabled={!selectedId || running}>
                  {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
                  הרץ על {SERVICES.length} מנועים
                </Button>
              </div>

              {globalError && (
                <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm mb-3">
                  שגיאה כללית: {globalError}
                </div>
              )}

              {fileInfo && (
                <div className="text-xs text-muted-foreground mb-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div>קובץ: <span className="text-foreground">{fileInfo.name}</span></div>
                  <div>גודל: <span className="text-foreground">{fileInfo.sizeMB} MB</span></div>
                  <div>משך: <span className="text-foreground">{fileInfo.durationSec}s</span></div>
                  <div>חלקים: <span className="text-foreground">{fileInfo.chunks}</span></div>
                </div>
              )}

              <div className="space-y-3">
                {SERVICES.map((svc) => {
                  const r = results[svc];
                  const status = r?.status || "idle";
                  return (
                    <div key={svc} className="border rounded-lg p-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="flex items-center gap-2">
                          {status === "ok" && <CheckCircle2 className="h-5 w-5 text-green-600" />}
                          {status === "fail" && <XCircle className="h-5 w-5 text-destructive" />}
                          {status === "running" && <Loader2 className="h-5 w-5 animate-spin text-primary" />}
                          {status === "idle" && <div className="h-5 w-5 rounded-full border-2 border-muted" />}
                          <span className="font-medium">{serviceLabel(svc)}</span>
                          <span className="text-xs text-muted-foreground">({svc})</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs">
                          {r?.ms != null && <Badge variant="outline">{r.ms}ms</Badge>}
                          {r?.chars != null && <Badge variant="outline">{r.chars} תווים</Badge>}
                          {r?.httpStatus && <Badge variant="destructive">HTTP {r.httpStatus}</Badge>}
                        </div>
                      </div>

                      {r?.error && (
                        <div className="text-sm bg-destructive/10 text-destructive rounded p-2 whitespace-pre-wrap break-words">
                          {r.error}
                        </div>
                      )}
                      {r?.rawError && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-muted-foreground">תגובה מלאה מהשרת</summary>
                          <pre className="mt-1 p-2 bg-muted rounded overflow-x-auto">{JSON.stringify(r.rawError, null, 2)}</pre>
                        </details>
                      )}
                      {r?.preview && (
                        <details className="mt-2 text-xs">
                          <summary className="cursor-pointer text-muted-foreground">תצוגה מקדימה ({r.chars} תווים)</summary>
                          <p className="mt-1 p-2 bg-muted rounded whitespace-pre-wrap">{r.preview}{(r.chars || 0) > 240 ? "..." : ""}</p>
                        </details>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default TranscribeDebug;
