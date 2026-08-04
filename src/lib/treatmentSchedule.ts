// ============================================================================
// جدولة الجرعات — the clock behind the treatment whiteboard.
//
// Until now a plan wrote ONE flowsheet row per drug per DAY, with an empty
// time. That made "متأخّر" undecidable: a dose due at 08:00 and one due at
// 20:00 looked identical all day long, so the board could only ever say "في
// جرعات اليوم" — never "هاي متأخرة ساعتين".
//
// So the plan now materialises one row PER DOSE at a real clock time, and this
// module owns both halves of that contract:
//   1. which times a frequency lands on, and
//   2. what a row's status is at any given moment.
//
// Slots are clinic-practical, not textbook q-intervals: a 4×/day drug lands on
// waking hours instead of a 00:00 row that belongs to the next calendar day.
// The doctor can always edit a time on the sheet.
// ============================================================================
import type { TreatmentEntry } from "@/types";

/** Clock slots by doses-per-day. Index 0 is unused (PRN has no schedule). */
export const DOSE_TIMES: Record<number, string[]> = {
  1: ["08:00"],
  2: ["08:00", "20:00"],
  3: ["08:00", "14:00", "20:00"],
  4: ["08:00", "13:00", "18:00", "23:00"],
};

/** The times a dose lands on for a given daily count — empty for PRN/unknown. */
export function doseTimesFor(perDay: number): string[] {
  if (!Number.isFinite(perDay) || perDay < 1) return [];
  return DOSE_TIMES[Math.min(4, Math.round(perDay))] ?? DOSE_TIMES[1];
}

/**
 * Recover doses-per-day from what a saved plan carries: total doses over the
 * course, and the course length. PRN plans record 0 doses → no schedule.
 */
export function perDayFrom(doses: number | undefined, days: number | undefined): number {
  const d = Math.max(0, days ?? 0);
  const n = Math.max(0, doses ?? 0);
  if (!d || !n) return 0;
  return Math.max(1, Math.min(4, Math.round(n / d)));
}

/* ------------------------------- Status ---------------------------------- */

export type TaskStatus = "given" | "overdue" | "due" | "upcoming";

/**
 * How late a dose may be before the board calls it overdue. Treatment rounds
 * drift; flagging at the exact minute would paint the whole board red and
 * teach the staff to ignore it.
 */
export const GRACE_MINUTES = 60;

export const HHMM = (d = new Date()) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

const minutesOf = (hhmm: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
};

/**
 * The live status of one scheduled dose.
 *
 * A row with no time is "due" for the whole of its day rather than overdue at
 * 00:01 — legacy rows (and PRN) must not masquerade as missed doses.
 */
export function taskStatus(t: TreatmentEntry, todayISO: string, now = HHMM()): TaskStatus {
  if (t.administered_at) return "given";
  if (t.day < todayISO) return "overdue";
  if (t.day > todayISO) return "upcoming";

  const at = minutesOf(t.time ?? "");
  if (at === undefined) return "due";           // untimed → due sometime today
  const nowMin = minutesOf(now) ?? 0;
  if (nowMin >= at + GRACE_MINUTES) return "overdue";
  if (nowMin >= at) return "due";
  return "upcoming";
}

/** How many minutes late a dose is — 0 when it isn't late. */
export function minutesLate(t: TreatmentEntry, todayISO: string, now = HHMM()): number {
  if (t.administered_at || t.day > todayISO) return 0;
  if (t.day < todayISO) {
    const days = Math.round((new Date(`${todayISO}T00:00:00`).getTime() - new Date(`${t.day}T00:00:00`).getTime()) / 86400000);
    return days * 24 * 60;
  }
  const at = minutesOf(t.time ?? "");
  if (at === undefined) return 0;
  return Math.max(0, (minutesOf(now) ?? 0) - at);
}

/** "متأخرة ٣ ساعات" / "متأخرة ٤٠ دقيقة" — human lateness, not a raw number. */
export function lateLabel(mins: number): string {
  if (mins < 60) return `متأخرة ${mins} دقيقة`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `متأخرة ${h} ساعة`;
  const d = Math.floor(h / 24);
  return `متأخرة ${d} يوم`;
}

/** Board ordering: the most overdue first, then by scheduled time. */
export const STATUS_RANK: Record<TaskStatus, number> = { overdue: 0, due: 1, upcoming: 2, given: 3 };

export function compareTasks(a: TreatmentEntry, b: TreatmentEntry, todayISO: string, now = HHMM()): number {
  const ra = STATUS_RANK[taskStatus(a, todayISO, now)];
  const rb = STATUS_RANK[taskStatus(b, todayISO, now)];
  if (ra !== rb) return ra - rb;
  if (a.day !== b.day) return a.day.localeCompare(b.day);
  return (a.time || "99:99").localeCompare(b.time || "99:99");
}

/** The hour bucket a dose belongs to on the board — "١٤:٠٠" style slots. */
export function hourSlot(t: TreatmentEntry): string {
  const at = minutesOf(t.time ?? "");
  if (at === undefined) return "";
  return `${String(Math.floor(at / 60)).padStart(2, "0")}:00`;
}
