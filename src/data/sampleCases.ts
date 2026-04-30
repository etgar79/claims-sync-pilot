export type CaseStatus = "active" | "pending" | "completed" | "archived";
export type CaseType = "property" | "vehicle" | "damage" | "other";

export interface Recording {
  id: string;
  filename: string;
  duration: string;
  recordedAt: string;
  transcript?: string;
  transcriptStatus: "pending" | "processing" | "completed" | "failed";
  driveUrl?: string;
}

export interface Photo {
  id: string;
  url: string;
  caption?: string;
  uploadedAt: string;
  source: "drive" | "email" | "manual";
}

export interface Note {
  id: string;
  content: string;
  createdAt: string;
}

export interface AppraisalCase {
  id: string;
  caseNumber: string;
  title: string;
  clientName: string;
  clientPhone?: string;
  address?: string;
  type: CaseType;
  status: CaseStatus;
  createdAt: string;
  updatedAt: string;
  inspectionDate?: string;
  estimatedValue?: number;
  driveFolderUrl?: string;
  recordings: Recording[];
  photos: Photo[];
  notes: Note[];
  tags: string[];
}

export const SAMPLE_CASES: AppraisalCase[] = [
  {
    id: "1",
    caseNumber: "2026-0142",
    title: "דירת 4 חדרים - רחוב הרצל",
    clientName: "משפחת כהן",
    clientPhone: "052-1234567",
    address: "הרצל 45, תל אביב",
    type: "property",
    status: "active",
    createdAt: "2026-04-15T10:00:00Z",
    updatedAt: "2026-04-28T14:30:00Z",
    inspectionDate: "2026-04-20T09:00:00Z",
    estimatedValue: 3200000,
    driveFolderUrl: "https://drive.google.com/drive/folders/example1",
    tags: ["דירה", "תל אביב", "מכירה"],
    recordings: [
      {
        id: "r1",
        filename: "ביקור_בנכס_20-04.m4a",
        duration: "12:34",
        recordedAt: "2026-04-20T09:15:00Z",
        transcriptStatus: "completed",
        transcript: "הגעתי לנכס ברחוב הרצל 45. הדירה ממוקמת בקומה 3 מתוך 5, ללא מעלית. שטח הדירה כ-110 מ\"ר, 4 חדרים, מרפסת שמש פונה דרום-מערב. מצב כללי טוב, נדרש שיפוץ קוסמטי במטבח ובחדר רחצה. רצפת פרקט במצב מצוין. חלונות אלומיניום חדשים יחסית..."
      },
      {
        id: "r2",
        filename: "שיחה_עם_שכן.m4a",
        duration: "03:21",
        recordedAt: "2026-04-20T10:00:00Z",
        transcriptStatus: "processing"
      }
    ],
    photos: [
      { id: "p1", url: "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=400", caption: "סלון", uploadedAt: "2026-04-20T09:30:00Z", source: "drive" },
      { id: "p2", url: "https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=400", caption: "מטבח", uploadedAt: "2026-04-20T09:35:00Z", source: "drive" },
      { id: "p3", url: "https://images.unsplash.com/photo-1540518614846-7eded433c457?w=400", caption: "חדר שינה ראשי", uploadedAt: "2026-04-20T09:40:00Z", source: "email" },
      { id: "p4", url: "https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=400", caption: "מרפסת", uploadedAt: "2026-04-20T09:45:00Z", source: "drive" },
    ],
    notes: [
      { id: "n1", content: "הלקוח מעוניין בהערכה למכירה. בקשה לסיום תוך שבועיים.", createdAt: "2026-04-15T10:30:00Z" },
      { id: "n2", content: "יש לבדוק היתרי בנייה - חשד לסגירת מרפסת ללא היתר.", createdAt: "2026-04-20T11:00:00Z" },
    ]
  },
  {
    id: "2",
    caseNumber: "2026-0141",
    title: "רכב טויוטה קורולה 2022",
    clientName: "דוד לוי",
    clientPhone: "054-9876543",
    type: "vehicle",
    status: "pending",
    createdAt: "2026-04-22T08:00:00Z",
    updatedAt: "2026-04-25T16:00:00Z",
    inspectionDate: "2026-04-25T14:00:00Z",
    estimatedValue: 95000,
    tags: ["רכב", "תאונה"],
    recordings: [
      {
        id: "r3",
        filename: "בדיקת_רכב.m4a",
        duration: "08:12",
        recordedAt: "2026-04-25T14:15:00Z",
        transcriptStatus: "pending"
      }
    ],
    photos: [
      { id: "p5", url: "https://images.unsplash.com/photo-1502877338535-766e1452684a?w=400", caption: "נזק קדמי", uploadedAt: "2026-04-25T14:20:00Z", source: "manual" },
      { id: "p6", url: "https://images.unsplash.com/photo-1605559424843-9e4c228bf1c2?w=400", caption: "פגוש", uploadedAt: "2026-04-25T14:22:00Z", source: "manual" },
    ],
    notes: [
      { id: "n3", content: "תאונה חזיתית. אין נפגעים. נזק לפגוש, פנס שמאל, ומכסה מנוע.", createdAt: "2026-04-25T14:30:00Z" }
    ]
  },
  {
    id: "3",
    caseNumber: "2026-0138",
    title: "בית פרטי - גבעתיים",
    clientName: "משפחת אברהם",
    clientPhone: "050-5551234",
    address: "ויצמן 12, גבעתיים",
    type: "property",
    status: "completed",
    createdAt: "2026-03-10T09:00:00Z",
    updatedAt: "2026-04-05T17:00:00Z",
    inspectionDate: "2026-03-15T10:00:00Z",
    estimatedValue: 5800000,
    tags: ["בית פרטי", "גבעתיים", "ירושה"],
    recordings: [],
    photos: [
      { id: "p7", url: "https://images.unsplash.com/photo-1568605114967-8130f3a36994?w=400", caption: "חזית", uploadedAt: "2026-03-15T10:30:00Z", source: "drive" },
    ],
    notes: [
      { id: "n4", content: "הערכה לצרכי ירושה. הוגש דוח סופי 5/4.", createdAt: "2026-04-05T17:00:00Z" }
    ]
  },
  {
    id: "4",
    caseNumber: "2026-0145",
    title: "נזקי מים - דירה ברמת גן",
    clientName: "שירה גולן",
    clientPhone: "053-3334444",
    address: "ביאליק 28, רמת גן",
    type: "damage",
    status: "active",
    createdAt: "2026-04-26T11:00:00Z",
    updatedAt: "2026-04-29T09:00:00Z",
    estimatedValue: 45000,
    tags: ["נזקי מים", "ביטוח"],
    recordings: [
      {
        id: "r4",
        filename: "סיור_נזק.m4a",
        duration: "15:42",
        recordedAt: "2026-04-28T11:00:00Z",
        transcriptStatus: "completed",
        transcript: "נזקי מים נרחבים בחדר רחצה ובמטבח. מקור הנזילה - צינור מים חמים בקיר משותף. נזק לאריחי קרמיקה, גבס תקרה, וריצוף פרקט במסדרון..."
      }
    ],
    photos: [
      { id: "p8", url: "https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=400", caption: "תקרה", uploadedAt: "2026-04-28T11:30:00Z", source: "email" },
    ],
    notes: []
  }
];
