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
