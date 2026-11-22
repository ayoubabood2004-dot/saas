/* ============================================================================
 * فحصٌ حيٌّ للملاحظة الصوتية (0287) — متصفّحٌ حقيقيّ بمايكٍ مزيَّف على النسخة التجريبية.
 *
 *     npm run dev -- --port 5179 --strictPort   # بطرفٍ آخر
 *     node scripts/live/voice.mjs
 *
 * يقود ما يفعله الطبيب: يفتح الزيارة، يضغط «ملاحظة صوتية» ويسجّل ويوقف، ثمّ يقرأ ما حُفظ فعلاً
 * (صفُّ التجريبيّ وبايتاتُه بـIndexedDB) لا ما تقوله الشاشة؛ يشغّل، يحذف بسبب، يرجّع؛ يسجّل
 * ملاحظةَ يومٍ من الطبلة؛ ويغلق النافذةَ وهو يسجّل (يُحفظ ويُقال). والمايكُ المزيَّف نغمةٌ ثابتة.
 * ==========================================================================*/
process.env.TZ = "Asia/Baghdad";
let chromium;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium } = await import(m)); break; } catch { /* نجرّب التالي */ }
}
if (!chromium) { console.error("✗ live-voice: ما لكيت playwright"); process.exit(1); }
const { readFileSync, existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5179";
// المفتاحُ انتقل لـdemoKey.ts (0265: بذرةُ التجريبيّ خارج الإقلاع) — بلاه يُبذر تحت "undefined" فلا زيارة.
const DB_KEY = /DEMO_DB_KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoKey.ts", "utf8"))?.[1];
if (!DB_KEY) { console.error("✗ live-voice: ما لكيت مفتاحَ قاعدة التجريبيّ بـdemoKey.ts"); process.exit(1); }
const SESSION = { raw: { id: "demo-admin", full_name: "د. الفحص", email: "admin@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "c1" }, active: "clinic" };

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const pad = (n) => String(n).padStart(2, "0");
const d0 = new Date();
const TODAY = `${d0.getFullYear()}-${pad(d0.getMonth() + 1)}-${pad(d0.getDate())}`;

const seedDB = () => ({
  products: [], companies: [], companySections: [],
  purchases: [], purchaseItems: [], purchasePayments: [], companyCharges: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
  pets: [{ id: "pt1", name: "بوبي", species: "dog", sex: "male", dob: "2024-01-01", owner_name: "أبو علي", owner_phone: "07700000000", clinic_id: "c1", created_at: "2026-01-01T00:00:00.000Z" }],
  weightLogs: [], vaccinations: [], media: [], visits: [],
  clinicVisits: [{ id: "cv1", pet_id: "pt1", kind: "illness", status: "open", condition: "under_treatment", opened_at: new Date(Date.now() - 3600_000).toISOString(), opened_by: "د. الفحص", created_at: new Date().toISOString() }],
  appointments: [], admissions: [], reminders: [],
  treatments: [
    { id: "t1", pet_id: "pt1", visit_id: "cv1", day: TODAY, time: "10:00", medication: "Ceftriaxone", amount: "1ml", observations: "", task_type: "drug", administered_at: null, created_at: new Date().toISOString() },
  ],
});

const browser = await chromium.launch({
  headless: true, executablePath: B,
  args: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream", "--autoplay-policy=no-user-gesture-required"],
});
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1300, height: 1000 }, deviceScaleFactor: process.env.SHOTS ? 2 : 1, locale: "ar-IQ", timezoneId: "Asia/Baghdad", permissions: ["microphone"] });
await ctx.addInitScript(([k, v, sk, sv]) => {
  if (!sessionStorage.getItem("seeded")) { localStorage.setItem(k, v); localStorage.setItem(sk, sv); sessionStorage.setItem("seeded", "1"); }
}, [DB_KEY, JSON.stringify(seedDB()), "vp_session", JSON.stringify(SESSION)]);
// كلُّ مسار مايكٍ يُفتح يُحفظ، فـ«المايكُ انطفى» يُقاس بحال المسارات لا بغياب علامة.
await ctx.addInitScript(() => {
  const md = navigator.mediaDevices;
  if (!md?.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  window.__streams = [];
  md.getUserMedia = async (c) => { const s = await orig(c); window.__streams.push(s); return s; };
});
const page = await ctx.newPage();
page.on("pageerror", (e) => errors.push(e.message));
page.on("console", (m) => { if (m.type() === "error" && /voice|Voice/.test(m.text())) errors.push(m.text()); });

const flat = async () => (await page.locator("body").innerText()).replace(/\s+/g, " ");
const rows = async () => JSON.parse((await page.evaluate(() => localStorage.getItem("vp_demo_voice"))) || "[]");
const audioBytes = async (id) => page.evaluate((id) => new Promise((ok) => {
  const r = indexedDB.open("dv-voice");
  r.onsuccess = () => {
    const db = r.result;
    if (!db.objectStoreNames.contains("demo_audio")) { ok(-1); return; }
    const g = db.transaction("demo_audio").objectStore("demo_audio").getAll();
    g.onsuccess = () => {
      const hit = g.result.find((x) => JSON.stringify(x).includes(id) || x?.id === id || x?.path?.includes?.(id));
      ok(hit ? (hit.bytes?.byteLength ?? hit.blob?.size ?? hit.buf?.byteLength ?? 1) : 0);
    };
    g.onerror = () => ok(-2);
  };
  r.onerror = () => ok(-3);
}), id);
const until = async (fn, ms = 15000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return true; await page.waitForTimeout(250); } return false; };

