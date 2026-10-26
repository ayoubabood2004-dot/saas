/* ============================================================================
 * دالّةُ الدفع (wayl-create-link) تقبض ما تعرضه الشاشة، للعيادة التي تعرضها.
 *
 * عيبان بنفس الملفّ، وكلاهما مالٌ يذهب لغير مكانه:
 *
 *   ١) السعر. الدالّةُ كانت تحمل جدولَ أسعارٍ بيدها (`PLAN_USD`، ٧/٧) والشاشةُ
 *      تقرأ `plan_prices` (0104، ١٣/٨). رُفعت السوبر إلى ١٠٠$/١٠٠٠$ (١٩/٨) بالشِفرة
 *      وببذرة 0104 — والدالّةُ بقيت ٧٨$ والسنويُّ ١٢ × الشهري، فتقبض ٩٣٦$ عمّا يُعرض
 *      ألفاً. وتعديلُ المشغّل للأسعار من لوحته كان يغيّر المعروضَ وحده. فالسعرُ صار
 *      صفَّ `plan_prices` نفسَه: لا صفّ = لا باقة تُشترى، وخطأُ قراءة = لا قبض
 *      (لا سعرَ «احتياطيّ» يخالف المعروض).
 *
 *   ٢) العيادة. كانت `memberships … .maybeSingle()` بلا شرط حالة — والمصيدةُ
 *      المكتوبة: يرمي على أكثر من صفّ، فصاحبُ عيادةٍ يعمل كادراً بأخرى تفشل قراءتُه
 *      بصمت فتُحسب دفعتُه لحسابه هو؛ وعضويةٌ موقوفة تُحسب كأنها قائمة. والاشتراكُ
 *      الذي تعرضه شاشةُ الدفع مفتاحُه `auth_clinic()` (`get_or_init_subscription`)،
 *      فالدفعةُ تسأل `auth_clinic()` نفسَها بهويّة الدافع — أيُّ قراءةٍ ثانية مرآةٌ
 *      تنحرف عنها.
 *
 * يُحزَم index.ts الحقيقيّ ويجري بعميلٍ مزيّف يتصرّف كـPostgREST (maybeSingle
 * يرمي على صفّين) وWayl مزيّف يسجّل ما طُلب منه.
 *
 *   node scripts/wayl-checkout-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const OWNER = "11111111-1111-1111-1111-111111111111";
const CLINIC_B = "22222222-2222-2222-2222-222222222222";
const STAFF = "33333333-3333-3333-3333-333333333333";
const OPERATOR = "44444444-4444-4444-4444-444444444444";
const CLINIC_C = "55555555-5555-5555-5555-555555555555";

const ENV = {
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-key",
  SUPABASE_ANON_KEY: "anon-key",
  WAYL_API_KEY: "wayl-key",
  WAYL_WEBHOOK_SECRET: "wayl-secret",
};

/* ── الحالةُ التي يقرؤها العميلُ المزيّف — تُضبط لكلّ حالة ────────────────── */
let S;
const fresh = (over = {}) => ({
  user: { id: OWNER },
  memberships: [{ user_id: OWNER, clinic_id: OWNER, status: "active", created_at: "2026-01-01" }],
  authClinic: OWNER,          // ما ترجعه auth_clinic() بهويّة الدافع (تعريفُ 0151)
  authClinicErr: null,
  prices: { basic: [30, 360], advanced: [55, 660], super: [100, 1000] },
  local: [],            // plan_local_prices (0250)
  localErr: null,
  priceErr: null,
  cfgErr: null,
  rate: 1500,
  orders: [], updates: [], wayl: [], rpcs: [],
  ...over,
});

const MULTI = { code: "PGRST116", message: "JSON object requested, multiple (or no) rows returned" };

function rowsOf(table) {
  if (table === "plan_prices") {
    if (S.priceErr) return { error: S.priceErr };
    return { rows: Object.entries(S.prices).map(([plan, [m, a]]) => ({ plan, monthly_usd: m, annual_usd: a })) };
  }
  if (table === "app_config") return S.cfgErr ? { error: S.cfgErr } : { rows: [{ key: "usd_rate", value: S.rate }] };
  if (table === "plan_local_prices") return S.localErr ? { error: S.localErr } : { rows: S.local };
  if (table === "memberships") return { rows: S.memberships };
  return { rows: [] };
}

