import type { DoseRoute, Species } from "@/types";
import { searchable } from "./utils";

/* ============================================================================
 * doseUnits — الجرعةُ كمّيةٌ بوحدة، تُختار بضغطة وتُكتب بنصٍّ واحدٍ يُقرأ ويُطابَق.
 *
 * ── الجذرُ المقيس (قرارُ المالك D5/D5+) ───────────────────────────────────
 * خانةُ الجرعة نصٌّ حرّ: «1 ml» و«1 مل» و«1مل» ثلاثةُ أوامر بالطبلة لدواءٍ واحد، و«½ حبة»
 * و«نص حبة» و«1 و½ حبة» ثلاثُ كتابات، والوحدةُ لا تتبع الطريق (حبّةٌ «وريدية»). وبيانات
 * الإنتاج (١٨٠ يوماً) تقول أين تقع الجرعات: مل من ٠٫٠١ إلى ٥٠ — ٥٩ تحت ٠٫١ و١٨٧ بين ٠٫١
 * و١ و٢٣٣ بين ١ و٥. فالسلّمُ يغطّي المدى كلَّه أزراراً بضغطة، والكتابةُ احتياطٌ مفحوص.
 *
 * ── القواعد ──────────────────────────────────────────────────────────────
 *  • الطريقُ يحدّد الوحدات (فموي ⇒ حبة…، وريدي/عضلي/تحت الجلد ⇒ مل، والإنسولين ⇒ وحدة دولية).
 *  • **تغييرُ الشكل يمسح الرقم**: لا تحويلَ بين قطرةٍ ومل ولا وحدةٍ دوليةٍ ومل ولا ملعقة — الطريقُ
 *    من عائلةٍ لأخرى (فموي مل ⇒ وريدي مل) يمسح الرقم كذلك؛ وبين الحقن الثلاثة يبقى.
 *  • النصُّ المحفوظ واحدٌ لكلّ كمّية (`formatAmount`)، و`parseAmount` يقرأه ويقرأ القديمَ
 *    («1 ml»، «½ مل»، «1 و½ حبة»، «نص حبة»…) — والطرفان بنفس التطبيع، فـ`amountKey` يجمع
 *    «1 ml» و«1 مل» و«1مل» صفّاً واحداً بالطبلة.
 *  • كلماتُ السجلّ عربيةٌ **بيانات** (تُقرأ وتُطابَق) لا نصُّ واجهة — موسومةٌ بـi18n-data.
 * بلا React وبلا repo — `repo.ts` لا يستوردها (وزنُ الإقلاع).
 * ==========================================================================*/

export type DoseUnit = "ml" | "tab" | "cap" | "drop" | "puff" | "supp" | "iu" | "app" | "tube" | "sachet" | "cm" | "mlL" | "gL";
export interface DoseValue { route: DoseRoute | null; unit: DoseUnit | null; qty: number | null }
export interface Amount { qty: number; unit: DoseUnit }

/** ترتيبُ رقاقات الطريق — مرآةُ ROUTES بـflowsheet.ts. */
export const DOSE_ROUTES: readonly DoseRoute[] = ["iv", "im", "sc", "po", "topical", "inhaled", "ocular", "otic", "nasal", "rectal", "water"];
export const DOSE_UNITS: readonly DoseUnit[] = ["ml", "tab", "cap", "drop", "puff", "supp", "iu", "app", "tube", "sachet", "cm", "mlL", "gL"];
const INJECT: ReadonlySet<DoseRoute> = new Set(["iv", "im", "sc"]);
const isDoseRoute = (r: unknown): r is DoseRoute => typeof r === "string" && (DOSE_ROUTES as readonly string[]).includes(r);

const ROUTE_UNITS: Record<DoseRoute, DoseUnit[]> = {
  po: ["tab", "cap", "ml", "drop", "sachet"],
  iv: ["ml", "iu"],
  im: ["ml", "iu"],
  sc: ["ml", "iu"],
  ocular: ["drop", "cm"],
  otic: ["drop", "ml"],
  topical: ["app", "puff", "tube"],
  nasal: ["drop", "puff"],
  rectal: ["supp", "ml"],
  inhaled: ["puff", "ml"],
  water: ["mlL", "gL"],
};

