/* ============================================================================
 * حارسُ مداخل الدواء — «منتقٍ واحد لكلّ شاشةٍ يُختار فيها دواء».
 *
 * ── لماذا ───────────────────────────────────────────────────────────────
 * كان لكلّ شاشةٍ منتقيها: ورقةُ المعالج (تقصّ عند ١٢٠ بلا كلمة)، ونافذةُ الزيارة بحقلِ
 * كتابةٍ وقائمةِ اقتراح يفتح الكيبورد وحده، وورقةُ الطبلة بخمسة اقتراحاتٍ من الدليل،
 * ونموذجُ السجلّ بقائمتين إنكليزيّتين — وكلٌّ يكتب الدواءَ بنصٍّ غيرِ نصّ أخيه، و«أدويتي»
 * لا تظهر إلا بواحدة. فإن رجع منتقٍ محلّيٌّ بشاشةٍ واحدة رجع كلُّ ذلك بصمت.
 *
 * يفشّل البناء إن:
 *  ١) ملفٌّ خارج القائمة يبني منتقياً من MED_CATALOG أو allMedicationNames أو
 *     getClinicMeds أو searchDrugs (قائمةُ اقتراح، خياراتُ FancySelect، datalist…)؛
 *  ٢) حقلُ اسمِ دواءٍ يفتح الكيبورد وحده (autoFocus)؛
 *  ٣) أحدٌ يستورد addClinicMed (أدويةُ العيادة صارت «أدويتي» — 0229)؛
 *  ٤) وحداتُ المنتقي تقصّ قوائمَها بـ`.slice(…)` — «قائمةٌ ناقصة أخطرُ من خطأ ظاهر»؛
 *  ٥) DragOverlay بوحدات المنتقي خارج createPortal (الورقةُ مُزاحةٌ بـtransform)؛
 *  ٦) شاشةُ البيع: الماسحُ وF2/«/» يسألان medPickerOpen (مسحةٌ خلف المنتقي تبيع).
 * والقائمةُ «لم يتحوّل بعد» تنكمش دفعةً بعد دفعة حتى تفرغ.
 *
 *   node scripts/med-entry-guard.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e).replace(/\\/g, "/");
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.(ts|tsx)$/.test(p)) files.push(p);
  }
})("src");

/** التعليقاتُ لا تُقرأ بناءً: شرحٌ يذكر MED_CATALOG أو autoFocus ليس استعمالاً. */
const code = (f) => readFileSync(f, "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, a) => a + " ".repeat(m.length - a.length));

/* القائمةُ النهائية: المنتقي وقلبُه والكتالوج، وما يبقى خارجه بقرار (المواصفة §10). */
const ALLOWED = new Set([
  "src/components/meds/MedPicker.tsx",
  "src/components/meds/MedPickerSheet.tsx",
  "src/components/meds/MyMedsBoard.tsx",
  "src/components/meds/MedPickerData.ts", // البابُ الوحيد للكتالوج: الورقةُ والإعدادات
  "src/lib/medIndex.ts",
  "src/lib/medCatalog.ts",
  "src/lib/vetFormulary.ts",          // يعرّف searchDrugs
  "src/components/ProtocolSheet.tsx", // يختار بروتوكولاً لا دواءً
  "src/pages/PoultryFarms.tsx",       // منتجُ مخزن الحقل بمعرّفه
  "src/pages/Consultation.tsx",       // صفحةٌ يتيمة بلا رابط
]);
/* لم يتحوّل بعد — تُشطب سطراً سطراً مع كلّ دفعة. */
const PENDING = new Set([]);
const SOURCES = /\b(MED_CATALOG|allMedicationNames|getClinicMeds|searchDrugs)\b/;

console.log("▸ ١) لا منتقيَ دواءٍ محلّيّ خارج المنتقي الموحَّد");
const local = files.filter((f) => !ALLOWED.has(f) && !PENDING.has(f) && SOURCES.test(code(f)));
check(`لا ملفَّ يبني قائمةَ دواءٍ بنفسه (مُسح ${files.length} ملفاً)`, local.length === 0, local.join(" · "));
const stale = [...PENDING].filter((f) => existsSync(f) && !SOURCES.test(code(f)) && !/addClinicMed/.test(code(f)));
check("وقائمةُ «لم يتحوّل بعد» لا تحمل ملفّاً تحوّل (تنكمش ولا تتجمّد)", stale.length === 0, `اشطب: ${stale.join(" · ")}`);

console.log("▸ ٢) حقلُ اسم الدواء لا يفتح الكيبورد وحده");
const MED_INPUT = /data-\w*(?:med|drug)\w*|list="[^"]*drug[^"]*"|value=\{med\}/i;
/* مدى الوسم حتى `>` خارج الأقواس والنصوص — `[^>]*>` كان يقف عند سهمِ `onChange={(e) => …}`
 * فلا يرى autoFocus بعده، فمرّ حقلا الزيارة (data-editmed وlist="vp-drug-list") وهما يفتحان
 * الكيبورد فعلاً. */
function tagExtent(src, at) {
  let depth = 0, quote = null;
  for (let j = at + 1; j < src.length; j++) {
    const c = src[j];
    if (quote) { if (c === quote && src[j - 1] !== "\\") quote = null; continue; }
    if (c === '"' || c === "'" || c === "`") quote = c;
    else if (c === "{") depth++;
    else if (c === "}") depth--;
    else if (c === ">" && depth === 0) return src.slice(at, j + 1);
  }
  return src.slice(at);
}
const focused = [];
for (const f of files) {
  if (PENDING.has(f) || !f.endsWith(".tsx")) continue;
  /* المدى يُقرأ من النصّ الخام: مُزيلُ التعليقات يرى `accept="image/*"` بدايةَ تعليق فيمسح
   * علامةَ التنصيص. وما يقع داخل تعليقٍ حقيقيّ (المُزيلُ مسحه) لا يُحسب. */
  const raw = readFileSync(f, "utf8");
  const stripped = code(f);
  for (const m of raw.matchAll(/<(?:input|textarea)\b/g)) {
    if (stripped.slice(m.index, m.index + m[0].length) !== m[0]) continue;
    const tag = tagExtent(raw, m.index);
    if (/\bautoFocus\b/.test(tag) && MED_INPUT.test(tag)) focused.push(`${f}: ${tag.replace(/\s+/g, " ").slice(0, 80)}`);
  }
}
check("لا autoFocus على حقل اسمِ دواء", focused.length === 0, focused.join(" · "));

console.log("▸ ٣) أدويةُ العيادة صارت «أدويتي»");
const addClinic = files.filter((f) => /\baddClinicMed\b/.test(code(f)));
check("لا أحدَ يعرّف addClinicMed أو يستورده", addClinic.length === 0, addClinic.join(" · "));

console.log("▸ ٤) وحداتُ المنتقي لا تقصّ قوائمها");
const PICKER = ["src/components/meds/MedPicker.tsx", "src/components/meds/MedPickerSheet.tsx", "src/components/meds/MyMedsBoard.tsx", "src/lib/medIndex.ts"];
const cuts = PICKER.filter((f) => existsSync(f)).flatMap((f) => [...code(f).matchAll(/\.slice\(\s*[^)\s]/g)].map(() => f));
check("لا `.slice(…)` بوحدات المنتقي (نسخةُ `.slice()` بلا وسيط مسموحة)", cuts.length === 0, cuts.join(" · "));

console.log("▸ ٥) DragOverlay داخل بوابة");
const overlays = [];
for (const f of files.filter((x) => x.startsWith("src/components/meds/"))) {
  const src = code(f);
  for (const m of src.matchAll(/<DragOverlay\b/g)) {
    const open = src.lastIndexOf("createPortal(", m.index);
    const close = open < 0 ? -1 : src.indexOf("document.body", open);
    if (open < 0 || close < m.index) overlays.push(f);
  }
}
check("كلُّ DragOverlay بوحدات المنتقي داخل createPortal(…, document.body)", overlays.length === 0, overlays.join(" · "));

console.log("▸ ٦) شاشةُ البيع لا تتحرّك خلف المنتقي");
{
  /* المنتقي ورقةٌ فوق شاشة البيع، والماسحُ يسمع النافذةَ كلَّها وF2 يُتمّ البيع بلا سؤال عن
   * التركيز — مسحةٌ أو F2 خلف الورقة كانت تبيع ما لا يراه الكاشير. */
  const sb = code("src/components/retail/SaleBuilder.tsx");
  const scan = /useBarcodeScanner\(handleScan,\s*\{\s*disabled:([^}]*)\}/.exec(sb)?.[1] ?? "";
  check("الماسحُ يسكت ما دام المنتقي مفتوحاً (disabled يذكر medPickerOpen)", /\bmedPickerOpen\b/.test(scan), scan.trim().slice(0, 90));
  const keyFn = /if \(!posV2\) return;\s*const onKey = \(e: KeyboardEvent\) => \{([\s\S]*?)\n {4}\};/.exec(sb)?.[1] ?? "";
  check("وF2 و«/» كذلك: أوّلُ سطرٍ بمعالج posV2 يسأل medPickerOpen", /^\s*if \(medPickerOpen\) return;/.test(keyFn) && /F2/.test(keyFn) && /"\/"/.test(keyFn), keyFn.trim().slice(0, 60));
}

console.log(fails ? `\n✗ med-entry-guard: ${passes} نجحت، ${fails} فشلت` : `\n✓ med-entry-guard: ${passes} نجحت، 0 فشلت (${PENDING.size} لم يتحوّل بعد)`);
process.exit(fails ? 1 : 0);
