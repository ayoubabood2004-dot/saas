/* ============================================================================
 * حالةُ الحقل (0265) بالتجريبيّ — مرآةُ دوالّ القاعدة على localStorage، بنفس العقد ونفس الحرّاس ونفس رموز الرفض.
 *
 * «حارسٌ لا يوجد هنا حارسٌ لم يُفحص» (CLAUDE.md §٤): فحوصُ المنطق تجري على التجريبيّ — فكلُّ رفضٍ بالخادم رفضٌ هنا
 * بالرمز نفسه: الصلاحية (staff_can بمرآتها)، والوجبةُ المغلقة، وتداخلُ النافق وتراكميُّه، والحقلُ التوأم، والوجبةُ
 * المفتوحة الثانية، والرموزُ الغريبة، وتعديلُ الطبلة المُرسَلة نسخةً، والبيعُ قبل «لا تبيع قبل»، والمرجعُ المكرّر.
 * والإحصاءُ من flockMath.flockStats (يطابقها flock-parity مع _flock_stats بالحزمة).
 * كسولٌ من باب repoDemo وحده (loadDemoFlock) — ولا عربيةَ هنا: الرفضُ رمزٌ تترجمه الشاشة.
 * ========================================================================= */
import type {
  FlockBoardRow, FlockBundle, FlockCase, FlockFarm, FlockHouse, FlockMedia, FlockMortality, FlockNecropsy, FlockProgram,
  FlockProgramStep, FlockTreatment, FlockTreatmentLine, FlockVax, FlockVisit,
} from "./flockTypes";
import type { FlockFarmMatch, FlockMortalityInput, FlockOpenInput, FlockTreatmentInput, FlockVaxInput, FlockVisitInput } from "./flockApi";
import { ageOn, flockStats } from "./flockMath";
import { custKey, custNorm } from "./customerKey";
import { staffCan } from "./demoConsumption";
import { demoApiGate, demoClinicId, demoUserId } from "./demoRole";
import { localISO, uid } from "./utils";

type Ref = { client_ref?: string | null };
interface Store {
  farms: FlockFarm[];
  cases: (FlockCase & Ref)[];
  houses: FlockHouse[];
  mortality: (FlockMortality & Ref)[];
  visits: (FlockVisit & Ref)[];
  necropsy: FlockNecropsy[];
  vax: FlockVax[];
  treatments: (Omit<FlockTreatment, "lines"> & Ref)[];
  lines: FlockTreatmentLine[];
  media: FlockMedia[];
  programs: FlockProgram[];
}
const EMPTY = (): Store => ({ farms: [], cases: [], houses: [], mortality: [], visits: [], necropsy: [], vax: [], treatments: [], lines: [], media: [], programs: [] });
const key = () => `vp_flock_${demoClinicId() ?? "default"}`;
function load(): Store {
  try {
    const v = JSON.parse(localStorage.getItem(key()) || "null") as Partial<Store> | null;
    const e = EMPTY();
    if (!v) return e;
    for (const k of Object.keys(e) as (keyof Store)[]) if (Array.isArray(v[k])) (e[k] as unknown[]) = v[k] as unknown[];
    return e;
  } catch { return EMPTY(); }
}
const save = (s: Store) => localStorage.setItem(key(), JSON.stringify(s));

