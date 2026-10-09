/* ============================================================================
 * فحصُ كتابات لوحة المتجر (src/lib/storePrice.ts) — سلوكاً لا نصّاً.
 *
 * الحالاتُ التي كانت تكذب أو تؤذي:
 *   • سعرٌ حُفظ تحت الكلفة بلا علامة، وسعرٌ صُحّح يبقى أحمرَ ومعدوداً ⇒ العلامةُ من الصفّ الراجع
 *     بمرآة photo_products حرفاً؛
 *   • باركودٌ مسحه الماسحُ بحقل السعر المفتوح ثمّ Enter صار سعرَ الكاشير ⇒ يُسأل عنه؛
 *   • price_moved كان يُرفض بلا إعادة قراءة، فكلُّ إعادةٍ تفشل بنفس الطريقة ⇒ يُعرف ويُعاد؛
 *   • إذنٌ سُحب والشاشةُ مفتوحة ⇒ رفضُ not_authorized يُعرف فتُجدَّد خبيئةُ الإذن.
 *
 *   node scripts/store-price-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const built = await esbuild.build({
  stdin: { contents: 'export * from "./src/lib/storePrice";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent",
  alias: { "@": "./src" },
});
const M = await import(`data:text/javascript;base64,${Buffer.from(built.outputFiles[0].text).toString("base64")}`);

console.log("▸ «تحت الكلفة» — مرآةُ photo_products (كلفةٌ موجبة، سعرٌ موجب، والسعرُ أقلّ)");
{
  check("١٥٠٠ والكلفةُ ١٢٠٠٠ ⇒ تحت الكلفة (صفرٌ ناقص)", M.belowCost(12000, 1500) === true);
  check("١٥٠٠٠ والكلفةُ ١٢٠٠٠ ⇒ لا", M.belowCost(12000, 15000) === false);
  check("السعرُ = الكلفة ⇒ لا (أقلّ تماماً كالخادم)", M.belowCost(12000, 12000) === false);
  check("بلا كلفة (صفر/فارغ) ⇒ لا", M.belowCost(0, 500) === false && M.belowCost(null, 500) === false);
  check("بلا سعر ⇒ لا", M.belowCost(12000, 0) === false && M.belowCost(12000, null) === false);
  check("أرقامٌ نصّية (numeric من PostgREST) تُقرأ", M.belowCost("12000.00", "1500") === true);
  // ومطابقةُ الخادم حرفاً: الشرطُ نفسُه بآخر تعريفٍ لـphoto_products.
  const m29 = readFileSync("supabase/migrations/0229_store_sections.sql", "utf8");
  check("  والخادمُ بنفس الشرط (coalesce(purchase)>0 و coalesce(sell)>0 و sell<purchase)",
    /'below_cost', case when v_cost then \(coalesce\(p\.purchase_price, 0\) > 0 and coalesce\(p\.sell_price, 0\) > 0\s*and p\.sell_price < p\.purchase_price\) end/.test(m29));
}

console.log("▸ الرقعةُ بعد الحفظ — السعرُ كما رجع، والعلامةُ منه (الاتجاهان)");
{
  check("حفظُ سعرٍ تحت الكلفة يرفع العلامة", eq(M.pricePatchFrom({ sell_price: 1500, purchase_price: 12000 }, 1500), { sell_price: 1500, below_cost: true }));
  check("تصحيحُه فوق الكلفة يُنزلها (كان يبقى أحمرَ ومعدوداً)", eq(M.pricePatchFrom({ sell_price: 15000, purchase_price: 12000 }, 15000), { sell_price: 15000, below_cost: false }));
  check("السعرُ من الصفّ الراجع لا من المطلوب", M.pricePatchFrom({ sell_price: "15000.00", purchase_price: 1 }, 15000).sell_price === 15000);
  check("بلا صفٍّ راجع ⇒ السعرُ وحده والعلامةُ لا تُخمَّن", eq(M.pricePatchFrom(undefined, 900), { sell_price: 900 }));
}

console.log("▸ السعرُ المشبوه — رمزٌ ممسوح أو قفزةٌ فوق عشرة أضعاف تُسأل قبل الحفظ");
{
  check("صفر + EAN-8 (62,912,345) ⇒ «رمز»", M.priceDoubt("062912345", 62912345, 0) === "code");
  check("بلا سعر + EAN-13 ⇒ «رمز»", M.priceDoubt("6291234567890", 6291234567890, null) === "code");
  check("سعرٌ + رمزٌ ملصوقٌ به ⇒ «رمز»", M.priceDoubt("150006291234567", 150006291234567, 15000) === "code");
  check("ثمانُ خاناتٍ صحيحة ⇒ «رمز» (أقصرُ باركود)", M.priceDoubt("12345678", 12345678, 0) === "code");
  check("سبعُ خاناتٍ بلا سعرٍ سابق ⇒ لا سؤال (سعرٌ معقول)", M.priceDoubt("1250000", 1250000, 0) === null);
  check("الكسورُ لا تُعدّ خاناتٍ صحيحة", M.priceDoubt("1250000.50", 1250000.5, 1000000) === null);
  check("صفرٌ زائد: ١٥٠٠٠ ← ١٥٠٠٠٠ (١٠ أضعاف بالضبط) ⇒ لا سؤال", M.priceDoubt("150000", 150000, 15000) === null);
  check("فوق عشرة أضعاف ⇒ «قفزة»", M.priceDoubt("1500000", 1500000, 15000) === "jump");
  check("رفعٌ عاديّ ⇒ لا سؤال", M.priceDoubt("17500", 17500, 15000) === null);
  check("تنزيلٌ ⇒ لا سؤال (العلامةُ تمسك ما تحت الكلفة)", M.priceDoubt("1500", 1500, 15000) === null);
  check("الثابتان كما يُقالان بالشاشة (١٠ أضعاف، ٨ خانات)", M.JUMP_FACTOR === 10 && M.CODE_DIGITS === 8);
}

console.log("▸ معنى الرفض — صفٌّ قديم (يُعاد) أم إذنٌ سُحب (يُجدَّد)");
{
  const pg = (message, code = "P0001") => Object.assign(new Error(message), { code });
  check("price_moved من store_set_price (P0001) ⇒ قديم", M.staleWrite(pg("price_moved")) === "price_moved");
  check("price_moved من updateProduct (الرمزُ على الكائن) ⇒ قديم", M.staleWrite(Object.assign(new Error("price_moved"), { code: "price_moved" })) === "price_moved");
  check("product_not_found ⇒ غائب", M.staleWrite(pg("product_not_found")) === "gone");
  check("no_row_updated ⇒ غائب", M.staleWrite(Object.assign(new Error("no_row_updated"), { code: "no_row_updated" })) === "gone");
  check("خطأُ شبكة ⇒ ليس قديماً (لا إعادةَ تُخفي العطل)", M.staleWrite(new TypeError("Failed to fetch")) === null);
  check("not_authorized (P0001 منذ 0229) ⇒ إذنٌ سُحب", M.refusedByRole(pg("not_authorized")));
  check("not_authorized (42501 بالتعريفات الأقدم) ⇒ إذنٌ سُحب", M.refusedByRole(pg("not_authorized", "42501")));
  check("رفضُ RLS العامّ ليس «إذناً سُحب» بالخبيئة", !M.refusedByRole(pg("new row violates row-level security policy", "42501")));
  check("لا شيء ⇒ لا شيء", M.staleWrite(null) === null && !M.refusedByRole(undefined));
}

console.log("▸ خبيئةُ الإذن تُجدَّد بعد رفض الخادم — لا تبقى أزرارٌ لإذنٍ سُحب (staff.ts، النسخة التجريبية)");
{
  const stubs = {
    "./supabase": "export const supabase = null;",
    "./clinics": 'export const getActiveClinicId = () => "c1";',
    "./clinic": "export const DOCTORS = [];",
    "./utils": "let n = 0; export const uuid = () => `u${++n}`;",
    "@/types": "export {};",
  };
  const staffBuilt = await esbuild.build({
    entryPoints: ["src/lib/staff.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    plugins: [{ name: "stubs", setup(b) {
      b.onResolve({ filter: /^(\.\/supabase|\.\/clinics|\.\/clinic|\.\/utils|@\/types)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
    } }],
  });
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); }, key: (i) => [...store.keys()][i] ?? null, get length() { return store.size; },
  };
  const S = await import(`data:text/javascript;base64,${Buffer.from(staffBuilt.outputFiles[0].text).toString("base64")}`);
  const roster = (on) => store.set("vp_staff_c1", JSON.stringify([{ id: "s1", name: "م", email: "Photo@X.iq", role: "photographer", permissions: { manageStore: on } }]));
  roster(true);
  check("أوّلُ جلب: إذنُ المتجر مفتوح", (await S.hydrateMyPermissions("photo@x.iq")).manageStore === true);
  roster(false);   // المديرُ أطفأه والشاشةُ مفتوحة
  check("  والخبيئةُ وحدها تبقى على القديم (هذا العطل)", (await S.hydrateMyPermissions("photo@x.iq")).manageStore === true);
  let told = 0;
  const off = S.subscribeMyPermissions(() => { told++; });
  const fresh = await S.refreshMyPermissions("photo@x.iq");
  check("refreshMyPermissions تمسحها وتجلب الجديد", fresh.manageStore === false && S.peekMyPermissions("photo@x.iq")?.manageStore === false);
  check("  وتُبلغ المشتركين مرّةً (usePermissions يعيد الرسم)", told === 1);
  off();
  await S.refreshMyPermissions("photo@x.iq");
  check("  والإلغاءُ يوقف التبليغ", told === 1);
}

console.log(`\n${fails ? "✗" : "✓"} store-price-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
