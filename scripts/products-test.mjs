/* ============================================================================
 * فحص رموز المنتج — حارسُ «موجود عندك أصلاً».
 *
 * الحقيقة المقيسة من الإنتاج: المنتج له رمزٌ واحد بالنظام وعدّة رموز بالواقع.
 * ٢٨١ منتجاً بأربع عيادات رمزُه يدويّ (`00`، `247`، `w90`)، فيُمسح باركودُ
 * المصنع فلا يُطابق، فتُعاد المادةُ بصفٍّ جديد. والدفاعُ عند الإدخال هو
 * findByCode: قبل أن يُحفظ منتجٌ نفحص المخزن بالرمز **المطبَّع على الطرفين**.
 * هذا الفحص يحرس ذلك التطبيع — لو رجع أحدٌ فقارن الخام بالخام، ينكسر البناء.
 *
 *   node scripts/products-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, readdirSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
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
    // "@/types" is types-only; any import of it resolves to nothing.
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
  },
};

const built = await esbuild.build({
  entryPoints: ["src/lib/productCodes.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs],
  alias: { "@/lib/utils": "./src/lib/utils.ts" },
});
const mod = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);
const { findByCode, looksLikeShelfCode, twinsByName, nearCodeTwin, scanVariants, rescueScan, codeIndex, layoutFix, excelArtifact, hasArabicLetters, looksLayoutMangled, codeMatcher } = mod;

const P = (id, name, barcode, extra = {}) => ({ id, name, barcode, stock: 1, ...extra });
const inv = [
  P("a", "مغلفات مياو مارت بالدجاج واليقطين", "6970967772736"),
  P("b", "سبري حشرات خارجية", "247"),                       // رقم رفّ يدوي
  P("c", "دراي فود فرنسي 3 كيلو كتن", "8436611140873", { alt_codes: ["8436611140897"] }),
  P("d", "عضاضة كلاب", "‏8989"),                        // علامة اتجاه غير مرئية (حالة حقيقية)
  P("e", "سبري حشرات خارجيه", null),                         // توأمٌ بالاسم بلا رمز
  P("f", "منتج مجمّع", "555", { pooled: true }),
];

console.log("▸ findByCode — الرمز موجودٌ عندك؟");
check("الباركود الحقيقي يُلقى", findByCode(inv, "6970967772736")?.id === "a");
check("والأرقام العربية تُطابق اللاتينية: «٢٤٧» تلقى 247", findByCode(inv, "٢٤٧")?.id === "b");
check("والمسافات لا تمنع المطابقة", findByCode(inv, " 247 ")?.id === "b");
check("والرمزُ الإضافي (alt_codes) يُلقى مثل الأساسي", findByCode(inv, "8436611140897")?.id === "c");
check("والرمزُ المخزون بعلامةِ اتجاهٍ يُلقى بمسحةٍ نظيفة", findByCode(inv, "8989")?.id === "d");
check("ورمزٌ غير موجود يرجع undefined", findByCode(inv, "0000000000000") === undefined);
check("والفارغ لا يطابق شيئاً (وإلا طابق كلَّ منتجٍ بلا رمز)", findByCode(inv, "") === undefined && findByCode(inv, null) === undefined);
check("نموذجُ التعديل: المنتج لا يتعارض مع نفسه", findByCode(inv, "247", "b") === undefined);
check("لكنه يتعارض مع غيره حتى عند التعديل", findByCode(inv, "247", "a")?.id === "b");

console.log("▸ looksLikeShelfCode — رقمُ رفٍّ لا باركودُ مصنع");
for (const c of ["00", "247", "w90", "يليب", "1", "9300", "٢٤٧"]) check(`«${c}» يبدو رقمَ رفّ`, looksLikeShelfCode(c) === true);
for (const c of ["6970967772736", "8436611140873", "12345678", "854871008562"]) check(`«${c}» باركودُ مصنع`, looksLikeShelfCode(c) === false);
check("والفارغ ليس رقمَ رفّ (لا تنبيهَ على خانةٍ فارغة)", looksLikeShelfCode("") === false && looksLikeShelfCode(null) === false);

console.log("▸ twinsByName — توأمٌ بالاسم للدمج");
const norm = (s) => String(s).replace(/[أإآ]/g, "ا").replace(/ة/g, "ه").replace(/ى/g, "ي").replace(/\s+/g, "").toLowerCase();
check("«خارجية» و«خارجيه» توأمان", twinsByName(inv, inv[1], norm).map((p) => p.id).join() === "e");
check("والمنتج ليس توأمَ نفسه", !twinsByName(inv, inv[1], norm).some((p) => p.id === "b"));
check("ومنتجٌ فريدُ الاسم بلا توائم", twinsByName(inv, inv[0], norm).length === 0);

console.log("▸ nearCodeTwin — رمزٌ يفرق بخانة عن رمزٍ قائم (حالات الإنتاج)");
const inv2 = [
  P("m", "مكافات قطط Mooiiy", "8680542871683"),
  P("k", "دراي فود فلوكي كتن", "8680542871133"),
  P("s", "سبري", "1003"),
  P("t", "توأم بالرمز الإضافي", "999999999", { alt_codes: ["6263188400206"] }),
];
check("رقمٌ علق قبل المسح: «18680542871683» يلقى 8680542871683", nearCodeTwin(inv2, "18680542871683")?.id === "m");
check("ورقمٌ زائد بالذيل: «86805428716830» يلقاه أيضاً", nearCodeTwin(inv2, "86805428716830")?.id === "m");
check("والماسح بلع الخانة الأخيرة: «868054287113» يلقى 8680542871133", nearCodeTwin(inv2, "868054287113")?.id === "k");
check("والرمزُ الإضافي يُحسب: «62631884002061» يلقى صاحب 6263188400206", nearCodeTwin(inv2, "62631884002061")?.id === "t");
check("والأرقامُ العربية تُطبَّع قبل المقارنة", nearCodeTwin(inv2, "١٨٦٨٠٥٤٢٨٧١٦٨٣")?.id === "m");
check("أرقامُ الرفوف القصيرة ليست أخطاء: «10030» لا ينبّه على 1003", nearCodeTwin(inv2, "10030") === undefined);
check("والرمزُ المطابق تماماً ليس «قريباً» (ذاك شأن findByCode)", nearCodeTwin(inv2, "8680542871683") === undefined);
check("ورمزٌ بعيد لا ينبّه", nearCodeTwin(inv2, "5012144935648") === undefined);
check("ونموذجُ التعديل: المنتج لا يقارَن بنفسه", nearCodeTwin(inv2, "18680542871683", "m") === undefined);
check("والفارغ لا ينبّه", nearCodeTwin(inv2, "") === undefined && nearCodeTwin(inv2, null) === undefined);

console.log("▸ الثوابت");
check("الرمزُ الحقيقي المقيس على الإنتاج (13 رقماً) ليس رقمَ رفّ", !looksLikeShelfCode("6970967772736"));
check("رمزٌ بعلامةِ اتجاه + أرقامٍ عربية يُطبَّع مرّةً واحدة ثم يثبت",
  findByCode([P("z", "x", "‏٢٤٧")], "247")?.id === "z");


/* ── نجدةُ المسحة: الماسحُ لوحةُ مفاتيح، وما يكتبه ليس دائماً ما طُبع ─────────
 * بلاغُ عيادة: باركودٌ مخزونٌ حرفياً (٥٩٠٦٧٣١٥٠١٨٧٦، رصيد ٩١) «ما يبيع».
 * الصيغُ البديلة المعقولة تُجرَّب بعد فشل المطابقة الحرفية، على مخزن العيادة
 * وحده، ومطابقةٌ واحدةٌ فقط تُقبل — اثنتان التباسٌ فتبقى النافذة. */
console.log("▸ scanVariants — الصيغُ البديلة بلا الرمزِ نفسه");
const V = (c) => scanVariants(c);
check("رمزٌ نظيف ١٣ رقماً: لا صيغَ بديلة (لا تخمينَ بلا سبب)", V("5906731501876").length === 0);
check("بادئةُ AIM «]E0» تُنزع", V("]E05906731501876").includes("5906731501876"));
check("GTIN-14 بصفرٍ أوّل → EAN-13", V("05906731501876").includes("5906731501876"));
check("UPC-A (١٢) → يُجرَّب بصفرٍ أوّل", V("681290601301").includes("0681290601301"));
check("EAN-13 بصفرٍ أوّل → يُجرَّب UPC-A", V("0681290601301").includes("681290601301"));
check("الرمزُ نفسُه لا يُعاد ضمن الصيغ", !V("05906731501876").includes("05906731501876"));
check("رمزُ رفٍّ قصير: لا صيغ", V("247").length === 0);

console.log("▸ rescueScan — مطابقةٌ واحدة أو لا شيء");
const shelf = [
  P("m", "معلبات لون ازرق 4 ب5", "5906731501876", { stock: 91 }),
  P("u", "مغلفات يوزي", "0764046650536"),
];
check("«]E0» + الباركود المخزون → نفسُ المنتج", rescueScan(shelf, "]E05906731501876")?.product.id === "m");
check("ويقول أيَّ صيغةٍ أصابت", rescueScan(shelf, "]E05906731501876")?.via === "5906731501876");
check("GTIN-14 بصفر → المنتج", rescueScan(shelf, "05906731501876")?.product.id === "m");
check("UPC-A ممسوح ومخزونٌ بصفرٍ أوّل → المنتج", rescueScan(shelf, "764046650536")?.product.id === "u");
check("المطابقةُ الحرفية ليست شغلَها (تُرجع لا شيء — المسارُ الأصليّ يتكفّل)", rescueScan(shelf, "5906731501876") === undefined);
check("رمزٌ لا يشبه شيئاً → لا شيء", rescueScan(shelf, "9999999999999") === undefined);
// صيغةٌ بديلة تصيب منتجين = التباس: النافذةُ أصدق من تخمينٍ يبيع الخطأ.
check("صيغةٌ تصيب منتجَين → لا شيء (لا نبيع بالتخمين)",
  rescueScan([P("d1", "١", "0111111111111"), P("d2", "٢", "0111111111111")], "111111111111") === undefined);
check("  ونفسُ الصيغة بمنتجٍ واحد → تصيبه", rescueScan([P("d1", "١", "0111111111111")], "111111111111")?.product.id === "d1");

/* ── فهرسُ الرموز: الأساسيّ والإضافيّ معاً، وقاعدةُ أولويةٍ تقرّر أين تُرصَّد
 *    البضاعةُ الداخلة. شاشةُ المشتريات كانت تفهرس `barcode` وحده، فمسحُ باركود
 *    المصنع على مادّةٍ رمزُها الأساسيّ رقمُ رفّ لا يلقاها فيُنشأ توأمٌ برصيدٍ
 *    مقسوم — نفسُ دورةِ «المنتج اختفى» التي أُغلقت عند البيع. ──────────────*/
console.log("▸ codeIndex — الشراءُ يلقى ما يلقاه الكاشير");
{
  const withAlt = P("s1", "سبري حشرات", "247", { alt_codes: ["6972748378670"] });
  const plain = P("s2", "دراي فود", "8436611140873");
  const idx = codeIndex([withAlt, plain]);
  check("الرمزُ الأساسيّ يُفهرَس", idx.get("247")?.id === "s1");
  check("والرمزُ الإضافيّ يُفهرَس مثله — هذا ما كان ناقصاً", idx.get("6972748378670")?.id === "s1");
  check("والتطبيعُ يشمل الفهرس (أرقامٌ عربية)", codeIndex([P("s3", "x", "٢٤٧")]).get("247")?.id === "s3");
  check("ورمزٌ لا يخصّ أحداً لا يُخترع", idx.get("999999") === undefined);
}
{
  // رمزٌ هو باركودُ منتجٍ وإضافيٌّ لآخر: يخصّ صاحبَه الأصليّ مهما كان الترتيب.
  const owner = P("o1", "صاحب الرمز", "6263188401289");
  const borrower = P("b1", "مستعير", "555", { alt_codes: ["6263188401289"] });
  check("الأساسيّ يغلب الإضافيّ", codeIndex([borrower, owner]).get("6263188401289")?.id === "o1");
  check("  ولو جاء الأساسيُّ أوّلاً", codeIndex([owner, borrower]).get("6263188401289")?.id === "o1");
}
{
  // وعند تساوي الأساسيَّين: المصنَّفُ يغلب «بدون صنف»، ثم الأقدم.
  const bare = P("t1", "توأم بلا صنف", "777", { created_at: "2026-02-01" });
  const filed = P("t2", "توأم مصنَّف", "777", { section_id: "sec", created_at: "2026-03-01" });
  check("المصنَّفُ يغلب «بدون صنف»", codeIndex([bare, filed]).get("777")?.id === "t2");
  const older = P("t3", "أقدم", "888", { created_at: "2026-01-01" });
  const newer = P("t4", "أحدث", "888", { created_at: "2026-05-01" });
  check("  وعند التعادل الأقدم", codeIndex([newer, older]).get("888")?.id === "t3");
}

{
  // ── G7: مسخُ تخطيط الكيبورد العربي ──
  // الحالةُ الحقيقية بالإنتاج: باركودٌ كلُّه حروفٌ عربية. بعكس التخطيط يقرأ
  // رابطاً — أي أنه رمزُ QR مُسح والكيبوردُ عربي، ولم يكن باركوداً قطّ.
  const mangled = "اففحس:ظظشلاهقخسفثزؤخةظمهىنس";
  check("الرمزُ الممسوخ يرجع لاتينياً مفهوماً", layoutFix(mangled) === "https://abiroste.com/links");
  check("  ويُعرف أن فيه عربية", hasArabicLetters(mangled) === true);
  check("ولاتينيٌّ سليم لا يُمسّ", layoutFix("ABC123") === "");
  check("ورقمٌ خالص لا يُمسّ", layoutFix("8680542871133") === "");
  check("و«لا» محرفان من مفتاحٍ واحد (b) لا حرفان", layoutFix("لا") === "b");
  check("والأرقامُ العربية ليست حروفاً (تصلحها normalizeDigits)", hasArabicLetters("٨٦٨٠") === false);

  check("scanVariants تعرض الصيغةَ المصحّحة", scanVariants(mangled).includes("https://abiroste.com/links"));

  const one = P("m1", "مادّة", "https://abiroste.com/links");
  check("الممسوخُ يلقى صاحبَه الوحيد", rescueScan([one], mangled)?.product.id === "m1");
  const twoA = P("m2", "أ", "https://abiroste.com/links");
  const twoB = P("m3", "ب", null, { alt_codes: ["https://abiroste.com/links"] });
  check("  وعند التعدّد لا شيء", rescueScan([twoA, twoB], mangled) === undefined);
}
{
  // ── G8: أشكالُ إكسل — تُكشف لتُرفض، ولا تُصلَح (الأصلُ ضاع) ──
  check("صيغةٌ علمية تُكشف", excelArtifact("1.23457E+12") === "sci");
  check("  وبحرفٍ صغير كذلك", excelArtifact("1.23457e+12") === "sci");
  check("  وبأسٍّ سالب", excelArtifact("1.2E-5") === "sci");
  check("ذيلُ .0 على رقمٍ طويل يُكشف", excelArtifact("8681234567890.0") === "trailing-zero");
  check("  و.00 كذلك", excelArtifact("8681234567890.00") === "trailing-zero");
  check("وباركودٌ سليم لا يُكشف", excelArtifact("8680542871133") === null);
  check("ورقمُ رفٍّ قصير لا يُكشف", excelArtifact("247") === null);
  check("وسعرٌ بفاصلة ليس شكلَ إكسل (٥ خانات فأقلّ)", excelArtifact("1250.0") === null);
  check("والفارغُ لا يُكشف", excelArtifact("") === null && excelArtifact(null) === null);
}

{
  // ── G9: البحثُ بالرمز مصدرُه واحد ──
  // ستُّ شاشاتٍ كتبته بيدها، ولا اثنتان منها تتّفقان: البيعُ يفحص الأساسيَّ
  // والإضافيّ، وصفحةُ الشركة والصنفُ والدمجُ الأساسيَّ وحده، ونافذةُ الإسناد
  // تقارن الخامَ بالخام. وشاشتان تكذبان بطريقتين تصنعان «المادة غير مُدخَلة».
  const alt = P("g1", "دراي فود", "8436611140873", { alt_codes: ["W90", "٢٤٧٩"] });
  const hit = codeMatcher("w90");
  check("الرمزُ الإضافيّ يُلقى بالبحث (لا الأساسيّ وحده)", hit(alt) === true);
  check("  وطيُّ الحالة يعمل: «w90» تلقى «W90»", codeMatcher("W90")(alt) === true);
  check("  والأرقامُ العربية: «٢٤٧٩» تلقى «2479»", codeMatcher("2479")(alt) === true);
  check("والبحثُ جزئيّ: أربعُ خاناتٍ من ثلاثَ عشرة تكفي", codeMatcher("8436")(alt) === true);
  check("ومن وسط الرمز كذلك", codeMatcher("61114")(alt) === true);
  check("ورمزٌ غريبٌ لا يُلقى", codeMatcher("999999")(alt) === false);
  check("واستعلامٌ فارغٌ لا يطابق شيئاً (لا كلَّ شيء)", codeMatcher("")(alt) === false);
  check("  ومسافةٌ وحدها كذلك", codeMatcher("   ")(alt) === false);
  check("  ومحرفُ اتجاهٍ وحده كذلك", codeMatcher("‏")(alt) === false);
  check("ومنتجٌ بلا رمزٍ لا ينكسر", codeMatcher("247")(P("g2", "بلا رمز", null)) === false);
}

