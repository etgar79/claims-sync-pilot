// Admin "act as another user" infrastructure.
// When set, listing pages filter by this user_id and inserts use it as user_id.
// auth.getUser() is left untouched so RLS/JWT still belongs to the admin
// (admin RLS policies allow read/write on any row).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const KEY = "act_as_user_id";
const KEY_NAME = "act_as_user_name";
const EVT = "actAs-change";

export function getActAsUserId(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function getActAsUserName(): string | null {
  try {
    return localStorage.getItem(KEY_NAME);
  } catch {
    return null;
  }
}

export function setActAs(userId: string, displayName: string) {
  try {
    localStorage.setItem(KEY, userId);
    localStorage.setItem(KEY_NAME, displayName);
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {}
}

export function clearActAs() {
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(KEY_NAME);
    window.dispatchEvent(new CustomEvent(EVT));
  } catch {}
}

/**
 * Returns the user_id to use for new rows / filters.
 * If admin is acting as a user, returns that user's id; else the real user's id.
 */
export async function getEffectiveUserId(): Promise<string | null> {
  const acting = getActAsUserId();
  if (acting) return acting;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

export function useActAsUser() {
  const [actAsId, setId] = useState<string | null>(getActAsUserId());
  const [actAsName, setName] = useState<string | null>(getActAsUserName());

  useEffect(() => {
    const handler = () => {
      setId(getActAsUserId());
      setName(getActAsUserName());
    };
    window.addEventListener(EVT, handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener(EVT, handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  return {
    actAsId,
    actAsName,
    isActing: !!actAsId,
    setActAs,
    clearActAs,
  };
}
