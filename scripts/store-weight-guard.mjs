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

const BUDGET = { store: 150_000, main: 480_000 };
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
  const total = files.reduce((n, f) => n + gzipSync(readFileSync(`dist${f}`)).length, 0);
  const ok = total <= BUDGET[name];
  if (!ok) fails++;
  console.log(`   ${ok ? "✓" : "✗"} ${name}.html: ${total.toLocaleString("en")} بايت مضغوطة من ${BUDGET[name].toLocaleString("en")} (${files.length} ملفاً)`);
  if (name !== "store") continue;
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
