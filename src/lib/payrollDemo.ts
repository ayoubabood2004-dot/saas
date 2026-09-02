/* ============================================================================
 * مخزن الرواتب بالوضع التجريبي (localStorage).
 *
 * ليس واجهةً مبسّطة لعرضٍ جميل: هو **يفرض الحُرّاس نفسها** التي تفرضها
 * دوال 0112 على الخادم — سقف الاستقطاع، ومنع الكتابة بعد الاعتماد، والسبب
 * الإلزامي، وربط قسط السلفة بسلفته، والاشتقاق لا القبول للإجماليات. السبب
 * عملي: الفحص الحيّ يجري بالوضع التجريبي، فحارسٌ لا يوجد هنا هو حارسٌ لم
 * يُفحص — وقاعدة تُفحص بمكانٍ لا تُطبَّق فيه ليست مفحوصة.
 * ==========================================================================*/
import { getActiveClinicId } from "./clinics";
import { uid } from "./utils";
import { DEFAULT_POLICY, normalizePolicy, elementOf, isAdvance } from "./payroll";
import { salaryExpenseText, loanExpenseText, drawExpenseText, unnamedStaff } from "./payrollLabels";
import type {
  PayrollPolicyDTO, StaffComp, StaffRecurring, PayrollRun, Payslip, PayslipLine,
  StaffLoan, StaffLoanEvent, PayslipDraft, PayMethod, Expense, PayrollAdjustment,
} from "@/types";

interface Store {
  policy: PayrollPolicyDTO;
  comp: StaffComp[];
  recurring: StaffRecurring[];
  adjustments: PayrollAdjustment[];
  runs: PayrollRun[];
  slips: Payslip[];
  lines: PayslipLine[];
  loans: StaffLoan[];
  events: StaffLoanEvent[];
}

const KEY = () => `vp_demo_payroll_${getActiveClinicId()}`;
const EMPTY = (): Store => ({
  policy: { ...DEFAULT_POLICY }, comp: [], recurring: [], adjustments: [],
  runs: [], slips: [], lines: [], loans: [], events: [],
});

function load(): Store {
  try {
    const raw = localStorage.getItem(KEY());
    if (!raw) return EMPTY();
    return { ...EMPTY(), ...(JSON.parse(raw) as Store) };
  } catch { return EMPTY(); }
}
function save(s: Store): void {
  try { localStorage.setItem(KEY(), JSON.stringify(s)); } catch { /* ملء المخزن لا يُسقط العملية */ }
}

const now = () => new Date().toISOString();

/** يُحقن من repo.ts — تسجيل مصروفٍ بسجل العيادة (ما خرج من الدرج فعلاً). */
export type ExpenseSink = (e: Omit<Expense, "id" | "created_at">) => Promise<Expense>;
/** ونقيضُه — يُحقن كذلك، ليمحو فكُّ التسليم المصروفَ الذي كتبه التسليم. */
export type ExpenseVoid = (id: string) => Promise<void>;

/* ── السياسة ─────────────────────────────────────────────────────────────── */
export const getPolicy = (): PayrollPolicyDTO => normalizePolicy(load().policy);
export function setPolicy(p: PayrollPolicyDTO): PayrollPolicyDTO {
  const s = load();
  s.policy = normalizePolicy(p);
  save(s);
  return s.policy;
}

/* ── هيكل الأجر ──────────────────────────────────────────────────────────── */
export const listComp = (): StaffComp[] =>
  load().comp.slice().sort((a, b) => b.effective_from.localeCompare(a.effective_from));

export function setComp(staffId: string, from: string, base: number, note?: string | null): StaffComp {
  if (!(base >= 0)) throw new Error("bad amount");
  const s = load();
  // أجرٌ واحد ساري لكل تاريخ — نفس القيد الفريد بالخادم.
  const hit = s.comp.find((c) => c.staff_id === staffId && c.effective_from === from);
  if (hit) {
    hit.base_amount = base; hit.note = note ?? null;
    save(s); return hit;
  }
  const row: StaffComp = {
    id: uid("cmp"), clinic_id: null, staff_id: staffId, effective_from: from,
    base_amount: base, note: note ?? null, created_at: now(),
  };
  s.comp.push(row); save(s); return row;
}

