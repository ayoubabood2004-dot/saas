/* ============================================================================
 * فحص منطق الرواتب — على الشِفرة نفسها، لا على نسخةٍ منها.
 *
 * الراتب حسابٌ يُجمَّد: خطأٌ فيه لا يُرى بالشاشة بل يُدفع نقداً ويُطبع على
 * قسيمةٍ يوقّعها موظف. ولا مشغّلَ فحوصٍ بالمشروع، فنبني الوحدة بـesbuild
 * (موجودٌ أصلاً مع vite) ونشغّلها بـnode. القسم الأول على `payroll.ts` النقيّة
 * بلا أي بديل؛ والثاني على المخزن التجريبي `payrollDemo.ts` — وهو **يفرض
 * حرّاسَ الخادم نفسها** (0112 و0140)، فما يُفحص هنا هو ما سيرفضه الخادم.
 *
 *   node scripts/payroll-test.mjs
 * ==========================================================================*/
import esbuild from "esbuild";

let failures = 0, passes = 0;
const check = (name, cond, detail = "") => {
  if (cond) { passes++; console.log(`   ✓ ${name}`); }
  else { failures++; console.error(`   ✗ ${name}${detail ? ` — ${detail}` : ""}`); }
};
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const throwsWith = async (fn, frag) => {
  try { await fn(); return false; } catch (e) { return String(e?.message ?? e).includes(frag); }
};

async function bundle(entry, plugins = []) {
  const built = await esbuild.build({
    entryPoints: [entry], bundle: true, format: "esm", write: false,
    platform: "neutral", tsconfig: "tsconfig.json", plugins,
  });
  return import("data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64"));
}

/* ── ١) الحساب النقيّ ─────────────────────────────────────────────────────*/
console.log("▸ payroll.ts — الحساب النقيّ");
const P = await bundle("src/lib/payroll.ts");
const POL = P.DEFAULT_POLICY;                      // ÷٣٠، سقف ٥٠٪، تقريب ٢٥٠
const staff = { id: "s1", name: "Ali" };
const slip = (loans, manual = [], base = 600000, recurring = []) =>
  P.buildSlip({ staff, base, recurring, loans, manual }, POL);
const invariants = (name, c) => {
  check(`${name}: deductions ≤ gross`, c.deductions <= c.gross, `${c.deductions} > ${c.gross}`);
  check(`${name}: gross − deductions = net`, c.gross - c.deductions === c.net);
  check(`${name}: deferred = Σ line.deferred`, c.deferred === c.lines.filter((l) => l.kind === "deduction").reduce((s, l) => s + l.deferred, 0));
};

// أ) الترتيب والمرجع: ADV قبل LOAN، وصفٌّ بلا نوعٍ = سلفة
{
  const b = slip([
    { id: "l1", staff_id: "s1", principal: 300000, installment: 50000, remaining: 150000, status: "active" },
    { id: "a1", staff_id: "s1", principal: 200000, installment: 200000, remaining: 200000, status: "active", kind: "advance", started_on: "2026-08-12" },
  ], [{ code: "OT", amount: 30000 }], 600000, [{ code: "ALLOW", amount: 50000 }]);
  const codes = b.lines.map((l) => l.code);
  check("أ: الترتيب BASIC, ALLOW, OT, ADV, LOAN", eq(codes, ["BASIC", "ALLOW", "OT", "ADV", "LOAN"]), codes.join(","));
  const adv = b.lines.find((l) => l.code === "ADV"), loan = b.lines.find((l) => l.code === "LOAN");
  check("أ: سطر السحب يحمل مرجعه", adv.ref_kind === "advance" && adv.ref_id === "a1" && adv.reason === "2026-08-12");
  check("أ: سطر القسط يحمل مرجعه", loan.ref_kind === "loan" && loan.ref_id === "l1" && loan.amount === 50000);
  check("أ: isAdvance يقرأ غياب النوع سلفةً", P.isAdvance({ kind: "advance" }) && !P.isAdvance({}) && !P.isAdvance({ kind: "loan" }));
  invariants("أ", b.computation);
}

