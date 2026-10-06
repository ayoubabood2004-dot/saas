/* ============================================================================
 * فحصٌ حيٌّ لمعلومات الحالة عند الدخول — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     node scripts/live/intake.mjs
 *
 * يقود ما يفعله الاستقبالُ ثم الطبيب: يفتح حالةً جديدة بتاريخها المرضي ومدّتها وتشخيصها
 * وعلاماتها، ثم يجدها بملفّ الحيوان، ثم يفتح أوّلَ زيارة فيجدها فيها مربوطةً ومعالجُ
 * التشخيص معبّأً بها — ويقرأ المخزنَ بعد كلّ خطوة.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-intake: ما لكيت playwright"); process.exit(1); }
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
const seedDB = () => ({
  products: [], companies: [], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
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
const flat = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const notes = async () => JSON.parse(await page.evaluate(() => {
  const k = Object.keys(localStorage).find((x) => /note/i.test(x) && x !== "vp_session");
  return k ? localStorage.getItem(k) : "[]";
}) || "[]");

console.log("▸ ١) فتحُ حالة جديدة بمعلومات الحالة");
await page.goto(`${BASE}/new-case`, { waitUntil: "domcontentloaded" });
await page.locator("[data-pet-name]").first().waitFor({ timeout: 30000 });
await page.locator("[data-pet-name]").first().fill("ريكس");
check("بطاقةُ «معلومات الحالة» بتبويباتها الثلاثة", await page.locator("[data-intake]").count() === 1 && await page.locator("[data-intake-tab]").count() === 3);
await page.locator("[data-intake-history]").fill("يستفرغ وما ياكل");
await page.locator('[data-intake-since="3"]').click();
check("  و«صارلها ٣ أيام» يقول يومَ البداية", await page.locator("[data-intake-onset]").count() === 1, (await flat()).slice(0, 200));
await page.locator('[data-intake-tab="dx"]').click();
await page.locator('[data-intake-panel="dx"] button', { hasText: /Sick|مريض/ }).first().click();
await page.waitForTimeout(300);
const dxInput = page.locator('[data-intake-panel="dx"] input').first();
await dxInput.fill("التهاب معدة وأمعاء");
await dxInput.press("Enter");
await page.waitForTimeout(300);
await page.locator('[data-intake-tab="signs"]').click();
await page.waitForTimeout(300);
// أوّلُ جهازٍ ثم أوّلُ علامةٍ فيه — بلا افتراضٍ عن نصّ الكتالوج.
const cats = page.locator('[data-intake-panel="signs"] button');
await cats.nth(1).click(); await page.waitForTimeout(300);
const before = await page.locator('[data-intake-tab="signs"] .bg-success-500').count();
for (let i = 2; i < 12 && (await page.locator('[data-intake-tab="signs"] .bg-success-500').count()) === before; i++) { await cats.nth(i).click().catch(() => {}); await page.waitForTimeout(150); }
check("  وعلامةٌ مختارة تُعلِّم تبويبَها", await page.locator('[data-intake-tab="signs"] .bg-success-500').count() === 1);
check("  والتبويباتُ الثلاثة ممتلئة", /3\/3|٣\/٣/.test(await page.locator("[data-intake]").innerText()), await page.locator("[data-intake]").innerText().then((x) => x.slice(0, 120)));
await page.locator("button", { hasText: /^التالي/ }).last().click();
await page.waitForTimeout(800);
await page.locator("button", { hasText: "إتمام التسجيل" }).click();
await page.waitForTimeout(2500);
const ns = await notes();
const intakeNote = ns.find((n) => n.note_text?.includes("CLINRX1") && n.note_text.includes('"kind":"intake"'));
check("انحفظت ملاحظةُ الدخول المنظّمة بملفّ الحيوان (بلا زيارة)", !!intakeNote && !intakeNote.visit_id, JSON.stringify(ns.map((n) => n.note_text.slice(0, 60))));
const rec = intakeNote ? JSON.parse(intakeNote.note_text.slice(intakeNote.note_text.indexOf("{"), intakeNote.note_text.indexOf("\n"))) : {};
check("  بتاريخها ومدّتها ويوم بدايتها وتشخيصها وعلامتها", rec.intake?.history === "يستفرغ وما ياكل" && rec.intake?.sinceDays === 3 && !!rec.intake?.onset
  && rec.diagnoses?.[0]?.disease === "التهاب معدة وأمعاء" && rec.symptoms?.length >= 1, JSON.stringify(rec));
const nSigns = rec.symptoms?.length ?? 0;
const petId = intakeNote?.pet_id;

console.log("\n▸ ٢) بملفّ الحيوان");
await page.goto(`${BASE}/pet/${petId}?tab=notes`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3500);
check("بطاقةُ «معلومات الحالة عند الدخول» لا نصٌّ خامّ", await page.locator('[data-record-kind="intake"]').count() >= 1 && !/CLINRX1/.test(await flat()));

console.log("\n▸ ٣) أوّلُ زيارة تنفتح له");
await page.goto(`${BASE}/pet/${petId}?tab=visits`, { waitUntil: "domcontentloaded" });
await page.waitForTimeout(3000);
await page.locator("button", { hasText: "زيارة جديدة" }).first().click();
await page.waitForTimeout(500);
await page.locator("button", { hasText: "التالي" }).last().click();
await page.waitForTimeout(400);
await page.locator("button", { hasText: "فتح الزيارة" }).click();
await page.locator("[data-printsheet]").waitFor({ timeout: 30000 }).catch(() => {});
await page.waitForTimeout(1500);
check("صفحةُ الزيارة تعرض معلوماتِ الدخول", await page.locator("[data-visit-intake] [data-record-kind=\"intake\"]").count() === 1);
const linked = (await notes()).find((n) => n.id === intakeNote?.id);
check("  ومربوطةٌ بهاي الزيارة بالمخزن", !!linked?.visit_id, JSON.stringify(linked?.visit_id));
check("  وزرُّ التشخيص بعده «التشخيص وخطة العلاج» لا «تعديل»", /التشخيص وخطة العلاج/.test(await flat()) && !/تعديل التشخيص وخطة العلاج/.test(await flat()));
await page.locator("button", { hasText: "التشخيص وخطة العلاج" }).first().click();
await page.waitForTimeout(1200);
const dlg = page.locator('[role="dialog"]').last();
await dlg.locator("button", { hasText: "الأعراض" }).first().click();
await page.waitForTimeout(600);
const dtext = (await dlg.innerText()).replace(/\s+/g, " ");
check("المعالجُ معبّأ: علاماتُ الدخول مختارةٌ بخطوة الأعراض", dtext.includes(`الأعراض المختارة (${nSigns})`), dtext.slice(0, 300));
await dlg.locator("button", { hasText: "التشخيص" }).last().click();
await page.waitForTimeout(600);
check("  والتشخيصُ الأوّلي بخطوة التشخيص", (await dlg.innerText()).includes("التهاب معدة وأمعاء"));

check("ولا خطأَ تشغيلٍ بالصفحات", errors.length === 0, errors.join(" | "));
await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-intake: ${passes} نجحت، ${fails} فشلت`);
if (fails) process.exit(1);
