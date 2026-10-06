/* ============================================================================
 * فحصٌ حيٌّ للتسجيل بتاريخٍ سابق — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     node scripts/live/backdate.mjs
 *
 * يقود ما يفعله الطبيب: يفتح زيارةً بتاريخٍ سابق، يحسم جرعاتها الفائتة (انطت بيومها
 * / ما انطت)، يغلقها بيومها، ويسجّل لقاحاً سابقاً بتاريخين ثم موعده القادم — ويقرأ
 * المخزنَ بعد كلّ خطوة: الشاشةُ قد تقول «انحفظ» والصفُّ بيومٍ غلط.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad"; // توقّعاتُ الفحص بتوقيت المتصفّح نفسه
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* نجرّب التالي */ }
}
if (!chromium) { console.error("✗ live-backdate: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const pad = (n) => String(n).padStart(2, "0");
const dayAgo = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const TODAY = dayAgo(0);
const D10 = dayAgo(10), D9 = dayAgo(9), D8 = dayAgo(8);

const seedDB = () => ({
  products: [], companies: [], companySections: [],
  purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [{ id: "pt1", name: "بوبي", species: "dog", sex: "male", dob: "2024-01-01", owner_name: "أبو علي", owner_phone: "07700000000", clinic_id: "c1", created_at: "2026-01-01T00:00:00.000Z" }],
  weightLogs: [], vaccinations: [], media: [], visits: [],
  // زيارةٌ فُتحت قبل عشرة أيام (١٨:٠٠) وانكتبت اليوم — بخطةٍ يومين × جرعتين + جرعةُ اليوم.
  clinicVisits: [{ id: "cv1", pet_id: "pt1", kind: "illness", status: "open", condition: "under_treatment", opened_at: new Date(`${D10}T18:00:00`).toISOString(), opened_by: "د. الفحص", created_at: new Date().toISOString() }],
  appointments: [], admissions: [], reminders: [],
  treatments: [
    { id: "t1", pet_id: "pt1", visit_id: "cv1", day: D10, time: "10:00", medication: "Ceftriaxone", amount: "1ml", observations: "مرتين", task_type: "drug", administered_at: null, created_at: new Date().toISOString() },
    { id: "t2", pet_id: "pt1", visit_id: "cv1", day: D10, time: "20:00", medication: "Ceftriaxone", amount: "1ml", observations: "مرتين", task_type: "drug", administered_at: null, created_at: new Date().toISOString() },
    { id: "t3", pet_id: "pt1", visit_id: "cv1", day: D9, time: "10:00", medication: "Ceftriaxone", amount: "1ml", observations: "مرتين", task_type: "drug", administered_at: null, created_at: new Date().toISOString() },
    { id: "t4", pet_id: "pt1", visit_id: "cv1", day: D9, time: "20:00", medication: "Ceftriaxone", amount: "1ml", observations: "مرتين", task_type: "drug", administered_at: null, created_at: new Date().toISOString() },
    { id: "t5", pet_id: "pt1", visit_id: "cv1", day: D8, time: "", medication: "Metronidazole", amount: "5ml", observations: "", task_type: "drug", administered_at: null, created_at: new Date().toISOString() },
  ],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const open = async (path, db = seedDB()) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
  await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); } },
    [DB_KEY, JSON.stringify(db), "vp_session", JSON.stringify(SESSION)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3000);
  return { ctx, page };
};
const db = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY));
const flat = async (page) => (await page.locator("body").innerText()).replace(/\s+/g, " ");

