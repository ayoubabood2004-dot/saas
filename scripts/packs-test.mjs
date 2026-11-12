/* ============================================================================
 * التعبئةُ متعدّدةُ المستويات (0259) — بالواجهة: القاعدةُ النقيّة، والمرآةُ التجريبية بسلوكها، والأسلاك.
 * الحرّاسُ بالقاعدة نفسها يفحصها قسمُ 0259 بالحزمة على بوستغريس — وهنا **الحالاتُ نفسُها** على المرآة، حتى لا تقول التجريبيّةُ
 * غيرَ ما يقوله الخادم (فحوصُ المنطق تجري عليها — CLAUDE.md §٤).
 *   أ) النقيّ: الأسعارُ المحسوبة بالفلس، والتفصيلُ بالألف (والمغلّفُ يحمل للعلبة)، والرموزُ بمستوياتها بالتطبيع على الطرفين،
 *      وصاحبُ الرمز (العلبةُ مقابلَ العلبة ليست له)، والمسودّةُ تُرفض بما يرفضه القيد، ولا يُرسل ما لم يتغيّر.
 *   ب) المرآة: القيدُ وحارسُ المستويات والطيُّ والفكُّ والاسترجاع — بحالات قسم 0259 حرفاً.
 *   ج) المستودعُ التجريبيّ نفسُه: إنشاءٌ وتعديلٌ ودمجٌ وفكٌّ وحذفٌ واسترجاعٌ و«رتّب المخزن».
 *   د) الأسلاك: findByCode للعلبة وحدها والكارتونُ والمغلّفُ من بابهما (packSale، 0267 — يفحصه بسلوكه pack-sale-test)، والنطاقُ
 *      مملوكٌ ويُحمَّل مع الصفحة، والسقوفُ سقوفُ القيد.
 *
 *   node scripts/packs-test.mjs
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
if (!SESSION) { console.error("✗ packs-test: ما انقرأ مفتاحُ الجلسة"); process.exit(1); }

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
      'export * as K from "./src/lib/packs.ts";',
      'export * as M from "./src/lib/packsMirror.ts";',
      'export { findByCode } from "./src/lib/productCodes.ts";',
    ].join("\n"),
    resolveDir: process.cwd(), sourcefile: "packs-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "packs-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const mod = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, K, M, findByCode } = mod;
if (!repo || !K || !M || !findByCode) { console.error("✗ packs-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message ?? e.code ?? e.name; } };
const errSync = (f) => { try { f(); return "قُبل"; } catch (e) { return e.message ?? e.code; } };

const pk = (id, per, codes = [], extra = {}) => ({ id, name: "كارتون", codes, per, purchase_price: null, sell_price: null, ...extra });
const prod = (id, extra = {}) => ({ id, name: id, barcode: null, alt_codes: [], purchase_price: 0, sell_price: 0, stock: 0, created_at: `2026-01-01T00:00:${String(id.length).padStart(2, "0")}Z`, ...extra });

/* ── أ) النقيّ ──────────────────────────────────────────────────────────── */
console.log("▸ القاعدةُ النقيّة: الأسعار، والتفصيل، والرموزُ بمستوياتها، والمسودّة");
{
  const p = { sell_price: 1500.25, purchase_price: 1000, packs: [pk("a", 12)], has_sub_unit: true, units_per_box: 3, sub_purchase_price: null };
  check("سعرُ الكارتون الفارغ = العلبة × العدد بالفلس (١٥٠٠٫٢٥ × ١٢ = ١٨٠٠٣)، والمكتوبُ يغلب",
    K.packPrice(p, p.packs[0], "sell") === 18003 && K.packPrice(p, pk("b", 12, [], { sell_price: 17000 }), "sell") === 17000 && K.packPriceDerived(p.packs[0], "sell"));
  check("سعرُ شراء المغلّف الفارغ = شراءُ العلبة ÷ العدد لأقرب فلس (١٠٠٠ ÷ ٣ = ٣٣٣٫٣٣)، والمكتوبُ يغلب، وبلا وحدةٍ صغرى null",
    K.subPurchasePrice(p) === 333.33 && K.subPurchasePrice({ ...p, sub_purchase_price: 300 }) === 300 && K.subPurchasePrice({ ...p, has_sub_unit: false }) === null);

  const b = (stock, x = {}) => { const r = K.breakdown({ packs: [pk("a", 12)], has_sub_unit: true, units_per_box: 10, ...x }, stock); return r ? `${r.packs}/${r.boxes}/${r.subs}` : "null"; };
  check("التفصيلُ بالكارتون الأوّل: ٣٠٫٥ = ٢ كارتون + ٦ علب + ٥ مغلّفات، و١٢ = كارتونٌ واحد",
    b(30.5) === "2/6/5" && b(12) === "1/0/0" && b(0) === "0/0/0", `${b(30.5)} ${b(12)} ${b(0)}`);
  check("  والمغلّفُ يُقرَّب ويحمل للعلبة ثمّ للكارتون (٠٫٩٩٩ ⇒ علبة، ١١٫٩٩٩ ⇒ كارتون) — بالألف لا بالعائم",
    b(0.999) === "0/1/0" && b(11.999) === "1/0/0" && b(0.1 + 0.2) === "0/0/3", `${b(0.999)} ${b(11.999)} ${b(0.1 + 0.2)}`);
  check("  وبلا وحدةٍ صغرى العلبُ كسرٌ (٢٥٫٥ = ٢ كارتون + ١٫٥ علبة)، والعجزُ والوزنُ وبلا كارتون: لا تفصيل",
    b(25.5, { has_sub_unit: false }) === "2/1.5/0" && b(-1) === "null" && b(5, { sold_by_weight: true }) === "null" && b(5, { packs: [] }) === "null" && b(5, { packs: null }) === "null");

  const x = { barcode: " PK-1‎", alt_codes: ["alt-1"], sub_codes: ["SUB-1"], packs: [pk("c1", 6, ["Ctn-1"]), pk("c2", 24, ["CTN-2"])] };
  const lc = K.levelCodes(x);
  check("الرموزُ بمستوياتها وخاناتها، مطبَّعةً (المحارفُ الخفية والمسافةُ والحالة) — مرآةُ product_level_codes",
    lc.map((c) => `${c.norm}:${c.slot}`).join(",") === "pk-1:box,alt-1:box,sub-1:sub,ctn-1:pack:c1,ctn-2:pack:c2", lc.map((c) => `${c.norm}:${c.slot}`).join(","));
  check("  ولقطةٌ قديمة (packs وsub_codes null) بلا رموزِ مستوى، لا رمي", K.levelCodes({ barcode: "A", packs: null, sub_codes: null }).length === 1);

  const P = [prod("own", { barcode: "B-1", packs: [pk("o1", 12, ["C-1"])], has_sub_unit: true, units_per_box: 10, sub_codes: ["S-1"] }), prod("other", { barcode: "B-2" })];
  check("صاحبُ الرمز: الكارتونُ مقابلَ علبةِ غيره ومغلّفِه، والعلبةُ مقابلَ كارتونِ غيرها — والعلبةُ مقابلَ العلبة ليست له (findByCode)",
    K.codeOwner(P, "b-1", "pack", "other")?.level === "box" && K.codeOwner(P, "S-1", "pack", "other")?.level === "sub"
    && K.codeOwner(P, "c-1", "box", "other")?.level === "pack" && K.codeOwner(P, "B-1", "box", "other") === undefined
    && K.codeOwner(P, "C-1", "pack", "own") === undefined);
  check("  وما لم يتغيّر بخانته لا يُفحص (إعفاءُ الخادم)، ونقلُه لخانةٍ أخرى رمزٌ جديد",
    K.firstTakenCode(P, { barcode: "X", packs: [pk("z", 6, ["C-1"])] }, { barcode: "X", packs: [pk("z", 6, ["C-1"])] }, "other") === null
    && K.firstTakenCode(P, { barcode: "X", packs: [pk("z2", 6, ["C-1"])] }, { barcode: "X", packs: [pk("z", 6, ["C-1"])] }, "other")?.hit.product.id === "own");
  check("بحثُ المخزن برمز كارتونٍ أو مغلّفٍ (جزئيّ، مطبَّع) يجد المادةَ ومستواها، والعلبةُ لـcodeMatcher كما هي",
    K.levelMatcher("ctn")(prod("q", x))?.level === "pack" && K.levelMatcher("SUB")(prod("q", x))?.level === "sub"
    && K.levelMatcher("pk-1")(prod("q", x)) === null && K.levelMatcher("  ")(prod("q", x)) === null
    && K.levelByCode([prod("q", x)], "CTN-2")?.pack?.id === "c2");

  const ctx = { barcode: "BOX-1", alt_codes: [], hasSubUnit: true, unitsPerBox: 10, byWeight: false, pooled: false };
  const d = (packs, extra = {}) => ({ unit_name: "", sub_codes: [], sub_purchase_price: "", packs, ...extra });
  const pd = (o = {}) => ({ id: "k1", name: "كارتون", per: "12", codes: [], purchase_price: "", sell_price: "", ...o });
  const kind = (r) => (r.ok ? "ok" : r.problem.kind);
  const ok = K.packagingFromDraft(d([pd({ codes: [" ctn-a ", "CTN-A", ""], sell_price: "18,000" })], { unit_name: "  قنينة  ", sub_codes: ["s-1"], sub_purchase_price: "" }), ctx);
  check("المسودّةُ السليمة: الرموزُ بلا فراغٍ ولا تكرارٍ مطبَّع، والفارغُ null (محسوب)، والاسمُ منظَّف",
    ok.ok && JSON.stringify(ok.value.packs[0].codes) === '["ctn-a"]' && ok.value.packs[0].sell_price === 18000 && ok.value.packs[0].purchase_price === null
    && ok.value.unit_name === "قنينة" && ok.value.sub_purchase_price === null && ok.value.sub_codes[0] === "s-1", JSON.stringify(ok));
  check("وتُرفض بما يرفضه القيد: عددٌ ١ أو كسر، واسمٌ فارغ، وسعرٌ سالب، وخمسةُ كراتين، وستّةُ رموز، ورمزٌ بطول ٦٥",
    [kind(K.packagingFromDraft(d([pd({ per: "1" })]), ctx)), kind(K.packagingFromDraft(d([pd({ per: "2.5" })]), ctx)), kind(K.packagingFromDraft(d([pd({ name: "  " })]), ctx)),
     kind(K.packagingFromDraft(d([pd({ sell_price: "-1" })]), ctx)), kind(K.packagingFromDraft(d([1, 2, 3, 4, 5].map((i) => pd({ id: `k${i}`, per: String(i + 1) }))), ctx)),
     kind(K.packagingFromDraft(d([pd({ codes: ["1", "2", "3", "4", "5", "6"] })]), ctx)), kind(K.packagingFromDraft(d([pd({ codes: ["x".repeat(65)] })]), ctx))].join(",")
    === "pack_per,pack_per,pack_name,pack_price,pack_count,pack_codes,code_len");
  check("  ومغلّفٌ بلا وحدةٍ صغرى، وكراتينُ لمادةٍ بالوزن أو مجمّعة، واسمُ وحدةٍ بـ٢١ حرفاً",
    [kind(K.packagingFromDraft(d([], { sub_codes: ["s"] }), { ...ctx, hasSubUnit: false })), kind(K.packagingFromDraft(d([pd()]), { ...ctx, byWeight: true })),
     kind(K.packagingFromDraft(d([pd()]), { ...ctx, pooled: true })), kind(K.packagingFromDraft(d([], { unit_name: "ع".repeat(21) }), ctx))].join(",")
    === "sub_no_unit,packs_unit,packs_unit,unit_name");
  check("  ورمزٌ لمستويين بنفس المادة (كارتونٌ برمز العلبة مطبَّعاً، أو مغلّفٌ برمز كارتون، أو كارتونان برمز) ⇒ level_twin",
    [kind(K.packagingFromDraft(d([pd({ codes: ["box-1"] })]), ctx)), kind(K.packagingFromDraft(d([pd({ codes: ["C9"] })], { sub_codes: ["c9"] }), ctx)),
     kind(K.packagingFromDraft(d([pd({ codes: ["C9"] }), pd({ id: "k2", per: "24", codes: ["C9"] })]), ctx))].join(",") === "level_twin,level_twin,level_twin");
  check("  وكارتونٌ فارغٌ تماماً (زرّ «أضف» بلا كتابة) يُتجاهَل لا يُرفض", kind(K.packagingFromDraft(d([pd({ name: "", per: "" })]), ctx)) === "ok"
    && K.packagingFromDraft(d([pd({ name: "", per: "" })]), ctx).value.packs.length === 0);
  const before = { unit_name: null, sub_codes: [], sub_purchase_price: null, packs: [pk("k1", 12, ["A"], { name: "كارتون" })] };
  check("لا يُرسل ما لم يتغيّر (قاعدةٌ قبل 0259 لا تعرف الأعمدة، ولا دوسٌ لتعديل جهازٍ آخر)، والمتغيّرُ وحده يُرسل",
    JSON.stringify(K.packagingPatch(before, { unit_name: null, sub_codes: [], sub_purchase_price: null, packs: [pk("k1", 12, ["A"], { name: "كارتون" })] })) === "{}"
    && Object.keys(K.packagingPatch(before, { unit_name: "قنينة", sub_codes: [], sub_purchase_price: null, packs: before.packs })).join(",") === "unit_name"
    && JSON.stringify(K.packagingPatch(null, { unit_name: null, sub_codes: [], sub_purchase_price: null, packs: [] })) === "{}");
  check("والمسودّةُ من الصفّ وإليه: لقطةٌ null ⇒ فارغة، والأرقامُ نصوصٌ والفارغُ «»",
    JSON.stringify(K.draftOf({ packs: null, sub_codes: null })) === JSON.stringify({ unit_name: "", sub_codes: [], sub_purchase_price: "", packs: [] })
    && K.draftOf(before).packs[0].per === "12" && K.draftOf(before).packs[0].sell_price === "");
}

