/* ============================================================================
 * دليلُ الزبائن (0232) — سلوكُ المرآة كما يراه الطبيب بشاشة البيع والتقارير.
 *
 * الشكوى: «أكتب رقم الزبون بالبيع وما يطلع، أو يطلع مرّتين، وصاحبُ الحيوان ما يطلع
 * أبداً». والمقيسُ بالإنتاج: البحثُ يرى آخرَ ٣٠٠ فاتورة، و«0770…»/«+964 770…» زبونان،
 * و«964» وحده زبونٌ لثلاثٍ وعشرين فاتورة. وكلمةُ المالك: البحثُ «عادي لو يكتب صفر قبل
 * الرقم أو حتى لو ما يكتب — يعتمد على مفتاح الدولة».
 *
 * يُحمَّل `buildCustomerDirectory` من المصدر (esbuild) — وهو نفسُه ما تقارنه الحزمةُ
 * بـcustomer_search بالقاعدة (customer-parity)، فما يُفحص هنا هو ما يجري هناك.
 *
 *   node scripts/customer-directory-test.mjs
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
  entryPoints: ["src/lib/customerDirectory.ts"], bundle: true, format: "esm", write: false,
  platform: "neutral", logLevel: "silent",
  plugins: [{
    name: "stub",
    setup(b) {
      b.onResolve({ filter: /^(i18next|react|.*\/i18n.*)$/ }, (a) => ({ path: a.path, namespace: "s" }));
      b.onLoad({ filter: /.*/, namespace: "s" }, () => ({ contents: "export default {}; export const t = (k) => k;", loader: "js" }));
    },
  }],
}).catch((e) => { console.error(`✗ customer-directory-test: ما انبنت الوحدة — ${e.message.split("\n")[0]}`); process.exit(1); });
const tmp = mkdtempSync(join(tmpdir(), "custdir-"));
const mf = join(tmp, "m.mjs");
writeFileSync(mf, built.outputFiles[0].text);
const D = await import(pathToFileURL(mf).href).finally(() => { try { rmSync(tmp, { recursive: true, force: true }); } catch { /* ignore */ } });
const find = D.buildCustomerDirectory;

let n = 0;
const day = (d) => new Date(Date.parse("2026-10-01T09:00:00Z") - d * 86400000 + (n++) * 1000).toISOString();
const I = (name, phone, d, status = "paid") => ({ id: `i${n}`, customer_name: name, customer_phone: phone, status, created_at: day(d) });
const P = (name, owner, phone, d, extra = {}) => ({ id: `p${n}`, name, owner_name: owner, owner_phone: phone, species: "cat", deceased: false, shared_with_clinic: true, created_at: day(d), ...extra });

const invoices = [
  I("أبو حسن", "+964 7701234567", 40),          // مخزونٌ بالصيغة الدولية وحدها
  I("ابو حسن", "07701234567", 2),               // ونفسُه بصيغةٍ ثانية
  I("أحمد", "07805550000", 5),
  I("زبون أول", "+964", 6), I("زبون ثاني", "+964", 7), I("زبون أول", "964", 8),
  I("مرتجع", "07812345678", 9, "refunded"),
  I("سارة", null, 10), I("سارة", "07709999999", 11),
  I("—", null, 1), I("بدون", null, 1),
  I("علي الكاظمي", "07901111111", 3), I("علي الكاظمي", "07901111111", 4),
];
const pets = [
  P("زيتونة", "أم محمد", "+964 0770 555 1234", 70),
  P("فلفل", "ام محمد", "07705551234", 65),
  P("سمسم", "أم محمد", "07705551234", 90, { deceased: true }),
  P("مخفي", "مخفيّ", "07712312312", 3, { shared_with_clinic: false }),
  P("لونا", "ابو حسن", "07701234567", 30),
];
const items = [
  { id: "l1", invoice_id: invoices[0].id, product_id: "prod-a", name: "رمل", qty: 2 },
  { id: "l2", invoice_id: invoices[1].id, product_id: "prod-a", name: "رمل قطط", qty: 1 },
  { id: "l3", invoice_id: invoices[1].id, product_id: null, name: "علاج قطة", qty: 1 },
  { id: "l4", invoice_id: invoices[0].id, product_id: null, name: "علاج قطه", qty: 1 },
  { id: "l5", invoice_id: invoices[11].id, product_id: "prod-b", name: "طوق", qty: 3 },
];
const SRC = { invoices, items, pets };
const IQ = "+964";
const keys = (page) => page.rows.map((r) => r.key);

