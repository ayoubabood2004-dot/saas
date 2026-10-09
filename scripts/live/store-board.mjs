/* ============================================================================
 * فحصٌ حيٌّ للوحة المتجر (0229) — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5199 --strictPort   # بطرفٍ آخر
 *     node scripts/live/store-board.mjs
 *
 * يقود ما يفعله المصوّرُ والمدير: يختار صورةً من الألبوم ⇒ يعاينها ⇒ يعتمدها،
 * فيُقرأ المخزنُ (المسارُ والمصغّرُ والوصفُ معاً). ثمّ ينشر من البطاقة، ويحاول
 * نشرَ ما بلا صورة (يُرفض بالسبب لا بصمت)، ويسوّي قسماً ويضيف له، ثمّ يفتح
 * المتجرَ كزبون فيجد القسمَ بشريطه ويضغطه فلا يرى غيرَ منتجاته.
 * ومن مراجعة 0229 العدائية: إخفاءُ منشورٍ بلا صورة يُسأل بالبطاقة وبالجماعيّ (لا يرجع إلا
 * بصورة) والمكتملُ بضغطة؛ والبحثُ يصفّر الاختيار؛ والماسحُ اليدويّ يفتح البطاقة، ورمزُ توأمين
 * يُكتب بالبحث فيظهران، ولا يفتح شيئاً فوق منتقي القسم.
 *
 * لماذا حيّ: الاستوديو يرسم على canvas، والمصغّرُ يُبنى من بايتات، والشريطُ
 * يُحسب من store_front — ثلاثُ حلقاتٍ لا يراها فحصُ نصّ. وأوّلُ تشغيلٍ لهذا
 * الملفّ هو ما كشف أن التجريبيَّ كان يحفظ الصورةَ نصّاً فارغاً.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-store-board: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5199";
const SHOTS = process.env.SHOTS ?? "";
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const now = new Date().toISOString();
const prod = (id, name, extra = {}) => ({
  id, clinic_id: "c1", name, category: "food", sell_price: 5000, cost_price: 3000, stock: 10,
  store_visible: false, store_featured: false, image_path: null, created_at: now, ...extra,
});
const seedDB = () => ({
  products: [
    prod("p1", "علف قطط ملكي"),
    prod("p2", "شامبو كلاب", { barcode: "6281000247" }),
    // توأمان برمزٍ واحد (مقيسٌ بالإنتاج — لهذا وُجدت merge_products).
    prod("p3", "رمل قطط", { sell_price: 0, barcode: "5550001" }),
    prod("p4", "طوق براغيث", { barcode: "5550001" }),
    // منشورٌ قبل 0229 بسعرٍ وحده (قرارُ المالك ١): بلا صورة — إخفاؤه لا يرجع إلا بصورة.
    prod("p5", "مشط قطط", { store_visible: true }),
  ],
  storeSections: [],
  storeProfile: { clinic_id: "c1", slug: "boardtest", enabled: true, delivery_fee: 0, min_order: 0, bio: null, whatsapp: null, updated_at: now },
  companies: [], companySections: [], purchases: [], purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [], appointments: [], treatments: [], admissions: [], reminders: [],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 390, height: 860 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); } },
  [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const db = async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY));
const P = async (id) => (await db()).products.find((p) => p.id === id);
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
const sideways = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/* صورةٌ حقيقية من canvas المتصفّح نفسِه: منتجٌ ملوّنٌ على خلفيّةٍ فاتحة بأبعادٍ غير مربّعة
 * (١٢٠٠×٨٠٠) — فالقصُّ المربّعُ والمصغّرُ يُختبران على شكلٍ يفرق. */
await page.goto(`${BASE}/photos`, { waitUntil: "domcontentloaded" });
const png = Buffer.from(await page.evaluate(() => {
  const c = document.createElement("canvas"); c.width = 1200; c.height = 800;
  const g = c.getContext("2d");
  g.fillStyle = "#f1f1ee"; g.fillRect(0, 0, 1200, 800);
  g.fillStyle = "#c2410c"; g.fillRect(420, 180, 360, 440);
  g.fillStyle = "#1e3a8a"; g.fillRect(470, 260, 260, 90);
  return c.toDataURL("image/png").split(",")[1];
}), "base64");

console.log("▸ اللوحة");
await page.locator("[data-store-board]").waitFor({ timeout: 15000 });
await page.locator("[data-photo-card]").first().waitFor({ timeout: 15000 });
check("اللوحةُ تبدأ بـ«بلا صورة» وفيها المنتجاتُ الخمسة", (await page.locator("[data-photo-card]").count()) === 5,
  `cards=${await page.locator("[data-photo-card]").count()}`);
