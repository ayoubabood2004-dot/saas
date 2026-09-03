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
const { findByCode, looksLikeShelfCode, twinsByName } = await import(
  "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")
);

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

console.log("▸ الثوابت");
check("الرمزُ الحقيقي المقيس على الإنتاج (13 رقماً) ليس رقمَ رفّ", !looksLikeShelfCode("6970967772736"));
check("رمزٌ بعلامةِ اتجاه + أرقامٍ عربية يُطبَّع مرّةً واحدة ثم يثبت",
  findByCode([P("z", "x", "‏٢٤٧")], "247")?.id === "z");

console.log(`\n${fails ? "✗" : "✓"} products-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
