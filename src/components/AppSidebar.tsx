import {
  LayoutDashboard,
  FolderOpen,
  Settings,
  Users,
  FileText,
  Calendar,
  Shield,
  DollarSign,
  Mic,
  ClipboardList,
  Phone,
  Image as ImageIcon,
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
  SidebarHeader,
  useSidebar,
} from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useBranding } from "@/hooks/useBranding";
import { useActiveWorkspace } from "@/hooks/useActiveWorkspace";
import { WorkspaceSwitcher } from "./WorkspaceSwitcher";

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
      { title: "שיחות טלפון", url: "/meeting-phone-calls", icon: Phone },
      { title: "תמונות", url: "/meeting-photos", icon: ImageIcon },
      { title: "לקוחות / פרויקטים", url: "/clients", icon: Users },
      { title: "תבניות סיכום פגישה", url: "/meeting-templates", icon: ClipboardList },
    ];
  } else if (workspace === "admin") {
    mainLabel = "סקירת מערכת (אדמין)";
    mainItems = [
      { title: "סקירה כללית", url: "/", icon: LayoutDashboard },
      // Appraiser tools (on admin's own Drive)
      { title: "תיקי שומה", url: "/cases", icon: FolderOpen },
      { title: "הקלטות שטח", url: "/recordings", icon: Mic },
      { title: "שיחות טלפון (שמאי)", url: "/phone-calls", icon: Phone },
      { title: "תמונות (שמאי)", url: "/photos", icon: ImageIcon },
      { title: "תבניות דוחות", url: "/templates", icon: FileText },
      // Architect tools (on admin's own Drive)
      { title: "פגישות", url: "/meetings", icon: Calendar },
      { title: "הקלטות פגישה", url: "/meeting-recordings", icon: Mic },
      { title: "שיחות טלפון (פגישה)", url: "/meeting-phone-calls", icon: Phone },
      { title: "תמונות (פגישה)", url: "/meeting-photos", icon: ImageIcon },
      { title: "תבניות סיכום פגישה", url: "/meeting-templates", icon: ClipboardList },
      { title: "לקוחות / פרויקטים", url: "/clients", icon: Users },
    ];
  } else {
    // No role yet — show only Settings/Logout in management; keep main empty
    mainLabel = "אין תפקיד פעיל";
    mainItems = [];
  }

  // Management
  const managementItems: Item[] = [];
  if (isAdmin) {
    managementItems.push(
      { title: "ניהול משתמשים", url: "/admin", icon: Shield },
      { title: "צריכה ועלויות", url: "/usage", icon: DollarSign },
    );
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
