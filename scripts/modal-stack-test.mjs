/* ============================================================================
 * مكدّسُ النوافذ — Esc تطوي الأعلى وحدَها.
 *
 * الجذرُ المقيس: `Modal` و`Dialog` كلٌّ منهما يسجّل `keydown` على `document`
 * بلا أن يسأل «هل أنا الأعلى؟»، والستارةُ مثلُها. ومنتقي منتجات الشركة نافذةٌ
 * تُرسم **داخل** بنّاء فاتورة الشراء — فضغطةُ Esc واحدةٌ تطوي الاثنتين،
 * و`useEffect([open])` يصفّر السطورَ عند إعادة الفتح. فاتورةُ ثلاثين سطراً
 * تضيع بضغطة، والبضاعةُ وصلت فعلاً ⇒ إدخالٌ ناقصٌ أو مزدوج.
 *
 *   node scripts/modal-stack-test.mjs
 * ==========================================================================*/
import { readFileSync } from "node:fs";
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (n, c, d = "") => { if (c) { passes++; console.log(`   ✓ ${n}`); } else { fails++; console.error(`   ✗ ${n}${d ? ` — ${d}` : ""}`); } };

const built = await esbuild.build({
  entryPoints: ["src/lib/modalStack.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
});
const { pushModal, removeModal, isTopModal, modalDepth, resetModalStack } =
  await import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));

console.log("▸ المكدّس — آخرُ داخلٍ أوّلُ خارج");
resetModalStack();
check("بلا نوافذَ: أيُّ معرّفٍ يُعدّ الأعلى (الخطأُ بجانب «تُغلق»)", isTopModal("x") === true);
pushModal("a");
check("نافذةٌ وحدَها هي الأعلى", isTopModal("a") === true && modalDepth() === 1);
pushModal("b");
check("**وبعد فتح الثانية: Esc تخصّ الثانية وحدَها**", isTopModal("b") === true);
check("  والأولى لا تُغلق معها (هذا هو العطبُ الذي كان)", isTopModal("a") === false);
removeModal("b");
check("وبإغلاق الثانية ترجع الأولى هي الأعلى", isTopModal("a") === true && modalDepth() === 1);
removeModal("a");
check("والمكدّسُ يفرغ", modalDepth() === 0);

console.log("\n▸ حالاتٌ تكسر مكدّساً ساذجاً");
resetModalStack();
pushModal("a"); pushModal("b"); pushModal("a");
check("إعادةُ فتحِ نافذةٍ بنفس المعرّف ترفعها للقمّة ولا تكرّرها",
  isTopModal("a") === true && modalDepth() === 2, `depth=${modalDepth()}`);
removeModal("a");
check("  وشيلُها مرّةً واحدةً يكفي (لا تبقى عالقةً بالمكدّس)",
  isTopModal("b") === true && modalDepth() === 1, `depth=${modalDepth()}`);
removeModal("zzz");
check("وشيلُ معرّفٍ غيرِ موجودٍ لا يؤذي", modalDepth() === 1);
resetModalStack();
pushModal("a"); pushModal("b"); pushModal("c");
removeModal("b");
check("وإغلاقٌ من الوسط يُبقي القمّةَ قمّةً", isTopModal("c") === true && modalDepth() === 2);

