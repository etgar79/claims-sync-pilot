## מטרה

ליצור סוג משתמש חדש **"תמלול כללי"** (transcriber) שהמערכת אצלו מצומצמת לצורך אחד בלבד: **להעלות קובץ אודיו או להקליט — ולקבל תמלול**. בלי תיקי שומה, בלי פגישות, בלי לקוחות, בלי דוחות.

המנוע (פיצול אוטומטי לקבצים גדולים, בחירת מנוע מהיר/תמלול-על, שמירה ל-Drive) — הכל כבר קיים ויעבוד גם עבורו.

---

## מה המשתמש יראה

צד-בר עם 3 פריטים בלבד:
- **הקלטות שלי** (דף ראשי) — רשימת כל ההקלטות שתימלל, עם כפתור גדול "העלה קובץ" וכפתור "הקלט עכשיו"
- **תמלולים** — רשימת התמלולים המוכנים, עם הורדה כ-TXT/PDF ושמירה ל-Drive
- **הגדרות** — חיבור Drive, פרופיל

ללא: תיקי שומה, פגישות, לקוחות, תבניות, שיחות טלפון, תמונות, דשבורד אדריכל/שמאי.

---

## שינויים טכניים

### 1. בסיס נתונים (מיגרציה)
- הוספת ערך `'transcriber'` ל-enum `public.app_role`.
- אין צורך בטבלאות חדשות — נשתמש בטבלת `recordings` הקיימת (היא כבר עם RLS לפי `user_id` ו-`case_id` יכול להישאר NULL).

### 2. תפקידים והרשאות
- `src/hooks/useUserRoles.ts` — להוסיף `AppRole = "transcriber"` ו-flag `isTranscriber`.
- `src/components/ProtectedRoute.tsx` — תומך כבר ב-`allow` גנרי, רק נוסיף את התפקיד החדש לטיפוס.
- `src/hooks/useActiveWorkspace.ts` — להוסיף workspace `"transcriber"` ל-available כשהתפקיד קיים, ולברירת מחדל הראשונה אם זה התפקיד היחיד.

### 3. ניווט וסיידבר
- `src/App.tsx` — הוספת route חדש `/transcribe` (דף ההעלאה/הקלטה) עם `allow={["transcriber"]}`. גם `/transcripts` כבר נגיש לכולם.
- `src/components/AppSidebar.tsx` — בלוק חדש `workspace === "transcriber"`:
  - "הקלטות שלי" → `/transcribe`
  - "תמלולים" → `/transcripts`
- `src/components/WorkspaceSwitcher.tsx` ו-`src/pages/RoleHome.tsx` — להוסיף META + כרטיס בחירה "מערכת תמלול".

### 4. דף חדש `src/pages/TranscribePage.tsx`
פשוט ונקי:
- כפתור גדול **"העלה קובץ אודיו"** + כפתור **"הקלט עכשיו"** (משתמש ב-`RecordCallButton` הקיים, אך ב-mode שמיועד ל-recordings ללא case).
- רשימת ההקלטות של המשתמש (`recordings` שלו, אפילו ללא `case_id`), כל אחת עם:
  - כפתור "תמלל" (פותח את `TranscribeDialog` הקיים — הוא כבר מטפל בפיצול/אחד-מתוך-שלושה).
  - סטטוס תמלול + כפתור צפייה/הורדה.
- ללא שיוך לתיק/פגישה (העלאה תיווצר עם `case_id = null`).

### 5. RoleHome
- אם `workspace === "transcriber"` → redirect ל-`/transcribe` (אין דשבורד נפרד, הדף עצמו הוא הבית).

### 6. ניהול אדמין
- `src/pages/Admin.tsx` ו-`src/pages/AdminUsers.tsx` — הוספת `transcriber` ל-`ROLE_META` עם תווית "תמלול" ואייקון `Mic`. כך אדמין יכול להקצות את התפקיד החדש למשתמש.

### 7. אדמין-יכול-הכל
- `useActiveWorkspace`: כש-isAdmin → להוסיף גם `"transcriber"` ל-available, כדי שאדמין יוכל לבדוק את המסך.

---

## למה לא צריך טבלאות חדשות / Drive נפרד

ה-Drive החיבור הקיים (`google_drive_connections`) ו-`save-transcript-to-drive` עובדים כבר היום. עבור משתמש "תמלול" — התמלולים יישמרו ב-Drive תחת התיקייה הראשית של ה-workspace שלו (אפשר ליצור folder_type חדש `transcriber_recordings` בעתיד אם תרצה הפרדה, אבל לשלב הראשון לא הכרחי).

---

## טבלת קבצים שייגעו

| קובץ | שינוי |
|------|------|
| מיגרציה SQL חדשה | `ALTER TYPE app_role ADD VALUE 'transcriber'` |
| `src/hooks/useUserRoles.ts` | `AppRole` + `isTranscriber` |
| `src/hooks/useActiveWorkspace.ts` | תמיכה ב-workspace `transcriber` |
| `src/components/ProtectedRoute.tsx` | (כמעט אוטומטי דרך הטיפוס) |
| `src/components/AppSidebar.tsx` | בלוק תפריט חדש |
| `src/components/WorkspaceSwitcher.tsx` | META חדש |
| `src/pages/RoleHome.tsx` | כרטיס בחירה + redirect |
| `src/pages/TranscribePage.tsx` | **חדש** — דף ראשי של תמלול |
| `src/App.tsx` | route חדש `/transcribe` |
| `src/pages/Admin.tsx` + `AdminUsers.tsx` | ROLE_META עם 'transcriber' |

---

## אישור לפני התחלה

האם זה מה שהתכוונת אליו? אישור כאן יתחיל את המימוש.