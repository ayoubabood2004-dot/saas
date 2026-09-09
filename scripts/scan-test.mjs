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
import { readFileSync } from "node:fs";

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


/* ── G6: ماسحاتٌ فاصلُها Tab ──────────────────────────────────────────────
 * ماسحاتٌ كثيرة تُضبط من المصنع على Tab بدل Enter، وكان المجمِّعُ يهملها
 * كمفتاحٍ غير مطبوع — فلا تعمل مسحةٌ واحدة بتلك العيادة أبداً. وTab من إنسانٍ
 * يتنقّل بين الحقول يبقى تنقّلاً: فجواتُه بطيئة فلا تصحّ دفعةً. */
{
  const runKeys = (text, gapMs, endKey) => {
    const asm = createScanAssembler({});
    let t = 1000;
    for (const ch of text) { asm.feed(ch, t); t += gapMs; }
    return asm.feed(endKey, t);
  };
  check("دفعةُ ماسحٍ + Tab تصل كاملة", runKeys("8680542871133", 15, "Tab") === "8680542871133");
  check("  ومثلُها + Enter (بلا تغيير)", runKeys("8680542871133", 15, "Enter") === "8680542871133");
  check("كتابةُ إنسانٍ + Tab لا تُلتقط (تنقّلٌ لا مسحة)", runKeys("abc", 300, "Tab") === null);
  check("  ومثلُها + Enter", runKeys("abc", 300, "Enter") === null);
  check("ورمزٌ أقصرُ من الحدّ + Tab لا يُلتقط", runKeys("ab", 15, "Tab") === null);
  check("ودفعةٌ آلية قصيرة (رقمُ رفّ) + Tab تصل", runKeys("247", 15, "Tab") === "247");

  /* ── وحدُّ Tab أضيقُ من حدّ Enter عمداً ────────────────────────────────────
   * كان الفحصُ يجرّب Tab بحالتين وحدَهما: ماسحٌ بـ١٥ م.ث وإنسانٌ بـ٣٠٠ — ولا
   * حالةَ بأزمانٍ بشريةٍ **سريعة**. فمرّ عطلٌ حقيقيّ: كاشيرٌ يكتب هاتفاً بـ٥٥
   * م.ث ثم Tab كانت كتابتُه تُقرأ مسحةً، فيُبتلع Tab ولا ينتقل التركيز.
   * وهذه الحالاتُ هي التي كانت غائبة. */
  const runMixed = (text, gapsArr, endKey) => {
    const asm = createScanAssembler();
    let t = 1000;
    [...text].forEach((ch, i) => { if (i) t += gapsArr[(i - 1) % gapsArr.length]; asm.feed(ch, t); });
    return asm.feed(endKey, t + 10);
  };
  check("كتابةُ إنسانٍ سريعة (٥٥ م.ث) + Tab لا تُقرأ مسحة", runMixed("07701234567", [55], "Tab") === null);
  check("  ومختلطةٌ (٥٠ و١٥٠) + Tab كذلك", runMixed("07701234567", [50, 150], "Tab") === null);
  check("  ومبلغٌ قصيرٌ سريع (٥٥ م.ث) + Tab كذلك", runMixed("1500", [55], "Tab") === null);
  check("  وضغطٌ مستمرّ على مفتاحٍ واحد (٣٠ م.ث) + Tab كذلك", runMixed("00000000", [30], "Tab") === null);
  check("ونفسُ الكتابة + Enter تبقى على حكمها القديم", runMixed("07701234567", [55], "Enter") === "07701234567");
  check("وماسحٌ حقيقيّ (٢٠ م.ث) + Tab يصل", runMixed("6970967772736", [20], "Tab") === "6970967772736");
  check("  وماسحٌ بفجوةٍ واحدةٍ بطيئة + Tab لا يصل (لا تسامُحَ لـTab)",
    runMixed("6970967772736", [10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 10, 90], "Tab") === null);
}

/* ── G6 بمكانه الثاني: صندوقُ مسح المشتريات ────────────────────────────────
 * المجمِّعُ يقبل Tab منذ الدفعة ٤، لكنه كان مركَّباً بشاشة البيع وحدها
 * (`useBarcodeScanner` بـSaleBuilder). وصندوقُ مسح المشتريات حقلٌ بمعالجٍ
 * خاصٍّ كان يعرف Enter فقط — فالعيادةُ ذاتُ ماسح Tab تبيع ولا تستلم بضاعة:
 * كلُّ مسحةٍ بفاتورة الشراء تضيع بلا سطرٍ وبلا رسالة، وهو حدٌّ صامتٌ آخر.
 * الفحصُ نصّيّ لأن الوصلَ وصلُ JSX لا منطقٌ يُستدعى — والمنطقُ نفسُه مفحوصٌ أعلاه. */
{
  const src = readFileSync("src/components/inventory/Purchases.tsx", "utf8");
  check("صندوقُ الشراء يغذّي المجمِّعَ بزمن الحدث لا بساعة الحائط",
    /scanAsm\.current\.feed\(e\.key,\s*e\.timeStamp\)/.test(src));
  check("  ويضيف على Tab إن قال المجمِّعُ «مسحة»",
    /e\.key === "Tab" && scanned/.test(src));
  check("  ويبني مجمِّعَه من المصدر الواحد لا بقاعدةٍ جديدة",
    src.includes('createScanAssembler') && src.includes('from "@/lib/scanBuffer"'));
}