{
  // ── G7 بحقلٍ يقبل الاسمَ والرمز: مسحةٌ ممسوخة لا كلمةٌ عربية ──
  // تحذيرٌ يظهر على كلّ اسمٍ عربيّ يُعلَّم الناسُ تجاهلَه — وحارسٌ يُتجاهَل
  // أسوأ من لا حارس. فهذي الحالاتُ هي حدُّ التمييز نفسُه.
  // النصُّ الممسوخُ يُنسخ بالحرف من الإنتاج، فلا نكتب قراءتَه بيدٍ ثانية:
  // أوّلُ صياغةٍ لهذا الفحص نسخت الرمزَ بحرفٍ زائد فادّعت عطلاً لا وجودَ له.
  // الادّعاءُ هنا: يُكشف، وقراءتُه هي قراءةُ `layoutFix` نفسِها، وهي رابط.
  const prodCase = "اففحس:ظظلاشلاهقخسفثزؤخةظمهىنس";
  const read = looksLayoutMangled(prodCase);
  check("الحالةُ المقيسة بالإنتاج تُكشف", read !== "" && read === layoutFix(prodCase), JSON.stringify(read));
  check("  وقراءتُها رابطٌ لا كلام", /^https:\/\/\S+\/links$/.test(read), read);
  check("و«رويال» اسمٌ لا مسحة", looksLayoutMangled("رويال") === "");
  check("و«أموكسيسيلين» كذلك", looksLayoutMangled("أموكسيسيلين") === "");
  check("واسمٌ طويلٌ بلا مسافةٍ يُعكس حروفاً صرفة لا يُنذَر عليه", looksLayoutMangled("مستشفيات") === "");
  check("وكلمتان بمسافةٍ ليستا مسحة", looksLayoutMangled("رويال كانين للقطط") === "");
  check("والقصيرُ لا يُنذَر عليه", looksLayoutMangled("يليب") === "");
  check("ولاتينيٌّ سليم لا يُمسّ", looksLayoutMangled("8680542871133") === "");
  check("ورمزٌ ممسوخٌ فيه أرقام يُكشف", looksLayoutMangled("خ12ز34ظ56ن") === "o12.34/56k");
  check("والفارغُ لا ينكسر", looksLayoutMangled("") === "" && looksLayoutMangled(null) === "");
}

{
  // ── حارسُ الرجوع: بحثٌ بالرمز الأساسيّ وحده ممنوعٌ بالشاشات ──
  // الرجوعُ هنا صامت: الشاشةُ تعمل وتبدو صحيحة، وتكذب فقط على المنتجات التي
  // رمزُها الأساسيّ رقمُ رفّ. فالفحصُ نصّيّ لأن لا سبيلَ أرخص لكشفه.
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = `${dir}/${f}`;
    return statSync(p).isDirectory() ? walk(p) : (/\.tsx?$/.test(p) ? [p] : []);
  });
  // والنمطُ يشمل الصيغةَ الخامّة كذلك: `(p.barcode ?? "").includes(q)`. الصيغةُ
  // الأولى مسكت المطبَّعَ وحده — وأفلتت منها الشاشةُ السابعة (نافذةُ تعديل طلب
  // التوصيل) لأنها لم تكن تطبّع أصلاً. حارسٌ يمسك النسخةَ المهذّبة من العطل
  // ويترك النسخةَ الخام يعطي طمأنينةً كاذبة.
  const PATTERNS = [
    /(?:match|normalize)Code\((?:\w+\.)?barcode\)\s*\.includes\(/,   // مطبَّعٌ بطرفٍ واحد
    /\(\s*\w+\.barcode\s*\?\?\s*""\s*\)\s*\.includes\(/,             // خامٌّ بالطرفين
    /\w+\.barcode\s*\|\|\s*""\s*\)?\s*\)\.includes\(/,
  ];
  const bad = [];
  const waivers = [];
  for (const f of walk("src")) {
    if (f.endsWith("lib/productCodes.ts")) continue;              // مصدرُ الحقيقة نفسه
    const src = readFileSync(f, "utf8");
    for (const [i, line] of src.split("\n").entries()) {
      // سطرُ تعليقٍ يقتبس العطلَ ليشرحه ليس عطلاً — وإلا لمنع الحارسُ توثيقَ
      // ما يحرسه، فيُكتب بلا شرحٍ أو يُسكَت الحارس.
      const t = line.trim();
      if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*")) continue;
      /* واستثناءٌ مكتوبٌ بسببه: جداولُ ليس فيها `alt_codes` أصلاً (سجلُّ
       * المولّد مثلاً) رمزُها **هو** هويّتُها، فمطابقتُه وحدَه ليست عطلاً.
       * ويُطلب السببُ نصّاً كي لا يصير المفتاحُ بابَ إسكاتٍ للحارس. */
      const wi = line.indexOf("code-search-ok:");
      const waived = wi >= 0 && line.slice(wi + 15).trim().length > 0;
      if (waived) { waivers.push(`${f}:${i + 1}`); continue; }
      if (PATTERNS.some((re) => re.test(line))) bad.push(`${f}:${i + 1}`);
    }
  }
  check("لا شاشةَ تبحث بالرمز الأساسيّ وحده — استعمل codeMatcher", bad.length === 0, bad.join("، "));
  // والاستثناءاتُ تُعدّ: عددٌ يكبر بلا سببٍ إشارةُ حارسٍ يُلتفّ عليه.
  check("  والاستثناءاتُ المكتوبة قليلةٌ ومعدودة", waivers.length <= 2, waivers.join("، "));

  // ولا مُطبِّعَ رموزٍ مكتوبٍ بيدٍ داخل شاشةٍ تطابق الرموز. هذا العطلُ عاش
  // بـPurchases.tsx حتى الدفعة ٦: مُطبِّعٌ محلّيّ يشيل الفراغاتِ والأرقامَ
  // العربية وحدها، يسأل فهرساً مبنيّاً بـ`matchCode` — فيفشل بصمت. والقاعدةُ
  // التي تمنع عودتَه: من يستورد `productCodes` يستعمل تطبيعَها لا تطبيعَه.
  const handRolled = [];
  for (const f of walk("src")) {
    const src = readFileSync(f, "utf8");
    if (!src.includes("lib/productCodes")) continue;
    for (const [i, line] of src.split("\n").entries()) {
      if (/\[٠-٩\]\/g/.test(line)) handRolled.push(`${f}:${i + 1}`);
    }
  }
  check("  ولا مُطبِّعَ رموزٍ محلّيّ بشاشةٍ تطابق الرموز", handRolled.length === 0, handRolled.join("، "));
  // والحارسُ نفسُه يُقاس: نمطٌ لا يمسك ما وُجد فعلاً حارسٌ صوريّ.
  const SHOULD_CATCH = [
    '|| (!!cq && normalizeCode(p.barcode).includes(cq))',
    '|| matchCode(p.barcode).includes(cq)',
    '|| (p.barcode ?? "").includes(q.trim())',
    'normalizeAr(p.name).includes(s) || (p.barcode ?? "").includes(q)',
  ];
  const SHOULD_PASS = ['matchCode(p.barcode) === c', 'nset.has(matchCode(p.barcode))', 'byCode(p)'];
  check("  والحارسُ يمسك كلَّ الصيغ التي وُجدت فعلاً",
    SHOULD_CATCH.every((s) => PATTERNS.some((re) => re.test(s))));
  check("  ولا يمسك السليم", SHOULD_PASS.every((s) => !PATTERNS.some((re) => re.test(s))));
}


/* ── الرمزُ القديم لا يتبخّر عند التعديل (ح٢) ─────────────────────────────
 * كان التعديلُ يرسل الباركودَ الجديد فوق القائم بلا مقارنةٍ ولا تحذير، والقديمُ
 * لا يبقى إلا بسجلّ التدقيق سنةً بلا واجهةٍ تسترجعه. فعيادةٌ أدخلت موادَّها
 * برقم الرفّ وطبعت ملصقاته، ثم أُصلح الصفُّ بباركود المصنع ⇒ بعد أسابيع تُمسح
 * علبةٌ بملصقٍ قديم فيقول النظام «مو موجود» فتُعاد إدخالاً ⇒ توأمٌ برصيدٍ مقسوم. */
console.log("▸ keepOldCode — الرمزُ القديم ينزل رمزاً إضافياً");
{
  // غيابُ الدالّة فشلٌ يُقال، لا انهيارٌ يقطع بقيّةَ الحزمة.
  const keepOldCode = typeof mod.keepOldCode === "function" ? mod.keepOldCode : () => "«keepOldCode غير مصدَّرة»";
  const shelf = P("s1", "سبري", "247", { alt_codes: [] });
  const others = [shelf, P("s2", "غيره", "999")];

  const r = keepOldCode(shelf, "6970967772736", others);
  check("استبدالُ الرمز يحفظ القديم", r?.kept === "247");
  check("  و`alt_codes` تحمله", JSON.stringify(r?.alt_codes) === JSON.stringify(["247"]));
  check("  وبعد الحفظ يُلقى المنتجُ بالرمزين",
    findByCode([{ ...shelf, barcode: "6970967772736", alt_codes: r.alt_codes }], "247")?.id === "s1"
    && findByCode([{ ...shelf, barcode: "6970967772736", alt_codes: r.alt_codes }], "6970967772736")?.id === "s1");

  check("ومحوُ الرمز إلى فراغٍ يحفظه أيضاً — الفقدُ فقدٌ بأيّ طريق",
    keepOldCode(shelf, "", others)?.kept === "247");
  check("ورمزٌ لم يتغيّر لا يُضاعَف", keepOldCode(shelf, "247", others) === null);
  check("  ولا بحالةٍ مطويّة أو أرقامٍ شرقية", keepOldCode(P("s3", "x", "W90"), "w90", []) === null
    && keepOldCode(P("s4", "x", "247"), "٢٤٧", []) === null);
  check("ومنتجٌ بلا رمزٍ أصلاً لا شيءَ يُحفظ له", keepOldCode(P("s5", "x", null), "999888", []) === null);
  check("ورمزٌ محفوظٌ سلفاً لا يتكرّر",
    keepOldCode(P("s6", "x", "247", { alt_codes: ["247"] }), "6970967772736", []) === null);
  check("  ولا بصيغةٍ مطويّة منه",
    keepOldCode(P("s7", "x", "W90", { alt_codes: ["w90"] }), "6970967772736", []) === null);

  /* ولا يُنتزع رمزٌ صار لغيره — نفسُ الخطّ الأحمر الذي رسمته 0165 للاستعادة:
   * حفظُ رمزِنا لا يعني سرقتَه ممّن صار يملكه. */
  const stolen = [P("s1", "سبري", "247", { alt_codes: [] }), P("z", "صاحبٌ جديد", "247")];
  check("ورمزٌ صار لمنتجٍ آخر لا يُنتزع منه",
    keepOldCode(stolen[0], "6970967772736", stolen) === null);
  check("  ولو حمله الآخرُ رمزاً إضافياً",
    keepOldCode(P("s8", "x", "247"), "999", [P("s8", "x", "247"), P("y", "آخر", "111", { alt_codes: ["247"] })]) === null);

  // والشاشةُ توصّله فعلاً — بمساري التعديل كليهما
  const src = readFileSync("src/pages/Inventory.tsx", "utf8");
  check("وشاشةُ المخزون تحفظ القديم بتعديل المنتج", src.includes("keepOldCode(product, payload.barcode"));
  check("  وبتعديل المجموعة كذلك", src.includes("keepOldCode(before, rowPayload.barcode"));
  check("  وتقوله بصوت لا بصمت", src.includes("pos.oldCodeKept") && src.includes("pos.oldCodesKept"));
}

/* ── المولّد لا يكتب فوق رمزٍ رُبط من جهازٍ آخر (ح٣) ──────────────────────
 * كان التعليقُ يقول «لا تكتب فوقه» والشيفرةُ تبحث بنفس مصفوفة props البائتة —
 * فلا تسأل أحداً. وحلقةُ «ولّد للكلّ» لا تعيد الفحصَ أصلاً. */
