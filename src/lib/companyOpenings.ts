/* ============================================================================
 * ديونُ الشركة القديمة (0288) — سطورُ النافذة قبل الحفظ: تقرأ ما كُتب كما يقرؤه الخادم، وتقول لماذا لا يُحفظ.
 *
 * الخادمُ يقرّر (company_openings_add): المديرُ وحده، ١..٥٠ سطراً بمعاملةٍ واحدة، كلٌّ «رصيد سابق» بتاريخه، ومرجعُ إعادة.
 * هنا مرآتُه للعرض:
 *  • المبلغُ بـcentsOf (decOf) — ما كُتب يُقال بكلمة («14.169.000» كانت توقف الزرَّ بصمت، بلاغُ ١٦/١١)، ويُرسل نصّاً قانونيّاً
 *    بمنزلتين لا عدداً عائماً.
 *  • التاريخُ اليومَ أو قبله ومن ٢٠٠٠ (كحارس الخادم)، والملاحظةُ ≤ ٥٠٠.
 *  • السطرُ الفارغ كلُّه (لا مبلغ ولا ملاحظة) يُترك — «+ دين» زائدٌ لا يوقف الحفظ؛ والنافذةُ تشيله قبل الإرسال فيبقى «السطر N»
 *    بجملة الخادم هو السطرَ N على الشاشة.
 *  • المجموعُ بالسنت (BigInt) لا بالعائم.
 * مفحوصٌ بـscripts/company-openings-test.mjs.
 * ========================================================================= */
import { centsOf, decText } from "./usdMath";

/** سقفُ الطلب الواحد — مرآةُ رفض `bad_rows` بالخادم. */
export const OPENINGS_MAX = 50;

export interface OpeningLine { k: string; date: string; amount: string; note: string }
export type OpeningWhy = "amount" | "date" | "noteLong";
export interface OpeningRowOut { amount: string; date: string; note: string | null }
export type OpeningsWhy =
  | { kind: "line"; no: number; what: OpeningWhy }
  | { kind: "empty" }
  | { kind: "tooMany" };

export interface OpeningsPlan {
  /** ما يُرسل — السطورُ غيرُ الفارغة بترتيبها، والمبلغُ نصٌّ قانونيّ بمنزلتين. */
  rows: OpeningRowOut[];
  /** سببُ كلّ سطرٍ لا يُحفظ (بمفتاحه)؛ والفارغُ بلا سبب. */
  bad: Map<string, OpeningWhy>;
  /** ما قُرئ من مبلغ كلّ سطرٍ كُتب فيه مبلغ، بالسنت — null = ما انقرأ. */
  cents: Map<string, bigint | null>;
  totalCents: bigint;
  /** عددُ السطور غيرِ الفارغة. */
  count: number;
  ok: boolean;
  /** أوّلُ ما يمنع الحفظ — بترتيب السطور. */
  why: OpeningsWhy | null;
}

export const isBlankLine = (l: Pick<OpeningLine, "amount" | "note">): boolean => l.amount.trim() === "" && l.note.trim() === "";
export const blankLine = (k: string, date: string): OpeningLine => ({ k, date, amount: "", note: "" });

export function planOpenings(lines: OpeningLine[], today: string): OpeningsPlan {
  const rows: OpeningRowOut[] = [];
  const bad = new Map<string, OpeningWhy>();
  const cents = new Map<string, bigint | null>();
  let total = 0n;
  let why: OpeningsWhy | null = null;
  let no = 0;
  for (const l of lines) {
    if (isBlankLine(l)) continue;
    no++;
    const typed = l.amount.trim() !== "";
    const c = typed ? centsOf(l.amount) : null;
    if (typed) cents.set(l.k, c);
    const note = l.note.trim();
    let w: OpeningWhy | null = null;
    if (c == null || c <= 0n) w = "amount";
    else if (!/^\d{4}-\d{2}-\d{2}$/.test(l.date) || l.date > today || l.date < "2000-01-01") w = "date";
    else if ([...note].length > 500) w = "noteLong";
    if (w) {
      bad.set(l.k, w);
      if (!why) why = { kind: "line", no, what: w };
      continue;
    }
    total += c!;
    rows.push({ amount: decText(c!, 2), date: l.date, note: note || null });
  }
  if (!why && no === 0) why = { kind: "empty" };
  if (!why && no > OPENINGS_MAX) why = { kind: "tooMany" };
  return { rows, bad, cents, totalCents: total, count: no, ok: why == null, why };
}

/** ما تحفظه النافذةُ لمحاولةٍ مجهولة المصير — يُقرأ بحذر (تخزينٌ قديم أو تالف لا يُسقط النافذة). */
export interface OpeningsPending { ref: string; cur: "IQD" | "USD"; lines: OpeningLine[] }
export function readOpeningsPending(raw: string | null): OpeningsPending | null {
  try {
    const v = JSON.parse(raw || "null") as Partial<OpeningsPending> | null;
    if (!v || typeof v.ref !== "string" || !/^[A-Za-z0-9_-]{3,80}$/.test(v.ref) || (v.cur !== "IQD" && v.cur !== "USD") || !Array.isArray(v.lines)) return null;
    const lines = v.lines.filter((l): l is OpeningLine => !!l && typeof l === "object" && typeof l.k === "string"
      && typeof l.date === "string" && typeof l.amount === "string" && typeof l.note === "string");
    return lines.length ? { ref: v.ref, cur: v.cur, lines } : null;
  } catch {
    return null; /* swallow-ok: تخزينٌ تالف = لا محاولةَ معلَّقة؛ النافذةُ تبدأ فارغة والخادمُ يحرس الإعادة بمرجعها */
  }
}
