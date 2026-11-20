/* ============================================================================
 * المنتجاتُ المربوطة (0277) — بسلوكها لا بنصّها، وبطفراتٍ تُمسك كلُّها.
 *
 *  ١) الحسابُ الصِّرف (productGroups.ts): المجموعةُ عضوان فأكثر، والسعرُ الواحد أو «مختلف»، والعنوانُ المشترك، وما رآه الجهاز،
 *     والخانةُ تقرأ ما كُتب، وسؤالُ فاتورة الشراء «لكل المجموعة؟» لما تغيّر سعرُه وحده.
 *  ٢) المرآةُ التجريبية (demoProductGroups) بالأرقام نفسِها التي يفحصها قسمُ 0277 بـrun.sh على القاعدة — «حارسٌ لا يوجد بالتجريبيّ
 *     حارسٌ لم يُفحص» (CLAUDE.md §٤): البوّابة، وما رآه الجهاز، والعملة، والفكُّ الذي يحلّ مجموعةَ العضو الواحد، والنسخُ بعملته.
 *  ٣) طفرات: كلُّ قاعدةٍ أعلاه تُكسر بنسخةٍ معدَّلة من مصدرها ويجب أن يسقط فحصٌ واحدٌ على الأقل.
 *
 *   node scripts/product-groups-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, location: { hostname: "doctorvet.vet", origin: "https://doctorvet.vet" },
  addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
/** يبني الوحدة — و`patch` طفرةٌ: [ملف، من، إلى] تُطبَّق على نصّ الملف قبل الحزم (من لازم يوجد مرّةً واحدة). */
async function load(patch = null) {
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
      if (patch) {
        const target = resolve(patch[0]);
        b.onLoad({ filter: /\.ts$/ }, (a) => {
          if (resolve(a.path) !== target) return undefined;
          const txt = readFileSync(a.path, "utf8");
          if (txt.split(patch[1]).length !== 2) throw new Error(`الطفرة ما لقت نصّها مرّةً واحدة: ${patch[1].slice(0, 60)}`);
          return { contents: txt.replace(patch[1], patch[2]), loader: "ts" };
        });
      }
    },
  };
  const built = await esbuild.build({
    stdin: {
      contents: [
        'export * from "./src/lib/productGroups.ts";',
        'export { linkProducts, unlinkProducts, setGroupPrice, followGroup, isGroupStale } from "./src/lib/productGroupsApi.ts";',
        'export { loadDB, saveDB } from "./src/lib/demoStore.ts";',
      ].join("\n"),
      resolveDir: process.cwd(), sourcefile: "product-groups-entry.ts", loader: "ts",
    },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
    alias: { "@": resolve("src") },
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(join(tmpdir(), "product-groups-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

/** السيناريو كلُّه — يرجع عددَ الفاشل؛ والطباعةُ للتشغيل الحقيقيّ وحده. */
async function run(M, say) {
  let fails = 0;
  const check = (name, cond, detail = "") => {
    if (cond) say?.(`   ✓ ${name}`);
    else { fails++; say?.(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`, true); }
  };
  const codeOf = async (p) => { try { await p; return "ok"; } catch (e) { return String(e?.message ?? e); } };
  const P = (id, name, sell, buy, extra = {}) => ({ id, name, barcode: `PG-${id}`, stock: 1, sell_price: sell, purchase_price: buy, bulk_group: null, price_currency: "IQD", created_at: "2026-11-17T00:00:00Z", ...extra });

  /* ══ ١) الحسابُ الصِّرف ══ */
  say?.("▸ ١) productGroups — المجموعةُ والسعرُ والعنوانُ وما رآه الجهاز");
  const list = [
    P("a1", "أموكسي 250 ملغ", 1000, 500, { bulk_group: " g1 " }), P("a2", "أموكسي 500 ملغ", 1000, 500, { bulk_group: "g1" }),
    P("b1", "شامبو قطط", 3000, 1500, { bulk_group: "g2" }), P("b2", "شامبو كلاب", 3500, 1500, { bulk_group: "g2" }),
    P("s1", "يتيم", 900, 400, { bulk_group: "g3" }), P("n1", "بلا مجموعة", 100, 50),
    P("u1", "دولار ١", 0, 0, { bulk_group: "g4", price_currency: "USD", sell_price_usd: 10, purchase_price_usd: 5 }),
    P("u2", "دولار ٢", 0, 0, { bulk_group: "g4", price_currency: "USD", sell_price_usd: 10, purchase_price_usd: null }),
    P("m1", "خليط أ", 1000, 500, { bulk_group: "g5" }), P("m2", "خليط ب", 0, 0, { bulk_group: "g5", price_currency: "USD", sell_price_usd: 1 }),
  ];
  const G = M.buildGroups(list);
  const by = Object.fromEntries(G.map((g) => [g.key, g]));
  check("المجموعةُ عضوان فأكثر — مفتاحٌ على مادّةٍ وحدها ليس ربطاً، والمفتاحُ بلا مسافاتِ طرفيه (كالقاعدة)",
    G.length === 4 && !by.g3 && by.g1?.members.length === 2, G.map((g) => `${g.key}:${g.members.length}`).join(","));
  check("  وحجمُ المجموعة للشارة بالمفتاح نفسِه، والأعضاءُ لمادّةٍ بمجموعةٍ حقيقية وحدها",
    M.groupSizes(list).get("g1") === 2 && M.groupSizes(list).get("g3") === 1 && M.groupMembersOf(list, list[0]).length === 2
    && M.groupMembersOf(list, list[4]).length === 0 && M.groupMembersOf(list, list[5]).length === 0);
  check("السعرُ الواحد يُقرأ، والمختلفُ «مختلف» لا أوّلُ قيمة",
    by.g1.sell === 1000 && by.g1.buy === 500 && !by.g1.sellSplit && by.g2.sellSplit && by.g2.sell === null && !by.g2.buySplit && by.g2.buy === 1500);
  check("  والدولارُ بأعمدته (والشراءُ الغائب «مختلف» عن ٥$)، والمختلطُ «mixed»",
    by.g4.currency === "USD" && by.g4.sell === 10 && by.g4.buySplit && by.g5.currency === "mixed");
  check("العنوانُ: الكلماتُ المشتركة أوّلَ الأسماء، وإلا أوّلُ اسمٍ بالترتيب",
    M.groupTitle(["أموكسي 250 ملغ", "أموكسي 500 ملغ"]) === "أموكسي" && M.groupTitle(["شامبو قطط", "شامبو كلاب"]) === "شامبو"
    && M.groupTitle(["رويال كانين قطط - 2كغ", "رويال كانين قطط - 4كغ"]) === "رويال كانين قطط" && M.groupTitle(["ب", "أ"]) === "أ"
    && M.groupTitle(["إبر", "ابر"]) === "إبر", [M.groupTitle(["رويال كانين قطط - 2كغ", "رويال كانين قطط - 4كغ"]), M.groupTitle(["إبر", "ابر"])].join("|"));
  check("ما رآه الجهاز: كلُّ عضوٍ بسعرَيه بعملته",
    JSON.stringify(M.seenOf([list[0], list[6], list[7]])) === JSON.stringify({ a1: { s: 1000, p: 500 }, u1: { s: 10, p: 5 }, u2: { s: 10, p: null } }));
  check("الخانةُ تقرأ ما كُتب: أرقامٌ شرقية بفاصلها وفاصلتها العربيّتين (١٬٥٠٠ و١٢٫٥)",
    M.priceInput(" ١٬٥٠٠ ") === 1500 && M.priceInput("١٢٫٥") === 12.5, `${M.priceInput(" ١٬٥٠٠ ")}|${M.priceInput("١٢٫٥")}`);
  check("  «1,500» ⇒ ١٥٠٠، و«٢٥٠٠» ⇒ ٢٥٠٠، و«12.345» ⇒ ١٢٫٣٥، والفارغُ null، و«abc» و«-1» NaN",
    M.priceInput("1,500") === 1500 && M.priceInput("٢٥٠٠") === 2500 && M.priceInput("12.345") === 12.35 && M.priceInput("  ") === null
    && Number.isNaN(M.priceInput("abc")) && Number.isNaN(M.priceInput("-1")));
  check("الربطُ: نفسُ العملة ونفسُ المخزن — وإلا السبب",
    M.linkBlock(list[6], [list[0]]) === "currency" && M.linkBlock({ price_currency: "IQD", farm_id: "f" }, [list[0]]) === "farm" && M.linkBlock(list[1], [list[0]]) === null);
  check("السعرُ المقترح أكثرُها تكراراً (والأوّلُ عند التعادل)", M.commonPrice([3, 5, 5, null]) === 5 && M.commonPrice([7, 3]) === 7 && M.commonPrice([null]) === null);
  const asks = M.purchaseGroupAsks([
    { product_id: "a1", sell: 1200, buy: 0 }, { product_id: "a2", sell: 1300, buy: 0 },   // مجموعةٌ واحدة ⇒ سؤالٌ واحد
    { product_id: "b1", sell: 3000, buy: 1500 },                                         // ما تغيّر ⇒ لا سؤال
    { product_id: "n1", sell: 999, buy: 0 }, { product_id: "s1", sell: 999, buy: 0 },   // بلا مجموعة ⇒ لا سؤال
    { product_id: "u1", sell: 0, buy: 6 },                                               // شراءٌ بالدينار لمادّة دولار ⇒ لا يُقارن
    { product_id: null, sell: 50, buy: 50 },
  ], list, "IQD");
  check("سؤالُ الفاتورة: مادّةٌ مربوطة تغيّر سعرُها وحدها، سؤالٌ لكلّ مجموعة، والشراءُ بعملة المادّة وحدها",
    asks.length === 1 && asks[0].productId === "a1" && asks[0].n === 2 && asks[0].sell?.to === 1200 && asks[0].sell?.from === 1000 && !asks[0].buy, JSON.stringify(asks));
  const asksUsd = M.purchaseGroupAsks([{ product_id: "u1", sell: 0, buy: 6 }], list, "USD");
  check("  وفاتورةُ الدولار تسأل عن شراء مادّة الدولار (٥$ ⇒ ٦$)", asksUsd.length === 1 && asksUsd[0].buy?.to === 6 && asksUsd[0].buy?.from === 5 && asksUsd[0].cur === "USD", JSON.stringify(asksUsd));

  /* ══ ٢) المرآةُ التجريبية — أرقامُ قسم 0277 ══ */
  say?.("▸ ٢) المرآةُ التجريبية — أرقامُ قسم 0277 بـrun.sh");
  mem.clear();
  const db = M.loadDB();
  db.products = [
    P("a1", "ربط أ", 1000, 500), P("a2", "ربط ب", 1200, 600), P("a3", "ربط ج", 1500, 700),
    P("a4", "ربط قديم ١", 900, 400, { bulk_group: "blk_old7" }), P("a5", "ربط قديم ٢", 900, 400, { bulk_group: "blk_old7" }),
    P("d1", "ربط دولار ١", 0, 0, { price_currency: "USD", sell_price_usd: 10, purchase_price_usd: 5 }),
    P("d2", "ربط دولار ٢", 0, 0, { price_currency: "USD", sell_price_usd: 12, purchase_price_usd: null }),
  ];
  M.saveDB(db);
  const row = (id) => M.loadDB().products.find((p) => p.id === id);
  const pr = (id) => { const p = row(id); return `${p.sell_price}/${p.purchase_price}`; };
  const pu = (id) => { const p = row(id); return `${p.sell_price_usd ?? "-"}/${p.purchase_price_usd ?? "-"}`; };
  const gk = (id) => row(id).bulk_group ?? null;
  const seen = (...xs) => Object.fromEntries(xs.map(([id, s, p]) => [id, { s, p }]));

  localStorage.setItem("vp_session", JSON.stringify({ raw: { staff: { staffRole: "receptionist" } } }));
  check("الاستقبالُ لا يربط (forbidden)", (await codeOf(M.linkProducts(["a1", "a2"], null, 1100, 550, seen(["a1", 1000, 500], ["a2", 1200, 600])))) === "forbidden");
  localStorage.removeItem("vp_session");
  const r1 = await M.linkProducts(["a1", "a2"], null, 1100, 550, seen(["a1", 1000, 500], ["a2", 1200, 600]));
  check("ربطُ أ وب بمجموعةٍ جديدة بسعر ١١٠٠/٥٥٠ ⇒ عضوان أُضيفا، ولا مجموعةَ انفكّت", `${r1.n}:${r1.added}:${r1.dissolved}` === "2:2:0", JSON.stringify(r1));
  check("  والاثنان بالسعر نفسِه وبمفتاحٍ واحدٍ جديد (grp_…)", pr("a1") === "1100/550" && pr("a2") === "1100/550" && gk("a1") === gk("a2") && /^grp_/.test(gk("a1")));
  const K = gk("a1");
  check("إضافةُ ج بأسعارٍ رآها قبل الربط ⇒ price_moved، وعضوٌ ناقصٌ مما رآه ⇒ group_changed",
    (await codeOf(M.linkProducts(["a3"], K, 1100, 550, seen(["a1", 1000, 500], ["a2", 1100, 550], ["a3", 1500, 700])))) === "price_moved"
    && (await codeOf(M.linkProducts(["a3"], K, 1100, 550, seen(["a1", 1100, 550], ["a3", 1500, 700])))) === "group_changed");
  check("  وما كُتب شيء: ج على سعره وبلا مجموعة", pr("a3") === "1500/700" && gk("a3") === null);
  const r2 = await M.linkProducts(["a3"], K, 1100, 550, seen(["a1", 1100, 550], ["a2", 1100, 550], ["a3", 1500, 700]));
  check("إضافةُ ج بما يراه الآن ⇒ ثلاثة، وواحدٌ أُضيف، وسعرُه سعرُ المجموعة", `${r2.n}:${r2.added}:${r2.dissolved}` === "3:1:0" && pr("a3") === "1100/550");
  const r3 = await M.linkProducts(["a4"], K, 1100, 550, seen(["a1", 1100, 550], ["a2", 1100, 550], ["a3", 1100, 550], ["a4", 900, 400]));
  check("نقلُ «قديم ١» من مجموعةٍ بعضوين ⇒ أربعة، والقديمةُ انفكّت", `${r3.n}:${r3.added}:${r3.dissolved}` === "4:1:1" && gk("a5") === null && pr("a5") === "900/400" && gk("a4") === K);
  check("الرفض بجملته: دولارٌ مع دينار، مادّةٌ غائبة، مادّةٌ وحدها، بلا سعر بيع، سعرٌ سالب، مجموعةٌ غير موجودة",
    (await codeOf(M.linkProducts(["d1"], K, 1100, 550, seen(["a1", 1100, 550], ["a2", 1100, 550], ["a3", 1100, 550], ["a4", 1100, 550], ["d1", 10, 5])))) === "group_mixed"
    && (await codeOf(M.linkProducts(["a5", "zz"], null, 900, 400, seen(["a5", 900, 400])))) === "product_missing"
    && (await codeOf(M.linkProducts(["a5"], null, 900, 400, seen(["a5", 900, 400])))) === "group_needs_two"
    && (await codeOf(M.linkProducts(["a5", "d1"], null, null, 1, seen(["a5", 900, 400])))) === "price_required"
    && (await codeOf(M.linkProducts(["a5"], null, -1, 1, seen(["a5", 900, 400])))) === "bad_price"
    && (await codeOf(M.linkProducts(["a5"], "grp_none", 900, 400, seen(["a5", 900, 400])))) === "group_missing");
  const s1 = await M.setGroupPrice(K, 1300, null, seen(["a1", 1100, 550], ["a2", 1100, 550], ["a3", 1100, 550], ["a4", 1100, 550]));
  check("سعرُ المجموعة: بيعٌ ١٣٠٠ والشراءُ فارغ ⇒ الأربعة تغيّرت والشراءُ كما هو",
    `${s1.n}:${s1.changed}` === "4:4" && ["a1", "a2", "a3", "a4"].every((id) => pr(id) === "1300/550"));
  { const d = M.loadDB(); d.products.find((p) => p.id === "a2").sell_price = 1350; M.saveDB(d); }   // رفعٌ من جهازٍ آخر
  check("  وعضوٌ تغيّر سعرُه بعد الفتح ⇒ price_moved ولا يُكتب شيء، وبلا سعرَين ⇒ nothing_to_set",
    (await codeOf(M.setGroupPrice(K, 1400, 600, seen(["a1", 1300, 550], ["a2", 1300, 550], ["a3", 1300, 550], ["a4", 1300, 550])))) === "price_moved"
    && (await codeOf(M.setGroupPrice(K, null, null, seen(["a1", 1300, 550], ["a2", 1350, 550], ["a3", 1300, 550], ["a4", 1300, 550])))) === "nothing_to_set"
    && pr("a1") === "1300/550" && pr("a2") === "1350/550");
  const u1 = await M.unlinkProducts(K, ["a3"]);
  check("فكُّ ج وحده ⇒ بقي ثلاثة، والمجموعةُ قائمة، وج على سعره", `${u1.unlinked}:${u1.left}:${u1.dissolved}` === "1:3:false" && gk("a3") === null && pr("a3") === "1300/550");
  check("  وفكُّ ما ليس عضواً ⇒ group_changed ولا يُفكّ معه غيرُه", (await codeOf(M.unlinkProducts(K, ["a1", "a3"]))) === "group_changed" && gk("a1") === K);
  const u2 = await M.unlinkProducts(K, ["a1", "a2"]);
  check("فكُّ أ وب ⇒ بقي «قديم ١» وحده فانفكّت كلُّها", `${u2.unlinked}:${u2.left}:${u2.dissolved}` === "2:0:true" && gk("a4") === null);
  const r4 = await M.linkProducts(["d1", "d2"], null, 11.5, 6, seen(["d1", 10, 5], ["d2", 12, null]));
  check("الدولار: ربطُ د١ ود٢ بـ١١٫٥$/٦$ ⇒ أعمدةُ الدولار، والدينارُ ما يُمسّ",
    `${r4.n}:${r4.added}` === "2:2" && pu("d1") === "11.5/6" && pu("d2") === "11.5/6" && pr("d1") === "0/0");
  { const d = M.loadDB(); d.products.find((p) => p.id === "d1").sell_price_usd = 13; M.saveDB(d); }   // فاتورةُ شراءٍ كتبت سعرَ د١
  const f1 = await M.followGroup("d1", true, false);
  check("بعد الشراء: «لكل المجموعة» للبيع وحده ⇒ د٢ يتبع د١ بالبيع والشراءُ كما هو", `${f1.n}:${f1.updated}:${f1.skipped}` === "2:1:0" && pu("d2") === "13/6");
  await M.linkProducts(["a1", "a2"], null, 1250, 800, seen(["a1", 1300, 550], ["a2", 1350, 550]));
  { const d = M.loadDB(); d.products.find((p) => p.id === "a1").purchase_price = 820; M.saveDB(d); }
  const f2 = await M.followGroup("a1", false, true);
  const f3 = await M.followGroup("a5", true, true);
  check("  وبالدينار للشراء وحده ⇒ ب يتبع أ بالشراء والبيعُ كما هو، والمادّةُ بلا مجموعة ⇒ صفر",
    f2.updated === 1 && pr("a2") === "1250/820" && f3.n === 0 && f3.group === null);
  localStorage.setItem("vp_session", JSON.stringify({ raw: { staff: { staffRole: "receptionist" } } }));
  check("  والاستقبالُ لا يغيّر سعرَ المجموعة ولا يتبعها ولا يفكّ (forbidden)",
    (await codeOf(M.setGroupPrice(gk("a1"), 1, null, seen(["a1", 1250, 820], ["a2", 1250, 820])))) === "forbidden"
    && (await codeOf(M.followGroup("a1", true, false))) === "forbidden" && (await codeOf(M.unlinkProducts(gk("a1"), ["a1"]))) === "forbidden");
  localStorage.removeItem("vp_session");
  // مجموعةٌ قديمةٌ مختلطة (قبل 0277 لا حارس): النسخُ بعملة المادّة وحدها، والأخرى تُعدّ ولا تُمسّ.
  { const d = M.loadDB(); for (const id of ["a3", "d2"]) d.products.find((p) => p.id === id).bulk_group = "mix7"; M.saveDB(d); }
  { const d = M.loadDB(); d.products.find((p) => p.id === "a3").sell_price = 1999; M.saveDB(d); }
  const f4 = await M.followGroup("a3", true, true);
  check("مجموعةٌ مختلطة (أقدم من الحارس): النسخُ بعملة المادّة وحدها — الدولارُ يُعدّ «متروكاً» ولا يُمسّ",
    `${f4.n}:${f4.updated}:${f4.skipped}` === "2:0:1" && pu("d2") === "13/6" && pr("d2") === "0/0", `${JSON.stringify(f4)} ${pu("d2")} ${pr("d2")}`);
  check("رفضُ «ما رآه الجهاز» يُعرف فتُجلب القائمة، وغيرُه لا",
    M.isGroupStale(new Error("price_moved")) && M.isGroupStale(new Error("group_changed")) && !M.isGroupStale(new Error("bad_price")));
  return fails;
}

const say = (line, bad) => (bad ? console.error : console.log)(line);
const M = await load();
const fails = await run(M, say);

/* ══ ٣) الطفرات ══ */
console.log("▸ ٣) الطفرات — كلُّ قاعدةٍ مكسورة يمسكها فحص");
const PG = "src/lib/productGroups.ts", DM = "src/lib/demoProductGroups.ts";
const MUTANTS = [
  ["المجموعةُ بعضوٍ واحد تُعدّ ربطاً", PG, "    if (ms.length < 2) continue;\n    const members", "    const members"],
  ["أعضاءُ مادّةٍ بمجموعةٍ من عضوٍ واحد", PG, "return ms.length >= 2 ? ms : [];", "return ms;"],
  ["الدولارُ يُقرأ من أعمدة الدينار", PG, 'return currencyOf(p) === "USD" ? { sell', 'return false ? { sell'],
  ["سؤالُ الفاتورة يقارن الشراءَ بأيّ عملة", PG, "pc === invoiceCur && l.buy > 0", "l.buy > 0"],
  ["سؤالٌ لكلّ سطرٍ لا لكلّ مجموعة", PG, "if (!g || done.has(g)) continue;", "if (!g) continue;"],
  ["ما رآه الجهاز بلا أعضائه (عضوٌ ناقص يمرّ)", DM, "if (a !== b) throw", "if (false) throw"],
  ["ما رآه الجهاز بلا أسعاره", DM, "num(s.s) !== x.sell || num(s.p) !== x.buy", "false"],
  ["الربطُ لا يحلّ المجموعةَ القديمة ذات العضو الواحد", DM, "if (left.length === 1) { left[0].bulk_group = null; dissolved++; }", ""],
  ["الفكُّ لا يحلّ مجموعةَ العضو الواحد", DM, "if (left.length === 1) { left[0].bulk_group = null; left = []; dissolved = true; }", ""],
  ["النسخُ بعد الشراء يعبر العملة", DM, "if (m.id === v.id || currencyOf(m) !== currencyOf(v)) continue;", "if (m.id === v.id) continue;"],
  ["البوّابةُ تمرّر الاستقبال", DM, 'if (r !== "manager" && r !== "veterinarian" && !demoPinLive())', "if (false)"],
  ["الدولارُ والدينارُ بمجموعةٍ واحدة", DM, 'if (new Set(all.map(currencyOf)).size > 1) throw demoHint("group_mixed"', 'if (false) throw demoHint("group_mixed"'],
];
let mutFails = 0;
for (const [name, file, from, to] of MUTANTS) {
  let caught, mod;
  try { mod = await load([file, from, to]); } catch (e) { caught = `بناء: ${e.message}`; }
  // سيناريو يرمي تحت الطفرة سقط بها — مُسكت (رميةٌ غيرُ متوقَّعة فحصٌ ساقط).
  if (mod) { try { caught = await run(mod, null); } catch (e) { caught = 1; void e; } }
  if (typeof caught === "string") { mutFails++; console.error(`   ✗ الطفرة «${name}» — ${caught}`); }
  else if (caught > 0) console.log(`   ✓ الطفرة «${name}» تُمسك (${caught} فحص)`);
  else { mutFails++; console.error(`   ✗ الطفرة «${name}» تمرّ — الفحصُ أعمى عنها`); }
}

const total = fails + mutFails;
console.log(total ? `✗ product-groups-test: ${total} فشل` : `✓ product-groups-test: السلوكُ و${MUTANTS.length} طفرة`);
process.exit(total ? 1 : 0);
