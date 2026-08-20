/* ============================================================================
 * منطق الرواتب — الدوال النقيّة وحدها.
 *
 * كل ما بهذا الملف حسابٌ بلا شبكة ولا تخزين، لسببين: أنه يُفحَص بلا متصفّح،
 * وأن **نفس الدوال** تُنفَّذ بالواجهة وبالخادم فتتطابق الأرقام. أي منطق يسكن
 * الواجهة وحدها هو منطق يُتجاوَز بأول طلب مصنوع بيد.
 *
 * ── المبدأ الحاكم (دراسة docs/payroll-study.html §٢) ───────────────────────
 * الراتب ليس رقماً يُكتب بل حساباً يُشتقّ ثم **يُجمَّد**. فالقسيمة هنا تُحسب
 * مرّة، وتُخزَّن مبالغها، ولا يُعاد اشتقاقها عند العرض أبداً — وإلا غيّرت
 * زيادةُ اليوم قسيمةَ السنة الماضية.
 * ==========================================================================*/

/* ── ١) البنود ────────────────────────────────────────────────────────────── */

export type ElementKind = "earning" | "deduction";

export interface PayElement {
  code: string;
  kind: ElementKind;
  /** سببٌ نصّي إلزامي — بندٌ تقديريّ بلا سبب هو نزاعٌ مؤجَّل. */
  needsReason: boolean;
  /**
   * مُعفى من سقف الاستقطاع.
   * الغياب والإجازة بلا راتب ليسا اقتطاعاً من أجرٍ استُحقّ، بل أجرٌ **لم
   * يُستحقّ** أصلاً؛ وتقييدهما بالسقف يعني الدفع مقابل أيام لم يُشتغَل بها.
   * والسحب على حساب الشهر فلوسٌ **خرجت فعلاً** من الدرج؛ وتقييده يعني دفعها
   * مرّتين.
   */
  capExempt: boolean;
  /** يولّده السستم لا الموظف (قسط سلفة، سحب على الحساب). */
  auto: boolean;
}

/**
 * أولوية الاستقطاع — الأعلى يُخصم أولاً، والترحيل للشهر الجاي يبدأ من الأسفل.
 * الترتيب مقصود: الالتزام القانوني قبل التعاقدي قبل التأديبي. فالجزاء
 * التقديري هو أوّل ما يُرحَّل حين يضيق السقف، لا قسط السلفة.
 */
const DEDUCTION_PRIORITY = ["SSC", "TAX", "LOAN", "LATE", "SHORT", "DMG", "PEN", "OTHER"] as const;

/**
 * كتالوج المرحلة الأولى — **بلا عناوين**. العنوان يسكن ملفات اللغات تحت
 * `payroll.el.<code>` وحدها: عنوانٌ هنا وآخر هناك مصدران ينحرفان، وهذا
 * الملف يجب أن يبقى نقيّاً بلا i18n حتى يُفحص بلا متصفّح.
 */
export const PAY_ELEMENTS: PayElement[] = [
  // الزيادات
  { code: "BASIC", kind: "earning", needsReason: false, capExempt: false, auto: true  },
  { code: "ALLOW", kind: "earning", needsReason: false, capExempt: false, auto: false },
  { code: "ONCALL", kind: "earning", needsReason: false, capExempt: false, auto: false },
  { code: "OT", kind: "earning", needsReason: false, capExempt: false, auto: false },
  { code: "BONUS", kind: "earning", needsReason: true,  capExempt: false, auto: false },
  { code: "RETRO", kind: "earning", needsReason: true,  capExempt: false, auto: false },
  // القطوعات
  { code: "ABS", kind: "deduction", needsReason: false, capExempt: true,  auto: false },
  { code: "UNPAID", kind: "deduction", needsReason: false, capExempt: true,  auto: false },
  { code: "ADV", kind: "deduction", needsReason: false, capExempt: true,  auto: true  },
  { code: "SSC", kind: "deduction", needsReason: false, capExempt: false, auto: false },
  { code: "TAX", kind: "deduction", needsReason: false, capExempt: false, auto: false },
  { code: "LOAN", kind: "deduction", needsReason: false, capExempt: false, auto: true  },
  { code: "LATE", kind: "deduction", needsReason: false, capExempt: false, auto: false },
  { code: "SHORT", kind: "deduction", needsReason: true,  capExempt: false, auto: false },
  { code: "DMG", kind: "deduction", needsReason: true,  capExempt: false, auto: false },
  { code: "PEN", kind: "deduction", needsReason: true,  capExempt: false, auto: false },
  { code: "OTHER", kind: "deduction", needsReason: true,  capExempt: false, auto: false },
];