console.log("▸ ١) زيارةٌ بتاريخٍ سابق: الجرعاتُ الفائتة تُحسم بيومها");
{
  const { ctx, page } = await open("/pet/pt1/visit/cv1");
  // أوّلُ تحميلٍ بعد إقلاع خادم التطوير يحوّل الوحداتِ ببطء — ننتظر الصفحةَ لا ثوانيَ ثابتة.
  await page.locator("[data-printsheet]").waitFor({ timeout: 30000 }).catch(() => {});
  check("شريطُ «زيارة بتاريخ سابق» ظاهر", await page.locator("[data-visit-backdated]").count() === 1, (await flat(page)).slice(0, 300));
  check("  و«حدّد الي انطت بأيامها» ظاهر، و«تسجيل إعطائها الآن» مخفيّ لزيارةٍ سابقة",
    await page.locator("[data-pickpast]").count() === 1 && !/تسجيل إعطائها الآن/.test(await flat(page)));
  await page.locator("[data-pickpast]").click();
  await page.waitForTimeout(600);
  check("النافذةُ تعرض الخمس جرعات الفائتة", await page.locator("[data-past-row]").count() === 5, String(await page.locator("[data-past-row]").count()));
  check("  وزرُّ الحفظ يقول ماذا سيكتب قبل أيّ تعليم (٠ انطت · ٥ ما انطت)", /0 انطت · 5 ما انطت|٠ انطت · ٥ ما انطت/.test(await page.locator("[data-past-save]").innerText()), await page.locator("[data-past-save]").innerText());
  await page.locator('[data-past-row="t1"] input').check();
  await page.locator('[data-past-row="t3"] input').check();
  await page.locator('[data-past-row="t5"] input').check();
  await page.locator("[data-past-save]").click();
  await page.waitForTimeout(1500);
  const tx = Object.fromEntries((await db(page)).treatments.map((t) => [t.id, t]));
  check("المعلَّمةُ «انطت» بيومها ووقتها المجدول — لا لحظة الإدخال",
    tx.t1.administered_at === new Date(`${D10}T10:00:00`).toISOString() && tx.t3.administered_at === new Date(`${D9}T10:00:00`).toISOString(),
    `${tx.t1.administered_at} / ${tx.t3.administered_at}`);
  check("  والتي بلا وقت ⇒ ظهرُ يومها", tx.t5.administered_at === new Date(`${D8}T12:00:00`).toISOString(), tx.t5.administered_at);
  check("  والباقيةُ «ما انطت» موثّقة لا معطاة", !tx.t2.administered_at && tx.t2.missed_reason === "past:not_given" && !tx.t4.administered_at && tx.t4.missed_reason === "past:not_given");
  check("  ولا متأخرةَ بعدها — اللوحةُ ما عادت تحمرّ", await page.locator("[data-pickpast]").count() === 0, (await flat(page)).slice(0, 400));
  check("  والطبلةُ تقول «فاتت» بسببها", await page.locator("[data-dose-missed]").count() === 2);
  check("  واللوحةُ تقول خلصت بعددين لا «كل الجرعات أُعطيت»", await page.locator("[data-plan-closed-missed]").count() === 1 && !/كل الجرعات أُعطيت/.test(await flat(page)));

  // الإغلاقُ بيومه
  await page.locator('button:has-text("إنهاء العلاج وإغلاق الزيارة")').click();
  await page.waitForTimeout(600);
  check("نافذةُ الإغلاق تسأل «متى خلص العلاج؟» لزيارةٍ سابقة", await page.locator("[data-end-dated]").count() === 1);
  check("  والافتراضيُّ آخرُ جرعة (يومها)", await page.locator("[data-end-day]").inputValue() === D8, await page.locator("[data-end-day]").inputValue());
  await page.locator("[data-end-day]").fill(dayAgo(11));
  await page.waitForTimeout(300);
  check("  ويومٌ قبل الفتح يُرفض والزرُّ مطفأ", await page.locator('button:has-text("تأكيد إنهاء العلاج")').isDisabled());
  await page.locator("[data-end-day]").fill(D8);
  await page.locator("[data-end-time]").fill("21:30");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("تأكيد إنهاء العلاج")').click();
  await page.waitForTimeout(1200);
  const cv = (await db(page)).clinicVisits.find((v) => v.id === "cv1");
  check("الزيارةُ انغلقت بيومها وساعتها المختارة", cv.status === "ended" && cv.ended_at === new Date(`${D8}T21:30:00`).toISOString(), `${cv.status} ${cv.ended_at}`);
  await ctx.close();
}

