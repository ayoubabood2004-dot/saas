// ============================================================================
// أدوات المتجر الإلكتروني المشتركة بين جهة العيادة والواجهة العامة.
//
// قاعدة الرابط (slug) هنا مرآة حرفية لقيد قاعدة البيانات (0095):
// حروف إنكليزية صغيرة/أرقام/شرطات، 3–30، ما يبدي أو ينتهي بشرطة —
// حتى الفحص المحلي والرفض السحابي ما يختلفان أبداً.
// ============================================================================
import type { StoreOrderItem } from "@/types";

/* الرابط من env مباشرةً لا من `@/lib/supabase`: حرّاسُ الحزم يوصّلون repo.ts
 * (وهو يستورد هذا الملف) ببديلٍ مزيّفٍ للعميل، واستيرادُ الوحدة الحقيقية من
 * هنا كان يُدخل `@supabase/supabase-js` كاملةً بالحزمة فيفشّلها. */
const SUPA_URL: string = (import.meta as unknown as { env?: Record<string, string | undefined> }).env?.VITE_SUPABASE_URL ?? "";

/** رابط عرض صورة المنتج (0174): data URL تجريبي يمرّ كما هو، ومسارٌ سحابيّ
 *  يُبنى رابطه العام — الـbucket عام فلا توقيع، والزبون بلا جلسة أصلاً. */
export function productImageUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (path.startsWith("data:")) return path;
  if (!SUPA_URL) return null;
  return `${SUPA_URL.replace(/\/+$/, "")}/storage/v1/object/public/product-images/${path}`;
}

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

/* ------------------- المنتج بلا صورة: بطاقةٌ مقصودة لا فراغ -------------------
 * القياس: سبعُ بطاقاتٍ من اثنتي عشرة بتجربةٍ حيّة كانت بلا صورة، وكلُّها تعرض
 * **إيموجي فئتها** على **تدرّج فئتها** — فثلاثُ حبّاتِ 💊 متطابقة بصفٍّ واحد،
 * والشبكةُ تُقرأ جدولاً مكرّراً لا رفَّ بضاعة. والهويةُ كانت للفئة لا للمنتج.
 *
 * الحلُّ: لونٌ مشتقٌّ من **اسم المنتج نفسه** فيختلف جارٌ عن جار، واسمُه مكتوباً
 * بخطٍّ كبير — أي بطاقةٌ نصّيةٌ مصمَّمة. ولم نجد ستوراً عالمياً يعالج هذه الحالة
 * لأن عندهم صوراً لكلّ شيء؛ عندنا الغيابُ هو القاعدة، فالحلُّ يُصمَّم لا يُستورَد.
 *
 * **الأصنافُ مكتوبةٌ حرفيّةً كاملة**: أيُّ صنفٍ يُركَّب بالشِفرة (`bg-${x}-${y}`)
 * لا يراه Tailwind وقتَ البناء فيُحذف — يشتغل بالتنمية ويخرج أبيضَ بالإنتاج
 * وحده، ولا تمسكه فحوصُنا. لذلك جدولٌ ثابتٌ لا تركيب. */
export interface ShelfLook { tile: string; ink: string }

const SHELF: ShelfLook[] = [
  { tile: "bg-rose-50 dark:bg-rose-500/10",       ink: "text-rose-700 dark:text-rose-300" },
  { tile: "bg-amber-50 dark:bg-amber-500/10",     ink: "text-amber-700 dark:text-amber-300" },
  { tile: "bg-emerald-50 dark:bg-emerald-500/10", ink: "text-emerald-700 dark:text-emerald-300" },
  { tile: "bg-sky-50 dark:bg-sky-500/10",         ink: "text-sky-700 dark:text-sky-300" },
  { tile: "bg-violet-50 dark:bg-violet-500/10",   ink: "text-violet-700 dark:text-violet-300" },
  { tile: "bg-teal-50 dark:bg-teal-500/10",       ink: "text-teal-700 dark:text-teal-300" },
];

/** تجزئةٌ ثابتة: نفسُ الاسم يعطي نفسَ اللون دائماً، عبر الأجهزة والجلسات. */
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

export function shelfLook(name: string): ShelfLook {
  return SHELF[hash32(name || "") % SHELF.length];
}

/** أوّلُ كلمتين من الاسم — ما يكفي ليميّز المنتجَ عن جاره على بلاطةٍ صغيرة. */
export function shelfLabel(name: string): string {
  const words = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "•";
  return words.slice(0, 2).join(" ").slice(0, 22);
}

/** رقم طلب للوضع التجريبي (السيرفر يولد ماله بنفس الشكل). */
export function demoOrderNo(): string {
  let s = "";
  const chars = "0123456789ABCDEF";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SO-${s}`;
}
