/* ============================================================================
 * فحصُ تصنيف الحركات — الواجهةُ (activityKinds.ts) على نفس الحالات التي تفحصها
 * الحزمةُ على `audit_kind()` بالقاعدة (activity-cases.json). يختلفان = فشل.
 *
 *   node scripts/activity-kinds-test.mjs
 * ==========================================================================*/
import fs from "node:fs";
import esbuild from "esbuild";

const cases = JSON.parse(fs.readFileSync("scripts/activity-cases.json", "utf8"));
const built = await esbuild.build({ entryPoints: ["src/lib/activityKinds.ts"], bundle: true, format: "esm", write: false, platform: "neutral" });
const { auditKind, activityBrief, ACTIVITY_GROUPS, KIND_GROUP } = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

let fails = 0, passes = 0;
const check = (name, ok, detail = "") => { if (ok) { passes++; console.log(`   ✓ ${name}`); } else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); } };

console.log("▸ auditKind — نفس حالات القاعدة");
for (const c of cases) {
  const got = auditKind(c.entity, c.action, c.details);
  check(`${c.entity}/${c.action} → ${c.kind}`, got === c.kind, `طلع ${got}`);
}
console.log("▸ كلُّ نوعٍ له مجموعة، وكلُّ مجموعةٍ لها اسم");
const kinds = new Set(cases.map((c) => c.kind));
check("كل الأنواع المفحوصة مصنَّفة بمجموعة", [...kinds].every((k) => KIND_GROUP[k]), [...kinds].filter((k) => !KIND_GROUP[k]).join(","));
check("لا نوعَ بمجموعتين", new Set(ACTIVITY_GROUPS.flatMap((g) => g.kinds)).size === ACTIVITY_GROUPS.flatMap((g) => g.kinds).length);

console.log("▸ activityBrief — مختصرٌ لا صفٌّ كامل");
const big = "x".repeat(500);
const b = activityBrief({ name: "رويال", logo: big, __changed: Object.fromEntries(Array.from({ length: 12 }, (_, i) => [`f${i}`, [i, i + 1]]).concat([["updated_at", ["a", "b"]], ["blob", [big, big]]])) });
check("القيمُ الطويلة لا تُنقل", !("logo" in b) && "name" in b);
check("التغييراتُ تُقصّ على ثمانية بلا ضجيج", Object.keys(b.__changed).length === 8 && !("updated_at" in b.__changed) && !("blob" in b.__changed), JSON.stringify(Object.keys(b.__changed)));
check("بلا تفاصيل = null", activityBrief(null) === null);

console.log(`\n${fails ? "✗" : "✓"} activity-kinds-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
