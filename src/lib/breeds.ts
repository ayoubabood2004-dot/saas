import type { Species } from "@/types";
import { getActiveClinicId } from "./clinics";

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

const keyName = (sp: Species) => `vp_clinic_breeds_${sp}_${getActiveClinicId()}`;

export function getClinicBreeds(sp: Species): string[] {
  try {
    const raw = localStorage.getItem(keyName(sp));
    if (raw) return JSON.parse(raw) as string[];
  } catch {
    /* ignore */
  }
  return [];
}

function saveClinicBreeds(sp: Species, list: string[]) {
  try {
    localStorage.setItem(keyName(sp), JSON.stringify(list));
  } catch {
    /* ignore */
  }
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
  const list = getClinicBreeds(sp);
  list.push(clean);
  saveClinicBreeds(sp, list);
  return true;
}

export function removeClinicBreed(sp: Species, name: string) {
  saveClinicBreeds(sp, getClinicBreeds(sp).filter((b) => b.toLowerCase() !== name.trim().toLowerCase()));
}
