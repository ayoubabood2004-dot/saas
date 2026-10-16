// «خصم على الدين» — حسابُ النافذة وحرّاسُها (src/lib/debtForgive.ts) مقابل forgive_invoice_debt (0241).
// ما يحرسه: كلُّ رقمٍ بالنافذة يُحسب بخطوات الدالّة وتقريبها وتسامحها، و`validateForgive`/`validateVoid`
// ترجعان نفسَ رموز الدالّتين بنفس الترتيب. الحالاتُ أدناه هي حالاتُ قسم 0241 بـsupabase/tests/run.sh
// **بأرقامها** (الفاتورة ١، ٢، ٣، …) — فالمرآةُ والـSQL يتّفقان حالةً بحالة — وأمثلةُ المالك.
// (الحزمةُ تجري بـCI؛ هذا يجري محلّياً بكلّ lint/build.)
import { build } from "esbuild";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

let m, tx;
for (const [name, set] of [["debtForgive", (x) => { m = x; }], ["forgiveText", (x) => { tx = x; }]]) {
  try {
    const dir = mkdtempSync(join(tmpdir(), "dforgive-")); const out = join(dir, "m.mjs");
    await build({ entryPoints: [`src/lib/${name}.ts`], bundle: true, format: "esm", platform: "node", outfile: out, logLevel: "silent", alias: { "@": join(process.cwd(), "src") } });
    set(await import(pathToFileURL(out).href)); rmSync(dir, { recursive: true, force: true });
  } catch (e) {
    console.log(`   ✗ src/lib/${name}.ts ما ينبني — ${e.message.split("\n")[0]}`);
    process.exit(1);
  }
}

let pass = 0, fail = 0;
const check = (name, ok, got) => { if (ok) { pass++; console.log(`   ✓ ${name}`); } else { fail++; console.log(`   ✗ ${name} — ${JSON.stringify(got) ?? ""}`); } };

// الأدوار كما بالحزمة: C1 صاحبُ العيادة، MGR مديرٌ بحسابه، RCP استقبال (و RCP_PIN معه مفتاحُ المدير)،
// ADM مشغّلُ المنصّة داخل العيادة، PHO مصوّر.
const OWNER = { signedIn: true, operator: false, role: "manager", base: "manager", pin: false };
const MGR = OWNER;
const RCP = { signedIn: true, operator: false, role: "receptionist", base: "receptionist", pin: false };
const RCP_PIN = { ...RCP, role: "manager", pin: true };
const ADM = { signedIn: true, operator: true, role: "manager", base: "manager", pin: false };
const PHO = { signedIn: true, operator: false, role: "photographer", base: "photographer", pin: false };

const inv = (over = {}) => ({ id: "x", total: 100, amount_paid: 0, cost_total: 50, profit: 50, forgiven: 0, status: "paid",
  customer_name: "زبون", customer_phone: null, ...over });
const v = (i, a, over = {}) => m.validateForgive({ actor: a, inv: i, openDelivery: false, pct: 100, ...over });
/** يطبّق ما تكتبه الدالّة بعد نجاح الفحص (الدفعةُ ثم الخصم) — لمتابعة الحالة بين الخطوات. */
function apply(i, r) {
  const out = { ...i };
  if (r.pay > 0) out.amount_paid = m.pgRound2((i.amount_paid ?? 0) + r.pay);
  out.forgiven = m.pgRound2((i.forgiven ?? 0) + r.amount);
  out.total = m.pgRound2(i.total - r.amount);
  out.profit = m.pgRound2((i.profit ?? 0) - r.amount);
  return out;
}
const due = (i) => m.forgiveDueOf(i);

console.log("▸ التقريب والنصّ كالخادم");
check("round(x,2): النصفُ بعيداً عن الصفر بالموجب والسالب", m.pgRound2(2.345) === 2.35 && m.pgRound2(-2.345) === -2.35 && m.pgRound2(1.005) === 1.01 && m.pgRound2(-0.004) === 0,
  [m.pgRound2(2.345), m.pgRound2(-2.345), m.pgRound2(1.005), m.pgRound2(-0.004)]);
