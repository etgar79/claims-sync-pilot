import jsPDF from "jspdf";

export interface TranscriptPdfMeta {
  filename: string;
  recordedAt?: string | null;
  context?: string | null; // e.g. "תיק 1234 • דירת רוזן" / "פגישה: שיפוץ סלון"
  client?: string | null;
}

export function exportTranscriptToPdf(transcript: string, meta: TranscriptPdfMeta) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setR2L(true);
  pdf.setFont("helvetica", "normal");

  const margin = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const lineHeight = 6;
  let y = margin;

  const writeLine = (text: string, size = 11, bold = false) => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const wrapped = pdf.splitTextToSize(text || " ", usableWidth);
    for (const w of wrapped) {
      if (y + lineHeight > pageHeight - margin) {
        pdf.addPage();
        y = margin;
      }
      pdf.text(w, pageWidth - margin, y, { align: "right" });
      y += lineHeight;
    }
  };

  writeLine("תמלול", 18, true);
  y += 2;
  writeLine(`קובץ: ${meta.filename}`, 11);
  if (meta.recordedAt) writeLine(`תאריך: ${new Date(meta.recordedAt).toLocaleString("he-IL")}`, 11);
  if (meta.context) writeLine(meta.context, 11);
  if (meta.client) writeLine(`לקוח: ${meta.client}`, 11);
  y += 4;

  // Divider
  pdf.setDrawColor(180);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 4;

  // Body — split by blank lines into paragraphs
  const paragraphs = transcript.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const lines = para.split("\n");
    for (const line of lines) writeLine(line, 11);
    y += 2;
  }

  const safeName = meta.filename.replace(/\.[^.]+$/, "").replace(/[^\w\u0590-\u05FF\-_. ]+/g, "_");
  pdf.save(`transcript-${safeName}.pdf`);
}

export function downloadTranscriptTxt(transcript: string, filename: string) {
  const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = filename.replace(/\.[^.]+$/, "").replace(/[^\w\u0590-\u05FF\-_. ]+/g, "_");
  a.download = `transcript-${safeName}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