/* ── تركيبُ الصيغ ومفتاحُ الرباط (س٦ + س٧) ────────────────────────────────
 * كانت `scanVariants` قائمةَ فروعٍ متوازية تُحسب من الخام وحده: قشرُ AIM من
 * الخام، وصيغُ الأصفار من المقشور، وقراءةُ التخطيط تُضاف **كما هي**. فرمزٌ
 * برأس AIM مُسح والكيبوردُ عربيّ (`]` تصل «د») يُصلَّح تخطيطُه فيعود `]C1…`
 * ثم لا يُقشَّر — فيخيب بالطبقات الأربع كلِّها والمادّةُ بالرفّ.
 * ومعها `feed` كانت ترمي كلَّ مفتاحٍ نصُّه أطولُ من محرف: مفتاح `b` بالتخطيط
 * العربي يُخرج «لا» (محرفان) فيسقط من الرمز — ولا `layoutFix` تُعيد ما لم يصل،
 * ولا `matchTruncatedCode` تنقذ حرفاً من الوسط (ذيلُها رقميّ). */
console.log("▸ تركيبُ صيغ النجدة ومفتاحُ «لا»");
{
  const pc2 = await load("src/lib/productCodes.ts", [stubs], { "@/lib/utils": "./src/lib/utils.ts" });
  const P2 = [
    { id: "q1", name: "أموكسيسيلين", barcode: "6221031492405", alt_codes: [] },
    { id: "q2", name: "قطرة عين", barcode: "b4417", alt_codes: [] },
  ];

  // س٦ — الصيغُ تتركّب: إصلاحُ التخطيط ثم قشرُ AIM ثم الأصفار
  const v = pc2.scanVariants("دC16221031492405");
  check("رأسُ AIM ممسوخاً بالتخطيط يُصلَّح **ثم** يُقشَّر", v.includes("6221031492405"));
  check("  والقراءةُ الممسوخة تبقى بالقائمة أيضاً", v.includes("]c16221031492405"));
  check("  والنجدةُ تلقى صاحبَها — هذا ما كان يخيب",
    pc2.rescueScan(P2, "دC16221031492405")?.product.id === "q1");
  check("وأرقامٌ شرقية مع الرأس الممسوخ كذلك",
    pc2.rescueScan(P2, "دC1٦٢٢١٠٣١٤٩٢٤٠٥")?.product.id === "q1");
  check("والرأسُ السليم يبقى على حاله", pc2.scanVariants("]C16221031492405").includes("6221031492405"));
  check("ورمزٌ نظيف لا يولّد صيغاً من عدم", pc2.scanVariants("6221031492405").length === 0);
  check("والصيغُ لا تتوالد بلا حدّ", pc2.scanVariants("]C100000000000000").length < 24);

  // س٧ — «لا» محرفان من مفتاحٍ واحد
  const asm2 = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  const burst = [["٤", 0], ["٤", 15], ["١", 30], ["٧", 45]];
  let got = null;
  asm2.feed("لا", 0);                                   // مفتاح b بتخطيطٍ عربيّ
  for (const [k, t] of burst) got = asm2.feed(k, t + 15);
  got = asm2.feed("Enter", 75);
  check("مفتاح «لا» (محرفان) يدخل الدفعة ولا يُرمى", got === "لا٤٤١٧");
  // `layoutFix` للحروف و`normalizeDigits` للأرقام — كلٌّ بابُه، كما بترويسة
  // `arabicLayout.ts`. فالمخرَجُ هنا «b» + أرقامٌ شرقية، و`matchCode` تكملها.
  check("  وبعكس التخطيط يصير مفتاحُ «لا» حرفَ b", pc2.layoutFix(got) === "b٤٤١٧");
  check("  والنجدةُ تلقى صاحبَه", pc2.rescueScan(P2, got)?.product.id === "q2");

  const asm3 = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  asm3.feed("Shift", 0); asm3.feed("F1", 5); asm3.feed("Up", 10); asm3.feed("Home", 15);
  asm3.feed("1", 20); asm3.feed("2", 30); asm3.feed("3", 40);
  check("وأسماءُ مفاتيح التحكّم تبقى مرميّة («F1» و«Up» محرفان أيضاً)",
    asm3.feed("Enter", 50) === "123");
}