function query(table) {
  const filters = [];
  const run = () => {
    const src = rowsOf(table);
    if (src.error) return { data: null, error: src.error };
    return { rows: src.rows.filter((r) => filters.every(([c, v]) => r[c] === v)) };
  };
  const q = {
    select: () => q,
    eq: (c, v) => { filters.push([c, v]); return q; },
    maybeSingle: async () => {
      const r = run();
      if (r.error) return r;
      if (r.rows.length > 1) return { data: null, error: MULTI };
      return { data: r.rows[0] ?? null, error: null };
    },
    then: (ok, ko) => Promise.resolve(run()).then((r) => (r.error ? r : { data: r.rows, error: null })).then(ok, ko),
    insert: async (row) => { S.orders.push({ table, row }); return { data: null, error: null }; },
    update: (patch) => ({ eq: async (c, v) => { S.updates.push({ table, patch, where: [c, v] }); return { error: null }; } }),
  };
  return q;
}

globalThis.__fakeCreateClient = (_url, key) => {
  const asUser = key === ENV.SUPABASE_ANON_KEY;
  return {
    auth: {
      getUser: async () => (S.user ? { data: { user: S.user }, error: null } : { data: { user: null }, error: { message: "no jwt" } }),
    },
    rpc: async (fn) => {
      S.rpcs.push({ fn, asUser });
      if (fn !== "auth_clinic") return { data: null, error: { message: `unknown rpc ${fn}` } };
      // بمفتاح الخدمة auth.uid() فارغ — فالسؤالُ بغير هويّة الدافع لا يرجع عيادة.
      if (!asUser) return { data: null, error: null };
      if (S.authClinicErr) return { data: null, error: S.authClinicErr };
      return { data: S.authClinic, error: null };
    },
    from: (table) => query(table),
  };
};

globalThis.fetch = async (url, init) => {
  S.wayl.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response(JSON.stringify({ data: { url: "https://pay.example/link", id: "wayl-1" } }), { status: 200 });
};

let handler = null;
globalThis.Deno = { env: { get: (k) => ENV[k] }, serve: (h) => { handler = h; } };

