/* ============================================================================
 * فحصُ معاينة رابط المتجر — «الرابطُ يصل بصورة».
 *
 * القياسُ الذي كشفها: `api/store-og.ts` يمسح **كلَّ** وسوم og و twitter من
 * القالب ثم يكتب مجموعةً بلا `og:image` أصلاً. والقالبُ فيه صورةُ مشاركةٍ
 * ١٢٠٠×٦٣٠ — فرابطُ متجرِ عيادةٍ كان يُشارَك **أسوأ** من رابط الموقع العام:
 * بطاقةٌ نصّيةٌ باهتة بالواتساب، وهي أوّلُ ما يرى زبونُها.
 *
 * وفحصُ نصٍّ لا يكفي هنا: الدالّةُ تبني الرأس من ردِّ الخادم، فالفحصُ يشغّلها
 * فعلاً بردودٍ مزيّفة ويقرأ الرأسَ الخارج — أربعةُ ردودٍ يصنعها الإنتاج:
 * عيادةٌ بشعارٍ مسار، وعيادةٌ بشعارٍ `data:` قديم، وعيادةٌ بلا شعار، وفشل.
 *
 *   node scripts/og-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const SUPA = "https://proj.supabase.co";
const CLINIC = "11111111-1111-1111-1111-111111111111";
process.env.VITE_SUPABASE_URL = SUPA;
process.env.VITE_SUPABASE_ANON_KEY = "anon-key";

/* قالبٌ مصغَّرٌ يحمل ما يحمله index.html فعلاً: عنوانٌ ووصفٌ وبلوكُ مشاركةٍ
 * **فيه صورة** — وهي بالضبط ما كان يُمحى بلا بديل. */
const SHELL = `<!doctype html><html lang="ar" dir="rtl"><head>
    <meta name="description" content="متجر العيادة" />
    <title>متجر العيادة</title>
    <meta property="og:title" content="متجر العيادة" />
    <meta property="og:image" content="https://shell.invalid/og.jpg" />
    <meta name="twitter:card" content="summary_large_image" />
  </head><body></body></html>`;

let frontBody = null;       // ما يرجعه store_front (null ⇒ فشلُ الطلب)
let catalogBody = null;     // وما يرجعه store_catalog
let catalog2Missing = false; // 0229: خادمٌ بلا store_catalog2 (404) ⇒ الحافةُ ترجع للقديمة
let withRoot = false;        // قالبٌ فيه #root ⇒ الرفُّ يُرسم فعلاً (لفحص صور الرفّ المرسوم)
const rpcCalls = [];
globalThis.fetch = async (input) => {
  const u = String(input?.url ?? input);
  if (u.includes("/rpc/")) rpcCalls.push(u.split("/rpc/")[1]);
  if (u.includes("/rpc/store_catalog2") && catalog2Missing) return new Response(JSON.stringify({ code: "PGRST202" }), { status: 404 });
  if (u.endsWith("/store.html")) return new Response(withRoot ? SHELL.replace("<body></body>", '<body><div id="root"></div></body>') : SHELL, { status: 200 });
  if (u.includes("/rpc/store_front")) {
    if (!frontBody) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify(frontBody), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (u.includes("/rpc/store_catalog")) {
    if (!catalogBody) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify(catalogBody), { status: 200, headers: { "content-type": "application/json" } });
  }
  throw new Error(`fetch غير متوقَّع: ${u}`);
};

const built = await esbuild.build({
  entryPoints: ["api/store-og.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
});
const dir = mkdtempSync(join(tmpdir(), "og-"));
const file = join(dir, "og.mjs");
writeFileSync(file, built.outputFiles[0].text);
const handler = (await import(pathToFileURL(file).href).finally(
  () => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } },
)).default;

const render = async (front, slug = "alrahma", catalog = null) => {
  frontBody = front; catalogBody = catalog;
  const res = await handler(new Request(`https://doctorvet.vet/api/store-og?slug=${slug}`));
  return await res.text();
};
const metaOf = (html, key) => {
  const m = html.match(new RegExp(`<meta (?:property|name)="${key}" content="([^"]*)"`));
  return m ? m[1] : null;
};

