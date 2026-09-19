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
  /* سطرُ دواءٍ بلا مريض: يُضاف اليوم ويُباع ولا يُكتب بسجلّ أحد — فهو «دواءٌ يُباع»
   * لا سطرٌ طبّيّ لمريض. ومع ذلك يتبع الزبونَ بحكمنا: صنفُه med يعني أنه قد يُربط
   * بمريضٍ بضغطة، وتركُه لزبونٍ آخر يفتح البابَ الذي نغلقه. */
  check("  والدواءُ بلا مريضٍ يتبعه أيضاً (صنفُه طبّيّ)", bound.includes("m:2"));
  check("والمنتجُ لا يتبع أحداً", !bound.includes("p:1") && !bound.includes("p:2"));
  check("  والخدمةُ بلا مريضٍ كذلك", !bound.includes("s:99"));

  const after = M.cartAfterClearCustomer(cart).map((l) => l.id);
  check("السلّةُ بعد المسح تُبقي كلَّ ما لا يتبع مريضاً", after.join(",") === "p:1,p:2,s:99");
  check("  ولا تمسّ منتجاً واحداً", after.filter((id) => id.startsWith("p:")).length === 2);
  check("  ومتساوقةٌ مع نفسها (تكرارُها لا يزيد شيئاً)",
    M.cartAfterClearCustomer(M.cartAfterClearCustomer(cart)).length === after.length);
  check("  وسلّةٌ بلا سطرٍ تابعٍ تبقى كما هي",
    M.cartAfterClearCustomer([cart[0], cart[1]]).length === 2 && M.customerBoundLines([cart[0], cart[1]]).length === 0);
}

/* ── التوصيلُ بالشاشة: ما يُمسح، وما لا يُمسّ ──────────────────────────────── */
console.log("▸ الشاشةُ: الزبونُ يروح، والسلّةُ والمرجعُ والتوصيلُ المعلَّق يبقون");
const clearFn = SB.slice(SB.indexOf("const clearCustomerNow = () => {"), SB.indexOf("const askClearCustomer"));
check("زرٌّ صغيرٌ للزبون وحده (data-custclear)", /data-custclear type="button"/.test(SB) && /retail\.custClear"/.test(SB));
check("  يظهر حين يكون هناك زبونٌ يُمسح", /\{\(!!name\.trim\(\) \|\| !!phone\.trim\(\) \|\| salePets\.length > 0\) && \(/.test(SB));
check("المسحُ يشمل الاسمَ والهاتفَ والحيواناتِ والملاحظةَ وعنوانَ التوصيل",
  ["setName(\"\")", "setPhone(\"\")", "setSalePets([])", "setSaleNotes(\"\")", "setDAddress(\"\")", "setDZone(\"\")"]
    .every((s) => clearFn.includes(s)), clearFn.slice(0, 80));
check("  ويرفع السطورَ التابعةَ بالوحدة المفحوصة", /setCart\(\(c\) => cartAfterClearCustomer\(c\)\)/.test(clearFn));
/* ما لا يُمسّ: السلّةُ لا تُفرَّغ، ومرجعُ البيعة لا يُجدَّد (تجديدُه وسطَ محاولةٍ
 * معلَّقة يفتح بابَ الفاتورة مرّتين)، وطلباتُ التوصيل المعلَّقة ليست من هذه البيعة. */
check("ولا تُفرَّغ السلّة", !/setCart\(\[\]\)/.test(clearFn));
check("  ولا يُجدَّد مرجعُ البيعة (لا فاتورةٌ مرّتين)", !/saleRefRef/.test(clearFn));
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
for (const k of ["custClear", "custClearTitle", "custClearHint", "custClearGo", "custCleared", "custClearedDropped"]) {
  check(`  مفتاحُ retail.${k} بالملفّين`, !!en?.retail?.[k] && !!ar?.retail?.[k]);
}

console.log(`\n${fails ? "✗" : "✓"} sale-customer-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
