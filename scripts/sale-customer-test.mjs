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
check("  يظهر حين يكون هناك زبونٌ يُمسح",
  /const hasCustomer = !!name\.trim\(\) \|\| !!phone\.trim\(\) \|\| salePets\.length > 0;/.test(SB) && /\{hasCustomer && \(\s*<button\s*data-custclear type="button"/.test(SB));
/* المالك: «وينه ما لكيت شيء». الأيقونةُ وحدَها بترويسة السلّة لا تُرى — فزرٌّ **بكلمة**
 * بجنب حقول الزبون، بكلّ شكلٍ تأخذه الشاشة: البطاقة (الترويسة)، السطرُ النحيف المفتوح
 * دائماً (0147)، والسطرُ المطويّ «البيع لـ…» بالشاشة الجديدة. ونفسُ الفعل لا نسخةٌ منه. */
const nearAt = SB.indexOf("const custClearBtn = (");
const nearBtn = nearAt < 0 ? "" : SB.slice(nearAt, SB.indexOf("</button>", nearAt));
check("زرُّ «امسح الزبون» بكلمةٍ بجنب حقوله (لا أيقونةَ وحدَها بترويسة السلّة)",
  nearBtn !== "" && /data-custclearnear=\{where\}/.test(nearBtn) && /\{t\("retail\.custClearShort", "امسح الزبون"\)\}/.test(nearBtn));
check("  ونفسُ الفعل بكلّ موضع: نافذةُ السطور المربوطة وحارسُ الدفعة المعلَّقة",
  /onClick=\{\(e\) => \{ e\.stopPropagation\(\); askClearCustomer\(\); \}\}/.test(nearBtn) && /disabled=\{paying\}/.test(nearBtn));
check("  بالبطاقة: بترويستها", /\{hasCustomer && custClearBtn\("head"\)\}/.test(SB));
/* المراجعة قاست العمودَ الخامس: عرضُه كاملاً قبل الحقلين، فيُعصر الاسمُ والهاتفُ حرفين أو
 * ثلاثة على لابتوب ١٢٨٠ لحظةَ أوّل حرف (والصفرَ على ١٠٢٤ ويفيض الزرُّ عن البطاقة). */
check("  وبالسطر النحيف المفتوح دائماً: سطرُه تحت الحقول — **لا عمودٌ خامس** يعصرهما",
  /\{customerOpenPref && hasCustomer && <div className="mt-2 flex justify-end">\{custClearBtn\("slim"\)\}<\/div>\}/.test(SB)
  && !/grid-cols-\[1fr,1fr,minmax\(10rem,0\.8fr\),auto,auto\]/.test(SB)
  && /customerOpenPref \? "sm:grid-cols-\[1fr,1fr,minmax\(10rem,0\.8fr\),auto\]" : "sm:grid-cols-2"/.test(SB));
check("  والأيقونةُ بترويسة السلّة مخفيّةٌ على الهاتف (كانت تُفيض الترويسةَ عن ٣٧٥px)",
  /data-custclear type="button"[\s\S]{0,700}?className=\{cn\("hidden place-items-center[^"]*sm:grid"/.test(SB));
check("  وبالسطر المطويّ «البيع لـ…»: بجنبه لا داخله (زرٌّ داخل زرٍّ لا يصحّ)",
  /data-saledetails[\s\S]{0,900}?<\/button>\s*\{hasCustomer && custClearBtn\("line"\)\}/.test(SB));
{
  const ar = JSON.parse(read("src/i18n/ar.json") || "{}"), en = JSON.parse(read("src/i18n/en.json") || "{}");
  check("  والكلمةُ مترجمةٌ بالملفّين", ar.retail?.custClearShort === "امسح الزبون" && typeof en.retail?.custClearShort === "string" && en.retail.custClearShort.length > 0);
}
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
  /^const clearCustomerNow = \(\) => \{[\s\S]*?if \(paying\) \{ playWarning\(\); setCustClearAsk\(false\); return; \}\s*if \(payPending\) \{[\s\S]*?retail\.payPending[\s\S]*?return;\s*\}/.test(clearFn)
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
/* القفلُ يمتدّ من الإرسال **حتى تُختم البيعةُ محلّيّاً** (setDone + مسحُ المسودّة) — لا حتى
 * جواب الخادم وحده: بينهما طلبُ التوصيل (حتى ١٢ث) والمسودّةُ تحمل المرجع، وتبديلُ تبويبٍ
 * فيه كان يضيّع الوصلَ ويعيد السلّةَ المبيعة «معلَّقة» ويكرّر مزامنةَ السجلّ. */
const coAt = SB.indexOf("const checkout = async");
const coFn = coAt < 0 ? "" : SB.slice(coAt, SB.indexOf("\n  };\n", coAt));
check("    والقفلُ يبدأ مع الطلب ويُفكّ عند الفشل (بلا finally يفكّه عند النجاح مبكراً)",
  /setPaying\(true\);\s*try \{\s*invoice = await withTimeout\(repo\.retailCheckout\(items, meta\), 12000\);\s*\} catch \(e\) \{[\s\S]{0,900}?setPaying\(false\);\s*throw e;\s*\}/.test(coFn)
  && !/invoice = await withTimeout\(repo\.retailCheckout[\s\S]{0,1200}?\} finally \{\s*setPaying\(false\);\s*\}\s*\/\/ Delivery/.test(coFn));
check("    ويُفكّ عند النجاح **بعد** ختم البيعة ومسح المسودّة، لا قبل طلب التوصيل",
  /setDone\(\{ invoice, items: invItems \}\);\s*clearSaleDraft\(draftScope\);[^\n]*\n(\s*\/\*[\s\S]*?\*\/\s*|\s*\/\/[^\n]*\n)*\s*setPaying\(false\);/.test(coFn)
  && coFn.indexOf("repo.createDeliveryOrder(dlvPayload)") < coFn.indexOf("setPaying(false);\n", coFn.indexOf("setDone({ invoice, items: invItems })")));
check("    وشبكةُ أمانٍ بآخر finally (خطأٌ غيرُ متوقَّع بين التثبيت والختم لا يُبقي القفل)",
  /\} finally \{\s*setBusy\(false\);\s*setPaying\(false\);/.test(coFn));
check("    والزرُّ الصغير معطَّلٌ والطلبُ بالطريق", /onClick=\{askClearCustomer\}\s*disabled=\{paying\}/.test(SB));
check("    وF2 لا يدفع تحت نافذة (كان يُسقط تأكيدَ «امسح الزبون» بصمت)",
  /if \(e\.key === "F2"\) \{ e\.preventDefault\(\); if \([^)]*!custClearAsk && !resetAsk\) void checkout\(\); \}/.test(SB));
check("  ورفضٌ حاسمٌ **لمحاولةٍ أولى** يحرّر المرجع، والإعادةُ والمجهولُ يُبقيانه",
  /const freshRef = !saleRefRef\.current;\s*ensureRef\(\);/.test(coFn)
  && /\} catch \(e\) \{[\s\S]{0,900}?if \(shouldReleaseRef\(freshRef, e\)\) \{\s*const released = saleRefRef\.current;\s*saleRefRef\.current = null; setSaleRefSaved\(null\);/.test(coFn));
/* والتحريرُ يبلغ المسودّةَ المحفوظة **مباشرةً** (الجولة الخامسة): خروجٌ من الشريط الجانبيّ
 * والطلبُ بالطريق يُزيل الشاشة، فيسقط تحريرُ الحالة على مكوّنٍ مُزال وتبقى المسودّةُ بمرجعٍ
 * رفضه الخادمُ يقيناً — ثم يعود «إعادةً» لا يحرّرها شيء. */
check("    ويبلغ التحريرُ المسودّةَ المحفوظة مباشرةً — وفقط إن كانت ما زالت تحمل **هذا** المرجع",
  /function releaseSavedRef\(clinicId: string \| undefined, ref: string\): void \{[\s\S]{0,200}?if \(d && d\.clientRef === ref\) localStorage\.setItem\(saleDraftKey\(clinicId\), JSON\.stringify\(\{ \.\.\.d, clientRef: null \}\)\);/.test(SB)
  && /if \(released\) releaseSavedRef\(draftScope, released\);/.test(coFn));

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
  /* قائمةُ سماحٍ لا قائمةُ حظر: ما قد يقع حولَ COMMIT يبقى مجهولاً. */
  check("  وPGRST001 (انقطاعٌ مع القاعدة، قد يقع بعد إرسال COMMIT) ⇒ مجهول", !RB(err({ code: "PGRST001" })));
  check("  وأصنافُ الاتصال والإيقاف (08…، 57P01، 58…) ⇒ مجهول",
    !RB(err({ code: "08006" })) && !RB(err({ code: "57P01" })) && !RB(err({ code: "58030" })));
  check("  وانتظارُ الحوض (PGRST003) وإلغاءُ المهلة (57014) وتعارضُ المعاملات ⇒ حاسم",
    RB(err({ code: "PGRST003" })) && RB(err({ code: "57014" })) && RB(err({ code: "40001" })) && RB(err({ code: "40P01" })));

  /* **تسلسلُ المحاولات** — ما لم يفحصه جدولُ النداء الواحد (أمسكته الجولةُ الرابعة): محاولةٌ
   * أولى ماتت بمهلة (وقد تكون ثُبّتت)، ثم إعادةٌ رُفضت رفضاً «حاسماً». رفضُ الإعادة لا يحرّر
   * مرجعاً قد يكون ثُبّت قبلها. نمثّل الشاشةَ بحالتها الدنيا: مرجعٌ + محاولات. */
  const SR = typeof E.shouldReleaseRef === "function" ? E.shouldReleaseRef : null;
  check("shouldReleaseRef موجودةٌ صِرفة", !!SR);
  if (SR) {
    const run = (errors) => {
      let ref = null; let minted = 0;
      for (const e of errors) {
        const fresh = !ref;
        if (!ref) { ref = `R${++minted}`; }
        if (e === "ok") return { ref, minted, committed: true };
        if (SR(fresh, e)) ref = null;
      }
      return { ref, minted, committed: false };
    };
    const timeout = realTimeout;
    const jwt = err({ code: "PGRST301" });
    const fk = err({ code: "23503" });
    const s1 = run([timeout, jwt, "ok"]);
    check("  مهلةٌ ثم رفضُ جلسةٍ ثم نجاح ⇒ مرجعٌ واحد طولَ الطريق (الإعادةُ تُرجع الأولى لا تكرّرها)", s1.minted === 1 && s1.ref === "R1");
    const s2 = run([fk, "ok"]);
    check("  رفضٌ حاسمٌ لأوّل محاولة ثم نجاح ⇒ مرجعٌ جديد (لا «معلَّقة» للأبد)", s2.minted === 2 && s2.ref === "R2");
    const s3 = run([timeout, timeout, fk, jwt, "ok"]);
    check("  ومهما تكرّرت الإعاداتُ المرفوضة بعد مجهول ⇒ لا تجديد", s3.minted === 1);
    check("  والمرجعُ المسترجَعُ من المسودّة (محاولةٌ قبل التحديث) يُعامَل كإعادة", SR(false, fk) === false);
  }
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

/* ── بحثُ الزبون بخانتَي الاسم والهاتف (0232) ─────────────────────────────────
 * كلمةُ المالك: «اكو مكان مخصّص لكتابة اسم الزبون ورقمه — خلّيه بنفس المكان»، والبيعُ
 * بلا حيوانٍ مدعومٌ كاملاً. وثلاثةُ أضرارٍ يمنعها البحثُ هنا: لقاحٌ بسجلّ حيوانِ زبونٍ
 * آخر عند التبديل، ومسحةُ باركود تصير اسمَ زبون، وجوابٌ قديمٌ يمحو الجديد. */
console.log("▸ بحثُ الزبون: التبديلُ يسأل، والمسحةُ تُشال، والأحدثُ وحده يكتب");
const CS = read("src/components/retail/CustomerSearch.tsx");
if (M) {
  check("الوحدةُ تصدّر قواعدَ البحث الثلاث", typeof M.planCustomerSwitch === "function" && typeof M.stripScanTail === "function" && typeof M.latestOnly === "function");
}
if (M?.planCustomerSwitch) {
  const vax = { id: "m:1", kind: "med", name: "لقاح سعار", petId: "pet-a", petName: "لولو", med: {} };
  const sand = { id: "p:1", kind: "product", name: "رمل قطط", petId: null };
  const ask = M.planCustomerSwitch([{ id: "pet-a", name: "لولو" }], [sand, vax], ["pet-z"]);
  check("زبونٌ آخر والسلّةُ فيها لقاحٌ لحيوانٍ ليس له ⇒ يُسأل ويُسمّى الحيوانُ والسطر",
    ask.ask === true && ask.pets.join() === "لولو" && ask.lines.map((l) => l.id).join() === "m:1");
  const same = M.planCustomerSwitch([{ id: "pet-a", name: "لولو" }], [sand, vax], ["pet-a", "pet-b"]);
  check("  ونفسُ صاحب الحيوان ⇒ لا سؤال", same.ask === false);
  check("  وبيعةٌ بلا حيوانٍ ولا سطرٍ مربوط ⇒ لا سؤال (البيعُ بلا حيوانٍ مدعوم)", M.planCustomerSwitch([], [sand], ["pet-z"]).ask === false && M.planCustomerSwitch([], [], []).ask === false);
  check("  وحيوانٌ مربوط والزبونُ الجديد بلا حيوانات ⇒ يُسأل", M.planCustomerSwitch([{ id: "pet-a", name: "لولو" }], [sand], []).ask === true);
  check("  وحيوانٌ بلا معرّف (جسرٌ قديم) لا يُفترض أنه للجديد ⇒ يُسأل", M.planCustomerSwitch([{ id: null, name: "مجهول" }], [], ["pet-a"]).ask === true);
  check("  وبندُ مختبرٍ بلا حيوان ⇒ يُسأل", M.planCustomerSwitch([], [{ id: "s:lab:9", kind: "service", name: "تحليل", petId: null }], ["pet-a"]).ask === true);
}
if (M?.stripScanTail) {
  check("مسحةٌ هبطت بآخر الخانة تُشال، وما كتبه الطبيبُ قبلها يبقى", M.stripScanTail("أحمد6221033000123", "6221033000123", "") === "أحمد");
  check("  وبأرقامٍ شرقيةٍ بالرمز والخانةُ مطبَّعة", M.stripScanTail("علي6221", "٦٢٢١", "") === "علي");
  check("  وإن لم تكن بالآخر يرجع الحقلُ لما كان لحظةَ التركيز", M.stripScanTail("خليط", "6221033000123", "علي") === "علي");
}
if (M?.latestOnly) {
  const g = M.latestOnly();
  const slow = g.next(), fast = g.next();
  check("جوابٌ بطيءٌ لنصٍّ قديم يُرمى، والأحدثُ يكتب", g.isLatest(slow) === false && g.isLatest(fast) === true);
  g.cancel();
  check("  ومسحُ الخانة (cancel) يُسقط ما بالطريق كلَّه", g.isLatest(fast) === false);
}
check("لا سطرَ بحثٍ جديد: الخانتان نفسُهما تبحثان، وكلٌّ بنصّها (لا «الهاتفُ يغلب»)",
  /onChange=\{\(e\) => \{ setName\(e\.target\.value\); cs\.type\("name", e\.target\.value\); \}\}/.test(SB)
  && /onChange=\{\(e\) => \{ setPhone\(e\.target\.value\); cs\.type\("phone", e\.target\.value\); \}\}/.test(SB)
  && !/data-custsearch/.test(SB) && !/runCustSearch|qPhone \|\| qName/.test(SB));
check("  والقائمةُ تحت الخانتين داخل صندوق الزبون — موضعٌ واحد بكلّ شكلٍ للشاشة",
  (SB.match(/<CustomerDropdown cs=\{cs\} onPick=\{pickCustomer\} \/>/g) ?? []).length === 1
  && SB.indexOf("<CustomerDropdown") > SB.indexOf("<div data-custbox") && SB.indexOf("<CustomerDropdown") < SB.indexOf('data-custclearnear') + 1e9);
check("  والخانتان مسمّاتان للماسح (data-scan-into=\"cust\")",
  (SB.match(/data-scan-into="cust" data-custfield="(name|phone)"/g) ?? []).length === 2);
{
  const at = SB.indexOf('if (focused?.dataset?.scanInto === "cust") {');
  const branch = at < 0 ? "" : SB.slice(at, SB.indexOf('if (focused?.dataset?.scanInto === "dref")', at));
  check("مسحةٌ على خانة الزبون: تُشال من الخانة، ويُلغى البحث، ويُترك التركيز",
    /stripScanTail\(v, code, before\)/.test(branch) && /cs\.cancel\(\);/.test(branch) && /focused\.blur\(\);/.test(branch));
  check("  ثم تكمل منتجاً للسلّة (لا return يبلعها)", branch !== "" && !/\breturn\b/.test(branch));
}
check("Enter يختار المُشارَ إليه وحده (سهمٌ أو مرور) — وبلا إشارةٍ لا شيء",
  /if \(e\.key === "Enter"\) \{\s*const h = cs\.highlighted\(\);\s*if \(h\) \{ e\.preventDefault\(\); pickCustomer\(h\); \}/.test(SB)
  && /return s\.open && s\.status === "ok" && s\.hi >= 0 \? s\.rows\[s\.hi\] \?\? null : null;/.test(CS));
check("  وكلُّ تغييرٍ بالنصّ يمحو الإشارة (فـEnter آخر المسحة لا يختار زبوناً)",
  /const type = useCallback\(\(field: CustField, value: string\) => \{[\s\S]{0,700}?hi: -1/.test(CS));
{
  const at = SB.indexOf("const pickCustomer = (hit: CustomerHit) => {");
  const pickFn = at < 0 ? "" : SB.slice(at, SB.indexOf("const confirmSwitch", at));
  check("اختيارُ زبونٍ لا يُلصق حيواناً أبداً (لا setSalePets بالاختيار)", pickFn !== "" && !/setSalePets/.test(pickFn) && !/setSalePets/.test(SB.slice(SB.indexOf("const applyPick"), SB.indexOf("const pickCustomer"))));
  check("  ويسأل قبل التبديل حين يلزم، والتأكيدُ يمرّ من «امسح الزبون» نفسِه",
    /const plan = planCustomerSwitch\(salePets, cart, hit\.pets\.map\(\(p\) => p\.id\)\);/.test(pickFn)
    && /if \(paying \|\| payPending\) \{ clearCustomerNow\(\); return; \}/.test(pickFn)
    && /clearCustomerNow\(\);\s*applyPick\(ask\.hit\);/.test(SB) && /data-custswitchgo/.test(SB));
  check("  و«أضف حيوانه» اختياريّ: حيواناتُ الزبون الأحياء تُعرض للضغط", /<CustomerPetsStrip hit=\{picked\}/.test(SB) && /!p\.deceased && !attached\.has\(p\.id\)/.test(CS));
}
check("فشلُ البحث يُقال ويُعاد — لا «زبون جديد» عن خطأ ولا قائمةٌ فارغة",
  /setSt\(\(s\) => \(\{ \.\.\.s, status: "error"/.test(CS) && /cs\.status === "error" && \(/.test(CS) && /onClick=\{cs\.retry\}/.test(CS)
  && /cs\.status === "ok" && cs\.rows\.length === 0 &&/.test(CS));
check("  ومغادرةُ الخانة أو الانتقالُ للأخرى يُسقط البحثَ المنتظر ويغلق القائمة (لا تبقى قائمةُ الاسم تحت الهاتف)",
  /blurTimer\.current = window\.setTimeout\(\(\) => \{\s*blurTimer\.current = null;\s*stop\(\);/.test(CS)
  && /if \(s\.field !== field\) \{\s*stop\(\);/.test(CS));
check("  والاختيارُ يصفّر البحث (لا تعود قائمةُ النصّ القديم بالتركيز التالي)", /const pickCustomer = \(hit: CustomerHit\) => \{\s*cs\.cancel\(\);/.test(SB));
check("  والأحدثُ وحده يكتب (latestOnly)، ولا يُعرض جوابٌ أُلغي", /if \(!seq\.isLatest\(n\)\) return;[\s\S]{0,200}?status: "ok"/.test(CS) && /if \(!seq\.isLatest\(n\)\) return;[\s\S]{0,200}?status: "error"/.test(CS));
check("لا `catch` يكتب قائمةً فارغة بشاشة البيع (الزبائن ولا منتقي الحيوانات)",
  !/catch\s*(\([^)]*\))?\s*\{\s*set\w+\(\[\]\)/.test(SB) && !/catch\s*(\([^)]*\))?\s*\{\s*set\w+\(\[\]\)/.test(CS));
check("  ومنتقي الحيوانات يقول فشلَه ويُعاد", /setPetPickErr\(true\)/.test(SB) && /data-petpickerr/.test(SB) && /onClick=\{\(\) => void loadPetPick\(\)\}/.test(SB));
check("  وF2 لا يدفع تحت نافذة التبديل", /if \(e\.key === "F2"\) \{ e\.preventDefault\(\); if \([^)]*!switchAsk[^)]*\) void checkout\(\); \}/.test(SB));
check("و«نفس المالك» بمنتقي الحيوانات بنفس المفتاح (الرقمُ بمفتاح الدولة يغلب، ثم الاسمُ المطويّ) لا بأرقامٍ خام",
  /pk \? custPhoneKey\(p\.owner_phone, dial\) === pk : !!nk && custNameKey\(p\.owner_name\) === nk/.test(SB) && !/phoneDigits\(p\.owner_phone/.test(SB));
check("والبحثُ القديم (آخرُ ٣٠٠ فاتورة بالنصّ الخام) زال من الريبو", !/searchCustomers|dedupeCustomers/.test(read("src/lib/repo.ts") + read("src/lib/repoDemo.ts")));
/* «+964» وحده كان يُكتب رقماً للزبون (حيوانٌ قديمٌ رقمُ صاحبه مفتاحٌ بلا رقم يُسحب للبيعة):
 * ٢٣ فاتورةً بالإنتاج رقمُها «964» تجمع أناساً شتّى. الحكمُ نفسُه بالفاتورة وبطلب التوصيل. */
check("رقمُ الزبون بالفاتورة وبطلب التوصيل يمرّ من checkoutPhone (مفتاحُ الدولة وحده لا يُكتب)",
  /const custPhone = checkoutPhone\(phone, cust\.phone, getDialCode\(\)\);/.test(SB)
  && (SB.match(/customer_phone: custPhone,/g) ?? []).length === 2
  && !/customer_phone: phone\.trim\(\) \|\| cust\.phone/.test(SB));
/* قيس بالمتصفّح على ٣٧٥: صاحبةُ ثلاثة حيوانات وسّعت عمودَ الشاشة من 343 إلى 363 — مسارُ العمود
 * ضمنيّ (auto) يتبع أعرضَ محتوى، والشريطُ صفُّ رقاقاتٍ لا تلتفّ — فخرج صندوقُ الزبون عن الشاشة. */
check("شريطُ «أضف حيوانه» يملأ عرضَ الصندوق ولا يفرض عرضَه (w-0 min-w-full) ويُمرَّر أفقياً",
  /data-custpets className="[^"]*\bw-0 min-w-full\b[^"]*\boverflow-x-auto\b/.test(CS));
check("زبونٌ طلع باسم حيوانه يقول «عن طريق X» (وإلا يُظنّ خطأ)",
  /via: viaOf\(page\.rows, q\)/.test(CS) && /cs\.via\[h\.key\] && \(/.test(CS) && /t\("cust\.viaPet"/.test(CS));
for (const k of ["short", "error", "new", "more", "pets", "regular", "noPhone", "addPet", "petsFailed", "switchTitle", "switchHint", "switchGo", "viaPet"]) {
  check(`  مفتاحُ cust.${k} بالملفّين`, !!en?.cust?.[k] && !!ar?.cust?.[k]);
}

/* ── تدقيقٌ عدائيّ: «بلا رقم» يمحو رقماً كتبه الكاشير ─────────────────────────────
 * كلُّ خانةٍ تبحث بنصّها، فصفُّ «احمد كاظم · بلا رقم» يطلع لخانة الاسم وبخانة الهاتف رقمٌ
 * جديد كتبه الكاشيرُ تواً — والضغطُ عليه كان يُفرغ الهاتف بلا كلمة (`hit.phone ?? ""`):
 * الفاتورةُ بلا رقم، والدَّينُ بمفتاح الاسم منفصلاً عن ديونه. وبالإنتاج ٧٠٢ فاتورةٍ باسمٍ بلا رقم،
 * و٥٢ اسماً يظهر بالحالين — فالقائمةُ تعرض الصفَّين لنفس الاسم كثيراً. */
console.log("▸ اختيارُ صفٍّ «بلا رقم» لا يمحو رقماً كتبه الكاشير — ولا صفٌّ بلا اسمٍ اسماً");
const resetFn = SB.slice(SB.lastIndexOf("const reset = () => {", SB.indexOf("const hardReset")), SB.indexOf("const hardReset"));
const FP = M?.fieldsAfterPick;
check("fieldsAfterPick موجودةٌ صِرفة (src/lib/saleCustomer.ts)", typeof FP === "function");
if (typeof FP === "function") {
  const E = { name: "", phone: "" };
  const a = FP({ name: "احمد كاظم", phone: null }, { name: "احمد ك", phone: "07701239999" }, E);
  check("المشهدُ المقيس: رقمٌ مكتوب + «احمد ك» + صفُّ «احمد كاظم · بلا رقم» ⇒ الاسمُ من الصفّ والرقمُ يبقى",
    a.text.name === "احمد كاظم" && a.text.phone === "07701239999", JSON.stringify(a.text));
  check("  ويبقى «بيد الكاشير» بعده (اختيارٌ ثانٍ بلا رقم يُبقيه أيضاً)",
    FP({ name: "احمد كاظم", phone: null }, a.text, a.auto).text.phone === "07701239999");
  const b = FP({ name: null, phone: "07501112222" }, { name: "سعد", phone: "0750111" }, E);
  check("والعكس: صفٌّ بلا اسم («عميل نقدي») لا يمحو اسماً مكتوباً، ورقمُه يُكتب",
    b.text.name === "سعد" && b.text.phone === "07501112222", JSON.stringify(b.text));
  /* ما كتبته الشاشةُ من زبونٍ آخر يُمسح: إبقاؤه يقيّد دَينَ الثاني على رقم الأوّل. */
  const prev = { name: "علي حسن", phone: "07700000001" };
  const c = FP({ name: "سعد علي", phone: null }, { name: "سعد ع", phone: prev.phone }, prev);
  check("رقمُ اختيارٍ سابق (زبونٌ آخر) لا يلتصق بالجديد", c.text.phone === "" && c.auto.phone === "", JSON.stringify(c));
  check("  ولا رقمُ جسرِ سجلٍّ أو صاحبِ حيوان (كتبته الشاشة)",
    FP({ name: "سعد علي", phone: null }, { name: "سعد", phone: "07709990000" }, { name: "", phone: "07709990000" }).text.phone === "");
  check("  وخانةٌ عدّلها الكاشيرُ بعد اختيارٍ سابق صارت له فتبقى",
    FP({ name: "سعد علي", phone: null }, { name: "سعد", phone: "07709990000" }, prev).text.phone === "07709990000");
  check("  ومسحةٌ أُرجعت الخانةُ بعدها لنصّ الشاشة تُعدّ نصَّ الشاشة (لا علامةَ تُنسى)",
    FP({ name: "x", phone: null }, { name: "x", phone: prev.phone }, prev).text.phone === "");
  const full = FP({ name: "نور", phone: "0780" }, { name: "ن", phone: "0770123" }, E);
  check("  وصفٌّ بقيمتيه يكتبهما كما هما (ظاهرتان بالصفّ قبل الضغط)", full.text.name === "نور" && full.text.phone === "0780" && full.auto.phone === "0780");
  check("  وخانةٌ فارغةٌ أو مسافاتٌ تبقى فارغة", FP({ name: "نور", phone: null }, { name: "ن", phone: "  " }, E).text.phone === "");
  check("  وقيمةُ صفٍّ فارغةٌ نصّاً تُعامَل كالفراغ", FP({ name: "نور", phone: "" }, { name: "ن", phone: "0770" }, E).text.phone === "0770");
}
{
  const at = SB.indexOf("const applyPick = (hit: CustomerHit) => {");
  const fn = at < 0 ? "" : SB.slice(at, SB.indexOf("const pickCustomer", at));
  check("applyPick يمرّ من fieldsAfterPick ولا يكتب فراغَ الصفّ فوق الخانة",
    /fieldsAfterPick\(hit, \{ name, phone \}, custAuto\)/.test(fn) && /setCustAuto\(f\.auto\)/.test(fn) && !/hit\.(name|phone) \?\? ""/.test(fn));
  /* «كتبه الكاشير» = يختلف عمّا كتبته الشاشة. فكلُّ كتابةٍ من الشاشة بخانتَي الزبون تسجّل نفسَها،
   * وإلا عُدّت كتابةَ الكاشير فبقيت مع زبونٍ آخر. يُمسح كلُّ setName/setPhone بالملفّ: المسموحُ
   * بلا تسجيلٍ الفراغُ، ويدُ الكاشير (e.target.value)، وإرجاعُ المسحة (fix). */
  const writers = [...SB.matchAll(/\bset(Name|Phone)\(([^;]*?)\);/g)];
  const unrecorded = writers.filter((w) => !['""', "e.target.value", "fix"].includes(w[2].trim()) && !/setCustAuto\(/.test(SB.slice(w.index, w.index + 200)));
  check("  وكلُّ كتابةٍ من الشاشة بخانتَي الزبون تسجّل نفسَها (custAuto) — الجسر، «بيع جديد»، صاحبُ الحيوان، الاختيار",
    writers.length >= 10 && unrecorded.length === 0, unrecorded.map((w) => w[0]).join(" | ") || `${writers.length} كاتب`);
  check("  والتصفيرُ ومسحُ الزبون يُفرغانه", /setCustAuto\(\{ name: "", phone: "" \}\)/.test(resetFn) && /setCustAuto\(\{ name: "", phone: "" \}\)/.test(clearFn));
  check("  ويعيش بالمسودّة (تبديلُ التبويب يعيد تركيبَ الشاشة منها)، والقديمةُ بلاه تُعدّ نصَّ الشاشة",
    /clientRef: saleRefSaved, custAuto \}\);/.test(SB) && /saleRefSaved, custAuto, done\]\);/.test(SB)
    && /draft0\?\.custAuto \?\? \{ name: draft0\?\.name \?\? "", phone: draft0\?\.phone \?\? "" \}/.test(SB));
  check("  و«أضف حيوانه» يبقى للمختار وإن أبقى الاختيارُ رقمَ الكاشير",
    /name === pickedHit\.text\.name && phone === pickedHit\.text\.phone \? pickedHit\.hit : null/.test(SB));
}

/* ── تدقيقٌ عدائيّ: «بيع جديد» ثم ضغطٌ على الخانة الفارغة يفتح زبائنَ البيعة السابقة ───
 * `reset()` كان يُفرغ الخانتين ولا يمسّ البحث، و`focus()` يعيد آخرَ نتائج الخانة مهما صار
 * نصُّها — فسهمٌ ثم Enter يضع الزبونَ السابق على البيعة الجديدة. الخطّافُ يُشغَّل هنا فعلاً:
 * React ظلٌّ يحفظ الحالة بين الرسمات، ومؤقّتاتٌ بيدنا، وخادمٌ مزيّف. */
console.log("▸ النتائجُ جوابُ نصّها: الخانةُ الفارغة بعد «بيع جديد» لا تفتح زبائنَ البيعة السابقة");
check("«بيع جديد» (reset) يُنسي بحثَ الزبون والمختار — ومسحةٌ على الإيصال تمرّ منه",
  /cs\.cancel\(\);/.test(resetFn) && /setPickedHit\(null\)/.test(resetFn) && /if \(done\) \{ pendingScanRef\.current = code; reset\(\); return; \}/.test(SB));
check("  والخانتان تعطيان التركيزَ نصَّهما الآن", /cs\.focus\("name", name\)/.test(SB) && /cs\.focus\("phone", phone\)/.test(SB));
{
  const RT = (globalThis.__RT = { slots: [], i: 0 });
  const SRC = {
    "react": "const R=globalThis.__RT;export const useState=(v)=>{const k=R.i++;if(!(k in R.slots))R.slots[k]=typeof v==='function'?v():v;return [R.slots[k],(n)=>{R.slots[k]=typeof n==='function'?n(R.slots[k]):n;}];};export const useRef=(v)=>{const k=R.i++;if(!(k in R.slots))R.slots[k]={current:v};return R.slots[k];};export const useCallback=(f)=>f;export const useEffect=()=>{};",
    "react/jsx-runtime": "export const jsx=()=>null;export const jsxs=()=>null;export const Fragment=null;",
    "react-i18next": "export const useTranslation=()=>({t:(k)=>k});",
    "lucide-react": "export const PawPrint=null,Plus=null,RotateCcw=null;",
    "@/lib/repo": "export const repo={findCustomers:(...a)=>globalThis.__findCustomers(...a)};",
    "@/lib/settings": "export const getDialCode=()=>'964';",
    "i18next": "export default { t: (k) => k, language: 'ar' };",
  };
  const hb = await esbuild.build({
    stdin: { contents: 'export { useCustomerSearch } from "./src/components/retail/CustomerSearch.tsx";', resolveDir: process.cwd(), loader: "ts" },
    bundle: true, format: "esm", write: false, platform: "neutral", mainFields: ["module", "main"], jsx: "automatic", logLevel: "silent",
    plugins: [{
      name: "hook-rt",
      setup(b) {
        b.onResolve({ filter: /^(react|react\/jsx-runtime|react-i18next|lucide-react|@\/lib\/repo|@\/lib\/settings|i18next)$/ }, (a) => ({ path: a.path, namespace: "hrt" }));
        b.onLoad({ filter: /.*/, namespace: "hrt" }, (a) => ({ contents: SRC[a.path], loader: "js" }));
      },
    }],
  }).catch((e) => { console.error(e?.message ?? e); return null; });
  const H = hb ? await import("data:text/javascript;base64," + Buffer.from(hb.outputFiles[0].text).toString("base64")) : null;
  check("الخطّافُ (useCustomerSearch) يُبنى ويُشغَّل", typeof H?.useCustomerSearch === "function");
  if (H) {
    const T = new Map(); let tn = 1;
    const prevWin = globalThis.window;
    globalThis.window = { setTimeout: (f) => { const id = tn++; T.set(id, f); return id; }, clearTimeout: (id) => { T.delete(id); } };
    const flush = () => { for (const [id, f] of [...T]) { T.delete(id); f(); } };
    const tick = () => new Promise((r) => setTimeout(r, 0));
    const render = () => { RT.i = 0; return H.useCustomerSearch(); };
    const hitA = { key: "p:7701234567", name: "احمد علي", phone: "07701234567", purchases: 3, refunds: 0, firstAt: null, lastAt: null, pets: [], petsAlive: 0, petsDeceased: 0, matched: "name", top: null };
    globalThis.__findCustomers = async () => ({ rows: [hitA], total: 1 });
    const search = async (cs, field, text) => { cs.type(field, text); render(); flush(); await tick(); return render(); };
    try {
      let cs = render();
      cs = await search(cs, "name", "احمد ع");
      check("  (تمهيد) «احمد ع» يُجيب بصفّ «احمد علي» والقائمةُ مفتوحة", cs.open && cs.status === "ok" && cs.rows.length === 1, `${cs.open}/${cs.status}/${cs.rows.length}`);
      cs.blur(); flush(); cs = render();
      check("  (تمهيد) ومغادرةُ الخانة تُغلقها", !cs.open);
      /* «بيع جديد» بلا إصلاح الشاشة: الخانةُ فرغت بـsetName("") — لا `type` — ثم ضغطةٌ عليها. */
      cs.focus("name", ""); cs = render();
      check("التركيزُ على الخانة الفارغة لا يفتح زبائنَ النصّ السابق", !cs.open && cs.rows.length === 0, `open=${cs.open} rows=${cs.rows.length}`);
      cs.move(1); cs = render();
      check("  ولا سهمٌ ثم Enter يختار الزبونَ السابق", cs.highlighted() === null);
      /* وكتابةٌ بعده: النتائجُ القديمةُ كانت تُعرض باهتةً قابلةً للضغط ريثما يصل الجواب. */
      cs.type("name", "مح"); cs = render();
      check("  والكتابةُ بعده لا تعرض صفوفَ البيعة السابقة ريثما يصل الجواب", cs.rows.length === 0, `${cs.rows.length}`);
      cs.cancel(); cs = render();
      cs = await search(cs, "name", "احمد ع");
      cs.blur(); flush(); cs = render();
      cs.focus("name", "احمد ع"); cs = render();
      check("  والتركيزُ على **نفس** النصّ ما زال يعيد نتائجَه (الميزةُ باقية)", cs.open && cs.rows.length === 1);
      cs.blur(); flush(); cs = render();
      cs.focus("name", "علي حسن"); cs = render();
      check("  ونصٌّ كتبته الشاشة (جسرٌ، صاحبُ حيوان) غيرُ ما أُجيب عنه لا يفتحها", !cs.open && cs.rows.length === 0);
      cs = await search(cs, "phone", "0770123");
      cs.cancel(); cs = render();
      cs.focus("phone", "0770123"); cs = render();
      check("  وcancel (اختيارٌ، مسحة، تصفير) يُنسي — لا يعيدها تركيزٌ ولو بنفس النصّ", !cs.open && cs.rows.length === 0);
    } finally {
      globalThis.window = prevWin;
      delete globalThis.__findCustomers;
    }
  }
}

console.log(`\n${fails ? "✗" : "✓"} sale-customer-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