export function deleteComp(id: string): void {
  const s = load();
  s.comp = s.comp.filter((c) => c.id !== id);
  save(s);
}

export const listRecurring = (): StaffRecurring[] => load().recurring.slice();

export function addRecurring(staffId: string, code: string, amount: number, note?: string | null): StaffRecurring {
  if (!(amount > 0)) throw new Error("bad amount");
  const s = load();
  const row: StaffRecurring = {
    id: uid("rec"), clinic_id: null, staff_id: staffId, code, amount,
    note: note ?? null, from_date: now().slice(0, 10), to_date: null, created_at: now(),
  };
  s.recurring.push(row); save(s); return row;
}

export function deleteRecurring(id: string): void {
  const s = load();
  s.recurring = s.recurring.filter((r) => r.id !== id);
  save(s);
}

/* ── البنود اليدوية (0142) ───────────────────────────────────────────────── */
/* صفٌّ دائم لكل قطعٍ أو زيادة، مفتاحُه (الموظف، الشهر). قبلها كان البند يعيش
 * بذاكرة الشاشة، فتمحوه أوّلُ إعادة حساب — قطعٌ يختفي بلا أن يعلم أحد. */

const monthOf = (period: string): string => `${period.slice(0, 7)}-01`;

/** هل شهرُ البند مجمَّد؟ بعد الاعتماد تصير القسيمة وثيقةً لا مسوّدة. */
function periodFrozen(s: Store, period: string): boolean {
  const p = monthOf(period);
  return s.runs.some((r) => r.period === p && ["approved", "paid", "closed"].includes(r.status));
}

export const listAdjustments = (period?: string): PayrollAdjustment[] =>
  load().adjustments.filter((a) => !period || a.period === monthOf(period))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));

export function addAdjustment(
  staffId: string, period: string, code: string,
  amount?: number | null, qty?: number | null, reason?: string | null,
): PayrollAdjustment {
  const s = load();
  const p = monthOf(period);
  if (periodFrozen(s, p)) throw new Error("period is frozen");
  // بندٌ بلا مقدار يمرّ صامتاً بالقسيمة فيبدو أنه طُبّق — وهو لم يُطبَّق.
  if (!((qty ?? 0) > 0) && !((amount ?? 0) > 0)) throw new Error("bad amount");
  const row: PayrollAdjustment = {
    id: uid("adj"), clinic_id: null, staff_id: staffId, period: p, code,
    amount: amount ?? 0, qty: qty ?? null, reason: reason?.trim() || null,
    reversed_amount: 0, reversed_qty: 0, reversed_at: null, reversed_reason: null,
    created_by: null, created_at: now(),
  };
  s.adjustments.push(row); save(s); return row;
}

export function deleteAdjustment(id: string): void {
  const s = load();
  const row = s.adjustments.find((a) => a.id === id);
  if (!row) throw new Error("adjustment not found");
  if (periodFrozen(s, row.period)) throw new Error("period is frozen");
  s.adjustments = s.adjustments.filter((a) => a.id !== id);
  save(s);
}

/** ردٌّ كامل (بلا مقدار) أو جزئيّ. الأصل يبقى ظاهراً — النافذ هو الفرق. */
export function reverseAdjustment(
  id: string, amount?: number | null, qty?: number | null, reason?: string | null,
): PayrollAdjustment {
  const s = load();
  const row = s.adjustments.find((a) => a.id === id);
  if (!row) throw new Error("adjustment not found");
  if (periodFrozen(s, row.period)) throw new Error("period is frozen");

  const leftAmt = row.amount - row.reversed_amount;
  const leftQty = (row.qty ?? 0) - row.reversed_qty;
  if (leftAmt <= 0 && leftQty <= 0) throw new Error("already reversed");

  if (row.qty != null) {
    const q = Math.min(qty ?? leftQty, leftQty);
    if (!(q > 0)) throw new Error("bad amount");
    row.reversed_qty += q;
  } else {
    const a = Math.min(amount ?? leftAmt, leftAmt);
    if (!(a > 0)) throw new Error("bad amount");
    row.reversed_amount += a;
  }
  row.reversed_at = now();
  if (reason?.trim()) row.reversed_reason = reason.trim();
  save(s);
  return row;
}