/* ── ب) المرآة: حالاتُ قسم 0259 بالحزمة ─────────────────────────────────── */
console.log("▸ المرآة: القيد، وحارسُ المستويات، والطيُّ والفكُّ والاسترجاع — بحالات الحزمة");
{
  const P1 = prod("P1", { name: "أموكسي", barcode: "PK-BOX-1", has_sub_unit: true, units_per_box: 10, sub_unit_name: "شريط", sub_codes: ["PK-SUB-1"], packs: [pk("c1", 12, ["PK-CTN-1"])] });
  const P2 = prod("P2", { name: "فيتامين", barcode: "PK-BOX-2", sub_codes: [], packs: [] });
  const shape = (x) => M.packagingShapeError({ ...P2, ...x })?.code ?? "ok";
  check("القيد: عددٌ ١ أو كسرٌ أو نصّ، وخمسةُ كراتين، ومعرّفٌ مكرّر، واسمٌ فارغ، وستّةُ رموز، وسعرٌ سالب أو نصّ، ولا مصفوفة ⇒ 23514",
    [shape({ packs: [pk("a", 1)] }), shape({ packs: [pk("a", 2.5)] }), shape({ packs: [{ ...pk("a", 2), per: "12" }] }),
     shape({ packs: [2, 3, 4, 5, 6].map((n, i) => pk(`x${i}`, n)) }), shape({ packs: [pk("a", 2), pk("a", 3)] }), shape({ packs: [{ ...pk("a", 2), name: "  " }] }),
     shape({ packs: [pk("a", 2, ["1", "2", "3", "4", "5", "6"])] }), shape({ packs: [pk("a", 2, [], { sell_price: -1 })] }), shape({ packs: [pk("a", 2, [], { purchase_price: "5" })] }),
     shape({ packs: { id: "a" } })].every((c) => c === "23514"));
  check("  ورمزٌ بطول ٦٥، ومغلّفٌ بلا وحدةٍ صغرى، وستّةُ باركودات مغلّف، وسعرُ شراء مغلّفٍ سالب، واسمُ وحدةٍ فارغ أو بـ٢١، وكارتونٌ لمادةٍ بالوزن أو مجمَّعة",
    [shape({ packs: [pk("a", 2, ["x".repeat(65)])] }), shape({ sub_codes: ["PK-X1"] }), shape({ has_sub_unit: true, units_per_box: 10, sub_codes: ["1", "2", "3", "4", "5", "6"] }),
     shape({ sub_purchase_price: -1 }), shape({ unit_name: "  " }), shape({ unit_name: "ع".repeat(21) }),
     shape({ packs: [pk("a", 2)], sold_by_weight: true }), shape({ packs: [pk("a", 2)], pooled: true })].every((c) => c === "23514"));
  check("  والسليمُ يمرّ: أربعةُ كراتين بأسعارٍ وبلا، واسمُ وحدة، وسعرُ شراء مغلّف، ولقطةٌ بمستوياتٍ null",
    shape({ packs: [pk("a", 2, ["PK-Q1"], { purchase_price: 0, sell_price: 1500.25 }), pk("b", 3), pk("c", 4), pk("d", 100000)], unit_name: "قنينة" }) === "ok"
    && M.packagingShapeError({ ...P1, sub_purchase_price: 250 }) === null && shape({ packs: null, sub_codes: null }) === "ok");

  const all = [P1, P2];
  const g = (next, prev = null, skip = null) => M.levelGuardError(all, next, prev, skip)?.message ?? "ok";
  check("حارسُ المستويات داخل المادة: كارتونٌ برمز علبتها ومطبَّعاً، ومغلّفٌ برمز كارتونها ⇒ code_level_twin",
    g({ ...P2, packs: [pk("a", 6, ["PK-BOX-2"])] }, P2) === "code_level_twin" && g({ ...P2, packs: [pk("a", 6, ["pk-box-2"])] }, P2) === "code_level_twin"
    && g({ ...P1, sub_codes: ["PK-CTN-1"] }, P1) === "code_level_twin");
  check("  وبين الموادّ: كارتونٌ برمز علبةِ غيره أو مغلّفِه، وعلبةٌ برمز كارتونِ غيرها، ومادةٌ جديدة برمز مغلّفِ غيرها مطبَّعاً ⇒ barcode_taken",
    g({ ...P2, packs: [pk("a", 6, ["PK-BOX-1"])] }, P2) === "barcode_taken" && g({ ...P2, packs: [pk("a", 6, ["PK-SUB-1"])] }, P2) === "barcode_taken"
    && g({ ...P2, alt_codes: ["PK-CTN-1"] }, P2) === "barcode_taken" && g(prod("new", { barcode: "pk-sub-1" })) === "barcode_taken");
  check("  والعلبةُ مقابلَ العلبة باقيةٌ لـ0167 (الإضافيُّ لا يُشدّ)", g({ ...P2, alt_codes: ["PK-BOX-1"] }, P2) === "ok");
  const P3 = prod("P3", { name: "تصادمٌ قديم", barcode: "PK-OLD", packs: [pk("o", 6, ["PK-CTN-1"])] });
  check("  وما لم يتغيّر لا يُفحص (تصادمٌ قديم لا يُسقط حفظَ اسم ولا رمزاً حرّاً بجانبه)، ونقلُه لخانةٍ أخرى يُفحص",
    g({ ...P3, name: "x" }, P3) === "ok" && g({ ...P3, packs: [pk("o", 6, ["PK-CTN-1", "PK-FREE-9"])] }, P3) === "ok"
    && g({ ...P3, packs: [pk("o2", 6, ["PK-CTN-1"])] }, P3) === "barcode_taken");
  check("  والتوأمُ الذي يُطوى مستثنىً وحده (doctorvet.codes_from)", g({ ...P2, packs: [pk("a", 6, ["PK-CTN-1"])] }, P2, "P1") === "ok");

  const A = prod("A", { name: "دمج أصل", barcode: "MG-A", stock: 3, has_sub_unit: true, units_per_box: 10, sub_unit_name: "شريط", sub_codes: ["MG-A-S"], packs: [pk("ka", 12, ["MG-A-C12"], { purchase_price: 100 })] });
  const B = prod("B", { name: "دمج توأم", barcode: "MG-B", stock: 2, has_sub_unit: true, units_per_box: 10, sub_codes: ["MG-B-S"], unit_name: "قنينة", sub_purchase_price: 7,
    packs: [pk("kb", 12, ["MG-B-C12"], { sell_price: 150 }), { ...pk("kb2", 24, ["MG-B-C24"]), name: "كارتون كبير" }] });
  const lv = (x) => `${(x.sub_codes ?? []).join(",") || "∅"}|${(x.packs ?? []).map((k) => `${k.id}:${k.per}:${(k.codes ?? []).join(",")}`).join(";") || "∅"}`;
  const m = M.mergePackaging(A, B);
  check("الطيُّ يحمل المغلّفَ والكراتين: كارتونٌ بنفس العدد يضمّ رموزَ أخيه، والآخرُ يُلحق (كالحزمة حرفاً)",
    lv(m) === "MG-A-S,MG-B-S|ka:12:MG-A-C12,MG-B-C12;kb2:24:MG-B-C24", lv(m));
  check("  وأسعارُ الأصل تغلب وفارغُها يأخذ أخاه، واسمُ الوحدة وسعرُ شراء المغلّف يملآن فراغه",
    m.packs[0].purchase_price === 100 && m.packs[0].sell_price === 150 && m.unit_name === "قنينة" && m.sub_purchase_price === 7);
  const keepAfter = { ...A, ...m, alt_codes: ["MG-B"] };
  const um = M.unmergePackaging(keepAfter, B);
  check("الفكُّ يشيلها من الأصل (وسعرُ الكارتون الذي ملأ فراغَه يبقى — كالصورة)", lv(um) === "MG-A-S|ka:12:MG-A-C12" && um.packs[0].sell_price === 150, lv(um));
  const C = prod("C", { barcode: "MG-C" }), D = prod("D", { barcode: "MG-D", has_sub_unit: true, units_per_box: 12 });
  const E = prod("E", { barcode: "MG-E", sold_by_weight: true }), F = prod("F", { barcode: "MG-F", packs: [pk("f", 6)] });
  const G = prod("G", { barcode: "MG-G", packs: [pk("g1", 2), pk("g2", 3), pk("g3", 4)] }), H = prod("H", { barcode: "MG-H", packs: [pk("h1", 5), pk("h2", 6)] });
  check("وما لا يُحمل يُرفض بصوت: مغلّفٌ لأصلٍ بلا وحدةٍ صغرى أو بعددٍ آخر، وكراتينُ لمادةٍ بالوزن، وأكثرُ من أربعة",
    [errSync(() => M.mergePackaging(C, B)), errSync(() => M.mergePackaging(D, B)), errSync(() => M.mergePackaging(E, F)), errSync(() => M.mergePackaging(G, H))].join("|")
    === "merge_sub_codes|merge_sub_codes|merge_packs_unit|merge_packs_overflow");
  const u = M.packsUnion([pk("a", 6)], [pk("a", 12)]);
  check("  ومعرّفُ كارتونٍ يصادف معرّفاً بالأصل يُلحق بمعرّفٍ جديد", u.length === 2 && new Set(u.map((k) => k.id)).size === 2 && u[1].per === 12);
  check("  والفكُّ لا يشيل كارتونَ الأصل الذي صادف معرّفُه معرّفَ المطويّ بعددٍ آخر (المعرّفُ والعددُ معاً)",
    M.packsMinus([pk("a", 6, ["X"]), pk("n", 12, ["Y"])], [pk("a", 12, ["Y"])]).map((k) => `${k.id}:${k.codes.join(",")}`).join(";") === "a:X;n:");

  const T = { ...prod("T"), barcode: "RS-B", alt_codes: ["RS-ALT", "RS-ALT2"], has_sub_unit: true, units_per_box: 10, sub_codes: ["RS-S"], packs: [pk("t1", 6, ["RS-C", "RS-C2"])] };
  const others = [prod("U", { barcode: "RS-C" }), prod("V", { packs: [pk("v1", 6, ["RS-S"])] }), prod("W", { has_sub_unit: true, units_per_box: 4, sub_codes: ["RS-B"] }), prod("X", { packs: [pk("x1", 8, ["RS-ALT"])] })];
  const fr = M.snapshotFree(T, others);
  check("الاسترجاعُ لا يفشل برمزٍ أُخذ بمستوىً آخر: الأساسيُّ والإضافيُّ والمغلّفُ ورمزُ الكارتون المأخوذة تسقط، والحرّةُ تبقى",
    `${fr.barcode ?? "∅"}:${fr.alt_codes.join(",")}|${lv(fr)}` === "∅:RS-ALT2|∅|t1:6:RS-C2", `${fr.barcode ?? "∅"}:${fr.alt_codes.join(",")}|${lv(fr)}`);
  const old = M.snapshotFree({ ...prod("O"), barcode: "RS-OLD" }, others);
  check("  ولقطةٌ قبل 0259 (بلا المفاتيح) ترجع بمستوياتٍ فارغة لا null", Array.isArray(old.packs) && old.packs.length === 0 && Array.isArray(old.sub_codes) && old.sub_codes.length === 0);
}