const fail = (code: string, sqlstate = "P0001") => Object.assign(new Error(code), { code: sqlstate });
const now = () => new Date().toISOString();
const today = () => localISO();
const clinic = () => demoClinicId() ?? "default";
const CODE = /^[a-z][a-z0-9_]{0,30}(\.[a-z0-9_]{1,30})?$/;
const ROUTES = ["water", "spray", "eye", "sc", "im", "wing", "feed", "other"];
const LROUTES = ["water", "feed", "spray", "sc", "im", "eye", "other"];
const KINDS = ["broiler", "layer", "breeder", "other"];
const strip = <T extends Ref>(r: T): Omit<T, "client_ref"> => { const { client_ref, ...rest } = r; void client_ref; return rest; };
/** نصٌّ اختياريّ: فارغٌ ⇒ null، وأطولُ من حدّه ⇒ رفضٌ (لا قصٌّ صامت) — مرآةُ _flock_txt. */
function txt(v: unknown, max: number): string | null {
  const s = typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
  if (!s) return null;
  if (s.length > max) throw fail("flock_too_long");
  return s;
}
function codes(v: unknown, max: number): string[] {
  if (v == null) return [];
  if (!Array.isArray(v)) throw fail("flock_codes");
  const out: string[] = [];
  for (const c of v) {
    if (typeof c !== "string" || !CODE.test(c)) throw fail("flock_codes");
    if (!out.includes(c)) out.push(c);
  }
  if (out.length > max) throw fail("flock_codes");
  return out;
}
/** مرآةُ _flock_can: البوّابةُ (المصوّر) ثمّ staff_can بمرآتها — والرفضُ 42501 برمزه. */
async function can(cap: "addPets" | "editMedical" | "manageSettings"): Promise<void> {
  demoApiGate();
  if (!(await staffCan(cap))) throw fail("flock_forbidden", "42501");
}
const actor = () => demoUserId();
function caseFor(s: Store, id: string | null | undefined, open = true): FlockCase & Ref {
  const c = s.cases.find((x) => x.id === id);
  if (!c) throw fail("flock_case_missing");
  if (open && c.status !== "open") throw fail("flock_case_closed");
  return c;
}
const linesOf = (s: Store, tid: string) => s.lines.filter((l) => l.treatment_id === tid).sort((a, b) => a.position - b.position);
function bundleOf(s: Store, c: FlockCase): FlockBundle {
  const treatments = s.treatments.filter((t) => t.case_id === c.id)
    .sort((a, b) => (a.start_on < b.start_on ? 1 : a.start_on > b.start_on ? -1 : b.version - a.version))
    .map((t) => ({ ...strip(t), lines: linesOf(s, t.id) }));
  const base = {
    case: strip(c as FlockCase & Ref) as FlockCase,
    farm: s.farms.find((f) => f.id === c.farm_id)!,
    houses: s.houses.filter((h) => h.case_id === c.id).sort((a, b) => a.position - b.position),
    mortality: s.mortality.filter((m) => m.case_id === c.id).map((m) => strip(m) as FlockMortality)
      .sort((a, b) => (a.on_date < b.on_date ? 1 : a.on_date > b.on_date ? -1 : a.created_at < b.created_at ? 1 : -1)),
    visits: s.visits.filter((v) => v.case_id === c.id).map((v) => strip(v) as FlockVisit).sort((a, b) => (a.at < b.at ? 1 : -1)),
    necropsy: s.necropsy.filter((n) => n.case_id === c.id).sort((a, b) => (a.visit_id === b.visit_id ? a.bird_no - b.bird_no : a.visit_id < b.visit_id ? -1 : 1)),
    vax: s.vax.filter((v) => v.case_id === c.id).sort((a, b) => (a.planned_age ?? 1e9) - (b.planned_age ?? 1e9)),
    treatments,
    media: s.media.filter((m) => m.case_id === c.id).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)),
  };
  return { ...base, stats: flockStats(base, today()) };
}

/* ── القراءة ─────────────────────────────────────────────────────────────────────────────── */
export async function demoFlockBoard(status: "open" | "closed" | "all"): Promise<FlockBoardRow[]> {
  demoApiGate();
  const s = load();
  return s.cases.filter((c) => status === "all" || c.status === status)
    .sort((a, b) => ((a.closed_on ?? a.created_at) < (b.closed_on ?? b.created_at) ? 1 : -1))
    .slice(0, 300)
    .map((c) => {
      const f = s.farms.find((x) => x.id === c.farm_id)!;
      const b = bundleOf(s, c);
      return { case: b.case, farm: { id: f.id, name: f.name, owner_name: f.owner_name, owner_phone: f.owner_phone, area: f.area, governorate: f.governorate },
        houses: b.houses.length, stats: b.stats };
    });
}
export async function demoFlockBundle(id: string): Promise<FlockBundle> {
  demoApiGate();
  const s = load();
  const c = s.cases.find((x) => x.id === id);
  if (!c) throw fail("flock_case_missing");
  return bundleOf(s, c);
}
export async function demoFlockFarmsFor(phone: string | null, name: string | null): Promise<FlockFarmMatch[]> {
  demoApiGate();
  const s = load();
  const k = custKey(phone, name);
  return s.farms.filter((f) => !f.archived && f.cust_key === k)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((f) => ({ farm: f, open_case: s.cases.find((c) => c.farm_id === f.id && c.status === "open")?.id ?? null }));
}
export async function demoFlockPrograms(): Promise<FlockProgram[]> {
  demoApiGate();
  return load().programs.filter((p) => !p.archived).sort((a, b) => (a.kind === b.kind ? (a.name < b.name ? -1 : 1) : a.kind < b.kind ? -1 : 1));
}

