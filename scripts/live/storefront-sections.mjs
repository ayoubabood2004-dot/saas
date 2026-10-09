/* ============================================================================
 * فحصٌ حيٌّ لواجهة الزبون بعد تدقيق 0229 — متصفّحٌ حقيقيّ على الوضع التجريبيّ.
 *
 *     npx vite --port 5201 --strictPort        # بطرفٍ آخر
 *     node scripts/live/storefront-sections.mjs   (LIVE_URL لمنفذٍ آخر)
 *
 * لماذا حيّ: كلُّ ما هنا حدثُ زمنِ تشغيل لا يراه فحصُ نصّ —
 *   • شريحةُ «منتجات أخرى» من أوّل رسم ومتجرٌ أكبرُ من صفحة وما بلا قسمٍ آخرُه (#27)؛
 *   • سطرُ سلّةٍ منتجُه بعد الصفحة الأولى يُعرض بالسلّة ويُحسب بالمجموع ولا يُشال (#25)،
 *     **حتى بعد أن يزحزح الكادرُ الترتيبَ بين صفحتين** فتقفز الإزاحةُ صفوفاً — والمقفوزُ يرجع
 *     للشبكة بعدّ الخادم؛ وسطرٌ خرج فعلاً من المتجر يُشال ويُقال باسمه؛
 *   • ضغطةُ قسمٍ لا تُظهر غيرَ منتجاته (والكتلوجُ يُكمَّل تحتها)؛
 *   • ورقةُ التفاصيل بالمصغّر لا بالكاملة (#29)؛
 *   • صورةٌ فشلت ثمّ تغيّر مسارُها تظهر (العنصرُ لا يبقى مخفياً، #26).
 *
 * ومقيسٌ بالتجربة: الزرعُ يجعل كلَّ حالةٍ ممكنة الفشل — ما بلا قسمٍ يبدأ بعد الموضع ٢٤، وسطرُ
 * السلّة «كلاب 02» يقع بالضبط بين ما تقفزه الإزاحةُ بعد النقل (المواضعُ ٢٠–٢٣ بعد الزحزحة).
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-storefront: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5201";
const SHOTS = process.env.SHOTS ?? "";
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const SLUG = "sectionstest";
const CART_KEY = `vp_store_cart_${SLUG}`;

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const svg = (fill) => `data:image/svg+xml;base64,${Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="8" height="8"><rect width="8" height="8" fill="${fill}"/></svg>`).toString("base64")}`;
const FULL = svg("#c2410c");
const THUMB = svg("#1e3a8a");
const BROKEN = "data:image/png;base64,AAAA";
const now = new Date().toISOString();
const two = (i) => String(i).padStart(2, "0");
const prod = (id, name, extra = {}) => ({
  id, clinic_id: "c1", name, category: "food", sell_price: 1000, cost_price: 500, stock: 10,
  store_visible: true, store_featured: false, store_section_id: null, store_sort: null, image_path: null, created_at: now, ...extra,
});
/* الترتيبُ الخادميّ (store_catalog2 ومرآتُه التجريبية): القسمُ s1 (٣٠) ثمّ s2 (٣٠) ثمّ ما بلا قسم (١٠).
 * فالصفحةُ الأولى (٢٤) كلُّها من s1 — ولا شيءَ بلا قسمٍ قبل الموضع ٦٠. */
