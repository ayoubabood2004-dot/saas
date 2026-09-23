/* ============================================================================
 * «امسح الزبون وخلّي السلّة» — الشكوى وما تحتها
 *
 * الشكوى (الطبيب): «أفتح البيع لمريضٍ معيّن، وبعدين أغيّر رأيي فما أريد أبيع لهذا
 * الزبون — والسلّة فيها هواية أشياء أريد أبيعها لغيره. أريد زرّاً صغيراً يمسح
 * معلومات الزبون بس، ولا يوخّر السلّة». وبالشاشة اليوم:
 *   • زرُّ التصفير الوحيد يمسح **السلّة معه**.
 *   • والزبونُ لا يروح بالتحديث: المسودّةُ ترجعه، **وجسرُ المريض يُعاد ختمُه** كلَّما
 *     رجعت الشاشة (تبديلُ تبويب يُزيلها ويعيدها) — والأسوأ أن السلّةَ تضيع حينها،
 *     لأن المسودّةَ لا تُقرأ ما دام الجسرُ قائماً، ثم تُكتب فارغةً فوق نفسها.
 *
 * والفخُّ الذي يجعل «امسح الاسم وحده» ضرراً صامتاً: سطورُ السلّة تحمل الحيوانَ الذي
 * أُضيفت له لحظةَ إضافتها، وتُكتب بسجلّه عند الإتمام (لقاح/علاج، طلبُ تحليل، عملية).
 * فبيعُها لزبونٍ آخر يهبط بسجلّ الحيوان الأوّل، وفكُّها بصمتٍ يبيعها ولا يكتبها بمكان.
 *
 *   node scripts/sale-customer-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { readFileSync, existsSync } from "node:fs";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const read = (p) => (existsSync(p) ? readFileSync(p, "utf8").replace(/\r\n/g, "\n") : "");

const SB = read("src/components/retail/SaleBuilder.tsx");
const RS = read("src/pages/RetailSales.tsx");
const en = JSON.parse(read("src/i18n/en.json"));
const ar = JSON.parse(read("src/i18n/ar.json"));

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
const built = await esbuild.build({
  stdin: { contents: 'export * from "./src/lib/saleCustomer";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stubs], logLevel: "silent",
}).catch(() => null);
const M = built ? await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64")) : null;

/* ── ما الذي يتبع الزبون؟ سلوكاً، بسلّةٍ فيها كلُّ الأصناف ─────────────────── */
console.log("▸ السطورُ التي تتبع المريض — تُقال وتُرفع، وما عداها يبقى");
check("الوحدةُ صِرفةٌ مفحوصة (src/lib/saleCustomer.ts)", !!M);
if (M) {
  const cart = [
    { id: "p:1", kind: "product", name: "رمل قطط", petId: null },
    { id: "p:2", kind: "product", name: "طوق", petId: null },
    { id: "s:99", kind: "service", name: "قصّ أظافر", petId: null },
    { id: "m:1", kind: "med", name: "لقاح سعار", petId: "pet-a", petName: "لولو", med: {} },
    { id: "m:2", kind: "med", name: "دواء بلا مريض", petId: null, med: {} },
    { id: "s:7", kind: "service", name: "تعقيم", petId: "pet-a", petName: "لولو" },
    { id: "s:lab:55", kind: "service", name: "تحليل دم", petId: null },
  ];
  const bound = M.customerBoundLines(cart).map((l) => l.id);
  check("اللقاحُ بمريضه يتبع الزبون", bound.includes("m:1"));
  check("  والخدمةُ المربوطة بمريض (عملية/تحليل يُطلب) كذلك", bound.includes("s:7"));
  check("  وبندُ المختبر الآتي بالجسر كذلك", bound.includes("s:lab:55"));
  /* سطرُ دواءٍ بلا مريض: الإتمامُ يتخطّاه (`!l.petId`) فلا يُكتب بسجلّ أحد — هو «دواءٌ
   * يُباع» كأيّ منتج. كان يُرفع بحجّة «قد يُربط بمريضٍ بضغطة»، ولا شِفرةَ تربطه بعد
   * إضافته (أمسكتها المراجعة) — فكان الزرُّ يرفع ما أراد الطبيبُ إبقاءه، والنافذةُ تقول
   * عنه «ينكتب بسجلّ حيوانه» وهو لا يُكتب بمكان. */
  check("  والدواءُ بلا مريضٍ **لا** يتبعه (لا يُكتب بسجلّ أحد)", !bound.includes("m:2"));
  check("والمنتجُ لا يتبع أحداً", !bound.includes("p:1") && !bound.includes("p:2"));
  check("  والخدمةُ بلا مريضٍ كذلك", !bound.includes("s:99"));

  const after = M.cartAfterClearCustomer(cart).map((l) => l.id);
  check("السلّةُ بعد المسح تُبقي كلَّ ما لا يتبع مريضاً", after.join(",") === "p:1,p:2,s:99,m:2");
  check("  ولا تمسّ منتجاً واحداً", after.filter((id) => id.startsWith("p:")).length === 2);
  check("  ومتساوقةٌ مع نفسها (تكرارُها لا يزيد شيئاً)",
    M.cartAfterClearCustomer(M.cartAfterClearCustomer(cart)).length === after.length);
  check("  وسلّةٌ بلا سطرٍ تابعٍ تبقى كما هي",
    M.cartAfterClearCustomer([cart[0], cart[1]]).length === 2 && M.customerBoundLines([cart[0], cart[1]]).length === 0);
}

