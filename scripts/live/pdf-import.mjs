/* ============================================================================
 * استيرادُ مكتبة الصور من PDF بالمتصفّح (التجريبيّ): ملفٌّ يصنعه jsPDF بصفحتين وستّة منتجات (كلُّ صورةٍ بلونٍ
 * يُعرف به)، وشعارٌ ورأسٌ يتكرّران ⇒ ستُّ صورٍ بأسمائها ورموزها، ومصغّراتٌ تظهر، وتصحيحُ اسمٍ و«لا ترفعها» يُحترمان،
 * والمرفوعُ صورُ المنتجات **نفسُها** (لونُ وسطها لونُها — القصُّ بالموضع الصحيح)، وصفرُ مخالفةٍ لسياسة المحتوى.
 *
 * `DIST=1`: يخدم `dist/` بخادمٍ صغير **برؤوس vercel.json** (سياسةُ المحتوى كالإنتاج — عاملُ pdf.js يُقاس عليها؛
 * يحتاج `npm run build` قبله). وبلاه: خادمُ التطوير (`LIVE_URL`، افتراضاً :5179) بلا رؤوس.
 * ==========================================================================*/
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  try { const { createRequire } = await import("node:module"); ({ chromium } = createRequire("/opt/node22/lib/node_modules/")("playwright")); } catch { /* */ }
}
if (!chromium) { console.error("✗ live-pdf-import: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync, statSync } = await import("node:fs");
const path = await import("node:path");
const http = await import("node:http");
const zlib = await import("node:zlib");
const { jsPDF } = await import("jspdf");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const DB_KEY = /DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ live-pdf-import: ما لكيت مفتاحَ قاعدة التجريبيّ"); process.exit(1); }
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ── الخادم ── */
let BASE = process.env.LIVE_URL ?? "http://localhost:5179";
let server = null;
if (process.env.DIST) {
  const root = path.resolve("dist");
  if (!existsSync(path.join(root, "index.html"))) { console.error("✗ live-pdf-import: dist/ غير مبنيّ — npm run build أوّلاً"); process.exit(1); }
  const v = JSON.parse(readFileSync("vercel.json", "utf8"));
  const headers = Object.fromEntries((v.headers.find((h) => h.source === "/(.*)")?.headers ?? []).map((h) => [h.key, h.value]));
  // الكاشفُ يُختبر بمخالفةٍ متعمَّدة: `CSP_BREAK=1` يمنع العاملَ — الفحصُ يجب أن يسقط.
  if (process.env.CSP_BREAK) headers["Content-Security-Policy"] = headers["Content-Security-Policy"].replace(/worker-src [^;]*/, "worker-src 'none'");
  const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".wasm": "application/wasm" };
  server = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, "http://x").pathname);
    let f = path.join(root, u);
    if (!f.startsWith(root) || !existsSync(f) || statSync(f).isDirectory()) f = path.join(root, "index.html");
    res.writeHead(200, { ...headers, "Content-Type": types[path.extname(f)] ?? "application/octet-stream" });
    res.end(readFileSync(f));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  BASE = `http://127.0.0.1:${server.address().port}`;
  check("الخادمُ يرسل سياسةَ المحتوى", !!headers["Content-Security-Policy"]?.includes("worker-src"));
}