const seedDB = () => ({
  products: [
    ...Array.from({ length: 30 }, (_, i) => prod(`c${i + 1}`, `قطط ${two(i + 1)}`, {
      store_section_id: "s1",
      ...(i === 0 ? { image_path: FULL, image_meta: { path: FULL, thumb: THUMB, w: 8, h: 8 } } : {}),
      ...(i === 19 ? { image_path: BROKEN } : {}),
    })),
    ...Array.from({ length: 30 }, (_, i) => prod(`k${i + 1}`, `كلاب ${two(i + 1)}`, { store_section_id: "s2" })),
    ...Array.from({ length: 10 }, (_, i) => prod(`m${i + 1}`, `متفرقات ${two(i + 1)}`)),
    prod("hid", "منتج مخفي", { store_visible: false }),
  ],
  storeSections: [
    { id: "s1", clinic_id: "c1", name: "قطط", sort: 0, archived_at: null, created_at: now },
    { id: "s2", clinic_id: "c1", name: "كلاب", sort: 1, archived_at: null, created_at: now },
  ],
  storeProfile: { clinic_id: "c1", slug: SLUG, enabled: true, delivery_fee: 0, min_order: 0, bio: null, whatsapp: null, updated_at: now },
  companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [], appointments: [], treatments: [], admissions: [], reminders: [],
});
// السلّة المحفوظة من «زيارةٍ سابقة»: سطرٌ بالصفحة الأولى، وسطرٌ يقفزه النقلُ، وسطرٌ آخرَ الكتلوج، وسطرٌ خرج.
const CART = [
  { id: "c2", qty: 1 },
  { id: "k2", qty: 2 },
  { id: "m10", qty: 1 },
  { id: "hid", qty: 1, name: "منتج مخفي" },
];

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
await ctx.addInitScript(([k, v, ck, cv]) => {
  if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(ck, cv); sessionStorage.setItem("seeded", "1"); }
}, [DB_KEY, JSON.stringify(seedDB()), CART_KEY, JSON.stringify(CART)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
/* يُستثنى بالاسم والسبب: تحذيرُ React 18 من `fetchPriority` (يعرفها 19) — تحذيرُ تطويرٍ قديمٌ والصفةُ
 * تُرسم بالإنتاج؛ وفشلُ تحميل الصورة المكسورة المزروعة عمداً (`Failed to load resource`) والخطوط. */
page.on("console", (m) => { if (m.type() === "error" && !/fonts\.(googleapis|gstatic)|ERR_CERT|Failed to load resource|fetchPriority/.test(m.text())) errors.push(m.text()); });
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const cartNow = async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k) ?? "[]", CART_KEY));
const cards = () => page.locator("main .grid > div");
const names = async () => (await cards().locator("p.line-clamp-2.text-sm").allInnerTexts()).map((s) => s.trim());
const moreBtn = page.locator("button", { hasText: /عرض المزيد/ });

await page.goto(`${BASE}/s/${SLUG}`, { waitUntil: "domcontentloaded" });
await page.locator("[data-storesections]").waitFor({ timeout: 20000 });
await page.waitForTimeout(800);

console.log("▸ شريطُ الأقسام و«منتجات أخرى» من أوّل رسم");
const bar = await page.locator("[data-storesections]").innerText();
check("شريطُ الأقسام بأعدادها من الخادم", /قطط\s*·\s*(30|٣٠)/.test(bar) && /كلاب\s*·\s*(30|٣٠)/.test(bar), bar.replace(/\n/g, " | "));
check("«منتجات أخرى» ظاهرةٌ والكتلوجُ لم يكتمل (ما بلا قسمٍ كلُّه بعد الموضع ٦٠)",
  /منتجات أخرى/.test(bar) && (await moreBtn.count()) > 0 && (await names()).every((n) => n.startsWith("قطط")),
  `${bar.replace(/\n/g, " | ")} — more=${await moreBtn.count()}`);
check("  والعددُ لا يُعرض فوق كتلوجٍ ناقص", !/(\d|[٠-٩])+\s*منتج\b/.test(await page.locator(".sticky").innerText()));
await shot("sf-01-first-paint");

console.log("▸ سلّةٌ محفوظة: الغائبُ عن الصفحة الأولى يُسأل عنه بالمعرّف لا يُشال");
let c = await cartNow();
check("«كلاب 02» و«متفرقات 10» (بعد الصفحة الأولى) باقيان بالسلّة", c.some((l) => l.id === "k2") && c.some((l) => l.id === "m10"), JSON.stringify(c));
check("و«منتج مخفي» (خرج من المتجر فعلاً) شِيل", !c.some((l) => l.id === "hid"), JSON.stringify(c));
const trimmed = await page.locator("[data-carttrimmed]").innerText().catch(() => "");
check("  ويُقال باسمه لا بمعرّفٍ خام", /منتج مخفي/.test(trimmed) && !/\bhid\b/.test(trimmed), trimmed);
await page.locator("button", { hasText: /عرض السلة/ }).click();
await page.waitForTimeout(400);
const sheetText = await page.locator("h2", { hasText: "سلتك" }).locator("xpath=../..").innerText();
check("وسطورُ ما بعد الصفحة الأولى تُرسم بالسلّة وتُحسب بالمجموع",
  /كلاب 02/.test(sheetText) && /متفرقات 10/.test(sheetText) && /قطط 02/.test(sheetText), sheetText.replace(/\n/g, " | ").slice(0, 300));
