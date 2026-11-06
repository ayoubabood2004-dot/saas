/* ============================================================================
 * attach-test — مرفقاتُ الزيارة (0263) والكاميرا داخل السستم.
 *
 * بلاغُ المالك (٦/١١): «داخل الزيارة نرفق التحاليل وصورة الأشعة»، و«ما أكدر أفتح الكاميرا من داخل السستم وأصوّر
 * — لازم صورة حافظها». والجذرُ أن كلَّ مكانٍ يرفع صورةً كان منتقيَ ملفّاتٍ واحداً يقرّر المتصفّحُ ما يعرض فيه: خزنةُ
 * الحيوان بلا capture (فلا كاميرا بأندرويد، والتحليلُ يقبل PDF فيفتح مديرَ الملفّات)، ونموذجُ التحاليل ومعالجُ
 * التشخيص بـcapture (فالكاميرا وحدها ولا صورةَ محفوظة).
 *
 * يفحص: (أ) قراراتِ الكاميرا الصِّرفة بسلوكها، (ب) بابَ الإرفاق والفكّ بالتجريبيّ (المرآة) بسلوكه — شرطُ الحال كما
 * رآها الطبيب وصفرُ الصفوف يُرمى كالخادم، (ج) الأسلاكَ نصّاً: لا منتقيَ بـcapture وحده بقيَ في مكانٍ يرفع تحليلاً،
 * والخادمُ يُسأل بشرط الحال، والهجرةُ بلا مفتاحٍ أجنبيّ. والشاشةُ نفسُها (البثُّ الحيّ والإذنُ المرفوض) تُقاس بمتصفّحٍ
 * بكاميرا مزيّفة — react-mini لا فيديو فيه.
 *
 *   node scripts/attach-test.mjs
 * ========================================================================== */
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

let passes = 0;
let fails = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
/** نصُّ المصدر بلا تعليقات — شرحٌ يذكر السطرَ ليس السطر. والتعليقُ يبدأ بعد فراغٍ أو قوس: `"image/*"` نصٌّ لا بدايةُ
 *  تعليق (قراءتُه بدايةً كانت تمحو نصفَ الملفّ حتى أوّل نهاية تعليق). */
const code = (f) => readFileSync(f, "utf8").replace(/(^|[\s;{}(),])\/\*[\s\S]*?\*\//g, "$1").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");

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
const built = await esbuild.build({
  stdin: {
    contents: ['export * from "./src/lib/repo.ts";', 'export * as C from "./src/lib/cameraCapture.ts";'].join("\n"),
    resolveDir: process.cwd(), sourcefile: "attach-test-entry.ts", loader: "ts",
  },
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
  define: { "import.meta.env": "__VITE_ENV__" }, banner: { js: "const __VITE_ENV__ = {};" },
  plugins: [{
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
  }],
});
const dir = mkdtempSync(path.join(tmpdir(), "attach-test-"));
const file = path.join(dir, "bundle.mjs");
writeFileSync(file, built.outputFiles[0].text);
const { repo, C } = await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });
if (!repo || !C) { console.error("✗ attach-test: ما انحمّلت الوحدات"); process.exit(1); }

