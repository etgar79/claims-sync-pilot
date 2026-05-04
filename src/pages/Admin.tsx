import { useEffect, useState } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Shield, UserCog, Building2, Briefcase, Plus, Trash2, Mic } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useUserRoles, type AppRole } from "@/hooks/useUserRoles";
import { Navigate } from "react-router-dom";
import { TranscriberRootFolderPicker } from "@/components/TranscriberRootFolderPicker";

interface UserWithRoles {
  user_id: string;
  display_name: string | null;
  roles: AppRole[];
}

const ROLE_META: Record<AppRole, { label: string; icon: any }> = {
  appraiser: { label: "שמאי", icon: Briefcase },
  architect: { label: "אדריכל", icon: Building2 },
  admin: { label: "מנהל", icon: Shield },
  transcriber: { label: "תמלול", icon: Mic },
};

const Admin = () => {
  const { isAdmin, loading: rolesLoading } = useUserRoles();
  const [users, setUsers] = useState<UserWithRoles[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    email: "",
    password: "",
    display_name: "",
    role: "architect" as AppRole,
  });

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

  const handleCreate = async () => {
    if (!form.email || !form.password) {
      toast.error("יש להזין מייל וסיסמה");
      return;
    }
    if (form.password.length < 6) {
      toast.error("הסיסמה חייבת להיות לפחות 6 תווים");
      return;
    }
    setCreating(true);
    const res = await supabase.functions.invoke("admin-create-user", { body: form });
    setCreating(false);
    if (res.error || (res.data as any)?.error) {
      toast.error((res.data as any)?.error || res.error?.message || "שגיאה ביצירת משתמש");
      return;
    }
    toast.success(`נוצר משתמש: ${form.email}`);
    setCreateOpen(false);
    setForm({ email: "", password: "", display_name: "", role: "architect" });
    load();
  };

  const handleDelete = async (userId: string) => {
    const res = await supabase.functions.invoke("admin-delete-user", { body: { user_id: userId } });
    if (res.error || (res.data as any)?.error) {
      toast.error((res.data as any)?.error || res.error?.message || "שגיאה במחיקה");
      return;
    }
    toast.success("המשתמש נמחק");
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
          <header className="flex items-center justify-between border-b border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <UserCog className="h-6 w-6" />
              <div>
                <h1 className="text-2xl font-bold">ניהול משתמשים</h1>
                <p className="text-sm text-muted-foreground">צור משתמשים והקצה תפקידים</p>
              </div>
            </div>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 ml-2" />
                  משתמש חדש
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>יצירת משתמש חדש</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>שם תצוגה</Label>
                    <Input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} placeholder="שלומי ממן" />
                  </div>
                  <div>
                    <Label>מייל *</Label>
                    <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} dir="ltr" />
                  </div>
                  <div>
                    <Label>סיסמה * (לפחות 6 תווים)</Label>
                    <Input type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} dir="ltr" />
                  </div>
                  <div>
                    <Label>תפקיד *</Label>
                    <RadioGroup
                      value={form.role}
                      onValueChange={(v) => setForm({ ...form, role: v as AppRole })}
                      className="grid grid-cols-3 gap-2 mt-2"
                    >
                      {(Object.keys(ROLE_META) as AppRole[]).map((r) => {
                        const m = ROLE_META[r];
                        return (
                          <Label
                            key={r}
                            htmlFor={`new-role-${r}`}
                            className={`flex items-center gap-2 border-2 rounded-lg p-3 cursor-pointer transition-colors ${
                              form.role === r ? "border-primary bg-primary/5" : "border-border"
                            }`}
                          >
                            <RadioGroupItem value={r} id={`new-role-${r}`} />
                            <m.icon className="h-4 w-4" />
                            <span className="text-sm">{m.label}</span>
                          </Label>
                        );
                      })}
                    </RadioGroup>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setCreateOpen(false)}>ביטול</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                    צור משתמש
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </header>

          <div className="flex-1 p-6 space-y-4">
            {!loading && users.some((u) => u.roles.length === 0) && (
              <Card className="p-3 border-warning/40 bg-warning/5 text-sm">
                ⚠️ יש משתמשים ללא תפקיד מוגדר — הם רואים מסך "לא הוגדר תפקיד" ואינם יכולים להשתמש במערכת. הקצה להם תפקיד למטה.
              </Card>
            )}
            {loading ? (
              <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
            ) : (
              <Card className="overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted">
                    <tr>
                      <th className="text-right p-3">משתמש</th>
                      <th className="text-right p-3">תפקידים</th>
                      <th className="text-right p-3">שיוך תפקידים</th>
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
                              <span className="text-sm text-muted-foreground">אין</span>
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
                                  {hasIt ? `הסר` : `הוסף`} {m.label}
                                </Button>
                              );
                            })}
                          </div>
                        </td>
                        <td className="p-3">
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="destructive">
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>מחיקת משתמש</AlertDialogTitle>
                                <AlertDialogDescription>
                                  האם למחוק את {u.display_name}? פעולה זו לא ניתנת לביטול וכל הנתונים של המשתמש יימחקו.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>ביטול</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(u.user_id)}>מחק</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
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
