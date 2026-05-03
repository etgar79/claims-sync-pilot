import { Cloud, FolderOpen, RefreshCw, ExternalLink, Settings as SettingsIcon, AlertCircle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { useWorkspaceFolder, type WorkspaceKind } from "@/hooks/useWorkspaceFolder";
import { useDriveSync } from "@/hooks/useDriveSync";
import { useDriveConnection } from "@/hooks/useDriveConnection";
import { toast } from "sonner";

interface Props {
  workspace: WorkspaceKind;
  onSynced?: () => void;
}

const COPY: Record<WorkspaceKind, { label: string; emptyHint: string }> = {
  appraiser: {
    label: "הקלטות שטח",
    emptyHint: "הגדר תיקיית Drive שתסתנכרן עם הקלטות השטח שלך",
  },
  architect: {
    label: "הקלטות פגישות",
    emptyHint: "הגדר תיקיית Drive שתסתנכרן עם הקלטות הפגישות שלך",
  },
};

export function WorkspaceFolderBanner({ workspace, onSynced }: Props) {
  const { folder, folderUrl, loading } = useWorkspaceFolder(workspace);
  const { isConnected: driveConnected } = useDriveConnection();
  const { sync, syncing } = useDriveSync(workspace);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const copy = COPY[workspace];

  // Show "last synced N min ago" automatically
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return null;

  // Not connected to Drive at all
  if (!driveConnected) {
    return (
      <div className="rounded-xl border-2 border-amber-300 bg-gradient-to-l from-amber-50 to-orange-50 p-4 flex items-center justify-between gap-3 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
            <AlertCircle className="h-5 w-5 text-amber-700" />
          </div>
          <div>
            <div className="font-semibold text-sm text-amber-900">חיבור ל-Drive נדרש</div>
            <div className="text-xs text-amber-800/80">חברי את חשבון Google Drive שלך כדי לסנכרן הקלטות</div>
          </div>
        </div>
        <Button asChild size="sm" className="gap-2 bg-amber-600 hover:bg-amber-700 text-white">
          <Link to="/settings">
            <SettingsIcon className="h-3.5 w-3.5" />
            חבר עכשיו
          </Link>
        </Button>
      </div>
    );
  }

  if (!folder) {
    return (
      <div className="rounded-xl border-2 border-primary/30 bg-gradient-to-l from-primary/5 to-primary/10 p-4 flex items-center justify-between gap-3 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
            <FolderOpen className="h-5 w-5 text-primary" />
          </div>
          <div>
            <div className="font-semibold text-sm">בחרי תיקיית Drive לסנכרון</div>
            <div className="text-xs text-muted-foreground">{copy.emptyHint}</div>
          </div>
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
    setLastSync(new Date());
    if (r) {
      if (r.added > 0) {
        toast.success(`סונכרנו ${r.added} הקלטות חדשות`);
        onSynced?.();
      } else {
        toast.info("הכל מעודכן", { description: "אין הקלטות חדשות ב-Drive" });
      }
    }
  };

  const lastSyncLabel = lastSync ? (() => {
    const diff = Math.floor((Date.now() - lastSync.getTime()) / 1000);
    if (diff < 60) return "סונכרן עכשיו";
    if (diff < 3600) return `סונכרן לפני ${Math.floor(diff / 60)} דק׳`;
    return `סונכרן לפני ${Math.floor(diff / 3600)} שע׳`;
  })() : "סנכרון אוטומטי כל 2 דק׳";

  return (
    <div className="rounded-xl border bg-gradient-to-l from-card via-card to-primary/[0.03] p-4 flex items-center justify-between gap-3 flex-wrap shadow-sm">
      <div className="flex items-center gap-3 min-w-0">
        <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 relative">
          <Cloud className="h-5 w-5 text-primary" />
          {!syncing && (
            <span className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-green-500 border-2 border-card flex items-center justify-center">
              <CheckCircle2 className="h-2 w-2 text-white" />
            </span>
          )}
          {syncing && (
            <span className="absolute bottom-0 left-0 h-3 w-3 rounded-full bg-primary border-2 border-card animate-pulse" />
          )}
        </div>
        <div className="min-w-0">
          <div className="font-semibold text-sm flex items-center gap-2">
            <span>{copy.label}</span>
            <span className="text-muted-foreground text-xs font-normal">·</span>
            <span className="text-xs text-muted-foreground font-normal truncate" title={folder.folder_name}>
              {folder.folder_name}
            </span>
          </div>
          <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
            {syncing ? (
              <>
                <RefreshCw className="h-3 w-3 animate-spin" />
                <span>מסנכרן מ-Drive...</span>
              </>
            ) : (
              <>
                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                <span>{lastSyncLabel}</span>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <Button size="sm" onClick={handleSync} disabled={syncing} className="gap-2 shadow-sm">
          <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "מסנכרן..." : "סנכרן עכשיו"}
        </Button>
        {folderUrl && (
          <Button asChild size="sm" variant="outline" className="gap-2">
            <a href={folderUrl} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-3.5 w-3.5" />
              פתח Drive
            </a>
          </Button>
        )}
        <Button asChild size="sm" variant="ghost">
          <Link to="/settings">
            <SettingsIcon className="h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
