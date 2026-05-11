import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { AppraisalCase, CaseStatus, CaseType, Recording, Photo, Note } from "@/data/sampleCases";
import { getActAsUserId, useActAsUser } from "@/lib/actAs";

type Row = Record<string, any>;

function mapCase(c: Row, recordings: Row[], photos: Row[], notes: Row[]): AppraisalCase & { aiSummary?: string; aiSummaryGeneratedAt?: string } {
  return {
    id: c.id,
    caseNumber: c.case_number,
    title: c.title,
    clientName: c.client_name,
    clientPhone: c.client_phone ?? undefined,
    address: c.address ?? undefined,
    type: c.type as CaseType,
    status: c.status as CaseStatus,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    inspectionDate: c.inspection_date ?? undefined,
    estimatedValue: c.estimated_value != null ? Number(c.estimated_value) : undefined,
    driveFolderUrl: c.drive_folder_url ?? undefined,
    tags: c.tags ?? [],
    aiSummary: c.ai_summary ?? undefined,
    aiSummaryGeneratedAt: c.ai_summary_generated_at ?? undefined,
    recordings: recordings
      .filter((r) => r.case_id === c.id)
      .map<Recording>((r) => ({
        id: r.id,
        filename: r.filename,
        duration: r.duration ?? "",
        recordedAt: r.recorded_at,
        transcript: r.transcript ?? undefined,
        transcriptStatus: r.transcript_status,
        driveUrl: r.drive_url ?? undefined,
      })),
    photos: photos
      .filter((p) => p.case_id === c.id)
      .map<Photo>((p) => ({
        id: p.id,
        url: p.url,
        caption: p.caption ?? undefined,
        uploadedAt: p.uploaded_at,
        source: p.source,
      })),
    notes: notes
      .filter((n) => n.case_id === c.id)
      .map<Note>((n) => ({
        id: n.id,
        content: n.content,
        createdAt: n.created_at,
      })),
  };
}

export function useCases() {
  const [cases, setCases] = useState<(AppraisalCase & { aiSummary?: string; aiSummaryGeneratedAt?: string })[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const acting = getActAsUserId();
    const cq = supabase.from("cases").select("*").order("updated_at", { ascending: false });
    const rq = supabase.from("recordings").select("*");
    const pq = supabase.from("photos").select("*");
    const nq = supabase.from("notes").select("*");
    const [casesRes, recRes, photoRes, noteRes] = await Promise.all([
      acting ? cq.eq("user_id", acting) : cq,
      acting ? rq.eq("user_id", acting) : rq,
      acting ? pq.eq("user_id", acting) : pq,
      acting ? nq.eq("user_id", acting) : nq,
    ]);
    const list = (casesRes.data ?? []).map((c) =>
      mapCase(c, recRes.data ?? [], photoRes.data ?? [], noteRes.data ?? [])
    );
    setCases(list);
    setLoading(false);
  }, []);

  const { actAsId } = useActAsUser();
  useEffect(() => {
    load();
  }, [load, actAsId]);

  return { cases, loading, reload: load };
}
