/* ============================================================================
 * فحصُ «لا تحميلَ تحت يد الطبيب» — src/lib/swUpdate.ts + src/lib/inflight.ts (١٧/١٠).
 *
 * الشكوى: «أسجّل حالة، وبنصّها السستم يرجع يحمل من الصفر». القياس (سجلّ طلبات
 * الخادم): أوّلُ فتحٍ بعد كلّ نشرٍ يُقلع مرّتين بفاصل ٢٣–٢٧ ثانية بلا ضغطةٍ بينهما —
 * زمنُ تنزيل الـprecache — والتبويبُ المفتوح يُقلع من جديد دقائقَ بعد النشر. السبب:
 * `registerType: "autoUpdate"`. ثم أمسك تدقيقٌ عدائيّ على التصليح الأوّل: التحميلُ عند
 * تبديل الصفحة يقطع سلسلةَ ما بعد البيعة (جرعةٌ بلا معزّزة)، ويمسح جسرَ البيع، وحاسوبُ
 * الكاشير الذي لا يبدّل صفحتَه لا يتحدّث أبداً، والاحتياطيُّ يحمّل على القديمة.
 *
 * ما يفحصه:
 *   ١) السلوك (createUpdater على بيئةٍ مزيّفة بشكل ServiceWorkerContainer، بساعةٍ ومؤقّتات):
 *      الطبيبُ يكتب ⇒ لا تحميل؛ تبديلُ الصفحة ⇒ تحميلٌ واحد؛ سلسلةٌ ممسوكة ⇒ يُتخطّى؛ كتابةٌ
 *      بالطريق ⇒ تُنتظر أو يُتخطّى؛ لمسةٌ أثناء المحاولة ⇒ تراجع؛ خمولٌ طويل ⇒ يُطبَّق؛ تفعيلٌ
 *      مؤجَّل ⇒ لا تحميلَ على القديمة؛ تبويبٌ آخر طبّقها ⇒ هذا لا يُحمَّل؛ أوّلُ تثبيت؛ لا دوّامة.
 *   ٢) inflight: العدّادُ يعدّ الكتابات لا القراءات، والهدوءُ بعدها، والإمساكُ يُفلت مرّةً.
 *   ٣) الإعداد والتوصيل: لا autoUpdate ولا مساعدَ يحمّل وحده؛ الجسرُ لا يطبّق؛ البيعُ و«حالة
 *      جديدة» يمسكان؛ عميلُ Supabase يعدّ؛ والقطعةُ الناقصة بتبويبٍ مستولىً عليه تحميلٌ عادي؛
 *      وكلُّ `location.reload(` بقائمةٍ مسمّاة.
 *   ٤) بـ`--built` (بعد vite build): sw.js لا يتخطّى الانتظار إلا برسالة، ولا يستولي.
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
const load = async (entry) => {
  const out = join(dir, entry.replace(/\W/g, "_") + ".mjs");
  await build({ entryPoints: [entry], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
  return import(pathToFileURL(out).href);
};
const m = await load("src/lib/swUpdate.ts");
const inf = await load("src/lib/inflight.ts");
rmSync(dir, { recursive: true, force: true });

const MIN = 60_000, HOUR = 3_600_000;

/** خدمةٌ مزيّفة + ساعة: تسجيل، نسخةٌ تُثبَّت، استيلاء، مؤقّتات، لمسات، كتابات — وسجلُّ ما طُلب. */
function harness({ controlled = true, waiting = false, session = new Map(), t0 = 1_000_000 } = {}) {
  const log = [];
  let ctrl = controlled;
  const onCC = [];
  let timers = [];
  let now = t0;
  const io = { lastInput: 0, busy: false, held: false, hidden: false, editing: false };
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
    lastInput: () => io.lastInput,
    busy: () => io.busy || io.held,
    held: () => io.held,
    hidden: () => io.hidden,
    editing: () => io.editing,
    session: { getItem: (k) => session.get(k) ?? null, setItem: (k, v) => session.set(k, v) },
    setTimer: (fn, ms) => timers.push({ fn, at: now + ms }),
  });
  const h = {
    u, log, io, reg, session,
    /** الخادمُ فيه نسخةٌ أحدث: تُنزَّل وتُثبَّت وتنتظر. */
    installNew() {
      const w = { state: "installing", sc: [], addEventListener(_t, fn) { this.sc.push(fn); } };
      reg.installing = w; reg.found.forEach((f) => f());
      w.state = "installed"; reg.installing = null; reg.waiting = worker();
      w.sc.forEach((f) => f());
    },
    /** تبدّلت الخدمةُ المتحكّمة (فُعِّلت): الانتظارُ فرغ. */
    controllerChange() { ctrl = true; reg.waiting = null; onCC.forEach((f) => f()); },
    /** المستخدمُ ضغط أو كتب الآن. */
    touch() { io.lastInput = now; },
    /** تقدّمُ الساعة وتُطلق المؤقّتاتُ المستحقّة (ومنها ما يُضاف أثناءها). */
    advance(ms) {
      const end = now + ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const t = timers[0];
        if (!t || t.at > end) break;
        timers.shift(); now = t.at; t.fn();
      }
      now = end;
    },
    reloads: () => log.filter((e) => e === "reload").length,
    posts: () => log.filter((e) => e === "post:SKIP_WAITING").length,
  };
  return h;
}