const BY_CODE = new Map(PAY_ELEMENTS.map((e) => [e.code, e]));
export const elementOf = (code: string): PayElement | undefined => BY_CODE.get(code);
export const EARNING_CODES = PAY_ELEMENTS.filter((e) => e.kind === "earning").map((e) => e.code);
export const DEDUCTION_CODES = PAY_ELEMENTS.filter((e) => e.kind === "deduction").map((e) => e.code);
/** البنود التي يضيفها الإنسان بيده — البقية يولّدها السستم. */
export const MANUAL_CODES = PAY_ELEMENTS.filter((e) => !e.auto).map((e) => e.code);

/* ── ٢) السياسة ───────────────────────────────────────────────────────────── */

/**
 * أساس أجر اليوم. الفرق ليس أكاديمياً: راتب ٦٠٠٬٠٠٠ يعطي أجر يوم ٢٠٬٠٠٠
 * بالقسمة على ٣٠، و٢٣٬٠٧٧ بالقسمة على ٢٦ يوم عمل — أي ١٥٪ فرق على كل يوم
 * غياب. الاثنان مستعملان بالسوق، فالعيادة تختار مرّة، ويُطبع الاختيار على
 * القسيمة نفسها: الموظف الذي لا يعرف كيف انحسب القطع يشكّ بالسستم كلّه.
 */
export type DayRateBasis = "calendar_30" | "working_days";

export interface PayrollPolicy {
  dayRateBasis: DayRateBasis;
  /** أيام العمل بالشهر — تُستعمل مع working_days وحدها. */
  workingDays: number;
  /** أقصى نسبة تُقتطع من الأجر القابل للاقتطاع؛ والزائد يُرحَّل للشهر الجاي. */
  deductionCapPct: number;
  /** تقريب المبالغ لأقرب مضاعف (٢٥٠ للدينار مثلاً). ١ = بلا تقريب. */
  roundTo: number;
}

export const DEFAULT_POLICY: PayrollPolicy = {
  dayRateBasis: "calendar_30",
  workingDays: 26,
  // ٥٠٪ نقطة بداية معقولة لا حكمٌ قانوني — تُثبَّت من محاسب (الدراسة §١٧).
  deductionCapPct: 50,
  roundTo: 250,
};

export function normalizePolicy(p?: Partial<PayrollPolicy> | null): PayrollPolicy {
  const d = DEFAULT_POLICY;
  return {
    dayRateBasis: p?.dayRateBasis === "working_days" ? "working_days" : d.dayRateBasis,
    workingDays: clampInt(p?.workingDays, 1, 31, d.workingDays),
    deductionCapPct: clampInt(p?.deductionCapPct, 0, 100, d.deductionCapPct),
    roundTo: clampInt(p?.roundTo, 1, 5000, d.roundTo),
  };
}

function clampInt(v: unknown, lo: number, hi: number, fallback: number): number {
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(hi, Math.max(lo, n));
}

/** تقريب مبلغ لأقرب مضاعف من السياسة (وأبداً تحت الصفر). */
export const roundMoney = (n: number, policy: PayrollPolicy): number =>
  Math.max(0, Math.round(n / policy.roundTo) * policy.roundTo);

/** أجر اليوم الواحد — الأساس المعلن بالسياسة. غير مقرَّب: التقريب عند السطر. */
export function dayRate(base: number, policy: PayrollPolicy): number {
  const div = policy.dayRateBasis === "working_days" ? Math.max(1, policy.workingDays) : 30;
  return base / div;
}

