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
const { companyOwed, companyOnRoad, carrierScope, splitByCarrier, courierTotals, itemsFromInvoices, isOwed, orderRows } = await import(
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
  // محصَّلٌ لاحقاً — ومدفوعٌ **بالكامل**: `courier_settle` (0148) لا تختم
  // `collected_at` إلا حين تُسدَّد الفاتورةُ كلُّها، فحالةُ «مختومٌ ومتبقّيه ٥٠٠٠»
  // لا تصنعها القاعدةُ أبداً. الخطأُ الذي أخفاه هذا القالبُ سنةً: المجاميعُ
  // كانت تُحسب من المتبقّي، فكلُّ ما حُصِّل يظهر صفراً.
  INV("i4", 7000, 7000),
];
const byId = (id) => invs.find((i) => i.id === id);

const orders = [
  ORD("o1", "i1"),                                                  // بالذمّة 10000
  ORD("o2", "i2"),                                                  // ذمّةُ صفر — لا يُعدّ
  ORD("o3", "i3"),                                                  // مردودة — لا تُعدّ
  ORD("o4", "i4", { collected_at: "2026-07-01T12:00:00Z" }),        // انحصّل 7000
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

/* ── القسمةُ على قسمَي اللوحة: الحاملُ يقرّر لا الحالة ─────────────────────
 * الشكوى: «نبيع بالشركة فما يصعد شيء للشركة ويصعد للسواق». السببُ أن اللوحة
 * كانت تقسم بالحالة، فكلُّ ما لم يُسلَّم بعدُ يقع بقسم السواق مهما كان حاملُه.
 * هنا نثبّت أن القسمة بالحامل، وأنها **تامّة**: لا طلبَ بقسمين ولا طلبَ يسقط. */
console.log("▸ splitByCarrier — القسمةُ بالحامل، وتامّة");
const DRV = { id: "c-drv", name: "سائق", kind: "driver" };
const CMP = { id: "c-cmp", name: "شركة", kind: "company" };
const LEGACY = { id: "c-old", name: "قديم" };           // قبل 0148: بلا kind
const carriers = [DRV, CMP, LEGACY];
const carrierOf = (id) => carriers.find((c) => c.id === id) ?? null;
const board = [
  ORD("b1", "i1", { courier_id: CMP.id, status: "out" }),         // ← الطلبُ الضائع
  ORD("b2", "i1", { courier_id: CMP.id, status: "delivered" }),
  ORD("b3", "i1", { courier_id: CMP.id, status: "returned" }),
  ORD("b4", "i1", { courier_id: DRV.id, status: "out" }),
  ORD("b5", "i1", { courier_id: LEGACY.id, status: "out" }),
  ORD("b6", "i1", { courier_id: null, status: "preparing" }),
];
const split = splitByCarrier(board, carrierOf);
const ids = (a) => a.map((o) => o.id).join(",");
check("طلبُ شركةٍ **بالطريق** يقع بقسم الشركات (جذرُ الشكوى)",
  split.companies.some((o) => o.id === "b1"), `الشركات=${ids(split.companies)}`);
check("والمسلَّمُ والراجعُ معه — تاريخُ الشركة بقسمها",
  ["b2", "b3"].every((id) => split.companies.some((o) => o.id === id)), `الشركات=${ids(split.companies)}`);
check("ولا يظهر أيُّ طلبِ شركةٍ بقسم السواق",
  !split.drivers.some((o) => o.courier_id === CMP.id), `السواق=${ids(split.drivers)}`);
check("وطلبُ السائق بقسم السواق", split.drivers.some((o) => o.id === "b4"));
check("وحاملٌ قديمٌ بلا kind يُعدّ سائقاً (لا شركةً بالتخمين)", split.drivers.some((o) => o.id === "b5"));
check("وطلبٌ بلا حاملٍ بعد يبقى مع السواق حيث يُسنَد", split.drivers.some((o) => o.id === "b6"));
check("والقسمةُ تامّة: المجموعُ يساوي الأصل",
  split.drivers.length + split.companies.length === board.length,
  `${split.drivers.length}+${split.companies.length} ≠ ${board.length}`);
check("ولا طلبَ بقسمين", !split.drivers.some((d) => split.companies.some((c) => c.id === d.id)));
check("وحاملٌ مجهول (حُذف) لا يرمي", splitByCarrier([ORD("b7", "i1", { courier_id: "gone" })], () => null).drivers.length === 1);
check("carrierScope: بلا حامل ⇒ سواق", carrierScope(null) === "drivers");
check("carrierScope: شركة ⇒ شركات", carrierScope(CMP) === "companies");

/* ورقمُ «بالطريق» رقمٌ ثانٍ بمعنىً ثانٍ — لا يُجمع مع الذمّة أبداً، وإلا
 * عرضت الشاشةُ أكثرَ مما تقبله `courier_settle` يومَ التحصيل. */
console.log("▸ companyOnRoad — بضاعةٌ خرجت، وليست ذمّةً بعد");
const roadOrders = [
  ORD("r1", "i1", { status: "out" }),                    // متبقّي 10000
  ORD("r2", "i2", { status: "out" }),                    // مدفوعةٌ كاملاً ⇒ صفر
  ORD("r3", "i1", { status: "delivered" }),              // ذمّةٌ لا طريق
  ORD("r4", "i1", { status: "out", cod_amount: 2500, invoice_id: "gone" }),
];
const road = companyOnRoad(roadOrders, byId);
check("يعدّ الخارجَ وحده (out)", road.orders === 3, `طلع ${road.orders}`);
check("ومبلغُه 12500 (10000 + 0 + لقطةُ 2500)", road.amount === 12500, `طلع ${road.amount}`);
check("والمسلَّمُ ليس «بالطريق» — لا ازدواجَ مع الذمّة",
  companyOwed([roadOrders[2]], byId).owed === 10000 && companyOnRoad([roadOrders[2]], byId).amount === 0);
check("وقائمةٌ فارغة ترجع صفراً لا NaN", companyOnRoad([], byId).amount === 0);

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
/* المحصَّلُ يُحسب من **المدفوع** لا من المتبقّي: الطلبُ المختومُ متبقّيه صفرٌ
 * دائماً، فالحسابُ من المتبقّي كان يقول «انحصّل صفر» مهما حُصِّل. */
check("والمحصَّلُ سابقاً = 7000 (المدفوعُ لا المتبقّي)", tot.collected === 7000, `طلع ${tot.collected}`);
/* وقيمةُ البضاعة من الفاتورة كاملةً: ١٠٠٠٠ + ٥٠٠٠ + ٨٠٠٠ + ٧٠٠٠ = ٣٠٠٠٠.
 * بالحساب القديم (المتبقّي + المقدَّم) كان المحصَّلُ والمدفوعُ يسقطان منها. */
check("وقيمةُ البضاعة المسلَّمة = 30000 (لا تنقص كلّما حُصِّل)", tot.goodsOut === 30000, `طلع ${tot.goodsOut}`);
check("ولا رقمَ NaN بأيِّ مجموع", Object.values(tot).every((v) => Number.isFinite(v)));

/* المقدَّمُ لم يمرّ بيد الحامل: يدخل قيمةَ البضاعة ولا يُحسب عليه تحصيلاً. */
const prepaidOrd = ORD("o8", "i8", { collected_at: "2026-07-02T12:00:00Z", prepaid: 3000 });
const prepaidInv = INV("i8", 12000, 12000);
const tp = courierTotals([prepaidOrd], (id) => (id === "i8" ? prepaidInv : undefined));
check("طلبٌ مقدَّمُه 3000 من 12000: البضاعة 12000", tp.goodsOut === 12000, `طلع ${tp.goodsOut}`);
check("  والمحصَّلُ منه 9000 لا 12000", tp.collected === 9000, `طلع ${tp.collected}`);

/* وطلبٌ فاتورتُه غائبة يسقط للقطته: cod + المقدَّم. */
const gone = ORD("o9", "gone", { collected_at: "2026-07-03T12:00:00Z", cod_amount: 4000, prepaid: 1000 });
const tg = courierTotals([gone], () => undefined);
check("فاتورةٌ غائبة: البضاعة = cod + المقدَّم = 5000", tg.goodsOut === 5000, `طلع ${tg.goodsOut}`);
check("  والمحصَّل = cod = 4000", tg.collected === 4000, `طلع ${tg.collected}`);

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