check("رأسُ التقدّم ظاهرٌ للمدير", await page.locator("[data-board-progress]").isVisible());
check("لا تمريرَ جانبيّ على ٣٩٠ بكسل", (await sideways()) <= 1, `${await sideways()}px`);
await shot("01-board");

console.log("▸ الصورة: ألبوم ⇒ معاينة ⇒ اعتماد");
const [chooser] = await Promise.all([page.waitForEvent("filechooser"), page.locator('[data-photo-gallery="p1"]').click()]);
check("زرُّ الألبوم يفتح حقلاً بلا capture (يُظهر الألبومَ بالموبايل)", !(await chooser.element().getAttribute("capture")));
await chooser.setFiles({ name: "shelf.png", mimeType: "image/png", buffer: png });
await page.locator("[data-photo-studio]").waitFor({ timeout: 10000 });
await page.waitForTimeout(600);
await shot("02-studio");
check("الاستوديو يعرض الصورةَ قبل الرفع", (await page.locator("[data-photo-studio] canvas, [data-photo-studio] img").count()) > 0);
check("لا شيء حُفظ قبل الاعتماد", !(await P("p1")).image_path);
check("والحجمُ المعروض قبل القصّ بأبعاد الأصل", /1,?200\s*×\s*800/.test(await page.locator("[data-photo-studio]").innerText()));
await page.locator("[data-photo-studio]").getByRole("button", { name: /قصّ مربّع/ }).click();
await page.waitForTimeout(400);
check("والقصُّ المربّع يغيّر الحجمَ المعروض قبل الحفظ", /800\s*×\s*800/.test(await page.locator("[data-photo-studio]").innerText()));
await page.locator("[data-photo-approve]").click();
await page.locator("[data-photo-studio]").waitFor({ state: "detached", timeout: 15000 });
const p1 = await P("p1");
check("بعد الاعتماد: المسارُ محفوظٌ صورةً لا نصّاً فارغاً", /^data:image\/(jpeg|webp|png);base64,.{200,}/.test(p1.image_path ?? ""), String(p1.image_path).slice(0, 40));
/* التجريبيُّ يخزّن المضمَّنةَ مرّةً واحدة: الوصفُ يحمل بصمتَها لا نسخةً ثانيةً منها (كانت
 * تضاعف كلَّ صورة فيمتلئ التخزين بعد أربعٍ أو ست). والقاعدةُ نفسُها تُسأل بدوالّها الأصلية:
 * الوصفُ يُصدَّق لهذه الصورة، ولا يُصدَّق لصورةٍ أخرى. */
check("والوصفُ لا يحمل نسخةً ثانيةً من الصورة (بصمةٌ قصيرة)", typeof p1.image_meta?.path === "string" && p1.image_meta.path.length < 64
  && p1.image_meta.path !== p1.image_path, String(p1.image_meta?.path).slice(0, 40));
const trust = await page.evaluate(async ([path, meta]) => {
  const m = await import("/src/lib/productPhoto.ts");
  return { mine: m.metaOf(path, meta) !== null && m.thumbOf(path, meta) === meta.thumb, other: m.metaOf(path + "AA", meta) === null };
}, [p1.image_path, p1.image_meta]);
check("  ويشير لنفس الصورة (وإلا لا يُوثَق) — ولا يُصدَّق لصورةٍ غيرها", trust.mine && trust.other, JSON.stringify(trust));
check("والمصغّرُ محفوظٌ ومختلفٌ عن الكاملة", !!p1.image_meta?.thumb && p1.image_meta.thumb !== p1.image_path);
check("والأبعادُ مربّعة (قصٌّ مربّع)", p1.image_meta?.w === p1.image_meta?.h && p1.image_meta?.w > 0, `${p1.image_meta?.w}×${p1.image_meta?.h}`);
check("والمصدرُ «album»", p1.image_meta?.src === "album", p1.image_meta?.src);
check("والصورةُ بقيت غيرَ منشورة (الرفعُ لا ينشر بصمت)", p1.store_visible === false);

console.log("▸ النشر من البطاقة");
await page.locator('[data-filter="all"]').click().catch(() => undefined);
await page.locator('[data-card-toggle="p1"]').click();
await page.waitForTimeout(500);
check("المنتجُ بصورةٍ وسعرٍ انتشر", (await P("p1")).store_visible === true);
await page.locator('[data-card-toggle="p2"]').click();
await page.waitForTimeout(500);
check("وما بلا صورة ما انتشر", (await P("p2")).store_visible === false);
const why = await page.getByText(/ما انتشر/).first().innerText().catch(() => "");
check("ويقال السببُ بالعدد (١ بلا صورة) لا صمت", /بلا صورة/.test(why) && /1|١/.test(why), why);
await shot("03-published");

