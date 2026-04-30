import { useState, useMemo } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { CaseCard } from "@/components/CaseCard";
import { CaseDetail } from "@/components/CaseDetail";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SAMPLE_CASES, CaseStatus } from "@/data/sampleCases";
import { Search, Plus, FolderOpen, Mic, Image as ImageIcon, TrendingUp, Cloud } from "lucide-react";

const Index = () => {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<CaseStatus | "all">("all");
  const [selectedId, setSelectedId] = useState<string>(SAMPLE_CASES[0].id);

  const filteredCases = useMemo(() => {
    return SAMPLE_CASES.filter((c) => {
      const matchSearch =
        !search ||
        c.title.includes(search) ||
        c.caseNumber.includes(search) ||
        c.clientName.includes(search) ||
        c.address?.includes(search) ||
        c.tags.some((t) => t.includes(search));
      const matchStatus = statusFilter === "all" || c.status === statusFilter;
      return matchSearch && matchStatus;
    });
  }, [search, statusFilter]);

  const selectedCase = SAMPLE_CASES.find((c) => c.id === selectedId) ?? SAMPLE_CASES[0];

  // Stats
  const stats = useMemo(() => {
    const active = SAMPLE_CASES.filter((c) => c.status === "active").length;
    const pendingTranscripts = SAMPLE_CASES.reduce(
      (sum, c) => sum + c.recordings.filter((r) => r.transcriptStatus === "pending" || r.transcriptStatus === "processing").length,
      0
    );
    const totalPhotos = SAMPLE_CASES.reduce((sum, c) => sum + c.photos.length, 0);
    const openCases = SAMPLE_CASES.filter((c) => c.status === "active" || c.status === "pending").length;
    return { active, pendingTranscripts, totalPhotos, openCases };
  }, []);

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <SidebarInset className="flex flex-col">
          {/* Top bar */}
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-lg font-semibold">דשבורד תיקים</h1>
            </div>
            <Button variant="outline" size="sm" className="gap-2">
              <Cloud className="h-4 w-4" />
              <span className="hidden sm:inline">סנכרן Drive</span>
            </Button>
            <Button size="sm" className="gap-2">
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">תיק חדש</span>
            </Button>
          </header>

          {/* Stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 p-4 bg-gradient-to-b from-muted/30 to-transparent">
            <StatCard icon={FolderOpen} label="תיקים פעילים" value={stats.active.toString()} color="primary" />
            <StatCard icon={Mic} label="ממתין לתמלול" value={stats.pendingTranscripts.toString()} color="warning" />
            <StatCard icon={ImageIcon} label="סך תמונות" value={stats.totalPhotos.toString()} color="accent" />
            <StatCard
              icon={TrendingUp}
              label="תיקים פתוחים"
              value={stats.openCases.toString()}
              color="success"
            />
          </div>

          {/* Main content - two columns */}
          <div className="flex-1 flex overflow-hidden border-t border-border">
            {/* Left: case list */}
            <div className="w-full lg:w-[400px] xl:w-[440px] border-l border-border bg-card flex flex-col shrink-0">
              <div className="p-4 border-b border-border space-y-3">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="חיפוש לפי תיק, לקוח, כתובת..."
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className="pr-9"
                  />
                </div>
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                  <SelectTrigger>
                    <SelectValue placeholder="סנן לפי סטטוס" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">כל הסטטוסים</SelectItem>
                    <SelectItem value="active">פעיל</SelectItem>
                    <SelectItem value="pending">ממתין</SelectItem>
                    <SelectItem value="completed">הושלם</SelectItem>
                    <SelectItem value="archived">ארכיון</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <ScrollArea className="flex-1">
                <div className="p-4 space-y-3">
                  {filteredCases.length === 0 ? (
                    <div className="text-center py-12 text-muted-foreground">
                      <FolderOpen className="h-12 w-12 mx-auto mb-3 opacity-30" />
                      <p>לא נמצאו תיקים</p>
                    </div>
                  ) : (
                    filteredCases.map((c) => (
                      <CaseCard
                        key={c.id}
                        appraisalCase={c}
                        onClick={() => setSelectedId(c.id)}
                        selected={c.id === selectedId}
                      />
                    ))
                  )}
                </div>
              </ScrollArea>
            </div>

            {/* Right: case detail */}
            <div className="flex-1 hidden lg:block overflow-hidden bg-background">
              <CaseDetail appraisalCase={selectedCase} />
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
};

interface StatCardProps {
  icon: any;
  label: string;
  value: string;
  color: "primary" | "warning" | "accent" | "success";
}

function StatCard({ icon: Icon, label, value, color }: StatCardProps) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    warning: "bg-warning/10 text-warning-foreground",
    accent: "bg-accent/10 text-accent-foreground",
    success: "bg-success/10 text-success",
  };

  return (
    <Card className="p-4 flex items-center gap-3">
      <div className={`h-11 w-11 rounded-lg flex items-center justify-center ${colorMap[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="text-xs text-muted-foreground truncate">{label}</div>
        <div className="text-xl font-bold text-foreground">{value}</div>
      </div>
    </Card>
  );
}

export default Index;
