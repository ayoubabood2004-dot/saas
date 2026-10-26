/* ============================================================================
 * فحصُ «مَن يطلب» بالتجريبيّ (`src/lib/demoRole.ts`) — والحارسان اللذان كانا ميّتَين.
 *
 * demoCounts وdemoLots قرأتا `raw.role` من vp_session، وAuthContext.persistRaw لا يكتبه
 * أبداً (يكتب `rawRole` و`staff`) — فـ`count_needs_manager` و`lot_forbidden` لم يرفضا أحداً
 * بالتطبيق: الاستقبالُ يوافق على الجرد ويضيف دفعات. وفحصُهما بـrepo-demo-test كان يمرّ لأن
 * قالبَه **كتب المفتاحَ بيده** — هويّةٌ يضعها القالبُ بيده هويّةٌ لم تُفحص (CLAUDE.md).
 * فهنا الجلسةُ بشكل persistRaw حرفاً، ومفتاحُ وضع المدير بمفتاح managerOverride، والحكمُ من
 * الخادم لا من المرآة:
 *   • stock_count_decide (0216/0217): `auth_role() = 'manager'` — المديرُ بدوره، أو أيُّ دورٍ
 *     بمفتاحٍ حيّ (staff_elevations يجعل auth_role() «manager»)؛
 *   • lot_add / lot_edit (0217): `auth_role()` مديرٌ أو طبيب؛
 *   • والدورُ يُفحص قبل المعطيات، كالخادم.
 * ومعها: demoRole خارج حزمة الإقلاع ولا طريقَ إليها إلا من repoDemo، ومنقولةٌ لا منسوخة، ومقارنةُ
 * updateProduct التجريبية (السعر، والرصيد، وكلفةُ الشراء) بحكم السحابيّ حرفاً.
 *
 *   node scripts/demo-role-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, readdirSync, existsSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const src = (f) => readFileSync(f, "utf8");
const posix = (p) => p.split(path.sep).join("/");

/* المفاتيحُ تُقرأ من مصادرها لا تُكتب بيد: مفتاحٌ مخمَّن يفحص مخزناً غيرَ الذي يقرؤه التطبيق. */
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ demo-role-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);
const ACTIVE = keyOf("src/lib/clinics.ts", /const ACTIVE_KEY = "([^"]+)"/);
const UNTIL = keyOf("src/lib/managerOverride.ts", /const untilKey = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);
const DB_KEY = keyOf("src/lib/demoStore.ts", /const KEY = "([^"]+)"/);
const COUNTS_KEY = keyOf("src/lib/demoCounts.ts", /const KEY = "([^"]+)"/);
const LOTS_KEY = keyOf("src/lib/demoLots.ts", /const KEY = "([^"]+)"/);
const ROLE = "src/lib/demoRole.ts";

/* ---- مخزنٌ بالذاكرة مكانَ localStorage، قبل تحميل أيّ وحدة ---------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null,
  get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? {
  localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
};
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/** الجلسةُ **بشكل AuthContext.persistRaw حرفاً** (signInDemo/signInClinic، وعضويةُ موظّفٍ بـ`staff`). */
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: [rawRole === "owner" ? "owner" : "clinic"],
    clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: rawRole === "owner" ? "owner" : "clinic",
}));
/** القالبُ القديم: `role` وحده — المفتاحُ الذي لا يكتبه التطبيق. */
const legacy = (role) => mem.set(SESSION, JSON.stringify({ raw: { id: "u-" + role, full_name: "موظف " + role, role } }));
const clinic = () => mem.get(ACTIVE) || "default";
/** وضعُ المدير كما يكتبه managerOverride: وقتُ الانتهاء بمفتاح العيادة الفعّالة. */
const pinOn = (ms = 10 * 60 * 1000) => mem.set(`${UNTIL}${clinic()}`, String(Date.now() + ms));
const pinOff = () => mem.delete(`${UNTIL}${clinic()}`);

