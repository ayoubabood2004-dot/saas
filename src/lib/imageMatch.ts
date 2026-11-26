// ============================================================================
// مطابقةُ صور المكتبة بمنتجات العيادة (طلبُ المالك ٢٥/١١): «العيادات اللي عدها منتجات هواية — السستم يقترح
// تلقائياً هاي الصورة مناسبة لهذا المنتج بالاسم أو الباركود».
//
// صِرفةٌ بلا React ولا شبكة، يفحصها image-match-test بسلوكها. القرارُ ثلاثُ طبقات:
//   • الباركود: رمزُ المنتج (الأساسيّ أو الإضافيّ، `matchCode` بالطرفين) = رمزُ صورة — المنتجُ نفسُه.
//     ثمانيةُ محارف فأكثر: رقمُ رفٍّ يدويّ («12») يصادف رمزاً بالمكتبة ولا يعني شيئاً.
//   • الاسم: كلماتٌ مشتركة **بوزن ندرتها** (الكلمةُ التي بنصف المكتبة — «cat»، «food» — لا تشهد بشيء)،
//     و**الحجمُ حَكَم**: «2 كغم» و«400 غم» منتجان ولو تطابق الباقي حرفاً. الاسمُ تخمين: يُعرض بصورته
//     ويُقرّه إنسان (أو يقرّه «اقبل الكل» بعد سؤالٍ يقول كم منها تخمين).
//   • ما عنده صورة: قسمٌ وحده، ولا يُقترح عليه إلا الأكيد (الباركود) أو الاسمُ القويّ الفريد.
// والمرفوضُ («مو هاي») لا يرجع: `skip` يحذف الزوجَ فيصعد البديلُ التالي.
// ============================================================================
import { cleanLibName } from "./libraryLevels";
import { normalizeDigits } from "./digits";
import { groupKey, matchCode, searchable } from "./utils";

export interface MatchProduct {
  id: string;
  name: string;
  barcode?: string | null;
  alt_codes?: readonly string[] | null;
  company_name?: string | null;
  image_path?: string | null;
}
export interface MatchLib {
  id: string;
  name: string;
  barcode?: string | null;
  company?: string | null;
  agency?: string | null;
  path: string;
  clinic_id?: string | null;
}

export interface MatchItem<P extends MatchProduct = MatchProduct, L extends MatchLib = MatchLib> {
  product: P;
  best: L;
  /** بدائلُ مرتّبة (٣ على الأكثر) — «مو هاي» يصعد أوّلَها. */
  alts: L[];
  how: "code" | "name";
  /** الباركود، أو اسمٌ قويٌّ لا ينافسه ثانٍ قريب. */
  sure: boolean;
  /** ٠–١ للاسم، و١ للباركود. */
  score: number;
}
export interface MatchResult<P extends MatchProduct = MatchProduct, L extends MatchLib = MatchLib> {
  /** بلا صورة، بالباركود. */
  code: MatchItem<P, L>[];
  /** بلا صورة، بالاسم (القويُّ أوّلاً). */
  name: MatchItem<P, L>[];
  /** عنده صورة، وبالمكتبة صورةٌ أخرى له (باركود أو اسمٌ قويّ). */
  replace: MatchItem<P, L>[];
  /** بلا صورة ولا اقتراح. */
  none: number;
}

export const MIN_CODE = 8;
export const STRONG = 0.7;
export const WEAK = 0.4;
/** الفارقُ عن الثاني الذي يجعل الاسمَ «قويّاً فريداً». */
export const MARGIN = 0.12;
const MAX_ALTS = 3;

/* ── الحجم ───────────────────────────────────────────────────────────────────────────────────────
 * «2kg»، «2 كغم»، «2000g» حجمٌ واحد؛ «400 gm» و«0.4 كيلو» كذلك. الوحدةُ تُطوى لبُعدها (وزنٌ بالغرام،
 * حجمٌ بالمللتر، ملغم وحده) فالمقارنةُ عددٌ بعدد. الكسرُ بفاصلة أو نقطة. */
const UNITS: [RegExp, string, number][] = [
  [/^(?:kg|kgs|kilo|kilos|كغم|كغ|كيلو|كيلوغرام|كيلوجرام|كجم)$/, "g", 1000], /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
  [/^(?:g|gm|gms|gr|grs|gram|grams|غم|غرام|جم|جرام|غ)$/, "g", 1], /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
  [/^(?:mg|ملغ|ملغم|مغ)$/, "mg", 1], /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
  [/^(?:l|lt|ltr|liter|litre|لتر|ل)$/, "ml", 1000], /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
  [/^(?:ml|مل|ملل|مللتر|ملليلتر)$/, "ml", 1], /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
];
const SIZE_RE = /(\d+(?:[.,]\d+)?)\s*([a-zء-ي]{1,10})(?![a-zء-ي])/giu; /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */

/** الأحجامُ بالاسم مطويّةً («g:2000»)، والاسمُ بعد شيلها — كي لا تُعدّ «2» و«kg» كلمتين. */
export function sizesOf(name: string | null | undefined): { sizes: string[]; rest: string } {
  const s = normalizeDigits(cleanLibName(name)).toLowerCase();
  const sizes = new Set<string>();
  const rest = s.replace(SIZE_RE, (m, num: string, unit: string) => {
    const u = UNITS.find(([re]) => re.test(unit));
    if (!u) return m;
    const v = Math.round(parseFloat(num.replace(",", ".")) * u[2] * 1000) / 1000;
    if (!Number.isFinite(v) || v <= 0) return m;
    sizes.add(`${u[1]}:${v}`);
    return " ";
  });
  return { sizes: [...sizes].sort(), rest };
}

const SPLIT = /[\s\-–—_/\\|,.;:()[\]{}+&*#'"«»،؛!?%]+/u; /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
/** كلماتُ الاسم بلا الأحجام: `searchable` للكلمة (الطرفان بالدالّة نفسِها)، وحرفان فأكثر. */
export function wordsOf(rest: string): string[] {
  return [...new Set(rest.split(SPLIT).map((w) => searchable(w)).filter((w) => w.length >= 2))];
}

/** رموزُ المنتج كلُّها مطبَّعةً للمطابقة، والقصيرُ (رقمُ رفّ) خارجها. */
export function productCodes(p: Pick<MatchProduct, "barcode" | "alt_codes">): string[] {
  const out = new Set<string>();
  for (const c of [p.barcode, ...(p.alt_codes ?? [])]) {
    const k = matchCode(c);
    if (k.length >= MIN_CODE) out.add(k);
  }
  return [...out];
}

interface Prepared<L> { row: L; words: string[]; sizes: string[]; co: Set<string> }

/** الحجمان يتّفقان؟ كلاهما بحجمٍ من البُعد نفسِه ولا حجمَ مشترك ⇒ لا. وحجمٌ بطرفٍ وحده لا يحكم. */
export function sizesAgree(a: readonly string[], b: readonly string[]): boolean {
  for (const dim of ["g", "ml", "mg"]) {
    const x = a.filter((s) => s.startsWith(dim + ":"));
    const y = b.filter((s) => s.startsWith(dim + ":"));
    if (x.length && y.length && !x.some((s) => y.includes(s))) return false;
  }
  return true;
}

export interface MatchOptions {
  /** «مو هاي» محفوظة: المنتج + مسارُ الصورة. */
  skip?: (productId: string, path: string) => boolean;
}

export function matchAll<P extends MatchProduct, L extends MatchLib>(
  products: readonly P[], library: readonly L[], opts: MatchOptions = {},
): MatchResult<P, L> {
  const skip = opts.skip ?? (() => false);
  // الصورةُ نفسُها بصفّين (العامّة ونسخةُ العيادة بالمسار نفسِه؟ لا — لكن استيرادٌ مكرّر بنفس الملفّ قد يحدث):
  // المسارُ هويّةُ الصورة.
  const seenPath = new Set<string>();
  const rows: Prepared<L>[] = [];
  for (const r of library) {
    if (!r.path || seenPath.has(r.path)) continue;
    seenPath.add(r.path);
    const { sizes, rest } = sizesOf(r.name);
    rows.push({ row: r, words: wordsOf(rest), sizes, co: new Set([groupKey(r.company), groupKey(r.agency)].filter(Boolean)) });
  }

  // الندرة: وزنُ الكلمة ln(1 + N/df).
  const df = new Map<string, number>();
  for (const r of rows) for (const w of r.words) df.set(w, (df.get(w) ?? 0) + 1);
  const N = Math.max(rows.length, 1);
  const weight = (w: string) => Math.log(1 + N / (df.get(w) ?? 0.5));
  const post = new Map<string, number[]>();
  rows.forEach((r, i) => { for (const w of r.words) { const a = post.get(w); if (a) a.push(i); else post.set(w, [i]); } });
  const byCode = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const k = matchCode(r.row.barcode);
    if (k.length >= MIN_CODE) { const a = byCode.get(k); if (a) a.push(i); else byCode.set(k, [i]); }
  });
  // كلمةٌ بأكثر من ربع المكتبة لا تُولّد مرشّحين (تُحسب بالوزن إن جاء المرشّحُ بغيرها).
  const common = Math.max(50, Math.ceil(N * 0.25));

  const order = (a: L, b: L) =>
    (a.clinic_id ? 0 : 1) - (b.clinic_id ? 0 : 1) || a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id);

  const out: MatchResult<P, L> = { code: [], name: [], replace: [], none: 0 };
  for (const p of products) {
    const cur = p.image_path ?? null;
    const has = !!cur;
    // صورتُه الحاليّة من المكتبة أصلاً: مكتمل — صورةٌ ثانيةٌ من المكتبة له ضجيج لا «أوضح».
    if (has && seenPath.has(cur)) continue;
    const { sizes, rest } = sizesOf(p.name);
    const words = wordsOf(rest);
    const pco = groupKey(p.company_name);
    const nameScore = (r: Prepared<L>): number => {
      if (!words.length || !r.words.length || !sizesAgree(sizes, r.sizes)) return 0;
      const rw = new Set(r.words);
      let wS = 0, wP = 0, wL = 0, k = 0;
      for (const w of words) { const x = weight(w); wP += x; if (rw.has(w)) { wS += x; k++; } }
      for (const w of r.words) wL += weight(w);
      // كلمتان مشتركتان فأكثر — أو الاسمُ كلمةٌ واحدة نادرة.
      if (k < 2 && !(words.length === 1 && k === 1)) return 0;
      let s = (2 * wS) / (wP + wL);
      if (pco && r.co.has(pco)) s = Math.min(1, s + 0.05);
      return s;
    };

    // ١) الباركود
    const codeIdx = new Set<number>();
    for (const c of productCodes(p)) for (const i of byCode.get(c) ?? []) codeIdx.add(i);
    const codeRows = [...codeIdx].map((i) => rows[i]).filter((r) => !skip(p.id, r.row.path));
    if (codeRows.length) {
      const ranked = codeRows.map((r) => [nameScore(r), r.row] as const)
        .sort((a, b) => b[0] - a[0] || order(a[1], b[1])).map((x) => x[1]);
      const item: MatchItem<P, L> = { product: p, best: ranked[0], alts: ranked.slice(1, 1 + MAX_ALTS), how: "code", sure: true, score: 1 };
      (has ? out.replace : out.code).push(item);
      continue;
    }

    // ٢) الاسم
    if (!words.length) { if (!has) out.none++; continue; }
    const cand = new Set<number>();
    for (const w of words) {
      const a = post.get(w);
      if (a && a.length <= common) for (const i of a) cand.add(i);
    }
    // اسمٌ كلُّ كلماته شائعة: يُبحث بها كلِّها (نادرٌ — ومكتبةٌ صغيرة كلُّ كلماتها «شائعة»).
    if (!cand.size) for (const w of words) for (const i of post.get(w) ?? []) cand.add(i);
    const scored: [number, L][] = [];
    for (const i of cand) {
      const r = rows[i];
      if (skip(p.id, r.row.path)) continue;
      const s = nameScore(r);
      if (s >= WEAK) scored.push([s, r.row]);
    }
    if (!scored.length) { if (!has) out.none++; continue; }
    scored.sort((a, b) => b[0] - a[0] || order(a[1], b[1]));
    const [s0, best] = scored[0];
    const s1 = scored[1]?.[0] ?? 0;
    const sure = s0 >= STRONG && s0 - s1 >= MARGIN;
    const item: MatchItem<P, L> = {
      product: p, best, alts: scored.slice(1, 1 + MAX_ALTS).map((x) => x[1]), how: "name", sure, score: Math.round(s0 * 1000) / 1000,
    };
    if (has) { if (sure) out.replace.push(item); }
    else out.name.push(item);
  }
  out.name.sort((a, b) => Number(b.sure) - Number(a.sure) || b.score - a.score || a.product.name.localeCompare(b.product.name, "ar"));
  return out;
}

