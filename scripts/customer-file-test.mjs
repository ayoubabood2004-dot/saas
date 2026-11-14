/* ============================================================================
 * ملفُّ الزبون (0270) — فحصُ السلوك على المرآة التجريبيّة (الحزمةُ تفحص الخادمَ، وcustomer-parity الدليلَ بالقاعدة):
 *   ١) الملفّ: المفتاحُ يُحسب لا يُؤخذ، ومفتاحٌ قائم لا يُداس، والتعديلُ بشرط «كما فُتح»، والهويّةُ تُجمَّد.
 *   ٢) الدليلُ يلقى صاحبَ الملفّ بلا شراء واسمُه يغلب، والدينُ القديم ليس شراءً، والفواتيرُ بالمفتاح بأيّ صيغة رقم.
 *   ٣) الوصلُ بالنصّ: المسارُ ونطاقُه، والمداخلُ الخمسة، والبابُ الكسول.
 *
 *   node scripts/customer-file-test.mjs
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

const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(), key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.CustomEvent = globalThis.CustomEvent ?? class { constructor(type) { this.type = type; } };
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() { return true; } };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {}, querySelector: () => null,
  createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }), body: { appendChild() {}, classList: { add() {}, remove() {} } },
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
    contents: `export { repo } from "./src/lib/repo.ts"; export * as F from "./src/lib/customerFileApi.ts"; export { saveDB, loadDB } from "./src/lib/demoStore.ts";`,
    resolveDir: process.cwd(), loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent", mainFields: ["module", "main"],
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
});
const tdir = mkdtempSync(join(tmpdir(), "cust-file-"));
const file = join(tdir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const M = await import(pathToFileURL(file).href).finally(() => { try { rmSync(tdir, { recursive: true, force: true }); } catch { /* ignore */ } });
const { repo, F } = M;


const err = async (p) => { try { await p; return "ok"; } catch (e) { return String(e?.message ?? e); } };
const read = (f) => readFileSync(f, "utf8");

console.log("▸ ١) الملفّ اليدويّ — المرآةُ تفرض حرّاسَ 0270");
{
  const a = await F.addProfile({ name: "  منى   علي ", phone: "0770 555 4444", address: " المنصور ", notes: "" }, null);
  check("زبونٌ لا يعرفه أحد يُسجَّل، والمفتاحُ من الرقم الوطنيّ (لا ممّا يرسله أحد)، والنصُّ مقصوص", a.status === "created" && a.key === "p:7705554444" && a.profile.name === "منى علي" && a.profile.address === "المنصور" && a.profile.notes === null,
    JSON.stringify(a));
  const b = await F.addProfile({ name: "منى", phone: "+964 770 555 4444", address: "", notes: "" }, null);
  check("  ورقمُه بصيغةٍ ثانية: «موجود» بمفتاحه، والقائمُ لا يُداس", b.status === "exists" && b.key === "p:7705554444" && (await F.getProfile("p:7705554444")).name === "منى علي");
  check("  وبلا اسمٍ ولا رقم يُرفض", (await err(F.addProfile({ name: " ", phone: "", address: "بغداد", notes: "" }, null))) === "customer_no_identity");
  // زبونُ فواتير بلا ملفّ: «زبون جديد» برقمه لا يكتب (اسمٌ آخر كان سيغلب الدليل) — ومن ملفّه («أضف معلومات») يكتب.
  const db0 = M.loadDB();
  db0.invoices = [...(db0.invoices ?? []), { id: "cf-k", customer_name: "علي القديم", customer_phone: "07701112222", total: 1000, amount_paid: 1000, cost_total: 0, profit: 1000, item_count: 1, status: "paid", created_at: "2026-11-01T10:00:00.000Z" }];
  M.saveDB(db0);
  const k = await F.addProfile({ name: "حسن", phone: "0770 111 2222", address: "", notes: "" }, null);
  check("«زبون جديد» برقم زبونٍ له فواتير بلا ملفّ ⇒ known، ولا ملفّ يُكتب (الاسمُ لا يُعاد)", k.status === "known" && k.key === "p:7701112222" && (await F.getProfile("p:7701112222")) === null);
  check("  ومن ملفّه (forKey) يُكتب، ومفتاحٌ محسوبٌ غيرُ المقصود يُرفض",
    (await F.addProfile({ name: "علي القديم", phone: "07701112222", address: "الكرخ", notes: "" }, "p:7701112222")).status === "created"
      && (await err(F.addProfile({ name: "x", phone: "07709990000", address: "", notes: "" }, "p:7701112222"))) === "customer_key_frozen");
  const p0 = await F.getProfile("p:7705554444");
  const e1 = await F.updateProfile({ name: "منى علي حسن", phone: "+964 770 555 4444", address: "الكرادة", notes: "تجي كل شهر" }, { id: p0.id, updated_at: p0.updated_at });
  check("التعديل: الاسمُ والعنوانُ والملاحظاتُ وصيغةُ الرقم نفسِه تمرّ بشرط «كما فُتح»", e1.address === "الكرادة" && e1.updated_at !== p0.updated_at);
  check("  وتعديلٌ بنسخةٍ قديمة يُرفض (لا يدوس ما كُتب بعدها)", (await err(F.updateProfile({ name: "x", phone: "07705554444", address: "", notes: "" }, { id: p0.id, updated_at: p0.updated_at }))) === "stale");
  const p1 = await F.getProfile("p:7705554444");
  check("  ورقمٌ لزبونٍ ثانٍ يُرفض (الهويّة)", (await err(F.updateProfile({ name: "منى", phone: "07709990000", address: "", notes: "" }, { id: p1.id, updated_at: p1.updated_at }))) === "customer_key_frozen");
  const n = await F.addProfile({ name: "أبو حيدر", phone: "", address: "", notes: "" }, null);
  check("  وزبونٌ بلا رقم مفتاحُه اسمُه، وإضافةُ رقمٍ له زبونٌ ثانٍ (يُرفض)", n.status === "created" && n.key.startsWith("n:")
    && (await err(F.updateProfile({ name: "أبو حيدر", phone: "07711112222", address: "", notes: "" }, { id: n.profile.id, updated_at: n.profile.updated_at }))) === "customer_key_frozen");
}

