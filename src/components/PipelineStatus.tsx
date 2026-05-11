import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { PIPELINE_STAGES, pipelineStageIndex } from "@/lib/autoPipeline";
import { cn } from "@/lib/utils";

interface Props {
  status?: string | null;
  className?: string;
  compact?: boolean;
}

/**
 * Compact pipeline progress bar:
 * uploaded → transcribed → summary → tasks
 */
export function PipelineStatus({ status, className, compact }: Props) {
  const current = pipelineStageIndex(status);
  // Hide noise: only show 4 milestone stages
  const milestones = [
    { key: "uploaded", label: "הועלה" },
    { key: "transcribed", label: "תומלל" },
    { key: "summarizing", label: "סיכום" },
    { key: "tasks_ready", label: "משימות" },
  ];
  const activeIdx = (() => {
    if (current >= pipelineStageIndex("tasks_ready")) return 3;
    if (current >= pipelineStageIndex("summarizing")) return 2;
    if (current >= pipelineStageIndex("transcribed")) return 1;
    return 0;
  })();
  const inProgress = status === "transcribing" || status === "summarizing" || status === "extracting";

  return (
    <div className={cn("flex items-center gap-1.5 text-xs", className)}>
      {milestones.map((m, i) => {
        const done = i <= activeIdx;
        const isCurrent = i === activeIdx && inProgress;
        return (
          <div key={m.key} className="flex items-center gap-1.5">
            {isCurrent ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
            ) : done ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-green-600 dark:text-green-500" />
            ) : (
              <Circle className="h-3.5 w-3.5 text-muted-foreground/40" />
            )}
            {!compact && (
              <span className={cn("text-[11px]", done ? "text-foreground" : "text-muted-foreground")}>
                {m.label}
              </span>
            )}
            {i < milestones.length - 1 && (
              <span className={cn("h-px w-3", done ? "bg-green-600/60" : "bg-muted-foreground/30")} />
            )}
          </div>
        );
      })}
    </div>
  );
}
