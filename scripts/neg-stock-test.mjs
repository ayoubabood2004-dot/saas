/* ============================================================================
 * البيعُ قبل الجرد (0266) — المالك ١١/١١: «عيادة موادها انضافت وما سوّت جرد — تريد تبيع حتى لو المخزن يدك بالسالب
 * لما تسوي جرد، بتفعيلٍ صارم من الإعدادات، وبلا أخطاء تراكمية، والإطفاءُ ما يأثّر على المخزن ولا الأرقام».
 *
 * الحقائقُ المحروسة هنا (والخادمُ بحزمة run.sh):
 *  • الرفعُ يُحكم لحظةَ الحاجة من جوابٍ حيّ: مفعّلٌ بساعة الخادم وعمرُه أقلّ من دقيقتين — جوابٌ أقدم أو مطفأ أو فاشل لا يرفع.
 *  • لا يُرفع ما رصيدُه موثوق (معدودة) ولا ما لا يُكلَّف (كلفةُ سطره بمرآة الخادم صفر) ولا المجمَّعةُ والحقلُ والدولار.
 *  • ما رفعه الوضعُ فوق رصيده يُعلَّم بسطره، وقبل البيعة يُسأل الخادمُ عنه وحده؛ والمرفوضُ يمرّ إن غطّاه رصيدُه الطازج، وإلا
 *    نافذةٌ بأسبابه و«شيل الزايد وكمّل» يقصّه لرصيده ويكمل؛ و«ما تأكّدنا» يُقفل. والإعادةُ لمرجعٍ وافق عليه بنفس السلّة لا تُسأل.
 *  • الكمّيةُ الكبيرة لسطرٍ مرفوع بما يعادل العلب؛ والعرضُ بلا «نفدت» وبإشارته؛ ولوحةُ الكمية والوزن بلا سقف.
 *  • المرآةُ التجريبية بحرّاس الخادم نفسِها (الدورُ الأساس، الإقرار، المدّة، العيادة، النهايةُ الثالثة فجراً، التمديدُ لا يقصّر،
 *    حملُ البداية وسقفُ الستّين، أسبابُ الرفض، والجردُ بما رآه العادّ).
 *  • والفحصُ ليس فارغاً: طفراتٌ معقولة تُسقط فحصاً.
 *
 *   node scripts/neg-stock-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { loadUI } from "./react-mini.mjs";

const SB_PATH = "src/components/retail/SaleBuilder.tsx";
const READ = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const J = (x) => JSON.stringify(x);
let fails = 0, passes = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passes++; console.log(`   ✓ ${name}`); } else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const DAY = 86_400_000;

/* ── البيئة ─────────────────────────────────────────────────────────────────── */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
const listeners = new Map();
globalThis.window = {
  localStorage: globalThis.localStorage, setTimeout, clearTimeout, setInterval, clearInterval, innerWidth: 1280, innerHeight: 900,
  addEventListener: (t, f) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
  removeEventListener: (t, f) => { listeners.get(t)?.delete(f); },
  dispatchEvent: (e) => { for (const f of listeners.get(e.type) ?? []) f(e); return true; },
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};
globalThis.document = globalThis.document ?? {
  activeElement: null, visibilityState: "visible", body: { style: {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { lang: "ar", dir: "rtl", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };
const flush = async () => { for (let i = 0; i < 16; i++) await new Promise((r) => setImmediate(r)); };
const realNow = Date.now;
let skew = 0;
Date.now = () => realNow() + skew;

async function importBuilt(text, tag) {
  const dir = mkdtempSync(join(tmpdir(), `neg-${tag}-`));
  const out = join(dir, "m.mjs");
  writeFileSync(out, text);
  try { return await import(pathToFileURL(out).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ══ أ) القواعدُ الصِّرفة (negStock.ts) ══════════════════════════════════════════ */
async function pureChecks(c) {
  const built = await esbuild.build({ entryPoints: ["src/lib/negStock.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
  const N = await importBuilt(built.outputFiles[0].text, "pure");
  const now = performance.now();
  const S = (o = {}) => ({ clinic: "c1", active: true, used: true, until: new Date(realNow() + 3 * DAY).toISOString(), since: null, endedAt: null, serverNow: new Date(realNow()).toISOString(), at: now, ...o });
  c("أ١ activeNow: جوابٌ مفعّلٌ حيّ يرفع، والمطفأُ والغائبُ وnull لا", N.activeNow(S(), now) && !N.activeNow(S({ active: false }), now) && !N.activeNow(S({ absent: true }), now) && !N.activeNow(null, now));
  c("  وجوابٌ عمرُه فوق دقيقتين لا يرفع (سؤالٌ فشل لا يُبقي «مفعّل» قديماً)، وعمرٌ سالبٌ (ساعةٌ رجعت) لا يرفع",
    N.activeNow(S(), now + 119_000) && !N.activeNow(S(), now + 121_000) && !N.activeNow(S({ at: now + 5000 }), now));
  c("  والنهايةُ بساعة الخادم مضافاً إليها عمرُ الجواب — لا بساعة الجهاز",
    !N.activeNow(S({ until: new Date(realNow() + 30_000).toISOString() }), now + 31_000) && N.activeNow(S({ until: new Date(realNow() + 30_000).toISOString() }), now + 29_000));
  c("  ومفعّلٌ بلا نهاية أو بلا ساعة لا يرفع", !N.activeNow(S({ until: null }), now) && !N.activeNow(S({ serverNow: null }), now));
  const counted = new Set(["pc"]);
  c("أ٢ liftable: الحيّةُ غيرُ المعدودة وحدها — لا مجمَّعة ولا حقل ولا دولار ولا معدودة",
    N.liftable({ id: "p" }, counted) && !N.liftable({ id: "p", pooled: true }, counted) && !N.liftable({ id: "p", farm_id: "f" }, counted)
    && !N.liftable({ id: "p", price_currency: "USD" }, counted) && !N.liftable({ id: "pc" }, counted) && !N.liftable(null, counted) && N.liftable({ id: "p", price_currency: "IQD" }, counted));
  c("أ٣ bigLifted: عشرُ علب، أو ما يعادلها بالمفرد، أو ٢٥ كيلو — لا عشرُ حبّاتٍ من علبة مئة",
    N.bigLifted(10, {}) && !N.bigLifted(9, {}) && !N.bigLifted(10, { sub: true, unitsPerBox: 100 }) && N.bigLifted(1000, { sub: true, unitsPerBox: 100 })
    && !N.bigLifted(24, { byWeight: true }) && N.bigLifted(25, { byWeight: true }) && N.bigLifted(10, { sub: true, unitsPerBox: 0 }));
  const until = "2026-11-20T00:00:00.000Z";
  c("أ٤ lastDayOf: آخرُ يومٍ كامل قبل الثالثة فجراً ببغداد", N.lastDayOf(until).toISOString() === "2026-11-18T21:00:00.000Z");
  c("  وdaysLeft بساعة الخادم المصحَّحة بالعمر (يومٌ وساعة ⇒ ٢، وانقضت ⇒ ٠)",
    N.daysLeft(S({ until: new Date(realNow() + DAY + 3600_000).toISOString() }), now) === 2 && N.daysLeft(S({ until: new Date(realNow() + 1000).toISOString() }), now + 2000) === 0);
  c("أ٥ isNegativeRow بتعريف _neg_stock_counts: الحيّةُ تحت الصفر وحدها",
    N.isNegativeRow({ id: "a", stock: -0.5 }) && !N.isNegativeRow({ id: "a", stock: 0 }) && !N.isNegativeRow({ id: "a", stock: -1, pooled: true }) && !N.isNegativeRow({ id: "a", stock: -1, price_currency: "USD" }));
  const thrown = (f) => { try { f(); return null; } catch (e) { return e.code ?? e.message; } };
  c("أ٦ readNegState: جوابٌ مكسور يرمي — لا يصير «مطفأ» ولا «مفعّل» بصمت؛ ومفعّلٌ بلا نهاية أو ساعة يرمي",
    thrown(() => N.readNegState(null, 0)) === "neg_shape" && thrown(() => N.readNegState({ active: "yes" }, 0)) === "neg_shape"
    && thrown(() => N.readNegState({ active: true, until: null, now: "x" }, 0)) === "neg_shape"
    && N.readNegState({ active: false, used: true, clinic_id: "c1" }, 7).used === true && N.readNegState({ active: false }, 7).at === 7);
  const ch = N.readNegCheck({ active: true, clinic_id: "c1", until, refused: [{ product_id: "a", why: "counted", name: "x", stock: "-2" }, { product_id: "b", why: "weird" }] });
  c("  readNegCheck: السببُ المجهول رفضٌ لا قبول («off»)، والرصيدُ رقم", ch.refused[0].why === "counted" && ch.refused[0].stock === -2 && ch.refused[1].why === "off" && ch.refused[1].stock === null);
  c("  ومرفوضٌ بلا معرّف يرمي، والعددُ السالبُ بالتقرير يرمي",
    thrown(() => N.readNegCheck({ active: true, refused: [{ why: "off" }] })) === "neg_shape"
    && thrown(() => N.readNegReport({ active: false, log: [], negatives: -1, never_counted: 0, uncounted_nonpos: 0, zero_cost: 0, zero_cost_nonpos: 0, pending: 0 }, 0)) === "neg_shape");
  c("  وreadCounted: مصفوفةُ نصوصٍ وحدها", N.readCounted(["a", "b"]).has("b") && thrown(() => N.readCounted([1])) === "neg_shape" && thrown(() => N.readCounted({})) === "neg_shape");
}

/* ══ ب) المرآةُ التجريبية والحالةُ المشتركة (negStockApi بلا سحابة) ═══════════════════ */
const SESSION = /const KEY = "([^"]+)"/.exec(READ("src/contexts/AuthContext.tsx"))?.[1];
const UNTIL = /const untilKey = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/.exec(READ("src/lib/managerOverride.ts"))?.[1];
if (!SESSION || !UNTIL) { console.error("✗ neg-stock-test: ما انقرأ مفتاحُ الجلسة أو وضع المدير"); process.exit(1); }
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
async function buildApi(supabaseSrc = "export const supabase = null;", mutate = null) {
  const map = {
    i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
    "./supabase": supabaseSrc,
    "./globalToast": "export const emitGlobalToast = () => {};",
  };
  const built = await esbuild.build({
    stdin: {
      contents: ['export * from "./src/lib/negStockApi.ts";', 'export { loadDB, saveDB } from "./src/lib/demoStore.ts";', 'export { saveCounts, loadCounts } from "./src/lib/demoCounts.ts";'].join("\n"),
      resolveDir: process.cwd(), sourcefile: "neg-api-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "stubs",
      setup(b) {
        /* طفرةٌ على ملفٍّ بعينه (الباب أو المرآة) — نصُّه المعدَّل بدل ما على القرص. */
        if (mutate) b.onLoad({ filter: mutate.re }, () => ({ contents: mutate.src, loader: "ts" }));
        b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
        b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
      },
    }],
  });
  return importBuilt(built.outputFiles[0].text, "api");
}
const as = (id, rawRole, staff) => mem.set(SESSION, J({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: [rawRole === "owner" ? "owner" : "clinic"], clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: rawRole === "owner" ? "owner" : "clinic",
}));
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message; } };
/** النهايةُ كما يكتبها الخادم بتوقيت الجهاز (p_tz): الثالثة فجراً بعد آخر يوم — بحسابٍ مستقلّ (ساعةٌ ساعةٌ حتى يقرأها Intl الثالثة). */
const endOfDays = (days, now, tz = Intl.DateTimeFormat().resolvedOptions().timeZone) => {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(now)).split("-").map(Number);
  const want = new Date(Date.UTC(y, m - 1, d + days + 1)).toISOString().slice(0, 10);
  for (let t = Date.UTC(y, m - 1, d + days) - 2 * DAY; t < Date.UTC(y, m - 1, d + days + 3); t += 15 * 60_000) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(t)).map((x) => [x.type, x.value]));
    if (`${p.year}-${p.month}-${p.day}` === want && p.hour === "03" && p.minute === "00") return new Date(t).toISOString();
  }
  return null;
};
const DP = (o) => ({ barcode: null, stock: 0, has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null, farm_id: null, pooled: false,
  created_at: "2026-01-01", avg_cost: null, price_currency: "IQD", purchase_price: 1000, sell_price: 1500, ...o });

