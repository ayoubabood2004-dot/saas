import type { DemoDB, Product, ProductLot } from "@/types";
import { loadDB, saveDB } from "./demoStore";
import { localISO, uid } from "./utils";
import { demoBaseRole, demoPinLive } from "./demoRole";
import { fromScaled, roundScaled } from "./consumption";

/** كميةُ دفعةٍ كما يحفظها عمودُها (product_lots.qty numeric) بالضبط — بعشرين منزلة لا بالعائم: ٠٫٠٥ + ٠٫٠٧ عائماً
 *  ٠٫١٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠١، فكان الحارسُ «يصحّح» فرقاً بـ١٠⁻¹⁷ ويكتب دفعةً ٠٫٠٤٩٩٩٩٩٩٩٩٩٩٩٩٩٩ — والجردُ بالدفعات بعده «زايدة»
 *  عمّا يقول عنه الخادمُ «مطابقة» (قيسَ بالمراجعة العدائية، 2أ). وسندُ التلف وفاتورةُ الشراء يمرّان من هنا بعد كلّ ترحيل. */
const lotQ = (x: number | string | null | undefined): bigint => roundScaled(Number(x) || 0, 20);
const lotN = (v: bigint): number => fromScaled(v > 0n ? v : 0n, 20);

/* ============================================================================
 * مرآةُ الدفعات (0217) للوضع التجريبي — تُحمَّل عند النداء لا مع الإقلاع.
 *
 * نفسُ حارس الخادم (`lots_reconcile`): مجموعُ الدفعات = الرصيد. الخادمُ يجريه آخرَ
 * كلّ معاملة؛ والمرآةُ تجريه قبل كلّ قراءةٍ للدفعات وبعد كلّ شراء — والنتيجةُ واحدة
 * لأنّ الحكمَ على الفرق لا على الخطوات: نقصٌ ⇐ من الأقرب انتهاءً غيرِ المنتهي أوّلاً
 * (والمنتهي أوّلاً لجردٍ بسبب «منتهي»)، وزيادةٌ ⇐ لأقرب دفعةٍ صالحةٍ فيها رصيد، وإلا
 * افتتاحيةٌ (أوّلُ رصيد) أو «تعديل» (بعد النفاد). وتاريخُ المادة = أقربُ دفعةٍ فيها رصيد.
 * ========================================================================= */

const KEY = "vp_demo_lots";

export function loadLots(): ProductLot[] {
  try { const r = localStorage.getItem(KEY); if (r) return JSON.parse(r) as ProductLot[]; } catch { /* swallow-ok: جهازٌ بلا تخزين = لا دفعات بعد */ }
  return [];
}
function saveLots(list: ProductLot[]) {
  // يرمي: دفعةٌ لم تُحفظ ويُقال «انحفظت» كذبٌ يُصدَّق.
  localStorage.setItem(KEY, JSON.stringify(list));
}

const isExpired = (d: string | null, today: string) => !!d && d.slice(0, 10) < today;
const byExpiry = (a: ProductLot, b: ProductLot) =>
  (a.expiry_date ?? "9999").localeCompare(b.expiry_date ?? "9999") || a.received_at.localeCompare(b.received_at) || a.id.localeCompare(b.id);

/** الأقربُ **الصالح** أوّلاً (مرآةُ lots_refresh_expiry): المنتهيةُ الباقية لا تُلبس الجديدةَ ثوبَها. */
function earliest(live: ProductLot[], today: string): string | null {
  const dated = live.map((l) => (l.expiry_date ? l.expiry_date.slice(0, 10) : null)).filter((d): d is string => !!d).sort();
  return dated.find((d) => d >= today) ?? dated[0] ?? null;
}
function refreshExpiry(p: Product, lots: ProductLot[]) {
  const live = lots.filter((l) => l.product_id === p.id && l.qty > 0);
  if (!live.length) return;
  p.expiry_date = earliest(live, localISO());
}

