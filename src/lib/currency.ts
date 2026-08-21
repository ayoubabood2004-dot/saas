/* ============================================================================
 * currency.ts — العملات والدول: قلب نظام «كل عيادة بعملتها».
 *
 * ثلاث مهام بملف واحد بلا أي استيراد من بقية المكتبة (حتى لا تنشأ حلقة
 * استيراد مع utils.ts الذي يستورده الجميع):
 *
 *   ١) كتالوج الدول والعملات: الدولة تُختار مرة واحدة عند إنشاء الحساب،
 *      ومنها تُشتق العملة ورمز الاتصال — فيشتغل النظام داخلياً بالريال
 *      السعودي أو الدرهم أو أي عملة أخرى بنفس ما يشتغل بالدينار.
 *   ٢) العملة النشطة: utils.currencySymbol() يقرأها من هنا. تُضبط من
 *      settings.ts (تفضيلات العيادة المتزامنة سحابياً)، ولها قراءة كسولة من
 *      مرآة localStorage حتى تصح أول لوحة تُرسم قبل اكتمال الـhydration.
 *   ٣) صرف صفحة الهبوط: زائر من أي دولة يشوف الأسعار بعملته المحلية —
 *      تخمين الدولة من لغة المتصفح/منطقته الزمنية، وأسعار صرف حيّة (مع
 *      جدول ثابت احتياطي فلا تعتمد الصفحة على الشبكة أبداً).
 * ==========================================================================*/
import { DEFAULT_USD_RATE } from "./plans";

export interface CurrencyInfo {
  code: string;   // ISO 4217
  symAr: string;  // الرمز بالعربي («ر.س»)
  nameAr: string; // الاسم الكامل («ريال سعودي»)
  /** سعر صرف ثابت احتياطي: 1 دولار = كم من هذه العملة. */
  usdRate: number;
  /** عملات الأجزاء الثلاثة (دينار كويتي/بحريني/عماني) تُعرض بكسر واحد. */
  frac?: boolean;
}

export const CURRENCIES: Record<string, CurrencyInfo> = {
  IQD: { code: "IQD", symAr: "د.ع", nameAr: "دينار عراقي", usdRate: DEFAULT_USD_RATE },
  SAR: { code: "SAR", symAr: "ر.س", nameAr: "ريال سعودي", usdRate: 3.75 },
  AED: { code: "AED", symAr: "د.إ", nameAr: "درهم إماراتي", usdRate: 3.67 },
  KWD: { code: "KWD", symAr: "د.ك", nameAr: "دينار كويتي", usdRate: 0.31, frac: true },
  QAR: { code: "QAR", symAr: "ر.ق", nameAr: "ريال قطري", usdRate: 3.64 },
  BHD: { code: "BHD", symAr: "د.ب", nameAr: "دينار بحريني", usdRate: 0.376, frac: true },
  OMR: { code: "OMR", symAr: "ر.ع", nameAr: "ريال عماني", usdRate: 0.385, frac: true },
  JOD: { code: "JOD", symAr: "د.أ", nameAr: "دينار أردني", usdRate: 0.709, frac: true },
  EGP: { code: "EGP", symAr: "ج.م", nameAr: "جنيه مصري", usdRate: 50 },
  LBP: { code: "LBP", symAr: "ل.ل", nameAr: "ليرة لبنانية", usdRate: 89500 },
  SYP: { code: "SYP", symAr: "ل.س", nameAr: "ليرة سورية", usdRate: 13000 },
  YER: { code: "YER", symAr: "ر.ي", nameAr: "ريال يمني", usdRate: 530 },
  ILS: { code: "ILS", symAr: "₪", nameAr: "شيكل", usdRate: 3.65 },
  LYD: { code: "LYD", symAr: "د.ل", nameAr: "دينار ليبي", usdRate: 4.85 },
  TND: { code: "TND", symAr: "د.ت", nameAr: "دينار تونسي", usdRate: 3.1, frac: true },
  DZD: { code: "DZD", symAr: "د.ج", nameAr: "دينار جزائري", usdRate: 134 },
  MAD: { code: "MAD", symAr: "د.م", nameAr: "درهم مغربي", usdRate: 10 },
  SDG: { code: "SDG", symAr: "ج.س", nameAr: "جنيه سوداني", usdRate: 600 },
  TRY: { code: "TRY", symAr: "₺", nameAr: "ليرة تركية", usdRate: 41 },
  USD: { code: "USD", symAr: "$", nameAr: "دولار أمريكي", usdRate: 1 },
  EUR: { code: "EUR", symAr: "€", nameAr: "يورو", usdRate: 0.92 },
  GBP: { code: "GBP", symAr: "£", nameAr: "جنيه إسترليني", usdRate: 0.79 },
};