/* ── الملف: صفحتان، ثلاثةُ منتجاتٍ بكلّ صفحة، وشعارٌ ورأسٌ بكلّ صفحة ── */
const png = (w, h, rgb) => {
  const crc = (b) => { const o = Buffer.alloc(4); o.writeUInt32BE(zlib.crc32(b) >>> 0); return o; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); return Buffer.concat([len, td, crc(td)]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set(rgb, y * (w * 3 + 1) + 1 + x * 3);
  return "data:image/png;base64," + Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]).toString("base64");
};
const PRODUCTS = [
  ["Royal Canin Kitten 2 kg", "3182550702973", [220, 30, 60]],
  ["Whiskas Tuna Pouch 85 g", "5000166071001", [30, 90, 230]],
  ["Pro Plan Adult Dog 3 kg", "7613035120402", [20, 160, 60]],
  ["Felix Salmon Jelly 100 g", "7613034152671", [240, 160, 10]],
  ["Me-O Tuna Cat Food 1.2 kg", "8850477008919", [120, 40, 200]],
  ["Brit Care Lamb 400 g", "8595602509911", [10, 150, 170]],
];
const doc = new jsPDF({ unit: "pt", format: "a4" });
const logo = png(200, 60, [90, 90, 90]);
PRODUCTS.forEach(([name, code, rgb], i) => {
  if (i % 3 === 0) {
    if (i) doc.addPage();
    doc.addImage(logo, "PNG", 30, 20, 100, 30);
    doc.setFontSize(12); doc.text("Pet Line Distribution Catalog 2026", 200, 40);
  }
  const x = 40 + (i % 3) * 180, y = 120;
  doc.addImage(png(300, 300, rgb), "PNG", x, y, 150, 150);
  doc.setFontSize(11); doc.text(name, x, y + 170);
  doc.setFontSize(9); doc.text(`Barcode: ${code}`, x, y + 185);
  doc.text(`Price ${12000 + i * 1000} IQD`, x, y + 198);
});
const pdfBytes = Buffer.from(doc.output("arraybuffer"));

