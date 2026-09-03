import type { Species } from "@/types";
import type { VitalKey } from "./vitals";
import { getActiveClinicId } from "./clinics";
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";
import { setActiveCurrency, countryByCode } from "./currency";

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
interface ClinicPrefs { dial_code: string; logo_url: string | null; social_facebook: string; social_instagram: string; clinic_name: string; pre_sale_print: boolean; override_enabled: boolean; resizable_cart: boolean; font_scale_enabled: boolean; override_pin_mirror: string | null; delivery_zones: string | null; qty_promos: string | null; catalog_share: boolean; cage_layout: string | null; care_protocols: string | null; currency: string | null; country: string | null; pos_v2: boolean; pos_compact: boolean; pos_customer_open: boolean; work_hours: string | null; clock_format: string | null; dose_window: string | null; cash_reconcile: boolean; cash_confirms: string | null }
const DEFAULT_PREFS: ClinicPrefs = { dial_code: DEFAULT_DIAL_CODE, logo_url: null, social_facebook: "", social_instagram: "", clinic_name: "", pre_sale_print: false, override_enabled: false, resizable_cart: false, font_scale_enabled: false, override_pin_mirror: null, delivery_zones: null, qty_promos: null, catalog_share: false, cage_layout: null, care_protocols: null, currency: null, country: null, pos_v2: false, pos_compact: false, pos_customer_open: false, work_hours: null, clock_format: null, dose_window: null, cash_reconcile: false, cash_confirms: null };

const prefsKey = () => `vp_clinic_prefs_${getActiveClinicId()}`;
const legacyDialKey = () => `vp_dial_code_${getActiveClinicId()}`;

let prefsCache: ClinicPrefs | null = null;

const PREFS_PREFIX = "vp_clinic_prefs_";

function readPrefsLocal(): ClinicPrefs {
  try {
    const raw = localStorage.getItem(prefsKey());
    if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ClinicPrefs>) };
  } catch { /* ignore */ }
  // Self-heal across clinic-id changes: if this clinic's key is empty but exactly
  // ONE clinic_prefs blob exists on the device, adopt it — so the dial code, logo
  // AND the Manager-Override enable flag don't "disappear" when the active clinic
  // id is represented differently between sessions (the same class of bug that
  // made the override PIN vanish).
  try {
    const hits = Object.keys(localStorage).filter((k) => k.startsWith(PREFS_PREFIX));
    if (hits.length === 1) {
      const raw = localStorage.getItem(hits[0]);
      if (raw) return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<ClinicPrefs>) };
    }
  } catch { /* ignore */ }
  // Fall back to the legacy dial-only key so existing dial codes aren't lost.
  try { const d = localStorage.getItem(legacyDialKey()); if (d) return { ...DEFAULT_PREFS, dial_code: d }; } catch { /* ignore */ }
  return { ...DEFAULT_PREFS };
}

function savePrefsLocal(p: ClinicPrefs) {
  prefsCache = p;
  try { localStorage.setItem(prefsKey(), JSON.stringify(p)); } catch { /* ignore */ }
  // العملة النشطة تعيش في currency.ts (حتى لا يستورد utils.ts هذا الملف) —
  // نزامنها هنا عند كل حفظ فتبقى money() صادقة دائماً.
  setActiveCurrency(p.currency);
}

function prefs(): ClinicPrefs {
  return prefsCache ?? readPrefsLocal();
}

/* Pending cloud patches — pref writes whose Supabase upsert hasn't been
 * CONFIRMED yet (typically because the column's migration hasn't run on the
 * clinic's database). Without this, enabling a new toggle pre-migration is
 * silently reverted the first time the column lands with its false default and
 * hydrate overwrites the local mirror. Pending keys win over the hydrated row
 * and are re-pushed after every successful hydrate. */