console.log("▸ شعارٌ بمسارٍ ⇒ صورةُ البطاقة شعارُ العيادة");
const withPath = await render({ ok: true, name: "عيادة الرحمة", logo_url: `${CLINIC}/logo-k9.png` });
check("og:image رابطُ الدلو العامّ — نفسُ صيغة productImageUrl",
  metaOf(withPath, "og:image") === `${SUPA}/storage/v1/object/public/product-images/${CLINIC}/logo-k9.png`,
  String(metaOf(withPath, "og:image")));
check("  وtwitter:image مثلُها — لا وسمٌ يتيم", metaOf(withPath, "twitter:image") === metaOf(withPath, "og:image"));
check("  والبطاقةُ مربّعةٌ للشعار لا عريضة", metaOf(withPath, "twitter:card") === "summary", String(metaOf(withPath, "twitter:card")));
check("  ولا مقاسَ ١٢٠٠×٦٣٠ يكذب على شعارٍ مربّع", metaOf(withPath, "og:image:width") === null);
check("  والعنوانُ اسمُ العيادة لا اسمُ المنصّة", metaOf(withPath, "og:title") === "عيادة الرحمة — المتجر");
check("  ولا وسمَ مشاركةٍ مكرّرٌ بالرأس (القالبُ مُسح قبل الكتابة)",
  (withPath.match(/property="og:image"/g) || []).length === 1);

console.log("▸ شعارٌ `data:` قديم ⇒ يُتخطّى، ولا يدخل الرأسَ أبداً");
const withData = await render({ ok: true, name: "عيادة النور", logo_url: "data:image/png;base64,AAAABBBB" });
check("لا بايتاتٍ بالرأس — الزاحفُ يطلب رابطاً بشبكة", !withData.includes("data:image"), "دخلت");
check("  والبديلُ صورةُ المنصّة ١٢٠٠×٦٣٠", metaOf(withData, "og:image") === "https://doctorvet.vet/og.jpg");
check("  والبطاقةُ عريضةٌ لها", metaOf(withData, "twitter:card") === "summary_large_image");
check("  والاسمُ يبقى اسمَ العيادة", metaOf(withData, "og:title") === "عيادة النور — المتجر");

console.log("▸ بلا شعار ⇒ صورةُ المنصّة (استرجاعُ ما كان يُمحى)");
const noLogo = await render({ ok: true, name: "عيادة الأمل", logo_url: null });
check("og:image موجودةٌ — لا بطاقةً نصّيةً باهتة", metaOf(noLogo, "og:image") === "https://doctorvet.vet/og.jpg");
check("  وبمقاسها المعلن", metaOf(noLogo, "og:image:width") === "1200" && metaOf(noLogo, "og:image:height") === "630");

console.log("▸ الفشلُ يرجع القالبَ كما هو — لا رأسٌ نصفُ مبنيّ");
const failed = await render(null);
check("القالبُ بصورته الأصلية", metaOf(failed, "og:image") === "https://shell.invalid/og.jpg");
check("  وبعنوانه الأصليّ (ما انكتب اسمُ عيادةٍ ما وصلت)", failed.includes("<title>متجر العيادة</title>"));
const badSlug = await render({ ok: true, name: "x" }, "AB");
check("وslug غيرُ صالحٍ لا يصل الخادمَ أصلاً", badSlug.includes("<title>متجر العيادة</title>"));

