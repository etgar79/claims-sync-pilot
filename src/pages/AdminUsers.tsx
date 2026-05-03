import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Loader2, Users, Search, FolderOpen, Calendar, Mic, FileText, Eye, ExternalLink, Shield, Briefcase, Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { TranscriptViewerDialog } from "@/components/TranscriptViewerDialog";

interface UserRow {
  user_id: string;
  display_name: string | null;
  roles: AppRole[];
  cases: number;
  meetings: number;
  recordings: number;
  meetingRecordings: number;
  transcripts: number;
}

interface CaseRow { id: string; title: string; case_number: string; client_name: string; status: string; created_at: string; }
interface MeetingRow { id: string; title: string; client_name: string | null; meeting_date: string | null; status: string; created_at: string; }
interface RecRow {
  id: string; filename: string; recorded_at: string; transcript: string | null;
  transcript_status: string; drive_url: string | null; transcription_service: string | null;
  case_id?: string | null; meeting_id?: string | null;
}

const ROLE_META: Record<AppRole, { label: string; icon: any; cls: string }> = {
  appraiser: { label: "שמאי", icon: Briefcase, cls: "bg-blue-500/10 text-blue-700 border-blue-500/30" },
  architect: { label: "אדריכל", icon: Building2, cls: "bg-purple-500/10 text-purple-700 border-purple-500/30" },
  admin: { label: "מנהל", icon: Shield, cls: "bg-amber-500/10 text-amber-700 border-amber-500/30" },
};

