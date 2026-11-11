/* ============================================================================
 * فحصٌ حيٌّ لرابط «نسيت كلمة المرور» — متصفّحٌ حقيقيّ وخادمُ مصادقةٍ مُحاكى.
 *
 *     VITE_SUPABASE_URL=http://mock-sb.test VITE_SUPABASE_ANON_KEY=anon-test-key \
 *       npm run dev -- --port 5181 --strictPort        # بطرفٍ آخر
 *     npm run live:reset-password
 *
 * البلاغ (١١/١١): «تعيين كلمة مرور جديدة» ثم «ما اكتمل الطلب — جرّب مرة ثانية» — والإعادةُ لا تنجح.
 * القياسُ هنا: الرابطُ يهبط على /login بجلسةٍ فتحها للتوّ، وصفحةُ الدخول تمسح «الجلسةَ العالقة» حين
 * `!loading && !user` — والمستخدمُ يُبنى من الملفّ لا من الجلسة. فملفٌّ فشلت قراءتُه أو غاب صفُّه أو
 * تأخّر فوق مهلة الـ١٢ ثانية ⇒ signOut محلّيّ يمسح جلسةَ الرابط، والنموذجُ باقٍ (وضعُ الاستعادة من الرابط)،
 * والنداءُ بلا جلسة **لا يصل الخادم** فيرجع «Auth session missing!» ⇒ الرسالةُ العامّة.
 *
 * والخادمُ مُحاكى عمداً: الإنتاجُ لا يصله موصّلٌ من هنا، والمطلوبُ سلوكُ المتصفّح بأزمنةٍ وأعطابٍ نتحكّم
 * بها — GoTrue وPostgREST يُجابان بـ`route` بأشكال ردودهما الحقيقية (auth-js يقرؤها كما هي).
 * ==========================================================================*/
let chromium, devices;
for (const m of ["playwright", "/opt/node22/lib/node_modules/playwright/index.mjs"]) {
  try { ({ chromium, devices } = await import(m)); break; } catch { /* التالي */ }
}
if (!chromium) { console.error("✗ live-reset-password: ما لكيت playwright"); process.exit(1); }
const { existsSync } = await import("node:fs");
const B = ["/opt/pw-browsers/chromium-1194/chrome-linux/chrome", "/opt/pw-browsers/chromium"].find((p) => existsSync(p));
const BASE = process.env.LIVE_URL ?? "http://localhost:5181";
const SB = "http://mock-sb.test";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const UID = "11111111-2222-3333-4444-555555555555";
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: UID, exp: now + 3600, iat: now, role: "authenticated", session_id: "s1", aal: "aal1" })}.sig`;
const USER = { id: UID, aud: "authenticated", role: "authenticated", email: "vet@clinic.test", email_confirmed_at: "2026-01-01T00:00:00Z", user_metadata: { full_name: "د. فحص" }, app_metadata: { provider: "email" }, created_at: "2026-01-01T00:00:00Z" };
const ROW = { id: UID, full_name: "د. فحص", email: "vet@clinic.test", role: "clinic", roles: ["clinic"], clinic_id: null, phone: null };
const LINK = `/login#access_token=${JWT}&expires_at=${now + 3600}&expires_in=3600&refresh_token=rt1&token_type=bearer&type=recovery`;

const browser = await chromium.launch({ headless: true, executablePath: B });

