/* ============================================================================
 * فحصُ طزاجة المخزون — الدفعة ١ (ط١ + ط٢ + ط٣) من docs/pos-freshness-plan.md
 *
 * الشكوى: منتجٌ بالرفّ وعدده كبير، الكاشير يمسحه فيُقال «ماكو عندك عدد»، وF5
 * يُرجعه. السببُ ثلاثُ فجواتٍ فوق بعض:
 *   ١) القائمةُ لقطةٌ بذاكرة التاب، ولا شيءَ يحدّثها حين يرجع الكاشير للتاب.
 *   ٢) كرتُ المنتج برصيدٍ محلّيٍّ صفر **زرٌّ ميّت** — لا رسالة ولا سؤالَ خادم.
 *   ٣) فشلُ التحديث فوق قائمةٍ معروضة يُبلَع بصمتٍ متعمَّد، فلا أحدَ يعرف عمرَها.
 *
 * الثوابتُ التي يحرسها هذا الملفّ:
 *   • القائمةُ إمّا طازجةٌ وإمّا تقول عمرَها — لا صمتَ عن قِدم.
 *   • رصيدُ الصفر لا يُحكم به من لقطةٍ محلّية — بأيّ مسار: الخادمُ يُسأل أوّلاً.
 *   • لا زرَّ ميّت: المعطَّلُ ببياناتٍ قديمة يفحص حقيقتَه أو يشرح نفسه.
 *
 *   node scripts/freshness-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, existsSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : "");

/* وحداتٌ صِرفة تُحمَّل بلا متصفّح. React يُستبدل بظلٍّ لأن swrCache يصدّر خطّافاً
 * بجانب دوالِّه — والفحصُ هنا للدوالّ لا للخطّاف. */
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "stub" }));
    b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({
      contents: "export const useCallback=(f)=>f;export const useEffect=()=>{};export const useRef=(v)=>({current:v});export const useState=(v)=>[v,()=>{}];",
      loader: "js",
    }));
  },
};
async function load(entry) {
  if (!existsSync(entry)) return null;
  const built = await esbuild.build({ entryPoints: [entry], bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs] });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
}

const SB = read("src/components/retail/SaleBuilder.tsx");
const RS = read("src/pages/RetailSales.tsx");
const REPO = read("src/lib/repo.ts") + "\n" + read("src/lib/repoDemo.ts");   // المرآةُ التجريبية بملفّها (خارج الإقلاع)
const TOAST = read("src/components/ui/Toast.tsx");
const HOOK = read("src/hooks/useRevalidateOnReturn.ts");
const ar = JSON.parse(read("src/i18n/ar.json"));
const en = JSON.parse(read("src/i18n/en.json"));

