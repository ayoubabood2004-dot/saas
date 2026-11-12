/* ============================================================================
 * البيعُ بالكارتون والمغلّف من المسح (0267) — «دكتور كلّي باركود الكارتون ما ينمسح بقارئ الباركود» (المالك، ١٢/١١).
 *
 * المقيسُ قبل التصليح (كروميوم، الوضع التجريبيّ): مسحُ باركود كارتونٍ معرَّفٍ على مادّته يقول «الباركود … مو موجود بمخزنك — إذا
 * المادّة عندك أضفها من المخزون» — والإضافةُ يرفضها حارسُ المستويات. الحقيقةُ المحروسة هنا:
 *   • رمزُ الكارتون ⇒ سطرُ كارتونٍ (`k:<مادّة>:<كارتون>`) بسعره (المكتوب، وإلا العلبةُ × العدد)، وstock_qty = العدد × علبه، وunit_label
 *     اسمُه، وكلفةُ الخادم (المتوسّط × العدد، مرآةُ 0267)؛ ورمزُ المغلّف ⇒ سطرُ مادّته بوحدتها الصغرى.
 *   • الكارتونُ والعلبُ من المادّة نفسِها يقتسمان رفّاً واحداً (shareCap)، و«أقلّ من كارتون» يقول ما يبقى بعد السلّة.
 *   • لا كارتونَ قبل أن يعرفه الخادم (pack_sale_ready)، ولا بالراجع، ولا بكارتونٍ تبدّل على الصفّ قبل البيعة.
 *   • القائمةُ البائتة تُسأل الخادمَ (product_level_by_code) قبل «مو موجود».
 *   • رفعُ سعر العلبة يحرّك الكارتونَ المحسوب لا المكتوب، والعروضُ لا تقرأ الكارتون.
 * ويُفحص بالسلوك — SaleBuilder.tsx الحقيقيّ محزوماً ببدائلَ (نهجُ ret-pct-test)، والبابُ (packSale) ونصوصُه (PackSale) والمرآةُ
 * (consumption) وحكمُ الطزاجة حقيقيّة — ثمّ طفراتٌ معقولة كلٌّ يُسقطها فحص.
 *
 *   node scripts/pack-sale-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const SB_PATH = "src/components/retail/SaleBuilder.tsx";
const READ = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n");
const J = (x) => JSON.stringify(x);
let fails = 0, passes = 0;
const check = (name, ok, detail = "") => {
  if (ok) { passes++; console.log(`   ✓ ${name}`); } else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ── البيئة (كـret-pct-test) ──────────────────────────────────────────────── */
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
globalThis.performance = globalThis.performance ?? { now: () => Date.now() };

/* t: النصُّ الافتراضيّ إن وُجد، وإلا المفتاحُ وقيمُ إقحامه (`pks.short|{"stock":…}`) — فما يُقحم يُقرأ. */
const T = `(k, d, o) => { const opt = d && typeof d === "object" ? d : (o || {}); if (typeof d === "string" || opt.defaultValue != null) { const s = typeof d === "string" ? d : opt.defaultValue; return String(s).replace(/{{(\\w+)}}/g, (_, v) => (opt[v] ?? "")); } const ps = Object.keys(opt).filter((x) => x !== "defaultValue"); return ps.length ? k + "|" + JSON.stringify(Object.fromEntries(ps.map((x) => [x, opt[x]]))) : k; }`;
const SB = "globalThis.__sb";
const REAL = new Set(["react", "@/lib/utils", "@/lib/productCodes", "@/lib/errors", "@/lib/cartCap", "@/lib/cartReprice", "@/lib/retailBridge",
  "@/lib/saleCustomer", "@/lib/priceDraft", "@/lib/customerName", "@/lib/debt", "@/lib/medSale",
  "@/lib/consumption", "@/lib/freshSale", "@/lib/freshness", "@/lib/sellable",
  /* الحقيقيّة: البابُ ونصوصُه — والخادمُ (./supabase داخل الباب) بديلٌ بيد الفحص. */
  "@/lib/packSale", "@/components/retail/PackSale"]);
