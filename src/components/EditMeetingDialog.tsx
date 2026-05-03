import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface MeetingPartial {
  id: string;
  title: string;
  client_name?: string | null;
  project_name?: string | null;
  location?: string | null;
  meeting_date?: string | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  meeting: MeetingPartial;
  onSaved?: () => void;
  /** When true, only show the title field (compact in-place rename) */
  titleOnly?: boolean;
}

export function EditMeetingDialog({ open, onOpenChange, meeting, onSaved, titleOnly }: Props) {
  const [form, setForm] = useState({
    title: meeting.title ?? "",
    client_name: meeting.client_name ?? "",
    project_name: meeting.project_name ?? "",
    location: meeting.location ?? "",
    meeting_date: meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      title: meeting.title ?? "",
      client_name: meeting.client_name ?? "",
      project_name: meeting.project_name ?? "",
      location: meeting.location ?? "",
      meeting_date: meeting.meeting_date ? meeting.meeting_date.slice(0, 16) : "",
    });
  }, [meeting.id, meeting.title, meeting.client_name, meeting.project_name, meeting.location, meeting.meeting_date]);

  const handleSave = async () => {
    if (!form.title.trim()) {
      toast.error("יש להזין כותרת");
      return;
    }
    setSaving(true);
    const payload: Record<string, any> = { title: form.title.trim() };
    if (!titleOnly) {
      payload.client_name = form.client_name || null;
      payload.project_name = form.project_name || null;
      payload.location = form.location || null;
      payload.meeting_date = form.meeting_date || null;
    }
    const { error } = await supabase.from("meetings").update(payload).eq("id", meeting.id);
    setSaving(false);
    if (error) {
      toast.error("שגיאה בשמירה", { description: error.message });
      return;
    }
    toast.success("הפגישה עודכנה");
    onOpenChange(false);
    onSaved?.();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titleOnly ? "שינוי שם פגישה" : "עריכת פגישה"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>כותרת *</Label>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
          </div>
          {!titleOnly && (
            <>
              <div>
                <Label>שם לקוח</Label>
                <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
              </div>
              <div>
                <Label>שם פרויקט</Label>
                <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
              </div>
              <div>
                <Label>מיקום</Label>
                <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
              </div>
              <div>
                <Label>תאריך פגישה</Label>
                <Input type="datetime-local" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>ביטול</Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
            שמור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
