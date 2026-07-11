// Hierarchical address catalog for the Iraqi local context: Governorate → Area.
// The governorate list is a fixed national set; areas are a *living* catalog — the
// built-in seed is just a starting point, and any area a doctor creates on the fly
// is remembered per-clinic so it shows up as a suggestion next time the same
// governorate is chosen. Custom entries (extra governorates + extra areas) are
// persisted to localStorage, namespaced by the active clinic, exactly like the
// vital-range and dial-code preferences (see lib/settings.ts).

import { getActiveClinicId } from "./clinics";
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";

/** The 19 governorates of Iraq (transliterated). Suggestions, not a closed set. */
export const IRAQI_GOVERNORATES: string[] = [
  "Baghdad",
  "Basra",
  "Nineveh",
  "Erbil",
  "Najaf",
  "Karbala",
  "Kirkuk",
  "Sulaymaniyah",
  "Anbar",
  "Dhi Qar",
  "Babil",
  "Diyala",
  "Wasit",
  "Salah al-Din",
  "Maysan",
  "Muthanna",
  "Al-Qadisiyyah",
  "Duhok",
  "Halabja",
];

// A small seed of well-known areas per governorate so the dependent dropdown is
// useful out of the box. Deliberately partial — doctors flesh it out by creating
// areas as they register clients (e.g. "Al-Adhamiya" under Baghdad), and those
// additions are remembered (see addArea below).
const SEED_AREAS: Record<string, string[]> = {
  Baghdad: ["Al-Mansour", "Karrada", "Al-Yarmouk", "Zayouna", "Al-Jadriya", "Al-Dora"],
  Basra: ["Al-Ashar", "Al-Maqal", "Al-Jubaila", "Al-Tannuma"],
  Erbil: ["Ankawa", "Shaqlawa", "Downtown", "Koya"],
  Nineveh: ["Old City", "Al-Hamdaniya", "Tal Afar", "Sinjar"],
  Najaf: ["City Center", "Al-Kufa", "Al-Manathira"],
  Karbala: ["City Center", "Al-Hindiya", "Ain Tamr"],
};

/** Custom (doctor-created) areas keyed by governorate, e.g. { Baghdad: ["Al-Adhamiya"] }. */
type AreaMap = Record<string, string[]>;

const customKey = () => `vp_locations_${getActiveClinicId()}`;

let cache: AreaMap | null = null;

function readLocal(): AreaMap {
  try {
    const raw = localStorage.getItem(customKey());
    if (raw) return JSON.parse(raw) as AreaMap;
  } catch { /* ignore */ }
  return {};
}

function loadCustom(): AreaMap {
  return cache ?? readLocal();
}

function saveCustom(map: AreaMap) {
  cache = map;
  try { localStorage.setItem(customKey(), JSON.stringify(map)); } catch { /* ignore */ }
}

export async function hydrateAreas(): Promise<void> {
  const client = sb();
  if (!client) { cache = readLocal(); return; }
  try {
    const { data, error } = await client.from("clinic_areas").select("governorate,area").order("created_at");
    if (error) throw error;
    const map: AreaMap = {};
    for (const r of (data ?? []) as { governorate: string; area: string | null }[]) {
      const key = Object.keys(map).find((k) => k.toLowerCase() === r.governorate.toLowerCase()) ?? r.governorate;
      map[key] = map[key] ?? [];
      if (r.area) map[key].push(r.area);
    }
    // First run on a live backend → migrate any locally-remembered areas up.
    if ((data ?? []).length === 0) {
      const local = readLocal();
      const rows: { governorate: string; area: string | null }[] = [];
      for (const [g, areas] of Object.entries(local)) {
        map[g] = areas.slice();
        if (areas.length === 0) rows.push({ governorate: g, area: null });
        else for (const a of areas) rows.push({ governorate: g, area: a });
      }
      if (rows.length) await client.from("clinic_areas").insert(rows);
    }
    cache = map;
    try { localStorage.setItem(customKey(), JSON.stringify(map)); } catch { /* ignore */ }
  } catch {
    cache = readLocal();
  }
}
registerHydrator(hydrateAreas);
registerReset(() => { cache = null; });

/** Case-insensitive de-dupe that preserves the first-seen spelling/order. */
function dedupe(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of list) {
    const v = item.trim();
    const k = v.toLowerCase();
    if (!v || seen.has(k)) continue;
    seen.add(k);
    out.push(v);
  }
  return out;
}

/** All governorate suggestions: the national set plus any custom ones created locally. */
export function getGovernorates(): string[] {
  return dedupe([...IRAQI_GOVERNORATES, ...Object.keys(loadCustom())]);
}

/** Area suggestions for a governorate: built-in seed merged with remembered customs. */
export function getAreas(governorate: string): string[] {
  const g = governorate.trim();
  if (!g) return [];
  const custom = loadCustom();
  // Match the seed key case-insensitively so "baghdad" still finds Baghdad's seed.
  const seedKey = Object.keys(SEED_AREAS).find((k) => k.toLowerCase() === g.toLowerCase());
  const customKeyMatch = Object.keys(custom).find((k) => k.toLowerCase() === g.toLowerCase());
  return dedupe([...(seedKey ? SEED_AREAS[seedKey] : []), ...(customKeyMatch ? custom[customKeyMatch] : [])]);
}

/** Remember a (possibly new) governorate so it persists as a future suggestion. */
export function addGovernorate(governorate: string) {
  const g = governorate.trim();
  if (!g) return;
  if (IRAQI_GOVERNORATES.some((x) => x.toLowerCase() === g.toLowerCase())) return; // already national
  const map = loadCustom();
  const existing = Object.keys(map).find((k) => k.toLowerCase() === g.toLowerCase());
  if (!existing) {
    saveCustom({ ...map, [g]: [] });
    cloudWrite(() => sb()!.from("clinic_areas").insert({ governorate: g, area: null }), "area-add");
  }
}

/** Remember an area under a governorate. Creates the governorate bucket if needed. */
export function addArea(governorate: string, area: string) {
  const g = governorate.trim();
  const a = area.trim();
  if (!g || !a) return;
  // Don't store something that's already a built-in seed suggestion.
  if (getAreas(g).some((x) => x.toLowerCase() === a.toLowerCase())) {
    // Still ensure a custom governorate keeps its bucket.
    addGovernorate(g);
    return;
  }
  const map = loadCustom();
  const key = Object.keys(map).find((k) => k.toLowerCase() === g.toLowerCase()) ?? g;
  saveCustom({ ...map, [key]: dedupe([...(map[key] ?? []), a]) });
  cloudWrite(() => sb()!.from("clinic_areas").insert({ governorate: key, area: a }), "area-add");
}
