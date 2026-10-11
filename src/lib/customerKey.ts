/* ============================================================================
 * «نفسُ الزبون» — تعريفٌ واحد، ومرآتُه بالقاعدة (0231: cust_phone_nat/cust_phone_key/
 * cust_norm/cust_name_key/cust_key). يحرس تطابقَهما `scripts/customer-key-parity.mjs`
 * بالدوالّ نفسها من هذا الملفّ (esbuild)، لا بنسخةٍ منها.
 *
 * ── لماذا ─────────────────────────────────────────────────────────────────
 * بحثُ الزبون بشاشة البيع كان يجمع بـ`(الهاتف || الاسم).toLowerCase()` ويطابق النصَّ
 * الخامَ: «0770…» و«+964 770…» زبونان، و«0770» لا يلقى «+964 770…»، و«964» وحده (مفتاحُ
 * دولةٍ بلا رقم) يُجمع زبوناً واحداً لثلاثٍ وعشرين فاتورة. المقيسُ بالإنتاج: ٣٥ زبوناً
 * برقمٍ مكتوبٍ بصيغتين أو أكثر (١٩٢ فاتورة).
 *
 * ── القاعدة ───────────────────────────────────────────────────────────────
 * • الهاتفُ يُقرأ **بمفتاح دولة العيادة** (`getDialCode()` بالواجهة، و`clinic_prefs.dial_code`
 *   بالقاعدة، والافتراضُ 964): يُشال «00» ثم المفتاحُ ثم الأصفارُ البادئة. فبعيادةٍ عراقية
 *   «0770…» = «770…» = «+964 770…»، وبعيادةٍ سعودية «05…» = «+966 5…». والهاتفُ هويّةٌ
 *   إن بقي منه ٨ أرقامٍ فأكثر.
 * • الاسمُ يُطوى كما يطويه البحثُ (`searchable`) بعد شيل أيّ رقمٍ طويل لُصق فيه،
 *   ولا يُعدّ هويّةً إن كان اسماً بديلاً («بدون»، «زبون»، «نقدي»…).
 * • الهاتفُ يغلب، والاسمُ لا يُدمج عبر رقمٍ أبداً.
 *
 * وحدةٌ صِرفة: لا تستوردها `repo.ts` (حزمةُ الإقلاع)؛ تستوردها شاشةُ البيع والمرآةُ
 * التجريبية وفحوصُ التطابق.
 * ==========================================================================*/
import { nationalNumber, phoneDigits } from "./phone";
import { searchable } from "./utils";
import { normalizeDigits } from "./digits";

/** مفتاحُ الدولة حين لا تقول العيادةُ غيرَه (العراق). */
export const DEFAULT_DIAL = "964";

/** أرقامُ مفتاح الدولة وحدها: «+964» ⇒ «964»، وفارغُه ⇒ 964 — مرآةُ فرع `dial` بـcust_phone_nat. */
export function dialDigits(dial?: string | null): string {
  return phoneDigits(dial ?? "") || DEFAULT_DIAL;
}

/** الرقمُ الوطنيّ بمفتاح دولة العيادة (قد يكون قصيراً أو فارغاً) — مرآةُ cust_phone_nat. */
export function custPhoneNat(phone: string | null | undefined, dial?: string | null): string {
  return nationalNumber(phone ?? "", dialDigits(dial));
}

/** الهاتفُ هويّةٌ حين يبقى منه ٨ أرقامٍ فأكثر — مرآةُ cust_phone_key. */
export function custPhoneKey(phone: string | null | undefined, dial?: string | null): string | null {
  const k = custPhoneNat(phone, dial);
  return k.length >= 8 ? k : null;
}

/* المحارفُ الخفية (اتجاه، عرضٌ صفريّ، علامةُ العربية، العوازل، BOM) — تدخل باللصق ولا تُرى. */
const INVISIBLE = /[\u{200B}-\u{200F}\u{61C}\u{202A}-\u{202E}\u{2066}-\u{2069}\u{FEFF}]/gu;

/** طيُّ البحث نفسُه (`searchable`) بلا المحارف الخفية — مرآةُ cust_norm. */
export function custNorm(s: string | null | undefined): string {
  return searchable(String(s ?? "").replace(INVISIBLE, ""));
}

/* رقمٌ طويل (٧ أرقامٍ فأكثر، بمسافاتٍ أو شرطات) — هاتفٌ لُصق بخانة الاسم ليس من الاسم.
 * و`\s` هنا مسافاتُ جافاسكربت؛ القاعدةُ تكتبها بأسمائها (0231) لأن `\s` بوستغريس غيرُها. */
const LONG_RUN = /\+?[0-9](?:[\s-]*[0-9]){6,}/g;
/* الاسمُ هويّةٌ إن حمل حرفاً واحداً على الأقل (لاتينيّ أو عربيّ/كرديّ). */
const HAS_LETTER = /[a-z\u{c0}-\u{24f}\u{621}-\u{64a}\u{66e}-\u{6d5}]/u;
/* أسماءٌ بديلة تُكتب مكانَ الاسم — مطويّةً كما يطويها custNorm. بمهارب يونيكود لأنها
 * مفاتيحُ مطابقةٍ لا نصٌّ معروض: بدون، بدون اسم، بلا اسم، لا يوجد، زبون، زبون نقدي،
 * زبون عابر، عابر، نقدي، عميل، عميل نقدي، مراجع. */