/* ── ج) المستودعُ التجريبيّ نفسُه ─────────────────────────────────────── */
console.log("▸ المستودعُ التجريبيّ: إنشاءٌ وتعديلٌ ودمجٌ وفكٌّ وحذفٌ واسترجاعٌ و«رتّب المخزن» بحرّاس 0259");
{
  mem.set(SESSION, JSON.stringify({ raw: { id: "v1", full_name: "طبيب", email: "v1@demo.vet", rawRole: "doctor", roles: ["clinic"], clinic_id: "clinic-happy-paws" }, active: "clinic" }));
  const base = { purchase_price: 1000, sell_price: 1500, stock: 3, category: null };
  const a = await repo.createProduct({ ...base, name: "أموكسي ٠٢٥٩", barcode: "DM-BOX-1", has_sub_unit: true, units_per_box: 10, sub_unit_name: "شريط", sub_codes: ["DM-SUB-1"], packs: [pk("d1", 12, ["DM-CTN-1"])] });
  check("مادةٌ بكارتونٍ ومغلّفٍ تُنشأ", a.id && a.packs.length === 1);
  check("  ومادةٌ جديدة برمز كارتونها أو مغلّفِها تُرفض (barcode_taken بتلميحٍ يسمّيها)، وبرمز علبتها كما كانت (0167)",
    await errOf(() => repo.createProduct({ ...base, name: "x", barcode: "dm-ctn-1" })) === "barcode_taken"
    && await errOf(() => repo.createProduct({ ...base, name: "x", barcode: "DM-SUB-1" })) === "barcode_taken"
    && await errOf(() => repo.createProduct({ ...base, name: "x", barcode: "DM-BOX-1" })) === "barcode_taken");
  const b = await repo.createProduct({ ...base, name: "فيتامين ٠٢٥٩", barcode: "DM-BOX-2" });
  check("التعديل: كارتونٌ برمز علبةِ غيره ⇒ barcode_taken، وبرمز علبته ⇒ code_level_twin، وشكلٌ غريب ⇒ 23514 — ولا شيءَ يُكتب",
    await errOf(() => repo.updateProduct(b.id, { packs: [pk("e", 6, ["DM-BOX-1"])] })) === "barcode_taken"
    && await errOf(() => repo.updateProduct(b.id, { packs: [pk("e", 6, ["DM-BOX-2"])] })) === "code_level_twin"
    && /products_packaging_ok/.test(await errOf(() => repo.updateProduct(b.id, { packs: [pk("e", 1)] })))
    && (await repo.listProducts()).find((x) => x.id === b.id).packs === undefined);
  check("  ومادةٌ بكراتين لا تصير بالوزن (القيدُ على كلّ تحديث)", /products_packaging_ok/.test(await errOf(() => repo.updateProduct(a.id, { sold_by_weight: true }))));
  check("  وربطُ رمزِ كارتونِ غيره رمزاً إضافياً (نافذةُ الكاشير القديمة) يُرفض", await errOf(() => repo.attachProductCode(b.id, "DM-CTN-1")) === "barcode_taken");

  const twin = await repo.createProduct({ ...base, stock: 2, name: "أموكسي توأم ٠٢٥٩", barcode: "DM-BOX-3", has_sub_unit: true, units_per_box: 10, sub_codes: ["DM-SUB-3"], unit_name: "قنينة", packs: [pk("t1", 12, ["DM-CTN-3"], { sell_price: 18500 }), pk("t2", 24, ["DM-CTN-24"])] });
  const merged = await repo.mergeProducts(a.id, twin.id);
  const lvl = (x) => `${(x.sub_codes ?? []).join(",")}|${(x.packs ?? []).map((k) => `${k.id}:${k.per}:${(k.codes ?? []).join(",")}`).join(";")}`;
  check("الدمجُ يحمل المغلّفَ والكراتين للأصل (والرصيدُ ٣ + ٢، واسمُ الوحدة يملأ فراغه)",
    lvl(merged) === "DM-SUB-1,DM-SUB-3|d1:12:DM-CTN-1,DM-CTN-3;t2:24:DM-CTN-24" && merged.stock === 5 && merged.unit_name === "قنينة", lvl(merged));
  check("  والرمزُ المحمول صار للأصل: مادةٌ جديدة برمزه تُرفض", await errOf(() => repo.createProduct({ ...base, name: "x", barcode: "DM-CTN-24" })) === "barcode_taken");
  const back = await repo.restoreProduct(twin.id);
  const keepNow = (await repo.listProducts()).find((x) => x.id === a.id);
  check("الفكُّ يشيلها من الأصل ويعيدها للمطويّ كما كانت",
    lvl(keepNow) === "DM-SUB-1|d1:12:DM-CTN-1" && lvl(back) === "DM-SUB-3|t1:12:DM-CTN-3;t2:24:DM-CTN-24" && keepNow.stock === 3, `${lvl(keepNow)} / ${lvl(back)}`);
  const noUnit = await repo.createProduct({ ...base, name: "بلا وحدة ٠٢٥٩", barcode: "DM-BOX-4" });
  check("  ودمجٌ لا يُحمل (مغلّفٌ لأصلٍ بلا وحدةٍ صغرى) يُرفض merge_sub_codes ولا يكتب شيئاً (المطويُّ حيّ، لا صفَّ بالسلّة)",
    await errOf(() => repo.mergeProducts(noUnit.id, twin.id)) === "merge_sub_codes"
    && (await repo.listProducts()).some((x) => x.id === twin.id) && !(await repo.listDeletedProducts()).some((x) => x.id === twin.id));

  const t = await repo.createProduct({ ...base, name: "مستعاد ٠٢٥٩", barcode: "DM-RS-B", has_sub_unit: true, units_per_box: 10, sub_codes: ["DM-RS-S"], packs: [pk("r1", 6, ["DM-RS-C", "DM-RS-C2"])] });
  await repo.deleteProduct(t.id, "فحص");
  await repo.createProduct({ ...base, name: "أخذ الكارتون علبةً", barcode: "DM-RS-C" });
  await repo.createProduct({ ...base, name: "أخذ العلبة مغلّفاً", has_sub_unit: true, units_per_box: 4, sub_codes: ["DM-RS-B"] });
  const r = await repo.restoreProduct(t.id);
  check("الاسترجاعُ بعد أن أُخذت رموزُه بمستوىً آخر: يرجع بلاها وبما بقي حرّاً",
    (r.barcode ?? "∅") === "∅" && lvl(r) === "DM-RS-S|r1:6:DM-RS-C2", `${r.barcode} ${lvl(r)}`);

  const sec = await repo.createCompanySection?.({ name: "رفّ ٠٢٥٩" }).catch(() => null);
  if (sec?.id) {
    await repo.createProduct({ ...base, name: "توأم معبّأ ٠٢٥٩", packs: [pk("y1", 10, ["DM-TD-C"])] });
    await repo.createProduct({ ...base, name: "توأم معبّأ ٠٢٥٩", section_id: sec.id });
    await repo.createProduct({ ...base, name: "توأم عادي ٠٢٥٩" });
    await repo.createProduct({ ...base, name: "توأم عادي ٠٢٥٩", section_id: sec.id });
    const res = await repo.tidyInventory();
    const names = (await repo.listProducts()).filter((x) => !x.section_id && /توأم (معبّأ|عادي) ٠٢٥٩/.test(x.name)).map((x) => x.name);
    check("«رتّب المخزن» لا يطوي توأماً له تعبئة ويطوي العاديَّ كما كان", res.merged >= 1 && names.join(",") === "توأم معبّأ ٠٢٥٩", JSON.stringify({ res, names }));
  } else {
    check("«رتّب المخزن» (أنشأتُ الصنفَ للفحص)", false, "createCompanySection غائبة أو رمت — صحّح الفحص");
  }
}