async function demoChecks(c, mutate = null) {
  const A = await buildApi(undefined, mutate);
  mem.clear(); skew = 0;
  as("owner-1", "owner");
  const db = A.loadDB();
  const CL = "clinic-happy-paws";
  A.saveDB({ ...db, products: [
    DP({ id: "d0", name: "سيروم" }), DP({ id: "dz", name: "بلا كلفة", purchase_price: 0 }), DP({ id: "dc", name: "معدودة", stock: 2 }),
    DP({ id: "dp", name: "مجمَّعة", pooled: true }), DP({ id: "du", name: "دولار", price_currency: "USD" }), DP({ id: "dn", name: "سالبة", stock: -3 }),
    DP({ id: "ds", name: "حبوب", has_sub_unit: true, units_per_box: 1000, purchase_price: 4 }), DP({ id: "df", name: "حقل", farm_id: "f1" }),
  ] });
  A.saveCounts([{ id: "cnt1", product_id: "dc", product_name: "معدودة", source: "count", status: "matched", counted_qty: 2, system_qty: 2, diff: 0, created_at: new Date().toISOString() },
    { id: "cnt2", product_id: "d0", product_name: "سيروم", source: "count", status: "pending", counted_qty: 1, system_qty: 0, diff: 1, created_at: new Date().toISOString() }]);
  const api = A.negApi;
  let s = await api.state();
  c("ب١ البداية: مطفأ ولا سجلّ (used=false)، والعيادةُ عيادةُ الجلسة", !s.active && !s.used && s.clinic === CL, J(s));
  c("  الإقرارُ والمدّةُ والعيادةُ شرطٌ بالمرآة كالخادم",
    await errOf(() => api.set(CL, true, 7, false, null)) === "neg_stock_ack" && await errOf(() => api.set(CL, true, 0, true, null)) === "neg_stock_days"
    && await errOf(() => api.set(CL, true, 31, true, null)) === "neg_stock_days" && await errOf(() => api.set(CL, true, 2.5, true, null)) === "neg_stock_days"
    && await errOf(() => api.set("clinic-x", true, 7, true, null)) === "neg_stock_clinic_changed" && await errOf(() => api.set(CL, true, 7, true, "x".repeat(201))) === "neg_stock_note");
  as("rec-1", "reception");
  const recRefused = await errOf(() => api.set(CL, true, 7, true, null));
  mem.set(`${UNTIL}${mem.get("vp_active_clinic") || "default"}`, String(Date.now() + 600_000));
  const pinRefused = await errOf(() => api.set(CL, true, 7, true, null));
  mem.delete(`${UNTIL}${mem.get("vp_active_clinic") || "default"}`);
  c("ب٢ الاستقبالُ يُرفض، و**بمفتاح المدير المؤقّت أيضاً** (الدورُ الأساس — وضعٌ يعيش أيّاماً)", recRefused === "neg_stock_manager" && pinRefused === "neg_stock_manager", J([recRefused, pinRefused]));
  as("vet-1", "doctor");
  c("  والطبيبُ يُرفض", await errOf(() => api.set(CL, true, 7, true, null)) === "neg_stock_manager");
  as("owner-1", "owner");
  const t0 = Date.now();
  s = await api.set(CL, true, 7, true, "قبل الجرد الأوّل");
  c("ب٣ التشغيل: مفعّل، والنهايةُ الثالثة فجراً بتوقيت الجهاز (كالخادم بـp_tz) بعد سبعة أيام كاملة", s.active && s.used && s.until === endOfDays(7, t0), J({ until: s.until, want: endOfDays(7, t0) }));
  let rep = await api.report();
  c("  والسجلّ: سطرُ «on» باسم الجلسة وملاحظتِها وعدّه لحظتَها (تحت الصفر ١، بلا كلفة ١، معلَّق ١)",
    rep.log.length === 1 && rep.log[0].action === "on" && rep.log[0].byName === "موظف owner-1" && rep.log[0].note === "قبل الجرد الأوّل"
    && rep.log[0].negatives === 1 && rep.log[0].pending === 1 && rep.zeroCost === 1 && rep.negatives === 1, J(rep.log[0]));
  c("  والتقرير: ما انعدّ = الحيّةُ ناقصَ المعدودة (لا مجمَّعة ولا دولار ولا حقل)", rep.neverCounted === 4 && rep.uncountedNonpos === 4 && rep.zeroCostNonpos === 1, J({ nc: rep.neverCounted, un: rep.uncountedNonpos, zc: rep.zeroCostNonpos }));
  {
    const d1 = A.loadDB();
    A.saveDB({ ...d1, products: d1.products.map((p) => (p.id === "dc" ? { ...p, stock: -1 } : p)) });
    const r2 = await api.report();
    c("  و«منها تحت الصفر» لغير المعدودة وحدها: معدودةٌ تحت الصفر تُعدّ بالسالبة لا بها (لوحةُ الإطفاء قالت «٢ منها ٥»)", r2.negatives === 2 && r2.uncountedNeg === 1, J({ neg: r2.negatives, un: r2.uncountedNeg }));
    A.saveDB(d1);
  }
  s = await api.set(CL, true, 3, true, null);
  rep = await api.report();
  c("ب٤ تمديدٌ أقصر لا يقصّر ولا يُكتب (لا سطر) — ويقول ذلك (changed=false)", s.until === endOfDays(7, t0) && rep.log.length === 1 && s.changed === false && s.action === null, J({ until: s.until, n: rep.log.length, changed: s.changed }));
  s = await api.set(CL, true, 14, true, null);
  rep = await api.report();
  c("  وتمديدٌ أبعد يُكتب «extend» والبدايةُ كما هي، ويقول ما كتب", s.until === endOfDays(14, t0) && rep.log[0].action === "extend" && rep.log[0].since === rep.log[1].since && rep.log.length === 2
    && s.changed === true && s.action === "extend");

  /* حكمُ البيعة */
  const L = (id, qty = 1, sq = qty) => ({ product_id: id, qty, stock_qty: sq });
  let ck = await api.check(CL, [L("d0"), L("dz"), L("dc"), L("dp"), L("du"), L("df"), L("gone-x"), L("ds", 1, 1), L("ds", 5, 0.005), L("dn", 4)]);
  const why = Object.fromEntries(ck.refused.map((r, i) => [`${r.productId}#${i}`, r.why]));
  const whyOf = (id) => ck.refused.filter((r) => r.productId === id).map((r) => r.why).join("+");
  c("ب٥ الفحص: الحيّةُ بكلفةٍ تمرّ (d0، dn، علبةُ ds)، وما لا يُكلَّف zero_cost، والمعدودة counted، والمجمَّعةُ والدولارُ والحقلُ not_lifted، والغائبةُ gone",
    whyOf("d0") === "" && whyOf("dn") === "" && whyOf("dz") === "zero_cost" && whyOf("dc") === "counted" && whyOf("dp") === "not_lifted"
    && whyOf("du") === "not_lifted" && whyOf("df") === "not_lifted" && whyOf("gone-x") === "gone", J(why));
  c("  والمفردُ تقريبُ كلفته صفر (٤ ÷ ١٠٠٠) zero_cost والعلبةُ نفسُها تمرّ — الحكمُ بكلفة **السطر**", whyOf("ds") === "zero_cost" && ck.refused.filter((r) => r.productId === "ds").length === 1);
  c("  والمعدودةُ تُقال باسمها ورصيدها", ck.refused.find((r) => r.productId === "dc")?.name === "معدودة" && ck.refused.find((r) => r.productId === "dc")?.stock === 2);
  c("  وعيادةٌ غيرُ عيادة الجلسة تُرفض (لا حكمٌ عن عيادةٍ أخرى)", await errOf(() => api.check("clinic-x", [L("d0")])) === "neg_stock_clinic_changed");

  /* الإطفاء */
  s = await api.set(CL, false, null, false, null);
  rep = await api.report();
  c("ب٦ الإطفاء: مطفأ، و«انتهى بـ» لحظتُه، وسطرُ «off» يعدّ ما بقي تحت الصفر", !s.active && s.used && !!s.endedAt && rep.log[0].action === "off" && rep.log[0].negatives === 1 && rep.log.length === 3
    && s.changed === true && s.action === "off");
  const off2 = await api.set(CL, false, null, false, null);
  c("  وإطفاءُ المطفأ لا شيء (لا سطر) ويقوله", !off2.active && (await api.report()).log.length === 3 && off2.changed === false);
  ck = await api.check(CL, [L("d0"), L("gone-x")]);
  c("  وبعده كلُّ سطرٍ «off» (والغائبةُ gone)", ck.refused.map((r) => r.why).join(",") === "off,gone" && ck.active === false);
  const since0 = rep.log[0].since;
  skew = 5 * DAY;
  s = await api.set(CL, true, 7, true, null);
  rep = await api.report();
  c("ب٧ تشغيلٌ بعد الإطفاء بخمسة أيام يُكمل الفترة (البدايةُ نفسُها — الإطفاءُ والتشغيلُ لا يصفّران سقف الستّين)", rep.log[0].action === "on" && rep.log[0].since === since0, J({ since: rep.log[0].since, since0 }));
  skew = 20 * DAY;
  const okExt = await errOf(() => api.set(CL, true, 30, true, null));
  skew = 35 * DAY;
  const tooLong = await errOf(() => api.set(CL, true, 30, true, null));
  c("  والسقفُ ستّون يوماً من البداية: تمديدٌ يبلغ اليوم ٥١ يمرّ، ويبلغ ٦٦ يُرفض", okExt === "قُبل" && tooLong === "neg_stock_too_long", J([okExt, tooLong]));
  s = await api.set(CL, false, null, false, null);
  skew = 35 * DAY + 31 * DAY;
  s = await api.set(CL, true, 7, true, null);
  rep = await api.report();
  c("  وتشغيلٌ بعد ٣١ يوماً من الإطفاء فترةٌ جديدة", rep.log[0].since !== since0 && Date.parse(rep.log[0].since) >= realNow() + 66 * DAY - 60_000, J({ since: rep.log[0].since }));
  skew = 35 * DAY + 31 * DAY + 9 * DAY;
  s = await api.state();
  c("ب٨ وينطفئ وحده بعد النهاية (بلا سطر): مطفأ، و«انتهى بـ» النهايةُ نفسُها", !s.active && s.endedAt === rep.log[0].until && (await api.report()).log.length === rep.log.length);
  skew = 0;

  /* الجرد بما رآه العادّ */
  const C = (id, counted, seen) => ({ product_id: id, counted, ...(seen === undefined ? {} : { seen }) });
  c("ب٩ الجرد: سطرٌ بلا seen يُرفض (حارسٌ لا يجري على سطرٍ ليس حارساً)", await errOf(() => api.countSubmitSeen([C("d0", 3)])) === "count_seen_missing");
  let moved = null;
  try { await api.countSubmitSeen([C("d0", 3, 0), C("dn", 1, -2)]); } catch (e) { moved = e; }
  c("  ورصيدٌ تحرّك من وقت الكتابة يُرفض count_moved بمعرّفه (details) — بلا أثر",
    moved?.message === "count_moved" && J(JSON.parse(moved.details ?? "[]")) === J(["dn"]) && A.loadCounts().length === 2, J({ m: moved?.message, d: moved?.details, n: A.loadCounts().length }));
  /* حوضُ القسم: مادّةٌ رصيدُها صفر بقسمٍ له حوض تُباع منه وصفُّها ثابت — الحوضُ كما رآه العادّ شرط (مرآةُ 0266). */
  {
    const db1 = A.loadDB();
    A.saveDB({ ...db1, companySections: [...(db1.companySections ?? []), { id: "sec-q", name: "حوض", pooled_stock: 10 }],
      products: [...db1.products, DP({ id: "dq", name: "بحوض", stock: 0, section_id: "sec-q" })] });
    const missing = await errOf(() => api.countSubmitSeen([{ ...C("dq", 2, 0), reason: "found" }]));
    const db2 = A.loadDB();
    A.saveDB({ ...db2, companySections: db2.companySections.map((x) => (x.id === "sec-q" ? { ...x, pooled_stock: 9 } : x)) });
    let pm = null;
    try { await api.countSubmitSeen([{ ...C("dq", 2, 0), seen_pool: 10, reason: "found" }]); } catch (e) { pm = e; }
    c("ب٩ب حوضُ القسم بالمرآة: بلا seen_pool يُرفض count_seen_missing، وبيعٌ من الحوض بعد الكتابة count_moved بمعرّفه",
      missing === "count_seen_missing" && pm?.message === "count_moved" && J(JSON.parse(pm.details ?? "[]")) === J(["dq"]), J({ missing, pm: pm?.message, d: pm?.details }));
    c("  والحوضُ كما رآه يمرّ", await errOf(() => api.countSubmitSeen([{ ...C("dq", 2, 0), seen_pool: 9, reason: "found" }])) === "قُبل");
  }
  const okCount = await errOf(() => api.countSubmitSeen([{ ...C("dn", 1, -3), reason: "entry_error" }]));
  c("  ومطابقٌ يُسجَّل بمرآة الجرد كما هي", okCount === "قُبل" && A.loadCounts().length > 2, J({ okCount, n: A.loadCounts().length }));

  /* الحالةُ المشتركة */
  mem.set("vp_active_clinic", "clinic-happy-paws");
  const key = A.negKey("owner-1");
  c("ب١٠ مفتاحُ الحالة المستخدمُ والعيادةُ المحلّية", key === "owner-1|clinic-happy-paws");
  let seen = 0;
  const un = A.subscribeNeg(key, () => { seen++; });
  await flush();
  const snap = A.negSnap(key);
  c("  أوّلُ مشتركٍ يسأل، والجوابُ المفعّل يحمل المعدودة", seen >= 1 && snap.state?.active === true && snap.counted.has("dc") && !snap.failed, J({ seen, a: snap.state?.active, c: [...snap.counted] }));
  un();
  c("  وآخرُ من يغادر ينسى المفتاح (لا حالةٌ قديمة لمن يأتي بعده)", A.negSnap(key).state === null);

  /* السحابة: غيابُ الدالّة «الميزةُ غائبة» لا «تعذّر» */
  const C2 = await buildApi(`export const supabase = { rpc: async (fn) => (globalThis.__rpc ? globalThis.__rpc(fn) : { data: null, error: { code: "PGRST202", message: "not found" } }) };`, mutate);
  globalThis.__rpc = null;
  const abs = await C2.negApi.state();
  const absRep = await C2.negApi.report();
  globalThis.__rpc = () => ({ data: null, error: { code: "PGRST000", message: "boom" } });
  const boom = await errOf(() => C2.negApi.state());
  c("ب١١ السحابة: الدالّةُ غائبة ⇒ absent (الميزةُ مخفيّة)، وغيرُه من الأخطاء يُرمى", abs.absent === true && !abs.active && absRep.absent === true && boom === "boom", J({ abs, boom }));
  globalThis.__rpc = (fn) => (fn === "stock_count_submit_seen" ? { data: null, error: { code: "PGRST202", message: "nf" } } : { data: { ok: true, fn }, error: null });
  const fb = await C2.negApi.countSubmitSeen([{ product_id: "x", counted: 1, seen: 0 }]);
  c("  والجردُ على قاعدةٍ قبل 0266 يمرّ بالباب القديم بلا seen (لا جردَ موقوفٌ لأن الهجرة تأخّرت)", fb?.fn === "stock_count_submit", J(fb));

  /* سباقُ المعدودة: سؤالٌ أوّل ينتظر المعدودة، وثانٍ يبدأ ويتأخّر جوابُ حالته، والأوّلُ يصل بعدها (ويُتجاوز) — ثمّ حالةُ الثاني.
   * كان الأوّلُ يختم «حُمّلت» بلا نشر فيتخطّاها الثاني وتُنشر فارغةً خمسَ دقائق: كلُّ معدودةٍ تُرفع بالكاشير. */
  {
    const reply = (clinic) => ({ data: { clinic_id: clinic, active: true, used: true, until: new Date(realNow() + 5 * DAY).toISOString(), now: new Date(realNow()).toISOString() }, error: null });
    const calls = { state: 0, counted: 0 }, rel = {};
    globalThis.__rpc = (fn) => {
      if (fn === "neg_stock_state") { calls.state++; return calls.state === 2 ? new Promise((r) => { rel.state2 = () => r(reply("cA")); }) : reply("cA"); }
      if (fn === "neg_stock_counted") { calls.counted++; return calls.counted === 1 ? new Promise((r) => { rel.counted1 = () => r({ data: ["x1"], error: null }); }) : { data: ["x1"], error: null }; }
      return { data: null, error: { code: "PGRST202", message: "nf" } };
    };
    const key = "race|k1";
    const p1 = C2.refreshNeg(key); await flush();
    const p2 = C2.refreshNeg(key); await flush();
    /* الأوّلُ تجاوزه الثاني فينتظره (لا يُرجع قبل نشر الأحدث) — فلا يُنتظر قبل إطلاق جواب الثاني. */
    rel.counted1?.(); await flush(); await flush();
    rel.state2?.(); await p2; await p1; await flush();
    c("ب١٢ سباقُ المعدودة: سؤالٌ تجاوزه أحدثُ منه لا يختم «حُمّلت» — الأحدثُ يجلبها وينشرها", C2.negSnap(key).counted.has("x1") && C2.negSnap(key).state?.active === true,
      J({ counted: [...C2.negSnap(key).counted], calls }));
  }
  /* جوابٌ تامٌّ يُنشر ولو بدأ بعده سؤالٌ أحدث (ما لم يُنشر أحدثُ منه): ضغطتان بعد التشغيل والثانيةُ فشلت — الأولى كانت تُرمى فتُحكم بـ«مطفّى»؛
   * وجوابٌ أقدمُ من منشورٍ يُرمى (لا يدوس الأحدث). */
  {
    const rel = [];
    const ans = (active) => ({ data: { clinic_id: "cA", active, used: true, until: new Date(realNow() + 5 * DAY).toISOString(), now: new Date(realNow()).toISOString() }, error: null });
    globalThis.__rpc = (fn) => (fn === "neg_stock_state" ? new Promise((r) => rel.push(r)) : { data: [], error: null });
    let key = "race|k3", firstSaw = null;
    const p1 = C2.refreshNeg(key).then(() => { firstSaw = C2.negSnap(key).state?.active ?? "لا شيء"; });
    await flush();
    const p2 = C2.refreshNeg(key); await flush();
    rel[0](ans(true)); await p1;
    rel[1]({ data: null, error: { code: "08006", message: "connection lost" } }); await p2;
    const sn = C2.negSnap(key);
    c("ب١٤ ضغطتان والثانيةُ فشلت: جوابُ الأولى التامّ يُنشر ومنتظرُه يقرؤه (مفعّل)، وفشلُ الثانية لا يمحوه", firstSaw === true && sn.state?.active === true,
      J({ firstSaw, active: sn.state?.active, failed: sn.failed }));
    rel.length = 0;
    key = "race|k4";
    const q1 = C2.refreshNeg(key); await flush();
    const q2 = C2.refreshNeg(key); await flush();
    rel[1](ans(false)); await q2;
    rel[0](ans(true)); await q1;
    c("  وجوابٌ أقدمُ يصل بعد نشر الأحدث يُرمى: الحالةُ «مطفأ» كما قال الأحدث", C2.negSnap(key).state?.active === false, J({ active: C2.negSnap(key).state?.active }));
  }
  /* جوابٌ عن عيادةٍ أخرى تحت المفتاح نفسِه (المشغّلُ دخل عيادةً ثانية بتبويبٍ آخر — الجلسةُ واحدة): لا يُتبنّى. */
  {
    let n = 0;
    globalThis.__rpc = (fn) => (fn === "neg_stock_state"
      ? { data: { clinic_id: ++n === 1 ? "cA" : "cB", active: n !== 1, used: true, until: new Date(realNow() + 5 * DAY).toISOString(), now: new Date(realNow()).toISOString() }, error: null }
      : { data: [], error: null });
    const key = "op|k2";
    await C2.refreshNeg(key);
    await C2.refreshNeg(key);
    const sn = C2.negSnap(key);
    c("ب١٣ جوابُ عيادةٍ أخرى لا يُتبنّى: الحالةُ حالةُ العيادة الأولى (مطفأ)، والسؤالُ «فشل» — فحصُ البيعة يرسل الأولى فيقول الخادمُ «تبدّلت»",
      sn.state?.clinic === "cA" && sn.state?.active === false && sn.failed === true, J(sn.state && { clinic: sn.state.clinic, active: sn.state.active, failed: sn.failed }));
  }
  globalThis.__rpc = null;
}

