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
const mod = await load('export * from "./src/lib/repo.ts"; export * as SCI from "./src/lib/storeCatIndex.ts"; export { STORE_CAT_ICONS } from "./src/lib/storeLib.ts";', "store-cats");
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
  // الإيموجي (storeLib) يُرسم بصفحة الزائر والإدارة: مفتاحٌ بلا رسمٍ مربّعٌ فارغ، ورسمٌ بلا مفتاحٍ لا يُختار.
  const glyphKeys = Object.keys(mod.STORE_CAT_ICONS ?? {});
  check("ورسومُ الأيقونات (STORE_CAT_ICONS) = قائمةُ القيد نفسُها، كلٌّ برسمٍ غيرِ فارغ",
    JSON.stringify(glyphKeys) === JSON.stringify(sqlIcons) && Object.values(mod.STORE_CAT_ICONS ?? {}).every((g) => typeof g === "string" && g.length > 0), glyphKeys.join());
}

/* ── متجرُ الشاشة (src/lib/storeCats.ts) — بخادمٍ مزيّفٍ يطبّق المرآةَ نفسَها ────────────
 * الشاشةُ ترسم قبل الخادم وتُرسل دفعةً واحدة؛ فالعقدُ: قراءةٌ لا تكتب، طلبٌ واحدٌ بالطريق (ما يأتي
 * أثناءه يُطوى بالتالي)، والرفضُ يُرجع ما على الشاشة ويقرأ مرّةً ويُرمى ليُقال، والختمُ المختلف
 * (`switched`) يرفض قبل الشبكة. */
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 8; i++) await tick(); };
console.log("▸ متجرُ الشاشة (storeCats): متفائل، طلبٌ واحدٌ بالطريق، والفشلُ يرجع ويُقال");
try {
  globalThis.__clinic = "C1";
  const clientStubs = {
    name: "client-stubs",
    setup(b) {
      const map = {
        react: "export const useSyncExternalStore = () => undefined; export const useEffect = () => {};",
        "./repo": "export const repo = new Proxy({}, { get: (_t, k) => (...a) => globalThis.__srv[k](...a) });",
        "./clinics": "export const getActiveClinicId = () => globalThis.__clinic;",
        "./clinicSync": "export const registerReset = (fn) => { globalThis.__reset = fn; };",
        // جلسةٌ بلا Supabase: المفتاحُ "C1" ليس "default" فالمقارنةُ به (workspaceClinic.ts).
        "./supabase": "export const supabase = null;",
      };
      const names = Object.keys(map).map((k) => k.replace(/[/.@]/g, "\\$&")).join("|");
      b.onResolve({ filter: new RegExp(`^(${names})$`) }, (a) => ({ path: a.path, namespace: "cstub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "cstub" }));
      b.onLoad({ filter: /.*/, namespace: "cstub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    },
  };
  const built = await esbuild.build({
    stdin: { contents: 'export * from "./src/lib/storeCats.ts"; export * as X from "./src/lib/storeCatIndex.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"], plugins: [clientStubs],
  });
  const dir = mkdtempSync(join(tmpdir(), "store-cats-client-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  const S = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

  const U = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const srv = { clinic: "C1", canEdit: true, state: { seeded: true, cats: [], items: [] }, list: 0, applies: [], failApply: null, failList: null, hold: null };
  const snap = () => S.X.snapshotOf(srv.state, srv.clinic, srv.canEdit, () => ({ listed: true }));
  globalThis.__srv = {
    storeCategoriesList: async () => { srv.list++; if (srv.failList) { const e = srv.failList; srv.failList = null; throw e; } return snap(); },
    storeCategoriesApply: async (clinic, ops) => {
      srv.applies.push(ops);
      if (srv.hold) await srv.hold.p;
      if (srv.failApply) { const e = srv.failApply; srv.failApply = null; throw e; }
      if (clinic !== srv.clinic) throw new S.X.StoreCatError("clinic_switched");
      srv.state = S.X.applyOps(srv.state, ops, { canEdit: srv.canEdit, now: "2026-10-13T00:00:00.000Z" });
      return snap();
    },
  };
  const defer = () => { let r; const p = new Promise((res) => { r = res; }); return { p, release: r }; };

  await S.loadStoreCats(true);
  let st = S.getStoreCatsState();
  check("القراءة: حالُ ready بختم الخادم، ولا كتابةَ واحدة", st.status === "ready" && st.clinic === "C1" && srv.applies.length === 0 && srv.list === 1, `${st.status} ${st.clinic} ${srv.applies.length}`);

  const p1 = S.applyStoreCatOps([{ op: "create", id: U(1), name: "أول" }]);
  st = S.getStoreCatsState();
  check("متفائل: التصنيفُ على الشاشة قبل الخادم، والحفظُ جارٍ", st.view.cats.some((c) => c.id === U(1)) && st.saving && !st.base.cats.some((c) => c.id === U(1)));
  await p1; await settle();
  st = S.getStoreCatsState();
  check("  وبعد الخادم: المؤكَّدُ = الشاشة، والحفظُ انتهى", st.base.cats.some((c) => c.id === U(1)) && !st.saving && srv.applies.length === 1);

  srv.hold = defer();
  const a = S.applyStoreCatOps([{ op: "create", id: U(2), name: "ثاني" }]);
  await tick();
  const b2 = S.applyStoreCatOps([{ op: "create", id: U(3), name: "ثالث" }]);
  const c3 = S.applyStoreCatOps([{ op: "hide", id: U(1), hidden: true }]);
  check("طلبٌ واحدٌ بالطريق: الثاني والثالث ينتظران", srv.applies.length === 2);
  const h = srv.hold; srv.hold = null; h.release();
  await Promise.all([a, b2, c3]); await settle();
  check("  وما انتظر يُطوى بطلبٍ واحدٍ تالٍ (لا طلبٌ لكلّ ضغطة)", srv.applies.length === 3 && srv.applies[2].length === 2, srv.applies.map((x) => x.length).join(","));
  check("  والنتيجةُ كما بالخادم", S.getStoreCatsState().view.cats.find((c) => c.id === U(1))?.hidden === true && S.getStoreCatsState().view.cats.length === 3);

  const listBefore = srv.list;
  srv.failApply = Object.assign(new Error("store_item_gone"), { code: "P0001", hint: "x" });
  let err = null;
  const pf = S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(90)] }]);
  check("  (والإضافةُ على الشاشة قبل الرفض)", S.getStoreCatsState().view.items.some((m) => m.product_id === U(90)));
  try { await pf; } catch (e) { err = e; }
  await settle();
  st = S.getStoreCatsState();
  check("الرفضُ يُرمى ليُقال، والشاشةُ ترجع للمؤكَّد، وتُقرأ القائمةُ مرّةً", err?.message === "store_item_gone" && !st.view.items.some((m) => m.product_id === U(90)) && srv.list === listBefore + 1, `${err?.message} ${srv.list - listBefore}`);

  const nApply = srv.applies.length;
  srv.canEdit = false;
  await S.loadStoreCats(true);
  let e2 = null;
  try { await S.applyStoreCatOps([{ op: "edit", id: U(1), name: "زز" }]); } catch (e) { e2 = e; }
  check("بلا حقّ البنية (المصوّر): المرآةُ ترفض قبل الشبكة", e2?.message === "not_authorized" && srv.applies.length === nApply);
  await S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(91)] }]); await settle();
  check("  والعضويةُ تمرّ له", srv.applies.length === nApply + 1);

  srv.clinic = "C2";
  await S.loadStoreCats(true);
  let e3 = null;
  const nA = srv.applies.length;
  try { await S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(92)] }]); } catch (e) { e3 = e; }
  check("ختمُ الخادم ≠ عيادة المتصفّح ⇒ switched: لا شيءَ يُرسم ولا يُرسل", S.getStoreCatsState().status === "switched" && S.getStoreCatsState().view.cats.length === 0 && e3?.message === "clinic_switched" && srv.applies.length === nA);
  srv.clinic = "C1";

  const l0 = srv.list;
  S.onStoreCatsVisible(1_000_000); await settle();
  S.onStoreCatsVisible(1_000_000 + 5_000); await settle();
  check("الرجوعُ للتبويب يقرأ مرّةً كلَّ ١٥ث على الأكثر", srv.list === l0 + 1, String(srv.list - l0));
  S.onStoreCatsVisible(1_000_000 + 16_000); await settle();
  check("  وبعدها يقرأ من جديد", srv.list === l0 + 2 && S.getStoreCatsState().status === "ready");

  /* قراءةٌ ثانيةٌ فشلت (رجوعٌ للتطبيق بشبكةٍ متعثّرة) **وأبقت** ما وصل: الختمُ ختمُ آخر قراءةٍ نجحت،
   * والخادمُ يحكم بالكتابة. كان كلُّ حفظٍ بعدها يُرفض قبل الشبكة بـ«not_ready» خاماً بلا قراءةٍ تصلحه. */
  const netErr = Object.assign(new TypeError("Failed to fetch"), {});
  srv.failList = netErr;
  S.onStoreCatsVisible(1_000_000 + 40_000); await settle();
  st = S.getStoreCatsState();
  check("قراءةٌ ثانيةٌ فاشلة: الحالُ error ويبقى ما وصل (لا قائمةٌ فارغة)", st.status === "error" && st.view.cats.length === 3 && !!st.clinic, `${st.status} ${st.view.cats.length}`);
  const nW = srv.applies.length;
  let eW = null;
  try { await S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(95)] }]); } catch (e) { eW = e; }
  await settle();
  check("  والكتابةُ بعدها تمرّ للخادم بختم آخر قراءةٍ نجحت", eW === null && srv.applies.length === nW + 1, String(eW?.message));
  check("  ولقطتُها تُنهي «آخر تحديث فشل» (ready)", S.getStoreCatsState().status === "ready");
  globalThis.__reset();
  const lR = srv.list, aR = srv.applies.length;
  let eR = null;
  try { await S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(96)] }]); } catch (e) { eR = e; }
  await settle();
  check("بلا لقطةٍ بعد (idle): الكتابةُ تقرأ مرّةً ثم تُرسل — لا رفضٌ يتكرّر", eR === null && srv.list === lR + 1 && srv.applies.length === aR + 1, `${eR?.message} list+${srv.list - lR} apply+${srv.applies.length - aR}`);
  globalThis.__reset();
  srv.failList = netErr;
  let eF = null;
  try { await S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(97)] }]); } catch (e) { eF = e; }
  check("  وإن فشلت تلك القراءةُ فخطؤها هو ما يُرمى (يقوله describeDbError) لا «not_ready» خام", eF === netErr, String(eF?.message));
  await S.loadStoreCats(true);

  srv.hold = defer();
  const pend = S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(93)] }]).catch((e) => e);
  await tick();
  const queued = S.applyStoreCatOps([{ op: "add", cat: U(1), ids: [U(94)] }]).catch((e) => e);
  globalThis.__reset();
  srv.hold.release(); srv.hold = null;
  const [r1, r2] = await Promise.all([pend, queued]);
  check("تبديلُ العيادة يمحو الحالَ ويرفض المنتظَر (لا كتابةَ بعيادةٍ أخرى)", S.getStoreCatsState().status === "idle" && r2?.message === "clinic_switched", `${S.getStoreCatsState().status} ${r1?.message} ${r2?.message}`);

  const V = S.viewOf({ seeded: true, cats: [
    { id: "a", name: "A", icon: "tag", hidden: false, pos: 2048, archived_at: null, seed_key: null },
    { id: "b", name: "B", icon: "tag", hidden: false, pos: 1024, archived_at: null, seed_key: null },
    { id: "z", name: "Z", icon: "tag", hidden: false, pos: null, archived_at: "2026-10-01T00:00:00Z", seed_key: null },
  ], items: [{ category_id: "a", product_id: "p1", pos: 2 }, { category_id: "b", product_id: "p1", pos: 1 }, { category_id: "z", product_id: "p1", pos: 1 }] });
  check("تصنيفاتُ المنتج بترتيب العيادة، والمؤرشفُ ليس منها", JSON.stringify(V.byProduct.get("p1")) === '["b","a"]');
  const d = S.diffOps("c", new Set(["p1", "p2"]), new Set(["p2", "p3"]));
  check("diffOps: إضافةٌ وإزالةٌ بدفعةٍ واحدة، ولا عمليةَ فارغة", JSON.stringify(d) === '[{"op":"add","cat":"c","ids":["p3"]},{"op":"remove","cat":"c","ids":["p1"]}]' && S.diffOps("c", new Set(["x"]), new Set(["x"])).length === 0);
  /* ورقةُ التفاصيل: التأشيرُ نيّاتٌ (ما لمسه المستخدم) على العضوية الحيّة لحظةَ الحفظ — لا «المجموعةُ
   * كما رُئيت». كانت تُزرع من catsOf لحظةَ الفتح؛ ولقطةٌ تصل بعدها جعلت «لا تأشير» = «شيله من كلّ رفّ». */
  const T = S.toggleOps;
  check("toggleOps: لا شيءَ لُمس ⇒ لا عملية — ولو وصلت العضويةُ بعد الفتح", typeof T === "function" && T("p", new Set(), new Map()).length === 0 && T("p", new Set(["A", "B"]), new Map()).length === 0);
  check("  وما لُمس وحده يُرسل: B مؤشَّرة وA مشطوبة", typeof T === "function" && JSON.stringify(T("p", new Set(["A"]), new Map([["B", true], ["A", false]]))) === '[{"op":"add","cat":"B","ids":["p"]},{"op":"remove","cat":"A","ids":["p"]}]');
  check("  وشطبُ ما ليس فيه أو تأشيرُ ما فيه ⇒ لا عملية", typeof T === "function" && T("p", new Set(), new Map([["A", false]])).length === 0 && T("p", new Set(["A"]), new Map([["A", true]])).length === 0);
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

