/* ============================================================================
 * فحص تجميع المسحة — حارسُ «الرمزُ يصل كاملاً وإن انشغل المتصفّح».
 *
 * الحقيقة المقيسة من الإنتاج (ابن الهيثم، ٥ أيلول ٢٠٢٦، سجلُّ طلبات الخادم):
 * كلُّ مسحةٍ فاشلة باليوم ١١ أو ١٢ رقماً، وكلُّ ناجحة ١٣ — ونفسُ العلبة تنجح
 * بعد ثوانٍ. الماسحُ سليم؛ الذي كان يضيع رقمٌ أو رقمان من أوّل الدفعة لأن
 * المجمِّع قاس الفجوةَ بين الضغطات لحظةَ **معالجتها** لا وقوعها، وأوّلُ رقمٍ
 * يدخل حقلَ البحث فيُصفّي مئاتِ المواد ويرسمها فيتأخّر الثاني.
 *
 *   node scripts/scan-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const load = async (entry, plugins = [], alias = {}) => {
  const built = await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral", plugins, alias });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
};

const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
  },
};

const { createScanAssembler } = await load("src/lib/scanBuffer.ts");
const { matchTruncatedCode } = await load("src/lib/productCodes.ts", [stubs], { "@/lib/utils": "./src/lib/utils.ts" });

/* ضغطاتٌ بأزمنتها: [مفتاح, زمن الحدث بالملّي ثانية] */
const run = (asm, seq) => {
  const out = [];
  for (const [k, t] of seq) { const c = asm.feed(k, t); if (c) out.push(c); }
  return out;
};
const burst = (code, start, step) => code.split("").map((ch, i) => [ch, start + i * step]);
const EAN = "5906731501876"; // «معلبات لون ازرق 4 ب5» — العلبةُ التي فشلت مسحتُها

console.log("▸ createScanAssembler — الزمنُ زمنُ الحدث، والحكمُ على الدفعة كلّها");
let asm = createScanAssembler();
check("دفعةُ ماسحٍ نظيفة (١٣ رقماً كل ٨ ملّي) تصل كاملة",
  run(asm, [...burst(EAN, 1000, 8), ["Enter", 1104]])[0] === EAN);

asm = createScanAssembler();
const stalled = [["5", 1000], ["9", 1090], ["0", 1160], ...burst("6731501876", 1168, 8), ["Enter", 1248]];
const got = run(asm, stalled);
check("توقّفُ المتصفّح بعد الرقم الأوّل والثاني (٩٠ و٧٠ ملّي) لا يقطع الرمز — حالة ابن الهيثم",
  got[0] === EAN, `وصل ${JSON.stringify(got)}`);

asm = createScanAssembler();
check("إنسانٌ يكتب ١٣ رقماً (١٥٠ ملّي بين الضغطات) ليس مسحة",
  run(asm, [...burst(EAN, 1000, 150), ["Enter", 2950]]).length === 0);

asm = createScanAssembler();
check("«اكتب ٣ ثم امسح»: الرقمُ المكتوب قبل التقاط الماسح لا يلتصق بالرمز",
  run(asm, [["3", 1000], ...burst(EAN, 1800, 8), ["Enter", 1904]])[0] === EAN);

asm = createScanAssembler();
const two = [...burst(EAN, 1000, 8), ["Enter", 1104], ...burst("6263188401289", 1500, 8), ["Enter", 1604]];
check("مسحتان متتاليتان = رمزان بالترتيب",
  JSON.stringify(run(asm, two)) === JSON.stringify([EAN, "6263188401289"]));

asm = createScanAssembler();
check("Shift وTab لا يدخلان الرمز",
  run(asm, [["Shift", 1000], ...burst(EAN, 1002, 8), ["Tab", 1110], ["Enter", 1112]])[0] === EAN);

asm = createScanAssembler();
check("رمزٌ أقصر من الحدّ (حرفان) يُهمَل",
  run(asm, [...burst("99", 1000, 8), ["Enter", 1016]]).length === 0);

asm = createScanAssembler();
const humanThenScan = [...burst("amox", 1000, 120), ["Enter", 1600], ...burst(EAN, 3000, 8), ["Enter", 3104]];
check("بحثٌ مكتوب + Enter ليس مسحة، والمسحةُ بعده تصل نظيفة",
  JSON.stringify(run(asm, humanThenScan)) === JSON.stringify([EAN]));

asm = createScanAssembler();
const mostlySlow = [["5", 1000], ["9", 1008], ["0", 1016], ["6", 1200], ["7", 1400], ["3", 1600], ["1", 1800], ["Enter", 2000]];
check("دفعةٌ أكثرُ فجواتها بطيئة ليست مسحة (فجوتان سريعتان لا تكفيان)",
  run(asm, mostlySlow).length === 0);

asm = createScanAssembler();
const ctrlLike = [...burst(EAN, 1000, 8), ["Enter", 1104]];
asm.feed("5", 500); asm.reset();
check("reset() يمسح ما تجمّع",
  run(asm, ctrlLike)[0] === EAN);

asm = createScanAssembler({ minLength: 5 });
check("minLength يُحترم",
  run(asm, [...burst("7101", 1000, 8), ["Enter", 1032]]).length === 0);

console.log("▸ matchTruncatedCode — مسحةٌ بلا رأسها تُطابَق بذيلها إن كان لمنتجٍ واحد");
const P = (id, name, barcode, extra = {}) => ({ id, name, barcode, stock: 1, ...extra });
const inv = [
  P("a", "معلبات لون ازرق 4 ب5", EAN),
  P("b", "amino acide perssa", "6263188401289", { alt_codes: ["8680542871133"] }),
  P("c", "مكافآت قطط", "8711908384001"),
  P("d", "مكافآت قطط — عبوة ثانية", "18711908384001"), // توأمٌ قريب مقيس على الإنتاج
  P("e", "سبري حشرات", "247"),
];
check("ذيلٌ ينقصه رقمٌ واحد يلقى المنتج", matchTruncatedCode(inv, "906731501876")?.id === "a");
check("ذيلٌ ينقصه رقمان يلقاه أيضاً", matchTruncatedCode(inv, "06731501876")?.id === "a");
check("ثلاثةُ أرقامٍ ناقصة لا تُخمَّن", matchTruncatedCode(inv, "6731501876") === undefined);
check("أقلُّ من عشرة أرقام لا يُخمَّن", matchTruncatedCode(inv, "731501876") === undefined);
check("الرمزُ الإضافي (alt_codes) يُطابَق بذيله مثل الأساسي", matchTruncatedCode(inv, "680542871133")?.id === "b");
check("ذيلٌ يخصّ منتجَين لا يُخمَّن — يُترك للإنسان", matchTruncatedCode(inv, "711908384001") === undefined);
check("رمزٌ مطابقٌ بالكامل ليس ذيلاً (مسارُ المطابقة الأصلي يتكفّل به)", matchTruncatedCode(inv, EAN) === undefined);
check("أرقامٌ عربية تُطبَّع قبل المطابقة", matchTruncatedCode(inv, "٩٠٦٧٣١٥٠١٨٧٦")?.id === "a");
check("حروفٌ لا تُطابَق", matchTruncatedCode(inv, "abcdefghijk") === undefined);
check("فارغٌ لا يُطابَق", matchTruncatedCode(inv, "") === undefined && matchTruncatedCode(inv, null) === undefined);

console.log(`\n${fails ? "✗" : "✓"} scan-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