/* ══ ج) شاشةُ البيع بالسلوك ══════════════════════════════════════════════════════ */
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); if (typeof d === "string" || opt.defaultValue != null) { const s = typeof d === "string" ? d : opt.defaultValue; return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); } const ps = Object.keys(opt).filter((x) => x !== "defaultValue"); return ps.length ? k + "|" + JSON.stringify(Object.fromEntries(ps.map((x) => [x, opt[x]]))) : k; }`;
const SB = "globalThis.__sb";
const REAL = new Set(["react", "@/lib/utils", "@/lib/productCodes", "@/lib/errors", "@/lib/cartCap", "@/lib/cartReprice", "@/lib/retailBridge",
  "@/lib/saleCustomer", "@/lib/priceDraft", "@/lib/customerName", "@/lib/debt", "@/lib/medSale", "@/lib/consumption",
  /* طريقُ «بِعْ أو اشرح» حقيقيّ: سؤالُ الخادم وحكمُ الطزاجة والرصيدُ القابلُ للبيع — الوضعُ يدخل منه. */
  "@/lib/freshSale", "@/lib/freshness", "@/lib/sellable"]);
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar", dir: () => "rtl" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
    export const Dialog = ({ open, title, children, footer, size, onClose, ...p }) => (open ? createElement("x-Dialog", { ...p, title }, children, footer) : null);
    export const useToast = () => ${SB}.toast;`,
  "@/lib/repo": `export const repo = new Proxy({}, { get: (_t, k) => ${SB}.repo[k] });
    export const resolveDiscount = (sub, type, v) => (type === "percent" ? Math.round(sub * v) / 100 : Math.min(sub, v));`,
  "@/contexts/AuthContext": `export const useAuth = () => ({ user: ${SB}.user });`,
  "@/hooks/usePermissions": `export const usePermissions = () => ${SB}.perm;`,
  "@/lib/managerOverride": `export const useOverride = () => ${SB}.ov;`,
  "@/lib/entitlements": "export const useEntitlements = () => ({ has: () => true });",
  "@/hooks/useBarcodeScanner": `export const useBarcodeScanner = (h, o) => { ${SB}.scanner = { h, o }; };`,
  "@/components/meds/MedPicker": "export const useMedPickerOpen = () => false;",
  "./ServiceQuickSelect": `export const ServiceQuickSelect = () => null;`,
  "./CustomerSearch": `export const useCustomerSearch = () => ({ type() {}, focus() {}, blur() {}, cancel() {}, close() {}, move() {}, highlighted: () => null, open: false, rows: [] });
    export const CustomerDropdown = () => null; export const CustomerPetsStrip = () => null;`,
  "@/lib/services": `export const getServiceCatalog = () => ({ categories: [], services: [] }); export const findServiceByBarcode = () => null;`,
  "@/lib/promotions": `export const computePromotions = () => ({ applied: [], totalDiscount: 0 }); export const getPromoRules = () => [];`,
  "@/lib/settings": `export const getDialCode = () => "+964"; export const getPreSalePrint = () => false; export const getResizableCart = () => false;
    export const getPosV2 = () => false; export const getPosCompact = () => false; export const getPosCustomerOpen = () => false; export const getClinicLogo = () => null;
    export const getClinicSocials = () => ({}); export const getClinicName = () => ""; export const getDeliveryZones = () => []; export const getQtyPromos = () => [];
    export const getExpiryWindows = () => ({ returnDays: 90, criticalDays: 30 });`,
  "@/lib/navFold": "export const useNavFolded = () => false; export const setNavFolded = () => {};",
  "@/lib/posLayout": `const L = { side: "end", cartZoom: 1, gridZoom: 1, wFrac: null, hFrac: null };
    export const loadPosLayout = () => ({ ...L }); export const savePosLayout = (p) => ({ ...L, ...p }); export const stepZoom = (z) => z;`,
  "@/lib/inflight": "export const holdAll = (xs) => Promise.all(xs); export const holdUpdates = () => () => {};",
  "@/lib/medSync": "export const persistMedicalEntries = async () => {};",
  "@/lib/saleDate": `export const canBackdate = () => false; export const checkSaleMoment = () => ({ ok: true, at: null }); export const saleTz = () => "Asia/Baghdad";`,
  "@/lib/backdate": `export const clockOf24 = () => "12:00";`,
  "./SaleDateBar": `export const SaleDateBar = () => null; export const saleDateMessage = () => "";`,
  "@/lib/staffNames": "export const matchStaffToUser = async () => null; export const resolveStaffName = async () => null;",
  "@/lib/priceSync": `export const PRICES_EVENT = "vp-prices-changed"; export const checkPriceEpoch = async () => null; export const priceGen = () => 0; export const servicesStaleNow = () => false;`,
  "@/lib/surgeryCatalog": `export const matchSurgeryService = () => null; export const isSurgeryCategoryName = () => false; export const surgeryByRef = () => null;`,
  "@/lib/invoicePrint": `export const invoiceNo = (id) => "INV-" + String(id).slice(-4); export const openInvoicePrint = async () => true;`,
  "@/lib/branchStore": "export const branchStore = { branchForWrite: () => null };",
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load, ns) => { (globalThis.__pages ||= []).push({ load, ns }); return lazy(load); };`,
  /* حدُّ تحميلٍ يمسك الخطأ كالحقيقيّ (قطعةٌ فشلت ⇒ «تعذّر» مكانها، والشاشةُ باقية). */
  "@/components/LoadBoundary": `import { Component, createElement } from "react";
    export class LoadBoundary extends Component {
      constructor(p) { super(p); this.state = { err: null }; }
      static getDerivedStateFromError(err) { return { err }; }
      render() { return this.state.err ? createElement("x-LoadFailed", { scope: this.props.scope }) : createElement("x-LoadBoundary", { scope: this.props.scope }, this.props.children); }
    }`,
  "@/components/retail/ConsumablesSheet": `export default () => null; export const ConsumptionNotice = (p) => { globalThis.__consNotice = p; return null; };`,
  "@/lib/consumptionApi": "export const consumptionApi = { recipeSummary: async () => ({}) };",
  "@/components/retail/PosCustomTabs": "export const PosTabPills = () => null; export const PosTabGrid = () => null; export const PosTabEditor = () => null;",
  "@/lib/posTabsApi": "export const posTabsApi = { list: async () => [] };",
  /* شريطُ نسبة الراجع وملاحظتُه (قطعتان كسولتان) — لا شأنَ لهما هنا؛ بديلٌ فارغٌ كان سيُسقط الرسمَ عند «راجع». */
  "@/components/retail/RetPct": "export const RetModeBar = () => null; export const RetPureNote = () => null;",
  /* البابُ بحالةٍ يمسكها الفحص (globalThis.__neg) والقواعدُ الصِّرفةُ الحقيقيّة — عمرُ الجواب وحكمُ الرفع كما بالتطبيق. */
  "@/lib/negStockApi": `const N = () => globalThis.__neg;
    export const negKey = (u) => (u ?? "anon") + "|" + N().clinicKey;
    export const negSnap = (k) => N().snap(k);
    export const subscribeNeg = (k, fn) => N().subscribe(k, fn);
    export const refreshNeg = (k) => N().refresh(k);
    import { readNegCheck } from "./src/lib/negStock.ts";
    export const negApi = { check: async (c, l) => readNegCheck(await N().check(c, l)) };
    export { activeNow, liftable, daysLeft, bigLifted, lastDayOf } from "./src/lib/negStock.ts";`,
  /* الشريحةُ والنافذةُ بدائلُ تسجّل ما تراه (المكوّنان الحقيقيّان بالقسم د). */
  "@/components/negstock/NegStock": `import { createElement, useEffect } from "react";
    export const NegBar = (p) => { globalThis.__negBar = p; useEffect(() => (globalThis.__negBarHold ? undefined : p.onReady?.()), [p.onReady]); return createElement("x-NegBar", { "data-negbar": p.view.active ? "on" : "off" }); };
    export const NegCheckoutDialog = (p) => { if (globalThis.__negChkThrow) throw new Error("chunk failed"); globalThis.__negChk = p; return p.open ? createElement("x-NegChk", { "data-negchk": p.lines.map((l) => l.id + ":" + l.why + ":" + (l.keep ?? "")).join(",") }) : null; };
    export const NegStockCard = () => null;`,
};
function importsOf(src) {
  const map = new Map();
  for (const m of src.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
    if (m[1]) continue;
    const names = map.get(m[3]) ?? new Set();
    for (const part of (/\{([\s\S]*)\}/.exec(m[2])?.[1] ?? "").split(",")) {
      const s = part.trim();
      if (s && !s.startsWith("type ")) names.add(s.split(/\s+as\s+/)[0].trim());
    }
    if (!m[2].trim().startsWith("{") && /^\s*\w+\s*(,|$)/.test(m[2])) names.add("default");
    map.set(m[3], names);
  }
  return map;
}
function autoStub(spec, names) {
  if (spec === "lucide-react") return [...names].map((k) => `export const ${k} = () => null;`).join("\n");
  return ['import { createElement } from "react";', ...[...names].map((k) => {
    const v = /^use[A-Z]/.test(k) ? "() => ({})" : /^[A-Z][a-z]/.test(k) ? `(p) => createElement("x-${k}", p, p?.children)`
      : /^[A-Z_0-9]+$/.test(k) ? "0" : "() => undefined";
    return k === "default" ? `export default ${v};` : `export const ${k} = ${v};`;
  })].join("\n");
}
async function buildSB(source) {
  const imports = importsOf(source);
  const fileRe = /src[\\/]components[\\/]retail[\\/]SaleBuilder\.tsx$/;
  const built = await esbuild.build({
    stdin: { contents: `export * from "./${SB_PATH}";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), sourcefile: "neg-ui.tsx", loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "neg-sb",
      setup(b) {
        b.onLoad({ filter: fileRe }, () => ({ contents: source, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path === "i18next" || a.path === "react-i18next") return { path: a.path, namespace: "ns-stub" };
          if (fileRe.test(a.importer ?? "") && !REAL.has(a.path) && !a.path.startsWith("react/")) return { path: a.path, namespace: "ns-stub" };
          return undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "ns-stub" }, (a) => ({ contents: STUB[a.path] ?? autoStub(a.path, imports.get(a.path) ?? new Set()), loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  globalThis.__pages = [];
  return importBuilt(built.outputFiles[0].text, "sb");
}

/* الموادّ: d0 صفرٌ بكلفة، dn تحت الصفر، dc معدودة، dz بلا كلفة، ds حبوبٌ مفردُها بلا كلفة، d5 بالرفّ ٥، dw بالوزن، dp مجمَّعة. */
const PRD = (o) => ({ barcode: null, stock: 0, has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null, farm_id: null, pooled: false,
  created_at: "2026-01-01", avg_cost: null, price_currency: "IQD", purchase_price: 1000, sell_price: 1500, sold_by_weight: false, ...o });
const P0 = PRD({ id: "d0", name: "سيروم" });
const PN = PRD({ id: "dn", name: "سالبة", stock: -3, purchase_price: 2000, sell_price: 3000 });
const PC = PRD({ id: "dc", name: "معدودة" });
const PZ = PRD({ id: "dz", name: "بلا كلفة", purchase_price: 0 });
const PS = PRD({ id: "ds", name: "حبوب", has_sub_unit: true, units_per_box: 1000, sub_unit_name: "حبة", sub_unit_price: 0.02, purchase_price: 4, sell_price: 20 });
const P5 = PRD({ id: "d5", name: "بالرفّ", stock: 5 });
const PW = PRD({ id: "dw", name: "علف", sold_by_weight: true, purchase_price: 2000, sell_price: 2500 });
const PP = PRD({ id: "dp", name: "مجمَّعة", pooled: true });
const PT = PRD({ id: "dt", name: "أقراص", has_sub_unit: true, units_per_box: 10, sub_unit_name: "قرص", sub_unit_price: 200, purchase_price: 1000, sell_price: 2000 });
const ALL = [P0, PN, PC, PZ, PS, P5, PW, PP, PT];
const DRAFT_KEY = "vp_sale_draft_c1";

function negEnv(o = {}) {
  const subs = new Set();
  const env = {
    clinicKey: "c1", failed: false, counted: new Set(o.counted ?? ["dc"]), calls: { check: [], refresh: 0 },
    state: o.noState ? null : {
      clinic: "c1", active: o.active ?? true, used: o.used ?? true, until: new Date(realNow() + 5 * DAY).toISOString(), since: null,
      endedAt: o.endedAt ?? null, serverNow: new Date(realNow()).toISOString(), at: performance.now() - (o.age ?? 0),
    },
    checkFn: o.check ?? (() => ({ clinic: "c1", active: true, until: null, refused: [] })),
    onRefresh: o.onRefresh ?? null,
    snap: () => ({ state: env.state, counted: env.counted, failed: env.failed }),
    subscribe: (_k, fn) => { subs.add(fn); return () => subs.delete(fn); },
    refresh: async () => { env.calls.refresh++; if (env.onRefresh) env.onRefresh(env); else env.state = { ...env.state, at: performance.now() }; for (const f of subs) f(); return env.state; },
    check: async (c, lines) => { env.calls.check.push({ c, lines: JSON.parse(J(lines)) }); return env.checkFn(c, lines); },
    set(patch) { env.state = { ...env.state, ...patch, at: performance.now() }; for (const f of subs) f(); },
  };
  globalThis.__neg = env;
  return env;
}
function freshEnv(o = {}) {
  const log = { checkout: [], errors: [], asked: [] };
  const rows = new Map((o.rows ?? ALL).map((p) => [p.id, p]));
  globalThis.__negBar = null; globalThis.__negChk = null; globalThis.__consNotice = null;
  globalThis.__sb = {
    log, rows,
    user: { id: "u1", clinic_id: "c1", full_name: "د. سارة", email: "s@x" },
    perm: { role: "manager", baseRole: "manager", can: () => true },
    ov: { active: false, until: null, deviceLocked: false, restricted: false, stockLocked: false },
    repo: {
      getProductById: async (id) => { log.asked.push(id); return rows.get(id) ?? null; },
      getProductByBarcode: async (c) => (o.byCode?.[c] ?? null),
      retailReturn: async (items) => { log.returns = (log.returns ?? 0) + 1; return { total: 0, lines: items.length, method: "cash" }; },
      getSectionPool: async () => 0,
      retailCheckout: async (items, meta) => {
        log.checkout.push({ items: JSON.parse(J(items)), meta });
        if (o.checkoutFails && log.checkout.length <= o.checkoutFails) { const e = new Error("timeout"); e.name = "TimeoutError"; throw e; }
        return { id: `inv-${log.checkout.length}`, clinic_id: "c1", total: meta.final_total, amount_paid: meta.amount_paid, profit: 0, cost_total: 0, subtotal: meta.final_total, discount: 0,
          customer_name: null, customer_phone: null, pet_name: null, status: "paid", created_at: "2026-11-12T09:00:00.000Z", recorded_at: null, item_count: items.length };
      },
      logClientEvent: async () => {}, priceRaisePrior: async () => ({}), listClinicVisitsForPet: async () => [],
    },
    toast: { toast: (x) => { log.errors.push([x?.title ?? "", null]); }, success() {}, warn() {}, error: (a, b) => { log.errors.push([a, b ?? null]); } },
    scanner: null,
  };
  return log;
}
async function session(M, { products = ALL, draft = null, neg = {}, keep = false, concurrent = !!globalThis.__conc, ...env } = {}) {
  if (!keep) mem.clear();
  if (draft) mem.set(DRAFT_KEY, J(draft));
  const N = negEnv(neg);
  const log = freshEnv(env);
  /* الأبُ يمسك القائمة: «حدّث القائمة» وعودةُ التاب تمرّرها من جديد (setProducts). */
  const Host = () => { const [ps, set] = M.React.useState(products); globalThis.__setProds = set; return M.React.createElement(M.SaleBuilder, { products: ps, clinicId: "c1", onSold() {}, onFreshRow() {} }); };
  const ui = M.mount(M.React.createElement(Host), { concurrent });
  await flush();
  const btn = (pred) => ui.all().find((n) => n.type === "button" && pred(ui.text(n)));
  const settle = async () => { for (let i = 0; i < 6; i++) await flush(); };
  return {
    ui, log, N,
    cart: () => JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? [],
    line: (id) => (JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? []).find((l) => l.id === id) ?? null,
    tile: (id) => ui.find("data-prodcard", id),
    tap: async (id) => { ui.click(ui.find("data-prodcard", id)); await settle(); },
    plus: async (lineId) => {
      const rows = ui.all().filter((n) => n.props && "data-qtyplus" in n.props);
      const want = ui.all().find((n) => n.props && n.props["data-linetotal"] === lineId);
      // الزرُّ بسطر السطر: أقربُ «+» قبل مجموع السطر.
      const order = ui.all();
      const at = order.indexOf(want);
      const plus = rows.filter((r) => order.indexOf(r) < at).pop();
      ui.click(plus); await settle();
    },
    qtyPad: () => ui.all().find((n) => n.type === "x-QtyPad" && n.props.open !== false && n.props.hint) ?? null,
    weight: () => ui.all().find((n) => n.type === "x-WeightPicker") ?? null,
    unitBtn: (u) => ui.find("data-saleunit", u),
    checkout: async () => { ui.click(btn((s) => s.startsWith("إصدار الفاتورة"))); await settle(); },
    bigAsk: () => ui.all().find((n) => n.type === "x-Dialog" && n.props.title === "تبيع الرصيد كلّه؟") ?? null,
    chk: () => (globalThis.__negChk?.open ? globalThis.__negChk : null),
    /* النافذةُ بالشجرة الآن (البديلُ يحفظ آخرَ خصائصه بعد أن تُفكّ — فـchk() وحدها لا تقول «أُغلقت»). */
    chkOpen: () => ui.all().some((n) => n.type === "x-NegChk"),
    /** معالجٌ يُنادى كضغطة متصفّح (بالجذر المتزامن داخل discreteUpdates). */
    fire: async (fn) => { ui.fire(fn); await settle(); },
    bar: () => globalThis.__negBar,
    setProducts: async (ps) => { globalThis.__setProds(ps); await settle(); },
    retMode: async () => { ui.click(ui.find("data-retmode")); await settle(); },
    scan: async (code) => { await globalThis.__sb.scanner.h(code); await settle(); },
    end: () => ui.unmount(),
  };
}

async function run(M, c) {
  /* ج١ الرفع: الكرتُ ليس «نفدت» والضغطُ يضيف بلا سؤال، والسطرُ يُعلَّم */
  {
    const S = await session(M);
    const t0 = S.tile("d0"), tn = S.tile("dn"), tc = S.tile("dc"), tz = S.tile("dz"), t5 = S.tile("d5"), tp = S.tile("dp");
    c("ج١ مفعّل: المادّةُ بالصفر وتحت الصفر بلا «نفدت» ومعلَّمة مرفوعة، والمعدودةُ وما بلا كلفة «نفدت»، والتي بالرفّ والمجمَّعةُ كما هما",
      !t0?.props["data-out"] && t0?.props["data-lifted"] === true && !tn?.props["data-out"] && tn?.props["data-lifted"] === true
      && tc?.props["data-out"] === true && !tc?.props["data-lifted"] && tz?.props["data-out"] === true && !t5?.props["data-lifted"] && !tp?.props["data-lifted"],
      J({ d0: t0?.props["data-out"], dn: tn?.props["data-lifted"], dc: tc?.props["data-out"], dz: tz?.props["data-out"] }));
    const signed = S.ui.all().find((n) => n.type === "bdi" && n.props["data-neg-stock"] !== undefined && S.ui.text(n).includes("-3"));
    c("  والرصيدُ تحت الصفر يُرسم بإشارته معزولاً (bdi ltr)", !!signed && signed.props.dir === "ltr");
    c("  وما بلا كلفة يقول سببَه الصادق لا «رصيده صفر»", (tz?.props.title ?? "").includes("ما مكتوب سعر شراء"), tz?.props.title);
    await S.tap("d0"); await S.tap("d0"); await S.tap("dn");
    const l0 = S.line("p:d0"), ln = S.line("p:dn");
    c("  والضغطُ يضيف بلا سؤال خادم، والسطرُ فوق رصيده يُعلَّم negLift", l0?.qty === 2 && l0?.negLift === true && ln?.qty === 1 && ln?.negLift === true && S.log.asked.length === 0, J({ l0, ln, asked: S.log.asked }));
    await S.tap("d5");
    c("  وسطرٌ ضمن رصيده لا يُعلَّم", S.line("p:d5")?.qty === 1 && !S.line("p:d5")?.negLift);
    S.end();
  }
  /* ج٢ المعدودة وما بلا كلفة: يُسأل الخادم ثمّ يُقال السببُ بالشريحة */
  {
    const S = await session(M);
    c("ج٢ الشريحةُ مركّبةٌ والوضعُ مفعّل", S.bar()?.view?.active === true && !!S.ui.find("data-negbar", "on"));
    await S.tap("dc");
    const sayC = S.bar()?.say;
    c("  المعدودةُ: سُئل الخادم ثمّ «انعدّت» بالشريحة لا «رصيده صفر»، ولا سطر", S.log.asked.includes("dc") && sayC?.kind === "counted" && sayC?.name === "معدودة" && !S.line("p:dc"), J({ asked: S.log.asked, say: sayC }));
    await S.tap("dz");
    const sayZ = S.bar()?.say;
    c("  وما بلا كلفة: «اكتب سعر شرائه» بمعرّفه وبإذن فتحه، ولا سطر", sayZ?.kind === "noCost" && sayZ?.productId === "dz" && sayZ?.canOpen === true && !S.line("p:dz") && sayZ.n > sayC.n, J(sayZ));
    S.end();
  }
  /* ج٣ المفردُ بلا كلفة: العلبةُ ترتفع والمفردُ يقول سببه */
  {
    const S = await session(M);
    await S.tap("ds");
    const l = S.line("p:ds");
    c("ج٣ حبوبٌ برصيدٍ صفر: تُضاف **علبة** (المفردُ تقريبُ كلفته صفر فلا يبدأ به)", l?.saleUnit === "box" && l?.qty === 1 && l?.negLift === true, J(l));
    S.ui.click(S.unitBtn("sub")); await flush(); await flush();
    c("  والتبديلُ للمفرد يقول «سعر الشراء» ولا يبدّل", S.bar()?.say?.kind === "noCost" && S.line("p:ds")?.saleUnit === "box", J({ say: S.bar()?.say, l: S.line("p:ds") }));
    S.end();
  }
  /* ج٤ اللوحة والوزن بلا سقف */
  {
    const S = await session(M);
    await S.tap("d0");
    S.ui.click(S.ui.find("data-qtyopen")); await flush();
    const pad = S.qtyPad();
    c("ج٤ لوحةُ الكمية لسطرٍ مرفوع بلا سقف", pad?.props.max === Infinity, String(pad?.props.max));
    pad.props.onSubmit(7); await flush(); await flush();
    c("  و٧ تُكتب كما هي والسطرُ معلَّم", S.line("p:d0")?.qty === 7 && S.line("p:d0")?.negLift === true, J(S.line("p:d0")));
    await S.tap("dw");
    const w = S.weight();
    c("  والوزنُ: منتقي الكيلو بلا سقف", w?.props.stockKg === Infinity, String(w?.props.stockKg));
    S.end();
  }
  /* ج٥ البيعة: يُسأل الخادم عن المعلَّم وحده بما سترسله البيعة */
  {
    const S = await session(M);
    await S.tap("d0"); await S.tap("d0"); await S.tap("d5");
    await S.tap("ds");
    await S.checkout();
    const call = S.N.calls.check[0];
    const lines = call?.lines ?? [];
    c("ج٥ البيعة: سؤالٌ واحد بالعيادة التي أجاب عنها الخادم، وسطورُ الوضع وحدها (لا التي ضمن رصيدها)",
      S.N.calls.check.length === 1 && call.c === "c1" && J(lines.map((l) => l.product_id).sort()) === J(["d0", "ds"]), J(call));
    c("  والكمّيتان كما سترسلهما البيعة", lines.find((l) => l.product_id === "d0")?.qty === 2 && lines.find((l) => l.product_id === "d0")?.stock_qty === 2 && lines.find((l) => l.product_id === "ds")?.stock_qty === 1, J(lines));
    const items = S.log.checkout[0]?.items ?? [];
    c("  والخادمُ قبل ⇒ البيعةُ تمّت بالكمّيات كما هي", S.log.checkout.length === 1 && items.find((i) => i.product_id === "d0")?.qty === 2 && items.find((i) => i.product_id === "d5")?.qty === 1, J(items.map((i) => [i.product_id, i.qty])));
    c("  وإشعارُ «تمّ» يطوي سالبَ كلّ ما يغطّيه الوضعُ لحظةَ البيعة — لا ما علّمه وحده (d5 بيع ضمن رصيد قائمةٍ قد تكون أقدم من الخادم، ومستهلكُ وصفة) — لا المعدودةَ ولا المجمَّعةَ ولا ما بلا كلفة",
      J([...(globalThis.__consNotice?.negFold ?? [])].sort()) === J(["d0", "d5", "dn", "ds", "dt", "dw"]), J(globalThis.__consNotice && { negFold: globalThis.__consNotice.negFold }));
    S.end();
  }
  {
    const S = await session(M, { draft: { cart: [{ id: "p:dt", kind: "product", product_id: "dt", name: "أقراص", barcode: null, unit_price: 200, unit_cost: 100, qty: 5, stock: 0,
      hasSubUnit: true, saleUnit: "sub", unitsPerBox: 10, subUnitName: "قرص", negLift: true }] } });
    await S.checkout();
    const l = S.N.calls.check[0]?.lines?.[0];
    c("  وسطرُ المفرد: ٥ أقراص من علبة ١٠ ⇒ stock_qty ٠٫٥ كما ترسلها البيعة (الكلفةُ بفرع المفرد)", l?.qty === 5 && l?.stock_qty === 0.5 && S.log.checkout[0]?.items?.[0]?.stock_qty === 0.5, J({ l, it: S.log.checkout[0]?.items?.[0] }));
    S.end();
  }
  /* ج٦ رفضٌ يغطّيه الرصيدُ الطازج يمرّ؛ وغيرُه نافذة، و«شيل الزايد» يقصّ ويكمل */
  {
    const S = await session(M, { neg: { check: (_c, lines) => ({ clinic: "c1", active: false, until: null, refused: lines.map((l) => ({ product_id: l.product_id, why: "off", name: "x", stock: 0 })) }) } });
    await S.tap("d0"); await S.tap("d0"); await S.tap("dn");
    S.log.asked.length = 0;
    globalThis.__sb.rows.set("d0", { ...P0, stock: 6 });
    globalThis.__sb.rows.set("dn", { ...PN, stock: 0 });
    await S.checkout();
    const k = S.chk();
    c("ج٦ الوضعُ انتهى بالخادم: سُئل الخادمُ عن الرصيد الطازج لكلّ مرفوض", S.log.asked.includes("d0") && S.log.asked.includes("dn"), J(S.log.asked));
    c("  وما غطّاه رصيدُه (٦ ≥ ٢) مرّ، والباقي بالنافذة بسببه وما يبقى منه (صفر ⇒ ينشال)", !!k && J(k.lines.map((l) => [l.id, l.why, l.keep])) === J([["p:dn", "off", 0]]) && S.log.checkout.length === 0,
      J(k?.lines));
    c("  والحالةُ تُسأل من جديد (الشريحةُ تقول «انتهى»)", S.N.calls.refresh >= 1);
    c("  والمسحُ مقفولٌ والنافذةُ مفتوحة", globalThis.__sb.scanner?.o?.disabled === true);
    await S.fire(() => k.onRemove());
    c("  «شيل الزايد»: السطرُ انشال والنافذةُ أُغلقت — ولا بيعةَ قبل أن يرى الكاشيرُ المجموعَ الجديد", S.log.checkout.length === 0 && !S.chkOpen()
      && J(S.cart().map((l) => [l.id, l.qty])) === J([["p:d0", 2]]), J({ sold: S.log.checkout.length, cart: S.cart().map((l) => [l.id, l.qty]) }));
    await S.checkout();
    const items = S.log.checkout[0]?.items ?? [];
    c("  ثمّ «إتمام البيع» يبيع الباقي", S.log.checkout.length === 1 && items.length === 1 && items[0].product_id === "d0" && items[0].qty === 2, J(items.map((i) => [i.product_id, i.qty])));
    S.end();
  }
  {
    const S = await session(M, { neg: { check: (_c, lines) => ({ clinic: "c1", active: true, until: null, refused: lines.filter((l) => l.product_id === "d0").map((l) => ({ product_id: l.product_id, why: "counted", name: "سيروم", stock: 1 })) }) } });
    await S.tap("d0"); await S.tap("d0"); await S.tap("d0"); await S.tap("dn");
    globalThis.__sb.rows.set("d0", { ...P0, stock: 1 });
    await S.checkout();
    const k = S.chk();
    c("ج٧ معدودةٌ برصيد ١ والسلّةُ ٣: النافذةُ تقول «يبقى منه ١»", !!k && k.lines.length === 1 && k.lines[0].why === "counted" && k.lines[0].keep === 1 && k.lines[0].stock === 1 && !k.allCart, J(k?.lines));
    await S.fire(() => k.onRemove());
    const before = S.log.checkout.length;
    await S.checkout();
    const it = S.log.checkout[0]?.items ?? [];
    c("  وبعد «شيل الزايد» ثمّ «إتمام البيع»: ١ منها وdn كما هي، والسطرُ المقصوص بلا علامة الوضع", before === 0 && S.log.checkout.length === 1 && it.find((i) => i.product_id === "d0")?.qty === 1 && it.find((i) => i.product_id === "dn")?.qty === 1, J(it.map((i) => [i.product_id, i.qty])));
    S.end();
  }
  {
    const S = await session(M, { neg: { check: (_c, lines) => ({ clinic: "c1", active: true, until: null, refused: lines.map((l) => ({ product_id: l.product_id, why: "zero_cost", name: "x", stock: 0 })) }) } });
    await S.tap("d0");
    await S.checkout();
    c("ج٨ كلُّ السلّة مرفوضةٌ ولا يبقى منها شيء ⇒ allCart (لا «شيل وكمّل» يُفرغها)", S.chk()?.allCart === true && S.log.checkout.length === 0, J(S.chk()?.lines));
    S.end();
  }
  /* ج٩ «ما تأكّدنا» يُقفل، و«جرّب مرّة ثانية» يسأل من جديد */
  {
    let n = 0;
    const S = await session(M, { neg: { check: () => { n++; if (n === 1) throw Object.assign(new Error("fetch failed"), { name: "TypeError" }); return { clinic: "c1", active: true, until: null, refused: [] }; } } });
    await S.tap("d0");
    await S.checkout();
    const k = S.chk();
    c("ج٩ فشلُ السؤال: «ما تأكّدنا» ولا بيعة", !!k && k.lines.every((l) => l.why === "unsure") && S.log.checkout.length === 0, J(k?.lines));
    await S.fire(() => k.onRetry());
    c("  و«جرّب مرّة ثانية» يسأل ثانيةً ويبيع", n === 2 && S.log.checkout.length === 1, J({ n, sold: S.log.checkout.length }));
    S.end();
  }
  {
    const S = await session(M);
    S.N.state = { ...S.N.state, clinic: null };
    await S.tap("d0");
    S.N.state = { ...S.N.state, clinic: null, at: performance.now() };
    await S.checkout();
    c("  وعيادةٌ لا نعرفها من الخادم «ما تأكّدنا» بلا سؤال", S.N.calls.check.length === 0 && S.chk()?.lines?.[0]?.why === "unsure" && S.log.checkout.length === 0);
    S.end();
  }
  /* ج١٠ إعادةُ مرجعٍ وافق عليه الخادمُ بنفس السلّة لا تُسأل */
  {
    const S = await session(M, { checkoutFails: 1 });
    await S.tap("d0"); await S.tap("d0");
    await S.checkout();
    const ref1 = S.log.checkout[0]?.meta?.client_ref;
    await S.checkout();
    const ref2 = S.log.checkout[1]?.meta?.client_ref;
    c("ج١٠ بيعةٌ مجهولةُ المصير ثمّ إعادة: المرجعُ نفسُه ولا سؤالَ ثانٍ (رفضُه الآن يحبسها بين «ربما انسجلت» و«ما تكمل»)",
      S.log.checkout.length === 2 && !!ref1 && ref1 === ref2 && S.N.calls.check.length === 1, J({ refs: [ref1, ref2], checks: S.N.calls.check.length }));
    S.end();
  }
  {
    const S = await session(M, { checkoutFails: 1 });
    await S.tap("d0"); await S.tap("d0");
    await S.checkout();
    await S.tap("d0");
    await S.checkout();
    c("  وسلّةٌ تغيّرت بعدها تُسأل من جديد", S.N.calls.check.length === 2, String(S.N.calls.check.length));
    S.end();
  }
  /* ج١١ الكمّيةُ الكبيرة بما يعادل العلب */
  {
    const S = await session(M);
    await S.tap("ds");
    S.ui.click(S.ui.find("data-qtyopen")); await flush();
    S.qtyPad().props.onSubmit(12); await flush(); await flush();
    await S.checkout();
    c("ج١١ ١٢ علبة مرفوعة ⇒ «تبيع الرصيد كلّه؟» يسأل", !!S.bigAsk() && S.log.checkout.length === 0);
    S.end();
  }
  {
    const S = await session(M, { draft: { cart: [{ id: "p:ds", kind: "product", product_id: "ds", name: "حبوب", barcode: null, unit_price: 0.02, unit_cost: 0.004, qty: 12, stock: 0,
      hasSubUnit: true, saleUnit: "sub", unitsPerBox: 1000, subUnitName: "حبة", negLift: true }] } });
    await S.checkout();
    c("  و١٢ حبّة من علبة ألف لا تسأل (٠٫٠١٢ علبة)", !S.bigAsk() && S.N.calls.check.length === 1, J({ big: !!S.bigAsk() }));
    S.end();
  }
  /* ج١٢ مطفأ: لا رفع، والرسائلُ كما كانت، و«انتهى» عن تحت الصفر */
  {
    const S = await session(M, { neg: { active: false, used: true } });
    const t0 = S.tile("d0");
    c("ج١٢ مطفأ: المادّةُ بالصفر «نفدت» كما كانت", t0?.props["data-out"] === true && !t0?.props["data-lifted"]);
    await S.tap("dn");
    c("  وتحت الصفر بعد الوضع: سُئلت الحالةُ والخادم، و«انتهى — لا تدخله من جديد» لا «زيد رصيده»", S.N.calls.refresh >= 1 && S.bar()?.say?.kind === "ended" && S.bar()?.say?.stock === -3 && !S.line("p:dn"), J({ r: S.N.calls.refresh, say: S.bar()?.say }));
    await S.tap("d0");
    c("  والصفرُ بلا سالب: الرسالةُ القديمة", S.log.errors.some(([m]) => String(m).includes("رصيده صفر")) && !S.line("p:d0"), J(S.log.errors));
    S.end();
  }
  {
    const S = await session(M, { neg: { active: false, used: true, onRefresh: (e) => { e.state = { ...e.state, active: true, at: performance.now() }; } } });
    await S.tap("d0");
    c("ج١٣ شُغّل للتو من جهازٍ ثانٍ: الضغطُ يسأل الحالةَ مع الخادم فيبيع لا «رصيده صفر»", S.line("p:d0")?.qty === 1 && S.line("p:d0")?.negLift === true, J({ l: S.line("p:d0"), e: S.log.errors }));
    S.end();
  }
  {
    const S = await session(M, { neg: { age: 125_000 } });
    c("ج١٤ جوابٌ عمرُه فوق دقيقتين لا يرفع", S.tile("d0")?.props["data-out"] === true);
    S.end();
  }
  /* ج١٦ قائمةٌ تحدّثت تحت كمية السطر والوضعُ يرفعه ⇒ يُعلَّم (كاتبٌ كغيره) */
  {
    const prods5 = ALL.map((p) => (p.id === "d5" ? { ...p, stock: 5 } : p));
    mem.clear();
    const S = await session(M, { products: prods5 });
    await S.tap("d5"); await S.tap("d5"); await S.tap("d5");
    c("ج١٦ ٣ من رصيد ٥: بلا علامة", S.line("p:d5")?.qty === 3 && !S.line("p:d5")?.negLift);
    await S.setProducts(ALL.map((p) => (p.id === "d5" ? { ...p, stock: 1 } : p)));
    c("  والقائمةُ تحدّثت لرصيد ١ والوضعُ يرفعها ⇒ السطرُ معلَّم، والكميةُ لا تُمسّ", S.line("p:d5")?.qty === 3 && S.line("p:d5")?.stock === 1 && S.line("p:d5")?.negLift === true, J(S.line("p:d5")));
    await S.checkout();
    c("  فيُسأل عنه الخادمُ قبل البيعة", S.N.calls.check.length === 1 && S.N.calls.check[0].lines[0]?.product_id === "d5", J(S.N.calls.check));
    S.end();
  }
  /* ج١٧ سلّةُ تبديل: راجعٌ ومادّةٌ مرفوعة يرفضها الخادم — لا «شيل وكمّل» يتركها إرجاعاً خالصاً يُخرج نقداً بلا تأكيد */
  {
    const S = await session(M, { neg: { check: (_c, lines) => ({ clinic: "c1", active: true, until: null, refused: lines.map((l) => ({ product_id: l.product_id, why: "counted", name: "x", stock: 0 })) }) } });
    await S.retMode(); await S.tap("d5"); await S.retMode();
    await S.tap("d0"); await S.tap("d0");
    globalThis.__sb.rows.set("d0", { ...P0, stock: 0 });
    await S.checkout();
    const k = S.chk();
    c("ج١٧ سلّةُ تبديل (راجعٌ + مرفوعةٌ مرفوضة كلُّها): «كلُّ السلّة» بسطور البيع وحدها — لا «شيل وكمّل»", !!k && k.allCart === true, J(k && { allCart: k.allCart, lines: k.lines }));
    if (k) await S.fire(() => k.onRemove());
    c("  ولو نُودي «شيل» فلا تكمل البيعةُ إرجاعاً خالصاً بلا تأكيد (لا retailReturn ولا بيعة)", !S.log.returns && S.log.checkout.length === 0 && S.cart().every((l) => l.ret), J({ ret: S.log.returns, sold: S.log.checkout.length, cart: S.cart().map((l) => l.id) }));
    S.end();
  }
  /* ج١٨ مادّةٌ مرفوعةٌ وجدها الخادمُ بالمسح (ليست بالقائمة): سقفُها وعلامتُها بصفّها لا بـ«ما بالقائمة» */
  {
    const PX = PRD({ id: "dx", name: "جديدة من جهازٍ ثانٍ", barcode: "XCODE" });
    const S = await session(M, { byCode: { XCODE: PX } });
    await S.scan("XCODE"); await S.scan("XCODE"); await S.scan("XCODE");
    const l = S.line("p:dx");
    c("ج١٨ مسحٌ وجده الخادمُ والوضعُ يرفعه: ثلاثُ مسحاتٍ ثلاث، والسطرُ معلَّم (لا «المتوفّر 0 فقط»)", l?.qty === 3 && l?.negLift === true
      && !S.log.errors.some(([m]) => String(m).includes("المتوفّر")), J({ l, e: S.log.errors }));
    S.end();
  }
  /* ج١٩ جوابٌ تجاوز دقيقتيه: الرفعُ يقف، والشريحةُ لا تُعلن «انتهى» (الوضعُ ما تغيّر) */
  {
    const S = await session(M, { neg: { age: 125_000 } });
    c("ج١٩ جوابٌ قديم: الكرتُ «نفدت» (لا رفع)، والشريحةُ على جواب الخادم «مفعّل» — لا إعلانَ «انتهى»", S.tile("d0")?.props["data-out"] === true && S.bar()?.view?.active === true, J({ out: S.tile("d0")?.props["data-out"], view: S.bar()?.view }));
    S.end();
  }
  /* ج٢٠ الإعفاءُ ينجو مع المسودّة: مهلةٌ ثم تبديلُ تبويب (إعادةُ تركيب) والوضعُ انتهى بينهما — الإعادةُ لا تُسأل ولا تُحبس */
  {
    const S = await session(M, { checkoutFails: 1 });
    await S.tap("d0"); await S.tap("d0");
    await S.checkout();
    const ref1 = S.log.checkout[0]?.meta?.client_ref;
    S.end();
    const S2 = await session(M, { keep: true, checkoutFails: 0, neg: { check: (_c, lines) => ({ clinic: "c1", active: false, until: null, refused: lines.map((l) => ({ product_id: l.product_id, why: "off", name: "x", stock: 0 })) }) } });
    await S2.checkout();
    c("ج٢٠ بعد إعادة التركيب: المرجعُ نفسُه ولا سؤالَ ثانٍ (الموافقةُ بالمسودّة) — والبيعةُ تكمل", !!ref1 && S2.log.checkout[0]?.meta?.client_ref === ref1 && S2.N.calls.check.length === 0 && !S2.chk(),
      J({ ref1, ref2: S2.log.checkout[0]?.meta?.client_ref, checks: S2.N.calls.check.length }));
    S2.end();
  }
  /* ج٢١ ومحاولةٌ مجهولةُ المصير ثم سلّةٌ تغيّرت فرُفضت: لا «شيل وكمّل» تحت مرجعها */
  {
    let n = 0;
    const S = await session(M, { checkoutFails: 1, neg: { check: (_c, lines) => { n++; return { clinic: "c1", active: n === 1, until: null, refused: n === 1 ? [] : lines.map((l) => ({ product_id: l.product_id, why: "off", name: "x", stock: 0 })) }; } } });
    await S.tap("d0"); await S.tap("d0");
    await S.checkout();
    await S.tap("d0");
    await S.checkout();
    const k = S.chk();
    c("ج٢١ مرجعٌ معلَّق والسلّةُ تغيّرت فرُفضت: النافذةُ مقفلة (locked) — ارجع أو تأكّد من الفواتير", !!k && k.locked === true, J(k && { locked: k.locked }));
    S.end();
  }
  /* ج٢٢ الوزنُ المرفوع: ٣٠ كيلو يسأل «الكمية كبيرة»، و٢٠ لا (قاعدةُ bigLifted نفسُها) */
  {
    for (const [kg, want] of [[30, true], [20, false]]) {
      const S = await session(M, { draft: { cart: [{ id: "p:dw", kind: "product", product_id: "dw", name: "علف", barcode: null, unit_price: 2500, unit_cost: 2000, qty: kg, stock: 0, byWeight: true, negLift: true }] } });
      await S.checkout();
      c(`ج٢٢ وزنٌ مرفوع ${kg} كغ: ${want ? "يسأل" : "لا يسأل"}`, !!S.bigAsk() === want, J({ big: !!S.bigAsk() }));
      S.end();
    }
  }
  /* ج٢٣ النافذةُ مفتوحة: طريقٌ ثانٍ للإتمام (F2 بالشاشة الجديدة يصل checkout مباشرةً) لا يسأل ولا يبيع خلفها */
  {
    let n = 0;
    const S = await session(M, { neg: { check: () => { n++; if (n === 1) throw Object.assign(new Error("fetch failed"), { name: "TypeError" }); return { clinic: "c1", active: true, until: null, refused: [] }; } } });
    await S.tap("d0");
    await S.checkout();
    const k = S.chk();
    await S.checkout();
    c("ج٢٣ «ما تأكّدنا» مفتوحة وضغطةُ إتمامٍ ثانية: لا سؤالَ ثانٍ ولا بيعةٌ خلف النافذة، وهي باقية", !!k && n === 1 && S.log.checkout.length === 0 && S.chkOpen(),
      J({ n, sold: S.log.checkout.length, open: S.chkOpen() }));
    const kk = S.chk(); if (kk) await S.fire(() => kk.onRetry());
    c("  و«جرّب مرّة ثانية» يكمل بعد أن تُغلق: سؤالٌ ثانٍ وبيعةٌ واحدة، ولا نافذةَ فوق «تمّ»", n === 2 && S.log.checkout.length === 1 && !S.chkOpen(), J({ n, sold: S.log.checkout.length }));
    S.end();
  }
  /* ج٢٤ جوابُ «مفعّل» تجاوز دقيقتيه وسؤالُه ما رجع: لا «انتهى» ولا «زيد رصيده» — «ما تأكّدنا» */
  {
    const S = await session(M, { neg: { age: 125_000, onRefresh: () => {} } });
    await S.tap("dn");
    const say1 = S.bar()?.say;
    c("ج٢٤ جوابٌ قديمٌ وسؤالُه ما رجع: تحت الصفر «ما تأكّدنا» لا «انتهى — لا تدخله»، ولا سطر", say1?.kind === "unsure" && say1?.name === "سالبة" && !S.line("p:dn"), J(say1));
    await S.tap("d0");
    const say2 = S.bar()?.say;
    c("  والصفرُ كذلك «ما تأكّدنا» لا «رصيده صفر — زيد رصيده»", say2?.kind === "unsure" && say2.n > (say1?.n ?? 0) && !S.log.errors.some(([m]) => String(m).includes("رصيده صفر")) && !S.line("p:d0"),
      J({ say2, e: S.log.errors }));
    await S.tap("dz");
    const say3 = S.bar()?.say;
    c("  وما بلا كلفة كذلك (الوضعُ ربما شغّال فسببُه «سعر الشراء»، أو انتهى) — لا «رصيده صفر»", say3?.kind === "unsure" && say3.n > say2.n && !S.log.errors.some(([m]) => String(m).includes("رصيده صفر")), J({ say3, e: S.log.errors }));
    await S.tap("dc");
    const say4 = S.bar()?.say;
    c("  والمعدودةُ «انعدّت» كما هي — سببُها لا يتبع عمرَ الجواب", say4?.kind === "counted" && say4.n > say3.n, J(say4));
    S.end();
  }
  /* ج٢٥ الرصيدُ تحت الصفر بكسره */
  {
    const PF = PRD({ id: "df", name: "شريط", has_sub_unit: true, units_per_box: 20, sub_unit_name: "حبة", sub_unit_price: 100, stock: -0.25 });
    const S = await session(M, { products: [...ALL, PF] });
    const bdi = S.ui.all().find((n) => n.type === "bdi" && n.props["data-neg-stock"] !== undefined && S.ui.text(n).includes("0.2"));
    c("ج٢٥ ربعُ علبةٍ تحت الصفر (٥ حبّات من شريط ٢٠) يُرسم بكسره «-0.25» لا «-0»", S.tile("df")?.props["data-lifted"] === true && !!bdi && S.ui.text(bdi) === "-0.25",
      S.ui.all().filter((n) => n.type === "bdi").map((n) => S.ui.text(n)).join(","));
    S.end();
  }
  /* ج٢٦ صفُّ القائمة بائت (كلفتُه صفر) والخادمُ بكلفة: الرفعُ بصفّ الخادم لا يُبطله صفُّ القائمة */
  {
    const LZ = PRD({ id: "dl", name: "كتبوا سعرها", purchase_price: 0 });
    const S = await session(M, { products: [...ALL, LZ], rows: [...ALL, { ...LZ, purchase_price: 1000 }] });
    await S.tap("dl");
    const l1 = S.line("p:dl");
    c("ج٢٦ القائمةُ بلا كلفة والخادمُ بكلفة (كتبها المديرُ للتو): سطرٌ معلَّم بلا «المتوفّر 0 فقط»", l1?.qty === 1 && l1?.negLift === true
      && !S.log.errors.some(([m]) => String(m).includes("المتوفّر")), J({ l1, e: S.log.errors }));
    S.ui.click(S.ui.find("data-qtyopen")); await flush();
    c("  ولوحةُ كميته بلا سقف (الصفُّ الذي رفعه يحكم حتى تأتي القائمةُ به)", S.qtyPad()?.props.max === Infinity, String(S.qtyPad()?.props.max));
    S.end();
  }
  /* ج٢٧ العلامةُ تُراجَع مع كلّ قائمة: كلفةٌ وصلت والرصيدُ نفسُه */
  {
    const LZ = PRD({ id: "dl", name: "كتبوا سعرها", purchase_price: 0 });
    const S = await session(M, { products: [...ALL, LZ], draft: { cart: [{ id: "p:dl", kind: "product", product_id: "dl", name: "كتبوا سعرها", barcode: null, unit_price: 1500, unit_cost: 0, qty: 2, stock: 0 }] } });
    c("ج٢٧ سطرٌ فوق رصيده وكلفتُه صفر: بلا علامة", S.line("p:dl") && S.line("p:dl").negLift !== true, J(S.line("p:dl")));
    await S.setProducts([...ALL, { ...LZ, purchase_price: 1000 }]);
    c("  والقائمةُ جاءت بكلفته والرصيدُ نفسُه: يُعلَّم", S.line("p:dl")?.negLift === true, J(S.line("p:dl")));
    await S.checkout();
    c("  فيُسأل عنه الخادمُ قبل البيعة", S.N.calls.check.some((x) => x.lines.some((l) => l.product_id === "dl")), J(S.N.calls.check));
    S.end();
  }
  /* ج٢٨ نافذةٌ لم تُرسم (قطعتُها فشلت): الضغطةُ التالية تسأل من جديد — لا زرٌّ ميّتٌ بلا كلمة */
  {
    let n = 0;
    globalThis.__negChkThrow = true;
    const S = await session(M, { neg: { check: () => { n++; if (n === 1) throw Object.assign(new Error("fetch failed"), { name: "TypeError" }); return { clinic: "c1", active: true, until: null, refused: [] }; } } });
    await S.tap("d0");
    await S.checkout();
    const failed = S.ui.all().some((x) => x.type === "x-LoadFailed");
    await S.checkout();
    globalThis.__negChkThrow = false;
    c("ج٢٨ نافذةُ الوضع ما انرسمت (قطعتُها فشلت): الضغطةُ التالية تسأل الخادمَ من جديد فتبيع — لا زرٌّ ميّت", failed && n === 2 && S.log.checkout.length === 1,
      J({ failed, n, sold: S.log.checkout.length }));
    S.end();
  }
  /* ج٢٩ نوافذُ التأكيد لا تعيش بعد بيعتها: «تبيع الرصيد كلّه؟» كانت تبقى خلف «تمّ» وترجع فوق سلّة الزبون التالي، و«نعم، بيع» تبيعها */
  {
    let n = 0;
    const S = await session(M, { neg: { check: (_c, lines) => { n++; return n === 1 ? { clinic: "c1", active: true, until: null, refused: [] }
      : { clinic: "c1", active: false, until: null, refused: lines.map((l) => ({ product_id: l.product_id, why: "off", name: "x", stock: 0 })) }; } },
      draft: { cart: [{ id: "p:d0", kind: "product", product_id: "d0", name: "سيروم", barcode: null, unit_price: 1500, unit_cost: 1000, qty: 12, stock: 0, negLift: true },
        { id: "p:d5", kind: "product", product_id: "d5", name: "بالرفّ", barcode: null, unit_price: 1500, unit_cost: 1000, qty: 1, stock: 5 }] } });
    await S.checkout();
    const big1 = !!S.bigAsk();
    await S.checkout();
    const k = S.chk();
    if (k) await S.fire(() => k.onRemove());
    await S.checkout();
    const sold = S.log.checkout.length;
    const nb = S.ui.all().find((x) => x.type === "button" && S.ui.text(x).includes("New sale"));
    if (nb) S.ui.click(nb);
    await flush();
    c("ج٢٩ «تبيع الرصيد كلّه؟» مفتوحةٌ وبيعةٌ تمّت بطريقٍ ثانٍ: بعد «بيع جديد» لا ترجع فوق السلّة الجديدة", big1 && !!k && sold === 1 && !!nb && !S.bigAsk(),
      J({ big1, k: !!k, sold, nb: !!nb, bigAfter: !!S.bigAsk() }));
    S.end();
  }
  /* ج٣٠ مرجعٌ قائمٌ وسلّةٌ تغيّرت تحته فوافق الخادمُ ثانيةً: الموافقةُ الجديدة تنجو مع المسودّة */
  {
    const S = await session(M, { checkoutFails: 2 });
    await S.tap("d0"); await S.tap("d0");
    await S.checkout();
    await S.tap("d0");
    await S.checkout();
    const ref1 = S.log.checkout[0]?.meta?.client_ref;
    const asked1 = S.N.calls.check.length;
    S.end();
    const S2 = await session(M, { keep: true, checkoutFails: 0, neg: { check: (_c, lines) => ({ clinic: "c1", active: false, until: null, refused: lines.map((l) => ({ product_id: l.product_id, why: "off", name: "x", stock: 0 })) }) } });
    await S2.checkout();
    c("ج٣٠ موافقةٌ ثانية لمرجعٍ قائم (السلّةُ زادت تحته) تُحفظ بالمسودّة: الإعادةُ بعد تبديل تبويب لا تُسأل ولا تُقفل — تبيع بالمرجع نفسِه",
      asked1 === 2 && S2.N.calls.check.length === 0 && S2.log.checkout.length === 1 && S2.log.checkout[0]?.meta?.client_ref === ref1 && S2.log.checkout[0]?.items?.[0]?.qty === 3,
      J({ asked1, checks: S2.N.calls.check.length, sold: S2.log.checkout.length, ref: [ref1, S2.log.checkout[0]?.meta?.client_ref] }));
    S2.end();
  }
  /* ج٣١ الحالةُ تصل بالضغطة نفسِها (أوّلُ مسحةٍ بعد الفتح): الشريحةُ تقول «انتهى» حين تُركَّب — لا «زيد رصيده من المخزن» */
  {
    globalThis.__negBarHold = true;   // قطعتُها ما وصلت بعد: الرسالةُ تُسلَّم لها لا تُقال بنصٍّ حارّ
    const S = await session(M, { neg: { noState: true, onRefresh: (e) => { e.state = { clinic: "c1", active: false, used: true, until: null, since: null,
      endedAt: new Date(realNow() - DAY).toISOString(), serverNow: new Date(realNow()).toISOString(), at: performance.now() }; } } });
    const barBefore = !!S.bar();
    await S.tap("dn");
    await flush();
    const say = S.bar()?.say;
    c("ج٣١ الحالةُ وصلت مع الضغطة والشريحةُ ما رُكّبت بعد: «انتهى» تقولها الشريحةُ حين تُركَّب — لا نصُّ التوائم «زيد رصيده»", !barBefore && say?.kind === "ended" && say?.stock === -3
      && !S.log.errors.some(([m]) => String(m).includes("زيد رصيده")) && S.log.errors.length === 0, J({ barBefore, say, e: S.log.errors }));
    S.end();
    globalThis.__negBarHold = false;
  }
  /* ج٣٢ «مفعّل» قديمٌ وسطرٌ قائم بلا مكان: «ما تأكّدنا» لا «المتوفّر 0 فقط وكلُّه بالسلّة» */
  {
    const S = await session(M);
    await S.tap("d0");
    S.N.state = { ...S.N.state, at: performance.now() - 125_000 };
    S.N.onRefresh = () => {};
    await S.tap("d0");
    const say = S.bar()?.say;
    c("ج٣٢ سطرٌ مرفوعٌ قائم والجوابُ شاخ وسؤالُه ما رجع: «ما تأكّدنا» لا «المتوفّر 0 فقط»، والسطرُ كما هو", say?.kind === "unsure" && S.line("p:d0")?.qty === 1
      && !S.log.errors.some(([m]) => String(m).includes("المتوفّر")), J({ say, e: S.log.errors, l: S.line("p:d0") }));
    S.end();
  }
  /* ج٣٣ «شيل الزايد» مع مجموعٍ مثبَّت: لا يُسجَّل المجموعُ القديم لبضاعةٍ انشال منها (الجذرُ المتزامن كالمتصفّح) */
  {
    const line = (o) => ({ kind: "product", barcode: null, ...o });
    const S = await session(M, {
      draft: { cart: [line({ id: "p:d0", product_id: "d0", name: "سيروم", unit_price: 1500, unit_cost: 1000, qty: 3, stock: 0, negLift: true }),
        line({ id: "p:d5", product_id: "d5", name: "بالرفّ", unit_price: 1500, unit_cost: 1000, qty: 2, stock: 5 })], finalOverride: 7000 },
      neg: { check: (_c, lines) => ({ clinic: "c1", active: true, until: null,
        refused: lines.filter((l) => l.product_id === "d0").map(() => ({ product_id: "d0", why: "counted", name: "سيروم", stock: 1 })) }) },
    });
    globalThis.__sb.rows.set("d0", { ...P0, stock: 1 });
    await S.checkout();
    const k = S.chk();
    if (k) await S.fire(() => k.onRemove());
    const soldAtRemove = S.log.checkout.length;
    await S.checkout();
    const sale = S.log.checkout[0];
    const worth = (sale?.items ?? []).reduce((s2, i) => s2 + i.qty * i.unit_price, 0);
    c("ج٣٣ مجموعٌ مثبَّت (٧٬٠٠٠ عن ٧٬٥٠٠) و«شيل الزايد»: لا بيعةَ بالضغطة، ثمّ «إتمام البيع» بالمجموع المتحرّك نفسِه (٤٬٠٠٠ عن ٤٬٥٠٠) — لا ٧٬٠٠٠",
      soldAtRemove === 0 && worth === 4500 && sale?.meta?.final_total === 4000 && sale?.meta?.amount_paid === 4000,
      J({ soldAtRemove, worth, final: sale?.meta?.final_total, paid: sale?.meta?.amount_paid }));
    S.end();
  }
  /* ج٣٤ «+» على سطر بيعٍ قائم و«راجع» مفعّل: بيعٌ لا إرجاع (كان يضيف سطرَ إرجاعٍ لما يأخذه الزبون — قائمٌ قبل الوضع) */
  {
    // الوضعُ مطفأ: السقفُ يحكم فيمرّ «+» من sellOrExplain (مفعّلاً يرفع d5 فتُكتب الكميةُ مباشرةً ولا يُختبر شيء).
    const S = await session(M, { neg: { active: false, used: false }, products: ALL.map((p) => (p.id === "d5" ? { ...p, stock: 1 } : p)) });
    await S.tap("d5");
    await S.retMode();
    const retOn = S.ui.find("data-retmode")?.props["aria-pressed"] === true;
    await S.plus("p:d5");
    c("ج٣٤ «+» على سطر بيعٍ بسقفه و«راجع» مفعّل: لا سطرَ إرجاع — يُسأل الخادمُ ويُضاف للبيع", retOn && !S.cart().some((l) => l.ret) && S.line("p:d5")?.qty === 2,
      J(S.cart().map((l) => [l.id, l.qty, !!l.ret])));
    S.end();
  }
  /* ج٣٥ مادّةٌ رفعها الوضعُ بصفٍّ خامٍّ من المسح (بلا حوض قسمها) ثمّ شاخ الجواب: «+» يقرأ صفَّ القائمة لا الخامّ */
  {
    const PL = PRD({ id: "dy", name: "بحوض القسم", stock: 5 });
    const RAW = { ...PL, stock: 0, barcode: "YCODE" };
    const S = await session(M, { products: [...ALL, PL], byCode: { YCODE: RAW } });
    await S.scan("YCODE");
    const lifted = S.line("p:dy")?.negLift === true;
    S.N.state = { ...S.N.state, at: performance.now() - 125_000 };
    S.N.onRefresh = () => {};
    await S.plus("p:dy");
    c("ج٣٥ صفٌّ خامٌّ من المسح رفعه الوضع ثمّ شاخ الجواب: «+» بصفّ القائمة (٥ بحوضها) فيُضاف — لا «المتوفّر 0» ولا «ما عاد موجود»", lifted && S.line("p:dy")?.qty === 2
      && !S.log.errors.some(([m]) => /المتوفّر|ما عاد موجود/.test(String(m))), J({ lifted, l: S.line("p:dy"), e: S.log.errors }));
    S.end();
  }
  /* ج١٥ سطرٌ تجاوز رصيده بلا الوضع (قائمةٌ قديمة) لا يُسأل عنه — قرارُ المالك ب٢ */
  {
    const S = await session(M, { neg: { active: false, used: false }, draft: { cart: [{ id: "p:d5", kind: "product", product_id: "d5", name: "بالرفّ", barcode: null, unit_price: 1500, unit_cost: 1000, qty: 7, stock: 5 }] } });
    await S.checkout();
    c("ج١٥ سطرٌ فوق رصيده بلا علامة الوضع يمرّ كما كان بلا سؤال", S.N.calls.check.length === 0 && S.log.checkout.length === 1, J({ c: S.N.calls.check.length, s: S.log.checkout.length }));
    S.end();
  }
}

/* ══ د) المكوّنان الحقيقيّان: النافذة والبطاقة ═══════════════════════════════════════ */
const OWNER_FROM = (() => {
  const m = /export function ownerAccountFrom\([\s\S]*?\n\}/.exec(READ("src/lib/managerOverride.ts"));
  if (!m) { console.error("✗ neg-stock-test: ما انقرأت ownerAccountFrom"); process.exit(1); }
  return esbuild.transformSync(m[0], { loader: "ts" }).code;
})();
async function uiChecks(c) {
  const U = await loadUI('export { NegCheckoutDialog, NegStockCard, NegBar, negErrorText } from "./src/components/negstock/NegStock.tsx";', {
    "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar" } }); export default {};`,
    "react-router-dom": `import { createElement } from "react"; export const Link = ({ to, children, ...p }) => createElement("a", { ...p, href: to }, children); export const useNavigate = () => (to) => { globalThis.__nav = to; };`,
    "@/components/ui": `import { createElement } from "react";
      export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
      export const Dialog = ({ open, title, children, footer, size, onClose, ...p }) => (open ? createElement("x-Dialog", { ...p, title }, children, footer) : null);
      const T = { toast: (x) => (globalThis.__toasts ||= []).push(x?.title ?? ""), success: (m) => (globalThis.__toasts ||= []).push(m), error: (m) => (globalThis.__toasts ||= []).push(m), warn() {} };
      export const useToast = () => T;`,
    "@/hooks/usePermissions": `export const usePermissions = () => globalThis.__perm;`,
    /* ownerAccountFrom الحقيقيّة نصّاً (managerOverride.ts يجرّ الإقلاع لو حُزم): المديرُ بدوره الأساس، بلا قفل جهاز ولا مفتاحٍ مؤقّت. */
    "@/lib/managerOverride": `export const useOverride = () => globalThis.__ov; ${OWNER_FROM}`,
    "@/lib/negStockApi": `export const negApi = { report: async () => globalThis.__rep(), set: async (...a) => { (globalThis.__sets ||= []).push(a); return globalThis.__setRes ? globalThis.__setRes(...a) : {}; } };`,
  });
  const lines = [{ id: "p:a", name: "سيروم", qty: 5, stock: -2, why: "counted", keep: 0 }, { id: "p:b", name: "شامبو", qty: 3, stock: 1, why: "off", keep: 1 }];
  let removed = 0;
  let ui = U.mount(U.React.createElement(U.NegCheckoutDialog, { open: true, lines, allCart: false, onRemove: () => { removed++; }, onRetry() {}, onBack() {} }));
  const keepA = ui.find("data-neg-chk-keep", "0"), keepB = ui.find("data-neg-chk-keep", "1");
  c("د١ النافذة: كلُّ سطرٍ بسببه وما يبقى منه («ينشال كلّه» / «يبقى منه ١»)", ui.text(keepA) === "nstk.chk.drop" && ui.text(keepB) === `nstk.chk.keep|${J({ n: "1" })}`, J([ui.text(keepA), ui.text(keepB)]));
  c("  والرصيدُ تحت الصفر بالجملة معزولٌ باتّجاهه (LRI…PDI)", ui.text().includes("⁦-2⁩"), J(ui.text().slice(0, 200)));
  ui.click(ui.find("data-neg-chk-remove"));
  c("  و«شيل الزايد وكمّل» ينادي onRemove", removed === 1 && !ui.find("data-neg-chk-retry"));
  ui.unmount();
  ui = U.mount(U.React.createElement(U.NegCheckoutDialog, { open: true, lines: [{ id: "p:a", name: "x", qty: 1, stock: 0, why: "off", keep: 0 }], allCart: true, onRemove() {}, onRetry() {}, onBack() {} }));
  c("  وallCart: لا «شيل وكمّل»، والسببُ «مطفّى» ⇒ «خلّي المدير يمدّد»", !ui.find("data-neg-chk-remove") && ui.text(ui.find("data-neg-chk-allcart")) === "nstk.chk.allCartOff");
  ui.unmount();
  ui = U.mount(U.React.createElement(U.NegCheckoutDialog, { open: true, lines: [{ id: "p:a", name: "x", qty: 1, stock: null, why: "unsure" }], allCart: false, onRemove() {}, onRetry() {}, onBack() {} }));
  c("  و«ما تأكّدنا»: جرّب ثانيةً وارجع — لا «شيل»", !!ui.find("data-neg-chk-retry") && !ui.find("data-neg-chk-remove") && ui.text().includes("nstk.chk.unsure"));
  ui.unmount();
  ui = U.mount(U.React.createElement(U.NegCheckoutDialog, { open: true, lines: [{ id: "p:g", name: "راحت", qty: 2, stock: null, why: "gone", keep: 0 }], allCart: false, onRemove() {}, onRetry() {}, onBack() {} }));
  c("  وما عادت بالمخزن: «بالسلة ٢» بلا «رصيده بالنظام 0» (صفٌّ غائب لا رصيدَ له)", ui.text().includes(`nstk.chk.lineGone|${J({ qty: "2" })}`) && !ui.text().includes("nstk.chk.line|"), ui.text().slice(0, 200));
  ui.unmount();

  /* البطاقة */
  const NOW = realNow();
  const REP = (o = {}) => ({ clinic: "c1", active: false, used: false, until: null, since: null, endedAt: null, serverNow: new Date(NOW).toISOString(), at: performance.now(),
    periodSince: new Date(NOW).toISOString(), capUntil: new Date(NOW + 60 * DAY).toISOString(), operator: false,
    negatives: 0, neverCounted: 12, uncountedNonpos: 4, uncountedNeg: 0, zeroCost: 3, zeroCostNonpos: 2, pending: 1, log: [], ...o });
  globalThis.__perm = { role: "manager", baseRole: "manager", can: () => true };
  globalThis.__ov = { active: false, deviceLocked: false };
  globalThis.__rep = async () => REP();
  globalThis.__sets = [];
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  const all = () => ui.all();
  const btnBy = (pred) => all().find((n) => n.type === "button" && pred(ui.text(n), n));
  const on = btnBy((s) => s.startsWith("nstk.set.turnOn"));
  c("د٢ البطاقة: مطفأ ⇒ زرُّ التشغيل مقفولٌ حتى الإقرار", !!on && on.props.disabled === true, J(on?.props.disabled));
  c("  وتقول قبل التشغيل: ٣ بلا سعر شراء ورابطُها للمخزون، و١٢ ما انعدّت منها ٤ بالصفر، و١ ينتظر الموافقة",
    ui.text().includes(`nstk.set.zeroCost|${J({ n: 3 })}`) && !!all().find((n) => n.type === "a" && n.props.href === "/inventory?filter=nocost")
    && ui.text().includes(`nstk.set.neverCounted|${J({ n: 12, z: 4 })}`) && ui.text().includes(`nstk.set.pending|${J({ n: 1 })}`), ui.text().slice(0, 400));
  const ack = all().find((n) => n.type === "input" && n.props.type === "checkbox");
  ack?.props.onChange?.({ target: { checked: true } }); await ui.settle();
  const on2 = btnBy((s) => s.startsWith("nstk.set.turnOn"));
  c("  وبعد الإقرار يُفتح", !!on2 && !on2.props.disabled);
  globalThis.__setRes = () => ({});
  globalThis.__rep = async () => REP({ active: true, used: true, until: new Date(NOW + 7 * DAY).toISOString(), log: [{ at: new Date(NOW).toISOString(), action: "on", since: new Date(NOW).toISOString(), until: new Date(NOW + 7 * DAY).toISOString(), byName: "د. سارة", note: null, negatives: 0, neverCounted: 12, pending: 1 }] });
  ui.click(on2); await ui.settle();
  const s0 = globalThis.__sets[0] ?? [];
  c("  والتشغيلُ يرسل العيادةَ التي رأتها البطاقة والمدّةَ والإقرار", s0[0] === "c1" && s0[1] === true && Number.isInteger(s0[2]) && s0[3] === true, J(s0));
  const off = btnBy((s) => s === "nstk.set.turnOff");
  c("  ومفعّل ⇒ «أطفئه» يفتح لوحةً تقول ما بقي (لا window.confirm) قبل الإطفاء", !!off);
  if (off) { ui.click(off); await ui.settle(); }
  c("  واللوحةُ تقول: الإطفاءُ ما يغيّر رصيد ولا رقم، و«كمّل الجرد أول»", ui.text().includes("nstk.set.offSafe") && ui.text().includes("nstk.set.keepCounting") && globalThis.__sets.length === 1);
  const backBtn = all().find((n) => n.type === "button" && "data-neg-off-back" in n.props);
  if (backBtn) { ui.click(backBtn); await ui.settle(); }
  c("  و«رجوع» يرجّع النموذج بلا إطفاء (كانت اللوحةُ بلا مخرج إلا الإطفاء أو مغادرة الصفحة)", !!backBtn && !ui.find("data-neg-offask") && !!btnBy((s) => s === "nstk.set.turnOff") && globalThis.__sets.length === 1);
  ui.unmount();
  /* لوحةُ الإطفاء تقول ما بقي فعلاً: «كلّ المواد انعدّت» حين لا يبقى غيرُ معدودٍ وحده، و«منها تحت الصفر» لغير المعدودة. */
  const offText = async (o) => {
    globalThis.__rep = async () => REP({ active: true, used: true, until: new Date(NOW + 5 * DAY).toISOString(), pending: 0, ...o });
    const u = U.mount(U.React.createElement(U.NegStockCard, {}));
    await u.settle();
    const b = u.all().find((n) => n.type === "button" && u.text(n) === "nstk.set.turnOff");
    if (b) { u.click(b); await u.settle(); }
    const txt = u.text(u.find("data-neg-off-left") ?? { type: "#text", text: "", children: [] });
    u.unmount();
    return txt;
  };
  const tOff = [
    await offText({ neverCounted: 0, uncountedNonpos: 0, uncountedNeg: 0, negatives: 2 }),
    await offText({ neverCounted: 12, uncountedNonpos: 0, uncountedNeg: 0, negatives: 2 }),
    await offText({ neverCounted: 12, uncountedNonpos: 4, uncountedNeg: 0, negatives: 5 }),
    await offText({ neverCounted: 12, uncountedNonpos: 4, uncountedNeg: 2, negatives: 5 }),
  ];
  c("د٢ب لوحةُ الإطفاء: «كلّها انعدّت» حين لا يبقى غيرُ معدود وحده؛ ١٢ ما انعدّت ورصيدُها موجب تُقال؛ ٤ بالصفر بلا سالب؛ و«منها ٢ تحت الصفر» لا ٥ (المعدودةُ خارجها)",
    tOff[0] === "nstk.set.offClean" && tOff[1] === `nstk.set.offUncounted|${J({ n: 12 })}` && tOff[2] === `nstk.set.offLeftZero|${J({ n: 4 })}`
      && tOff[3] === `nstk.set.offLeft|${J({ n: 4, neg: 2 })}`, J(tOff));
  /* والرسالةُ من جواب الخادم: تمديدٌ لم يُطل (مديرٌ ثانٍ مدّده أبعد) «ما تغيّر شي»، وإطفاءُ ما انطفى أصلاً «كان مطفّى». */
  const U5 = new Date(NOW + 5 * DAY).toISOString(), SNOW = new Date(NOW).toISOString();
  const outcome = async (setRes, act) => {
    globalThis.__rep = async () => REP({ active: true, used: true, until: U5 });
    globalThis.__setRes = setRes;
    globalThis.__toasts = [];
    const u = U.mount(U.React.createElement(U.NegStockCard, {}));
    await u.settle();
    const btn = (pred) => u.all().find((n) => n.type === "button" && pred(u.text(n), n));
    if (act === "extend") {
      u.all().find((n) => n.type === "input" && n.props.type === "checkbox")?.props.onChange?.({ target: { checked: true } }); await u.settle();
      const b = btn((t2) => t2.startsWith("nstk.set.extend"));
      if (b) { u.click(b); await u.settle(); }
    } else {
      const b = btn((t2) => t2 === "nstk.set.turnOff");
      if (b) { u.click(b); await u.settle(); }
      const now2 = u.all().find((n) => n.type === "button" && "data-neg-off-now" in n.props);
      if (now2) { u.click(now2); await u.settle(); }
    }
    u.unmount();
    return [...globalThis.__toasts];
  };
  /* tx1: البطاقةُ فُتحت قبل تمديدِ مديرٍ ثانٍ أبعد (تقريرُها لحد U5 والخادمُ لحد U30): ضغطتُها لم تكتب شيئاً — «ما تغيّر شي» لا «تمدّد». */
  const U30 = new Date(NOW + 30 * DAY).toISOString();
  const tx1 = await outcome(() => ({ active: true, used: true, until: U30, serverNow: SNOW, endedAt: null, changed: false, action: null }), "extend");
  const tx2 = await outcome(() => ({ active: true, used: true, until: new Date(NOW + 12 * DAY).toISOString(), serverNow: SNOW, endedAt: null, changed: true, action: "extend" }), "extend");
  const tx3 = await outcome(() => ({ active: false, used: true, until: U5, serverNow: SNOW, endedAt: SNOW, changed: true, action: "off" }), "off");
  const tx4 = await outcome(() => ({ active: false, used: true, until: U5, serverNow: SNOW, endedAt: new Date(NOW - DAY).toISOString(), changed: false, action: null }), "off");
  c("د٢ج الرسالةُ مما فعله الخادم: ضغطةٌ لم تكتب (مديرٌ ثانٍ مدّد أبعد — والبطاقةُ على تقريرها القديم) «ما تغيّر شي»، وتمديدٌ كُتب «تمدّد» بيوم الخادم، وإطفاءٌ كُتب «انطفى»، وما انطفى أصلاً «كان مطفّى»",
    tx1.length === 1 && tx1[0].startsWith("nstk.set.unchanged|") && tx2.length === 1 && tx2[0].startsWith("nstk.set.extended|")
      && tx3.length === 1 && tx3[0] === "nstk.set.turnedOff" && tx4.length === 1 && tx4[0].startsWith("nstk.set.alreadyOff|"), J({ tx1, tx2, tx3, tx4 }));
  globalThis.__setRes = () => ({});
  globalThis.__perm = { role: "receptionist", baseRole: "receptionist", can: () => true };
  globalThis.__rep = async () => REP();
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  c("د٣ الاستقبالُ يرى الحالةَ ولا يرى أزرار التشغيل («للمدير من حسابه»)", !btnBy((s) => s.startsWith("nstk.set.turnOn")) && ui.text().includes("nstk.set.managerOnly"));
  ui.unmount();
  /* صاحبُ الحساب ومفتاحُ المدير المؤقّت مفتوحٌ بالجهاز (جهازُ استقبالٍ مشترك): لا يتصرّف — الخادمُ لا يرى المفتاحَ المحلّيّ. */
  globalThis.__perm = { role: "manager", baseRole: "manager", can: () => true };
  globalThis.__ov = { active: true, deviceLocked: false };
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  c("  وصاحبُ الحساب والمفتاحُ المؤقّت مفتوحٌ بالجهاز: «للمدير من حسابه» أيضاً", !btnBy((s) => s.startsWith("nstk.set.turnOn")) && ui.text().includes("nstk.set.managerOnly"));
  ui.unmount();
  globalThis.__ov = { active: false, deviceLocked: false };
  /* المشغّل: «شغّله» مقفولٌ حتى يكتب الملاحظة (ولو أقرّ)، والسقفُ لا يقفل مُدَدَه. */
  globalThis.__perm = { role: "receptionist", baseRole: "receptionist", can: () => true };
  globalThis.__rep = async () => REP({ operator: true, capUntil: new Date(NOW + 10 * DAY).toISOString() });
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  all().find((n) => n.type === "input" && n.props.type === "checkbox")?.props.onChange?.({ target: { checked: true } }); await ui.settle();
  const opOn = btnBy((s) => s.startsWith("nstk.set.turnOn"));
  const noteIn = all().find((n) => n.type === "input" && "data-neg-note" in n.props);
  c("د٤ المشغّل: يتصرّف بلا دورٍ بالعيادة، و«شغّله» مقفولٌ بعد الإقرار حتى يكتب ملاحظة، والعنوانُ يطلبها",
    !!opOn && opOn.props.disabled === true && noteIn?.props.placeholder === "nstk.set.notePhOp", J({ dis: opOn?.props.disabled, ph: noteIn?.props.placeholder }));
  noteIn?.props.onChange?.({ target: { value: "بطلب العيادة" } }); await ui.settle();
  c("  وبالملاحظة يُفتح، والمدّةُ فوق السقف متاحةٌ له", btnBy((s) => s.startsWith("nstk.set.turnOn"))?.props.disabled === false
    && all().filter((n) => n.props && "data-neg-days" in n.props).every((n) => !n.props.disabled));
  ui.unmount();
  globalThis.__perm = { role: "manager", baseRole: "manager", can: () => true };
  globalThis.__rep = async () => REP({ capUntil: new Date(NOW + 10 * DAY).toISOString() });
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  const dis = Object.fromEntries(all().filter((n) => n.props && "data-neg-days" in n.props).map((n) => [n.props["data-neg-days"], !!n.props.disabled]));
  c("  ولغير المشغّل: ما يتجاوز سقفَ الستّين مقفول (أسبوع يمرّ، أسبوعان وشهر لا)", dis[7] === false && dis[14] === true && dis[30] === true, J(dis));
  ui.unmount();
  /* مفعّلٌ لحد ٢٠ يوماً: التمديدُ بأسبوعٍ أو أسبوعين لا يُطيل فمقفول، والشهرُ متاح. */
  globalThis.__rep = async () => REP({ active: true, used: true, until: new Date(NOW + 20 * DAY).toISOString() });
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  const dis2 = Object.fromEntries(all().filter((n) => n.props && "data-neg-days" in n.props).map((n) => [n.props["data-neg-days"], !!n.props.disabled]));
  c("  ومفعّلٌ لحد ٢٠ يوماً: أسبوعٌ وأسبوعان لا يُطيلان فمقفولان (التمديدُ لا يقصّر)، والشهرُ متاح", dis2[7] === true && dis2[14] === true && dis2[30] === false, J(dis2));
  ui.unmount();
  /* انتهى وحده: سطرُ «on» والنهايةُ مضت ⇒ سطرٌ مشتقّ «انتهى وحده» فوق السجلّ. */
  const past = new Date(NOW - 2 * DAY).toISOString();
  globalThis.__rep = async () => REP({ active: false, used: true, until: past, endedAt: past,
    log: [{ at: new Date(NOW - 9 * DAY).toISOString(), action: "on", since: new Date(NOW - 9 * DAY).toISOString(), until: past, byName: null, note: "بطلب العيادة", negatives: 2, neverCounted: 9, pending: 0 }] });
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  c("د٥ انتهى بالوقت: الحالةُ «انتهى بـ»، وسطرُ «انتهى وحده» مشتقٌّ فوق السجلّ، والمشغّلُ يُقرأ «مدير العيادة» وملاحظتُه ظاهرة",
    ui.find("data-neg-state")?.props["data-neg-state"] === "ended" && !!ui.find("data-neg-log-expired")
      && ui.text().includes(`nstk.set.logOn|${J({ who: "nstk.set.who" }).slice(0, -1)}`) && ui.text().includes("بطلب العيادة"), ui.text().slice(0, 300));
  ui.unmount();
  globalThis.__perm = { role: "manager", baseRole: "manager", can: () => true };
  globalThis.__rep = async () => { const e = new Error("nf"); e.code = "PGRST000"; throw e; };
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  c("د٥ب فشلُ الجلب «ما وصلت» و«أعد المحاولة» — لا بطاقةٌ تقول «مطفّى» كاذبة", ui.text().includes("nstk.set.loadFailed") && !ui.text().includes("nstk.set.stateOff"));
  ui.unmount();
  globalThis.__rep = async () => ({ ...REP(), absent: true });
  ui = U.mount(U.React.createElement(U.NegStockCard, {}));
  await ui.settle();
  c("  والدالّةُ غائبة (الواجهةُ سبقت الهجرة): البطاقةُ لا تُرسم", ui.text() === "");
  ui.unmount();
  /* خاناتُ الطبيب (PosTabGrid الحقيقيّة): البطاقةُ تقرأ حكمَ الشاشة نفسَه (liftOf) — لا «نفدت» عمّا يرفعه الوضع. */
  const G = await loadUI('export { PosTabGrid } from "./src/components/retail/PosCustomTabs.tsx";', {
    "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar" } }); export default {};`,
    "@/components/ui": `import { createElement } from "react"; export const Button = ({ children, leftIcon, ...p }) => createElement("button", p, children);
      export const Dialog = () => null; export const useToast = () => ({ toast() {}, success() {}, error() {}, warn() {} });`,
    "@/lib/posTabsApi": "export const posTabsApi = {};",
    "@/lib/storeLib": "export const cardImagePath = (p) => p; export const productImageUrl = (p) => p;",
  });
  const tab = { name: "خانتي", tile_size: "md", show_images: false, items: [{ k: "p", id: "g0", shape: "square" }, { k: "p", id: "gn", shape: "square" }, { k: "p", id: "gz", shape: "square" },
    { k: "p", id: "gq", shape: "square" }, { k: "p", id: "gw", shape: "square" }] };
  const prods = [PRD({ id: "g0", name: "صفر" }), PRD({ id: "gn", name: "سالبة", stock: -4 }), PRD({ id: "gz", name: "بلا كلفة", purchase_price: 0 }),
    PRD({ id: "gq", name: "شريط", has_sub_unit: true, units_per_box: 20, sub_unit_name: "حبة", sub_unit_price: 100, stock: 0.25 }),
    PRD({ id: "gw", name: "علف", sold_by_weight: true, stock: 1.5 })];
  let tapped = null;
  ui = G.mount(G.React.createElement(G.PosTabGrid, { tab, products: prods, services: [], listPrice: (p) => p.sell_price, liftOf: (p) => p.id !== "gz", onProduct: (p) => { tapped = p.id; } }));
  const tile = (id) => ui.find("data-ptile", `p:${id}`);
  c("د٦ خاناتُ الطبيب: المرفوعةُ بلا «نفدت» ورصيدُها بإشارته، وغيرُ المرفوعة «نفدت» كما كانت",
    !tile("g0")?.props["data-out"] && tile("g0")?.props["data-lifted"] === true && !tile("gn")?.props["data-out"] && tile("gz")?.props["data-out"] === true
    && ui.text(ui.all().find((n) => n.type === "bdi" && n.props["data-neg-stock"] !== undefined && ui.text(n).includes("-4")) ?? { type: "#text", text: "", children: [] }) === "-4", ui.text());
  c("  والباقي بكسره ووحدته (ربعُ شريط «0.25» لا «باقي 0»، وكيلو ونصف «1.5» لا «2»)", ui.text(tile("gq")).includes(`ptab.left|${J({ n: "0.25" })}`) && ui.text(tile("gw")).includes(`ptab.left|${J({ n: "1.5" })}`),
    J([ui.text(tile("gq")), ui.text(tile("gw"))]));
  ui.click(tile("g0"));
  c("  والضغطُ طريقُ البيع نفسُه", tapped === "g0");
  ui.unmount();
  ui = G.mount(G.React.createElement(G.PosTabGrid, { tab, products: prods, services: [], listPrice: (p) => p.sell_price, preview: true, liftOf: () => true }));
  c("  والمعاينةُ بالمحرّر لا تقرأ الوضع (تُرسم كما هي)", tile("g0")?.props["data-out"] === true && !tile("g0")?.props["data-lifted"]);
  ui.unmount();
  const tt = (k) => k;
  c("د٧ negErrorText: رمزُ الخادم بنصّ النطاق", U.negErrorText(Object.assign(new Error("neg_stock_manager"), { code: "42501" }), tt) === "nstk.set.err.neg_stock_manager"
    && U.negErrorText(Object.assign(new Error("neg_stock_too_long"), { code: "P0001" }), tt) === "nstk.set.err.neg_stock_too_long");
}