const STUB = {
  "react-i18next": `export const useTranslation = () => ({ t: ${T}, i18n: { language: "ar", dir: () => "rtl" } }); export default {};`,
  i18next: `const t = ${T}; const i = { t, language: "ar", use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => "rtl" }; export default i;`,
  "@/i18n": "export const ensureOwned = async () => {}; export const ensureDictionary = async () => {};",
  "./supabase": `export const supabase = { rpc: async (fn, args) => ${SB}.rpc(fn, args) };`,
  "framer-motion": `import { createElement } from "react";
    const strip = ({ initial, animate, exit, transition, layout, whileTap, whileHover, variants, ...rest }) => rest;
    export const AnimatePresence = ({ children }) => children;
    export const motion = new Proxy({}, { get: (_t, tag) => (p) => createElement(tag, strip(p)) });`,
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, rightIcon, loading, variant, size, ...p }) => createElement("button", p, children);
    export const Dialog = ({ open, title, children, footer, size, onClose, ...p }) => (open ? createElement("x-Dialog", { ...p, "data-dlgtitle": title }, children, footer) : null);
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
  "@/lib/promotions": `export const computePromotions = (lines) => { (${SB}.promo ||= []).push(lines); return { applied: [], totalDiscount: 0 }; }; export const getPromoRules = () => [];`,
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
  "@/lib/lazyPage": `import { lazy } from "react"; export const page = (load, ns) => { const e = { load, ns }; (globalThis.__pages ||= []).push(e); return lazy(load); };`,
  "@/components/LoadBoundary": `import { createElement } from "react"; export const LoadBoundary = ({ children, scope }) => createElement("x-LoadBoundary", { scope }, children);`,
  "@/components/retail/ConsumablesSheet": `export default () => null; export const ConsumptionNotice = () => null;`,
  "@/lib/consumptionApi": "export const consumptionApi = { recipeSummary: async () => ({}) };",
  "@/components/retail/PosCustomTabs": "export const PosTabPills = () => null; export const PosTabGrid = () => null; export const PosTabEditor = () => null;",
  "@/lib/posTabsApi": "export const posTabsApi = { list: async () => [] };",
  "@/lib/negStockApi": `export const negKey = (u) => (u ?? "anon") + "|c1"; export const negSnap = () => ({ state: null, counted: new Set(), failed: false });
    export const subscribeNeg = () => () => {}; export const refreshNeg = async () => null; export const activeNow = () => false; export const liftable = () => false;
    export const daysLeft = () => 0; export const bigLifted = () => false; export const lastDayOf = (u) => new Date(u);
    export const negApi = { check: async () => ({ clinic: "c1", active: false, until: null, refused: [] }) };`,
  "@/components/negstock/NegStock": "export const NegBar = () => null; export const NegCheckoutDialog = () => null; export const NegStockCard = () => null;",
  "@/components/retail/RetPct": "export const RetModeBar = () => null; export const RetPureNote = () => null;",
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
  const names = ["lineStockQty", "isPackLine"].filter((n) => new RegExp(`\\bfunction\\s+${n}\\b`).test(source));
  const built = await esbuild.build({
    stdin: {
      contents: `export * from "./${SB_PATH}";\nexport { money } from "./src/lib/utils.ts";\nexport { unitCap } from "./src/lib/cartCap.ts";\n`
        + `export { packPerNano, productLineCostCents } from "./src/lib/consumption.ts";\nexport { mount } from "./scripts/react-mini-host.js";\nexport * as React from "react";`,
      resolveDir: process.cwd(), sourcefile: "pack-sale-ui.tsx", loader: "tsx",
    },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent", jsx: "automatic",
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"development"' }, banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "pack-sale",
      setup(b) {
        b.onLoad({ filter: fileRe }, () => ({ contents: `${source}\n${names.length ? `export { ${names.join(", ")} };` : ""}\n`, loader: "tsx" }));
        b.onResolve({ filter: /.*/ }, (a) => {
          if (a.path === "i18next" || a.path === "react-i18next") return { path: a.path, namespace: "ps-stub" };
          if (a.path === "./supabase" && /packSale\.ts$/.test(a.importer ?? "")) return { path: a.path, namespace: "ps-stub" };
          if (fileRe.test(a.importer ?? "") && !REAL.has(a.path) && !a.path.startsWith("react/")) return { path: a.path, namespace: "ps-stub" };
          return undefined;
        });
        b.onLoad({ filter: /.*/, namespace: "ps-stub" }, (a) => ({ contents: STUB[a.path] ?? autoStub(a.path, imports.get(a.path) ?? new Set()), loader: "jsx", resolveDir: process.cwd() }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "pack-sale-"));
  const out = join(dir, "ui.mjs");
  writeFileSync(out, built.outputFiles[0].text);
  globalThis.__pages = [];
  try { return await import(pathToFileURL(out).href); } finally { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } }
}

/* ── البيانات ───────────────────────────────────────────────────────────────── */
const PRD = (o) => ({ barcode: null, alt_codes: [], stock: 100, has_sub_unit: false, units_per_box: null, sub_unit_name: null, sub_unit_price: null, farm_id: null,
  pooled: false, created_at: "2026-01-01", avg_cost: null, price_currency: "IQD", packs: null, sub_codes: [], unit_name: null, sold_by_weight: false, ...o });
const K24 = { id: "k24", name: "كارتون", codes: ["CTN-24"], per: 24, purchase_price: null, sell_price: null };
const K6 = { id: "k6", name: "شدّة", codes: ["SHD-6"], per: 6, purchase_price: null, sell_price: 7000 };
const PC = PRD({ id: "pC", name: "مغلف فيتامين", barcode: "B-1", purchase_price: 900, sell_price: 1250, packs: [K24, K6] });
const PS = PRD({ id: "pS", name: "علبة حبوب", barcode: "B-2", purchase_price: 1200, sell_price: 2000, has_sub_unit: true, units_per_box: 10, sub_unit_name: "حبّة",
  sub_unit_price: 250, sub_codes: ["SUB-10"] });
const PV = PRD({ id: "pV", name: "بمتوسّط", barcode: "B-3", purchase_price: 900, avg_cost: 833.333333, sell_price: 1250, packs: [{ ...K24, codes: ["CTN-V"] }] });
const DRAFT_KEY = "vp_sale_draft_c1";
const flush = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };

function freshEnv(o = {}) {
  const log = { checkout: [], errors: [], ok: [], rpc: [] };
  const rows = () => o.serverRows ?? globalThis.__sb.products;
  globalThis.__sb = {
    log, promo: [], products: [],
    user: { id: "u1", clinic_id: "c1", full_name: "د. سارة", email: "s@x" },
    perm: { role: "veterinarian", baseRole: "veterinarian", can: () => true },
    ov: { active: false, until: null, deviceLocked: false, restricted: false, stockLocked: false },
    rpc: async (fn, args) => {
      log.rpc.push([fn, args]);
      if (fn === "pack_sale_ready") return { data: o.ready ?? true, error: null };
      if (fn === "product_level_by_code") return { data: o.levelRows ?? [], error: null };
      return { data: null, error: { code: "42883" } };
    },
    repo: {
      retailCheckout: async (items, meta) => {
        log.checkout.push({ items: JSON.parse(J(items)), meta });
        return { id: "inv-1", clinic_id: "c1", total: meta.final_total, amount_paid: meta.amount_paid, profit: 0, cost_total: 0, subtotal: meta.final_total, discount: 0,
          customer_name: null, customer_phone: null, pet_name: null, status: "paid", created_at: "2026-11-12T09:00:00.000Z", recorded_at: null, item_count: items.length };
      },
      getProductByBarcode: async () => undefined,
      getProductById: async (id) => rows().find((p) => p.id === id),
      getSectionPool: async () => 0,
      logClientEvent: async () => {}, priceRaisePrior: async () => ({}), listClinicVisitsForPet: async () => [],
    },
    toast: { toast() {}, success: (a) => { log.ok.push(a); }, warn() {}, error: (a, b) => { log.errors.push([a, b ?? null]); } },
    scanner: null,
  };
  return log;
}
async function session(M, { draft = null, products = [PC, PS, PV], ...env } = {}) {
  mem.clear();
  if (draft) mem.set(DRAFT_KEY, J(draft));
  const log = freshEnv(env);
  globalThis.__sb.products = products;
  const { createElement, useState } = M.React;
  let setProducts = null;
  const Host = () => {
    const [ps, setPs] = useState(products);
    setProducts = (x) => { globalThis.__sb.products = x; setPs(x); };
    return createElement(M.SaleBuilder, { products: ps, clinicId: "c1", onSold() {} });
  };
  const ui = M.mount(createElement(Host));
  await flush();
  const btn = (pred) => ui.all().find((n) => n.type === "button" && pred(ui.text(n)));
  return {
    ui, log,
    cart: () => JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? [],
    line: (id) => (JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? []).find((l) => l.id === id),
    scan: async (code) => { await globalThis.__sb.scanner.h(code); await flush(); },
    tap: async (id) => { ui.click(ui.find("data-prodcard", id)); await flush(); },
    retMode: async () => { ui.click(ui.find("data-retmode")); await flush(); },
    setProducts: async (x) => { setProducts(x); await flush(); },
    checkout: async () => { ui.click(btn((s) => s.startsWith("إصدار الفاتورة"))); for (let i = 0; i < 4; i++) await flush(); },
    bigGo: async () => { const n = ui.find("data-bigsalego"); if (n) { ui.click(n); for (let i = 0; i < 4; i++) await flush(); } },
    errs: () => log.errors.map(([a]) => String(a)),
    end: () => ui.unmount(),
  };
}