console.log("▸ ١) demoRole خارج الإقلاع وداخل قطعة repoDemo، ومنقولةٌ لا منسوخة");
{
  /* رسمُ الاستيرادات الحقيقيّ من `src/main.tsx` (مِتافايل esbuild — طريقةُ i18n-hot-guard): الإغلاقُ
   * الثابتُ هو ما يُحزم بالإقلاع، والاستيرادُ الديناميكيّ حدُّه. */
  const ROOT = process.cwd();
  const alias = {
    name: "alias-at",
    setup(b) {
      const exts = ["", ".ts", ".tsx", ".js", ".json", "/index.ts", "/index.tsx"];
      b.onResolve({ filter: /^virtual:|\?/ }, (a) => ({ path: a.path, external: true }));
      b.onResolve({ filter: /^@\// }, (a) => {
        const base = path.join(ROOT, "src", a.path.slice(2));
        for (const e of exts) if (existsSync(base + e) && statSync(base + e).isFile()) return { path: base + e };
        return undefined;
      });
      b.onResolve({ filter: /\.(css|svg|png|jpe?g|gif|webp|ico|woff2?|ttf|otf|mp3|wav|sql|wasm)$/ }, (a) => ({ path: a.path, external: true }));
    },
  };
  const res = await esbuild.build({
    absWorkingDir: ROOT, entryPoints: ["src/main.tsx"], bundle: true, splitting: true, format: "esm", platform: "browser",
    outdir: "__demo_role_test_never_written__", write: false, metafile: true, logLevel: "error",
    loader: { ".json": "json" }, define: { __BUILD_AT__: '"x"' }, jsx: "automatic", plugins: [alias],
  });
  const inputs = Object.fromEntries(Object.entries(res.metafile.inputs)
    .map(([k, v]) => [posix(k), v.imports.map((i) => ({ ...i, path: posix(i.path) }))]));
  const eager = new Set(["src/main.tsx"]);
  for (const q = ["src/main.tsx"]; q.length;) {
    for (const i of inputs[q.shift()] ?? []) {
      if (i.external || i.kind === "dynamic-import" || eager.has(i.path)) continue;
      eager.add(i.path); q.push(i.path);
    }
  }
  // حارسٌ لا يرى أسوأُ من لا حارس: الرسمُ يحمل الإقلاعَ فعلاً ويرى demoRole بين وحداته.
  check("الرسمُ يُرى: repo وApp بالإقلاع، وdemoRole بين الوحدات", eager.size >= 50 && eager.has("src/lib/repo.ts") && eager.has("src/App.tsx") && ROLE in inputs, `${eager.size} وحدة`);
  check("demoRole.ts ليست بالإغلاق الثابت لـmain.tsx", !eager.has(ROLE));
  check("  ولا repoDemo.ts (تصلها repo.ts ديناميكياً وحده)", !eager.has("src/lib/repoDemo.ts"));
  const importers = Object.entries(inputs).filter(([, imps]) => imps.some((i) => i.path === ROLE)).map(([k]) => k).sort();
  check("  ومستوردوها مرايا تجريبية كسولة وحدها", importers.length > 0 && importers.every((f) => /^src\/lib\/(repoDemo|demo[A-Z]\w*)\.ts$/.test(f) && !eager.has(f)), importers.join("، "));
  check("  ومنهم repoDemo وdemoCounts وdemoLots", ["src/lib/repoDemo.ts", "src/lib/demoCounts.ts", "src/lib/demoLots.ts"].every((f) => importers.includes(f)), importers.join("، "));

  /* ولماذا لا تكلّف main قطعةً: Rollup يضعها **داخل** قطعة repoDemo ما دام كلُّ طريقٍ إليها من main يمرّ من
   * repoDemo (demoCounts وdemoLots لا تُحمَّلان إلا منها). فإن بلغها طريقٌ آخر — وحدةٌ كسولة تُحمَّل بلا repoDemo
   * وتستوردها، كـconsumptionApi ⇢ demoConsumption — فصلها Rollup بقطعةٍ مشتركة تستوردها قطعةُ repoDemo،
   * فيدخل اسمُها سجلَّ تحميل lazyDemo داخل main (مقيسٌ ببناء vite: قطعةُ demoRole وحدها، واسمُها بقطعة repo).
   * وفحصُ «المستوردون مرايا تجريبية» فوق لا يرى هذا: demoConsumption من الأسرة اسماً. فالطريقُ يُتتبَّع ثابتاً
   * وديناميكياً معاً ولا يُدخَل repoDemo؛ وإن فشل فالتفصيلُ يسمّي الطريق: مرّره من repoDemo، أو قِس main
   * بـstore-weight-guard وقرّر. */
  const REPO_DEMO = "src/lib/repoDemo.ts";
  const via = new Map([["src/main.tsx", null]]);
  for (const q = ["src/main.tsx"]; q.length;) {
    const at = q.shift();
    for (const i of inputs[at] ?? []) {
      if (i.external || i.path === REPO_DEMO || via.has(i.path)) continue;
      via.set(i.path, { from: at, lazy: i.kind === "dynamic-import" }); q.push(i.path);
    }
  }
  const route = (f) => {
    const steps = [];
    for (let x = f; x;) { const v = via.get(x); steps.unshift((v ? (v.lazy ? " ⇢ " : " → ") : "") + x); x = v?.from ?? null; }
    return steps.join("");
  };
  // التتبّعُ يعبر الحدودَ الكسولة فعلاً (وإلا فـ«لا تُبلغ» صفرٌ بلا كلمة).
  check("  والطرقُ الكسولة تُتبَع: صفحاتٌ كسولة خارج الإقلاع تُبلغ بلا repoDemo", [...via.keys()].filter((f) => !eager.has(f)).length >= 20, `${via.size} وحدة`);
  check("  ولا طريقَ إليها من main إلا عبر repoDemo — فتبقى بقطعتها ولا يكبر سجلُّ lazyDemo بـmain", !via.has(ROLE), via.has(ROLE) ? route(ROLE) : "");

  const files = [];
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name)) files.push(posix(p));
    }
  })("src");
  for (const name of ["demoHint", "demoBaseRole", "demoPinLive", "demoUserId", "demoClinicId"]) {
    const re = new RegExp(`\\b(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=)`);
    const where = files.filter((f) => re.test(src(f)));
    check(`${name} معرَّفةٌ مرّةً واحدة — بـdemoRole.ts (نسخةٌ ثانية تنحرف بصمت)`, where.length === 1 && where[0] === ROLE, where.join("، ") || "ولا مكان");
  }
  // الشِّفرةُ لا التعليق: التعليقاتُ تسمّي المفتاحَ الميّت لتشرح لماذا مات.
  const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const dead = files.filter((f) => f.startsWith("src/lib/") && /\braw\??\.role\b/.test(code(f)));
  check("ولا وحدةَ تقرأ `raw.role` (مفتاحٌ لا يكتبه persistRaw)", dead.length === 0, dead.join("، "));
  const role = src(ROLE);
  check("demoRole تقرأ مفتاحَ الجلسة ومفتاحَ وضع المدير كما يكتبهما التطبيق",
    role.includes(`localStorage.getItem("${SESSION}")`) && role.includes("`" + UNTIL + "${getActiveClinicId()}`"));
}

