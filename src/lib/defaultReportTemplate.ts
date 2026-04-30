export const DEFAULT_TEMPLATE_NAME = "דוח שמאות סטנדרטי";

export const DEFAULT_TEMPLATE_DESCRIPTION =
  "תבנית ברירת מחדל לדוח שמאות. ניתן לערוך ולשנות לפי הצורך.";

/**
 * Placeholders supported when exporting a report:
 * {{caseNumber}}, {{title}}, {{clientName}}, {{clientPhone}}, {{address}},
 * {{inspectionDate}}, {{estimatedValue}}, {{transcripts}}, {{notes}},
 * {{aiSummary}}, {{date}}, {{appraiser}}
 */
export const DEFAULT_TEMPLATE_CONTENT = `דוח שמאות מקצועי

מספר תיק: {{caseNumber}}
תאריך הדוח: {{date}}
שם השמאי: {{appraiser}}

──────────────────────────────────────────

1. פרטי הלקוח
שם הלקוח: {{clientName}}
טלפון: {{clientPhone}}
כתובת: {{address}}

2. פרטי התיק
נושא: {{title}}
תאריך ביקור: {{inspectionDate}}

3. תיאור האירוע
[הוסף כאן תיאור מפורט של האירוע / הנזק / הנכס]

4. ממצאים
[רשום את הממצאים שנצפו בביקור]

תמלולי הקלטות מהשטח:
{{transcripts}}

הערות נוספות:
{{notes}}

5. סיכום והערכה
{{aiSummary}}

הערכת שווי / נזק: ₪{{estimatedValue}}

6. מסקנות והמלצות
[רשום את המסקנות וההמלצות שלך]

──────────────────────────────────────────

בכבוד רב,
{{appraiser}}
שמאי מקצועי
`;
