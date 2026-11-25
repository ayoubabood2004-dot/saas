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

console.log("▸ ٤) كاتالوجٌ مصمَّم (Canva): صورةٌ لكلّ صفحة أعرضُ منها، وصفرُ نصّ، والاسمُ والباركودُ داخل الصورة");
{
  // مقيسٌ على كاتالوج المالك (٢٥/١١): صندوقُ الصورة أعرضُ من الصفحة ويُقصّ بحدودها، والمنتجُ وسط بياض.
  const { createCanvas } = await import("@napi-rs/canvas");
  const LC = ["0001101", "0011001", "0010011", "0111101", "0100011", "0110001", "0101111", "0111011", "0110111", "0001011"];
  const GC = ["0100111", "0110011", "0011011", "0100001", "0011101", "0111001", "0000101", "0010001", "0001001", "0010111"];
  const RC = LC.map((x) => x.replace(/./g, (b) => (b === "1" ? "0" : "1")));
  const FIRST = ["LLLLLL", "LLGLGG", "LLGGLG", "LLGGGL", "LGLLGG", "LGGLLG", "LGGGLL", "LGLGLG", "LGLGGL", "LGGLGL"];
  const modules = (c) => "101" + [...c.slice(1, 7)].map((d, i) => (FIRST[+c[0]][i] === "L" ? LC : GC)[+d]).join("") + "01010" + [...c.slice(7)].map((d) => RC[+d]).join("") + "101";
  const CANVA = [["SALMON PATE", "6970967773283", "#f3c9a8"], ["CHICKEN PUMPKIN", "6970967773306", "#c7e3f5"]];
  const art = (title, code, color) => {
    const c = createCanvas(1600, 1100), g = c.getContext("2d");
    g.fillStyle = "#dddddd"; g.fillRect(0, 0, 1600, 1100);              // ما خارج الصفحة (يُقصّ)
    g.fillStyle = "#ffffff"; g.fillRect(395, 0, 810, 1100);             // الصفحةُ البيضاء
    g.fillStyle = color; g.fillRect(450, 300, 700, 500);                // العلبة
    g.fillStyle = "#1a2340"; g.font = "bold 64px sans-serif"; g.fillText(title, 490, 400);
    g.fillStyle = "#ffffff"; g.fillRect(590, 560, 440, 200);            // ملصقُ الباركود
    g.fillStyle = "#000000";
    [...modules(code)].forEach((b, i) => { if (b === "1") g.fillRect(620 + i * 4, 580, 4, 160); });
    return "data:image/png;base64," + c.toBuffer("image/png").toString("base64");
  };
  const cdoc = new jsPDF({ unit: "pt", format: [810, 1012] });
  CANVA.forEach(([title, code, color], i) => {
    if (i) cdoc.addPage([810, 1012]);
    cdoc.addImage(art(title, code, color), "PNG", -395, -44, 1600, 1100);
  });
  const cbytes = Buffer.from(cdoc.output("arraybuffer"));
  await page.locator("[data-libpdf-input]").setInputFiles({ name: "canva.pdf", mimeType: "application/pdf", buffer: cbytes });
  await page.waitForFunction(() => document.querySelector("[data-libpdf-found]")?.getAttribute("data-libpdf-found") === "2", null, { timeout: 60000 }).catch(() => {});
  check("صورتان (الصورةُ الوحيدةُ التي تغطّي الصفحة منتجٌ لا خلفيّة)", (await page.locator("[data-libpdf-found]").getAttribute("data-libpdf-found")) === "2");
  check("  والصفحتان بلا نصّ تُقالان", await page.locator("[data-libpdf-scanned]").count() === 1);
  await page.waitForFunction(() => document.querySelectorAll("[data-libpdf-fromimg]").length === 2 && !document.querySelector("[data-libpdf-coding]"), null, { timeout: 90000 }).catch(() => {});
  const ccodes = await page.locator("[data-libpdf-code]").evaluateAll((els) => els.map((e) => e.value));
  check("الباركودُ قُرئ من خطوط الصورة لكلتيهما", ccodes.join() === CANVA.map((x) => x[1]).join(), JSON.stringify(ccodes));
  check("  بعلامة «من الصورة»", await page.locator("[data-libpdf-fromimg]").count() === 2);
  const first = page.locator("[data-libpdf-item]").first();
  check("الاسمُ فارغٌ (لا نصَّ بالملف) — لا يُخترع", (await first.locator("[data-libpdf-name]").inputValue()) === "");
  // تكبير
  await first.locator("[data-libpdf-zoom]").click();
  await page.waitForFunction(() => { const i = document.querySelector("[data-libpdf-zoomed] img"); return i && i.complete && i.naturalWidth > 240 && !i.className.includes("opacity"); }, null, { timeout: 30000 }).catch(() => {});
  const zw = await page.locator("[data-libpdf-zoomed] img").evaluate((i) => [i.naturalWidth, i.naturalHeight]).catch(() => null);
  // الأصلُ بكسلٌ لكلّ نقطة والعلبةُ ٧٠٠ نقطة: التكبيرُ بدقّة الأصل (٧٠٠ وزيادةُ الهامش) لا تكبيرُ المصغّرة (٢٤٠).
  check("التكبيرُ بدقّة الأصل لا المصغّرة", !!zw && Math.max(...zw) >= 700, JSON.stringify(zw));
  check("  والصورةُ مقصوصةٌ للعلبة (لا الصفحةُ البيضاء كلُّها)", !!zw && zw[0] / zw[1] > 1.25 && zw[0] / zw[1] < 1.6, JSON.stringify(zw));
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/pdf-import-zoom.png` });
  await page.keyboard.press("Escape");
  await page.locator("[data-libpdf-zoomed]").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
  // اقرا النص
  await first.locator("[data-libpdf-ocr]").click();
  await first.locator("[data-libpdf-chips], [data-libpdf-ocr-empty], [data-libpdf-ocr]").first().waitFor({ timeout: 5000 }).catch(() => {});
  await page.waitForFunction(() => { const it = document.querySelector("[data-libpdf-item]"); return it?.querySelector("[data-libpdf-chips], [data-libpdf-ocr-empty]") || /ما كدرت|Couldn/.test(it?.querySelector("[data-libpdf-ocr]")?.textContent ?? ""); }, null, { timeout: 120000 }).catch(() => {});
  const chips = await first.locator("[data-libpdf-chip]").allInnerTexts();
  check("«اقرا النص من الصورة» يطلّع رقاقات", chips.some((x) => /SALMON/i.test(x)), JSON.stringify(chips));
  check("  والاسمُ ما انكتب وحده", (await first.locator("[data-libpdf-name]").inputValue()) === "");
  const chip = first.locator("[data-libpdf-chip]").filter({ hasText: /SALMON/i }).first();
  if (await chip.count()) await chip.click();
  const typed = await first.locator("[data-libpdf-name]").inputValue();
  check("  والضغطةُ تضيفها للاسم", /SALMON/i.test(typed), typed);
  if (process.env.SHOTS) { await page.locator("[data-libpdf]").scrollIntoViewIfNeeded(); await page.locator("[data-libpdf]").screenshot({ path: `${process.env.SHOTS}/pdf-import-canva.png` }); }
  // الرفع: الأولى باسمها، والثانية بلا اسم ⇒ لا تُرفع
  await page.locator("[data-libpdf-company]").fill("Canva Co");
  await page.locator("[data-libpdf-kind]").fill("قطط");
  check("الخطّة: واحدةٌ تنرفع (بلا اسم لا تُرفع)", (await page.locator("[data-plan-new]").getAttribute("data-plan-new")) === "1");
  // زرٌّ معطّل (القراءةُ فشلت فلا اسم) فشلٌ يُقال لا انهيار — وإلا ما وصل الفحصُ سؤالَ سياسة المحتوى تحت.
  if (await page.locator("[data-libpdf-go]").isEnabled()) {
    await page.locator("[data-libpdf-go]").click();
    await page.waitForFunction(() => !document.querySelector("[data-libpdf-stop]") && document.querySelector("[data-libpdf-run]"), null, { timeout: 90000 });
  }
  await page.waitForTimeout(500);
  const rows = (await page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}").imageLibrary ?? [], DB_KEY)).filter((r) => r.company === "Canva Co");
  check("انرفعت باسمها وباركود الصورة", rows.length === 1 && /SALMON/i.test(rows[0].name) && rows[0].barcode === CANVA[0][1], JSON.stringify(rows.map((r) => [r.name, r.barcode])));
  const dims = rows[0] ? await page.evaluate(async (src) => { const im = new Image(); im.src = src; await im.decode(); return [im.naturalWidth, im.naturalHeight]; }, rows[0].path) : null;
  check("  والمرفوعةُ مقصوصةٌ للعلبة", !!dims && dims[0] / dims[1] > 1.25 && dims[0] / dims[1] < 1.6, JSON.stringify(dims));
}

const violations = [...csp, ...(await page.evaluate(() => window.__csp ?? []))];
check("صفرُ مخالفةٍ لسياسة المحتوى", violations.length === 0, violations.join(" | "));
check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | "));
await browser.close();
server?.close();
console.log(`${fails ? "✗" : "✓"} live-pdf-import: ${passes} نجح، ${fails} فشل${process.env.DIST ? " (dist برؤوس vercel.json)" : ""}`);
process.exit(fails ? 1 : 0);
