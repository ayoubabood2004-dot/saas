// قائمةُ الفواتير وسطورُ «تسديد دفعة» — القاعدةُ النقيّة (src/lib/settlementFeed.ts).
// ما يحرسه: التسديدُ سطرٌ بوقته وسط القائمة لا رفعٌ للفاتورة الأصلية، والفاتورةُ تبقى بمكانها؛
// وساقُ التثبيت (0113/0121، at = created_at) والسالبةُ وساقُ الفكّ (reversal_of) ليست تسديداً؛
// و«المتبقّي بعده» يُحسب من الآخر (الدينُ الآن + ما دُفع بعده)؛ ولا سطرَ تحت أرضيّة ما عُرض.
// وأنّ InvoicesPanel يمرّ من buildInvoiceFeed **بالوضعين** — الجذرُ كان `if (paged) return rows;`
// يتجاوز ترتيبَ «آخر نشاط» فاختفى الصعودُ بالوضع المصفَّح (الافتراضيّ).
process.env.TZ = "Asia/Baghdad";
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let m;
try {
  const dir = mkdtempSync(join(tmpdir(), "sfeed-")); const out = join(dir, "m.mjs");
  await build({ entryPoints: ["src/lib/settlementFeed.ts"], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
  m = await import(pathToFileURL(out).href); rmSync(dir, { recursive: true, force: true });
} catch (e) {
  console.log(`   ✗ src/lib/settlementFeed.ts ما ينبني — ${e.message.split("\n")[0]}`);
  process.exit(1);
}

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };

const inv = (id, over = {}) => ({
  id, clinic_id: "c", customer_name: null, customer_phone: null, payment_method: "cash", payment_details: [],
  total: 100, amount_paid: 100, cost_total: 0, profit: 0, item_count: 1, status: "paid",
  created_at: "2026-10-10T10:00:00.000Z", ...over,
});

// دينٌ قديم (قبل أسبوعين): ٣٠ عند البيع، ثم تسديدان، ثم دينٌ متبقٍّ ٢٠.
const debt = inv("old-debt", {
  customer_name: "أبو علي", total: 100, amount_paid: 80, created_at: "2026-09-28T09:00:00.000Z",
  payment_details: [
    { method: "cash", amount: 30 },
    { method: "card", amount: 25, at: "2026-10-12T08:30:00.000Z" },
    { method: "transfer", amount: 25, at: "2026-10-14T13:15:00.000Z" },
  ],
});
const a = inv("a", { created_at: "2026-10-14T15:00:00.000Z" });
const b = inv("b", { created_at: "2026-10-13T11:00:00.000Z" });
const c = inv("c", { created_at: "2026-10-11T11:00:00.000Z" });

console.log("▸ ما هو التسديد");
const legs = m.settlementsOf(debt);
check("تسديدان لا ثلاثة (ساقُ البيع بلا at ليست تسديداً)", legs.length === 2, legs.length);
check("كلٌّ بمبلغه وطريقته ووقته", legs[0].amount === 25 && legs[0].method === "card" && legs[0].at === "2026-10-12T08:30:00.000Z"
  && legs[1].method === "transfer", legs);
check("المتبقّي بعد الأوّل ٤٥ وبعد الثاني ٢٠ (الدينُ الآن + ما دُفع بعده)", legs[0].remainingAfter === 45 && legs[1].remainingAfter === 20,
  legs.map((l) => l.remainingAfter));
check("ولكلٍّ مفتاحٌ ثابت بفاتورته وموضعه", legs[0].key === "old-debt:pay:1" && legs[1].key === "old-debt:pay:2", legs.map((l) => l.key));

const pinned = inv("pin", {
  total: 100, amount_paid: 70, created_at: "2026-10-01T10:00:00.123456+00:00",
  payment_details: [
    { method: "cash", amount: 100, at: "2026-10-01T10:00:00.123Z" },          // تثبيتُ 0113: at = created_at مقصوصاً
    { method: "cash", amount: -30, at: "2026-10-05T10:00:00.000Z", note: "x" }, // تصحيحُ تحصيل
  ],
});
check("ساقُ التثبيت (at = created_at) والسالبةُ ليستا تسديداً", m.settlementsOf(pinned).length === 0, m.settlementsOf(pinned));
const reversed = inv("rev", {
  total: 50, amount_paid: 50, created_at: "2026-10-01T10:00:00.000Z",
  payment_details: [{ method: "cash", amount: 50, at: "2026-10-02T10:00:00.000Z", reversal_of: "s1" }],
});
check("وساقُ الفكّ (reversal_of) ليست تسديداً", m.settlementsOf(reversed).length === 0);
check("وفاتورةٌ بلا أرجل لا شيء", m.settlementsOf(inv("z", { payment_details: null })).length === 0);
const over = inv("over", { total: 100, amount_paid: 100, payment_details: [{ method: "cash", amount: 40, at: "2026-10-11T10:00:00.000Z" }] });
check("المتبقّي لا ينزل تحت الصفر", m.settlementsOf(over)[0].remainingAfter === 0, m.settlementsOf(over));

console.log("▸ القائمة: الفاتورةُ بمكانها والتسديدُ بوقته");
// الوضعُ المصفَّح: الصفوفُ من الخادم بترتيب created_at، والدينُ القديم ليس فيها (خارج النافذة).
const feed = m.buildInvoiceFeed([a, b, c], [debt], "2026-10-01T00:00:00.000Z");
const shape = feed.map((e) => (e.kind === "invoice" ? e.inv.id : `pay:${e.method}`));
check("التسديدُ وسط القائمة بوقته: a ثم تسديد ١٤/١٠ ثم b ثم تسديد ١٢/١٠ ثم c",
  JSON.stringify(shape) === JSON.stringify(["a", "pay:transfer", "b", "pay:card", "c"]), shape);
check("والفاتورةُ الأصلية لا تُضاف للقائمة (خارج النافذة تبقى خارجها)", !feed.some((e) => e.kind === "invoice" && e.inv.id === "old-debt"));
check("وسطرُ التسديد يحمل الفاتورةَ كاملةً ليفتحها", feed[1].inv === debt && feed[1].inv.customer_name === "أبو علي");

const withOrig = m.buildInvoiceFeed([a, debt], [debt], null);
const shape2 = withOrig.map((e) => (e.kind === "invoice" ? e.inv.id : `pay:${e.method}`));
check("فاتورةٌ داخل المدى تبقى بتاريخ إنشائها والتسديدان فوقها بوقتهما (لا صعودٌ ولا تكرار)",
  JSON.stringify(shape2) === JSON.stringify(["a", "pay:transfer", "pay:card", "old-debt"]), shape2);

const floored = m.buildInvoiceFeed([a, b], [debt], "2026-10-13T11:00:00.000Z");
const shape3 = floored.map((e) => (e.kind === "invoice" ? e.inv.id : `pay:${e.method}`));
check("لا تسديدَ تحت أرضيّة ما عُرض (فجوةٌ لم تُجلب فواتيرُها لا تظهر فيها دفعة)",
  JSON.stringify(shape3) === JSON.stringify(["a", "pay:transfer", "b"]), shape3);

const twice = m.buildInvoiceFeed([a], [debt, debt], null);
check("نفسُ الفاتورة من مصدرين لا تكرّر تسديدها", twice.filter((e) => e.kind === "settlement").length === 2, twice.length);

const keys = withOrig.map((e) => e.key);
check("مفاتيحُ القائمة فريدة", new Set(keys).size === keys.length, keys);

console.log("▸ InvoicesPanel يمرّ من القائمة الموحّدة بالوضعين");
const src = readFileSync("src/components/retail/InvoicesPanel.tsx", "utf8");
check("المرسومُ هو القائمةُ الموحّدة (feed.map) لا الصفوفُ الخامّ (shown.map) التي يتجاوزها `if (paged) return rows;`",
  /feed\.map\(/.test(src) && !/shown\.map\(/.test(src));
check("ولا ترتيبَ «آخر نشاط» يرفع الفاتورةَ الأصلية", !/lastActivity/.test(src));
check("buildInvoiceFeed مستعملة", /buildInvoiceFeed\(/.test(src));
check("وسطورُ التسديد تُجلب من الخادم (listSettlements)", /repo\.listSettlements\(/.test(src));

console.log(`\n${fail ? "✗" : "✓"} سطورُ التسديد: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
