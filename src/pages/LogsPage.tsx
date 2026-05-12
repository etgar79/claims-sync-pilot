import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Loader2, RefreshCw, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { AppSidebar } from "@/components/AppSidebar";
import { SidebarProvider, SidebarTrigger, SidebarInset } from "@/components/ui/sidebar";

interface LogRow {
  id: string;
  created_at: string;
  level: "debug" | "info" | "warn" | "error";
  source: string;
  message: string;
  context: any;
  user_id: string | null;
}

const LEVEL_COLORS: Record<string, string> = {
  error: "bg-destructive text-destructive-foreground",
  warn: "bg-yellow-500/15 text-yellow-700 dark:text-yellow-400 border-yellow-500/30",
  info: "bg-primary/10 text-primary border-primary/20",
  debug: "bg-muted text-muted-foreground",
};

export default function LogsPage() {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [level, setLevel] = useState<string>("all");
  const [source, setSource] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [sortDesc, setSortDesc] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    let q = supabase.from("system_logs").select("*").order("created_at", { ascending: !sortDesc }).limit(500);
    if (level !== "all") q = q.eq("level", level);
    if (source !== "all") q = q.eq("source", source);
    const { data, error } = await q;
    if (error) {
      toast({ title: "שגיאה בטעינת לוגים", description: error.message, variant: "destructive" });
    } else {
      setRows((data || []) as LogRow[]);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [level, source, sortDesc]);

  const sources = useMemo(() => Array.from(new Set(rows.map(r => r.source))).sort(), [rows]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter(r =>
      r.message.toLowerCase().includes(s) ||
      r.source.toLowerCase().includes(s) ||
      JSON.stringify(r.context || {}).toLowerCase().includes(s)
    );
  }, [rows, search]);

  const counts = useMemo(() => {
    const c = { error: 0, warn: 0, info: 0, debug: 0 };
    for (const r of rows) c[r.level] = (c[r.level] || 0) + 1;
    return c;
  }, [rows]);

  const clearAll = async () => {
    if (!confirm("למחוק את כל הלוגים?")) return;
    const { error } = await supabase.from("system_logs").delete().not("id", "is", null);
    if (error) toast({ title: "שגיאה במחיקה", description: error.message, variant: "destructive" });
    else { toast({ title: "נמחקו" }); load(); }
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full" dir="rtl">
        <AppSidebar />
        <SidebarInset>
          <header className="h-14 border-b flex items-center px-4 gap-3">
            <SidebarTrigger />
            <h1 className="text-lg font-semibold">לוגים של המערכת</h1>
          </header>
          <main className="p-4 md:p-6 space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">שגיאות</div>
                <div className="text-2xl font-bold text-destructive flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5" />{counts.error}
                </div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">אזהרות</div>
                <div className="text-2xl font-bold text-yellow-600">{counts.warn}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">מידע</div>
                <div className="text-2xl font-bold text-primary">{counts.info}</div>
              </Card>
              <Card className="p-3">
                <div className="text-xs text-muted-foreground">סה״כ נטען</div>
                <div className="text-2xl font-bold">{rows.length}</div>
              </Card>
            </div>

            <Card className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Select value={level} onValueChange={setLevel}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="רמה" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הרמות</SelectItem>
                    <SelectItem value="error">שגיאות</SelectItem>
                    <SelectItem value="warn">אזהרות</SelectItem>
                    <SelectItem value="info">מידע</SelectItem>
                    <SelectItem value="debug">דיבאג</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger className="w-44"><SelectValue placeholder="מקור" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל המקורות</SelectItem>
                    {sources.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                  </SelectContent>
                </Select>
                <Input
                  placeholder="חיפוש בטקסט / קונטקסט..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-64"
                />
                <Button variant="outline" size="sm" onClick={() => setSortDesc(s => !s)}>
                  זמן: {sortDesc ? "חדש→ישן" : "ישן→חדש"}
                </Button>
                <Button variant="outline" size="sm" onClick={load} disabled={loading}>
                  <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> רענן
                </Button>
                <Button variant="destructive" size="sm" onClick={clearAll} className="ms-auto">
                  <Trash2 className="h-4 w-4" /> נקה הכל
                </Button>
              </div>
            </Card>

            <Card>
              {loading ? (
                <div className="p-8 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">אין לוגים להצגה</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>זמן</TableHead>
                      <TableHead>רמה</TableHead>
                      <TableHead>מקור</TableHead>
                      <TableHead>הודעה</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((r) => {
                      const isOpen = expanded === r.id;
                      return (
                        <>
                          <TableRow key={r.id} className="cursor-pointer" onClick={() => setExpanded(isOpen ? null : r.id)}>
                            <TableCell className="text-xs whitespace-nowrap text-muted-foreground">
                              {new Date(r.created_at).toLocaleString("he-IL")}
                            </TableCell>
                            <TableCell>
                              <Badge className={LEVEL_COLORS[r.level] || ""} variant="outline">{r.level}</Badge>
                            </TableCell>
                            <TableCell className="text-xs font-mono">{r.source}</TableCell>
                            <TableCell className="text-sm max-w-[600px] truncate">{r.message}</TableCell>
                          </TableRow>
                          {isOpen && (
                            <TableRow key={r.id + "-d"}>
                              <TableCell colSpan={4} className="bg-muted/30">
                                <div className="text-sm whitespace-pre-wrap break-words mb-2">{r.message}</div>
                                {r.context && (
                                  <pre className="text-xs bg-background p-2 rounded border overflow-auto max-h-80">
                                    {JSON.stringify(r.context, null, 2)}
                                  </pre>
                                )}
                                {r.user_id && (
                                  <div className="text-xs text-muted-foreground mt-2">user_id: {r.user_id}</div>
                                )}
                              </TableCell>
                            </TableRow>
                          )}
                        </>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </Card>
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