check("  وبلا انجرافِ العائم (0.1+0.2)", m.pgRound2(0.1 + 0.2) === 0.3);
check("rtrim(to_char(v,'FM999,999,999,990.99'),'.'): ٢٥ و٣٧.٥ و١,٢٣٤.٥ و٠", m.pgMoneyText(25) === "25" && m.pgMoneyText(37.5) === "37.5" && m.pgMoneyText(1234.5) === "1,234.5" && m.pgMoneyText(0) === "0" && m.pgMoneyText(1000000) === "1,000,000",
  [m.pgMoneyText(25), m.pgMoneyText(37.5), m.pgMoneyText(1234.5), m.pgMoneyText(0)]);
check("btrim يقصّ المسافةَ وحدها (لا السطرَ) — كبوستغريس", m.pgBtrim("  a b ") === "a b" && m.pgBtrim("\na\n") === "\na\n");
check("الأسبابُ الخمسة بقيد الجدول، ولكلٍّ مفتاحُ ترجمة", tx.REASONS.map((r) => r.code).join() === "negotiation,loyal,hardship,dispute,other"
  && tx.REASONS.every((r) => r.key.startsWith("forgive.reason.")) && tx.reasonKey("loyal") === "forgive.reason.loyal"
  && m.REASON_CODES.every((c) => m.isForgiveReason(c)) && !m.isForgiveReason("xx"));
check("  ووحدةُ الإقلاع (debtForgive) لا تحمل مفتاحَ ترجمة — المفاتيحُ بـforgiveText خلف page()",
  !/forgive\.(reason|err)\./.test(readFileSync("src/lib/debtForgive.ts", "utf8")) && !("REASONS" in m) && !("forgiveErrorKey" in m));

console.log("▸ أمثلةُ المالك: ٢٠٠، كلفة ١٢٥ (ربح ٧٥)");
{
  const a = m.forgiveCaps(inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 150 }), 100);
  check("دُفع ١٥٠ ⇒ المتبقّي ٥٠ والمسموح ٥٠ (المتبقّي أصغر من الربح)", a.due === 50 && a.allowedWithin === 50 && a.profitBase === 75 && a.capTotal === 75, a);
  const b = m.forgiveCaps(inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 100 }), 100);
  check("دُفع ١٠٠ ⇒ المتبقّي ١٠٠ والمسموح ٧٥ (الربحُ أصغر)", b.due === 100 && b.allowedWithin === 75, b);
  const p1 = m.forgivePreview(b, 30);
  check("  خصمُ ٣٠: ٤٠٪ من الربح، الربحُ بعده ٤٥ (٢٦٫٤٧٪ من ١٧٠)، المتبقّي ١٠٠ ← ٧٠، داخل السقف",
    p1.pctOfProfit === 40 && p1.profitAfter === 45 && p1.totalAfter === 170 && Math.abs(p1.marginAfter - 26.470588) < 1e-4 && p1.dueAfter === 70 && !p1.aboveCap && p1.loss === 0 && Math.abs(p1.usedOfCap - 0.4) < 1e-9, p1);
  const after1 = { ...inv({ total: 170, cost_total: 125, profit: 45, amount_paid: 100, forgiven: 30 }) };
  const c = m.forgiveCaps(after1, 100);
  check("  والخصمُ الثاني يأخذ ما بقي من الربح: المتبقّي ٧٠، الربحُ قبل أيّ خصم ٧٥ ⇒ المسموح ٤٥", c.due === 70 && c.profitBase === 75 && c.allowedWithin === 45 && Math.abs(c.usedOfCap - 0.4) < 1e-9, c);
  const p2 = m.forgivePreview(c, 45);
  check("    ٤٥ تملأ السقف بالضبط (١٠٠٪ تراكميّاً) بلا خسارة", !p2.aboveCap && p2.pctOfProfit === 100 && p2.profitAfter === 0 && p2.loss === 0, p2);
  const half = m.forgiveCaps(inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 100 }), 50);
  check("نسبة ٥٠ تنصّفه: المسموح ٣٧٫٥", half.capTotal === 37.5 && half.allowedWithin === 37.5, half);
  const over = m.forgivePreview(b, 100);
  check("فوق السقف: خصمُ ١٠٠ من متبقٍّ ١٠٠ ⇒ بيعٌ بخسارة ٢٥ والربحُ بعده −٢٥", over.aboveCap && over.loss === 25 && over.profitAfter === -25 && over.dueAfter === 0, over);
  const t = m.forgiveCaps(inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 100 }), 100, 60);
  check("تسوية: يدفع ٦٠ أوّلاً ثم نخصم ⇒ المتبقّي ١٠٠ ← ٤٠ والمسموح ٤٠", t.dueBefore === 100 && t.pay === 60 && t.paid === 160 && t.due === 40 && t.allowedWithin === 40, t);
  const t2 = m.forgiveCaps(inv({ total: 200, profit: 75, amount_paid: 100 }), 100, 500);
  check("  والدفعةُ تُقصّ على المتبقّي (٥٠٠ ⇒ ١٠٠، والخصمُ بعدها لا مكان له)", t2.pay === 100 && t2.due === 0 && t2.allowedWithin === 0, t2);
  const legacy = m.forgiveCaps({ total: 80, profit: 20 }, 100, 10);
  check("فاتورةٌ قديمة بلا amount_paid = مدفوعةٌ كلُّها: لا متبقٍّ ولا دفعة", legacy.due === 0 && legacy.pay === 0 && legacy.paid === 80, legacy);
  const neg = m.forgiveCaps(inv({ total: 100, profit: -10, amount_paid: 0 }), 100);
  check("بيعةٌ تحت الكلفة (ربحٌ سالب): المسموح صفر وأيُّ خصمٍ فوق السقف", neg.allowedWithin === 0 && m.forgivePreview(neg, 5).aboveCap && m.forgivePreview(neg, 5).loss === 15, neg);
}

