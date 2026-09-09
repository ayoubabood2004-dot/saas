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
import { execFileSync } from "child_process";
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
  "src/pages/PlatformConsole.tsx",      // لوحة المنصّة (0151) — للمشغّل وحده
  "src/components/PlatformBanner.tsx",  // شريط «أنت داخل عيادة…» — للمشغّل وحده
  // رموز قوالب الرسائل ({{اسم_المالك}}…): ليست نصاً معروضاً بل **معرّفات**
  // يجب أن تطابق حرفياً ما بداخل نصوص waMsgs، وتُعرض للطبيب رقاقاتٍ يدسّها
  // بيده. ترجمتها تكسر الاستبدال، فعربيتها بنيةٌ لا نصّ.
  "src/lib/waTemplates.ts",
  // تخطيطُ الكيبورد العربي: الحروفُ **مواضعُ مفاتيح** لا كلامٌ يُقرأ —
  // ترجمتُها تكسر عكسَ المسخ. ومعزولٌ بملفّه حتى يبقى سقفُ productCodes صفراً.
  "src/lib/arabicLayout.ts",
  // الكتلوج النموذجي: أسماء شركات وأصناف ومنتجات السوق — بياناتٌ تُزرع بقاعدة
  // العيادة وتُعدَّل بيدها، لا نصوص واجهة.
  "src/lib/startCatalog.ts",
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
/* مفتاحٌ مكرّرٌ داخل نفس الكائن: `JSON.parse` يأخذ الأخير بصمت ويرمي الأوّل.
 * فمن يضيف نصّاً جديداً باسمٍ مستعمَل يراه «انحفظ» ويبقى النصُّ القديم معروضاً —
 * ولا عدّادُ المفاتيح يتغيّر، فلا يمسكه فحصُ التكافؤ. مقيسٌ: أُضيف
 * `errors.noRowUpdated` مرّتين بملفٍّ واحد فبقيت الرسالةُ الأولى مخفيّة.
 * نمسحُ النصَّ الخام: كلُّ سطرِ مفتاحٍ بعمقه، ونشكو من اسمٍ تكرّر بنفس العمق
 * تحت نفس الأب. */
function duplicateKeys(raw) {
  const dups = [];
  const stack = [];           // أسماءُ الآباء
  const seen = [new Set()];   // مفاتيحُ كلّ مستوى
  for (const line of raw.split(/\r?\n/)) {
    const s = line.trim();
    const m = /^"((?:[^"\\]|\\.)*)"\s*:/.exec(s);
    if (m) {
      const key = m[1];
      const here = seen[seen.length - 1];
      if (here.has(key)) dups.push([...stack, key].join("."));
      here.add(key);
      if (/[[{]\s*$/.test(s)) { stack.push(key); seen.push(new Set()); }
      continue;
    }
    if (/^[}\]],?$/.test(s) && seen.length > 1) { seen.pop(); stack.pop(); }
  }
  return dups;
}

const langFiles = ["en", "ar"]; // تكبر مع كل لغة تدخل المخزن
const keySets = {};
for (const lang of langFiles) {
  const raw = readFileSync(join(ROOT, `src/i18n/${lang}.json`), "utf8");
  const dups = duplicateKeys(raw);
  if (dups.length) fail(`${lang}.json فيه ${dups.length} مفتاحاً مكرّراً (الأخير يطمس الأوّل بصمت): ${dups.slice(0, 8).join("، ")}${dups.length > 8 ? "…" : ""}`);
  keySets[lang] = new Set(leafKeys(JSON.parse(raw)));
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
/* بلا صَدَفة: execSync يمرّ بـcmd.exe على ويندوز، وcmd لا يقشّر العلامات
 * المفردة — فيصل git مسارٌ حرفيّ بعلامتيه لا يطابق شيئاً، فترجع
 * القائمةُ صفراً. النتيجة كانت أسوأ من تعطّل الحارس: صفرُ ملفاتٍ يعني صفرَ
 * نصوصٍ صلبة، فيظنّها الحارسُ «تحسّناً» ويكتب خطَّ الأساس `{}` — ثم يسقط بناءُ
 * الإنتاج على لينكس لأن سقفَ كل ملفٍ صار صفراً. execFileSync لا يمرّ بصَدَفة
 * أصلاً، فالمسارُ يصل git كما هو على النظامين. */
const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "src/**/*.ts", "src/**/*.tsx"], { cwd: ROOT, encoding: "utf8" })
  .split("\n").filter((f) => f && !f.startsWith("src/i18n/") && !f.endsWith(".d.ts"));

/* وحتى لو فشل الجردُ بطريقةٍ أخرى لم نتوقّعها: صفرُ ملفاتٍ ليس «نظافةً»، هو
 * عطلُ أداة. نقولها ولا نكتب خطَّ أساسٍ فارغاً فوق الصحيح. */
if (files.length === 0) {
  console.error("✗ i18n-guard: لم يُجرَد أيُّ ملف مصدر — عطلٌ بالأداة لا نظافةٌ بالشِفرة. خطُّ الأساس لم يُمَسّ.");
  process.exit(1);
}

const counts = {};
for (const f of files) {
  if (CONTENT_FILES.has(f)) continue;
  const c = hardcodedCount(f);
  if (c > 0) counts[f] = c;
}

/* خطُّ الأساس كائنٌ واحد يحمل سقوفَ النصّ الصلب **و** دَينَ المفاتيح بلا
 * ترجمة (`__orphanKeys`)، ويُكتب مرّةً واحدة بآخر الفحص — فلا يُكتب نصفُه
 * قبل أن يُحسب نصفُه الآخر. */
