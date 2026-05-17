// Global user switcher for admins — shown in the sidebar header.
// Lets admin instantly switch which user's data they're viewing,
// without going through /admin/users.

import { useEffect, useState } from "react";
import { Check, ChevronsUpDown, UserCog, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useActAsUser, setActAs, clearActAs } from "@/lib/actAs";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

interface UserOption {
  user_id: string;
  display_name: string;
  roles: string[];
  count: number;
}

const ROLE_LABELS: Record<string, string> = {
  appraiser: "שמאי",
  architect: "אדריכל",
  transcriber: "תמלול",
  admin: "מנהל",
};

export function AdminUserSwitcher({ collapsed = false }: { collapsed?: boolean }) {
  const { isAdmin, displayName: adminName } = useUserRoles();
  const { actAsId, actAsName, isActing } = useActAsUser();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [users, setUsers] = useState<UserOption[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isAdmin || !open) return;
    if (users.length > 0) return; // cached
    (async () => {
      setLoading(true);
      try {
        const [profiles, roles, cases, meetings, recordings, mrecs] = await Promise.all([
          supabase.from("profiles").select("user_id, display_name"),
          supabase.from("user_roles").select("user_id, role"),
          supabase.from("cases").select("user_id"),
          supabase.from("meetings").select("user_id"),
          supabase.from("recordings").select("user_id"),
          supabase.from("meeting_recordings").select("user_id"),
        ]);
        const map = new Map<string, UserOption>();
        (profiles.data ?? []).forEach((p: any) => {
          map.set(p.user_id, {
            user_id: p.user_id,
            display_name: p.display_name || "ללא שם",
            roles: [],
            count: 0,
          });
        });
        (roles.data ?? []).forEach((r: any) => {
          const u = map.get(r.user_id);
          if (u && !u.roles.includes(r.role)) u.roles.push(r.role);
        });
        const inc = (uid: string) => {
          const u = map.get(uid);
          if (u) u.count++;
        };
        (cases.data ?? []).forEach((x: any) => inc(x.user_id));
        (meetings.data ?? []).forEach((x: any) => inc(x.user_id));
        (recordings.data ?? []).forEach((x: any) => inc(x.user_id));
        (mrecs.data ?? []).forEach((x: any) => inc(x.user_id));
        const arr = Array.from(map.values()).sort((a, b) => b.count - a.count);
        setUsers(arr);
      } catch (e) {
        console.error("AdminUserSwitcher load error", e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAdmin, open, users.length]);

  if (!isAdmin) return null;

  const handlePick = (u: UserOption) => {
    setActAs(u.user_id, u.display_name);
    toast.success(`כעת אתה צופה בנתונים של ${u.display_name}`);
    setOpen(false);
    navigate("/");
  };

  const handleClear = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    clearActAs();
    toast.success("חזרת למצב מנהל (נתונים שלך בלבד)");
    navigate("/");
  };

  // Collapsed sidebar — icon only
  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-9 w-9 rounded-lg",
              isActing && "bg-amber-500/15 text-amber-700 hover:bg-amber-500/25"
            )}
            onClick={() => setOpen(true)}
          >
            <UserCog className="h-4 w-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="left">
          {isActing ? `צופה ב: ${actAsName}` : "בחר משתמש לצפייה"}
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <div className="px-1">
      <div className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[hsl(var(--sidebar-muted))] mb-1.5 px-2">
        תצוגת משתמש
      </div>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className={cn(
              "w-full justify-between h-9 text-[12.5px] font-normal",
              isActing
                ? "bg-amber-500/10 border-amber-500/40 text-amber-900 hover:bg-amber-500/20"
                : "bg-sidebar-accent/40 border-sidebar-border"
            )}
          >
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <UserCog className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">
                {isActing ? actAsName : `אני (${adminName || "מנהל"})`}
              </span>
            </div>
            {isActing ? (
              <X
                className="h-3.5 w-3.5 shrink-0 opacity-70 hover:opacity-100"
                onClick={handleClear}
                role="button"
                aria-label="חזור למצב מנהל"
              />
            ) : (
              <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-[280px]" align="start" sideOffset={6}>
          <Command>
            <CommandInput placeholder="חיפוש משתמש..." className="h-9" />
            <CommandList>
              <CommandEmpty>{loading ? "טוען..." : "לא נמצאו משתמשים"}</CommandEmpty>
              <CommandGroup heading="מצב">
                <CommandItem
                  value="__self__"
                  onSelect={() => {
                    clearActAs();
                    toast.success("חזרת למצב מנהל (נתונים שלך בלבד)");
                    setOpen(false);
                    navigate("/");
                  }}
                  className="text-sm"
                >
                  <Check className={cn("h-4 w-4 ml-2", !isActing ? "opacity-100" : "opacity-0")} />
                  <span className="flex-1">אני עצמי (מנהל)</span>
                </CommandItem>
              </CommandGroup>
              {users.length > 0 && (
                <CommandGroup heading="פעל כמשתמש">
                  {users.map((u) => (
                    <CommandItem
                      key={u.user_id}
                      value={`${u.display_name} ${u.user_id}`}
                      onSelect={() => handlePick(u)}
                      className="text-sm"
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 ml-2",
                          actAsId === u.user_id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{u.display_name}</div>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {u.roles.map((r) => (
                            <Badge
                              key={r}
                              variant="secondary"
                              className="h-3.5 px-1 text-[9px] leading-none"
                            >
                              {ROLE_LABELS[r] ?? r}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      {u.count > 0 && (
                        <Badge variant="outline" className="text-[10px] h-4 px-1.5 mr-1">
                          {u.count}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
