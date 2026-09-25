import type { Product } from "@/types";
import { localISO } from "@/lib/utils";

/* ============================================================================
 * الانتهاء — قاعدةٌ واحدة لكلّ شاشة (م١، docs/expiry-plan.md).
 *
 * ── لماذا وحدةٌ واحدة ────────────────────────────────────────────────────
 * كان «كم يوم باقي» يُحسب بثلاث طرقٍ تعطي ثلاثة أجوبة: شاشةُ المخزون تقسم فرقَ
 * منتصفِ ليلٍ **بتوقيت غرينتش** فتعدّ المادةَ منتهيةً يومَ انتهائها من الساعة ٣
 * فجراً ببغداد، وورقةُ الجرد تقارن بـ«اليوم» الغرينتشيّ فتقول «قرب الانتهاء»
 * لنفس المادة، و`utils.daysUntil` يقرّب للأعلى. فمادةٌ واحدةٌ حمراءُ بالشاشة
 * صفراءُ بالورقة — وكارتُ الرئيسية يعدّ ٧ والقائمةُ التي يفتحها تعرض ٦.
 *
 * فالقاعدةُ هنا، وكلُّ الشاشات تقرؤها:
 *   • `expiry_date` **آخرُ يومٍ صالح**: منتهيةٌ من اليوم التالي — وهو ما قاسته
 *     القاعدةُ (`expiry_date < current_date`) حين قالت «٢٧ منتهية».
 *   • الأيامُ تقويميّةٌ بتاريخ الجهاز المحلّيّ (`localISO`) لا بالساعة.
 *   • «على الرفّ» = رصيدٌ موجب: المنتهي برصيد صفر ليس خسارة، ولا يُعدّ.
 *
 * نقيّةٌ عمداً: لا i18n على مستوى الوحدة ولا إعدادات — المُددُ تُمرَّر
 * (`getExpiryWindows()` بـsettings.ts)، والنصوصُ بـ`t` يمرّره المستدعي.
 * ========================================================================= */

/** مُدّتا التنبيه بالأيام (إعدادُ العيادة، `clinic_prefs` 0210). */
export interface ExpiryWindows { returnDays: number; criticalDays: number }
export const EXPIRY_DEFAULTS: ExpiryWindows = { returnDays: 90, criticalDays: 30 };

const YMD = /^(\d{4})-(\d{2})-(\d{2})/;

/** الأيامُ حتى آخر يومٍ صالح: 0 = اليومَ آخرُ يوم، -1 = انتهت أمس، null = بلا تاريخ. */
export function daysToExpiry(expiry: string | null | undefined, todayISO: string = localISO()): number | null {
  const e = YMD.exec(String(expiry ?? ""));
  const t = YMD.exec(todayISO);
  if (!e || !t) return null;
  const at = Date.UTC(+e[1], +e[2] - 1, +e[3]);
  const now = Date.UTC(+t[1], +t[2] - 1, +t[3]);
  return Math.round((at - now) / 86400000);
}

/** expired: فات · critical: ≤ الحرجة · return: ≤ مدة الإرجاع · null: بعيدةٌ أو بلا تاريخ. */
export type ExpiryState = "expired" | "critical" | "return" | null;

export function expiryState(expiry: string | null | undefined, w: ExpiryWindows, todayISO: string = localISO()): ExpiryState {
  const d = daysToExpiry(expiry, todayISO);
  if (d == null) return null;
  if (d < 0) return "expired";
  if (d <= w.criticalDays) return "critical";
  if (d <= w.returnDays) return "return";
  return null;
}

/** على الرفّ فعلاً: رصيدٌ موجبٌ بصفّه (المجمَّعُ رصيدُه بصنفه — صفرٌ من الإنتاج اليوم). */
export const onShelf = (p: Pick<Product, "stock" | "pooled">): boolean => !p.pooled && (Number(p.stock) || 0) > 0;

/**
 * مكتوم؟ `expiry_ack` يحفظ **التاريخَ** الذي قرّر فيه المالكُ «عرفت» — فالكتمُ
 * يسري ما دام التاريخُ نفسَه، وأيُّ تغييرٍ له (شراءُ وجبةٍ جديدة، تعديل، طيّ)
 * يرفعه بلا محفّزٍ ولا منطقٍ إضافيّ. والطرفان يُقصّان لعشرة أحرف: التجريبيُّ قد
 * يخزّن تاريخاً أطول، والمقارنةُ بطرفٍ مطبَّعٍ وحدَه تفشل بصمت.
 */
export function isExpiryMuted(p: Pick<Product, "expiry_date" | "expiry_ack">): boolean {
  const ack = YMD.exec(String(p.expiry_ack ?? ""))?.[0];
  return !!ack && ack === YMD.exec(String(p.expiry_date ?? ""))?.[0];
}

