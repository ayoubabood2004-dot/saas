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
if (bad) {
  console.error("\n✗ store-paint-guard: الرفُّ المرسومُ انحرف عن رفِّ React — الزبونُ سيرى ومضةً عند التركيب.");
  process.exit(1);
}
console.log(`✓ store-paint-guard: ${classes.length} صنفاً بالرفِّ المرسوم، كلُّها مطابقةٌ لـStorefront.tsx.`);
