import { AppraisalCase, CaseStatus, CaseType } from "@/data/sampleCases";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar, MapPin, User, Mic, Image as ImageIcon, FileText, FolderOpen } from "lucide-react";
import { cn } from "@/lib/utils";

const statusConfig: Record<CaseStatus, { label: string; className: string }> = {
  active: { label: "פעיל", className: "bg-primary/10 text-primary border-primary/20" },
  pending: { label: "ממתין", className: "bg-warning/10 text-warning-foreground border-warning/30" },
  completed: { label: "הושלם", className: "bg-success/10 text-success border-success/20" },
  archived: { label: "ארכיון", className: "bg-muted text-muted-foreground border-border" },
};

const typeConfig: Record<CaseType, string> = {
  property: "נדל\"ן",
  vehicle: "רכב",
  damage: "נזקים",
  other: "אחר",
};

interface CaseCardProps {
  appraisalCase: AppraisalCase;
  onClick?: () => void;
  selected?: boolean;
}

export function CaseCard({ appraisalCase, onClick, selected }: CaseCardProps) {
  const status = statusConfig[appraisalCase.status];
  const date = new Date(appraisalCase.updatedAt).toLocaleDateString("he-IL");
  const pendingTranscripts = appraisalCase.recordings.filter(
    (r) => r.transcriptStatus === "pending" || r.transcriptStatus === "processing"
  ).length;

  return (
    <Card
      onClick={onClick}
      className={cn(
        "cursor-pointer p-4 transition-all hover:shadow-md hover:border-primary/30",
        selected && "border-primary ring-2 ring-primary/20 shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-mono text-muted-foreground">#{appraisalCase.caseNumber}</span>
            <Badge variant="outline" className="text-xs">{typeConfig[appraisalCase.type]}</Badge>
          </div>
          <h3 className="font-semibold text-foreground truncate">{appraisalCase.title}</h3>
        </div>
        <Badge className={cn("border", status.className)}>{status.label}</Badge>
      </div>

      <div className="space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <User className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{appraisalCase.clientName}</span>
        </div>
        {appraisalCase.address && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{appraisalCase.address}</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <Calendar className="h-3.5 w-3.5 shrink-0" />
          <span>עודכן: {date}</span>
        </div>
      </div>

      <div className="mt-3 pt-3 border-t border-border flex items-center gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1">
          <Mic className="h-3.5 w-3.5" />
          <span>{appraisalCase.recordings.length}</span>
          {pendingTranscripts > 0 && (
            <Badge variant="secondary" className="text-xs h-4 px-1 mr-1 bg-warning/20 text-warning-foreground">
              {pendingTranscripts}
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <ImageIcon className="h-3.5 w-3.5" />
          <span>{appraisalCase.photos.length}</span>
        </div>
        <div className="flex items-center gap-1">
          <FileText className="h-3.5 w-3.5" />
          <span>{appraisalCase.notes.length}</span>
        </div>
        {appraisalCase.estimatedValue && (
          <div className="font-semibold text-foreground">
            ₪{appraisalCase.estimatedValue.toLocaleString("he-IL")}
          </div>
        )}
        {appraisalCase.driveFolderUrl && (
          <a
            href={appraisalCase.driveFolderUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="mr-auto inline-flex items-center gap-1 text-primary hover:underline"
            title="פתח תיקייה ב-Drive"
          >
            <FolderOpen className="h-3.5 w-3.5" />
            Drive
          </a>
        )}
      </div>
    </Card>
  );
}
