/* ============================================================================
 * محرّرا السعر بشاشة البيع — الكتابةُ تستبدل، والفارغُ ليس صفراً.
 *
 * الجذرُ المقيس (بالمتصفّح، ١٧/١٠): «الرقمُ الأزرق» (سعرُ السطر) و«تعديل السعر
 * النهائي» كانا يفتحان والسعرُ القديم داخل الحقل والمؤشّرُ بعده — فالكتابةُ من
 * الكيبورد تُلحَق ولا تستبدل: ١٨ ثم «٢٥» وEnter ⇐ **١٬٨٢٥**. والطبيبُ يقول «ما يتعدّل
 * بالكيبورد». ومعه ثانٍ أسوأ: مسحُ الحقل ثم النقرُ خارجه يحفظ `Number("")` = **صفر**
 * — سطرٌ أو فاتورةٌ كاملة تُباع مجّاناً بصمت.
 *
 * يمسكه من طرفين:
 *   ١) سلوكُ `readPriceDraft` من مصدرها: الفارغُ والمسافاتُ والسالبُ وغيرُ الرقم ⇐
 *      «لا تغيير»، والصفرُ المكتوبُ صفر.
 *   ٢) مسحٌ ثابت لـ`SaleBuilder.tsx`: المحرّران يفتحان بمسوّدةٍ **فارغة** والقديمُ
 *      `placeholder`، ويحفظان عبر `readPriceDraft` لا `Number(` خام.
 *
 *   node scripts/price-draft-test.mjs
 * ==========================================================================*/
