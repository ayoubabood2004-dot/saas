import type { Product } from "@/types";
import { daysToExpiry } from "./expiry";
import { countable } from "./countPick";

/* ============================================================================
 * مراقبةُ المخزون — «شكد بعد لكل منتج؟» بصفحةٍ واحدة. نقيٌّ ومفحوصٌ بـ`scripts/watch-test.mjs`.
 *
 * لكلّ مادةٍ جوابان بالأيام، وتختار العيادةُ المدى (شهر، شهرين، ثلاثة، أربعة، ستة، أو يوماً
 * بعينه) فيُقال ما يقع داخله:
 *   • **الانتهاء**: أيّامٌ حتى `expiry_date` (آخرُ يومٍ صالح — قاعدةُ 0210 نفسها).
 *   • **النفاد**: الرصيد ÷ معدّل البيع اليوميّ (صافي آخر ٣٠ يوماً من `product_sales_rate`).
 *     مادةٌ لا تُباع لا تاريخَ نفادٍ لها — لا يُخترع.
 *   • **يبقى وينتهي بالرف**: ما لن يُباع قبل انتهائه بالمعدّل الحاليّ — هذا الذي يُرجَع
 *     للشركة الآن أو يُخفَّض سعرُه، لا بعد أن يفوت.
 * المجمَّعةُ ومخزنُ الحقل خارجان (رصيدُهما ليس بصفّهما) — كالجرد.
 * ========================================================================= */

export type Horizon = { kind: "months"; n: number } | { kind: "date"; date: string };
export type WatchFilter = "all" | "expires" | "runsOut" | "expired" | "waste" | "noDate";

export interface WatchRow {
  product: Product;
  stock: number;
  perDay: number;
  /** أيامٌ حتى الانتهاء (سالبٌ = فات)، أو null بلا تاريخ. */
  expiryDays: number | null;
  /** أيامٌ حتى النفاد بالمعدّل الحاليّ، أو null إن كانت لا تُباع. صفرٌ = نافدة. */
  runoutDays: number | null;
  /** ما يبقى على الرف يوم انتهائه (≥ ١ فقط، وإلا صفر). */
  leftAtExpiry: number;
  expired: boolean;
  expiresIn: boolean;
  runsOutIn: boolean;
  /** أقربُ حدث (انتهاء أو نفاد) بالأيام — للترتيب. */
  soonest: number | null;
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** أيامُ المدى من اليوم: الأشهرُ تقويميّة (٣١/١ + شهر = ٢٨ أو ٢٩/٢)، واليومُ المحدَّد بعينه. */
export function horizonDays(h: Horizon, todayISO: string): number {
  if (h.kind === "date") return Math.max(0, daysToExpiry(h.date, todayISO) ?? 0);
  const m = YMD.exec(todayISO);
  if (!m) return 30 * h.n;
  const y = +m[1], mo = +m[2] - 1, d = +m[3];
  const lastOfTarget = new Date(Date.UTC(y, mo + h.n + 1, 0)).getUTCDate();
  const end = Date.UTC(y, mo + h.n, Math.min(d, lastOfTarget));
  return Math.round((end - Date.UTC(y, mo, d)) / 86_400_000);
}

export function watchRows(
  products: readonly Product[], sold: ReadonlyMap<string, number>, days: number, todayISO: string, h: Horizon,
): WatchRow[] {
  const H = horizonDays(h, todayISO);
  const rows: WatchRow[] = [];
  for (const p of products) {
    if (!countable(p)) continue;
    const stock = Math.max(0, Number(p.stock) || 0);
    const perDay = Math.max(0, Number(sold.get(p.id)) || 0) / Math.max(1, days);
    const expiryDays = daysToExpiry(p.expiry_date, todayISO);
    const runoutDays = perDay > 0 ? stock / perDay : null;
    // يومُ الانتهاء نفسُه يومُ بيعٍ صالح: ما يُباع حتى نهايته = المعدّل × (الأيام + ١).
    const sellable = expiryDays !== null && expiryDays >= 0 ? perDay * (expiryDays + 1) : 0;
    const leftAtExpiry = expiryDays !== null && stock > 0 ? Math.max(0, Math.ceil(stock - sellable - 1e-9)) : 0;
    const expired = expiryDays !== null && expiryDays < 0 && stock > 0;
    const expiresIn = expiryDays !== null && expiryDays >= 0 && expiryDays <= H && stock > 0;
    const runsOutIn = runoutDays !== null && runoutDays <= H;
    const events = [expiryDays !== null && stock > 0 ? expiryDays : null, runoutDays].filter((x): x is number => x !== null);
    rows.push({
      product: p, stock, perDay, expiryDays, runoutDays, leftAtExpiry: expired ? stock : leftAtExpiry,
      expired, expiresIn, runsOutIn, soonest: events.length ? Math.min(...events) : null,
    });
  }
  return rows.sort((a, b) =>
    (a.soonest ?? Infinity) - (b.soonest ?? Infinity) || a.product.name.localeCompare(b.product.name));
}

export function matchesFilter(r: WatchRow, f: WatchFilter): boolean {
  switch (f) {
    case "expires": return r.expiresIn;
    case "runsOut": return r.runsOutIn;
    case "expired": return r.expired;
    case "waste": return !r.expired && r.leftAtExpiry > 0 && r.expiresIn;
    case "noDate": return r.expiryDays === null && r.stock > 0;
    default: return true;
  }
}

export interface WatchSummary {
  expires: { n: number; value: number };
  expired: { n: number; value: number };
  runsOut: number;
  waste: { units: number; value: number };
  noDate: number;
}

export function watchSummary(rows: readonly WatchRow[]): WatchSummary {
  const cost = (r: WatchRow, q: number) => q * Math.max(0, Number(r.product.purchase_price) || 0);
  const s: WatchSummary = { expires: { n: 0, value: 0 }, expired: { n: 0, value: 0 }, runsOut: 0, waste: { units: 0, value: 0 }, noDate: 0 };
  for (const r of rows) {
    if (r.expiresIn) { s.expires.n++; s.expires.value += cost(r, r.stock); }
    if (r.expired) { s.expired.n++; s.expired.value += cost(r, r.stock); }
    if (r.runsOutIn) s.runsOut++;
    if (matchesFilter(r, "waste")) { s.waste.units += r.leftAtExpiry; s.waste.value += cost(r, r.leftAtExpiry); }
    if (matchesFilter(r, "noDate")) s.noDate++;
  }
  return s;
}

/** تاريخٌ بعد `n` يوماً من اليوم (ISO) — لعرض «يخلص تقريباً بـ…». */
export function addDaysISO(todayISO: string, n: number): string {
  const m = YMD.exec(todayISO);
  if (!m) return todayISO;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3] + Math.floor(n)));
  return d.toISOString().slice(0, 10);
}