/* ── ٣) هيكل الأجر المؤرَّخ ───────────────────────────────────────────────── */

export interface CompRow {
  id: string;
  staff_id: string;
  /** ساري من هذا التاريخ (YYYY-MM-DD). الزيادة صفٌّ جديد لا تعديل. */
  effective_from: string;
  base_amount: number;
  created_at?: string;
}

/**
 * الأجر الساري بتاريخٍ ما: أحدث صفٍّ لم يتجاوز التاريخ. يرجع null إن كان
 * الموظف قبل أول هيكل أجر — وهذا يمنع احتساب راتبٍ لم يُتَّفق عليه بعد.
 */
export function compAt(rows: CompRow[], onDate: string): CompRow | null {
  let best: CompRow | null = null;
  for (const r of rows) {
    if (r.effective_from > onDate) continue;
    if (!best || r.effective_from > best.effective_from
      || (r.effective_from === best.effective_from && (r.created_at ?? "") > (best.created_at ?? ""))) best = r;
  }
  return best;
}

/* ── ٤) السلف ─────────────────────────────────────────────────────────────── */

export interface LoanRow {
  id: string;
  staff_id: string;
  principal: number;
  installment: number;
  remaining: number;
  status: "active" | "settled" | "written_off";
}

/** قسط هذا الشهر: القسط المجدول أو ما تبقّى — أيّهما أصغر. */
export const dueInstallment = (l: LoanRow): number =>
  l.status !== "active" ? 0 : Math.max(0, Math.min(l.installment, l.remaining));

/** عدد الأقساط الباقية بعد قسط اليوم (للعرض على القسيمة). */
export function remainingAfter(l: LoanRow): number {
  return Math.max(0, l.remaining - dueInstallment(l));
}

/* ── ٥) حساب القسيمة ─────────────────────────────────────────────────────── */

export interface LineInput {
  code: string;
  /** كمية (أيام/مناوبات/وحدات). غيابها = مبلغٌ مباشر. */
  qty?: number | null;
  /** سعر الوحدة. غيابه مع الكمية = يُشتقّ من أجر اليوم لبنود الأيام. */
  rate?: number | null;
  /** مبلغ صريح — يتقدّم على الكمية × السعر. */
  amount?: number | null;
  reason?: string | null;
  ref_kind?: string | null;
  ref_id?: string | null;
}

export interface ComputedLine {
  code: string;
  kind: ElementKind;
  qty: number | null;
  rate: number | null;
  /** المبلغ **المطبَّق** فعلاً (بعد السقف) — دائماً موجب. */
  amount: number;
  /** الجزء المرحَّل للشهر الجاي لأن السقف ضاق عنه. */
  deferred: number;
  reason: string | null;
  ref_kind: string | null;
  ref_id: string | null;
}

export interface Computation {
  /** إجمالي الزيادات. */
  gross: number;
  /** ما لم يُستحقّ أصلاً (غياب، إجازة بلا راتب) + ما خرج مسبقاً (سحب). */
  exemptDeductions: number;
  /** الأجر الذي يجري عليه السقف. */
  capBase: number;
  /** السقف بالمبلغ. */
  cap: number;
  /** القطوعات الخاضعة للسقف كما طُلبت قبل تقييدها. */
  cappedRequested: number;
  /** القطوعات الخاضعة للسقف بعد تقييدها. */
  cappedApplied: number;
  /** المرحَّل للشهر الجاي. */
  deferred: number;
  /** مجموع كل القطوعات المطبَّقة. */
  deductions: number;
  net: number;
  lines: ComputedLine[];
  dayRate: number;
}

/**
 * الحساب. المدخلات كلّها صريحة — لا يقرأ هذا الملف شبكةً ولا ذاكرةً ولا وقتاً،
 * فنتيجته دالةٌ من وسائطها وحدها، وهذا ما يجعله قابلاً للفحص وللتنفيذ مرّتين
 * (واجهة وخادم) بنفس الجواب.
 */
