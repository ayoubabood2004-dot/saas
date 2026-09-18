/* ============================================================================
 * فحصُ الجيوب — «الصافي لكلّ جيب، لا للنقد وحدَه».
 *
 * ما كشفه القياس على الإنتاج قبل هذا الملفّ (آب ٢٠٢٦):
 *   تحويلٌ داخل ٢٬٣٤٨٬٠٠٠ · خارج ٣٬٣٣٢٬٠٠٠ ⇒ الصافي **سالبٌ** ٩٨٤٬٠٠٠
 * والشاشةُ كانت تعرض «+٢٬٣٤٨٬٠٠٠». ليس رقماً ناقصاً — إشارةٌ معكوسة. وسببُه
 * أنّ الداخلَ مفرداتُه `transfer` والخارجَ `bank`، فجيبٌ واحدٌ باسمين لا يلتقيان.
 *
 * والفحصُ على وحدةٍ نقيّة (`src/lib/pockets.ts`) لا على شاشة: الحسابُ
 * الذي لا يُفحص إلا بالعين حسابٌ لم يُفحص.
 *
 *   node scripts/pockets-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};

const built = await esbuild.build({
  entryPoints: ["src/lib/pockets.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "types-stub",
    setup(b) {
      b.onResolve({ filter: /^@\/types$/ }, () => ({ path: "types", namespace: "stub" }));
      b.onLoad({ filter: /.*/, namespace: "stub" }, () => ({ contents: "export default {};", loader: "js" }));
    },
  }],
});
const dir = mkdtempSync(join(tmpdir(), "pockets-"));
const file = join(dir, "m.mjs");
writeFileSync(file, built.outputFiles[0].text);
const { netPerPocket, pocketOfExpense, pocketOfPayment, expenseMethodOf, POCKETS } =
  await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

console.log("▸ جيبٌ واحدٌ باسمين — `transfer` القابضة و`bank` الساحبة");
check("`bank` تسقط بجيب `transfer` لا بجيبٍ رابع", pocketOfExpense("bank") === "transfer");
check("  و`card` بجيبها", pocketOfExpense("card") === "card" && pocketOfPayment("card") === "card");
check("  و`transfer` القابضة بنفس الجيب", pocketOfPayment("transfer") === "transfer");
check("  والجيوبُ ثلاثةٌ لا أكثر", POCKETS.length === 3 && POCKETS.join() === "cash,card,transfer");
check("سحبٌ بلا طريقةٍ نقدٌ (صفوفٌ سبقت وجودَ العمود)", pocketOfExpense(null) === "cash" && pocketOfExpense(undefined) === "cash");
check("وطريقةٌ مجهولةٌ لا تضيع — تسقط بالنقد", pocketOfExpense("bitcoin") === "cash" && pocketOfPayment("bitcoin") === "cash");

console.log("▸ ترجمةُ الجيب بموضعٍ واحد (كانت منسوخةً بأربعة)");
for (const [inp, out] of [["card", "card"], ["transfer", "bank"], ["bank", "bank"], ["cash", "cash"], ["TRANSFER", "bank"], [null, "cash"], ["مجهول", "cash"]]) {
  check(`  expenseMethodOf(${JSON.stringify(inp)}) ⇒ ${out}`, expenseMethodOf(inp) === out, String(expenseMethodOf(inp)));
}

console.log("▸ حالةُ الإنتاج التي كشفت العطب (آب ٢٠٢٦)");
const aug = netPerPocket(
  [{ method: "transfer", amount: 2348000 }, { method: "card", amount: 4018000 }],
  [{ method: "bank", amount: 3332000 }, { method: "card", amount: 320000 }],
);
check("صافي التحويل **سالبٌ** ٩٨٤٬٠٠٠ لا موجبٌ ٢٬٣٤٨٬٠٠٠", aug.transfer.net === -984000, String(aug.transfer.net));
check("  والمسحوبُ وصل جيبَه لا جيبَ النقد", aug.transfer.out === 3332000 && aug.cash.out === 0);
check("  وصافي البطاقة ٣٬٦٩٨٬٠٠٠", aug.card.net === 3698000, String(aug.card.net));
check("  والنقدُ ما تلوّث بشيءٍ ليس له", aug.cash.in === 0 && aug.cash.net === 0);

console.log("▸ الساقُ السالبة تصحيحُ تحصيلٍ لا سطرٌ يُرمى (0113)");
const corr = netPerPocket([{ method: "cash", amount: 10000 }, { method: "cash", amount: -3000 }], []);
check("المُحصَّلُ ٧٠٠٠ لا ١٠٠٠٠", corr.cash.in === 7000, String(corr.cash.in));
check("  والعدُّ ساقان (كلتاهما حركةٌ وقعت)", corr.cash.inCount === 2);

console.log("▸ حرّاسُ المدخلات");
const junk = netPerPocket(
  [{ method: "cash", amount: 0 }, { method: "cash", amount: NaN }, { method: "cash", amount: 500 }],
  [{ method: "cash", amount: 0 }, { method: null, amount: 200 }],
);
check("الصفرُ وNaN لا يُعدّان حركة", junk.cash.inCount === 1 && junk.cash.outCount === 1);
check("  والصافي ٣٠٠", junk.cash.net === 300, String(junk.cash.net));
const zero = netPerPocket([], []);
check("بلا حركةٍ إطلاقاً: أصفارٌ لا NaN", POCKETS.every((k) => zero[k].in === 0 && zero[k].out === 0 && zero[k].net === 0));

console.log("▸ الصافي يطابق مجموعَه مهما تفرّقت الحركات");
const many = netPerPocket(
  [{ method: "cash", amount: 1 }, { method: "card", amount: 2 }, { method: "transfer", amount: 4 }],
  [{ method: "cash", amount: 8 }, { method: "card", amount: 16 }, { method: "bank", amount: 32 }],
);
check("كلُّ جيبٍ = داخلُه − خارجُه", POCKETS.every((k) => many[k].net === many[k].in - many[k].out));
check("  ومجموعُ الصوافي = مجموعُ الداخل − مجموعُ الخارج",
  POCKETS.reduce((s, k) => s + many[k].net, 0) === (1 + 2 + 4) - (8 + 16 + 32));

console.log(fails ? `\n✗ pockets-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ pockets-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
