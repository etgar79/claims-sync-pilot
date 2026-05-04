import type { ReactNode } from "react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Mic, Loader2, Clock, AlertCircle, CheckCircle2, Cloud,
  Eye, Download, FileDown, Pencil, Sparkles, Zap, Tag, ExternalLink, Copy, RefreshCw, Check, X,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { exportTranscriptToPdf, downloadTranscriptTxt } from "@/lib/exportTranscriptPdf";

const STATUS = {
  pending: { label: "ממתין", icon: Clock, cls: "bg-muted text-muted-foreground border-border" },
  processing: { label: "מתמלל", icon: Loader2, cls: "bg-primary/10 text-primary border-primary/30" },
  completed: { label: "מוכן", icon: CheckCircle2, cls: "bg-green-500/10 text-green-700 border-green-500/30" },
  failed: { label: "נכשל", icon: AlertCircle, cls: "bg-destructive/10 text-destructive border-destructive/30" },
} as const;

export interface RecordingCardData {
  id: string;
  filename: string;
  duration: string | null;
  recorded_at: string;
  transcript_status: string;
  transcript: string | null;
  drive_url: string | null;
  drive_file_id?: string | null;
  source: string | null;
  // appraiser-only
  case_id?: string | null;
  case_number?: string;
  case_title?: string;
  client_name?: string;
  // architect-only
  meeting_id?: string | null;
  meeting_title?: string;
}

interface Props {
  data: RecordingCardData;
  isRunning: boolean;
  workspace: "appraiser" | "architect";
  table?: "recordings" | "meeting_recordings";
  onView: () => void;
  onEdit: () => void;
  onAssign: () => void;
  onSuperTranscribe: () => void;
  onQuickTranscribe: () => void;
  onRenamed?: () => void;
  expanded?: boolean;
  expandedSlot?: ReactNode;
}

