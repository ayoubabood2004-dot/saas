// ============================================================================
// أدوات المتجر الإلكتروني المشتركة بين جهة العيادة والواجهة العامة.
//
// قاعدة الرابط (slug) هنا مرآة حرفية لقيد قاعدة البيانات (0095):
// حروف إنكليزية صغيرة/أرقام/شرطات، 3–30، ما يبدي أو ينتهي بشرطة —
// حتى الفحص المحلي والرفض السحابي ما يختلفان أبداً.
// ============================================================================
import type { StoreOrderItem } from "@/types";

export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,28}[a-z0-9]$/;

/** نظّف إدخال المستخدم لصيغة slug صالحة قدر الإمكان (بلا فرض الطول). */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")      // فراغات/underscore → شرطة
    .replace(/[^a-z0-9-]/g, "")   // أي شيء غير مسموح يُحذف (العربي ينحذف — الرابط لاتيني)
    .replace(/-{2,}/g, "-")       // شرطات متتالية → واحدة
    .replace(/^-+|-+$/g, "");     // بلا شرطة بالبداية/النهاية
}

export function isValidSlug(slug: string): boolean {
  return SLUG_RE.test(slug);
}

/** الرابط العام الكامل لمتجر — يتبع دومين النشر الحالي تلقائياً. */
export function storeUrl(slug: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/s/${slug}`;
}

/** رقم هاتف زبون مقبول؟ (8–15 خانة بعد التجريد — مرآة فحص السيرفر). */
export function isValidCustomerPhone(phone: string): boolean {
  const d = phone.replace(/\D/g, "");
  return d.length >= 8 && d.length <= 15;
}

/** مجموع بنود سلة (قبل التوصيل). */
export function cartSubtotal(items: StoreOrderItem[]): number {
  return Math.round(items.reduce((s, it) => s + it.price * it.qty, 0) * 100) / 100;
}

/* ------------------- هوية بصرية للتصنيفات (بدل الصور حالياً) -------------------
 * المنتجات بلا صور بعد — فنعطي كل تصنيف شخصية لونية وإيموجي واضح حتى تبقى
 * البطاقات حية وجذابة. لما تنضاف الصور لاحقاً هذي تصير الحالة الاحتياطية. */
export interface CategoryLook { emoji: string; label: string; grad: string }

// المفاتيح = قيم ProductCategory الفعلية (src/types) حتى كل منتج ياخذ شخصيته.
const LOOKS: Record<string, CategoryLook> = {
  medicine:    { emoji: "💊", label: "أدوية",       grad: "from-rose-400/25 to-orange-300/25" },
  food:        { emoji: "🍖", label: "أغذية",       grad: "from-amber-400/25 to-yellow-300/25" },
  accessories: { emoji: "🧸", label: "مستلزمات",    grad: "from-sky-400/25 to-indigo-300/25" },
  consumables: { emoji: "🧴", label: "مستهلكات",    grad: "from-violet-400/25 to-fuchsia-300/25" },
  other:       { emoji: "🛍️", label: "منوعات",     grad: "from-emerald-400/25 to-teal-300/25" },
};
const FALLBACK: CategoryLook = { emoji: "🐾", label: "منتجات", grad: "from-brand-400/25 to-accent-300/25" };

export function categoryLook(category?: string | null): CategoryLook {
  return (category && LOOKS[category]) || FALLBACK;
}

/** رقم طلب للوضع التجريبي (السيرفر يولد ماله بنفس الشكل). */
export function demoOrderNo(): string {
  let s = "";
  const chars = "0123456789ABCDEF";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SO-${s}`;
}
