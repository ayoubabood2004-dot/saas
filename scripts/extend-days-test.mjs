/* ============================================================================
 * تمديدُ الخطة من يومٍ واحد — وقرارُ المالك D3 (١٤/١٠).
 *
 * ── الجذرُ المقيس ─────────────────────────────────────────────────────────
 *  ١) أقصرُ تمديدٍ كان ثلاثةَ أيام: `[3, 5, 7, 14]` و«٧» مختارةٌ سلفاً، فحالةٌ تحتاج يوماً
 *     تُمدَّد ثلاثةً أو تُكتب باليد. والعددُ بنصٍّ مركَّب «{n} أيام» — «٢ أيام» و«١٤ أيام».
 *  ٢) `extendCourse` بلا try: فشلُ الكتابة يترك النافذةَ تدور ثم تُغلق كأنّ شيئاً لم يكن.
 *     وجوابٌ يضيع بعد كتابةٍ وصلت يُعاد ضغطُه فيُمدَّد مرّتين — لأن آخرَ يومٍ يُقرأ من
 *     حالة الشاشة لا من القاعدة.
 *  ٣) رقاقاتُ «مدة الخطة» بالمعالج وبطاقةِ الدواء تبدأ من ٣، ولوحةُ الأيام تقبل ٣٦٥ بينما
 *     `savePlan` تقصّ على ٦٠ بصمت.
 *  ٤) `routeName`/`routeShort` تفهرس جدولَها بلا بديل: صفٌّ بطريقٍ لا يعرفه الجهاز (نسخةٌ
 *     أحدث كتبته) يرمي TypeError فتنطفئ الطبلةُ كلُّها.
 *
 *   node scripts/extend-days-test.mjs
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
const section = async (title, fn) => {
  console.log(title);
  try { await fn(); } catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }
};

const STUBS = {
  "@/i18n": "export default { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar' };",
};
const load = async (contents) => {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
    define: { "import.meta.env": "__VITE_ENV__", "process.env.NODE_ENV": '"production"' },
    banner: { js: "const __VITE_ENV__ = {};" },
    plugins: [{
      name: "stubs",
      setup(b) {
        const names = Object.keys(STUBS).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
        b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: STUBS[a.path] ?? "export default {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), "extend-days-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};

/** نصُّ المصدر بلا تعليقات — شرحٌ يذكر الرقم ليس استعمالاً. */
const src = (f) => readFileSync(f, "utf8").replace(/\r\n/g, "\n")
  .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
  .replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
/** جسمُ دالّةٍ أو مكوّنٍ من سطر تعريفه حتى إغلاقه بنفس العمق — الجسمُ يبدأ بأوّل `) {` أو
 *  `) => {` بعد الرأس (خصائصُ المكوّن المفكوكة `({ a, b }: {…})` أقواسٌ قبل الجسم). */
const bodyOf = (text, head) => {
  const i = text.indexOf(head);
  if (i < 0) return "";
  const m = /\)\s*(?:=>\s*)?\{/.exec(text.slice(i));
  if (!m) return "";
  let depth = 0, started = false;
  for (let j = i + m.index + m[0].length - 1; j < text.length; j++) {
    const c = text[j];
    if (c === "{") { depth++; started = true; } else if (c === "}") { depth--; if (started && depth === 0) return text.slice(i, j + 1); }
  }
  return text.slice(i);
};
const AR_RE = /[؀-ۿ]/;

const visit = src("src/pages/VisitPage.tsx");
const ar = JSON.parse(readFileSync("src/i18n/ar.json", "utf8"));
const en = JSON.parse(readFileSync("src/i18n/en.json", "utf8"));

await section("▸ ١) dayForm: صيغةُ العدد العربية", async () => {
  const M = await load(`export * from "./src/lib/dayWords.ts";`);
  const want = { 1: "1", 2: "2", 3: "Few", 10: "Few", 11: "Many", 14: "Many" };
  for (const [n, f] of Object.entries(want)) check(`dayForm(${n}) = ${f}`, M.dayForm(Number(n)) === f, String(M.dayForm(Number(n))));
});

await section("▸ ٢) المفاتيحُ بالقاموسين", async () => {
  const keys = ["extBtn", "extTitle", "extIntro", "extDaysLabel", "extD1", "extD2", "extDFew", "extDMany", "extPick",
    "extGo1", "extGo2", "extGoFew", "extGoMany", "extFail", "extChanged"];
  const missing = keys.filter((k) => typeof ar.vbk?.[k] !== "string" || typeof en.vbk?.[k] !== "string");
  check("كلُّ مفاتيح التمديد بـvbk بالعربية والإنكليزية", missing.length === 0, missing.join("، "));
  check("«يومين» لا «٢ أيام»، و«يوماً» للأحد عشر فما فوق", ar.vbk?.extD2 === "يومين" && /يوماً/.test(ar.vbk?.extDMany ?? "") && /أيام/.test(ar.vbk?.extDFew ?? ""));
});