/** «عين / أذن» بالمعالج طريقٌ واحد لا يُعرف أيّهما — وحداتُه قطرة وسم ومل. */
export const EYE_EAR_UNITS: readonly DoseUnit[] = ["drop", "cm", "ml"];

/** الإنسولين يُعطى بالوحدة الدولية — الاسمُ بالطرفين من searchable (همزة، حالة، مسافة). */
const INSULIN_KEYS = [searchable("insulin"), searchable("انسولين")]; /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
export function isInsulin(name: string | null | undefined): boolean {
  const k = searchable(name);
  return !!k && INSULIN_KEYS.some((x) => k.includes(x));
}

/** وحداتُ الطريق، الافتراضيُّ أوّلاً (والإنسولين بالحقن ⇒ وحدة دولية أوّلاً). */
export function unitsFor(route: DoseRoute | null | undefined, name?: string | null): DoseUnit[] {
  if (!isDoseRoute(route)) return [];
  const list = ROUTE_UNITS[route].slice();
  if (INJECT.has(route) && isInsulin(name)) return ["iu", ...list.filter((u) => u !== "iu")];
  return list;
}
export const defaultUnit = (route: DoseRoute | null | undefined, name?: string | null): DoseUnit | null => unitsFor(route, name)[0] ?? null;

/** طريقُ المعالج (oral/sc/im/iv/topical/eye_ear) ⇒ طريقُ الطبلة؛ «عين / أذن» ⇒ null (وحداتُه EYE_EAR_UNITS). */
export function planRouteToDose(r: string | null | undefined): DoseRoute | null {
  switch (r) {
    case "oral": return "po";
    case "sc": return "sc";
    case "im": return "im";
    case "iv": return "iv";
    case "topical": return "topical";
    default: return null;
  }
}

/* ── السلالم: كلُّ درجةٍ زرّ، والتبويبُ يشمل طرفيه ───────────────────────── */
export interface RangeTab { id: string; label: string; values: number[] }
/** من a إلى b بخطوة s — بأعدادٍ صحيحة ثم قسمة (لا ضجيجَ عشريّ: 0.15 لا 0.15000000000000002). */
const steps = (a: number, b: number, s: number, scale = 100): number[] => {
  const out: number[] = [];
  const A = Math.round(a * scale), B = Math.round(b * scale), S = Math.round(s * scale);
  for (let i = A; i <= B; i += S) out.push(Number((i / scale).toFixed(3)));
  return out;
};
const BIG: ReadonlySet<string> = new Set(["horse", "cow"]);

export function laddersFor(unit: DoseUnit | null | undefined, species?: Species | string | null): RangeTab[] {
  switch (unit) {
    case "ml": {
      const tabs: RangeTab[] = [
        { id: "0.01-0.1", label: "0.01–0.1", values: steps(0.01, 0.1, 0.01) },
        { id: "0.1-1", label: "0.1–1", values: steps(0.1, 1, 0.05) },
        { id: "1-5", label: "1–5", values: steps(1, 5, 0.1) },
        { id: "5-10", label: "5–10", values: steps(5, 10, 0.5) },
        { id: "10-60", label: "10–60", values: [...steps(10, 30, 1), 35, 40, 45, 50, 55, 60] },
      ];
      if (species && BIG.has(species)) tabs.push({ id: "60+", label: "60+", values: [70, 80, 90, 100, 120, 150, 200, 250, 300, 400, 500] });
      return tabs;
    }
    case "tab":
    case "sachet":
      return [
        { id: "0.25-2", label: "¼–2", values: steps(0.25, 2, 0.25) },
        { id: "2-10", label: "2–10", values: steps(2, 10, 0.5) },
      ];
    case "cap": case "drop": case "puff": case "supp": case "app": case "tube":
      return [{ id: "1-20", label: "1–20", values: steps(1, 20, 1) }];
    case "iu":
      return [
        { id: "0.5-5", label: "0.5–5", values: steps(0.5, 5, 0.5) },
        { id: "5-10", label: "5–10", values: steps(5, 10, 0.5) },
        { id: "10-25", label: "10–25", values: steps(10, 25, 1) },
        { id: "25-50", label: "25–50", values: steps(25, 50, 1) },
      ];
    case "cm":
      return [{ id: "cm", label: "0.25–5", values: [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 4, 5] }];
    case "mlL":
    case "gL":
      return [
        { id: "0.1-1", label: "0.1–1", values: [0.1, 0.2, 0.25, 0.3, 0.4, 0.5, 0.6, 0.7, 0.75, 0.8, 0.9, 1] },
        { id: "1-5", label: "1–5", values: [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 3.5, 4, 4.5, 5] },
        { id: "5-20", label: "5–20", values: [5, 6, 7, 8, 9, 10, 12, 15, 20] },
      ];
    default:
      return [];
  }
}

