// קונפיג של תפריט האדמין.
// ADMIN_TOOLS_ITEMS — קבוצת "כלי אדמין" (משתמשים, תוכן, חיובים).
// כדי להסתיר פריט: hidden: true. כדי לשנות סדר: סדר מחדש את המערך.

import { Shield, Users, DollarSign, type LucideIcon } from "lucide-react";

export type AdminMenuItem = {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
  hidden?: boolean;
};

export const ADMIN_TOOLS_ITEMS: AdminMenuItem[] = [
  { key: "users-permissions", title: "משתמשים והרשאות", url: "/admin", icon: Shield },
  { key: "content-by-user", title: "תוכן לפי משתמש", url: "/admin/users", icon: Users },
  { key: "billing-usage", title: "חיובים ועלויות", url: "/usage", icon: DollarSign },
];

// תאימות לאחור
export const ADMIN_MENU_ITEMS = ADMIN_TOOLS_ITEMS;
