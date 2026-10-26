/* ============================================================================
 * نسخُ الموقع — نسخةٌ لكلّ دولةٍ عربية + إنكليزيةٌ عامّة (٢٥/١٠).
 *
 * ما يتغيّر بين النسخ (والباقي واحد): اللهجةُ (طبقةٌ فوق العربية البيضاء)، العملةُ ورمزُها
 * وخاناتُها، والسعرُ، وسطرُ الدفع. لا تحويلَ تلقائيَّ بين الدول — الرابطُ يحمل النسخة، والزائرُ
 * يرى محوِّلاً ظاهراً واقتراحاً يُغلق إن خالف جهازُه النسخةَ المفتوحة.
 *
 * ── الأسعار ───────────────────────────────────────────────────────────────
 * • العراق: الدينارُ **كما تقبضه Wayl** بالضبط — صفُّ المالك بالدينار إن ثبّته، وإلا `plan_prices`
 *   × `usd_rate` بنفس التقريب (الصفحةُ القديمة عرضت ١٥٤٬٠٠٠ والمقبوضُ ١٥٣٬٥٠٠).
 * • غيرُه: سعرٌ محلّيٌّ ثبّته المالك من لوحته (`plan_local_prices`) إن وُجد، وإلا الدولارُ الذي
 *   أقرّه (`plan_prices`). و`SUGGESTED` أدناه اقتراحٌ للوحة المشغّل وحدها («املأ المقترح») — لا
 *   يُنشر رقمٌ لم يُقرّه أحد (تدقيقٌ عدائيّ، ٢٦/١٠).
 * • عملاتٌ منهارةٌ أو مزدوجة (لبنان، سوريا، السودان، اليمن): بالدولار، كما يتعامل بها السوق.
 * ==========================================================================*/
import type { DialectId, Lang, PlanId, PlanPrice, PricingData } from "./types";
import SYMBOLS from "./data/symbols.json";

export interface Edition {
  /** المقطعُ بالرابط. */
  code: string;
  /** ISO-3166 بأحرفٍ كبيرة — ويُمرَّر للتسجيل (`?country=`) فتنضبط العملةُ ومفتاحُ الهاتف. */
  country: string | null;
  lang: Lang;
  hreflang: string;
  dialect: DialectId | null;
  currency: string;
  /** رمزُ العملة كما يُكتب محلّياً بالعربية / بالإنكليزية. */
  symAr: string;
  symEn: string;
  /** خاناتُ السعر المعروض (الدينارُ الكويتيّ بخانةٍ واحدة كما تعرضه Foodics). */
  decimals: number;
  /** الدفعُ الإلكترونيّ متاحٌ فعلاً من هذا البلد اليوم؟ (Wayl بالدينار وحده.) */
  payOnline: boolean;
  /** مناطقُ زمنيةٌ تدلّ على البلد — لاقتراح النسخة لا للتحويل. */
  tz: string[];
}

const sym = (cur: string) => (SYMBOLS as Record<string, string>)[cur] ?? cur;
const E = (code: string, country: string, dialect: DialectId | null, currency: string, tz: string[]): Edition => ({
  code, country, lang: "ar", hreflang: `ar-${country}`, dialect, currency, symAr: sym(currency), symEn: currency === "USD" ? "$" : currency, decimals: 0, payOnline: country === "IQ", tz,
});

/** الترتيبُ ترتيبُ المحوِّل: العراقُ أوّلاً (السوقُ الأوّل)، ثم الخليج، ثم الشام، ثم مصرُ والسودان، ثم المغرب العربي. */
export const EDITIONS: Edition[] = [
  E("iq", "IQ", "iq", "IQD", ["Asia/Baghdad"]),
  E("sa", "SA", "gulf", "SAR", ["Asia/Riyadh"]),
  E("ae", "AE", "gulf", "AED", ["Asia/Dubai"]),
  E("kw", "KW", "gulf", "KWD", ["Asia/Kuwait"]),
  E("qa", "QA", "gulf", "QAR", ["Asia/Qatar"]),
  E("bh", "BH", "gulf", "BHD", ["Asia/Bahrain"]),
  E("om", "OM", "gulf", "OMR", ["Asia/Muscat"]),
  E("jo", "JO", "lev", "JOD", ["Asia/Amman"]),
  E("ps", "PS", "lev", "ILS", ["Asia/Gaza", "Asia/Hebron"]),
  E("lb", "LB", "lev", "USD", ["Asia/Beirut"]),
  E("sy", "SY", "lev", "USD", ["Asia/Damascus"]),
  E("eg", "EG", "eg", "EGP", ["Africa/Cairo"]),
  E("sd", "SD", null, "USD", ["Africa/Khartoum"]),
  E("ly", "LY", null, "LYD", ["Africa/Tripoli"]),
  E("tn", "TN", null, "TND", ["Africa/Tunis"]),
  E("dz", "DZ", null, "DZD", ["Africa/Algiers"]),
  E("ma", "MA", null, "MAD", ["Africa/Casablanca", "Africa/El_Aaiun"]),
  E("mr", "MR", null, "MRU", ["Africa/Nouakchott"]),
  E("ye", "YE", null, "USD", ["Asia/Aden"]),
  { code: "en", country: null, lang: "en", hreflang: "en", dialect: null, currency: "USD", symAr: "$", symEn: "$", decimals: 0, payOnline: false, tz: [] },
];

