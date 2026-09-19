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
const REPO = read("src/lib/repo.ts");
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
check("شاشةُ البيع تستعمله بعتبة RETURN_STALE_MS", /useRevalidateOnReturn\(/.test(RS) && /RETURN_STALE_MS/.test(RS));
check("  ولا تستبدل القائمةَ وسطَ بيعة (SaleBuilder يبلّغ انشغالَه)",
  /isBusy/.test(RS) && /onBusyChange=/.test(RS) && /onBusyChange\?\.\(/.test(SB));

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
/* حكمُ الصفر يُنادى مرّةً واحدة **وداخل الدالّة المشتركة** — لا نسخةٌ ثانية
 * بمعالج المسح تفترق عن الكرت يوماً. (الشرطُ الثاني هو ما يجعله يفشل قبل
 * الإصلاح: «مرّةً واحدة» وحدها كانت صادقةً على الشيفرة القديمة.) */
const soeStart = SB.indexOf("const sellOrExplain = async");
const soeBody = soeStart >= 0 ? SB.slice(soeStart, SB.indexOf("\n  };", soeStart)) : "";
check("حكمُ الصفر من مكانٍ واحد: zeroStockVerdict مرّةً، وداخل sellOrExplain",
  (SB.match(/zeroStockVerdict\(/g) ?? []).length === 1 && soeBody.includes("zeroStockVerdict("),
  `مرّات=${(SB.match(/zeroStockVerdict\(/g) ?? []).length} داخلها=${soeBody.includes("zeroStockVerdict(")}`);
check("السؤالُ بمعرّف المنتج — الكرتُ بلا رمزٍ ممسوح، ومنتجاتٌ بلا باركود",
  /withTimeout\(repo\.getProductById\(product\.id\), 6000\)/.test(SB));
check("الرصيدُ الطازج يرقّع صفَّ القائمة", /onFreshRow\?\.\(/.test(SB) && /onFreshRow=/.test(RS));
check("الريبو فيه getProductById بوجهيه (تجريبيّ وسحابيّ)",
  (REPO.match(/async getProductById\(/g) ?? []).length === 2);
const allow = REPO.slice(REPO.indexOf("const READ_ONLY_ALLOWED"), REPO.indexOf("export const isReadAllowed"));
check("  ومسموحٌ باشتراكٍ منتهٍ (قراءةٌ لا كتابة)", allow.includes('"getProductById"'));

/* ── ط٣: لا صمتَ عن القِدم ───────────────────────────────────────────────── */
console.log("▸ ط٣ — فشلُ التحديث يُقال: شارةُ عمرٍ وزرُّ تحديثٍ بالمكان");
check("فشلُ التحديث فوق قائمةٍ معروضة يرفع علَماً (لا صمت)", /setStaleFail\(true\)/.test(RS));
check("  والنجاحُ يُنزله", /setStaleFail\(false\)/.test(RS));
check("  وشريطٌ يحمل العمرَ وزرَّ التحديث", /data-stalestrip/.test(RS) && /pos\.staleStrip/.test(RS));
check("  وإعادةُ محاولةٍ تلقائيةٍ واحدة", /RETRY_AFTER_FAIL_MS/.test(RS));
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
const soeNow = SB.slice(SB.indexOf("const sellOrExplain = async"), SB.indexOf("\n  };", SB.indexOf("const sellOrExplain = async")));
check("sellOrExplain تشارك السؤالَ (sharedAsk) ولا ترمي السائلَ الثاني",
  /sharedAsk\(/.test(soeNow) && !/askingRef\.current\.has\(/.test(soeNow));
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
if (cc) {
  check("موزونٌ طازجٌ بصفرٍ ⇒ رفضٌ مؤكَّد (لا «رصيده تحدّث — صفر متوفّر»)",
    cc.zeroStockVerdict({ stock: 0, sold_by_weight: true }, true) === "refuse-confirmed");
  check("  وموزونٌ طازجٌ فيه كيلوات ⇒ يُباع", cc.zeroStockVerdict({ stock: 2.5, sold_by_weight: true }, true) === "sell-fresh");
}
check("sellOrExplain تبوّب بـneedsFreshCheck (لا outOfStock وحدها)", /if \(!needsFreshCheck\(product, retMode\)\)/.test(soeNow));

/* ── شاشةُ البيع بالجملة (المخزن) — نفسُ الطزاجة، ولا اقتلاعَ للإيصال ──────
 * هي نفسُ `SaleBuilder` فنالت الكرتَ الناطق تلقائياً، لكن بلا ترقيع صفٍّ (فتسأل
 * الخادمَ بكلّ ضغطة) وبلا زرّ «حدّث القائمة». والأخطر: فشلُ تحديثٍ بعد بيعةٍ جملة
 * (`onSold={load}`) يرفع `failed` فيحلّ محلّ التبويب كلِّه — فتُقتلع شاشةُ «تمّ البيع»
 * وإيصالُها من تحت يد الكاشير. نفسُ ما أُصلح بشاشة البيع قديماً. */
console.log("▸ شاشةُ البيع بالجملة — ترقيعٌ وزرّ تحديث، ولا اقتلاعَ للإيصال");
const INV = read("src/pages/Inventory.tsx").replace(/\r\n/g, "\n");
// حتى «/>» لا حتى أوّل «>»: السهمُ «=>» داخل الخصائص يقطع `[^>]*` قبل نهاية الوسم.
const wsTag = (INV.match(/<SaleBuilder\b[\s\S]*?\bwholesale\b[\s\S]*?\/>/) ?? [""])[0];
check("الجملةُ ترقّع صفَّها الطازج (onFreshRow)", /onFreshRow=/.test(wsTag));
check("  وزرُّ «حدّث القائمة» يحدّث بالمكان (onRefresh)", /onRefresh=/.test(wsTag));
const invLoad = INV.slice(INV.indexOf("const load = async () => {"), INV.indexOf("\n  useEffect(() => {", INV.indexOf("const load = async () => {")));
check("  وفشلُ التحديث بالجملة فوق قائمةٍ معروضة لا يقتلع الشاشة",
  /view === "wholesale"/.test(invLoad) && /setWsStale\(true\)/.test(invLoad));
check("  بل يقوله بشريط العمر وزرّ التحديث", /data-stalestrip/.test(INV) && /pos\.staleStrip/.test(INV) && /wsStale/.test(INV));
/* والشريطُ داخل الجملة وحدها — فالانتقالُ لتبويب المنتجات كان يعرض القائمةَ القديمة **بلا
 * أيّ إشارة** (أمسكته مراجعةٌ عدائية). خارج الجملة يصير الفشلُ صاخباً كعادة المخزن، ويُعاد الجلب. */
const leaveFx = INV.slice(INV.indexOf('if (view !== "wholesale" && wsStale)'), INV.indexOf("}, [view, wsStale]"));
check("  والخروجُ من الجملة وفشلُها قائم ⇒ فشلٌ صاخبٌ وجلبٌ فوري (لا قائمةٌ قديمة صامتة)",
  leaveFx.length > 0 && /setFailed\(true\)/.test(leaveFx) && /load\(\)/.test(leaveFx) && /setWsStale\(false\)/.test(leaveFx));
// الشرطُ كاملاً: الجملةُ **وقائمةٌ معروضة** وحدهما يُبقيان الشاشة؛ وإلا فالفشلُ الصاخب.
check("  والقائمةُ الفارغة تبقى شاشةَ الفشل الصاخبة (لا «ماكو منتجات» كاذبة)",
  /if \(view === "wholesale" && products\.length > 0\) setWsStale\(true\);\s*else setFailed\(true\);/.test(invLoad));

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

console.log(`\n${fails ? "✗" : "✓"} freshness-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