/* ── الفتح والتعديل والإغلاق ───────────────────────────────────────────────────────────── */
export async function demoFlockOpen(p: FlockOpenInput): Promise<{ case: FlockCase; farm: FlockFarm; replayed: boolean }> {
  await can("addPets");
  const s = load();
  const ref = p.client_ref?.trim() || null;
  if (ref) {
    const c = s.cases.find((x) => x.client_ref === ref);
    if (c) return { case: strip(c) as FlockCase, farm: s.farms.find((f) => f.id === c.farm_id)!, replayed: true };
  }
  const fp = p.farm as Record<string, unknown>;
  let farm: FlockFarm | undefined;
  if (typeof fp.id === "string" && fp.id) {
    farm = s.farms.find((f) => f.id === fp.id);
    if (!farm || farm.archived) throw fail("flock_farm_missing");
  } else {
    const name = txt(fp.name, 120);
    if (!name) throw fail("flock_farm_name");
    const k = custKey((fp.owner_phone as string) ?? null, (fp.owner_name as string) ?? null);
    if (s.farms.some((f) => !f.archived && f.cust_key === k && custNorm(f.name) === custNorm(name))) throw fail("flock_farm_twin");
    farm = {
      id: uid("ff"), clinic_id: clinic(), name, owner_name: txt(fp.owner_name, 120), owner_phone: txt(fp.owner_phone, 40), cust_key: k,
      governorate: txt(fp.governorate, 60), area: txt(fp.area, 120), houses_count: fp.houses_count == null ? null : Number(fp.houses_count),
      note: txt(fp.note, 2000), archived: false, created_at: now(), updated_at: now(),
    };
  }
  if (s.cases.some((c) => c.farm_id === farm!.id && c.status === "open")) throw fail("flock_open_exists");
  if (!KINDS.includes(p.case.kind)) throw fail("flock_kind");
  const placed = p.case.placed_on;
  if (!placed || placed > ageShift(today(), 7) || placed < ageShift(today(), -800)) throw fail("flock_placed_on");
  let count: number;
  if (p.houses?.length) {
    if (p.houses.length > 200 || p.houses.some((h) => !(Number(h.placed_count) >= 1))) throw fail("flock_houses");
    count = p.houses.reduce((n, h) => n + Number(h.placed_count), 0);
    if (count > 10_000_000) throw fail("flock_houses");
  } else count = Number(p.case.placed_count);
  if (!Number.isInteger(count) || count < 1 || count > 10_000_000) throw fail("flock_count");
  if ((p.vax?.length ?? 0) > 60) throw fail("flock_vax");
  const vaxRows: FlockVax[] = [];
  const cid = uid("fc");
  for (const v of p.vax ?? []) {
    const age = v.age ?? 1;
    if (age < 1 || age > 800 || !ROUTES.includes(v.route ?? "water") || !txt(v.vaccine, 120)) throw fail("flock_vax");
    vaxRows.push({
      id: uid("fv"), case_id: cid, vaccine: txt(v.vaccine, 120)!, disease: txt(v.disease, 120), route: v.route ?? "water",
      planned_age: v.at_hatchery ? 1 : age, status: v.at_hatchery ? "given" : "planned", given_on: v.at_hatchery ? placed : null,
      given_by: v.at_hatchery ? "hatchery" : null, batch_no: null, birds_count: null, take_ok: null, note: null, skip_reason: null,
      from_program: v.from_program ?? null, visit_id: null, updated_at: now(),
    });
  }
  const c: FlockCase & Ref = {
    id: cid, clinic_id: clinic(), farm_id: farm.id, kind: p.case.kind, breed: txt(p.case.breed, 60), hatchery: txt(p.case.hatchery, 120),
    placed_on: placed, placed_count: count, vet_id: p.case.vet_id ?? null, status: "open", closed_on: null, close_reason: null,
    sold_count: null, sold_avg_kg: null, note: txt(p.case.note, 4000), created_at: now(), created_by: actor(), updated_at: now(), client_ref: ref,
  };
  if (!s.farms.includes(farm)) s.farms.push(farm);
  s.cases.push(c);
  (p.houses ?? []).forEach((h, i) => s.houses.push({ id: uid("fh"), case_id: cid, label: txt(h.label, 40) ?? `\u0642\u0627\u0639\u0629 ${i + 1}`, placed_count: Number(h.placed_count), position: i }));
  s.vax.push(...vaxRows);
  save(s);
  return { case: strip(c) as FlockCase, farm, replayed: false };
}
const ageShift = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lostOf = (s: Store, caseId: string, house: string | null | undefined, except?: string) =>
  s.mortality.filter((m) => m.case_id === caseId && (house === undefined || (m.house_id ?? null) === (house ?? null)) && m.id !== except)
    .reduce((n, m) => n + m.dead + m.culled, 0);