/* ══ هـ) بالنصّ: الإقلاعُ والنطاقُ والطريق ═══════════════════════════════════════════ */
function textChecks(sb, c) {
  const statics = [...sb.matchAll(/^import\s+(?!type\b)[^;]*from\s+"([^"]+)";/gm)].map((m) => m[1]);
  c("هـ١ شاشةُ البيع لا تستورد الباب ولا المالك ثابتاً (import() وحده) — والأنواعُ من negStock.ts نوعاً",
    !statics.some((s) => /negStockApi|negstock\/NegStock|lib\/negStock$/.test(s)) && /import type \{[^}]*\} from "@\/lib\/negStock";/.test(sb)
    && /import\("@\/lib\/negStockApi"\)/.test(sb) && /page\(\(\) => import\("@\/components\/negstock\/NegStock"\)\.then\(\(m\) => \(\{ default: m\.NegBar \}\)\), \["nstk"\]\)/.test(sb));
  const hot = JSON.parse(READ("src/i18n/hot-paths.json"));
  c("  ونطاقُ nstk مملوكٌ لـNegStock.tsx وحده، وليس حارّاً", hot.owned?.nstk === "src/components/negstock/NegStock.tsx" && !hot.hot.includes("nstk"));
  const ar = JSON.parse(READ("src/i18n/ar.json")), en = JSON.parse(READ("src/i18n/en.json"));
  const flat = (o, p = "") => Object.entries(o).flatMap(([k, v]) => (v && typeof v === "object" ? flat(v, `${p}${k}.`) : [`${p}${k}`]));
  c("  ومفاتيحُه متطابقةٌ بالقاموسين", J(flat(ar.nstk).sort()) === J(flat(en.nstk).sort()));
  c("  ولا «بالسالب» بنصوصه (ذاك وضعُ الراجع بهذه الشاشة)", !JSON.stringify(ar.nstk).includes("بالسالب"));
  const settings = READ("src/pages/Settings.tsx");
  c("هـ٢ الإعدادات: البطاقةُ كسولةٌ بنطاقها وتحت canSettings", /page\(\(\) => import\("@\/components\/negstock\/NegStock"\)\.then\(\(m\) => \(\{ default: m\.NegStockCard \}\)\), \["nstk"\]\)/.test(settings) && /\{canSettings && <NegCardSlot \/>\}/.test(settings));
  const inv = READ("src/pages/Inventory.tsx");
  c("هـ٣ المخزون: «بلا سعر شراء» فلترٌ بتعريف stock_unit_cost (المتوسّطُ وإلا سعرُ الشراء، بمنزلتين) ويُفتح بـ?filter=nocost",
    /nocost: isNoCost/.test(inv) && /Math\.round\(Math\.max\(Number\(p\.avg_cost \?\? p\.purchase_price \?\? 0\) \|\| 0, 0\) \* 100\) === 0/.test(inv));
  c("  وإجمالُ الشركة لا يطرح ما تحت الصفر", /const q = Math\.max\(0, p\.stock \|\| 0\);/.test(inv));
  c("هـ٤ ورقةُ الجرد: القيمةُ MAX(الكمية،0) والكميةُ بإشارتها", /f: `MAX\(\$\{at\(COL\.systemQty\)\},0\)\*\$\{at\(COL\.buy\)\}`/.test(READ("src/lib/stockReportXlsx.ts")) && /cost: Math\.max\(qty, 0\) \* buy,/.test(READ("src/lib/stocktake.ts")));
  c("  والشراءُ يعرض الرصيدَ بإشارته (−٣ ← ٧ لا ٠ ← ١٠)", !/const baseStock = product \? Math\.max\(0,/.test(READ("src/components/inventory/Purchases.tsx")));
  c("  والطلبُ المقترح يقرأ ما تحت الصفر «ماكو»", /const stock = Math\.max\(0, Number\(p\.stock\) \|\| 0\);/.test(READ("src/lib/reorder.ts")));
  const coAt = sb.indexOf("const checkout = async");
  const co = coAt < 0 ? "" : sb.slice(coAt, sb.indexOf("const releaseUpdates = holdUpdates();", coAt));
  const lockAt = co.indexOf("checkingRef.current = true;"), startAt = co.indexOf("const negP = negSkip ? null : negCheckNow(negLines);");
  const awaitAt = co.indexOf("if (negP) negBad = await negJudge(negLines, await negP);"), relAt = co.indexOf("} finally { checkingRef.current = false; setChecking(false); }");
  const staleAt = co.indexOf("if (cartRef.current !== cart) return;");
  c("هـ٥ سؤالُ الوضع يبدأ مع سؤال الأسعار ويُحكم تحت قفل الإتمام نفسِه، والسلّةُ المتغيّرة أثناءه لا تُباع",
    lockAt > 0 && startAt > lockAt && awaitAt > startAt && relAt > awaitAt && staleAt > relAt, J({ lockAt, startAt, awaitAt, relAt, staleAt }));
}

