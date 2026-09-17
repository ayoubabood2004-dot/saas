/* ============================================================================
 * تطابقُ `storeApi` مع نصف `repo` السحابيّ — نسختان لا تنحرفان.
 *
 * `storeApi` وُجدت لسببٍ مقيس: `Storefront` كانت تستورد `repo` فينزل مع صفحةِ
 * الزائر تطبيقُ العيادة كلُّه وعميلُ Supabase — ٤٦٣ كيلو مضغوطة قبل أوّل منتج.
 * لكنّ نسختين تنحرفان أسوأ من نسخةٍ ثقيلة: تبدّلُ اسمِ وسيطٍ بطرفٍ دون الآخر
 * يعطي «ما لكينا» عن متجرٍ قائم، والزبونُ يصدّقه.
 *
 * فالفحصُ يشغّل **النسختين** على نفس المدخل ونفس ردِّ الخادم، ويطابق ثلاثةً:
 * اسمَ الدالّة المنادَاة، ووسائطَها بالاسم والقيمة، والناتجَ بعد التشكيل.
 * وردُّ الخادم يُكتب **مرّةً واحدة** يستهلكها الطرفان — فلا قالبَ يجامل طرفاً.
 *
 *   node scripts/store-api-parity.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const SUPA = "https://x.example";
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, String(v)); },
  removeItem: (k) => { mem.delete(k); }, clear: () => mem.clear(),
  key: (i) => [...mem.keys()][i] ?? null, get length() { return mem.size; },
};
globalThis.window = globalThis.window ?? { localStorage: globalThis.localStorage, addEventListener() {}, removeEventListener() {} };
globalThis.document = globalThis.document ?? {
  documentElement: { lang: "", dir: "", style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  addEventListener() {}, removeEventListener() {},
  querySelector: () => null, createElement: () => ({ style: {}, setAttribute() {}, appendChild() {} }),
  body: { appendChild() {}, classList: { add() {}, remove() {} } },
};

/* ردُّ الخادم لكلّ دالّة — **مصدرٌ واحد** يقرؤه الطرفان. `null` يعني «افشل». */
globalThis.__reply = {};
globalThis.__calls = [];

/* عميلٌ مزيّف يسجّل النداء ويردّ من `__reply` — نفسُ عقدِ postgrest-js:
 * الخطأُ يرجع بـ`{error}` لا برمية. */
const FAKE_SUPABASE = `
  export const supabase = {
    rpc: (fn, args) => {
      globalThis.__calls.push({ side: 'repo', fn, args });
      const r = globalThis.__reply[fn];
      return Promise.resolve(r === null ? { data: null, error: { message: 'boom', code: 'X' } } : { data: r, error: null });
    },
    from: () => ({ select: () => ({ eq: () => ({ limit: () => Promise.resolve({ data: [], error: null }) }) }) }),
    storage: { from: () => ({}) },
    auth: { getSession: async () => ({ data: { session: null }, error: null }) },
  };
`;
const EMPTY = new Set([
  "@supabase/supabase-js", "@supabase/functions-js", "@supabase/realtime-js",
  "@supabase/auth-js", "@supabase/node-fetch", "html-parse-stringify",
]);
const EMPTY_MAP_BASE = {
  i18next: "const i = { t: (k, d) => (typeof d === 'string' ? d : (d && d.defaultValue) || k), language: 'ar', use: () => i, init: () => i, on: () => i, changeLanguage: () => i, dir: () => 'rtl' }; export default i;",
  "./globalToast": "export const emitGlobalToast = () => {};",
};