console.log("▸ ٢) الدليلُ والفواتير — بالمفتاح نفسِه");
{
  const hit = await F.directoryHit("p:7705554444");
  check("الدليلُ يلقى صاحبَ الملفّ بلا شراء، باسمه كما كُتب", hit && hit.name === "منى علي حسن" && hit.purchases === 0, JSON.stringify(hit));
  await F.addProfile({ name: "منى", phone: "", address: "", notes: "" }, null);   // «منى» بالاسم وحده — أقدمُ؟ لا: أحدث. والمطابقُ أوّلاً
  const db1 = M.loadDB();
  for (const c of db1.customerProfiles) if (c.cust_key === F.keyOf(null, "منى")) { c.created_at = "2020-01-01T00:00:00.000Z"; }
  M.saveDB(db1);
  const nm = await repo.findCustomers("منى", { limit: 5 });
  check("  والبحثُ يقدّم المفتاحَ المطابقَ حرفاً بين المتساويين رتبةً (فالملفُّ يلقاه بنداءٍ واحد)", nm.rows[0]?.key === F.keyOf(null, "منى") && (await F.directoryHit(F.keyOf(null, "منى")))?.key === F.keyOf(null, "منى"),
    nm.rows.map((r) => r.key).join());
  const page = await repo.findCustomers(null, { filter: "nopets", sort: "recent", limit: 100 });
  check("  وبقسم «زبائن المبيعات بلا حيوان»", page.rows.some((r) => r.key === "p:7705554444"));
  const db = M.loadDB();
  db.invoices = [
    ...(db.invoices ?? []),
    { id: "cf-1", customer_name: "منى", customer_phone: "07705554444", total: 1000, amount_paid: 0, cost_total: 0, profit: 1000, item_count: 1, status: "paid", created_at: "2026-11-10T10:00:00.000Z" },
    { id: "cf-2", customer_name: "منى ع", customer_phone: "+964 770 555 4444", total: 2000, amount_paid: 2000, cost_total: 0, profit: 2000, item_count: 1, status: "paid", created_at: "2026-11-12T10:00:00.000Z" },
    { id: "cf-3", customer_name: "منى", customer_phone: "07700000001", total: 3000, amount_paid: 0, cost_total: 0, profit: 3000, item_count: 1, status: "paid", created_at: "2026-11-13T10:00:00.000Z" },
    { id: "cf-4", customer_name: "منى", customer_phone: "07705554444", total: 500, amount_paid: 0, cost_total: 0, profit: 0, item_count: 0, status: "paid", sale_kind: "opening", created_at: "2026-01-01T10:00:00.000Z" },
  ];
  M.saveDB(db);
  const inv = await F.keyInvoices("p:7705554444");
  check("فواتيرُ المفتاح: الرقمُ بصيغتين، الأحدثُ أوّلاً، ولا تخلط زبوناً بنفس الاسم ورقمٍ آخر", inv.map((i) => i.id).join() === "cf-2,cf-1,cf-4", inv.map((i) => i.id).join());
  const hit2 = await F.directoryHit("p:7705554444");
  check("  والشراءُ يعدّ البيعتين لا الدينَ القديم (opening)، واسمُ الملفّ يبقى يغلب", hit2.purchases === 2 && hit2.name === "منى علي حسن" && hit2.firstAt === "2026-11-10T10:00:00.000Z", JSON.stringify(hit2));
}