const AdminUsers = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [cases, setCases] = useState<CaseRow[]>([]);
  const [meetings, setMeetings] = useState<MeetingRow[]>([]);
  const [recordings, setRecordings] = useState<RecRow[]>([]);
  const [meetingRecs, setMeetingRecs] = useState<RecRow[]>([]);
  const [contentLoading, setContentLoading] = useState(false);
  const [viewTarget, setViewTarget] = useState<{ rec: RecRow; table: "recordings" | "meeting_recordings" } | null>(null);

  const loadUsers = async () => {
    setLoading(true);
    const [profilesRes, rolesRes, casesRes, meetingsRes, recsRes, mrecsRes] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("user_roles").select("user_id, role"),
      supabase.from("cases").select("user_id"),
      supabase.from("meetings").select("user_id"),
      supabase.from("recordings").select("user_id, transcript"),
      supabase.from("meeting_recordings").select("user_id, transcript"),
    ]);

    const map = new Map<string, UserRow>();
    (profilesRes.data ?? []).forEach((p: any) => {
      map.set(p.user_id, {
        user_id: p.user_id, display_name: p.display_name, roles: [],
        cases: 0, meetings: 0, recordings: 0, meetingRecordings: 0, transcripts: 0,
      });
    });
    (rolesRes.data ?? []).forEach((r: any) => {
      const u = map.get(r.user_id);
      if (u) u.roles.push(r.role);
    });
    (casesRes.data ?? []).forEach((x: any) => { const u = map.get(x.user_id); if (u) u.cases++; });
    (meetingsRes.data ?? []).forEach((x: any) => { const u = map.get(x.user_id); if (u) u.meetings++; });
    (recsRes.data ?? []).forEach((x: any) => {
      const u = map.get(x.user_id); if (!u) return;
      u.recordings++; if (x.transcript) u.transcripts++;
    });
    (mrecsRes.data ?? []).forEach((x: any) => {
      const u = map.get(x.user_id); if (!u) return;
      u.meetingRecordings++; if (x.transcript) u.transcripts++;
    });

    const arr = Array.from(map.values()).sort((a, b) =>
      (b.cases + b.meetings + b.recordings + b.meetingRecordings) -
      (a.cases + a.meetings + a.recordings + a.meetingRecordings)
    );
    setUsers(arr);
    setLoading(false);
    if (!selectedId && arr.length > 0) setSelectedId(arr[0].user_id);
  };

  const loadContent = async (uid: string) => {
    setContentLoading(true);
    const [c, m, r, mr] = await Promise.all([
      supabase.from("cases").select("id, title, case_number, client_name, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("meetings").select("id, title, client_name, meeting_date, status, created_at").eq("user_id", uid).order("created_at", { ascending: false }),
      supabase.from("recordings").select("id, filename, recorded_at, transcript, transcript_status, drive_url, transcription_service, case_id").eq("user_id", uid).order("recorded_at", { ascending: false }),
      supabase.from("meeting_recordings").select("id, filename, recorded_at, transcript, transcript_status, drive_url, transcription_service, meeting_id").eq("user_id", uid).order("recorded_at", { ascending: false }),
    ]);
    if (c.error || m.error || r.error || mr.error) {
      toast.error("שגיאה בטעינת תוכן המשתמש");
    }
    setCases((c.data as any) ?? []);
    setMeetings((m.data as any) ?? []);
    setRecordings((r.data as any) ?? []);
    setMeetingRecs((mr.data as any) ?? []);
    setContentLoading(false);
  };

  useEffect(() => { if (isAdmin) loadUsers(); /* eslint-disable-next-line */ }, [isAdmin]);
  useEffect(() => { if (selectedId) loadContent(selectedId); }, [selectedId]);

  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      (u.display_name ?? "").toLowerCase().includes(q) ||
      u.user_id.toLowerCase().includes(q)
    );
  }, [users, search]);

  const selected = users.find((u) => u.user_id === selectedId) ?? null;

  if (rolesLoading) return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-gradient-to-b from-background via-background to-primary/[0.02]">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="h-14 border-b border-border bg-card/80 backdrop-blur flex items-center px-4 gap-3 sticky top-0 z-20">
            <SidebarTrigger />
            <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-primary to-primary-glow flex items-center justify-center">
              <Users className="h-4 w-4 text-primary-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-base font-semibold leading-tight">תוכן לפי משתמש</h1>
              <p className="text-[11px] text-muted-foreground leading-tight">תצוגת אדמין — בחר משתמש לראות את התיקים, הפגישות, ההקלטות והתמלולים שלו</p>
            </div>
            <Button asChild variant="outline" size="sm">
              <Link to="/admin"><Shield className="h-4 w-4 ml-1" /> ניהול משתמשים</Link>
            </Button>
          </header>

          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-0 min-h-0">
            {/* Users list */}
            <aside className="border-l border-border bg-card/40 flex flex-col min-h-0">
              <div className="p-3 border-b border-border">
                <div className="relative">
                  <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="חיפוש משתמש..." className="pr-8 h-9" />
                </div>
              </div>
              <ScrollArea className="flex-1">
                <div className="p-2 space-y-1">
                  {loading ? (
                    <div className="text-center py-8"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>
                  ) : filteredUsers.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-6">אין משתמשים</p>
                  ) : (
                    filteredUsers.map((u) => {
                      const total = u.cases + u.meetings + u.recordings + u.meetingRecordings;
                      const active = u.user_id === selectedId;
                      return (
                        <button
                          key={u.user_id}
                          onClick={() => setSelectedId(u.user_id)}
                          className={`w-full text-right p-2.5 rounded-lg transition-colors border ${active ? "bg-primary/10 border-primary/40" : "border-transparent hover:bg-muted/50"}`}
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <div className={`h-7 w-7 rounded-full bg-gradient-to-br from-primary to-primary-glow text-primary-foreground text-xs font-bold flex items-center justify-center shrink-0`}>
                              {(u.display_name ?? "U").trim().charAt(0).toUpperCase()}
                            </div>
                            <span className="font-medium text-sm truncate flex-1">{u.display_name || "ללא שם"}</span>
                            {total > 0 && <Badge variant="secondary" className="text-[10px] h-4 px-1.5">{total}</Badge>}
                          </div>
                          <div className="flex gap-1 flex-wrap">
                            {u.roles.length === 0 ? (
                              <span className="text-[10px] text-muted-foreground">אין תפקיד</span>
                            ) : u.roles.map((r) => {
                              const m = ROLE_META[r];
                              return (
                                <Badge key={r} variant="outline" className={`text-[10px] h-4 px-1.5 gap-0.5 ${m.cls}`}>
                                  <m.icon className="h-2.5 w-2.5" />{m.label}
                                </Badge>
                              );
                            })}
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </ScrollArea>
            </aside>

            {/* Content */}
            <section className="flex-1 min-w-0 overflow-auto">
              {!selected ? (
                <div className="h-full flex items-center justify-center text-muted-foreground">בחר משתמש מהרשימה</div>
              ) : (
                <div className="p-4 lg:p-6 space-y-4 max-w-5xl mx-auto">
                  <Card className="p-4 bg-gradient-to-l from-primary/5 via-card to-card">
                    <div className="flex items-start justify-between gap-3 flex-wrap">
                      <div>
                        <h2 className="text-xl font-bold">{selected.display_name || "ללא שם"}</h2>
                        <p className="text-xs text-muted-foreground font-mono mt-0.5">{selected.user_id}</p>
                        <div className="flex gap-1.5 mt-2 flex-wrap">
                          {selected.roles.map((r) => {
                            const m = ROLE_META[r];
                            return (
                              <Badge key={r} variant="outline" className={`gap-1 ${m.cls}`}>
                                <m.icon className="h-3 w-3" />{m.label}
                              </Badge>
                            );
                          })}
                        </div>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center">
                        <Stat label="תיקים" value={selected.cases} />
                        <Stat label="פגישות" value={selected.meetings} />
                        <Stat label="הקלטות" value={selected.recordings + selected.meetingRecordings} />
                        <Stat label="תמלולים" value={selected.transcripts} />
                      </div>
                    </div>
                  </Card>

                  {contentLoading ? (
                    <div className="text-center py-12"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
                  ) : (
                    <Tabs defaultValue="cases" className="w-full">
                      <TabsList className="grid grid-cols-4 w-full">
                        <TabsTrigger value="cases" className="gap-1.5"><FolderOpen className="h-3.5 w-3.5" />תיקים ({cases.length})</TabsTrigger>
                        <TabsTrigger value="meetings" className="gap-1.5"><Calendar className="h-3.5 w-3.5" />פגישות ({meetings.length})</TabsTrigger>
                        <TabsTrigger value="recordings" className="gap-1.5"><Mic className="h-3.5 w-3.5" />הקלטות ({recordings.length + meetingRecs.length})</TabsTrigger>
                        <TabsTrigger value="transcripts" className="gap-1.5"><FileText className="h-3.5 w-3.5" />תמלולים</TabsTrigger>
                      </TabsList>

                      <TabsContent value="cases" className="space-y-2 mt-4">
                        {cases.length === 0 ? <EmptyHint text="אין תיקים" /> : cases.map((c) => (
                          <Card key={c.id} className="p-3 flex items-center gap-3">
                            <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{c.title}</div>
                              <div className="text-xs text-muted-foreground">תיק {c.case_number} • {c.client_name}</div>
                            </div>
                            <Badge variant="outline" className="text-xs">{c.status}</Badge>
                          </Card>
                        ))}
                      </TabsContent>

                      <TabsContent value="meetings" className="space-y-2 mt-4">
                        {meetings.length === 0 ? <EmptyHint text="אין פגישות" /> : meetings.map((m) => (
                          <Card key={m.id} className="p-3 flex items-center gap-3">
                            <Calendar className="h-4 w-4 text-primary shrink-0" />
                            <div className="flex-1 min-w-0">
                              <div className="font-medium text-sm truncate">{m.title}</div>
                              <div className="text-xs text-muted-foreground">
                                {m.client_name ?? "—"}
                                {m.meeting_date && ` • ${new Date(m.meeting_date).toLocaleDateString("he-IL")}`}
                              </div>
                            </div>
                            <Button asChild size="sm" variant="ghost"><Link to={`/meetings/${m.id}`}><ExternalLink className="h-3.5 w-3.5" /></Link></Button>
                          </Card>
                        ))}
                      </TabsContent>

                      <TabsContent value="recordings" className="space-y-2 mt-4">
                        {recordings.length + meetingRecs.length === 0 ? <EmptyHint text="אין הקלטות" /> : (
                          <>
                            {recordings.map((r) => <RecCard key={r.id} rec={r} table="recordings" onView={() => setViewTarget({ rec: r, table: "recordings" })} kind="שטח" />)}
                            {meetingRecs.map((r) => <RecCard key={r.id} rec={r} table="meeting_recordings" onView={() => setViewTarget({ rec: r, table: "meeting_recordings" })} kind="פגישה" />)}
                          </>
                        )}
                      </TabsContent>

                      <TabsContent value="transcripts" className="space-y-2 mt-4">
                        {[...recordings, ...meetingRecs].filter((r) => r.transcript).length === 0 ? (
                          <EmptyHint text="אין תמלולים" />
                        ) : (
                          <>
                            {recordings.filter((r) => r.transcript).map((r) =>
                              <RecCard key={r.id} rec={r} table="recordings" onView={() => setViewTarget({ rec: r, table: "recordings" })} kind="שטח" showTranscript />
                            )}
                            {meetingRecs.filter((r) => r.transcript).map((r) =>
                              <RecCard key={r.id} rec={r} table="meeting_recordings" onView={() => setViewTarget({ rec: r, table: "meeting_recordings" })} kind="פגישה" showTranscript />
                            )}
                          </>
                        )}
                      </TabsContent>
                    </Tabs>
                  )}
                </div>
              )}
            </section>
          </div>
        </main>
      </div>

      {viewTarget && (
        <TranscriptViewerDialog
          open={!!viewTarget}
          onOpenChange={(o) => !o && setViewTarget(null)}
          recordingId={viewTarget.rec.id}
          table={viewTarget.table}
          filename={viewTarget.rec.filename}
          recordedAt={viewTarget.rec.recorded_at}
          audioUrl={viewTarget.rec.drive_url}
          transcript={viewTarget.rec.transcript}
          transcriptionService={viewTarget.rec.transcription_service}
          defaultTab="view"
          onUpdated={() => selectedId && loadContent(selectedId)}
        />
      )}
    </SidebarProvider>
  );
};

const Stat = ({ label, value }: { label: string; value: number }) => (
  <div className="px-3 py-1.5 rounded-lg bg-card border border-border min-w-[64px]">
    <div className="text-lg font-bold leading-none">{value}</div>
    <div className="text-[10px] text-muted-foreground mt-0.5">{label}</div>
  </div>
);

const EmptyHint = ({ text }: { text: string }) => (
  <Card className="p-8 text-center border-dashed text-sm text-muted-foreground">{text}</Card>
);

const RecCard = ({ rec, onView, kind, showTranscript }: {
  rec: RecRow; table: "recordings" | "meeting_recordings"; onView: () => void; kind: string; showTranscript?: boolean;
}) => {
  const hasT = !!rec.transcript;
  return (
    <Card className="p-3">
      <div className="flex items-center gap-3">
        <Mic className={`h-4 w-4 shrink-0 ${hasT ? "text-primary" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{rec.filename}</span>
            <Badge variant="outline" className="text-[10px] h-4 px-1.5">{kind}</Badge>
            {hasT && <Badge variant="outline" className="text-[10px] h-4 px-1.5 bg-green-500/10 text-green-700 border-green-500/30">תמלול מוכן</Badge>}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(rec.recorded_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}
          </div>
          {showTranscript && rec.transcript && (
            <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2 leading-relaxed">
              {rec.transcript.slice(0, 220)}{rec.transcript.length > 220 ? "…" : ""}
            </p>
          )}
        </div>
        <Button size="sm" variant="ghost" onClick={onView} className="gap-1.5 text-xs"><Eye className="h-3.5 w-3.5" /> פתח</Button>
        {rec.drive_url && (
          <Button size="icon" variant="ghost" asChild className="h-8 w-8">
            <a href={rec.drive_url} target="_blank" rel="noreferrer"><ExternalLink className="h-3.5 w-3.5" /></a>
          </Button>
        )}
      </div>
    </Card>
  );
};

export default AdminUsers;
