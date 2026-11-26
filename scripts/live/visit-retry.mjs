/* ============================================================================
 * فحصٌ حيٌّ — «قائمةٌ ناقصة أخطرُ من خطأ ظاهر» بالزيارة وملفّ الحيوان (متصفّحٌ حقيقيّ على التجريبيّ).
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     node scripts/live/visit-retry.mjs
 *
 * يرقّع وحدةَ الريبو التجريبيّ التي حمّلها التطبيقُ فعلاً (عنوانُها من performance — لا نسخةٌ ثانية) فتفشل
 * القراءةُ أو الكتابة، ثمّ يقيس ما يراه الطبيب: «ما انحفظت» داخل نافذة الملاحظة والنصُّ باقٍ، ضغطتان = ملاحظةٌ
 * واحدة، شريطُ «ما انحملت آخر نسخة» فوق آخر نسخةٍ كاملة، بطاقةُ «أعد المحاولة» بدل زيارةٍ ناقصة أو «لم يتم
 * العثور»، وسؤالُ إغلاق المعالج بنافذةٍ داخل السستم لا window.confirm.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-visit-retry: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync, mkdirSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
const SHOTS = process.env.SHOTS_DIR ? `${process.env.SHOTS_DIR.replace(/\/$/, "")}/` : null;
if (SHOTS) mkdirSync(SHOTS, { recursive: true });
const DB_KEY = /DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };
const pad = (n) => String(n).padStart(2, "0");
const d = new Date(); const TODAY = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const pet = (id, name) => ({ id, name, species: "dog", sex: "male", dob: "2024-01-01", owner_name: "أبو علي", owner_phone: "07700000000", clinic_id: "c1", created_at: "2026-01-01T00:00:00.000Z" });
const seedDB = () => ({
  products: [], companies: [], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [pet("pt1", "بوبي"), pet("pt2", "ميشو")], weightLogs: [], vaccinations: [], media: [], visits: [], appointments: [], admissions: [], reminders: [],
  clinicVisits: [{ id: "cv1", pet_id: "pt1", kind: "illness", status: "open", condition: "under_treatment", opened_at: new Date().toISOString(), opened_by: "د. الفحص", created_at: new Date().toISOString() }],
  treatments: [{ id: "t1", pet_id: "pt1", visit_id: "cv1", day: TODAY, time: "10:00", medication: "Ceftriaxone", amount: "1ml", observations: "", task_type: "drug", administered_at: null, created_at: new Date().toISOString() }],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); localStorage.removeItem("vp_demo_pet_notes"); sessionStorage.setItem("seeded", "1"); } },
  [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
const page = await ctx.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const shot = (n) => (SHOTS ? page.screenshot({ path: `${SHOTS}${n}.png` }) : Promise.resolve());
/** Patch the demo repo the app loaded: mode = "fail" | "slow" | "ok". */
const patch = (method, mode, ms = 1500) => page.evaluate(async ([method, mode, ms]) => {
  const url = performance.getEntriesByType("resource").map((e) => e.name).find((n) => n.includes("/src/lib/repoDemo.ts"));
  const m = await import(url);
  const r = m.demoRepo;
  r.__orig ??= {};
  r.__orig[method] ??= r[method];
  const orig = r.__orig[method];
  if (mode === "ok") r[method] = orig;
  else if (mode === "fail") r[method] = async () => { throw Object.assign(new Error("simulated network failure"), { code: "XX000" }); };
  else if (mode === "slow") r[method] = async (...a) => { await new Promise((res) => setTimeout(res, ms)); return orig.apply(r, a); };
  return !!url;
}, [method, mode, ms]);
const go = (path) => page.evaluate((p) => { history.pushState({}, "", p); dispatchEvent(new PopStateEvent("popstate")); }, path);
const notesStored = () => page.evaluate(() => JSON.parse(localStorage.getItem("vp_demo_pet_notes") || "[]"));

console.log("▸ ١) الزيارة تُفتح عادياً");
await page.goto(`${BASE}/pet/pt1/visit/cv1`, { waitUntil: "domcontentloaded" });
await page.getByText("Ceftriaxone").first().waitFor({ timeout: 45000 });
check("الزيارة رُسمت بلا شريط خطأ", await page.locator("[data-visit-stale], [data-visit-loadfail]").count() === 0);

