// ============================================================================
// labStatus — the laboratory order lifecycle (دورة حياة التحليل).
//
// World-class labs (LIS) never treat a test as a single event; it flows through
// clear stages, each stamped with its time and owner, so anyone can see exactly
// where a case is and how long it took (turnaround time / TAT):
//
//   مطلوب → العينة مسحوبة → قيد التشغيل → النتيجة جاهزة → مُعتمدة
//   ordered   collected      running       resulted       verified
//
// A result is not shown as final on the record until a doctor VERIFIES it
// (release gate) — this is what makes the model safe and professional. Device
// results land at «النتيجة جاهزة» awaiting that one-tap release.
//
// This module is framework-agnostic (no JSX): ids, Arabic labels, ordering,
// Tailwind class strings, and the transition/TAT logic. The UI maps ids→icons.
// ============================================================================
import type { LabResult } from "@/types";

export type LabStatus = "ordered" | "collected" | "running" | "resulted" | "verified" | "canceled";

/** The forward pipeline, in order. `canceled` is off-pipeline (a side exit). */
export const LAB_FLOW: LabStatus[] = ["ordered", "collected", "running", "resulted", "verified"];

export interface StatusMeta {
  id: LabStatus;
  ar: string;            // full label
  short: string;         // compact chip label
  /** chip classes (light + dark). */
  chip: string;
  /** the timeline dot colour. */
  dot: string;
  /** lucide icon name the UI resolves. */
  icon: "ClipboardList" | "TestTube2" | "Cpu" | "FlaskConical" | "BadgeCheck" | "Ban";
}

export const STATUS_META: Record<LabStatus, StatusMeta> = {
  ordered:   { id: "ordered",   ar: "مطلوب — بانتظار سحب العينة", short: "مطلوب",        icon: "ClipboardList", chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200", dot: "bg-amber-500" },
  collected: { id: "collected", ar: "العينة مسحوبة",              short: "عينة مسحوبة",   icon: "TestTube2",     chip: "bg-violet-100 text-violet-800 dark:bg-violet-500/20 dark:text-violet-200", dot: "bg-violet-500" },
  running:   { id: "running",   ar: "قيد التشغيل بالجهاز",         short: "قيد التشغيل",   icon: "Cpu",           chip: "bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-200", dot: "bg-sky-500" },
  resulted:  { id: "resulted",  ar: "النتيجة جاهزة — بانتظار الاعتماد", short: "بانتظار الاعتماد", icon: "FlaskConical", chip: "bg-teal-100 text-teal-800 dark:bg-teal-500/20 dark:text-teal-200", dot: "bg-teal-500" },
  verified:  { id: "verified",  ar: "مُعتمدة",                     short: "مُعتمدة",       icon: "BadgeCheck",    chip: "bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-200", dot: "bg-emerald-500" },
  canceled:  { id: "canceled",  ar: "ملغاة",                       short: "ملغاة",         icon: "Ban",           chip: "bg-gray-200 text-gray-600 dark:bg-gray-500/20 dark:text-gray-300", dot: "bg-gray-400" },
};

/** The ISO timestamp column each stage stamps when reached. */
export const STAGE_AT: Record<Exclude<LabStatus, "canceled">, keyof LabResult> = {
  ordered: "ordered_at", collected: "collected_at", running: "running_at", resulted: "resulted_at", verified: "verified_at",
};

/** Derive a result's status — honouring the stored field, with a backward-
 *  compatible fallback for records saved before the lifecycle existed. */
export function statusOf(r: LabResult): LabStatus {
  if (r.status) return r.status;
  const hasResult = (r.values?.length ?? 0) > 0 || !!r.snap_result || !!(r.notes && r.notes.trim());
  if (r.panel_id === "ordered" && !hasResult) return "ordered";
  return "verified"; // a legacy saved result is, by definition, final
}

export function isFinal(s: LabStatus): boolean { return s === "verified" || s === "canceled"; }
export function isInFlight(s: LabStatus): boolean { return s === "ordered" || s === "collected" || s === "running" || s === "resulted"; }

/** The next status in the pipeline, or null at the end. */
export function nextStatus(s: LabStatus): LabStatus | null {
  const i = LAB_FLOW.indexOf(s);
  return i >= 0 && i + 1 < LAB_FLOW.length ? LAB_FLOW[i + 1] : null;
}

/** The action label for advancing FROM a status (what the button says). */
export function advanceLabel(s: LabStatus): string | null {
  switch (s) {
    case "ordered":   return "سحب العينة";
    case "collected": return "بدء التشغيل";
    case "running":   return "تسجيل النتيجة";   // opens the recording sheet
    case "resulted":  return "اعتماد النتيجة";
    default:          return null;
  }
}

/** Advancing out of «running» means RECORDING the values (opens LabEntry),
 *  not a plain status bump — the UI branches on this. */
export function advanceOpensEntry(s: LabStatus): boolean { return s === "running"; }

/** Minutes between two ISO stamps (0 if either missing / negative). */
export function minutesBetween(fromISO?: string | null, toISO?: string | null): number {
  if (!fromISO || !toISO) return 0;
  const ms = new Date(toISO).getTime() - new Date(fromISO).getTime();
  return ms > 0 ? Math.round(ms / 60000) : 0;
}

/** Turnaround time so far (ordered → resulted/verified, else → now). */
export function tatMinutes(r: LabResult, nowISO: string): number {
  const start = r.ordered_at || r.created_at || r.taken_at;
  const end = r.verified_at || r.resulted_at || nowISO;
  return minutesBetween(start, end);
}

export function formatDuration(min: number): string {
  if (min < 1) return "الآن";
  if (min < 60) return `${min} دقيقة`;
  const h = Math.floor(min / 60), m = min % 60;
  return m ? `${h} س ${m} د` : `${h} ساعة`;
}

/** An urgent (STAT) test that has been in-flight too long without a result. */
export function isOverdue(r: LabResult, nowISO: string, urgentMins = 30, routineMins = 240): boolean {
  const s = statusOf(r);
  if (s === "resulted" || isFinal(s)) return false;
  const start = r.ordered_at || r.created_at || r.taken_at;
  const waited = minutesBetween(start, nowISO);
  return waited >= (r.priority === "urgent" ? urgentMins : routineMins);
}

/** Timeline entries that actually happened, in order, for the card. */
export function timelineOf(r: LabResult): { status: Exclude<LabStatus, "canceled">; at: string }[] {
  const out: { status: Exclude<LabStatus, "canceled">; at: string }[] = [];
  for (const s of LAB_FLOW as Exclude<LabStatus, "canceled">[]) {
    const at = r[STAGE_AT[s]] as string | null | undefined;
    if (at) out.push({ status: s, at });
  }
  return out;
}
