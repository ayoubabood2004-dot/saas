import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Wallet, Check, CheckCircle2, AlertTriangle, Sun, Moon, Loader2, RotateCcw } from "lucide-react";
import type { Invoice, Expense } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { useAuth } from "@/contexts/AuthContext";
import { cn, money, formatNum, localISO } from "@/lib/utils";
import { fmtClock } from "@/lib/clock";
import { getWorkHours, getCashConfirms, addCashConfirm, type CashConfirm } from "@/lib/settings";
import { loadDrawer, drawerShifts, type DrawerFigures } from "@/lib/cashDay";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * مطابقة الصندوق اليومية — التأكيد النهائي بنهاية الدوام.
 *
 * الفكرة من دفتر الصندوق الورقي نفسه: بنهاية اليوم يعدّ الكاشير النقد
 * الموجود فعلياً ويقارنه بما يقوله السستم. عيادة بدوامين تطابق مرتين —
 * تأكيد للصباحي وتأكيد للمسائي، وكلٌّ يشوف مبيعات دوامه على حدة.
 *
 * حدود الدوامين تأتي من إعدادات دوام العيادة (WorkHoursCard). فاتورة خارج
 * الحدود تُنسب لأقرب دوام منطقياً: كل ما قبل بداية المسائي للصباحي، والباقي
 * للمسائي — فلا تضيع فاتورة بيعت بالاستراحة بين الدوامين من الحساب أبداً.
 *
 * «النقد المتوقع» = النقدُ الذي **وصل** أثناء الدوام − المصروفات النقدية
 * المسجّلة أثناءه. كلُّ ساقِ دفعٍ بيوم وصولها ودوامه لا بيوم فاتورتها: تسديدُ
 * دينٍ قديمٍ اليوم بدرج اليوم (cashDay.ts). البطاقة والحوالة تُعرضان منفصلتين
 * للمعلومة — ما تدخلان عدّ الدرج لأنهما ما مرّتا به أصلاً.
 * ==========================================================================*/

type ShiftId = CashConfirm["shift"];

interface ShiftCalc extends DrawerFigures {
  label: string;
  window: string;         // نص المدى للعرض
}

/* الفشلُ حالةٌ لا قائمةٌ فارغة: «صفر» عن خطأ شبكةٍ كان درجاً كاذباً يُؤكَّد ويُحفظ فرقُه باسم الكاشير. */
type DrawerLoad =
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; invoices: Invoice[]; expenses: Expense[] };

