/* ============================================================================
 * التسجيلُ الذاتيّ بلا ثغرة (٢٥/١٠) — الثغراتُ التي يمسكها هذا الفحص:
 *
 *   F1  رابطُ تأكيدٍ منتهٍ يُرجعه Supabase إلى الجذر بـ`#error_code=otp_expired` — كان يهبط على
 *       الصفحة الرئيسية بلا كلمة. البوّابةُ بـindex.html تحوّله لصفحة الدخول، ولا تمسّ رمزَ دخولٍ ناجح.
 *   F4  أخطاءُ Supabase بالإنكليزية خاماً — كلُّها تمرّ الآن من مترجمٍ واحد، والثواني تصير عدّاداً.
 *   F10 رقمٌ «+964 0770…» ليس E.164 فلا يصله رمز.
 *   F13 `?next=` لا يقبل إلا مساراً داخلياً — لا رابطَ لموقعٍ آخر.
 *   F15 بذرُ دولة التسجيل كان يسبق قراءةَ إعدادات الخادم بجهازٍ جديد، فيرى «بلا عملة» ويكتب عملةَ
 *       التسجيل فوق ما اختارته العيادة. القالبُ هنا جهازٌ جديدٌ فعلاً (تخزينٌ فارغ، ومفتاحُ المالك
 *       "default" كالإنتاج) وصفٌّ بالخادم — لا قالبٌ يضع الحالَ بيده.
 *   F19 اسمُ العيادة يُبذر لـclinic_name ولا يدهس اسماً موجوداً.
 *
 *   node scripts/signup-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* تخزينٌ محلّيٌّ بذاكرة — يُفرَّغ بين الحالات كجهازٍ جديد. */
const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => { store.set(k, String(v)); },
  removeItem: (k) => { store.delete(k); },
  key: (i) => [...store.keys()][i] ?? null,
  get length() { return store.size; },
};
Object.defineProperty(globalThis.localStorage, "__keys", { value: () => [...store.keys()] });

