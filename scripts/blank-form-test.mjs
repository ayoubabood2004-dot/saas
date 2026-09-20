/* ============================================================================
 * وصلُ استلام doctorVet — ورقةٌ للمنصّة، وثلاثةُ شروطٍ تنكسر بصمتٍ فتُفحص.
 *
 * ١) **قالبٌ واحدٌ لا قالبان.** وصلُ المنصّة ووصلُ العيادة يطبعان `A4_CSS`
 *    نفسَها. ولو نُسخت الأنماطُ يوماً لانحرف القالبان بشهر — الترويسةُ تكبر
 *    هنا ولا تكبر هناك — ولا يمسك ذلك أحدٌ إلا بمقارنةِ ورقتين بيده.
 *
 * ٢) **هويّةُ المنصّة وحدَها، وبلا معلوماتِ تواصل** (قرارُ المالك). لا اسمَ
 *    عيادةٍ بالترويسة ولا هاتفَ ولا حسابَ تواصل: العيادةُ خانةٌ تُملأ لأنها
 *    الطرفُ الدافع لا مُصدِرُ الوصل. وفحصُ «لا هاتف» يمسك عودةَ سطرِ التواصل
 *    لو أُعيد يوماً بسهو.
 *
 * ٣) **لا رقمَ مطبوعٌ مسبقاً.** ورقةٌ تحمل `INV-XXXXXX` ولا وجودَ لها بالسجلّ
 *    تصنع يومَ تُدخَل إمّا رقمَين لدفعةٍ واحدة أو دفعتين برقمٍ واحد.
 *
 * ويُفحص أيضاً أنّ **وصلَ العيادة لم يتغيّر**: نفسُ الأنماط، ورقمُ الفاتورة
 *    مطبوعٌ كما كان — ورقةُ المنصّة لا تمسّ ما يُسلَّم بالعيادات اليوم.
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

const OPTS = { brand: "doctorVet", lang: "ar" };
/* وصلُ العيادة للمقارنة — بهاتفٍ وحسابات، وهي ما **لا** يجوز ظهورُه بورقة المنصّة. */
const CLINIC = {
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
const filled = mod.buildInvoiceHTML(INV, ITEMS, CLINIC);
const thermal = mod.buildInvoiceHTML(INV, ITEMS, { ...CLINIC, format: "thermal" });

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
check("  ونفسُ سطرِ الإثبات مكانَ خطِّ القصّ", bodyOf(blank).includes('class="proof"'));

console.log("▸ ١ب) هويّةُ المنصّة وحدَها — بلا اسمِ عيادةٍ ولا معلوماتِ تواصل");
check("اسمُ doctorVet بالترويسة", bodyOf(blank).includes("doctorVet"));
check("  وسطرُ التعريف تحته", blank.includes(AR.retail.rcTagline));
check("  ولا اسمَ عيادةٍ مطبوعاً — العيادةُ خانةٌ تُملأ", !blank.includes("عيادة الرحمة") && blank.includes(AR.retail.rcClinic));
/* قرارُ المالك حرفياً: «بدون معلومات تواصل». وسطرُ التواصل موجودٌ بالشِفرة
   ويُستعمل بوصل العيادة — فعودتُه هنا بسهوٍ ممكنةٌ ويمسكها هذا. */
check("لا هاتفَ بورقة المنصّة", !blank.includes("07701234567") && !blank.includes("tel:"));
check("  ولا حساباتِ تواصل", !blank.includes("rahma.vet") && !blank.includes('class="contact"'));
check("  ولا رمزَ QR", !blank.includes('class="qrbox"'));
/* والمقابل: وصلُ العيادة **لازم** يحملها — وإلا لم يفحص الفحصُ شيئاً. */
check("ووصلُ العيادة يحمل تواصلَه كما كان", filled.includes("rahma.vet") && filled.includes("07701234567"));
check("شعارُ doctorVet مرسومٌ بالورقة", blank.includes('viewBox="0 0 64 64"') && blank.includes("#ff7a45"));

console.log("▸ ٢) لا رقمَ فاتورةٍ مخترَعاً بالفارغة");
check("لا `INV-` بأيّ موضعٍ من الورقة الفارغة", !blank.includes("INV-"), blank.match(/INV-[A-Z0-9]{0,8}/)?.[0]);
check("  ولا بالإنكليزية", !blankEn.includes("INV-"));
check("  وخانةُ الرقم سطرٌ فارغٌ يُكتب", bodyOf(blank).includes('class="docf"') && bodyOf(blank).includes('class="wl"'));
/* والمقابل: المملوءةُ **لازم** تحمله — فحصٌ ينجح لو ألغينا الرقمَ من
   الاثنتين معاً لا يفحص شيئاً. */
check("والمملوءةُ تحمل رقمَها كما كانت", filled.includes("INV-BC0091"));

console.log("▸ ٣) الورقةُ وصلُ استلامٍ لا فاتورةَ عيادة");
check("عنوانُها «وصل استلام»", blank.includes(AR.retail.rcPayReceipt));
check("  وبالإنكليزية", blankEn.includes(EN.retail.rcPayReceipt));
check("سطرُ الإثبات", blank.includes(AR.retail.rcProof));
/* «شيل الحيوان» — الحقلُ كان بالورقة حين ظننتُها وصلَ عيادةٍ لزبون. */
check("لا خانةَ حيوانٍ (طلبُ المالك)", !blank.includes(AR.retail.pet ?? "الحيوان") && !blank.includes("الحيوان"));
check("وجملةُ الختام غيرُ «شكراً لزيارتكم»", blank.includes(AR.retail.rcTrust) && !blank.includes(AR.retail.thanks ?? "شكراً لزيارتكم"));

console.log("▸ ٤) خاناتُ ما طلبه المالك: الباقة والمدّة والخصم");
check("عمودُ الباقة أو البند", blank.includes(AR.retail.rcPlanItem));
check("  وعمودُ المدّة", blank.includes(AR.retail.rcTerm));
check("خانتا فترة الاشتراك من/إلى", blank.includes(AR.retail.rcSubPeriod) && blank.includes(AR.retail.rcFrom) && blank.includes(AR.retail.rcTo));
check("سطرُ الخصم", blank.includes("الخصم"));
check("خاناتُ العيادة والمسؤول والهاتف والمستلم", [AR.retail.rcClinic, AR.retail.rcPerson, AR.retail.rcReceivedBy].every((k) => blank.includes(k)));
check("طرقُ الدفع الأربع خاناتٌ تُعلَّم", (blank.match(/class="b"><i><\/i>/g) || []).length === 4);
check("  ومنها الآجل", blank.includes(AR.retail.rcCredit));
check("سطرا المدفوع والمتبقّي", blank.includes("المدفوع"));

console.log("▸ ٥) الأسطرُ الفارغة: عددٌ يملأ الورقة ولا يتجاوزها");
const rowsOf = (h) => (h.match(/<tr><td class="i-idx">/g) || []).length;
check("الافتراضيّ ثمانيةُ أسطر (مقيسةٌ على ارتفاع A4)", rowsOf(blank) === 8, String(rowsOf(blank)));
check("  والطلبُ يُحترم", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: 14 })) === 14);
check("  ويُقيَّد أدنى", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: 1 })) === 3);
check("  ويُقيَّد أعلى (لا صفحةٌ ثانية)", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: 99 })) === 20);
check("  وقيمةٌ فاسدةٌ لا تكسرها", rowsOf(mod.buildBlankFormHTML({ ...OPTS, rows: Number.NaN })) >= 3);

