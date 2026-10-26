/* ============================================================================
 * نافذةُ تعديل الطلب/الفاتورة (DeliveryEditDialog) تسقّف الزيادةَ **برصيد الكاشير نفسه** — react-mini على الشِّفرة الحقيقية.
 *
 * الكاشيرُ يبيع ويسقّف السطرَ بمعادلةٍ واحدة (src/lib/sellable.ts sellableRow: الصفُّ + حوضُ القسم إن كان موجباً)، والنافذةُ تمنع
 * الحفظَ حين تزيد الحاجةُ الإضافية للمادّة (المسحوبُ الجديد − القديم) على «المتاح». كانت تجمع الحوضَ **بإشارته**، والحوضُ صار يحفظ
 * إشارتَه منذ 0253 (طيُّ مادّةٍ سالبة للحوض) — فحوضٌ −٢ تحت صفٍّ ٣ قال «المتوفر من X: 1 فقط» ومنع رفعَ سطرٍ ١ ⇒ ٣ يبيعه الكاشير
 * (رصيدُه ٣)، وصفٌّ صفرٌ بحوضٍ سالب قال «المتوفر -2». مقيسٌ (تدقيقُ r3): الكاشيرُ ٣ والنافذةُ ١.
 *
 *   أ) المتاحُ = رصيدُ الكاشير، يُحسب هنا من sellable.ts الحقيقيّة (sellableRows) لا من رقمٍ مكتوب: الرفعُ ضمنه يُحفظ بكميته، وفوقه
 *      يُمنع (الحفظُ مقفول، ولا نداء) ويُقال بالمتاح نفسِه — بالحوض السالب والصفر والموجب، وبلا قسم؛ وقائمةُ «أضف صنفاً» تقول
 *      «متوفر N» بالرقم نفسه.
 *   ب) **على الشِّفرة القديمة**: DELIVERY_EDIT_SRC=<نسخةٌ قديمة> يحزم منها بلا طفرات، ويشترط أن يسقط كلُّ فحصٍ جديد ويمرّ القديم.
 *   ج) الطفرات: كلٌّ يجب أن تُسقط فحصَها (طفرةٌ لا تنطبق حرفاً واحداً على المصدر تُسقط الفحصَ كلَّه).
 *
 *   node scripts/delivery-edit-stock-test.mjs
 *   DELIVERY_EDIT_SRC=<قديم.tsx> node scripts/delivery-edit-stock-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const ROOT = process.cwd();
const D = "src/components/retail/DeliveryEditDialog.tsx";
const FROM = process.env.DELIVERY_EDIT_SRC || D;
const OLD = FROM !== D;
if (OLD) console.log(`   (المصدر: ${FROM} — بلا طفرات، وكلُّ فحصٍ جديد يجب أن يسقط)`);
const J = (x) => JSON.stringify(x);

/* ---- متصفّحٌ بالحدّ الأدنى (utils تقرأ التخزين) ---------------------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window ??= { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };

/* ---- البدائل (كـreversal-notice-guard: النصُّ الافتراضيّ بالشِّفرة، والمستودعُ بديلٌ يسجّل ما يصله) ---------- */
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); const s = typeof d === "string" ? d : (opt.defaultValue ?? k); return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); }`;
const icons = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "lucide-react": icons.map((k) => `export const ${k} = () => null;`).join("\n"),
  "@/lib/sounds": "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n;",
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", { ...p, disabled: !!(p.disabled || loading) }, children);
    export const useToast = () => ({ success: (m) => globalThis.__T.toasts.push(["success", m]), error: (m) => globalThis.__T.toasts.push(["error", m]) });`,
  "@/components/Modal": `import { createElement } from "react";
    export const Modal = ({ open, onClose, title, children }) => (open ? createElement("x-Modal", { "data-modal": String(title ?? ""), onClose }, children) : null);`,
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => globalThis.__T.repo[k] });",
  "@/lib/settings": "export const getDialCode = () => '964';",
  "@/lib/errors": "export const describeDbError = (e) => String(e?.message ?? e);",
  "@/hooks/useWaAfterSave": "export const useWaAfterSave = () => async () => {};",
  "@/lib/phone": "export const waNumber = (p) => p;",
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load) => lazy(load);`,
  "@/components/LoadBoundary": "export const LoadBoundary = ({ children }) => children;",
  "@/components/retail/ConsumablesSheet": "export function ConsumptionNotice() { return null; } export default function S() { return null; }",
};

/** يحزم النافذةَ (أو طفرةً منها) مع sellable.ts الحقيقيّة والمُرسِم — نسخةُ React واحدة. */
async function build(mut = null) {
  let src = readFileSync(FROM, "utf8").replace(/\r\n/g, "\n");
  if (mut) {
    const i = src.indexOf(mut.from);
    if (i < 0 || src.indexOf(mut.from, i + 1) >= 0) throw new Error(`الطفرة لا تنطبق مرّةً واحدة بالضبط: ${mut.from}`);
    src = src.slice(0, i) + mut.to + src.slice(i + mut.from.length);
  }
  const built = await esbuild.build({
    stdin: {
      contents: [
        `export { DeliveryEditDialog } from "./${D}";`,
        'export { sellableRows } from "./src/lib/sellable.ts";',
        'export { mount } from "./scripts/react-mini-host.js";',
        'export * as React from "react";',
      ].join("\n"),
      resolveDir: ROOT, sourcefile: "delivery-edit-stock-entry.tsx", loader: "tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "delivery-edit-stock",
      setup(b) {
        b.onLoad({ filter: /[\\/]src[\\/]components[\\/]retail[\\/]DeliveryEditDialog\.tsx$/ }, () => ({ contents: src, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => (Object.prototype.hasOwnProperty.call(STUB, a.path) ? { path: a.path, namespace: "des-stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "des-stub" }, (a) => ({ contents: STUB[a.path], loader: "jsx", resolveDir: ROOT }));
      },
    }],
  });
  const dir = mkdtempSync(path.join(tmpdir(), "delivery-edit-stock-"));
  const file = path.join(dir, "ui.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  try { return await import(pathToFileURL(file).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ---- البيانات: فاتورةٌ بسطر مادّةٍ واحد (١ علبة) — والمادّةُ بقسمٍ حوضُه يتبدّل بين الحالات ------------------ */
const NAME = "PROD-FOOD";
const product = (stock, section) => ({ id: "p1", name: NAME, barcode: null, alt_codes: [], stock, pooled: false, section_id: section, sold_by_weight: false,
  has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null, sell_price: 30, purchase_price: 20 });
const invoice = { id: "inv-d", status: "paid", total: 30, subtotal: 30, discount: 0, amount_paid: 0, payment_method: "cash", payment_details: [], created_at: "2026-11-01T10:00:00.000Z" };
const item = { id: "it-p", invoice_id: "inv-d", name: NAME, product_id: "p1", service_id: null, qty: 1, unit_price: 30, line_total: 30, stock_qty: 1, unit_cost: 20, unit_label: null, barcode: null };
const flush = async () => { for (let i = 0; i < 10; i++) await new Promise((r) => setImmediate(r)); };

/** يفتح النافذةَ على مادّةٍ رصيدُ صفّها `stock` وحوضُ قسمها `pool` (أو بلا قسم)، ويرفع السطرَ ١ ⇒ `to`، ثمّ «حفظ التعديل» إن انفتح:
 *  جملُ النقص، وهل الحفظُ مقفول، وما وصل editInvoiceLines (الاسم، الكمية، المسحوب)؛ و`search`: «متوفر N» بقائمة «أضف صنفاً». */
async function edit(M, { stock, pool, section = "s1", to = 1, search = false }) {
  globalThis.__T = { toasts: [], edits: [], repo: {
    listInvoiceItems: async () => [item], listProducts: async () => [product(stock, section)],
    listCompanySections: async () => (section ? [{ id: section, name: "قسم", company_id: "c1", pooled_stock: pool }] : []),
    editInvoiceLines: async (id, lines) => { globalThis.__T.edits.push({ id, lines }); return { ...invoice, total: 30 * to }; },
  } };
  const ui = M.mount(M.React.createElement(M.DeliveryEditDialog, { order: null, invoice, courier: null, onClose: () => {}, onSaved: () => {} }));
  await flush();
  const within = (root, attr) => { const out = []; const walk = (n) => { if (n.props && attr in n.props) out.push(n); n.children.forEach(walk); }; if (root) walk(root); return out; };
  const row = ui.findAll("data-dline")[0];
  for (let q = 1; q < to; q++) { const plus = within(row, "data-dplus")[0]; ui.click(plus); await flush(); }
  const shortage = ui.all().filter((n) => n.type === "p" && ui.text(n).startsWith("المتوفر من")).map((n) => ui.text(n));
  const save = ui.all().find((n) => n.type === "button" && ui.text(n) === "حفظ التعديل");
  const saveDisabled = !!save?.props.disabled;
  let listed = null;
  if (search) {
    const input = ui.find("data-dsearch");
    input.props.onChange({ target: { value: "PROD" } }); await flush();
    listed = ui.findAll("data-dadd").map((n) => ui.text(n));
  } else if (save && !saveDisabled) { ui.click(save); await flush(); }
  const saved = globalThis.__T.edits.map((e) => e.lines.map((l) => [l.name, l.qty, l.stock_qty]));
  const errors = ui.errors.map(String);
  ui.unmount();
  return { shortage, saveDisabled, saved, listed, errors };
}

/* ---- الحالات: كلٌّ مفتاحُه، ونصُّه، وشرطُه على ما رُسم — والمتاحُ المتوقَّع من sellable.ts الحقيقيّة ------------- */
/** رصيدُ الكاشير لهذه المادّة كما يحسبه الكاشير نفسُه (قائمةُ البيع وسؤالُ الخادم يمرّان منها). */
const tillOf = (M, stock, pool, section = "s1") => M.sellableRows([product(stock, section)], section ? [{ id: section, pooled_stock: pool }] : [])[0].stock;
const short = (n) => [`المتوفر من ${NAME}: ${n} فقط`];
const CASES = {
  async negPool(M, ok) {
    const till = tillOf(M, 3, -2);
    const up = await edit(M, { stock: 3, pool: -2, to: 3 });
    ok("negPool.raise", `حوضٌ −٢ تحت صفٍّ ٣ (الكاشيرُ ${till}): رفعُ السطر ١ ⇒ ٣ يُحفظ بكميته — كانت «المتوفر 1 فقط» والحفظُ مقفول`,
      till === 3 && up.shortage.length === 0 && !up.saveDisabled && J(up.saved) === J([[[NAME, 3, 3]]]), J({ till, ...up }));
    const over = await edit(M, { stock: 3, pool: -2, to: 5 });
    ok("negPool.cap", `وفوق رصيد الكاشير (١ ⇒ ٥، والحاجةُ ٤ فوق ${till}): يُمنع ويُقال بالمتاح نفسِه «المتوفر من ${NAME}: ${till} فقط» — بلا نداء`,
      J(over.shortage) === J(short(till)) && over.saveDisabled && over.saved.length === 0, J(over));
    const zero = await edit(M, { stock: 0, pool: -2, to: 2 });
    ok("negPool.zeroRow", `صفٌّ صفر بحوضٍ −٢ (الكاشيرُ ${tillOf(M, 0, -2)}): «المتوفر من ${NAME}: 0 فقط» — لا «-2»`,
      tillOf(M, 0, -2) === 0 && J(zero.shortage) === J(short(0)) && zero.saveDisabled && zero.saved.length === 0, J(zero));
    const list = await edit(M, { stock: 3, pool: -2, search: true });
    ok("negPool.search", `وقائمةُ «أضف صنفاً» تقول «متوفر ${till}» برصيد الكاشير — لا «متوفر 1»`,
      list.listed?.length === 1 && list.listed[0].includes(`متوفر ${till}`) && !list.listed[0].includes("متوفر 1"), J(list.listed));
    return [...up.errors, ...over.errors, ...zero.errors, ...list.errors];
  },
  async otherPools(M, ok) {
    const z = await edit(M, { stock: 3, pool: 0, to: 3 }), zOver = await edit(M, { stock: 3, pool: 0, to: 5 });
    ok("zeroPool", `حوضٌ صفر: ١ ⇒ ٣ يُحفظ، و١ ⇒ ٥ «المتوفر من ${NAME}: ${tillOf(M, 3, 0)} فقط»`,
      J(z.saved) === J([[[NAME, 3, 3]]]) && J(zOver.shortage) === J(short(tillOf(M, 3, 0))) && zOver.saveDisabled, J({ z, zOver }));
    const p = await edit(M, { stock: 3, pool: 2, to: 6 }), pOver = await edit(M, { stock: 3, pool: 2, to: 7 });
    ok("posPool", `حوضٌ +٢ (الكاشيرُ ${tillOf(M, 3, 2)}): ١ ⇒ ٦ يُحفظ (الحاجةُ ٥ = المتاح)، و١ ⇒ ٧ «المتوفر من ${NAME}: ${tillOf(M, 3, 2)} فقط»`,
      tillOf(M, 3, 2) === 5 && J(p.saved) === J([[[NAME, 6, 6]]]) && J(pOver.shortage) === J(short(5)) && pOver.saveDisabled, J({ p, pOver }));
    const n = await edit(M, { stock: 3, pool: 0, section: null, to: 5 });
    ok("noSection", `بلا قسم: الصفُّ وحده — ١ ⇒ ٥ «المتوفر من ${NAME}: 3 فقط»`, J(n.shortage) === J(short(3)) && n.saveDisabled, J(n));
    const pl = await edit(M, { stock: 3, pool: 2, search: true });
    ok("posPool.search", "وقائمةُ «أضف صنفاً» بحوضٍ +٢ «متوفر 5»", pl.listed?.length === 1 && pl.listed[0].includes("متوفر 5"), J(pl.listed));
    return [...z.errors, ...zOver.errors, ...p.errors, ...pOver.errors, ...n.errors, ...pl.errors];
  },
};
/** الفحوصُ الجديدة (تسقط على الشِّفرة القديمة) ← حالتُها؛ والباقي حرّاسُ رجوعٍ يمرّون عليها عمداً (طفراتُها تُثبت أنها تحرس). */
const NEW_KEYS = { "negPool.raise": "negPool", "negPool.cap": "negPool", "negPool.zeroRow": "negPool", "negPool.search": "negPool" };
const REGRESSION_KEYS = { zeroPool: "otherPools", posPool: "otherPools", noSection: "otherPools", "posPool.search": "otherPools" };

async function runAll(M, names = Object.keys(CASES)) {
  const out = [];
  for (const name of names) {
    const mine = [];
    const ok = (key, label, cond, detail = "") => mine.push({ key, scenario: name, label, ok: !!cond, detail });
    try {
      const errors = await CASES[name](M, ok);
      if (errors?.length) mine.push({ key: `${name}.render`, scenario: name, label: `${name}: بلا خطأ رسم`, ok: false, detail: errors.join(" | ") });
    } catch (e) {
      mine.push({ key: `${name}.threw`, scenario: name, label: `${name}: رمى`, ok: false, detail: String(e?.stack ?? e).split("\n").slice(0, 3).join(" ") });
    }
    out.push(...mine);
  }
  return out;
}

let fails = 0, passes = 0;
const say = (good, label, detail = "") => {
  if (good) { passes++; console.log(`   ✓ ${label}`); } else { fails++; console.error(`   ✗ ${label}${detail ? ` — ${detail}` : ""}`); }
};

console.log(OLD ? "▸ ب) الشِّفرةُ القديمة (المصدرُ البديل)" : "▸ أ) الشِّفرةُ الحقيقية");
const real = await build();
const results = await runAll(real);
const scenarioOf = new Map(results.map((r) => [r.key, r.scenario]));
const caughtOn = (got, k, scen) => got.some((r) => r.key === k && !r.ok) || (!got.some((r) => r.key === k) && got.some((r) => !r.ok && r.scenario === scen));

if (OLD) {
  // ما رسمه القديمُ يُطبع مع كلّ فحصٍ سقط — الدليلُ الأحمر بنصّه («المتوفر 1 فقط»، والحفظُ مقفول)، لا علامةٌ وحدها.
  for (const r of results) console.log(`   ${r.ok ? "✓" : "·"} ${r.label}${r.ok ? "" : ` — ${r.detail}`}`);
  let missed = 0;
  for (const [k, scen] of Object.entries(NEW_KEYS)) { const c = caughtOn(results, k, scen); if (!c) missed++; console.log(`   ${c ? "✓" : "✗"} ${k}: ${c ? "يسقط على القديم" : "يمرّ على القديم — لا يحرس التغيير"}`); }
  const oldBad = results.filter((r) => !(r.key in NEW_KEYS) && !r.ok);
  console.log(`   حرّاسُ الرجوع على القديم: ${results.filter((r) => r.key in REGRESSION_KEYS && r.ok).length}/${Object.keys(REGRESSION_KEYS).length} تمرّ${oldBad.length ? ` — سقط: ${oldBad.map((r) => r.key).join(", ")}` : ""}`);
  console.log(missed || oldBad.length ? `\n✗ delivery-edit-stock-test (قديم): ${missed} فحصاً جديداً يمرّ، و${oldBad.length} غيرُه يسقط` : `\n✓ delivery-edit-stock-test (قديم): كلُّ الفحوص الجديدة (${Object.keys(NEW_KEYS).length}) تسقط، وكلُّ حرّاس الرجوع تمرّ`);
  process.exit(missed || oldBad.length ? 1 : 0);
}
for (const r of results) say(r.ok, r.label, r.detail);
const stale = Object.entries({ ...NEW_KEYS, ...REGRESSION_KEYS }).filter(([k, scen]) => scenarioOf.get(k) !== scen).map(([k]) => k);
say(stale.length === 0, `NEW_KEYS (${Object.keys(NEW_KEYS).length}) وREGRESSION_KEYS (${Object.keys(REGRESSION_KEYS).length}) فحوصٌ موجودة بحالاتها`, stale.join(","));

/* ج) الطفرات: كلُّ واحدةٍ تكسر ما يحرسه فحصٌ مسمّى — ويجب أن يسقط. */
const OLD_SUM = "r3((p.stock || 0) + (p.section_id ? (pools.get(p.section_id) ?? 0) : 0))";
const MUTANTS = [
  { from: "const availOf = (p: Product): number => r3(sellableRow(p, p.section_id ? (pools.get(p.section_id) ?? 0) : 0).stock || 0);",
    to: `const availOf = (p: Product): number => ${OLD_SUM};`, breaks: ["negPool.raise", "negPool.cap", "negPool.zeroRow", "negPool.search"], why: "الحوضُ بإشارته (المعادلةُ القديمة)" },
  { from: "      const avail = availOf(p);\n      if (extra > avail + 0.0005)", to: `      const avail = ${OLD_SUM};\n      if (extra > avail + 0.0005)`,
    breaks: ["negPool.raise", "negPool.cap", "negPool.zeroRow"], why: "حارسُ الحفظ بالمعادلة القديمة والقائمةُ برصيد الكاشير" },
  { from: "                    const avail = availOf(p);\n", to: `                    const avail = ${OLD_SUM};\n`, breaks: ["negPool.search"], why: "«متوفر N» بالمعادلة القديمة والحارسُ برصيد الكاشير" },
  { from: "sellableRow(p, p.section_id ? (pools.get(p.section_id) ?? 0) : 0)", to: "sellableRow(p, 0)", breaks: ["posPool", "posPool.search"], why: "الحوضُ الموجب لا يُضاف (الكاشيرُ يبيع منه)" },
  { from: "if (extra > avail + 0.0005) out.push", to: "if (extra > avail + 1.0005) out.push", breaks: ["negPool.cap", "zeroPool", "noSection"], why: "الحارسُ يسمح بعلبةٍ فوق المتاح" },
];
console.log("▸ ج) الطفرات — كلٌّ يجب أن يُسقط فحصَه");
for (const m of MUTANTS) {
  const unknown = m.breaks.filter((k) => !scenarioOf.has(k));
  if (unknown.length) { say(false, `طفرة «${m.why}»: مفاتيحُها موجودة`, unknown.join(",")); continue; }
  let M2;
  try { M2 = await build(m); } catch (e) { say(false, `طفرة «${m.why}» تنطبق وتُحزم`, String(e?.message ?? e).split("\n")[0]); continue; }
  const got = await runAll(M2, [...new Set(m.breaks.map((k) => scenarioOf.get(k)))]);
  const caught = m.breaks.filter((k) => caughtOn(got, k, scenarioOf.get(k)));
  say(caught.length === m.breaks.length, `طفرة «${m.why}» يمسكها ${m.breaks.join(" و")}`, `مُسك: ${caught.join(",") || "∅"}`);
}
console.log(fails ? `\n✗ delivery-edit-stock-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ delivery-edit-stock-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
