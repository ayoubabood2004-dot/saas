#!/usr/bin/env node
/* ============================================================================
 * حارس اللغات — المرحلة ٠ من خطة العالمية: «سدّ النزيف قبل تجفيف البحيرة».
 *
 * فحصان يفشلان البناء:
 *   ١) تكافؤ المفاتيح: كل مفتاح موجود بكل ملفات اللغات — مفتاح ناقص يعني
 *      زر يظهر بلغة غريبة وسط الواجهة.
 *   ٢) سقف النص الصلب (ratchet): لكل ملف سقف من الأسطر العربية خارج t()
 *      مسجَّل في i18n-baseline.json. تجاوز السقف = نص صلب جديد = رفض.
 *      الانخفاض يُثبَّت تلقائياً بـ--update فالسقف ينزل ولا يرتفع أبداً.
 *
 * ملفات المحتوى المعرفي (الدليل الدوائي، المعرفة السريرية، المساعد…) مستثناة
 * من السقف عمداً: عربيتها محتوى مقصود يعالَج بمسار الترجمة المتخصصة لا
 * بالمفاتيح — انظر دراسة «doctorVet بلغات العالم» §٢.
 * ==========================================================================*/
import { readFileSync, writeFileSync, existsSync } from "fs";
import { execSync } from "child_process";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BASELINE = join(ROOT, "scripts", "i18n-baseline.json");
const UPDATE = process.argv.includes("--update");

/* طبقة المحتوى: عربيتها مقصودة ولا تُعدّ نصاً صلباً مهرَّباً. */
const CONTENT_FILES = new Set([
  "src/lib/clinicalKnowledge.ts", // معرفة سريرية — تأليف طبي
  "src/lib/assistantKb.ts",       // أجوبة المساعد
  "src/lib/vetFormulary.ts",      // الدليل الدوائي
  "src/lib/labCatalog.ts",        // كتالوج التحاليل
  "src/lib/surgeryCatalog.ts",    // كتالوج العمليات
  "src/lib/soapTemplates.ts",     // قوالب SOAP
  "src/lib/dialcodes.ts",         // أسماء الدول (تُستبدل بـCLDR لاحقاً)
  "src/lib/governorates.ts",      // المحافظات العراقية
  "src/pages/AdminBilling.tsx",   // لوحة المنصّة — للمشغّل وحده، عربية عمداً
  // رموز قوالب الرسائل ({{اسم_المالك}}…): ليست نصاً معروضاً بل **معرّفات**
  // يجب أن تطابق حرفياً ما بداخل نصوص waMsgs، وتُعرض للطبيب رقاقاتٍ يدسّها
  // بيده. ترجمتها تكسر الاستبدال، فعربيتها بنيةٌ لا نصّ.
  "src/lib/waTemplates.ts",
]);

const AR = /[؀-ۿ]/;
let failed = false;
const fail = (msg) => { failed = true; console.error("✗ " + msg); };

/* ---- ١) تكافؤ المفاتيح بين ملفات اللغات ---------------------------------- */
function leafKeys(obj, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v && typeof v === "object") out.push(...leafKeys(v, prefix + k + "."));
    else out.push(prefix + k);
  }
  return out;
}
const langFiles = ["en", "ar"]; // تكبر مع كل لغة تدخل المخزن
const keySets = {};
for (const lang of langFiles) {
  const j = JSON.parse(readFileSync(join(ROOT, `src/i18n/${lang}.json`), "utf8"));
  keySets[lang] = new Set(leafKeys(j));
}
const base = keySets[langFiles[0]];
for (const lang of langFiles.slice(1)) {
  const missing = [...base].filter((k) => !keySets[lang].has(k));
  const extra = [...keySets[lang]].filter((k) => !base.has(k));
  if (missing.length) fail(`${lang}.json ناقصه ${missing.length} مفتاحاً: ${missing.slice(0, 8).join("، ")}${missing.length > 8 ? "…" : ""}`);
  if (extra.length) fail(`${lang}.json فيه ${extra.length} مفتاحاً زائداً عن en: ${extra.slice(0, 8).join("، ")}${extra.length > 8 ? "…" : ""}`);
}

