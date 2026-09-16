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
/** مفتاحُ «آخر طلب» — **لكلّ متجرٍ مفتاحُه**.
 *
 * كان مفتاحاً واحداً مشتركاً (`vp_store_last_order`)، فمن طلب من عيادةٍ ثمّ
 * فتح صفحةَ تتبّعِ عيادةٍ أخرى وجد رقمَ طلبِ الأولى معبّأً — لا يطابق شيئاً
 * عند الثانية، فتقول له «ما لكينا طلباً بهذا الرقم» وهو لم يكتب رقماً أصلاً.
 *
 * والتطبيعُ **داخل الدالّة** لا عند نداءِها: المسارُ قد يجيء `/s/Vet-0EN2`
 * والكتابةُ من `/s/vet-0en2` — فلو طُبّع طرفٌ واحد لصار مفتاحان لمتجرٍ واحد.
 * «تطبيعُ طرفٍ واحدٍ أسوأ من لا تطبيع: يفشل بصمتٍ ويبدو أنه يعمل.» */
export function lastOrderKey(slug: string): string {
  return `vp_store_last_order:${normalizeSlug(slug || "")}`;
}

export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .replace(/[\s_]+/g, "-")      // فراغات/underscore → شرطة
    .replace(/[^a-z0-9-]/g, "")   // أي شيء غير مسموح يُحذف (العربي ينحذف — الرابط لاتيني)
    .replace(/-{2,}/g, "-")       // شرطات متتالية → واحدة
    .replace(/^-+|-+$/g, "");     // بلا شرطة بالبداية/النهاية
}

/** مفتاحُ هويةِ الرابط — **مرآةٌ حرفية لـ`lower(trim(p_slug))`** الخادمية
 *  (0095 وكلُّ ما بعدها). و`trim()` ببوستغريس هي `btrim(x, ' ')`: تشيل
 *  **المسافة** وحدَها، لا التبويبَ ولا السطرَ الجديد — فلا تستبدلها بـ`.trim()`
 *  الجافاسكربتية، هي أوسعُ فتقبل ما يقفله الخادم. */
export function slugKey(input: string | null | undefined): string {
  return (input ?? "").replace(/^ +| +$/g, "").toLowerCase();
}

/** هل هذا الرابطُ هو ذاك؟ — **الطرفان يمرّان من نفس الدالّة**.
 *
 *  **ولا تُبنى على `normalizeSlug`**: تلك مطهّرةُ إدخال — تقلب `_`→`-`، وتطوي
 *  الشرطاتِ المكرّرة، وتحذف كلَّ محرفٍ غيرِ مسموح. وظيفتُها أن تُنزل كتابةَ
 *  المالك على صيغةٍ صالحة، **لا أن تحكم على مطابقة**. استعمالُها بالمقارنة كان
 *  يفتح ما يقفله الخادم: `/s/demo_vet` و`/s/demo--vet` و`/s/demo-vet!` تُقبل
 *  بالتجريبيّ وترجع `closed` بالإنتاج.
 *
 *  فليس العطبُ «تطبيعَ طرفٍ واحد» — الطرفُ المخزون قانونيٌّ أصلاً بقيد
 *  `store_slug_format`. العطبُ **مطبِّعٌ يخالف الطرفَ الآخر**، وهو أسوأ: يفشل
 *  بصمتٍ ويبدو أنه يعمل. */
export function matchSlug(a: string | null | undefined, b: string | null | undefined): boolean {
  const x = slugKey(a);
  // بلا هذا الشرط: `matchSlug("", undefined)` صادقة — و`useParams()` ترجع ""
  // بمسارٍ معطوب، فينفتح المتجرُ التجريبيُّ على لا شيء.
  return x !== "" && x === slugKey(b);
}

