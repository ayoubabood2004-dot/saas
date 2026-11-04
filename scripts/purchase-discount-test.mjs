/* ============================================================================
 * خصمُ الشركة على فاتورة الشراء (0260) — بالواجهة: المرآةُ النقيّة، والمستودعُ التجريبيّ بسلوكه، والأسلاك.
 * القاعدةُ يفحصها قسمُ 0260 بالحزمة على بوستغريس، و`_purchase_unit_cost` مقابل `purchaseUnitCostU` بـcost-parity (آلافُ
 * الحالات) — وهنا **سلسلةُ القسم نفسُها بأرقامها** على التجريبيّ، حتى لا تقول التجريبيّةُ غيرَ ما يقوله الخادم (فحوصُ المنطق
 * تجري عليها — CLAUDE.md §٤):
 *   أ) النقيّ: نصيبُ السطر، والخصمُ مقصوصاً (سالبٌ وفارغٌ وأكبرُ ومجموعٌ ≤ صفر)، ونسبةُ الفاتورة المحفوظة.
 *   ب) المستودع: استلامٌ بخصم (١٨٬٠٠٠ صافٍ، ٩٠٠ و١٦٥٠)، وتعديلٌ يلغيه ويرجعه بالضبط، وجهازٌ بلا المفتاح يُبقيه، وخصمٌ يأكل
 *      السطرَ كلَّه ثمّ العودةُ منه، والمدخلُ يُنظَّف، وخصمُ فلسٍ بستّ منازل — والمكتوبُ بالسطر كما هو.
 *   ج) الأسلاك: الخانةُ لا تُرسَل إلا لقاعدةٍ تعرفه، والتعديلُ يرسل ما يراه، والتفاصيلُ والطباعةُ والسجلُّ تقول الخصم.
 *
 *   node scripts/purchase-discount-test.mjs
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
const code = (f) => src(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
const SESSION = /const KEY = "([^"]+)"/.exec(src("src/contexts/AuthContext.tsx"))?.[1];
if (!SESSION) { console.error("✗ purchase-discount-test: ما انقرأ مفتاحُ الجلسة"); process.exit(1); }

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, location: { hostname: "doctorvet.vet", origin: "https://doctorvet.vet" }, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null; export const isSupabaseConfigured = false;",
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
      'export * as C from "./src/lib/demoConsumption.ts";',
      'export { purchaseUnitCostU } from "./src/lib/avgCost.ts";',
      'export { loadDB } from "./src/lib/demoStore.ts";',
      'export { buildPurchaseHTML } from "./src/lib/purchasePrint.ts";',
      'export { purchaseDiscountReady } from "./src/lib/purchaseApi.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "purchase-discount-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "purchase-discount-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, C, purchaseUnitCostU, loadDB, buildPurchaseHTML, purchaseDiscountReady } = mod;
if (!repo || !C || !purchaseUnitCostU || !loadDB || !buildPurchaseHTML || !purchaseDiscountReady) { console.error("✗ purchase-discount-test: ما انحمّلت الوحدات"); process.exit(1); }

/* ── أ) النقيّ ──────────────────────────────────────────────────────────── */
console.log("▸ المرآةُ النقيّة: نصيبُ السطر، والخصمُ مقصوصاً، ونسبةُ الفاتورة المحفوظة");
{
  const u = (c, net, g) => { const r = purchaseUnitCostU(c, net, g); return r === null ? "null" : String(r); };
  // بالمليون والفلوس — حالاتُ قسم 0260 (١) حرفاً: ٩٠٠، ٠٫٦٦٦٦٦٧، ٠٫٠٠٠٠٠١ (النصفُ للأعلى)، وبلا خصمٍ أو سعرٍ أو مجموعٍ كما هي.
  check("نصيبُ السطر: c × صافٍ ÷ مجموع بستّ منازل (النصفُ بعيداً عن الصفر)، وبلا خصمٍ أو بلا سعرٍ أو بمجموعٍ صفر كما هي",
    [u(1000_000000n, 1800000n, 2000000n), u(2_000000n, 100n, 300n), u(1_000000n, 100n, 200000000n), u(1000_000000n, 2000000n, 2000000n),
     u(1000_000000n, 2500000n, 2000000n), u(0n, 1800000n, 2000000n), u(null, 1800000n, 2000000n), u(1000_000000n, 1800000n, 0n),
     u(1000_000000n, null, 2000000n), u(1000_000000n, 0n, 2000000n)].join("|")
    === "900000000|666667|1|1000000000|1000000000|0|null|1000000000|1000000000|0");
  const sh = (g, d) => { const r = C.purchaseShareLocal(g, d); return `${r.discount}/${r.net}/${r.share ? `${r.share.netC}:${r.share.grossC}` : "-"}`; };
  check("الخصمُ مقصوصاً كالخادم: سالبٌ وفارغٌ وNaN صفر، والأكبرُ يُقصّ، والتقريبُ بعد القصّ، ومجموعٌ ≤ صفر بلا خصم",
    [sh(20000, 2000), sh(500, -50), sh(500, ""), sh(500, NaN), sh(500, null), sh(500, 99999), sh(1000, 0.005), sh(-100, 50), sh(0, 5)].join(" ")
    === "2000/18000/1800000:2000000 0/500/- 0/500/- 0/500/- 0/500/- 500/0/0:50000 0.01/999.99/99999:100000 0/-100/- 0/0/-",
    [sh(20000, 2000), sh(500, -50), sh(500, ""), sh(500, NaN), sh(500, null), sh(500, 99999), sh(1000, 0.005), sh(-100, 50), sh(0, 5)].join(" "));
  const st = (p) => { const r = C.purchaseStoredShare(p); return r ? `${r.netC}:${r.grossC}` : "-"; };
  check("ونسبةُ الفاتورة المحفوظة لعكسها: الصافي والمجموعُ total + discount، وبلا خصمٍ (أو فاتورةٌ قبل 0260) لا نسبة",
    [st({ total: 18000, discount: 2000 }), st({ total: 0, discount: 100 }), st({ total: 500, discount: 0 }), st({ total: 500 })].join(" ")
    === "1800000:2000000 0:10000 - -");
}

