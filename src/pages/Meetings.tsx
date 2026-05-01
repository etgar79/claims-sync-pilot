import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Plus, Calendar, MapPin, Users, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Meeting {
  id: string;
  title: string;
  client_name: string | null;
  project_name: string | null;
  location: string | null;
  meeting_date: string | null;
  status: string;
  tags: string[] | null;
}

const Meetings = () => {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    title: "",
    client_name: "",
    project_name: "",
    location: "",
    meeting_date: "",
  });
  const navigate = useNavigate();

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meetings")
      .select("*")
      .order("meeting_date", { ascending: false, nullsFirst: false });
    if (error) toast.error(error.message);
    setMeetings(data || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const handleCreate = async () => {
    if (!form.title.trim()) {
      toast.error("יש להזין כותרת");
      return;
    }
    setCreating(true);
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) {
      toast.error("יש להתחבר תחילה");
      setCreating(false);
      return;
    }
    const { data, error } = await supabase
      .from("meetings")
      .insert({
        user_id: auth.user.id,
        title: form.title,
        client_name: form.client_name || null,
        project_name: form.project_name || null,
        location: form.location || null,
        meeting_date: form.meeting_date || null,
      })
      .select("id")
      .single();
    setCreating(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("פגישה נוצרה בהצלחה");
    setOpen(false);
    setForm({ title: "", client_name: "", project_name: "", location: "", meeting_date: "" });
    if (data?.id) navigate(`/meetings/${data.id}`);
    else load();
  };

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <main className="flex-1 flex flex-col">
          <header className="flex items-center justify-between border-b border-border bg-card p-4">
            <div className="flex items-center gap-3">
              <SidebarTrigger />
              <div>
                <h1 className="text-2xl font-bold">פגישות</h1>
                <p className="text-sm text-muted-foreground">ניהול פגישות, תמלולים וסיכומי AI</p>
              </div>
            </div>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="h-4 w-4 ml-2" />
                  פגישה חדשה
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>צור פגישה חדשה</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>כותרת *</Label>
                    <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="פגישה עם לקוח..." />
                  </div>
                  <div>
                    <Label>שם לקוח</Label>
                    <Input value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>שם פרויקט</Label>
                    <Input value={form.project_name} onChange={(e) => setForm({ ...form, project_name: e.target.value })} />
                  </div>
                  <div>
                    <Label>מיקום</Label>
                    <Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} />
                  </div>
                  <div>
                    <Label>תאריך פגישה</Label>
                    <Input type="datetime-local" value={form.meeting_date} onChange={(e) => setForm({ ...form, meeting_date: e.target.value })} />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>ביטול</Button>
                  <Button onClick={handleCreate} disabled={creating}>
                    {creating && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
                    צור
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </header>

          <div className="flex-1 p-6">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : meetings.length === 0 ? (
              <Card className="p-12 text-center">
                <h3 className="text-lg font-semibold mb-2">אין פגישות עדיין</h3>
                <p className="text-muted-foreground mb-4">צור את הפגישה הראשונה שלך כדי להתחיל</p>
                <Button onClick={() => setOpen(true)}>
                  <Plus className="h-4 w-4 ml-2" />
                  פגישה ראשונה
                </Button>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {meetings.map((m) => (
                  <Link key={m.id} to={`/meetings/${m.id}`}>
                    <Card className="p-4 hover:border-primary transition-colors cursor-pointer h-full">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className="font-bold text-lg">{m.title}</h3>
                        <Badge variant={m.status === "active" ? "default" : "secondary"}>{m.status}</Badge>
                      </div>
                      {m.project_name && <p className="text-sm font-medium">{m.project_name}</p>}
                      {m.client_name && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Users className="h-3 w-3" />
                          {m.client_name}
                        </p>
                      )}
                      {m.location && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <MapPin className="h-3 w-3" />
                          {m.location}
                        </p>
                      )}
                      {m.meeting_date && (
                        <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(m.meeting_date).toLocaleString("he-IL")}
                        </p>
                      )}
                    </Card>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </SidebarProvider>
  );
};

export default Meetings;
