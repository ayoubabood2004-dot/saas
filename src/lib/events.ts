import type { Appointment, Vaccination, Admission, Pet, Reminder, EventCategory } from "@/types";

/** A single normalised item in the unified upcoming-events feed. */
export interface UpcomingEvent {
  id: string;
  category: EventCategory;
  title: string;
  petId?: string;
  petName?: string;
  at: number; // epoch ms used for sorting
  dateISO: string; // YYYY-MM-DD (local)
  time?: string; // HH:MM
  urgent?: boolean; // overdue / due now → pinned to the top
  reminderId?: string; // present when derived from a custom reminder (removable)
  petLink?: boolean; // can navigate to the pet
}

export interface BuildInput {
  now: number;
  pets: Pet[];
  appointments?: Appointment[];
  vaccinations?: Vaccination[];
  admissions?: Admission[];
  reminders?: Reminder[];
  includeFeeding?: boolean; // owner portal: surface today's feeding times
  includeOps?: boolean; // staff: surface "treatment due" + waiting-room
  horizonDays?: number; // how far ahead to look (default 14)
  labels?: { service?: (s: string) => string; medicationDue?: string; waiting?: string };
}

function ymd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
function atOf(dateISO: string, time?: string): number {
  return new Date(`${dateISO}T${time ?? "09:00"}:00`).getTime();
}
function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Aggregate appointments, vaccines, treatments, feeding times and custom reminders
 *  into one chronological, urgency-pinned feed. Pure — i18n is supplied via `labels`. */
export function buildUpcomingEvents(input: BuildInput): UpcomingEvent[] {
  const { now, pets, appointments = [], vaccinations = [], admissions = [], reminders = [], includeFeeding, includeOps, horizonDays = 14, labels } = input;
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const startMs = startOfToday.getTime();
  const horizonMs = now + horizonDays * 86400000;
  const nameOf = (id?: string | null) => pets.find((p) => p.id === id)?.name;
  const events: UpcomingEvent[] = [];

  // Custom reminders (enabled only)
  for (const r of reminders) {
    if (!r.enabled) continue;
    const at = atOf(r.date, r.time);
    const oneOff = !r.recurring || r.recurring === "none";
    if (oneOff && (at < startMs || at > horizonMs)) continue;
    events.push({
      id: `rem_${r.id}`, category: r.category, title: r.title,
      petId: r.pet_id ?? undefined, petName: r.pet_name ?? nameOf(r.pet_id),
      at, dateISO: r.date, time: r.time, urgent: at < now && oneOff, reminderId: r.id, petLink: !!r.pet_id,
    });
  }

  // Appointments (upcoming + currently waiting)
  for (const a of appointments) {
    if (a.status === "cancelled" || a.status === "done") continue;
    const ms = new Date(a.scheduled_at).getTime();
    const waiting = a.status === "checked_in" || a.status === "in_room";
    if (!waiting && (ms < startMs || ms > horizonMs)) continue;
    events.push({
      id: `apt_${a.id}`, category: "appointment",
      title: waiting && includeOps ? (labels?.waiting ?? "In clinic") : (labels?.service?.(a.service) ?? a.service),
      petId: a.pet_id, petName: nameOf(a.pet_id),
      at: waiting ? now : ms, dateISO: ymd(new Date(a.scheduled_at)), time: hm(a.scheduled_at),
      urgent: waiting, petLink: true,
    });
  }

  // Vaccinations due / overdue
  for (const v of vaccinations) {
    if (!(v.status === "scheduled" || v.status === "overdue") || !v.due_date) continue;
    const dISO = v.due_date.slice(0, 10);
    const ms = atOf(dISO, "09:00");
    const overdue = v.status === "overdue" || ms < startMs;
    if (!overdue && ms > horizonMs) continue;
    events.push({
      id: `vax_${v.id}`, category: "vaccine", title: v.name,
      petId: v.pet_id, petName: nameOf(v.pet_id),
      at: overdue ? startMs : ms, dateISO: dISO, urgent: overdue, petLink: true,
    });
  }

  // Treatment doses due now (staff ops)
  if (includeOps) {
    for (const a of admissions) {
      if (a.kind !== "treatment" || a.status !== "active") continue;
      const base = a.last_completed_at || a.admitted_on;
      const cyc = (a.cycle_hours || 24) * 3600000;
      if (now - new Date(base).getTime() >= cyc) {
        events.push({
          id: `med_${a.id}`, category: "medication", title: labels?.medicationDue ?? "Treatment due",
          petId: a.pet_id, petName: nameOf(a.pet_id), at: now, dateISO: ymd(new Date(now)), urgent: true, petLink: true,
        });
      }
    }
  }

  // Today's feeding times (owner portal)
  if (includeFeeding) {
    const todayISO = ymd(new Date(now));
    for (const p of pets) {
      for (const m of p.diet?.schedule ?? []) {
        if (!m.enabled) continue;
        const ms = atOf(todayISO, m.time);
        if (ms < now) continue; // only still-upcoming feeds today
        events.push({
          id: `feed_${p.id}_${m.id}`, category: "feeding", title: m.label,
          petId: p.id, petName: p.name, at: ms, dateISO: todayISO, time: m.time, petLink: true,
        });
      }
    }
  }

  events.sort((a, b) => {
    const au = !!a.urgent, bu = !!b.urgent;
    return au === bu ? a.at - b.at : au ? -1 : 1;
  });
  return events;
}

/** Group label key for an event date relative to today: "today" | "tomorrow" | "" (use date). */
export function dayBucket(dateISO: string, now: number): "today" | "tomorrow" | "later" {
  const today = ymd(new Date(now));
  const tmr = ymd(new Date(now + 86400000));
  if (dateISO === today) return "today";
  if (dateISO === tmr) return "tomorrow";
  return "later";
}
