/* ============================================================================
 * حارسُ النطاقات المملوكة — «نصُّ صفحةٍ لا يُقرأ خارجها».
 *
 * نطاقٌ مملوك (`owned` بـsrc/i18n/hot-paths.json) لا يدخل النصفَ البارد: يصل بحزمةٍ
 * صغيرةٍ مع صفحته وحدَها (`page(load, [ns])`). فملفٌّ آخر يقرأ مفتاحاً منه يرسم مفتاحاً
 * خاماً على شاشته — ولا يمسكه شيءٌ غيرُ هذا: الفحوصُ تجري خارج Vite بالقاموس كاملاً.
 * ويشترط لكلّ نطاق:
 *   ١) لا يقرأ مفاتيحَه إلا ملفُّ مالكه **ورفاقُه المعلَنون** (`with`)؛
 *   ٢) المالكُ لا يستورده أحدٌ استيراداً ثابتاً (وإلا صار جزءاً من صفحةٍ أخرى)؛
 *   ٣) App.tsx يحمّل المالكَ بـpage(…, [..."ns"...]) — وإلا فالصفحةُ نفسُها بلا نصوصها؛
 *   ٤) الرفيقُ (متجر v1: ألواحُ «المتجر الإلكتروني» بملفّاتها) موجودٌ ويقرأ النطاق، ولا
 *      يستورده — ثابتاً أو كسولاً — إلا المالكُ أو رفيقٌ آخر: رفيقٌ تستورده صفحةٌ غريبة
 *      يُرسم هناك بلا نطاقه، وهو نفسُ العطل بخطوةٍ أبعد.
 * ويقول ما فحص — «حارسٌ يخرج صفراً بلا كلمة ليس حارساً». ويجرّب نفسَه أوّلاً على حالاتٍ
 * مصنوعة (رفيقٌ يقرأ ⇒ يمرّ؛ رفيقٌ يستورده غريب ⇒ يفشل؛ غريبٌ يقرأ ⇒ يفشل) — حارسٌ لا
 * يُمسك ما وُضع ليمسكه أسوأُ من لا حارس.
 *
 *   node scripts/i18n-owned-guard.mjs
 * ==========================================================================*/
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readOwnedFull } from "./i18n-split.mjs";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const noExt = (p) => p.replace(/\.(tsx?|mjs)$/, "");

/** مُحدِّداتُ الاستيراد بملفّ (ثابتةً وكسولة) محلولةً لمسارٍ نسبيٍّ للجذر بلا امتداد. */
function importsOf(fileRel, text) {
  const out = new Set();
  for (const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*)["']([^"']+)["']/g)) {
    const spec = m[1];
    let r = null;
    if (spec.startsWith("@/")) r = "src/" + spec.slice(2);
    else if (spec.startsWith("./") || spec.startsWith("../")) r = path.posix.normalize(path.posix.join(path.posix.dirname(fileRel), spec));
    if (r) { out.add(noExt(r)); out.add(noExt(r).replace(/\/index$/, "")); }
  }
  return out;
}

/**
 * الفحصُ خالصاً: `files` = [{rel, text}] (نصُّ src كاملاً)، و`app` = نصُّ App.tsx. يرجع الأخطاء.
 */
