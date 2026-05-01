import { Cloud, FolderOpen, RefreshCw, ExternalLink, Settings as SettingsIcon, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useWorkspaceFolder, type WorkspaceKind } from "@/hooks/useWorkspaceFolder";
import { useDriveSync } from "@/hooks/useDriveSync";
import { useDriveConnection } from "@/hooks/useDriveConnection";

interface Props {
  workspace: WorkspaceKind;
  /** Called after a successful sync so the parent can refresh its data */
  onSynced?: () => void;
}

const COPY: Record<WorkspaceKind, { label: string; emptyHint: string }> = {
  appraiser: {
    label: "תיקיית הקלטות שטח",
    emptyHint: "הגדר תיקיית Drive שתסתנכרן עם הקלטות השטח שלך",
  },
  architect: {
    label: "תיקיית הקלטות פגישות",
    emptyHint: "הגדר תיקיית Drive שתסתנכרן עם הקלטות הפגישות שלך",
  },
};

export function WorkspaceFolderBanner({ workspace, onSynced }: Props) {
  const { folder, folderUrl, loading } = useWorkspaceFolder(workspace);
  const { isConnected: driveConnected } = useDriveConnection();
  const { sync, syncing } = useDriveSync(workspace);
  const copy = COPY[workspace];

  if (loading) return null;

  // Not connected to Drive at all
  if (!driveConnected) {
    return (
      <div className="rounded-lg border border-warning/40 bg-warning/5 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <AlertCircle className="h-4 w-4 text-warning shrink-0" />
          <span>חבר את חשבון Google Drive שלך כדי לסנכרן הקלטות מהתיקייה</span>
        </div>
        <Button asChild size="sm" variant="outline" className="gap-2">
          <Link to="/settings">
            <SettingsIcon className="h-3.5 w-3.5" />
            עבור להגדרות
          </Link>
        </Button>
      </div>
    );
  }

  // Connected but no folder set
  if (!folder) {
    return (
      <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm">
          <FolderOpen className="h-4 w-4 text-primary shrink-0" />
          <span>{copy.emptyHint}</span>
        </div>
        <Button asChild size="sm" className="gap-2">
          <Link to="/settings">
            <SettingsIcon className="h-3.5 w-3.5" />
            הגדר תיקייה
          </Link>
        </Button>
      </div>
    );
  }

  const handleSync = async () => {
    const r = await sync();
    if (r && onSynced) onSynced();
  };

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-2 text-sm min-w-0">
        <Cloud className="h-4 w-4 text-primary shrink-0" />
        <span className="text-muted-foreground shrink-0">{copy.label}:</span>
        <span className="font-medium truncate" title={folder.folder_name}>{folder.folder_name}</span>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-2">
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "מסנכרן..." : "סנכרן עכשיו"}
        </Button>
        {folderUrl && (
          <Button asChild size="sm" variant="outline" className="gap-2">
            <a href={folderUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              פתח ב-Drive
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to="/settings">שנה</Link>
        </Button>
      </div>
    </div>
  );
}
