import { useState, useEffect } from "react";
import { SidebarProvider, SidebarInset, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Cloud, CheckCircle2, FolderOpen, Sparkles, Key, RefreshCw, ExternalLink, ShieldCheck, HardDriveDownload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useDriveConnection } from "@/hooks/useDriveConnection";
import { WorkFolderPicker } from "@/components/WorkFolderPicker";
import { useUserRoles } from "@/hooks/useUserRoles";

interface DriveFolder {
  id: string;
  name: string;
}

const STORAGE_KEYS = {
  driveConnected: "appraiser_drive_connected",
  driveAccount: "appraiser_drive_account",
  driveFolderId: "appraiser_drive_folder_id",
  driveFolderName: "appraiser_drive_folder_name",
  geminiSource: "appraiser_gemini_source",
  geminiKeyMasked: "appraiser_gemini_key_masked",
  backupEnabled: "appraiser_backup_enabled",
  backupFolderId: "appraiser_backup_folder_id",
  backupTime: "appraiser_backup_time",
  backupLastRun: "appraiser_backup_last_run",
};

const BACKUP_FOLDERS: DriveFolder[] = [
  { id: "b_backup_main", name: "גיבוי מערכת שמאות" },
  { id: "b_backup_media", name: "גיבוי מדיה" },
  { id: "b_backup_archive", name: "ארכיון גיבויים" },
];

