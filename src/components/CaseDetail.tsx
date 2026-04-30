import { AppraisalCase, Recording } from "@/data/sampleCases";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Calendar, MapPin, User, Phone, ExternalLink, Mic, Image as ImageIcon, FileText, Play, Loader2, CheckCircle2, Clock, Mail, FolderOpen, Cloud } from "lucide-react";
import { cn } from "@/lib/utils";

interface CaseDetailProps {
  appraisalCase: AppraisalCase;
}

const transcriptStatusConfig = {
  pending: { label: "ממתין לתמלול", icon: Clock, className: "text-muted-foreground" },
  processing: { label: "מתמלל...", icon: Loader2, className: "text-primary animate-spin" },
  completed: { label: "תומלל", icon: CheckCircle2, className: "text-success" },
  failed: { label: "נכשל", icon: Clock, className: "text-destructive" },
};

const sourceIcons = {
  drive: Cloud,
  email: Mail,
  manual: FolderOpen,
};

export function CaseDetail({ appraisalCase }: CaseDetailProps) {
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="border-b border-border p-6 bg-card">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-sm font-mono text-muted-foreground">#{appraisalCase.caseNumber}</span>
              {appraisalCase.tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
            </div>
            <h1 className="text-2xl font-bold text-foreground">{appraisalCase.title}</h1>
          </div>
          {appraisalCase.driveFolderUrl && (
            <Button variant="outline" size="sm" asChild>
              <a href={appraisalCase.driveFolderUrl} target="_blank" rel="noopener noreferrer">
                <Cloud className="h-4 w-4 ml-2" />
                פתח ב-Drive
                <ExternalLink className="h-3 w-3 mr-2" />
              </a>
            </Button>
          )}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{appraisalCase.clientName}</span>
          </div>
          {appraisalCase.clientPhone && (
            <div className="flex items-center gap-2">
              <Phone className="h-4 w-4 text-muted-foreground" />
              <span dir="ltr">{appraisalCase.clientPhone}</span>
            </div>
          )}
          {appraisalCase.address && (
            <div className="flex items-center gap-2">
              <MapPin className="h-4 w-4 text-muted-foreground" />
              <span>{appraisalCase.address}</span>
            </div>
          )}
          {appraisalCase.inspectionDate && (
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span>ביקור: {new Date(appraisalCase.inspectionDate).toLocaleDateString("he-IL")}</span>
            </div>
          )}
        </div>

        {appraisalCase.estimatedValue && (
          <div className="mt-4 inline-flex items-center gap-2 bg-primary/5 border border-primary/20 rounded-lg px-4 py-2">
            <span className="text-sm text-muted-foreground">הערכת שווי:</span>
            <span className="text-lg font-bold text-primary">
              ₪{appraisalCase.estimatedValue.toLocaleString("he-IL")}
            </span>
          </div>
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="recordings" className="flex-1 flex flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-6">
          <TabsList className="bg-transparent h-12 p-0 gap-2">
            <TabsTrigger value="recordings" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <Mic className="h-4 w-4 ml-2" />
              הקלטות ({appraisalCase.recordings.length})
            </TabsTrigger>
            <TabsTrigger value="photos" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <ImageIcon className="h-4 w-4 ml-2" />
              תמונות ({appraisalCase.photos.length})
            </TabsTrigger>
            <TabsTrigger value="notes" className="data-[state=active]:bg-primary/10 data-[state=active]:text-primary">
              <FileText className="h-4 w-4 ml-2" />
              הערות ({appraisalCase.notes.length})
            </TabsTrigger>
          </TabsList>
        </div>

        <ScrollArea className="flex-1">
          <TabsContent value="recordings" className="p-6 m-0 space-y-3">
            {appraisalCase.recordings.length === 0 ? (
              <EmptyState icon={Mic} message="אין הקלטות בתיק זה" />
            ) : (
              appraisalCase.recordings.map((rec) => <RecordingCard key={rec.id} recording={rec} />)
            )}
          </TabsContent>

          <TabsContent value="photos" className="p-6 m-0">
            {appraisalCase.photos.length === 0 ? (
              <EmptyState icon={ImageIcon} message="אין תמונות בתיק זה" />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {appraisalCase.photos.map((photo) => {
                  const SourceIcon = sourceIcons[photo.source];
                  return (
                    <Card key={photo.id} className="overflow-hidden group cursor-pointer">
                      <div className="aspect-square overflow-hidden bg-muted relative">
                        <img
                          src={photo.url}
                          alt={photo.caption || "תמונת תיק"}
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                          loading="lazy"
                        />
                        <div className="absolute top-2 right-2 bg-background/90 backdrop-blur-sm rounded-md p-1">
                          <SourceIcon className="h-3.5 w-3.5 text-muted-foreground" />
                        </div>
                      </div>
                      {photo.caption && (
                        <div className="p-2 text-sm font-medium truncate">{photo.caption}</div>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="notes" className="p-6 m-0 space-y-3">
            {appraisalCase.notes.length === 0 ? (
              <EmptyState icon={FileText} message="אין הערות בתיק זה" />
            ) : (
              appraisalCase.notes.map((note) => (
                <Card key={note.id} className="p-4">
                  <p className="text-foreground leading-relaxed whitespace-pre-wrap">{note.content}</p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {new Date(note.createdAt).toLocaleString("he-IL")}
                  </p>
                </Card>
              ))
            )}
          </TabsContent>
        </ScrollArea>
      </Tabs>
    </div>
  );
}

function RecordingCard({ recording }: { recording: Recording }) {
  const status = transcriptStatusConfig[recording.transcriptStatus];
  const StatusIcon = status.icon;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <Button size="icon" variant="outline" className="shrink-0 rounded-full h-10 w-10">
            <Play className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{recording.filename}</div>
            <div className="text-sm text-muted-foreground flex items-center gap-3 mt-0.5">
              <span>{recording.duration}</span>
              <span>•</span>
              <span>{new Date(recording.recordedAt).toLocaleString("he-IL")}</span>
            </div>
          </div>
        </div>
        <div className={cn("flex items-center gap-1.5 text-xs font-medium shrink-0", status.className)}>
          <StatusIcon className="h-3.5 w-3.5" />
          <span>{status.label}</span>
        </div>
      </div>

      {recording.transcript && (
        <div className="mt-3 p-3 bg-muted/50 rounded-md border border-border">
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">
            {recording.transcript}
          </p>
        </div>
      )}

      {recording.transcriptStatus === "pending" && (
        <Button size="sm" variant="default" className="mt-3">
          <Mic className="h-3.5 w-3.5 ml-2" />
          תמלל עכשיו
        </Button>
      )}
    </Card>
  );
}

function EmptyState({ icon: Icon, message }: { icon: any; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
      <Icon className="h-12 w-12 mb-3 opacity-30" />
      <p>{message}</p>
    </div>
  );
}