export async function demoFlockUpdate(id: string, patch: Partial<FlockCase>, expect: string | null): Promise<FlockCase> {
  await can("addPets");
  const s = load();
  const c = caseFor(s, id, false);
  if (expect && c.updated_at !== expect) throw fail("flock_changed");
  const kind = patch.kind ?? c.kind;
  if (!KINDS.includes(kind)) throw fail("flock_kind");
  const placed = patch.placed_on ?? c.placed_on;
  if (placed > ageShift(today(), 7) || placed < ageShift(today(), -800)
      || s.mortality.some((m) => m.case_id === c.id && ageShift(m.on_date, -(m.days - 1)) < placed)
      || s.visits.some((v) => v.case_id === c.id && localISO(new Date(v.at)) < placed)) throw fail("flock_placed_on");
  let count = patch.placed_count ?? c.placed_count;
  if (s.houses.some((h) => h.case_id === c.id)) count = c.placed_count;
  if (count < 1 || count > 10_000_000 || lostOf(s, c.id, undefined) > count) throw fail("flock_count");
  Object.assign(c, {
    kind, placed_on: placed, placed_count: count,
    breed: "breed" in patch ? txt(patch.breed, 60) : c.breed,
    hatchery: "hatchery" in patch ? txt(patch.hatchery, 120) : c.hatchery,
    vet_id: "vet_id" in patch ? patch.vet_id ?? null : c.vet_id,
    note: "note" in patch ? txt(patch.note, 4000) : c.note,
    updated_at: now(),
  });
  save(s);
  return strip(c) as FlockCase;
}
export async function demoFlockClose(id: string, p: { closed_on?: string | null; reason: NonNullable<FlockCase["close_reason"]>; sold_count?: number | null; sold_avg_kg?: number | null; confirm_withdrawal?: boolean }): Promise<FlockCase> {
  await can("editMedical");
  const s = load();
  const c = caseFor(s, id, true);
  const on = p.closed_on || today();
  const reason = p.reason || "sold";
  if (!["sold", "depleted", "transferred", "other"].includes(reason)) throw fail("flock_close");
  if (on < c.placed_on || on > today()) throw fail("flock_close");
  if (reason === "sold" && !p.confirm_withdrawal) {
    const st = bundleOf(s, c).stats;
    if (st.safe_meat_from && on < st.safe_meat_from) throw fail("flock_withdrawal_active");
    if (st.withdrawal_unknown) throw fail("flock_withdrawal_unknown");
  }
  Object.assign(c, { status: "closed", closed_on: on, close_reason: reason, sold_count: p.sold_count ?? null, sold_avg_kg: p.sold_avg_kg ?? null, updated_at: now() });
  save(s);
  return strip(c) as FlockCase;
}
export async function demoFlockReopen(id: string): Promise<FlockCase> {
  await can("editMedical");
  const s = load();
  const c = caseFor(s, id, false);
  if (c.status === "open") return strip(c) as FlockCase;
  if (s.cases.some((o) => o.farm_id === c.farm_id && o.status === "open" && o.id !== c.id)) throw fail("flock_open_exists");
  Object.assign(c, { status: "open", closed_on: null, close_reason: null, sold_count: null, sold_avg_kg: null, updated_at: now() });
  save(s);
  return strip(c) as FlockCase;
}
export async function demoFlockFarmSave(p: Partial<FlockFarm> & { id: string }, expect: string | null): Promise<FlockFarm> {
  await can("addPets");
  const s = load();
  const f = s.farms.find((x) => x.id === p.id);
  if (!f) throw fail("flock_farm_missing");
  if (expect && f.updated_at !== expect) throw fail("flock_changed");
  const name = ("name" in p ? txt(p.name, 120) : null) ?? f.name;
  const phone = "owner_phone" in p ? p.owner_phone ?? null : f.owner_phone;
  const owner = "owner_name" in p ? p.owner_name ?? null : f.owner_name;
  const k = custKey(phone, owner);
  if (s.farms.some((o) => !o.archived && o.id !== f.id && o.cust_key === k && custNorm(o.name) === custNorm(name))) throw fail("flock_farm_twin");
  if (p.archived && s.cases.some((c) => c.farm_id === f.id && c.status === "open")) throw fail("flock_open_exists");
  Object.assign(f, {
    name, owner_name: "owner_name" in p ? txt(p.owner_name, 120) : f.owner_name, owner_phone: "owner_phone" in p ? txt(p.owner_phone, 40) : f.owner_phone,
    cust_key: k, governorate: "governorate" in p ? txt(p.governorate, 60) : f.governorate, area: "area" in p ? txt(p.area, 120) : f.area,
    houses_count: "houses_count" in p ? p.houses_count ?? null : f.houses_count, note: "note" in p ? txt(p.note, 2000) : f.note,
    archived: p.archived ?? f.archived, updated_at: now(),
  });
  save(s);
  return f;
}

/* ── النافق ──────────────────────────────────────────────────────────────────────────────── */
function putMortality(s: Store, c: FlockCase, p: Partial<FlockMortalityInput>, id: string | null, visitId: string | null, source: FlockMortality["source"]): FlockMortality & Ref {
  const hasHouses = s.houses.some((h) => h.case_id === c.id);
  let house = p.house_id ?? null;
  if (hasHouses && (!house || !s.houses.some((h) => h.id === house && h.case_id === c.id))) throw fail("flock_house");
  if (!hasHouses) house = null;
  const on = p.on_date || today();
  const days = p.days ?? 1, dead = p.dead ?? 0, culled = p.culled ?? 0;
  if (days < 1 || days > 60 || dead < 0 || culled < 0) throw fail("flock_mortality_bad");
  if (on > today() || ageShift(on, -(days - 1)) < c.placed_on) throw fail("flock_mortality_date");
  const lo = ageShift(on, -(days - 1));
  if (s.mortality.some((o) => o.case_id === c.id && (o.house_id ?? null) === house && o.id !== id && ageShift(o.on_date, -(o.days - 1)) <= on && lo <= o.on_date)) {
    throw fail("flock_mortality_overlap");
  }
  const cap = house ? s.houses.find((h) => h.id === house)!.placed_count : c.placed_count;
  if (lostOf(s, c.id, house, id ?? undefined) + dead + culled > cap) throw fail("flock_mortality_over");
  if (id) {
    const m = s.mortality.find((x) => x.id === id)!;
    Object.assign(m, { house_id: house, on_date: on, days, dead, culled, note: txt(p.note, 1000), updated_at: now() });
    return m;
  }
  const m: FlockMortality & Ref = {
    id: uid("fm"), case_id: c.id, house_id: house, on_date: on, days, dead, culled, source, visit_id: visitId, note: txt(p.note, 1000),
    created_at: now(), updated_at: now(), client_ref: p.client_ref?.trim() || null,
  };
  s.mortality.push(m);
  return m;
}
export async function demoFlockMortalitySave(p: FlockMortalityInput): Promise<FlockMortality & { replayed: boolean }> {
  await can("addPets");
  const s = load();
  const ref = p.client_ref?.trim() || null;
  if (!p.id && ref) {
    const m = s.mortality.find((x) => x.client_ref === ref);
    if (m) return { ...(strip(m) as FlockMortality), replayed: true };
  }
  const src = p.source ?? "staff";
  if (src !== "staff" && src !== "farmer") throw fail("flock_mortality_bad");
  let c: FlockCase;
  if (p.id) {
    const m = s.mortality.find((x) => x.id === p.id);
    if (!m) throw fail("flock_mortality_missing");
    if (m.visit_id) throw fail("flock_mortality_visit");
    if (p.expect_updated_at && m.updated_at !== p.expect_updated_at) throw fail("flock_changed");
    c = caseFor(s, m.case_id, true);
  } else c = caseFor(s, p.case_id, true);
  const m = putMortality(s, c, p, p.id ?? null, null, src);
  save(s);
  return { ...(strip(m) as FlockMortality), replayed: false };
}
export async function demoFlockMortalityDelete(id: string): Promise<void> {
  await can("addPets");
  const s = load();
  const m = s.mortality.find((x) => x.id === id);
  if (!m) throw fail("flock_mortality_missing");
  if (m.visit_id) throw fail("flock_mortality_visit");
  caseFor(s, m.case_id, true);
  s.mortality = s.mortality.filter((x) => x.id !== id);
  save(s);
}

