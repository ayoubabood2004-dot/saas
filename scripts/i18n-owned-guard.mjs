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
 * والاستيرادُ يُحلَّل إلى ملفّه لا يُطابَق نصّاً (0229 بعد تدقيق): الفحصُ كان يرى
 * `from "@/components/store/X"` وحدَها، فاستيرادٌ نسبيّ (`../store/X`) أو كسول
 * (`lazy(() => import("@/components/store/X"))`) أو إعادةُ تصدير يمرّ «✓» ويرسم مفاتيحَ
 * خامة. الآن كلُّ مُحدِّدٍ (from، import "…"، import(…)، export … from) يُحلّ نسبةً لملفّه
 * وللاسم المستعار @/ ثمّ يُقارن بالمسار. والكاشفُ يُجرَّب على عيّناتٍ مصنوعة قبل كلّ فحص:
 * كاشفٌ لا يرى الصيغَ الأربع لا يُصدَّق صفرُه. واستيرادُ الأنواع وحدَها لا يُعدّ (يُمحى بالبناء).
 * مكوّنُ المجلّد: أيُّ استيرادٍ من خارجه تسريب. والصفحةُ المالكة: الثابتُ و`lazy(() => import)`
 * (كلاهما يرسمها بلا page()) — أمّا `import()` المجرّد فتسخينُ ذاكرةٍ لا رسم (routePrefetch).
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

/** كلُّ مُحدِّدِ استيرادٍ يجري وقتَ التشغيل بنصّ ملفّ، بنوعه: `static` (from، import "…"،
 *  export … from)، `lazy` (`lazy(() => import(…))` — يُرسم)، `dynamic` (`import()` مجرّد).
 *  `import type`/`export type` لا تُعدّ، ولا `import("x").Foo` بموضع نوع (لا `.then`). */
export function importSpecs(src) {
  const code = strip(src);
  const out = [];
  for (const m of code.matchAll(/\b(import|export)\s+(type\s+)?(?:[\w*{}\s,$]*?\s+from\s*)?["']([^"']+)["']/g)) {
    if (!m[2]) out.push({ spec: m[3], kind: "static" });
  }
  for (const m of code.matchAll(/\bimport\s*\(\s*["']([^"']+)["']\s*\)(\s*\.\s*(\w+))?/g)) {
    if (m[2] && !/^(then|catch|finally)$/.test(m[3])) continue;
    const before = code.slice(Math.max(0, m.index - 60), m.index);
    out.push({ spec: m[1], kind: /\blazy\s*\(\s*(?:async\s*)?\(\s*\)\s*=>\s*$/.test(before) ? "lazy" : "dynamic" });
  }
  return out;
}

/** يحلّ المُحدِّدَ إلى ملفٍّ بالمستودع (`src/…`) — نسبةً لملفّه أو بالاسم المستعار @/ — أو null. */
export function resolveSpec(fromRel, spec, exists) {
  let base;
  if (spec.startsWith("@/")) base = "src/" + spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel), spec));
  else return null;
  for (const c of [base, `${base}.ts`, `${base}.tsx`, `${base}/index.ts`, `${base}/index.tsx`]) if (exists(c)) return c;
  return null;
}

const relFiles = new Set(files.map(rel));
const importsCache = new Map();
/** ما يستورده هذا الملفُّ وقتَ التشغيل، محلولاً: [{ file, kind }]. */
const importsOf = (r) => {
  if (!importsCache.has(r)) {
    const src = readFileSync(path.join(ROOT, r), "utf8");
    importsCache.set(r, importSpecs(src).map(({ spec, kind }) => ({ file: resolveSpec(r, spec, (c) => relFiles.has(c)), kind })).filter((x) => x.file));
  }
  return importsCache.get(r);
};

