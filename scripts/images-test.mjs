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
globalThis.__uploadFail = null;     // (path) => true ⇒ تفشل هذه الرفعة
globalThis.__files = [];            // ملفّاتُ مجلّد العيادة لـlist
globalThis.__lists = [];
globalThis.__listError = false;

const FAKE_SUPABASE = `
  const ok = (data) => Promise.resolve({ data, error: null });
  const storageApi = {
    upload: (path, blob, opts) => {
      globalThis.__uploads.push({ path, opts });
      if (globalThis.__uploadFail && globalThis.__uploadFail(path)) return Promise.resolve({ data: null, error: { message: "upload_failed" } });
      return ok({ path });
    },
    remove: (paths) => { globalThis.__removed.push(...paths); return ok(null); },
    list: (folder, opts) => {
      globalThis.__lists.push({ folder, opts });
      if (globalThis.__listError) return Promise.resolve({ data: null, error: { message: "list_failed" } });
      const all = globalThis.__files.filter((f) => f.name.includes(opts.search ?? ""));
      return ok(all.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 100)));
    },
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

/* بابُ الرفع الواحد لصورة المنتج صار uploadProductPhoto (من المحرّر) — وما ثبّته البندان ٩ و١٠
 * على الباب القديم يثبَت عليه: مسارٌ فريدٌ لكلّ رفعة بمجلّد العيادة، وupsert مطفأة، وسنةُ ذاكرة،
 * وPDF والـgif مرفوضان قبل أيّ رفعة بالطرفين. والامتدادُ jpg لأن المحرّرَ يرمّز JPEG دائماً. */
console.log("▸ البند ٩ — الرابطُ يتبدّل حين تتبدّل الصورة");
globalThis.__uploads = [];
const ph = (type = "image/jpeg") => ({ full: mkUpload(type, "jpg"), thumb: mkUpload("image/jpeg", "jpg") });
const p1 = await cloud.uploadProductPhoto(CLINIC, PRODUCT, ph());
await new Promise((r) => setTimeout(r, 2));
const p2 = await cloud.uploadProductPhoto(CLINIC, PRODUCT, ph());
check("رفعتان لنفس المنتج ⇒ مساران مختلفان", p1 !== p2, `${p1} == ${p2}`);
check("  والمسارُ بمجلّد العيادة (سياسةُ المخزن تشترطه)", p1.startsWith(`${CLINIC}/`), p1);
check("  و`upsert` مطفأةٌ — التصادمُ يُكشف لا يُطمَس",
  globalThis.__uploads.every((u) => u.opts?.upsert === false));
check("  و`cacheControl` سنةٌ كاملة — صار صحيحاً بعد أن صار المسارُ لا يُعاد",
  globalThis.__uploads.every((u) => u.opts?.cacheControl === "31536000"));

console.log("▸ البند ١٠ب — PDF ليس صورةَ منتج (مرآةُ قائمة الدلو 0184)");
check("السحابيّ يرمي على application/pdf",
  await threw(() => cloud.uploadProductPhoto(CLINIC, PRODUCT, ph("application/pdf"))));
check("  ولا رفعةَ وصلت الخادم أصلاً",
  (globalThis.__uploads = [], await threw(() => cloud.uploadProductPhoto(CLINIC, PRODUCT, ph("application/pdf"))), globalThis.__uploads.length === 0));
check("  و image/gif مرفوضٌ كذلك — القائمةُ ثلاثةٌ لا «أيُّ صورة»",
  await threw(() => cloud.uploadProductPhoto(CLINIC, PRODUCT, ph("image/gif"))));
check("والتجريبيُّ يرمي نفسَ الرمية — حارسٌ لا يوجد هنا حارسٌ لم يُفحص",
  await threw(() => demo.uploadProductPhoto(CLINIC, PRODUCT, ph("application/pdf"))));
check("  ويقبل الصورةَ كما كان",
  typeof (await demo.uploadProductPhoto(CLINIC, PRODUCT, { full: mkUpload("image/jpeg", "jpg"), thumb: null })) === "string");
check("  ولا بابَ رفعٍ قديم (uploadProductImage) بالطرفين", !("uploadProductImage" in cloud) && !("uploadProductImage" in demo));
check("  وملفُّ المكتبة التجريبيُّ يُحرَس كذلك",
  await threw(() => demo.createLibraryImage({ name: "س" }, mkUpload("application/pdf", "pdf"))));

/* ── O4 (قرارُ المالك ١٢/١٠): «خلّي الصور مثل ما هي — لا تشيل ولا تحذف صورة» ──────────
 * كان هذا القسمُ يثبّت العكس عمداً: «لا أحدَ يشير ⇒ يُحذف» (deleteProductImage)، و«السابقُ يُحذف
 * بعد نجاح الجديد» (deleteClinicLogo). والحكمُ «لا يشير إليها صفّ» يُسأل لحظةً واحدة — صورةُ
 * منتجٍ بسلّة المحذوفات أو بنسخةٍ قديمة تُكسر بلا كلمة. فانقلب القرارُ بكلمة المالك، والفحصُ
 * ينقلب معه صراحةً: لا بابَ حذفٍ بالمستودعين، ولا `.remove(` على الدلو بأيّ ملفّ، والاستبدالُ
 * والفكُّ يُعادان من «صور سابقة»، وسياستا 0236 السدُّ بالخادم. */
console.log("▸ O4 — لا صورةَ تُحذف ولا يُكتب فوقها");
check("لا deleteProductImage ولا deleteClinicLogo بالسحابيّ ولا بالتجريبيّ",
  !("deleteProductImage" in cloud) && !("deleteClinicLogo" in cloud) && !("deleteProductImage" in demo) && !("deleteClinicLogo" in demo));
{
  const { readdirSync, statSync, readFileSync } = await import("node:fs");
  const walk = (d) => readdirSync(d).flatMap((f) => { const p = `${d}/${f}`; return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|mjs)$/.test(f) ? [p] : []; });
  /* كلُّ `storage.from(X).remove(` بـsrc: X نصٌّ حرفيّ أو ثابتٌ معرَّفٌ بالملفّ نفسِه — ودلوُ صور المنتجات
   * ممنوع (الوسائطُ الطبيةُ دلوٌ آخرُ بقرارٍ آخر). وما لا يُعرف دلوُه يُحسب مخالفاً: «ما أعرف» ≠ «سليم». */
  const offenders = [];
  for (const f of walk("src")) {
    const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
    for (const m of src.matchAll(/storage\s*\.\s*from\(\s*([^)]*?)\s*\)\s*\.\s*remove\s*\(/g)) {
      const arg = m[1];
      const lit = /^["'`]([^"'`]+)["'`]$/.exec(arg)?.[1]
        ?? new RegExp(`const\\s+${arg.replace(/[^\w$]/g, "")}\\s*=\\s*["'\`]([^"'\`]+)["'\`]`).exec(src)?.[1];
      if (!lit || lit === "product-images") offenders.push(`${f} (${arg})`);
    }
  }
  check("  ولا نداءَ حذفٍ على دلو صور المنتجات بأيّ ملفٍّ بـsrc", offenders.length === 0, offenders.join("، "));
  const m236 = readFileSync("supabase/migrations/0236_product_images_keep.sql", "utf8");
  const body = m236.split("\n").filter((l) => !l.trim().startsWith("--")).join("\n");
  check("  و0236: سياستا الحذف والكتابة فوق ملفٍّ مقيِّدتان على الدلو كلّه، تحت to_regclass، بلا هدم",
    /to_regclass\('storage\.objects'\)/.test(body)
    && /create policy product_images_keep_forever on storage\.objects as restrictive for delete to authenticated\s+using \(bucket_id <> 'product-images'\)/.test(body)
    && /create policy product_images_no_overwrite on storage\.objects as restrictive for update to authenticated\s+using \(bucket_id <> 'product-images'\)\s+with check \(bucket_id <> 'product-images'\)/.test(body)
    && !/\bdrop\b/i.test(body));
}
globalThis.__removed = [];
await cloud.deleteLibraryImage("lib-1", "library/shared.jpg");
check("  وحذفُ صفّ المكتبة لا يحذف ملفَّه (منتجاتٌ ربطته تبقى بصورتها)", globalThis.__removed.length === 0, JSON.stringify(globalThis.__removed));