/* ── الزيارة ─────────────────────────────────────────────────────────────────────────────── */
const FLOCK_NUM: Record<string, [number, number, boolean]> = {   // [أدنى، أعلى، الأدنى مستبعَد]
  feed_kg_day: [0, 10_000_000, false], water_l_day: [0, 10_000_000, false], alive_est: [0, 10_000_000, false], sample_n: [0, 10_000_000, false],
  avg_weight_g: [0, 20_000, true], temp_c: [-20, 60, false], humidity_pct: [0, 100, false],
};
const PHASES = ["prestarter", "starter", "grower", "finisher", "withdrawal", "layer", "other"];
function cleanFlock(v: unknown): FlockVisit["flock"] {
  const out: Record<string, unknown> = {};
  if (v == null || typeof v !== "object") return out;
  for (const [k, e] of Object.entries(v as Record<string, unknown>)) {
    if (e == null) continue;
    if (k === "feed_phase") { if (!PHASES.includes(String(e))) throw fail("flock_visit_bad"); out[k] = e; }
    else if (k === "feed_source" || k === "note") out[k] = txt(e, k === "note" ? 500 : 120);
    else if (k in FLOCK_NUM) {
      const [lo, hi, excl] = FLOCK_NUM[k];
      if (typeof e !== "number" || !Number.isFinite(e) || e < lo || e > hi || (excl && e <= lo) || (k === "avg_weight_g" && e >= hi)) throw fail("flock_visit_bad");
      out[k] = e;
    } else throw fail("flock_visit_bad");
  }
  return out as FlockVisit["flock"];
}
export async function demoFlockVisitSave(p: FlockVisitInput): Promise<{ visit: FlockVisit; replayed: boolean }> {
  await can("editMedical");
  const s = load();
  const ref = p.client_ref?.trim() || null;
  if (!p.id && ref) {
    const v = s.visits.find((x) => x.client_ref === ref);
    if (v) return { visit: strip(v) as FlockVisit, replayed: true };
  }
  let v: (FlockVisit & Ref) | undefined;
  let c: FlockCase;
  if (p.id) {
    v = s.visits.find((x) => x.id === p.id);
    if (!v) throw fail("flock_visit_missing");
    if (p.expect_updated_at && v.updated_at !== p.expect_updated_at) throw fail("flock_changed");
    c = caseFor(s, v.case_id, true);
  } else c = caseFor(s, p.case_id, true);
  const at = p.at ? new Date(p.at).toISOString() : now();
  const day = localISO(new Date(at));
  if (day < c.placed_on || new Date(at).getTime() > Date.now() + 10 * 60_000) throw fail("flock_visit_date");
  const kind = p.kind ?? "routine";
  if (!["routine", "complaint", "followup"].includes(kind)) throw fail("flock_visit_bad");
  if (p.trend != null && !["better", "same", "worse"].includes(p.trend)) throw fail("flock_visit_bad");
  if (p.dx_status != null && !["suspected", "confirmed"].includes(p.dx_status)) throw fail("flock_visit_bad");
  if (p.next_visit_on && p.next_visit_on < day) throw fail("flock_visit_bad");
  const flock = cleanFlock(p.flock);
  const env: Record<string, "good" | "fair" | "poor"> = {};
  for (const [k, g] of Object.entries(p.env ?? {})) {
    if (!/^[a-z][a-z0-9_]{0,30}$/.test(k) || !["good", "fair", "poor"].includes(String(g))) throw fail("flock_visit_bad");
    env[k] = g;
  }
  if (Object.keys(env).length > 30) throw fail("flock_visit_bad");
  const compliance = p.compliance ?? {};
  if (typeof compliance !== "object" || Array.isArray(compliance) || JSON.stringify(compliance).length > 8000) throw fail("flock_visit_bad");
  const fields = {
    at, kind, flock, signs: codes(p.signs, 60), env, dx: txt(p.dx, 1000), dx_codes: codes(p.dx_codes, 12), dx_status: p.dx_status ?? null,
    notifiable: !!p.notifiable, advice: txt(p.advice, 4000), notes: txt(p.notes, 4000), trend: p.trend ?? null,
    next_visit_on: p.next_visit_on || null, compliance, updated_at: now(),
  };
  // كلُّ الفحوص قبل أيّ كتابة: الرفضُ لا يترك نصفَ زيارة (معاملةٌ واحدة بالخادم).
  const draft = structuredClone(s);
  if (!v) {
    v = { id: uid("fvi"), case_id: c.id, quick: !!p.quick, vet_id: actor(), created_at: now(), created_by: actor(), client_ref: ref, ...fields };
    draft.visits.push(v);
  } else {
    const dv = draft.visits.find((x) => x.id === v!.id)!;
    Object.assign(dv, fields, { quick: p.quick ?? dv.quick });
    v = dv;
  }
  const dc = draft.cases.find((x) => x.id === c.id)!;
  if (p.mortality !== undefined) {
    draft.mortality = draft.mortality.filter((m) => m.visit_id !== v!.id);
    for (const m of p.mortality ?? []) putMortality(draft, dc, { ...m, on_date: m.on_date || day, client_ref: null }, null, v.id, "visit");
  }
  if (p.necropsy !== undefined) {
    draft.necropsy = draft.necropsy.filter((n) => n.visit_id !== v!.id);
    if ((p.necropsy?.length ?? 0) > 50) throw fail("flock_necropsy");
    const seen = new Set<number>();
    for (const b of p.necropsy ?? []) {
      if (!(b.bird_no >= 1 && b.bird_no <= 50) || seen.has(b.bird_no)) throw fail("flock_necropsy");
      seen.add(b.bird_no);
      if (b.source != null && !["dead", "cull", "sacrificed"].includes(b.source)) throw fail("flock_necropsy");
      const sc = b.scores ?? {};
      if (typeof sc !== "object" || Array.isArray(sc) || JSON.stringify(sc).length > 2000
          || Object.entries(sc).some(([k, n]) => !CODE.test(k) || typeof n !== "number" || n < 0 || n > 200)) throw fail("flock_necropsy");
      draft.necropsy.push({ id: uid("fn"), case_id: c.id, visit_id: v.id, bird_no: b.bird_no, source: b.source ?? null, weight_g: b.weight_g ?? null,
        findings: codes(b.findings, 80), scores: sc, note: txt(b.note, 1000) });
    }
  }
  for (const g of p.vax_given ?? []) {
    const x = draft.vax.find((y) => y.id === g.id && y.case_id === c.id);
    if (!x) throw fail("flock_vax_missing");
    const by = g.given_by ?? "vet";
    if (!["vet", "farmer", "hatchery", "other"].includes(by)) throw fail("flock_vax");
    const on = g.given_on || day;
    if (on < c.placed_on || on > today()) throw fail("flock_vax");
    Object.assign(x, { status: "given", given_on: on, given_by: by, batch_no: txt(g.batch_no, 60), birds_count: g.birds_count ?? null,
      take_ok: g.take_ok ?? null, note: txt(g.note, 1000) ?? x.note, skip_reason: null, visit_id: v.id, updated_at: now() });
  }
  for (const n of p.vax_new ?? []) {
    const by = n.given_by ?? "vet";
    if (!ROUTES.includes(n.route ?? "water") || !["vet", "farmer", "hatchery", "other"].includes(by) || !txt(n.vaccine, 120)) throw fail("flock_vax");
    const on = n.given_on || day;
    draft.vax.push({ id: uid("fv"), case_id: c.id, vaccine: txt(n.vaccine, 120)!, disease: txt(n.disease, 120), route: n.route ?? "water",
      planned_age: ageOn(c.placed_on, on), status: "given", given_on: on, given_by: by, batch_no: txt(n.batch_no, 60), birds_count: n.birds_count ?? null,
      take_ok: n.take_ok ?? null, note: txt(n.note, 1000), skip_reason: null, from_program: null, visit_id: v.id, updated_at: now() });
  }
  save(draft);
  return { visit: strip(v) as FlockVisit, replayed: false };
}

