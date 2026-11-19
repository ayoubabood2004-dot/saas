/* ============================================================================
 * المادّةُ بسعرين (0282) بالواجهة — بسلوكها، ثمّ الأسلاك، ثمّ طفرات. الخادمُ (retail_checkout_fx بحرّاسه وختمه، والعمودُ والتنظيفُ مرّةً)
 * يفحصه قسمُ 0282 بالحزمة على بوستغريس.
 *   أ) الحساب: من «بسعرين»؛ سعرُ كلّ مستوىً بالدولار (العلبةُ، والمفردُ مكتوباً أو العلبةُ ÷ العدد، والكارتونُ مكتوباً أو العلبةُ × العدد)؛
 *      ودينارُ السطر = round(usd × rate) كالخادم (_usd_iqd) حالةً بحالة بحسابٍ عشريٍّ تامّ.
 *   ب) نموذجُ المادّة: الطرقُ الثلاث (دينار، دينار + دولار، دولار وحده) — ما يُمنع وما يُرسل، والعودةُ للدينار تمسح سعرَ الدولار،
 *      والمفردُ بالدولار لا يُرسل قبل الهجرة؛ والكارتونُ يحمل سعرَه بالدولار ولا يتغيّر شكلُ كارتونٍ بلاه.
 *   ج) المرآةُ التجريبية: كارتونٌ بالدولار وعلبٌ بالدينار ومفردٌ بالدولار بفاتورة دينار واحدة مختومة، والإعادةُ، والرفض بترتيبه.
 *   د) إعادةُ التسعير لا تمسّ سطرَ الدولار. هـ) الأسلاك. و) طفرات.
 *
 *   node scripts/dual-price-test.mjs
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

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } }, visibilityState: "visible",
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
async function load(muts = []) {
  const plug = {
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
      b.onLoad({ filter: /src[\\/]lib[\\/][A-Za-z]+\.ts$/ }, (a) => {
        const rel = path.relative(process.cwd(), a.path).split(path.sep).join("/");
        const mine = muts.filter((m) => m[0] === rel);
        if (!mine.length) return undefined;
        let s = readFileSync(a.path, "utf8");
        for (const [, from, to] of mine) {
          if (!s.includes(from)) throw new Error(`طفرةٌ ما لقت نصّها بـ${rel}: ${from}`);
          s = s.replace(from, to);
        }
        return { contents: s, loader: "ts" };
      });
    },
  };
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/lib/repo.ts";',
        'export * as D from "./src/lib/dualPrice.ts";',
        'export * as U from "./src/lib/usdProduct.ts";',
        'export * as P from "./src/lib/packs.ts";',
        'export { repriceCart } from "./src/lib/cartReprice.ts";',
        'export { dualCheckout, dualRate, dualReady } from "./src/lib/dualApi.ts";',
        'export { demoUsdPrefs, demoUsdRateSet, demoUsdState } from "./src/lib/demoUsd.ts";',
        'export { iqdOf } from "./src/lib/usdMath.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "dual-price-test-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [plug], logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(path.join(tmpdir(), "dual-price-test-"));
  const file = path.join(dir, "bundle.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

const session = (role) => {
  localStorage.setItem("vp_session", JSON.stringify({ raw: { id: "u-1", clinic_id: "clinic-1", rawRole: role, staff: { clinicId: "clinic-1", role } } }));
};
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };
/* الخادمُ: round(usd × rate, 0) بنصف بعيدٍ عن الصفر — بحسابٍ عشريٍّ تامّ (سنتٌ × سعرٌ بأربع منازل). */
const serverIqd = (cents, rate1e4) => { const n = BigInt(cents) * BigInt(rate1e4); const d = 1_000_000n; return Number((n * 2n + d) / (2n * d)); };