const pendingPrefsKey = () => `vp_clinic_prefs_pending_${getActiveClinicId()}`;
function readPendingPrefs(): Partial<ClinicPrefs> {
  try { const raw = localStorage.getItem(pendingPrefsKey()); if (raw) return JSON.parse(raw) as Partial<ClinicPrefs>; } catch { /* ignore */ }
  return {};
}
function setPendingPrefs(p: Partial<ClinicPrefs>) {
  try {
    if (Object.keys(p).length === 0) localStorage.removeItem(pendingPrefsKey());
    else localStorage.setItem(pendingPrefsKey(), JSON.stringify(p));
  } catch { /* ignore */ }
}
function clearPendingPrefKeys(keys: string[]) {
  const cur = readPendingPrefs() as Record<string, unknown>;
  for (const k of keys) delete cur[k];
  setPendingPrefs(cur as Partial<ClinicPrefs>);
}

export async function hydrateClinicPrefs(): Promise<void> {
  const client = sb();
  if (!client) { prefsCache = readPrefsLocal(); setActiveCurrency(prefsCache.currency); return; }
  try {
    // select("*") tolerates any schema age: columns a pre-migration database
    // doesn't have yet simply aren't in the payload, and the mapping below
    // falls back to this device's local mirror for them.
    const { data, error } = await client.from("clinic_prefs").select("*").maybeSingle();
    if (error) throw error;
    if (data) {
      const d = data as Partial<ClinicPrefs>;
      const local = readPrefsLocal();
      prefsCache = {
        dial_code: d.dial_code || DEFAULT_DIAL_CODE,
        logo_url: d.logo_url ?? null,
        social_facebook: d.social_facebook ?? "",
        social_instagram: d.social_instagram ?? "",
        clinic_name: d.clinic_name ?? "",
        // Columns missing pre-migration → keep whatever this device had locally.
        pre_sale_print: d.pre_sale_print ?? local.pre_sale_print,
        override_enabled: d.override_enabled ?? local.override_enabled,
        resizable_cart: d.resizable_cart ?? local.resizable_cart,
        font_scale_enabled: d.font_scale_enabled ?? local.font_scale_enabled,
        // مرآة رمز المدير السحابية (0093): جهاز جديد كلياً يستلم الرمز من هنا.
        // «?? local» عمداً — سحابة بلا العمود/بلا قيمة لا تمسح مرآة موجودة أبداً.
        override_pin_mirror: d.override_pin_mirror ?? local.override_pin_mirror,
        delivery_zones: d.delivery_zones ?? local.delivery_zones,
        qty_promos: d.qty_promos ?? local.qty_promos,
        catalog_share: typeof d.catalog_share === "boolean" ? d.catalog_share : local.catalog_share,
        cage_layout: d.cage_layout ?? local.cage_layout,
        care_protocols: d.care_protocols ?? local.care_protocols,
        currency: d.currency ?? local.currency,
        country: d.country ?? local.country,
        pos_v2: typeof d.pos_v2 === "boolean" ? d.pos_v2 : local.pos_v2,
        pos_compact: typeof d.pos_compact === "boolean" ? d.pos_compact : local.pos_compact,
        pos_customer_open: typeof d.pos_customer_open === "boolean" ? d.pos_customer_open : local.pos_customer_open,
        work_hours: d.work_hours ?? local.work_hours,
        clock_format: d.clock_format ?? local.clock_format,
        dose_window: d.dose_window ?? local.dose_window,
        cash_reconcile: typeof d.cash_reconcile === "boolean" ? d.cash_reconcile : local.cash_reconcile,
        cash_confirms: d.cash_confirms ?? local.cash_confirms,
      };
    } else {
      // No row yet → migrate any local prefs up (or seed the default dial code).
      const local = readPrefsLocal();
      prefsCache = local;
      await client.from("clinic_prefs").upsert(
        { dial_code: local.dial_code, logo_url: local.logo_url, social_facebook: local.social_facebook, social_instagram: local.social_instagram, clinic_name: local.clinic_name },
        { onConflict: "clinic_id" },
      );
      // The seed payload can't carry the boolean opt-ins (one missing column
      // would fail the whole upsert on an un-migrated DB). Queue any that are
      // locally enabled as pending — the resync below pushes each patch
      // separately, so the seeded row's false defaults can't clobber them.
      const boolPatch: Partial<ClinicPrefs> = {};
      if (local.pre_sale_print) boolPatch.pre_sale_print = true;
      if (local.override_enabled) boolPatch.override_enabled = true;
      if (local.resizable_cart) boolPatch.resizable_cart = true;
      if (local.font_scale_enabled) boolPatch.font_scale_enabled = true;
      if (local.override_pin_mirror) boolPatch.override_pin_mirror = local.override_pin_mirror;
      if (local.delivery_zones) boolPatch.delivery_zones = local.delivery_zones;
      if (local.qty_promos) boolPatch.qty_promos = local.qty_promos;
      if (local.catalog_share) boolPatch.catalog_share = true;
      if (local.cage_layout) boolPatch.cage_layout = local.cage_layout;
      if (local.care_protocols) boolPatch.care_protocols = local.care_protocols;
      if (local.currency) boolPatch.currency = local.currency;
      if (local.country) boolPatch.country = local.country;
      if (local.pos_v2) boolPatch.pos_v2 = true;
      if (local.pos_compact) boolPatch.pos_compact = true;
      if (local.pos_customer_open) boolPatch.pos_customer_open = true;
      if (local.work_hours) boolPatch.work_hours = local.work_hours;
      if (local.clock_format) boolPatch.clock_format = local.clock_format;
      if (local.dose_window) boolPatch.dose_window = local.dose_window;
      if (local.cash_reconcile) boolPatch.cash_reconcile = true;
      if (local.cash_confirms) boolPatch.cash_confirms = local.cash_confirms;
      if (Object.keys(boolPatch).length) setPendingPrefs({ ...readPendingPrefs(), ...boolPatch });
    }
    // Unconfirmed pref writes (e.g. a toggle flipped before its column's
    // migration ran) beat the hydrated row and get re-pushed now.
    const pending = readPendingPrefs();
    if (Object.keys(pending).length) {
      prefsCache = { ...prefsCache, ...pending };
      cloudWrite(async () => {
        const res = await client.from("clinic_prefs").upsert(pending, { onConflict: "clinic_id" });
        if (!res.error) clearPendingPrefKeys(Object.keys(pending));
        return res;
      }, "prefs-pending-resync");
    }
    savePrefsLocal(prefsCache);
  } catch {
    prefsCache = readPrefsLocal();
    setActiveCurrency(prefsCache.currency);
  }
}
registerHydrator(hydrateClinicPrefs);
registerReset(() => { prefsCache = null; });

