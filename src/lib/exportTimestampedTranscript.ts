import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, HeadingLevel, AlignmentType, BorderStyle, ShadingType } from "docx";
import { saveAs } from "file-saver";
import { htmlToPdf } from "@/lib/exportTranscriptPdf";
import type { TranscriptSegment } from "@/components/TimestampedTranscript";

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

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

/** PDF with timestamp column — uses HTML rendering for proper Hebrew/RTL. */
export async function exportTimestampedPdf(segments: TranscriptSegment[], meta: TimestampedExportMeta) {
  const headerLines: string[] = [];
  headerLines.push(`<h1 style="font-size:22px;margin:0 0 8px;font-weight:700">תמלול עם חותמות זמן</h1>`);
  headerLines.push(`<div style="font-size:12px;color:#444">קובץ: ${escapeHtml(meta.filename)}</div>`);
  if (meta.recordedAt) headerLines.push(`<div style="font-size:12px;color:#444">תאריך: ${escapeHtml(new Date(meta.recordedAt).toLocaleString("he-IL"))}</div>`);
  if (meta.context) headerLines.push(`<div style="font-size:12px;color:#444">${escapeHtml(meta.context)}</div>`);
  if (meta.client) headerLines.push(`<div style="font-size:12px;color:#444">לקוח: ${escapeHtml(meta.client)}</div>`);
  headerLines.push(`<hr style="border:none;border-top:1px solid #ccc;margin:12px 0"/>`);

  const rows = segments.map((seg) => `
    <tr>
      <td style="vertical-align:top;padding:4px 6px;width:80px;font-family:monospace;color:#0a66c2;white-space:nowrap;border-bottom:1px solid #eee">[${fmt(seg.start)}]</td>
      <td style="vertical-align:top;padding:4px 6px;border-bottom:1px solid #eee">${escapeHtml(seg.text || "")}</td>
    </tr>
  `).join("");

  const html = `
    ${headerLines.join("")}
    <table style="width:100%;border-collapse:collapse;font-size:13px" dir="rtl">
      <thead>
        <tr>
          <th style="text-align:right;padding:6px;background:#f3f4f6;border-bottom:2px solid #ddd;width:80px">זמן</th>
          <th style="text-align:right;padding:6px;background:#f3f4f6;border-bottom:2px solid #ddd">טקסט</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;

  await htmlToPdf(html, `transcript-${safeName(meta.filename)}.pdf`);
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
