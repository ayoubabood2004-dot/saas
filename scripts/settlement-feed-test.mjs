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
const legs = m.settlementsOf(debt, []);
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
check("ساقُ التثبيت (at = created_at) والسالبةُ ليستا تسديداً", m.settlementsOf(pinned, []).length === 0, m.settlementsOf(pinned, []));
const reversed = inv("rev", {
  total: 50, amount_paid: 50, created_at: "2026-10-01T10:00:00.000Z",
  payment_details: [{ method: "cash", amount: 50, at: "2026-10-02T10:00:00.000Z", reversal_of: "s1" }],
});
check("وساقُ الفكّ (reversal_of) ليست تسديداً", m.settlementsOf(reversed, []).length === 0);
check("وفاتورةٌ بلا أرجل لا شيء", m.settlementsOf(inv("z", { payment_details: null }), []).length === 0);
const over = inv("over", { total: 100, amount_paid: 100, payment_details: [{ method: "cash", amount: 40, at: "2026-10-11T10:00:00.000Z" }] });
check("المتبقّي لا ينزل تحت الصفر", m.settlementsOf(over, [])[0].remainingAfter === 0, m.settlementsOf(over, []));

console.log("▸ القائمة: الفاتورةُ بمكانها والتسديدُ بوقته");
// الوضعُ المصفَّح: الصفوفُ من الخادم بترتيب created_at، والدينُ القديم ليس فيها (خارج النافذة).
const feed = m.buildInvoiceFeed([a, b, c], [debt], "2026-10-01T00:00:00.000Z", []);
const shape = feed.map((e) => (e.kind === "invoice" ? e.inv.id : `pay:${e.method}`));
check("التسديدُ وسط القائمة بوقته: a ثم تسديد ١٤/١٠ ثم b ثم تسديد ١٢/١٠ ثم c",
  JSON.stringify(shape) === JSON.stringify(["a", "pay:transfer", "b", "pay:card", "c"]), shape);
check("والفاتورةُ الأصلية لا تُضاف للقائمة (خارج النافذة تبقى خارجها)", !feed.some((e) => e.kind === "invoice" && e.inv.id === "old-debt"));
check("وسطرُ التسديد يحمل الفاتورةَ كاملةً ليفتحها", feed[1].inv === debt && feed[1].inv.customer_name === "أبو علي");

const withOrig = m.buildInvoiceFeed([a, debt], [debt], null, []);
const shape2 = withOrig.map((e) => (e.kind === "invoice" ? e.inv.id : `pay:${e.method}`));
check("فاتورةٌ داخل المدى تبقى بتاريخ إنشائها والتسديدان فوقها بوقتهما (لا صعودٌ ولا تكرار)",
  JSON.stringify(shape2) === JSON.stringify(["a", "pay:transfer", "pay:card", "old-debt"]), shape2);

const floored = m.buildInvoiceFeed([a, b], [debt], "2026-10-13T11:00:00.000Z", []);
const shape3 = floored.map((e) => (e.kind === "invoice" ? e.inv.id : `pay:${e.method}`));
check("لا تسديدَ تحت أرضيّة ما عُرض (فجوةٌ لم تُجلب فواتيرُها لا تظهر فيها دفعة)",
  JSON.stringify(shape3) === JSON.stringify(["a", "pay:transfer", "b"]), shape3);

const twice = m.buildInvoiceFeed([a], [debt, debt], null, []);
check("نفسُ الفاتورة من مصدرين لا تكرّر تسديدها", twice.filter((e) => e.kind === "settlement").length === 2, twice.length);

const keys = withOrig.map((e) => e.key);
check("مفاتيحُ القائمة فريدة", new Set(keys).size === keys.length, keys);