console.log("▸ الشكوى نفسُها: الطبيبُ يكتب والنسخةُ تنزل");
{
  const h = harness();
  await h.u.start();
  h.advance(5_000); h.touch();     // بدأ يكتب الحالة
  h.installNew();                  // نشرٌ جديد انتهى تنزيلُه بالخلفية
  h.advance(60_000);
  check("لا تحميلَ ولا طلبَ تخطٍّ لحظةَ اكتمال النسخة ولا بعدها", h.reloads() === 0 && h.posts() === 0, h.log.join(","));
  check("  والحالةُ «تنتظر»", h.u.state === "waiting", h.u.state);
  h.u.check(); h.u.check(); h.advance(10_000);
  check("عودةُ التبويب ومؤقّتُ ٢٠ دقيقة يسألان فقط", h.reloads() === 0 && h.log.filter((e) => e === "update").length === 2, h.log.join(","));
  check("تبديلُ الصفحة ⇒ طلبُ تخطٍّ واحد", h.u.pageChanged() === true && h.posts() === 1, h.log.join(","));
  check("  ولا تحميلَ قبل أن تستولي", h.reloads() === 0);
  h.controllerChange();
  check("  واستيلاؤها ⇒ تحميلٌ واحد", h.reloads() === 1, h.log.join(","));
}

console.log("▸ لم يلمس الصفحةَ بعد");
{
  const h = harness({ waiting: true });
  await h.u.start();
  check("نسخةٌ تنتظر عند الإقلاع ولا لمسة ⇒ تُطبَّق فوراً", h.posts() === 1, h.log.join(","));
  h.controllerChange();
  check("  وتحميلٌ واحد عند الاستيلاء", h.reloads() === 1);
}
{
  const h = harness();
  await h.u.start();
  h.installNew();
  check("نسخةٌ تكتمل قبل أيّ لمسة ⇒ تُطبَّق", h.posts() === 1, h.log.join(","));
}
{
  const h = harness({ waiting: true });
  h.io.busy = true;                // طلباتُ الإقلاع بالطريق (my_workspace…)
  await h.u.start();
  check("الإقلاعُ وكتاباتُه بالطريق ⇒ تُنتظر", h.posts() === 0, h.log.join(","));
  h.advance(2_000); h.io.busy = false; h.advance(500);
  check("  وتُطبَّق حين تهدأ", h.posts() === 1, h.log.join(","));
}
{
  const h = harness({ waiting: true });
  h.io.busy = true;
  await h.u.start();
  h.advance(1_000); h.touch(); h.io.busy = false; h.advance(1_000);
  check("  ولمسةٌ أثناء الانتظار ⇒ تراجع (لا تحميلَ تحت يده)", h.posts() === 0 && h.reloads() === 0, h.log.join(","));
}