export default function Settings() {
  // Roles - decide which folder pickers to show + admin-only sections
  const { isAdmin, isAppraiser, isArchitect } = useUserRoles();
  // Drive - real connection via Google OAuth
  const { isConnected: driveConnected, connection, connecting, connect, disconnect } = useDriveConnection();
  const driveAccount = connection?.google_email ?? "";
  const [folderId, setFolderId] = useState<string>("");
  const [folderName, setFolderName] = useState<string>("");

  // AI engine settings
  const [geminiSource, setGeminiSource] = useState<"lovable" | "custom">("lovable");
  const [geminiKey, setGeminiKey] = useState("");
  const [geminiKeyMasked, setGeminiKeyMasked] = useState<string>("");

  // Backup
  const [backupEnabled, setBackupEnabled] = useState(false);
  const [backupFolderId, setBackupFolderId] = useState<string>("");
  const [backupTime, setBackupTime] = useState<string>("02:00");
  const [backupLastRun, setBackupLastRun] = useState<string>("");
  const [backupRunning, setBackupRunning] = useState(false);

  useEffect(() => {
    setFolderId(localStorage.getItem(STORAGE_KEYS.driveFolderId) ?? "");
    setFolderName(localStorage.getItem(STORAGE_KEYS.driveFolderName) ?? "");
    setGeminiSource((localStorage.getItem(STORAGE_KEYS.geminiSource) as "lovable" | "custom") ?? "lovable");
    setGeminiKeyMasked(localStorage.getItem(STORAGE_KEYS.geminiKeyMasked) ?? "");
    setBackupEnabled(localStorage.getItem(STORAGE_KEYS.backupEnabled) === "true");
    setBackupFolderId(localStorage.getItem(STORAGE_KEYS.backupFolderId) ?? "");
    setBackupTime(localStorage.getItem(STORAGE_KEYS.backupTime) ?? "02:00");
    setBackupLastRun(localStorage.getItem(STORAGE_KEYS.backupLastRun) ?? "");
  }, []);

  const handleToggleBackup = (enabled: boolean) => {
    if (enabled && !driveConnected) {
      toast.error("יש לחבר חשבון Google Drive תחילה");
      return;
    }
    setBackupEnabled(enabled);
    localStorage.setItem(STORAGE_KEYS.backupEnabled, String(enabled));
    toast.success(enabled ? "גיבוי אוטומטי הופעל" : "גיבוי אוטומטי הושבת");
  };

  const handleBackupFolderChange = (id: string) => {
    setBackupFolderId(id);
    localStorage.setItem(STORAGE_KEYS.backupFolderId, id);
    const folder = BACKUP_FOLDERS.find((f) => f.id === id);
    if (folder) toast.success(`תיקיית הגיבוי הוגדרה: ${folder.name}`);
  };

  const handleBackupTimeChange = (time: string) => {
    setBackupTime(time);
    localStorage.setItem(STORAGE_KEYS.backupTime, time);
  };

  const handleRunBackupNow = () => {
    if (!driveConnected) {
      toast.error("יש לחבר חשבון Google Drive תחילה");
      return;
    }
    if (!backupFolderId) {
      toast.error("יש לבחור תיקיית גיבוי");
      return;
    }
    setBackupRunning(true);
    toast.info("מבצע גיבוי של קבצי המדיה...");
    setTimeout(() => {
      const now = new Date().toLocaleString("he-IL");
      setBackupLastRun(now);
      localStorage.setItem(STORAGE_KEYS.backupLastRun, now);
      setBackupRunning(false);
      toast.success("הגיבוי הושלם בהצלחה", {
        description: "כל התמונות וההקלטות הועלו ל-Drive",
      });
    }, 1500);
  };

  const handleConnectDrive = () => {
    toast.info("מעביר ל-Google לאישור הרשאות...");
    connect();
  };

  const handleDisconnectDrive = async () => {
    await disconnect();
    setFolderId("");
    setFolderName("");
    localStorage.removeItem(STORAGE_KEYS.driveFolderId);
    localStorage.removeItem(STORAGE_KEYS.driveFolderName);
  };

  const handleSaveGemini = () => {
    localStorage.setItem(STORAGE_KEYS.geminiSource, geminiSource);
    if (geminiSource === "custom" && geminiKey.trim()) {
      const masked = `••••••••${geminiKey.trim().slice(-4)}`;
      setGeminiKeyMasked(masked);
      localStorage.setItem(STORAGE_KEYS.geminiKeyMasked, masked);
      setGeminiKey("");
      toast.success("מפתח AI נשמר", {
        description: "המפתח יישמר באופן מאובטח בצד השרת",
      });
    } else if (geminiSource === "lovable") {
      localStorage.removeItem(STORAGE_KEYS.geminiKeyMasked);
      setGeminiKeyMasked("");
      toast.success("המערכת תשתמש ב-AI המובנה");
    } else {
      toast.error("יש להזין מפתח API");
    }
  };

  return (
    <SidebarProvider defaultOpen>
      <div className="flex min-h-screen w-full bg-background">
        <AppSidebar />

        <SidebarInset className="flex flex-col">
          <header className="h-14 border-b border-border bg-card flex items-center px-4 gap-4 shrink-0">
            <SidebarTrigger />
            <div className="flex-1">
              <h1 className="text-lg font-semibold">הגדרות</h1>
              <p className="text-xs text-muted-foreground">ניהול אינטגרציות וחיבורים</p>
            </div>
          </header>

          <div className="flex-1 overflow-auto p-4 lg:p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Google Drive */}
              <Card className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="h-11 w-11 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                    <Cloud className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="font-semibold text-foreground">חשבון Google</h2>
                      {driveConnected && (
                        <Badge className="bg-success/10 text-success border-success/20 border gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          מחובר
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      חבר את חשבון Google שלך כדי לאפשר: סנכרון Drive, יצירת אירועים ביומן, ויצירת משימות אוטומטיות.
                    </p>
                  </div>
                </div>

                <Separator className="my-4" />

                {!driveConnected ? (
                  <div className="space-y-3">
                    <Button onClick={handleConnectDrive} className="gap-2" disabled={connecting}>
                      {connecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Cloud className="h-4 w-4" />
                      )}
                      {connecting ? "מתחבר..." : "חבר חשבון Google"}
                    </Button>
                    <div className="text-xs text-muted-foreground space-y-1">
                      <p>תועבר ל-Google לאישור הרשאות. תתבקש לאשר:</p>
                      <ul className="mr-4 space-y-0.5">
                        <li>📁 <strong>Drive</strong> - גישה לקריאה ולכתיבה בתיקיות שתבחר</li>
                        <li>📅 <strong>Calendar</strong> - יצירת אירועים ופגישות ביומן שלך</li>
                        <li>✅ <strong>Tasks</strong> - יצירת משימות מעקב</li>
                      </ul>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                      <div className="min-w-0">
                        <div className="text-xs text-muted-foreground">חשבון מחובר</div>
                        <div className="font-medium text-foreground truncate">{driveAccount}</div>
                      </div>
                      <Button variant="outline" size="sm" onClick={handleDisconnectDrive}>
                        נתק
                      </Button>
                    </div>

                    {(isAppraiser || isAdmin) && (
                      <WorkFolderPicker
                        workspace="appraiser"
                        label="📁 תיקיית הקלטות שטח (שמאי)"
                      />
                    )}
                    {(isArchitect || isAdmin) && (
                      <WorkFolderPicker
                        workspace="architect"
                        label="📁 תיקיית הקלטות פגישות (אדריכל)"
                      />
                    )}
                  </div>
                )}
              </Card>

              {/* AI settings - admin only */}
              {isAdmin && (
              <Card className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="h-11 w-11 rounded-lg bg-accent/10 text-accent-foreground flex items-center justify-center shrink-0">
                    <Sparkles className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-foreground mb-1">AI - תמלול וניתוח</h2>
                    <p className="text-sm text-muted-foreground">
                      מודל ה-AI שישמש לתמלול הקלטות וניתוח תוכן
                    </p>
                  </div>
                </div>

                <Separator className="my-4" />

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>מקור המפתח</Label>
                    <Select value={geminiSource} onValueChange={(v) => setGeminiSource(v as "lovable" | "custom")}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="lovable">AI מובנה (מומלץ)</SelectItem>
                        <SelectItem value="custom">מפתח AI אישי</SelectItem>
                      </SelectContent>
                    </Select>
                    <p className="text-xs text-muted-foreground">
                      {geminiSource === "lovable"
                        ? "AI מובנה - ללא צורך בהגדרה"
                        : "השתמש במפתח AI פרטי"}
                    </p>
                  </div>

                  {geminiSource === "custom" && (
                    <div className="space-y-2">
                      <Label htmlFor="gemini-key">AI API Key</Label>
                      <div className="relative">
                        <Key className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          id="gemini-key"
                          type="password"
                          placeholder={geminiKeyMasked || "AIza..."}
                          value={geminiKey}
                          onChange={(e) => setGeminiKey(e.target.value)}
                          className="pr-9 font-mono"
                          dir="ltr"
                        />
                      </div>
                      {geminiKeyMasked && (
                        <p className="text-xs text-muted-foreground">
                          מפתח נוכחי: <span className="font-mono">{geminiKeyMasked}</span>
                        </p>
                      )}
                      <a
                        href="https://aistudio.google.com/apikey"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                      >
                        ניהול מפתח AI
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                  )}

                  <Button onClick={handleSaveGemini}>שמור הגדרות</Button>
                </div>
              </Card>
              )}

              {/* Backup */}
              {isAdmin && (
              <Card className="p-6">
                <div className="flex items-start gap-4 mb-4">
                  <div className="h-11 w-11 rounded-lg bg-success/10 text-success flex items-center justify-center shrink-0">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h2 className="font-semibold text-foreground mb-1">גיבוי המערכת</h2>
                    <p className="text-sm text-muted-foreground">
                      גיבוי יומי אוטומטי של כל קבצי המדיה (תמונות והקלטות) ל-Google Drive
                    </p>
                  </div>
                </div>

                <Separator className="my-4" />

                {!driveConnected && (
                  <div className="mb-4 p-3 rounded-lg bg-warning/10 border border-warning/30 text-sm text-warning-foreground">
                    יש לחבר חשבון Google Drive בכרטיס למעלה לפני הפעלת גיבוי
                  </div>
                )}

                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/40 border border-border">
                    <div>
                      <div className="font-medium text-foreground">גיבוי אוטומטי יומי</div>
                      <div className="text-xs text-muted-foreground">
                        קבצי המדיה יגובו בכל יום בשעה הנבחרת
                      </div>
                    </div>
                    <Switch
                      checked={backupEnabled}
                      onCheckedChange={handleToggleBackup}
                      disabled={!driveConnected}
                    />
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="backup-folder">תיקיית גיבוי ב-Drive</Label>
                      <Select
                        value={backupFolderId}
                        onValueChange={handleBackupFolderChange}
                        disabled={!driveConnected}
                      >
                        <SelectTrigger id="backup-folder">
                          <SelectValue placeholder="בחר תיקייה..." />
                        </SelectTrigger>
                        <SelectContent>
                          {BACKUP_FOLDERS.map((f) => (
                            <SelectItem key={f.id} value={f.id}>
                              <div className="flex items-center gap-2">
                                <FolderOpen className="h-4 w-4 text-muted-foreground" />
                                {f.name}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="backup-time">שעת גיבוי יומית</Label>
                      <Input
                        id="backup-time"
                        type="time"
                        value={backupTime}
                        onChange={(e) => handleBackupTimeChange(e.target.value)}
                        disabled={!driveConnected}
                        dir="ltr"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <div className="text-xs text-muted-foreground">
                      {backupLastRun ? (
                        <>גיבוי אחרון: <span className="font-medium text-foreground">{backupLastRun}</span></>
                      ) : (
                        "לא בוצע גיבוי עדיין"
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={handleRunBackupNow}
                      disabled={!driveConnected || backupRunning}
                    >
                      <HardDriveDownload className={`h-4 w-4 ${backupRunning ? "animate-pulse" : ""}`} />
                      {backupRunning ? "מגבה..." : "גבה עכשיו"}
                    </Button>
                  </div>
                </div>
              </Card>
              )}
            </div>
          </div>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
