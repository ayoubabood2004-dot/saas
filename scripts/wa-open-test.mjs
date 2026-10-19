/* ============================================================================
 * «بالآيفون والآيباد التذكير ما يودّي للواتساب — بس يعطيني أتصل بالرقم» (١٩/١٠)
 *
 * المقيس قبل الكتابة: sendWhatsApp كان يسأل الخادمَ عن الحصّة (`await`) **ثم** يفتح
 * wa.me، والمخزنُ يُصفَّر بعد كلّ رسالة فكلُّ ضغطةٍ تنتظر الشبكة. وسفاري (كلُّ WebKit:
 * آيفون، آيباد، ماك) لا يفتح نافذةً إلا والضغطةُ جارية، فيمنعها بصمت — و`noopener`
 * يجعل window.open ترجع null فتحت أو مُنعت، فسُجّلت «انبعثت» وخُتم التذكيرُ «أُرسلت».
 * بالإنتاج: ٨ من ١٣ إرسالاً من أجهزة آبل أعادت نفسَ التذكير (أربعٌ بأقلّ من ثانية).
 *
 * هذا الفحص يقيس **السلوك**: متى تُفتح النافذة بالنسبة للانتظار، ومتى يُرمى، ومتى يُسجَّل.
 * ثم حارسٌ ثابت: لا نداءَ لـsendWhatsApp بعد await بنفس الدالّة، ولا catch فارغ يبلع رفضَه.
 *
 *   node scripts/wa-open-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import ts from "typescript";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const ROOT = process.cwd();

/* ── البيئة المزيّفة: نافذة، مستند، خادم، سجلّ ─────────────────────────────── */
const env = {
  clinic: "c1",
  hasServer: true,
  rpcQueue: [],          // كلُّ نداءٍ يأخذ أوّلَها: { data } أو { error } أو () => Promise
  rpcCalls: 0,
  opens: [],             // [{ url, target, features }]
  openReturns: () => ({ opener: "parent" }),
  logs: [],
  timers: [],
  listeners: { doc: {}, win: {} },
};
const on = (bag) => ({
  addEventListener: (ev, fn) => { (bag[ev] ??= new Set()).add(fn); },
  removeEventListener: (ev, fn) => { bag[ev]?.delete(fn); },
});
globalThis.document = { visibilityState: "visible", ...on(env.listeners.doc) };
globalThis.window = {
  ...on(env.listeners.win),
  open: (url, target, features) => { env.opens.push({ url, target, features }); return env.openReturns(); },
  setTimeout: (fn) => { env.timers.push(fn); return env.timers.length; },
  clearTimeout: () => {},
};
const fire = (where, ev) => { for (const fn of [...(env.listeners[where][ev] ?? [])]) fn(); };
const runTimers = () => { const t = env.timers.splice(0); for (const fn of t) fn(); };
globalThis.__waEnv = env;

const stubs = {
  "./clinicSync": `export const sb = () => globalThis.__waEnv.hasServer ? { rpc: async () => {
      const e = globalThis.__waEnv; e.rpcCalls++;
      const next = e.rpcQueue.shift() ?? { data: [{ wa_limit: null, wa_used: 0 }] };
      return typeof next === "function" ? next() : next;
    } } : null;`,
  "./clinics": `export const getActiveClinicId = () => globalThis.__waEnv.clinic;`,
  "@/i18n": `export default { t: (k, d) => d };`,
  "react": `export const useEffect = (f) => f();`,
  "./repo": `export const repo = { logWhatsApp: async (x) => { globalThis.__waEnv.logs.push(x); } };`,
};
const bundle = await esbuild.build({
  entryPoints: [join(ROOT, "src/lib/quotas.ts")],
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
  plugins: [{ name: "stubs", setup(b) {
    b.onResolve({ filter: /^(\.\/clinicSync|\.\/clinics|@\/i18n|react|\.\/repo)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: stubs[a.path], loader: "js" }));
  } }],
});
const src = bundle.outputFiles[0].text;
let gen = 0;
/** نسخةٌ جديدة من الوحدة: حالتُها (المخزن، من أجاب) تبدأ فارغة. */
const fresh = async () => {
  Object.assign(env, { clinic: "c1", hasServer: true, rpcQueue: [], rpcCalls: 0, opens: [], logs: [], timers: [] });
  env.openReturns = () => ({ opener: "parent" });
  env.listeners.doc = {}; env.listeners.win = {};
  Object.assign(globalThis.document, on(env.listeners.doc), { visibilityState: "visible" });
  Object.assign(globalThis.window, on(env.listeners.win));
  return import("data:text/javascript;base64," + Buffer.from(`${src}\n// ${++gen}`).toString("base64"));
};
const settle = () => new Promise((r) => setImmediate(r));
const row = (limit, used, extra = {}) => ({ data: [{ wa_limit: limit, wa_used: used, ...extra }] });
const msg = { phone: "9647701112222", text: "مرحبا", kind: "vaccine" };

