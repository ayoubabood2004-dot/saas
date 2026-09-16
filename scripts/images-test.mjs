/* ============================================================================
 * فحصُ الصور — «الاسمُ يصف المحتوى، والرابطُ يتبدّل حين تتبدّل الصورة».
 *
 * ثلاثةُ أشياءَ قاسها الإنتاج ولا يراها حارسُ نصّ:
 *
 *  ١) **الرابطُ لا يتبدّل.** المسارُ كان `<عيادة>/<منتج>.webp` ثابتاً
 *     بـ`upsert:true`، و`productImageUrl` تبنيه من المسار وحده بلا كاسرِ
 *     ذاكرة. فالعيادةُ تبدّل صورةً خاطئة وتبقى ترى القديمة — بمتصفّحها
 *     وبشبكة التوزيع. الفحصُ يطلب رفعتين ويشترط مسارين مختلفين.
 *
 *  ٢) **الاسمُ يكذب.** الملفُّ الوحيد بدلو الإنتاج اسمُه `.webp` ونوعُه
 *     المخزَّن `image/jpeg` — لأن `prepareUpload` تُعيد الترميزَ إلى JPEG
 *     دائماً والامتدادَ كان ثابتاً بالشِفرة. الفحصُ يشترط تطابقَ الامتداد
 *     مع النوع المُرسَل.
 *
 *  ٣) **PDF يُرفع صورةً للمنتج.** `prepareUpload` تمرّر غيرَ الصور كما هي
 *     عمداً (تقاريرُ المختبر)، والدلو كان بلا قائمة أنواع — فمن اختار PDF
 *     بمنتقي صورةِ المنتج رفعه ونجح وبقيت البطاقةُ فارغةً بلا خطأ.
 *     الفحصُ يشترط رميةً، **والنصفَين معاً**: التجريبيُّ والسحابيّ.
 *
 *   node scripts/images-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

/* ---- متصفّحٌ بالحدّ الأدنى ------------------------------------------------ */
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

/* ---- عميلٌ مزيّف يسجّل كلَّ رفعة ------------------------------------------ */
globalThis.__uploads = [];
globalThis.__removed = [];
globalThis.__productRefs = [];      // ما ترجعه قراءةُ products عند فحص المشاركة
globalThis.__refsError = null;