async function build(entry, supabaseSource, tag) {
  const stubs = {
    name: "stubs",
    setup(b) {
      const map = { ...EMPTY_MAP_BASE, "./supabase": supabaseSource };
      b.onResolve({ filter: /.*/ }, (a) => (EMPTY.has(a.path) ? { path: a.path, namespace: "stub" } : undefined));
      b.onResolve({ filter: /^(i18next|\.\/supabase|\.\/globalToast)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: map[a.path] ?? "export default {};", loader: "js" }));
    },
  };
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "esm", write: false,
    platform: "neutral", plugins: [stubs], logLevel: "silent",
    define: { "import.meta.env": "__VITE_ENV__" },
    banner: { js: `const __VITE_ENV__ = { VITE_SUPABASE_URL: '${SUPA}', VITE_SUPABASE_ANON_KEY: 'k' };` },
  });
  const dir = mkdtempSync(join(tmpdir(), `parity-${tag}-`));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}

/* `fetch` مزيّف لطرف `storeApi` — يقرأ نفسَ `__reply` ويسجّل نفسَ الشكل. */
globalThis.fetch = async (url, init) => {
  const fn = String(url).split("/rpc/")[1];
  const args = JSON.parse(init.body);
  globalThis.__calls.push({ side: "api", fn, args });
  const r = globalThis.__reply[fn];
  if (r === null) return new Response(JSON.stringify({ message: "boom" }), { status: 400, headers: { "content-type": "application/json" } });
  return new Response(JSON.stringify(r), { status: 200, headers: { "content-type": "application/json" } });
};

const repo = (await build("src/lib/repo.ts", FAKE_SUPABASE, "repo")).repo;
const api = (await build("src/lib/storeApi.ts", FAKE_SUPABASE, "api")).storeApi;

const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const run = async (side, fn) => { try { return { ok: true, v: await fn() }; } catch (e) { return { ok: false, v: String(e?.message ?? e) }; } };

/** ينادي الطرفين بنفس الوسائط ويطابق النداءَ والناتج. */
async function pair(label, call) {
  globalThis.__calls = [];
  const a = await run("repo", () => call(repo));
  const repoCalls = globalThis.__calls.map(({ fn, args }) => ({ fn, args }));
  globalThis.__calls = [];
  const b = await run("api", () => call(api));
  const apiCalls = globalThis.__calls.map(({ fn, args }) => ({ fn, args }));
  check(`${label}: نفسُ الدالّة ونفسُ الوسائط`, eq(repoCalls, apiCalls),
    `${JSON.stringify(repoCalls)} ≠ ${JSON.stringify(apiCalls)}`);
  check(`  ${label}: نفسُ الناتج`, a.ok === b.ok && (a.ok ? eq(a.v, b.v) : true),
    `${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`);
  return { a, b };
}

const FRONT = {
  ok: true, name: "عيادة الرحمة", logo_url: "c1/logo-k9.png", phone: "0770", whatsapp: "0771",
  facebook: "fb", instagram: "ig", bio: "نبذة", delivery_fee: "2500", min_order: "5000",
};
const ROWS = [{ id: "p1", name: "شامبو", category: "care", subcategory: null, price: "3500", descr: null, available: true, image_path: "c1/p1.jpg", featured: true }];

console.log("▸ واجهةُ المتجر");
globalThis.__reply = { store_front: FRONT };
const front = await pair("store_front", (r) => r.storeFrontPublic("alrahma"));
check("  والرقمانِ صارا أرقاماً لا نصوصاً", front.a.v.delivery_fee === 2500 && front.a.v.min_order === 5000);
check("  والشعارُ رابطٌ مبنيٌّ من المسار", front.a.v.logo_url === `${SUPA}/storage/v1/object/public/product-images/c1/logo-k9.png`);
// أرقامٌ فارغة: `Number(null)` صفرٌ و`Number(undefined)` **NaN** — و`|| 0`
// هي الفرقُ بين «توصيلٌ مجّانيّ» و«NaN د.ع» بترويسة المتجر.
globalThis.__reply = { store_front: { ok: true, name: "بلا تفاصيل", logo_url: null, delivery_fee: null, min_order: undefined } };
const bare = await pair("store_front (حقولٌ فارغة)", (r) => r.storeFrontPublic("bare"));
check("  والأجرةُ صفرٌ لا NaN", bare.a.v.delivery_fee === 0 && bare.a.v.min_order === 0, JSON.stringify(bare.a.v));
check("  والشعارُ null لا رابطاً مكسوراً", bare.a.v.logo_url === null);
globalThis.__reply = { store_front: { ok: false, error: "not_found" } };
await pair("store_front (مغلق)", (r) => r.storeFrontPublic("nope"));
globalThis.__reply = { store_front: null };
await pair("store_front (فشلٌ)", (r) => r.storeFrontPublic("x"));