console.log("▸ الإخفاء: المنشورُ الناقص يُسأل بالشاشة، والمكتملُ بضغطة");
const confirmOne = page.locator('[data-hide-confirm="p5"]');
await page.locator('[data-card-toggle="p5"]').click();
await confirmOne.waitFor({ timeout: 5000 }).catch(() => undefined);
check("العينُ على منشورٍ بلا صورة تسأل بالبطاقة (لا نافذة متصفّح)", await confirmOne.isVisible());
check("  والسؤالُ يقول ما ينقص وأنه ما يرجع إلا مكتملاً", /صورة/.test(await confirmOne.innerText()) && /ما يرجع/.test(await confirmOne.innerText()), await confirmOne.innerText());
check("  ولا شيء انخفى قبل الجواب", (await P("p5")).store_visible === true);
await confirmOne.locator("[data-hide-no]").click();
check("  و«خلّيه منشور» يرجع البطاقةَ كما كانت", !(await confirmOne.isVisible()) && (await P("p5")).store_visible === true);
await page.locator('[data-card-toggle="p1"]').click();
await page.waitForTimeout(500);
check("والمكتملُ (صورة + سعر) ينخفي بضغطةٍ واحدة بلا سؤال", (await P("p1")).store_visible === false && !(await page.locator('[data-hide-confirm="p1"]').isVisible()));
await page.locator('[data-card-toggle="p1"]').click();
await page.waitForTimeout(500);
check("  ويرجع بضغطة (عليه صورة)", (await P("p1")).store_visible === true);

console.log("▸ الإخفاءُ الجماعيّ يسأل عن الناقص بعدده");
await page.locator('[data-photo-card="p5"] button[aria-pressed]').click();
check("الاختيارُ يُعدّ", /1|١/.test(await page.locator("[data-picked-count]").innerText()));
await page.locator("[data-bulk-hide]").click();
const confirmMany = page.locator('[data-hide-confirm="bulk"]');
await confirmMany.waitFor({ timeout: 5000 }).catch(() => undefined);
check("«اخفِ» على منشورٍ بلا صورة يسأل بالعدد والسبب", await confirmMany.isVisible() && /بلا صورة/.test(await confirmMany.innerText().catch(() => "")));
check("  ولا شيء انخفى قبل الضغطة الثانية", (await P("p5")).store_visible === true);
await shot("03b-hide-confirm");
await confirmMany.locator("[data-hide-yes]").click();
await page.waitForTimeout(500);
check("  والضغطةُ الصريحة تُخفيه", (await P("p5")).store_visible === false);

console.log("▸ البحثُ والقسمُ يصفّران الاختيار (لا فعلَ على ما لا يُرى)");
await page.locator('[data-photo-card="p1"] button[aria-pressed]').click();
check("مختار: ١", /1|١/.test(await page.locator("[data-picked-count]").innerText()));
await page.locator("[data-board-search]").fill("شامبو");
await page.waitForTimeout(300);
const countTxt = await page.locator("[data-picked-count]").innerText().catch(() => "");
check("بعد البحث: لا اختيارَ خفيّ (العدّادُ رجع للتلميح)", !/مختار/.test(countTxt), countTxt);
check("  و«اختر الظاهر» لا يدّعي أن الظاهرَ مختار", /اختر الظاهر/.test(await page.locator("[data-pick-all]").innerText()));
await page.locator("[data-board-search]").fill("");

console.log("▸ الماسحُ اليدويّ");
const scan = async (code) => {
  await page.keyboard.type(code, { delay: 0 });
  await page.keyboard.press("Enter");
  await page.waitForTimeout(400);
};
const blur = () => page.evaluate(() => (document.activeElement instanceof HTMLElement ? document.activeElement.blur() : undefined));
await blur();
await scan("6281000247");
check("مسحُ رمزِ منتجٍ واحد يفتح بطاقته", (await page.getByRole("dialog").count()) === 1 && /شامبو كلاب/.test(await page.getByRole("dialog").innerText().catch(() => "")));
await page.keyboard.press("Escape");
await page.getByRole("dialog").waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
await blur();
await scan("5550001");
check("ورمزُ توأمين لا يفتح أحدَهما", (await page.getByRole("dialog").count()) === 0);
check("  ويُكتب بالبحث فيظهران معاً", (await page.locator("[data-board-search]").inputValue()) === "5550001"
  && (await page.locator('[data-photo-card="p3"]').isVisible()) && (await page.locator('[data-photo-card="p4"]').isVisible()));
