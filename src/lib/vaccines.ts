// Comprehensive veterinary vaccine catalogue, grouped by species, using scientific/generic
// names. Clinics may add their own (brand) vaccines at runtime, each mapped to a scientific
// name — clients only ever see the scientific name.
import { getActiveClinicId } from "./clinics";
import { sb, cloudWrite, registerHydrator } from "./clinicSync";

export interface VaccineCategory {
  group: string;
  items: string[];
}

export const VACCINE_CATALOG: VaccineCategory[] = [
  {
    group: "Dogs",
    items: [
      "Rabies",
      "DHPP (Distemper, Adenovirus, Parvovirus, Parainfluenza)",
      "DHLPP (DHPP + Leptospirosis)",
      "Leptospirosis",
      "Bordetella bronchiseptica",
      "Canine Parainfluenza",
      "Canine Influenza (H3N8/H3N2)",
      "Lyme disease (Borrelia burgdorferi)",
      "Canine Coronavirus",
      "Deworming (antiparasitic)",
    ],
  },
  {
    group: "Cats",
    items: [
      "Rabies",
      "FVRCP (Rhinotracheitis, Calicivirus, Panleukopenia)",
      "Feline Leukemia Virus (FeLV)",
      "Feline Immunodeficiency Virus (FIV)",
      "Chlamydophila felis",
      "Bordetella bronchiseptica",
      "Deworming (antiparasitic)",
    ],
  },
  {
    group: "Horses",
    items: [
      "Tetanus toxoid",
      "Eastern/Western Equine Encephalomyelitis",
      "West Nile Virus",
      "Equine Influenza",
      "Equine Herpesvirus (Rhinopneumonitis)",
      "Rabies",
      "Strangles (Streptococcus equi)",
    ],
  },
  {
    group: "Cattle",
    items: [
      "Bovine Viral Diarrhea (BVD)",
      "Infectious Bovine Rhinotracheitis (IBR)",
      "Parainfluenza-3 (PI3)",
      "Bovine Respiratory Syncytial Virus (BRSV)",
      "Clostridial (Blackleg, 7-way)",
      "Brucellosis",
      "Foot-and-Mouth Disease",
    ],
  },
  {
    group: "Rabbits & small mammals",
    items: ["Myxomatosis", "Rabbit Hemorrhagic Disease (RHDV)"],
  },
];

export const BUILTIN_VACCINES: string[] = Array.from(new Set(VACCINE_CATALOG.flatMap((c) => c.items)));
const BUILTIN_SET = new Set(BUILTIN_VACCINES.map((v) => v.toLowerCase()));

export interface ClinicVaccine {
  name: string; // clinic / brand name
  scientific: string; // scientific name shown to clients
}

const keyName = () => `vp_clinic_vaccines_${getActiveClinicId()}`;

let cache: ClinicVaccine[] | null = null;

function readLocal(): ClinicVaccine[] {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) return JSON.parse(raw) as ClinicVaccine[];
  } catch { /* ignore */ }
  return [];
}

function save(list: ClinicVaccine[]) {
  cache = list;
  try { localStorage.setItem(keyName(), JSON.stringify(list)); } catch { /* ignore */ }
}

export async function hydrateVaccines(): Promise<void> {
  const client = sb();
  if (!client) { cache = readLocal(); return; }
  try {
    const { data, error } = await client.from("clinic_vaccines").select("name,scientific").order("created_at");
    if (error) throw error;
    let next = (data ?? []).map((r) => ({ name: r.name as string, scientific: (r.scientific as string) ?? "" }));
    if (next.length === 0) {
      const local = readLocal();
      if (local.length) { await client.from("clinic_vaccines").insert(local); next = local; }
    }
    cache = next;
    try { localStorage.setItem(keyName(), JSON.stringify(next)); } catch { /* ignore */ }
  } catch {
    cache = readLocal();
  }
}
registerHydrator(hydrateVaccines);

export function getClinicVaccines(): ClinicVaccine[] {
  return cache ?? readLocal();
}

export function vaccineExists(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  return BUILTIN_SET.has(n) || getClinicVaccines().some((v) => v.name.toLowerCase() === n);
}

export function addClinicVaccine(name: string, scientific: string): boolean {
  const clean = name.trim();
  if (!clean || vaccineExists(clean)) return false;
  const row = { name: clean, scientific: scientific.trim() || clean };
  save([...getClinicVaccines(), row]);
  cloudWrite(() => sb()!.from("clinic_vaccines").insert(row), "vaccine-add");
  return true;
}

export function removeClinicVaccine(name: string) {
  const clean = name.trim();
  save(getClinicVaccines().filter((v) => v.name.toLowerCase() !== clean.toLowerCase()));
  cloudWrite(() => sb()!.from("clinic_vaccines").delete().ilike("name", clean), "vaccine-del");
}

export function allVaccineNames(): string[] {
  return Array.from(new Set([...BUILTIN_VACCINES, ...getClinicVaccines().map((v) => v.name)]));
}

/** Scientific name shown to clients. Catalogue names are already scientific. */
export function vaccineScientific(name: string): string {
  const custom = getClinicVaccines().find((v) => v.name.toLowerCase() === name.trim().toLowerCase());
  return custom ? custom.scientific : name;
}
