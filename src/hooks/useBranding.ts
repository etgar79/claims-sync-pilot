import { useEffect } from "react";
import { useUserRoles } from "@/hooks/useUserRoles";

export interface Branding {
  systemName: string;       // displayed in sidebar header
  systemSubtitle: string;   // sidebar small text
  pageTitle: string;        // browser tab title
  metaDescription: string;
  authTitle: string;        // login screen title
  authSubtitle: string;
}

export function getBrandingForRoles(opts: {
  isAdmin: boolean;
  isArchitect: boolean;
  isAppraiser: boolean;
  displayName?: string;
}): Branding {
  const { isAdmin, isArchitect, isAppraiser, displayName } = opts;
  const owner = displayName?.trim();

  // Admin gets a neutral platform brand
  if (isAdmin) {
    return {
      systemName: "מערכת ניהול",
      systemSubtitle: "מנהל מערכת",
      pageTitle: "מערכת ניהול",
      metaDescription: "מערכת ניהול",
      authTitle: "מערכת ניהול",
      authSubtitle: "התחברות לחשבון",
    };
  }

  // Pure architect → meetings system, branded with their own name only
  if (isArchitect && !isAppraiser) {
    const base = owner || "ניהול פגישות";
    return {
      systemName: base,
      systemSubtitle: "ניהול פגישות, תמלול וסיכום",
      pageTitle: `${base} • ניהול פגישות`,
      metaDescription: `${base} - מערכת לניהול פגישות, תמלול אוטומטי וסיכומי AI`,
      authTitle: "ניהול פגישות",
      authSubtitle: "התחברות לחשבון",
    };
  }

  // Appraiser
  if (isAppraiser) {
    const base = owner || "ניהול תיקים";
    return {
      systemName: base,
      systemSubtitle: "ניהול תיקים והקלטות",
      pageTitle: `${base} • ניהול תיקים`,
      metaDescription: `${base} - מערכת לניהול תיקים, הקלטות ותמלולים`,
      authTitle: "ניהול תיקים",
      authSubtitle: "התחברות לחשבון",
    };
  }

  // Logged-out / unknown → fully neutral
  return {
    systemName: "מערכת ניהול",
    systemSubtitle: "התחברות נדרשת",
    pageTitle: "מערכת ניהול",
    metaDescription: "מערכת ניהול",
    authTitle: "מערכת ניהול",
    authSubtitle: "התחברות לחשבון",
  };
}

export function useBranding(): Branding {
  const { isAdmin, isArchitect, isAppraiser, displayName, loading } = useUserRoles();
  // Lazy import to avoid circular: read workspace from localStorage
  let workspace: string | null = null;
  try { workspace = typeof window !== "undefined" ? localStorage.getItem("active_workspace") : null; } catch {}

  let branding: Branding;
  if (workspace === "admin" && isAdmin) {
    branding = getBrandingForRoles({ isAdmin: true, isArchitect: false, isAppraiser: false, displayName });
  } else if (workspace === "architect") {
    branding = getBrandingForRoles({ isAdmin: false, isArchitect: true, isAppraiser: false, displayName });
  } else if (workspace === "appraiser") {
    branding = getBrandingForRoles({ isAdmin: false, isArchitect: false, isAppraiser: true, displayName });
  } else {
    branding = getBrandingForRoles({ isAdmin, isArchitect, isAppraiser, displayName });
  }

  useEffect(() => {
    if (loading) return;
    document.title = branding.pageTitle;
    const setMeta = (selector: string, value: string) => {
      const el = document.querySelector(selector) as HTMLMetaElement | null;
      if (el) el.content = value;
    };
    setMeta('meta[name="description"]', branding.metaDescription);
    setMeta('meta[name="author"]', branding.systemName);
    setMeta('meta[property="og:title"]', branding.pageTitle);
    setMeta('meta[name="twitter:title"]', branding.pageTitle);
    setMeta('meta[property="og:description"]', branding.metaDescription);
    setMeta('meta[name="twitter:description"]', branding.metaDescription);
    setMeta('meta[property="og:site_name"]', branding.systemName);
  }, [
    loading,
    branding.pageTitle,
    branding.metaDescription,
    branding.systemName,
  ]);

  return branding;
}