/* ── الترتيبُ بالسحب (src/lib/sortDnd.ts) بـ@dnd-kit/core الحقيقيّ ───────────────────── */
console.log("▸ الترتيبُ بالسحب: الإفلاتُ بالفراغ لا يكتب، وعمليةٌ نسبيّةٌ واحدة");
try {
  const built = await esbuild.build({
    stdin: { contents: 'export * from "./src/lib/sortDnd.ts";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", mainFields: ["module", "main"],
    define: { "process.env.NODE_ENV": '"production"' },
  });
  const dir = mkdtempSync(join(tmpdir(), "sort-dnd-"));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  const D = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
  const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
  const ids = ["r1", "r2", "r3"];
  const rows = ids.map((id, i) => ({ id, rect: rect(0, i * 70, 400, 60) }));   // فجوةُ ١٠ بين الصفوف
  const containers = rows.map((r) => ({ id: r.id, key: r.id, data: { current: {} }, disabled: false, node: { current: null }, rect: { current: r.rect } }));
  const args = (pointer) => ({
    active: { id: "r1", data: { current: {} }, rect: { current: { initial: null, translated: null } } },
    collisionRect: rect(0, pointer ? pointer.y - 30 : 0, 400, 60),
    droppableRects: new Map(rows.map((r) => [r.id, r.rect])), droppableContainers: containers, pointerCoordinates: pointer,
  });
  const onR3 = D.sortCollision(args({ x: 200, y: 175 }));
  check("المؤشّرُ فوق صفّ ⇒ ذاك الصفّ وحده", onR3.length === 1 && onR3[0].id === "r3", onR3.map((c) => c.id).join());
  const inGap = D.sortCollision(args({ x: 200, y: 65 }));
  const outside = D.sortCollision(args({ x: 600, y: 30 }));
  check("  وبالفجوة أو خارج القائمة ⇒ لا هدف (كان «الأقرب» يكتب ترتيباً)", inGap.length === 0 && outside.length === 0);
  check("  والكيبورد (بلا مؤشّر) ⇒ الأقرب", D.sortCollision(args(null)).length > 0);
  const act = (top) => ({ id: "r1", rect: { current: { initial: null, translated: top == null ? null : rect(0, top, 400, 60) } } });
  check("dropAfter بلا هدف ⇒ لا شيء يُكتب", D.dropAfter(ids, act(150), null) === undefined);
  check("  r1 على النصف الأسفل من r3 ⇒ بعد r3", D.dropAfter(ids, act(160), { id: "r3", rect: rows[2].rect }) === "r3");
  check("  وعلى النصف الأعلى من r3 ⇒ بعد r2", D.dropAfter(ids, act(120), { id: "r3", rect: rows[2].rect }) === "r2");
  check("  r3 فوق نصف r1 الأعلى ⇒ أوّلُ القائمة (null)", D.dropAfter(ids, { id: "r3", rect: { current: { translated: rect(0, -20, 400, 60) } } }, { id: "r1", rect: rows[0].rect }) === null);
  check("  وعلى نفسه أو بمكانه ⇒ لا شيء", D.dropAfter(ids, act(0), { id: "r1", rect: rows[0].rect }) === undefined
    && D.dropAfter(ids, act(20), { id: "r2", rect: rows[1].rect }) === undefined);
  check("الأسهم: ↑ من الأوّل ولا ↓ من الأخير ⇒ لا شيء، و«لفوق» ⇒ null",
    D.stepAfter(ids, "r1", -1) === undefined && D.stepAfter(ids, "r3", 1) === undefined && D.stepAfter(ids, "r3", -1) === "r1" && D.stepAfter(ids, "r1", 1) === "r2" && D.topAfter(ids, "r3") === null && D.topAfter(ids, "r1") === undefined);
  check("moved: القائمةُ بعد النقل", JSON.stringify(D.moved(ids, "r3", null)) === '["r3","r1","r2"]' && JSON.stringify(D.moved(ids, "r1", "r2")) === '["r2","r1","r3"]');
  check("والعتبات: فأرةٌ ٦ بكسل، وإصبعٌ ٢٠٠ms بتسامح ٨", D.SORT_MOUSE_DISTANCE === 6 && D.SORT_TOUCH_DELAY === 200 && D.SORT_TOUCH_TOLERANCE === 8);
  const sl = readFileSync("src/components/store/admin/SortList.tsx", "utf8");
  check("SortList على اصطدام sortDnd (لا closestCenter بغيره)، والأسهمُ للهاتف ظاهرة", /collisionDetection=\{sortCollision\}/.test(sl) && !/closestCenter/.test(sl) && sl.includes("data-sortarrows") && /sm:hidden/.test(sl));
  check("  وmedDnd لم يُمسّ (لا يستورد sortDnd ولا يُستورد منه)", !/sortDnd/.test(readFileSync("src/components/meds/medDnd.ts", "utf8")) && !/medDnd/.test(readFileSync("src/lib/sortDnd.ts", "utf8").replace(/\/\*[\s\S]*?\*\//g, "")));
} catch (e) { fails++; console.error(`   ✗ القسمُ لم يكتمل — ${String(e?.message ?? e).split("\n")[0]}`); }

console.log(fails ? `\n✗ store-cats-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ store-cats-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
