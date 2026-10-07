/* ============================================================================
 * فحصٌ حيٌّ لرقم الطلب والبحث بالتوصيل — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     node scripts/live/delivery-search.mjs
 *
 * يقود ما يفعله الكاشير ثم من يتابع الطلبات: بيعةٌ بتوصيلٍ ورقمِ طلبٍ ممسوح بالماسح
 * (ولا يذهب للسلّة)، ثم البحثُ بالرقم والهاتف بصيغٍ مختلفة ورقمِ الفاتورة والاسم،
 * والأرقامُ فوق تبقى صادقةً أثناء البحث، وإضافةُ رقمٍ بعد البيع مع تنبيه التكرار،
 * والبحثُ داخل شركةٍ بعينها — ويقرأ المخزنَ بعد كلّ خطوة.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-delivery-search: ما لكيت playwright"); process.exit(1); }
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
const iso = (d, hm = "10:00") => new Date(`${d}T${hm}:00+03:00`).toISOString();
const BARCODE = "6281000000017";
/* طلباتٌ قديمة بصيغ هاتفٍ مختلفة — كما هي بالإنتاج فعلاً (مسافات، +964، أرقامٌ شرقية). */
const old = (n, over) => ({
  id: `old${n}`, invoice_id: `00000000-0000-4000-8000-00000000${String(n).padStart(4, "0")}`, clinic_id: "c1", branch_id: null,
  courier_id: "k1", customer_name: null, customer_phone: null, zone: null, address: null, note: null,
  delivery_fee: 0, fee_to_clinic: false, cod_amount: 10000, prepaid: 0, status: "delivered",
  created_at: iso("2026-09-0" + ((n % 8) + 1)), dispatched_at: null, delivered_at: iso("2026-09-0" + ((n % 8) + 1), "14:00"), returned_at: null, collected_at: null, courier_ref: null, ...over,
});
const seedDB = () => ({
  products: [{ id: "p1", name: "علف قطط", barcode: BARCODE, sell_price: 15000, purchase_price: 10000, stock: 20, category: "food", created_at: iso("2026-08-01") }],
  companies: [], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [], companyEntries: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [], courierSettlements: [],
  couriers: [
    { id: "k1", name: "شركة البرق", phone: "07700000001", kind: "company", active: true, created_at: iso("2026-08-01") },
    { id: "k2", name: "أبو حسين", phone: "07700000002", kind: "driver", active: true, created_at: iso("2026-08-01") },
  ],
  deliveryOrders: [
    old(1, { customer_name: "فاطمة حسن", customer_phone: "+964 771 999 8888", courier_ref: "BX-5001" }),
    old(2, { customer_name: "مصطفى", customer_phone: "٠٧٨٠٥٥٥١٢٣٤", address: "شارع فلسطين" }),
    old(3, { customer_name: "أبو زهراء", courier_id: "k2", status: "out", delivered_at: null }),
    ...Array.from({ length: 30 }, (_, i) => old(10 + i, { customer_name: `زبون ${i + 1}`, customer_phone: `0790000${String(1000 + i)}` })),
  ],
  pets: [], weightLogs: [], vaccinations: [], media: [], visits: [], clinicVisits: [], appointments: [], treatments: [], admissions: [], reminders: [],
});
const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); } },
  [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
const db = async () => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY));
const flat = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const shot = async (name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true }); };
/* الماسح يكتب بسرعة ويختم بـEnter — نفسُ ما يفعله جهازُ الكاشير. */
const scan = async (code) => { await page.keyboard.type(code, { delay: 4 }); await page.keyboard.press("Enter"); };

console.log("▸ ١) بيعةٌ بتوصيلٍ ورقمِ طلب");
await page.goto(`${BASE}/retail`, { waitUntil: "domcontentloaded" });
await page.getByRole("button", { name: /🛵 توصيل/ }).waitFor({ timeout: 90000 });
await page.getByRole("button", { name: /علف قطط/ }).first().click();
await page.getByRole("button", { name: /🛵 توصيل/ }).click();
await page.locator('input[placeholder="الاسم"]').fill("أحمد علي");
await page.locator('input[placeholder="الهاتف"]').fill("0770 123 4567");
const sel = page.locator("select").filter({ has: page.locator('option[value="k1"]') }).first();
await sel.selectOption("k1");
check("حقلُ رقم الطلب بلوحة التوصيل", await page.locator('[data-scan-into="dref"]').count() === 1);
await page.locator('[data-scan-into="dref"]').click();
// مسحُ باركود منتجٍ **موجود** بالحقل — أخطرُ حالة: لولا التوجيه لأُضيف للسلّة.
await scan(BARCODE);
await page.waitForTimeout(400);
check("المسحةُ دخلت الحقلَ وحدَه", await page.locator('[data-scan-into="dref"]').inputValue() === BARCODE, await page.locator('[data-scan-into="dref"]').inputValue());
const cartQty = await page.evaluate(() => document.body.innerText.includes("× 2") || document.body.innerText.includes("2 ×"));
check("  ولم تُضف المنتجَ للسلّة مرّةً ثانية", !cartQty && !/مو موجود بمخزنك/.test(await flat()));
await page.locator('[data-scan-into="dref"]').fill(" jx-٧٧٨٨ ");
await shot("ds-1-sale");
await page.getByRole("button", { name: /إرسال للتوصيل/ }).click();
await page.waitForTimeout(1200);
let d = await db();
const made = (d.deliveryOrders ?? []).find((o) => o.customer_name === "أحمد علي");
check("طلبُ التوصيل انحفظ برقمه مطبَّعاً (شرقيّ ← لاتينيّ، بلا مسافات)", made?.courier_ref === "jx-7788", JSON.stringify(made?.courier_ref));
check("  وبهاتفه كما كُتب وحامله", made?.customer_phone === "0770 123 4567" && made?.courier_id === "k1");