const isNew = !existsSync(BASELINE);
const baseline = isNew ? {} : JSON.parse(readFileSync(BASELINE, "utf8"));
let improved = isNew;
if (!isNew) {
  for (const [f, c] of Object.entries(counts)) {
    const cap = baseline[f] ?? 0;
    if (c > cap) fail(`نص عربي صلب جديد في ${f}: ${c} سطراً (السقف ${cap}). انقله لمفتاح t() — القاعدة: لا نص صلب جديد أبداً.`);
    else if (c < cap) improved = true;
  }
  for (const f of Object.keys(baseline)) if (f !== "__orphanKeys" && !(f in counts)) improved = true;
}


/* ---- ٣) استعمالٌ مقابل كتالوج: مفتاحٌ يُنادى ولا وجودَ له بأيّ ملفّ ------
 * فحصُ التكافؤ أعلاه يقارن `en` بـ`ar` — ومفتاحٌ غائبٌ عن **الاثنين** يمرّ
 * منه غيرَ مرئيّ. والمقيسُ كان ١٠٩ مفاتيحَ كهذه، منها كتلٌ كاملة.
 *
 * ولا ينكسر شيءٌ ظاهرياً لأن كلَّ نداءٍ تقريباً يحمل `defaultValue` عربياً —
 * فالعربيةُ تعمل والإنكليزيةُ **تعرض العربية**. أي أن الملفَّ الإنكليزيّ يكذب
 * على من يقرأه: يبدو مكتملاً وهو ناقصٌ مئةَ مفتاح. ومن يترجم لاحقاً يترجم
 * الموجودَ ويظنّ أنه أتمّ.
 *
 * والمسحُ نصّيٌّ عمداً: `t("literal")` وحدها. مفاتيحُ تُبنى بالتشغيل
 * (`t(\`x.${v}\`)`) لا تُمسح — وهي قليلةٌ ومقصودة. */
const KEY_CALL = /\bt\(\s*"([a-zA-Z][\w.]*\.[\w.]+)"/g;
const usedKeys = new Map();                    // مفتاح ← أوّلُ موضعٍ يناديه
for (const f of files) {
  const src = readFileSync(join(ROOT, f), "utf8");
  for (const [i, line] of src.split("\n").entries()) {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) continue;
    for (const m of line.matchAll(KEY_CALL)) {
      if (!usedKeys.has(m[1])) usedKeys.set(m[1], `${f}:${i + 1}`);
    }
  }
}
const orphans = [...usedKeys].filter(([k]) => !base.has(k) && !keySets.ar.has(k));
/* والنطاقُ مرحليّ لا اعتباطيّ: شاشاتُ البيع والمخزون — حيث يُتّخذ قرارُ مالٍ
 * ويُقرأ رقمٌ — سقفُها **صفر**. وما عداها دَينٌ **مقيسٌ ومعلَن** يُسمح ببقائه
 * ولا يُسمح بنموّه، كسقوف النصّ الصلب أعلاه: ينكمش ولا يكبر. والبديلُ —
 * فحصٌ يفشّل البناءَ بـ٧٧٧ عطلاً قديماً — حارسٌ يُسكَت بأوّل يوم. */
const HOT = new Set([
  "src/pages/Inventory.tsx",
  "src/components/retail/SaleBuilder.tsx",
  "src/components/inventory/Purchases.tsx",
  "src/components/inventory/BarcodeStudio.tsx",
  "src/components/retail/WeightPicker.tsx",
]);
const hotOrphans = orphans.filter(([, where]) => HOT.has(where.split(":")[0]));
if (hotOrphans.length) {
  fail(`${hotOrphans.length} مفتاحاً مستعملاً غيرَ موجودٍ بأيّ ملفّ ترجمة بشاشات البيع والمخزون (الإنكليزيةُ تعرض العربية):`);
  for (const [k, where] of hotOrphans.slice(0, 12)) console.error(`    · ${k}  ←  ${where}`);
  if (hotOrphans.length > 12) console.error(`    … و${hotOrphans.length - 12} غيرُها`);
}
const coldCap = Number(baseline.__orphanKeys ?? 0);
const cold = orphans.length - hotOrphans.length;
if (UPDATE || cold < coldCap) baseline.__orphanKeys = cold;
else if (cold > coldCap) {
  fail(`مفاتيحُ بلا ترجمةٍ خارج شاشات البيع صارت ${cold} بعد أن كانت ${coldCap} — الدَّينُ ينكمش ولا يكبر.`);
  for (const [k, where] of orphans.filter(([, w]) => !HOT.has(w.split(":")[0])).slice(0, 6)) console.error(`    · ${k}  ←  ${where}`);
}

const total = Object.values(counts).reduce((a, b) => a + b, 0);
if (failed) {
  console.error("\ni18n-guard: فشل. راجع دراسة العالمية §٤ — لا نص صلب جديد ولا مفتاح ناقص.");
  process.exit(1);
}
// التحسّن يثبَّت فوراً: السقوف تنزل تلقائياً ولا ترتفع إلا بقرار واعٍ.
if (UPDATE || improved) {
  writeFileSync(BASELINE, JSON.stringify({ ...counts, __orphanKeys: baseline.__orphanKeys ?? cold }, null, 2) + "\n");
  if (improved && !isNew) console.log("✓ الفجوة انكمشت — خط الأساس نزل ليطابقها.");
  if (isNew) console.log(`✓ خط الأساس أُنشئ: ${Object.keys(counts).length} ملفاً بمجموع ${total} سطراً صلباً.`);
}
console.log(`✓ i18n-guard: المفاتيح متكافئة (${base.size})، والنص الصلب المتبقي ${total} سطراً في ${Object.keys(counts).length} ملفاً (ينكمش ولا يكبر)، ومفاتيحُ بلا ترجمةٍ خارج شاشات البيع: ${cold} (سقفها ${Math.max(cold, coldCap)}).`);