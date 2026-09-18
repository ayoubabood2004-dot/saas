/* ============================================================================
 * ميزانيّةُ صفحة الزائر — «خفّةٌ تُقاس بعد كلّ بناء، لا مرّةً واحدة».
 *
 * ما قيس قبل ت١١: فتحُ `/s/:slug` ينزّل **٤٦٣٬٣٤٦ بايتاً مضغوطة** قبل أوّل
 * منتج، وحصّةُ `Storefront` منها ١٫٨٪. الباقي قشرةُ تطبيق العيادة بستّين
 * مساراً، وعميلُ Supabase، وقاموسان بلغتين، ومكتبةُ حركةٍ لست حركاتٍ بسيطة.
 *
 * والإصلاحُ يتآكل بصمت: `import` واحدٌ من `@/lib/repo` بصفحةِ زائر يُرجع
 * القشرةَ كلَّها، ولا يظهر بمراجعةِ شِفرة. فالحارسُ يقرأ `dist` المبنيَّ فعلاً
 * — لا الشِفرةَ ولا النيّة — ويشترط ثلاثة:
 *
 *   ١) مجموعُ ما تُعلنه `store.html` مضغوطاً دون السقف.
 *   ٢) لا حزمةَ `supabase` ولا `motion` بمسار الزائر إطلاقاً (الأولى بديلُها
 *      `storeApi`، والثانية بديلُها حركاتُ CSS بـtailwind.config).
 *   ٣) و`index.html` لا تتضخّم بالمقابل — إصلاحٌ ينقل الوزنَ ليس إصلاحاً.
 *
 * **السقفُ ينزل ولا يصعد** (كسقفِ النصّ الصلب بـi18n-guard): من احتاج رفعَه
 * يقيس أوّلاً ويكتب لماذا.
 *
 *   node scripts/store-weight-guard.mjs
 * ==========================================================================*/
import { readFileSync, existsSync } from "node:fs";
import { gzipSync } from "node:zlib";

/* المستندُ نفسُه يُحسب، لا ملفّاتُه وحدَها: أنماطُ صفحة الزائر محقونةٌ داخله
 * (٢٥ كيلو مضغوطة)، فحسابُ الروابط وحدَها كان سيُخفيها ويقول إنّ الصفحةَ
 * خفّت وهي لم تخفّ. والميزانيّةُ تشمله. */
/* **السقفُ رجع كما كان.** رُفع بـ0193 إلى 482,000 حين أضافت فترةُ السحب
 * ١٬٠٢٢ بايتاً من نصّ ترجمةٍ بلغتين، ثم رفع المالكُ المنعَ والعتابَ عن
 * الشاشة (١٨ أيلول) فسقطت إحدى عشرةَ رسالةً ورجع الوزنُ دون 480,000 —
 * فأُنزل السقفُ ثانيةً بدل أن يُترك واسعاً بلا حاجة.
 *
 * والقياسُ الذي كشفه ذلك الرفعُ يبقى مكتوباً ليُعالَج لا ليُنسى:
 *   repo-*.js = ٢٠٣ كيلو مضغوطة بمسار الإقلاع الحرج،
 *   منها ar.json ٧٥ + en.json ٦٦ = **١٤١ كيلو (٦٩٪) قاموسان**،
 *   والمستخدمُ يقرأ **واحداً**. والآليّةُ الكسولة موجودةٌ أصلاً
 *   (`info.loader` بـ`src/i18n/index.ts` تحمّل السورانية) — فنقلُ الإنكليزية
 *   إليها يحرّر ~٦٦ كيلو ويعطي هذا السقفَ فسحةً حقيقية.
 * وحتى ذلك الحين الفسحةُ ٣٧٧ بايتاً: **من يضيف نصّاً يقيس، ومن يضيف
 * `import` يُرفض**. */
const BUDGET = { store: 175_000, main: 480_000 };
const BANNED = [/\/assets\/supabase-/, /\/assets\/motion-/, /\/assets\/charts-/];

if (!existsSync("dist/store.html") || !existsSync("dist/index.html")) {
  console.error("✗ store-weight-guard: ماكو dist — شغّله بعد `vite build`.");
  process.exit(1);
}

let fails = 0;
const assetsOf = (html) =>
  [...readFileSync(html, "utf8").matchAll(/(?:src|href)="(\/assets\/[^"]+)"/g)].map((m) => m[1]);

for (const [name, html] of [["store", "dist/store.html"], ["main", "dist/index.html"]]) {
  const files = assetsOf(html);
  const doc = gzipSync(readFileSync(html)).length;
  const total = doc + files.reduce((n, f) => n + gzipSync(readFileSync(`dist${f}`)).length, 0);
  const ok = total <= BUDGET[name];
  if (!ok) fails++;
  console.log(`   ${ok ? "✓" : "✗"} ${name}.html: ${total.toLocaleString("en")} بايت مضغوطة من ${BUDGET[name].toLocaleString("en")} (المستند ${doc.toLocaleString("en")} + ${files.length} ملفاً)`);
  if (name !== "store") continue;
  /* لا ورقةَ أنماطٍ حاجبةٍ بمسار الزائر: هي التي كانت تؤخّر الرسمَ ١٫٧ ثانيةٍ
   * على 3G (الرفُّ بالمستند من ٣٠٠ms والمتصفّحُ لا يرسم حتى تصل). ورقةُ
   * الخطوط بـ`media="print"` غيرُ حاجبةٍ فتُستثنى، ونسختُها داخل `<noscript>`
   * لا تُحمَّل أصلاً حين تعمل جافاسكربت. */
  const blocking = readFileSync(html, "utf8")
    .split("\n").filter((l) => /rel="stylesheet"/.test(l) && !/media="print"/.test(l) && !/<noscript>/.test(l));
  if (blocking.length) { fails++; console.error(`   ✗ ورقةُ أنماطٍ تحجب رسمَ صفحة الزائر (${blocking.length})`); }
  else console.log("   ✓ لا ورقةَ أنماطٍ تحجب الرسم — الأنماطُ محقونةٌ بالمستند");
  for (const re of BANNED) {
    const hit = files.find((f) => re.test(f));
    if (hit) { fails++; console.error(`   ✗ حزمةٌ ممنوعةٌ بمسار الزائر: ${hit}`); }
    else console.log(`   ✓ لا ${String(re).replace(/[\\/^$]|assets|-/g, "").trim()} بمسار الزائر`);
  }
}

if (fails) {
  console.error("\n✗ store-weight-guard: صفحةُ الزائر تجاوزت ميزانيّتها. الأرجح `import` جديدٌ يجرّ قشرةَ التطبيق (repo، سياقُ الدخول، مكوّنُ ui) — استورد من `storeApi` أو افصل الوحدة.");
  process.exit(1);
}
console.log("✓ store-weight-guard: صفحةُ الزائر داخل ميزانيّتها.");