console.log("▸ الرقمُ بأيّ صيغة (مفتاحُ دولة العيادة)");
for (const q of ["0770 123 4567", "07701234567", "7701234567", "+964 770 123", "٠٧٧٠١٢٣", "770"]) {
  const r = find(SRC, IQ, { q });
  check(`«${q}» يلقى «أبو حسن» المخزونَ بـ«+964 7701234567» — زبوناً واحداً`, r.rows[0]?.key === "p:7701234567" && keys(r).filter((k) => k === "p:7701234567").length === 1, keys(r).join(","));
}
{
  const r = find(SRC, IQ, { q: "07701234567" }).rows[0];
  check("  وصيغتان لرقمٍ واحد = شراءان لزبونٍ واحد، والاسمُ أحدثُهما", r?.purchases === 2 && r?.name === "ابو حسن" && r?.phone === "07701234567", JSON.stringify(r));
  check("  والرقمُ المطابقُ تماماً أوّلاً (مطابقٌ قبل «يبدأ به»)", r?.matched === "phone");
  check("  ولا يُلصق حيوانٌ تلقائياً — حيواناتُه تُعرض فقط", r?.pets.map((p) => p.name).join(",") === "لونا" && r?.petsAlive === 1);
}
{
  const sa = { invoices: [I("سعود", "+966 501234567", 3), I("سعود", "0501234567", 2)], pets: [] };
  check("بعيادةٍ سعودية «05…» و«+966 5…» زبونٌ واحد", find(sa, "+966", { q: "0501" }).rows.map((r) => [r.key, r.purchases]).join() === "p:501234567,2");
  check("  وبمفتاح العراق نفسُ الصفوف زبونان (المفتاحُ يتبع الدولة)", find(sa, IQ, { q: null }).rows.length === 2);
  check("  و«05» وحده قصيرٌ هناك (المفتاحُ يُشال قبل العدّ)", find(sa, "+966", { q: "05" }).total === null);
}

console.log("▸ الاسم");
check("«احمد» يلقى «أحمد»", keys(find(SRC, IQ, { q: "احمد" })).includes("p:7805550000"));
check("«ام محمد» يلقى صاحبةَ الحيوانات التي لم تشترِ", keys(find(SRC, IQ, { q: "ام محمد" }))[0] === "p:7705551234");
check("اسمُ الحيوان يلقى صاحبه (عن طريق الحيوان)", find(SRC, IQ, { q: "زيتون" }).rows.map((r) => [r.key, r.matched]).join() === "p:7705551234,pet");
check("«سارة» بلا رقم و«سارة» برقم زبونان (الاسمُ لا يُدمج عبر رقم)", keys(find(SRC, IQ, { q: "سارة" })).sort().join(",") === "n:ساره,p:7709999999");
{
  const r = find(SRC, IQ, { q: "سارة" }).rows.find((x) => x.key === "n:ساره");
  check("  وصاحبُ الاسم وحده «بلا رقم» (phone null)", r?.phone === null);
}

console.log("▸ مفتاحُ الدولة وحده والأسماءُ البديلة");
{
  const r = find(SRC, IQ, { q: "زبون" });
  check("«+964» باسمين = زبونان بالاسم، لا p:964", keys(r).sort().join(",") === "n:زبوناول,n:زبونثاني" && !keys(find(SRC, IQ, {})).includes("p:964"));
  check("  و«زبون أول» بفاتورتين (بـ«+964» و«964»)", r.rows.find((x) => x.key === "n:زبوناول")?.purchases === 2);
  check("«—» و«بدون» بلا رقم = عابرٌ بلا هويّة، لا يطلع", !find(SRC, IQ, {}).rows.some((x) => x.name === "—" || x.name === "بدون"));
}

