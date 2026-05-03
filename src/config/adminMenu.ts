// קונפיג של הסיידבר במצב אדמין.
// ADMIN_TOOLS_ITEMS — קבוצת "כלי אדמין" (משתמשים, תוכן, חיובים).
// ADMIN_WORKSPACE_MODULES — כל המודולים שמוצגים לאדמין (שמאות + אדריכלות).
// כדי להסתיר פריט: hidden: true. כדי לשנות סדר: סדר מחדש את המערך.

import {
  Shield, Users, DollarSign, LayoutDashboard, FolderOpen, Mic, FileText,
  Phone, Image as ImageIcon, Calendar, ClipboardList,
  type LucideIcon,
} from "lucide-react";

export type AdminMenuItem = {
  key: string;
  title: string;
  url: string;
  icon: LucideIcon;
  hidden?: boolean;
};

export type AdminModuleGroup = {
  key: string;
  label: string;
  hidden?: boolean;
  items: AdminMenuItem[];
};

export const ADMIN_TOOLS_ITEMS: AdminMenuItem[] = [
  { key: "users-permissions", title: "משתמשים והרשאות", url: "/admin", icon: Shield },
  { key: "content-by-user", title: "תוכן לפי משתמש", url: "/admin/users", icon: Users },
  { key: "billing-usage", title: "חיובים ועלויות", url: "/usage", icon: DollarSign },
];

// תאימות לאחור
export const ADMIN_MENU_ITEMS = ADMIN_TOOLS_ITEMS;

export const ADMIN_WORKSPACE_MODULES: AdminModuleGroup[] = [
  {
    key: "overview",
    label: "ממשק אדמין",
    items: [
      { key: "overview", title: "סקירה כללית", url: "/", icon: LayoutDashboard },
    ],
  },
  {
    key: "appraiser",
    label: "מערכת שמאות",
    items: [
      { key: "appraiser-cases", title: "תיקי שומה", url: "/cases", icon: FolderOpen },
      { key: "appraiser-clients", title: "לקוחות (שמאי)", url: "/clients", icon: Users },
      { key: "appraiser-recordings", title: "הקלטות שטח", url: "/recordings", icon: Mic },
      { key: "appraiser-transcripts", title: "תמלולים (שמאי)", url: "/transcripts", icon: FileText },
      { key: "appraiser-phone", title: "שיחות טלפון (שמאי)", url: "/phone-calls", icon: Phone },
      { key: "appraiser-photos", title: "תמונות (שמאי)", url: "/photos", icon: ImageIcon },
      { key: "appraiser-templates", title: "תבניות דוחות", url: "/templates", icon: FileText },
    ],
  },
  {
    key: "architect",
    label: "ניהול פגישות",
    items: [
      { key: "architect-meetings", title: "פגישות", url: "/meetings", icon: Calendar },
      { key: "architect-recordings", title: "הקלטות פגישה", url: "/meeting-recordings", icon: Mic },
      { key: "architect-transcripts", title: "תמלולי פגישות", url: "/meeting-transcripts", icon: FileText },
      { key: "architect-phone", title: "שיחות טלפון (פגישות)", url: "/meeting-phone-calls", icon: Phone },
      { key: "architect-photos", title: "תמונות (פגישות)", url: "/meeting-photos", icon: ImageIcon },
      { key: "architect-templates", title: "תבניות סיכום פגישה", url: "/meeting-templates", icon: ClipboardList },
    ],
  },
];
