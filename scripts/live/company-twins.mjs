/* ============================================================================
 * فحصٌ حيٌّ لطيّ الشركات — متصفّحٌ حقيقيّ على الوضع التجريبيّ.
 *
 * ليس جزءاً من `npm run build` (يحتاج خادمَ تطوير ومتصفّحاً)، ويُشغَّل يدوياً:
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     npm run live:twins
 *
 * ولماذا حيٌّ لا ساكن: العطبُ الذي أمسكه هذا الفحصُ أوّلَ مرّة **لا يراه فحصُ
 * نصٍّ ولا فحصُ منطق**. نافذةُ الطيّ كانت تقول «مخزون مجمّع ٣» عن حوضٍ مقدارُه
 * ٣٫٢٥: المنطقُ صحيحٌ، والقاعدةُ صحيحة، و`formatNum` وحدَها تقصّ الكسر. رقمٌ
 * معقولٌ بالنظر وكاذبٌ بالقياس — وعليه يُبنى قرارُ طيّ. (والسقوطُ صار محروساً
 * ساكناً كذلك بـ`scripts/qty-format-test.mjs`، لكنّ **مَن كشفه** هو هذا.)
 *
 * ويقيس ثلاثةَ مساراتٍ بالشاشة نفسِها:
 *   ١) البطاقةُ تظهر بأعدادٍ صادقة، وتقول **ما ينتقل** لا ما بالمجموعة.
 *   ٢) الطيُّ ينقل كلَّ شيءٍ ولا يفقد حافظةً واحدة، والفكُّ يرجّعها.
 *   ٣) والحذفُ الصريح يرجّع **الديونَ** — البابُ الذي كان يفقدها بصمت.
 * ==========================================================================*/
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* نجرّب التالي */ }
}
if (!chromium) {
  console.error("✗ live-twins: ما لكيت playwright. ركّبه: npm i -D playwright  (أو شغّله من بيئةٍ فيها النسخةُ العالمية)");
  process.exit(1);
}
const B = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const { readFileSync } = await import("node:fs");