console.log("▸ run.sh ١) من يقدر — والرفضُ بالرمز (الفاتورة ٢)");
const I02 = inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 0, customer_name: "خسارة" });
check("الاستقبالُ بلا مفتاح المدير: not_allowed", v(I02, RCP, { amount: 10, reason: "loyal" }).code === "not_allowed");
check("  ولا المصوّر", v(I02, PHO, { amount: 10, reason: "loyal" }).code === "not_allowed");
check("  وعيادةٌ أخرى لا تجد الفاتورة", v(null, OWNER, { amount: 10, reason: "loyal" }).code === "invoice_not_found");
check("  ولا مشغّلُ المنصّة داخل العيادة (operator_not_allowed) — قبل فحص الدور", v(I02, ADM, { amount: 10, reason: "loyal" }).code === "operator_not_allowed");
check("  وبلا دخول: not_allowed قبل كلّ شيء", v(I02, { ...OWNER, signedIn: false, operator: true }, { amount: 10, reason: "loyal" }).code === "not_allowed");

console.log("▸ run.sh ٢) فوق الربح (٢٠٠، ربح ٧٥، متبقٍّ ٢٠٠ ⇒ المسموح ٧٥)");
{
  const pinR = v(I02, RCP_PIN, { amount: 100, reason: "negotiation", note: "اتفقنا على خسارة", confirmLoss: true });
  check("بمفتاح المدير على الاستقبال: above_profit_needs_owner، والتلميحُ عن المفتاح (pin)", pinR.code === "above_profit_needs_owner" && pinR.pin === true && pinR.allowed === 75, pinR);
  const short = v(I02, MGR, { amount: 100, reason: "negotiation", note: "قصير", confirmLoss: true });
  check("  المديرُ بحسابه بملاحظةٍ قصيرة: note_required (فوق السقف)", short.code === "note_required" && short.aboveCap === true, short);
  check("  ملاحظةٌ بسبعة أحرف تُرفض وبثمانية تمرّ (char_length)", v(I02, MGR, { amount: 100, reason: "negotiation", note: "١٢٣٤٥٦٧", confirmLoss: true }).code === "note_required"
    && v(I02, MGR, { amount: 100, reason: "negotiation", note: "١٢٣٤٥٦٧٨", confirmLoss: true }).ok === true);
  const noConf = v(I02, OWNER, { amount: 100, reason: "negotiation", note: "اتفقنا على خسارة مع الزبون" });
  check("  صاحبُ العيادة بلا إقرار: confirm_loss_required والخسارة ٢٥ (١٠٠ − ٧٥)", noConf.code === "confirm_loss_required" && noConf.loss === 25 && m.pgMoneyText(noConf.loss) === "25", noConf);
  const ok = v(I02, OWNER, { amount: 100, reason: "negotiation", note: "اتفقنا على خسارة مع الزبون", expectDue: 200, confirmLoss: true });
  const after = ok.ok ? apply(I02, ok) : null;
  check("  وبالملاحظة والإقرار يمرّ: الإجمالي ١٠٠، الربح −٢٥، الخصم ١٠٠", ok.ok && after.total === 100 && after.profit === -25 && after.forgiven === 100, ok);
  check("  واللقطة: فوق السقف، ربحٌ قبله ٧٥، متبقٍّ ٢٠٠، نسبة ١٠٠", ok.aboveCap === true && ok.caps.profitBase === 75 && ok.caps.due === 200 && ok.caps.pct === 100 && ok.reason === "negotiation", ok.caps);
}

