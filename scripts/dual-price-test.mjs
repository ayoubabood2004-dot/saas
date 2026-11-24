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
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; },
  location: { hostname: "doctorvet.vet", origin: "https://doctorvet.vet", href: "https://doctorvet.vet/" } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } }, visibilityState: "visible",
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify", "qrcode"]);
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
        'export { dualCheckout, dualRate, dualReady, mixedCheckout, mixedTwin } from "./src/lib/dualApi.ts";',
        'export { demoUsdPrefs, demoUsdRateSet, demoUsdState, demoUsdCheckout } from "./src/lib/demoUsd.ts";',
        'export { buildTwinInvoiceHTML } from "./src/lib/invoicePrint.ts";',
        'export { iqdOf, farFrom } from "./src/lib/usdMath.ts";',
        'export { settlementsOf } from "./src/lib/settlementFeed.ts";',
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
  const { D, U, P, repo, repriceCart, dualCheckout, dualRate, demoUsdPrefs, demoUsdRateSet, mixedCheckout, demoUsdCheckout, mixedTwin, settlementsOf, farFrom } = M;
  /* 0286 (مراجعة): السعرُ الحرّ بلا مدير — صفرٌ زائدٌ أو ناقص يُسأل: بعيدٌ عن كلّ مرجعٍ بأكثر من ٢٠٪ (بالأعداد الصحيحة). */
  const R = (per1) => BigInt(per1) * 10_000n;
  c("0286: «15000» بدل «150000» بعيد (١٥٠ عن ١٥٠٠ و١٨٠٠)، و١٦٥٠ قريب، و٢٠٪ بالضبط ليس بعيداً، وبلا مرجعٍ لا حكم",
    farFrom(R(150), [R(1500), R(1800)]) === true && farFrom(R(1650), [R(1500), R(1800)]) === false
    && farFrom(R(1800), [R(1500)]) === false && farFrom(R(1801), [R(1500)]) === true && farFrom(R(150), [null, undefined]) === false
    && farFrom(R(2200), [R(1500), R(1900)]) === false);

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
  // مراجعة 0282: ما تقوله الخانةُ «محسوباً» هو ما يبيع به الكاشير — النموذجُ العائم قال 0.57 عن 1.15$ بمفردين والبيعُ 0.58.
  let diff = 0, pairs = 0;
  for (let cents = 1; cents <= 3000; cents += 7) for (let n = 1; n <= 12; n++) {
    pairs++;
    const till = D.usdCentsOf({ ...dual, sell_price_usd: cents / 100, units_per_box: n }, "sub");
    if (D.subUsdComputed((cents / 100).toFixed(2), n) !== (till / 100).toFixed(2)) diff++;
  }
  c(`  والخانةُ المحسوبة = سعرُ الكاشير على ${pairs} زوجاً (منها 1.15$ ÷ ٢ = 0.58)`, diff === 0 && D.subUsdComputed("1.15", 2) === "0.58", `${diff} خلاف`);

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
  c("  و«الدولار وحده» يصير ديناراً وحده ⇒ العملةُ دينار وسعرُ البيع بالدولار null صراحةً",
    JSON.stringify(U.usdPatch(dr({ dual: false, sell: "5" }), pUsd, true, true, false)) === JSON.stringify({ price_currency: "IQD", sell_price_usd: null }));
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

  /* هـ) فاتورةٌ بمجموعين (0283) — سطورُ الدينار بالدينار وسطورُ الدولار بالدولار، فاتورتان بمعاملةٍ واحدة ومرجعٍ واحد */
  mem.clear(); session("owner");
  await demoUsdPrefs(true, 250);
  const rt = await demoUsdRateSet("146000", null);
  const oil = await repo.createProduct({ name: "زيت بمجموعين", barcode: "MIX-1", price_currency: "IQD", sell_price: 15000, purchase_price: 11000, sell_price_usd: 10,
    purchase_price_usd: 7.5, stock: 100, has_sub_unit: true, sub_unit_name: "لتر", units_per_box: 10, sub_unit_price: 1600,
    packs: [{ id: "k6", name: "كارتون", per: 6, codes: [], purchase_price: null, sell_price: null, sell_price_usd: 58 }] });
  const dn = await repo.createProduct({ name: "دينار وحده", barcode: "MIX-2", sell_price: 2000, purchase_price: 1500, stock: 50 });
  const two = await repo.createProduct({ name: "بسعرين بلا مفرد", barcode: "MIX-5", price_currency: "IQD", sell_price: 5000, purchase_price: 3000, sell_price_usd: 4, stock: 40 });
  const onlyUsd = await repo.createProduct({ name: "دولار وحده", barcode: "MIX-3", price_currency: "USD", sell_price: 0, purchase_price: 0, sell_price_usd: 4, purchase_price_usd: 3, stock: 50 });
  const IQ = [{ product_id: dn.id, name: "دينار وحده", qty: 2, unit_price: 2000, unit_cost: 0, stock_qty: 2, unit_label: null, service_id: null },
    { product_id: oil.id, name: "زيت بمجموعين", qty: 1, unit_price: 15000, unit_cost: 0, stock_qty: 1, unit_label: null, service_id: null }];
  const US = [{ product_id: oil.id, qty: 1, unit_price_usd: "58.00", pack_id: "k6", pack_per: 6 }, { product_id: oil.id, qty: 4, unit_price_usd: "1.00", sub: true }];
  const mm = (ref, x = {}) => ({ client_ref: ref, payment_method: "cash", amount_paid: 19000, final_total: 19000, fx_rate_id: rt.id, discount_usd: "2.00", paid_usd: "20.00", usd_method: "cash", ...x });
  const DB = () => JSON.parse(localStorage.getItem([...mem.keys()].find((k) => k.startsWith("vp_demo_db"))));
  const res = await mixedCheckout(IQ, US, mm("m-1"));
  const d1 = DB();
  const uItems = (d1.invoiceItems ?? []).filter((x) => x.invoice_id === res.usd.id).sort((a, b) => b.stock_qty - a.stock_qty);
  c("بمجموعين: فاتورةُ الدينار ١٩٬٠٠٠ بمرجع البيعة، وفاتورةُ الدولار ٦٠$ (خصم ٢$) مدفوعٌ ٢٠$ بمرجعها ~usd وسعر يومها ١٤٦٠ (دينارُها ٨٧٬٦٠٠)",
    res.iqd && res.iqd.total === 19000 && (res.iqd.currency ?? "IQD") === "IQD" && res.iqd.client_ref === "m-1"
    && res.usd.currency === "USD" && Number(res.usd.total_usd) === 60 && Number(res.usd.discount_usd) === 2 && Number(res.usd.paid_usd) === 20
    && res.usd.client_ref === "m-1~usd" && Number(res.usd.fx_rate) === 1460 && res.usd.total === 87600,
    JSON.stringify({ i: res.iqd && [res.iqd.total, res.iqd.client_ref], u: [res.usd.currency, res.usd.total_usd, res.usd.discount_usd, res.usd.paid_usd, res.usd.client_ref, res.usd.fx_rate, res.usd.total] }));
  c("  وسطورُ الدولار: الكارتونُ ٥٨$ (٦ علب) واللترُ ١$ (٠٫٤ علبة، «لتر») بلا كلفةٍ بالدولار (متوسّطُ الدينار)",
    uItems.map((x) => `${x.qty}:${x.unit_label ?? "-"}:${x.stock_qty}:${x.unit_price_usd}:${x.unit_cost_usd ?? "-"}`).join(",") === "1:كارتون:6:58:-,4:لتر:0.4:1:-",
    uItems.map((x) => `${x.qty}:${x.unit_label ?? "-"}:${x.stock_qty}:${x.unit_price_usd}:${x.unit_cost_usd ?? "-"}`).join(","));
  const stockOf = (db, id) => Math.round(db.products.find((x) => x.id === id).stock * 1000) / 1000;
  c("  والرصيد: الزيتُ ١٠٠ − ١ − ٦ − ٠٫٤ = ٩٢٫٦، والدينارُ وحده ٤٨", stockOf(d1, oil.id) === 92.6 && stockOf(d1, dn.id) === 48, `${stockOf(d1, oil.id)}|${stockOf(d1, dn.id)}`);
  /* 0286: دفعةُ البيع (٢٠$) بمعاملة البيع نفسِها — ليست «تسديد دفعة» بسجلّ الفواتير (كانت المرآةُ تختمها بعد إنشاء الفاتورة
   * فترسمها صفّاً ثالثاً، والخادمُ يختمها بـnow() نفسِه). */
  const usdNow = (DB().invoices ?? []).find((x) => x.id === res.usd.id);
  c("  ودفعةُ البيع ليست «تسديداً بعدها»: سجلُّ الفواتير لا يرسم لها سطراً (ختمُها لحظةُ إنشاء الفاتورة)",
    settlementsOf(usdNow, [], []).length === 0 && (usdNow.payment_details ?? []).every((l) => !l.at || Date.parse(l.at) <= Date.parse(usdNow.created_at)),
    JSON.stringify((usdNow.payment_details ?? []).map((l) => l.at)) + "|" + usdNow.created_at);
  const again2 = await mixedCheckout(IQ, US, mm("m-1"));
  c("  والإعادةُ بالمرجع ترجع الفاتورتين كما ثبتتا (لا ثالثة، والرصيدُ كما هو)",
    again2.iqd.id === res.iqd.id && again2.usd.id === res.usd.id && (DB().invoices ?? []).length === 2 && stockOf(DB(), oil.id) === 92.6);
  const rj = [];
  rj.push(await errOf(() => mixedCheckout(IQ, US, mm("m-r1", { fx_rate_id: "old" }))));
  rj.push(await errOf(() => mixedCheckout(IQ, US, mm("m-r2", { paid_usd: "99.00" }))));
  rj.push(await errOf(() => mixedCheckout(IQ, [], mm("m-r3"))));
  rj.push(await errOf(() => mixedCheckout(IQ, US, mm("m-r4", { sale_kind: "wholesale" }))));
  rj.push(await errOf(() => mixedCheckout(IQ, [{ product_id: two.id, qty: 1, unit_price_usd: "4.00", sub: true }], mm("m-r5"))));
  rj.push(await errOf(() => mixedCheckout(IQ, [{ product_id: dn.id, qty: 1, unit_price_usd: "1.00" }], mm("m-r6"))));
  c("  والرفضُ يرجّع النصفين: سعرُ صرفٍ تغيّر، ودفعٌ فوق المجموع، وبلا دولار، والجملة، ومفردٌ بلا مفرد، ودينارٌ وحده بالدولار",
    rj.join("|") === "usd_rate_changed|usd_partial_at_sale|mixed_no_usd|mixed_wholesale|sub_changed|usd_mixed", rj.join("|"));
  c("    (ولا فاتورةَ نزلت ولا نصفُ دينار — الدينارُ وحده ٤٨ والزيتُ ٩٢٫٦)",
    (DB().invoices ?? []).length === 2 && stockOf(DB(), dn.id) === 48 && stockOf(DB(), oil.id) === 92.6, `${(DB().invoices ?? []).length}|${stockOf(DB(), dn.id)}`);
  const solo = await mixedCheckout([], [{ product_id: two.id, qty: 2, unit_price_usd: "4.00" }], mm("m-2", { amount_paid: 0, final_total: 0, discount_usd: "0", paid_usd: "0" }));
  c("  وبلا سطور دينار: فاتورةُ الدولار وحدها ٨$ دَيناً كلَّه", solo.iqd === null && Number(solo.usd.total_usd) === 8 && Number(solo.usd.paid_usd) === 0);
  // مراجعة 0283: علَمُ المفرد على مادّةٍ صارت «دولار وحده» (بلا مفرد) يُرفض — تجاهلُه كان يبيع ٤ مفردات ٤ علب.
  const subStale = await errOf(() => mixedCheckout([], [{ product_id: onlyUsd.id, qty: 4, unit_price_usd: "1.00", sub: true }], mm("m-r7", { amount_paid: 0, final_total: 0, discount_usd: "0", paid_usd: "0" })));
  c("  ومفردٌ لمادّةٍ لم تعد بسعرين يُرفض (لا يُباع علباً)، والرصيدُ كما هو", subStale === "sub_changed" && stockOf(DB(), onlyUsd.id) === 50, `${subStale}|${stockOf(DB(), onlyUsd.id)}`);
  // والإعادةُ بلا سطر دولار (رُجّعت للدينار بعد محاولةٍ مجهولة): فاتورةُ الدولار التي ثبتت تُلقى بمرجعها.
  const twin = await mixedTwin("m-1");
  c("  وتوأمُ مرجعٍ ثبت بمجموعين يُلقى (~usd)، وغيرُه لا شيء", twin?.id === res.usd.id && (await mixedTwin("m-none")) === null);
  const oldPartial = await errOf(() => demoUsdCheckout([{ product_id: onlyUsd.id, qty: 1 }], { client_ref: "o-1", fx_rate_id: rt.id, paid_usd: "1", payment_method: "cash" }));
  c("  وبيعُ الدولار القديم كما كان: الجزئيُّ بلا علَم الفاتورة بمجموعين يُرفض", oldPartial === "usd_partial_at_sale", oldPartial);
  const html = M.buildTwinInvoiceHTML(res.iqd, [{ id: "a", invoice_id: res.iqd.id, product_id: dn.id, name: "دينار وحده", qty: 2, unit_price: 2000, unit_cost: 0, line_total: 4000, unit_label: null }],
    { invoice: res.usd, items: uItems }, { clinicName: "x", format: "thermal", lang: "ar" });
  c("  والورقةُ الواحدة: الفاتورتان بمجموعيهما وسكربتُ طباعةٍ واحد",
    (html.match(/window\.print\(\)/g) ?? []).length === 1 && html.includes("دينار وحده") && html.includes("زيت بمجموعين") && /58\.00|58/.test(html) && html.includes("$1 = 1,460"));
  return ok;
}

