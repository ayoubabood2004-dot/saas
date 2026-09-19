/**
 * ترتيبُ بوستغريس بالواجهة — مقارِنٌ يُعيد **حرفياً** ما كان `order by` يُعيده.
 *
 * لماذا: `allPages` صارت تجلب بالمؤشّر القيميّ (`id > آخرُ ما وصل`) بدل الموقع،
 * والمؤشّرُ يشترط أن يكون `id` الترتيبَ الوحيد بالخادم. ففرزُ العرض («بالاسم»،
 * «الأحدثُ أوّلاً») نزل للواجهة — وشرطُه ألّا تتغيّر شاشةٌ واحدة أمام عيادة.
 *
 * القواعدُ مقيسةٌ من الإنتاج (١٩ أيلول ٢٠٢٦، PostgreSQL 17.6، مزوّد ICU `en-US`)
 * لا مفترَضة، ومحروسةٌ بقوائمَ رتّبتها القاعدةُ نفسُها (scripts/keyset-test.mjs):
 *  • النصّ: ICU `en-US` كالقاعدة — و`Intl.Collator` هو ICU أيضاً. وحين يتساوى
 *    نصّان بالترتيب (محرفٌ مُتجاهَلٌ كالتطويل «ـ») تكسر بوستغريس التعادلَ
 *    **بالبايت**، فهنا بالمحارف (ترتيبُ UTF-8 = ترتيبُ نقاط الترميز).
 *  • الوقت: بالميكروثانية لا بالنصّ ولا بـ`Date` (التي تقف عند الميلّي).
 *  • التاريخ `YYYY-MM-DD`: النصُّ نفسُه مرتَّبٌ زمنياً.
 *  • NULL: آخراً تصاعدياً وأوّلاً تنازلياً — افتراضُ بوستغريس.
 *  • التعادلُ الأخير بـ`id` تصاعدياً دائماً — كما كان `allPages` يُلحق
 *    `order("id")` بعد عمود المستدعي. (uuid بحروفه الصغيرة: ترتيبُ النصّ =
 *    ترتيبُ البايتات.)
 */

export type PgSort = {
  col: string;
  asc: boolean;
  /** نوعُ العمود بالقاعدة — مقيسٌ من information_schema لا مخمَّن. */
  kind: "text" | "date" | "time";
};

const collator = new Intl.Collator("en-US");

/** مقارنةٌ بنقاط الترميز (لا بوحدات UTF-16) — مرآةُ مقارنة بايتات UTF-8. */
function byCodePoint(a: string, b: string): number {
  const A = Array.from(a), B = Array.from(b);
  const n = Math.min(A.length, B.length);
  for (let i = 0; i < n; i++) {
    const d = (A[i].codePointAt(0) as number) - (B[i].codePointAt(0) as number);
    if (d) return d;
  }
  return A.length - B.length;
}

/** نصٌّ كما ترتّبه القاعدة: ICU أوّلاً، ثم البايتُ عند التساوي. */
export function pgText(a: string, b: string): number {
  return collator.compare(a, b) || byCodePoint(a, b);
}

const TS = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2}:\d{2})(?:\.(\d{1,6}))?(Z|[+-]\d{2}(?::?\d{2})?)?$/;

/** timestamptz بصيغة PostgREST ⇒ ميكروثوانٍ منذ ١٩٧٠. `null` لصيغةٍ غريبة. */
export function tsMicros(s: string): number | null {
  const m = TS.exec(s);
  if (!m) return null;
  let off = m[4] ?? "Z";
  if (off !== "Z") off = off.length === 3 ? `${off}:00` : off.includes(":") ? off : `${off.slice(0, 3)}:${off.slice(3)}`;
  const ms = Date.parse(`${m[1]}T${m[2]}${off}`);
  if (Number.isNaN(ms)) return null;
  return ms * 1000 + Number((m[3] ?? "").padEnd(6, "0"));
}

function compareValues(x: unknown, y: unknown, kind: PgSort["kind"]): number {
  if (kind === "time") {
    const a = tsMicros(String(x)), b = tsMicros(String(y));
    // صيغةٌ غيرُ متوقَّعة لا ترمي ولا تُفسد الباقي: تُقارَن نصّاً وتبقى بمكانها.
    if (a != null && b != null) return a - b;
    return byCodePoint(String(x), String(y));
  }
  if (kind === "date") return byCodePoint(String(x), String(y));
  if (typeof x === "number" && typeof y === "number") return x - y;
  return pgText(String(x), String(y));
}

function idCompare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return byCodePoint(String(a ?? ""), String(b ?? ""));
}

/** مقارِنٌ لـ`Array.sort` يُعيد `order by <col> <asc|desc>, id asc` حرفياً. */
export function pgCompare<T>(sort: PgSort): (a: T, b: T) => number {
  const { col, asc, kind } = sort;
  return (a, b) => {
    const x = (a as Record<string, unknown>)[col];
    const y = (b as Record<string, unknown>)[col];
    const xn = x == null, yn = y == null;
    let c: number;
    if (xn || yn) {
      // NULLS LAST تصاعدياً، NULLS FIRST تنازلياً.
      c = xn && yn ? 0 : xn ? (asc ? 1 : -1) : (asc ? -1 : 1);
    } else {
      c = compareValues(x, y, kind);
      if (!asc) c = -c;
    }
    return c || idCompare((a as { id?: unknown }).id, (b as { id?: unknown }).id);
  };
}