async function load(entry, stubs = {}) {
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    alias: { "@": "./src" },
    plugins: [{
      name: "stubs",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => (a.path in stubs ? { path: a.path, namespace: "stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "signup-"));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  try { return await import(pathToFileURL(f).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

const AR = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const EN = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));
const has = (d, key) => key.split(".").reduce((o, k) => (o && typeof o === "object" ? o[k] : undefined), d) !== undefined;

/* ════════════════════ F4 — مترجمُ أخطاء المصادقة ════════════════════ */
const A = await load("src/lib/authErrors.ts");
console.log("▸ أخطاءُ Supabase بكلامٍ يُفهم (F4)");
const CASES = [
  ["For security purposes, you can only request this after 47 seconds.", undefined, "signup.err.rateWait", "wait"],
  ["Email rate limit exceeded", "over_email_send_rate_limit", "signup.err.emailBusy"],
  ["Request rate limit reached", "over_request_rate_limit", "signup.err.rateLimit"],
  ["Password should be at least 8 characters.", "weak_password", "signup.err.pwShort"],
  ["Password is known to be weak and easy to guess, please choose a different one.", "weak_password", "signup.err.pwLeaked"],
  ["New password should be different from the old password.", "same_password", "signup.err.samePw"],
  ["Unable to validate email address: invalid format", "validation_failed", "signup.err.invalidEmail"],
  ["User already registered", "user_already_exists", "signup.err.generic", "exists"],
  ["Email not confirmed", "email_not_confirmed", "signup.err.notConfirmed", "notConfirmed"],
  ["Invalid login credentials", "invalid_credentials", "auth.invalidCreds", "invalidCreds"],
  ["Signups not allowed for this instance", "signup_disabled", "signup.err.signupsOff"],
  ["timeout", undefined, "signup.err.timeout"],
  ["Failed to fetch", undefined, "signup.err.network"],
  ["Database error saving new user", "unexpected_failure", "signup.err.server"],
  ["something nobody expected", undefined, "signup.err.generic"],
];
for (const [msg, code, key, kind] of CASES) {
  const e = A.authErr(msg, code);
  check(`«${msg.slice(0, 44)}» ⇒ ${key}${kind ? ` (${kind})` : ""}`, e.key === key && (kind ? e.kind === kind : true), JSON.stringify(e));
}
const w = A.authErr("For security purposes, you can only request this after 47 seconds.");
check("  والثواني رقمٌ يُعدّ لا جملة", w.seconds === 47 && w.vars?.s === "47");
check("  وطولُ كلمة السرّ من نصّ الخادم", A.authErr("Password should be at least 10 characters", "weak_password").vars?.n === "10");
check("بالرمز وحده بلا نصّ", A.authErr("", "over_email_send_rate_limit").key === "signup.err.emailBusy");
const allKeys = new Set(CASES.map((c) => c[2]));
for (const k of allKeys) check(`  المفتاح ${k} بالقاموسين`, has(AR, k) && has(EN, k));

console.log("▸ خطأُ البريد الإملائيّ وزرُّ صندوقه");
check("gmial.com ⇒ gmail.com", A.emailTypo("dr.ali@gmial.com") === "dr.ali@gmail.com");
check("  ونطاقٌ صحيح لا يُقترح له شيء", A.emailTypo("dr.ali@gmail.com") === null && A.emailTypo("x@clinic.iq") === null);
check("Gmail ⇒ بحثٌ عن رسالتنا", A.inboxFor("a@gmail.com")?.app === "Gmail" && /search/.test(A.inboxFor("a@gmail.com").url));
check("Hotmail ⇒ Outlook", A.inboxFor("a@hotmail.com")?.app === "Outlook");
check("نطاقٌ مجهول ⇒ لا زرّ", A.inboxFor("a@clinic.iq") === null);

console.log("▸ رقمُ الرمز بصيغة E.164 (F10)");
check("+964 07701234567 ⇒ +9647701234567", A.e164("+964 07701234567") === "+9647701234567");
check("+966 0501234567 ⇒ +966501234567", A.e164("+966 0501234567") === "+966501234567");
check("فراغاتٌ وشرطاتٌ تُشال", A.e164("+20 010-1234-5678") === "+201012345678");

/* ════════════════════ F13 — next ════════════════════ */
console.log("▸ `?next=` مسارٌ داخليٌّ وحده (F13)");
const N = await load("src/lib/authNext.ts");
const nextOf = (search) => { globalThis.window = { location: { search } }; return N.safeNext(); };
check("/join?code=VET-1 مقبول", nextOf("?next=%2Fjoin%3Fcode%3DVET-1") === "/join?code=VET-1");
check("//evil.com مرفوض", nextOf("?next=%2F%2Fevil.com") === null);
check("https://evil.com مرفوض", nextOf("?next=https%3A%2F%2Fevil.com") === null);
check("javascript: مرفوض", nextOf("?next=javascript%3Aalert(1)") === null);
check("بلا next ⇒ null", nextOf("") === null);
store.clear();
N.rememberJoinCode("VET-42");
check("رمزُ الدعوة يُحفظ ويُقرأ بلا أثر", N.peekJoinCode() === "VET-42" && N.peekJoinCode() === "VET-42");
N.forgetJoinCode();
check("  ويُمسح حين تستلمه الدعوة", N.peekJoinCode() === null);
store.set("vp_join_code", JSON.stringify({ code: "OLD", at: Date.now() - 7 * 3_600_000 }));
check("  ورمزٌ عمرُه سبعُ ساعات لا يُرجِع أحداً لدعوته", N.peekJoinCode() === null);

/* ════════════════════ F1 — بوّابةُ index.html ════════════════════ */
console.log("▸ رابطٌ منتهٍ لا يهبط على الصفحة الرئيسية (F1)");
const html = readFileSync("index.html", "utf8");
const door = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]).find((s) => /error_code/.test(s));
check("البوّابةُ موجودةٌ بالرأس", !!door);
/** جهازٌ يُحاكى كما هو: تخزينٌ (فيه جلسةٌ أو لا)، ومنطقةٌ زمنية، ولغةُ متصفّح، واسمُ مضيف. */
const runDoor = (pathname, search, hash, dev = {}) => {
  let to = null;
  const kv = new Map(Object.entries(dev.storage ?? {}));
  const ls = { get length() { return kv.size; }, key: (i) => [...kv.keys()][i] ?? null, getItem: (k) => (kv.has(k) ? kv.get(k) : null) };
  const matchMedia = (q) => ({ matches: q === "(display-mode: standalone)" && !!dev.standalone });
  vm.runInNewContext(door, {
    location: { pathname, search, hash, hostname: dev.host ?? "www.doctorvet.vet", replace: (u) => { to = u; } },
    localStorage: ls,
    navigator: { languages: dev.langs ?? ["ar"], language: (dev.langs ?? ["ar"])[0], onLine: !dev.offline },
    Intl: { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: dev.tz ?? "UTC" }) }) },
    window: { matchMedia },
    matchMedia,
  });
  return to;
};
check("#error_code=otp_expired ⇒ /login?auth_error=otp_expired",
  runDoor("/", "", "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid") === "/login?auth_error=otp_expired");
