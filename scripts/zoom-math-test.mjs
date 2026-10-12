/* ============================================================================
 * عارضُ صورة المنتج (متجر v1) — الحسابُ الخالص (src/lib/zoomMath.ts) والقيودُ على العارض.
 *
 * طلبُ المالك: «الصورة تُرى أوضح». فالعارضُ يكبّر بإصبعين حول منتصفهما، ويسحب مكبَّراً بلا
 * أن تفارق حوافُّ الصورة الشاشة، والنقرتان ١ ⇄ ٢٫٥ — وكلُّ هذا حسابٌ يُفحص هنا لا بالعين.
 * وبلا framer-motion: حزمةُ الزائر تحت ميزانيّتها.
 *
 *   node scripts/zoom-math-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

let Z;
try {
  const built = await esbuild.build({ entryPoints: ["src/lib/zoomMath.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
  Z = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
} catch (e) {
  console.error(`✗ zoom-math-test: ما انبنت الوحدة — ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(1);
}

const box = { w: 400, h: 800 };                       // هاتفٌ طولياً
const content = Z.fitSize(box, { w: 1600, h: 1200 }); // ٤:٣ ⇒ ٤٠٠×٣٠٠ بالوسط
const screenOf = (v, p) => ({ x: p.x * v.s + v.x, y: p.y * v.s + v.y });

console.log("▸ «تتّسع» والقيود");
check("الصورةُ ٤:٣ تتّسع لعرض الصندوق", near(content.w, 400) && near(content.h, 300));
check("المقياسُ محصورٌ بين ١ و٥", Z.clampScale(0.2) === 1 && Z.clampScale(9) === 5 && Z.clampScale(NaN) === 1);

console.log("▸ التكبيرُ حول نقطة: النقطةُ تبقى تحت الإصبع");
{
  const f = { x: 200, y: 400 };   // وسطُ الصورة
  const v = Z.zoomAt(Z.IDENTITY, f, 2, box, content);
  const p = { x: 200, y: 400 };   // النقطةُ نفسُها بإحداثيات المحتوى عند s=1
  const s = screenOf(v, p);
  check("zoomAt(٢) حول الوسط ⇒ الوسطُ بمكانه", near(s.x, f.x) && near(s.y, f.y), JSON.stringify(s));
  // ×٣ كي تكون الصورةُ أكبرَ من الصندوق بالمحورين (الأصغرُ يُعاد للوسط بحقّ — لا تكبيرَ حول نقطةٍ فيه)
  const g = { x: 300, y: 420 };   // نقطةٌ غيرُ الوسط وداخل الصورة
  const before = { x: g.x, y: g.y };
  const v2 = Z.zoomAt(Z.IDENTITY, g, 3, box, content);
  const after = screenOf(v2, before);
  check("  وحول نقطةٍ جانبية داخل الصورة ⇒ هي بمكانها", near(after.x, g.x) && near(after.y, g.y), JSON.stringify(after));
  check("  ومقياسُ ٩ يُحصر بـ٥", Z.zoomAt(Z.IDENTITY, f, 9, box, content).s === 5);
}

console.log("▸ إصبعان: المنتصفُ ثابت، وحركتُه تسحب");
{
  const m0 = { x: 220, y: 380 };
  const v = Z.pinch(Z.IDENTITY, m0, 100, m0, 300, box, content);   // ×٣ بلا حركة منتصف
  const at = screenOf(v, m0);
  check("المسافةُ ×٣ ⇒ المقياسُ ٣ والمنتصفُ بمكانه", near(v.s, 3) && near(at.x, m0.x) && near(at.y, m0.y), JSON.stringify(v));
  const moved = Z.pinch(Z.IDENTITY, m0, 100, { x: 240, y: 380 }, 300, box, content);
  check("  والمنتصفُ تحرّك ٢٠ ⇒ الصورةُ معه", near(moved.x - v.x, 20), String(moved.x - v.x));
  check("  والتصغيرُ تحت ١ يقف عند ١", Z.pinch(Z.IDENTITY, m0, 200, m0, 50, box, content).s === 1);
}

console.log("▸ السحبُ مقيَّد: حوافُّ الصورة لا تفارق الشاشة");
{
  const v = Z.zoomAt(Z.IDENTITY, { x: 200, y: 400 }, 3, box, content);   // ١٢٠٠×٩٠٠ معروضة
  const far = Z.panBy(v, 5000, 5000, box, content);
  const left = 0 * far.s + far.x, top = 250 * far.s + far.y;            // الصورةُ من (0,250) إلى (400,550) عند s=1
  check("سحبٌ بعيدٌ يمين ⇒ الحافّةُ اليسرى عند الصفر لا أبعد", near(left, 0), String(left));
  check("  والصورةُ (٩٠٠) أطولُ من… لا: أقصرُ من الصندوق (٨٠٠)؟ — ٩٠٠ > ٨٠٠ فالحافّةُ العليا عند الصفر", near(top, 0), String(top));
  const back = Z.panBy(v, -5000, -5000, box, content);
  check("  وسحبٌ بعيدٌ يسار ⇒ الحافّةُ اليمنى عند ٤٠٠", near(400 * back.s + back.x, 400));
  const small = Z.zoomAt(Z.IDENTITY, { x: 200, y: 400 }, 2, box, content); // ٨٠٠×٦٠٠ — العرضُ أعرض، الطولُ أقصر
  const sp = Z.panBy(small, 0, 999, box, content);
  check("  وما كان أقصرَ من الصندوق يبقى بالوسط", near((250 * sp.s + sp.y) + (300 * sp.s) / 2, 400), String(250 * sp.s + sp.y));
  check("وسحبٌ بلا تكبير لا يحرّك شيئاً", Z.panBy(Z.IDENTITY, 50, 50, box, content) === Z.IDENTITY);
  check("clampPan عند ١ ⇒ لا إزاحة", JSON.stringify(Z.clampPan({ s: 1, x: 37, y: -12 }, box, content)) === JSON.stringify({ s: 1, x: 0, y: 0 }));
}

console.log("▸ النقرتان والعجلة");
{
  const f = { x: 120, y: 330 };
  const z = Z.doubleTap(Z.IDENTITY, f, box, content);
  check("نقرتان على ١ ⇒ ٢٫٥", near(z.s, 2.5));
  check("  ونقرتان على ٢٫٥ ⇒ ١ بلا إزاحة", JSON.stringify(Z.doubleTap(z, f, box, content)) === JSON.stringify({ s: 1, x: 0, y: 0 }));
  const w = Z.wheelZoom(Z.IDENTITY, { x: 200, y: 400 }, -300, box, content);
  check("العجلةُ للأعلى تكبّر وللأسفل تصغّر حتى ١", w.s > 1 && Z.wheelZoom(w, { x: 200, y: 400 }, 5000, box, content).s === 1);
}

console.log("▸ العارض نفسُه");
{
  const src = readFileSync("src/components/store/ZoomViewer.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  check("بلا framer-motion (حزمةُ الزائر)", !/framer-motion/.test(src));
  check("وكلُّ الحساب من zoomMath (لا نسخةٌ ثانية)", /from "@\/lib\/zoomMath"/.test(src) && /pinch\(/.test(src) && /doubleTap\(/.test(src) && /wheelZoom\(/.test(src));
  check("touch-action: none (المتصفّحُ لا يكبّر الصفحةَ بدل الصورة)", /touchAction: "none"/.test(src));
  check("والعجلةُ مستمعٌ غيرُ سلبيّ (preventDefault يعمل)", /addEventListener\("wheel", onWheel, \{ passive: false \}\)/.test(src));
  check("ويُغلق بـEscape", /e\.key === "Escape"/.test(src));
}

console.log(fails ? `\n✗ zoom-math-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ zoom-math-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
