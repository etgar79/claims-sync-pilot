import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, FolderOpen, FileAudio, Search, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkFolder } from "@/hooks/useWorkFolder";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImported?: () => void;
}

const AUDIO_VIDEO_REGEX = /^(audio|video)\//;

export function ImportFromDriveDialog({ open, onOpenChange, onImported }: Props) {
  const { folder, folderUrl } = useWorkFolder();
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [meetingTitle, setMeetingTitle] = useState("");
  const navigate = useNavigate();

  const loadFiles = async () => {
    if (!folder) return;
    setLoading(true);
    setSelected(new Set());
    try {
      const { data, error } = await supabase.functions.invoke("google-drive-api", {
        body: { action: "list_files_in_folder", folderId: folder.folder_id },
      });
      if (error) throw error;
      const all: DriveFile[] = data?.files ?? [];
      const media = all.filter((f) => AUDIO_VIDEO_REGEX.test(f.mimeType));
      setFiles(media);
    } catch (e: any) {
      toast.error(e?.message ?? "שגיאה בטעינת קבצים מ-Drive");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open && folder) loadFiles();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, folder?.folder_id]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const filtered = files.filter((f) =>
    !search.trim() || f.name.toLowerCase().includes(search.toLowerCase()),
  );

  const handleImport = async () => {
    if (selected.size === 0) {
      toast.error("בחר לפחות קובץ אחד");
      return;
    }
    setImporting(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("לא מחובר");

      // Create a meeting
      const title = meetingTitle.trim() || `ייבוא מ-Drive • ${new Date().toLocaleDateString("he-IL")}`;
      const { data: meeting, error: mErr } = await supabase
        .from("meetings")
        .insert({
          user_id: auth.user.id,
          title,
          status: "active",
          notes: `יובא מתיקיית Drive: ${folder?.folder_name ?? ""}`,
        })
        .select("id")
        .single();
      if (mErr) throw mErr;

      // Insert recordings linked to the meeting
      const selectedFiles = files.filter((f) => selected.has(f.id));
      const rows = selectedFiles.map((f) => ({
        user_id: auth.user!.id,
        meeting_id: meeting.id,
        filename: f.name,
        drive_url: `https://drive.google.com/file/d/${f.id}/view`,
        recorded_at: f.modifiedTime ?? new Date().toISOString(),
        transcript_status: "pending",
      }));
      const { error: rErr } = await supabase.from("meeting_recordings").insert(rows);
      if (rErr) throw rErr;

      toast.success(`יובאו ${rows.length} הקלטות לפגישה חדשה`);
      onOpenChange(false);
      onImported?.();
      navigate(`/meetings/${meeting.id}`);
    } catch (e: any) {
      toast.error(e?.message ?? "שגיאה בייבוא");
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderOpen className="h-5 w-5" />
            ייבוא הקלטות מ-Google Drive
          </DialogTitle>
        </DialogHeader>

        {!folder ? (
          <div className="py-8 text-center space-y-3">
            <p className="text-muted-foreground">לא הוגדרה תיקיית עבודה.</p>
            <Button variant="outline" onClick={() => navigate("/settings")}>
              עבור להגדרות
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-sm bg-muted p-3 rounded">
              <div>
                <span className="text-muted-foreground">תיקייה:</span>{" "}
                <span className="font-medium">{folder.folder_name}</span>
              </div>
              {folderUrl && (
                <a href={folderUrl} target="_blank" rel="noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
                  פתח ב-Drive <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>

            <div>
              <Label>כותרת הפגישה (אופציונלי)</Label>
              <Input
                value={meetingTitle}
                onChange={(e) => setMeetingTitle(e.target.value)}
                placeholder={`ייבוא מ-Drive • ${new Date().toLocaleDateString("he-IL")}`}
              />
            </div>

            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pr-9"
                placeholder="חיפוש לפי שם קובץ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="border rounded max-h-80 overflow-y-auto">
              {loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground text-sm">
                  {files.length === 0
                    ? "לא נמצאו קבצי אודיו או וידאו בתיקייה"
                    : "אין התאמות לחיפוש"}
                </div>
              ) : (
                <div className="divide-y">
                  {filtered.map((f) => {
                    const isChecked = selected.has(f.id);
                    return (
                      <label
                        key={f.id}
                        className="flex items-center gap-3 p-3 hover:bg-muted/50 cursor-pointer"
                      >
                        <Checkbox checked={isChecked} onCheckedChange={() => toggle(f.id)} />
                        <FileAudio className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">{f.name}</div>
                          {f.modifiedTime && (
                            <div className="text-xs text-muted-foreground">
                              {new Date(f.modifiedTime).toLocaleString("he-IL")}
                              {f.size && ` • ${(Number(f.size) / 1024 / 1024).toFixed(1)} MB`}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>

            {files.length > 0 && (
              <div className="text-xs text-muted-foreground">
                {selected.size} מתוך {filtered.length} קבצים נבחרו
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={importing}>
            ביטול
          </Button>
          <Button onClick={handleImport} disabled={importing || selected.size === 0 || !folder}>
            {importing && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            ייבוא {selected.size > 0 && `(${selected.size})`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
