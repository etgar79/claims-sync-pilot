import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, ListChecks, Calendar as CalendarIcon, Sparkles, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface ExtractedTask {
  title: string;
  notes?: string;
  due?: string;
  selected?: boolean;
}
interface ExtractedMeeting {
  summary: string;
  description?: string;
  start: string;
  end: string;
  location?: string;
  selected?: boolean;
}

interface Props {
  meetingTitle?: string;
  clientName?: string;
  transcript?: string;
  summary?: string;
  trigger?: React.ReactNode;
}

export function ActionItemsDialog({ meetingTitle, clientName, transcript, summary, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [creating, setCreating] = useState(false);
  const [tasks, setTasks] = useState<ExtractedTask[]>([]);
  const [meetings, setMeetings] = useState<ExtractedMeeting[]>([]);
  const [extracted, setExtracted] = useState(false);

  const extract = async () => {
    setExtracting(true);
    setExtracted(false);
    try {
      const res = await supabase.functions.invoke("extract-action-items", {
        body: { transcript, summary, meeting_title: meetingTitle, client_name: clientName },
      });
      if (res.error) throw res.error;
      const data = res.data as { tasks: ExtractedTask[]; follow_up_meetings: ExtractedMeeting[] };
      setTasks((data.tasks ?? []).map((t) => ({ ...t, selected: true })));
      setMeetings((data.follow_up_meetings ?? []).map((m) => ({ ...m, selected: true })));
      setExtracted(true);
      if (!data.tasks?.length && !data.follow_up_meetings?.length) {
        toast.info("לא זוהו משימות או פגישות המשך בתוכן הזה");
      }
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בחילוץ משימות");
    } finally {
      setExtracting(false);
    }
  };

  const createAll = async () => {
    setCreating(true);
    try {
      const selectedTasks = tasks.filter((t) => t.selected && t.title.trim());
      const selectedMeetings = meetings.filter((m) => m.selected && m.summary.trim());

      let tasksCreated = 0;
      let meetingsCreated = 0;
      const errors: string[] = [];

      if (selectedTasks.length > 0) {
        const r = await supabase.functions.invoke("google-tasks-create", {
          body: { tasks: selectedTasks.map(({ selected, ...t }) => t) },
        });
        if (r.error) errors.push(`משימות: ${r.error.message}`);
        else tasksCreated = (r.data as any)?.count ?? 0;
      }

      for (const m of selectedMeetings) {
        const { selected, ...payload } = m;
        const r = await supabase.functions.invoke("google-calendar-event", { body: payload });
        if (r.error) errors.push(`אירוע "${m.summary}": ${r.error.message}`);
        else meetingsCreated++;
      }

      if (errors.length > 0) {
        toast.warning("חלק מהפעולות נכשלו", { description: errors.join("; ") });
      }
      if (tasksCreated || meetingsCreated) {
        toast.success(`נוצרו ${tasksCreated} משימות ו-${meetingsCreated} אירועים בחשבון Google שלך`);
        setOpen(false);
      }
    } catch (e: any) {
      toast.error(e?.message || "שגיאה ביצירה");
    } finally {
      setCreating(false);
    }
  };

  const hasContent = !!(transcript || summary);

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setTasks([]); setMeetings([]); setExtracted(false); } }}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" disabled={!hasContent}>
            <ListChecks className="h-4 w-4 ml-2" />
            צור משימות ופגישות
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            משימות ופגישות מהפגישה
          </DialogTitle>
          <DialogDescription>
            ה-AI יחלץ משימות ופגישות המשך מהסיכום, ויצור אותן בחשבון Google שלך
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1 -mx-2 px-2">
          {!extracted ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ListChecks className="h-12 w-12 text-muted-foreground/30 mb-3" />
              <p className="text-sm text-muted-foreground mb-4">
                לחץ על הכפתור כדי שה-AI ינתח את הפגישה ויציע משימות ופגישות המשך
              </p>
              <Button onClick={extract} disabled={extracting}>
                {extracting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Sparkles className="h-4 w-4 ml-2" />}
                {extracting ? "מנתח..." : "חלץ עם AI"}
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {tasks.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <ListChecks className="h-4 w-4" /> משימות ({tasks.filter((t) => t.selected).length}/{tasks.length})
                  </h3>
                  <div className="space-y-2">
                    {tasks.map((t, i) => (
                      <Card key={i} className="p-3">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={t.selected}
                            onCheckedChange={(v) => setTasks((arr) => arr.map((x, j) => j === i ? { ...x, selected: !!v } : x))}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                            <Input
                              value={t.title}
                              onChange={(e) => setTasks((arr) => arr.map((x, j) => j === i ? { ...x, title: e.target.value } : x))}
                              className="font-medium"
                            />
                            {t.notes && <p className="text-xs text-muted-foreground">{t.notes}</p>}
                            <div className="flex items-center gap-2">
                              <Label className="text-xs">תאריך יעד:</Label>
                              <Input
                                type="date"
                                value={t.due ?? ""}
                                onChange={(e) => setTasks((arr) => arr.map((x, j) => j === i ? { ...x, due: e.target.value } : x))}
                                className="h-8 w-40"
                              />
                            </div>
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {meetings.length > 0 && (
                <div>
                  <h3 className="font-semibold text-sm mb-2 flex items-center gap-2">
                    <CalendarIcon className="h-4 w-4" /> פגישות המשך ({meetings.filter((m) => m.selected).length}/{meetings.length})
                  </h3>
                  <div className="space-y-2">
                    {meetings.map((m, i) => (
                      <Card key={i} className="p-3">
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={m.selected}
                            onCheckedChange={(v) => setMeetings((arr) => arr.map((x, j) => j === i ? { ...x, selected: !!v } : x))}
                            className="mt-1"
                          />
                          <div className="flex-1 space-y-2">
                            <Input
                              value={m.summary}
                              onChange={(e) => setMeetings((arr) => arr.map((x, j) => j === i ? { ...x, summary: e.target.value } : x))}
                              className="font-medium"
                            />
                            {m.description && <p className="text-xs text-muted-foreground">{m.description}</p>}
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-xs">התחלה</Label>
                                <Input
                                  type="datetime-local"
                                  value={m.start.slice(0, 16)}
                                  onChange={(e) => setMeetings((arr) => arr.map((x, j) => j === i ? { ...x, start: new Date(e.target.value).toISOString() } : x))}
                                  className="h-8"
                                />
                              </div>
                              <div>
                                <Label className="text-xs">סיום</Label>
                                <Input
                                  type="datetime-local"
                                  value={m.end.slice(0, 16)}
                                  onChange={(e) => setMeetings((arr) => arr.map((x, j) => j === i ? { ...x, end: new Date(e.target.value).toISOString() } : x))}
                                  className="h-8"
                                />
                              </div>
                            </div>
                            {m.location && (
                              <Input
                                value={m.location}
                                onChange={(e) => setMeetings((arr) => arr.map((x, j) => j === i ? { ...x, location: e.target.value } : x))}
                                placeholder="מיקום"
                                className="h-8"
                              />
                            )}
                          </div>
                        </div>
                      </Card>
                    ))}
                  </div>
                </div>
              )}

              {tasks.length === 0 && meetings.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-8">לא זוהו משימות או פגישות בתוכן הזה</p>
              )}
            </div>
          )}
        </ScrollArea>

        {extracted && (tasks.length > 0 || meetings.length > 0) && (
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={extract} disabled={extracting || creating}>
              {extracting ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <Sparkles className="h-4 w-4 ml-2" />}
              חלץ מחדש
            </Button>
            <Button onClick={createAll} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <ExternalLink className="h-4 w-4 ml-2" />}
              צור בחשבון Google שלי
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
