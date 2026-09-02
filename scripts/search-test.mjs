/* ============================================================================
 * فحص تطبيع البحث والباركود — على الحالات الحقيقية من قاعدة الإنتاج.
 *
 * هذي ليست حالاتٍ متخيَّلة. كلُّ زوجٍ هنا مأخوذٌ من مخزن أكبر عيادة، وكلُّه
 * كان يُنتج «ماكو منتج» عن مادةٍ موجودةٍ برفّها — فتُعاد إدخالها ويصير رصيدُها
 * نسختين. فالفحص يحرس الإصلاح: لو رجع أحدٌ فأزال التطبيع، ينكسر البناء.
 *
 *   node scripts/search-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* utils.ts يستورد i18next وclsx وtailwind-merge والعملة — ولا واحدٌ منها يخصّ
 * التطبيع. نبدّلها بجذوعٍ فارغة فنفحص الدالّتين على شِفرتهما الحقيقية. */
const stubs = {
  name: "stubs",
  setup(b) {
    const fake = (filter, contents) => {
      b.onResolve({ filter }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    };
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    fake(/^(i18next|clsx|tailwind-merge|\.\/currency)$/);
  },
};

const built = await esbuild.build({
  entryPoints: ["src/lib/utils.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", plugins: [stubs],
});
const { searchable, normalizeCode, normalizeAr } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

/* ── ١) الإملاء العربي: كل زوجٍ هنا حالةٌ وقعت فعلاً ────────────────────*/
console.log("▸ تطبيع البحث — أزواجٌ من مخزن الإنتاج");
const arPairs = [
  ["سبري حشرات خارجية", "سبري حشرات خارجيه", "تاء مربوطة"],
  ["عضاضة", "عضاضه", "تاء مربوطة"],
  ["عضاضة كلاب", "عضاضه كلاب", "تاء مربوطة"],
  ["سناك كلاب بايو لاين", "سناك كلاب بايولاين", "مسافة"],
  ["معلبات موجي 85g دجاج", "معلبات موجي85g دجاج", "مسافة"],
  ["لعبة طيور", "لعبه طيور", "تاء مربوطة"],
  ["أموكسيسيلين", "اموكسيسيلين", "همزة"],
  ["إبرة", "ابره", "همزة + تاء"],
];
for (const [a, b, why] of arPairs) {
  check(`«${a}» ≡ «${b}» (${why})`, searchable(a) === searchable(b), `${searchable(a)} ≠ ${searchable(b)}`);
}
// والبحث الجزئي يشتغل بالاتجاهين
check("بحثٌ جزئي: «خارجيه» تلقى «سبري حشرات خارجية»",
  searchable("سبري حشرات خارجية").includes(searchable("خارجيه")));
check("ولا يطابق ما لا يُشبه", !searchable("سناك كلاب").includes(searchable("معلبات")));

/* ── ٢) الأرقام: لوحةٌ عربية مقابل ماسحٍ لاتينيّ ────────────────────────*/
console.log("▸ تطبيع الأرقام");
check("«٢٣٨» ≡ «238»", normalizeCode("٢٣٨") === "238", normalizeCode("٢٣٨"));
check("الفارسية «۲۳۸» ≡ «238»", normalizeCode("۲۳۸") === "238", normalizeCode("۲۳۸"));
check("والبحث بالاسم يوحّدها أيضاً", searchable("علبة ٥٠٠") === searchable("علبة 500"));

/* ── ٣) الباركود: المحارف غير المرئية ───────────────────────────────────*/
console.log("▸ تطبيع الباركود");
// هذي الحالة حقيقية: صفٌّ بقاعدة الإنتاج باركودُه علامةُ اتجاهٍ ثم 8989،
// يبدو «8989» بالشاشة ولا يتطابق مع مسحةِ 8989 أبداً.
check("علامة اتجاه (RLM) تُشال", normalizeCode("‏8989") === "8989", JSON.stringify(normalizeCode("‏8989")));
check("علامة LRM تُشال", normalizeCode("‎123") === "123");
check("عرضٌ صفريّ (ZWSP) يُشال", normalizeCode("69​72748378670") === "6972748378670");
check("BOM يُشال", normalizeCode("﻿247") === "247");
check("عوازل الاتجاه تُشال", normalizeCode("⁦247⁩") === "247");
check("المسافات الطرفية تُشال", normalizeCode("  247  ") === "247");
check("والمسافة الداخلية أيضاً", normalizeCode("69 727 483") === "69727483");
check("والباركود السليم ما يتغيّر", normalizeCode("6972748378670") === "6972748378670");
check("والفارغ يبقى فارغاً", normalizeCode("") === "" && normalizeCode(null) === "" && normalizeCode(undefined) === "");

/* ── ٤) الثابت الحاكم: الطرفان يمرّان من نفس الدالّة ────────────────────*/
console.log("▸ الثوابت");
// تطبيعُ طرفٍ واحد أسوأ من لا تطبيع — يفشل بصمتٍ ويبدو أنه يعمل.
for (const s of ["سبري حشرات خارجية", "٢٣٨", "‏8989", "  Royal Canin  "]) {
  check(`مطبَّعٌ مرّتين = مطبَّعٌ مرّة: ${JSON.stringify(s).slice(0, 24)}`,
    searchable(searchable(s)) === searchable(s) && normalizeCode(normalizeCode(s)) === normalizeCode(s));
}
check("normalizeAr ما زالت مصدَّرة (يستعملها ثمانية مواضع)", typeof normalizeAr === "function");

console.log(`\n${fails ? "✗" : "✓"} search-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
