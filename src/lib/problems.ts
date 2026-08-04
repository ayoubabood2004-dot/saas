// ============================================================================
// قائمة المشاكل — the patient's master problem list (POMR), and the bridge that
// makes it worth keeping.
//
// A problem list nobody reads is just more typing. The point here is that an
// ACTIVE problem is consulted automatically at prescribing time: a live renal
// problem turns on the same flag that already blocks NSAIDs in checkSafety, so
// the guard fires whether or not the doctor remembered the history.
// ============================================================================
import type { PetProblem, ProblemCategory } from "@/types";

export const CATEGORY_LABEL: Record<ProblemCategory, string> = {
  renal: "كلوي",
  hepatic: "كبدي",
  cardiac: "قلبي",
  endocrine: "غدد / هرموني",
  gi: "هضمي",
  derm: "جلدي",
  neuro: "عصبي",
  repro: "تناسلي / حمل",
  other: "أخرى",
};

/** Tailwind tone per category — kept here so every screen colours a problem the same. */
export const CATEGORY_TONE: Record<ProblemCategory, string> = {
  renal: "bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300",
  hepatic: "bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200",
  cardiac: "bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-200",
  endocrine: "bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300",
  gi: "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-200",
  derm: "bg-pink-100 text-pink-700 dark:bg-pink-500/20 dark:text-pink-200",
  neuro: "bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300",
  repro: "bg-fuchsia-100 text-fuchsia-700 dark:bg-fuchsia-500/20 dark:text-fuchsia-300",
  other: "bg-surface-3 text-ink-muted",
};

export const SEVERITY_LABEL: Record<"mild" | "moderate" | "severe", string> = {
  mild: "خفيفة", moderate: "متوسطة", severe: "شديدة",
};

/** The problems a clinic actually opens, so adding one is a tap not an essay. */
export const COMMON_PROBLEMS: { title: string; category: ProblemCategory; chronic: boolean }[] = [
  { title: "قصور كلوي مزمن", category: "renal", chronic: true },
  { title: "قصور كلوي حاد", category: "renal", chronic: false },
  { title: "حصى المجاري البولية", category: "renal", chronic: false },
  { title: "قصور كبدي", category: "hepatic", chronic: true },
  { title: "قصور قلبي احتقاني", category: "cardiac", chronic: true },
  { title: "سكري", category: "endocrine", chronic: true },
  { title: "فرط نشاط الغدة الدرقية", category: "endocrine", chronic: true },
  { title: "كوشينغ (فرط الكظر)", category: "endocrine", chronic: true },
  { title: "التهاب معوي مزمن", category: "gi", chronic: true },
  { title: "التهاب بنكرياس", category: "gi", chronic: false },
  { title: "حساسية جلدية مزمنة", category: "derm", chronic: true },
  { title: "صرع", category: "neuro", chronic: true },
  { title: "حمل", category: "repro", chronic: false },
];

/* ------------------------- The bridge to prescribing ----------------------- */

/** The chart flags `checkSafety` understands, derived from what's ACTIVE now. */
export interface ChartFlags {
  renal?: boolean;
  hepatic?: boolean;
  pregnant?: boolean;
  dehydrated?: boolean;
  puppy?: boolean;
}

/**
 * Turn the live problem list into prescribing flags.
 *
 * Only `active` problems count — a resolved renal episode must stop blocking
 * NSAIDs forever, otherwise the staff learn to ignore the warning. Chronic
 * problems stay active by definition, which is exactly what we want.
 */
export function flagsFromProblems(problems: PetProblem[] | undefined): ChartFlags {
  const flags: ChartFlags = {};
  for (const p of problems ?? []) {
    if (p.status !== "active") continue;
    if (p.category === "renal") flags.renal = true;
    if (p.category === "hepatic") flags.hepatic = true;
    if (p.category === "repro" && /حمل|pregnan/i.test(p.title)) flags.pregnant = true;
  }
  return flags;
}

/** Active problems first, chronic before acute, newest first within each group. */
export function sortProblems(list: PetProblem[]): PetProblem[] {
  return list.slice().sort((a, b) => {
    if (a.status !== b.status) return a.status === "active" ? -1 : 1;
    if (a.chronic !== b.chronic) return a.chronic ? -1 : 1;
    return b.created_at.localeCompare(a.created_at);
  });
}

/** A young patient (< 6 months) — drives the fluoroquinolone/tetracycline warnings. */
export function isJuvenile(dob?: string | null): boolean {
  if (!dob) return false;
  const months = (Date.now() - new Date(dob).getTime()) / (1000 * 60 * 60 * 24 * 30.44);
  return months >= 0 && months < 6;
}
