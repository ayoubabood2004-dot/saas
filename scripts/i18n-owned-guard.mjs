/* ============================================================================
 * حارسُ النطاقات المملوكة — «نصُّ صفحةٍ لا يُقرأ خارجها».
 *
 * نطاقٌ مملوك (`owned` بـsrc/i18n/hot-paths.json) لا يدخل النصفَ البارد: يصل بحزمةٍ
 * صغيرةٍ مع صفحته وحدَها (`page(load, [ns])`). فملفٌّ آخر يقرأ مفتاحاً منه يرسم مفتاحاً
 * خاماً على شاشته — ولا يمسكه شيءٌ غيرُ هذا: الفحوصُ تجري خارج Vite بالقاموس كاملاً.
 * ويشترط ثلاثاً لكلّ نطاق:
 *   ١) لا يقرأ مفاتيحَه إلا ملفُّ مالكه؛
 *   ٢) المالكُ لا يستورده أحدٌ استيراداً ثابتاً (وإلا صار جزءاً من صفحةٍ أخرى)؛
 *   ٣) App.tsx يحمّل المالكَ بـpage(…, [..."ns"...]) — وإلا فالصفحةُ نفسُها بلا نصوصها.
 * ويقول ما فحص — «حارسٌ يخرج صفراً بلا كلمة ليس حارساً».
 *
 *   node scripts/i18n-owned-guard.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { readOwned } from "./i18n-split.mjs";

const ROOT = process.cwd();
const owned = readOwned(ROOT);
const files = [];
const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(f)) files.push(p); } };
walk(path.join(ROOT, "src"));
const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const app = strip(readFileSync(path.join(ROOT, "src/App.tsx"), "utf8"));
const errs = [];
for (const [ns, owner] of Object.entries(owned)) {
  const re = new RegExp(`["'\`]${ns}\\.[A-Za-z_]`);
  const readers = files.filter((f) => !rel(f).startsWith("src/i18n/") && re.test(strip(readFileSync(f, "utf8")))).map(rel);
  const strangers = readers.filter((r) => r !== owner);
  if (strangers.length) errs.push(`النطاقُ ${ns} مملوكٌ لـ${owner} ويقرؤه غيرُه: ${strangers.join("، ")} — انقل مفاتيحَه لنطاقٍ بارد أو اجعله غيرَ مملوك`);
  if (!readers.includes(owner)) errs.push(`النطاقُ ${ns}: مالكُه ${owner} لا يقرؤه — مالكٌ خاطئ بـhot-paths.json`);
  const mod = owner.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
  const importers = files.filter((f) => rel(f) !== "src/App.tsx" && new RegExp(`from ["']${mod}["']`).test(readFileSync(f, "utf8"))).map(rel);
  if (importers.length) errs.push(`${owner} مستوردٌ استيراداً ثابتاً من ${importers.join("، ")} — نطاقُه ${ns} لن يصله`);
  const call = new RegExp(`page\\(\\(\\) => import\\(["']${mod}["']\\)[\\s\\S]{0,120}?,\\s*\\[[^\\]]*["']${ns}["'][^\\]]*\\]\\)`);
  if (!call.test(app)) errs.push(`App.tsx لا يحمّل ${owner} بـpage(…, ["${ns}"]) — الصفحةُ ستُرسم بلا نصوص نطاقها`);
}
if (errs.length) {
  console.error(`✗ i18n-owned-guard:\n  • ${errs.join("\n  • ")}`);
  process.exit(1);
}
console.log(`✓ i18n-owned-guard: فُحص ${Object.keys(owned).length} نطاقاً مملوكاً (${Object.entries(owned).map(([n, o]) => `${n} ← ${path.basename(o)}`).join("، ")}) على ${files.length} ملفّاً`);
