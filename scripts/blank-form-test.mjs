/* ============================================================================
 * الوصلُ الفارغ — ورقةٌ تُملأ بالقلم، وثلاثةُ شروطٍ تُفحص لأنها تنكسر بصمت.
 *
 * ١) **قالبٌ واحدٌ لا قالبان.** الفارغُ والمملوءُ يطبعان `A4_CSS` نفسَها.
 *    ولو نُسخت الأنماطُ يوماً، لانحرف القالبان بشهر — الترويسةُ تكبر هنا ولا
 *    تكبر هناك — فيستلم الزبونُ ورقتين من عيادةٍ واحدةٍ لا تشبهان بعضَهما،
 *    ولا يمسك ذلك أحدٌ إلا بمقارنةِ ورقتين مطبوعتين بيده.
 *
 * ٢) **لا رقمَ فاتورةٍ مطبوعٌ مسبقاً.** ورقةٌ تحمل `INV-XXXXXX` ولا وجودَ لها
 *    بالسجلّ تصنع يومَ تُدخَل إمّا رقمَين لفاتورةٍ واحدة أو فاتورتين برقمٍ
 *    واحد. الخانةُ سطرٌ فارغٌ يكتبه من يملأ.
 *
 * ٣) **الورقةُ تقول إنها تُملأ باليد.** فارغةٌ بترويسة عيادةٍ تشبه إيصالاً
 *    تماماً، والشارةُ هي الفرق.
 *
 * ويُفحص أيضاً أنّ **المملوءَ لم يتغيّر**: نفسُ الأنماط، ورقمُ الفاتورة
 *    مطبوعٌ كما كان — إضافةُ الفارغ لا تمسّ ما يُسلَّم اليوم.
 *
 *   node scripts/blank-form-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const AR = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const EN = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));

const built = await esbuild.build({
  entryPoints: ["src/lib/invoicePrint.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|@\/lib\/printer|@\/lib\/appUrl|@\/lib\/utils)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, (a) => ({
        contents:
          a.path === "i18next"
            /* القاموسُ الحقيقيّ لا نصٌّ مُخترَع: الفحصُ يمسك مفتاحاً ناقصاً
               بـ`ar.json` كما يمسكه المستخدم — بنصٍّ إنكليزيٍّ على ورقةٍ عربية. */
            ? `const ar = ${JSON.stringify(AR)}, en = ${JSON.stringify(EN)};
               const get = (o, k) => k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
               export default { t: (k, o) => get(((o && o.lng) || "").startsWith("ar") ? ar : en, k) ?? (o && o.defaultValue) ?? k };`
          : a.path === "@/lib/printer" ? `export const getReceiptWidth = () => 72;`
          : a.path === "@/lib/appUrl" ? `export const siteHost = () => "doctorvet.vet";`
          : `export const currencySymbol = () => "د.ع";`,
        loader: "js",
      }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "blankform-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const mod = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

const OPTS = {
  clinicName: "عيادة الرحمة البيطرية", clinicPhone: "07701234567", brand: "doctorVet",
  format: "a4", lang: "ar", logoUrl: null, facebook: "rahma.vet", instagram: "rahma.vet.clinic",
  storeUrl: null, qrDataUrl: null, sellerName: "سارة منصور",
};
const INV = {
  id: "7f3a2b91-0000-4000-8000-00000abc0091", created_at: "2026-09-20T08:24:00.000Z",
  customer_name: "أحمد الجبوري", customer_phone: "07701234567", pet_name: "لولو",
  subtotal: 187000, discount: 12000, total: 175000, amount_paid: 175000, status: "open",
  payment_method: "cash", payment_details: [], notes: null, print_count: 0,
};
const ITEMS = [{ name: "Royal Canin 4kg", qty: 1, unit_price: 32000, line_total: 32000 }];

const styleOf = (html) => html.slice(html.indexOf("<style>") + 7, html.indexOf("</style>"));
const bodyOf = (html) => html.slice(html.indexOf("<body>"));

const blank = mod.buildBlankFormHTML(OPTS);
const blankEn = mod.buildBlankFormHTML({ ...OPTS, lang: "en" });
const filled = mod.buildInvoiceHTML(INV, ITEMS, OPTS);
const thermal = mod.buildInvoiceHTML(INV, ITEMS, { ...OPTS, format: "thermal" });

console.log("▸ ١) قالبٌ واحدٌ لا قالبان");
/* الشرطُ المقيس: كلُّ قاعدةٍ بأنماط A4 المملوءة موجودةٌ حرفياً بالفارغة.
   لا «متشابهتان» ولا «بنفس الروح» — نصٌّ واحد. */