console.log("▸ ٢) الجلسةُ بشكل persistRaw ⇒ الدورُ الأساس، والمفتاحُ، والمعرّف");
const roleBuilt = await esbuild.build({ entryPoints: [ROLE], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
const R = await import("data:text/javascript;base64," + Buffer.from(roleBuilt.outputFiles[0].text).toString("base64"));
{
  const cases = [
    ["بلا جلسة ⇒ صاحبُ العيادة (كباقي التجريبيّ)", () => mem.delete(SESSION), "manager"],
    ["جلسةٌ تالفة ⇒ كغيابها", () => mem.set(SESSION, "{not json"), "manager"],
    ["admin (signInClinic) ⇒ مدير", () => as("c1", "admin"), "manager"],
    ["owner ⇒ مدير", () => as("o1", "owner"), "manager"],
    ["doctor (DEMO_VET) ⇒ طبيب", () => as("v1", "doctor"), "veterinarian"],
    ["reception ⇒ استقبال", () => as("r1", "reception"), "receptionist"],
    ["عضويةُ استقبالٍ (staff.staffRole) تغلب rawRole الحساب", () => as("s1", "admin", { clinicId: "c", role: "reception", staffRole: "receptionist" }), "receptionist"],
    ["  وعضويةٌ بلا staffRole تُقرأ من staff.role", () => as("s2", "admin", { clinicId: "c", role: "doctor", staffRole: null }), "veterinarian"],
    ["المصوّر (staffRole)", () => as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" }), "photographer"],
    ["دورٌ لا يُعرف ليس مديراً", () => as("x1", "cashier?"), "unknown:cashier?"],
    ["`role` وحده (القالبُ القديم) لا يرفع أحداً — لا يكتبه التطبيق", () => legacy("admin"), "unknown:"],
  ];
  for (const [name, set, want] of cases) { set(); check(name, R.demoBaseRole() === want, R.demoBaseRole()); }

  mem.delete(ACTIVE); mem.delete(`${UNTIL}default`);
  check("بلا مفتاح وضع المدير ⇒ لا رفع", R.demoPinLive() === false);
  pinOn();
  check("مفتاحٌ حيّ للعيادة الفعّالة ⇒ رفع", R.demoPinLive() === true);
  pinOn(-1000);
  check("  ومنتهٍ ⇒ لا", R.demoPinLive() === false);
  pinOn(); mem.set(ACTIVE, "clinic-b");
  check("  ومفتاحُ عيادةٍ أخرى لا يرفع بهذه", R.demoPinLive() === false);
  pinOn();
  check("  ومفتاحُها هي يرفع", R.demoPinLive() === true);
  pinOff(); mem.delete(ACTIVE); pinOff();

  as("c9", "admin");
  check("demoUserId = raw.id (auth.uid())", R.demoUserId() === "c9");
  mem.delete(SESSION);
  check("  وبلا جلسة null", R.demoUserId() === null);
  mem.set(SESSION, "{");
  check("  وبجلسةٍ تالفة null", R.demoUserId() === null);
  /* demoClinicId = auth_clinic() بالتجريبيّ (by_owner بتقرير المستهلكات، الجولة 3): المساحةُ المشتركة كما يحسبها AuthContext — عضويةُ
   * الكادر، وإلا عيادةُ الملفّ، وإلا الحسابُ نفسُه (حسابُ العيادة معرّفُه معرّفُها) — وبلا جلسة null. */
  mem.set(SESSION, JSON.stringify({ raw: { id: "clin-1", full_name: "عيادة", email: "c@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: "clin-1" }, active: "clinic" }));
  const asClinic = R.demoClinicId();
  as("v1", "doctor");
  const asVet = R.demoClinicId();
  as("s1", "admin", { clinicId: "clin-9", role: "reception", staffRole: "receptionist" });
  const asStaff = R.demoClinicId();
  mem.set(SESSION, JSON.stringify({ raw: { id: "own-2", full_name: "حساب", email: "o@demo.vet", rawRole: "admin", roles: ["clinic"], clinic_id: null }, active: "clinic" }));
  const asOwn = R.demoClinicId();
  mem.delete(SESSION);
  const none = R.demoClinicId();
  mem.set(SESSION, "{");
  const broken = R.demoClinicId();
  check("demoClinicId: حسابُ العيادة ⇒ معرّفُه، والطبيبُ ⇒ عيادةُ ملفّه، وعضويةُ الكادر تغلب، وبلا clinic_id ⇒ الحسابُ نفسُه، وبلا جلسة أو تالفة ⇒ null",
    JSON.stringify([asClinic, asVet, asStaff, asOwn, none, broken]) === JSON.stringify(["clin-1", "clinic-happy-paws", "clin-9", "own-2", null, null]),
    JSON.stringify([asClinic, asVet, asStaff, asOwn, none, broken]));
  const h = R.demoHint("x_code", "تلميحٌ حرفاً");
  check("demoHint: الرسالةُ الرمز، وP0001، والتلميحُ حرفاً", h instanceof Error && h.message === "x_code" && h.code === "P0001" && h.hint === "تلميحٌ حرفاً");
  mem.delete(SESSION);
}

/* ---- المستودعُ الحقيقيّ بنصفه التجريبيّ (supabase = null) — طريقةُ repo-demo-test ---- */
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null;",
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: { contents: 'export * from "./src/lib/repo.ts";\nexport { consumptionApi } from "./src/lib/consumptionApi.ts";', resolveDir: process.cwd(), sourcefile: "demo-role-entry.ts", loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
// حزمةٌ بحجم ميغابايت: ملفٌّ مؤقت لا عنوانُ `data:` (يفشل استيرادُه بهذا الطول).
const dir = mkdtempSync(path.join(tmpdir(), "demo-role-"));
const file = path.join(dir, "repo.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const repo = mod.repo;
if (!repo) { console.error("✗ demo-role-test: ما انحمّل المستودع"); process.exit(1); }

const seedDb = (products) => mem.set(DB_KEY, JSON.stringify({
  products, companies: [], companySections: [], purchases: [], purchaseItems: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [],
}));
const prod = (id) => JSON.parse(mem.get(DB_KEY)).products.find((p) => p.id === id);
/** «ok» أو `الرمز|code` — الرفضُ برمز الخادم وصنفه معاً. */
const outcome = async (fn) => { try { await fn(); return "ok"; } catch (e) { return `${e.message}|${e.code ?? ""}`; } };

/* [الاسم، الجلسة، يوافق على الجرد؟، يعدّل الدفعات؟] — الحكمُ من الخادم (0216/0217 وauth_role بـ0151). */
const ROLES = [
  ["صاحبُ العيادة (admin)", () => as("c1", "admin"), true, true],
  ["owner", () => as("o1", "owner"), true, true],
  ["بلا جلسة (صاحبُ العيادة)", () => mem.delete(SESSION), true, true],
  ["الطبيب (doctor)", () => as("v1", "doctor"), false, true],
  ["طبيبٌ بعضوية (staffRole)", () => as("s2", "admin", { clinicId: "c", role: "doctor", staffRole: "veterinarian" }), false, true],
  ["الاستقبال (reception)", () => as("r1", "reception"), false, false],
  ["استقبالٌ بعضوية (staffRole)", () => as("s1", "admin", { clinicId: "c", role: "reception", staffRole: "receptionist" }), false, false],
  ["المصوّر", () => as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" }), false, false],
  ["دورٌ لا يُعرف", () => as("x1", "cashier?"), false, false],
  ["`role: admin` وحده (القالبُ القديم)", () => legacy("admin"), false, false],
  // مفتاحُ وضع المدير الحيّ: auth_role() = 'manager' أيّاً كان الأساس — والمنتهي لا شيء.
  ["الاستقبال + مفتاحُ المدير الحيّ", () => { as("r1", "reception"); pinOn(); }, true, true],
  ["الطبيب + مفتاحُ المدير الحيّ", () => { as("v1", "doctor"); pinOn(); }, true, true],
  ["الاستقبال + مفتاحٌ منتهٍ", () => { as("r1", "reception"); pinOn(-1000); }, false, false],
];

console.log("▸ ٣) count_needs_manager — موافقةُ الجرد للمدير (stock_count_decide)");
for (const [name, set, mayDecide] of ROLES) {
  pinOff(); mem.delete(SESSION); mem.delete(COUNTS_KEY); mem.delete(LOTS_KEY);
  seedDb([{ id: "k1", name: "جرد", barcode: null, stock: 10, purchase_price: 100 }]);
  // أيُّ موظّفٍ يعدّ (stock_count_submit بلا حارس دور) — والقرارُ وحده للمدير.
  await repo.submitStockCount([{ product_id: "k1", counted: 7, reason: "damaged" }]);
  const ids = (await repo.listStockCounts({ pending: true })).map((c) => c.id);
  set();
  const got = await outcome(() => repo.decideStockCounts(ids, true));
  pinOff();
  const left = (await repo.listStockCounts({ pending: true })).length;
  if (mayDecide) check(`${name}: يوافق — والفرقُ يُطبَّق (١٠ ⇒ ٧)`, got === "ok" && prod("k1").stock === 7 && left === 0, `${got} | ${prod("k1").stock} | ${left}`);
  else check(`${name}: count_needs_manager (P0001) — والرصيدُ والمعلَّقُ كما هما`, got === "count_needs_manager|P0001" && prod("k1").stock === 10 && left === 1, `${got} | ${prod("k1").stock} | ${left}`);
}
{
  pinOff(); as("r1", "reception");
  const ids = (await repo.listStockCounts({ pending: true })).map((c) => c.id);
  check("والرفضُ كالموافقة: الاستقبالُ لا يرفض جرداً معلَّقاً", ids.length === 1 && (await outcome(() => repo.decideStockCounts(ids, false))) === "count_needs_manager|P0001"
    && (await repo.listStockCounts({ pending: true })).length === 1);
  check("الدورُ قبل المعطيات (كالخادم): الاستقبالُ بلا سطور ⇒ count_needs_manager لا count_nothing", (await outcome(() => repo.decideStockCounts([], true))) === "count_needs_manager|P0001");
  as("c1", "admin");
  check("  والمديرُ بلا سطور ⇒ count_nothing", (await outcome(() => repo.decideStockCounts([], true))) === "count_nothing|P0001");
  mem.delete(SESSION);
}

console.log("▸ ٤) lot_forbidden — الدفعاتُ للمدير والطبيب (lot_add / lot_edit)");
for (const [name, set, , mayLots] of ROLES) {
  pinOff(); mem.delete(SESSION); mem.delete(COUNTS_KEY); mem.delete(LOTS_KEY);
  seedDb([{ id: "l1", name: "دفعات", barcode: null, stock: 10, purchase_price: 100, expiry_date: "2099-01-31" }]);
  const opening = (await repo.listProductLots("l1")).find((l) => l.qty > 0); // القراءةُ بلا حارس دور
  set();
  const add = await outcome(() => repo.addLot("l1", 5, "2099-06-30", null));
  const edit = await outcome(() => repo.editLot(opening.id, "2099-03-31"));
  pinOff();
  const lots = await repo.listProductLots("l1");
  const o = lots.find((l) => l.id === opening.id);
  if (mayLots) check(`${name}: يضيف ويعدّل — الرصيدُ ١٥ والتاريخُ تغيّر`, add === "ok" && edit === "ok" && prod("l1").stock === 15 && o?.expiry_date === "2099-03-31",
    `${add} | ${edit} | ${prod("l1").stock} | ${o?.expiry_date}`);
  else check(`${name}: lot_forbidden (P0001) بالفعلين — الرصيدُ ١٠ والدفعةُ كما هي`, add === "lot_forbidden|P0001" && edit === "lot_forbidden|P0001"
    && prod("l1").stock === 10 && lots.length === 1 && o?.expiry_date === "2099-01-31", `${add} | ${edit} | ${prod("l1").stock} | ${lots.length} | ${o?.expiry_date}`);
}
{
  pinOff(); as("r1", "reception");
  check("الدورُ قبل المعطيات: الاستقبالُ بكميةٍ صفر ⇒ lot_forbidden لا lot_bad_qty", (await outcome(() => repo.addLot("l1", 0, null))) === "lot_forbidden|P0001");
  as("v1", "doctor");
  check("  والطبيبُ بكميةٍ صفر ⇒ lot_bad_qty", (await outcome(() => repo.addLot("l1", 0, null))) === "lot_bad_qty|P0001");
  mem.delete(SESSION);
}

console.log("▸ ٥) updateProduct بالمقارنة ثمّ التبديل — السعرُ والرصيدُ وكلفةُ الشراء بحكم السحابيّ");
{
  pinOff(); mem.delete(SESSION);
  seedDb([
    { id: "u1", name: "مقارنة", barcode: null, stock: 5, purchase_price: 1000, sell_price: 2000 },
    { id: "u2", name: "عجز", barcode: null, stock: -0.25, purchase_price: 300, sell_price: 500 },
    { id: "u3", name: "بلا كلفة", barcode: null, stock: 2, sell_price: 900 },
    { id: "u4", name: "رصيدٌ نصّاً", barcode: null, stock: "5", purchase_price: 10, sell_price: 20 },
  ]);
  const MOVED = "price_moved|price_moved";
  check("الرصيدُ كما رآه النموذج ⇒ يُكتب", (await outcome(() => repo.updateProduct("u1", { stock: 7 }, { stock: 5 }))) === "ok" && prod("u1").stock === 7);
  check("  ورصيدٌ تغيّر بعد فتح النموذج (بيعٌ أو شراء) ⇒ price_moved ولا يُكتب", (await outcome(() => repo.updateProduct("u1", { stock: 9 }, { stock: 5 }))) === MOVED && prod("u1").stock === 7);
  check("كلفةُ الشراء كما رآها ⇒ تُكتب", (await outcome(() => repo.updateProduct("u1", { purchase_price: 1200 }, { purchase_price: 1000 }))) === "ok" && prod("u1").purchase_price === 1200);
  check("  وكلفةٌ تغيّرت بعد فتح النموذج ⇒ price_moved ولا تُكتب", (await outcome(() => repo.updateProduct("u1", { purchase_price: 1500 }, { purchase_price: 1000 }))) === MOVED && prod("u1").purchase_price === 1200);
  check("مفتاحٌ واحدٌ بائت بين عدّة ⇒ لا شيءَ يُكتب (لا نصفَ حفظ)",
    (await outcome(() => repo.updateProduct("u1", { stock: 1, purchase_price: 1, sell_price: 1 }, { stock: 7, purchase_price: 1200, sell_price: 1999 }))) === MOVED
      && prod("u1").stock === 7 && prod("u1").purchase_price === 1200 && prod("u1").sell_price === 2000, JSON.stringify(prod("u1")));
  check("  والسعرُ كما كان: sell_price بائت ⇒ price_moved", (await outcome(() => repo.updateProduct("u1", { sell_price: 2500 }, { sell_price: 1500 }))) === MOVED && prod("u1").sell_price === 2000);
  check("عجزٌ لم يتغيّر يُقارَن كما هو (−٠٫٢٥) ⇒ يُكتب", (await outcome(() => repo.updateProduct("u2", { stock: 4 }, { stock: -0.25 }))) === "ok" && prod("u2").stock === 4);
  seedDb([{ id: "u2", name: "عجز", barcode: null, stock: -0.25, purchase_price: 300, sell_price: 500 }, { id: "u3", name: "بلا كلفة", barcode: null, stock: 2, sell_price: 900 },
    { id: "u4", name: "رصيدٌ نصّاً", barcode: null, stock: "5", purchase_price: 10, sell_price: 20 }]);
  check("  والعجزُ ليس صفراً: توقُّعُ ٠ على −٠٫٢٥ ⇒ price_moved", (await outcome(() => repo.updateProduct("u2", { stock: 4 }, { stock: 0 }))) === MOVED && prod("u2").stock === -0.25);
  check("كلفةٌ غائبة = null كالسحابيّ (`row[k] == null ⇒ null`): توقُّعُ ٠ ⇒ price_moved",
    (await outcome(() => repo.updateProduct("u3", { purchase_price: 50 }, { purchase_price: 0 }))) === MOVED && prod("u3").purchase_price === undefined);
  check("  وتوقُّعُ null ⇒ يُكتب", (await outcome(() => repo.updateProduct("u3", { purchase_price: 50 }, { purchase_price: null }))) === "ok" && prod("u3").purchase_price === 50);
  check("القيمةُ عدداً كالسحابيّ (`Number(row[k])`): رصيدٌ مخزَّنٌ نصّاً «5» يطابق 5", (await outcome(() => repo.updateProduct("u4", { stock: 6 }, { stock: 5 }))) === "ok" && prod("u4").stock === 6);
  seedDb([{ id: "u4", name: "رصيدٌ نصّاً", barcode: null, stock: "5", purchase_price: 10, sell_price: 20 }]);
  check("  والطرفان من الدالّة نفسها: نموذجٌ قرأ «5» نصّاً وأرسله توقّعاً يطابق (تطبيعُ طرفٍ واحد يرفضه)",
    (await outcome(() => repo.updateProduct("u4", { stock: 6 }, { stock: "5" }))) === "ok" && prod("u4").stock === 6);
  // المرآةُ تقلّد حكماً قائماً بالسحابيّ — إن تغيّر هناك (تسامحٌ، تقريب) فهنا يُعاد معه.
  check("وحكمُ السحابيّ الذي تقلّده ما زال: `Number(row[k])` والغائبُ null بلا تسامح، ثمّ priceMoved",
    /\(row\[k\] == null \? null : Number\(row\[k\]\)\) !== \(v \?\? null\)\)\) throw priceMoved\(\);/.test(src("src/lib/repo.ts")));
}

/* ٦) 0254/0255 — الحكمُ من الخادم: stock_waste_submit يكتبه أيُّ موظف، و«سجّل وطبّق» (p_apply) لـ`auth_role() = 'manager'` وحده
 * (waste_needs_manager)؛ وproduct_cost_reset للمدير وحده (cost_reset_forbidden) — والمفتاحُ الحيّ يجعل الاستقبالَ مديراً بهما؛
 * والمصوّرُ تردّه البوّابة (api_gate، photographer_forbidden 42501) قبل الدالّتين. الدورُ قبل المعطيات. */
console.log("▸ ٦) سندُ التلف وتصحيحُ المتوسّط (0254/0255): «طبّق فوراً» والتصحيحُ للمدير، والتسجيلُ لأيّ موظف، والمصوّرُ تردّه البوّابة");
const api = mod.consumptionApi;
for (const [name, set, mgr] of ROLES) {
  pinOff(); mem.delete(SESSION); mem.delete(COUNTS_KEY); mem.delete(LOTS_KEY);
  seedDb([{ id: "w1", name: "تلف أ", barcode: null, stock: 10, purchase_price: 100 }, { id: "w2", name: "تلف ب", barcode: null, stock: 10, purchase_price: 100 }]);
  const line = (pid) => [{ product_id: pid, qty: 1, unit: "stock", reason: "damaged", note: "وگعت" }];
  set();
  const sub = await outcome(() => api.submitWaste(line("w1"), false, "dr-sub"));
  const app = await outcome(() => api.submitWaste(line("w2"), true, "dr-app"));
  const cr = await outcome(() => api.productCostReset("w1", 50));
  pinOff();
  const pho = name === "المصوّر";
  const want = pho ? ["photographer_forbidden|42501", "photographer_forbidden|42501", "photographer_forbidden|42501"]
    : [`ok`, mgr ? "ok" : "waste_needs_manager|P0001", mgr ? "ok" : "cost_reset_forbidden|P0001"];
  const stock2 = prod("w2").stock, avg1 = prod("w1").avg_cost ?? null;
  check(`${name}: تسجيلٌ ${want[0]}، و«طبّق» ${want[1]}، والتصحيحُ ${want[2]} — والرصيدُ والمتوسّطُ بحسبها`,
    sub === want[0] && app === want[1] && cr === want[2] && stock2 === (want[1] === "ok" ? 9 : 10) && avg1 === (want[2] === "ok" ? 50 : null),
    `${sub} | ${app} | ${cr} | ${stock2} | ${avg1}`);
}

console.log(`\n${fails ? "✗" : "✓"} demo-role-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