/* مفتاحُ مخزن الديمو يُقرأ من مصدره لا يُكتب هنا بيد — نفسُ درسِ
 * `repo-demo-test`: مفتاحٌ مخمَّنٌ يجعل الفحصَ يمرّ على بذرةٍ غيرِ بذرتنا. */
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ live-twins: ما انقرأ مفتاحُ مخزن الديمو من demoStore.ts"); process.exit(1); }
const SESSION = { raw: { id: "demo-admin", full_name: "مدير الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/** بذرةٌ فيها مجموعتا توائم، وحوضٌ بكسر، ودَينٌ، وفاتورةٌ، ودفعة. */
const seedDB = () => ({
  products: [
    { id: "pa", name: "علف-أ", barcode: "1001", company_id: "D1", section_id: "sd", stock: 4, sell_price: 1000, created_at: "2026-02-01T00:00:00.000Z" },
    { id: "pb", name: "علف-ب", barcode: "1002", company_id: "D1", section_id: "so", stock: 6, sell_price: 2000, created_at: "2026-02-01T00:00:00.000Z" },
    { id: "pc", name: "علف-ج", barcode: "1003", company_id: "K1", section_id: "sk", stock: 5, sell_price: 3000, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "pd", name: "شامبو", barcode: "1004", company_id: "D2", section_id: null, stock: 2, sell_price: 500, created_at: "2026-03-01T00:00:00.000Z" },
  ],
  companies: [
    { id: "K1", clinic_id: "c1", name: "اليف هاوس", note: "الوكيل الرسمي", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "D1", clinic_id: "c1", name: "اليف  هاوس", note: "رقم المندوب 0770", created_at: "2026-02-01T00:00:00.000Z" },
    { id: "K2", clinic_id: "c1", name: "بيورينا", note: null, created_at: "2026-01-05T00:00:00.000Z" },
    { id: "D2", clinic_id: "c1", name: "بيورينا", note: null, created_at: "2026-03-01T00:00:00.000Z" },
    { id: "S1", clinic_id: "c1", name: "رويال كانين", note: null, created_at: "2026-01-09T00:00:00.000Z" },
  ],
  companySections: [
    { id: "sk", clinic_id: "c1", company_id: "K1", name: "دراي فود", pooled_stock: 7.5, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "sd", clinic_id: "c1", company_id: "D1", name: "درايفود", pooled_stock: 2.25, created_at: "2026-02-01T00:00:00.000Z" },
    { id: "so", clinic_id: "c1", company_id: "D1", name: "مكمّلات", pooled_stock: 1, created_at: "2026-02-01T00:00:00.000Z" },
  ],
  purchases: [{ id: "qu", clinic_id: "c1", company_id: "D1", company_name: "اليف  هاوس", total: 900000, amount_paid: 300000, purchased_at: "2026-02-10T00:00:00.000Z", created_at: "2026-02-10T00:00:00.000Z" }],
  purchasePayments: [{ id: "py", clinic_id: "c1", company_id: "D1", amount: 120000, paid_at: "2026-02-11", created_at: "2026-02-11T00:00:00.000Z" }],
  companyCharges: [
    { id: "ch1", clinic_id: "c1", company_id: "D1", amount: 5000, charged_at: "2026-02-12", created_at: "2026-02-12T00:00:00.000Z" },
    { id: "ch2", clinic_id: "c1", company_id: "D1", amount: 2500, charged_at: "2026-02-13", created_at: "2026-02-13T00:00:00.000Z" },
  ],
  purchaseItems: [], invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [],
  appointments: [], treatments: [], admissions: [], reminders: [],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const open = async (db = seedDB()) => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 }, locale: "ar-IQ" });
  await ctx.addInitScript(([k, v, sk, sv]) => { localStorage.setItem(k, v); localStorage.setItem(sk, sv); },
    [DB_KEY, JSON.stringify(db), "vp_session", JSON.stringify(SESSION)]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "الشركات", exact: true }).first().click();
  await page.waitForTimeout(700);
  return { ctx, page };
};
const readDB = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY));
/** الحافظات: «س لازم يبقى يساوي ص بعد الضغط» — نفسُ منهج حزمة SQL. */
const invariants = (db) => ({
  prods: db.products.length,
  noCo: db.products.filter((p) => p.company_id == null).length,
  noSec: db.products.filter((p) => p.section_id == null).length,
  stock: db.products.reduce((a, p) => a + (p.stock || 0), 0),
  pool: +(db.companySections.reduce((a, s) => a + (s.pooled_stock || 0), 0)).toFixed(3),
  charges: db.companyCharges.reduce((a, c) => a + c.amount, 0),
  pays: db.purchasePayments.reduce((a, p) => a + p.amount, 0),
  owed: db.purchases.reduce((a, p) => a + Math.max(0, p.total - (p.amount_paid ?? p.total)), 0),
});

/* ── ١) البطاقة ─────────────────────────────────────────────────────────── */
console.log("▸ البطاقة: تظهر بتكرارٍ حقيقيّ، وتقول ما ينتقل");
{
  const { ctx, page } = await open();
  check("البطاقة ظاهرة بمجموعتين", await page.locator("[data-twingroup]").count() === 2);
  const txt = await page.locator("[data-twinscard]").innerText();
  check("  وتقول «2 اسم متكرر، و2 صف زايد»", /2 اسم متكرر/.test(txt) && /2 صف زايد/.test(txt));
  check("  و«اليف هاوس»: ينتقل ٢ منتج و٢ صنف (لا ٣ منتجات المجموعة)", /ينتقل 2 منتج و2 صنف/.test(txt));
  check("  و«بيورينا»: ينتقل ١ منتج و٠ صنف", /ينتقل 1 منتج و0 صنف/.test(txt));
  await ctx.close();

  const clean = seedDB();
  clean.companies = clean.companies.filter((c) => !["D1", "D2"].includes(c.id));
  clean.companySections = clean.companySections.filter((s) => s.company_id !== "D1");
  clean.products = clean.products.map((p) => (["D1", "D2"].includes(p.company_id) ? { ...p, company_id: "K1", section_id: null } : p));
  const { ctx: c2, page: p2 } = await open(clean);
  check("وبلا تكرارٍ لا تظهر أصلاً", await p2.locator("[data-twinscard]").count() === 0);
  await c2.close();
}

