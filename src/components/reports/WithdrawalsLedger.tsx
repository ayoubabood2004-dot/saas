import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Printer, Banknote, CreditCard, Landmark } from "lucide-react";
import type { Expense, ExpenseMethod } from "@/types";
import { Button } from "@/components/ui";
import { cn, money, formatNum, dateLocale, localISO } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { getClinicName, getClinicLogo } from "@/lib/settings";

/* ============================================================================
 * دفترُ السحوبات — نفسُ صفوف المصروفات، بعينِ محاسبٍ لا بعينِ قائمة.
 *
 * القائمةُ تجيب عن «شنو انسحب؟». والدفترُ يجيب عن السؤال الذي يليه دائماً:
 * «وشكد صار المجموع لهذا اليوم؟ وشكد وصلنا لحدّ هنا؟». ولذلك ثلاثةُ أشياء
 * تصنع الفرق: القيدُ مرقَّم، والصفوفُ مجمَّعةٌ بيومها ولكلِّ يومٍ مجموعُه،
 * والرصيدُ يتراكم سطراً سطراً حتى الختام.
 *
 * والترتيبُ **تصاعديّ** خلافاً للقائمة: الرصيدُ المتراكم لا معنى له نازلاً
 * من الأحدث — الدفترُ يُقرأ من أوّل المدّة إلى آخرها كما يُكتب.
 * ==========================================================================*/

export const METHOD_ICON: Record<ExpenseMethod, typeof Banknote> = {
  cash: Banknote, card: CreditCard, bank: Landmark,
};
const methodOf = (e: Expense): ExpenseMethod => e.method ?? "cash";

interface LedgerRow {
  e: Expense;
  no: number;      // رقم القيد داخل المدّة
  running: number; // الرصيد المتراكم بعد هذا القيد
}
interface LedgerDay {
  day: string;     // مفتاح اليوم (ISO)
  rows: LedgerRow[];
  dayTotal: number;
  /** الرصيد المتراكم عند إقفال اليوم — «المرحّل» لليوم الذي يليه. */
  carried: number;
}

