/* ============================================================================
 * دليلُ الزبائن — المرآةُ الحرفية لـ`customer_search` (0232).
 *
 * لماذا مرآة: النسخةُ التجريبية هي ما تجري عليه فحوصُ المنطق (CLAUDE.md §٤)، ومرآةٌ
 * تنحرف عن الخادم تُخفي العطلَ بدل أن تكشفه. فهذه الوحدةُ تكتب نفسَ الخطوات بنفس
 * الترتيب، ويقارنها `customer-parity.mjs` بناتج القاعدة صفّاً بصفّ وحقلاً بحقل:
 *   • القصُّ مسافاتٌ عادية وحدها (`btrim`)، والمقارنةُ بنقاط الترميز (`collate "C"`)؛
 *   • الأوقاتُ تُقارن بقيمتها لا بنصّها، والفارغُ آخراً (`desc nulls last`)؛
 *   • المطابقةُ `startsWith`/`includes` كما `starts_with`/`strpos` (لا `like` ولا هروب)؛
 *   • العتباتُ والسقوفُ نفسُها: حرفان أو ٣ أرقام، والصفحةُ ١–١٠٠، والإزاحةُ ٠–١٠٬٠٠٠.
 * وحدةٌ صِرفة: لا تقرأ مخزناً ولا إعدادات — المصادرُ ومفتاحُ الدولة يُمرَّران لها.
 * ==========================================================================*/
import type { CustomerFilter, CustomerHit, CustomerPage, CustomerPet, CustomerSort, CustomerTopItem, Species } from "@/types";
import { btrimSpaces, custKey, custNameKey, custNorm, custPhoneKey, readCustomerQuery } from "./customerKey";

export interface DirInvoice { id: string; customer_name?: string | null; customer_phone?: string | null; status?: string | null; created_at: string }
export interface DirItem { id: string; invoice_id: string; product_id?: string | null; name?: string | null; qty: number | string }
export interface DirPet {
  id: string; name?: string | null; owner_name?: string | null; owner_phone?: string | null;
  species?: string | null; deceased?: boolean | null; shared_with_clinic?: boolean | null; created_at?: string | null;
}
export interface DirSource { invoices: readonly DirInvoice[]; items?: readonly DirItem[]; pets: readonly DirPet[] }
export interface DirOptions { q?: string | null; sort?: CustomerSort; filter?: CustomerFilter; limit?: number; offset?: number; top?: number }

/** ترتيبُ `collate "C"`: بايتاتُ UTF-8 = نقاطُ الترميز (لا وحداتُ UTF-16). */
export function cmpC(a: string, b: string): number {
  const A = [...a], B = [...b];
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = (A[i].codePointAt(0) as number) - (B[i].codePointAt(0) as number);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return A.length === B.length ? 0 : A.length < B.length ? -1 : 1;
}
const ms = (iso: string | null | undefined): number | null => {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
};
/** تنازليّ والفارغُ آخراً (`desc nulls last`). */
const descNullsLast = (a: number | null, b: number | null): number =>
  a === b ? 0 : a === null ? 1 : b === null ? -1 : b - a;
const clamp = (v: number | undefined, lo: number, hi: number, d: number) =>
  Math.min(Math.max(Math.trunc(Number.isFinite(v as number) ? (v as number) : d), lo), hi);
const nonBlank = (s: string | null | undefined) => btrimSpaces(s ?? "") !== "";

interface Row {
  kind: "inv" | "pet"; nm: string | null; ph: string | null; nBuy: number; nRef: number;
  fAt: string | null; lAt: string | null; seen: string | null;
  petId: string | null; petName: string | null; species: string | null; dead: boolean;
  pk: string | null; nk: string | null; gkey: string | null;
}