export const EDITION_CODES = EDITIONS.map((e) => e.code);
export const editionByCode = (code: string | null | undefined): Edition | undefined => EDITIONS.find((e) => e.code === code);
/** النسخةُ التي تُرسم بها الصفحاتُ بلا نسخة (`/privacy` و`/terms`). و`x-default` لـ`/en` لا لها. */
export const DEFAULT_EDITION = "iq";

/**
 * دفترُ الأسعار الشهريّ المقترح بعملة البلد — **مقترحٌ للمالك** (دراسةُ السوق، ٢٥/١٠): الخليجُ
 * قرب التعادل لأن منافساً محلّياً بـ100 ر.س وبرامجَ محاسبةٍ بـ99–249 ر.س تسقّف الباقةَ الأولى؛
 * الأردنُّ ×0.9، فلسطينُ ×0.75، المغربُ وتونس والجزائر ×0.85، مصرُ وموريتانيا ×0.5؛ ولبنانُ
 * وسوريا والسودانُ واليمنُ بالدولار كما تتعامل أسواقُها. أرقامٌ مستديرةٌ يألفها السوق — لا
 * ١١٣ ر.س من ضرب سعر الصرف. يملأ بها المالكُ لوحتَه بضغطةٍ ثم يحفظ ما يقرّه (`plan_local_prices`)
 * — ولا يراها زائرٌ قبل ذلك (`priceFor`).
 */
export const SUGGESTED: Record<string, Record<PlanId, number>> = {
  SAR: { basic: 119, advanced: 219, super: 399 },
  AED: { basic: 119, advanced: 219, super: 399 },
  QAR: { basic: 119, advanced: 219, super: 399 },
  KWD: { basic: 10, advanced: 18, super: 32 },
  BHD: { basic: 12, advanced: 22, super: 39 },
  OMR: { basic: 12, advanced: 22, super: 39 },
  JOD: { basic: 19, advanced: 35, super: 65 },
  ILS: { basic: 69, advanced: 129, super: 239 },
  EGP: { basic: 799, advanced: 1499, super: 2799 },
  MAD: { basic: 249, advanced: 449, super: 849 },
  TND: { basic: 79, advanced: 149, super: 279 },
  DZD: { basic: 3500, advanced: 6500, super: 11900 },
  LYD: { basic: 149, advanced: 279, super: 499 },
  MRU: { basic: 599, advanced: 1099, super: 1999 },
};
export interface ShownPrice {
  currency: string;
  monthly: number;
  annual: number;
  /** ما يساويه بالدولار (لسطر «يُحسب بالدولار»). */
  usdMonthly: number;
  usdAnnual: number;
}

/** نفسُ حساب Wayl حرفاً بحرف (`wayl-create-link`): أقلُّه ألف دينار، وتقريبٌ للأقرب. */
export const iqdOf = (usd: number, rate: number) => Math.max(1000, Math.round(usd * rate));
/** وسعرُ الدينار الذي ثبّته المالك يمرّ بنفس الباب (أقلُّه ألف، بلا كسر) — Wayl تقبضه هكذا. */
const iqdPinned = (v: number) => Math.max(1000, Math.round(v));

