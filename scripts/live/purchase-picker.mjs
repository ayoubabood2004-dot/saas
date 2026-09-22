/* ============================================================================
 * فحصٌ حيٌّ لمنتقي منتجات الشركة بفاتورة الشراء — متصفّحٌ حقيقيّ.
 *
 * ليس جزءاً من `npm run build` (يحتاج خادمَ تطوير ومتصفّحاً)، ويُشغَّل يدوياً:
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     npm run live:picker
 *
 * ولماذا حيٌّ لا ساكن: الميزةُ **تفاعلٌ** — نطاقٌ يتبدّل، وتأشيرٌ، وعددٌ يُكتب
 * بالصفّ، ثمّ سطورٌ تهبط بالفاتورة. ولا يُثبت شيءٌ من هذا إلا بقيادة الشاشة.
 * وأوّلُ تشغيلٍ أمسك عطباً فعلاً: بشركتين اسمُهما واحدٌ بعد التطبيع كان المنتقي
 * يفتح على منتجات **الأخرى** (`normGroupName` تطوي المسافات الداخلية، فالمقارنةُ
 * «الدقيقة» بها ليست دقيقة) — فصارت المطابقةُ بالنصّ الخامّ أوّلاً.
 *
 * ==========================================================================*/
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* نجرّب التالي */ }
}
if (!chromium) {
  console.error("✗ live-picker: ما لكيت playwright. ركّبه: npm i -D playwright  (أو شغّله من بيئةٍ فيها النسخةُ العالمية)");
  process.exit(1);
}
const B = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const { readFileSync } = await import("node:fs");