console.log("▸ ١) «ملاحظة صوتية» من شريط الزيارة: تسجيلٌ يُحفظ ويرتفع");
await page.goto(`${BASE}/pet/pt1/visit/cv1`, { waitUntil: "domcontentloaded" });
await page.locator("[data-printsheet]").waitFor({ timeout: 40000 }).catch(() => {});
check("زرُّ «ملاحظة صوتية» ظاهرٌ للطبيب", await until(async () => (await page.locator("[data-voice-btn]").count()) === 1, 20000));
await page.locator("[data-voice-btn]").click();
check("  ويفتح نافذةَ الملاحظة بالمسجِّل", await until(async () => (await page.locator("[data-voice-recorder]").count()) === 1));
await page.locator("[data-voice-start]").click();
check("  «سجّل» يبدأ: العدّادُ يمشي", await until(async () => /0:0[1-9]/.test((await page.locator("[data-voice-timer]").textContent().catch(() => "")) ?? ""), 8000),
  await page.locator("[data-voice-recorder]").innerText().catch(() => ""));
await page.keyboard.press("Escape");
await page.waitForTimeout(400);
check("  وEsc لا يغلق النافذةَ وهو يسجّل", (await page.locator("[data-voice-recorder]").count()) === 1);
check("  ولا «ما يوصل صوت» والمايكُ ينغّم", !/ما يوصل صوت/.test(await flat()));
await page.waitForTimeout(1600);
await page.locator("[data-voice-stop]").click();
const up1 = await until(async () => (await rows()).length === 1, 20000);
check("«وقّف واحفظ» ⇒ صفٌّ واحد بالتجريبيّ", up1, JSON.stringify(await rows()).slice(0, 300));
const r1 = (await rows())[0] ?? {};
check("  بمدّةٍ من الحاوية (٢–٦ ثوانٍ)، وصيغةٍ مسمّاة، وبصمةٍ وحجم", r1.duration_ms >= 2000 && r1.duration_ms <= 6000 && /^audio\//.test(r1.mime) && /^[0-9a-f]{64}$/.test(r1.sha256) && r1.bytes > 1000,
  JSON.stringify({ d: r1.duration_ms, m: r1.mime, b: r1.bytes }));
check("  ونوعُ «ملاحظة الزيارة» بلا يوم، باسم الطبيب", r1.kind === "note" && r1.day == null && /الفحص/.test(r1.doctor_name ?? ""), JSON.stringify({ k: r1.kind, d: r1.day, n: r1.doctor_name }));
check("  والبايتاتُ بالجهاز (demo_audio)", (await audioBytes(r1.id ?? "x")) > 0);
check("  و«انرفع ✓» يُقال بالنافذة بعد الصفّ", await until(async () => /انرفع ✓/.test(await page.locator("[role=dialog]").innerText().catch(() => ""))));
await page.locator("[role=dialog] button[aria-label]").first().click();
await page.waitForTimeout(600);
check("القسمُ «الملاحظات الصوتية (1)» تحت ملاحظات الزيارة", await until(async () => (await page.locator(`[data-voice-panel] [data-voice-row="${r1.id}"]`).count()) === 1) && /الملاحظات الصوتية \(1\)/.test(await flat()));
check("  والرفُّ فارغ (ما ينتظر شي)", await until(async () => (await page.evaluate(() => localStorage.getItem("vp_voice_pending"))) == null));

console.log("▸ ٢) التشغيل: داخل الضغطة، والمدّةُ المعروضة من الحاوية");
await page.locator(`[data-voice-play="${r1.id}"]`).click();
const played = await until(async () => page.evaluate(() => [...document.querySelectorAll("audio")].some((a) => a.currentTime > 0.3)), 8000);
check("«شغّل» يشغّل الصوتَ فعلاً (currentTime يتقدّم)", played);
const shown = await page.locator(`[data-voice-row="${r1.id}"]`).innerText();
check("  والمدّةُ المعروضة = المخزّنة (بتقريب fmtDuration)", shown.includes(`/ 0:0${Math.round(r1.duration_ms / 1000)}`), shown);

