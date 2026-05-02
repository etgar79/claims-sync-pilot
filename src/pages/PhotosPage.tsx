import { useEffect, useState, useCallback } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Image as ImageIcon, Loader2, RefreshCw, ExternalLink, Settings as SettingsIcon, FolderOpen } from "lucide-react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useWorkspaceFolder, type WorkspaceKind } from "@/hooks/useWorkspaceFolder";

interface DriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  thumbnailLink?: string;
  webViewLink?: string;
}

interface PhotosPageProps {
  workspace: WorkspaceKind;
  title: string;
}

export default function PhotosPage({ workspace, title }: PhotosPageProps) {
  const { folder, folderUrl, loading: folderLoading } = useWorkspaceFolder(workspace, "photos");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!folder) {
      setFiles([]);
      return;
    }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const url = new URL(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/drive-list-files`);
      url.searchParams.set("folderId", folder.folder_id);
      url.searchParams.set("mimeStartsWith", "image/");
      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        },
      });
      const body = await res.json();
      if (!res.ok) {
        toast.error("שגיאה בטעינת תמונות", { description: body.error });
        return;
      }
      setFiles(body.files ?? []);
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => {
    load();
    const id = window.setInterval(() => load(), 120_000);
    return () => window.clearInterval(id);
  }, [load]);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />
        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1 flex items-center gap-2">
              <ImageIcon className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">{title}</h1>
              <Badge variant="secondary">{files.length}</Badge>
            </div>
            <Button size="sm" variant="outline" className="gap-2" onClick={load} disabled={loading || !folder}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              סנכרן עכשיו
            </Button>
          </header>

          <ScrollArea className="flex-1">
            <div className="p-4 space-y-4 max-w-6xl mx-auto">
              {!folder && !folderLoading && (
                <Card className="p-6 flex items-center gap-4">
                  <FolderOpen className="h-8 w-8 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="font-medium">לא הוגדרה תיקיית תמונות</div>
                    <div className="text-sm text-muted-foreground">
                      הגדר ב-Drive תיקייה ייעודית לתמונות, ושייך אותה כאן בהגדרות.
                    </div>
                  </div>
                  <Button asChild size="sm">
                    <Link to="/settings" className="gap-2">
                      <SettingsIcon className="h-4 w-4" />
                      פתח הגדרות
                    </Link>
                  </Button>
                </Card>
              )}

              {folder && (
                <Card className="p-3 flex items-center gap-3 bg-muted/30">
                  <FolderOpen className="h-4 w-4 text-primary" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-muted-foreground">תיקיית תמונות</div>
                    <div className="text-sm font-medium truncate">{folder.folder_name}</div>
                  </div>
                  {folderUrl && (
                    <Button asChild size="sm" variant="ghost">
                      <a href={folderUrl} target="_blank" rel="noreferrer" className="gap-1">
                        פתח ב-Drive <ExternalLink className="h-3 w-3" />
                      </a>
                    </Button>
                  )}
                </Card>
              )}

              {loading && files.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  טוען תמונות...
                </div>
              )}

              {!loading && folder && files.length === 0 && (
                <Card className="p-8 text-center text-muted-foreground">
                  <ImageIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                  אין תמונות בתיקייה.
                </Card>
              )}

              {files.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                  {files.map((f) => (
                    <a
                      key={f.id}
                      href={f.webViewLink ?? "#"}
                      target="_blank"
                      rel="noreferrer"
                      className="group block"
                    >
                      <Card className="overflow-hidden hover:border-primary/60 transition-colors">
                        <div className="aspect-square bg-muted flex items-center justify-center">
                          {f.thumbnailLink ? (
                            <img
                              src={f.thumbnailLink}
                              alt={f.name}
                              className="w-full h-full object-cover"
                              loading="lazy"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <ImageIcon className="h-8 w-8 text-muted-foreground" />
                          )}
                        </div>
                        <div className="p-2">
                          <div className="text-xs font-medium truncate">{f.name}</div>
                          <div className="text-[10px] text-muted-foreground truncate">
                            {f.modifiedTime ? new Date(f.modifiedTime).toLocaleDateString("he-IL") : ""}
                          </div>
                        </div>
                      </Card>
                    </a>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
