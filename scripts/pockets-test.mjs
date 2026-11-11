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
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
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
const { netPerPocket, pocketOfExpense, pocketOfPayment, expenseMethodOf, POCKETS, pocketsShown, shownPocketOfExpense } =
  await import(pathToFileURL(file).href).finally(() => { try { rmSync(dir, { recursive: true, force: true }); } catch { /* ignore */ } });

console.log("▸ جيبٌ واحدٌ باسمين — `transfer` القابضة و`bank` الساحبة");
check("`bank` تسقط بجيب `transfer` لا بجيبٍ رابع", pocketOfExpense("bank") === "transfer");
check("  و`card` بجيبها", pocketOfExpense("card") === "card" && pocketOfPayment("card") === "card");
check("  و`transfer` القابضة بنفس الجيب", pocketOfPayment("transfer") === "transfer");
check("  والجيوبُ ثلاثةٌ لا أكثر", POCKETS.length === 3 && POCKETS.join() === "cash,card,transfer");
check("سحبٌ بلا طريقةٍ نقدٌ (صفوفٌ سبقت وجودَ العمود)", pocketOfExpense(null) === "cash" && pocketOfExpense(undefined) === "cash");
check("وطريقةٌ مجهولةٌ لا تضيع — تسقط بالنقد", pocketOfExpense("bitcoin") === "cash" && pocketOfPayment("bitcoin") === "cash");
check("و«من الحساب» (0262) لا يسقط بالنقد — جيبُه المشترك (البطاقة والتحويل معاً)", pocketOfExpense("account") === "shared");

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

console.log("▸ سحبُ المخزن (0216) لا جيبَ له");
const stk = netPerPocket([{ method: "cash", amount: 1000 }], [{ method: "stock", amount: 600 }, { method: "cash", amount: 100 }]);
check("خسارةُ الجرد لا تُطرح من الدرج (فلوسُها طلعت يوم الشراء)", stk.cash.out === 100 && stk.cash.net === 900, JSON.stringify(stk.cash));
check("  ولا من البطاقة ولا التحويل", stk.card.out === 0 && stk.transfer.out === 0);

/* ── 0262: البطاقةُ والتحويل حسابٌ واحد ────────────────────────────────────────────────
   بلاغُ المالك حرفاً: استلم ٢٥٠٠ بطاقة و١٥٠٠ تحويل على نفس الحساب، ورأى ٤٠٠٠ فسحبها «من البطاقة» — والتقريرُ
   قال البطاقةُ −١٥٠٠ والتحويلُ +١٥٠٠. والعرضُ فوق الصفوف كما سُجّلت: لا يغيّر سحباً، ومطفأً يطابق القديمَ حرفاً. */
console.log("▸ 0262: البطاقة والتحويل حسابٌ واحد — بلاغُ المالك حرفاً");
const sale = [{ method: "cash", amount: 1000 }, { method: "card", amount: 2500 }, { method: "transfer", amount: 1500 }];
const owner = netPerPocket(sale, [{ method: "card", amount: 4000 }]);
check("مفصولاً (العرضُ القديم): البطاقةُ −١٥٠٠ والتحويلُ +١٥٠٠ — العطبُ كما بُلّغ", owner.card.net === -1500 && owner.transfer.net === 1500, JSON.stringify([owner.card.net, owner.transfer.net]));
const one = pocketsShown(owner, true);
const accRow = one.rows.find((r) => r.key === "account");
check("  وحساباً واحداً: جيبان (الدرج والحساب)، والحسابُ داخلُه ٤٠٠٠ ومسحوبُه ٤٠٠٠ وصافيه صفر — لا سالب",
  one.merged && !one.forced && one.rows.map((r) => r.key).join() === "cash,account" && accRow.flow.in === 4000 && accRow.flow.out === 4000 && accRow.flow.net === 0,
  JSON.stringify(one.rows));
check("  والدرجُ كما هو حرفاً (١٠٠٠، لا شيءَ من الحساب)", one.rows[0].flow === owner.cash && owner.cash.net === 1000);

console.log("▸ 0262: الأشهرُ الماضية — العرضُ فوق الصفوف كما سُجّلت");
const old = netPerPocket(
  [{ method: "transfer", amount: 2348000 }, { method: "card", amount: 4018000 }, { method: "cash", amount: 500 }],
  [{ method: "bank", amount: 3332000 }, { method: "card", amount: 320000 }, { method: null, amount: 200 }],
);
const sep = pocketsShown(old, false);
check("مطفأً: الجيوبُ الثلاثة بأرقامها القديمة نفسِها (نفسُ الكائنات، لا نسخةٌ معادة الحساب)",
  !sep.merged && sep.rows.map((r) => r.key).join() === "cash,card,transfer" && sep.rows.every((r) => r.flow === old[r.key]));
const merged = pocketsShown(old, true);
const m2 = merged.rows.find((r) => r.key === "account").flow;
check("  ومفعّلاً: الحسابُ = البطاقة + التحويل (داخلاً ومسحوباً وعدّاً) — سحوباتُ card وbank القديمة تُجمع بلا ترحيل",
  m2.in === 4018000 + 2348000 && m2.out === 320000 + 3332000 && m2.inCount === 2 && m2.outCount === 2 && m2.net === m2.in - m2.out, JSON.stringify(m2));