/* ── الدورة ──────────────────────────────────────────────────────────────── */
export const listRuns = (): PayrollRun[] =>
  load().runs.slice().sort((a, b) => b.period.localeCompare(a.period));

export function openRun(period: string): PayrollRun {
  const s = load();
  const hit = s.runs.find((r) => r.period === period);
  if (hit) return hit;
  const row: PayrollRun = {
    id: uid("run"), clinic_id: null, period, status: "draft",
    policy: normalizePolicy(s.policy), created_at: now(),
  };
  s.runs.push(row); save(s); return row;
}

/** البنود التقديرية: بلا سببٍ نصّي تُرفض — نفس قائمة الخادم. */
const REASON_CODES = new Set(["BONUS", "RETRO", "SHORT", "DMG", "PEN", "OTHER"]);

export function saveSlips(runId: string, drafts: PayslipDraft[]): { run: string; payslips: number } {
  const s = load();
  const run = s.runs.find((r) => r.id === runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "draft" && run.status !== "calculated") throw new Error(`run is frozen (${run.status})`);

  const pol = normalizePolicy(run.policy ?? s.policy);
  // إعادة الحساب تمحو القديم: المسوّدة تُستبدل لا تُراكَم.
  const dropped = new Set(s.slips.filter((p) => p.run_id === runId).map((p) => p.id));
  s.slips = s.slips.filter((p) => p.run_id !== runId);
  s.lines = s.lines.filter((l) => !dropped.has(l.payslip_id));

  for (const d of drafts) {
    let gross = 0, ded = 0, defer = 0, exempt = 0, capped = 0;
    for (const l of d.lines) {
      if (l.amount < 0 || (l.deferred ?? 0) < 0) throw new Error("negative line");
      if (REASON_CODES.has(l.code) && !(l.reason ?? "").trim()) throw new Error(`reason required for ${l.code}`);
      if (l.kind === "earning") gross += l.amount;
      else {
        ded += l.amount; defer += l.deferred ?? 0;
        if (elementOf(l.code)?.capExempt) exempt += l.amount; else capped += l.amount;
      }
    }
    if (ded > gross) throw new Error("deductions exceed gross");
    const cap = Math.round((Math.max(0, gross - exempt) * pol.deductionCapPct) / 100 / pol.roundTo) * pol.roundTo;
    if (capped > cap + 1) throw new Error(`deduction cap exceeded (${capped} > ${cap})`);

    const slip: Payslip = {
      id: uid("slp"), clinic_id: null, run_id: runId, staff_id: d.staff_id,
      staff_name: d.staff_name || unnamedStaff(), branch_id: d.branch_id ?? null,
      base_amount: d.base_amount ?? 0, gross, deductions: ded, deferred: defer,
      net: gross - ded, created_at: now(),
    };
    s.slips.push(slip);
    for (const l of d.lines) {
      s.lines.push({
        id: uid("pll"), clinic_id: null, payslip_id: slip.id, code: l.code, kind: l.kind,
        qty: l.qty ?? null, rate: l.rate ?? null, amount: l.amount, deferred: l.deferred ?? 0,
        reason: (l.reason ?? "").trim() || null, ref_kind: l.ref_kind ?? null, ref_id: l.ref_id ?? null,
        created_at: now(),
      });
    }
  }

  run.status = "calculated";
  run.calculated_at = now();
  run.policy = pol;
  save(s);
  return { run: runId, payslips: drafts.length };
}