/* ── حقلُ بحث المخزون بلا طبقةِ نجدة (س٨) ────────────────────────────────
 * البحثُ هناك `codeMatcher` — احتواءٌ مطبَّع. ورمزُ ١٤ خانة (GTIN-14) لا يكون
 * جزءاً من ١٣ مخزونة، ورأسُ AIM يزيده بعداً، وذيلٌ ناقصُ رقمٍ لا يُطابَق.
 * فتقول الشاشةُ «لا نتائج» عن مادّةٍ بالرفّ — وهذه بالذات شاشةُ القرار الذي
 * قِسناه: «هذي المادّة غير مُدخَلة ⇒ أُدخلها من جديد» ⇒ توأمٌ يقسم الرصيد. */
console.log("▸ نجدةُ حقل بحث المخزون");
{
  const pc3 = await load("src/lib/productCodes.ts", [stubs], { "@/lib/utils": "./src/lib/utils.ts" });
  const P3 = [
    { id: "i1", name: "أموكسيسيلين", barcode: "6221031492405", alt_codes: [] },
    { id: "i2", name: "فيتامين", barcode: "0045496830434", alt_codes: [] },
    { id: "i3", name: "شامبو", barcode: "SH-14", alt_codes: ["9781234567897"] },
  ];
  // غيابُ الدالّة فشلٌ يُقال، لا انهيارٌ يقطع بقيّةَ الحزمة.
  const one = (q) => (typeof pc3.codeRescue === "function"
    ? pc3.codeRescue(P3, q).map((p) => p.id).join(",") : "«codeRescue غير مصدَّرة»");

  check("«0 + EAN-13» ملصوقاً بحقل البحث يُظهر المنتج", one("06221031492405") === "i1");
  check("ورأسُ AIM كذلك", one("]C16221031492405") === "i1");
  check("وUPC-A بـ١٢ خانة يلقى المخزونَ بـ١٣", one("045496830434") === "i2");
  check("والرمزُ الإضافي يُلقى مثلَ الأساسي", one("]C19781234567897") === "i3");
  /* والذيلُ المقطوع ليس من شأن هذه الطبقة: `codeMatcher` مطابقةُ **احتواء**،
   * والذيلُ جزءٌ من الرمز — فتلقاه المطابقةُ الحرفية قبل أن تُنادى النجدةُ
   * أصلاً. فحصٌ يزعم غيرَ ذلك يقيس مساراً لا تسلكه شاشة. */
  const literal = pc3.codeMatcher("221031492405");
  check("وذيلٌ ناقصُ رقمَين تلقاه المطابقةُ الحرفية — فلا نجدةَ تُنادى",
    P3.filter((p) => literal(p)).map((p) => p.id).join(",") === "i1");
  check("  والنجدةُ نفسُها لا ترجع شيئاً عنه — ولا تخترع صاحباً", one("221031492405") === "");
  check("ورمزٌ لا يخصّ أحداً لا يُخترع له صاحب", one("1112223334445") === "");
  check("وكلمةٌ قصيرة لا تدخل قناةَ الرموز أصلاً", one("شامبو") === "" && one("SH-14") === "");
  check("وفارغٌ لا يرمي", one("") === "" && one(null) === "");
  check("والتباسٌ لا يُحسم بالتخمين",
    typeof pc3.codeRescue === "function" && pc3.codeRescue([{ id: "a", barcode: "1121031492405", alt_codes: [] },
                    { id: "b", barcode: "2221031492405", alt_codes: [] }], "21031492405").length === 0);

  const inv = readFileSync("src/pages/Inventory.tsx", "utf8");
  const uses = inv.split("codeRescue(").length - 1;
  check("وأربعةُ حقول بحثٍ بالمخزون تمرّ منها كلُّها", uses === 4, `${uses} موضعاً`);
  // «hits.length === 0» مقطعٌ من «companyHits.length === 0» — فيمرّ الحارسُ
  // بثلاثةٍ من أربعة. الأربعةُ تُعدّ عدّاً لا احتواءً.
  check("  والنجدةُ بعد خيبة الحرفيّ لا بدلاً منه — بالأربعة كلِّها",
    ["const searched = ql && hits.length === 0",
     "ql && companyHits.length === 0",
     "ql && sectionHits.length === 0",
     "ql && found.length === 0"].every((needle) => inv.includes(needle)));
}