import { readFileSync } from "node:fs";
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- ١) السلوك ----------------------------------------------------------- */
let readPriceDraft = null;
try {
  const built = await esbuild.build({
    entryPoints: ["src/lib/priceDraft.ts"], bundle: true, format: "esm", write: false,
    platform: "neutral", logLevel: "silent",
  });
  ({ readPriceDraft } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")));
} catch (e) {
  check("src/lib/priceDraft.ts تُبنى", false, e.message.split("\n")[0]);
}

console.log("▸ قراءةُ المسوّدة");
if (readPriceDraft) {
  const cases = [
    ["", null, "فارغٌ = لا تغيير (لا صفر)"],
    ["   ", null, "مسافاتٌ = لا تغيير"],
    ["25", 25, "رقمٌ مكتوب"],
    ["25000", 25000, "سعرٌ بالدينار"],
    ["0", 0, "صفرٌ **مكتوب** صفر — المجّانُ قرارٌ يُكتب"],
    ["12.5", 12.5, "كسرٌ (عملةٌ بفلوس)"],
    [" 30 ", 30, "مسافاتٌ حوله"],
    ["-5", null, "سالبٌ = لا تغيير"],
    ["abc", null, "ليس رقماً = لا تغيير"],
    ["1e400", null, "لا نهاية = لا تغيير"],
  ];
  for (const [input, want, why] of cases) {
    const got = readPriceDraft(input);
    check(`${JSON.stringify(input)} ⇐ ${want} — ${why}`, Object.is(got, want), `رجعت ${got}`);
  }
}

/* ---- ٢) المحرّران بشاشة البيع --------------------------------------------- */
console.log("▸ المحرّران يفتحان فارغَين ويحفظان عبر readPriceDraft");
const src = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");

const fnStart = src.indexOf("function PriceEdit(");
const priceEdit = fnStart >= 0 ? src.slice(fnStart, src.indexOf("\n}\n", fnStart)) : "";
check("PriceEdit موجودة", priceEdit.length > 0);
check("PriceEdit تفتح بمسوّدةٍ فارغة (لا `setDraft(String(…))`)",
  /setDraft\(\s*""\s*\)/.test(priceEdit) && !/setDraft\(\s*String\(/.test(priceEdit));
check("PriceEdit تعرض السعرَ الحاليّ placeholder", /placeholder=\{/.test(priceEdit));
check("PriceEdit تحفظ عبر readPriceDraft", /readPriceDraft\(\s*draft\s*\)/.test(priceEdit) && !/Number\(\s*draft\s*\)/.test(priceEdit));

const begin = src.match(/const beginEditTotal = \(\) => \{[^\n]*\};/)?.[0] ?? "";
check("beginEditTotal موجودة", begin.length > 0);
check("محرّرُ الإجمالي يفتح بمسوّدةٍ فارغة", /setTotalDraft\(\s*""\s*\)/.test(begin) && !/setTotalDraft\(\s*String\(/.test(begin));
const cStart = src.indexOf("const commitTotal = () => {");
const commitTotal = cStart >= 0 ? src.slice(cStart, src.indexOf("\n  };", cStart)) : "";
check("commitTotal تحفظ عبر readPriceDraft", /readPriceDraft\(\s*totalDraft\s*\)/.test(commitTotal) && !/Number\(\s*totalDraft\s*\)/.test(commitTotal));
const totalInput = src.match(/value=\{totalDraft\}[\s\S]{0,900}?\/>/)?.[0] ?? "";
check("محرّرُ الإجمالي يعرض الإجماليَّ placeholder", /placeholder=\{/.test(totalInput));

/* ---- ٣) الحقلُ الفارغ لا يخطو — أمسكه التدقيقُ العدائيّ على هذا الإصلاح نفسِه ------
 * `type=number` فارغٌ تخطو فيه العجلةُ والسهمان **من الصفر**: نقرةُ عجلةٍ واحدة تكتب
 * «0» ويحفظها الإغلاقُ سعراً مقصوداً (مقيسٌ بالمتصفّح: السطرُ «0 د.ع» والبيعُ «0 د.ع»).
 * فالعجلةُ تُغلق المحرّر (والفارغُ لا يغيّر)، والسهمان لا يخطوان. */
console.log("▸ العجلةُ والسهمان لا يكتبان صفراً بحقلٍ فارغ");
const priceInput = priceEdit.match(/<input[\s\S]*?\/>/)?.[0] ?? "";
for (const [name, block] of [["PriceEdit", priceInput], ["محرّرُ الإجمالي", totalInput]]) {
  check(`${name}: العجلةُ تُغلق المحرّر (onWheel → blur)`, /onWheel=\{\s*\(e\)\s*=>\s*e\.currentTarget\.blur\(\)\s*\}/.test(block));
  check(`${name}: السهمان لا يخطوان`, /ArrowUp[\s\S]{0,60}ArrowDown[\s\S]{0,40}preventDefault\(\)/.test(block));
}

/* ---- ٤) F2 لا يبيع من تحت مسوّدة ------------------------------------------
 * المكتوبُ بالمحرّر لم يدخل السلّة بعد؛ F2 كان يبيع بالسعر القديم والجديدُ ظاهرٌ بالحقل. */
console.log("▸ F2 ومحرّرٌ مفتوح: يحفظ ويقف، لا يبيع بالقديم");
const f2Guard = src.indexOf('e.key === "F2" && el instanceof HTMLInputElement');
const f2Sell = src.indexOf('if (e.key === "F2") { e.preventDefault(); if (cart.length > 0');
check("حارسُ F2 موجود ويسبق البيع", f2Guard >= 0 && f2Sell > f2Guard);
const guardLine = f2Guard >= 0 ? src.slice(f2Guard, src.indexOf("}", src.indexOf("return;", f2Guard)) + 1) : "";
check("حارسُ F2 يخصّ المحرّرَين ويحفظ (blur) ثم يقف",
  /priceedit/.test(guardLine) && /totaledit/.test(guardLine) && /el\.blur\(\)/.test(guardLine) && /return;/.test(guardLine) && !/checkout/.test(guardLine));

if (fails) {
  console.error(`\n✗ price-draft-test: ${passes} نجحت، ${fails} فشلت — محرّرُ السعر يُلحق الكتابةَ بالقديم أو يحفظ الفارغَ صفراً.\n`);
  process.exit(1);
}
console.log(`\n✓ price-draft-test: ${passes} نجحت، 0 فشلت.`);