/**
 * ما يُعرض = ما يُقبض أو ما ثبّته المالك، ولا شيءَ ثالث (تدقيقٌ عدائيّ، ٢٦/١٠):
 * • الدينار: صفُّ المالك إن وُجد (كلُّ مدّةٍ وحدها كما تقرؤها Wayl)، وإلا الدولار × سعر الصرف.
 * • عملةٌ محلّية ثبّتها المالك من لوحته: بعينها.
 * • وغيرُ ذلك الدولارُ الذي وافق عليه (`plan_prices`) — لا `SUGGESTED`: دفترٌ مقترحٌ لم يُقرّه
 *   أحد كان ينشر أسعاراً بأربعَ عشرةَ عملة، ودولاراتٍ أرخصَ للبنان وسوريا والسودان واليمن تناقض
 *   ما تطلبه شاشةُ الاشتراك. المقترحُ يبقى زرَّ «املأ المقترح» بلوحة المشغّل.
 */
export function priceFor(ed: Edition, plan: PlanId, data: PricingData): ShownPrice {
  const usd: PlanPrice = data.usd[plan];
  if (ed.currency === "IQD") {
    const local = data.local.IQD?.[plan];
    const pm = !!local && local.monthly > 0, pa = !!local && local.annual > 0;
    const monthly = pm ? iqdPinned(local!.monthly) : iqdOf(usd.monthly, data.usdRate);
    const annual = pa ? iqdPinned(local!.annual) : iqdOf(usd.annual, data.usdRate);
    // «يعادل نحو $X» لدينارٍ ثبّته المالك = المقبوضُ ÷ الصرف (كما يحفظه wayl-create-link بالطلب)، لا دولارُ
    // الجدول: ٤٥٬٠٠٠ ثابتةٌ بجانب «$30» كانت تقول إن الدينار يعادل ما لا يعادله.
    const back = (iqd: number) => Math.round((iqd / data.usdRate) * 100) / 100;
    return { currency: "IQD", monthly, annual, usdMonthly: pm ? back(monthly) : usd.monthly, usdAnnual: pa ? back(annual) : usd.annual };
  }
  // عملةٌ محلّية تُعرض حين تُثبَّت باقاتُها الثلاث معاً: باقةٌ واحدةٌ بالريال كانت تجعل جدولاً واحداً
  // بعملتين، والمحوِّلَ و«يبدأ من» يتبعان العادية وحدها. الدينارُ وحده باقةً باقة — Wayl تقبضه هكذا.
  if (localComplete(data, ed.currency)) {
    const local = data.local[ed.currency]![plan]!;
    return { currency: ed.currency, monthly: local.monthly, annual: local.annual, usdMonthly: usd.monthly, usdAnnual: usd.annual };
  }
  return { currency: "USD", monthly: usd.monthly, annual: usd.annual, usdMonthly: usd.monthly, usdAnnual: usd.annual };
}

/** باقاتُ العيادة الثلاث مثبَّتةٌ بهذه العملة — شرطُ عرضها بالموقع (والمحوِّلُ ولوحةُ المشغّل يسألانه). */
export function localComplete(data: PricingData, currency: string): boolean {
  const row = data.local[currency];
  return !!row && (["basic", "advanced", "super"] as const).every((p) => (row[p]?.monthly ?? 0) > 0 && (row[p]?.annual ?? 0) > 0);
}

/** خاناتُ الكسر التي تحملها العملة (ISO 4217): الدينارُ العراقيّ بلا كسر، والكويتيّ وأخواتُه بثلاث. */
const MINOR: Record<string, number> = { IQD: 0, KWD: 3, BHD: 3, OMR: 3, JOD: 3, LYD: 3, TND: 3 };

/** رقمٌ بأرقامٍ غربية وفواصل آلاف — سياسةُ التطبيق كلّه. `max` أكثرُ الخانات، و`decimals` أقلُّها. */
export function fmtNum(n: number, decimals = 0, max = decimals): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: Math.max(decimals, max) });
}

export function fmtPrice(ed: Edition, currency: string, n: number, decimals?: number): string {
  const sym = currency === ed.currency ? (ed.lang === "ar" ? ed.symAr : ed.symEn) : currency === "USD" ? "$" : currency;
  // سعرٌ بكسرٍ ثبّته المالك (9.5 د.ك) يُعرض بكسره لا مقرّباً لعشرة — والصحيحُ يبقى بلا خانات.
  const num = decimals !== undefined ? fmtNum(n, decimals) : fmtNum(n, currency === ed.currency ? ed.decimals : 0, MINOR[currency] ?? 2);
  if (sym === "$") return `$${num}`;
  return ed.lang === "ar" ? `${num} ${sym}` : `${sym} ${num}`;
}
