/* ============================================================================
 * تصنيفاتُ المتجر بالنسخة التجريبية — «حارسٌ لا يوجد هنا حارسٌ لم يُفحص».
 *
 * النسخةُ التجريبيةُ مرآةُ 0233–0235: تكتب بـapplyOps نفسِها، وتبذر حيث يبذر الخادم وحده
 * (فتحُ المتجر، وinit)، وتقول «لا» حيث يقولها (البنيةُ للمدير والطبيب، والعضويةُ لكلّ من له
 * إذن المتجر، والرابطُ والتشغيلُ للمدير). وانحرافُها يُخفي العطلَ بدل أن يكشفه — فتُفحص
 * هنا بالحالة المشتركة مع حزمة الهجرات (store-cats-cases.json): نفسُ العمليات ونفسُ المتوقَّع.
 * وتلميحاتُ المرآة تُطابَق بنصّ الهجرة حرفاً، وأسماءُ البذرة وأيقوناتُها بقائمة القيد.
 *
 *   node scripts/store-cats-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
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
async function load(contents, tag) {
  const built = await esbuild.build({
    stdin: { contents, resolveDir: process.cwd(), sourcefile: `${tag}.ts`, loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  });
  const dir = mkdtempSync(join(tmpdir(), `${tag}-`));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}
const mod = await load('export * from "./src/lib/repo.ts"; export * as SCI from "./src/lib/storeCatIndex.ts";', "store-cats");
const repo = mod.repo;
const SCI = mod.SCI;
if (!repo || !SCI) { console.error("✗ store-cats-test: ما انحمّلت الوحدة"); process.exit(1); }

const DB_KEY = /const KEY = "([^"]+)"/.exec(readFileSync("src/lib/demoStore.ts", "utf8"))?.[1];
const CASES = JSON.parse(readFileSync("scripts/store-cats-cases.json", "utf8"));
const SQL = readFileSync("supabase/migrations/0233_store_categories.sql", "utf8") + readFileSync("supabase/migrations/0234_store_front_categories.sql", "utf8") + readFileSync("supabase/migrations/0235_store_owner_lock.sql", "utf8");

const P = (id, name, category, extra = {}) => ({ id, name, category, barcode: null, stock: 2, sell_price: 1000, purchase_price: 500, store_visible: false, ...extra });
const seedDB = (products, store = null) => {
  mem.set(DB_KEY, JSON.stringify({ products, companies: [], companySections: [], invoices: [], invoiceItems: [], storeProfile: store, storeOrders: [] }));
};
const session = (role, staffRole = null) => mem.set("vp_session", JSON.stringify({
  raw: { id: "u1", full_name: "x", email: "x@demo.vet", rawRole: role, roles: ["clinic"], clinic_id: "clinic-happy-paws",
    ...(staffRole ? { staff: { clinicId: "clinic-happy-paws", role, staffRole } } : {}) },
  active: "clinic",
}));
const err = async (fn) => { try { await fn(); return "ok"; } catch (e) { return e?.message ?? String(e); } };
const errObj = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };
const STORE = { slug: "demo-vet", enabled: true, delivery_fee: 0, min_order: 0, bio: null, whatsapp: null };
const PRODUCTS = [
  P("f1", "اكل ١", "food", { store_visible: true }), P("f2", "اكل ٢", "food", { store_visible: true }), P("f3", "اكل ٣", "food"),
  P("c1", "مستهلك ١", "consumables", { store_visible: true }), P("c2", "مستهلك ٢", "consumables", { store_visible: true }),
  P("n1", "بلا صنف", null, { store_visible: true }), P("farm", "علف", "food", { store_visible: true, farm_id: "farm-1" }),
];

console.log("▸ القراءةُ لا تكتب، والبذرةُ بفتح المتجر وحده");
{
  mem.clear();
  session("admin");
  seedDB(PRODUCTS);
  const before = mem.get(DB_KEY);
  const snap = await repo.storeCategoriesList();
  check("عيادةٌ بلا متجر: seeded=false ولا تصنيف", snap.seeded === false && snap.cats.length === 0, JSON.stringify(snap).slice(0, 120));
  check("  والقراءةُ لم تكتب حرفاً (seed-guard: لا بذرةَ بقراءة)", mem.get(DB_KEY) === before);
  check("  والمديرُ يعدّل البنية (can_edit)", snap.can_edit === true);
  await repo.saveStoreProfile(STORE);
  const s1 = await repo.storeCategoriesList();
  check("فتحُ المتجر يبذر خمسةً بترتيب المعروض ثم الأكثر ثم الأصناف",
    s1.seeded && s1.cats.map((c) => c.seed_key).join() === "food,consumables,medicine,accessories,other", s1.cats.map((c) => c.seed_key).join());
  const food = s1.cats.find((c) => c.seed_key === "food");
  check("  وأعضاءُ «أغذية» موادُّ صنفها بلا منتج الحقل، وبلا صنفٍ لا عضويةَ له",
    (s1.members[food.id] ?? []).slice().sort().join() === "f1,f2,f3" && !Object.values(s1.members).flat().includes("n1"), JSON.stringify(s1.members));
  check("  وn وn_listed لكلٍّ", food.n === 3 && food.n_listed === 2, `${food.n}/${food.n_listed}`);
  await repo.saveStoreProfile({ ...STORE, bio: "نبذة" });
  check("  وحفظٌ ثانٍ لا يبذر من جديد", (await repo.storeCategoriesList()).cats.length === 5);
  const clinic = s1.clinic;
  await repo.storeCategoriesApply(clinic, [{ op: "archive", id: food.id }]);
  await repo.storeCategoriesApply(clinic, [{ op: "init" }]);
  const s2 = await repo.storeCategoriesList();
  check("  وما شالته العيادةُ لا يرجع بـinit (الدفتر)",
    s2.cats.filter((c) => c.seed_key === "food").length === 1 && s2.cats.find((c) => c.id === food.id)?.archived_at != null && s2.cats.length === 5);
  check("  واسترجاعُه يعيده بأعضائه", (await repo.storeCategoriesApply(clinic, [{ op: "restore", id: food.id }])).members[food.id]?.length === 3);
  check("  وختمُ عيادةٍ أخرى ⇒ clinic_switched", (await err(() => repo.storeCategoriesApply("other-clinic", [{ op: "init" }]))) === "clinic_switched");
}

console.log("▸ الحقوق (O3/O5) — كالخادم");
{
  mem.clear();
  session("doctor");
  seedDB(PRODUCTS);
  check("الطبيبُ لا يفتح متجراً (store_owner_only)", (await err(() => repo.saveStoreProfile(STORE))) === "store_owner_only");
  session("admin");
  await repo.saveStoreProfile(STORE);
  session("doctor");
  check("  ويحفظ النبذة", (await err(() => repo.saveStoreProfile({ ...STORE, bio: "نبذة الطبيب" }))) === "ok");
  const slugErr = await errObj(() => repo.saveStoreProfile({ ...STORE, slug: "demo-vet-2" }));
  check("  ولا يغيّر الرابط — بتلميح الخادم حرفاً", slugErr?.message === "store_owner_only" && SQL.includes(slugErr?.hint ?? "∅"), String(slugErr?.hint));
  const clinic = (await repo.storeCategoriesList()).clinic;
  const id = "11111111-1111-4111-8111-111111111111";
  check("  وينشئ تصنيفاً (البنيةُ للطبيب)", (await err(() => repo.storeCategoriesApply(clinic, [{ op: "create", id, name: "عروض", icon: "star" }]))) === "ok");
  session("reception", "photographer");
  const ph = await repo.storeCategoriesList();
  check("المصوّرُ يقرأ ولا يعدّل البنية (can_edit=false)", ph.can_edit === false);
  const struct = await errObj(() => repo.storeCategoriesApply(clinic, [{ op: "edit", id, name: "تغيير" }]));
  check("  وبنيةٌ منه ⇒ not_authorized بـ42501 والتلميحُ نصُّ الخادم", struct?.message === "not_authorized" && struct?.code === "42501" && SQL.includes(struct?.hint ?? "∅"), `${struct?.message}/${struct?.code}`);
  check("  ويؤشّر العضويةَ بأيّ تصنيف", (await err(() => repo.storeCategoriesApply(clinic, [{ op: "add", cat: id, ids: ["f1", "n1"] }, { op: "remove", cat: id, ids: ["f1"] }]))) === "ok");
  check("    (n1 وحده باقٍ)", JSON.stringify((await repo.storeCategoriesList()).members[id]) === JSON.stringify(["n1"]));
  check("  ولا يطفئ المتجر", (await err(() => repo.saveStoreProfile({ ...STORE, enabled: false }))) === "store_owner_only");
  session("reception");
  check("الاستقبالُ بلا إذن المتجر لا يقرأ", (await err(() => repo.storeCategoriesList())) === "not_authorized");
}

console.log("▸ الحالةُ المشتركة مع الحزمة (store-cats-cases.json)");
{
  mem.clear();
  session("admin");
  seedDB(PRODUCTS);
  await repo.saveStoreProfile(STORE);
  const clinic = (await repo.storeCategoriesList()).clinic;
  await repo.storeCategoriesApply(clinic, CASES.order.create);
  const after = await repo.storeCategoriesApply(clinic, CASES.order.moves);
  const ids = new Set(CASES.order.ids);
  const order = after.cats.filter((c) => ids.has(c.id) && c.archived_at == null).map((c) => c.name).join(",");
  check("T13: الترتيبُ نفسُه الذي تقيسه الحزمةُ على بوستغريس", order === CASES.order.expect, order);
  const live = after.cats.find((c) => c.seed_key === "food");
  const tw = await errObj(() => repo.storeCategoriesApply(clinic, [{ op: "create", id: "22222222-2222-4222-8222-222222222222", name: CASES.twins.try }]));
  check(`T8: «${CASES.twins.try}» بجانب «${live?.name}» ⇒ ${CASES.twins.code}، والتلميحُ يسمّيها`,
    tw?.message === CASES.twins.code && String(tw?.hint).includes(`«${CASES.twins.live}»`), `${tw?.message} ${tw?.hint}`);
  const snapBefore = JSON.stringify(await repo.storeCategoriesList());
  const at = await err(() => repo.storeCategoriesApply(clinic, [
    { op: "create", id: "33333333-3333-4333-8333-333333333333", name: "دفعة" },
    { op: "add", cat: "33333333-3333-4333-8333-333333333333", ids: ["f1", "missing-product"] },
  ]));
  check(`T9: مادّةٌ غائبة ⇒ ${CASES.atomic.code}، ولا أثرَ لنصف الدفعة`, at === CASES.atomic.code && JSON.stringify(await repo.storeCategoriesList()) === snapBefore, at);
  check("  ومنتجُ حقلٍ كذلك", (await err(() => repo.storeCategoriesApply(clinic, [{ op: "add", cat: live.id, ids: ["farm"] }]))) === CASES.atomic.code);
  const liveN = (await repo.storeCategoriesList()).cats.filter((c) => c.archived_at == null).length;
  const fill = Array.from({ length: CASES.caps.live - liveN }, (_, i) => ({ op: "create", id: `44444444-4444-4444-8444-${String(i).padStart(12, "0")}`, name: `سقف ${i}` }));
  await repo.storeCategoriesApply(clinic, fill);
  const full = await errObj(() => repo.storeCategoriesApply(clinic, [{ op: "create", id: "55555555-5555-4555-8555-555555555555", name: "زيادة" }]));
  check(`T10: الحيُّ ${CASES.caps.live + 1} ⇒ ${CASES.caps.code} بتلميحٍ عربيّ`, full?.message === CASES.caps.code && String(full?.hint).includes("٤٠"), full?.message);
  const many = Array.from({ length: CASES.caps.ids + 1 }, (_, i) => `p-${i}`);
  check(`  وأكثرُ من ${CASES.caps.ids} معرّفاً ⇒ ${CASES.caps.idsCode}`, (await err(() => repo.storeCategoriesApply(clinic, [{ op: "add", cat: live.id, ids: many }]))) === CASES.caps.idsCode);
}

console.log("▸ المرآةُ عقدٌ مع الهجرة حرفاً");
{
  const hints = Object.entries(SCI.STORE_CAT_HINTS);
  const missing = hints.filter(([, v]) => !v.split("%s").every((part) => SQL.includes(part))).map(([k]) => k);
  check(`تلميحاتُ المرآة (${hints.length}) موجودةٌ بنصّ 0233/0234 حرفاً`, missing.length === 0, missing.join());
  const iconSql = /icon in \(([^)]*)\)/.exec(SQL)?.[1] ?? "";
  const sqlIcons = [...iconSql.matchAll(/'([a-z]+)'/g)].map((m) => m[1]);
  check("مفاتيحُ الأيقونات = قائمةُ قيد 0233", JSON.stringify(sqlIcons) === JSON.stringify([...SCI.STORE_CAT_ICON_KEYS]), sqlIcons.join());
  const seedSql = [...SQL.matchAll(/\('(medicine|food|accessories|consumables|other)', '([^']+)', '([a-z]+)', (\d)\)/g)].map((m) => `${m[1]}:${m[2]}:${m[3]}:${m[4]}`);
  const seedTs = SCI.SEED_DEFS.map((d, i) => `${d.key}:${SCI.seedName(d.key)}:${d.icon}:${i + 1}`);
  check("وبذرةُ الهجرة = بذرةُ المرآة (المفتاح، والاسمُ نصُّ storeLib، والأيقونة، والترتيب)", JSON.stringify(seedSql) === JSON.stringify(seedTs), `${seedSql} ≠ ${seedTs}`);
}

console.log(fails ? `\n✗ store-cats-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ store-cats-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
