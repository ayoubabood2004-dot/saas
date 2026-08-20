import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Wallet, Users, HandCoins, Plus, Trash2, Printer, Check, Lock,
  CircleDollarSign, TriangleAlert, ChevronDown, RotateCcw, Banknote, SlidersHorizontal,
} from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { repo } from "@/lib/repo";
import { listStaff, ROLE_LABEL, type StaffMember } from "@/lib/staff";
import { cn, money, currencySymbol, formatNum } from "@/lib/utils";
import { getClinicName, getClinicLogo, getCurrencyCode } from "@/lib/settings";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { Button, Dialog, EmptyState, PageHeader, Segmented, useToast } from "@/components/ui";
import { openPayslip, payslipNo } from "@/lib/payslipPrint";
import {
  PAY_ELEMENTS, elementOf, compAt, buildSlip, remainingAfter,
  normalizePolicy, periodKey, periodEnd, periodLabel, isFrozen,
  type LineInput, type PayrollPolicy, type LoanRow,
} from "@/lib/payroll";
import type {
  StaffComp, StaffRecurring, PayrollRun, Payslip, PayslipLine, StaffLoan, PayslipDraft, PayMethod,
} from "@/types";

/* ============================================================================
 * رواتب الكادر — المرحلة الأولى.
 *
 * ثلاث تبويبات تتبع تسلسل العمل الحقيقي لا تصنيف البيانات: من يقبض وكم
 * (الكادر)، ثم شهر هذا الشهر (الدورة)، ثم ما برقبة الموظفين (السلف).
 *
 * والصفحة **لا تحسب شيئاً بنفسها**: كل رقم يخرج من src/lib/payroll.ts، وكل
 * كتابة تمرّ من repo إلى دالة خادم تتحقّق من الثوابت ثانيةً. فما تراه هنا عرضٌ
 * وتجميعُ مدخلات لا أكثر — وهذا مقصود: منطقٌ يسكن الواجهة منطقٌ يُتجاوَز.
 * ==========================================================================*/

type Tab = "staff" | "run" | "loans";