/* ── ١) الحصّةُ معروفة ⇒ الفتحُ داخل الضغطة ─────────────────────────────── */
console.log("▸ الحصّةُ معروفة: النافذةُ تُفتح بنفس اللحظة، قبل أيّ انتظار");
{
  const Q = await fresh();
  env.rpcQueue.push(row(10, 3));
  Q.useWarmWaQuota(); await settle();
  check("التسخينُ سأل الخادمَ مرّة", env.rpcCalls === 1);
  const before = env.rpcCalls;
  const p = Q.sendWhatsApp(msg);
  check("window.open نودي **متزامناً** (قبل أن ترجع sendWhatsApp)", env.opens.length === 1);
  check("  وبلا سؤالٍ للخادم قبله", env.rpcCalls === before);
  check("  والرابطُ wa.me بالرقم والنصّ", env.opens[0]?.url === "https://wa.me/9647701112222?text=" + encodeURIComponent("مرحبا"));
  check("  وبلا noopener (وإلا ترجع null دائماً فلا يُعرف المنع)", !String(env.opens[0]?.features ?? "").includes("noopener"));
  await p;
  check("  وانسجلت مرّةً بنوعها", env.logs.length === 1 && env.logs[0].reminder_type === "vaccine");
  check("  وبعد السجل يُسأل الخادمُ عن العدّ الحقيقيّ", env.rpcCalls === before + 1);
}
{
  const Q = await fresh();
  const w = { opener: "parent" };
  env.openReturns = () => w;
  env.rpcQueue.push(row(null, 0));
  await Q.fetchQuota();
  await Q.sendWhatsApp(msg);
  check("opener يُقطع يدوياً بدل noopener", w.opener === null);
}
{
  const Q = await fresh();
  env.hasServer = false; // التجريبيّ
  const p = Q.sendWhatsApp(msg);
  check("بلا خادم (تجريبيّ) ⇒ يفتح متزامناً", env.opens.length === 1);
  await p;
}

