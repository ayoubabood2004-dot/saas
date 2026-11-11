/* ============================================================================
 * فحصُ مرآة مستهلكات الخدمات بالنسخة التجريبية (0252 + 0253) — بأرقام حزمة run.sh ومِسبارَي الهجرتين.
 *
 * النسخةُ التجريبية مرآةُ الخادم التي تجري عليها فحوصُ المنطق: انحرافُها أسوأ من لا شيء (CLAUDE.md §٤).
 * فهنا المستودعُ الحقيقيّ بنصفه التجريبيّ (supabase = null) — البيعةُ والإرجاعُ والتعديلُ والدمجُ والشراءُ من
 * repo نفسِه، والقراءاتُ من consumptionApi نفسِه — وكلُّ رقمٍ رقمُ المِسبار المقيس على PGlite:
 *   K1  CBC ×١: السطرُ ٨١٥٫٠٠ والكلفةُ ٨١٥٫٠٠ والربحُ ٢٤١٨٥٫٠٠، Diluent ٠٫٩٩٩ (مرحَّلُه −٠٫٠٠٠٥) …
 *   K2  الثانية: Diluent يبقى ٠٫٩٩٩ ومرحَّلُه صفر، Lyse ١٫٩٩٢، السرنجة ٠٫٩٨٠، الكفوف ٠٫٠٠٠ …
 * والتلميحاتُ تُقارَن **بنصّ الهجرة نفسِه** (يُقرأ من الملفّ) لا بنسخةٍ مكتوبةٍ هنا.
 * والجولةُ 2أ (فحوصٌ موسومة «[2a]»): سندُ التلف (0254) والمتوسّطُ المتحرّك وكلفةُ سطر المادّة بالخادم (0255)، وحقولُ القراءة
 * moves/now_us/waste (العقد بـconsumptionApi)، ويتيمُ الوصفات والترجيعُ الغائب. وCONSUMPTION_SQL_DIR يبدّل مجلّد 0252–0255.
 * وبعد كلّ خطوة: الثوابتُ بحسابٍ مستقلّ عن المرآة (consumption.ts وحده): الحيُّ = T(الهدف) لكلّ مواصفة، وثابتُ
 * المرحَّل، ولا سطرَ حيٌّ تحت كلفة موادّه، وحفظُ الرصيد (البذرة − Σ المكتوب − ext_out) لكلّ مادّةٍ لا يمسّها سطرُ مادّة.
 *
 *   node scripts/consumption-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const src = (f) => readFileSync(f, "utf8");
/* المفاتيحُ تُقرأ من مصادرها لا تُكتب بيد: مفتاحٌ مخمَّن يفحص مخزناً غيرَ الذي يقرؤه التطبيق. */
const keyOf = (file, re) => {
  const k = re.exec(src(file))?.[1];
  if (!k) { console.error(`✗ consumption-test: ما انقرأ المفتاحُ من ${file}`); process.exit(1); }
  return k;
};
const SESSION = keyOf("src/contexts/AuthContext.tsx", /const KEY = "([^"]+)"/);
const ACTIVE = keyOf("src/lib/clinics.ts", /const ACTIVE_KEY = "([^"]+)"/);
const UNTIL = keyOf("src/lib/managerOverride.ts", /const untilKey = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);
const DB_KEY = keyOf("src/lib/demoKey.ts", /export const DEMO_DB_KEY = "([^"]+)"/);
const SVC_KEY = keyOf("src/lib/services.ts", /const keyName = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);
const STAFF_KEY = keyOf("src/lib/staff.ts", /const keyName = \(\) => `([^`$]+)\$\{getActiveClinicId\(\)\}`/);
const AUDIT_KEY = keyOf("src/lib/repoDemo.ts", /const DEMO_AUDIT_KEY = "([^"]+)"/);
const COUNTS_KEY = keyOf("src/lib/demoCounts.ts", /const KEY = "([^"]+)"/);
const EXP_KEY = keyOf("src/lib/repoDemo.ts", /const DEMO_EXPENSES_KEY = "([^"]+)"/);
const LOTS_KEY = keyOf("src/lib/demoLots.ts", /const KEY = "([^"]+)"/);

/* تلميحُ الخادم من نصّ الهجرة: كلُّ `raise exception '<code>' … hint = [format(]'…'` بترتيب الملفّ.
 * ومجلّدُ هجرات 0252–0255 قابلٌ للتبديل (CONSUMPTION_SQL_DIR): الافتراضُ هجراتُ المستودع (حقيقةُ CI)، وجولةُ المرآة تفحص على
 * لقطةٍ ثابتة بينما يحرّر غيرُها الهجرات. 0233 من المستودع دائماً. */
const MIG = process.env.CONSUMPTION_SQL_DIR || "supabase/migrations";
const SQL = src(`${MIG}/0252_service_consumption.sql`) + "\n" + src("supabase/migrations/0233_store_categories.sql");
const sqlHints = (code) => [...SQL.matchAll(new RegExp(`raise exception '${code}'[^\\n]*\\n?\\s*(?:using\\s+)?(?:errcode = '[0-9A-Z]+', )?hint = (?:format\\()?'([^']*)'`, "g"))].map((m) => m[1]);
const fmt = (h, ...a) => { let i = 0; return h.replace(/%s/g, () => String(a[i++])); };
const hintOf = (code, pick = 0, ...args) => { const all = [...new Set(sqlHints(code))]; return all.length ? fmt(all[pick], ...args) : `«لا تلميح لـ${code} بالهجرة»`; };
/* 0254/0255: نفسُ القراءة، وتلميحٌ يلي `format(` بعد علامة سطرٍ (`-- +0254`) يُقرأ كذلك؛ وفوقُ الرصيد تلميحُه متغيّرٌ (v_over). */
const SQLW = src(`${MIG}/0254_waste_voucher.sql`) + "\n" + src(`${MIG}/0255_moving_average.sql`);
const hintW = (code, ...args) => {
  const all = [...new Set([...SQLW.matchAll(new RegExp(`raise exception '${code}'[^\\n]*\\n?\\s*(?:using\\s+)?hint = (?:format\\()?\\s*(?:--[^\\n]*\\n\\s*)?'([^']*)'`, "g"))].map((m) => m[1]))];
  return all.length ? fmt(all[0], ...args) : `«لا تلميح لـ${code} بالهجرة»`;
};
const overW = (...args) => { const m = /v_over := format\('([^']*)'/.exec(SQLW); return m ? fmt(m[1], ...args) : "«لا تلميح لفوق الرصيد»"; };

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

/* ---- المستودعُ الحقيقيّ (نصفُه التجريبيّ) ومعه بابُ المستهلكات وحسابُها — حزمةٌ واحدة، نسخةٌ واحدة من كلّ وحدة ---- */
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
  stdin: {
    contents: [
      'export * from "./src/lib/repo.ts";',
      'export { loadDemoConsumption } from "./src/lib/repoDemo.ts";',
      'export * as services from "./src/lib/services.ts";',
      'export { consumptionApi } from "./src/lib/consumptionApi.ts";',
      'export { registerConfigReadOnlyChecker } from "./src/lib/clinicSync.ts";',
      'export * as C from "./src/lib/consumption.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "consumption-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "consumption-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, consumptionApi: api, C } = mod;
if (!repo || !api || !C || !mod.loadDemoConsumption) { console.error("✗ consumption-test: ما انحمّلت الوحدات"); process.exit(1); }
const cons = await mod.loadDemoConsumption();

/* ---- الجلسةُ بشكل AuthContext.persistRaw حرفاً، ومفتاحُ وضع المدير كما يكتبه managerOverride ---- */
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: [rawRole === "owner" ? "owner" : "clinic"],
    clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: rawRole === "owner" ? "owner" : "clinic",
}));
const clinic = () => mem.get(ACTIVE) || "default";
const pinOn = () => mem.set(`${UNTIL}${clinic()}`, String(Date.now() + 10 * 60 * 1000));
const pinOff = () => mem.delete(`${UNTIL}${clinic()}`);
const OWNER = () => { pinOff(); mem.delete(SESSION); };          // بلا جلسة = صاحبُ العيادة (مدير)
const MGR = () => { pinOff(); as("c1", "admin"); };
const VET = () => { pinOff(); as("v1", "doctor"); };
const RCP = () => { pinOff(); as("r1", "reception"); };
const PHO = () => { pinOff(); as("p1", "doctor", { clinicId: "c", role: "doctor", staffRole: "photographer" }); };

/* ---- البذرة ---- */
const SUB = (unit, upb) => ({ has_sub_unit: true, sub_unit_name: unit, units_per_box: upb });
const P = (id, name, stock, pp, extra = {}) => ({ id, clinic_id: null, name, barcode: null, stock, purchase_price: pp, sell_price: 0, min_stock: 0, created_at: "2026-01-01T00:00:00.000Z", ...extra });
const U = (n) => `a2520000-0000-4000-8000-0000000000${n}`;
const S01 = U("a1"), S02 = U("a2"), S03 = U("a3"), S05 = U("a5"), SV2 = U("b2"), SV4 = U("b4"), SV7 = U("b7"), SK13 = U("bd"), SK12 = U("bc");
const SF = U("c2"), SD = U("c3"), SX = U("c4"), SY = U("c5"), SST = U("c6");
const PRODUCTS = [
  P("R01", "Diluent", 1, 150000, SUB("مل", 20000)),
  P("R02", "Lyse", 2, 60000, SUB("مل", 500)),
  P("R03", "سرنجة 3cc", 1, 25000, SUB("سرنجة", 100)),
  P("R04", "قفازات", 0.04, 12500, SUB("زوج", 50)),
  P("R05", "خيط", 1, 24000, SUB("خيط", 12)),
  P("R06", "حوض", 5, 1000, { pooled: true }),
  P("R07", "علف", 5, 1000, { farm_id: "F1" }),
  P("R08", "سرنجة 5cc", 0.04, 25000, SUB("سرنجة", 100)),
  P("R09", "بلا وحدة", 1, 1000),
  P("R03b", "سرنجة 3cc ب", 2, 25000, SUB("سرنجة", 100)),
  P("R10", "توأم", 1, 1000), P("R11", "أصل", 1, 1000),
  // V2 / V4 / V7 / K12 / K13 بموادّها (أرقامٌ لا يمسّها غيرُها)
  P("D2", "محلول V2", 1, 150000, SUB("مل", 20000)), P("Q2", "قطعة V2", 1, 1000, SUB("قطعة", 10)),
  P("D4", "محلول V4", 1, 150000, SUB("مل", 20000)), P("Q4", "قطعة V4", 1, 1000, SUB("قطعة", 10)),
  P("L7", "Lyse V7", 2, 60000, SUB("مل", 500)), P("Q7", "قطعة V7", 1, 1000, SUB("قطعة", 10)),
  P("G12", "جل الجملة", 1, 1000, SUB("قطعة", 10)),
  P("K13", "قفازات ١٣", 0.05, 12500, SUB("زوج", 50)),
  // كلفةٌ ثابتة + وصفة، وسطورُ وصفةٍ معطّلة، والدمجُ مرّتين، ومحفّزُ الحالة، وسطرُ مادّةٍ سالب
  P("F2", "خيط ٢", 1, 24000, SUB("خيط", 12)),
  P("PA", "محلول للحذف", 1, 5000, SUB("مل", 1000)), P("PB", "شاش يصير حوض", 1, 1000, SUB("قطعة", 10)), P("PC", "لاصق يفقد الوحدة", 1, 2000, SUB("قطعة", 20)),
  P("X1", "محلول س", 1, 150000, SUB("مل", 20000)), P("Y1", "محلول ص", 2, 150000, SUB("مل", 20000)), P("Z1", "محلول ع", 1, 150000, SUB("مل", 20000)),
  P("E1", "محلول الحالة", 1, 150000, SUB("مل", 20000)), P("E2", "قطعة الحالة", 1, 1000, SUB("قطعة", 10)),
  P("NL", "مادة تصير سالبة", 0, 500), P("NG", "مادة سالبة", -0.05, 1000),
];
const SEED = new Map(PRODUCTS.map((p) => [p.id, C.roundScaled(p.stock, 3)]));
mem.set(DB_KEY, JSON.stringify({ products: PRODUCTS, companies: [], companySections: [], purchases: [], purchaseItems: [],
  invoices: [], invoiceItems: [], generatedBarcodes: [], productsTrash: [] }));
const CAT = U("c1");
const svc = (id, name, price, cost = null) => ({ id, category_id: CAT, name, price, cost });
mem.set(`${SVC_KEY}${clinic()}`, JSON.stringify({ categories: [{ id: CAT, name: "فحوص" }], services: [
  svc(S01, "CBC", 25000), svc(S02, "تعقيم قطة", 25000, 3000), svc(S03, "حقنة", 5000), svc(S05, "فحص", 10000, 1000),
  svc(SV2, "خدمة V2", 20000), svc(SV4, "خدمة V4", 20000), svc(SV7, "خدمة V7", 20000), svc(SK12, "خدمة الجملة", 8000), svc(SK13, "كفوف الفحص", 5000),
  svc(SF, "خياطة جرح", 30000, 3000), svc(SD, "جرعة مركّبة", 15000), svc(SX, "تحليل س", 20000), svc(SY, "تحليل ص", 20000), svc(SST, "خدمة الحالة", 20000),
] }));
await mod.services.hydrateServices();
// موظّفُ استقبالٍ بإذن «تعديل إعدادات العيادة» صريحٍ على صفّه (staff_can) — والآخرون بقالب دورهم.
mem.set(`${STAFF_KEY}${clinic()}`, JSON.stringify([
  { id: "st-rs", name: "استقبال الوصفات", email: "rs@demo.vet", phone: "", role: "receptionist", specialty: "", joinDate: "2026-01-01", status: "active", bio: "", userId: "rs1", permissions: { manageSettings: true } },
  { id: "st-v1", name: "الطبيب ف", email: "v1@demo.vet", phone: "", role: "veterinarian", specialty: "", joinDate: "2026-01-01", status: "active", bio: "", userId: "v1", permissions: {} },
]));

/* ---- قراءةُ المخزن كما هو (لا عبر المرآة) ---- */
const db = () => JSON.parse(mem.get(DB_KEY));
const save = (d) => mem.set(DB_KEY, JSON.stringify(d));
const prod = (id, d = db()) => d.products.find((p) => p.id === id);
const fx3 = (n) => (n == null ? "gone" : Number(n).toFixed(3));
const stk = (...ids) => { const d = db(); return ids.map((id) => fx3(prod(id, d)?.stock)).join("|"); };
const nano = (s) => (s == null ? "none" : C.fromScaled(BigInt(s), 9).toFixed(9));
const cry = (id) => nano(db().stockCarry?.[id]?.carry_n);
const invOf = (ref) => db().invoices.find((i) => i.client_ref === ref);
const linesOf = (invId) => db().invoiceItems.filter((x) => x.invoice_id === invId);
const evsOf = (invId) => (db().consumption ?? []).filter((e) => e.invoice_id === invId);
const skipsOf = (invId) => (db().consumptionSkips ?? []).filter((k) => k.invoice_id === invId);
const errOf = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const code = async (fn) => { const e = await errOf(fn); return e ? e.message : "ok"; };
const nowIso = () => new Date().toISOString();
const sale = (ref, items, meta = {}) => repo.retailCheckout(items, { client_ref: ref, ...meta });
const svcLine = (name, sid, qty = 1, price = 25000, cost = 0, extra = {}) => ({ product_id: null, name, qty, unit_price: price, unit_cost: cost, ...(sid ? { service_id: sid } : {}), ...extra });
const editLines = (invId, patch = () => ({})) => linesOf(invId).map((ii) => ({ id: ii.id, product_id: ii.product_id, name: ii.name, qty: ii.qty,
  unit_price: ii.unit_price, unit_cost: ii.unit_cost, stock_qty: ii.product_id ? ii.stock_qty : 0, ...patch(ii) }));

/* ---- الثوابت — بحسابٍ مستقلّ عن المرآة: consumption.ts (T وV والثابت) على المخزن الخامّ ---- */
const PRODUCT_LINES = new Set();           // موادُّ بيعت سطراً بالفاتورة — لا تدخل فحصَ حفظ الرصيد
const MERGED = new Map();                  // التوأم ← الأصل
function verify(d = db()) {
  const out = [];
  const evs = d.consumption ?? [];
  const items = new Map((d.invoiceItems ?? []).map((ii) => [ii.id, ii]));
  const invs = new Map((d.invoices ?? []).map((i) => [i.id, i]));
  const bySpec = new Map();
  for (const e of evs) bySpec.set(e.spec_id, [...(bySpec.get(e.spec_id) ?? []), e]);
  const FROZEN = ["invoice_id", "item_id", "product_name", "unit", "unit_label", "per_qty_m", "per_div_m", "unit_cost_u", "per_value_c", "service_id", "source", "from_item"];
  for (const [sid, g] of bySpec) {
    const f = g[0];
    if (g.some((e) => FROZEN.some((k) => (e[k] ?? null) !== (f[k] ?? null)))) out.push(`spec_mismatch:${sid}`);
    const ii = items.get(f.item_id), inv = invs.get(f.invoice_id);
    const t = !ii || !inv || inv.status === "refunded" ? 0n : C.roundScaled(Math.max(Number(ii.qty), 0), 3);
    const lq = g.reduce((s, e) => s + BigInt(e.qty_n), 0n), lv = g.reduce((s, e) => s + BigInt(e.value_c), 0n);
    const wq = C.targetNano(t, BigInt(f.per_qty_m), BigInt(f.per_div_m)), wv = C.valueCents(t, BigInt(f.per_value_c));
    if (lq !== wq || lv !== wv) out.push(`live_vs_line:${f.item_id}:${f.product_id}:${lq}/${wq}:${lv}/${wv}`);
    if (g.some((e) => e.note === "product_gone")) out.push(`product_gone:${sid}`);
    if (g.some((e) => (e.kind === "use") !== (BigInt(e.qty_n) > 0n || (BigInt(e.qty_n) === 0n && BigInt(e.value_c) > 0n)))) out.push(`kind:${sid}`);
  }
  const pids = new Set([...evs.filter((e) => e.note !== "product_gone").map((e) => e.product_id), ...Object.keys(d.stockCarry ?? {})]);
  for (const pid of pids) {
    const k = d.stockCarry?.[pid];
    if (!k) { out.push(`carry_missing:${pid}`); continue; }
    const st = { carry_n: BigInt(k.carry_n), ext_in_n: BigInt(k.ext_in_n), ext_out_m: BigInt(k.ext_out_m) };
    const ev = evs.filter((e) => e.product_id === pid && e.note !== "product_gone").map((e) => ({ qty_n: BigInt(e.qty_n), posted_m: BigInt(e.posted_m) }));
    if (!C.carryInvariant(ev, st)) out.push(`carry:${pid}:${C.carryResidual(ev, st)}`);
    if (st.carry_n < -500000n || st.carry_n >= 500000n) out.push(`carry_range:${pid}:${st.carry_n}`);
  }
  const mat = new Map();
  for (const g of bySpec.values()) mat.set(g[0].item_id, (mat.get(g[0].item_id) ?? 0n) + BigInt(g[0].per_value_c));
  for (const [item, c] of mat) {
    const ii = items.get(item);
    const inv = ii && invs.get(ii.invoice_id);
    if (!ii || !inv || inv.status === "refunded" || !(Number(ii.qty) > 0)) continue;
    if (C.roundScaled(ii.unit_cost, 2) < c) out.push(`line_below_materials:${item}`);
  }
  // حفظُ الرصيد: البذرةُ (ومعها بذورُ كلّ ما طُوي فيها، ولو بدمجين) − Σ المكتوب بالدفتر − ext_out — لكلّ مادّةٍ لا سطرَ مادّةٍ لها.
  const keeperOf = (id) => { let k = id; for (let h = 0; MERGED.has(k) && h < 50; h++) k = MERGED.get(k); return k; };
  for (const [pid] of SEED) {
    if (PRODUCT_LINES.has(pid) || MERGED.has(pid)) continue;
    let want = 0n;
    for (const [t, s] of SEED) if (keeperOf(t) === pid && !PRODUCT_LINES.has(t)) want += s;
    for (const e of evs) if (e.product_id === pid && e.note !== "product_gone") want -= BigInt(e.posted_m);
    want -= BigInt(d.stockCarry?.[pid]?.ext_out_m ?? "0");
    const live = (d.products ?? []).find((p) => p.id === pid), tr = (d.productsTrash ?? []).find((t) => t.id === pid);
    const have = live ? C.roundScaled(live.stock, 3) : tr ? C.roundScaled(tr.stock, 3) : null;
    if (have !== want) out.push(`stock_conservation:${pid}:${have}≠${want}`);
    if (tr && !live && C.roundScaled(tr.row?.stock ?? 0, 3) !== want) out.push(`trash_row_stock:${pid}`);
  }
  return out;
}
const vc = (label = "  والدفترُ متّسق (الحيُّ = T(الهدف)، والمرحَّل، والرصيدُ محفوظ)") => { const v = verify(); check(label, v.length === 0, v.join("; ")); };

/* ===================================================================== */
console.log("▸ الوصفة: الحفظُ والقراءةُ والرفض (S1/R1/R2)");
OWNER();
const FP0 = (await api.recipeGet(S01)).fingerprint;
const LINES = [{ product_id: "R01", qty: 10, unit: "sub" }, { product_id: "R02", qty: 2, unit: "sub" }, { product_id: "R03", qty: 1, unit: "sub" }, { product_id: "R04", qty: 1, unit: "sub" }];
{
  check("وصفةٌ فارغة: بلا سطور، والبصمةُ حاضرة، والكلفةُ الثابتة فارغة", (await api.recipeGet(S01)).lines.length === 0 && typeof FP0 === "string" && FP0.length > 0 && (await api.recipeGet(S01)).flat_cost === null);
  const probe = async (who, fn) => { who(); const e = await errOf(fn); OWNER(); return e; };
  let e = await probe(RCP, () => api.recipeSet(S01, LINES, FP0));
  check("S1: الاستقبال ⇒ recipe_forbidden بتلميح الخادم حرفاً (P0001)", e?.message === "recipe_forbidden" && e?.code === "P0001" && e?.hint === hintOf("recipe_forbidden"), `${e?.message}|${e?.hint}`);
  e = await probe(VET, () => api.recipeSet(S01, LINES, FP0));
  check("  والطبيبُ كذلك", e?.message === "recipe_forbidden");
  e = await probe(PHO, () => api.recipeSet(S01, LINES, FP0));
  check("S4: المصوّرُ تردّه البوّابةُ قبل الدالّة (photographer_forbidden، 42501) — وقراءتُه كذلك",
    e?.message === "photographer_forbidden" && e?.code === "42501" && e?.hint === hintOf("photographer_forbidden")
      && (await probe(PHO, () => api.recipeGet(S01)))?.message === "photographer_forbidden", `${e?.message}|${e?.code}|${e?.hint}`);
  e = await probe(() => { RCP(); pinOn(); }, () => api.recipeSet(S03, [{ product_id: "R08", qty: 1, unit: "sub" }], "nope"));
  check("  والاستقبالُ بمفتاح المدير الحيّ يتجاوز الدور (auth_role() = 'manager') — يصل البصمة", e?.message === "recipe_moved", e?.message);
  e = await probe(() => as("rs1", "reception", { clinicId: "c", role: "reception", staffRole: "receptionist" }), () => api.recipeSet(S03, [{ product_id: "R08", qty: 1, unit: "sub" }], "nope"));
  check("  ومن له manageSettings صريحاً (staff_can) يصل البصمة — لا recipe_forbidden", e?.message === "recipe_moved", e?.message);
  e = await probe(() => as("x1", "cashier?"), () => api.recipeSet(S01, LINES, FP0));
  check("  ودورٌ لا يُعرف ⇒ recipe_forbidden", e?.message === "recipe_forbidden");
  const R1 = async (lines, fp = FP0, svcId = S01) => { const x = await errOf(() => api.recipeSet(svcId, lines, fp)); return x ? `${x.message}|${x.hint}` : "ok"; };
  check("R1: بصمةٌ قديمة ⇒ recipe_moved", (await R1(LINES, "nope")) === `recipe_moved|${hintOf("recipe_moved")}`);
  check("  خدمةٌ لا يعرفها التجريبيّ ⇒ recipe_service_missing", (await R1(LINES, FP0, U("99"))) === `recipe_service_missing|${hintOf("recipe_service_missing")}`);
  check("  حوض ⇒ recipe_pooled باسم المادة", (await R1([{ product_id: "R06", qty: 1 }])) === `recipe_pooled|${hintOf("recipe_pooled", 0, "حوض")}`, await R1([{ product_id: "R06", qty: 1 }]));
  check("  حقل ⇒ recipe_farm (موادُّ الحقل تُمرَّر للفحص لا تُحذف منه)", (await R1([{ product_id: "R07", qty: 1 }])) === `recipe_farm|${hintOf("recipe_farm", 0, "علف")}`);
  check("  'sub' بلا وحدةٍ صغيرة ⇒ recipe_no_sub_unit", (await R1([{ product_id: "R09", qty: 1, unit: "sub" }])) === `recipe_no_sub_unit|${hintOf("recipe_no_sub_unit", 0, "بلا وحدة")}`);
  check("  تكرار (بأيّ وحدة) ⇒ recipe_duplicate بالسطر ٢", (await R1([{ product_id: "R01", qty: 1 }, { product_id: "R01", qty: 2, unit: "sub" }])) === `recipe_duplicate|${hintOf("recipe_duplicate", 0, 2)}`);
  check("  مادةٌ مجهولة ⇒ recipe_product_missing بالسطر ١", (await R1([{ product_id: "R99", qty: 1 }])) === `recipe_product_missing|${hintOf("recipe_product_missing", 0, 1)}`);
  check("  ٠٫٠٠٠١ ⇒ recipe_bad_line بالسطر ١", (await R1([{ product_id: "R01", qty: 0.0001 }])) === `recipe_bad_line|${hintOf("recipe_bad_line", 1, 1)}`, await R1([{ product_id: "R01", qty: 0.0001 }]));
  check("  ٤١ سطراً ⇒ recipe_too_many", (await R1(Array.from({ length: 41 }, () => ({ product_id: "R01", qty: 1 })))) === `recipe_too_many|${hintOf("recipe_too_many")}`);
  check("  ليست مصفوفة ⇒ recipe_bad_line (الشكل)", (await R1({ x: 1 })) === `recipe_bad_line|${hintOf("recipe_bad_line", 0)}`);
  { const d = db(); prod("R05", d).units_per_box = 1000000000; save(d); }
  check("  T(1) = 0 ⇒ recipe_too_small", (await R1([{ product_id: "R05", qty: 0.001, unit: "sub" }])) === `recipe_too_small|${hintOf("recipe_too_small", 0, "خيط")}`);
  { const d = db(); prod("R05", d).units_per_box = 12; save(d); }
  check("  ولا سطرَ انكتب بأيّ رفض", (db().serviceRecipes ?? []).length === 0);
  const set = await api.recipeSet(S01, LINES, FP0);
  check("C1 يحفظ وصفة CBC (أربع سطور)", set.lines.length === 4 && set.fingerprint !== FP0);
  const au = JSON.parse(mem.get(AUDIT_KEY) || "[]").filter((x) => x.entity === "clinic_services" && x.entity_id === S01);
  check("سطرُ تدقيقٍ واحد على الخدمة: [فارغة، «Diluent ×10 مل، Lyse ×2 مل، سرنجة 3cc ×1 سرنجة، قفازات ×1 زوج»]",
    au.length === 1 && au[0].details.__changed.recipe[0] === null && au[0].details.__changed.recipe[1] === "Diluent ×10 مل، Lyse ×2 مل، سرنجة 3cc ×1 سرنجة، قفازات ×1 زوج" && au[0].details.name === "CBC",
    JSON.stringify(au.map((x) => x.details)));
  const g = await api.recipeGet(S01);
  check("القراءة: per_value ٧٥ و٢٤٠ و٢٥٠ و٢٥٠ بلا مشاكل، والكلفةُ لوحدة المخزون، والبصمةُ بصمةُ الحفظ",
    g.lines.map((l) => `${l.per_value}:${l.problem ?? "-"}`).join(",") === "75:-,240:-,250:-,250:-" && g.fingerprint === set.fingerprint
      && g.lines[0].unit_cost === 150000 && g.lines[0].unit_label === "مل" && g.lines[0].units_per_box === 20000 && g.lines[0].stock === 1 && g.lines[0].qty === 10,
    JSON.stringify(g.lines.map((l) => [l.per_value, l.problem])));
  check("الملخّص: CBC أربعُ سطور بكلفة ٨١٥ بلا عطل", JSON.stringify((await api.recipeSummary())[S01]) === JSON.stringify({ lines: 4, cost: 815, broken: 0 }), JSON.stringify(await api.recipeSummary()));
  await api.recipeSet(S03, [{ product_id: "R08", qty: 1, unit: "sub" }], (await api.recipeGet(S03)).fingerprint);
  await api.recipeSet(S02, [{ product_id: "R05", qty: 1, unit: "sub" }], (await api.recipeGet(S02)).fingerprint, true);
  check("R2: p_clear_flat_cost يصفّر كلفةَ «تعقيم قطة» الثابتة (كتالوج الخدمات)", (await api.recipeGet(S02)).flat_cost === null
    && mod.services.getServiceCatalog().services.find((s) => s.id === S02)?.cost == null);
  await api.recipeSet(S01, LINES, (await api.recipeGet(S01)).fingerprint);
  check("  وحفظٌ بلا تغيير لا يكتب تدقيقاً ثانياً", JSON.parse(mem.get(AUDIT_KEY) || "[]").filter((x) => x.entity === "clinic_services" && x.entity_id === S01).length === 1);
  // وصفاتُ الحالات المنفصلة
  await api.recipeSet(SV2, [{ product_id: "D2", qty: 10, unit: "sub" }, { product_id: "Q2", qty: 1, unit: "sub" }], (await api.recipeGet(SV2)).fingerprint);
  await api.recipeSet(SV4, [{ product_id: "D4", qty: 10, unit: "sub" }, { product_id: "Q4", qty: 1, unit: "sub" }], (await api.recipeGet(SV4)).fingerprint);
  await api.recipeSet(SV7, [{ product_id: "L7", qty: 2, unit: "sub" }, { product_id: "Q7", qty: 1, unit: "sub" }], (await api.recipeGet(SV7)).fingerprint);
  await api.recipeSet(SK12, [{ product_id: "G12", qty: 2, unit: "sub" }], (await api.recipeGet(SK12)).fingerprint);
  await api.recipeSet(SK13, [{ product_id: "K13", qty: 1, unit: "sub" }], (await api.recipeGet(SK13)).fingerprint);
  await api.recipeSet(SF, [{ product_id: "F2", qty: 1, unit: "sub" }], (await api.recipeGet(SF)).fingerprint);   // الكلفةُ الثابتة ٣٠٠٠ تبقى
  await api.recipeSet(SD, [{ product_id: "PA", qty: 5, unit: "sub" }, { product_id: "PB", qty: 1, unit: "sub" }, { product_id: "PC", qty: 1, unit: "sub" }], (await api.recipeGet(SD)).fingerprint);
  await api.recipeSet(SX, [{ product_id: "X1", qty: 10, unit: "sub" }], (await api.recipeGet(SX)).fingerprint);
  await api.recipeSet(SY, [{ product_id: "Y1", qty: 10, unit: "sub" }], (await api.recipeGet(SY)).fingerprint);
  await api.recipeSet(SST, [{ product_id: "E1", qty: 10, unit: "sub" }, { product_id: "E2", qty: 1, unit: "sub" }], (await api.recipeGet(SST)).fingerprint);
  check("  وحفظٌ بلا p_clear_flat_cost يُبقي الكلفةَ الثابتة (٣٠٠٠)", (await api.recipeGet(SF)).flat_cost === 3000);
  // بصمةُ تبويبٍ آخر: حفظٌ من «جهازٍ ثانٍ» بعد القراءة ⇒ recipe_moved
  const stale = (await api.recipeGet(SK12)).fingerprint;
  await api.recipeSet(SK12, [{ product_id: "G12", qty: 3, unit: "sub" }], stale);
  check("  بصمةٌ قُرئت قبل حفظٍ من تبويبٍ آخر ⇒ recipe_moved", (await code(() => api.recipeSet(SK12, [{ product_id: "G12", qty: 4, unit: "sub" }], stale))) === "recipe_moved");
  await api.recipeSet(SK12, [{ product_id: "G12", qty: 2, unit: "sub" }], (await api.recipeGet(SK12)).fingerprint);
}

