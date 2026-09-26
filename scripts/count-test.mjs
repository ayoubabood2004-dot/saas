/* ============================================================================
 * فحصُ الجرد الدوريّ (م٦) — `src/lib/countPick.ts` بسلوكه.
 *   node scripts/count-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const r = await esbuild.build({ entryPoints: ["src/lib/countPick.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
const X = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const P = (id, o = {}) => ({ id, name: id, stock: 5, purchase_price: 1000, ...o });
const NOW = new Date(2026, 8, 26, 12);
const ago = (d) => new Date(NOW.getTime() - d * 86_400_000).toISOString();

console.log("▸ ١) ABC بقيمة المبيع");
{
  const ps = [P("big"), P("mid"), P("small"), P("none")];
  const sold = new Map([["big", 80], ["mid", 15], ["small", 5]]);
  const c = X.abcClasses(ps, sold);
  check("٨٠٪ من القيمة ⇒ A", c.get("big") === "A", c.get("big"));
  check("  حتى ٩٥٪ ⇒ B", c.get("mid") === "B", c.get("mid"));
  check("  والباقي ⇒ C", c.get("small") === "C", c.get("small"));
  check("  وما لا يُباع ⇒ C", c.get("none") === "C", c.get("none"));
  const one = X.abcClasses([P("a"), P("b")], new Map([["a", 9], ["b", 1]]));
  check("المادةُ التي تعبر ٨٠٪ تبقى A (٩٠٪ ⇒ A، والتي تبدأ بعد ٩٠٪ ⇒ B)", one.get("a") === "A" && one.get("b") === "B", JSON.stringify([...one]));
}

console.log("▸ ٢) عدّ اليوم");
{
  const ps = [P("a"), P("b"), P("c"), P("pooled", { pooled: true }), P("farm", { farm_id: "f" }), P("empty", { stock: 0 }), P("pend"), P("today")];
  const sold = new Map([["a", 50], ["b", 1], ["c", 1]]);
  const state = new Map([
    ["a", { lastCountedAt: ago(40), lastDiffAt: null }],
    ["b", { lastCountedAt: ago(10), lastDiffAt: null }],
    ["c", { lastCountedAt: ago(10), lastDiffAt: ago(10) }],
    ["today", { lastCountedAt: ago(0), lastDiffAt: null }],
  ]);
  const picks = X.pickToday(ps, sold, state, 10, NOW, new Set(["pend"]));
  const ids = picks.map((p) => p.product.id);
  check("المجمَّعةُ ومخزنُ الحقل خارجان", !ids.includes("pooled") && !ids.includes("farm"), ids.join(","));
  check("  والمعلَّقةُ بانتظار الموافقة خارجة", !ids.includes("pend"), ids.join(","));
  check("  وما انعدّ اليوم خارج", !ids.includes("today"), ids.join(","));
  check("  ورصيدٌ صفر بلا مبيع خارج (لا شيء يُعدّ)", !ids.includes("empty"), ids.join(","));
  check("A متأخّرةٌ عن دورتها (٤٠ من ٣٠) تسبق C عدّت قبل ١٠", ids.indexOf("a") < ids.indexOf("b"), ids.join(","));
  check("المشكوكةُ تسبق نظيرتَها البريئة", ids.indexOf("c") < ids.indexOf("b"), ids.join(","));
  const a = picks.find((p) => p.product.id === "a");
  check("  والسببُ يُقال: A ومتأخّرة", a?.why.join(",") === "abc_a,stale", a?.why.join(","));
  check("  والمشكوكةُ تقول «فرّقت قبل»", picks.find((p) => p.product.id === "c")?.why.includes("suspect"));
  check("العددُ يُحترم", X.pickToday(ps, sold, state, 2, NOW).length === 2);
  const never = X.pickToday([P("n"), P("old")], new Map(), new Map([["old", { lastCountedAt: ago(100), lastDiffAt: null }]]), 5, NOW);
  check("ما انعدّت أبداً تسبق ما انعدّت قبل ١٠٠ يوم", never[0]?.product.id === "n" && never[0].why.includes("never"), never.map((p) => p.product.id).join(","));
}

console.log("▸ ٣) الأسبابُ مرآةُ الخادم");
{
  check("النقصُ: تالف/منتهي/عجز/خطأ إدخال", X.reasonsFor(-2).join(",") === "damaged,expired,shortage,entry_error");
  check("الزيادةُ: لقينا زيادة/خطأ إدخال", X.reasonsFor(3).join(",") === "found,entry_error");
  check("المطابقُ بلا سبب", X.reasonsFor(0).length === 0);
  check("السحبُ للتالف والمنتهي والعجز وحدها (خطأُ الإدخال ليس مالاً)", X.WITHDRAWAL_REASONS.join(",") === "damaged,expired,shortage");
  check("قيمةُ الفرق بإشارة التقرير: نقصُ ٣ × ٢٠٠٠ = ٦٠٠٠", X.diffValue(10, 7, 2000) === 6000);
  check("  والزيادةُ سالبة", X.diffValue(1, 3, 700) === -1400);
}

console.log("▸ ٤) الراكد");
{
  const d = X.deadStock([P("sells"), P("dead", { stock: 4, purchase_price: 500 }), P("dead2", { stock: 1, purchase_price: 9000 }), P("zero", { stock: 0 }), P("pool", { pooled: true })], new Map([["sells", 3]]));
  check("رصيدٌ بلا مبيع، الأغلى أوّلاً", d.map((x) => x.product.id).join(",") === "dead2,dead", d.map((x) => x.product.id).join(","));
  check("  بقيمة سعر الشراء", d[1]?.value === 2000, String(d[1]?.value));
}

console.log(`\n${fails ? "✗" : "✓"} count-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