console.log("▸ ٢) البحث بالتوصيل");
await page.getByRole("button", { name: /^التوصيل$/ }).first().click();
await page.locator("[data-dsearchinput]").waitFor({ timeout: 20000 });
const kpiBefore = (await page.locator(".card").first().innerText()).replace(/\s+/g, " ");
const search = async (q) => { await page.locator("[data-dsearchinput]").fill(q); await page.waitForTimeout(350); };
const count = async () => Number(await page.locator("[data-dcount]").getAttribute("data-dcount"));
const firstName = async () => (await page.locator("[data-dresults] [data-dorder]").first().innerText()).replace(/\s+/g, " ");
await search("JX7788");
check("برقم الطلب بحروفٍ كبيرة وبلا فاصلة يلقى الطلبَ وحدَه", await count() === 1 && /أحمد علي/.test(await firstName()), String(await count()));
check("  ويقول بماذا طابق", await page.locator('[data-dhit="ref"]').count() === 1);
await search("+964 770 123 4567");
check("بالهاتف بصيغة +964 (والمحفوظُ 0770 بمسافات)", await count() === 1 && /أحمد علي/.test(await firstName()));
await search("07805551234");
check("بالهاتف اللاتينيّ والمحفوظُ بأرقامٍ شرقية", await count() === 1 && /مصطفى/.test(await firstName()));
await search(`inv-${(made.invoice_id.replace(/[^a-zA-Z0-9]/g, "").slice(-6)).toLowerCase()}`);
check("برقم الفاتورة بحروفٍ صغيرة", await count() === 1 && /أحمد علي/.test(await firstName()));
await search("فاطمه");
check("بالاسم بلا تاء مربوطة", await count() === 1 && /فاطمة حسن/.test(await firstName()));
await search("زبون");
check("لا سقفٌ صامت: ٣٠ مطابقة تُعدّ كلُّها، وتُعرض صفحةً صفحة", await count() === 30 && await page.locator("[data-dresults] [data-dorder]").count() === 30);
await shot("ds-1b-results");
const kpiDuring = (await page.locator(".card").first().innerText()).replace(/\s+/g, " ");
check("الأرقامُ فوق لا تتغيّر بالبحث (اللوحةُ من القائمة كاملة)", kpiDuring === kpiBefore, `${kpiBefore} ≠ ${kpiDuring}`);
await search("ماكو هيچ زبون");
check("ما لا يطابق يقولها صراحةً", await page.locator("[data-dnoresults]").count() === 1);
await search("");
check("مسحُ السؤال يرجّع اللوحة", await page.locator("[data-dresults]").count() === 0);

console.log("▸ ٣) رقمُ الطلب بعد البيع");
await search("مصطفى");
await page.locator("[data-dresults] [data-drefadd]").first().click();
await page.locator("[data-drefinput]").fill("bx 5001");
check("رقمٌ مكرّرٌ لنفس الشركة يُنبَّه عليه بالاسم", await page.locator("[data-dreftwin]").count() === 1 && /فاطمة حسن/.test(await page.locator("[data-dreftwin]").innerText()));
await shot("ds-2-ref");
await page.locator("[data-drefinput]").fill("AW-٥٥");
await page.locator("[data-drefinput]").press("Enter");
await page.locator("[data-drefdialog]").waitFor({ state: "detached", timeout: 10000 });
await page.waitForTimeout(400);
d = await db();
check("Enter يحفظ، والرقمُ مطبَّع بالمخزن", d.deliveryOrders.find((o) => o.id === "old2")?.courier_ref === "AW-55");
await search("aw55");
check("  وصار يُلقى برقمه فوراً", await count() === 1 && /مصطفى/.test(await firstName()));

console.log("▸ ٤) البحث داخل شركة التوصيل");
await search("");
await page.locator("[data-dsec-companies]").click();
await page.locator('[data-searchinside="k1"]').click();
await page.waitForTimeout(400);
check("«بحث بطلباتها» يفتح طلبات الشركة وحدها", await page.locator("[data-dresults]").count() === 1 && await count() === 33 && /داخل شركة البرق/.test(await flat()), String(await count()));
await search("أبو زهراء");
check("  وطلبُ السائق لا يدخل نتائجها", await count() === 0);
await page.locator("[data-dstatus=\"all\"]").click();
await page.locator("[data-dsearchcourier]").selectOption("all");
await search("أبو زهراء");
check("  وبكلّ الحاملين يُلقى", await count() === 1);
await page.locator("[data-dsearchclear]").click();
await page.waitForTimeout(300);
await page.locator('[data-ledgerbtn]').first().click();
await page.locator("[data-ledgersearchinput]").waitFor({ timeout: 10000 });
await page.locator("[data-ledgersearchinput]").fill("bx-5001");
await page.waitForTimeout(400);
check("سجلُّ الشركة يبحث بطلباتها: الرقمُ يجيب طلبَه وحده", Number(await page.locator("[data-ledgercount]").getAttribute("data-ledgercount")) === 1 && await page.locator("[data-ledgerorder]").count() === 1);
await shot("ds-3-ledger");

check("ولا خطأ بالصفحة", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(fails === 0 ? `✓ live-delivery-search: ${passes} فحصاً عبرت` : `✗ ${fails} فشلت من ${passes + fails}`);
if (fails) process.exit(1);
