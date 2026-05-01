import { LayoutDashboard, FolderOpen, Mic, Image as ImageIcon, Settings, Cloud, Search, Users, FileText, Calendar, Shield, DollarSign } from "lucide-react";
import { Sidebar, SidebarContent, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarMenu, SidebarMenuButton, SidebarMenuItem, SidebarHeader } from "@/components/ui/sidebar";
import { NavLink, useLocation } from "react-router-dom";
import { useUserRoles } from "@/hooks/useUserRoles";
import { useBranding } from "@/hooks/useBranding";

export function AppSidebar() {
  const location = useLocation();
  const { isAppraiser, isArchitect, isAdmin, displayName, email } = useUserRoles();
  const branding = useBranding();
  const initial = (displayName || email || "U").trim().charAt(0).toUpperCase();

  const isActive = (path: string) => location.pathname === path;

  // Build menu items based on role
  const mainItems: { title: string; url: string; icon: any }[] = [
    { title: "דשבורד", url: "/", icon: LayoutDashboard },
  ];

  if (isAppraiser) {
    mainItems.push(
      { title: "כל התיקים", url: "/cases", icon: FolderOpen },
      { title: "לקוחות", url: "/clients", icon: Users },
      { title: "תבניות דוחות", url: "/templates", icon: FileText },
    );
  }

  if (isArchitect) {
    mainItems.push({ title: "פגישות", url: "/meetings", icon: Calendar });
  }

  // ניהול והגדרות - רק למנהל
  const integrationItems: { title: string; url: string; icon: any }[] = [];
  if (isAdmin) {
    integrationItems.push(
      { title: "ניהול משתמשים", url: "/admin", icon: Shield },
      { title: "צריכה ועלויות", url: "/usage", icon: DollarSign },
      { title: "הגדרות", url: "/settings", icon: Settings },
    );
  }

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
          <SidebarGroupLabel>ראשי</SidebarGroupLabel>
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

        {integrationItems.length > 0 && (
          <SidebarGroup>
            <SidebarGroupLabel>ניהול</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {integrationItems.map((item) => (
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
    </Sidebar>
  );
}