/* ── ما أمسكته المراجعةُ الخصميّة على الدفعة ٥ نفسِها ─────────────────────
 * الفحصُ يُكتب مع الإصلاح، والإصلاحُ يُراجَع كما يُراجَع غيرُه. هذه أربعةُ
 * أشياءَ كانت بالدفعة قبل ساعة، كلُّها من صنفٍ واحد: **حدٌّ يُقاس بالمقياس
 * الخطأ** — محارفُ مكانَ ضغطات، ونقاطُ ترميزٍ مكانَ محارف، وفرعٌ لا يُبلَغ. */
console.log("▸ مراجعةُ الدفعة ٥ — حدودٌ تُقاس بمقياسها");
{
  const pc4 = await load("src/lib/productCodes.ts", [stubs], { "@/lib/utils": "./src/lib/utils.ts" });

  /* (١) إيموجي: طولُه محرفان ونقطتُه واحدة. كان يمرّ لأن الشرطَ «محرفان بلا
   * ASCII» — وزوجُ البدائل كلاهما فوق U+D800. وليس مفتاحاً بأيّ تخطيط. */
  const emo = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  emo.feed("😀", 0); emo.feed("1", 10); emo.feed("2", 20); emo.feed("3", 30);
  check("إيموجي لا يدخل الرمز — نقطةٌ واحدة لا نقطتان", emo.feed("Enter", 40) === "123");

  const lig = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  lig.feed("لا", 0); lig.feed("ع", 10); lig.feed("م", 20);
  check("  ورباطُ «لا» يمرّ كما كان (نقطتان)", lig.feed("Enter", 30) === "لاعم");

  /* (٢) الحدُّ بالضغطات لا بالمحارف: «لا»+«ع» ثلاثةُ محارفَ بضغطتين — أي
   * بفجوةٍ واحدة. فكان شرطُ Tab الضيّق (كلُّ الفجوات سريعة) يُرضيه إنسانٌ
   * عربيّ بفجوةٍ سريعةٍ واحدة، فيُبتلع Tab بحقل نصّ ولا ينتقل التركيز. */
  const tabAr = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  tabAr.feed("لا", 0); tabAr.feed("ع", 30);
  check("ضغطتان عربيّتان + Tab لا تُقرأ مسحة", tabAr.feed("Tab", 60) === null);
  const tabLat = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  tabLat.feed("a", 0); tabLat.feed("b", 30);
  check("  كما لا تُقرأ ضغطتان لاتينيّتان — نفسُ المقياس للتخطيطين", tabLat.feed("Tab", 60) === null);
  const tabAr3 = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  tabAr3.feed("لا", 0); tabAr3.feed("ع", 15); tabAr3.feed("م", 30);
  check("  وثلاثُ ضغطاتٍ آليّةٍ + Tab تصل", tabAr3.feed("Tab", 45) === "لاعم");

  /* (٣) والتسامحُ بالفجوات يُقسَم على الضغطات: دفعةٌ من ثماني ضغطاتٍ فأكثر
   * دفعةُ باركود، ولو أخرجت بعضُ مفاتيحها محرفَين. */
  const wide = createScanAssembler({ minLength: 3, interKeyMs: 60 });
  const keys = ["لا", "لا", "لا", "لا", "1", "2", "3", "4"];
  keys.forEach((k, i) => wide.feed(k, i * 20));
  check("ثمانِ ضغطاتٍ بأربعة رباطات = اثنا عشرَ محرفاً، والتسامحُ بالضغطات",
    wide.feed("Enter", keys.length * 20) === "لالالالا1234");

  /* (٤) وسقفُ الصيغ يُبلَغ فعلاً: فرعُ AIM يقصّ **ثلاثة** محارف لا واحداً،
   * فرأسٌ مكرَّر يولّد صيغةً بكل تكرار. التعليقُ كان يقول عكسَ ذلك. */
  const many = pc4.scanVariants("]a1".repeat(30) + "0".repeat(14));
  check("سقفُ الصيغ يُبلَغ ولا يُتجاوَز", many.length === 24, `${many.length}`);
  check("  ولا تعليقَ يزعم أن الفروعَ لا تتوالد",
    !readFileSync("src/lib/productCodes.ts", "utf8").includes("فلا تتوالد الصيغ"));

  /* (٥) وصيغُ الخادم (0172) لا تعرف تخطيطاً عربياً — والنسخةُ التجريبية
   * تمرّ من نفس الباب حتى لا تُظهر سلوكاً لا يقع بالإنتاج. */
  const withL = pc4.scanVariants("دc16221031492405");
  const noL = pc4.scanVariants("دc16221031492405", false);
  check("scanVariants بإصلاح التخطيط تلقى الرمزَ العاري", withL.includes("6221031492405"));
  check("  وبدونه لا تلقاه — مرآةُ ما يفعله الخادم", !noL.includes("6221031492405") && noL.length === 0);
  check("  ورمزٌ لاتينيٌّ سواءٌ بالوجهين",
    JSON.stringify(pc4.scanVariants("]C16221031492405")) === JSON.stringify(pc4.scanVariants("]C16221031492405", false)));

  /* (٦) و«يحمل هذا الرمزَ حرفياً؟» — بها تعرف الشاشةُ أن ما مُسح ليس رمزَ
   * المنتج المخزون، فتقولها بدل أن تصمت. */
  const p = { id: "x", name: "ن", barcode: "6221031492405", alt_codes: ["ALT-1"] };
  check("carriesCode: الرمزُ الأساسيُّ يُعرف", pc4.carriesCode(p, "6221031492405") === true);
  check("  والإضافيُّ كذلك، مطويَّ الحالة", pc4.carriesCode(p, "alt-1") === true);
  check("  وصيغةٌ ليست رمزَه", pc4.carriesCode(p, "06221031492405") === false);
  check("  وفارغٌ لا يُعدّ حملاً", pc4.carriesCode(p, "") === false);
}


