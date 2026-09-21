/* ============================================================================
 * الكميّةُ لا تُقصّ — `formatQty` وحارسُها.
 *
 * الجذرُ المقيس: نافذةُ طيّ الشركات كانت تقول «مخزون مجمّع ٣» عن حوضٍ مقدارُه
 * **٣٫٢٥**. لا خطأَ بالمنطق ولا بالقاعدة — `formatNum` وحدَها، وتعليقُها
 * بـ`utils.ts` يقول صراحةً إنها «للأعداد والمبالغ» وإنّ استعمالها على قياسٍ
 * **يكذب**. أمسكه فحصٌ يقود المتصفّحَ فعلاً، لا مراجعةُ شِفرة: الرقمُ كان
 * معقولاً بالنظر، وكاذباً بالقياس.
 *
 * وهذا الملفّ يمسكه لو رجع، من طرفين:
 *   ١) سلوكُ `formatQty` نفسِه — صحيحةٌ كعدد، وكسرٌ بكسره.
 *   ٢) ومسحٌ ثابت: لا شاشةَ تعرض `pooled`/`pool` عبر `formatNum`.
 *      السقفُ **صفر**، وينزل ولا يصعد كبقيّة حرّاس المشروع.
 *
 *   node scripts/qty-format-test.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- ١) السلوك: الدالّةُ نفسُها من مصدرها لا نسخةٌ منها ------------------ */
const built = await esbuild.build({
  entryPoints: ["src/lib/utils.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub", setup(b) {
      // الوحدةُ تجرّ إعدادَ اللغة؛ لا نحتاجه لمقارنةِ تنسيقِ رقم.
      b.onResolve({ filter: /^i18next$|^@\/i18n/ }, () => ({ path: "stub", namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default { language: 'ar', t: (k, d) => d ?? k };", loader: "js" }));
    },
  }],
});
const mod = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
const { formatQty, formatNum, formatDec } = mod;

console.log("▸ formatQty — الصحيحةُ عدد، والكسرُ بكسره");
check("٣ تبقى ٣", formatQty(3) === formatNum(3), formatQty(3));
check("**٣٫٢٥ تبقى ٣٫٢٥** (هذا هو العطبُ الذي كان)", formatQty(3.25) === formatDec(3.25), formatQty(3.25));
check("  و٠٫٥ لا تصير ١", !/^1$/.test(formatQty(0.5)), formatQty(0.5));
check("  و٩٫٧٥ بكاملها", formatQty(9.75) === formatDec(9.75), formatQty(9.75));
check("والصفرُ صفر", formatQty(0) === formatNum(0), formatQty(0));
check("وغيرُ المحدود لا يرمي", formatQty(Number.NaN) === formatNum(Number.NaN), formatQty(Number.NaN));

/* ---- ٢) المسح: لا كميّةَ حوضٍ تمرّ من formatNum -------------------------- */
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})("src");

const offenders = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  src.split("\n").forEach((line, i) => {
    // `formatNum(` بسطرٍ يذكر حوضاً — القياسُ الوحيد الذي أمسكناه يكذب.
    for (const m of line.matchAll(/formatNum\(([^)]*)\)/g)) {
      if (/pooled|pool\b/i.test(m[1])) offenders.push(`${f}:${i + 1}  ${line.trim()}`);
    }
  });
}
console.log("\n▸ المسح: لا شاشةَ تعرض حوضاً عبر formatNum");
check("السقفُ صفر", offenders.length === 0, offenders.join(" · "));

console.log(`\n${fails ? "✗" : "✓"} qty-format-test: ${passes} نجحت، ${fails} فشلت (${files.length} ملفاً مُسح)`);
process.exit(fails ? 1 : 0);