check("  ورابطُ استعادةٍ منتهٍ على /login كذلك", runDoor("/login", "", "#error=access_denied&error_code=otp_expired") === "/login?auth_error=otp_expired");
check("  والخطأُ بالاستعلام كذلك", runDoor("/", "?error=access_denied&error_code=flow_state_expired", "") === "/login?auth_error=flow_state_expired");
check("رمزُ دخولٍ ناجح (#access_token) لا يُمسّ", runDoor("/", "", "#access_token=abc&refresh_token=def&type=signup") === null);
check("ولا حلقة: auth_error موجودٌ ⇒ لا تحويل", runDoor("/login", "?auth_error=otp_expired", "#error_code=otp_expired") === null);
check("ولا شيء بلا خطأ", runDoor("/inventory", "?tab=x", "") === null);
check("  ورمزٌ غريبٌ بالخطأ لا يُحقن", !/script/.test(String(runDoor("/", "", "#error_code=<script>"))));

console.log("▸ الزائرُ على الجذر يذهب لنسخة بلده — وصاحبُ الحساب يبقى بالتطبيق");
check("بغداد بمتصفّحٍ إنكليزيّ ⇒ /iq (المنطقةُ الزمنية قبل اللغة)", runDoor("/", "", "", { tz: "Asia/Baghdad", langs: ["en-US", "en"] }) === "/iq");
check("الرياض ⇒ /sa", runDoor("/", "", "", { tz: "Asia/Riyadh" }) === "/sa");
check("القاهرة ⇒ /eg، والاستعلامُ يبقى", runDoor("/", "?utm_source=wa", "", { tz: "Africa/Cairo" }) === "/eg?utm_source=wa");
check("بلا منطقةٍ عربية ولغةُ ar-JO ⇒ /jo", runDoor("/", "", "", { tz: "Europe/Berlin", langs: ["ar-JO"] }) === "/jo");
check("لندن بالإنكليزية ⇒ /en", runDoor("/", "", "", { tz: "Europe/London", langs: ["en-GB"] }) === "/en");
check("لا شيء يدلّ ⇒ /iq (السوقُ الأوّل)", runDoor("/", "", "", { tz: "UTC", langs: ["ar"] }) === "/iq");
check("اختيارٌ محفوظ يغلب التخمين", runDoor("/", "", "", { tz: "Asia/Riyadh", storage: { dv_edition: "kw" } }) === "/kw");
check("  واختيارٌ تالف لا يُتّبع", runDoor("/", "", "", { tz: "Asia/Riyadh", storage: { dv_edition: "../x" } }) === "/sa");
check("جلسةُ Supabase بالجهاز ⇒ يبقى بالتطبيق", runDoor("/", "", "", { tz: "Asia/Riyadh", storage: { "sb-brydcepzrckstddcuuou-auth-token": "{}" } }) === null);
check("  والجلسةُ التجريبية كذلك", runDoor("/", "", "", { storage: { vp_session: "{}" } }) === null);
check("نطاقُ app. لا يُحوَّل", runDoor("/", "", "", { host: "app.doctorvet.vet", tz: "Asia/Riyadh" }) === null);
check("رابطُ PKCE (?code=) لا يُمسّ", runDoor("/", "?code=abc", "", { tz: "Asia/Riyadh" }) === null);
check("ومساراتُ التطبيق لا تُمسّ", runDoor("/reception", "", "", { tz: "Asia/Riyadh" }) === null);