console.log("▸ الحاجز: سلسلةُ ما بعد البيعة (تدقيقٌ عدائيّ — المانع)");
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.io.held = true;                // checkout ممسوك: الجرعة ثم المعزّزة ثم العملية
  check("سلسلةٌ ممسوكة ⇒ تبديلُ الصفحة لا يطبّق", h.u.pageChanged() === false, h.log.join(","));
  h.advance(30_000);
  check("  ولا يطبّق لاحقاً تحت اليد (تُتخطّى اللحظة كلُّها)", h.posts() === 0 && h.reloads() === 0, h.log.join(","));
  h.io.held = false; h.advance(1_000);
  check("  والإفلاتُ ثم تبديلٌ تالٍ ⇒ يطبّق", h.u.pageChanged() === true && h.posts() === 1, h.log.join(","));
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.io.busy = true;                // تفريغُ ملاحظةٍ لاصقة عند خروجها، أو حفظٌ لم يرجع
  h.u.pageChanged();
  h.advance(1_000);
  check("كتابةٌ بالطريق عند التبديل ⇒ تُنتظر", h.posts() === 0);
  h.io.busy = false; h.advance(300);
  check("  وتهدأ خلال ٣ ثوانٍ ⇒ يطبّق", h.posts() === 1, h.log.join(","));
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.io.busy = true;
  h.u.pageChanged();
  h.advance(5_000); h.io.busy = false; h.advance(5_000);
  check("  ولا تهدأ ⇒ تُتخطّى هذه اللحظة", h.posts() === 0 && h.reloads() === 0, h.log.join(","));
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.io.busy = true;
  h.u.pageChanged();
  h.advance(500); h.touch(); h.io.busy = false; h.advance(1_000);
  check("  ولمسةٌ بالصفحة الجديدة أثناء الانتظار ⇒ تراجع", h.posts() === 0, h.log.join(","));
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.advance(1_000);
  h.u.pageChanged();               // طُلب التخطّي
  h.advance(300); h.touch();       // كتب بالصفحة الجديدة قبل الاستيلاء
  h.controllerChange();
  check("لمسةٌ بين طلب التخطّي والاستيلاء ⇒ لا تحميل (يُحمَّل بلحظةٍ تالية)", h.reloads() === 0, h.log.join(","));
  check("  والحالةُ «استُولي»", h.u.state === "taken", h.u.state);
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.advance(1_000);
  h.u.pageChanged();
  h.io.busy = true;                // الصفحةُ الجديدة بدأت كتابةً قبل الاستيلاء
  h.controllerChange();
  h.advance(1_000);
  check("كتابةٌ بالطريق عند الاستيلاء ⇒ يُنتظر التحميل", h.reloads() === 0);
  h.io.busy = false; h.advance(300);
  check("  ويحمّل حين تهدأ (ولا لمسة)", h.reloads() === 1, h.log.join(","));
}

console.log("▸ تبويبٌ آخر طبّقها");
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.controllerChange();            // تبويبٌ ثانٍ بدّل صفحتَه فطبّقها — هذا لم يطلب شيئاً
  check("الاستيلاءُ من تبويبٍ آخر لا يحمّل هذا التبويب", h.reloads() === 0, h.log.join(","));
  check("  والحالةُ «استُولي» (appUpdate يكتفي بتحميلٍ عاديّ)", h.u.state === "taken", h.u.state);
  h.advance(1_000);
  check("  وتبديلُ صفحتِه ⇒ تحميلٌ مباشر (بلا طلب تخطٍّ)", h.u.pageChanged() === true && h.reloads() === 1 && h.posts() === 0, h.log.join(","));
}

console.log("▸ الخمول: حاسوبُ الكاشير الذي لا يبدّل صفحتَه (تدقيقٌ عدائيّ)");
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew();
  h.advance(3 * HOUR - MIN);
  check("ظاهرٌ وخاملٌ أقلَّ من ٣ ساعات ⇒ لا", h.u.idleTick() === false && h.posts() === 0);
  h.advance(MIN);
  check("  ٣ ساعات بلا لمسة ⇒ يطبّق", h.u.idleTick() === true && h.posts() === 1, h.log.join(","));
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew(); h.io.hidden = true;
  h.advance(29 * MIN);
  check("مخفيٌّ ٢٩ دقيقة ⇒ لا", h.u.idleTick() === false);
  h.advance(MIN);
  check("  ٣٠ دقيقة ⇒ يطبّق", h.u.idleTick() === true && h.posts() === 1);
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew(); h.io.editing = true;
  h.advance(5 * HOUR);
  check("حقلٌ مركَّزٌ فيه نصّ ⇒ الخمولُ لا يطبّق فوقه", h.u.idleTick() === false && h.posts() === 0);
}
{
  const h = harness();
  await h.u.start();
  h.touch(); h.installNew(); h.controllerChange();
  h.advance(3 * HOUR);
  check("«استُولي» وخامل ⇒ تحميلٌ مباشر", h.u.idleTick() === true && h.reloads() === 1, h.log.join(","));
}