export function approveRun(runId: string): PayrollRun {
  const s = load();
  const run = s.runs.find((r) => r.id === runId);
  if (!run) throw new Error("run not found");
  if (run.status !== "calculated") throw new Error(`run must be calculated (is ${run.status})`);
  const slips = s.slips.filter((p) => p.run_id === runId);
  if (!slips.length) throw new Error("run has no payslips");

  // خصم الأقساط والسحوبات يجري **عند الاعتماد وحده**: خصمُه من مسوّدةٍ تُحسب
  // عشر مرّات يفني السلفة بلا أن يُدفع دينار. والحرّاس الثلاثة نفس 0140:
  // الصفّ لنفس الموظف، ونوعه يطابق رمز السطر، والمبلغ لا يتجاوز الباقي.
  const slipIds = new Set(slips.map((p) => p.id));
  const staffOf = new Map(slips.map((p) => [p.id, p.staff_id]));
  for (const l of s.lines.filter((x) => slipIds.has(x.payslip_id) && (x.code === "LOAN" || x.code === "ADV") && x.amount > 0)) {
    if (!l.ref_id) throw new Error("loan line without loan reference");
    const loan = s.loans.find((x) => x.id === l.ref_id && x.status === "active");
    if (!loan) throw new Error(`loan ${l.ref_id} is not active`);
    if (loan.staff_id !== staffOf.get(l.payslip_id)) throw new Error(`loan ${l.ref_id} belongs to another employee`);
    if (isAdvance(loan) !== (l.code === "ADV")) throw new Error(`line ${l.code} does not match loan kind ${loan.kind ?? "loan"}`);
    if (l.amount > loan.remaining) throw new Error(`line collects more than remaining on ${l.ref_id}`);
    loan.remaining = Math.max(0, loan.remaining - l.amount);
    if (loan.remaining <= 0) loan.status = "settled";
    s.events.push({
      id: uid("lev"), clinic_id: null, loan_id: loan.id, kind: "installment",
      amount: l.amount, payslip_id: l.payslip_id, at: now(),
    });
  }

  run.status = "approved";
  run.approved_at = now();
  save(s);
  return run;
}

export async function paySlip(slipId: string, method: PayMethod, sink: ExpenseSink): Promise<Payslip> {
  const s = load();
  const slip = s.slips.find((p) => p.id === slipId);
  if (!slip) throw new Error("payslip not found");
  if (slip.paid_at) return slip;                       // idempotent: لا دفع مرّتين
  const run = s.runs.find((r) => r.id === slip.run_id);
  if (!run || (run.status !== "approved" && run.status !== "paid")) {
    throw new Error(`run not approved (is ${run?.status})`);
  }

  // الترحيل بالصافي المدفوع وحده — الأساس النقدي (شرح القرار ١ بالهجرة 0112).
  let expenseId: string | null = null;
  if (slip.net > 0) {
    const e = await sink({
      clinic_id: null, amount: slip.net,
      description: salaryExpenseText(slip.staff_name, run.period.slice(0, 7)),
      category: "payroll", method: method === "cash" ? "cash" : "bank",
      staff_id: null, spent_at: now(),
    });
    expenseId = e.id;
  }

  // إعادة القراءة بعد await: الحوض كتب على نفس المخزن، فحفظُ نسخةٍ قديمة
  // فوقه يمحو المصروف الذي لتوّه سُجّل.
  const s2 = load();
  const slip2 = s2.slips.find((p) => p.id === slipId)!;
  slip2.paid_at = now();
  slip2.pay_method = method;
  slip2.expense_id = expenseId;
  if (!s2.slips.some((p) => p.run_id === slip2.run_id && !p.paid_at)) {
    const r = s2.runs.find((x) => x.id === slip2.run_id);
    if (r) { r.status = "paid"; r.paid_at = now(); }
  }
  save(s2);
  return slip2;
}

/**
 * فكّ التسليم (0142): ضغطةُ «تسليم» غلطاً كانت قيداً أبدياً — تكتب مصروفاً
 * وتختم القسيمة بلا نقيض. والفكُّ يمحو **ذاك** المصروف بعينه (بمعرّفه المخزون
 * بالقسيمة، لا مصروفاً يشبهه)، ويرجع الدورة من «مدفوعة» إلى «معتمدة».
 * والمقفلة لا تُفَكّ: القفل ختامٌ محاسبيّ لا ضغطةُ زر.
 */