export interface CountryInfo {
  code: string;  // ISO 3166-1 alpha-2
  nameAr: string;
  flag: string;
  dial: string;
  cur: string;   // عملة الدولة (مفتاح CURRENCIES)
}

/** الدول المعروضة عند إنشاء الحساب — العراق أولاً ثم الجوار، ثم «أخرى». */
export const COUNTRIES: CountryInfo[] = [
  { code: "IQ", nameAr: "العراق", flag: "🇮🇶", dial: "+964", cur: "IQD" },
  { code: "SA", nameAr: "السعودية", flag: "🇸🇦", dial: "+966", cur: "SAR" },
  { code: "AE", nameAr: "الإمارات", flag: "🇦🇪", dial: "+971", cur: "AED" },
  { code: "KW", nameAr: "الكويت", flag: "🇰🇼", dial: "+965", cur: "KWD" },
  { code: "QA", nameAr: "قطر", flag: "🇶🇦", dial: "+974", cur: "QAR" },
  { code: "BH", nameAr: "البحرين", flag: "🇧🇭", dial: "+973", cur: "BHD" },
  { code: "OM", nameAr: "عُمان", flag: "🇴🇲", dial: "+968", cur: "OMR" },
  { code: "JO", nameAr: "الأردن", flag: "🇯🇴", dial: "+962", cur: "JOD" },
  { code: "EG", nameAr: "مصر", flag: "🇪🇬", dial: "+20", cur: "EGP" },
  { code: "LB", nameAr: "لبنان", flag: "🇱🇧", dial: "+961", cur: "LBP" },
  { code: "SY", nameAr: "سوريا", flag: "🇸🇾", dial: "+963", cur: "SYP" },
  { code: "YE", nameAr: "اليمن", flag: "🇾🇪", dial: "+967", cur: "YER" },
  { code: "PS", nameAr: "فلسطين", flag: "🇵🇸", dial: "+970", cur: "ILS" },
  { code: "LY", nameAr: "ليبيا", flag: "🇱🇾", dial: "+218", cur: "LYD" },
  { code: "TN", nameAr: "تونس", flag: "🇹🇳", dial: "+216", cur: "TND" },
  { code: "DZ", nameAr: "الجزائر", flag: "🇩🇿", dial: "+213", cur: "DZD" },
  { code: "MA", nameAr: "المغرب", flag: "🇲🇦", dial: "+212", cur: "MAD" },
  { code: "SD", nameAr: "السودان", flag: "🇸🇩", dial: "+249", cur: "SDG" },
  { code: "TR", nameAr: "تركيا", flag: "🇹🇷", dial: "+90", cur: "TRY" },
  { code: "US", nameAr: "أمريكا", flag: "🇺🇸", dial: "+1", cur: "USD" },
  { code: "GB", nameAr: "بريطانيا", flag: "🇬🇧", dial: "+44", cur: "GBP" },
  { code: "EU", nameAr: "أوروبا (اليورو)", flag: "🇪🇺", dial: "+", cur: "EUR" },
  { code: "XX", nameAr: "دولة أخرى", flag: "🌍", dial: "+", cur: "USD" },
];

