/* ============================================================================
 * فحصٌ حيٌّ لسلسلة اللقاح — متصفّحٌ حقيقيّ على النسخة التجريبية.
 *
 *     npm run dev -- --port 5199 --strictPort   # بطرفٍ آخر
 *     LIVE_URL=http://localhost:5199 node scripts/live/vax-next.mjs
 *
 * يقود ما اشتكت منه العيادة (١٠/١٠): جرعةٌ معزّزة متأخرة بسلسلة ٣ أسابيع ⇒ «تسجيل إعطائها» من
 * ملفّ الحيوان. كانت النافذةُ تحفظ وتسكت: لا سؤالَ عن الجاية ولا حجز. الآن تسأل وتعلّم نفسَ المدّة
 * بـ★، والحفظُ يكتب الجاية — ويُقرأ المخزنُ بعدها. ثمّ: «إضافة تطعيم ← انعطى اليوم» لجرعةٍ مستحقّة
 * (التنبيهُ قبل الحفظ والاستهلاكُ بعده)، وعلامةُ «تم» بتقويم الاستقبال تفتح النافذةَ نفسها، وفشلُ
 * الحجز بعد الإعطاء ثمّ الإغلاقُ يحدّث السجلّ.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-vax-next: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5199";
const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const pad = (n) => String(n).padStart(2, "0");
const day = (off) => { const d = new Date(); d.setDate(d.getDate() + off); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const TODAY = day(0);

const seedDB = (vaccinations) => ({
  products: [], companies: [], companySections: [], purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [{ id: "pt1", name: "بوبي", species: "dog", sex: "male", dob: "2025-06-01", owner_name: "أبو علي", owner_phone: "07700000000", clinic_id: "c1", created_at: "2026-01-01T00:00:00.000Z" }],
  weightLogs: [], vaccinations, media: [], visits: [], clinicVisits: [], appointments: [], admissions: [], reminders: [], treatments: [],
});

const browser = await chromium.launch({ headless: true, executablePath: B });
const errors = [];
const open = async (path, db) => {
  const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, locale: "ar-IQ", timezoneId: "Asia/Baghdad" });
  await ctx.addInitScript(([k, v, sk, sv]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); } },
    [DB_KEY, JSON.stringify(db), "vp_session", JSON.stringify(SESSION)]);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(`${path}: ${e.message}`));
  await page.goto(`${BASE}${path}`, { waitUntil: "domcontentloaded" });
  return { ctx, page };
};
const vx = async (page) => JSON.parse(await page.evaluate((k) => localStorage.getItem(k), DB_KEY)).vaccinations;

console.log("▸ ١) «تسجيل إعطائها» من ملفّ الحيوان يسأل عن الجاية ويحجزها");
{
  // سلسلة DHPP كلَّ ٣ أسابيع: الأولى قبل ٢٤ يوماً، والثانية كانت مجدولةً قبل ٣ أيام (متأخرة).
  const { ctx, page } = await open("/pet/pt1?tab=vaccines", seedDB([
    { id: "v1", pet_id: "pt1", name: "DHPP", status: "administered", administered_at: day(-24), due_date: null },
    { id: "v2", pet_id: "pt1", name: "DHPP", status: "overdue", administered_at: null, due_date: day(-3) },
  ]));
  const give = page.getByRole("button", { name: /تسجيل إعطائها/ }).first();
  await give.waitFor({ timeout: 30000 });
  await give.click();
  const modal = page.locator("[data-administer-dose]");
  await modal.waitFor({ timeout: 10000 });
  const txt = (await modal.innerText()).replace(/\s+/g, " ");
  check("النافذةُ تسأل «شوكت الجرعة الجاية؟»", /شوكت الجرعة الجاية/.test(txt), txt.slice(0, 160));
  check("  وتعلّم نفسَ المدّة السابقة (٣ أسابيع) بـ★ — علامةٌ لا اختيار (الحفظُ مطفأ حتى يجاوب الطبيب)",
    /نفس المدّة السابقة/.test(txt) && /3 أسابيع ★/.test(txt)
      && (await modal.locator('[data-next-preset="medentry.b3w"]').getAttribute("aria-pressed")) === "false"
      && await modal.locator("[data-administer-confirm]").isDisabled());
  await modal.locator('[data-next-preset="medentry.b3w"]').click();
  const due = await modal.locator("[data-next-due]").getAttribute("data-next-due");
  check("  والموعدُ يُعرض بسنته", new RegExp(String(new Date(day(21)).getFullYear())).test(await modal.locator("[data-next-due]").innerText()));
  check("  والموعدُ ٣ أسابيع من يوم الإعطاء (اليوم) لا من الموعد القديم", due === day(21), String(due));
  await modal.locator('[data-next-none]').click();
  check("  و«ماكو جرعة جاية» خيارٌ صريح يمحو الموعد", (await modal.locator("[data-next-due]").count()) === 0);
  await modal.locator('[data-next-preset="medentry.b3w"]').click();
  await modal.locator("[data-administer-confirm]").click();
  await modal.waitFor({ state: "detached", timeout: 10000 });
  const rows = await vx(page);
  check("الجرعةُ المتأخرة انقلبت معطاةً اليوم (نفسُ الصفّ)", rows.find((v) => v.id === "v2")?.status === "administered" && rows.find((v) => v.id === "v2")?.administered_at === TODAY,
    JSON.stringify(rows.find((v) => v.id === "v2")));
  const next = rows.filter((v) => v.name === "DHPP" && v.status !== "administered");
  check("  والجاية انحجزت مرّةً بعد ٣ أسابيع", next.length === 1 && next[0].due_date === day(21), JSON.stringify(next));
  await ctx.close();
}

console.log("▸ ٢) جرعةٌ بلا سابقة: لا حفظَ بلا جواب");
{
  const { ctx, page } = await open("/pet/pt1?tab=vaccines", seedDB([
    { id: "v3", pet_id: "pt1", name: "Rabies", status: "scheduled", administered_at: null, due_date: TODAY },
  ]));
  const give = page.getByRole("button", { name: /تسجيل إعطائها/ }).first();
  await give.waitFor({ timeout: 30000 });
  await give.click();
  const modal = page.locator("[data-administer-dose]");
  await modal.waitFor({ timeout: 10000 });
  check("بلا اقتراح: الزرُّ مطفأ ويقول «اختار موعد الجاية»", await modal.locator("[data-administer-confirm]").isDisabled() && (await modal.locator("[data-next-ask]").count()) === 1);
  await modal.locator('[data-next-preset="medentry.b1y"]').click();
  await modal.locator("[data-administer-confirm]").click();
  await modal.waitFor({ state: "detached", timeout: 10000 });
  const rows = await vx(page);
  check("  وبعد اختيار «سنة» تنحفظ الجاية بعد سنة", rows.some((v) => v.name === "Rabies" && v.status === "scheduled" && v.due_date > day(360)), JSON.stringify(rows));
  await ctx.close();
}

console.log("▸ ٣) جايةٌ محجوزةٌ أصلاً لا تتكرّر");
{
  const { ctx, page } = await open("/pet/pt1?tab=vaccines", seedDB([
    { id: "v4", pet_id: "pt1", name: "Lepto", status: "overdue", administered_at: null, due_date: day(-2) },
    { id: "v5", pet_id: "pt1", name: "Lepto", status: "scheduled", administered_at: null, due_date: day(300) },
  ]));
  const give = page.getByRole("button", { name: /تسجيل إعطائها/ }).first();
  await give.waitFor({ timeout: 30000 });
  await give.click();
  const modal = page.locator("[data-administer-dose]");
  await modal.waitFor({ timeout: 10000 });
  check("تقول «الجاية محجوزة أصلاً» والحفظُ متاح", (await modal.locator("[data-next-existing]").count()) === 1 && !(await modal.locator("[data-administer-confirm]").isDisabled()));
  await modal.locator("[data-administer-confirm]").click();
  await modal.waitFor({ state: "detached", timeout: 10000 });
  const rows = await vx(page);
  check("  ولا صفٌّ جديد", rows.filter((v) => v.name === "Lepto" && v.status !== "administered").length === 1);
  await ctx.close();
}

console.log("▸ ٤) «إضافة تطعيم ← انعطى اليوم» بالملفّ: يقولها قبل الحفظ ويستهلك المستحقّة");
{
  const { ctx, page } = await open("/pet/pt1?tab=vaccines", seedDB([
    { id: "v6", pet_id: "pt1", name: "Rabies", status: "overdue", administered_at: null, due_date: day(-3) },
  ]));
  const addBtn = page.locator('button:has-text("إضافة تطعيم"), button:has-text("إضافة لقاح")').first();
  await addBtn.waitFor({ timeout: 30000 });
  await addBtn.click();
  const dlg = page.locator('[role="dialog"]').last();
  await dlg.locator("button", { hasText: /اختر لقاح|Select a vaccine|Choose/ }).first().click();
  await dlg.locator(".max-h-60 button", { hasText: /^Rabies$/ }).first().click();
  await page.locator("[data-vx-consume]").waitFor({ timeout: 8000 }).catch(() => undefined);
  check("التنبيهُ ظاهرٌ بالملفّ: «الجرعة المستحقة … راح تنحسب»", (await page.locator("[data-vx-consume]").count()) === 1);
  await dlg.locator('button:has-text("سنة")').first().click();
  await dlg.locator('button:has-text("إضافة اللقاح")').first().click();
  await page.waitForTimeout(300);
  await page.locator('[role="dialog"] button:has-text("Save"), [role="dialog"] button:has-text("حفظ")').last().click();
  await page.waitForTimeout(1500);
  const rows = (await vx(page)).filter((v) => v.name === "Rabies");
  check("  والمستحقّةُ انقلبت معطاةً بنفس معرّفها، والجاية بعد سنة، بلا صفٍّ معطى ثانٍ",
    rows.find((v) => v.id === "v6")?.status === "administered" && rows.filter((v) => v.status === "administered").length === 1
      && rows.some((v) => v.status === "scheduled" && v.due_date > day(360)), JSON.stringify(rows));
  await ctx.close();
}

console.log("▸ ٥) علامةُ «تم» بتقويم الاستقبال تفتح النافذةَ نفسها");
{
  const { ctx, page } = await open("/reception", seedDB([
    { id: "v1", pet_id: "pt1", name: "DHPP", status: "administered", administered_at: day(-24), due_date: null },
    { id: "v7", pet_id: "pt1", name: "DHPP", status: "scheduled", administered_at: null, due_date: TODAY },
  ]));
  const month = page.getByRole("button", { name: /شهري/ }).first();
  await month.waitFor({ timeout: 30000 });
  await month.click();
  await page.locator(`[data-day="${TODAY}"]`).first().click();
  const done = page.getByRole("button", { name: /^تم$/ }).first();
  await done.waitFor({ timeout: 10000 });
  await done.click();
  const modal = page.locator("[data-administer-dose]");
  await modal.waitFor({ timeout: 15000 }).catch(() => undefined);
  check("«تم» على تذكير اللقاح تفتح «شوكت الجرعة الجاية؟» لا علامةً صامتة", (await modal.count()) === 1 && (await vx(page)).find((v) => v.id === "v7")?.status === "scheduled");
  if (await modal.count()) {
    await modal.locator('[data-next-preset="medentry.b3w"]').click();
    await modal.locator("[data-administer-confirm]").click();
    await modal.waitFor({ state: "detached", timeout: 10000 });
    const rows = await vx(page);
    check("  والحفظُ يعطيها ويحجز الجاية", rows.find((v) => v.id === "v7")?.status === "administered" && rows.some((v) => v.name === "DHPP" && v.status === "scheduled" && v.due_date === day(21)),
      JSON.stringify(rows));
  }
  await ctx.close();
}

console.log("▸ ٦) أُعطيت وفشل حجزُ الجاية ثمّ أُغلقت النافذة: السجلُّ يتحدّث");
{
  const { ctx, page } = await open("/pet/pt1?tab=vaccines", seedDB([
    { id: "v8", pet_id: "pt1", name: "Lepto", status: "overdue", administered_at: null, due_date: day(-1) },
  ]));
  const give = page.getByRole("button", { name: /تسجيل إعطائها/ }).first();
  await give.waitFor({ timeout: 30000 });
  await give.click();
  const modal = page.locator("[data-administer-dose]");
  await modal.waitFor({ timeout: 10000 });
  await modal.locator('[data-next-preset="medentry.b1y"]').click();
  // الكتابةُ الأولى (الإعطاء) تمرّ والثانية (الحجز) ترمي — حصّةُ التخزين ممتلئة.
  await page.evaluate((k) => {
    const real = Storage.prototype.setItem; let n = 0;
    Storage.prototype.setItem = function (key, v) { if (key === k && ++n === 2) throw new DOMException("full", "QuotaExceededError"); return real.call(this, key, v); };
  }, DB_KEY);
  await modal.locator("[data-administer-confirm]").click();
  await page.waitForTimeout(800);
  check("الحجزُ فشل: النافذةُ باقيةٌ بزرّ «احجز الموعد»", (await modal.count()) === 1 && /احجز الموعد/.test(await modal.locator("[data-administer-confirm]").innerText()));
  await page.keyboard.press("Escape");
  await modal.waitFor({ state: "detached", timeout: 5000 }).catch(() => undefined);
  await page.waitForTimeout(800);
  check("  والإغلاقُ يحدّث السجلّ: الجرعةُ ما عادت «تسجيل إعطائها» (لا تُعطى مرّةً ثانية)",
    (await page.getByRole("button", { name: /تسجيل إعطائها/ }).count()) === 0);
  await ctx.close();
}

check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | ").slice(0, 300));
await browser.close();
console.log(`\n${fails ? "✗" : "✓"} live-vax-next: ${passes} ✓ · ${fails} ✗`);
process.exit(fails ? 1 : 0);
