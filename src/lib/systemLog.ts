// Client-side logger that persists to public.system_logs.
// Use for app-level events and errors. Best-effort; never throws.
import { supabase } from "@/integrations/supabase/client";

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogInput {
  level: LogLevel;
  source: string;
  message: string;
  context?: Record<string, unknown>;
}

export async function systemLog({ level, source, message, context }: LogInput) {
  try {
    const { data: auth } = await supabase.auth.getUser();
    const user_id = auth?.user?.id ?? null;
    await supabase.from("system_logs").insert({
      level,
      source,
      message: message.slice(0, 2000),
      context: context ?? null,
      user_id,
    });
  } catch (e) {
    // Never throw from logger
    console.warn("[systemLog] failed", e);
  }
}

export const logInfo = (source: string, message: string, context?: Record<string, unknown>) =>
  systemLog({ level: "info", source, message, context });
export const logWarn = (source: string, message: string, context?: Record<string, unknown>) =>
  systemLog({ level: "warn", source, message, context });
export const logError = (source: string, message: string, context?: Record<string, unknown>) =>
  systemLog({ level: "error", source, message, context });

let installed = false;
export function installGlobalErrorLogging() {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (e) => {
    logError("window.error", e.message || "Unknown error", {
      filename: e.filename,
      lineno: e.lineno,
      colno: e.colno,
      stack: e.error?.stack,
    });
  });
  window.addEventListener("unhandledrejection", (e) => {
    const reason: any = e.reason;
    logError("unhandledrejection", typeof reason === "string" ? reason : reason?.message || "Unhandled promise rejection", {
      stack: reason?.stack,
    });
  });
}
