/* ============================================================================
 * مفتاحُ اسم الشركة — **الطرفان من نفس الدالّة**، بالواجهة وبالقاعدة.
 *
 * ── ما حصل ──────────────────────────────────────────────────────────────
 * «لما أضيف شركة بنفس الاسم يخلي كل شركة وحدها». المقيسُ بالإنتاج: ١٤٣ شركة،
 * **١٠٢ منها مكرّرة** بـ١٨ مجموعةً وستِّ عيادات، و٨٥٪ من كلِّ شركةٍ تُضاف
 * يومياً نسخةٌ من قائمة. والمكرّراتُ **نفسُ النصّ حرفاً بحرف** لا اختلافَ إملاء.
 *
 * السبب: المقارنةُ كانت `normKey(المحفوظ) === المكتوب.toLowerCase()`، و`normKey`
 * يمرّ من `searchable` الذي **يمسح المسافات كلَّها**. فـ«شركة تاج الخيل» تُقارن
 * بـ«شركهتاجالخيل» — ولا تتطابقان أبداً.
 *
 * والدرسُ كان **مكتوباً على بُعد ثلاثة أسطر**: ترويسةُ `searchable` بـutils.ts
 * تقول «الطرفان يمرّان من هنا — تطبيعُ طرفٍ واحد أسوأ من لا تطبيع، لأنه يفشل
 * بصمتٍ ويبدو أنه يعمل». درسٌ مكتوبٌ لا يمنع شيئاً؛ الحارسُ يمنع.
 *
 * ── ما يفحصه هذا الملفّ ─────────────────────────────────────────────────
 *  ١) **حارسٌ بنيويّ**: لا نسخةَ محلّيةً من مفتاح التجميع بأيّ شاشة (كانت ثلاثاً:
 *     `normKey`×٢ و`nameKey`، ووُسّعت واحدةٌ فقط — ومن هناك جاء الانحدار)،
 *     ولا مقارنةَ `groupKey(...)` بطرفٍ لا يمرّ من `groupKey`.
 *  ٢) **قيمٌ ثابتة** من الإنتاج: ما يجب أن يتطابق، وما يجب ألّا يتطابق.
 *  ٣) **مرآةُ القاعدة**: يولّد `group-key.sql` لتشغّله الحزمةُ فتقارن ناتجَ
 *     `inv_norm_group` بناتج الجافاسكربت صفّاً بصفّ. (وقد أمسك هذا فعلاً خطأً
 *     بأوّل كتابةٍ للهجرة: `translate` كانت تقابل ة بـا لا بـه.)
 *
 * والدالّةُ تُحمَّل **من المصدر بـesbuild لا نسخةً منها** — سُنّةُ
 * `code-norm-parity.mjs`: فحصٌ على نسخةٍ يفحص النسخة.
 *
 *   node scripts/group-key-parity.mjs [outDir]
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- ١) الحارسُ البنيويّ ------------------------------------------------ */
const SRC = "src";
const files = [];
(function walk(d) {
  for (const e of readdirSync(d)) {
    const p = join(d, e);
    if (statSync(p).isDirectory()) walk(p);
    else if (/\.tsx?$/.test(p)) files.push(p);
  }
})(SRC);

const localDefs = [];
const oneSided = [];
for (const f of files) {
  const src = readFileSync(f, "utf8");
  if (f.endsWith("src/lib/utils.ts")) continue;
  // نسخةٌ محلّيةٌ من مفتاح التجميع: `const normKey = (…` أو `const nameKey = (…`
  for (const m of src.matchAll(/^\s*(?:const|function)\s+(normKey|nameKey|companyKey|groupKey)\s*(?:=\s*\(|\()/gm)) {
    localDefs.push(`${f}: ${m[1]}`);
  }
  /* مقارنةٌ بطرفٍ مطبَّعٍ وطرفٍ ليس كذلك. نلتقط `X(...) === <طرف>` حيث X أحدُ
     دوالّ التطبيع، ونرفض إن كان الطرفُ الآخر لا يمرّ من دالّةِ تطبيع. */
  const NORM = "(?:groupKey|normKey|nameKey|searchable|normalizeCode|normalizeAr)";
  const re = new RegExp(`${NORM}\\s*\\([^()]*\\)\\s*===\\s*([A-Za-z0-9_.$\\[\\]"'\` ]+)`, "g");
  for (const m of src.matchAll(re)) {
    const rhs = m[1].trim();
    if (new RegExp(`^${NORM}\\s*\\(`).test(rhs)) continue;   // الطرفان مطبَّعان
    if (/^(key|k|norm\w*|\w*Key)$/.test(rhs)) continue;      // متغيّرٌ يُفترض أنه مفتاح — يُفحص بالقيم أدناه
    oneSided.push(`${f}: ${m[0].slice(0, 90)}`);
  }
}
console.log("▸ ١) لا نسخةَ محلّيةً من مفتاح التجميع، ولا مقارنةَ بطرفٍ واحد");
check(`لا تعريفَ محلّياً لمفتاح التجميع خارج utils.ts (مُسح ${files.length} ملفاً)`,
  localDefs.length === 0, localDefs.join(" · "));
check("ولا مقارنةَ نصّيّةً بطرفٍ مطبَّعٍ وطرفٍ خام", oneSided.length === 0, oneSided.join(" · "));
/* والموضعُ الذي انكسر بعينه: `const key = <شيء>.toLowerCase()` ثم يُقارن بمفتاح. */
const toLowerCmp = [];
for (const f of ["src/pages/Inventory.tsx", "src/components/inventory/Purchases.tsx"]) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/const\s+key\s*=\s*([A-Za-z0-9_.$]+)\.toLowerCase\(\)/g)) toLowerCmp.push(`${f}: ${m[0]}`);
}
check("ولا `const key = x.toLowerCase()` بشاشتَي المخزون والشراء (الموضعُ الذي انكسر)",
  toLowerCmp.length === 0, toLowerCmp.join(" · "));