// ب) القصّ: سحبٌ أكبر من الراتب مع يومَي غياب
{
  const b = slip([{ id: "a1", staff_id: "s1", principal: 700000, installment: 700000, remaining: 700000, status: "active", kind: "advance" }],
    [{ code: "ABS", qty: 2 }]);
  const c = b.computation, adv = c.lines.find((l) => l.code === "ADV");
  check("ب: غياب يومين = ٤٠٬٠٠٠", c.lines.find((l) => l.code === "ABS").amount === 40000);
  check("ب: السحب يُقصّ إلى ٥٦٠٬٠٠٠", adv.amount === 560000, String(adv.amount));
  check("ب: والباقي ١٤٠٬٠٠٠ مرحَّل على السطر", adv.deferred === 140000, String(adv.deferred));
  check("ب: القطوعات = الإجمالي والصافي صفر", c.deductions === c.gross && c.net === 0);
  check("ب: مرحَّل القسيمة يشمل باقي السحب", c.deferred === 140000, String(c.deferred));
  invariants("ب", c);
}

// ج) قصٌّ كامل: السطر يبقى ظاهراً بصفرٍ وباقٍ كامل
{
  const b = slip([{ id: "a1", staff_id: "s1", principal: 100000, installment: 100000, remaining: 100000, status: "active", kind: "advance" }],
    [{ code: "ABS", qty: 30 }]);
  const adv = b.computation.lines.find((l) => l.code === "ADV");
  check("ج: السطر موجود بمبلغ صفر", adv && adv.amount === 0, JSON.stringify(adv));
  check("ج: وباقيه كامل", adv && adv.deferred === 100000);
  invariants("ج", b.computation);
}

// د) السقف يُحسب بعد السحب: السحب يتقدّم على القسط
{
  const b = slip([
    { id: "a1", staff_id: "s1", principal: 500000, installment: 500000, remaining: 500000, status: "active", kind: "advance" },
    { id: "l1", staff_id: "s1", principal: 400000, installment: 100000, remaining: 400000, status: "active" },
  ]);
  const c = b.computation, loan = c.lines.find((l) => l.code === "LOAN");
  check("د: capBase = ١٠٠٬٠٠٠ والسقف ٥٠٬٠٠٠", c.capBase === 100000 && c.cap === 50000, `${c.capBase}/${c.cap}`);
  check("د: القسط يُطبَّق ٥٠٬٠٠٠ ويُرحَّل ٥٠٬٠٠٠", loan.amount === 50000 && loan.deferred === 50000);
  check("د: القطوعات ٥٥٠٬٠٠٠ والصافي ٥٠٬٠٠٠", c.deductions === 550000 && c.net === 50000);
  check("د: مرحَّل ٥٠٬٠٠٠", c.deferred === 50000);
  invariants("د", c);
}

// هـ) سحبان بالشهر: بالترتيب، الأقدم أوّلاً
{
  const b = slip([
    { id: "a1", staff_id: "s1", principal: 400000, installment: 400000, remaining: 400000, status: "active", kind: "advance" },
    { id: "a2", staff_id: "s1", principal: 300000, installment: 300000, remaining: 300000, status: "active", kind: "advance" },
  ]);
  const [x, y] = b.computation.lines.filter((l) => l.code === "ADV");
  check("هـ: الأوّل كاملاً ٤٠٠٬٠٠٠", x.ref_id === "a1" && x.amount === 400000 && x.deferred === 0);
  check("هـ: الثاني ٢٠٠٬٠٠٠ وباقيه ١٠٠٬٠٠٠", y.ref_id === "a2" && y.amount === 200000 && y.deferred === 100000);
  invariants("هـ", b.computation);
}