console.log("▸ البيعة K1/K2/K8/K10 — الخادمُ يحسب الكلفةَ والرصيد");
{
  const ITEM = svcLine("CBC", S01, 1, 25000, 9999);
  const k1 = await sale("k1", [ITEM]);
  const l1 = linesOf(k1.id)[0];
  check("K1/K10: السطرُ ٨١٥ (كلفةُ الجهاز ٩٩٩٩ تُهمل) وخدمتُه محفوظة", l1.unit_cost === 815 && l1.service_id === S01, JSON.stringify(l1));
  check("  والكلفةُ ٨١٥ والربحُ ٢٤١٨٥ لحظةَ إدراج الفاتورة", k1.cost_total === 815 && k1.profit === 24185, `${k1.cost_total}|${k1.profit}`);
  check("  الرصيد: Diluent ٠٫٩٩٩ Lyse ١٫٩٩٦ السرنجة ٠٫٩٩٠ الكفوف ٠٫٠٢٠", stk("R01", "R02", "R03", "R04") === "0.999|1.996|0.990|0.020", stk("R01", "R02", "R03", "R04"));
  check("  ومرحَّلُ Diluent −٠٫٠٠٠٥", cry("R01") === "-0.000500000", cry("R01"));
  const e1 = evsOf(k1.id);
  check("  أربعُ مواصفات use/recipe بقيمها المجمَّدة (Diluent: ٠٫٠٠٠٥ كُتب ٠٫٠٠١ بقيمة ٧٥)",
    e1.length === 4 && e1.every((e) => e.kind === "use" && e.source === "recipe" && e.service_id === S01 && e.item_id === l1.id)
      && e1.some((e) => e.product_id === "R01" && e.qty_n === "500000" && e.posted_m === "1" && e.value_c === "7500" && e.per_div_m === "20000000" && e.unit_cost_u === "150000000000"),
    JSON.stringify(e1.map((e) => [e.product_id, e.qty_n, e.posted_m, e.value_c])));
  vc();
  const again = await sale("k1", [ITEM]);
  check("K8: إعادةُ المرجع ترجع الفاتورةَ نفسَها قبل الخطّة — بلا دفترٍ ثانٍ ولا خصم", again.id === k1.id && (db().consumption ?? []).length === 4 && stk("R01", "R02") === "0.999|1.996");
  await sale("k2", [ITEM]);
  check("K2: Diluent يبقى ٠٫٩٩٩ ومرحَّلُه صفر (٢٠ مل بالضبط على بيعتين)", stk("R01") === "0.999" && cry("R01") === "0.000000000", `${stk("R01")}|${cry("R01")}`);
  check("  وLyse ١٫٩٩٢ والسرنجة ٠٫٩٨٠ والكفوف ٠٫٠٠٠", stk("R02", "R03", "R04") === "1.992|0.980|0.000", stk("R02", "R03", "R04"));
  vc();
  // حذفٌ مباشرٌ لسطر K1 (كتابةُ مديرٍ بدور authenticated — المحفّزُ على الجدول يلتقيها)
  const d = db();
  d.invoiceItems = d.invoiceItems.filter((x) => x.id !== l1.id);
  cons.syncItemLocal(d, l1.id, 0, nowIso());
  save(d);
  check("حذفُ سطر K1 مباشرةً يردّ: Diluent ٠٫٩٩٩ (المرحَّل −٠٫٠٠٠٥) Lyse ١٫٩٩٦ السرنجة ٠٫٩٩٠ الكفوف ٠٫٠٢٠", `${stk("R01", "R02", "R03", "R04")}|${cry("R01")}` === "0.999|1.996|0.990|0.020|-0.000500000", `${stk("R01", "R02", "R03", "R04")}|${cry("R01")}`);
  check("  بأربعة أحداث restore", (db().consumption ?? []).filter((e) => e.kind === "restore").length === 4);
  vc();
}

console.log("▸ K3 العجز، K4 التعديل، K5/K6/K7/K9/K11 التخطّي والرفض");
{
  const k3 = await sale("k3", [svcLine("CBC", S01, 3)]);
  const r04 = evsOf(k3.id).find((e) => e.product_id === "R04");
  check("K3: CBC ×٣ والكفوفُ ٠٫٠٢٠: البيعةُ تمرّ — الكفوف −٠٫٠٤٠ والعجزُ ٠٫٠٤٠ على حدثها", stk("R04") === "-0.040" && r04?.shortfall_m === "40", `${stk("R04")}|${r04?.shortfall_m}`);
  check("  والسطرُ ٨١٥ والكلفةُ ٢٤٤٥", linesOf(k3.id)[0].unit_cost === 815 && k3.cost_total === 2445, `${linesOf(k3.id)[0].unit_cost}|${k3.cost_total}`);
  vc();
  const OV = [{ product_id: "R03", qty: 2, unit: "sub" }];
  RCP();
  let e = await errOf(() => sale("k4x", [svcLine("CBC", S01, 1, 25000, 0, { consumables: OV })]));
  check("K4: الاستقبالُ بتعديلٍ ⇒ consumables_case_role بتلميحه، بلا فاتورة", e?.message === "consumables_case_role" && e?.hint === hintOf("consumables_case_role") && !invOf("k4x"), `${e?.message}|${e?.hint}`);
  as("x9", "cashier?");
  check("  ودورٌ لا يُعرف كذلك", (await code(() => sale("k4u", [svcLine("CBC", S01, 1, 25000, 0, { consumables: OV })]))) === "consumables_case_role");
  VET();
  const k4v = await sale("k4v", [svcLine("CBC", S01, 1, 25000, 0, { consumables: OV })]);
  check("  الطبيبُ بتعديل: source override، والكلفةُ تتبعه (٥٠٠٫٠٠)، ومواصفةٌ واحدة", evsOf(k4v.id).length === 1 && evsOf(k4v.id)[0].source === "override" && linesOf(k4v.id)[0].unit_cost === 500, JSON.stringify(evsOf(k4v.id).map((x) => x.source)));
  RCP();
  const k4again = await errOf(() => sale("k4v", [svcLine("CBC", S01, 1, 25000, 0, { consumables: OV })]));
  check("  وإعادتُها من الاستقبال ترجع الفاتورةَ نفسَها — الإعادةُ قبل الخطّة فلا ترفض ولا تكتب", k4again === null && evsOf(k4v.id).length === 1 && db().invoices.filter((i) => i.client_ref === "k4v").length === 1);
  VET();
  const k4e = await sale("k4e", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [] })]);
  const ke = skipsOf(k4e.id);
  check("  والطبيبُ بـ[] (ما انصرف شي): لا دفتر، والسطرُ بالثابتة (صفر)", evsOf(k4e.id).length === 0 && linesOf(k4e.id)[0].unit_cost === 0);
  check("  وoverride_none (قرارُ المالك): تخطٍّ على مستوى السطر بلا مادّة، source override، بكمية السطر",
    ke.length === 1 && ke[0].note === "override_none" && ke[0].source === "override" && ke[0].product_id === null && ke[0].qty_m === null && ke[0].unit === null && ke[0].line_qty_m === "1000" && ke[0].service_id === S01,
    JSON.stringify(ke));
  RCP();
  const k4r = await sale("k4r", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [...LINES].reverse().map((l) => ({ ...l, qty: String(l.qty.toFixed(3)) })) })]);
  check("  والاستقبالُ بتعديلٍ يساوي الوصفة (بترتيبٍ آخر وأرقامٍ نصّية) يسقط: source recipe", evsOf(k4r.id).length === 4 && evsOf(k4r.id).every((x) => x.source === "recipe"));
  RCP(); pinOn();
  check("  والاستقبالُ بمفتاح المدير الحيّ يعدّل (auth_role() = 'manager')", (await code(() => sale("k4p", [svcLine("CBC", S01, 1, 25000, 0, { consumables: OV })]))) === "ok");
  as("s9", "admin", { clinicId: "c", role: "doctor", staffRole: "veterinarian" });
  check("  وطبيبٌ بعضوية (staff.staffRole) يعدّل", (await code(() => sale("k4s", [svcLine("CBC", S01, 1, 25000, 0, { consumables: OV })]))) === "ok");
  VET();
  e = await errOf(() => sale("k5x", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [{ product_id: "R99", qty: 1 }] })]));
  check("K5: تعديلٌ بمادةٍ مجهولة ⇒ consumables_bad («مو من مخزن هالعيادة»)", e?.message === "consumables_bad" && e?.hint === hintOf("consumables_bad", 1, "CBC"), `${e?.message}|${e?.hint}`);
  e = await errOf(() => sale("k5y", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [{ product_id: "R01", qty: 1.0005 }] })]));
  check("  وكميةٌ بأربع منازل ⇒ consumables_bad («غلط — افتحها»)", e?.message === "consumables_bad" && e?.hint === hintOf("consumables_bad", 0, "CBC"), `${e?.message}|${e?.hint}`);
  check("  وتكرارُ مادّة، و٤١ مدخلاً، وليست مصفوفة ⇒ consumables_bad", (await code(() => sale("k5z", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [{ product_id: "R01", qty: 1 }, { product_id: "R01", qty: 2, unit: "sub" }] })]))) === "consumables_bad"
    && (await code(() => sale("k5w", [svcLine("CBC", S01, 1, 25000, 0, { consumables: Array.from({ length: 41 }, (_, i) => ({ product_id: `X${i}`, qty: 1 })) })]))) === "consumables_bad"
    && (await code(() => sale("k5v", [svcLine("CBC", S01, 1, 25000, 0, { consumables: { product_id: "R01" } })]))) === "consumables_bad");
  check("  ولا شيءَ انكتب بالمرفوضة", !["k5x", "k5y", "k5z", "k5w", "k5v", "k4x", "k4u"].some(invOf));
  const k5s = await sale("k5s", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [{ product_id: "R06", qty: 1 }, { product_id: "R07", qty: 1 }, { product_id: "R09", qty: 1, unit: "sub" }] })]);
  check("  وحوضٌ وحقلٌ وبلا وحدةٍ صغيرة ⇒ تخطّيات المادة (farm_stock, no_sub_unit, pooled)، ولا دفتر، والرصيدُ لم يتحرّك",
    skipsOf(k5s.id).map((k) => k.note).sort().join(",") === "farm_stock,no_sub_unit,pooled" && evsOf(k5s.id).length === 0 && stk("R06", "R07", "R09") === "5.000|5.000|1.000"
      && skipsOf(k5s.id).every((k) => k.source === "override" && k.line_qty_m === "1000"));
  OWNER();
  const k6 = await sale("k6", [svcLine("CBC", U("98"), 1, 25000, 700), svcLine("CBC", null), svcLine("أجرة توصيل", null, 1, 2000), svcLine("فحص", S05, 1, 10000, 900),
    svcLine("فحص", null, 1, 10000, 900)]);
  check("K6: تخطّيان على السطر — old_device (بلا خدمة) وservice_missing (بمعرّفه) — والأجرةُ و«فحص» بلا معرّف (خدمةٌ بلا وصفة) بلا صفّ",
    skipsOf(k6.id).map((k) => k.note).sort().join(",") === "old_device,service_missing" && skipsOf(k6.id).every((k) => k.source === "none" && k.product_id === null)
      && skipsOf(k6.id).find((k) => k.note === "service_missing")?.service_id === U("98") && skipsOf(k6.id).find((k) => k.note === "old_device")?.service_id === null);
  const l6 = linesOf(k6.id).map((ii) => `${ii.name}:${ii.unit_cost}:${ii.service_id ?? "null"}`).sort().join(",");
  check("K6/K7: كلفةُ الجهاز لكلّ سطرٍ غير مخطَّط، ولا service_id لخدمةٍ مجهولة، و«فحص» بلا وصفة يحفظ خدمتَه بكلفة ٩٠٠",
    l6 === ["CBC:0:null", "CBC:700:null", `فحص:900:${S05}`, "فحص:900:null", "أجرة توصيل:0:null"].sort().join(","), l6);
  check("  ولا دفتر", evsOf(k6.id).length === 0);
  e = await errOf(() => sale("k9b", [svcLine("x", "abc")]));
  check("K9: معرّفُ خدمةٍ ليس uuid ⇒ service_id_bad بلا فاتورة", e?.message === "service_id_bad" && e?.hint === hintOf("service_id_bad") && !invOf("k9b"));
  const k9n = await sale("k9n", [svcLine("x", S01, -1, 1)]);
  check("  وسطرُ خدمةٍ سالب لا يستهلك ولا يحفظ خدمة", evsOf(k9n.id).length === 0 && skipsOf(k9n.id).length === 0 && linesOf(k9n.id)[0].service_id === undefined);
  const yday = new Date(Date.now() - 86400000).toISOString();
  RCP();
  check("K11: الاستقبالُ لا يؤرّخ (backdate_not_allowed) — قبل الخطّة", (await code(() => sale("k11r", [svcLine("حقنة", S03, 1, 5000)], { sale_at: yday }))) === "backdate_not_allowed");
  OWNER();
  const k11 = await sale("k11", [svcLine("حقنة", S03, 1, 5000)], { sale_at: yday });
  const e11 = evsOf(k11.id)[0];
  check("  والمديرُ يؤرّخ: الفاتورةُ أمس، والدفترُ مختومٌ الآن، والسرنجةُ ٥cc ٠٫٠٣٠",
    Date.parse(k11.created_at) < Date.now() - 20 * 3600e3 && Date.parse(e11.created_at) > Date.now() - 3600e3 && stk("R08") === "0.030", `${k11.created_at}|${e11?.created_at}|${stk("R08")}`);
  vc();
}

console.log("▸ الكلفةُ الثابتة + المواد، وسطورُ وصفةٍ معطّلة، وسطرُ مادّةٍ سالب");
{
  OWNER();
  const f1 = await sale("f1", [svcLine("خياطة جرح", SF, 1, 30000, 1)]);
  check("بلا تعديل: الثابتةُ من الكتالوج + المواد (كلفةُ الجهاز ١ تُهمل): ٣٠٠٠ + ٢٠٠٠ = ٥٠٠٠، والخيط ٠٫٩١٧ (١/١٢) ومرحَّلُه ٠٫٠٠٠٣٣٣٣٣٣",
    `${linesOf(f1.id)[0].unit_cost}|${f1.cost_total}|${stk("F2")}|${cry("F2")}` === "5000|5000|0.917|0.000333333", `${linesOf(f1.id)[0].unit_cost}|${stk("F2")}|${cry("F2")}`);
  VET();
  const f2 = await sale("f2", [svcLine("خياطة جرح", SF, 1, 30000, 1, { consumables: [] })]);
  check("  والطبيبُ بـ[] على خدمةٍ بكلفةٍ ثابتة ووصفة: السطرُ بالثابتة ٣٠٠٠ وحدها، ولا دفتر، والخيطُ لم يُمسّ، وoverride_none",
    linesOf(f2.id)[0].unit_cost === 3000 && evsOf(f2.id).length === 0 && stk("F2") === "0.917" && skipsOf(f2.id).map((k) => k.note).join() === "override_none");
  OWNER();
  await repo.deleteProduct("PA");
  { const d = db(); prod("PB", d).pooled = true; prod("PC", d).has_sub_unit = false;
    d.serviceRecipes.push({ id: "rcp-gone", service_id: SD, product_id: "PGONE", product_name: "مادة اختفت", qty_m: "1000", unit: "stock", position: 3, updated_at: nowIso(), updated_by: null });
    save(d); }
  const gd = await api.recipeGet(SD);
  check("K5: الوصفةُ تقول كلَّ عطل — محذوفة، حوض، بلا وحدةٍ صغيرة، غائبة — وكلفةُ كلٍّ صفر، والاسمُ من المحذوفات أو اللقطة",
    gd.lines.map((l) => `${l.problem}:${l.per_value}`).join(",") === "in_trash:0,pooled:0,no_sub_unit:0,product_gone:0" && gd.lines[0].product_name === "محلول للحذف"
      && gd.lines[3].product_name === "مادة اختفت" && gd.lines[0].stock === null && gd.lines[0].unit_cost === 0 && gd.lines[1].unit_cost === 1000, JSON.stringify(gd.lines.map((l) => [l.problem, l.per_value, l.unit_cost])));
  check("  والملخّص: أربعُ سطورٍ معطّلة بكلفة صفر", JSON.stringify((await api.recipeSummary())[SD]) === JSON.stringify({ lines: 4, cost: 0, broken: 4 }), JSON.stringify((await api.recipeSummary())[SD]));
  const sd = await sale("sd", [svcLine("جرعة مركّبة", SD, 1, 15000, 0)]);
  check("  والبيعةُ تمرّ بلا خصم: أربعُ تخطّياتٍ بكمياتها كما أُدخلت (source recipe)، ولا دفتر، والسطرُ صفر",
    skipsOf(sd.id).map((k) => `${k.note}:${k.qty_m}:${k.unit}`).sort().join(",") === ["in_trash:5000:sub", "pooled:1000:sub", "no_sub_unit:1000:sub", "product_gone:1000:stock"].sort().join(",")
      && evsOf(sd.id).length === 0 && linesOf(sd.id)[0].unit_cost === 0 && skipsOf(sd.id).every((k) => k.source === "recipe") && skipsOf(sd.id).find((k) => k.note === "in_trash")?.product_name === "محلول للحذف",
    JSON.stringify(skipsOf(sd.id).map((k) => [k.note, k.qty_m, k.unit, k.product_name])));
  PRODUCT_LINES.add("NL");
  const nl = await sale("nl", [{ product_id: "NL", name: "مادة تصير سالبة", qty: 1, unit_price: 1000, unit_cost: 500, stock_qty: 1 }]);
  const xn = (await api.invoiceConsumption([nl.id]))[nl.id];
  check("negatives: سطرُ مادّةٍ بلا مستهلكات (٠ ⇒ −١) يُقال — المسُّ سطرُ مادّةٍ لا الدفترُ وحده", xn.negatives.length === 1 && xn.negatives[0].product_id === "NL" && xn.negatives[0].stock === -1 && Object.keys(xn.items).length === 0,
    JSON.stringify(xn));
  vc();
}

console.log("▸ العكس: ترجيع ← فكّ ← ترجيع، مرتجعٌ جزئيّ، تعديلٌ مرّتين بمعرّفاتٍ جديدة");
let V3 = null;
{
  const four = () => stk("R01", "R02", "R03", "R04");
  const before = four();
  const v1 = await sale("v1", [svcLine("CBC", S01)]);
  const sold = four();
  await repo.refundInvoice(v1.id);
  check("V1: الترجيعُ يردّ كلَّ مواصفةٍ بالضبط", four() === before, `${four()} vs ${before}`);
  vc();
  const unrefund = () => { const d = db(); const i = d.invoices.find((x) => x.id === v1.id); i.status = "paid"; i.refunded_at = null; cons.statusSyncLocal(d, v1.id, false, nowIso()); save(d); };
  unrefund();
  check("V6: فكُّ الترجيع مباشرةً (مرجَّعة ← مدفوعة) يعيد الاستهلاكَ بقيمه المجمَّدة", four() === sold, `${four()} vs ${sold}`);
  vc();
  await repo.refundInvoice(v1.id);
  check("  وترجيعٌ ثانٍ يردّه بالضبط مرّةً أخرى", four() === before);
  vc();
  unrefund();
  check("  وفكٌّ ثانٍ يعيده (ترجيع ← فكّ ← ترجيع ← فكّ)", four() === sold);
  vc();
  const v3 = await sale("v3", [svcLine("CBC", S01, 3)]);
  V3 = v3.id;
  const r02a = Number(prod("R02").stock);
  const L3 = linesOf(v3.id)[0];
  await repo.returnInvoiceItems(v3.id, [{ item_id: L3.id, qty: 2 }]);
  check("V3: مرتجعٌ جزئيّ ٣ ← ١ يردّ ٢×٠٫٠٠٤ من Lyse", (Number(prod("R02").stock) - r02a).toFixed(3) === "0.008");
  check("  والكلفةُ تُعاد من السطر الباقي: ٨١٥", db().invoices.find((i) => i.id === v3.id).cost_total === 815);
  vc();
  const sE = four();
  const id0 = linesOf(v3.id)[0].id;
  await repo.editInvoiceLines(v3.id, editLines(v3.id), "probe");
  const L5 = linesOf(v3.id)[0];
  check("V5: تعديلٌ بلا تغيير صافيه صفر", four() === sE, `${four()} vs ${sE}`);
  check("  ومعرّفُ السطر جديد (كالخادم)، وخدمتُه موروثة، وأربعُ مواصفات relink من القديم", L5.id !== id0 && L5.service_id === S01
    && new Set(evsOf(v3.id).filter((x) => x.item_id === L5.id && x.source === "relink" && x.from_item === id0).map((x) => x.spec_id)).size === 4);
  check("  والكلفةُ كما كانت ٨١٥", db().invoices.find((i) => i.id === v3.id).cost_total === 815);
  vc();
  const snap = mem.get(DB_KEY);
  const tw = editLines(v3.id);
  const e = await errOf(() => repo.editInvoiceLines(v3.id, [tw[0], { ...tw[0] }], "probe"));
  check("  ومعرّفُ سطرٍ مرّتين ⇒ edit_line_twice بتلميحه، ولا شيءَ تحرّك", e?.message === "edit_line_twice" && e?.hint === hintOf("edit_line_twice") && mem.get(DB_KEY) === snap, `${e?.message}|${e?.hint}`);
  const r02b = Number(prod("R02").stock);
  const id1 = L5.id;
  // الوصفةُ تغيّرت (Lyse ٢ ← ٣ مل) وسعرُ شرائها (٦٠٠٠٠ ← ٩٠٠٠٠) بعد البيعة — الربطُ يحمل القيمَ المجمَّدة لا الحاضرة
  await api.recipeSet(S01, LINES.map((l) => (l.product_id === "R02" ? { ...l, qty: 3 } : l)), (await api.recipeGet(S01)).fingerprint);
  { const d = db(); prod("R02", d).purchase_price = 90000; save(d); }
  await repo.editInvoiceLines(v3.id, editLines(v3.id, () => ({ qty: 2 })), "probe up");
  const L6 = linesOf(v3.id)[0];
  check("  وتعديلٌ ثانٍ متتالٍ يرفع ١ ← ٢ بعد تغيّر الوصفة والسعر: يستهلك وحدةً أخرى بالقيم المجمَّدة (Lyse −٠٫٠٠٤ لا −٠٫٠٠٦)، ومعرّفٌ جديدٌ ثالث",
    (r02b - Number(prod("R02").stock)).toFixed(3) === "0.004" && L6.id !== id1 && L6.id !== id0 && L6.qty === 2, (r02b - Number(prod("R02").stock)).toFixed(3));
  const fz = evsOf(v3.id).filter((x) => x.item_id === L6.id && x.product_id === "R02");
  check("  ومواصفةُ Lyse على السطر الجديد: ٢ مل و٢٤٠ بكلفة ٦٠٠٠٠ (مجمَّدة)", fz.length > 0 && fz.every((x) => x.per_qty_m === "2000" && x.per_value_c === "24000" && x.unit_cost_u === "60000000000" && x.source === "relink"),
    JSON.stringify(fz.map((x) => [x.per_qty_m, x.per_value_c, x.unit_cost_u])));
  check("  والكلفةُ ٢ × ٨١٥ سطراً سطراً", db().invoices.find((i) => i.id === v3.id).cost_total === 1630);
  vc();
  await api.recipeSet(S01, LINES, (await api.recipeGet(S01)).fingerprint);
  { const d = db(); prod("R02", d).purchase_price = 60000; save(d); }
  const snapN = mem.get(DB_KEY);
  /* SQL الجولة الثانية (0252، edit_invoice_lines_unguarded): سطرُ المادّة يُخصم كالبيعة — لا «not enough stock» ولا حصر (قرارُ المالك).
   * كان هذا الفحصُ يثبّت الرفض؛ وانقلب كما قلب المُدمِجُ فحصَ V5 بالحزمة: السطرُ يُحفظ والمادّةُ −٠٫٠٥ − ١ = −١٫٠٥ تقولها قراءةُ
   * negatives، وstock_qty يُقرَّب صفراً لا يخصم شيئاً. والمخزنُ يعود للقطة بعد كلٍّ منهما فما بعدهما كما كان. */
  const ng1 = await code(() => repo.editInvoiceLines(v3.id, [...editLines(v3.id), { product_id: "NG", name: "مادة سالبة", qty: 1, unit_price: 1000, unit_cost: 1000, stock_qty: 1 }], "neg"));
  const ngA = fx3(prod("NG").stock);
  const negA = ((await api.invoiceConsumption([v3.id]))[v3.id]?.negatives ?? []).map((n) => `${n.product_id}:${n.stock}`).join(",");
  mem.set(DB_KEY, snapN);
  const ng2 = await code(() => repo.editInvoiceLines(v3.id, [...editLines(v3.id), { product_id: "NG", name: "مادة سالبة", qty: 1, unit_price: 1000, unit_cost: 1000, stock_qty: 0.0004 }], "neg0"));
  const ngB = fx3(prod("NG").stock), ngLine = linesOf(v3.id).find((l) => l.product_id === "NG")?.stock_qty;
  mem.set(DB_KEY, snapN);
  check("  [2b] وسطرُ مادّةٍ رصيدُها سالب (−٠٫٠٥) يُحفظ كالبيعة: −١٫٠٥ تقولها negatives — وstock_qty يُقرَّب صفراً لا يخصم شيئاً",
    ng1 === "ok" && ngA === "-1.050" && negA.split(",").includes("NG:-1.05") && ng2 === "ok" && ngB === "-0.050" && ngLine === 0, `${ng1}|${ngA}|${negA}|${ng2}|${ngB}|${ngLine}`);
  await repo.returnInvoiceItems(v3.id, [{ item_id: L6.id, qty: 1 }]);
  check("  ومرتجعٌ جزئيّ بعد التعديل (٢ ← ١) يردّ وحدة (Lyse يرجع)", (r02b - Number(prod("R02").stock)).toFixed(3) === "0.000" && linesOf(v3.id)[0].id === L6.id);
  vc();
  // V8: كتابةٌ مباشرة لكلفة السطر تحت موادّه — الفحصُ يمسكها (هوّة M15)
  { const d = db(); d.invoiceItems.find((x) => x.id === L6.id).unit_cost = 100; save(d); }
  const v8 = verify();
  check("V8: unit_cost ١٠٠ < ٨١٥ ⇒ line_below_materials لذاك السطر وحده", v8.length === 1 && v8[0] === `line_below_materials:${L6.id}`, v8.join(";"));
  { const d = db(); d.invoiceItems.find((x) => x.id === L6.id).unit_cost = 815; save(d); }
  vc();
  // V6: مدفوعة ← مرجَّعة بكتابةٍ مباشرة (المحفّز وحده — لا refund_invoice) ثمّ رجوعُها
  const st = await sale("st", [svcLine("خدمة الحالة", SST, 1, 20000)]);
  const soldS = stk("E1", "E2");
  const setStatus = (status) => { const d = db(); const i = d.invoices.find((x) => x.id === st.id); i.status = status; cons.statusSyncLocal(d, st.id, status === "refunded", nowIso()); save(d); };
  setStatus("refunded");
  check("V6: مدفوعة ← مرجَّعة مباشرةً: محفّزُ الحالة يردّ المستهلكات (١٫٠٠٠ و١٫٠٠٠ والمرحَّلُ صفر)", `${stk("E1", "E2")}|${cry("E1")}` === "1.000|1.000|0.000000000", `${soldS} → ${stk("E1", "E2")}|${cry("E1")}`);
  vc();
  setStatus("paid");
  check("  ومرجَّعة ← مدفوعة: تُعاد بقيمها المجمَّدة", stk("E1", "E2") === soldS && soldS === "0.999|0.900");
  vc();
}

