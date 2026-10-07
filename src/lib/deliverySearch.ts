import type { DeliveryOrder } from "@/types";
import { matchCode, normalizeCode, searchable } from "./utils";
import { phoneDigits, phoneMatches } from "./phone";
import { invoiceNo } from "./invoiceNo";

/* ============================================================================
 * البحثُ بطلبات التوصيل — «وين طلب أبو علي؟»، «شنو صار برقم BX-1234؟».
 * نقيٌّ ومفحوصٌ بـ`scripts/delivery-search-test.mjs`، وتمرّ منه لوحةُ التوصيل
 * وسجلُّ الشركة كلاهما — نسخةٌ واحدة لا نسختان تفترقان بصمت.
 *
 * يطابق بخمسة: رقمِ الطلب (`courier_ref`)، ورقمِ الفاتورة (INV-xxxxxx)، والهاتفِ،
 * واسمِ الزبون، والمكانِ/الحاملِ/الملاحظة. وكلُّ حقلٍ يمرّ **هو والسؤالُ** من نفس
 * الدالّة (CLAUDE.md §٣: تطبيعُ طرفٍ واحد يفشل بصمتٍ ويبدو أنه يعمل):
 *   • رقمُ الطلب: `refKey` — أرقامٌ شرقية، ومحارفُ لصقٍ خفيّة، وحالةُ الأحرف،
 *     والفواصلُ (BX-1234 = bx 1234 = BX1234).
 *   • الهاتف: `phoneMatches` — مسافات، +964، الصفرُ الأوّل، أرقامٌ شرقية. ولا
 *     يُجرَّب إلا لسؤالٍ بلا أحرف ومن ثلاثة أرقام: «INV-A1B2C3» لا يطابق كلَّ
 *     هاتفٍ فيه ١٢٣.
 *   • الاسم والمكان: `searchable` — الهمزة والتاء المربوطة والألف المقصورة.
 * ========================================================================= */

/** أطولُ رقمٍ تقبله الشاشة (القاعدةُ تقبل ٦٤ — 0225). */
export const MAX_REF_LEN = 40;

/** ما يُحفظ: تطبيعُ الباركود نفسُه (شرقيّ ← لاتينيّ، بلا خفيّ ولا مسافات)، والحالةُ
 *  كما كُتبت — الرقمُ يُقرأ للشركة بالهاتف كما طبعته. والفراغُ NULL لا ''. */
export function cleanRef(s: string | null | undefined): string | null {
  const v = normalizeCode(s).slice(0, MAX_REF_LEN);
  return v || null;
}

