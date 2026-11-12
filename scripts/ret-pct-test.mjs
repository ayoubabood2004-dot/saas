/* ============================================================================
 * نسبةُ الراجع بشاشة البيع (المالك، ١٠/١١) — «أكو عيادات تريد ترجع بس جزء من السعر».
 *
 * الحقيقةُ المحروسة: القطعةُ ترجع للمخزن **كاملةً** بأيّ نسبة والكلفةُ تُعكس كاملة، ويُردّ للزبون نسبةٌ من سعرها
 * — والسعرُ الذي يُجمع ويُعرض ويُطبع ويُرسل واحد (`lineUnit`). فكلُّ موضعٍ يقرأ سعرَ الراجع خامّاً يردّ للزبون
 * أكثرَ مما يُقال له، أو يطبع غيرَ ما سُحب. والنسبةُ على السطر (`retPct`) فتنجو مع مسودّة السلّة.
 *
 * وسؤالُ المالك الثاني («زبون ماخذها بالدين — تنحذف من دفتر ديونه؟») جوابُه بالشِفرة: الإرجاعُ الخالص من شاشة
 * البيع (retail_return) سحبٌ من الدرج لا يعرف فاتورة ولا ديناً؛ والذي ينقص الدين «المرتجع» على الفاتورة
 * (return_invoice_items). فالشاشةُ تقول ذلك بمكانه وتفتح «المرتجع» بالبحث عن الزبون — قبل أيّ محاولة وحدها (إرجاعٌ
 * مجهولُ المصير ثمّ إرجاعُه من «المرتجع» يُرجع القطعةَ مرّتين)، والسلّةُ تُفرغ فلا ينتظر الشيءُ نفسُه «تأكيد الإرجاع».
 *
 * ويُفحص بالسلوك — SaleBuilder.tsx الحقيقيّ محزوماً ببدائلَ (نهجُ salebuilder-cons-guard) وقطعةُ RetPct حقيقيّة:
 *   أ) الدوالُّ الصِّرفة: retPctOf (الغائبُ والمكسورُ ١٠٠) وlineUnit (بالفلس: ٥٬٢٥٠ × ٢٥٪ = ١٬٣١٢٫٥).
 *   ب) الإرجاعُ الخالص بنسبة: الشريطُ ونسبُه، والسطرُ والملخّصُ وزرُّ التأكيد، وما يصل retail_return (السعرُ بنسبته،
 *      الكمّيةُ والمخزونُ كاملان، والاسمُ يحملها)، ثمّ النسبةُ ترجع ١٠٠ لبيعةٍ جديدة.
 *   ج) النسبةُ تُطبَّق على ما بالسلّة وعلى القادم، و١٠٠ تُسقط الحقل.
 *   د) السلّةُ المختلطة: سطرُ الراجع بنسبته وكلفتِه كاملة وباسمه، والمجموعُ = البيع − ما يُردّ.
 *   هـ) المسودّة: السلّةُ ترجع بنسبتها والشريطُ يقولها.
 *   و) الشريطُ يُطفأ بلا راجع ⇒ ١٠٠ للزبون التالي.
 *   ز) العروض لا تقرأ الراجع (الحزم وعروضُ الكمّية) — كانت قطعةٌ تُردّ تكمل عرضاً.
 *   ح) «سوّه من المرتجع»: البحثُ بهاتف الزبون، والسلّةُ والمسودّةُ تُفرغان؛ ولا زرَّ بعد محاولةٍ مجهولة المصير ولا بلا أب.
 *   ط) ReturnsPanel يُفتح بالبحث ولا يمسحه عند التركيب (ولا تحت أثرٍ يجري مرّتين).
 *   ي) بالنصّ: RetailSales يمرّر الزرَّ لاستعمالَي SaleBuilder ويُنسى البحثُ بالخروج؛ والقطعةُ كسولةٌ بنطاقها rpct.
 *   ك) والفحصُ ليس فارغاً: كلُّ طفرةٍ معقولة تُسقط فحصاً.
 *
 *   node scripts/ret-pct-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SB_PATH = "src/components/retail/SaleBuilder.tsx";
const RP_PATH = "src/components/retail/ReturnsPanel.tsx";
const RS_PATH = "src/pages/RetailSales.tsx";
const READ = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const J = (x) => JSON.stringify(x);
let fails = 0, passes = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passes++; console.log(`   ✓ ${name}`); } else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ── البيئة (كـsalebuilder-cons-guard) ──────────────────────────────────────── */
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); }, removeItem: (k) => { mem.delete(k); },
  clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
