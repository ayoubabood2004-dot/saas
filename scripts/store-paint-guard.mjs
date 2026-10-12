/* ============================================================================
 * الرفُّ المرسومُ من الحافة لا ينحرف عن رفِّ React.
 *
 * `api/store-og.ts` ترسم أوّلَ ثماني موادَّ بالـHTML كي يراها الزبونُ قبل أن
 * تنزل جافاسكربت (المقيس: ٣٬٣٤٣ms ⇒ ١٬٥٧٩ على 3G بطيء). وثمنُ ذلك نسخةُ
 * أصنافٍ ثانية: لو غُيّر صنفٌ ببطاقة `Storefront.tsx` وحدَه، رأى الزبونُ رفّاً
 * ثمّ رفّاً آخرَ يستبدله — وميضٌ يبدو عطلاً.
 *
 * فالحارسُ يشترط أن **كلَّ سلسلةِ أصنافٍ ترسمها الحافة موجودةٌ حرفياً**
 * بـ`Storefront.tsx`. وإضافةُ صنفٍ لأحدهما دون الآخر تفشّل البناء.
 *
 *   node scripts/store-paint-guard.mjs
 * ==========================================================================*/
import { readFileSync } from "node:fs";

const edge = readFileSync("api/store-og.ts", "utf8");
const page = readFileSync("src/pages/Storefront.tsx", "utf8");

/* أصنافُ الحافة: ما بين `class="` و`"` داخل دالّة الرسم وحدَها. */
const start = edge.indexOf("function paintShelf");
if (start < 0) { console.error("✗ store-paint-guard: ما لقيت paintShelf — هل أُلغي الرسم؟"); process.exit(1); }
const body = edge.slice(start);
const classes = [...body.matchAll(/class="([^"$]+)"/g)].map((m) => m[1].trim()).filter(Boolean);
if (classes.length < 6) { console.error(`✗ store-paint-guard: أصنافٌ أقلُّ من المتوقَّع (${classes.length}) — تغيّر شكلُ الرسم؟`); process.exit(1); }

let bad = 0;
for (const c of classes) {
  // الصنفُ يُقارَن كلمةً كلمة: `Storefront` تبنيه بـ`cn(...)` على أسطر، فالمقارنةُ
  // على السلسلة كاملةً كانت ستفشل على تنسيقٍ لا على انحراف.
  const missing = c.split(/\s+/).filter((w) => w && !page.includes(w));
  if (missing.length) { bad++; console.error(`   ✗ صنفٌ بالحافة لا وجودَ له بـStorefront.tsx: ${missing.join(" ")}`); }
}
/* متجر v1: الرسمُ صار يحمل النبذةَ وشريطَ الرقائق وخانةَ البحث، وصورُ البطاقات مصغّراتٍ. فيُشترط
 * أن تكون أصنافُها **ضمن ما فُحص أعلاه** (حرفيّةً بين علامتي class — القالبُ `${…}` يُفلت من
 * المقارنة)، وأن يمرّ الطرفان من `cardImagePath(` — وإلا طلب المرسومُ ملفّاً والمركَّبُ آخر:
 * تنزيلان وومضة. وخانةُ البحث بنصّها نفسِه. */
const has = (frag) => classes.some((c) => c.includes(frag));
const need = [
  ["رقاقةُ «الكل» الفعّالة", has("rounded-full px-3.5 py-1.5") && has("bg-brand-600 text-white")],
  ["رقاقةٌ غيرُ فعّالة", has("border border-line bg-surface-1 text-ink-muted")],
  ["شريطُ الرقائق", has("overflow-x-auto pb-0.5")],
  ["سطرُ النبذة", has("line-clamp-2 whitespace-pre-line")],
  ["خانةُ البحث", has("pe-9 ps-4") && has("sticky top-0 z-20")],
  ["الحافةُ تطلب صورةَ البطاقة بـcardImagePath(", body.includes("cardImagePath(")],
  ["وStorefront كذلك", page.includes("cardImagePath(")],
  ["ونصُّ خانة البحث نفسُه", (() => { const m = /placeholder="([^"]+)"/.exec(body); return !!m && page.includes(`placeholder="${m[1]}"`); })()],
];
for (const [name, ok] of need) if (!ok) { bad++; console.error(`   ✗ ${name}`); }
if (bad) {
  console.error("\n✗ store-paint-guard: الرفُّ المرسومُ انحرف عن رفِّ React — الزبونُ سيرى ومضةً عند التركيب.");
  process.exit(1);
}
console.log(`✓ store-paint-guard: ${classes.length} صنفاً بالرفِّ المرسوم، كلُّها مطابقةٌ لـStorefront.tsx، و${need.length} شروطِ متجر v1 (الرقائق، النبذة، البحث، cardImagePath).`);