/* ── أ–د ── */
const M = await load();
await behaviour(M, true);

/* ── هـ) الأسلاك ── */
const sb = code("src/components/retail/SaleBuilder.tsx");
check("شاشة البيع: «$» على سطر المادّة بسعرين (لا الراجع ولا وضعُ الراجع ولا الوزن ولا الجرعة) يحوّله، وسطرُ دولارٍ يبقى زرُّه ليرجع",
  /l\.kind === "product" && !l\.ret && !l\.byWeight && !l\.dose && \(l\.usd \|\| \(!retMode && dualOf\(products\.find\(\(x\) => x\.id === l\.product_id\)\)\)\)/.test(sb)
  && /data-lineusd=\{l\.id\}[\s\S]{0,140}void toggleLineUsd\(l\)/.test(sb));
check("  والجملة لا تبيع بالدولار (سعرُ الدولار سعرُ مفرد — الجملةُ بسعر الشراء)",
  /const dualOf = \(p: Product \| null \| undefined\): boolean =>\s*!wholesale && /.test(sb));
check("  وجوابُ سعر الصرف يُكتب على السطر كما هو الآن: وحدةٌ تبدّلت أو ضغطةٌ سبقت ⇒ لا شيء",
  /const cur = cart\.find\(\(x\) => x\.id === l\.id\);\s*if \(!cur \|\| cur\.usd \|\| \(cur\.saleUnit \?\? null\) !== \(l\.saleUnit \?\? null\) \|\| \(cur\.packId \?\? null\) !== \(l\.packId \?\? null\)\) return cart;/.test(sb));
