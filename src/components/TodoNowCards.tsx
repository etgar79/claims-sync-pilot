import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { CheckSquare, Clock, Sparkles, ArrowLeft } from "lucide-react";
import { getEffectiveUserId } from "@/lib/actAs";

type WorkspaceKind = "appraiser" | "architect" | "transcriber" | "admin";

interface TodoNowCardsProps {
  workspace: WorkspaceKind;
}

/**
 * "מה לעשות עכשיו" — 3 כרטיסי KPI שמכוונים את המשתמש לפעולה הבאה.
 * 1) משימות לאישור (extracted_tasks pending_review)
 * 2) משימות פתוחות (tasks pending)
 * 3) הקלטות בעיבוד (pipeline_status != tasks_ready)
 */
export function TodoNowCards({ workspace }: TodoNowCardsProps) {
  const navigate = useNavigate();
  const [counts, setCounts] = useState({ pending: 0, open: 0, processing: 0 });

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const uid = await getEffectiveUserId();
      if (!uid) return;
      const wsFilter = workspace === "admin" ? null : workspace;

      const extQ = supabase
        .from("extracted_tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .eq("status", "pending_review");
      if (wsFilter) extQ.eq("workspace_kind", wsFilter);

      const taskQ = supabase
        .from("tasks")
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .in("status", ["pending", "in_progress"]);
      if (wsFilter) taskQ.eq("workspace_kind", wsFilter);

      // הקלטות בעיבוד — לפי workspace
      const recTable = workspace === "architect" ? "meeting_recordings" : "recordings";
      const recQ = supabase
        .from(recTable as any)
        .select("id", { count: "exact", head: true })
        .eq("user_id", uid)
        .not("pipeline_status", "in", "(tasks_ready,uploaded)");

      const [ext, tsk, rec] = await Promise.all([extQ, taskQ, recQ]);
      if (cancelled) return;
      setCounts({
        pending: ext.count ?? 0,
        open: tsk.count ?? 0,
        processing: rec.count ?? 0,
      });
    };
    load();

    // Realtime — רענן ספירות כשמשתנה
    const ch = supabase
      .channel("todo-now")
      .on("postgres_changes", { event: "*", schema: "public", table: "extracted_tasks" }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "tasks" }, load)
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [workspace]);

  const items = [
    {
      icon: Sparkles,
      label: "משימות לאישור",
      hint: "AI חילץ — אשר ושלח",
      value: counts.pending,
      tone: "bg-primary/10 text-primary",
      onClick: () => navigate("/tasks"),
    },
    {
      icon: CheckSquare,
      label: "משימות פתוחות",
      hint: "ממתינות לטיפול",
      value: counts.open,
      tone: "bg-success/10 text-success",
      onClick: () => navigate("/tasks"),
    },
    {
      icon: Clock,
      label: "הקלטות בעיבוד",
      hint: "תמלול / סיכום בתהליך",
      value: counts.processing,
      tone: "bg-warning/10 text-warning-foreground",
      onClick: () =>
        navigate(workspace === "architect" ? "/meeting-recordings" : "/recordings"),
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {items.map((it) => (
        <Card
          key={it.label}
          onClick={it.onClick}
          className="p-4 cursor-pointer hover:border-primary transition-colors group"
        >
          <div className="flex items-start gap-3">
            <div className={`h-10 w-10 rounded-lg flex items-center justify-center ${it.tone}`}>
              <it.icon className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-2xl font-bold leading-none">{it.value}</div>
              <div className="text-sm font-medium mt-1">{it.label}</div>
              <div className="text-xs text-muted-foreground">{it.hint}</div>
            </div>
            <ArrowLeft className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
          </div>
        </Card>
      ))}
    </div>
  );
}