export function computePayslip(inputs: LineInput[], base: number, policy: PayrollPolicy): Computation {
  const dr = dayRate(base, policy);

  const resolved: ComputedLine[] = [];
  for (const li of inputs) {
    const el = elementOf(li.code);
    if (!el) continue;                       // بندٌ مجهول لا يدخل الحساب بصمت
    const qty = num(li.qty);
    // البنود المقاسة بالأيام تشتقّ سعرها من أجر اليوم إن لم يُصرَّح به.
    const rate = li.rate != null ? num(li.rate)
      : (qty != null && DAY_BASED.has(li.code) ? dr : null);
    // التقريب يمسّ **المشتقّ وحده**. مبلغٌ كتبه المالك بيده يبقى كما كتبه:
    // أن يكتب ٦٠١٬١١١ فيصير ٦٠١٬٠٠٠ بلا ما يطلب هو تغييرٌ صامت لقراره.
    // والمشتقّ (يومان × أجر يوم ٢٣٬٠٧٧) يُقرَّب ليصير قابلاً للدفع نقداً.
    const explicit = li.amount != null;
    const raw = explicit ? Math.abs(num(li.amount) ?? 0)
      : (qty != null && rate != null ? Math.abs(qty * rate) : 0);
    const amount = explicit ? Math.max(0, Math.round(raw)) : roundMoney(raw, policy);
    if (amount <= 0) continue;               // سطر بصفر لا يُعرض ولا يُخزَّن
    resolved.push({
      code: el.code, kind: el.kind, qty, rate,
      amount, deferred: 0,
      reason: (li.reason ?? "").trim() || null,
      ref_kind: li.ref_kind ?? null, ref_id: li.ref_id ?? null,
    });
  }

  const gross = sum(resolved.filter((l) => l.kind === "earning").map((l) => l.amount));

  const deds = resolved.filter((l) => l.kind === "deduction");
  const exempt = deds.filter((l) => elementOf(l.code)!.capExempt);
  const capped = deds.filter((l) => !elementOf(l.code)!.capExempt);

  const exemptDeductions = sum(exempt.map((l) => l.amount));
  // السقف يجري على ما استُحقّ فعلاً: الإجمالي ناقص ما لم يُستحقّ وما خرج سلفاً.
  const capBase = Math.max(0, gross - exemptDeductions);
  const cap = roundMoney((capBase * policy.deductionCapPct) / 100, policy);

  const cappedRequested = sum(capped.map((l) => l.amount));
  let room = cap;
  // الخصم بترتيب الأولوية، والترحيل يبدأ من أدنى أولوية — فالجزاء التقديري
  // يُرحَّل قبل قسط السلفة، لا العكس.
  for (const l of [...capped].sort((a, b) => prio(a.code) - prio(b.code))) {
    const take = Math.min(l.amount, Math.max(0, room));
    l.deferred = l.amount - take;
    l.amount = take;
    room -= take;
  }

  const cappedApplied = sum(capped.map((l) => l.amount));
  const deferred = sum(capped.map((l) => l.deferred));
  const deductions = exemptDeductions + cappedApplied;

  return {
    gross, exemptDeductions, capBase, cap,
    cappedRequested, cappedApplied, deferred, deductions,
    net: Math.max(0, gross - deductions),
    // السطور المطبَّقة وحدها؛ سطرٌ رُحِّل كلّه يبقى ظاهراً بمبلغ صفر ومرحَّلٍ
    // كامل حتى يعرف الموظف أنه لم يُنسَ.
    lines: resolved.filter((l) => l.amount > 0 || l.deferred > 0),
    dayRate: dr,
  };
}

/** البنود التي تُقاس بالأيام فيُشتقّ سعرها من أجر اليوم تلقائياً. */
const DAY_BASED = new Set(["ABS", "UNPAID"]);