console.log("▸ الكتلوج");
globalThis.__reply = { store_catalog: ROWS };
const cat = await pair("store_catalog", (r) => r.storeCatalogPublic("alrahma", 24, 0));
check("  والسعرُ رقمٌ لا نصّ", cat.a.v[0].price === 3500);
await pair("store_catalog (صفحةٌ ثانية)", (r) => r.storeCatalogPublic("alrahma", 24, 24));
// نداءٌ ثانٍ بوسيطٍ واحد عند فشل الثلاثة — وبالصفحة الأولى وحدها.
globalThis.__reply = { store_catalog: null };
await pair("store_catalog (سقوطٌ إلى توقيع 0095)", (r) => r.storeCatalogPublic("alrahma", 24, 0));
await pair("store_catalog (وبصفحةٍ ثانية لا سقوط)", (r) => r.storeCatalogPublic("alrahma", 24, 24));

console.log("▸ التتبّعُ والطلب");
globalThis.__reply = { store_order_track: [{ order_no: "SO-1", status: "new", total: 12000, created_at: "2026-01-01", decided_at: null }] };
await pair("store_order_track", (r) => r.trackStoreOrder("alrahma", "SO-1", "0770 123 4567"));
globalThis.__reply = { store_order_track: [] };
await pair("store_order_track (ما لكى)", (r) => r.trackStoreOrder("alrahma", "SO-9", "0770"));
globalThis.__reply = { store_place_order: { ok: true, order_no: "SO-2", total: 9000 } };
await pair("store_place_order", (r) => r.placeStoreOrder("alrahma", { name: "أحمد", phone: "0770" }, [{ product_id: "p1", qty: 2 }]));
globalThis.__reply = { store_place_order: { ok: false, error: "min_order", min_order: 5000 } };
await pair("store_place_order (دون الحدّ)", (r) => r.placeStoreOrder("alrahma", { name: "أحمد", phone: "0770", address: "ش ١", note: "ملاحظة" }, [{ product_id: "p1", qty: 1 }]));

console.log("▸ رحلةُ الحيوان");
globalThis.__reply = { track_journey: { ok: true, pet_name: "لولو", clinic_name: "الرحمة", clinic_phone: null, kind: "surgery", stage: "recovery", status: "open", started_at: "2026-01-01", events: [] } };
await pair("track_journey", (r) => r.trackJourneyPublic("ABCD"));
globalThis.__reply = { track_journey: { ok: false } };
await pair("track_journey (مغلقة)", (r) => r.trackJourneyPublic("ZZZZ"));
globalThis.__reply = { react_journey: { ok: true } };
await pair("react_journey", (r) => r.reactJourneyPublic("ABCD", "e1", "❤️"));
globalThis.__reply = { react_journey: null };
const react = await pair("react_journey (فشلٌ لا يُفشِل الصفحة)", (r) => r.reactJourneyPublic("ABCD", "e1", "❤️"));
check("  والاثنتان ترجعان false لا ترميان", react.a.v === false && react.b.v === false);

/* والوزنُ لا يُقاس هنا: بناءٌ بلا تقسيمٍ يُدمج الاستيرادَ الديناميكيَّ
 * بالمخرَج نفسِه فيكذب. يُقاس على `dist` الحقيقيّ — `store-weight-guard.mjs`. */

console.log(fails ? `\n✗ store-api-parity: ${passes} نجحت، ${fails} فشلت` : `\n✓ store-api-parity: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
