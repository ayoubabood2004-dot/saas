import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  Wallet, Users, HandCoins, Plus, Trash2, Printer, Check, Lock,
  CircleDollarSign, TriangleAlert, ChevronDown, RotateCcw, Banknote, SlidersHorizontal, Undo2,
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
  PAY_ELEMENTS, elementOf, compAt, buildSlip, remainingAfter, isAdvance,
  normalizePolicy, periodKey, periodEnd, periodLabel, isFrozen,
  type LineInput, type PayrollPolicy, type LoanRow,
} from "@/lib/payroll";
import type {
  StaffComp, StaffRecurring, PayrollAdjustment, PayrollRun, Payslip, PayslipLine, StaffLoan, PayslipDraft, PayMethod, PayLineKind,
} from "@/types";

/* ============================================================================
 * رواتب الكادر.
 *
 * ثلاث تبويبات تتبع تسلسل العمل الحقيقي لا تصنيف البيانات: من يقبض وكم
 * (الكادر)، ثم شهر هذا الشهر (الدورة)، ثم ما برقبة الموظفين (السلف والسحوبات).
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
    <div className="mx-auto max-w-6xl px-4 py-6">
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
            { value: "loans", label: t("payroll.tabLoans", "السلف والسحوبات"), icon: <HandCoins size={15} /> },
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

/** الكادر + هيكل الأجر + الثابت + السلف والسحوبات: كل ما تحتاجه التبويبات الثلاث. */
function usePayrollData() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [comp, setComp] = useState<StaffComp[]>([]);
  const [recurring, setRecurring] = useState<StaffRecurring[]>([]);
  const [adjustments, setAdjustments] = useState<PayrollAdjustment[]>([]);
  const [loans, setLoans] = useState<StaffLoan[]>([]);
  const [policy, setPolicy] = useState<PayrollPolicy>(() => normalizePolicy(null));
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    const [s, c, r, a, l, p] = await Promise.all([
      listStaff().catch(() => [] as StaffMember[]),
      repo.listStaffComp().catch(() => [] as StaffComp[]),
      repo.listStaffRecurring().catch(() => [] as StaffRecurring[]),
      repo.listPayrollAdjustments().catch(() => [] as PayrollAdjustment[]),
      repo.listStaffLoans().catch(() => [] as StaffLoan[]),
      repo.getPayrollPolicy().catch(() => null),
    ]);
    setStaff(s.filter((x) => x.status !== "suspended"));
    setComp(c); setRecurring(r); setAdjustments(a); setLoans(l);
    setPolicy(normalizePolicy(p));
    setLoading(false);
  }, []);

  useEffect(() => { void reload(); }, [reload]);
  return { staff, comp, recurring, adjustments, loans, policy, loading, reload };
}

const nameOf = (staff: StaffMember[], id: string) => staff.find((s) => s.id === id)?.name ?? "—";

/** أول يوم بالشهر — مفتاحُ الفترة كما تخزنه القاعدة، فيتطابق الطرفان. */
const monthKey = (period: string) => `${period.slice(0, 7)}-01`;

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
 * وأربعة تفاصيل تجعلها تعمل على آيباد لا على شاشة عريضة فقط: الرأس لاصقٌ
 * عمودياً (بطبقتين بكشف الدورة)، وعمود الاسم لاصقٌ من البداية وعمود الأزرار
 * لاصقٌ من النهاية (فلا يضيع صاحب الرقم ولا زرُّه عند التمرير)، وسطر المجاميع
 * لاصقٌ بالأسفل — وهو ما يقابل «صفّ المجموع» بالإكسل.
 *
 * الحدود من جهةٍ واحدة على جدولٍ `border-separate`: سفاري الآيباد يُسقط حدود
 * الخلية اللاصقة بجدولٍ `border-collapse` لحظةَ التمرير، فيختفي شكل الشبكة.
 * والخلفيات **معتمة** كلّها: خليةٌ لاصقة بخلفيةٍ شفّافة تكشف ما يمرّ تحتها. */
const TH = "sticky top-0 z-20 border-b border-e border-line/70 bg-surface-2 px-3 py-2 text-2xs font-bold tracking-wide text-ink-muted whitespace-nowrap";
const TD = "border-b border-e border-line/60 px-3 py-2 align-middle";
const NUM = "text-end tabular-nums whitespace-nowrap";
const TR = "bg-surface-1 even:bg-surface-2 hover:bg-brand-50 dark:hover:bg-surface-3";
const STICKY = "sticky start-0 z-10 bg-inherit border-e border-line-strong";
const STICKY_END = "sticky end-0 z-10 bg-inherit border-s border-line-strong";
const TF = "sticky bottom-0 z-20 border-t border-e border-line/70 bg-surface-2 px-3 py-2 font-bold";