console.log("▸ العدّ والحيوانات");
{
  const r = find(SRC, IQ, { q: "07812345678" }).rows[0];
  check("فاتورةٌ مردودة وحدها: شراء ٠ وإرجاع ١", r?.purchases === 0 && r?.refunds === 1);
  const m = find(SRC, IQ, { q: "07705551234" }).rows[0];
  check("صاحبةُ ٣ حيوانات (واحدٌ متوفّى): حيّان ومتوفّى، والأحياءُ أوّلاً", m?.petsAlive === 2 && m?.petsDeceased === 1 && m?.pets.at(-1)?.name === "سمسم" && m?.purchases === 0);
  check("حيوانٌ مخفيٌّ عن العيادة لا يُحسب ولا يطلع صاحبُه", find(SRC, IQ, { q: "07712312312" }).total === null || find(SRC, IQ, { q: "07712312312" }).rows.length === 0);
}

console.log("▸ الصفحة والترتيب");
{
  const many = { invoices: Array.from({ length: 9 }, (_, k) => I(`زبون رقم ${k + 1}`, `0790000000${k}`, k + 1)), pets: [] };
  const r = find(many, IQ, { q: "0790", limit: 8 });
  check("٨ من ٩ ⇒ total ٩ (القائمةُ تقول إنها ناقصة)", r.rows.length === 8 && r.total === 9);
  check("  والصفحةُ الثانية تكمل بلا تكرار", find(many, IQ, { q: "0790", limit: 8, offset: 8 }).rows.length === 1 && !keys(r).includes(keys(find(many, IQ, { q: "0790", limit: 8, offset: 8 }))[0]));
  check("  وصفحةٌ بعد النهاية فارغةٌ وtotal null (لا صفر كاذب)", find(many, IQ, { q: "0790", offset: 50 }).total === null);
  const byBuy = find(SRC, IQ, { sort: "purchases", limit: 3 });
  check("«الأكثر تكراراً»: الأكثرُ شراءً أوّلاً", byBuy.rows[0]?.purchases === 2 && byBuy.rows.every((x, i) => i === 0 || byBuy.rows[i - 1].purchases >= x.purchases));
  const recent = find(SRC, IQ, { sort: "recent", limit: 3 });
  check("«آخر زيارة»: الأحدثُ أوّلاً", recent.rows[0]?.lastAt != null);
}

console.log("▸ «زبائن المبيعات» بالتقارير (nopets)");
{
  const r = find(SRC, IQ, { filter: "nopets", sort: "purchases", top: 3, limit: 50 });
  check("لا صاحبَ حيوانٍ (حيٍّ أو متوفّى) ولا من لم يشترِ", r.rows.length > 0 && r.rows.every((x) => x.petsAlive + x.petsDeceased === 0 && x.purchases >= 1), keys(r).join(","));
  check("  و«أبو حسن» صاحبُ «لونا» ليس منهم، و«علي الكاظمي» منهم", !keys(r).includes("p:7701234567") && keys(r).includes("p:7901111111"));
  const ali = r.rows.find((x) => x.key === "p:7901111111");
  check("  ومع كلٍّ أكثرُ ما يشتريه — مرّاتٌ وكمية، بلا مبلغ", JSON.stringify(ali?.top) === JSON.stringify([{ name: "طوق", times: 1, qty: 3 }]), JSON.stringify(ali?.top));
  const hasan = find(SRC, IQ, { q: "07701234567", top: 3 }).rows[0];
  check("  والسطورُ بلا منتجٍ تُجمع بالاسم المطويّ («علاج قطة» = «علاج قطه»)، والاسمُ أحدثُها",
    JSON.stringify(hasan?.top) === JSON.stringify([{ name: "رمل قطط", times: 2, qty: 3 }, { name: "علاج قطة", times: 2, qty: 2 }]), JSON.stringify(hasan?.top));
  check("  ولا `top` حين لا يُطلب", find(SRC, IQ, { q: "07701234567" }).rows[0]?.top === null);
}

console.log("▸ النصُّ القصير والمعاملُ الخاطئ");
check("حرفٌ واحد أو رقمان = لا طلبَ ولا نتيجة", find(SRC, IQ, { q: "ع" }).total === null && find(SRC, IQ, { q: "07" }).rows.length === 0);
let threw = "";
try { find(SRC, IQ, { sort: "price" }); } catch (e) { threw = e.message; }
check("ترتيبٌ غيرُ معروف يُرفض (bad_argument) كالخادم — لا قائمةَ فارغةً كاذبة", threw === "bad_argument");

console.log(fails
  ? `\n✗ customer-directory-test: ${passes} نجحت، ${fails} فشلت`
  : `\n✓ customer-directory-test: ${passes} نجحت، 0 فشلت`);
process.exit(fails ? 1 : 0);