console.log("▸ ٦) الاتجاهُ واللغة");
check("العربيةُ rtl", blank.includes('dir="rtl"') && blank.includes('lang="ar"'));
check("الإنكليزيةُ ltr", blankEn.includes('dir="ltr"') && blankEn.includes('lang="en"'));
/* مفتاحٌ ناقصٌ بالقاموس يسقط لـ`defaultValue` الإنكليزيّ — فتخرج ورقةٌ عربية
   بكلمةٍ إنكليزية. الفحصُ يقرأ القاموسَ الحقيقيّ فيمسكها. */
for (const k of ["rcPayReceipt", "rcTagline", "rcClinic", "rcPerson", "rcReceivedBy", "rcPlanItem", "rcTerm", "rcSubPeriod", "rcProof", "rcTrust", "rcSigPayer", "rcSigIssuer", "rcCredit", "rcNo", "rcSettled", "rcPartly", "rcProforma"]) {
  check(`  \`${k}\` مترجمٌ بالعربية`, typeof AR.retail?.[k] === "string" && AR.retail[k] !== EN.retail?.[k]);
}

console.log("▸ ٧) الحراريُّ لم يُمسّ");
check("قالبُ ٨٠مم ما زال يطبع بنودَه", thermal.includes('class="item"'));
check("  وبلا أنماط A4", !thermal.includes(".masthead"));

console.log(fails ? `\n✗ blank-form-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ blank-form-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