console.log("▸ run.sh ٣) داخل الربح (الفاتورة ١: ٢٠٠، ربح ٧٥، دُفع ١٥٠ ⇒ متبقٍّ ٥٠)");
{
  const I01 = inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 150, customer_name: "أبو حسن", customer_phone: "07701234567" });
  check("متبقٍّ غيرُ الذي رآه المدير: due_changed (والمتبقّي الحقيقيّ ٥٠)", v(I01, RCP_PIN, { amount: 10, reason: "loyal", expectDue: 60 }).code === "due_changed"
    && v(I01, RCP_PIN, { amount: 10, reason: "loyal", expectDue: 60 }).due === 50);
  check("  وفرقُ فلسٍ ونصفٍ دون التسامح لا يُعدّ تغيّراً (٥٠٫٠٠٤)", v(I01, RCP_PIN, { amount: 10, reason: "loyal", expectDue: 50.004 }).ok === true);
  check("  أكبرُ من المتبقّي: above_due", v(I01, RCP_PIN, { amount: 60, reason: "loyal", expectDue: 50 }).code === "above_due");
  check("  ٥٠٫٠٠٤ ليس أكبرَ من ٥٠ (يُقرَّب ٥٠ ويمرّ)", v(I01, RCP_PIN, { amount: 50.004, reason: "loyal" }).ok && v(I01, RCP_PIN, { amount: 50.004, reason: "loyal" }).amount === 50);
  check("  سببٌ مجهول: reason_required", v(I01, RCP_PIN, { amount: 10, reason: "xx" }).code === "reason_required");
  check("  وسببٌ بمسافاتٍ حوله يُقصّ ويُقبل («loyal »)", v(I01, RCP_PIN, { amount: 10, reason: " loyal " }).ok === true);
  check("  «غير ذلك» بلا ملاحظة: note_required", v(I01, RCP_PIN, { amount: 10, reason: "other", note: "   " }).code === "note_required");
  check("  صفر: amount_invalid", v(I01, RCP_PIN, { amount: 0, reason: "loyal" }).code === "amount_invalid");
  check("  ودفعةٌ سالبة: amount_invalid", v(I01, RCP_PIN, { amount: 5, reason: "loyal", pay: -1 }).code === "amount_invalid");
  check("  الترتيب: السببُ قبل المبلغ (صفر بسببٍ مجهول ⇒ reason_required)", v(I01, RCP_PIN, { amount: 0, reason: "xx" }).code === "reason_required");
  check("  والمتبقّي قبل السبب (due_changed يغلب سبباً مجهولاً)", v(I01, RCP_PIN, { amount: 0, reason: "xx", expectDue: 1 }).code === "due_changed");
  const r1 = v(I01, RCP_PIN, { amount: 30, reason: "loyal", expectDue: 50 });
  const a1 = apply(I01, r1);
  check("  ٣٠ بمفتاح المدير داخل الربح: الإجمالي ١٧٠، الربح ٤٥، الخصم ٣٠، المتبقّي ٢٠، المدفوع ١٥٠",
    r1.ok && !r1.aboveCap && a1.total === 170 && a1.profit === 45 && a1.forgiven === 30 && due(a1) === 20 && a1.amount_paid === 150, a1);
  check("    ولقطتُه: إجماليٌّ قبله ٢٠٠، متبقٍّ قبله ٥٠", r1.caps.total === 200 && r1.caps.due === 50);
  const c2 = m.forgiveCaps(a1, 100);
  check("  والثاني يأخذ ما بقي: المسموح ٢٠ = min(المتبقّي ٢٠، ٧٥ − ٣٠)", c2.allowedWithin === 20 && c2.profitBase === 75, c2);
  const r2 = v(a1, RCP_PIN, { amount: 20, reason: "dispute", expectDue: 20 });
  const a2 = apply(a1, r2);
  check("  فصار المتبقّي صفراً والخصمُ ٥٠", r2.ok && due(a2) === 0 && a2.forgiven === 50, a2);
}