console.log("▸ الدمج والمحذوفات والحركات والقراءات (G1/G3/G4/G5/G6)");
{
  OWNER();
  const g5 = await sale("g5", [svcLine("تعقيم قطة", S02)]);
  check("S02 مخطَّطة: السطرُ = الثابتةُ المصفَّرة + ٢٠٠٠، والخيط ٠٫٩١٧ ومرحَّلُه ٠٫٠٠٠٣٣٣٣٣٣", `${linesOf(g5.id)[0].unit_cost}|${stk("R05")}|${cry("R05")}` === "2000|0.917|0.000333333", `${linesOf(g5.id)[0].unit_cost}|${stk("R05")}|${cry("R05")}`);
  await repo.mergeProducts("R03b", "R03");
  MERGED.set("R03", "R03b");
  const rr = (db().serviceRecipes ?? []).filter((r) => r.product_id === "R03b");
  check("G1: سطرُ الوصفة انتقل للأصل باسمه", rr.length === 1 && rr[0].product_name === "سرنجة 3cc ب" && rr[0].service_id === S01);
  check("  والدفترُ انتقل، ومرحَّلُ التوأم طُوي وزال", (db().consumption ?? []).filter((e) => e.product_id === "R03").length === 0 && cry("R03") === "none" && cry("R03b") !== "none");
  vc("  والثابتُ بعد الدمج (ext_in/ext_out جُمعت) والرصيدُ محفوظٌ للمجموعة");
  { const d = db(); const r = cons.stockPostLocal(d, "R03", -10000000n, "ledger", nowIso()); save(d);
    check("G4: معرّفٌ قديم يتبع merged_into: يكتب للأصل الحيّ −٠٫٠١٠", r.product === "R03b" && r.place === "live" && r.posted === -10n, JSON.stringify({ ...r, posted: String(r.posted), before: String(r.before) })); }
  { const d = db(); cons.stockPostLocal(d, "R03", 10000000n, "ledger", nowIso()); save(d); }
  check("  ولا مرحَّلَ نشأ للتوأم، والثابتُ سليم", cry("R03") === "none" && verify().length === 0, verify().join(";"));
  await repo.mergeProducts("R11", "R10");
  MERGED.set("R10", "R11");
  check("G3: دمجُ مادّتين بلا مرحَّلٍ قطّ يمرّ، ولا مرحَّلَ نشأ", (db().productsTrash ?? []).some((t) => t.id === "R10" && t.merged_into === "R11") && cry("R10") === "none" && cry("R11") === "none" && stk("R11") === "2.000");
  await repo.deleteProduct("R05");
  const g5b = await sale("g5b", [svcLine("تعقيم قطة", S02)]);
  check("G5: بيعةٌ بعد الحذف ⇒ in_trash باسم صفّ المحذوفات، ولا دفتر", skipsOf(g5b.id).map((k) => `${k.note}:${k.product_name}`).join(",") === "in_trash:خيط" && evsOf(g5b.id).length === 0);
  const ts = Number(db().productsTrash.find((t) => t.id === "R05").stock);
  await repo.refundInvoice(g5.id);
  const tr = db().productsTrash.find((t) => t.id === "R05");
  check("  وترجيعُ البيعة الأولى يردّ للمحذوفات: الرصيدُ +٠٫٠٨٣ واللقطةُ ١٫٠٠٠، وحدثُه in_trash", (Number(tr.stock) - ts).toFixed(3) === "0.083" && fx3(tr.row.stock) === "1.000"
    && evsOf(g5.id).some((e) => e.kind === "restore" && e.note === "in_trash"));
  vc();
  await repo.restoreProduct("R05");
  await sale("g5c", [svcLine("تعقيم قطة", S02)]);
  check("  والاسترجاعُ (نفسُ المعرّف) ثم البيعةُ التالية تستهلك من جديد: الخيط ٠٫٩١٧", stk("R05") === "0.917");
  vc();
  // G6: حركاتُ Lyse — صفُّ تدقيقٍ لكلّ تغيّر رصيد (كمحفّز audit_all بالخادم) بجانب حدث الاستهلاك
  { const d = db(); let s = SEED.get("R02"); const au = [];
    for (const e of (d.consumption ?? []).filter((x) => x.product_id === "R02" && x.posted_m !== "0")) {
      const f = s; s -= BigInt(e.posted_m);
      // لحظةٌ لكلّ صفّ (+k ملّي ثانية): حركتان بنفس اللحظة تُطويان، والاتّجاهُ يُفحص صفّاً صفّاً
      au.push({ id: `au-${au.length}`, action: "UPDATE", entity: "products", entity_id: "R02", actor: null, created_at: new Date(Date.parse(e.created_at) + au.length).toISOString(),
        details: { __changed: { stock: [C.fromScaled(f, 3), C.fromScaled(s, 3)] } } });
    }
    mem.set(AUDIT_KEY, JSON.stringify(au.reverse())); }
  const mv = await repo.productMovements("R02");
  const kinds = new Set(mv.map((m) => m.kind));
  check("G6: حركاتُ المادة تسمّي «مستهلكات» و«مستهلكات — إرجاع» (consume / consume_return) بفاتورتهما", kinds.has("consume") && kinds.has("consume_return")
    && mv.filter((m) => String(m.kind).startsWith("consume")).every((m) => m.ref_id && db().invoices.some((i) => i.id === m.ref_id)), JSON.stringify([...kinds]));
  check("  والاتّجاهُ اتّجاهُ الرصيد: الصرفُ ينقصه والإرجاعُ يزيده", mv.filter((m) => m.kind === "consume").every((m) => m.delta < 0) && mv.filter((m) => m.kind === "consume_return").every((m) => m.delta > 0));
  // القراءات
  const k3 = invOf("k3");
  const x3 = (await api.invoiceConsumption([k3.id]))[k3.id];
  check("invoiceConsumption(k3): أربعُ مواصفات، والكفوفُ بين السالبة برصيدها", Object.values(x3.items).flat().length === 4 && x3.negatives.some((n) => n.product_id === "R04" && n.name === "قفازات" && n.stock < 0),
    JSON.stringify(x3.negatives));
  const sp = Object.values(x3.items).flat().find((s) => s.product_id === "R04");
  check("  والمواصفة: per_qty ١ وper_div ٥٠ والحيّ ٠٫٠٦ وقيمتُه ٧٥٠ والعجزُ ٠٫٠٤ وما رجع صفر", sp.per_qty === 1 && sp.per_div === 50 && sp.live_qty === 0.06 && sp.live_value === 750 && sp.shortfall === 0.04 && sp.restored_qty === 0 && sp.source === "recipe" && sp.note === null && sp.unit === "sub" && sp.unit_label === "زوج",
    JSON.stringify(sp));
  const xv3 = (await api.invoiceConsumption([V3]))[V3];
  const rest = Object.values(xv3.items).flat().filter((s) => s.product_id === "R01").map((s) => s.restored_qty.toFixed(9)).sort().join(",");
  check("invoiceConsumption(v3): ما رجع من Diluent لكلّ سطر (الأصليّ والسطران الجديدان)", rest === "0.000500000,0.000500000,0.001500000", rest);
  const ke = (await api.invoiceConsumption([invOf("k4e").id]))[invOf("k4e").id];
  check("  والتخطّي يُقرأ: override_none بلا مادّة باسم السطر", ke.skips.length === 1 && ke.skips[0].note === "override_none" && ke.skips[0].product_id === null && ke.skips[0].line_name === "CBC" && ke.skips[0].source === "override");
  const none = await api.invoiceConsumption(["nope", null]);
  check("  وفاتورةٌ لا يعرفها لا تُرجع شيئاً (لا مفتاحَ فارغاً)", Object.keys(none).length === 0);
  const tm = await errOf(() => api.invoiceConsumption(Array.from({ length: 51 }, (_, i) => `x${i}`)));
  check("  وأكثرُ من ٥٠ ⇒ too_many بتلميحه (لا قصّ)", tm?.message === "too_many" && tm?.hint === hintOf("too_many"));
  // ما لا يُعدّ: تعديلٌ بفاتورةٍ مرجَّعة، وتخطّياتُ سطرٍ أعادها الربطُ تاريخاً (تعديلُ k6 بلا تغيير)
  VET();
  const k4z = await sale("k4z", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [{ product_id: "R03b", qty: 2, unit: "sub" }] })]);
  OWNER();
  await repo.refundInvoice(k4z.id);
  await repo.editInvoiceLines(invOf("k6").id, editLines(invOf("k6").id), "k6");
  check("  (تعديلُ k6 أعاد تخطّيَيه على سطرين جديدين بمصدر relink)", skipsOf(invOf("k6").id).filter((k) => k.source === "relink").map((k) => k.note).sort().join() === "old_device,service_missing");
  const F0 = new Date(Date.now() - 3 * 86400e3).toISOString(), T0 = new Date(Date.now() + 86400e3).toISOString();
  const rep = await api.reportConsumables(F0, T0);
  { // المنتجاتُ بحسابٍ مستقلّ: أحداثُ الفواتير غير المرجَّعة بالمدّة، Σ الكمية والقيمة، والسطورُ بحيٍّ موجب — والعجزُ (الجولة 3)
    // مرّةً لكلّ (فاتورة، مادّة) بآخر حالها: خطواتُ (at_us، g) بمجموعٍ جارٍ، العجزُ آخرُه ناقصَ أدنى ما بلغه (والصفرُ أوّلُه)؛ والدفعةُ
    // صافيةٌ (صرفُها وإرجاعُ ما وُلد قبلها: u + r ≥ 0 ⇒ min(f, u + r)) وإرجاعُ ما وُلد فيها خطوةٌ بعدها. كان Σ عجز الأحداث (الجولة 1).
    const d = db();
    const live = new Set(d.invoices.filter((i) => i.status !== "refunded" && i.created_at >= F0 && i.created_at < T0).map((i) => i.id));
    const agg = new Map();
    const evs = d.consumption.filter((e) => live.has(e.invoice_id));
    const born = new Map();
    for (const e of evs) if (!born.has(e.spec_id) || e.at_us < born.get(e.spec_id)) born.set(e.spec_id, e.at_us);
    const steps = new Map();
    for (const e of evs) {
      const a = agg.get(e.product_id) ?? { q: 0n, v: 0n, s: 0n, lines: new Map() };
      a.q += BigInt(e.qty_n); a.v += BigInt(e.value_c); a.lines.set(e.item_id, (a.lines.get(e.item_id) ?? 0n) + BigInt(e.qty_n));
      agg.set(e.product_id, a);
      const g = e.kind === "restore" && born.get(e.spec_id) === e.at_us ? 2 : 1, k = `${e.invoice_id}|${e.product_id}`;
      const st = steps.get(k) ?? new Map(), x = st.get(`${e.at_us}|${g}`) ?? { at: e.at_us, g, u: 0n, f: 0n, r: 0n };
      if (e.kind === "use") { x.u += BigInt(e.posted_m); x.f += BigInt(e.shortfall_m); } else x.r += BigInt(e.posted_m);
      st.set(`${e.at_us}|${g}`, x); steps.set(k, st);
    }
    for (const [k, st] of steps) {
      let run = 0n, low = 0n;
      for (const x of [...st.values()].sort((p, q) => p.at - q.at || p.g - q.g)) {
        run += x.u + x.r >= 0n ? (x.f < x.u + x.r ? x.f : x.u + x.r) : x.u + x.r;
        if (run < low) low = run;
      }
      agg.get(k.split("|")[1]).s += run - low;
    }
    const want = [...agg].filter(([, a]) => a.q !== 0n || a.v !== 0n || a.s !== 0n)
      .map(([pid, a]) => `${pid}:${C.fromScaled(a.q, 9)}:${C.fromScaled(a.v, 2)}:${C.fromScaled(a.s, 3)}:${[...a.lines.values()].filter((x) => x > 0n).length}`).sort().join(",");
    const got = rep.products.map((p) => `${p.product_id}:${p.used}:${p.value}:${p.short}:${p.lines}`).sort().join(",");
    check("  والمواد بحسابٍ مستقلّ من الدفتر (المرجَّعةُ لا تُحسب): الكمية والقيمة والعجز والسطور لكلّ مادّة", got === want && rep.products.length > 0, `${got}\n      ≠ ${want}`);
  }
  /* المِسبارُ (نصُّ 0252 اليوم) يقول ١|٢|١|١: k4v وk5s. والتجريبيُّ يزيد أربعة عن قصد: k4p وk4s (فحصا الدور هنا،
   * ليسا بالمِسبار)، وk4e وf2 — تعديلٌ بـ[] يكتب override_none (قرارُ المالك) فيُعدّ تعديلاً من جدول التخطّي.
   * وk4z (تعديلٌ رُجِّعت فاتورتُه) لا يُعدّ. */
  const ovCount = `${rep.short_products}|${rep.overrides.count}|${rep.unconsumed.old_device}|${rep.unconsumed.service_missing}`;
  check("reportConsumables: صُرفت بلا رصيد ١ | تعديلات ٦ (k4v، k4p، k4s، k5s، وoverride_none لـk4e وf2؛ لا k4z المرجَّعة) | جهازٌ قديم ١ | خدمةٌ مجهولة ١ (لا نسخُ الربط)", ovCount === "1|6|1|1", ovCount);
  const okE = rep.overrides.recent.find((r) => r.invoice_id === invOf("k4e").id);
  // [2b] SQL الجولة الثانية: التخطّي يحمل كاتبَه (created_by)، فـoverride_none يسمّي الطبيبَ الذي صفّر الحالة — كان بلا اسم
  check("  [2b] وتعديلُ [] بينها: «CBC» بلا مواد، باسم الطبيب الذي صفّرها (created_by)", okE?.service_name === "CBC" && JSON.stringify(okE?.products) === "[]" && okE?.by_name === "الطبيب ف", JSON.stringify(okE));
  check("  وما بيع بلا خصم بأحدثه أوّلاً، باسم السطر وسببه", rep.unconsumed.recent.length === 2 && rep.unconsumed.recent.every((r) => r.invoice_id === invOf("k6").id && r.line_name === "CBC"),
    JSON.stringify(rep.unconsumed.recent));
  const rr04 = rep.products.find((p) => p.product_id === "R04");
  check("  ولكلّ مادّة ما انصرف صافياً وقيمتُه وعجزُه وسطورُه (المرجَّعةُ لا تُحسب)", rr04 && rr04.short > 0 && rr04.lines > 0 && rep.products.every((p, i, a) => i === 0 || a[i - 1].value >= p.value), JSON.stringify(rr04));
  const kr = rep.overrides.recent.find((r) => r.invoice_id === invOf("k4v").id);
  check("  والتعديلُ يقول الخدمة والمادة ومن (الطبيب من الكادر)", kr?.service_name === "CBC" && JSON.stringify(kr?.products) === JSON.stringify(["سرنجة 3cc"]) && kr?.by_name === "الطبيب ف", JSON.stringify(kr));
  check("  ومدّةٌ أقلّ من يوم ⇒ range_bad", (await errOf(() => api.reportConsumables(nowIso(), new Date(Date.now() + 3600e3).toISOString())))?.hint === hintOf("range_bad"));
  check("  وأكثرُ من ٤٠٠ يوم ⇒ range_bad", (await code(() => api.reportConsumables(new Date(Date.now() - 401 * 86400e3).toISOString(), nowIso()))) === "range_bad");
}

console.log("▸ V2/V4/V7 وK12/K13 بموادّها");
{
  OWNER();
  const v2 = await sale("v2", [svcLine("خدمة V2", SV2, 2, 20000)]);
  check("V2 (البيعة ×٢): المحلول ٠٫٩٩٩ ومرحَّلُه صفر، والقطعة ٠٫٨٠٠، والسطرُ ٧٥ + ١٠٠", `${stk("D2", "Q2")}|${cry("D2")}|${linesOf(v2.id)[0].unit_cost}` === "0.999|0.800|0.000000000|175");
  await repo.deleteInvoice(v2.id);
  check("  حذفٌ بلا ترجيعٍ قبله يردّ كلَّ شيء، والدفترُ باقٍ تاريخاً بأحداثه الأربعة", `${stk("D2", "Q2")}|${cry("D2")}` === "1.000|1.000|0.000000000" && evsOf(v2.id).length === 4 && !db().invoices.some((i) => i.id === v2.id));
  const xd = (await api.invoiceConsumption([v2.id]))[v2.id];
  check("  وقراءتُه بعد الحذف ما زالت تقول ما رجع", xd && Object.values(xd.items).flat().every((s) => s.live_qty === 0 && s.restored_qty > 0));
  vc();
  const v4 = await sale("v4", [svcLine("خدمة V4", SV4)]);
  await repo.returnInvoiceItems(v4.id, [{ item_id: linesOf(v4.id)[0].id, qty: 1 }]);
  check("V4: مرتجعٌ كامل ⇒ «مرجَّعة» وكلُّ شيءٍ رجع", db().invoices.find((i) => i.id === v4.id).status === "refunded" && stk("D4", "Q4") === "1.000|1.000");
  await repo.deleteInvoice(v4.id);
  check("  والحذفُ بعد الترجيع لا يغيّر شيئاً", stk("D4", "Q4") === "1.000|1.000" && evsOf(v4.id).length === 4);
  vc();
  { const d = db(); prod("L7", d).has_sub_unit = false; save(d); }
  const v7 = await sale("v7", [svcLine("خدمة V7", SV7, 3, 20000)]);
  check("V7: Lyse بلا وحدةٍ صغيرة ⇒ no_sub_unit، والقطعة ٠٫٧٠٠، والسطرُ ١٠٠ (المتخطّى لا يُكلَّف)", skipsOf(v7.id).map((k) => k.note).join() === "no_sub_unit" && stk("L7", "Q7") === "2.000|0.700" && linesOf(v7.id)[0].unit_cost === 100);
  { const d = db(); prod("L7", d).has_sub_unit = true; save(d); }
  await repo.returnInvoiceItems(v7.id, [{ item_id: linesOf(v7.id)[0].id, qty: 1 }]);
  check("  تُصلَح الوحدة ثم مرتجعٌ ٣ ← ٢: القطعة ٠٫٨٠٠ وLyse لا تتحرّك (لا مزامنةَ تخصم متخطّى)", stk("L7", "Q7") === "2.000|0.800");
  await repo.editInvoiceLines(v7.id, editLines(v7.id), "v7");
  const nl = linesOf(v7.id)[0];
  check("  ثم تعديلٌ بلا تغيير: التخطّي أُعيد تاريخاً على السطر الجديد (relink بكميته ٢)",
    stk("L7", "Q7") === "2.000|0.800" && skipsOf(v7.id).some((k) => k.item_id === nl.id && k.source === "relink" && k.line_qty_m === "2000" && k.note === "no_sub_unit"));
  await repo.refundInvoice(v7.id);
  check("  ثم ترجيع (القطعة ١٫٠٠٠ وLyse ٢٫٠٠٠)", stk("L7", "Q7") === "2.000|1.000");
  { const d = db(); const i = d.invoices.find((x) => x.id === v7.id); i.status = "paid"; cons.statusSyncLocal(d, v7.id, false, nowIso()); save(d); }
  check("  ثم فكُّه: Lyse لم تتحرّك قطّ ولا حدثَ لها، والقطعة ٠٫٨٠٠", stk("L7", "Q7") === "2.000|0.800" && evsOf(v7.id).every((e) => e.product_id !== "L7"));
  vc();
  const k12 = await sale("k12", [svcLine("خدمة الجملة", SK12, 1, 8000)], { sale_kind: "wholesale" });
  check("K12: بيعةُ الجملة تستهلك بنفس الطريق (wholesale، مواصفةٌ واحدة، والجلُّ ٠٫٨٠٠)", k12.sale_kind === "wholesale" && evsOf(k12.id).length === 1 && stk("G12") === "0.800");
  PRODUCT_LINES.add("K13");
  const k13 = await sale("k13", [{ product_id: "K13", name: "قفازات ١٣", qty: 2, unit_price: 500, unit_cost: 250, stock_qty: 0.04, unit_label: "زوج" }, svcLine("كفوف الفحص", SK13, 1, 5000)]);
  const e13 = evsOf(k13.id)[0];
  check("K13: سطرُ المادّة يخصم أوّلاً: ٠٫٠٥٠ − ٠٫٠٤٠ − ٠٫٠٢٠ = −٠٫٠١٠ والعجزُ ٠٫٠١٠ (لا صفر)، والكلفةُ ٢×٢٥٠ + ٢٥٠",
    stk("K13") === "-0.010" && e13?.shortfall_m === "10" && k13.cost_total === 750, `${stk("K13")}|${e13?.shortfall_m}|${k13.cost_total}`);
  const x13 = (await api.invoiceConsumption([k13.id]))[k13.id];
  check("  والقراءةُ تقول المادةَ السالبة (سطرُ مادّةٍ ومستهلكٌ معاً)", x13.negatives.length === 1 && x13.negatives[0].product_id === "K13" && x13.negatives[0].stock === -0.01);
  vc();
}

console.log("▸ المال بالفلس الصحيح (addLineCents لا العائم)");
{
  OWNER();
  const m1 = await sale("m1", [svcLine("فحص", S05, 1.5, 815.01, 0.005)]);
  check("١٫٥ × ٨١٥٫٠١ = ١٢٢٢٫٥٢ (لا ١٢٢٢٫٥١)، وكلفةٌ ٠٫٠٠٥ × ١٫٥ تُجمع بالضبط (٠٫٠١)", m1.subtotal === 1222.52 && m1.total === 1222.52 && m1.cost_total === 0.01, `${m1.subtotal}|${m1.cost_total}`);
  const m2 = await sale("m2", [svcLine("a", null, 1, 0.005), svcLine("b", null, 1, 0.005), svcLine("c", null, 1, 0.005)]);
  check("ثلاثةُ سطورٍ بـ٠٫٠٠٥ ⇒ ٠٫٠٣ (المجموعُ الجاري يُقرَّب بعد كلّ سطر كـnumeric(14,2))", m2.subtotal === 0.03, String(m2.subtotal));
  const m3 = await sale("m3", [svcLine("فحص", S05, 2.5, 1000, 815.01)]);
  await repo.returnInvoiceItems(m3.id, [{ item_id: linesOf(m3.id)[0].id, qty: 1 }]);
  const a3 = db().invoices.find((i) => i.id === m3.id);
  check("مرتجعٌ يترك ١٫٥ × ٨١٥٫٠١: الكلفةُ ١٢٢٢٫٥٢ سطراً سطراً (sum(round(qty × unit_cost, 2)) لا ١٢٢٢٫٥١ العائم)", a3.cost_total === 1222.52 && a3.subtotal === 1500, `${a3.cost_total}|${a3.subtotal}`);
  await repo.editInvoiceLines(m3.id, editLines(m3.id, () => ({ qty: 1.5, unit_price: 815.01 })), "m3");
  const b3 = db().invoices.find((i) => i.id === m3.id);
  check("  وتعديلٌ بـ١٫٥ × ٨١٥٫٠١: المجموعُ والكلفةُ ١٢٢٢٫٥٢، وline_total كذلك", b3.subtotal === 1222.52 && b3.cost_total === 1222.52 && linesOf(m3.id)[0].line_total === 1222.52,
    `${b3.subtotal}|${b3.cost_total}|${linesOf(m3.id)[0].line_total}`);
}

console.log("▸ 0253: لا حصرَ صامتاً (T1–T6 بأرقام المِسبار)");
{
  OWNER();
  const d0 = db();
  d0.companySections = [{ id: "sec1", clinic_id: null, company_id: null, name: "قسم الحوض", pooled_stock: 0.2 }, { id: "sec6", clinic_id: null, company_id: null, name: "قسم T6", pooled_stock: 0 }];
  d0.products.push(P("T1a", "T1a صفر", 0, 500), P("T1b", "T1b كفوف", -0.06, 12500), P("T1c", "T1c حوض", 0.5, 500, { section_id: "sec1" }), P("T1d", "T1d حذف", 0, 500),
    P("T2", "T2 شراء", -0.04, 100), P("T3", "T3 قطع", 0, 1000), P("T4", "T4 مرتجع", 5, 500), P("T5a", "T5 أصل", 2, 500), P("T5b", "T5 توأم", 3, 500),
    P("T6a", "مادة الترتيب", 3, 0, { section_id: "sec6", created_at: "2026-01-01T00:00:00.000Z" }), P("T6b", "مادة الترتيب", -1, 0, { created_at: "2026-02-01T00:00:00.000Z" }));
  save(d0);
  const line = (pid, qty, sq) => [{ product_id: pid, name: "x", qty, unit_price: 1000, unit_cost: 500, stock_qty: sq }];
  const i1 = await sale(null, line("T1a", 1, 1));
  check("T1a: مادّةٌ بصفر وسطرٌ بواحد ⇒ −١٫٠٠٠", stk("T1a") === "-1.000");
  await repo.refundInvoice(i1.id);
  check("  والترجيعُ ⇒ ٠٫٠٠٠ (لا ١٫٠٠٠ — القطعةُ الوهمية زالت)", stk("T1a") === "0.000");
  const i2 = await sale(null, line("T1b", 1, 1));
  check("T1b: كفوفٌ عند −٠٫٠٦٠ وسطرٌ بواحد ⇒ −١٫٠٦٠", stk("T1b") === "-1.060");
  await repo.refundInvoice(i2.id);
  check("  والترجيعُ ⇒ −٠٫٠٦٠", stk("T1b") === "-0.060");
  const i3 = await sale(null, line("T1c", 1, 1));
  const pool = () => fx3(db().companySections.find((s) => s.id === "sec1").pooled_stock);
  check("T1c: رصيدٌ ٠٫٥ وحوضٌ ٠٫٢ وبيعُ ١ ⇒ الرصيدُ −٠٫٣٠٠ والحوضُ صفر وحصّتُه ٠٫٢٠٠", `${stk("T1c")}|${pool()}|${fx3(linesOf(i3.id)[0].pooled_qty)}` === "-0.300|0.000|0.200", `${stk("T1c")}|${pool()}|${linesOf(i3.id)[0].pooled_qty}`);
  await repo.refundInvoice(i3.id);
  check("  والترجيعُ ⇒ ٠٫٥٠٠ و٠٫٢٠٠ (لا ٠٫٨ — +٠٫٣ وهميّة)", `${stk("T1c")}|${pool()}` === "0.500|0.200");
  { const d = db(); d.companySections.find((s) => s.id === "sec1").pooled_stock = 2; save(d); }
  const i3e = await sale(null, line("T1c", 1, 1));
  check("  وحوضٌ يكفي (٢): الرصيدُ الموجبُ أوّلاً (٠٫٥) والحوضُ يأخذ ما زاد عليه وحده (٠٫٥) — الرصيدُ صفر والحوضُ ١٫٥",
    `${stk("T1c")}|${pool()}|${fx3(linesOf(i3e.id)[0].pooled_qty)}` === "0.000|1.500|0.500", `${stk("T1c")}|${pool()}|${linesOf(i3e.id)[0].pooled_qty}`);
  await repo.refundInvoice(i3e.id);
  check("    والترجيعُ ⇒ ٠٫٥٠٠ و٢٫٠٠٠", `${stk("T1c")}|${pool()}` === "0.500|2.000");
  const i4 = await sale(null, line("T1d", 1, 1));
  check("T1d: ٠ ⇒ −١", stk("T1d") === "-1.000");
  await repo.deleteInvoice(i4.id);
  check("  وحذفُ الفاتورة ⇒ ٠٫٠٠٠ (لا ١)", stk("T1d") === "0.000");
  const p2 = await repo.recordPurchase([{ product_id: "T2", name: "T2 شراء", qty: 0.02, purchase_price: 100, sell_price: 0 }], { company_name: "t2" });
  check("T2: شراءُ ٠٫٠٢ على −٠٫٠٤٠ ⇒ −٠٫٠٢٠ (لا صفر)، والكشفُ «صار» −٠٫٠٢٠", stk("T2") === "-0.020" && fx3((await repo.listPurchaseEffects(p2.id))[0]?.after?.stock) === "-0.020");
  const p3 = await repo.recordPurchase([{ product_id: "T3", name: "T3 قطع", qty: 1, purchase_price: 1000, sell_price: 0 }], { company_name: "t3" });
  await sale(null, line("T3", 1, 0.8));
  check("T3: شراءُ ١ وصرفُ ٠٫٨ ⇒ ٠٫٢٠٠", stk("T3") === "0.200");
  await repo.updatePurchase(p3.id, [{ product_id: "T3", name: "T3 قطع", qty: 0.5, purchase_price: 1000, sell_price: 0 }], { company_name: "t3" });
  const u3 = (await repo.listPurchaseEffects(p3.id)).find((x) => x.op === "update");
  check("  وتعديلُ الشراء ١ ← ٠٫٥ ⇒ −٠٫٣٠٠، والإيصالُ «كان ٠٫٢ صار −٠٫٣» (لا حصرةَ أخيرة)", stk("T3") === "-0.300" && fx3(u3?.before?.stock) === "0.200" && fx3(u3?.after?.stock) === "-0.300", `${stk("T3")}|${u3?.before?.stock}|${u3?.after?.stock}`);
  const i5 = await sale(null, [{ product_id: "T4", name: "T4 مادة", qty: 2, unit_price: 1000, unit_cost: 500, stock_qty: 2 }, { product_id: null, name: "T4 خدمة", qty: 3, unit_price: 2000, unit_cost: 0, stock_qty: 0 }]);
  const PI = linesOf(i5.id).find((x) => x.product_id), SI = linesOf(i5.id).find((x) => !x.product_id);
  const r5 = await repo.returnInvoiceItems(i5.id, [{ item_id: PI.id, qty: 1 }, { item_id: SI.id, qty: 1 }]);
  const PI2 = linesOf(i5.id).find((x) => x.id === PI.id), SI2 = linesOf(i5.id).find((x) => x.id === SI.id);
  check("T4: مرتجعٌ جزئيّ مختلط (مادّة ثم خدمة) يمرّ — ٥٠٠٠، والمادّة ٤، وسطرها ١/١، والخدمة ٢/٠",
    r5.total === 5000 && stk("T4") === "4.000" && `${PI2.qty}/${PI2.stock_qty}` === "1/1" && `${SI2.qty}/${SI2.stock_qty}` === "2/0", `${r5.total}|${stk("T4")}|${PI2.qty}/${PI2.stock_qty}|${SI2.qty}/${SI2.stock_qty}`);
  await repo.mergeProducts("T5a", "T5b");
  check("T5: أصلٌ ٢ + توأمٌ ٣ ⇒ ٥", stk("T5a") === "5.000");
  await sale(null, line("T5a", 6, 6));
  check("  وبيعُ ٦ ⇒ −١", stk("T5a") === "-1.000");
  await repo.restoreProduct("T5b");
  check("  وفكُّ الدمج بلا أرضيّة: الأصلُ −٤ والتوأمُ ٣ والمجموعُ −١ (لا ٣)", stk("T5a", "T5b") === "-4.000|3.000");
  const t6 = await repo.tidyInventory();
  check("T6: «رتّب المخزن»: أصلٌ ٣ + توأمٌ −١ ⇒ ٢، وبالمحذوفات −١", t6.merged === 1 && stk("T6a") === "2.000" && fx3(db().productsTrash.find((t) => t.id === "T6b")?.stock) === "-1.000", `${JSON.stringify(t6)}|${stk("T6a")}`);
  await repo.restoreProduct("T6b");
  check("  وفكُّه ⇒ ٣ و−١ والمجموعُ ٢", stk("T6a", "T6b") === "3.000|-1.000");
  { const d = db(); prod("T6b", d).name = "مادة الترتيب المفكوكة"; save(d); }   // لا يطويه ترتيبٌ لاحق ثانيةً
  for (const id of ["T1a", "T1b", "T1c", "T1d", "T2", "T3", "T4", "T5a", "T5b", "T6a", "T6b"]) PRODUCT_LINES.add(id);
  vc();
}

console.log("▸ الدمجُ يطوي مرحَّلاً حقيقياً، و«رتّب المخزن» بنفس الطريق");
{
  OWNER();
  const d = db();
  d.products.push(P("MT", "محلول توأم", 1, 150000, SUB("مل", 20000)), P("MK", "محلول أصل", 2, 150000, SUB("مل", 20000)),
    P("ET", "شاش التطابق", 1, 150000, SUB("مل", 20000)), P("EK", "شاش التطابق", 3, 150000, { ...SUB("مل", 20000), section_id: "sec6" }));
  save(d);
  for (const id of ["MT", "MK", "ET", "EK"]) SEED.set(id, C.roundScaled(prod(id).stock, 3));
  const SM = U("e1"), SE = U("e2");
  const cat = JSON.parse(mem.get(`${SVC_KEY}${clinic()}`));
  cat.services.push(svc(SM, "تحليل دمج", 20000), svc(SE, "تحليل الترتيب", 20000));
  mem.set(`${SVC_KEY}${clinic()}`, JSON.stringify(cat));
  await mod.services.hydrateServices();
  await api.recipeSet(SM, [{ product_id: "MT", qty: 10, unit: "sub" }], (await api.recipeGet(SM)).fingerprint);
  await api.recipeSet(SE, [{ product_id: "ET", qty: 10, unit: "sub" }], (await api.recipeGet(SE)).fingerprint);
  const g1 = await sale("g1b", [svcLine("تحليل دمج", SM, 1, 20000)]);
  check("G1: التوأم ٠٫٩٩٩ ومرحَّلُه −٠٫٠٠٠٥", `${stk("MT")}|${cry("MT")}` === "0.999|-0.000500000");
  await repo.mergeProducts("MK", "MT");
  MERGED.set("MT", "MK");
  check("  merge_products: الأصلُ ٢ + ٠٫٩٩٩ ويطوي مرحَّلَ التوأم (−٠٫٠٠٠٥ ⇒ الأصل)، والوصفةُ والدفترُ للأصل",
    `${stk("MK")}|${cry("MK")}|${cry("MT")}` === "2.999|-0.000500000|none" && (db().serviceRecipes ?? []).some((r) => r.service_id === SM && r.product_id === "MK" && r.product_name === "محلول أصل"),
    `${stk("MK")}|${cry("MK")}|${cry("MT")}`);
  vc();
  await repo.refundInvoice(g1.id);
  check("  وترجيعُ البيعة بعد الدمج يردّ للأصل: ٣٫٠٠٠ ومرحَّلُه صفر، والحدثُ على الحيّ", `${stk("MK")}|${cry("MK")}` === "3.000|0.000000000" && evsOf(g1.id).some((e) => e.kind === "restore" && e.product_id === "MK" && e.note === null));
  vc();
  const g2 = await sale("g2b", [svcLine("تحليل الترتيب", SE, 1, 20000)]);
  check("G2: بيعةٌ على التوأم غير المصنَّف: ٠٫٩٩٩ ومرحَّلُه −٠٫٠٠٠٥", `${stk("ET")}|${cry("ET")}` === "0.999|-0.000500000");
  const tt = await repo.tidyInventory();
  MERGED.set("ET", "EK");
  check("  الترتيبُ يطويه بأصله المصنَّف بنفس الطريق: الأصلُ ٣ + ٠٫٩٩٩ ويطوي المرحَّل، والوصفةُ للأصل",
    tt.merged === 1 && `${stk("EK")}|${cry("EK")}|${cry("ET")}` === "3.999|-0.000500000|none" && (db().serviceRecipes ?? []).some((r) => r.service_id === SE && r.product_id === "EK"), `${JSON.stringify(tt)}|${stk("EK")}|${cry("EK")}`);
  await repo.refundInvoice(g2.id);
  check("  وترجيعُ البيعة يردّ للأصل (٤٫٠٠٠ والمرحَّلُ صفر)", `${stk("EK")}|${cry("EK")}` === "4.000|0.000000000");
  vc();
}

console.log("▸ الدمجُ مرّتين: ext_out يُطوى مع المرحَّل فيبقى الثابتُ بالضبط");
{
  OWNER();
  const sx = await sale("sx", [svcLine("تحليل س", SX, 1, 20000)]);
  const sy = await sale("sy", [svcLine("تحليل ص", SY, 1, 20000)]);
  check("س وص بمرحَّل −٠٫٠٠٠٥ كلٌّ (٠٫٩٩٩ و١٫٩٩٩)", `${stk("X1", "Y1")}|${cry("X1")}|${cry("Y1")}` === "0.999|1.999|-0.000500000|-0.000500000");
  await repo.mergeProducts("Y1", "X1");
  MERGED.set("X1", "Y1");
  check("دمجُ س بـص: المرحَّلان (−٠٫٠٠٠٥ + −٠٫٠٠٠٥) يكتبان −٠٫٠٠١ بالأصل (ext_out −٠٫٠٠١)، والأصلُ ١٫٩٩٩ + ٠٫٠٠١ + ٠٫٩٩٩",
    `${stk("Y1")}|${cry("Y1")}|${db().stockCarry?.Y1?.ext_out_m}` === "2.999|0.000000000|-1", `${stk("Y1")}|${cry("Y1")}|${db().stockCarry?.Y1?.ext_out_m}`);
  vc();
  await repo.mergeProducts("Z1", "Y1");
  MERGED.set("Y1", "Z1");
  check("ثمّ دمجُ ص بـع: ext_out ينتقل مع الدفتر (−٠٫٠٠١)، والأصلُ ١ + ٢٫٩٩٩، ولا مرحَّلَ لص",
    `${stk("Z1")}|${cry("Z1")}|${db().stockCarry?.Z1?.ext_out_m}|${cry("Y1")}` === "3.999|0.000000000|-1|none", `${stk("Z1")}|${cry("Z1")}|${db().stockCarry?.Z1?.ext_out_m}|${cry("Y1")}`);
  vc("  والثابتُ بالأصل الأخير بالضبط (Σqty − Σposted + ext_in − ext_out = carry)");
  await repo.refundInvoice(sx.id);
  await repo.refundInvoice(sy.id);
  check("  وترجيعُ البيعتين بعد دمجين يردّ للأصل الأخير: ٤٫٠٠٠ والمرحَّلُ صفر", `${stk("Z1")}|${cry("Z1")}` === "4.000|0.000000000", `${stk("Z1")}|${cry("Z1")}`);
  vc();
  // ترحيلٌ من خارج الدفتر (كموافقة سند الهدر، 0254) على توأمٍ ثمّ دمجُه: ext_in يُطوى كما يُطوى ext_out
  const d = db();
  d.products.push(P("W1", "توأم الهدر", 1, 1000, SUB("مل", 20000)), P("W2", "أصل الهدر", 1, 1000, SUB("مل", 20000)));
  SEED.set("W1", 1000n); SEED.set("W2", 1000n);
  const w = cons.stockPostLocal(d, "W1", 500000n, "external", nowIso());
  save(d);
  check("ترحيلٌ خارجيّ ٠٫٠٠٠٥: يكتب ٠٫٠٠١، وext_in ٠٫٠٠٠٥ وext_out ٠٫٠٠١ والمرحَّل −٠٫٠٠٠٥", w.posted === 1n && JSON.stringify(db().stockCarry.W1).startsWith('{"carry_n":"-500000","ext_in_n":"500000","ext_out_m":"1"'),
    JSON.stringify(db().stockCarry.W1));
  vc();
  await repo.mergeProducts("W2", "W1");
  MERGED.set("W1", "W2");
  check("  ودمجُه: الأصلُ يحمل ext_in وext_out والمرحَّلَ المطويّ (−٠٫٠٠٠٥)، والتوأمُ بلا مرحَّل", `${cry("W2")}|${db().stockCarry.W2?.ext_in_n}|${db().stockCarry.W2?.ext_out_m}|${cry("W1")}|${stk("W2")}` === "-0.000500000|500000|1|none|1.999",
    `${cry("W2")}|${db().stockCarry.W2?.ext_in_n}|${db().stockCarry.W2?.ext_out_m}|${cry("W1")}|${stk("W2")}`);
  vc("  والثابتُ بالأصل بعد طيّ ترحيلٍ خارجيّ");
}

/* ما وجده فحصُ الفرق مع الخادم (المرآةُ مقابل 0252 + 0253 الحقيقيّتين على PGlite، خطوةً خطوة) — كلُّ رقمٍ هنا رقمُ
 * الخادم المقيس: ما تحفظه الأعمدة (numeric(14,2) وnumeric(14,3) وinteger)، والحذفُ للمدير، ومعرّفُ التخطّي. */