/** التبويبُ الذي يُفتح: ما فيه القيمةُ المثبّتة، وإلا الأشيعُ بالإنتاج (مل «0.1–1»، حبة «¼–2»،
 *  وحدة «0.5–5»، ماء «0.1–1»)، وإلا الأوّل. */
export function initialTab(tabs: readonly RangeTab[], unit: DoseUnit | null | undefined, pinned?: number | null): string | null {
  if (!tabs.length) return null;
  if (pinned != null) {
    // قيمةٌ على حدّين (0.1 آخرُ «0.01–0.1» وأوّلُ «0.1–1») تُفتح بالتبويب الذي تبدأه — جيرانُها هناك.
    const eq = (v: number) => Math.abs(v - pinned) < 1e-9;
    const hit = tabs.find((t) => t.values.some(eq) && !eq(t.values[t.values.length - 1]))
      ?? tabs.find((t) => t.values.some(eq))
      ?? tabs.find((t) => pinned >= t.values[0] && pinned <= t.values[t.values.length - 1]);
    if (hit) return hit.id;
  }
  const pref = unit === "ml" ? "0.1-1" : unit === "tab" || unit === "sachet" ? "0.25-2" : unit === "iu" ? "0.5-5" : unit === "mlL" || unit === "gL" ? "0.1-1" : null;
  return tabs.find((t) => t.id === pref)?.id ?? tabs[0].id;
}

/* ── الحدود: الكتابةُ باليد تُفحص بنفس الوحدة ─────────────────────────────── */
export type QtyError = { code: "whole" | "quarter" | "half" | "range"; min: number; max: number };
const isMult = (n: number, step: number) => Math.abs(n / step - Math.round(n / step)) < 1e-9;
const decimals = (n: number) => { const s = String(n); const i = s.indexOf("."); return i < 0 ? 0 : s.length - i - 1; };

export function qtyBounds(unit: DoseUnit, species?: Species | string | null): { min: number; max: number; decimals: number } {
  switch (unit) {
    case "ml": return { min: 0.001, max: species && BIG.has(species) ? 1000 : 100, decimals: 3 };
    case "tab": case "sachet": return { min: 0.25, max: 20, decimals: 2 };
    case "iu": return { min: 0.5, max: 100, decimals: 1 };
    case "cm": return { min: 0.25, max: 10, decimals: 2 };
    case "mlL": case "gL": return { min: 0.01, max: 50, decimals: 2 };
    default: return { min: 1, max: 50, decimals: 0 };
  }
}

/** كمّيةٌ صالحةٌ لوحدتها؟ null = صالحة. */
export function validQty(unit: DoseUnit, n: number, species?: Species | string | null): QtyError | null {
  const { min, max, decimals: dp } = qtyBounds(unit, species);
  if (!Number.isFinite(n)) return { code: "range", min, max };
  switch (unit) {
    case "tab": case "sachet": case "cm":
      if (!isMult(n, 0.25)) return { code: "quarter", min, max };
      break;
    case "iu":
      if (!isMult(n, 0.5)) return { code: "half", min, max };
      break;
    case "ml": case "mlL": case "gL":
      if (decimals(n) > dp) return { code: "range", min, max };
      break;
    default:
      if (!Number.isInteger(n)) return { code: "whole", min, max };
  }
  if (n < min - 1e-9 || n > max + 1e-9) return { code: "range", min, max };
  return null;
}

