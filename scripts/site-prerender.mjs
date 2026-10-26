/* ============================================================================
 * توليدُ الموقع التسويقيّ (٢٥/١٠) — يجري بعد `vite build` و`vite build -c vite.site-ssr.config.ts`.
 *
 *   1) يقرأ `dist/site.html` (القالبُ ومعه حزمُ المتصفّح المختومة).
 *   2) يسأل `public_pricing()` بالمفتاح العامّ إن وُجدت مفاتيحُ السحابة (بناءُ Vercel)؛ وإلا — أو فشل —
 *      يأخذ أسعارَ الأساس من `plans.ts` (المصدرُ نفسُه الذي يقرأه التطبيق). والمتصفّحُ يعيد السؤالَ بعد
 *      التحميل، فالسعرُ المعروضُ يلحق تعديلَ المالك بلا نشر.
 *   3) يرسم كلَّ صفحةٍ × كلَّ نسخة إلى `dist/<path>/index.html` برأسها ولغتها واتجاهها.
 *   4) يكتب `dist/sitemap.xml` بكلّ الصفحات وتبادل `hreflang`.
 *
 *   node scripts/site-prerender.mjs
 * ==========================================================================*/
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { pathToFileURL } from "node:url";

const T0 = Date.now();
if (!existsSync("dist/site.html")) { console.error("✗ site-prerender: dist/site.html مفقود — شغّل vite build أوّلاً"); process.exit(1); }
if (!existsSync("dist-site-ssr/entry-server.js")) { console.error("✗ site-prerender: dist-site-ssr/entry-server.js مفقود — vite build -c vite.site-ssr.config.ts"); process.exit(1); }

const tpl = readFileSync("dist/site.html", "utf8");
if (!tpl.includes('<meta name="site-head" content="" />') && !tpl.includes('<meta name="site-head" content="">')) {
  console.error("✗ site-prerender: علامةُ site-head مفقودة بالقالب"); process.exit(1);
}
const S = await import(pathToFileURL(join(process.cwd(), "dist-site-ssr/entry-server.js")).href);

/* ── الأسعار ── */
function basePricing() {
  const usd = {};
  for (const p of S.BASE_PLANS) if (["basic", "advanced", "super"].includes(p.id)) usd[p.id] = { monthly: p.monthlyUsd, annual: p.annualUsd };
  return { usd, usdRate: S.DEFAULT_USD_RATE, local: {}, at: new Date().toISOString(), source: "plans.ts" };
}
async function livePricing() {
  const url = (process.env.VITE_SUPABASE_URL ?? "").trim().replace(/\/+$/, "");
  const key = (process.env.VITE_SUPABASE_ANON_KEY ?? "").trim();
  if (!url || !key) return null;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 8000);
    const res = await fetch(`${url}/rest/v1/rpc/public_pricing`, {
      method: "POST", body: "{}", signal: ctl.signal,
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    });
    clearTimeout(t);
    if (!res.ok) { console.log(`   ℹ public_pricing: HTTP ${res.status} — أسعارُ الأساس`); return null; }
    const j = await res.json();
    if (!j?.usd?.basic) return null;
    return { ...j, source: "public_pricing()" };
  } catch (e) {
    console.log(`   ℹ public_pricing: ${e?.message ?? e} — أسعارُ الأساس`);
    return null;
  }
}
const pricing = (await livePricing()) ?? basePricing();
console.log(`▸ الأسعار من ${pricing.source}: basic $${pricing.usd.basic.monthly} · usd_rate ${pricing.usdRate}`);

/* ── الرسم ── */
const year = new Date().getFullYear();
const routes = S.routes();
let bytes = 0;
for (const r of routes) {
  const out = S.render(r, pricing, year);
  // الحقنُ بدالّةٍ لا بنصّ: نصُّ الاستبدال يفسّر `$&` و`$'` — ورمزُ الدولار بخصائص المحوِّل («$&quot;»)
  // كان يُدخل المطابَقَ نفسَه وسطَ الخاصيّة فينكسر الاقتباسُ ويُطبع JSON نصّاً على الصفحة.
  const html = tpl
    .replace(/<html[^>]*>/, () => `<html lang="${out.lang}" dir="${out.dir}">`)
    .replace(/<meta name="site-head" content="" ?\/?>/, () => out.head)
    .replace('<div id="root"></div>', () => `<div id="root">${out.html}</div>`);
  // المحقونُ كلُّه بمكانه حرفاً بحرف — لا أوّلُه وحده (أوّلُ ٤٠ حرفاً كانت تمرّ والكسرُ بعدها).
  if (html.includes('name="site-head"') || !html.includes(`<div id="root">${out.html}</div>`) || !html.includes(out.head)) {
    console.error(`✗ site-prerender: الحقنُ فشل لـ${r.path}`); process.exit(1);
  }
  const file = join("dist", r.path, "index.html");
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, html);
  bytes += html.length;
}

/* ── خريطةُ الموقع: كلُّ صفحةٍ بنسخها كلّها (hreflang ذهاباً وإياباً) ── */
const byKey = new Map();
for (const r of routes) {
  if (!r.edition) continue;
  const k = `${r.kind}:${r.slug ?? ""}`;
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(r);
}
const EDS = new Map(routes.filter((r) => r.edition && r.kind === "home").map((r) => [r.edition, r]));
const hreflangOf = (code) => (code === "en" ? "en" : `ar-${code.toUpperCase()}`);
let urls = "";
for (const group of byKey.values()) {
  const alts = group.map((g) => `    <xhtml:link rel="alternate" hreflang="${hreflangOf(g.edition)}" href="${S.ORIGIN}${g.path}"/>`).join("\n")
    + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${S.ORIGIN}${group.find((g) => g.edition === "en")?.path ?? group[0].path}"/>`;
  for (const r of group) urls += `  <url>\n    <loc>${S.ORIGIN}${r.path}</loc>\n${alts}\n  </url>\n`;
}
for (const r of routes.filter((x) => !x.edition)) urls += `  <url>\n    <loc>${S.ORIGIN}${r.path}</loc>\n  </url>\n`;
writeFileSync("dist/sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls}</urlset>\n`);

console.log(`✓ site-prerender: ${routes.length} صفحةً (${EDS.size} نسخة)، ${(bytes / 1024 / 1024).toFixed(1)}MB، و${byKey.size} مجموعةَ hreflang بخريطة الموقع (${Date.now() - T0}ms)`);
