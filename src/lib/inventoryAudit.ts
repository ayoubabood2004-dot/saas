import type { AuditKind, InventoryAuditRow } from "@/types";
import { matchCode, searchable } from "./utils";

/* ============================================================================
 * فحصُ المخزن — مرآةُ `report_inventory_audit()` (0245) حرفاً بحرف.
 *
 * الخادمُ يحسب للعيادة الحقيقية؛ وهذه النسخةُ للوضع التجريبيّ ولفحص التطابق
 * (`scripts/audit-fixture.mjs` + `audit-parity.mjs` داخل الحزمة): نفسُ القالب
 * يمرّ على الدالّة وعلى هذه، والصفوفُ تُقارن نوعاً بنوع ومادةً بمادة. منطقٌ لا
 * وجودَ له هنا منطقٌ لم يُفحص (CLAUDE.md §٤) — وأيُّ تعديلٍ بأحد الطرفين بلا
 * الآخر يفشّل الحزمة.
 *
 * نقيّةٌ بلا شبكة ولا تخزين: تأخذ الصفوفَ وتُرجع الملاحظات. والطيُّ من نفس
 * الدالّتين اللتين تمرّ منهما الشاشات: `searchable` (مرآةُ search_norm) للاسم،
 * و`matchCode` (مرآةُ inv_norm_code) للرمز — الطرفان من دالّةٍ واحدة.
 * ========================================================================== */

export type CodeKind =
  | "none" | "skip" | "short" | "alnum" | "length" | "check" | "internal" | "pattern" | "ean8" | "gtin";

/** رقمُ تحقق GTIN-8/12/13/14 — مرآةُ `inv_gtin_ok`. */
export function gtinOk(v: string): boolean {
  if (!/^[0-9]+$/.test(v) || ![8, 12, 13, 14].includes(v.length)) return false;
  let sum = 0;
  for (let i = 1; i <= v.length - 1; i++) sum += Number(v[v.length - 1 - i]) * (i % 2 === 1 ? 3 : 1);
  return (10 - (sum % 10)) % 10 === Number(v[v.length - 1]);
}

/** رمزٌ يُمسح فعلاً: لا فارغٌ بالتطبيع ولا مشوَّهٌ (عربيّ/إكسل). */
const scannable = (c: string | null | undefined): boolean => !["none", "skip"].includes(codeKind(c));

const SEQ = /(0123456|1234567|2345678|3456789|6543210|7654321|8765432|9876543)/;

/** شكلُ الرمز — مرآةُ `inv_code_kind`، بنفس الترتيب («internal» قبل «pattern»). */
export function codeKind(raw: string | null | undefined): CodeKind {
  const r = String(raw ?? "");
  const n = matchCode(r);
  if (n === "") return "none";
  if (/[ء-ي]/.test(n) || /^[0-9]+(\.[0-9]+)?[Ee][+-]?[0-9]+$/.test(r) || /^[0-9]{6,}\.0+$/.test(r)) return "skip";
  // length() بالقاعدة يعدّ المحارف لا وحداتِ UTF-16.
  if (Array.from(n).length < 8) return "short";
  if (!/^[0-9]+$/.test(n)) return "alnum";
  if (![8, 12, 13, 14].includes(n.length)) return "length";
  if (!gtinOk(n)) return "check";
  if (n.length === 13 && n[0] === "2") return "internal";
  // ستّةٌ من رقمٍ غير الصفر، أو ستّةُ أصفارٍ بأوّله، أو عشرةٌ بأيّ موضع. أصفارُ الوسط دون العشرة
  // حقيقيّة: بادئةٌ تنتهي بأصفار + مادةٌ 00000 (UPC كوكاكولا 049000000443 بستّة).
  if (/([1-9])\1{5}/.test(n) || /^0{6}/.test(n) || /0{10}/.test(n) || SEQ.test(n)) return "pattern";
  if (n.length === 8) return "ean8";
  return "gtin";
}