check("  والمجموعُ = ٤ قطع × ١٠٠٠ (لا صفرَ لسطرٍ لم تجلبه الصفحات)", /4,000|٤٬?٠٠٠|4000/.test(sheetText), sheetText.match(/[\d٠-٩,٬]+\s*د/g)?.join(" ") ?? "");
await page.keyboard.press("Escape").catch(() => undefined);
await page.locator(".fixed.inset-0.z-40").first().click({ position: { x: 10, y: 10 } }).catch(() => undefined);
await page.waitForTimeout(400);

console.log("▸ ورقةُ التفاصيل بالمصغّر لا بالكاملة");
await cards().filter({ hasText: "قطط 01" }).first().locator("[role=button]").click();
await page.locator("[data-detailsheet]").waitFor({ timeout: 5000 });
const detailSrc = await page.locator("[data-detailsheet] img").getAttribute("src");
check("صورةُ الورقة هي المصغّر (٤٨٠) لا الكاملة (١٦٠٠)", detailSrc === THUMB, String(detailSrc).slice(0, 60));
const gridSrc = await cards().filter({ hasText: "قطط 01" }).first().locator("img").getAttribute("src");
check("  ونفسُها بالبطاقة (من المخبأ)", gridSrc === THUMB);
await page.locator("[data-detailsheet] .bg-ink\\/40").click({ position: { x: 10, y: 10 } });
await page.waitForTimeout(300);
// البطاقةُ تحت الطيّة صورتُها كسولة: تُمرَّر للعين أوّلاً كي تُطلب فتفشل.
const card20 = cards().filter({ hasText: "قطط 20" }).first();
await card20.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
check("الصورةُ المكسورة تكشف البلاطةَ تحتها (hidden)", await card20.locator("img").evaluate((el) => el.hidden).catch(() => false));

console.log("▸ الكادرُ يزحزح الترتيبَ بين صفحتين (#25) + صورةٌ تتبدّل (#26)");
/* عشرةٌ من أوّل s1 تُنقل لـ«بلا قسم» — كلُّ ما بعدها يتزحزح عشرةً للخلف، فالإزاحةُ ٢٤ تقفز المواضعَ
 * ٢٤–٣٣ القديمة: «قطط 25..30» و«كلاب 01..04» — وبينها سطرُ السلّة «كلاب 02». وصورةُ «قطط 20»
 * المكسورة تُستبدل بمسارٍ جديد (أُعيد تصويرُها). */
await page.evaluate(([k, full]) => {
  const db = JSON.parse(localStorage.getItem(k));
  for (const p of db.products) {
    if (/^c([1-9]|10)$/.test(p.id)) p.store_section_id = null;
    if (p.id === "c20") p.image_path = full;
  }
  localStorage.setItem(k, JSON.stringify(db));
}, [DB_KEY, svg("#15803d")]);
for (let i = 0; i < 6 && (await moreBtn.count()) > 0; i++) {
  await moreBtn.first().click();
  await page.waitForTimeout(700);
}
await page.waitForTimeout(800);
const sticky = await page.locator(".sticky").innerText();
check("آخرُ صفحةٍ وصلت والكتلوجُ أُكمل بعدّ الخادم: ٧٠ منتجاً لا ٦٠", /(70|٧٠)\s*منتج/.test(sticky), sticky.replace(/\n/g, " | "));
const all = await names();
check("  والمقفوزُ بالإزاحة رجع للشبكة («كلاب 02» و«قطط 25»)", all.includes("كلاب 02") && all.includes("قطط 25"), `${all.length} بطاقة`);
check("  وبلا تكرار", new Set(all).size === all.length, `${all.length} / ${new Set(all).size}`);
c = await cartNow();
check("وسطرُ السلّة على المنتج المقفوز ما انشال (لا حكمَ على غياب)", c.some((l) => l.id === "k2") && c.some((l) => l.id === "m10"), JSON.stringify(c));
const banner = await page.locator("[data-carttrimmed]").innerText().catch(() => "");
check("  ولافتةُ الشيل لا تذكر بضاعةً على الرفّ", !/كلاب|متفرقات|قطط/.test(banner), banner);
const fixedCard = cards().filter({ hasText: "قطط 20" }).first();
await fixedCard.scrollIntoViewIfNeeded();
await page.waitForTimeout(600);
const fixedState = await fixedCard.locator("img").evaluate((el) => ({ hidden: el.hidden, ok: el.complete && el.naturalWidth > 0 })).catch((e) => ({ err: String(e) }));
check("صورةٌ فشلت ثمّ تغيّر مسارُها تظهر (العنصرُ المخفيّ لا يُعاد بمصدرٍ جديد)", fixedState.hidden === false && fixedState.ok === true, JSON.stringify(fixedState));
await shot("sf-02-complete");

