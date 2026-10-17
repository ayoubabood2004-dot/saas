/* ============================================================================
 * فحصُ «لا تحميلَ تحت يد الطبيب» — src/lib/swUpdate.ts (١٧/١٠).
 *
 * الشكوى: «أسجّل حالة، وبنصّها السستم يرجع يحمل من الصفر». القياس (سجلّ طلبات
 * الخادم): أوّلُ فتحٍ بعد كلّ نشرٍ يُقلع مرّتين بفاصل ٢٣–٢٧ ثانية بلا ضغطةٍ بينهما —
 * زمنُ تنزيل الـprecache — والتبويبُ المفتوح يُقلع من جديد دقائقَ بعد النشر. السبب:
 * `registerType: "autoUpdate"` (تخطٍّ واستيلاءٌ فوريّان، ومستمعُ `activated` بحزمة
 * الإضافة يحمّل الصفحةَ بلا شرط).
 *
 * ما يفحصه:
 *   ١) السلوك (createUpdater على بيئةٍ مزيّفة بشكل ServiceWorkerContainer): نسخةٌ تنزل
 *      والطبيبُ يكتب ⇒ لا تحميل، ولا عند عودة التبويب؛ تبديلُ الصفحة ⇒ تحميلٌ واحد؛
 *      تبويبٌ آخر طبّقها ⇒ هذا لا يُحمَّل حتى يبدّل صفحتَه؛ أوّلُ تثبيت ⇒ لا شيء؛
 *      ولا دوّامة.
 *   ٢) الإعداد: لا autoUpdate، ولا تسجيلَ تحقنه الإضافة، ولا `virtual:pwa-register`
 *      (مساعدُها يحمّل الصفحةَ عند الاستيلاء بالوضعين)، وكلُّ `location.reload(` بالشِّفرة
 *      بقائمةٍ مسمّاة.
 *   ٣) بـ`--built` (بعد vite build): sw.js لا يتخطّى الانتظار إلا برسالة، ولا يستولي.
 *
 *   node scripts/sw-update-test.mjs [--built]
 * ==========================================================================*/
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name}${got !== undefined ? ` — ${got}` : ""}`); } };

const dir = mkdtempSync(join(tmpdir(), "swupd-"));
const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/swUpdate.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
const m = await import(pathToFileURL(out).href);
rmSync(dir, { recursive: true, force: true });

/** خدمةٌ مزيّفة: تسجيل، نسخةٌ تُثبَّت، استيلاء، مؤقّتات — وسجلُّ ما طُلب. */
function harness({ controlled = true, waiting = false, session = new Map() } = {}) {
  const log = [];
  let ctrl = controlled;
  const onCC = [];
  const timers = [];
  let now = 1_000_000;
  const worker = () => ({ postMessage: (msg) => log.push(`post:${msg?.type}`) });
  const reg = {
    waiting: waiting ? worker() : null,
    installing: null,
    found: [],
    update() { log.push("update"); return Promise.resolve(); },
    addEventListener(_t, fn) { this.found.push(fn); },
  };
  const u = m.createUpdater({
    controlled: () => ctrl,
    register: async () => reg,
    onControllerChange: (fn) => onCC.push(fn),
    reload: () => log.push("reload"),
    now: () => now,
    session: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v) },
    setTimer: (fn) => timers.push(fn),
  });
  return {
    u, log, session,
    /** الخادمُ فيه نسخةٌ أحدث: تُنزَّل وتُثبَّت وتنتظر. */
    installNew() {
      const w = { state: "installing", sc: [], addEventListener(_t, fn) { this.sc.push(fn); } };
      reg.installing = w; reg.found.forEach((f) => f());
      w.state = "installed"; reg.installing = null; reg.waiting = worker();
      w.sc.forEach((f) => f());
    },
    /** تبدّلت الخدمةُ المتحكّمة (هذا التبويب طلبها، أو غيرُه). */
    controllerChange() { ctrl = true; onCC.forEach((f) => f()); },
    later(ms) { now += ms; },
    fireTimers() { timers.splice(0).forEach((f) => f()); },
    reloads: () => log.filter((e) => e === "reload").length,
    posts: () => log.filter((e) => e === "post:SKIP_WAITING").length,
  };
}

console.log("▸ swUpdate: الطبيبُ يكتب والنسخةُ تنزل (الشكوى نفسُها)");
{
  const h = harness();
  await h.u.start();
  h.u.touch();                     // بدأ يكتب الحالة
  h.installNew();                  // نشرٌ جديد انتهى تنزيلُه بالخلفية
  check("لا تحميلَ لحظةَ اكتمال النسخة", h.reloads() === 0, h.log.join(","));
  check("  ولا طلبَ تخطٍّ (الخدمةُ تنتظر)", h.posts() === 0);
  check("  والحالةُ «تنتظر»", h.u.state === "waiting", h.u.state);
  h.u.check(); h.u.check();        // عودةُ التبويب + مؤقّتُ ٢٠ دقيقة
  check("عودةُ التبويب تسأل فقط — لا تحميل", h.reloads() === 0 && h.log.filter((e) => e === "update").length === 2, h.log.join(","));
  check("تبديلُ الصفحة ⇒ يبدأ التطبيق", h.u.pageChanged() === true && h.posts() === 1, h.log.join(","));
  check("  ولا تحميلَ قبل أن تستولي الخدمة", h.reloads() === 0);
  h.controllerChange();
  check("  واستيلاؤها ⇒ تحميلٌ واحد", h.reloads() === 1, h.log.join(","));
}

console.log("▸ swUpdate: لم يلمس الصفحةَ بعد");
{
  const h = harness({ waiting: true });
  await h.u.start();               // فتح التطبيق ونسخةٌ تنتظر من زيارةٍ سابقة
  check("نسخةٌ تنتظر عند الإقلاع ولا لمسة ⇒ تُطبَّق فوراً", h.posts() === 1, h.log.join(","));
  h.controllerChange();
  check("  وتحميلٌ واحد عند الاستيلاء", h.reloads() === 1);
}
{
  const h = harness();
  await h.u.start();
  h.installNew();                  // اكتملت والمستخدمُ ينظر فقط
  check("نسخةٌ تكتمل قبل أيّ لمسة ⇒ تُطبَّق (لا شيءَ يضيع)", h.posts() === 1, h.log.join(","));
}

console.log("▸ swUpdate: تبويبٌ آخر طبّقها");
{
  const h = harness();
  await h.u.start();
  h.u.touch();
  h.installNew();
  h.controllerChange();            // تبويبٌ ثانٍ بدّل صفحتَه فطبّقها — هذا لم يطلب شيئاً
  check("الاستيلاءُ من تبويبٍ آخر لا يحمّل هذا التبويب", h.reloads() === 0, h.log.join(","));
  check("  والحالةُ «استُولي»", h.u.state === "taken", h.u.state);
  check("  وتبديلُ صفحتِه ⇒ تحميلٌ مباشر (بلا طلب تخطٍّ)", h.u.pageChanged() === true && h.reloads() === 1 && h.posts() === 0, h.log.join(","));
}

console.log("▸ swUpdate: أوّلُ تثبيت، وصفحةٌ بلا نسخة");
{
  const h = harness({ controlled: false });
  await h.u.start();
  h.installNew();                  // أوّلُ خدمةٍ على هذا الجهاز
  h.controllerChange();            // استولت (أو بالتحميل التالي)
  check("أوّلُ تثبيت ليس تحديثاً: لا تحميلَ ولا طلب", h.reloads() === 0 && h.posts() === 0, h.log.join(","));
  check("  ولا شيءَ ينتظر", h.u.state === "none" && h.u.pageChanged() === false);
}

console.log("▸ swUpdate: لا دوّامة");
{
  const session = new Map();
  const h = harness({ waiting: true, session });
  await h.u.start();
  h.fireTimers();                  // طُلب التخطّي ولم يأتِ استيلاء
  check("لا استيلاءَ بعد الطلب ⇒ تحميلٌ احتياطيّ واحد", h.reloads() === 1, h.log.join(","));
  const h2 = harness({ waiting: true, session });   // الإقلاعُ التالي، والخدمةُ ما زالت تنتظر
  h2.later(5_000);
  await h2.u.start();
  check("  والإقلاعُ بعده بثوانٍ لا يعيد المحاولة", h2.posts() === 0 && h2.reloads() === 0, h2.log.join(","));
  h2.u.touch();
  h2.later(40_000);
  check("  وبعد ٣٠ ثانية تُطبَّق عند تبديل الصفحة", h2.u.pageChanged() === true && h2.posts() === 1, h2.log.join(","));
}

console.log("▸ الإعداد: لا autoUpdate ولا مساعدَ يحمّل وحده");
{
  const cfg = readFileSync("vite.config.ts", "utf8");
  const reg = cfg.match(/registerType:\s*"(\w+)"/)?.[1];
  check(`registerType = "prompt" (لا autoUpdate)`, reg === "prompt", reg);
  check("injectRegister: false — التسجيلُ من swUpdate وحده", /injectRegister:\s*false/.test(cfg));
  const main = readFileSync("src/main.tsx", "utf8");
  check("main.tsx لا يستورد virtual:pwa-register", !/virtual:pwa-register/.test(main));
  check("  ويشغّل startAppUpdates()", /startAppUpdates\(\)/.test(main));
  const app = readFileSync("src/App.tsx", "utf8");
  check("App.tsx يبلّغ تبديلَ الصفحة (notePageChange)", /notePageChange\(\)/.test(app));

  /* كلُّ تحميلٍ للصفحة بالشِّفرة له سببٌ مسمّى هنا. تحميلٌ جديد = قرارٌ يُقرأ. */
  const ALLOWED = new Map([
    ["src/lib/swUpdate.ts", "النسخةُ الجديدة عند تبديل الصفحة أو قبل أوّل لمسة"],
    ["src/lib/appUpdate.ts", "قطعةٌ انحذفت بعد نشر — الصفحةُ لا تعمل بدونها"],
    ["src/components/ErrorBoundary.tsx", "زرٌّ يضغطه المستخدم"],
  ]);
  const found = [];
  const walk = (d) => {
    for (const n of readdirSync(d)) {
      const p = join(d, n);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(tsx?)$/.test(n) && /location\.reload\(/.test(readFileSync(p, "utf8"))) found.push(p.replace(/\\/g, "/"));
    }
  };
  walk("src");
  const stray = found.filter((f) => !ALLOWED.has(f));
  check(`location.reload( بـ${found.length} ملفّات كلُّها بالقائمة`, stray.length === 0, stray.join(" "));
}

if (process.argv.includes("--built")) {
  console.log("▸ الناتجُ المبنيّ (dist/)");
  if (!existsSync("dist/sw.js")) check("dist/sw.js موجود", false, "ابنِ أوّلاً");
  else {
    const sw = readFileSync("dist/sw.js", "utf8");
    const all = (sw.match(/skipWaiting\(\)/g) ?? []).length;
    const onMsg = (sw.match(/"SKIP_WAITING"===\w+\.data\.type&&self\.skipWaiting\(\)/g) ?? []).length;
    check("sw.js لا يتخطّى الانتظار إلا برسالة SKIP_WAITING", all > 0 && all === onMsg, `${all} نداء، ${onMsg} منها بالرسالة`);
    check("sw.js لا يستولي على الصفحات المفتوحة (clientsClaim)", !/clientsClaim\(\)/.test(sw));
    check("لا registerSW.js تحقنه الإضافة", !existsSync("dist/registerSW.js") && !/registerSW/.test(readFileSync("dist/index.html", "utf8")));
  }
}

console.log(`\n${fail ? "✗" : "✓"} sw-update: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