/* الفحصُ الذاتيّ: الكاشفُ يرى الصيغَ كلَّها ويحلّها، ولا يعدّ الأنواعَ — قبل أن يُصدَّق صفرُه. */
{
  const fake = new Set(["src/components/store/ProductSheet.tsx", "src/components/store/index.ts", "src/pages/ClinicStore.tsx"]);
  const has = (c) => fake.has(c);
  const from = "src/components/inventory/Leak.tsx";
  const cases = [
    ['import { ProductSheet } from "../store/ProductSheet";', "src/components/store/ProductSheet.tsx"],
    ['const P = lazy(() => import("@/components/store/ProductSheet"));', "src/components/store/ProductSheet.tsx"],
    ['const P = lazy(() => import("../store/ProductSheet").then((m) => ({ default: m.ProductSheet })));', "src/components/store/ProductSheet.tsx"],
    ['export { ProductSheet } from "@/components/store/ProductSheet";', "src/components/store/ProductSheet.tsx"],
    ['import "../store";', "src/components/store/index.ts"],
    ['import {\n  ProductSheet,\n} from "@/components/store/ProductSheet";', "src/components/store/ProductSheet.tsx"],
    ['import Page from "../../pages/ClinicStore";', "src/pages/ClinicStore.tsx"],
  ];
  const typeOnly = [
    'import type { Row } from "../store/ProductSheet";',
    'export type { Row } from "@/components/store/ProductSheet";',
    'type R = import("@/components/store/ProductSheet").Row;',
    '// import { ProductSheet } from "../store/ProductSheet";',
  ];
  const kinds = [
    ['const P = lazy(() => import("@/pages/ClinicStore"));', "lazy"],
    ['const P = lazy(async () => import("../../pages/ClinicStore"));', "lazy"],
    ['"/store": () => import("@/pages/ClinicStore"),', "dynamic"],
    ['useEffect(() => { void import("@/pages/ClinicStore"); }, []);', "dynamic"],
  ];
  const bad = [];
  for (const [src, want] of cases) {
    const got = importSpecs(src).map(({ spec }) => resolveSpec(from, spec, has));
    if (!got.includes(want)) bad.push(`لم يُرَ: ${src.replace(/\n/g, " ")} ⇒ ${JSON.stringify(got)}`);
  }
  for (const src of typeOnly) {
    const got = importSpecs(src).map(({ spec }) => resolveSpec(from, spec, has)).filter(Boolean);
    if (got.length) bad.push(`نوعٌ عُدّ استيراداً: ${src} ⇒ ${JSON.stringify(got)}`);
  }
  for (const [src, want] of kinds) {
    const got = importSpecs(src).map((x) => x.kind);
    if (got.join() !== want) bad.push(`نوعُ الاستيراد خطأ: ${src} ⇒ ${got.join()} (المطلوب ${want})`);
  }
  if (bad.length) {
    console.error(`✗ i18n-owned-guard: الكاشفُ نفسُه أعمى — لا يُصدَّق صفرُه:\n  • ${bad.join("\n  • ")}`);
    process.exit(1);
  }
  console.log(`   ✓ فحصٌ ذاتيّ: ${cases.length} صيغَ استيرادٍ رُئيت وحُلّت، و${typeOnly.length} صيغَ نوعٍ/تعليقٍ لم تُعدّ، و${kinds.length} كسولٌ/تسخينٌ صُنّف`);
}

/** مَن يرسم الصفحةَ المالكة بلا page(): استيرادٌ ثابت أو `lazy` من غير App.tsx. */
const importersOf = (owner) => [...relFiles].filter((r) => r !== "src/App.tsx"
  && importsOf(r).some((x) => x.file === owner && x.kind !== "dynamic"));
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
    const importers = importersOf(owner);
    if (importers.length) errs.push(`${owner} مستوردٌ من ${importers.join("، ")} خارج page() — نطاقُه ${ns} لن يصله`);
    if (!loads(owner, ns)) errs.push(`App.tsx لا يحمّل ${owner} بـpage(…, ["${ns}"]) — الصفحةُ ستُرسم بلا نصوص نطاقها`);
  }
  if (dir !== null) {
    // مكوّنُ المجلّد يصل صفحةً أخرى ⇒ يُرسم بمفاتيحَ خامة هناك (نطاقُه لا يُحمَّل معها).
    const leaks = [...relFiles].filter((f) => !own(f) && importsOf(f).some((x) => x.file.startsWith(dir)));
    if (leaks.length) errs.push(`مكوّناتُ ${dir} (نطاقُ ${ns}) مستوردةٌ خارج صفحاتها: ${leaks.join("، ")}`);
  }
}
if (errs.length) {
  console.error(`✗ i18n-owned-guard:\n  • ${errs.join("\n  • ")}`);
  process.exit(1);
}
console.log(`✓ i18n-owned-guard: فُحص ${Object.keys(owned).length} نطاقاً مملوكاً (${Object.entries(owned).map(([n, o]) => `${n} ← ${typeof o === "string" ? path.basename(o) : o.pages.map((x) => path.basename(x)).join("+") + (o.dir ? `+${o.dir}` : "")}`).join("، ")}) على ${files.length} ملفّاً`);