export interface AuditProduct {
  id: string; name: string; barcode?: string | null; alt_codes?: string[] | null;
  company_id?: string | null; section_id?: string | null; farm_id?: string | null;
  stock: number | string; purchase_price?: number | string | null; created_at: string;
  has_sub_unit?: boolean | null; units_per_box?: number | string | null;
}
export interface AuditInput {
  products: readonly AuditProduct[];
  sections: readonly { id: string; pooled_stock?: number | string | null }[];
  invoices: readonly { id: string; created_at: string; status?: string | null }[];
  items: readonly { invoice_id: string; product_id?: string | null; qty: number | string; stock_qty?: number | string | null }[];
  /** باركوداتُ مولّد العيادة (generated_barcodes). */
  generated: readonly (string | null | undefined)[];
  companies: readonly { id: string; name: string }[];
  from: string;
  to: string;
}

const DAY = 86400000;
/** سقفُ الكفاية بالأيام (مئةُ سنة) — `least(…, 36500)` بالقاعدة. */
export const COVER_MAX = 36500;
const num = (v: unknown): number => Number(v ?? 0) || 0;
/** ثلاثةُ أرقامٍ عشرية بالضبط — كـround(x, 3) بالقاعدة، بعددٍ صحيح يُقارن بلا كسرٍ عائم. */
const milli = (v: number): number => Math.round(v * 1000);
/** floor بعد تسامحٍ ضئيل: القاعدةُ تقسم بعشريٍّ دقيق، والمرآةُ بكسرٍ عائم قد ينقص جزءاً من مليار. */
const floorDays = (v: number): number => Math.floor(v + 1e-9);

