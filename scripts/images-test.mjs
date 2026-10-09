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
    upload: (path, blob, opts) => {
      globalThis.__uploads.push({ path, opts });
      // 0229: مصغّرٌ يفشل رفعُه (شبكةٌ تنقطع بين الملفّين) — الصورةُ تبقى.
      if (globalThis.__failThumb && path.endsWith(".thumb.jpg")) return Promise.resolve({ data: null, error: { message: "boom" } });
      return ok({ path });
    },
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
    // image_path_in_use (0222) ترجع منطقياً لا صفوفاً — كما بالخادم: صفٌّ يشير ⇒ true.
    from: () => q(),
    rpc: (name) => name === "image_path_in_use"
      ? { then: (res) => res({ data: globalThis.__refsError ? null : globalThis.__productRefs.length > 0, error: globalThis.__refsError }) }
      : q(),
    schema: () => ({ from: () => q() }),
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

console.log("▸ 0229 — الصورةُ ومصغّرُها: ملفّان بنفس القواعد، والمصغّرُ يتبع صورتَه");
globalThis.__uploads = []; globalThis.__failThumb = false;
const ph = await cloud.uploadProductPhoto(CLINIC, PRODUCT, mkUpload("image/jpeg", "jpg"), mkUpload("image/jpeg", "jpg"));
check("رفعتان: الكاملةُ أوّلاً ثمّ المصغّرُ باسمها", globalThis.__uploads.length === 2 && globalThis.__uploads[0].path === ph.path
  && ph.thumb === ph.path.replace(/\.jpg$/, ".thumb.jpg") && globalThis.__uploads[1].path === ph.thumb, JSON.stringify(ph));
check("  وكلاهما بمجلّد العيادة، بلا استبدال، ومخبوءٌ سنة",
  ph.path.startsWith(`${CLINIC}/`) && globalThis.__uploads.every((u) => u.opts?.upsert === false && u.opts?.cacheControl === "31536000"));
globalThis.__uploads = []; globalThis.__failThumb = true;
const ph2 = await cloud.uploadProductPhoto(CLINIC, PRODUCT, mkUpload("image/jpeg", "jpg"), mkUpload("image/jpeg", "jpg"));
check("  وفشلُ المصغّر لا يُفشل الصورة — يرجع بلا مصغّر (لا مسارَ لملفٍّ لم يُرفع)", !!ph2.path && ph2.thumb === null);
globalThis.__failThumb = false;
check("  وPDF يُرفض قبل أيّ رفع",
  (globalThis.__uploads = [], await threw(() => cloud.uploadProductPhoto(CLINIC, PRODUCT, mkUpload("application/pdf", "pdf"), mkUpload("image/jpeg", "jpg")))) && globalThis.__uploads.length === 0);
const dph = await demo.uploadProductPhoto(CLINIC, PRODUCT, mkUpload("image/jpeg", "jpg"), mkUpload("image/jpeg", "jpg"));
check("  والتجريبيُّ يرجع الاثنين عناوينَ مضمَّنة", typeof dph.path === "string" && typeof dph.thumb === "string");
const bare = { ...mkUpload("image/jpeg", "jpg"), blob: new Blob([new Uint8Array([255, 216, 255, 224, 1, 2, 3])], { type: "image/jpeg" }), dataUrl: "" };
const dph2 = await demo.uploadProductPhoto(CLINIC, PRODUCT, bare, { ...bare });
check("  وبلا عنوانٍ جاهز (الاستوديو لا يبنيه) يبنيه من البايتات — لا صورةَ فارغة", dph2.path.startsWith("data:image/jpeg;base64,") && dph2.path.length > 30 && dph2.thumb?.startsWith("data:"));
globalThis.__removed = []; globalThis.__refsError = null; globalThis.__productRefs = [];
await cloud.deleteProductImage(CLINIC, PRODUCT, `${CLINIC}/p-1.jpg`, `${CLINIC}/p-1.thumb.jpg`);
check("حذفُ صورةٍ لا يشير إليها أحد يحذف مصغّرَها معها", globalThis.__removed.includes(`${CLINIC}/p-1.jpg`) && globalThis.__removed.includes(`${CLINIC}/p-1.thumb.jpg`));
globalThis.__removed = []; globalThis.__productRefs = [{ id: "twin" }];
await cloud.deleteProductImage(CLINIC, PRODUCT, `${CLINIC}/p-2.jpg`, `${CLINIC}/p-2.thumb.jpg`);
check("  وصورةٌ يشير إليها توأم تبقى بمصغّرها", globalThis.__removed.length === 0, JSON.stringify(globalThis.__removed));
globalThis.__removed = []; globalThis.__productRefs = [];
await cloud.deleteProductImage(CLINIC, PRODUCT, `${CLINIC}/p-3.jpg`, `${CLINIC}/other.thumb.jpg`);
check("  ومصغّرٌ ليس لهذه الصورة لا يُحذف معها (وصفٌ يتيم)", JSON.stringify(globalThis.__removed) === JSON.stringify([`${CLINIC}/p-3.jpg`]), JSON.stringify(globalThis.__removed));

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

