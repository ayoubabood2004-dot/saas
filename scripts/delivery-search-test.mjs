// البحثُ بطلبات التوصيل — القاعدةُ النقيّة (src/lib/deliverySearch.ts).
// ما يحرسه: كلُّ حقلٍ والسؤالُ يمرّان من نفس التطبيع (رقمُ الطلب بفواصله وحالته وأرقامه
// الشرقية، والهاتفُ بمسافاته و+964 وصفره، والاسمُ بهمزته وتائه)، والهاتفُ لا يُجرَّب على
// سؤالٍ فيه أحرف، ورقمُ الفاتورة بـINV أو بذيله، والنتائجُ كلُّها بلا سقف وأقواها أوّلاً.
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const dir = mkdtempSync(join(tmpdir(), "dsearch-")); const out = join(dir, "m.mjs");
await build({ entryPoints: ["src/lib/deliverySearch.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
const m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };
const DIAL = "+964";

const mk = (id, over = {}) => ({
  id, invoice_id: `00000000-0000-4000-8000-0000000${id}`, courier_id: "c1", customer_name: null, customer_phone: null,
  zone: null, address: null, note: null, delivery_fee: 0, fee_to_clinic: false, cod_amount: 1000, prepaid: 0,
  status: "out", created_at: `2026-10-0${id.length % 9 + 1}T10:00:00Z`, courier_ref: null, ...over,
});
const orders = [
  mk("a1b2c3", { customer_name: "أحمد علي", customer_phone: "0770 123 4567", courier_ref: "BX-1234", zone: "المنصور", created_at: "2026-10-01T10:00:00Z" }),
  mk("d4e5f6", { customer_name: "فاطمة حسن", customer_phone: "+964 771 999 8888", courier_ref: "bx1299", address: "شارع فلسطين", created_at: "2026-10-02T10:00:00Z" }),
  mk("777001", { customer_name: "مصطفى", customer_phone: "٠٧٨٠٥٥٥١٢٣٤", courier_ref: null, note: "باب أخضر", created_at: "2026-10-03T10:00:00Z" }),
  mk("abc999", { customer_name: "أبو زهراء", customer_phone: null, courier_ref: "AW 55/7", created_at: "2026-10-04T10:00:00Z" }),
];
const names = { c1: "شركة البرق" };
const index = orders.map((o) => m.indexDelivery(o, names[o.courier_id]));
const ids = (q) => m.searchDeliveries(index, q, DIAL).map((r) => r.o.id);
const hitOf = (q, id) => m.searchDeliveries(index, q, DIAL).find((r) => r.o.id === id)?.hit;

console.log("▸ رقمُ الطلب — نفسُ التطبيع للمحفوظ وللسؤال");
check("cleanRef: شرقيّ ← لاتينيّ، بلا مسافاتٍ ولا محارفَ خفيّة، والحالةُ كما كُتبت", m.cleanRef(" ‏BX-١٢٣٤ ") === "BX-1234", m.cleanRef(" ‏BX-١٢٣٤ "));
check("cleanRef: الفراغُ NULL لا ''", m.cleanRef("   ") === null && m.cleanRef(null) === null);
check("cleanRef: يقصّ عند ٤٠", m.cleanRef("9".repeat(70)).length === 40);
check("«BX-1234» يلقاه بالضبط وأوّلاً", ids("BX-1234")[0] === "a1b2c3" && m.searchDeliveries(index, "BX-1234", DIAL)[0].exact);
check("  وبحروفٍ صغيرة وبلا فاصلة", ids("bx1234")[0] === "a1b2c3");
check("  وبأرقامٍ شرقية", ids("bx-١٢٣٤")[0] === "a1b2c3");
check("  وبجزءٍ منه: «BX» يجيب الاثنين", ["a1b2c3", "d4e5f6"].every((x) => ids("BX").includes(x)) && ids("BX").length === 2, ids("BX"));
check("  والرقمُ بمسافةٍ وشرطة مائلة «AW 55/7» = «aw557»", ids("aw557")[0] === "abc999", ids("aw557"));
check("  ويُقال إنه طابق برقم الطلب", hitOf("BX-1234", "a1b2c3") === "ref");

console.log("▸ الهاتف");
check("0770 123 4567 بلا مسافات", ids("07701234567").includes("a1b2c3"));
check("  وبصيغة +964", ids("+964 770 123 4567").includes("a1b2c3"));
check("  وبذيله وحده", ids("4567").includes("a1b2c3"));
check("المحفوظُ بأرقامٍ شرقية يطابق سؤالاً لاتينياً", ids("07805551234").includes("777001"));
check("  والمحفوظُ بـ+964 يطابق سؤالاً بالصفر", ids("07719998888").includes("d4e5f6"));
check("سؤالٌ فيه أحرف لا يُجرَّب على الهاتف: «INV-A1B2C3» لا يطابق هاتفاً فيه ١٢٣", !ids("INV-A1B2C3").includes("777001") && ids("INV-A1B2C3").length === 1, ids("INV-A1B2C3"));
check("رقمان لا يكفيان لهاتف (ضجيج)", m.parseQuery("07").phoneish === false);

console.log("▸ رقمُ الفاتورة");
check("«INV-A1B2C3» يلقى فاتورتَه وحدها", ids("INV-A1B2C3")[0] === "a1b2c3" && hitOf("INV-A1B2C3", "a1b2c3") === "invoice");
check("  وبحروفٍ صغيرة و#", ids("#inv-a1b2c3")[0] === "a1b2c3");
check("  وبالذيل وحده «d4e5f6»", ids("d4e5f6")[0] === "d4e5f6");
check("  وسؤالُ INV لا يطابق الأسماءَ ولا الأرقام", m.searchDeliveries(index, "INV-zzzzzz", DIAL).length === 0);

console.log("▸ الاسم والمكان والحامل");
check("«احمد» بلا همزة يلقى «أحمد علي»", ids("احمد").includes("a1b2c3") && hitOf("احمد", "a1b2c3") === "name");
check("«فاطمه» بالهاء يلقى «فاطمة»", ids("فاطمه").includes("d4e5f6"));
check("المنطقة «المنصور»", hitOf("المنصور", "a1b2c3") === "place");
check("العنوان «فلسطين»", hitOf("فلسطين", "d4e5f6") === "place");
check("الملاحظة «اخضر»", hitOf("اخضر", "777001") === "note");
check("اسمُ الشركة يجيب كلَّ طلباتها", ids("البرق").length === 4);

console.log("▸ الترتيب والحدود");
check("سؤالٌ فارغ = الكلّ، الأحدثُ أوّلاً", ids("").join(",") === "abc999,777001,d4e5f6,a1b2c3", ids(""));
check("لا سقف: كلُّ المطابقات ترجع", m.searchDeliveries(orders.concat(Array.from({ length: 300 }, (_, i) => mk(`x${String(i).padStart(5, "0")}`, { customer_name: "زبون" }))).map((o) => m.indexDelivery(o)), "زبون", DIAL).length === 300);
check("المطابقُ برقم الطلب يسبق المطابقَ بالاسم", (() => {
  const ix = [mk("n00001", { customer_name: "bx1234 الزبون", created_at: "2026-10-09T10:00:00Z" }), orders[0]].map((o) => m.indexDelivery(o));
  return m.searchDeliveries(ix, "bx1234", DIAL)[0].o.id === "a1b2c3";
})());
check("ما لا يطابق شيئاً يرجع فارغاً لا الكلّ", m.searchDeliveries(index, "ماكو هيچ اسم", DIAL).length === 0);

console.log("▸ تكرارُ الرقم ينبَّه عليه");
check("نفسُ الرقم لنفس الحامل بطلبٍ آخر", m.refTwin(orders, { id: "zz", courier_id: "c1" }, "bx 1234")?.id === "a1b2c3");
check("  لا يحسب الطلبَ نفسَه", m.refTwin(orders, { id: "a1b2c3", courier_id: "c1" }, "BX-1234") === null);
check("  ولا حاملاً آخر", m.refTwin(orders, { id: "zz", courier_id: "c2" }, "BX-1234") === null);
check("  والفارغُ لا يُنبَّه عليه", m.refTwin(orders, { id: "zz", courier_id: "c1" }, "  ") === null);

console.log(fail === 0 ? `✓ بحث التوصيل: ${pass} فحصاً عبرت` : `✗ ${fail} فشلت من ${pass + fail}`);
if (fail) process.exit(1);