/* ── الجولة ─────────────────────────────────────────────────────────────────── */
async function run(M, c) {
  /* أ) الدوالُّ الصِّرفة */
  {
    const Q = M.lineStockQty;
    c("أ١ lineStockQty: العلبةُ كميتُها، والمفردُ ÷ عددِه بثلاث منازل، والكارتونُ × علبِه، والخدمةُ صفر",
      Q({ kind: "product", product_id: "x", qty: 3, saleUnit: "box" }) === 3 && Q({ kind: "product", product_id: "x", qty: 5, saleUnit: "sub", unitsPerBox: 3 }) === 1.667
      && Q({ kind: "product", product_id: "x", qty: 2, saleUnit: "pack", packPer: 24 }) === 48 && Q({ kind: "service", product_id: null, qty: 2 }) === 0
      && Q({ kind: "product", product_id: "x", qty: 2, saleUnit: "pack", packPer: 1 }) === 2);
    c("أ٢ unitCap للكارتون: كراتينُ كاملة بالألف الصحيح (٤٧٫٩٩٩ ÷ ٢٤ = ١، و٤٨ = ٢، و−٣ = −١)",
      M.unitCap({ stock: 47.999, saleUnit: "pack", packPer: 24 }) === 1 && M.unitCap({ stock: 48, saleUnit: "pack", packPer: 24 }) === 2
      && M.unitCap({ stock: -3, saleUnit: "pack", packPer: 24 }) === -1 && M.unitCap({ stock: 48, saleUnit: "box" }) === 48);
    c("أ٣ المرآة: كارتونٌ يطابق (١ × ٢٤ = ٢٤) ⇒ المتوسّط × ٢٤ بمنزلتين (٨٣٣٫٣٣٣٣٣٣ ⇒ ٢٠٠٠٠٫٠٠)، ولا يطابق (١٢) ⇒ العلبة",
      M.packPerNano({ packs: [K24] }, 1000n, 24000n) === 24_000_000_000n && M.packPerNano({ packs: [K24] }, 1000n, 12000n) === null
      && M.productLineCostCents({ avg_cost: "833.333333", packs: [K24] }, 1000n, 24000n, 0n) === 2_000_000n
      && M.productLineCostCents({ avg_cost: "833.333333", packs: [K24] }, 1000n, 12000n, 0n) === 83_333n);
  }

  /* ب) المسحُ والبيعة */
  {
    const S = await session(M);
    await S.scan("CTN-24");
    const k = S.line("k:pC:k24");
    c("ب١ مسحُ الكارتون: سطرُ كارتونٍ ×١ بسعره المحسوب (٢٤ × ١٬٢٥٠ = ٣٠٬٠٠٠) وبعلبه واسمِه — لا «مو موجود»",
      k?.qty === 1 && k?.unit_price === 30000 && k?.saleUnit === "pack" && k?.packPer === 24 && k?.packName === "كارتون" && S.errs().length === 0,
      J({ k, e: S.errs() }));
    c("  وكلفتُه كلفةُ الخادم: ٩٠٠ × ٢٤ = ٢١٬٦٠٠ (لا كلفةُ علبة)", k?.unit_cost === 21600, String(k?.unit_cost));
    c("  ويُقال إنه كارتون («found»)", S.log.ok.some((x) => String(x).startsWith("pks.found|")), J(S.log.ok));
    await S.scan("SHD-6");
    c("ب٢ والشدّةُ بسعرها المكتوب (٧٬٠٠٠ لا ٦ × ١٬٢٥٠)", S.line("k:pC:k6")?.unit_price === 7000, J(S.line("k:pC:k6")));
    await S.scan("B-1");
    c("ب٣ وباركودُ العلبة سطرُ علبةٍ وحده (p:)", S.line("p:pC")?.qty === 1 && S.line("p:pC")?.saleUnit === "box", J(S.cart()));
    await S.scan("CTN-24");
    c("ب٤ ومسحةٌ ثانية تزيد الكارتونَ نفسَه (٢)", S.line("k:pC:k24")?.qty === 2, J(S.line("k:pC:k24")));
    await S.checkout(); await S.bigGo();
    const items = S.log.checkout[0]?.items ?? [];
    const ck = items.find((x) => x.unit_label === "كارتون"), sh = items.find((x) => x.unit_label === "شدّة"), bx = items.find((x) => x.unit_price === 1250);
    c("ب٥ البيعة: الكارتونُ qty ٢ وstock_qty ٤٨ وسعرُه ٣٠٬٠٠٠ وكلفتُه ٢١٬٦٠٠ وunit_label اسمُه", ck?.qty === 2 && ck?.stock_qty === 48 && ck?.unit_price === 30000 && ck?.unit_cost === 21600, J(ck));
    c("  والشدّةُ stock_qty ٦، والعلبةُ ١ بلا وحدة", sh?.stock_qty === 6 && sh?.qty === 1 && bx?.stock_qty === 1 && bx?.unit_label == null, J({ sh, bx }));
    S.end();
  }

  /* ج) الرفُّ الواحد */
  {
    const S = await session(M, { products: [{ ...PC, stock: 50 }, PS, PV] });
    await S.scan("B-1"); await S.scan("B-1"); await S.scan("B-1");
    await S.scan("CTN-24");
    c("ج١ ٣ علب وكارتون (٢٧ من ٥٠) تمرّ", S.line("p:pC")?.qty === 3 && S.line("k:pC:k24")?.qty === 1, J(S.cart()));
    await S.scan("CTN-24");
    const e = S.errs().at(-1) ?? "";
    c("ج٢ والكارتونُ الثاني يُرفض: الباقي ٢٣ بعد السلّة لا «المتوفّر ٥٠»، ولا يُزاد", S.line("k:pC:k24")?.qty === 1 && e.startsWith("pks.short|") && e.includes('"stock":"23"'), J({ e, c: S.cart() }));
    S.end();
  }

  /* د) الخادمُ لا يعرف الكارتون بعد */
  {
    const S = await session(M, { ready: false });
    await S.scan("CTN-24");
    c("د١ pack_sale_ready «لا» ⇒ لا سطرَ كارتون، وجملةٌ تقول البديل (بالعلبة: اكتب ٢٤)", !S.line("k:pC:k24") && (S.errs().at(-1) ?? "").startsWith("pks.notReady|") && (S.errs().at(-1) ?? "").includes('"n":24'), J(S.errs()));
    S.end();
  }

  /* هـ) القائمةُ البائتة */
  {
    const stale = { ...PC, packs: null };
    const S = await session(M, { products: [stale, PS, PV], levelRows: [PC], serverRows: [PC] });
    await S.scan("CTN-24");
    c("هـ١ كارتونٌ عُرّف من جهازٍ آخر بعد فتح الشاشة: يُسأل الخادم (product_level_by_code) فينزل سطرُه — لا «مو موجود — أضفه»",
      S.line("k:pC:k24")?.qty === 1 && S.log.rpc.some(([f]) => f === "product_level_by_code") && !S.errs().some((x) => x.includes("مو موجود")), J({ c: S.cart(), e: S.errs() }));
    S.end();
  }

  /* و) المغلّف */
  {
    const S = await session(M);
    await S.scan("SUB-10");
    const l = S.line("p:pS");
    c("و١ مسحُ المغلّف: سطرُ المادّة بوحدتها الصغرى وبسعرها (٢٥٠)", l?.saleUnit === "sub" && l?.unit_price === 250 && l?.qty === 1, J(l));
    S.end();
    const S2 = await session(M);
    await S2.scan("B-2"); await S2.scan("SUB-10");
    c("و٢ والمادّةُ بالسلّة بالعلبة ⇒ «بدّل الوحدة» ولا يتبدّل شيءٌ بصمت", S2.line("p:pS")?.saleUnit === "box" && S2.line("p:pS")?.qty === 1 && (S2.errs().at(-1) ?? "").startsWith("pks.subInBox|"), J({ c: S2.cart(), e: S2.errs() }));
    S2.end();
  }

  /* ز) الراجع */
  {
    const S = await session(M);
    await S.retMode();
    await S.scan("CTN-24");
    c("ز١ الراجعُ بالكارتون يُقال (بالعلبة) ولا ينزل سطرٌ موجبٌ ولا سالب", S.cart().length === 0 && (S.errs().at(-1) ?? "").startsWith("pks.ret|"), J({ c: S.cart(), e: S.errs() }));
    S.end();
  }

  /* ح) كارتونٌ تبدّل قبل البيعة */
  {
    const line = { id: "k:pC:k24", kind: "product", name: "مغلف فيتامين", barcode: "B-1", unit_price: 30000, unit_cost: 21600, qty: 1, stock: 100, product_id: "pC",
      subcategory: null, hasSubUnit: false, saleUnit: "pack", packId: "k24", packPer: 24, packName: "كارتون", packNote: "24", packPrice: 30000, priceManual: false };
    const draft = { cart: [line], name: "", phone: "", salePets: [], discountType: "percent", discountValue: "", finalOverride: null, cashierId: null };
    const changed = { ...PC, packs: [{ ...K24, per: 12 }, K6] };
    const S = await session(M, { draft, products: [changed, PS, PV] });
    await S.checkout(); await S.bigGo();
    c("ح١ مسودّةٌ بكارتون ٢٤ والصفُّ صار ١٢ ⇒ البيعةُ تقف بجملة «تغيّر» ولا تُرسل", S.log.checkout.length === 0 && S.errs().some((x) => x.startsWith("pks.changed|")), J({ n: S.log.checkout.length, e: S.errs() }));
    S.end();
  }

  /* ط) رفعُ سعر العلبة */
  {
    const S = await session(M);
    await S.scan("CTN-24"); await S.scan("SHD-6");
    await S.setProducts([{ ...PC, sell_price: 1300 }, PS, PV]);
    c("ط١ رفعُ العلبة (١٬٢٥٠ ⇒ ١٬٣٠٠): الكارتونُ المحسوب يتبعها (٣١٬٢٠٠) والشدّةُ المكتوبة كما هي (٧٬٠٠٠)",
      S.line("k:pC:k24")?.unit_price === 31200 && S.line("k:pC:k6")?.unit_price === 7000, J([S.line("k:pC:k24"), S.line("k:pC:k6")]));
    S.end();
  }

  /* ي) العروض */
  {
    const S = await session(M);
    await S.scan("CTN-24"); await S.scan("B-1");
    const last = globalThis.__sb.promo.at(-1) ?? [];
    c("ي١ العروضُ لا تقرأ سطرَ الكارتون (كميتُه كراتينُ لا قطع) — العلبةُ تصلها", last.length >= 1 && !last.some((l) => l.saleUnit === "pack") && last.some((l) => l.id === "p:pC"), J(last.map((l) => l.id)));
    S.end();
  }

  /* ك) الكلفةُ بالمتوسّط */
  {
    const S = await session(M);
    await S.scan("CTN-24");
    c("ك١ (تهيئة) سطرٌ واحد", S.cart().length === 1);
    S.end();
    const P = await session(M);
    await P.scan("CTN-V");
    c("ك٢ مادّةٌ بمتوسّط ٨٣٣٫٣٣٣٣٣٣: الكارتونُ ٢٠٬٠٠٠٫٠٠ (المتوسّط × ٢٤ ثمّ التقريب — لا ٨٣٣٫٣٣ × ٢٤ = ١٩٬٩٩٩٫٩٢)", P.line("k:pV:k24")?.unit_cost === 20000, J(P.line("k:pV:k24")));
    P.end();
  }
}