console.log("▸ فحصُ الفرق مع الخادم: ما تحفظه الأعمدة، والحذفُ للمدير، ومعرّفُ التخطّي");
{
  OWNER();
  const d = db();
  d.companySections = [...(d.companySections ?? []), { id: "secD", clinic_id: null, company_id: null, name: "قسم الفرق", pooled_stock: 3 }];
  d.products.push(P("DQ", "حبوب الفرق", 10, 3000, SUB("حبة", 30)), P("DQ2", "حبوب التعديل", 10, 3000, SUB("حبة", 30)), P("DS", "مادة القسم", 2.9, 1000, { section_id: "secD" }),
    P("DP", "حوض الفرق", 1, 1000, { pooled: true }), P("DF", "علف الفرق", 1, 1000, { farm_id: "F1" }), P("DN", "بلا وحدة الفرق", 1, 1000), P("DT", "مادة تُحذف للفرق", 1, 1000));
  save(d);
  for (const id of ["DQ", "DQ2", "DS", "DP", "DF", "DN", "DT"]) PRODUCT_LINES.add(id);
  // ١) delete_invoice: auth_role() <> 'manager' ⇒ forbidden — والفاتورةُ الغائبةُ «غير موجودة»
  const x1 = await sale("dx1", [svcLine("CBC", S01, 1)]);
  const st1 = stk("R01", "R02", "R03", "R04");
  RCP();
  const e1 = await errOf(() => repo.deleteInvoice(x1.id));
  VET();
  const e2 = await errOf(() => repo.deleteInvoice(x1.id));
  OWNER();
  check("الحذفُ للمدير: الاستقبالُ والطبيبُ ⇒ «forbidden: managers only» ولا شيءَ تغيّر (كان التجريبيُّ يحذف لأيّ دور)",
    e1?.message === "forbidden: managers only" && e2?.message === "forbidden: managers only" && !!invOf("dx1") && stk("R01", "R02", "R03", "R04") === st1, `${e1?.message}|${e2?.message}`);
  RCP(); pinOn();
  const e3 = await errOf(() => repo.deleteInvoice(x1.id));
  OWNER();
  check("  والاستقبالُ بمفتاح المدير الحيّ يحذف (auth_role() = 'manager')، ثمّ حذفُها ثانيةً ⇒ «invoice not found»",
    e3 === null && !invOf("dx1") && (await code(() => repo.deleteInvoice(x1.id))) === "invoice not found", `${e3?.message}`);
  // ٢) كلفةُ الجهاز بثلاث منازل: المجموعُ منها كما أُرسلت، والسطرُ يحفظ ١٢٫٣٥ — والمرتجعُ يعيد الحساب من المحفوظ
  const x2 = await sale("dx2", [svcLine("فحص", S05, 3, 7000, 12.345), svcLine("فحص ب", S05, 1, 10000, 1000)]);
  check("كلفةٌ ١٢٫٣٤٥ × ٣: الفاتورةُ ١٠٣٧٫٠٤ والسطرُ يحفظ ١٢٫٣٥ (numeric(14,2))", x2.cost_total === 1037.04 && linesOf(x2.id).find((l) => l.name === "فحص").unit_cost === 12.35,
    `${x2.cost_total}|${linesOf(x2.id).find((l) => l.name === "فحص").unit_cost}`);
  await repo.returnInvoiceItems(x2.id, [{ item_id: linesOf(x2.id).find((l) => l.name === "فحص").id, qty: 1 }]);
  check("  ومرتجعُ واحد: ٢ × ١٢٫٣٥ + ١٠٠٠ = ١٠٢٤٫٧٠ (من ١٢٫٣٤٥ كان ١٠٢٤٫٦٩)", invOf("dx2").cost_total === 1024.7, String(invOf("dx2").cost_total));
  // ٣) stock_qty بثلاث منازل كـv_stockq: ٠٫٠٠٠٥ ⇒ ٠٫٠٠١، و«0.0335» ⇒ ٠٫٠٣٤ — يُخصم ويُحفظ هكذا
  const x3 = await sale("dx3", [{ product_id: "DQ", name: "حبة أ", qty: 1, unit_price: 150, unit_cost: 100, stock_qty: 0.0005, unit_label: "حبة" },
    { product_id: "DQ", name: "حبة ب", qty: 1, unit_price: 150, unit_cost: 100, stock_qty: "0.0335", unit_label: "حبة" }]);
  check("stock_qty ٠٫٠٠٠٥ و٠٫٠٣٣٥ ⇒ ٠٫٠٠١ و٠٫٠٣٤ مخصومان ومحفوظان: ١٠ − ٠٫٠٣٥ = ٩٫٩٦٥", stk("DQ") === "9.965" && linesOf(x3.id).map((l) => l.stock_qty).sort().join() === "0.001,0.034",
    `${stk("DQ")}|${linesOf(x3.id).map((l) => l.stock_qty).join()}`);
  // ٤) item_count عمودٌ integer: round عند الإسناد، النصفُ بعيداً عن الصفر
  const x4 = await sale("dx4", [svcLine("فحص", S05, 1, 10000, 1000), svcLine("CBC", S01, 1)]);
  await repo.editInvoiceLines(x4.id, editLines(x4.id, (ii) => (ii.name === "CBC" ? { qty: 2.5 } : {})), "dx4");
  const c4a = invOf("dx4").item_count;
  await repo.returnInvoiceItems(x4.id, [{ item_id: linesOf(x4.id).find((l) => l.name === "CBC").id, qty: 1 }]);
  const x4b = await sale("dx4b", [svcLine("فحص", S05, 1, 10000, 1000), svcLine("CBC مرتجع", S01, -3.5)]);
  check("item_count integer: تعديلٌ إلى ٣٫٥ ⇒ ٤، مرتجعٌ إلى ٢٫٥ ⇒ ٣، وبيعةٌ بـ−٢٫٥ ⇒ −٣ (لا ٣٫٥ ولا ٢٫٥ ولا −٢)",
    `${c4a}|${invOf("dx4").item_count}|${x4b.item_count}` === "4|3|-3", `${c4a}|${invOf("dx4").item_count}|${x4b.item_count}`);
  // ٥) تعديلٌ بلا stock_qty: الخادمُ يخصم الكمية نفسها (coalesce(stock_qty, qty)) — لا نسبةَ السطر القديم
  const x5 = await sale("dx5", [{ product_id: "DQ2", name: "حبوب ٧", qty: 7, unit_price: 150, unit_cost: 100, stock_qty: 0.233, unit_label: "حبة" }, svcLine("فحص", S05, 1, 10000, 1000)]);
  await repo.editInvoiceLines(x5.id, linesOf(x5.id).map((ii) => ({ id: ii.id, product_id: ii.product_id, name: ii.name, qty: ii.qty, unit_price: ii.unit_price, unit_cost: ii.unit_cost,
    unit_label: ii.unit_label, ...(ii.product_id ? {} : { stock_qty: 0 }) })), "dx5");
  check("تعديلٌ بلا stock_qty لسطر ٧ حبّات: ١٠ − ٧ = ٣٫٠٠٠ كالخادم (كان ٩٫٧٦٧ بنسبة السطر القديم)", stk("DQ2") === "3.000" && linesOf(x5.id).find((l) => l.product_id).stock_qty === 7, stk("DQ2"));
  // ٦) حصّةُ الحوض بالضبط: ٣ − ٢٫٩ = ٠٫١ لا ٠٫١٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٩
  const x6 = await sale("dx6", [{ product_id: "DS", name: "مادة القسم ×٣", qty: 3, unit_price: 1500, unit_cost: 1000, stock_qty: 3 }]);
  check("رصيدٌ ٢٫٩ وحوضٌ ٣ وبيعُ ٣: pooled_qty ٠٫١ بالضبط، والرصيدُ صفر والحوضُ ٢٫٩", linesOf(x6.id)[0].pooled_qty === 0.1 && stk("DS") === "0.000"
    && db().companySections.find((s) => s.id === "secD").pooled_stock === 2.9, `${linesOf(x6.id)[0].pooled_qty}|${stk("DS")}`);
  await repo.editInvoiceLines(x6.id, editLines(x6.id), "dx6");
  check("  والتعديلُ يعيد الخصم بنفس الحصّة بالضبط", linesOf(x6.id)[0].pooled_qty === 0.1 && stk("DS") === "0.000", `${linesOf(x6.id)[0].pooled_qty}|${stk("DS")}`);
  // ٧) التخطّي يحمل معرّفَ الصفّ لا نصَّ التعديل (الخادمُ: (product_id)::uuid، أي القانونيّ)
  await repo.deleteProduct("DT");
  VET();
  const x7 = await sale("dx7", [svcLine("CBC", S01, 1, 25000, 0, { consumables: [{ product_id: " dp ", qty: 1 }, { product_id: "df", qty: 1 }, { product_id: "dn ", qty: 1, unit: "sub" },
    { product_id: "dt", qty: 1 }, { product_id: "R01", qty: 10, unit: "sub" }] })]);
  OWNER();
  check("تعديلٌ بمعرّفاتٍ بحالةٍ أخرى وبمسافات: كلُّ تخطٍّ بمعرّف صفّه (DP، DF، DN، DT) — كان يحمل النصَّ كما وصل",
    skipsOf(x7.id).map((k) => `${k.note}:${k.product_id}`).sort().join() === "farm_stock:DF,in_trash:DT,no_sub_unit:DN,pooled:DP", skipsOf(x7.id).map((k) => `${k.note}:${k.product_id}`).join());
  // ٨) سطرُ مادّةٍ تسمّي مادّةً بالمحذوفات: مفتاحُ invoice_items.product_id يرفض البيعةَ كلَّها (23503)، ولا شيءَ يُكتب
  const nInv = db().invoices.length;
  const e8 = await errOf(() => sale("dx8", [{ product_id: "DT", name: "مادة محذوفة", qty: 1, unit_price: 1500, unit_cost: 1000, stock_qty: 1 }, svcLine("CBC", S01, 1)]));
  check("سطرُ مادّةٍ بالمحذوفات ⇒ 23503 (FK) والبيعةُ كلُّها لا تُكتب (كان التجريبيُّ يبيعها)",
    e8?.code === "23503" && /invoice_items_product_id_fkey/.test(e8?.message ?? "") && db().invoices.length === nInv && !invOf("dx8"), `${e8?.code}|${e8?.message}`);
  // ١٠) تعديلُ البنود للمدير (غلافُ edit_invoice_lines: auth_role() <> 'manager' ⇒ 'not allowed') — قبل أيّ قراءة
  const x10 = await sale("dx10", [svcLine("CBC", S01, 1)]);
  const st10 = stk("R01", "R02", "R03", "R04"), ids10 = linesOf(x10.id).map((l) => l.id).join();
  RCP();
  const e10a = await errOf(() => repo.editInvoiceLines(x10.id, editLines(x10.id, () => ({ qty: 2 })), "rcp"));
  VET();
  const e10b = await errOf(() => repo.editInvoiceLines(x10.id, editLines(x10.id, () => ({ qty: 2 })), "vet"));
  OWNER();
  check("تعديلُ البنود: الاستقبالُ والطبيبُ ⇒ «not allowed» ولا شيءَ تغيّر (كان التجريبيُّ يعدّل لأيّ دور)",
    e10a?.message === "not allowed" && e10b?.message === "not allowed" && stk("R01", "R02", "R03", "R04") === st10 && linesOf(x10.id).map((l) => l.id).join() === ids10, `${e10a?.message}|${e10b?.message}`);
  RCP(); pinOn();
  const e10c = await errOf(() => repo.editInvoiceLines(x10.id, editLines(x10.id), "pin"));
  OWNER();
  check("  والاستقبالُ بمفتاح المدير الحيّ يعدّل (auth_role() = 'manager')", e10c === null && linesOf(x10.id).map((l) => l.id).join() !== ids10, `${e10c?.message}`);
  await repo.deleteInvoice(x10.id);
  // ٩) الدمجُ يجمع الرصيدين بالضبط (numeric): ٠٫٤ + ٠٫٢ = ٠٫٦ لا ٠٫٦٠٠٠٠٠٠٠٠٠٠٠٠٠٠١
  { const d9 = db(); d9.products.push(P("DM1", "أصل الجمع", 0.4, 1000), P("DM2", "توأم الجمع", 0.2, 1000)); save(d9); PRODUCT_LINES.add("DM1"); PRODUCT_LINES.add("DM2"); }
  await repo.mergeProducts("DM1", "DM2");
  check("الدمجُ: ٠٫٤ + ٠٫٢ = ٠٫٦ بالضبط (كان يُحفظ ٠٫٦٠٠٠٠٠٠٠٠٠٠٠٠٠٠١)", prod("DM1").stock === 0.6, String(prod("DM1").stock));
  vc();
}

/* التدقيقُ العدائيّ للمرآة سطراً سطراً مقابل 0252 + 0253 الحقيقيّتين — كلُّ رقمٍ هنا رقمُ الخادم المقيس على PGlite
 * (مِسبارُ المراجعة، SCR/demo-review/probe.mjs): المرتجعُ الجزئيّ بحصّتيه كما يحسبهما الخادم (v_per numeric(14,6)
 * وround(pooled × v_ret / qty, 3) — لا القسمةُ العائمة)، ومدخلاً مدخلاً بترتيب p_returns (معرّفٌ قديم ⇒ item not found،
 * والسطرُ مرّتين يُرجَع مرّتين، وما لا يبقى منه سطر ⇒ nothing left)، والسلّةُ الفارغة قبل الإعادة، واسمُ السطر الغائب،
 * وطيُّ الحركات بـmin(kind) وبترتيب الإدراج. */
console.log("▸ التدقيق: المرتجعُ الجزئيّ كالخادم، والسلّةُ الفارغة، واسمُ السطر، وطيُّ الحركات");
{
  OWNER();
  const d = db();
  d.companySections = [...(d.companySections ?? []), { id: "secR", clinic_id: null, company_id: null, name: "قسم التدقيق", pooled_stock: 3 }];
  d.products.push(P("RS7", "شريط ٧", 10, 7000, SUB("حبة", 7)), P("RS9", "شريط ٩", 10, 9000, SUB("حبة", 9)),
    P("RPS", "حصة الحوض", 0.999, 1000, { section_id: "secR" }), P("RZ", "سطر صفري", 1, 1000), P("RMV", "مادة الحركات", 5, 1000));
  save(d);
  for (const id of ["RS7", "RS9", "RPS", "RZ"]) PRODUCT_LINES.add(id);
  SEED.set("RMV", 5000n);
  const plain = (name, qty = 1) => svcLine(name, null, qty, 3000, 0, { stock_qty: 0 });
  const lineOf = (invId, pid) => linesOf(invId).find((l) => l.product_id === pid);
  // ١) حصّةُ الرصيد بـv_per numeric(14,6): شريطُ ٧ حبّات، بيعُ ٦ (٠٫٨٥٧) ومرتجعُ ٣ ⇒ round(٣ × ٠٫١٤٢٨٣٣، ٣) = ٠٫٤٢٨ (العائمُ ٠٫٤٢٩)
  const a1 = await sale("ra1", [{ product_id: "RS7", name: "شريط ٧ ×٦", qty: 6, unit_price: 1000, unit_cost: 1000, stock_qty: 0.857, unit_label: "حبة" }, plain("سطر التدقيق ١")]);
  await repo.returnInvoiceItems(a1.id, [{ item_id: lineOf(a1.id, "RS7").id, qty: 3 }]);
  check("مرتجعٌ جزئيّ لشريط ٧ (٦ ← ٣ من ٠٫٨٥٧): الرصيدُ ٩٫٥٧١ والسطرُ ٣/٠٫٤٢٩ — حصّةُ الخادم بـv_per بستّ منازل (العائمُ ٩٫٥٧٢ و٠٫٤٢٨)",
    `${stk("RS7")}|${lineOf(a1.id, "RS7").qty}/${lineOf(a1.id, "RS7").stock_qty}` === "9.571|3/0.429", `${stk("RS7")}|${lineOf(a1.id, "RS7").qty}/${lineOf(a1.id, "RS7").stock_qty}`);
  const a2 = await sale("ra2", [{ product_id: "RS9", name: "شريط ٩ ×٢٤", qty: 24, unit_price: 1000, unit_cost: 1000, stock_qty: 2.667, unit_label: "حبة" }, plain("سطر التدقيق ٢")]);
  await repo.returnInvoiceItems(a2.id, [{ item_id: lineOf(a2.id, "RS9").id, qty: 4 }]);
  check("  وشريط ٩ (٢٤ ← ٢٠ من ٢٫٦٦٧): الرصيدُ ٧٫٧٧٨ والسطرُ ٢٠/٢٫٢٢٢ (العائمُ ٧٫٧٧٧ و٢٫٢٢٣)",
    `${stk("RS9")}|${lineOf(a2.id, "RS9").qty}/${lineOf(a2.id, "RS9").stock_qty}` === "7.778|20/2.222", `${stk("RS9")}|${lineOf(a2.id, "RS9").qty}/${lineOf(a2.id, "RS9").stock_qty}`);
  // ٢) حصّةُ الحوض round(pooled_qty × v_ret / qty, 3): رصيدٌ ٠٫٩٩٩ وحوضٌ ٣، بيعُ ٢ ⇒ الحوضُ يعطي ١٫٠٠١؛ مرتجعُ ١ ⇒ ٠٫٥٠١ للحوض
  const a3 = await sale("ra3", [{ product_id: "RPS", name: "حصة ×٢", qty: 2, unit_price: 1000, unit_cost: 1000, stock_qty: 2 }, plain("سطر التدقيق ٣")]);
  const pl = () => fx3(db().companySections.find((s) => s.id === "secR").pooled_stock);
  check("  رصيدٌ ٠٫٩٩٩ وحوضٌ ٣ وبيعُ ٢: الحوضُ يعطي ١٫٠٠١", `${stk("RPS")}|${pl()}|${fx3(lineOf(a3.id, "RPS").pooled_qty)}` === "0.000|1.999|1.001", `${stk("RPS")}|${pl()}`);
  await repo.returnInvoiceItems(a3.id, [{ item_id: lineOf(a3.id, "RPS").id, qty: 1 }]);
  check("  ومرتجعُ ١: حصّةُ الحوض round(١٫٠٠١ × ١ / ٢، ٣) = ٠٫٥٠١ — الرصيدُ ٠٫٤٩٩ والحوضُ ٢٫٥٠٠ والسطرُ ١/١/٠٫٥ (العائمُ ٠٫٥٠٠ و٢٫٤٩٩)",
    `${stk("RPS")}|${pl()}|${lineOf(a3.id, "RPS").qty}/${lineOf(a3.id, "RPS").stock_qty}/${lineOf(a3.id, "RPS").pooled_qty}` === "0.499|2.500|1/1/0.5",
    `${stk("RPS")}|${pl()}|${lineOf(a3.id, "RPS").qty}/${lineOf(a3.id, "RPS").stock_qty}/${lineOf(a3.id, "RPS").pooled_qty}`);
  // ٢ب) المادّةُ فقدت قسمها قبل المرتجع: v_ret_pool := 0 — الحصّةُ كلُّها للرصيد، والحوضُ لا يُمسّ، وpooled_qty السطر كما هو
  const a3s = await sale("ra3s", [{ product_id: "RPS", name: "حصة ×٢ ب", qty: 2, unit_price: 1000, unit_cost: 1000, stock_qty: 2 }, plain("سطر التدقيق ٣ب")]);
  check("  وبيعُ ٢ أخرى: الرصيدُ ٠ والحوضُ ٠٫٩٩٩ والحصّةُ ١٫٥٠١", `${stk("RPS")}|${pl()}|${fx3(lineOf(a3s.id, "RPS").pooled_qty)}` === "0.000|0.999|1.501", `${stk("RPS")}|${pl()}`);
  { const d2 = db(); prod("RPS", d2).section_id = null; save(d2); }
  await repo.returnInvoiceItems(a3s.id, [{ item_id: lineOf(a3s.id, "RPS").id, qty: 1 }]);
  check("  ومرتجعُ ١ والمادّةُ بلا قسم: كلُّه للرصيد (١٫٠٠٠)، والحوضُ ٠٫٩٩٩ لا يُمسّ، والسطرُ ١/١/١٫٥٠١ (مقيس)",
    `${stk("RPS")}|${pl()}|${lineOf(a3s.id, "RPS").qty}/${lineOf(a3s.id, "RPS").stock_qty}/${lineOf(a3s.id, "RPS").pooled_qty}` === "1.000|0.999|1/1/1.501",
    `${stk("RPS")}|${pl()}|${lineOf(a3s.id, "RPS").qty}/${lineOf(a3s.id, "RPS").stock_qty}/${lineOf(a3s.id, "RPS").pooled_qty}`);
  { const d2 = db(); prod("RPS", d2).section_id = "secR"; save(d2); }
  // ٣) معرّفُ سطرٍ قبل التعديل (التعديلُ جدّد المعرّفات، 0252) ⇒ item not found — كان التجريبيُّ يقول «تم» ويختم «مرتجع» ولا يرجع شيئاً
  const a4 = await sale("ra4", [svcLine("CBC", S01, 2), plain("سطر التدقيق ٤")]);
  const old4 = linesOf(a4.id).find((l) => l.name === "CBC").id;
  await repo.editInvoiceLines(a4.id, editLines(a4.id), "ra4");
  const snap4 = mem.get(DB_KEY);
  const e4 = await errOf(() => repo.returnInvoiceItems(a4.id, [{ item_id: old4, qty: 1 }]));
  check("مرتجعٌ بمعرّف سطرٍ قبل التعديل ⇒ «item not found» ولا شيءَ تغيّر (كان يمرّ بصمت)", e4?.message === "item not found" && mem.get(DB_KEY) === snap4, e4?.message ?? "ok");
  const e4b = await errOf(() => repo.returnInvoiceItems(a4.id, [...linesOf(a4.id).map((l) => ({ item_id: l.id, qty: l.qty })), { item_id: old4, qty: 1 }]));
  check("  أمّا مرتجعٌ يغطّي كلَّ السطور فكاملٌ ولو زاد مدخلٌ غريب (فحصُ الكامل على سطور الفاتورة أوّلاً)", e4b === null && invOf("ra4").status === "refunded", e4b?.message);
  vc();
  // ٤) p_returns مدخلاً مدخلاً: السطرُ مرّتين يُرجَع مرّتين، وما لا يبقى منه سطر ⇒ nothing left
  const a5 = await sale("ra5", [svcLine("CBC", S01, 3), plain("سطر التدقيق ٥")]);
  const c5 = linesOf(a5.id).find((l) => l.name === "CBC").id;
  await repo.returnInvoiceItems(a5.id, [{ item_id: c5, qty: 1 }, { item_id: c5, qty: 1 }]);
  check("  وسطرٌ مرّتين بالمرتجع (١ ثمّ ١ من ٣) يُرجَع مرّتين: الباقي ١ (كان ٢)", linesOf(a5.id).find((l) => l.id === c5)?.qty === 1, String(linesOf(a5.id).find((l) => l.id === c5)?.qty));
  vc();
  const a6 = await sale("ra6", [svcLine("CBC", S01, 1)]);
  const c6 = linesOf(a6.id)[0].id;
  const snap6 = mem.get(DB_KEY);
  const e6 = await errOf(() => repo.returnInvoiceItems(a6.id, [{ item_id: c6, qty: 0.5 }, { item_id: c6, qty: 0.5 }]));
  check("  ونصفٌ ثمّ نصف من فاتورةٍ بسطرٍ واحد: لا يبقى سطر ⇒ «nothing left» ولا شيءَ تغيّر", e6?.message === "nothing left" && mem.get(DB_KEY) === snap6, e6?.message ?? "ok");
  const a6b = await sale("ra6b", [svcLine("CBC", S01, 1)]);
  const c6b = linesOf(a6b.id)[0].id;
  const e6b = await errOf(() => repo.returnInvoiceItems(a6b.id, [{ item_id: c6b, qty: 0.5 }, { item_id: c6b, qty: 1 }]));
  check("  وفحصُ «الكامل» يقرأ أوّلَ مدخلٍ يسمّي السطر (limit 1): [نصف، واحد] ليس كاملاً ⇒ «nothing left» لا ترجيعاً كاملاً",
    e6b?.message === "nothing left" && invOf("ra6b").status !== "refunded", e6b?.message ?? "ok");
  // ٥) [2b] مدخلٌ كميتُه صفر يُتخطّى، ومرتجعٌ لم يرجّع مدخلٌ منه شيئاً ⇒ «nothing to return» كالمصفوفة الفارغة (0253 الجولة الثانية)، بلا حركة
  const a7 = await sale("ra7", [plain("سطر التدقيق ٧أ"), plain("سطر التدقيق ٧ب")]);
  const l7 = linesOf(a7.id).map((l) => `${l.id}:${l.qty}`).join();
  const e7 = await errOf(() => repo.returnInvoiceItems(a7.id, [{ item_id: linesOf(a7.id)[0].id, qty: 0 }]));
  const e7b = await errOf(() => repo.returnInvoiceItems(a7.id, []));
  check("  [2b] ومدخلٌ بكمية صفر وحده ⇒ «nothing to return» بلا حركة (كان يمرّ ويختم «مرتجع»)، والمصفوفةُ الفارغة كذلك",
    e7?.message === "nothing to return" && linesOf(a7.id).map((l) => `${l.id}:${l.qty}`).join() === l7 && e7b?.message === "nothing to return", `${e7?.message}|${e7b?.message}`);
  // ٥ب) invoice_items_nonneg (0131/0133): كميةٌ صفر، أو سعرٌ سالب، أو stock_qty بعكس إشارة الكمية ⇒ 23514 ولا يُكتب شيء — بالبيعة وبالتعديل
  const nInv0 = db().invoices.length, snapZ = () => JSON.stringify({ p: db().products, i: db().invoices, ii: db().invoiceItems, c: db().consumption ?? [] });
  const zs = [
    await errOf(() => sale("rz1", [{ product_id: "RZ", name: "سطر صفري", qty: 0, unit_price: 1000, unit_cost: 500, stock_qty: 0 }, plain("سطر التدقيق ٧ج")])),
    await errOf(() => sale("rz2", [plain("سطر التدقيق ٧د"), { ...plain("سطر بسعر سالب"), unit_price: -1 }])),
    await errOf(() => sale("rz3", [{ product_id: "RZ", name: "عكس الإشارة", qty: 1, unit_price: 1000, unit_cost: 500, stock_qty: -1 }])),
    await errOf(() => sale("rz4", [svcLine("CBC", S01, 1, 25000, -5)])),
  ];
  check("invoice_items_nonneg بالبيعة: كميةٌ صفر، وسعرٌ سالب، وstock_qty عكسَ الكمية ⇒ 23514 ولا فاتورة ولا رصيد (كان التجريبيُّ يكتبها)",
    zs.slice(0, 3).every((e) => e?.code === "23514" && /invoice_items_nonneg/.test(e?.message ?? "")) && zs[3] === null && db().invoices.length === nInv0 + 1 && stk("RZ") === "1.000",
    zs.map((e) => e?.code ?? "ok").join("|"));
  check("  (وسطرٌ مخطَّط كلفةُ جهازه سالبة يمرّ: كلفتُه من الخادم لا من الجهاز)", linesOf(invOf("rz4").id)[0].unit_cost === 815);
  const efk = await errOf(() => sale("rzfk", [{ product_id: "DT", name: "محذوفة بكمية صفر", qty: 0, unit_price: 1000, unit_cost: 500, stock_qty: 0 }]));
  check("  وسطرٌ يسمّي مادّةً بالمحذوفات بكمية صفر ⇒ القيدُ (23514) قبل المفتاح (23503): CHECK بالإدراج، والمفتاحُ محفّزٌ بعده (مقيس)", efk?.code === "23514", efk?.code);
  const a7z = await sale("ra7z", [{ product_id: "RZ", name: "سطر مادة التعديل", qty: 1, unit_price: 1000, unit_cost: 500, stock_qty: 1 }, plain("سطر التدقيق ٧هـ")]);
  const z1 = snapZ();
  const ze1 = await errOf(() => repo.editInvoiceLines(a7z.id, editLines(a7z.id, (ii) => (ii.product_id ? { unit_price: -1 } : {})), "rz"));
  const ze2 = await errOf(() => repo.editInvoiceLines(a7z.id, editLines(a7z.id, (ii) => (ii.product_id ? { stock_qty: -1 } : {})), "rz"));
  check("  وبالتعديل: سعرٌ سالب وstock_qty سالب على كميةٍ موجبة ⇒ 23514 ولا شيءَ تغيّر (كان يحصرهما صفراً بصمت)",
    ze1?.code === "23514" && ze2?.code === "23514" && snapZ() === z1, `${ze1?.code ?? "ok"}|${ze2?.code ?? "ok"}`);
  // وسطرٌ قديم بكمية صفر (قبل 0051؛ القيدُ NOT VALID لا يفحص القائم) بمرتجعٍ جزئيّ: v_ret = least(round(ret, 3), 0) = 0 فيُتخطّى قبل
  // القسمة (0253 الجولة الثانية: `if v_ret = 0 then continue`) ⇒ «nothing to return» — كان division by zero (pooled_qty × v_ret / qty)
  { const d2 = db(); d2.invoiceItems.push({ id: "ii-legacy-zero", invoice_id: a7z.id, product_id: "RZ", name: "سطر قديم صفري", barcode: null, qty: 0, unit_price: 1000, unit_cost: 500,
      line_total: 0, stock_qty: 0, pooled_qty: 0, unit_label: null }); save(d2); }
  const e7z = await errOf(() => repo.returnInvoiceItems(a7z.id, [{ item_id: "ii-legacy-zero", qty: 1 }]));
  check("  [2b] وسطرُ مادّةٍ قديم كميتُه صفر بمرتجعٍ جزئيّ ⇒ «nothing to return» (يُتخطّى قبل القسمة)", e7z?.message === "nothing to return", e7z?.message ?? "ok");
  // وسطرٌ قديم بكلفةٍ سالبة (قبل 0131): المرتجعُ الجزئيّ يحدّثه فيفحصه القيد ⇒ 23514؛ وإرجاعُه كلِّه حذفٌ لا يُفحص
  { const d2 = db(); d2.invoiceItems = d2.invoiceItems.filter((x) => x.id !== "ii-legacy-zero");
    d2.invoiceItems.push({ id: "ii-legacy-neg", invoice_id: a7z.id, product_id: null, name: "سطر قديم بكلفة سالبة", barcode: null, qty: 3, unit_price: 1000, unit_cost: -1,
      line_total: 3000, stock_qty: 0, pooled_qty: 0, unit_label: null }); save(d2); }
  const zl = snapZ();
  const eln = await errOf(() => repo.returnInvoiceItems(a7z.id, [{ item_id: "ii-legacy-neg", qty: 1 }]));
  const still = zl === snapZ();
  const okAll = await errOf(() => repo.returnInvoiceItems(a7z.id, [{ item_id: "ii-legacy-neg", qty: 3 }]));
  check("  وسطرٌ قديم بكلفةٍ سالبة: مرتجعُ ١ يحدّثه ⇒ 23514 ولا شيءَ تغيّر، وإرجاعُه كلِّه (حذف) يمرّ",
    eln?.code === "23514" && still && okAll === null && !linesOf(a7z.id).some((l) => l.id === "ii-legacy-neg"), `${eln?.code ?? "ok"}|${okAll?.message ?? "ok"}|${still}`);
  // ٥هـ) كميةُ مرتجعٍ ليست رقماً: (e->>'qty')::numeric يرمي 22P02 بالخادم — لا «لا شيء» صامتٌ يختم «مرتجع»
  const a8n = await sale("ra8n", [svcLine("CBC", S01, 2), plain("سطر التدقيق ٨ن")]);
  const s8n = mem.get(DB_KEY);
  const en1 = await errOf(() => repo.returnInvoiceItems(a8n.id, [{ item_id: linesOf(a8n.id).find((l) => l.name === "CBC").id, qty: "abc" }]));
  const en2 = await errOf(() => repo.returnInvoiceItems(a8n.id, [{ item_id: linesOf(a8n.id).find((l) => l.name === "CBC").id, qty: 1 }, { item_id: "nope", qty: "x" }]));
  check("  وكميةُ مرتجعٍ ليست رقماً («abc»، أو «x» على مدخلٍ غريب) ⇒ 22P02 كالخادم ولا شيءَ تغيّر",
    en1?.code === "22P02" && en1?.message === 'invalid input syntax for type numeric: "abc"' && en2?.code === "22P02" && mem.get(DB_KEY) === s8n, `${en1?.message}|${en2?.message}`);
  const en3 = await errOf(() => repo.returnInvoiceItems(a8n.id, [{ item_id: "nope1", qty: 1 }, { item_id: "nope2", qty: "x" }]));
  check("  وحلقةُ الخادم تقرأ كلَّ الكميات قبل أوّل لفّة: [غريب ١، غريب «x»] ⇒ 22P02 لا «item not found» (مقيس)", en3?.code === "22P02", en3?.message);
  // ٥ج) least(round(ret, 3), qty): مرتجعُ ٥ من سطرٍ كميتُه ٣ (والفاتورةُ ليست كلُّها) يُرجع ما بالسطر وحده — لا ٥/٣ منه
  const a8o = await sale("ra8o", [{ product_id: "RS9", name: "شريط ٩ ×٣", qty: 3, unit_price: 1000, unit_cost: 1000, stock_qty: 0.333, unit_label: "حبة" }, plain("سطر التدقيق ٨")]);
  const s8o = stk("RS9");
  await repo.returnInvoiceItems(a8o.id, [{ item_id: lineOf(a8o.id, "RS9").id, qty: 5 }]);
  check("  ومرتجعُ ٥ من سطرٍ كميتُه ٣: يُحذف السطر ويرجع ٠٫٣٣٣ وحده (least(ret, qty)) — لا ٠٫٥٥٥ وهمية", !lineOf(a8o.id, "RS9") && (Number(stk("RS9")) - Number(s8o)).toFixed(3) === "0.333",
    `${s8o} → ${stk("RS9")}`);
  // ٥د) تعديلُ سطر خدمةٍ بكميةٍ بأربع منازل (١٫٠٠٠٤): التجريبيُّ يقرّبها قبل الربط فيبقى الدفترُ عند T(١٫٠٠٠) والسطرُ ١ — والخادمُ يحفظ
  // السطرَ ١٫٠٠٠ ويربط بالكمية غيرِ المقرَّبة فيقول verify_consumption «live_vs_line» (٠٫٢٠٠٠٨ / ٢٠٠٫٠٨، مقيس) — طلبٌ لطبقة SQL.
  const a8q = await sale("ra8q", [svcLine("CBC", S01, 1), plain("سطر التدقيق ٨ب")]);
  await repo.editInvoiceLines(a8q.id, editLines(a8q.id, (ii) => (ii.name === "CBC" ? { qty: 1.0004 } : {})), "ra8q");
  check("  وتعديلٌ بكمية ١٫٠٠٠٤ لسطر خدمة: السطرُ ١ والدفترُ عند T(١) (الحيُّ = الهدف) — الكميةُ تُقرَّب قبل الربط", linesOf(a8q.id).find((l) => l.name === "CBC")?.qty === 1 && verify().length === 0,
    `${linesOf(a8q.id).find((l) => l.name === "CBC")?.qty}|${verify().join(";")}`);
  // ٦) السلّةُ الفارغة: retail_checkout وpos_checkout يرفضانها قبل فحص الإعادة
  const nInv = db().invoices.length;
  const e8a = await errOf(() => repo.retailCheckout([], {})), e8b = await errOf(() => repo.retailCheckout([], { client_ref: "k1" })), e8c = await errOf(() => repo.checkout([]));
  check("سلّةٌ فارغة ⇒ «empty cart» (ولو بمرجعٍ موجود: الفحصُ قبل الإعادة) ولا فاتورة — كان التجريبيُّ يكتب فاتورةً بلا سطور",
    e8a?.message === "empty cart" && e8b?.message === "empty cart" && e8c?.message === "empty cart" && db().invoices.length === nInv, `${e8a?.message}|${e8b?.message}|${e8c?.message}`);
  // ٧) اسمُ السطر الغائب: coalesce(name, 'Item') بالبيعة، وcoalesce(name, '') بالتعديل
  const a9 = await sale("ra9", [{ product_id: null, qty: 1, unit_price: 3000, unit_cost: 0 }]);
  const n9 = linesOf(a9.id)[0].name;
  await repo.editInvoiceLines(a9.id, [{ id: linesOf(a9.id)[0].id, product_id: null, qty: 1, unit_price: 3000, unit_cost: 0, stock_qty: 0 }], "ra9");
  check("سطرٌ بلا اسم: «Item» بالبيعة و«» بالتعديل كالخادم (كان يُحفظ بلا اسم)", n9 === "Item" && linesOf(a9.id)[0].name === "", `${n9}|${linesOf(a9.id)[0].name}`);
  // ٨) الحركات: خطوتان بنفس اللحظة والمرجع (تعديلٌ بلا تغيير: إرجاعٌ ثمّ صرف) تُطويان بـmin(kind) وبترتيب الإدراج (audit_log.id)
  const SMV = U("e9");
  { const cat = JSON.parse(mem.get(`${SVC_KEY}${clinic()}`)); cat.services.push(svc(SMV, "خدمة الحركات", 5000)); mem.set(`${SVC_KEY}${clinic()}`, JSON.stringify(cat)); await mod.services.hydrateServices(); }
  await api.recipeSet(SMV, [{ product_id: "RMV", qty: 1, unit: "stock" }], (await api.recipeGet(SMV)).fingerprint);
  const mvi = await sale("rmv", [svcLine("خدمة الحركات", SMV, 1, 5000)]);
  await repo.editInvoiceLines(mvi.id, editLines(mvi.id), "rmv1");
  const t1 = evsOf(mvi.id).filter((e) => e.product_id === "RMV").at(-1).created_at;
  await new Promise((r) => setTimeout(r, 5));
  await repo.editInvoiceLines(mvi.id, editLines(mvi.id), "rmv2");
  const t2 = evsOf(mvi.id).filter((e) => e.product_id === "RMV").at(-1).created_at;
  const au = (id, at, f, t, who) => ({ id, action: "UPDATE", entity: "products", entity_id: "RMV", actor: null, created_at: at, details: { __changed: { stock: [f, t] }, ...(who ? { __actor: who } : {}) } });
  const keepAudit = mem.get(AUDIT_KEY);
  // بترتيب الإدراج: (t1) إرجاعٌ ثمّ صرف، (t2) إرجاعٌ ثمّ صرف — والسجلُّ يُخزَّن الأحدثَ أوّلاً، ومعرّفاتُ t2 بعكس ترتيب نصّها
  mem.set(AUDIT_KEY, JSON.stringify([au("aa9", t2, 5, 4), au("zz1", t2, 4, 5), au("aa2", t1, 5, 4, "أحمد"), au("aa1", t1, 4, 5, "باسم")]));
  const mv2 = await repo.productMovements("RMV");
  mem.set(AUDIT_KEY, keepAudit);
  const g1 = mv2.find((m) => m.at === t1), g2 = mv2.find((m) => m.at === t2);
  check("حركتان بنفس اللحظة والفاتورة (إرجاعٌ ثمّ صرف) تُطويان: min(kind) = «مستهلكات» وصافيهما صفر (كان «مستهلكات — إرجاع»)",
    mv2.length === 2 && g1?.kind === "consume" && g1?.from_qty === 4 && g1?.to_qty === 4 && g1?.delta === 0 && g1?.ref_id === mvi.id, JSON.stringify(mv2));
  check("  و«كان/صار» بترتيب الإدراج (audit_log.id) لا بنصّ المعرّف (كان ٥ ← ٥)", g2?.kind === "consume" && g2?.from_qty === 4 && g2?.to_qty === 4 && g2?.delta === 0, JSON.stringify(g2));
  check("  ومَن: coalesce(min(st.name), '') — «أحمد» لا أوّلُ صفّ («باسم»)، وبلا أحد «» لا null", g1?.actor_name === "أحمد" && g2?.actor_name === "", `${g1?.actor_name}|${JSON.stringify(g2?.actor_name)}`);
  vc();
}

