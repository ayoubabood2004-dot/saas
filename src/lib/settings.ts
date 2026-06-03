import type { Species } from "@/types";
import type { VitalKey } from "./vitals";
import { getActiveClinicId } from "./clinics";

// Doctor-customizable overrides for the medical reading (vital) normal ranges.
// Persisted locally; merged over the built-in defaults by vitals.rangeFor().

export interface MinMax {
  min: number;
  max: number;
}

type Overrides = Partial<Record<Species, Partial<Record<VitalKey, MinMax>>>>;

const overridesKey = () => `vp_vital_overrides_${getActiveClinicId()}`;

function load(): Overrides {
  try {
    const raw = localStorage.getItem(overridesKey());
    if (raw) return JSON.parse(raw) as Overrides;
  } catch {
    /* ignore */
  }
  return {};
}

function save(o: Overrides) {
  try {
    localStorage.setItem(overridesKey(), JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export function getVitalOverride(species: Species, key: VitalKey): MinMax | undefined {
  return load()[species]?.[key];
}

export function setVitalOverride(species: Species, key: VitalKey, range: MinMax) {
  const o = load();
  o[species] = { ...o[species], [key]: range };
  save(o);
}

export function clearVitalOverrides(species: Species) {
  const o = load();
  delete o[species];
  save(o);
}

/* ---------------- Per-animal (individual) reading-range overrides ---------------- */
type PetOverrides = Record<string, Partial<Record<VitalKey, MinMax>>>;
const PET_KEY = "vp_pet_ranges";

function loadPet(): PetOverrides {
  try {
    const raw = localStorage.getItem(PET_KEY);
    if (raw) return JSON.parse(raw) as PetOverrides;
  } catch {
    /* ignore */
  }
  return {};
}

function savePet(o: PetOverrides) {
  try {
    localStorage.setItem(PET_KEY, JSON.stringify(o));
  } catch {
    /* ignore */
  }
}

export function getPetRange(petId: string, key: VitalKey): MinMax | undefined {
  return loadPet()[petId]?.[key];
}

export function getPetRanges(petId: string): Partial<Record<VitalKey, MinMax>> {
  return loadPet()[petId] ?? {};
}

export function setPetRange(petId: string, key: VitalKey, range: MinMax) {
  const o = loadPet();
  o[petId] = { ...o[petId], [key]: range };
  savePet(o);
}

export function clearPetRanges(petId: string) {
  const o = loadPet();
  delete o[petId];
  savePet(o);
}

/* ---------------- Default international dialing code (per clinic) ---------------- */
const dialKey = () => `vp_dial_code_${getActiveClinicId()}`;
export const DEFAULT_DIAL_CODE = "+964"; // Iraq

export function getDialCode(): string {
  try {
    return localStorage.getItem(dialKey()) || DEFAULT_DIAL_CODE;
  } catch {
    return DEFAULT_DIAL_CODE;
  }
}

export function setDialCode(code: string) {
  const clean = code.trim() || DEFAULT_DIAL_CODE;
  try {
    localStorage.setItem(dialKey(), clean.startsWith("+") ? clean : `+${clean.replace(/\D/g, "")}`);
  } catch {
    /* ignore */
  }
}