/* ── أ) قراراتُ الكاميرا ────────────────────────────────────────────────────── */
console.log("▸ أ) الكاميرا: ما يُقال عن كلّ خطأ، والقيود، والتبديل، واسمُ اللقطة");
{
  const ph = (name) => C.cameraPhaseOf(Object.assign(new Error(name), { name }));
  check("رفضُ الإذن (NotAllowedError، وPermissionDeniedError القديم، وSecurityError) ⇒ «denied» — يقول اسمح لها",
    ["NotAllowedError", "PermissionDeniedError", "SecurityError"].every((n) => ph(n) === "denied"));
  check("  كاميرا ماسكها تطبيقٌ ثانٍ (NotReadableError/TrackStartError/AbortError) ⇒ «busy»",
    ["NotReadableError", "TrackStartError", "AbortError"].every((n) => ph(n) === "busy"));
  check("  ماكو كاميرا (NotFoundError، قيدٌ ما يتحقّق، متصفّحٌ ما يقدر يسأل، أو بلا mediaDevices) ⇒ «unavailable» — لا «رفضتَ» عمّا لم يُرفض",
    ["NotFoundError", "DevicesNotFoundError", "OverconstrainedError", "NotSupportedError", "TypeError"].every((n) => ph(n) === "unavailable"));
  check("  وغيرُه ⇒ «failed» — لا يُخمَّن سببٌ", ph("WeirdError") === "failed" && C.cameraPhaseOf(null) === "failed" && C.cameraPhaseOf("x") === "failed");

  const back = C.videoConstraints();
  check("بلا كاميرا مختارة: الخلفيةُ مفضَّلةٌ لا مفروضة (ideal) — حاسوبٌ بأماميّةٍ وحدها يفتح بها",
    back.facingMode?.ideal === "environment" && !("exact" in (back.facingMode ?? {})) && !back.deviceId, JSON.stringify(back));
  check("  ودقّةٌ تُقرأ بها أرقامُ الورقة مثاليّةً لا مفروضة (المتصفّحُ يعطي أقربَ ما عنده ولا يرفض)",
    back.width?.ideal >= 1920 && back.height?.ideal >= 1080 && !("exact" in back.width) && !("min" in back.width));
  const picked = C.videoConstraints("cam-2");
  check("  وكاميرا اختيرت بالتبديل تُطلب بمعرّفها بالضبط (وإلا رجع المتصفّحُ للخلفية ولم يتبدّل شيء)",
    picked.deviceId?.exact === "cam-2" && !picked.facingMode, JSON.stringify(picked));

  const cams = [{ deviceId: "a" }, { deviceId: "b" }, { deviceId: "c" }];
  check("التبديلُ دائريّ: a⇒b⇒c⇒a", C.nextCamera(cams, "a") === "b" && C.nextCamera(cams, "b") === "c" && C.nextCamera(cams, "c") === "a");
  check("  وبلا معرّفٍ نشط (أو مجهول) تبدأ من الثانية", C.nextCamera(cams, null) === "b" && C.nextCamera(cams, "zzz") === "a");
  check("  وكاميرا واحدة أو ولا وحدة ⇒ لا تبديل (الزرُّ ما يُعرض)", C.nextCamera([{ deviceId: "a" }], "a") === null && C.nextCamera([], null) === null);
  check("  ومعرّفاتٌ فارغة (قبل الإذن) لا تُحسب كاميرات", C.nextCamera([{ deviceId: "" }, { deviceId: "" }], null) === null);

  check("اسمُ اللقطة بوقتها المحلّيّ: camera-YYYYMMDD-HHMMSS.jpg", C.shotName(new Date(2026, 10, 6, 9, 5, 7)) === "camera-20261106-090507.jpg", C.shotName(new Date(2026, 10, 6, 9, 5, 7)));
  check("«من الجهاز» للتحليل والأشعة والسونار والمستند يقبل PDF، والصورةُ العاديّة صورةٌ وحدها",
    ["lab", "xray", "ultrasound", "document"].every((k) => C.acceptFor(k) === "image/*,application/pdf") && C.acceptFor("photo") === "image/*");
}

