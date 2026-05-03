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
import { ADMIN_MENU_ITEMS } from "@/config/adminMenu";

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
    mainLabel = "ממשק אדמין";
    mainItems = [
      { title: "סקירה כללית", url: "/", icon: LayoutDashboard },
    ];
    // כדי לעבוד כשמאי/אדריכל — החלף workspace דרך מתג מצב העבודה למטה.
  } else {
    // No role yet — show only Settings/Logout in management; keep main empty
    mainLabel = "אין תפקיד פעיל";
    mainItems = [];
  }

  // Admin items — collapsed under one menu (סדר נשלט מ-src/config/adminMenu.ts)
  const adminItems: Item[] = isAdmin
    ? ADMIN_MENU_ITEMS.filter((i) => !i.hidden).map((i) => ({ title: i.title, url: i.url, icon: i.icon }))
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
    <Sidebar side="right" collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sidebar-primary text-sidebar-primary-foreground font-bold text-lg">
            {initial}
          </div>
          <div className="flex flex-col group-data-[collapsible=icon]:hidden min-w-0">
            <span className="font-bold text-sidebar-foreground truncate">{branding.systemName}</span>
            <span className="text-xs text-sidebar-foreground/70 truncate">{branding.systemSubtitle}</span>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{mainLabel}</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                    <NavLink to={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </NavLink>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {adminItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>אדמין</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <Collapsible defaultOpen={adminOpen} className="group/collapsible">
                  <SidebarMenuItem>
                    <CollapsibleTrigger asChild>
                      <SidebarMenuButton tooltip="כלי אדמין" className="w-full">
                        <Shield className="h-4 w-4" />
                        <span>כלי אדמין</span>
                        <ChevronDown className="mr-auto h-4 w-4 transition-transform group-data-[state=open]/collapsible:rotate-180" />
                      </SidebarMenuButton>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <SidebarMenuSub>
                        {adminItems.map((item) => (
                          <SidebarMenuSubItem key={item.title}>
                            <SidebarMenuSubButton asChild isActive={isActive(item.url)}>
                              <NavLink to={item.url}>
                                <item.icon className="h-4 w-4" />
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
            <SidebarGroupLabel>ניהול</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {managementItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild isActive={isActive(item.url)} tooltip={item.title}>
                      <NavLink to={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </NavLink>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="border-t border-sidebar-border">
        <WorkspaceSwitcher collapsed={collapsed} />
      </SidebarFooter>
    </Sidebar>
  );
}
