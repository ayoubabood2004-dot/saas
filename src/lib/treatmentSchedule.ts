// ============================================================================
// جدولة الجرعات — the clock behind the treatment whiteboard.
//
// Until now a plan wrote ONE flowsheet row per drug per DAY, with an empty
// time. That made "متأخّر" undecidable: a dose due at 10:00 and one due at
// 20:00 looked identical all day long, so the board could only ever say "في
// جرعات اليوم" — never "هاي متأخرة ساعتين".
//
// So the plan now materialises one row PER DOSE at a real clock time, and this
// module owns both halves of that contract:
//   1. which times a frequency lands on, and
//   2. what a row's status is at any given moment.
//
// Slots are clinic-practical, not textbook q-intervals: they anchor at 10:00,
// when most clinics here actually open, and end by 22:00 — no 08:00 row nobody
// is there to give, no 00:00 row that belongs to the next calendar day.
// The doctor can always edit a time on the sheet.
// ============================================================================
import type { TreatmentEntry } from "@/types";
import { getWorkHours, getDoseWindow } from "./settings";

/** Clock slots by doses-per-day. Index 0 is unused (PRN has no schedule).
 *  These are the FALLBACK for clinics that haven't set their work hours yet —
 *  once a دوام is configured in Settings, doseTimesFor derives real times
 *  from it instead (بداية الدوام، وسطه…) so the plan follows the clinic. */
export const DOSE_TIMES: Record<number, string[]> = {
  1: ["10:00"],
  2: ["10:00", "20:00"],
  3: ["10:00", "15:00", "20:00"],
  4: ["10:00", "14:00", "18:00", "22:00"],
};

/* ---- التزامن مع دوام العيادة ----------------------------------------------
 * نافذة الإعطاء = نافذة الدكتور المخصصة إن ثبّتها («يعطى من هاي الساعة لهاي
 * الساعة»)، وإلا الدوام نفسه (الصباحي + المسائي معاً). الجرعات تتوزّع على
 * **دقائق العمل الفعلية** بالتساوي: كل جرعة عند الكسر k/n من مجموع وقت
 * الدوام. فمرّتان باليوم بدوامٍ واحد = بدايته ووسطه، وبدوامين = بداية كل
 * دوام — وهو بالضبط ما يعيشه الطبيب، لا معادلة كتاب. */
export interface Segment { from: number; to: number }

const segMinutesOf = (hhmm: string): number | undefined => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return undefined;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** يبني مقاطعَ النافذة من دوامٍ ونافذةٍ معطيين — نقيّة، فتصلح لمعاينة
 *  الإعدادات الحيّة قبل الحفظ كما تصلح للجدولة الفعلية. */
export function segmentsFrom(wh: { am: { from: string; to: string } | null; pm: { from: string; to: string } | null }, dw: { mode: "auto" | "custom"; from?: string; to?: string }): Segment[] {
  if (dw.mode === "custom" && dw.from && dw.to) {
    const f = segMinutesOf(dw.from), t = segMinutesOf(dw.to);
    if (f !== undefined && t !== undefined && t > f) return [{ from: f, to: t }];
  }
  const segs: Segment[] = [];
  for (const s of [wh.am, wh.pm]) {
    if (!s) continue;
    const f = segMinutesOf(s.from), t = segMinutesOf(s.to);
    if (f !== undefined && t !== undefined && t > f) segs.push({ from: f, to: t });
  }
  return segs.sort((a, b) => a.from - b.from);
}

/** نافذة الإعطاء مقاطعَ دقائق مرتّبة — فارغة حين لا دوام ولا نافذة مخصصة. */
export function doseSegments(): Segment[] {
  return segmentsFrom(getWorkHours(), getDoseWindow());
}

const toHHMM = (min: number) => `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;

/** توزيع n جرعات على المقاطع بالتساوي — كل جرعة عند الكسر k/n من مجموع
 *  دقائق العمل، بتقريبٍ لأقرب ربع ساعة داخل المقطع نفسه. */
export function distributeDoses(segs: Segment[], n: number): string[] {
  if (!segs.length || n < 1) return [];
  const total = segs.reduce((s, g) => s + (g.to - g.from), 0);
  const out: string[] = [];
  for (let k = 0; k < n; k++) {
    let pos = Math.floor((total * k) / n);
    let abs = segs[segs.length - 1].to;
    let seg = segs[segs.length - 1];
    for (const g of segs) {
      const len = g.to - g.from;
      if (pos < len) { abs = g.from + pos; seg = g; break; }
      pos -= len;
    }
    const rounded = Math.max(seg.from, Math.min(seg.to, Math.round(abs / 15) * 15));
    const hhmm = toHHMM(rounded);
    if (!out.includes(hhmm)) out.push(hhmm);
  }
  return out;
}

/** The times a dose lands on for a given daily count — empty for PRN/unknown.
 *  Clinic work hours (or the custom dose window) drive the times when set;
 *  the historical 10:00–22:00 slots remain the fallback. */
export function doseTimesFor(perDay: number): string[] {
  if (!Number.isFinite(perDay) || perDay < 1) return [];
  const n = Math.min(4, Math.round(perDay));
  const segs = doseSegments();
  if (!segs.length) return DOSE_TIMES[n] ?? DOSE_TIMES[1];
  const out = distributeDoses(segs, n);
  return out.length ? out : (DOSE_TIMES[n] ?? DOSE_TIMES[1]);
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