/* مفتاحُ مخزن الديمو يُقرأ من مصدره لا يُكتب هنا بيد — نفسُ درسِ
 * `repo-demo-test`: مفتاحٌ مخمَّنٌ يجعل الفحصَ يمرّ على بذرةٍ غيرِ بذرتنا. */
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ live-picker: ما انقرأ مفتاحُ مخزن الديمو من demoStore.ts"); process.exit(1); }
const SESSION = { raw: { id: "demo-admin", full_name: "مدير الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/** بذرةٌ تمثّل المقيسَ بالإنتاج: شركتان اسمُهما واحدٌ بعد التطبيع، ومنتجٌ بلا
 *  باركود، ومنتجٌ بلا شركة (٤٥٪ من المخزن كذلك)، وواحدٌ تحت حدّ التنبيه. */
const seedDB = () => ({
  products: [
    { id: "pa", name: "علف-أ", barcode: "1001", company_id: "D1", section_id: "sd", stock: 4, purchase_price: 1000, sell_price: 1800, created_at: "2026-02-01T00:00:00.000Z" },
    { id: "pb", name: "علف-ب", barcode: "1002", company_id: "D1", section_id: "so", stock: 6, purchase_price: 2000, sell_price: 3000, created_at: "2026-02-01T00:00:00.000Z" },
    { id: "pc", name: "علف-ج", barcode: "1003", company_id: "K1", section_id: "sk", stock: 5, purchase_price: 1500, sell_price: 3000, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "px", name: "فيتامين", barcode: "", company_id: "K1", section_id: "sk", stock: 1, min_stock: 5, purchase_price: 2500, sell_price: 4000, created_at: "2026-01-02T00:00:00.000Z" },
    { id: "py", name: "قطن طبي", barcode: "2001", company_id: null, section_id: null, stock: 9, purchase_price: 300, sell_price: 500, created_at: "2026-01-03T00:00:00.000Z" },
    { id: "pz", name: "دراي فود سائب", barcode: "3001", company_id: "K1", section_id: "sk", stock: 3.25, sold_by_weight: true, purchase_price: 4000, sell_price: 6000, created_at: "2026-01-04T00:00:00.000Z" },
    { id: "pw", name: "شامبو", barcode: "4001", company_id: "K1", section_id: "sk", stock: 1, purchase_price: 900, sell_price: 1500, created_at: "2026-01-05T00:00:00.000Z" },
  ],
  companies: [
    { id: "K1", clinic_id: "c1", name: "اليف هاوس", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "D1", clinic_id: "c1", name: "اليف  هاوس", created_at: "2026-02-01T00:00:00.000Z" },
  ],
  companySections: [
    { id: "sk", clinic_id: "c1", company_id: "K1", name: "دراي فود", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "sd", clinic_id: "c1", company_id: "D1", name: "درايفود", created_at: "2026-02-01T00:00:00.000Z" },
    { id: "so", clinic_id: "c1", company_id: "D1", name: "مكمّلات", created_at: "2026-02-01T00:00:00.000Z" },
  ],
  purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [],
  appointments: [], treatments: [], admissions: [], reminders: [],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const open = async (db = seedDB(), company = "اليف هاوس") => {
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "ar-IQ" });
  await ctx.addInitScript(([k, v, sk, sv]) => { localStorage.setItem(k, v); localStorage.setItem(sk, sv); },
    [DB_KEY, JSON.stringify(db), "vp_session", JSON.stringify(SESSION)]);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/inventory`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "المشتريات", exact: true }).first().click();
  await page.waitForTimeout(800);
  await page.locator('button:has-text("فاتورة شراء")').first().click();
  await page.waitForTimeout(1000);
  if (company) {
    await page.locator('input[placeholder*="اختر شركة"]').first().fill(company);
    await page.waitForTimeout(600);
  }
  return { ctx, page };
};
const openPicker = async (page) => {
  await page.locator("[data-pickopen]").click({ force: true });
  await page.waitForTimeout(900);
};
const flat = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

/* ── ١) النطاق: لا يُقفل على شركة الفاتورة ────────────────────────────── */
console.log("▸ ١) النطاق — وشركتان اسمُهما واحدٌ بعد التطبيع");
{
  const { ctx, page } = await open();
  await openPicker(page);
  // **العطبُ الذي أمسكه أوّلُ تشغيل**: كان يفتح على منتجات التوأم الآخر.
  check("يفتح على شركة الفاتورة بالنصّ الخامّ لا على توأمها",
    await page.locator('[data-pickrow="pc"]').count() === 1 && await page.locator('[data-pickrow="pa"]').count() === 0);
  check("  ويعرض الباركود والرصيد وسعر الشراء", /1003/.test(await flat(page)) && /رصيد 5/.test(await flat(page)) && /شراء/.test(await flat(page)));
  check("  ومنتجٌ بلا باركود يُقال لا يُخفى", /بلا باركود/.test(await flat(page)));
  await page.locator('button:has-text("كل المنتجات")').click();
  await page.waitForTimeout(400);
  check("«كل المنتجات» يشمل ما بلا شركة (٤٥٪ من المخزن)", await page.locator('[data-pickrow="py"]').count() === 1);
  await page.locator('button:has-text("بدون شركة")').click();
  await page.waitForTimeout(400);
  check("  و«بدون شركة» يعرضه وحدَه", await page.locator("[data-pickrow]").count() === 1);
  await page.locator('button:has-text("كل المنتجات")').click();
  await page.waitForTimeout(300);
  await page.locator('button:has-text("الناقص بس")').click();
  await page.waitForTimeout(400);
  /* **«الناقص» بتعريف النظام**: `lowThreshold` = حدُّ المنتج، وإلا الحدُّ العامّ.
     و٧٨١ منتجاً بالإنتاج حدُّه صفر — فاشتراطُ `min_stock > 0` كان يخفيها كلَّها. */
  const lowN = await page.locator("[data-pickrow]").count();
  check("و«الناقص بس» يشمل من حدُّه صفرٌ ورصيدُه منخفض (تعريفُ النظام)",
    lowN >= 2 && await page.locator('[data-pickrow="px"]').count() === 1 && await page.locator('[data-pickrow="pw"]').count() === 1, String(lowN));
  await ctx.close();
}

/* ── ١ب) الكسرُ يبقى كسراً لمن يُباع بالوزن ────────────────────────────── */
console.log("\n▸ ١ب) الكميةُ الكسرية لمن يُباع بالوزن");
{
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('[data-pickrow="pz"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-pickqty="pz"]').fill("2.5");
  await page.waitForTimeout(300);
  check("٢٫٥ كغم تبقى ٢٫٥ لا تصير ٣", await page.locator('[data-pickqty="pz"]').inputValue() === "2.5",
    await page.locator('[data-pickqty="pz"]').inputValue());
  await page.locator('[data-pickrow="pc"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-pickqty="pc"]').fill("2.7");
  await page.waitForTimeout(300);
  check("  وما يُعدّ بالقطعة يبقى صحيحاً", await page.locator('[data-pickqty="pc"]').inputValue() === "3",
    await page.locator('[data-pickqty="pc"]').inputValue());
  await ctx.close();
}

/* ── ١ج) تأشيرُ المعروض، والمؤشَّرُ خارجَه يُقال ─────────────────────────── */
console.log("\n▸ ١ج) «أشّر كل المعروض» — ولا مؤشَّرَ يختفي بصمت");
{
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('button:has-text("أشّر كل المعروض")').click();
  await page.waitForTimeout(400);
  const n = await page.locator("[data-pickrow]").count();
  check("يؤشّر المعروضَ كلَّه بضغطة", /مؤشّر/.test(await flat(page)) && n > 1, String(n));
  await page.locator('button:has-text("بدون شركة")').click();
  await page.waitForTimeout(500);
  check("  وبتبديل النطاق يُقال إنّ المؤشَّر خارج المعروض", /خارج المعروض/.test(await flat(page)),
    (await flat(page)).match(/[^ ]*خارج المعروض/)?.[0]);
  await ctx.close();
}

/* ── ٢) البحث مطبَّعٌ بالطرفين ──────────────────────────────────────────── */
console.log("\n▸ ٢) البحث");
{
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('button:has-text("كل المنتجات")').click();
  await page.waitForTimeout(300);
  for (const [q, id, why] of [["علف-ج", "pc", "بالاسم"], ["1003", "pc", "بالباركود"], ["قطن", "py", "باسمٍ جزئيّ"]]) {
    await page.locator('input[placeholder*="دوّر"]').fill(q);
    await page.waitForTimeout(450);
    check(`  ${why}: «${q}»`, await page.locator(`[data-pickrow="${id}"]`).count() === 1);
  }
  await page.locator('input[placeholder*="دوّر"]').fill("ماكو هيج شي");
  await page.waitForTimeout(450);
  check("  وما لا وجودَ له يقولها بوضوح", /ماكو منتج/.test(await flat(page)));
  await ctx.close();
}

/* ── ٣) التأشير والعدد، والسطورُ تهبط كاملة ───────────────────────────── */
console.log("\n▸ ٣) السطورُ تهبط كاملةً ولا يبقى إلا العدد");
{
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('[data-pickrow="pc"]').click();
  await page.waitForTimeout(300);
  await page.locator('[data-pickqty="pc"]').fill("7");
  await page.locator('[data-pickrow="px"]').click();
  await page.waitForTimeout(300);
  const f = await flat(page);
  check("المجموعُ يُقال قبل الضغط", /تقدير الكلفة/.test(f), f.match(/تقدير الكلفة[^إ]*/)?.[0]?.slice(0, 40));
  await page.locator("[data-pickgo]").click();
  await page.waitForTimeout(900);
  const after = await flat(page);
  check("انضافت المادّتان", /انضافت 2 مادة/.test(after));
  check("  والسطرُ حمل الاسم والباركود والسعر", /علف-ج/.test(after) && /1003/.test(after) && /1,500/.test(after));
  check("  والعددُ المكتوبُ وصل كما هو", /7/.test(after));
  await ctx.close();
}

/* ── ٤) العددُ استبدالٌ لا جمع، والقائمُ يُقال ────────────────────────── */
console.log("\n▸ ٤) ما هو بالفاتورة يُقال، والعددُ يُستبدل لا يُجمع");
{
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('[data-pickrow="pc"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-pickqty="pc"]').fill("4");
  await page.locator("[data-pickgo]").click();
  await page.waitForTimeout(800);
  await openPicker(page);
  check("الصفُّ يقول إنه بالفاتورة الآن", /بالفاتورة الآن: 4/.test(await flat(page)), (await flat(page)).match(/بالفاتورة[^·]{0,20}/)?.[0]);
  await page.locator('[data-pickrow="pc"]').click();
  await page.waitForTimeout(300);
  const seeded = await page.locator('[data-pickqty="pc"]').inputValue();
  check("  والحقلُ يبدأ بعدده لا بواحد (بلا حسابٍ ذهنيّ)", seeded === "4", seeded);
  await page.locator('[data-pickqty="pc"]').fill("6");
  await page.locator("[data-pickgo]").click();
  await page.waitForTimeout(800);
  const got = await page.locator('input[type="number"]').first().inputValue();
  check("  والنتيجةُ ٦ لا ١٠ (استبدالٌ لا جمع)", got === "6", got);
  await ctx.close();
}

/* ── ٥) سطرٌ بلا عدد لا يسقط بصمت ─────────────────────────────────────── */
console.log("\n▸ ٥) سطرٌ بلا عدد يُقال ولا يُحذف بصمت");
{
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('[data-pickrow="pc"]').click();
  await page.waitForTimeout(250);
  await page.locator('[data-pickrow="px"]').click();
  await page.waitForTimeout(250);
  await page.locator("[data-pickgo]").click();
  await page.waitForTimeout(800);
  // امسح عددَ **سطرٍ واحد** — تماماً كما ينسى المستخدمُ سطراً بفاتورةٍ طويلة.
  const qtyBox = page.locator('input[type="number"]').first();
  await qtyBox.fill("");
  await page.waitForTimeout(400);
  await page.locator('button:has-text("حفظ وتنزيل على المخزون")').click();
  await page.waitForTimeout(900);
  const t5 = await flat(page);
  check("**الحفظُ يُرفض ويقول أيَّ سطر**", /بلا عدد/.test(t5), t5.match(/[^ ]*بلا عدد[^·]{0,60}/)?.[0]);
  check("  والفاتورةُ ما انحفظت", await page.locator('button:has-text("حفظ وتنزيل على المخزون")').count() === 1);
  await ctx.close();
}

/* ── ٦) سطران لنفس المادّة: يُقالان ولا يُمنعان ───────────────────────── */
console.log("\n▸ ٦) سطران لنفس المادّة — يُريان بدل أن يُضاعفا بصمت");
{
  /* `record_purchase` تحلّ كلَّ سطرٍ وحدَه ثمّ تجمع على الرصيد — فسطران
     يحلّان لنفس المنتج يُضيفان مرّتين بلا خطأ. ومقيسٌ بالإنتاج: خمسُ فواتير.
     ولا يُمنع (١٤٣ + ١٥٤ قد تكونان دفعتين مقصودتين) — يُرى. */
  const { ctx, page } = await open();
  await openPicker(page);
  await page.locator('[data-pickrow="pc"]').click();
  await page.waitForTimeout(250);
  await page.locator("[data-pickgo]").click();
  await page.waitForTimeout(800);
  check("سطرٌ واحدٌ بلا شارة", !/نفس المادة بسطر ثاني/.test(await flat(page)));
  // سطرٌ ثانٍ بنفس الباركود يُكتب يدوياً بصندوق المسح
  await page.locator('input[placeholder*="امسح الباركود"]').fill("1003");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("إضافة")').first().click();
  await page.waitForTimeout(700);
  const f6 = await flat(page);
  // الماسحُ يدمج بنفس الباركود — فالشارةُ لا تظهر، وهذا هو الصواب.
  check("  والمسحُ بنفس الباركود يُدمج فلا يصير سطران", !/نفس المادة بسطر ثاني/.test(f6));
  // الطريقُ الحقيقيّ: «أضف صنفاً» سطرٌ خامٌّ يُكتب فيه نفسُ الباركود بلا مسح.
  await page.locator('button:has-text("أضف صنفاً")').first().click();
  await page.waitForTimeout(500);
  const codeBoxes = page.locator('input[dir="ltr"]');
  await codeBoxes.last().fill("1003");
  await page.waitForTimeout(600);
  const f7 = await flat(page);
  check("  **وسطرٌ ثانٍ يحلّ لنفس المادّة يُقال بشارة**", /نفس المادة بسطر ثاني/.test(f7),
    f7.match(/[^ ]*نفس المادة[^·]{0,40}/)?.[0] ?? "(ماكو شارة)");
  await ctx.close();
}

await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-picker: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