/* ── ٢) لا نعرف بما يكفي ⇒ نسأل أوّلاً (الفحصُ قبل الفتح قاعدة) ─────────── */
console.log("▸ لا نعرف الحصّة: الخادمُ قبل الفتح، كما كان");
{
  const Q = await fresh();
  env.rpcQueue.push(row(10, 0));
  const p = Q.sendWhatsApp(msg);
  check("أوّلُ إرسالٍ بلا تسخين ⇒ لا فتحَ قبل جواب الخادم", env.opens.length === 0 && env.rpcCalls === 1);
  await p;
  check("  ثم يفتح ويسجّل", env.opens.length === 1 && env.logs.length === 1);
  const p2 = Q.sendWhatsApp(msg);
  check("  والضغطةُ التالية تجدها معروفةً فتفتح بلحظتها", env.opens.length === 2);
  await p2;
}
{
  const Q = await fresh();
  env.rpcQueue.push(row(10, 1));
  await Q.fetchQuota();
  env.clinic = "c2";
  env.rpcQueue.push(row(10, 0));
  const p = Q.sendWhatsApp(msg);
  check("جوابُ عيادةٍ أخرى لا يُعتمد ⇒ يسأل قبل الفتح", env.opens.length === 0);
  await p;
}
{
  /* الخادمُ نفسُه يرجع نهايةَ شهرٍ **ماضية** ويبقى يرجعها: 0105 بحصّةٍ بدأت ٣١/٨ ١٠:٠٠ يقول يومَ
   * ٣٠/١٠ ١٢:٠٠ إن الشهر انتهى ٣٠/١٠ ١٠:٠٠ (age() يستعير أيّام آب). وساعةُ جهازٍ متقدّمة مثلُها.
   * سؤالُه عنها كان يُبقي كلَّ ضغطةٍ بالطريق البطيء فيُمنع كلُّ فتحٍ بسفاري (تدقيقٌ عدائيّ). */
  const Q = await fresh();
  const past = { period_end: "2000-01-01T00:00:00Z" };
  env.rpcQueue.push(row(10, 1, past));
  await Q.fetchQuota();
  env.rpcQueue.push(row(10, 2, past)); // تحديثُ ما بعد السجل: الشهرُ نفسُه بنهايته الماضية
  const p = Q.sendWhatsApp(msg);
  check("نهايةُ شهرٍ ماضية والعدُّ تحت السقف ⇒ يفتح بلحظته", env.opens.length === 1);
  await p; await settle();
  const p2 = Q.sendWhatsApp(msg);
  check("  والضغطةُ التالية كذلك (لا حلقةَ «اضغط ثانية»)", env.opens.length === 2);
  await p2;
}
{
  const Q = await fresh();
  env.rpcQueue.push(row(5, 5, { period_end: "2000-01-01T00:00:00Z" }));
  await Q.fetchQuota();
  env.rpcQueue.push(row(5, 0, { period_end: "2999-01-01T00:00:00Z" })); // شهرٌ جديد
  const p = Q.sendWhatsApp(msg);
  check("بلغ السقفَ بشهرٍ مضى ⇒ يسأل قبل الرفض", env.opens.length === 0);
  await p;
  check("  ويجد شهراً جديداً فيفتح", env.opens.length === 1);
}
{
  const Q = await fresh();
  env.rpcQueue.push({ error: { message: "boom" } });
  await Q.sendWhatsApp(msg);
  check("خطأٌ ولا شيءَ معروف ⇒ بلا حدود كما كان (يفتح)", env.opens.length === 1);
  const p = Q.sendWhatsApp(msg);
  check("  والخطأُ جوابٌ مختوم: التالية تفتح بلحظتها (لا تعلق على «اضغط ثانية»)", env.opens.length === 2);
  await p;
}

