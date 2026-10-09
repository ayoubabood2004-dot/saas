/* ============================================================================
 * فحصٌ حيٌّ لعارض الصور ونوافذ الصورة (0229) — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5199 --strictPort   # بطرفٍ آخر
 *     node scripts/live/lightbox.mjs            # أو LIVE_URL=http://localhost:5201
 *
 * لماذا حيّ: هدفُ النقرة يقرّره المتصفّحُ لا الشِفرة. حين نُقل التقاطُ المؤشّر من
 * الصورة إلى المسرح (لأجل القرص بإصبعين) صار هدفُ النقرة المسرحَ نفسَه، فـ`stopPropagation`
 * على الصورة لم يعد بطريقها: نقرةٌ على الصورة تغلق العارض، والنقرةُ الأولى من النقر
 * المزدوج تغلقه قبل أن يكبّر، وإفلاتُ السحب بعد التكبير يغلقه. فحصُ نصٍّ لا يرى هذا،
 * والعارضُ نفسُه يخدم صورَ الملفّ الطبّيّ (PetPassport) لا المتجرَ وحده.
 *
 * ويقيس معه ثلاثاً من نوافذ الصورة:
 *   • قفلُ التمرير: إغلاقُ الاستوديو فوق بطاقة المنتج كان يفكّ تمريرَ الصفحة والبطاقةُ مفتوحة؛
 *   • المقارنةُ بالأصل زرٌّ يُضغط لا ضغطةٌ مطوّلة تسرقها قائمةُ الصورة بالموبايل؛
 *   • المساحةُ: الاستوديو لا يضيف حشوةً فوق حشوة النافذة؛
 *   • صورةُ ٤٨ ميغابكسل (وضعُ «الدقة القصوى») تُصغَّر وتُعرض — لا «مو صورة».
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-lightbox: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5199";
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const now = new Date().toISOString();
const NAME = "علف قطط ملكي";
const seedDB = () => ({
  products: [
    { id: "p1", clinic_id: "c1", name: NAME, category: "food", sell_price: 5000, cost_price: 3000, stock: 10, store_visible: false, store_featured: false, image_path: null, created_at: now },
  ],
  storeSections: [],
  storeProfile: { clinic_id: "c1", slug: "lbtest", enabled: true, delivery_fee: 0, min_order: 0, bio: null, whatsapp: null, updated_at: now },
  companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [], appointments: [], treatments: [], admissions: [], reminders: [],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];

/** سياقٌ ببيانات تجريبية + صورةٌ حقيقية للمنتج (٩٠٠×٦٠٠ من canvas المتصفّح نفسِه). */
async function open(ctxOpts) {
  const ctx = await browser.newContext({ locale: "ar-IQ", timezoneId: "Asia/Baghdad", ...ctxOpts });
  await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); } },
    [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}/photos`, { waitUntil: "domcontentloaded" });
  await page.evaluate((k) => {
    const c = document.createElement("canvas"); c.width = 900; c.height = 600;
    const g = c.getContext("2d");
    g.fillStyle = "#f1f1ee"; g.fillRect(0, 0, 900, 600);
    g.fillStyle = "#c2410c"; g.fillRect(300, 120, 300, 360);
    const db = JSON.parse(localStorage.getItem(k));
    db.products[0].image_path = c.toDataURL("image/jpeg", 0.85);
    localStorage.setItem(k, JSON.stringify(db));
  }, DB_KEY);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.locator("[data-store-board]").waitFor({ timeout: 15000 });
  // اللوحةُ تبدأ بـ«بلا صورة» — والمنتجُ هنا بصورة.
  await page.locator('[data-filter="all"]').click();
  await page.locator('[data-photo-card="p1"]').waitFor({ timeout: 15000 });
  return { ctx, page };
}
const lbOf = (page) => page.getByRole("dialog", { name: NAME });
const zoomPct = async (lb) => Number((await lb.getByText(/^\d+%$/).innerText()).replace("%", ""));
const transformOf = (lb) => lb.locator("img").first().evaluate((el) => el.style.transform);
const overflow = (page) => page.evaluate(() => document.body.style.overflow);
const settle = (page, ms = 350) => page.waitForTimeout(ms);

/* ------------------------------ الفأرة ------------------------------ */
{
  const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } });
  const lb = lbOf(page);
  const openLb = async () => { await page.locator('[data-photo-card="p1"] > button').first().click(); await lb.waitFor({ timeout: 5000 }); await settle(page, 250); };

  console.log("▸ الفأرة: النقرُ على الصورة لا يغلق، والنقرُ المزدوج يكبّر");
  await openLb();
  let box = await lb.locator("img").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  check("العارضُ انفتح وقفلُ التمرير قائم", await lb.isVisible() && (await overflow(page)) === "hidden");
  await page.mouse.click(cx, cy);
  await settle(page);
  check("نقرةٌ على الصورة تُبقيه مفتوحاً", await lb.isVisible());
  if (!(await lb.isVisible())) await openLb();
  await page.mouse.dblclick(cx, cy);
  await settle(page);
  check("والنقرُ المزدوج يكبّرها ٢٥٠٪ (لا يغلق بنقرته الأولى)", await lb.isVisible() && (await zoomPct(lb).catch(() => 0)) === 250,
    `open=${await lb.isVisible()}`);

  console.log("▸ الفأرة: العجلةُ ثمّ السحب — الإفلاتُ لا يغلق");
  if (!(await lb.isVisible())) await openLb();
  await page.keyboard.press("0");
  await settle(page);
  await page.mouse.move(cx, cy);
  for (let i = 0; i < 3; i++) { await page.mouse.wheel(0, -200); await page.waitForTimeout(80); }
  await settle(page);
  const z = await zoomPct(lb);
  check("العجلةُ تكبّر", z > 100, `${z}%`);
  const before = await transformOf(lb);
  await page.mouse.move(cx, cy);
  await page.mouse.down();
  await page.mouse.move(cx + 90, cy + 50, { steps: 10 });
  await page.mouse.up();
  await settle(page);
  check("والسحبُ يحرّك الصورة", (await lb.isVisible()) && (await transformOf(lb)) !== before, `${before} → ${await transformOf(lb).catch(() => "—")}`);
  check("  والإفلاتُ بعد السحب لا يغلق العارض", await lb.isVisible());

  console.log("▸ الفأرة: الخلفيةُ تغلق بنقرةٍ حقيقية وحدَها");
  if (!(await lb.isVisible())) await openLb();
  await page.keyboard.press("0");
  await settle(page);
  const bx = 60, by = 420; // يسارُ المنتصف: خارجَ الصورة والأزرار ولوحةِ التفاصيل
  await page.mouse.move(bx, by);
  await page.mouse.down();
  await page.mouse.move(bx + 120, by + 30, { steps: 8 });
  await page.mouse.up();
  await settle(page);
  check("سحبٌ يبدأ على الخلفية لا يُعدّ نقرةَ إغلاق", await lb.isVisible());
  if (!(await lb.isVisible())) await openLb();
  await lb.getByRole("button", { name: /تكبير|Zoom in/ }).click();
  await settle(page);
  check("زرُّ التكبير بالشريط يكبّر ولا يغلق", (await lb.isVisible()) && (await zoomPct(lb)) > 100);
  await page.keyboard.press("0");
  await settle(page);
  await page.mouse.click(bx, by);
  await settle(page);
  check("نقرةٌ على الخلفية تغلقه", !(await lb.isVisible()));
  check("  وقفلُ التمرير يُفكّ بعده", (await overflow(page)) === "", JSON.stringify(await overflow(page)));
  await openLb();
  await page.keyboard.press("Escape");
  await settle(page);
  check("وEsc تغلقه", !(await lb.isVisible()));
  await openLb();
  await lb.locator("button").first().click();
  await settle(page);
  check("وزرُّ الإغلاق يغلقه", !(await lb.isVisible()));

  console.log("▸ نافذةٌ فوق نافذة: الاستوديو فوق بطاقة المنتج");
  await page.locator('[data-photo-card="p1"]').getByText(NAME).click();
  const sheet = page.locator('[data-product-sheet="p1"]');
  await sheet.waitFor({ timeout: 5000 });
  check("البطاقةُ تقفل التمرير", (await overflow(page)) === "hidden");
  const png = Buffer.from(await page.evaluate(() => {
    const c = document.createElement("canvas"); c.width = 1200; c.height = 800;
    const g = c.getContext("2d"); g.fillStyle = "#eef"; g.fillRect(0, 0, 1200, 800); g.fillStyle = "#123"; g.fillRect(400, 200, 400, 400);
    return c.toDataURL("image/png").split(",")[1];
  }), "base64");
  const [chooser] = await Promise.all([page.waitForEvent("filechooser"), sheet.getByRole("button", { name: /من الألبوم/ }).click()]);
  await chooser.setFiles({ name: "a.png", mimeType: "image/png", buffer: png });
  const studio = page.locator("[data-photo-studio]");
  await studio.waitFor({ timeout: 10000 });
  await studio.locator("img").first().waitFor({ timeout: 10000 });
  await settle(page, 500);

  /* المساحة: Dialog يحشو `px-6` — والاستوديو لا يضيف فوقها. */
  const widths = await studio.evaluate((el) => {
    const panel = el.closest('[role="dialog"]');
    const surface = el.querySelector("[data-compare-surface]") ?? el.firstElementChild;
    return { panel: panel.clientWidth, surface: surface.getBoundingClientRect().width };
  });
  check("سطحُ الصورة بعرض النافذة ناقصَ حشوتها وحدها (لا حشوةً مضاعفة)", Math.abs(widths.surface - (widths.panel - 48)) <= 1, JSON.stringify(widths));

  /* المقارنة: زرٌّ يُضغط، والصورةُ لا تفتح قائمةَ المتصفّح. */
  const shownSrc = () => studio.locator("img").first().getAttribute("src");
  const editedSrc = await shownSrc();
  const toggle = studio.locator("[data-compare-toggle]");
  check("زرُّ المقارنة ظاهرٌ بحالته (aria-pressed)", (await toggle.count()) === 1 && (await toggle.getAttribute("aria-pressed")) === "false");
  await toggle.click();
  await settle(page, 200);
  check("ضغطةٌ واحدة تعرض الأصل وتبقى", (await shownSrc()) !== editedSrc && (await toggle.getAttribute("aria-pressed")) === "true");
  await settle(page, 700);
  check("  وتبقى بلا إصبعٍ مثبَّت (لا ضغطةَ مطوّلة)", (await shownSrc()) !== editedSrc);
  await toggle.click();
  await settle(page, 200);
  check("  والثانيةُ ترجع للمعدّلة", (await shownSrc()) === editedSrc && (await toggle.getAttribute("aria-pressed")) === "false");
  await studio.locator("img").first().click();
  await settle(page, 200);
  check("  ودوسةٌ على الصورة نفسِها تقلبها كذلك", (await shownSrc()) !== editedSrc);
  await studio.locator("img").first().click();
  /* قائمةُ الصورة تُفتح بحدث contextmenu (ضغطةٌ مطوّلة بأندرويد، زرٌّ أيمن بالحاسوب) — يُكتم.
   * و`-webkit-touch-callout` (آيفون) لا يعرفه كروم فيُسقطه من الأنماط: يُثبَّت بفحص الشِفرة. */
  const blocked = await studio.locator("img").first().evaluate((el) =>
    !el.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true })));
  check("  وقائمةُ الصورة (ضغطةٌ مطوّلة/زرٌّ أيمن) مكتومةٌ على السطح", blocked);

  await studio.getByRole("button", { name: /إلغاء/ }).click();
  await studio.waitFor({ state: "detached", timeout: 5000 });
  check("إلغاءُ الاستوديو يُبقي البطاقةَ مفتوحة", await sheet.isVisible());
  check("  **وقفلُ التمرير باقٍ والبطاقةُ مفتوحة** (كان يُفكّ)", (await overflow(page)) === "hidden", JSON.stringify(await overflow(page)));
  await page.keyboard.press("Escape");
  await sheet.waitFor({ state: "detached", timeout: 5000 });
  check("  وبإغلاق البطاقة يُفكّ", (await overflow(page)) === "", JSON.stringify(await overflow(page)));

  console.log("▸ صورةُ ٤٨ ميغابكسل (الدقة القصوى بالموبايل) تُصغَّر لا تُرفض");
  const huge = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 8000; c.height = 6000;
    const g = c.getContext("2d"); g.fillStyle = "#f4f4f0"; g.fillRect(0, 0, 8000, 6000); g.fillStyle = "#1e3a8a"; g.fillRect(2500, 1500, 3000, 3000);
    const b = await new Promise((r) => c.toBlob(r, "image/jpeg", 0.8));
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  }), "base64");
  const [ch2] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-photo-gallery="p1"]').click()]);
  await ch2.setFiles({ name: "max.jpg", mimeType: "image/jpeg", buffer: huge });
  await studio.waitFor({ timeout: 10000 });
  await studio.locator("[data-photo-approve]:not([disabled])").waitFor({ timeout: 20000 }).catch(() => undefined);
  const txt = (await studio.innerText()).replace(/\s+/g, " ");
  check("تُقرأ وتُعرض — لا «مو صورة يقدر يقراها الجهاز»", !/مو صورة/.test(txt) && (await studio.locator("img").count()) > 0, txt.slice(0, 160));
  check("  وتنحفظ بـ١٦٠٠ بكسل كأيّ صورة", /1,?600\s*×\s*1,?200/.test(txt), txt.slice(0, 200));
  await studio.locator("[data-photo-approve]").click();
  await studio.waitFor({ state: "detached", timeout: 20000 });
  const saved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY)).products[0];
  check("  وتنحفظ فعلاً بأبعادها", saved.image_meta?.w === 1600 && saved.image_meta?.h === 1200, `${saved.image_meta?.w}×${saved.image_meta?.h}`);

  /* PNG كبيرٌ بخلفيّةٍ شفّافة (صورُ المصنّع): مسارُ التصغير يمرّ بنسخةٍ عاملةٍ JPEG — شفّافُها كان
   * يصير أسودَ قبل أن تصل renderPhoto وبياضُها (أمسكه التدقيقُ الثاني). الحكمُ على بكسلٍ بالزاوية. */
  const clear = Buffer.from(await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 8000; c.height = 6000;
    const g = c.getContext("2d"); g.clearRect(0, 0, 8000, 6000); g.fillStyle = "#1e3a8a"; g.fillRect(2500, 1500, 3000, 3000);
    const b = await new Promise((r) => c.toBlob(r, "image/png"));
    const u8 = new Uint8Array(await b.arrayBuffer());
    let s = ""; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000));
    return btoa(s);
  }), "base64");
  const [ch3] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-photo-gallery="p1"]').click()]);
  await ch3.setFiles({ name: "clear.png", mimeType: "image/png", buffer: clear });
  await studio.waitFor({ timeout: 10000 });
  await studio.locator("[data-photo-approve]:not([disabled])").waitFor({ timeout: 20000 }).catch(() => undefined);
  await studio.locator("[data-photo-approve]").click();
  await studio.waitFor({ state: "detached", timeout: 20000 });
  const clearSaved = JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY)).products[0];
  const corner = await page.evaluate(async (src) => {
    const img = new Image(); img.src = src; await img.decode();
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(img, 0, 0);
    return [...g.getImageData(5, 5, 1, 1).data];
  }, clearSaved.image_path);
  check("PNG كبيرٌ شفّافُ الخلفيّة يُحفظ على أبيض لا أسود (مسارُ التصغير)", corner.slice(0, 3).every((v) => v > 235), JSON.stringify(corner));
  await ctx.close();
}

/* ------------------------------ اللمس ------------------------------ */
{
  console.log("▸ اللمس: الدوسةُ على الصورة لا تغلق، والقرصُ يكبّر، والخلفيةُ تغلق");
  const { ctx, page } = await open({ viewport: { width: 390, height: 860 }, hasTouch: true, isMobile: true });
  const lb = lbOf(page);
  await page.locator('[data-photo-card="p1"] > button').first().tap();
  await lb.waitFor({ timeout: 5000 });
  await settle(page);
  const box = await lb.locator("img").first().boundingBox();
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
  await page.touchscreen.tap(cx, cy);
  await settle(page);
  check("دوسةٌ على الصورة تُبقيه مفتوحاً", await lb.isVisible());
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send("Input.dispatchTouchEvent", { type, touchPoints: pts.map(([x, y], id) => ({ x, y, id })) });
  await touch("touchStart", [[cx - 30, cy], [cx + 30, cy]]);
  for (let i = 1; i <= 8; i++) { await touch("touchMove", [[cx - 30 - i * 12, cy], [cx + 30 + i * 12, cy]]); await page.waitForTimeout(16); }
  await touch("touchEnd", []);
  await settle(page);
  const z = await zoomPct(lb).catch(() => 0);
  check("القرصُ بإصبعين يكبّر ويبقى مفتوحاً", (await lb.isVisible()) && z > 150, `${z}%`);
  await page.keyboard.press("0");
  await settle(page);
  await page.touchscreen.tap(195, Math.min(box.y + box.height + 60, 700));
  await settle(page);
  check("ودوسةٌ على الخلفية تغلقه", !(await lb.isVisible()));
  await ctx.close();
}

check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-lightbox: ${passes} ✓ · ${fails} ✗`);
process.exit(fails ? 1 : 0);