/** «مو هاي» بالجهاز — بالعيادة، والمفتاحُ زوجُ المنتج والصورة. التخزينُ قد يُرفض (نافذةٌ خاصّة): يُبلع. */
export const rejectKey = (productId: string, path: string) => `${productId}|${path}`;
export function loadRejects(clinic: string): Set<string> {
  try {
    const raw = localStorage.getItem(`vp_pmatch_no:${clinic}`);
    const a = raw ? (JSON.parse(raw) as unknown) : [];
    return new Set(Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []);
  } catch { return new Set(); }
}
export function saveRejects(clinic: string, set: ReadonlySet<string>): void {
  try {
    // آخرُ ٥٠٠٠ وحدها: قائمةٌ تكبر بلا حدّ تملأ التخزين.
    localStorage.setItem(`vp_pmatch_no:${clinic}`, JSON.stringify([...set].slice(-5000)));
  } catch { /* تخزينٌ مرفوض: الرفضُ يبقى لهذه الجلسة */ } /* i18n-data: وحداتٌ وفواصلُ تُطابَق بها الأسماء، لا نصٌّ معروض */
}

/** قبلَ «اقبل الكل»: المنتجاتُ كما هي الآن بالخادم. ما تبدّلت صورتُه عمّا رأته الشاشة (من جهازٍ آخر أو
 *  مصوّرٍ أثناءها) لا يُكتب فوقه، وما اختفى (حُذف أو طُوي) لا يُكتب له — يُعدّان ويُقالان. */
export function freshSplit<P extends MatchProduct, L extends MatchLib>(
  items: readonly MatchItem<P, L>[], fresh: ReadonlyMap<string, string | null>,
): { go: MatchItem<P, L>[]; changed: number; gone: number } {
  const go: MatchItem<P, L>[] = [];
  let changed = 0, gone = 0;
  for (const it of items) {
    if (!fresh.has(it.product.id)) { gone++; continue; }
    if ((fresh.get(it.product.id) ?? null) !== (it.product.image_path ?? null)) { changed++; continue; }
    go.push(it);
  }
  return { go, changed, gone };
}