/* ── ط١: التابُ الراجع يسأل عن عمر قائمته ───────────────────────────────── */
console.log("▸ ط١ — التابُ الراجع يسأل عن عمر قائمته");
check("خطّافٌ عامٌّ useRevalidateOnReturn موجود", HOOK.length > 0);
check("  يسمع visibilitychange", /addEventListener\(\s*"visibilitychange"/.test(HOOK));
check("  ويسمع online", /addEventListener\(\s*"online"/.test(HOOK));
check("  وينزع المستمعَين عند الخروج",
  /removeEventListener\(\s*"visibilitychange"/.test(HOOK) && /removeEventListener\(\s*"online"/.test(HOOK));
/* التوصيلُ بنصّه الدقيق لا بوجود كلمة: فحصُ الطفرات أثبت أن «RETURN_STALE_MS موجود»
 * يمرّ على عتبةٍ مضروبةٍ بعشرين، و«isBusy موجود» يمرّ على `() => false`. */
const RSN = RS.replace(/\r\n/g, "\n");
const SBN = SB.replace(/\r\n/g, "\n");
check("شاشةُ البيع تستعمله بعتبة RETURN_STALE_MS بالضبط",
  /useRevalidateOnReturn\(\(\) => \{ void loadRef\.current\(\); \}, RETURN_STALE_MS, \{/.test(RSN));
check("  وبمفتاح لقطتها نفسها", /useRevalidateOnReturn\([\s\S]{0,120}?\n\s*key: cacheKey,/.test(RSN));
check("  ولا تستبدل القائمةَ وسطَ بيعةٍ ولا فوق جلبٍ قائم",
  /isBusy: \(\) => busyRef\.current \|\| inflightRef\.current > 0,/.test(RSN)
  && /onBusyChange=\{onBusyChange\}/.test(RSN) && /onBusyChange\?\.\(busy\)/.test(SBN));
check("  والانشغالُ لا يعلق بعد خروج الشاشة (يُنزَل عند الإزالة)",
  /useEffect\(\(\) => \(\) => \{ onBusyChange\?\.\(false\); \}, \[onBusyChange\]\);/.test(SBN));

const fr = await load("src/lib/freshness.ts");
check("قرارُ العودة وحدةٌ صِرفةٌ مفحوصة (src/lib/freshness.ts)", !!fr);
if (fr) {
  const D = (o) => fr.onReturnDecision({ visible: true, busy: false, staleMs: fr.RETURN_STALE_MS, ...o });
  check("  العتبةُ دقيقة (٦٠ ثانية)", fr.RETURN_STALE_MS === 60_000, `طلعت ${fr.RETURN_STALE_MS}`);
  check("  لقطةٌ عمرُها ٦١ث وتابٌ ظاهر ⇒ جلب", D({ ageMs: 61_000 }) === "reload");
  check("  وعند العتبة بالضبط ⇒ جلب (القديمُ ما بلغها لا ما تجاوزها)", D({ ageMs: 60_000 }) === "reload");
  check("  وعمرُها ٥٩ث ⇒ لا جلب", D({ ageMs: 59_000 }) === "skip-fresh");
  check("  وتابٌ مخفيّ ⇒ لا جلب", D({ ageMs: 600_000, visible: false }) === "skip-hidden");
  check("  وبيعةٌ جارية ⇒ لا استبدالَ للقائمة", D({ ageMs: 600_000, busy: true }) === "skip-busy");
  check("  ولقطةٌ لم تُجلب قطّ ⇒ جلب", D({ ageMs: Infinity }) === "reload");
}

/* ── الخطّافُ يُشغَّل فعلاً ──────────────────────────────────────────────────
 * كان الخطّافُ يُفحص بنصّه وحده (addEventListener موجود؟ setInterval موجود؟) — وفحصُ
 * الطفرات أثبت ثمانيَ كسراتٍ تمرّ خضراء: عمرٌ يُحسب صفراً فلا جلبَ أبداً، مستمعٌ
 * مسجَّلٌ لا يفعل شيئاً، مؤقّتٌ لا يُمسح. فهنا يُشغَّل بـReact ظلٍّ (useEffect يجري
 * فوراً ويحفظ تنظيفه) وdocument/window مزيّفين وساعةٍ بيدنا. */
console.log("▸ ط١/ط٥ — الخطّافُ يُشغَّل: مستمعون ومؤقّتٌ وساعةٌ مزيّفة");
const hookStubs = {
  name: "hook-stubs",
  setup(b) {
    b.onResolve({ filter: /^react$/ }, () => ({ path: "react", namespace: "hstub" }));
    b.onLoad({ filter: /.*/, namespace: "hstub" }, () => ({
      contents: "export const useRef=(v)=>({current:v});export const useCallback=(f)=>f;export const useState=(v)=>[v,()=>{}];"
        + "export const useEffect=(fn)=>{const c=fn();(globalThis.__fx||(globalThis.__fx=[])).push(c);};",
      loader: "js",
    }));
  },
};
const HB = await esbuild.build({
  stdin: { contents: 'export { useRevalidateOnReturn } from "./src/hooks/useRevalidateOnReturn.ts"; export { setCached, invalidate } from "./src/lib/swrCache.ts";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [hookStubs],
}).catch(() => null);
const H = HB ? await import("data:text/javascript;base64," + Buffer.from(HB.outputFiles[0].text).toString("base64")) : null;
check("الخطّافُ يُبنى ويُحمَّل", !!H);
if (H) {
  const L = { doc: new Map(), win: new Map() };
  const reg = (m) => ({
    add: (t, f) => { if (!m.has(t)) m.set(t, new Set()); m.get(t).add(f); },
    del: (t, f) => m.get(t)?.delete(f),
  });
  const timers = new Map(); let tid = 1;
  const realNow = Date.now; let now = 1_700_000_000_000; Date.now = () => now;
  const prevDoc = globalThis.document, prevWin = globalThis.window;
  globalThis.document = { visibilityState: "visible", addEventListener: reg(L.doc).add, removeEventListener: reg(L.doc).del };
  globalThis.window = {
    addEventListener: reg(L.win).add, removeEventListener: reg(L.win).del,
    setInterval: (f, ms) => { const id = tid++; timers.set(id, { f, ms }); return id; },
    clearInterval: (id) => { timers.delete(id); },
  };
  const fire = (m, t) => { for (const f of [...(m.get(t) ?? [])]) f(); };
  const count = (m) => [...m.values()].reduce((n, s) => n + s.size, 0);
  /** يركّب الخطّافَ ويرجع: عدّادَ الجلب، وفاكّاً. */
  const mount = (opts, staleMs = 60_000) => {
    globalThis.__fx = [];
    const st = { reloads: 0 };
    H.useRevalidateOnReturn(() => { st.reloads++; opts.onReload?.(); }, staleMs, opts);
    const fx = globalThis.__fx; globalThis.__fx = [];
    st.unmount = () => fx.forEach((c) => typeof c === "function" && c());
    return st;
  };
  try {
    const K = "hk";
    H.invalidate(K);
    let s = mount({ key: K });
    fire(L.doc, "visibilitychange");
    check("لقطةٌ لم تُجلب قطّ + التابُ يظهر ⇒ جلبٌ فعليّ", s.reloads === 1, `${s.reloads}`);
    s.unmount();

    H.setCached(K, {}, now - 30_000);
    s = mount({ key: K });
    fire(L.doc, "visibilitychange");
    check("  عمرُها ٣٠ث ⇒ لا جلب", s.reloads === 0, `${s.reloads}`);
    now += 31_000;
    fire(L.doc, "visibilitychange");
    check("  ومرّت الدقيقة ⇒ جلب", s.reloads === 1, `${s.reloads}`);
    fire(L.win, "online");
    check("  وعودةُ النت تسأل بنفس القرار", s.reloads === 2, `${s.reloads}`);
    document.visibilityState = "hidden";
    fire(L.doc, "visibilitychange");
    fire(L.win, "online");
    check("  والتابُ المخفيّ لا يجلب — لا ظهوراً ولا نتّاً", s.reloads === 2, `${s.reloads}`);
    document.visibilityState = "visible";
    s.unmount();
    check("  والإزالةُ تنزع المستمعَين كليهما", count(L.doc) === 0 && count(L.win) === 0, `doc=${count(L.doc)} win=${count(L.win)}`);

    s = mount({ key: K, isBusy: () => true });
    fire(L.doc, "visibilitychange");
    check("بيعةٌ جارية ⇒ لا استبدالَ للقائمة", s.reloads === 0);
    s.unmount();

    // الظهورُ والنتُّ بنفس اللحظة: الجلبُ الأوّلُ قائمٌ ⇒ الثاني يُتخطّى (inflight بـisBusy).
    let inflight = 0;
    s = mount({ key: K, isBusy: () => inflight > 0, onReload: () => { inflight++; } });
    fire(L.doc, "visibilitychange"); fire(L.win, "online");
    check("ظهورٌ ونتٌّ معاً ⇒ جلبٌ واحدٌ لا اثنان", s.reloads === 1, `${s.reloads}`);
    s.unmount();

    s = mount({ key: K, pollMs: 300_000 });
    const polls = [...timers.values()];
    check("ط٥: مؤقّتٌ واحد بـ٥ دقائق", polls.length === 1 && polls[0].ms === 300_000, JSON.stringify(polls.map((p) => p.ms)));
    polls[0]?.f();
    check("  ونبضتُه على لقطةٍ قديمة تجلب", s.reloads === 1, `${s.reloads}`);
    H.setCached(K, {}, now);
    polls[0]?.f();
    check("  وعلى لقطةٍ طازجة لا تجلب", s.reloads === 1, `${s.reloads}`);
    document.visibilityState = "hidden"; now += 400_000;
    polls[0]?.f();
    check("  ولا والتابُ مخفيّ", s.reloads === 1, `${s.reloads}`);
    document.visibilityState = "visible";
    s.unmount();
    check("  والإزالةُ تمسح المؤقّت (لا جلبَ بعد الخروج)", timers.size === 0, `${timers.size}`);

    s = mount({ key: K, enabled: false, pollMs: 300_000 });
    check("مُعطَّلٌ ⇒ لا مستمعَ ولا مؤقّت", count(L.doc) === 0 && count(L.win) === 0 && timers.size === 0);
    s.unmount();

    // الدخولُ إلى الجملة «عودة»: يُسأل فوراً عن العمر.
    now += 120_000;
    s = mount({ key: K, checkOnEnable: true });
    check("checkOnEnable: لقطةٌ عمرُها دقيقتان ⇒ جلبٌ عند التفعيل", s.reloads === 1, `${s.reloads}`);
    s.unmount();
    H.setCached(K, {}, now);
    s = mount({ key: K, checkOnEnable: true });
    check("  ولقطةٌ طازجة ⇒ لا جلب", s.reloads === 0, `${s.reloads}`);
    s.unmount();
  } finally {
    Date.now = realNow;
    globalThis.document = prevDoc; globalThis.window = prevWin;
  }
}

/* ── ط٥ (قرار المالك: استطلاعٌ كلَّ ٥ دقائق) ─────────────────────────────────
 * ط١ يجلب حين يرجع التاب. لكنّ كاشيراً يحدّق بالشاشة نفسِها ساعةً لا «يرجع» إليها —
 * والمديرُ رصّد من جهازه. فالتابُ الظاهر يُسأل كلَّ ٥ دقائق، بنفس القرار المفحوص:
 * لا أثناء بيعة، ولا جلبان معاً، ولا تابٌ مخفيّ. */
console.log("▸ ط٥ — التابُ الظاهر يتحدّث كلَّ ٥ دقائق بنفس الحراسات");
if (fr) check("  كلَّ ٥ دقائق بالضبط", fr.POLL_MS === 300_000, `طلعت ${fr.POLL_MS}`);
check("الخطّافُ يجدول استطلاعاً حين يُطلب (setInterval بـpollMs)", /setInterval\(/.test(HOOK) && /pollMs/.test(HOOK));
check("  ويمسحه عند الخروج (clearInterval)", /clearInterval\(/.test(HOOK));
check("  ويمرّ بنفس القرار (onReturnDecision) — لا بيعة، ولا جلبان، ولا تابٌ مخفيّ",
  (HOOK.match(/onReturnDecision\(/g) ?? []).length === 1 && /setInterval\(\s*check\s*,/.test(HOOK));
check("شاشةُ البيع تطلبه كلَّ POLL_MS", /pollMs:\s*POLL_MS/.test(RS));

/* ── ط٢: لا كرتَ ميّت — المسحُ والكرتُ من دالّةٍ واحدة ─────────────────── */
console.log("▸ ط٢ — لا كرتَ ميّت: المسحُ والكرتُ يسألان الخادمَ بنفس الدالّة");
check("الكرتُ لا يُعطَّل برصيدٍ محلّيّ", !/disabled=\{out\}/.test(SB));
check("  ولا يضيف مباشرةً متجاوزاً فحصَ الخادم", !/onClick=\{\(\) => \{ playTap\(\); addProduct\(p\); \}\}/.test(SB));
const defs = (SB.match(/const sellOrExplain = async/g) ?? []).length;
check("sellOrExplain معرّفةٌ مرّةً واحدة", defs === 1, `طلعت ${defs}`);
const scanBody = SB.slice(SB.indexOf("const handleScan = async"), SB.indexOf("findServiceByBarcode(code)"));
check("  والمسحُ يمرّ منها", scanBody.includes("sellOrExplain("));
const tapStart = SB.indexOf("const tapProduct = ");
const tapBody = tapStart >= 0 ? SB.slice(tapStart, SB.indexOf("\n  };", tapStart)) : "";
check("  وضغطُ الكرت يمرّ منها (tapProduct ← sellOrExplain)", tapBody.includes("sellOrExplain("));
const cardTaps = (SB.match(/onClick=\{\(\) => \{ playTap\(\); tapProduct\(p\); \}\}/g) ?? []).length;
check("  والكرتان كلاهما (المضغوط والشبكة) يناديان tapProduct", cardTaps === 2, `طلعت ${cardTaps}`);
/* الحكمُ يُنادى مرّةً واحدة **وداخل الدالّة المشتركة** — لا نسخةٌ ثانية بمعالج المسح
 * تفترق عن الكرت يوماً. والحكمُ نفسُه وحدةٌ مفحوصةٌ بسلوكها (`freshSale.ts`، أدناه). */
const soeStart = SB.indexOf("const sellOrExplain = async");
const soeBody = soeStart >= 0 ? SB.slice(soeStart, SB.indexOf("\n  };", soeStart)) : "";
check("الحكمُ من مكانٍ واحد: freshVerdict مرّةً، وداخل sellOrExplain",
  (SB.match(/freshVerdict\(/g) ?? []).length === 1 && soeBody.includes("freshVerdict(") && !/zeroStockVerdict\(/.test(SB),
  `مرّات=${(SB.match(/freshVerdict\(/g) ?? []).length} داخلها=${soeBody.includes("freshVerdict(")}`);
/* «بأي مسار» بالعقد (§١-٢) يُقاس بالنداءات لا بقائمة المسارات: كلُّ `addProduct(`
 * بالملفّ داخل sellOrExplain. مسارُ «الماسح بلع أوّل الباركود» (matchTruncatedCode)
 * كان يستدعيها مباشرةً — صنفٌ صفرٌ بالقائمة يُضاف بقطعةٍ ومعه «المتوفّر ٠ — كلُّه
 * بالسلّة»، والخادمُ لا يُسأل. قائمةُ مساراتٍ كانت ستنساه كما نُسي. */
const addCalls = [...SB.matchAll(/\baddProduct\(/g)].map((m) => m.index);
const outsideSoe = addCalls.filter((i) => i < soeStart || i > soeStart + soeBody.length).length;
check("كلُّ إضافةِ منتجٍ تمرّ من sellOrExplain — لا نداءَ لـaddProduct خارجها",
  addCalls.length >= 2 && outsideSoe === 0, `النداءات ${addCalls.length}، خارجها ${outsideSoe}`);
check("  ومسارُ ذيل الباركود (matchTruncatedCode) منها",
  /const r = await sellOrExplain\(cut, n\);/.test(SBN));
/* المضاعِفُ يُستهلك **قبل** السؤال (كان يبقى مسلَّحاً حتى ٦ ثوانٍ فيلتقطه الصنفُ التالي)،
 * ويُعاد عند الرفض ما لم يُسلَّح غيرُه — بالكرت والمسح وذيل الباركود ورمزِ الكارتون أو المغلّف (sellLevel، 0267) وزرِّ
 * «كارتونة» على البطاقة والسطر (tapPack — بيعُ كارتونٍ بلا باركود) خمستِها. */
const rearm = (SBN.match(/if \(r\.refused && armed != null\) setMult\(\(cur\) => cur \?\? armed\);/g) ?? []).length;
check("المضاعِفُ يُعاد عند الرفض بخمسة المسارات (كرت، مسح، ذيل، كارتون/مغلّف بالرمز، زرّ الكارتون)", rearm === 5, `طلعت ${rearm}`);
const tapNow = SBN.slice(SBN.indexOf("const tapProduct = "), SBN.indexOf("\n  };", SBN.indexOf("const tapProduct = ")));
check("  ويُستهلك قبل السؤال لا بعده (الكرت)",
  tapNow.indexOf("if (armed != null) setMult(null);") > 0 && tapNow.indexOf("if (armed != null) setMult(null);") < tapNow.indexOf("sellOrExplain("));
const scanMain = SBN.slice(SBN.indexOf("const armed = mult;"), SBN.indexOf("sellOrExplain(product, n, code)"));
check("  وقبل السؤال بالمسح أيضاً (والرقمُ المكتوبُ بالحقل)",
  /if \(armed != null\) setMult\(null\);\s*setQuery\(""\);/.test(scanMain));
check("السؤالُ عبر askFresh (بالمعرّف، ثم بالرمز إن غاب، وبحوض القسم) بمهلة",
  /return await withTimeout\(askFresh\(product, code, \{/.test(SBN) && /poolOf: \(s\) => repo\.getSectionPool\(s\),/.test(SBN) && /\}\), 6000\);/.test(SBN));
check("  والمسحُ يمرّر رمزَه الممسوح (الصفُّ المطويُّ يُلقى باقيه برمزه)", /sellOrExplain\(product, n, code\)/.test(SBN));
check("الجوابُ يرقّع القائمةَ مرّةً ممن سأل (صفٌّ بحوضه، أو صفٌّ غاب)",
  /if \(first && ans\.kind !== "unreachable"\) onFreshRow\?\.\(ans\);/.test(SBN) && /onFreshRow=\{patchRow\}/.test(RSN));
check("الريبو فيه getProductById وgetSectionPool بوجهيهما (تجريبيّ وسحابيّ)",
  (REPO.match(/async getProductById\(/g) ?? []).length === 2 && (REPO.match(/async getSectionPool\(/g) ?? []).length === 2);
const allow = REPO.slice(REPO.indexOf("const READ_ONLY_ALLOWED"), REPO.indexOf("export const isReadAllowed"));
check("  ومسموحان باشتراكٍ منتهٍ (قراءةٌ لا كتابة)", allow.includes('"getProductById"') && allow.includes('"getSectionPool"'));

/* ── الحكمُ بسلوكه: رصيدُ الكاشير، والصفُّ الغائب، والسطرُ عند سقفه ─────────
 * ثلاثُ فجواتٍ أمسكها تدقيقٌ عدائيّ قبل النشر — كلٌّ منها يقول للعيادة ما ليس صحيحاً:
 *  • السؤالُ كان يرجع رصيدَ الصفّ الخامّ، والكاشيرُ يبيع الصفَّ + حوضَ قسمه ⇒ «موجود بس
 *    رصيده صفر — زيد رصيده» عن منتجٍ يبيعه الخادمُ من الحوض (إدخالٌ مزدوج).
 *  • صفٌّ طُوي بتوأمه يغيب بمعرّفه ⇒ كان «رصيده صفر»، والباقي برمزه برصيدهما معاً
 *    (رجوعٌ عن main: المسحُ كان يسأل بالرمز).
 *  • سطرٌ عند سقفه بلقطةٍ قديمة ⇒ «المتوفّر ١ فقط وكلُّه بالسلّة» بلا سؤال، والكرتُ ٢٥. */
console.log("▸ الحكمُ بسلوكه — رصيدُ الكاشير، والغائبُ، والسقف");
const fs2 = await load("src/lib/freshSale.ts");
const sl = await load("src/lib/sellable.ts");
check("الوحدتان صِرفتان مفحوصتان (freshSale.ts + sellable.ts)", !!fs2 && !!sl);
if (fs2 && sl) {
  const P = (o) => ({ id: "p", name: "P", barcode: "111", stock: 0, section_id: null, ...o });
  // رصيدُ الكاشير: الصفُّ + حوضُ القسم — والقائمةُ تمرّ من المعادلة نفسها.
  const rows = sl.sellableRows([P({ id: "a", stock: 3, section_id: "s1" }), P({ id: "b", stock: 2 }), P({ id: "c", stock: 1, section_id: "s2" })],
    [{ id: "s1", pooled_stock: 50 }, { id: "s2", pooled_stock: 0 }]);
  check("رصيدُ الكاشير = الصفُّ + حوضُ قسمه", rows[0].stock === 53 && rows[1].stock === 2 && rows[2].stock === 1, rows.map((r) => r.stock).join(","));
  const PF = read("src/lib/prefetchData.ts");
  check("  وقائمةُ الكاشير تمرّ منها — لا معادلةَ ثانية", /products: sellableRows\(products, sections\)/.test(PF) && !/\(p\.stock \|\| 0\) \+/.test(PF));

  // سؤالُ الخادم (askFresh) بخادمٍ مزيّف يعدّ نداءاته.
  const calls = [];
  const deps = (db, pools = {}, fail = {}) => ({
    byId: async (id) => { calls.push(`id:${id}`); if (fail.id) throw new Error("net"); return db.find((x) => x.id === id); },
    byCode: async (c) => { calls.push(`code:${c}`); if (fail.code) throw new Error("net"); return db.find((x) => x.barcode === c || (x.alt_codes ?? []).includes(c)); },
    poolOf: async (s) => { calls.push(`pool:${s}`); if (fail.pool) throw new Error("net"); return pools[s] ?? 0; },
  });
  let a = await fs2.askFresh(P({ id: "d" }), null, deps([P({ id: "d", stock: 0, section_id: "s1" })], { s1: 50 }));
  check("askFresh: الصفُّ بمعرّفه وحوضُ قسمه معه", a.kind === "row" && a.row.id === "d" && a.pool === 50, JSON.stringify(a));
  const v1 = fs2.freshVerdict(a, { inCart: 0, localRoom: 0 });
  check("  صفٌّ صفرٌ وحوضُه ٥٠ ⇒ يُباع برصيد الكاشير ٥٠ (لا «زيد رصيده»)",
    v1.verdict === "sell-fresh" && v1.sellable?.stock === 50, JSON.stringify(v1));
  a = await fs2.askFresh(P({ id: "d" }), null, deps([P({ id: "d", stock: 0, section_id: "s1" })], { s1: 0 }));
  check("  وصفٌّ صفرٌ بلا حوض ⇒ رفضٌ مؤكَّد", fs2.freshVerdict(a, { inCart: 0, localRoom: 0 }).verdict === "refuse-confirmed");

  // صفٌّ طُوي بتوأمه: يغيب بمعرّفه، ورمزُه صار رمزاً إضافياً للباقي.
  calls.length = 0;
  const survivor = P({ id: "keep", barcode: "999", alt_codes: ["77"], stock: 30 });
  a = await fs2.askFresh(P({ id: "ghost", barcode: "77" }), "77", deps([survivor]));
  check("غائبٌ بمعرّفه ⇒ يُسأل برمزه فيُلقى الباقي", a.kind === "row" && a.row.id === "keep" && a.replaces === "ghost", JSON.stringify(a));
  check("  بالترتيب: المعرّفُ أوّلاً ثم الرمز", calls[0] === "id:ghost" && calls[1] === "code:77", calls.join(" "));
  check("  والحكمُ بيعٌ بالباقي (رصيدُهما معاً)", fs2.freshVerdict(a, { inCart: 0, localRoom: 0 }).sellable?.id === "keep");
  a = await fs2.askFresh(P({ id: "ghost", barcode: "77" }), null, deps([survivor]));
  check("  والكرتُ (بلا رمزٍ ممسوح) يسأل برمز صفّه", a.kind === "row" && a.row.id === "keep");
  calls.length = 0;
  a = await fs2.askFresh(P({ id: "gone", barcode: null }), null, deps([]));
  check("لا بمعرّفه ولا رمزَ له ⇒ «غاب» (ولا نداءَ برمزٍ فارغ)", a.kind === "gone" && !calls.some((c) => c.startsWith("code:")), calls.join(" "));
  a = await fs2.askFresh(P({ id: "gone", barcode: "5" }), "5", deps([]));
  const vg = fs2.freshVerdict(a, { inCart: 0, localRoom: 0 });
  check("  والغائبُ لا يُقال عنه «رصيده صفر» أبداً", a.kind === "gone" && vg.verdict === "refuse-gone", vg.verdict);
  for (const f of ["id", "code", "pool"]) {
    const db = f === "code" ? [] : [P({ id: "x", section_id: "s" })];
    a = await fs2.askFresh(P({ id: "x", barcode: "1" }), null, deps(db, {}, { [f]: true }));
    check(`  وفشلُ نداء ${f} ⇒ «ما وصلنا» لا «صفر» ولا «غاب»`, a.kind === "unreachable", JSON.stringify(a));
  }

  // ما وصلنا الخادم: ما تسمح به القائمةُ يُضاف، وإلا فالرسالةُ الصادقة.
  const U = { kind: "unreachable" };
  check("ما وصلنا والقائمةُ تسمح بشيء ⇒ يُضاف ما تسمح به", fs2.freshVerdict(U, { inCart: 0, localRoom: 3 }).verdict === "sell-local");
  check("  ولا شيء بالقائمة ⇒ «صفرٌ بآخر تحديث»", fs2.freshVerdict(U, { inCart: 0, localRoom: 0 }).verdict === "refuse-stale");
  check("  وسطرٌ عند سقفه ⇒ «المتوفّر N بآخر تحديث» لا «صفر»", fs2.freshVerdict(U, { inCart: 2, localRoom: 0 }).verdict === "cap-stale");
  check("  وسطرٌ قائمٌ وخادمٌ أجاب ⇒ الإضافةُ على الرصيد الطازج",
    fs2.freshVerdict({ kind: "row", row: P({ stock: 25 }), pool: 0 }, { inCart: 1, localRoom: 0 }).verdict === "sell-fresh");
  check("  وموزونٌ طازجٌ بصفر ⇒ رفضٌ مؤكَّد",
    fs2.freshVerdict({ kind: "row", row: P({ stock: 0, sold_by_weight: true }), pool: 0 }, { inCart: 0, localRoom: 0 }).verdict === "refuse-confirmed");

  // متى يُسأل الخادم: حين ترفض القائمةُ الإضافةَ أو تقصّها — لا حين يكون الصفُّ صفراً فقط.
  const N = fs2.needsServerCheck;
  check("يُسأل: صفرٌ بلا سطر", N({ stock: 0 }, null, 1) === true);
  check("  ولا يُسأل: رصيدٌ يكفي", N({ stock: 5 }, null, 1) === false);
  check("  ويُسأل: سطرٌ بلغ سقفه (١ من ١) — «المتوفّر ١ فقط» ليست حكماً نهائياً", N({ stock: 1 }, { qty: 1 }, 1) === true);
  check("  ويُسأل: مضاعِفٌ أكبرُ من الباقي (٣ + ٥ على ٥)", N({ stock: 5 }, { qty: 3 }, 5) === true);
  check("  ولا يُسأل: الراجعُ ولا المجمَّع", N({ stock: 0 }, null, 1, true) === false && N({ stock: 0, pooled: true }, null, 1) === false);
  check("  والموزونُ عند الصفر وحده", N({ stock: 0, sold_by_weight: true }, null, 1) === true && N({ stock: 2.5, sold_by_weight: true }, null, 1) === false);
  check("  وعلبةٌ ناقصةٌ فيها مفرد ⇒ لا سؤال (يُباع مفرداً)", N({ stock: 0.5, has_sub_unit: true, units_per_box: 10 }, null, 1) === false);
  check("  وأقلُّ من مفردٍ واحد ⇒ سؤال", N({ stock: 0.05, has_sub_unit: true, units_per_box: 10 }, null, 1) === true);
  check("  وبوحدة السطر القائم: ٥ مفرد من ٥ ⇒ سؤال", N({ stock: 0.5, has_sub_unit: true, units_per_box: 10 }, { qty: 5, saleUnit: "sub" }, 1) === true);

  // ترقيعُ القوائم بالجواب — بلا تجديد عمرها (الصفحتان تمرّان منها).
  const listS = [P({ id: "a", stock: 60, section_id: "s1" }), P({ id: "ghost", stock: 0 })];
  const pS = fs2.patchSellableList(listS, { kind: "row", row: P({ id: "a", stock: 0, section_id: "s1" }), pool: 40 });
  check("قائمةُ الكاشير تُرقَّع برصيد الكاشير (الصفُّ + حوضُه)", pS.find((x) => x.id === "a")?.stock === 40);
  const pM = fs2.patchSellableList(listS, { kind: "row", row: survivor, pool: 0, replaces: "ghost" });
  check("  والمطويُّ يحلّ محلَّه باقيه", !pM.some((x) => x.id === "ghost") && pM.some((x) => x.id === "keep"));
  check("  والغائبُ يُرفع فلا يُسأل عنه ثانية", !fs2.patchSellableList(listS, { kind: "gone", id: "ghost" }).some((x) => x.id === "ghost"));
  const pR = fs2.patchRawList([P({ id: "a", stock: 9, section_id: "s1" })], { kind: "row", row: P({ id: "a", stock: 0, section_id: "s1" }), pool: 40 });
  check("  وقائمةُ المخزن تُرقَّع خامّةً (رصيدُ الصفّ وحده)", pR[0].stock === 0);
  const pSec = fs2.patchSections([{ id: "s1", pooled_stock: 50 }, { id: "s2", pooled_stock: 7 }], { kind: "row", row: P({ id: "a", section_id: "s1" }), pool: 40 });
  check("  والحوضُ الطازجُ بقسمه (فكلُّ منتجٍ بالقسم يرى الرقمَ نفسه)", pSec[0].pooled_stock === 40 && pSec[1].pooled_stock === 7);
}

/* ── السلّة: سقفُ السطر يتبع القائمة، والحسابُ من السلّة الحيّة ───────────── */
console.log("▸ السلّة — السقفُ يتبع القائمة، ولا زرَّ ميّت، ومسحتان بجوابٍ واحد تُحسبان");
check("سقفُ السطر يتحدّث مع القائمة (عودة التاب، كلّ ٥ دقائق، F5 من المسودّة)",
  /const byId = new Map\(products\.map\(\(p\) => \[p\.id, p\]\)\);/.test(SBN) && /\}, \[products\]\);/.test(SBN));
check("  والإضافةُ تحمل رصيدَ صفّها إلى السطر القائم",
  /\}, n, \{ stock: p\.pooled \? null : p\.stock \}\);/.test(SBN) && /const sync = \(l: Line\): Line =>/.test(SBN));
check("مسحتان على جوابٍ واحد تُحسبان من السلّة الحيّة (لا من إغلاق الرسم)",
  /const cur = cartRef\.current;/.test(SBN) && /cartRef\.current = apply\(cur\);/.test(SBN) && !/const existing = cart\.find\(\(l\) => l\.id === id\);/.test(SBN));
check("زرُّ + فوق السقف يسأل الخادمَ قبل «لا يوجد مخزون إضافي» — بيعاً ولو «راجع» مفعّل (سطرُ بيعٍ قائم لا يصير إرجاعاً)",
  /data-qtyplus onClick=\{\(\) => \{ playTap\(\); raiseLine\(l, l\.qty \+ 1\); \}\}/.test(SBN) && /void sellOrExplain\(row, target - l\.qty, null, \{ sale: true \}\);/.test(SBN));
check("  ولوحةُ الكمية كذلك (ما فوق السقف يُرسل ويُسأل عنه)",
  /allowOver=\{l\.kind === "product" && !l\.ret && !!l\.product_id\}/.test(SBN) && /else raiseLine\(l, n\);/.test(SBN));
const QP = read("src/components/retail/QtyPad.tsx");
check("  واللوحةُ نفسُها لا تقصّ حين يُطلب ذلك", /const value = allowOver \? typed : Math\.min\(typed, cap\);/.test(QP));
check("وزرُّ الوحدة (علبة/مفرد) لا يُعطَّل برصيدٍ محلّي — يسأل الخادم",
  !/key=\{u\} type="button" disabled=/.test(SBN) && /onClick=\{\(\) => \{ playTap\(\); void switchUnit\(l, u\); \}\}/.test(SBN));
for (const k of ["retail.productGone", "retail.capStale", "retail.noWholeBox", "retail.noWholeBoxStale", "retail.unitTapToCheck", "retail.qtyPadOverCheck"]) {
  const [ns, key] = k.split(".");
  check(`  مفتاحُ ${k} مترجمٌ بالملفّين`, !!en?.[ns]?.[key] && !!ar?.[ns]?.[key]);
}

/* ── ط٣: لا صمتَ عن القِدم ───────────────────────────────────────────────── */
console.log("▸ ط٣ — فشلُ التحديث يُقال: شارةُ عمرٍ وزرُّ تحديثٍ بالمكان");
check("فشلُ التحديث فوق قائمةٍ معروضة يرفع علَماً (لا صمت)", /setStaleFail\(true\)/.test(RS));
check("  والنجاحُ يُنزله", /setStaleFail\(false\)/.test(RS));
check("  وشريطٌ يحمل العمرَ وزرَّ التحديث", /data-stalestrip/.test(RS) && /pos\.staleStrip/.test(RS));
check("  وإعادةُ محاولةٍ تلقائيةٍ واحدة", /RETRY_AFTER_FAIL_MS/.test(RS));
/* الجلباتُ تتراكب (كلَّ ٥ دقائق، بعد البيعة، الزرّ، ٣٠ث بعد فشل) وتصل بأيّ ترتيب: جلبٌ
 * بدأ قبل البيعة ووصل بعد جلبها كان يكتب رصيدَ ما قبلها ويُختم «طازجاً» عند الوصول. */
check("الأحدثُ **طلباً** يفوز: جلبٌ بدأ قبل المعروض لا يكتب فوقه",
  /if \(startedAt < shownFrom\.current\) return true;/.test(RSN) && /shownFrom\.current = startedAt;/.test(RSN));
check("  وفشلُه لا يرفع شريطاً فوق ما بعده", /if \(startedAt < shownFrom\.current\) return false;/.test(RSN));
check("  والختمُ بوقت الطلب لا الوصول", /setCached<RetailSnap>\(cacheKey, snap, startedAt\);/.test(RSN) && /setSnapAt\(startedAt\);/.test(RSN));
check("شاشةُ الفشل الكاملة لأوّل تحميلٍ وحده — لا لقائمةٍ فارغةٍ جاءت من نجاح",
  /if \(cachedAt\(cacheKey\) == null\) setFailed\(true\);\s*else setStaleFail\(true\);\s*scheduleRetry\(\);/.test(RSN)
  && !/if \(products\.length === 0\) setFailed\(true\)/.test(RSN));
const stripAt = RSN.indexOf("data-stalestrip"), sellAt = RSN.indexOf('{tab === "sell" ? (');
check("والشريطُ بكلّ تبويبٍ يعرض اللقطة (الديون والتوصيل والمرتجع والفواتير)، لا بالبيع وحده",
  stripAt > 0 && sellAt > stripAt && /\{staleFail && tab !== "reports" && \(/.test(RSN), `strip@${stripAt} sell@${sellAt}`);
/* والوقتُ بالشريط وقتُ اللقطة لا «الآن»: طفرةُ `new Date(snapAt)` ← `new Date()` مرّت
 * خضراء — قائمةٌ من ٩ صباحاً فشل تحديثُها ١ ظهراً كانت ستقول «المعروض من ١ ظهراً». */
check("  والوقتُ بالشريط وقتُ اللقطة لا الآن (البيع والجملة)",
  /formatTime\(new Date\(snapAt\)\.toISOString\(\), i18n\.language\)/.test(RSN)
  && /formatTime\(new Date\(cachedAt\(invKey\) as number\)\.toISOString\(\), i18n\.language\)/.test(read("src/pages/Inventory.tsx")));
const retryFn = RSN.slice(RSN.indexOf("const scheduleRetry = () => {"), RSN.indexOf("\n  };", RSN.indexOf("const scheduleRetry = () => {")));
check("والمحاولةُ بعد ٣٠ث لا تجري وسطَ بيعةٍ ولا فوق جلبٍ قائم",
  /if \(busyRef\.current \|\| inflightRef\.current > 0\) return;/.test(retryFn) && retryFn.indexOf("busyRef.current") < retryFn.indexOf("retriedRef.current = true"));
if (fr) check("  بعد ٣٠ ثانية", fr.RETRY_AFTER_FAIL_MS === 30_000, `طلعت ${fr.RETRY_AFTER_FAIL_MS}`);

const sc = await load("src/lib/swrCache.ts");
check("اللقطةُ تحمل وقتَ جلبها (cachedAt)", !!sc && typeof sc.cachedAt === "function");
check("  والترقيعُ يُبقي عمرَها (patchCached)", !!sc && typeof sc.patchCached === "function");
if (sc && typeof sc.cachedAt === "function" && typeof sc.patchCached === "function") {
  const realNow = Date.now;
  try {
    Date.now = () => 1_000_000;
    sc.setCached("k", { rows: [1] });
    Date.now = () => 1_900_000;               // مرّت ١٥ دقيقة
    sc.patchCached("k", (d) => ({ ...d, rows: [2] }));
    check("  ترقيعُ صفٍّ لا يجعل لقطةً عمرُها ربعُ ساعة تبدو طازجة", sc.cachedAt("k") === 1_000_000, `طلع ${sc.cachedAt("k")}`);
    check("  والبياناتُ ترقّعت فعلاً", sc.getCached("k")?.rows?.[0] === 2);
    check("  ومفتاحٌ غيرُ موجود لا يُخلق بالترقيع", (sc.patchCached("zz", (d) => d), sc.getCached("zz") === undefined));
    sc.setCached("k2", { rows: [] }, 1_234);
    check("  والختمُ يقبل وقتَ الطلب (جوابٌ بطيءٌ لا يبدو أطزجَ مما هو)", sc.cachedAt("k2") === 1_234, `طلع ${sc.cachedAt("k2")}`);
  } finally { Date.now = realNow; }
}

const staleAr = ar?.retail?.scanOutOfStockStale ?? "";
const staleEn = en?.retail?.scanOutOfStockStale ?? "";
check("«ما وصلنا الخادم» لا تأمر بتحديث الصفحة (F5 هو ما نحاربه)",
  staleAr && !staleAr.includes("الصفحة") && staleEn && !/page/i.test(staleEn), staleAr);
check("والتوستُ يقبل زرَّ فعل", /action\?:\s*\{\s*label:\s*string;\s*onClick:/.test(TOAST));
check("  ورسالةُ الرفض القديم تحمل «حدّث القائمة»", /retail\.refreshList/.test(SB));
for (const k of ["retail.refreshList", "pos.staleStrip", "pos.refreshNow", "retail.outTapToCheck"]) {
  const [ns, key] = k.split(".");
  check(`  مفتاحُ ${k} مترجمٌ بالملفّين`, !!en?.[ns]?.[key] && !!ar?.[ns]?.[key]);
}

/* ── المسحةُ الثانية لا تُرمى (مراجعةٌ عدائية على الدفعة ١) ────────────────
 * كان `sellOrExplain` يرمي بصمتٍ أيَّ سؤالٍ ثانٍ عن نفس المنتج وسؤالُه الأوّل
 * معلَّق: `refused` بلا صوتٍ ولا رسالة. علبتان من مادّةٍ «صفرٍ بالقائمة» تُمسحان
 * على نتٍ بطيء ⇒ الفاتورةُ واحدة، وعلبةٌ تخرج بلا قيد. والمسحةُ علبةٌ حقيقية.
 * فالسؤالُ للخادم يُشارَك (واحدٌ لا اثنان)، **والبيعُ لكلّ مسحة**. */
console.log("▸ سؤالٌ مشترك للخادم، وبيعٌ لكلّ مسحة");
if (fr && typeof fr.sharedAsk === "function") {
  const inflight = new Map();
  let asks = 0, release;
  const ask = () => { asks++; return new Promise((r) => { release = r; }); };
  const a = fr.sharedAsk(inflight, "x", ask);
  const b = fr.sharedAsk(inflight, "x", ask);
  check("سائلان معاً ⇒ سؤالٌ واحدٌ للخادم", asks === 1, `${asks}`);
  check("  والأوّلُ يُعرَف أوّلاً والثاني لا", a.first === true && b.first === false);
  release({ stock: 12 });
  const [ra, rb] = await Promise.all([a.promise, b.promise]);
  check("  وكلاهما يستلم الجوابَ نفسَه — لا أحدَ يُرمى", ra?.stock === 12 && rb?.stock === 12);
  await Promise.resolve();
  check("  والمعلَّقُ يُمسح بعد الجواب", !inflight.has("x"));
  fr.sharedAsk(inflight, "x", ask);
  check("  وسؤالٌ بعدها سؤالٌ جديد", asks === 2);
} else {
  check("sharedAsk موجودةٌ بـsrc/lib/freshness.ts", false);
}
const soeNow = SBN.slice(SBN.indexOf("const sellOrExplain = async"), SBN.indexOf("\n  };", SBN.indexOf("const sellOrExplain = async")));
const askSrv = SBN.slice(SBN.indexOf("const askServer = "), SBN.indexOf("const sayUnreachable"));
check("sellOrExplain تشارك السؤالَ (askServer ← sharedAsk) ولا ترمي السائلَ الثاني",
  /sharedAsk\(askingRef\.current, product\.id,/.test(askSrv) && /askServer\(product, code\)/.test(soeNow) && !/askingRef\.current\.has\(/.test(SBN));
/* الترتيبُ لا النصّ: النغمةُ **قبل** رجوع السائل الثاني، ولا شرطَ «الأوّل» يلفّها.
 * (الصياغةُ الأولى بحثت عن «if (first» فمرّت عليها طفرةٌ بـ«if (!first)» — أمسكها
 * فحصُ الطفرات.) */
const warnIdx = soeNow.indexOf("playWarning()");
const secondReturn = soeNow.indexOf("if (!first) return");
check("  والرفضُ يُسمَع لكلّ مسحة (النغمةُ قبل رجوع الثاني، ولا تُشرط بالأوّل)",
  warnIdx > 0 && secondReturn > warnIdx && !/if \(first[^)]*\)\s*\{?\s*playWarning/.test(soeNow),
  `warn@${warnIdx} secondReturn@${secondReturn}`);

/* ── الموزونُ أيضاً: «بأيّ مسار» يعني بأيّ مسار ───────────────────────────
 * الموزونُ لا يُمنع بالرصيد (كسريٌّ بطبعه) — لكنّ سقفَ منتقي الوزن هو رصيدُ الصفّ.
 * فصفٌّ بائتٌ بصفر كان يفتح منتقياً سقفُه صفرُ كيلو **بلا سؤال خادم**، والكرتُ
 * الباهتُ يعِد «اضغط ونتأكد من الخادم». نفسُ الشكوى بوجهٍ ثانٍ: كيسُ علفٍ رُصّد
 * بجهازٍ آخر ولا يُباع بالكاشير. */
console.log("▸ الموزونُ البائتُ بصفرٍ يُسأل عنه الخادمُ أيضاً");
const cc = await load("src/lib/cartCap.ts");
if (cc && typeof cc.needsFreshCheck === "function") {
  check("موزونٌ صفرٌ بالقائمة ⇒ يُسأل الخادم", cc.needsFreshCheck({ stock: 0, sold_by_weight: true }) === true);
  check("  موزونٌ فيه رصيد ⇒ لا سؤال", cc.needsFreshCheck({ stock: 2.5, sold_by_weight: true }) === false);
  check("  وضعُ الراجع لا يُسأل عنه", cc.needsFreshCheck({ stock: 0, sold_by_weight: true }, true) === false);
  check("  والمجمَّعُ لا يُسأل عنه", cc.needsFreshCheck({ stock: 0, pooled: true }) === false);
  check("  والعاديُّ الصفرُ يُسأل كما كان", cc.needsFreshCheck({ stock: 0 }) === true && cc.needsFreshCheck({ stock: 1 }) === false);
} else {
  check("needsFreshCheck موجودةٌ بـsrc/lib/cartCap.ts", false);
}
/* المفرداتُ الكاملة من رصيدٍ بالعلب (تدقيق ٢٢/١١): كلُّ بيعةٍ بالمفرد تخصم round(1/upb, 3) فينحرف الحاصل — علبةُ ٦ بعد خمس بيعاتٍ
 * ٠٫١٦٥ = ٠٫٩٩ حبّة، والفلورُ العاري رفض الحبّةَ الباقية «رصيده صفر». وحيث القسمةُ تامّة لا تسامح: نصفُ حبّةٍ نصفُ حبّة. */
console.log("▸ المفرداتُ الكاملة: انحرافُ التقريب لا يرفض حبّةً على الرفّ، والتامُّ يبقى صارماً");
if (cc && typeof cc.wholeSubUnits === "function") {
  const W = cc.wholeSubUnits;
  let s6 = 1; for (let i = 0; i < 5; i++) s6 = Math.round((s6 - Math.round((1 / 6) * 1000) / 1000) * 1000) / 1000;
  check("علبةُ ٦ بعد خمس بيعاتٍ بالحبّة (٠٫١٦٥) ⇒ حبّةٌ واحدة لا صفر", s6 === 0.165 && W(s6, 6) === 1);
  let s48 = 1; for (let i = 0; i < 47; i++) s48 = Math.round((s48 - Math.round((1 / 48) * 1000) / 1000) * 1000) / 1000;
  check("  وعلبةُ ٤٨ بعد ٤٧ بيعة (٠٫٠١٣ = ٠٫٦٢٤ حبّة) ⇒ الأخيرةُ تُباع", W(s48, 48) === 1);
  let s30 = 1; for (let i = 0; i < 30; i++) s30 = Math.round((s30 - Math.round((1 / 30) * 1000) / 1000) * 1000) / 1000;
  check("  وعلبةُ ٣٠ بيعت كلُّها (يبقى ٠٫٠١ = ٠٫٣ حبّة وهميّة) ⇒ صفرٌ لا حبّة", W(s30, 30) === 0);
  /* مراجعة ٢٢/١١: الانحرافُ يتراكم عبر العلب، واتّجاهُه بتقريب الخطوة. ٣٠ تقرّب للأسفل (٠٫٠٣٣) فالمسجَّلُ أكثرُ من الرفّ — علبتان
     بيعتا حبّةً حبّة تتركان ٠٫٠٢٠ = ٠٫٦ حبّة وهميّة، والتسامحُ الدائم كان يجعلها «حبّة» تُباع والرفُّ فارغ. */
  const sold = (boxes, upb, n) => { let s = boxes; for (let i = 0; i < n; i++) s = Math.round((s - Math.round((1 / upb) * 1000) / 1000) * 1000) / 1000; return s; };
  const s30x2 = sold(2, 30, 60);
  check("  وعلبتا ٣٠ بيعتا حبّةً حبّة (٠٫٠٢٠ = ٠٫٦ وهميّة، الخطوةُ تقرّب للأسفل) ⇒ صفرٌ لا حبّةٌ ليست بالرفّ", s30x2 === 0.02 && W(s30x2, 30) === 0, String(s30x2));
  const s28x2 = sold(2, 28, 55);
  check("  حدٌّ معلن (F04): علبتا ٢٨ بعد ٥٥ بيعة (حبّةٌ حقيقيّة باقية) — الانحرافُ يتجاوز السقف فتُرفض حتى يُخصم المفردُ بلا تقريب", s28x2 === 0.02 && W(s28x2, 28) === 0, String(s28x2));
  const tolAlways = (st, upb) => { const u = Math.round(st * upb * 1e6) / 1e6; const ex = 1000 % upb === 0; return Math.floor(u + (ex ? 0 : Math.min(0.45, 0.0005 * upb * upb))); };
  check("  وطفرةُ «التسامحُ دائماً» (القاعدةُ قبل المراجعة) تُمسك: تبيع حبّةً وهميّة من علبتي ٣٠", tolAlways(s30x2, 30) === 1);
  check("  والقسمةُ التامّة صارمة: نصفُ حبّةٍ من علبة ١٠ ليس حبّة", W(0.05, 10) === 0 && W(0.5, 10) === 5);
  check("  وضجيجُ العائم يُمحى: ٠٫٢٩ × ١٠٠ مل = ٢٩ لا ٢٨", W(0.29, 100) === 29);
  check("  والسقفُ والنفادُ يمرّان منها (unitCap / outOfStock)",
    cc.unitCap({ stock: s6, saleUnit: "sub", unitsPerBox: 6 }) === 1 && cc.outOfStock({ stock: s6, has_sub_unit: true, units_per_box: 6 }) === false
    && cc.outOfStock({ stock: 0.05, has_sub_unit: true, units_per_box: 10 }) === true);
  // طفراتٌ: الفلورُ العاري (السلوكُ القديم) والتقريبُ للأقرب دائماً — كلٌّ منهما يُسقط حالةً أعلاه.
  const floorOld = (st, upb) => Math.floor(st * upb);
  const nearest = (st, upb) => Math.round(st * upb);
  check("  طفرةُ الفلور العاري تُمسك (تقول صفراً عن حبّة)", floorOld(s6, 6) !== 1 && floorOld(0.29, 100) !== 29);
  check("  وطفرةُ «الأقرب دائماً» تُمسك (تبيع نصفَ حبّةٍ من علبةٍ تامّة)", nearest(0.05, 10) !== 0);
} else {
  check("wholeSubUnits موجودةٌ بـsrc/lib/cartCap.ts", false);
}
for (const [f, re] of [["src/components/retail/SaleBuilder.tsx", /subAvail \? wholeSubUnits\(p\.stock, p\.units_per_box as number\) < 1/], ["src/components/retail/PosCustomTabs.tsx", /subAvail \? wholeSubUnits\(p\.stock, p\.units_per_box as number\) < 1/]]) {
  check(`  وبطاقةُ «نفد» بـ${f.split("/").pop()} من الدالّة نفسِها لا ضربٍ عارٍ`, re.test(read(f)) && !/p\.stock \* \(p\.units_per_box as number\) < 1/.test(read(f)));
}
if (cc) {
  check("موزونٌ طازجٌ بصفرٍ ⇒ رفضٌ مؤكَّد (لا «رصيده تحدّث — صفر متوفّر»)",
    cc.zeroStockVerdict({ stock: 0, sold_by_weight: true }, true) === "refuse-confirmed");
  check("  وموزونٌ طازجٌ فيه كيلوات ⇒ يُباع", cc.zeroStockVerdict({ stock: 2.5, sold_by_weight: true }, true) === "sell-fresh");
}
// (`ret` = «راجع» إلا لبيعٍ يفرضه تبويبُ «الأدوية» — مشتقٌّ من retMode نفسِه داخل الدالّة.)
check("sellOrExplain تبوّب بـneedsServerCheck (الصفرُ والسقفُ معاً، والموزونُ البائت)",
  /if \(!needsServerCheck\(product, lineBefore, n, ret\)\)/.test(soeNow) && /const ret = retMode && !opt\?\.sale;/.test(soeNow));

/* ── شاشةُ البيع بالجملة (المخزن) — نفسُ الطزاجة، ولا اقتلاعَ للإيصال ──────
 * هي نفسُ `SaleBuilder` فنالت الكرتَ الناطق تلقائياً، لكن بلا ترقيع صفٍّ (فتسأل
 * الخادمَ بكلّ ضغطة) وبلا زرّ «حدّث القائمة». والأخطر: فشلُ تحديثٍ بعد بيعةٍ جملة
 * (`onSold={load}`) يرفع `failed` فيحلّ محلّ التبويب كلِّه — فتُقتلع شاشةُ «تمّ البيع»
 * وإيصالُها من تحت يد الكاشير. نفسُ ما أُصلح بشاشة البيع قديماً. */
console.log("▸ شاشةُ البيع بالجملة — ترقيعٌ وزرّ تحديث، ولا اقتلاعَ للإيصال");
const INV = read("src/pages/Inventory.tsx").replace(/\r\n/g, "\n");
// حتى «/>» لا حتى أوّل «>»: السهمُ «=>» داخل الخصائص يقطع `[^>]*` قبل نهاية الوسم.
const wsTag = (INV.match(/<SaleBuilder\b[\s\S]*?\bwholesale\b[\s\S]*?\/>/) ?? [""])[0];
check("الجملةُ ترقّع صفَّها الطازج (onFreshRow)", /onFreshRow=\{patchRow\}/.test(wsTag));
check("  وزرُّ «حدّث القائمة» يحدّث بالمكان (onRefresh)", /onRefresh=/.test(wsTag));
check("  وتبيع برصيد الكاشير (الصفُّ + حوضُ قسمه) لا بالخامّ", /products=\{sellable\}/.test(wsTag)
  && /const sellable = useMemo\(\(\) => sellableRows\(products, sections\), \[products, sections\]\);/.test(INV));
check("  وترقيعُها خامٌّ بالقائمة وحوضٌ بالأقسام", /setProducts\(\(l\) => patchRawList\(l, patch\)\);/.test(INV) && /setSections\(\(s\) => patchSections\(s, patch\)\);/.test(INV));
check("  وتبلّغ انشغالَها (لا جلبَ وسطَ بيعة)", /onBusyChange=\{onWsBusy\}/.test(wsTag));
/* ط١ + ط٥ بالجملة أيضاً: كانت تتحدّث عند الفتح وبعد البيعة وحدهما — قائمةُ الصبح ظهراً
 * بلا عمر، والخادمُ يُسأل عند الصفر وحده فالرقمُ المرتفعُ البائتُ لا يُصحَّح. */
check("  وتتحدّث بالعودة وكلَّ ٥ دقائق، والدخولُ إليها عودة",
  /useRevalidateOnReturn\(\(\) => \{ void loadRef\.current\(\); \}, RETURN_STALE_MS, \{\s*key: invKey,(?:\s*\/\/[^\n]*)?\s*isBusy: \(\) => wsBusy\.current \|\| inflight\.current > 0 \|\| [^\n]*,\s*enabled: \(view === "wholesale" && canPos && !locked\) \|\| view === "products" \|\| view === "companies",\s*pollMs: POLL_MS,\s*checkOnEnable: true,/.test(INV));
/* وتبويبا المنتجات والشركات كذلك (تدقيق ٢٢/١١): حاسوبُ المكتب على المخزن من الصبح كان يعرض «نافد» عن مادّةٍ اشتراها جهازٌ
 * آخر فتُسجَّل ثانيةً — والجلبُ بنفس الحرّاس (لا وسطَ بيعة جملة، ولا فوق جلبٍ قائم). */
check("  والمنتجاتُ والشركاتُ تتحدّث كذلك بالعودة وكلَّ ٥ دقائق (لا أرقامُ الصبح ظهراً)",
  /\|\| view === "products" \|\| view === "companies",/.test(INV));
/* ولا جلبَ تحت نافذةٍ مفتوحة (مراجعة ٢٢/١١): جلبٌ خلفيّ كان يعيد تعبئةَ «تعديل شركة» و«تعديل / جرد» الحوض بما بالقاعدة فوق ما كُتب. */
check("  ولا جلبَ خلفيّ ونافذةٌ مفتوحة (ما يُكتب فيها بيد صاحبه)",
  /isBusy: \(\) => wsBusy\.current \|\| inflight\.current > 0 \|\| \(typeof document !== "undefined" && !!document\.querySelector\?\.\('\[role="dialog"\]'\)\),/.test(INV));
{
  // جسمُ الدالّة وحدها: SectionModal تأخذ لقطةً بالحالة (editingSection) فـ[open, section] فيها سليم.
  const fnBody = (name) => { const i = INV.indexOf(`function ${name}(`); return i < 0 ? "" : INV.slice(i, INV.indexOf("\nfunction ", i + 10)); };
  const pool = fnBody("SetPoolModal"), coM = fnBody("CompanyModal");
  check("  ونافذتا «تعديل شركة» و«تعديل / جرد» تُعبّآن عند الفتح بالمعرّف لا بهويّة الكائن",
    pool.length > 0 && coM.length > 0 && /\}, \[open, section\.id\]\);/.test(pool) && !/\}, \[open, section\]\);/.test(pool)
      && /\}, \[open, company\?\.id\]\);/.test(coM) && !/\}, \[open, company\]\);/.test(coM));
}
check("  وورقةُ الجرد تُجلب لحظةَ الضغط لا من لقطة الصفحة", /<ReportButtons \/>/.test(INV) && !/<ReportButtons products=/.test(INV));
const invLoad = INV.slice(INV.indexOf("const load = async () => {"), INV.indexOf("\n  useEffect(() => {", INV.indexOf("const load = async () => {")));
check("  وفشلُ التحديث بالجملة (والمنتجات والشركات منذ جلبهما الخلفيّ) فوق لقطةٍ معروضة لا يقتلع الشاشة",
  /STALE_OK\.has\(viewRef\.current\) && cachedAt\(invKey\) != null\) setWsStale\(true\);/.test(invLoad)
    && /const STALE_OK: ReadonlySet<string> = new Set\(\["wholesale", "products", "companies"\]\);/.test(INV));
check("  وشريطُ العمر مرسومٌ بالتبويبات الثلاثة (لا قائمةٌ قديمة صامتة)", (INV.match(/\{staleStrip\}/g) ?? []).length === 3 && /const staleStrip = wsStale \? \(/.test(INV));
check("  والتبويبُ تبويبُ لحظة الوصول لا لحظة الطلب (جلبُ الفتح لا يقتلع الجملة)",
  !/\bview === "wholesale" && products\.length/.test(invLoad) && /viewRef\.current = view;/.test(INV));
check("  والأحدثُ طلباً يفوز، والختمُ بوقت الطلب",
  (invLoad.match(/if \(startedAt < shownFrom\.current\) return;/g) ?? []).length === 2 && /setCached\(invKey, \{ p, c, s \}, startedAt\);/.test(invLoad));
const invRetry = INV.slice(INV.indexOf("const scheduleRetry = () => {"), INV.indexOf("\n  };", INV.indexOf("const scheduleRetry = () => {")));
check("  ومحاولةٌ تلقائيةٌ واحدة بعد ٣٠ث — لا وسطَ بيعةٍ ولا فوق جلبٍ قائم",
  /RETRY_AFTER_FAIL_MS/.test(invRetry) && /if \(wsBusy\.current \|\| inflight\.current > 0\) return;/.test(invRetry));
check("  بل يقوله بشريط العمر وزرّ التحديث", /data-stalestrip/.test(INV) && /pos\.staleStrip/.test(INV) && /wsStale/.test(INV));
/* والشريطُ داخل الجملة وحدها — فالانتقالُ لتبويب المنتجات كان يعرض القائمةَ القديمة **بلا
 * أيّ إشارة** (أمسكته مراجعةٌ عدائية). خارج الجملة يصير الفشلُ صاخباً كعادة المخزن، ويُعاد الجلب. */
const leaveFx = INV.slice(INV.indexOf("if (!STALE_OK.has(view) && wsStale)"), INV.indexOf("}, [view, wsStale]"));
check("  والخروجُ من الجملة وفشلُها قائم ⇒ فشلٌ صاخبٌ وجلبٌ فوري (لا قائمةٌ قديمة صامتة)",
  leaveFx.length > 0 && /setFailed\(true\)/.test(leaveFx) && /load\(\)/.test(leaveFx) && /setWsStale\(false\)/.test(leaveFx));
// الشرطُ كاملاً: الجملةُ **ولقطةٌ جُلبت بنجاح** وحدهما يُبقيان الشاشة؛ وإلا فالفشلُ الصاخب.
check("  وأوّلُ تحميلٍ بلا لقطة يبقى شاشةَ الفشل الصاخبة (لا «ماكو منتجات» كاذبة)",
  /if \(STALE_OK\.has\(viewRef\.current\) && cachedAt\(invKey\) != null\) setWsStale\(true\);\s*else setFailed\(true\);\s*scheduleRetry\(\);/.test(invLoad));

/* ── ط٧: مخزنُ الحقل لا يُباع من كاشير العيادة ────────────────────────────
 * الخادمُ يستثنيه بكلّ طريقٍ اليوم (0191 — مقيسٌ حيّاً)، والوجهُ التجريبيّ محروسٌ
 * سلوكياً بـrepo-demo-test. وهنا الوجهُ السحابيّ بنصّه، وخطُّ الدفاع الأخير
 * بالواجهة: صفُّ حقلٍ يصل `addProduct` بطريقٍ يُضاف غداً يُرفض باسمه، لا يُباع. */
console.log("▸ ط٧ — مخزنُ الحقل لا يُباع من كاشير العيادة");
const REPO_N = REPO.replace(/\r\n/g, "\n");
const cloudById = REPO_N.slice(REPO_N.lastIndexOf("async getProductById(id)"), REPO_N.indexOf("\n  },", REPO_N.lastIndexOf("async getProductById(id)")));
check("السؤالُ بالمعرّف سحابياً يستثني مخزنَ الحقل", /\.is\("farm_id", null\)/.test(cloudById));
const cloudList = REPO_N.slice(REPO_N.lastIndexOf("async listProducts(clinicId)"), REPO_N.indexOf("\n  },", REPO_N.lastIndexOf("async listProducts(clinicId)")));
check("  وقائمةُ الكاشير سحابياً كذلك", /\.is\("farm_id", null\)/.test(cloudList));
const addStart = SB.indexOf("const addProduct = (p: Product");
const addBody = addStart >= 0 ? SB.slice(addStart, SB.indexOf("\n  };", addStart)) : "";
check("addProduct يرفض صفَّ حقل قبل أيّ إضافة (خطُّ الدفاع الأخير)",
  /if \(p\.farm_id\)/.test(addBody) && addBody.indexOf("p.farm_id") < addBody.indexOf("blockZeroCost"));
check("  وبرسالةٍ تسمّيه، مترجمةٍ بالملفّين", /retail\.farmProductAtTill/.test(addBody)
  && !!en?.retail?.farmProductAtTill && !!ar?.retail?.farmProductAtTill);
// «ترفض» تعني تُرجع قبل الإضافة — لا رسالةً ثم بيعاً (طفرةُ حذف `return null` مرّت خضراء).
// (الكتلةُ بنصّها وحدها — تعبيرٌ أوسع ابتلع `return null` كتلةِ الوزن التالية فمرّت الطفرة.)
const addN = addBody.replace(/\r\n/g, "\n");
const farmBlock = addN.slice(addN.indexOf("if (p.farm_id) {"), addN.indexOf("\n    }", addN.indexOf("if (p.farm_id) {")));
check("  ويرجع قبل الإضافة فعلاً (الرسالةُ وحدها لا تمنع بيعاً)",
  /toast\.error\(/.test(farmBlock) && /\n\s*return null;$/.test(farmBlock), farmBlock.slice(-40));
/* وsellOrExplain ترفضه **قبل** سؤال الخادم: السؤالُ يستثني الحقل، فصفُّ حقلٍ رصيدُه صفرٌ
 * كان يعود «لا شيء» ويُقال عنه «موجود بس رصيده صفر — زيد رصيده» عن مادّةٍ ليست بمخزن العيادة. */
check("sellOrExplain ترفض صفَّ الحقل قبل السؤال (لا «رصيده صفر» كاذبة)",
  soeNow.indexOf("if (product.farm_id)") > 0 && soeNow.indexOf("if (product.farm_id)") < soeNow.indexOf("needsServerCheck("));

/* ── السلّةُ بدفعٍ مجهول المصير لا تتعدّل: الكاتباتُ المباشرة بيد الكاشير تبدأ بالقفل (تدقيق ٢٢/١١) ─────────────────
 * الإعادةُ بالمرجع نفسِه تُرجع ما ثبت أوّلاً كما هو، فتعديلٌ بينهما يُطبع ولا يُخصم. الضغطةُ و«مسح» وإعادةُ الوزن مفحوصةٌ بسلوكها
 * (neg-stock-test ج١٠ وطفراتُها)؛ وهذه لا تمرّ من bump ولا sellOrExplain، فشيلُ قفلها لا يراه فحصُ الضغطة — تُثبَّت أنها تبدأ به. */
console.log("▸ السلّةُ بدفعٍ معلَّق لا تتعدّل — الكاتباتُ المباشرة تبدأ بالقفل");
{
  const SBn = SB.replace(/\r\n/g, "\n");
  check("cartFrozen بحكم المرجع المعلَّق من الـref (لا حالةُ رسمةٍ قديمة: إضافةٌ بالطريق تكمل بعد الفشل)",
    /const cartFrozen = \(\): boolean => \{[\s\S]{0,600}?if \(!saleRefRef\.current \|\| done\) return false;/.test(SBn));
  for (const [name, re] of [
    ["نسبةُ الراجع (pickRetPct)", /const pickRetPct = \(p: number\) => \{\n\s*if \(cartFrozen\(\)\) return;/],
    ["علبة ↔ مفرد (setSaleUnit)", /const setSaleUnit = \(id: string, unit: "box" \| "sub"\) => \{\n\s*if \(cartFrozen\(\)\) return;/],
    ["سطرُ «دواء» (addMedLine)", /const addMedLine = \(draft: MedicalDraft, price: number, qty: number\) => \{\n\s*if \(cartFrozen\(\)\) return;/],
    ["ورقةُ المستهلكات (saveCons)", /const saveCons = \([^)]*\) => \{\n\s*if \(cartFrozen\(\)\) return;/],
    ["سعرُ ما قبل الرفع على سطر الراجع (data-retprior)", /data-retprior onClick=\{\(\) => \{ if \(cartFrozen\(\)\) return;/],
    // «الدولار وحده» بالسلّة (usdIntoCart) يعيد تسعيرَ سطور الدولار بعد سؤالَين بالشبكة — المرجعُ قد يتعلّق بينهما، فالقفلُ بعدهما لا قبلهما
    ["إعادةُ تسعير سطور الدولار (usdIntoCart، بعد سؤال السعر)", /const usdIntoCart = async [\s\S]{0,2400}?if \(cartFrozen\(\)\) return;\n\s*const cur = \{ rid: r\.rate\.id[\s\S]{0,400}?setCart\(/],
  ]) check(`  ${name} يبدأ بـcartFrozen()`, re.test(SBn), name);
}

/* ── المرّةُ الواحدة (0287): «المرجعُ تغيّر» يُعرف بشكل خطأ PostgREST الحقيقيّ ───────────────────────
 * الخادمُ يرفع `raise exception 'purchase_ref_changed' using hint = …` بلا errcode، فيرجع PostgREST الرمزَ P0001
 * والاسمَ بالرسالة. isRefChanged كانت تفحص الرمزَ وحده حين يوجد — فلا تُطابق أبداً: الشاشةُ لا تُغلق ولا تقرأ ما ثبت،
 * وكلُّ حفظٍ بعدها يُرفض بالاسم نفسِه (تدقيقٌ ذاتيّ ٢٢/١١). الفحصُ يمرّ من rpcJson الحقيقيّة وعميلٍ مزيَّف يرجع ما
 * يرجعه PostgREST — لا خطأً مصنوعاً بالشكل الذي يسهّل الفحص. */
console.log("▸ المرّةُ الواحدة (0287): «المرجعُ تغيّر» يُعرف، والدالّةُ الغائبة ترجع للقديمة، والرفضُ الحقيقيّ يُرمى");
const ssStubs = {
  name: "ss-stubs",
  setup(b) {
    b.onResolve({ filter: /^\.\/(supabase|repo|clinicSync|purchaseFxApi)$/ }, (a) => ({ path: a.path.slice(2), namespace: "ss" }));
    b.onLoad({ filter: /.*/, namespace: "ss" }, (a) => ({
      loader: "js",
      contents: {
        supabase: "export const supabase = { rpc: (fn, args) => globalThis.__SS.rpc(fn, args) };",
        repo: "export const repo = { recordPurchase: async () => ({ id: 'legacy' }), addLot: async () => 'legacy-lot', returnInvoiceItems: async () => ({ id: 'legacy-inv' }) };",
        clinicSync: "export const isConfigReadOnly = () => false;",
        purchaseFxApi: "export const purchaseFx = { record: async () => ({ id: 'legacy-fx' }) };",
      }[a.path],
    }));
  },
};
let SS = null;
try {
  const built = await esbuild.build({ entryPoints: ["src/lib/stockSafetyApi.ts"], bundle: true, format: "esm", write: false, platform: "neutral", plugins: [ssStubs] });
  SS = await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
} catch (e) { check("stockSafetyApi تُحزم للفحص", false, String(e).slice(0, 300)); }
if (SS) {
  const pgrst = (code, message, hint = null) => ({ data: null, error: { code, message, details: "", hint } });
  const caught = async (p) => { try { await p; return null; } catch (e) { return e; } };
  const serve = (res) => { globalThis.__SS = { rpc: async () => res }; };
  serve(pgrst("P0001", "purchase_ref_changed", "الفاتورة انحفظت بأوّل ضغطة"));
  const e1 = await caught(SS.recordPurchaseOnce("r", [], {}, false));
  check("شراءٌ: purchase_ref_changed (P0001 والاسمُ بالرسالة) يُعرف «تغيّر»", !!e1 && SS.isRefChanged(e1), e1 ? `${e1.code}/${e1.message}` : "ما رُمي");
  check("  والتلميحُ العربيّ يصل للتوست", !!e1 && e1.hint === "الفاتورة انحفظت بأوّل ضغطة");
  serve(pgrst("P0001", "lot_ref_changed", "الدفعة انحفظت"));
  const e2 = await caught(SS.addLotOnce("r", "p", 1, null, null));
  check("  ودفعةٌ: lot_ref_changed", !!e2 && SS.isRefChanged(e2));
  serve(pgrst("P0001", "return_ref_changed", "المرتجع انحفظ"));
  const e3 = await caught(SS.returnItemsOnce("r", "i", [], null, null));
  check("  ومرتجعٌ: return_ref_changed", !!e3 && SS.isRefChanged(e3));
  serve(pgrst("P0001", "purchase_ref_gone", "ما عادت موجودة"));
  const e4 = await caught(SS.recordPurchaseOnce("r", [], {}, false));
  check("  و«الأولى ما عادت موجودة» ليست «تغيّر» (لا تُغلق الشاشةُ على ما لم يُحفظ)", !!e4 && !SS.isRefChanged(e4));
  serve(pgrst("23505", "duplicate key value violates unique constraint \"products_barcode_key\""));
  const e5 = await caught(SS.recordPurchaseOnce("r", [], {}, false));
  check("  ولا خرقُ فريدٍ عامّ", !!e5 && !SS.isRefChanged(e5));
  serve(pgrst("PGRST202", "Could not find the function public.purchase_record_once"));
  check("قاعدةٌ قبل 0287 (الدالّةُ غائبة) ⇒ الشراءُ القديم كما كان", (await SS.recordPurchaseOnce("r", [], {}, false))?.id === "legacy");
  check("  وبابُ العملتين القديم لفاتورة الدولار", (await SS.recordPurchaseOnce("r", [], {}, true))?.id === "legacy-fx");
  serve(pgrst("42883", "function lot_add_once does not exist"));
  check("  والدفعةُ كذلك (42883)", (await SS.addLotOnce("r", "p", 1, null, null)) === "legacy-lot");
  serve(pgrst("P0001", "nothing left"));
  const e7 = await caught(SS.returnItemsOnce("r", "i", [], null, null));
  check("  والرفضُ الحقيقيّ يُرمى ولا يرجع للقديمة (كان سيكتب بلا مرجع)", !!e7 && e7.message === "nothing left");
}

console.log(`\n${fails ? "✗" : "✓"} freshness-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