console.log("▸ ضغطةُ قسمٍ لا تُظهر غيرَ منتجاته");
await page.locator("[data-storesections] button", { hasText: /^كلاب/ }).click();
await page.waitForTimeout(500);
const dogs = await names();
check("قسمُ «كلاب»: ٣٠ بطاقةً كلُّها منه", dogs.length === 30 && dogs.every((n) => n.startsWith("كلاب")), `${dogs.length}: ${dogs.slice(0, 3).join("، ")}`);
await page.locator("[data-storesections] button", { hasText: "منتجات أخرى" }).click();
await page.waitForTimeout(500);
const others = await names();
check("و«منتجات أخرى»: ما بلا قسمٍ وحده (العشرةُ المنقولة + المتفرقات)", others.length === 20 && others.every((n) => /^(قطط (0[1-9]|10)|متفرقات)/.test(n)), `${others.length}`);
await shot("sf-03-section");

console.log("▸ «شوف المتجر كزبون» مرآةُ المتجر (#43/#45)");
/* مختارٌ ونافدٌ بالقسم الأوّل: المعاينةُ تعلّمهما بشارتي المتجر داخل الشبكة، ولا صفَّ «مختارات» يكرّرهما. */
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };
await page.evaluate(([k, sk, sv]) => {
  const db = JSON.parse(localStorage.getItem(k));
  for (const p of db.products) { if (p.id === "c15") p.store_featured = true; if (p.id === "k3") p.stock = 0; }
  localStorage.setItem(k, JSON.stringify(db));
  localStorage.setItem(sk, sv);
}, [DB_KEY, "vp_session", JSON.stringify(SESSION)]);
const openPreview = async () => {
  await page.goto(`${BASE}/photos`, { waitUntil: "domcontentloaded" });
  await page.locator("[data-store-board]").waitFor({ timeout: 20000 });
  await page.locator("button", { hasText: "شوف المتجر كزبون" }).first().click();
  await page.locator("[data-preview]").waitFor({ timeout: 10000 });
  await page.waitForTimeout(400);
  return page.locator("[data-preview]");
};
let pv = await openPreview();
let pvText = await pv.innerText();
check("لا صفَّ «مختارات» منفصل — المختارُ بشارته داخل الشبكة كالمتجر",
  !/مختارات/.test(pvText) && (await pv.locator("[data-preview-card]", { hasText: "قطط 15" }).filter({ hasText: "اختيار العيادة" }).count()) === 1, pvText.slice(0, 120));
check("  والنافدُ بشارة «نافد حالياً» وآخرَ الشبكة", (await pv.locator("[data-preview-card]").last().innerText()).includes("نافد حالياً"));
const pvBar = await pv.locator("[data-preview-sections]").innerText();
check("  والشرائحُ بقواعد المتجر: «الكل» بلا عدد، والقسمُ بعدده، و«منتجات أخرى»",
  /الكل/.test(pvBar) && !/الكل\s*·/.test(pvBar) && /قطط\s*·\s*(20|٢٠)/.test(pvBar) && /كلاب\s*·\s*(30|٣٠)/.test(pvBar) && /منتجات أخرى/.test(pvBar), pvBar.replace(/\n/g, " | "));
check("  ومتجرٌ مشغَّلٌ بلا لافتة «مطفأ»", (await pv.locator("[data-preview-off]").count()) === 0);
const pad = await pv.evaluate((el) => { const cs = getComputedStyle(el); return `${cs.paddingLeft}/${cs.paddingRight}/${cs.paddingBottom}`; });
check("  وبلا حشوةٍ ثانية فوق حشوة النافذة", pad === "0px/0px/0px", pad);
await shot("sf-04-preview");
await page.evaluate((k) => { const db = JSON.parse(localStorage.getItem(k)); db.storeProfile.enabled = false; localStorage.setItem(k, JSON.stringify(db)); }, DB_KEY);
pv = await openPreview();
check("ومتجرٌ مطفأ يُقال: الزبونُ ما يشوف شي", /مطفأ/.test(await pv.locator("[data-preview-off]").innerText().catch(() => "")));

console.log("▸ والصفحةُ نفسُها");
check("لا تمريرَ جانبيّ على ٣٩٠ بكسل (المعاينةُ مفتوحة)", (await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)) <= 1);
check("ولا خطأ بالكونسول ولا استثناء", errors.length === 0, errors.slice(0, 3).join(" | "));

await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-storefront: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
