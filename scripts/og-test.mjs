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
globalThis.fetch = async (input) => {
  const u = String(input?.url ?? input);
  if (u.endsWith("/store.html")) return new Response(SHELL, { status: 200 });
  if (u.includes("/rpc/store_front")) {
    if (!frontBody) return new Response("nope", { status: 500 });
    return new Response(JSON.stringify(frontBody), { status: 200, headers: { "content-type": "application/json" } });
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

const render = async (front, slug = "alrahma") => {
  frontBody = front;
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

console.log(fails ? `\n✗ og-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ og-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