console.log("▸ التفعيلُ المؤجَّل والاحتياطيّ (تدقيقٌ عدائيّ)");
{
  const h = harness({ waiting: true });
  await h.u.start();               // طُلب التخطّي — والقديمةُ تُكمل صوراً فلا تُفعَّل
  h.advance(4_500);
  check("ما زالت تنتظر بعد ٤ ثوانٍ ⇒ لا تحميلَ على القديمة", h.reloads() === 0, h.log.join(","));
  h.touch(); h.advance(10_000);
  h.controllerChange();            // فُعِّلت متأخّرة والمستخدمُ يعمل
  check("  واستيلاؤها المتأخّر والصفحةُ ملموسة ⇒ لا تحميل", h.reloads() === 0, h.log.join(","));
  h.advance(30_000);
  check("  وتبديلُ الصفحة بعده ⇒ تحميلٌ واحد", h.u.pageChanged() === true && h.reloads() === 1, h.log.join(","));
}
{
  const h = harness({ waiting: true });
  await h.u.start();
  h.reg.waiting = null;            // فُعِّلت ولم يصل الحدث
  h.advance(4_500);
  check("فُعِّلت بلا حدث ⇒ تحميلٌ احتياطيّ واحد", h.reloads() === 1, h.log.join(","));
}

console.log("▸ أوّلُ تثبيت، ولا دوّامة");
{
  const h = harness({ controlled: false });
  await h.u.start();
  h.installNew();
  h.controllerChange();
  check("أوّلُ تثبيت ليس تحديثاً: لا تحميلَ ولا طلب", h.reloads() === 0 && h.posts() === 0, h.log.join(","));
  check("  ولا شيءَ ينتظر", h.u.state === "none" && h.u.pageChanged() === false);
}
{
  const session = new Map();
  const h = harness({ waiting: true, session });
  await h.u.start();
  check("طُلب التخطّي مرّة", h.posts() === 1);
  const h2 = harness({ waiting: true, session, t0: 1_005_000 });   // إقلاعٌ تالٍ بعد ٥ ثوانٍ
  await h2.u.start();
  check("  والإقلاعُ بعده بثوانٍ لا يعيد المحاولة", h2.posts() === 0 && h2.reloads() === 0, h2.log.join(","));
  h2.touch(); h2.advance(40_000);
  check("  وبعد ٣٠ ثانية تُطبَّق عند تبديل الصفحة", h2.u.pageChanged() === true && h2.posts() === 1, h2.log.join(","));
}

console.log("▸ inflight: عدّادُ الكتابات والإمساك");
{
  const origFetch = globalThis.fetch;
  const pending = [];
  globalThis.fetch = () => new Promise((res) => pending.push(res));
  const t0 = Date.now();
  check("لا شيء ⇒ هادئ", inf.writesBusy(t0 + 10 * 60_000) === false);
  void inf.trackedFetch("https://x.supabase.co/rest/v1/pets?select=*", { method: "GET" });
  check("قراءةٌ (GET) لا تُعدّ", inf.writesBusy(Date.now() + 10 * 60_000) === false);
  const w = inf.trackedFetch("https://x.supabase.co/rest/v1/rpc/administer_vaccination", { method: "POST" });
  check("كتابةٌ (POST) بالطريق ⇒ مشغول", inf.writesBusy(Date.now() + 10 * 60_000) === true);
  pending.forEach((r) => r(new Response("{}")));
  await w;
  check("  وبعد رجوعها مشغولٌ لحظةَ الهدوء", inf.writesBusy() === true);
  check("  ثم هادئ بعد الهدوء", inf.writesBusy(Date.now() + inf.QUIET_MS + 10) === false);
  const rel = inf.holdUpdates();
  check("إمساكٌ ⇒ مشغولٌ ومُمسَك", inf.holdsActive() && inf.writesBusy(Date.now() + 10 * 60_000));
  rel(); rel();
  check("  والإفلاتُ مرّتين يُفلت مرّةً واحدة", !inf.holdsActive());
  globalThis.fetch = origFetch;
  check("الجسرُ قبل وصول السياسة: لا شيء ولا «مستولى»", (inf.notePageChange(), true) && inf.updateTaken() === false);
  let calls = 0;
  inf.setUpdater({ pageChanged() { calls++; }, state: "taken" });
  inf.notePageChange();
  check("  وبعده يبلّغها تبديلَ الصفحة ويقول حالتَها", calls === 1 && inf.updateTaken() === true);
}