/* ── سقفُ سطر السلّة: ما أُضيف يُقال، ولا بيبَ على لا شيء (س١) ─────────────
 * كان القصُّ صامتاً والتحذيرُ مشروطاً بـ`n > 1`، ونغمةُ النجاح تسبق الإضافة.
 * فمسحةٌ مفردة على سطرٍ عند سقف رصيده: لا تغيير، ولا رسالة، وبيبُ نجاح ووميضُ
 * سطر. الكاشير يعدّ بالبيبات فيسمع سبعاً والفاتورة فيها خمسة. */
console.log("▸ capAdd/unitCap — السقفُ يُبلَّغ ولا يُبتلع");
{
  const { unitCap, capAdd } = await load("src/lib/cartCap.ts");

  // الحالةُ التي كانت تصمت: سطرٌ عند سقفه ومسحةٌ مفردة
  const atCap = capAdd(5, 1, 5);
  check("سطرٌ عند السقف + مسحةٌ مفردة: لا شيء يُضاف", atCap.added === 0);
  check("  والكميةُ لا تتغيّر", atCap.next === 5);
  check("  ويُقال «قُصّ» — هذه التي كانت تُبتلع", atCap.clamped === true);

  const partial = capAdd(3, 5, 5);
  check("وطلبٌ يتجاوز السقف يُضيف المتاح ويُقال", partial.added === 2 && partial.next === 5 && partial.clamped === true);
  const fits = capAdd(1, 2, 5);
  check("وطلبٌ ضمن السقف يمرّ بلا تحذير", fits.added === 2 && fits.next === 3 && fits.clamped === false);
  const fresh = capAdd(0, 1, 5);
  check("وسطرٌ جديد يبدأ بواحدة", fresh.added === 1 && fresh.next === 1 && fresh.clamped === false);
  const free = capAdd(9, 4, Infinity);
  check("وبلا سقف (خدمة/راجع) لا قصَّ ولا تحذير", free.added === 4 && free.next === 13 && free.clamped === false);
  const zero = capAdd(0, 1, 0);
  check("وسقفٌ صفر: لا يُضاف شيء ويُقال", zero.added === 0 && zero.next === 0 && zero.clamped === true);

  // سقفُ السطر بوحدته
  check("unitCap: راجعٌ بلا سقف", unitCap({ ret: true, stock: 2 }) === Infinity);
  check("  وخدمةٌ (stock=null) بلا سقف", unitCap({ stock: null }) === Infinity);
  check("  وعلبٌ كسريّ يُقرَّب للأسفل", unitCap({ stock: 4.8 }) === 4);
  check("  والوزنُ لا يُقرَّب — نصفُ كيلو نصفٌ", unitCap({ stock: 0.5, byWeight: true }) === 0.5);
  check("  والوحدةُ الفرعية تضرب بعدد الحبّات", unitCap({ stock: 3, saleUnit: "sub", unitsPerBox: 10 }) === 30);
  check("  وunitsPerBox صفرٌ لا يُصفّر السقف", unitCap({ stock: 3, saleUnit: "sub", unitsPerBox: 0 }) === 3);

  // خواصُّ تصحّ دائماً — لا حالاتٌ عرفناها وحدها. البذرةُ ثابتة فالفشلُ يُعاد.
  let seed = 20260909;
  const rnd = () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));
  const pick = (arr) => arr[int(0, arr.length - 1)];
  let bad = 0;
  for (let i = 0; i < 4000; i++) {
    const cap = pick([0, 1, 5, 17, 100, Infinity, int(0, 50)]);
    const cur = int(0, Math.min(50, Number.isFinite(cap) ? cap : 50));
    const n = int(1, 25);
    const r = capAdd(cur, n, cap);
    if (r.added < 0) bad++;                                     // لا نقصانَ بزيادة
    else if (r.next !== cur + r.added) bad++;                   // الحسابُ متّسق
    else if (Number.isFinite(cap) && r.next > cap) bad++;        // لا تجاوزَ للسقف
    else if (r.added > n) bad++;                                 // لا هبةَ فوق المطلوب
    else if (r.clamped !== (Number.isFinite(cap) && cur + n > cap)) bad++;
    else if (!r.clamped && r.added !== n) bad++;                 // بلا قصٍّ يُضاف كلُّ المطلوب
  }
  check("و٤٠٠٠ حالةٍ عشوائية: لا تجاوزَ سقفٍ ولا زيادةَ صامتة", bad === 0, `${bad} خرقاً`);

  // والمكوّنُ يستعمل هذا الحساب لا نسخةً ثانية
  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  check("وشاشةُ البيع تستورد الحساب ولا تعيد كتابته",
    sb.includes('from "@/lib/cartCap"') && !sb.includes("const unitCap = (l: Line)"));
  check("  والتحذيرُ يتبع القصَّ لا الجملة — كان مشروطاً بـ«n > 1» وحدها",
    sb.includes("if (clamped) {"));
  check("  ونغمةُ النجاح مشروطةٌ بأن شيئاً أُضيف فعلاً",
    /added !== null && added > 0/.test(sb) && !/playSuccess\(\);\s*[\r\n]+\s*addProduct/.test(sb));
}