console.log("▸ run.sh ٤) المرفوض بطبيعته");
check("فاتورةٌ مُرجَعة: invoice_refunded", v(inv({ status: "refunded" }), OWNER, { amount: 10, reason: "loyal" }).code === "invoice_refunded");
{
  const orders = [
    { invoice_id: "i05", status: "out", collected_at: null },
    { invoice_id: "i06", status: "delivered", collected_at: null },
    { invoice_id: "i07", status: "delivered", collected_at: "2026-10-01T10:00:00Z" },
    { invoice_id: "i08", status: "returned", collected_at: null },
    { invoice_id: "i09", status: "preparing", collected_at: null },
  ];
  check("طلبٌ بالطريق / يجهَّز / وصل ولم يُحصَّل ⇒ مفتوح، ووصل وتحصّل / راجع ⇒ لا",
    m.hasOpenDelivery(orders, "i05") && m.hasOpenDelivery(orders, "i06") && m.hasOpenDelivery(orders, "i09") && !m.hasOpenDelivery(orders, "i07") && !m.hasOpenDelivery(orders, "i08") && !m.hasOpenDelivery(null, "i05"));
  check("  ومفتوحٌ يُرفض: invoice_has_open_delivery", v(inv(), OWNER, { amount: 10, reason: "loyal", openDelivery: true }).code === "invoice_has_open_delivery");
  check("  ووصل وتحصّل: يمرّ (٥)", v(inv(), OWNER, { amount: 5, reason: "loyal", openDelivery: m.hasOpenDelivery(orders, "i07") }).ok === true);
}
check("بلا اسمٍ ولا هاتف (مسافاتٌ فقط): customer_required", v(inv({ customer_name: "  ", customer_phone: " " }), OWNER, { amount: 10, reason: "loyal" }).code === "customer_required");
check("  والهاتفُ وحده يكفي", v(inv({ customer_name: null, customer_phone: "0770" }), OWNER, { amount: 10, reason: "loyal" }).ok === true);
check("  والترتيب: المُرجَعةُ قبل الزبون، والزبونُ قبل التوصيل", v(inv({ status: "refunded", customer_name: null }), OWNER, { amount: 1, reason: "loyal" }).code === "invoice_refunded"
  && v(inv({ customer_name: null }), OWNER, { amount: 1, reason: "loyal", openDelivery: true }).code === "customer_required");

console.log("▸ run.sh ٥) «تسوية»: يدفع الآن ونخصم الباقي");
{
  const I03 = inv({ total: 100, cost_total: 60, profit: 40, amount_paid: 0, customer_name: "تسوية" });
  const r = v(I03, OWNER, { amount: 30, reason: "negotiation", expectDue: 100, pay: 70 });
  const a = r.ok ? apply(I03, r) : null;
  check("١٠٠ دين، يدفع ٧٠ ونخصم ٣٠: المدفوع ٧٠، الإجمالي ٧٠، الخصم ٣٠، المتبقّي صفر",
    r.ok && r.pay === 70 && a.amount_paid === 70 && a.total === 70 && a.forgiven === 30 && due(a) === 0 && !r.aboveCap, r);
  check("  ولقطةُ السطر بعد الدفعة: إجمالي ١٠٠، مدفوع ٧٠، متبقٍّ ٣٠", r.caps.total === 100 && r.caps.paid === 70 && r.caps.due === 30, r.caps);
  check("  وexpectDue يُقارن بالمتبقّي **قبل** الدفعة (١٠٠ لا ٣٠)", v(I03, OWNER, { amount: 30, reason: "negotiation", expectDue: 30, pay: 70 }).code === "due_changed");
  check("  والخصمُ أكبر من المتبقّي بعد الدفعة: above_due (٧٠ + ٣١)", v(I03, OWNER, { amount: 31, reason: "negotiation", pay: 70 }).code === "above_due"
    && v(I03, OWNER, { amount: 31, reason: "negotiation", pay: 70 }).due === 30);
  const I0e = inv({ total: 100, cost_total: 50, profit: 50, amount_paid: 40, customer_name: "ضمني" });
  const re = v(I0e, OWNER, { amount: 30, reason: "loyal", expectDue: 60, pay: 30 });
  check("بيعةٌ بلا سِيَق (٤٠ ضمنيّة): يدفع ٣٠ ويُخصم ٣٠ ⇒ المدفوع ٧٠ والمتبقّي صفر", re.ok && apply(I0e, re).amount_paid === 70 && due(apply(I0e, re)) === 0, re);
}