console.log("▸ الصورةُ بنسختين — المصغّرةُ أوّلاً، والكاملةُ بعدها، والمسارُ أخوان");
const HD = mkUpload("image/jpeg", "jpg"), SM = mkUpload("image/jpeg", "jpg");
globalThis.__uploads = []; globalThis.__uploadFail = null;
const hd = await cloud.uploadProductPhoto(CLINIC, PRODUCT, { full: HD, thumb: SM });
const [u1, u2] = globalThis.__uploads;
check("المصغّرةُ تُرفع أوّلاً ثم الكاملة، والراجعُ مسارُ الكاملة",
  u1?.path.endsWith(".sm.jpg") && u2?.path.endsWith(".hd.jpg") && hd === u2?.path && globalThis.__uploads.length === 2, JSON.stringify(globalThis.__uploads.map((u) => u.path)));
check("  أخوان بنفس الاسم (.hd ⇄ .sm) بمجلّد العيادة", u1?.path.replace(/\.sm\.jpg$/, "") === u2?.path.replace(/\.hd\.jpg$/, "") && hd.startsWith(`${CLINIC}/${PRODUCT}-`), hd);
check("  وJPEG، وupsert مطفأة، وcacheControl سنة", globalThis.__uploads.every((u) => u.opts?.contentType === "image/jpeg" && u.opts?.upsert === false && u.opts?.cacheControl === "31536000"));
globalThis.__uploads = []; globalThis.__uploadFail = (p) => p.endsWith(".sm.jpg");
check("وفشلُ المصغّرة يرمي ولا تُرفع الكاملة (فلا صورةَ بلا مصغّرة ولا مسارَ يتغيّر)",
  (await threw(() => cloud.uploadProductPhoto(CLINIC, PRODUCT, { full: HD, thumb: SM }))) && globalThis.__uploads.length === 1);