/* ── حكمُ «رصيده صفر» يُراجَع على الخادم قبل أن يصير نهائياً (س٢) ──────────
 * القائمةُ تُحمَّل مرّةً عند فتح الشاشة، ولا تُحدَّث إلا بعد بيعةٍ مكتملة. فمديرٌ
 * رصّد شراءً ظهراً من جهازه: كلُّ مسحةٍ بالكاشير تُرفض «رصيده صفر» والمخزنُ
 * يقول موجود. والعيادةُ تتعلّم ألّا تصدّق الشاشة — فتعيد إدخال بضاعةٍ موجودة،
 * وهذا بابُ التوائم من جهته الأخرى. */
console.log("▸ رصيدُ الصفر — يُسأل الخادمُ قبل الرفض، و«ما وصلنا» غيرُ «ما عندك»");
{
  const { outOfStock, zeroStockVerdict } = await load("src/lib/cartCap.ts");

  check("رصيدٌ صفر = لا بيع", outOfStock({ stock: 0 }) === true);
  check("  وسالبٌ كذلك", outOfStock({ stock: -2 }) === true);
  check("  وnull كصفر", outOfStock({ stock: null }) === true);
  check("  وواحدةٌ تكفي", outOfStock({ stock: 1 }) === false);
  check("والمجمَّع لا يُمنع — رصيدُه بالقسم لا بالصفّ", outOfStock({ stock: 0, pooled: true }) === false);
  check("والموزونُ لا يُمنع — كسريٌّ بطبعه", outOfStock({ stock: 0, sold_by_weight: true }) === false);
  check("ووضعُ الراجع لا يقيّده رصيد", outOfStock({ stock: 0 }, true) === false);
  check("وعلبةٌ ناقصة فيها حبّاتٌ تُباع", outOfStock({ stock: 0.2, has_sub_unit: true, units_per_box: 10 }) === false);
  check("  وأقلُّ من حبّةٍ واحدة لا تُباع", outOfStock({ stock: 0.05, has_sub_unit: true, units_per_box: 10 }) === true);

  /* الحالةُ التي طلبتها الخطة بالنصّ: قائمةٌ رصيدُها صفر وريبو يرجع رصيداً. */
  check("قائمةٌ صفرٌ + خادمٌ يقول «سبعة» ⇒ بيعٌ لا رفض",
    zeroStockVerdict({ stock: 7 }, true) === "sell-fresh");
  check("  وسؤالٌ أجاب بصفرٍ ⇒ رفضٌ مؤكَّد", zeroStockVerdict({ stock: 0 }, true) === "refuse-confirmed");
  check("  ومنتجٌ لم يعد بالخادم ⇒ رفضٌ مؤكَّد", zeroStockVerdict(undefined, true) === "refuse-confirmed");
  check("  وسؤالٌ لم يصل ⇒ «آخرُ تحديثٍ عندنا» لا «رصيدك صفر»",
    zeroStockVerdict(undefined, false) === "refuse-stale");
  check("  وصفٌّ طازجٌ وصل رغم فشل الختم يُصدَّق", zeroStockVerdict({ stock: 3 }, false) === "sell-fresh");
  check("والمجمَّعُ الطازج يُباع وإن كان رصيدُ صفّه صفراً",
    zeroStockVerdict({ stock: 0, pooled: true }, true) === "sell-fresh");

  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  check("وشاشةُ البيع تسأل الخادمَ بمهلةٍ قبل الرفض",
    /fresh = await withTimeout\(repo\.getProductByBarcode\(code, clinicId\), 6000\)/.test(sb));
  check("  وتبيع بالصفّ الطازج لا بالبائت", sb.includes("addProduct(fresh, n)"));
  check("  والحكمُ من الوحدة المفحوصة لا نسخةٍ محلّية",
    sb.includes("outOfStock(product, retMode)") && !sb.includes("const isNoStock"));
}