/* ── ٣) السقف ─────────────────────────────────────────────────────────── */
console.log("▸ السقف: يُرفض قبل الفتح، والعدُّ المحلّيّ لا ينتظر الخادم");
{
  const Q = await fresh();
  env.rpcQueue.push(row(3, 3));
  await Q.fetchQuota();
  env.rpcQueue.push(row(3, 3));
  let err = null;
  try { await Q.sendWhatsApp(msg); } catch (e) { err = e; }
  check("بلغت السقف وأكّده الخادم ⇒ QuotaError بلا فتحٍ ولا سجلّ", err?.name === "QuotaError" && env.opens.length === 0 && env.logs.length === 0);
  check("  وquotaMessage يقولها", /ما تكدر ترسل/.test(Q.quotaMessage(err) ?? ""));
}
{
  const Q = await fresh();
  env.rpcQueue.push(row(3, 3));
  await Q.fetchQuota();
  env.rpcQueue.push(row(6, 3)); // المشغّلُ رفع السقف
  await Q.sendWhatsApp(msg);
  check("بلغته محلّياً والخادمُ يقول رُفع ⇒ يفتح", env.opens.length === 1);
}
{
  const Q = await fresh();
  env.rpcQueue.push(row(2, 1));
  await Q.fetchQuota();
  let release;
  env.rpcQueue.push(() => new Promise((r) => { release = () => r(row(2, 2)); })); // تحديثُ ما بعد السجل معلّق
  const p1 = Q.sendWhatsApp(msg);
  check("الأخيرةُ بالحصّة تفتح بلحظتها", env.opens.length === 1);
  await settle(); await settle();
  env.rpcQueue.push(row(2, 2));
  let err = null;
  try { await Q.sendWhatsApp(msg); } catch (e) { err = e; }
  check("  والتي بعدها لا تمرّ على عدٍّ قديم (العدُّ المحلّيّ) ⇒ QuotaError", err?.name === "QuotaError" && env.opens.length === 1);
  release(); await p1;
}
{
  // جوابٌ طُلب **قبل** الإرسال ووصل بعده بعدِّ ما قبله كان يمحو العدَّ المحلّيّ (تدقيقٌ عدائيّ).
  const Q = await fresh();
  env.rpcQueue.push(row(10, 9));
  await Q.fetchQuota();
  let releaseWarm, releasePost;
  env.rpcQueue.push(() => new Promise((r) => { releaseWarm = () => r(row(10, 9)); }));
  void Q.fetchQuota(true); // تسخينٌ معلّق (شاشةٌ ظهرت بعد الدقيقة)
  env.rpcQueue.push(() => new Promise((r) => { releasePost = () => r(row(10, 10)); }));
  const p1 = Q.sendWhatsApp(msg);
  check("تسخينٌ معلّق: الأخيرةُ بالحصّة تفتح", env.opens.length === 1);
  await p1; await settle();
  releaseWarm(); await settle(); await settle();
  env.rpcQueue.push(row(10, 10));
  let err = null;
  try { await Q.sendWhatsApp(msg); } catch (e) { err = e; }
  check("  ووصولُه بعدها بعدِّ ما قبلها لا يمحو عدَّها ⇒ QuotaError", err?.name === "QuotaError" && env.opens.length === 1);
  releasePost();
}
{
  const Q = await fresh();
  env.rpcQueue.push(row(10, 8));
  await Q.fetchQuota();
  let rel0, rel1;
  env.rpcQueue.push(() => new Promise((r) => { rel0 = () => r(row(10, 9)); })); // تحديثُ الأولى: يرى سجلَّها وحده
  await Q.sendWhatsApp(msg); await settle();
  env.rpcQueue.push(() => new Promise((r) => { rel1 = () => r(row(10, 10)); }));
  await Q.sendWhatsApp(msg); await settle();
  check("رسالتان متتاليتان قبل وصول أيّ تحديث ⇒ تفتحان", env.opens.length === 2);
  rel0(); await settle(); await settle();
  env.rpcQueue.push(row(10, 10));
  let err = null;
  try { await Q.sendWhatsApp(msg); } catch (e) { err = e; }
  check("  وتحديثُ الأولى يصل بعد الثانية فلا يمحو عدَّها ⇒ الثالثةُ ترفض", err?.name === "QuotaError" && env.opens.length === 2);
  rel1();
}
{
  const Q = await fresh();
  let r1, r2;
  env.rpcQueue.push(() => new Promise((r) => { r1 = r; }));
  env.rpcQueue.push(() => new Promise((r) => { r2 = r; }));
  const a = Q.fetchQuota(true), b = Q.fetchQuota(true);
  await settle();
  r2(row(10, 9)); await b;
  r1(row(10, 1)); await a;
  check("جوابٌ أقدم يصل بعد أحدث لا يكتب فوقه", (await Q.fetchQuota())?.waUsed === 9);
}
{
  const Q = await fresh();
  env.rpcQueue.push(row(3, 3));
  await Q.fetchQuota();
  env.rpcQueue.push({ error: { message: "network" } });
  let err = null;
  try { await Q.sendWhatsApp(msg); } catch (e) { err = e; }
  check("خطأٌ عابرٌ وعندنا «بلغت السقف» ⇒ يبقى مرفوضاً (القديمُ أصدقُ من «بلا حدود»)", err?.name === "QuotaError" && env.opens.length === 0);
}

