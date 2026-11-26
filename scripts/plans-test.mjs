/* ============================================================================
 * الباقات بعد إلغاء «حقل الدواجن» (قرارُ المالك ٢٤/١١).
 *
 * كانت «باقة الحقل» باقةً قائمةً بذاتها لصاحب الحقل (دفترُ حقولٍ وقاعاتٍ ودفعاتٍ ومخزنُ حقل،
 * 0191–0193، ومساحةُ المشغّل 0247). طلب المالك: «تشيل هاي سالفة الحقل الي جان عدنا وتترك حقل
 * الدواجن الي الدكتور يتعامل بي بداخل العيادة» — أي «حالة الحقل» (0265). فيُثبَّت هنا:
 *   • الباقاتُ ثلاثٌ للعيادة، ولا نصَّ ولا ميزةَ ولا نطاقَ قاموسٍ للحقل القديم.
 *   • صفُّ اشتراكٍ قديمٌ بـ`plan = 'farm'` (الجداولُ وبياناتُها باقيةٌ بالقاعدة) **لا ينهار ولا يفتح**
 *     ميزةً مدفوعة — والتجربةُ تفتح كلَّ شيءٍ كما كانت.
 *   • «حقول الدواجن» بالقائمة و«حقل الدواجن» بحالة جديدة يفتحان حالةَ الحقل بلا شرطِ باقة.
 *   • والطابورُ ما زال يعرف إدخالاتِ الحقل القديمة: جهازٌ عليه يومٌ لم يُرفع لا يضيع يومُه.
 *
 *   node scripts/plans-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const load = async (entry, tag) => {
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    plugins: [{
      name: "stub",
      setup(b) {
        b.onResolve({ filter: /^(\.\/subscription|react)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
        b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export const useSubscription = () => ({ status: 'active', sub: { plan: null } }); export default {};", loader: "js" }));
      },
    }],
  });
  const dir = mkdtempSync(join(tmpdir(), `plans-${tag}-`));
  const f = join(dir, "m.mjs");
  writeFileSync(f, built.outputFiles[0].text);
  return import(pathToFileURL(f).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
};

const plans = await load("src/lib/plans.ts", "p");
const ent = await load("src/lib/entitlements.ts", "e");
const src = (f) => readFileSync(f, "utf8");
const cat = (f) => JSON.parse(src(f));
const AR = cat("src/i18n/ar.json"), EN = cat("src/i18n/en.json");
const HOT = cat("src/i18n/hot-paths.json");

console.log("▸ الباقاتُ ثلاثٌ للعيادة — ولا «حقل»");
check("PLANS = العادية والمطوّرة والسوبر", JSON.stringify(plans.PLANS.map((p) => p.id)) === JSON.stringify(["basic", "advanced", "super"]),
  plans.PLANS.map((p) => p.id).join(","));
check("  ولكلٍّ سعرُها", plans.PLANS.every((p) => p.monthlyUsd > 0 && p.annualUsd > 0));
check("  وشبكةُ الأسعار تعرضها كلَّها (CLINIC_PLANS)", plans.CLINIC_PLANS.length === 3);
check("  ولا `FARM_PLANS` ولا `isFarmPlan`", plans.FARM_PLANS === undefined && plans.isFarmPlan === undefined);

console.log("▸ نصُّها بالقاموسين، ونصُّ الحقل القديم شِيل");
check("كلُّ باقةٍ لها اسمُها باللغتين", plans.PLANS.every((p) => AR.plans?.[p.id]?.name && EN.plans?.[p.id]?.name));
for (const [lang, d] of [["ar", AR], ["en", EN]]) {
  check(`  ${lang}: لا plans.farm ولا features.farm ولا نطاقُ farm`, !d.plans?.farm && !d.features?.farm && d.farm === undefined);
}
check("  ولا نطاقٌ مملوكٌ اسمُه farm", !("farm" in (HOT.owned ?? {})));
check("  و«حقل الدواجن» بحالة جديدة نصُّه بنطاق صفحتها (ncase.fieldCase)", !!AR.ncase?.fieldCase && !!EN.ncase?.fieldCase);

console.log("▸ صفُّ اشتراكٍ قديمٌ بـ`farm` لا ينهار ولا يفتح ميزةً مدفوعة");
check("planAllows('farm', …) = لا لكلّ ميزة", ["pos", "reports", "reportsExport", "store", "debt", "payroll"].every((f) => ent.planAllows("farm", f) === false));
check("  وبالفعّال لا شيء", !ent.hasFeature("active", "farm", "reports") && !ent.hasFeature("active", "farm", "pos"));
check("  والتجربةُ تفتح كلَّ شيء كما كانت", ent.hasFeature("trialing", "farm", "pos") && ent.hasFeature("trialing", null, "store"));
check("  والمقفلةُ لا شيء", !ent.hasFeature("locked", "super", "pos"));
check("سلّمُ الترقية: الكاشير والتقارير بالمطوّرة، والمتجرُ والدَّين بالسوبر",
  ent.minPlanFor("pos") === "advanced" && ent.minPlanFor("reports") === "advanced" && ent.minPlanFor("store") === "super" && ent.minPlanFor("debt") === "super",
  [ent.minPlanFor("pos"), ent.minPlanFor("reports"), ent.minPlanFor("store"), ent.minPlanFor("debt")].join(","));

console.log("▸ «حقول الدواجن» = حالةُ الحقل (0265) لكلّ عيادة");
const app = src("src/App.tsx");
check("المسارُ /poultry/* يرسم FlockCases مباشرةً", /path="\/poultry\/\*"[^\n]*<FlockCases \/>/.test(app) && /import\("@\/pages\/FlockCases"\)[^\n]*\["flk"\]/.test(app));
check("  ولا /platform/farm ولا pages/Fields ولا PoultryFarms", !/platform\/farm|pages\/Fields|PoultryFarms|PlatformFarmEntry/.test(app));
for (const f of ["src/components/Sidebar.tsx", "src/components/TopBar.tsx"]) {
  const s = src(f);
  check(`  ${f.split("/").pop()}: خانةُ /poultry بلا شرطِ باقة`, /\{ to: "\/poultry", icon: Bird, label: t\("nav\.poultry"\) \}/.test(s) && !/plan !== "farm"/.test(s));
  check(`  ${f.split("/").pop()}: ولا رابطَ /platform/farm`, !/platform\/farm/.test(s));
}
const nc = src("src/pages/NewCase.tsx");
check("حالة جديدة: زرُّ «حقل الدواجن» يُرسم دائماً ويفتح /poultry/new",
  /data-entry-field[\s\S]{0,400}navigate\("\/poultry\/new"[\s\S]{0,200}t\("ncase\.fieldCase"\)/.test(nc) && !/plan !== "farm"|plans\.farm/.test(nc));
for (const f of ["src/pages/PoultryFarms.tsx", "src/pages/Fields.tsx", "src/lib/platformFarm.ts", "src/lib/poultryKpi.ts"]) {
  check(`  ${f} شِيل`, !existsSync(f));
}
const console_ = src("src/pages/PlatformConsole.tsx");
check("لوحةُ المنصّة بلا «ادخل حقلي» — ومساحاتُ المشغّلين ما زالت معزولةً عن قائمة العيادات",
  !/platformFarmEnter|ادخل حقلي|PlatformFarmEntry/.test(console_) && /platformWorkspaceIds\(\)/.test(console_) && /hidden=\{ws\.all\}/.test(console_));
check("  وشريطُ المشغّل بلا وضع الحقل", !/inFarm|platformWorkspaceIds/.test(src("src/components/PlatformBanner.tsx")));

console.log("▸ الطابورُ ما زال يرفع إدخالاتِ الحقل القديمة (لا يضيع يومٌ على جهاز)");
const ob = src("src/lib/outbox.ts");
check("OutboxTable يعرف poultry_daily وOutboxRpcFn يعرف poultry_consume",
  /export type OutboxTable = [^\n]*"poultry_daily"/.test(ob) && /export type OutboxRpcFn = [^\n]*"poultry_consume"/.test(ob));
const repo = src("src/lib/repo.ts"), demo = src("src/lib/repoDemo.ts");
check("  ومراجعةُ /outbox تقرأ يومَ الخادم (listPoultryDaily بالنصفين، قراءةٌ مسموحةٌ للمنتهي)",
  /async listPoultryDaily\(cycleId\)/.test(repo) && /async listPoultryDaily\(cycleId: string\)/.test(demo)
  && /"listReturnRows", "countVisible", "listPoultryDaily"/.test(repo));
check("  ولا كاتبَ جديدٌ لأيّام الحقل", !/savePoultryDaily|poultryConsume\(|addPoultryFarm|openPoultryCycle/.test(repo + demo));

console.log("▸ وشبكتا الأسعار تعرضان باقات العيادة");
for (const f of ["src/pages/Landing.tsx", "src/pages/Subscribe.tsx"]) {
  const s = src(f);
  check(`  ${f.split("/").pop()} تعرض CLINIC_PLANS`, /CLINIC_PLANS\.map/.test(s) && !/\bPLANS\.map/.test(s));
}

console.log(fails ? `\n✗ plans-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ plans-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
