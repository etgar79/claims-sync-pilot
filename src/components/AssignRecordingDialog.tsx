import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, FolderOpen, Plus, Search, Check, ArrowRight } from "lucide-react";
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
  const [search, setSearch] = useState("");
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [newCase, setNewCase] = useState({ case_number: "", title: "", client_name: "" });
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSearch("");
    setShowNew(false);
    setNewCase({ case_number: "", title: "", client_name: "" });
    void loadCases();
  }, [open]);

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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cases;
    return cases.filter(
      (c) =>
        c.case_number.toLowerCase().includes(q) ||
        c.title.toLowerCase().includes(q) ||
        c.client_name.toLowerCase().includes(q)
    );
  }, [cases, search]);

  const assignTo = async (caseId: string) => {
    setAssigningId(caseId);
    try {
      const { error } = await supabase
        .from("recordings")
        .update({ case_id: caseId })
        .eq("id", recordingId);
      if (error) throw error;
      toast.success("ההקלטה שויכה לתיק");
      onAssigned?.();
      onOpenChange(false);
    } catch (e: any) {
      toast.error("שגיאה בשיוך", { description: e?.message });
    } finally {
      setAssigningId(null);
    }
  };

  const createAndAssign = async () => {
    if (!newCase.case_number.trim() || !newCase.title.trim() || !newCase.client_name.trim()) {
      toast.error("מלאי מספר תיק, כותרת ושם לקוח");
      return;
    }
    setCreating(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");
      const { data: newC, error } = await supabase
        .from("cases")
        .insert({
          user_id: user.id,
          case_number: newCase.case_number,
          title: newCase.title,
          client_name: newCase.client_name,
        })
        .select("id, case_number, title")
        .single();
      if (error) throw error;
      // Drive folder fire-and-forget
      const folderName = `${newC.case_number} - ${newC.title}`;
      supabase.functions.invoke("google-drive-create-case-folder", {
        body: { kind: "case", id: newC.id, name: folderName, clientName: newCase.client_name },
      }).catch(() => {});
      await assignTo(newC.id);
    } catch (e: any) {
      toast.error("שגיאה ביצירת תיק", { description: e?.message });
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden">
        <DialogHeader className="px-5 pt-5 pb-3">
          <DialogTitle>שייך לתיק</DialogTitle>
          <DialogDescription>קליק על תיק = שיוך מיידי</DialogDescription>
        </DialogHeader>

        {!showNew ? (
          <>
            <div className="px-5 pb-3">
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  dir="rtl"
                  placeholder="חיפוש תיק, לקוח או מספר..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pr-9"
                />
              </div>
            </div>
            <ScrollArea className="max-h-80 px-5">
              {loadingCases ? (
                <div className="text-center py-8 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline ml-2" />
                  טוען...
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-sm text-muted-foreground text-center py-8">
                  {search ? "אין תוצאות" : "אין תיקים עדיין"}
                </div>
              ) : (
                <div className="space-y-1.5 pb-2">
                  {filtered.map((c) => {
                    const isCurrent = c.id === initialCaseId;
                    const isAssigning = assigningId === c.id;
                    return (
                      <button
                        key={c.id}
                        onClick={() => assignTo(c.id)}
                        disabled={!!assigningId}
                        className="w-full text-right border rounded-lg p-3 hover:border-primary hover:bg-muted/40 transition-all disabled:opacity-50 flex items-center gap-3 group"
                      >
                        <FolderOpen className="h-4 w-4 text-primary shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">
                            תיק {c.case_number} • {c.title}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {c.client_name}
                          </div>
                        </div>
                        {isAssigning ? (
                          <Loader2 className="h-4 w-4 animate-spin text-primary" />
                        ) : isCurrent ? (
                          <Check className="h-4 w-4 text-green-600" />
                        ) : (
                          <ArrowRight className="h-4 w-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </ScrollArea>
            <div className="border-t p-3">
              <Button variant="ghost" onClick={() => setShowNew(true)} className="w-full gap-2">
                <Plus className="h-4 w-4" /> צור תיק חדש
              </Button>
            </div>
          </>
        ) : (
          <div className="px-5 pb-5 space-y-3">
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
            <div className="flex gap-2 pt-2">
              <Button variant="ghost" onClick={() => setShowNew(false)} className="flex-1">
                חזרה
              </Button>
              <Button onClick={createAndAssign} disabled={creating} className="flex-1 gap-2">
                {creating && <Loader2 className="h-4 w-4 animate-spin" />}
                צור ושייך
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
