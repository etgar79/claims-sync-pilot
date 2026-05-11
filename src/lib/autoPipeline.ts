import { supabase } from "@/integrations/supabase/client";

export type PipelineTable = "recordings" | "meeting_recordings";
export type WorkspaceKind = "appraiser" | "architect" | "transcriber";

/**
 * Fire-and-forget: triggers the auto-pipeline (summary → extract tasks).
 * Safe to call from any place that has just saved a transcript.
 * Errors are swallowed (logged to console) so the UI flow is never blocked.
 */
export function triggerAutoPipeline(args: {
  recordingId: string;
  table: PipelineTable;
  workspaceKind: WorkspaceKind;
}) {
  const { recordingId, table, workspaceKind } = args;
  // intentionally not awaited
  supabase.functions
    .invoke("auto-pipeline", {
      body: { recording_id: recordingId, table, workspace_kind: workspaceKind },
    })
    .then(({ error }) => {
      if (error) console.warn("[auto-pipeline]", error.message);
    })
    .catch((e) => console.warn("[auto-pipeline]", e));
}

export const PIPELINE_STAGES = [
  { key: "uploaded", label: "הועלה" },
  { key: "transcribing", label: "מתמלל" },
  { key: "transcribed", label: "תומלל" },
  { key: "summarizing", label: "מסכם" },
  { key: "extracting", label: "מחלץ משימות" },
  { key: "tasks_ready", label: "מוכן" },
] as const;

export function pipelineStageIndex(status?: string | null): number {
  const i = PIPELINE_STAGES.findIndex((s) => s.key === status);
  return i < 0 ? 0 : i;
}
