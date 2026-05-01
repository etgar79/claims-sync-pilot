// Map internal AI service identifiers to user-facing generic labels.
// We never show third-party brand names to end users.

export const SERVICE_LABEL: Record<string, string> = {
  ivrit_ai: "AI חסכוני",
  whisper: "AI מהיר",
  elevenlabs: "AI איכות גבוהה",
  lovable_ai: "AI סיכום",
  merged: "תמלול-על משולב",
};

export function serviceLabel(id?: string | null): string {
  if (!id) return "AI";
  return SERVICE_LABEL[id] ?? "AI מותאם";
}