const PLACEHOLDERS = new Set([
  "\u{628}\u{62f}\u{648}\u{646}", "\u{628}\u{62f}\u{648}\u{646}\u{627}\u{633}\u{645}", "\u{628}\u{644}\u{627}\u{627}\u{633}\u{645}",
  "\u{644}\u{627}\u{64a}\u{648}\u{62c}\u{62f}", "\u{632}\u{628}\u{648}\u{646}", "\u{632}\u{628}\u{648}\u{646}\u{646}\u{642}\u{62f}\u{64a}",
  "\u{632}\u{628}\u{648}\u{646}\u{639}\u{627}\u{628}\u{631}", "\u{639}\u{627}\u{628}\u{631}", "\u{646}\u{642}\u{62f}\u{64a}",
  "\u{639}\u{645}\u{64a}\u{644}", "\u{639}\u{645}\u{64a}\u{644}\u{646}\u{642}\u{62f}\u{64a}", "\u{645}\u{631}\u{627}\u{62c}\u{639}",
  "walkin", "walk-in", "cash", "customer", "guest",
]);

/** الاسمُ كما يُقارَن هويّةً — مرآةُ cust_name_key. */
export function custNameKey(name: string | null | undefined): string | null {
  const k = custNorm(normalizeDigits(String(name ?? "")).replace(LONG_RUN, ""));
  if ([...k].length < 2 || !HAS_LETTER.test(k) || PLACEHOLDERS.has(k)) return null;
  return k;
}

/** 'p:'+الهاتف، وإلا 'n:'+الاسم، وإلا null — مرآةُ cust_key. */
export function custKey(phone: string | null | undefined, name: string | null | undefined, dial?: string | null): string | null {
  const p = custPhoneKey(phone, dial);
  if (p) return `p:${p}`;
  const n = custNameKey(name);
  return n ? `n:${n}` : null;
}

/** نصُّ بحثٍ كلُّه أرقامٌ وعلاماتُ هاتف = بحثٌ بالرقم. */
export function isPhoneQuery(q: string): boolean {
  return /^[\s0-9\u{660}-\u{669}\u{6f0}-\u{6f9}+()-]+$/u.test(q);
}

/** قصُّ المسافات العادية وحدها من الطرفين — مرآةُ `btrim(t)` بالقاعدة (لا NBSP). */
export function btrimSpaces(s: string | null | undefined): string {
  return String(s ?? "").replace(/^ +| +$/g, "");
}

/**
 * رقمُ الزبون كما يُكتب بالفاتورة وطلب التوصيل. **مفتاحُ الدولة وحده ليس رقماً**: «+964»
 * (حيوانٌ قديمٌ رقمُ صاحبه مفتاحٌ بلا رقم، يُسحب للبيعة مع حيوانه) كان يُكتب كما هو —
 * ٢٣ فاتورةً بالإنتاج رقمُها «964» وحده، يجمعها كلُّ ما يقرأ الرقمَ زبوناً واحداً لأناسٍ
 * شتّى. فما لا يبقى منه رقمٌ وطنيّ بمفتاح دولة العيادة يُترك، ويُؤخذ بدلَه رقمٌ فُصل من
 * خانة الاسم (`splitCustomerField`) إن وُجد. لا يمسّ ما خُزّن قبله.
 */
export function checkoutPhone(phone: string | null | undefined, fromName: string | null | undefined, dial?: string | null): string | null {
  const p = String(phone ?? "").trim();
  if (p && custPhoneNat(p, dial) !== "") return p;
  return fromName || null;
}

/**
 * «عن طريق لونا»: الخادمُ يقول إن الزبونَ طلع **باسم حيوانه** (`matched = 'pet'`، رتبة ٥)
 * ولا يقول أيَّ حيوان — فيُعاد الحكمُ نفسُه هنا (`custNorm(اسم الحيوان)` يحوي نصَّ البحث
 * المطويّ). بلاه يطلع «أبو حسن» تحت «لونا» بلا سبب يُرى فيُظنّ خطأ.
 */
export function viaPetOf(
  hit: { matched: string | null; pets: readonly { name: string | null }[] },
  q: string | null | undefined,
  dial?: string | null,
): string | null {
  if (hit.matched !== "pet") return null;
  const rq = readCustomerQuery(q, dial);
  if (rq.mode !== "name") return null;
  return hit.pets.find((p) => custNorm(p.name).includes(rq.key))?.name ?? null;
}

export type CustomerQuery =
  | { mode: "list" }
  | { mode: "short" }
  | { mode: "phone"; key: string }
  | { mode: "name"; key: string };

/**
 * كيف يُقرأ نصُّ البحث — نفسُ حكم customer_search (0232) حرفاً: فارغٌ = القائمة كلُّها،
 * أرقامٌ = بالرقم الوطنيّ (٣ أرقامٍ فأكثر)، وإلا بالاسم المطويّ (حرفان فأكثر)، وما دونها
 * «اكتب أكثر» — فلا تُرسل الشاشةُ طلباً لن يرجع شيئاً.
 */
export function readCustomerQuery(q: string | null | undefined, dial?: string | null): CustomerQuery {
  const t = [...btrimSpaces(q)].slice(0, 80).join("");
  if (t === "") return { mode: "list" };
  if (isPhoneQuery(t)) {
    const key = custPhoneNat(t, dial);
    return key.length >= 3 ? { mode: "phone", key } : { mode: "short" };
  }
  const key = custNorm(t);
  return [...key].length >= 2 ? { mode: "name", key } : { mode: "short" };
}
