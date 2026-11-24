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
const REAL = new Set(["react", "@/lib/posSort", "@/lib/utils", "@/lib/productCodes", "@/lib/errors", "@/lib/cartCap", "@/lib/cartReprice", "@/lib/retailBridge",
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
    export const getPosV2 = () => false; export const getPosCompact = () => false; export const getPosSort = () => "name"; export const setPosSort = () => {}; export const getPosImages = () => false; export const setPosImages = () => {}; export const getPosCustomerOpen = () => false; export const getClinicLogo = () => null;
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
  "@/components/retail/PosCustomTabs": "export const PosTabPills = () => null; export const PosTabGrid = () => null; export const PosTabEditor = () => null; export const PosGridBar = () => null;",
  "@/lib/posTabsApi": "export const posTabsApi = { list: async () => [] };",
  /* البيعُ قبل الجرد (0266): بلا حالة (globalThis.__psNeg فارغ) الوضعُ غائبٌ كما كان؛ وبحالةٍ يمسكها الفحص (القسم ن) القواعدُ الصِّرفةُ
   * الحقيقيّة — عمرُ الجواب وحكمُ الرفع و«الكبيرة» كما بالتطبيق. */
  /* 0289: الراجعُ الإكسباير ودفعتُه — بابٌ لا يعرفه الخادم هنا (لا زرَّ ولا سؤال)، وقطعتُه لا ترسم. */
  "@/lib/expiredApi": `export const returnLotsReady = async () => false; export const listReturnLots = async () => []; export const listReturnLotsOf = async () => [];
    export const returnExpired = async () => { throw new Error("stub"); }; export const checkoutLots = async () => { throw new Error("stub"); }; export const expiredErrorCode = () => null;`,
  "@/components/retail/ExpiredReturn": "export const say = new Proxy({}, { get: (_, k) => () => String(k) }); export const XretDialog = () => null; export const XretNote = () => null; export const LotPickDialog = () => null; export const ReturnLotsNote = () => null; export const unitsOf = () => []; export default () => null;",
  "@/lib/negStockApi": `const N = () => globalThis.__psNeg;
    const OFF = { state: null, counted: new Set(), failed: false };
    export const negKey = (u) => (u ?? "anon") + "|c1";
    export const negSnap = () => (N() ? N().snap() : OFF);
    export const subscribeNeg = (_k, fn) => (N() ? N().subscribe(fn) : () => {});
    export const refreshNeg = async (_k, o) => (N() ? N().refresh(o) : null);
    import { readNegCheck } from "./src/lib/negStock.ts";
    export const negApi = { check: async (c, l) => readNegCheck(N() ? await N().check(c, l) : { clinic_id: "c1", active: false, until: null, refused: [] }) };
    export { activeNow, liftable, daysLeft, bigLifted, lastDayOf } from "./src/lib/negStock.ts";`,
  /* الشريحةُ تسجّل ما يُطلب قولُه (says) — رسائلُ الوضع تمرّ منها لا من toast. */
  "@/components/negstock/NegStock": "export const NegBar = (p) => { globalThis.__psNegBar = p; return null; }; export const NegCheckoutDialog = (p) => { globalThis.__psNegChk = p; return null; }; export const NegStockCard = () => null;",
  /* سلّةُ الدولار (0272): ما تُفتح به — المادّةُ وكارتونُها. */
  "@/components/usd/Usd": "export const UsdSaleSheet = (p) => { if (p.open) globalThis.__psUsd = { first: p.first?.id ?? null, pack: p.firstPack?.id ?? null }; return null; };",
  // 0286 (بلاغُ المالك ٢٢/١١): مادّةُ «الدولار وحده» سطرٌ بالسلّة — سعرُ صرف اليوم والقاعدةُ تعرف البيعةَ بمجموعين، وصندوقُ الدولار لا يرسم شيئاً.
  "@/lib/dualSale": `export const dualRate = async () => ({ ok: true, rate: { id: "fx1", rate: "1460.0000", rate1e4: 14600000n } }); export const mixedReady = async () => true;`,
  "@/components/retail/UsdPay": "export const UsdPayBox = () => null; export const UsdDoneNote = () => null; export const UsdRateDialog = () => null; export const mixedSay = (k) => k;",
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
      if (o.rpcDown) throw new TypeError("Failed to fetch");
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
      getProductById: async (id) => { log.byId = (log.byId ?? 0) + 1; return rows().find((p) => p.id === id); },
      getSectionPool: async () => 0,
      logClientEvent: async () => {}, priceRaisePrior: async () => ({}), listClinicVisitsForPet: async () => [],
    },
    toast: { toast() {}, success: (a) => { log.ok.push(a); }, warn() {}, error: (a, b) => { log.errors.push([a, b ?? null]); } },
    scanner: null,
  };
  return log;
}
/** حالةُ الوضع (0266) يمسكها الفحص: مفعّلٌ طازجٌ افتراضياً؛ `age` عمرُ الجواب، و`onRefresh` ما يجيب به سؤالُ الحالة (افتراضياً لا شيء). */
function psNeg(o = {}) {
  const subs = new Set();
  const env = {
    counted: new Set(o.counted ?? []), calls: { check: [], refresh: 0 }, onRefresh: o.onRefresh ?? null,
    state: { clinic: "c1", active: o.active ?? true, used: o.used ?? true, absent: false, until: new Date(Date.now() + 5 * 86_400_000).toISOString(), since: null,
      endedAt: o.endedAt ?? null, serverNow: new Date(Date.now()).toISOString(), at: performance.now() - (o.age ?? 0) },
    snap: () => ({ state: env.state, counted: env.counted, failed: false }),
    subscribe: (fn) => { subs.add(fn); return () => subs.delete(fn); },
    refresh: async () => { env.calls.refresh++; if (env.onRefresh) env.onRefresh(env); for (const f of subs) f(); return env.state; },
    check: async (_c, lines) => { env.calls.check.push(JSON.parse(J(lines))); return o.check ? o.check(lines) : { clinic_id: "c1", active: true, until: null, refused: [] }; },
    /** الوضعُ يُشغَّل من جهازٍ آخر: سؤالُ الحالة التالي يجيب «مفعّل» طازجاً. */
    turnOn() { env.onRefresh = (e) => { e.state = { ...e.state, active: true, used: true, at: performance.now(), serverNow: new Date(Date.now()).toISOString() }; }; },
  };
  return env;
}
async function session(M, { draft = null, products = [PC, PS, PV], neg = null, ...env } = {}) {
  mem.clear();
  if (draft) mem.set(DRAFT_KEY, J(draft));
  globalThis.__psNeg = neg ? psNeg(neg) : null;
  globalThis.__psNegBar = null; globalThis.__psNegChk = null;
  const log = freshEnv(env);
  globalThis.__sb.products = products;
  const { createElement, useState } = M.React;
  let setProducts = null;
  const Host = () => {
    const [ps, setPs] = useState(products);
    setProducts = (x) => { globalThis.__sb.products = x; setPs(x); };
    const onFreshRow = (patch) => { if (patch.kind === "row") setPs((list) => { const next = list.some((x) => x.id === patch.row.id) ? list.map((x) => (x.id === patch.row.id ? patch.row : x)) : [...list, patch.row]; globalThis.__sb.products = next; return next; }); };
    return createElement(M.SaleBuilder, { products: ps, clinicId: "c1", onSold() {}, onFreshRow });
  };
  const ui = M.mount(createElement(Host));
  await flush();
  const btn = (pred) => ui.all().find((n) => n.type === "button" && pred(ui.text(n)));
  return {
    ui, log, N: globalThis.__psNeg,
    /** ما طلبت الشاشةُ من شريحة الوضع قولَه («kind:name»). */
    negSaid: () => (globalThis.__psNegBar?.says ?? []).map((x) => `${x.kind}:${x.name}`),
    cart: () => JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? [],
    line: (id) => (JSON.parse(mem.get(DRAFT_KEY) ?? "null")?.cart ?? []).find((l) => l.id === id),
    scan: async (code) => { await globalThis.__sb.scanner.h(code); await flush(); },
    tap: async (id) => { ui.click(ui.find("data-prodcard", id)); await flush(); },
    retMode: async () => { ui.click(ui.find("data-retmode")); await flush(); },
    setProducts: async (x) => { setProducts(x); await flush(); },
    checkout: async () => { ui.click(btn((s) => s.startsWith("إصدار الفاتورة"))); for (let i = 0; i < 4; i++) await flush(); },
    bigGo: async () => { const n = ui.find("data-bigsalego"); if (n) { ui.click(n); for (let i = 0; i < 4; i++) await flush(); } },
    bigOpen: () => !!ui.find("data-bigsalego"),
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

  /* ب٦) كارتونٌ بلا باركود (طلبُ المالك ١٨/١١): زرٌّ صغير على المنتج وبسطره بالسلّة — من طريق المسح نفسِه */
  {
    const S = await session(M);
    const chip = () => S.ui.find("data-packchip", "pC:k24");
    c("ب٦ للمادّة زرُّ كارتونٍ لكلّ كارتون (حتى اثنين)، والمادّةُ بلا كراتين بلا زرّ",
      !!chip() && !!S.ui.find("data-packchip", "pC:k6") && !S.ui.all().some((n) => String(n.props?.["data-packchip"] ?? "").startsWith("pS:")));
    S.ui.click(chip()); await flush();
    const k = S.line("k:pC:k24");
    c("  ضغطُه سطرُ كارتونٍ ×١ بسعره وكلفته وعلبه — كالمسحة تماماً، وبلا «found» (ما مُسح شيء)",
      k?.qty === 1 && k?.unit_price === 30000 && k?.unit_cost === 21600 && k?.packPer === 24 && !S.line("p:pC")
      && !S.log.ok.some((x) => String(x).startsWith("pks.found|")), J({ k, ok: S.log.ok }));
    await S.tap("pC");
    c("  وضغطُ المنتج نفسِه وحدةٌ كما كان (p:)", S.line("p:pC")?.qty === 1 && S.line("k:pC:k24")?.qty === 1, J(S.cart()));
    const lineChips = S.ui.all().filter((n) => n.props?.["data-packchip"] === "pC:k24");
    c("  وبسطر الوحدة بالسلّة الزرُّ نفسُه (والكارتونُ بسطره بلا زرّ)", lineChips.length === 2, String(lineChips.length));
    S.ui.click(lineChips[1]); await flush();
    c("  وضغطُه من السلّة يزيد الكارتونَ لا الوحدة", S.line("k:pC:k24")?.qty === 2 && S.line("p:pC")?.qty === 1, J(S.cart()));
    S.end();
    const S2 = await session(M, { products: [{ ...PC, stock: 30 }, PS, PV] });
    S2.ui.click(S2.ui.find("data-packchip", "pC:k24")); await flush();
    S2.ui.click(S2.ui.find("data-packchip", "pC:k24")); await flush();
    const e = S2.errs().at(-1) ?? "";
    c("  والرفُّ يحكمه كالمسحة: كارتونٌ ثانٍ من ٣٠ علبة يُرفض بالباقي (٦)", S2.line("k:pC:k24")?.qty === 1 && e.startsWith("pks.short|") && e.includes('"stock":"6"'), J({ e, c: S2.cart() }));
    S2.end();
    const S3 = await session(M);
    await S3.tap("pC");
    await S3.retMode();
    c("  وبوضع «راجع» لا زرَّ كارتونٍ لا بالبطاقة ولا بسطر السلّة (الكارتونُ لا يُرجَع بعد — كان يُعرض ثمّ يُرفض «باركود كارتون» عن زرّ)",
      !S3.ui.all().some((n) => String(n.props?.["data-packchip"] ?? "").startsWith("pC:")), String(S3.ui.all().filter((n) => n.props?.["data-packchip"]).length));
    await S3.retMode();
    c("  ويرجع الزرُّ حين يُطفأ الوضع", !!S3.ui.find("data-packchip", "pC:k24"));
    S3.end();
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
    await S.checkout(); await S.bigGo();
    c("هـ٢ والبيعةُ تمرّ (الصفُّ الطازج رقّع القائمة) — لا «تغيّر» كاذبة", S.log.checkout.length === 1 && !S.errs().some((x) => x.startsWith("pks.changed|")), J({ n: S.log.checkout.length, e: S.errs() }));
    S.end();
    const S2 = await session(M, { products: [{ ...PC, packs: null }, PS, PV], serverRows: [PC] });
    const line = { id: "k:pC:k24", kind: "product", name: "مغلف فيتامين", barcode: "B-1", unit_price: 30000, unit_cost: 21600, qty: 1, stock: 100, product_id: "pC",
      subcategory: null, hasSubUnit: false, saleUnit: "pack", packId: "k24", packPer: 24, packName: "كارتون", packNote: "24", packPrice: 30000, priceManual: false };
    S2.end();
    const S3 = await session(M, { products: [{ ...PC, packs: null }, PS, PV], serverRows: [PC],
      draft: { cart: [line], name: "", phone: "", salePets: [], discountType: "percent", discountValue: "", finalOverride: null, cashierId: null } });
    await S3.checkout(); await S3.bigGo();
    c("هـ٣ مسودّةٌ بكارتونٍ لا تعرفه القائمةُ البائتة والخادمُ يعرفه: يُسأل الخادم قبل «تغيّر» والبيعةُ تمرّ", S3.log.checkout.length === 1 && (S3.log.byId ?? 0) >= 1, J({ n: S3.log.checkout.length, e: S3.errs() }));
    S3.end();
    const S4 = await session(M, { products: [{ ...PC, stock: 24, packs: null }, PS, PV], levelRows: [{ ...PC, stock: 24 }], serverRows: [{ ...PC, stock: 24 }] });
    await S4.scan("CTN-24");
    S4.ui.click(S4.ui.find("data-qtyplus")); await flush(); await flush();
    c("هـ٤ والصفُّ الذي لقيه الخادمُ يرقّع القائمة: «+» على الكارتون يُحكم بالرصيد («الباقي يكفي ٠») لا «تغيّر» كاذبة",
      (S4.errs().at(-1) ?? "").startsWith("pks.short|") && S4.line("k:pC:k24")?.qty === 1, J({ e: S4.errs(), c: S4.cart().map((l) => [l.id, l.qty]) }));
    S4.end();
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

  /* م) المراجعةُ العدائيّة: الرفُّ الواحد بمسار العلبة، وسؤالُ الإتمام الكبير، و«ما وصلنا» ليست «حدّث القاعدة» */
  {
    const S = await session(M, { products: [{ ...PC, stock: 24 }, PS, PV] });
    await S.scan("CTN-24");
    const asked0 = S.log.byId ?? 0;
    await S.scan("B-1");
    c("م١ رفُّ ٢٤ وكارتونُه بالسلّة ثمّ مسحةُ علبة: لا سطرَ علبة (كان ينزل بواحدةٍ و«المتوفّر 0» معاً)، والخادمُ يُسأل قبل الرفض، والجملةُ «كلُّه بالسلّة»",
      !S.line("p:pC") && (S.log.byId ?? 0) > asked0 && (S.errs().at(-1) ?? "").includes("كلُّه بالسلّة"), J({ c: S.cart().map((l) => [l.id, l.qty]), e: S.errs(), asked: S.log.byId }));
    S.end();
    const S2 = await session(M, { products: [{ ...PC, stock: 30 }, PS, PV] });
    await S2.scan("CTN-24");
    for (let i = 0; i < 8; i++) await S2.scan("B-1");
    c("م٢ رفُّ ٣٠: كارتونٌ وعلبٌ تقف عند ٦ (٣٠ − ٢٤) — لا ٨", S2.line("p:pC")?.qty === 6, J(S2.cart().map((l) => [l.id, l.qty])));
    S2.end();
    const S3 = await session(M, { products: [{ ...PC, stock: 47 }, PS, PV] });
    await S3.scan("CTN-24");
    await S3.checkout();
    c("م٣ كارتونٌ واحد من ٤٧: لا «تبيع الرصيد كلّه؟» (٢٣ باقية) والبيعةُ تمرّ", !S3.bigOpen() && S3.log.checkout.length === 1, J({ big: S3.bigOpen(), n: S3.log.checkout.length }));
    S3.end();
    const S4 = await session(M, { products: [{ ...PC, stock: 48 }, PS, PV] });
    await S4.scan("SHD-6");
    for (let i = 0; i < 42; i++) await S4.scan("B-1");
    await S4.checkout();
    c("م٤ شدّةُ ٦ و٤٢ علبة من ٤٨ (الرفُّ كلُّه): «تبيع الرصيد كلّه؟» تسأل (كلٌّ وحده ما كان يسأل)", S4.bigOpen() && S4.log.checkout.length === 0 && S4.line("p:pC")?.qty === 42, J({ big: S4.bigOpen(), n: S4.log.checkout.length, c: S4.cart().map((l) => [l.id, l.qty]) }));
    S4.end();
    const S5 = await session(M, { rpcDown: true });
    await S5.scan("CTN-24");
    c("م٥ الخادمُ ما وصل وقت سؤال الجاهزية: «ما وصلنا» (errors.network) لا «يحتاج تحديث القاعدة»، ولا سطر", !S5.line("k:pC:k24") && S5.errs().at(-1) === "errors.network", J(S5.errs()));
    S5.end();
  }

  /* ن) البيعُ قبل الجرد (0266) بالكارتون — «العيادات الي تبيع بالكارتون تنباع بالسالب لو الوضع مفعّل» (المالك، ١٥/١١). المقيسُ قبل
   *    التصليح (كروميوم، التجريبيّ): الكارتونُ ينزل تحت الصفر، لكن (١) كلُّ كارتونٍ من ١٠ علبٍ فأكثر يسأل «تبيع الرصيد كلّه؟ ١٢ من ٠»
   *    والعلبةُ بجانبه لا، و(٢) الكارتونُ لا يسأل الخادمَ عن الوضع فمديرٌ شغّله للتو من جهازٍ آخر يُقال بعده «أقلّ من كارتون»،
   *    و(٣) المعدودةُ وما بلا كلفة و«ما تأكّدنا» و«انتهى» تُقال كلُّها «أقلّ من كارتون — كمّل بالعلبة» والعلبةُ تُرفض بالسبب نفسِه. */
  {
    const KN = { ...K24, id: "n24", codes: ["CTN-N"] };
    const PN = PRD({ id: "pN", name: "صفر بكارتون", barcode: "B-N", stock: 0, purchase_price: 900, sell_price: 1250, packs: [KN] });
    const S = await session(M, { products: [PN, PC, PS], neg: {} });
    await S.scan("CTN-N");
    const k = S.line("k:pN:n24");
    c("ن١ الوضعُ مفعّل ورصيدُ المادّة صفر: مسحُ الكارتون ينزل سطرَه معلَّماً مرفوعاً بلا سؤال خادم ولا رفض",
      k?.qty === 1 && k?.negLift === true && (S.log.byId ?? 0) === 0 && S.errs().length === 0 && S.negSaid().length === 0, J({ k, e: S.errs(), said: S.negSaid() }));
    await S.checkout();
    const ck = S.log.checkout[0]?.items?.find((x) => x.unit_label === "كارتون");
    c("  والبيعةُ بلا «تبيع الرصيد كلّه؟» (كارتونٌ واحد ليس كميةً كبيرة) والخادمُ يُسأل عنه بعلبه (qty ١، stock_qty ٢٤)، وتُكتب بكلفة الكارتون",
      !S.bigOpen() && S.log.checkout.length === 1 && J(S.N.calls.check[0]) === J([{ product_id: "pN", qty: 1, stock_qty: 24 }]) && ck?.stock_qty === 24 && ck?.unit_cost === 21600,
      J({ big: S.bigOpen(), n: S.log.checkout.length, chk: S.N.calls.check, ck }));
    S.end();

    const S2 = await session(M, { products: [PN, PC, PS], neg: {} });
    for (let i = 0; i < 10; i++) await S2.scan("CTN-N");
    await S2.checkout();
    c("ن٢ عشرُ كراتين مرفوعة («اكتب ١٠ وامسح») تسأل «تبيع الرصيد كلّه؟» قبل البيعة", S2.line("k:pN:n24")?.qty === 10 && S2.bigOpen() && S2.log.checkout.length === 0,
      J({ q: S2.line("k:pN:n24")?.qty, big: S2.bigOpen(), n: S2.log.checkout.length }));
    await S2.bigGo();
    c("  و«نعم، بيع» تكمل بـ٢٤٠ علبة تحت الصفر", S2.log.checkout.length === 1 && S2.log.checkout[0].items.find((x) => x.unit_label === "كارتون")?.stock_qty === 240, J(S2.log.checkout));
    S2.end();

    const S3 = await session(M, { products: [PN, PC, PS], neg: { active: false, used: false } });
    S3.N.turnOn();
    await S3.scan("CTN-N");
    c("ن٣ الوضعُ شُغّل من جهازٍ آخر والشاشةُ تعرفه مطفّى: الكارتونُ يسأل عن الحالة مع سؤال الصفّ فينزل مرفوعاً — لا «أقلّ من كارتون»",
      S3.N.calls.refresh >= 1 && S3.line("k:pN:n24")?.negLift === true && !S3.errs().some((x) => x.startsWith("pks.short|")), J({ r: S3.N.calls.refresh, c: S3.cart(), e: S3.errs() }));
    S3.end();

    const S4 = await session(M, { products: [PN, PC, PS], neg: { counted: ["pN"] } });
    await S4.scan("CTN-N");
    c("ن٤ معدودةٌ رصيدُها صفر: «انعدّت» بشريحة الوضع — لا «أقلّ من كارتون، كمّل بالعلبة» (العلبةُ تُرفض بالسبب نفسِه)",
      !S4.line("k:pN:n24") && J(S4.negSaid()) === J(["counted:صفر بكارتون"]) && !S4.errs().some((x) => x.startsWith("pks.short|")), J({ said: S4.negSaid(), e: S4.errs() }));
    S4.end();

    const S5 = await session(M, { products: [{ ...PN, stock: 5 }, PC, PS], neg: { counted: ["pN"] } });
    await S5.scan("CTN-N");
    const e5 = S5.errs().at(-1) ?? "";
    c("ن٥ معدودةٌ بالرفّ ٥ (أقلّ من كارتون): «الباقي ٥ — كمّل بالعلبة» صادقٌ ويقول البديل، لا «انعدّت»",
      !S5.line("k:pN:n24") && e5.startsWith("pks.short|") && e5.includes('"stock":"5"') && S5.negSaid().length === 0, J({ e: S5.errs(), said: S5.negSaid() }));
    S5.end();

    const S6 = await session(M, { products: [{ ...PN, purchase_price: 0 }, PC, PS], neg: {} });
    await S6.scan("CTN-N");
    c("ن٦ بلا كلفة ورصيدُها صفر: «ما مكتوب سعر شرائه» — لا «أقلّ من كارتون»", !S6.line("k:pN:n24") && J(S6.negSaid()) === J(["noCost:صفر بكارتون"]), J({ said: S6.negSaid(), e: S6.errs() }));
    S6.end();

    for (const stock of [0, 5]) {
      const S7 = await session(M, { products: [{ ...PN, stock }, PC, PS], neg: { age: 200_000 } });
      await S7.scan("CTN-N");
      c(`ن٧ «مفعّل» تجاوز دقيقتيه وسؤالُ الحالة ما جدّده (رفّ ${stock}): «ما تأكّدنا» — الوضعُ ربما يرفع الكارتونَ نفسَه`,
        !S7.line("k:pN:n24") && S7.N.calls.refresh >= 1 && J(S7.negSaid()) === J(["unsure:صفر بكارتون"]), J({ said: S7.negSaid(), e: S7.errs(), r: S7.N.calls.refresh }));
      S7.end();
    }

    /* ن٩) كارتونُ مادّة الدولار (0272): كان يُرفض «بيعها بوحدتها الأساسية»، ثمّ فتح نافذةَ «بيع بالدولار» وحدها؛ ومنذ 0286 (بلاغُ المالك ٢٢/١١)
     *    مسحُه سطرُ كارتونٍ بالسلّة بالدولار: سعرُه المكتوب بعملة المادّة وإلا العلبة × العدد (٥$ × ١٢ = ٦٠$). */
    globalThis.__psUsd = null;
    const PUSD = PRD({ id: "pU", name: "مستورد", barcode: "B-U", price_currency: "USD", sell_price_usd: 5, purchase_price_usd: 4, purchase_price: 0, sell_price: 0,
      packs: [{ id: "u12", name: "كارتون", codes: ["CTN-U"], per: 12, purchase_price: null, sell_price: null }] });
    const S9 = await session(M, { products: [PUSD, PC, PS] });
    await S9.scan("CTN-U");
    const L9 = S9.line("k:pU:u12");
    c("ن٩ كارتونُ مادّة الدولار: سطرُ كارتونٍ بالسلّة بالدولار ٦٠$ (لا رفض، ولا نافذةَ وحدها، ولا سطرَ دينار)",
      globalThis.__psUsd == null && L9?.usd?.c === 6000 && L9?.usd?.rid === "fx1" && L9?.packPer === 12 && S9.cart().length === 1 && !S9.errs().some((x) => x.startsWith("pks.")),
      J({ usd: globalThis.__psUsd, line: L9 && { usd: L9.usd, per: L9.packPer }, e: S9.errs() }));
    S9.end();

    const S8 = await session(M, { products: [{ ...PN, stock: -3 }, PC, PS], neg: { active: false, used: true } });
    await S8.scan("CTN-N");
    c("ن٨ الوضعُ انتهى والرصيدُ تحت الصفر: «انتهى — لا تدخله» — لا «الباقي −٣ — كمّل بالعلبة»", !S8.line("k:pN:n24") && J(S8.negSaid()) === J(["ended:صفر بكارتون"]), J({ said: S8.negSaid(), e: S8.errs() }));
    S8.end();
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
  check("وبوّاباتُ البيع قبل الجرد بالرفّ المشترك: negLines بـshareCap، وnegJudge يقسم الرفَّ (left) ويُبقي للسطر رصيدَ الصفّ كلَّه",
    /l\.negLift && l\.kind === "product" && !l\.ret && !!l\.product_id && l\.qty > shareCap\(l\)/.test(SB0) && /left\.set\(pid, Math\.round\(\(rem - lineStockQty\(\{ \.\.\.l, qty: keepQty \}\)\)/.test(SB0)
    && /keep: \{ qty: keepQty, stock: f\.stock \}/.test(SB0));
  check("وتبديلُ الوحدة يحكم بما يبقى بعد الكارتون (shareCapAt) ولا يقول «رصيده صفر» عن رفٍّ بالسلّة", /if \(shareCapAt\(\{ \.\.\.l, saleUnit: u \}, stock\) >= 1\)/.test(SB0));
  const mig = READ("supabase/migrations/0267_pack_sale.sql");
  check("الهجرةُ: حارسُ البصمة قبل التعريف، وسؤالُ الواجهة بالعلامة، والبحثُ بصلاحية المُستدعي",
    mig.indexOf("_drift_assert('public._product_line_cost") < mig.indexOf("create or replace function public._product_line_cost")
    && /position\('jsonb_array_elements\(v_p\.packs\)' in p\.prosrc\)/.test(mig) && /raise exception 'pack_changed'/.test(mig) && /function public\.product_level_by_code[\s\S]*?security invoker/.test(mig));
}

/* ── ل) الطفرات ──────────────────────────────────────────────────────────────── */
console.log("▸ ل) الطفرات");
const swap = (src, from, to) => { if (!src.includes(from)) throw new Error(`نصُّ الطفرة غائب: ${from.slice(0, 70)}`); return src.replace(from, to); };
const MUTANTS = [
  ["الكارتونُ ينقص علبةً واحدة (stock_qty = qty)", "  if (isPackLine(l)) return Math.round(l.qty * (l.packPer as number) * 1000) / 1000;\n", ""],
  ["الرفُّ لا يُقتسم (كلٌّ بسقفه)", "    return unitCap({ ...l, stock: used ? Math.round((stock - used) * 1000) / 1000 : stock });", "    return unitCap({ ...l, stock });"],
  ["المسحُ لا يعرف الكارتونَ بالقائمة", "      if (hit) { await sellLevel(hit, n); return; }\n    }\n    if (!product) {", "    }\n    if (!product) {"],
  ["القائمةُ البائتة لا تُسأل", "        const hit = pmL.packHit(await withTimeout(pmL.productsByLevelCode(code), 6000), code);", "        const hit = undefined as ReturnType<typeof pmL.packHit>;"],
  ["لا سؤالَ عن جاهزية الخادم", "    if (ready !== \"ready\") return refuse(m.say.packSay({ kind: \"notReady\"", "    if (false && ready !== \"ready\") return refuse(m.say.packSay({ kind: \"notReady\""],
  ["الكارتونُ بسعر العلبة", "      const price = m.packSalePrice(row, k, wholesale);", "      const price = listPrice(row);"],
  ["الكلفةُ كلفةُ علبة", "unit_cost: productLineCost(row, null, Math.round((Number(row.purchase_price) || 0) * k.per * 100) / 100, k.per),", "unit_cost: productLineCost(row, null, Number(row.purchase_price) || 0),"],
  ["البيعةُ لا تطابق الكارتونَ بالصفّ", "        if (k && k.per === l.packPer) continue;\n", "        continue;\n"],
  ["العروضُ تقرأ الكارتون", "computePromotions(iqdCart.filter((l) => !l.ret && l.saleUnit !== \"pack\"), promoRules)", "computePromotions(iqdCart.filter((l) => !l.ret), promoRules)"],
  ["الراجعُ يبيع كارتوناً", "    if (retMode && !opt?.sale) return refuse(m.say.packSay({ kind: \"ret\"", "    if (false && retMode && !opt?.sale) return refuse(m.say.packSay({ kind: \"ret\""],
  ["المغلّفُ يبدّل سطرَ العلبة بصمت", "      else if (line && line.saleUnit !== \"sub\") {", "      else if (false && line && line.saleUnit !== \"sub\") {"],
  ["«الباقي» = الرصيد كلُّه", "      return Math.round(((row.stock ?? 0) - used) * 1000) / 1000;", "      return row.stock ?? 0;"],
  ["الكارتونُ لا يسأل عن الوضع", "    const negAsk = negMod && negKeyRef.current && !negNow().active && !negNow().state?.absent ? negMod.refreshNeg(negKeyRef.current) : null;", "    const negAsk = null as Promise<unknown> | null;"],
  ["الكارتونُ يقول «أقلّ من كارتون» عن سبب الوضع", "      if (why && (why === \"unsure\" || leftNum(fresh) < 1)) {", "      if (false) {"],
  ["سببُ الوضع والعلبُ باقية", "      if (why && (why === \"unsure\" || leftNum(fresh) < 1)) {", "      if (why) {"],
  ["«ما تأكّدنا» بالعلب الباقية «أقلّ من كارتون»", "      if (why && (why === \"unsure\" || leftNum(fresh) < 1)) {", "      if (why && leftNum(fresh) < 1) {"],
  ["الكارتونُ المرفوع «كبير» بعلبه", "? (l.negLift ? (negMod ? negMod.bigLifted(l.qty, { sub: false, unitsPerBox: null, byWeight: false }) : l.qty >= 10)", "? (l.negLift ? (negMod ? negMod.bigLifted(lineStockQty(l), { sub: false, unitsPerBox: null, byWeight: false }) : lineStockQty(l) >= 10)"],
  ["كارتونُ الدولار يُرفض كما كان", "    if (p.price_currency === \"USD\" && !(opt?.usdOk && usdRateRef.current)) { usdTap(p, { sale: true }, pack, () => void addPackLine(p, pack, n, { ...opt, usdOk: true })); return { added: null, refused: false }; }", "    if (p.price_currency === \"USD\") { playWarning(); return { added: null, refused: true }; }"],
  ["كارتونُ الدولار بسعر العلبة", "return c(pack.sell_price) ?? (box == null ? null : box * Number(pack.per));", "return c(pack.sell_price) ?? box;"],
  ["الكارتونُ المرفوع لا يُسأل أبداً", "? (l.negLift ? (negMod ? negMod.bigLifted(l.qty, { sub: false, unitsPerBox: null, byWeight: false }) : l.qty >= 10)", "? (l.negLift ? false"],
  ["الوحدةُ بالفاتورة «علبة» للكارتون", "    : isPackLine(l) ? (l.packName || null)\n", ""],
  ["مسارُ العلبة لا يعرف الرفَّ المشترك", "    if (!ret && sibUse(product.id, `p:${product.id}`) > 0) return shelfAdd(product, n, opt);\n", ""],
  ["«تبيع الرصيد كلّه؟» لكلّ سطرٍ وحده", "    l.kind === \"product\" && !l.ret && l.stock != null && (!l.negLift && shared(l)", "    l.kind === \"product\" && !l.ret && l.stock != null && (false && shared(l)"],
  ["«ما وصلنا» تُقال «حدّث القاعدة»", "    if (ready === \"unreachable\") return refuse(t(\"errors.network\"));\n", ""],
  ["الإتمامُ لا يسأل الخادمَ عن كارتونٍ لا تعرفه القائمة", "        const ans = await askServer(listRow ?? ({ id: l.product_id, name: l.name, barcode: l.barcode } as Product)).promise;", "        const ans = { kind: \"gone\" } as FreshAnswer;"],
  ["زرُّ الكارتون يبيع وحدة", "    void addPackLine(p, pack, n).then((r) => { if (r.refused && armed != null) setMult((cur) => cur ?? armed); });", "    void sellOrExplain(p, n).then((r) => { if (r.refused && armed != null) setMult((cur) => cur ?? armed); });"],
  ["زرُّ الكارتون بوضع الراجع", "(!retMode && p && Array.isArray(p.packs) ? p.packs : [])", "(p && Array.isArray(p.packs) ? p.packs : [])"],
  ["سطرُ السلّة بلا زرّ الكارتون", "        return ks.length > 0 && row ? <div className=\"mt-1 flex flex-wrap gap-1\" data-linepacks>{ks.map((k) => packChip(row, k, false))}</div> : null;", "        return null;"],
  ["البحثُ بالخادم لا يرقّع القائمة", "          if (first && ans.kind !== \"unreachable\") onFreshRow?.(ans);\n          await sellLevel(hit, n);", "          void first; void ans;\n          await sellLevel(hit, n);"],
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