/* ── شاشةُ الشراء ترى ما تراه شاشةُ البيع (س٣) ────────────────────────────
 * كانت `scanAdd` تعرف مطابقةً تامّةً واسماً ولا شيءَ بينهما — بلا `rescueScan`
 * ولا `matchTruncatedCode`. فماسحٌ مضبوطٌ على AIM أو GTIN-14 كان يُنشئ
 * **توأماً** بكلّ استلامِ بضاعة: البيعُ تنقذه النجدةُ فيبيع من الأصل، والتوأمُ
 * يحمل الرصيدَ الجديد والأصلُ يبقى صفراً — فكلُّ مسحةِ بيعٍ تقول «رصيده صفر»
 * والمادّةُ بالرفّ. هذا هو باب «المنتج اختفى» الذي بقي مفتوحاً بعد إغلاقه
 * بشاشة البيع وحدها. ورأسُ AIM أخطرُ من ذلك: `]` ليست من محارف الباركود،
 * فالرمزُ كان يسقط إلى فرع **الاسم** فيُنشأ منتجٌ اسمُه «]C16221…».  */
console.log("▸ مسحةُ الشراء — نفسُ طبقات النجدة، ورمزٌ لا يصير اسماً");
{
  const pc = await load("src/lib/productCodes.ts", [stubs], { "@/lib/utils": "./src/lib/utils.ts" });
  const { rescueScan, matchTruncatedCode } = pc;
  // غيابُ الدالّة فشلٌ يُقال، لا انهيارٌ يقطع بقيّةَ الحزمة.
  const stripAim = typeof pc.stripAim === "function" ? pc.stripAim : () => "«stripAim غير مصدَّرة»";
  const P = [
    { id: "p1", name: "أموكسيسيلين", barcode: "6221031492405", alt_codes: [] },
    { id: "p2", name: "فيتامين", barcode: "0045496830434", alt_codes: [] },
    { id: "p3", name: "شامبو", barcode: "SH-14", alt_codes: ["9781234567897"] },
  ];

  // رأسُ AIM يُقشَّر قبل أي حكم
  check("«]C1» + ١٣ رقماً يُقشَّر إلى الرمز نفسِه", stripAim("]C16221031492405") === "6221031492405");
  check("و«]E0» كذلك", stripAim("]E06221031492405") === "6221031492405");
  check("ورمزٌ بلا رأسٍ لا يُقصّ", stripAim("6221031492405") === "6221031492405");
  check("و«]» وحدها لا تُقصّ (ليست رأسَ AIM)", stripAim("]622103") === "]622103");
  check("وفارغٌ يبقى فارغاً لا يرمي", stripAim(null) === "" && stripAim(undefined) === "");

  // والمسحةُ بعد التقشير تلقى المنتجَ القائم — لا سطراً جديداً
  check("«]C1 + ١٣ رقماً» يلقى المنتجَ القائم بالمشتريات",
    rescueScan(P, "]C16221031492405")?.product.id === "p1");
  check("و«0 + EAN-13» (GTIN-14) يلقاه أيضاً",
    rescueScan(P, "06221031492405")?.product.id === "p1");
  check("وUPC-A ممسوحاً (١٢ رقماً) على منتجٍ مخزونٍ بـEAN-13",
    rescueScan(P, "045496830434")?.product.id === "p2");
  check("والرمزُ الإضافي ينقذ مثلَ الأساسي",
    rescueScan(P, "]C19781234567897")?.product.id === "p3");
  check("ومسحةٌ بلا رأسها تُطابَق بذيلها",
    matchTruncatedCode(P, "221031492405")?.id === "p1");
  check("ورمزٌ لا يخصّ أحداً لا يُنقذ — سطرٌ جديد هو الصواب",
    rescueScan(P, "]C11111111111111") === undefined && matchTruncatedCode(P, "1111111111111") === undefined);

  // والشاشةُ توصِل هذه الطبقات فعلاً — لا تعرفها ولا تناديها
  const src = readFileSync("src/components/inventory/Purchases.tsx", "utf8");
  check("وشاشةُ الشراء تنادي طبقاتِ النجدة قبل فرع الاسم",
    src.includes("rescueScan(products, raw)") && src.includes("matchTruncatedCode(products, raw)"));
  check("  وتقشّر رأسَ AIM قبل حكم «رمزٌ أم اسم»",
    src.includes("stripAim(raw)") && !src.includes("function stripAim"));
}


