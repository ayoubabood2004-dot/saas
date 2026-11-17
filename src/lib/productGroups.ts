/* ============================================================================
 * المنتجاتُ المربوطة (0277) — حسابٌ صِرفٌ بلا نصوص ولا شبكة: يستورده تبويبُ «المربوطة» ونموذجُ المادّة وفاتورةُ الشراء والمرآةُ التجريبية.
 *
 *  • المفتاحُ مفتاحُ القاعدة حرفاً (`groupKeyOf` من رفع الأسعار: `nullif(btrim(bulk_group), '')`)، والمجموعةُ عضوان فأكثر —
 *    مفتاحٌ على مادّةٍ وحدها (بقيّةُ مجموعةٍ حُذف أعضاؤها) ليس ربطاً، ولا شارةَ له.
 *  • السعرُ بعملة المادّة: الدولارُ بأعمدته (`sell_price_usd`/`purchase_price_usd`)، والدينارُ بـsell_price/purchase_price.
 *  • `seenOf` ما رآه الجهاز لكلّ عضو — شرطُ الكتابة بالخادم (group_changed / price_moved)؛ والقيمةُ كما بالقائمة بلا تقريب.
 * ========================================================================= */
import type { Product } from "@/types";
import { groupKeyOf } from "./priceRaise";
import { searchable } from "./utils";

export { groupKeyOf };

export type GroupCurrency = "IQD" | "USD";
type Priced = Pick<Product, "id" | "sell_price" | "purchase_price" | "price_currency" | "sell_price_usd" | "purchase_price_usd">;

export const currencyOf = (p: Pick<Product, "price_currency">): GroupCurrency => (p.price_currency === "USD" ? "USD" : "IQD");

/** سعرا المادّة بعملتها: البيعُ والشراء (الغائبُ null — الدولارُ قد يكون بلا سعر شراء). */
export function pricesOf(p: Priced): { sell: number | null; buy: number | null } {
  const n = (v: unknown): number | null => (v == null || v === "" ? null : Number.isFinite(Number(v)) ? Number(v) : null);
  return currencyOf(p) === "USD" ? { sell: n(p.sell_price_usd), buy: n(p.purchase_price_usd) } : { sell: n(p.sell_price), buy: n(p.purchase_price) };
}

export interface ProductGroup {
  key: string;
  members: Product[];
  currency: GroupCurrency | "mixed";
  /** سعرٌ واحدٌ للكلّ، أو null حين يختلف (مجموعةٌ قديمة انشقّت، أو عضوٌ تعدّل وحده قبل 0277). */
  sell: number | null;
  buy: number | null;
  sellSplit: boolean;
  buySplit: boolean;
  /** الشركةُ والصنفُ إن اشترك فيهما الكلّ، وإلا null. */
  companyId: string | null;
  sectionId: string | null;
  title: string;
}

/** حجمُ كلّ مجموعة بالقائمة (لشارة «مجموعة» ونموذج المادّة): المفتاحُ ← عددُ أعضائه. */
export function groupSizes(products: readonly Pick<Product, "bulk_group">[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const p of products) {
    const k = groupKeyOf(p.bulk_group);
    if (k) m.set(k, (m.get(k) ?? 0) + 1);
  }
  return m;
}

/** أعضاءُ مجموعة مادّةٍ (هي معهم)، أو [] إن لم تكن بمجموعةٍ حقيقية (عضوان فأكثر). */
export function groupMembersOf(products: readonly Product[], p: Pick<Product, "bulk_group"> | null | undefined): Product[] {
  const k = groupKeyOf(p?.bulk_group);
  if (!k) return [];
  const ms = products.filter((x) => groupKeyOf(x.bulk_group) === k);
  return ms.length >= 2 ? ms : [];
}

/** عنوانُ المجموعة: الكلماتُ المشتركة أوّلَ أسماء أعضائها («أموكسي 250» و«أموكسي 500» ⇒ «أموكسي»)، وإلا أوّلُ اسمٍ بالترتيب. */
export function groupTitle(names: readonly string[]): string {
  const list = names.map((n) => n.trim()).filter(Boolean);
  if (!list.length) return "";
  const words = list.map((n) => n.split(/\s+/));
  const normWords = words.map((ws) => ws.map((w) => searchable(w)));   // الطرفان بالتطبيع نفسِه
  const out: string[] = [];
  for (let i = 0; i < words[0].length; i++) {
    if (normWords.every((ws) => ws[i] !== undefined && ws[i] === normWords[0][i])) out.push(words[0][i]);
    else break;
  }
  const common = out.join(" ").replace(/[\s\-\u2013\u2014_/.,\u060C:]+$/u, "");
  return common.length >= 3 ? common : [...list].sort((a, b) => a.localeCompare(b, "ar"))[0];
}

/** المجموعاتُ (عضوان فأكثر) من قائمة المخزن، مرتّبةً بعنوانها؛ والأعضاءُ بأسمائهم. */
export function buildGroups(products: readonly Product[]): ProductGroup[] {
  const by = new Map<string, Product[]>();
  for (const p of products) {
    const k = groupKeyOf(p.bulk_group);
    if (!k) continue;
    const a = by.get(k);
    if (a) a.push(p); else by.set(k, [p]);
  }
  const out: ProductGroup[] = [];
  for (const [key, ms] of by) {
    if (ms.length < 2) continue;
    const members = [...ms].sort((a, b) => a.name.localeCompare(b.name, "ar"));
    const curs = new Set(members.map(currencyOf));
    const ps = members.map(pricesOf);
    const same = (xs: (number | null)[]) => xs.every((x) => x === xs[0]);
    const sellSplit = !same(ps.map((x) => x.sell));
    const buySplit = !same(ps.map((x) => x.buy));
    const one = <T,>(xs: T[]): T | null => (xs.every((x) => x === xs[0]) ? xs[0] : null);
    out.push({
      key, members,
      currency: curs.size > 1 ? "mixed" : [...curs][0],
      sell: sellSplit ? null : ps[0].sell,
      buy: buySplit ? null : ps[0].buy,
      sellSplit, buySplit,
      companyId: one(members.map((m) => m.company_id ?? null)),
      sectionId: one(members.map((m) => m.section_id ?? null)),
      title: groupTitle(members.map((m) => m.name)),
    });
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, "ar") || a.key.localeCompare(b.key));
}

