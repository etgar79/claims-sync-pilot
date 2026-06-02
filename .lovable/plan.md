## מטרה
לצמצם את דיאלוג התמלול מ-5 כפתורים (טורבו + 4 ספקים) ל-**2 כפתורים בלבד**: ⚡ תמלול מהיר ו-💎 תמלול-על. בלי שינויי DB, בלי שינויי edge functions — שימוש מלא בקוד שכבר עובד.

## קובץ יחיד לעריכה
`src/components/TranscribeDialog.tsx`

## שינויים

### 1. ניקוי import + state
- מסירים `Star`, `ChevronDown` מה-imports, מוסיפים `Wand2`
- מסירים את `showAdvanced` state
- `loading` state משתנה ל-`TranscriptionService | "turbo" | "super" | null`
- מסירים את מערך `SERVICES` (לא נחוץ יותר ב-UI החדש)

### 2. שומרים כמו שהוא
- `handleTurbo` (כפתור "תמלול מהיר") — כבר עובד מצוין: פיצול חכם, 4 workers מקבילים, fallback בין whisper/elevenlabs/lovable_ai לכל chunk
- `handleSelect` — נשאר בקובץ כפונקציה פנימית למקרה ש-callers חיצוניים עוד משתמשים בה (לא נחשף ב-UI), או נמחק אם אינו בשימוש

### 3. הוספת `handleSuper` חדש (תמלול-על)
פונקציה אחת שמשתמשת בכל הקוד הקיים:
- קוראת ל-`loadAudioFile()` הקיים
- מריצה במקביל 3 מנועים: `whisper`, `elevenlabs`, `ivrit_ai`. לכל מנוע, אם הקובץ גדול → `splitAudioFile` עם chunks, אחרת קובץ שלם דרך `transcribeOneWithRetry`
- שומרת כל גרסה ב-`transcript_versions` (בדיוק כמו `MergeTranscriptsDialog`)
- אם לפחות 2 הצליחו → קוראת ל-edge function הקיים `merge-transcripts` עם הגרסאות
- שומרת את ה-merged ב-`recordings.transcript` + `transcript_versions` (is_merged=true)
- קוראת ל-`triggerAutoPipeline` (summary + extract tasks)
- אם רק מנוע אחד הצליח → משתמשת בו ישירות בלי merge

### 4. עדכון ה-UI ב-`DialogContent`
מחליפים את כל הבלוק של הכפתור היחיד + section "אפשרויות מתקדמות" + 4 הכרטיסים, ב-2 כפתורים גדולים זה לצד זה (grid 2 columns):

- **⚡ תמלול מהיר** (gradient primary) — "מהיר, חכם, מתאים לרוב המקרים"
- **💎 תמלול-על** (gradient accent/secondary) — "איכות מקסימלית — משלב 3 מנועים. לאיכות שמע ירודה / פגישות חשובות"

ה-progress bar הקיים נשאר ועובד לשני הכפתורים.

## מה לא משתנה
- `transcribe-audio` edge function — בלי שינוי
- `merge-transcripts` edge function — בלי שינוי
- `audioSplitter.ts`, `stitchSegments.ts`, `autoPipeline.ts` — בלי שינוי
- DB schema, RLS, תמחור, `usage_events` — בלי שינוי
- כל מסכי הקריאה (`RecordingCard`, `useTranscribeAll`, וכו') ממשיכים להפעיל `TranscribeDialog` בדיוק כמו היום

## תוצאה למשתמש
2 כפתורים ברורים בלבד. אין יותר צורך לבחור ספק. "תמלול מהיר" פותר 95% מהמקרים כולל קבצים גדולים בעייתיים. "תמלול-על" הוא הביטוח לאיכות מקסימלית.