console.log("▸ ٣) الحذفُ بسبب يذهب للمحذوفة، والإرجاعُ بالمعرّف نفسِه");
await page.locator(`[data-voice-row="${r1.id}"] button:has-text("حذف")`).click();
await page.locator(`[data-voice-row="${r1.id}"] input[maxlength]`).fill("سجّلتها غلط");
await page.locator(`[data-voice-row="${r1.id}"] button:has-text("احذفها")`).click();
check("الصفُّ مختومٌ محذوفاً بسببه وتاريخه (لا مسح)", await until(async () => { const r = (await rows())[0]; return !!r?.voided_at && r.void_reason === "سجّلتها غلط" && r.history?.length === 1; }), JSON.stringify((await rows())[0] ?? {}).slice(0, 300));
check("  و«المحذوفة (1)» ظاهرة", await until(async () => /المحذوفة \(1\)/.test(await flat())));
await page.locator("button:has-text('المحذوفة (1)')").click();
check("  وفيها «حذفها» والسبب", await until(async () => /حذفها .*السبب: سجّلتها غلط/.test(await flat())));
await page.locator(`[data-voice-row="${r1.id}"] button:has-text("رجّعها")`).click();
check("«رجّعها» يرجعه بالمعرّف نفسِه وتاريخُه يحفظ الاثنين", await until(async () => { const r = (await rows())[0]; return r?.id === r1.id && !r.voided_at && r.history?.length === 2; }));

console.log("▸ ٤) ملاحظةُ يومٍ من الطبلة ⇒ رقاقةٌ بخانة اليوم");
const addDay = page.locator("table button:has-text('ملاحظة')").first();
await addDay.click();
check("نافذةُ «ملاحظة على …» بالمسجِّل", await until(async () => (await page.locator("[data-voice-recorder]").count()) === 1));
await page.locator("[data-voice-start]").click();
await until(async () => /0:0[1-9]/.test((await page.locator("[data-voice-timer]").textContent().catch(() => "")) ?? ""), 8000);
await page.waitForTimeout(1200);
await page.locator("[data-voice-stop]").click();
check("  صفٌّ ثانٍ بنوع «يوم» ويومِ الخانة", await until(async () => (await rows()).some((r) => r.kind === "day" && r.day === TODAY), 20000), JSON.stringify((await rows()).map((r) => [r.kind, r.day])));
await page.locator("[role=dialog] button[aria-label]").first().click();
check("  والرقاقةُ بخانة اليوم بالطبلة", await until(async () => (await page.locator(`[data-voice-day="${TODAY}"] [data-voice-play]`).count()) >= 1));

console.log("▸ ٥) إغلاقُ النافذة وهو يسجّل = يوقف ويحفظ ويقولها");
await page.locator("[data-voice-btn]").click();
await until(async () => (await page.locator("[data-voice-recorder]").count()) === 1);
await page.locator("[data-voice-start]").click();
await until(async () => /0:0[1-9]/.test((await page.locator("[data-voice-timer]").textContent().catch(() => "")) ?? ""), 8000);
await page.waitForTimeout(1300);
await page.locator("[role=dialog] button[aria-label]").first().click();
check("«انحفظ التسجيل (…)» يُقال", await until(async () => /انحفظ التسجيل \(0:0\d\)/.test(await flat()), 8000));
check("  وصفٌّ ثالث", await until(async () => (await rows()).length === 3, 20000));
check("  والمايكُ انطفى: كلُّ مسارٍ فُتح صار ended", await page.evaluate(() => {
  const tr = (window.__streams ?? []).flatMap((st) => st.getTracks());
  return tr.length >= 3 && tr.every((x) => x.readyState === "ended");
}), await page.evaluate(() => JSON.stringify((window.__streams ?? []).flatMap((st) => st.getTracks().map((x) => x.readyState)))));
if (process.env.SHOTS) {
  await page.setViewportSize({ width: 1100, height: 900 });
  await page.locator("[data-voice-panel]").scrollIntoViewIfNeeded();
  await page.locator("[data-voice-panel]").screenshot({ path: `${process.env.SHOTS}/voice-panel.png` });
  await page.locator("[data-voice-btn]").click();
  await until(async () => (await page.locator("[data-voice-recorder]").count()) === 1);
  await page.locator("[data-voice-start]").click();
  await page.waitForTimeout(2500);
  await page.locator("[role=dialog]").screenshot({ path: `${process.env.SHOTS}/voice-recording.png` });
  await page.locator("[data-voice-stop]").click();
  await until(async () => (await rows()).length === 4, 20000);
  await page.locator("[role=dialog] button[aria-label]").first().click();
}

console.log("▸ ٦) /voice: لا شيء ينتظر");
await page.goto(`${BASE}/voice`, { waitUntil: "domcontentloaded" });
check("«ماكو شي ينتظر»", await until(async () => /ماكو شي ينتظر/.test(await flat()), 20000), (await flat()).slice(0, 300));

check("بلا أخطاء صفحة", errors.length === 0, errors.join(" | ").slice(0, 600));
await browser.close();
console.log(`${fails ? "✗" : "✓"} live-voice: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