console.log("▸ ح٣ — الشرطُ بالكتابة لا بقراءةٍ بائتة");
{
  const studio = readFileSync("src/components/inventory/BarcodeStudio.tsx", "utf8");
  const repo = (readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */;
  check("المسارُ المفرد يمرّ من الكتابة الشرطية", studio.includes("repo.assignBarcodeIfEmpty(p.id, code)"));
  check("  وحلقةُ الكلّ كذلك", studio.includes("repo.assignBarcodeIfEmpty(noBarcode[i].id, codes[i])"));
  check("  ولا كتابةَ عمياء بقيت", !studio.includes("repo.updateProduct(noBarcode[i].id, { barcode: codes[i] })"));
  check("  ولا قراءةَ من props البائتة تُسمّى «طازجة»", !studio.includes("const fresh = products.find"));
  check("والتخطّي يُقال بعدده", studio.includes("pos.skippedLinked") && studio.includes("pos.alreadyHasCode"));
  check("والشرطُ بالقاعدة بمرشّحٍ لا بقراءةٍ سابقة", repo.includes('.or("barcode.is.null,barcode.eq.")'));
  check("  ويرمي على صفرِ صفوف", repo.includes("assignBarcodeIfEmpty") && repo.includes("barcode_already_set"));
}

/* ── ع١٠: لا مسارَ سقوطٍ نصفَ مطبَّع ──────────────────────────────────── */
console.log("▸ ع١٠ — الفرعُ النائم نصفُ المطبَّع حُذف");
{
  const repo = (readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */;
  check("لا استعلامَ بديلاً يطابق matchCode بمخزونٍ خام",
    !repo.includes("alt_codes.cs.{${code}}"));
  check("وغيابُ الدالّة يُقال باسمه لا بصمت", repo.includes("lookup_fn_missing"));
  check("  وتُترجمه describeDbError", readFileSync("src/lib/errors.ts", "utf8").includes("lookup_fn_missing"));
}


/* ── الدفعة ٦: أعطالٌ منطقية متفرّقة، كلٌّ منها «قيمةٌ تُعرض غيرَ التي تُحسب» ─ */
console.log("▸ الدفعة ٦ — المعروضُ هو المحسوب");
{
  const sale = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  const inv2 = readFileSync("src/pages/Inventory.tsx", "utf8");
  const pur = readFileSync("src/components/inventory/Purchases.tsx", "utf8");
  const studio2 = readFileSync("src/components/inventory/BarcodeStudio.tsx", "utf8");

  /* م٢: منتقي الوزن كان يَعِد بسعر المفرد بينما `addWeightLine` تنشئ السطرَ
   * بـ`listPrice` — وهي بوضع الجملة **سعرُ الشراء**. فالمربّعاتُ تطبع رقماً
   * والفاتورةُ رقماً آخر، والتعليقُ فوق السطر يقول إن الغرض ألّا يختلفا. */
  check("م٢: منتقي الوزن يعرض `listPrice` لا `sell_price` الخام",
    sale.includes("line?.byWeight ? line.unit_price : listPrice(p)"));
  check("  ولا بقيّةَ للخام", !sale.includes("line?.byWeight ? line.unit_price : p.sell_price"));
  check("  والسطرُ يُنشأ بنفس الدالّة", sale.includes("perKgPrice: listPrice(p)"));

  /* م٣: رمزٌ كلُّه محارفُ اتجاهٍ يصير "" بعد التطبيع، و`trim()` لا يزيلها.
   * فخانتان «فارغتان للعين» كانتا تتطابقان فتمنعان حفظَ الدفعة كلِّها. */
  check("م٣: الفارغُ بعد التطبيع خارج فحص التكرار", inv2.includes("const ghost = pairs.find((x) => !x.norm)"));
  check("  ويُقال باسمه لا برمزٍ لا يُرى", inv2.includes("pos.ghostCode"));
  check("  والتكرارُ يُقارن بالمطبَّع", inv2.includes("const ncodes = pairs.map((x) => x.norm)"));

  /* م٤: للفراغ دلالتان بنفس الشاشة — «مدفوعٌ كامل» بالإنشاء، و«يبقى كما هو»
   * بالتعديل. والشارةُ كانت تُشتقّ بدلالة الإنشاء وحدها فتكذب على دَينٍ قائم. */
  check("م٤: المدفوعُ بالتعديل يعود لقيمة الفاتورة لا للإجمالي",
    pur.includes("editing ? Math.max(0, Math.min(total, editing.purchase.amount_paid ?? total)) : total"));
  /* والدلالتان صارتا واحدة: مسارُ الإنشاء ما عاد فيه خانةٌ فراغُها يعني شيئاً —
   * صار سؤالاً صريحاً («دفعناها كلّها» / «عليها دَين»)، فالفراغُ بقي بمعنىً
   * واحدٍ بالتعديل وحده. الحارسُ يشدّ على ذلك بدل أن يشدّ على الشكل القديم. */
  check("  والقالبُ يعرض المدفوعَ الحاليّ بالتعديل",
    pur.includes("placeholder={money(editing.purchase.amount_paid ?? total)}"));
  check("  وما عاد للفراغ دلالةٌ بالإنشاء — الاختيارُ صريح",
    /paidMode === null/.test(pur) && /paidMode === "debt" \? paidNum : total/.test(pur));

  /* م٥: الحارسُ كان يفحص القفلَ وحدَه، و`canPos` يخفي الزرَّ لا الشاشة. */
  check("م٥: الحارسُ يرى الاستحقاق لا القفلَ وحده",
    inv2.includes('else if (!canPos && view === "wholesale") setView("products")'));
  check("  و`canPos` بتبعيّات الأثر", inv2.includes("}, [locked, view, canPos]);"));
  check("  والرسمُ يشترطه أيضاً — حزامٌ ثانٍ", inv2.includes('view === "wholesale" && canPos ?'));

  /* ص٣: ثلاثةُ أبحاثٍ حرفية، ومفتاحُ اسمِ شركةٍ لا يطوي ة/ه ولا الهمزة. */
  check("ص٣: بحثُ تبويب الشركات مطبَّع", inv2.includes("companies.filter((c) => searchable(c.name).includes(ql))"));
  check("  وبحثُ فواتير الشراء كذلك", pur.includes("searchable(p.company_name ?? \"\").includes(ql)"));
  check("  وسجلُّ المولّد: الاسمُ بـsearchable والرمزُ بـmatchCode",
    studio2.includes("searchable(g.label ?? \"\").includes(nq)") && studio2.includes("matchCode(g.barcode).includes(cq)"));
  check("  ولا toLowerCase خامٌّ بقي بهذه المواضع",
    !inv2.includes("companies.filter((c) => c.name.toLowerCase().includes(ql))")
    && !pur.includes('(p.company_name ?? "").toLowerCase().includes(ql)'));
  /* كان هذا يشترط **تعريفاً محلّياً** لـ`normKey` بكلّ شاشة — وهو بعينه ما
     سمح للانحدار: وُسّع أحدُ التعريفين ولم يُوسَّع الآخر، ثم قُورن المفتاحُ
     المطبَّع بطرفٍ خام، فتكرّرت ١٠٢ شركةٍ من ١٤٣. الشرطُ انقلب: **لا تعريفَ
     محلّياً**، والمفتاحُ مستوردٌ واحدٌ من `utils` (ويحرسه group-key-parity). */
  check("  ومفتاحُ اسم الشركة مستوردٌ واحدٌ لا نسخةٌ بكلّ شاشة",
    inv2.includes("const normKey = groupKey;") && pur.includes("const normKey = groupKey;")
    && !inv2.includes("const normKey = (s: string) =>") && !pur.includes("const normKey = (s: string) =>"));
  check("  والطرفان يمرّان منه عند المقارنة (لا toLowerCase خامّ)",
    !/const key = \w+\.toLowerCase\(\)/.test(inv2) && !/const key = \w+\.toLowerCase\(\)/.test(pur));

  const { searchable } = await import(
    "data:text/javascript;base64," + Buffer.from((await esbuild.build({
      stdin: { contents: `export { searchable } from "./src/lib/utils";`, resolveDir: process.cwd(), loader: "js" },
      bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs],
    })).outputFiles[0].text).toString("base64")
  );

  /* والمفتاحُ نفسُه يُقاس سلوكياً لا نصّاً: «الشركه الامل» و«الشركة الأمل»
   * اسمٌ واحد بعين قارئه — وحارسُ التكرار كان يسمح بهما توأمَين. */
  const normKey = (s) => searchable(String(s).trim().replace(/\s+/g, " ").normalize("NFC")).replace(/\s+/g, " ").trim();
  check("و«الشركه الامل» = «الشركة الأمل» بمفتاح واحد",
    normKey("الشركه الامل") === normKey("الشركة الأمل"));
  check("  و«شركة  الأمل» بمسافتين كذلك", normKey("شركة  الأمل") === normKey("شركة الأمل"));
  check("  و«ABC» = «abc»", normKey("ABC") === normKey("abc"));
  check("  وشركتان مختلفتان تبقيان مختلفتين", normKey("الأمل") !== normKey("الوفاء"));
}


/* ── ع٥: تقريرُ الجرد يحمل الرموزَ الإضافية ──────────────────────────────
 * كان يُصدّر الرمزَ الأساسيّ وحده — والرموزُ الإضافية هي بالضبط ما تراكم من
 * علاج التوائم (رقمُ الرفّ القديم إلى جانب باركود المصنع). ودورةُ «صدّر ثم
 * أعد الإدخال» تُسقطها كلَّها، فتعود المسحةُ القديمة «مو موجودة» من جديد. */
console.log("▸ ع٥ — الرموزُ الإضافية بتقرير الجرد");
{
  // بديلُ i18n: الوحدةُ تستعمله لتسمية سطر الحوض وحدَه.
  const i18nStub = {
    name: "i18nstub",
    setup(b) {
      b.onResolve({ filter: new RegExp("^@\\/i18n$") }, () => ({ path: "i18n", namespace: "st" }));
      b.onLoad({ filter: /.*/, namespace: "st" }, () => ({
        contents: "export default { t: (k, d) => (typeof d === 'string' ? d : k) };", loader: "js",
      }));
    },
  };
  let st = null;
  try {
    const b2 = await esbuild.build({
      entryPoints: ["src/lib/stocktake.ts"], bundle: true, format: "esm", write: false,
      platform: "neutral", plugins: [stubs, i18nStub], logLevel: "silent",
      alias: { "@/lib/utils": "./src/lib/utils.ts" },
    });
    st = await import("data:text/javascript;base64," + Buffer.from(b2.outputFiles[0].text).toString("base64"));
  } catch (e) { st = null; }
  if (!st) {
    check("(تخطٍّ) ما انبنت stocktake — الفحصُ لا يقيس شيئاً", false);
  } else {
    const now = new Date("2026-09-09T00:00:00Z");
    const take = st.buildStocktake([
      { id: "x1", name: "سبري", barcode: "6970967772736", alt_codes: ["247", "SHELF-9"], purchase_price: 1, sell_price: 2, stock: 3, created_at: "2026-01-01" },
      { id: "x2", name: "بلا إضافيّ", barcode: "111", alt_codes: [], purchase_price: 1, sell_price: 2, stock: 1, created_at: "2026-01-01" },
      { id: "x3", name: "بلا حقلٍ أصلاً", barcode: "222", purchase_price: 1, sell_price: 2, stock: 1, created_at: "2026-01-01" },
    ], [], [], now);
    const lines = st.flatLines(take);
    const byId = (id) => lines.find((l) => l.productId === id);
    check("السطرُ يحمل الرموزَ الإضافية", JSON.stringify(byId("x1")?.altCodes) === JSON.stringify(["247", "SHELF-9"]));
    check("  ومنتجٌ بلا إضافيّ يحمل قائمةً فارغة", JSON.stringify(byId("x2")?.altCodes) === "[]");
    check("  وصفٌّ قديمٌ بلا الحقل لا ينكسر", JSON.stringify(byId("x3")?.altCodes) === "[]");
  }

  const xl = readFileSync("src/lib/stockReportXlsx.ts", "utf8");
  check("والورقةُ فيها عمودٌ للرموز الإضافية", xl.includes("stock.hAltCodes") && xl.includes("COL.altCodes"));
  check("  يُكتب نصّاً خامّاً كعمود الباركود — فلا يقلبه إكسل صيغةً علمية",
    xl.includes('put(at(COL.altCodes), { t: "s", v: l.altCodes.join(", "), z: "@"'));
  check("  والعمودُ المملوءُ بيدٍ يُشتقّ من الخريطة لا يُكتب رقماً",
    xl.includes("const FILL_COL = COL.actualQty.charCodeAt(0) - 65") && !xl.includes("c === 11 ? headFill"));
  check("  وآخرُ عمودٍ يطابق الخريطة", xl.includes("const LAST_COL = 20") && xl.includes('id: "U"'));
}


/* ── الدفعة ٧: العرضُ لا يكذب ولا يصمت ───────────────────────────────── */
console.log("▸ الدفعة ٧ — بطاقاتٌ توصل، وسقوفٌ تُقال، ومسحةٌ لا تُبتلع");
{
  const inv3 = readFileSync("src/pages/Inventory.tsx", "utf8");
  const sale3 = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  const store3 = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  const guard = readFileSync("scripts/i18n-guard.mjs", "utf8");

  /* ع١: البطاقةُ تعدّ ولا توصل — والشرطُ يُكتب مرّةً واحدة، وإلا قالت البطاقةُ
   * «١٢» وأظهرت القائمةُ أحدَ عشر. */
  check("ع١: شروطُ الحالة معرَّفةٌ مرّةً واحدة",
    inv3.includes("const isLow = (p: Product) =>") && inv3.includes("const isOut = (p: Product) =>")
    && inv3.includes("const isExpiringSoon = (p: Product) =>") && inv3.includes("const isExpired = (p: Product) =>"));
  check("  والبطاقةُ تعدّ بها لا بنسخةٍ ثانية",
    inv3.includes("products.filter(isLow).length") && inv3.includes("products.filter(isExpiringSoon).length"));
  check("  والشريحةُ ترشّح بنفس الخريطة", inv3.includes("searched.filter(STOCK_FILTERS[filter])"));
  check("  والبطاقتان تنقران فتضبطانها", (inv3.split('setStockFilter((cur) =>').length - 1) === 2);
  check("  والبطاقةُ ذاتُ الفعل زرٌّ حقيقيّ لا div", inv3.includes('aria-pressed={!!active}'));
  check("  والترشيحُ يقاطع البحثَ ولا يحلّ محلَّه", inv3.includes("const searched = ql && hits.length === 0"));
  check("  وشريحةٌ فارغة تُقال بلسانها", inv3.includes("pos.noneInFilter"));

  /* ع٢: الصنفُ يصل الصفَّ بالتبويب الرئيسيّ كما يصله بشاشة الشركة. */
  check("ع٢: خريطةُ الأصناف موجودة", inv3.includes("const sectionName = useMemo(() => {"));
  check("  والصفُّ يستقبلها بالتبويب الرئيسيّ",
    inv3.includes("companyName={companyName(p.company_id)} sectionName={sectionName(p.section_id)}"));

  /* ع٣: الشريحةُ لا تفيض على ٣٧٥ بكسل — والعلّةُ كانت `shrink-0`. */
  check("ع٣: شريحةُ الرموز بسقفِ عرضٍ وقصّ", inv3.includes('className="chip max-w-[12rem] min-w-0 truncate bg-warn-50'));
  check("  ولا shrink-0 بقي عليها", !inv3.includes('className="chip shrink-0 bg-warn-50'));
  check("  والرموزُ كاملةً بالـtitle", inv3.includes('title={`${p.alt_codes!.join(" · ")} — '));

  /* ع٤: سقفُ عرضٍ لا يقول إنه سقف. */
  check("ع٤: نافذةُ الدمج تعدّ المخفيّ وتقوله",
    inv3.includes("hiddenCount: Math.max(0, base.length - MERGE_CAP)") && inv3.includes("pos.mergeMoreHidden"));
  check("  وسجلُّ المتجر يسمّي سقفَه", store3.includes("const STORE_LOG_CAP = 30") && store3.includes("pos.logCap"));
  check("  ولا رقمَ عارياً بقي بالقصّ", !store3.includes("decided.slice(0, 30)"));

  /* ع٦: شاشةُ «تمّ البيع» كانت تبتلع المسحة بصمتٍ تامّ. */
  check("ع٦: المسحةُ على شاشة «تمّ» تبدأ بيعةً جديدة",
    sale3.includes("if (done) { pendingScanRef.current = code; reset(); return; }"));
  check("  وتُمرَّر بعد أن يهبط التصفير لا بنفس النبضة",
    sale3.includes("if (done || pendingScanRef.current === null) return;") && sale3.includes("void handleScan(code);"));
  check("  ولا رجوعٌ صامتٌ بقي", !sale3.includes("useBarcodeScanner(async (code) => {\n    if (done) return;"));

  /* ع٧: حارسُ «استعمالٌ مقابل كتالوج». */
  check("ع٧: الحارسُ يمسح نداءات t الحرفية", guard.includes("const KEY_CALL =") && guard.includes("usedKeys"));
  check("  وشاشاتُ البيع والمخزون سقفُها صفر", guard.includes("const HOT = new Set([") && guard.includes("hotOrphans.length"));
  check("  وما عداها دَينٌ ينكمش ولا يكبر", guard.includes("__orphanKeys") && guard.includes("الدَّينُ ينكمش ولا يكبر"));
  check("  و`retNegative` بموضعٍ واحدٍ بلا نسختَي نصّ",
    (sale3.split('t("retail.retNegative")').length - 1) === 2
    && !sale3.includes('t("retail.retNegative", "الراجع أكبر'));

  /* ع٨: علّةُ أداءٍ لا فقدانُ مسحات — والتعليقُ يقولها كي لا تُسوَّق خطأً. */
  check("ع٨: البحثُ على قيمةٍ مؤجَّلة", inv3.includes("const dq = useDeferredValue(q);"));
  check("  والنتيجةُ محفوظة", inv3.includes("const hits = useMemo(() => (ql"));
  check("  والصفُّ محفوظ", inv3.includes("const ProductRow = memo(function ProductRow"));
}

/* ── صورة المنتج (0174): مسارٌ بالقاعدة والبايتات بالمخزن ─────────────────────
 * المحروس: (١) لا بايتات بجدول — الرفعُ إلى bucket والحقلُ نصّ (درسُ base64
 * بالشعارات)؛ (٢) بطاقةُ المتجر لا تصير فارغةً أبداً — فشلُ التحميل يخفي
 * الصورةَ بـ`hidden` فيبقى رمزُ الفئة تحتها؛ (٣) فشلُ الصورة لا يضيّع المنتج. */
{
  const mig = readFileSync("supabase/migrations/0174_product_images.sql", "utf8");
  const invP = readFileSync("src/pages/Inventory.tsx", "utf8");
  const front = readFileSync("src/pages/Storefront.tsx", "utf8");
  const repoS = (readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */;
  check("0174: العمود مسارٌ نصيّ والكتلوج يرجعه", mig.includes("add column if not exists image_path text") && mig.includes("p.image_path"));
  // ملفوفةٌ بـ(select …): 0181 لفّت نداءات السياسات كلَّها — والفحصُ كان يشترط
  // الشكلَ العاريَ حرفياً، فكان يحرس العطبَ لا الصواب.
  check("  وسياسةُ الرفع تشترط مجلّدَ العيادة، بنداءٍ ملفوف", mig.includes("(storage.foldername(name))[1] = (select auth_clinic())::text"));
  check("  والرفعُ السحابيّ إلى bucket لا إلى جدول", repoS.includes('storage.from("product-images").upload'));
  check("  والنسختان التجريبية والسحابية كلتاهما تعرفان الرفع", (repoS.split("async uploadProductImage(").length - 1) === 2);
  /* كان يفحص `loading="lazy"` نصّاً — وصار التكسيلُ مشروطاً: ما فوق الطيّة
   * يُحمَّل فوراً (تكسيلُ صورة الـLCP يؤخّر الرسمَ بلا أن يوفّر شيئاً) والباقي
   * كسول. فالفحصُ على السلوك لا على السلسلة. */
  check("  وبطاقةُ المتجر: أوّلُ ما فوق الطيّة فوريّ والباقي كسول",
    /loading=\{i < 4 \? "eager" : "lazy"\}/.test(front) && front.includes('fetchPriority={i < 4 ? "high" : undefined}'));
  check("  وصورةٌ كُسرت تكشف البلاطةَ تحتها بـhidden", front.includes("e.currentTarget.hidden = true"));
  check("  والمنتجُ بلا صورةٍ بلاطةٌ مشتقّةٌ من اسمه لا إيموجي فئته",
    front.includes("shelfLook(p.name)") && front.includes("shelfLabel(p.name)"));
  /* التعليقُ نفسُه يشرح الفخّ بمثالٍ حرفيّ — فيُقشَّر قبل الفحص، وإلا أمسك
   * الحارسُ شرحَه لا العلّة. */
  const libCode = readFileSync("src/lib/storeLib.ts", "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  check("  وأصنافُ البلاطة مكتوبةٌ حرفيّةً لا مركَّبة (وإلا حذفها البناء)",
    !/(bg|text|border)-\$\{/.test(libCode));
  check("  وفشلُ الصورة معزولٌ عن حفظ المنتج ويُقال", invP.includes("pos.photoSaveFailed"));

  /* ── مكتبة الصور (0175): يبنيها المالك ويختار منها الدكتور ──────────────
   * المحروس: الاختيارُ مرجعٌ لا نسخة، و«شيل الصورة» بعيادةٍ لا يحذف ملفَ
   * المكتبة المشترك أبداً، والمنتقي قراءةٌ فقط (لا زرَّ رفعٍ فيه). */
  const mig175 = readFileSync("supabase/migrations/0175_image_library.sql", "utf8");
  const picker = readFileSync("src/components/inventory/ImageLibraryPicker.tsx", "utf8");
  check("0175: كتابةُ المكتبة وملفاتها بشرط المشغّل", mig175.includes("(select is_platform_admin())") && mig175.includes("= 'library'"));
  check("  والمنتقي بلا زرِّ رفع (قراءةٌ فقط بقرار المالك)", !/type="file"/.test(picker) && picker.includes("listImageLibrary"));
  check("  والاختيارُ مرجعٌ يُكتب كما هو لا نسخة", invP.includes("image_path: libPick"));
  check("  و«شيل الصورة» بعيادةٍ لا يحذف ملفَ المكتبة", repoS.includes('path.startsWith("library/")'));
  check("  والنسختان تعرفان المكتبة", (repoS.split("async createLibraryImage(").length - 1) === 2);
}

/* ── صدقُ المال والبحث بواجهة الستور العامّة ───────────────────────────────
 * ثلاثُ عللٍ قِيست بالشِفرة وأُصلحت، وكلُّها من صنفٍ عضّنا سابقاً:
 *   • شريطُ السلة كان يعرض `subtotal` والزبون يدفع `total` — رقمٌ معروضٌ غيرُ
 *     المدفوع، ويُكتشف عند الباب.
 *   • سطرُ التوصيل كان يختفي عند أجرةٍ صفر، فيحسب الزبون أن ما يراه ما يدفع.
 *   • البحث كان يقارن الخام بالخام: من يكتب «ادويه» لا يلقى «أدوية» — وهي
 *     «قائمةٌ ناقصة تُصدَّق»، وقاعدةُ المشروع أن الطرفين يمرّان من `searchable`.
 * والعنوانُ صار إلزامياً: طلبُ توصيلٍ بلا وجهةٍ ناقصٌ بتعريفه. */
console.log("▸ الستور العام — الرقم المعروض هو المدفوع، والبحث يطبّع الطرفين");
{
  const sf = readFileSync("src/pages/Storefront.tsx", "utf8");

  // شريطُ السلة العائم وحدَه (بين تعليقه وتعليق لوحة السلة)
  const barStart = sf.indexOf("شريط السلة العائم");
  const barEnd = sf.indexOf("لوحة السلة / الإتمام");
  const bar = barStart >= 0 && barEnd > barStart ? sf.slice(barStart, barEnd) : "";
  check("شريطُ السلة يعرض المبلغ المدفوع", bar.includes("money(total)") && !bar.includes("money(subtotal)"), `${bar.length} حرفاً`);

  check("وسطرُ التوصيل ما عاد يختفي عند أجرةٍ صفر", !/\{fee > 0 && <p/.test(sf));
  check("  ومعنى «الأجرة معلومة» مصدرُه واحدٌ يقرؤه الهيرو والورقتان",
    (sf.split("feeKnown").length - 1) >= 6 && sf.includes("const feeKnown = fee > 0"));

  check("البحثُ يمرّ من searchable", sf.includes('searchable } from "@/lib/utils"') || /searchable[,}]/.test(sf.split("\n").filter((l) => l.startsWith("import")).join("\n")));
  check("  على الطرفين معاً — المكتوبُ والمخزون",
    sf.includes("const ql = searchable(q)") && sf.includes("searchable(c.name).includes(ql)"));
  check("  ولا مقارنةَ خامٍ بخام باقية", !sf.includes("c.name.toLowerCase().includes(ql)"));

  check("العنوانُ إلزاميٌّ بالتحقّق", /valid =[^;]*address\.trim\(\)\.length >= 8/.test(sf));
  check("  ورسالتُه تقول ماذا يكتب", sf.includes("sf.addrNeeded"));
}

/* ── جرسُ طلبات المتجر ─────────────────────────────────────────────────────
 * «طلبٌ ينتظر بلا علم أحد» = زبونٌ ضايع. الجرسُ كان نصفَ مبنيّ: يعدّ بجرِّ
 * مئةِ صفٍّ كاملةٍ ببنودها كلَّ ٤٥ ثانية، ويدقّ على تبويبٍ مخفيٍّ تخنقه
 * المتصفّحات، ويطلب إذنَ الإشعار تلقائياً عند فتح الصفحة — نافذةٌ تُرفض بلا
 * قراءةٍ فيُحرق الخيار. */
console.log("▸ جرس طلبات المتجر — يعدّ بلا صفوف، ويسكت بالخلف، ويستأذن بضغطة");
{
  const bell = readFileSync("src/lib/storeOrdersLive.ts", "utf8");
  const repoSrc = (readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */;
  const store = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  const side = readFileSync("src/components/Sidebar.tsx", "utf8");

  check("العدُّ بلا جرِّ صفوف", bell.includes("repo.countNewStoreOrders()") && !bell.includes("listStoreOrders("));
  check("  والنسختان تعرفانه", (repoSrc.split("countNewStoreOrders").length - 1) >= 3);
  check("  والسحابيّ يعدّ بلا صفوف ويرمي على الخطأ",
    /countNewStoreOrders\(\)[\s\S]{0,700}head: true[\s\S]{0,300}throw new Error/.test(repoSrc));
  check("لا نبضَ على تبويبٍ مخفيّ", /if \(typeof document !== "undefined" && document\.hidden\) return;/.test(bell));
  check("  والعودةُ تعُدّ فوراً", bell.includes('addEventListener("visibilitychange"') && bell.includes('addEventListener("focus"'));
  check("الفشلُ يبقي آخرَ عددٍ معروف لا يهبط لصفر", /catch \{ \/\* عابر/.test(bell) && !/catch[\s\S]{0,60}count = 0/.test(bell));
  check("وأوّلُ قراءةٍ لا تدقّ (وإلا رنّ عند كل فتحة)", bell.includes("let prev = -1"));
  check("عنوانُ التبويب يحمل العدد ويرجع نظيفاً", bell.includes("function applyTitle") && /replace\(\/\^\\\(/.test(bell));
  check("الإذنُ بضغطةٍ لا عند الإقلاع",
    bell.includes("export async function enableStoreAlerts") && !store.includes("requestNotifyPermission()"));
  check("  وللشاشة زرٌّ يستدعيه", store.includes("enableStoreAlerts()") && store.includes("storeBell.enable"));
  check("والشارةُ تُرسم بالقائمة الجانبية من أي شاشة",
    side.includes("useStoreOrderCount(") && side.includes('item.to === "/store"'));
}

/* ── تشكيلةُ المتجر: الصورةُ تُضاف من مكان الدكتور، ويلقى الناقصَ بضغطة ──────
 * كان لازم يترك المتجرَ ويفتح المخزونَ منتجاً منتجاً، وما عنده طريقةٌ يعرف
 * بيها أيُّ منتجٍ بعده بلا صورة — فيبقى نصفُ الرفّ بلا صور بلا أن يدري. */
console.log("▸ تشكيلة المتجر — لوحةٌ واحدة (0229): صورةٌ من مكانها، وتصفيةٌ على «بلا صورة»");
{
  /* منذ 0229 التشكيلةُ وصفحةُ المصوّر لوحةٌ واحدة (`src/components/store/`): نفسُ الخصائص
   * التي حرسها هذا القسمُ على CatalogTab تُحرس هنا على اللوحة — والسلوكُ نفسُه يُفحص
   * بالتشغيل بـscripts/store-board-test.mjs. */
  const cs = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  const board = readFileSync("src/components/store/StoreBoard.tsx", "utf8");
  const flow = readFileSync("src/components/store/usePhotoFlow.tsx", "utf8");
  const sheet = readFileSync("src/components/store/ProductSheet.tsx", "utf8");
  const rules = readFileSync("src/lib/storeBoard.ts", "utf8");
  check("التشكيلةُ هي اللوحة، والرفعُ من داخلها (ملفّان: كاملٌ ومصغّر)",
    cs.includes('<StoreBoard mode="store"') && flow.includes("repo.uploadProductPhoto(") && board.includes("usePhotoFlow("));
  check("  ومنتقي المكتبة مركَّبٌ هنا كذلك", flow.includes("<ImageLibraryPicker") && sheet.includes("flow.openLibrary(row)"));
  check("  والصورةُ نفسُها هي الزرّ (تكبّر إن وُجدت، وتصوّر إن غابت)", /onClick=\{full \? onZoom : onCamera\}/.test(board));
  check("  والمنتجُ بلا صورةٍ يقولها نصّاً لا فراغاً", board.includes('t("sb.noPhoto"'));
  check("تصفيةُ «بلا صورة» موجودةٌ بعدّادها", board.includes("data-board-filters") && rules.includes('"nophoto"') && board.includes("counts[f]"));
  check("  وأربعُ حالاتِ تصفيةٍ لا واحدة", ["\"all\"", "\"shown\"", "\"hidden\"", "\"nophoto\""].every((k) => rules.includes(k)));
  check("وفرزٌ صريح", /<option value="work">[\s\S]{0,200}<option value="shelf">[\s\S]{0,200}<option value="name">/.test(board));
  check("  و«الشغل الناقص أوّلاً» يقدّم المنشورَ بلا صورة ثمّ الجاهز", /p\.store_visible && !hasPhoto\(p\)\) return 0;[\s\S]{0,120}readiness\(p, todayISO\)\.ok\) return 1;/.test(rules));
  check("وبحثُ اللوحة يطبّع الطرفين (الاسمُ بـsearchable والرمزُ بـnormalizeCode)",
    /searchable\(raw\)[\s\S]{0,120}searchable\(`\$\{p\.name\}/.test(rules) && /normalizeCode\(raw\)[\s\S]{0,240}normalizeCode\(String\(c\)\)/.test(rules));
  check("وشيلُ الصورة يفكّ الربطَ ولا يكسر شيئاً (والمصغّرُ معها)",
    flow.includes("repo.setProductImage(p.id, null, null)") && /repo\.deleteProductImage\(clinicId, p\.id, old, oldThumb\)/.test(flow));
  check("  وتُسأل بالاسم والصورة لا بنافذة متصفّح", sheet.includes("data-remove-confirm") && !/window\.confirm/.test(sheet + board + flow));
  /* معاينةُ الزبون مرآةُ `Storefront` لا تصميمٌ ثانٍ (تدقيق 0229: #43/#45): لا صفَّ مختاراتٍ منفصل
   * (المتجرُ أسقطه)، ونفسُ شارتي الزاوية بنفس المفاتيح، ومتجرٌ مطفأٌ يُقال، وبلا حشوةٍ فوق حشوة Dialog. */
  const pvSrc = readFileSync("src/components/store/CustomerPreview.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  check("المعاينة: لا صفَّ «مختارات» منفصل — المختارُ يُعلَّم داخل الشبكة كالمتجر",
    !pvSrc.includes("sb.pv.featured") && !/featured\.map\(/.test(pvSrc) && pvSrc.includes('t("sf.pick"') && pvSrc.includes('t("sf.out"'));
  check("  والنافدُ أولى بالشارة من المختار، والترتيبُ: النافدُ آخراً ثمّ المختارُ أوّلاً (مرآةُ Storefront)",
    /\{out \? \([\s\S]{0,200}sf\.out[\s\S]{0,120}\) : p\.store_featured \?/.test(pvSrc)
    && /Number\(isOut\(a\.p\)\) - Number\(isOut\(b\.p\)\) \|\| Number\(!!b\.p\.store_featured\) - Number\(!!a\.p\.store_featured\)/.test(pvSrc));
  check("  والشرائحُ بقواعد المتجر: «الكل» بلا عدد، و«منتجات أخرى» بشرطه، وشريطُ الفئات حين لا أقسام",
    pvSrc.includes('label={t("sf.all", "الكل")}') && /\{hasOthers && <Chip/.test(pvSrc) && /: cats\.length > 1 && \(/.test(pvSrc));
  check("  ومتجرٌ مطفأٌ يُقال (الزبونُ لا يرى شيئاً) — لا «بالضبط» عن شيءٍ لا يُرى",
    pvSrc.includes("data-preview-off") && /\{!storeOn && \(/.test(pvSrc) && !readFileSync("src/i18n/ar.json", "utf8").includes("هيچ يطلع المتجر للزبون بالضبط"));
  check("  وبلا حشوةٍ ثانية فوق حشوة Dialog", /<div className="space-y-4" data-preview>/.test(pvSrc) && !/px-6 pb-6/.test(pvSrc));

  /* ── مراجعةُ 0229 العدائية: ما بين اللوحة وما حولها ──────────────────────
   * السلوكُ النقيّ (المسحُ ثلاثيُّ الجواب، حكمُ الماسح، الإخفاءُ الذي لا يرجع، الاختيارُ
   * بالعضوية) مفحوصٌ بالتشغيل بـstore-board-test؛ وهنا أنّ اللوحةَ تمرّ منه فعلاً. */
  check("الماسحُ اليدويّ يُسأل أين يكتب قبل فتح البطاقة (نافذةٌ مفتوحة أو حقلُ كتابة ⇒ لا)",
    /if \(scanBlocked\(modalDepth\(\), focus\)\) return;/.test(board) && /useBarcodeScanner\(onKeyScan, \{/.test(board)
    && /<CameraScan [\s\S]{0,120}onCode=\{onScan\}/.test(board) && rules.includes("export function scanBlocked("));
  check("  ورمزُ توأمين يُقال «أكثر من منتج» بعددهما ويُكتب بالبحث — لا «مو بالمخزون»",
    /if \(hit\.kind === "many"\) \{[\s\S]{0,400}setFilter\("all"\); setSecFilter\("all"\); setQ\(code\);[\s\S]{0,200}sb\.scan\.many/.test(board));
  check("سعرُ الكاشير من اللوحة يتبع قفلَ الجهاز (stockLocked) كالمخزن",
    /const \{ stockLocked, restricted \} = useOverride\(\);/.test(board) && /const canPrice = canStore && \([^;]*\) && !stockLocked;/.test(board));
  check("  و«تحت الكلفة» لا تدخل بيانات اللوحة على جهازٍ مقفول ولا للمصوّر (شارةٌ ولا عدّادٌ ولا تصفية)",
    /const hideCost = restricted \|\| baseRole === "photographer";/.test(board)
    && /hideCost \? rows\.map\(\(p\) => \(p\.below_cost == null \? p : \{ \.\.\.p, below_cost: null \}\)\)/.test(board)
    && /\(f !== "belowCost" \|\| !hideCost\)/.test(board) && /\{!hideCost && p\.below_cost && /.test(board)
    && (board.match(/hideCost=\{hideCost\} onStale=\{\(\) => void load\(\)\}/g) ?? []).length === 2);
  check("كلُّ قراءةٍ بعد الأولى تُبلغ الأبَ (نشرُ منتقي القسم يجعل الإعدادات قديمة)",
    /if \(loadedOnce\.current\) changedRef\.current\?\.\(\);\s*\n\s*loadedOnce\.current = true;/.test(board));
  check("  ونقلٌ فشل بنصفه يقول كم انتقل ويعيد القراءة",
    /sb\.moveFailedPart[\s\S]{0,200}sb\.moveFailed"[\s\S]{0,80}\);\s*\n\s*await load\(\);/.test(board));
  check("تشكيلةُ المتجر لمن لا يملك صلاحيتها تقول صلاحيةَ المتجر، والصورُ وحدَها تُقال بشريط",
    /mode === "store"\s*\n\s*\? t\("sb\.p\.noStoreAccess"/.test(board) && /mode === "store" && !canStore && \([\s\S]{0,300}sb\.p\.photosOnly/.test(board));
  check("التصويرُ المتتابع: النجاحُ بلوحته لا بتوستٍ فوق أزرارها، واللوحةُ فوق زرّ المساعد",
    /quiet: !!seq,/.test(board) && /if \(!quiet\) \{\s*\n\s*toast\.success\(t\("sb\.photo\.saved"/.test(flow) && /if \(!quiet\) toast\.success/.test(flow)
    && /fixed inset-x-0 bottom-0 z-\[45\]/.test(board) && /data-seq-saved/.test(board));
  check("شريطُ الاختيار يلتصق تحت شريط الموبايل لا خلفه",
    /"sticky top-\[4\.5rem\] z-30 [^"]*lg:top-2"/.test(board) && !/sticky top-2 z-20/.test(board));
  check("ربطُ صورةٍ رُفض حاسماً يشيل زوجَه المرفوع، والمجهولُ المصير لا يُلمس",
    /catch \(e\) \{[\s\S]{0,700}if \(rejectedBeforeCommit\(e\)\) void repo\.deleteProductImage\(clinicId, p\.id, up\.path, up\.thumb\);\s*\n\s*throw e;/.test(flow));
}

/* ── دلو الصور: الأفعالُ الأربعة لا ثلاثة (0179) ───────────────────────────
 * 0174 كتبت insert/update/delete وتركت select — فكلُّ رفعٍ يُرفض بـ42501 لأن
 * `on conflict` (وهو ما يرسله storage-api عند upsert) يحتاج SELECT، والحذفُ
 * يرجع صفرَ صفوفٍ **بلا خطأ** فتُقال «شيلت الصورة» ولا شيءَ حُذف. مُثبَتٌ
 * بتجربةٍ محلّية، ومُصدَّقٌ بالإنتاج: دلو medical-media عنده select وفيه ملفات،
 * وproduct-images بلا select وفيه صفر. */
console.log("▸ دلو صور المنتجات — الأفعال الأربعة كاملة");
{
  const m174 = readFileSync("supabase/migrations/0174_product_images.sql", "utf8");
  const m175 = readFileSync("supabase/migrations/0175_image_library.sql", "utf8");
  const m179 = readFileSync("supabase/migrations/0179_product_images_select.sql", "utf8");
  const bucketSql = m174 + m175 + m179;
  for (const verb of ["select", "insert", "update", "delete"]) {
    check(`سياسةُ ${verb} موجودةٌ للدلو`, new RegExp(`for\\s+${verb}\\s+to authenticated`, "i").test(bucketSql));
  }
  check("وسياسةُ القراءة مقصوصةٌ بمجلّد العيادة أو المكتبة — لا الدلو كلّه",
    /product_images_select[\s\S]{0,600}foldername\(name\)\)\[1\] = \(select auth_clinic\(\)\)::text[\s\S]{0,200}'library'/.test(m179));
  check("  وبـ(select auth_clinic()) لا نداءً عارياً (rls-initplan)",
    m179.includes("(select auth_clinic())") && !/=\s*auth_clinic\(\)::text/.test(m179));
  check("  ومحروسةٌ بغياب مخطّط storage كما 0174", m179.includes("to_regclass('storage.objects')"));
  check("  ومُنزَّلةٌ بحزمة الهجرات", readFileSync("supabase/tests/run.sh", "utf8").includes("0179_product_images_select.sql"));
}

/* ---- الموجة ٢: الكتلوج لا يعلق ولا تُقصّ السلّة -------------------------- */
{
  console.log("▸ الموجة ٢: الكتلوج والسلّة");
  const front = readFileSync("src/pages/Storefront.tsx", "utf8");
  const lib = readFileSync("src/lib/storeLib.ts", "utf8");
  const track = readFileSync("src/pages/StoreTrack.tsx", "utf8");
  const repoW2 = (readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */;
  const mig = readFileSync("supabase/migrations/0182_store_catalog_stable_order.sql", "utf8");
  /* فحوصُ شِفرةٍ لا نصّ: أوّلُ صياغةٍ لثلاثةٍ منها كانت تبحث عن الكلمات
   * (`hasImg`، `object-cover`) فتفشل على **التعليق الذي يشرح إزالتها** —
   * حارسٌ يعاقب التوثيق. فالمسحُ يجري على الشِفرة بعد نزع التعليقات. */
  const frontCode = front.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  check("صمّامُ «عرض المزيد»: hasMore يتبع ما أُضيف فعلاً",
    /setHasMore\(more\.length > 0 && added > 0\)/.test(frontCode));
  /* منذ تدقيق 0229: `added` من `appendRows` (مفحوصةٌ بسلوكها تحت)، والإزاحةُ من **مرجع** الكتلوج
   * لا من إغلاق الرسم — كانت `catalog.length` من الإغلاق فتطلب إزاحةً مضت (#24). */
  check("  و`added` يُحسب من الصفوف الجديدة بعد إسقاط المكرّرات، والإزاحةُ من المرجع",
    /const \{ next, added \} = appendRows\(catalogRef\.current, more\)/.test(frontCode)
    && /storeCatalogPublic\(slug, PAGE_MORE, catalogRef\.current\.length\)/.test(frontCode)
    && !/PAGE_MORE, catalog\.length/.test(frontCode));
  /* #24: لا صفحةَ تالية قبل أن يستقرّ الجوابُ الأوّل — وإلا محا الجوابُ المتأخّرُ ما لُحق بعده. */
  check("الصفحةُ التالية تنتظر استقرارَ الجواب الأوّل (لا محوَ لما لُحق بعده)",
    /if \(loadingRef\.current \|\| !primed\) return;/.test(frontCode)
    && /if \(!searching \|\| !primed \|\| !hasMore/.test(frontCode)
    && /finally \{[\s\S]{0,40}if \(alive && gen === genRef\.current\) setPrimed\(true\)/.test(frontCode)
    && /disabled=\{loadingMore \|\| !primed\}/.test(frontCode));
  check("  وجوابُ صفحةٍ من جيلٍ مضى يُرمى", /const more = await storeApi\.storeCatalogPublic[^\n]*\n\s*if \(gen !== genRef\.current\) return;/.test(frontCode));
  /* #23: «فيه المزيد» = رجعت الصفحةُ بما طُلب أو أكثر — نداءٌ قديمٌ يرجع ستّين عن طلب ٢٤ كان «انتهت». */
  check("«فيه المزيد» بـ>= PAGE لا === (البذرةُ والجوابُ الأوّل)",
    /setHasMore\(boot\.catalog\.length >= PAGE\)/.test(frontCode) && /setHasMore\(c\.length >= PAGE\)/.test(frontCode)
    && !/length === PAGE/.test(frontCode));
  /* #25: السلّةُ لا تُشذَّب على غيابٍ عن الصفحات — الغائبُ يُسأل عنه الخادمُ بالمعرّف، والحكمُ من
   * `cartVerdict` (مفحوصةٌ بسلوكها تحت). كان الشرطُ «اكتملت الصفحات» ثمّ `!byId.get(id)?.available`. */
  check("تنظيفُ السلّة بحكم الخادم: الغائبُ عن الصفحات يُسأل بالمعرّف قبل أي شيل",
    /askCatalogIds\(\(ids\) => storeApi\.storeCatalogByIds\(slug, ids\), missing\)/.test(frontCode)
    && /cartVerdict\(c, known, answered\)/.test(frontCode)
    && /if \(rows === null\) answered = null;/.test(frontCode)
    && !/byId\.get\(l\.id\)\?\.available/.test(frontCode));
  check("  وبعد استقرار الجواب الأوّل لا قبله (البذرةُ قد تكون أقدمَ بربع ساعة)",
    /if \(state !== "open" \|\| !primed \|\| cartDoneRef\.current === genRef\.current/.test(frontCode));
  check("  وما رجع بالمعرّف يُعرض بالسلّة ويُحسب بالمجموع (byId يضمّه)، خارجَ الكتلوج كي لا يُفسد الإزاحة",
    /const byId = useMemo\(\(\) => new Map\(\[\.\.\.extra, \.\.\.catalog\]/.test(frontCode) && /setExtra\(rows\)/.test(frontCode));
  check("  وما شِيل يُقال بالاسم لا يُحذف بصمت (والاسمُ محفوظٌ بالسطر لمنتجٍ خرج)",
    frontCode.includes("setCartTrimmed(") && frontCode.includes("data-carttrimmed") && frontCode.includes("sf.cartTrimmed")
    && /known\.get\(l\.id\)\?\.name \?\? l\.name \?\? t\("sf\.goneItem"/.test(frontCode)
    && /\[\.\.\.c, \{ id, qty: Math\.min\(qty, 99\), name \}\]/.test(frontCode));
  /* #25 للشبكة: «اكتملت الصفحات» ليست «اكتمل الكتلوج» — عددُ الخادم يحكم، وقصورٌ يُعيد الكتلوجَ مرّة. */
  check("اكتمالُ الكتلوج يُفحص بعدد الخادم ويُعاد من أوّله مرّةً إن قصر",
    /const want = frontTotal\(front\);/.test(frontCode)
    && /collectCatalog\(\(limit, offset\) => storeApi\.storeCatalogPublic\(slug, limit, offset\)\)/.test(frontCode)
    && /refetchedRef\.current === gen/.test(frontCode));
  check("العددُ و«ما لكينا» لا يُقالان قبل الحكم (settled)",
    /\{settled \? `\$\{formatNum\(shown\.length\)\}/.test(frontCode)
    && /: !settled \? "نكمّل التشكيلة…" : "ما لكينا شيء مطابق"/.test(frontCode)
    && /const settled = complete && verified;/.test(frontCode));
  /* #27/#28: شريحةُ «منتجات أخرى» من عدّ الخادم، والاختيارُ بلا شريحةٍ ظاهرة يُمسح. */
  check("«منتجات أخرى» من عدّ الخادم (front.others) لا ممّا حُمّل وحده",
    /const hasOthers = sections\.length > 0 && \(\(front\?\.others \?\? 0\) > 0 \|\|/.test(frontCode));
  check("  وقسمٌ اختير ثمّ غاب من الشريط يرجع «الكل»، والفئةُ تُمسح حين تصل الأقسام",
    /if \(sec !== "all" && !\(sec === OTHERS \? hasOthers : sections\.some\(\(x\) => x\.id === sec\)\)\) setSec\("all"\);/.test(frontCode)
    && /if \(sections\.length > 0 && cat !== "all"\) setCat\("all"\);/.test(frontCode));
  check("  والفئةُ كالبحث والقسم: تُنزل بقيةَ الصفحات قبل الحكم",
    /const searching = q\.trim\(\)\.length > 0 \|\| sec !== "all" \|\| cat !== "all";/.test(frontCode));
  /* #26/#29: صورةٌ مفتاحُها مسارُها (العنصرُ المخفيُّ لا يُعاد استعمالُه بمصدرٍ جديد)، والورقةُ بالمصغّر. */
  check("كلُّ صورةٍ بالمتجر مفتاحُها مسارُها (hidden لا يبقى على مصدرٍ جديد)",
    /<img key=\{listImagePath\(p\)\} src=\{productImageUrl\(listImagePath\(p\)\)/.test(frontCode)
    && /\{img && <img key=\{img\}/.test(frontCode) && /\{cimg && <img key=\{cimg\}/.test(frontCode));
  check("  وورقةُ التفاصيل بالمصغّر وفشلُه يرجع للكاملة (لا ١٦٠٠ بكسل لصندوق ٢٠٨)",
    /const img = productImageUrl\(listImagePath\(detail\)\);/.test(frontCode)
    && /onError=\{onImgError\(productImageUrl\(detail\.image_path\)\)\}/.test(frontCode)
    && !/const img = productImageUrl\(detail\.image_path\)/.test(frontCode));
  check("بلاطةُ الرفّ أرضٌ دائمة خلف كلّ صورة (لا شرط !hasImg)",
    !/\bhasImg\b/.test(frontCode) && /shelfLabel\(p\.name\)/.test(frontCode));
  check("سطرُ السلّة يعرض صورةَ المنتج (مصغّرَها — 0229) فوق بلاطته",
    /const cimg = productImageUrl\(listImagePath\(p\)\);/.test(frontCode)
    && /shelfMonogram\(p\.name\)[\s\S]{0,200}\{cimg && <img/.test(frontCode));
  check("  وورقةُ التفاصيل بـobject-contain لا object-cover",
    !/object-cover/.test(frontCode) && /shelfLook\(detail\.name\)/.test(frontCode));
  check("  ولا بقايا categoryLook بالسلّة ولا بالورقة",
    !/categoryLook\(p\.category\)/.test(frontCode) && !/categoryLook\(detail\.category\)/.test(frontCode));
  check("مفتاحُ آخر طلبٍ لكلّ متجرٍ لا مفتاحٌ مشترك",
    /export function lastOrderKey\(slug: string\): string \{[\s\S]{0,200}normalizeSlug\(slug/.test(lib));
  check("  ولا أحدَ يكتب المفتاحَ الحرفيَّ المشترك بعد اليوم",
    !front.includes('"vp_store_last_order"') && !track.includes('"vp_store_last_order"'));
  check("  والطرفان يمرّان من نفس الدالّة",
    frontCode.includes("lastOrderKey(slug)") && track.includes("lastOrderKey(slug)"));
  check("0182: p.id آخرَ مفاتيح الفرز (ترتيبٌ حاسم)", /order by[^\n]*p\.name, p\.id/.test(mig));
  check("  والمختارُ يتصدّر من الخادم", /order by coalesce\(p\.store_featured, false\) desc/.test(mig));
  check("  والتوفّرُ **خارجَ** الفرز عمداً — وإلا صارت قائمةً ناقصة",
    !/order by[^\n]*stock > 0/.test(mig));
  // 0229 زاد مفاتيحَ الأقسام بين المميّز والمعرّف — النافذةُ اتّسعت لها، والمعرّفُ ما زال آخراً.
  check("  والمرآةُ التجريبية تفرز بنفس المفاتيح (حارسٌ ليس بالمرآة لم يُفحص)",
    /store_featured[\s\S]{0,700}store_sort[\s\S]{0,200}a\.id\.localeCompare\(b\.id\)\)/.test(repoW2));
  check("  ومُنزَّلةٌ بحزمة الهجرات",
    readFileSync("supabase/tests/run.sh", "utf8").includes("0182_store_catalog_stable_order.sql"));

  /* فحصٌ سلوكيّ لا نصّيّ: العطبُ كان «مفتاحٌ واحدٌ لكلّ المتاجر»، وصوابُه أن
   * يختلف بالسلاگ **ويتّحد** رغم اختلاف حالة الأحرف — تطبيعٌ داخل الدالّة. */
  const eb = (await import("esbuild")).default;
  const b2 = await eb.build({
    stdin: { contents: 'export { lastOrderKey } from "./src/lib/storeLib";', resolveDir: process.cwd(), loader: "js" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent",
  });
  const { lastOrderKey } = await import("data:text/javascript;base64," + Buffer.from(b2.outputFiles[0].text).toString("base64"));
  check("مفتاحان لمتجرين مختلفين لا يتساويان", lastOrderKey("vet-0en2") !== lastOrderKey("vet-abcd"));
  check("  ونفسُ المتجر بحالةِ أحرفٍ مختلفة مفتاحٌ واحد", lastOrderKey("Vet-0EN2") === lastOrderKey("vet-0en2"));
  check("  وبفراغٍ زائد كذلك", lastOrderKey(" vet 0en2 ") === lastOrderKey("vet-0en2"));
  check("  والمفتاحُ يحمل السلاگ فعلاً لا اسماً ثابتاً", lastOrderKey("vet-0en2").includes("vet-0en2"));

  /* ── كتلوجُ الزائر بصفحات: «لم يصل» ليس «الخادمُ قال لا» (تدقيق 0229: #23–#25) ──────────
   * بالسلوك لا بالنصّ: الدوالُّ التي تحكم ما يُشال من السلّة وما يُعدّ كاملاً. */
  const bCat = await eb.build({
    stdin: { contents: 'export { appendRows, frontTotal, collectCatalog, askCatalogIds, cartVerdict } from "./src/lib/storeLib";', resolveDir: process.cwd(), loader: "js" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent",
  });
  const SFC = await import("data:text/javascript;base64," + Buffer.from(bCat.outputFiles[0].text).toString("base64"));
  const R = (id, available = true) => ({ id, available, name: `م ${id}` });
  {
    const a = SFC.appendRows([R("a"), R("b")], [R("b"), R("c"), R("c"), R("d")]);
    check("appendRows: المكرّرُ يسقط (بين الصفحتين وداخل الصفحة)، و`added` = الجديدُ وحده",
      a.added === 2 && a.next.map((x) => x.id).join() === "a,b,c,d", JSON.stringify(a));
    check("  وصفحةٌ كلُّها مكرّرات ⇒ added = 0 (صمّامُ الحلقة)", SFC.appendRows([R("a")], [R("a")]).added === 0);
  }
  check("frontTotal: الأقسامُ + «منتجات أخرى» = الكتلوج", SFC.frontTotal({ sections: [{ n: 3 }, { n: 4 }], others: 5 }) === 12);
  check("  وخادمٌ قبل 0229 (بلا أقسام ولا others) ⇒ null لا صفر (لا حكمَ بعددٍ مجهول)",
    SFC.frontTotal({ sections: [], others: 0 }) === null && SFC.frontTotal(null) === null);
  {
    // خادمٌ سقفُه ٣٠ صفّاً وإن طُلب مئة — والكتلوجُ ٧٠: يتقدّم بما وصل ويقف عند الصفحة الفارغة.
    const all = Array.from({ length: 70 }, (_, i) => R(`p${i}`));
    const asked = [];
    const got = await SFC.collectCatalog(async (limit, offset) => { asked.push(offset); return all.slice(offset, offset + Math.min(limit, 30)); });
    check("collectCatalog: يتقدّم بما وصل لا بما طُلب (سقفُ خادمٍ أقلّ)، ويقف عند صفحةٍ فارغة لا ناقصة",
      got.length === 70 && asked.join() === "0,30,60,70", `${got.length} | ${asked.join()}`);
    let failed = false;
    try { await SFC.collectCatalog(async (l, o) => { if (o > 0) throw new Error("503"); return all.slice(0, 30); }); } catch { failed = true; }
    check("  وفشلُ صفحةٍ يرمي — نصفُ كتلوجٍ لا يُسلَّم بدل الكامل", failed);
    let capped = false;
    try { await SFC.collectCatalog(async () => [R(`x${Math.random()}`)], 100, 5); } catch { capped = true; }
    check("  والسقفُ يرمي لا يُرجع ما جمع", capped);
  }
  {
    const ids = Array.from({ length: 450 }, (_, i) => `id${i}`);
    const batches = [];
    const rows = await SFC.askCatalogIds(async (b) => { batches.push(b.length); return b.slice(0, 1).map((id) => R(id)); }, [...ids, "id0"]);
    check("askCatalogIds: دفعاتُ ٢٠٠ (سقفُ الدالّة) والمكرّرُ يُسأل مرّة", batches.join() === "200,200,50" && rows.length === 3, batches.join());
    const old = await SFC.askCatalogIds(async (b) => (b[0] === "id200" ? null : []), ids);
    check("  ودفعةٌ لا يعرفها الخادم ⇒ null كلُّه (جوابُ نصفٍ ليس جواباً عن الباقي)", old === null);
  }
  {
    const cart = [{ id: "on" }, { id: "off" }, { id: "skipped" }, { id: "gone" }, { id: "late" }];
    const known = new Map([["on", R("on")], ["off", R("off", false)], ["skipped", R("skipped")]]);
    const v = SFC.cartVerdict(cart, known, new Set(["skipped", "gone"]));
    check("cartVerdict: المتوفّرُ يبقى، وغيرُ المتوفّر يُشال، وما أجاب الخادمُ بغيابه يُشال",
      v.keep.map((l) => l.id).join() === "on,skipped,late" && v.gone.map((l) => l.id).join() === "off,gone", JSON.stringify(v));
    const blind = SFC.cartVerdict(cart, new Map([["on", R("on")]]), null);
    check("  وبلا جوابٍ من الخادم (null) لا يُشال غائبٌ أبداً — «لم يصل» ليس «لا يوجد»",
      blind.gone.length === 0 && blind.keep.length === 5, JSON.stringify(blind));
    check("  وغائبٌ لم يُسأل عنه (سطرٌ أُضيف بعد السؤال) يبقى", v.keep.some((l) => l.id === "late"));
  }

  /* ── الموجة ٥ · matchSlug: المطابقةُ بقاعدة الخادم لا بمطهّرة الإدخال ────
   *
   * الخادمُ يطابق بـ`lower(trim(p_slug))` — وكانت المرآةُ التجريبية تطابق
   * بـ`normalizeSlug`، وهي مطهّرةُ إدخالٍ **أوسع بكثير**: تقلب `_`→`-`، وتطوي
   * الشرطاتِ المكرّرة، وتحذف المحارفَ غيرَ المسموحة. فرابطٌ معطوبٌ يُقبل
   * بالتجريبيّ ويُرفض بالإنتاج — «تطبيعٌ يخالف الطرفَ الآخر» عينُه.
   *
   * ولهذا الفحصُ **ليس** قائمةَ توقّعاتٍ بيدي: يعيد بناءَ قاعدة الخادم من
   * تعريفها ويقارن. `trim()` ببوستغريس تشيل المسافة وحدَها — لا التبويب. */
  const b3 = await eb.build({
    stdin: { contents: 'export { matchSlug, slugKey, normalizeSlug } from "./src/lib/storeLib";', resolveDir: process.cwd(), loader: "js" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent",
  });
  const SL = await import("data:text/javascript;base64," + Buffer.from(b3.outputFiles[0].text).toString("base64"));
  /** قاعدةُ الخادم: `lower(btrim(x, ' '))`. */
  const serverKey = (x) => String(x ?? "").replace(/^ +| +$/g, "").toLowerCase();
  const CANON = "vet-0en2";
  const CORPUS = [
    CANON, "VET-0EN2", " vet-0en2", "vet-0en2 ", "  Vet-0EN2  ",
    "vet_0en2", "vet--0en2", "vet-0en2!", "vet 0en2", "vet-0en2\t", "vet-0en2\n",
    "", "   ", "other-vet", "vet-0en", "vet-0en22",
  ];
  let divergedOld = 0, divergedNew = 0;
  for (const raw of CORPUS) {
    const truth = serverKey(raw) === CANON;               // ما يفعله الخادم
    if ((SL.normalizeSlug(raw) === CANON) !== truth) divergedOld++;
    if (SL.matchSlug(CANON, raw) !== truth) divergedNew++;
  }
  check(`matchSlug يطابق قاعدةَ الخادم على ${CORPUS.length} مدخلاً`, divergedNew === 0, `انحرف ${divergedNew}`);
  check("  والمطبِّعُ القديم كان ينحرف فعلاً (الفحصُ يقيس شيئاً)", divergedOld > 0,
    "normalizeSlug ما انحرف بأي مدخل — القالبُ لا يمسك العطب");
  check("  وسلاگٌ فارغٌ لا يفتح متجراً", !SL.matchSlug("", "") && !SL.matchSlug("", undefined) && !SL.matchSlug(null, null));
  check("  والطرفان يمرّان من نفس الدالّة (المخزونُ يُطبَّع كما المُدخَل)",
    SL.matchSlug(" VET-0EN2 ", "vet-0en2") && SL.matchSlug("vet-0en2", " VET-0EN2 "));
  check("  ولا موضعَ مقارنةٍ باقٍ على normalizeSlug بالنصف التجريبيّ",
    !/sp\.slug !== normalizeSlug\(/.test((readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */));
  check("  وقاعدةُ الخادم ما زالت lower(trim(p_slug)) — لو تبدّلت لبطل القالب",
    readFileSync("supabase/migrations/0095_store.sql", "utf8").includes("lower(trim(p_slug))"));

  /* ── الموجة ٥ · ٢٢ج ود: الشارةُ لا تناقض الصندوق، والعنوانُ يقول نافذتَه ──
   *
   * الصندوقُ كان يقرأ آخر ٣٠٠ طلبٍ **بكلّ الحالات** ثمّ يصفّي «الجديد»، والشارةُ
   * تعدّ بالخادم `count: exact` بلا سقف. فطلبٌ جديدٌ وراءه ٣٠٠ قرارٍ أحدثُ منه
   * يسقط من الصندوق والشارةُ تعدّه: «١ بانتظارك» و«ما اكو طلبات» بنفس الشاشة —
   * والطلبُ لا يُقبل ولا يُرفض أصلاً. */
  const store = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  const repoS = (readFileSync("src/lib/repo.ts", "utf8") + "\n" + readFileSync("src/lib/repoDemo.ts", "utf8")) /* المرآةُ التجريبية بملفّها (خارج الإقلاع) */;
  check("صندوقُ «الجديد» له قراءتُه الخاصّة بلا سقف",
    /async listNewStoreOrders\(\)[\s\S]{0,400}allPages<StoreOrder>[\s\S]{0,200}eq\("status", "new"\)/.test(repoS));
  check("  ولا سقفَ عليها (لا limit ولا slice)",
    !/async listNewStoreOrders\(\)[\s\S]{0,400}\.limit\(/.test(repoS));
  check("  والمرآةُ التجريبية عندها نفسُ الدالّة (حارسٌ ليس بالمرآة لم يُفحص)",
    /async listNewStoreOrders\(\): Promise<StoreOrder\[\]>/.test(repoS));
  check("  ومسموحةٌ باشتراكٍ منتهٍ (قراءةٌ لا كتابة)", /"listNewStoreOrders"/.test(repoS));
  check("والصندوقُ يبني «الجديد» من قائمته لا من تصفيةِ المقصوص",
    /const fresh = newOrders \?\? /.test(store));
  check("  والشارةُ تتبع الصندوق متى ما وصل",
    /badge: newOrders \? newOrders\.length : newCount/.test(store));
  check("والنافذةُ اسمٌ واحد — لا رقمٌ مكرَّرٌ بالجلب وبالعنوان",
    /const ORDERS_WINDOW = 300;/.test(store) && /listStoreOrders\(ORDERS_WINDOW\)/.test(store)
    && !/listStoreOrders\(300\)/.test(store));
  check("  والمجموعُ المقصوص يقول نافذتَه بعنوانه", /kpiRevenueWindow/.test(store) && /capped \?/.test(store));
  check("  و«نسبةُ القبول» لا تُوسَم — النافذةُ تُختصر من النسبة بسطاً ومقاماً",
    !/kpiAcceptRateWindow/.test(store));
  check("  وعنوانُ السجلّ لا يقول مجموعاً كاملاً وهو مقصوص",
    /total: capped \? `\$\{ORDERS_WINDOW\}\+` : decided\.length/.test(store));

  /* ── الموجة ٥ · ٢٤هـ: الجرسُ ينبض لمن له متجر ───────────────────────────
   * الشرطُ كان الباقةَ لا المتجر. المقيسُ بالإنتاج: ٦٤ عيادةً، واحدةٌ لها صفٌّ
   * بـ`store_profiles`. فثلاثٌ وستّون تنبض كلَّ ٤٥ ثانيةً لتعدّ صفراً — ولا
   * يظهر شيءٌ بالشاشة (الشارةُ `> 0`)، فالعطبُ كلفةٌ لا صورة، ولهذا لم يُشتكَ. */
  const bell = readFileSync("src/lib/storeOrdersLive.ts", "utf8");
  const side = readFileSync("src/components/Sidebar.tsx", "utf8");
  check("الجرسُ مشروطٌ بصفِّ متجرٍ مفعَّل لا بالباقة",
    /useStoreOrderCount\(hasStore && can\("processSales"\)( && !photographer)?\)/.test(side));
  check("  ولا أثرَ للشرط القديم (has(\"store\") يقرّر النبض)",
    !/useStoreOrderCount\(has\("store"\)/.test(side));
  check("  والمجسُّ قراءةٌ واحدةٌ بالجلسة لا نداءٌ بكلّ نبضة",
    /function subscribeHasStore[\s\S]{0,400}storeOn === null && !probing/.test(bell));
  check("  وفشلُ القراءة **ينبض** لا يسكت (صمتٌ كاذبٌ = طلبٌ يُنسى)",
    /\.catch\(\(\) => \{ storeOn = true; \}\)/.test(bell));
  check("  والشاشةُ تُعلمه بلا رحلةٍ ثانية", /noteStoreProfile/.test(store) && /export function noteStoreProfile/.test(bell));
  check("ومستمعو النافذة يُنزعون عند آخر مشترك (تسريبٌ صامت)",
    /function unwire\(\)[\s\S]{0,240}removeEventListener\("visibilitychange", onVis\)/.test(bell)
    && /timer = undefined;\s*\n\s*unwire\(\);/.test(bell));

  /* ── ت٢ · 0186: النشرُ الجماعيّ ────────────────────────────────────────
   * المقيسُ على الإنتاج: ٦٩١ ك.ب JSON لأكبر عيادةٍ حيّة (٩٩٠ منتجاً)، ونشرُ
   * أربعين صنفاً كان ٤٠ كتابةً + ١٢٠ طلبَ قراءة + ~٢٧ ميغا — وبينها
   * `if (busyId) return` تُسقط الضغطةَ الثانية بصمت. والثلاثُ الكبار
   * عندهنّ ٩٩٠ و٩٦٢ و٧٣٠ منتجاً وصفرُ منتجٍ معروض. */
  check("النشرُ لا يُتبَع بإعادةِ تحميلٍ كاملة (٦٩١ ك.ب بكلّ ضغطة)",
    !/const toggle = async \(p: Product\) => \{[\s\S]{0,420}await reload\(\);[\s\S]{0,40}\} catch/.test(store));
  // 0229: النشرُ من اللوحة (`StoreBoard`) بـstore_publish — نفسُ الخصائص على الشِفرة الجديدة.
  const brd = readFileSync("src/components/store/StoreBoard.tsx", "utf8");
  const pt = readFileSync("src/components/store/publishToast.ts", "utf8");
  // منذ 0229 الخادمُ يرجع معرّفاتِ ما تغيّر: المحلّيُّ يرقّعها هي (لا شروطَه على صفوفٍ قد تكون قديمة)،
  // وأيُّ فرقٍ بين المطلوب والمتغيّر يعيد القراءة.
  check("  والتحديثُ محلّيٌّ بمكانه (بما قال الخادمُ إنه تغيّر، وفرقٌ يعيد القراءة)",
    /patchMany\(new Set\(r\.ids\), \(\) => \(\{ store_visible: on \}\)\)/.test(brd)
    && /if \(r\.ids\.length !== r\.changed \|\| r\.changed !== expected\) void load\(\);/.test(brd));
  check("  وفشلُ الجماعيّ **يُعيد** القراءة (لا تبقى الشاشةُ على ظنٍّ لا يطابق الخادم)",
    /sb\.publishFailed[\s\S]{0,200}await load\(\)/.test(brd));
  check("فعلٌ جماعيٌّ موجودٌ بالشاشة أصلاً (لم يكن)",
    /const bulkPublish = async \(on: boolean/.test(brd) && /sb\.bulkShow/.test(brd) && /sb\.bulkHide/.test(brd));
  check("  و«اختر الكل» يقصد المعروضَ بالتصفية لا الجدولَ كلَّه",
    /setPicked\(allOn \? new Set\(\) : new Set\(visible\.map/.test(brd) && /const allOn = allPicked\(visible, picked\);/.test(brd));
  // «الكلُّ مختار» بالعضوية لا بمقارنة العددَين، والفعلُ الجماعيُّ على المختار الظاهر وحدَه،
  // والبحثُ والقسمُ يصفّران الاختيار (كانت «اخفِ» تمسّ ما لا تراه الشاشة).
  check("  والفعلُ الجماعيُّ على المختار **الظاهر**، والبحثُ والقسمُ يصفّرانه",
    /const pickedRows = useMemo\(\(\) => pickedIn\(visible, picked\)/.test(brd) && /ids = pickedRows\.map\(\(p\) => p\.id\)/.test(brd)
    && !/picked\.size === visible\.length/.test(brd)
    && /setQ\(e\.target\.value\); setShown\(PAGE\); pickNone\(\);/.test(brd) && /setSecFilter\(id\); setShown\(PAGE\); pickNone\(\);/.test(brd));
  check("  و«اخفِ» يسأل بالشاشة عن المنشور الناقص (لا يرجع إلا مكتملاً) — بالبطاقة والجماعيّ، بلا نافذة متصفّح",
    /if \(hideRisk\(p, today\)\) \{ playWarning\(\); setAskHide\(true\); return; \}/.test(brd) && /onClick=\{toggle\} data-card-toggle/.test(brd)
    && /if \(hideSum\.risky > 0\) \{ playWarning\(\); setHideAsk\(true\); return; \}/.test(brd) && /onClick=\{askBulkHide\} data-bulk-hide/.test(brd)
    && !/window\.confirm/.test(brd));
  // نداءٌ لكلّ ألف (سقفُ الخادم ٢٠٠٠) لا لكلّ منتج — الحلقةُ الممنوعةُ حلقةُ المنتجات.
  check("  والدالّةُ الخادميةُ بنداءٍ لكلّ دفعة لا حلقةٍ على المنتجات",
    /repo\.storePublish\(ids\.slice\(i, i \+ 1000\), on\)/.test(brd) && !/for \([^)]*\) \{[\s\S]{0,120}await repo\.updateProduct\([^)]*store_visible/.test(brd));
  check("  والمتخطَّى يُقال بعدده وسببه (صورة، سعر، انتهاء)",
    /r\.skipped_no_photo/.test(pt) && /r\.skipped_no_price/.test(pt) && /r\.skipped_expired/.test(pt) && /sb\.skipHint/.test(pt));
  check("والمرآةُ التجريبية عندها نفسُ الدالّة",
    /async setStoreVisible\(ids: string\[\], on: boolean\)/.test(repoS));
  check("  وشرطُ السعر بالنصفين (حارسٌ ليس بالمرآة لم يُفحص)",
    /\(p\.sell_price \?\? 0\) <= 0/.test(repoS)
    && readFileSync("supabase/migrations/0186_store_bulk_visible.sql", "utf8").includes("coalesce(sell_price, 0) > 0"));
  check("  والصلاحيةُ نسخةٌ من products_write لا قائمةٌ جديدة",
    /v_role not in \('manager', 'veterinarian'\)/.test(readFileSync("supabase/migrations/0186_store_bulk_visible.sql", "utf8")));
  check("  ومُنزَّلةٌ بحزمة الهجرات",
    readFileSync("supabase/tests/run.sh", "utf8").includes("0186_store_bulk_visible.sql"));

  /* ── ت٣ · 0187: «انشر أكثرَ ما تبيع» ──────────────────────────────────
   * المقيس: أعلى ٤٠ منتجاً تصنع ٩٠٫٤٪ و٤٣٫٣٪ و٣٥٫٦٪ من إيراد الثلاثِ الكبار
   * بتسعين يوماً، وصفرٌ منها منشور. والحدُّ الصريح: **تقترح ولا تكتب**. */
  const sug = readFileSync("supabase/migrations/0187_store_suggest_products.sql", "utf8");
  check("الاقتراحُ **لا يكتب حرفاً** (لا update/insert/delete بالهجرة)",
    !/\b(update|insert into|delete from)\s+products\b/i.test(sug));
  check("  وهي invoker لا definer — نفسُ report_top_products", !/security definer/i.test(sug));
  check("  وتعريفُ البيع منسوخٌ: المرتجَعُ يُستثنى والتاريخُ تاريخُ الفاتورة",
    /coalesce\(i\.status, 'paid'\) <> 'refunded'/.test(sug) && /i\.created_at >=/.test(sug));
  check("  والكميّاتُ بإشارتها — السطرُ الراجعُ يخصم (لا شرطَ qty > 0)",
    !/it\.qty > 0/.test(sug));
  check("  وتعريفُ التوفّر منسوخٌ من الكتلوج (المجمَّعُ يُحسب)",
    /p\.stock > 0 or coalesce\(cs\.pooled_stock, 0\) > 0/.test(sug));
  check("  وشرطُ السعر نفسُ 0186، والمنشورُ يخرج", /coalesce\(p\.sell_price, 0\) > 0/.test(sug) && /not coalesce\(p\.store_visible, false\)/.test(sug));
  check("  والترتيبُ حاسمٌ بـp.id آخِراً (درسُ 0182)", /order by s\.rev desc, p\.name, p\.id/.test(sug));
  // 0229: الاقتراحُ باللوحة (SuggestButton) — نفسُ الخصائص، والنشرُ بشروطه (صورةٌ شرطٌ للجديد).
  const sugBoard = readFileSync("src/components/store/StoreBoard.tsx", "utf8");
  check("والشاشةُ تعرض الفئةَ بكلّ سطر (الأدويةُ أوّلُ ما يُشطب)",
    /r\.category \? t\(`pos\.cat\.\$\{r\.category\}`, r\.category\) : t\("sb\.sug\.noCategory"/.test(sugBoard));
  check("  والاقتراحُ مؤشَّرٌ مسبقاً والدكتورُ يشطب (ما عليه صورة — الباقي يُقال «بلا صورة» ولا يُنشر)",
    /setPick\(new Set\(r\.filter\(\(x\) => photo\.get\(x\.id\) \?\? !!x\.image_path\)\.map\(\(x\) => x\.id\)\)\)/.test(sugBoard) && /sb\.sugNoPhoto/.test(sugBoard));
  check("  وفشلُ الجلب يُقال ولا يصير «ما عندك مبيعات»",
    /setState\("error"\)/.test(sugBoard) && /sb\.sug\.suggestFailed/.test(sugBoard));
  check("  ولوحةُ الاقتراح تُغلق حين انتشر فعلاً وحدَه (فشلٌ أو طلبٌ سابقٌ يُبقي المؤشَّر)",
    /if \(await onPublish\(\[\.\.\.pick\]\)\) setState\("idle"\)/.test(sugBoard) && /onPublish: \(ids: string\[\]\) => Promise<boolean>/.test(sugBoard)
    && /if \(busyRef\.current\) \{\s*\n\s*toast\.toast\(\{ tone: "info", title: t\("sb\.busyWait"/.test(sugBoard));
  check("  والنشرُ منه يمرّ من نفس باب النشر لا من كتابةٍ ثانية",
    /<SuggestButton list=\{list\} onPublish=\{\(ids\) => bulkPublish\(true, ids\)\}/.test(sugBoard));
  check("والمرآةُ التجريبية عندها نفسُ الدالّة", /async suggestStoreProducts\(limit = 40, days = 90\)/.test(repoS));
  check("  وقائمةُ الاقتراح ترمي على الفشل لا ترجع «ماكو»",
    /suggestStoreProducts\(limit = 40, days = 90\) \{[\s\S]{0,500}if \(error\) throw error;/.test(repoS));
  check("  ومُنزَّلةٌ بحزمة الهجرات",
    readFileSync("supabase/tests/run.sh", "utf8").includes("0187_store_suggest_products.sql"));

  /* ── ت٤: الرابطُ باسم العيادة ────────────────────────────────────────────
   * الزرُّ كان `vet-` + عشوائيّ دائماً، ولذلك المتجرُ الوحيدُ `vet-0en2`.
   * والسببُ أعمق: أسماءُ العيادات الأربعِ ذواتِ المخزون الحقيقيّ **عربيّةٌ
   * خالصة** (مقيس)، و`normalizeSlug` تنتج منها `""` — فالرابطُ من الاسم كان
   * مستحيلاً لا مُهمَلاً. والفحصُ **سلوكيٌّ بأسماء الإنتاج نفسِها**. */
  const b4 = await eb.build({
    stdin: { contents: 'export { slugCandidates, normalizeSlug, isValidSlug } from "./src/lib/storeLib";', resolveDir: process.cwd(), loader: "js" },
    bundle: true, format: "esm", write: false, platform: "node", logLevel: "silent",
  });
  const SC = await import("data:text/javascript;base64," + Buffer.from(b4.outputFiles[0].text).toString("base64"));
  // أسماءٌ حقيقيةٌ من الإنتاج — لا أمثلةٌ مريحة.
  const LIVE = ["الروز البيطرية", "ابن,الهيثم", "عيادة الاسمر البيطرية", "عيادة"];
  for (const nm of LIVE) {
    const c = SC.slugCandidates(nm);
    check(`«${nm}» يعطي رابطاً صالحاً`, c.length > 0 && c.every((x) => SC.isValidSlug(x)), JSON.stringify(c));
  }
  check("  وكان مستحيلاً قبل النقل (normalizeSlug تعطي فراغاً)",
    LIVE.every((nm) => SC.normalizeSlug(nm) === ""));
  /* **والتمايزُ هو الخاصّيةُ الحقيقية**، لا مجرّدُ «رابطٍ صالح»: بلا جدول
   * النقل تعطي ثلاثٌ من الأربع `vet` نفسَه — فأوّلُ من يحجزه يُسقط البقيةَ
   * للعشوائيّ، ويعود بنا إلى `vet-0en2`. وقعتُ بها: فحصُ «صالحٍ» وحدَه مرّ. */
  {
    const firsts = LIVE.map((nm) => SC.slugCandidates(nm)[0]).filter(Boolean);
    check("  و**الأربعُ تتمايز** (لا ثلاثٌ منها «vet» نفسُه)",
      new Set(firsts).size === LIVE.length, JSON.stringify(firsts));
  }
  check("  والفاصلةُ فاصلُ كلماتٍ («ابن,الهيثم» مقيسٌ بالإنتاج)",
    SC.slugCandidates("ابن,الهيثم")[0].includes("-"));
  check("  و«بيطرية» تُترجَم vet لا تُنقَل حرفياً",
    SC.slugCandidates("الروز البيطرية")[0] === "alroz-vet", JSON.stringify(SC.slugCandidates("الروز البيطرية")));
  check("  ولا تكرارَ لنوعٍ واحد (عيادة+بيطرية ⇒ vet مرّةً)",
    !/vet.*vet/.test(SC.slugCandidates("عيادة الاسمر البيطرية")[0]));
  check("  والاسمُ اللاتينيُّ الصالحُ يتصدّر كما هو (لا يُعاد ترتيبُه)",
    SC.slugCandidates("Farah pet clinic")[0] === "farah-pet-clinic");
  check("  والأرقامُ الشرقيةُ تُنقَل", SC.slugCandidates("عيادة ٢٤ ساعة")[0].includes("24"));
  check("  واسمٌ فارغٌ لا يعطي شيئاً", SC.slugCandidates("").length === 0 && SC.slugCandidates(null).length === 0);
  check("  وثلاثةُ مرشّحين كحدٍّ أقصى", SC.slugCandidates("مركز الرحمة للحيوانات الاليفة").length <= 3);
  check("والعشوائيُّ **آخرُ** الخيارات لا أوّلُها",
    /for \(const cand of slugCandidates\(getClinicName\(\)\)\)[\s\S]{0,400}vet-\$\{rand\}/.test(store));
  check("  وكلُّ مرشّحٍ يُفحص توفّرُه قبل اقتراحه", /await repo\.checkStoreSlug\(cand\)/.test(store));
  check("  ولا اقتراحَ عشوائيٍّ داخل الحلقة", !/slugCandidates[\s\S]{0,200}Math\.random/.test(store));

  /* والإعفاءُ الجديد بـi18n-guard لا يصير باباً خلفياً: كلُّ استعمالٍ له
   * **سببٌ مكتوب**، ولا يُستعمل بملفّ شاشةٍ (حيث النصُّ يُقرأ فعلاً). */
  const guard = readFileSync("scripts/i18n-guard.mjs", "utf8");
  check("إعفاءُ i18n-data يشترط سبباً مكتوباً", /i18n-data:\\s\*\\S/.test(guard) || /i18n-data:\\s\+\\S/.test(guard));
  {
    const users = [];
    const walk = (d) => { for (const e of readdirSync(d, { withFileTypes: true })) {
      const q = `${d}/${e.name}`;
      if (e.isDirectory()) walk(q); else if (/\.(ts|tsx)$/.test(e.name) && readFileSync(q, "utf8").includes("i18n-data:")) users.push(q);
    } };
    walk("src");
    check("  ولا يُستعمل بملفّ شاشة (.tsx)", users.every((f) => !f.endsWith(".tsx")), users.join(", "));
    check("  ومحصورٌ بملفٍّ واحدٍ اليوم", users.length === 1, users.join(", "));
  }

  /* ── ت٦ + مسارُ التفعيل ─────────────────────────────────────────────────
   * المالكُ قال الحقيقةَ التي لا تقيسها القاعدة: **ما بلّغ العيادات بالخدمة**.
   * فكلُّ ما سبق (نشرٌ جماعيٌّ واقتراحٌ ورابطٌ باسم) يجعل التبليغَ ينجح — ولا
   * يغني عن مسارٍ يقول للعيادة **ماذا تفعل** حين تفتح الشاشة أوّلَ مرّة. */
  check("لوحةُ الجاهزية تقول ما ينقص **بالعدد** لا «جاهز» مجرّدة",
    /readyNoPrice/.test(store) && /readyNoStock/.test(store) && /readyNoPhoto/.test(store) && /readyNoDesc/.test(store));
  check("  وتعدّ **المعروضَ** لا كلَّ المخزن (عيبُ المتجر بما يراه الزبون)",
    /const shownAll = \(products \?\? \[\]\)\.filter\(\(p\) => p\.store_visible\)/.test(store));
  check("  ولا يُعرض سطرٌ عن صفر", /noPriceCount > 0 && \(/.test(store) && /noDescCount > 0 && \(/.test(store));
  check("  وكلُّ سطرٍ **يوصّل** لتصفيته لا يكتفي بالعدد",
    /onGo=\{\(\) => goCatalog\("noprice"\)\}/.test(store) && /onGo=\{\(\) => goCatalog\("nostock"\)\}/.test(store)
    && /onGo=\{\(\) => goCatalog\("nodesc"\)\}/.test(store));
  const rls = readFileSync("src/lib/storeBoard.ts", "utf8");
  check("  والتصفياتُ الثلاثُ موجودةٌ فعلاً باللوحة (0229)، وكلُّ سطرٍ يفتح ما يعدّه",
    /nostock: "out"/.test(store) && /noprice: "noprice"/.test(store) && /nodesc: "nodesc"/.test(store)
    && /case "noprice":/.test(rls) && /case "out":/.test(rls) && /case "nodesc":/.test(rls));
  check("  وهي على المعروض وحدَه (مخفيٌّ بلا سعرٍ ليس عيبَ متجر)",
    /case "noprice": return p\.store_visible && !hasPrice\(p\);/.test(rls) && /case "out": return p\.store_visible && isOut\(p\);/.test(rls));
  check("مسارُ التفعيل ثلاثُ خطواتٍ مرقَّمة بدل لافتةٍ تقول «افتح الإعدادات»",
    /function SetupStep/.test(store) && /cat\.setupTitle/.test(store));
  check("  والترتيبُ: رابطٌ ← بضاعةٌ ← تفعيل",
    /SetupStep n=\{1\}[\s\S]{0,400}SetupStep n=\{2\}[\s\S]{0,400}SetupStep n=\{3\}/.test(store));
  check("  وكلُّ خطوةٍ تفتح فعلَها مباشرة", /cta=\{t\("cat\.setupOpenCatalog"/.test(store) && /onGo=\{goSettings\}/.test(store));
  check("  ويُحذَّر من متجرٍ مفعَّلٍ **فارغ** (أسوأُ من مطفأ)",
    /profile\?\.enabled && shownCount === 0/.test(store) && /cat\.setupEmptyWarn/.test(store));
  check("  ويختفي المسارُ حين يكتمل", /!\(profile\?\.enabled && shownCount > 0\)/.test(store));
  check("والكتلوجُ لا يعرض منتجاً بلا سعر (0188)",
    readFileSync("supabase/migrations/0188_store_catalog_priced.sql", "utf8").includes("coalesce(p.sell_price, 0) > 0"));
  check("  ومُنزَّلةٌ بحزمة الهجرات",
    readFileSync("supabase/tests/run.sh", "utf8").includes("0188_store_catalog_priced.sql"));

  /* ── ت٩: القسيمةُ تحمل رابطَ المتجر ────────────────────────────────────
   * المقيس: ١١٩٧ فاتورةً بآخر سبعةِ أيام = ~١١٩٧ قسيمةً بيدِ زبونٍ اشترى
   * للتوّ. وقوائمُ الهواتف المميّزة ٥٨ و٣٠٣ و٣٣٩ — القسيمةُ تصل بالأسبوع
   * أكثرَ ممّا تصله القائمةُ كلُّها، ولا تكلّف رسالةً ولا إعلاناً. */
  const print = readFileSync("src/lib/invoicePrint.ts", "utf8");
  check("QR القسيمة يقصد المتجرَ حين يكون مفعَّلاً",
    /const target = opts\.storeUrl \? `\$\{opts\.storeUrl\}\?r=r`/.test(print));
  check("  وواتسابُ العيادة يبقى احتياطاً (لا انحدار لمن بلا متجر)",
    /: digits \? `https:\/\/wa\.me\/\$\{digits\}`/.test(print));
  check("  والسطرُ يقول ما يحصل عند المسح لا «امسحنا»",
    /opts\.storeUrl \? s\.scanStore : s\.scanUs/.test(print));
  check("  والمصدرُ موسومٌ `?r=r` فيُقاس أثرُه بـت١", /\?r=r/.test(print));
  const upi = readFileSync("src/components/retail/usePrintInvoice.ts", "utf8");
  const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  check("  ومُمرَّرٌ من **موضعَي** الطباعة معاً", /storeUrl: \(\(\) =>/.test(upi) && /storeUrl: \(\(\) =>/.test(sb));
  check("  والقراءةُ من الذاكرة — لا رحلةَ شبكةٍ بمسار البيع",
    /storeSlugCached\(\)/.test(upi) && !/await repo\.getStoreProfile\(\)/.test(upi));
  check("  والمخزَّنُ لا يثبّت «لا متجر» على فشلٍ عابر",
    /\.catch\(\(\) => \{ storeOn = null; \}\)/.test(readFileSync("src/lib/storeOrdersLive.ts", "utf8")));

  /* ── ت١٠: الأجرةُ تُحسم عند القبول ──────────────────────────────────── */
  const mig89 = readFileSync("supabase/migrations/0189_accept_fee_at_decision.sql", "utf8");
  check("الأجرةُ وسيطٌ بالقبول، والوسيطُ يغلب ولو كان صفراً",
    /p_fee numeric default null/.test(mig89) && /coalesce\(p_fee, o\.delivery_fee, 0\)/.test(mig89));
  check("  والمجموعُ يتبعها لا `o.total` القديم", /round\(o\.subtotal \+ v_fee, 2\)/.test(mig89));
  check("  وبندُ الفاتورة وصفُّ التوصيل من **رقمٍ واحد**",
    /'unit_price', v_fee/.test(mig89) && /o\.address, o\.note, v_fee, v_due, 0,/.test(mig89));
  check("  والتوقيعُ القديم يُسقَط صراحةً (لا حِملٌ ثانٍ غامض)",
    /drop function if exists public\.store_accept_order\(uuid, uuid\);/.test(mig89));
  check("  والمرآةُ التجريبية بنفس الحسم", /const vFee = Math\.max\(0, Math\.round\(\(fee \?\? o\.delivery_fee \?\? 0\)/.test(repoS));
  check("والشاشةُ فيها حقلُ أجرةٍ لكلّ طلب", /pos\.acceptFee/.test(store) && /feeDraft\[o\.id\]/.test(store));
  check("  وفارغٌ يعني «كما وصل الطلب» لا صفراً",
    /raw !== undefined && raw\.trim\(\) !== "" \? Math\.max\(0, Number\(raw\) \|\| 0\) : null/.test(store));
  check("  وحقلُ الإعدادات ما عاد يكذب («٠ = مجاني» والزبونُ يرى «يتحدد»)",
    !/placeholder="0 = مجاني"/.test(store) && /cat\.feeZero/.test(store));
  check("  ومُنزَّلةٌ بحزمة الهجرات",
    readFileSync("supabase/tests/run.sh", "utf8").includes("0189_accept_fee_at_decision.sql"));
}

console.log("▸ 0228 — المصوّر: الألبوم، والمتجرُ كلُّه بقالبه (بلا الطلبات)، والسعرُ بشرطه");
{
  /* قالبُ الأدوار بالواجهة (staff.ts) مرآةُ has_permission بآخر هجرةٍ تعرّفها — كان المصوّرُ
   * بلا متجرٍ بالخادم، فقالبٌ يُوسَّع بطرفٍ واحد يُظهر شاشةً يرفضها الخادم أو العكس. */
  const migs = readdirSync("supabase/migrations").filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
  let hpSrc = "";
  for (const f of migs) {
    const s = readFileSync(`supabase/migrations/${f}`, "utf8");
    const m = s.match(/create or replace function public\.has_permission\(cap text\)[\s\S]*?\$\$;/);
    if (m) hpSrc = m[0];
  }
  const sqlRoles = Object.fromEntries([...hpSrc.matchAll(/when '(\w+)'\s+then cap in \(([^)]*)\)/g)]
    .map((m) => [m[1], m[2].split(",").map((x) => x.trim().replace(/'/g, "")).sort().join(",")]));
  const staffSrc = readFileSync("src/lib/staff.ts", "utf8");
  const tsRoles = Object.fromEntries([...staffSrc.matchAll(/^\s+(veterinarian|receptionist|groomer|photographer): \[([^\]]*)\]/gm)]
    .map((m) => [m[1], m[2].split(",").map((x) => x.trim().replace(/"/g, "")).filter(Boolean).sort().join(",")]));
  check("قوالبُ الأدوار بالواجهة = has_permission بآخر هجرة (الطبيب، الاستقبال، العناية، المصوّر)",
    ["veterinarian", "receptionist", "groomer", "photographer"].every((r) => sqlRoles[r] && sqlRoles[r] === tsRoles[r]),
    JSON.stringify({ sqlRoles, tsRoles }));
  check("  والمصوّرُ بقالبه: الصور + المتجر", tsRoles.photographer === "manageProductPhotos,manageStore");

  // 0229: الحقلان صارا بمسار الصورة الواحد (usePhotoFlow) الذي تستعمله اللوحةُ والبطاقةُ والتصويرُ المتتابع.
  const pp = readFileSync("src/components/store/usePhotoFlow.tsx", "utf8");
  const ppBoard = readFileSync("src/components/store/StoreBoard.tsx", "utf8");
  const inputs = pp.match(/<input [^>]*type="file"[^>]*>/g) ?? [];
  check("صفحةُ المصوّر: كاميرا مباشرة + ألبوم بلا capture (كان الألبومُ مقفولاً بالموبايل)",
    inputs.length === 2 && inputs.filter((x) => /capture="environment"/.test(x)).length === 1
    && inputs.some((x) => !/capture=/.test(x) && /data-gallery-input/.test(x)) && inputs.every((x) => /onChange=\{onFile\("(camera|album)"\)\}/.test(x)),
    inputs);
  check("  وزرُّ الألبوم بكلّ بطاقة", /data-photo-gallery=\{p\.id\}/.test(ppBoard) && /onAlbum=\{\(\) => flow\.openAlbum\(p\)\}/.test(ppBoard)
    && /albumRef\.current\?\.click\(\)/.test(pp));
  check("  ولا صورةَ تُرفع قبل أن تُرى (المعاينة بين الملفّ والرفع)", /setStudio\(\{ target: p, file: f, source \}\)/.test(pp) && /<PhotoStudio /.test(pp));
  const errs = readFileSync("src/lib/errors.ts", "utf8");
  check("  وصورةٌ ما تنقرأ (HEIC) تُقال «اختر JPG أو PNG» لا بالإنكليزية الخامّ", /could not be read as an image/.test(errs));
  const lib = readFileSync("src/components/inventory/ImageLibraryPicker.tsx", "utf8");
  check("  والمكتبةُ الفاشلة تقول فشلَها وتُعيد (لا «المكتبة فارغة» عن خطأ)", /setFailed\(m\)/.test(lib) && !/setRows\(\[\]\)/.test(lib));

  const st = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  const sh = readFileSync("src/components/store/ProductSheet.tsx", "utf8");
  const prv = readFileSync("src/components/store/PriceReview.tsx", "utf8");
  const bd = readFileSync("src/components/store/StoreBoard.tsx", "utf8");
  /* منذ إصلاح «تحت الكلفة» بعد الحفظ: مسارُ الكادر يرقّع من الصفّ الراجع (السعرُ والعلامة)، والمصوّرُ
   * سعرَه وحده (العلامةُ لا تصله أصلاً). والشرطُ «ما رآه» باقٍ بالمسارين. */
  check("المتجر: المصوّرُ يعدّل السعرَ من store_set_price، والكادرُ من updateProduct كما كان (البطاقةُ والمراجعة)",
    st.includes("canSuggest={!photoMode}") && /const priceViaStore = baseRole === "photographer";/.test(bd)
    && /if \(priceViaStore\) \{\s*\n\s*await repo\.setStorePrice\(row\.id, v, row\.sell_price \?\? null\);\s*\n\s*onPatch\(row\.id, \{ sell_price: v \}\);\s*\n\s*\} else \{[\s\S]{0,200}pricePatchFrom\(await repo\.updateProduct\(row\.id, \{ sell_price: v \}, \{ sell_price: row\.sell_price \?\? 0 \}\), v\);[\s\S]{0,80}onPatch\(row\.id, patch\);/.test(sh)
    && /if \(priceViaStore\) \{\s*\n\s*await repo\.setStorePrice\(p\.id, v, p\.sell_price \?\? null\);\s*\n\s*onPatch\(p\.id, \{ sell_price: v \}\);\s*\n\s*\} else \{[\s\S]{0,200}pricePatchFrom\(await repo\.updateProduct\(p\.id, \{ sell_price: v \}, \{ sell_price: p\.sell_price \?\? 0 \}\), v\);[\s\S]{0,80}onPatch\(p\.id, patch\);/.test(prv));
  check("  وحقلُ سعرٍ مُسح ثم تُرك لا يكتب صفراً (Number(\"\") = 0)",
    /if \(!priceDraft\.trim\(\)\) return;\s*\n\s*const v = Math\.round\(Number\(priceDraft\) \* 100\) \/ 100;/.test(sh)
    && /if \(!raw\) return;\s*\n\s*const v = Math\.round\(Number\(raw\) \* 100\) \/ 100;/.test(prv));
  const m28s = readFileSync("supabase/migrations/0228_photographer_store.sql", "utf8");
  check("  والسعرُ بالخادم للمدير والطبيب والمصوّر وحدهم (لا استقبالٍ بإذن متجر)، ولا صفر",
    /auth_role\(\) in \('manager', 'veterinarian'\) or is_photographer\(\)/.test(m28s) && /p_price <= 0/.test(m28s));
  const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
  check("  ووصفُ إذن المتجر بشاشة الكادر يقول السعرَ (كان «بلا السعر»)", /سعر البيع/.test(ar.caps.manageStore) && !/والسعر\)/.test(ar.caps.manageStore));
  check("  والاقتراحُ (مبنيٌّ على المبيعات) ما زال ليس له، والطلباتُ مخفيّة",
    /\{canSuggest && canStore && <SuggestButton/.test(bd) && /filter\(\(x\) => !\(photoMode && x\.id === "orders"\)\)/.test(st));
  const repoSrc = readFileSync("src/lib/repo.ts", "utf8");
  check("  وstore_set_price تُرسل ما رآه (p_expected)", /rpc\("store_set_price", \{ p_product: productId, p_price: price, p_expected: expected \}\)/.test(repoSrc));
  const m28 = readFileSync("supabase/migrations/0228_photographer_store.sql", "utf8");
  check("  والبوّابةُ تفتح store_set_price وحدها — لا الطلبات ولا الاقتراح",
    /'store_set_price'/.test(m28) && !/'store_accept_order'|'store_suggest_products'|'clinic_quota_usage'/.test(m28.slice(m28.indexOf("create or replace function public.api_gate()"))));
  // 0229 أعاد تعريف البوّابة (آخرُ تعريفٍ يحكم): أبوابُ الأقسام والنشر والصورة والمراجعة — ولا طلبات.
  const m29 = readFileSync("supabase/migrations/0229_store_sections.sql", "utf8");
  const gate29 = m29.slice(m29.indexOf("create or replace function public.api_gate()"));
  check("  و0229: البوّابةُ تفتح أبوابَ الأقسام والنشر والصورة والمراجعة — ولا الطلبات ولا الاقتراح",
    ["store_sections_list", "store_section_save", "store_section_archive", "store_sections_reorder", "store_assign_section",
      "store_reorder_products", "store_publish", "store_set_image", "store_price_review", "store_set_price"].every((f) => gate29.includes(`'${f}'`))
    && !/'store_accept_order'|'store_suggest_products'|'clinic_quota_usage'/.test(gate29));
  check("  و«تحت الكلفة» لا تصل المصوّر (يكتب السعرَ — العلامةُ كانت تكشف الكلفة بالتجريب)",
    /v_cost := v_store and not is_photographer\(\);/.test(m29) && /'below_cost', case when v_cost then/.test(m29));
}

/* ── لوحةُ المتجر بعد تدقيقٍ عدائيّ: البطاقةُ والمراجعةُ والأقسامُ والإعدادات ───────────────
 * القواعدُ الصافية (تحت الكلفة، السعرُ المشبوه، معنى الرفض، تجديدُ خبيئة الإذن) تُفحص بالتشغيل
 * بـscripts/store-price-test.mjs؛ وهنا أنّ الشاشات تمرّ منها فعلاً. */
console.log("▸ لوحة المتجر — إخفاءٌ يُسأل، سعرٌ يُسأل، رفضٌ يُعيد، وقائمةٌ لا تُقصّ بصمت");
{
  const sh = readFileSync("src/components/store/ProductSheet.tsx", "utf8");
  const prv = readFileSync("src/components/store/PriceReview.tsx", "utf8");
  const sec = readFileSync("src/components/store/SectionsPanel.tsx", "utf8");
  const st = readFileSync("src/pages/ClinicStore.tsx", "utf8");
  const arS = JSON.parse(readFileSync("src/i18n/ar.json", "utf8")).sb;
  const enS = JSON.parse(readFileSync("src/i18n/en.json", "utf8")).sb;

  // ع٥/ع٣٥: منشورٌ ناقصٌ إذا انخفى ما يرجع إلا لمن يكمل (النشرُ بشروطه والإخفاءُ بلا شرط).
  check("ع٥: «اخفِ من المتجر» لمنشورٍ ناقص يُسأل بالسطر أوّلاً (لا نافذةَ متصفّح)",
    /const risky = hideRisk\(row, today\);\s*\n\s*const togglePublish = \(sure = false\) => \{\s*\n\s*if \(risky && !sure\) \{ playWarning\(\); setConfirmHide\(true\); return; \}/.test(sh)
    && sh.includes("data-hide-confirm") && /onClick=\{\(\) => void togglePublish\(true\)\}/.test(sh) && !/window\.confirm/.test(sh));
  check("  ويقول ما ينقصه وأنّه ما يرجع إلا لمن يكمل", /t\("sb\.hideAsk", [^)]*\{ name: row\.name, what: missingText \}\)/.test(sh)
    && /ما يرجع/.test(arS.hideAsk) && /comes back/.test(enS.hideAsk));

  // ع٧/ع٣٧: العلامةُ و«آخر تغيير» يتبعان الحفظ.
  check("ع٧: «تحت الكلفة» من الصفّ الراجع بالبطاقة والمراجعة (pricePatchFrom)",
    /pricePatchFrom\(await repo\.updateProduct\(row\.id/.test(sh) && /pricePatchFrom\(await repo\.updateProduct\(p\.id/.test(prv));
  check("  و«آخر تغيير» بالبطاقة يتبع ما حُفظ للتوّ، والخريطةُ تُجدَّد",
    /setJustSaved\(\{ line: \{ product_id: row\.id, changed_at: new Date\(\)\.toISOString\(\), old_price: was, new_price: saved/.test(sh)
    && /if \(loadPrices\) void loadPrices\(\)/.test(sh) && /const lastChange = justSaved\?\.line \?\? price;/.test(sh));

  // ع٩: price_moved يعيد القراءة ويقول السعرَ الجديد.
  check("ع٩: رفضٌ يقول «الصفُّ قديم» يعيد قراءةَ اللوحة (البطاقة والمراجعة)",
    /if \(stale\) onStale\(\);/.test(sh) && /if \(stale\) onStale\(\);/.test(prv) && /onStale: \(\) => void;/.test(sh) && /onStale: \(\) => void;/.test(prv));
  check("  والسعرُ الجديد يُقال حين يصل (sb.movedTo)", /setMovedFrom\(\{ was: row\.sell_price \?\? null \}\)/.test(sh) && /t\("sb\.movedTo"/.test(sh)
    && /setMoved\(\{ id: p\.id, was: p\.sell_price \?\? null \}\)/.test(prv) && /t\("sb\.movedTo"/.test(prv));

  // ع٨ (جانبُ المال): رمزٌ ممسوحٌ بحقل السعر ثمّ Enter لا يصير سعرَ الكاشير.
  check("ع٨: السعرُ المشبوه يُسأل قبل الكتابة بالبطاقة، وEnter وحده لا يؤكّده",
    /const doubt = priceDoubt\(priceDraft, v, row\.sell_price\);\s*\n\s*if \(doubt && !\(sure && priceAsk\?\.v === v\)\) \{ playWarning\(\); setPriceAsk\(\{ v, doubt \}\); return; \}/.test(sh)
    && /onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter"\) void savePrice\(\); \}\}/.test(sh) && /onClick=\{\(\) => void savePrice\(true\)\}/.test(sh));
  check("  وبالمراجعة (الحقلُ autoFocus): السؤالُ قبل write، والتأكيدُ بزرّ",
    /const doubt = priceDoubt\(raw, v, p\.sell_price\);\s*\n\s*if \(doubt\) \{ playWarning\(\); setAsk\(\{ id: p\.id, v, doubt \}\); return; \}\s*\n\s*await write\(p, v\);/.test(prv)
    && /onClick=\{\(\) => void write\(p, ask\.v\)\}/.test(prv)
    // والحقلُ يحفظ بـEnter **وبالخروج منه** — المساران يمرّان من save (فيها السؤال) لا من write مباشرةً.
    && /onBlur=\{\(\) => void save\(p\)\} onKeyDown=\{\(e\) => \{ if \(e\.key === "Enter"\) void save\(p\);/.test(prv)
    && (prv.match(/void write\(/g) ?? []).length === 1);

  // ع١٣/ع٤١: المنتقي لا يقصّ بصمت، وفشلُ النشر بعد نقلٍ ثبت يُقال وحده.
  check("ع١٣: «أضف منتجات» لا يقصّ بصمت — العددُ يُقال والباقي يُفتح",
    !/\.slice\(0, 200\)/.test(sec) && sec.includes("data-pick-capped") && sec.includes("data-pick-more") && /t\("sb\.sec\.shownOf"/.test(sec)
    && /setLimit\(\(n\) => n \+ PICK_PAGE\)/.test(sec));
  check("  ونقلٌ ثبت ثمّ نشرٌ فشل: يُقال النشرُ وحده، والشاشةُ تُعاد قراءتُها",
    /moved = true;[\s\S]{0,700}catch \(e\) \{\s*\n\s*playWarning\(\);\s*\n\s*toast\.error\(t\("sb\.sec\.pubAfterMove"[\s\S]{0,300}await onDone\(\);/.test(sec)
    && /if \(moved\) await onDone\(\);/.test(sec));

  // ترتيبُ «بلا قسم» (0229 بعد التدقيق): الخادمُ يقبل store_section_id IS NULL وحده.
  check("ترتيبُ «بلا قسم» يرسل ما بلا قسمٍ أصلاً وحده (المربوطُ بمؤرشفٍ يُعرض بلا أسهم)",
    /const inSection = \(id: string \| null\) => rows\.filter\(\(p\) => \(id \? p\.store_section_id === id : p\.store_section_id == null && p\.store_visible\)\)/.test(sec)
    && /const ids = moveInOrder\(inSection\(sec\)\.map/.test(sec)
    && /parked\.map\(\(p\) => \(\s*\n\s*<ProductLine key=\{p\.id\} p=\{p\} busy=\{busy === `p:\$\{p\.id\}`\} first last onOpen=\{\(\) => onOpen\(p\.id\)\}\s*\n\s*note=/.test(sec)
    && /\{onUp && onDown && onTop && \(/.test(sec));

  // ع٣٠: الواتساب والرابط والتشغيل للمدير وحده (قرار المالك ٥) — بالدور الفعليّ وعلى جهازٍ غير مقفول.
  check("ع٣٠: إعداداتُ المالك (واتساب، رابط، تشغيل) للمدير الفعليّ على جهازٍ غير مقفول",
    /const ownerFields = role === "manager" && !restricted;/.test(st)
    && /disabled=\{saving \|\| !ownerFields \|\| /.test(st) && (st.match(/readOnly=\{!ownerFields\}/g) ?? []).length === 2
    && /t\("sb\.set\.managerOnly"/.test(st));
  check("  وغيرُ المدير يحفظ الأجرةَ والنبذة بقيم القاعدة الطازجة للحقول الثلاثة",
    /const keep = ownerFields \? null : await repo\.getStoreProfile\(\);/.test(st)
    && /slug: keep \? keep\.slug : s,/.test(st) && /enabled: keep \? keep\.enabled : nextEnabled \?\? enabled,/.test(st)
    && /whatsapp: keep \? keep\.whatsapp \?\? null : whatsapp\.trim\(\) \|\| null,/.test(st));

  // ع٣١: جهازٌ مقفولٌ أو مصوّر — لا «تحت الكلفة» بأيّ شكل.
  check("ع٣١: hideCost يُطفئ «تحت الكلفة» بالبطاقة", /\{!hideCost && row\.below_cost && \(/.test(sh) && /hideCost: boolean;/.test(sh));
  check("  وبالمراجعة: لا شارة ولا إطار ولا عدّاد ولا تصفية ولا ترتيب",
    /const low = \(p: PhotoProduct\) => !hideCost && !!p\.below_cost;/.test(prv)
    && (prv.match(/\.below_cost/g) ?? []).length === 1
    && /const fx: F = hideCost && f === "belowCost" \? "all" : f;/.test(prv)
    && /\.\.\.\(!hideCost && \(counts\.belowCost > 0/.test(prv));

  // ع٣٢: by_name = null (المصوّر) يُرسم بلا اسم — لا «· null».
  check("ع٣٢: «آخر تغيير» بلا اسمٍ يُرسم بلا اسم (البطاقة والمراجعة)",
    /by: lastChange\.by_name \? ` · \$\{lastChange\.by_name\}` : "",/.test(sh) && /by: r\.by_name \? ` · \$\{r\.by_name\}` : "",/.test(prv));

  // ع٣٣: رفضُ not_authorized يجدّد خبيئةَ الإذن (staff.ts) بكلّ شاشات المتجر.
  check("ع٣٣: not_authorized ⇒ refreshMyPermissions (البطاقة، المراجعة، الأقسام، الإعدادات)",
    [sh, prv, sec, st].every((f) => /if \(refusedByRole\(e\)\) void refreshMyPermissions\(user\?\.email\);/.test(f)));

  // ع٤٠: نصُّ الناقص يُقرأ صحيحاً داخل «ناقصه: …» و«ما ينتشر قبل يكمل: …».
  check("ع٤٠: «ناقصه: صلاحية سارية» لا «صلاحية منتهية»", arS.miss.expired === "صلاحية سارية" && enS.miss.expired === "an unexpired date");
  check("  و«بالمخزون» = in inventory لا in stock (العدُّ يشمل النافد)", /in inventory/.test(enS.progressAll) && !/in stock/.test(enS.progressAll));

  // ع٤٥: Dialog يحشو px-6 pb-6 بنفسه — لا حشوَ ثانٍ.
  check("ع٤٥: البطاقةُ ومنتقي الأقسام بلا حشوٍ مكرّر داخل Dialog", !/px-6 pb-6/.test(sh) && !/px-6 pb-6/.test(sec));
}

{
  // ع٣٣: الشاشاتُ المركَّبة تسمع تحديثَ الصلاحيات بعد رفضٍ من الخادم — بلا الاشتراك تبقى أزرارٌ فُقد إذنُها.
  const up = readFileSync("src/hooks/usePermissions.ts", "utf8");
  check("ع٣٣: usePermissions يشترك بتحديث ذاكرة الصلاحيات", /subscribeMyPermissions\(\s*\(\)\s*=>\s*setOverrides\(peekMyPermissions\(/.test(up));
}
console.log(`\n${fails ? "✗" : "✓"} products-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