function reconcile(db: DemoDB, lots: ProductLot[], p: Product, today: string, expiredFirst = false): ProductLot[] {
  if (p.farm_id) return lots;
  // صارت مجمَّعة: رصيدُها بحوض القسم، ودفعاتُها رصيدٌ وهميّ.
  if (p.pooled) return lots.filter((l) => l.product_id !== p.id);
  const items = db.purchaseItems ?? [];
  lots = lots.filter((l) => !(l.product_id === p.id && l.source === "purchase"
    && !items.some((it) => it.purchase_id === l.purchase_id && it.product_id === p.id)));
  const mine = lots.filter((l) => l.product_id === p.id);
  // greatest(stock, 0) بمنازل عموده الثلاث ناقصَ Σ الدفعات — بالضبط (lotQ).
  const diff = roundScaled(Math.max(0, Number(p.stock) || 0), 3) * 10n ** 17n - mine.reduce((s, l) => s + lotQ(l.qty), 0n);
  if (diff < 0n) {
    let need = -diff;
    const order = mine.filter((l) => l.qty > 0).sort((a, b) => {
      const ea = isExpired(a.expiry_date, today) ? 1 : 0, eb = isExpired(b.expiry_date, today) ? 1 : 0;
      return (expiredFirst ? eb - ea : ea - eb) || byExpiry(a, b);
    });
    for (const l of order) {
      const have = lotQ(l.qty);
      const take = have < need ? have : need;
      l.qty = lotN(have - take); need -= take;
      if (need <= 0n) break;
    }
  } else if (diff > 0n) {
    const head = mine.filter((l) => l.qty > 0 && !isExpired(l.expiry_date, today)).sort(byExpiry)[0];
    if (head) head.qty = lotN(lotQ(head.qty) + diff);
    else {
      const first = mine.length === 0;
      const exp = p.expiry_date ? String(p.expiry_date).slice(0, 10) : null;
      lots.push({
        id: uid("lot"), product_id: p.id, qty: lotN(diff), received_qty: lotN(diff),
        expiry_date: first ? exp : (exp && exp >= today ? exp : null),
        received_at: first ? (p.created_at ?? new Date().toISOString()) : new Date().toISOString(),
        source: first ? "opening" : "adjust", purchase_id: null, company_name: null, note: null,
      });
    }
  }
  refreshExpiry(p, lots);
  return lots;
}

/** الحارسُ على المخزن كلّه — قبل كلّ قراءة. `only` يحصره بمادةٍ ويختار ترتيبَ السحب. */
export function reconcileAll(only?: { productId: string; expiredFirst: boolean }): ProductLot[] {
  const db = loadDB();
  let lots = loadLots();
  const today = localISO();
  const before = JSON.stringify(lots) + JSON.stringify((db.products ?? []).map((p) => p.expiry_date));
  for (const p of db.products ?? []) {
    if (only && p.id !== only.productId) continue;
    lots = reconcile(db, lots, p, today, only?.expiredFirst ?? false);
  }
  if (JSON.stringify(lots) + JSON.stringify((db.products ?? []).map((p) => p.expiry_date)) !== before) {
    saveLots(lots);
    saveDB(db);
  }
  return lots;
}

/** مرآةُ `lots_from_purchase`: دفعةٌ لكلّ مادةٍ بالفاتورة (السطران للمادة نفسها دفعةٌ واحدة). */
export function syncPurchase(purchaseId: string): void {
  const db = loadDB();
  const lots = loadLots();
  const pur = (db.purchases ?? []).find((x) => x.id === purchaseId);
  if (!pur) return;
  const byProduct = new Map<string, { qty: bigint; exp: string | null }>();
  for (const it of db.purchaseItems ?? []) {
    if (it.purchase_id !== purchaseId || !it.product_id) continue;
    const cur = byProduct.get(it.product_id) ?? { qty: 0n, exp: null };
    cur.qty += lotQ(it.qty);
    const e = it.expiry_date ? String(it.expiry_date).slice(0, 10) : null;
    if (e && (!cur.exp || e > cur.exp)) cur.exp = e;
    byProduct.set(it.product_id, cur);
  }
  for (const [productId, v] of byProduct) {
    const p = (db.products ?? []).find((x) => x.id === productId);
    if (!p || p.pooled || p.farm_id) continue;
    // لا يرث تاريخاً فات: الأحدثُ من دفعاتها الصالحة، ثمّ تاريخُ المادة إن لم يفُت.
    const today = localISO();
    const ownDate = p.expiry_date ? String(p.expiry_date).slice(0, 10) : null;
    const liveDates = lots.filter((l) => l.product_id === productId && l.qty > 0 && l.expiry_date && l.expiry_date.slice(0, 10) >= today)
      .map((l) => l.expiry_date!.slice(0, 10)).sort();
    const exp = v.exp ?? liveDates[liveDates.length - 1] ?? (ownDate && ownDate >= today ? ownDate : null);
    const lot = lots.find((l) => l.purchase_id === purchaseId && l.product_id === productId);
    if (lot) {
      lot.qty = lotN(lotQ(lot.qty) + v.qty - lotQ(lot.received_qty));
      lot.received_qty = lotN(v.qty);
      if (!lot.expiry_fixed) lot.expiry_date = exp ?? lot.expiry_date;
      lot.company_name = pur.company_name ?? null;
    } else if (v.qty > 0n) {
      lots.push({
        id: uid("lot"), product_id: productId, qty: lotN(v.qty), received_qty: lotN(v.qty), expiry_date: exp,
        received_at: pur.purchased_at ?? pur.created_at ?? new Date().toISOString(), source: "purchase",
        purchase_id: purchaseId, company_name: pur.company_name ?? null, note: null,
      });
    }
  }
  saveLots(lots);
  reconcileAll();
}

