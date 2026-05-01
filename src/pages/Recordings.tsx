import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Mic, Loader2, Search, FileText, Clock, AlertCircle, CheckCircle2, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface RecordingRow {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript: string | null;
  drive_url: string | null;
  case_id: string;
  case_title?: string;
  case_number?: string;
  client_name?: string;
}

const STATUS: Record<string, { label: string; icon: any; cls: string }> = {
  pending: { label: "ממתין", icon: Clock, cls: "bg-muted text-muted-foreground" },
  processing: { label: "מתמלל", icon: Loader2, cls: "bg-primary/10 text-primary" },
  completed: { label: "הושלם", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700" },
  failed: { label: "נכשל", icon: AlertCircle, cls: "bg-destructive/10 text-destructive" },
};

const Recordings = () => {
  const [items, setItems] = useState<RecordingRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("recordings")
      .select("id, filename, duration, recorded_at, transcript_status, transcript, drive_url, case_id")
      .order("recorded_at", { ascending: false });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    const recs = (data ?? []) as RecordingRow[];
    // Hydrate case info
    const caseIds = Array.from(new Set(recs.map((r) => r.case_id)));
    if (caseIds.length > 0) {
      const { data: cases } = await supabase
        .from("cases")
        .select("id, title, case_number, client_name")
        .in("id", caseIds);
      const m = new Map<string, any>((cases ?? []).map((c: any) => [c.id, c]));
      recs.forEach((r) => {
        const c = m.get(r.case_id);
        if (c) {
          r.case_title = c.title;
          r.case_number = c.case_number;
          r.client_name = c.client_name;
        }
      });
    }
    setItems(recs);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = items.filter((r) => {
    const q = search.trim().toLowerCase();
    if (!q) return true;
    return (
      r.filename.toLowerCase().includes(q) ||
      (r.case_title ?? "").toLowerCase().includes(q) ||
      (r.case_number ?? "").toLowerCase().includes(q) ||
      (r.client_name ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1 flex items-center gap-2">
              <Mic className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">הקלטות שטח</h1>
              <Badge variant="secondary">{items.length}</Badge>
            </div>
            <div className="relative w-72 max-w-full">
              <Search className="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי קובץ, תיק, לקוח..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-8"
              />
            </div>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  טוען הקלטות...
                </div>
              ) : filtered.length === 0 ? (
                <Card className="p-8 text-center text-muted-foreground">
                  <Mic className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  אין הקלטות עדיין. הוסף הקלטה מתוך תיק שומה.
                </Card>
              ) : (
                <div className="space-y-2">
                  {filtered.map((r) => {
                    const st = STATUS[r.transcript_status] ?? STATUS.pending;
                    const Icon = st.icon;
                    return (
                      <Card key={r.id} className="p-4 flex items-center gap-4 hover:border-primary/50 transition-colors">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                          <Mic className="h-5 w-5 text-primary" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium truncate">{r.filename}</span>
                            <Badge className={`gap-1 ${st.cls}`} variant="secondary">
                              <Icon className={`h-3 w-3 ${r.transcript_status === "processing" ? "animate-spin" : ""}`} />
                              {st.label}
                            </Badge>
                            {r.transcript && (
                              <Badge variant="outline" className="gap-1">
                                <FileText className="h-3 w-3" />
                                תמלול
                              </Badge>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-1 flex items-center gap-3 flex-wrap">
                            {r.case_number && (
                              <Link to={`/cases?id=${r.case_id}`} className="hover:text-primary">
                                תיק {r.case_number} • {r.case_title}
                              </Link>
                            )}
                            {r.client_name && <span>לקוח: {r.client_name}</span>}
                            <span>{new Date(r.recorded_at).toLocaleString("he-IL")}</span>
                            {r.duration && <span>{r.duration}</span>}
                          </div>
                        </div>
                        {r.drive_url && (
                          <a
                            href={r.drive_url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-xs text-primary inline-flex items-center gap-1 shrink-0"
                          >
                            Drive <ExternalLink className="h-3 w-3" />
                          </a>
                        )}
                      </Card>
                    );
                  })}
                </div>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

export default Recordings;