const FAKE_SUPABASE = `
  const ok = (data) => Promise.resolve({ data, error: null });
  const storageApi = {
    upload: (path, blob, opts) => { globalThis.__uploads.push({ path, opts }); return ok({ path }); },
    remove: (paths) => { globalThis.__removed.push(...paths); return ok(null); },
  };
  const q = () => {
    const o = {
      select: () => o, insert: () => o, update: () => o, delete: () => o,
      eq: () => o, neq: () => o, order: () => o, limit: () => o, single: () => o,
      maybeSingle: () => o, in: () => o, is: () => o, or: () => o,
      then: (res) => res({ data: globalThis.__productRefs, error: globalThis.__refsError }),
    };
    return o;
  };
  export const supabase = {
    from: () => q(), rpc: () => q(), schema: () => ({ from: () => q() }),
    storage: { from: () => storageApi },
    auth: { getSession: async () => ({ data: { session: null }, error: null }), getUser: async () => ({ data: { user: null }, error: null }) },
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

/* `repo` يختار نصفَه عند التحميل: `supabase ? supabaseRepo : demoRepo` — ولا
 * نصفَ مُصدَّرٌ بذاته. فالبناءُ مرّتان: مرّةً بعميلٍ مزيّف (سحابيّ) ومرّةً
 * بـ`supabase = null` (تجريبيّ). هكذا يُفحص **النصفان** لا واحدٌ منهما. */
async function buildModule(entry, supabaseSource, tag) {
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
    banner: { js: "const __VITE_ENV__ = { VITE_SUPABASE_URL: 'https://x.example', VITE_SUPABASE_ANON_KEY: 'k' };" },
  });
  const dir = mkdtempSync(join(tmpdir(), `images-${tag}-`));
  const file = join(dir, "m.mjs");
  writeFileSync(file, built.outputFiles[0].text);
  return import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
}
const buildRepo = async (src, tag) => (await buildModule("src/lib/repo.ts", src, tag)).repo;

const { mkdtempSync, writeFileSync, rmSync } = await import("node:fs");
const { tmpdir } = await import("node:os");
const { join } = await import("node:path");
const { pathToFileURL } = await import("node:url");

const cloud = await buildRepo(FAKE_SUPABASE, "cloud");
const demo = await buildRepo("export const supabase = null;", "demo");
if (!cloud || !demo) { console.error("✗ images-test: ما انحمّلت الوحدة"); process.exit(1); }

const mkUpload = (type, ext) => ({
  blob: { type, size: 1234 },
  dataUrl: `data:${type};base64,AAAA`,
  ext, contentType: type,
});
const threw = async (fn) => { try { await fn(); return false; } catch { return true; } };

const CLINIC = "11111111-1111-1111-1111-111111111111";
const PRODUCT = "22222222-2222-2222-2222-222222222222";

console.log("▸ البند ٩ — الرابطُ يتبدّل حين تتبدّل الصورة");
globalThis.__uploads = [];
const p1 = await cloud.uploadProductImage(CLINIC, PRODUCT, mkUpload("image/jpeg", "jpg"));
await new Promise((r) => setTimeout(r, 2));
const p2 = await cloud.uploadProductImage(CLINIC, PRODUCT, mkUpload("image/jpeg", "jpg"));
check("رفعتان لنفس المنتج ⇒ مساران مختلفان", p1 !== p2, `${p1} == ${p2}`);
check("  والمسارُ بمجلّد العيادة (سياسةُ المخزن تشترطه)", p1.startsWith(`${CLINIC}/`), p1);
check("  و`upsert` مطفأةٌ — التصادمُ يُكشف لا يُطمَس",
  globalThis.__uploads.every((u) => u.opts?.upsert === false));
check("  و`cacheControl` سنةٌ كاملة — صار صحيحاً بعد أن صار المسارُ لا يُعاد",
  globalThis.__uploads.every((u) => u.opts?.cacheControl === "31536000"));

console.log("▸ البند ١٠ — الاسمُ يصف المحتوى");
for (const [type, ext] of [["image/jpeg", "jpg"], ["image/png", "png"], ["image/webp", "webp"]]) {
  globalThis.__uploads = [];
  const p = await cloud.uploadProductImage(CLINIC, PRODUCT, mkUpload(type, ext));
  const sent = globalThis.__uploads[0]?.opts?.contentType;
  check(`${type} ⇒ امتداد .${ext} ونوعٌ مطابق`, p.endsWith(`.${ext}`) && sent === type, `${p} / ${sent}`);
}

console.log("▸ البند ١٠ب — PDF ليس صورةَ منتج (مرآةُ قائمة الدلو 0184)");
check("السحابيّ يرمي على application/pdf",
  await threw(() => cloud.uploadProductImage(CLINIC, PRODUCT, mkUpload("application/pdf", "pdf"))));
check("  ولا رفعةَ وصلت الخادم أصلاً",
  (globalThis.__uploads = [], await threw(() => cloud.uploadProductImage(CLINIC, PRODUCT, mkUpload("application/pdf", "pdf"))), globalThis.__uploads.length === 0));
check("  و image/gif مرفوضٌ كذلك — القائمةُ ثلاثةٌ لا «أيُّ صورة»",
  await threw(() => cloud.uploadProductImage(CLINIC, PRODUCT, mkUpload("image/gif", "gif"))));
check("والتجريبيُّ يرمي نفسَ الرمية — حارسٌ لا يوجد هنا حارسٌ لم يُفحص",
  await threw(() => demo.uploadProductImage(CLINIC, PRODUCT, mkUpload("application/pdf", "pdf"))));
check("  ويقبل الصورةَ كما كان",
  typeof (await demo.uploadProductImage(CLINIC, PRODUCT, mkUpload("image/jpeg", "jpg"))) === "string");
check("  وملفُّ المكتبة التجريبيُّ يُحرَس كذلك",
  await threw(() => demo.createLibraryImage({ name: "س" }, mkUpload("application/pdf", "pdf"))));

console.log("▸ ملفٌّ يشاركه صفٌّ آخر لا يُحذف (0184 صار الدمجُ يورّث المسار)");
globalThis.__removed = []; globalThis.__refsError = null;
globalThis.__productRefs = [{ id: "other-product" }];
await cloud.deleteProductImage(CLINIC, PRODUCT, `${CLINIC}/shared.jpg`);
check("صفٌّ آخرُ يشير للمسار ⇒ لا حذف", globalThis.__removed.length === 0, JSON.stringify(globalThis.__removed));
globalThis.__productRefs = [];
await cloud.deleteProductImage(CLINIC, PRODUCT, `${CLINIC}/lonely.jpg`);
check("  ولا أحدَ يشير ⇒ يُحذف", globalThis.__removed.includes(`${CLINIC}/lonely.jpg`));
globalThis.__removed = []; globalThis.__refsError = { message: "boom" };
await cloud.deleteProductImage(CLINIC, PRODUCT, `${CLINIC}/unknown.jpg`);
check("  وفشلُ العدّ ⇒ لا حذف («ما أعرف» تعني «لا تلمس»)", globalThis.__removed.length === 0);
globalThis.__refsError = null;
globalThis.__removed = [];
await cloud.deleteProductImage(CLINIC, PRODUCT, "library/shared.jpg");
check("  وملفُّ المكتبة المشترَك لا يُلمس أبداً", globalThis.__removed.length === 0);

console.log("▸ 0190 — شعارُ العيادة ملفٌّ بالدلو، لا بايتاتٌ بالقاعدة");
globalThis.__uploads = [];
const L1 = await cloud.uploadClinicLogo(CLINIC, mkUpload("image/png", "png"));
await new Promise((r) => setTimeout(r, 2));
const L2 = await cloud.uploadClinicLogo(CLINIC, mkUpload("image/png", "png"));
check("الرفعُ يرجع مساراً لا عنواناً مضمَّناً", !L1.startsWith("data:") && L1.length < 120, L1.slice(0, 40));
check("  وبمجلّد العيادة (نفسُ سياسةِ صورة المنتج — لا سياسةَ جديدة)", L1.startsWith(`${CLINIC}/logo-`), L1);
check("  ورفعتان ⇒ مساران — الاستبدالُ لا يُحجب بذاكرة المتصفّح", L1 !== L2, `${L1} == ${L2}`);
check("  و`upsert:false` و`cacheControl` سنةً كالمنتج",
  globalThis.__uploads.every((u) => u.opts?.upsert === false && u.opts?.cacheControl === "31536000"));
check("  والامتدادُ من النوع المرسَل", L1.endsWith(".png") && globalThis.__uploads[0]?.opts?.contentType === "image/png");
check("  وPDF يُرفض قبل أن يصل الخادم",
  (globalThis.__uploads = [], await threw(() => cloud.uploadClinicLogo(CLINIC, mkUpload("application/pdf", "pdf")))) && globalThis.__uploads.length === 0);
check("  وبلا عيادةٍ لا رفع (المسارُ بلا مجلّدٍ يرفضه الخادم)",
  await threw(() => cloud.uploadClinicLogo(null, mkUpload("image/png", "png"))));
check("والتجريبيُّ يرجع العنوانَ المضمَّن — لا دلوَ هناك، وهو تخزينُه الوحيد",
  (await demo.uploadClinicLogo(CLINIC, mkUpload("image/png", "png"))).startsWith("data:"));
check("  ويرمي على PDF كذلك",
  await threw(() => demo.uploadClinicLogo(CLINIC, mkUpload("application/pdf", "pdf"))));

globalThis.__removed = [];
await cloud.deleteClinicLogo(CLINIC, "data:image/png;base64,AAAA");
await cloud.deleteClinicLogo(CLINIC, "library/shared.png");
check("حذفُ الشعار: `data:` ومسارُ المكتبة لا ملفَّ لهما فلا يُلمسان", globalThis.__removed.length === 0, JSON.stringify(globalThis.__removed));
await cloud.deleteClinicLogo(CLINIC, `${CLINIC}/logo-old.png`);
check("  والسابقُ الحقيقيُّ يُحذف بعد نجاح الجديد", globalThis.__removed.includes(`${CLINIC}/logo-old.png`));

console.log("▸ 0190ب — القاعدةُ ترفض البايتات بنفسها، لا بترويسةِ هجرة");
const setCloud = await buildModule("src/lib/settings.ts", FAKE_SUPABASE, "set-cloud");
const setDemo = await buildModule("src/lib/settings.ts", "export const supabase = null;", "set-demo");
check("سحابياً: `setClinicLogo` برمزٍ `data:` ترمي — القاعدةُ ما تحمل بايتات",
  await threw(() => setCloud.setClinicLogo("data:image/png;base64,AAAA")));
check("  وبمسارٍ تمرّ", !(await threw(() => setCloud.setClinicLogo(`${CLINIC}/logo-x.png`))));
check("  وnull تمرّ (إزالةُ الشعار)", !(await threw(() => setCloud.setClinicLogo(null))));
check("تجريبياً: `data:` مشروعةٌ — لا دلوَ بالجهاز",
  !(await threw(() => setDemo.setClinicLogo("data:image/png;base64,AAAA"))));
check("  و`getClinicLogo` ترجعها كما هي", setDemo.getClinicLogo() === "data:image/png;base64,AAAA");
check("  و`getClinicLogoRef` ترجع المحفوظَ حرفياً", setDemo.getClinicLogoRef() === "data:image/png;base64,AAAA");
setDemo.setClinicLogo(`${CLINIC}/logo-y.png`);
check("ومسارٌ محفوظٌ يخرج **رابطاً** لا مساراً — وإلا فكلُّ قسيمةٍ ومتجرٍ بصورةٍ مكسورة",
  setDemo.getClinicLogo() === `https://x.example/storage/v1/object/public/product-images/${CLINIC}/logo-y.png`,
  String(setDemo.getClinicLogo()));
check("  والمحفوظُ يبقى المسارَ نفسَه", setDemo.getClinicLogoRef() === `${CLINIC}/logo-y.png`);

console.log(fails ? `\n✗ images-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ images-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