globalThis.__uploadFail = null;
check("  وPDF يُرفض قبل أيّ رفعة", (globalThis.__uploads = [], await threw(() => cloud.uploadProductPhoto(CLINIC, PRODUCT, { full: mkUpload("application/pdf", "pdf"), thumb: SM }))) && globalThis.__uploads.length === 0);

console.log("▸ «صور سابقة» — القائمةُ كاملةٌ أو خطأ");
globalThis.__files = [
  ...Array.from({ length: 130 }, (_, i) => ({ name: `${PRODUCT}-k${String(i).padStart(3, "0")}.hd.jpg`, created_at: `2026-10-${String(1 + (i % 9)).padStart(2, "0")}` })),
  { name: `${PRODUCT}-k999.sm.jpg`, created_at: "2026-10-09" },
  { name: `${PRODUCT}-old.jpg`, created_at: "2026-09-01" },
];
globalThis.__lists = [];
const hist = await cloud.productImageHistory(CLINIC, PRODUCT);
check("كلُّ الصفحات (١٣١ ملفّاً بثلاث صفحاتٍ من مئة) بلا المصغّرات", hist.length === 131 && !hist.some((h) => h.path.endsWith(".sm.jpg")) && globalThis.__lists.length === 2, `${hist.length} / ${globalThis.__lists.length} صفحات`);
check("  بمسارٍ كاملٍ بمجلّد العيادة، والقديمةُ (بلا .hd) معها", hist.every((h) => h.path.startsWith(`${CLINIC}/`)) && hist.some((h) => h.path.endsWith("-old.jpg")));
globalThis.__listError = true;
check("  وفشلُ القراءة يرمي — لا نصفَ قائمة", await threw(() => cloud.productImageHistory(CLINIC, PRODUCT)));
globalThis.__listError = false;
const dPath = await demo.uploadProductPhoto(CLINIC, "demo-p", { full: HD, thumb: null });
check("التجريبيُّ: العنوانُ المضمَّن، ويُسجَّل بالسابقة فـ«صور سابقة» تعمل هناك",
  dPath.startsWith("data:") && (await demo.productImageHistory(CLINIC, "demo-p"))[0]?.path === dPath);

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

{
  // O4: الشعارُ السابقُ يبقى — شاشةُ الإعدادات تبدّل المرجعَ وحده (لا بابَ حذفٍ أصلاً، فُحص أعلاه).
  const { readFileSync } = await import("node:fs");
  const settings = readFileSync("src/pages/Settings.tsx", "utf8");
  check("استبدالُ الشعار وإزالتُه بالإعدادات لا يحذفان ملفّاً", !/deleteClinicLogo|storage[\s\S]{0,80}\.remove\(/.test(settings));
}

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
