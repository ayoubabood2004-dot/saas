/* ============================================================================
 * بندُ المختبر ← خدمةُ الكتالوج (src/lib/labServiceMatch.ts) — على البيانات الحقيقية لا نسخةٍ منها:
 * لوحاتُ labCatalog.ts (LAB_PANELS) والكتالوجُ الافتراضيّ كما يبذره services.ts لكلّ عيادةٍ جديدة.
 *
 * العطلُ الذي يحرسه (مقيسٌ بالكتالوج الافتراضيّ نفسِه): المطابقةُ القديمة «أكثرُ كلماتٍ مشتركة، والأوّلُ
 * يفوز بالتعادل» فوترت «تحليل البول» بـ«تحليل دم شامل (CBC)»، و«فحص سريع Snap» بـ«فحص براز»، و«تحليل حر»
 * بـCBC — و«تعداد الدم CBC» صحّت بترتيب القائمة وحده. ومنذ 0252 الخدمةُ تقرّر أيَّ وصفةٍ تنخصم، فالخطأُ
 * يخصم كواشفَ تحليلٍ لم يُعمل. فهنا: كلُّ لوحةٍ بجوابها، والجوابُ لا يتبع الترتيب، والنسخةُ القديمة (حرفاً)
 * تفشل بنفس الحالات — برهانُ أن الفحصَ يمسك العطل لا يمرّ بجانبه — وشاشةُ البيع تنادي الدالّة.
 *
 *   node scripts/lab-service-match-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* utils.ts يستورد i18next وclsx وtailwind-merge والعملة، وlabCatalog.ts يستورد ‎@/lib/cbc — لا واحدٌ منها
 * يخصّ المطابقة. الجذوعُ للأولى، والمسارُ الحقيقيّ لـ‎@/ — فالدالّةُ واللوحاتُ من شِفرتها الحقيقية. */