/** نفسُ customer_search: يرمي `bad_argument` على ترتيبٍ أو فلترٍ غير معروف كالخادم. */
export function buildCustomerDirectory(src: DirSource, dial: string | null | undefined, opts: DirOptions = {}): CustomerPage {
  const sort = opts.sort ?? "match";
  const filter = opts.filter ?? "all";
  if (!["match", "recent", "purchases"].includes(sort) || !["all", "nopets"].includes(filter)) throw new Error("bad_argument");
  const limit = clamp(opts.limit, 1, 100, 8);
  const offset = clamp(opts.offset, 0, 10000, 0);
  const top = clamp(opts.top, 0, 5, 0);
  const q = readCustomerQuery(opts.q, dial);
  if (q.mode === "short") return { rows: [], total: null };

  /* ١) الفواتير مجمَّعةً بالزوج الخام (اسم، رقم) — كلُّ التاريخ. */
  const pairs = new Map<string, Row>();
  for (const i of src.invoices) {
    if (!nonBlank(i.customer_name) && !nonBlank(i.customer_phone)) continue;
    const nm = i.customer_name ?? null, ph = i.customer_phone ?? null;
    const k = JSON.stringify([nm, ph]);
    const refunded = (i.status ?? "paid") === "refunded";
    const t = ms(i.created_at);
    const r = pairs.get(k);
    if (!r) {
      pairs.set(k, { kind: "inv", nm, ph, nBuy: refunded ? 0 : 1, nRef: refunded ? 1 : 0, fAt: i.created_at, lAt: i.created_at, seen: i.created_at,
        petId: null, petName: null, species: null, dead: false, pk: null, nk: null, gkey: null });
    } else {
      if (refunded) r.nRef++; else r.nBuy++;
      if (t !== null && (ms(r.fAt) === null || t < (ms(r.fAt) as number))) r.fAt = i.created_at;
      if (t !== null && (ms(r.lAt) === null || t > (ms(r.lAt) as number))) { r.lAt = i.created_at; r.seen = i.created_at; }
    }
  }
  /* ٢) حيواناتُ العيادة (shared_with_clinic ليس false). */
  const rows: Row[] = [...pairs.values()];
  for (const p of src.pets) {
    if (p.shared_with_clinic === false) continue;
    rows.push({ kind: "pet", nm: p.owner_name ?? null, ph: p.owner_phone ?? null, nBuy: 0, nRef: 0, fAt: null, lAt: null, seen: p.created_at ?? null,
      petId: p.id, petName: p.name ?? null, species: p.species ?? null, dead: !!p.deceased, pk: null, nk: null, gkey: null });
  }
  for (const r of rows) {
    r.pk = custPhoneKey(r.ph, dial);
    r.nk = custNameKey(r.nm);
    r.gkey = r.pk ? `p:${r.pk}` : r.nk ? `n:${r.nk}` : null;
  }

  /* ٣) الرتبة لكلّ صفّ، والأدنى لكلّ زبون. */
  const rankOf = (r: Row): number | null => {
    if (q.mode === "list") return 9;
    if (q.mode === "phone") {
      if (r.pk === null) return null;
      if (r.pk === q.key) return 0;
      if (r.pk.startsWith(q.key)) return 1;
      return r.pk.includes(q.key) ? 2 : null;
    }
    if (r.nk !== null && r.nk.startsWith(q.key)) return 3;
    if (r.nk !== null && r.nk.includes(q.key)) return 4;
    return r.kind === "pet" && custNorm(r.petName).includes(q.key) ? 5 : null;
  };
  const groups = new Map<string, { rows: Row[]; rk: number | null }>();
  for (const r of rows) {
    if (r.gkey === null) continue;
    const g = groups.get(r.gkey) ?? { rows: [], rk: null };
    const rk = rankOf(r);
    if (rk !== null && (g.rk === null || rk < g.rk)) g.rk = rk;
    g.rows.push(r);
    groups.set(r.gkey, g);
  }

  /* ٤) التجميع. */
  type Agg = CustomerHit & { rk: number; lastSeen: number | null };
  const aggs: Agg[] = [];
  for (const [gkey, g] of groups) {
    if (g.rk === null) continue;
    const byRecent = (field: "nm" | "ph") => (a: Row, b: Row) =>
      descNullsLast(ms(a.seen), ms(b.seen)) || cmpC(btrimSpaces(a[field]), btrimSpaces(b[field]));
    const named = g.rows.filter((r) => r.nk !== null).sort(byRecent("nm"));
    const phoned = g.rows.filter((r) => r.pk !== null).sort(byRecent("ph"));
    const petRows = g.rows.filter((r) => r.kind === "pet").sort((a, b) =>
      (a.dead === b.dead ? 0 : a.dead ? 1 : -1) || descNullsLast(ms(a.seen), ms(b.seen)) || cmpC(a.petId ?? "", b.petId ?? ""));
    const invRows = g.rows.filter((r) => r.kind === "inv");
    const pick = (rs: Row[], f: "fAt" | "lAt", better: (x: number, y: number) => boolean) => {
      let best: string | null = null;
      for (const r of rs) { const t = ms(r[f]); if (t !== null && (best === null || better(t, ms(best) as number))) best = r[f]; }
      return best;
    };
    const seenTimes = g.rows.map((r) => ms(r.seen)).filter((t): t is number => t !== null);
    const pets: CustomerPet[] = petRows.map((r) => ({ id: r.petId as string, name: r.petName, species: (r.species as Species | null), deceased: r.dead }));
    aggs.push({
      key: gkey,
      name: named.length ? btrimSpaces(named[0].nm) : null,
      phone: phoned.length ? btrimSpaces(phoned[0].ph) : null,
      purchases: g.rows.reduce((s, r) => s + r.nBuy, 0),
      refunds: g.rows.reduce((s, r) => s + r.nRef, 0),
      firstAt: pick(invRows, "fAt", (x, y) => x < y),
      lastAt: pick(invRows, "lAt", (x, y) => x > y),
      pets,
      petsAlive: pets.filter((p) => !p.deceased).length,
      petsDeceased: pets.filter((p) => p.deceased).length,
      matched: g.rk <= 2 ? "phone" : g.rk <= 4 ? "name" : g.rk === 5 ? "pet" : null,
      top: null,
      rk: g.rk,
      lastSeen: seenTimes.length ? Math.max(...seenTimes) : null,
    });
  }

  /* ٥) الفلتر والترتيب والصفحة. */
  const kept = aggs.filter((a) => filter === "all" || (a.purchases >= 1 && a.petsAlive + a.petsDeceased === 0));
  kept.sort((a, b) =>
    (sort === "purchases" ? b.purchases - a.purchases : 0)
    || (sort === "match" && q.mode !== "list" ? a.rk - b.rk : 0)
    || descNullsLast(a.lastSeen, b.lastSeen)
    || cmpC(a.key, b.key));
  const page = kept.slice(offset, offset + limit);

  /* ٦) أكثرُ ما يشتريه زبائنُ الصفحة — مرّاتٌ وكمية، بلا مبلغ. */
  if (top > 0) {
    const keys = new Set(page.map((a) => a.key));
    const invOf = new Map<string, { gk: string; at: string }>();
    for (const i of src.invoices) {
      if ((i.status ?? "paid") === "refunded") continue;
      if (!nonBlank(i.customer_name) && !nonBlank(i.customer_phone)) continue;
      const gk = custKey(i.customer_phone, i.customer_name, dial);
      if (gk !== null && keys.has(gk)) invOf.set(i.id, { gk, at: i.created_at });
    }
    type Acc = { ik: string; qty: number; inv: Set<string>; lAt: number | null; name: string | null; nameAt: number | null; nameId: string };
    const acc = new Map<string, Map<string, Acc>>();
    for (const it of src.items ?? []) {
      const inv = invOf.get(it.invoice_id);
      if (!inv) continue;
      const ik = it.product_id ? `id:${it.product_id}` : `nm:${custNorm(it.name)}`;
      const byGk = acc.get(inv.gk) ?? new Map<string, Acc>();
      acc.set(inv.gk, byGk);
      const a = byGk.get(ik) ?? { ik, qty: 0, inv: new Set<string>(), lAt: null, name: null, nameAt: null, nameId: "" };
      byGk.set(ik, a);
      const qty = Number(it.qty);
      a.qty += qty;
      if (qty > 0) a.inv.add(it.invoice_id);
      const t = ms(inv.at);
      if (t !== null && (a.lAt === null || t > a.lAt)) a.lAt = t;
      // الاسمُ من آخر سطر: الأحدثُ فاتورةً، ثم معرّفُ السطر تصاعدياً (collate "C").
      const newer = a.nameId === "" || descNullsLast(t, a.nameAt) < 0 || (descNullsLast(t, a.nameAt) === 0 && cmpC(it.id, a.nameId) < 0);
      if (newer) { a.name = it.name ?? null; a.nameAt = t; a.nameId = it.id; }
    }
    for (const a of page) {
      const list = [...(acc.get(a.key)?.values() ?? [])]
        .filter((x) => x.inv.size > 0 && x.qty > 0)
        .sort((x, y) => y.inv.size - x.inv.size || y.qty - x.qty || descNullsLast(x.lAt, y.lAt) || cmpC(x.ik, y.ik))
        .slice(0, top);
      a.top = list.map((x): CustomerTopItem => ({ name: x.name, times: x.inv.size, qty: x.qty }));
    }
  }

  const out: CustomerHit[] = page.map(({ rk: _rk, lastSeen: _ls, ...hit }) => hit);
  return { rows: out, total: out.length ? kept.length : null };
}
