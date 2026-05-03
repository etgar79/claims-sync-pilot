// סדר הפריטים בקבוצת "כלי אדמין" בסיידבר.
// כדי לשנות סדר — פשוט סדר מחדש את המערך.
// כדי להסתיר פריט — הוסף hidden: true.
// כדי להוסיף פריט חדש — הוסף אובייקט עם key ייחודי, title, url, icon (משם lucide-react).

import { Shield, Users, DollarSign, type LucideIcon } from "lucide-react";

export type AdminMenuItem = {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
  hidden?: boolean;
};

export const ADMIN_MENU_ITEMS: AdminMenuItem[] = [
  { key: "users-permissions", title: "משתמשים והרשאות", url: "/admin", icon: Shield },
  { key: "content-by-user", title: "תוכן לפי משתמש", url: "/admin/users", icon: Users },
  { key: "billing-usage", title: "חיובים ועלויות", url: "/usage", icon: DollarSign },
];