/* ===================================================================== */
/* الجولة 2أ: 0254 (سندُ التلف) و0255 (المتوسّطُ المتحرّك) وحقولُ القراءة الجديدة (moves وnow_us وwaste) و§5 (يتيمُ الوصفات،
 * والترجيعُ الغائب). كلُّ فحصٍ هنا موسومٌ «[2a]» ويُقاس بنفسه (T): رميٌ يُسجَّل فشلاً لذلك الفحص وحده — فتُثبت مرآةُ الجولة
 * الأولى أنّ كلَّ واحدٍ منها يفشل عليها، لا أنّ الملفَّ انكسر أوّلَ سطر. والأرقامُ أرقامُ مِسبارَي 0254 و0255 على PGlite
 * (تقريرا m0254 وm0255 وكتلةُ 0255): W2 −٠٫٠٣٠ و٥٠٠٫٠٠، W3 −٠٫٥٦٠ و٦٬٢٥٠٫٠٠، W4 d = ٠٫٠٠٠٥ و٧٥٫٠٠، §10 ١١٠٠ ← ١١٤٧٫٦١٩٠٤٨ ←
 * ١١٧١٫٤٢٨٥٧٢، الدمجُ ١٧٥٠، الترتيبُ ١١٠٠، V1b ١١٧١٫٤٣ و٢٥٠٫٠٠ و٣٩٠٫٤٨ و٨٠٠٠٫٠٠. */
const NEW = "[2a] ";
/** فحصٌ واحد: true نجاح، وأيُّ قيمةٍ أخرى تفصيلُ فشله، والرميُ فشلُه وحده. والجلسةُ تعود لصاحب العيادة بعده دائماً — دورٌ
 *  بقي من فحصٍ رمى في منتصفه كان سيُفشل ما بعده من غير ذنبه. */