/* ── التشغيل ───────────────────────────────────────────────────────────────── */
const SB0 = READ(SB_PATH);
const BASE = await buildSB(SB0);
console.log("▸ البيعُ بالكارتون والمغلّف — بالسلوك");
await run(BASE, check);

console.log("▸ بالنصّ");
{
  const hp = JSON.parse(READ("src/i18n/hot-paths.json"));
  check("النطاقُ pks مملوكٌ لـPackSale.tsx، والشاشةُ تسخّنه بـpage(…, [\"pks\"])", hp.owned?.pks === "src/components/retail/PackSale.tsx" && /page\(\(\) => import\("@\/components\/retail\/PackSale"\)[^;]*\["pks"\]/.test(SB0));
  check("ولا استيرادَ ثابتاً للباب ولا للتعبئة بشاشة البيع (import() وحده)", !/from\s*["']@\/lib\/(packSale|packs)["']/.test(SB0) && /import\("@\/lib\/packSale"\)/.test(SB0));
  const mig = READ("supabase/migrations/0267_pack_sale.sql");
  check("الهجرةُ: حارسُ البصمة قبل التعريف، وسؤالُ الواجهة بالعلامة، والبحثُ بصلاحية المُستدعي",
    mig.indexOf("_drift_assert('public._product_line_cost") < mig.indexOf("create or replace function public._product_line_cost")
    && /position\(format\('-- \+%s', '0267'\)/.test(mig) && /function public\.product_level_by_code[\s\S]*?security invoker/.test(mig));
}

/* ── ل) الطفرات ──────────────────────────────────────────────────────────────── */
console.log("▸ ل) الطفرات");
const swap = (src, from, to) => { if (!src.includes(from)) throw new Error(`نصُّ الطفرة غائب: ${from.slice(0, 70)}`); return src.replace(from, to); };
const MUTANTS = [
  ["الكارتونُ ينقص علبةً واحدة (stock_qty = qty)", "  if (isPackLine(l)) return Math.round(l.qty * (l.packPer as number) * 1000) / 1000;\n", ""],
  ["الرفُّ لا يُقتسم (كلٌّ بسقفه)", "    return used ? unitCap({ ...l, stock: Math.round((l.stock - used) * 1000) / 1000 }) : unitCap(l);", "    return unitCap(l);"],
  ["المسحُ لا يعرف الكارتونَ بالقائمة", "      if (hit) { await sellLevel(hit, n); return; }\n    }\n    if (!product) {", "    }\n    if (!product) {"],
  ["القائمةُ البائتة لا تُسأل", "        const hit = pm.packHit(await withTimeout(pm.productsByLevelCode(code), 6000), code);", "        const hit = undefined as ReturnType<typeof pm.packHit>;"],
  ["لا سؤالَ عن جاهزية الخادم", "    if (!(await packReadyNow())) return refuse(m.say.packSay({ kind: \"notReady\"", "    if (false && !(await packReadyNow())) return refuse(m.say.packSay({ kind: \"notReady\""],
  ["الكارتونُ بسعر العلبة", "      const price = m.packSalePrice(row, k, wholesale);", "      const price = listPrice(row);"],
  ["الكلفةُ كلفةُ علبة", "unit_cost: productLineCost(row, null, Math.round((Number(row.purchase_price) || 0) * k.per * 100) / 100, k.per),", "unit_cost: productLineCost(row, null, Number(row.purchase_price) || 0),"],
  ["البيعةُ لا تطابق الكارتونَ بالصفّ", "        return !k || k.per !== l.packPer;", "        return false;"],
  ["العروضُ تقرأ الكارتون", "computePromotions(cart.filter((l) => !l.ret && l.saleUnit !== \"pack\"), promoRules)", "computePromotions(cart.filter((l) => !l.ret), promoRules)"],
  ["الراجعُ يبيع كارتوناً", "    if (retMode && !opt?.sale) return refuse(m.say.packSay({ kind: \"ret\"", "    if (false && retMode && !opt?.sale) return refuse(m.say.packSay({ kind: \"ret\""],
  ["المغلّفُ يبدّل سطرَ العلبة بصمت", "      else if (line && line.saleUnit !== \"sub\") {", "      else if (false && line && line.saleUnit !== \"sub\") {"],
  ["«الباقي» = الرصيد كلُّه", "      return formatNum(Math.round(((row.stock ?? 0) - used) * 1000) / 1000);", "      return formatNum(row.stock ?? 0);"],
  ["الوحدةُ بالفاتورة «علبة» للكارتون", "    : isPackLine(l) ? (l.packName || null)\n", ""],
];
let onCrash = null;
process.on("unhandledRejection", (e) => { if (onCrash) onCrash(e); else { console.error(e); process.exit(1); } });
for (const [name, from, to] of MUTANTS) {
  const fell = [];
  try {
    const src = swap(SB0, from, to);
    const M = await buildSB(src);
    onCrash = (e) => fell.push(`انهار: ${e?.message ?? e}`);
    await run(M, (n, ok) => { if (!ok) fell.push(n); });
  } catch (e) { fell.push(`انهار: ${e?.message ?? e}`); }
  await new Promise((r) => setTimeout(r, 20));
  onCrash = null;
  check(`طفرة «${name}» تُمسك (${fell.length})`, fell.length > 0 && !fell.every((f) => f.startsWith("انهار: نصُّ الطفرة")), fell.slice(0, 2).join(" | ") || "مرّت كلُّ الفحوص — الفحصُ أعمى عنها");
}

console.log(`\n${fails ? "✗" : "✓"} pack-sale-test: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
