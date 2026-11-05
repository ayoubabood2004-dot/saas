/* ============================================================================
 * فحصٌ حيٌّ لعرض الصفحات بالهاتف — متصفّحٌ حقيقيّ بمحاكاة iPhone 13 (٣٩٠px).
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     npm run live:mobile-width                 # أو: MW_WIDTH=360 لعرضٍ آخر
 *
 * لماذا: صفحةٌ أعرضُ من الشاشة يصغّرها متصفّحُ الهاتف كلَّها، وتصير كلُّ نافذةٍ
 * `fixed inset-0` بعرض الصفحة لا الشاشة فتنقصّ من اليسار. مقيسٌ قبل الإصلاح:
 * الإعدادات ٤٥٣ (صفُّ أسعار الخدمات: سعرٌ وكلفةٌ وباركود ~٤٠٠px بصفٍّ ٢٩٠ — الاسمُ
 * صفرٌ وزرُّ الحذف و«+ مستهلكات» خارج اللمس)، والرئيسية ٤٣٩ والبيع ٥٥٥ (شبكةٌ بلا
 * قالبِ أعمدةٍ تحت lg: العمودُ الضمنيّ `auto` لا ينزل تحت أعرض محتوى — مخطّطُ
 * recharts يرسم SVG بعرضٍ مقيس فيُمسك العمودَ عريضاً)، وتبويباتُ البيع الستّ ٥٢٠px.
 *
 * والفحصُ يقيس بإحداثيات المستند (`scrollX`): الإعداداتُ تُمرَّر أفقياً عند الفتح
 * فتبدو إحداثياتُ النافذة كأن الصفحةَ كلَّها مزاحة — وهكذا ضُلِّل القياسُ الأوّل
 * فاتّهم شريطَ الأقسام. ويتجاهل `fixed` (لا يمدّ الصفحة) وما داخل حاوٍ يقصّ أفقياً.
 *
 * يقول ما فحص وما تخطّى: المساراتُ تُقرأ من App.tsx، ومعرّفُ الحيوان من بذرة الديمو،
 * ومسارٌ بمعاملٍ لا نعرفه يُعدّ «لم يُفحص»، ومسارٌ تحوّل (ميزةٌ مقفلةٌ بالديمو) كذلك.
 * ==========================================================================*/