/* ── الطبلة ──────────────────────────────────────────────────────────────────────────────── */
export async function demoFlockTreatmentSave(p: FlockTreatmentInput): Promise<FlockTreatment & { replayed: boolean }> {
  await can("editMedical");
  const s = load();
  const ref = p.client_ref?.trim() || null;
  if (ref) {
    const t = s.treatments.find((x) => x.client_ref === ref);
    if (t) return { ...(strip(t) as Omit<FlockTreatment, "lines">), lines: linesOf(s, t.id), replayed: true };
  }
  let o: (Omit<FlockTreatment, "lines"> & Ref) | undefined;
  let c: FlockCase;
  if (p.id) {
    o = s.treatments.find((x) => x.id === p.id);
    if (!o) throw fail("flock_treatment_missing");
    if (p.expect_updated_at && o.updated_at !== p.expect_updated_at) throw fail("flock_changed");
    if (o.status === "replaced") throw fail("flock_treatment_replaced");
    c = caseFor(s, o.case_id, true);
  } else c = caseFor(s, p.case_id, true);
  const editable = !!o && !o.sent_at && !o.printed_at;
  const start = p.start_on || (editable ? o!.start_on : today());
  if (start < c.placed_on || start > ageShift(today(), 30)) throw fail("flock_treatment_date");
  if (!Array.isArray(p.lines) || p.lines.length < 1 || p.lines.length > 30) throw fail("flock_treatment_lines");
  const lines: FlockTreatmentLine[] = p.lines.map((l, i) => {
    const kind = l.kind ?? "med", route = l.route ?? "water";
    const hasAmt = l.dose_amount != null, hasUnit = l.dose_unit != null, hasPer = l.dose_per != null;
    if (!["med", "vitamin", "electrolyte", "disinfectant", "other"].includes(kind) || !LROUTES.includes(route)
        || (hasUnit && !["g", "ml", "mg", "tab", "dose"].includes(l.dose_unit!)) || (hasPer && !["liter", "1000_birds", "kg_bw", "bird", "total"].includes(l.dose_per!))
        || hasAmt !== hasUnit || hasAmt !== hasPer || (hasAmt && !(l.dose_amount! > 0 && l.dose_amount! < 1_000_000))) throw fail("flock_treatment_line");
    if (!(l.day_from >= 1) || !(l.day_to >= l.day_from) || l.day_to > 90) throw fail("flock_treatment_line");
    if (!txt(l.product_name, 160)) throw fail("flock_treatment_line");
    return { id: uid("fl"), treatment_id: "", position: i, day_from: l.day_from, day_to: l.day_to, product_id: l.product_id ?? null,
      product_name: txt(l.product_name, 160)!, kind, dose_amount: l.dose_amount ?? null, dose_unit: l.dose_unit ?? null, dose_per: l.dose_per ?? null,
      strength_pct: l.strength_pct ?? null, hours: l.hours ?? null, route, withdrawal_meat_days: l.withdrawal_meat_days ?? null,
      withdrawal_egg_days: l.withdrawal_egg_days ?? null, note: txt(l.note, 500) };
  });
  let t: Omit<FlockTreatment, "lines"> & Ref;
  if (o && editable) {
    Object.assign(o, { title: txt(p.title, 200), start_on: start, note: txt(p.note, 2000), updated_at: now() });
    s.lines = s.lines.filter((l) => l.treatment_id !== o!.id);
    t = o;
  } else {
    if (o) {
      if (start < o.start_on) throw fail("flock_treatment_date");
      Object.assign(o, { status: "replaced", stopped_on: o.status === "stopped" && o.stopped_on && o.stopped_on < start ? o.stopped_on : start, updated_at: now() });
    }
    t = { id: uid("ft"), case_id: c.id, visit_id: p.visit_id ?? o?.visit_id ?? null, title: txt(p.title, 200), start_on: start, status: "active",
      stopped_on: null, version: (o?.version ?? 0) + 1, supersedes: o?.id ?? null, sent_at: null, printed_at: null, note: txt(p.note, 2000),
      created_at: now(), updated_at: now(), client_ref: ref };
    s.treatments.push(t);
  }
  for (const l of lines) { l.treatment_id = t.id; s.lines.push(l); }
  save(s);
  return { ...(strip(t) as Omit<FlockTreatment, "lines">), lines: linesOf(s, t.id), replayed: false };
}
export async function demoFlockTreatmentMark(id: string, what: "sent" | "printed" | "stop" | "done" | "resume", on: string | null): Promise<Omit<FlockTreatment, "lines">> {
  await can(what === "sent" || what === "printed" ? "addPets" : "editMedical");
  const s = load();
  const t = s.treatments.find((x) => x.id === id);
  if (!t) throw fail("flock_treatment_missing");
  if (t.status === "replaced") throw fail("flock_treatment_replaced");
  caseFor(s, t.case_id, !(what === "sent" || what === "printed"));
  const day = on || today();
  if (what === "sent") t.sent_at = t.sent_at ?? now();
  else if (what === "printed") t.printed_at = t.printed_at ?? now();
  else if (what === "stop") {
    if (t.status !== "active") throw fail("flock_treatment_state");
    if (day < ageShift(t.start_on, -1) || day > today()) throw fail("flock_treatment_date");
    Object.assign(t, { status: "stopped", stopped_on: day, updated_at: now() });
  } else if (what === "done") {
    if (t.status !== "active") throw fail("flock_treatment_state");
    Object.assign(t, { status: "done", updated_at: now() });
  } else if (what === "resume") {
    if (t.status !== "stopped" && t.status !== "done") throw fail("flock_treatment_state");
    Object.assign(t, { status: "active", stopped_on: null, updated_at: now() });
  } else throw fail("flock_treatment_state");
  save(s);
  return strip(t) as Omit<FlockTreatment, "lines">;
}

