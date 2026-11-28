/* ============================================================================
 * سلّةٌ مفتوحةٌ ورفعُ أسعار — src/lib/cartReprice.ts بسلوكه.
 * ما يحرسه: السطرُ غيرُ المعدَّل يأخذ السعرَ الجديد لوحدته؛ المعدَّلُ بيد يبقى؛ كلُّ
 * المحفوظ (علبة/مفرد/كيلو) يتجدّد فتبديلُ الوحدة بعدها لا يُرجع القديم؛ الراجعُ والدواءُ
 * لا يُمسّان؛ والتغييرُ يُعاد بالاسم والسعرين للإقرار.
 *
 *   node scripts/cart-reprice-test.mjs
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "reprice-")); const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/cartReprice.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent" });
const m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };

const prices = { p1: { box: 6250, sub: 1950 }, p2: { box: 2100, sub: null }, pk: { box: 12500, sub: null } };
const svc = { s1: 18750 };
const fresh = { product: (id) => prices[id] ?? null, service: (id) => svc[id] ?? null };
const P = (id, o = {}) => ({ id: `p:${id}`, kind: "product", name: id, product_id: id, unit_price: 5000, boxPrice: 5000, subPrice: 1500, saleUnit: "box", ...o });

{
  const r = m.repriceCart([P("p1")], fresh);
  check("علبةٌ من القائمة: 5000 → 6250، ويُقال بالاسم", r.cart[0].unit_price === 6250 && r.changed[0]?.from === 5000 && r.changed[0]?.to === 6250 && r.changed[0]?.name === "p1");
  check("  والمفردُ المحفوظ تجدّد أيضاً (تبديلُ الوحدة بعدها لا يُرجع 1500)", r.cart[0].subPrice === 1950);
}
{
  const r = m.repriceCart([P("p1", { saleUnit: "sub", unit_price: 1500 })], fresh);
  check("سطرٌ على المفرد: 1500 → 1950، والعلبةُ المحفوظة 6250", r.cart[0].unit_price === 1950 && r.cart[0].boxPrice === 6250);
}
{
  const r = m.repriceCart([P("p1", { unit_price: 4800, priceManual: true })], fresh);
  check("سعرٌ عُدِّل بيد (خصم) يبقى، ولا يُعدّ تغييراً — والمحفوظُ يتجدّد", r.cart[0].unit_price === 4800 && r.changed.length === 0 && r.cart[0].boxPrice === 6250);
}
{
  const r = m.repriceCart([P("p1", { unit_price: 4800 })], fresh);
  check("سطرٌ قديمٌ بلا علَم: سعرُه ≠ المحفوظ ⇒ يُعامل يدوياً ويبقى", r.cart[0].unit_price === 4800 && r.changed.length === 0);
}
{
  const r = m.repriceCart([P("p1", { unit_price: 5000, priceManual: false })], fresh);
  check("علَمٌ صريح «غير يدوي» يتغلّب على المساواة", r.cart[0].unit_price === 6250);
}
{
  const r = m.repriceCart([P("p1", { ret: true, id: "r:p1" })], fresh);
  check("سطرُ الراجع لا يُمسّ (يُردّ بسعر ما قبل الرفع افتراضاً)", r.cart[0].unit_price === 5000 && r.changed.length === 0);
}
{
  const l = { id: "pk", kind: "product", name: "كتلة", product_id: "pk", unit_price: 10000, byWeight: true, perKgPrice: 10000 };
  const r = m.repriceCart([l], fresh);
  check("بالوزن: سعرُ الكيلو 10000 → 12500", r.cart[0].unit_price === 12500 && r.cart[0].perKgPrice === 12500);
}
{
  const l = { id: "s:s1", kind: "service", name: "فحص", product_id: null, serviceId: "s1", unit_price: 15000, listAt: 15000 };
  const r = m.repriceCart([l], fresh);
  check("خدمة: 15000 → 18750 (listAt يتجدّد)", r.cart[0].unit_price === 18750 && r.cart[0].listAt === 18750);
  const legacy = { ...l, listAt: undefined };
  check("  وخدمةٌ من مسودّةٍ قديمة بلا listAt لا يُخمَّن سعرُها", m.repriceCart([legacy], fresh).cart[0].unit_price === 15000);
}
{
  const med = { id: "m:1", kind: "med", name: "دواء", product_id: null, unit_price: 3000 };
  check("سطرُ الدواء بلا كتالوج لا يُمسّ", m.repriceCart([med], fresh).cart[0].unit_price === 3000);
}
{
  const same = [P("p2", { unit_price: 2100, boxPrice: 2100, subPrice: undefined })];
  const r = m.repriceCart(same, fresh);
  check("لا تغيير ⇒ نفسُ المصفوفة (لا رسمَ ولا إقرار)", r.cart === same && r.changed.length === 0);
}
{
  const gone = [P("zz")];
  check("منتجٌ غاب عن القائمة لا يُمسّ", m.repriceCart(gone, fresh).cart === gone);
}

/* ── 0294: وحدةُ المادّة تغيّرت بعد نزول السطر (تحويلٌ من جهازٍ آخر) — السطرُ يُشال ويُقال، لا يخصم بالقديمة ── */
{
  check("lineUnitKey مرآةُ _unit_key: بالوزن يغلب، والمفردُ بعدده، وبلا عددٍ «بالعدد»",
    m.lineUnitKey({ sold_by_weight: true, has_sub_unit: true, units_per_box: 10 }) === "w" && m.lineUnitKey({ has_sub_unit: true, units_per_box: 10 }) === "n:10"
    && m.lineUnitKey({ has_sub_unit: true, units_per_box: null }) === "b" && m.lineUnitKey({}) === "b");
  const at = (uk) => ({ product: (id) => (prices[id] ? { ...prices[id], uk } : null), service: () => null });
  const bag = P("p1", { uk: "b" });
  const r = m.repriceCart([bag, P("p2", { uk: "b" })], { product: (id) => ({ ...prices[id], uk: id === "p1" ? "w" : "b" }), service: () => null });
  check("سطرُ كيسٍ والمادّةُ صارت بالكيلو ⇒ يُشال ويُقال باسمه، والباقي يُسعَّر كالعادة",
    r.cart.length === 1 && r.cart[0].product_id === "p2" && r.dropped.length === 1 && r.dropped[0].name === "p1" && r.cart[0].unit_price === 2100, r);
  check("  والوحدةُ نفسُها لا تُشال", m.repriceCart([bag], at("b")).dropped.length === 0);
  check("  والراجعُ يُشال كذلك (يردّ بالقديمة)", m.repriceCart([P("p1", { uk: "b", ret: true, id: "r:p1" })], at("w")).dropped.length === 1);
  check("  وسطرُ المفرد وعددُه تغيّر (١٠ ⇒ ٢٠) يُشال", m.repriceCart([P("p1", { uk: "n:10", saleUnit: "sub", unitsPerBox: 10 })], at("n:20")).dropped.length === 1);
  check("  والكارتونُ لا (يُخصم بعلبه)", m.repriceCart([P("pk", { uk: "n:10", saleUnit: "pack", packId: "k1", packPrice: 12500, unit_price: 12500 })], at("n:20")).dropped.length === 0);
  check("  وقائمةٌ بلا وحدة (جلبٌ قديم) لا تشيل شيئاً", m.repriceCart([bag], fresh).dropped.length === 0);
  check("  وسطرُ مسودّةٍ قبل الحقل: الوزنُ من سطره (كيلو والمادّةُ علب ⇒ يُشال)، والمفردُ بعدده المحفوظ، والعلبةُ لا تُعرف فتبقى",
    m.repriceCart([P("p1", { byWeight: true, perKgPrice: 5000, saleUnit: undefined })], at("b")).dropped.length === 1
    && m.repriceCart([P("p1", { saleUnit: "sub", unitsPerBox: 10 })], at("n:10")).dropped.length === 0
    && m.repriceCart([P("p1", { saleUnit: "sub", unitsPerBox: 10 })], at("b")).dropped.length === 1
    && m.repriceCart([P("p1")], at("w")).dropped.length === 1
    && m.repriceCart([P("p1")], at("n:10")).dropped.length === 0);
}

console.log(fail === 0 ? `✓ cart-reprice: ${pass} فحصاً عبرت` : `✗ ${fail} فشلت من ${pass + fail}`);
if (fail) process.exit(1);