console.log("▸ «خصم على الدين» (0241): سطرٌ بوقته، ولا يعيد كتابةَ سطور التسديد السابقة");
const fRow = (id, invoice_id, over = {}) => ({
  id, invoice_id, kind: "forgive", amount: 20, reason_code: "loyal", note: null, pay_amount: 0, pay_method: null,
  total_before: null, paid_before: null, due_before: null, profit_base: null, cost_total: null, pct: 100, above_cap: false, via_pin: false,
  cust_key: null, created_at: "2026-10-13T09:00:00.000000+00:00", created_by: null, voided_at: null, voided_by: null, void_reason: null, ...over,
});
{
  // ١٠٠: ٣٠ عند البيع، تسديدُ ٢٥ (١٢/١٠) ⇒ متبقٍّ ٤٥، ثم خصمُ ٢٠ (١٣/١٠) ⇒ الإجمالي ٨٠ والمتبقّي ٢٥.
  const fv = inv("fv", {
    customer_name: "أم زينب", total: 80, forgiven: 20, amount_paid: 55, created_at: "2026-09-28T09:00:00.000Z",
    payment_details: [{ method: "cash", amount: 30 }, { method: "card", amount: 25, at: "2026-10-12T08:30:00.000Z" }],
  });
  const rows = [fRow("f1", "fv", { total_before: 100, paid_before: 55, due_before: 45, created_at: "2026-10-13T09:00:00.123456+00:00" })];
  const legs = m.settlementsOf(fv, rows);
  check("خصمٌ بعد التسديد لا يغيّر «المتبقّي بعده» (٤٥ كما كان قبل الخصم، لا ٢٥)", legs.length === 1 && legs[0].remainingAfter === 45, legs.map((l) => l.remainingAfter));
  // «بلا سطور الدفتر» ليس سلوكاً يُحفظ: كان يرسم ٢٥ (خصمٌ لاحق كأنه دُفع) — الدفترُ لازمٌ الآن (انظر الفحصَ الساكن أدناه).
  const fSrc = readFileSync("src/lib/settlementFeed.ts", "utf8");
  check("  والدفترُ وسيطٌ لازم بلا افتراض بالدالّتين (tsc يمسك مستدعياً لم يجلبه)",
    /export function settlementsOf\(inv: Invoice, forgiveness: readonly InvoiceForgiveness\[\]\)/.test(fSrc)
      && /forgiveness: readonly InvoiceForgiveness\[\]\): FeedEntry\[\]/.test(fSrc) && !/InvoiceForgiveness\[\] = \[\]/.test(fSrc));
  // خصمُ فلسٍ واحد صالحٌ بالخادم (round(a,2) > 0) وinvoice_settlements تُرجع فاتورتَه — فله سطر.
  const cent = inv("cent", { customer_name: "فلس", total: 99.99, forgiven: 0.01, amount_paid: 99.99, created_at: "2026-10-01T09:00:00.000Z" });
  const centRows = [fRow("c1", "cent", { amount: 0.01, due_before: 0.01, created_at: "2026-10-13T09:00:00.000Z" })];
  const cf = m.forgivenessOf(cent, centRows);
  check("  خصمُ ٠٫٠١ سطرٌ («٠٫٠١ ← ٠») — عتبةُ ٠٫٠١ لسِيَق الدفع لا للخصم", cf.length === 1 && cf[0].amount === 0.01 && cf[0].dueAfter === 0, cf);
  const fs = m.forgivenessOf(fv, rows);
  check("سطرُ الخصم: ٢٠، «المتبقّي ٤٥ ← ٢٥» من لقطته، بسببه ووقته",
    fs.length === 1 && fs[0].kind === "forgiveness" && fs[0].amount === 20 && fs[0].dueBefore === 45 && fs[0].dueAfter === 25 && fs[0].reason === "loyal"
      && fs[0].at === "2026-10-13T09:00:00.123456+00:00" && fs[0].key === "fv:forgive:f1" && fs[0].inv === fv, fs);
  const feedF = m.buildInvoiceFeed([a, b, c], [fv], "2026-10-01T00:00:00.000Z", rows);
  const shapeF = feedF.map((e) => (e.kind === "invoice" ? e.inv.id : e.kind === "settlement" ? `pay:${e.method}` : `forgive:${e.amount}`));
  check("القائمة: a ثم b (١٣/١٠ ١١:٠٠) ثم الخصمُ (١٣/١٠ ٩:٠٠) ثم التسديد (١٢/١٠) ثم c — والفاتورةُ الأصلية لا تُضاف",
    JSON.stringify(shapeF) === JSON.stringify(["a", "b", "forgive:20", "pay:card", "c"]), shapeF);
  check("  والأرضيّةُ تُخفي الخصمَ تحتها كالتسديد", !m.buildInvoiceFeed([a], [fv], "2026-10-13T10:00:00.000Z", rows).some((e) => e.kind === "forgiveness"));
  check("  وسطرٌ لفاتورةٍ ليست بالمصادر لا يُعرض (لا شيءَ يُفتح منه)", !m.buildInvoiceFeed([a], [], null, rows).some((e) => e.kind === "forgiveness"));
  check("  ونفسُ السطر من جلبين لا يتكرّر", m.buildInvoiceFeed([a], [fv], null, [...rows, ...rows]).filter((e) => e.kind === "forgiveness").length === 1);

  // ٧٠ بلا دفعٍ عند البيع؛ تسديدُ ٣٠ (١١/١٠) ⇒ ٤٠؛ خصمُ ٢٠ (١٢/١٠) ⇒ ٢٠؛ مرتجعُ سطر الـ٣٠ (١٣/١٠) يستهلك ١٠
  // ⇒ الإجمالي ٣٠ والمتبقّي صفر. بلا الخصم أصلاً كان: ٧٠، تسديد ٣٠ ⇒ ٤٠، مرتجع ٣٠ ⇒ ٤٠ والمتبقّي ١٠.
  const fr = inv("fr", {
    customer_name: "مرتجع", total: 30, forgiven: 10, amount_paid: 30, created_at: "2026-10-01T09:00:00.000Z",
    payment_details: [{ method: "cash", amount: 30, at: "2026-10-11T09:00:00.000Z" }],
  });
  const frRows = [
    fRow("g1", "fr", { amount: 20, total_before: 70, paid_before: 30, due_before: 40, created_at: "2026-10-12T09:00:00.000Z" }),
    fRow("g2", "fr", { kind: "consumed", amount: -10, reason_code: null, note: "مرتجع", pct: null, total_before: 50, paid_before: 30, due_before: 20, created_at: "2026-10-13T09:00:00.000Z" }),
  ];
  const frLegs = m.settlementsOf(fr, frRows);
  check("خصمٌ ثم مرتجعٌ استهلك نصفَه: سطرُ التسديد كما لو لم يكن خصمٌ أصلاً (١٠ — الخصمُ الصافي ١٠ يُعاد)", frLegs[0].remainingAfter === 10, frLegs.map((l) => l.remainingAfter));
  const frF = m.forgivenessOf(fr, frRows);
  check("  وسطرُ الخصم يبقى بلقطته (٤٠ ← ٢٠) والاستهلاكُ ليس سطراً وحده", frF.length === 1 && frF[0].dueBefore === 40 && frF[0].dueAfter === 20, frF);
  check("  والقائمةُ: تسديدٌ وخصمٌ فقط لهذه الفاتورة", m.buildInvoiceFeed([], [fr], null, frRows).map((e) => e.kind).join() === "forgiveness,settlement");

  // الملغى: خصمُ ٢٠ (١٣/١٠) أُلغي (١٤/١٠) ⇒ الفاتورةُ كما كانت، ولا سطر.
  const vo = inv("vo", { customer_name: "إلغاء", total: 100, forgiven: 0, amount_paid: 55, created_at: "2026-09-28T09:00:00.000Z",
    payment_details: [{ method: "cash", amount: 30 }, { method: "card", amount: 25, at: "2026-10-12T08:30:00.000Z" }] });
  const voRows = [fRow("h1", "vo", { due_before: 45, voided_at: "2026-10-14T09:00:00.000Z", void_reason: "غلط" })];
  check("خصمٌ أُلغي لا يُعرض سطراً", m.forgivenessOf(vo, voRows).length === 0 && !m.buildInvoiceFeed([], [vo], null, voRows).some((e) => e.kind === "forgiveness"));
  check("  ولا يغيّر «المتبقّي بعده» (٤٥ — أُنشئ وأُلغي بعد الساق: صفر)", m.settlementsOf(vo, voRows)[0].remainingAfter === 45, m.settlementsOf(vo, voRows));
  // خصمُ ٢٠ قبل الساق (الإجمالي ٨٠)، ساقُ ٣٠ ⇒ متبقٍّ ٥٠، ثم إلغاءُ الخصم بعدها ⇒ الإجمالي ١٠٠ والمتبقّي ٧٠.
  const vb = inv("vb", { customer_name: "إلغاء لاحق", total: 100, forgiven: 0, amount_paid: 30, created_at: "2026-10-01T09:00:00.000Z",
    payment_details: [{ method: "cash", amount: 30, at: "2026-10-12T09:00:00.000Z" }] });
  const vbRows = [fRow("k1", "vb", { due_before: 100, created_at: "2026-10-11T09:00:00.000Z", voided_at: "2026-10-13T09:00:00.000Z" })];
  check("  وخصمٌ قبل الساق أُلغي بعدها: «المتبقّي بعده» ٥٠ لا ٧٠ (الإلغاءُ رفع الدينَ بعدها)", m.settlementsOf(vb, vbRows)[0].remainingAfter === 50, m.settlementsOf(vb, vbRows));

  // «تسوية»: يدفع ٧٠ ونخصم ٣٠ بنفس المعاملة (نفسُ اللحظة؛ الساقُ بالمللي والسطرُ بالمايكرو).
  const ts = inv("ts", { customer_name: "تسوية", total: 70, forgiven: 30, amount_paid: 70, created_at: "2026-10-01T09:00:00.000Z",
    payment_details: [{ method: "card", amount: 70, at: "2026-10-15T12:00:00.123Z" }] });
  const tsRows = [fRow("t1", "ts", { amount: 30, pay_amount: 70, pay_method: "card", total_before: 100, paid_before: 70, due_before: 30, reason_code: "negotiation", created_at: "2026-10-15T12:00:00.123789+00:00" })];
  const tsLegs = m.settlementsOf(ts, tsRows);
  check("تسوية: سطرُ الدفعة «المتبقّي بعده ٣٠» (الخصمُ بعد الدفعة بنفس اللحظة)", tsLegs[0].remainingAfter === 30, tsLegs);
  const tsFeed = m.buildInvoiceFeed([], [ts], null, tsRows);
  check("  والخصمُ فوق دفعته بالقائمة (أحدثُ منها)، «٣٠ ← ٠»", tsFeed.map((e) => e.kind).join() === "forgiveness,settlement" && tsFeed[0].dueBefore === 30 && tsFeed[0].dueAfter === 0, tsFeed.map((e) => e.kind));
  const plain = [fRow("p1", "ts", { amount: 30, pay_amount: 0, created_at: "2026-10-15T12:00:00.123000+00:00" })];
  check("  وخصمٌ بلا دفعة بنفس المللي ليس «بعد» الساق (تعادلٌ لا يُحسب إلا للتسوية)", m.settlementsOf(ts, plain)[0].remainingAfter === 0);
  const ks = m.buildInvoiceFeed([a, b, c, debt, fv, fr, ts], [debt, fv, fr, ts], null, [...rows, ...frRows, ...tsRows]).map((e) => e.key);
  check("مفاتيحُ القائمة فريدةٌ مع سطور الخصم", new Set(ks).size === ks.length, ks);
}

