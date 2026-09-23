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

console.log(`\n${fails ? "✗" : "✓"} modal-stack-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