/* ── د) الأسلاك ──────────────────────────────────────────────────────────── */
console.log("▸ الأسلاك: العلبةُ لـfindByCode والكارتونُ لبابه، والنطاقُ مملوك، والسقوفُ سقوفُ القيد");
{
  const P = [prod("p", { barcode: "B-1", packs: [pk("c", 12, ["C-1"])], has_sub_unit: true, units_per_box: 5, sub_codes: ["S-1"] })];
  check("findByCode للعلبة وحدها: رمزُ الكارتون والمغلّف لا يُرجع المادّةَ علبةً (لا يُباع كارتونٌ بسعر علبة) — بابُهما levelByCode بمستواه",
    findByCode(P, "B-1")?.id === "p" && findByCode(P, "C-1") === undefined && findByCode(P, "S-1") === undefined
    && K.levelByCode(P, "c-1")?.level === "pack" && K.levelByCode(P, "C-1")?.pack?.per === 12 && K.levelByCode(P, "S-1")?.level === "sub");
  const mig = src("supabase/migrations/0259_product_packs.sql");
  check("سقوفُ الواجهة سقوفُ القيد بالهجرة (٤ كراتين، ٥ رموز، ٢٠ حرفاً، العددُ ٢–١٠٠٠٠٠، ٦٤ للرمز)",
    /jsonb_array_length\(p\) > 4/.test(mig) && /<= 5/.test(mig) && /between 2 and 100000/.test(mig) && /not between 1 and 64/.test(mig) && /between 1 and 20/.test(mig)
    && K.PACK_LIMITS.packs === 4 && K.PACK_LIMITS.codes === 5 && K.PACK_LIMITS.name === 20 && K.PACK_LIMITS.perMin === 2 && K.PACK_LIMITS.perMax === 100000 && K.PACK_LIMITS.codeLen === 64);
  const hp = JSON.parse(src("src/i18n/hot-paths.json"));
  check("النطاقُ pkg مملوكٌ لصفحة المخزون ورفيقِها المحرّر، والصفحةُ تُحمَّل به (App.tsx)",
    hp.owned.pkg?.owner === "src/pages/Inventory.tsx" && hp.owned.pkg.with.includes("src/components/inventory/PackagingEditor.tsx")
    && /import\("@\/pages\/Inventory"\)[^;]*\["pkg"\]/.test(code("src/App.tsx")));
  const sb = code("src/components/retail/SaleBuilder.tsx");
  check("شاشةُ البيع لا تستورد التعبئةَ ثابتاً (قطعةُ البيع وفسحةُ الإقلاع) — بابُها packSale بـimport() (0267)",
    !/from\s*["']@\/lib\/(packs|packsMirror|packSale)["']/.test(sb) && /import\("@\/lib\/packSale"\)/.test(sb));
  const pu = code("src/components/inventory/Purchases.tsx");
  check("وفاتورةُ الشراء تعرف رمزَ الكارتون قبل «مادّةٌ جديدة» (levelByCode بعد العلبة وقبل صيغ الماسح)",
    /const lv = levelByCode\(products, raw\);/.test(pu) && pu.indexOf("const lv = levelByCode(products, raw);") < pu.indexOf("rescueScan(products, raw)"));
  const inv = code("src/pages/Inventory.tsx");
  check("النموذجُ يرسل التعبئةَ بـpackagingPatch وحدها (ما لم يتغيّر لا يُرسل)، ويقول صاحبَ الرمز قبل الشبكة",
    /\.\.\.pkgFields/.test(inv) && /packagingPatch\(product \?\? null/.test(inv) && /firstTakenCode\(/.test(inv) && /packagingFromDraft\(/.test(inv));
  check("ولا window.confirm بالمحرّر", !/window\.confirm/.test(code("src/components/inventory/PackagingEditor.tsx")));
  check("والاسترجاعُ يقول رموزَ التعبئة التي سقطت (صارت لغيره) — لا يبلعها كما كان يبلع الإضافيّة قبل 0165",
    /lostPkg/.test(inv) && /pkg\.restoredLost/.test(inv));
  const demo = code("src/lib/repoDemo.ts");
  check("المرآةُ بكلّ كاتبٍ لصفّ المادة (إنشاء، تعديل، ربطُ رمز، باركودٌ فارغ، دمج) وبالاسترجاع والترتيب",
    (demo.match(/throwIfPackagingBad\(/g) ?? []).length >= 6 && /snapshotFree\(/.test(demo) && /unmergePackaging\(/.test(demo) && /mergePackaging\(/.test(demo) && /hasPackaging\(dup\)/.test(demo));
}

console.log(fails ? `✗ packs-test: ${fails} فشل من ${fails + passes}` : `✓ packs-test: ${passes} فحصاً`);
process.exit(fails ? 1 : 0);