console.log("▸ 0229 بعد تدقيق — صورةُ «الدقة القصوى» تُصغَّر لا تُقال «مو صورة»، والرسمُ يُقال بلغة المستخدم");
{
  /* الدوالُّ الأصلية بحزمةٍ واحدة: productPhoto (القرار والتحميل والترميز) وerrors (الكلمات). */
  const built = await esbuild.build({
    stdin: { contents: 'export * from "./src/lib/productPhoto"; export { describeUploadError } from "./src/lib/errors"; export { FileTooLargeError, ImageEncodeError, TooManyPixelsError } from "./src/lib/image";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent", alias: { "@": "./src" },
  });
  const dir = mkdtempSync(join(tmpdir(), "images-photo-"));
  writeFileSync(join(dir, "m.mjs"), built.outputFiles[0].text);
  const P = await import(pathToFileURL(join(dir, "m.mjs")).href);
  rmSync(dir, { recursive: true, force: true });
  const t = (k, d, o) => `${k}${o && o.mb != null ? `:${o.mb}` : ""}`;

  check("حتى ٤٠ ميغابكسل تُرسم كما هي (١٢ ميغا: ٤٠٣٢×٣٠٢٤)", P.sourcePlan(4032, 3024).kind === "direct");
  const p48 = P.sourcePlan(8064, 6048);
  check("٤٨ ميغا (آيفون HEIF Max) ⇒ تُصغَّر إلى ضعف ضلع الحفظ بنفس النسبة", p48.kind === "downscale" && p48.w === 3200 && p48.h === 2400, JSON.stringify(p48));
  check("  و٢٠٠ ميغا (١٦٣٢٠×١٢٢٤٠) ⇒ تُصغَّر كذلك", P.sourcePlan(16320, 12240).kind === "downscale");
  const bomb = P.sourcePlan(20000, 15000);
  check("  وفوق ٢١٠ (قنبلةُ فكّ ضغط، لا كاميرا) ⇒ تُرفض بعدد ميغابكسلاتها", bomb.kind === "reject" && bomb.mp === 300, JSON.stringify(bomb));
  check("  ونسخةُ العمل تُبقي القصَّ المربّعَ ≥ ضلع الحفظ", Math.min(p48.w, p48.h) >= P.FULL_DIM);

  const tooBig = await P.loadPhoto({ size: 26 * 1024 * 1024 }).then(() => null, (e) => e);
  check("ملفٌّ فوق ٢٥ ميغا يُرمى `FileTooLargeError` (كان Error خامّاً فيُقال «مو صورة»)", tooBig?.name === "FileTooLargeError" && tooBig.maxMb === 25, tooBig?.name);
  check("  ويُقال «الملف كبير» لا «مو صورة»", P.describeUploadError(tooBig, t) === "errors.fileTooLarge:25");
  check("  وكثرةُ البكسلات تُقال حجماً كذلك من أيّ شاشةٍ أخرى", P.describeUploadError(new P.TooManyPixelsError(300), t).startsWith("errors.fileTooLarge"));
  check("فشلُ الرسم «Canvas is not supported» يُقال بلغة المستخدم — لا «اختر JPG» ولا الإنكليزيّ الخامّ",
    P.describeUploadError(new P.ImageEncodeError("Canvas is not supported in this browser"), t) === "errors.imageEncode");
  check("  و«Image compression failed» كذلك", P.describeUploadError(new P.ImageEncodeError("Image compression failed"), t) === "errors.imageEncode");
  check("  وملفٌّ لا يُقرأ صورةً يبقى «اختر صورة»", P.describeUploadError(new Error("The file could not be read as an image"), t) === "errors.notAnImage");

  const fakeImg = { naturalWidth: 1200, naturalHeight: 800, width: 1200, height: 800 };
  const realCreate = globalThis.document.createElement;
  globalThis.document.createElement = () => ({ width: 0, height: 0, getContext: () => null });
  const e1 = await P.encodeProductPhoto(fakeImg, P.NO_EDIT, false).then(() => null, (e) => e);
  globalThis.document.createElement = () => ({ width: 0, height: 0, getContext: () => { throw new Error("Out of memory"); } });
  const e2 = await P.encodeProductPhoto(fakeImg, P.NO_EDIT, false).then(() => null, (e) => e);
  globalThis.document.createElement = realCreate;
  check("الترميزُ بلا canvas يرمي `ImageEncodeError`", e1?.name === "ImageEncodeError", e1?.name);
  check("  وأيُّ فشلٍ آخرَ بالترميز (ذاكرة) يُلفّ بها — فلا يصل نصُّ المتصفّح للشاشة", e2?.name === "ImageEncodeError" && P.describeUploadError(e2, t) === "errors.imageEncode", e2?.name);

  /* التجريبيُّ يحفظ الصورةَ مرّةً واحدة: الوصفُ يحمل بصمتَها — والقاعدةُ «يصف هذه الصورة» قائمة. */
  const inl = "data:image/jpeg;base64," + "Q".repeat(5000) + "x";
  const other = "data:image/jpeg;base64," + "Q".repeat(5000) + "y";
  const key = P.inlineKey(inl);
  check("بصمةُ المضمَّنة قصيرةٌ وثابتة، ولصورةٍ أخرى بنفس الطول بصمةٌ أخرى", key.length < 40 && key === P.inlineKey(inl) && key !== P.inlineKey(other), key);
  check("  و`metaPathFor`: المضمَّنةُ ببصمتها، والملفُّ باسمه، والبصمةُ لا تُبصَم ثانيةً",
    P.metaPathFor(inl) === key && P.metaPathFor("c1/p-1.jpg") === "c1/p-1.jpg" && P.metaPathFor(key) === key);
  const m = { v: 1, path: key, thumb: "data:image/jpeg;base64,T", w: 1, h: 1, bytes: 1, src: "album" };
  check("  ووصفٌ ببصمتها يُصدَّق لها (مصغّرٌ ووصف)", P.thumbOf(inl, m) === m.thumb && P.metaOf(inl, m) === m);
  check("  ولا يُصدَّق لصورةٍ أخرى (دمجٌ طوى الحقولَ منفصلة)", P.thumbOf(other, m) === null && P.metaOf(other, m) === null);
  check("  والوصفُ القديم (المسارُ كاملاً) يبقى مصدَّقاً", P.metaOf(inl, { ...m, path: inl }) !== null);
  check("  وبصمةٌ لا تصف ملفّاً سحابياً أبداً", P.metaOf("c1/p-1.jpg", { ...m, path: P.inlineKey("c1/p-1.jpg") }) === null);
}

console.log("▸ 0229 بعد تدقيق — المصغّرُ يتبع صورتَه من المخزون، وسطحُ المقارنة لا تسرقه قائمةُ الصورة");
{
  const { readFileSync } = await import("node:fs");
  const inv = readFileSync("src/pages/Inventory.tsx", "utf8");
  const calls = inv.match(/repo\.deleteProductImage\([^)]*\)/g) ?? [];
  check("المخزون: تبديلُ الصورة وإزالتُها تمرّر المصغّرَ القديم (`thumbOf`) — لا `.thumb.jpg` يتيم",
    /const prevThumb = thumbOf\(prevPath, product\?\.image_meta\)/.test(inv) && calls.length === 3 && calls.every((c) => /, prevThumb\)$/.test(c)), calls.join(" | "));
  const st = readFileSync("src/components/store/PhotoStudio.tsx", "utf8");
  check("الاستوديو: المقارنةُ دوسةٌ تقلب بزرٍّ بحالته — لا ضغطةٌ مطوّلة (pointerdown/up)",
    /data-compare-toggle aria-pressed=\{comparing\}/.test(st) && !/onPointerDown=\{\(\) => setComparing\(true\)\}/.test(st));
  check("  وسطحُها يكتم قائمةَ الصورة بالموبايل (آيفون: touch-callout، أندرويد: contextmenu)",
    /style=\{\{ WebkitTouchCallout: "none" \}\}/.test(st) && /onContextMenu=\{\(e\) => e\.preventDefault\(\)\}/.test(st));
  check("  وخطأُ الترميز يمرّ من describeUploadError لا e.message", /catch \(e\) \{ setErr\(describeUploadError\(e, t\)\); return; \}/.test(st));
  for (const f of ["src/components/store/PhotoStudio.tsx", "src/components/store/CameraScan.tsx"]) {
    const src = readFileSync(f, "utf8");
    check(`${f.split("/").pop()}: لا حشوةَ ثانيةً داخل Dialog (px-6 pb-6 فوق px-6 pb-6)`, !/className="[^"]*\bpx-6 pb-6\b/.test(src));
  }
}

console.log(fails ? `\n✗ images-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ images-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