/* ما تبنيه البوّابةُ يجب أن يتركه العاملُ الخدميّ للخادم — باستعلامه (fbclid، utm). كان `(\/|$)` لا يطابق
 * `/sa?fbclid=…` فخدم العاملُ قشرةَ التطبيق، ونقلتها `*` إلى «/» فالعراق (تدقيقٌ عدائيّ). */
const { SITE_EDITIONS, SITE_PATHS } = await import(pathToFileURL("scripts/site-paths.mjs").href);
const doorEds = (/var E = "([a-z ]+)"/.exec(door) ?? [])[1]?.split(" ") ?? [];
check("قائمةُ البوّابة = قائمةُ مسارات الموقع", doorEds.join() === SITE_EDITIONS.join(), doorEds.join());
for (const [tz, q] of [["Asia/Riyadh", "?fbclid=IwAR0"], ["Africa/Cairo", "?utm_source=wa"], ["Asia/Baghdad", ""]]) {
  const to = runDoor("/", q, "", { tz });
  check(`  ${to} لا يخدمه العاملُ من قشرة التطبيق`, !!to && SITE_PATHS.test(to));
}
check("  ولا تبتلع القائمةُ مساراً للتطبيق", !["/sales", "/subscribe?x=1", "/login", "/", "/eng", "/s/x"].some((p) => SITE_PATHS.test(p)));
const app = readFileSync("src/App.tsx", "utf8");
// جلسةٌ لم تُحسم أو رابطُ تأكيدٍ يُتحقَّق منه: انتظارٌ بالمكان — لا صفحةُ الدخول (تنظيفُها يمسح الجلسةَ التي
// تُحفظ للتوّ، مقيسٌ بمتصفّح) ولا الموقع. والانتظارُ نفسُه لا ينتقل للدخول وحده.
check("جلسةٌ محفوظةٌ لم تُحسم ورابطُ تأكيدٍ يُتحقَّق منه: ينتظران بالمكان (لا الدخول ولا الموقع)",
  /if \(hasStoredSession\(\) \|\| isAuthCallback\(\)\) return <AwaitAuth \/>;[\s\S]{0,600}?return <ToSite \/>;/.test(app)
  && app.includes('/access_token|refresh_token|[?&](code|token_hash|type)=/.test(window.location.hash + window.location.search)')
  && door.includes("/access_token|refresh_token|[?&](code|token_hash|type)=/.test(l.hash + l.search)"));
const awaitAuth = app.slice(app.indexOf("function AwaitAuth"), app.indexOf("function AwaitAuth") + 1400);
check("  والانتظارُ لا ينتقل لصفحة الدخول وحده (زرّان بيد المستخدم)", awaitAuth.length > 100 && !/<Navigate/.test(awaitAuth) && /href="\/login"/.test(awaitAuth));
check("التطبيقُ المثبَّت لا يُحوَّل للموقع (الموقعُ خارجه)", runDoor("/", "", "", { tz: "Asia/Riyadh", standalone: true }) === null);
check("  ولا جهازٌ بلا نت (الموقعُ لا يُخبَّأ — صفحةُ خطأ المتصفّح)", runDoor("/", "", "", { tz: "Asia/Riyadh", offline: true }) === null);
check("  وفي التطبيق: المثبَّتُ وبلا نت (بلا جلسة) إلى الدخول لا الموقع", /if \(isInstalledOrOffline\(\)\) return <Navigate to="\/login" replace \/>;\s*return <ToSite \/>;/.test(app));
check("  والموقعُ يُختار بالبوّابة نفسها (إعادةُ «/») وبكاسر حلقة", /window\.location\.replace\(`\/\$\{window\.location\.search\}`\)/.test(app) && /dv_to_site/.test(app) && !/getItem\("dv_edition"\)/.test(app));