console.log("▸ ٢) ملاحظة: الفشلُ يُقال داخل النافذة والنصُّ باقٍ");
check("ترقيعُ الريبو وصل الوحدةَ الحقيقية", await patch("addPetNote", "fail"));
await page.getByRole("button", { name: /^ملاحظة$/ }).first().click();
const ta = page.locator("textarea[placeholder='اكتب ملاحظة…']");
await ta.waitFor();
await ta.fill("حرارته نزلت");
await page.locator("[data-note-add]").click();
await page.locator("[data-note-err]").waitFor({ timeout: 5000 }).catch(() => {});
check("رسالةُ الفشل ظاهرة بالنافذة", await page.locator("[data-note-err]").isVisible(), await page.locator("[data-note-err]").innerText().catch(() => "—"));
check("  والنافذةُ مفتوحة والنصُّ باقٍ", await ta.isVisible() && (await ta.inputValue()) === "حرارته نزلت");
check("  ولا ملاحظةَ انكتبت", (await notesStored()).length === 0);
await shot("1-note-error");

console.log("▸ ٣) ضغطتان على «إضافة» = ملاحظةٌ واحدة، والتحديثُ الفاشل بعدها يقوله شريط");
await patch("addPetNote", "slow", 1200);
await patch("listPetNotes", "fail");
await page.locator("[data-note-add]").dblclick();
await page.locator("[data-note-add]").click({ force: true, timeout: 500 }).catch(() => {});
check("  الزرُّ مشغول أثناء الحفظ", await page.locator("[data-note-add]").isDisabled());
await page.waitForTimeout(2200);
check("ملاحظةٌ واحدة انكتبت", (await notesStored()).length === 1, `${(await notesStored()).length}`);
check("  والنافذةُ انغلقت بعد النجاح", await ta.count() === 0);
await page.locator("[data-visit-stale]").waitFor({ timeout: 5000 }).catch(() => {});
check("  وتحديثٌ فشل بعدها ⇒ شريط «ما انحملت آخر نسخة» فوق آخر نسخةٍ كاملة", await page.locator("[data-visit-stale]").isVisible());
check("  والطبلةُ لم تُمسح", await page.getByText("Ceftriaxone").first().isVisible());
await shot("2-visit-stale-banner");
await patch("listPetNotes", "ok");
await page.locator("[data-visit-stale] [data-visit-retry]").click();
await page.locator("[data-visit-stale]").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
check("«أعد المحاولة» بعد رجوع الشبكة يشيل الشريط ويرسم الملاحظة", await page.locator("[data-visit-stale]").count() === 0 && await page.getByText("حرارته نزلت").first().isVisible());

console.log("▸ ٤) معالج الخطة: الإغلاقُ بعمل غير محفوظ يسأل بنافذة داخل السستم");
let confirmCalled = false;
page.on("dialog", async (dg) => { confirmCalled = true; await dg.dismiss(); });
await page.getByRole("button", { name: /خطة|التشخيص/ }).first().click();
await page.locator("[role=dialog]").first().waitFor();
// اجعل المعالج «متّسخاً»: امشِ للخطوات حتى تظهر خانةُ الملاحظات واكتب فيها.
for (let i = 0; i < 6 && await page.locator("textarea[placeholder^='ملاحظاتك']").count() === 0; i++) {
  await page.locator("[role=dialog] button", { hasText: /^التالي/ }).last().click().catch(() => {});
  await page.waitForTimeout(300);
}
const planNotes = page.locator("textarea[placeholder^='ملاحظاتك']");
check("  (وصلنا خانةَ ملاحظات المعالج)", await planNotes.count() > 0);
await planNotes.first().fill("فحص سريري طبيعي");
await page.keyboard.press("Escape");
await page.locator("[data-plan-leave]").waitFor({ timeout: 3000 }).catch(() => {});
check("Esc ⇒ «تسكّر وتخسر الخطة؟» بنافذة داخل السستم", await page.locator("[data-plan-leave]").isVisible());
await page.waitForTimeout(700); await shot("3-plan-leave");
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("  Esc ثانيةً يغلق السؤالَ وحده — المعالجُ ونصُّه باقيان", await page.locator("[data-plan-leave]").count() === 0 && (await planNotes.first().inputValue()) === "فحص سريري طبيعي");
await page.locator("[role=dialog] button[aria-label]").first().click();   // X المعالج
await page.locator("[data-plan-leave-yes]").waitFor({ timeout: 3000 });
await page.locator("[data-plan-leave-yes]").click();
await page.waitForTimeout(500);
check("  «إي، سكّر» يغلق المعالج", await planNotes.count() === 0);
check("  ولا window.confirm أبداً", !confirmCalled);