/* ── المتصفّح ── */
const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [], csp = [];
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad", serviceWorkers: "block" });
await ctx.addInitScript(([k, v, sk, sv]) => {
  if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); }
  document.addEventListener("securitypolicyviolation", (e) => { (window.__csp ??= []).push(`${e.violatedDirective} ${e.blockedURI}`); });
}, [DB_KEY, JSON.stringify({ products: [], imageLibrary: [], companies: [] }), "vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text().slice(0, 200)); });

console.log("▸ ١) القراءة");
await page.goto(`${BASE}/photos/library`, { waitUntil: "domcontentloaded" });
await page.locator("[data-libpdf-pick]").waitFor({ timeout: 30000 });
await page.locator("[data-libpdf-input]").setInputFiles({ name: "catalog.pdf", mimeType: "application/pdf", buffer: pdfBytes });
const found = await page.locator("[data-libpdf-found]").waitFor({ timeout: 60000 }).then(() => page.locator("[data-libpdf-found]").getAttribute("data-libpdf-found"), () => null);
check("ستُّ صور منتجات (الشعارُ المتكرّر خارجها)", found === "6", String(found) + " " + (await page.locator("[data-libpdf-err]").allInnerTexts()).join(" "));
const names = await page.locator("[data-libpdf-name]").evaluateAll((els) => els.map((e) => e.value));
const codes = await page.locator("[data-libpdf-code]").evaluateAll((els) => els.map((e) => e.value));
for (const [name, code] of PRODUCTS) check(`«${name}» برمزه`, names.includes(name) && codes[names.indexOf(name)] === code, JSON.stringify({ names, codes }));
check("الرأسُ والسعرُ ليسا بأيّ اسم", names.every((n) => !/catalog|price|iqd/i.test(n)));
await page.waitForFunction(() => document.querySelectorAll("[data-libpdf-item] img").length === 6 && [...document.querySelectorAll("[data-libpdf-item] img")].every((i) => i.complete && i.naturalWidth > 0), null, { timeout: 60000 }).catch(() => {});
check("المصغّراتُ الستّ ظهرت", await page.locator("[data-libpdf-item] img").evaluateAll((els) => els.filter((i) => i.complete && i.naturalWidth > 0).length) === 6);

if (process.env.SHOTS) {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator("[data-libpdf-company]").fill("Pet Line");
  await page.locator("[data-libpdf-kind]").fill("قطط");
  await page.locator("[data-libpdf]").scrollIntoViewIfNeeded();
  await page.locator("[data-libpdf]").screenshot({ path: `${process.env.SHOTS}/pdf-import-review.png` });
}

console.log("▸ ٢) المراجعة والرفع");
await page.locator("[data-libpdf-company]").fill("Pet Line");
await page.locator("[data-libpdf-kind]").fill("قطط");
const item = (name) => page.locator("[data-libpdf-item]", { has: page.locator(`[data-libpdf-name][value="${name}"]`) });
// تصحيحُ اسم، و«لا ترفعها» لواحدة
const i2 = page.locator("[data-libpdf-item]").nth(1);
const oldName = await i2.locator("[data-libpdf-name]").inputValue();
await i2.locator("[data-libpdf-name]").fill("Whiskas Tuna Pouch 85 g — جديد");
const i6key = await page.locator("[data-libpdf-item]").nth(5).getAttribute("data-libpdf-item");
await page.locator("[data-libpdf-item]").nth(5).locator("[data-libpdf-skip]").check();
check("الخطّة: خمسٌ تنرفع", (await page.locator("[data-plan-new]").getAttribute("data-plan-new")) === "5");
void item;
await page.locator("[data-libpdf-go]").click();
await page.waitForFunction(() => !document.querySelector("[data-libpdf-stop]") && document.querySelector("[data-libpdf-run]"), null, { timeout: 90000 });
await page.waitForTimeout(500);
const lib = await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").imageLibrary ?? [], DB_KEY);
check("خمسُ صورٍ بالمكتبة", lib.length === 5, String(lib.length));
check("  والاسمُ المصحَّح كما كُتب", lib.some((r) => r.name === "Whiskas Tuna Pouch 85 g — جديد") && !lib.some((r) => r.name === oldName));
check("  والمتخطّاةُ ما انرفعت", !lib.some((r) => r.name === "Brit Care Lamb 400 g"), i6key);
check("  والشركةُ والصنفُ على كلّها", lib.every((r) => r.company === "Pet Line" && r.kind === "قطط"));
// القصُّ بالموضع الصحيح: لونُ وسط كلّ صورةٍ مرفوعة لونُ منتجها.
const colors = await page.evaluate(async (rows) => {
  const out = {};
  for (const r of rows) {
    const im = new Image(); im.src = r.path; await im.decode();
    const c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(im, 0, 0);
    out[r.barcode] = [...g.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data.slice(0, 3)];
  }
  return out;
}, lib);
for (const [name, code, rgb] of PRODUCTS.slice(0, 5)) {
  const got = colors[code];
  check(`  صورةُ «${name}» لونُها (القصُّ بموضعه)`, !!got && got.every((v, i) => Math.abs(v - rgb[i]) <= 12), JSON.stringify(got));
}

console.log("▸ ٣) الاستئناف بلا تكرار");
await page.locator("[data-libpdf-input]").setInputFiles({ name: "catalog.pdf", mimeType: "application/pdf", buffer: pdfBytes });
await page.locator("[data-libpdf-found]").waitFor({ timeout: 60000 });
await page.locator("[data-libpdf-company]").fill("Pet Line");
await page.locator("[data-libpdf-kind]").fill("قطط");
check("نفسُ الملف ثانيةً: الموجودُ يُتخطّى بالباركود ولو تغيّر اسمُه (تنرفع ١: المتخطّاةُ وحدها)", (await page.locator("[data-plan-new]").getAttribute("data-plan-new")) === "1", await page.locator("[data-plan-new]").getAttribute("data-plan-new"));

const violations = [...csp, ...(await page.evaluate(() => window.__csp ?? []))];
check("صفرُ مخالفةٍ لسياسة المحتوى", violations.length === 0, violations.join(" | "));
check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | "));
await browser.close();
server?.close();
console.log(`${fails ? "✗" : "✓"} live-pdf-import: ${passes} نجح، ${fails} فشل${process.env.DIST ? " (dist برؤوس vercel.json)" : ""}`);
process.exit(fails ? 1 : 0);