/** قيمةُ ما على الرفّ بسعر الشراء — ما يضيع إن انتهى ولم يُرجَع. */
export const expiryCost = (p: Pick<Product, "stock" | "pooled" | "purchase_price">): number =>
  onShelf(p) ? (Number(p.stock) || 0) * (Number(p.purchase_price) || 0) : 0;

/**
 * سلّةُ المادة — **التعريفُ الوحيد** الذي تعدّ به البطاقةُ وتُرشّح به الشريحةُ ويحسب
 * به كارتُ الرئيسية: expired (على الرفّ، فات، غيرُ مكتومة) · window (0..مدة الإرجاع،
 * غيرُ مكتومة) · muted (مكتومةٌ داخل المدة أو فائتة) · null (بعيدةٌ، بلا تاريخ، أو ليست
 * على الرفّ). كارتٌ يقول ٧ وقائمةٌ تفتح على ٦ لأن الشرطَ كُتب مرّتين = رقمٌ يُصدَّق كاذباً.
 */
export type ExpiryBucket = "expired" | "window" | "muted" | null;
export function expiryBucket(p: Product, w: ExpiryWindows, todayISO: string = localISO()): ExpiryBucket {
  if (!onShelf(p)) return null;
  const d = daysToExpiry(p.expiry_date, todayISO);
  if (d == null || d > w.returnDays) return null;
  if (isExpiryMuted(p)) return "muted";
  return d < 0 ? "expired" : "window";
}

export interface ExpiryWatch {
  /** منتهيةٌ على الرفّ، غيرُ مكتومة — خسارةٌ إلا أن تُرجَع. */
  expired: Product[];
  /** داخل مدة الإرجاع (0..returnDays) على الرفّ وغيرُ مكتومة — الأقربُ أولاً. */
  window: Product[];
  /** منها: ≤ الحرجة. */
  critical: Product[];
  /** منها: دخلت المدةَ خلال آخر سبعة أيام. */
  newThisWeek: Product[];
  /** مكتومةٌ داخل المدة أو منتهية — تُعرض باهتةً لا تُعدّ. */
  muted: Product[];
  expiredValue: number;
  windowValue: number;
}

/** يمرّ على القائمة مرّةً واحدة — كارتُ الرئيسية وبطاقةُ المخزون وفلاترُه من هنا. */
export function expiryWatch(products: Product[], w: ExpiryWindows, todayISO: string = localISO()): ExpiryWatch {
  const out: ExpiryWatch = { expired: [], window: [], critical: [], newThisWeek: [], muted: [], expiredValue: 0, windowValue: 0 };
  const days = new Map<string, number>();
  for (const p of products) {
    const b = expiryBucket(p, w, todayISO);
    if (!b) continue;
    const d = daysToExpiry(p.expiry_date, todayISO) as number;
    days.set(p.id, d);
    if (b === "muted") { out.muted.push(p); continue; }
    if (b === "expired") { out.expired.push(p); out.expiredValue += expiryCost(p); continue; }
    out.window.push(p);
    out.windowValue += expiryCost(p);
    if (d <= w.criticalDays) out.critical.push(p);
    if (d > w.returnDays - 7) out.newThisWeek.push(p);
  }
  const near = (a: Product, b: Product) => (days.get(a.id) ?? 0) - (days.get(b.id) ?? 0) || a.name.localeCompare(b.name);
  for (const list of [out.expired, out.window, out.critical, out.newThisWeek, out.muted]) list.sort(near);
  return out;
}

type T = (key: string, opts?: Record<string, unknown>) => string;

/**
 * قائمةٌ تُلصق بواتساب المندوب (٢·٣) — مجمَّعةً بالشركة لأن المندوبَ يجي لشركته.
 * الاسمُ والعددُ وآخرُ يومٍ صالح، **بلا أسعار**: الكلفةُ سرُّ العيادة لا نصُّ رسالة.
 * التاريخُ رقميٌّ بالسنة (2026/10/15) — «أكتوبر» بلا سنةٍ يلتبس بين وجبتين.
 */
export function returnListText(rows: Product[], companyOf: (p: Product) => string, t: T, todayISO: string = localISO()): string {
  const groups = new Map<string, Product[]>();
  for (const p of rows) {
    const c = companyOf(p).trim() || t("expiry.noCompany");
    groups.set(c, [...(groups.get(c) ?? []), p]);
  }
  const lines = [t("expiry.listHead", { date: todayISO.replace(/-/g, "/"), n: rows.length })];
  for (const [company, ps] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push("", `*${company}*`);
    for (const p of ps) {
      lines.push(t("expiry.listLine", {
        name: p.name,
        qty: (Number(p.stock) || 0).toLocaleString("en-US", { maximumFractionDigits: 3 }),
        date: String(p.expiry_date ?? "").slice(0, 10).replace(/-/g, "/"),
      }));
    }
  }
  return lines.join("\n");
}