/* ── حزمُ الدالّة الحقيقية، واستبدالُ supabase-js وحده ────────────────────── */
const built = await esbuild.build({
  entryPoints: ["supabase/functions/wayl-create-link/index.ts"],
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub-supabase",
    setup(b) {
      b.onResolve({ filter: /^https:\/\/esm\.sh\// }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
        contents: "export const createClient = (...a) => globalThis.__fakeCreateClient(...a);", loader: "js",
      }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "wayl-"));
const file = join(dir, "fn.mjs");
writeFileSync(file, built.outputFiles[0].text);
try { await import(pathToFileURL(file).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
if (!handler) { console.error("✗ الدالّةُ لم تسجّل معالجاً بـDeno.serve"); process.exit(1); }

const pay = async (plan, period, over = {}) => {
  S = fresh(over);
  const res = await handler(new Request(`${ENV.SUPABASE_URL}/functions/v1/wayl-create-link`, {
    method: "POST",
    headers: { Authorization: "Bearer jwt", "Content-Type": "application/json" },
    body: JSON.stringify({ plan, period }),
  }));
  const body = await res.json().catch(() => ({}));
  const order = S.orders.find((o) => o.table === "billing_orders")?.row;
  return { status: res.status, body, order, wayl: S.wayl[0]?.body };
};

/* ════════════════════════════ ١) السعر ════════════════════════════════ */
console.log("▸ السوبر تُقبض بسعرها المعروض");
{
  const r = await pay("super", "monthly");
  check("الشهريّ = ١٠٠$ من plan_prices (لا ٧٨$)", r.order?.usd === 100, `usd=${r.order?.usd}`);
  check("  ومبلغُ الطلب = ١٠٠ × السعر", r.order?.amount_iqd === 150000, `iqd=${r.order?.amount_iqd}`);
  check("  وما يُرسَل لـWayl = نفسُ المبلغ", r.wayl?.total === 150000 && r.wayl?.lineItem?.[0]?.amount === 150000,
    `total=${r.wayl?.total}`);
  check("  وشهرٌ واحد", r.order?.months === 1);
}
{
  const r = await pay("super", "annual");
  check("السنويّ = ١٠٠٠$ (سعرُ السنويّ لا ١٢ × الشهري)", r.order?.usd === 1000, `usd=${r.order?.usd}`);
  check("  و١٢ شهراً", r.order?.months === 12);
  check("  ومبلغُ Wayl = ١٠٠٠ × السعر", r.wayl?.total === 1500000, `total=${r.wayl?.total}`);
}

console.log("▸ تعديلُ المشغّل للسعر يصل للقبض");
{
  const r = await pay("basic", "monthly", { prices: { basic: [35, 350], advanced: [55, 660], super: [100, 1000] } });
  check("العاديةُ بعد تعديلها ٣٥$ تُقبض ٣٥$", r.order?.usd === 35, `usd=${r.order?.usd}`);
  const a = await pay("basic", "annual", { prices: { basic: [35, 350], advanced: [55, 660], super: [100, 1000] } });
  check("  وسنويُّها ٣٥٠$ كما كُتب", a.order?.usd === 350, `usd=${a.order?.usd}`);
}

console.log("▸ سعرُ الصرف من app_config");
{
  const r = await pay("advanced", "monthly", { rate: 1320 });
  check("٥٥$ × ١٣٢٠", r.order?.amount_iqd === 72600, `iqd=${r.order?.amount_iqd}`);
}

console.log("▸ سعرُ الدينار الذي ثبّته المالك يُقبض بعينه (0250)");
{
  const local = [{ plan: "basic", currency: "IQD", monthly: 45000, annual: 540000 }, { plan: "basic", currency: "SAR", monthly: 119, annual: 1428 }];
  const r = await pay("basic", "monthly", { local });
  check("العاديةُ بـ45,000 دينار كما بالموقع", r.order?.amount_iqd === 45000 && r.wayl?.total === 45000 && r.wayl?.lineItem?.[0]?.amount === 45000, `${r.order?.amount_iqd}/${r.wayl?.total}`);
  check("  ودولارُه المحفوظ = المقبوض ÷ السعر", r.order?.usd === 30, String(r.order?.usd));
  const a = await pay("basic", "annual", { local });
  check("  وسنويُّها 540,000", a.order?.amount_iqd === 540000 && a.order?.months === 12, String(a.order?.amount_iqd));
  const o = await pay("advanced", "monthly", { local });
  check("باقةٌ بلا سعرٍ محلّيّ ⇒ الدولار × السعر كما كان", o.order?.amount_iqd === 82500, String(o.order?.amount_iqd));
  const sar = await pay("super", "monthly", { local: [{ plan: "super", currency: "SAR", monthly: 399, annual: 3990 }] });
  check("سعرُ عملةٍ أخرى لا يمسّ الدينار", sar.order?.amount_iqd === 150000, String(sar.order?.amount_iqd));
}
{
  const r = await pay("basic", "monthly", { localErr: { code: "PGRST205", message: "Could not find the table" } });
  check("الجدولُ غائب (الدالّةُ قبل هجرتها) ⇒ الدولار × السعر", r.status === 200 && r.order?.amount_iqd === 45000, `${r.status} ${r.order?.amount_iqd}`);
  const e = await pay("basic", "monthly", { localErr: { code: "57014", message: "statement timeout" } });
  check("  وأيُّ خطأٍ آخر بقراءته ⇒ رفض بلا طلب", e.status >= 500 && e.body?.error === "price_unavailable" && !e.order && !e.wayl, `${e.status} ${e.body?.error}`);
}

/* المعروضُ = المقبوض: الموقعُ وشاشةُ الاشتراك يعرضان الدينارَ بـ`priceFor` (src/site/editions.ts)، والدالّةُ
 * تقبض بحسابها هي — فيُقارَن الاثنان حالةً بحالة: سعرُ صرفٍ غيرُ الافتراضيّ، وصفُّ دينارٍ ثبّته المالك،
 * وصفٌّ تحت الألف أو بكسر (الهجرةُ ترفضهما اليوم، والحسابان يتّفقان عليهما مع ذلك). */
console.log("▸ ما يعرضه الموقعُ وشاشةُ الاشتراك = ما تقبضه الدالّة");
{
  const ed = await esbuild.build({ entryPoints: ["src/site/editions.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
  const d2 = mkdtempSync(join(tmpdir(), "wayl-ed-"));
  writeFileSync(join(d2, "ed.mjs"), ed.outputFiles[0].text);
  let E;
  try { E = await import(pathToFileURL(join(d2, "ed.mjs")).href); } finally { try { rmSync(d2, { recursive: true, force: true }); } catch { /* ignore */ } }
  const iq = E.editionByCode("iq");
  const PRICES = { basic: [30, 360], advanced: [55, 660], super: [100, 1000] };
  const LOCALS = [
    [],
    [{ plan: "basic", currency: "IQD", monthly: 45000, annual: 540000 }],
    [{ plan: "super", currency: "IQD", monthly: 150000.4, annual: 999 }],
  ];
  let n = 0, bad = [];
  for (const rate of [1500, 1535, 1532.5]) for (const local of LOCALS) for (const plan of ["basic", "advanced", "super"]) for (const period of ["monthly", "annual"]) {
    const r = await pay(plan, period, { rate, local, prices: PRICES });
    const data = {
      usd: Object.fromEntries(Object.entries(PRICES).map(([p, [m, a]]) => [p, { monthly: m, annual: a }])),
      usdRate: rate,
      local: { IQD: Object.fromEntries(local.filter((l) => l.currency === "IQD").map((l) => [l.plan, { monthly: l.monthly, annual: l.annual }])) },
      at: "",
    };
    const x = E.priceFor(iq, plan, data);
    const shown = x[period], shownUsd = period === "annual" ? x.usdAnnual : x.usdMonthly;
    n++;
    if (shown !== r.order?.amount_iqd || shown !== r.wayl?.total) bad.push(`${plan}/${period} rate=${rate} local=${local.length}: shown ${shown} charged ${r.order?.amount_iqd}`);
    // و«يعادل نحو $X» بجانبه = الدولارُ المحفوظ بالطلب (للدينار المثبَّت: المقبوضُ ÷ الصرف).
    if (shownUsd !== r.order?.usd) bad.push(`${plan}/${period} rate=${rate} local=${local.length}: shown $${shownUsd} order $${r.order?.usd}`);
  }
  check(`${n} حالةً: الرقمُ المعروض هو المقبوض`, bad.length === 0, bad.slice(0, 4).join("؛ "));
  const usdEd = E.editionByCode("lb");
  check("نسخةٌ بلا سعرٍ ثبّته المالك تعرض الدولارَ الذي أقرّه لا مقترحاً", E.priceFor(usdEd, "basic", { usd: { basic: { monthly: 30, annual: 360 } }, usdRate: 1535, local: {}, at: "" }).monthly === 30);
  check("  وعملةٌ بلا صفٍّ (الريال) تعرض الدولار", E.priceFor(E.editionByCode("sa"), "super", { usd: { super: { monthly: 100, annual: 1000 } }, usdRate: 1535, local: {}, at: "" }).currency === "USD");
  const subscribe = (await import("node:fs")).readFileSync("src/pages/Subscribe.tsx", "utf8");
  check("شاشةُ الاشتراك تعرض الدينارَ بالحساب نفسه (priceFor على public_pricing) لا بـ1535 ثابتاً",
    /rpc\("public_pricing"\)/.test(subscribe) && /priceFor\(editionByCode\("iq"\)!, id, pricing\)/.test(subscribe) && /تدفع \$\{money\(iqdCharged\(p\.id\)!\)\}/.test(subscribe));
  check("  والدينارُ الكويتيّ بكسره كما ثبّته المالك", E.fmtPrice(E.editionByCode("kw"), "KWD", 9.5) === "9.5 د.ك" && E.fmtPrice(E.editionByCode("kw"), "KWD", 10) === "10 د.ك", E.fmtPrice(E.editionByCode("kw"), "KWD", 9.5));
}

console.log("▸ قراءةُ سعر الصرف الفاشلة ترفض — لا قبضَ بسعرٍ افتراضيّ يخالف المعروض");
{
  const r = await pay("basic", "monthly", { cfgErr: { message: "connection reset" } });
  check("فشلُ قراءة app_config ⇒ رفض بلا طلبٍ ولا رابط", r.status >= 500 && r.body?.error === "price_unavailable" && !r.order && !r.wayl, `${r.status} ${r.body?.error}`);
}

console.log("▸ لا قبضَ بسعرٍ لم يُعرض");
{
  const r = await pay("farm", "monthly");
  check("باقةٌ بلا صفّ سعر ⇒ unknown_plan", r.status === 400 && r.body?.error === "unknown_plan", `${r.status} ${r.body?.error}`);
  check("  بلا طلبٍ ولا رابط", !r.order && !r.wayl);
}
for (const bad of ["constructor", "toString", "__proto__", ""]) {
  const r = await pay(bad, "monthly");
  check(`اسمُ باقةٍ «${bad}» ⇒ مرفوض بلا طلب`, r.status === 400 && !r.order && !r.wayl, `${r.status}`);
}
{
  const r = await pay("super", "monthly", { priceErr: { message: "connection reset" } });
  check("فشلُ قراءة الأسعار ⇒ رفض (لا سعرَ احتياطيّ)", r.status >= 500 && r.body?.error === "price_unavailable", `${r.status} ${r.body?.error}`);
  check("  بلا طلبٍ ولا رابط", !r.order && !r.wayl);
}
{
  const r = await pay("super", "monthly", { prices: { super: [0, 0] } });
  check("صفُّ سعرٍ صفريّ ⇒ رفض", r.status >= 500 && !r.order && !r.wayl, `${r.status}`);
}

/* ════════════════════════════ ٢) العيادة ═══════════════════════════════ */
console.log("▸ الدفعةُ تُحسب للعيادة التي تعرضها شاشةُ الاشتراك (auth_clinic)");
{
  const r = await pay("super", "monthly");
  check("صاحبُ عيادةٍ وحده ⇒ عيادتُه", r.order?.clinic_id === OWNER, r.order?.clinic_id);
}
{
  // صاحبُ عيادة (صفُّ نفسه) وكادرٌ بأخرى: صفّان — و0151 تفضّل غيرَ صفّ النفس.
  const r = await pay("super", "monthly", {
    memberships: [
      { user_id: OWNER, clinic_id: OWNER, status: "active", created_at: "2026-01-01" },
      { user_id: OWNER, clinic_id: CLINIC_B, status: "active", created_at: "2026-02-01" },
    ],
    authClinic: CLINIC_B,
  });
  check("عضويتان ⇒ العيادةُ التي يراها (لا حسابُه الشخصيّ)", r.order?.clinic_id === CLINIC_B, r.order?.clinic_id);
  check("  والمعاملُ المرسَل لـWayl يبدأ بها", String(r.wayl?.customParameter ?? "").startsWith(`${CLINIC_B}|`),
    r.wayl?.customParameter);
}
{
  // كادرٌ عضويتُه الوحيدة موقوفة: auth_clinic لا تراها فترجع هويّتَه.
  const r = await pay("basic", "monthly", {
    user: { id: STAFF },
    memberships: [{ user_id: STAFF, clinic_id: CLINIC_B, status: "suspended", created_at: "2026-02-01" }],
    authClinic: STAFF,
  });
  check("عضويةٌ موقوفة لا تُحسب لها دفعة", r.order?.clinic_id === STAFF, r.order?.clinic_id);
}
{
  const r = await pay("advanced", "monthly", { user: { id: OPERATOR }, memberships: [], authClinic: CLINIC_C });
  check("المشغّلُ داخلَ عيادة ⇒ العيادةُ التي دخلها", r.order?.clinic_id === CLINIC_C, r.order?.clinic_id);
}
{
  const r = await pay("super", "monthly", { authClinicErr: { message: "timeout" } });
  check("فشلُ سؤال العيادة ⇒ رفض (لا حسابَ احتياطيّ)", r.status >= 500 && r.body?.error === "clinic_unresolved", `${r.status} ${r.body?.error}`);
  check("  بلا طلبٍ ولا رابط", !r.order && !r.wayl);
}
{
  await pay("super", "monthly");
  const asked = S.rpcs.filter((c) => c.fn === "auth_clinic");
  check("auth_clinic تُسأل بهويّة الدافع (لا بمفتاح الخدمة)", asked.length === 1 && asked[0].asUser, JSON.stringify(asked));
}

console.log("▸ بلا هويّة لا شيء");
{
  const r = await pay("super", "monthly", { user: null });
  check("401 بلا طلب", r.status === 401 && !r.order && !r.wayl, `${r.status}`);
}

console.log(`\n${fails ? "✗" : "✓"} wayl-checkout: ${passes} نجح، ${fails} فشل`);
if (fails) process.exit(1);
