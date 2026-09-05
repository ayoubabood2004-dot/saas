/* ============================================================================
 * فحص ترجمة أخطاء القاعدة — على `src/lib/errors.ts` نفسه.
 *
 * القاعدة ترفض بجملةٍ إنجليزية تقنية، ونحن نلتقطها **باسم القيد**. وهذا نوعُ
 * شِفرةٍ يفشل بصمت: تعبيرٌ منتظم يخطئ الالتقاط، أو مفتاحٌ فيه حرفٌ زائد،
 * فتبقى الرسالة العامّة تظهر ولا أحد يلاحظ أن التحسين لم يعمل يوماً.
 *
 * فنفحص ثلاثة أشياء:
 *   ١) الالتقاط يعمل على **نصّ الرسالة الحقيقيّ** كما تلفظه بوستغريس ١٧
 *      (مأخوذٌ من الإنتاج حرفاً بحرف، لا مؤلَّفاً).
 *   ٢) وقيدٌ لا نصَّ له يسقط للرسالة العامّة — ولا يُظهر اسمَ مفتاحٍ لطبيب.
 *   ٣) وكلُّ اسم قيدٍ بملفّات اللغة موجودٌ فعلاً بالقاعدة — فمفتاحٌ بحرفٍ
 *      زائد رسالةٌ ما تظهر أبداً.
 *
 *   node scripts/errors-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";

const built = await esbuild.build({
  entryPoints: ["src/lib/errors.ts"], bundle: true, format: "esm", write: false, platform: "neutral",
});
const E = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const en = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));
const at = (o, k) => k.split(".").reduce((x, p) => (x == null ? x : x[p]), o);
/** بديلٌ مبسّط لـi18next: يقرأ ar.json، ويحترم `defaultValue` والنصَّ الثاني. */
const t = (key, arg) => {
  const v = at(ar, key);
  if (typeof v === "string") return v;
  if (typeof arg === "string") return arg;
  if (arg && typeof arg === "object" && "defaultValue" in arg) return arg.defaultValue;
  return key;
};

let fail = 0;
const chk = (label, got, want) => {
  const g = JSON.stringify(got), w = JSON.stringify(want);
  if (g === w) console.log(`   ✓ ${label}`);
  else { console.log(`   ✗ ${label} — طلع «${g}» والمتوقّع «${w}»`); fail = 1; }
};

console.log("▸ رسائل القيود…");

// ١) نصُّ الرفض الحقيقيّ من الإنتاج (فُحص بـget stacked diagnostics)
const real = { code: "23514", message: 'new row for relation "expenses" violates check constraint "expenses_amount_check"' };
chk("قيدُ مبلغ السحب ينلتقط", E.describeDbError(real, t), at(ar, "errors.c.expenses_amount_check"));
chk("وما ينخدع بـrelation قبله", /مبلغ السحب/.test(E.describeDbError(real, t)), true);

// وخرقُ الفريد: صيغةٌ ثانية تماماً
const dup = { code: "23505", message: 'duplicate key value violates unique constraint "clinic_notes_clinic_id_note_date_key"' };
chk("وخرقُ الفريد كذلك", E.describeDbError(dup, t), at(ar, "errors.c.clinic_notes_clinic_id_note_date_key"));

// الباركود المكرّر — كان يُترجم إلى جملةٍ عن «الأقفاص»، فيفهم المستخدم أن
// الحفظ فشل ويعيد الإدخال بلا باركود. الآن يُقال بالاسم: «موجود على منتج ثاني».
const dupBarcode = { code: "23505", message: 'duplicate key value violates unique constraint "products_clinic_barcode_idx"' };
chk("الباركود المكرّر له جملته لا جملةُ الأقفاص", E.describeDbError(dupBarcode, t), at(ar, "errors.c.products_clinic_barcode_idx"));
chk("وهي تذكر العيادة لا القفص", /بعيادتك|مخزن/.test(E.describeDbError(dupBarcode, t)) && !/قفص/.test(E.describeDbError(dupBarcode, t)), true);