/* ════════════════════ F15 / F19 — بذرُ دولة التسجيل ════════════════════ */
console.log("▸ بذرُ الدولة ينتظر قراءةَ الخادم (F15)");
const sbStub = `
  const resets = [];
  export const sb = () => globalThis.__client;
  export const cloudWrite = (fn) => { void fn(); };
  export const registerHydrator = () => {};
  export const registerReset = (f) => { resets.push(f); };
  export const seedOwnClinic = async (run) => { await run(); return true; };
  globalThis.__resetAll = () => resets.forEach((f) => f());
`;
const S = await load("src/lib/settings.ts", {
  "./clinicSync": sbStub,
  "./clinics": `export const getActiveClinicId = () => "default";`,
  "./storeLib": `export const productImageUrl = (x) => x;`,
  "./cageLayout": `export const parseLayout = () => null; export const flatRooms = () => [];`,
});
function clientWith(row, fail = false) {
  const writes = [];
  return {
    writes,
    from: () => ({
      select: () => ({ maybeSingle: async () => (fail ? { data: null, error: { message: "offline" } } : { data: row, error: null }) }),
      upsert: async (patch) => { writes.push(patch); return { error: null }; },
    }),
  };
}
function freshDevice(client) { store.clear(); globalThis.__resetAll(); globalThis.__client = client; }

// (أ) جهازٌ جديد لعيادةٍ اختارت الدولار بالإعدادات بعد تسجيلها بالسعودية
let c = clientWith({ currency: "USD", country: "US", dial_code: "+1", clinic_name: "عيادة الرحمة" });
freshDevice(c);
check("قبل قراءة الخادم: البذرُ يرفض ولا يكتب", S.seedClinicLocale("SA", "SAR", "عيادة الرحمة") === false && c.writes.length === 0);
await S.hydrateClinicPrefs();
check("  بعدها: «محسومة العملة» — لا كتابة", S.seedClinicLocale("SA", "SAR", "عيادة الرحمة") === true && c.writes.length === 0);
check("  والعملةُ ما اختارته العيادة لا عملةُ التسجيل", S.getCurrencyCode() === "USD", S.getCurrencyCode());

// (ب) عيادةٌ جديدةٌ فعلاً: صفُّها بلا عملة
c = clientWith({ currency: null, country: null, dial_code: "+964", clinic_name: "" });
freshDevice(c);
await S.hydrateClinicPrefs();
check("عيادةٌ بلا عملةٍ بالخادم: البذرُ يكتب", S.seedClinicLocale("SA", "SAR", "عيادة الرحمة") === true);
const seeded = c.writes.find((p) => p.currency);
check("  العملةُ والدولةُ ومفتاحُ الهاتف من الدولة", seeded?.currency === "SAR" && seeded?.country === "SA" && seeded?.dial_code === "+966", JSON.stringify(seeded));
check("  واسمُ العيادة لـclinic_name (F19)", seeded?.clinic_name === "عيادة الرحمة", JSON.stringify(seeded));

// (ج) اسمٌ موجودٌ لا يُدهس
c = clientWith({ currency: null, country: null, dial_code: "+964", clinic_name: "الاسم الذي كتبوه" });
freshDevice(c);
await S.hydrateClinicPrefs();
S.seedClinicLocale("SA", "SAR", "اسم التسجيل");
check("اسمٌ موجودٌ بالخادم لا يدهسه اسمُ التسجيل", !c.writes.some((p) => "clinic_name" in p), JSON.stringify(c.writes));

// (د) القراءةُ فشلت (شبكة) ⇒ لا حكمَ على «بلا عملة»
c = clientWith(null, true);
freshDevice(c);
await S.hydrateClinicPrefs();
check("قراءةٌ فاشلة: البذرُ يرفض ولا يكتب", S.seedClinicLocale("SA", "SAR", "x") === false && c.writes.length === 0);

// (هـ) العودةُ لعيادةٍ أخرى بالجهاز نفسه تعيد القفل
c = clientWith({ currency: null });
freshDevice(c);
await S.hydrateClinicPrefs();
globalThis.__resetAll();
check("تبديلُ العيادة يعيد القفل حتى تُقرأ من جديد", S.seedClinicLocale("SA", "SAR", "x") === false);