/* ---- ٢) القيم ----------------------------------------------------------- */
const built = await esbuild.build({
  entryPoints: ["src/lib/utils.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|.*\/i18n.*|@\/.*)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default {}; export const t = (k) => k;", loader: "js" }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "groupkey-"));
const f = join(dir, "m.mjs");
writeFileSync(f, built.outputFiles[0].text);
const U = await import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

/** أسماءٌ من الإنتاج — هذه بعينها هي التي تكرّرت. */
const SAME = [
  ["شركة تاج الخيل", "شركه تاج الخيل"],
  ["شركة تاج الخيل", "شركة  تاج   الخيل"],
  ["شركات متفرقة", "شركات متفرقه"],
  ["اليف هاوس", "اليف  هاوس"],
  ["ROYAL CANIN", "royal canin"],
  ["دراي فود", "درايفود"],
  ["مكتب الأمير", "مكتب الامير"],
  ["شركة ماسة اليرموك", "شركه ماسه اليرموك"],
  ["عيادة ادم", "عياده ادم"],
  ["منتج ٢٣٨", "منتج 238"],
  /* المحارفُ غير المرئية — تدخل باللصق من واتساب وإكسل، ولا يراها أحد.
     أربعُ محاولاتٍ بالمتصفّح صنعت أربعَ شركاتٍ باسم «رويال كانين» الموجودة. */
  ["رويال كانين", "رويال كانين\u200f"],
  ["رويال كانين", "رويال\u200bكانين"],
  ["رويال كانين", "\u200eرويال كانين"],
  ["رويال كانين", "\u2066رويال كانين\u2069"],
  ["رويال كانين", "\ufeffرويال كانين"],
  ["رويال كانين", "\u061cرويال كانين"],
];
const DIFF = [
  ["مكتب الرحاب", "مكتب الرحاب ٢"],
  ["بيورينا", "بيورينا بلس"],
  ["اليف هاوس", "اليف هاوس ٢"],
];
console.log("▸ ٢) القيمُ المقيسة من الإنتاج");
for (const [a, b] of SAME) {
  check(`«${a}» = «${b}»`, U.groupKey(a) === U.groupKey(b), `${U.groupKey(a)} ≠ ${U.groupKey(b)}`);
}
for (const [a, b] of DIFF) {
  check(`«${a}» ≠ «${b}»`, U.groupKey(a) !== U.groupKey(b));
}
check("وفراغٌ يعطي مفتاحاً فارغاً (لا يُطابق كلَّ شيء)", U.groupKey("   ") === "" && U.groupKey(null) === "");
/* اسمٌ محارفُه كلُّها غيرُ مرئية = اسمٌ فارغ: كان يعطي مفتاحاً فارغاً **يتخطّى
   فحصَ التوأم**، فيُحفظ صفٌّ يبدو بلا اسمٍ على الشاشة ولا يُبحث عنه. */
check("واسمٌ كلُّه محارفُ اتجاهٍ = اسمٌ فارغ", U.groupKey("\u200b\u200f\u2069") === "" && U.normGroupName("\u200b\u200f") === "");
/* والاسمُ المحفوظ يُنظَّف كذلك — لا يُخزَّن ما لا يُرى. */
check("والاسمُ المحفوظ بلا محارفَ غير مرئية", U.normGroupName("\u200fرويال\u200b كانين") === "رويال كانين", U.normGroupName("\u200fرويال\u200b كانين"));
check("والاسمُ المحفوظ يبقى كما كُتب (`normGroupName` لا تطوي إملاءً)",
  U.normGroupName("  شركة   تاج الخيل ") === "شركة تاج الخيل");

/* ---- ٣) مرآةُ القاعدة --------------------------------------------------- */
const outDir = process.argv[2];
const VALUES = [...new Set([...SAME.flat(), ...DIFF.flat(), "٧٧٠٩٩", "أإآٱ", "ىئؤ", "شركة", ""])];
if (outDir) {
  const rows = VALUES.map((v) => `  (${JSON.stringify(v).replace(/"/g, "'")}, ${JSON.stringify(U.groupKey(v)).replace(/"/g, "'")})`).join(",\n");
  const sql = `-- مولَّد من scripts/group-key-parity.mjs — لا يُحرَّر بيد.\n`
    + `-- يقارن inv_norm_group بالقاعدة بناتج groupKey بالواجهة، قيمةً قيمة.\n`
    + `with expected(v, k) as (values\n${rows}\n)\n`
    + `select case when count(*) filter (where inv_norm_group(v) is distinct from k) = 0\n`
    + `            then 'ok' else string_agg(v || '⇒' || inv_norm_group(v) || '≠' || k, ' · ')\n`
    + `                          filter (where inv_norm_group(v) is distinct from k) end as parity\n`
    + `from expected;\n`;
  writeFileSync(join(outDir, "group-key.sql"), sql);
  console.log(`   ✓ كُتب group-key.sql بـ${VALUES.length} قيمة`);
}

console.log(fails
  ? `\n✗ group-key-parity: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ group-key-parity: ${passes} نجحت، 0 فشلت (${VALUES.length} قيمة، ${files.length} ملفاً مُسح)`);
process.exit(fails ? 1 : 0);
