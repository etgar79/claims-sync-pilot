## מטרה
תמלול נקי יותר עם הפרדת דוברים יציבה + חותמת זמן לכל קטע/שורת דובר.

## מה משנים

### 1) פורמט דוברים יציב (Speaker N)
- ב-DB נשמור תמיד באנגלית: `Speaker 1`, `Speaker 2`... (לא נשבר ב-RTL/JSON/PDF/CSV).
- בתצוגה (UI בלבד) נמיר ל"דובר 1/2/3" דרך helper `formatSpeakerLabel()` ב-`src/lib/serviceLabels.ts`.
- ב-exports (PDF/Word/CSV) — אותו helper, כך שהפלט עקבי.

### 2) דיאריזציה אמיתית (זיהוי דוברים)
- ב-`supabase/functions/transcribe-audio/index.ts`:
  - **ElevenLabs Scribe**: כבר תומך ב-`diarize: true` — נפעיל ונקרא לשדה `speaker` שחוזר על כל word/segment.
  - **Whisper/OpenAI**: אין דיאריזציה מובנית. נוסיף heuristic על בסיס פאוזות (>1.2s בין segments) + שינוי "speaker turn" לפי המודל אם זמין; אחרת נשאיר Speaker יחיד.
  - **Gemini (Lovable AI)**: נעדכן ה-prompt להחזיר JSON עם `speaker` per segment ("Speaker 1/2/3...").
- מבנה `segments` שמורחב:
  ```ts
  { start, end, text, speaker?: string, words?: { start, end, text, speaker? }[] }
  ```
- ב-merge (`merge-transcripts`): נשמר את הדיאריזציה מהמנוע שיש לו את הציון הגבוה (עדיפות ElevenLabs).

### 3) תווית זמן לכל שורת דובר ב-UI
- `src/components/TimestampedTranscript.tsx`:
  - קיבוץ segments ל"בלוקים של דובר" (segments רצופים מאותו speaker מתאחדים).
  - כל בלוק יוצג כך:
    ```
    [דובר 1 · 00:12]   טקסט הקטע…
    [דובר 2 · 00:19]   תגובה…
    ```
  - ה-timestamp לחיץ → seek לאודיו (כבר קיים).
  - Hover על מילה → tooltip עם הזמן המדויק (כבר קיים).

### 4) Exports עם דובר + זמן
- `src/lib/exportTimestampedTranscript.ts`:
  - **CSV**: עמודה חדשה `speaker` (Speaker 1/2/3 — אנגלית, לתאימות Excel).
  - **PDF/Word**: עמודה/קידומת `[דובר 1 · 00:12]` בכל שורה.
- `src/lib/exportTranscriptPdf.ts`: כשאין segments, מתעלם — אין שינוי לנתיב הישן.

### 5) בלי שינוי schema
- `segments` כבר `jsonb` ב-`recordings` / `meeting_recordings` / `transcript_versions` — נוסיף `speaker` בתוך אותו JSON, ללא migration.

## שינויים בקבצים
- `supabase/functions/transcribe-audio/index.ts` — diarize per provider
- `supabase/functions/merge-transcripts/index.ts` — שמירת speaker
- `src/lib/serviceLabels.ts` — `formatSpeakerLabel()`
- `src/components/TimestampedTranscript.tsx` — קיבוץ לפי דובר + תווית `[דובר N · mm:ss]`
- `src/lib/exportTimestampedTranscript.ts` — speaker בעמודה/קידומת
- `src/components/TranscribeDialog.tsx` / `useTranscribeAll.ts` — stitch של speaker בין chunks (offset על speaker IDs כדי שלא יתערבבו)

## נקודות לתשומת לב
- בקבצים שפוצלו ל