/* ── ب) الإرفاقُ والفكّ بالمرآة ───────────────────────────────────────────────── */
console.log("▸ ب) بابُ الإرفاق: الرفعُ للزيارة، والإرفاقُ من الخزنة بشرط حاله، والفكّ");
{
  const PET = "pet-attach-test";
  const prep = (n) => ({ blob: null, dataUrl: `data:image/jpeg;base64,${n}`, ext: "jpg", contentType: "image/jpeg" });
  const inVisit = await repo.uploadMedia(PET, prep("AAA"), "lab", "cbc.jpg", "visit-1");
  const vault = await repo.uploadMedia(PET, prep("BBB"), "xray", "old.jpg");
  check("رفعٌ من الزيارة يُختم بها (visit_id)", inVisit.visit_id === "visit-1");
  check("  ورفعُ الخزنة بلا المفتاح أصلاً — لا visit_id يُرسل لقاعدةٍ قبل الهجرة", !("visit_id" in vault), JSON.stringify(Object.keys(vault)));
  const listed = await repo.listMedia(PET);
  check("  والاثنان بخزنة الحيوان (الملفُّ للحيوان)", listed.length === 2 && listed.some((m) => m.id === inVisit.id) && listed.some((m) => m.id === vault.id));

  await repo.setMediaVisit(vault.id, "visit-1", null);
  const after = (await repo.listMedia(PET)).find((m) => m.id === vault.id);
  check("إرفاقُ ملفٍّ من الخزنة بالزيارة", after?.visit_id === "visit-1");
  let threw = null;
  try { await repo.setMediaVisit(vault.id, "visit-2", null); } catch (e) { threw = e; }
  check("  وإرفاقُه ثانيةً بزيارةٍ أخرى وهو مرفق (من جهازٍ ثانٍ رآه بالخزنة) يُرمى no_row_updated — لا يُسحب بصمت",
    threw?.code === "no_row_updated", String(threw?.code ?? threw));
  check("    وبقي بزيارته الأولى", (await repo.listMedia(PET)).find((m) => m.id === vault.id)?.visit_id === "visit-1");
  threw = null;
  try { await repo.setMediaVisit(vault.id, null, "visit-9"); } catch (e) { threw = e; }
  check("  والفكُّ من زيارةٍ ليس فيها يُرمى", threw?.code === "no_row_updated");
  await repo.setMediaVisit(vault.id, null, "visit-1");
  const back = (await repo.listMedia(PET)).find((m) => m.id === vault.id);
  check("  والفكُّ يرجّعه للخزنة وحدها — الملفُّ باقٍ", !!back && (back.visit_id ?? null) === null);
  threw = null;
  try { await repo.setMediaVisit("no-such-id", "visit-1", null); } catch (e) { threw = e; }
  check("  ومعرّفٌ ما موجود يُرمى (لا «انرفق» عن لا شيء)", threw?.code === "no_row_updated");
}

