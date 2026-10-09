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
 * والنطاقُ المشترك (0229، لوحةُ المتجر بصفحتين): {pages: [...], dir: "src/components/store/"} —
 * يقرؤه ملفّاتُ المجلّد والصفحاتُ وحدها؛ ولا يستورد المجلّدَ إلا الصفحاتُ أو المجلّدُ نفسُه (وإلا
 * وصل مكوّنٌ صفحةً لا تحمّل نطاقَه)؛ وكلُّ صفحةٍ يحمّلها App.tsx بـpage(…, ["ns"]).
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
const modOf = (f) => f.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
const importersOf = (mod) => files.filter((f) => rel(f) !== "src/App.tsx" && new RegExp(`from ["']${mod}["']`).test(readFileSync(f, "utf8"))).map(rel);
const loads = (owner, ns) => new RegExp(`page\\(\\(\\) => import\\(["']${modOf(owner)}["']\\)[\\s\\S]{0,120}?,\\s*\\[[^\\]]*["']${ns}["'][^\\]]*\\]\\)`).test(app);
for (const [ns, spec] of Object.entries(owned)) {
  const re = new RegExp(`["'\`]${ns}\\.[A-Za-z_]`);
  const readers = files.filter((f) => !rel(f).startsWith("src/i18n/") && re.test(strip(readFileSync(f, "utf8")))).map(rel);
  const pages = typeof spec === "string" ? [spec] : spec.pages;
  const dir = typeof spec === "string" ? null : spec.dir ?? null;
  const own = (r) => pages.includes(r) || (dir !== null && r.startsWith(dir));
  const strangers = readers.filter((r) => !own(r));
  const label = typeof spec === "string" ? spec : `${pages.join(" + ")}${dir ? ` (+${dir})` : ""}`;
  if (strangers.length) errs.push(`النطاقُ ${ns} مملوكٌ لـ${label} ويقرؤه غيرُه: ${strangers.join("، ")} — انقل مفاتيحَه لنطاقٍ بارد أو اجعله غيرَ مملوك`);
  if (!readers.some(own)) errs.push(`النطاقُ ${ns}: مالكُه ${label} لا يقرؤه — مالكٌ خاطئ بـhot-paths.json`);
  for (const owner of pages) {
    const importers = importersOf(modOf(owner));
    if (importers.length) errs.push(`${owner} مستوردٌ استيراداً ثابتاً من ${importers.join("، ")} — نطاقُه ${ns} لن يصله`);
    if (!loads(owner, ns)) errs.push(`App.tsx لا يحمّل ${owner} بـpage(…, ["${ns}"]) — الصفحةُ ستُرسم بلا نصوص نطاقها`);
  }
  if (dir !== null) {
    // مكوّنُ المجلّد يصل صفحةً أخرى ⇒ يُرسم بمفاتيحَ خامة هناك (نطاقُه لا يُحمَّل معها).
    const dirMods = files.map(rel).filter((f) => f.startsWith(dir)).map(modOf);
    const leaks = files.map(rel).filter((f) => !own(f) && dirMods.some((m) => new RegExp(`from ["']${m}["']`).test(readFileSync(path.join(ROOT, f), "utf8"))));
    if (leaks.length) errs.push(`مكوّناتُ ${dir} (نطاقُ ${ns}) مستوردةٌ خارج صفحاتها: ${leaks.join("، ")}`);
  }
}
if (errs.length) {
  console.error(`✗ i18n-owned-guard:\n  • ${errs.join("\n  • ")}`);
  process.exit(1);
}
console.log(`✓ i18n-owned-guard: فُحص ${Object.keys(owned).length} نطاقاً مملوكاً (${Object.entries(owned).map(([n, o]) => `${n} ← ${typeof o === "string" ? path.basename(o) : o.pages.map((x) => path.basename(x)).join("+") + (o.dir ? `+${o.dir}` : "")}`).join("، ")}) على ${files.length} ملفّاً`);
