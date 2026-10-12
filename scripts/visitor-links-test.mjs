/* ============================================================================
 * روابطُ صفحات الزائر — «رابطٌ يوصل لصفحةٍ فارغة أسوأُ من لا رابط».
 *
 * الجذر (قيس محلياً قبل الإصلاح: بناءٌ سحابيّ أمام نسخةٍ محلّية من دوالّ المتجر): مستندُ الزائر
 * (store.html) يعرف ثلاثةَ مساراتٍ لا غير، و«شوف حيواناتي» كان `<Link to="/p/…">` — انتقالٌ
 * داخليّ لمسارٍ لا يعرفه، فيقع على «كلُّ مسارٍ آخر» = `<Navigate to="/">` ⇒ «/» بـ#root فارغ.
 * فالشرط هنا: كلُّ رابطٍ داخليّ بصفحات الزائر يطابق مساراً بـstore-main، والبوّابةُ (/p/) `<a href>`
 * (انتقالٌ كامل لمستند تطبيق العيادة)، و«كلُّ مسارٍ آخر» انتقالٌ كامل لا `<Navigate>` داخليّ — ومرآتُه
 * لإعادات vercel.json لا تحمّل store.html على نفسه. وروابطُ فيسبوك/انستغرام تُبنى لا تُصدَّق.
 *
 *   node scripts/visitor-links-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1").replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "");

const main = strip(readFileSync("src/store-main.tsx", "utf8"));
const routes = [...main.matchAll(/<Route\s+path="([^"]+)"/g)].map((m) => m[1]).filter((p) => p !== "*");
const PAGES = ["src/pages/Storefront.tsx", "src/pages/StoreTrack.tsx", "src/pages/TrackJourney.tsx"];

/** مطابقةٌ كمطابقة react-router: مقطعٌ حرفيّ = نفسُه، و`:x` = أيُّ مقطع. */
const matches = (target, route) => {
  const a = target.split("?")[0].replace(/\/+$/, "").split("/");
  const b = route.replace(/\/+$/, "").split("/");
  return a.length === b.length && b.every((seg, i) => seg.startsWith(":") ? a[i].length > 0 : seg === a[i]);
};

console.log("▸ الروابطُ الداخليّة بصفحات الزائر تطابق مساراتِ مستندها");
check("store-main يعرف مساراتِ الزائر الثلاثة", ["/s/:slug", "/s/:slug/track", "/t/:token"].every((r) => routes.includes(r)), routes.join(" "));
const targets = [];
for (const f of PAGES) {
  const src = strip(readFileSync(f, "utf8"));
  for (const m of src.matchAll(/<Link\b[^>]*?\bto=\{?["'`]([^"'`]+)["'`]\}?/g)) targets.push([f, m[1]]);
  for (const m of src.matchAll(/\bnavigate\(\s*["'`]([^"'`]+)["'`]/g)) targets.push([f, m[1]]);
}
const norm = (t) => t.replace(/\$\{[^}]+\}/g, "x");
const strays = targets.filter(([, t]) => !routes.some((r) => matches(norm(t), r)));
check(`كلُّ <Link>/navigate (${targets.length}) يطابق مساراً بالمستند`, strays.length === 0, strays.map(([f, t]) => `${f.split("/").pop()}: ${t}`).join("، "));

console.log("▸ البوّابة (/p/) انتقالٌ كامل");
{
  const sf = strip(readFileSync("src/pages/Storefront.tsx", "utf8"));
  check("«شوف حيواناتي» = <a href={`/p/${slug}`}>", /<a href=\{`\/p\/\$\{slug\}`\}/.test(sf));
  check("  ولا <Link> إلى /p/ (انتقالٌ داخليّ لمسارٍ لا يعرفه المستند)", !/<Link\b[^>]*to=\{?["'`]\/p\//.test(sf));
}

console.log("▸ «كلُّ مسارٍ آخر» ليس <Navigate> داخلياً");
{
  check("لا <Navigate to=\"/\"> بمستند الزائر", !/<Navigate\b/.test(main));
  check("  والبديلُ انتقالٌ كامل (window.location.replace)", /<Route path="\*" element=\{<HardNav \/>\}/.test(main) && /window\.location\.replace\(/.test(main));
  const re = /const STORE_DOC_PATH = (\/.+\/);/.exec(main)?.[1];
  let rx = null;
  try { rx = re ? new Function(`return ${re}`)() : null; } catch { rx = null; }
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const storeSources = vercel.rewrites.filter((r) => r.destination === "/store.html" || r.destination.startsWith("/api/store-og")).map((r) => r.source);
  const sample = (src) => src.replace(/:[a-z]+/g, "abc");
  check(`  ومرآتُه تطابق إعادات vercel.json لـstore.html (${storeSources.join(" ، ")}) — فلا يُحمَّل المستندُ على نفسه`,
    !!rx && storeSources.length >= 3 && storeSources.every((s) => rx.test(sample(s))) && !rx.test("/p/abc") && !rx.test("/") && !rx.test("/s/abc/xyz"),
    String(re));
}

console.log("▸ safeSocialUrl (N12)");
try {
  const built = await esbuild.build({ entryPoints: ["src/lib/storeLib.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
  const L = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
  const S = L.safeSocialUrl;
  if (typeof S !== "function") throw new Error("safeSocialUrl غير موجودة");
  check("معرّفٌ ⇒ صفحتُه", S("instagram", "doctorvet_demo") === "https://www.instagram.com/doctorvet_demo");
  check("  و@معرّف كذلك", S("instagram", "@clinic.vet") === "https://www.instagram.com/clinic.vet" && S("facebook", "@my.clinic") === "https://www.facebook.com/my.clinic");
  check("اسمٌ عربيٌّ حرّ ⇒ بحثٌ على المضيف نفسِه", S("facebook", "عيادة الرحمة البيطرية") === `https://www.facebook.com/search/top?q=${encodeURIComponent("عيادة الرحمة البيطرية")}`
    && S("instagram", "عيادة الرحمة").startsWith("https://www.instagram.com/explore/search/keyword/?q="));
  check("رابطُ https على مضيفه يمرّ", S("facebook", "https://www.facebook.com/alrahma.vet") === "https://www.facebook.com/alrahma.vet"
    && S("instagram", "instagram.com/alrahma") === "https://instagram.com/alrahma" && S("facebook", "http://m.facebook.com/x") === "https://m.facebook.com/x");
  check("javascript: ⇒ لا زرّ", S("facebook", "javascript:alert(1)") === null && S("instagram", "JavaScript:alert(document.cookie)") === null);
  check("data: ⇒ لا زرّ", S("instagram", "data:text/html,<script>alert(1)</script>") === null);
  check("مضيفٌ غريب ⇒ لا زرّ", S("facebook", "https://evil.example/facebook.com") === null && S("instagram", "https://instagram.com.evil.example/x") === null && S("facebook", "evil.example/login") === null);
  check("فارغ ⇒ لا زرّ", S("facebook", "") === null && S("instagram", null) === null && S("facebook", "   ") === null);
  const sf = readFileSync("src/pages/Storefront.tsx", "utf8");
  check("Storefront تعرضهما من safeSocialUrl وحدها (لا href من النصّ الخام)", /safeSocialUrl\("facebook", front\?\.facebook\)/.test(sf) && /safeSocialUrl\("instagram", front\?\.instagram\)/.test(sf)
    && !/href=\{front\.(facebook|instagram)\}/.test(sf) && /rel="noopener noreferrer"/.test(sf));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

console.log(fails ? `\n✗ visitor-links-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ visitor-links-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
