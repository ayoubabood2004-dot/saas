// Dynamic, doctor-configurable "Mix & Match" promotions. Each clinic defines its own
// PromoRules (target subcategory, bundle quantity, bundle price); the POS cart engine
// applies them at sale time. Persisted to Supabase (table clinic_promos, isolated by
// clinic_id = auth_clinic()) with an in-memory cache + localStorage mirror.
import { getActiveClinicId } from "./clinics";
import { uuid } from "./utils";
import { sb, cloudWrite, registerHydrator, registerReset } from "./clinicSync";

export interface PromoRule {
  id: string;
  /** Display name shown on the cart, e.g. "عرض المعلبات 3 بـ 5". */
  name: string;
  /** Target product subcategory the rule groups by, e.g. "معلبات". */
  subcategory: string;
  /** Bundle size — how many units make one bundle (e.g. 3). */
  qty: number;
  /** Total price the doctor charges for one bundle (e.g. 5000). */
  bundlePrice: number;
  /** Inactive rules are kept but not applied at checkout. */
  active: boolean;
}

const keyName = () => `vp_promos_${getActiveClinicId()}`;

let cache: PromoRule[] | null = null;

interface PromoRow { id: string; name: string; subcategory: string; qty: number; bundle_price: number; active: boolean }
const rowToRule = (r: PromoRow): PromoRule => ({ id: r.id, name: r.name, subcategory: r.subcategory, qty: r.qty, bundlePrice: Number(r.bundle_price), active: r.active });
const ruleToRow = (r: PromoRule): PromoRow => ({ id: r.id, name: r.name, subcategory: r.subcategory, qty: r.qty, bundle_price: r.bundlePrice, active: r.active });

function readLocal(): PromoRule[] {
  try {
    const raw = localStorage.getItem(keyName());
    if (raw) { const p = JSON.parse(raw) as PromoRule[]; if (Array.isArray(p)) return p; }
  } catch { /* ignore */ }
  return [];
}

function saveLocal(list: PromoRule[]) {
  try { localStorage.setItem(keyName(), JSON.stringify(list)); } catch { /* ignore */ }
}

export async function hydratePromos(): Promise<void> {
  const client = sb();
  if (!client) { cache = readLocal(); return; }
  try {
    const { data, error } = await client.from("clinic_promos").select("*").order("created_at");
    if (error) throw error;
    let next = (data ?? []).map((r) => rowToRule(r as PromoRow));
    if (next.length === 0) {
      const local = readLocal();
      if (local.length) { await client.from("clinic_promos").insert(local.map(ruleToRow)); next = local; }
    }
    cache = next;
    saveLocal(next);
  } catch {
    cache = readLocal();
  }
}
registerHydrator(hydratePromos);
registerReset(() => { cache = null; });

export function getPromoRules(): PromoRule[] {
  return cache ?? readLocal();
}

function commit(list: PromoRule[]) { cache = list; saveLocal(list); }

/** Add a rule. Returns the new rule, or null if the inputs are invalid. */
export function addPromoRule(input: { name: string; subcategory: string; qty: number; bundlePrice: number }): PromoRule | null {
  const name = input.name.trim();
  const subcategory = input.subcategory.trim();
  const qty = Math.floor(input.qty);
  const bundlePrice = Math.max(0, input.bundlePrice);
  if (!name || !subcategory || !Number.isFinite(qty) || qty < 1) return null;
  const rule: PromoRule = { id: uuid(), name, subcategory, qty, bundlePrice, active: true };
  commit([...getPromoRules(), rule]);
  cloudWrite(() => sb()!.from("clinic_promos").insert(ruleToRow(rule)), "promo-add");
  return rule;
}

export function updatePromoRule(id: string, patch: Partial<Omit<PromoRule, "id">>) {
  const list = getPromoRules();
  const r = list.find((x) => x.id === id);
  if (!r) return;
  const next = { ...r, ...patch };
  commit(list.map((x) => (x.id === id ? next : x)));
  const row = ruleToRow(next);
  cloudWrite(() => sb()!.from("clinic_promos").update({ name: row.name, subcategory: row.subcategory, qty: row.qty, bundle_price: row.bundle_price, active: row.active }).eq("id", id), "promo-update");
}

export function togglePromoRule(id: string) {
  const r = getPromoRules().find((x) => x.id === id);
  if (!r) return;
  updatePromoRule(id, { active: !r.active });
}

export function removePromoRule(id: string) {
  commit(getPromoRules().filter((x) => x.id !== id));
  cloudWrite(() => sb()!.from("clinic_promos").delete().eq("id", id), "promo-del");
}

/* ----------------------------- Cart engine ----------------------------- */

/** One cart line, reduced to what the promo engine needs. */
export interface PromoCartLine {
  subcategory: string | null;
  qty: number;
  unit_price: number;
}

/** A promotion that actually fired on the current cart. */
export interface AppliedPromo {
  ruleId: string;
  name: string;
  /** How many complete bundles were formed. */
  bundles: number;
  /** Money deducted from the subtotal by this promo (>= 0). */
  discount: number;
}

/**
 * Evaluate every active rule against the cart. For each rule we group the cart lines
 * whose subcategory matches, sum their quantities, and — if there are enough units for
 * at least one bundle — form `floor(sumQty / qty)` bundles. The discount is the gap
 * between the standard price of the bundled units (the most expensive ones, so the
 * customer always gets the best deal) and the doctor's bundle price × bundles.
 */
export function computePromotions(lines: PromoCartLine[], rules: PromoRule[]): { applied: AppliedPromo[]; totalDiscount: number } {
  const applied: AppliedPromo[] = [];
  let totalDiscount = 0;

  for (const rule of rules) {
    if (!rule.active || rule.qty < 1) continue;
    const sub = rule.subcategory.trim().toLowerCase();

    // Flatten the matching lines into a list of per-unit prices.
    const unitPrices: number[] = [];
    for (const l of lines) {
      if ((l.subcategory ?? "").trim().toLowerCase() === sub) {
        for (let i = 0; i < l.qty; i++) unitPrices.push(l.unit_price);
      }
    }

    const sumQty = unitPrices.length;
    if (sumQty < rule.qty) continue; // not enough for a single bundle

    const bundles = Math.floor(sumQty / rule.qty);
    const bundledUnits = bundles * rule.qty;
    // Apply the bundle to the most expensive eligible units (customer-favourable).
    unitPrices.sort((a, b) => b - a);
    const standardTotal = unitPrices.slice(0, bundledUnits).reduce((s, p) => s + p, 0);
    const promoTotal = bundles * rule.bundlePrice;
    const discount = Math.round((standardTotal - promoTotal) * 100) / 100;

    if (discount > 0) {
      applied.push({ ruleId: rule.id, name: rule.name, bundles, discount });
      totalDiscount += discount;
    }
  }

  return { applied, totalDiscount: Math.round(totalDiscount * 100) / 100 };
}

/** Distinct, non-empty subcategories across a set of products (for dropdown suggestions). */
export function subcategoriesOf(products: { subcategory?: string | null }[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of products) {
    const v = (p.subcategory ?? "").trim();
    if (v && !seen.has(v.toLowerCase())) { seen.add(v.toLowerCase()); out.push(v); }
  }
  return out;
}