// و) قسط السحب المتبقّي = الباقي
check("و: dueInstallment على سحبٍ بقي منه ١٤٠٬٠٠٠", P.dueInstallment({ kind: "advance", installment: 700000, remaining: 140000, status: "active" }) === 140000);
check("و: سحبٌ مسدَّد لا يولّد قسطاً", P.dueInstallment({ kind: "advance", installment: 700000, remaining: 0, status: "settled" }) === 0);

// ز) انحدار: قسيمةٌ بلا سحبٍ تُعطي نفس الأرقام حرفياً (لقطةٌ محسوبة يداً)
{
  const b = slip([{ id: "l1", staff_id: "s1", principal: 300000, installment: 100000, remaining: 300000, status: "active" }],
    [{ code: "ABS", qty: 2 }, { code: "PEN", amount: 100000, reason: "x" }], 600000, [{ code: "ALLOW", amount: 50000 }]);
  const c = b.computation;
  const snap = { gross: c.gross, exemptDeductions: c.exemptDeductions, capBase: c.capBase, cap: c.cap,
    cappedRequested: c.cappedRequested, cappedApplied: c.cappedApplied, deferred: c.deferred,
    deductions: c.deductions, net: c.net, dayRate: c.dayRate };
  const want = { gross: 650000, exemptDeductions: 40000, capBase: 610000, cap: 305000,
    cappedRequested: 200000, cappedApplied: 200000, deferred: 0, deductions: 240000, net: 410000, dayRate: 20000 };
  check("ز: اللقطة مطابقة", eq(snap, want), JSON.stringify(snap));
  check("ز: مبالغ السطور", eq(c.lines.map((l) => [l.code, l.amount]), [["BASIC", 600000], ["ALLOW", 50000], ["ABS", 40000], ["PEN", 100000], ["LOAN", 100000]]));
  invariants("ز", c);
}

// ح) الكتالوج: السحب والقسط لا يُدخَلان بيد — بلا مرجعٍ لا يُسوَّيان أبداً
check("ح: MANUAL_CODES بلا ADV ولا LOAN", !P.MANUAL_CODES.includes("ADV") && !P.MANUAL_CODES.includes("LOAN"));
check("ح: ADV معفىً من السقف وLOAN خاضعٌ له", P.elementOf("ADV").capExempt === true && P.elementOf("LOAN").capExempt === false);

/* ── ٢) المخزن التجريبي — نفس حرّاس الخادم ──────────────────────────────*/
console.log("▸ payrollDemo.ts — الصرف والحفظ والاعتماد");
const mem = new Map();
globalThis.localStorage = {
  getItem: (k) => (mem.has(k) ? mem.get(k) : null),
  setItem: (k, v) => { mem.set(k, v); },
  removeItem: (k) => mem.delete(k),
};
let seq = 0;
const stubs = {
  name: "stubs",
  setup(b) {
    b.onResolve({ filter: /(^|\/)i18n$/ }, () => ({ path: "i18n", namespace: "stub" }));
    b.onResolve({ filter: /\/clinics$/ }, () => ({ path: "clinics", namespace: "stub" }));
    b.onResolve({ filter: /\/utils$/ }, () => ({ path: "utils", namespace: "stub" }));
    b.onLoad({ filter: /^i18n$/, namespace: "stub" }, () => ({ loader: "js",
      contents: "export default { t: (k, o) => k + (o && o.name ? ':' + o.name : ''), language: 'ar' };" }));
    b.onLoad({ filter: /^clinics$/, namespace: "stub" }, () => ({ loader: "js", contents: "export const getActiveClinicId = () => 'c1';" }));
    b.onLoad({ filter: /^utils$/, namespace: "stub" }, () => ({ loader: "js", contents: "export const uid = (p) => p + '_' + (++globalThis.__seq);" }));
  },
};
globalThis.__seq = seq;
const D = await bundle("src/lib/payrollDemo.ts", [stubs]);

const expenses = [];
const sink = async (e) => { const row = { ...e, id: "exp_" + (++globalThis.__seq), created_at: "t" }; expenses.push(row); return row; };