const T = async (name, fn) => {
  let r;
  try { r = await fn(); } catch (e) { r = `رمى: ${e?.message ?? e}${e?.hint ? ` | ${e.hint}` : ""}`; } finally { OWNER(); }
  check(NEW + name, r === true, r === true ? "" : String(r));
};
const same = (got, want) => (JSON.stringify(got) === JSON.stringify(want) ? true : `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);
const all = (...xs) => (xs.every((x) => x === true) ? true : xs.find((x) => x !== true));
const refusal = async (fn) => { const e = await errOf(fn); return e ? `${e.message}|${e.code ?? ""}|${e.hint ?? ""}` : "ok"; };
const countsRaw = () => JSON.parse(mem.get(COUNTS_KEY) || "[]");
const countRow = (id) => countsRaw().find((c) => c.id === id);
const expenses = () => JSON.parse(mem.get(EXP_KEY) || "[]");
const W = (pid, qty, extra = {}) => ({ product_id: pid, qty, unit: "stock", reason: "damaged", note: "وگعت وانكسرت", ...extra });
const addServices = async (...list) => {
  const cat = JSON.parse(mem.get(`${SVC_KEY}${clinic()}`));
  cat.services.push(...list);
  mem.set(`${SVC_KEY}${clinic()}`, JSON.stringify(cat));
  await mod.services.hydrateServices();
};

console.log("▸ 0254 سندُ التلف: الرفضُ بترتيبه، والإعادة، والموافقةُ بلا حصر، والدمجُ والحذف، ودفعاتُ الرابط");
{
  OWNER();
  const d = db();
  d.products.push(
    P("W5", "سرنجة W5", 0.04, 25000, SUB("سرنجة", 100)), P("WG", "كفوف W3", -0.06, 12500), P("WD", "Diluent W4", 1, 150000, SUB("مل", 20000)),
    P("WC", "مادة جرد W", 0.04, 25000, SUB("سرنجة", 100)), P("WP", "حوض W", 1, 1000, { pooled: true }), P("WF", "علف W", 1, 1000, { farm_id: "F1" }),
    P("WN", "بلا وحدة W", 1, 1000), P("WX", "مادة الحذف W", 1, 1000), P("WT", "توأم W", 1, 1000), P("WK", "أصل W", 2, 1000),
    P("WT2", "مادة ترتيب W", 1, 1000), P("WK2", "مادة ترتيب W", 1, 1000, { section_id: "secW" }),
  );
  save(d);
  SEED.set("WD", 1000n);                                     // لا كتابةَ مباشرة عليها: الرصيدُ = البذرة − ext_out (حفظُ الرصيد بالترحيل الخارجيّ)
  const snapW = () => JSON.stringify({ c: countsRaw(), r: db().rpcRefs ?? null, p: db().products.filter((p) => p.id.startsWith("W")).map((p) => [p.id, p.stock]) });
  const s0 = snapW();
  PHO();
  const ePho = await refusal(() => api.submitWaste([W("W5", 1)], false, "w-pho"));
  OWNER();
  await T("المصوّرُ تردّه البوّابةُ قبل الدالّة (photographer_forbidden، 42501)", async () => same(ePho, `photographer_forbidden|42501|${hintOf("photographer_forbidden")}`));
  await T("سطورٌ فارغة ⇒ waste_empty، و٥١ سطراً ⇒ waste_too_many — بتلميحَي الخادم", async () => all(
    same(await refusal(() => api.submitWaste([], false, "w-e")), `waste_empty|P0001|${hintW("waste_empty")}`),
    same(await refusal(() => api.submitWaste(Array.from({ length: 51 }, (_, i) => W(`X${i}`, 1)), false, "w-m")), `waste_too_many|P0001|${hintW("waste_too_many")}`)));
  RCP();
  const eRcp = await refusal(() => api.submitWaste([W("W5", 1)], true, "w-rcp"));
  OWNER();
  await T("«سجّل وطبّق» من الاستقبال ⇒ waste_needs_manager بتلميحه", async () => same(eRcp, `waste_needs_manager|P0001|${hintW("waste_needs_manager")}`));
  const one = async (line) => refusal(() => api.submitWaste([line], false, `w-${Math.random()}`));
  await T("كلُّ سطرٍ بترتيب فحوصه: غائبة، حوض، حقل، سبب، ملاحظة، كمية (بلا وحدةٍ صغيرة، أربعُ منازل، نصٌّ، فوق المليون) — برمزه وتلميحه", async () => all(
    same(await one(W("W-nope", 1)), `waste_product_missing|P0001|${hintW("waste_product_missing")}`),
    same(await one(W("WP", 1)), `waste_pooled|P0001|${hintW("waste_pooled", "حوض W")}`),
    same(await one(W("WF", 1)), `waste_farm|P0001|${hintW("waste_farm", "علف W")}`),
    same(await one(W("W5", 1, { reason: "shortage" })), `waste_reason|P0001|${hintW("waste_reason")}`),
    same(await one(W("W5", 1, { note: "   " })), `waste_note|P0001|${hintW("waste_note")}`),
    same(await one(W("WN", 1, { unit: "sub" })), `waste_bad_qty|P0001|${hintW("waste_bad_qty", "بلا وحدة W")}`),
    same(await one(W("W5", 0.0004)), `waste_bad_qty|P0001|${hintW("waste_bad_qty", "سرنجة W5")}`),
    same(await one(W("W5", 1.0005)), `waste_bad_qty|P0001|${hintW("waste_bad_qty", "سرنجة W5")}`),
    same(await one(W("W5", "1x")), `waste_bad_qty|P0001|${hintW("waste_bad_qty", "سرنجة W5")}`),
    same(await one(W("W5", 1000001)), `waste_bad_qty|P0001|${hintW("waste_bad_qty", "سرنجة W5")}`)));
  await T("مكرّرة ⇒ waste_duplicate باسمها؛ والرفضُ القاطعُ بسطرٍ لاحق يسبق «أكّد مرّة ثانية» بسطرٍ قبله", async () => all(
    same(await refusal(() => api.submitWaste([W("WD", 1, { unit: "sub" }), W("WD", 2, { unit: "sub" })], false, "w-dup")), `waste_duplicate|P0001|${hintW("waste_duplicate", "Diluent W4")}`),
    same(await refusal(() => api.submitWaste([W("WG", 0.5), W("W-nope", 1)], false, "w-ord")), `waste_product_missing|P0001|${hintW("waste_product_missing")}`)));
  await T("فوق الرصيد بلا تأكيد ⇒ waste_exceeds_stock بالرقمين بوحدة الكتابة (العلبةُ بلا اسم، والصغيرةُ باسمها)", async () => all(
    same(await one(W("WG", 0.5)), `waste_exceeds_stock|P0001|${overW("كفوف W3", "-0.06", "", "0.5", "")}`),
    same(await one(W("W5", 5, { unit: "sub" })), `waste_exceeds_stock|P0001|${overW("سرنجة W5", "4", " سرنجة", "5", " سرنجة")}`)));
  await T("ولا شيءَ يُكتب بأيّ رفض — لا سطرَ ولا مرجع (والدالّةُ تجري: سطورٌ فارغة waste_empty)", async () =>
    (s0 === snapW() && (await errOf(() => api.submitWaste([], false, "x")))?.message === "waste_empty") || "تغيّر المخزن أو لم تجرِ الدالّة");

  let w2;
  await T("W2: سندُ ٢ سرنجة على ٠٫٠٤٠ معلَّق — صفٌّ مكتوبٌ فرقاً (d = ٠٫٠٢ بالضبط والمعدودُ صفر) بكلفة اللقطة ووحدتها، والجوابُ بشكله", async () => {
    w2 = await api.submitWaste([W("W5", 2, { unit: "sub" })], false, "w2");
    const row = countRow(w2.ids?.[0]);
    return all(same({ pending: w2.pending, n: w2.ids.length, decided: w2.decided, lines: w2.lines },
      { pending: 1, n: 1, decided: null, lines: [{ product_id: "W5", name: "سرنجة W5", stock_now: 0.04, stock_after: 0.02 }] }),
      same([row?.source, row?.status, row?.system_qty, row?.counted_qty, row?.unit_cost, row?.reason, row?.entered_qty, row?.entered_unit, row?.unit_label, row?.applied_delta, row?.posted],
        ["waste", "pending", 0.02, 0, 25000, "damaged", 2, "sub", "سرنجة", null, null]), stk("W5") === "0.040" || stk("W5"));
  });
  await T("الإعادةُ بالمرجع نفسِه (ولو بسطورٍ أخرى، ومن الاستقبال بـ«طبّق»، وبمسافات) ترجع الجوابَ الأوّل بلا صفٍّ ثانٍ", async () => {
    const n = countsRaw().length;
    const a = await api.submitWaste([W("WD", 1)], false, "w2");
    RCP();
    const b = await api.submitWaste([W("WD", 1)], true, " w2 ");
    OWNER();
    return all(same(a, w2), same(b, w2), countsRaw().length === n || `${countsRaw().length} ≠ ${n}`);
  });
  await T("معلَّقٌ واحدٌ لكلّ مادّة: سندٌ ثانٍ ⇒ waste_already_pending بتلميحه، والجردُ ⇒ count_already_pending", async () => all(
    countRow(w2?.ids?.[0])?.status === "pending" || "لا سند",
    same(await one(W("W5", 1, { unit: "sub" })), `waste_already_pending|P0001|${hintW("waste_already_pending", "سرنجة W5")}`),
    same(await code(() => repo.submitStockCount([{ product_id: "W5", counted: 0.01, reason: "damaged" }])), "count_already_pending")));
  await T("«عدّ اليوم» لا يرى السند (source = 'count')", async () => (countRow(w2?.ids?.[0])?.source === "waste" && !(await repo.stockCountState()).has("W5")) || "السندُ يُعدّ عدّاً أو غائب");
  { const dd = db(); prod("W5", dd).stock = -0.01; save(dd); }      // خمسُ حُقنٍ بعد السند (مِسبار W2)
  RCP();
  const eDec = await code(() => repo.decideStockCounts(w2?.ids ?? ["x"], true));
  OWNER();
  const t0 = new Date(Date.now() - 1000).toISOString();
  let dec2;
  await T("W2: موافقةُ المدير بلا حصر — −٠٫٠١٠ ⇒ −٠٫٠٣٠، والفرقُ −٠٫٠٢ حرفاً والمكتوبُ ٠٫٠٢، وnegatives تسمّيها (والاستقبالُ لا يوافق)", async () => {
    dec2 = await repo.decideStockCounts(w2.ids, true);
    const row = countRow(w2.ids[0]);
    return all(eDec === "count_needs_manager" || eDec, stk("W5") === "-0.030" || stk("W5"), same([row.status, row.applied_delta, row.posted], ["approved", -0.02, 0.02]),
      same([dec2.approved, dec2.rejected, dec2.void, dec2.withdrawals.map((w) => [w.reason, w.amount]), dec2.negatives],
        [1, 0, 0, [["damaged", 500]], [{ product_id: "W5", name: "سرنجة W5", stock: -0.03 }]]));
  });
  await T("  وسحبُ المخزن ٥٠٠٫٠٠ بنصّه «سحب مخزن — تالف: سرنجة W5 ×2 سرنجة»، وتقريرُ الخسائر ٠٫٠٢ / ٥٠٠", async () => {
    const e = expenses().find((x) => x.id === dec2.withdrawals[0].expense_id);
    const losses = await repo.reportStockLosses(t0, new Date(Date.now() + 1000).toISOString());
    return all(same([e?.amount, e?.description, e?.method, e?.category], [500, "سحب مخزن — تالف: سرنجة W5 ×2 سرنجة", "stock", "سحب مخزن"]),
      same(losses, [{ reason: "damaged", lines: 1, qty: 0.02, value: 500 }]));
  });
  await T("W3: كفوفٌ عند −٠٫٠٦٠ ونصفُ علبةٍ بتأكيد «طبّق» ⇒ −٠٫٥٦٠ و٦٬٢٥٠٫٠٠، وpending صفر بموافقته", async () => {
    const r = await api.submitWaste([W("WG", 0.5, { ack_over: true })], true, "w3");
    const e = expenses().find((x) => x.id === r.decided?.withdrawals?.[0]?.expense_id);
    return all(same([r.pending, r.decided?.approved, r.decided?.negatives], [0, 1, [{ product_id: "WG", name: "كفوف W3", stock: -0.56 }]]), stk("WG") === "-0.560" || stk("WG"),
      same([e?.amount, e?.description], [6250, "سحب مخزن — تالف: كفوف W3 ×0.5"]), same(r.lines, [{ product_id: "WG", name: "كفوف W3", stock_now: -0.06, stock_after: -0.56 }]));
  });
  await T("W4: ١٠ مل من مكعّب ٢٠ لتراً ⇒ d = ٠٫٠٠٠٥ بالضبط: يُكتب ٠٫٠٠١ عبر المرحَّل (ext_in ٠٫٠٠٠٥) وسحبٌ ٧٥٫٠٠، وثانيةٌ تكتب صفراً", async () => {
    const a = await api.submitWaste([W("WD", 10, { unit: "sub" })], true, "w4a");
    const ra = countRow(a.ids[0]);
    const after1 = `${stk("WD")}|${cry("WD")}|${db().stockCarry?.WD?.ext_in_n}|${db().stockCarry?.WD?.ext_out_m}`;
    const b = await api.submitWaste([W("WD", 10, { unit: "sub" })], true, "w4b");
    const rb = countRow(b.ids[0]);
    return all(same([ra.system_qty, ra.applied_delta, ra.posted, a.decided.withdrawals[0].amount], [0.0005, -0.0005, 0.001, 75]), same(after1, "0.999|-0.000500000|500000|1"),
      same([rb.posted, b.decided.withdrawals[0].amount, stk("WD"), cry("WD")], [0, 75, "0.999", "0.000000000"]));
  });
  vc("  والدفترُ متّسقٌ بعد ترحيلَي السند (Σqty − Σposted + ext_in − ext_out = carry، والرصيدُ = البذرة − ext_out)");
  await T("جردٌ «٠٫٠٤٠ ⇒ ٠٫٠٢٠» معلَّق ثمّ استهلاكٌ إلى −٠٫٠١٠: الموافقةُ −٠٫٠٣٠ والفرقُ −٠٫٠٢ وخسارتُه ٥٠٠ (كان يحصره: صفرٌ و+٠٫٠١٠ بلا خسارة)", async () => {
    await repo.submitStockCount([{ product_id: "WC", counted: 0.02, reason: "damaged" }]);
    const id = countsRaw().find((c) => c.product_id === "WC" && c.status === "pending").id;
    { const dd = db(); prod("WC", dd).stock = -0.01; save(dd); }
    const r = await repo.decideStockCounts([id], true);
    const row = countRow(id);
    const e = expenses().find((x) => x.id === r.withdrawals[0]?.expense_id);
    return all(stk("WC") === "-0.030" || stk("WC"), same([row.applied_delta, row.source, row.posted ?? null], [-0.02, "count", null]),
      same([e?.amount, e?.description], [500, "سحب مخزن — تالف: مادة جرد W ×0.02"]), same(r.negatives, [{ product_id: "WC", name: "مادة جرد W", stock: -0.03 }]));
  });
  await T("أيُّ موظفٍ يسجّل سنداً معلَّقاً (الاستقبال)، والمديرُ يرفضه فلا يتحرّك شيء", async () => {
    RCP();
    const r = await api.submitWaste([W("WX", 0.5, { reason: "expired" })], false, "wx1");
    OWNER();
    const ok = countRow(r.ids[0])?.status === "pending" && r.pending === 1;
    await repo.decideStockCounts(r.ids, false);
    return all(ok || "لم يُسجَّل", countRow(r.ids[0])?.status === "rejected" || "لم يُرفض", stk("WX") === "1.000" || stk("WX"));
  });
  await T("الحذف: مادّةٌ عليها سندٌ معلَّق ⇒ product_waste_pending بالاسم ولا تُحذف؛ وبعد البتّ تُحذف وسطورُها بلا معرّف (on delete set null)", async () => {
    const r = await api.submitWaste([W("WX", 0.25)], false, "wx2");
    const e = await refusal(() => repo.deleteProduct("WX"));
    const live = !!prod("WX");
    await repo.decideStockCounts(r.ids, false);
    await repo.deleteProduct("WX");
    return all(same(e, `product_waste_pending|P0001|${hintW("product_waste_pending", "مادة الحذف W")}`), live || "انحذفت", !prod("WX") || "ما انحذفت",
      countsRaw().filter((c) => c.product_name === "مادة الحذف W").every((c) => c.product_id === null) || "بقي المعرّف");
  });
  const wt = {};
  await T("الدمج: توأمٌ عليه سندٌ معلَّق وأصلٌ عليه جردٌ معلَّق ⇒ merge_waste_pending بالاسمين ولا شيءَ يتحرّك", async () => {
    await repo.submitStockCount([{ product_id: "WT", counted: 0.9, reason: "damaged" }]);
    await repo.decideStockCounts(countsRaw().filter((c) => c.product_id === "WT" && c.status === "pending").map((c) => c.id), true);
    wt.a = (await api.submitWaste([W("WT", 0.1)], true, "wt-a")).ids[0];
    wt.b = (await api.submitWaste([W("WT", 0.2)], false, "wt-b")).ids[0];
    await repo.submitStockCount([{ product_id: "WK", counted: 1.5, reason: "damaged" }]);
    const e = await refusal(() => repo.mergeProducts("WK", "WT"));
    return all(same(e, `merge_waste_pending|P0001|${hintW("merge_waste_pending", "توأم W", "أصل W")}`), !!prod("WT") || "انطوى التوأم", countRow(wt.b)?.product_id === "WT" || "انتقل السند");
  });
  await T("  وبعد رفض جرد الأصل: الدمجُ يمرّ وسنداتُ التوأم كلُّها (المعتمدُ والمعلَّق) للأصل، وجردُه بلا معرّف، والمعلَّقُ يوافَق على الأصل", async () => {
    await repo.decideStockCounts(countsRaw().filter((c) => c.product_id === "WK" && c.status === "pending").map((c) => c.id), false);
    await repo.mergeProducts("WK", "WT");
    const ra = countRow(wt.a), rb = countRow(wt.b);
    const cnt = countsRaw().find((c) => c.product_name === "توأم W" && c.source === "count");
    await repo.decideStockCounts([wt.b], true);
    return all(same([ra?.product_id, ra?.status, rb?.product_id, rb?.status], ["WK", "approved", "WK", "pending"]), (cnt && cnt.product_id === null) || `جردُ التوأم ${cnt?.product_id}`,
      stk("WK") === "2.600" || stk("WK"), countRow(wt.b)?.status === "approved" || "ما انوافق");
  });
  await T("«رتّب المخزن» بنفس الحارس: سندٌ على التوأم وجردٌ على الأصل ⇒ merge_waste_pending ولا شيءَ يُطوى؛ وبعد البتّ ينتقل السند", async () => {
    const v = await api.submitWaste([W("WT2", 0.5)], false, "wt2");
    await repo.submitStockCount([{ product_id: "WK2", counted: 0.5, reason: "damaged" }]);
    const e = await refusal(() => repo.tidyInventory());
    const still = !!prod("WT2") && countRow(v.ids[0])?.product_id === "WT2";
    await repo.decideStockCounts(countsRaw().filter((c) => c.product_id === "WK2" && c.status === "pending").map((c) => c.id), false);
    const t = await repo.tidyInventory();
    return all(same(e, `merge_waste_pending|P0001|${hintW("merge_waste_pending", "مادة ترتيب W", "مادة ترتيب W")}`), still || "طُوي",
      t.merged >= 1 || JSON.stringify(t), !prod("WT2") || "ما انطوى", countRow(v.ids[0])?.product_id === "WK2" || "ما انتقل");
  });

  // دفعاتُ الرابط: بيعةٌ لثلاث خدمات (WS، WS2، WS3) ثمّ مرتجعٌ لسطر WS2 وحده — فدفعةُ المرتجع حدثٌ لـWS2 لا لـWS.
  { const dd = db(); dd.products.push(P("WS", "قطعة الرابط", 5, 1000, SUB("قطعة", 10)), P("WS2", "قطعة الرابط ٢", 5, 1000, SUB("قطعة", 10)),
      P("WS3", "قطعة الرابط ٣", 5, 1000, SUB("قطعة", 10))); save(dd); }
  for (const id of ["WS", "WS2", "WS3"]) SEED.set(id, 5000n);
  const SWS = U("f1"), SWS2 = U("f2"), SWS3 = U("f3");
  await addServices(svc(SWS, "خدمة الرابط", 1000), svc(SWS2, "خدمة الرابط ٢", 1000), svc(SWS3, "خدمة الرابط ٣", 1000));
  for (const [s, p] of [[SWS, "WS"], [SWS2, "WS2"], [SWS3, "WS3"]]) await api.recipeSet(s, [{ product_id: p, qty: 1, unit: "sub" }], (await api.recipeGet(s)).fingerprint);
  const ws = await sale("ws", [svcLine("خدمة الرابط", SWS, 3, 1000), svcLine("خدمة الرابط ٢", SWS2, 2, 1000), svcLine("خدمة الرابط ٣", SWS3, 1, 1000)]);
  await repo.returnInvoiceItems(ws.id, [{ item_id: linesOf(ws.id).find((l) => l.name === "خدمة الرابط ٢").id, qty: 1 }]);
  const usOf = (pid, kind) => [...new Set(evsOf(ws.id).filter((e) => e.product_id === pid && e.kind === kind).map((e) => e.at_us))];
  const saleUs = usOf("WS", "use")[0], retUs = usOf("WS2", "restore")[0];
  await T("الرابط: دفعاتٌ بلا فاتورة، وفاتورةٌ لا تُعرف، وقائمةٌ فارغة أو بكسرٍ أو بنصٍّ أو مكرّرة، ودفعةٌ بلا حدث، ودفعةُ مادّةٍ أخرى ⇒ waste_source_bad", async () => {
    const bad = async (line) => { const r = await refusal(() => api.submitWaste([line], false, `wsb-${Math.random()}`)); return r.split("|").slice(0, 2).join("|") + (r.split("|")[2] ? "|hint" : ""); };
    const B = "waste_source_bad|P0001|hint";
    const L = (extra) => W("WS2", 1, { unit: "sub", ...extra });
    return all(typeof saleUs === "number" && typeof retUs === "number" && retUs > saleUs || `${saleUs}|${retUs}`,
      same(await bad(L({ src_batches: [retUs] })), B), same(await bad(L({ src_invoice: "nope", src_batches: [retUs] })), B),
      same(await bad(L({ src_invoice: ws.id, src_batches: [] })), B), same(await bad(L({ src_invoice: ws.id, src_batches: [retUs + 0.5] })), B),
      same(await bad(L({ src_invoice: ws.id, src_batches: ["abc"] })), B), same(await bad(L({ src_invoice: ws.id, src_batches: [retUs, retUs] })), B),
      same(await bad(L({ src_invoice: ws.id, src_batches: [retUs + 7] })), B),
      same(await bad(W("WS", 1, { unit: "sub", src_invoice: ws.id, src_batches: [retUs] })), B));
  });
  const wv = {};
  await T("وسطرٌ عُبّي من دفعتين يحفظهما كلتيهما مرتّبتين، والمعبّأُ من الفاتورة كلِّها بلا دفعات — والقراءةُ تقولهما (waste)", async () => {
    wv.a = (await api.submitWaste([W("WS2", 1, { unit: "sub", src_invoice: ws.id, src_batches: [retUs, saleUs] })], false, "wsv-a")).ids[0];
    wv.b = (await api.submitWaste([W("WS3", 1, { unit: "sub", src_invoice: ws.id })], false, "wsv-b")).ids[0];
    wv.c = (await api.submitWaste([W("WS", 1, { unit: "sub", src_invoice: ws.id, src_batches: [String(saleUs)] })], false, "wsv-c")).ids[0];
    const x = (await api.invoiceConsumption([ws.id]))[ws.id];
    const by = Object.fromEntries((x.waste ?? []).map((w) => [w.product_id, w]));
    return all(same([countRow(wv.a)?.source_batches, countRow(wv.b)?.source_batches ?? null, countRow(wv.c)?.source_batches, countRow(wv.a)?.source_invoice], [[saleUs, retUs], null, [saleUs], ws.id]),
      same(Object.keys(by).sort(), ["WS", "WS2", "WS3"]),
      same([by.WS2?.batches, by.WS2?.status, by.WS2?.qty, by.WS2?.unit, by.WS3?.batches, by.WS?.batches], [[saleUs, retUs], "pending", 1, "sub", null, [saleUs]]),
      (x.waste ?? []).every((w) => typeof w.id === "string" && Number.isFinite(Date.parse(w.counted_at))) || "شكل");
  });
  await T("  والمرفوضُ يخرج من القراءة، والمعتمدُ يبقى «approved»", async () => {
    await repo.decideStockCounts([wv.c], false);
    await repo.decideStockCounts([wv.a], true);
    const x = (await api.invoiceConsumption([ws.id]))[ws.id];
    return same((x.waste ?? []).map((w) => `${w.product_id}:${w.status}`).sort(), ["WS2:approved", "WS3:pending"]);
  });
  await T("  وفاتورةٌ حُذفت ودفترُها باقٍ معروفة: سطرٌ منها يُقبل بدفعته", async () => {
    await repo.deleteInvoice(ws.id);
    const r = await api.submitWaste([W("WS", 1, { unit: "sub", src_invoice: ws.id, src_batches: [saleUs] })], false, "wsv-d");
    return same([countRow(r.ids[0])?.source_invoice, countRow(r.ids[0])?.source_batches], [ws.id, [saleUs]]);
  });
  vc();
}

console.log("▸ 0255 المتوسّطُ المتحرّك: الشراءُ وتعديلُه والدمجُ والتصحيحُ والحارس، والجرد، وسطرُ المادّة بكلفة الخادم (V1b)");
{
  OWNER();
  const d = db();
  d.products.push(
    P("A1", "مادة السلسلة", 10, 1000), P("A2", "مجهولة الكلفة", 10, 0), P("A3", "سالبة الرصيد", -2, 1000), P("A3b", "سالبة أرخص", -2, 1300),
    P("A4", "مجانية الشراء", 20, 1200), P("A5", "سطران لمادة", 10, 1000), P("AF", "علف المتوسط", 1, 1000, { farm_id: "F1" }),
    P("A6", "تصحيح الكمية", 0, 1000), P("A7", "باقية بالفاتورة", 5, 1000), P("A8", "شيلت من الفاتورة", 5, 1000), P("A9", "مجانية تُعدَّل", 10, 1000),
    P("M1", "أصل الدمج أ", 10, 1000), P("M2", "توأم الدمج أ", 30, 2000, { avg_cost: 2000 }), P("M3", "أصل توأمه بلا كلفة", 10, 1000), P("M4", "توأم بلا كلفة", 5, 0),
    P("M5", "أصل توأمه سالب", 10, 1000), P("M6", "توأم سالب", -3, 2000), P("M7", "أصل بلا كلفة", 4, 0), P("M8", "توأم بكلفة", 6, 2000),
    P("M9", "مادة ترتيب المتوسط", 10, 1000, { section_id: "secA" }), P("M10", "مادة ترتيب المتوسط", 5, 1300),
    P("VB", "علبة V1b", 10, 1200, { avg_cost: 1171.428572 }), P("VS", "سرنجة V1b", 10, 25000, SUB("سرنجة", 100)),
    P("VA", "أمبولة V1b", 10, 1000, { ...SUB("أمبولة", 3), avg_cost: 1171.428572 }), P("VK", "موزون V1b", 10, 8000, { sold_by_weight: true }),
    P("VF", "علف V1b", 10, 3000, { farm_id: "F1" }),
  );
  save(d);
  const effOf = (purId) => repo.listPurchaseEffects(purId);
  const avg = (id) => prod(id)?.avg_cost ?? null;
  let p1;
  await T("§10: ١٠ بألف (بلا متوسّط) + شراءُ ١٠ بـ١٢٠٠ ⇒ ١١٠٠، والكشفُ «كان» بلا متوسّط و«صار» ١١٠٠ بلا فرق كلفة", async () => {
    p1 = await repo.recordPurchase([{ product_id: "A1", name: "مادة السلسلة", qty: 10, purchase_price: 1200, sell_price: 0 }], { company_name: "a1" });
    const e = (await effOf(p1.id))[0];
    return all(same([avg("A1"), stk("A1"), prod("A1").purchase_price], [1100, "20.000", 1200]), same([e.before?.avg_cost, e.after?.avg_cost, e.cost_variance], [null, 1100, null]));
  });
  const SA1 = U("f4");
  await addServices(svc(SA1, "خدمة السلسلة", 5000));
  await api.recipeSet(SA1, [{ product_id: "A1", qty: 1, unit: "stock" }], (await api.recipeGet(SA1)).fingerprint);
  await T("  والوصفةُ تقرأ المتوسّط (stock_unit_cost)، وصرفُ ٤ ⇒ كلفةُ السطر ١١٠٠٫٠٠ وCOGS ٤٤٠٠٫٠٠", async () => {
    const g = await api.recipeGet(SA1);
    const s = await sale("a1s", [svcLine("خدمة السلسلة", SA1, 4, 5000, 1)]);
    return all(same([g.lines[0].unit_cost, g.lines[0].per_value], [1100, 1100]), same([linesOf(s.id)[0].unit_cost, s.cost_total, stk("A1")], [1100, 4400, "16.000"]));
  });
  await T("  وشراءُ ٥ بـ١٣٠٠ ⇒ 24100/21 = ١١٤٧٫٦١٩٠٤٨، وتعديلُ فاتورة الـ١٢٠٠ إلى ١٢٥٠ ⇒ ١١٧١٫٤٢٨٥٧٢، و«صار» بالكشف يقوله", async () => {
    await repo.recordPurchase([{ product_id: "A1", name: "مادة السلسلة", qty: 5, purchase_price: 1300, sell_price: 0 }], { company_name: "a1b" });
    const mid = avg("A1");
    await repo.updatePurchase(p1.id, [{ product_id: "A1", name: "مادة السلسلة", qty: 10, purchase_price: 1250, sell_price: 0 }], { company_name: "a1" });
    const u = (await effOf(p1.id)).filter((x) => x.op === "update");
    return all(same([mid, avg("A1"), stk("A1")], [1147.619048, 1171.428572, "21.000"]), same(u.map((x) => x.after?.avg_cost), [1171.428572]));
  });
  await T("  وصرفُ ١ ⇒ ١١٧١٫٤٣، وترجيعُه يردّ الرصيدَ ولا يمسّ المتوسّط", async () => {
    const s = await sale("a1t", [svcLine("خدمة السلسلة", SA1, 1, 5000, 1)]);
    const c = linesOf(s.id)[0].unit_cost;
    await repo.refundInvoice(s.id);
    return same([c, avg("A1"), stk("A1")], [1171.43, 1171.428572, "21.000"]);
  });
  await T("الاستلام: أساسٌ مجهول (١٠ بصفر) + ١٠ بـ١٢٠٠ ⇒ ١٢٠٠ لا ٦٠٠؛ أساسٌ سالب −٢ بـ١٠٠٠ + ١٠ بـ١٣٠٠ ⇒ ١٣٠٠ وفرقٌ ٦٠٠٫٠٠ (وأرخصُ ⇒ −٦٠٠٫٠٠)", async () => {
    const pa = await repo.recordPurchase([{ product_id: "A2", name: "مجهولة الكلفة", qty: 10, purchase_price: 1200, sell_price: 0 },
      { product_id: "A3", name: "سالبة الرصيد", qty: 10, purchase_price: 1300, sell_price: 0 },
      { product_id: "A3b", name: "سالبة أرخص", qty: 10, purchase_price: 1000, sell_price: 0 }], { company_name: "a2" });
    const e = await effOf(pa.id);
    return all(same([avg("A2"), avg("A3"), avg("A3b")], [1200, 1300, 1000]), same(e.map((x) => x.cost_variance), [null, 600, -600]), same([stk("A3"), stk("A3b")], ["8.000", "8.000"]));
  });
  await T("  ومجّانيٌّ على ٢٠ بـ١٢٠٠ لا يخفّض (١٢٠٠ ويثبّت المتوسّط)، وسطران لمادّةٍ بفاتورة ⇒ ١١٥٠ ثمّ ١٣٣٣٫٣٣٣٣٣٣، والجديدةُ بكلفة سطرها", async () => {
    const pb = await repo.recordPurchase([{ product_id: "A4", name: "مجانية الشراء", qty: 5, purchase_price: 0, sell_price: 0 },
      { product_id: "A5", name: "سطران لمادة", qty: 10, purchase_price: 1300, sell_price: 0 },
      { product_id: "A5", name: "سطران لمادة", qty: 10, purchase_price: 1700, sell_price: 0 },
      { name: "مادة جديدة للمتوسط", qty: 3, purchase_price: 900, sell_price: 0 },
      { name: "مادة مجانية للمتوسط", qty: 2, purchase_price: 0, sell_price: 0 }], { company_name: "a4" });
    const e = await effOf(pb.id);
    const np = db().products.find((p) => p.name === "مادة جديدة للمتوسط"), nf = db().products.find((p) => p.name === "مادة مجانية للمتوسط");
    return all(same([avg("A4"), prod("A4").purchase_price, avg("A5")], [1200, 1200, 1333.333333]),
      same(e.map((x) => [x.before?.avg_cost ?? null, x.after?.avg_cost ?? null]), [[null, 1200], [null, 1150], [1150, 1333.333333], [null, 900], [null, null]]),
      same([np?.avg_cost, nf?.avg_cost ?? null], [900, null]));
  });
  await T("  ومخزنُ الحقل خارج المتوسّط: الشراءُ يرفع الرصيدَ وسعرَ الشراء ولا متوسّطَ ولا فرق (والكشفُ يحمل العمودين)", async () => {
    const pf = await repo.recordPurchase([{ product_id: "AF", name: "علف المتوسط", qty: 1, purchase_price: 2000, sell_price: 0 }], { company_name: "af" });
    const e = (await effOf(pf.id))[0];
    return all(same([avg("AF"), prod("AF").purchase_price, stk("AF")], [null, 2000, "2.000"]), ("cost_variance" in e && e.cost_variance === null && "avg_cost" in (e.after ?? {})) || JSON.stringify(e));
  });
  await T("تعديلُ الشراء: تصحيحُ كميةٍ ٢ ← ٢٠ بنفس الكلفة على رصيد −٥ يُبقي ١٠٠٠ (الرصيدُ الأوّل بإشارته — max(s0,0) كان ١٣٨٤٫٦١٥٣٨٥)", async () => {
    const p6 = await repo.recordPurchase([{ product_id: "A6", name: "تصحيح الكمية", qty: 2, purchase_price: 1000, sell_price: 0 }], { company_name: "a6" });
    const a0 = avg("A6");
    await sale(null, [{ product_id: "A6", name: "تصحيح الكمية", qty: 7, unit_price: 1500, unit_cost: 1, stock_qty: 7 }]);
    await repo.updatePurchase(p6.id, [{ product_id: "A6", name: "تصحيح الكمية", qty: 20, purchase_price: 1000, sell_price: 0 }], { company_name: "a6" });
    return same([a0, avg("A6"), stk("A6")], [1000, 1000, "13.000"]);
  });
  await T("  وشيلُ مادّةٍ من الفاتورة يعيد تقييمَ رصيدها (٨ بـ١١١٢٫٥ − ٣ بـ١٣٠٠ ⇒ ١٠٠٠)، والباقيةُ لا تُكتب، والمولودةُ بالتعديل بكلفتها، والكشفُ يقولها", async () => {
    const p78 = await repo.recordPurchase([{ product_id: "A7", name: "باقية بالفاتورة", qty: 3, purchase_price: 1300, sell_price: 0 },
      { product_id: "A8", name: "شيلت من الفاتورة", qty: 3, purchase_price: 1300, sell_price: 0 }], { company_name: "a7" });
    const before = [avg("A7"), avg("A8")];
    await repo.updatePurchase(p78.id, [{ product_id: "A7", name: "باقية بالفاتورة", qty: 3, purchase_price: 1300, sell_price: 0 },
      { name: "وُلدت بالتعديل", qty: 4, purchase_price: 900, sell_price: 0 }], { company_name: "a7" });
    const u = (await effOf(p78.id)).filter((x) => x.op === "update");
    const born = db().products.find((p) => p.name === "وُلدت بالتعديل");
    return all(same(before, [1112.5, 1112.5]), same([avg("A7"), avg("A8"), stk("A8"), born?.avg_cost], [1112.5, 1000, "5.000", 900]),
      same(u.map((x) => [x.outcome, x.after?.avg_cost]), [["matched", 1112.5], ["created", 900], ["removed", 1000]]));
  });
  await T("  وسطرٌ مجّانيٌّ قديم يُقيَّم بـa0 لا بصفر: ١٠ مجّاناً على ١٠ بألف (يثبّت ١٠٠٠) ثمّ تعديلُه إلى ١٦٠٠ ⇒ ١٣٠٠ (بالصفر ١٨٠٠)", async () => {
    const p9 = await repo.recordPurchase([{ product_id: "A9", name: "مجانية تُعدَّل", qty: 10, purchase_price: 0, sell_price: 0 }], { company_name: "a9" });
    const a = avg("A9");
    await repo.updatePurchase(p9.id, [{ product_id: "A9", name: "مجانية تُعدَّل", qty: 10, purchase_price: 1600, sell_price: 0 }], { company_name: "a9" });
    return same([a, avg("A9"), stk("A9")], [1000, 1300, "20.000"]);
  });
  await T("الدمج: (١٠ بـ١٠٠٠) + (٣٠ بـ٢٠٠٠) ⇒ ١٧٥٠؛ توأمٌ بلا كلفة وتوأمٌ سالب لا وزنَ لهما (والأصلُ يبقى يتبع سعرَ شرائه)؛ وأصلٌ بلا كلفة يأخذ ٢٠٠٠", async () => {
    await repo.mergeProducts("M1", "M2"); await repo.mergeProducts("M3", "M4"); await repo.mergeProducts("M5", "M6"); await repo.mergeProducts("M7", "M8");
    return all(same([avg("M1"), avg("M3"), avg("M5"), avg("M7")], [1750, null, null, 2000]), same([stk("M1"), stk("M3"), stk("M5"), stk("M7")], ["40.000", "15.000", "7.000", "10.000"]));
  });
  await T("  و«رتّب المخزن» بنفس الطريق: (١٠ بـ١٠٠٠) + (٥ بـ١٣٠٠) ⇒ ١١٠٠", async () => {
    const t = await repo.tidyInventory();
    return all(t.merged >= 1 || JSON.stringify(t), same([avg("M9"), stk("M9"), !!prod("M10")], [1100, "15.000", false]));
  });
  const AUDN = () => JSON.parse(mem.get(AUDIT_KEY) || "[]").filter((x) => x.entity === "products" && x.entity_id === "A2" && x.details?.__changed?.avg_cost).length;
  await T("تصحيحُ المتوسّط: الاستقبالُ والطبيبُ ⇒ cost_reset_forbidden بتلميحه، والمصوّرُ تردّه البوّابة، والاستقبالُ بمفتاح المدير يصحّح", async () => {
    RCP(); const a = await refusal(() => api.productCostReset("A2", 1000));
    VET(); const b = await refusal(() => api.productCostReset("A2", 1000));
    PHO(); const c = await refusal(() => api.productCostReset("A2", 1000));
    RCP(); pinOn();
    let r;
    try { r = await api.productCostReset("A2", 1100); } finally { OWNER(); }
    return all(same(a, `cost_reset_forbidden|P0001|${hintW("cost_reset_forbidden")}`), same(b, a), same(c, `photographer_forbidden|42501|${hintOf("photographer_forbidden")}`),
      same(r, { id: "A2", avg_cost: 1100, purchase_price: 1200 }));
  });
  await T("  والمديرُ يكتب رقماً بستّ منازل ويرجع {id, avg_cost, purchase_price} بسطر تدقيقٍ واحد؛ ونفسُ الرقم لا يكتب، وفارغٌ يعيده لسعر الشراء", async () => {
    const n0 = AUDN();
    const r = await api.productCostReset("A2", 1000.123456);
    const n1 = AUDN();
    await api.productCostReset("A2", 1000.123456);
    const n2 = AUDN();
    const z = await api.productCostReset("A2", null);
    return all(same(r, { id: "A2", avg_cost: 1000.123456, purchase_price: 1200 }), same([n1 - n0, n2 - n1], [1, 0]), same([z.avg_cost, avg("A2")], [null, null]));
  });
  await T("  وما لا يُقبل: سالب، وسبعُ منازل، و١٠¹⁸ ⇒ cost_reset_bad؛ ومادّةٌ غائبة ⇒ cost_reset_product_missing؛ والحقلُ ⇒ cost_reset_farm — كلٌّ بتلميحه", async () => all(
    same(await refusal(() => api.productCostReset("A2", -1)), `cost_reset_bad|P0001|${hintW("cost_reset_bad")}`),
    same(await refusal(() => api.productCostReset("A2", 1.0000001)), `cost_reset_bad|P0001|${hintW("cost_reset_bad")}`),
    same(await refusal(() => api.productCostReset("A2", 1e18)), `cost_reset_bad|P0001|${hintW("cost_reset_bad")}`),
    same(await refusal(() => api.productCostReset("A-nope", 5)), `cost_reset_product_missing|P0001|${hintW("cost_reset_product_missing")}`),
    same(await refusal(() => api.productCostReset("AF", 5)), `cost_reset_farm|P0001|${hintW("cost_reset_farm")}`)));
  await T("  وصفرٌ صريح كلفةٌ صفر لا «مجهول»: لقطةُ السند صفر", async () => {
    await api.productCostReset("A2", 0);
    const r = await api.submitWaste([W("A2", 1)], false, "a2z");
    const out = same([avg("A2"), countRow(r.ids[0])?.unit_cost], [0, 0]);
    await repo.decideStockCounts(r.ids, false);
    return out;
  });
  await T("الحارس: كتابةٌ مباشرة على المتوسّط ⇒ avg_cost_frozen بتلميحه ولا تُكتب؛ وإعادتُه كما هو مع غيره تمرّ؛ وإدراجُ المتصفّح بلا متوسّط", async () => {
    const a = await refusal(() => repo.updateProduct("A1", { avg_cost: 5 }));
    const keep = avg("A1");
    const b = await refusal(() => repo.updateProduct("A1", { avg_cost: 1171.428572, min_stock: 2 }));
    const np = await repo.createProduct({ name: "نسخة بمتوسط", barcode: null, stock: 1, purchase_price: 10, sell_price: 20, avg_cost: 777 });
    return all(same(a, `avg_cost_frozen|P0001|${hintW("avg_cost_frozen")}`), same([keep, b, prod("A1").min_stock], [1171.428572, "ok", 2]), same(prod(np.id)?.avg_cost, null));
  });
  /* الفحصُ النهائيّ للجولة 2أ: طافرُ «المقارنةُ خاماً» نجا من الفرق مع الخادم إلا صدفةً — null يُعاد على مادّةٍ بلا متوسّط (الخادمُ null
   * والمرآةُ بلا حقل) هو وحده ما أمسكه. وعمودُ numeric(24,6) يقرّب NEW قبل المحفّز: المنزلةُ السابعة التي تقرّب للمتوسّط نفسِه تمرّ
   * ويبقى المحفوظ (كانت المرآةُ تحفظها خاماً ١١٧١٫٤٢٨٥٧١٦)، والتي تقرّب لغيره تُرفض. الأرقامُ مقيسةٌ على PGlite (scenarios2a E). */
  await T("الحارس: null يُعاد على مادّةٍ لم يكن لها متوسّطٌ قطّ يمرّ، ومنزلةٌ سابعةٌ يقرّبها العمود للمتوسّط نفسِه تمرّ ويُحفظ المقرَّب، ولغيره تُرفض", async () => {
    const hadField = "avg_cost" in prod("VK");
    const a = await refusal(() => repo.updateProduct("VK", { avg_cost: null, min_stock: 3 }));
    const b = await refusal(() => repo.updateProduct("A1", { avg_cost: 1171.4285716, min_stock: 4 }));
    const kept = [prod("A1").avg_cost, prod("A1").min_stock];
    const c = await refusal(() => repo.updateProduct("A1", { avg_cost: 1171.4285714 }));
    return all(same([hadField, a, prod("VK").min_stock, avg("VK")], [false, "ok", 3, null]), same([b, ...kept], ["ok", 1171.428572, 4]),
      same(c, `avg_cost_frozen|P0001|${hintW("avg_cost_frozen")}`), same(prod("A1").avg_cost, 1171.428572));
  });
  await T("الجرد: لقطةُ الكلفة المتوسّطُ (stock_unit_cost) — ١٣٣٣٫٣٣٣٣٣٣ لا سعرُ الشراء ١٧٠٠، والموافقةُ تكتب ١٣٣٣٫٣٣", async () => {
    await repo.submitStockCount([{ product_id: "A5", counted: 29, reason: "damaged" }]);
    const row = countsRaw().find((c) => c.product_id === "A5" && c.status === "pending");
    const r = await repo.decideStockCounts([row.id], true);
    return same([row.unit_cost, prod("A5").purchase_price, r.withdrawals[0]?.amount], [1333.333333, 1700, 1333.33]);
  });
  await T("V1b البيعة: علبةٌ بالمتوسّط ١١٧١٫٤٣ (والجهازُ أرسل ٥)، وسرنجةٌ ٢٥٠٫٠٠، وأمبولةٌ ٣٩٠٫٤٨، والموزونُ ٨٠٠٠٫٠٠، والمرجَّعُ بالسلّة بكلفته، والحقلُ بكلفة الجهاز، والصغيرةُ بلا stock_qty بالعلبة", async () => {
    const L = (pid, qty, price, sq, cost = 5) => ({ product_id: pid, name: pid, qty, unit_price: price, unit_cost: cost, ...(sq === undefined ? {} : { stock_qty: sq }) });
    const s = await sale("v1b", [L("VB", 2, 1500, 2), L("VS", 3, 300, 0.03), L("VA", 1, 500, 0.333), L("VK", 0.5, 9000, 0.5), L("VB", -1, 1500, -1), L("VF", 1, 4000, 1, 7), L("VS", 1, 30000, undefined)]);
    return all(same(linesOf(s.id).map((l) => l.unit_cost), [1171.43, 250, 390.48, 8000, 1171.43, 7, 25000]), same([s.cost_total, s.profit], [31318.91, 10081.09]));
  });
  { const s = await repo.checkout([{ product_id: "VB", name: "VB", qty: 1, unit_price: 1500, unit_cost: 5, stock_qty: 1 }]);
    check("  (وpos_checkout القديم لم يتغيّر بـ0255: كلفةُ الجهاز)", linesOf(s.id)[0].unit_cost === 5 && s.cost_total === 5, `${linesOf(s.id)[0].unit_cost}|${s.cost_total}`); }
  await T("V1b التعديل: سطرٌ قائمٌ بمعرّفه ومادّته يبقى بكلفته (٧)، والجديدُ بكلفة الخادم (٢٥٠)، ومعرّفُ سطرٍ لمادّةٍ أخرى بكلفة الخادم (٣٩٠٫٤٨)", async () => {
    const s = await sale("v1e", [{ product_id: "VB", name: "VB", qty: 1, unit_price: 1500, unit_cost: 5, stock_qty: 1 }, svcLine("سطر التعديل", null, 1, 1000, 0, { stock_qty: 0 })]);
    { const dd = db(); dd.invoiceItems.find((x) => x.invoice_id === s.id && x.product_id === "VB").unit_cost = 7; save(dd); }   // سطرٌ قديمٌ بكلفته يومَ بيعه
    const vbId = linesOf(s.id).find((l) => l.product_id === "VB").id;
    await repo.editInvoiceLines(s.id, [...editLines(s.id), { product_id: "VS", name: "VS", qty: 2, unit_price: 300, unit_cost: 5, stock_qty: 0.02 },
      { id: vbId, product_id: "VA", name: "VA", qty: 1, unit_price: 500, unit_cost: 5, stock_qty: 0.333 }], "v1e");
    return all(same(linesOf(s.id).map((l) => `${l.product_id ?? "-"}:${l.unit_cost}`).sort(), ["-:0", "VA:390.48", "VB:7", "VS:250"].sort()),
      same(db().invoices.find((i) => i.id === s.id).cost_total, 897.48));
  });
}

console.log("▸ حقولُ القراءة: moves من أحداث live_qty نفسِها، ودفعةٌ واحدة لكلّ فعل، وnow_us بالساعة نفسِها");
{
  OWNER();
  await T("لكلّ مواصفةٍ بكلّ فاتورة: moves غيرُ فارغة بأعداد µs صحيحة، وΣ moves.qty = live_qty بتسع منازل حرفاً، وnow_us ≥ كلّ at_us، وwaste حاضرة", async () => {
    const d = db();
    const ids = [...new Set([...d.invoices.map((i) => i.id), ...(d.consumption ?? []).map((e) => e.invoice_id)])];
    let specs = 0;
    for (let i = 0; i < ids.length; i += 50) {
      const part = await api.invoiceConsumption(ids.slice(i, i + 50));
      for (const [inv, x] of Object.entries(part)) {
        if (!Number.isSafeInteger(x.now_us) || !Array.isArray(x.waste)) return `${inv}: now_us/waste`;
        for (const s of Object.values(x.items).flat()) {
          specs++;
          if (!Array.isArray(s.moves) || !s.moves.length) return `${inv}/${s.spec_id}: بلا moves`;
          if (!s.moves.every((m) => Number.isSafeInteger(m.at_us) && m.at_us > 0 && m.at_us <= x.now_us)) return `${inv}/${s.spec_id}: at_us`;
          const sum = s.moves.reduce((a, m) => a + C.roundScaled(m.qty, 9), 0n);
          if (sum !== C.roundScaled(s.live_qty, 9)) return `${inv}/${s.spec_id}: Σ ${sum} ≠ ${s.live_qty}`;
        }
      }
    }
    return specs > 50 || `${specs} مواصفة فقط`;
  });
  await T("وكلُّ حدثٍ بالدفتر مختومٌ بدفعته (at_us عددٌ صحيح)", async () => (db().consumption ?? []).every((e) => Number.isSafeInteger(e.at_us)) || "حدثٌ بلا at_us");
  const PRB = U("f5");
  { const dd = db(); dd.products.push(P("RB", "مادة الدفعات", 5, 1000, SUB("قطعة", 10))); save(dd); SEED.set("RB", 5000n); }
  await addServices(svc(PRB, "خدمة الدفعات", 1000));
  await api.recipeSet(PRB, [{ product_id: "RB", qty: 1, unit: "sub" }], (await api.recipeGet(PRB)).fingerprint);
  const maxUs = () => Math.max(0, ...(db().consumption ?? []).map((e) => e.at_us ?? 0));
  await T("ثلاثةُ أفعالٍ بملّي ثانيةٍ واحدة (بيعةُ ٣، مرتجعُ ١، ترجيع): ثلاثُ دفعاتٍ متتالية فوق كلّ ما خُزّن، وما أرجعه كلُّ فعلٍ بدفعته وحدها", async () => {
    const before = maxUs();
    const realNow = Date.now, FIX = Date.now();
    Date.now = () => FIX;
    let s;
    try {
      s = await sale("rb1", [svcLine("خدمة الدفعات", PRB, 3, 1000)]);
      await repo.returnInvoiceItems(s.id, [{ item_id: linesOf(s.id)[0].id, qty: 1 }]);
      await repo.refundInvoice(s.id);
    } finally { Date.now = realNow; }
    const us = [...new Set(evsOf(s.id).map((e) => e.at_us))];
    const x = (await api.invoiceConsumption([s.id]))[s.id];
    const mv = Object.values(x.items).flat().flatMap((sp) => sp.moves ?? []);
    const at = (u) => String(mv.filter((m) => m.at_us === u).reduce((a, m) => a + C.roundScaled(m.qty, 9), 0n));
    return all(us.length === 3 || `${us.length} دفعات`, (us[0] > before && us[1] === us[0] + 1 && us[2] === us[1] + 1) || JSON.stringify({ before, us }),
      same([at(us[0]), at(us[1]), at(us[2])], ["300000000", "-100000000", "-200000000"]), x.now_us >= us[2] || `${x.now_us} < ${us[2]}`);
  });
  await T("والتعديلُ دفعةٌ واحدة: ردُّ السطر القديم وربطُ الجديد بـat_us نفسِه، فوق دفعة البيعة", async () => {
    const s = await sale("rb2", [svcLine("خدمة الدفعات", PRB, 2, 1000)]);
    const u0 = evsOf(s.id)[0].at_us;
    await repo.editInvoiceLines(s.id, editLines(s.id, () => ({ qty: 3 })), "rb2");
    const later = evsOf(s.id).filter((e) => e.at_us !== u0);
    return all(Number.isSafeInteger(u0) || "بلا at_us", new Set(later.map((e) => e.at_us)).size === 1 || "ليست دفعةً واحدة", later[0]?.at_us > u0 || "ليست فوقها",
      same(later.map((e) => `${e.kind}:${e.source}`).sort(), ["restore:recipe", "use:relink"]));
  });
  await T("وnow_us ساعةُ القراءة: ≥ كلّ at_us مخزَّن، ولا يسبق الآن", async () => {
    const t = Date.now() * 1000;
    const x = Object.values(await api.invoiceConsumption([invOf("rb2").id]))[0];
    return all(x.now_us >= maxUs() || `${x.now_us} < ${maxUs()}`, x.now_us >= t || `${x.now_us} < ${t}`);
  });
  vc();
}

console.log("▸ §5: يتيمُ الوصفات يُكنس (on delete cascade)، والترجيعُ لفاتورةٍ غائبة يرمي");
{
  OWNER();
  const SOR = U("f6"), SOR2 = U("f7"), CAT2 = U("f8");
  { const cat = JSON.parse(mem.get(`${SVC_KEY}${clinic()}`)); cat.categories.push({ id: CAT2, name: "فئة تُحذف" });
    cat.services.push(svc(SOR, "خدمة تُحذف", 1000), { id: SOR2, category_id: CAT2, name: "خدمة فئة تُحذف", price: 1000, cost: null });
    mem.set(`${SVC_KEY}${clinic()}`, JSON.stringify(cat)); await mod.services.hydrateServices(); }
  await api.recipeSet(SOR, [{ product_id: "R09", qty: 1, unit: "stock" }], (await api.recipeGet(SOR)).fingerprint);
  await api.recipeSet(SOR2, [{ product_id: "R09", qty: 1, unit: "stock" }], (await api.recipeGet(SOR2)).fingerprint);
  const rowsOf = (sid) => (db().serviceRecipes ?? []).filter((r) => r.service_id === sid).length;
  await T("حذفُ خدمةٍ (removeService) ثمّ الملخّص ⇒ وصفتُها تُكنس من المخزن", async () => {
    const n0 = rowsOf(SOR);
    mod.services.removeService(SOR);
    await api.recipeSummary();
    return all(n0 === 1 || `${n0}`, rowsOf(SOR) === 0 || `${rowsOf(SOR)} بقي`);
  });
  await T("وحذفُ فئةٍ بخدماتها (removeServiceCategory) ثمّ قراءةُ وصفةٍ أخرى ⇒ تُكنس كذلك", async () => {
    const n0 = rowsOf(SOR2);
    mod.services.removeServiceCategory(CAT2);
    await api.recipeGet(S01);
    return all(n0 === 1 || `${n0}`, rowsOf(SOR2) === 0 || `${rowsOf(SOR2)} بقي`);
  });
  await T("والبيعةُ والحفظُ يكنسان كذلك — وصفٌّ حُفظ تحت مفتاح عيادةٍ أخرى (كتالوجُها غيرُ هذا) لا يُمسّ", async () => {
    const orphan = (id, extra = {}) => ({ id, service_id: U("ef"), product_id: "R09", product_name: "x", qty_m: "1000", unit: "stock", position: 0, updated_at: nowIso(), updated_by: null, ...extra });
    { const dd = db(); dd.serviceRecipes.push(orphan("rcp-sale"), orphan("rcp-other", { clinic: "other-clinic" })); save(dd); }
    await sale("orph", [svcLine("حقنة", S03, 1, 5000)]);
    const a = (db().serviceRecipes ?? []).map((r) => r.id);
    const fp = (await api.recipeGet(S03)).fingerprint;
    { const dd = db(); dd.serviceRecipes.push(orphan("rcp-set")); save(dd); }
    await api.recipeSet(S03, [{ product_id: "R08", qty: 1, unit: "sub" }], fp);
    const b = (db().serviceRecipes ?? []).map((r) => r.id);
    return all(!a.includes("rcp-sale") || "البيعة ما كنست", !b.includes("rcp-set") || "الحفظ ما كنس", (a.includes("rcp-other") && b.includes("rcp-other")) || "انمسح صفُّ عيادةٍ أخرى");
  });
  await T("الترجيعُ لفاتورةٍ غائبة ⇒ «invoice not found» كالخادم (كان يرجع undefined بصمت)", async () => same(await code(() => repo.refundInvoice("inv-nope")), "invoice not found"));
}

/* فرقُ الجولة 2أ مع الخادم (SCR/demo-diff بـ--r2a على لقطة SQL الجولة الأولى): أربعةُ فروقٍ أمسكها، كلٌّ بأرقام الخادم المقيسة —
 * المشالُ من فاتورة الشراء بترتيب مفاتيح jsonb، والمجموعُ سطراً سطراً، وموادُّ نصّ السحب بترتيب C، وتلميحاتُ رفض الجرد. */
console.log("▸ الفرقُ مع الخادم (2أ): ترتيبُ المشال، مجموعُ الشراء سطراً سطراً، ترتيبُ C بنصّ السحب، وتلميحاتُ الجرد");
{
  OWNER();
  const d = db();
  d.products.push(P("Z9", "مشالة قصيرة", 5, 1000), P("AA1", "مشالة طويلة", 5, 1000), P("KEEP1", "باقية الفرق", 5, 1000), P("HB", "نصف علبة الفرق", 2, 777.77),
    P("LYX", "Lyse X", 0.5, 2000), P("KTX", "kit X", 0.5, 3000), P("CNX", "مادة جرد الفرق", 2, 1000));
  save(d);
  const effOf = (purId) => repo.listPurchaseEffects(purId);
  const avg0 = (id) => prod(id)?.avg_cost ?? null;
  const L = (pid, name, qty, cost) => ({ product_id: pid, name, qty, purchase_price: cost, sell_price: 0 });
  await T("المشالُ من الفاتورة بترتيب jsonb_object_keys (الطولُ ثمّ البايتات): «Z9» قبل «AA1» وإن جاءت بعدها بالسطور (كان بترتيب السطور)", async () => {
    const pr = await repo.recordPurchase([L("AA1", "مشالة طويلة", 1, 1100), L("Z9", "مشالة قصيرة", 1, 1200), L("KEEP1", "باقية الفرق", 1, 1300)], { company_name: "rm" });
    await repo.updatePurchase(pr.id, [L("KEEP1", "باقية الفرق", 1, 1300)], {});
    const rm = (await effOf(pr.id)).filter((x) => x.op === "update" && x.outcome === "removed").sort((a, b) => a.line_no - b.line_no);
    return same(rm.map((x) => [x.line_no, x.product_id]), [[2, "Z9"], [3, "AA1"]]);
  });
  await T("مجموعُ الشراء v_total numeric(14,2) سطراً سطراً: نصفا علبةٍ بـ٧٧٧٫٧٧ ⇒ ٧٧٧٫٧٨ (لا ٧٧٧٫٧٧)، وتعديلُه لثلاثة ⇒ ١١٦٦٫٦٧ والمدفوعُ ٧٧٧٫٧٨ «جزئي»", async () => {
    const pr = await repo.recordPurchase([L("HB", "نصف علبة الفرق", 0.5, 777.77), L("HB", "نصف علبة الفرق", 0.5, 777.77)], { company_name: "hb" });
    const a = [pr.total, pr.amount_paid, pr.item_count, pr.status];
    const u = await repo.updatePurchase(pr.id, [0, 1, 2].map(() => L("HB", "نصف علبة الفرق", 0.5, 777.77)), {});
    return all(same(a, [777.78, 777.78, 1, "paid"]), same([u.total, u.amount_paid, u.item_count, u.status], [1166.67, 777.78, 2, "partial"]), same(avg0("HB"), 777.77));
  });
  await T("وكلفةُ السطر بمنزلتَي عمودها بالضبط: ١٫٠٠٥ ⇒ ١٫٠١ (Math.round العائم كان ١٫٠٠) — بالكشف وسطرِ الفاتورة وسعرِ الشراء", async () => {
    const pr = await repo.recordPurchase([L("KEEP1", "باقية الفرق", 2, 1.005)], { company_name: "c3" });
    const it = (db().purchaseItems ?? []).find((x) => x.purchase_id === pr.id);
    return same([it?.purchase_price, prod("KEEP1").purchase_price, pr.total], [1.01, 1.01, 2.02]);
  });
  await T("موادُّ نصّ السحب بترتيب الخادم (C بالبايت، كـnegatives): «Lyse X ×1، kit X ×1» لا ترتيبُ اللغة", async () => {
    const r = await api.submitWaste([W("KTX", 1, { ack_over: true }), W("LYX", 1, { ack_over: true })], true, "w-ord-c");
    const e = expenses().find((x) => x.id === r.decided?.withdrawals?.[0]?.expense_id);
    return all(same(e?.description, "سحب مخزن — تالف: Lyse X ×1، kit X ×1"), same(r.decided?.negatives?.map((x) => x.name), ["Lyse X", "kit X"]));
  });
  await T("«رتّب المخزن» يطوي التوائمَ بعمرها (created_at) وفي أقدم هدف — لا بترتيب المصفوفة (المسترجَعُ يُلحق بآخرها): أصلٌ بلا كلفة ⇒ ١٠٠٠ ثمّ ١٥٠٠ (لا ٣٠٠٠ ثمّ ٢٥٠٠)", async () => {
    const at = (m) => `2026-02-01T00:0${m}:00.000Z`;
    const dd = db();
    dd.products.push(
      P("TK", "ترتيب بالعمر X", 2, 0, { section_id: "secW", created_at: at(0) }), P("TD2", "ترتيب بالعمر X", 1, 3000, { created_at: at(2) }),
      P("TK2", "هدف بالعمر X", 1, 2000, { section_id: "secW", created_at: at(4) }), P("TD3", "هدف بالعمر X", 1, 4000, { created_at: at(5) }),
      // الأقدمان بآخر المصفوفة — كصفٍّ مسترجَع
      P("TD1", "ترتيب بالعمر X", 1, 1000, { created_at: at(1) }), P("TK1", "هدف بالعمر X", 1, 1000, { section_id: "secW", created_at: at(3) }));
    save(dd);
    await repo.tidyInventory();
    return all(same([avg0("TK"), stk("TK")], [1500, "4.000"]), same([avg0("TK1"), stk("TK1"), avg0("TK2"), stk("TK2")], [2500, "2.000", null, "1.000"]),
      same(["TD1", "TD2", "TD3"].map((id) => !!prod(id)), [false, false, false]));
  });
  await T("رفضُ الجرد برمزه وتلميح الخادم حرفاً (0255 stock_count_submit، 0254 stock_count_decide)", async () => {
    const cnt = (lines) => refusal(() => repo.submitStockCount(lines));
    const first = await repo.submitStockCount([{ product_id: "CNX", counted: 1.5, reason: "damaged" }]);
    const pend = countsRaw().filter((c) => c.product_id === "CNX" && c.status === "pending").map((c) => c.id);
    RCP();
    const eRcp = await refusal(() => repo.decideStockCounts(pend, true));
    OWNER();
    const reasons = [...new Set([...SQLW.matchAll(/raise exception 'count_reason'[^\n]*\n?\s*using hint = format\('([^']*)'/g)].map((m) => m[1]))];
    return all(same(first.pending, 1),
      same(await cnt([]), `count_empty|P0001|${hintW("count_empty")}`),
      same(await cnt([{ product_id: "CNX", counted: -1 }]), `count_bad_qty|P0001|${hintW("count_bad_qty")}`),
      same(await cnt([{ product_id: "CNX-nope", counted: 1 }]), `count_product_missing|P0001|${hintW("count_product_missing")}`),
      same(await cnt([{ product_id: "CNX", counted: 2 }]), `count_already_pending|P0001|${hintW("count_already_pending", "مادة جرد الفرق")}`),
      same(await cnt([{ product_id: "KEEP1", counted: 1, reason: "found" }]), `count_reason|P0001|${fmt(reasons[0] ?? "", "باقية الفرق")}`),
      same(await cnt([{ product_id: "KEEP1", counted: 100, reason: "damaged" }]), `count_reason|P0001|${fmt(reasons[1] ?? "", "باقية الفرق")}`),
      same(eRcp, `count_needs_manager|P0001|${hintW("count_needs_manager")}`),
      same(await refusal(() => repo.decideStockCounts([], true)), `count_nothing|P0001|${hintW("count_nothing")}`));
  });
}

/* المراجعةُ العدائية للجولة 2أ (SCR/demo2/rev/probe-rev.mjs على لقطة SQL الجولة الأولى بـPGlite): ما لا تصله السلاسلُ ولا المِسبار —
 * التصحيحُ بأدقّ من ٣٠ منزلة، وتحويلُ الجرد `(l->>'counted')::numeric` وbtrim سببه وملاحظته، والجردُ بالدفعات بالضبط، ومَن يشتري ويدمج
 * ويرتّب ويحذف ويسترجع (record/update_purchase 0255، tidy/restore 0253، merge 0184، delete 0146: المديرُ أو الطبيب، والمصوّرُ تردّه
 * البوّابة)، وملاحظةُ السند بنصّ jsonb. كلُّ رقمٍ وتلميحٍ هنا جوابُ الخادم المقيس. */
console.log("▸ المراجعةُ العدائية (2أ): التصحيحُ بستّ منازل بالضبط، وتحويلُ الجرد، والدفعاتُ بالضبط، والأدوار، ونصُّ jsonb");
{
  OWNER();
  const d = db();
  d.products.push(P("RV1", "مادة التصحيح الدقيق", 5, 1000), P("RC0", "جرد التحويل", 0, 1000), P("RC1", "جرد btrim", 2, 1000),
    P("RL", "جرد الدفعات الدقيق", 0.12, 1000, SUB("سرنجة", 100)),
    P("RR1", "أصل الأدوار", 1, 1000), P("RR2", "توأم الأدوار", 1, 1000), P("RR3", "حذف الأدوار", 1, 1000), P("RR4", "استرجاع الأدوار", 1, 1000),
    P("RW1", "سند ملاحظة رقم", 5, 1000), P("RW2", "سند ملاحظة كائن", 5, 1000));
  save(d);
  await T("التصحيحُ «لحد ٦ مراتب» بالضبط: ١٠⁻³¹ و٥×١٠⁻³¹ ⇒ cost_reset_bad ولا يُكتب (التقريبُ بثلاثين منزلة كان يكتبهما صفراً)", async () => all(
    same(await refusal(() => api.productCostReset("RV1", 1e-31)), `cost_reset_bad|P0001|${hintW("cost_reset_bad")}`),
    same(await refusal(() => api.productCostReset("RV1", 5e-31)), `cost_reset_bad|P0001|${hintW("cost_reset_bad")}`),
    same(prod("RV1")?.avg_cost ?? null, null)));
  await T("الجردُ بتحويل الخادم `(l->>'counted')::numeric`: null ⇒ count_bad_qty، ونصٌّ فارغ وكلمةٌ ومنطقيٌّ وكائن ⇒ count_bad_line (Number() كان يقرأ null و«» صفراً وtrue واحداً) — ولا يُكتب شيء", async () => {
    const n0 = countsRaw().length;
    const one = (counted) => refusal(() => repo.submitStockCount([{ product_id: "RC0", counted }]));
    return all(same(await one(null), `count_bad_qty|P0001|${hintW("count_bad_qty")}`), same(await one(1e50), `count_bad_qty|P0001|${hintW("count_bad_qty")}`),
      same(await one("1e400"), `count_bad_qty|P0001|${hintW("count_bad_qty")}`), same(await one("NaN"), `count_bad_qty|P0001|${hintW("count_bad_qty")}`),
      same([await one(""), await one("abc"), await one(true), await one({})], Array(4).fill(`count_bad_line|P0001|${hintW("count_bad_line")}`)),
      countsRaw().length === n0 || `${countsRaw().length} ≠ ${n0}`);
  });
  await T("  والسببُ والملاحظةُ بـbtrim (المسافاتُ وحدها): « damaged » يُقبل ويُحفظ «damaged»، والجدولةُ والسطرُ الجديد يبقيان بالملاحظة", async () => {
    const r = await repo.submitStockCount([{ product_id: "RC1", counted: 1, reason: " damaged ", note: "\tوگعت\n" }]);
    const row = countsRaw().find((c) => c.product_id === "RC1");
    return all(same(r, { matched: 0, pending: 1 }), same([row?.status, row?.reason, row?.note], ["pending", "damaged", "\tوگعت\n"]));
  });
  await T("الجردُ بالدفعات بالضبط: رصيدٌ ٠٫١٢ بدفعتَي ٠٫٠٥ و٠٫٠٧ معدودتين كما هما ⇒ «مطابقة» والدفعتان كما هما (العائمُ: ٠٫٠٥ + ٠٫٠٧ = ٠٫١٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠١ «زايدة»)", async () => {
    const lot = (id, qty, at) => ({ id, product_id: "RL", qty, received_qty: qty, expiry_date: null, received_at: at, source: "added", purchase_id: null, company_name: null, note: null });
    // دفعتا المادّة وحدهما (حارسٌ سابق كتب لها افتتاحيةً بكلّ رصيدها) — Σ الدفعات = الرصيد بالضبط كما يحفظه الخادم.
    mem.set(LOTS_KEY, JSON.stringify([...JSON.parse(mem.get(LOTS_KEY) || "[]").filter((l) => l.product_id !== "RL"),
      lot("rl-a", 0.05, "2026-01-01T00:00:00.000Z"), lot("rl-b", 0.07, "2026-01-02T00:00:00.000Z")]));
    const r = await repo.submitStockCount([{ product_id: "RL", counted: 0.05 + 0.07, lots: [{ lot_id: "rl-a", counted: 0.05 }, { lot_id: "rl-b", counted: 0.07 }] }]);
    const row = countsRaw().find((c) => c.product_id === "RL");
    const lots = JSON.parse(mem.get(LOTS_KEY) || "[]").filter((l) => l.product_id === "RL").map((l) => l.qty);
    return all(same(r, { matched: 1, pending: 0 }), same([row?.status, row?.counted_qty, row?.reason], ["matched", 0.12, null]), same(lots, [0.05, 0.07]));
  });
  await T("  والموافقةُ تطبّق فرقَ كلّ دفعةٍ بالضبط (greatest(qty + (counted − system), 0)): ٠٫٧ ⇒ ٠٫١ و٠٫١١ ⇒ ٠٫٠٢ (العائمُ ٠٫٠٩٩٩٩٩٩٩٩٩٩٩٩٩٩٩٨ و٠٫٠٢٠٠٠٠٠٠٠٠٠٠٠٠٠٠٤)، والرصيدُ ٠٫١٢", async () => {
    { const dd = db(); dd.products.push(P("RL2", "جرد الدفعتين بفرق", 0.81, 1000, SUB("سرنجة", 100))); save(dd); }
    const lot = (id, qty, at) => ({ id, product_id: "RL2", qty, received_qty: qty, expiry_date: null, received_at: at, source: "added", purchase_id: null, company_name: null, note: null });
    mem.set(LOTS_KEY, JSON.stringify([...JSON.parse(mem.get(LOTS_KEY) || "[]").filter((l) => l.product_id !== "RL2"),
      lot("rl2-a", 0.7, "2026-01-01T00:00:00.000Z"), lot("rl2-b", 0.11, "2026-01-02T00:00:00.000Z")]));
    await repo.submitStockCount([{ product_id: "RL2", counted: 0.1 + 0.02, reason: "damaged", lots: [{ lot_id: "rl2-a", counted: 0.1 }, { lot_id: "rl2-b", counted: 0.02 }] }]);
    const id = countsRaw().find((c) => c.product_id === "RL2" && c.status === "pending")?.id;
    await repo.decideStockCounts([id], true);
    const lots = JSON.parse(mem.get(LOTS_KEY) || "[]").filter((l) => l.product_id === "RL2").map((l) => l.qty);
    return all(same(lots, [0.1, 0.02]), stk("RL2") === "0.120" || stk("RL2"));
  });
  await T("  ودفعةُ الشراء مجموعُ سطورها بالضبط: سطرا ٠٫١ و٠٫٢ لمادّةٍ ⇒ دفعةٌ ٠٫٣ (العائمُ ٠٫٣٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٠٤)", async () => {
    { const dd = db(); dd.products.push(P("RL3", "دفعة الشراء الدقيقة", 0, 1000)); save(dd); }
    const pr = await repo.recordPurchase([{ product_id: "RL3", name: "دفعة الشراء الدقيقة", qty: 0.1, purchase_price: 1000, sell_price: 0 },
      { product_id: "RL3", name: "دفعة الشراء الدقيقة", qty: 0.2, purchase_price: 1000, sell_price: 0 }], { company_name: "rl3" });
    const lot = JSON.parse(mem.get(LOTS_KEY) || "[]").find((l) => l.product_id === "RL3" && l.purchase_id === pr.id);
    return same([lot?.qty, lot?.received_qty, stk("RL3")], [0.3, 0.3, "0.300"]);
  });
  await T("مَن يشتري ويعدّل ويدمج ويرتّب ويحذف ويسترجع: المديرُ أو الطبيب أو مفتاحُ المدير — الاستقبالُ «forbidden: inventory role required» قبل أيّ قراءة (والدمجُ بنفسه أيضاً)، والمصوّرُ تردّه البوّابة، ولا يُكتب شيء", async () => {
    const pu = await repo.recordPurchase([{ product_id: "RR1", name: "أصل الأدوار", qty: 1, purchase_price: 1000, sell_price: 0 }], { company_name: "rr" });
    await repo.deleteProduct("RR4");
    const snap = () => JSON.stringify({ p: db().products.map((p) => [p.id, p.stock, p.avg_cost ?? null]), pur: (db().purchases ?? []).map((x) => [x.id, x.total]), t: (db().productsTrash ?? []).map((x) => x.id) });
    const L = [{ product_id: "RR1", name: "أصل الأدوار", qty: 2, purchase_price: 1200, sell_price: 0 }];
    const s0 = snap();
    RCP();
    const rcp = [await refusal(() => repo.recordPurchase(L, {})), await refusal(() => repo.updatePurchase(pu.id, L, {})), await refusal(() => repo.mergeProducts("RR1", "RR2")),
      await refusal(() => repo.mergeProducts("RR1", "RR1")), await refusal(() => repo.tidyInventory()), await refusal(() => repo.deleteProduct("RR3")), await refusal(() => repo.restoreProduct("RR4"))];
    PHO();
    const pho = [await refusal(() => repo.recordPurchase(L, {})), await refusal(() => repo.mergeProducts("RR1", "RR2"))];
    OWNER();
    const s1 = snap();
    VET(); const vet = await refusal(() => repo.mergeProducts("RR1", "RR2"));
    RCP(); pinOn(); const pin = await refusal(() => repo.deleteProduct("RR3"));
    OWNER();
    return all(same(rcp, Array(7).fill("forbidden: inventory role required||")), same(pho, Array(2).fill(`photographer_forbidden|42501|${hintOf("photographer_forbidden")}`)),
      s1 === s0 || "تغيّر المخزن", same([vet, pin, !!prod("RR2"), !!prod("RR3")], ["ok", "ok", false, false]));
  });
  await T("  وفاتورةُ شراءٍ بلا سطور ⇒ «empty purchase» (التسجيلُ كان يكتب فاتورةً فارغة)، والتعديلُ يقولها قبل «purchase not found»", async () => {
    const n0 = (db().purchases ?? []).length;
    return all(same(await refusal(() => repo.recordPurchase([], {})), "empty purchase||"), same(await refusal(() => repo.updatePurchase("pur-nope", [], {})), "empty purchase||"),
      (db().purchases ?? []).length === n0 || "كُتبت فاتورة");
  });
  await T("ملاحظةُ السند رقماً أو كائناً بنصّ jsonb حرفاً (`l->>'note'`): ٥ ⇒ «5»، والكائنُ بمسافاته ومفاتيحُه بترتيب jsonb والرقمُ بلا أُسّ (JSON.stringify كان يكتبه بلا مسافات)", async () => {
    const a = await api.submitWaste([W("RW1", 1, { note: 5 })], false, "rv-n5");
    const b = await api.submitWaste([W("RW2", 1, { note: { cc: 1e21, b: "x", a: [1, 2.5] } })], false, "rv-no");
    return same([countRow(a.ids[0])?.note, countRow(b.ids[0])?.note], ["5", '{"a": [1, 2.5], "b": "x", "cc": 1000000000000000000000}']);
  });
}

/* =====================================================================
 * الجولة 2ب: مرآةُ جولة SQL الثانية (0252–0255 كما هبطت) قاعدةً قاعدة. كلُّ فحصٍ هنا موسومٌ «[2b]» ويفشل على مرآة الجولة 2أ:
 * التعديلُ بلا «not enough stock» (والحوضُ يأخذ ما زاد على الرصيد الموجب والباقي سالب)، والمرتجعُ الذي لا يرجّع شيئاً، وكاتبُ
 * التخطّي (override_none يسمّي مَن صفّر الحالة، ونسخةُ الربط تحمل كاتبَ أصلها)، ورابطُ السند: تلميحاتُ waste_source_bad الثلاثة
 * بترتيب الخادم (الشكل ← الفاتورة ← الدفعة) وسقفُ ١٠٠ دفعة والدفعةُ نصّاً بـ١٧ رقماً، وwaste_source_taken بموضعه (بعد الدفعات وقبل
 * «معلَّقٌ واحد»)، وsource_product عبر الحذف ← الاسترجاع والدمج. والتلميحاتُ من نصّ الهجرة نفسِه (CONSUMPTION_SQL_DIR). */
const T2 = async (name, fn) => {
  let r;
  try { r = await fn(); } catch (e) { r = `رمى: ${e?.message ?? e}${e?.hint ? ` | ${e.hint}` : ""}`; } finally { OWNER(); }
  check(`[2b] ${name}`, r === true, r === true ? "" : String(r));
};
/** كلُّ تلميحات رمزٍ بـ0254/0255 بترتيب الملفّ — لـwaste_source_bad ثلاثة: الشكل، الفاتورة، الدفعة. */
const hintsW = (code, ...args) => [...new Set([...SQLW.matchAll(new RegExp(`raise exception '${code}'[^\\n]*\\n?\\s*(?:using\\s+)?hint = (?:format\\()?\\s*(?:--[^\\n]*\\n\\s*)?'([^']*)'`, "g"))].map((m) => m[1]))].map((h) => fmt(h, ...args));
console.log("▸ [2b] جولة SQL الثانية: التعديلُ والمرتجعُ وكاتبُ التخطّي ورابطُ السند");
{
  OWNER();
  const d0 = db();
  d0.products.push(
    P("B2E", "تعديل بالحوض ب2", 0.3, 1000, { section_id: "secB2", company_id: "coB2" }), P("B2N", "مرتجع صفري ب2", 10, 100),
    P("B2Z", "مادة وصفة صفر ب2", 5, 1000), P("B2W", "مادة سند ب2", 2, 20000, SUB("مل", 20)), P("B2X", "مادة سند تحذف ب2", 2, 1000, SUB("قطعة", 10)),
    P("B2T", "توأم سند ب2", 2, 1000, SUB("قطعة", 10)), P("B2K", "أصل سند ب2", 2, 1000, SUB("قطعة", 10)), P("B2H", "مادة سند كاملة ب2", 2, 1000, SUB("قطعة", 10)),
  );
  d0.companySections = [...(d0.companySections ?? []), { id: "secB2", company_id: "coB2", name: "حوض ب2", pooled_stock: 0.5, created_at: "2026-01-01T00:00:00.000Z" }];
  save(d0);
  for (const id of ["B2E", "B2N"]) PRODUCT_LINES.add(id);
  for (const id of ["B2Z", "B2W", "B2X", "B2T", "B2K", "B2H"]) SEED.set(id, C.roundScaled(prod(id).stock, 3));
  const SB2Z = U("71"), SB2W = U("72"), SB2X = U("73"), SB2T = U("74"), SB2H = U("75");
  await addServices(svc(SB2Z, "خدمة صفر ب2", 5000), svc(SB2W, "خدمة سند ب2", 5000), svc(SB2X, "خدمة سند تحذف ب2", 5000), svc(SB2T, "خدمة توأم سند ب2", 5000),
    svc(SB2H, "خدمة سند كاملة ب2", 5000));
  for (const [s, p, q, u] of [[SB2Z, "B2Z", 1, "stock"], [SB2W, "B2W", 2, "sub"], [SB2X, "B2X", 1, "sub"], [SB2T, "B2T", 1, "sub"], [SB2H, "B2H", 1, "sub"]]) {
    await api.recipeSet(s, [{ product_id: p, qty: q, unit: u }], (await api.recipeGet(s)).fingerprint);
  }
  const pl = (pid, qty, price, sq = qty) => ({ product_id: pid, name: prod(pid).name, qty, unit_price: price, unit_cost: 5, stock_qty: sq });
  const poolOf = (id) => fx3((db().companySections ?? []).find((x) => x.id === id)?.pooled_stock);
  const restoresOf = (invId, pid) => [...new Set(evsOf(invId).filter((e) => e.product_id === pid && e.kind === "restore").map((e) => e.at_us))].sort((a, b) => a - b);
  const retOne = (inv, name) => repo.returnInvoiceItems(inv.id, [{ item_id: linesOf(inv.id).find((l) => l.name === name).id, qty: 1 }]);

  /* ── التعديل (0252 الجولة الثانية) ── */
  await T2("التعديلُ فوق الرصيد بقسمٍ له حوض: ٠٫٣ من الرصيد و٠٫٥ من الحوض والباقي (٠٫٢) تحت الصفر — كان «not enough stock»", async () => {
    const e = await sale("b2e", [pl("B2E", 0.2, 1500)]);
    const r = await code(() => repo.editInvoiceLines(e.id, editLines(e.id, () => ({ qty: 1, stock_qty: 1 })), "b2e up"));
    const l = linesOf(e.id)[0];
    return same([r, stk("B2E"), poolOf("secB2"), l?.pooled_qty, l?.stock_qty], ["ok", "-0.200", "0.000", 0.5, 1]);
  });
  vc();

  /* ── المرتجع (0253 الجولة الثانية) ── */
  const n1 = await sale("b2n", [pl("B2N", 2, 200), svcLine("خدمة بلا كمية ب2", null, 3, 1000)]);
  const nl = (name) => linesOf(n1.id).find((l) => l.name === name).id;
  await T2("مرتجعٌ مداخلُه تُقرَّب صفراً (٠٫٠٠٠٤، «0.00049» مع ٠، و٠ مع −١) ⇒ nothing to return ولا يُكتب حرف — كان يمرّ ويختم «مرتجع»", async () => {
    const s = mem.get(DB_KEY);
    const a = await code(() => repo.returnInvoiceItems(n1.id, [{ item_id: nl("مرتجع صفري ب2"), qty: 0.0004 }]));
    const b = await code(() => repo.returnInvoiceItems(n1.id, [{ item_id: nl("خدمة بلا كمية ب2"), qty: "0.00049" }, { item_id: nl("مرتجع صفري ب2"), qty: 0 }]));
    const c = await code(() => repo.returnInvoiceItems(n1.id, [{ item_id: nl("مرتجع صفري ب2"), qty: 0 }, { item_id: nl("خدمة بلا كمية ب2"), qty: -1 }]));
    return all(same([a, b, c], ["nothing to return", "nothing to return", "nothing to return"]), mem.get(DB_KEY) === s || "تغيّر المخزن");
  });
  await T2("  ومدخلٌ حقيقيٌّ بين ما لا يرجّع يرجّع (٣٤٠٠ − ١٠٠٠ = ٢٤٠٠)", async () => {
    await repo.returnInvoiceItems(n1.id, [{ item_id: nl("مرتجع صفري ب2"), qty: 0 }, { item_id: nl("مرتجع صفري ب2"), qty: 0.0004 }, { item_id: nl("خدمة بلا كمية ب2"), qty: 1 }]);
    return same(db().invoices.find((i) => i.id === n1.id).total, 2400);
  });

  /* ── كاتبُ التخطّي (0252 الجولة الثانية) ── */
  const day = (k) => new Date(Date.now() + k * 86400000).toISOString();
  let o1;
  await T2("override_none يحمل كاتبَه: الطبيبُ صفّر الحالة ⇒ created_by «v1»، والتقريرُ يسمّيه (كان بلا اسم)", async () => {
    VET();
    o1 = await sale("b2o", [svcLine("خدمة صفر ب2", SB2Z, 1, 5000, 0, { consumables: [] })]);
    OWNER();
    const k = skipsOf(o1.id);
    const rep = await api.reportConsumables(day(-1), day(1));
    const o = (rep.overrides.recent ?? []).find((x) => x.invoice_id === o1.id);
    return same([k.map((x) => `${x.note}:${x.source}:${x.created_by ?? "-"}`), o?.by_name, o?.products], [["override_none:override:v1"], "الطبيب ف", []]);
  });
  await T2("  ونسخةُ الربط (تعديلُ المدير) تحمل كاتبَ أصلها لا المعدِّل، والتقريرُ يعدّ الحالةَ مرّة", async () => {
    MGR();
    await repo.editInvoiceLines(o1.id, editLines(o1.id), "b2o resave");
    OWNER();
    const k = skipsOf(o1.id).map((x) => `${x.note}:${x.source}:${x.created_by ?? "-"}`).sort();
    const rep = await api.reportConsumables(day(-1), day(1));
    return all(same(k, ["override_none:override:v1", "override_none:relink:v1"]), same((rep.overrides.recent ?? []).filter((x) => x.invoice_id === o1.id).length, 1));
  });
  await T2("  وتخطّي جهازٍ قديم وخدمةٍ مجهولة يحمل البائع (الاستقبال «r1»)", async () => {
    RCP();
    const o2 = await sale("b2o2", [svcLine("خدمة صفر ب2", null, 1, 5000), svcLine("خدمة مجهولة ب2", U("7f"), 1, 5000)]);
    OWNER();
    return same(skipsOf(o2.id).map((x) => `${x.note}:${x.created_by ?? "-"}`).sort(), ["old_device:r1", "service_missing:r1"]);
  });
  vc();

  /* ── رابطُ السند (0254 الجولة الثانية) ── */
  const [hShape, hUnknown, hBatch] = hintsW("waste_source_bad", "مادة سند ب2");
  const wInv = await sale("b2w", [svcLine("خدمة سند ب2", SB2W, 3, 5000)]);
  await retOne(wInv, "خدمة سند ب2"); await retOne(wInv, "خدمة سند ب2");
  const [r1, r2] = restoresOf(wInv.id, "B2W");
  const WL = (pid, qty, x = {}) => W(pid, qty, { unit: "sub", ...x });
  const one = (line, ref = `b2w-${Math.random()}`) => refusal(() => api.submitWaste([line], false, ref));
  const BAD = (h) => `waste_source_bad|P0001|${h}`;
  await T2("الرابطُ بترتيب الخادم: الشكلُ (دفعاتٌ بلا فاتورة، فاتورةٌ ليست معرّفاً أو رقماً، [] و١٠١ دفعة وكسرٌ وتكرار، ومجهولةٌ بدفعةٍ غلط) بتلميح الشكل", async () => {
    const s = JSON.stringify(countsRaw());
    const ok = all(typeof r1 === "number" && typeof r2 === "number" && r2 > r1 || `${r1}|${r2}`,
      same(await one(WL("B2W", 2, { src_batches: [r1] })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: "abc" })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: 7 })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: [] })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: Array.from({ length: 101 }, (_, i) => i + 1) })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: [1.5] })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r1, String(r1)] })), BAD(hShape)),
      same(await one(WL("B2W", 2, { src_invoice: U("7e"), src_batches: [0] })), BAD(hShape)));
    return all(ok, JSON.stringify(countsRaw()) === s || "كُتب سطر");
  });
  await T2("  ثمّ الفاتورة (معرّفٌ لا تعرفه العيادة) بتلميحها، ثمّ الدفعة (١ µs زيادة، ونصٌّ بـ١٧ رقماً، ودفعةُ مادّةٍ أخرى) بتلميحها", async () =>
    all(same(await one(WL("B2W", 2, { src_invoice: U("7e") })), BAD(hUnknown)),
      same(await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r1 + 1] })), BAD(hBatch)),
      same(await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: ["99999999999999999"] })), BAD(hBatch)),
      same(await one(W("B2Z", 1, { src_invoice: wInv.id, src_batches: [r1] })), BAD(hintsW("waste_source_bad", "مادة وصفة صفر ب2")[2]))));
  const TAKEN = (n) => `waste_source_taken|P0001|${hintsW("waste_source_taken", n)[0]}`;
  let pending2;
  await T2("waste_source_taken: دفعةٌ شُطبت (سجّل وطبّق) لا تُطالَب ثانيةً — وفحصُ الدفعة قبله، وهو قبل «معلَّقٌ واحد»", async () => {
    MGR();
    await api.submitWaste([WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r1] })], true, "b2w-r1");
    RCP();
    const again = await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r1] }));
    const order = await one(WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r1, r2 + 1] }));
    pending2 = (await api.submitWaste([WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r2] })], false, "b2w-r2")).ids[0];
    MGR();
    const both = await one(WL("B2W", 4, { src_invoice: wInv.id, src_batches: [r1, r2] }));
    const whole = await one(WL("B2W", 2, { src_invoice: wInv.id }));
    return same([again, order, both, whole], [TAKEN("مادة سند ب2"), BAD(hBatch), TAKEN("مادة سند ب2"), TAKEN("مادة سند ب2")]);
  });
  await T2("  والمرفوضُ لا يمسك دفعتَه: بعد رفض سطر r2 يُعبّى r2 من جديد", async () => {
    await repo.decideStockCounts([pending2], false);
    RCP();
    const r = await api.submitWaste([WL("B2W", 2, { src_invoice: wInv.id, src_batches: [r2] })], false, "b2w-r2b");
    return same([r.pending, countRow(r.ids[0])?.source_batches], [1, [r2]]);
  });
  await T2("  والفاتورةُ كلُّها: سطرٌ منها يُمسك كلَّ دفعةٍ أقدم منه، وسطرٌ منها ثانٍ يُرفض", async () => {
    const h = await sale("b2h", [svcLine("خدمة سند كاملة ب2", SB2H, 2, 5000)]);
    await retOne(h, "خدمة سند كاملة ب2");
    const [h1] = restoresOf(h.id, "B2H");
    MGR();
    await api.submitWaste([WL("B2H", 1, { src_invoice: h.id })], true, "b2h-whole");
    return same([await one(WL("B2H", 1, { src_invoice: h.id })), await one(WL("B2H", 1, { src_invoice: h.id, src_batches: [h1] }))],
      [TAKEN("مادة سند كاملة ب2"), TAKEN("مادة سند كاملة ب2")]);
  });
  await T2("source_product: الحذفُ يُفرغ product_id والاسترجاعُ لا يعيده — والقراءةُ تسمّي المادّة، والمطالبةُ الثانية تُرفض (كانت تُقبل)", async () => {
    const x = await sale("b2x", [svcLine("خدمة سند تحذف ب2", SB2X, 2, 5000)]);
    await retOne(x, "خدمة سند تحذف ب2");
    const [x1] = restoresOf(x.id, "B2X");
    MGR();
    const id = (await api.submitWaste([WL("B2X", 1, { src_invoice: x.id, src_batches: [x1] })], true, "b2x-1")).ids[0];
    await repo.deleteProduct("B2X");
    const afterDel = (await api.invoiceConsumption([x.id]))[x.id].waste.map((w) => w.product_id);
    await repo.restoreProduct("B2X");
    const row = countRow(id);
    const afterRes = (await api.invoiceConsumption([x.id]))[x.id].waste.map((w) => w.product_id);
    RCP();
    return same([afterDel, row?.product_id, row?.source_product, afterRes, await one(WL("B2X", 1, { src_invoice: x.id, src_batches: [x1] }))],
      [["B2X"], null, "B2X", ["B2X"], TAKEN("مادة سند تحذف ب2")]);
  });
  await T2("  والدمجُ ينقل source_product كالدفتر — ولو أفرغ حذفٌ سابقٌ product_id — فالقراءةُ تقول الأصل والمطالبةُ عليه تُرفض", async () => {
    const t = await sale("b2t", [svcLine("خدمة توأم سند ب2", SB2T, 2, 5000)]);
    await retOne(t, "خدمة توأم سند ب2");
    const [t1] = restoresOf(t.id, "B2T");
    MGR();
    const id = (await api.submitWaste([WL("B2T", 1, { src_invoice: t.id, src_batches: [t1] })], true, "b2t-1")).ids[0];
    await repo.deleteProduct("B2T"); await repo.restoreProduct("B2T");
    await repo.mergeProducts("B2K", "B2T");
    MERGED.set("B2T", "B2K");
    const row = countRow(id);
    const read = (await api.invoiceConsumption([t.id]))[t.id];
    const spec = Object.values(read.items).flat().find((s) => s.product_id === "B2K");
    return same([row?.product_id, row?.source_product, read.waste.map((w) => w.product_id), !!spec, await one(WL("B2K", 1, { src_invoice: t.id, src_batches: [t1] }))],
      [null, "B2K", ["B2K"], true, TAKEN("أصل سند ب2")]);
  });
  vc();
}