/* ---- ٢) سقف النص الصلب لكل ملف ------------------------------------------- */
/* عدّ الأسطر العربية التي تمثّل نصاً معروضاً — بتتبّع حالة التعليقات عبر
 * الأسطر. بلا هذا التتبّع يُحسب أي سطر أوسط من تعليق كتليّ عربي (وهو نمط
 * التوثيق السائد بهذا المشروع) نصاً مهرَّباً، فيصير الحارس مصدر إنذارات
 * كاذبة — وحارس يكذب يُعطَّل، فيسقط الغرض كله. */
function hardcodedCount(path) {
  const src = readFileSync(join(ROOT, path), "utf8");
  let n = 0;
  let inBlock = false; // داخل /* … */ أو {/* … */}
  for (const line of src.split("\n")) {
    const wasInBlock = inBlock;
    // تتبّع فتح/إغلاق التعليقات الكتلية على هذا السطر (يكفي للأنماط الواقعية).
    let scan = line, opened = false;
    for (;;) {
      if (!inBlock) {
        const i = scan.indexOf("/*");
        if (i < 0) break;
        inBlock = true; opened = true; scan = scan.slice(i + 2);
      } else {
        const j = scan.indexOf("*/");
        if (j < 0) break;
        inBlock = false; scan = scan.slice(j + 2);
      }
    }
    if (!AR.test(line)) continue;
    if (wasInBlock) continue;             // سطر أوسط/أخير من تعليق كتلي
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*") || t.startsWith("/*") || t.startsWith("{/*")) continue;
    if (opened && !AR.test(line.slice(0, line.indexOf("/*")))) continue; // تعليق بدأ بهذا السطر والعربية داخله
    // العربية بعد تعليق سطري ملحق بكود إنجليزي («const x = 1; // شرح») مشروعة.
    if (!AR.test(line.split("//")[0])) continue;
    if (line.includes("t(")) continue;    // نص افتراضي داخل الترجمة — مشروع
    n++;
  }
  return n;
}

/* المتعقَّب **والجديد غير المُضاف بعد** معاً. الاقتصار على المتعقَّب كان يجعل
 * ملفاً جديداً يفلت من الفحص، فيمرّ البناء محلياً ثم يسقط بناء الإنتاج بعد
 * أول commit — وقع هذا مرّتين. --others يضمّ الجديد، و--exclude-standard
 * يحترم .gitignore فلا يزحف على dist ولا node_modules. */
const files = execSync("git ls-files --cached --others --exclude-standard 'src/**/*.ts' 'src/**/*.tsx'", { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("src/i18n/") && !f.endsWith(".d.ts"));

const counts = {};
for (const f of files) {
  if (CONTENT_FILES.has(f)) continue;
  const c = hardcodedCount(f);
  if (c > 0) counts[f] = c;
}

if (!existsSync(BASELINE)) {
  writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
  console.log(`✓ خط الأساس أُنشئ: ${Object.keys(counts).length} ملفاً بمجموع ${Object.values(counts).reduce((a, b) => a + b, 0)} سطراً صلباً.`);
} else {
  const baseline = JSON.parse(readFileSync(BASELINE, "utf8"));
  let improved = false;
  for (const [f, c] of Object.entries(counts)) {
    const cap = baseline[f] ?? 0;
    if (c > cap) fail(`نص عربي صلب جديد في ${f}: ${c} سطراً (السقف ${cap}). انقله لمفتاح t() — القاعدة: لا نص صلب جديد أبداً.`);
    else if (c < cap) improved = true;
  }
  for (const f of Object.keys(baseline)) if (!(f in counts)) improved = true;
  if (!failed && (UPDATE || improved)) {
    // التحسّن يثبَّت فوراً: السقف ينزل تلقائياً ولا يرتفع إلا بقرار واعٍ.
    writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + "\n");
    if (improved) console.log("✓ الفجوة انكمشت — خط الأساس نزل ليطابقها.");
  }
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (failed) {
  console.error("\ni18n-guard: فشل. راجع دراسة العالمية §٤ — لا نص صلب جديد ولا مفتاح ناقص.");
  process.exit(1);
}
console.log(`✓ i18n-guard: المفاتيح متكافئة (${base.size})، والنص الصلب المتبقي ${total} سطراً في ${Object.keys(counts).length} ملفاً (ينكمش ولا يكبر).`);
