import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FolderOpen, Plus, Tag, X, Calendar } from "lucide-react";
import { toast } from "sonner";

interface CaseOption {
  id: string;
  case_number: string;
  title: string;
  client_name: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId: string;
  recordingFilename: string;
  initialTags?: string[];
  initialCaseId?: string | null;
  onAssigned?: () => void;
}

const QUICK_TAGS = ["ביקור ראשון", "מדידה", "שיחה עם לקוח", "תיעוד נזק", "פגישה משפטית"];

export function AssignRecordingDialog({
  open,
  onOpenChange,
  recordingId,
  recordingFilename,
  initialTags = [],
  initialCaseId = null,
  onAssigned,
}: Props) {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [mode, setMode] = useState<"existing" | "new" | "tagsOnly">("existing");
  const [newCase, setNewCase] = useState({ case_number: "", title: "", client_name: "" });
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode(initialCaseId ? "existing" : "existing");
    setSelectedCaseId(initialCaseId ?? "");
    setNewCase({ case_number: "", title: "", client_name: "" });
    setTags(initialTags ?? []);
    setTagInput("");
    void loadCases();
  }, [open, initialCaseId, initialTags]);

  const loadCases = async () => {
    setLoadingCases(true);
    const { data, error } = await supabase
      .from("cases")
      .select("id, case_number, title, client_name")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setCases((data as CaseOption[]) ?? []);
    setLoadingCases(false);
  };

  const addTag = (raw: string) => {
    const t = raw.trim();
    if (!t) return;
    if (tags.includes(t)) return;
    setTags([...tags, t]);
    setTagInput("");
  };

  const removeTag = (t: string) => setTags(tags.filter((x) => x !== t));

  const todayTag = () => {
    const d = new Date();
    addTag(d.toLocaleDateString("he-IL"));
  };

  const handleAssign = async () => {
    setSaving(true);
    try {
      let caseId: string | null = selectedCaseId || null;

      if (mode === "new") {
        if (!newCase.case_number.trim() || !newCase.title.trim() || !newCase.client_name.trim()) {
          toast.error("יש למלא מספר תיק, כותרת ושם לקוח");
          setSaving(false);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("לא מחובר");
        const { data: newC, error: createErr } = await supabase
          .from("cases")
          .insert({
            user_id: user.id,
            case_number: newCase.case_number,
            title: newCase.title,
            client_name: newCase.client_name,
          })
          .select("id")
          .single();
        if (createErr) throw createErr;
        caseId = newC.id;
      } else if (mode === "tagsOnly") {
        caseId = null;
      }

      // Must have either case or at least one tag
      if (!caseId && tags.length === 0) {
        toast.error("בחר תיק או הוסף לפחות תווית אחת");
        setSaving(false);
        return;
      }

      const update: any = { tags };
      if (caseId) update.case_id = caseId;

      const { error: upErr } = await supabase
        .from("recordings")
        .update(update)
        .eq("id", recordingId);
      if (upErr) throw upErr;

      toast.success("ההקלטה תויגה בהצלחה");
      onOpenChange(false);
      onAssigned?.();
    } catch (e) {
      toast.error("שגיאה בשיוך", {
        description: e instanceof Error ? e.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>תיוג הקלטה</DialogTitle>
          <DialogDescription>שייך לתיק, הוסף תאריך, או תייג בחופשיות</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground p-2 rounded bg-muted/40 truncate">
            🎙️ {recordingFilename}
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Button
              variant={mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("existing")}
              className="gap-1"
            >
              <FolderOpen className="h-3.5 w-3.5" />
              תיק קיים
            </Button>
            <Button
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
              className="gap-1"
            >
              <Plus className="h-3.5 w-3.5" />
              תיק חדש
            </Button>
            <Button
              variant={mode === "tagsOnly" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("tagsOnly")}
              className="gap-1"
            >
              <Tag className="h-3.5 w-3.5" />
              תוויות בלבד
            </Button>
          </div>

          {mode === "existing" && (
            <div className="space-y-2">
              <Label>בחר תיק</Label>
              {loadingCases ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline ml-2" />
                  טוען תיקים...
                </div>
              ) : cases.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 border rounded">
                  אין תיקי שומה. צור תיק חדש או תייג בלבד.
                </div>
              ) : (
                <Select value={selectedCaseId} onValueChange={setSelectedCaseId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר תיק..." />
                  </SelectTrigger>
                  <SelectContent>
                    {cases.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        תיק {c.case_number} • {c.title} • {c.client_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {mode === "new" && (
            <div className="space-y-3">
              <div>
                <Label>מספר תיק *</Label>
                <Input
                  value={newCase.case_number}
                  onChange={(e) => setNewCase({ ...newCase, case_number: e.target.value })}
                  placeholder="למשל 2026-001"
                />
              </div>
              <div>
                <Label>כותרת *</Label>
                <Input
                  value={newCase.title}
                  onChange={(e) => setNewCase({ ...newCase, title: e.target.value })}
                  placeholder="שם התיק"
                />
              </div>
              <div>
                <Label>שם לקוח *</Label>
                <Input
                  value={newCase.client_name}
                  onChange={(e) => setNewCase({ ...newCase, client_name: e.target.value })}
                />
              </div>
            </div>
          )}

          {/* Free-form tags - always available */}
          <div className="space-y-2 border-t pt-4">
            <Label className="flex items-center gap-2">
              <Tag className="h-3.5 w-3.5" />
              תוויות חופשיות
            </Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addTag(tagInput);
                  }
                }}
                placeholder="הוסף תווית והקש Enter"
              />
              <Button type="button" size="sm" variant="outline" onClick={() => addTag(tagInput)}>
                הוסף
              </Button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={todayTag}>
                <Calendar className="h-3 w-3" />
                תאריך היום
              </Button>
              {QUICK_TAGS.map((t) => (
                <Button
                  key={t}
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-6 text-xs"
                  onClick={() => addTag(t)}
                  disabled={tags.includes(t)}
                >
                  + {t}
                </Button>
              ))}
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {tags.map((t) => (
                  <Badge key={t} variant="secondary" className="gap-1">
                    {t}
                    <button onClick={() => removeTag(t)} className="hover:text-destructive">
                      <X className="h-3 w-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleAssign} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
