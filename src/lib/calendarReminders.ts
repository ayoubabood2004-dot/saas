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
  /** Source row this entry maps back to, so the UI can mark it done in place.
   *  vaccination → repo.updateVaccination(status:'administered'); reminder →
   *  repo.updateReminder(enabled:false). Birthdays have no stored row. */
  refKind?: "vaccination" | "reminder";
  refId?: string;
  /** True for one occurrence of a repeating custom reminder — a "done" here would
   *  kill the whole series (single `enabled` flag), so the UI hides that action. */
  recurring?: boolean;
}

const DEWORM_RE = /deworm|ديدان|دود/i;
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Priority within a single day cell: overdue medical first, then by kind. */
const KIND_RANK: Record<CalReminderKind, number> = { vaccine: 0, deworming: 1, birthday: 2, reminder: 3 };

/** Does a (possibly repeating) reminder starting at baseISO land exactly on `iso`?
 *  Shared with the calendar's "today / overdue" focus counts so recurrence is
 *  judged in one place. */
export function occursOn(baseISO: string, recurring: Reminder["recurring"], iso: string): boolean {
  const rec = recurring && recurring !== "none" ? recurring : null;
  if (!rec) return baseISO === iso;
  if (iso < baseISO) return false;
  if (rec === "daily") return true;
  const a = new Date(baseISO + "T00:00:00");
  const b = new Date(iso + "T00:00:00");
  if (rec === "weekly") return Math.round((b.getTime() - a.getTime()) / 86400000) % 7 === 0;
  return a.getDate() === b.getDate(); // monthly
}

/** Every date a (possibly repeating) reminder falls on inside the visible window.
 *  A one-off returns its single date; daily/weekly/monthly expand across the range
 *  (fast-forwarded to the first occurrence so an old start date stays cheap). */
function expandOccurrences(baseISO: string, recurring: Reminder["recurring"], fromISO: string, toISO: string): string[] {
  const rec = recurring && recurring !== "none" ? recurring : null;
  if (!rec) return baseISO >= fromISO && baseISO <= toISO ? [baseISO] : [];
  const out: string[] = [];
  const to = new Date(toISO + "T00:00:00");
  const from = new Date(fromISO + "T00:00:00");
  const cur = new Date(baseISO + "T00:00:00");
  if (cur > to) return out;
  if (rec === "daily" || rec === "weekly") {
    const step = rec === "daily" ? 1 : 7;
    if (cur < from) {
      const jumps = Math.floor((from.getTime() - cur.getTime()) / 86400000 / step);
      cur.setDate(cur.getDate() + jumps * step);
      while (cur < from) cur.setDate(cur.getDate() + step);
    }
    let guard = 0;
    while (cur <= to && guard < 120) { out.push(ymd(cur)); cur.setDate(cur.getDate() + step); guard++; }
  } else {
    let guard = 0;
    while (cur <= to && guard < 240) { if (cur >= from) out.push(ymd(cur)); cur.setMonth(cur.getMonth() + 1); guard++; }
  }
  return out;
}

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
      refKind: "vaccination",
      refId: v.id,
    });
  }

  // 🎂 Birthdays — this year's and next year's occurrence (covers Dec→Jan ranges).
  const years = Array.from(new Set([Number(fromISO.slice(0, 4)), Number(toISO.slice(0, 4))]));
  for (const p of pets) {
    if (!p.dob || p.deceased) continue; // never greet a deceased pet
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

  // 🔔 Custom reminders (enabled only) — repeating ones expand across the window
  //    so a weekly/monthly reminder shows on every due date, not just the first.
  for (const r of reminders) {
    if (!r.enabled) continue;
    const base = r.date.slice(0, 10);
    const rec = r.recurring && r.recurring !== "none";
    for (const dISO of expandOccurrences(base, r.recurring, fromISO, toISO)) {
      add({
        id: rec ? `rem-${r.id}-${dISO}` : `rem-${r.id}`,
        kind: "reminder",
        dateISO: dISO,
        title: r.title,
        petId: r.pet_id ?? undefined,
        petName: r.pet_name ?? (r.pet_id ? petById.get(r.pet_id)?.name : undefined),
        overdue: dISO < todayISO,
        refKind: "reminder",
        refId: r.id,
        recurring: rec,
      });
    }
  }

  for (const arr of map.values()) {
    arr.sort((a, b) => Number(!!b.overdue) - Number(!!a.overdue) || KIND_RANK[a.kind] - KIND_RANK[b.kind]);
  }
  return map;
}
