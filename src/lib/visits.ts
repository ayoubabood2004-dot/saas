// ============================================================================
// Visit (زيارة) kinds + presentation helpers. A visit is a self-contained
// encounter; "illness" opens the full clinical workspace, the rest are quick
// routine visits.
// ============================================================================
import { HeartPulse, Stethoscope, Scissors, Syringe, RefreshCw, MoreHorizontal } from "lucide-react";
import type { VisitKind } from "@/types";

export interface VisitKindMeta {
  id: VisitKind;
  label: string;
  icon: typeof Stethoscope;
  /** tile + text classes (light/dark). */
  tile: string;
  /** solid accent for the open-visit header spine. */
  solid: string;
}

export const VISIT_KINDS: VisitKindMeta[] = [
  { id: "illness",     label: "زيارة مرض",     icon: HeartPulse,      tile: "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300", solid: "bg-danger-500" },
  { id: "checkup",     label: "كشف عام",       icon: Stethoscope,     tile: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",     solid: "bg-brand-600" },
  { id: "grooming",    label: "حلاقة / تنظيف", icon: Scissors,        tile: "bg-cyan-50 text-cyan-600 dark:bg-cyan-500/15 dark:text-cyan-300",         solid: "bg-cyan-600" },
  { id: "vaccination", label: "تطعيم",         icon: Syringe,         tile: "bg-emerald-50 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-300", solid: "bg-emerald-600" },
  { id: "followup",    label: "متابعة",        icon: RefreshCw,       tile: "bg-violet-50 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300",  solid: "bg-violet-600" },
  { id: "other",       label: "أخرى",          icon: MoreHorizontal,  tile: "bg-slate-100 text-slate-600 dark:bg-slate-500/20 dark:text-slate-300",     solid: "bg-slate-500" },
];

export function visitKindMeta(id: VisitKind): VisitKindMeta {
  return VISIT_KINDS.find((k) => k.id === id) ?? VISIT_KINDS[VISIT_KINDS.length - 1];
}