const minOf = (hhmm: string | undefined): number => {
  const m = /^(\d{1,2}):(\d{2})$/.exec((hhmm ?? "").trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : 0;
};

export function CashReconcile({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const toast = useToast();
  const todayISO = localISO();
  const [load, setLoad] = useState<DrawerLoad>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [confirms, setConfirms] = useState<CashConfirm[]>(() => getCashConfirms());
  const [counted, setCounted] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoad({ status: "loading" });
    setConfirms(getCashConfirms());
    // يومُ الصندوق محلّيّ (cashDay.ts)، والفواتيرُ ما لمسه اليوم — أُنشئت أو قُبض عليها.
    loadDrawer(repo, todayISO)
      .then((d) => { if (alive) setLoad({ status: "ready", ...d }); })
      .catch(() => { if (alive) setLoad({ status: "failed" }); });
    return () => { alive = false; };
  }, [open, todayISO, attempt]);

  const shifts = useMemo<ShiftCalc[]>(() => {
    if (load.status !== "ready") return [];
    const wh = getWorkHours();
    const two = !!(wh.am && wh.pm);
    /* الحدّ الفاصل بين الدوامين: بداية المسائي. بلا دوامين، اليوم كله دوام واحد. */
    const figures = drawerShifts(load.invoices, load.expenses, todayISO, two ? minOf(wh.pm!.from) : null);
    const label = (id: ShiftId) =>
      id === "am" ? t("cashrec.amShift", "الدوام الصباحي") : id === "pm" ? t("cashrec.pmShift", "الدوام المسائي") : t("cashrec.dayShift", "صندوق اليوم");
    const windowOf = (id: ShiftId) =>
      id === "am" ? `${fmtClock(wh.am!.from)} – ${fmtClock(wh.am!.to)}`
        : id === "pm" ? `${fmtClock(wh.pm!.from)} – ${fmtClock(wh.pm!.to)}`
          : wh.am ? `${fmtClock(wh.am.from)} – ${fmtClock(wh.am.to)}` : t("cashrec.allDay", "اليوم كامل");
    return figures.map((f) => ({ ...f, label: label(f.id), window: windowOf(f.id) }));
  }, [load, todayISO, t]);

  const confirmOf = (id: ShiftId) => confirms.find((c) => c.date === todayISO && c.shift === id);

  const confirmShift = (s: ShiftCalc) => {
    if (load.status !== "ready") return;
    const val = Number(counted[s.id]);
    if (!Number.isFinite(val) || val < 0) { playWarning(); toast.error(t("cashrec.countFirst", "اكتب النقد المعدود بالصندوق أولاً.")); return; }
    const rec: CashConfirm = {
      date: todayISO, shift: s.id, sales: s.salesTotal, expected: s.expected,
      counted: val, by: user?.full_name ?? null, at: new Date().toISOString(),
    };
    addCashConfirm(rec);
    setConfirms(getCashConfirms());
    playSuccess();
    const diff = Math.round((val - s.expected) * 100) / 100;
    if (diff === 0) toast.success(t("cashrec.matched", { shift: s.label, defaultValue: "{{shift}}: الصندوق مطابق للسستم تماماً ✓" }));
    else toast.success(t("cashrec.savedWithDiff", { shift: s.label, defaultValue: "{{shift}}: انحفظ التأكيد — سجّلنا الفرق أيضاً." }));
  };

  return (
    <Modal open={open} onClose={onClose} title={t("cashrec.title", "مطابقة الصندوق اليومية")}>
      {load.status === "loading" ? (
        <div className="py-10 text-center text-ink-subtle"><Loader2 className="mx-auto mb-2 animate-spin" /> {t("charts.loading", "جارٍ التحميل…")}</div>
      ) : load.status === "failed" ? (
        <div className="space-y-3 py-8 text-center" data-cashfailed>
          <p className="mx-auto max-w-md text-sm text-ink-subtle">{t("retail.invoicesLoadFailed", "تعذّر جلب الفواتير. المشكلة بالاتصال ولا فاتورة ضاعت — أعد المحاولة.")}</p>
          <Button variant="secondary" leftIcon={<RotateCcw size={15} />} onClick={() => { playTap(); setAttempt((n) => n + 1); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-xs text-ink-subtle">
            {t("cashrec.hint", "عِدّ النقد الموجود فعلياً بالدرج بنهاية الدوام، اكتبه، وأكّد — التأكيد يُحفظ باسمك ووقته. البطاقة والحوالة معروضة للمعلومة فقط: ما تدخل عدّ الدرج.")}
          </p>
          {shifts.map((s) => {
            const done = confirmOf(s.id);
            const val = counted[s.id] ?? "";
            const diff = val === "" ? null : Math.round((Number(val) - s.expected) * 100) / 100;
            return (
              <div key={s.id} data-shift={s.id} className={cn("rounded-2xl border p-4",
                done ? "border-success-300 bg-success-50/50 dark:border-success-500/40 dark:bg-success-500/10" : "border-line bg-surface-1")}>
                <div className="mb-2.5 flex flex-wrap items-center gap-2">
                  <span className={cn("grid h-9 w-9 place-items-center rounded-xl",
                    s.id === "pm" ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-500/15 dark:text-indigo-300" : "bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300")}>
                    {s.id === "pm" ? <Moon size={17} /> : <Sun size={17} />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-ink">{s.label}</p>
                    <p className="text-2xs font-bold text-ink-subtle tabular-nums">{s.window}</p>
                  </div>
                  {done && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-success-100 px-2.5 py-1 text-2xs font-black text-success-700 dark:bg-success-500/20 dark:text-success-300">
                      <CheckCircle2 size={13} /> {t("cashrec.confirmed", "مؤكَّد")}
                    </span>
                  )}
                </div>

                {/* مبيعات الدوام — بنظرة */}
                <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label={t("cashrec.sales", "المبيعات")} value={money(s.salesTotal)} sub={t("cashrec.nInvoices", { n: formatNum(s.invoiceCount), defaultValue: "{{n}} فاتورة" })} strong />
                  <Stat label={t("cashrec.cashIn", "نقد داخل")} value={money(s.cash)} />
                  <Stat label={t("cashrec.cardIn", "بطاقة / حوالة")} value={money(s.card + s.transfer)} />
                  <Stat label={t("cashrec.cashOut", "مصروفات نقدية")} value={money(s.cashOut)} />
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 px-3 py-2.5">
                  <span className="text-xs font-extrabold text-ink-muted">{t("cashrec.expected", "المفروض بالدرج:")}</span>
                  <span className="text-base font-black tabular-nums text-ink" data-expected={s.id}>{money(s.expected)}</span>
                </div>

                {done ? (
                  <div className="mt-2.5 space-y-1.5">
                    <p className="text-2xs font-bold text-ink-muted">
                      {t("cashrec.doneLine", { counted: money(done.counted), by: done.by ?? "—", at: fmtClock(`${String(new Date(done.at).getHours()).padStart(2, "0")}:${String(new Date(done.at).getMinutes()).padStart(2, "0")}`), defaultValue: "عُدّ {{counted}} · أكّده {{by}} الساعة {{at}}" })}
                    </p>
                    {Math.round((done.counted - done.expected) * 100) / 100 === 0 ? (
                      <p className="inline-flex items-center gap-1.5 rounded-lg bg-success-100 px-2.5 py-1.5 text-xs font-black text-success-700 dark:bg-success-500/20 dark:text-success-300">
                        <Check size={14} /> {t("cashrec.exactMatch", "مطابق تماماً")}
                      </p>
                    ) : (
                      <p className="inline-flex items-center gap-1.5 rounded-lg bg-warn-50 px-2.5 py-1.5 text-xs font-black text-warn-700 dark:bg-warn-500/15 dark:text-warn-300">
                        <AlertTriangle size={14} />
                        {done.counted > done.expected
                          ? t("cashrec.diffOver", { d: money(done.counted - done.expected), defaultValue: "زيادة {{d}} عن السستم" })
                          : t("cashrec.diffUnder", { d: money(done.expected - done.counted), defaultValue: "نقص {{d}} عن السستم" })}
                      </p>
                    )}
                    <button type="button" data-recount={s.id}
                      onClick={() => { playTap(); setConfirms((cur) => cur.filter((c) => !(c.date === todayISO && c.shift === s.id))); }}
                      className="inline-flex items-center gap-1 text-2xs font-bold text-ink-subtle transition hover:text-ink">
                      <RotateCcw size={12} /> {t("cashrec.recount", "إعادة العدّ والتأكيد")}
                    </button>
                  </div>
                ) : (
                  <div className="mt-2.5 flex flex-wrap items-center gap-2">
                    <input
                      data-counted={s.id}
                      inputMode="decimal"
                      placeholder={t("cashrec.countedPh", "النقد المعدود فعلياً…")}
                      className="input h-11 w-44 text-center font-black tabular-nums"
                      value={val}
                      onChange={(e) => setCounted((m) => ({ ...m, [s.id]: e.target.value.replace(/[^\d.]/g, "") }))}
                    />
                    {diff !== null && Number.isFinite(diff) && (
                      diff === 0 ? (
                        <span className="inline-flex items-center gap-1 text-xs font-black text-success-600 dark:text-success-300"><Check size={14} /> {t("cashrec.exactMatch", "مطابق تماماً")}</span>
                      ) : (
                        <span className="text-xs font-black text-warn-700 dark:text-warn-300" data-diff={s.id}>
                          {diff > 0
                            ? t("cashrec.diffOver", { d: money(diff), defaultValue: "زيادة {{d}} عن السستم" })
                            : t("cashrec.diffUnder", { d: money(-diff), defaultValue: "نقص {{d}} عن السستم" })}
                        </span>
                      )
                    )}
                    <Button size="sm" data-confirmshift={s.id} className="ms-auto" style={{ minHeight: 44 }}
                      leftIcon={<Wallet size={15} />} onClick={() => confirmShift(s)}>
                      {t("cashrec.confirmBtn", "تأكيد المطابقة")}
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </Modal>
  );
}

function Stat({ label, value, sub, strong }: { label: string; value: string; sub?: string; strong?: boolean }) {
  return (
    <div className={cn("rounded-xl border border-line px-2.5 py-2", strong ? "bg-brand-50/60 dark:bg-brand-500/10" : "bg-surface-1")}>
      <p className="text-[10px] font-bold text-ink-subtle">{label}</p>
      <p className={cn("truncate text-sm font-black tabular-nums", strong ? "text-brand-700 dark:text-brand-300" : "text-ink")}>{value}</p>
      {sub && <p className="text-[10px] font-bold text-ink-subtle">{sub}</p>}
    </div>
  );
}
