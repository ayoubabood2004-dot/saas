// Dated reminder feed for the operational calendar's MONTH view. Plots vaccines,
// deworming, birthdays and custom reminders onto their due dates so staff can see
// what's coming well before it's due. Pure + deterministic (takes `now`/ranges in).

import type { Pet, Vaccination, Reminder } from "@/types";

export type CalReminderKind = "vaccine" | "deworming" | "birthday" | "reminder";

export interface CalReminder {
  id: string;
  kind: CalReminderKind;
  dateISO: string;
  /** Vaccine/deworming name, reminder title, or "" for birthdays. */
  title: string;
  petId?: string;
  petName?: string;
  /** Due in the past (relative to today) — surfaces with an alert accent. */
  overdue?: boolean;
}

const DEWORM_RE = /deworm|ديدان|دود/i;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Priority within a single day cell: overdue medical first, then by kind. */
const KIND_RANK: Record<CalReminderKind, number> = { vaccine: 0, deworming: 1, birthday: 2, reminder: 3 };

export function buildCalendarReminders(opts: {
  pets: Pet[];
  vaccinations?: Vaccination[];
  reminders?: Reminder[];
  fromISO: string; // inclusive visible-month start (YYYY-MM-DD)
  toISO: string; // inclusive visible-month end
  todayISO: string;
}): Map<string, CalReminder[]> {
  const { pets, vaccinations = [], reminders = [], fromISO, toISO, todayISO } = opts;
  const map = new Map<string, CalReminder[]>();
  const inRange = (iso: string) => iso >= fromISO && iso <= toISO;
  const add = (r: CalReminder) => {
    if (!inRange(r.dateISO)) return;
    const arr = map.get(r.dateISO);
    if (arr) arr.push(r);
    else map.set(r.dateISO, [r]);
  };
  const petById = new Map(pets.map((p) => [p.id, p]));

  // 💉🐛 Vaccinations & deworming — pending doses on their due date.
  for (const v of vaccinations) {
    if (v.status === "administered" || !v.due_date) continue;
    const dISO = v.due_date.slice(0, 10);
    add({
      id: `vax-${v.id}`,
      kind: DEWORM_RE.test(v.name) ? "deworming" : "vaccine",
      dateISO: dISO,
      title: v.name,
      petId: v.pet_id,
      petName: petById.get(v.pet_id)?.name,
      overdue: dISO < todayISO,
    });
  }

  // 🎂 Birthdays — this year's and next year's occurrence (covers Dec→Jan ranges).
  const years = Array.from(new Set([Number(fromISO.slice(0, 4)), Number(toISO.slice(0, 4))]));
  for (const p of pets) {
    if (!p.dob) continue;
    const birth = new Date(p.dob);
    if (Number.isNaN(birth.getTime())) continue;
    for (const yr of years) {
      add({
        id: `bday-${p.id}-${yr}`,
        kind: "birthday",
        dateISO: ymd(new Date(yr, birth.getMonth(), birth.getDate())),
        title: "",
        petId: p.id,
        petName: p.name,
      });
    }
  }

  // 🔔 Custom reminders (enabled only).
  for (const r of reminders) {
    if (!r.enabled) continue;
    const dISO = r.date.slice(0, 10);
    add({
      id: `rem-${r.id}`,
      kind: "reminder",
      dateISO: dISO,
      title: r.title,
      petId: r.pet_id ?? undefined,
      petName: r.pet_name ?? (r.pet_id ? petById.get(r.pet_id)?.name : undefined),
      overdue: dISO < todayISO,
    });
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => Number(!!b.overdue) - Number(!!a.overdue) || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  }
  return map;
}
