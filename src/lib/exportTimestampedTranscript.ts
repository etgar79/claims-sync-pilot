import jsPDF from "jspdf";
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle, ShadingType } from "docx";
import { saveAs } from "file-saver";
import type { TranscriptSegment } from "@/components/TimestampedTranscript";

function fmt(sec: number) {
  if (!isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  const ms = Math.floor((sec - Math.floor(sec)) * 1000);
  const base = h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
  return `${base}.${String(ms).padStart(3, "0")}`;
}

function safeName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[^\w\u0590-\u05FF\-_. ]+/g, "_");
}

export interface TimestampedExportMeta {
  filename: string;
  recordedAt?: string | null;
  context?: string | null;
  client?: string | null;
}

function escapeCsv(value: string) {
  if (value == null) return "";
  const s = String(value).replace(/"/g, '""');
  return `"${s}"`;
}

/** CSV with columns: segment_index, start, end, text, word_index, word_start, word_end, word */
export function exportTimestampedCsv(segments: TranscriptSegment[], meta: TimestampedExportMeta) {
  const rows: string[] = [];
  rows.push(["segment_index", "segment_start", "segment_end", "segment_text", "word_index", "word_start", "word_end", "word"].join(","));
  segments.forEach((seg, i) => {
    if (seg.words && seg.words.length) {
      seg.words.forEach((w, j) => {
        rows.push([
          i + 1,
          fmt(seg.start),
          fmt(seg.end),
          escapeCsv(seg.text),
          j + 1,
          fmt(w.start),
          fmt(w.end),
          escapeCsv(w.text),
        ].join(","));
      });
    } else {
      rows.push([
        i + 1,
        fmt(seg.start),
        fmt(seg.end),
        escapeCsv(seg.text),
        "",
        "",
        "",
        "",
      ].join(","));
    }
  });
  // BOM for Excel UTF-8 RTL support
  const blob = new Blob(["\uFEFF" + rows.join("\n")], { type: "text/csv;charset=utf-8" });
  saveAs(blob, `transcript-${safeName(meta.filename)}.csv`);
}

/** PDF with timestamp column (RTL Hebrew-friendly). */
export function exportTimestampedPdf(segments: TranscriptSegment[], meta: TimestampedExportMeta) {
  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  pdf.setR2L(true);
  pdf.setFont("helvetica", "normal");

  const margin = 15;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const usableWidth = pageWidth - margin * 2;
  const timeColWidth = 22;
  const textColWidth = usableWidth - timeColWidth - 4;
  const lineHeight = 6;
  let y = margin;

  const writeHeader = (text: string, size = 11, bold = false) => {
    pdf.setFontSize(size);
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    const wrapped = pdf.splitTextToSize(text || " ", usableWidth);
    for (const w of wrapped) {
      if (y + lineHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
      pdf.text(w, pageWidth - margin, y, { align: "right" });
      y += lineHeight;
    }
  };

  writeHeader("תמלול עם חותמות זמן", 18, true);
  y += 2;
  writeHeader(`קובץ: ${meta.filename}`, 11);
  if (meta.recordedAt) writeHeader(`תאריך: ${new Date(meta.recordedAt).toLocaleString("he-IL")}`, 11);
  if (meta.context) writeHeader(meta.context, 11);
  if (meta.client) writeHeader(`לקוח: ${meta.client}`, 11);
  y += 4;
  pdf.setDrawColor(180);
  pdf.line(margin, y, pageWidth - margin, y);
  y += 4;

  pdf.setFontSize(10);
  for (const seg of segments) {
    const timeStr = `[${fmt(seg.start)}]`;
    const wrapped = pdf.splitTextToSize(seg.text || " ", textColWidth);
    const blockHeight = wrapped.length * lineHeight;
    if (y + blockHeight > pageHeight - margin) { pdf.addPage(); y = margin; }
    // time on the right (RTL: right side is start)
    pdf.setFont("helvetica", "bold");
    pdf.text(timeStr, pageWidth - margin, y, { align: "right" });
    pdf.setFont("helvetica", "normal");
    // text after time column
    let ty = y;
    for (const w of wrapped) {
      pdf.text(w, pageWidth - margin - timeColWidth - 2, ty, { align: "right" });
      ty += lineHeight;
    }
    y = ty + 1;
  }

  pdf.save(`transcript-${safeName(meta.filename)}.pdf`);
}

/** DOCX with a 2-column table (זמן | טקסט) — friendly for sharing/editing. */
export async function exportTimestampedDocx(segments: TranscriptSegment[], meta: TimestampedExportMeta) {
  const border = { style: BorderStyle.SINGLE, size: 4, color: "CCCCCC" };
  const cellBorders = { top: border, bottom: border, left: border, right: border };

  const headerRow = new TableRow({
    children: [
      new TableCell({
        borders: cellBorders,
        width: { size: 1800, type: WidthType.DXA },
        shading: { fill: "EEEEEE", type: ShadingType.CLEAR, color: "auto" },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "זמן", bold: true })] })],
      }),
      new TableCell({
        borders: cellBorders,
        width: { size: 7560, type: WidthType.DXA },
        shading: { fill: "EEEEEE", type: ShadingType.CLEAR, color: "auto" },
        children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: "טקסט", bold: true })] })],
      }),
    ],
    tableHeader: true,
  });

  const bodyRows = segments.map((seg) =>
    new TableRow({
      children: [
        new TableCell({
          borders: cellBorders,
          width: { size: 1800, type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: fmt(seg.start), font: "Courier New" })] })],
        }),
        new TableCell({
          borders: cellBorders,
          width: { size: 7560, type: WidthType.DXA },
          children: [new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun({ text: seg.text || "" })] })],
        }),
      ],
    })
  );

  const headingChildren: Paragraph[] = [
    new Paragraph({ heading: HeadingLevel.HEADING_1, alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun({ text: "תמלול עם חותמות זמן", bold: true })] }),
    new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(`קובץ: ${meta.filename}`)] }),
  ];
  if (meta.recordedAt) headingChildren.push(new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(`תאריך: ${new Date(meta.recordedAt).toLocaleString("he-IL")}`)] }));
  if (meta.context) headingChildren.push(new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(meta.context)] }));
  if (meta.client) headingChildren.push(new Paragraph({ alignment: AlignmentType.RIGHT, bidirectional: true, children: [new TextRun(`לקוח: ${meta.client}`)] }));
  headingChildren.push(new Paragraph({ children: [new TextRun(" ")] }));

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        ...headingChildren,
        new Table({
          width: { size: 9360, type: WidthType.DXA },
          columnWidths: [1800, 7560],
          rows: [headerRow, ...bodyRows],
        }),
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, `transcript-${safeName(meta.filename)}.docx`);
}
