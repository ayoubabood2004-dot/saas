import type { Product, Company, CompanySection } from "@/types";
import i18n from "@/i18n";

/* ============================================================================
 * stocktake — حساب جرد المخزون. مصدرٌ واحد، ومخرجان.
 *
 * ── لماذا وحدةٌ مستقلة ───────────────────────────────────────────────────
 * الجرد يخرج ورقةً تُملأ بالقلم وملفَّ إكسل يُملأ بلوحة المفاتيح. ولو حسب كلٌّ
 * منهما أرقامه بنفسه لانفرقا يوماً — سطرٌ يُرتَّب هنا وليس هناك، أو مخزونٌ
 * مجمّع يُقيَّم بطريقتين — فيقف أمين المخزن أمام ورقتين تختلفان ولا يدري
 * أيّهما يصدّق. فالحساب كلّه هنا مرّةً واحدة، والمخرجان **يعرضان** ولا
 * يحسبان.
 *
 * ── الوقت وسيطٌ لا يُقرأ ─────────────────────────────────────────────────
 * «قرب الانتهاء» و«منتهي الصلاحية» تتعلّقان بلحظةٍ بعينها، فتُمرَّر اللحظة
 * وسيطاً. وهذا ليس ترفاً اختبارياً: الجرد **لقطةٌ بلحظة**، وكل بيعٍ يقع بعدها
 * لا يظهر بالورقة — ومن لم يعرف ساعة اللقطة اتّهم أمين المخزن بفارقٍ سببه
 * زبونٌ اشترى أثناء العدّ.
 * ==========================================================================*/

/** حدُّ التنبيه الافتراضي حين لا يضع المنتج حدّه الأدنى بنفسه. */
export const LOW_STOCK = 5;
export const lowThreshold = (p: Product): number =>
  (p.min_stock && p.min_stock > 0 ? p.min_stock : LOW_STOCK);

/** حالاتٌ تُلفت نظر العادّ. الترتيب هنا هو ترتيب عرضها. */
export type StockFlag = "pooled" | "out" | "low" | "expired" | "expiring";

/** سطرٌ واحد بورقة الجرد — منتجٌ بباركوده، أو مخزونُ صنفٍ مجمّع بلا باركود. */
export interface StocktakeLine {
  kind: "product" | "pool";
  /** تسلسلٌ متّصل عبر الورقة كلها. أسطر المخزون المجمّع بلا تسلسل — ليست منتجاً. */
  seq: number | null;
  productId: string | null;
  barcode: string | null;
  name: string;
  companyName: string;
  sectionName: string;
  category: string | null;
  /** الأسعار **بلا تقريب**: تقريب ٦٫٥ إلى ٧ يضرب في العدد فيصير فرقاً وهمياً. */
  buy: number;
  sell: number;
  /** العدد بالنظام. الباركود المجمّع صفرٌ دائماً — عدّه بصنفه لا به. */
  systemQty: number;
  cost: number;
  retail: number;
  minStock: number | null;
  expiry: string | null;
  /** أيامٌ حتى النفاذ (سالبٌ = انتهى). null حين لا تاريخ. */
  daysToExpiry: number | null;
  subUnit: { name: string; perBox: number; price: number } | null;
  flags: StockFlag[];
  /** سطرٌ مقيَّمٌ بمتوسط أسعار الصنف لا بسعره — تقديرٌ لا رقمٌ قاطع. */
  approx: boolean;
}

export interface StockTotals { products: number; units: number; cost: number; retail: number }

export interface StocktakeGroup {
  companyName: string;
  sectionName: string;
  lines: StocktakeLine[];
  totals: StockTotals;
}

export interface Stocktake {
  /** لحظة اللقطة — تُطبع على المخرجين، ويُقاس بها «قرب الانتهاء». */
  takenAt: Date;
  groups: StocktakeGroup[];
  totals: StockTotals;
  /** ما منه تقديريٌّ من الإجمالي — يُعلن صراحةً بدل أن يختبئ داخله. */
  pooled: { units: number; cost: number; retail: number };
}

const zero = (): StockTotals => ({ products: 0, units: 0, cost: 0, retail: 0 });
const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);

/** أيامٌ حتى تاريخ النفاذ بالنسبة للحظة اللقطة. */
function daysTo(expiry: string | null | undefined, now: Date): number | null {
  if (!expiry) return null;
  return Math.floor((new Date(expiry).getTime() - now.getTime()) / 86400000);
}

function flagsOf(p: Product, days: number | null, todayISO: string): StockFlag[] {
  const out: StockFlag[] = [];
  if (p.pooled) out.push("pooled");
  else if ((p.stock || 0) <= 0) out.push("out");
  else if ((p.stock || 0) <= lowThreshold(p)) out.push("low");
  if (p.expiry_date) {
    if (p.expiry_date.slice(0, 10) < todayISO) out.push("expired");
    else if (days != null && days <= 30) out.push("expiring");
  }
  return out;
}

/**
 * يبني ورقة الجرد كاملةً: مجموعاتٍ ومجاميع.
 *
 * الترتيب هو ترتيب المشي بين الرفوف كما نظّمتها العيادة: شركة ← صنف ←
 * منتجاتٌ بحروفها، ثم «بدون صنف» لكل شركة، ثم «بدون شركة» آخراً. ولكل صنفٍ
 * مخزونٌ مجمّع يُذيَّل به صنفه سطراً قائماً بذاته — لأن عدّه يقع على الرفّ
 * نفسه، وإخفاؤه يجعل الإجمالي يكذب.
 */
