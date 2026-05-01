import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, Calendar, Plus } from "lucide-react";
import { toast } from "sonner";

interface MeetingOption {
  id: string;
  title: string;
  client_name: string | null;
  meeting_date: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recordingId: string;
  recordingFilename: string;
  onAssigned?: () => void;
}

export function AssignToMeetingDialog({ open, onOpenChange, recordingId, recordingFilename, onAssigned }: Props) {
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [loadingList, setLoadingList] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [newMeeting, setNewMeeting] = useState({ title: "", client_name: "", project_name: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setMode("existing");
    setSelectedId("");
    // Pre-fill new meeting title from filename (without extension)
    const nameNoExt = recordingFilename.replace(/\.[^.]+$/, "");
    setNewMeeting({ title: nameNoExt, client_name: "", project_name: "" });
    void load();
  }, [open, recordingFilename]);

  const load = async () => {
    setLoadingList(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("id, title, client_name, meeting_date")
      .order("meeting_date", { ascending: false, nullsFirst: false })
      .limit(200);
    if (error) toast.error(error.message);
    setMeetings((data as MeetingOption[]) ?? []);
    setLoadingList(false);
  };

  const handleAssign = async () => {
    setSaving(true);
    try {
      let meetingId = selectedId;

      if (mode === "new") {
        if (!newMeeting.title.trim()) {
          toast.error("יש להזין כותרת לפגישה");
          setSaving(false);
          return;
        }
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("לא מחובר");
        const { data: newM, error: createErr } = await supabase
          .from("meetings")
          .insert({
            user_id: user.id,
            title: newMeeting.title,
            client_name: newMeeting.client_name || null,
            project_name: newMeeting.project_name || null,
            status: "active",
          })
          .select("id")
          .single();
        if (createErr) throw createErr;
        meetingId = newM.id;
      }

      if (!meetingId) {
        toast.error("יש לבחור פגישה או ליצור פגישה חדשה");
        setSaving(false);
        return;
      }

      const { error: upErr } = await supabase
        .from("meeting_recordings")
        .update({ meeting_id: meetingId })
        .eq("id", recordingId);
      if (upErr) throw upErr;

      toast.success("ההקלטה שויכה לפגישה");
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
          <DialogTitle>שייך הקלטה לפגישה</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="text-sm text-muted-foreground p-2 rounded bg-muted/40 truncate">
            🎙️ {recordingFilename}
          </div>

          <div className="flex gap-2">
            <Button
              variant={mode === "existing" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("existing")}
              className="flex-1 gap-2"
            >
              <Calendar className="h-4 w-4" />
              פגישה קיימת
            </Button>
            <Button
              variant={mode === "new" ? "default" : "outline"}
              size="sm"
              onClick={() => setMode("new")}
              className="flex-1 gap-2"
            >
              <Plus className="h-4 w-4" />
              פגישה חדשה
            </Button>
          </div>

          {mode === "existing" ? (
            <div className="space-y-2">
              <Label>בחר פגישה</Label>
              {loadingList ? (
                <div className="text-center py-4 text-muted-foreground text-sm">
                  <Loader2 className="h-4 w-4 animate-spin inline ml-2" />
                  טוען פגישות...
                </div>
              ) : meetings.length === 0 ? (
                <div className="text-sm text-muted-foreground p-3 border rounded">
                  אין פגישות עדיין. צור פגישה חדשה.
                </div>
              ) : (
                <Select value={selectedId} onValueChange={setSelectedId}>
                  <SelectTrigger>
                    <SelectValue placeholder="בחר פגישה..." />
                  </SelectTrigger>
                  <SelectContent>
                    {meetings.map((m) => (
                      <SelectItem key={m.id} value={m.id}>
                        {m.title}
                        {m.client_name ? ` • ${m.client_name}` : ""}
                        {m.meeting_date ? ` • ${new Date(m.meeting_date).toLocaleDateString("he-IL")}` : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <Label>כותרת *</Label>
                <Input
                  value={newMeeting.title}
                  onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                />
              </div>
              <div>
                <Label>שם לקוח</Label>
                <Input
                  value={newMeeting.client_name}
                  onChange={(e) => setNewMeeting({ ...newMeeting, client_name: e.target.value })}
                />
              </div>
              <div>
                <Label>שם פרויקט</Label>
                <Input
                  value={newMeeting.project_name}
                  onChange={(e) => setNewMeeting({ ...newMeeting, project_name: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleAssign} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            שייך
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
