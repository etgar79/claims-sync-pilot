import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Sparkles, Loader2, Wand2, CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface TranscriptVersion {
  id: string;
  service: string;
  transcript: string;
  is_merged: boolean;
  created_at: string;
}

interface Props {
  recordingId: string;
  table?: "recordings" | "meeting_recordings";
  onMerged?: (mergedTranscript: string) => void;
  trigger?: React.ReactNode;
}

const serviceLabel = (svc: string) => {
  if (svc === "ivrit_ai") return "AI חסכוני";
  if (svc === "whisper") return "AI מהיר";
  if (svc === "elevenlabs") return "AI איכות גבוהה";
  if (svc === "merged") return "תמלול-על משולב";
  return svc;
};

export function MergeTranscriptsDialog({ recordingId, table = "recordings", onMerged, trigger }: Props) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<TranscriptVersion[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [merging, setMerging] = useState(false);

  const loadVersions = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("transcript_versions")
      .select("id, service, transcript, is_merged, created_at")
      .eq("recording_id", recordingId)
      .eq("is_merged", false)
      .order("created_at", { ascending: false });
    if (error) {
      toast.error("שגיאה בטעינת גרסאות", { description: error.message });
    } else {
      setVersions(data ?? []);
      // Auto-select all
      setSelected(new Set((data ?? []).map((v) => v.id)));
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open) loadVersions();
  }, [open]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleMerge = async () => {
    const chosen = versions.filter((v) => selected.has(v.id));
    if (chosen.length < 2) {
      toast.error("צריך לבחור לפחות 2 גרסאות לאיחוד");
      return;
    }
    setMerging(true);
    try {
      const { data, error } = await supabase.functions.invoke("merge-transcripts", {
        body: {
          versions: chosen.map((v) => ({ service: serviceLabel(v.service), text: v.transcript })),
          language: "he",
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const merged = (data as any).merged_transcript as string;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("לא מחובר");

      // Save merged version
      await supabase.from("transcript_versions").insert({
        recording_id: recordingId,
        user_id: user.id,
        service: "merged",
        transcript: merged,
        is_merged: true,
        source_version_ids: chosen.map((v) => v.id),
      });

      // Update main recording transcript
      await supabase
        .from(table)
        .update({
          transcript: merged,
          transcript_status: "completed",
          transcription_service: "merged",
        })
        .eq("id", recordingId);

      toast.success("תמלול-על נוצר בהצלחה!", {
        description: `שולב מ-${chosen.length} גרסאות`,
      });
      onMerged?.(merged);
      setOpen(false);
    } catch (e: any) {
      toast.error("שגיאה ביצירת תמלול-על", { description: e?.message });
    } finally {
      setMerging(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline" className="gap-2">
            <Wand2 className="h-4 w-4" />
            צור תמלול-על משולב
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            תמלול-על משולב
          </DialogTitle>
          <DialogDescription>
            גימיני 2.5 Pro ייקח את כל הגרסאות שתבחר וייצור מהן תמלול אחד אופטימלי - הטוב מכל העולמות.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <p>אין עדיין גרסאות תמלול להקלטה זו.</p>
            <p className="text-sm mt-2">הרץ קודם תמלול עם לפחות 2 שירותים שונים.</p>
          </div>
        ) : versions.length < 2 ? (
          <div className="text-center py-6 text-muted-foreground">
            <p>קיימת רק גרסת תמלול אחת.</p>
            <p className="text-sm mt-2">כדי ליצור תמלול-על נדרשות לפחות 2 גרסאות.</p>
          </div>
        ) : (
          <>
            <ScrollArea className="max-h-[50vh] pr-3">
              <div className="space-y-2">
                {versions.map((v) => {
                  const isSelected = selected.has(v.id);
                  return (
                    <Card
                      key={v.id}
                      className={`p-3 cursor-pointer transition-colors border-2 ${
                        isSelected ? "border-primary bg-primary/5" : "border-border"
                      }`}
                      onClick={() => toggle(v.id)}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className={`mt-0.5 h-5 w-5 rounded-full border-2 flex items-center justify-center shrink-0 ${
                            isSelected
                              ? "bg-primary border-primary"
                              : "border-muted-foreground"
                          }`}
                        >
                          {isSelected && <CheckCircle2 className="h-4 w-4 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="secondary">{serviceLabel(v.service)}</Badge>
                            <span className="text-xs text-muted-foreground">
                              {new Date(v.created_at).toLocaleString("he-IL")}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground line-clamp-2">
                            {v.transcript.slice(0, 200)}
                            {v.transcript.length > 200 ? "..." : ""}
                          </p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="flex items-center justify-between pt-3 border-t">
              <p className="text-sm text-muted-foreground">
                נבחרו <span className="font-semibold text-foreground">{selected.size}</span> מתוך {versions.length}
              </p>
              <Button onClick={handleMerge} disabled={merging || selected.size < 2} className="gap-2">
                {merging ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    גימיני מאחד...
                  </>
                ) : (
                  <>
                    <Wand2 className="h-4 w-4" />
                    צור תמלול-על
                  </>
                )}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
