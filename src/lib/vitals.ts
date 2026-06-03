import type { Species } from "@/types";
import { getVitalOverride, getPetRange } from "./settings";

export interface VitalRange {
  min: number;
  max: number;
  unit: string;
}

// Vital signs + complete CBC (blood count) parameters.
export type ReadingKey =
  | "temp" | "hr" | "rr" | "crt"
  | "wbc" | "rbc" | "hgb" | "hct" | "plt" | "mcv" | "mchc";
// Backward-compatible alias used across the app.
export type VitalKey = ReadingKey;

export const VITAL_KEYS: ReadingKey[] = ["temp", "hr", "rr", "crt"];
export const CBC_KEYS: ReadingKey[] = ["wbc", "rbc", "hgb", "hct", "plt", "mcv", "mchc"];

export const READING_GROUP: Record<ReadingKey, "vitals" | "cbc"> = {
  temp: "vitals", hr: "vitals", rr: "vitals", crt: "vitals",
  wbc: "cbc", rbc: "cbc", hgb: "cbc", hct: "cbc", plt: "cbc", mcv: "cbc", mchc: "cbc",
};

type RangeMap = Record<ReadingKey, VitalRange>;

const r = (min: number, max: number, unit: string): VitalRange => ({ min, max, unit });

// Approximate clinical normal ranges by species (vitals + CBC). Doctors override these
// per species (settings) and per individual animal (per-pet overrides).
export const DEFAULT_RANGES: Record<Species, RangeMap> = {
  dog: {
    temp: r(37.5, 39.2, "°C"), hr: r(60, 140, "bpm"), rr: r(10, 35, "/min"), crt: r(1, 2, "s"),
    wbc: r(6, 17, "×10³/µL"), rbc: r(5.5, 8.5, "×10⁶/µL"), hgb: r(12, 18, "g/dL"), hct: r(37, 55, "%"),
    plt: r(200, 500, "×10³/µL"), mcv: r(60, 77, "fL"), mchc: r(32, 36, "g/dL"),
  },
  cat: {
    temp: r(38.0, 39.2, "°C"), hr: r(140, 220, "bpm"), rr: r(20, 40, "/min"), crt: r(1, 2, "s"),
    wbc: r(5.5, 19.5, "×10³/µL"), rbc: r(5, 10, "×10⁶/µL"), hgb: r(8, 15, "g/dL"), hct: r(30, 45, "%"),
    plt: r(300, 800, "×10³/µL"), mcv: r(39, 55, "fL"), mchc: r(30, 36, "g/dL"),
  },
  horse: {
    temp: r(37.2, 38.6, "°C"), hr: r(28, 44, "bpm"), rr: r(8, 16, "/min"), crt: r(1, 2, "s"),
    wbc: r(5.4, 14.3, "×10³/µL"), rbc: r(6.8, 12.9, "×10⁶/µL"), hgb: r(11, 19, "g/dL"), hct: r(32, 53, "%"),
    plt: r(100, 350, "×10³/µL"), mcv: r(37, 59, "fL"), mchc: r(35, 39, "g/dL"),
  },
  cow: {
    temp: r(38.0, 39.3, "°C"), hr: r(48, 84, "bpm"), rr: r(12, 36, "/min"), crt: r(1, 2, "s"),
    wbc: r(4, 12, "×10³/µL"), rbc: r(5, 10, "×10⁶/µL"), hgb: r(8, 15, "g/dL"), hct: r(24, 46, "%"),
    plt: r(200, 800, "×10³/µL"), mcv: r(40, 60, "fL"), mchc: r(30, 36, "g/dL"),
  },
  rabbit: {
    temp: r(38.5, 40.0, "°C"), hr: r(180, 250, "bpm"), rr: r(30, 60, "/min"), crt: r(1, 2, "s"),
    wbc: r(5, 12, "×10³/µL"), rbc: r(5, 8, "×10⁶/µL"), hgb: r(10, 17.4, "g/dL"), hct: r(33, 50, "%"),
    plt: r(250, 650, "×10³/µL"), mcv: r(58, 67, "fL"), mchc: r(29, 37, "g/dL"),
  },
  bird: {
    temp: r(40.0, 42.0, "°C"), hr: r(150, 350, "bpm"), rr: r(15, 45, "/min"), crt: r(1, 2, "s"),
    wbc: r(5, 11, "×10³/µL"), rbc: r(2.5, 4.5, "×10⁶/µL"), hgb: r(11, 18, "g/dL"), hct: r(35, 55, "%"),
    plt: r(20, 40, "×10³/µL"), mcv: r(90, 180, "fL"), mchc: r(22, 33, "g/dL"),
  },
  other: {
    temp: r(37.0, 39.5, "°C"), hr: r(60, 200, "bpm"), rr: r(10, 40, "/min"), crt: r(1, 2, "s"),
    wbc: r(5, 17, "×10³/µL"), rbc: r(5, 9, "×10⁶/µL"), hgb: r(10, 18, "g/dL"), hct: r(30, 55, "%"),
    plt: r(200, 600, "×10³/µL"), mcv: r(50, 80, "fL"), mchc: r(30, 37, "g/dL"),
  },
};

export function rangeFor(species: Species, key: ReadingKey): VitalRange {
  const base = DEFAULT_RANGES[species][key];
  const override = getVitalOverride(species, key);
  return override ? { min: override.min, max: override.max, unit: base.unit } : base;
}

/** Effective range for a specific animal: per-pet override > per-species override > default. */
export function rangeForPet(species: Species, key: ReadingKey, petId?: string): VitalRange {
  const base = DEFAULT_RANGES[species][key];
  const pet = petId ? getPetRange(petId, key) : undefined;
  const sp = getVitalOverride(species, key);
  const eff = pet ?? sp;
  return eff ? { min: eff.min, max: eff.max, unit: base.unit } : base;
}

export function isOutOfRange(species: Species, key: ReadingKey, value: number): boolean {
  const range = rangeFor(species, key);
  return value < range.min || value > range.max;
}

export function isOutOfRangePet(species: Species, key: ReadingKey, value: number, petId?: string): boolean {
  const range = rangeForPet(species, key, petId);
  return value < range.min || value > range.max;
}

/** Build a human-readable objective string from entered readings (vitals + CBC). */
export function formatReadings(
  values: Partial<Record<ReadingKey, string>>,
  species: Species,
  petId: string | undefined,
  label: (k: ReadingKey) => string,
): string {
  const fmt = (keys: ReadingKey[]) =>
    keys.filter((k) => values[k]).map((k) => `${label(k)} ${values[k]}${rangeForPet(species, k, petId).unit}`).join(" · ");
  const vitals = fmt(VITAL_KEYS);
  const cbc = fmt(CBC_KEYS);
  return [vitals, cbc && `CBC — ${cbc}`].filter(Boolean).join("\n");
}
