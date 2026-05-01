import { useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { WorkspaceKind } from "./useWorkspaceFolder";

export interface SyncResult {
  added: number;
  existing: number;
  total: number;
  folderName?: string;
}

export function useDriveSync(workspace: WorkspaceKind) {
  const [syncing, setSyncing] = useState(false);
  const [lastResult, setLastResult] = useState<SyncResult | null>(null);

  const sync = useCallback(async (): Promise<SyncResult | null> => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("drive-sync", {
        body: { workspace },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let msg = error.message;
        if (ctx?.json) {
          try {
            const body = await ctx.json();
            msg = body?.error || msg;
          } catch {}
        }
        throw new Error(msg);
      }
      const result = data as SyncResult;
      setLastResult(result);
      if (result.added > 0) {
        toast.success(`סנכרון הושלם: ${result.added} הקלטות חדשות`, {
          description: `סה"כ בתיקייה: ${result.total} (${result.existing} כבר קיימות)`,
        });
      } else {
        toast.info("הסנכרון הושלם", {
          description: `אין קבצים חדשים. סה"כ בתיקייה: ${result.total}`,
        });
      }
      return result;
    } catch (e) {
      toast.error("שגיאה בסנכרון", {
        description: e instanceof Error ? e.message : undefined,
      });
      return null;
    } finally {
      setSyncing(false);
    }
  }, [workspace]);

  return { sync, syncing, lastResult };
}