const prio = (code: string): number => {
  const i = (DEDUCTION_PRIORITY as readonly string[]).indexOf(code);
  return i < 0 ? DEDUCTION_PRIORITY.length : i;
};
const num = (v: unknown): number | null => {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const sum = (xs: number[]): number => xs.reduce((a, b) => a + b, 0);

/* ── ٥ب) تركيب قسيمة الشهر ───────────────────────────────────────────────── */

export interface DraftInput {
  staff: { id: string; name: string; branch_id?: string | null };
  /** الأجر الأساسي الساري بآخر الفترة — من compAt، لا من «راتبه اليوم». */
  base: number;
  /** بدلات واستقطاعات ثابتة تتكرّر بلا إعادة إدخال. */
  recurring: Array<{ code: string; amount: number; note?: string | null }>;
  /** السلف الفعّالة — كلٌّ تولّد سطر قسطٍ يحمل معرّفها. */
  loans: LoanRow[];
  /** ما أضافه المدير لهذا الشهر بعينه (غياب، جزاء، مكافأة…). */
  manual: LineInput[];
}

export interface BuiltSlip {
  staff_id: string;
  staff_name: string;
  branch_id: string | null;
  base_amount: number;
  computation: Computation;
  lines: Array<Omit<ComputedLine, "kind"> & { kind: ElementKind }>;
}

/**
 * تركيب قسيمة موظّف واحد. الترتيب مقصود: الأساسي، ثم الثابت، ثم اليدوي، ثم
 * أقساط السلف **آخراً** — لأنها الوحيدة التي تحمل مرجعاً إلزامياً، وتأخيرها
 * يجعل تعقّبها بالسطور أوضح.
 */
export function buildSlip(inp: DraftInput, policy: PayrollPolicy): BuiltSlip {
  const lines: LineInput[] = [{ code: "BASIC", amount: inp.base }];
  for (const r of inp.recurring) {
    if (!elementOf(r.code)) continue;
    lines.push({ code: r.code, amount: r.amount, reason: r.note ?? null });
  }
  lines.push(...inp.manual);
  for (const l of inp.loans) {
    const due = dueInstallment(l);
    if (due > 0) lines.push({ code: "LOAN", amount: due, ref_kind: "loan", ref_id: l.id });
  }
  const c = computePayslip(lines, inp.base, policy);
  return {
    staff_id: inp.staff.id,
    staff_name: inp.staff.name,
    branch_id: inp.staff.branch_id ?? null,
    base_amount: inp.base,
    computation: c,
    lines: c.lines,
  };
}

/* ── ٦) الفترة ───────────────────────────────────────────────────────────── */

/** مفتاح الفترة: أول يوم بالشهر (YYYY-MM-01) — الشهر الميلادي هو الفترة. */
export const periodKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;

/** آخر يوم بالفترة — تاريخُ استحقاق الأجر، وبه يُقرأ هيكل الأجر الساري. */
export function periodEnd(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(y, m, 0).toISOString().slice(0, 10);
}

/** الفترة السابقة — لعرض «مرحَّل من الشهر الماضي». */
export function prevPeriod(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return periodKey(new Date(y, m - 2, 1));
}

/** عنوان الفترة كما يُعرَض: «٢٠٢٦-٠٨». */
export const periodLabel = (period: string): string => period.slice(0, 7);

/* ── ٧) حالات الدورة ─────────────────────────────────────────────────────── */

export type RunStatus = "draft" | "calculated" | "approved" | "paid" | "closed";

/** بعد الاعتماد تُجمَّد القسائم: لا تعديل ولا حذف ولا إعادة حساب. */
export const isFrozen = (s: RunStatus): boolean => s !== "draft" && s !== "calculated";
/** الترتيب يمنع القفز للخلف — الرجوع من معتمدة إلى مسوّدة ممنوع بالبناء. */
export const RUN_ORDER: RunStatus[] = ["draft", "calculated", "approved", "paid", "closed"];
export const canAdvance = (from: RunStatus, to: RunStatus): boolean =>
  RUN_ORDER.indexOf(to) === RUN_ORDER.indexOf(from) + 1;