// رفضٌ مقصودٌ من دالّةِ قاعدةٍ يشرح نفسَه (0157): `raise … using hint` يضع الرمزَ
// اللاتينيّ بـmessage والشرحَ العربيَّ بـhint. وبلا التقاطِ hint يقرأ المديرُ
// «invoice_has_open_delivery» بالحرف — رسالةٌ لا تُفهم ولا تُعالَج.
const blocked = {
  code: "P0001",
  message: "invoice_has_open_delivery",
  hint: "هذه الفاتورة عليها طلبُ توصيلٍ لم يُحصَّل بعد. حصِّله أو أرجِعه أولاً.",
};
chk("رسالةُ المنع العربية توصل الشاشة", E.describeDbError(blocked, t), blocked.hint);
chk("ولا يُعرض الرمزُ اللاتينيّ", /invoice_has_open_delivery/.test(E.describeDbError(blocked, t)), false);
// وhint الإنكليزيُّ التقنيّ لأخطاء بوستغريس العامّة لا يُعرض: الشرطُ P0001 وحده.
const pgHint = { code: "23503", message: "insert or update violates foreign key", hint: "Key is not present in table." };
chk("وhint لخطأٍ عامٍّ لا يُعرض خاماً", /Key is not present/.test(E.describeDbError(pgHint, t)), false);
chk("ورفضٌ بـP0001 بلا hint يسقط للسلوك القديم", typeof E.describeDbError({ code: "P0001", message: "boom" }, t), "string");

// وسطرُ الفاتورة — أهمّها، وهو الذي أوقف بيعةً حيّة يوم كُتب هذا
const line = { code: "23514", message: 'new row for relation "invoice_items" violates check constraint "invoice_items_nonneg"' };
chk("وسطرُ الفاتورة", E.describeDbError(line, t), at(ar, "errors.c.invoice_items_nonneg"));

// ٢) قيدٌ لا نصَّ له: يسقط للعامّة ولا يطبع مفتاحاً
const unknown = { code: "23514", message: 'new row for relation "x" violates check constraint "some_internal_enum_check"' };
chk("قيدٌ مجهول يسقط للرسالة العامّة", E.describeDbError(unknown, t), at(ar, "errors.invalidValue"));
chk("ولا يطبع اسم مفتاح", /errors\.c\./.test(E.describeDbError(unknown, t)), false);

// ورسالةٌ بلا اسم قيدٍ إطلاقاً: الرموز العامّة كما كانت
chk("وبلا اسم قيد يبقى السلوك القديم",
    E.describeDbError({ code: "23505", message: "duplicate key" }, t), at(ar, "errors.duplicate"));

// والشبكةُ تسبق كلَّ شيء — ما تنقرأ قيداً من انقطاع
chk("والانقطاع يسبق", E.describeDbError({ message: "TypeError: Failed to fetch" }, t), at(ar, "errors.network"));

// ٣) كلُّ مفتاحٍ يقابل قيداً موجوداً فعلاً.
//    ولا تكفي قراءةُ الهجرات: أكثرُ الأسماء يولّده بوستغريس من نصّ العمود
//    (`amount numeric check (amount > 0)` → `expenses_amount_check`) فلا يظهر
//    بأي ملفّ هجرة. فاللقطةُ من الكتلوج الحيّ هي المرجع.
const known = new Set(JSON.parse(readFileSync("scripts/db-constraints.json", "utf8")).names);
const keys = Object.keys(at(ar, "errors.c") ?? {});
chk("أكو مفاتيح أصلاً", keys.length > 0, true);
const missing = keys.filter((k) => !known.has(k));
chk("وكلُّها تقابل قيداً موجوداً", missing, []);
chk("والعربي والإنجليزي متطابقان", Object.keys(at(en, "errors.c") ?? {}), keys);

// تحديثٌ بلا صفّ (0157 واجهة): كان «نجاحاً» صامتاً بالتوصيل — اختار السائقَ فما
// صار شي، وحصّل فبقي الطلبُ مكانه. صار خطأً مترجَماً يقول ماذا يفعل.
const noRow = new Error("no_row_updated");
chk("تحديثٌ لم يمسّ صفاً له جملتُه", E.describeDbError(noRow, t), at(ar, "errors.noRowUpdated"));
chk("  وهي تقول «حدّث» لا «خطأ»", /حدّث الصفحة/.test(E.describeDbError(noRow, t)), true);

// سياسةٌ تستعلم من جدولها (0159): الخادم يرجع 500 برمز 42P17 ونصٍّ إنكليزيٍّ
// تقنيّ. كان يُبلَع ويظهر «تم»؛ فصار جملةً تقول «لن ينفع التكرار» وتحمل الرمز.
const recur = { code: "42P17", message: 'infinite recursion detected in policy for relation "delivery_orders"' };
chk("سياسةٌ متكرّرة تُقال بالاسم لا بالإنكليزي", E.describeDbError(recur, t), at(ar, "errors.policyRecursion"));
chk("  وتحمل الرمزَ للدعم", /42P17/.test(E.describeDbError(recur, t)) && !/infinite recursion/.test(E.describeDbError(recur, t)), true);

console.log("");
if (fail) { console.log("✗ اكو فحصٌ فشل"); process.exit(1); }
console.log("✓ كل فحوص الرسائل عبرت");
