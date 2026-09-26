/* ============================================================================
 * فحصُ اقتراح الطلب (م٥) — `src/lib/reorder.ts` بسلوكه.
 *   node scripts/reorder-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let fails = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { fails++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const r = await esbuild.build({ entryPoints: ["src/lib/reorder.ts"], bundle: true, format: "esm", write: false, platform: "neutral", logLevel: "silent" });
const X = await import("data:text/javascript;base64," + Buffer.from(r.outputFiles[0].text).toString("base64"));
const P = (id, o = {}) => ({ id, name: id, stock: 0, min_stock: 0, company_id: null, ...o });

console.log("▸ ١) نقطةُ إعادة الطلب");
{
  // ٣٠ بيعت بـ٣٠ يوماً = ١/يوم، مهلة ٧، حدّ ٢ ⇒ ROP = ٩
  const a = X.reorderItem(P("a", { stock: 9, min_stock: 2 }), 30, 30, 7);
  check("رصيدٌ = ROP (٩) ⇒ يُقترح", !!a && Math.abs(a.rop - 9) < 1e-9, JSON.stringify(a));
  check("  والكميةُ تغطّي المهلةَ وشهراً فوق الحدّ ناقصَ الرصيد: ١×(٧+٣٠)+٢−٩ = ٣٠", a?.suggest === 30, String(a?.suggest));
  check("رصيدٌ فوق ROP (١٠) ⇒ لا يُقترح", X.reorderItem(P("b", { stock: 10, min_stock: 2 }), 30, 30, 7) === null);
  check("لا تُباع ولا حدّ ⇒ لا تُقترح (ولو رصيدُها صفر)", X.reorderItem(P("c", { stock: 0 }), 0, 30, 7) === null);
  const d = X.reorderItem(P("d", { stock: 1, min_stock: 3 }), 0, 30, 7);
  check("لا تُباع لكن تحت حدّها ⇒ تُقترح لتبلغ الحدّ (٣−١ = ٢)", d?.suggest === 2, JSON.stringify(d));
  check("المجمَّعةُ خارجة (رصيدُها بالحوض)", X.reorderItem(P("e", { stock: 0, pooled: true, min_stock: 5 }), 30, 30, 7) === null);
  check("الكميةُ واحدٌ على الأقل وتُقرّب للأعلى", X.reorderItem(P("f", { stock: 0.2 }), 1, 30, 7)?.suggest >= 1);
  check("المهلةُ تغيّر الحكم: مهلةُ ١٤ تجعل ٩ تحت ROP (١٤+٢=١٦)", !!X.reorderItem(P("g", { stock: 12, min_stock: 2 }), 30, 30, 14));
}
console.log("▸ ٢) التجميعُ بالشركة");
{
  const cos = { A: "شركة ألف", B: "شركة باء" };
  const ps = [P("a1", { company_id: "A", stock: 0 }), P("a2", { company_id: "A", stock: 5 }), P("b1", { company_id: "B", stock: 0 }), P("n1", { stock: 0 }), P("x", { company_id: "ghost", stock: 0 })];
  const sold = new Map([["a1", 30], ["a2", 30], ["b1", 30], ["n1", 30], ["x", 30]]);
  const g = X.reorderPlan(ps, sold, 30, 7, (id) => cos[id], "بدون شركة");
  check("المجموعاتُ بالشركة، الأكثرُ موادَّ أوّلاً، و«بدون شركة» آخراً", g.map((x) => x.company).join() === "شركة ألف,شركة باء,بدون شركة", g.map((x) => x.company).join());
  check("  وشركةٌ غيرُ معروفة (محذوفة) تنزل «بدون شركة» ولا تُسقط", g[2].items.map((i) => i.product.id).sort().join() === "n1,x");
  check("  وداخلها الأقربُ للنفاد أوّلاً", g[0].items.map((i) => i.product.id).join() === "a1,a2");
  const txt = X.orderText(g[0], (it) => it.suggest, (k, o) => (k === "reorder.textHead" ? `H:${o.company}:${o.date}` : `L:${o.name}:${o.qty}`), "2026-09-26");
  check("نصُّ المندوب: رأسٌ بالشركة والتاريخ، وسطرٌ لكلّ مادةٍ بكميتها، بلا أسعار", txt === "H:شركة ألف:2026/09/26\nL:a1:37\nL:a2:32", txt);
  const txt0 = X.orderText(g[0], () => 0, (k, o) => (k === "reorder.textHead" ? "H" : `L:${o.name}`), "2026-09-26");
  check("  والكميةُ صفر (شالها المستخدم) لا تُكتب", txt0 === "H");
}
console.log(`\n${fails ? "✗" : "✓"} reorder-test: ${passes} نجحت، ${fails} فشلت`);
process.exit(fails ? 1 : 0);
