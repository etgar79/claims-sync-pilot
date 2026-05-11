import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

/**
 * מאזין גלובלי: כש-AI מחלץ משימות חדשות (extracted_tasks הוכנסו),
 * מציג toast עם כפתור "לאישור משימות" שמעביר ל-/tasks.
 * נטען פעם אחת בשורש האפליקציה.
 */
export function PipelineToastListener() {
  const navigate = useNavigate();

  useEffect(() => {
    let userId: string | null = null;
    let lastShown = 0;

    const start = async () => {
      const { data } = await supabase.auth.getUser();
      userId = data.user?.id ?? null;
      if (!userId) return;

      const ch = supabase
        .channel("pipeline-toast")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "extracted_tasks", filter: `user_id=eq.${userId}` },
          (payload: any) => {
            // throttle — toast אחד כל 5 שניות
            const now = Date.now();
            if (now - lastShown < 5000) return;
            lastShown = now;
            const title = payload.new?.title ?? "משימה חדשה";
            toast.success("AI חילץ משימות חדשות", {
              description: title,
              action: {
                label: "לאישור",
                onClick: () => navigate("/tasks"),
              },
              duration: 8000,
            });
          }
        )
        .subscribe();

      return ch;
    };

    let chPromise = start();
    return () => {
      chPromise.then((ch) => ch && supabase.removeChannel(ch));
    };
  }, [navigate]);

  return null;
}