console.log("▸ run.sh ٦–٧) المرتجعُ والتعديلُ يستهلكان الخصمَ قبل النقد");
{
  const I09 = inv({ total: 70, cost_total: 20, profit: 50, amount_paid: 30, customer_name: "مرتجع" });
  const r = v(I09, OWNER, { amount: 20, reason: "loyal", expectDue: 40 });
  const a = apply(I09, r);
  check("خصمُ ٢٠ على ٤٠+٣٠ مدفوعٌ منها ٣٠: الإجمالي ٥٠ والمتبقّي ٢٠", r.ok && a.total === 50 && due(a) === 20, a);
  const c = m.consumeForgiveness(40, 30, a.forgiven);
  check("  إرجاعُ سطر الـ٣٠: الخام ٤٠ ⇒ الخصم ١٠، الإجمالي ٣٠، والمستهلَك ١٠ (سطرُ −١٠)", c.forgiven === 10 && c.total === 30 && c.consumed === 10, c);
  check("    والنقدُ الخارج صفر: max(0, المدفوع ٣٠ − الإجمالي ٣٠)", Math.max(0, m.pgRound2(30 - c.total)) === 0);
  check("    والربح ٢٠ (الإجمالي ٣٠ − كلفة الباقي ١٠)", m.pgRound2(c.total - 10) === 20);
  const vd = m.validateVoid({ actor: OWNER, reason: "غلط بالمبلغ", entry: { kind: "forgive", amount: 20, voided_at: null }, inv: { status: "paid", forgiven: c.forgiven }, openDelivery: false });
  check("  وإلغاءُ خصمٍ استُهلك منه شيء: forgiveness_consumed", vd.code === "forgiveness_consumed", vd);
  const I0a = inv({ total: 100, cost_total: 40, profit: 60, amount_paid: 20, customer_name: "تعديل" });
  const ra = v(I0a, OWNER, { amount: 30, reason: "hardship", expectDue: 80 });
  const aa = apply(I0a, ra);
  const e1 = m.consumeForgiveness(110, 20, aa.forgiven);
  check("التعديلُ يضيف سطر ١٠: الخام ١١٠ ⇒ الخصمُ يبقى ٣٠، الإجمالي ٨٠، الربح ٣٥، المتبقّي ٦٠، ولا استهلاك",
    ra.ok && e1.forgiven === 30 && e1.total === 80 && m.pgRound2(e1.total - 45) === 35 && m.pgRound2(e1.total - 20) === 60 && e1.consumed === 0, e1);
  const e2 = m.consumeForgiveness(40, 20, e1.forgiven);
  check("  وينزل لسطر ٤٠ وحده: الخصمُ ٢٠، الإجمالي ٢٠، المتبقّي ٠، واستهلاكُ ١٠", e2.forgiven === 20 && e2.total === 20 && e2.consumed === 10, e2);
  const e3 = m.consumeForgiveness(10, 30, 20);
  check("  وتحت المدفوع: الخصمُ كلُّه يُستهلك قبل النقد (الخام ١٠، دُفع ٣٠ ⇒ خصمٌ ٠، إجماليٌّ ١٠)", e3.forgiven === 0 && e3.total === 10 && e3.consumed === 20, e3);
  check("  وبلا خصم: لا شيء يتغيّر", JSON.stringify(m.consumeForgiveness(55.5, 10, undefined)) === JSON.stringify({ forgiven: 0, total: 55.5, consumed: 0 }));
}

console.log("▸ run.sh ٨) الإلغاء — نفسُ الرموز بنفس الترتيب");
{
  const live = { kind: "forgive", amount: 40, voided_at: null };
  const I0b = { status: "paid", forgiven: 40 };
  const vv = (a, over = {}) => m.validateVoid({ actor: a, reason: "غلط بالمبلغ", entry: live, inv: I0b, openDelivery: false, ...over });
  check("الاستقبالُ بلا مفتاح لا يلغي: not_allowed", vv(RCP).code === "not_allowed");
  check("  ومشغّلُ المنصّة: operator_not_allowed", vv(ADM).code === "operator_not_allowed");
  check("  والإلغاءُ بلا سبب (مسافات): reason_required — قبل البحث عن السطر", vv(OWNER, { reason: "  ", entry: null }).code === "reason_required");
  check("  وسببٌ بحرفين: reason_required", vv(OWNER, { reason: "اب" }).code === "reason_required");
  check("  سطرٌ غيرُ موجود: entry_not_found", vv(OWNER, { entry: null }).code === "entry_not_found");
  check("  وسطرُ الاستهلاك لا يُلغى وحده: entry_not_voidable", vv(OWNER, { entry: { kind: "consumed", amount: -10, voided_at: null } }).code === "entry_not_voidable");
  check("  ومرّةً ثانية: already_voided", vv(OWNER, { entry: { ...live, voided_at: "2026-10-16T10:00:00Z" } }).code === "already_voided");
  check("  وفاتورةٌ مُرجَعة: invoice_refunded", vv(OWNER, { inv: { status: "refunded", forgiven: 40 } }).code === "invoice_refunded");
  check("  وطلبُ توصيلٍ مفتوح: invoice_has_open_delivery", vv(OWNER, { openDelivery: true }).code === "invoice_has_open_delivery");
  const ok = vv(RCP_PIN);
  check("  المديرُ (والمفتاحُ يكفي) يلغي بسبب، والسببُ مقصوص", ok.ok && ok.reason === "غلط بالمبلغ" && m.validateVoid({ actor: OWNER, reason: "  سبب واضح ", entry: live, inv: I0b, openDelivery: false }).reason === "سبب واضح");
}