/** Write one or more pref fields: optimistic cache+local update, then cloud upsert.
 *  The patch stays "pending" until the upsert is confirmed, so a write the DB
 *  can't take yet (missing column pre-migration) re-syncs on the next hydrate
 *  instead of being reverted by the column's default. */
function patchPrefs(patch: Partial<ClinicPrefs>, ctx: string) {
  savePrefsLocal({ ...prefs(), ...patch });
  if (!sb()) return; // demo/offline — localStorage IS the source of truth
  setPendingPrefs({ ...readPendingPrefs(), ...patch });
  cloudWrite(async () => {
    const res = await sb()!.from("clinic_prefs").upsert(patch, { onConflict: "clinic_id" });
    if (!res.error) clearPendingPrefKeys(Object.keys(patch));
    return res;
  }, ctx);
}

export function getDialCode(): string {
  return prefs().dial_code || DEFAULT_DIAL_CODE;
}

export function setDialCode(code: string) {
  const clean = code.trim() || DEFAULT_DIAL_CODE;
  const normalized = clean.startsWith("+") ? clean : `+${clean.replace(/\D/g, "")}`;
  patchPrefs({ dial_code: normalized }, "dial-code-set");
}

/* ---- عملة العيادة (0108) — تُشتق من الدولة المختارة عند إنشاء الحساب ------
 * وتتزامن سحابياً كبقية التفضيلات، فكل أجهزة العيادة تعرض نفس العملة.
 * currencySymbol()/money() في utils.ts يقرآنها عبر currency.ts. ---- */
