import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FolderOpen, Loader2, Search, Cloud, ExternalLink, Link2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useWorkspaceFolder, type WorkspaceKind, type FolderPurpose } from "@/hooks/useWorkspaceFolder";

interface DriveFolder {
  id: string;
  name: string;
  modifiedTime?: string;
  owners?: { emailAddress: string; displayName: string }[];
}

interface WorkFolderPickerProps {
  workspace: WorkspaceKind;
  purpose?: FolderPurpose;
  label?: string;
}

export function WorkFolderPicker({ workspace, purpose = "recordings", label }: WorkFolderPickerProps) {
  const { folder, folderUrl, reload, folderType } = useWorkspaceFolder(workspace, purpose);

  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [folders, setFolders] = useState<DriveFolder[]>([]);
  const [listing, setListing] = useState(false);
  const [pasteValue, setPasteValue] = useState("");
  const [resolving, setResolving] = useState(false);
  const [saving, setSaving] = useState(false);

  const loadFolders = async (q?: string) => {
    setListing(true);
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-list-folders", {
        method: "GET",
        headers: q ? {} : {},
        body: undefined,
      } as never);
      // The invoke method always uses POST when body is provided. Use direct fetch for query params:
      // Re-do with raw fetch instead.
      void data; void error;
    } catch (_) {
      // ignore - falling through to fetch below
    } finally {
      setListing(false);
    }
  };

  // Use a direct fetch so we can pass ?q=
  const fetchFolders = async (q: string) => {
    setListing(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error("יש להתחבר תחילה");
        return;
      }
      const url = new URL(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-list-folders`,
      );
      if (q.trim()) url.searchParams.set("q", q.trim());
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error("שגיאה בטעינת תיקיות", { description: body.error });
        return;
      }
      setFolders(body.folders ?? []);
    } catch (e) {
      toast.error("שגיאה בטעינת תיקיות", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setListing(false);
    }
  };

  useEffect(() => {
    if (open) {
      void fetchFolders("");
      void loadFolders;
    }
  }, [open]);

  const saveFolder = async (id: string, name: string) => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not authenticated");

      // Replace any existing work folder for the user for this workspace type
      const { error: delErr } = await supabase
        .from("drive_work_folders")
        .delete()
        .eq("user_id", user.id)
        .eq("folder_type", folderType);
      if (delErr) throw delErr;

      const { error: insErr } = await supabase.from("drive_work_folders").insert({
        user_id: user.id,
        folder_id: id,
        folder_name: name,
        folder_type: folderType,
      });
      if (insErr) throw insErr;

      toast.success(`התיקייה "${name}" נבחרה`);
      await reload();
      setOpen(false);
      setPasteValue("");
    } catch (e) {
      toast.error("שגיאה בשמירת התיקייה", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleResolvePaste = async () => {
    if (!pasteValue.trim()) return;
    setResolving(true);
    try {
      const { data, error } = await supabase.functions.invoke(
        "google-drive-resolve-folder",
        { body: { input: pasteValue } },
      );
      if (error) throw error;
      const result = data as { id: string; name: string; error?: string };
      if (result.error) throw new Error(result.error);
      await saveFolder(result.id, result.name);
    } catch (e) {
      toast.error("לא ניתן לאמת את התיקייה", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setResolving(false);
    }
  };

  const clearFolder = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase
      .from("drive_work_folders")
      .delete()
      .eq("user_id", user.id)
      .eq("folder_type", folderType);
    await reload();
    toast.success("התיקייה הוסרה");
  };

  return (
    <div className="space-y-3">
      <Label>{label ?? "תיקיית עבודה ב-Drive"}</Label>

      {folder ? (
        <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border gap-2">
          <div className="min-w-0 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
            <div className="min-w-0">
              <div className="font-medium text-foreground truncate">{folder.folder_name}</div>
              <div className="text-xs text-muted-foreground truncate" dir="ltr">{folder.folder_id}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {folderUrl && (
              <Button variant="ghost" size="icon" asChild title="פתח ב-Drive">
                <a href={folderUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
              שנה
            </Button>
            <Button variant="ghost" size="sm" onClick={clearFolder}>
              נקה
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="outline" onClick={() => setOpen(true)} className="gap-2">
          <FolderOpen className="h-4 w-4" />
          בחר תיקייה מ-Drive
        </Button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-primary" />
              בחירת תיקיית עבודה ב-Google Drive
            </DialogTitle>
          </DialogHeader>

          {/* Paste link/ID */}
          <div className="space-y-2 border-b border-border pb-4">
            <Label htmlFor="paste" className="flex items-center gap-2">
              <Link2 className="h-4 w-4" />
              הדבק קישור או מזהה תיקייה
            </Label>
            <div className="flex gap-2">
              <Input
                id="paste"
                placeholder="https://drive.google.com/drive/folders/... או מזהה"
                value={pasteValue}
                onChange={(e) => setPasteValue(e.target.value)}
                dir="ltr"
              />
              <Button onClick={handleResolvePaste} disabled={!pasteValue.trim() || resolving || saving}>
                {resolving ? <Loader2 className="h-4 w-4 animate-spin" /> : "אמת ושמור"}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              שימושי כשהתיקייה לא ברשימה למטה (למשל תיקייה משותפת).
            </p>
          </div>

          {/* Search & list */}
          <div className="space-y-2">
            <Label>או בחר מהרשימה</Label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="חיפוש לפי שם תיקייה..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                  onKeyDown={(e) => e.key === "Enter" && fetchFolders(search)}
                />
              </div>
              <Button variant="outline" onClick={() => fetchFolders(search)} disabled={listing}>
                {listing ? <Loader2 className="h-4 w-4 animate-spin" /> : "חפש"}
              </Button>
            </div>

            <ScrollArea className="h-[300px] border border-border rounded-lg">
              {listing ? (
                <div className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto mb-2" />
                  טוען תיקיות...
                </div>
              ) : folders.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground text-sm">
                  לא נמצאו תיקיות
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {folders.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => saveFolder(f.id, f.name)}
                      disabled={saving}
                      className="w-full text-right p-3 hover:bg-muted/40 transition-colors flex items-center gap-3 disabled:opacity-50"
                    >
                      <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{f.name}</div>
                        {f.modifiedTime && (
                          <div className="text-xs text-muted-foreground">
                            עודכן: {new Date(f.modifiedTime).toLocaleDateString("he-IL")}
                          </div>
                        )}
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
    </div>
  );
}
