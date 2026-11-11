/* ============================================================================
 * flock-test — حالةُ الحقل (0265) بالتجريبيّ وبالحساب الصِّرف: الحرّاسُ نفسُها والرموزُ نفسُها.
 *
 * «حارسٌ لا يوجد بالتجريبيّ حارسٌ لم يُفحص» (CLAUDE.md §٤): المرآةُ (demoFlock.ts) تُنادى من بابها (flockApi) بلا
 * سحابة، بأدوارٍ كما يكتبها AuthContext، وتُرفض حيث يرفض الخادم بالرمز نفسه. والحسابُ (flockMath.ts) بحالاته الحدّية.
 * وتطابقُ الإحصاء مع القاعدة نفسِها بالحزمة (supabase/tests/flock-parity.mjs) — هنا ما لا يحتاج قاعدة.
 *
 *   node scripts/flock-test.mjs
 * ========================================================================= */
process.env.TZ = "Asia/Baghdad";   // «اليوم» يومُ بغداد كالخادم (_flock_today)
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const SESSION = /const KEY = "([^"]+)"/.exec(readFileSync("src/contexts/AuthContext.tsx", "utf8"))?.[1];
if (!SESSION) { console.error("✗ flock-test: ما انقرأ مفتاحُ الجلسة"); process.exit(1); }

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};
const EMPTY = new Set(["@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js", "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify"]);
const stubs = {
  name: "stubs",
  setup(b) {
    const map = {
      i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
      "./supabase": "export const supabase = null;",
      "./globalToast": "export const emitGlobalToast = () => {};",
    };
    b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
    b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
  },
};
const built = await esbuild.build({
  stdin: {
    contents: ['export { flockApi } from "./src/lib/flockApi.ts";', 'export * as M from "./src/lib/flockMath.ts";', 'export { localISO } from "./src/lib/utils.ts";'].join("\n"),
    resolveDir: process.cwd(), sourcefile: "flock-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const dir = mkdtempSync(path.join(tmpdir(), "flock-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const { flockApi: api, M, localISO } = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
if (!api || !M) { console.error("✗ flock-test: ما انحمّلت الوحدات"); process.exit(1); }
const errOf = async (f) => { try { await f(); return "قُبل"; } catch (e) { return e.message; } };
const as = (id, rawRole, staff) => mem.set(SESSION, JSON.stringify({
  raw: { id, full_name: `موظف ${id}`, email: `${id}@demo.vet`, rawRole, roles: ["clinic"], clinic_id: "clinic-happy-paws", ...(staff ? { staff } : {}) },
  active: "clinic",
}));
const T = localISO();
const D = (n) => M.addDays(T, n);

/* ── الحساب الصِّرف ─────────────────────────────────────────────────────────── */
console.log("▸ الحساب: العمر، النافق الموزَّع، السحب، الملخّص، الجرعة");
check("العمرُ بحساب الطبيب: يومُ الوصول ١، وبعد ٢٢ يوماً ٢٣، ويومُ عمر ١٤ = الوصول + ١٣",
  M.ageOn(T, T) === 1 && M.ageOn(D(-22), T) === 23 && M.dueOn(D(-22), 14) === D(-9));
check("  والتقريبُ نصفاً بعيداً عن الصفر (كـround بالقاعدة): 0.125 ⇒ 0.13، و1.005 ⇒ 1.01",
  M.round2(0.125) === 0.13 && M.round2(1.005) === 1.01 && M.round2(0.35) === 0.35);
{
  const losses = M.dailyLosses({ placed_count: 1000 }, [], [
    { house_id: null, on_date: D(-1), days: 3, dead: 30, culled: 0 },
    { house_id: null, on_date: T, days: 1, dead: 5, culled: 5 },
  ]);
  const byDay = Object.fromEntries(losses.map((d) => [d.day, d]));
  check("النافقُ «منذ آخر زيارة» (٣٠ بثلاثة أيام) يتوزّع ١٠ يومياً، والحيُّ ببداية اليوم ينقص بما قبله",
    byDay[D(-3)].loss === 10 && byDay[D(-1)].alive_start === 980 && byDay[T].alive_start === 970 && Math.abs(byDay[T].pct - 1000 / 970) < 1e-9);
}
{
  const L = (o) => ({ kind: "med", day_from: 1, day_to: 5, withdrawal_meat_days: 5, withdrawal_egg_days: null, ...o });
  const w = M.withdrawalOf([
    { start_on: D(-2), stopped_on: null, lines: [L({}), L({ kind: "vitamin", withdrawal_meat_days: 30 })] },
  ]);
  check("«لا تبيع قبل» = آخرُ يوم (اليوم + ٢) + ٥ + ١، والفيتامينُ لا يُحسب ولو بسحبٍ طويل", w.meat === D(8) && !w.unknownMeat);
  const stopped = M.withdrawalOf([{ start_on: D(-2), stopped_on: T, lines: [L({})] }]);
  const never = M.withdrawalOf([{ start_on: T, stopped_on: D(-1), lines: [L({ withdrawal_meat_days: null })] }]);
  check("  والموقوفةُ اليوم: آخرُ يوم = اليوم (+٥ +١)؛ والموقوفةُ قبل بدايتها ما انعطت — لا سحب ولا «غير معروف»",
    stopped.meat === D(6) && never.meat === null && !never.unknownMeat);
  check("  وسطرُ دواءٍ بلا سحبٍ مكتوب = «غير معروف» لا صفر",
    M.withdrawalOf([{ start_on: T, stopped_on: null, lines: [L({ withdrawal_meat_days: null })] }]).unknownMeat === true);
}
check("ملخّصُ التشريح: كم طيراً بكلّ آفة، الأكثرُ أوّلاً، و«طبيعي» ليس آفة، والمكرّرُ بطيرٍ واحد مرّة",
  JSON.stringify(M.necropsySummary([{ findings: ["air.cloudy", "heart.pericarditis", "air.cloudy"] }, { findings: ["air.cloudy", "liver.normal"] }, { findings: [] }]))
    === JSON.stringify([{ code: "air.cloudy", n: 2, of: 3 }, { code: "heart.pericarditis", n: 1, of: 3 }]));
{
  const days = M.sheetDays({ start_on: T, lines: [{ day_from: 1, day_to: 3 }, { day_from: 2, day_to: 5 }] }, D(-22));
  check("أيامُ الطبلة للمربي: خمسة أيام بتاريخها وعمرها، واليومُ الأوّل سطرٌ واحد والثاني سطران",
    days.length === 5 && days[0].date === T && days[0].age === 23 && days[0].lines.length === 1 && days[1].lines.length === 2 && days[4].lines.length === 1);
}
check("الكمّيةُ لليوم تحويلٌ لا قرار: ١ غم/لتر × ١٨٠٠ لتر = ١٨٠٠ غم؛ ١٠٠ غم/١٠٠٠ طير × ١٠٬٠٠٠ = ١٠٠٠؛ ١٠ ملغم/كغم × ١٠٬٠٠٠ × ١٫٢ ÷ ١٠٪ = ١٬٢٠٠٬٠٠٠ ملغم",
  M.dailyAmount({ dose_amount: 1, dose_per: "liter", strength_pct: null }, { alive: 10000, waterL: 1800, avgKg: null }) === 1800
  && M.dailyAmount({ dose_amount: 100, dose_per: "1000_birds", strength_pct: null }, { alive: 10000, waterL: null, avgKg: null }) === 1000
  && M.dailyAmount({ dose_amount: 10, dose_per: "kg_bw", strength_pct: 10 }, { alive: 10000, waterL: null, avgKg: 1.2 }) === 1_200_000);
check("  وبلا ماءٍ أو وزنٍ أو تركيز: لا رقمَ مخترع (null)",
  M.dailyAmount({ dose_amount: 1, dose_per: "liter", strength_pct: null }, { alive: 10000, waterL: null, avgKg: null }) === null
  && M.dailyAmount({ dose_amount: 10, dose_per: "kg_bw", strength_pct: null }, { alive: 10000, waterL: null, avgKg: 1.2 }) === null);
check("  وماءُ اللاحم التقديريّ بالأسبوع (عمر ١٥ = الأسبوع ٣: ١٨٠ لتر/١٠٠٠)، ولا تقديرَ قبل الوصول",
  M.estimatedWaterL(15, 10000) === 1800 && M.estimatedWaterL(0, 10000) === null && M.estimatedWaterL(90, 1000) === 330);

/* ── المرآة: الحرّاسُ والرموز ───────────────────────────────────────────────── */
console.log("▸ المرآة: الصلاحية، الفتح، النافق، الزيارة الذرّية، الطبلة، التحصين، الإغلاق");
as("u-rcp", "reception");
const open = {
  client_ref: "fc-1",
  farm: { name: "حقل الكرادة", owner_name: "أبو علي", owner_phone: "07701234567" },
  case: { kind: "broiler", breed: "Ross 308", placed_on: D(-22), placed_count: 10000 },
  vax: [{ vaccine: "ND+IB", route: "spray", age: 1, at_hatchery: true }, { vaccine: "گمبورو", route: "water", age: 14 }, { vaccine: "لاسوتا", route: "water", age: 24 }],
};
const r1 = await api.openCase(open);
const r2 = await api.openCase(open);
check("الاستقبال يفتح حالة حقل، وإعادتُها بالمرجع نفسِه ترجعها (لا وجبةٌ ثانية)", !r1.replayed && r2.replayed && r2.case.id === r1.case.id);
const CASE = r1.case.id;
check("  وحقلٌ ثانٍ لنفس الزبون بنفس الاسم يُرفض (تطبيعٌ بالطرفين)، ووجبةٌ ثانية لحقلٍ مفتوح تُرفض",
  await errOf(() => api.openCase({ ...open, client_ref: "fc-x", farm: { name: "حقل  الكرادة", owner_name: "ابو علي", owner_phone: "0770 123 4567" } })) === "flock_farm_twin"
  && await errOf(() => api.openCase({ ...open, client_ref: "fc-y", farm: { id: r1.farm.id } })) === "flock_open_exists");
check("  وحقولُ الزبون من «حالة جديدة» بمفتاحه (الرقمُ بصيغةٍ أخرى)", (await api.farmsFor("+964 770 123 4567", null))[0]?.open_case === CASE);
let b = await api.bundle(CASE);
check("  والإحصاء: عمر ٢٣، وتحصينُ الفقّاسة منجَز، والجاي گمبورو متأخّر",
  b.stats.age === 23 && b.vax.filter((v) => v.status === "given" && v.given_by === "hatchery").length === 1 && b.stats.next_vax?.vaccine === "گمبورو" && b.stats.vax_overdue === 1);

await api.saveMortality({ case_id: CASE, on_date: D(-1), dead: 30, culled: 5, source: "farmer", client_ref: "fm-1" });
const again = await api.saveMortality({ case_id: CASE, on_date: D(-1), dead: 30, culled: 5, client_ref: "fm-1" });
check("النافق: الاستقبال يسجّله، والمرجعُ المكرّر يرجعه", again.replayed === true && (await api.bundle(CASE)).mortality.length === 1);
check("  والتداخلُ والتراكميُّ والتاريخُ يُرفض كلٌّ برمزه",
  await errOf(() => api.saveMortality({ case_id: CASE, on_date: T, days: 3, dead: 1 })) === "flock_mortality_overlap"
  && await errOf(() => api.saveMortality({ case_id: CASE, on_date: D(-5), dead: 9999 })) === "flock_mortality_over"
  && await errOf(() => api.saveMortality({ case_id: CASE, on_date: D(1), dead: 1 })) === "flock_mortality_date");
await api.saveMortality({ case_id: CASE, on_date: T, dead: 40 });
b = await api.bundle(CASE);
check("  ويومان متتاليان فوق ٠٫٢٥٪ يُنذران، والحيُّ ٩٩٢٥", b.stats.mortality_alert === true && b.stats.alive === 9925);

const visit = {
  client_ref: "fv-1", case_id: CASE, kind: "complaint", at: new Date(Date.now() - 2 * 3600e3).toISOString(),
  flock: { feed_phase: "grower", avg_weight_g: 950, water_l_day: 1800 }, signs: ["resp.rales"], env: { ventilation: "poor" },
  trend: "worse", next_visit_on: D(2), mortality: [{ on_date: D(-2), dead: 12 }],
  necropsy: [{ bird_no: 1, findings: ["air.cloudy", "heart.pericarditis"] }, { bird_no: 2, findings: ["air.cloudy"] }],
};
check("الزيارة: الاستقبال ما يكتبها (flock_forbidden، ٤٢٥٠١ — لا «انتهت الجلسة»)",
  await (async () => { try { await api.saveVisit(visit); return false; } catch (e) { return e.message === "flock_forbidden" && e.code === "42501"; } })());
as("u-vet", "doctor");
const v1 = await api.saveVisit(visit);
check("  والطبيب يكتبها بنافقها وتشريحها، وإعادتُها لا تكرّرها", !v1.replayed && (await api.saveVisit(visit)).replayed === true);
b = await api.bundle(CASE);
check("  (طيران، و١٢ نافقاً مربوطةً بها)", b.necropsy.length === 2 && b.mortality.some((m) => m.visit_id === v1.visit.id && m.dead === 12));
const before = JSON.stringify(await api.bundle(CASE));
check("  وزيارةٌ بطيرٍ رقمُه ٠ تُرفض **كلُّها** — لا زيارةٌ ولا نافقُها (يومٌ صالح) نصفُها محفوظ",
  await errOf(() => api.saveVisit({ ...visit, client_ref: "fv-bad", mortality: [{ on_date: D(-3), dead: 3 }], necropsy: [{ bird_no: 0, findings: [] }] })) === "flock_necropsy"
  && JSON.stringify(await api.bundle(CASE)) === before);
check("  ورمزٌ غريب، وخانةٌ غير معروفة بالقطيع، كلٌّ برمزه",
  await errOf(() => api.saveVisit({ ...visit, client_ref: "fv-2", signs: ["سعال"] })) === "flock_codes"
  && await errOf(() => api.saveVisit({ ...visit, client_ref: "fv-3", flock: { hack: 1 } })) === "flock_visit_bad");

const tx = await api.saveTreatment({ client_ref: "ft-1", case_id: CASE, title: "CRD", start_on: D(-2), lines: [
  { day_from: 1, day_to: 5, product_name: "دوكسي", kind: "med", dose_amount: 1, dose_unit: "g", dose_per: "liter", strength_pct: null, hours: 6, route: "water", withdrawal_meat_days: 5, withdrawal_egg_days: null, product_id: null, note: null },
]});
b = await api.bundle(CASE);
check("الطبلة: «لا تبيع قبل» بعد ٨ أيام، والحالةُ بالسحب", b.stats.safe_meat_from === D(8) && b.stats.in_withdrawal);
await api.markTreatment(tx.id, "sent");
const v2 = await api.saveTreatment({ client_ref: "ft-1b", id: tx.id, start_on: T, lines: [
  { day_from: 1, day_to: 3, product_name: "تايلوزين", kind: "med", dose_amount: 1, dose_unit: "g", dose_per: "liter", strength_pct: null, hours: null, route: "water", withdrawal_meat_days: 1, withdrawal_egg_days: null, product_id: null, note: null },
]});
b = await api.bundle(CASE);
const old = b.treatments.find((t) => t.id === tx.id);
check("  وتعديلُ المُرسَلة نسخةٌ ثانية، والأولى «replaced» موقوفةٌ اليوم — ودوكسي باقٍ بالسحب (اليوم + ٦)",
  v2.version === 2 && old.status === "replaced" && old.stopped_on === T && b.stats.safe_meat_from === D(6));
check("  والنسخةُ القديمة لا تُعدَّل، والجرعةُ بلا وحدة تُرفض",
  await errOf(() => api.saveTreatment({ id: tx.id, lines: [{ day_from: 1, day_to: 1, product_name: "x" }] })) === "flock_treatment_replaced"
  && await errOf(() => api.saveTreatment({ case_id: CASE, lines: [{ day_from: 1, day_to: 1, product_name: "x", dose_amount: 2 }] })) === "flock_treatment_line");

const gum = b.vax.find((v) => v.planned_age === 14);
const gv = await api.saveVax({ id: gum.id, vaccine: gum.vaccine, route: "water", planned_age: 14, status: "given", given_on: D(-9), given_by: "farmer", batch_no: "B-77" });
b = await api.bundle(CASE);
check("التحصين: يُسجَّل منجَزاً (أعطاه المربي)، والجاي يصير لاسوتا ٢٤، ولا متأخّر", gv.status === "given" && b.stats.vax_overdue === 0 && b.stats.next_vax?.age === 24);
check("  والمنجَزُ لا يُحذف، والتركُ يحتاج سبباً",
  await errOf(() => api.deleteVax(gum.id)) === "flock_vax_given"
  && await errOf(() => api.saveVax({ case_id: CASE, vaccine: "x", route: "water", planned_age: 30, status: "skipped" })) === "flock_vax");

as("u-rcp", "reception");
check("البرنامج للمدير لا للاستقبال", await errOf(() => api.saveProgram({ name: "لاحم", kind: "broiler", steps: [] })) === "flock_forbidden");
as("u-own", "owner");
check("  والمدير يكتبه بخطواته", (await api.saveProgram({ name: "لاحم", kind: "broiler", steps: [{ age: 7, vaccine: "ND", disease: null, route: "eye", at_hatchery: false }] })).steps.length === 1);

as("u-vet", "doctor");
check("الإغلاق بيعاً قبل «لا تبيع قبل» يُرفض، وبالتأكيد يُغلق، والنافقُ على المغلقة يُرفض، وإعادةُ الفتح ترجعها",
  await errOf(() => api.closeCase(CASE, { reason: "sold" })) === "flock_withdrawal_active"
  && (await api.closeCase(CASE, { reason: "sold", confirm_withdrawal: true })).status === "closed"
  && await errOf(() => api.saveMortality({ case_id: CASE, on_date: D(-10), dead: 1 })) === "flock_case_closed"
  && (await api.reopenCase(CASE)).status === "open");
check("  وتاريخُ وصولٍ بعد نافقٍ مسجّل يُرفض", await errOf(() => api.updateCase(CASE, { placed_on: D(-1) })) === "flock_placed_on");

as("u-ph", "reception", { clinicId: "clinic-happy-paws", role: "reception", staffRole: "photographer" });
check("موظّفُ التصوير يُردّ عند البوّابة (photographer_forbidden) حتى بالقراءة", await errOf(() => api.board("open")) === "photographer_forbidden");

/* ── الحدود الثابتة ─────────────────────────────────────────────────────────── */
console.log("▸ الحدود الثابتة");
const code = (f) => readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
check("المرآةُ بلا عربيةٍ معروضة (الرفضُ رمزٌ تترجمه الشاشة)", !/[؀-ۿ]/.test(code("src/lib/demoFlock.ts")));
check("  والبابُ يصل المرآةَ من repoDemo وحده (لا استيرادٌ ثابت يجرّها لحزمةٍ أخرى)",
  /import\("\.\/repoDemo"\)\.then\(\(m\) => m\.loadDemoFlock\(\)\)/.test(code("src/lib/flockApi.ts")) && !/from "\.\/demoFlock"/.test(code("src/lib/flockApi.ts")));
check("  وقائمةُ البرامج بالسحابة ترمي على الخطأ (لا قائمةٌ فارغة تُصدَّق)", /if \(error\) throw serverError/.test(code("src/lib/flockApi.ts")));

console.log(fails ? `\n✗ flock-test: ${passes} نجح، ${fails} فشل` : `\n✓ flock-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