const netOf = (v) => v.rows.reduce((s, r) => s + r.flow.net, 0);
check("  والثابت: مجموعُ الصافي بأيّ عرضٍ واحد — لا عرضَ يُخفي فلساً", netOf(sep) === netOf(merged) && netOf(merged) === (2348000 + 4018000 + 500) - (3332000 + 320000 + 200));

console.log("▸ 0262: سحبٌ «من الحساب» يُكتب كما حصل ولا يُقسَّم تخميناً");
const acc3 = netPerPocket(sale, [{ method: "account", amount: 4000 }, { method: "cash", amount: 100 }]);
check("«من الحساب» لا يمسّ الدرجَ ولا البطاقةَ ولا التحويل — جيبُه المشترك", acc3.cash.out === 100 && acc3.card.out === 0 && acc3.transfer.out === 0 && acc3.shared.out === 4000 && acc3.shared.net === -4000, JSON.stringify(acc3.shared));
const f = pocketsShown(acc3, false);
check("  والعيادةُ فصلت الحسابين بعدها: مدّةٌ فيها مثلُه تُعرض مدموجةً (forced) — لا يُنسب للتحويل ولا للبطاقة",
  f.merged && f.forced && f.rows.find((r) => r.key === "account").flow.net === 0, JSON.stringify(f));
check("  ومدّةٌ بلا مثله تُعرض مفصولةً كما اختارت", !pocketsShown(netPerPocket(sale, [{ method: "card", amount: 10 }]), false).merged);
check("  وصافي «الحساب» بالعرضين = الداخل − (البطاقة + الحوالة + من الحساب)", netOf(pocketsShown(acc3, true)) === netOf(f) && netOf(f) === 5000 - 4100);

console.log("▸ 0262: شاراتُ «منين انسحبت» بجيب العرض");
for (const [m, mergedOn, want] of [["cash", true, "cash"], ["card", true, "account"], ["bank", true, "account"], ["account", true, "account"], ["stock", true, null],
  ["card", false, "card"], ["bank", false, "transfer"], ["account", false, "account"], [null, false, "cash"], [null, true, "cash"]]) {
  check(`  shownPocketOfExpense(${JSON.stringify(m)}, ${mergedOn}) ⇒ ${want}`, shownPocketOfExpense(m, mergedOn) === want, String(shownPocketOfExpense(m, mergedOn)));
}

/* الأسلاكُ نصّاً (الحسابُ مفحوصٌ بسلوكه أعلاه): الشاشةُ تعرض الجيوبَ بخيار العيادة، ونموذجُ السحب «الدرج/الحساب»
   حين يُدمجان، والخيارُ نعم افتراضياً والغائبُ نعم، والقاعدةُ تقبل account. */
console.log("▸ 0262: الأسلاك");
const rd = (f) => readFileSync(f, "utf8");
const hub = rd("src/pages/AnalyticsHub.tsx"), set = rd("src/lib/settings.ts"), mig = rd("supabase/migrations/0262_one_account.sql");
check("التقاريرُ تعرض الجيوبَ بخيار العيادة (pocketsShown + getCardTransferOneAccount)، ولا جيوبَ ثلاثةٌ ثابتة",
  /const oneAccount = getCardTransferOneAccount\(\);\s*const shown = useMemo\(\(\) => pocketsShown\(pockets, oneAccount\), \[pockets, oneAccount\]\);/.test(hub) && !/POCKETS\.(map|filter)/.test(hub));
check("  ونموذجُ السحب: الدرجُ والحساب حين يُدمجان، والثلاثةُ القديمة حين يُفصلان",
  /oneAccount \? m\.id === "cash" \|\| m\.id === "account" : m\.id === "cash" \|\| m\.id === "card" \|\| m\.id === "bank"/.test(hub) && /manualMethods\.map\(\(m\) =>/.test(hub));
check("  والخيارُ نعم افتراضياً: الغائبُ نعم (صفٌّ قبل الهجرة، أو جهازٌ بلا مرآة)، وما يُطفئه إلا false صريح",
  /return prefs\(\)\.one_account !== false;/.test(set) && /one_account: d\.one_account \?\? local\.one_account,/.test(set) && !/one_account: true/.test(set));
check("  والقاعدة: العمودُ نعم افتراضياً، وaccount بقيد طرق السحب",
  /add column if not exists one_account boolean not null default true/.test(mig) && /check \(method in \('cash', 'card', 'bank', 'stock', 'account'\)\)/.test(mig));

check("  والإقلاعُ لا يستورد حسابَ الجيوب: repo وrepoDemo من expenseMethod.ts وحدها (pockets.ts كان يُدخله كلَّه الإقلاع)",
  ["src/lib/repo.ts", "src/lib/repoDemo.ts"].every((f) => /from "\.\/expenseMethod"/.test(rd(f)) && !/from "\.\/pockets"/.test(rd(f))));

console.log(fails ? `\n✗ pockets-test: ${passes} نجحت، ${fails} فشلت` : `\n✓ pockets-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
