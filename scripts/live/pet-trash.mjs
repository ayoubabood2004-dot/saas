/* ============================================================================
 * فحصٌ حيٌّ لحذف الحيوان و«الحيوانات المحذوفة» (0291) — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5199 --strictPort   # بطرفٍ آخر
 *     LIVE_URL=http://localhost:5199 node scripts/live/pet-trash.mjs
 *
 * المديرُ: زرُّ الحذف بالصفّ، والنافذةُ تسمّي ما يُرفع جدولاً جدولاً (لا «متأكّد؟»)، والحذفُ ينقله لـ«الحيوانات
 * المحذوفة» بسببه، و«رجّعه» يعيده بزياراته ولقاحاته. والاستقبالُ: لا زرَّ حذف ولا «محذوفات».
 * لقطاتٌ بـLIVE_SHOTS (مجلّد) إن أُعطي.
 * ==========================================================================*/
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-pet-trash: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync, mkdirSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5199";
const SHOTS = process.env.LIVE_SHOTS ?? null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const DB_KEY = /export const DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ live-pet-trash: ما انقرأ مفتاحُ المخزن"); process.exit(1); }
const OWNER = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };
const RCP = { raw: { id: "demo-rcp", full_name: "استقبال الفحص", email: "rcp@demo.vet", rawRole: "reception", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const seedDB = () => ({
  products: [], companies: [], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [
    { id: "pt1", name: "بوبي", species: "dog", sex: "male", dob: "2025-06-01", owner_name: "أبو علي", owner_phone: "07700000000", clinic_id: "c1", serial: "11111", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "pt2", name: "مشمش", species: "cat", sex: "female", dob: "2024-03-01", owner_name: "أم حسن", owner_phone: "07711111111", clinic_id: "c1", serial: "22222", created_at: "2026-01-02T00:00:00.000Z" },
  ],
  weightLogs: [{ id: "w1", pet_id: "pt1", weight_kg: 12, measured_at: "2026-10-01" }],
  vaccinations: [
    { id: "v1", pet_id: "pt1", name: "Rabies", status: "administered", administered_at: "2026-06-01", due_date: null },
    { id: "v2", pet_id: "pt1", name: "DHPP", status: "scheduled", administered_at: null, due_date: "2026-12-20" },
  ],
  media: [], clinicVisits: [], appointments: [], admissions: [], reminders: [], treatments: [],
  visits: [{ id: "mv1", pet_id: "pt1", clinic_name: "c", doctor_name: "د", visit_date: "2026-10-01", assessment: "التهاب", created_at: "2026-10-01T09:00:00.000Z" }],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const open = async (session, path = "/records") => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 950 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad", deviceScaleFactor: SHOTS ? 2 : 1 });
  await ctx.addInitScript(([k, v, sv]) => {
    if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem("vp_session", sv); sessionStorage.setItem("seeded", "1"); }
  }, [DB_KEY, JSON.stringify(seedDB()), JSON.stringify(session)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
};
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png` }); };
const db = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY));

console.log("▸ ١) المدير: النافذةُ تسمّي ما يُرفع، والحذفُ للمحذوفات، و«رجّعه» يعيده");
{
  const { ctx, page } = await open(OWNER);
  const row = page.locator('button[title="حذف الحيوان"]');
  await row.first().waitFor({ timeout: 30000 });
  check("زرُّ الحذف ظاهرٌ للمدير (لكلّ حيوان)", (await row.count()) === 2, String(await row.count()));
  check("  و«الحيوانات المحذوفة» ظاهرة", await page.locator("[data-pettrash-open]").isVisible());
  await shot(page, "1-records-owner");
  // صفُّ بوبي أوّلُ الصفوف (القائمةُ بالمربّي، وأبو علي أوّلاً).
  await row.first().click();
  const dlg = page.locator("[data-pettrash-dialog]");
  await dlg.locator("[data-pettrash-lines]").waitFor({ timeout: 15000 });
  const txt = (await dlg.innerText()).replace(/\s+/g, " ");
  check("النافذةُ تسمّي الحيوانَ وما يُرفع جدولاً جدولاً بالعدد",
    /اللقاحات 2/.test(txt) && /الزيارات الطبية 1/.test(txt) && /سجلّ الأوزان 1/.test(txt), txt.slice(0, 300));
  check("  وتقول إنّ الفواتير لا تُمسّ وإنه يرجع من «الحيوانات المحذوفة»", /الفواتير والدفعات ما تنمسّ/.test(txt) && /الحيوانات المحذوفة/.test(txt));
  const confirm = page.locator("[data-pettrash-confirm]");
  check("  وزرُّ التأكيد يحمل اسمَه (لا «حذف» عامّ)", /احذف بوبي/.test(await confirm.innerText()), await confirm.innerText());
  await page.getByPlaceholder("مثلاً: انسجّل مرتين").fill("انسجّل مرتين");
  await shot(page, "2-delete-dialog");
  await confirm.click();
  await dlg.waitFor({ state: "detached", timeout: 15000 });
  await page.waitForTimeout(500);
  let d = await db(page);
  check("انحذف: الحيوانُ ولقاحاتُه وزيارتُه ووزنُه خرجت، ومشمش باقٍ",
    !d.pets.some((p) => p.id === "pt1") && !d.vaccinations.some((v) => v.pet_id === "pt1") && !d.visits.some((v) => v.pet_id === "pt1")
    && !d.weightLogs.some((w) => w.pet_id === "pt1") && d.pets.some((p) => p.id === "pt2"));
  check("  ومحفوظٌ بالمحذوفات بسببه", d.petsTrash?.length === 1 && d.petsTrash[0].reason === "انسجّل مرتين");
  await page.locator("[data-pettrash-open]").click();
  const list = page.locator("[data-pettrash-list]");
  await list.locator('[data-pettrash-row="pt1"]').waitFor({ timeout: 15000 });
  const ltxt = (await list.innerText()).replace(/\s+/g, " ");
  check("«الحيوانات المحذوفة»: بوبي بصاحبه وسببه وعدد سجلاته", /بوبي/.test(ltxt) && /أبو علي/.test(ltxt) && /السبب: انسجّل مرتين/.test(ltxt) && /السجلات: 4/.test(ltxt), ltxt.slice(0, 300));
  await shot(page, "3-deleted-pets");
  await list.locator('[data-pettrash-restore="pt1"]').click();
  await list.locator('[data-pettrash-row="pt1"]').waitFor({ state: "detached", timeout: 15000 });
  d = await db(page);
  check("«رجّعه»: الحيوانُ رجع بنفس المعرّفات ورقمه، ولقاحاه وزيارتُه ووزنُه",
    d.pets.find((p) => p.id === "pt1")?.serial === "11111" && d.vaccinations.filter((v) => v.pet_id === "pt1").map((v) => v.id).sort().join() === "v1,v2"
    && d.visits.some((v) => v.id === "mv1") && d.weightLogs.some((w) => w.id === "w1") && (d.petsTrash ?? []).length === 0);
  await page.getByRole("button", { name: "إغلاق" }).last().click().catch(() => {});
  await page.waitForTimeout(400);
  check("  وظهر بالقائمة من جديد", (await page.locator('button[title="حذف الحيوان"]').count()) === 2);
  await shot(page, "4-restored");
  await ctx.close();
}

console.log("▸ ٢) الاستقبال: لا زرَّ حذف ولا «محذوفات»");
{
  const { ctx, page } = await open(RCP);
  await page.locator('button[title="تعديل الحيوان"]').first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(800);
  check("لا زرَّ حذفٍ بأيّ صفّ", (await page.locator('button[title="حذف الحيوان"]').count()) === 0);
  check("  ولا «الحيوانات المحذوفة»", (await page.locator("[data-pettrash-open]").count()) === 0);
  check("  والتعديلُ ما زال ظاهراً (الصفّ لم ينكسر)", (await page.locator('button[title="تعديل الحيوان"]').count()) >= 1);
  await shot(page, "5-records-reception");
  await ctx.close();
}

await browser.close();
check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | "));
console.log(fails ? `✗ live-pet-trash: ${passes} نجح، ${fails} فشل` : `✓ live-pet-trash: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
