// Shared contract between the dashboard Reminders widget and the WhatsApp
// Campaigns page. The widget computes "what's due" (birthdays, vaccinations,
// deworming) and, on "تجهيز الإرسال", navigates to /campaigns carrying a
// CampaignPrefill in the router state; the Campaigns page reads it to pre-select
// the client and draft the message. All user-facing strings are Arabic with
// Western numerals (we interpolate raw JS numbers, never locale-formatted).
import type { Pet, Vaccination } from "@/types";

export type ReminderType = "birthday" | "vaccine" | "deworming";

/** Router-state payload passed from the Reminders widget to /campaigns. */
export interface CampaignPrefill {
  targetPetId: string;
  targetPetName?: string;
  targetOwnerName?: string;
  reminderType: ReminderType;
}

/** One actionable reminder row shown in the widget. */
export interface ReminderRow {
  id: string;
  type: ReminderType;
  petId: string;
  petName: string;
  ownerName: string;
  hasPhone: boolean;
  /** Days from today: negative = overdue, 0 = today, 1 = tomorrow… */
  inDays: number;
  /** Secondary line — the vaccine/deworming name (empty for birthdays). */
  detail: string;
}

/** Deworming is stored as a vaccination row; detect it by name (EN + AR). */
const DEWORM_RE = /deworm|ديدان|دود/i;

const startOfToday = (now: number) => {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
};

const daysFromToday = (iso: string, now: number): number | null => {
  const d = new Date(iso + (iso.length === 10 ? "T00:00:00" : ""));
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - startOfToday(now).getTime()) / 86400000);
};

/**
 * Build the actionable reminders feed: upcoming birthdays plus vaccinations /
 * deworming that are due within `windowDays` (overdue items are always kept).
 * Sorted soonest-first. Pure + deterministic (takes `now` as a number).
 */
export function computeReminderRows(
  pets: Pet[],
  vaccinations: Vaccination[],
  now: number,
  windowDays = 7,
): ReminderRow[] {
  const petById = new Map(pets.map((p) => [p.id, p]));
  const today = startOfToday(now);
  const rows: ReminderRow[] = [];

  // 🎂 Birthdays — next occurrence of the pet's month/day within the window.
  for (const p of pets) {
    if (!p.dob) continue;
    const birth = new Date(p.dob);
    if (Number.isNaN(birth.getTime())) continue;
    let next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
    next.setHours(0, 0, 0, 0);
    if (next.getTime() < today.getTime()) next = new Date(today.getFullYear() + 1, birth.getMonth(), birth.getDate());
    const inDays = Math.round((next.getTime() - today.getTime()) / 86400000);
    if (inDays >= 0 && inDays <= windowDays) {
      rows.push({
        id: `bday-${p.id}`, type: "birthday", petId: p.id, petName: p.name,
        ownerName: p.owner_name ?? "", hasPhone: !!(p.owner_phone ?? "").trim(), inDays, detail: "",
      });
    }
  }

  // 💉🐛 Vaccinations & deworming — pending items due within the window (or overdue).
  for (const v of vaccinations) {
    if (v.status === "administered" || !v.due_date) continue;
    const pet = petById.get(v.pet_id);
    if (!pet) continue;
    const inDays = daysFromToday(v.due_date, now);
    if (inDays === null || inDays > windowDays) continue;
    const type: ReminderType = DEWORM_RE.test(v.name) ? "deworming" : "vaccine";
    rows.push({
      id: `vax-${v.id}`, type, petId: pet.id, petName: pet.name,
      ownerName: pet.owner_name ?? "", hasPhone: !!(pet.owner_phone ?? "").trim(), inDays, detail: v.name,
    });
  }

  return rows.sort((a, b) => a.inDays - b.inDays);
}