const SRC = join(process.cwd(), "src");
const plugin = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "export default { t: (k) => k, language: 'ar' };",
      clsx: "export const clsx = (...a) => a.join(' '); export default clsx;",
      "tailwind-merge": "export const twMerge = (s) => s;",
      "./currency": "export const currencyInfo = () => ({ symbol: 'د.ع', decimals: 0 }); export const getActiveCurrency = () => 'IQD';",
    };
    b.onResolve({ filter: /^(i18next|clsx|tailwind-merge|\.\/currency)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    b.onResolve({ filter: /^@\// }, (a) => b.resolve("./" + a.path.slice(2), { kind: a.kind, resolveDir: SRC }));
  },
};
let mod;
try {
  const built = await esbuild.build({
    stdin: { contents: `export { matchLabService, labWords } from "./src/lib/labServiceMatch";
export { LAB_PANELS } from "./src/lib/labCatalog";`, resolveDir: process.cwd(), loader: "js" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", plugins: [plugin],
  });
  mod = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
} catch (e) {
  console.error(`   ✗ الوحدة ما تنبني — ${String(e.message).split("\n")[0]}`);
  process.exit(1);
}
const { matchLabService, labWords, LAB_PANELS } = mod;

/* الكتالوجُ الافتراضيّ من نصّ services.ts (seedCatalog) بترتيبه وأصنافه — بذرةُ كلّ عيادةٍ جديدة والتجريبيّ. */
const svcSrc = readFileSync("src/lib/services.ts", "utf8");
const seedBody = svcSrc.slice(svcSrc.indexOf("function seedCatalog"), svcSrc.indexOf("function readLocal"));
const SEED = [...seedBody.matchAll(/\{ id: uuid\(\), category_id: (\w+), name: "([^"]+)", price: (\d+) \}/g)]
  .map(([, cat, name, price], i) => ({ id: `seed${i}`, category_id: cat, name, price: Number(price) }));
const PANELS = new Map(LAB_PANELS.map((p) => [p.id, p.label]));

console.log("▸ البيانات الحقيقية");
check(`الكتالوجُ الافتراضيّ قُرئ من services.ts (${SEED.length} خدمة، منها المختبرُ الأربع)`,
  SEED.length >= 12 && ["تحليل دم شامل (CBC)", "تحاليل كيمياء الدم", "تحليل بول", "فحص براز"].every((n) => SEED.some((s) => s.name === n)),
  SEED.map((s) => s.name).join("، "));
check(`لوحاتُ المختبر من labCatalog.ts (${PANELS.size} لوحة)`,
  ["cbc", "chem", "urinalysis", "fecal", "snap", "custom"].every((k) => PANELS.has(k)), [...PANELS.keys()].join(","));

/* ── ١) كلُّ لوحةٍ بالكتالوج الافتراضيّ: الصحيحُ أو لا شيء ─────────────────────── */
const EXPECT = {
  cbc: "تحليل دم شامل (CBC)",
  chem: "تحاليل كيمياء الدم",
  urinalysis: "تحليل بول",            // كانت CBC
  fecal: "فحص براز",
  snap: null,                         // كانت «فحص براز»: ما بالكتالوج فحصٌ سريع
  custom: null,                       // «تحليل حر» كانت CBC
};
const nameOf = (s) => (s ? s.name : null);
console.log("▸ كلُّ لوحةٍ ← خدمتُها بالكتالوج الافتراضيّ (أو لا خدمة — بلا تخمين)");
for (const [id, label] of PANELS) {
  const got = nameOf(matchLabService(label, SEED));
  const want = id in EXPECT ? EXPECT[id] : null;
  check(`${label} ← ${want ?? "بلا خدمة"}`, got === want, `طلع «${got ?? "بلا خدمة"}»`);
}

/* ── ٢) الجوابُ لا يتبع ترتيبَ القائمة (CBC كانت تصحّ لأنها أولى وحدها) ─────────────── */
console.log("▸ الترتيبُ لا يحكم");
let seed = 0x5eed;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const shuffle = (a) => { const x = [...a]; for (let i = x.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [x[i], x[j]] = [x[j], x[i]]; } return x; };
const orders = [[...SEED].reverse(), ...Array.from({ length: 40 }, () => shuffle(SEED))];
const drift = [];
for (const [id, label] of PANELS) {
  const base = nameOf(matchLabService(label, SEED));
  for (const o of orders) { const g = nameOf(matchLabService(label, o)); if (g !== base) { drift.push(`${id}: ${base} ⇄ ${g}`); break; } }
}
check("كلُّ لوحةٍ بنفس الجواب بالمعكوس وبأربعين خلطةً ببذرةٍ ثابتة", drift.length === 0, drift.join("؛ "));

/* ── ٣) النسخةُ القديمة حرفاً (SaleBuilder قبل الإصلاح) تفشل هنا — فالفحصُ يمسك العطل ──────── */
console.log("▸ النسخةُ القديمة تفشل بنفس الحالات");
function oldMatch(label, services, categories) {
  const labCatIds = new Set(categories.filter((c) => /مختبر|تحاليل|مختبرات/.test(c.name)).map((c) => c.id)); /* i18n-data */
  const tok = (x) => x.toLowerCase().replace(/[()ً-ٟ،.\-]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
  const want = new Set(tok(label));
  let best = null;
  for (const svc of services) {
    if (svc.name.trim() === label.trim()) { best = { s: svc, score: 999 }; break; }
    let score = tok(svc.name).filter((w) => want.has(w)).length;
    if (score > 0 && labCatIds.has(svc.category_id)) score += 0.5;
    if (score > 0 && (!best || score > best.score)) best = { s: svc, score };
  }
  return best ? best.s : null;
}
const CATS = [{ id: "lab", name: "المختبر" }];
check("القديمة: «تحليل البول» ← CBC", nameOf(oldMatch(PANELS.get("urinalysis"), SEED, CATS)) === "تحليل دم شامل (CBC)");
check("القديمة: «فحص سريع Snap» ← «فحص براز»", nameOf(oldMatch(PANELS.get("snap"), SEED, CATS)) === "فحص براز");
check("القديمة: «تحليل حر» ← CBC", nameOf(oldMatch(PANELS.get("custom"), SEED, CATS)) === "تحليل دم شامل (CBC)");
check("القديمة: «تعداد الدم CBC» تتبع الترتيب (بالمعكوس تصير الكيمياء)",
  nameOf(oldMatch(PANELS.get("cbc"), [...SEED].reverse(), CATS)) === "تحاليل كيمياء الدم");

/* ── ٤) القاعدةُ بحالاتها ───────────────────────────────────────────────────── */
console.log("▸ القاعدة");
const S = (...names) => names.map((name, i) => ({ id: `x${i}`, name }));
check("الطيُّ بالطرفين: «البول» = «بول»، «البراز» = «براز»، «الأملاح» = «املاح» (همزة + أداة تعريف)",
  nameOf(matchLabService("تحليل البول", S("تحليل بول"))) === "تحليل بول"
  && nameOf(matchLabService("فحص البراز", S("فحص براز", "فحص عام"))) === "فحص براز"
  && nameOf(matchLabService("الأملاح", S("املاح", "مراجعة"))) === "املاح");
check("الأرقامُ الشرقيّة = الغربيّة، والتشكيلُ والترقيمُ لا يفرّقان",
  nameOf(matchLabService("فحص ٤ في ١", S("فحص 4 في 1", "فحص عام"))) === "فحص 4 في 1"
  && nameOf(matchLabService("تَحْلِيل (بول)", S("تحليل بول"))) === "تحليل بول");
check("كلمةٌ عامّة وحدها لا تكفي — ولو كانت الخدمةُ الوحيدةَ التي تحملها («فحص سريع Snap» ↛ «فحص عام»)",
  matchLabService("فحص سريع Snap", S("فحص عام", "مراجعة")) === null);
check("التعادلُ بلا حكم («تحليل حر» بين «تحليل دم» و«تحليل بول»)",
  matchLabService("تحليل حر", S("تحليل دم", "تحليل بول")) === null);
check("كلمةٌ مميِّزةٌ تحملها خدمتان لا تميّز («بارفو» بالفحص واللقاح)",
  matchLabService("بارفو", S("فحص بارفو سريع", "لقاح بارفو")) === null);
check("تحليلٌ يكتبه الطبيب بكلمةٍ مميِّزة يلقى خدمتَه («تحليل فيروس بارفو» ← «فحص بارفو»)",
  nameOf(matchLabService("تحليل فيروس بارفو", S("فحص بارفو", "فحص عام", "تحليل دم شامل (CBC)"))) === "فحص بارفو");
check("الاسمُ نفسُه بخدمتين ⇒ بلا حكم", matchLabService("تحليل بول", S("تحليل بول", "تحليل  البول")) === null);
check("اسمٌ فارغ أو كتالوجٌ فارغ ⇒ بلا خدمة", matchLabService("", SEED) === null && matchLabService(" / — ", SEED) === null && matchLabService("تحليل بول", []) === null);
check("labWords: تقشيرُ «ال» لا يأكل كلمةً قصيرة («الم» تبقى) ولا يبقي حرفاً واحداً",
  JSON.stringify(labWords("الم الدم ب CBC")) === JSON.stringify(["الم", "دم", "cbc"]), JSON.stringify(labWords("الم الدم ب CBC")));
check("الخدمةُ نفسُها تُرجَع (معرّفُها وسعرُها) لا نسخة", (() => { const svc = { id: "u1", name: "تحليل بول", price: 15000, cost: 0 }; return matchLabService("تحليل البول", [svc]) === svc; })());

/* ── ٥) شاشةُ البيع تنادي الدالّة، والقديمةُ ما بقت ─────────────────────────────── */
console.log("▸ شاشةُ البيع");
const sb = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
check("SaleBuilder يستورد matchLabService ويناديها على خدمات الكتالوج",
  sb.includes('import { matchLabService } from "@/lib/labServiceMatch";') && /matchLabService\(label, getServiceCatalog\(\)\.services\)/.test(sb));
check("  والبندُ يأخذ معرّفَ الخدمة المطابَقة وحدها (serviceId: hit ? hit.id : null)", sb.includes("serviceId: hit ? hit.id : null"));
/* بصمةُ المطابقة القديمة وحدها: نقاطٌ وأفضليةُ صنفٍ بنصف نقطة. (labCatIds بموضعٍ آخر — تصنيفُ سطور البيعة
 * للسجلّ الطبيّ بعد البيع — شغلٌ آخر لا يختار خدمة، فلا يُفحص هنا.) */
check("  والمطابقةُ القديمة (نقاطٌ، +0.5 للصنف، الأوّلُ يفوز) ما بقت بالشاشة",
  !/score \+= 0\.5|best: \{ s: Service; score: number \}|tok\(svc\.name\)/.test(sb));

console.log(`\n${fails ? "✗" : "✓"} lab-service-match: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
