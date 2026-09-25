/* ============================================================================
 * فحصُ كشف الشراء (م٢) — `src/lib/purchaseEffects.ts` بسلوكه.
 *
 * الصفوفُ هنا بشكل ما تُنتجه 0211 فعلاً (القالبُ يُقاس على القاعدة لا على ما
 * يُسهّل الفحص): صورتا قبل/بعد بكلّ الحقول، و`changed` بلا الرصيد، والتعديلُ
 * دفعةٌ بختمٍ واحد، والمشالُ `removed` بكميةٍ سالبة.
 *
 *   node scripts/purchase-effects-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const out = await esbuild.build({
  entryPoints: ["src/lib/purchaseEffects.ts"], bundle: true, write: false, format: "esm", platform: "node",
  alias: { "@": "./src" }, logLevel: "silent",
});
const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
const { describeEffects, latestBatch } = mod;

const snap = (o = {}) => ({ name: "مادة", barcode: null, stock: 0, purchase_price: 0, sell_price: 0, min_stock: 0,
  expiry_date: null, category: null, company_id: null, section_id: null, pooled: false, ...o });
const E = (o) => ({ id: `e${Math.random()}`, purchase_id: "P", op: "record", line_no: 1, product_id: "x", product_name: "مادة",
  barcode_in: null, outcome: "matched", matched_by: "barcode", qty: 1, before: snap(), after: snap(), changed: [],
  created_at: "2026-09-25T10:00:00Z", ...o });

console.log("▸ التصنيف");
{
  const r = describeEffects([E({
    product_name: "سيفوتاكس", qty: 50,
    before: snap({ name: "سيفوتاكس", stock: 4, sell_price: 3000 }), after: snap({ name: "سيفوتاكس", stock: 54, sell_price: 2500 }),
    changed: ["sell_price"],
  })]);
  check("سعرُ البيع يُصنَّف تحت «تبدّلت» لا «زادت»",
    r.changed.length === 1 && r.changed[0].field === "sell_price" && r.changed[0].from === 3000 && r.changed[0].to === 2500);
  check("  والرصيدُ تحت «زادت» بالأرقام من الخادم (٤ ⇒ ٥٤، +٥٠)",
    r.added.length === 1 && r.added[0].from === 4 && r.added[0].to === 54 && r.added[0].qty === 50);
  check("  وفاتورةٌ فيها تبديلٌ ليست نظيفة", r.clean === false);
}
{
  const r = describeEffects([E({ matched_by: "name", product_name: "شامبو" })]);
  check("matched_by=name يولّد ملاحظةَ «لكيناها بالاسم»", r.notes.some((n) => n.kind === "by_name"));
  check("  ولا يُعدّ نظيفاً (قد لا تكون نفس المادّة)", r.clean === false);
}
{
  const r = describeEffects([E({ outcome: "created", matched_by: null, before: null, after: snap({ name: "رمل جاك", stock: 15 }), qty: 15 })]);
  check("outcome=created يولّد سطرَ «أول مرة»", r.created.length === 1 && r.created[0].name === "رمل جاك" && r.added.length === 0);
  check("  والجديدُ ليس نظيفاً (أوّلُ علامةِ توأم)", r.clean === false);
}
{
  const r = describeEffects([
    E({ line_no: 1, product_id: "a", qty: 3, before: snap({ stock: 1 }), after: snap({ stock: 4 }) }),
    E({ line_no: 2, product_id: "b", qty: 4, before: snap({ stock: 2 }), after: snap({ stock: 6 }) }),
  ]);
  check("فاتورةٌ نظيفة ⇒ clean وبعدد السطور", r.clean === true && r.lines === 2 && r.added.length === 2);
}
{
  const r = describeEffects([E({ changed: ["min_stock", "barcode", "expiry_date", "sell_price", "company_id"],
    before: snap({ min_stock: 1, expiry_date: "2026-03-01" }), after: snap({ min_stock: 2, barcode: "697", expiry_date: "2027-01-01", sell_price: 5, company_id: "C" }) })]);
  check("الخطورةُ ترتّب «تبدّلت»: السعر ثمّ الانتهاء ثمّ الشركة … ثمّ الحدّ الأدنى",
    r.changed.map((c) => c.field).join() === "sell_price,expiry_date,company_id,barcode,min_stock", r.changed.map((c) => c.field).join());
  check("  وتعلُّمُ الباركود: من لا شيء إلى رمز", r.changed.find((c) => c.field === "barcode")?.from === null && r.changed.find((c) => c.field === "barcode")?.to === "697");
}
{
  const r = describeEffects([E({ changed: ["stock", "pooled"] })]);
  check("الرصيدُ و`pooled` لا يُقالان «تبديلاً» ولو وصلا", r.changed.length === 0 && r.clean === true);
}

console.log("▸ الشركة");
{
  const r = describeEffects([E({ after: snap({ company_id: "OTHER" }) })], "MINE");
  check("طابق مادّةَ شركةٍ ثانية ⇒ ملاحظة", r.notes.some((n) => n.kind === "other_company"));
  const r2 = describeEffects([E({ after: snap({ company_id: "MINE" }) })], "MINE");
  check("  وشركتُها نفسُها ⇒ لا ملاحظة", r2.notes.length === 0);
  const r3 = describeEffects([E({ after: snap({ company_id: "OTHER" }) })], null);
  check("  وفاتورةٌ بلا شركة ⇒ لا ملاحظة", r3.notes.length === 0);
}

console.log("▸ الدفعات");
{
  const eff = [
    E({ op: "record", line_no: 1, created_at: "2026-09-25T10:00:00Z", qty: 50 }),
    E({ op: "record", line_no: 2, created_at: "2026-09-25T10:00:00Z", qty: 1 }),
    E({ op: "update", line_no: 1, created_at: "2026-09-26T09:00:00Z", qty: 40, before: snap({ stock: 50 }), after: snap({ stock: 40 }) }),
    E({ op: "update", line_no: 2, product_id: "y", created_at: "2026-09-26T09:00:00Z", outcome: "removed", matched_by: null, qty: -1,
        before: snap({ stock: 1 }), after: snap({ stock: 0 }) }),
    E({ op: "update", line_no: 1, created_at: "2026-09-27T09:00:00Z", qty: 40 }),
  ];
  check("الكشفُ بعد الحفظ = آخرُ دفعة وحدها", latestBatch(eff).length === 1 && latestBatch(eff)[0].created_at === "2026-09-27T09:00:00Z");
  const r = describeEffects(eff);
  check("  وعددُ التعديلات يُعدّ بالأختام لا بالصفوف (٢)", r.edits === 2 && r.op === "update");
  const r2 = describeEffects(eff.slice(0, 4));
  check("المشالُ من الفاتورة: removed بكميةٍ موجبةٍ للعرض ورصيدٍ نقص", r2.removed.length === 1 && r2.removed[0].qty === 1 && r2.removed[0].to === 0);
  check("  ولا يُعدّ سطراً مُنزَّلاً، ولا نظيفاً", r2.lines === 1 && r2.clean === false);
  check("وكشفٌ فارغ (فاتورةٌ قبل 0211) ⇒ op فارغ", describeEffects([]).op === null);
}

console.log("▸ التعديل — ما أمسكه التدقيقُ العدائيّ");
{
  const U = (o) => E({ op: "update", created_at: "2026-09-26T09:00:00Z", matched_by: "id", ...o });
  const r = describeEffects([U({ qty: 40, before: snap({ stock: 0 }), after: snap({ stock: 0 }) })]);
  check("تعديلٌ لا يغيّر شيئاً لا يقول «زدنا ٤٠، كان ٠ صار ٠»", r.added.length === 0 && r.lines === 0 && r.clean === true && r.op === "update",
    JSON.stringify(r.added));
  const r2 = describeEffects([U({ qty: 12, before: snap({ stock: 5 }), after: snap({ stock: 7 }) })]);
  check("  و١٠ ⇒ ١٢ يقول الرصيدَ ٥ ⇒ ٧ والفرقَ +٢ لا ١٢", r2.added.length === 1 && r2.added[0].qty === 2 && r2.added[0].from === 5 && r2.added[0].to === 7);
  /* سطران لنفس المادّة بالتعديل: الثاني صورتُه وسطيّةٌ سالبة (−٣٥) — مقيسةٌ من 0211 نفسِها. */
  const r3 = describeEffects([
    U({ line_no: 1, qty: 10, before: snap({ stock: 5 }), after: snap({ stock: 0 }) }),
    U({ line_no: 2, qty: 30, before: snap({ stock: -35 }), after: snap({ stock: 0 }) }),
  ]);
  check("  وسطران لنفس المادّة مادّةٌ واحدة: «كان» الأوّل و«صار» الأخير، ولا −٣٥ أبداً",
    r3.added.length === 1 && r3.added[0].from === 5 && r3.added[0].to === 0, JSON.stringify(r3.added));
  const r4 = describeEffects([
    E({ line_no: 1, qty: 10, before: snap({ stock: 4, sell_price: 3000 }), after: snap({ stock: 14, sell_price: 2500 }), changed: ["sell_price"] }),
    E({ line_no: 2, qty: 5, before: snap({ stock: 14, sell_price: 2500 }), after: snap({ stock: 19, sell_price: 3000 }), changed: ["sell_price"] }),
  ]);
  check("وبالتسجيل كذلك: ٤ ⇒ ١٩ بكميةٍ ١٥، وسعرٌ تبدّل ورجع لا يُقال", r4.added.length === 1 && r4.added[0].qty === 15 && r4.added[0].to === 19 && r4.changed.length === 0,
    JSON.stringify([r4.added, r4.changed]));
}

console.log(`\n${fails ? "✗" : "✓"} purchase-effects-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