export function RecordingCard({
  data: r, isRunning, workspace, table, onView, onEdit, onAssign, onSuperTranscribe, onQuickTranscribe, onRenamed,
  expanded, expandedSlot,
}: Props) {
  const st = STATUS[r.transcript_status as keyof typeof STATUS] ?? STATUS.pending;
  const Icon = st.icon;
  const hasTranscript = !!r.transcript;
  const tableName: "recordings" | "meeting_recordings" =
    table ?? (workspace === "appraiser" ? "recordings" : "meeting_recordings");

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(r.filename);
  const [renaming, setRenaming] = useState(false);

  const startRename = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNameDraft(r.filename);
    setEditingName(true);
  };

  const cancelRename = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingName(false);
    setNameDraft(r.filename);
  };

  const saveRename = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    const newName = nameDraft.trim();
    if (!newName) { toast.info("שם הקובץ לא יכול להיות ריק"); return; }
    if (newName === r.filename) { setEditingName(false); return; }
    setRenaming(true);
    try {
      const { error } = await supabase.from(tableName).update({ filename: newName }).eq("id", r.id);
      if (error) throw error;
      let driveWarning = false;
      if (r.drive_file_id) {
        try {
          const { data: sess } = await supabase.auth.getSession();
          const token = sess.session?.access_token;
          if (token) {
            const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/google-drive-api`;
            const res = await fetch(url, {
              method: "POST",
              headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
              body: JSON.stringify({ action: "rename_file", fileId: r.drive_file_id, newName }),
            });
            if (!res.ok) driveWarning = true;
          }
        } catch { driveWarning = true; }
      }
      toast.success(driveWarning ? "השם עודכן במערכת (לא ב-Drive)" : "שם הקובץ עודכן");
      setEditingName(false);
      onRenamed?.();
    } catch (err: any) {
      toast.error("שגיאה בשינוי שם", { description: err?.message });
    } finally {
      setRenaming(false);
    }
  };

  const buildContext = () => {
    if (workspace === "appraiser" && r.case_number) return `תיק ${r.case_number} • ${r.case_title ?? ""}`;
    if (workspace === "architect" && r.meeting_title) return `פגישה: ${r.meeting_title}`;
    return null;
  };

  const downloadPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.transcript) return;
    exportTranscriptToPdf(r.transcript, {
      filename: r.filename,
      recordedAt: r.recorded_at,
      context: buildContext(),
      client: r.client_name ?? null,
    });
    toast.success("PDF ירד");
  };

  const downloadTxt = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.transcript) return;
    downloadTranscriptTxt(r.transcript, r.filename);
    toast.success("TXT ירד");
  };

  const copyText = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!r.transcript) return;
    try {
      await navigator.clipboard.writeText(r.transcript);
      toast.success("הועתק ללוח");
    } catch { toast.error("שגיאה בהעתקה"); }
  };

  const linkChip = workspace === "appraiser"
    ? (r.case_id && r.case_number
        ? <Link to={`/cases?id=${r.case_id}`} onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
            תיק {r.case_number}
          </Link>
        : <span className="text-warning text-xs font-medium">לא משויך</span>)
    : (r.meeting_id && r.meeting_title
        ? <Link to={`/meetings/${r.meeting_id}`} onClick={(e) => e.stopPropagation()}
                className="text-primary hover:underline inline-flex items-center gap-1 text-xs">
            פגישה: {r.meeting_title}
          </Link>
        : <span className="text-warning text-xs font-medium">לא משויך</span>);

  return (
    <TooltipProvider delayDuration={200}>
      <Card
        onClick={hasTranscript && !expanded ? onView : undefined}
        className={`group relative overflow-hidden border-border/60 hover:border-primary/40 hover:shadow-lg hover:shadow-primary/5 transition-all duration-200 ${hasTranscript && !expanded ? "cursor-pointer" : ""} ${expanded ? "border-primary/40 shadow-md shadow-primary/10" : ""}`}
      >
        {/* Status accent bar */}
        <div className={`absolute top-0 right-0 left-0 h-0.5 ${
          r.transcript_status === "completed" ? "bg-gradient-to-l from-green-400 to-green-600" :
          r.transcript_status === "processing" || isRunning ? "bg-gradient-to-l from-primary/60 to-primary" :
          r.transcript_status === "failed" ? "bg-gradient-to-l from-destructive/60 to-destructive" :
          "bg-gradient-to-l from-muted-foreground/20 to-muted-foreground/40"
        }`} />

        <div className="p-4 flex items-start gap-3">
          {/* Avatar */}
          <div className={`h-11 w-11 rounded-xl flex items-center justify-center shrink-0 transition-all ${
            hasTranscript
              ? "bg-gradient-to-br from-primary/15 to-primary/5 group-hover:from-primary/25 group-hover:to-primary/10"
              : "bg-muted group-hover:bg-muted/70"
          }`}>
            <Mic className={`h-5 w-5 ${hasTranscript ? "text-primary" : "text-muted-foreground"}`} />
          </div>

          {/* Main content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap" onClick={(e) => editingName && e.stopPropagation()}>
              {editingName ? (
                <div className="flex items-center gap-1.5 flex-1 min-w-[180px]">
                  <Input
                    value={nameDraft}
                    onChange={(e) => setNameDraft(e.target.value)}
                    onClick={(e) => e.stopPropagation()}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === "Enter") { e.preventDefault(); void saveRename(); }
                      if (e.key === "Escape") { cancelRename(); }
                    }}
                    autoFocus
                    className="h-7 text-sm"
                  />
                  <Button size="icon" variant="ghost" className="h-7 w-7" disabled={renaming} onClick={saveRename}>
                    {renaming ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                  </Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={cancelRename}>
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <>
                  <h3 className="font-semibold text-sm truncate">{r.filename}</h3>
                  <Tooltip><TooltipTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" onClick={startRename}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                  </TooltipTrigger><TooltipContent>שנה שם קובץ</TooltipContent></Tooltip>
                </>
              )}
              <Badge variant="outline" className={`gap-1 text-[10px] py-0 h-5 ${st.cls}`}>
                <Icon className={`h-3 w-3 ${r.transcript_status === "processing" || isRunning ? "animate-spin" : ""}`} />
                {isRunning ? "מתמלל..." : st.label}
              </Badge>
              {r.source === "drive_sync" && (
                <Badge variant="outline" className="gap-1 text-[10px] py-0 h-5 bg-blue-50 text-blue-700 border-blue-200">
                  <Cloud className="h-2.5 w-2.5" />
                  Drive
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-3 flex-wrap mt-1.5 text-xs text-muted-foreground">
              {linkChip}
              <span>•</span>
              <span>{new Date(r.recorded_at).toLocaleString("he-IL", { dateStyle: "short", timeStyle: "short" })}</span>
              {r.duration && (<><span>•</span><span>{r.duration}</span></>)}
            </div>

            {hasTranscript && (
              <p className="text-xs text-muted-foreground/80 mt-2 line-clamp-2 leading-relaxed">
                {r.transcript!.slice(0, 200)}{r.transcript!.length > 200 ? "…" : ""}
              </p>
            )}
          </div>
        </div>

        {/* Action bar — flat, all options visible */}
        <div className="border-t border-border/40 bg-muted/20 px-2 py-1.5 flex items-center gap-0.5 flex-wrap" onClick={(e) => e.stopPropagation()}>
          {hasTranscript ? (
            <>
              <Tooltip><TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={onView} className="h-8 gap-1.5 text-xs">
                  <Eye className="h-3.5 w-3.5" /> צפה
                </Button>
              </TooltipTrigger><TooltipContent>פתח תמלול במסך מלא</TooltipContent></Tooltip>

              <Tooltip><TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={onEdit} className="h-8 gap-1.5 text-xs">
                  <Pencil className="h-3.5 w-3.5" /> ערוך
                </Button>
              </TooltipTrigger><TooltipContent>עריכה ידנית של התמלול</TooltipContent></Tooltip>

              <div className="h-4 w-px bg-border mx-0.5" />

              <Tooltip><TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={downloadPdf} className="h-8 gap-1.5 text-xs">
                  <Download className="h-3.5 w-3.5" /> PDF
                </Button>
              </TooltipTrigger><TooltipContent>הורד כ־PDF</TooltipContent></Tooltip>

              <Tooltip><TooltipTrigger asChild>
                <Button size="sm" variant="ghost" onClick={downloadTxt} className="h-8 gap-1.5 text-xs">
                  <FileDown className="h-3.5 w-3.5" /> TXT
                </Button>
              </TooltipTrigger><TooltipContent>הורד כקובץ טקסט</TooltipContent></Tooltip>

              <Tooltip><TooltipTrigger asChild>
                <Button size="icon" variant="ghost" onClick={copyText} className="h-8 w-8">
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger><TooltipContent>העתק ללוח</TooltipContent></Tooltip>
            </>
          ) : (
            <>
              <Button
                size="sm"
                onClick={onSuperTranscribe}
                disabled={isRunning || !r.drive_url}
                className="h-8 gap-1.5 text-xs bg-gradient-to-l from-primary to-primary-glow hover:opacity-90"
              >
                {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
                תמלול-על
              </Button>
              <Button size="sm" variant="ghost" onClick={onQuickTranscribe} disabled={isRunning || !r.drive_url} className="h-8 gap-1.5 text-xs">
                <Zap className="h-3.5 w-3.5" /> מהיר
              </Button>
            </>
          )}

          <div className="flex-1" />

          <Tooltip><TooltipTrigger asChild>
            <Button size="sm" variant="ghost" onClick={onAssign} className="h-8 gap-1.5 text-xs">
              <Tag className="h-3.5 w-3.5" />
              {workspace === "appraiser" ? (r.case_id ? "החלף תיק" : "שייך") : (r.meeting_id ? "החלף" : "שייך")}
            </Button>
          </TooltipTrigger><TooltipContent>{workspace === "appraiser" ? "שייך לתיק" : "שייך לפגישה"}</TooltipContent></Tooltip>

          {hasTranscript && (
            <Tooltip><TooltipTrigger asChild>
              <Button size="sm" variant="ghost" onClick={onSuperTranscribe} disabled={!r.drive_url} className="h-8 gap-1.5 text-xs">
                <RefreshCw className="h-3.5 w-3.5" /> תמלל מחדש
              </Button>
            </TooltipTrigger><TooltipContent>הפק תמלול-על מחדש</TooltipContent></Tooltip>
          )}

          {r.drive_url && (
            <Tooltip><TooltipTrigger asChild>
              <Button size="icon" variant="ghost" asChild className="h-8 w-8">
                <a href={r.drive_url} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              </Button>
            </TooltipTrigger><TooltipContent>פתח ב-Drive</TooltipContent></Tooltip>
          )}
        </div>
        {expanded && expandedSlot && (
          <div onClick={(e) => e.stopPropagation()} className="border-t border-border/40">
            {expandedSlot}
          </div>
        )}
      </Card>
    </TooltipProvider>
  );
}
