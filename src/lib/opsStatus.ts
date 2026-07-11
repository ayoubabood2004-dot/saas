import { Stethoscope, HeartPulse, BedDouble, LogOut } from "lucide-react";
import type { Admission } from "@/types";

/* ============================================================================
 * opsStatus — the SINGLE source of truth for a case's operational status.
 *
 * Shared by the التقويم الرئيسي (Reception) and the pet record's presence bar
 * (ClinicPresenceBar), so "where is this animal right now?" is answered — and
 * changed — with EXACTLY the same semantics everywhere. Both write through
 * opsStore, so a change in one place appears in the other instantly.
 * ==========================================================================*/

export type OpStatus = "care" | "careBoarding" | "boarding" | "done";

/** The kanban columns, in reading order (RTL flips them visually). */
export const COLUMN_ORDER: OpStatus[] = ["care", "careBoarding", "boarding", "done"];

/** An admission's operational status: discharged → done; otherwise by kind. */
export function statusOf(a: Admission): OpStatus {
  if (a.status === "discharged") return "done";
  if (a.kind === "treatment") return "care";
  if (a.kind === "treatment_boarding") return "careBoarding";
  return "boarding";
}

/** The exact patch that MOVES a case to a target status (same rules as the
 *  calendar's drag-and-drop): boarding-type moves restart the stay today,
 *  done stamps the discharge date, and any move away from done re-activates. */
export function patchForStatus(target: OpStatus, todayISO: string): Partial<Admission> {
  switch (target) {
    case "care": return { kind: "treatment", status: "active", discharged_on: null };
    case "careBoarding": return { kind: "treatment_boarding", status: "active", admitted_on: todayISO, discharged_on: null };
    case "boarding": return { kind: "boarding", status: "active", admitted_on: todayISO, discharged_on: null };
    case "done": return { status: "discharged", discharged_on: todayISO };
  }
}

/** Presentation for each status — one palette for every surface. */
export const STATUS_META: Record<OpStatus, {
  key: string; def: string; icon: typeof Stethoscope;
  head: string; dot: string; card: string; over: string; chip: string;
}> = {
  care: {
    key: "reception.care", def: "تحت الرعاية الطبية", icon: Stethoscope,
    head: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
    dot: "bg-amber-500",
    card: "border-amber-200 bg-amber-50/70 dark:border-amber-500/30 dark:bg-amber-500/10",
    over: "ring-amber-400/70 bg-amber-50/80 dark:bg-amber-500/10",
    chip: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  },
  careBoarding: {
    key: "reception.careBoarding", def: "الفندقة العلاجية", icon: HeartPulse,
    head: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
    dot: "bg-rose-500",
    card: "border-rose-200 bg-rose-50/70 dark:border-rose-500/30 dark:bg-rose-500/10",
    over: "ring-rose-400/70 bg-rose-50/80 dark:bg-rose-500/10",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  },
  boarding: {
    key: "reception.boarding", def: "الفندقة", icon: BedDouble,
    head: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
    dot: "bg-sky-500",
    card: "border-sky-200 bg-sky-50/70 dark:border-sky-500/30 dark:bg-sky-500/10",
    over: "ring-sky-400/70 bg-sky-50/80 dark:bg-sky-500/10",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-200",
  },
  done: {
    key: "reception.doneLeft", def: "مكتملة / غادرت", icon: LogOut,
    head: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200",
    dot: "bg-success-500",
    card: "border-success-200 bg-success-50/60 dark:border-success-500/30 dark:bg-success-500/10",
    over: "ring-success-400/70 bg-success-50/80 dark:bg-success-500/10",
    chip: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-200",
  },
};

/** Presentation for a discharge outcome (عايش / متوفى). */
export const OUTCOME_META: Record<"recovered" | "deceased", { key: string; def: string; chip: string; emoji: string }> = {
  recovered: {
    key: "outcome.recoveredChip", def: "تعافى",
    chip: "bg-success-100 text-success-700 dark:bg-success-500/20 dark:text-success-300",
    emoji: "💚",
  },
  deceased: {
    key: "outcome.deceasedChip", def: "متوفى",
    chip: "bg-surface-3 text-ink-muted dark:bg-surface-2 dark:text-ink-subtle",
    emoji: "🖤",
  },
};

/** The pet's CURRENT admission for presence purposes: its newest row — an active
 *  one means the pet is in the clinic; a discharged one means it has left. */
export function currentAdmissionFor(petId: string, admissions: Admission[]): Admission | null {
  const mine = admissions.filter((a) => a.pet_id === petId);
  if (mine.length === 0) return null;
  const key = (a: Admission) => a.created_at ?? a.admitted_on ?? "";
  const active = mine.filter((a) => a.status !== "discharged");
  const pool = active.length ? active : mine;
  return pool.reduce((best, a) => (key(a) > key(best) ? a : best), pool[0]);
}