/* ── ب) المستودعُ التجريبيّ نفسُه — سلسلةُ قسم 0260 بأرقامها ───────────── */
console.log("▸ المستودعُ التجريبيّ: سلسلةُ قسم 0260 بأرقامها");
{
  mem.set(SESSION, JSON.stringify({ raw: { id: "v1", full_name: "طبيب", email: "v1@demo.vet", rawRole: "doctor", roles: ["clinic"], clinic_id: "clinic-happy-paws" }, active: "clinic" }));
  const old = await repo.createProduct({ name: "دواء قائم ٠٢٦٠", barcode: "DSC-1", purchase_price: 1500, sell_price: 2500, stock: 5, category: null });
  const P = () => loadDB().products;
  const pr = (id) => { const p = P().find((x) => x.id === id); return p ? `${p.stock}|${p.avg_cost ?? "null"}|${p.purchase_price}` : "gone"; };
  const pn = (name) => { const p = P().find((x) => x.name === name); return p ? `${p.stock}|${p.avg_cost ?? "null"}|${p.purchase_price}` : "gone"; };
  const hd = (p) => `${p.total}|${p.discount ?? 0}|${p.amount_paid}|${p.status}`;
  const ln = (product_id, name, qty, purchase_price) => ({ product_id, barcode: null, name, section_id: null, category: null, qty, purchase_price, sell_price: 0, min_stock: null, expiry_date: null });
  const L6 = () => [ln(null, "مادة بخصم ٠٢٦٠", 10, 1000), ln(old.id, "دواء قائم ٠٢٦٠", 5, 2000)];

  const p1 = await repo.recordPurchase(L6(), { discount: 2000, amount_paid: 8000 });
  check("الاستلامُ بخصم: الرأسُ صافٍ (١٨٬٠٠٠ والخصمُ ٢٬٠٠٠)، والمدفوعُ ٨٬٠٠٠ جزئيٌّ على الصافي", hd(p1) === "18000|2000|8000|partial", hd(p1));
  check("  والسطورُ بسعرها المكتوب (الخصمُ برأس الفاتورة لا بسطورها)",
    (await repo.listPurchaseItems(p1.id)).map((i) => `${i.qty}:${i.purchase_price}`).sort().join(",") === "10:1000,5:2000");
  check("  والجديدةُ بكلفة ٩٠٠ وسعرُ شرائها ١٠٠٠، والقائمةُ ١٦٥٠ (على كلفتها بعد الخصم ١٨٠٠)",
    pn("مادة بخصم ٠٢٦٠") === "10|900|1000" && pr(old.id) === "10|1650|2000", `${pn("مادة بخصم ٠٢٦٠")} ${pr(old.id)}`);

  let u = await repo.updatePurchase(p1.id, L6(), { discount: 0 });
  check("تعديلٌ يلغي الخصم: ٢٠٬٠٠٠ بلا خصم، والمتوسّطان ١٠٠٠ و١٧٥٠", hd(u) === "20000|0|8000|partial" && pn("مادة بخصم ٠٢٦٠") === "10|1000|1000" && pr(old.id) === "10|1750|2000",
    `${hd(u)} ${pn("مادة بخصم ٠٢٦٠")} ${pr(old.id)}`);
  u = await repo.updatePurchase(p1.id, L6(), { discount: 2000 });
  check("وإرجاعُه يرجعهما بالضبط (٩٠٠، ١٦٥٠)", hd(u) === "18000|2000|8000|partial" && pn("مادة بخصم ٠٢٦٠") === "10|900|1000" && pr(old.id) === "10|1650|2000",
    `${hd(u)} ${pn("مادة بخصم ٠٢٦٠")} ${pr(old.id)}`);
  u = await repo.updatePurchase(p1.id, L6(), { notes: "من جهازٍ قديم" });
  check("جهازٌ بلا مفتاح discount يُبقي الخصمَ كما حُفظ، والمتوسّطان كما هما", hd(u) === "18000|2000|8000|partial" && u.notes === "من جهازٍ قديم"
    && pn("مادة بخصم ٠٢٦٠") === "10|900|1000" && pr(old.id) === "10|1650|2000", `${hd(u)} ${pn("مادة بخصم ٠٢٦٠")} ${pr(old.id)}`);
  u = await repo.updatePurchase(p1.id, [ln(null, "مادة بخصم ٠٢٦٠", 1, 100)], { discount: 5000 });
  check("خصمٌ أكبرُ من المجموع يُقصّ عليه (الصافي صفر)، والقائمةُ شيلت فرجعت (٥ بـ١٥٠٠)، والجديدةُ سطرُها كلُّه خصمٌ فتبقى بأساسها",
    hd(u) === "0|100|0|paid" && pr(old.id) === "5|1500|2000" && pn("مادة بخصم ٠٢٦٠") === "1|900|100", `${hd(u)} ${pr(old.id)} ${pn("مادة بخصم ٠٢٦٠")}`);
  u = await repo.updatePurchase(p1.id, L6(), { discount: 2000 });
  check("والعودةُ منه تعكس السطرَ بأساسه لا بصفر: ٩٠٠ و١٦٥٠ كأوّل مرّة", hd(u) === "18000|2000|0|unpaid" && pn("مادة بخصم ٠٢٦٠") === "10|900|1000" && pr(old.id) === "10|1650|2000",
    `${hd(u)} ${pn("مادة بخصم ٠٢٦٠")} ${pr(old.id)}`);

  const n = [await repo.recordPurchase([ln(null, "مدخل ١ ٠٢٦٠", 2, 250)], { discount: -50 }), await repo.recordPurchase([ln(null, "مدخل ٢ ٠٢٦٠", 2, 250)], { discount: "" }),
    await repo.recordPurchase([ln(null, "مدخل ٣ ٠٢٦٠", 2, 250)], { discount: 99999 }), await repo.recordPurchase([ln(null, "مدخل ٤ ٠٢٦٠", 4, 250)], { discount: 100, amount_paid: 950 })];
  check("المدخلُ يُنظَّف: السالبُ والفارغُ صفر، والأكبرُ المجموعُ كلُّه، والمدفوعُ يُقصّ على الصافي",
    n.map(hd).join("#") === "500|0|500|paid#500|0|500|paid#0|500|0|paid#900|100|900|paid", n.map(hd).join("#"));
  const z = await repo.recordPurchase([ln(null, "مرتجع للشركة ٠٢٦٠", 1, -100)], { discount: 50 });
  check("  ومجموعٌ سالب (سطرٌ بسعرٍ سالب) بلا خصم — لا يرفضه شيء", hd(z) === "-100|0|-100|paid", hd(z));
  const f = await repo.recordPurchase([ln(null, "كسر ١ ٠٢٦٠", 3, 333.33), ln(null, "كسر ٢ ٠٢٦٠", 1, 0.01)], { discount: 0.01 });
  check("خصمُ فلسٍ على ألف: النصيبُ بستّ منازل (٣٣٣٫٣٢٦٦٦٧، ٠٫٠١)، والصافي ٩٩٩٫٩٩",
    hd(f) === "999.99|0.01|999.99|paid" && pn("كسر ١ ٠٢٦٠") === "3|333.326667|333.33" && pn("كسر ٢ ٠٢٦٠") === "1|0.01|0.01", `${hd(f)} ${pn("كسر ١ ٠٢٦٠")} ${pn("كسر ٢ ٠٢٦٠")}`);
  const plain = await repo.recordPurchase([ln(null, "بلا خصم ٠٢٦٠", 4, 250)], {});
  check("وبلا خصم: كما قبل 0260 (الإجماليُّ المجموع، والخصمُ صفر، والكلفةُ كما كُتبت)", hd(plain) === "1000|0|1000|paid" && pn("بلا خصم ٠٢٦٠") === "4|250|250", `${hd(plain)} ${pn("بلا خصم ٠٢٦٠")}`);
  check("والتجريبيُّ يقول إنه يعرف الخصم (purchaseDiscountReady بلا سحابة)", (await purchaseDiscountReady()) === true);
}

