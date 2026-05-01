import { Briefcase, Building2, Shield, Check } from "lucide-react";
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
import { useNavigate } from "react-router-dom";

const META: Record<Workspace, { label: string; icon: any }> = {
  appraiser: { label: "מערכת שמאות", icon: Briefcase },
  architect: { label: "מערכת ניהול פגישות", icon: Building2 },
  admin: { label: "ניהול מערכת", icon: Shield },
};

export function WorkspaceSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { workspace, setWorkspace, available, canSwitch } = useActiveWorkspace();
  const navigate = useNavigate();

  if (!canSwitch || !workspace) return null;

  const Icon = META[workspace].icon;

  const handleSelect = (w: Workspace) => {
    setWorkspace(w);
    // navigate to the right home for the workspace
    navigate("/");
  };

  return (
    <div className="px-2 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-full justify-start gap-2 h-9"
            title={META[workspace].label}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {!collapsed && <span className="truncate text-xs">{META[workspace].label}</span>}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuLabel>החלף מצב עבודה</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {available.map((w) => {
            const M = META[w];
            const active = w === workspace;
            return (
              <DropdownMenuItem
                key={w}
                onClick={() => handleSelect(w)}
                className="gap-2"
              >
                <M.icon className="h-4 w-4" />
                <span className="flex-1">{M.label}</span>
                {active && <Check className="h-4 w-4 text-primary" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