console.log("▸ بذرةُ البيانات بالمستند — الرفُّ يُرسم بلا ذهابٍ وإياب");
const CAT = [{ id: "p1", name: "شامبو", price: 3500, available: true, image_path: null, category: "care", subcategory: null, descr: null, featured: true }];
const seeded = await render({ ok: true, name: "عيادة البذرة", logo_url: null }, "alrahma", CAT);
const bootOf = (html) => {
  const m = html.match(/<script type="application\/json" id="store-boot">([\s\S]*?)<\/script>/);
  return m ? JSON.parse(m[1].replace(/\\u003c/g, "<")) : null;
};
const boot = bootOf(seeded);
check("البذرةُ موجودةٌ بالمستند", !!boot);
check("  وفيها السلاگُ (مستندٌ مخبوءٌ لعيادةٍ أخرى أسوأُ من لا بذرة)", boot?.slug === "alrahma");
check("  والواجهةُ والكتلوج", boot?.front?.name === "عيادة البذرة" && boot?.catalog?.length === 1);
check("  و`<` مهرَّبٌ فلا يُنهي الوسمَ مبكّراً", !/<script[^>]*>[^<]*<\//.test(seeded.split('id="store-boot"')[1]?.slice(0, 200) ?? ""));
// كتلوجٌ فاشل ⇒ لا بذرة، والصفحةُ تبقى سليمةً بوسومها
const noCat = await render({ ok: true, name: "عيادة بلا بذرة", logo_url: null }, "alrahma", null);
check("فشلُ الكتلوج ⇒ لا بذرةَ ولا صفحةَ مكسورة", bootOf(noCat) === null && metaOf(noCat, "og:title") === "عيادة بلا بذرة — المتجر");
// بذرةٌ ضخمةٌ تُترك كلُّها
const HUGE = Array.from({ length: 400 }, (_, i) => ({ id: `p${i}`, name: "م".repeat(200), price: 1000, available: true, image_path: null, category: null, subcategory: null, descr: "و".repeat(200), featured: false }));
const huge = await render({ ok: true, name: "عيادة ضخمة", logo_url: null }, "alrahma", HUGE);
check("وبذرةٌ فوق ٦٤ كيلو تُترك — مستندٌ منتفخٌ يبطئ أكثرَ ممّا يسرّع", bootOf(huge) === null);
check("  والصفحةُ تبقى بوسومها", metaOf(huge, "og:title") === "عيادة ضخمة — المتجر");

console.log("▸ 0229 — البذرةُ من نفس أوّل نداءٍ للواجهة، والرفُّ بالمصغّر");
{
  const FRONT = { ok: true, name: "عيادة الأقسام", bio: null, logo_url: null };
  const ROW = (id, extra) => ({ id, name: `منتج ${id}`, price: 1000, available: true, image_path: `c1/${id}.jpg`, ...extra });
  rpcCalls.length = 0; catalog2Missing = false; withRoot = true;
  const h1 = await render(FRONT, "sections", [ROW("a", { thumb_path: "c1/a.thumb.jpg" }), ROW("b")]);
  withRoot = false;
  check("الحافةُ تنادي store_catalog2 (نفسُ ترتيب الواجهة — لا رفٌّ يُعاد ترتيبُه أمام الزبون)", rpcCalls.includes("store_catalog2") && !rpcCalls.includes("store_catalog"), rpcCalls.join(","));
  const painted = h1.slice(h1.indexOf('<div id="root">'));
  check("  والرفُّ المرسوم بالمصغّر حين وُجد، والكاملةُ احتياطُه", /src="[^"]*product-images\/c1\/a\.thumb\.jpg"/.test(painted) && /onerror="this\.onerror=null;this\.src='[^']*c1\/a\.jpg'"/.test(painted));
  check("  وبلا مصغّر: الصورةُ كاملة بلا onerror", /src="[^"]*product-images\/c1\/b\.jpg" alt="" width="400" height="400" class="[^"]*" \/>/.test(painted));
  rpcCalls.length = 0; catalog2Missing = true;
  const h2 = await render(FRONT, "sections", [ROW("c")]);
  check("  وخادمٌ قبل 0229 (404) ⇒ القديمةُ بنفس الصفحة، والرفُّ مرسوم", rpcCalls.join(",") === "store_front,store_catalog2,store_catalog" && h2.includes("c1/c.jpg"), rpcCalls.join(","));
  catalog2Missing = false;
}

console.log(fails ? `\n✗ og-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ og-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
