## הבעיה

האדמין רואה הקלטות של משתמשים אחרים במסך הקלטות. זה כי בקוד יש סינון **רק כש-acting**: אם האדמין לא במצב "פעל כמשתמש", השאילתה לא מסננת לפי `user_id` כלל, ומדיניות RLS של אדמין מחזירה את כל הנתונים מכל המשתמשים.

בנוסף, האדמין לא יכול לתמלל ב-`/transcribe` כי הראוט פתוח רק ל-`transcriber`.

## פתרון

### 1) בידוד מוחלט של נתוני האדמין

לעדכן את `src/lib/actAs.ts`:
- להוסיף `getScopedUserId()` שמחזיר תמיד `user_id` תקין: אם אדמין במצב "פעל כמשתמש" → ה-id של המשתמש; אחרת → ה-uid האמיתי של האדמין.
- כך כל שאילתת רשימה תסונן תמיד ל-user אחד בלבד.

לעדכן את כל דפי הרשימה כך שיקראו `getScopedUserId()` ויעשו תמיד `.eq("user_id", scoped)` (במקום `if (acting) ...`):

- `src/pages/Recordings.tsx`
- `src/pages/MeetingRecordings.tsx`
- `src/pages/Meetings.tsx`
- `src/pages/PhoneCallsPage.tsx`
- `src/pages/PhotosPage.tsx`
- `src/pages/TranscriptsPage.tsx`
- `src/pages/Clients.tsx`
- `src/pages/TranscribePage.tsx`
- `src/pages/MeetingDetail.tsx` (טעינת meeting + meeting_recordings לפי id, אבל להוסיף `.eq("user_id", scoped)` כהגנה כפולה)
- `src/pages/TasksPage.tsx`
- `src/pages/GlossaryPage.tsx`
- `src/hooks/useCases.ts`
- `src/hooks/useDriveSync.ts` (אם רלוונטי לסנכרון מ-Drive)

עדיין נשמרת היכולת של האדמין להיכנס לנתוני משתמש מסוים דרך **WorkspaceSwitcher / "פעל כמשתמש"** ב-AdminUsers — RLS עדיין מתיר לו, רק שהשאילתה מבקשת user_id ספציפי.

### 2) לאפשר לאדמין לתמלל

ב-`src/App.tsx` להוסיף `admin` לרשימת ההיתרים של מסכי התמלול והעבודה:
```
/transcribe → allow={["transcriber", "admin"]}
/transcripts → allow={["transcriber", "admin"]}
```

(שאר המסלולים כבר נגישים לאדמין דרך הלוגיקה הקיימת ב-ProtectedRoute שמכבדת `workspace=admin`.)

### 3) קומפוננטות שיוך/הקלטה
לוודא ש-`AssignRecordingDialog`, `AssignToMeetingDialog`, `RecordCallButton`, `ImportFromDriveDialog` משתמשים ב-`getScopedUserId()` ב-INSERT (במקום `auth.getUser()`) כדי שגם הקלטות חדשות שהאדמין יוצר ישויכו אליו ולא יזלגו לאחר.

## פרטים טכניים

```ts
// src/lib/actAs.ts (תוספת)
export async function getScopedUserId(): Promise<string | null> {
  const acting = getActAsUserId();
  if (acting) return acting;
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}
```

```ts
// דוגמה ב-Recordings.tsx
const scoped = await getScopedUserId();
let q = supabase.from("recordings").select(...).order(...);
if (scoped) q = q.eq("user_id", scoped);
```

## מה נשאר כפי שהוא

- מדיניות RLS של אדמין נשמרת (כדי לאפשר "פעל כמשתמש" ופעולות תחזוקה).
- `seedSampleCases` ממשיך לרוץ רק לשמאי מפורש.
- בידוד Google Drive לכל משתמש כבר עובד.

## תוצאה

- אדמין רגיל רואה רק את הנתונים שלו.
- כדי לראות נתוני משתמש אחר → חובה להיכנס דרך AdminUsers → "פעל כמשתמש" (באנר צהוב יוצג).
- האדמין יכול להעלות, להקליט ולתמלל בעצמו במסך `/transcribe`.