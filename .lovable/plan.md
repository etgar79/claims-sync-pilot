## ההחלטה: לא להפריד למערכות

נשארים עם **ליבה אחת**. ה-UI כבר מופרד דרך workspace (שמאי/אדריכל), המסד מבודד דרך RLS, וכל הליבה (Drive, תמלול, AI) משותפת. הפרדה לשתי מערכות תכפיל את הקוד בלי תועלת.

---

## מה נבנה

### 1. שתי תיקיות סנכרון נפרדות בהגדרות

לכל user (שמאי/אדריכל/אדמין) שתי בחירות עצמאיות:

- **תיקיית הקלטות** ב-Drive — ממנה מסונכרנים קבצי אודיו
- **תיקיית תמונות** ב-Drive — ממנה מסונכרנים קבצי תמונה (חדש)

כל אחת עם הכפתור הקיים (`WorkFolderPicker`): רשימה / חיפוש / הדבקת קישור.

### 2. תת-תיקייה אוטומטית לכל תיק/פגישה

כשנוצר תיק שמאות חדש או פגישה חדשה:
- המערכת יוצרת אוטומטית תת-תיקייה ב-Drive של ה-user, **בתוך תיקיית ההקלטות שלו**, בשם של התיק/הפגישה
- בתוך התת-תיקייה הזו תיווצרנה שתי תת-תיקיות: `הקלטות` ו-`תמונות`
- ה-URL של התיקייה נשמר ב-`cases.drive_folder_url` (כבר קיים) ובעמודה חדשה `meetings.drive_folder_url`
- כפתור "פתח ב-Drive" יופיע בכרטיס התיק/הפגישה

### 3. סנכרון לפי תיק

- כשמייבאים הקלטה/תמונה דרך `ImportFromDriveDialog` ובוחרים תיק יעד — הקובץ מועתק לתת-תיקייה של אותו תיק (תחת `הקלטות` או `תמונות`)
- תמלולים, סיכומי AI ודוחות — אופציה "שמור עותק ב-Drive" שמעלה PDF/TXT לתת-תיקייה של התיק
- כך שהשמאי נכנס ל-Drive האישי שלו ורואה תיקייה לכל מקרה עם **כל** החומר בפנים

---

## פרטים טכניים

### שינויי DB (migration)

```sql
-- תוסיף folder_type חדש לתמונות + עמודה לפגישות
ALTER TABLE public.meetings
  ADD COLUMN IF NOT EXISTS drive_folder_id text,
  ADD COLUMN IF NOT EXISTS drive_folder_url text;

ALTER TABLE public.cases
  ADD COLUMN IF NOT EXISTS drive_folder_id text;
-- (drive_folder_url כבר קיים)
```

`drive_work_folders.folder_type` יקבל ערכים חדשים:
- `appraiser_recordings` (קיים) | `appraiser_photos` (חדש)
- `architect_recordings` (קיים, היום נקרא `architect_meetings` — נשנה label בלבד) | `architect_photos` (חדש)

### Edge function — `google-drive-create-case-folder` (חדש)

Input: `{ kind: "case" | "meeting", id: uuid, name: string }`
- מוצא את `appraiser_recordings`/`architect_recordings` של ה-user (parent)
- יוצר ב-Drive תיקייה בשם `name` תחת ה-parent
- בתוכה יוצר `הקלטות` ו-`תמונות`
- מעדכן `cases.drive_folder_id/url` או `meetings.drive_folder_id/url`
- מחזיר את ה-IDs

### יצירה אוטומטית

- ב-`useCases.createCase` — אחרי insert מצליח, fire-and-forget קריאה ל-edge function
- במסך יצירת פגישה — אותו דבר
- אם ה-user עוד לא הגדיר תיקיית הקלטות → toast עדין "הגדר תיקיית הקלטות ב-Drive כדי שניצור תת-תיקייה לתיק זה"

### UI

**Settings.tsx** — בכל workspace (שמאי/אדריכל) שני `WorkFolderPicker`:
```
תיקיית הקלטות [📁 בחר]
תיקיית תמונות [📁 בחר]
```

**CaseCard / CaseDetail / MeetingDetail** — כפתור "פתח תיקייה ב-Drive" (אם `drive_folder_url` קיים).

**ImportFromDriveDialog** — אחרי בחירת תיק, אופציה "העתק גם ל-Drive של התיק".

---

## קבצים שיושפעו

- migration חדשה (עמודות + folder_types)
- `supabase/functions/google-drive-create-case-folder/index.ts` — חדשה
- `src/hooks/useWorkspaceFolder.ts` — תמיכה ב-`recordings`/`photos`
- `src/components/WorkFolderPicker.tsx` — קבלת `purpose: "recordings" | "photos"`
- `src/pages/Settings.tsx` — שני pickers לכל workspace
- `src/hooks/useCases.ts` — קריאה ל-edge function אחרי יצירת תיק
- `src/pages/Meetings.tsx` — אותו דבר אחרי יצירת פגישה
- `src/components/CaseCard.tsx` + `CaseDetail.tsx` + `MeetingDetail.tsx` — כפתור "פתח ב-Drive"

---

## מה לא נעשה עכשיו

- סנכרון רקע אוטומטי דו-כיווני (זה עתיד) — עכשיו רק יצירת תיקייה + העתקה ידנית בייבוא
- העלאת תמלולים/דוחות אוטומטית ל-Drive (אפשר להוסיף בשלב הבא, כשהבסיס יציב)