/* ── التوصيلُ بالشاشة: ما يُمسح، وما لا يُمسّ ──────────────────────────────── */
console.log("▸ الشاشةُ: الزبونُ يروح، والسلّةُ والمرجعُ والتوصيلُ المعلَّق يبقون");
const clearAt = SB.indexOf("const clearCustomerNow = async () => {");
const clearFn = clearAt < 0 ? "" : SB.slice(clearAt, SB.indexOf("const askClearCustomer"));
check("زرٌّ صغيرٌ للزبون وحده (data-custclear)", /data-custclear type="button"/.test(SB) && /retail\.custClear"/.test(SB));
check("  يظهر حين يكون هناك زبونٌ يُمسح", /\{\(!!name\.trim\(\) \|\| !!phone\.trim\(\) \|\| salePets\.length > 0\) && \(/.test(SB));
check("المسحُ يشمل الاسمَ والهاتفَ والحيواناتِ والملاحظةَ وعنوانَ التوصيل",
  ["setName(\"\")", "setPhone(\"\")", "setSalePets([])", "setSaleNotes(\"\")", "setDAddress(\"\")", "setDZone(\"\")"]
    .every((s) => clearFn.includes(s)), clearFn.slice(0, 80));
check("  ويرفع السطورَ التابعةَ بالوحدة المفحوصة", /setCart\(\(c\) => cartAfterClearCustomer\(c\)\)/.test(clearFn));
/* ما لا يُمسّ: السلّةُ لا تُفرَّغ، وطلباتُ التوصيل المعلَّقة ليست من هذه البيعة. */
check("ولا تُفرَّغ السلّة", !/setCart\(\[\]\)/.test(clearFn));
/* والمرجعُ المعلَّق: كان «لا يُجدَّد أبداً» — فبيعةُ الزبون التالي تحمل مرجعَ محاولةٍ
 * ماتت بمهلة، و`retail_checkout` يرجّع فاتورةَ الأوّل إن انسجلت: فلوسُ الثاني تُقبض
 * ولا تُسجَّل (أمسكتها المراجعة). العقدُ الآن: يُسأل الخادم، ثم يُجدَّد — والإرجاعُ
 * الخالص يُستثنى لأن إعادتَه بمرجعه هي ما يمنع ردَّ البضاعة مرّتين. */
const pendAt = clearFn.indexOf("if (pending && !pureReturn) {");
const pendBlock = pendAt < 0 ? "" : clearFn.slice(pendAt, clearFn.indexOf("setName(\"\")"));
check("  المرجعُ المعلَّق يُسأل عنه الخادمُ قبل أن يُسلَّم لزبونٍ آخر",
  /const pending = saleRefRef\.current;/.test(clearFn) && /repo\.findInvoiceByRef\(pending\)/.test(pendBlock));
check("    وفشلُ السؤال يوقف المسحَ كلَّه (لا يُمسح شيءٌ على جوابٍ مجهول)",
  /catch \(e\) \{[\s\S]*?retail\.custClearUnsure[\s\S]*?return;\s*\}/.test(pendBlock));
check("    ثم يُجدَّد: زبونٌ آخر ⇒ بيعةٌ أخرى ⇒ مرجعٌ آخر",
  /saleRefRef\.current = null;/.test(pendBlock) && /setSaleRefSaved\(null\);/.test(pendBlock)
  && pendBlock.indexOf("findInvoiceByRef") < pendBlock.indexOf("saleRefRef.current = null;"));
check("    وإن كانت المحاولةُ قد انسجلت يُقال رقمُها — لا تبقى فاتورةٌ لا يعرفها أحد",
  /if \(prior\) \{[\s\S]*?retail\.custClearPriorSaved[\s\S]*?invoiceNo\(prior\.id\)/.test(clearFn));
check("    والإرجاعُ الخالص يحتفظ بمرجعه (إعادتُه لا تردّ البضاعةَ مرّتين)", pendAt >= 0);
check("    والزرُّ معطَّلٌ أثناء السؤال (لا سؤالان على ضغطتين)",
  /disabled=\{custClearBusy\}/.test(SB) && /loading=\{custClearBusy\}/.test(SB));

/* ── السؤالُ بالريبو: قراءةٌ تُسمَع ─────────────────────────────────────────── */
console.log("▸ findInvoiceByRef — «ما انسجلت» جوابٌ، وفشلُ الشبكة ليس «ما انسجلت»");
const REPO = read("src/lib/repo.ts");
const cloudFind = REPO.slice(REPO.indexOf("async findInvoiceByRef(ref) {"), REPO.indexOf("async findInvoiceByRef(ref) {") + 500);
check("الوضعُ التجريبيّ يطابق الخادم (نفسُ المرجع ⇒ نفسُ الفاتورة)",
  /async findInvoiceByRef\(ref: string\): Promise<Invoice \| null> \{[\s\S]{0,200}?\.find\(\(v\) => v\.client_ref === r\)/.test(REPO));
check("والسحابيُّ يرمي على الخطأ (row) لا يبتلعه (maybe)",
  /row<Invoice>\(await sbc\(\)\.from\("invoices"\)\.select\("\*"\)\.eq\("client_ref", r\)\.maybeSingle\(\)\)/.test(cloudFind)
  && !/maybe<Invoice>/.test(cloudFind));
check("  ومسموحٌ باشتراكٍ منتهٍ (قراءةٌ لا كتابة)", /"findInvoiceByRef"/.test(REPO.slice(REPO.indexOf("const READ_ONLY_ALLOWED"))));

/* ── بيعةٌ أُتمّت ليست مسودّة (قائمٌ على main قبل الزرّ، والزرُّ مدّه لجسر المريض) ─ */
console.log("▸ المسودّةُ لا تحفظ بيعةً أُتمّت");
const saveAt = SB.indexOf("saveSaleDraft(draftScope, {");
const saveEff = saveAt < 0 ? "" : SB.slice(SB.lastIndexOf("useEffect(() => {", saveAt), SB.indexOf("]);", saveAt) + 3);
check("أثرُ الحفظ يتخطّى البيعةَ المُتمَّة",
  /useEffect\(\(\) => \{\s*if \(done\) return;\s*saveSaleDraft\(draftScope/.test(saveEff), saveEff.slice(0, 90));
check("  و`done` من اعتماداته (وإلا قرأ قيمةً بائتة)", /, done\]\);$/.test(saveEff.trim()));
check("  والإتمامُ ما زال يمسح المحفوظ", /setDone\(\{ invoice, items: invItems \}\);\s*clearSaleDraft\(draftScope\);/.test(SB));

/* ── التصفيرُ الكامل يمسح كلَّ شيءٍ فعلاً ──────────────────────────────────── */
console.log("▸ التصفيرُ الكامل يرمي الجسرَ وبندَ المختبر أيضاً");
const hardFn = SB.slice(SB.indexOf("const hardReset = () => {"), SB.indexOf("const askReset"));
check("يرمي جسرَ الأب (وإلا رجع الزبونُ السابق بتبديل تبويب)", /onCustomerCleared\?\.\(\);/.test(hardFn));
check("  ويمسح بندَ المختبر (وإلا خُتم تحليلُه بيعةَ غريب)", /labIdRef\.current = null;/.test(hardFn));
check("  و«بيع جديد» بعد الإتمام يبقى على الجسر (بيعاتٌ متتالية لنفس المريض)",
  /onClick=\{\(\) => \{ playTap\(\); reset\(\); \}\}/.test(SB) && !/onCustomerCleared/.test(SB.slice(SB.lastIndexOf("const reset = () => {", SB.indexOf("const hardReset")), SB.indexOf("const hardReset"))));

/* ── تركيزُ حقل البحث بعد الجسر ─────────────────────────────────────────────── */
console.log("▸ الجسرُ يترك حقلَ البحث مركَّزاً");
const bridgeEff = SB.slice(SB.indexOf("if (!prefill || prefillApplied) return;"), SB.indexOf("}, [prefill, prefillApplied]);"));
check("المؤقّتُ لا يُلغى بتنظيف الأثر (قلبُ prefillApplied كان يُلغيه)",
  !/return \(\) => window\.clearTimeout/.test(bridgeEff) && /bridgeFocusRef\.current = window\.setTimeout/.test(bridgeEff));
check("  ويُلغى بالإزالة وحدها", /useEffect\(\(\) => \(\) => \{ if \(bridgeFocusRef\.current != null\) window\.clearTimeout\(bridgeFocusRef\.current\); \}, \[\]\);/.test(SB));

/* ── الجسرُ بأوّل رسم (قائمٌ على main قبل الزرّ) ─────────────────────────────── */
console.log("▸ الجسرُ يُقرأ بأوّل رسم — فلا يهبط على مسودّة زبونٍ آخر");
const bb = await esbuild.build({
  stdin: { contents: 'export * from "./src/lib/retailBridge";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
}).catch(() => null);
const B = bb ? await import("data:text/javascript;base64," + Buffer.from(bb.outputFiles[0].text).toString("base64")) : null;
check("الوحدةُ صِرفةٌ مفحوصة (src/lib/retailBridge.ts)", !!B);
if (B) {
  const q = (s) => B.bridgeFromParams(new URLSearchParams(s));
  check("رابطٌ بلا زبونٍ ولا مريضٍ ولا خدمة ⇒ لا جسر", q("") === null && q("tab=x") === null);
  const full = q("customer=%D8%B9%D9%84%D9%8A&phone=0770&pet=Luna&petId=p1&species=cat&service=CBC&labId=L9");
  check("  والكاملُ يُقرأ كما هو", !!full && full.prefill.name === "علي" && full.prefill.petId === "p1"
    && full.prefill.species === "cat" && full.prefill.service === "CBC" && full.prefill.labId === "L9");
  check("  ورجوعُ السجلّ يحمل المريض", !!full && full.returnPet?.id === "p1" && full.returnPet?.name === "Luna");
  check("  والنوعُ المعبوثُ به لا يُصبّ", q("pet=x&species=dragon")?.prefill.species === undefined);
  check("  وبلا معرّف مريضٍ لا رجوعَ لسجلّ", q("customer=a")?.returnPet === null);
}
check("الأبُ يقرأ الجسرَ بأوّل رسم (لا بأثرٍ بعده)",
  /const bridge0 = useRef\(bridgeFromParams\(params\)\);/.test(RS)
  && /useState<RetailPrefill \| null>\(\(\) => bridge0\.current\?\.prefill \?\? null\)/.test(RS)
  && !/useState<RetailPrefill \| null>\(null\)/.test(RS));
check("  والأثرُ ينظّف الرابطَ ولا يعيد ختمَ ما أخذه أوّلُ رسم",
  /if \(seededKey\.current === params\.toString\(\)\) \{[\s\S]*?setParams\(\{\}, \{ replace: true \}\);\s*return;/.test(RS));
check("  ولا تُمسّ طلباتُ التوصيل المعلَّقة", !/dlvFailed/.test(clearFn));
check("  ولا يُمسّ وضعُ الراجع ولا المضاعِف", !/setRetMode|setMult\(/.test(clearFn));
check("والسؤالُ يسبق الرفع حين يكون هناك ما يُرفع",
  /if \(boundLines\.length > 0\) \{ setCustClearAsk\(true\); return; \}/.test(SB) && /data-custcleargo/.test(SB));
check("  والنافذةُ تسمّي كلَّ سطرٍ يُرفع", /boundLines\.map\(\(l\) => \(/.test(SB) && /retail\.custClearHint/.test(SB));

/* ── الجسرُ ينزل مرّةً — وإلا رجع الزبونُ وضاعت السلّة ─────────────────────── */
console.log("▸ جسرُ المريض ينزل مرّةً واحدة (والمسودّةُ بعدها)");
check("الشاشةُ تسأل الأبَ: هل نزل؟", /prefillApplied = false, onPrefillApplied, onCustomerCleared/.test(SB)
  && /if \(!prefill \|\| prefillApplied\) return;/.test(SB) && /onPrefillApplied\?\.\(\);/.test(SB));
check("  والمسودّةُ تُقرأ بعد نزوله (لا تُتخطّى إلى الأبد)",
  /useState\(\(\) => \(prefill && !prefillApplied \? null : loadSaleDraft\(draftScope\)\)\)/.test(SB));
check("والأبُ يحفظ الحالةَ (تنجو من إعادة التركيب)", /const \[prefillApplied, setPrefillApplied\] = useState\(false\);/.test(RS)
  && /onPrefillApplied=\{\(\) => setPrefillApplied\(true\)\}/.test(RS));
check("  ومسحُ الزبون يرمي الجسرَ فلا يعود بتبويبٍ ولا بتحديث",
  /onCustomerCleared=\{\(\) => \{ setPrefill\(null\); setPrefillApplied\(false\); setReturnPet\(null\); \}\}/.test(RS)
  && /onCustomerCleared\?\.\(\);/.test(SB));
/* وبندُ المختبر يُختم «مفوتَر» بمرجعٍ لا بخاصّية: الخاصّيةُ تبقى بيد الأب بعد المسح،
 * فكانت بيعةُ الزبون الجديد تختم تحليلَ الزبون السابق (عيبٌ قائمٌ قبل هذا الزرّ). */
check("وختمُ «التحليل مفوتَر» من مرجعٍ يُمسح مع الزبون",
  /const labIdRef = useRef<string \| null>\(prefill\?\.labId \?\? null\);/.test(SB)
  && /if \(labIdRef\.current\) void repo\.setLabBilled\(labIdRef\.current, true\)/.test(SB)
  && !/repo\.setLabBilled\(prefill\?\.labId/.test(SB)
  && /labIdRef\.current = null;/.test(clearFn));

/* ── الترجمة: كلُّ عربيةٍ معروضة بمفتاحٍ بالملفّين ─────────────────────────── */
console.log("▸ الترجمة");
for (const k of ["custClear", "custClearTitle", "custClearHint", "custClearGo", "custCleared", "custClearedDropped", "custClearUnsure", "custClearPriorSaved"]) {
  check(`  مفتاحُ retail.${k} بالملفّين`, !!en?.retail?.[k] && !!ar?.retail?.[k]);
}

console.log(`\n${fails ? "✗" : "✓"} sale-customer-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