export function Payroll() {
  const { t } = useTranslation();
  const { can } = usePermissions();
  const [tab, setTab] = useState<Tab>("run");
  const [policyOpen, setPolicyOpen] = useState(false);
  const allowed = can("viewPayroll");

  if (!allowed) {
    return (
      <div className="mx-auto max-w-md px-4 py-16">
        <EmptyState
          icon={<Lock size={28} />}
          title={t("payroll.denied", "رواتب الكادر مقفلة")}
          description={t("payroll.deniedHint", "هذي الصفحة لمدير العيادة. راتبك أنت يوصلك بقسيمتك.")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <PageHeader
        icon={<Wallet size={20} />}
        title={t("payroll.title", "رواتب الكادر")}
        subtitle={t("payroll.subtitle", "الرواتب والسلف والقطوعات بأسبابها — وكل قسيمة تشرح نفسها.")}
        actions={
          <Button size="sm" variant="ghost" leftIcon={<SlidersHorizontal size={15} />} data-paypolicy
            onClick={() => { playTap(); setPolicyOpen(true); }}>
            {t("payroll.policyTitle", "سياسة الرواتب")}
          </Button>
        }
      />

      {policyOpen && <PolicyDialog onClose={() => setPolicyOpen(false)} />}

      <div className="mb-5 mt-4 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Segmented<Tab>
          layoutId="payroll-tabs"
          value={tab}
          onChange={(v) => { playTap(); setTab(v); }}
          options={[
            { value: "run", label: t("payroll.tabRun", "دورة الشهر"), icon: <CircleDollarSign size={15} /> },
            { value: "staff", label: t("payroll.tabStaff", "الكادر ورواتبهم"), icon: <Users size={15} /> },
            { value: "loans", label: t("payroll.tabLoans", "السلف"), icon: <HandCoins size={15} /> },
          ]}
        />
      </div>

      {tab === "staff" && <StaffPayTab />}
      {tab === "run" && <RunTab />}
      {tab === "loans" && <LoansTab />}
    </div>
  );
}

/* ── سياسة الرواتب ───────────────────────────────────────────────────────── */
/* تسكن هنا لا بصفحة الإعدادات عمداً: هي مقروءة فقط داخل هذه الشاشة، وإقحامها
 * بالإعدادات يعيد تكديس صفحةٍ رتّبناها لتوّها. الإعداد يسكن حيث يُستعمل. */
function PolicyDialog({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [p, setP] = useState<PayrollPolicy>(() => normalizePolicy(null));
  const [busy, setBusy] = useState(false);

  useEffect(() => { void repo.getPayrollPolicy().then((x) => setP(normalizePolicy(x))).catch(() => { /* الافتراضات تكفي */ }); }, []);

  const save = async () => {
    setBusy(true);
    try {
      const saved = await repo.setPayrollPolicy(normalizePolicy(p));
      setP(normalizePolicy(saved));
      playSuccess();
      toast.success(t("payroll.policySaved", "انحفظت السياسة"));
      onClose();
    } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={t("payroll.policyTitle", "سياسة الرواتب")}>
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">
          {t("payroll.policyHint", "تُطبَّق على كل دورة جديدة، وتُطبع على القسيمة حتى يعرف الموظف كيف انحسب قطعه.")}
        </p>

        <div>
          <label className="label">{t("payroll.dayBasis", "أساس أجر اليوم")}</label>
          <Segmented<"calendar_30" | "working_days">
            layoutId="payroll-basis" value={p.dayRateBasis}
            onChange={(v) => setP((x) => ({ ...x, dayRateBasis: v }))}
            options={[
              { value: "calendar_30", label: t("payroll.basis30", "الأساسي ÷ ٣٠ يوم") },
              { value: "working_days", label: t("payroll.basisWork", "الأساسي ÷ أيام العمل") },
            ]}
          />
        </div>

        {p.dayRateBasis === "working_days" && (
          <div>
            <label className="label">{t("payroll.workingDays", "أيام العمل بالشهر")}</label>
            <input className="input w-28" inputMode="numeric" data-paypolwd value={String(p.workingDays)}
              onChange={(e) => setP((x) => ({ ...x, workingDays: Number(e.target.value.replace(/\D/g, "")) || 1 }))} />
          </div>
        )}

        <div>
          <label className="label">{t("payroll.capPct", "سقف الاستقطاع من الأجر المستحقّ (٪)")}</label>
          <input className="input w-28" inputMode="numeric" data-paypolcap value={String(p.deductionCapPct)}
            onChange={(e) => setP((x) => ({ ...x, deductionCapPct: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) }))} />
          <p className="mt-1.5 text-xs text-ink-subtle">
            {t("payroll.capHint", "الزائد عن السقف يُرحَّل للشهر الجاي بدل ما ينزل صافي الموظف إلى صفر. ٥٠ نقطة بداية — ثبّتها من محاسب.")}
          </p>
        </div>

        <div>
          <label className="label">{t("payroll.roundTo", "تقريب المبالغ المشتقّة لأقرب")}</label>
          <input className="input w-28" inputMode="numeric" data-paypolround value={String(p.roundTo)}
            onChange={(e) => setP((x) => ({ ...x, roundTo: Number(e.target.value.replace(/\D/g, "")) || 1 }))} />
          <p className="mt-1.5 text-xs text-ink-subtle">
            {t("payroll.roundHint", "يمسّ المشتقّ وحده (أجر اليوم مثلاً). المبلغ الي تكتبه بيدك يبقى كما كتبته.")}
          </p>
        </div>

        <Button className="w-full" disabled={busy} onClick={save} data-paypolsave>
          {t("common.save", "حفظ")}
        </Button>
      </div>
    </Dialog>
  );
}

/* ── مشترك ────────────────────────────────────────────────────────────────── */

/** الكادر + هيكل الأجر + الثابت + السلف: كل ما تحتاجه التبويبات الثلاث. */
function usePayrollData() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [comp, setComp] = useState<StaffComp[]>([]);
  const [recurring, setRecurring] = useState<StaffRecurring[]>([]);
  const [loans, setLoans] = useState<StaffLoan[]>([]);
  const [policy, setPolicy] = useState<PayrollPolicy>(() => normalizePolicy(null));
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [s, c, r, l, p] = await Promise.all([
      listStaff().catch(() => [] as StaffMember[]),
      repo.listStaffComp().catch(() => [] as StaffComp[]),
      repo.listStaffRecurring().catch(() => [] as StaffRecurring[]),
      repo.listStaffLoans().catch(() => [] as StaffLoan[]),
      repo.getPayrollPolicy().catch(() => null),
    ]);
    setStaff(s.filter((x) => x.status !== "suspended"));
    setComp(c); setRecurring(r); setLoans(l);
    setPolicy(normalizePolicy(p));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { staff, comp, recurring, loans, policy, loading, reload };
}

const nameOf = (staff: StaffMember[], id: string) => staff.find((s) => s.id === id)?.name ?? "—";

/** عنوان البند مترجَماً — واحتياطه عربية الكتالوج حتى لا يظهر رمزٌ خام أبداً. */
function useElLabel() {
  const { t } = useTranslation();
  return (code: string) => t(`payroll.el.${code}`, code);
}

/* ── هيئة الكشف ───────────────────────────────────────────────────────────
 * بيانات الرواتب تُقرأ بالمسح العمودي لا بالقراءة بطاقةً بطاقة: «منو أعلى
 * قطع؟» و«شكد مجموع الصوافي؟» سؤالان يجيب عنهما عمودٌ مصطفّ بلحظة، وتضيع
 * إجابتهما بين بطاقات. فالشكل هنا ورقة حسابات: خطوطٌ كاملة، وصفوف مخطّطة،
 * وأرقام بخانات ثابتة تصطفّ فوق بعضها.
 *
 * وثلاثة تفاصيل تجعلها تعمل على آيباد لا على شاشة عريضة فقط: الرأس لاصقٌ
 * عمودياً، وعمود الاسم لاصقٌ أفقياً (فلا يضيع صاحب الرقم عند التمرير)،
 * وسطر المجاميع لاصقٌ بالأسفل — وهو ما يقابل «صفّ المجموع» بالإكسل. */
const TH = "sticky top-0 z-20 border border-line/70 bg-surface-2 px-3 py-2 text-2xs font-bold tracking-wide text-ink-muted whitespace-nowrap";
const TD = "border border-line/60 px-3 py-2 align-middle";
const NUM = "text-end tabular-nums whitespace-nowrap";
/** خلفية صريحة لكل صفّ: بدونها يصير العمود اللاصق شفّافاً فوق ما يمرّ تحته. */
const TR = "bg-surface-1 even:bg-surface-2/40 hover:bg-brand-50/40 dark:hover:bg-brand-500/10";
const STICKY = "sticky start-0 z-10 bg-inherit";
const TF = "sticky bottom-0 z-20 border border-line/70 bg-surface-2 px-3 py-2 font-bold";

function Sheet({ minW, hook, children }: { minW: number; hook?: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden p-0" data-sheet={hook}>
      <div className="max-h-[66vh] overflow-auto">
        <table className="w-full border-collapse text-sm" style={{ minWidth: minW }}>{children}</table>
      </div>
    </div>
  );
}

/** حقل مبلغ: أرقام فقط، بلا أسهم، وبلوحة رقمية على الهاتف. */
function AmountInput({ value, onChange, placeholder, hook }: {
  value: string; onChange: (v: string) => void; placeholder?: string; hook?: string;
}) {
  return (
    <input
      className="input"
      inputMode="numeric"
      data-amount={hook}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
    />
  );
}

/* ── ١) الكادر ورواتبهم ──────────────────────────────────────────────────── */

function StaffPayTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { staff, comp, recurring, loans, policy, loading, reload } = usePayrollData();
  const elLabel = useElLabel();
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const today = new Date().toISOString().slice(0, 10);

  const rowsFor = useCallback((id: string) => comp.filter((c) => c.staff_id === id), [comp]);

  if (loading) return <p className="text-sm text-ink-muted">{t("common.loading", "…جاري التحميل")}</p>;
  if (!staff.length) {
    return <EmptyState icon={<Users size={26} />} title={t("payroll.noStaff", "ما عندك كادر بعد")}
      description={t("payroll.noStaffHint", "أضف موظفيك من «إدارة الكادر» أول، وبعدها ثبّت رواتبهم من هنا.")} />;
  }

  const totalBase = staff.reduce((sum, s) => sum + (compAt(rowsFor(s.id), today)?.base_amount ?? 0), 0);

  return (
    <div data-paystaff>
      <Sheet minW={820} hook="staff">
        <thead>
          <tr>
            <th className={cn(TH, "z-30 text-start")}>{t("payroll.employee", "الموظف")}</th>
            <th className={cn(TH, "text-start")}>{t("payroll.role", "الدور")}</th>
            <th className={cn(TH, "text-end")}>{t("payroll.baseShort", "الأجر الأساسي")}</th>
            <th className={cn(TH, "text-start")}>{t("payroll.since", "ساري من")}</th>
            <th className={cn(TH, "text-start")}>{t("payroll.fixedCol", "بدلات ثابتة")}</th>
            <th className={cn(TH, "text-end")}>{t("payroll.loanCol", "سلفة قائمة")}</th>
            <th className={cn(TH, "w-px")}></th>
          </tr>
        </thead>
        <tbody>
          {staff.map((s) => {
            const cur = compAt(rowsFor(s.id), today);
            const fixed = recurring.filter((r) => r.staff_id === s.id);
            const loan = loans.find((l) => l.staff_id === s.id && l.status === "active");
            return (
              <tr key={s.id} className={TR} data-payrow={s.id}>
                <td className={cn(TD, STICKY, "font-semibold text-ink")}>{s.name}</td>
                <td className={cn(TD, "text-ink-muted")}>{ROLE_LABEL[s.role]}</td>
                <td className={cn(TD, NUM, "font-bold")} data-paybase={s.id}>
                  {cur ? money(cur.base_amount)
                    : <span className="text-xs font-semibold text-warn-600 dark:text-warn-400">{t("payroll.noSalary", "بلا راتب مثبَّت")}</span>}
                </td>
                <td className={cn(TD, "text-2xs text-ink-subtle")}>
                  {cur ? cur.effective_from : t("payroll.setFirst", "ثبّته حتى يدخل الدورة")}
                </td>
                <td className={TD}>
                  {fixed.length === 0 ? <span className="text-ink-subtle">—</span> : (
                    <div className="flex flex-wrap gap-1">
                      {fixed.map((r) => (
                        <span key={r.id} className="chip bg-surface-2 text-2xs text-ink-muted">
                          {elLabel(r.code)} · {money(r.amount)}
                          <button aria-label={t("common.delete", "حذف")} onClick={async () => {
                            await repo.deleteStaffRecurring(r.id); playTap(); await reload();
                          }}><Trash2 size={12} /></button>
                        </span>
                      ))}
                    </div>
                  )}
                </td>
                <td className={cn(TD, NUM, loan ? "text-warn-700 dark:text-warn-300" : "text-ink-subtle")}>
                  {loan ? money(loan.remaining) : "—"}
                </td>
                <td className={cn(TD, "p-1")}>
                  <Button size="sm" variant="secondary" data-payedit={s.id} onClick={() => { playTap(); setEditing(s); }}>
                    {t("payroll.setSalary", "الراتب")}
                  </Button>
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <td className={cn(TF, STICKY, "z-30 text-start")}>{t("payroll.total", "المجموع")}</td>
            <td className={TF}></td>
            <td className={cn(TF, NUM)}>{money(totalBase)}</td>
            <td className={TF} colSpan={4}></td>
          </tr>
        </tfoot>
      </Sheet>

      {editing && (
        <SalaryDialog
          member={editing}
          history={rowsFor(editing.id)}
          fixed={recurring.filter((r) => r.staff_id === editing.id)}
          policy={policy}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => { toast.success(msg); await reload(); }}
        />
      )}
    </div>
  );
}

function SalaryDialog({ member, history, fixed, policy, onClose, onSaved }: {
  member: StaffMember;
  history: StaffComp[];
  fixed: StaffRecurring[];
  policy: PayrollPolicy;
  onClose: () => void;
  onSaved: (msg: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [base, setBase] = useState("");
  const [from, setFrom] = useState(() => periodKey(new Date()));
  const [busy, setBusy] = useState(false);
  const elLabel = useElLabel();
  const [addCode, setAddCode] = useState("ALLOW");
  const [addAmt, setAddAmt] = useState("");

  const sorted = useMemo(() => history.slice().sort((a, b) => b.effective_from.localeCompare(a.effective_from)), [history]);

  const save = async () => {
    const n = Number(base);
    if (!Number.isFinite(n) || n < 0) { playWarning(); toast.error(t("payroll.badAmount", "المبلغ غير صحيح")); return; }
    setBusy(true);
    try {
      await repo.setStaffComp(member.id, from, n, null);
      playSuccess();
      await onSaved(t("payroll.salarySaved", "انثبّت الراتب"));
      setBase("");
    } catch (e) {
      playWarning(); toast.error(String((e as Error).message ?? e));
    } finally { setBusy(false); }
  };

  const addFixed = async () => {
    const n = Number(addAmt);
    if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("payroll.badAmount", "المبلغ غير صحيح")); return; }
    try {
      await repo.addStaffRecurring(member.id, addCode, n, null);
      playSuccess(); setAddAmt("");
      await onSaved(t("payroll.fixedAdded", "انضاف البند الثابت"));
    } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
  };

  return (
    <Dialog open onClose={onClose} title={member.name}>
      <div className="space-y-4">
        <div>
          <label className="label">{t("payroll.baseAmount", "الأجر الأساسي الشهري")}</label>
          <div className="flex gap-2">
            <AmountInput value={base} onChange={setBase} placeholder={currencySymbol()} hook="base" />
            <input type="date" className="input w-44" value={from} onChange={(e) => setFrom(e.target.value)} data-payfrom />
          </div>
          <p className="mt-1.5 text-xs text-ink-subtle">
            {t("payroll.datedHint", "الزيادة صفٌّ جديد بتاريخه — القسائم القديمة تبقى على راتبها وقتها. ما ينكتب فوق القديم أبداً.")}
          </p>
        </div>
        <Button className="w-full" disabled={busy} data-paysave onClick={save}>
          {t("payroll.saveSalary", "ثبّت الراتب")}
        </Button>

        {sorted.length > 0 && (
          <div className="rounded-2xl border border-line bg-surface-2 p-3">
            <p className="mb-2 text-xs font-bold text-ink-muted">{t("payroll.history", "تاريخ الرواتب")}</p>
            <div className="space-y-1">
              {sorted.map((c) => (
                <div key={c.id} className="flex items-center justify-between text-sm">
                  <span className="text-ink-muted">{c.effective_from}</span>
                  <span className="font-semibold tabular-nums text-ink">{money(c.base_amount)}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="border-t border-line pt-4">
          <label className="label">{t("payroll.fixedItems", "بدل أو استقطاع ثابت كل شهر")}</label>
          <div className="flex gap-2">
            <select className="input w-40" value={addCode} onChange={(e) => setAddCode(e.target.value)} data-payfixcode>
              {PAY_ELEMENTS.filter((e) => !e.auto && !["ABS", "UNPAID", "BONUS", "RETRO", "PEN", "SHORT", "DMG"].includes(e.code))
                .map((e) => <option key={e.code} value={e.code}>{elLabel(e.code)}</option>)}
            </select>
            <AmountInput value={addAmt} onChange={setAddAmt} placeholder={currencySymbol()} hook="fixed" />
            <Button variant="secondary" leftIcon={<Plus size={15} />} onClick={addFixed} data-payfixadd>
              {t("common.add", "إضافة")}
            </Button>
          </div>
          {fixed.length > 0 && (
            <p className="mt-2 text-xs text-ink-subtle">
              {t("payroll.fixedCount", "{{n}} بند ثابت — يدخل كل دورة تلقائياً", { n: fixed.length })}
            </p>
          )}
          <p className="mt-2 text-2xs text-ink-subtle">
            {t("payroll.dayRateNote", "أجر اليوم بهذه العيادة = الأساسي ÷ {{d}}", {
              d: formatNum(policy.dayRateBasis === "calendar_30" ? 30 : policy.workingDays),
            })}
          </p>
        </div>
      </div>
    </Dialog>
  );
}

/* ── ٢) دورة الشهر ───────────────────────────────────────────────────────── */

const STATUS_TONE: Record<string, string> = {
  draft: "bg-surface-2 text-ink-muted",
  calculated: "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300",
  approved: "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300",
  paid: "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
  closed: "bg-surface-2 text-ink-subtle",
};

function RunTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { staff, comp, recurring, loans, policy, loading, reload } = usePayrollData();

  const elLabel = useElLabel();
  const [period, setPeriod] = useState(() => periodKey(new Date()));
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [lines, setLines] = useState<PayslipLine[]>([]);
  const [manual, setManual] = useState<Record<string, LineInput[]>>({});
  const [busy, setBusy] = useState(false);
  const [addFor, setAddFor] = useState<StaffMember | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const run = useMemo(() => runs.find((r) => r.period === period) ?? null, [runs, period]);
  const frozen = run ? isFrozen(run.status) : false;

  const loadRun = useCallback(async () => {
    const rs = await repo.listPayrollRuns().catch(() => [] as PayrollRun[]);
    setRuns(rs);
    const r = rs.find((x) => x.period === period);
    if (!r) { setSlips([]); setLines([]); return; }
    const ps = await repo.listPayslips(r.id).catch(() => [] as Payslip[]);
    setSlips(ps);
    setLines(await repo.listPayslipLines(ps.map((p) => p.id)).catch(() => [] as PayslipLine[]));
  }, [period]);

  useEffect(() => { void loadRun(); }, [loadRun]);

  /** من يدخل الدورة: كل موظف له أجرٌ ساري بآخر الفترة. بلا أجرٍ لا راتب. */
  const eligible = useMemo(() => {
    const end = periodEnd(period);
    return staff
      .map((s) => ({ s, c: compAt(comp.filter((x) => x.staff_id === s.id), end) }))
      .filter((x) => x.c != null) as { s: StaffMember; c: StaffComp }[];
  }, [staff, comp, period]);

  /** المعاينة الحيّة قبل الحفظ — نفس الدوال التي سيحفظها الخادم بالضبط. */
  const preview = useMemo(() => eligible.map(({ s, c }) => buildSlip({
    staff: { id: s.id, name: s.name },
    base: c.base_amount,
    recurring: recurring.filter((r) => r.staff_id === s.id).map((r) => ({ code: r.code, amount: r.amount, note: r.note })),
    loans: loans.filter((l) => l.staff_id === s.id && l.status === "active") as LoanRow[],
    manual: manual[s.id] ?? [],
  }, policy)), [eligible, recurring, loans, manual, policy]);

  const calculate = async () => {
    if (!eligible.length) { playWarning(); toast.error(t("payroll.noEligible", "ما أكو موظف براتب مثبَّت لهذا الشهر")); return; }
    setBusy(true);
    try {
      const r = run ?? await repo.openPayrollRun(period);
      const drafts: PayslipDraft[] = preview.map((p) => ({
        staff_id: p.staff_id, staff_name: p.staff_name, branch_id: p.branch_id,
        base_amount: p.base_amount,
        lines: p.lines.map((l) => ({
          code: l.code, kind: l.kind, qty: l.qty, rate: l.rate,
          amount: l.amount, deferred: l.deferred, reason: l.reason,
          ref_kind: l.ref_kind, ref_id: l.ref_id,
        })),
      }));
      await repo.savePayrollSlips(r.id, drafts);
      playSuccess();
      toast.success(t("payroll.calculated", "انحسبت الدورة — راجعها قبل الاعتماد"));
      await loadRun();
    } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const approve = async () => {
    if (!run) return;
    setBusy(true);
    try {
      await repo.approvePayrollRun(run.id);
      playSuccess();
      toast.success(t("payroll.approved", "انعتمدت — القسائم انجمّدت وأقساط السلف انخصمت"));
      await Promise.all([loadRun(), reload()]);
    } catch (e) {
      playWarning();
      const m = String((e as Error).message ?? e);
      toast.error(m.includes("self approval")
        ? t("payroll.noSelfApprove", "ما تكدر تعتمد دورة فيها راتبك — خلّي مدير ثاني يعتمدها")
        : m);
    } finally { setBusy(false); }
  };

  const pay = async (slip: Payslip, method: PayMethod) => {
    setBusy(true);
    try {
      await repo.payPayslip(slip.id, method);
      playSuccess();
      toast.success(t("payroll.paid", "انسجّل الدفع وانرحّل للمصروفات"));
      await loadRun();
    } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  const close = async () => {
    if (!run) return;
    try { await repo.closePayrollRun(run.id); playSuccess(); await loadRun(); }
    catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
  };

  const printSlip = (slip: Payslip) => {
    const ok = openPayslip(slip, lines.filter((l) => l.payslip_id === slip.id), {
      clinicName: getClinicName() || "doctorVet",
      logoUrl: getClinicLogo(),
      currency: getCurrencyCode(),
      period: periodLabel(period),
      policy: run?.policy ?? policy,
      slipNo: payslipNo(slip, period),
    });
    if (!ok) { playWarning(); toast.error(t("payroll.popupBlocked", "المتصفّح حجب نافذة الطباعة")); }
  };

  const shown = slips.length ? slips : [];
  const totals = useMemo(() => {
    const src = shown.length ? shown.map((s) => ({ gross: s.gross, deductions: s.deductions, net: s.net }))
      : preview.map((p) => ({ gross: p.computation.gross, deductions: p.computation.deductions, net: p.computation.net }));
    return src.reduce((a, x) => ({ gross: a.gross + x.gross, deductions: a.deductions + x.deductions, net: a.net + x.net }),
      { gross: 0, deductions: 0, net: 0 });
  }, [shown, preview]);

  if (loading) return <p className="text-sm text-ink-muted">{t("common.loading", "…جاري التحميل")}</p>;

  return (
    <div data-payrun>
      {/* شريط الفترة والحالة */}
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <input
          type="month" className="input w-44" data-payperiod
          value={period.slice(0, 7)}
          onChange={(e) => setPeriod(e.target.value ? `${e.target.value}-01` : period)}
        />
        <span className={cn("chip", STATUS_TONE[run?.status ?? "draft"])} data-payrunstatus={run?.status ?? "none"}>
          {run ? t(`payroll.st_${run.status}`) : t("payroll.notOpened", "ما انفتحت بعد")}
        </span>
        <div className="ms-auto flex flex-wrap gap-2">
          {!frozen && (
            <Button size="sm" disabled={busy} leftIcon={<RotateCcw size={15} />} onClick={calculate} data-paycalc>
              {run ? t("payroll.recalc", "إعادة الحساب") : t("payroll.calc", "احسب الدورة")}
            </Button>
          )}
          {run?.status === "calculated" && (
            <Button size="sm" disabled={busy} leftIcon={<Check size={15} />} onClick={approve} data-payapprove>
              {t("payroll.approve", "اعتماد")}
            </Button>
          )}
          {run?.status === "paid" && (
            <Button size="sm" variant="secondary" leftIcon={<Lock size={15} />} onClick={close} data-payclose>
              {t("payroll.close", "إقفال الفترة")}
            </Button>
          )}
        </div>
      </div>

      {frozen && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl border border-line bg-surface-2 p-3 text-xs text-ink-muted">
          <Lock size={14} className="mt-0.5 shrink-0" />
          {t("payroll.frozenHint", "الدورة معتمدة فالقسائم مجمّدة: ما تتعدّل ولا تُحذف. أي تصحيح يصير بسطر تسوية بدورة الشهر الجاي.")}
        </p>
      )}

      {!eligible.length ? (
        <EmptyState icon={<TriangleAlert size={26} />}
          title={t("payroll.noEligible", "ما أكو موظف براتب مثبَّت لهذا الشهر")}
          description={t("payroll.noEligibleHint", "روح لتبويب «الكادر ورواتبهم» وثبّت الأجر الأساسي — بلا أجرٍ ساري ما يدخل الموظف الدورة.")} />
      ) : (
        <Sheet minW={900} hook="run">
          <thead>
            <tr>
              <th className={cn(TH, "z-30 text-start")}>{t("payroll.employee", "الموظف")}</th>
              <th className={cn(TH, "text-end")}>{t("payroll.baseShort", "الأجر الأساسي")}</th>
              <th className={cn(TH, "text-end")}>{t("payroll.gross", "إجمالي الأجور")}</th>
              <th className={cn(TH, "text-end")}>{t("payroll.deductions", "القطوعات")}</th>
              <th className={cn(TH, "text-end")}>{t("payroll.deferredShort", "مرحَّل")}</th>
              <th className={cn(TH, "text-end")}>{t("payroll.net", "الصافي")}</th>
              <th className={cn(TH, "text-start")}>{t("payroll.payState", "الدفع")}</th>
              <th className={cn(TH, "w-px")}></th>
            </tr>
          </thead>
          <tbody>
            {(shown.length ? shown : preview).map((row) => {
              const isSaved = "id" in row;
              const slip = isSaved ? (row as Payslip) : null;
              const pv = isSaved ? null : (row as (typeof preview)[number]);
              const sid = slip?.staff_id ?? pv!.staff_id;
              const name = slip?.staff_name ?? pv!.staff_name;
              const base = slip?.base_amount ?? pv!.base_amount;
              const gross = slip?.gross ?? pv!.computation.gross;
              const ded = slip?.deductions ?? pv!.computation.deductions;
              const net = slip?.net ?? pv!.computation.net;
              const defer = slip?.deferred ?? pv!.computation.deferred;
              const myLines = slip ? lines.filter((l) => l.payslip_id === slip.id) : pv!.lines;
              const expanded = open === sid;
              const pending = (manual[sid]?.length ?? 0) > 0;

              return [
                <tr key={sid} className={cn(TR, "cursor-pointer")} data-payslip={sid} data-paytoggle={sid}
                  onClick={() => { playTap(); setOpen(expanded ? null : sid); }}>
                  <td className={cn(TD, STICKY, "font-semibold text-ink")}>
                    <span className="flex items-center gap-1.5">
                      <ChevronDown size={13} className={cn("shrink-0 text-ink-subtle transition", expanded && "rotate-180")} />
                      {name}
                      {pending && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn-500" title={t("payroll.recalcNeeded", "اضغط «إعادة الحساب» حتى تنحفظ")} />}
                    </span>
                  </td>
                  <td className={cn(TD, NUM, "text-ink-muted")}>{money(base)}</td>
                  <td className={cn(TD, NUM)}>{money(gross)}</td>
                  <td className={cn(TD, NUM, ded > 0 && "text-danger-600 dark:text-danger-400")}>
                    {ded > 0 ? `−${money(ded)}` : "—"}
                  </td>
                  <td className={cn(TD, NUM, defer > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink-subtle")}>
                    {defer > 0 ? money(defer) : "—"}
                  </td>
                  <td className={cn(TD, NUM, "font-bold text-ink")} data-paynet={sid}>{money(net)}</td>
                  <td className={cn(TD, "text-2xs")}>
                    {slip?.paid_at ? (
                      <span className="chip bg-emerald-50 text-2xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <Check size={12} />{t("payroll.wasPaid", "مدفوع")}
                      </span>
                    ) : <span className="text-ink-subtle">—</span>}
                  </td>
                  <td className={cn(TD, "p-1")}>
                    {slip && (
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                        aria-label={t("payroll.print", "القسيمة")} data-payprint={sid}
                        onClick={(e) => { e.stopPropagation(); printSlip(slip); }}>
                        <Printer size={15} />
                      </button>
                    )}
                  </td>
                </tr>,

                expanded ? (
                  <tr key={`${sid}-d`} className="bg-surface-2/70" data-paydetail={sid}>
                    <td className={cn(TD, "p-0")} colSpan={8}>
                      <div className="p-3">
                        {/* كشفٌ داخل كشف: سطور القسيمة بنفس الشبكة */}
                        <table className="w-full border-collapse text-2xs">
                          <thead>
                            <tr>
                              <th className={cn(TH, "static text-start")}>{t("payroll.element", "البند")}</th>
                              <th className={cn(TH, "static text-start")}>{t("payroll.explain", "كيف انحسب / ليش")}</th>
                              <th className={cn(TH, "static text-end")}>{t("payroll.qtyCol", "الكمية")}</th>
                              <th className={cn(TH, "static text-end")}>{t("payroll.rateCol", "السعر")}</th>
                              <th className={cn(TH, "static text-end")}>{t("payroll.amount", "المبلغ")}</th>
                              <th className={cn(TH, "static text-end")}>{t("payroll.deferredShort", "مرحَّل")}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {myLines.map((l, i) => (
                              <tr key={("id" in l ? l.id : `${l.code}-${i}`)} className="bg-surface-1 even:bg-surface-2/40">
                                <td className={cn(TD, "font-semibold text-ink")}>{elLabel(l.code)}</td>
                                <td className={cn(TD, "text-ink-subtle")}>{l.reason ?? "—"}</td>
                                <td className={cn(TD, NUM, "text-ink-muted")}>{l.qty != null ? l.qty : "—"}</td>
                                <td className={cn(TD, NUM, "text-ink-muted")}>
                                  {l.rate != null ? Math.round(l.rate).toLocaleString("en-US") : "—"}
                                </td>
                                <td className={cn(TD, NUM, "font-semibold",
                                  l.kind === "earning" ? "text-ink" : "text-danger-600 dark:text-danger-400")}>
                                  {l.kind === "earning" ? "" : "−"}{money(l.amount)}
                                </td>
                                <td className={cn(TD, NUM, l.deferred > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink-subtle")}>
                                  {l.deferred > 0 ? money(l.deferred) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {!frozen && (
                            <Button size="sm" variant="secondary" leftIcon={<Plus size={14} />} data-payadd={sid}
                              onClick={() => setAddFor(staff.find((s) => s.id === sid) ?? null)}>
                              {t("payroll.addLine", "قطع أو زيادة")}
                            </Button>
                          )}
                          {slip && !slip.paid_at && run?.status === "approved" && (
                            <>
                              <Button size="sm" leftIcon={<Banknote size={14} />} disabled={busy} data-paycash={sid}
                                onClick={() => pay(slip, "cash")}>{t("payroll.payCash", "دفع نقداً")}</Button>
                              <Button size="sm" variant="secondary" disabled={busy} data-paybank={sid}
                                onClick={() => pay(slip, "bank")}>{t("payroll.payBank", "حوالة")}</Button>
                            </>
                          )}
                          {!frozen && pending && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {manual[sid].map((m, i) => (
                                <span key={i} className="chip bg-surface-1 text-2xs text-ink-muted">
                                  {elLabel(m.code)}
                                  <button aria-label={t("common.delete", "حذف")} onClick={() => setManual((s) => ({
                                    ...s, [sid]: s[sid].filter((_, j) => j !== i),
                                  }))}><Trash2 size={12} /></button>
                                </span>
                              ))}
                              <span className="chip bg-warn-50 text-2xs text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
                                {t("payroll.recalcNeeded", "اضغط «إعادة الحساب» حتى تنحفظ")}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                  </tr>
                ) : null,
              ];
            })}
          </tbody>
          <tfoot>
            <tr>
              <td className={cn(TF, STICKY, "z-30 text-start")}>{t("payroll.total", "المجموع")}</td>
              <td className={TF}></td>
              <td className={cn(TF, NUM)}>{money(totals.gross)}</td>
              <td className={cn(TF, NUM, "text-danger-600 dark:text-danger-400")}>
                {totals.deductions > 0 ? `−${money(totals.deductions)}` : "—"}
              </td>
              <td className={TF}></td>
              <td className={cn(TF, NUM, "text-brand-700 dark:text-brand-300")} data-paytotal="net">{money(totals.net)}</td>
              <td className={TF} colSpan={2}></td>
            </tr>
          </tfoot>
        </Sheet>
      )}

      {addFor && (
        <AddLineDialog
          member={addFor}
          onClose={() => setAddFor(null)}
          onAdd={(line) => {
            setManual((s) => ({ ...s, [addFor.id]: [...(s[addFor.id] ?? []), line] }));
            setAddFor(null);
            playTap();
          }}
        />
      )}

      {user && slips.length > 0 && run?.status === "approved" && (
        <p className="mt-4 text-2xs text-ink-subtle">
          {t("payroll.postNote", "الدفع وحده يُرحَّل لسجل المصروفات — بالصافي المدفوع فعلاً، حتى يبقى صافي النقد بالصندوق صحيحاً.")}
        </p>
      )}
    </div>
  );
}

function AddLineDialog({ member, onClose, onAdd }: {
  member: StaffMember; onClose: () => void; onAdd: (l: LineInput) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const elLabel = useElLabel();
  const [code, setCode] = useState("ABS");
  const [qty, setQty] = useState("");
  const [amount, setAmount] = useState("");
  const el = elementOf(code);
  const byDays = code === "ABS" || code === "UNPAID";
  const [reason, setReason] = useState("");

  const submit = () => {
    if (el?.needsReason && !reason.trim()) {
      playWarning(); toast.error(t("payroll.reasonRequired", "هذا البند يحتاج سبباً — بلا سبب صار نزاعاً مؤجَّلاً"));
      return;
    }
    if (byDays) {
      const n = Number(qty);
      if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("payroll.badDays", "عدد الأيام غير صحيح")); return; }
      onAdd({ code, qty: n, reason: reason.trim() || null });
      return;
    }
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("payroll.badAmount", "المبلغ غير صحيح")); return; }
    onAdd({ code, amount: n, reason: reason.trim() || null });
  };

  return (
    <Dialog open onClose={onClose} title={t("payroll.addLineFor", "بند لـ{{n}}", { n: member.name })}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("payroll.element", "البند")}</label>
          <select className="input" value={code} onChange={(e) => { setCode(e.target.value); setReason(""); }} data-paylinecode>
            <optgroup label={t("payroll.deductions", "القطوعات")}>
              {PAY_ELEMENTS.filter((e) => e.kind === "deduction" && !e.auto).map((e) => (
                <option key={e.code} value={e.code}>{elLabel(e.code)}</option>
              ))}
            </optgroup>
            <optgroup label={t("payroll.earnings", "الزيادات")}>
              {PAY_ELEMENTS.filter((e) => e.kind === "earning" && !e.auto).map((e) => (
                <option key={e.code} value={e.code}>{elLabel(e.code)}</option>
              ))}
            </optgroup>
          </select>
        </div>

        {byDays ? (
          <div>
            <label className="label">{t("payroll.days", "عدد الأيام")}</label>
            <AmountInput value={qty} onChange={setQty} hook="days" />
            <p className="mt-1.5 text-xs text-ink-subtle">
              {t("payroll.daysHint", "المبلغ ينحسب من أجر اليوم تلقائياً، ويُطبع على القسيمة كيف انحسب.")}
            </p>
          </div>
        ) : (
          <div>
            <label className="label">{t("payroll.amount", "المبلغ")}</label>
            <AmountInput value={amount} onChange={setAmount} hook="line" />
          </div>
        )}

        <div>
          <label className="label">
            {t("payroll.reason", "السبب")}
            {el?.needsReason && <span className="text-danger-600"> *</span>}
          </label>
          <input className="input" value={reason} data-payreason
            onChange={(e) => setReason(e.target.value)}
            placeholder={el?.needsReason ? t("payroll.reasonReq", "إلزامي لهذا البند") : t("payroll.reasonOpt", "اختياري")} />
        </div>

        {el?.capExempt && (
          <p className="rounded-xl bg-surface-2 p-2.5 text-2xs leading-relaxed text-ink-muted">
            {t("payroll.exemptHint", "هذا البند خارج سقف الاستقطاع: هو أجرٌ لم يُستحقّ أو مالٌ خرج فعلاً، وتقييده يعني الدفع مقابل ما لم يُعمَل.")}
          </p>
        )}

        <Button className="w-full" onClick={submit} data-paylineadd>{t("common.add", "إضافة")}</Button>
      </div>
    </Dialog>
  );
}

/* ── ٣) السلف ────────────────────────────────────────────────────────────── */

function LoansTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { staff, loans, loading, reload } = usePayrollData();
  const [openNew, setOpenNew] = useState(false);

  const active = loans.filter((l) => l.status === "active");
  const done = loans.filter((l) => l.status !== "active");
  const outstanding = active.reduce((s, l) => s + l.remaining, 0);

  return (
    <div data-payloans>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div>
          <p className="text-2xs font-semibold text-ink-muted">{t("payroll.outstanding", "الذمم القائمة")}</p>
          <p className="font-display text-xl font-extrabold tabular-nums text-ink" data-payoutstanding>{money(outstanding)}</p>
        </div>
        <Button size="sm" className="ms-auto" leftIcon={<Plus size={15} />} data-payloannew
          onClick={() => { playTap(); setOpenNew(true); }}>
          {t("payroll.newLoan", "صرف سلفة")}
        </Button>
      </div>

      <p className="mb-4 rounded-2xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-muted">
        {t("payroll.loanNote", "السلفة ذمّة على الموظف لا كلفة رواتب: تنقص الصندوق يوم صرفها، وتُسترجع أقساطاً من قسيمته. ولهذا ما تنحسب مرّتين على أرباحك.")}
      </p>

      {loading ? <p className="text-sm text-ink-muted">{t("common.loading", "…جاري التحميل")}</p>
        : !loans.length ? (
          <EmptyState icon={<HandCoins size={26} />} title={t("payroll.noLoans", "ما أكو سلف")}
            description={t("payroll.noLoansHint", "لمّا تصرف سلفة تظهر هنا مع أقساطها والباقي منها.")} />
        ) : (
          <Sheet minW={920} hook="loans">
            <thead>
              <tr>
                <th className={cn(TH, "z-30 text-start")}>{t("payroll.employee", "الموظف")}</th>
                <th className={cn(TH, "text-end")}>{t("payroll.principal", "الأصل")}</th>
                <th className={cn(TH, "text-end")}>{t("payroll.installment", "القسط الشهري")}</th>
                <th className={cn(TH, "text-end")}>{t("payroll.repaid", "المسدَّد")}</th>
                <th className={cn(TH, "text-end")}>{t("payroll.remaining", "الباقي")}</th>
                <th className={cn(TH, "text-start")}>{t("payroll.progress", "التقدّم")}</th>
                <th className={cn(TH, "text-start")}>{t("payroll.reason", "السبب")}</th>
                <th className={cn(TH, "text-start")}>{t("payroll.state", "الحالة")}</th>
                <th className={cn(TH, "w-px")}></th>
              </tr>
            </thead>
            <tbody>
              {[...active, ...done].map((l) => (
                <LoanRow key={l.id} loan={l} name={nameOf(staff, l.staff_id)} onChanged={reload} />
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className={cn(TF, STICKY, "z-30 text-start")}>{t("payroll.outstanding", "الذمم القائمة")}</td>
                <td className={TF} colSpan={3}></td>
                <td className={cn(TF, NUM, "text-warn-700 dark:text-warn-300")}>{money(outstanding)}</td>
                <td className={TF} colSpan={4}></td>
              </tr>
            </tfoot>
          </Sheet>
        )}

      {openNew && (
        <NewLoanDialog
          staff={staff}
          onClose={() => setOpenNew(false)}
          onDone={async () => { setOpenNew(false); toast.success(t("payroll.loanDone", "انصرفت السلفة وانسجّلت الذمّة")); await reload(); }}
        />
      )}
    </div>
  );
}

function LoanRow({ loan, name, onChanged }: { loan: StaffLoan; name: string; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [wo, setWo] = useState(false);
  const [note, setNote] = useState("");
  const repaid = Math.max(0, loan.principal - loan.remaining);
  const pct = loan.principal > 0 ? Math.round((repaid / loan.principal) * 100) : 0;
  const stateLabel = loan.status === "active" ? t("payroll.active", "فعّالة")
    : loan.status === "settled" ? t("payroll.settled", "مسدَّدة") : t("payroll.writtenOff", "مشطوبة");

  return (
    <tr className={cn(TR, loan.status !== "active" && "opacity-70")} data-payloan={loan.id}>
      <td className={cn(TD, STICKY, "font-semibold text-ink")}>{name}</td>
      <td className={cn(TD, NUM)}>{money(loan.principal)}</td>
      <td className={cn(TD, NUM, "text-ink-muted")}>
        {money(loan.installment)}
        {loan.status === "active" && (
          <span className="block text-2xs text-ink-subtle">
            {t("payroll.leftAfter", "الباقي بعده {{r}}", { r: money(remainingAfter(loan as LoanRow)) })}
          </span>
        )}
      </td>
      <td className={cn(TD, NUM, "text-emerald-700 dark:text-emerald-400")}>{money(repaid)}</td>
      <td className={cn(TD, NUM, "font-bold")} data-payloanleft={loan.id}>{money(loan.remaining)}</td>
      <td className={cn(TD, "w-28")}>
        <span className="flex items-center gap-2">
          <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
            <span className="block h-full rounded-full bg-brand-500" style={{ width: `${pct}%` }} />
          </span>
          <span className="text-2xs tabular-nums text-ink-subtle">{t("payroll.pct", "{{n}}٪", { n: pct })}</span>
        </span>
      </td>
      <td className={cn(TD, "max-w-[14rem] truncate text-2xs text-ink-subtle")}>{loan.reason ?? "—"}</td>
      <td className={cn(TD, "text-2xs")}>
        <span className={cn("chip text-2xs", loan.status === "active"
          ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"
          : "bg-surface-2 text-ink-muted")}>{stateLabel}</span>
      </td>
      <td className={cn(TD, "p-1")}>
        {loan.status === "active" && (
          <Button size="sm" variant="ghost" data-paywriteoff={loan.id}
            onClick={() => { playTap(); setWo(true); }}>{t("payroll.writeOff", "شطب")}</Button>
        )}
        {/* الحوار داخل الخلية لا شقيقاً للصفّ: <tr> لا يقبل إلا خلايا. */}
        {wo && (
          <Dialog open onClose={() => setWo(false)} title={t("payroll.writeOffTitle", "شطب السلفة")}>
            <div className="space-y-3">
              <p className="text-sm text-ink-muted">
                {t("payroll.writeOffHint", "الشطب يوقف الأقساط ويخلّي الذمّة موثّقة بسببها. ما ينحذف شي من التاريخ.")}
              </p>
              <input className="input" value={note} data-paywonote onChange={(e) => setNote(e.target.value)}
                placeholder={t("payroll.writeOffReason", "السبب — إلزامي")} />
              <Button className="w-full" onClick={async () => {
                try {
                  await repo.writeOffLoan(loan.id, note);
                  playSuccess(); setWo(false); await onChanged();
                } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
              }}>{t("payroll.confirmWriteOff", "تأكيد الشطب")}</Button>
            </div>
          </Dialog>
        )}
      </td>
    </tr>
  );
}

function NewLoanDialog({ staff, onClose, onDone }: {
  staff: StaffMember[]; onClose: () => void; onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [sid, setSid] = useState(staff[0]?.id ?? "");
  const [principal, setPrincipal] = useState("");
  const [installment, setInstallment] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [busy, setBusy] = useState(false);

  const p = Number(principal), i = Number(installment);
  const months = p > 0 && i > 0 ? Math.ceil(p / i) : 0;

  const submit = async () => {
    if (!sid) return;
    if (!Number.isFinite(p) || p <= 0) { playWarning(); toast.error(t("payroll.badAmount", "المبلغ غير صحيح")); return; }
    if (!Number.isFinite(i) || i <= 0 || i > p) {
      playWarning(); toast.error(t("payroll.badInstallment", "القسط لازم يكون أكبر من صفر وأصغر من الأصل")); return;
    }
    setBusy(true);
    try {
      await repo.disburseLoan(sid, staff.find((s) => s.id === sid)?.name ?? "", p, i, reason.trim() || null, method);
      playSuccess();
      await onDone();
    } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={t("payroll.newLoan", "صرف سلفة")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("payroll.employee", "الموظف")}</label>
          <select className="input" value={sid} onChange={(e) => setSid(e.target.value)} data-payloanstaff>
            {staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="label">{t("payroll.principal", "الأصل")}</label>
            <AmountInput value={principal} onChange={setPrincipal} hook="principal" />
          </div>
          <div>
            <label className="label">{t("payroll.installment", "القسط الشهري")}</label>
            <AmountInput value={installment} onChange={setInstallment} hook="installment" />
          </div>
        </div>
        {months > 0 && (
          <p className="text-xs text-ink-muted" data-payloanmonths>
            {t("payroll.loanMonths", "تنطفي بـ{{n}} أقساط", { n: months })}
          </p>
        )}
        <div>
          <label className="label">{t("payroll.reason", "السبب")}</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} data-payloanreason
            placeholder={t("payroll.reasonOpt", "اختياري")} />
        </div>
        <div>
          <label className="label">{t("payroll.method", "من وين تطلع الفلوس")}</label>
          <Segmented<PayMethod>
            layoutId="loan-method" value={method} onChange={setMethod}
            options={[
              { value: "cash", label: t("payroll.cash", "نقد الصندوق") },
              { value: "bank", label: t("payroll.bank", "حوالة") },
            ]}
          />
        </div>
        <Button className="w-full" disabled={busy} onClick={submit} data-payloansave>
          {t("payroll.disburse", "اصرف وسجّل الذمّة")}
        </Button>
      </div>
    </Dialog>
  );
}

export default Payroll;
