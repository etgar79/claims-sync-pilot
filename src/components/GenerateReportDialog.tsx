import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { FileText, FileDown, Loader2, FileType2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { AppraisalCase } from "@/data/sampleCases";
import { renderTemplate, exportToWord, exportToPdf } from "@/lib/exportReport";
import {
  DEFAULT_TEMPLATE_CONTENT,
  DEFAULT_TEMPLATE_NAME,
  DEFAULT_TEMPLATE_DESCRIPTION,
} from "@/lib/defaultReportTemplate";

interface Template {
  id: string;
  name: string;
  content: string;
}

interface Props {
  appraisalCase: AppraisalCase;
  aiSummary?: string;
}

export function GenerateReportDialog({ appraisalCase, aiSummary }: Props) {
  const [open, setOpen] = useState(false);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState<string>("__default__");
  const [appraiser, setAppraiser] = useState("");
  const [preview, setPreview] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      const { data } = await supabase
        .from("report_templates")
        .select("id,name,content")
        .order("is_default", { ascending: false })
        .order("created_at", { ascending: true });
      setTemplates(data || []);
      if (data && data.length > 0) setSelectedId(data[0].id);
    })();
  }, [open]);

  useEffect(() => {
    const tpl =
      selectedId === "__default__"
        ? DEFAULT_TEMPLATE_CONTENT
        : templates.find((t) => t.id === selectedId)?.content || DEFAULT_TEMPLATE_CONTENT;
    setPreview(renderTemplate(tpl, { appraisalCase, aiSummary, appraiser }));
  }, [selectedId, templates, appraisalCase, aiSummary, appraiser]);

  const filename = `דוח-${appraisalCase.caseNumber || "תיק"}-${appraisalCase.clientName || ""}`.trim();

  const handleWord = async () => {
    setLoading(true);
    try {
      await exportToWord(preview, filename);
      toast.success("הדוח יוצא ל-Word");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בייצוא Word");
    } finally {
      setLoading(false);
    }
  };

  const handlePdf = () => {
    try {
      exportToPdf(preview, filename);
      toast.success("הדוח יוצא ל-PDF");
    } catch (e: any) {
      toast.error(e?.message || "שגיאה בייצוא PDF");
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="default">
          <FileText className="h-4 w-4 ml-2" />
          צור דוח
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>צור דוח עבור {appraisalCase.clientName}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>תבנית דוח</Label>
            <Select value={selectedId} onValueChange={setSelectedId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">{DEFAULT_TEMPLATE_NAME} (ברירת מחדל)</SelectItem>
                {templates.map((t) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{DEFAULT_TEMPLATE_DESCRIPTION}</p>
          </div>

          <div className="space-y-2">
            <Label>שם השמאי (אופציונלי)</Label>
            <Input value={appraiser} onChange={(e) => setAppraiser(e.target.value)} placeholder="הכנס את שמך" />
          </div>
        </div>

        <div className="space-y-2 flex-1 overflow-hidden flex flex-col">
          <Label>תצוגה מקדימה (ניתן לערוך לפני ייצוא)</Label>
          <Textarea
            value={preview}
            onChange={(e) => setPreview(e.target.value)}
            className="flex-1 min-h-[300px] font-mono text-xs leading-relaxed"
            dir="rtl"
          />
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => setOpen(false)}>
            ביטול
          </Button>
          <Button variant="secondary" onClick={handlePdf}>
            <FileType2 className="h-4 w-4 ml-2" />
            ייצוא ל-PDF
          </Button>
          <Button onClick={handleWord} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 ml-2 animate-spin" /> : <FileDown className="h-4 w-4 ml-2" />}
            ייצוא ל-Word
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
