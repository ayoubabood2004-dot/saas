// ============================================================================
// CBC (Complete Blood Count) reference panel — the values a vet reads off a
// blood analyser, each with a species-aware NORMAL band so the app can flag a
// result as low / normal / high as the doctor drags the slider.
//
// Slider bounds (min/max) are deliberately wider than the normal band so both
// healthy and markedly abnormal values are reachable. Ranges are typical adult
// dog/cat references; other species fall back to the dog band.
// ============================================================================
import type { Species } from "@/types";

export type CbcSpeciesKey = "dog" | "cat";
export interface CbcParam {
  id: string;
  label: string;   // Arabic name
  abbr: string;    // WBC, HGB, …
  unit: string;
  min: number;     // slider lower bound
  max: number;     // slider upper bound
  step: number;
  ranges: Record<CbcSpeciesKey, [number, number]>; // normal band per species
}

export const CBC: CbcParam[] = [
  { id: "wbc", label: "كريات بيضاء", abbr: "WBC", unit: "10³/µL", min: 0, max: 50, step: 0.1, ranges: { dog: [6, 17], cat: [5.5, 19.5] } },
  { id: "rbc", label: "كريات حمراء", abbr: "RBC", unit: "10⁶/µL", min: 0, max: 12, step: 0.1, ranges: { dog: [5.5, 8.5], cat: [5, 10] } },
  { id: "hgb", label: "هيموغلوبين", abbr: "HGB", unit: "g/dL", min: 0, max: 24, step: 0.1, ranges: { dog: [12, 18], cat: [8, 15] } },
  { id: "hct", label: "هيماتوكريت (PCV)", abbr: "HCT", unit: "%", min: 0, max: 70, step: 1, ranges: { dog: [37, 55], cat: [30, 45] } },
  { id: "plt", label: "صفائح دموية", abbr: "PLT", unit: "10³/µL", min: 0, max: 800, step: 5, ranges: { dog: [200, 500], cat: [300, 700] } },
  { id: "mcv", label: "متوسط حجم الكرية", abbr: "MCV", unit: "fL", min: 30, max: 90, step: 1, ranges: { dog: [60, 77], cat: [39, 55] } },
  { id: "neut", label: "العدلات", abbr: "NEU", unit: "10³/µL", min: 0, max: 30, step: 0.1, ranges: { dog: [3, 11.5], cat: [2.5, 12.5] } },
  { id: "lymph", label: "اللمفاويات", abbr: "LYM", unit: "10³/µL", min: 0, max: 20, step: 0.1, ranges: { dog: [1, 4.8], cat: [1.5, 7] } },
];

export type CbcFlag = "low" | "normal" | "high";

/** Resolve the normal band for a parameter given the patient's species (dog fallback). */
export function cbcRange(p: CbcParam, species?: Species): [number, number] {
  return species === "cat" ? p.ranges.cat : p.ranges.dog;
}

export function cbcFlag(value: number, [lo, hi]: [number, number]): CbcFlag {
  if (value < lo) return "low";
  if (value > hi) return "high";
  return "normal";
}

export const FLAG_LABEL: Record<CbcFlag, string> = { low: "منخفض ↓", normal: "طبيعي", high: "مرتفع ↑" };
export const FLAG_ARROW: Record<CbcFlag, string> = { low: "↓", normal: "•", high: "↑" };

export function cbcById(id: string): CbcParam | undefined {
  return CBC.find((p) => p.id === id);
}