export const countryByCode = (code: string): CountryInfo | undefined =>
  COUNTRIES.find((c) => c.code === code.toUpperCase());

export const currencyInfo = (code: string): CurrencyInfo =>
  CURRENCIES[code.toUpperCase()] ?? CURRENCIES.USD;

/* ── الأسماء بلغة القارئ ────────────────────────────────────────────────────
 * أسماء الدول والعملات أعلاه عربيةٌ فقط، وهي تظهر بأول حقلٍ يواجه من يفتح
 * حساباً. فمن يقرأ الصفحة بالإنجليزية كان يرى «العراق» بقائمةٍ إنجليزية.
 * والحلّ ليس جدول ترجمةٍ نصونه بأنفسنا: المتصفّح يحمل هذه الأسماء بكل لغةٍ
 * أصلاً (Intl.DisplayNames) — فنسأله، ونرجع للعربية إن لم يعرف.
 * (EU وXX ليستا رمزَي دولة، فتبقيان على أسمائهما المكتوبة.) */
const nameCache = new Map<string, string>();

function displayName(kind: "region" | "currency", code: string, lang: string, fallback: string): string {
  const key = `${kind}:${code}:${lang}`;
  const hit = nameCache.get(key);
  if (hit) return hit;
  let out = fallback;
  try {
    const dn = new Intl.DisplayNames([lang], { type: kind });
    out = dn.of(code) || fallback;
    // بعض الرموز يرجعها المتصفّح كما هي حين يجهلها — الاسم العربي أوضح حينها.
    if (out === code) out = fallback;
  } catch { /* لغةٌ أو رمزٌ لا يعرفه المتصفّح — الاحتياط قائم */ }
  nameCache.set(key, out);
  return out;
}

/** اسم الدولة بلغة الواجهة. */
export function countryName(c: CountryInfo, lang: string): string {
  if (c.code.length !== 2 || c.code === "EU" || c.code === "XX") return c.nameAr;
  return displayName("region", c.code, lang, c.nameAr);
}

/** اسم العملة بلغة الواجهة («دينار عراقي» / «Iraqi Dinar»). */
export function currencyName(code: string, lang: string): string {
  const info = currencyInfo(code);
  return displayName("currency", info.code, lang, info.nameAr);
}

/* ---------------- العملة النشطة (عملة العيادة الحالية) ----------------------
 * تُضبط من settings.ts عند كل hydration/تعديل. القراءة الأولى قبل أي ضبط
 * تلتقط مرآة تفضيلات العيادة من localStorage مباشرة (نفس مفاتيح settings.ts
 * لكن بلا استيراده) — فلا تومض الواجهة بالدينار عند إقلاع عيادة سعودية. */
let active: string | null = null;

export function setActiveCurrency(code: string | null | undefined) {
  active = (code || "IQD").toUpperCase();
}

export function getActiveCurrency(): string {
  if (active) return active;
  try {
    const id = localStorage.getItem("vp_active_clinic");
    const keys: string[] = [];
    if (id) keys.push(`vp_clinic_prefs_${id}`);
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("vp_clinic_prefs_") && !k.includes("pending") && !keys.includes(k)) keys.push(k);
    }
    for (const k of keys) {
      const raw = localStorage.getItem(k);
      if (!raw) continue;
      const c = (JSON.parse(raw) as { currency?: string | null })?.currency;
      if (c) { active = c.toUpperCase(); return active; }
    }
  } catch { /* ignore */ }
  active = "IQD";
  return active;
}

/* ---------------- صرف صفحة الهبوط: تخمين الدولة + أسعار حيّة ---------------- */