/* =====================================================================
 * الجولة 3: مرآةُ جولة SQL الثالثة (0252/0254/0255 كما استقرّت) قاعدةً قاعدة، بأرقام كتلة run.sh نفسِها (t3_0252، t3_0254، t3_0255).
 * كلُّ فحصٍ موسومٌ «[3]» ويفشل على مرآة الجولة 2ب (إلا ما وُسم «تثبيت» — سلوكٌ لم يتغيّر يُثبَّت بجانب ما تغيّر):
 * by_weight لكلّ مواصفةٍ ولكلّ مادّةٍ سالبة (حيّة، مدموجة، محذوفة، ذهبت)؛ وservice_id بثلاث حالات بالبيعة والتعديل؛ وby_owner بالتقرير
 * (للكاتب لا للقارئ)؛ والعجزُ مرّةً لكلّ (فاتورة، مادّة) بآخر حالها والربطُ نقلٌ لا بيعة (التقريرُ والدفتر)؛ والمتوسّطُ الصفريُّ الصريح
 * يبقى بالمجّانيّ؛ ونصُّ السحب بالمادّة بعد الاسم؛ والتجميعُ المباشر pool_direct. والتلميحُ من نصّ الهجرة (CONSUMPTION_SQL_DIR). */
const T3 = async (name, fn) => {
  let r;
  try { r = await fn(); } catch (e) { r = `رمى: ${e?.message ?? e}${e?.hint ? ` | ${e.hint}` : ""}`; } finally { OWNER(); }
  check(`[3] ${name}`, r === true, r === true ? "" : String(r));
};
console.log("▸ [3] جولة SQL الثالثة: by_weight، وservice_id بثلاث حالات، وby_owner، والعجزُ مرّةً بآخر الحال، والمتوسّطُ الصريح، والسحب، وpool_direct");
{
  OWNER();
  const WT = { sold_by_weight: true };
  const d0 = db();
  d0.products.push(
    P("R3S", "رمل ج٣", 0.2, 2000, WT), P("R3G", "كفوف ج٣", 0.5, 1000),
    P("R3T", "شاش توأم ج٣", 5, 1000), P("R3K", "شاش أصل ج٣", 5, 1000, WT), P("R3D", "مرهم حذف ج٣", 5, 1000, WT),
    P("R3C", "قطن ج٣", 10, 1000), P("R3F", "خيط ج٣", 10, 1000),
    P("R3A", "شاش ج٥ أ", 0.5, 1000), P("R3B", "شاش ج٥ ب", 0.5, 1000), P("R3J", "شاش ج٥ ج", 0.5, 1000), P("R3E", "شاش ج٥ د", 5, 1000),
    P("R3X", "قطن ج٥ س", 5, 1000), P("R3Y", "شاش ج٥ ص", 0, 1000), P("R3W", "ضماد ج٥ ط", 0, 1000),
    P("R3M", "قطن ج٥ م", 5, 1000), P("R3N", "دواء ج٥ م", 50, 500), P("R3R", "شاش ج٥ ر", 3, 1000),
    P("R3Z1", "صفر ج٥٥", 5, 1000), P("R3Z2", "صفر تعديل ج٥٥", 5, 1000), P("R3Z3", "صفر حد ج٥٥", -5, 1000),
    P("R3Z4", "أصل صفر ج٥٥", 5, 1000), P("R3Z5", "توأم ج٥٥", 5, 1000), P("R3Z6", "أصل صفر ثان ج٥٥", 5, 1000), P("R3Z7", "توأم مجهول ج٥٥", 5, 0),
    P("R3Q", "فرق صفر ج٥٥", -2, 1000),
    P("R3P1", "سالب ج٥٥", -2, 1000, { section_id: "secR3", company_id: "coR3" }),
    P("R3P2", "مجمّع ج٥٥", 0, 1000, { pooled: true, section_id: "secR3", company_id: "coR3" }),
    P("R3P3", "سالب يبقى ج٥٥", -2, 1000, { section_id: "secR3b", company_id: "coR3" }), P("R3P4", "موجب يبقى ج٥٥", 3, 1000, { section_id: "secR3b", company_id: "coR3" }),
    P("R3W01", "kit ج٤", 0.5, 1000), P("R3W02", "Lyse ج٤", 0.5, 1000), P("R3W90", "زوج ج٤", 0.5, 1000), P("R3W91", "زوج ج٤", 0.5, 1000),
  );
  d0.companySections = [...(d0.companySections ?? []),
    { id: "secR3", company_id: "coR3", name: "قسم ج٥٥", pooled_stock: 5, created_at: "2026-01-01T00:00:00.000Z" },
    { id: "secR3b", company_id: "coR3", name: "قسم ثان ج٥٥", pooled_stock: 7, created_at: "2026-01-01T00:00:00.000Z" }];
  save(d0);
  // حفظُ الرصيد: كلُّ مستهلكٍ لا يُشترى ولا يُباع سطراً ولا يُحذف — والمدموجُ يطويه MERGED
  for (const id of ["R3S", "R3G", "R3T", "R3K", "R3C", "R3F", "R3A", "R3B", "R3J", "R3E", "R3X", "R3M", "R3R"]) SEED.set(id, C.roundScaled(prod(id).stock, 3));
  PRODUCT_LINES.add("R3N");
  const S3 = (n) => U(`3${n}`);
  await addServices(svc(S3("0"), "إيواء ج٣", 5000), svc(S3("1"), "تضميد توأم ج٣", 5000), svc(S3("2"), "دهان ج٣", 5000), svc(S3("3"), "تعقيم ج٣", 5000),
    svc(S3("4"), "تخييط ج٣", 5000), svc(S3("5"), "ضماد أ ج٣", 5000), svc(S3("6"), "ضماد ب ج٣", 5000), svc(S3("7"), "ضماد ج ج٣", 5000),
    svc(S3("8"), "ضماد د ج٣", 5000), svc(S3("9"), "تعقيم س ج٣", 5000), svc(S3("a"), "ضماد ص ج٣", 5000), svc(S3("b"), "ضماد ط ج٣", 5000),
    svc(S3("c"), "تعقيم م ج٣", 5000), svc(S3("d"), "ضماد ه ج٣", 5000), svc(S3("e"), "ضماد و ج٣", 5000));
  for (const [s, lines] of [[S3("0"), [["R3S", 0.5], ["R3G", 1]]], [S3("1"), [["R3T", 1]]], [S3("2"), [["R3D", 1]]], [S3("3"), [["R3C", 1]]], [S3("4"), [["R3F", 1]]],
    [S3("5"), [["R3A", 1]]], [S3("6"), [["R3B", 1]]], [S3("7"), [["R3J", 1]]], [S3("8"), [["R3E", 1]]], [S3("9"), [["R3X", 1]]], [S3("a"), [["R3Y", 1]]],
    [S3("b"), [["R3W", 1]]], [S3("c"), [["R3M", 1]]], [S3("d"), [["R3R", 1]]], [S3("e"), [["R3R", 1]]]]) {
    await api.recipeSet(s, lines.map(([product_id, qty]) => ({ product_id, qty, unit: "stock" })), (await api.recipeGet(s)).fingerprint);
  }
  const sl = (name, sid, qty = 1, extra = {}) => svcLine(name, sid, qty, 5000, 0, extra);
  const readOf = async (inv) => (await api.invoiceConsumption([inv.id]))[inv.id];
  const specsOf = async (inv) => Object.values((await readOf(inv)).items).flat();
  const day = (k) => new Date(Date.now() + k * 86400000).toISOString();
  const report = () => api.reportConsumables(day(-1), day(1));
  const shortOf = async (...ids) => (await report()).products.filter((p) => ids.includes(p.product_id)).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    .map((p) => `${p.name}:${p.used}:${p.short}`);
  const sf3 = (evs) => C.fromScaled(evs.reduce((s, e) => s + BigInt(e.shortfall_m), 0n), 3).toFixed(3);
  const relinkSf = (inv) => evsOf(inv.id).filter((e) => e.source === "relink").map((e) => C.fromScaled(BigInt(e.shortfall_m), 3).toFixed(3)).join(",");
  const unchanged = (inv) => repo.editInvoiceLines(inv.id, editLines(inv.id), "r3");
  const OWNERS = () => { pinOff(); as("clinic-happy-paws", "admin"); };   // حسابُ العيادة (signInClinic): معرّفُه معرّفُها — صاحبُ العيادة

  /* ── A1: by_weight ── */
  const a1 = await sale("r3-a1", [sl("إيواء ج٣", S3("0"))]);
  await T3("by_weight لكلّ مواصفة: الرملُ الموزون true والكفوفُ false (منطقيّةً لا نصّاً)، والحيُّ والعجزُ كما كانا", async () =>
    same((await specsOf(a1)).sort((a, b) => (a.product_name < b.product_name ? -1 : 1)).map((s) => `${s.product_name}:${s.by_weight}:${typeof s.by_weight}:${s.live_qty}:${s.shortfall}`),
      ["رمل ج٣:true:boolean:0.5:0.3", "كفوف ج٣:false:boolean:1:0.5"]));
  await T3("  وكلُّ مادّةٍ سالبة تقوله بجانب اسمها ورصيدها", async () =>
    same((await readOf(a1)).negatives.map((n) => `${n.name}:${n.stock}:${n.by_weight}`), ["رمل ج٣:-0.3:true", "كفوف ج٣:-0.5:false"]));
  const a1m = await sale("r3-a1m", [sl("تضميد توأم ج٣", S3("1"))]);
  await T3("  ودمجٌ: قبل الدمج مادّةُ المواصفة التوأمُ (علبة، false)، وبعده تُقرأ بالأصل الموزون true واسمُها لقطتُها", async () => {
    const before = (await specsOf(a1m)).map((s) => `${s.product_id}:${s.by_weight}`);
    await repo.mergeProducts("R3K", "R3T"); MERGED.set("R3T", "R3K");
    const after = (await specsOf(a1m)).map((s) => `${s.product_id}:${s.product_name}:${s.by_weight}`);
    return same([before, after], [["R3T:false"], ["R3K:شاش توأم ج٣:true"]]);
  });
  const a1d = await sale("r3-a1d", [sl("دهان ج٣", S3("2"))]);
  await T3("  وحذفٌ: by_weight من صورتها بالمحذوفات (true)، ومادّةٌ ذهبت كلّياً ⇒ null حاضرٌ لا غائب", async () => {
    await repo.deleteProduct("R3D");
    const inTrash = (await specsOf(a1d)).map((s) => s.by_weight);
    const s = mem.get(DB_KEY);
    const d = db(); d.productsTrash = (d.productsTrash ?? []).filter((t) => t.id !== "R3D"); save(d);
    const gone = (await specsOf(a1d)).map((x) => ("by_weight" in x ? String(x.by_weight) : "absent"));
    mem.set(DB_KEY, s);
    return same([inTrash, gone], [[true], ["null"]]);
  });
  vc();

  /* ── A2: service_id بثلاث حالات ── */
  const a2a = await sale("r3-a2a", [sl("تعقيم ج٣", null)]);
  const a2n = await sale("r3-a2n", [sl("تعقيم ج٣", null, 1, { service_id: null }), sl("تعقيم ج٣ ", null, 1, { service_id: "" })]);
  const a2u = await sale("r3-a2u", [sl("تعقيم ج٣", S3("3"))]);
  const sk = (inv) => skipsOf(inv.id).map((k) => `${k.source}:${k.note}`).sort();
  await T3("service_id: الغائبُ وحده «جهازٌ قديم»؛ وnull الصريحُ والفارغ بلا تخطٍّ ولا وصفة (والسطرُ بلا خدمة)؛ والمعرّفُ يصرف وصفتَه", async () =>
    same([sk(a2a), sk(a2n), sk(a2u), evsOf(a2a.id).length + evsOf(a2n.id).length, nano(String(evsOf(a2u.id).reduce((s, e) => s + BigInt(e.qty_n), 0n))), stk("R3C"),
      linesOf(a2n.id).map((l) => l.service_id ?? null)],
    [["none:old_device"], [], [], 0, "1.000000000", "9.000", [null, null]]));
  await T3("  والتعديلُ بلا تغيير لا يصنّف بالاسم: الغائبُ تاريخٌ بالربط، وnull بلا شيء، والمعرّفُ مربوطٌ حيٌّ؛ والتقريرُ يعدّ «جهازاً قديماً» واحداً", async () => {
    for (const inv of [a2a, a2n, a2u]) await unchanged(inv);
    const cur = new Set(linesOf(a2u.id).map((l) => l.id));
    const ev = evsOf(a2u.id).filter((e) => cur.has(e.item_id));
    const rep = await report();
    return same([sk(a2a), sk(a2n), `${nano(String(ev.reduce((s, e) => s + BigInt(e.qty_n), 0n)))}:${ev.filter((e) => e.source === "relink").length}`, stk("R3C"),
      rep.unconsumed.recent.filter((u) => [a2a.id, a2n.id, a2u.id].includes(u.invoice_id)).map((u) => u.note)],
    [["none:old_device", "relink:old_device"], [], "1.000000000:1", "9.000", ["old_device"]]);
  });
  vc();

  /* ── A3: مَن صفّر الحالة — by_owner لصاحب العيادة (الكاتب لا القارئ) ── */
  OWNERS(); const a3o = await sale("r3-a3o", [sl("تخييط ج٣", S3("4"), 1, { consumables: [] })]);
  OWNERS(); const a3p = await sale("r3-a3p", [sl("تخييط ج٣", S3("4"), 1, { consumables: [{ product_id: "R3F", qty: 2, unit: "stock" }] })]);
  VET(); const a3v = await sale("r3-a3v", [sl("تخييط ج٣", S3("4"), 1, { consumables: [] })]);
  OWNER();
  const ovOf = (rep) => rep.overrides.recent.map((z) => [z.invoice_id === a3o.id ? "o" : z.invoice_id === a3p.id ? "p" : z.invoice_id === a3v.id ? "v" : null, z])
    .filter(([lab]) => lab).sort((x, y) => (x[0] < y[0] ? -1 : 1)).map(([lab, z]) => `${lab}:${z.by_name ?? "null"}:${"by_owner" in z ? z.by_owner : "absent"}`);
  const want3 = ["o:null:true", "p:null:true", "v:الطبيب ف:false"];
  await T3("by_owner: صاحبُ العيادة (حسابُ العيادة، معرّفُه معرّفُها) صفّرها وعدّلها ⇒ true بلا اسم، والطبيبُ باسمه false — والكاتبُ بكلّ تخطٍّ وحدث", async () => {
    OWNERS();
    const r = ovOf(await report());
    return same([r, skipsOf(a3o.id).map((k) => k.created_by), skipsOf(a3v.id).map((k) => k.created_by), [...new Set(evsOf(a3p.id).map((e) => e.created_by))]],
      [want3, ["clinic-happy-paws"], ["v1"], ["clinic-happy-paws"]]);
  });
  await T3("  وقارئٌ ليس صاحبَها يرى الجوابَ نفسَه حرفاً — الطبيبُ، ومديرٌ ليس صاحبَ العيادة", async () => {
    VET(); const v = ovOf(await report());
    MGR(); const m = ovOf(await report());
    return same([v, m], [want3, want3]);
  });

  /* ── A5: العجزُ مرّةً لكلّ (فاتورة، مادّة) بآخر حالها — والربطُ نقلٌ لا بيعة ── */
  const a5a = await sale("r3-a5a", [sl("ضماد أ ج٣", S3("5"))]);
  const a5b = await sale("r3-a5b", [sl("ضماد ب ج٣", S3("6"))]);
  const a5c = await sale("r3-a5c", [sl("ضماد ج ج٣", S3("7"), 2)]);
  const a5d = await sale("r3-a5d", [sl("ضماد د ج٣", S3("8"))]);
  await unchanged(a5a); await unchanged(a5d);
  await repo.editInvoiceLines(a5b.id, editLines(a5b.id, () => ({ qty: 2 })), "r3 up");
  await repo.returnInvoiceItems(a5c.id, [{ item_id: linesOf(a5c.id)[0].id, qty: 1 }]);
  await T3("الربطُ لا يكتب عجزَ «أ» ثانيةً (٠٫٥٠٠ بحدثٍ واحد — كان ١٫٠٠٠ بحدثين)، وربطُ «ب» يقول العلبةَ المرفوعة وحدها (١٫٠٠٠ ومجموعُها ١٫٥٠٠)", async () =>
    same([`${sf3(evsOf(a5a.id))}:${evsOf(a5a.id).filter((e) => BigInt(e.shortfall_m) > 0n).length}`, `${sf3(evsOf(a5b.id))}:${relinkSf(a5b)}`, stk("R3A", "R3B", "R3J", "R3E")],
      ["0.500:1", "1.500:1.000", "-0.500|-1.500|-0.500|4.000"]));
  await T3("  والتقريرُ يعدّه مرّةً بآخر الحال: أ ٠٫٥ (لا ١)، ب ١٫٥ (لا ٢)، ج ٠٫٥ (ما رجع آخرُ ما صُرف بلا رصيد — لا ١٫٥)، د صفر", async () =>
    same(await shortOf("R3A", "R3B", "R3J", "R3E"), ["شاش ج٥ أ:1:0.5", "شاش ج٥ ب:2:1.5", "شاش ج٥ ج:1:0.5", "شاش ج٥ د:1:0"]));
  vc();
  const a5x = await sale("r3-a5x", [sl("تعقيم س ج٣", S3("9"))]);
  await sale("r3-a5x2", [sl("تعقيم س ج٣", S3("9"), 7)]);
  const a5y = await sale("r3-a5y", [sl("ضماد ص ج٣", S3("a"), 2)]);
  await repo.recordPurchase([{ product_id: "R3Y", name: "شاش ج٥ ص", qty: 10, purchase_price: 1000, sell_price: 0 }], { reference: "r3-p5y" });
  const a5w = await sale("r3-a5w", [sl("ضماد ط ج٣", S3("b"), 2)]);
  await repo.recordPurchase([{ product_id: "R3W", name: "ضماد ج٥ ط", qty: 10, purchase_price: 1000, sell_price: 0 }], { reference: "r3-p5w" });
  await T3("  (تثبيت) قبل التعديل: «ص» ٢ و«ط» ٢ و«س» ٣ (فاتورةٌ أخرى أنزلتها −٣)، والرصيدُ ٨ و٨ و−٣", async () =>
    same([await shortOf("R3X", "R3Y", "R3W"), stk("R3Y", "R3W", "R3X")], [["شاش ج٥ ص:2:2", "ضماد ج٥ ط:2:2", "قطن ج٥ س:8:3"], "8.000|8.000|-3.000"]));
  await unchanged(a5x); await unchanged(a5y);
  await repo.editInvoiceLines(a5w.id, editLines(a5w.id, () => ({ qty: 3 })), "r3 up");
  await T3("  ثمّ تعديلٌ بلا تغيير لـ«س» و«ص» ورفعُ «ط» ٢ ← ٣: حدثُ الربط بلا عجز للثلاث (كان «س» ١٫٠٠٠ والرفُّ −٣ كما هو)", async () =>
    same([relinkSf(a5w), relinkSf(a5x), relinkSf(a5y), stk("R3X", "R3Y", "R3W")], ["0.000", "0.000", "0.000", "-3.000|8.000|7.000"]));
  await T3("  والتقريرُ لا يتغيّر بتعديلٍ لم يزد شيئاً: «ص» ٢ (لا صفر — الشراءُ بعد البيعة لا يمحو عجزَها)، «ط» ٢، «س» ٣ (لا ٤ — عجزٌ لم يقع)", async () =>
    same(await shortOf("R3X", "R3Y", "R3W"), ["شاش ج٥ ص:2:2", "ضماد ج٥ ط:3:2", "قطن ج٥ س:8:3"]));
  const a5m = await sale("r3-a5m", [sl("تعقيم م ج٣", S3("c")), { product_id: "R3N", name: "دواء ج٥ م", qty: 1, unit_price: 2000, unit_cost: 500, stock_qty: 1 }]);
  await sale("r3-a5m2", [sl("تعقيم م ج٣", S3("c"), 6)]);
  await repo.editInvoiceLines(a5m.id, editLines(a5m.id, (ii) => (ii.name === "دواء ج٥ م" ? { unit_price: 2500 } : {})), "r3 price");
  await T3("  تعديلٌ يغيّر سعرَ الدواء وحده بفاتورةٍ فيها خدمة: العجزُ ٢ كما كان (لا ٣)، والربطُ بلا عجز، والرصيدُ −٢، والدواءُ ٤٩ بسعره الجديد", async () =>
    same([await shortOf("R3M"), relinkSf(a5m), stk("R3M", "R3N"), linesOf(a5m.id).find((l) => l.product_id === "R3N")?.unit_price],
      [["قطن ج٥ م:7:2"], "0.000", "-2.000|49.000", 2500]));
  const a5r = await sale("r3-a5r", [sl("ضماد ه ج٣", S3("d")), sl("ضماد و ج٣", S3("e"), 2)]);
  await sale("r3-a5r2", [sl("ضماد ه ج٣", S3("d"), 2)]);
  await repo.editInvoiceLines(a5r.id, editLines(a5r.id, (ii) => (ii.name === "ضماد ه ج٣" ? { qty: 3 } : ii.name === "ضماد و ج٣" ? { qty: 1 } : {})), "r3 swap");
  await T3("  سطران لمادّةٍ واحدة يتبادلان الكمية بتعديلٍ واحد والرفُّ سالب: عجزُ أحداث الفاتورة ١٫٠٠٠ (لا ٣)، والتقريرُ ٣ = ١ + ٢ (لا ٥)، والرصيدُ −٣", async () =>
    same([sf3(evsOf(a5r.id)), await shortOf("R3R"), stk("R3R")], ["1.000", ["شاش ج٥ ر:6:3"], "-3.000"]));
  vc();

  /* ── A6/A10: المتوسّطُ الصفريُّ الصريح لا يمحوه المجّانيّ، والفرقُ الذي يُقرَّب صفراً لم يقع ── */
  const pl3 = (pid, qty, cost) => ({ product_id: pid, name: prod(pid).name, qty, purchase_price: cost, sell_price: 2000 });
  const avg = (id) => { const a = prod(id)?.avg_cost; return a == null ? "null" : Number(a).toFixed(6); };
  await T3("صفرٌ صريح (product_cost_reset) ثمّ ٥ مجّاناً: الصفرُ يبقى صفراً والكلفةُ صفر (كانت تُمحى فترجع لسعر الشراء ١٠٠٠)، والرصيدُ ١٠", async () => {
    await api.productCostReset("R3Z1", 0);
    await repo.recordPurchase([pl3("R3Z1", 5, 0)], { reference: "r3-a6p1" });
    const c = C.stockUnitCost({ purchase_price: prod("R3Z1").purchase_price, avg_cost: prod("R3Z1").avg_cost ?? null });   // stock_unit_cost بالمليون
    return same([avg("R3Z1"), stk("R3Z1"), String(c)], ["0.000000", "10.000", "0"]);
  });
  await T3("  (تثبيت) وشراءُ ٥ بـ٨٠٠ بعده ⇒ ٨٠٠ (صفرٌ صريح ثمّ مدفوع: كما اليوم)، والرصيدُ ١٥", async () => {
    await repo.recordPurchase([pl3("R3Z1", 5, 800)], { reference: "r3-a6p2" });
    return same([avg("R3Z1"), stk("R3Z1")], ["800.000000", "15.000"]);
  });
  await T3("  وتعديلُ فاتورة الشراء مجّاناً بعد صفرٍ صريح يُبقي الصفر (١٠)، وعلى رصيدٍ يصير ٠ كذلك (فرعُ s1 ≤ ٠)", async () => {
    const p3 = await repo.recordPurchase([pl3("R3Z2", 5, 1000)], { reference: "r3-a6p3" });
    const p4 = await repo.recordPurchase([pl3("R3Z3", 5, 1000)], { reference: "r3-a6p4" });
    const was = [avg("R3Z2"), avg("R3Z3"), stk("R3Z3")];
    await api.productCostReset("R3Z2", 0); await api.productCostReset("R3Z3", 0);
    await repo.updatePurchase(p3.id, [pl3("R3Z2", 5, 0)], {});
    await repo.updatePurchase(p4.id, [pl3("R3Z3", 5, 0)], {});
    return same([was, avg("R3Z2"), stk("R3Z2"), avg("R3Z3"), stk("R3Z3")], [["1000.000000", "1000.000000", "0.000"], "0.000000", "10.000", "0.000000", "0.000"]);
  });
  await T3("  (تثبيت) والدمجُ لا يمحو صفراً صريحاً: توأمٌ معروف يعطي كلفتَه (١٠٠٠)، ومجهولٌ يُبقي الصفر", async () => {
    await api.productCostReset("R3Z4", 0); await api.productCostReset("R3Z6", 0);
    await repo.mergeProducts("R3Z4", "R3Z5"); await repo.mergeProducts("R3Z6", "R3Z7");
    return same([avg("R3Z4"), avg("R3Z6")], ["1000.000000", "0.000000"]);
  });
  await T3("  (تثبيت، A10 بـavgCost.ts) وشراءُ ١٠ بـ١٠٠٠ على −٢ بسعر ١٠٠٠: الكشفُ بلا فرق (null لا 0.00)، والمتوسّط ١٠٠٠ والرصيد ٨", async () => {
    const pu = await repo.recordPurchase([pl3("R3Q", 10, 1000)], { reference: "r3-a10" });
    return same([(db().purchaseEffects ?? []).filter((e) => e.purchase_id === pu.id).map((e) => e.cost_variance ?? null), avg("R3Q"), stk("R3Q")], [[null], "1000.000000", "8.000"]);
  });

  /* ── A7: نصُّ السحب بالبايت ثمّ المادّة — والاسمان المتساويان تفصلهما المادّة لا ترتيبُ الجرد ── */
  await T3("سندٌ يُطبَّق فوراً بأربع موادّ مُرسلةٍ بغير ترتيبها: negatives «Lyse، kit، زوج (−١٫٥)، زوج (−٠٫٥)» ونصُّ السحب «Lyse ×1، kit ×1، زوج ×2، زوج ×1»", async () => {
    MGR();
    // صفوفُ السند الواحد تتساوى بـcounted_at وتنفصل بمعرّفاتٍ عشوائية: هنا تتصاعد بترتيب الإرسال (٩١ قبل ٩٠) فلا يصيب ترتيبٌ قديم بالصدفة
    const rnd = Math.random; let k = 0.1;
    Math.random = () => (k = Math.min(k + 0.0123, 0.98));
    let r;
    try {
      r = await api.submitWaste([W("R3W91", 1, { ack_over: true }), W("R3W01", 1, { ack_over: true }), W("R3W90", 2, { ack_over: true }), W("R3W02", 1, { ack_over: true })], true, "r3-a7");
    } finally { Math.random = rnd; }
    const e = expenses().find((x) => x.id === r.decided?.withdrawals?.[0]?.expense_id);
    return same([r.decided?.approved, (r.decided?.negatives ?? []).map((n) => `${n.name}:${n.stock}:${n.product_id === "R3W90"}`), e?.description],
      [4, ["Lyse ج٤:-0.5:false", "kit ج٤:-0.5:false", "زوج ج٤:-1.5:true", "زوج ج٤:-0.5:false"], "سحب مخزن — تالف: Lyse ج٤ ×1، kit ج٤ ×1، زوج ج٤ ×2، زوج ج٤ ×1"]);
  });

  /* ── A8: التجميعُ بكتابةٍ مباشرة pool_direct — وكلُّ طريقٍ غيره يمرّ ── */
  const POOL_DIRECT = `pool_direct|P0001|${hintW("pool_direct")}`;
  const poolOf = (id) => fx3((db().companySections ?? []).find((x) => x.id === id)?.pooled_stock);
  const flag = (id) => `${stk(id)}/${!!prod(id)?.pooled}`;
  await T3("نسخةٌ قديمة تكتب pooled: true وstock: 0 لمادّةٍ عند −٢ على حوضٍ ٥ ⇒ pool_direct بتلميحه، ولا شيءَ تحرّك (−٢ معدودة، والحوضُ ٥)", async () =>
    same([await refusal(() => repo.updateProduct("R3P1", { pooled: true, stock: 0 })), flag("R3P1"), poolOf("secR3")], [POOL_DIRECT, "-2.000/false", "5.000"]));
  await T3("  وقلبٌ بلا لمس الرصيد يُرفض بأيّ رصيد: −٢ و+٣ من صاحب العيادة، و+٣ و−٢ من الطبيب — ولا شيءَ تحرّك (والحوضُ ٧)", async () => {
    const o = [await refusal(() => repo.updateProduct("R3P3", { pooled: true })), await refusal(() => repo.updateProduct("R3P4", { pooled: true }))];
    VET();
    const v = [await refusal(() => repo.updateProduct("R3P4", { pooled: true })), await refusal(() => repo.updateProduct("R3P3", { pooled: true }))];
    return same([...o, ...v, flag("R3P3"), flag("R3P4"), poolOf("secR3b")], [POOL_DIRECT, POOL_DIRECT, POOL_DIRECT, POOL_DIRECT, "-2.000/false", "3.000/false", "7.000"]);
  });
  await T3("  والمجمَّعُ يبقى مجمَّعاً بتعديلٍ مباشر (اسم)، ويُفكّ مباشرةً، ثمّ قلبُه مباشرةً ثانيةً يُرفض", async () =>
    same([await refusal(() => repo.updateProduct("R3P2", { pooled: true, name: "مجمّع ج٥٥ ٢" })), await refusal(() => repo.updateProduct("R3P2", { pooled: false })),
      await refusal(() => repo.updateProduct("R3P2", { pooled: true })), `${prod("R3P2").name}/${!!prod("R3P2").pooled}`], ["ok", "ok", POOL_DIRECT, "مجمّع ج٥٥ ٢/false"]));
  await T3("  (تثبيت) وإنشاءُ مادّةٍ مجمَّعة يمرّ، وpoolProduct تنقل −٢ كلَّها (الصفُّ صفرٌ مجمَّع والحوضُ ٣)", async () => {
    const n = await repo.createProduct({ name: "جديد مجمّع ج٥٥", barcode: null, stock: 0, purchase_price: 1000, sell_price: 0, min_stock: 0, pooled: true, section_id: "secR3", company_id: "coR3" });
    await repo.poolProduct("R3P1", "secR3");
    return same([!!prod(n.id)?.pooled, flag("R3P1"), poolOf("secR3")], [true, "0.000/true", "3.000"]);
  });
  vc();
}