check("  0283: «$» لا يحوّل — دينارُ السطر يبقى، والسطرُ يأخذ سعرَه بالدولار ومعرّفَ سعر اليوم، ولا سطرَ دولار قبل أن تعرف القاعدةُ الفاتورةَ بمجموعين",
  /const c = m\.usdCentsOf\(row, level, pack\);/.test(sb) && /if \(x\.id === l\.id\) return \{ \.\.\.x, usd: \{ c, rid: rate\.id, r: r1e4 \} \};/.test(sb)
  && /if \(x\.usd && x\.usd\.rid !== rate\.id\) return \{ \.\.\.x, usd: \{ \.\.\.x\.usd, rid: rate\.id, r: r1e4 \} \};/.test(sb)
  && !/iqdOfCents/.test(sb) && /mixedOk = await m\.mixedReady\(\)/.test(sb));
check("  تبديلُ الوحدة والسعرُ المكتوبُ بيد يُرجعان السطرَ للدينار",
  // 0290: «يدويّ» بعد التبديل = سعرٌ غيرُ سعر القائمة لوحدته (سطرُ دفعة الإكسباير بسعرٍ اختاره الطبيب) — وغيرُه false كما كان؛ والدولارُ يسقط بكلّ حال.
  /priceManual: Math\.round\(unit_price \* 100\) !== Math\.round\(listU \* 100\), usd: undefined \};/.test(sb)
  && /const unit_price = l\.lot\?\.px \? lotUnitPrice\(l\.lot\.px, toSub, listU, l\.unitsPerBox \?\? null\) : listU;/.test(sb)
  && /unit_price: v, priceManual: true, usd: undefined \}/.test(sb));
