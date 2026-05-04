import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Loader2, Search, Cloud, ExternalLink, Link2, CheckCircle2, Headphones, AlertCircle } from "lucide-react";
import { toast } from "sonner";

interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
}

interface RootRow {
  admin_user_id: string;
  folder_id: string;
  folder_name: string;
}

export function TranscriberRootFolderPicker() {
  const [current, setCurrent] = useState<RootRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasDrive, setHasDrive] = useState<boolean>(false);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [listing, setListing] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: row }, { data: auth }] = await Promise.all([
      supabase.from("transcriber_root_folder").select("admin_user_id, folder_id, folder_name").eq("id", true).maybeSingle(),
      supabase.auth.getUser(),
    ]);
    setCurrent((row as any) ?? null);
    if (auth.user) {
      const { data: conn } = await supabase
        .from("google_drive_connections")
        .select("user_id").eq("user_id", auth.user.id).maybeSingle();
      setHasDrive(!!conn);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const fetchFolders = async (q: string) => {
    setListing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return toast.error("יש להתחבר תחילה");
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-list-folders`);
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const body = await res.json();
      if (!res.ok) return toast.error("שגיאה בטעינת תיקיות", { description: body.error });
      setFolders(body.folders ?? []);
    } finally {
      setListing(false);
    }
  };

  useEffect(() => { if (open) void fetchFolders(""); }, [open]);

  const save = async (folderId: string, folderName: string) => {
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Not authenticated");
      // Upsert single row
      await supabase.from("transcriber_root_folder").delete().eq("id", true);
      const { error } = await supabase.from("transcriber_root_folder").insert({
        id: true,
        admin_user_id: auth.user.id,
        folder_id: folderId,
        folder_name: folderName,
      } as any);
      if (error) throw error;
      toast.success(`תיקיית התמלולים נקבעה: ${folderName}`);
      setOpen(false);
      setPasteValue("");
      await load();
    } catch (e: any) {
      toast.error("שגיאה", { description: e?.message });
    } finally {
      setSaving(false);
    }
  };

  const handleResolvePaste = async () => {
    if (!pasteValue.trim()) return;
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-resolve-folder", {
        body: { input: pasteValue },
      });
      if (error) throw error;
      const result = data as { id: string; name: string; error?: string };
      if (result.error) throw new Error(result.error);
      await save(result.id, result.name);
    } catch (e: any) {
      toast.error("לא ניתן לאמת את התיקייה", { description: e?.message });
    } finally {
      setResolving(false);
    }
  };

  const clear = async () => {
    await supabase.from("transcriber_root_folder").delete().eq("id", true);
    toast.success("התיקייה הוסרה");
    await load();
  };

  const folderUrl = current ? `https://drive.google.com/drive/folders/${current.folder_id}` : null;

  return (
    <Card className="p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Headphones className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="font-semibold">תיקיית תמלולים מרכזית</h3>
          <p className="text-sm text-muted-foreground mt-0.5">
            תיקייה ב-Drive שלך ששם יישמרו <strong>כל</strong> ההקלטות, החיתוכים והתמלולים של משתמשי "תמלול".
            לכל משתמש תיווצר תת-תיקייה אוטומטית.
          </p>
        </div>
      </div>

      {!hasDrive && (
        <div className="flex items-start gap-2 p-3 rounded-md bg-warning/10 border border-warning/30 text-sm">
          <AlertCircle className="h-4 w-4 text-warning shrink-0 mt-0.5" />
          <span>צריך לחבר חשבון Google Drive בהגדרות לפני שתוכל לבחור תיקייה.</span>
        </div>
      )}

      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" />
      ) : current ? (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium truncate">{current.folder_name}</div>
              <div className="text-xs text-muted-foreground truncate" dir="ltr">{current.folder_id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {folderUrl && (
              <Button variant="ghost" size="icon" asChild title="פתח ב-Drive">
                <a href={folderUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setOpen(true)} disabled={!hasDrive}>שנה</Button>
            <Button variant="ghost" size="sm" onClick={clear}>נקה</Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)} className="gap-2" disabled={!hasDrive}>
          <FolderOpen className="h-4 w-4" />
          בחר תיקייה מ-Drive
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              תיקיית תמלולים מרכזית
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-2 border-b border-border pb-4">
            <Label htmlFor="paste" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" /> הדבק קישור או מזהה
            </Label>
            <div className="flex gap-2">
              <Input id="paste" placeholder="https://drive.google.com/drive/folders/..."
                value={pasteValue} onChange={(e) => setPasteValue(e.target.value)} dir="ltr" />
              <Button onClick={handleResolvePaste} disabled={!pasteValue.trim() || resolving || saving}>
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : "אמת ושמור"}
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <Label>או בחר מהרשימה</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input placeholder="חיפוש..." value={search} onChange={(e) => setSearch(e.target.value)}
                  className="pr-9" onKeyDown={(e) => e.key === "Enter" && fetchFolders(search)} />
              </div>
              <Button variant="outline" onClick={() => fetchFolders(search)} disabled={listing}>
                {listing ? <Loader2 className="h-4 w-4 animate-spin" /> : "חפש"}
              </Button>
            </div>
            <ScrollArea className="h-[300px] border border-border rounded-lg">
              {listing ? (
                <div className="p-8 text-center text-muted-foreground"><Loader2 className="h-6 w-6 animate-spin mx-auto" /></div>
              ) : folders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">לא נמצאו תיקיות</div>
              ) : (
                <div className="divide-y divide-border">
                  {folders.map((f) => (
                    <button key={f.id} onClick={() => save(f.id, f.name)} disabled={saving}
                      className="w-full text-right p-3 hover:bg-muted/40 flex items-center gap-3 disabled:opacity-50">
                      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{f.name}</div>
                        {f.modifiedTime && <div className="text-xs text-muted-foreground">עודכן: {new Date(f.modifiedTime).toLocaleDateString("he-IL")}</div>}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setOpen(false)}>סגור</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
