import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, FolderOpen, Plus } from "lucide-react";
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

export function AssignRecordingDialog({
  open,
  onOpenChange,
  recordingId,
  initialCaseId = null,
  onAssigned,
}: Props) {
  const [cases, setCases] = useState<CaseOption[]>([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [selectedCaseId, setSelectedCaseId] = useState<string>("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [newCase, setNewCase] = useState({ case_number: "", title: "", client_name: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setSelectedCaseId(initialCaseId ?? "");
    setNewCase({ case_number: "", title: "", client_name: "" });
    void loadCases();
  }, [open, initialCaseId]);

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
          .select("id, title, case_number")
          .single();
        if (createErr) throw createErr;
        caseId = newC.id;
        // Fire-and-forget: create matching Drive sub-folder (under client folder)
        const folderName = `${newC.case_number} - ${newC.title}`;
        supabase.functions
          .invoke("google-drive-create-case-folder", {
            body: { kind: "case", id: newC.id, name: folderName, clientName: newCase.client_name },
          })
          .then(({ error }) => {
            if (error) console.warn("Drive folder creation skipped:", error);
          });
      }

      if (!caseId) {
        toast.error("בחר תיק או צור תיק חדש");
        setSaving(false);
        return;
      }

      const { error: upErr } = await supabase
        .from("recordings")
        .update({ case_id: caseId })
        .eq("id", recordingId);
      if (upErr) throw upErr;

      toast.success("ההקלטה שויכה לתיק");
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
          <DialogTitle>שיוך הקלטה לתיק</DialogTitle>
          <DialogDescription>בחר תיק קיים או צור תיק חדש</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-2">
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
                  אין תיקי שומה. צור תיק חדש.
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
