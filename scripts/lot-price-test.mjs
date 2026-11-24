/* ============================================================================
 * «بيش تبيعها؟» (0290، المالك ٢٤/١١: «لمن الدكتور يرجع يبيعه هو يحدد شكد السعر») — بسلوكها (react-mini).
 *
 * ١) نافذةُ «من الإكسباير لو من الجديد؟» الحقيقيّة: الإكسباير يفتح سؤالَ السعر بسعر القائمة جاهزاً، والنِّسَبُ تكتبه، وتحت كلفة الدفعة
 *    (بوحدة السطر: المفردُ كلفتُه بنسبته من العلبة) تُقال «خسارة»، وغيرُ المقروء لا يُرسَل، والأرقامُ الشرقية وفاصلُ الآلاف تُقرأ،
 *    و«رجوع» يرجع للقائمة، و«من الجديد» null.
 * ٢) `lotUnitPrice` (شاشةُ البيع): السعرُ لوحدته حرفاً، وللأخرى بنسبته من القائمة، وبلا قائمةٍ بعدد المفرد — نصُّ الدالّة نفسُه
 *    يُقتطع من SaleBuilder.tsx ويُنادى (لا نسخة).
 *
 *   node scripts/lot-price-test.mjs
 * ========================================================================= */
import { readFileSync } from "node:fs";
import { loadUI } from "./react-mini.mjs";

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name}${got === undefined ? "" : ` — ${JSON.stringify(got)}`}`); } };

const STUBS = {
  "@/lib/expiredApi": "export const listReturnLotsOf = async () => [];",
  "@/components/ui": `import { createElement } from "react";
    export const Button = ({ children, leftIcon, loading, variant, size, ...p }) => createElement("x-button", p, children);
    export const Dialog = ({ open, title, description, footer, children }) => (open ? createElement("x-dialog", {}, title, description, children, footer) : null);`,
};
const UI = await loadUI(`export { LotPickDialog } from "./src/components/retail/ExpiredReturn.tsx";`, STUBS);
const { mount, React, LotPickDialog } = UI;
const h = React.createElement;
const typeIn = (n, value) => { if (!n) throw new Error("typeIn: لا عقدة"); n.props.onChange({ target: { value } }); };

const LOT = { id: "L1", product_id: "p1", qty: 2, received_qty: 2, unit_cost: 10000, return_pct: 50, return_from: "أبو علي",
  expiry_date: "2026-10-01", returned_at: "2026-11-23T22:30:00.000Z", source: "return" };
const PRODUCT = { id: "p1", name: "دواء", unit_name: "علبة", sub_unit_name: "شريط" };

async function open(unit, newLeft = 5) {
  const picks = [];
  const ui = mount(h(LotPickDialog, { open: true, product: PRODUCT, lots: [LOT], newLeft, unitFor: () => unit,
    onPick: (lot, price) => picks.push([lot?.id ?? null, price]), onCancel: () => picks.push(["cancel"]) }));
  await ui.settle();   // أثرُ الفتح (تصفيرُ الاختيار) يجري قبل أوّل لمسة — كالمتصفّح
  return { ui, picks };
}

console.log("▸ ١) النافذة: من الإكسباير ⇒ «بيش تبيعها؟»");
{
  const { ui, picks } = await open({ sub: false, unitName: "علبة", list: 20000, per: 1 });
  check("القائمةُ أوّلاً: دفعةٌ و«من الجديد»", !!ui.find("data-lotpickone", "L1") && !!ui.find("data-lotpicknew"));
  ui.click(ui.find("data-lotpickone", "L1"));
  const input = () => ui.find("data-lotpriceinput");
  check("الإكسباير يفتح سؤالَ السعر بسعر القائمة جاهزاً (٢٠٬٠٠٠) — لا بيعَ قبل الجواب", !!ui.find("data-lotprice") && input()?.props.value === "20000" && picks.length === 0, input()?.props.value);
  check("  وكلفتُها عليك تُقال (لا «خسارة» بسعر القائمة)", /xret\.priceCost/.test(ui.text(ui.find("data-lotpricecost"))), ui.text(ui.find("data-lotpricecost") ?? ui.container));
  ui.click(ui.find("data-lotpricepct", "50"));
  check("نصفُ السعر بضغطة ⇒ ١٠٬٠٠٠ (يساوي كلفتَها: لا خسارة)", input()?.props.value === "10000" && /xret\.priceCost/.test(ui.text(ui.find("data-lotpricecost"))), input()?.props.value);
  typeIn(input(), "9000");
  check("تحت كلفتها (٩٬٠٠٠ < ١٠٬٠٠٠) ⇒ «خسارة» تُقال قبل البيع", /xret\.priceBelow/.test(ui.text(ui.find("data-lotpricecost"))));
  typeIn(input(), "سعر");
  check("غيرُ المقروء: جملةٌ والزرُّ مقفول (لا يُرسَل صفرٌ ولا NaN)", !!ui.find("data-lotpricebad") && ui.find("data-lotpriceok")?.props.disabled === true);
  typeIn(input(), "١٢٬٥٠٠");
  ui.click(ui.find("data-lotpriceok"));
  check("الأرقامُ الشرقية وفاصلُ الآلاف تُقرأ: «١٢٬٥٠٠» ⇒ البيعُ من الدفعة بـ١٢٬٥٠٠", JSON.stringify(picks) === JSON.stringify([["L1", 12500]]), picks);
}
{
  const { ui, picks } = await open({ sub: false, unitName: "علبة", list: 20000, per: 1 });
  ui.click(ui.find("data-lotpickone", "L1"));
  ui.click(ui.find("data-lotpriceback"));
  check("«رجوع» يرجع للقائمة بلا اختيار", !!ui.find("data-lotpick") && !ui.find("data-lotprice") && picks.length === 0);
  ui.click(ui.find("data-lotpicknew"));
  check("«من الجديد» ⇒ null بلا سعر", JSON.stringify(picks) === JSON.stringify([[null, undefined]]), picks);
}
{
  // سطرٌ يبدأ بالمفرد (باقي الدفعة أقلُّ من علبة): كلفتُه كلفةُ العلبة × ٠٫١ = ١٬٠٠٠.
  const { ui, picks } = await open({ sub: true, unitName: "شريط", list: 2500, per: 0.1 });
  ui.click(ui.find("data-lotpickone", "L1"));
  check("بالمفرد: سعرُ المفرد بالقائمة (٢٬٥٠٠)", ui.find("data-lotpriceinput")?.props.value === "2500");
  typeIn(ui.find("data-lotpriceinput"), "900");
  check("  وكلفتُه بنسبته (١٬٠٠٠ للشريط): ٩٠٠ ⇒ «خسارة»", /xret\.priceBelow/.test(ui.text(ui.find("data-lotpricecost"))));
  typeIn(ui.find("data-lotpriceinput"), "1000");
  check("  و١٬٠٠٠ بالضبط ليست خسارة (بالفلس لا بالعائم)", /xret\.priceCost/.test(ui.text(ui.find("data-lotpricecost"))));
  ui.click(ui.find("data-lotpriceok"));
  check("  والبيعُ بـ١٬٠٠٠ للشريط", JSON.stringify(picks) === JSON.stringify([["L1", 1000]]), picks);
}

console.log("▸ ٢) lotUnitPrice — نصُّ شاشة البيع نفسُه");
const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
const fnSrc = /function lotUnitPrice\([\s\S]*?\n\}/.exec(sb)?.[0];
const r2Src = /const round2 = [^\n]+/.exec(sb)?.[0];
check("الدالّةُ ودالّةُ التقريب موجودتان بشاشة البيع", !!fnSrc && !!r2Src);
// eslint-disable-next-line no-new-func
const lotUnitPrice = new Function(`${r2Src.replace(/:\s*number/g, "")}\n${fnSrc.replace(/\(px: LotPrice, sub: boolean, listOfUnit: number, upb: number \| null\): number/, "(px, sub, listOfUnit, upb)")}\nreturn lotUnitPrice;`)();
const cases = [
  ["الوحدةُ نفسُها: ما كتبه حرفاً", [{ price: 12345, sub: false, list: 20000 }, false, 20000, 10], 12345],
  ["  ولو تبدّل سعرُ القائمة بين السؤال والسطر (صفٌّ طازج): ما كتبه لا نسبتُه", [{ price: 12345, sub: false, list: 20000 }, false, 25000, 10], 12345],
  ["علبةٌ بنصّ سعرها ⇒ المفردُ بنصّ سعره", [{ price: 10000, sub: false, list: 20000 }, true, 2500, 10], 1250],
  ["مفردٌ بـ٨٠٪ ⇒ العلبةُ بـ٨٠٪", [{ price: 2000, sub: true, list: 2500 }, false, 20000, 10], 16000],
  ["بلا قائمة: العلبةُ ÷ عدد المفرد", [{ price: 10000, sub: false, list: 0 }, true, 0, 10], 1000],
  ["  والمفردُ × عددِه", [{ price: 900, sub: true, list: 0 }, false, 0, 10], 9000],
  ["بلا قائمةٍ ولا عدد: سعرُ القائمة كما هو", [{ price: 900, sub: true, list: 0 }, false, 777, null], 777],
  ["التقريبُ بالفلس: ثلثُ السعر", [{ price: 10000, sub: false, list: 30000 }, true, 1000, 30], 333.33],
];
for (const [name, args, want] of cases) { const got = lotUnitPrice(...args); check(`${name}: ${want}`, got === want, got); }

console.log(`${fail ? "✗" : "✓"} lot-price-test: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