export function buildStocktake(
  products: Product[],
  companies: Company[],
  sections: CompanySection[],
  now: Date = new Date(),
): Stocktake {
  const todayISO = new Date().toISOString().slice(0, 10);
  const totals = zero();
  const pooled = { units: 0, cost: 0, retail: 0 };
  let seq = 0;

  const lineOf = (p: Product, companyName: string, sectionName: string): StocktakeLine => {
    seq += 1;
    const qty = p.pooled ? 0 : (p.stock || 0);
    const buy = p.purchase_price || 0;
    const sell = p.sell_price || 0;
    const days = daysTo(p.expiry_date, now);
    return {
      kind: "product",
      seq,
      productId: p.id,
      barcode: p.barcode ?? null,
      name: p.name,
      companyName,
      sectionName,
      category: p.category ?? null,
      buy, sell,
      systemQty: qty,
      cost: qty * buy,
      retail: qty * sell,
      minStock: p.min_stock ?? null,
      expiry: p.expiry_date ? p.expiry_date.slice(0, 10) : null,
      daysToExpiry: days,
      subUnit: p.has_sub_unit && (p.units_per_box ?? 0) > 0
        ? { name: p.sub_unit_name || "", perBox: p.units_per_box || 0, price: p.sub_unit_price || 0 }
        : null,
      flags: flagsOf(p, days, todayISO),
      approx: false,
    };
  };

  /** سطر المخزون المجمّع لصنفٍ — مقيَّمٌ بمتوسط أسعار باركوداته. */
  const poolLineOf = (sec: CompanySection, inSec: Product[], companyName: string): StocktakeLine | null => {
    const pool = sec.pooled_stock || 0;
    if (pool <= 0 || inSec.length === 0) return null;
    const avgBuy = inSec.reduce((s, p) => s + (p.purchase_price || 0), 0) / inSec.length;
    const avgSell = inSec.reduce((s, p) => s + (p.sell_price || 0), 0) / inSec.length;
    return {
      kind: "pool",
      seq: null,
      productId: null,
      barcode: null,
      name: i18n.t("stock.poolLine", "مخزون مجمّع للصنف (غير موزّع على الباركودات)"),
      companyName,
      sectionName: sec.name,
      category: null,
      buy: avgBuy, sell: avgSell,
      systemQty: pool,
      cost: pool * avgBuy,
      retail: pool * avgSell,
      minStock: null,
      expiry: null,
      daysToExpiry: null,
      subUnit: null,
      flags: ["pooled"],
      approx: true,
    };
  };

  /** يضمّ سطراً لمجاميع مجموعته وللمجاميع الكبرى معاً — بحسابٍ واحد لا اثنين. */
  const tally = (line: StocktakeLine, sub: StockTotals) => {
    if (line.kind === "product") { sub.products += 1; totals.products += 1; }
    else { pooled.units += line.systemQty; pooled.cost += line.cost; pooled.retail += line.retail; }
    sub.units += line.systemQty; sub.cost += line.cost; sub.retail += line.retail;
    totals.units += line.systemQty; totals.cost += line.cost; totals.retail += line.retail;
  };

  const groups: StocktakeGroup[] = [];
  const push = (companyName: string, sectionName: string, lines: StocktakeLine[]) => {
    if (!lines.length) return;
    const sub = zero();
    for (const l of lines) tally(l, sub);
    groups.push({ companyName, sectionName, lines, totals: sub });
  };

  for (const co of [...companies].sort(byName)) {
    const mine = products.filter((p) => p.company_id === co.id);
    const coSections = sections.filter((s) => s.company_id === co.id).sort(byName);
    for (const sec of coSections) {
      const inSec = mine.filter((p) => p.section_id === sec.id).sort(byName);
      if (inSec.length === 0 && (sec.pooled_stock || 0) <= 0) continue;
      const lines = inSec.map((p) => lineOf(p, co.name, sec.name));
      const pl = poolLineOf(sec, inSec, co.name);
      if (pl) lines.push(pl);
      push(co.name, sec.name, lines);
    }
    const loose = mine.filter((p) => !p.section_id).sort(byName);
    const noSec = i18n.t("stock.noSection", "بدون صنف");
    if (loose.length) push(co.name, noSec, loose.map((p) => lineOf(p, co.name, noSec)));
  }
  const unfiled = products.filter((p) => !p.company_id).sort(byName);
  const noCo = i18n.t("stock.noCompany", "بدون شركة");
  if (unfiled.length) push(noCo, "", unfiled.map((p) => lineOf(p, noCo, "")));

  return { takenAt: now, groups, totals, pooled };
}

/** كل الأسطر بترتيب الورقة — لمخرجٍ مسطَّح (إكسل) يفرزه المستخدم بنفسه. */
export const flatLines = (s: Stocktake): StocktakeLine[] => s.groups.flatMap((g) => g.lines);

/** أسماء الحالات — تُقرأ عند العرض فتتبع اللغة، وتُفصل بنقطة كما بورقة الطباعة. */
export const flagLabel = (f: StockFlag): string => {
  switch (f) {
    case "pooled": return i18n.t("stock.fPooled", "مجمّع");
    case "out": return i18n.t("stock.fOut", "نافد");
    case "low": return i18n.t("stock.fLow", "منخفض");
    case "expired": return i18n.t("stock.fExpired", "منتهي الصلاحية");
    default: return i18n.t("stock.fExpiring", "قرب الانتهاء");
  }
};
export const flagsText = (flags: StockFlag[]): string => flags.map(flagLabel).join(" · ");
