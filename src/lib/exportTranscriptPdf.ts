import jsPDF from "jspdf";
import html2canvas from "html2canvas";

export interface TranscriptPdfMeta {
  filename: string;
  recordedAt?: string | null;
  context?: string | null;
  client?: string | null;
}

function safeName(filename: string) {
  return filename.replace(/\.[^.]+$/, "").replace(/[^\w\u0590-\u05FF\-_. ]+/g, "_");
}

/** Render HTML to a multi-page A4 PDF (handles Hebrew/RTL via browser fonts). */
export async function htmlToPdf(html: string, downloadName: string) {
  const container = document.createElement("div");
  container.style.position = "fixed";
  container.style.left = "-10000px";
  container.style.top = "0";
  container.style.width = "794px"; // ~A4 @ 96dpi
  container.style.background = "#ffffff";
  container.style.color = "#000000";
  container.style.padding = "40px";
  container.style.fontFamily = "Arial, 'Segoe UI', Tahoma, sans-serif";
  container.style.fontSize = "14px";
  container.style.lineHeight = "1.6";
  container.setAttribute("dir", "rtl");
  container.innerHTML = html;
  document.body.appendChild(container);

  try {
    const canvas = await html2canvas(container, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pageWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const imgData = canvas.toDataURL("image/jpeg", 0.92);

    let heightLeft = imgHeight;
    let position = 0;
    pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
    heightLeft -= pageHeight;
    while (heightLeft > 0) {
      position = heightLeft - imgHeight;
      pdf.addPage();
      pdf.addImage(imgData, "JPEG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
    }
    pdf.save(downloadName);
  } finally {
    document.body.removeChild(container);
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}

export async function exportTranscriptToPdf(transcript: string, meta: TranscriptPdfMeta) {
  const lines: string[] = [];
  lines.push(`<h1 style="font-size:22px;margin:0 0 8px;font-weight:700">תמלול</h1>`);
  lines.push(`<div style="font-size:12px;color:#444">קובץ: ${escapeHtml(meta.filename)}</div>`);
  if (meta.recordedAt) lines.push(`<div style="font-size:12px;color:#444">תאריך: ${escapeHtml(new Date(meta.recordedAt).toLocaleString("he-IL"))}</div>`);
  if (meta.context) lines.push(`<div style="font-size:12px;color:#444">${escapeHtml(meta.context)}</div>`);
  if (meta.client) lines.push(`<div style="font-size:12px;color:#444">לקוח: ${escapeHtml(meta.client)}</div>`);
  lines.push(`<hr style="border:none;border-top:1px solid #ccc;margin:12px 0"/>`);
  const paragraphs = transcript.split(/\n\s*\n/);
  for (const para of paragraphs) {
    const inner = para.split("\n").map(escapeHtml).join("<br/>");
    lines.push(`<p style="margin:0 0 10px;white-space:pre-wrap">${inner}</p>`);
  }
  await htmlToPdf(lines.join(""), `transcript-${safeName(meta.filename)}.pdf`);
}

export function downloadTranscriptTxt(transcript: string, filename: string) {
  const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `transcript-${safeName(filename)}.txt`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