/* ── التحصين والبرنامج ───────────────────────────────────────────────────────────────────── */
export async function demoFlockVaxSave(p: FlockVaxInput): Promise<FlockVax> {
  await can("editMedical");
  const s = load();
  let x: FlockVax | undefined;
  let c: FlockCase;
  if (p.id) {
    x = s.vax.find((y) => y.id === p.id);
    if (!x) throw fail("flock_vax_missing");
    if (p.expect_updated_at && x.updated_at !== p.expect_updated_at) throw fail("flock_changed");
    c = caseFor(s, x.case_id, true);
  } else c = caseFor(s, p.case_id, true);
  const status = p.status ?? "planned", route = p.route ?? "water";
  if (!["planned", "given", "skipped"].includes(status) || !ROUTES.includes(route)) throw fail("flock_vax");
  const age = p.planned_age ?? null;
  if (age != null && (age < 1 || age > 800)) throw fail("flock_vax");
  if (status === "planned" && age == null) throw fail("flock_vax");
  let on: string | null = null, by: FlockVax["given_by"] = null;
  if (status === "given") {
    on = p.given_on || today();
    if (on < c.placed_on || on > today()) throw fail("flock_vax");
    by = p.given_by ?? "vet";
    if (!["vet", "farmer", "hatchery", "other"].includes(by)) throw fail("flock_vax");
  }
  const skip = txt(p.skip_reason, 300);
  if (status === "skipped" && !skip) throw fail("flock_vax");
  if (!txt(p.vaccine, 120)) throw fail("flock_vax");
  const fields = {
    vaccine: txt(p.vaccine, 120)!, disease: txt(p.disease, 120), route, status, given_on: on, given_by: by,
    batch_no: status === "given" ? txt(p.batch_no, 60) : null, birds_count: status === "given" ? p.birds_count ?? null : null,
    take_ok: status === "given" ? p.take_ok ?? null : null, note: txt(p.note, 1000), skip_reason: status === "skipped" ? skip : null, updated_at: now(),
  };
  if (!x) {
    x = { id: uid("fv"), case_id: c.id, planned_age: age ?? (on ? ageOn(c.placed_on, on) : null), from_program: null, visit_id: null, ...fields };
    s.vax.push(x);
  } else Object.assign(x, fields, { planned_age: age ?? x.planned_age, visit_id: status === "given" ? x.visit_id : null });
  save(s);
  return x;
}
export async function demoFlockVaxDelete(id: string): Promise<void> {
  await can("editMedical");
  const s = load();
  const x = s.vax.find((y) => y.id === id);
  if (!x) throw fail("flock_vax_missing");
  if (x.status === "given") throw fail("flock_vax_given");
  caseFor(s, x.case_id, true);
  s.vax = s.vax.filter((y) => y.id !== id);
  save(s);
}
export async function demoFlockProgramSave(p: { id?: string; name: string; kind: FlockProgram["kind"]; steps: FlockProgramStep[]; archived?: boolean }): Promise<FlockProgram> {
  await can("manageSettings");
  const s = load();
  const kind = p.kind ?? "broiler";
  if (!KINDS.includes(kind)) throw fail("flock_kind");
  if (!txt(p.name, 80)) throw fail("flock_program");
  if (!Array.isArray(p.steps) || p.steps.length > 40) throw fail("flock_program");
  const steps: FlockProgramStep[] = p.steps.map((st) => {
    if (!(st.age >= 1 && st.age <= 800) || !txt(st.vaccine, 120) || !ROUTES.includes(st.route ?? "water")) throw fail("flock_program");
    return { age: st.age, vaccine: txt(st.vaccine, 120)!, disease: txt(st.disease, 120), route: st.route ?? "water", at_hatchery: !!st.at_hatchery };
  });
  let r = p.id ? s.programs.find((x) => x.id === p.id) : undefined;
  if (p.id && !r) throw fail("flock_program");
  if (!r) {
    r = { id: uid("fp"), clinic_id: clinic(), name: txt(p.name, 80)!, kind, steps, archived: false, updated_at: now() };
    s.programs.push(r);
  } else Object.assign(r, { name: txt(p.name, 80)!, kind, steps, archived: p.archived ?? r.archived, updated_at: now() });
  save(s);
  return r;
}

/* ── الصور ───────────────────────────────────────────────────────────────────────────────── */
export async function demoFlockMediaAdd(p: { case_id: string; path: string; visit_id?: string | null; bird_no?: number | null; kind?: FlockMedia["kind"]; caption?: string | null }): Promise<FlockMedia> {
  await can("addPets");
  const s = load();
  const c = caseFor(s, p.case_id, false);
  if (!new RegExp(`^flock/${c.id}/[^/]{1,200}$`).test(p.path ?? "")) throw fail("flock_media");
  const kind = p.kind ?? "photo";
  if (!["photo", "lab", "doc"].includes(kind)) throw fail("flock_media");
  const m: FlockMedia = { id: uid("fmd"), case_id: c.id, visit_id: p.visit_id ?? null, bird_no: p.bird_no ?? null, kind, path: p.path, caption: txt(p.caption, 300), created_at: now() };
  s.media.push(m);
  save(s);
  return m;
}
export async function demoFlockMediaRemove(id: string): Promise<FlockMedia> {
  await can("editMedical");
  const s = load();
  const m = s.media.find((x) => x.id === id);
  if (!m) throw fail("flock_media");
  s.media = s.media.filter((x) => x.id !== id);
  save(s);
  return m;
}