/* ── ٤) المنعُ يُسمع: null بلا مغادرةٍ للصفحة ⇒ لا سجلّ ولا «أُرسلت» ───────── */
console.log("▸ المتصفّح منع الفتح: يُقال ولا يُعدّ");
{
  const Q = await fresh();
  env.openReturns = () => null;
  env.rpcQueue.push(row(null, 0));
  await Q.fetchQuota();
  const p = Q.sendWhatsApp(msg).then(() => null, (e) => e);
  await settle();
  runTimers();
  const err = await p;
  check("null ولا أثر ⇒ WaBlockedError", err?.name === "WaBlockedError");
  check("  ولا سجلّ (فلا يُختم التذكيرُ «أُرسلت»)", env.logs.length === 0);
  check("  والرسالةُ تقول ما حدث وما يُفعل", /ما انفتح الواتساب/.test(Q.quotaMessage(err) ?? "") && /مرّة ثانية/.test(Q.quotaMessage(err) ?? ""));
}
{
  const Q = await fresh();
  env.openReturns = () => null;
  env.rpcQueue.push(row(null, 0));
  await Q.fetchQuota();
  const p = Q.sendWhatsApp(msg);
  await settle();
  document.visibilityState = "hidden"; fire("doc", "visibilitychange");
  await p;
  check("null لكن الصفحةُ غابت (انتقالٌ للتطبيق) ⇒ انبعثت وتُسجَّل", env.logs.length === 1);
  check("  والمستمعون أُزيلوا", !(env.listeners.doc.visibilitychange?.size) && !(env.listeners.win.blur?.size));
}
{
  const Q = await fresh();
  env.openReturns = () => null;
  env.rpcQueue.push(row(null, 0));
  await Q.fetchQuota();
  const p = Q.sendWhatsApp(msg);
  await settle();
  fire("win", "blur");
  await p;
  check("null والنافذةُ فقدت التركيز ⇒ انبعثت", env.logs.length === 1);
}
{
  const Q = await fresh();
  env.openReturns = () => null;
  env.rpcQueue.push(row(null, 0));
  await Q.fetchQuota();
  document.visibilityState = "hidden"; // غائبةٌ من قبلُ (نافذةٌ سابقة) — ليست دليلاً
  const p = Q.sendWhatsApp(msg).then(() => null, (e) => e);
  await settle();
  runTimers();
  check("صفحةٌ غائبةٌ قبل النداء بلا حدثٍ بعده ⇒ مُنعت", (await p)?.name === "WaBlockedError" && env.logs.length === 0);
}

/* ── ٥) بحثُ جمهور الحملات ─────────────────────────────────────────────── */
console.log("▸ بحثُ الحملات: اسمُ الحيوان الآتي من التذكير يضيّق القائمة");
{
  const out = await esbuild.build({
    entryPoints: [join(ROOT, "src/lib/audienceSearch.ts")],
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    mainFields: ["module", "main"],
  });
  const A = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
  const pets = [
    { name: "Bobby", owner_name: "Maya Khalil", owner_phone: "+964 770 111 2222" },
    { name: "Francisco", owner_name: "أحمد علي", owner_phone: "07801234567" },
    { name: "لولو", owner_name: "سارة", owner_phone: "٠٧٧٠٩٩٩٨٨٨٧" },
  ];
  const hit = (q) => { const m = A.audienceMatcher(q, "+964"); return m ? pets.filter(m).map((p) => p.name) : pets.map((p) => p.name); };
  check("«Bobby» ⇒ Bobby وحده (كان: الكلّ)", JSON.stringify(hit("Bobby")) === '["Bobby"]', JSON.stringify(hit("Bobby")));
  check("  وبحالةٍ ومسافاتٍ أخرى", JSON.stringify(hit("  bobby ")) === '["Bobby"]');
  check("«احمد» يلقى «أحمد» (searchable على الطرفين)", JSON.stringify(hit("احمد")) === '["Francisco"]');
  check("«0770111» يلقى +964 770 111…", JSON.stringify(hit("0770111")) === '["Bobby"]', JSON.stringify(hit("0770111")));
  check("أرقامٌ شرقيةٌ بالسؤال وبالمخزون", JSON.stringify(hit("٠٧٧٠٩٩٩")) === '["لولو"]' && JSON.stringify(hit("0770999")) === '["لولو"]');
  check("سؤالٌ فيه أحرف لا يُجرَّب على الهاتف («Bobby2» لا يطابق كلَّ رقمٍ فيه 2)", JSON.stringify(hit("Bobby2")) === "[]");
  check("«7701112222» و«+964 7701112222» يلقيان «+964 770 111 2222»", JSON.stringify(hit("7701112222")) === '["Bobby"]' && JSON.stringify(hit("+964 7701112222")) === '["Bobby"]');
  check("سؤالٌ فارغ ⇒ الكلّ", A.audienceMatcher("   ", "+964") === null);
}