/** المنطقة الزمنية → دولة (المدن التي لا تكشفها لغة المتصفح عادة). */
const TZ_COUNTRY: Record<string, string> = {
  "Asia/Baghdad": "IQ", "Asia/Riyadh": "SA", "Asia/Dubai": "AE", "Asia/Kuwait": "KW",
  "Asia/Qatar": "QA", "Asia/Bahrain": "BH", "Asia/Muscat": "OM", "Asia/Amman": "JO",
  "Africa/Cairo": "EG", "Asia/Beirut": "LB", "Asia/Damascus": "SY", "Asia/Aden": "YE",
  "Asia/Gaza": "PS", "Asia/Hebron": "PS", "Africa/Tripoli": "LY", "Africa/Tunis": "TN",
  "Africa/Algiers": "DZ", "Africa/Casablanca": "MA", "Africa/Khartoum": "SD",
  "Europe/Istanbul": "TR", "Europe/London": "GB",
};

/** تخمين دولة الزائر: منطقة اللغة (ar-SA) أولاً، ثم المنطقة الزمنية. */
export function guessCountry(): CountryInfo | null {
  try {
    for (const lang of navigator.languages ?? [navigator.language]) {
      const region = /-([A-Za-z]{2})\b/.exec(lang ?? "")?.[1];
      if (region) { const c = countryByCode(region); if (c) return c; }
    }
  } catch { /* ignore */ }
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
    const cc = TZ_COUNTRY[tz];
    if (cc) return countryByCode(cc) ?? null;
    if (tz.startsWith("America/")) return countryByCode("US") ?? null;
    if (tz.startsWith("Europe/")) return countryByCode("EU") ?? null;
  } catch { /* ignore */ }
  return null;
}

const FX_KEY = "vp_fx_v1";
type FxCache = { t: number; r: Record<string, number> };

/** أسعار صرف حيّة (تُجدَّد يومياً وتُخزَّن محلياً). فشل الشبكة = null بصمت —
 *  الجدول الثابت أعلاه يغطي، فالصفحة لا تنتظر ولا تنكسر أبداً. */
export async function fetchLiveRates(): Promise<Record<string, number> | null> {
  let cached: FxCache | null = null;
  try { cached = JSON.parse(localStorage.getItem(FX_KEY) ?? "null") as FxCache | null; } catch { /* ignore */ }
  if (cached && Date.now() - cached.t < 86_400_000) return cached.r;
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(6000) });
    const j = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (j?.result === "success" && j.rates) {
      try { localStorage.setItem(FX_KEY, JSON.stringify({ t: Date.now(), r: j.rates } satisfies FxCache)); } catch { /* ignore */ }
      return j.rates;
    }
  } catch { /* ignore — الجدول الثابت يغطي */ }
  return cached?.r ?? null;
}

/** سعر الصرف الفعلي لعملة: الدينار يتبع سعر المنصّة (نفس ما يُدفع فعلاً عبر
 *  Wayl) لا السعر الرسمي، والبقية السعر الحي إن وُجد وإلا الثابت. */
export function rateFor(cur: string, live?: Record<string, number> | null): number {
  const info = currencyInfo(cur);
  if (info.code === "IQD") return info.usdRate;
  const lv = live?.[info.code];
  return lv && lv > 0 ? lv : info.usdRate;
}

/** تحويل سعر دولاري لعملة محلية برقم «نظيف» يليق بصفحة تسعير:
 *  عملات الأجزاء بكسر واحد، والمبالغ الكبيرة تُقرَّب لأقرب ٥٠٠/١٠٠٠. */
export function usdTo(usd: number, cur: string, live?: Record<string, number> | null): number {
  const v = usd * rateFor(cur, live);
  if (currencyInfo(cur).frac) return Math.round(v * 10) / 10;
  if (v >= 100_000) return Math.round(v / 1000) * 1000;
  if (v >= 10_000) return Math.round(v / 500) * 500;
  if (v >= 1_000) return Math.round(v / 50) * 50;
  return Math.round(v);
}