const many = await page.getByText(/أكثر من منتج/).first().innerText().catch(() => "");
check("  ويُقال «أكثر من منتج» لا «مو بالمخزون»", /أكثر من منتج/.test(many) && !(await page.getByText(/مو لمنتج بالمخزون/).count()), many);
await shot("03c-twins");
await page.locator("[data-board-search]").fill("");

console.log("▸ التصويرُ المتتابع: النجاحُ باللوحة لا بتوستٍ فوق أزرارها");
await page.locator("[data-seq-start]").click();
const panel = page.locator("[data-seq-panel]");
await panel.waitFor({ timeout: 5000 });
const [ch2] = await Promise.all([page.waitForEvent("filechooser"), panel.getByRole("button", { name: /من الألبوم/ }).click()]);
await ch2.setFiles({ name: "run.png", mimeType: "image/png", buffer: png });
await page.locator("[data-photo-studio]").waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
await page.locator("[data-photo-approve]").click();
await page.locator("[data-photo-studio]").waitFor({ state: "detached", timeout: 15000 });
check("بعد اللقطة: «انحفظت» داخل لوحة الجولة", await panel.locator("[data-seq-saved]").isVisible().catch(() => false));
check("  ولا توستَ نجاحٍ يغطّي أزرارَها (النصُّ مرّةً واحدة — باللوحة)", (await page.getByText(/انحفظت صورة/).count()) === 1,
  String(await page.getByText(/انحفظت صورة/).count()));
check("  واللوحةُ فوق زرّ المساعد العائم (z-40)", Number(await panel.evaluate((el) => getComputedStyle(el).zIndex)) > 40);
await shot("03d-seq");
await panel.getByRole("button", { name: /إغلاق/ }).first().click();

console.log("▸ الأقسام");
await page.getByRole("tab", { name: /الأقسام/ }).click();
await page.locator("[data-sections-panel]").waitFor({ timeout: 10000 });
await page.locator("[data-section-name]").fill("أكل القطط");
await page.locator("[data-section-add]").click();
await page.locator("[data-section-row]").first().waitFor({ timeout: 10000 });
const secs = (await db()).storeSections ?? [];
check("القسمُ انحفظ", secs.length === 1 && secs[0].name === "أكل القطط", JSON.stringify(secs.map((s) => s.name)));
await page.locator("[data-section-name]").fill("أكل  القطط ");
check("والتوأمُ بالتطبيع يُمنع قبل الإرسال", await page.locator("[data-section-add]").isDisabled());
await page.locator("[data-section-name]").fill("");
await page.locator("[data-section-pick]").first().click();
const dlg = page.getByRole("dialog");
await dlg.waitFor({ timeout: 5000 });
await scan("6281000247");
check("مسحةٌ بمنتقي القسم تكتب ببحثه ولا تفتح البطاقةَ فوقه",
  (await page.getByRole("dialog").count()) === 1 && (await dlg.locator("input").first().inputValue()) === "6281000247");
await dlg.locator("input").first().fill("");
await dlg.getByText("علف قطط ملكي").click();
await dlg.getByRole("button", { name: /أضف المختار/ }).click();
await page.waitForTimeout(800);
check("المنتجُ صار بالقسم", (await P("p1")).store_section_id === secs[0]?.id);
check("ولا تمريرَ جانبيّ بشاشة الأقسام", (await sideways()) <= 1, `${await sideways()}px`);
await shot("04-sections");

console.log("▸ المتجرُ كزبون");
await page.locator("[data-store-board]").waitFor();
await page.goto(`${BASE}/s/boardtest`, { waitUntil: "domcontentloaded" });
await page.locator("[data-storesections]").waitFor({ timeout: 15000 }).catch(() => undefined);
const bar = await page.locator("[data-storesections]").innerText().catch(() => "");
check("شريطُ الأقسام ظاهرٌ بالقسم وعدده", /أكل القطط\s*·\s*(1|١)/.test(bar), bar.replace(/\s+/g, " ").slice(0, 80));
const body = await page.locator("body").innerText();
check("المنشورُ ظاهر", body.includes("علف قطط ملكي"));
check("وغيرُ المنشور غائب", !body.includes("شامبو كلاب") && !body.includes("طوق براغيث"));
const img = page.locator("img[src^='data:image']").first();
check("وصورتُه بالشبكة هي المصغّر لا الكاملة", (await img.getAttribute("src").catch(() => "")) === p1.image_meta?.thumb);
check("ولا تمريرَ جانبيّ بالمتجر", (await sideways()) <= 1, `${await sideways()}px`);
await shot("05-storefront");

check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-store-board: ${passes} ✓ · ${fails} ✗`);
process.exit(fails ? 1 : 0);