async function behaviour(M, say) {
  let ok = true;
  const c = (name, cond, detail) => { if (say) check(name, cond, detail); if (!cond) ok = false; };
  const { D, U, P, repo, repriceCart, dualCheckout, dualRate, demoUsdPrefs, demoUsdRateSet } = M;

  /* أ) الحساب */
  const dual = { price_currency: "IQD", sell_price_usd: 10, sub_unit_price_usd: null, units_per_box: 3, has_sub_unit: true, sold_by_weight: false };
  c("بسعرين: دينارٌ له سعرُ دولار؛ لا «الدولار وحده» ولا بلا سعر ولا الوزن",
    D.isDual(dual) && !D.isDual({ ...dual, price_currency: "USD" }) && !D.isDual({ ...dual, sell_price_usd: null }) && !D.isDual({ ...dual, sold_by_weight: true }));
  c("سعرُ المستوى بالسنت: العلبة ١٠٠٠، والمفردُ ١٠ ÷ ٣ = ٣٣٣، والمكتوبُ يغلب (١٢٥)، وبلا عدد null",
    D.usdCentsOf(dual, "box") === 1000 && D.usdCentsOf(dual, "sub") === 333 && D.usdCentsOf({ ...dual, sub_unit_price_usd: 1.25 }, "sub") === 125
    && D.usdCentsOf({ ...dual, has_sub_unit: false }, "sub") === null && D.usdCentsOf({ ...dual, units_per_box: 0 }, "sub") === null);
  c("  والكارتونُ: المكتوبُ (٥٨$) وإلا العلبةُ × العدد (٦ × ١٠ = ٦٠$)، وبلا كارتون null، ومادّةٌ ليست بسعرين null",
    D.usdCentsOf(dual, "pack", { per: 6, sell_price_usd: 58 }) === 5800 && D.usdCentsOf(dual, "pack", { per: 6 }) === 6000
    && D.usdCentsOf(dual, "pack", null) === null && D.usdCentsOf({ ...dual, sell_price_usd: null }, "box") === null);
  let bad = 0, n = 0;
  for (const cents of [0, 1, 5, 99, 100, 125, 333, 1000, 5800, 12345, 99999]) {
    for (const r of [14600000n, 14755000n, 14699999n, 15000000n, 10000n, 13125000n]) {
      n++;
      if (D.iqdOfCents(cents, r) !== serverIqd(cents, r)) bad++;
    }
  }
  c(`دينارُ السطر يطابق الخادم (round(usd × rate)) على ${n} حالة`, bad === 0, `${bad} خلاف`);
  c("  أمثلة: ٥٨$ × ١٤٦٠ = ٨٤٬٦٨٠، و٠٫٣٥$ × ١٤٧٥٫٥ = ٥١٦، و١٫٢٥$ × ١٤٦٠ = ١٬٨٢٥",
    D.iqdOfCents(5800, 14600000n) === 84680 && D.iqdOfCents(35, 14755000n) === 516 && D.iqdOfCents(125, 14600000n) === 1825);
  c("  وخانةُ المفرد الفارغة تُرى محسوبة: ١٠ ÷ ٣ = 3.33، وبلا عدد فارغة", D.subUsdComputed("10", 3) === "3.33" && D.subUsdComputed("10", 0) === "");

  /* ب) نموذجُ المادّة */
  const d0 = U.usdDraftOf({ price_currency: "IQD", sell_price_usd: 10, purchase_price_usd: 7, sub_unit_price_usd: 1.25 });
  c("المسودّة: دينارٌ له سعرُ دولار ⇒ «دينار + دولار» بأسعارها، و«الدولار وحده» on، والدينارُ وحده لا هذا ولا ذاك",
    d0.dual && !d0.on && d0.sell === "10" && d0.sub === "1.25" && U.usdDraftOf({ price_currency: "USD", sell_price_usd: 5 }).on
    && !U.usdDraftOf({ price_currency: "USD", sell_price_usd: 5 }).dual && !U.usdDraftOf({ price_currency: "IQD" }).dual);
  const dr = (o) => ({ on: false, dual: true, sell: "10", buy: "", sub: "", ...o });
  c("الممنوع: «دينار + دولار» يقبل الوحدةَ الفرعية والحوض (لا «ممنوع»)، ويمنع الوزن؛ و«الدولار وحده» يمنع الوحدةَ الفرعية كما كان",
    U.usdDraftProblem(dr(), { weight: false, sub: true, pooled: true }) === null && U.usdDraftProblem(dr(), { weight: true, sub: false, pooled: false }) === "blocked"
    && U.usdDraftProblem(dr({ on: true, dual: false }), { weight: false, sub: true, pooled: false }) === "blocked");
  c("  وبلا سعر بيعٍ بالدولار sell، ومفردٌ ليس رقماً sub، والدينارُ وحده لا مشكلة",
    U.usdDraftProblem(dr({ sell: "" }), { weight: false, sub: false, pooled: false }) === "sell"
    && U.usdDraftProblem(dr({ sub: "abc" }), { weight: false, sub: true, pooled: false }) === "sub"
    && U.usdDraftProblem(dr({ dual: false }), { weight: true, sub: true, pooled: true }) === null);
  const pIqd = { id: "x", price_currency: "IQD", sell_price_usd: null, purchase_price_usd: null, sub_unit_price_usd: null };
  const pDual = { ...pIqd, sell_price_usd: 10, purchase_price_usd: 7, sub_unit_price_usd: 1.25 };
  const pUsd = { ...pIqd, price_currency: "USD", sell_price_usd: 5, purchase_price_usd: 4 };
  c("الإرسال: مادّةٌ جديدة بسعرين ⇒ سعراها والمفردُ (والقاعدةُ تعرفه) بلا عملة؛ وقبل الهجرة بلا مفرد",
    JSON.stringify(U.usdPatch(dr({ buy: "7", sub: "1.5" }), null, true, true, true)) === JSON.stringify({ sell_price_usd: 10, purchase_price_usd: 7, sub_unit_price_usd: 1.5 })
    && !("sub_unit_price_usd" in U.usdPatch(dr({ sub: "1.5" }), null, true, false, true)));
  c("  دينارٌ يصير «بسعرين» ⇒ سعرُ البيع بالدولار وحده (العملةُ دينار كما هي)",
    JSON.stringify(U.usdPatch(dr(), pIqd, true, true, false)) === JSON.stringify({ sell_price_usd: 10 }));
  c("  و«بسعرين» يرجع للدينار وحده ⇒ يُمسح سعرُ البيع بالدولار والمفرد (الشراءُ بالدولار يبقى)",
    JSON.stringify(U.usdPatch(dr({ dual: false }), pDual, true, true, true)) === JSON.stringify({ sell_price_usd: null, sub_unit_price_usd: null }));
  c("  و«الدولار وحده» يصير «بسعرين» ⇒ العملةُ دينار وسعراه كما هما", JSON.stringify(U.usdPatch(dr({ sell: "5", buy: "4" }), pUsd, true, true, false)) === JSON.stringify({ price_currency: "IQD" }));
  c("  والميزةُ مطفأة ⇒ لا شيء", JSON.stringify(U.usdPatch(dr(), pIqd, false, true, true)) === "{}");
  const ctx = { barcode: "B", alt_codes: [], hasSubUnit: false, unitsPerBox: 0, byWeight: false, pooled: false };
  const draft = P.draftOf({ packs: [{ id: "k1", name: "كارتون", per: 6, codes: [], purchase_price: null, sell_price: null, sell_price_usd: 58 }] });
  const v1 = P.packagingFromDraft(draft, ctx);
  c("الكارتون: سعرُه بالدولار يمرّ بالمسودّة والحفظ، وكارتونٌ بلاه بشكله القديم حرفاً (لا مفتاحَ فارغ)",
    draft.packs[0].sell_price_usd === "58" && v1.ok && v1.value.packs[0].sell_price_usd === 58
    && (() => { const d2 = P.draftOf({ packs: [{ id: "k2", name: "شدّة", per: 4, codes: [], purchase_price: null, sell_price: null }] }); const v = P.packagingFromDraft(d2, ctx); return v.ok && !("sell_price_usd" in v.value.packs[0]); })());
  c("  وتغييرُه وحده يُرسل الكراتين، وبلا تغيير لا شيء",
    "packs" in P.packagingPatch({ packs: [{ id: "k1", name: "كارتون", per: 6, codes: [], purchase_price: null, sell_price: null, sell_price_usd: 50 }] }, v1.value)
    && !("packs" in P.packagingPatch({ packs: [{ id: "k1", name: "كارتون", per: 6, codes: [], purchase_price: null, sell_price: null, sell_price_usd: 58 }] }, v1.value)));

  /* ج) المرآة التجريبية */
  mem.clear(); session("owner");
  await demoUsdPrefs(true, 250);
  const rate = await demoUsdRateSet("146000", null);
  const prod = await repo.createProduct({ name: "زيت بسعرين", barcode: "DUAL-1", price_currency: "IQD", sell_price: 15000, purchase_price: 11000, sell_price_usd: 10,
    purchase_price_usd: 7.5, stock: 100, has_sub_unit: true, sub_unit_name: "لتر", units_per_box: 10, sub_unit_price: 1600,
    packs: [{ id: "k6", name: "كارتون", per: 6, codes: [], purchase_price: null, sell_price: null, sell_price_usd: 58 }] });
  const iqdOnly = await repo.createProduct({ name: "دينار وحده", barcode: "DUAL-2", sell_price: 2000, purchase_price: 1500, stock: 50 });
  const r = await dualRate();
  c("سعرُ اليوم من الباب: مفعّلٌ بسعرٍ ١٤٦٠", r.ok && r.rate.id === rate.id && r.rate.rate1e4 === 14600000n, JSON.stringify(r, (_k, v) => (typeof v === "bigint" ? String(v) : v)));
  const L = (o) => ({ product_id: prod.id, name: "زيت بسعرين", unit_cost: 0, ...o });
  const lines = [L({ qty: 1, unit_price: 84680, stock_qty: 6, unit_label: "كارتون", price_currency: "USD", unit_price_usd: "58.00" }),
    L({ qty: 3, unit_price: 15000, stock_qty: 3, unit_label: null }),
    L({ qty: 4, unit_price: 1460, stock_qty: 0.4, unit_label: "لتر", price_currency: "USD", unit_price_usd: "1.00" })];
  const meta = (ref, total) => ({ client_ref: ref, fx_rate_id: rate.id, payment_method: "cash", amount_paid: total, final_total: total });
  const inv = await dualCheckout(lines, meta("d-1", 135520));
  const db = JSON.parse(localStorage.getItem([...mem.keys()].find((k) => k.startsWith("vp_demo_db"))));
  const items = (db.invoiceItems ?? []).filter((x) => x.invoice_id === inv.id).sort((a, b) => b.stock_qty - a.stock_qty);
  c("البيعة: فاتورةُ دينار ١٣٥٬٥٢٠ بسعر صرف ١٤٦٠، والكارتونُ ٥٨$ واللترُ ١$ مختومان والعلبُ بالدينار بلا دولار",
    inv.total === 135520 && (inv.currency ?? "IQD") === "IQD" && Number(inv.fx_rate) === 1460
    && items.map((x) => `${x.qty}:${x.unit_label ?? "-"}:${x.unit_price_usd ?? "-"}`).join(",") === "1:كارتون:58,3:-:-,4:لتر:1",
    JSON.stringify({ inv: { t: inv.total, f: inv.fx_rate }, items: items.map((x) => [x.qty, x.unit_label, x.unit_price_usd]) }));
  c("  والرصيدُ ١٠٠ − ٦ − ٣ − ٠٫٤ = ٩٠٫٦", Math.round(db.products.find((x) => x.id === prod.id).stock * 1000) / 1000 === 90.6);
  const again = await dualCheckout(lines, meta("d-1", 135520));
  const db2 = JSON.parse(localStorage.getItem([...mem.keys()].find((k) => k.startsWith("vp_demo_db"))));
  c("  والإعادةُ بالمرجع نفسِه ترجع الفاتورةَ كما ثبتت ولا تبيع ثانيةً",
    again.id === inv.id && (db2.invoices ?? []).length === (db.invoices ?? []).length
    && Math.round(db2.products.find((x) => x.id === prod.id).stock * 1000) / 1000 === 90.6);
  const rej = [];
  rej.push(await errOf(() => dualCheckout([L({ qty: 1, unit_price: 84680, stock_qty: 6, unit_label: "كارتون", price_currency: "USD", unit_price_usd: "58.00" })], { ...meta("d-r1", 84680), fx_rate_id: "old" })));
  rej.push(await errOf(() => dualCheckout([L({ qty: 1, unit_price: 84000, stock_qty: 6, unit_label: "كارتون", price_currency: "USD", unit_price_usd: "58.00" })], meta("d-r2", 84000))));
  rej.push(await errOf(() => dualCheckout([{ product_id: iqdOnly.id, name: "دينار وحده", unit_cost: 0, qty: 1, unit_price: 1460, stock_qty: 1, price_currency: "USD", unit_price_usd: "1.00" }], meta("d-r3", 1460))));
  rej.push(await errOf(() => dualCheckout([L({ qty: -1, unit_price: 14600, stock_qty: -1, price_currency: "USD", unit_price_usd: "10.00" })], meta("d-r4", -14600))));
  rej.push(await errOf(() => dualCheckout([L({ qty: 1, unit_price: 14600, stock_qty: 1, price_currency: "USD", unit_price_usd: "10.00" })], { ...meta("d-r5", 14600), sale_at: "2026-01-01T10:00:00Z" })));
  rej.push(await errOf(() => dualCheckout([{ name: "كشف", unit_cost: 0, qty: 1, unit_price: 1460, price_currency: "USD", unit_price_usd: "1.00" }], meta("d-r6", 1460))));
  c("المرآة: الرفضُ كالخادم (سعرُ صرفٍ تغيّر، دينارٌ لا يطابق، مادّةٌ بلا دولار، الراجع، التاريخُ السابق، الخدمة)",
    rej.join("|") === "usd_rate_changed|dual_price_mismatch|dual_no_usd|dual_qty|usd_backdate|dual_not_product", rej.join("|"));
  const plain = await dualCheckout([{ product_id: iqdOnly.id, name: "دينار وحده", unit_cost: 0, qty: 2, unit_price: 2000, stock_qty: 2 }], { client_ref: "d-iqd", fx_rate_id: rate.id, payment_method: "cash", amount_paid: 4000, final_total: 4000 });
  c("  وبلا سطر دولار: بيعةٌ دينارية كما هي (بلا سعر صرف)", plain.total === 4000 && plain.fx_rate == null);

  /* د) إعادةُ التسعير */
  const cart = [{ id: "p:a", kind: "product", name: "زيت", product_id: "a", unit_price: 14600, boxPrice: 15000, saleUnit: "box", priceManual: false, usd: { c: 1000, rid: "r", r: "14600000" } },
    { id: "p:b", kind: "product", name: "بدون", product_id: "b", unit_price: 15000, boxPrice: 15000, saleUnit: "box" }];
  const rp = repriceCart(cart, { product: () => ({ box: 16000, sub: null }), service: () => null });
  c("إعادةُ التسعير: سطرُ الدولار يبقى دينارُه (١٤٬٦٠٠) والدينارُ يتبع القائمة (١٦٬٠٠٠)",
    rp.cart[0].unit_price === 14600 && rp.cart[1].unit_price === 16000 && rp.changed.length === 1 && rp.changed[0].id === "p:b");
  return ok;
}

