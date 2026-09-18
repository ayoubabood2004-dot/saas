/* ============================================================================
 * باقةُ حقل الدواجن — باقةٌ قائمةٌ بذاتها لا ترقيةٌ لباقةِ عيادة.
 *
 * بقرار المالك: «باقة وحدها اسمها باقة حقل الدواجن، تفاصيلُ اشتراكها وما
 * بداخلها تختلف عن العيادة». وهذا يخلق أوّلَ حالةٍ بالنظام لباقةٍ **ليست
 * أعلى ولا أدنى** من الأخريات — وسلّمُ الباقات كان يفترض الترتيب:
 *   • `minPlanFor` كانت ترجع «السوبر» لأيّ ميزةٍ ليست بالمطورة. فلو بقيت،
 *     لقالت لصاحب حقلٍ «متوفّرٌ بباقة السوبر» — وهي لا تحتوي الحقل. ترقيةٌ
 *     تُشترى ولا تفتح ما اشتُريت له أسوأُ من لا اقتراح.
 *   • وشبكةُ الأسعار `cols-3`: بطاقةٌ رابعةٌ بجنب العادية/المطورة/السوبر تقول
 *     «الأكمل» وهي ليست كذلك — فتُفصل بجمهورها.
 *
 *   node scripts/plans-farm-test.mjs
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
const cat = (f) => JSON.parse(readFileSync(f, "utf8"));
const AR = cat("src/i18n/ar.json"), EN = cat("src/i18n/en.json");

console.log("▸ الباقةُ موجودةٌ وقائمةٌ بذاتها");
const farm = plans.PLANS.find((p) => p.id === "farm");
check("باقةُ `farm` معرَّفة", !!farm);
check("  وجمهورُها الحقلُ لا العيادة", farm.audience === "farm");
check("  ولها سعر", farm.monthlyUsd > 0 && farm.annualUsd > 0);

console.log("▸ نصُّها بالقاموسين لا بالشِفرة");
// النصوصُ انتقلت من `plans.ts` إلى القاموسين — فمن فتح شاشةَ الاشتراك
// بالإنكليزية كان يقرأ أسماءَ الباقات ومزاياها عربية.
check("لا اسمَ ولا وصفَ بالشِفرة (انتقلا للقاموس)", farm.name === undefined && farm.tag === undefined);
for (const [lang, d] of [["ar", AR], ["en", EN]]) {
  const c = d.plans?.farm;
  check(`  ${lang}: اسمٌ ووصفٌ ومزايا`, !!c?.name && !!c?.tag && Array.isArray(c.feats) && c.feats.length >= 5, JSON.stringify(c)?.slice(0, 60));
  check(`  ${lang}: وتقول ما **ليس** فيها`, Array.isArray(c?.missing) && c.missing.length >= 2);
}
check("وكلُّ باقةٍ لها نصُّها باللغتين — لا باقةَ بلا اسم",
  plans.PLANS.every((p) => AR.plans?.[p.id]?.name && EN.plans?.[p.id]?.name));
check("وكلُّ ميزةٍ لها صنفُها باللغتين",
  Object.keys(ent.FEATURE_LABEL ?? {}).length === 0 && !!AR.features?.farm && !!EN.features?.farm);

console.log("▸ لا تُعرض بشبكة باقات العيادة");
check("`CLINIC_PLANS` ثلاثٌ بلا الحقل", plans.CLINIC_PLANS.length === 3 && !plans.CLINIC_PLANS.some((p) => p.id === "farm"));
check("  و`FARM_PLANS` تحوي الحقلَ وحدَه", plans.FARM_PLANS.length === 1 && plans.FARM_PLANS[0].id === "farm");
check("  و`PLANS` تحويهما معاً (الفوترةُ ولوحةُ الأسعار تحتاج الكلّ)", plans.PLANS.length === 4);
check("  و`isFarmPlan` تميّزها", plans.isFarmPlan("farm") && !plans.isFarmPlan("super") && !plans.isFarmPlan(null));

console.log("▸ ما تفتحه وما لا تفتحه");
check("الحقلُ يفتح قسمَ الحقول", ent.planAllows("farm", "farm"));
check("  ولا باقةَ عيادةٍ تفتحه — ولا السوبر",
  !ent.planAllows("super", "farm") && !ent.planAllows("advanced", "farm") && !ent.planAllows("basic", "farm"));
check("  ولا يفتح الكاشيرَ ولا المتجر", !ent.planAllows("farm", "pos") && !ent.planAllows("farm", "store"));
check("  ويفتح التقاريرَ والتصدير (الجردُ الإكسليّ)",
  ent.planAllows("farm", "reports") && ent.planAllows("farm", "reportsExport"));

console.log("▸ سلّمُ الترقية لا يكذب");
check("`minPlanFor('farm')` ترجع الحقلَ لا السوبر", ent.minPlanFor("farm") === "farm", ent.minPlanFor("farm"));
check("  ولم تنكسر للباقي", ent.minPlanFor("pos") === "advanced" && ent.minPlanFor("store") === "super" && ent.minPlanFor("debt") === "super");

console.log("▸ التجربةُ المجّانية تُري كلَّ شيءٍ كما كانت");
check("بالتجربة يُفتح قسمُ الحقول ولو بلا باقة", ent.hasFeature("trialing", null, "farm"));
check("  وبالمقفلة لا شيء", !ent.hasFeature("locked", "farm", "farm"));
check("  والمنتهيةُ ترى ما اشتركت به (قراءةً — الحارسُ يمنع الكتابة)", ent.hasFeature("expired", "farm", "farm"));

console.log("▸ وشبكتا الأسعار تعرضان باقات العيادة");
for (const f of ["src/pages/Landing.tsx", "src/pages/Subscribe.tsx"]) {
  const src = readFileSync(f, "utf8");
  check(`  ${f.split("/").pop()} تعرض CLINIC_PLANS لا PLANS`, /CLINIC_PLANS\.map/.test(src) && !/\bPLANS\.map/.test(src));
}

console.log(fails ? `\n✗ plans-farm-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ plans-farm-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
