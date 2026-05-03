## מה ייעשה

הפיכת קטע האדמין בסיידבר לתפריט נפתח (collapsible) עם תתי־פריטים מקובצים לפי תחום.

### מבנה חדש לסיידבר (אדמין בלבד)

במקום 3 פריטים שטוחים תחת "ניהול":
- ניהול משתמשים
- תוכן לפי משתמש
- צריכה ועלויות

יהיה פריט יחיד בולט: **🛡️ אדמין** עם chevron, ובלחיצה נפתחת רשימה:
- משתמשים והרשאות → `/admin`
- תוכן לפי משתמש → `/admin/users`
- חיובים ועלויות → `/usage`

הקבוצה תיפתח אוטומטית כשהמשתמש נמצא באחד ממסכי האדמין (`/admin*` או `/usage`).

במצב collapsed (סיידבר מצומצם) — מוצג כפתור עם אייקון Shield בלבד, ולחיצה פותחת popover עם הרשימה (ברירת מחדל של shadcn).

### פרטים טכניים

- `src/components/AppSidebar.tsx`:
  - מייבא `Collapsible, CollapsibleTrigger, CollapsibleContent` מ-shadcn.
  - מפצל את `managementItems` ל-`adminItems` (3 פריטי אדמין) + `commonItems` (תמלולים + הגדרות).
  - בונה `<SidebarGroup>` חדש עם `<Collapsible defaultOpen={pathname.startsWith('/admin') || pathname==='/usage'}>` שעוטף `SidebarMenuButton` עם chevron, ו-`<CollapsibleContent>` עם `SidebarMenuSub` המכיל את 3 הפריטים.
  - שאר הפריטים (תמלולים, הגדרות) נשארים בקבוצת "ניהול" הרגילה.
- ללא שינוי ב-DB וללא שינוי במסכי האדמין עצמם.

## קבצים שיתעדכנו

- `src/components/AppSidebar.tsx`
