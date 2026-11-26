/* ============================================================================
 * «صور مقترحة لمنتجاتك» بالمتصفّح (التجريبيّ): الشريطُ بصفحة الصور والمتجر، والأقسامُ الثلاثة، و«اقبلها كلها»
 * بنافذةٍ لا window.confirm، و«مو هاي» يبقى بعد إعادة التحميل، وما تبدّلت صورتُه أثناء الصفحة لا يُكتب فوقه،
 * والاستبدالُ، وعرضُ الهاتف بلا تمريرٍ جانبيّ.
 *
 * يحتاج خادمَ التطوير: `npx vite --port 5179` (أو LIVE_URL).
 * ==========================================================================*/
let chromium;
try { ({ chromium } = await import("playwright")); } catch {
  try { const { createRequire } = await import("node:module"); ({ chromium } = createRequire("/opt/node22/lib/node_modules/")("playwright")); } catch { /* */ }
}
if (!chromium) { console.error("✗ live-photo-match: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const DB_KEY = /DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ live-photo-match: ما لكيت مفتاحَ قاعدة التجريبيّ بـdemoKey.ts"); process.exit(1); }
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const img = (color) => `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" fill="${color}"/></svg>`)}`;
const LIB = [
  { id: "l1", name: "Royal Canin Kitten Dry 2 kg", barcode: "3182550702973", company: "Pet Line", path: img("#e11d48") },
  { id: "l2", name: "Whiskas Tuna Pouch 85g", barcode: null, company: null, path: img("#2563eb") },
  { id: "l3", name: "Whiskas Chicken Pouch 85g", barcode: null, company: null, path: img("#16a34a") },
  { id: "l4", name: "Felix Salmon Jelly Pouch 100g", barcode: null, company: null, path: img("#f59e0b") },
  { id: "l5", name: "Pro Plan Adult Dog 3kg", barcode: "7613035120402", company: null, path: img("#7c3aed") },
  { id: "l6", name: "Me-O Tuna Cat Food 1.2 kg", barcode: "8850477008919", company: null, path: img("#0891b2") },
].map((r) => ({ ...r, kind: null, agency: null, section: null, clinic_id: null, updated_at: "2026-11-01T00:00:00.000Z" }));
const prod = (id, name, extra = {}) => ({ id, name, barcode: null, alt_codes: [], category: "food", sell_price: 1000, stock: 5, clinic_id: "c1", created_at: "2026-01-01T00:00:00.000Z", ...extra });
const seedDB = () => ({
  products: [
    prod("p1", "رويال كانين قطط صغار", { barcode: "3182550702973" }),     // باركود
    prod("p6", "مي-او تونة", { alt_codes: ["8850477008919"] }),          // باركود إضافيّ
    prod("p2", "Whiskas Tuna Pouch 85 gm"),                               // اسمٌ قويّ
    prod("p3", "Felix Pouch"),                                             // تخمين
    prod("p4", "Pro Plan Adult 3 kg", { barcode: "7613035120402", image_path: img("#000000") }), // عنده صورة ⇒ استبدال
    prod("p5", "Dog Leash"),                                               // لا شيء
  ],
  companies: [], companySections: [], imageLibrary: LIB,
  purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [], appointments: [], admissions: [], reminders: [], treatments: [],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
await ctx.addInitScript(([k, v, sk, sv]) => {
  if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); }
}, [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const db = () => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "{}"), DB_KEY);
const imgOf = async (pid) => (await db()).products.find((p) => p.id === pid)?.image_path ?? null;

console.log("▸ ١) الشريطُ بصفحة الصور");
await page.goto(`${BASE}/photos`, { waitUntil: "domcontentloaded" });
await page.locator("[data-pmatch-banner]").waitFor({ timeout: 30000 });
const bannerText = await page.locator("[data-pmatch-banner]").innerText();
check("الشريطُ يعدّ ما بلا صورة (٤: باركودان واسمان)", /4/.test(bannerText), bannerText);
check("  ويقول عدد ما عنده صورة وبالمكتبة غيرها (١)", /1/.test(bannerText.split("\n").slice(1).join(" ")), bannerText);
check("رابطُ «صور مقترحة» بالرأس", await page.locator("[data-photos-match]").count() === 1);
// المتجرُ بضغطة القائمة (تنقّلٌ داخل التطبيق): فتحُ /store مباشرةً بخادم التطوير يرجع للرئيسية — مدخلُ
// store.html (vite.config storeEntry) — فالفحصُ يمشي كما يمشي المستخدم.
await page.locator('a[href="/store"]').first().click();
await page.getByText("تشكيلة المتجر", { exact: true }).first().click();
const storeBanner = await page.locator("[data-catsearch]").waitFor({ timeout: 30000 })
  .then(() => page.locator("[data-pmatch-banner]").waitFor({ timeout: 15000 })).then(() => true, () => false);
check("بالمتجر: الشريطُ يطلع لمن أكو اقتراحات", storeBanner, page.url());
if (process.env.SHOTS && storeBanner) await page.locator("[data-pmatch-banner]").screenshot({ path: `${process.env.SHOTS}/photo-match-banner.png` });
await page.locator('a[href="/photos"]').first().click();
await page.locator("[data-pmatch-banner]").waitFor({ timeout: 20000 });

console.log("▸ ٢) الصفحةُ وأقسامُها");
await page.locator("[data-pmatch-open]").click();
await page.locator("[data-pmatch-tab=code]").waitFor({ timeout: 20000 });
const tabTxt = async (k) => (await page.locator(`[data-pmatch-tab=${k}]`).innerText()).replace(/\D/g, "");
check("بالباركود ٢ (الأساسيّ والإضافيّ)", (await tabTxt("code")) === "2", await tabTxt("code"));
check("بالاسم ٢", (await tabTxt("name")) === "2", await tabTxt("name"));
check("عدها صورة ١", (await tabTxt("replace")) === "1", await tabTxt("replace"));
check("المنتجُ بلا مطابقة لا يُعرض", await page.locator("[data-match=p5]").count() === 0);
check("بطاقةُ الباركود تقول «باركود»", (await page.locator("[data-match=p1] [data-match-badge]").innerText()).includes("باركود"));

console.log("▸ ٣) «اقبلها كلها» بنافذة — وما تبدّل أثناءها لا يُكتب فوقه");
await page.locator("[data-pmatch-all=code]").click();
await page.locator("[data-pmatch-ask=code]").waitFor();
check("نافذةُ تأكيدٍ داخل الصفحة (لا window.confirm)", await page.locator("[data-pmatch-ask=code]").isVisible());
// p6 تنحطّ له صورةٌ من «جهازٍ ثانٍ» والنافذةُ مفتوحة
await page.evaluate(([k, path]) => { const d = JSON.parse(localStorage.getItem(k)); d.products.find((p) => p.id === "p6").image_path = path; localStorage.setItem(k, JSON.stringify(d)); }, [DB_KEY, img("#111111")]);
await page.locator("[data-pmatch-go]").click();
await page.waitForFunction(() => !document.querySelector("[data-pmatch-bulk]"), null, { timeout: 20000 });
await page.waitForTimeout(400);
check("p1 أخذ صورةَ الباركود", (await imgOf("p1")) === LIB[0].path);
check("p6 (تبدّلت صورتُه أثناءها) ما انكتب فوقه", (await imgOf("p6")) === img("#111111"), String(await imgOf("p6")).slice(0, 40));
const toasts = await page.locator("body").innerText();
check("  وقيل «انحطّتله صورة من جهاز ثاني»", toasts.includes("جهاز ثاني"));

console.log("▸ ٤) بالاسم: «مو هاي» يبقى بعد التحميل، و«صح» لواحدة");
await page.locator("[data-pmatch-tab=name]").click();
await page.locator("[data-match=p3]").waitFor();
const p3img = await page.locator("[data-match=p3] [data-match-img]").getAttribute("data-match-img");
check("Felix Pouch ⇒ صورةُ Felix (تخمين)", p3img === LIB[3].path && (await page.locator("[data-match=p3] [data-match-badge]").innerText()).includes("تخمين"));
await page.locator("[data-match-reject=p3]").click();
await page.waitForTimeout(300);
check("«مو هاي» تشيله", await page.locator("[data-match=p3]").count() === 0);
await page.reload({ waitUntil: "domcontentloaded" });
await page.locator("[data-pmatch-tab=name]").waitFor({ timeout: 20000 });
await page.locator("[data-pmatch-tab=name]").click();
await page.waitForTimeout(300);
check("  وما يرجع بعد إعادة التحميل", await page.locator("[data-match=p3]").count() === 0);
check("p2 (Whiskas Tuna 85 gm) ⇒ Tuna لا Chicken", (await page.locator("[data-match=p2] [data-match-img]").getAttribute("data-match-img")) === LIB[1].path);
await page.locator("[data-match-accept=p2]").click();
await page.waitForFunction(() => !document.querySelector("[data-match=p2]"), null, { timeout: 10000 });
check("«صح، حطها» كتبتها", (await imgOf("p2")) === LIB[1].path);

console.log("▸ ٥) عدها صورة ⇒ بدّلها");
await page.locator("[data-pmatch-tab=replace]").click();
await page.locator("[data-match=p4]").waitFor();
check("البطاقةُ تعرض الصورتين (الحاليّة والمقترحة)", await page.locator("[data-match=p4] figure").count() === 2);
await page.locator("[data-pmatch-all=replace]").click();
await page.locator("[data-pmatch-ask=replace]").waitFor();
check("  والنافذةُ تقول إن القديمة تبقى بـ«صور سابقة»", (await page.locator("[data-pmatch-ask=replace]").innerText()).includes("صور سابقة"));
await page.locator("[data-pmatch-go]").click();
await page.waitForFunction(() => !document.querySelector("[data-pmatch-bulk]"), null, { timeout: 20000 });
await page.waitForTimeout(300);
check("p4 تبدّلت", (await imgOf("p4")) === LIB[4].path);
check("لا شيءَ باقٍ ⇒ «ماكو صور تطابق» أو أقسامٌ فارغة", await page.locator("[data-match]").count() === 0);

console.log("▸ ٦) المتجر: الشريطُ يختفي حين لا يبقى شي");
await page.goto(`${BASE}/photos`, { waitUntil: "domcontentloaded" });
await page.locator('a[href="/store"]').first().click();
await page.getByText("تشكيلة المتجر", { exact: true }).first().click();
await page.locator("[data-catsearch]").waitFor({ timeout: 30000 });
await page.waitForTimeout(2500);
check("لا شريطَ بلا اقتراحات", await page.locator("[data-pmatch-banner]").count() === 0);

console.log("▸ ٧) عرضُ الهاتف");
const mctx = await browser.newContext({ viewport: { width: 390, height: 844 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad", isMobile: true, hasTouch: true });
await mctx.addInitScript(([k, v, sk, sv]) => {
  if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); }
}, [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
const mp = await mctx.newPage();
mp.on("pageerror", (e) => errors.push(e.message));
await mp.goto(`${BASE}/photos/match`, { waitUntil: "domcontentloaded" });
await mp.locator("[data-match]").first().waitFor({ timeout: 30000 });
const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check(`بلا تمريرٍ جانبيّ بعرض ٣٩٠ (${overflow})`, overflow <= 1);
if (process.env.SHOTS) {
  await mp.waitForTimeout(800);
  await mp.screenshot({ path: `${process.env.SHOTS}/photo-match-phone.png`, fullPage: false });
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 2, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
  await dctx.addInitScript(([k, v, sk, sv]) => {
    if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); }
  }, [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
  const dp = await dctx.newPage();
  await dp.goto(`${BASE}/photos/match`, { waitUntil: "domcontentloaded" });
  await dp.locator("[data-match]").first().waitFor({ timeout: 30000 });
  await dp.locator("[data-pmatch-tab=name]").click();
  await dp.waitForTimeout(1000);
  await dp.screenshot({ path: `${process.env.SHOTS}/photo-match-desktop.png` });
}

check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`${fails ? "✗" : "✓"} live-photo-match: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