/** فحصُ المخزن — نفسُ ما تُرجعه `report_inventory_audit(from, to)` للعيادة. */
export function inventoryAudit(input: AuditInput): InventoryAuditRow[] {
  const from = Date.parse(input.from);
  const to = Date.parse(input.to);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from || to - from < 7 * DAY || to - from > 400 * DAY) {
    throw new Error("bad range: 7..400 days");
  }
  const D = (to - from) / DAY;
  const t30 = to - 30 * DAY;

  const pools = new Map(input.sections.map((s) => [s.id, num(s.pooled_stock)]));
  const companyName = new Map(input.companies.map((c) => [c.id, c.name]));
  const gen = new Set(input.generated.filter((g) => (g ?? "") !== "").map((g) => matchCode(g)));

  // المبيع: فواتيرُ غيرُ مردودة حتى p_to، بمكافئ العلبة، والصافي بسطور الإرجاع.
  const invAt = new Map<string, number>();
  for (const i of input.invoices) {
    if ((i.status ?? "paid") === "refunded") continue;
    const at = Date.parse(i.created_at);
    if (at <= to) invAt.set(i.id, at);
  }
  const sales = new Map<string, { w: number; q30: number; total: number; first: number | null; last: number | null }>();
  for (const it of input.items) {
    if (!it.product_id) continue;
    const at = invAt.get(it.invoice_id);
    if (at === undefined) continue;
    const sq = it.stock_qty == null ? num(it.qty) : num(it.stock_qty);
    const s = sales.get(it.product_id) ?? { w: 0, q30: 0, total: 0, first: null, last: null };
    s.total += sq;
    if (at >= from) s.w += sq;
    if (at >= t30) s.q30 += sq;
    if (sq > 0 && (s.first === null || at < s.first)) s.first = at;
    if (sq > 0 && (s.last === null || at > s.last)) s.last = at;
    sales.set(it.product_id, s);
  }

  const base = input.products.filter((p) => p.farm_id == null).map((p) => {
    const stock = num(p.stock);
    // الرمزُ المحكوم (`ec` بالقاعدة): الأساسيّ، أو أوّلُ إضافيٍّ يُمسح إن فرغ الأساسيُّ بالتطبيع —
    // مسحُ رقم الرفّ من النموذج ينقله للإضافيّات (keepOldCode) فكانت المادةُ تختفي من الفحص. والمشوَّه
    // (skip) لا يُحكم: 0168 لا تقرأ الإضافيّات، فاختيارُه كان يُخفيها عن الاثنين.
    const ec = matchCode(p.barcode) !== "" ? p.barcode ?? null
      : (p.alt_codes ?? []).find(scannable) ?? p.barcode ?? null;
    const n = matchCode(ec);
    const ck = codeKind(ec);
    const s = sales.get(p.id);
    const pool = p.section_id ? pools.get(p.section_id) ?? 0 : 0;
    // العمرُ من أقدمِ الإنشاء وأوّلِ بيع (least بالقاعدة يتجاهل الغائب)، ونافذةُ المعدّل `ve` أقلُّ المدّة
    // وعمرِها، يومٌ أقلُّها — مادةُ ١٥ يوماً كانت تُقسَّم على ٩٠ فتُقال «بطيئة» (الترويسة بـ0245).
    const created = Date.parse(p.created_at);
    const start = s?.first != null && s.first < created ? s.first : created;
    const age = Math.floor((to - start) / DAY);
    return {
      p, stock, ec, n, ck,
      value: Math.max(stock, 0) * Math.max(num(p.purchase_price), 0),
      nn: searchable(p.name),
      altFactory: (p.alt_codes ?? []).some((a) => ["gtin", "ean8"].includes(codeKind(a))),
      pool: pool > 0 ? pool : 0,
      w: s?.w ?? 0, q30: s?.q30 ?? 0, total: s?.total ?? 0, last: s?.last ?? null,
      age, ve: Math.min(D, Math.max(age, 1)),
      upb: num(p.units_per_box),
      sub: !!p.has_sub_unit,
    };
  });
  const thirteen = base.filter((b) => b.n.length === 13 && /^[0-9]+$/.test(b.n));

  const rows = base.map((b) => {
    let hand: string | null = null;
    if (!b.altFactory) {
      if (["short", "length", "check", "pattern"].includes(b.ck)) hand = b.ck;
      else if (b.ck === "internal" && !gen.has(b.n)) hand = "internal";
      else if (b.ck === "ean8" && thirteen.some((o) => o.p.id !== b.p.id && o.n.slice(0, 8) === b.n)) hand = "ean8_prefix";
    }
    const noCode = (b.p.barcode ?? "") === "" && !(b.p.alt_codes ?? []).some(scannable);
    const factory = (b.ck === "gtin" || b.ck === "ean8") && hand === null;
    return { ...b, hand, noCode, factory, shelf: noCode || hand !== null };
  });
  type R = (typeof rows)[number];

  // المجموعات بالاسم المطويّ (حرفان فأكثر).
  const names = new Map<string, R[]>();
  for (const r of rows) {
    if (Array.from(r.nn).length < 2) continue;
    const a = names.get(r.nn);
    if (a) a.push(r); else names.set(r.nn, [r]);
  }

  // المستحيل: ١٠٠ × وسيط القيم الموجبة (percentile_cont)، والكفايةُ بنافذة المادة > سنة — أو لا بيعَ
  // بالمدّة وعمرُها ≥ ٧ أيام (أقصرُ مدّة؛ والثلاثون كانت تُخفي حقيبةَ ابن الهيثم — الترويسة بـ0245).
  const vals = rows.map((r) => r.value).filter((v) => v > 0).sort((a, b) => a - b);
  const med = vals.length === 0 ? null
    : vals.length % 2 ? vals[(vals.length - 1) / 2] : (vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2;
  const unitsShape = (r: R): boolean => r.sub && r.upb > 1
    && milli(r.stock + r.total) >= 10 * milli(r.upb) && milli(r.stock + r.total) % milli(r.upb) === 0;
  const imp = new Map<string, "units" | "value">();
  for (const r of rows) {
    if (!(r.stock > 0)) continue;
    if (!((r.w <= 0 && r.age >= 7) || (r.w > 0 && r.stock * r.ve > 365 * r.w))) continue;
    if ((med !== null && r.value >= 100 * med) || unitsShape(r)) imp.set(r.p.id, unitsShape(r) ? "units" : "value");
  }

  // بادئةُ المصنع: أوّلُ ٧ أرقام من EAN-13 مصنعٍ سليم.
  const pre = rows.filter((r) => r.factory && r.n.length === 13);
  const pfx = new Map<string, Set<string>>();
  for (const r of pre) {
    const k = r.n.slice(0, 7);
    const s = pfx.get(k) ?? new Set<string>();
    if (r.p.company_id) s.add(r.p.company_id);
    pfx.set(k, s);
  }

  const out: InventoryAuditRow[] = [];
  const push = (kind: AuditKind, r: R, o: { why?: string | null; grp?: string | null; qty?: number | null; days?: number | null; co?: string | null } = {}): void => {
    const co = o.co !== undefined ? o.co : kind === "no_company" ? null : r.p.company_id ?? null;
    out.push({
      kind, why: o.why ?? null, product_id: r.p.id, product_name: r.p.name, code: r.ec, grp: o.grp ?? null,
      stock: r.stock, value: r.value, qty: o.qty ?? null, days: o.days ?? null,
      company_id: co, company_name: co ? companyName.get(co) ?? null : null,
    });
  };
  const sinceLast = (r: R): number | null => (r.last === null ? null : Math.floor((to - r.last) / DAY));
  /** الكفايةُ بالأيام، وسقفُها مئةُ سنة كالقاعدة: رصيدٌ خياليّ بمبيعٍ ضئيل كان يتجاوز int هناك. */
  const cover = (r: R): number | null => (r.w > 0 ? Math.min(floorDays((r.stock * r.ve) / r.w), COVER_MAX) : null);

  for (const r of rows) {
    if (r.noCode) push("no_code", r);
    if (r.hand !== null) push("hand_code", r, { why: r.hand });

    const g = Array.from(r.nn).length >= 2 ? names.get(r.nn) : undefined;
    if (g && g.length > 1) {
      const twin = g.some((x) => x.shelf) && g.some((x) => x.factory);
      push(twin ? "dup_twin" : "dup_name", r, {
        grp: r.nn, why: twin ? (r.shelf ? "shelf" : r.factory ? "factory" : "other") : null,
      });
    }

    const im = imp.get(r.p.id);
    if (im) push("impossible", r, { why: im, qty: im === "units" ? milli(r.stock + r.total) / 1000 : null, days: cover(r) });
    if (!im && r.stock > 0) {
      if (r.last === null && r.age >= 30) push("never_sold", r, { days: r.age });
      else if (r.last !== null && r.last < t30) push("stopped", r, { days: sinceLast(r) });
      else if (r.last !== null && r.last >= t30 && r.age >= 30 && (r.w <= 0 || r.stock * r.ve > 180 * r.w)) push("slow", r, { qty: r.w, days: cover(r) });
    }
    if (r.stock + r.pool <= 0 && r.q30 > 0) push("zero_sold", r, { qty: r.q30, days: sinceLast(r) });

    if (!r.p.company_id) {
      const k = r.factory && r.n.length === 13 ? r.n.slice(0, 7) : null;
      const cos = k ? pfx.get(k) : undefined;
      const only = cos && cos.size === 1 ? [...cos][0] : null;
      push("no_company", r, { why: only ? "hint" : null, grp: only ? k : null, co: only });
    }
    if (r.factory && r.n.length === 13 && r.p.company_id && (pfx.get(r.n.slice(0, 7))?.size ?? 0) >= 2) {
      push("prefix_split", r, { grp: r.n.slice(0, 7) });
    }
  }

  return out.sort((a, b) => cmp(a.kind, b.kind) || cmp(a.grp ?? "", b.grp ?? "") || cmp(a.product_name, b.product_name) || cmp(a.product_id, b.product_id));
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
