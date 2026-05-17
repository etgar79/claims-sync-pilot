
# הפרדת נתונים לפי משתמש לאדמין

המטרה: לאפשר לאדמין לעבור בקלות בין נתונים של יוזרים שונים מכל מקום במערכת, בלי לחזור כל פעם ל-AdminUsers.

## מצב נוכחי (קיים)

- `src/lib/actAs.ts` — תשתית "פעל כמשתמש" (localStorage + event).
- `ActAsUserBanner` — באנר צהוב כשהאדמין מאמפרסן.
- `AdminUsers` — מסך עם רשימת יוזרים + כפתור "פעל כמשתמש זה".
- `getScopedUserId()` — כל דף רשימה מסנן `.eq("user_id", scoped)`.

הבעיה: כדי להחליף יוזר צריך כל פעם לנווט ל-`/admin/users`, לבחור, לחזור. אין מסך-על של כולם.

## מה נבנה

### 1. `<AdminUserSwitcher />` — בורר גלובלי בסיידבר (הפיצ'ר העיקרי)
רכיב חדש שמופיע **רק לאדמין**, בראש הסיידבר מתחת ללוגו:
- Combobox עם רשימת כל היוזרים (`profiles` + `user_roles`) כולל אייקון תפקיד וספירת תיקים/הקלטות.
- ברירת מחדל: "אני עצמי (מנהל)" — מצב רגיל.
- בחירת יוזר → קורא ל-`setActAs(user_id, name)` ומבצע `navigate("/")` כדי לרענן.
- כשבמצב אימפרסונציה — מראה את שם היוזר + X לחזרה למצב מנהל.
- חיפוש חופשי בתוך ה-Combobox.
- במצב סיידבר מכווץ — מציג רק אייקון `UserCog` עם tooltip.

### 2. דשבורד-על חדש: `/admin/overview`
דף שמציג טבלה של **כל היוזרים זה ליד זה**:
- עמודות: שם, תפקיד, #תיקים, #פגישות, #הקלטות, #תמלולים, #משימות פתוחות, פעילות אחרונה, שגיאות אחרונות (מ-`system_logs` level=error).
- מיון לפי כל עמודה, חיפוש.
- קליק על שורה → `setActAs` + מעבר לדשבורד היוזר.
- כפתור "פתח כל הפעולות" → ניווט ל-AdminUsers הקיים לפרטים מלאים.
- מתווסף ל-`ADMIN_TOOLS_ITEMS` בסיידבר ("סקירת יוזרים").

### 3. שיפור RoleHome לאדמין
כשאדמין מתחבר ו-workspace=admin **ולא במצב impersonation** → redirect ל-`/admin/overview` (במקום דשבורד אישי ריק). אם הוא במצב אימפרסונציה → redirect ל-`/` של היוזר שהוא מאמפרסן.

### 4. אינדיקציה בכל מסך רשימה
לא נשנה את ה-queries (כבר תקינים דרך `getScopedUserId`). אבל נוסיף ב-header של כל דף רשימה (Recordings/Cases/Tasks/...) טקסט קטן "מציג נתונים של: {שם}" — כדי שאדמין לא יתבלבל. נעשה זאת דרך hook משותף `useCurrentScopeLabel()` חדש.

## פירוט טכני

### קבצים חדשים
- `src/components/AdminUserSwitcher.tsx` — Combobox עם list+search ושימוש ב-`useActAsUser`+`setActAs`.
- `src/pages/AdminOverview.tsx` — דשבורד הטבלה.
- `src/hooks/useCurrentScopeLabel.ts` — מחזיר `{ isImpersonating, name }`.
- `src/components/ScopeIndicator.tsx` — תווית קטנה "מציג: שם" עם כפתור יציאה.

### קבצים לעריכה
- `src/components/AppSidebar.tsx` — להוסיף `<AdminUserSwitcher />` ב-SidebarHeader (רק כש-`isAdmin`).
- `src/config/adminMenu.ts` — להוסיף פריט "סקירת יוזרים" → `/admin/overview`.
- `src/App.tsx` — להוסיף route `/admin/overview` עם `ProtectedRoute allow=["admin"]`.
- `src/pages/RoleHome.tsx` — לוגיקת redirect אדמין → `/admin/overview` כשלא ב-impersonation.
- דפי רשימה עיקריים (Recordings, Cases, Meetings, Tasks, TranscriptsPage) — להוסיף `<ScopeIndicator />` ב-header. (שינוי קוסמטי בלבד, לא נוגעים ב-queries).

### אין שינויי DB
RLS כבר מטופל (admin policies + filter `.eq("user_id", scoped)` בכל דף). אין צורך במיגרציה.

## למה זה פותר את הבעיה
- בורר אחד בסיידבר = החלפת יוזר בקליק יחיד מכל מסך, בלי לאבד את ההקשר (workspace, דף נוכחי).
- דשבורד-על = ראייה מקרוב של כל היוזרים בלי לבחור אחד.
- ScopeIndicator = אדמין תמיד יודע בודאות אילו נתונים הוא רואה כרגע.

## מחוץ ל-scope
- אין שינוי בהפרדת ה-Drive (כבר מבודד).
- אין שינוי במנגנון ה-RLS עצמו.
- אין מצב "ראה הכול ביחד" (כל היוזרים בערבוביה) — סיכון בלבול גבוה, הוצא לשלב הבא אם תרצה.
