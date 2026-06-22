import type { Species } from "@/types";
import { getActiveClinicId } from "./clinics";
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";

/** Popular breeds per species. Doctors extend these per-clinic at runtime (Settings). */
export const DEFAULT_BREEDS: Record<Species, string[]> = {
  dog: ["Labrador", "German Shepherd", "Golden Retriever", "Bulldog", "Poodle", "Beagle", "Rottweiler", "Chihuahua", "Husky", "Mixed breed"],
  cat: ["Persian", "Siamese", "Maine Coon", "British Shorthair", "Bengal", "Sphynx", "Ragdoll", "Domestic Shorthair", "Mixed breed"],
  horse: ["Arabian", "Thoroughbred", "Quarter Horse", "Andalusian", "Friesian", "Appaloosa", "Mixed breed"],
  cow: ["Holstein", "Jersey", "Angus", "Hereford", "Brahman", "Simmental", "Mixed breed"],
  bird: ["Parrot", "Budgerigar", "Cockatiel", "Canary", "Lovebird", "African Grey", "Finch"],
  rabbit: ["Holland Lop", "Netherland Dwarf", "Rex", "Lionhead", "Angora", "Flemish Giant", "Mixed breed"],
  other: [],
};

/**
 * Arabic display labels for the built-in breeds. Keys are the canonical (stored)
 * English values — those are NEVER changed; only the shown label is localized, the
 * same approach used for coat colours. A clinic-typed custom breed has no mapping and
 * is shown exactly as entered.
 */
const BREED_LABELS_AR: Record<string, string> = {
  // Shared
  "Mixed breed": "سلالة مختلطة",
  // Dogs
  Labrador: "لابرادور",
  "German Shepherd": "راعي ألماني",
  "Golden Retriever": "غولدن ريتريفر",
  Bulldog: "بولدوغ",
  Poodle: "بودل",
  Beagle: "بيغل",
  Rottweiler: "روت وايلر",
  Chihuahua: "تشيهواهوا",
  Husky: "هاسكي",
  // Cats
  Persian: "شيرازي",
  Siamese: "سيامي",
  "Maine Coon": "ماين كون",
  "British Shorthair": "بريطاني قصير الشعر",
  Bengal: "بنغالي",
  Sphynx: "سفينكس",
  Ragdoll: "راغدول",
  "Domestic Shorthair": "منزلي قصير الشعر",
  // Horses
  Arabian: "عربي أصيل",
  Thoroughbred: "أصيل إنجليزي",
  "Quarter Horse": "كوارتر هورس",
  Andalusian: "أندلسي",
  Friesian: "فريزي",
  Appaloosa: "أبالوزا",
  // Cattle
  Holstein: "هولشتاين",
  Jersey: "جيرسي",
  Angus: "أنغوس",
  Hereford: "هيرفورد",
  Brahman: "براهمان",
  Simmental: "سيمنتال",
  // Birds
  Parrot: "ببغاء",
  Budgerigar: "بادجي",
  Cockatiel: "كوكاتيل",
  Canary: "كناري",
  Lovebird: "طائر الحب",
  "African Grey": "الرمادي الأفريقي",
  Finch: "فنش",
  // Rabbits
  "Holland Lop": "هولاند لوب",
  "Netherland Dwarf": "القزم الهولندي",
  Rex: "ركس",
  Lionhead: "رأس الأسد",
  Angora: "أنغورا",
  "Flemish Giant": "العملاق الفلمنكي",
};

/**
 * Localized display label for a breed value. Returns the professional Arabic term for
 * a known built-in breed when the UI is in Arabic; otherwise (English UI, or a custom
 * clinic breed) returns the value unchanged. The stored value is always the original.
 */
export function breedLabel(name: string, lang?: string): string {
  if (!name) return name;
  if (lang && lang.startsWith("ar")) return BREED_LABELS_AR[name] ?? name;
  return name;
}

const keyName = (sp: Species) => `vp_clinic_breeds_${sp}_${getActiveClinicId()}`;

// In-memory cache of CUSTOM (clinic-added) breeds per species. Backed by the
// Supabase clinic_breeds table; localStorage mirror keeps offline + instant reads.
let cache: Partial<Record<Species, string[]>> | null = null;

function readLocal(sp: Species): string[] {
  try {
    const raw = localStorage.getItem(keyName(sp));
    if (raw) return JSON.parse(raw) as string[];
  } catch { /* ignore */ }
  return [];
}

function saveClinicBreeds(sp: Species, list: string[]) {
  if (cache) cache[sp] = list;
  try { localStorage.setItem(keyName(sp), JSON.stringify(list)); } catch { /* ignore */ }
}

export async function hydrateBreeds(): Promise<void> {
  const client = sb();
  const species = Object.keys(DEFAULT_BREEDS) as Species[];
  if (!client) { cache = Object.fromEntries(species.map((s) => [s, readLocal(s)])); return; }
  try {
    const { data, error } = await client.from("clinic_breeds").select("species,name").order("created_at");
    if (error) throw error;
    const grouped: Partial<Record<Species, string[]>> = {};
    for (const r of (data ?? []) as { species: string; name: string }[]) {
      (grouped[r.species as Species] ??= []).push(r.name);
    }
    // First run on a live backend → migrate any local custom breeds up.
    if ((data ?? []).length === 0) {
      const rows: { species: string; name: string }[] = [];
      for (const s of species) for (const n of readLocal(s)) { (grouped[s] ??= []).push(n); rows.push({ species: s, name: n }); }
      if (rows.length) await client.from("clinic_breeds").insert(rows);
    }
    cache = grouped;
    for (const s of species) { try { localStorage.setItem(keyName(s), JSON.stringify(grouped[s] ?? [])); } catch { /* ignore */ } }
  } catch {
    cache = Object.fromEntries(species.map((s) => [s, readLocal(s)]));
  }
}
registerHydrator(hydrateBreeds);
registerReset(() => { cache = null; });

export function getClinicBreeds(sp: Species): string[] {
  return cache?.[sp] ?? readLocal(sp);
}

/** All selectable breeds for a species (built-in + clinic-added), de-duplicated. */
export function allBreeds(sp: Species): string[] {
  return Array.from(new Set([...(DEFAULT_BREEDS[sp] ?? []), ...getClinicBreeds(sp)]));
}

/** Add a clinic-custom breed. Returns true if added (false if blank or already exists). */
export function addClinicBreed(sp: Species, name: string): boolean {
  const clean = name.trim();
  if (!clean) return false;
  if (allBreeds(sp).some((b) => b.toLowerCase() === clean.toLowerCase())) return false;
  saveClinicBreeds(sp, [...getClinicBreeds(sp), clean]);
  cloudWrite(() => sb()!.from("clinic_breeds").insert({ species: sp, name: clean }), "breed-add");
  return true;
}

export function removeClinicBreed(sp: Species, name: string) {
  const clean = name.trim();
  saveClinicBreeds(sp, getClinicBreeds(sp).filter((b) => b.toLowerCase() !== clean.toLowerCase()));
  cloudWrite(() => sb()!.from("clinic_breeds").delete().eq("species", sp).ilike("name", clean), "breed-del");
}
