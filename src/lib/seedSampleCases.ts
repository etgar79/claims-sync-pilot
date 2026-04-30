import { supabase } from "@/integrations/supabase/client";
import { SAMPLE_CASES } from "@/data/sampleCases";

export async function seedSampleCases(userId: string) {
  // Check if user already has cases
  const { count } = await supabase
    .from("cases")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if ((count ?? 0) > 0) return false;

  for (const c of SAMPLE_CASES) {
    const { data: caseRow, error: caseErr } = await supabase
      .from("cases")
      .insert({
        user_id: userId,
        case_number: c.caseNumber,
        title: c.title,
        client_name: c.clientName,
        client_phone: c.clientPhone,
        address: c.address,
        type: c.type,
        status: c.status,
        inspection_date: c.inspectionDate,
        estimated_value: c.estimatedValue,
        drive_folder_url: c.driveFolderUrl,
        tags: c.tags,
      })
      .select("id")
      .single();
    if (caseErr || !caseRow) continue;

    if (c.recordings.length) {
      await supabase.from("recordings").insert(
        c.recordings.map((r) => ({
          case_id: caseRow.id,
          user_id: userId,
          filename: r.filename,
          duration: r.duration,
          recorded_at: r.recordedAt,
          transcript: r.transcript,
          transcript_status: r.transcriptStatus,
          drive_url: r.driveUrl,
        }))
      );
    }
    if (c.photos.length) {
      await supabase.from("photos").insert(
        c.photos.map((p) => ({
          case_id: caseRow.id,
          user_id: userId,
          url: p.url,
          caption: p.caption,
          source: p.source,
          uploaded_at: p.uploadedAt,
        }))
      );
    }
    if (c.notes.length) {
      await supabase.from("notes").insert(
        c.notes.map((n) => ({
          case_id: caseRow.id,
          user_id: userId,
          content: n.content,
          created_at: n.createdAt,
        }))
      );
    }
  }
  return true;
}