/** مفتاحُ المطابقة — للمحفوظ وللسؤال معاً. */
export const refKey = (s: string | null | undefined): string =>
  matchCode(s).replace(/[-_/.#:,]/g, "");

/** ذيلُ رقم الفاتورة بلا «INV-» — ستّةُ محارف صغيرة. */
const invKey = (invoiceId: string): string => invoiceNo(invoiceId).slice(4).toLowerCase();

export type DeliveryHit = "ref" | "invoice" | "phone" | "name" | "courier" | "place" | "note";

/** أقوى أوّلاً: رقمٌ مطابقٌ تماماً هو ما يبحث عنه من كتبه، لا اسمٌ يحتويه. */
const RANK: Record<DeliveryHit, number> = { ref: 0, invoice: 1, phone: 2, name: 3, courier: 4, place: 5, note: 6 };

export interface DeliveryIndexed {
  o: DeliveryOrder;
  name: string;
  courier: string;
  place: string;
  note: string;
  ref: string;
  inv: string;
}

/** يُبنى مرّةً لكلّ طلب (useMemo) — لا لكلّ ضغطة. */
export function indexDelivery(o: DeliveryOrder, courierName?: string | null): DeliveryIndexed {
  return {
    o,
    name: searchable(o.customer_name ?? ""),
    courier: searchable(courierName ?? ""),
    place: searchable(`${o.zone ?? ""} ${o.address ?? ""}`),
    note: searchable(o.note ?? ""),
    ref: refKey(o.courier_ref),
    inv: invKey(o.invoice_id),
  };
}

export interface ParsedQuery {
  raw: string;
  text: string;
  ref: string;
  inv: string;
  /** السؤالُ أرقامٌ (وفواصلُ هاتف) فقط — يُجرَّب على الهاتف. */
  phoneish: boolean;
  /** سؤالٌ صريحٌ عن فاتورة: «INV-…» أو «#INV…». */
  invOnly: boolean;
}

export function parseQuery(q: string): ParsedQuery | null {
  const raw = (q ?? "").trim();
  if (!raw) return null;
  const invOnly = /^#?\s*inv\b|^#?\s*inv-/i.test(raw);
  const d = phoneDigits(raw);
  return {
    raw,
    text: searchable(raw),
    ref: refKey(raw),
    inv: refKey(raw.replace(/^#?\s*inv[-\s]?/i, "")),
    phoneish: d.length >= 3 && !/\p{L}/u.test(raw),
    invOnly,
  };
}

/** أقوى حقلٍ يطابقه السؤال، أو null. */
export function matchDelivery(ix: DeliveryIndexed, pq: ParsedQuery, dialCode: string): DeliveryHit | null {
  if (pq.invOnly) return pq.inv && ix.inv.includes(pq.inv) ? "invoice" : null;
  let best: DeliveryHit | null = null;
  const take = (h: DeliveryHit) => { if (best === null || RANK[h] < RANK[best]) best = h; };
  if (pq.ref.length >= 2 && ix.ref && ix.ref.includes(pq.ref)) take("ref");
  if (pq.inv.length >= 3 && ix.inv.includes(pq.inv)) take("invoice");
  if (pq.phoneish && ix.o.customer_phone && phoneMatches(ix.o.customer_phone, pq.raw, dialCode)) take("phone");
  if (pq.text) {
    if (ix.name.includes(pq.text)) take("name");
    if (ix.courier.includes(pq.text)) take("courier");
    if (ix.place.includes(pq.text)) take("place");
    if (ix.note.includes(pq.text)) take("note");
  }
  return best;
}

export interface DeliveryResult { o: DeliveryOrder; hit: DeliveryHit; exact: boolean }

/**
 * كلُّ الطلبات المطابقة — **بلا سقف**: القائمةُ الناقصة تُصدَّق (CLAUDE.md §٣)،
 * فالشاشةُ تعرض جزءاً وتقول «N من M» بدل أن تقصّ بصمت.
 * الترتيب: رقمٌ مطابقٌ تماماً أوّلاً، ثم أقوى حقل، ثم الأحدث.
 */
export function searchDeliveries(index: DeliveryIndexed[], q: string, dialCode: string): DeliveryResult[] {
  const pq = parseQuery(q);
  if (!pq) return index.map((ix) => ({ o: ix.o, hit: "name" as DeliveryHit, exact: false }))
    .sort((a, b) => b.o.created_at.localeCompare(a.o.created_at));
  const out: DeliveryResult[] = [];
  for (const ix of index) {
    const hit = matchDelivery(ix, pq, dialCode);
    if (!hit) continue;
    const exact = (hit === "ref" && ix.ref === pq.ref) || (hit === "invoice" && ix.inv === pq.inv);
    out.push({ o: ix.o, hit, exact });
  }
  return out.sort((a, b) =>
    (Number(b.exact) - Number(a.exact)) || (RANK[a.hit] - RANK[b.hit]) || b.o.created_at.localeCompare(a.o.created_at));
}

/** طلبٌ آخر لنفس الحامل بنفس الرقم — ينبَّه عليه ولا يُمنع (0225: لا فريد). */
export function refTwin(orders: DeliveryOrder[], self: { id?: string | null; courier_id?: string | null }, ref: string | null | undefined): DeliveryOrder | null {
  const k = refKey(ref);
  if (!k) return null;
  return orders.find((o) => o.id !== self.id && (o.courier_id ?? null) === (self.courier_id ?? null) && refKey(o.courier_ref) === k) ?? null;
}