/* ══ الرابطُ باسم العيادة (ت٤) ═══════════════════════════════════════════
 *
 * الزرُّ كان يقترح `vet-` + أربعةِ أحرفٍ عشوائية، ولذلك المتجرُ الوحيدُ القائم
 * اسمُه `vet-0en2`. والسببُ أعمقُ من كسلِ الزرّ: `normalizeSlug` تحذف كلَّ ما
 * ليس `[a-z0-9-]`، وأسماءُ العيادات الأربعِ **ذواتِ المخزون الحقيقيّ** عربيّةٌ
 * خالصةٌ بلا حرفٍ لاتينيٍّ واحد — مقيسٌ على الإنتاج:
 *
 *     «الروز البيطرية» · «ابن,الهيثم» · «عيادة الاسمر البيطرية» · «عيادة»
 *
 * وكلُّها تنتج `""` اليوم. فالرابطُ من الاسم **مستحيلٌ لا مُهمَل**.
 *
 * ── وحدُّ ما تقدر عليه هذه الدالّة، مقولاً بصراحة ──────────────────────────
 * العربيةُ تُكتب بلا حركاتٍ قصيرة، فالنقلُ الحرفيُّ يعطي عناقيدَ ساكنةً
 * أحياناً (`الاسمر` ⇒ `alasmr`). لا نُصلحها بمعجم — ولهذا الدالّةُ تقترح
 * **ثلاثةَ مرشّحين** والحقلُ يبقى قابلاً للكتابة: القرارُ للمالك، والاقتراحُ
 * يوفّر عليه البداية من فراغ. وهذا أصدقُ من ادّعاء نقلٍ مثاليّ.
 */

/** نقلُ الحروف — ٢٨ حرفاً والتاءُ المربوطة والهمزاتُ والألفُ المقصورة. */
const AR_LETTERS: Record<string, string> = {
  "ا": "a", "ب": "b", "ت": "t", "ث": "th", "ج": "j", "ح": "h", "خ": "kh",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
  "د": "d", "ذ": "dh", "ر": "r", "ز": "z", "س": "s", "ش": "sh", "ص": "s",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
  "ض": "d", "ط": "t", "ظ": "z", "ع": "a", "غ": "gh", "ف": "f", "ق": "q",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
  "ك": "k", "ل": "l", "م": "m", "ن": "n", "ه": "h", "و": "o", "ي": "i",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
  // الهمزاتُ والمقصورةُ والتاءُ المربوطة — تُنقل صوتاً لا شكلاً.
  "أ": "a", "إ": "i", "آ": "a", "ء": "a", "ؤ": "o", "ئ": "i", "ى": "a", "ة": "a",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
  // الأرقامُ الشرقية — قد تُكتب باسمٍ («عيادة ٢٤ ساعة»).
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",  /* i18n-data: مفاتيحُ نقلِ حروف، لا نصَّ يُقرأ */
};

/** كلماتٌ شائعةٌ تُترجَم لا تُنقَل حرفياً — «بيطرية» ⇒ `vet` أوضحُ من `bitria`.
 *  والمطابقةُ على **الجذع** بعد نزع «ال» واللواحق، فتلتقط المؤنّثَ والمعرَّف. */
const AR_WORDS: Record<string, string> = {
  "عياده": "vet", "عيادة": "vet", "عيادات": "vet",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
  "بيطري": "vet", "بيطريه": "vet", "بيطرية": "vet", "بيطر": "vet",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
  "مركز": "care", "مراكز": "care",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
  "مستشفى": "hospital", "مستشفا": "hospital",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
  "مجمع": "care", "صيدلية": "pharmacy", "صيدليه": "pharmacy",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
  "حيوانات": "pets", "حيوان": "pet", "اليفة": "pets", "اليفه": "pets",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
  "دكتور": "dr", "د": "dr", "طبيب": "dr",  /* i18n-data: كلماتٌ تُطابَق باسم العيادة، لا نصَّ يُقرأ */
};

/** حرفٌ عربيّ؟ (بلا التشكيل — يُسقَط قبل النقل.) */
const AR_DIACRITICS = /[ً-ْٰـ]/g;  /* i18n-data: مدى التشكيل بتعبيرٍ نمطيّ، لا نصَّ يُقرأ */