check("  0283: مالُ الدينار من سطور الدينار وحدها — المجموعُ والكلفةُ والعروضُ ومعاينةُ الربح (سطرُ الدولار ليس جرعةً ولا راجعاً)",
  /function isUsdLine\(l: Pick<Line, "usd" \| "ret" \| "dose">\): boolean \{\s*return !!l\.usd && !l\.ret && !l\.dose;/.test(sb)
  && /const iqdCart = useMemo\(\(\) => cart\.filter\(\(l\) => !isUsdLine\(l\)\), \[cart\]\);/.test(sb)
  && /const subtotal = iqdCart\.reduce/.test(sb) && /const cost = iqdCart\.reduce/.test(sb)
  && /computePromotions\(iqdCart\.filter/.test(sb) && /const promoLines = \(r: QtyPromo\): Line\[\] => iqdCart\.filter/.test(sb)
  && /const consCost = iqdCart\.reduce/.test(sb) && /const lineCostUnknown = [^\n]*iqdCart\.some/.test(sb));
check("  0283: مجموعُ الدولار بالسنت كالخادم (round(qty × سعر)) — خصمُه لا يتجاوزه، ودفعُه الفارغُ كلُّه، والباقي دَينٌ يحتاج اسماً",
  /const usdSubC = usdLines\.reduce\(\(n, l\) => n \+ Math\.round\(l\.qty \* \(l\.usd as NonNullable<Line\["usd"\]>\)\.c\), 0\);/.test(sb)
  && /const usdDiscC = Math\.min\(usdSubC, usdDiscIn \?\? 0\);/.test(sb)
  && /const usdPaidC = usdPaid == null \? usdTotalC : Math\.min\(usdTotalC, usdPaidIn \?\? 0\);/.test(sb)
  && /const needsDebtName = \(isCredit \|\| deliveryOn \|\| usdDebtC > 0\) && !name\.trim\(\);/.test(sb));
check("  0283: البيعة — سطورُ الدينار وحدها لـretail_checkout، وسطورُ الدولار بأسعارها (المفردُ sub والكارتونُ بعدده) من mixedCheckout بخصمها ودفعها",
  /const items: CheckoutItem\[\] = cart\.filter\(\(l\) => !isUsdLine\(l\)\)\.map/.test(sb) && !/price_currency: "USD"/.test(sb)
  && /\.\.\.\(l\.saleUnit === "sub" \? \{ sub: true \} : \{\}\)/.test(sb) && /\.\.\.\(isPackLine\(l\) \? \{ pack_id: l\.packId as string, pack_per: l\.packPer as number \} : \{\}\)/.test(sb)
  // 0289: الميتا باسمٍ (mmeta) لأن بابَ دفعة الإكسباير (checkoutLots) يمرّرها نفسَها — وmixedCheckout تأخذها كما هي.
  && /const mmeta = \{ \.\.\.meta, fx_rate_id: usdRids\[0\], discount_usd: \(usdDiscC \/ 100\)\.toFixed\(2\), paid_usd: \(usdPaidC \/ 100\)\.toFixed\(2\), usd_method: usdMethod \};/.test(sb)
  && /m\.mixedCheckout\(items, usdItems, mmeta\)/.test(sb) && /xretMod\.checkoutLots\(items, mmeta, usdItems,/.test(sb)
  && /if \(usdRids\.length > 1\) throw/.test(sb));
check("  ولا توصيل ولا يومٌ سابق ولا رقمٌ لا يُقرأ مع سطر دولار (يُقال قبل أيّ مرجع)",
  /if \(usdOn && \(deliveryOn \|\| saleDay \|\| usdBad\)\) \{/.test(sb));
check("  وسعرُ صرفٍ تغيّر: المبلغُ بالدولار كما هو، والسطورُ تأخذ معرّفَ اليوم ويُقال",
  /includes\("usd_rate_changed"\)\) \{[\s\S]{0,600}usd: \{ \.\.\.x\.usd, rid: r\.rate\.id, r: r1e4 \} \} : x[\s\S]{0,500}hint: t\("retail\.dual\.rateMoved"\)/.test(sb));
check("  و«تمّ» بفاتورة الدولار، والوصلُ بالورقة نفسِها (A4 والحراري)",
  /if \(usdInvoice\) setDone\(\{ invoice, items: invItems, usd: \{ invoice: usdInvoice, items: usdItemsDone \} \}\);/.test(sb)
  && (sb.match(/usdTwin: done\.usd \?\? undefined/g) ?? []).length === 2
  && /usdTwin: opts\?\.usdTwin,/.test(code("src/components/retail/usePrintInvoice.ts"))
  && /const html = opts\.usdTwin \? buildTwinInvoiceHTML\(/.test(code("src/lib/invoicePrint.ts")));
check("  ومراجعة 0283: «$» مقفولٌ بعد محاولةٍ مجهولة المصير، والسعرُ النهائيُّ المثبَّت يُفكّ بتبديل العملة ولا دينارَ يُثبَّت بلا سطوره",
  /if \(payPending\) \{ playWarning\(\); toast\.error\(t\("retail\.payPending"/.test(sb) && (sb.match(/setFinalOverride\(null\);/g) ?? []).length >= 3
  && /const total = finalOverride != null && iqdCart\.length > 0 \? Math\.max\(0, finalOverride\) : autoTotal;/.test(sb));
check("  والمسودّةُ تحفظ صندوقَ الدولار، والإعادةُ بلا دولار تُظهر توأمَها، والمعاينةُ «—» مع سطر دولار",
  /saveSaleDraft\(draftScope, \{ usdDisc, usdPaid, usdMethod, cart,/.test(sb) && /\}, \[usdDisc, usdPaid, usdMethod, clinicId,/.test(sb) && /useState\(draft0\?\.usdDisc \?\? ""\)/.test(sb)
  && /if \(!freshRef && saleRefRef\.current\) \{[\s\S]{0,200}m\.mixedTwin\(ref\)/.test(sb)
  && /const profitShown = consCost === null \|\| lineCostUnknown \|\| usdOn \? null/.test(sb));
check("  والطبعةُ الأوّليّة: سطورُ الدينار بمجموعها وسطورُ الدولار بمجموعها (لا دينارُ سطر الدولار تحت مجموع الدينار)",
  /const draftItems: InvoiceItem\[\] = iqdCart\.map/.test(sb) && /usdTwin: \{ invoice: usdDraft, items: usdDraftItems \}/.test(sb)
  && /openInvoicePrint\(onlyUsd \? usdDraft : draft, onlyUsd \? usdDraftItems : draftItems/.test(sb));
check("  والقطعةُ كسولة: شاشةُ البيع لا تستورد dualSale/dualApi/dualPrice/UsdPay ثابتاً",
  !/^import[^\n]*["']@\/(lib\/(dualSale|dualApi|dualPrice)|components\/retail\/UsdPay)["']/m.test(src("src/components/retail/SaleBuilder.tsx")));
const inv = code("src/pages/Inventory.tsx");
check("نموذجُ المادّة: «دينار + دولار» يُبقي حقولَ الدينار، ويرسل بسعرين والمفرد حين تعرفه القاعدة، والكارتونُ بسعره بالدولار",
  /\{!\(usd\.on && usdEnabled\) && priceFields\}/.test(inv) && /usdPatch\(usd, product \?\? null, usdEnabled, dualReadyOk, subUnitOn\)/.test(inv)
  && /dualBoxUsd=\{usd\.dual && !usd\.on && usdEnabled \? Number\(usd\.sell\) \|\| 0 : null\}/.test(inv)
  && /else if \(usd\.dual && !d\.dual\) setPkgDraft/.test(inv));
const pr = code("src/lib/invoicePrint.ts");
check("الطباعة: فاتورةُ دينار فيها سطرُ دولار تقول سعرَه بجانب اسمه وسعرَ الصرف بالملاحظات",
  /const dualInv = !usdInv && Number\(invoiceIn\.fx_rate\) > 0 && itemsIn\.some\(\(it\) => it\.unit_price_usd != null\);/.test(pr)
  && /\$1 = \$\{fmtRate\(Number\(invoiceIn\.fx_rate\)\)\}/.test(pr) && /const fmtRate = \(n: number\) => n\.toLocaleString\("en-US", \{ maximumFractionDigits: 4 \}\);/.test(pr));
check("  وتفصيلُ الفاتورة بالشاشة كذلك", /!usdInv && it\.unit_price_usd != null && <span data-dualline>/.test(code("src/components/retail/InvoicesPanel.tsx")));
const api = code("src/lib/dualApi.ts");
check("الباب: retail_checkout_fx بجرعاتها، وسؤالُ القدرة يقبل غيابَ الدالّة (42883/PGRST202) بلا «تعذّر» ويعيد السؤال بعد دقيقة",
  /supabase\.rpc\("retail_checkout_fx", \{ p_items: items, p_meta: meta, p_charges: charges\.length \? charges : null \}\)/.test(api)
  && /new Set\(\["42883", "PGRST202"\]\)/.test(api) && /Date\.now\(\) - lastNo < 60_000/.test(api));
check("  و«القراءة فقط» (اشتراكٌ منتهٍ) يُسأل قبل الخادم بالبابين المباشرين — الدولار والجرعات",
  /export async function dualCheckout\([\s\S]{0,120}?Promise<Invoice> \{\s*if \(isConfigReadOnly\(\)\) throw new ReadOnlyError\(\);/.test(api)
  && /if \(!ids\.length\) return repo\.retailCheckout\(items, meta\);\s*if \(isConfigReadOnly\(\)\) throw new ReadOnlyError\(\);\s*if \(supabase\)/.test(code("src/lib/doseApi.ts")));
const usdF = code("src/components/usd/Usd.tsx");
check("نموذجُ المادّة: المفردُ المحسوب بحساب الكاشير، و«دينار + دولار» لا يُعرض قبل الهجرة (إلا لمادّةٍ مختارةٍ كذلك)",
  /const subAutoText = sub\?\.on \? subUsdComputed\(value\.sell, sub\.per\) : "";/.test(usdF) && !/Number\(sell\) \/ 100 \/ sub\.per/.test(usdF)
  && /const dualOk = !!sub\?\.ready \|\| mode === "dual";/.test(usdF) && /\.filter\(\(m\) => m !== "dual" \|\| dualOk\)/.test(usdF));
const mig = src("supabase/migrations/0282_dual_pricing.sql");
check("الهجرة: definer بمسار، وتنظيفُ سعر الدولار القديم مرّةً واحدة (العمودُ غائب)، وبالحزمة",
  /security definer\s+set search_path = public/.test(mig) && /if not exists \(select 1 from information_schema\.columns[\s\S]{0,200}column_name = 'sub_unit_price_usd'\) then\s+update public\.products set sell_price_usd = null/.test(mig)
  && /\$MIG\/0282_dual_pricing\.sql"/.test(src("supabase/tests/run.sh")) && /# ── 0282: /.test(src("supabase/tests/run.sh")));
check("  وصورُ المحذوفات بالتنظيف، والإعادةُ بجرعاتٍ من بابها، ولا محفّزَ على عمودٍ بعينه (يقفل تغييرَ نوعه — 0134 سقطت بالحزمة)",
  /update public\.products_trash t set row = jsonb_set\(t\.row, '\{sell_price_usd\}', 'null'::jsonb\)/.test(mig)
  && /if found then\s+if v_dose then\s+return retail_checkout_doses\(/.test(mig)
  && !/before update of sell_price_usd/.test(mig));
const ar = JSON.parse(src("src/i18n/ar.json")), en = JSON.parse(src("src/i18n/en.json"));
const need = ["chip", "toUsd", "toIqd", "note", "unreach", "not_ready", "disabled", "no_rate", "noLevel", "rateMoved"];
const mxNeed = ["title", "disc", "total", "paid", "all", "none", "debt", "rate", "doneTitle", "doneDebt", "donePaid"];
check("النصوص: mxp (صندوقُ الدولار) بالقاموسين", mxNeed.every((k) => ar.mxp?.[k] && en.mxp?.[k]) && ["delivery", "backdate", "bad", "debtName", "notReady"].every((k) => ar.mxp.say[k] && en.mxp.say[k]));
check("النصوص: retail.dual بالقاموسين، وusd.prod الجديدة", need.every((k) => ar.retail.dual[k] && en.retail.dual[k])
  && ["modeLabel", "modeIqd", "modeDual", "modeUsd", "dualHint", "subUsd", "subAuto", "badSub", "blockedDual", "blockedIqd"].every((k) => ar.usd.prod[k] && en.usd.prod[k]));

/* ── هـ٢) 0286: صفٌّ واحد للبيعة، والسعرُ يختاره الطبيب، وسعرُ اليوم من شاشة البيع ── */
console.log("▸ 0286 (طلبُ المالك ٢١/١١): صفٌّ واحد للبيعة بمجموعين، والسعرُ يختاره من يسدّد، وسعرُ اليوم من أيّ شاشة");
{
  const ip = src("src/components/retail/InvoicesPanel.tsx"), ud = src("src/components/usd/Usd.tsx"), sbx = src("src/components/retail/SaleBuilder.tsx"), up = src("src/components/retail/UsdPay.tsx");
  check("السجلّ: نصفُ الدولار يُرسم بصفّ بيعته (لا صفٌّ ثانٍ برقمٍ ثانٍ)، ومجموعُه بالدولار تحت الدينار، وسطرُ تسديده برقم الدينار",
    /if \(pairs\.baseOf\.has\(inv\.id\)\) return null;/.test(ip) && /data-inv-twin-usd/.test(ip)
    && /invoiceNo\(\(pairs\.baseOf\.get\(e\.inv\.id\) \?\? e\.inv\)\.id\)/.test(ip) && /inv\.item_count \+ \(twin\?\.item_count \?\? 0\)/.test(ip));
  check("  والنافذة: فاتورةُ الدولار تُفتح من رأسها، ونصفُها داخل فاتورة الدينار، والطباعةُ بنصفيها (وسطورُه تُجلب إن لم تصل)",
    /m\.invoiceByRef\(invRef\.slice\(0, -4\)\)/.test(ip) && /if \(alive && base\) setOpen\(base\);/.test(ip)
    && /usdTwin = \{ invoice: tw, items: its \};/.test(ip) && (ip.match(/printSale\("(?:a4|thermal)"\)/g) ?? []).length === 2
    // ومراجعة 0286: ضغطةُ طباعةٍ قبل جواب المرجع (أو بعد فشله) تسأله — لا دينارَ وحده بلا دَين الدولار — وفشلُ السؤال يُقال بنطاق usd
    && /if \(!tw && !known && invRef && !invUsd && !invRef\.endsWith\("~usd"\)\)/.test(ip) && /<UsdTwinLazy twin=\{null\}/.test(ip));
  check("التسديد: سعرُ يوم البيع وسعرُ اليوم زرّان، والسعرُ الآخرُ لا يحتاج سبباً، و«خلّيه سعر اليوم» من النافذة",
    /data-usd-rate-sale/.test(ud) && /data-usd-rate-today/.test(ud) && /data-usd-rate-maketoday/.test(ud)
    && !/other && !reason\.trim\(\)/.test(ud) && /\(stale && isTodayRate\)/.test(ud) && /other && reason\.trim\(\) \? reason : null/.test(ud)
    // ومراجعة 0286: السعرُ البعيد يُقال ويحتاج ضغطةً ثانية (بالتسديد و«خلّيه سعر اليوم» ونافذة شاشة البيع)
    && (ud.match(/if \(farPending\) \{ playWarning\(\); setFarAck\(per100\.trim\(\)\); return; \}/g) ?? []).length === 2
    && /farFrom\(rate, \[saleRate, today\?\.rate1e4\]\)/.test(ud) && /if \(farPending\) \{ playWarning\(\); setFarAck\(per100\.trim\(\)\); return; \}/.test(up));
  check("  ودفعةُ البيع «دُفع وكت البيع» بقائمة التسديدات", /atSaleOf\(s\.at, invoice\.created_at\)/.test(ud));
  check("شاشةُ البيع: «غيّر السعر» بصندوق الدولار، و«$» بلا سعرٍ يسأله ثمّ يكمل، وسطورُ الدولار تأخذ السعرَ الجديد",
    /if \(!r\.ok && r\.why === "no_rate"\) \{ playTap\(\); setRateAsk\(\{ cur: null, then: l \}\); return; \}/.test(sbx)
    && /x\.usd \? \{ \.\.\.x, usd: \{ \.\.\.x\.usd, rid: rate\.id, r: rate\.rate1e4\.toString\(\) \} \}/.test(sbx)
    && /data-usdrate-edit/.test(up) && /await import\("@\/lib\/usdApi"\)/.test(up) && !/from "@\/lib\/usdApi";\n/.test(up.replace(/import type[^\n]*\n/g, "")));
  // بلاغُ المالك ٢٢/١١: «لمن أبيع شي بالدولار ينباع بنافذة لحاله وما يصعد للسلة» — مادّةُ «الدولار وحده» سطرُ دولارٍ بالسلّة من طريق الإضافة نفسِه.
  check("الدولار وحده بالسلّة: usdTap يضيفه بالسلّة (النافذةُ للجملة وقاعدةٍ قبل 0283)، والطرقُ الثلاث تكمل بسعرٍ سُئل، والسطرُ يُختم بالدولار، و«$» لا يحوّله للدينار",
    /if \(!wholesale && resume\) \{ void usdIntoCart\(p, pack, resume\); return false; \}/.test(sbx)
    && /if \(!mixedOk\) \{ openUsd\(p, pack\); return; \}/.test(sbx) && /r\.why === "no_rate"\) \{ playTap\(\); setRateAsk\(\{ cur: null, then: null, resume \}\)/.test(sbx)
    && (sbx.match(/usdOk: true/g) ?? []).length === 3 && (sbx.match(/usd: \{ c: usdOnlyCents\(/g) ?? []).length === 2
    && /\?\.price_currency === "USD"\) \{\n\s+\/\/ «الدولار وحده»/.test(sbx) && /if \(resume\) \{ usdRateRef\.current = \{ rid: rate\.id/.test(sbx)
    && ar.mxp?.say?.usdOnly && en.mxp?.say?.usdOnly);
  check("  وسعرُه كالخادم: العلبةُ sell_price_usd، والكارتونُ سعرُه المكتوب (بعملة المادّة) وإلا العلبة × العدد",
    /return c\(pack\.sell_price\) \?\? \(box == null \? null : box \* Number\(pack\.per\)\);/.test(sbx));
  check("  والنصوص بالقاموسين", ["rateEdit", "rateTitle", "rateNow", "rateNone", "rateNew", "rateOne", "rateBad", "rateHint", "rateSave", "rateSaved", "rateFailed"].every((k) => ar.mxp?.[k] && en.mxp?.[k])
    && ["rateSale", "rateMine", "pickSale", "pickToday", "makeToday", "note", "atSale"].every((k) => ar.usd.settle[k] && en.usd.settle[k])
    && ["title", "itemsFailed"].every((k) => ar.usd.twin?.[k] && en.usd.twin?.[k]) && !("reason" in ar.usd.settle) && !("rateOther" in ar.usd.settle));
}

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
  ["خانةُ المفرد بقطعٍ لا تقريب", "src/lib/dualPrice.ts", "return (Math.round(c / unitsPerBox) / 100).toFixed(2);", "return (Math.floor(c / unitsPerBox) / 100).toFixed(2);"],
  ["الفاتورةُ بمجموعين بلا إرجاع النصفين", "src/lib/demoDual.ts", "    saveDB(JSON.parse(snapDb));\n", ""],
  ["مرجعُ الدولار بلا ~usd", "src/lib/demoDual.ts", "const uref = `${ref}~usd`;", "const uref = `${ref}-u`;"],
  ["الجزئيُّ بلا علَمه", "src/lib/demoUsd.ts", "const partial = !!meta.partial_ok && paidUsd > 0n", "const partial = paidUsd > 0n"],
  ["المفردُ يُخصم علبةً", "src/lib/demoUsd.ts", "stock: sub ? Number(divRound(BigInt(qty) * 1000n, BigInt(units))) / 1000 : qty * per", "stock: qty * per"],
  ["المفردُ يُتجاهل على مادّةٍ لم تعد بسعرين", "src/lib/demoUsd.ts", "const sub = !!it.sub;", "const sub = dual && !!it.sub;"],
  ["التوأمُ بغير مرجعه", "src/lib/dualApi.ts", "return invoiceByRef(`${ref}~usd`);", "return invoiceByRef(ref);"],
  ["المادّةُ بسعرين بكلفة الدولار", "src/lib/demoUsd.ts", "costCents: dual || p.purchase_price_usd == null ? null", "costCents: p.purchase_price_usd == null ? null"],
  ["السعرُ البعيد بلا سؤال", "src/lib/usdMath.ts", "return d * 100n > r * pct;", "return false;"],
  ["البعيدُ بأيّ مرجعٍ لا بكلّها", "src/lib/usdMath.ts", "return rs.every((r) =>", "return rs.some((r) =>"],
  ["دفعةُ البيع تُختم بعد الفاتورة (صفٌّ ثالث)", "src/lib/demoUsd.ts", "const at = atIn ?? new Date().toISOString();", "const at = new Date(Date.now() + 1000).toISOString();"],
  ["الورقةُ الواحدة بسكربتين", "src/lib/invoicePrint.ts", "h2.slice(b2s + \"<body>\".length, b2e)", "h2.slice(b2s + \"<body>\".length)"],
];
for (const [name, file, from, to] of MUTS) {
  let caught;
  /* طفرةٌ لا تجد نصَّها ترمي من load — كانت تُحسب «ممسوكة» بصمت (الشِفرةُ تغيّرت والطفرةُ صارت لا شيء). تُقال فشلاً. */
  let lost = null;
  try { caught = !(await behaviour(await load([[file, from, to]]), false)); }
  catch (e) { const m = String(e?.message ?? e); if (m.includes("طفرةٌ ما لقت نصّها")) lost = m; caught = true; }
  check(`طفرة «${name}» تُمسك`, caught && !lost, lost ?? undefined);
}

console.log(`\n${fails ? "✗" : "✓"} البيعُ بسعرين: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