export function checkOwned(owned, files, app) {
  const errs = [];
  const appS = strip(app);
  const byRel = new Map(files.map((f) => [f.rel, f]));
  const imports = new Map(files.map((f) => [f.rel, importsOf(f.rel, f.text)]));
  for (const [ns, { owner, with: mates }] of Object.entries(owned)) {
    const re = new RegExp(`["'\`]${ns}\\.[A-Za-z_]`);
    const readers = files.filter((f) => !f.rel.startsWith("src/i18n/") && re.test(strip(f.text))).map((f) => f.rel);
    const family = new Set([owner, ...mates]);
    const strangers = readers.filter((r) => !family.has(r));
    if (strangers.length) errs.push(`النطاقُ ${ns} مملوكٌ لـ${owner} ويقرؤه غيرُه: ${strangers.join("، ")} — انقل مفاتيحَه لنطاقٍ بارد، أو أعلن الملفَّ رفيقاً (with) إن كان لا يستورده إلا المالك`);
    if (!readers.includes(owner)) errs.push(`النطاقُ ${ns}: مالكُه ${owner} لا يقرؤه — مالكٌ خاطئ بـhot-paths.json`);
    const mod = owner.replace(/^src\//, "@/").replace(/\.tsx?$/, "");
    const ownerImporters = files.filter((f) => f.rel !== "src/App.tsx" && new RegExp(`from ["']${mod}["']`).test(f.text)).map((f) => f.rel);
    if (ownerImporters.length) errs.push(`${owner} مستوردٌ استيراداً ثابتاً من ${ownerImporters.join("، ")} — نطاقُه ${ns} لن يصله`);
    const call = new RegExp(`page\\(\\(\\) => import\\(["']${mod}["']\\)[\\s\\S]{0,120}?,\\s*\\[[^\\]]*["']${ns}["'][^\\]]*\\]\\)`);
    if (!call.test(appS)) errs.push(`App.tsx لا يحمّل ${owner} بـpage(…, ["${ns}"]) — الصفحةُ ستُرسم بلا نصوص نطاقها`);
    for (const mate of mates) {
      if (!byRel.has(mate)) { errs.push(`النطاقُ ${ns}: الرفيقُ ${mate} غيرُ موجود — احذفه من with`); continue; }
      if (!readers.includes(mate)) errs.push(`النطاقُ ${ns}: الرفيقُ ${mate} لا يقرؤه — احذفه من with`);
      const key = noExt(mate);
      const outsiders = files.filter((f) => !family.has(f.rel) && imports.get(f.rel)?.has(key)).map((f) => f.rel);
      if (outsiders.length) errs.push(`الرفيقُ ${mate} (نطاقُ ${ns}) يستورده غيرُ مالكه: ${outsiders.join("، ")} — سيُرسم هناك بلا نطاقه`);
    }
  }
  return errs;
}

/* ── التجربةُ على النفس ─────────────────────────────────────────────────── */
function selfCases() {
  const owned = { zz: { owner: "src/pages/Zz.tsx", with: ["src/components/zz/Panel.tsx"] } };
  const app = `const Zz = page(() => import("@/pages/Zz").then((m) => ({ default: m.Zz })), ["zz"]);`;
  const ownerF = { rel: "src/pages/Zz.tsx", text: `import { Panel } from "@/components/zz/Panel";\nt("zz.title", "x");` };
  const mateF = { rel: "src/components/zz/Panel.tsx", text: `export function Panel() { return t("zz.panel", "y"); }` };
  const cases = [
    ["رفيقٌ يقرأ النطاق ويستورده المالك ⇒ يمرّ", [ownerF, mateF], 0],
    ["رفيقٌ يستورده غريب ⇒ يفشل", [ownerF, mateF, { rel: "src/pages/Other.tsx", text: `import { Panel } from "../components/zz/Panel";` }], 1],
    ["وغريبٌ يستورده كسولاً ⇒ يفشل", [ownerF, mateF, { rel: "src/pages/Other.tsx", text: `const P = lazy(() => import("@/components/zz/Panel"));` }], 1],
    ["غريبٌ يقرأ zz.* ⇒ يفشل", [ownerF, mateF, { rel: "src/pages/Other.tsx", text: `t("zz.title")` }], 1],
    ["رفيقٌ لا يقرأ النطاق ⇒ يفشل", [ownerF, { rel: "src/components/zz/Panel.tsx", text: `export const Panel = 1;` }], 1],
  ];
  const bad = [];
  for (const [name, files, want] of cases) {
    const got = checkOwned(owned, files, app).length;
    if ((want === 0) !== (got === 0)) bad.push(`${name} — خرج ${got} خطأً`);
  }
  return bad;
}

const isMain = !!process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const self = selfCases();
  if (self.length) {
    console.error(`✗ i18n-owned-guard: الحارسُ لا يُمسك ما وُضع ليمسكه:\n  • ${self.join("\n  • ")}`);
    process.exit(1);
  }
  const ROOT = process.cwd();
  const owned = readOwnedFull(ROOT);
  const paths = [];
  const walk = (d) => { for (const f of readdirSync(d)) { const p = path.join(d, f); if (statSync(p).isDirectory()) walk(p); else if (/\.(tsx?|mjs)$/.test(f)) paths.push(p); } };
  walk(path.join(ROOT, "src"));
  const rel = (p) => path.relative(ROOT, p).split(path.sep).join("/");
  const files = paths.map((p) => ({ rel: rel(p), text: readFileSync(p, "utf8") }));
  const errs = checkOwned(owned, files, readFileSync(path.join(ROOT, "src/App.tsx"), "utf8"));
  if (errs.length) {
    console.error(`✗ i18n-owned-guard:\n  • ${errs.join("\n  • ")}`);
    process.exit(1);
  }
  const mates = Object.values(owned).reduce((n, o) => n + o.with.length, 0);
  console.log(`✓ i18n-owned-guard: فُحص ${Object.keys(owned).length} نطاقاً مملوكاً (${Object.entries(owned).map(([n, o]) => `${n} ← ${path.basename(o.owner)}${o.with.length ? ` +${o.with.length}` : ""}`).join("، ")}) و${mates} رفيقاً على ${files.length} ملفّاً، وخمسُ حالاتٍ مصنوعة على الحارس نفسه`);
}