/** يبني الأيام مرتَّبةً تصاعدياً مع الترقيم والرصيد المتراكم. */
function buildDays(rows: Expense[]): { days: LedgerDay[]; total: number } {
  const asc = rows.slice().sort((a, b) =>
    (a.spent_at || "").localeCompare(b.spent_at || "")
    || (a.created_at || "").localeCompare(b.created_at || ""));
  const days: LedgerDay[] = [];
  let running = 0;
  let no = 0;
  for (const e of asc) {
    // اليومُ **المحليّ** لا أوّلُ عشرةِ أحرفٍ من ISO: تلك تاريخُ UTC، وقيدٌ
    // سُجّل بعد التاسعة مساءً بغداد يقع بيوم الأمس عندها. والقائمةُ تعرضه
    // بيومه المحليّ — فالمجموعُ باليوم كان سيخالف السطرَ الظاهر فوقه.
    const day = localISO(new Date(e.spent_at));
    let d = days[days.length - 1];
    if (!d || d.day !== day) {
      d = { day, rows: [], dayTotal: 0, carried: running };
      days.push(d);
    }
    running = Math.round((running + e.amount) * 100) / 100;
    no += 1;
    d.rows.push({ e, no, running });
    d.dayTotal = Math.round((d.dayTotal + e.amount) * 100) / 100;
    d.carried = running;
  }
  return { days, total: running };
}

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function WithdrawalsLedger({ rows, rangeLabel, methodLabel }: {
  rows: Expense[];
  rangeLabel: string;
  /** تسميةُ الطريقة تُمرَّر من الشاشة الأم — مصدرُ التسميات واحد لا اثنان. */
  methodLabel: (m: ExpenseMethod) => string;
}) {
  const { t, i18n } = useTranslation();
  const { days, total } = useMemo(() => buildDays(rows), [rows]);

  const fmtDay = (iso: string) =>
    new Date(iso + "T12:00:00").toLocaleDateString(dateLocale(i18n.language), {
      weekday: "long", day: "2-digit", month: "long", year: "numeric",
    });

  /* الطباعة: صفحةٌ قائمةٌ بذاتها تُبنى هنا لا بملفٍّ مستقلّ — نصوصُها تمرّ من
   * `t` فتخرج بلغة العيادة، وملفُّ طباعةٍ منفصلٌ كان سيحتاج تمريرَ المترجم
   * إليه على أي حال. */
  const print = () => {
    playTap();
    const clinic = getClinicName() || "doctorVet";
    const logo = getClinicLogo();
    const head = [
      t("rpt.exp.ledger.no", "القيد"),
      t("rpt.exp.desc", "البيان"),
      t("rpt.exp.category", "التصنيف"),
      t("rpt.exp.methodLabel", "طريقة السحب"),
      t("rpt.exp.amount", "المبلغ"),
      t("rpt.exp.ledger.running", "الرصيد المتراكم"),
    ];
    const body = days.map((d) => {
      const cells = d.rows.map((r) => `<tr>
        <td class="c">${formatNum(r.no)}</td>
        <td>${esc(r.e.description || "—")}</td>
        <td>${esc(r.e.category || "—")}</td>
        <td>${esc(methodLabel(methodOf(r.e)))}</td>
        <td class="n">${esc(money(r.e.amount))}</td>
        <td class="n b">${esc(money(r.running))}</td>
      </tr>`).join("");
      return `<tr class="day"><td colspan="4">${esc(fmtDay(d.day))}</td>
        <td class="n">${esc(money(d.dayTotal))}</td>
        <td class="n">${esc(money(d.carried))}</td></tr>${cells}`;
    }).join("");

    const html = `<!doctype html><html dir="rtl" lang="${i18n.language}"><head><meta charset="utf-8">
<title>${esc(t("rpt.exp.ledger.title", "دفتر السحوبات"))}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: "Segoe UI", Tahoma, sans-serif; color: #0f172a; font-size: 12px; }
  .head { display: flex; align-items: center; gap: 10px; border-bottom: 2px solid #0f172a; padding-bottom: 8px; margin-bottom: 10px; }
  .head img { height: 44px; width: 44px; object-fit: contain; border-radius: 8px; }
  .head .c { font-size: 17px; font-weight: 800; }
  .head .t { font-size: 12px; color: #475569; }
  .head .r { margin-inline-start: auto; text-align: left; font-size: 11px; color: #475569; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #cbd5e1; padding: 5px 7px; text-align: start; }
  th { background: #f1f5f9; font-size: 11px; }
  td.n, th.n { text-align: end; font-variant-numeric: tabular-nums; white-space: nowrap; }
  td.c { text-align: center; width: 34px; color: #64748b; }
  td.b { font-weight: 700; }
  tr.day td { background: #f8fafc; font-weight: 700; font-size: 11px; }
  tfoot td { background: #0f172a; color: #fff; font-weight: 800; font-size: 13px; }
  .sign { margin-top: 22px; display: flex; gap: 40px; font-size: 11px; color: #475569; }
  .sign div { flex: 1; border-top: 1px solid #94a3b8; padding-top: 5px; }
</style></head><body>
<div class="head">
  ${logo ? `<img src="${esc(logo)}" alt="">` : ""}
  <div><div class="c">${esc(clinic)}</div><div class="t">${esc(t("rpt.exp.ledger.title", "دفتر السحوبات"))}</div></div>
  <div class="r">${esc(rangeLabel)}<br>${esc(new Date().toLocaleString(dateLocale(i18n.language)))}</div>
</div>
<table>
  <thead><tr>${head.map((h, i) => `<th class="${i >= 4 ? "n" : ""}">${esc(h)}</th>`).join("")}</tr></thead>
  <tbody>${body || `<tr><td colspan="6">${esc(t("rpt.exp.empty", "لا توجد مصروفات في هذه الفترة."))}</td></tr>`}</tbody>
  <tfoot><tr><td colspan="4">${esc(t("rpt.exp.ledger.closing", "الإقفال — مجموع السحوبات"))}</td>
    <td class="n">${esc(money(total))}</td><td class="n">${esc(money(total))}</td></tr></tfoot>
</table>
<div class="sign"><div>${esc(t("rpt.exp.ledger.preparedBy", "أعدّه"))}</div><div>${esc(t("rpt.exp.ledger.approvedBy", "صادق عليه"))}</div></div>
</body></html>`;

    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    // الطباعةُ بعد رسمةٍ واحدة: نداؤها فوراً يطبع صفحةً بلا شعارٍ ولا خطوط.
    setTimeout(() => w.print(), 250);
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-ink-subtle">
          {t("rpt.exp.ledger.hint", "مرتّب من أقدم يوم لأحدثه — كل قيد برقمه ورصيده المتراكم.")}
        </p>
        <Button size="sm" variant="secondary" leftIcon={<Printer size={15} />} onClick={print}>
          {t("rpt.exp.ledger.print", "طباعة الدفتر")}
        </Button>
      </div>

      {days.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-subtle">{t("rpt.exp.empty", "لا توجد مصروفات في هذه الفترة.")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-line">
          <table className="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr className="bg-surface-2 text-2xs text-ink-muted">
                <th className="w-12 px-2 py-2 text-center font-bold">{t("rpt.exp.ledger.no", "القيد")}</th>
                <th className="px-3 py-2 text-start font-bold">{t("rpt.exp.desc", "البيان")}</th>
                <th className="px-3 py-2 text-start font-bold">{t("rpt.exp.methodLabel", "طريقة السحب")}</th>
                <th className="px-3 py-2 text-end font-bold">{t("rpt.exp.amount", "المبلغ")}</th>
                <th className="px-3 py-2 text-end font-bold">{t("rpt.exp.ledger.running", "الرصيد المتراكم")}</th>
              </tr>
            </thead>
            {days.map((d) => (
              <tbody key={d.day} className="border-t border-line">
                {/* ترويسةُ اليوم: مجموعُه ومرحّلُه — كما يُفتح يومٌ بدفترٍ ورقيّ */}
                <tr className="bg-surface-2/60">
                  <td colSpan={3} className="px-3 py-1.5 text-2xs font-extrabold text-ink">{fmtDay(d.day)}</td>
                  <td className="px-3 py-1.5 text-end text-2xs font-bold tabular-nums text-warn-700 dark:text-warn-300">{money(d.dayTotal)}</td>
                  <td className="px-3 py-1.5 text-end text-2xs font-bold tabular-nums text-ink-muted">{money(d.carried)}</td>
                </tr>
                {d.rows.map((r) => {
                  const m = methodOf(r.e);
                  const Icon = METHOD_ICON[m];
                  return (
                    <tr key={r.e.id} className="border-t border-line/60">
                      <td className="px-2 py-2 text-center text-2xs tabular-nums text-ink-subtle">{formatNum(r.no)}</td>
                      <td className="px-3 py-2">
                        <p className="font-semibold text-ink">{r.e.description}</p>
                        {r.e.category && <p className="text-2xs text-ink-subtle">{r.e.category}</p>}
                      </td>
                      <td className="px-3 py-2">
                        <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold",
                          m === "cash" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                            : "bg-surface-2 text-ink-muted")}>
                          <Icon size={11} /> {methodLabel(m)}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-end font-bold tabular-nums text-warn-700 dark:text-warn-300">{money(r.e.amount)}</td>
                      <td className="px-3 py-2 text-end font-extrabold tabular-nums text-ink">{money(r.running)}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
            <tfoot>
              <tr className="border-t-2 border-ink/20 bg-ink text-white">
                <td colSpan={3} className="px-3 py-2.5 text-xs font-extrabold">{t("rpt.exp.ledger.closing", "الإقفال — مجموع السحوبات")}</td>
                <td className="px-3 py-2.5 text-end font-extrabold tabular-nums">{money(total)}</td>
                <td className="px-3 py-2.5 text-end font-extrabold tabular-nums">{money(total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
