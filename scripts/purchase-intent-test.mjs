/* ============================================================================
 * نيّةُ سطر الشراء — سعرُ البيع لا ينكتب إلا إذا كتبَه المستخدم.
 *
 * ── الجذرُ المقيس ───────────────────────────────────────────────────────
 * `record_purchase` تكتب: `sell_price = case when v_sell > 0 then v_sell else
 * sell_price end` — أي أن **الخادمَ فيه بوّابةٌ أصلاً** والصفرُ يعني «لا تلمس».
 * والواجهةُ وحدَها كانت تهزمها: `lineFromProduct` تعبّئ الخانةَ بسعر المنتج،
 * فكلُّ سطرٍ يرجّع القيمةَ نفسَها ⇒ أيُّ تغييرٍ صار بعد تحميل الشاشة يُدهس،
 * ووضعُ التعديل يرجّع سعرَ فاتورةٍ عمرُها شهر على الرفّ اليوم.
 *
 * ولهذا كان الرقمُ الأوّل الذي قِسته (٨٧٣ من ٨٧٧ سطراً «تدهس السعر») **مُضلِّلاً**:
 * أغلبُها يكتب القيمةَ نفسَها فلا يتغيّر شيء. الواقعُ المقيس من `audit_log`:
 * ٤٢ تغييرَ سعرِ بيعٍ بستّين يوماً، واحدٌ منها أثناء فاتورة شراء. **العيبُ
 * حقيقيّ والصمتُ حقيقيّ، والحجمُ لم يكن حقيقياً** — وهذا مسجَّلٌ هنا كي لا
 * يُعاد الاستشهادُ بالرقم الأوّل.
 *
 * ── والحارسُ المقرونُ به إلزاماً ────────────────────────────────────────
 * فرعُ **إنشاء** منتجٍ جديد يمرّر السعرَ خامّاً بلا بوّابة — فتفريغُ الخانة بلا
 * حارسٍ يخلق منتجاً بسعر صفرٍ يُباع ببلاش. ولهذا يُفحصان معاً.
 *
 *   node scripts/purchase-intent-test.mjs
 * ==========================================================================*/