console.log("\n▸ ٢) فتحُ زيارةٍ بتاريخٍ سابق من ملفّ الحيوان");
{
  const dbx = seedDB(); dbx.clinicVisits = []; dbx.treatments = [];
  const { ctx, page } = await open("/pet/pt1?tab=visits", dbx);
  await page.locator('button:has-text("زيارة جديدة")').first().click();
  await page.waitForTimeout(500);
  await page.locator('button:has-text("التالي")').click();
  await page.waitForTimeout(400);
  await page.locator('[data-visit-past="1"]').click();
  await page.waitForTimeout(300);
  check("زرُّ الفتح مطفأ قبل اختيار اليوم", await page.locator('button:has-text("فتح الزيارة")').isDisabled());
  await page.locator("[data-visit-day]").fill("2023-06-01");
  await page.waitForTimeout(300);
  check("  ويومٌ قبل ميلاد الحيوان يُقال ويُرفض", await page.locator("[data-visit-bad]").count() === 1 && await page.locator('button:has-text("فتح الزيارة")').isDisabled());
  await page.locator("[data-visit-day]").fill(dayAgo(3));
  await page.locator("[data-visit-time]").fill("09:15");
  await page.waitForTimeout(300);
  await page.locator('button:has-text("فتح الزيارة")').click();
  await page.waitForTimeout(2000);
  const v = (await db(page)).clinicVisits[0];
  check("الزيارةُ انفتحت بلحظتها السابقة (٠٩:١٥ قبل ٣ أيام)", v && v.opened_at === new Date(`${dayAgo(3)}T09:15:00`).toISOString(), v?.opened_at);
  check("  وصفحةُ الزيارة تقول إنها بتاريخٍ سابق", await page.locator("[data-visit-backdated]").count() === 1);
  await ctx.close();
}

console.log("\n▸ ٣) لقاحٌ سابق بتاريخين ثم موعده القادم");
{
  const { ctx, page } = await open("/pet/pt1?tab=vaccines");
  const addBtn = page.locator('button:has-text("إضافة تطعيم"), button:has-text("إضافة لقاح"), button:has-text("Add vaccine")').first();
  if (!(await addBtn.count())) console.log("   ℹ أزرار الصفحة:", (await page.locator("main button").allInnerTexts()).join(" | ").slice(0, 600));
  await addBtn.click();
  await page.waitForTimeout(800);
  // اختيارُ لقاحٍ من القائمة: الزرُّ بنصّه الافتراضيّ، ثم أوّلُ خيارٍ بالقائمة المنسدلة.
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.locator("button", { hasText: /اختر لقاح|Select a vaccine|Choose/ }).first().click();
  await page.waitForTimeout(400);
  await dlg.locator(".max-h-60 button").first().click();
  await page.waitForTimeout(500);
  const hasToggle = await page.locator("[data-vxpast-toggle]").count();
  check("مفتاحُ «انلقح قبل؟» ظاهرٌ بملفّ الحيوان", hasToggle === 1, (await flat(page)).slice(0, 500));
  if (hasToggle) {
    await page.locator("[data-vxpast-toggle]").click();
    await page.waitForTimeout(300);
    await page.locator('[data-vxpast-date="0"]').fill("2026-03-01");
    await page.locator("[data-vxpast-add]").click();
    await page.waitForTimeout(200);
    await page.locator('[data-vxpast-date="1"]').fill("2026-03-22");
    await page.waitForTimeout(300);
    check("  والمواعيدُ تنحسب من آخر جرعة", /آخر جرعة/.test(await flat(page)));
    await page.locator('[role="dialog"] button:has-text("سنة")').first().click();
    await page.waitForTimeout(300);
    await page.locator('[role="dialog"] button:has-text("إضافة اللقاح")').first().click();
    await page.waitForTimeout(400);
    check("  والمسودّةُ تقول «سجل سابق» بعددها", /سجل سابق/.test(await flat(page)) && /جرعة سابقة/.test(await flat(page)));
    await page.locator('[role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("حفظ")').last().click();
    await page.waitForTimeout(1500);
    const vx = (await db(page)).vaccinations.filter((r) => r.pet_id === "pt1");
    const given = vx.filter((r) => r.status === "administered").map((r) => r.administered_at).sort();
    const next = vx.find((r) => r.status !== "administered");
    check("انكتبت جرعتان بأيّامهما وموعدٌ قادم بعد سنة من آخرهما",
      given.join(",") === "2026-03-01,2026-03-22" && next?.due_date === "2027-03-22", JSON.stringify(vx));
    check("  بلا طبيبٍ معطٍ ولا «من كم»", vx.filter((r) => r.status === "administered").every((r) => !r.administered_by && r.doses_total === null));
    check("  وتبويبُ اللقاحات يقول «سجل سابق»", await page.locator("[data-vx-later]").count() >= 2, String(await page.locator("[data-vx-later]").count()));
  }
  await ctx.close();
}

check("ولا خطأَ تشغيلٍ بالصفحات", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-backdate: ${passes} نجحت، ${fails} فشلت`);
if (fails) process.exit(1);