console.log("▸ الإعداد والتوصيل");
{
  const cfg = readFileSync("vite.config.ts", "utf8");
  const reg = cfg.match(/registerType:\s*"(\w+)"/)?.[1];
  check(`registerType = "prompt" (لا autoUpdate)`, reg === "prompt", reg);
  check("injectRegister: false — التسجيلُ من swUpdate وحده", /injectRegister:\s*false/.test(cfg));
  const main = readFileSync("src/main.tsx", "utf8");
  check("main.tsx لا يستورد virtual:pwa-register (مساعدُها يحمّل عند الاستيلاء)", !/virtual:pwa-register/.test(main));
  check("  ويشغّل السياسةَ قطعةً عند الإقلاع نفسِه (حزمةُ الإقلاع على سقفها)", /import\("\.\/lib\/swUpdate"\)\.then\(\(m\) => m\.startAppUpdates\(\)\)/.test(main) && !/from "\.\/lib\/swUpdate"/.test(main));
  check("  وحزمةُ الإقلاع تصلها من الجسر لا باستيرادٍ ثابت",
    ["src/App.tsx", "src/lib/appUpdate.ts", "src/contexts/AuthContext.tsx", "src/lib/supabase.ts"].every((f) => !/from "(@\/lib|\.)\/swUpdate"/.test(readFileSync(f, "utf8"))));
  const app = readFileSync("src/App.tsx", "utf8");
  const upd = app.slice(app.indexOf("function UpdateAtPageChange"), app.indexOf("return null;", app.indexOf("function UpdateAtPageChange")));
  check("App.tsx يبلّغ تبديلَ الصفحة (notePageChange)", /notePageChange\(\)/.test(upd));
  check("  ولا يطبّق على تبديلٍ يحمل تسليماً (?query أو حالةُ راوتر)", /if\s*\(\s*search\s*\|\|\s*state\s*!=\s*null\s*\)\s*return;/.test(upd)
    && upd.indexOf("search || state") < upd.indexOf("notePageChange()"));
  const sb = readFileSync("src/lib/supabase.ts", "utf8");
  check("عميلُ Supabase يعدّ كتاباتِه (trackedFetch)", /global:\s*\{\s*fetch:\s*trackedFetch\s*\}/.test(sb));
  const sale = readFileSync("src/components/retail/SaleBuilder.tsx", "utf8");
  const co = sale.slice(sale.indexOf("const checkout = async"), sale.indexOf("/* شريطُ الطلبات التي لم تُسجَّل"));
  const holdAt = co.indexOf("holdUpdates()"), lockAt = co.indexOf("inFlightRef.current = true"), medAt = co.indexOf("persistMedicalEntries");
  const finAt = co.lastIndexOf("} finally {"), relAt = co.lastIndexOf("releaseUpdates()");
  check("البيعُ يمسك من قفله إلى finally (والسلسلةُ الطبّية بينهما)", lockAt > 0 && holdAt > lockAt && medAt > holdAt && relAt > finAt && finAt > medAt, `${lockAt}/${holdAt}/${medAt}/${finAt}/${relAt}`);
  const nc = readFileSync("src/pages/NewCase.tsx", "utf8");
  check("«حالة جديدة» تمسك سلسلتَي الحفظ (تسجيلٌ ورقمٌ تسلسليّ)", (nc.match(/holdUpdates\(\)/g) ?? []).length === 2 && (nc.match(/releaseUpdates\(\);/g) ?? []).length === 2);
  const au = readFileSync("src/lib/appUpdate.ts", "utf8");
  check("قطعةٌ ناقصة بتبويبٍ «استُولي» ⇒ تحميلٌ عاديّ قبل مسح المخبأ", au.indexOf("updateTaken()") > 0 && au.indexOf("updateTaken()") < au.indexOf("caches.keys()"));

  /* كلُّ تحميلٍ للصفحة بالشِّفرة له سببٌ مسمّى هنا. تحميلٌ جديد = قرارٌ يُقرأ. */
  const ALLOWED = new Map([
    ["src/lib/swUpdate.ts", "النسخةُ الجديدة بلحظةٍ آمنة (قبل اللمس، تبديلُ الصفحة، الخمول)"],
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
