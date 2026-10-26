/* ============================================================================
 * متوسّطُ الكلفة بنموذج المادة، وقيمةُ المخزون بكلفة الخادم (0255) — بالسلوك لا بالنصّ.
 *
 * قرارُ المالك: الكلفةُ = المتوسّطُ المتحرّك من فواتير الشراء، و«سعر الشراء» يبقى آخرَ سعر. فالخادمُ يكلّف
 * بـstock_unit_cost(p) = greatest(coalesce(avg_cost, purchase_price, 0), 0)، والشاشاتُ تقول الشيءَ نفسَه:
 *   أ) AvgCostNote مرسوماً (react-mini): لا شيءَ لمن لا يرى الكلفة ولا على جهازٍ مقفول؛ «متوسط الكلفة: …» أو
 *      «الكلفة = سعر الشراء …»؛ والمديرُ وحده يصحّح — يرسل ما كتبه بالضبط أو null، والرفضُ يُقال بنصّه.
 *   ب) نموذجُ المادة (Inventory.tsx مرسوماً): الحلقةُ لمادّةٍ قائمة وحدها — لا بالإنشاء ولا بتعديل المجموعة —
 *      ولمن يرى الكلفة وحده؛ والحفظُ والإنشاءُ لا يرسلان avg_cost أبداً (الخادمُ يرفضه: avg_cost_frozen).
 *   ج) الحلقةُ (ProductMovements.tsx): page(() => import(AvgCostNote), ["avgc"]) داخل LoadBoundary + Suspense،
 *      و«أعد المحاولة» تصنع قطعةً جديدة؛ ومالكُ avgc لا يُستورد ثابتاً ولا يقرأ نطاقَه غيرُه (checkOwned).
 *   د) حركاتُ المادة: «مستهلكات» و«مستهلكات — إرجاع» (0252)، وسندُ التلف (0254) يُطابَق بما رحّله.
 *   هـ) سجلُّ الحركات: «المستهلكات» بنصّ الوصفة كاملاً (service_recipe_set، __changed.recipe)، و«متوسط الكلفة»
 *      (كلُّ شراءٍ وتصحيحٍ يكتب avg_cost) و«الكلفة» (الوصفةُ تصفّر كلفةَ الخدمة) بأسمائها لا باسم العمود.
 *   و) قيمةُ المخزون بالدوالّ الحقيقية وبأرقامٍ محسوبةٍ باليد لا بنسخةٍ من الصيغة: Inventory وcountPick =
 *      Σ max(stock,0) × max(avg_cost ?? purchase_price ?? 0, 0). وموضعان يبقيان بسعر الشراء لأن ما يُجمع معهما
 *      بسعر الشراء: فحصُ المخزن (صفوفُ الخادم 0245 — الحصّةُ لا تتجاوز ١٠٠٪، والأساسُ يُقارَن بآخر تعريفٍ لها)،
 *      وكشفُ الإرجاع (سطورُه المطبوعة بسعر الشراء تجمع مجموعَها).
 *   ز) والفحصُ ليس فارغاً: كلُّ طفرةٍ (بوّابةٌ تُشال، مديرٌ للجميع، رقمٌ بلا فحص، رفضٌ يُبلع، null يصير صفراً،
 *      المتوسّطُ يُترك لسعر الشراء…) تُسقط فحصاً على الأقلّ — وطفرةٌ لم تجد نصَّها تفشل بصوت.
 *
 * المفاتيحُ (avgc.*، act.f.recipe) تُقرأ من src/i18n؛ وقبل دمج قطعة الترجمة: `--i18n <قطعة.json>` يضعها فوقها.
 *
 *   node scripts/avg-cost-note-test.mjs [--i18n <fragment.json>]
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, readdirSync, statSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import vm from "node:vm";
import { checkOwned } from "./i18n-owned-guard.mjs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
/** مُحصٍ صامت لجولات الطفرات: يعدّ ما سقط ولا يطبع. */
const counter = () => { const c = { n: 0, names: [] }; c.ck = (name, cond) => { if (!cond) { c.n++; c.names.push(name); } }; return c; };
const J = (x) => JSON.stringify(x);
const has = (o, k) => !!o && Object.prototype.hasOwnProperty.call(o, k);
const near = (a, b) => typeof a === "number" && Math.abs(a - b) < 1e-6;
/** طفرةٌ نصّية لا تمرّ صامتةً إن لم تجد نصَّها (وإلا صار «يُمسكها» كذباً). */
const swap = (src, from, to) => {
  if (!src.includes(from)) throw new Error(`الطفرة لم تجد نصَّها: ${from.slice(0, 80)}`);
  return src.split(from).join(to);
};
const SRC = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
/** React على Node يجدول الأثرَ المؤجَّل بـsetImmediate: تفريغُ طابوره يكفي — وsettle() (setTimeout) بطيءٌ بمؤقّت ويندوز. */
const flush = async () => { for (let i = 0; i < 12; i++) await new Promise((r) => setImmediate(r)); };

/* ---- متصفّحٌ بالحدّ الأدنى (نفسُ ترتيب inventory-cas-test) ---------------------- */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? {
  localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  setTimeout, clearTimeout,
};
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, getElementById: () => null,
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/* ---- القاموس: src/i18n، وفوقه قطعةٌ لم تُدمج بعد (--i18n) ------------------------- */
const argAt = process.argv.indexOf("--i18n");
const overlay = argAt > 0 ? JSON.parse(readFileSync(process.argv[argAt + 1], "utf8")) : null;
const merge = (a, b) => {
  if (!b) return a;
  const out = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = v && typeof v === "object" && !Array.isArray(v) ? merge(a?.[k] ?? {}, v) : v;
  return out;
};
const DICT = {
  ar: merge(JSON.parse(readFileSync("src/i18n/ar.json", "utf8")), overlay?.ar),
  en: merge(JSON.parse(readFileSync("src/i18n/en.json", "utf8")), overlay?.en),
};
const pick = (d) => ({ avgc: d.avgc, act: d.act, mv: d.mv, common: d.common, errors: d.errors, pos: { cat: d.pos?.cat } });
/** ترجمةٌ بالقاموس العربيّ (والافتراضيُّ للغائب) مع تعويض {{…}} — كما يرسمها i18next. */
const tStub = (dict) => `
  const D = ${JSON.stringify(pick(dict))};
  const get = (k) => k.split(".").reduce((o, p) => (o && typeof o === "object" ? o[p] : undefined), D);
  const T = (k, d, x) => {
    const o = d && typeof d === "object" ? d : x && typeof x === "object" ? x : {};
    let s = get(k);
    if (typeof s !== "string") s = typeof d === "string" ? d : (o.defaultValue ?? k);
    return s.replace(/\\{\\{(\\w+)\\}\\}/g, (_, v) => (o[v] == null ? "" : String(o[v])));
  };
  export const useTranslation = () => ({ t: T, i18n: { language: "ar" } });
  export default {};`;
const I18NEXT = "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;";
const SOUNDS = "const n = () => {}; export const playTap = n, playSuccess = n, playWarning = n, playDoseGiven = n, playAchievement = n, playError = n;";
const UI = `import { createElement, forwardRef } from "react";
  export const Button = forwardRef(({ children, leftIcon, rightIcon, loading, variant, size, ...p }, _ref) => createElement("x-Button", { ...p, disabled: !!(p.disabled || loading) }, children));
  export const Skeleton = () => null;
  export const Badge = ({ children, ...p }) => createElement("x-Badge", p, children);
  export const Dialog = ({ open, title, description, footer, children }) => (open ? createElement("x-Dialog", { title, description }, children, footer) : null);
  export const useToast = () => new Proxy({}, { get: () => () => {} });`;

/* ---- الحزم: المكوّنُ الحقيقيّ من المصدر، وكلُّ ما حوله بديل، وطفرةٌ اختيارية على ملفٍّ بعينه ---- */
const pathRe = (rel) => new RegExp(`[\\\\/]${rel.split("/").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[\\\\/]")}$`);
let ICONS = null;
async function importBuilt(built, tag) {
  const dir = mkdtempSync(join(tmpdir(), `avg-cost-${tag}-`));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}
