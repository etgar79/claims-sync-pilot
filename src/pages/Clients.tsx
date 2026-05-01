import { useMemo, useState } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Search, Users, Phone, FolderOpen, TrendingUp, Calendar, Loader2, ArrowLeft, Cloud, ExternalLink } from "lucide-react";
import { useCases } from "@/hooks/useCases";
import { useWorkFolder } from "@/hooks/useWorkFolder";
import { CaseCard } from "@/components/CaseCard";
import { CaseDetail } from "@/components/CaseDetail";
import { toast } from "sonner";

interface ClientGroup {
  name: string;
  phone?: string;
  caseCount: number;
  totalValue: number;
  lastCaseDate: string;
  driveFolderUrl?: string;
  cases: ReturnType<typeof useCases>["cases"];
}

const Clients = () => {
  const { cases, loading, reload } = useCases();
  const { folderUrl: workFolderUrl, folder: workFolder } = useWorkFolder();
  const [search, setSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientGroup | null>(null);
  const [selectedCaseId, setSelectedCaseId] = useState<string | null>(null);

  const clients = useMemo<ClientGroup[]>(() => {
    const map = new Map<string, ClientGroup>();
    for (const c of cases) {
      const key = c.clientName.trim();
      if (!key) continue;
      const existing = map.get(key);
      if (existing) {
        existing.cases.push(c);
        existing.caseCount += 1;
        existing.totalValue += c.estimatedValue ?? 0;
        if (new Date(c.createdAt) > new Date(existing.lastCaseDate)) {
          existing.lastCaseDate = c.createdAt;
        }
        if (!existing.phone && c.clientPhone) existing.phone = c.clientPhone;
        if (!existing.driveFolderUrl && c.driveFolderUrl) existing.driveFolderUrl = c.driveFolderUrl;
      } else {
        map.set(key, {
          name: key,
          phone: c.clientPhone,
          caseCount: 1,
          totalValue: c.estimatedValue ?? 0,
          lastCaseDate: c.createdAt,
          driveFolderUrl: c.driveFolderUrl,
          cases: [c],
        });
      }
    }
    return Array.from(map.values()).sort((a, b) => b.caseCount - a.caseCount);
  }, [cases]);

  const filtered = useMemo(() => {
    if (!search) return clients;
    return clients.filter(
      (c) => c.name.includes(search) || c.phone?.includes(search)
    );
  }, [clients, search]);

  const selectedCase = selectedClient?.cases.find((c) => c.id === selectedCaseId) ?? selectedClient?.cases[0];

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1 flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              <h1 className="text-lg font-semibold">לקוחות</h1>
              <Badge variant="secondary">{clients.length}</Badge>
            </div>
            {workFolderUrl ? (
              <Button variant="outline" size="sm" asChild>
                <a href={workFolderUrl} target="_blank" rel="noopener noreferrer" title={workFolder?.folder_name}>
                  <Cloud className="h-4 w-4 ml-2" />
                  תיקיית התוכנה
                  <ExternalLink className="h-3 w-3 mr-2" />
                </a>
              </Button>
            ) : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("בחר תיקיית עבודה בהגדרות → Google Drive")}
              >
                <Cloud className="h-4 w-4 ml-2" />
                תיקיית התוכנה
              </Button>
            )}
          </header>

          <div className="p-4 border-b border-border bg-card">
            <div className="relative max-w-md">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי שם לקוח או טלפון..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pr-9"
              />
            </div>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              {loading ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin" />
                  <p>טוען לקוחות...</p>
                </div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p>לא נמצאו לקוחות</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filtered.map((client) => (
                    <Card
                      key={client.name}
                      className="p-5 cursor-pointer hover:border-primary/50 hover:shadow-md transition-all"
                      onClick={() => {
                        setSelectedClient(client);
                        setSelectedCaseId(client.cases[0]?.id ?? null);
                      }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
                            {client.name.charAt(0)}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold text-foreground truncate">{client.name}</h3>
                            {client.phone && (
                              <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                                <Phone className="h-3 w-3" />
                                <span dir="ltr">{client.phone}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 mt-4 pt-4 border-t border-border">
                        <div className="flex items-center gap-2 text-sm">
                          <FolderOpen className="h-4 w-4 text-muted-foreground" />
                          <div>
                            <div className="text-xs text-muted-foreground">תיקים</div>
                            <div className="font-bold">{client.caseCount}</div>
                          </div>
                        </div>
                        {client.totalValue > 0 && (
                          <div className="flex items-center gap-2 text-sm">
                            <TrendingUp className="h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <div className="text-xs text-muted-foreground">סך שווי</div>
                              <div className="font-bold text-primary truncate">
                                ₪{client.totalValue.toLocaleString("he-IL")}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
                        <Calendar className="h-3 w-3" />
                        <span>תיק אחרון: {new Date(client.lastCaseDate).toLocaleDateString("he-IL")}</span>
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </ScrollArea>
        </SidebarInset>
      </div>

      {/* Client cases dialog */}
      <Dialog open={!!selectedClient} onOpenChange={(open) => !open && setSelectedClient(null)}>
        <DialogContent className="max-w-6xl h-[85vh] p-0 flex flex-col">
          <DialogHeader className="px-6 py-4 border-b border-border shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              תיקים של {selectedClient?.name}
              <Badge variant="secondary">{selectedClient?.caseCount}</Badge>
            </DialogTitle>
          </DialogHeader>

          <div className="flex-1 flex overflow-hidden">
            <div className="w-[340px] border-l border-border bg-card flex flex-col shrink-0">
              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {selectedClient?.cases.map((c) => (
                    <CaseCard
                      key={c.id}
                      appraisalCase={c}
                      onClick={() => setSelectedCaseId(c.id)}
                      selected={c.id === selectedCaseId}
                    />
                  ))}
                </div>
              </ScrollArea>
            </div>

            <div className="flex-1 overflow-hidden">
              {selectedCase && (
                <CaseDetail
                  appraisalCase={selectedCase}
                  aiSummary={selectedCase.aiSummary}
                  aiSummaryGeneratedAt={selectedCase.aiSummaryGeneratedAt}
                  onSummaryUpdated={reload}
                />
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
};

export default Clients;
