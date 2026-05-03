import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Upload, Loader2, Sparkles, FileAudio, Save, CheckCircle2, Wand2, FolderOpen, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TranscribeDialog } from "@/components/TranscribeDialog";
import { MergeTranscriptsDialog } from "@/components/MergeTranscriptsDialog";
import { ActionItemsDialog } from "@/components/ActionItemsDialog";
import { EditMeetingDialog } from "@/components/EditMeetingDialog";
import { serviceLabel } from "@/lib/serviceLabels";
import { useTranscribeAll } from "@/hooks/useTranscribeAll";

interface Meeting {
  id: string;
  title: string;
  client_name: string | null;
  project_name: string | null;
  location: string | null;
  meeting_date: string | null;
  notes: string | null;
  status: string;
  ai_summary: string | null;
  ai_summary_generated_at: string | null;
  drive_folder_url: string | null;
}

interface Recording {
  id: string;
  filename: string;
  duration: string | null;
  transcript: string | null;
  transcript_status: string;
  transcription_service: string | null;
  drive_url: string | null;
  recorded_at: string;
}

const MeetingDetail = () => {
  const { id } = useParams<{ id: string }>();
  const [meeting, setMeeting] = useState<Meeting | null>(null);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const [statusUpdating, setStatusUpdating] = useState(false);
  const { runAll, running: runningAll } = useTranscribeAll();
  const [progressMsg, setProgressMsg] = useState<string>("");
  const load = async () => {
    if (!id) return;
    setLoading(true);
    const [m, r] = await Promise.all([
      supabase.from("meetings").select("*").eq("id", id).single(),
      supabase.from("meeting_recordings").select("*").eq("meeting_id", id).order("recorded_at", { ascending: false }),
    ]);
    if (m.data) {
      setMeeting(m.data);
      setNotes(m.data.notes || "");
    }
    // Preserve any local _file refs that we already have in memory
    setRecordings((prev) => {
      const fileMap = new Map<string, File>();
      prev.forEach((p: any) => { if (p._file) fileMap.set(p.id, p._file); });
      return (r.data || []).map((rec: any) => fileMap.has(rec.id) ? { ...rec, _file: fileMap.get(rec.id) } : rec);
    });
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [id]);

  const updateStatus = async (newStatus: string) => {
    if (!id) return;
    setStatusUpdating(true);
    const { error } = await supabase.from("meetings").update({ status: newStatus }).eq("id", id);
    setStatusUpdating(false);
    if (error) return toast.error(error.message);
    toast.success("הסטטוס עודכן");
    setMeeting((prev) => prev ? { ...prev, status: newStatus } : prev);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id) return;
    setUploading(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("יש להתחבר");
      setUploading(false);
      return;
    }
    // Save record (audio file kept in browser; user picks transcribe service from dialog after)
    const { data, error } = await supabase
      .from("meeting_recordings")
      .insert({
        meeting_id: id,
        user_id: auth.user.id,
        filename: file.name,
        transcript_status: "pending",
      })
      .select("*")
      .single();
    setUploading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("הקלטה נוספה - לחץ 'תמלל' כדי להתחיל");
    setRecordings((prev) => [...prev, { ...data, _file: file } as any]);
    e.target.value = "";
  };

  const saveNotes = async () => {
    if (!id) return;
    setSavingNotes(true);
    const { error } = await supabase.from("meetings").update({ notes }).eq("id", id);
    setSavingNotes(false);
    if (error) toast.error(error.message);
    else toast.success("ההערות נשמרו");
  };

  const generateSummary = async () => {
    if (!id) return;
    const transcripts = recordings
      .filter((r) => r.transcript)
      .map((r) => r.transcript)
      .join("\n\n---\n\n");
    if (!transcripts) {
      toast.error("צריך לתמלל לפחות הקלטה אחת לפני יצירת סיכום");
      return;
    }
    setSummarizing(true);
    try {
      const res = await supabase.functions.invoke("summarize-case", {
        body: {
          mode: "meeting",
          title: meeting?.title,
          client: meeting?.client_name,
          project: meeting?.project_name,
          transcripts,
          notes,
        },
      });
      if (res.error) throw res.error;
      const summary = res.data?.summary || "";
      const { error } = await supabase
        .from("meetings")
        .update({ ai_summary: summary, ai_summary_generated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      toast.success("הסיכום נוצר בהצלחה");
      load();
    } catch (e: any) {
      toast.error(e?.message || "שגיאה ביצירת סיכום");
    } finally {
      setSummarizing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!meeting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4">
        <p>הפגישה לא נמצאה</p>
        <Link to="/meetings"><Button>חזרה</Button></Link>
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <Link to="/meetings"><Button variant="ghost" size="sm"><ArrowRight className="h-4 w-4" /></Button></Link>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold">{meeting.title}</h1>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditOpen(true)} title="ערוך פגישה">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">
                  {meeting.client_name} {meeting.project_name && `• ${meeting.project_name}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {meeting.drive_folder_url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={meeting.drive_folder_url} target="_blank" rel="noopener noreferrer" title="תיקיית הפגישה ב-Drive">
                    <FolderOpen className="h-4 w-4 ml-2" />
                    Drive
                  </a>
                </Button>
              )}
              <Select value={meeting.status} onValueChange={updateStatus} disabled={statusUpdating}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="scheduled">מתוזמנת</SelectItem>
                  <SelectItem value="active">פעילה</SelectItem>
                  <SelectItem value="completed">הושלמה</SelectItem>
                  <SelectItem value="cancelled">בוטלה</SelectItem>
                </SelectContent>
              </Select>
              {meeting.status !== "completed" && (
                <Button variant="outline" onClick={() => updateStatus("completed")} disabled={statusUpdating}>
                  <CheckCircle2 className="h-4 w-4 ml-2" />
                  סמן כהושלמה
                </Button>
              )}
              <Button onClick={generateSummary} disabled={summarizing}>
                {summarizing ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Sparkles className="h-4 w-4 ml-2" />}
                צור סיכום AI
              </Button>
            </div>
          </header>

          <div className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: recordings + transcripts */}
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-3">
                  <h2 className="font-bold">הקלטות</h2>
                  <Label className="cursor-pointer">
                    <Button asChild variant="outline" size="sm">
                      <span>
                        {uploading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Upload className="h-4 w-4 ml-2" />}
                        העלה קובץ אודיו
                      </span>
                    </Button>
                    <input type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} disabled={uploading} />
                  </Label>
                </div>
                {recordings.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">אין הקלטות עדיין</p>
                ) : (
                  <div className="space-y-3">
                    {recordings.map((r: any) => (
                      <div key={r.id} className="border rounded p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <FileAudio className="h-4 w-4" />
                            <div className="flex flex-col">
                              <span className="text-sm font-medium">{r.filename}</span>
                              <span className="text-xs text-muted-foreground">
                                {new Date(r.recorded_at).toLocaleString("he-IL", {
                                  year: "numeric", month: "2-digit", day: "2-digit",
                                  hour: "2-digit", minute: "2-digit",
                                })}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {r.transcription_service && (
                              <Badge variant="secondary" className="text-xs">{serviceLabel(r.transcription_service)}</Badge>
                            )}
                            <Badge variant={r.transcript_status === "completed" ? "default" : "outline"}>
                              {r.transcript_status === "completed" ? "תומלל" : "ממתין"}
                            </Badge>
                          </div>
                        </div>
                        {r.transcript ? (
                          <>
                            <div className="rounded-md border border-border bg-muted/50 p-3">
                              <p className="text-sm leading-relaxed text-foreground whitespace-pre-wrap break-words">
                                {r.transcript}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2 mt-3">
                              <TranscribeDialog
                                recordingId={r.id}
                                audioFile={r._file}
                                audioUrl={r.drive_url || undefined}
                                table="meeting_recordings"
                                onCompleted={load}
                                trigger={<Button size="sm" variant="outline">הרץ תמלול נוסף</Button>}
                              />
                              <Button
                                size="sm"
                                variant="secondary"
                                disabled={runningAll === r.id}
                                onClick={async () => {
                                  setProgressMsg("");
                                  await runAll({
                                    recordingId: r.id,
                                    audioFile: r._file,
                                    audioUrl: r.drive_url || undefined,
                                    table: "meeting_recordings",
                                    context: {
                                      title: meeting?.title,
                                      client: meeting?.client_name ?? undefined,
                                      project: meeting?.project_name ?? undefined,
                                    },
                                    onProgress: setProgressMsg,
                                    onCompleted: load,
                                  });
                                  setProgressMsg("");
                                }}
                              >
                                {runningAll === r.id ? (
                                  <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> {progressMsg || "מריץ..."}</>
                                ) : (
                                  <><Wand2 className="h-4 w-4 ml-2" /> הרץ הכל + מיזוג</>
                                )}
                              </Button>
                              <MergeTranscriptsDialog
                                recordingId={r.id}
                                table="meeting_recordings"
                                onMerged={load}
                              />
                            </div>
                          </>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            <TranscribeDialog
                              recordingId={r.id}
                              audioFile={r._file}
                              audioUrl={r.drive_url || undefined}
                              table="meeting_recordings"
                              onCompleted={load}
                            />
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={runningAll === r.id}
                              onClick={async () => {
                                setProgressMsg("");
                                await runAll({
                                  recordingId: r.id,
                                  audioFile: r._file,
                                  audioUrl: r.drive_url || undefined,
                                  table: "meeting_recordings",
                                  context: {
                                    title: meeting?.title,
                                    client: meeting?.client_name ?? undefined,
                                    project: meeting?.project_name ?? undefined,
                                  },
                                  onProgress: setProgressMsg,
                                  onCompleted: load,
                                });
                                setProgressMsg("");
                              }}
                            >
                              {runningAll === r.id ? (
                                <><Loader2 className="h-4 w-4 ml-2 animate-spin" /> {progressMsg || "מריץ..."}</>
                              ) : (
                                <><Wand2 className="h-4 w-4 ml-2" /> הרץ הכל + מיזוג</>
                              )}
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            </div>

            {/* Right: notes + summary */}
            <div className="space-y-4">
              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold">הערות</h2>
                  <Button size="sm" variant="outline" onClick={saveNotes} disabled={savingNotes}>
                    {savingNotes ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Save className="h-4 w-4 ml-2" />}
                    שמור
                  </Button>
                </div>
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="הערות ונקודות מהפגישה..."
                  rows={6}
                  dir="rtl"
                />
              </Card>

              <Card className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-bold flex items-center gap-2">
                    <Sparkles className="h-4 w-4" /> סיכום AI
                  </h2>
                  {meeting.ai_summary_generated_at && (
                    <span className="text-xs text-muted-foreground">
                      {new Date(meeting.ai_summary_generated_at).toLocaleString("he-IL")}
                    </span>
                  )}
                </div>
                {meeting.ai_summary ? (
                  <>
                    <div className="text-sm whitespace-pre-wrap mb-3" dir="rtl">{meeting.ai_summary}</div>
                    <ActionItemsDialog
                      meetingTitle={meeting.title}
                      clientName={meeting.client_name ?? undefined}
                      summary={meeting.ai_summary}
                      transcript={recordings.map((r) => r.transcript).filter(Boolean).join("\n\n")}
                    />
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-6">
                    תמלל הקלטות ולחץ "צור סיכום AI"
                  </p>
                )}
              </Card>
            </div>
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default MeetingDetail;