/* ── ٢) الطيُّ والفكّ ───────────────────────────────────────────────────── */
console.log("\n▸ الطيّ: ينقل كلَّ شيء، والفكُّ يرجّعه");
{
  const seed = seedDB();
  const before = invariants(seed);
  const { ctx, page } = await open(seed);
  await page.locator('[data-twingroup] button:has-text("راجع وادمج")').first().click();
  await page.waitForTimeout(600);
  const dlg = await page.locator('[role="dialog"]').first().innerText();
  const flat = dlg.replace(/\s+/g, " ");
  check("النافذة تُبقي الأقدم افتراضاً", /الوكيل الرسمي[\s\S]*هذا الي يبقى/.test(dlg));
  for (const [label, want] of [["منتج", "2"], ["صنف", "2"], ["فاتورة شراء", "1"], ["دفعة للمورّد", "1"], ["مطالبة/دين", "2"]]) {
    check(`  وتقول ${label} = ${want}`, new RegExp(`${label.replace("/", "\\/")} ${want}\\b`).test(flat), flat.match(new RegExp(`${label.replace("/", "\\/")} [^ ]+`))?.[0]);
  }
  // **الفحصُ الذي كشف العطب**: ٣٫٢٥ كانت تُعرض «٣».
  check("  و**الحوض بكسره ٣٫٢٥ لا ٣**", /مخزون مجمّع 3\.25/.test(flat), flat.match(/مجمّع [^ ]+/)?.[0]);

  await page.locator("[data-mergego]").click();
  await page.waitForTimeout(1500);
  const db = await readDB(page);
  const after = invariants(db);
  for (const k of Object.keys(before)) check(`  حافظة ${k} ثابتة`, before[k] === after[k], `${before[k]} ⇒ ${after[k]}`);
  check("  والمطويّة اختفت", !db.companies.some((c) => c.id === "D1"));
  check("  وحوضُ الباقي ٧٫٥ + ٢٫٢٥ = ٩٫٧٥", db.companySections.find((s) => s.id === "sk")?.pooled_stock === 9.75);
  check("  والفاتورةُ انتقلت واسمُها توحّد", db.purchases[0].company_id === "K1" && db.purchases[0].company_name === "اليف هاوس");
  check("  والدفعةُ والمطالبتان انتقلن", db.purchasePayments.every((p) => p.company_id === "K1") && db.companyCharges.every((c) => c.company_id === "K1"));
  check("  والملاحظتان اتّحدتا", /الوكيل/.test(db.companies.find((c) => c.id === "K1").note) && /المندوب/.test(db.companies.find((c) => c.id === "K1").note));
  check("  والبطاقةُ تحدّثت بلا إعادة تحميل", await page.locator("[data-twingroup]").count() === 1);

  await page.getByRole("button", { name: "المحذوفات", exact: true }).first().click();
  await page.waitForTimeout(1200);
  check("والمطويّةُ بتبويب المحذوفات موسومةً بالدمج", /مدموجة بشركة ثانية/.test(await page.locator('[data-cotrashrow="D1"]').innerText()));
  await page.locator('[data-cotrashrow="D1"] button:has-text("استرجاع")').click();
  await page.waitForTimeout(1500);
  const back = invariants(await readDB(page));
  for (const k of Object.keys(before)) check(`  والفكُّ يرجّع ${k}`, before[k] === back[k], `${before[k]} ⇒ ${back[k]}`);
  const d2 = await readDB(page);
  check("  وحوضُ الباقي رجع ٧٫٥ بالضبط (طرحُ ما أُضيف لا تخمين)", d2.companySections.find((s) => s.id === "sk")?.pooled_stock === 7.5);
  await ctx.close();
}

