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

/* ---------------- Clinic preferences (dial code + branding), per clinic --------------
 * One clinic_prefs row holds the default dial code, the clinic logo (a compressed
 * data-URL), and social handles. Same dual-adapter pattern: in-memory cache hydrated
 * at login, localStorage mirror, optimistic write-through to Supabase. */
export const DEFAULT_DIAL_CODE = "+964"; // Iraq

export interface ClinicSocials { facebook: string; instagram: string }
interface ClinicPrefs { dial_code: string; logo_url: string | null; social_facebook: string; social_instagram: string; clinic_name: string }
const DEFAULT_PREFS: ClinicPrefs = { dial_code: DEFAULT_DIAL_CODE, logo_url: null, social_facebook: "", social_instagram: "", clinic_name: "" };

const prefsKey = () => `vp_clinic_prefs_${getActiveClinicId()}`;
const legacyDialKey = () => `vp_dial_code_${getActiveClinicId()}`;

let prefsCache: ClinicPrefs | null = null;

function readPrefsLocal(): ClinicPrefs {
  try {
    const raw = localStorage.getItem(prefsKey());
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ClinicPrefs>) };
  } catch { /* ignore */ }
  // Fall back to the legacy dial-only key so existing dial codes aren't lost.
  try { const d = localStorage.getItem(legacyDialKey()); if (d) return { ...DEFAULT_PREFS, dial_code: d }; } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

function savePrefsLocal(p: ClinicPrefs) {
  prefsCache = p;
  try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch { /* ignore */ }
}

function prefs(): ClinicPrefs {
  return prefsCache ?? readPrefsLocal();
}

export async function hydrateClinicPrefs(): Promise<void> {
  const client = sb();
  if (!client) { prefsCache = readPrefsLocal(); return; }
  try {
    const { data, error } = await client.from("clinic_prefs").select("dial_code,logo_url,social_facebook,social_instagram,clinic_name").maybeSingle();
    if (error) throw error;
    if (data) {
      prefsCache = {
        dial_code: (data.dial_code as string) || DEFAULT_DIAL_CODE,
        logo_url: (data.logo_url as string) ?? null,
        social_facebook: (data.social_facebook as string) ?? "",
        social_instagram: (data.social_instagram as string) ?? "",
        clinic_name: (data.clinic_name as string) ?? "",
      };
    } else {
      // No row yet → migrate any local prefs up (or seed the default dial code).
      const local = readPrefsLocal();
      prefsCache = local;
      await client.from("clinic_prefs").upsert(
        { dial_code: local.dial_code, logo_url: local.logo_url, social_facebook: local.social_facebook, social_instagram: local.social_instagram, clinic_name: local.clinic_name },
        { onConflict: "clinic_id" },
      );
    }
    savePrefsLocal(prefsCache);
  } catch {
    prefsCache = readPrefsLocal();
  }
}
registerHydrator(hydrateClinicPrefs);
registerReset(() => { prefsCache = null; });

/** Write one or more pref fields: optimistic cache+local update, then cloud upsert. */
function patchPrefs(patch: Partial<ClinicPrefs>, ctx: string) {
  savePrefsLocal({ ...prefs(), ...patch });
  cloudWrite(() => sb()!.from("clinic_prefs").upsert(patch, { onConflict: "clinic_id" }), ctx);
}

export function getDialCode(): string {
  return prefs().dial_code || DEFAULT_DIAL_CODE;
}

export function setDialCode(code: string) {
  const clean = code.trim() || DEFAULT_DIAL_CODE;
  const normalized = clean.startsWith("+") ? clean : `+${clean.replace(/\D/g, "")}`;
  patchPrefs({ dial_code: normalized }, "dial-code-set");
}

/** Clinic logo as a data-URL (null when none). Shown on printed invoices. */
export function getClinicLogo(): string | null {
  return prefs().logo_url;
}
export function setClinicLogo(dataUrl: string | null) {
  patchPrefs({ logo_url: dataUrl }, "clinic-logo-set");
}

export function getClinicSocials(): ClinicSocials {
  const p = prefs();
  return { facebook: p.social_facebook, instagram: p.social_instagram };
}
export function setClinicSocials(s: ClinicSocials) {
  patchPrefs({ social_facebook: s.facebook.trim(), social_instagram: s.instagram.trim() }, "clinic-socials-set");
}

/** The clinic's own display name, shown on printed invoices and legal consent forms.
 *  Empty string when unset — callers fall back to the staff full_name / brand text. */
export function getClinicName(): string {
  return prefs().clinic_name.trim();
}
export function setClinicName(name: string) {
  patchPrefs({ clinic_name: name.trim() }, "clinic-name-set");
}
