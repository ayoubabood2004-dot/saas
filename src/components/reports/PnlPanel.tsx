/* ============================================================================
 * «الأرباح والخسائر» — تبويبٌ بالتقارير (0256): شهرٌ بعمود، والسطورُ من report_pnl كما هي.
 *
 * القاعدةُ تجمع والمتصفّحُ يعرض (0149): لا فاتورةَ ولا سحبَ يُجلب هنا — نداءٌ واحد بمدّة الصفحة (من/إلى) وتوقيت
 * الجهاز (saleTz)، وبابُه كسول (pnlApi) فلا يدفعه الإقلاع. ولا رقمَ يُحسب هنا: كلُّ خليّةٍ رقمُ الخادم كما وصل.
 *
 * ولا تقريرَ عن خطأ: الجلبُ بمهلة، وفشلُه أو مهلتُه «أعد المحاولة» بسببه — صافٍ بأصفارٍ عن تقريرٍ لم يصل يُصدَّق.
 * والجوابُ الأحدثُ وحده يُرسم (مدّةٌ تبدّلت والأولى بالطريق).
 *
 * والسطورُ بتعريفها القائم (الرأسُ بـsrc/lib/pnl.ts): ربحُ المبيعات هو «صافي الربح» بتبويب المال، والسحوباتُ
 * بجداولها كما بتبويب المصروفات — ويُخفى سطرٌ صفرٌ بكلّ عمود، إلا المبيعاتِ والكلفةَ والربحَ والصافي.
 * ==========================================================================*/
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Skeleton, Button } from "@/components/ui";
import { money, formatNum, cn, dateLocale } from "@/lib/utils";
import { describeDbError, withTimeout } from "@/lib/errors";
import { saleTz } from "@/lib/saleDate";
import type { PnlReport, PnlTotals } from "@/lib/pnlApi";

/** مهلةُ التقرير: نداءٌ واحدٌ يجمع مدّةً كاملة بالقاعدة — أطولُ من مهلة القراءات القصيرة، ولا بلا حدّ. */
const PNL_MS = 20_000;
/** رفوضُ report_pnl التي لا تتغيّر بالإعادة. */
const FINAL = new Set(["pnl_range", "pnl_range_long", "pnl_forbidden"]);

type State = { k: "loading" } | { k: "failed"; e: unknown } | { k: "ok"; r: PnlReport };

interface Line {
  key: string;
  label: string;
  value: (x: PnlTotals) => number;
  /** sum: سطرٌ جامع (عريض بخطٍّ فوقه)؛ cost: كلفةٌ بمسافةٍ وبلونٍ خافت (والرقمُ رقمُها كما هو — اسمُ السطر يقول إنه
   *  كلفة، وقلبُ إشارته كان يرسم «−0» لكلفةٍ تُقرَّب لصفر)؛ adj: تسويةٌ بإشارتها. */
  kind: "sum" | "cost" | "adj" | "plain";
  /** يبقى ولو كان صفراً بكلّ عمود. */
  always?: boolean;
}

/** `shiftActive`: فلترُ ساعات الدوام (خيارات متقدمة) مفعَّلٌ بالصفحة — يحصر تبويبَ المال بساعاتٍ والتقريرُ للأيام كاملة،
 *  فـ«هو نفس صافي الربح» لا تصحّ حينها وتُقال. */