/* ── ٦) حارسٌ ثابت: لا await قبل sendWhatsApp، ولا catch فارغ يبلعها ──────── */
console.log("▸ كلُّ نداءٍ لـsendWhatsApp قبل أيّ await بدالّته، ولا يُبلع رفضُه");
/* إرسالٌ بعد حفظٍ (await) يُمنع بسفاري — طريقُه useWaAfterSave (زرٌّ يعيده بضغطةٍ جديدة)، لا
 * sendWhatsApp بعد الحفظ. ولا قائمةَ استثناء: كانت للسائقَين وصُلحا. و`catch {}` حول الإرسال
 * كان يغلق حوار التوصيل بـ«تم» والسائقُ ما وصله شيء — فيُمنع أيضاً. */
const analyze = (rel, text) => {
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, rel.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out = { calls: 0, late: [], swallowed: [] };
  const lineOf = (n) => sf.getLineAndCharacterOfPosition(n.getStart()).line + 1;
  const emptyFn = (fn) => fn && ts.isFunctionLike(fn) && fn.body && ts.isBlock(fn.body) && fn.body.statements.length === 0;
  const visit = (node) => {
    if (ts.isCallExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "sendWhatsApp") {
      out.calls++;
      let fn = node.parent;
      while (fn && !ts.isFunctionLike(fn)) fn = fn.parent;
      if (fn?.body) {
        let early = false;
        const scan = (n) => {
          if (early || (n !== fn.body && ts.isFunctionLike(n))) return; // دالّةٌ داخلية لها ضغطتُها
          if (ts.isAwaitExpression(n) && n.getEnd() <= node.getStart()) { early = true; return; }
          ts.forEachChild(n, scan);
        };
        scan(fn.body);
        if (early) out.late.push(lineOf(node));
      }
      // sendWhatsApp(…).catch(() => {})
      const pa = node.parent;
      if (ts.isPropertyAccessExpression(pa) && pa.name.text === "catch" && ts.isCallExpression(pa.parent) && emptyFn(pa.parent.arguments[0])) out.swallowed.push(lineOf(node));
      // try { … sendWhatsApp(…) … } catch {}
      for (let p = node.parent; p && p !== fn; p = p.parent) {
        if (ts.isTryStatement(p) && p.catchClause && p.catchClause.block.statements.length === 0 && node.getStart() < p.tryBlock.getEnd()) { out.swallowed.push(lineOf(node)); break; }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return out;
};
/* حارسٌ لا يرى أسوأُ من لا حارس: يُجرَّب على نصوصٍ مصنوعة قبل المستودع. */
{
  const bad1 = analyze("x.tsx", `async function f() { await save(); await sendWhatsApp(m); }`);
  const bad2 = analyze("x.tsx", `async function f() { try { await sendWhatsApp(m); } catch { /* محجوبة */ } }`);
  const bad3 = analyze("x.tsx", `const f = () => { void sendWhatsApp(m).catch(() => {}); };`);
  const ok1 = analyze("x.tsx", `async function f() { try { await sendWhatsApp(m); } catch (e) { show(e); } await later(); }`);
  const ok2 = analyze("x.tsx", `async function f() { await save(); const g = () => sendWhatsApp(m); }`);
  check("فحصٌ ذاتيّ: await قبل الإرسال يُمسك", bad1.late.length === 1);
  check("فحصٌ ذاتيّ: catch فارغ حوله يُمسك، و.catch(() => {}) كذلك", bad2.swallowed.length === 1 && bad3.swallowed.length === 1);
  check("فحصٌ ذاتيّ: await بعده، ودالّةٌ داخليةٌ لها ضغطتُها، لا يُمسكان", ok1.late.length === 0 && ok1.swallowed.length === 0 && ok2.late.length === 0);
}
const walk = (d) => readdirSync(d).flatMap((n) => {
  const p = join(d, n);
  return statSync(p).isDirectory() ? walk(p) : /\.(tsx?|jsx?)$/.test(n) ? [p] : [];
});
const files = walk(join(ROOT, "src")).filter((p) => !p.endsWith(join("lib", "quotas.ts")));
let calls = 0;
const late = [], swallowed = [];
for (const abs of files) {
  const text = readFileSync(abs, "utf8");
  if (!text.includes("sendWhatsApp(")) continue;
  const rel = relative(ROOT, abs).split("\\").join("/");
  const r = analyze(rel, text);
  calls += r.calls;
  late.push(...r.late.map((l) => `${rel}:${l}`));
  swallowed.push(...r.swallowed.map((l) => `${rel}:${l}`));
}
check(`وُجدت نداءاتٌ لتُفحص (${calls}: ثماني شاشات + useWaAfterSave)`, calls >= 9);
check("لا نداءَ لـsendWhatsApp بعد await بدالّته (بعد الحفظ: useWaAfterSave)", late.length === 0, late.join(" · "));
check("ولا catch فارغ يبلع رفضَه", swallowed.length === 0, swallowed.join(" · "));
for (const f of ["src/components/retail/CourierSwapDialog.tsx", "src/components/retail/DeliveryEditDialog.tsx"]) {
  check(`  ${f.split("/").pop()} يُبلّغ السائقَ بـuseWaAfterSave`, /useWaAfterSave\(\)/.test(readFileSync(join(ROOT, f), "utf8")));
}

/* ── ٧) useWaAfterSave: المنعُ زرٌّ يعيد الإرسالَ بضغطةٍ جديدة ─────────────── */
console.log("▸ بعد الحفظ: المنعُ يُقال باسم المستلم، وزرُّه يرسل بلحظة الضغطة");
{
  const H = { sends: 0, warmed: 0, toasts: [], errors: [], next: [] };
  globalThis.__waHook = H;
  const hookStubs = {
    "react-i18next": `export const useTranslation = () => ({ t: (k, o) => typeof o === "string" ? o : String(o?.defaultValue ?? k).replace("{{name}}", o?.name ?? "") });`,
    "@/components/ui": `export const useToast = () => ({ toast: (x) => globalThis.__waHook.toasts.push(x), error: (x) => globalThis.__waHook.errors.push(x) });`,
    "@/lib/quotas": `export const sendWhatsApp = () => { const h = globalThis.__waHook; h.sends++; const n = h.next.shift(); return n ? Promise.reject(n) : Promise.resolve(); };
      export const quotaMessage = (e) => e?.name === "QuotaError" ? "QUOTA" : e?.name === "WaBlockedError" ? "BLOCKED" : null;
      export const useWarmWaQuota = () => { globalThis.__waHook.warmed++; };`,
  };
  const hb = await esbuild.build({
    entryPoints: [join(ROOT, "src/hooks/useWaAfterSave.ts")],
    bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
    plugins: [{ name: "stubs", setup(b) {
      b.onResolve({ filter: /^(react-i18next|@\/components\/ui|@\/lib\/quotas)$/ }, (a) => ({ path: a.path, namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, (a) => ({ contents: hookStubs[a.path], loader: "js" }));
    } }],
  });
  const W = await import("data:text/javascript;base64," + Buffer.from(hb.outputFiles[0].text).toString("base64"));
  const send = W.useWaAfterSave();
  check("يسخّن الحصّة", H.warmed === 1);
  H.next.push({ name: "WaBlockedError" });
  await send({ phone: "964770", text: "x" }, "علي");
  check("المنعُ لا يرمي، ويُقال بنصّ quotaMessage وباسم المستلم", H.toasts.length === 1 && H.toasts[0].title === "BLOCKED" && H.toasts[0].description === "علي" && H.toasts[0].tone === "warn");
  const before = H.sends;
  H.toasts[0].action.onClick();
  check("  وزرُّه يرسل **بلحظة الضغطة** (لا انتظارَ قبله)", H.sends === before + 1);
  H.next.push({ name: "QuotaError" });
  await send({ phone: "964770", text: "x" }, "علي");
  check("الحصّةُ رسالتُها (لا زرّ)", H.errors.at(-1) === "QUOTA");
  await send({ phone: "964770", text: "x" }, "علي");
  check("النجاحُ صامت", H.toasts.length === 1 && H.errors.length === 1);
}

console.log(`\n${fails ? "✗" : "✓"} wa-open: ${passes} نجح، ${fails} فشل`);
process.exit(fails ? 1 : 0);