/** ينقل كلمةً عربيةً واحدةً إلى لاتينيّ — أو يترجمها إن كانت من الشائعات. */
function translitWord(w: string): string {
  const bare = w.replace(AR_DIACRITICS, "");
  if (!bare) return "";
  // الترجمةُ أوّلاً: بالكلمة كما هي، ثمّ بعد نزع «ال» التعريف.
  const noAl = bare.replace(/^ال/, "");  /* i18n-data: «ال» التعريف بنمطٍ، لا نصَّ يُقرأ */
  const known = AR_WORDS[bare] ?? AR_WORDS[noAl];
  if (known) return known;
  let out = "";
  for (const ch of bare) out += AR_LETTERS[ch] ?? (/[a-zA-Z0-9]/.test(ch) ? ch.toLowerCase() : "");
  return out;
}

/**
 * مرشّحو الرابط من اسم العيادة — **ثلاثةٌ مرتَّبةٌ من الأوضح للأقصر**، وكلُّها
 * تمرّ من `normalizeSlug` فلا يخرج منها إلا ما يقبله الخادم.
 *
 * ولا يُرجَع `vet-xxxx` من هنا: العشوائيُّ آخرُ الخيارات لا أوّلُها، وموضعُه
 * عند المستدعي حين تسقط المرشّحاتُ كلُّها أو تكون محجوزة.
 */
export function slugCandidates(clinicName: string | null | undefined): string[] {
  const raw = (clinicName ?? "").trim();
  if (!raw) return [];
  // الفواصلُ والنقطُ فواصلُ كلمات — مقيس: عيادةٌ حيّةٌ اسمُها «ابن,الهيثم».
  const words = raw.split(/[\s,._/\\|،؛-]+/).filter(Boolean).map(translitWord).filter(Boolean);
  if (!words.length) return [];

  // لا تكرارَ متجاور: «عيادة الاسمر البيطرية» ⇒ vet-alasmr-vet ⇒ vet-alasmr.
  const dedup: string[] = [];
  for (const w of words) if (!dedup.includes(w)) dedup.push(w);

  const generic = new Set(["vet", "care", "hospital", "pharmacy", "pet", "pets", "dr"]);
  const names = dedup.filter((w) => !generic.has(w));
  const kinds = dedup.filter((w) => generic.has(w));
  const kind = kinds[0] ?? "vet";

  const out: string[] = [];
  const push = (v: string) => {
    const s = normalizeSlug(v);
    if (isValidSlug(s) && !out.includes(s)) out.push(s);
  };

  /* اسمٌ لاتينيٌّ صالحٌ **كما هو** يتصدّر: إعادةُ ترتيبِ كلماته تشوّهه بلا
   * فائدة — «Farah pet clinic» كانت تصير `farah-clinic-pet`. النقلُ الحرفيُّ
   * لحاجةِ العربية، فلا يُفرَض على من لا يحتاجه. */
  push(raw);

  if (names.length) {
    push(`${names.join("-")}-${kind}`);   // alroz-vet
    push(names.join("-"));               // alroz
    push(`${kind}-${names.join("-")}`);  // vet-alroz
  }
  // اسمٌ كلُّه عامّ («عيادة» وحدَها) — لا يبقى إلا النوع، وهو قصيرٌ ومزدحم.
  push(dedup.join("-"));
  return out.slice(0, 3);
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

/** حرفان من أوّل كلمتين — للمصغّرات الصغيرة (٤٤ بكسل) حيث تُقصّ الكلمةُ بنصّها
 *  فتبدو عطلاً. الاسمُ الكامل مكتوبٌ بجانبها على كل حال. */
export function shelfMonogram(name: string): string {
  const w = (name || "").trim().split(/\s+/).filter(Boolean);
  if (!w.length) return "•";
  const a = [...w[0]][0] ?? "";
  const b = w[1] ? [...w[1]][0] ?? "" : "";
  return (a + b).toUpperCase();
}

/** رقم طلب للوضع التجريبي (السيرفر يولد ماله بنفس الشكل). */
export function demoOrderNo(): string {
  let s = "";
  const chars = "0123456789ABCDEF";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return `SO-${s}`;
}