// صرف: السحب يرفض قسطاً غير أصله، ويُسجَّل مصروفَ رواتب بنوعه
check("صرف: سحبٌ قسطُه غير أصله يُرفض", await throwsWith(() => D.disburseLoan("s1", "Ali", 200000, 50000, null, "cash", sink, "advance"), "advance installment must equal amount"));
const adv = await D.disburseLoan("s1", "Ali", 200000, 200000, null, "cash", sink, "advance");
check("صرف: نوع الصفّ advance وقسطُه أصلُه", adv.kind === "advance" && adv.installment === 200000 && adv.remaining === 200000);
check("صرف: مصروفٌ بتصنيف الرواتب وبيانِ السحب", expenses.at(-1).category === "payroll" && expenses.at(-1).description.startsWith("payroll.expDraw"));
const loan = await D.disburseLoan("s1", "Ali", 300000, 100000, null, "cash", sink);
check("صرف: السلفة كما كانت — payroll_loan وبلا تغيير", loan.kind === "loan" && expenses.at(-1).category === "payroll_loan");
const other = await D.disburseLoan("s2", "Sara", 50000, 50000, null, "cash", sink, "advance");

// دورة: تركيبٌ بالدالّة النقيّة، حفظٌ، ثم اعتمادٌ يسوّي السحب والقسط معاً
D.setComp("s1", "2026-01-01", 600000);
const run = D.openRun("2026-08-01");
const built = P.buildSlip({ staff: { id: "s1", name: "Ali" }, base: 600000, recurring: [],
  loans: D.listLoans().filter((l) => l.staff_id === "s1" && l.status === "active"), manual: [] }, POL);
const draft = (b, sid = "s1", name = "Ali") => ({ staff_id: sid, staff_name: name, branch_id: null, base_amount: b.base_amount,
  lines: b.lines.map((l) => ({ code: l.code, kind: l.kind, qty: l.qty, rate: l.rate, amount: l.amount, deferred: l.deferred, reason: l.reason, ref_kind: l.ref_kind, ref_id: l.ref_id })) });
D.saveSlips(run.id, [draft(built)]);
check("حفظ: القسيمة فيها سطرُ سحبٍ وسطرُ قسط", D.listLines().filter((l) => l.code === "ADV").length === 1 && D.listLines().filter((l) => l.code === "LOAN").length === 1);

// حرّاس الاعتماد — كلٌّ على نسخةٍ معدَّلة من السطور، ثم نعيد الحفظ الصحيح
const tamper = (mut) => { const d = draft(built); mut(d.lines); D.saveSlips(run.id, [d]); return () => D.approveRun(run.id); };
check("اعتماد: سطر ADV يشير لسلفةٍ (نوعٌ مختلف) يُرفض",
  await throwsWith(tamper((ls) => { ls.find((l) => l.code === "ADV").ref_id = loan.id; }), "does not match loan kind"));
check("اعتماد: سطر ADV يشير لسحبِ موظفٍ آخر يُرفض",
  await throwsWith(tamper((ls) => { ls.find((l) => l.code === "ADV").ref_id = other.id; }), "belongs to another employee"));
check("اعتماد: سطرٌ يقطع أكثر من الباقي يُرفض",
  await throwsWith(tamper((ls) => { const a = ls.find((l) => l.code === "ADV"); a.amount = 250000; ls.find((l) => l.code === "BASIC").amount = 900000; }), "collects more than remaining"));
check("اعتماد: سطر ADV بلا مرجعٍ يُرفض",
  await throwsWith(tamper((ls) => { ls.find((l) => l.code === "ADV").ref_id = null; }), "without loan reference"));

