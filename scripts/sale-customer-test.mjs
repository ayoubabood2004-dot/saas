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
const clearAt = SB.indexOf("const clearCustomerNow = () => {");
const clearFn = clearAt < 0 ? "" : SB.slice(clearAt, SB.indexOf("const askClearCustomer"));
check("زرٌّ صغيرٌ للزبون وحده (data-custclear)", /data-custclear type="button"/.test(SB) && /retail\.custClear"/.test(SB));
check("  يظهر حين يكون هناك زبونٌ يُمسح", /\{\(!!name\.trim\(\) \|\| !!phone\.trim\(\) \|\| salePets\.length > 0\) && \(/.test(SB));
check("المسحُ يشمل الاسمَ والهاتفَ والحيواناتِ والملاحظةَ وعنوانَ التوصيل",
  ["setName(\"\")", "setPhone(\"\")", "setSalePets([])", "setSaleNotes(\"\")", "setDAddress(\"\")", "setDZone(\"\")"]
    .every((s) => clearFn.includes(s)), clearFn.slice(0, 80));
check("  ويرفع السطورَ التابعةَ بالوحدة المفحوصة", /setCart\(\(c\) => cartAfterClearCustomer\(c\)\)/.test(clearFn));
/* ما لا يُمسّ: السلّةُ لا تُفرَّغ، وطلباتُ التوصيل المعلَّقة ليست من هذه البيعة. */
check("ولا تُفرَّغ السلّة", !/setCart\(\[\]\)/.test(clearFn));
check("  ولا تُمسّ طلباتُ التوصيل المعلَّقة", !/dlvFailed/.test(clearFn));
check("  ولا يُمسّ وضعُ الراجع ولا المضاعِف", !/setRetMode|setMult\(/.test(clearFn));
check("والسؤالُ يسبق الرفع حين يكون هناك ما يُرفع (ولا دفعةَ معلَّقة)",
  /if \(boundLines\.length > 0 && !payPending && !paying\) \{ setCustClearAsk\(true\); return; \}/.test(SB) && /data-custcleargo/.test(SB));
check("  والنافذةُ تسمّي كلَّ سطرٍ يُرفع", /boundLines\.map\(\(l\) => \(/.test(SB) && /retail\.custClearHint/.test(SB));
/* والدفعةُ المعلَّقة: كان المرجعُ «لا يُجدَّد أبداً» — فبيعةُ الزبون التالي تحمل مرجعَ
 * محاولةٍ ماتت بمهلة، و`retail_checkout` يرجّع فاتورةَ الأوّل إن انسجلت: فلوسُ الثاني
 * تُقبض ولا تُسجَّل. ثم جُرّب «اسأل الخادمَ وجدّد» فأمسكت المراجعةُ فيه تسعَ ثغرات: الشاشةُ
 * حيّةٌ ثماني ثوانٍ، و«إلغاء» لا يُلغي، والمحاولةُ قد تكون بالطريق بعد جوابِ «ما انسجلت».
 * العقدُ الآن: الزرُّ **لا يلمس المرجعَ أبداً**، ويرفض والدفعةُ معلَّقة ويقول السبب. */
check("  الزرُّ لا يلمس مرجعَ البيعة أبداً (لا إبقاءَ لغيره ولا تجديدَ أعمى)",
  clearFn !== "" && !/saleRefRef|setSaleRefSaved|findInvoiceByRef/.test(clearFn));
check("  والدفعةُ المعلَّقة: مرجعٌ محفوظ بلا إتمام، والإرجاعُ الخالص مستثنى",
  /const payPending = !!saleRefSaved && !done && !pureReturn;/.test(SB));
check("    فيرفض قبل أن يمسح شيئاً ويقول السبب",
  /^const clearCustomerNow = \(\) => \{[\s\S]*?if \(paying\) \{ setCustClearAsk\(false\); return; \}\s*if \(payPending\) \{[\s\S]*?retail\.payPending[\s\S]*?return;\s*\}/.test(clearFn)
  && clearFn.indexOf("retail.payPending") < clearFn.indexOf("setName(\"\")"));
check("    ولا نافذةَ تُفتح عليها (الرفضُ يُقال فوراً)",
  /if \(boundLines\.length > 0 && !payPending && !paying\) \{ setCustClearAsk\(true\); return; \}/.test(SB));
check("    ولا سؤالَ خادمٍ غير متزامن بقي (مصدرُ الثغرات التسع)",
  !/const clearCustomerNow = async/.test(SB) && !/custClearBusy/.test(SB)
  && !/findInvoiceByRef/.test(read("src/lib/repo.ts")));
check("  ونافذةُ التصفير تقولها قبل الضغط («ما ينحفظ شي بالفواتير» لا يصدق عليها)",
  /\{payPending && \([\s\S]{0,200}?data-resetpending[\s\S]{0,200}?retail\.payPending/.test(SB));
check("  والتبويبُ مقفولٌ والدفعُ بالطريق — **بالطلب وحده** لا بـbusy (يمتدّ لمزامنة السجلّ ~٣٦ث بعد التمام)",
  /const \[paying, setPaying\] = useState\(false\);/.test(SB) && /useEffect\(\(\) => \{ onPayingChange\?\.\(paying\); \}, \[paying, onPayingChange\]\);/.test(SB)
  && /const \[payInFlight, setPayInFlight\] = useState\(false\);/.test(RS) && /disabled=\{payInFlight && id !== tab\}/.test(RS)
  && (RS.match(/onPayingChange=\{setPayInFlight\}/g) || []).length === 2 && !/setSaleBusy/.test(RS));
check("    وزرُّ «رجوع لسجلّ» مقفولٌ أيضاً (مخرجٌ ثانٍ من الشاشة والطلبُ بالطريق)", /disabled=\{payInFlight\}/.test(RS));
check("    والطلبُ وحده ملفوف: setPaying قبل retailCheckout وبعده بـfinally",
  /setPaying\(true\);\s*try \{\s*invoice = await withTimeout\(repo\.retailCheckout\(items, meta\), 12000\);[\s\S]{0,900}?\} finally \{\s*setPaying\(false\);\s*\}/.test(SB));
check("    والزرُّ الصغير معطَّلٌ والطلبُ بالطريق", /onClick=\{askClearCustomer\}\s*disabled=\{paying\}/.test(SB));
check("  ورفضٌ حاسمٌ من الخادم يحرّر المرجع (لا «معلَّقة» للأبد)، والمجهولُ يُبقيه",
  /\} catch \(e\) \{[\s\S]{0,700}?if \(rejectedBeforeCommit\(e\)\) \{ saleRefRef\.current = null; setSaleRefSaved\(null\); \}\s*throw e;/.test(SB));

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

  /* بأيّ مسودّةٍ تبدأ الشاشة — جدولُ القرار كلُّه سلوكاً. */
  const other = { cart: ["لقاح لونا"], clientRef: null };
  const pend = { cart: ["سلّة دفعتُها ماتت بمهلة"], clientRef: "s-abc" };
  const D = typeof B.draftOnMount === "function" ? B.draftOnMount : () => "غائبة";
  check("draftOnMount: جسرٌ جديد فوق سلّة زبونٍ آخر ⇒ بيعةٌ نظيفة (لا خلط)", D(other, true) === null);
  check("  وجسرٌ جديد فوق دفعةٍ معلَّقة ⇒ تبقى بمرجعها (إعادةُ الدفع لا تسجّل مرّتين)", D(pend, true) === pend);
  check("  وبلا جسرٍ جديد ⇒ المحفوظةُ كما هي (بيعٌ عابر، أو إعادةُ تركيب)", D(other, false) === other && D(pend, false) === pend);
  check("  ولا محفوظ ⇒ لا شيء", D(null, true) === null && D(null, false) === null);
}
/* ── رفضٌ حاسم أم مصيرٌ مجهول؟ جدولُ القرار سلوكاً ─────────────────────────────
 * خطأُ التصنيف في الاتّجاه الأوّل يسجّل البيعةَ مرّتين (مرجعٌ جديد لمحاولةٍ ثُبّتت)،
 * وفي الثاني يترك الدفعةَ «معلَّقة» للأبد فيرفض الزرُّ وكلُّ جسرٍ بلا سبب. */
const eb = await esbuild.build({
  stdin: { contents: 'export * from "./src/lib/errors";', resolveDir: process.cwd(), loader: "ts" },
  bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent",
}).catch(() => null);
const E = eb ? await import("data:text/javascript;base64," + Buffer.from(eb.outputFiles[0].text).toString("base64")) : null;
const RB = E && typeof E.rejectedBeforeCommit === "function" ? E.rejectedBeforeCommit : null;
check("rejectedBeforeCommit موجودةٌ صِرفة (src/lib/errors.ts)", !!RB);
if (RB) {
  const err = (props) => Object.assign(new Error(props.message ?? "x"), props);
  check("  خطأُ بوستغريس (SQLSTATE) ⇒ حاسم: المعاملةُ تراجعت", RB(err({ code: "23503" })) && RB(err({ code: "P0001" })) && RB(err({ code: "22003" })));
  check("  وخطأُ PostgREST (PGRST…) ⇒ حاسم (جلسةٌ انتهت مثلاً)", RB(err({ code: "PGRST301" })));
  check("  واشتراكُ القراءة ⇒ حاسم (الطلبُ لم يُرسَل)", RB(err({ name: "ReadOnlyError", message: "READ_ONLY" })));
  check("  والانقطاعُ ⇒ مجهول (يُبقي المرجع)", !RB(err({ message: "TypeError: Failed to fetch" })));
  const realTimeout = await E.withTimeout(new Promise(() => {}), 5).catch((e) => e);
  check("  والمهلةُ (خطأُ withTimeout الحقيقيّ) ⇒ مجهول", !!realTimeout && E.isTimeoutError(realTimeout) && !RB(realTimeout));
  check("  وبوّابةٌ بلا رمز (5xx بعد تثبيتٍ ممكن) ⇒ مجهول", !RB(err({ message: "upstream request timeout" })) && !RB(err({ code: 504 })));
  check("  ورمزٌ لا يشبه SQLSTATE ولا PGRST ⇒ مجهول", !RB(err({ code: "ECONNRESET" })) && !RB(err({ code: "" })));
  check("  ولا شيء ⇒ مجهول", !RB(null) && !RB(undefined) && !RB("oops"));
}

check("الأبُ يقرأ الجسرَ بأوّل رسم (لا بأثرٍ بعده)",
  /const bridge0 = useRef\(bridgeFromParams\(params\)\);/.test(RS)
  && /useState<RetailPrefill \| null>\(\(\) => bridge0\.current\?\.prefill \?\? null\)/.test(RS)
  && !/useState<RetailPrefill \| null>\(null\)/.test(RS));
check("  والأثرُ ينظّف الرابطَ ولا يعيد ختمَ ما أخذه أوّلُ رسم",
  /if \(seededKey\.current === params\.toString\(\)\) \{[\s\S]*?setParams\(\{\}, \{ replace: true \}\);\s*return;/.test(RS));

/* ── الجسرُ ينزل مرّةً — وإلا رجع الزبونُ وضاعت السلّة ─────────────────────── */
console.log("▸ جسرُ المريض ينزل مرّةً واحدة (والمسودّةُ بعدها)");
check("الشاشةُ تسأل الأبَ: هل نزل؟", /prefillApplied = false, onPrefillApplied, onCustomerCleared/.test(SB)
  && /if \(!prefill \|\| prefillApplied\) return;/.test(SB) && /onPrefillApplied\?\.\(\);/.test(SB));
check("  والمسودّةُ تُقرأ بعد نزوله (لا تُتخطّى إلى الأبد) — بالقاعدة المفحوصة سلوكاً أعلاه",
  /useState\(\(\) => draftOnMount\(loadSaleDraft\(draftScope\), !!prefill && !prefillApplied\)\)/.test(SB));
check("  وجسرٌ على دفعةٍ معلَّقة لا يهبط: يُرمى كلُّه عند الأب (لا يعود ناقصاً ولا يختم تحليلاً)، ويُقال أنه ما انفتح",
  /if \(!prefill \|\| prefillApplied\) return;\s*if \(saleRefRef\.current\) \{[\s\S]{0,600}?labIdRef\.current = null;\s*onCustomerCleared\?\.\(\);[\s\S]{0,300}?retail\.payPending[\s\S]{0,300}?retail\.bridgeRefused[\s\S]{0,200}?return;\s*\}/.test(SB)
  && !/if \(saleRefRef\.current\) \{[\s\S]{0,600}?onPrefillApplied\?\.\(\)/.test(SB));
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
for (const k of ["custClear", "custClearTitle", "custClearHint", "custClearGo", "custCleared", "custClearedDropped", "payPending", "bridgeRefused"]) {
  check(`  مفتاحُ retail.${k} بالملفّين`, !!en?.retail?.[k] && !!ar?.retail?.[k]);
}

console.log(`\n${fails ? "✗" : "✓"} sale-customer-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