/* ── ٣) الحذفُ الصريح: البابُ الذي كان يفقد الديون ──────────────────────── */
console.log("\n▸ الحذف: بلا window.confirm، ويرجّع الديون");
{
  const { ctx, page } = await open();
  let native = 0;
  page.on("dialog", async (d) => { native++; await d.dismiss(); });
  await page.locator('button:has-text("اليف  هاوس")').first().click();
  await page.waitForTimeout(700);
  await page.locator('button[aria-label="Delete"], button[aria-label="حذف"]').first().click();
  await page.waitForTimeout(800);
  const dlg = await page.locator('[role="dialog"]').first().innerText();
  const flat = dlg.replace(/\s+/g, " ");
  check("ماكو تأكيدُ متصفّح", native === 0);
  check("  والنافذةُ تقول إنها مكرّرة وتعرض الطيَّ بديلاً", /مكرّرة/.test(dlg) && await page.locator('button:has-text("ادمجها بدل الحذف")').count() > 0);
  check("  وتسمّي ما يتحرّك بالعدد", /منتج 2\b/.test(flat) && /صنف 2\b/.test(flat) && /مجمّع 3\.25/.test(flat), flat.slice(0, 120));
  await page.locator('button:has-text("ادمجها بدل الحذف")').click();
  await page.waitForTimeout(700);
  check("  وزرُّ «ادمجها» يفتح نافذةَ الطيّ", await page.locator("[data-mergego]").count() === 1);
  await page.locator('button:has-text("إلغاء")').last().click();
  await page.waitForTimeout(500);

  await page.locator('button[aria-label="Delete"], button[aria-label="حذف"]').first().click();
  await page.waitForTimeout(700);
  await page.locator('input[placeholder*="سبب"]').fill("توأم بالغلط");
  await page.locator("[data-delcogo]").click();
  await page.waitForTimeout(1500);
  const db = await readDB(page);
  const tr = (db.companiesTrash ?? []).find((x) => x.id === "D1");
  check("اللقطةُ بلا وجهة (حذفٌ لا طيّ)", !!tr && !tr.merged_into);
  check("  و**صفوفُ المطالبات محفوظةٌ** لا معرّفاتُها", (tr?.charges ?? []).reduce((a, c) => a + c.amount, 0) === 7500);
  check("  والسببُ انحفظ", tr?.reason === "توأم بالغلط", tr?.reason);
  check("  والمطالباتُ انمحت بالتتالي (مرآةُ cascade)", !db.companyCharges.some((c) => c.company_id === "D1"));

  await page.getByRole("button", { name: "المحذوفات", exact: true }).first().click();
  await page.waitForTimeout(1200);
  await page.locator('[data-cotrashrow="D1"] button:has-text("استرجاع")').click();
  await page.waitForTimeout(1500);
  const d2 = await readDB(page);
  check("والاسترجاعُ يرجّع **الديونَ بمبلغها**", d2.companyCharges.filter((c) => c.company_id === "D1").reduce((a, c) => a + c.amount, 0) === 7500);
  check("  وأصنافَها بحوضها ٣٫٢٥", d2.companySections.filter((s) => s.company_id === "D1").reduce((a, s) => a + (s.pooled_stock || 0), 0) === 3.25);
  check("  ومنتجاتِها لشركتها وصنفها", d2.products.filter((p) => ["pa", "pb"].includes(p.id)).every((p) => p.company_id === "D1" && p.section_id != null));
  check("  والفاتورةَ والدفعة", d2.purchases[0].company_id === "D1" && d2.purchasePayments[0].company_id === "D1");
  await ctx.close();
}

/* ── ٤) ولا يُولد توأمٌ جديدٌ من الشاشة ─────────────────────────────────── */
console.log("\n▸ المنع: الشاشةُ لا تُنشئ توأماً");
{
  const { ctx, page } = await open();
  const n0 = (await readDB(page)).companies.length;
  for (const name of ["رويال  كانين", " رويال كانين "]) {
    await page.locator('button:has-text("أضف شركة")').first().click();
    await page.waitForTimeout(500);
    await page.locator('[role="dialog"] input').first().fill(name);
    await page.locator('[role="dialog"] button').last().click();
    await page.waitForTimeout(900);
    const body = await page.locator("body").innerText();
    check(`«${name}» ما انضافت`, (await readDB(page)).companies.length === n0);
    check("  ورسالتُها عربيةٌ مفهومة", /بنفس الاسم|موجودة|مكرّر/.test(body) && !/\{\{|object Object|twin\.|errors\./.test(body));
    if (await page.locator('[role="dialog"]').count()) { await page.keyboard.press("Escape"); await page.waitForTimeout(400); }
  }
  await ctx.close();
}

await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-twins: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
