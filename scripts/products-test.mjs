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
import { readFileSync } from "node:fs";

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
  const repo = readFileSync("src/lib/repo.ts", "utf8");
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
  const repo = readFileSync("src/lib/repo.ts", "utf8");
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
  check("  والقالبُ يعرض المدفوعَ الحاليّ", pur.includes("placeholder={money(editing ? (editing.purchase.amount_paid ?? total) : total)}"));

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
  check("  ومفتاحُ اسم الشركة يبني على searchable بالنسختين",
    (inv2.split("const normKey = (s: string) => searchable(normName(s))").length - 1) === 1
    && (pur.split("const normKey = (s: string) => searchable(normName(s))").length - 1) === 1);

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

console.log(`\n${fails ? "✗" : "✓"} products-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