export async function unpaySlip(slipId: string, voidExpense: ExpenseVoid): Promise<Payslip> {
  const s = load();
  const slip = s.slips.find((p) => p.id === slipId);
  if (!slip) throw new Error("payslip not found");
  if (!slip.paid_at) return slip;                      // نقيضٌ متعادل: فكُّ ما لم يُدفع لا شيء
  const run = s.runs.find((r) => r.id === slip.run_id);
  if (run?.status === "closed") throw new Error("run is closed");

  const expenseId = slip.expense_id ?? null;
  if (expenseId) await voidExpense(expenseId);

  // إعادة القراءة بعد await — للسبب نفسه الذي بـpaySlip: الحوض كتب على المخزن.
  const s2 = load();
  const slip2 = s2.slips.find((p) => p.id === slipId)!;
  slip2.paid_at = null;
  slip2.pay_method = null;
  slip2.expense_id = null;
  const r2 = s2.runs.find((x) => x.id === slip2.run_id);
  if (r2 && r2.status === "paid") { r2.status = "approved"; r2.paid_at = null; }
  save(s2);
  return slip2;
}

export function closeRun(runId: string): PayrollRun {
  const s = load();
  const run = s.runs.find((r) => r.id === runId);
  if (!run || run.status !== "paid") throw new Error("run must be paid first");
  run.status = "closed";
  run.closed_at = now();
  save(s);
  return run;
}

export const listSlips = (runId?: string): Payslip[] =>
  load().slips.filter((p) => !runId || p.run_id === runId)
    .sort((a, b) => a.staff_name.localeCompare(b.staff_name, "ar"));

export function listLines(payslipIds?: string[]): PayslipLine[] {
  const set = payslipIds ? new Set(payslipIds) : null;
  return load().lines.filter((l) => !set || set.has(l.payslip_id));
}

/* ── السلف ───────────────────────────────────────────────────────────────── */
export const listLoans = (): StaffLoan[] =>
  load().loans.slice().sort((a, b) => b.created_at.localeCompare(a.created_at));

export const listLoanEvents = (loanId?: string): StaffLoanEvent[] =>
  load().events.filter((e) => !loanId || e.loan_id === loanId)
    .sort((a, b) => b.at.localeCompare(a.at));

export async function disburseLoan(
  staffId: string, staffName: string, principal: number, installment: number,
  reason: string | null, method: PayMethod, sink: ExpenseSink,
  kind: "loan" | "advance" = "loan",
): Promise<StaffLoan> {
  if (!(principal > 0)) throw new Error("bad principal");
  if (!(installment > 0)) throw new Error("bad installment");
  if (installment > principal) throw new Error("installment above principal");
  // السحب يُقطع كاملاً بأقرب قسيمة: قسطُه أصلُه — نفس قيد 0140.
  if (kind === "advance" && installment !== principal) throw new Error("advance installment must equal amount");

  // الفلوس تخرج من الدرج فعلاً ⇒ مصروف. السلفة **ذمّةٌ لا كلفة رواتب** فلها
  // تصنيفها الخاص؛ أما السحب فراتبُ هذا الشهر دُفع مبكّراً فيدخل الرواتب —
  // وبهذا يبقى مجموع «payroll» بالشهر = ما دُفع رواتباً فعلاً.
  const e = await sink({
    clinic_id: null, amount: principal,
    description: kind === "advance" ? drawExpenseText(staffName, now().slice(0, 7)) : loanExpenseText(staffName),
    category: kind === "advance" ? "payroll" : "payroll_loan", method: method === "cash" ? "cash" : "bank",
    staff_id: null, spent_at: now(),
  });

  const s = load();
  const loan: StaffLoan = {
    id: uid("lon"), clinic_id: null, staff_id: staffId, principal, installment,
    remaining: principal, reason: (reason ?? "").trim() || null, status: "active",
    started_on: now().slice(0, 10), expense_id: e.id, created_at: now(), kind,
  };
  s.loans.push(loan);
  s.events.push({ id: uid("lev"), clinic_id: null, loan_id: loan.id, kind: "disbursed", amount: principal, at: now() });
  save(s);
  return loan;
}

export function writeOffLoan(loanId: string, note: string): StaffLoan {
  if (!note.trim()) throw new Error("reason required");
  const s = load();
  const loan = s.loans.find((l) => l.id === loanId && l.status === "active");
  if (!loan) throw new Error("loan not active");
  loan.status = "written_off";
  s.events.push({
    id: uid("lev"), clinic_id: null, loan_id: loan.id, kind: "written_off",
    amount: loan.remaining, note: note.trim(), at: now(),
  });
  save(s);
  return loan;
}