console.log("▸ ٣) الوصلُ بالنصّ — المداخلُ والنطاقُ والمسار");
{
  const app = read("src/App.tsx"), hp = JSON.parse(read("src/i18n/hot-paths.json"));
  check("المسارُ بنطاقه المملوك (cfile) وللعيادة وحدها", /const CustomerFile = page\(\(\) => import\("@\/pages\/CustomerFile"\)[^;]*\["cfile"\]\)/.test(app)
    && /path="\/customer\/:key" element=\{<Protected><ClinicOnly><CustomerFile \/><\/ClinicOnly><\/Protected>\}/.test(app) && hp.owned.cfile === "src/pages/CustomerFile.tsx");
  const sb = read("src/components/retail/SaleBuilder.tsx"), dp = read("src/components/retail/DebtorPets.tsx"), oc = read("src/components/OwnerCard.tsx"), ah = read("src/pages/AnalyticsHub.tsx"), pp = read("src/pages/PetPassport.tsx");
  check("المداخل: البيعُ (والسلّةُ فارغة)، ودفترُ الديون، وبطاقةُ المالك (للكادر)، والتقاريرُ وزرُّ «زبون جديد»",
    /\{picked && cart\.length === 0 && \(\s*<Link to=\{`\/customer\/\$\{encodeURIComponent\(picked\.key\)\}`\}/.test(sb)
      && /navigate\(`\/customer\/\$\{encodeURIComponent\(key\)\}`\)/.test(dp)
      && /custKey\(pet\.owner_phone, pet\.owner_name, getDialCode\(\)\)/.test(oc) && /showFile=\{!isOwner\}/.test(pp)
      && /to="\/customer\/new"/.test(ah) && /to=\{`\/customer\/\$\{encodeURIComponent\(r\.key\)\}`\}/.test(ah));
  const api = read("src/lib/customerFileApi.ts");
  check("الفواتيرُ بالمفتاح (customer_key_invoices) لا بالأرقام الخامّة، بمؤشّرٍ ثابت من آخر صفٍّ حتى صفحةٍ فارغة (لا إزاحة)",
    /rpc\("customer_key_invoices", \{ p_key: key, p_before_at: before\?\.created_at \?\? null, p_before_id: before\?\.id \?\? null \}\)/.test(api)
      && !/customer_invoices"/.test(api) && /before = page\[page\.length - 1\]/.test(api) && /if \(page\.length === 0\) break/.test(api) && !/range\(/.test(api));
  check("  والتسجيلُ بالخادم (customer_profile_add يقرّر موجود/معروف)، والتعديلُ بشرط updated_at وصفرُ صفوفٍ يُرمى، والدليلُ بنداءٍ واحد",
    /rpc\("customer_profile_add"/.test(api) && !/from\("customer_profiles"\)\.(insert|upsert)/.test(api) && /\.eq\("updated_at", expect\.updated_at\)/.test(api)
      && /if \(!got\) throw Object\.assign\(new Error\("stale"\)/.test(api) && (api.match(/repo\.findCustomers\(/g) || []).length === 1 && !/offset/.test(api));
  const cf = read("src/pages/CustomerFile.tsx");
  check("  والصفحة: المفتاحُ من الرابط بلا فكٍّ ثانٍ، ولا اسمَ من المفتاح المطبَّع، والرقمُ مقفولٌ دائماً",
    !/decodeURIComponent/.test(cf) && !/cKey\.slice\(2\)/.test(cf) && /lockName=\{!phoneKeyed\} lockPhone \/>/.test(cf) && /usdDueCentsOf/.test(cf));
  check("  وrepo.ts (حزمةُ الإقلاع) لا يعرف الملفّ", !/customer_key_invoices|customer_profiles/.test(read("src/lib/repo.ts")));
}

console.log(fails ? `\n✗ customer-file-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ customer-file-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