/* ── أ–د ── */
const M = await load();
await behaviour(M, true);

/* ── هـ) الأسلاك ── */
const sb = code("src/components/retail/SaleBuilder.tsx");
check("شاشة البيع: «$» على سطر المادّة بسعرين (لا الراجع ولا وضعُ الراجع ولا الوزن) يحوّله ويرجعه",
  /l\.kind === "product" && !l\.ret && !retMode && !l\.byWeight && dualOf\(products\.find\(\(x\) => x\.id === l\.product_id\)\)/.test(sb)
  && /data-lineusd=\{l\.id\}[\s\S]{0,140}void toggleLineUsd\(l\)/.test(sb));
check("  التحويلُ بسعر المستوى ودينارُه بسعر اليوم، وسطورُ الدولار الأقدم تُحسب بسعر اليوم",
  /const c = m\.usdCentsOf\(row, level, pack\);/.test(sb) && /unit_price: m\.iqdOfCents\(c, rate\.rate1e4\)/.test(sb)
  && /if \(x\.usd && x\.usd\.rid !== rate\.id\) return \{ \.\.\.x, usd: \{ \.\.\.x\.usd, rid: rate\.id, r: r1e4 \}, unit_price: m\.iqdOfCents\(x\.usd\.c, rate\.rate1e4\) \};/.test(sb));