export function getCurrencyCode(): string {
  return (prefs().currency || "IQD").toUpperCase();
}
export function setCurrencyCode(code: string) {
  patchPrefs({ currency: code.trim().toUpperCase() || null }, "currency-set");
}
export function getClinicCountry(): string | null {
  return prefs().country;
}

/** بذر عملة العيادة مرة واحدة بعد أول دخول: الدولة المختارة عند التسجيل تصل
 *  هنا (من الذاكرة المحلية أو من بيانات الحساب) فتُثبَّت العملة ورمز الاتصال —
 *  ولا تلمس شيئاً لو سبق للعيادة أن اختارت عملة. */
export function seedClinicLocale(countryCode?: string | null, currency?: string | null) {
  const cur = prefs();
  if (cur.currency) return; // العيادة محسومة العملة — لا نغيّر قرارها
  const c = countryCode ? countryByCode(countryCode) : undefined;
  const code = (currency || c?.cur || "").toUpperCase();
  if (!code) return;
  const patch: Partial<ClinicPrefs> = { currency: code, country: c?.code ?? countryCode ?? null };
  // رمز الاتصال يتبع الدولة فقط إذا ما زال على افتراضه العراقي.
  if (c && c.dial.length > 1 && cur.dial_code === DEFAULT_DIAL_CODE) patch.dial_code = c.dial;
  patchPrefs(patch, "locale-seed");
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

/** Opt-in cashier feature: print a PRO-FORMA invoice BEFORE completing the sale.
 *  Off by default — only clinics that enable it in Settings see the button. */
export function getPreSalePrint(): boolean {
  return !!prefs().pre_sale_print;
}
export function setPreSalePrint(v: boolean) {
  patchPrefs({ pre_sale_print: v }, "pre-sale-print-set");
}

/** Opt-in Manager Override (وضع المدير برمز سري): this flag only reveals the
 *  unlock icon — the PIN itself is verified server-side (migration 0048). */
export function getOverrideEnabled(): boolean {
  return !!prefs().override_enabled;
}
export function setOverrideEnabled(v: boolean) {
  patchPrefs({ override_enabled: v }, "override-enabled-set");
}

/* ---- مرآة رمز المدير السحابية — البيت الثالث للرمز (بعد bcrypt السيرفر
 * ومرآة الجهاز). تتزامن عبر الأجهزة بنفس نظام الـ prefs، فحتى مسح تخزين
 * المتصفح الكامل ما يضيّع الرمز: أول hydration يرجّعه. ---- */
export function getOverridePinMirror(): string | null {
  return prefs().override_pin_mirror ?? null;
}
export function setOverridePinMirror(hash: string | null) {
  patchPrefs({ override_pin_mirror: hash }, "override-pin-mirror-set");
}

/** Opt-in resizable POS cart (سلة قابلة لتغيير الحجم): reveals a drag handle on
 *  the sale cart's edge on wide screens (migration 0067). The chosen width is a
 *  per-device preference — only this enable flag is clinic-wide. */
export function getResizableCart(): boolean {
  return !!prefs().resizable_cart;
}
export function setResizableCart(v: boolean) {
  patchPrefs({ resizable_cart: v }, "resizable-cart-set");
}

/** Opt-in UI font scaling (حجم الخط): reveals the size picker in Settings
 *  (migration 0068). The chosen size is a per-device preference — only this
 *  enable flag is clinic-wide. */
export function getFontScaleEnabled(): boolean {
  return !!prefs().font_scale_enabled;
}
export function setFontScaleEnabled(v: boolean) {
  patchPrefs({ font_scale_enabled: v }, "font-scale-enabled-set");
}

/* ---- مناطق التوصيل (0099) — قائمة عيادية: اسم المنطقة + أجرة اختيارية.
 * تُخزَّن كنص JSON داخل clinic_prefs فتتزامن عبر الأجهزة بنفس آلية
 * التفضيلات (مرآة محلية + معلّق قبل الهجرة)، والكاشير يختار منها عند البيع
 * بالتوصيل فتنملي الأجرة تلقائياً. ---- */
export interface DeliveryZone { name: string; fee: number }

export function getDeliveryZones(): DeliveryZone[] {
  try {
    const raw = prefs().delivery_zones;
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((z): z is { name?: unknown; fee?: unknown } => !!z && typeof z === "object")
      .map((z) => ({ name: String(z.name ?? "").trim(), fee: Math.max(0, Number(z.fee) || 0) }))
      .filter((z) => z.name);
  } catch { return []; }
}

export function setDeliveryZones(zones: DeliveryZone[]) {
  const clean = zones
    .map((z) => ({ name: z.name.trim(), fee: Math.max(0, Number(z.fee) || 0) }))
    .filter((z) => z.name);
  patchPrefs({ delivery_zones: clean.length ? JSON.stringify(clean) : null }, "delivery-zones-set");
}

/* ---- عروض الكمية (0100، ووُسّعت بـ0102) ------------------------------------
 * «كل N خصم X» — والقاعدة تحسب **مجمّعة** عبر كل الأصناف المشمولة، لا سطراً
 * سطراً. هذا هو الفرق الجوهري: عرض على ثلاثة شامبوهات مختلفة يتحقق بشامبو من
 * كل نوع، لأن الزبون دفع ثمن ثلاث قطع فعلاً — الحساب القديم (سطر لوحده) كان
 * يفوّت هذي الحالة تماماً.
 *
 *   kind  — منتجات أو خدمات (الخدمات تنضم بـ0102: «ثلاث خدمات بسعر واحد»)
 *   ids   — المشمولون؛ فاضية = كل أصناف هذا النوع
 *   mode  — off: خصم مبلغ لكل مجموعة مكتملة · bundle: سعر جديد للمجموعة كاملة
 *
 * التطبيق بشاشة البيع يبقى يدوياً: زر أحمر، والكاشير يقرر. ------------------ */
export type PromoKind = "product" | "service";
export type PromoMode = "off" | "bundle";

export interface QtyPromo {
  id: string;
  /** اسم اختياري يظهر بشاشة البيع («عرض الشامبو»). */
  name: string | null;
  kind: PromoKind;
  /** معرّفات الأصناف المشمولة — فاضية = كل أصناف هذا النوع. */
  ids: string[];
  /** لقطة أسماء وقت الإنشاء: العرض يبقى مفهوماً حتى لو انحذف صنف. */
  names: string[];
  /** كل كم قطعة/خدمة (مجموع الكميات عبر المشمولين). */
  qty: number;
  mode: PromoMode;
  /** mode=off — مقدار الخصم لكل مجموعة مكتملة. */
  off: number;
  /** mode=bundle — السعر الجديد للمجموعة كاملة. */
  bundlePrice: number;
  active: boolean;
}

/** وصف الهدف بالعربي — يُستعمل بالإعدادات وبشاشة البيع. */
export function promoTargetLabel(r: QtyPromo): string {
  const all = r.kind === "service" ? "كل الخدمات" : "كل المنتجات";
  if (!r.ids.length) return all;
  if (r.ids.length === 1) return r.names[0] || all;
  return `${r.names.length || r.ids.length} ${r.kind === "service" ? "خدمات" : "منتجات"} مختارة`;
}

export function getQtyPromos(): QtyPromo[] {
  try {
    const raw = prefs().qty_promos;
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((z): z is Record<string, unknown> => !!z && typeof z === "object")
      .map((z) => {
        // توافق خلفي: قواعد محفوظة بالشكل القديم (productId/productName مفردين)
        // تُقرأ كقاعدة منتجات بهدف واحد — بلا فقدان ولا هجرة يدوية.
        const legacyId = z.productId ? String(z.productId) : null;
        const legacyName = z.productName ? String(z.productName) : null;
        const ids = Array.isArray(z.ids) ? z.ids.map(String).filter(Boolean) : (legacyId ? [legacyId] : []);
        const names = Array.isArray(z.names) ? z.names.map(String).filter(Boolean) : (legacyName ? [legacyName] : []);
        const mode: PromoMode = z.mode === "bundle" ? "bundle" : "off";
        return {
          id: String(z.id ?? ""),
          name: z.name ? String(z.name) : null,
          kind: (z.kind === "service" ? "service" : "product") as PromoKind,
          ids,
          names,
          qty: Math.max(2, Math.floor(Number(z.qty) || 0)),
          mode,
          off: Math.max(0, Number(z.off) || 0),
          bundlePrice: Math.max(0, Number(z.bundlePrice) || 0),
          active: z.active !== false,
        };
      })
      // العرض بلا مكافأة لا معنى له — نسقطه بدل ما يظهر زر خصم بصفر.
      .filter((z) => z.id && z.qty >= 2 && (z.mode === "bundle" ? z.bundlePrice > 0 : z.off > 0));
  } catch { return []; }
}

export function setQtyPromos(rules: QtyPromo[]) {
  patchPrefs({ qty_promos: rules.length ? JSON.stringify(rules) : null }, "qty-promos-set");
}

/* ---- الكتالوج المشترك (0103) — مشاركة منتجات هذي العيادة مع بقية العيادات.
 * مطفأ افتراضياً وبقرار صريح: يشمل سعر الشراء، وهو سرّ تجاري. الاستفادة من
 * الكتالوج لا تتطلب تفعيله — لو ربطناهما لصار ابتزازاً لا اختياراً. ---- */
export function getCatalogShare(): boolean {
  return prefs().catalog_share === true;
}
export function setCatalogShare(on: boolean) {
  patchPrefs({ catalog_share: on }, "catalog-share-set");
}

/* ---- تخطيط الأقفاص (0107) — غرف العيادة وأقفاصها، لخريطة الأقفاص المرئية.
 * رموز الأقفاص نص حر (نفس حقل admission.cage القائم منذ البداية)، فالخريطة
 * تلتقي مع بيانات الرقود الموجودة بلا أي هجرة بيانات. ---- */
export interface CageRoom {
  id: string;
  name: string;
  cages: string[];
}

export function getCageLayout(): CageRoom[] {
  try {
    const raw = prefs().cage_layout;
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((r): r is Record<string, unknown> => !!r && typeof r === "object")
      .map((r) => ({
        id: String(r.id ?? ""),
        name: String(r.name ?? "").trim(),
        cages: Array.isArray(r.cages) ? r.cages.map((c) => String(c).trim()).filter(Boolean) : [],
      }))
      .filter((r) => r.id && r.name);
  } catch { return []; }
}

/* ---- بروتوكولات العيادة (0116) --------------------------------------------
 * تُخزَّن نصَّ JSON بعمودٍ واحد، كما `cage_layout` و`qty_promos` قبلها. والقراءة
 * والكتابة خامٌّ هنا: تفسيرُ الشكل يخصّ `protocols.ts` وحده، فلا يعرف مخزنُ
 * الإعدادات شيئاً عن الأدوية ولا يستورد الدليل الدوائي.
 *
 * وقيمة النمط أن العمود الناقص لا يعطّل شيئاً: `?? local` يُبقي ما بالجهاز،
 * فالعيادة تبني بروتوكولاتها اليوم وتُطبَّق الهجرة متى تيسّر — وعندها تُرفَع
 * لتصير مشتركةً بين كل الأجهزة والكادر. */
export function getCareProtocolsRaw(): string | null {
  return prefs().care_protocols;
}

export function setCareProtocolsRaw(json: string | null) {
  patchPrefs({ care_protocols: json }, "care-protocols-set");
}

export function setCageLayout(rooms: CageRoom[]) {
  const clean = rooms
    .map((r) => ({ id: r.id, name: r.name.trim(), cages: r.cages.map((c) => c.trim()).filter(Boolean) }))
    .filter((r) => r.name);
  patchPrefs({ cage_layout: clean.length ? JSON.stringify(clean) : null }, "cage-layout-set");
}

/* ---- شاشة البيع الجديدة (0109) — تفعيل اختياري لكل عيادة -------------------
 * إعادة بناء شاشة الكاشير: سلة لا تغادر الشاشة أبداً، حقول اختيارية مطويّة،
 * وشبكة منتجات تتنفّس مع عرض الجهاز. مطفأة افتراضياً: العيادة تجرّبها بقرارها
 * وترجع بضغطة إن لم تعجبها — لا نغيّر أداة عمل يومية على أحد بلا إذنه. */
export function getPosV2(): boolean {
  return prefs().pos_v2 === true;
}
export function setPosV2(on: boolean) {
  patchPrefs({ pos_v2: on }, "pos-v2-set");
}
/* خيارا الشاشة المتطوّرة (0147) — يعملان مع pos_v2 فقط:
 *   • pos_compact: المنتجاتُ والخدماتُ سطورٌ لا مربّعات، فالسلّةُ تأخذ ما تحرّر.
 *   • pos_customer_open: صندوقُ الزبون مفتوحٌ دائماً (سطرٌ واحد نحيف) بلا طيّ.
 * الشكوى: «المربّعات تاكل الشاشة على حساب السلة» على شاشاتِ مكاتبَ صغيرة. */
export function getPosCompact(): boolean {
  return prefs().pos_compact === true;
}
export function setPosCompact(on: boolean) {
  patchPrefs({ pos_compact: on }, "pos-compact-set");
}
export function getPosCustomerOpen(): boolean {
  return prefs().pos_customer_open === true;
}
export function setPosCustomerOpen(on: boolean) {
  patchPrefs({ pos_customer_open: on }, "pos-customer-open-set");
}

/* ---- دوام العيادة وصيغة الساعة (0119) --------------------------------------
 * الدكتور يحدّد أوقات الدوام الرسمية (صباحي، ومسائي اختياري) فتتزامن معها
 * جرعات الأدوية تلقائياً (treatmentSchedule.doseTimesFor) وتتقسّم عليها
 * مطابقة الصندوق اليومية. الصيغة "HH:MM" بساعة ٢٤ داخلياً دائماً — العرض
 * وحده يتبع صيغة ١٢/٢٤ المختارة. */
export interface ShiftWindow { from: string; to: string }
export interface WorkHours { am: ShiftWindow | null; pm: ShiftWindow | null }

const HHMM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;
const cleanShift = (s: unknown): ShiftWindow | null => {
  if (!s || typeof s !== "object") return null;
  const from = String((s as { from?: unknown }).from ?? "").trim();
  const to = String((s as { to?: unknown }).to ?? "").trim();
  if (!HHMM_RE.test(from) || !HHMM_RE.test(to) || from === to) return null;
  return { from, to };
};

export function getWorkHours(): WorkHours {
  try {
    const raw = prefs().work_hours;
    if (!raw) return { am: null, pm: null };
    const o = JSON.parse(raw) as { am?: unknown; pm?: unknown };
    return { am: cleanShift(o.am), pm: cleanShift(o.pm) };
  } catch { return { am: null, pm: null }; }
}

export function setWorkHours(w: WorkHours) {
  const clean: WorkHours = { am: cleanShift(w.am), pm: cleanShift(w.pm) };
  patchPrefs({ work_hours: clean.am || clean.pm ? JSON.stringify(clean) : null }, "work-hours-set");
}

/** صيغة عرض الساعة: "12" (ص/م — الافتراضي بعياداتنا) أو "24". */
export type ClockFormat = "12" | "24";
export function getClockFormat(): ClockFormat {
  return prefs().clock_format === "24" ? "24" : "12";
}
export function setClockFormat(f: ClockFormat) {
  patchPrefs({ clock_format: f }, "clock-format-set");
}

/* ---- نافذة إعطاء الأدوية — «يعطى من هاي الساعة لهاي الساعة» ---------------
 * auto: تُشتق من الدوام نفسه (بداية الصباحي → نهاية آخر دوام).
 * custom: الدكتور يثبّت نافذة بيده، فتتوزّع الجرعات داخلها هي. */
export interface DoseWindow { mode: "auto" | "custom"; from?: string; to?: string }

export function getDoseWindow(): DoseWindow {
  try {
    const raw = prefs().dose_window;
    if (!raw) return { mode: "auto" };
    const o = JSON.parse(raw) as { mode?: unknown; from?: unknown; to?: unknown };
    if (o.mode === "custom") {
      const w = cleanShift({ from: o.from, to: o.to });
      if (w) return { mode: "custom", from: w.from, to: w.to };
    }
    return { mode: "auto" };
  } catch { return { mode: "auto" }; }
}

export function setDoseWindow(w: DoseWindow) {
  const custom = w.mode === "custom" ? cleanShift({ from: w.from, to: w.to }) : null;
  patchPrefs({ dose_window: custom ? JSON.stringify({ mode: "custom", ...custom }) : null }, "dose-window-set");
}

/* ---- مطابقة الصندوق اليومية (0119) -----------------------------------------
 * خيار تفعيلي: زر «مطابقة الصندوق» بشاشة المبيعات — تأكيد نهائي بنهاية كل
 * دوام أن النقد بالصندوق مطابق للسستم. التأكيدات سجل JSON صغير يتزامن مع
 * بقية التفضيلات (آخر ١٢٠ تأكيداً تكفي لأشهر من العمل اليومي). */
export function getCashReconcile(): boolean {
  return prefs().cash_reconcile === true;
}
export function setCashReconcile(on: boolean) {
  patchPrefs({ cash_reconcile: on }, "cash-reconcile-set");
}

export interface CashConfirm {
  date: string;                 // "YYYY-MM-DD"
  shift: "am" | "pm" | "day";   // أي دوام أُكّد — "day" حين لا دوامين
  sales: number;                // مبيعات الدوام (إجمالي الفواتير)
  expected: number;             // النقد المتوقع بالصندوق
  counted: number;              // النقد المعدود فعلياً
  by: string | null;            // مَن أكّد
  at: string;                   // ISO وقت التأكيد
}

export function getCashConfirms(): CashConfirm[] {
  try {
    const raw = prefs().cash_confirms;
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((c): c is Record<string, unknown> => !!c && typeof c === "object")
      .map((c) => ({
        date: String(c.date ?? ""),
        shift: (c.shift === "am" || c.shift === "pm" ? c.shift : "day") as CashConfirm["shift"],
        sales: Number(c.sales) || 0,
        expected: Number(c.expected) || 0,
        counted: Number(c.counted) || 0,
        by: c.by ? String(c.by) : null,
        at: String(c.at ?? ""),
      }))
      .filter((c) => c.date);
  } catch { return []; }
}

/** يضيف تأكيداً (أو يستبدل تأكيد نفس اليوم ونفس الدوام — إعادة العدّ تصحّح لا تكرّر). */
export function addCashConfirm(c: CashConfirm) {
  const rest = getCashConfirms().filter((x) => !(x.date === c.date && x.shift === c.shift));
  const next = [c, ...rest].slice(0, 120);
  patchPrefs({ cash_confirms: JSON.stringify(next) }, "cash-confirm-add");
}