console.log("▸ ٥) أوّلُ تحميلٍ للزيارة فشل ⇒ بطاقة «أعد المحاولة» لا زيارةٌ ناقصة ولا «لم يتم العثور»");
await go("/dashboard");
await page.waitForTimeout(800);
await patch("listTreatments", "fail");
await go("/pet/pt1/visit/cv1");
await page.locator("[data-visit-loadfail]").waitFor({ timeout: 15000 }).catch(() => {});
check("بطاقةُ «ما انحملت الزيارة»", await page.locator("[data-visit-loadfail]").isVisible());
check("  ولا «لم يتم العثور على الزيارة»", !(await page.locator("body").innerText()).includes("لم يتم العثور"));
await shot("4-visit-loadfail");
await patch("listTreatments", "ok");
await page.locator("[data-visit-loadfail] [data-visit-retry]").click();
await page.getByText("Ceftriaxone").first().waitFor({ timeout: 8000 }).catch(() => {});
check("  «أعد المحاولة» يرسم الزيارة كاملة", await page.getByText("Ceftriaxone").first().isVisible() && await page.locator("[data-visit-loadfail]").count() === 0);

console.log("▸ ٦) ملف الحيوان");
await patch("listMedia", "fail");
await go("/pet/pt2");
await page.locator("[data-pet-loadfail]").waitFor({ timeout: 15000 }).catch(() => {});
check("حيوانٌ بلا خبيئة وتحميلُه فشل ⇒ بطاقة «أعد المحاولة» لا «جارٍ التحميل» للأبد", await page.locator("[data-pet-loadfail]").isVisible());
await shot("5-pet-loadfail");
await patch("listMedia", "ok");
await page.locator("[data-pet-loadfail] [data-pet-retry]").click();
await page.getByText("ميشو").first().waitFor({ timeout: 8000 }).catch(() => {});
check("  «أعد المحاولة» يرسم الملف", await page.locator("[data-pet-loadfail]").count() === 0 && await page.getByText("ميشو").first().isVisible());
// pt1 انفتح قبل؟ لا — افتحه مرّةً لتُكتب خبيئتُه، ثمّ أعد فتحه والتحميلُ يفشل.
await go("/pet/pt1");
await page.getByText("بوبي").first().waitFor({ timeout: 8000 });
await page.waitForTimeout(800);
await go("/dashboard");
await page.waitForTimeout(500);
await patch("listPetNotes", "fail");
await go("/pet/pt1");
await page.locator("[data-pet-stale]").waitFor({ timeout: 15000 }).catch(() => {});
check("حيوانٌ بخبيئة وتحميلُه فشل ⇒ الملفُّ من الخبيئة + شريط «ما انحملت آخر نسخة»", await page.locator("[data-pet-stale]").isVisible() && await page.getByText("بوبي").first().isVisible());
await shot("6-pet-stale");
await patch("listPetNotes", "ok");
await page.locator("[data-pet-stale] [data-pet-retry]").click();
await page.locator("[data-pet-stale]").waitFor({ state: "detached", timeout: 5000 }).catch(() => {});
check("  «أعد المحاولة» يشيل الشريط", await page.locator("[data-pet-stale]").count() === 0);

const real = errors.filter((e) => !/ResizeObserver/.test(e));
check("بلا أخطاء صفحة", real.length === 0, real.slice(0, 3).join(" | "));
await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-visit-retry: ${passes} نجحت، ${fails} فشلت${SHOTS ? ` — لقطات: ${SHOTS}` : ""}`);
process.exit(fails ? 1 : 0);