async function bundle(tag, entry, { stubs = {}, edits = [] } = {}) {
  if (!ICONS) ICONS = Object.keys(await import("lucide-react")).filter((k) => /^[A-Z]\w*$/.test(k));
  const map = { "lucide-react": `const I = () => null; ${ICONS.map((k) => `export const ${k} = I;`).join("\n")}`, ...stubs };
  const built = await esbuild.build({
    stdin: { contents: `${entry}\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), sourcefile: `avg-cost-${tag}.tsx`, loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "avg-cost-stubs",
      setup(b) {
        b.onResolve({ filter: /.*/ }, (a) => (has(map, a.path) ? { path: a.path, namespace: "stub" } : undefined));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path], loader: "jsx", resolveDir: process.cwd() }));
        for (const { file, edit } of edits) {
          b.onLoad({ filter: pathRe(file) }, (a) => ({ contents: edit(SRC(a.path)), loader: a.path.endsWith(".tsx") ? "tsx" : "ts" }));
        }
      },
    }],
  });
  return importBuilt(built, tag);
}

/* ── ٠) المفاتيح: ما يقرؤه المكوّنُ موجودٌ بالقاموسين، وافتراضيُّه العربيُّ هو نصُّه ─────────────── */
const NOTE_FILE = "src/components/inventory/AvgCostNote.tsx";
const NOTE_SRC = SRC(NOTE_FILE);
console.log("▸ ٠) نطاقُ avgc وact.f.recipe بالقاموسين، والنصوصُ الافتراضية نفسُها");
{
  const used = [...NOTE_SRC.matchAll(/t\("avgc\.(\w+)",\s*(?:"([^"]*)"|\{[^}]*?defaultValue:\s*"([^"]*)")/g)].map((m) => [m[1], m[2] ?? m[3]]);
  const keys = (o) => Object.keys(o ?? {});
  check("المكوّنُ يقرأ مفاتيحَ avgc بنصوصٍ افتراضية", used.length >= 6, J(used));
  check("  وكلُّ مفتاحٍ مقروء موجودٌ بالعربية بنفس النصّ الافتراضيّ", used.every(([k, d]) => DICT.ar.avgc?.[k] === d), J(used.filter(([k, d]) => DICT.ar.avgc?.[k] !== d)));
  check("  وبالإنكليزية (الأساس) نصّاً غيرَ فارغ", used.every(([k]) => typeof DICT.en.avgc?.[k] === "string" && DICT.en.avgc[k].trim() !== ""));
  check("  ولا مفتاحَ بالقاموس لا يقرؤه المكوّن، والقاموسان بنفس المفاتيح وترتيبها",
    J(keys(DICT.ar.avgc).sort()) === J([...new Set(used.map(([k]) => k))].sort()) && J(keys(DICT.ar.avgc)) === J(keys(DICT.en.avgc)), J({ ar: keys(DICT.ar.avgc), en: keys(DICT.en.avgc) }));
  check("act.f.recipe = «المستهلكات» (وبالإنكليزية موجود)", DICT.ar.act?.f?.recipe === "المستهلكات" && !!DICT.en.act?.f?.recipe, J([DICT.ar.act?.f?.recipe, DICT.en.act?.f?.recipe]));
  // أعمدةٌ يكتبها هذا العملُ بسجلّ التدقيق: avg_cost (0255: الشراءُ وتعديلُه والدمجُ والتصحيح)، وcost (الوصفةُ تصفّرها)
  check("act.f.avg_cost = «متوسط الكلفة» وact.f.cost = «الكلفة» (وبالإنكليزية موجودان)",
    DICT.ar.act?.f?.avg_cost === "متوسط الكلفة" && DICT.ar.act?.f?.cost === "الكلفة" && !!DICT.en.act?.f?.avg_cost && !!DICT.en.act?.f?.cost,
    J([DICT.ar.act?.f?.avg_cost, DICT.ar.act?.f?.cost, DICT.en.act?.f?.avg_cost, DICT.en.act?.f?.cost]));
  const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  const hard = strip(NOTE_SRC).split("\n").filter((l) => /[؀-ۿ]/.test(l) && !l.includes("t("));
  check("ولا عربيةَ في المكوّن خارج t( (سقفُ ملفٍّ جديد صفر)", hard.length === 0, hard.join(" | "));
}

/* ── أ) AvgCostNote مرسوماً ──────────────────────────────────────────────────── */
const perm = (role, caps) => ({ role, baseRole: role, can: (c) => caps.includes(c) });
const MANAGER = perm("manager", ["viewProfits", "manageInventory", "manageSettings"]);
const VET = perm("veterinarian", ["manageInventory", "processSales"]);
const VET_PROFIT = perm("veterinarian", ["manageInventory", "processSales", "viewProfits"]);   // استثناءٌ فرديّ من العيادة
/** طبيبٌ فتح وضع المدير بالرمز: الدورُ «manager» والأساسُ طبيب — والخادمُ (auth_role مع staff_elevations) يقبله. */
const VET_PIN = { ...MANAGER, baseRole: "veterinarian" };
const OV_OPEN = { active: false, deviceLocked: false, restricted: false, stockLocked: false };
const OV_LOCKED = { active: false, deviceLocked: true, restricted: true, stockLocked: true };
const OV_LOCKED_EDIT = { active: false, deviceLocked: true, restricted: true, stockLocked: false };   // «تعديل المخزن بوضع المدير»
const api = (impl) => {
  const a = { calls: [] };
  a.productCostReset = async (id, cost) => { a.calls.push([id, cost]); return impl ? impl(id, cost) : { id, avg_cost: cost, purchase_price: 1200 }; };
  return a;
};
const NOTE_ENTRY = `
  import { useState, createElement as h } from "react";
  import Note from "./${NOTE_FILE}";
  export { Note };
  export function Host({ initial, onChanged }) { const [p, setP] = useState(initial); globalThis.__setProduct = setP; return h(Note, { product: p, onChanged }); }`;
const NOTE_STUBS = {
  "react-i18next": tStub(DICT.ar), i18next: I18NEXT, "@/lib/sounds": SOUNDS, "@/components/ui": UI,
  "@/hooks/usePermissions": "export const usePermissions = () => globalThis.__perm;",
  "@/lib/managerOverride": "export const useOverride = () => globalThis.__ov;",
  "@/lib/consumptionApi": "export const consumptionApi = { productCostReset: (...a) => globalThis.__api.productCostReset(...a) };",
};
const loadNote = (edit) => bundle(edit ? "note-mut" : "note", NOTE_ENTRY, { stubs: NOTE_STUBS, edits: edit ? [{ file: NOTE_FILE, edit }] : [] });

const P = { id: "p1", name: "قفازات", purchase_price: 1200, sell_price: 1500, stock: 10, avg_cost: 1147.619048 };
async function noteSession(M, product, { p = MANAGER, ov = OV_OPEN, a = api() } = {}) {
  globalThis.__perm = p; globalThis.__ov = ov; globalThis.__api = a;
  const log = { changed: 0 };
  const ui = M.mount(M.React.createElement(M.Host, { initial: product, onChanged: () => { log.changed++; } }));
  await flush();
  const type = async (v) => { const n = ui.find("data-avginput"); if (!n) throw new Error("لا حقل"); n.props.onChange({ target: { value: v } }); await flush(); };
  const tap = async (attr) => { ui.click(ui.find(attr)); await flush(); };
  const textOf = (attr) => { const n = ui.find(attr); return n ? ui.text(n) : null; };
  return { ui, log, a, type, tap, textOf, text: () => ui.text(), empty: () => ui.container.children.length === 0, done: () => ui.unmount() };
}
/** كلُّ حالةٍ بمحاولةٍ معزولة: مكوّنٌ مطفَّرٌ يرمي يُحسب سقوطاً لا يوقف الجولة. */
const guard = async (ck, name, fn) => { try { await fn(); } catch (e) { ck(name, false, String(e?.message ?? e)); } };

async function noteSuite(M, ck) {
  await guard(ck, "البوّابة", async () => {
    let s = await noteSession(M, P, { p: VET });
    ck("لا شيءَ لمن لا يرى الكلفة (طبيبٌ بلا viewProfits)", s.empty(), s.text()); s.done();
    s = await noteSession(M, P, { ov: OV_LOCKED });
    ck("  ولا على جهازٍ مقفول (restricted) ولو بحساب المدير", s.empty(), s.text()); s.done();
    s = await noteSession(M, P, { ov: OV_LOCKED_EDIT });
    ck("  ولا حين المخزنُ مفتوحٌ للتعديل والجهازُ مقفول (الكلفةُ تتبع restricted لا stockLocked)", s.empty(), s.text()); s.done();
  });
  await guard(ck, "النصّ", async () => {
    let s = await noteSession(M, P);
    ck("متوسّطٌ معروف ⇒ «متوسط الكلفة: 1,147.62 (من فواتير الشراء)» بمنزلتين (كلفةُ العلبة عند الخادم)",
      s.text().includes("متوسط الكلفة: 1,147.62 (من فواتير الشراء)"), s.text());
    ck("  وبجانب السعر «تعديل سعر الشراء ما يغيّر المتوسط»، ولا «الكلفة = سعر الشراء»",
      s.textOf("data-avghint") === "تعديل سعر الشراء ما يغيّر المتوسط" && !s.text().includes("الكلفة = سعر الشراء"), s.text());
    s.done();
    for (const [label, prod] of [["null", { ...P, avg_cost: null }], ["غائبٌ عن الصفّ", (({ avg_cost: _a, ...r }) => r)(P)]]) {
      s = await noteSession(M, prod);
      ck(`متوسّطٌ ${label} ⇒ «الكلفة = سعر الشراء (ما بعد صار شراء بالمتوسط)» بلا رقمٍ ولا تلميح`,
        s.text().includes("الكلفة = سعر الشراء (ما بعد صار شراء بالمتوسط)") && !s.text().includes("متوسط الكلفة") && !s.ui.find("data-avghint"), s.text());
      s.done();
    }
    s = await noteSession(M, { ...P, avg_cost: 0 });
    ck("  والصفرُ كلفةٌ معروفة لا «مجهول» (coalesce بالخادم): «متوسط الكلفة: 0»", s.text().includes("متوسط الكلفة: 0 (من فواتير الشراء)"), s.text());
    s.done();
    s = await noteSession(M, P, { p: VET_PROFIT });
    ck("من يرى الكلفة وليس مديراً يراها ولا يصحّحها (لا «صحّح المتوسط»)",
      s.text().includes("متوسط الكلفة: 1,147.62") && !s.ui.find("data-avgfix") && !s.text().includes("صحّح المتوسط"), s.text());
    s.done();
    s = await noteSession(M, P, { p: VET_PIN });
    ck("  وطبيبٌ بوضع المدير (الرمز) يصحّح — الخادمُ يقرأ الدورَ الحيّ (auth_role) لا الأساس، وتلميحُه «افتح وضع المدير»",
      s.textOf("data-avgfix") === "صحّح المتوسط", s.text());
    s.done();
  });
  await guard(ck, "التصحيح", async () => {
    let s = await noteSession(M, P);
    ck("المديرُ يرى «صحّح المتوسط»", s.textOf("data-avgfix") === "صحّح المتوسط", s.text());
    await s.tap("data-avgfix");
    ck("  والحقلُ يُفتح على المتوسّط بمنازله الست", s.ui.find("data-avginput")?.props.value === "1147.619048", String(s.ui.find("data-avginput")?.props.value));
    await s.type("1150.5");
    await s.tap("data-avgsave");
    ck("  «حفظ» يرسل product_cost_reset(المعرّف، ما كُتب بالضبط)", J(s.a.calls) === J([["p1", 1150.5]]), J(s.a.calls));
    ck("  ثمّ تُقرأ القائمةُ مرّةً، ويُغلق الحقل، ويُرى الرقمُ الجديد",
      s.log.changed === 1 && !s.ui.find("data-avgedit") && s.text().includes("متوسط الكلفة: 1,150.5 (من فواتير الشراء)"), J({ changed: s.log.changed, text: s.text() }));
    globalThis.__setProduct({ ...P, avg_cost: 1160 });
    await flush();
    ck("  والمادّةُ المحدَّثة حين تصل تغلب جوابَ التصحيح (لا رقمٌ عالق)", s.text().includes("متوسط الكلفة: 1,160 (من فواتير الشراء)"), s.text());
    s.done();
    for (const [typed, sent] of [["0", 0], ["0.000001", 0.000001], ["1150.500000", 1150.5], ["1234567.123456", 1234567.123456]]) {
      s = await noteSession(M, P);
      await s.tap("data-avgfix"); await s.type(typed);
      if (s.ui.find("data-avgsave")?.props.disabled === false) await s.tap("data-avgsave");
      ck(`  «${typed}» ⇒ يُرسل ${sent}`, J(s.a.calls) === J([["p1", sent]]), J(s.a.calls));
      s.done();
    }
    for (const typed of ["-1", "1.1234567", "1e-7", "abc", "", "  "]) {
      s = await noteSession(M, P);
      await s.tap("data-avgfix"); await s.type(typed);
      const btn = s.ui.find("data-avgsave"), bad = !!s.ui.find("data-avgbad");
      ck(`  «${typed}» لا يُرسل: «حفظ» مقفول${typed.trim() ? " وسطرُ «اكتب رقم ٠ أو أكثر…»" : " بلا سطرِ خطأ"}`,
        btn?.props.disabled === true && s.a.calls.length === 0 && bad === !!typed.trim(), J({ disabled: btn?.props.disabled, bad, calls: s.a.calls }));
      s.done();
    }
    s = await noteSession(M, P);
    await s.tap("data-avgfix"); await s.tap("data-avgfollow");
    ck("«رجّعه يتبع سعر الشراء» يرسل null", J(s.a.calls) === J([["p1", null]]), J(s.a.calls));
    ck("  ثمّ «الكلفة = سعر الشراء …»، وتُقرأ القائمة", s.text().includes("الكلفة = سعر الشراء (ما بعد صار شراء بالمتوسط)") && s.log.changed === 1, J({ text: s.text(), changed: s.log.changed }));
    s.done();
    s = await noteSession(M, { ...P, avg_cost: null });
    await s.tap("data-avgfix");
    ck("  ولا يُعرض والمتوسّطُ يتبع سعرَ الشراء أصلاً، والحقلُ فارغ", !s.ui.find("data-avgfollow") && s.ui.find("data-avginput")?.props.value === "", String(s.ui.find("data-avginput")?.props.value));
    s.done();
  });
  await guard(ck, "الرفض", async () => {
    const HINT = "تصحيح المتوسط للمدير وحده — افتح وضع المدير";
    let s = await noteSession(M, P, { a: api(() => { throw Object.assign(new Error("cost_reset_forbidden"), { code: "P0001", hint: HINT }); }) });
    await s.tap("data-avgfix"); await s.type("1150"); await s.tap("data-avgsave");
    ck("رفضُ الخادم يُقال بنصّه (P0001 + hint)، والحقلُ باقٍ، والقائمةُ لا تُقرأ، والرقمُ لم يتغيّر",
      s.textOf("data-avgerr") === HINT && s.log.changed === 0 && !!s.ui.find("data-avgedit") && s.text().includes("متوسط الكلفة: 1,147.62"),
      J({ err: s.textOf("data-avgerr"), changed: s.log.changed }));
    s.done();
    s = await noteSession(M, P, { a: api(() => { throw new TypeError("Failed to fetch"); }) });
    await s.tap("data-avgfix"); await s.type("1150"); await s.tap("data-avgsave");
    const net = s.textOf("data-avgerr") ?? "";
    ck("  وفشلُ الشبكة يُقال كذلك (describeDbError) — لا صمت", net.trim() !== "" && s.log.changed === 0, net);
    s.done();
  });
}
console.log("▸ أ) AvgCostNote مرسوماً — البوّابة، النصّان، تصحيحُ المدير ورفضُه");
const NOTE = await loadNote();
await noteSuite(NOTE, check);

/* ── ب) نموذجُ المادة: الحلقةُ في مكانها وحدَه، والحفظُ بلا avg_cost ─────────────────────
 * بنهج inventory-cas-test ح: Inventory.tsx يُحزم كما هو، وكلُّ استيرادٍ له بديلٌ يُولَّد من سطور استيراده
 * (فالحلقةُ المستوردة من ProductMovements تُرسم عقدةً باسمها x-AvgCostSlot ونقرأ خصائصها). */
const INV_FILE = "src/pages/Inventory.tsx";
const INV = SRC(INV_FILE);
const REAL_INV = new Set(["react", "@/lib/productPatch", "@/lib/productCodes", "@/lib/utils", "@/lib/errors"]);
const INV_STUB = {
  "react-i18next": "export const useTranslation = () => ({ t: (k) => k, i18n: { language: 'ar' } });",
  i18next: I18NEXT,
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => globalThis.__invRepo[k] });",
  "@/components/ui": UI,
  "@/components/Modal": "export const Modal = ({ open, children }) => (open ? children : null);",
  "@/components/LoadBoundary": "export const LoadBoundary = ({ children }) => children;",
  "@/lib/managerOverride": "export const useOverride = () => globalThis.__ov;",
  "@/hooks/usePermissions": "export const usePermissions = () => globalThis.__perm;",
  "@/contexts/AuthContext": "export const useAuth = () => ({ user: null });",
  "@/lib/catalog": "export const catalogLookup = async () => null;",
  "@/lib/promotions": "export const subcategoriesOf = () => [];",
  "@/lib/sounds": SOUNDS,
  "react-router-dom": "export const Link = ({ children }) => children; export const useSearchParams = () => [new URLSearchParams(), () => {}];",
  "@/components/photo/PhotoEditor": "export default () => null;",
  "@/pages/InventoryAudit": "export const StockReportButtons = () => null;",
};
async function loadInventory(edit = (s) => s, tag = "inv") {
  const text = edit(INV);
  const imports = new Map();
  for (const m of text.matchAll(/^import\s+(type\s+)?([\s\S]*?)\s+from\s+"([^"]+)";/gm)) {
    if (m[1]) continue;
    const names = imports.get(m[3]) ?? new Set();
    for (const part of (/\{([\s\S]*)\}/.exec(m[2])?.[1] ?? "").split(",")) {
      const s = part.trim();
      if (s && !s.startsWith("type ")) names.add(s.split(/\s+as\s+/)[0].trim());
    }
    if (!m[2].trim().startsWith("{") && /^\s*\w+\s*(,|$)/.test(m[2])) names.add("default");
    imports.set(m[3], names);
  }
  const stubOf = (spec) => {
    if (INV_STUB[spec] != null) return INV_STUB[spec];
    const names = [...(imports.get(spec) ?? [])];
    if (spec === "lucide-react") return names.map((k) => `export const ${k} = () => null;`).join("\n");
    return ['import { createElement } from "react";', ...names.map((k) => {
      const v = /^use[A-Z]/.test(k) ? "() => ({})" : /^[A-Z][a-z]/.test(k) ? `(p) => createElement("x-${k}", p, p?.children)`
        : /^[A-Z_0-9]+$/.test(k) ? "0" : "() => undefined";
      return k === "default" ? `export default ${v};` : `export const ${k} = ${v};`;
    })].join("\n");
  };
  const fromInv = (importer) => pathRe(INV_FILE).test(importer ?? "");
  const built = await esbuild.build({
    stdin: { contents: `export { ProductModal } from "./${INV_FILE}";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`, resolveDir: process.cwd(), sourcefile: `avg-cost-${tag}.tsx`, loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "avg-cost-inventory",
      setup(b) {
        b.onLoad({ filter: pathRe(INV_FILE) }, () => ({ contents: `${text}\nexport { ProductModal };`, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path === "i18next" || a.path === "react-i18next") return { path: a.path, namespace: "inv-ui" };
          if (fromInv(a.importer) && !REAL_INV.has(a.path) && !a.path.startsWith("react/")) return { path: a.path, namespace: "inv-ui" };
          return undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "inv-ui" }, (a) => ({ contents: stubOf(a.path), loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  return importBuilt(built, tag);
}
async function modalSession(M, { product, all = product ? [product] : [], p = MANAGER, ov = OV_OPEN }) {
  globalThis.__perm = p; globalThis.__ov = ov;
  const log = { writes: [], creates: [], saved: 0, changed: 0, errors: [] };
  globalThis.__invToast = { toast() {}, success() {}, warn() {}, error: (...a) => { log.errors.push(a); } };
  globalThis.__invRepo = new Proxy({}, { get: (_t, k) =>
    k === "updateProduct" ? async (id, patch, expect) => { log.writes.push({ id, patch, expect }); return { ...(all.find((x) => x.id === id) ?? {}), ...patch }; }
    : k === "createProduct" ? async (row) => { log.creates.push(row); return { id: "new1", created_at: "2026-10-31T00:00:00Z", ...row }; }
    : k === "getProductById" ? async (id) => all.find((x) => x.id === id)
    : k === "supportsBulkGroup" ? async () => true
    : async () => undefined });
  const onChanged = () => { log.changed++; };
  const ui = M.mount(M.React.createElement(M.ProductModal, { open: true, product, companies: [], sections: [], subcategories: [], allProducts: all,
    onClose() {}, onSaved() { log.saved++; }, onChanged }));
  await flush();
  const field = (pred) => ui.all().find((n) => n.type === "input" && pred(n.props));
  if (product && field((x) => x.placeholder === "pos.namePh")?.props.value !== product.name) await ui.settle();
  const type = async (pred, value) => { const n = field(pred); if (!n) throw new Error("ما لكيتُ الحقل"); n.props.onChange({ target: { value } }); await flush(); };
  const press = async (pred) => { ui.click(ui.all().find((n) => (n.type === "x-Button" || n.type === "button") && pred(ui.text(n), n))); await flush(); };
  return { ui, log, onChanged, type, press, slots: () => ui.all().filter((n) => n.type === "x-AvgCostSlot"), done: () => ui.unmount() };
}
const base = { barcode: null, company_id: null, section_id: null, category: null, subcategory: null, purchase_price: 1200, sell_price: 1500,
  stock: 10, min_stock: 0, expiry_date: null, pooled: false, has_sub_unit: false, sub_unit_name: null, units_per_box: null,
  sub_unit_price: null, sold_by_weight: false, alt_codes: [], bulk_group: null, clinic_id: "c1", created_at: "2026-10-01T00:00:00Z" };
const MP = { ...base, id: "p1", name: "قفازات", avg_cost: 1147.619048 };
const GA = { ...base, id: "a", name: "أ", bulk_group: "g1", avg_cost: 900 };
const GB = { ...base, id: "b", name: "ب", bulk_group: "g1", avg_cost: 950, created_at: "2026-10-02T00:00:00Z" };
const nameField = (x) => x.placeholder === "pos.namePh";

async function modalSuite(M, ck) {
  await guard(ck, "الحلقة", async () => {
    let s = await modalSession(M, { product: MP });
    const sl = s.slots();
    ck("مادّةٌ قائمة ولمن يرى الكلفة ⇒ حلقةٌ واحدة بالمادّة نفسِها وبـonChanged (تُقرأ القائمةُ بعد التصحيح)",
      sl.length === 1 && sl[0].props.product === MP && sl[0].props.onChanged === s.onChanged, J({ n: sl.length, id: sl[0]?.props.product?.id }));
    s.done();
    s = await modalSession(M, { product: null });
    ck("  لا بالإنشاء (لا مادّةَ بعد ولا متوسّط)", s.slots().length === 0); s.done();
    s = await modalSession(M, { product: MP, p: VET });
    ck("  ولا لمن لا يرى الكلفة — فلا تُحمَّل القطعةُ له أصلاً", s.slots().length === 0); s.done();
    for (const [label, ov] of [["والجهازُ مقفول", OV_LOCKED], ["والجهازُ مقفولٌ والمخزنُ مفتوحٌ للتعديل", OV_LOCKED_EDIT]]) {
      s = await modalSession(M, { product: MP, ov });
      ck(`  ولا ${label} (restricted)`, s.slots().length === 0); s.done();
    }
    s = await modalSession(M, { product: GA, all: [GA, GB] });
    ck("  ومادّةُ مجموعةٍ تُفتح مفردةً تحمل حلقتها", s.slots().length === 1);
    await s.press((t) => t.includes("pos.groupEditBtn"));
    ck("  وتعديلُ المجموعة (سعرٌ مشترك لعدّة مواد) بلا حلقة — متوسّطُ مادّةٍ واحدة ليس متوسّطَها", s.slots().length === 0, String(s.slots().length));
    s.done();
  });
  await guard(ck, "الحفظ", async () => {
    let s = await modalSession(M, { product: MP });
    await s.type(nameField, "قفازات طبية");
    await s.press((t) => t === "common.save");
    ck("حفظُ مادّةٍ لها متوسّط لا يرسل avg_cost (الخادمُ يرفضه avg_cost_frozen)",
      s.log.writes.length >= 1 && s.log.writes.every((w) => !has(w.patch, "avg_cost")) && s.log.writes[0].patch.name === "قفازات طبية", J(s.log.writes));
    s.done();
    s = await modalSession(M, { product: MP });
    await s.type((x) => x.value === "1200", "1300");
    await s.press((t) => t === "common.save");
    ck("  ولا تعديلُ سعر الشراء (يُرسل سعرُ الشراء وحده — المتوسّطُ لا يتبعه)",
      s.log.writes.length === 1 && s.log.writes[0].patch.purchase_price === 1300 && !has(s.log.writes[0].patch, "avg_cost"), J(s.log.writes));
    s.done();
    s = await modalSession(M, { product: null });
    await s.type(nameField, "شاش");
    await s.press((t) => t === "common.save");
    ck("  ولا الإنشاء (المادّةُ الجديدة متوسّطُها مجهول — المحفّزُ يجعله null)",
      s.log.creates.length === 1 && s.log.creates[0].name === "شاش" && !has(s.log.creates[0], "avg_cost"), J(s.log.creates));
    s.done();
  });
}
console.log("▸ ب) نموذجُ المادة — الحلقةُ لمادّةٍ قائمة ولمن يرى الكلفة، والحفظُ بلا avg_cost");
const MODAL = await loadInventory().catch((e) => ({ err: e }));
check("Inventory.tsx يُحزم ويُرسم ProductModal", typeof MODAL?.ProductModal === "function", MODAL?.err ? String(MODAL.err.message).split("\n").slice(0, 3).join(" ") : "");
if (MODAL?.ProductModal) await modalSuite(MODAL, check);

/* ── ج) الحلقة: page(…, ["avgc"]) داخل LoadBoundary + Suspense، وإعادةٌ تصنع قطعةً جديدة ──────── */
const MV_FILE = "src/components/inventory/ProductMovements.tsx";
const MV_STUBS = {
  "react-i18next": tStub(DICT.ar), i18next: I18NEXT, "@/components/ui": UI,
  "@/lib/repo": "export const repo = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__mvRepo[k](...a) });",
  "@/lib/lazyPage": `import { createElement } from "react";
    export const page = (load, ns) => {
      const calls = (globalThis.__pages ||= []);
      const gen = calls.length + 1;
      calls.push({ load, ns });
      return (props) => createElement("x-AvgCostNote", { ...props, gen });
    };`,
  "@/components/LoadBoundary": `import { createElement } from "react";
    export const LoadBoundary = ({ children, onRetry, scope }) => createElement("x-LoadBoundary", { onRetry, scope }, children);`,
  "@/components/inventory/AvgCostNote": "export default function AvgCostNoteModule() { return null; } export const __which = 'AvgCostNote';",
};
const loadMv = (edit, tag = "mv") => { globalThis.__pages = []; return bundle(tag, `export { AvgCostSlot, ProductMovementsDialog } from "./${MV_FILE}";`, { stubs: MV_STUBS, edits: edit ? [{ file: MV_FILE, edit }] : [] }); };
async function slotSuite(M, ck) {
  await guard(ck, "الحلقة", async () => {
    const pages = globalThis.__pages;
    ck("قطعةٌ واحدة عند التحميل بنطاقها: page(…, [\"avgc\"])", pages.length === 1 && J(pages[0].ns) === J(["avgc"]), J(pages.map((x) => x.ns)));
    const mod = await pages[0]?.load();
    ck("  والمحمِّلُ يستورد AvgCostNote نفسَها (default)", mod?.__which === "AvgCostNote" && typeof mod?.default === "function");
    const changed = () => {};
    const ui = M.mount(M.React.createElement(M.AvgCostSlot, { product: MP, onChanged: changed }));
    await flush();
    const lb = ui.find("scope", "avg-cost");
    const note = () => ui.all().find((n) => n.type === "x-AvgCostNote");
    ck("  داخل LoadBoundary (avg-cost)، وتصلها المادّةُ وonChanged", lb?.type === "x-LoadBoundary" && note()?.props.product === MP && note()?.props.onChanged === changed && note()?.props.gen === 1,
      J({ lb: lb?.type, gen: note()?.props.gen }));
    lb?.props.onRetry();
    await flush();
    ck("  و«أعد المحاولة» تصنع قطعةً جديدة وتُرسم (lazy() يخبّئ الوعدَ المرفوض)", globalThis.__pages.length === 2 && note()?.props.gen === 2, J({ pages: globalThis.__pages.length, gen: note()?.props.gen }));
    ui.unmount();
  });
}
console.log("▸ ج) الحلقة — قطعةٌ كسولة بنطاقها، وإعادةُ المحاولة، والنطاقُ المملوك");
const MV = await loadMv();
await slotSuite(MV, check);
{
  const files = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(f)) files.push(p); } };
  walk("src");
  const rows = files.map((p) => ({ rel: relative(process.cwd(), p).split(sep).join("/"), text: readFileSync(p, "utf8") }));
  const app = readFileSync("src/App.tsx", "utf8");
  const OWN = { avgc: { owner: NOTE_FILE, with: [] }, act: { owner: "src/pages/ActivityLog.tsx", with: [] } };
  const errs = checkOwned(OWN, rows, app);
  check("checkOwned: avgc يحمّله ملفٌّ بـpage(…, [\"avgc\"])، ومالكُه لا يُستورد ثابتاً، ولا يقرؤه غيرُه؛ وact.f.recipe لمالكه", errs.length === 0, errs.join(" | "));
  const bad = checkOwned(OWN, [...rows, { rel: "src/pages/Zz.tsx", text: `import AvgCostNote from "@/components/inventory/AvgCostNote";\nt("avgc.avg");` }], app);
  check("  والفحصُ نفسُه يُمسك مستورداً ثابتاً وقارئاً غريباً (ليس فارغاً)", bad.length >= 2, J(bad.length));
}

/* ── د) حركاتُ المادة: المستهلكات، وسندُ التلف بما رحّله ─────────────────────────────────── */
async function movementsSuite(M, ck) {
  await guard(ck, "الحركات", async () => {
    const at = (s) => `2026-10-31T09:00:${String(s).padStart(2, "0")}.000Z`;
    const mvRow = (s, kind, delta, from, extra = {}) => ({ at: at(s), kind, delta, from_qty: from, to_qty: from + delta, ref_id: null, actor_name: "أحمد", ...extra });
    const rows = [
      mvRow(50, "consume", -0.25, 1, { ref_id: "inv-1" }),
      mvRow(40, "consume_return", 0.25, 0.75, { ref_id: "inv-1" }),
      mvRow(30, "sale", -1, 3, { ref_id: "inv-2" }),
      mvRow(20, "adjust", -0.001, 2),      // سندُ ١٠ مل من مكعّب ٢٠ لتراً: الفرقُ −٠٫٠٠٠٥ والمرحَّلُ ٠٫٠٠١
      mvRow(10, "adjust", -2, 5),          // جردٌ «منتهي» عادي
      mvRow(0, "adjust", 3, 4),            // تعديلٌ يدويّ
    ];
    const counts = [
      { id: "w1", product_id: "p1", status: "approved", reason: "damaged", source: "waste", applied_delta: -0.0005, posted: 0.001, decided_at: at(21), decided_by_name: "مدير" },
      { id: "c1", product_id: "p1", status: "approved", reason: "expired", applied_delta: -2, decided_at: at(10), decided_by_name: "سارة" },
    ];
    globalThis.__mvRepo = { productMovements: async () => rows, productBatches: async () => [], listProductCounts: async () => counts };
    const ui = M.mount(M.React.createElement(M.ProductMovementsDialog, { product: MP, open: true, onClose() {} }));
    await flush();
    const labels = ui.all().filter((n) => n.type === "p" && /text-sm font-bold text-ink/.test(n.props.className ?? "")).map((n) => ui.text(n));
    ck("صرفُ مستهلكاتٍ «مستهلكات» (pos.cat.consumables)", labels[0] === "مستهلكات", J(labels));
    ck("  ورجوعُها «مستهلكات — إرجاع»", labels[1] === "مستهلكات — إرجاع", J(labels));
    ck("  والبيعُ والتعديلُ اليدويّ كما كانا", labels[2] === "بيع" && labels[5] === "تعديل يدوي أو جرد", J(labels));
    ck("سندُ التلف يُطابَق بما رحّله (posted) لا بفرقه الدقيق: «جرد — تالف (وافق مدير)» (mv.cr.damaged)", labels[3] === "جرد — تالف (وافق مدير)", J(labels));
    ck("  والجردُ العاديّ بفرقه كما كان: «جرد — منتهي (وافق سارة)»", labels[4] === "جرد — منتهي (وافق سارة)", J(labels));
    ui.unmount();
  });
}
console.log("▸ د) حركاتُ المادة — «مستهلكات» و«مستهلكات — إرجاع»، وسندُ التلف بما رحّله");
await movementsSuite(MV, check);

/* ── هـ) سجلُّ الحركات: «المستهلكات» بنصّ الوصفة كاملاً ───────────────────────────────── */
const ACT_FILE = "src/pages/ActivityLog.tsx";
const ACT_STUBS = {
  "react-i18next": tStub(DICT.ar), i18next: I18NEXT, "@/components/ui": UI, "@/lib/sounds": SOUNDS,
  "@/lib/repo": "export const repo = { activitySummary: async () => [], activityActors: async () => [], activityPage: async () => globalThis.__actRows };",
  "@/lib/staff": "export const listStaff = async () => [];",
  "@/contexts/AuthContext": "export const useAuth = () => ({ user: { id: 'u1', full_name: 'x' } });",
  "@/hooks/usePermissions": "export const usePermissions = () => ({ can: () => true, role: 'manager', baseRole: 'manager' });",
  "@/lib/managerOverride": "export const useOverride = () => ({ restricted: false });",
};
const loadAct = (edit, tag = "act") => bundle(tag, `export { ActivityLog } from "./${ACT_FILE}";`, { stubs: ACT_STUBS, edits: edit ? [{ file: ACT_FILE, edit }] : [] });
const OLD_RECIPE = "قفازات طبية ×2 علبة، شاش معقّم ×1 علبة، Lyse ×2 مل";   // أطول من ٢٨ حرفاً
const LONG_A = "اسم منتج طويل جداً يتجاوز الحد المعتاد للعرض", LONG_B = "اسم آخر طويل جداً يتجاوز الحد المعتاد للعرض كذلك";
async function activitySuite(M, ck) {
  await guard(ck, "السجلّ", async () => {
    const now = new Date().toISOString();
    globalThis.__actRows = [
      { id: 1, src: "a", created_at: now, actor: "u2", actor_name: "أحمد", kind: "settings", action: "UPDATE", entity: "clinic_services", entity_id: "s1",
        brief: { name: "تعقيم قطة", __changed: { recipe: [OLD_RECIPE, null] } } },
      { id: 2, src: "a", created_at: now, actor: "u2", actor_name: "أحمد", kind: "product_edit", action: "UPDATE", entity: "products", entity_id: "p1",
        brief: { name: "x", __changed: { name: [LONG_A, LONG_B] } } },
      // شراءٌ بعد 0255: المحفّزُ يكتب ما تغيّر كلَّه — الرصيدُ وسعرُ الشراء والمتوسّط (record_purchase)
      { id: 3, src: "a", created_at: now, actor: "u2", actor_name: "أحمد", kind: "stock", action: "UPDATE", entity: "products", entity_id: "p2",
        brief: { name: "Amoxi", stock: 20, __changed: { stock: [10, 20], avg_cost: [1000, 1100], purchase_price: [1000, 1200] } } },
      // «كانت تقدير للمواد — صفّرها» (p_clear_flat_cost): سطرُ الجدول نفسِه، غيرُ سطر الوصفة
      { id: 4, src: "a", created_at: now, actor: "u2", actor_name: "أحمد", kind: "settings", action: "UPDATE", entity: "clinic_services", entity_id: "s1",
        brief: { name: "تعقيم قطة", __changed: { cost: [3000, null] } } },
    ];
    const ui = M.mount(M.React.createElement(M.ActivityLog));
    await flush();
    const chips = ui.all().filter((n) => n.type === "span" && /rounded-lg bg-surface-2/.test(n.props.className ?? ""))
      .map((n) => n.children.filter((c) => c.type === "b" || c.type === "span").map((c) => ui.text(c)));
    const chip = (label) => chips.find((c) => c[0] === label);
    const recipe = chip("المستهلكات"), other = chip("الاسم");
    ck("تعديلُ الوصفة يُسمّى «المستهلكات» (act.f.recipe)", chips.length === 6 && !!recipe, J(chips));
    ck("  وكانت بنصّها كاملاً (لا قصَّ عند ٢٨ حرفاً يُخفي المادّةَ التي تغيّرت)", recipe?.[1] === OLD_RECIPE, J(recipe));
    ck("  وصارت «فارغ» حين شيلت كلَّها (null)", recipe?.[2] === "فارغ", J(recipe));
    ck("  وباقي الحقول تُقصّ كما كانت", other?.[1] === `${LONG_A.slice(0, 28)}…` && other?.[2] === `${LONG_B.slice(0, 28)}…`, J(other));
    const avg = chip("متوسط الكلفة"), cost = chip("الكلفة");
    ck("الشراءُ يحرّك المتوسّط ⇒ «متوسط الكلفة 1,000 ← 1,100» بجانب «المخزون» و«سعر الشراء» — لا اسمَ العمود avg_cost",
      J(avg) === J(["متوسط الكلفة", "1,000", "1,100"]) && !!chip("المخزون") && !!chip("سعر الشراء") && !chips.some((c) => c[0] === "avg_cost"), J(chips));
    ck("  وتصفيرُ كلفة الخدمة مع الوصفة ⇒ «الكلفة 3,000 ← فارغ» — لا cost", J(cost) === J(["الكلفة", "3,000", "فارغ"]) && !chips.some((c) => c[0] === "cost"), J(chips));
    ui.unmount();
  });
}
console.log("▸ هـ) سجلُّ الحركات — «المستهلكات: كانت … صارت …»");
const ACT = await loadAct();
await activitySuite(ACT, check);

/* ── و) قيمةُ المخزون — بأرقامٍ محسوبةٍ باليد ─────────────────────────────────────────────
 * رأسُ المال (Inventory) والراكد (countPick) بكلفة الخادم stock_unit_cost = greatest(coalesce(avg_cost,
 * purchase_price, 0), 0)، والقيمةُ تعدّ الموجودَ وحده. وفحصُ المخزن وكشفُ الإرجاع بسعر الشراء: كلُّ ما يُجمع
 * معهما أو يُقسم عليهما بسعر الشراء — صفوفُ الخادم (0245) وسطورُ الكشف المطبوع و«المجموع الكلّي — بسعر الشراء». */
const ROWS = [
  { id: "a", name: "أ", stock: 3, avg_cost: 1147.619048, purchase_price: 1200, sell_price: 1500 },   // 3 × 1147.619048
  { id: "b", name: "ب", stock: 2, avg_cost: null, purchase_price: 1000, sell_price: 1300 },          // يتبع سعرَ الشراء
  { id: "c", name: "ج", stock: 5, purchase_price: 10, sell_price: 15 },                              // بلا العمود (قبل 0255 / تجريبيّ)
  { id: "d", name: "د", stock: 4, avg_cost: 0, purchase_price: 999, sell_price: 1000 },              // الصفرُ كلفة لا «مجهول»
  { id: "e", name: "هـ", stock: -2, avg_cost: 500, purchase_price: 600, sell_price: 700 },           // عجزٌ مسجَّل: لا قيمة
  { id: "f", name: "و", stock: 1, avg_cost: null, purchase_price: null, sell_price: 50 },            // مجهولٌ كلُّه: صفر
  { id: "g", name: "ز", stock: 2, avg_cost: "250.5", purchase_price: 300, sell_price: 400 },         // numeric نصّاً
  { id: "h", name: "ح", stock: 1, avg_cost: -5, purchase_price: 10, sell_price: 20 },                // greatest(−5, 0) لا سعرُ الشراء
];
const VALUE = { a: 3442.857144, b: 2000, c: 50, d: 0, e: 0, f: 0, g: 501, h: 0 };          // بكلفة الخادم
const VALUE_PP = { a: 3600, b: 2000, c: 50, d: 3996, e: 0, f: 0, g: 600, h: 10 };            // بسعر الشراء
const COST = 5993.857144, COST_PP = 10256, RETAIL = 3 * 1500 + 2 * 1300 + 5 * 15 + 4 * 1000 + 50 + 2 * 400 + 20;   // البيعُ بسعر البيع كما كان
const fnText = (text, head) => {
  const at = text.indexOf(head);
  if (at < 0) return null;
  let depth = 0;
  for (let i = text.indexOf("{", text.indexOf(")", at)); i < text.length; i++) {
    if (text[i] === "{") depth++;
    else if (text[i] === "}" && --depth === 0) return text.slice(at, i + 1);
  }
  return null;
};
const evalFn = async (src, name) => (src ? vm.runInNewContext(`${(await esbuild.transform(src, { loader: "ts" })).code}\n${name}`) : null);
const AUDIT_FILE = "src/pages/InventoryAudit.tsx";
const civText = (edit = (s) => s) => edit(fnText(INV, "function computeInventoryValue(") ?? "");
const totText = (edit = (s) => s) => edit(fnText(SRC(AUDIT_FILE), "function totalsOf(") ?? "");
const loadLibs = (edits = [], tag = "libs") => bundle(tag, [
  'export { deadStock } from "./src/lib/countPick.ts";',
  'export { expiryCost, expiryWatch, groupByCompany } from "./src/lib/expiry.ts";',
  'export { buildReturnStatementHTML } from "./src/lib/returnPrint.ts";',
  'export { summarize } from "./src/lib/auditReport.ts";',
].join("\n"), { stubs: { i18next: I18NEXT, "./barcodeDraw": "export const drawBarcode = () => '';" }, edits });
/** ترجمةٌ بالنصّ الافتراضيّ وتعويضه — ما يكفي لجمل الملخّص. */
const tPlain = (k, o) => { const s = typeof o === "string" ? o : (o?.defaultValue ?? k); return s.replace(/\{\{(\w+)\}\}/g, (_, v) => String(o?.[v] ?? "")); };
/** عمودُ value بآخر تعريفٍ لـreport_inventory_audit (صفوفُ فحص المخزن): بأيّ كلفةٍ يقيّم الخادم؟ */
function auditSqlBasis() {
  const dir = "supabase/migrations";
  let last = null;
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".sql")).sort()) {
    const s = readFileSync(join(dir, f), "utf8");
    const at = s.lastIndexOf("create or replace function public.report_inventory_audit(");
    if (at >= 0) last = { file: f, body: s.slice(at) };
  }
  const line = last ? (/^.*\bas value\b.*$/m.exec(last.body)?.[0] ?? "").trim() : "";
  return last && { file: last.file, line, basis: /avg_cost|stock_unit_cost/.test(line) ? "avg" : /purchase_price/.test(line) ? "pp" : null };
}
const STMT_L = { title: "كشف الإرجاع", company: "الشركة", item: "المادة", qty: "العدد", expiry: "الانتهاء", cost: "الكلفة", total: "المجموع",
  groupTotal: "مجموع الشركة", grandTotal: "المجموع الكلّي — بسعر الشراء", printedAt: "طُبع" };
/** الكشفُ المطبوع كما يُطبع (Inventory.tsx printStatement)، والمبالغُ بعلامةٍ تُقرأ: لكلّ مجموعةٍ سطورُها ومجموعُها، والكلّي. */
function printedStatement(F, groups) {
  const html = F.buildReturnStatementHTML(groups, STMT_L, { lang: "ar", clinicName: "x", money: (n) => `#${n}#`, qty: (n) => String(n), date: "2026/10/31" });
  const nums = (s) => [...s.matchAll(/#(-?[\d.e+]+)#/g)].map((m) => Number(m[1]));
  const sections = [...html.matchAll(/<section>([\s\S]*?)<\/section>/g)].map((m) => ({
    rows: [...(/<tbody>([\s\S]*?)<\/tbody>/.exec(m[1])?.[1] ?? "").matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map((r) => nums(r[1])),
    total: nums(/<tfoot>([\s\S]*?)<\/tfoot>/.exec(m[1])?.[1] ?? "")[0],
  }));
  const g = /class="grand"><span>([^<]*)<\/span><span>([^<]*)<\/span>/.exec(html);
  return { sections, grandLabel: g?.[1] ?? "", grand: nums(g?.[2] ?? "")[0] };
}

async function valueSuite(F, ck) {
  await guard(ck, "Inventory", async () => {
    const v = F.civ(ROWS, []);
    ck("Inventory.tsx computeInventoryValue: رأسُ المال = Σ الموجود × كلفة الخادم", near(v.cost, COST), J(v));
    ck("  وقيمةُ البيع بسعر البيع كما كانت، والربحُ فرقُهما", v.retail === RETAIL && near(v.profit, RETAIL - COST), J(v));
    const sec = [{ id: "sec", pooled_stock: 4 }];
    const w = F.civ([{ id: "x", stock: 0, avg_cost: 800, purchase_price: 1000, sell_price: 2000, section_id: "sec" },
      { id: "y", stock: 0, avg_cost: null, purchase_price: 600, sell_price: 1000, section_id: "sec" }], sec);
    ck("  والحوضُ تقديرٌ بمتوسّط كلفة باركودات صنفه (٤ × (٨٠٠ + ٦٠٠)/٢ = ٢٨٠٠)، وبيعُه بسعر البيع", near(w.pooledCost, 2800) && near(w.pooledRetail, 6000) && near(w.cost, 2800), J(w));
  });
  await guard(ck, "InventoryAudit", async () => {
    const t = F.tot([...ROWS, { id: "farm", name: "حقل", stock: 100, avg_cost: 1, purchase_price: 1, farm_id: "f1" }]);
    ck("InventoryAudit.tsx totalsOf: بسعر الشراء كصفوف الخادم التي تُجمع معه، ومخزنُ الحقل خارجها", near(t.value, COST_PP) && t.products === ROWS.length, J(t));
    // رفٌّ مستحيلٌ يهيمن (هذا ما وُجد الفحصُ له): آخرُ شرائه ١٢٠٠ ومتوسّطُه ١٠٠٠؛ وصفُّه من الخادم بسعر الشراء (0245)
    const shelf = [{ id: "x", name: "Ivermectin", stock: 10000, purchase_price: 1200, avg_cost: 1000 },
      { id: "y", name: "Gauze", stock: 20, purchase_price: 500, avg_cost: 500 }, { id: "z", name: "Syringe", stock: 100, purchase_price: 250, avg_cost: null }];
    const totals = F.tot(shelf);
    const imp = { id: "x", name: "Ivermectin", code: null, stock: 10000, value: 10000 * 1200, grp: null, chip: null, detail: null };
    const sum = F.summarize(tPlain, [{ id: "impossible", title: "", money: true,
      checks: [{ key: "impossible", title: "", why: "", fix: "", rows: [imp], grouped: false, showValue: true }] }], totals, false);
    const pct = Number(/(\d+)٪/.exec(sum.findings[0] ?? "")?.[1] ?? NaN);
    ck("  وحصّةُ المستحيل «من قيمة المخزن» لا تتجاوز ١٠٠٪، وما بدونه = الباقي فعلاً (٣٥٬٠٠٠) — بالمتوسّط قال «١٢٠٪» و«≈ ٠»",
      pct <= 100 && near(totals.value - imp.value, 35000), J({ pct, total: totals.value, finding: sum.findings[0] }));
    // والأساسُ أساسُ آخر تعريفٍ لصفوف الخادم: إن انتقل value هناك إلى stock_unit_cost فهذا ينتقل معه (والعكس)
    const b = auditSqlBasis();
    const probe = F.tot([{ id: "p", stock: 2, purchase_price: 1200, avg_cost: 1000 }]).value;
    ck(`  وأساسُها أساسُ عمود value بآخر report_inventory_audit (${b?.file ?? "؟"}: ${b?.basis ?? "؟"})`,
      !!b?.basis && probe === (b.basis === "avg" ? 2000 : 2400), J({ line: b?.line, probe }));
  });
  await guard(ck, "countPick", async () => {
    const sold = new Map([["s", 2]]);
    const d = F.deadStock([...ROWS, { id: "s", name: "مباع", stock: 5, avg_cost: 100, purchase_price: 100 }, { id: "q", name: "مجمّع", stock: 3, pooled: true, avg_cost: 9, purchase_price: 9 }], sold);
    const got = Object.fromEntries(d.map((x) => [x.product.id, x.value]));
    const want = Object.entries(VALUE).filter(([id]) => id !== "e");
    ck("countPick.ts deadStock: قيمةُ كلّ راكدٍ = رصيدُه × كلفة الخادم", want.every(([id, val]) => near(got[id], val)) && Object.keys(got).length === want.length, J(got));
    ck("  والأغلى أوّلاً بهذه القيمة (أ ٣٤٤٢٫٨٦ قبل ب ٢٠٠٠ قبل ز ٥٠١)", J(d.slice(0, 4).map((x) => x.product.id)) === J(["a", "b", "g", "c"]), J(d.map((x) => x.product.id)));
  });
  await guard(ck, "expiry", async () => {
    ck("expiry.ts expiryCost: ما على الرفّ × سعر الشراء — قيمةُ الإرجاع للشركة لا المتوسّط (والعجزُ صفر)",
      ROWS.every((p) => near(F.expiryCost(p), VALUE_PP[p.id])), J(ROWS.map((p) => [p.id, F.expiryCost(p)])));
    ck("  والمجمَّعُ ليس على الرفّ", F.expiryCost({ stock: 3, pooled: true, avg_cost: 10, purchase_price: 10 }) === 0);
    const W = { returnDays: 90, criticalDays: 30 };
    const dated = [{ ...ROWS[0], expiry_date: "2026-10-30" }, { ...ROWS[1], expiry_date: "2026-11-10" }, { ...ROWS[6], expiry_date: "2026-11-20" }];
    const watch = F.expiryWatch(dated, W, "2026-10-31");
    ck("  expiryWatch (كارتُ الرئيسية والبطاقة): المنتهي ٣٦٠٠ وداخل المدّة ٢٦٠٠ بسعر الشراء", near(watch.expiredValue, 3600) && near(watch.windowValue, 2600), J({ e: watch.expiredValue, w: watch.windowValue }));
    const groups = F.groupByCompany(dated, (p) => (p.id === "g" ? "co2" : "co1"), "—", "2026-10-31");
    ck("  ومجموعاتُ الشركة به كذلك (co1 ٥٦٠٠، co2 ٦٠٠) — الكارتُ والشريحةُ رقمٌ واحد",
      near(groups.find((g) => g.company === "co1")?.value, 5600) && near(groups.find((g) => g.company === "co2")?.value, 600), J(groups.map((g) => [g.company, g.value])));
    // الكشفُ المطبوع: «الكلفة» لكلّ سطر = سعرُ الشراء، فمجموعُ الشركة والكلّيّ (من هنا) يجمعان سطورَه بالضبط
    const st = printedStatement(F, groups);
    const adds = st.sections.length === 2 && st.sections.every((s) => s.rows.length > 0 && near(s.rows.reduce((a, r) => a + r[r.length - 1], 0), s.total));
    ck("  كشفُ الإرجاع المطبوع: سطورُ كلّ شركةٍ تجمع «مجموع الشركة»، والمجموعاتُ تجمع «المجموع الكلّي — بسعر الشراء»",
      adds && near(st.sections.reduce((a, s) => a + s.total, 0), st.grand) && st.grandLabel === STMT_L.grandTotal && near(st.grand, 6200),
      J({ sections: st.sections, grand: st.grand }));
  });
}
console.log("▸ و) قيمةُ المخزون: رأسُ المال والراكد بكلفة الخادم، وفحصُ المخزن وكشفُ الإرجاع بسعر الشراء كما يُجمعان");
const LIBS = await loadLibs();
const SITES = { civ: await evalFn(civText(), "computeInventoryValue"), tot: await evalFn(totText(), "totalsOf"), ...LIBS };
check("الدوالُّ موجودةٌ وتُقيَّم من مصادرها", ["civ", "tot", "deadStock", "expiryCost", "buildReturnStatementHTML", "summarize"].every((k) => typeof SITES[k] === "function"));
await valueSuite(SITES, check);

/* ── ز) الفحصُ ليس فارغاً: كلُّ طفرةٍ يُمسكها فحصٌ واحدٌ على الأقلّ ─────────────────────────── */
console.log("▸ ز) طفراتٌ يجب أن تُمسك (والطفرةُ التي لا تجد نصَّها تفشل بصوت)");
/** طفرةٌ لم تُبنَ (نصٌّ لم يوجد، حزمةٌ لم تنحزم) لا تُحسب «مُمسكة»: تفشل باسمها. والممسكةُ تقول أوّلَ ما أسقطها. */
const caught = async (name, run) => {
  const c = counter();
  let broke = null;
  try { await run(c.ck); } catch (e) { broke = String(e?.message ?? e).split("\n")[0]; }
  if (broke) { check(`طفرة: ${name}`, false, `ما انبنت الطفرة: ${broke}`); return; }
  check(`طفرة: ${name} ⇐ «${c.names[0] ?? "—"}»${c.n > 1 ? ` و${c.n - 1} غيرُه` : ""}`, c.n > 0, "لم يسقط أيُّ فحص — الفحصُ لا يرى هذا العطل");
};
const noteMut = (from, to) => async (ck) => noteSuite(await loadNote((s) => swap(s, from, to)), ck);
await caught("البوّابةُ تُشال ⇒ تظهر لمن لا يرى الكلفة", noteMut('  if (!can("viewProfits") || restricted) return null;\n', ""));
await caught("restricted يُنسى ⇒ تظهر على جهازٍ مقفول", noteMut('if (!can("viewProfits") || restricted) return null;', 'if (!can("viewProfits")) return null;'));
await caught("المديرُ للجميع ⇒ غيرُ المدير يصحّح", noteMut('const manager = role === "manager";', "const manager = true;"));
await caught("الدورُ الأساس لا الحيّ ⇒ وضعُ المدير بالرمز لا يصحّح (والخادمُ يقبله)", noteMut("const { can, role } = usePermissions();", "const { can, baseRole: role } = usePermissions();"));
await caught("الرقمُ بلا فحص ⇒ سبعُ منازل وسالبٌ يُرسلان", noteMut("const value = parseAvgCost(text);", 'const value = text.trim() === "" ? undefined : Number(text);'));
await caught("الرفضُ يُبلع ⇒ صمت", noteMut("setErr(describeDbError(e, t));", "setErr(null);"));
await caught("«يتبع سعر الشراء» يرسل صفراً", noteMut("onClick={() => void send(null)}", "onClick={() => void send(0)}"));
await caught("المجهولُ يُعرض صفراً", noteMut("const avg = raw == null ? null : Number(raw);", "const avg = Number(raw ?? 0);"));
await caught("القائمةُ لا تُقرأ بعد التصحيح", noteMut("      onChanged();\n", ""));
await caught("المتوسّطُ بلا تقريب منزلتين", noteMut("formatDec(fromScaled(roundScaled(avg, 2), 2))", "formatDec(Number(avg))"));
const modalMut = (from, to, tag) => async (ck) => {
  const M = await loadInventory((s) => swap(s, from, to), tag);
  if (typeof M?.ProductModal !== "function") throw new Error("ما انحزم");
  await modalSuite(M, ck);
};
await caught("الحلقةُ بلا بوّابة الكلفة بالنموذج", modalMut('{product && can("viewProfits") && !restricted && <AvgCostSlot', "{product && <AvgCostSlot", "inv-mut1"));
await caught("الحلقةُ بالإنشاء أيضاً", modalMut('{product && can("viewProfits") && !restricted && <AvgCostSlot product={product}', '{can("viewProfits") && !restricted && <AvgCostSlot product={product ?? ({ id: "new" } as Product)}', "inv-mut2"));
await caught("النموذجُ يرسل avg_cost مع الحمولة", modalMut("        sold_by_weight: byWeight,\n      };", "        sold_by_weight: byWeight,\n        avg_cost: product?.avg_cost ?? null,\n      };", "inv-mut3"));
const mvMut = (from, to, suite) => async (ck) => suite(await loadMv((s) => swap(s, from, to), "mv-mut"), ck);
await caught("القطعةُ بلا نطاقها avgc", mvMut('page(() => import("@/components/inventory/AvgCostNote"), ["avgc"])', 'page(() => import("@/components/inventory/AvgCostNote"), [])', slotSuite));
await caught("«أعد المحاولة» لا تصنع قطعةً جديدة", mvMut("AvgCostNoteLazy = loadAvgCostNote(); setLazyTick", "setLazyTick", slotSuite));
await caught("السندُ يُطابَق بفرقه الدقيق", mvMut('(x.source === "waste" ? -(Number(x.posted) || 0) : (x.applied_delta ?? 0))', "(x.applied_delta ?? 0)", movementsSuite));
await caught("الاستهلاكُ بلا اسمه", mvMut('    if (m.kind === "consume") return t("pos.cat.consumables", "مستهلكات");\n', "", movementsSuite));
await caught("نصُّ الوصفة يُقصّ كغيره", async (ck) => activitySuite(await loadAct((s) => swap(s, 'const FULL_TEXT = new Set(["recipe"]);', "const FULL_TEXT = new Set<string>();"), "act-mut"), ck));
await caught("اسمُ العمود خامّاً بالشرائح (avg_cost، cost)", async (ck) => activitySuite(await loadAct((s) => swap(s, "{t(`act.f.${c.key}`, { defaultValue: c.key })}", "{c.key}"), "act-mut2"), ck));
const AVG = "p.avg_cost ?? ";
const siteMut = (name, edit) => caught(name, async (ck) => {
  const libs = await loadLibs([{ file: "src/lib/countPick.ts", edit }], "libs-mut");
  await valueSuite({ civ: await evalFn(civText(edit), "computeInventoryValue"), tot: SITES.tot, ...libs }, ck);
});
await siteMut("القيمةُ بسعر الشراء وحده (المتوسّطُ يُنسى) برأس المال والراكد", (s) => swap(s, AVG, ""));
/* والموضعان بسعر الشراء: نسخةُ البناء الأولى (بالمتوسّط) طفرةٌ تُمسك — فحصُ المخزن يقول «١٢٠٪»، والكشفُ لا يجمع سطورَه. */
const BY_AVG = "Math.max(Number(p.avg_cost ?? p.purchase_price ?? 0) || 0, 0)";
for (const [name, file, from, to] of [
  ["Inventory وحده بسعر الشراء", "civ", "Number(p.avg_cost ?? p.purchase_price ?? 0)", "Number(p.purchase_price ?? 0)"],
  ["countPick وحده بسعر الشراء", "src/lib/countPick.ts", "Number(p.avg_cost ?? p.purchase_price ?? 0)", "Number(p.purchase_price ?? 0)"],
  ["InventoryAudit بالمتوسّط وصفوفُ الخادم بسعر الشراء", "tot", "Math.max(Number(p.purchase_price) || 0, 0)", BY_AVG],
  ["expiry بالمتوسّط وسطورُ الكشف المطبوع بسعر الشراء", "src/lib/expiry.ts", "(Number(p.stock) || 0) * (Number(p.purchase_price) || 0)", `(Number(p.stock) || 0) * ${BY_AVG}`],
  ["سطرُ الكشف المطبوع بالمتوسّط ومجموعُه بسعر الشراء", "src/lib/returnPrint.ts", "c = Number(p.purchase_price) || 0;", `c = ${BY_AVG};`],
]) {
  await caught(name, async (ck) => {
    const e = (s) => swap(s, from, to);
    const libs = file.startsWith("src/") ? await loadLibs([{ file, edit: e }], "libs-mut1") : LIBS;
    await valueSuite({
      civ: file === "civ" ? await evalFn(civText(e), "computeInventoryValue") : SITES.civ,
      tot: file === "tot" ? await evalFn(totText(e), "totalsOf") : SITES.tot, ...libs,
    }, ck);
  });
}

console.log(fails ? `\n✗ avg-cost-note-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ avg-cost-note-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