let chromium, devices;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium, devices } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-mobile-width: ما لكيت playwright. ركّبه: npm i -D playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const WIDTH = Number(process.env.MW_WIDTH ?? 390);
const SESSION = { raw: { id: "demo-admin", full_name: "مدير الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

/* المساراتُ من مصدرها لا من قائمةٍ بيد: صفحةٌ جديدة تدخل الفحصَ وحدها. */
const app = readFileSync("src/App.tsx", "utf8");
// والرئيسيةُ (`/`) بـHomeRoute لا بـProtected — وهي لوحةُ الكادر، فتُضاف بيد.
const paths = ["/", ...[...app.matchAll(/<Route path="([^"]+)" element=\{<Protected>/g)].map((m) => m[1])];
const PET = /id: "(pet_[a-z]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
if (!paths.length || !PET) { console.error("✗ live-mobile-width: ما انقرأت المسارات من App.tsx أو معرّفُ الحيوان من demoStore.ts"); process.exit(1); }
const PARAMS = { petId: PET };
const routes = [], skipped = [];
for (const p of paths) {
  const missing = [...p.matchAll(/:(\w+)/g)].map((m) => m[1]).filter((k) => !(k in PARAMS));
  if (missing.length) { skipped.push(`${p} (معاملٌ بلا قيمة: ${missing.join("، ")})`); continue; }
  routes.push(p.replace(/:(\w+)/g, (_, k) => PARAMS[k]));
}

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const browser = await chromium.launch({ headless: true, executablePath: B });
const phone = devices["iPhone 13"];
const ctx = await browser.newContext({ ...phone, viewport: { ...phone.viewport, width: WIDTH }, screen: { ...phone.screen, width: WIDTH }, locale: "ar-IQ" });
await ctx.addInitScript(([sk, sv]) => { localStorage.setItem(sk, sv); }, ["vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
try { await page.goto(BASE, { waitUntil: "domcontentloaded", timeout: 8000 }); }
catch { console.error(`✗ live-mobile-width: خادمُ التطوير ما يجاوب على ${BASE} — شغّله أوّلاً`); process.exit(1); }

/** عرضُ المستند، وأوّلُ موضعٍ يخرج منه المحتوى (أبوه داخل الشاشة وهو خارجها). */
const measure = () => page.evaluate(() => {
  const sx = window.scrollX, vw = document.documentElement.clientWidth;
  const inFixed = (el) => { for (let p = el; p; p = p.parentElement) if (getComputedStyle(p).position === "fixed") return true; return false; };
  const clipped = (el) => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (getComputedStyle(p).overflowX !== "visible") return true; return false; };
  const R = (el) => { const b = el.getBoundingClientRect(); return { l: Math.round(b.left + sx), r: Math.round(b.right + sx), w: Math.round(b.width) }; };
  const out = (el) => { const b = R(el); return b.w > 0 && (b.l < -1 || b.r > vw + 1); };
  const cls = (el) => String(el.getAttribute("class") ?? "").slice(0, 80);
  const leaks = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (!out(el) || inFixed(el) || clipped(el) || (el.parentElement && out(el.parentElement))) continue;
    const b = R(el);
    leaks.add(`${b.l}…${b.r} <${el.tagName.toLowerCase()} class="${cls(el)}"> بأبٍ <${el.parentElement.tagName.toLowerCase()} class="${cls(el.parentElement)}">`);
  }
  return { path: location.pathname, sw: document.documentElement.scrollWidth, vw, leaks: [...leaks].slice(0, 3) };
});

console.log(`\n▸ كلُّ صفحةٍ بعرض الشاشة (${WIDTH}px):`);
for (const r of routes) {
  await page.goto(BASE + r, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  const m = await measure();
  if (m.path !== r) { skipped.push(`${r} (تحوّل إلى ${m.path})`); continue; }
  check(`${r} — ${m.sw}px`, m.sw === m.vw, m.leaks.join(" ‖ "));
}

/* الحارسُ الأصليّ للبلاغ: نافذةٌ ثابتة بالإعدادات بعرض الشاشة، وصفُّ الخدمة يُرى ويُلمس. */
console.log("\n▸ الإعدادات — صفُّ أسعار الخدمات والنوافذ الثابتة:");
await page.goto(BASE + "/settings", { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
const rows = await page.evaluate(() => [...document.querySelectorAll("[data-svcdel]")].map((del) => {
  const row = del.parentElement, name = row.firstElementChild?.firstElementChild, b = del.getBoundingClientRect();
  return { name: name?.textContent ?? "", nameW: Math.round(name?.getBoundingClientRect().width ?? 0), delL: Math.round(b.left), delR: Math.round(b.right) };
}));
check("بالبذرة صفوفُ خدماتٍ تُفحص", rows.length > 0, "ما لكيت [data-svcdel] — تغيّر الصفّ؟ حدّث الفحص");
const hidden = rows.filter((x) => x.nameW < 40);
check("اسمُ كلِّ خدمةٍ ظاهر (≥ ٤٠px)", !hidden.length, hidden.slice(0, 3).map((x) => `${x.name}: ${x.nameW}px`).join("، "));
const offscreen = rows.filter((x) => x.delL < 0 || x.delR > WIDTH);
check("زرُّ حذف كلِّ خدمةٍ داخل الشاشة", !offscreen.length, offscreen.slice(0, 3).map((x) => `${x.name}: ${x.delL}…${x.delR}`).join("، "));
await page.locator("[data-svcrcp]").first().click({ timeout: 5000 }).catch(() => {});
await page.waitForTimeout(1000);
const modal = await page.evaluate(() => {
  const m = [...document.querySelectorAll(".fixed.inset-0")].find((e) => e.getBoundingClientRect().height > 200);
  if (!m) return null; const b = m.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right) };
});
check("«+ مستهلكات» يُلمس ويفتح نافذةً بعرض الشاشة", !!modal && modal.l === 0 && modal.r === WIDTH, modal ? `${modal.l}…${modal.r}` : "ما انفتحت نافذة — الزرُّ مغطّى؟");

console.log(`\nفُحصت ${routes.length - skipped.filter((s) => s.includes("تحوّل")).length} صفحة بعرض ${WIDTH}px.`);
if (skipped.length) console.log(`لم يُفحص (${skipped.length}):\n   · ${skipped.join("\n   · ")}`);
console.log(`${fails ? "✗" : "✓"} live-mobile-width: ${passes} نجح، ${fails} فشل`);
await browser.close();
process.exit(fails ? 1 : 0);
