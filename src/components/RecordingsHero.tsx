import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock } from "lucide-react";
import { useUserRoles } from "@/hooks/useUserRoles";

interface Item {
  transcript: string | null;
}

interface Props {
  title: string;
  items: Item[];
  subjectLabel?: string; // e.g. "ההקלטות"
}

export function RecordingsHero({ title, items, subjectLabel = "ההקלטות" }: Props) {
  const { displayName, email } = useUserRoles();
  const userLabel = displayName || (email ? email.split("@")[0] : "");

  const stats = useMemo(() => {
    const ready = items.filter((i) => !!i.transcript).length;
    const pending = items.length - ready;
    const totalWords = items.reduce(
      (s, i) => s + (i.transcript ? i.transcript.trim().split(/\s+/).length : 0),
      0,
    );
    return { total: items.length, ready, pending, totalWords };
  }, [items]);

  return (
    <div className="rounded-2xl border bg-gradient-to-l from-primary/5 via-card to-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground mb-1">
            {userLabel ? `${subjectLabel} של ${userLabel}` : title}
          </div>
          <h2 className="text-xl md:text-2xl font-bold leading-tight">
            {stats.total === 0
              ? `עוד אין ${subjectLabel.replace("ה", "")}`
              : `${stats.ready} מוכנים מתוך ${stats.total}`}
          </h2>
          {stats.total > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {stats.totalWords.toLocaleString("he-IL")} מילים תמללת עד היום
            </p>
          )}
        </div>
        <div className="flex gap-2 flex-wrap">
          <Badge
            variant="outline"
            className="gap-1.5 text-xs py-1 px-2.5 bg-green-500/5 border-green-500/30 text-green-700"
          >
            <CheckCircle2 className="h-3 w-3" /> {stats.ready} מוכנים
          </Badge>
          <Badge
            variant="outline"
            className="gap-1.5 text-xs py-1 px-2.5 bg-amber-500/5 border-amber-500/30 text-amber-700"
          >
            <Clock className="h-3 w-3" /> {stats.pending} ממתינים
          </Badge>
        </div>
      </div>
    </div>
  );
}
