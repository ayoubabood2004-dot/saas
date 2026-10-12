/* ============================================================================
 * زرُّ الرجوع بصفحة الزائر (متجر v1) — بسجلّ تصفّحٍ مزيّف يطبّق ما يقوله layersAfter.
 *
 * الجذر: الورقةُ والسلّةُ كانتا حالةً داخل React، فزرُّ «رجوع» بالهاتف يُخرج الزبونَ من المتجر وهو
 * يريد إغلاقَ صورة. الآن كلُّ طبقةٍ مدخلٌ بالسجلّ؛ وهذا الفحصُ يمشي السجلَّ نفسَه: الورقة ثم
 * العارض ⇒ رجوعٌ يُغلق العارض، ثم الورقة، ثم يُخرج؛ والـX يرجع مرّةً واحدة؛ وبعد الطلب لا مدخلَ
 * يتسرّب؛ وإعادةُ التحميل لا تترك ضغطاتِ رجوعٍ ميتة. ويقرأ Storefront ليُثبت أنها تمرّ منه.
 *
 *   node scripts/back-layers-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

let M;
try {
  const built = await esbuild.build({
    stdin: { contents: 'export { layersAfter, readLayers } from "./src/lib/storeLayers.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    plugins: [{ name: "rr", setup(b) {
      b.onResolve({ filter: /^react-router-dom$/ }, () => ({ path: "rr", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const useLocation = () => ({}); export const useNavigate = () => () => {};", loader: "js" }));
    } }],
  });
  M = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
} catch (e) {
  console.error(`✗ back-layers-test: ما انبنت الوحدة — ${String(e?.message ?? e).split("\n")[0]}`);
  process.exit(1);
}

/** سجلٌّ مزيّف: مداخلُ (طبقاتُ كلٍّ منها) وموضع. ‎-1 = خرج من المتجر. */
function history() {
  const h = { entries: [[]], idx: 0, navCalls: 0 };
  h.layers = () => (h.idx < 0 ? null : h.entries[h.idx]);
  h.apply = (ev) => {
    const { nav } = M.layersAfter(h.layers(), ev);
    if (!nav) return;
    h.navCalls++;
    if ("push" in nav) { h.entries = [...h.entries.slice(0, h.idx + 1), nav.push]; h.idx++; }
    else if ("replace" in nav) h.entries[h.idx] = nav.replace;
    else h.idx += nav.go;
  };
  h.back = () => { h.idx--; };          // زرُّ المتصفّح/الهاتف
  return h;
}
const show = (l) => (l === null ? "خارج المتجر" : JSON.stringify(l));

console.log("▸ الورقة ثم العارض: الرجوعُ يُغلقهما بالترتيب ثم يُخرج");
{
  const h = history();
  h.apply({ type: "open", layer: "sheet" });
  h.apply({ type: "open", layer: "zoom" });
  check("مفتوحان", show(h.layers()) === '["sheet","zoom"]');
  h.back();
  check("رجوع ⇒ العارضُ وحدَه يُغلق", show(h.layers()) === '["sheet"]', show(h.layers()));
  h.back();
  check("رجوع ⇒ الورقةُ تُغلق والمتجرُ باقٍ", show(h.layers()) === "[]", show(h.layers()));
  h.back();
  check("رجوع ⇒ يخرج من المتجر (لا قبلها)", h.layers() === null);
}

console.log("▸ الإغلاقُ من الواجهة (X / الستارة) = رجوعٌ واحد");
{
  const h = history();
  h.apply({ type: "open", layer: "sheet" });
  const before = h.navCalls;
  h.apply({ type: "close" });
  check("X ⇒ navigate(-1) مرّةً واحدة والورقةُ مغلقة", h.navCalls - before === 1 && show(h.layers()) === "[]");
  h.apply({ type: "close" });
  check("  وX ثانيةٌ بلا طبقات لا تُخرج من المتجر", h.layers() !== null && h.idx === 0);
}

console.log("▸ السلّة ⇒ الإتمام ⇒ الطلب: لا مدخلَ يتسرّب");
{
  const h = history();
  h.apply({ type: "open", layer: "cart" });
  h.apply({ type: "swap", layer: "checkout" });
  check("الإتمامُ بعمق السلّة نفسه", h.idx === 1 && show(h.layers()) === '["checkout"]');
  h.apply({ type: "swap", layer: "cart" });
  check("  و«رجوع للسلة» تبديلٌ لا دفع", h.idx === 1 && show(h.layers()) === '["cart"]');
  h.apply({ type: "swap", layer: "checkout" });
  h.apply({ type: "placed" });
  check("بعد الطلب: الأساسُ بلا طبقات", h.idx === 0 && show(h.layers()) === "[]");
  h.back();
  check("  ورجوعٌ من شاشة النجاح يُخرج — لا يعيد لسلّةٍ أُفرغت", h.layers() === null);
}

console.log("▸ إعادةُ التحميل والعارضُ مفتوح");
{
  const h = history();
  h.apply({ type: "open", layer: "sheet" });
  h.apply({ type: "open", layer: "zoom" });
  // التحميلُ: المدخلُ وحالتُه باقيان، والمنتجُ (ذاكرةُ React) لا — فالواجهةُ ترسل reload
  h.apply({ type: "reload" });
  check("يرجع للأساس بلا طبقات", h.idx === 0 && show(h.layers()) === "[]");
  h.back();
  check("  ورجوعٌ واحدٌ يُخرج (لا ضغطاتٌ ميتة على طبقاتٍ لا منتجَ لها)", h.layers() === null);
}

console.log("▸ Storefront تمرّ من الطبقات");
{
  const sf = readFileSync("src/pages/Storefront.tsx", "utf8");
  check("الورقةُ تُفتح بمدخل", /setDetail\(p\); L\.open\("sheet"\);/.test(sf));
  check("  والعارضُ فوقها بمدخل", /L\.open\("zoom"\)/.test(sf) && /<ZoomViewer [^>]*onClose=\{\(\) => L\.close\(\)\}/.test(sf));
  check("  وX والستارةُ = L.close()", (sf.match(/L\.close\(\)/g) || []).length >= 4);
  check("  والرسمُ من الطبقات (لا حالةُ لوحةٍ داخل React)", /L\.has\("checkout"\) \? "checkout" : L\.has\("cart"\) \? "cart" : "none"/.test(sf) && !/setSheet\(/.test(sf));
  // قيس بالمتصفّح: أثرُ التركيب يجري مرّتين بـStrictMode بنفس الطبقات — فـgo(-2) تكرّر وأخرج الزبون.
  check("  وإعادةُ التحميل بطبقاتٍ ⇒ reload عند التركيب، مرّةً واحدة (مرجعٌ يحرسها)",
    /if \(unwound\.current \|\| !L\.layers\.length\) return;\s*unwound\.current = true;\s*L\.reload\(\);/.test(sf));
  check("  والطلبُ ⇒ placed قبل شاشة النجاح", /setCart\(\[\]\); L\.placed\(\); setPlaced\(r\);/.test(sf));
  check("وبلا pushState خامّ (الموجّهُ وحده يملك السجلّ)", !/history\.pushState|window\.history\.(pushState|replaceState)/.test(sf + readFileSync("src/lib/storeLayers.ts", "utf8")));
}

console.log(fails ? `\n✗ back-layers-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ back-layers-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