const listeners = new Map();
globalThis.window = {
  localStorage: globalThis.localStorage, setTimeout, clearTimeout, innerWidth: 1280, innerHeight: 900,
  addEventListener: (t, f) => { if (!listeners.has(t)) listeners.set(t, new Set()); listeners.get(t).add(f); },
  removeEventListener: (t, f) => { listeners.get(t)?.delete(f); },
  dispatchEvent: (e) => { for (const f of listeners.get(e.type) ?? []) f(e); return true; },
  matchMedia: () => ({ matches: true, addEventListener() {}, removeEventListener() {} }),
};
globalThis.document = globalThis.document ?? {
  activeElement: null, body: { style: {}, appendChild() {}, classList: { add() {}, remove() {} } },
  documentElement: { lang: "ar", dir: "rtl", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type, init) { this.type = type; this.detail = init?.detail; } };

/* t: النصُّ الافتراضيّ إن وُجد، وإلا المفتاحُ وقيمُ إقحامه (`rpct.keep|{"back":…}`) — فما يُقحم يُقرأ. */
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); if (typeof d === "string" || opt.defaultValue != null) { const s = typeof d === "string" ? d : opt.defaultValue; return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); } const ps = Object.keys(opt).filter((x) => x !== "defaultValue"); return ps.length ? k + "|" + JSON.stringify(Object.fromEntries(ps.map((x) => [x, opt[x]]))) : k; }`;
const SB = "globalThis.__sb";
/* قطعةُ RetPct حقيقيّة: الشريطُ يُضغط كما يضغطه الكاشير. */
const REAL = new Set(["react", "@/lib/utils", "@/lib/productCodes", "@/lib/errors", "@/lib/cartCap", "@/lib/cartReprice", "@/lib/retailBridge",
  "@/lib/saleCustomer", "@/lib/priceDraft", "@/lib/customerName", "@/lib/debt", "@/lib/medSale", "@/components/retail/RetPct",
  /* كلفةُ سطر المادّة (0255) بـimport() بالشاشة — الوحدةُ الحقيقية، فسطرُ الراجع بكلفة الخادم نفسِها. */
  "@/lib/consumption"]);
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar", dir: () => "rtl" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
    export const Dialog = ({ open, title, children, footer, size, onClose, ...p }) => (open ? createElement("x-Dialog", p, children, footer) : null);
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
  /* عروضُ الحزم: ما يصل المحرّكَ يُسجَّل — الراجعُ لا يصله. */
  "@/lib/promotions": `export const computePromotions = (lines) => { (${SB}.promo ||= []).push(lines); return { applied: [], totalDiscount: 0 }; }; export const getPromoRules = () => [];`,
  "@/lib/settings": `export const getDialCode = () => "+964"; export const getPreSalePrint = () => false; export const getResizableCart = () => false;
    export const getPosV2 = () => false; export const getPosCompact = () => false; export const getPosCustomerOpen = () => false; export const getClinicLogo = () => null;
    export const getClinicSocials = () => ({}); export const getClinicName = () => ""; export const getDeliveryZones = () => []; export const getQtyPromos = () => ${SB}.qtyPromos ?? [];
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
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load, ns) => { const e = { load, ns }; (globalThis.__pages ||= []).push(e); return lazy(load); };`,
  "@/components/LoadBoundary": `import { createElement } from "react"; export const LoadBoundary = ({ children, scope }) => createElement("x-LoadBoundary", { scope }, children);`,
  "@/components/retail/ConsumablesSheet": `import { createElement } from "react"; export default () => null; export const ConsumptionNotice = () => null;`,
  "@/lib/consumptionApi": "export const consumptionApi = { recipeSummary: async () => ({}) };",
  "@/components/retail/PosCustomTabs": "export const PosTabPills = () => null; export const PosTabGrid = () => null; export const PosTabEditor = () => null;",
  "@/lib/posTabsApi": "export const posTabsApi = { list: async () => [] };",
  /* البيعُ قبل الجرد (0266): مطفأٌ هنا — بابٌ بلا حالة، والشريحةُ والنافذةُ لا ترسمان (يفحصهما neg-stock-test). */
  "@/lib/negStockApi": `export const negKey = (u) => (u ?? "anon") + "|c1"; export const negSnap = () => ({ state: null, counted: new Set(), failed: false });
    export const subscribeNeg = () => () => {}; export const refreshNeg = async () => null; export const activeNow = () => false; export const liftable = () => false;
    export const daysLeft = () => 0; export const bigLifted = () => false; export const lastDayOf = (u) => new Date(u);
    export const negApi = { check: async () => ({ clinic: "c1", active: false, until: null, refused: [] }) };`,
  "@/components/negstock/NegStock": "export const NegBar = () => null; export const NegCheckoutDialog = () => null; export const NegStockCard = () => null;",
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
/** يحزم ملفّاً بعينه (`file`) بنصّه المعطى، وكلُّ ما يستورده غيرُ REAL بديلٌ (`STUB` أو مولَّد) — والملفّاتُ الأخرى كما هي. */
async function bundle(file, source, entry, { exportsList = [], stub = STUB, real = REAL } = {}) {
  const imports = importsOf(source);
  const esc = file.replace(/[/.]/g, (c) => (c === "/" ? "[\\\\/]" : "\\."));
  const fileRe = new RegExp(`${esc}$`);
  const names = exportsList.filter((n) => new RegExp(`\\b(?:function|const|let)\\s+${n}\\b`).test(source));
  const built = await esbuild.build({
    stdin: { contents: entry, resolveDir: process.cwd(), sourcefile: "ret-pct-ui.tsx", loader: "tsx" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "ret-pct",
      setup(b) {
        b.onLoad({ filter: fileRe }, () => ({ contents: `${source}\n${names.length ? `export { ${names.join(", ")} };` : ""}\n`, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path === "i18next" || a.path === "react-i18next") return { path: a.path, namespace: "rp-stub" };
          if (fileRe.test(a.importer ?? "") && !real.has(a.path) && !a.path.startsWith("react/")) return { path: a.path, namespace: "rp-stub" };
          return undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "rp-stub" }, (a) => ({ contents: stub[a.path] ?? autoStub(a.path, imports.get(a.path) ?? new Set()), loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "ret-pct-"));
  const out = join(dir, "ui.mjs");
  writeFileSync(out, built.outputFiles[0].text);
  globalThis.__pages = [];
  try { return await import(pathToFileURL(out).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}
const buildSB = (src) => bundle(SB_PATH, src,
  `export * from "./${SB_PATH}";\nexport { money } from "./src/lib/utils.ts";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`,
  { exportsList: ["retPctOf", "lineUnit"] });

const RP_STUB = {
  ...STUB,
  "@/lib/repo": `export const repo = { searchInvoices: async () => [], listInvoiceItems: async () => [] };`,
  "@/lib/settings": "export const getInvoicesPaged = () => true;",
};
const buildRP = (src) => bundle(RP_PATH, src,
  `export * from "./${RP_PATH}";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`,
  { stub: RP_STUB, real: new Set(["react", "@/lib/utils", "@/lib/debt"]) });

/* ── البيانات ───────────────────────────────────────────────────────────────── */
const PRD = (o) => ({ barcode: null, stock: 50, has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null, farm_id: null, pooled: false, created_at: "2026-01-01", avg_cost: null, ...o });
const PA = PRD({ id: "pA", name: "أموكسي", purchase_price: 1250, sell_price: 2000 });
const PK = PRD({ id: "pK", name: "طوق", purchase_price: 4000, sell_price: 10000, stock: 10 });
const PR = PRD({ id: "pR", name: "شامبو", purchase_price: 3000, sell_price: 5250 });
const DRAFT_KEY = "vp_sale_draft_c1";
const flush = async () => { for (let i = 0; i < 16; i++) await new Promise((r) => setImmediate(r)); };

function freshEnv(o = {}) {
  const log = { checkout: [], ret: [], opened: [], errors: [] };
  globalThis.__sb = {
    log, promo: [], qtyPromos: o.qtyPromos ?? [],
    user: { id: "u1", clinic_id: "c1", full_name: "د. سارة", email: "s@x" },
    perm: { role: "veterinarian", baseRole: "veterinarian", can: () => true },
    ov: { active: false, until: null, deviceLocked: false, restricted: false, stockLocked: false },
    repo: {
      retailCheckout: async (items, meta) => {
        log.checkout.push({ items: JSON.parse(J(items)), meta });
        return { id: "inv-1", clinic_id: "c1", total: meta.final_total, amount_paid: meta.amount_paid, profit: 0, cost_total: 0, subtotal: meta.final_total, discount: 0,
          customer_name: null, customer_phone: null, pet_name: null, status: "paid", created_at: "2026-11-10T09:00:00.000Z", recorded_at: null, item_count: items.length };
      },
      retailReturn: async (items, meta) => {
        log.ret.push({ items: JSON.parse(J(items)), meta });
        if (o.returnFails) throw new TypeError("Failed to fetch");
        return { total: items.reduce((s, it) => s + Math.round(it.qty * it.unit_price * 100) / 100, 0), lines: items.length, method: "cash" };
      },
      logClientEvent: async () => {}, priceRaisePrior: async () => ({}), listClinicVisitsForPet: async () => [],
    },
    toast: { toast() {}, success() {}, warn() {}, error: (a, b) => { log.errors.push([a, b ?? null]); } },
    scanner: null,
  };
  return log;
}
async function session(M, { draft = null, products = [PA, PK, PR], withOpen = true, ...env } = {}) {
  mem.clear();
  if (draft) mem.set(DRAFT_KEY, J(draft));
  const log = freshEnv(env);
  const props = { products, clinicId: "c1", onSold() {}, ...(withOpen ? { onOpenReturns: (q) => log.opened.push(q) } : {}) };
  const ui = M.mount(M.React.createElement(M.SaleBuilder, props));
  await flush();
  const btn = (pred) => ui.all().find((n) => n.type === "button" && pred(ui.text(n)));
  return {
    ui, log,
    cart: () => JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? [],
    tap: async (id) => { ui.click(ui.find("data-prodcard", id)); await flush(); },
    retMode: async () => { ui.click(ui.find("data-retmode")); await flush(); },
    pick: async (p) => { ui.click(ui.find("data-retpct", String(p))); await flush(); },
    pressed: () => { const n = ui.all().find((x) => x.props && "data-retpct" in x.props && x.props["aria-pressed"] === true); return n ? Number(n.props["data-retpct"]) : null; },
    chips: () => ui.all().filter((x) => x.props && "data-retpct" in x.props).map((x) => Number(x.props["data-retpct"])),
    lineTotal: (id) => { const n = ui.find("data-linetotal", id); return n ? ui.text(n) : null; },
    retChip: () => { const n = ui.find("data-retchip"); return n ? ui.text(n) : null; },
    summary: () => { const n = ui.find("data-retsummary"); return n ? ui.text(n) : null; },
    pure: () => { const n = ui.find("data-purereturn"); return n ? ui.text(n) : null; },
    keep: () => { const n = ui.find("data-retkeep"); return n ? ui.text(n) : null; },
    openBtn: () => ui.find("data-retopen"),
    doReturn: async () => { ui.click(ui.find("data-doreturn")); for (let i = 0; i < 4; i++) await flush(); },
    checkout: async () => { ui.click(btn((s) => s.startsWith("إصدار الفاتورة"))); for (let i = 0; i < 4; i++) await flush(); },
    promoStrip: () => ui.all().some((n) => ui.text(n) === "عروض متاحة على هذي السلة"),
    end: () => ui.unmount(),
  };
}

/* ── الجولة ─────────────────────────────────────────────────────────────────── */
async function run(M, RP, c) {
  const m = (n) => M.money(n);
  /* أ) الدوالُّ الصِّرفة */
  {
    const P = M.retPctOf, U = M.lineUnit;
    c("أ١ retPctOf: الغائبُ ١٠٠، وسطرُ البيع ١٠٠ ولو حمل نسبة، والصفرُ والسالبُ وفوق ١٠٠ والنصُّ ١٠٠",
      P({ ret: true }) === 100 && P({ ret: true, retPct: 50 }) === 50 && P({ ret: false, retPct: 50 }) === 100
      && P({ ret: true, retPct: 0 }) === 100 && P({ ret: true, retPct: -5 }) === 100 && P({ ret: true, retPct: 150 }) === 100 && P({ ret: true, retPct: "x" }) === 100);
    c("أ٢ lineUnit بالفلس: ٥٬٢٥٠ × ٢٥٪ = ١٬٣١٢٫٥، و٠٫١ × ٣٠٪ = ٠٫٠٣، وسطرُ البيع سعرُه",
      U({ ret: true, retPct: 25, unit_price: 5250 }) === 1312.5 && U({ ret: true, retPct: 30, unit_price: 0.1 }) === 0.03 && U({ ret: false, retPct: 25, unit_price: 999.99 }) === 999.99
      && U({ ret: true, unit_price: 2000 }) === 2000, J([U({ ret: true, retPct: 25, unit_price: 5250 }), U({ ret: true, retPct: 30, unit_price: 0.1 })]));
  }

  /* ب) الإرجاعُ الخالص بنسبة */
  {
    const S = await session(M);
    await S.retMode();
    c("ب١ «راجع» يُظهر النسبَ كما سمّاها المالك، و١٠٠ مختارة", J(S.chips()) === J([100, 75, 50, 30, 25, 20]) && S.pressed() === 100, J({ chips: S.chips(), p: S.pressed() }));
    await S.pick(50);
    await S.tap("pA"); await S.tap("pA");
    const ln = S.cart().find((l) => l.id === "r:pA");
    c("  ٥٠٪ ثمّ مسحتان: سطرُ راجعٍ ×٢ بنسبته على السطر (تنجو مع المسودّة)", ln?.qty === 2 && ln?.retPct === 50 && ln?.unit_price === 2000, J(ln));
    c("  والسطرُ يقولها: «راجع 50%» و− ٢٬٠٠٠ (لا ٤٬٠٠٠)", S.retChip()?.includes("50%") && S.lineTotal("r:pA") === `− ${m(2000)}`, J({ chip: S.retChip(), total: S.lineTotal("r:pA") }));
    c("  والإرجاعُ الخالص بنسبته وزرُّه بما يُردّ", S.pure()?.includes("50%") && S.pure()?.includes(m(2000)) && !S.pure()?.includes(m(4000) + ")"), S.pure());
    c("  وما يبقى للعيادة مكتوبٌ قبل الضغطة (يُردّ ٢٬٠٠٠ — ٥٠٪ من ٤٬٠٠٠)", (S.keep() ?? "").includes(J({ back: m(2000), pct: 50, full: m(4000) }).slice(1, -1)), S.keep());
    await S.doReturn();
    const r = S.log.ret[0];
    const it = r?.items?.[0] ?? {};
    c("ب٢ retail_return يصله سعرُ الوحدة بنسبته، والكمّيةُ والمخزونُ كاملان، والاسمُ يحملها", S.log.ret.length === 1 && it.unit_price === 1000 && it.qty === 2 && it.stock_qty === 2 && it.name === "أموكسي (50%)", J(r));
    c("  وبعدها بيعةٌ جديدة: السلّةُ فارغة والنسبةُ ١٠٠", S.cart().length === 0 && S.pressed() === 100, J({ cart: S.cart(), p: S.pressed() }));
    S.end();
  }

  /* ج) النسبةُ على ما بالسلّة وعلى القادم */
  {
    const S = await session(M);
    await S.retMode();
    await S.tap("pA");
    c("ج١ قبل الاختيار: راجعٌ بلا نسبة (١٠٠) وبسعره", S.cart()[0]?.retPct === undefined && S.lineTotal("r:pA") === `− ${m(2000)}`);
    await S.pick(25);
    c("  ٢٥٪ تُطبَّق على السطر القائم", S.cart()[0]?.retPct === 25 && S.lineTotal("r:pA") === `− ${m(500)}`, J(S.cart()));
    await S.tap("pR");
    const r2 = S.cart().find((l) => l.id === "r:pR");
    c("  والقادمُ يأخذها: ٥٬٢٥٠ × ٢٥٪ = ١٬٣١٢٫٥", r2?.retPct === 25 && S.lineTotal("r:pR") === `− ${m(1312.5)}`, J({ r2, t: S.lineTotal("r:pR") }));
    await S.pick(100);
    c("  و١٠٠ تُسقط الحقلَ عن السطور (السعرُ كاملاً)", S.cart().every((l) => !("retPct" in l)) && S.lineTotal("r:pA") === `− ${m(2000)}`, J(S.cart()));
    S.end();
  }

  /* د) السلّةُ المختلطة */
  {
    const S = await session(M);
    await S.retMode(); await S.pick(30); await S.tap("pA");
    await S.retMode(); await S.tap("pK");
    c("د١ الملخّصُ يقول النسبة: «راجع (1) · 30%» و− ٦٠٠", (S.summary() ?? "").includes("30%") && (S.summary() ?? "").includes(m(600)), S.summary());
    await S.checkout();
    const ck = S.log.checkout[0];
    const ret = ck?.items?.find((x) => x.qty < 0) ?? {}, sale = ck?.items?.find((x) => x.qty > 0) ?? {};
    c("  البيعةُ: سطرُ الراجع بنسبته (٦٠٠) وسالبٌ ومخزونُه كامل، واسمُه «راجع 30% — أموكسي»", ret.unit_price === 600 && ret.qty === -1 && ret.stock_qty === -1 && ret.name === "راجع 30% — أموكسي", J(ret));
    c("  وكلفتُه كاملة (القطعةُ للرفّ — الباقي ربحٌ للعيادة)، والبيعُ بسعره", ret.unit_cost === 1250 && sale.unit_price === 10000, J({ ret, sale }));
    c("  والمجموعُ = ١٠٬٠٠٠ − ٦٠٠", ck?.meta?.final_total === 9400 || ck?.meta?.total === 9400 || J(ck?.meta ?? {}).includes("9400"), J(ck?.meta));
    S.end();
  }

  /* هـ) المسودّة */
  {
    const line = { id: "r:pA", kind: "product", name: "أموكسي", barcode: null, unit_price: 2000, unit_cost: 1250, qty: 1, stock: null, product_id: "pA",
      subcategory: null, ret: true, retPrior: null, priceManual: false, retPct: 50 };
    const S = await session(M, { draft: { cart: [line], name: "", phone: "", salePets: [], discountType: "percent", discountValue: "", finalOverride: null, cashierId: null } });
    c("هـ١ سلّةٌ رجعت من المسودّة بنسبتها: السطرُ والإرجاعُ الخالص بنصف السعر", S.lineTotal("r:pA") === `− ${m(1000)}` && (S.pure() ?? "").includes("50%"), J({ t: S.lineTotal("r:pA"), p: S.pure() }));
    await S.retMode();
    c("  والشريطُ يفتح عليها (٥٠ لا ١٠٠)", S.pressed() === 50, String(S.pressed()));
    await S.tap("pR");
    c("  والقادمُ يأخذها", S.cart().find((l) => l.id === "r:pR")?.retPct === 50, J(S.cart()));
    S.end();
  }

  /* و) الشريطُ يُطفأ بلا راجع ⇒ ١٠٠ */
  {
    const S = await session(M);
    await S.retMode(); await S.pick(50); await S.retMode(); await S.retMode();
    c("و١ نسبةٌ اختيرت ثمّ أُطفئ «راجع» بلا سطر: تعود ١٠٠ للزبون التالي", S.pressed() === 100, String(S.pressed()));
    S.end();
  }

  /* ز) العروضُ لا تقرأ الراجع */
  {
    const rule = { id: "q1", name: null, kind: "product", ids: ["pA", "pK"], names: [], qty: 2, mode: "off", off: 500, bundlePrice: 0, active: true };
    const S = await session(M, { qtyPromos: [rule] });
    await S.retMode(); await S.tap("pA"); await S.retMode(); await S.tap("pK");
    const last = globalThis.__sb.promo.at(-1) ?? [];
    c("ز١ عروضُ الحزم: الراجعُ لا يصل المحرّك", globalThis.__sb.promo.length > 0 && last.every((l) => !l.ret) && last.some((l) => l.id === "p:pK"), J(last.map((l) => l.id)));
    c("  وعرضُ «كل قطعتين» لا يكتمل بقطعةٍ تُردّ (بيعٌ واحد + راجعٌ واحد)", !S.promoStrip());
    S.end();
  }

  /* ح) «سوّه من المرتجع» */
  {
    const line = { id: "r:pA", kind: "product", name: "أموكسي", barcode: null, unit_price: 2000, unit_cost: 1250, qty: 1, stock: null, product_id: "pA",
      subcategory: null, ret: true, retPrior: null, priceManual: false };
    const draft = { cart: [line], name: "ابو علي", phone: "07701234567", salePets: [], discountType: "percent", discountValue: "", finalOverride: null, cashierId: null };
    let S = await session(M, { draft });
    c("ح١ الإرجاعُ الخالص يسأل «ماخذها بالدين؟» ويعرض الطريق", !!S.ui.find("data-retdebt") && !!S.openBtn());
    S.ui.click(S.openBtn()); await flush();
    c("  الضغطةُ تفتح «المرتجع» بهاتف الزبون، والسلّةُ والمسودّةُ تُفرغان (لا يُرجَع الشيءُ نفسُه مرّتين)", J(S.log.opened) === J(["07701234567"]) && S.cart().length === 0 && S.log.ret.length === 0, J({ o: S.log.opened, c: S.cart() }));
    S.end();

    S = await session(M, { draft: { ...draft, phone: "", name: "ابو علي 07709998877" } });
    S.ui.click(S.openBtn()); await flush();
    c("  والرقمُ المكتوب بخانة الاسم يُبحث به (لا الاسمُ وذيلُه)", J(S.log.opened) === J(["07709998877"]), J(S.log.opened));
    S.end();

    S = await session(M, { draft, returnFails: true });
    await S.doReturn();
    c("ح٢ بعد محاولةٍ لم يُعرف مصيرُها لا زرّ (قد يكون انسجّل)", S.log.ret.length === 1 && !S.openBtn() && S.cart().length === 1, J({ r: S.log.ret.length, o: !!S.openBtn() }));
    S.end();

    S = await session(M, { draft, withOpen: false });
    c("ح٣ بلا أبٍ يفتح «المرتجع» (شاشةُ الجملة): الملاحظةُ بلا زرّ", !!S.ui.find("data-retdebt") && !S.openBtn());
    S.end();
  }

  /* ط) ReturnsPanel يُفتح بالبحث */
  {
    const ui = RP.mount(RP.React.createElement(RP.React.StrictMode, null, RP.React.createElement(RP.ReturnsPanel, { invoices: [], onChanged() {}, initialQ: "07701234567" })));
    await flush();
    const inp = ui.find("data-retsearch");
    c("ط١ «المرتجع» يُفتح والبحثُ فيه هاتفُ الزبون — لا يُمسح عند التركيب ولا تحت StrictMode", inp?.props.value === "07701234567", String(inp?.props.value));
    ui.unmount();
    const ui2 = RP.mount(RP.React.createElement(RP.ReturnsPanel, { invoices: [], onChanged() {} }));
    await flush();
    c("  وبلا بحثٍ يُفتح فارغاً كما كان", ui2.find("data-retsearch")?.props.value === "");
    ui2.unmount();
  }
}

/* ي) بالنصّ */
function textChecks(sb, rs, c) {
  const uses = rs.match(/<SaleBuilder\b[\s\S]*?\/>/g) ?? [];
  c("ي١ RetailSales: كلُّ استعمالٍ لـSaleBuilder يمرّر onOpenReturns ويفتح «المرتجع» بالبحث", uses.length >= 2 && uses.every((u) => /onOpenReturns=\{\(q\) => \{ setReturnsQ\(q\); setTab\("returns"\); \}\}/.test(u)), String(uses.length));
  c("  و«المرتجع» يأخذ البحث، ويُنسى بالخروج من التبويب", /<ReturnsPanel [^>]*initialQ=\{returnsQ\}/.test(rs) && /useEffect\(\(\) => \{ if \(tab !== "returns"\) setReturnsQ\(null\); \}, \[tab\]\);/.test(rs));
  c("  والقطعةُ كسولةٌ بنطاقها rpct ولا تُستورد ثابتاً", /page\(\(\) => import\("@\/components\/retail\/RetPct"\)[^\n]*\["rpct"\]\)/.test(sb) && !/^import [^\n]*RetPct/m.test(sb));
  const hot = JSON.parse(READ("src/i18n/hot-paths.json"));
  c("  ونطاقُها مملوكٌ لـRetPct.tsx", hot.owned?.rpct === "src/components/retail/RetPct.tsx");
  const ar = JSON.parse(READ("src/i18n/ar.json"));
  c("  وشريطُ الراجع ما عاد يَعِد «يتقاص من حساب الزبون» (الدينُ لا ينقص من هنا)", !ar.retail.retModeOn.includes("حساب الزبون") && ar.rpct?.how?.includes("ما ينقص دين"));
}

/* ── التشغيل ───────────────────────────────────────────────────────────────── */
const SB0 = READ(SB_PATH), RP0 = READ(RP_PATH), RS0 = READ(RS_PATH);
const BASE = await buildSB(SB0), RPB = await buildRP(RP0);
console.log("▸ نسبةُ الراجع وطريقُ الدين — بالسلوك");
await run(BASE, RPB, check);
console.log("▸ بالنصّ");
textChecks(SB0, RS0, check);

/* ── ك) الطفرات ──────────────────────────────────────────────────────────────── */
console.log("▸ ك) الطفرات");
const swap = (src, from, to) => { if (!src.includes(from)) throw new Error(`نصُّ الطفرة غائب: ${from.slice(0, 70)}`); return src.replace(from, to); };
const MUTANTS = [
  ["السعرُ الواحد يتجاهل النسبة", "sb", "  return p === 100 ? l.unit_price : Math.round((Math.round(l.unit_price * 100) * p) / 100) / 100;", "  return l.unit_price;"],
  ["المجموعُ بالسعر الخامّ", "sb", "const subtotal = cart.reduce((s, l) => s + sign(l) * l.qty * lineUnit(l), 0);", "const subtotal = cart.reduce((s, l) => s + sign(l) * l.qty * l.unit_price, 0);"],
  ["الإرجاعُ الخالص يرسل السعرَ الخامّ", "sb", "qty: l.qty, unit_price: lineUnit(l), unit_cost: l.unit_cost,\n          stock_qty,", "qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost,\n          stock_qty,"],
  ["البيعةُ ترسل الراجعَ بسعره الخامّ", "sb", "qty: s * l.qty, unit_price: lineUnit(l), unit_cost: l.unit_cost,", "qty: s * l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost,"],
  ["الاسمُ لا يحمل النسبة", "sb", "name: pct < 100 ? `${l.name} (${pct}%)` : l.name,", "name: l.name,"],
  ["الاختيارُ لا يمسّ السطورَ القائمة", "sb", "    setCart((c) => c.map((l) => {\n      if (!l.ret) return l;", "    setCart((c) => c.map((l) => {\n      return l;"],
  ["القادمُ لا يأخذ النسبة", "sb", "        ret: true, retPrior: pr, priceManual: !!pr,\n        ...(retPct < 100 ? { retPct } : {}),", "        ret: true, retPrior: pr, priceManual: !!pr,"],
  ["البيعةُ الجديدة تُبقي النسبة", "sb", "setCart([]); setRetPct(100);", "setCart([]);"],
  ["المسودّةُ ترجع بشريطٍ على ١٠٠", "sb", "useState<number>(() => retPctOf(draft0?.cart?.find((l) => l.ret) ?? { ret: true }))", "useState<number>(100)"],
  ["إطفاءُ الراجع يُبقي النسبة", "sb", "useEffect(() => { if (!retMode && !cart.some((l) => l.ret)) setRetPct(100); }, [retMode, cart]);", ""],
  ["عروضُ الحزم تقرأ الراجع", "sb", "computePromotions(cart.filter((l) => !l.ret), promoRules)", "computePromotions(cart, promoRules)"],
  ["عرضُ الكمّية يكتمل بقطعةٍ تُردّ", "sb", "    if (l.ret) return false;\n    if (r.kind === \"service\")", "    if (r.kind === \"service\")"],
  ["الطريقُ لا يُفرغ السلّة", "sb", "                        onOpenReturns(phone.trim() || c.phone || c.name);\n                        reset();", "                        onOpenReturns(phone.trim() || c.phone || c.name);"],
  ["الطريقُ بعد محاولةٍ مجهولة", "sb", "onOpenReturns={onOpenReturns && !busy && !saleRefSaved ? () => {", "onOpenReturns={onOpenReturns && !busy ? () => {"],
  ["البحثُ بالاسم وذيله", "sb", "onOpenReturns(phone.trim() || c.phone || c.name);", "onOpenReturns(phone.trim() || name.trim());"],
  ["المرتجعُ يتجاهل البحثَ المعطى", "rp", "const [q, setQ] = useState(initialQ ?? \"\");", "const [q, setQ] = useState(\"\");"],
  ["المرتجعُ يمسح البحثَ عند التركيب", "rp", "    if (prevPicked.current === picked) return;\n", ""],
];
let onCrash = null;
process.on("unhandledRejection", (e) => { if (onCrash) onCrash(e); else { console.error(e); process.exit(1); } });
for (const [name, file, from, to] of MUTANTS) {
  const fell = [];
  try {
    const sbSrc = file === "sb" ? swap(SB0, from, to) : SB0;
    const rpSrc = file === "rp" ? swap(RP0, from, to) : RP0;
    const M = file === "sb" ? await buildSB(sbSrc) : BASE;
    const R = file === "rp" ? await buildRP(rpSrc) : RPB;
    onCrash = (e) => fell.push(`انهار: ${e?.message ?? e}`);
    await run(M, R, (n, ok) => { if (!ok) fell.push(n); });
    textChecks(sbSrc, RS0, (n, ok) => { if (!ok) fell.push(n); });
  } catch (e) { fell.push(`انهار: ${e?.message ?? e}`); }
  await new Promise((r) => setTimeout(r, 20));
  onCrash = null;
  check(`طفرة «${name}» تُمسك (${fell.length})`, fell.length > 0 && !fell.every((f) => f.startsWith("انهار: نصُّ الطفرة")), fell.slice(0, 2).join(" | ") || "مرّت كلُّ الفحوص — الفحصُ أعمى عنها");
}

console.log(`\n${fails ? "✗" : "✓"} ret-pct-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