console.log("▸ بابُ المستهلكات: «القراءة فقط» يمنع الكتابة لا القراءة");
{
  OWNER();
  mod.registerConfigReadOnlyChecker(() => true);
  const e = await errOf(() => api.recipeSet(S03, [{ product_id: "R08", qty: 2, unit: "sub" }], ""));
  const r = await errOf(() => api.recipeGet(S03));
  const w = await errOf(() => api.submitWaste([], false, "ref"));
  const c2 = await errOf(() => api.productCostReset("R08", null));
  mod.registerConfigReadOnlyChecker(() => false);
  check("اشتراكٌ منتهٍ: recipeSet ترمي ReadOnlyError قبل أن تصل المرآة", e?.name === "ReadOnlyError" && e?.message === "READ_ONLY", `${e?.name}|${e?.message}`);
  check("  وsubmitWaste وproductCostReset كذلك (قبل أن تصل المرآة)", w?.name === "ReadOnlyError" && c2?.name === "ReadOnlyError");
  check("  والقراءةُ تمرّ", r === null);
  await T("وبعد الاشتراك: السندُ والتصحيحُ مبنيّان (0254/0255) — سطورٌ فارغة waste_empty، والتصحيحُ يرجع صفَّه", async () =>
    all(same(await code(() => api.submitWaste([], false, "ref")), "waste_empty"), same(await api.productCostReset("R08", null), { id: "R08", avg_cost: null, purchase_price: 25000 })));
}

console.log("▸ المخزن: نصوصٌ عشرية لـBigInt لا أرقامٌ عائمة");
{
  const d = db();
  const exact = (o, keys) => keys.every((k) => o[k] == null || (typeof o[k] === "string" && /^-?\d+$/.test(o[k])));
  check("الدفتر: كلُّ مقدارٍ نصٌّ صحيح (qty_n، posted_m، value_c، …)", (d.consumption ?? []).length > 0 && d.consumption.every((e) => exact(e, ["per_qty_m", "per_div_m", "unit_cost_u", "per_value_c", "line_qty_m", "qty_n", "posted_m", "value_c", "shortfall_m"])));
  check("  والمرحَّلُ والوصفةُ والمتخطّى كذلك", Object.values(d.stockCarry ?? {}).every((k) => exact(k, ["carry_n", "ext_in_n", "ext_out_m"]))
    && (d.serviceRecipes ?? []).every((r) => exact(r, ["qty_m"])) && (d.consumptionSkips ?? []).every((k) => exact(k, ["qty_m", "line_qty_m"])));
  check("  ولا قيمةَ عائمة بالرصيد: كلُّ رصيدٍ بثلاث منازل بالضبط", d.products.every((p) => Number.isFinite(Number(p.stock)) && C.fromScaled(C.roundScaled(p.stock, 3), 3) === Number(p.stock)));
  check("  ولا بالمتوسّط: كلُّ avg_cost فارغٌ أو ≥ ٠ بستّ منازل بالضبط (numeric(24,6))", d.products.every((p) => p.avg_cost == null
    || (Number(p.avg_cost) >= 0 && C.fromScaled(C.roundScaled(p.avg_cost, 6), 6) === Number(p.avg_cost))));
}

console.log(`\n${fails ? "✗" : "✓"} consumption-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