import { readFileSync } from "node:fs";
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const built = await esbuild.build({
  entryPoints: ["src/lib/purchaseIntent.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub", setup(b) {
      b.onResolve({ filter: /^i18next$|^@\/i18n/ }, () => ({ path: "stub", namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default { language: 'ar', t: (k, d) => d ?? k };", loader: "js" }));
    },
  }],
});
const { sellPriceToSend, purchaseBlockers, willCreateProduct } =
  await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

const L = (p = {}) => ({ product_id: null, barcode: "", name: "", qty: "1", purchase_price: "800", sell_price: "", ...p });

console.log("▸ سعرُ البيع: الفارغُ صفرٌ، والصفرُ «لا تلمس»");
check("الفارغُ يُرسَل صفراً", sellPriceToSend("") === 0);
check("  والمسافةُ كذلك", sellPriceToSend("   ") === 0);
check("  وغيرُ الرقم كذلك", sellPriceToSend("abc") === 0);
check("  والسالبُ كذلك (لا يُرسَل سالبٌ للخادم)", sellPriceToSend("-5") === 0);
check("والرقمُ المكتوبُ يُرسَل كما هو", sellPriceToSend("1400") === 1400);

console.log("\n▸ مَن «الجديد» — مرآةُ فرعَي المطابقة بالخادم");
const known = [{ id: "p1", name: "سيفوتاكس ١ غم" }, { id: "p2", name: "رمل جاك" }];
check("سطرٌ بمعرّفٍ ليس جديداً", willCreateProduct(L({ product_id: "p1", name: "أيّ اسم" }), known) === false);
check("وسطرٌ بلا معرّفٍ واسمُه اسمُ منتجٍ قائمٍ ليس جديداً (الخادمُ يطابقه بالاسم)",
  willCreateProduct(L({ name: "سيفوتاكس ١ غم" }), known) === false);
check("  ويطابقه ولو اختلف الإملاء (ة/ه · أ/ا · أرقامٌ عربية)",
  willCreateProduct(L({ name: "رمل جاك" }), [{ id: "x", name: "رمل  جاك" }]) === false);
check("وسطرٌ باسمٍ ما عليه أحدٌ **جديد**", willCreateProduct(L({ name: "مادة ما موجودة" }), known) === true);
check("  و«item» لا تُطابِق (الخادمُ يستثنيها نصّاً)",
  willCreateProduct(L({ name: "item" }), [{ id: "x", name: "item" }]) === true);
check("  وحرفٌ واحدٌ لا يُطابِق (الخادمُ يشترط طولاً ≥ ٢)",
  willCreateProduct(L({ name: "س" }), [{ id: "x", name: "س" }]) === true);

console.log("\n▸ الحارس: جديدٌ بسعر صفرٍ أو اسمُه رقمٌ يمنع الحفظ");
const zero = purchaseBlockers([L({ name: "مادة جديدة", sell_price: "" })], known);
check("مادةٌ جديدةٌ بسعرٍ فارغ تُوقف الحفظ", zero.length === 1 && zero[0].kind === "zero_sell", JSON.stringify(zero));
check("  والاسمُ يظهر بالرسالة", zero[0]?.label === "مادة جديدة", zero[0]?.label);
check("وبلا اسمٍ يظهر الباركود",
  purchaseBlockers([L({ barcode: "6221054", sell_price: "" })], known)[0]?.label === "6221054");
check("**والقائمُ بسعرٍ فارغ لا يُوقَف** (الفارغُ عنده يعني «لا تلمس»)",
  purchaseBlockers([L({ product_id: "p1", sell_price: "" })], known).length === 0);
check("  ولا يُوقَف ما يطابقه الخادمُ بالاسم — إنذارٌ كاذبٌ يُتعلَّم تجاهلُه",
  purchaseBlockers([L({ name: "سيفوتاكس ١ غم", sell_price: "" })], known).length === 0);
check("واسمٌ كلُّه أرقامٍ يُوقف الحفظ",
  purchaseBlockers([L({ name: "6221054", sell_price: "1500" })], known)[0]?.kind === "numeric_name");
check("  وبأرقامٍ عربيةٍ كذلك (التطبيعُ يترجمها)",
  purchaseBlockers([L({ name: "٦٢٢١٠٥٤", sell_price: "1500" })], known)[0]?.kind === "numeric_name");
check("واسمٌ فيه أرقامٌ وحروفٌ يمرّ", purchaseBlockers([L({ name: "رمل ٢٠ لتر", sell_price: "1500" })], known).length === 0);
check("وسطرٌ بلا كميةٍ لا يُوقف (له حارسُه)",
  purchaseBlockers([L({ name: "مادة جديدة", qty: "0", sell_price: "" })], known).length === 0);

console.log("\n▸ المسح: الشاشةُ ما تعبّئ سعرَ البيع مسبقاً");
const src = readFileSync("src/components/inventory/Purchases.tsx", "utf8");
const fill = /const lineFromProduct[\s\S]*?\}\);/.exec(src)?.[0] ?? "";
check("`lineFromProduct` تترك سعرَ البيع فارغاً", /sell_price:\s*""/.test(fill), fill.slice(-160));
check("  وتُبقي سعرَ الشراء معبّأً (منه الإجماليُّ ودفترُ المورّد)",
  /purchase_price:\s*String\(p\.purchase_price/.test(fill));
check("ووضعُ التعديل يتركه فارغاً كذلك (لقطةُ الفاتورة لا تدهس سعرَ اليوم)",
  !/sell_price:\s*it\.sell_price/.test(src));
check("والحفظُ يمرّ من البوّابة لا من Number() مباشرةً",
  /sell_price:\s*sellPriceToSend\(/.test(src) && !/sell_price:\s*Number\(l\.sell_price\)/.test(src));

console.log(`\n${fails ? "✗" : "✓"} purchase-intent-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