function Sheet({ minW, hook, children }: { minW: number; hook?: string; children: ReactNode }) {
  return (
    <div className="card overflow-hidden p-0" data-sheet={hook}>
      <div className="max-h-[66vh] overflow-auto supports-[height:100dvh]:max-h-[calc(100dvh-14rem)]">
        <table className="w-full border-separate border-spacing-0 text-sm" style={{ minWidth: minW }}>{children}</table>
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

/** مبلغٌ بإشارة سالبة معزولةٍ اتجاهياً: بلا العزل تنقلب الإشارة لآخر الرقم داخل RTL. */
function Neg({ v }: { v: number }) {
  return <span dir="ltr" className="[unicode-bidi:isolate]">−{formatNum(v)}</span>;
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
            <th className={cn(TH, "start-0 z-30 text-start")}>{t("payroll.employee", "الموظف")}</th>
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
            const mine = loans.filter((l) => l.staff_id === s.id && l.status === "active");
            const loan = mine.find((l) => !isAdvance(l));
            const drawLeft = mine.filter(isAdvance).reduce((sum, l) => sum + l.remaining, 0);
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
                <td className={cn(TD, NUM, loan || drawLeft > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink-subtle")}>
                  {loan ? money(loan.remaining) : "—"}
                  {drawLeft > 0 && (
                    <span className="block text-2xs leading-tight text-ink-subtle">{t("payroll.drawLeft", "سحب باقي {{v}}", { v: money(drawLeft) })}</span>
                  )}
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

/* ── كشف الدورة: عمودٌ لكل بند ────────────────────────────────────────────
 * الرأس بطبقتين مثل الإكسل: مجموعتا «الإضافات» و«القطوعات» فوق، وتحت كلٍّ
 * منهما عمودٌ لكل بندٍ **ظهر هذا الشهر فعلاً** بترتيب الكتالوج — فلا تظهر
 * ستّة عشر عموداً فارغاً، ولا يتبدّل ترتيبُ الأعمدة بين شهرٍ وآخر. و«السحب»
 * و«قسط السلفة» عمودان دائمان **داخل** القطوعات، يليهما «المجموع» الذي
 * يساوي حرفياً ما يخزّنه الخادم بالقسيمة وما يُطبع عليها — فيصير
 * الإجمالي − المجموع = الصافي قابلاً للفحص بالعين على كل صف.
 *
 * الخلايا أرقامٌ صِرف بلا رمز عملة (يُذكر مرّةً بالشريط) وبلا إشارة سالبة
 * داخل أعمدة القطوعات: الرأسُ واللونُ يقولانها، والإشارة تقلب اتجاهها بـRTL.
 *
 * وسطرٌ يُعدَّل قبل الحفظ يُعرض من المعاينة الحيّة ملوَّناً — فقطعٌ أو سحبٌ
 * يُضاف يظهر بعموده فوراً، ويبقى ملوَّناً حتى تحفظه «إعادة الحساب». */

/** ما تحتاجه الخلية من السطر — يقبل المحفوظ (PayslipLine) والمعاينة (ComputedLine) معاً. */
type AnyLine = { code: string; kind: PayLineKind; amount: number; deferred: number; qty?: number | null; reason?: string | null; ref_id?: string | null };

interface SheetRow {
  sid: string; name: string; base: number; gross: number; ded: number; net: number; defer: number;
  lines: AnyLine[]; slip: Payslip | null; dirty: boolean;
}

interface Agg { amount: number; deferred: number; qty: number; reasons: string[] }
function aggOf(lines: AnyLine[], code: string): Agg {
  const a: Agg = { amount: 0, deferred: 0, qty: 0, reasons: [] };
  for (const l of lines) {
    if (l.code !== code) continue;
    a.amount += l.amount; a.deferred += l.deferred; a.qty += l.qty ?? 0;
    if (l.reason) a.reasons.push(l.reason);
  }
  return a;
}

/** بصمةُ السطور: تختلف ⇐ المعاينة تختلف عن المحفوظ ⇐ الصفّ يحتاج إعادة حساب. */
const sigOf = (lines: AnyLine[]): string =>
  lines.map((l) => `${l.code}|${Number(l.amount)}|${l.qty == null ? "" : Number(l.qty)}|${l.ref_id ?? ""}`).sort().join(";");

const TH1 = "sticky top-0 z-20 h-8 border-b border-e border-line/70 bg-surface-2 px-2 py-0 align-middle text-2xs font-bold tracking-wide text-ink-muted whitespace-nowrap leading-none";
const TH2 = "sticky z-20 h-8 border-b border-e border-line/70 bg-surface-2 px-2 py-0 align-middle text-2xs font-semibold text-ink-muted whitespace-nowrap leading-none text-end min-w-[6rem]";
const TDN = cn(TD, NUM, "text-xs");
const DIRTY = "bg-warn-50 dark:bg-warn-500/10";
const G_EARN = "bg-emerald-50 text-emerald-700 dark:bg-surface-3 dark:text-emerald-400";
const G_DED = "bg-danger-50 text-danger-700 dark:bg-surface-3 dark:text-danger-400";
const G_CASH = "bg-warn-50 dark:bg-surface-3";

function RunTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { staff, comp, recurring, adjustments, loans, policy, loading, reload } = usePayrollData();

  const elLabel = useElLabel();
  const colLabel = (code: string) => t(`payroll.col.${code}`, code);
  const [period, setPeriod] = useState(() => periodKey(new Date()));
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [slips, setSlips] = useState<Payslip[]>([]);
  const [lines, setLines] = useState<PayslipLine[]>([]);
  /* البنود اليدوية تُقرأ من القاعدة لا من الذاكرة (0142).
   *
   * كانت `useState` — تُضاف بند، يحفظها «احسب» ثم يمسح الذاكرة، وإعادةُ الحساب
   * تبدأ بحذف القسائم وتبني من (راتب + ثوابت + سلف + ذاكرةٍ فارغة). فالقطعُ
   * الأول يُمحى بلا صوت، ويبدو للعيادة أن السستم يقبل قطعاً واحداً لا أكثر.
   * الآن كلُّ بندٍ صفٌّ بشهره: إعادةُ الحساب تقرأه فتتراكم القطوعات، وتُعطي
   * الحلقةُ نفس النتيجة مهما تكرّرت.
   *
   * والنافذُ منه هو الباقي بعد الردّ — فبندٌ رُدّ نصفُه يُحسب نصفاً، ورُدّ كلُّه
   * يسقط من الحساب ويبقى بالسجل. */
  const manual = useMemo(() => {
    const out: Record<string, LineInput[]> = {};
    for (const a of adjustments) {
      if (a.period !== monthKey(period)) continue;
      const line = a.qty != null
        ? { code: a.code, qty: a.qty - a.reversed_qty, reason: a.reason ?? null }
        : { code: a.code, amount: a.amount - a.reversed_amount, reason: a.reason ?? null };
      if ((line.qty ?? line.amount ?? 0) <= 0) continue;   // رُدّ كلُّه
      (out[a.staff_id] ??= []).push(line);
    }
    return out;
  }, [adjustments, period]);

  /** بنودُ هذا الشهر لموظف — بما فيها المردودةُ كلياً، فالسجل يُقرأ لا يُخفى. */
  const adjOf = useCallback(
    (sid: string) => adjustments.filter((a) => a.staff_id === sid && a.period === monthKey(period)),
    [adjustments, period]);
  const [busy, setBusy] = useState(false);
  const [addFor, setAddFor] = useState<StaffMember | null>(null);
  const [drawFor, setDrawFor] = useState<StaffMember | null>(null);
  const [undoFor, setUndoFor] = useState<PayrollAdjustment | null>(null);
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

  /* مصدرُ كل صفّ: المجمَّدة من المحفوظ وحده؛ وغيرُها من المعاينة إن اختلفت
   * عن المحفوظ (بندٌ معلّق، أو سحبٌ جديد، أو راتبٌ تغيّر) وإلا من المحفوظ.
   * فما يُضاف يظهر بعموده فوراً بلا حفظٍ صامتٍ لشيء. */
  const linesMissing = slips.length > 0 && lines.length === 0;
  const rows = useMemo<SheetRow[]>(() => {
    const saved = new Map(slips.map((p) => [p.staff_id, p]));
    const fromSlip = (p: Payslip, dirty: boolean): SheetRow => ({
      sid: p.staff_id, name: p.staff_name, base: p.base_amount, gross: p.gross, ded: p.deductions, net: p.net, defer: p.deferred,
      lines: lines.filter((l) => l.payslip_id === p.id), slip: p, dirty,
    });
    if (frozen) return slips.map((p) => fromSlip(p, false));
    const out: SheetRow[] = [];
    const seen = new Set<string>();
    for (const pv of preview) {
      seen.add(pv.staff_id);
      const p = saved.get(pv.staff_id);
      const pending = false;   // البند صار صفّاً محفوظاً؛ اختلافُ البصمة وحده يُعلن الحاجة لإعادة الحساب
      const changed = !!p && !linesMissing && sigOf(lines.filter((l) => l.payslip_id === p.id)) !== sigOf(pv.lines);
      const dirty = !p || pending || changed;
      if (p && !dirty) { out.push(fromSlip(p, false)); continue; }
      // بلا دورةٍ محفوظة أصلاً ما من شيءٍ نقارن به فلا تلوين؛ أما موظفٌ دخل
      // الأهلية بعد الحساب فبلا قسيمة — وهذا بذاته يستوجب إعادة الحساب.
      out.push({
        sid: pv.staff_id, name: pv.staff_name, base: pv.base_amount,
        gross: pv.computation.gross, ded: pv.computation.deductions, net: pv.computation.net, defer: pv.computation.deferred,
        lines: pv.lines, slip: p ?? null, dirty: slips.length > 0 && dirty,
      });
    }
    // قسيمةٌ محفوظة لموظفٍ خرج من الأهلية: تبقى ظاهرةً ومعلَّمة — إعادةُ الحساب ستُسقطها.
    for (const p of slips) if (!seen.has(p.staff_id)) out.push(fromSlip(p, true));
    return out;
  }, [slips, lines, preview, manual, frozen, linesMissing]);

  const dirtyCount = rows.filter((r) => r.dirty).length;

  /** الأعمدة الفرعية: ما ظهر هذا الشهر فعلاً، بترتيب الكتالوج. */
  const { E, D } = useMemo(() => {
    const present = new Set<string>();
    for (const r of rows) for (const l of r.lines) present.add(l.code);
    return {
      E: PAY_ELEMENTS.filter((e) => e.kind === "earning" && e.code !== "BASIC" && present.has(e.code)).map((e) => e.code),
      D: PAY_ELEMENTS.filter((e) => e.kind === "deduction" && e.code !== "ADV" && e.code !== "LOAN" && present.has(e.code)).map((e) => e.code),
    };
  }, [rows]);
  const colCount = E.length + D.length + 9;
  const minW = 160 + 96 * (E.length + D.length + 6) + 80;

  /* ارتفاعُ الطبقة الأولى يُقاس لا يُخمَّن: الطبقةُ الثانية تلتصق تحته بالضبط،
   * وتخمينُه بصنفٍ ثابت يترك شقّاً تمرّ منه الصفوف على سفاري. */
  const [tier1H, setTier1H] = useState(32);
  const roRef = useRef<ResizeObserver | null>(null);
  const measureTh = useCallback((el: HTMLTableCellElement | null) => {
    roRef.current?.disconnect(); roRef.current = null;
    if (!el) return;
    const apply = () => setTier1H(Math.round(el.getBoundingClientRect().height));
    apply();
    if (typeof ResizeObserver !== "undefined") { roRef.current = new ResizeObserver(apply); roRef.current.observe(el); }
  }, []);
  const th2Style = { top: tier1H };

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

  /** نقيضُ الاعتماد: يرجّع أقساط السلف لأرصدتها ثم يرجع الدورة «محسوبة». */
  const unapprove = async () => {
    if (!run) return;
    if (!window.confirm(t("payroll.unapproveConfirm", "تفكّ الاعتماد؟ ترجع الدورة قابلة للتعديل، وترجع أقساط السلف لأرصدتها."))) return;
    setBusy(true);
    try {
      await repo.unapprovePayrollRun(run.id);
      playSuccess();
      toast.success(t("payroll.unapproved", "انفكّ الاعتماد — الدورة صارت قابلة للتعديل وأقساط السلف رجعت"));
      await Promise.all([loadRun(), reload()]);
    } catch (e) {
      playWarning();
      const m = String((e as Error).message ?? e);
      toast.error(m.includes("paid payslip")
        ? t("payroll.unapprovePaid", "أكو قسائم انصرفت — فكّ التسليم عنها أول")
        : m.includes("closed") ? t("payroll.runClosed", "الدورة مقفلة — ما تنفكّ") : m);
    } finally { setBusy(false); }
  };

  /** نقيضُ الدفع: يمحو مصروفَه ويرجع القسيمة «غير مدفوعة» والدورة «معتمدة». */
  const unpay = async (slip: Payslip) => {
    if (!window.confirm(t("payroll.undoPayConfirm", "ترجع التسليم؟ ينمحي مصروف الراتب ويرجع الصندوق كما كان."))) return;
    setBusy(true);
    try {
      await repo.unpayPayslip(slip.id);
      playSuccess();
      toast.success(t("payroll.unpaid", "انفكّ التسليم وانمحى مصروفه"));
      await loadRun();
    } catch (e) {
      playWarning();
      const m = String((e as Error).message ?? e);
      toast.error(m.includes("closed") ? t("payroll.runClosed", "الدورة مقفلة — ما تنفكّ") : m);
    } finally { setBusy(false); }
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

  /** ما يُعرض للسحب: صافيه المتوقّع، وأقصى ما يمكن قطعُه (الإجمالي − أيامٌ لم تُعمَل − سحوبٌ قائمة). */
  const drawBounds = (sid: string) => {
    const pv = preview.find((p) => p.staff_id === sid);
    if (!pv) return undefined;
    const c = pv.computation;
    const unearned = c.lines.filter((l) => l.code === "ABS" || l.code === "UNPAID").reduce((s, l) => s + l.amount, 0);
    const adv = c.lines.filter((l) => l.code === "ADV").reduce((s, l) => s + l.amount + l.deferred, 0);
    return { net: c.net, maxCollectible: Math.max(0, c.gross - unearned - adv) };
  };

  const sum = (f: (r: SheetRow) => number) => rows.reduce((s, r) => s + f(r), 0);
  const paidCount = rows.filter((r) => r.slip?.paid_at).length;
  const savedCount = rows.filter((r) => r.slip).length;

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
        <span className="chip bg-surface-2 text-2xs text-ink-subtle">{t("payroll.amountsIn", "المبالغ بـ{{c}}", { c: currencySymbol() })}</span>
        <div className="ms-auto flex flex-wrap gap-2">
          {!frozen && (
            <Button size="sm" disabled={busy} variant={dirtyCount > 0 ? "primary" : "secondary"} leftIcon={<RotateCcw size={15} />} onClick={calculate} data-paycalc>
              {dirtyCount > 0 ? t("payroll.pendingN", "إعادة الحساب ({{n}})", { n: dirtyCount })
                : run ? t("payroll.recalc", "إعادة الحساب") : t("payroll.calc", "احسب الدورة")}
            </Button>
          )}
          {run?.status === "calculated" && (
            <Button size="sm" disabled={busy || dirtyCount > 0} leftIcon={<Check size={15} />} onClick={approve} data-payapprove
              title={dirtyCount > 0 ? t("payroll.recalcFirst", "أعد الحساب أول — أكو صفوف متغيّرة") : undefined}>
              {t("payroll.approve", "اعتماد")}
            </Button>
          )}
          {/* الاعتماد ينفكّ ما دامت ولا قسيمة انصرفت. مدفوعةٌ واحدة تكفي للمنع:
              يُفَكّ التسليم أوّلاً ثم الاعتماد — خطوتان مقصودتان لا ضغطةٌ تمحو الكلّ. */}
          {run?.status === "approved" && (
            <Button size="sm" variant="secondary" disabled={busy} leftIcon={<Undo2 size={15} />}
              onClick={unapprove} data-payunapprove>
              {t("payroll.unapprove", "فكّ الاعتماد")}
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
      {linesMissing && (
        <p className="mb-3 flex items-start gap-2 rounded-2xl border border-warn-200 bg-warn-50 p-3 text-xs text-warn-700 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-300">
          <TriangleAlert size={14} className="mt-0.5 shrink-0" />
          {t("payroll.linesMissing", "سطور القسائم ما انحمّلت — المجاميع صحيحة والتفاصيل ناقصة")}
        </p>
      )}

      {!rows.length ? (
        <EmptyState icon={<TriangleAlert size={26} />}
          title={t("payroll.noEligible", "ما أكو موظف براتب مثبَّت لهذا الشهر")}
          description={t("payroll.noEligibleHint", "روح لتبويب «الكادر ورواتبهم» وثبّت الأجر الأساسي — بلا أجرٍ ساري ما يدخل الموظف الدورة.")} />
      ) : (
        <Sheet minW={minW} hook="run">
          <thead>
            <tr>
              <th rowSpan={2} className={cn(TH1, "start-0 z-30 min-w-[10rem] text-start")}>{t("payroll.employee", "الموظف")}</th>
              <th rowSpan={2} className={cn(TH1, "text-end")}>{t("payroll.col.BASIC", "الأساسي")}</th>
              {E.length > 0 && (
                <th colSpan={E.length} className={cn(TH1, G_EARN, "text-center")} data-paygroup="earn">{t("payroll.additions", "الإضافات")}</th>
              )}
              <th rowSpan={2} className={cn(TH1, "text-end font-bold text-ink")}>{t("payroll.gross", "إجمالي الأجور")}</th>
              <th ref={measureTh} colSpan={D.length + 3} className={cn(TH1, G_DED, "text-center")} data-paygroup="ded">{t("payroll.deductions", "القطوعات")}</th>
              <th rowSpan={2} className={cn(TH1, "text-end")}>{t("payroll.deferredShort", "مرحَّل")}</th>
              <th rowSpan={2} className={cn(TH1, "text-end font-bold text-ink")}>{t("payroll.net", "الصافي")}</th>
              <th rowSpan={2} className={cn(TH1, "end-0 z-30 w-px border-s border-line-strong")}></th>
            </tr>
            <tr>
              {E.map((code) => (
                <th key={code} style={th2Style} className={cn(TH2, "bg-emerald-50/60 dark:bg-surface-3")} data-paycol={code}>{colLabel(code)}</th>
              ))}
              {D.map((code) => (
                <th key={code} style={th2Style} className={cn(TH2, "bg-danger-50/60 dark:bg-surface-3")} data-paycol={code}>{colLabel(code)}</th>
              ))}
              <th style={th2Style} className={cn(TH2, G_CASH)} data-paycol="ADV">{t("payroll.col.ADV", "سحب")}</th>
              <th style={th2Style} className={cn(TH2, G_CASH)} data-paycol="LOAN">{t("payroll.col.LOAN", "قسط سلفة")}</th>
              <th style={th2Style} className={cn(TH2, "font-bold text-ink")} data-paycol="dedsum">{t("payroll.grpSum", "المجموع")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const { sid, name, slip, dirty } = row;
              const expanded = open === sid;
              const advA = aggOf(row.lines, "ADV"), loanA = aggOf(row.lines, "LOAN");
              const cell = (code: string, tone: string) => {
                const a = aggOf(row.lines, code);
                const days = code === "ABS" || code === "UNPAID";
                return (
                  <td key={code} className={cn(TDN, dirty && DIRTY)} title={a.reasons.join(" · ") || undefined}>
                    {a.amount > 0 || a.deferred > 0 ? (
                      <>
                        <span className={tone}>{formatNum(a.amount)}</span>
                        {days && a.qty > 0 && <span className="block text-2xs leading-none text-ink-subtle">{t("payroll.daysN", "{{n}} يوم", { n: formatNum(a.qty) })}</span>}
                        {a.deferred > 0 && <span className="block text-2xs leading-none text-warn-700 dark:text-warn-300">{t("payroll.deferredTo", "رُحِّل: {{v}}", { v: formatNum(a.deferred) })}</span>}
                      </>
                    ) : <span className="text-ink-subtle">—</span>}
                  </td>
                );
              };

              return [
                <tr key={sid} className={cn(TR, "cursor-pointer")} data-payslip={sid} data-paytoggle={sid} data-paydirty={dirty || undefined}
                  onClick={() => { playTap(); setOpen(expanded ? null : sid); }}>
                  <td className={cn(TD, STICKY, "font-semibold text-ink")}>
                    <span className="flex items-center gap-1.5">
                      <ChevronDown size={13} className={cn("shrink-0 text-ink-subtle transition", expanded && "rotate-180")} />
                      <span className="truncate" title={name}>{name}</span>
                      {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-warn-500" title={t("payroll.recalcNeeded", "اضغط «إعادة الحساب» حتى تنحفظ")} />}
                    </span>
                  </td>
                  <td className={cn(TDN, "text-ink-muted")}>{formatNum(row.base)}</td>
                  {E.map((code) => cell(code, "text-emerald-700 dark:text-emerald-400"))}
                  <td className={cn(TDN, "font-semibold text-ink", dirty && DIRTY)}>{formatNum(row.gross)}</td>
                  {D.map((code) => cell(code, "text-danger-600 dark:text-danger-400"))}
                  <td className={cn(TDN, dirty && DIRTY)} data-payadv={sid}>
                    {advA.amount > 0 || advA.deferred > 0 ? (
                      <>
                        <span className="text-danger-600 dark:text-danger-400">{formatNum(advA.amount)}</span>
                        {advA.deferred > 0 && <span className="block text-2xs leading-none text-warn-700 dark:text-warn-300">{t("payroll.advCarried", "الباقي {{v}} يُقطع الشهر الجاي", { v: formatNum(advA.deferred) })}</span>}
                      </>
                    ) : <span className="text-ink-subtle">—</span>}
                  </td>
                  <td className={cn(TDN, dirty && DIRTY)}>
                    {loanA.amount > 0 || loanA.deferred > 0 ? (
                      <>
                        <span className="text-danger-600 dark:text-danger-400">{formatNum(loanA.amount)}</span>
                        {loanA.deferred > 0 && <span className="block text-2xs leading-none text-warn-700 dark:text-warn-300">{t("payroll.deferredTo", "رُحِّل: {{v}}", { v: formatNum(loanA.deferred) })}</span>}
                      </>
                    ) : <span className="text-ink-subtle">—</span>}
                  </td>
                  <td className={cn(TDN, "font-semibold", row.ded > 0 ? "text-danger-600 dark:text-danger-400" : "text-ink-subtle", dirty && DIRTY)}>
                    {row.ded > 0 ? <Neg v={row.ded} /> : "—"}
                  </td>
                  <td className={cn(TDN, row.defer > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink-subtle", dirty && DIRTY)}>
                    {row.defer > 0 ? formatNum(row.defer) : "—"}
                  </td>
                  <td className={cn(TDN, "font-bold text-ink", dirty && DIRTY)} data-paynet={sid}>
                    {formatNum(row.net)}
                    {slip?.paid_at && (
                      <span className="mt-0.5 block"><span className="chip bg-emerald-50 text-2xs text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"><Check size={12} />{t("payroll.wasPaid", "مدفوع")}</span></span>
                    )}
                  </td>
                  <td className={cn(TD, STICKY_END, "p-1")}>
                    <span className="flex gap-0.5">
                      {!frozen && (
                        <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label={t("payroll.addLine", "قطع أو زيادة")} title={t("payroll.addLine", "قطع أو زيادة")} data-payadd={sid}
                          onClick={(e) => { e.stopPropagation(); playTap(); setAddFor(staff.find((s) => s.id === sid) ?? null); }}>
                          <Plus size={15} />
                        </button>
                      )}
                      <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                        aria-label={t("payroll.draw", "سحب")} title={t("payroll.draw", "سحب")} data-paydraw={sid}
                        onClick={(e) => { e.stopPropagation(); playTap(); setDrawFor(staff.find((s) => s.id === sid) ?? null); }}>
                        <HandCoins size={15} />
                      </button>
                      {slip && (
                        <button className="grid h-8 w-8 place-items-center rounded-lg text-ink-muted transition hover:bg-surface-2 hover:text-ink"
                          aria-label={t("payroll.print", "القسيمة")} title={t("payroll.print", "القسيمة")} data-payprint={sid}
                          onClick={(e) => { e.stopPropagation(); printSlip(slip); }}>
                          <Printer size={15} />
                        </button>
                      )}
                    </span>
                  </td>
                </tr>,

                expanded ? (
                  <tr key={`${sid}-d`} className="bg-surface-2" data-paydetail={sid}>
                    <td className={cn(TD, "p-0")} colSpan={colCount}>
                      <div className="p-3">
                        {/* كشفٌ داخل كشف: سطور القسيمة واحداً واحداً — هنا يُرى سحبان بشهرٍ واحد منفصلَين */}
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
                            {row.lines.map((l, i) => (
                              <tr key={`${l.code}-${l.ref_id ?? ""}-${i}`} className="bg-surface-1 even:bg-surface-2">
                                <td className={cn(TD, "font-semibold text-ink")}>{elLabel(l.code)}</td>
                                <td className={cn(TD, "text-ink-subtle")}>{l.reason ?? "—"}</td>
                                <td className={cn(TD, NUM, "text-ink-muted")}>{l.qty != null ? formatNum(l.qty) : "—"}</td>
                                <td className={cn(TD, NUM, "text-ink-muted")}>
                                  {"rate" in l && (l as { rate?: number | null }).rate != null ? formatNum(Math.round((l as { rate: number }).rate)) : "—"}
                                </td>
                                <td className={cn(TD, NUM, "font-semibold", l.kind === "earning" ? "text-ink" : "text-danger-600 dark:text-danger-400")}>
                                  {l.kind === "earning" ? formatNum(l.amount) : <Neg v={l.amount} />}
                                </td>
                                <td className={cn(TD, NUM, l.deferred > 0 ? "text-warn-700 dark:text-warn-300" : "text-ink-subtle")}>
                                  {l.deferred > 0 ? formatNum(l.deferred) : "—"}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          {slip && !slip.paid_at && run?.status === "approved" && (
                            <>
                              <Button size="sm" leftIcon={<Banknote size={14} />} disabled={busy} data-paycash={sid}
                                onClick={() => pay(slip, "cash")}>{t("payroll.payCash", "دفع نقداً")}</Button>
                              <Button size="sm" variant="secondary" disabled={busy} data-paybank={sid}
                                onClick={() => pay(slip, "bank")}>{t("payroll.payBank", "حوالة")}</Button>
                            </>
                          )}
                          {/* ضغطةُ «تسليم» غلطاً كانت قيداً أبدياً. والفكُّ يمحو مصروفَها
                              بعينه فيرجع الصندوق كما كان — والمقفلةُ وحدها لا تُفَكّ. */}
                          {slip?.paid_at && run?.status !== "closed" && (
                            <Button size="sm" variant="secondary" leftIcon={<Undo2 size={14} />} disabled={busy}
                              data-payunpay={sid} onClick={() => unpay(slip)}>
                              {t("payroll.undoPay", "تراجع عن التسليم")}
                            </Button>
                          )}
                          {adjOf(sid).length > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {adjOf(sid).map((a) => {
                                const gone = (a.qty != null ? a.qty - a.reversed_qty : a.amount - a.reversed_amount) <= 0;
                                const part = !gone && (a.reversed_amount > 0 || a.reversed_qty > 0);
                                return (
                                  <span key={a.id} className={cn("chip text-2xs", gone
                                    ? "bg-surface-1 text-ink-subtle line-through"
                                    : part ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"
                                      : "bg-surface-1 text-ink-muted")}>
                                    {elLabel(a.code)}
                                    {!frozen && !gone && (
                                      <button aria-label={t("payroll.undoLine", "تراجع عن البند")}
                                        title={t("payroll.undoLine", "تراجع عن البند")}
                                        onClick={() => { playTap(); setUndoFor(a); }}><Undo2 size={12} /></button>
                                    )}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                          {!frozen && dirty && (
                            <span className="chip bg-warn-50 text-2xs text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
                              {t("payroll.recalcNeeded", "اضغط «إعادة الحساب» حتى تنحفظ")}
                            </span>
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
              <td className={cn(TF, STICKY, "z-30 text-start")}>
                {t("payroll.total", "المجموع")}
                <span className="block text-2xs font-normal text-ink-subtle">{t("payroll.headcount", "{{n}} موظف", { n: rows.length })}</span>
              </td>
              <td className={cn(TF, NUM, "text-xs text-ink-muted")}>{formatNum(sum((r) => r.base))}</td>
              {E.map((code) => <td key={code} className={cn(TF, NUM, "text-xs text-emerald-700 dark:text-emerald-400")}>{formatNum(sum((r) => aggOf(r.lines, code).amount))}</td>)}
              <td className={cn(TF, NUM, "text-xs")}>{formatNum(sum((r) => r.gross))}</td>
              {D.map((code) => <td key={code} className={cn(TF, NUM, "text-xs text-danger-600 dark:text-danger-400")}>{formatNum(sum((r) => aggOf(r.lines, code).amount))}</td>)}
              <td className={cn(TF, NUM, "text-xs text-danger-600 dark:text-danger-400")}>{formatNum(sum((r) => aggOf(r.lines, "ADV").amount))}</td>
              <td className={cn(TF, NUM, "text-xs text-danger-600 dark:text-danger-400")}>{formatNum(sum((r) => aggOf(r.lines, "LOAN").amount))}</td>
              <td className={cn(TF, NUM, "text-xs text-danger-600 dark:text-danger-400")}>{sum((r) => r.ded) > 0 ? <Neg v={sum((r) => r.ded)} /> : "—"}</td>
              <td className={cn(TF, NUM, "text-xs text-warn-700 dark:text-warn-300")}>{sum((r) => r.defer) > 0 ? formatNum(sum((r) => r.defer)) : "—"}</td>
              <td className={cn(TF, NUM, "text-xs text-brand-700 dark:text-brand-300")} data-paytotal="net">
                {formatNum(sum((r) => r.net))}
                {savedCount > 0 && <span className="block text-2xs font-normal text-ink-subtle">{t("payroll.paidOf", "مدفوع {{p}} من {{n}}", { p: paidCount, n: savedCount })}</span>}
              </td>
              <td className={cn(TF, STICKY_END, "z-30 p-1")}></td>
            </tr>
          </tfoot>
        </Sheet>
      )}

      {undoFor && (
        <UndoLineDialog
          adj={undoFor}
          onClose={() => setUndoFor(null)}
          onDone={async (msg) => { setUndoFor(null); toast.success(msg); await reload(); }}
        />
      )}

      {addFor && (
        <AddLineDialog
          member={addFor}
          onClose={() => setAddFor(null)}
          onAdd={async (line) => {
            try {
              await repo.addPayrollAdjustment(
                addFor.id, monthKey(period), line.code,
                line.amount ?? 0, line.qty ?? null, line.reason ?? null);
              setAddFor(null); playTap();
              await reload();
            } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
          }}
        />
      )}

      {drawFor && (
        <WithdrawalDialog
          member={drawFor}
          bounds={drawBounds(drawFor.id)}
          frozen={frozen}
          onClose={() => setDrawFor(null)}
          onDone={async () => { setDrawFor(null); toast.success(t("payroll.drawDone", "انسجّل السحب وانخصم من الصندوق")); await reload(); }}
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

/**
 * التراجع عن بند — كلَّه أو بعضَه.
 *
 * لا يُحذف الأصل. قطعٌ وقع ثم رُدّ حقيقتان، ومحوُ إحداهما يترك موظفاً يسأل بعد
 * ثلاثة أشهر «ليش انقطع مني؟» بلا جواب. فيبقى البند بمبلغه، ويُسجَّل معه ما
 * رُدّ منه، والنافذُ هو الفرق — تقرأ القسيمة القصّة كاملةً.
 */
function UndoLineDialog({ adj, onClose, onDone }: {
  adj: PayrollAdjustment; onClose: () => void; onDone: (msg: string) => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const elLabel = useElLabel();
  const byDays = adj.qty != null;
  const left = byDays ? (adj.qty ?? 0) - adj.reversed_qty : adj.amount - adj.reversed_amount;
  const [mode, setMode] = useState<"all" | "part">("all");
  const [part, setPart] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    let n: number | null = null;
    if (mode === "part") {
      n = Number(part);
      if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("payroll.badAmount", "المبلغ غير صحيح")); return; }
      // الردُّ فوق الباقي ليس ردّاً بل زيادة — والخادم يرفضه، فنقوله هنا بوضوح.
      if (n > left) { playWarning(); toast.error(t("payroll.undoOverLeft", "أكبر من الباقي — أقصى ما يُردّ {{v}}", { v: formatNum(left) })); return; }
    }
    setBusy(true);
    try {
      await repo.reversePayrollAdjustment(adj.id, byDays ? null : n, byDays ? n : null, reason.trim() || null);
      playSuccess();
      await onDone(mode === "all"
        ? t("payroll.undoneAll", "انردّ البند كاملاً — أعد حساب الدورة حتى ينعكس")
        : t("payroll.undonePart", "انردّ جزءٌ من البند — أعد حساب الدورة حتى ينعكس"));
    } catch (e) {
      playWarning(); toast.error(String((e as Error).message ?? e));
    } finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={t("payroll.undoLineTitle", "تراجع عن {{n}}", { n: elLabel(adj.code) })}>
      <div className="space-y-3">
        <p className="rounded-xl bg-surface-2 p-2.5 text-xs leading-relaxed text-ink-muted">
          {byDays
            ? t("payroll.undoLeftDays", "الباقي بلا ردّ: {{v}} يوم", { v: formatNum(left) })
            : t("payroll.undoLeftAmount", "الباقي بلا ردّ: {{v}}", { v: formatNum(left) })}
          {adj.reason && <span className="mt-1 block text-ink-subtle">{t("payroll.reason", "السبب")}: {adj.reason}</span>}
        </p>

        <div className="flex gap-2">
          <button className={cn("flex-1 rounded-xl border px-3 py-2 text-sm transition",
            mode === "all" ? "border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted")}
            data-payundoall onClick={() => { playTap(); setMode("all"); }}>
            {t("payroll.undoAll", "ردّ كامل")}
          </button>
          <button className={cn("flex-1 rounded-xl border px-3 py-2 text-sm transition",
            mode === "part" ? "border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-muted")}
            data-payundopart onClick={() => { playTap(); setMode("part"); }}>
            {t("payroll.undoPart", "ردّ جزء")}
          </button>
        </div>

        {mode === "part" && (
          <div>
            <label className="label">{byDays ? t("payroll.days", "عدد الأيام") : t("payroll.amount", "المبلغ")}</label>
            <AmountInput value={part} onChange={setPart} hook="undopart" />
          </div>
        )}

        <div>
          <label className="label">{t("payroll.undoReason", "سبب التراجع")}</label>
          <input className="input" value={reason} data-payundoreason
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("payroll.reasonOpt", "اختياري")} />
        </div>

        <Button className="w-full" loading={busy} onClick={() => void submit()} data-payundodo>
          {t("payroll.undoDo", "نفّذ التراجع")}
        </Button>
      </div>
    </Dialog>
  );
}

function AddLineDialog({ member, onClose, onAdd }: {
  member: StaffMember; onClose: () => void; onAdd: (l: LineInput) => void | Promise<void>;
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

/* ── السحب على حساب الشهر ────────────────────────────────────────────────────
 * الفلوس تخرج من الدرج **الآن** (تُسجَّل مصروفاً لحظتَها) وتُقطع كاملةً من
 * راتب هذا الشهر خارج سقف الاستقطاع. ما لا يسعه الراتب يبقى على السحب ويُقطع
 * الشهر الجاي — فلا تفشل الدورة ولا يضيع دينار.
 *
 * حدّان: فوق **الأجر المستحقّ** (الإجمالي − أيامٌ لم تُعمَل − سحوبٌ قائمة)
 * يُمنع — ما يمكن قطعُه لا يجوز صرفُه على أنه راتب؛ وفوق **الصافي المتوقّع**
 * يُنبَّه فقط — الزائد يترحّل، وهو قرارُ المدير. */
function WithdrawalDialog({ member, staffOptions, bounds, frozen, onClose, onDone }: {
  member: StaffMember | null;
  staffOptions?: StaffMember[];
  bounds?: { net: number; maxCollectible: number };
  frozen?: boolean;
  onClose: () => void;
  onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [sid, setSid] = useState(member?.id ?? staffOptions?.[0]?.id ?? "");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<PayMethod>("cash");
  const [busy, setBusy] = useState(false);
  const n = Number(amount);
  const name = member?.name ?? staffOptions?.find((s) => s.id === sid)?.name ?? "";
  const overGross = !!bounds && n > bounds.maxCollectible;
  const overNet = !!bounds && !overGross && n > bounds.net;

  const submit = async () => {
    if (!sid) return;
    if (!Number.isFinite(n) || n <= 0) { playWarning(); toast.error(t("payroll.badAmount", "المبلغ غير صحيح")); return; }
    if (overGross) { playWarning(); toast.error(t("payroll.drawOverGross", "أكبر من أجره المستحقّ هذا الشهر — ما يمكن قطعه")); return; }
    setBusy(true);
    try {
      await repo.disburseAdvance(sid, name, n, reason.trim() || null, method);
      playSuccess();
      await onDone();
    } catch (e) { playWarning(); toast.error(String((e as Error).message ?? e)); }
    finally { setBusy(false); }
  };

  return (
    <Dialog open onClose={onClose} title={member ? t("payroll.drawTitle", "سحب على حساب راتب {{n}}", { n: member.name }) : t("payroll.draw", "سحب")}>
      <div className="space-y-3">
        {!member && staffOptions && (
          <div>
            <label className="label">{t("payroll.employee", "الموظف")}</label>
            <select className="input" value={sid} onChange={(e) => setSid(e.target.value)} data-paydrawstaff>
              {staffOptions.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <p className="rounded-xl bg-surface-2 p-2.5 text-2xs leading-relaxed text-ink-muted">
          {t("payroll.drawHint", "الفلوس تطلع من الصندوق الآن وتنقطع كاملة من راتب هذا الشهر — خارج سقف الاستقطاع.")}
        </p>
        <div>
          <label className="label">{t("payroll.drawAmount", "المبلغ المسحوب")}</label>
          <AmountInput value={amount} onChange={setAmount} placeholder={currencySymbol()} hook="draw" />
          {bounds && (
            <p className="mt-1.5 text-xs text-ink-subtle" data-paydrawnet>{t("payroll.drawNet", "صافيه المتوقّع هذا الشهر: {{v}}", { v: money(bounds.net) })}</p>
          )}
          {overGross && (
            <p className="mt-1.5 text-xs font-semibold text-danger-600 dark:text-danger-400">{t("payroll.drawOverGross", "أكبر من أجره المستحقّ هذا الشهر — ما يمكن قطعه")}</p>
          )}
          {overNet && (
            <p className="mt-1.5 text-xs font-semibold text-warn-700 dark:text-warn-300">{t("payroll.drawOverNet", "أكبر من صافيه — الزائد يترحّل للشهر الجاي")}</p>
          )}
          {frozen && (
            <p className="mt-1.5 text-xs text-ink-muted">{t("payroll.drawFrozen", "دورة هذا الشهر معتمدة — ينقطع من دورة الشهر الجاي")}</p>
          )}
        </div>
        <div>
          <label className="label">{t("payroll.reason", "السبب")}</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} data-paydrawreason
            placeholder={t("payroll.reasonOpt", "اختياري")} />
        </div>
        <div>
          <label className="label">{t("payroll.method", "من وين تطلع الفلوس")}</label>
          <Segmented<PayMethod>
            layoutId="draw-method" value={method} onChange={setMethod}
            options={[
              { value: "cash", label: t("payroll.cash", "نقد الصندوق") },
              { value: "bank", label: t("payroll.bank", "حوالة") },
            ]}
          />
        </div>
        <Button className="w-full" disabled={busy || overGross} onClick={submit} data-paydrawsave>
          {t("payroll.drawConfirm", "اصرف السحب")}
        </Button>
      </div>
    </Dialog>
  );
}

/* ── ٣) السلف والسحوبات ─────────────────────────────────────────────────── */

function LoansTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const { staff, loans, loading, reload } = usePayrollData();
  const [openNew, setOpenNew] = useState(false);
  const [openDraw, setOpenDraw] = useState(false);

  const real = loans.filter((l) => !isAdvance(l));
  const draws = loans.filter(isAdvance);
  const active = real.filter((l) => l.status === "active");
  const done = real.filter((l) => l.status !== "active");
  const outstandingLoans = active.reduce((s, l) => s + l.remaining, 0);
  const outstandingDraws = draws.filter((l) => l.status === "active").reduce((s, l) => s + l.remaining, 0);

  return (
    <div data-payloans>
      <div className="card mb-4 flex flex-wrap items-center gap-3 p-4">
        <div>
          <p className="text-2xs font-semibold text-ink-muted">{t("payroll.outstanding", "الذمم القائمة")}</p>
          <p className="font-display text-xl font-extrabold tabular-nums text-ink" data-payoutstanding>{money(outstandingLoans + outstandingDraws)}</p>
          {outstandingDraws > 0 && (
            <p className="text-2xs text-ink-subtle">{t("payroll.outstandingSplit", "سلف {{a}} · سحوبات {{b}}", { a: money(outstandingLoans), b: money(outstandingDraws) })}</p>
          )}
        </div>
        <div className="ms-auto flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" leftIcon={<HandCoins size={15} />} data-paydrawnew
            disabled={!staff.length} onClick={() => { playTap(); setOpenDraw(true); }}>
            {t("payroll.draw", "سحب")}
          </Button>
          <Button size="sm" leftIcon={<Plus size={15} />} data-payloannew
            onClick={() => { playTap(); setOpenNew(true); }}>
            {t("payroll.newLoan", "صرف سلفة")}
          </Button>
        </div>
      </div>

      <p className="mb-4 rounded-2xl border border-line bg-surface-2 p-3 text-xs leading-relaxed text-ink-muted">
        {t("payroll.loanNote", "السلفة ذمّة على الموظف لا كلفة رواتب: تنقص الصندوق يوم صرفها، وتُسترجع أقساطاً من قسيمته. ولهذا ما تنحسب مرّتين على أرباحك.")}
      </p>

      {loading ? <p className="text-sm text-ink-muted">{t("common.loading", "…جاري التحميل")}</p>
        : !loans.length ? (
          <EmptyState icon={<HandCoins size={26} />} title={t("payroll.noLoans", "ما أكو سلف")}
            description={t("payroll.noLoansHint", "لمّا تصرف سلفة تظهر هنا مع أقساطها والباقي منها.")} />
        ) : (
          <div className="space-y-5">
            {real.length > 0 && (
              <div>
                {draws.length > 0 && <h3 className="mb-2 text-sm font-bold text-ink">{t("payroll.loansTitle", "السلف")}</h3>}
                <Sheet minW={920} hook="loans">
                  <thead>
                    <tr>
                      <th className={cn(TH, "start-0 z-30 text-start")}>{t("payroll.employee", "الموظف")}</th>
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
                      <LoanRowView key={l.id} loan={l} name={nameOf(staff, l.staff_id)} onChanged={reload} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={cn(TF, STICKY, "z-30 text-start")}>{t("payroll.outstanding", "الذمم القائمة")}</td>
                      <td className={TF} colSpan={3}></td>
                      <td className={cn(TF, NUM, "text-warn-700 dark:text-warn-300")}>{money(outstandingLoans)}</td>
                      <td className={TF} colSpan={4}></td>
                    </tr>
                  </tfoot>
                </Sheet>
              </div>
            )}

            {draws.length > 0 && (
              <div data-paydraws>
                <h3 className="mb-2 text-sm font-bold text-ink">{t("payroll.drawsTitle", "السحوبات")}</h3>
                <Sheet minW={760} hook="draws">
                  <thead>
                    <tr>
                      <th className={cn(TH, "start-0 z-30 text-start")}>{t("payroll.employee", "الموظف")}</th>
                      <th className={cn(TH, "text-start")}>{t("payroll.drawDate", "التاريخ")}</th>
                      <th className={cn(TH, "text-end")}>{t("payroll.amount", "المبلغ")}</th>
                      <th className={cn(TH, "text-end")}>{t("payroll.drawTakenCol", "المقطوع")}</th>
                      <th className={cn(TH, "text-end")}>{t("payroll.remaining", "الباقي")}</th>
                      <th className={cn(TH, "text-start")}>{t("payroll.reason", "السبب")}</th>
                      <th className={cn(TH, "text-start")}>{t("payroll.state", "الحالة")}</th>
                      <th className={cn(TH, "w-px")}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...draws.filter((l) => l.status === "active"), ...draws.filter((l) => l.status !== "active")].map((l) => (
                      <DrawRowView key={l.id} loan={l} name={nameOf(staff, l.staff_id)} onChanged={reload} />
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <td className={cn(TF, STICKY, "z-30 text-start")}>{t("payroll.total", "المجموع")}</td>
                      <td className={TF} colSpan={3}></td>
                      <td className={cn(TF, NUM, "text-warn-700 dark:text-warn-300")}>{money(outstandingDraws)}</td>
                      <td className={TF} colSpan={3}></td>
                    </tr>
                  </tfoot>
                </Sheet>
              </div>
            )}
          </div>
        )}

      {openNew && (
        <NewLoanDialog
          staff={staff}
          onClose={() => setOpenNew(false)}
          onDone={async () => { setOpenNew(false); toast.success(t("payroll.loanDone", "انصرفت السلفة وانسجّلت الذمّة")); await reload(); }}
        />
      )}
      {openDraw && (
        <WithdrawalDialog
          member={null}
          staffOptions={staff}
          onClose={() => setOpenDraw(false)}
          onDone={async () => { setOpenDraw(false); toast.success(t("payroll.drawDone", "انسجّل السحب وانخصم من الصندوق")); await reload(); }}
        />
      )}
    </div>
  );
}

/** زرّ الشطب وحواره — للسلفة والسحب معاً. الحوار داخل الخلية: <tr> لا يقبل إلا خلايا. */
function WriteOffCell({ loan, title, onChanged }: { loan: StaffLoan; title: string; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [wo, setWo] = useState(false);
  const [note, setNote] = useState("");
  return (
    <td className={cn(TD, "p-1")}>
      {loan.status === "active" && (
        <Button size="sm" variant="ghost" data-paywriteoff={loan.id}
          onClick={() => { playTap(); setWo(true); }}>{t("payroll.writeOff", "شطب")}</Button>
      )}
      {wo && (
        <Dialog open onClose={() => setWo(false)} title={title}>
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
  );
}

function LoanRowView({ loan, name, onChanged }: { loan: StaffLoan; name: string; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
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
      <WriteOffCell loan={loan} title={t("payroll.writeOffTitle", "شطب السلفة")} onChanged={onChanged} />
    </tr>
  );
}

function DrawRowView({ loan, name, onChanged }: { loan: StaffLoan; name: string; onChanged: () => Promise<void> }) {
  const { t } = useTranslation();
  const taken = Math.max(0, loan.principal - loan.remaining);
  const stateLabel = loan.status === "active" ? t("payroll.drawPending", "ينقطع بالدورة الجاية")
    : loan.status === "settled" ? t("payroll.drawTaken", "انقطع") : t("payroll.writtenOff", "مشطوبة");

  return (
    <tr className={cn(TR, loan.status !== "active" && "opacity-70")} data-paydraw-row={loan.id}>
      <td className={cn(TD, STICKY, "font-semibold text-ink")}>{name}</td>
      <td className={cn(TD, "text-2xs text-ink-muted")}>{loan.started_on}</td>
      <td className={cn(TD, NUM)}>{money(loan.principal)}</td>
      <td className={cn(TD, NUM, "text-emerald-700 dark:text-emerald-400")}>{taken > 0 ? money(taken) : "—"}</td>
      <td className={cn(TD, NUM, "font-bold", loan.status === "active" && loan.remaining > 0 && "text-warn-700 dark:text-warn-300")} data-paydrawleft={loan.id}>
        {money(loan.remaining)}
      </td>
      <td className={cn(TD, "max-w-[14rem] truncate text-2xs text-ink-subtle")}>{loan.reason ?? "—"}</td>
      <td className={cn(TD, "text-2xs")}>
        <span className={cn("chip text-2xs", loan.status === "active"
          ? "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300"
          : loan.status === "settled" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300"
          : "bg-surface-2 text-ink-muted")}>{stateLabel}</span>
      </td>
      <WriteOffCell loan={loan} title={t("payroll.writeOffDrawTitle", "شطب السحب")} onChanged={onChanged} />
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
