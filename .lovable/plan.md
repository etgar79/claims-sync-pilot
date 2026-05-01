
# תוכנית: סנכרון Drive פרטי לכל יוזר + תיוג הקלטות

## עקרונות ברזל
1. **כל יוזר = חשבון Google משלו** (כבר קיים — `google_drive_connections` עם `user_id`).
2. **הפרדה מוחלטת**: שמאי לא רואה דבר של אדריכל, ולהיפך. RLS קיימת ועובדת.
3. **אדמין רואה ועושה הכל** (RLS קיימת).
4. **תיקיית Drive נפרדת לכל workspace**: שמאי בוחר תיקיית הקלטות שטח, אדריכל בוחר תיקיית הקלטות פגישות.
5. **סנכרון ידני בלחיצת כפתור** (לא אוטומטי) — היוזר בשליטה.
6. **תיוג ידני אחרי סנכרון**: ההקלטה נכנסת "ללא שיוך", והיוזר מתייג אותה.

## איך זה ייראה לכל יוזר

### שמאי
- **הגדרות** → כרטיס "תיקיית הקלטות שטח" → מחבר Drive (אם לא מחובר) → בוחר תיקייה.
- **/recordings** → באנר עליון: שם התיקייה + [סנכרן עכשיו] + [פתח ב-Drive].
- אחרי סנכרון: הקלטות חדשות מופיעות עם תג **"ללא שיוך"** ועם כפתור **"שייך לתיק שומה"** (Select של תיקי השומה שלו, או "צור תיק חדש").

### אדריכל
- **הגדרות** → כרטיס "תיקיית הקלטות פגישות" → מחבר Drive → בוחר תיקייה.
- **/meetings** → באנר עליון: שם התיקייה + [סנכרן עכשיו] + [פתח ב-Drive].
- אחרי סנכרון: הקלטות חדשות מופיעות כ**"הקלטות לא משויכות"** עם כפתור **"שייך לפגישה"** (Select של פגישות קיימות, או "צור פגישה חדשה מההקלטה" — שם הקובץ נהיה כותרת).

### אדמין
- רואה ב-Settings את **שני הכרטיסים** (תיקיית שמאי + תיקיית אדריכל) של החשבון שלו.
- ב-Workspace Switcher יכול לעבור בין מצב שמאי / אדריכל / סקירה כללית.
- בעמוד ניהול משתמשים יכול לראות את התיקיות והחיבורים של כל יוזר אחר.

## שינויים טכניים

### 1. DB — מיגרציה
**`drive_work_folders.folder_type`** מקבל ערכים מוגדרים:
- `appraiser_recordings`
- `architect_meetings`
- (`input` קיים → ימופה לפי תפקיד היוזר במיגרציה)

**`recordings`**: שדה `case_id` הופך **nullable** (כדי לאפשר הקלטה "ללא שיוך"). מוסיף `source` ('drive_sync' | 'manual_upload') ו-`drive_file_id` (UNIQUE per user) למניעת כפילויות בסנכרון חוזר.

**`meeting_recordings`**: אותו דבר — `meeting_id` nullable + `drive_file_id` ו-`source`.

### 2. Edge Function חדשה: `drive-sync`
Body: `{ workspace: 'appraiser' | 'architect' }`
- מאמת JWT, מוצא את `user_id`.
- שולף את `drive_work_folders` של היוזר לפי `folder_type` המתאים.
- שולף את ה-Google token של היוזר (שלו בלבד) מ-`google_drive_connections`.
- קורא ל-Drive API → מקבל רשימת קבצי אודיו/וידאו בתיקייה.
- לכל קובץ שלא קיים ב-DB (לפי `drive_file_id` + `user_id`):
  - שמאי → `INSERT INTO recordings` עם `case_id=NULL`, `source='drive_sync'`.
  - אדריכל → `INSERT INTO meeting_recordings` עם `meeting_id=NULL`, `source='drive_sync'`.
- מחזירה: `{ added: N, existing: M, total: K }`.

### 3. רכיבי UI חדשים
- **`WorkspaceFolderBanner`** — באנר אחיד בראש דפי `/recordings` ו-`/meetings`:
  ```
  📁 תיקיית הקלטות שטח: "פגישות 2026"  [סנכרן]  [פתח ב-Drive]  [שנה תיקייה]
  ```
  אם לא מוגדר — מציג CTA "הגדר תיקייה בהגדרות →".

- **`AssignRecordingDialog`** (לשמאי) — דיאלוג עם Select של תיקי שומה + כפתור "צור תיק חדש".
- **`AssignToMeetingDialog`** (לאדריכל) — Select של פגישות + כפתור "צור פגישה מההקלטה".

### 4. עדכון דפים קיימים
- **`Settings.tsx`** — מחליף את כרטיס `WorkFolderPicker` היחיד בשני כרטיסים נפרדים לפי תפקיד. אדמין רואה את שניהם.
- **`Recordings.tsx`** — מוסיף באנר, מציג סקציה "ללא שיוך" עם כפתור תיוג.
- **`Meetings.tsx`** — מוסיף באנר + סקציית "הקלטות לא משויכות" בראש הדף, מסיר/מפשט את `ImportFromDriveDialog`.

### 5. הוקים חדשים
- `useWorkspaceFolder(workspace)` — שולף תיקיה לפי workspace.
- `useDriveSync(workspace)` — מפעיל את ה-edge function ומחזיר loading + תוצאה.

## קבצים מושפעים

**חדשים:**
- `supabase/migrations/<timestamp>_drive_sync.sql`
- `supabase/functions/drive-sync/index.ts`
- `src/hooks/useWorkspaceFolder.ts`
- `src/hooks/useDriveSync.ts`
- `src/components/WorkspaceFolderBanner.tsx`
- `src/components/AssignRecordingDialog.tsx`
- `src/components/AssignToMeetingDialog.tsx`

**משתנים:**
- `src/components/WorkFolderPicker.tsx` (מקבל `workspace` כ-prop)
- `src/pages/Settings.tsx` (שני כרטיסים לפי תפקיד)
- `src/pages/Recordings.tsx` (באנר + סקציית לא-משויכות + תיוג)
- `src/pages/Meetings.tsx` (באנר + סקציית לא-משויכות + תיוג)

## אבטחה
- ה-edge function משתמשת ב-`getClaims()` כדי לאמת את היוזר.
- כל הקריאות ל-Drive נעשות עם **ה-token של אותו יוזר** (מתוך `google_drive_connections.user_id = auth.uid()`).
- **אף יוזר לא יכול לסנכרן או לראות תיקייה של יוזר אחר** — לא ב-UI ולא ב-API.
- אדמין: ה-RLS הקיימת (`Admins manage all...`) נותנת לו לראות את הכל **בקוד**, אבל הסנכרון עצמו תמיד רץ עבור היוזר המחובר.

## מה לא נכלל (אפשר אחר כך)
- סנכרון אוטומטי ברקע (cron).
- סנכרון דו-כיווני (מחיקה ב-Drive → מחיקה במערכת).
- העלאת קבצים מהמערכת חזרה ל-Drive.

---

**מאשר?** ברגע שתאשר, אני מבצע ברצף: מיגרציה → edge function → הוקים → קומפוננטות → עדכון 3 הדפים.