const a4Css = styleOf(filled).replace("@page { size: A4; margin: 0; }", "").trim();
const blankCss = styleOf(blank).replace("@page { size: A4; margin: 0; }", "").trim();
check("أنماطُ A4 المملوءة موجودةٌ كلُّها بالفارغة", blankCss.includes(a4Css.slice(0, a4Css.indexOf(".watermark.faint")).trim() || a4Css));
check("  والفارغةُ ورقةُ A4 لا ورقةٌ بلا قياس", styleOf(blank).includes("@page { size: A4; margin: 0; }"));
check("  ونفسُ صنفِ الترويسة", bodyOf(blank).includes('class="masthead"') && bodyOf(filled).includes('class="masthead"'));
check("  ونفسُ الشريط الملوّن", bodyOf(blank).includes('class="spine"') && bodyOf(filled).includes('class="spine"'));
check("  ونفسُ صندوقِ المجاميع", bodyOf(blank).includes('class="tot"') && bodyOf(filled).includes('class="tot"'));
check("  ونفسُ خطِّ التوقيع والختم", bodyOf(blank).includes('class="sign"') && bodyOf(filled).includes('class="sign"'));
/* سطرُ التواصل من دالّةٍ واحدةٍ: الهاتفُ وفيسبوك وإنستغرام يظهرون بالورقتين. */
for (const [tag, html] of [["الفارغة", blank], ["المملوءة", filled]]) {
  check(`  وسطرُ التواصل بـ${tag}`, html.includes("rahma.vet") && html.includes("07701234567"));
}

console.log("▸ ٢) لا رقمَ فاتورةٍ مخترَعاً بالفارغة");
check("لا `INV-` بأيّ موضعٍ من الورقة الفارغة", !blank.includes("INV-"), blank.match(/INV-[A-Z0-9]{0,8}/)?.[0]);
check("  ولا بالإنكليزية", !blankEn.includes("INV-"));
check("  وخانةُ الرقم سطرٌ فارغٌ يُكتب", bodyOf(blank).includes('class="docf"') && bodyOf(blank).includes('class="wl"'));
/* والمقابل: المملوءةُ **لازم** تحمله — فحصٌ ينجح لو ألغينا الرقمَ من
   الاثنتين معاً لا يفحص شيئاً. */
check("والمملوءةُ تحمل رقمَها كما كانت", filled.includes("INV-BC0091"));

console.log("▸ ٣) الورقةُ تقول إنها تُملأ باليد");
check("شارةُ «تُملأ باليد» بالعربية", blank.includes(AR.retail.rcHandFill));
check("  وبالإنكليزية", blankEn.includes(EN.retail.rcHandFill));
check("  وليست بالمملوءة", !filled.includes(AR.retail.rcHandFill));

console.log("▸ ٤) خاناتُ ما طلبه المالك: الخصم والباقة");
check("سطرُ الخصم", blank.includes(AR.retail.discount ?? "الخصم") || blank.includes("الخصم"));
check("خانةُ الباقة/العرض", blank.includes(AR.retail.rcPackage));
check("  وبالإنكليزية", blankEn.includes(EN.retail.rcPackage));
check("طرقُ الدفع الأربع خاناتٌ تُعلَّم", (blank.match(/class="b"><i><\/i>/g) || []).length === 4);
check("  ومنها الآجل", blank.includes(AR.retail.rcCredit));
check("سطرا المدفوع والمتبقّي", blank.includes(AR.retail.paid ?? "المدفوع") || blank.includes("المدفوع"));

console.log("▸ ٥) الأسطرُ الفارغة: عددٌ يملأ الورقة ولا يتجاوزها");
const rowsOf = (h) => (h.match(/<tr><td class="i-idx">/g) || []).length;
check("الافتراضيّ تسعةُ أسطر (مقيسةٌ على ارتفاع A4)", rowsOf(blank) === 9, String(rowsOf(blank)));
check("  والطلبُ يُحترم", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: 14 })) === 14);
check("  ويُقيَّد أدنى", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: 1 })) === 4);
check("  ويُقيَّد أعلى (لا صفحةٌ ثانية)", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: 99 })) === 20);
check("  وقيمةٌ فاسدةٌ لا تكسرها", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: Number.NaN })) >= 4);

console.log("▸ ٦) الاتجاهُ واللغة");
check("العربيةُ rtl", blank.includes('dir="rtl"') && blank.includes('lang="ar"'));
check("الإنكليزيةُ ltr", blankEn.includes('dir="ltr"') && blankEn.includes('lang="en"'));
/* مفتاحٌ ناقصٌ بالقاموس يسقط لـ`defaultValue` الإنكليزيّ — فتخرج ورقةٌ عربية
   بكلمةٍ إنكليزية. الفحصُ يقرأ القاموسَ الحقيقيّ فيمسكها. */
for (const k of ["rcPackage", "rcCredit", "rcHandFill", "rcNo", "rcSigCustomer", "rcSigClinic", "rcSettled", "rcPartly", "rcProforma"]) {
  check(`  \`${k}\` مترجمٌ بالعربية`, typeof AR.retail?.[k] === "string" && AR.retail[k] !== EN.retail?.[k]);
}

console.log("▸ ٧) الحراريُّ لم يُمسّ");
check("قالبُ ٨٠مم ما زال يطبع بنودَه", thermal.includes('class="item"'));
check("  وبلا أنماط A4", !thermal.includes(".masthead"));

console.log(fails ? `\n✗ blank-form-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ blank-form-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
