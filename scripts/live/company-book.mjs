/* ============================================================================
 * فحصٌ حيٌّ لدفتر الشركة — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     node scripts/live/company-book.mjs
 *
 * يقود ما يفعله المدير: يفتح ديون الشركات، ثم جدولَ شركةٍ واحدة، يسجّل رصيدَها السابق
 * بتاريخه، يسدّد على الحساب (ويقرأ التوزيعَ قبل الحفظ)، ثم يلغي التسديد — ويقرأ المخزنَ
 * والرصيدَ بعد كلّ خطوة، ويرجع للقائمة فيجد نفسَ الرقم.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-company-book: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const SHOTS = process.env.SHOTS ?? "";
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const iso = (d) => new Date(`${d}T10:00:00+03:00`).toISOString();
const seedDB = () => ({
  products: [], companySections: [], purchaseItems: [], companyCharges: [], companyEntries: [], purchasePayments: [],
  companies: [{ id: "co1", name: "شركة النور", created_at: iso("2025-06-01") }],
  purchases: [
    { id: "pu1", company_id: "co1", company_name: "شركة النور", reference: "N-7", total: 100000, amount_paid: 40000, status: "partial", item_count: 4, purchased_at: iso("2026-01-10"), created_at: iso("2026-01-10") },
    { id: "pu2", company_id: "co1", company_name: "شركة النور", reference: "N-9", total: 50000, amount_paid: 0, status: "unpaid", item_count: 2, purchased_at: iso("2026-02-01"), created_at: iso("2026-02-01") },
  ],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [], appointments: [], treatments: [], admissions: [], reminders: [],
});
const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); } },
  [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const db = async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY));
const digits = async (sel) => Number((await page.locator(sel).first().innerText()).replace(/[^\d٠-٩]/g, "").replace(/[٠-٩]/g, (d) => "٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };

console.log("▸ ١) من ديون الشركات إلى جدول الشركة");
await page.goto(`${BASE}/inventory?view=ledger`, { waitUntil: "domcontentloaded" });
await page.getByText("شركة النور").first().waitFor({ timeout: 40000 });
await page.getByText("شركة النور").first().click();
check("زرُّ «دفتر الشركة» بالشركة المفتوحة", await page.locator('[data-bookbtn="co1"]').count() === 1);
await page.locator('[data-bookbtn="co1"]').click();
await page.locator("[data-book-balance]").waitFor({ timeout: 30000 });
check("صفحتُها الخاصّة بعنوانها", page.url().endsWith("/inventory/companies/co1"), page.url());
check("الرصيدُ = دينُ الفاتورتين (٦٠٬٠٠٠ + ٥٠٬٠٠٠)", await digits("[data-book-balance]") === 110000, String(await digits("[data-book-balance]")));
check("الجدولُ: فاتورتان، والمدفوعُ وقت الشراء سطرٌ مشتقّ", await page.locator('[data-book-row="purchase"]').count() === 2 && await page.locator('[data-book-row="upfront"]').count() === 1);

console.log("▸ ٢) رصيدٌ سابق بتاريخه");
await page.locator("[data-book-opening]").click();
await page.locator("[data-book-openingmodal] [data-book-amount]").fill("90000");
await page.locator("[data-book-openingmodal] [data-book-date]").fill("2025-12-31");
await page.locator("[data-book-openingsave]").click();
await page.locator('[data-book-row="opening"]').waitFor({ timeout: 10000 });
check("الرصيدُ صار ٢٠٠٬٠٠٠", await digits("[data-book-balance]") === 200000, String(await digits("[data-book-balance]")));
check("  والرصيدُ السابق أوّلُ سطر (أقدمُ تاريخاً)", await page.locator("[data-book-table] tbody tr").first().getAttribute("data-book-row") === "opening");
check("  وزرُّه اختفى (رصيدٌ سابقٌ واحد)", await page.locator("[data-book-opening]").count() === 0);
await shot("book-1-opening");

console.log("▸ ٣) تسديدٌ على الحساب — التوزيعُ قبل الحفظ");
await page.locator("[data-book-pay]").click();
await page.locator("[data-book-paymodal] [data-book-amount]").fill("120000");
const pv = (await page.locator("[data-book-preview]").innerText()).replace(/\s+/g, " ");
check("المعاينةُ: للرصيد السابق أوّلاً ثم أقدمُ فاتورة", /للرصيد السابق/.test(pv) && /N-7/.test(pv) && !/N-9/.test(pv), pv);
await shot("book-2-pay");
await page.locator("[data-book-paysave]").click();
await page.locator("[data-book-paymodal]").waitFor({ state: "detached", timeout: 10000 });
await page.waitForTimeout(400);
check("الرصيدُ صار ٨٠٬٠٠٠", await digits("[data-book-balance]") === 80000, String(await digits("[data-book-balance]")));
let d = await db();
check("  المخزن: الفاتورةُ الأقدم ٧٠٬٠٠٠ والأحدثُ لم تُمسّ", d.purchases.find((p) => p.id === "pu1").amount_paid === 70000 && d.purchases.find((p) => p.id === "pu2").amount_paid === 0);
check("  ودفعتُها تحمل صفَّ التسديد", d.purchasePayments.length === 1 && d.purchasePayments[0].entry_id === d.companyEntries.find((e) => e.kind === "payment").id);
check("  وسطرٌ واحدٌ بالجدول بتوزيعه (لا سطرٌ ثانٍ للدفعة)", await page.locator('[data-book-row="accountPay"]').count() === 1 && await page.locator('[data-book-row="payment"]').count() === 0 && await page.locator("[data-book-alloc]").count() === 1);
await shot("book-3-paid");

console.log("▸ ٤) إلغاءُ التسديد");
const payId = d.companyEntries.find((e) => e.kind === "payment").id;
await page.locator(`[data-book-void="${payId}"]`).click();
await page.locator("[data-book-voidsave]").click();
check("بلا سبب لا يُلغى", await page.locator("[data-book-voidmodal]").count() === 1);
await page.locator("[data-book-voidreason]").fill("انكتب مرتين");
await page.locator("[data-book-voidsave]").click();
await page.locator("[data-book-voidmodal]").waitFor({ state: "detached", timeout: 10000 });
await page.waitForTimeout(400);
check("الرصيدُ رجع ٢٠٠٬٠٠٠", await digits("[data-book-balance]") === 200000, String(await digits("[data-book-balance]")));
check("  والسطرُ باقٍ مشطوباً بسببه", await page.locator('[data-book-row="accountPay"][data-voided="1"]').count() === 1 && /انكتب مرتين/.test(await page.locator('[data-book-row="accountPay"]').innerText()));
d = await db();
check("  والفاتورةُ رجعت ٤٠٬٠٠٠ والدفعةُ زالت", d.purchases.find((p) => p.id === "pu1").amount_paid === 40000 && d.purchasePayments.length === 0);

console.log("▸ ٥) القائمةُ تقول نفسَ الرقم");
await page.locator('a[href="/inventory?view=ledger"]').click();
await page.getByText("شركة النور").first().waitFor({ timeout: 20000 });
const card = (await page.locator("body").innerText()).replace(/\s+/g, " ");
check("الدينُ بالقائمة ٢٠٠٬٠٠٠ ومنه الرصيدُ السابق", /200,000|٢٠٠٬٠٠٠/.test(card) && /رصيد سابق/.test(card), card.slice(0, 400));

console.log("▸ ٦) الهاتف");
await page.setViewportSize({ width: 390, height: 844 });
await page.goto(`${BASE}/inventory/companies/co1`, { waitUntil: "domcontentloaded" });
await page.locator("[data-book-balance]").waitFor({ timeout: 30000 });
const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
check("لا تمريرَ جانبيّ للصفحة", sideways <= 1, String(sideways));
check("  والحركاتُ قائمةٌ لا جدولٌ عريض: كلُّ سطرٍ ورصيدُه ظاهر", await page.locator("[data-book-list]").isVisible() && !(await page.locator("[data-book-table]").isVisible())
  && await page.locator("[data-book-mrow]").count() === 5 && /الرصيد/.test(await page.locator("[data-book-mrow]").last().innerText()));
await shot("book-4-phone");

check("ولا خطأ بالصفحة", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(fails === 0 ? `✓ live-company-book: ${passes} فحصاً عبرت` : `✗ ${fails} فشلت من ${passes + fails}`);
if (fails) process.exit(1);