D.saveSlips(run.id, [draft(built)]);
D.approveRun(run.id);
const after = D.listLoans();
const a1 = after.find((l) => l.id === adv.id), l1 = after.find((l) => l.id === loan.id), o1 = after.find((l) => l.id === other.id);
check("اعتماد: السحب سُدِّد كاملاً وصار settled", a1.remaining === 0 && a1.status === "settled");
check("اعتماد: القسط نقص ١٠٠٬٠٠٠ وبقيت السلفة فعّالة", l1.remaining === 200000 && l1.status === "active");
check("اعتماد: سحبُ الموظف الآخر لم يُمَسّ", o1.remaining === 50000 && o1.status === "active");
check("اعتماد: حدثُ قسطٍ واحد لكل سطر", D.listLoanEvents(adv.id).filter((e) => e.kind === "installment").length === 1
  && D.listLoanEvents(loan.id).filter((e) => e.kind === "installment").length === 1);

// الشهر الجاي: السحب المسدَّد لا يعود، والقسط يعود
const next = P.buildSlip({ staff: { id: "s1", name: "Ali" }, base: 600000, recurring: [],
  loans: D.listLoans().filter((l) => l.staff_id === "s1" && l.status === "active"), manual: [] }, POL);
check("الشهر الجاي: بلا سطر سحب، ومع قسطٍ واحد", !next.lines.some((l) => l.code === "ADV") && next.lines.filter((l) => l.code === "LOAN").length === 1);

/* ── البنود اليدوية (0142): تتراكم، تُردّ، والتسليم يُفَكّ ─────────────────
 *
 * هذي شكوى العيادة حرفياً: «بس قطع واحد باليوم مو أكثر». وسببُها أن البند كان
 * يعيش بذاكرة الشاشة، فتمحوه أوّلُ إعادة حساب. فالفحص هنا يحرس الثابت الذي
 * أصلحها: **إعادةُ الحساب تُعطي نفس النتيجة، والقطوعات تتراكم**.
 * ------------------------------------------------------------------------*/
console.log("▸ البنود اليدوية والتراجع (0142)");

D.setComp("s2", "2026-01-01", 900000);
const PER = "2026-09-01";
const a_pen = D.addAdjustment("s2", PER, "PEN", 25000, null, "تأخير");
D.addAdjustment("s2", PER, "DMG", 40000, null, "كسر");
const a_abs = D.addAdjustment("s2", PER, "ABS", 0, 2, null);

check("قطعان بنفس الشهر يتراكمان — ما يمحي أحدُهما الآخر", D.listAdjustments(PER).filter((a) => a.staff_id === "s2").length === 3);
check("بندٌ بلا مقدارٍ يُرفض", await throwsWith(() => D.addAdjustment("s2", PER, "PEN", 0, null, null), "bad amount"));
check("الشهرُ الآخر لا يختلط", D.listAdjustments("2026-10-01").length === 0);

/** ما يبنيه الشهرُ من صفوفه — نفس ما تفعله الشاشة بالضبط. */
const manualOf = (sid, per) => D.listAdjustments(per).filter((a) => a.staff_id === sid).map((a) => {
  const l = a.qty != null
    ? { code: a.code, qty: a.qty - a.reversed_qty, reason: a.reason }
    : { code: a.code, amount: a.amount - a.reversed_amount, reason: a.reason };
  return (l.qty ?? l.amount ?? 0) > 0 ? l : null;
}).filter(Boolean);

const build2 = () => P.buildSlip({ staff: { id: "s2", name: "Sara" }, base: 900000,
  recurring: [], loans: [], manual: manualOf("s2", PER) }, POL);

const b1 = build2();
check("المعاينة تحمل القطعين والأيام", b1.lines.filter((l) => l.code === "PEN").length === 1
  && b1.lines.filter((l) => l.code === "DMG").length === 1
  && b1.lines.filter((l) => l.code === "ABS").length === 1);