/* ── التشغيل ───────────────────────────────────────────────────────────────── */
let onCrash = null;
process.on("unhandledRejection", (e) => { if (onCrash) onCrash(e); else { console.error(e); process.exit(1); } });
console.log("▸ أ) القواعدُ الصِّرفة");
await pureChecks(check);
console.log("▸ ب) المرآةُ التجريبية والحالةُ المشتركة");
await demoChecks(check);
const SB0 = READ(SB_PATH);
const BASE = await buildSB(SB0);
console.log("▸ ج) شاشةُ البيع بالسلوك — جذرٌ legacy (كلُّ تحديثٍ يرسم فوراً)");
globalThis.__conc = false;
await run(BASE, check);
console.log("▸ ج) والجذرُ المتزامن كالمتصفّح (createRoot: الضغطةُ مجمَّعة وآثارُها بآخرها)");
globalThis.__conc = true;
await run(BASE, (n, ok, d) => check(`⟨متزامن⟩ ${n}`, ok, d));
console.log("▸ د) النافذةُ والبطاقة");
await uiChecks(check);
console.log("▸ هـ) بالنصّ");
textChecks(SB0, check);

/* ── و) الطفرات ──────────────────────────────────────────────────────────────── */
console.log("▸ و) الطفرات");
const swap = (src, from, to) => { if (!src.includes(from)) throw new Error(`نصُّ الطفرة غائب: ${from.slice(0, 70)}`); return src.replace(from, to); };
const MUTANTS = [
  ["الرفعُ يتجاهل المعدودة", "!!p && now.active && !!negMod && negMod.liftable(p, now.counted) && productLineCost(p, per, -1) > 0;", "!!p && now.active && !!negMod && negMod.liftable(p, new Set()) && productLineCost(p, per, -1) > 0;"],
  ["الرفعُ يتجاهل الكلفة", "negMod.liftable(p, now.counted) && productLineCost(p, per, -1) > 0;", "negMod.liftable(p, now.counted);"],
  ["الرفعُ بلا وضعٍ مفعّل", "!!p && now.active && !!negMod && negMod.liftable(p, now.counted) && productLineCost(p, per, -1) > 0;", "!!p && !!negMod && negMod.liftable(p, now.counted) && productLineCost(p, per, -1) > 0;"],
  ["السطرُ لا يُعلَّم", "const markLift = (l: Line, now = negNow()): Line => (!l.negLift && l.qty > unitCap(l) && lineLifted(l, now) ? { ...l, negLift: true } : l);", "const markLift = (l: Line, _now = negNow()): Line => l;"],
  ["البيعةُ لا تسأل الخادم", "const negP = negSkip ? null : negCheckNow(negLines);", "const negP = null as Promise<NegCheck | \"unsure\"> | null;"],
  ["الرفضُ لا يوقف البيعة", "    if (negBad) { playWarning(); setNegChk({ ...negBad, ack, locked: !!saleRefRef.current }); return; }\n", ""],
  ["«ما تأكّدنا» يمرّ", "    if (res === \"unsure\") {\n      return {", "    if (res === \"unsure\") return null;\n    if (res === (\"x\" as never)) {\n      return {"],
  ["المرفوضُ لا يُسأل عن رصيده الطازج", "          if (fresh.pooled || unitCap({ ...l, stock: fresh.stock }) >= l.qty) return null;", "          if (fresh.pooled) return null;"],
  ["«شيل الزايد» يكمل البيعةَ بنفسه", "                  setNegChk(null);\n                }} />", "                  setNegChk(null);\n                  negResumeRef.current = k.ack;\n                }} />"],
  ["«شيل الزايد» يشيل السطرَ كلَّه", "                    if (x.qty <= 0) return [];", "                    if (x.qty >= 0) return [];"],
  ["الإعادةُ تُسأل ثانيةً", "    if (negLines.length > 0 && saleRefRef.current) { negOkRef.current = { ref: saleRefRef.current, fp: negFp }; setNegOkGen((g) => g + 1); }\n", ""],
  ["الإعفاءُ لا ينظر للسلّة", "negOkRef.current?.ref === saleRefRef.current && negOkRef.current.fp === negFp);", "negOkRef.current?.ref === saleRefRef.current);"],
  ["الكبيرةُ بالسقف الخامّ", "      ? (negMod ? negMod.bigLifted(l.qty, { sub: l.saleUnit === \"sub\", unitsPerBox: l.unitsPerBox, byWeight: l.byWeight })", "      ? (l.qty >= 10 ? true"],
  ["الكرتُ «نفدت» والوضعُ يرفعه", "const out = zero && !lifted;", "const out = zero;"],
  ["اللوحةُ بالسقف الخامّ", "            initial={l.qty} max={capFor(l)}", "            initial={l.qty} max={unitCap(l)}"],
  ["الوزنُ بالسقف الخامّ", "const stockKg = ret || p.pooled || liftFor(p, null) ? Infinity : (p.stock ?? 0);", "const stockKg = ret || p.pooled ? Infinity : (p.stock ?? 0);"],
  ["المعدودةُ «رصيده صفر»", "      if (first && on && ns.counted.has(fresh.id)) { sayNeg({ kind: \"counted\", name: fresh.name, stock: fresh.stock ?? 0 }, noMore); return { added: null, refused: true }; }\n", ""],
  ["«انتهى» لا يُقال", "      if (first && !on && ns.state?.used && (fresh.stock ?? 0) < 0) { sayNeg({ kind: \"ended\", name: fresh.name, stock: fresh.stock ?? 0 }, noMore); return { added: null, refused: true }; }\n", ""],
  ["لا سؤالَ للحالة مع الخادم", "const negAsk = !ret && negMod && negKeyRef.current && !negNow().active && !negNow().state?.absent ? negMod.refreshNeg(negKeyRef.current) : null;", "const negAsk = null as Promise<unknown> | null;"],
  ["الإشعارُ لا يطوي", "negFold={doneNegIds}", "negFold={[]}"],
  ["المسحُ يعمل والنافذةُ مفتوحة", "|| !!negChk ", ""],
  ["تحديثُ القائمة لا يعلّم", "        const m = markLift(l.stock === stock ? l : { ...l, stock });", "        const m = l.stock === stock ? l : { ...l, stock };"],
  ["«كلُّ السلّة» بسطور الراجع أيضاً", "const allCart = cart.filter((l) => !l.ret).every(", "const allCart = cart.every("],
  ["الصفُّ الذي رفعه الخادمُ يُنسى", "    return lift && lift.listAt === listRow ? lift.row : listRow ?? lift?.row;", "    return listRow;"],
  ["الشريحةُ بعمر الجواب", "  const negServerOn = !!negView.state?.active && !negView.state.absent;", "  const negServerOn = negView.active;"],
  ["الموافقةُ لا تُحفظ مع المسودّة", "      negOk: saleRefSaved && negOkRef.current?.ref === saleRefSaved ? negOkRef.current : null, saleDay,", "      negOk: null, saleDay,"],
  ["مرجعٌ معلَّق ويُعرض «شيل وكمّل»", "setNegChk({ ...negBad, ack, locked: !!saleRefRef.current });", "setNegChk({ ...negBad, ack, locked: false });"],
  ["الوزنُ المرفوع بلا «كمية كبيرة»", "      ? (negMod ? negMod.bigLifted(", "      ? (l.byWeight ? false : negMod ? negMod.bigLifted("],
  ["الطيُّ لكلّ سالب", "        for (const p of products) if (liftFor(p, null, negSnapDone)) foldIds.add(p.id);", "        for (const p of products) foldIds.add(p.id);"],
  ["الطيُّ لما علّمه وحده", "      if (negSnapDone.active) {\n", "      if (negSnapDone.active && false) {\n"],
  ["«ما تأكّدنا» يُقال «انتهى»", "      if (first && on && !ns.active && !!negMod && negMod.liftable(fresh, ns.counted)) {", "      if (false) {"],
  ["«ما تأكّدنا» لما يُرفع وحده", "      if (first && on && !ns.active && !!negMod && negMod.liftable(fresh, ns.counted)) {", "      if (first && on && !ns.active && liftFor(fresh, per, { ...ns, active: true })) {"],
  ["«انعدّت» بعمر الجواب", "      if (first && on && ns.counted.has(fresh.id)) {", "      if (first && ns.active && ns.counted.has(fresh.id)) {"],
  ["الرصيدُ بلا كسر", "{byWeight ? fmtKg(p.stock) : formatQty(p.stock)}", "{byWeight ? fmtKg(p.stock) : formatNum(p.stock)}"],
  ["صفُّ القائمة يُبطل رفعَ الخادم", "    return lift && lift.listAt === listRow ? lift.row : listRow ?? lift?.row;", "    return listRow ?? lift?.row;"],
  ["العلامةُ مع الرصيد وحده", "        const m = markLift(l.stock === stock ? l : { ...l, stock });", "        const m = l.stock === stock ? l : markLift({ ...l, stock });"],
  ["الإتمامُ يجري والنافذةُ مفتوحة", "      if (negChkShownRef.current) return;\n", ""],
  ["«+» يتبع «راجع»", "    void sellOrExplain(row, target - l.qty, null, { sale: true });", "    void sellOrExplain(row, target - l.qty);"],
  ["«+» بصفّ الرفع الخامّ", "    const row = products.find((p) => p.id === l.product_id) ?? prodRow(l.product_id);", "    const row = prodRow(l.product_id);"],
  ["نافذةٌ لم تُرسم تُميت الزرّ", "      if (negChkShownRef.current) return;\n      setNegChk(null);\n", "      return;\n"],
  ["نوافذُ التأكيد تعيش بعد بيعتها", ["    setBigSale(null); setExpiredAsk(null); setPriceAsk(null);\n", "setNegChk(null); setBigSale(null); setExpiredAsk(null); setPriceAsk(null);   // نوافذُ التأكيد لا تبقى بعد «تمّ»"], ["\n", "setNegChk(null);"]],
  ["الموافقةُ الثانية لا تبلغ المسودّة", "negOkRef.current = { ref: saleRefRef.current, fp: negFp }; setNegOkGen((g) => g + 1); }", "negOkRef.current = { ref: saleRefRef.current, fp: negFp }; }"],
  ["الشريحةُ لا تُعطى رسالتَها قبل تركيبها", "    setNegSay({ ...s, n } as NegSay);\n    if (negBarReadyRef.current) return;\n", "    if (negBarReadyRef.current) { setNegSay({ ...s, n } as NegSay); return; }\n    toast.error(fallback);\n    return;\n"],
  ["سطرٌ قائمٌ بلا مكان يقول «المتوفّر 0»", "        const stale = on && !ns.active && !!negMod && negMod.liftable(sellable, ns.counted);", "        const stale = false;"],
  ["«جرّب ثانيةً» لا يكمل", "onRetry={() => { const a = negChk.ack; setNegChk(null); negResumeRef.current = a; }}", "onRetry={() => { setNegChk(null); }}"],
  ["الفحصُ بكمّيةٍ غيرِ ما ترسله البيعة", "    return per ? Math.round((l.qty / per) * 1000) / 1000 : l.qty;", "    return l.qty;"],
];
for (const [name, from, to] of MUTANTS) {
  const fell = [];
  try {
    const src = Array.isArray(from) ? from.reduce((acc, f, i) => swap(acc, f, to[i]), SB0) : swap(SB0, from, to);
    const M = await buildSB(src);
    onCrash = (e) => fell.push(`انهار: ${e?.message ?? e}`);
    await run(M, (n, ok) => { if (!ok) fell.push(n); });
    textChecks(src, (n, ok) => { if (!ok) fell.push(n); });
  } catch (e) { fell.push(`انهار: ${e?.message ?? e}`); }
  await new Promise((r) => setTimeout(r, 20));
  onCrash = null;
  check(`طفرة «${name}» تُمسك (${fell.length})`, fell.length > 0 && !fell.every((f) => f.startsWith("انهار: نصُّ الطفرة")), fell.slice(0, 2).join(" | ") || "مرّت كلُّ الفحوص — الفحصُ أعمى عنها");
}

