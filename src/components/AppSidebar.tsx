import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  Users,
  FileText,
  Calendar,
  Shield,
  Mic,
  ClipboardList,
  Phone,
  Image as ImageIcon,
  ChevronDown,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { NavLink, useLocation } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useBranding } from "@/hooks/useBranding";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";
import { ADMIN_TOOLS_ITEMS } from "@/config/adminMenu";

type Item = { title: string; url: string; icon: any };

export function AppSidebar() {
  const location = useLocation();
  const { isAdmin, displayName, email, loading: rolesLoading } = useUserRoles();
  const { workspace, loading: wsLoading } = useActiveWorkspace();
  const branding = useBranding();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const initial = (displayName || email || "U").trim().charAt(0).toUpperCase();

  const isActive = (path: string) => location.pathname === path;

  // Build menu by active workspace
  let mainItems: Item[] = [];
  let mainLabel = "ראשי";
  const stillLoading = rolesLoading || wsLoading;

  if (stillLoading) {
    mainLabel = "טוען...";
    mainItems = [];
  } else if (workspace === "appraiser") {
    mainLabel = "מערכת שמאות";
    mainItems = [
      { title: "דשבורד שמאי", url: "/", icon: LayoutDashboard },
      { title: "תיקי שומה", url: "/cases", icon: FolderOpen },
      { title: "לקוחות", url: "/clients", icon: Users },
      { title: "הקלטות שטח", url: "/recordings", icon: Mic },
      { title: "תמלולים", url: "/transcripts", icon: FileText },
      { title: "שיחות טלפון", url: "/phone-calls", icon: Phone },
      { title: "תמונות", url: "/photos", icon: ImageIcon },
      { title: "תבניות דוחות", url: "/templates", icon: FileText },
    ];
  } else if (workspace === "architect") {
    mainLabel = "ניהול פגישות";
    mainItems = [
      { title: "דשבורד פגישות", url: "/", icon: LayoutDashboard },
      { title: "פגישות", url: "/meetings", icon: Calendar },
      { title: "הקלטות פגישה", url: "/meeting-recordings", icon: Mic },
      { title: "תמלולי פגישות", url: "/meeting-transcripts", icon: FileText },
      { title: "שיחות טלפון", url: "/meeting-phone-calls", icon: Phone },
      { title: "תמונות", url: "/meeting-photos", icon: ImageIcon },
      { title: "לקוחות / פרויקטים", url: "/clients", icon: Users },
      { title: "תבניות סיכום פגישה", url: "/meeting-templates", icon: ClipboardList },
    ];
  } else if (workspace === "admin") {
    mainLabel = "סקירה כללית";
    mainItems = [
      { title: "סקירה כללית", url: "/", icon: LayoutDashboard },
    ];
  } else {
    // No role yet — show only Settings/Logout in management; keep main empty
    mainLabel = "אין תפקיד פעיל";
    mainItems = [];
  }

  // Admin tools — show as a group only when in admin workspace.
  const adminItems: Item[] = (isAdmin && workspace === "admin")
    ? ADMIN_TOOLS_ITEMS.filter((i) => !i.hidden).map((i) => ({ title: i.title, url: i.url, icon: i.icon }))
    : [];
  const adminOpen = adminItems.some((i) => isActive(i.url)) || location.pathname.startsWith("/admin");

  // Common management
  const managementItems: Item[] = [];
  // תמלולים — זמין לכל משתמש מחובר (לא רק לפי תפקיד)
  const transcriptsUrl = workspace === "architect" ? "/meeting-transcripts" : "/transcripts";
  const transcriptsAlreadyShown = mainItems.some((i) => i.url === transcriptsUrl || i.url === "/transcripts" || i.url === "/meeting-transcripts");
  if (!stillLoading && !transcriptsAlreadyShown) {
    managementItems.unshift({ title: "תמלולים", url: transcriptsUrl, icon: FileText });
  }
  managementItems.push({ title: "הגדרות", url: "/settings", icon: Settings });

  return (
    <Sidebar side="right" collapsible="icon" className="border-l border-sidebar-border">
      <SidebarHeader className="p-4 pb-2">
        <div className="flex items-center gap-3 px-1">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-sidebar-primary to-[hsl(var(--sidebar-primary)/0.7)] text-sidebar-primary-foreground font-semibold text-base shadow-[0_4px_12px_hsl(var(--sidebar-glow)/0.3)]">
            {initial}
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="font-semibold tracking-tight text-sidebar-foreground truncate text-[15px]">
              {branding.systemName}
            </span>
            <span className="text-[11px] text-[hsl(var(--sidebar-muted))] truncate">
              {branding.systemSubtitle}
            </span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 gap-4">
        <SidebarGroup>
          <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[hsl(var(--sidebar-muted))] px-3">
            {mainLabel}
          </SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu className="gap-0.5">
              {mainItems.map((item) => {
                const active = isActive(item.url);
                return (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.title}
                      className={`relative h-10 rounded-xl px-3 font-medium text-[13.5px] transition-all duration-200
                        text-[hsl(var(--sidebar-muted))] hover:text-sidebar-foreground hover:bg-sidebar-accent/60
                        data-[active=true]:bg-gradient-to-l data-[active=true]:from-[hsl(var(--sidebar-primary)/0.12)] data-[active=true]:to-transparent
                        data-[active=true]:text-[hsl(var(--sidebar-primary))]
                        data-[active=true]:shadow-[0_4px_16px_-6px_hsl(var(--sidebar-glow)/0.25)]`}
                    >
                      <NavLink to={item.url}>
                        {active && (
                          <span className="absolute right-0 top-2 bottom-2 w-[3px] rounded-l-full bg-[hsl(var(--sidebar-primary))] shadow-[0_0_8px_hsl(var(--sidebar-glow)/0.6)]" />
                        )}
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            <div className="mx-3 h-px bg-gradient-to-l from-transparent via-sidebar-border to-transparent mb-2" />
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible defaultOpen={adminOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton
                        tooltip="כלי אדמין"
                        className="h-10 rounded-xl px-3 text-[10px] font-semibold tracking-[0.12em] uppercase text-[hsl(var(--sidebar-muted))] hover:text-sidebar-foreground hover:bg-sidebar-accent/60"
                      >
                        <Shield className="h-4 w-4" />
                        <span>כלי אדמין</span>
                        <ChevronDown className="mr-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub className="border-r border-sidebar-border/60 mr-4 pr-3 gap-0.5">
                        {adminItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton
                              asChild
                              isActive={isActive(item.url)}
                              className="h-9 rounded-lg text-[13px] text-[hsl(var(--sidebar-muted))] hover:text-sidebar-foreground hover:bg-sidebar-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:text-[hsl(var(--sidebar-primary))]"
                            >
                              <NavLink to={item.url}>
                                <item.icon className="h-3.5 w-3.5" />
                                <span>{item.title}</span>
                              </NavLink>
                            </SidebarMenuSubButton>
                          </SidebarMenuSubItem>
                        ))}
                      </SidebarMenuSub>
                    </CollapsibleContent>
                  </SidebarMenuItem>
                </Collapsible>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {managementItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel className="text-[10px] font-semibold tracking-[0.12em] uppercase text-[hsl(var(--sidebar-muted))] px-3">
              ניהול
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-0.5">
                {managementItems.map((item) => {
                  const active = isActive(item.url);
                  return (
                    <SidebarMenuItem key={item.title}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        className="relative h-10 rounded-xl px-3 font-medium text-[13.5px] text-[hsl(var(--sidebar-muted))] hover:text-sidebar-foreground hover:bg-sidebar-accent/60 data-[active=true]:bg-sidebar-accent data-[active=true]:text-[hsl(var(--sidebar-primary))]"
                      >
                        <NavLink to={item.url}>
                          {active && (
                            <span className="absolute right-0 top-2 bottom-2 w-[3px] rounded-l-full bg-[hsl(var(--sidebar-primary))]" />
                          )}
                          <item.icon className="h-4 w-4" />
                          <span>{item.title}</span>
                        </NavLink>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border/60 p-3 bg-sidebar-accent/30">
        <WorkspaceSwitcher collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}