check("  تبديلُ الوحدة والسعرُ المكتوبُ بيد يُرجعان السطرَ للدينار",
  /priceManual: false, usd: undefined \};/.test(sb) && /unit_price: v, priceManual: true, usd: undefined \}/.test(sb));
check("  البيعة: سطرُ الدولار يحمل عملتَه وسعرَه، وبسطر دولار تمرّ من dualCheckout بمعرّف سعر الصرف، وسعران مختلفان لا يُرسلان",
  /\.\.\.\(l\.usd && !l\.ret \? \{ price_currency: "USD" as const, unit_price_usd: \(l\.usd\.c \/ 100\)\.toFixed\(2\) \} : \{\}\)/.test(sb)
  && /usdRids\.length === 1\s*\? import\("@\/lib\/dualSale"\)\.then\(\(m\) => m\.dualCheckout\(items, \{ \.\.\.meta, fx_rate_id: usdRids\[0\] \}\)\)/.test(sb)
  && /if \(usdRids\.length > 1\) throw/.test(sb));
check("  وسعرُ صرفٍ تغيّر يُعاد حسابُه ويُقال (لا بيعةٌ بسعرٍ قديم)",
  /includes\("usd_rate_changed"\)\) \{[\s\S]{0,600}m\.iqdOfCents\(x\.usd\.c, r\.rate\.rate1e4\)[\s\S]{0,500}hint: t\("retail\.dual\.rateMoved"\)/.test(sb));