/* ── النصُّ المحفوظ ──────────────────────────────────────────────────────── */
/** رقمٌ بأرقامٍ غربية بلا فواصل آلاف ولا ضجيج: 0.25، 1، 12.5. */
export const num = (q: number): string => String(Number(q.toFixed(3)));

type CountUnit = "tab" | "sachet" | "cap" | "drop" | "puff" | "supp" | "app" | "tube";
interface Words { base: string; one: string; dual: string; few: string; many: string }
const WORDS: Record<CountUnit, Words> = {
  tab: { base: "حبة", one: "حبة واحدة", dual: "حبتين", few: "حبات", many: "حبة" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  sachet: { base: "كيس", one: "كيس واحد", dual: "كيسين", few: "أكياس", many: "كيس" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  cap: { base: "كبسولة", one: "كبسولة واحدة", dual: "كبسولتين", few: "كبسولات", many: "كبسولة" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  drop: { base: "قطرة", one: "قطرة واحدة", dual: "قطرتين", few: "قطرات", many: "قطرة" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  puff: { base: "بخّة", one: "بخّة واحدة", dual: "بخّتين", few: "بخّات", many: "بخّة" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  supp: { base: "تحميلة", one: "تحميلة واحدة", dual: "تحميلتين", few: "تحميلات", many: "تحميلة" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  app: { base: "تطبيق", one: "تطبيق واحد", dual: "تطبيقين", few: "تطبيقات", many: "تطبيق" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  tube: { base: "أنبوبة", one: "أنبوبة واحدة", dual: "أنبوبتين", few: "أنابيب", many: "أنبوبة" }, /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
};
type MeasUnit = "ml" | "iu" | "cm" | "mlL" | "gL";
const MEASURED: Record<MeasUnit, string> = {
  ml: "مل", iu: "وحدة دولية", cm: "سم", mlL: "مل/لتر", gL: "غم/لتر", /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
};
/** و¼ / ونص / و¾ بعد العدد الصحيح، و¼ / ½ / ¾ وحدها. */
const FRAC_GLYPH: Record<string, string> = { "0.25": "¼", "0.5": "½", "0.75": "¾" };
const FRAC_AFTER: Record<string, string> = { "0.25": " و¼", "0.5": " ونص", "0.75": " و¾" }; /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */

/** الكمّيةُ بنصّها المحفوظ: «0.25 مل»، «حبة ونص»، «قطرتين»، «3 حبات»، «11 حبة»، «2 وحدة دولية». */
export function formatAmount(a: { qty: number | null; unit: DoseUnit | null }): string {
  if (a.qty == null || a.unit == null || !Number.isFinite(a.qty)) return "";
  const q = a.qty;
  if (a.unit in MEASURED) return `${num(q)} ${MEASURED[a.unit as MeasUnit]}`;
  const w = WORDS[a.unit as CountUnit];
  const whole = Math.floor(q + 1e-9);
  const frac = Number((q - whole).toFixed(2));
  const fk = String(frac);
  if (whole === 0) return `${FRAC_GLYPH[fk] ?? num(q)} ${w.base}`;
  const tail = frac ? (FRAC_AFTER[fk] ?? "") : "";
  if (frac && !FRAC_AFTER[fk]) return `${num(q)} ${w.base}`;   // كسرٌ غيرُ الربع — رقمٌ صريح لا كلمةٌ كاذبة
  if (whole === 1) return frac ? `${w.base}${tail}` : w.one;
  if (whole === 2) return `${w.dual}${tail}`;
  if (whole <= 10) return `${whole} ${w.few}${tail}`;
  return `${whole} ${w.many}${tail}`;
}

/* ── القراءة: النصُّ المحفوظ والقديم ─────────────────────────────────────── */
/** تطبيعُ الطرفين: أرقامٌ شرقية ⇒ غربية (قبل مسح التشكيل — درسُ 0150)، والهمزات والتاء المربوطة،
 *  والتشكيل والتطويل، والأقواسُ (عيارُ الملغ) تُشال. */
function norm(s: string): string {
  return String(s ?? "")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660)) /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0)) /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
    .replace(/٫/g, ".").replace(/٬/g, "") /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
    .replace(/\([^)]*\)/g, " ")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, "")
    .replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي") /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
const NUMRE = "(\\d+(?:\\.\\d+)?)";
const FRAC_WORD: Record<string, number> = { "¼": 0.25, "½": 0.5, "¾": 0.75, "نص": 0.5, "نصف": 0.5, "ربع": 0.25 }; /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
const FRAC_ALT = "(¼|½|¾|نصف|نص|ربع)"; /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */

/** وحداتٌ بالقياس وأسماؤها القديمة («ml»، «cc»…)؛ الأطولُ أوّلاً («مل/لتر» قبل «مل»). */
const MEAS_ALIASES: [MeasUnit, string[]][] = [
  ["mlL", ["مل/لتر", "مل / لتر", "ml/l"]], /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  ["gL", ["غم/لتر", "غم / لتر", "غ/لتر", "g/l"]], /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  ["iu", ["وحدة دولية", "وحدات دولية", "iu", "u"]], /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  ["cm", ["سم", "cm"]], /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
  ["ml", ["مل", "ml", "cc", "سي سي"]], /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
];
/** كلماتٌ قديمةٌ للحبّة («قرص»). */
const TAB_ALIASES: Words = { base: "قرص", one: "قرص واحد", dual: "قرصين", few: "اقراص", many: "قرص" }; /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */

interface Matcher { unit: DoseUnit; re: RegExp; read: (m: RegExpExecArray) => number }
const MATCHERS: Matcher[] = (() => {
  const out: Matcher[] = [];
  for (const [unit, names] of MEAS_ALIASES) {
    const alt = names.map((n) => esc(norm(n))).join("|");
    out.push({ unit, re: new RegExp(`^${NUMRE}\\s*(?:${alt})$`), read: (m) => Number(m[1]) });
    out.push({ unit, re: new RegExp(`^${FRAC_ALT}\\s*(?:${alt})$`), read: (m) => FRAC_WORD[m[1]] });
  }
  const counts: [CountUnit, Words][] = [...(Object.entries(WORDS) as [CountUnit, Words][]), ["tab", TAB_ALIASES]];
  for (const [unit, w0] of counts) {
    const w = { base: esc(norm(w0.base)), one: esc(norm(w0.one)), dual: esc(norm(w0.dual)), few: esc(norm(w0.few)), many: esc(norm(w0.many)) };
    const tail = `(?:\\s*و\\s*${FRAC_ALT})?`; /* i18n-data: نصُّ السجلّ المحفوظ — يُقرأ ويُطابَق */
    const fr = (m: string | undefined) => (m ? FRAC_WORD[m] : 0);
    // «½ حبة»، «نص حبة»
    out.push({ unit, re: new RegExp(`^${FRAC_ALT}\\s*${w.base}$`), read: (m) => FRAC_WORD[m[1]] });
    // «حبة واحدة»
    out.push({ unit, re: new RegExp(`^${w.one}$`), read: () => 1 });
    // «حبتين»، «حبتين ونص»
    out.push({ unit, re: new RegExp(`^${w.dual}${tail}$`), read: (m) => 2 + fr(m[1]) });
    // «حبة»، «حبة ونص»
    out.push({ unit, re: new RegExp(`^${w.base}${tail}$`), read: (m) => 1 + fr(m[1]) });
    // «3 حبات ونص»، «11 حبة»، «2 حبة»، «1 و½ حبة»
    out.push({ unit, re: new RegExp(`^${NUMRE}${tail}\\s*(?:${w.few}|${w.many}|${w.base})${tail}$`), read: (m) => Number(m[1]) + fr(m[2]) + fr(m[3]) });
    // «½ 2 حبة» لا — ولا شيءَ غيرُ ما فوق.
  }
  return out;
})();

/** النصُّ ⇒ كمّيةٌ بوحدة، أو null (ما لا يُفهم يبقى نصّاً كما هو: «ملعقة شاي»). */
export function parseAmount(text: string | null | undefined): Amount | null {
  const t = norm(String(text ?? ""));
  if (!t) return null;
  for (const m of MATCHERS) {
    const r = m.re.exec(t);
    if (!r) continue;
    const qty = Number(m.read(r).toFixed(3));
    if (!Number.isFinite(qty) || qty <= 0) return null;
    return { qty, unit: m.unit };
  }
  return null;
}

/** مفتاحُ الطبلة: «1 ml» و«1 مل» و«1مل» واحد — والنصُّ الذي لا يُفهم يبقى نفسَه. */
export function amountKey(text: string | null | undefined): string {
  const p = parseAmount(text);
  return p ? `${p.qty}|${p.unit}` : String(text ?? "").trim();
}

/* ── تبديلُ الطريق ──────────────────────────────────────────────────────── */
export interface RouteSwitch { value: DoseValue; changed: null | { kind: "unit" | "form"; from: string; to: string } }

/**
 * طريقٌ جديد: بين الحقن الثلاثة (وريدي/عضلي/تحت الجلد) والوحدةُ مسموحةٌ ⇒ الرقمُ يبقى (والمضيفُ
 * يعيد فحصَ الأمان). وإلا ⇒ الوحدةُ افتراضيُّ الطريق الجديد (تحت الجلد مل ⇒ فموي حبة)، **والرقمُ
 * يُمسح** — وفموي مل ⇒ وريدي مل تغييرُ شكلٍ لا اسمُ وحدة. ولا تحويلَ أبداً (قطرة↔مل، وحدة↔مل).
 * وأوّلُ طريقٍ (لا طريقَ قبله) يُبقي كمّيةً مسموحةً وحدتُها — «المحسوبة» بورقة الطبلة.
 * `allowed`: وحداتٌ بديلةٌ عن وحدات الطريق («عين / أذن» بالمعالج).
 */
export function switchRoute(cur: DoseValue, next: DoseRoute, name?: string | null, allowed?: readonly DoseUnit[]): RouteSwitch {
  const units = allowed ? allowed.slice() : unitsFor(next, name);
  if (cur.route && INJECT.has(cur.route) && INJECT.has(next) && cur.unit && units.includes(cur.unit)) {
    return { value: { route: next, unit: cur.unit, qty: cur.qty }, changed: null };
  }
  const unit = units[0] ?? null;
  const value: DoseValue = { route: next, unit, qty: null };
  if (cur.route === next) return { value: cur, changed: null };
  if (!cur.route) {
    // أوّلُ طريق: الكمّيةُ (المحسوبة مثلاً) تبقى إن كانت وحدتُها مسموحة، وإلا تُمسح ويُقال.
    const keep = !!cur.unit && units.includes(cur.unit);
    if (keep) return { value: { route: next, unit: cur.unit, qty: cur.qty }, changed: null };
    return { value, changed: cur.unit && cur.qty != null ? { kind: "unit", from: cur.unit, to: unit ?? "" } : null };
  }
  if (unit !== cur.unit && cur.unit) return { value, changed: { kind: "unit", from: cur.unit, to: unit ?? "" } };
  if (cur.qty != null) return { value, changed: { kind: "form", from: cur.route, to: next } };
  return { value, changed: null };
}

/** وحدةٌ اختيرت بيد ⇒ الرقمُ يُمسح (لا تحويلَ بين وحدتين). */
export const pickUnit = (cur: DoseValue, unit: DoseUnit): DoseValue => (cur.unit === unit ? cur : { ...cur, unit, qty: null });

/** آخرُ جرعةٍ تُقرأ لهذا الدواء: أوّلُ صفٍّ يُفهم نصُّه (الأحدثُ أوّلاً). */
export function firstParseable(rows: readonly { amount: string | null; route?: string | null }[]): (Amount & { route: DoseRoute | null }) | null {
  for (const r of rows) {
    const a = parseAmount(r.amount);
    if (a) return { ...a, route: isDoseRoute(r.route) ? r.route : null };
  }
  return null;
}