/* وطفراتُ الباب والمرآة التجريبية — تُمسكها جولةُ «ب». */
const FILE_MUTANTS = [
  ["المعدودةُ لا تُحمَّل بأوّل خمس دقائق", "src/lib/negStockApi.ts", "e.countedAt === null || ", ""],
  ["المرآةُ تقبل مفتاحَ المدير المؤقّت", "src/lib/demoNegStock.ts", 'if (demoBaseRole() !== "manager") throw err("neg_stock_manager", "42501");', 'if (demoBaseRole() !== "manager" && !localStorage.getItem("' + UNTIL + 'default")) throw err("neg_stock_manager", "42501");'],
  ["التمديدُ يقصّر", "src/lib/demoNegStock.ts", "until = Date.parse(fresh) > Date.parse(r!.until!) ? fresh : r!.until!;", "until = fresh;"],
  ["لا سقفَ للفترة", "src/lib/demoNegStock.ts", 'if (Date.parse(until) > Date.parse(pd.cap)) throw err("neg_stock_too_long");', ""],
  ["الإطفاءُ والتشغيلُ يصفّران البداية", "src/lib/demoNegStock.ts", "since = r && r.since && end && Date.parse(end) > now - 30 * 86_400_000 ? r.since : new Date(now).toISOString();", "since = new Date(now).toISOString();"],
  ["المعدودةُ تُرفع بالمرآة", "src/lib/demoNegStock.ts", 'else if (counted.has(p.id)) why = "counted";', ""],
  ["الجردُ يتجاهل ما تحرّك", "src/lib/demoNegStock.ts", 'if (moved.length) throw err("count_moved", "P0001", JSON.stringify(moved));', ""],
  ["«منها تحت الصفر» يعدّ المعدودة", "src/lib/demoNegStock.ts", "    uncounted_neg: ps.filter((p) => !counted.has(p.id) && (Number(p.stock) || 0) < 0).length,", "    uncounted_neg: ps.filter((p) => (Number(p.stock) || 0) < 0).length,"],
  ["المرآةُ لا تقارن الحوض", "src/lib/demoNegStock.ts", "      if (roundScaled(pools.get(p.section_id) ?? 0, 3) !== roundScaled(l.seen_pool, 3)) moved.push(p.id);", ""],
  ["الغائبةُ «ميزةٌ معطّلة» تُرمى «تعذّر»", "src/lib/negStockApi.ts", "catch (e) { if (isAbsent(e)) return absentState(); throw e; }", "catch (e) { throw e; }"],
  ["جوابٌ تامٌّ يُرمى لأنّ سؤالاً أحدثَ بدأ", "src/lib/negStockApi.ts", "  const stale = () => entries.get(key) !== e || gen < e.pubGen;", "  const stale = () => entries.get(key) !== e || gen !== e.gen;"],
  ["جوابٌ أقدمُ يدوس الأحدث", "src/lib/negStockApi.ts", "  const stale = () => entries.get(key) !== e || gen < e.pubGen;", "  const stale = () => entries.get(key) !== e;"],
  ["جوابُ عيادةٍ أخرى يُتبنّى", "src/lib/negStockApi.ts", "    if (s.clinic && e.clinic && s.clinic !== e.clinic) {", "    if (s.clinic && e.clinic && s.clinic !== e.clinic && false) {"],
];
for (const [name, file, from, to] of FILE_MUTANTS) {
  const fell = [];
  try {
    const src = swap(READ(file), from, to);
    const re = new RegExp(file.replace(/[/.]/g, (ch) => (ch === "/" ? "[\\\\/]" : "\\.")) + "$");
    onCrash = (e) => fell.push(`انهار: ${e?.message ?? e}`);
    await demoChecks((n, ok) => { if (!ok) fell.push(n); }, { re, src });
  } catch (e) { fell.push(`انهار: ${e?.message ?? e}`); }
  await new Promise((r) => setTimeout(r, 20));
  onCrash = null; skew = 0;
  check(`طفرة «${name}» تُمسك (${fell.length})`, fell.length > 0 && !fell.every((f) => f.startsWith("انهار: نصُّ الطفرة")), fell.slice(0, 2).join(" | ") || "مرّت كلُّ الفحوص — الفحصُ أعمى عنها");
}

Date.now = realNow;
console.log(`\n${fails ? "✗" : "✓"} neg-stock-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