export function PnlPanel({ from, to, rangeLabel, shiftActive = false }: { from: string; to: string; rangeLabel: string; shiftActive?: boolean }) {
  const { t, i18n } = useTranslation();
  const [state, setState] = useState<State>({ k: "loading" });
  const [tick, setTick] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    const my = ++seq.current;
    setState({ k: "loading" });
    withTimeout(import("@/lib/pnlApi").then((m) => m.pnlApi.report(from, to, saleTz())), PNL_MS).then(
      (r) => { if (my === seq.current) setState({ k: "ok", r }); },
      (e) => { if (my === seq.current) setState({ k: "failed", e }); },
    );
  }, [from, to, tick]);

  if (state.k === "loading") {
    return (
      <div className="card space-y-3 p-5" data-pnl-loading>
        <Skeleton className="h-6 w-48 rounded-lg" />
        {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-8 rounded-lg" />)}
      </div>
    );
  }
  if (state.k === "failed") {
    return (
      <div role="alert" className="card flex items-start gap-2.5 p-5" data-pnl-failed>
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger-600" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-ink">{t("pnl.loadFailed", "ما گدرنا نجيب تقرير الأرباح والخسائر")}</p>
          <p className="mt-1 break-words text-xs text-ink-muted">{describeDbError(state.e, t)}</p>
        </div>
        {/* رفضٌ لا تغيّره الإعادة (مدّةٌ مقلوبة أو أطول من الحدّ، أو بلا إذن): التلميحُ يقول ما يُفعل، وزرُّ إعادةٍ يناقضه. */}
        {!FINAL.has((state.e as { message?: string } | null)?.message ?? "") && (
          <Button variant="secondary" leftIcon={<RefreshCw size={15} />} onClick={() => setTick((n) => n + 1)}>{t("common.retry", "إعادة المحاولة")}</Button>
        )}
      </div>
    );
  }

  const { months, total } = state.r;
  const monthFmt = new Intl.DateTimeFormat(dateLocale(i18n.language), { month: "long", year: "numeric", timeZone: "UTC" });
  const cols: { key: string; label: string; x: PnlTotals }[] = [
    ...months.map((m) => ({ key: m.month, label: monthFmt.format(new Date(`${m.month}-15T12:00:00Z`)), x: m as PnlTotals })),
    ...(months.length > 1 ? [{ key: "total", label: t("pnl.total", "المجموع"), x: total }] : []),
  ];

  const catName = new Map(total.categories.map((c) => [c.id, c.name]));
  const catAmount = (x: PnlTotals, id: string) => x.categories.find((c) => c.id === id)?.amount ?? 0;
  const lines: Line[] = [
    { key: "revenue", label: t("pnl.revenue", "المبيعات"), value: (x) => x.revenue, kind: "plain", always: true },
    { key: "cogs_products", label: t("pnl.cogsProducts", "كلفة المواد المباعة"), value: (x) => x.cogs_products, kind: "cost", always: true },
    { key: "cogs_materials", label: t("pnl.cogsMaterials", "مستهلكات الخدمات"), value: (x) => x.cogs_materials, kind: "cost", always: true },
    { key: "cogs_other", label: t("pnl.cogsOther", "كلفة الخدمات الثابتة وغيرها"), value: (x) => x.cogs_other, kind: "cost" },
    { key: "adjust", label: t("pnl.adjust", "تسويات فواتير قديمة"), value: (x) => x.adjust, kind: "adj" },
    { key: "gross", label: t("pnl.gross", "ربح المبيعات"), value: (x) => x.gross, kind: "sum", always: true },
    { key: "fx", label: t("pnl.fx", "فرق سعر الصرف"), value: (x) => x.fx ?? 0, kind: "adj" },
    { key: "stock_loss", label: t("pnl.stockLoss", "خسائر التلف والجرد"), value: (x) => x.stock_loss, kind: "cost" },
    { key: "returns", label: t("pnl.returns", "مرتجعات بلا فاتورة"), value: (x) => x.returns, kind: "cost" },
    { key: "payroll", label: t("pnl.payroll", "رواتب"), value: (x) => x.payroll, kind: "cost" },
    { key: "payroll_loan", label: t("pnl.payrollLoan", "سُلف الموظفين"), value: (x) => x.payroll_loan, kind: "cost" },
    ...total.categories.map((c): Line => ({
      key: `cat:${c.id}`, label: catName.get(c.id) ?? t("pnl.deletedCategory", "تصنيف محذوف"),
      value: (x) => catAmount(x, c.id), kind: "cost",
    })),
    { key: "uncategorized", label: t("pnl.uncategorized", "سحوبات بدون تصنيف"), value: (x) => x.uncategorized, kind: "cost" },
    { key: "expenses", label: t("pnl.expenses", "مجموع المصاريف"), value: (x) => x.expenses, kind: "sum" },
    { key: "net", label: t("pnl.net", "الصافي"), value: (x) => x.net, kind: "sum", always: true },
  ];
  const shown = lines.filter((l) => l.always || cols.some((c) => l.value(c.x) !== 0));
  const has = (key: string) => shown.some((l) => l.key === key);

  return (
    <div className="card p-5" data-pnl>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-base font-bold text-ink">{t("pnl.title", "الأرباح والخسائر — شهر بشهر")}</h2>
        <span className="text-xs text-ink-subtle">{rangeLabel}</span>
      </div>
      {months.length === 0 ? (
        <p className="rounded-xl bg-surface-2 p-4 text-center text-sm text-ink-muted" data-pnl-empty>{t("pnl.empty", "ماكو مبيعات ولا مصاريف بهالفترة")}</p>
      ) : (
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-max border-collapse text-sm" data-pnl-table>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className="sticky start-0 z-10 bg-surface-1 py-2 pe-4 text-start text-xs font-semibold text-ink-muted">{t("pnl.line", "البند")}</th>
                {cols.map((c) => (
                  <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 text-end text-xs font-semibold", c.key === "total" ? "text-ink" : "text-ink-muted")}>{c.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((l) => (
                <tr key={l.key} data-pnl-row={l.key} className={cn(l.kind === "sum" && "border-t border-line-strong", l.key === "net" && "bg-surface-2")}>
                  <th scope="row" className={cn("sticky start-0 z-10 py-2 pe-4 text-start font-normal", l.key === "net" ? "bg-surface-2" : "bg-surface-1",
                    l.kind === "sum" ? "font-bold text-ink" : "text-ink-muted", l.kind === "cost" && "ps-3")}>
                    {l.label}
                    {l.key === "revenue" && cols.length > 0 && (
                      <span className="block text-2xs font-normal text-ink-subtle">{t("pnl.invoicesN", { n: formatNum(total.invoices), defaultValue: "{{n}} فاتورة" })}</span>
                    )}
                  </th>
                  {cols.map((c) => {
                    const v = l.value(c.x);
                    return (
                      <td key={c.key} className={cn("whitespace-nowrap px-3 py-2 text-end tabular-nums",
                        l.kind === "sum" && "font-bold", c.key === "total" && "font-semibold",
                        l.key === "net" ? (v < 0 ? "text-danger-600" : "text-success-700") : l.kind === "cost" ? "text-ink-muted" : "text-ink")}>
                        {/* عزلٌ يساريّ: الرقمُ والإشارةُ والعملةُ معاً — بسياقٍ يمينيّ كانت الإشارةُ السالبة تنزاح لطرف الخليّة. */}
                        <bdi dir="ltr">{money(v)}</bdi>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <ul className="mt-4 list-disc space-y-1 ps-5 text-2xs leading-relaxed text-ink-subtle" data-pnl-notes>
        <li>{t("pnl.basis", "الأرقام حسب يوم البيع (مو يوم وصول الفلوس)، والفواتير المرجّعة ما تنحسب. «ربح المبيعات» هو نفس «صافي الربح» بتبويب المال.")}</li>
        {shiftActive && <li className="font-semibold text-warn-700 dark:text-warn-300" data-pnl-note-shift>{t("pnl.noteShift", "فلتر ساعات الدوام (خيارات متقدمة) ما ينطبق هنا: التقرير للأيام كاملة، فـ«ربح المبيعات» ممكن يختلف عن تبويب المال هسّه.")}</li>}
        <li>{t("pnl.notePurchases", "المشتريات ما تنطرح هنا: تدخل المخزن، وكلفتها تنحسب لمّا تنباع أو تنصرف بخدمة.")}</li>
        {has("returns") && <li data-pnl-note-returns>{t("pnl.noteReturns", "مرتجعات بلا فاتورة: الفلوس رجعت للزبون والبضاعة رجعت للرف، وكلفتها ما مسجّلة — فالخسارة الحقيقية أقل من هالرقم.")}</li>}
        {has("payroll_loan") && <li data-pnl-note-loans>{t("pnl.noteLoans", "السُّلف تنحسب يوم تنصرف، وتنقطع من الرواتب بعدين فالرواتب تنزل بقدرها.")}</li>}
        {has("fx") && <li data-pnl-note-fx>{t("pnl.noteFx", "فرق سعر الصرف: ديون الدولار لمّا تنسدّ بالدينار بسعر غير سعر يوم البيع — زايد ربح وناقص خسارة، بيوم التسديد.")}</li>}
        {has("adjust") && <li data-pnl-note-adjust>{t("pnl.noteAdjust", "تسويات فواتير قديمة: فواتير ربحها المسجّل ما يساوي سعرها ناقص كلفتها.")}</li>}
      </ul>
    </div>
  );
}
