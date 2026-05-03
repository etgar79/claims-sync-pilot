import { Briefcase, Building2, Shield, Check, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useActiveWorkspace, type Workspace } from "@/hooks/useActiveWorkspace";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useNavigate } from "react-router-dom";

const META: Record<Workspace, { label: string; icon: any }> = {
  appraiser: { label: "מערכת שמאות", icon: Briefcase },
  architect: { label: "מערכת ניהול פגישות", icon: Building2 },
  admin: { label: "ניהול מערכת", icon: Shield },
};

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { workspace, setWorkspace, available } = useActiveWorkspace();
  const { isAdmin } = useUserRoles();
  const navigate = useNavigate();

  if (!workspace) return null;

  // Only "real" work modes in the dropdown — admin gets its own button below.
  const workModes = available.filter((w) => w !== "admin");
  const showSwitcher = workModes.length > 1 && workspace !== "admin";

  const handleSelect = (w: Workspace) => {
    setWorkspace(w);
    navigate("/");
  };

  const enterAdmin = () => {
    setWorkspace("admin");
    navigate("/");
  };

  // When already in admin — go back to first available work mode
  const exitAdmin = () => {
    const target = workModes[0] ?? "appraiser";
    setWorkspace(target);
    navigate("/");
  };

  const currentMeta = META[workspace];
  const CurrentIcon = currentMeta.icon;

  return (
    <div className="px-2 py-2 space-y-2">
      {/* Work-mode switcher (appraiser / architect) */}
      {showSwitcher ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="w-full justify-start gap-2 h-9"
              title={currentMeta.label}
            >
              <CurrentIcon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate text-xs">{currentMeta.label}</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel>החלף מצב עבודה</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {workModes.map((w) => {
              const M = META[w];
              const active = w === workspace;
              return (
                <DropdownMenuItem key={w} onClick={() => handleSelect(w)} className="gap-2">
                  <M.icon className="h-4 w-4" />
                  <span className="flex-1">{M.label}</span>
                  {active && <Check className="h-4 w-4 text-primary" />}
                </DropdownMenuItem>
              );
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : workspace !== "admin" ? (
        <div
          className="w-full flex items-center gap-2 h-9 px-3 rounded-md border bg-muted/30 text-muted-foreground"
          title={currentMeta.label}
        >
          <CurrentIcon className="h-4 w-4 shrink-0" />
          {!collapsed && <span className="truncate text-xs">{currentMeta.label}</span>}
        </div>
      ) : null}

      {/* Admin-only: enter/exit "ניהול מערכת" */}
      {isAdmin && (
        workspace === "admin" ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            onClick={exitAdmin}
            title="חזור למצב עבודה"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate text-xs">חזור למצב עבודה</span>}
          </Button>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            onClick={enterAdmin}
            title="ניהול מערכת"
          >
            <Shield className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate text-xs">ניהול מערכת</span>}
          </Button>
        )
      )}
    </div>
  );
}