/* ── ج) الأسلاك ──────────────────────────────────────────────────────────────── */
console.log("▸ ج) الأسلاك: لا منتقيَ يقرّر عن الطبيب، والخادمُ يُسأل بشرط الحال");
{
  const attach = code("src/components/attach/Attach.tsx");
  const cam = code("src/components/attach/CameraSheet.tsx");
  for (const f of ["src/components/LabCenter.tsx", "src/components/TreatmentPlan.tsx", "src/pages/PetPassport.tsx"]) {
    check(`${path.basename(f)}: لا منتقيَ بـcapture وحده (الكاميرا وحدها) ولا منتقيَ تحليلٍ بلا كاميرا — «صوّر / من الجهاز» من Attach`,
      !/capture=/.test(code(f)) && /import\("@\/components\/attach\/Attach"\)/.test(code(f)), f);
  }
  check("PetPassport: أزرارُ أنواع الخزنة ما عادت منتقيات (`<input type=\"file\"` للخزنة راح)",
    !/accept=\{k === "lab"/.test(code("src/pages/PetPassport.tsx")) && /<VaultUploaderLazy petId=\{pet\.id\} kinds=\{kinds\}/.test(code("src/pages/PetPassport.tsx")));
  check("PhotoSource: «من الجهاز» بلا capture، و«صوّر» يفتح CameraSheet",
    /<input ref=\{input\} type="file" accept=\{accept\} className="hidden"/.test(attach) && !/capture/.test(attach) && /<CameraSheet open=\{cam\}/.test(attach));
  check("CameraSheet: البديلُ الوحيد بـcapture هو «كاميرا الجهاز»، والصورةُ المحفوظة بلا capture",
    (cam.match(/capture=/g) ?? []).length === 1 && /ref=\{camInput\} type="file" accept="image\/\*" capture="environment"/.test(cam) && /ref=\{fileInput\} type="file" accept=\{accept\}/.test(cam));
  check("  والمسارُ يُطفأ بكلّ خروج: فكُّ الأثر يُبطل الجيلَ ويطفئ، وطلبٌ متأخّرٌ عن جيلٍ أحدث يُطفأ بمكانه",
    /return \(\) => \{ genRef\.current\+\+; stop\(\);/.test(cam) && /if \(gen !== genRef\.current\) \{ s\.getTracks\(\)\.forEach\(\(tr\) => tr\.stop\(\)\); return; \}/.test(cam));
  check("  وEsc تطوي الكاميرا وحدها (مكدّسُ النوافذ) لا النافذةَ التي فتحتها",
    /pushModal\(id\)/.test(cam) && /e\.key === "Escape" && isTopModal\(id\)/.test(cam) && /removeModal\(id\)/.test(cam));

  const visit = code("src/pages/VisitPage.tsx");
  check("الزيارة: المرفقاتُ قطعةٌ كسولة بنطاقها (att) تأخذ الزيارةَ نفسَها",
    /page\(\(\) => import\("@\/components\/attach\/Attach"\)\.then\(\(m\) => \(\{ default: m\.VisitAttachments \}\)\), \["att"\]\)/.test(visit)
    && /<VisitAttachmentsLazy pet=\{pet\} visitId=\{visit\.id\}/.test(visit));
  check("  وتعرض مرفقاتِ هذه الزيارة وحدها، و«من ملف الحيوان» ما ليس بأيّ زيارة",
    /filter\(\(m\) => m\.visit_id === visitId\)/.test(attach) && /filter\(\(m\) => !m\.visit_id\)/.test(attach));
  check("  والإرفاقُ من الخزنة بشرط «بلا زيارة»، والفكُّ بشرط «بهذه الزيارة»",
    /setMediaVisit\(id, visitId, null\)/.test(attach) && /setMediaVisit\(m\.id, null, visitId\)/.test(attach));
  check("  وقائمةٌ ما انحملت تُقال (لا «ما في شي مرفق» كاذبة)، ورفعٌ أثناء التحميل لا يصنع قائمةً منه وحده",
    /setFailed\(true\)/.test(attach) && /failed \? \(/.test(attach) && /setItems\(\(xs\) => \(xs \? \[/.test(attach));

  const repoSrc = code("src/lib/repo.ts");
  check("الخادم: visit_id يُرسل لمرفقات الزيارة وحدها (رفعُ الخزنة كما كان)",
    /insert\(\{ pet_id: petId, kind, url: path, caption, \.\.\.\(visitId \? \{ visit_id: visitId \} : \{\}\) \}\)/.test(repoSrc));
  check("  والإرفاقُ/الفكُّ تحديثٌ بشرط الحال (is null / eq) يُرمى على صفر صفوف (updatedRows)",
    /async setMediaVisit\(id, visitId, from\) \{[\s\S]{0,260}q = from === null \? q\.is\("visit_id", null\) : q\.eq\("visit_id", from\);[\s\S]{0,80}updatedRows\(await q\.select\("id"\)\)/.test(repoSrc));

  const mig = code("supabase/migrations/0263_visit_attachments.sql").replace(/--[^\n]*/g, "");
  check("0263: عمودٌ uuid بلا مفتاحٍ أجنبيّ (المرفقُ سجلٌّ طبّيٌّ يبقى ولو حُذفت الزيارة) وفهرسٌ جزئيّ",
    /add column if not exists visit_id uuid;/.test(mig) && !/references/.test(mig) && /where visit_id is not null/.test(mig));
  check("  ولا سياسةَ ولا دالّةَ جديدة (سياسةُ العيادة القائمة تحكم الكتابة)", !/create (or replace )?(function|policy)/i.test(mig));
}

console.log(fails ? `\n✗ attach-test: ${passes} نجح، ${fails} فشل` : `\n✓ attach-test: ${passes} نجح، 0 فشل`);
process.exit(fails ? 1 : 0);