/** مرآةُ `lots_user_expiry`: تعديلُ تاريخ المادة باليد = تعديلُ الدفعة التي يمثّلها. */
export function userExpiry(productId: string, oldD: string | null, newD: string | null): string | null {
  const lots = loadLots();
  const live = lots.filter((l) => l.product_id === productId && l.qty > 0);
  const old = oldD ? oldD.slice(0, 10) : null;
  let hit = live.filter((l) => (l.expiry_date ?? null) === old);
  if (!hit.length && live.length === 1) hit = live;
  for (const l of hit) { l.expiry_date = newD; l.expiry_fixed = true; }
  saveLots(lots);
  if (!live.length) return newD;
  return earliest(live, localISO());
}

function refuse(code: string): never {
  const e = new Error(code) as Error & { code: string };
  e.code = "P0001";
  throw e;
}
/** مرآةُ حارس lot_add/lot_edit: `auth_role()` مديرٌ أو طبيب — ومفتاحُ وضع المدير الحيّ يجعله مديراً كما
 *  بالخادم. والاستقبالُ ودورٌ لا يُعرف: لا. (كان يقرأ `raw.role` الذي لا يُكتب، فما رُفض أحد.) */
function canEditLots(): boolean {
  const base = demoBaseRole();
  return base === "manager" || base === "veterinarian" || demoPinLive();
}

export function addLot(productId: string, qty: number, expiry: string | null, note?: string | null): string {
  if (!canEditLots()) refuse("lot_forbidden");
  if (!(qty > 0 && qty <= 1e9)) refuse("lot_bad_qty");
  reconcileAll();
  const db = loadDB();
  const p = (db.products ?? []).find((x) => x.id === productId);
  if (!p || p.pooled || p.farm_id) refuse("lot_product_missing");
  const lots = loadLots();
  const id = uid("lot");
  lots.push({ id, product_id: productId, qty, received_qty: qty, expiry_date: expiry, received_at: new Date().toISOString(),
    source: "added", purchase_id: null, company_name: null, note: (note ?? "").trim().slice(0, 200) || null });
  p.stock = (Number(p.stock) || 0) + qty;
  refreshExpiry(p, lots);
  saveLots(lots);
  saveDB(db);
  return id;
}

export function editLot(lotId: string, expiry: string | null, splitQty?: number | null): string {
  if (!canEditLots()) refuse("lot_forbidden");
  const lots = reconcileAll();
  const l = lots.find((x) => x.id === lotId);
  if (!l) refuse("lot_missing");
  let id = l.id;
  if (splitQty == null || splitQty >= l.qty) { l.expiry_date = expiry; l.expiry_fixed = true; }
  else {
    if (!(splitQty > 0)) refuse("lot_bad_qty");
    l.qty -= splitQty;
    id = uid("lot");
    lots.push({ ...l, id, qty: splitQty, received_qty: splitQty, expiry_date: expiry, expiry_fixed: true,
      source: l.source === "purchase" ? "adjust" : l.source, purchase_id: null });
  }
  const db = loadDB();
  const p = (db.products ?? []).find((x) => x.id === l.product_id);
  if (p) refreshExpiry(p, lots);
  saveLots(lots);
  saveDB(db);
  return id;
}

/** مرآةُ الموافقة على جردٍ بالدفعة: كلُّ دفعةٍ بفرقها قبل الرصيد. */
export function applyLotCounts(productId: string, counts: { lot_id: string; system: number; counted: number }[]): void {
  const lots = loadLots();
  for (const c of counts) {
    const l = lots.find((x) => x.id === c.lot_id && x.product_id === productId);
    if (l) l.qty = lotN(lotQ(l.qty) + lotQ(c.counted) - lotQ(c.system));   // greatest(qty + (counted − system), 0) بالضبط
  }
  saveLots(lots);
}