/* ── ج) الأسلاك ────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: الخانةُ بسؤال القدرة، والمرسَلُ ما يُرى، والتفاصيلُ والطباعةُ والسجلُّ تقول الخصم");
{
  const pur = code("src/components/inventory/Purchases.tsx");
  check("الخانةُ لا تظهر ولا تُرسَل إلا لقاعدةٍ تعرفه: تُسأل عند الفتح (purchaseDiscountReady)، والمفتاحُ غائبٌ بلاها",
    /purchaseDiscountReady\(\)\.catch\(\(\) => false\)/.test(pur) && /discount: discOk \? discountAmt : undefined/.test(pur)
    && /\{discOk && \(\s*<div[^>]*data-pdiscount/.test(pur));
  check("  والخصمُ مقصوصاً كشاشة البيع (resolveDiscount)، ومجموعٌ ≤ صفر بلا خصم — كالخادم",
    /const discountAmt = discOk && subtotal > 0 \? resolveDiscount\(subtotal, discType, discRaw\) : 0;/.test(pur));
  check("  و`total` الصافي: المدفوعُ والحالةُ والشارةُ عليه (كما يكتبها الخادم)",
    /const total = subtotal - discountAmt;/.test(pur) && /editing \? Math\.max\(0, Math\.min\(total, editing\.purchase\.amount_paid \?\? total\)\) : total/.test(pur)
    && /paidMode === "debt" \? paidNum : total/.test(pur));
  check("  والتعديلُ يبدأ بالخصم المحفوظ مبلغاً — فيُرسل ما يُرى لا غيابٌ يُبقي القديمَ خفيّاً",
    /setDiscType\("fixed"\); setDiscValue\(\(p\.discount \?\? 0\) > 0 \? String\(p\.discount\) : ""\);/.test(pur));
  check("  ونصيبُ الوحدة يُرى تحت سعر الشراء (ما يدخل كلفةَ المخزون)", /data-unitnet/.test(pur) && /\(buyN \* total\) \/ subtotal/.test(pur));
  check("التفاصيلُ تقول المجموعَ والخصمَ قبل الصافي حين يوجد خصم، والطباعةُ تأخذ أسماءها من القاموس",
    /\(purchase\.discount \?\? 0\) > 0 && \(/.test(pur) && /data-pddiscount/.test(pur)
    && /labels: \{ subtotal: t\("retail\.subtotal"/.test(pur) && (pur.match(/printOptions\(user, i18n\.language, t\)/g) ?? []).length === 2);
  check("  وسجلُّ الحركات سطرُ خصمٍ قبل إجمالي الفاتورة", /data-logdiscount/.test(code("src/components/inventory/PurchaseLog.tsx")));
  const P = { id: "pur_x1", total: 27000, discount: 3000, amount_paid: 10000, status: "partial", item_count: 14, purchased_at: "2026-11-04T10:00:00Z", created_at: "2026-11-04T10:00:00Z" };
  const items = [{ id: "i1", name: "أ", qty: 10, purchase_price: 2000 }, { id: "i2", name: "ب", qty: 4, purchase_price: 2500 }];
  const html = buildPurchaseHTML(P, items, { clinicName: "x", lang: "ar", currency: "IQD", labels: { subtotal: "SUB", discount: "DISC", net: "NET" } });
  const tot = html.slice(html.indexOf('<div class="totals">'), html.indexOf('<div class="totals">') + 900).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  check("الورقةُ المطبوعة: المجموعُ ٣٠٬٠٠٠ − الخصم ٣٬٠٠٠ = الصافي ٢٧٬٠٠٠ بأسماء القاموس", /SUB 30,000 IQD DISC −3,000 IQD NET 27,000 IQD/.test(tot), tot.slice(0, 120));
  const plainHtml = buildPurchaseHTML({ ...P, discount: 0, total: 30000 }, items, { clinicName: "x", lang: "ar", currency: "IQD", labels: { subtotal: "SUB", discount: "DISC", net: "NET" } });
  check("  وبلا خصمٍ (أو فاتورةٌ قبل 0260) كما كانت: الإجماليُّ وحده", !/SUB|DISC|NET/.test(plainHtml) && !/SUB|DISC/.test(buildPurchaseHTML({ ...P, discount: undefined }, items, { clinicName: "x", lang: "ar" })));
  const api = code("src/lib/purchaseApi.ts");
  check("البابُ يسأل الخادمَ عن جسمَي الشراء (purchase_discount_ready) لا عن العمود، والفشلُ «لا» — وهو خارج repo (حزمة الإقلاع)",
    /const r = await supabase\.rpc\("purchase_discount_ready"\);\s*return !r\.error && r\.data === true;\s*\} catch \{\s*return false;/.test(api)
    && !/purchase_discount_ready/.test(code("src/lib/repo.ts")));
  /* وما يستورده من حزمة الإقلاع يجرّه إليها: لا ملفَّ خارج القطعة الكسولة يستورد البابَ أو ورقةَ أنماط الجدول. */
  const { readdirSync, statSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : []; });
  const importers = walk("src").filter((f) => /from\s+["']@\/lib\/purchaseApi["']|purchaseGrid\.css/.test(code(f)));
  check("  والبابُ وأنماطُ الجدول لا يستوردهما إلا Purchases.tsx (قطعةٌ كسولة)", importers.length === 1 && importers[0] === "src/components/inventory/Purchases.tsx", importers.join(","));
  const mig = src("supabase/migrations/0260_purchase_discount.sql");
  check("  والهجرةُ تعرّفه بنصّ الجسمين نفسيهما (العلامةُ تُبنى بـformat) وتمنحه للداخلين لا لـanon",
    /create or replace function public\.purchase_discount_ready\(\)/.test(mig) && /position\(format\('-- \+%s', '0260'\) in p\.prosrc\)/.test(mig)
    && /revoke all on function public\.purchase_discount_ready\(\) from public, anon;/.test(mig) && /grant execute on function public\.purchase_discount_ready\(\) to authenticated;/.test(mig));
}

console.log(`\n${fails ? "✗" : "✓"} purchase-discount-test: ${passes} فحصاً عبر${fails ? `، و${fails} فشل` : ""}`);
process.exit(fails ? 1 : 0);