console.log("\n▸ المسح: النافذتان تمرّان من المكدّس");
for (const f of ["src/components/Modal.tsx", "src/components/ui/Dialog.tsx"]) {
  const src = readFileSync(f, "utf8");
  const name = f.split("/").pop();
  check(`${name}: يسجّل نفسَه بالمكدّس`, /pushModal\(/.test(src) && /removeModal\(/.test(src));
  check(`  ${name}: ولا يُغلق إلا إذا كان الأعلى`, /isTopModal\(/.test(src));
  check(`  ${name}: والستارةُ تمرّ من نفس الباب لا من onClose مباشرةً`,
    !/onClick=\{onClose\}/.test(src), (src.match(/onClick=\{onClose\}/g) || []).length + " موضعاً");
}
const pur = readFileSync("src/components/inventory/Purchases.tsx", "utf8");
check("وفاتورةُ الشراء تسأل قبل ما تضيّع السطور", /confirmClose=\{confirmClose\}/.test(pur));
/* النداءُ لا الذكر: التعليقُ أعلاه يسمّيها ليشرح لماذا لا تُستعمل، فالفحصُ
 * يطلب قوساً بعدها — وإلا صار حارساً يفشّل على شرحِ نفسِه. */
check("  ولا تستعمل window.confirm (يُقبل بلا قراءة — حادثةٌ موثّقة)", !/window\.confirm\s*\(/.test(pur));

console.log("\n▸ بابان آخران كانا يبلعان نيّةَ المستخدم");
/* `scanAdd` تُنادى من Enter ومن زرّ «إضافة» وحدَهما — وبعضُ الماسحات لا ترسل
 * Enter. فمن يمسح ثمّ يضغط «حفظ» يفقد آخرَ مسحةٍ بلا كلمة. */
check("رمزٌ معلّقٌ بصندوق المسح يُقال قبل الحفظ", /purchase\.pendingScan/.test(pur) && /if \(scan\.trim\(\)\)/.test(pur));
/* الفراغُ كان يعني «مدفوعةٌ كاملة» — وخطؤه باتّجاهٍ واحدٍ دائماً: الدَّينُ يُبخَس. */
check("و«دفعناها» أو «عليها دَين» سؤالٌ لا افتراض", /paidMode/.test(pur) && /purchase\.needPaidMode/.test(pur));
check("  والفاتورةُ الجديدة ترسل رقماً دائماً لا undefined",
  /paidMode === "debt" \? paidNum : total/.test(pur));
check("  ووضعُ التعديل يبقى على عقده (فارغٌ = لا تغيّر المدفوع)",
  /editing \? \(amountPaid\.trim\(\) === "" \? undefined/.test(pur));

console.log("\n▸ 0229 — عارضُ الصور فوق بطاقة المنتج");
{
  const lb = readFileSync("src/components/ImageLightbox.tsx", "utf8");
  check("العارضُ يدخل المكدّس ويخرج منه بدورة حياته", /pushModal\(modalId\)/.test(lb) && /removeModal\(modalId\)/.test(lb));
  check("  وEsc تطويه وحدَه — لا البطاقةَ تحته", /if \(!isTopModal\(modalId\)\) return;\s*\n\s*if \(e\.key === "Escape"\) onClose\(\);/.test(lb));
}

console.log("\n▸ 0229 — العارضُ: الإغلاقُ بالإيماءة لا بهدف النقرة");
{
  /* الالتقاطُ على المسرح يجعل هدفَ النقرة المسرحَ نفسَه — فـ`stopPropagation` على الصورة لا
   * يحميها، ونقرةٌ عليها (ونقرتُه المزدوجة، وإفلاتُ السحب) تُغلق العارض. يُثبَّت هنا شكلُ الحلّ،
   * ويقيسه سلوكاً `scripts/live/lightbox.mjs` بمتصفّحٍ حقيقيّ (فأرة ولمس وقرص). */
  const lb = readFileSync("src/components/ImageLightbox.tsx", "utf8");
  check("الجذرُ لا يُغلق بأيّ نقرة (لا onClick={onClose})", !/onClick=\{onClose\}/.test(lb));
  check("  والإغلاقُ قرارُ الإيماءة: بدأت على الخلفية، بزرٍّ أيسر، بلا حركةٍ ولا إصبعٍ ثانٍ",
    /tapClose\.current = !!g && e\.type === "pointerup" && e\.button === 0 && !g\.onImg && !g\.moved && !g\.multi/.test(lb));
  check("  والنقرُ المزدوج على المسرح بشرط أن الإيماءةَ بدأت على الصورة", /onDoubleClick=\{onDoubleClick\}/.test(lb) && /if \(!g \|\| !g\.onImg/.test(lb));
  check("  والالتقاطُ حين يبدأ سحبٌ أو قرصٌ فقط — لا مع كلّ ضغطة",
    (lb.match(/capture\(e\);/g) || []).length === 2 && (lb.match(/setPointerCapture/g) || []).length === 1);
}

console.log("\n▸ 0229 — قفلُ التمرير بعدّاد: نافذةٌ فوق نافذة لا تفكّه");
{
  /* الحزمةُ الأصلية (Dialog.tsx) لا نسخة: ما يجاورها من React وغيره بدائلُ فارغة — الفحصُ
   * يسأل `lockBodyScroll` وحدَها، وهي لا تلمس غيرَ document.body.style. */
  const { resolve } = await import("node:path");
  const stub = {
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (a) => {
        if (a.kind === "entry-point") return undefined;
        if (/modalStack$/.test(a.path)) return { path: resolve("src/lib/modalStack.ts") };
        return { path: a.path, namespace: "stub" };
      });
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "module.exports = {};", loader: "js" }));
    },
  };
  const dlg = await esbuild.build({ entryPoints: ["src/components/ui/Dialog.tsx"], bundle: true, format: "esm", write: false, platform: "neutral", plugins: [stub], logLevel: "silent" });
  globalThis.document = { body: { style: { overflow: "" } } };
  const body = globalThis.document.body.style;
  const { lockBodyScroll } = await import("data:text/javascript;base64," + Buffer.from(dlg.outputFiles[0].text).toString("base64"));

  const sheet = lockBodyScroll();
  check("نافذةٌ تقفل", body.overflow === "hidden");
  const studio = lockBodyScroll();
  studio();
  check("**إغلاقُ الاستوديو فوق البطاقة لا يفكّ القفل** (كان يكتب \"\")", body.overflow === "hidden", JSON.stringify(body.overflow));
  studio();
  check("  وتنظيفٌ يُنادى مرّتين لا يفكّ قفلَ غيره", body.overflow === "hidden");
  sheet();
  check("  وإغلاقُ البطاقة يفكّه", body.overflow === "");

  const a = lockBodyScroll(), b = lockBodyScroll();
  a();
  check("إغلاقٌ بغير ترتيب الفتح (الخارجيّةُ أوّلاً) يُبقيه مقفولاً", body.overflow === "hidden");
  b();
  check("  ثمّ يُفكّ — لا يعلق «مقفولاً» بعد أن أُغلق كلُّ شيء", body.overflow === "", JSON.stringify(body.overflow));

  body.overflow = "hidden"; // قافلٌ قديمٌ (Modal) مفتوح
  const over = lockBodyScroll();
  over();
  check("نافذةٌ فوق قافلٍ قديم تُرجع قفلَه كما كان", body.overflow === "hidden");
  const inner = lockBodyScroll();
  body.overflow = ""; // القديمُ (الأمّ) فكّ عند تفكيكه — قبل ابنته بنفس الدفعة
  inner();
  check("  وأمٌّ قديمةٌ فكّت قبل ابنتها: لا يُعاد «مقفول» المحفوظ (صفحةٌ عالقةٌ بلا تمرير)", body.overflow === "", JSON.stringify(body.overflow));

  const dsrc = readFileSync("src/components/ui/Dialog.tsx", "utf8");
  check("Dialog يقفل بالعدّاد ولا يكتب \"\" بنفسه", /const unlock = lockBodyScroll\(\);/.test(dsrc) && !/style\.overflow = ""/.test(dsrc));
  const msrc = readFileSync("src/components/Modal.tsx", "utf8");
  check("  وModal بنفس العدّاد (منتقي المكتبة فوق بطاقة المنتج)", /const unlock = lockBodyScroll\(\);/.test(msrc) && !/style\.overflow/.test(msrc));
  const lsrc = readFileSync("src/components/ImageLightbox.tsx", "utf8");
  check("  والعارضُ بنفس العدّاد (عارضٌ فوق بطاقة)", /const unlock = lockBodyScroll\(\);/.test(lsrc) && !/style\.overflow/.test(lsrc));
}

console.log(`\n${fails ? "✗" : "✓"} modal-stack-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
