import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Shield, UserCog, Building2, Briefcase } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { Navigate } from "react-router-dom";

interface UserWithRoles {
  user_id: string;
  display_name: string | null;
  roles: AppRole[];
}

const ROLE_META: Record<AppRole, { label: string; icon: any; color: string }> = {
  appraiser: { label: "שמאי", icon: Briefcase, color: "bg-blue-500" },
  architect: { label: "אדריכל", icon: Building2, color: "bg-purple-500" },
  admin: { label: "מנהל", icon: Shield, color: "bg-red-500" },
};

const Admin = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [profilesRes, rolesRes] = await Promise.all([
      supabase.from("profiles").select("user_id, display_name"),
      supabase.from("user_roles").select("user_id, role"),
    ]);
    const map = new Map<string, UserWithRoles>();
    (profilesRes.data || []).forEach((p: any) => {
      map.set(p.user_id, { user_id: p.user_id, display_name: p.display_name, roles: [] });
    });
    (rolesRes.data || []).forEach((r: any) => {
      const u = map.get(r.user_id) || { user_id: r.user_id, display_name: null, roles: [] };
      u.roles.push(r.role);
      map.set(r.user_id, u);
    });
    setUsers(Array.from(map.values()));
    setLoading(false);
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const toggleRole = async (userId: string, role: AppRole, hasIt: boolean) => {
    if (hasIt) {
      const { error } = await supabase.from("user_roles").delete().eq("user_id", userId).eq("role", role);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("user_roles").insert({ user_id: userId, role });
      if (error) return toast.error(error.message);
    }
    toast.success("עודכן");
    load();
  };

  if (rolesLoading) {
    return <div className="min-h-screen flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }
  if (!isAdmin) return <Navigate to="/" replace />;

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex items-center gap-3 border-b border-border bg-card p-4">
            <SidebarTrigger />
            <UserCog className="h-6 w-6" />
            <div>
              <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
              <p className="text-sm text-muted-foreground">הקצה תפקידים למשתמשים</p>
            </div>
          </header>

          <div className="flex-1 p-6">
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-right p-3">משתמש</th>
                      <th className="text-right p-3">תפקידים נוכחיים</th>
                      <th className="text-right p-3">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map((u) => (
                      <tr key={u.user_id} className="border-t border-border">
                        <td className="p-3">
                          <div className="font-medium">{u.display_name || "ללא שם"}</div>
                          <div className="text-xs text-muted-foreground font-mono">{u.user_id.slice(0, 8)}...</div>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 flex-wrap">
                            {u.roles.length === 0 ? (
                              <span className="text-sm text-muted-foreground">אין תפקידים</span>
                            ) : (
                              u.roles.map((r) => {
                                const m = ROLE_META[r];
                                return (
                                  <Badge key={r} className="gap-1">
                                    <m.icon className="h-3 w-3" />
                                    {m.label}
                                  </Badge>
                                );
                              })
                            )}
                          </div>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-2 flex-wrap">
                            {(Object.keys(ROLE_META) as AppRole[]).map((role) => {
                              const m = ROLE_META[role];
                              const hasIt = u.roles.includes(role);
                              return (
                                <Button
                                  key={role}
                                  size="sm"
                                  variant={hasIt ? "default" : "outline"}
                                  onClick={() => toggleRole(u.user_id, role, hasIt)}
                                >
                                  <m.icon className="h-3 w-3 ml-1" />
                                  {hasIt ? `הסר ${m.label}` : `הוסף ${m.label}`}
                                </Button>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Card>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Admin;