await section("▸ ٣) نافذةُ التمديد", async () => {
  const modal = bodyOf(visit, "function ExtendPlanModal(");
  check("المكوّنُ موجود", modal.length > 0);
  check("الخياراتُ [1, 2, 3, 5, 7, 14]", /\[1, 2, 3, 5, 7, 14\]/.test(visit));
  check("لا مدّةَ مختارةٌ سلفاً: useState<number | null>(null)", /useState<number \| null>\(null\)/.test(modal));
  check("وتُصفَّر عند كلّ فتح", /if \(open\) \{ setDays\(null\)/.test(modal));
  check("لا عربيةَ خامّاً داخل النافذة (كلُّها بـt())", !modal.split("\n").some((l) => AR_RE.test(l) && !/\bt\(/.test(l)),
    modal.split("\n").find((l) => AR_RE.test(l) && !/\bt\(/.test(l))?.trim());
  check("نصُّ الرقاقة والزرّ بصيغة العدد (dayForm)", /vbk\.extD\$\{dayForm\(/.test(modal) && /vbk\.extGo\$\{dayForm\(/.test(modal));
  check("الزرُّ معطَّلٌ حتى يُختار عدد، ويقول «اختر عدد الأيام»", /disabled=\{[^}]*!days/.test(modal) && /vbk\.extPick/.test(modal));
  check("والنافذةُ تمرّر اليومَ الذي رآه الطبيب: onExtend(days, lastDay)", /onExtend\(days, lastDay\)/.test(modal));
  check("زرُّ «تمديد الخطة» بمفتاح", /label=\{t\("vbk\.extBtn"/.test(visit));
});

await section("▸ ٤) extendCourse: الفشلُ يُقال، والتكرارُ يُمسَك", async () => {
  const fn = bodyOf(visit, "const extendCourse = async (");
  check("الدالّةُ موجودة", fn.length > 0);
  check("try/catch يلفّها", /try \{/.test(fn) && /catch \(e\)/.test(fn));
  check("تقرأ صفوفَ الزيارة من القاعدة: listVisitTreatments(", /repo\.listVisitTreatments\(/.test(fn));
  check("وتقارن آخرَ يومٍ فيها باليوم الذي رآه الطبيب", /!== fromDay/.test(fn) && /vbk\.extChanged/.test(fn));
  check("وتنسخ صفوفَ ذلك اليوم من القاعدة لا من حالة الشاشة", /fresh\.filter\(\(x\) => x\.day === fromDay\)/.test(fn) && !/treatments\.filter/.test(fn));
  check("والفشلُ برسالة الخادم: describeDbError", /describeDbError\(e, t\)/.test(fn) && /vbk\.extFail/.test(fn));
});

await section("▸ ٥) listVisitTreatments: قائمةُ قرارٍ ترمي، بمرآتها، ومسموحةٌ بالقراءة فقط", async () => {
  const repo = src("src/lib/repo.ts");
  const demo = src("src/lib/repoDemo.ts");
  const body = bodyOf(repo, "async listVisitTreatments(");
  check("السحابيّ بـallPages (لا listOf)", /allPages</.test(body) && !/listOf</.test(body), body.slice(0, 160));
  check("والتجريبيّ مرآةٌ بالزيارة", /async listVisitTreatments\(visitId: string\)/.test(demo));
  check("بـREAD_ONLY_ALLOWED", /"listVisitTreatments"/.test(repo.slice(repo.indexOf("READ_ONLY_ALLOWED"))));
  check("وبقائمة قرارات fetch-guard", /"listVisitTreatments"/.test(readFileSync("scripts/fetch-guard.mjs", "utf8")));
});

await section("▸ ٦) مدّةُ الخطة بالمعالج وبطاقة الدواء: ١ و٢، واللوحةُ على حدّ savePlan", async () => {
  const plan = src("src/components/TreatmentPlan.tsx");
  const card = src("src/components/treatment/DrugCard.tsx");
  check("المعالج: [1, 2, 3, 5, 7, 10, 14]", /\[1, 2, 3, 5, 7, 10, 14\]\.map/.test(plan));
  check("البطاقة: [1, 2, 3, 5, 7, 10, 14]", /\[1, 2, 3, 5, 7, 10, 14\]\.map/.test(card));
  check("لوحةُ أيام المعالج max={60}", /initial=\{planDays\} decimals=\{false\} min=\{1\} max=\{60\}/.test(plan));
  check("لوحةُ أيام البطاقة max={60}", /initial=\{row\.days\} decimals=\{false\} min=\{1\} max=\{60\}/.test(card));
  check("وsavePlan ما زالت تقصّ على ٦٠", /Math\.min\(60, m\.days \|\| 1\)/.test(visit));
});

await section("▸ ٧) طريقٌ لا يعرفه الجهاز لا يُسقط الطبلة", async () => {
  const F = await load(`export { routeShort, routeName } from "./src/lib/flowsheet.ts";`);
  let threw = null;
  let s = "", n = "";
  try { s = F.routeShort("ocular"); n = F.routeName("water"); } catch (e) { threw = e; }
  check("routeShort(\"ocular\") وrouteName(\"water\") لا يرميان", threw === null, String(threw?.message ?? ""));
  check("ويُعرضان بنصٍّ غير فارغ", typeof s === "string" && s.length > 0 && typeof n === "string" && n.length > 0, `${s}|${n}`);
  check("والطريقُ المعروف ما زال باسمه", F.routeShort("iv") === "و.ر" && F.routeName("im") === "عضلي");
});

console.log(`\n${fails ? "✗" : "✓"} extend-days-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