// الثابتُ الحاكم: الحساب مكرَّرٌ بلا أثر. كان يُنقص بنداً كلَّ مرّة.
const run2 = D.openRun(PER);
D.saveSlips(run2.id, [draft(b1, "s2", "Sara")]);
const firstNet = D.listSlips(run2.id)[0].net;
D.saveSlips(run2.id, [draft(build2(), "s2", "Sara")]);
const again = D.listSlips(run2.id)[0];
check("إعادةُ الحساب لا تُسقط بنداً — الصافي هو هو", again.net === firstNet);
check("وسطورُها كاملةٌ بعد الإعادة", D.listLines([again.id]).filter((l) => ["PEN", "DMG", "ABS"].includes(l.code)).length === 3);

// ردٌّ جزئي ثم كامل
D.reverseAdjustment(a_pen.id, 10000, null, "تسوية");
check("ردٌّ جزئي: النافذ ١٥٬٠٠٠ لا ٢٥٬٠٠٠", manualOf("s2", PER).find((l) => l.code === "PEN").amount === 15000);
check("والأصلُ باقٍ بالسجل بمبلغه", D.listAdjustments(PER).find((a) => a.id === a_pen.id).amount === 25000);
check("ردٌّ فوق الباقي يُقصّ عند الباقي", D.reverseAdjustment(a_pen.id, 999999).reversed_amount === 25000);
check("وبعد الردّ الكامل يسقط من الحساب", !manualOf("s2", PER).some((l) => l.code === "PEN"));
check("وردُّ ما رُدَّ كلُّه يُرفض", await throwsWith(() => D.reverseAdjustment(a_pen.id), "already reversed"));
check("بندُ الأيام يُردّ بالأيام", D.reverseAdjustment(a_abs.id, null, 1).reversed_qty === 1
  && manualOf("s2", PER).find((l) => l.code === "ABS").qty === 1);

// الشهرُ المعتمد وثيقةٌ لا مسوّدة
D.saveSlips(run2.id, [draft(build2(), "s2", "Sara")]);
D.approveRun(run2.id);
check("بعد الاعتماد: لا إضافة", await throwsWith(() => D.addAdjustment("s2", PER, "PEN", 5000), "period is frozen"));
check("بعد الاعتماد: لا ردّ", await throwsWith(() => D.reverseAdjustment(a_abs.id, null, 1), "period is frozen"));
check("بعد الاعتماد: لا حذف", await throwsWith(() => D.deleteAdjustment(a_abs.id), "period is frozen"));

// فكّ التسليم: يمحو مصروفَه بعينه ويرجع الحال
const slip2 = D.listSlips(run2.id)[0];
const before = expenses.length;
await D.paySlip(slip2.id, "cash", sink);
const expId = D.listSlips(run2.id)[0].expense_id;
check("تسليم: مصروفٌ واحدٌ انكتب والقسيمة مدفوعة", expenses.length === before + 1 && !!expId
  && D.listRuns().find((r) => r.id === run2.id).status === "paid");
await D.unpaySlip(slip2.id, async (id) => { const i = expenses.findIndex((e) => e.id === id); if (i >= 0) expenses.splice(i, 1); });
const un = D.listSlips(run2.id)[0];
check("فكّ: القسيمة رجعت غير مدفوعة وبلا مصروف", !un.paid_at && !un.pay_method && !un.expense_id);
check("فكّ: المصروف انمحى بعينه — الصندوق كما كان", expenses.length === before && !expenses.some((e) => e.id === expId));
check("فكّ: الدورة رجعت «معتمدة»", D.listRuns().find((r) => r.id === run2.id).status === "approved");
check("فكّ ما لم يُدفع لا شيء (نقيضٌ متعادل)", (await D.unpaySlip(slip2.id, async () => {})).paid_at == null);

await D.paySlip(slip2.id, "cash", sink);
D.closeRun(run2.id);
check("المقفلة لا تُفَكّ", await throwsWith(() => D.unpaySlip(slip2.id, async () => {}), "run is closed"));

console.log(`\n${failures ? "✗" : "✓"} payroll-test: ${passes} نجحت، ${failures} فشلت`);
process.exit(failures ? 1 : 0);