/** يفتح الرابطَ كما يصل من البريد، ويكتب كلمةً جديدة، ويقول ما حدث. */
async function run({ profile = "ok", put = "ok", read = 1500 }) {
  const calls = [];
  const ctx = await browser.newContext({ ...devices["Galaxy Tab S4"], locale: "ar-IQ" });
  await ctx.route(`${SB}/**`, async (route) => {
    const req = route.request(), u = new URL(req.url()), p = u.pathname, m = req.method();
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*" };
    const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers: cors, body: JSON.stringify(body) });
    if (m === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    await new Promise((r) => setTimeout(r, 250)); // زمنُ ذهابٍ وإياب كبغداد ↔ فرانكفورت
    if (p === "/auth/v1/user" && m === "GET") return json(200, USER);
    if (p === "/auth/v1/user" && m === "PUT") {
      calls.push("PUT /user");
      if (put === "session_not_found") return json(403, { code: 403, error_code: "session_not_found", msg: "Session from session_id claim in JWT does not exist" });
      return json(200, USER);
    }
    if (p === "/auth/v1/logout") { calls.push(`logout${u.search}`); return route.fulfill({ status: 204, headers: cors }); }
    if (p === "/auth/v1/token") return json(200, { access_token: JWT, token_type: "bearer", expires_in: 3600, expires_at: now + 3600, refresh_token: "rt2", user: USER });
    if (p === "/rest/v1/profiles") {
      if (profile === "fail") return json(500, { code: "XX000", message: "transient" });
      if (profile === "missing") return json(406, { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" });
      if (profile === "slow") await new Promise((r) => setTimeout(r, 14000)); // فوق مهلة الإقلاع (١٢ ث)
      return json(200, ROW);
    }
    if (p.startsWith("/rest/v1/rpc/")) return json(200, null);
    if (p.startsWith("/rest/v1/")) return json(200, []);
    return json(200, {});
  });
  const page = await ctx.newPage();
  try { await page.goto(BASE + LINK, { waitUntil: "domcontentloaded", timeout: 10000 }); }
  catch { console.error(`✗ live-reset-password: خادمُ التطوير ما يجاوب على ${BASE} — شغّله بمتغيّرات الخادم المُحاكى (رأس الملفّ)`); process.exit(1); }
  await page.getByText("تعيين كلمة مرور جديدة").first().waitFor({ timeout: 30000 });
  await page.waitForTimeout(read); // يقرأ النموذجَ ويكتب
  const kept = await page.evaluate(() => Object.keys(localStorage).some((k) => /^sb-.*-auth-token$/.test(k)));
  const pw = page.locator('input[autocomplete="new-password"]');
  await pw.nth(0).fill("Doctordabya001");
  await pw.nth(1).fill("Doctordabya001");
  await page.getByRole("button", { name: "تحديث كلمة المرور" }).click();
  await page.waitForTimeout(2500);
  const error = await page.locator("p.text-danger-600").first().textContent({ timeout: 1000 }).catch(() => null);
  const res = { kept, calls, error: error?.trim() ?? null, path: new URL(page.url()).pathname, page, ctx };
  return res;
}

for (const [profile, label] of [["ok", "الملفُّ يُقرأ"], ["fail", "قراءةُ الملفّ تفشل (عطلٌ عابر)"], ["missing", "صفُّ الملفّ غائب"], ["slow", "الملفُّ أبطأ من مهلة الإقلاع"]]) {
  console.log(`\n▸ ${label}:`);
  const r = await run({ profile, read: profile === "slow" ? 16000 : 1500 });
  check("جلسةُ الرابط باقيةٌ حتى الحفظ", r.kept, `سجلّ: ${r.calls.join("، ") || "—"}`);
  check("وصفحةُ الدخول لم تمسحها (لا logout)", !r.calls.some((c) => c.startsWith("logout")), r.calls.join("، "));
  check("الحفظُ وصل الخادم (PUT /user)", r.calls.includes("PUT /user"));
  check("ولا رسالةَ خطأ، وغادر النموذج", !r.error && r.path !== "/login", `خطأ=${JSON.stringify(r.error)} مسار=${r.path}`);
  await r.ctx.close();
}

console.log("\n▸ الخادمُ يقول الجلسةُ أُبطلت (رابطٌ ثانٍ، أو خروجٌ من جهازٍ آخر):");
{
  const r = await run({ put: "session_not_found" });
  check("لا «جرّب مرة ثانية» — الإعادةُ لا تنجح", !!r.error && !/جرّب مرة ثانية/.test(r.error), JSON.stringify(r.error));
  check("بل «اطلب رابطاً جديداً» بكلامه", /رابط/.test(r.error ?? ""), JSON.stringify(r.error));
  const btn = r.page.locator("[data-reset-newlink]");
  check("وزرُّه مكانَ «تحديث كلمة المرور»", await btn.isVisible().catch(() => false));
  await btn.click().catch(() => {});
  await r.page.waitForTimeout(800);
  check("والزرُّ يفتح «أرسل رابط إعادة التعيين»", await r.page.locator('input[type="email"]').isVisible().catch(() => false));
  await r.ctx.close();
}

console.log(`\n${fails ? "✗" : "✓"} live-reset-password: ${passes} نجح، ${fails} فشل`);
await browser.close();
process.exit(fails ? 1 : 0);