check("  والقطعةُ كسولة: شاشةُ البيع لا تستورد dualSale/dualApi/dualPrice ثابتاً",
  !/^import[^\n]*["']@\/lib\/(dualSale|dualApi|dualPrice)["']/m.test(src("src/components/retail/SaleBuilder.tsx")));
const inv = code("src/pages/Inventory.tsx");
check("نموذجُ المادّة: «دينار + دولار» يُبقي حقولَ الدينار، ويرسل بسعرين والمفرد حين تعرفه القاعدة، والكارتونُ بسعره بالدولار",
  /\{!\(usd\.on && usdEnabled\) && priceFields\}/.test(inv) && /usdPatch\(usd, product \?\? null, usdEnabled, dualReadyOk, subUnitOn\)/.test(inv)
  && /dualBoxUsd=\{usd\.dual && !usd\.on && usdEnabled \? Number\(usd\.sell\) \|\| 0 : null\}/.test(inv)
  && /else if \(usd\.dual && !d\.dual\) setPkgDraft/.test(inv));
const pr = code("src/lib/invoicePrint.ts");
check("الطباعة: فاتورةُ دينار فيها سطرُ دولار تقول سعرَه بجانب اسمه وسعرَ الصرف بالملاحظات",
  /const dualInv = !usdInv && Number\(invoiceIn\.fx_rate\) > 0 && itemsIn\.some\(\(it\) => it\.unit_price_usd != null\);/.test(pr)
  && /\$1 = \$\{fmtBase\(Number\(invoiceIn\.fx_rate\)\)\}/.test(pr));
check("  وتفصيلُ الفاتورة بالشاشة كذلك", /!usdInv && it\.unit_price_usd != null && <span data-dualline>/.test(code("src/components/retail/InvoicesPanel.tsx")));
const api = code("src/lib/dualApi.ts");
check("الباب: retail_checkout_fx بجرعاتها، وسؤالُ القدرة يقبل غيابَ الدالّة (42883/PGRST202) بلا «تعذّر» ويعيد السؤال بعد دقيقة",
  /supabase\.rpc\("retail_checkout_fx", \{ p_items: items, p_meta: meta, p_charges: charges\.length \? charges : null \}\)/.test(api)
  && /new Set\(\["42883", "PGRST202"\]\)/.test(api) && /Date\.now\(\) - lastNo < 60_000/.test(api));
const mig = src("supabase/migrations/0282_dual_pricing.sql");
check("الهجرة: definer بمسار، وتنظيفُ سعر الدولار القديم مرّةً واحدة (العمودُ غائب)، وبالحزمة",
  /security definer\s+set search_path = public/.test(mig) && /if not exists \(select 1 from information_schema\.columns[\s\S]{0,200}column_name = 'sub_unit_price_usd'\) then\s+update public\.products set sell_price_usd = null/.test(mig)
  && /\$MIG\/0282_dual_pricing\.sql"/.test(src("supabase/tests/run.sh")) && /# ── 0282: /.test(src("supabase/tests/run.sh")));
const ar = JSON.parse(src("src/i18n/ar.json")), en = JSON.parse(src("src/i18n/en.json"));
const need = ["chip", "toUsd", "toIqd", "note", "unreach", "not_ready", "disabled", "no_rate", "noLevel", "rateMoved"];
check("النصوص: retail.dual بالقاموسين، وusd.prod الجديدة", need.every((k) => ar.retail.dual[k] && en.retail.dual[k])
  && ["modeLabel", "modeIqd", "modeDual", "modeUsd", "dualHint", "subUsd", "subAuto", "badSub", "blockedDual"].every((k) => ar.usd.prod[k] && en.usd.prod[k]));

/* ── و) طفرات ── */
console.log("▸ طفرات");
const MUTS = [
  ["المفردُ بلا قسمة (سعرُ العلبة)", "src/lib/dualPrice.ts", "return p!.has_sub_unit && n > 0 ? Math.round(box / n) : null;", "return p!.has_sub_unit && n > 0 ? box : null;"],
  ["الكارتونُ يتجاهل سعرَه المكتوب", "src/lib/dualPrice.ts", "return own ?? box * Number(pack.per);", "return box * Number(pack.per);"],
  ["الدينارُ بقطعٍ لا تقريب", "src/lib/usdMath.ts", "return divRound(usdCents * rate1e4, 100n * RATE_SCALE * st) * st;", "return (usdCents * rate1e4) / (100n * RATE_SCALE * st) * st;"],
  ["الدولارُ وحده يقبل المفرد", "src/lib/usdProduct.ts", "if (d.on ? b.weight || b.sub || b.pooled : b.weight) return \"blocked\";", "if (d.on ? b.weight || b.pooled : b.weight) return \"blocked\";"],
  ["الدينارُ وحده يُبقي سعرَ الدولار", "src/lib/usdProduct.ts", "    out.sell_price_usd = null;\n", ""],
  ["المفردُ يُرسل قبل الهجرة", "src/lib/usdProduct.ts", "...(dualReady && sub != null ? { sub_unit_price_usd: sub } : {})", "...(sub != null ? { sub_unit_price_usd: sub } : {})"],
  ["الكارتونُ يُسقط سعرَه بالدولار", "src/lib/packs.ts", "...(sell_price_usd != null ? { sell_price_usd } : {})", ""],
  ["إعادةُ التسعير تمسّ سطرَ الدولار", "src/lib/cartReprice.ts", "const manual = isManual(l) || l.usd != null;", "const manual = isManual(l);"],
  ["المرآةُ بلا مطابقة الدينار", "src/lib/demoDual.ts", "if (Number(it.unit_price) !== iqd)", "if (false)"],
  ["المرآةُ بلا ختم", "src/lib/demoDual.ts", "    row.unit_price_usd = m.usd;\n", ""],
  ["المرآةُ تقبل سعرَ صرفٍ قديماً", "src/lib/demoDual.ts", "if (meta.fx_rate_id !== st.rate.id)", "if (false)"],
  ["المرآةُ تبيع مادّةً بلا دولار", "src/lib/demoDual.ts", "if (p.sell_price_usd == null)", "if (false)"],
];
for (const [name, file, from, to] of MUTS) {
  let caught;
  try { caught = !(await behaviour(await load([[file, from, to]]), false)); } catch { caught = true; }
  check(`طفرة «${name}» تُمسك`, caught);
}

console.log(`\n${fails ? "✗" : "✓"} البيعُ بسعرين: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