console.log("▸ run.sh ٩) النسبة ٥٠ (الفاتورة د: ربح ٧٥ ⇒ المسموح ٣٧٫٥)");
{
  const I0d = inv({ total: 200, cost_total: 125, profit: 75, amount_paid: 0, customer_name: "نسبة" });
  const r40 = v(I0d, RCP_PIN, { amount: 40, reason: "loyal", pct: 50 });
  check("٤٠ بالمفتاح فوق السقف: above_profit_needs_owner (المسموح ٣٧٫٥)", r40.code === "above_profit_needs_owner" && r40.allowed === 37.5, r40);
  const r375 = v(I0d, RCP_PIN, { amount: 37.5, reason: "loyal", pct: 50 });
  check("  و٣٧٫٥ تمرّ والسطرُ يحفظ النسبة ٥٠", r375.ok && r375.caps.pct === 50 && r375.amount === 37.5 && !r375.aboveCap, r375);
  check("  ونسبةٌ غائبة = ١٠٠ (coalesce)", m.forgiveCaps(I0d, null).capTotal === 75 && m.forgiveCaps(I0d, undefined).capTotal === 75);
  check("  ونسبة صفر: أيُّ خصمٍ فوق السقف", m.forgiveCaps(I0d, 0).allowedWithin === 0 && v(I0d, RCP_PIN, { amount: 1, reason: "loyal", pct: 0 }).code === "above_profit_needs_owner");
}

console.log("▸ run.sh ١٠) سِيَقُ الدفع: غيرُ المدير يغيّر الطريقةَ وحدها");
{
  const one = [{ method: "cash", amount: 100, at: "2026-10-01T09:00:00.000Z" }];
  check("طريقةُ الساق الوحيدة (setInvoicePaymentMethod): مسموح", m.legsChangeAllowedForStaff(one, [{ ...one[0], method: "card" }]));
  check("  ولا مبلغُها", !m.legsChangeAllowedForStaff(one, [{ ...one[0], amount: 60 }]));
  check("  ولا وقتُها", !m.legsChangeAllowedForStaff(one, [{ ...one[0], at: "2026-01-01T00:00:00.000Z" }]));
  check("  ولا يضيف ساقاً", !m.legsChangeAllowedForStaff(one, [...one, { method: "cash", amount: 1 }]));
  check("  ولا شيءَ تغيّر: مسموح (ولو اختلف ترتيبُ المفاتيح وشكلُ الرقم)", m.legsChangeAllowedForStaff(one, [{ at: "2026-10-01T09:00:00.000Z", amount: 100.0, method: "cash" }]));
  const three = [
    { method: "cash", amount: 100, at: "2026-10-01T09:00:00.000Z" },
    { method: "cash", amount: -30, at: "2026-10-02T09:00:00.000Z", note: "مرتجع: علبة" },
    { method: "cash", amount: 50, at: "2026-10-03T09:00:00.000Z" },
  ];
  check("ثلاثُ سِيَق بسالبٍ موسوم: طريقةُ الثالثة بمكانها مسموحة", m.legsChangeAllowedForStaff(three, [three[0], three[1], { ...three[2], method: "card" }]));
  check("  وما يرسله محرّرُ «دفع مجزأ» (السالبُ آخراً) مرفوض", !m.legsChangeAllowedForStaff(three, [three[0], three[2], three[1]]));
  check("  وإسقاطُ الملاحظة مرفوض", !m.legsChangeAllowedForStaff(three, [three[0], { method: "cash", amount: -30, at: "2026-10-02T09:00:00.000Z" }, three[2]]));
  check("  ومن لا شيء إلى ساق: مرفوض، ومن null إلى []: لا تغيّر", !m.legsChangeAllowedForStaff(null, one) && m.legsChangeAllowedForStaff(null, []));
}

