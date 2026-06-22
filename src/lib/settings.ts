import type { Species } from "@/types";
import type { VitalKey } from "./vitals";
import { getActiveClinicId } from "./clinics";
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";

// Doctor-customizable overrides for the medical reading (vital) normal ranges.
// Persisted locally; merged over the built-in defaults by vitals.rangeFor().

export interface MinMax {
  min: number;
  max: number;
}

type Overrides = Partial<Record<Species, Partial<Record<VitalKey, MinMax>>>>;

const overridesKey = () => `vp_vital_overrides_${getActiveClinicId()}`;

// Clinic-level vital-range overrides are now persisted to Supabase
// (clinic_vital_ranges, isolated by clinic_id = auth_clinic()) with an in-memory
// cache + localStorage mirror, so every staff device shares the same thresholds.
let cache: Overrides | null = null;

function readLocal(): Overrides {
  try {
    const raw = localStorage.getItem(overridesKey());
    if (raw) return JSON.parse(raw) as Overrides;
  } catch { /* ignore */ }
  return {};
}

function load(): Overrides {
  return cache ?? readLocal();
}

function save(o: Overrides) {
  cache = o;
  try { localStorage.setItem(overridesKey(), JSON.stringify(o)); } catch { /* ignore */ }
}

interface VitalRow { species: string; vital_key: string; min_val: number; max_val: number }

export async function hydrateVitalOverrides(): Promise<void> {
  const client = sb();
  if (!client) { cache = readLocal(); return; }
  try {
    const { data, error } = await client.from("clinic_vital_ranges").select("species,vital_key,min_val,max_val");
    if (error) throw error;
    const o: Overrides = {};
    for (const r of (data ?? []) as VitalRow[]) {
      (o[r.species as Species] ??= {})[r.vital_key as VitalKey] = { min: Number(r.min_val), max: Number(r.max_val) };
    }
    if ((data ?? []).length === 0) {
      const local = readLocal();
      const rows: VitalRow[] = [];
      for (const sp of Object.keys(local) as Species[]) {
        for (const k of Object.keys(local[sp] ?? {}) as VitalKey[]) {
          const mm = local[sp]![k]!;
          (o[sp] ??= {})[k] = mm;
          rows.push({ species: sp, vital_key: k, min_val: mm.min, max_val: mm.max });
        }
      }
      if (rows.length) await client.from("clinic_vital_ranges").insert(rows);
    }
    cache = o;
    try { localStorage.setItem(overridesKey(), JSON.stringify(o)); } catch { /* ignore */ }
  } catch {
    cache = readLocal();
  }
}
registerHydrator(hydrateVitalOverrides);
registerReset(() => { cache = null; });

export function getVitalOverride(species: Species, key: VitalKey): MinMax | undefined {
  return load()[species]?.[key];
}

export function setVitalOverride(species: Species, key: VitalKey, range: MinMax) {
  const o = load();
  o[species] = { ...o[species], [key]: range };
  save({ ...o });
  cloudWrite(() => sb()!.from("clinic_vital_ranges").upsert(
    { species, vital_key: key, min_val: range.min, max_val: range.max },
    { onConflict: "clinic_id,species,vital_key" },
  ), "vital-override-set");
}

export function clearVitalOverrides(species: Species) {
  const o = load();
  delete o[species];
  save({ ...o });
  cloudWrite(() => sb()!.from("clinic_vital_ranges").delete().eq("species", species), "vital-override-clear");
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

let dialCache: string | null = null;

function readDialLocal(): string {
  try { return localStorage.getItem(dialKey()) || DEFAULT_DIAL_CODE; } catch { return DEFAULT_DIAL_CODE; }
}

export async function hydrateDialCode(): Promise<void> {
  const client = sb();
  if (!client) { dialCache = readDialLocal(); return; }
  try {
    const { data, error } = await client.from("clinic_prefs").select("dial_code").maybeSingle();
    if (error) throw error;
    if (data?.dial_code) {
      dialCache = data.dial_code as string;
    } else {
      // No prefs row yet → migrate the local value up (or write the default).
      dialCache = readDialLocal();
      await client.from("clinic_prefs").upsert({ dial_code: dialCache }, { onConflict: "clinic_id" });
    }
    try { localStorage.setItem(dialKey(), dialCache); } catch { /* ignore */ }
  } catch {
    dialCache = readDialLocal();
  }
}
registerHydrator(hydrateDialCode);
registerReset(() => { dialCache = null; });

export function getDialCode(): string {
  return dialCache ?? readDialLocal();
}

export function setDialCode(code: string) {
  const clean = code.trim() || DEFAULT_DIAL_CODE;
  const normalized = clean.startsWith("+") ? clean : `+${clean.replace(/\D/g, "")}`;
  dialCache = normalized;
  try { localStorage.setItem(dialKey(), normalized); } catch { /* ignore */ }
  cloudWrite(() => sb()!.from("clinic_prefs").upsert({ dial_code: normalized }, { onConflict: "clinic_id" }), "dial-code-set");
}
