/* ============================================================================
 * فحص دفتر حاملِ التوصيل — حارسُ رقمِ المحاسبة.
 *
 * الشركةُ تُحصَّل بعد شهور، والرقمُ الذي يُقرأ يومَها لا يُراجَع من الذاكرة.
 * فمعادلةُ «المطلوب الآن» بالواجهة يجب أن تساوي معادلةَ `courier_settle` (0148)
 * حرفاً بحرف — وإلا وقف المندوبُ أمام رقمين. هذا الفحص يثبّت المعادلة:
 *
 *     مسلَّم  و  غير مختومٍ بـcollected_at  و  فاتورتُه ليست مردودة  و  المتبقّي > 0.009
 *
 * لو رجع أحدٌ فأسقط شرطَ المردودة أو عدَّ ذمّةَ الصفر، ينكسر البناء هنا.
 *
 *   node scripts/courier-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {};", loader: "js" }));
  },
};

const built = await esbuild.build({
  entryPoints: ["src/lib/courierLedger.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs],
});
const { companyOwed, courierTotals, itemsFromInvoices, isOwed, orderRows } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

/* فاتورةٌ ودفعاتُها — نفسُ شكل `dueOf`: المتبقّي = total − ما دُفع. */
const INV = (id, total, paid = 0, status = "paid") => ({
  id, total, status, amount_paid: paid, created_at: "2026-01-01T00:00:00Z",
});
const ORD = (id, invoice_id, patch = {}) => ({
  id, invoice_id, cod_amount: 0, prepaid: 0, status: "delivered",
  collected_at: null, delivered_at: "2026-06-01T10:00:00Z", created_at: "2026-06-01T09:00:00Z",
  ...patch,
});

const invs = [
  INV("i1", 10000, 0),                       // بالذمّة كاملاً
  INV("i2", 5000, 5000),                     // مدفوعٌ بالكامل ⇒ ذمّةُ صفر
  INV("i3", 8000, 0, "refunded"),            // مردودة ⇒ لا تُحصَّل
  INV("i4", 7000, 2000),                     // محصَّلٌ لاحقاً
];
const byId = (id) => invs.find((i) => i.id === id);

const orders = [
  ORD("o1", "i1"),                                                  // بالذمّة 10000
  ORD("o2", "i2"),                                                  // ذمّةُ صفر — لا يُعدّ
  ORD("o3", "i3"),                                                  // مردودة — لا تُعدّ
  ORD("o4", "i4", { collected_at: "2026-07-01T12:00:00Z" }),        // انحصّل 5000
  ORD("o5", "i1", { status: "returned", returned_at: "2026-06-02T10:00:00Z" }), // راجع
  ORD("o6", "i1", { status: "out" }),                               // بالطريق — ليس مسلَّماً
];

console.log("▸ isOwed — شرطُ courier_settle حرفياً");
check("مسلَّمٌ غيرُ مختومٍ بذمّةٍ موجبة ⇒ مطلوب", isOwed(orders[0], byId("i1")) === true);
check("وذمّةُ الصفر ليست مطلوبة", isOwed(orders[1], byId("i2")) === false);
check("والفاتورةُ المردودة ليست مطلوبة (القاعدةُ ترفض تحصيلَها)", isOwed(orders[2], byId("i3")) === false);
check("والمختومُ بـcollected_at ليس مطلوباً", isOwed(orders[3], byId("i4")) === false);
check("والراجعُ ليس مطلوباً", isOwed(orders[4], byId("i1")) === false);
check("وما لم يُسلَّم بعد ليس مطلوباً", isOwed(orders[5], byId("i1")) === false);

console.log("▸ companyOwed — مصدرٌ واحدٌ للرقم");
const owed = companyOwed(orders, byId);
check("المطلوب = 10000 (طلبٌ واحدٌ فقط يستحقّ)", owed.owed === 10000, `طلع ${owed.owed}`);
check("وعددُ الطلبات بالذمّة = 1", owed.openOrders === 1, `طلع ${owed.openOrders}`);
check("وقائمةٌ فارغة ترجع صفراً لا NaN", companyOwed([], byId).owed === 0);

