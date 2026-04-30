import { AppraisalCase } from "@/data/sampleCases";
import { Document, Packer, Paragraph, TextRun, AlignmentType } from "docx";
import { saveAs } from "file-saver";
import jsPDF from "jspdf";

export interface ReportContext {
  appraisalCase: AppraisalCase;
  aiSummary?: string;
  appraiser?: string;
}

export function renderTemplate(template: string, ctx: ReportContext): string {
  const c = ctx.appraisalCase;
  const transcripts = (c.recordings || [])
    .filter((r) => r.transcript)
    .map((r) => `• [${r.filename}] ${r.transcript}`)
    .join("\n\n") || "[אין תמלולים זמינים]";
  const notes = (c.notes || []).map((n) => `• ${n.content}`).join("\n") || "[אין הערות]";

  const map: Record<string, string> = {
    caseNumber: c.caseNumber || "",
    title: c.title || "",
    clientName: c.clientName || "",
    clientPhone: c.clientPhone || "",
    address: c.address || "",
    inspectionDate: c.inspectionDate ? new Date(c.inspectionDate).toLocaleDateString("he-IL") : "",
    estimatedValue: c.estimatedValue ? c.estimatedValue.toLocaleString("he-IL") : "0",
    transcripts,
    notes,
    aiSummary: ctx.aiSummary || "[לא נוצר סיכום]",
    date: new Date().toLocaleDateString("he-IL"),
    appraiser: ctx.appraiser || "",
  };

  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => map[k] ?? `{{${k}}}`);
}

export async function exportToWord(content: string, filename: string) {
  const paragraphs = content.split("\n").map(
    (line) =>
      new Paragraph({
        bidirectional: true,
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: line, rightToLeft: true, font: "Arial", size: 24 })],
      })
  );

  const doc = new Document({
    sections: [{ properties: {}, children: paragraphs }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `${filename}.docx`);
}

export function exportToPdf(content: string, filename: string) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setR2L(true);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(11);

  const margin = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const lineHeight = 6;
  let y = margin;

  const lines = content.split("\n");
  for (const line of lines) {
    const wrapped = pdf.splitTextToSize(line || " ", usableWidth);
    for (const w of wrapped) {
      if (y + lineHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(w, pageWidth - margin, y, { align: "right" });
      y += lineHeight;
    }
  }

  pdf.save(`${filename}.pdf`);
}