console.log("▸ InvoicesPanel يمرّ من القائمة الموحّدة بالوضعين");
const src = readFileSync("src/components/retail/InvoicesPanel.tsx", "utf8");
check("المرسومُ هو القائمةُ الموحّدة (feed.map) لا الصفوفُ الخامّ (shown.map) التي يتجاوزها `if (paged) return rows;`",
  /feed\.map\(/.test(src) && !/shown\.map\(/.test(src));
check("ولا ترتيبَ «آخر نشاط» يرفع الفاتورةَ الأصلية", !/lastActivity/.test(src));
check("buildInvoiceFeed مستعملة", /buildInvoiceFeed\(/.test(src));
check("وسطورُ التسديد تُجلب من الخادم (listSettlements)", /repo\.listSettlements\(/.test(src));

console.log("▸ كلُّ مستدعٍ يمرّر دفترَ الخصم (0241) — والشاشةُ تجلبه وترسمه");
{
  // نداءٌ بلا الدفتر يُرسم «سُدِّد كاملاً» عن دينٍ خُصم لاحقاً. tsc يمسكه، وهذا يمسكه بلا tsc أيضاً.
  const callsIn = (text, fn) => {
    const out = [];
    const re = new RegExp(`\\b${fn}\\(`, "g");
    let mm;
    while ((mm = re.exec(text))) {
      if (/function\s+$/.test(text.slice(Math.max(0, mm.index - 9), mm.index))) continue; // التعريفُ نفسُه
      let depth = 1, i = mm.index + mm[0].length, args = 1;
      for (; i < text.length && depth > 0; i++) {
        const ch = text[i];
        if ("([{".includes(ch)) depth++;
        else if (")]}".includes(ch)) depth--;
        else if (ch === "," && depth === 1) args++;
      }
      out.push({ at: text.slice(0, mm.index).split("\n").length, args });
    }
    return out;
  };
  const bad = [];
  for (const file of ["src/components/retail/InvoicesPanel.tsx", "src/lib/repoDemo.ts"]) {
    const t = readFileSync(file, "utf8");
    for (const c of callsIn(t, "settlementsOf")) if (c.args < 2) bad.push(`${file}:${c.at} settlementsOf`);
    for (const c of callsIn(t, "buildInvoiceFeed")) if (c.args < 4) bad.push(`${file}:${c.at} buildInvoiceFeed`);
  }
  check("لا نداءَ لـsettlementsOf/buildInvoiceFeed بلا الدفتر", bad.length === 0, bad);
  check("InvoicesPanel يجلب الدفترَ (listInvoiceForgiveness بالمصفَّح وreportForgiveness بالقديم)",
    /repo\.listInvoiceForgiveness\(/.test(src) && /repo\.reportForgiveness\(/.test(src));
  check("  وفشلُه يُقال «أعد المحاولة» لا قائمةٌ تُبنى بـ[]", /setLedgerFailed\(true\)/.test(src) && /ledgerFailed/.test(src.slice(src.indexOf("const anyFailed"), src.indexOf("const anyFailed") + 120)));
  check("  ولسطر الخصم فرعُ رسمٍ صريح (لا يقع على بطاقة الفاتورة)", /e\.kind === "forgiveness"/.test(src));
  check("  و«سُدِّد دَينها» لا تقال عن فاتورةٍ خُصم من دينها", /forgivenessOf\(/.test(src) && /retail\.wasDebt/.test(src));
}

console.log(`\n${fail ? "✗" : "✓"} سطورُ التسديد: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