export type GroupSeen = Record<string, { s: number | null; p: number | null }>;

/** ما رآه الجهاز لكلّ مادّة: سعرا البيع والشراء بعملتها — `seen` بنداءات الخادم. */
export function seenOf(members: readonly Priced[]): GroupSeen {
  const o: GroupSeen = {};
  for (const m of members) { const x = pricesOf(m); o[m.id] = { s: x.sell, p: x.buy }; }
  return o;
}

/** سعرٌ مكتوبٌ بخانة: رقمٌ ≥ ٠ بمنزلتين، أو null للفارغ، أو NaN لما لا يُقرأ (الحفظُ يقف ويقوله). */
export function priceInput(s: string): number | null {
  // الأرقامُ الشرقية وفاصلُ آلافها (٬) وفاصلتُها العشرية (٫) — لوحةُ مفاتيحٍ عربية تكتبها هكذا.
  const t = s.trim().replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660)).replace(/[,\u066C]/g, "").replace(/\u066B/g, ".");
  if (t === "") return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 && n < 1e10 ? Math.round(n * 100) / 100 : NaN;
}

/** يُربط مع ما اختير؟ نفسُ العملة ونفسُ المخزن (الحقل لا يُخلط بالعيادة) — وإلا السبب. */
export function linkBlock(p: Pick<Product, "price_currency" | "farm_id">, with_: readonly Pick<Product, "price_currency" | "farm_id">[]): "currency" | "farm" | null {
  if (!with_.length) return null;
  if (with_.some((x) => currencyOf(x) !== currencyOf(p))) return "currency";
  if (with_.some((x) => (x.farm_id ?? null) !== (p.farm_id ?? null))) return "farm";
  return null;
}

/** الأسعارُ المختلفة بين ما اختير (للإشارة «الأسعار الحالية مختلفة: …»): قيمٌ مميَّزة مرتّبة. */
export function distinctPrices(xs: readonly (number | null)[]): number[] {
  return [...new Set(xs.filter((x): x is number => x != null))].sort((a, b) => a - b);
}

/** أكثرُ سعرٍ تكراراً (والأوّلُ بالترتيب عند التعادل) — اقتراحُ السعر الموحّد عند ربطٍ جديد. */
export function commonPrice(xs: readonly (number | null)[]): number | null {
  const m = new Map<number, number>();
  for (const x of xs) if (x != null) m.set(x, (m.get(x) ?? 0) + 1);
  let best: number | null = null, n = 0;
  for (const x of xs) { if (x == null) continue; const c = m.get(x) ?? 0; if (c > n) { best = x; n = c; } }
  return best;
}

/** سؤالُ فاتورة الشراء (قرارُ المالك ١٧/١١): مادّةٌ مربوطة غيّرت الفاتورةُ سعرَها ⇒ «لكل المجموعة؟» اختياريّاً بعلامة المشتري. */
export interface GroupAskItem {
  productId: string; name: string; n: number; cur: GroupCurrency;
  sell?: { from: number | null; to: number };
  buy?: { from: number | null; to: number };
}

/** سطورُ الفاتورة ← ما يُسأل عنه: مادّةٌ قائمة بمجموعةٍ حقيقية، وسعرُ بيعٍ مكتوبٌ (> ٠) يخالف سعرَها، أو سعرُ شراءٍ بعملتها يخالفه
 *  (فاتورةٌ بعملةٍ غير عملة المادّة لا يُقارن شراؤها — الخادمُ يكتب كلفتَها بعملته). سؤالٌ واحدٌ لكلّ مجموعة: أوّلُ سطرٍ منها. */
export function purchaseGroupAsks(
  lines: readonly { product_id: string | null | undefined; sell: number; buy: number }[],
  products: readonly Product[], invoiceCur: GroupCurrency,
): GroupAskItem[] {
  const out: GroupAskItem[] = [];
  const done = new Set<string>();
  if (!lines.some((l) => l.product_id)) return out;
  // فهرسٌ مرّةً للقائمة كلّها (تُنادى بكلّ رسمة لشبكة الفاتورة) — لا بحثَ بالقائمة لكلّ سطر.
  const byId = new Map(products.map((p) => [p.id, p]));
  const sizes = groupSizes(products);
  for (const l of lines) {
    if (!l.product_id) continue;
    const p = byId.get(l.product_id);
    if (!p) continue;
    const g = groupKeyOf(p.bulk_group);
    if (!g || done.has(g)) continue;
    const n = sizes.get(g) ?? 0;
    if (n < 2) continue;
    const now = pricesOf(p);
    const pc = currencyOf(p);
    const sell = l.sell > 0 && l.sell !== now.sell ? { from: now.sell, to: l.sell } : undefined;
    const buy = pc === invoiceCur && l.buy > 0 && l.buy !== now.buy ? { from: now.buy, to: l.buy } : undefined;
    if (!sell && !buy) continue;
    done.add(g);
    out.push({ productId: p.id, name: p.name, n, cur: pc, sell, buy });
  }
  return out;
}
