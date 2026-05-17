
# תמחור אמיתי לפי משתמש

המטרה: מסך עלויות שמשקף **את העלות האמיתית** של כל יוזר — מבוסס על תוכן ה-API responses האמיתיים ולא על אומדנים, עם אפשרות להוסיף markup לחיוב.

## הבעיות הקיימות (אבחון)

הרצתי שאילתה על `usage_events`:
- `whisper`: 71 פעולות, $2.87
- `elevenlabs`: 18 פעולות, $1.07
- `lovable_ai` (transcription): 103 פעולות, $0.62
- `gemini-2.5-pro` (transcript_merge): 3 פעולות, **$0.00** ← לא מתועד

### פערים שזיהיתי בקוד:
| Edge function | מה רץ | מה מתועד | פער |
|---|---|---|---|
| `transcribe-audio` | OpenAI/ElevenLabs/Lovable AI | ✓ לפי שניות | תמחור lovable_ai לא מדויק |
| `summarize-case` | gemini-2.5-flash | ✓ לפי טוקנים | מחיר מקודד בקוד, לא ניתן לעריכה |
| `merge-transcripts` | **gemini-2.5-pro** (יקר!) | `cost_usd: 0` | **לא מתועד בכלל** |
| `cleanup-transcript` | gemini-2.5-flash | `cost_usd: 0` | **לא מתועד בכלל** |
| `extract-action-items` | gemini-2.5-flash | אין | **לא מתועד בכלל** |
| `auto-pipeline` | רץ 2-3 קריאות gemini-flash | אין | **לא מתועד בכלל** |

**שורה תחתונה:** הדשבורד מציג כיום פחות מ-50% מהעלות האמיתית, וגם החלק המתועד מבוסס על מחירים מקודדים שלא ניתן לעדכן.

## מה נבנה

### 1. טבלת מחירים גמישה ב-DB
טבלה חדשה `service_pricing` שאדמין יכול לערוך מה-UI:
- `service` (whisper / elevenlabs / lovable_ai / gemini-2.5-flash / gemini-2.5-pro / gpt-5 וכו')
- `unit` (`seconds` | `input_tokens` | `output_tokens`)
- `cost_per_unit_usd` (numeric, דיוק גבוה)
- `markup_pct` (ברירת מחדל 0 — תוספת רווח לחיוב)
- `effective_from` (timestamp — שינוי מחיר עתידי לא משפיע על שורות עבר)

Seed עם המחירים הנוכחיים. RLS: רק אדמין רואה ועורך.

### 2. עמודת `billable_usd` ב-`usage_events`
נוסיף עמודה מחושבת — `cost_usd * (1 + markup_pct/100)` בזמן ה-INSERT, שמורה בנפרד כדי שעדכון markup לא ישנה שורות עבר. כל המקום בקוד שמחשב עלות עכשיו ישתמש בערכים מ-`service_pricing` בזמן ריצה.

### 3. עדכון כל ה-edge functions שחסרות logging
Helper מרכזי חדש `supabase/functions/_shared/usage-log.ts`:
```ts
logAiCall({ userId, model, inputTokens, outputTokens, meta })
logAudioCall({ userId, service, durationSec, meta })
```
שעושה lookup מ-`service_pricing` ומכניס שורה ל-`usage_events` עם `cost_usd` ו-`billable_usd` נכונים.

נחבר ל:
- `merge-transcripts` (כיום cost_usd:0 — קריטי, gemini-2.5-pro יקר)
- `cleanup-transcript` (כיום cost_usd:0)
- `extract-action-items` (כיום ללא logging בכלל)
- `auto-pipeline` (כל שלב — summary + extract)
- `summarize-case` (להחליף את ה-hardcoded למקור הDB)
- `transcribe-audio` (להעביר ל-DB lookup במקום קבוע)

### 4. מסך ניהול תמחור חדש: `/admin/pricing`
- טבלה עם כל ה-services + יחידה + מחיר נוכחי + markup.
- עריכה inline + כפתור "שמור" שמוסיף שורה חדשה עם `effective_from = now()`.
- היסטוריה לכל שירות (טאב "היסטוריית מחירים").
- כפתור "טען מחירים מומלצים" שמאכלס מחירים עדכניים מ-Lovable AI Gateway documentation.

### 5. שדרוג מסך Usage הקיים (`/usage`)
- הוספת עמודה "**עלות גלם**" וגם "**לחיוב**" (עם markup).
- הוספת **גרף עמודות חודשי** (recharts) — עלות לפי יוזר לאורך 12 חודשים.
- פילטר "הצג רק יוזר X" (משולב עם בורר ה-impersonation).
- כפתור "**צור חשבונית טיוטה לחודש זה**" → מייצר PDF לכל יוזר עם פירוט שירותים וסכום לחיוב.
- אינדיקטור "המחירים עודכנו לאחרונה ב-X" + לינק ל-`/admin/pricing`.

### 6. אינדיקטור עלות חי בעמוד יוזר
ב-`/admin/overview` (הדשבורד-על שבנינו) — להוסיף עמודה "**עלות חודש**" שמראה כמה הוא צבר החודש. עוזר לאדמין לראות מי "בורח" עם הצריכה.

## פירוט טכני

### קבצים חדשים
- `supabase/migrations/...sql` — `service_pricing` + עמודת `billable_usd` ב-`usage_events`.
- `supabase/functions/_shared/usage-log.ts` — Helper מרכזי.
- `src/pages/PricingAdmin.tsx` — מסך עריכת מחירים.
- `src/lib/pricing.ts` — Hook `usePricing()` + helpers `formatCurrency`, `withMarkup`.
- `src/components/UsageChart.tsx` — גרף recharts.
- `src/lib/generateInvoicePdf.ts` — יצוא חשבונית לפי יוזר.

### קבצים לעריכה
- כל 6 ה-edge functions שלעיל.
- `src/pages/Usage.tsx` — עמודות חדשות + גרף + פילטר + כפתור חשבונית.
- `src/pages/AdminOverview.tsx` — להוסיף עמודת "עלות חודש".
- `src/config/adminMenu.ts` — להוסיף "ניהול תמחור".
- `src/App.tsx` — להוסיף route `/admin/pricing`.

### שינויי DB
1. `service_pricing` — חדש (RLS: admin only).
2. `usage_events.billable_usd` — עמודה חדשה (nullable, ברירת מחדל `cost_usd`).
3. Trigger קטן שמחשב `billable_usd` ב-INSERT אם לא סופק.

## למה זה פותר את הבעיה
- **מדויק**: כל קריאת AI/transcription רושמת את הטוקנים/שניות האמיתיים מה-response, כפול המחיר מה-DB.
- **שקוף**: אדמין רואה ברגע אחד מי עלה כמה החודש, ויכול לערוך מחירים בלי deploy.
- **ניתן לחיוב**: markup לכל שירות + יצוא חשבונית = מספר אמיתי שאפשר לשלוח ללקוח.
- **היסטורי**: שינויי מחיר לא משפיעים על שורות עבר.

## מחוץ ל-scope (גל 2 אם תרצה)
- חיובים אוטומטיים דרך Stripe — דורש דיון נפרד.
- התראה ביוזר ש"קרוב למיצוי המכסה" — אפשר להוסיף אחרי שיהיה מנגנון מכסה.
- מחירון לפי תיק/פגישה (rollup) במקום רק לפי יוזר.