console.log("▸ السقوطُ إلى cod_amount حين تغيب الفاتورة");
// طلبٌ قديمٌ فاتورتُه خارج ما جُلب: رقمٌ تقريبيٌّ صريح خيرٌ من اختفائه من الكشف.
const orphan = ORD("o7", "gone", { cod_amount: 3300 });
check("فاتورةٌ غائبة ⇒ يُستعمل cod_amount", companyOwed([orphan], () => undefined).owed === 3300);
check("ويُعدّ ضمن الطلبات المطلوبة", companyOwed([orphan], () => undefined).openOrders === 1);

console.log("▸ courierTotals — مجاميعُ يوم المحاسبة");
const tot = courierTotals(orders, byId);
check("التوصيلات المسلَّمة = 4", tot.deliveries === 4, `طلع ${tot.deliveries}`);
check("والراجع = 1", tot.returned === 1, `طلع ${tot.returned}`);
check("والمطلوبُ الآن يطابق companyOwed", tot.owedNow === owed.owed);
check("والمحصَّلُ سابقاً = 5000", tot.collected === 5000, `طلع ${tot.collected}`);
check("ولا رقمَ NaN بأيِّ مجموع", Object.values(tot).every((v) => Number.isFinite(v)));

console.log("▸ itemsFromInvoices — لقطةُ الاسم والسعر لا حالتُهما اليوم");
const IT = (invoice_id, name, barcode, qty, line_total, product_id = "p") =>
  ({ invoice_id, name, barcode, qty, line_total, product_id });
const items = {
  i1: [IT("i1", "دراي فود", "6970967772736", 2, 20000), IT("i1", "أجرة توصيل", null, 1, 5000, null)],
  i4: [IT("i4", "دراي فود", "6970967772736", 1, 10000), IT("i4", "سناك", "888", 3, 9000)],
};
const rows = itemsFromInvoices(["i1", "i4"], (id) => items[id] ?? []);
const dry = rows.find((r) => r.barcode === "6970967772736");
check("الصنفُ الواحد صفٌّ واحد عبر الطلبات", !!dry && dry.qty === 3, `qty=${dry && dry.qty}`);
check("ومبلغُه مجموعُ سطوره", !!dry && dry.amount === 30000, `amount=${dry && dry.amount}`);
check("و«بكم طلب» تعدّ الفواتير لا السطور", !!dry && dry.orders === 2, `orders=${dry && dry.orders}`);
check("والخدمةُ (بلا product_id) تُعلَّم منفصلة", rows.some((r) => r.isService && r.name === "أجرة توصيل"));
check("والخدماتُ بذيل الجدول لا وسطَ البضاعة", rows[rows.length - 1].isService === true);
check("وفاتورةٌ بلا سطور لا ترمي", itemsFromInvoices(["zz"], () => []).length === 0);

console.log("▸ الإرجاعُ الجزئيّ يُطرح — الكشفُ صافٍ");
const withReturn = itemsFromInvoices(["x"], () => [
  IT("x", "سناك", "888", 5, 15000), IT("x", "سناك", "888", -2, -6000),
]);
check("الكميةُ الصافية = 3", withReturn[0].qty === 3, `طلع ${withReturn[0].qty}`);
check("والمبلغُ الصافي = 9000", withReturn[0].amount === 9000, `طلع ${withReturn[0].amount}`);

console.log("▸ orderRows — الأحدثُ أولاً وحالةٌ صحيحة لكلِّ صفّ");
const rr = orderRows(orders, byId);
check("كلُّ الطلبات تظهر (لا تُقصّ)", rr.length === orders.length, `طلع ${rr.length}`);
check("والمحصَّلُ حالتُه collected", rr.find((r) => r.order.id === "o4").state === "collected");
check("والراجعُ حالتُه returned", rr.find((r) => r.order.id === "o5").state === "returned");
check("وغيرُ المختومِ حالتُه owed", rr.find((r) => r.order.id === "o1").state === "owed");

console.log(`\n${fails ? "✗" : "✓"} courier-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