console.log("▸ تحذيرُ الكلفة الصفرية");
{
  const items = [
    { id: "a", invoice_id: "x", product_id: "p1", name: "طوق", qty: 1, unit_price: 10, unit_cost: 0, line_total: 10 },
    { id: "b", invoice_id: "x", product_id: "p2", name: "علف", qty: 2, unit_price: 10, unit_cost: 6, line_total: 20 },
    { id: "c", invoice_id: "x", product_id: null, name: "أجرة توصيل", qty: 1, unit_price: 5, unit_cost: 0, line_total: 5 },
  ];
  check("سطرُ منتجٍ كلفتُه صفر يُعدّ، وسطرٌ بلا منتج (أجرة/خدمة) لا", m.zeroCostProductLines(items).map((x) => x.id).join() === "a" && m.profitOverstated(items));
  check("  وبلا سطورٍ كهذه لا تحذير", !m.profitOverstated(items.slice(1)) && !m.profitOverstated(null));
}

console.log("▸ الطالبُ لازم — فحصُ الواجهة لا يقول «مسموح» عمّا يرفضه الخادمُ دائماً");
{
  // حالةُ التدقيق: ١٠٠، دُفع ٠، ربح ٥٠؛ استقبالٌ بمفتاح المدير يرسل ٦٠ بملاحظةٍ وإقرار ⇒ الخادمُ: above_profit_needs_owner (50).
  const i = inv();
  const over = { amount: 60, reason: "negotiation", note: "اتفاق مع المالك", confirmLoss: true };
  const pinRcp = m.forgiveActor({ base: "receptionist", pin: true });
  check("forgiveActor: الاستقبالُ بالمفتاح auth_role مدير، والأساسُ استقبال", pinRcp.role === "manager" && pinRcp.base === "receptionist" && pinRcp.pin && pinRcp.signedIn && !pinRcp.operator);
  check("  والمديرُ بحسابه مدير بلا مفتاح، والطبيبُ بلا مفتاح طبيب", m.forgiveActor({ base: "manager", pin: false }).role === "manager" && m.forgiveActor({ base: "veterinarian", pin: false }).role === "veterinarian");
  const r = v(i, pinRcp, over);
  check("  ٦٠ فوق السقف بالمفتاح: above_profit_needs_owner بالمسموح ٥٠ — قبل أن تُطلب ملاحظةٌ وإقرار",
    !r.ok && r.code === "above_profit_needs_owner" && r.allowed === 50 && r.pin === true, r);
  const r2 = v(i, pinRcp, { amount: 60, reason: "negotiation" });
  check("  وبلا ملاحظةٍ ولا إقرار: الرمزُ نفسُه (لا note_required يقود لطريقٍ مسدود)", !r2.ok && r2.code === "above_profit_needs_owner", r2);
  check("  وبلا طالبٍ أصلاً: not_allowed لا «مسموح»", ["not_allowed"].includes(m.validateForgive({ inv: i, openDelivery: false, pct: 100, ...over }).code)
    && m.validateVoid({ reason: "سبب واضح", entry: { kind: "forgive", amount: 1, voided_at: null }, inv: { status: "paid", forgiven: 1 }, openDelivery: false }).code === "not_allowed");
  check("  وصاحبُ العيادة بحسابه بنفس الطلب يمرّ فوق السقف", v(i, m.forgiveActor({ base: "manager", pin: false }), over).ok === true);
}

console.log("▸ الرموزُ وترتيبُها");
check("كلُّ رمزٍ يُرجعه validateForgive من قائمة الدالّة", ["not_allowed", "operator_not_allowed", "invoice_not_found", "due_changed", "above_due", "confirm_loss_required"].every((c) => m.FORGIVE_ERRORS.includes(c)));
check("ومفتاحُ ترجمة الرفض بنطاقه", tx.forgiveErrorKey("above_due") === "forgive.err.above_due");

console.log(`\n${fail ? "✗" : "✓"} الخصمُ على الدين: ${pass} نجح، ${fail} فشل`);
process.exit(fail ? 1 : 0);
