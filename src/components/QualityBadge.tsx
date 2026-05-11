import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipTrigger, TooltipProvider } from "@/components/ui/tooltip";
import { Sparkles } from "lucide-react";

interface Props {
  score?: number | null;
  notes?: string | null;
  className?: string;
}

export function QualityBadge({ score, notes, className }: Props) {
  if (score == null) return null;
  const tone =
    score >= 85 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30"
    : score >= 65 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
    : "bg-rose-500/15 text-rose-700 dark:text-rose-400 border-rose-500/30";

  const badge = (
    <Badge variant="outline" className={`gap-1 ${tone} ${className ?? ""}`}>
      <Sparkles className="h-3 w-3" />
      איכות {score}
    </Badge>
  );

  if (!notes) return badge;
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild><span>{badge}</span></TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{notes}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