/* ── باركودُ الخدمات يطبّع كما يطبّع باركودُ المنتجات (س٤) ────────────────
 * `cleanBarcode` كانت تحذف كلَّ محرفٍ ليس لاتينيّاً قبل أي تطبيع — فـ«٧٧٠٩٩»
 * تصير سلسلةً فارغة ⇒ null ⇒ الخدمةُ «غير موجودة»، ومسحةُ الخدمة تسقط إلى
 * «هذا الرمز مو بمخزنك». وهذا هو الصنفُ الذي تحرّمه CLAUDE.md §٣ بالنصّ:
 * تطبيعُ طرفٍ دون أخيه أسوأ من لا تطبيع، يفشل بصمتٍ ويبدو أنه يعمل. */
console.log("▸ باركود الخدمات — نفسُ تطبيع المنتجات");
{
  const mem = new Map();
  globalThis.localStorage = {
    getItem: (k) => (mem.has(k) ? mem.get(k) : null),
    setItem: (k, v) => { mem.set(k, String(v)); },
    removeItem: (k) => { mem.delete(k); },
    clear: () => mem.clear(),
    key: (i) => [...mem.keys()][i] ?? null,
    get length() { return mem.size; },
  };
  mem.set("vp_services_svc-clinic", JSON.stringify({
    categories: [{ id: "c1", name: "فحوص" }],
    services: [
      { id: "s1", category_id: "c1", name: "فحص عام", price: 5000, barcode: "77099" },
      { id: "s2", category_id: "c1", name: "قص أظافر", price: 3000, barcode: "W90" },
      { id: "s3", category_id: "c1", name: "استشارة", price: 2000, barcode: null },
    ],
  }));

  const svcStub = {
    name: "svcstub",
    setup(b) {
      const map = {
        "./clinics": "export const getActiveClinicId = () => 'svc-clinic';",
        "./clinicSync": "export const sb = () => null; export const cloudWrite = async () => {};"
          + " export const registerHydrator = () => {}; export const registerReset = () => {};",
      };
      b.onResolve({ filter: /^\.\/(clinics|clinicSync)$/ }, (a) => ({ path: a.path, namespace: "svc" }));
      b.onLoad({ filter: /.*/, namespace: "svc" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    },
  };

  const svc = await load("src/lib/services.ts", [stubs, svcStub], { "@/lib/utils": "./src/lib/utils.ts" });

  check("رمزٌ لاتينيّ يلقى خدمتَه", svc.findServiceByBarcode("77099")?.id === "s1");
  check("وأرقامٌ شرقية «٧٧٠٩٩» تلقى «77099» — هذه التي كانت تسقط", svc.findServiceByBarcode("٧٧٠٩٩")?.id === "s1");
  check("وأرقامٌ فارسية «۷۷۰۹۹» كذلك", svc.findServiceByBarcode("۷۷۰۹۹")?.id === "s1");
  check("ومحرفٌ خفيّ بأوّل الرمز لا يمنع المطابقة", svc.findServiceByBarcode("‏77099")?.id === "s1");
  check("ومسافاتٌ حول الرمز تُطبَّع", svc.findServiceByBarcode("  77099 ")?.id === "s1");
  check("وحالةُ الأحرف مطويّة على الطرفين: «w90» تلقى «W90»", svc.findServiceByBarcode("w90")?.id === "s2");
  check("ورمزٌ لا يخصّ خدمةً لا تُخترع له خدمة", svc.findServiceByBarcode("999999") === null);
  check("وخدمةٌ بلا رمز لا تُطابَق بالفراغ", svc.findServiceByBarcode("") === null);
  check("والتصادمُ يُكشف بالتطبيع نفسِه", svc.serviceBarcodeTaken("٧٧٠٩٩") === true);
  check("  ويُستثنى صاحبُ الرمز نفسُه", svc.serviceBarcodeTaken("٧٧٠٩٩", "s1") === false);
  check("  و«w90» يصطدم بـ«W90»", svc.serviceBarcodeTaken("w90") === true);
}

console.log(`\n${fails ? "✗" : "✓"} scan-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