/* ════════════════════ دبابيس على AuthContext (شِفرةُ إقلاعٍ لا تُحزم هنا) ════════════════════ */
console.log("▸ دبابيس: البذرُ بعد القراءة، وباسم صاحبه، وبعيادته");
const auth = readFileSync("src/contexts/AuthContext.tsx", "utf8");
check("البذرُ يُنادى بعد hydrateClinicConfig لا بموازاته", /hydrateClinicConfig\(key\)\.then\(applyFontScale\) : Promise\.resolve\(\)\)\.then\(\(\) => raw && seedSignupLocale\(raw\)\)/.test(auth));
check("لا بذرَ لغير عيادته (مشغّلٌ داخل عيادة زبون، كادرٌ بعيادة غيره)", /if \(isSupabaseConfigured && !raw\.own_clinic\) return;/.test(auth));
check("المعلَّقُ المحلّيّ باسم صاحبه", /pend\.uid === raw\.id/.test(auth) && /uid: data\.user\?\.id/.test(auth));
check("ولا يُمسح معلَّقُ غيره", /&& mine\) \{\s*try \{ localStorage\.removeItem\(PENDING_LOCALE_KEY\)/.test(auth));
check("البياناتُ الوصفية لمستخدم الجلسة نفسه فقط", /u\?\.id === raw\.id \? u\.user_metadata/.test(auth));

const login = readFileSync("src/pages/Login.tsx", "utf8");
console.log("▸ دبابيس صفحة الدخول");
check("الاستطلاعُ يسأل الجلسةَ قبل أيّ دخولٍ جديد، ولا ينتقل قبل سياق الدخول (F6)", /getSession\(\)\)\.data\.session\) \{\s*stopped = true;\s*setTimeout\(\(\) => \{ if \(window\.location\.pathname === "\/login"\) window\.location\.assign/.test(login));
check("الموظّفُ القادم من دعوة لا يسجّل عيادة (لا يظهر بدليل العيادات)", /const role: Role = portal === "clinic" && !staff \? "admin" : "owner";/.test(login));
check("إعادةُ التسجيل بختمَي الخادم لا بساعة الجهاز (F5)", /Date\.parse\(res\.confirmationSentAt\) - Date\.parse\(res\.createdAt\) > 60_000/.test(login) && !/Date\.now\(\) - Date\.parse\(res\.createdAt\)/.test(login));
check("بدايةُ القمع لنيّة تسجيلٍ جديد وحدها", /it\.portal === "clinic" && it\.signup\) track\("signup_start"/.test(login));
const pi = readFileSync("src/components/PhoneInput.tsx", "utf8");
check("حقلُ الهاتف لا يقترح رقمَ صاحب الجهاز لرقم الزبون", /autoComplete=\{autoComplete \?\? "off"\}/.test(pi));
const chkl = readFileSync("src/components/dashboard/SetupChecklist.tsx", "utf8");
check("عدُّ «جهّز عيادتك» بعيادة الخادم لا بما تُريه السياسة", /\.eq\("clinic_id", clinic\)/.test(chkl) && /expectedServerClinic\(\)/.test(chkl));
const dash = readFileSync("src/pages/Dashboard.tsx", "utf8");
check("  وبالتجربة وحدها (لا لعيادةٍ قائمة)", /subStatus === "trialing" && <SetupChecklist/.test(dash));
const cur = readFileSync("src/lib/currency.ts", "utf8");
check("تخمينُ الدولة بالمنطقة الزمنية قبل اللغة", cur.indexOf("const byTz = TZ_COUNTRY[tz]") > -1 && cur.indexOf("const byTz = TZ_COUNTRY[tz]") < cur.indexOf("navigator.languages ?? [navigator.language]"));
check("والتسجيلُ بمهلة (F7)", /new Promise<never>\(\(_, rej\) => setTimeout\(\(\) => rej\(new Error\("timeout"\)\), 20000\)\)/.test(login));
// بطاقةُ البريد وحدها: بطاقةُ رمز الهاتف تستلم نصّاً ترجمه مغلِّفا sbSendOtp/sbVerifyOtp قبلها.
const emailCard = login.slice(login.indexOf("function SupabaseAuthCard"), login.indexOf("type Intent ="));
check("لا setError(res.error) خامٌ بنداءات البريد", emailCard.length > 1000 && !/setError\(res\.error\)/.test(emailCard));
check("الدولةُ الافتراضية ليست «IQ» ثابتة (F8)", /useState\(\(\) => signupCountry\(intent\.country\)\)/.test(login));
check("الهاتفُ يتبع الدولة (F9)", /defaultCode=\{portal === "clinic" && !staff \? countryByCode\(country\)\?\.dial : undefined\}/.test(login));

/* ════════════════════ دولةُ كلّ نسخةٍ من الموقع ════════════════════ */
console.log("▸ رابطُ كلّ نسخةٍ يفتح التسجيلَ ببلده — أو «دولة أخرى»، لا العراق");
const CUR = await load("src/lib/currency.ts");
const edCountries = [...readFileSync("src/site/editions.ts", "utf8").matchAll(/E\("[a-z]{2}", "([A-Z]{2})"/g)].map((m) => m[1]);
check("  النسخُ مقروءة", edCountries.length >= 19, String(edCountries.length));
for (const cc of edCountries) {
  const got = CUR.signupCountry(cc);
  check(`  ${cc} ⇒ ${got}`, got === cc || (got === "XX" && !CUR.countryByCode(cc)), "بلدٌ معروفٌ استُبدل، أو مجهولٌ صار العراق");
}
check("  موريتانيا (لا عملةَ لها بالنظام) ⇒ دولة أخرى", CUR.signupCountry("MR") === "XX");
check("  رمزٌ عبثيّ ⇒ دولة أخرى لا العراق", CUR.signupCountry("ZZ") === "XX");
check("  الرمزُ بأحرفٍ صغيرة يُطبَّع", CUR.signupCountry("eg") === "EG");
// النسخةُ الإنكليزية تمرّر «auto»: جهازٌ لا يدلّ على بلدٍ نعرفه ⇒ «دولة أخرى»، لا العراق.
{
  // جهازٌ بطوكيو وباليابانية: لا بلدَ نعرفه (الألمانيةُ تُخمَّن «أوروبا») — فالتخمينُ فارغ، والجوابُ «دولة أخرى» بالضبط.
  const realDTF = Intl.DateTimeFormat, hadNav = "navigator" in globalThis, realNav = globalThis.navigator;
  Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: "Asia/Tokyo" }) });
  Object.defineProperty(globalThis, "navigator", { value: { languages: ["ja-JP"], language: "ja-JP" }, configurable: true, writable: true });
  try {
    check("  النسخةُ الإنكليزية من جهازٍ لا يدلّ ⇒ دولة أخرى (لا العراق)", CUR.signupCountry("auto") === "XX", CUR.signupCountry("auto"));
    check("  وبلا رابطٍ أصلاً ⇒ العراق (من يفتح /login مباشرةً)", CUR.signupCountry(null) === "IQ", CUR.signupCountry(null));
    Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: "Asia/Riyadh" }) });
    // الرابطُ الحقيقيّ كما تقرؤه صفحةُ الدخول: signupHref ⇒ تعبيرُ urlIntent نفسُه (يرفع الحالة) ⇒ signupCountry.
    const loginSrc = readFileSync("src/pages/Login.tsx", "utf8");
    const parse = /country: \(q\.get\("country"\) \|\| ""\)\.toUpperCase\(\) \|\| null/.test(loginSrc) ? (v) => (v || "").toUpperCase() || null : null;
    check("  صفحةُ الدخول تقرأ country كما يفترضه الفحص (ترفع الحالة)", !!parse);
    const enLink = new URL(`https://x${"/login?as=clinic&new=1&lang=en&country=auto&from=home"}`);
    check("  والإنكليزيةُ من الرياض عبر الرابط الحقيقيّ ⇒ السعودية", parse && CUR.signupCountry(parse(enLink.searchParams.get("country"))) === "SA", parse && CUR.signupCountry(parse(enLink.searchParams.get("country"))));
    Intl.DateTimeFormat = () => ({ resolvedOptions: () => ({ timeZone: "Asia/Baghdad" }) });
    check("  ومن بغداد ⇒ العراق", parse && CUR.signupCountry(parse("auto")) === "IQ");
  } finally {
    Intl.DateTimeFormat = realDTF;
    if (hadNav) Object.defineProperty(globalThis, "navigator", { value: realNav, configurable: true, writable: true }); else delete globalThis.navigator;
  }
}
check("  ورابطُها يحمل country=auto", /q\.set\("country", ed\.country \?\? "auto"\)/.test(readFileSync("src/site/ctx.ts", "utf8")));

console.log(`\n${fails ? "✗" : "✓"} signup: ${passes} نجح، ${fails} فشل`);
if (fails) process.exit(1);
