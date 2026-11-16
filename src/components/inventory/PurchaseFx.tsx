/* ============================================================================
 * الشراءُ بالعملتين (0274) — قطعُ الشاشة بنطاقها المملوك `pfx` (النصفُ البارد على سقفه). فاتورةُ الشراء (Purchases.tsx) وصفحةُ
 * الشركة تحمّلانها بـpage(…, ["pfx"]) ولا تستوردانها ثابتاً (i18n-owned-guard). الحسابُ بالخادم (0274) ومرآتِه (demoPurchaseFx)،
 * وهنا ما يُرى: عملةُ الفاتورة وسعرُها، وعملةُ بيع السطر، ودينارُ المجموع، ونافذةُ التسديد بالعملتين.
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins, DollarSign, Info, Loader2 } from "lucide-react";
import type { PaymentMethod, Purchase } from "@/types";
import { Button, useToast } from "@/components/ui";
import { cn, formatNum, money } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { decOf } from "@/lib/usdMath";
import { purchaseFx, type Cur } from "@/lib/purchaseFxApi";
import { purchaseDueCur, ratePerUsd, usdOf } from "@/lib/purchaseFxMath";

/* ── شريطُ عملة الفاتورة ─────────────────────────────────────────────────────────────────────────── */
export function PfxBar({ cur, onCur, per100, onPer100, clinicRate, locked, showBad }: {
  cur: Cur; onCur: (c: Cur) => void; per100: string; onPer100: (v: string) => void;
  /** سعرُ العيادة الأخير للدولار الواحد — اقتراحٌ يُكتب بالخانة حين تُختار الدولار. */
  clinicRate: number | null;
  /** فاتورةٌ عليها دفعات: عملتُها لا تتبدّل (الخادم: currency_has_payments). */
  locked?: boolean;
  /** الحفظُ ضُغط وسعرُ الدولار غيرُ مقروء — يُقال هنا (الزرُّ لا يقف بلا كلمة). */
  showBad?: boolean;
}) {
  const { t } = useTranslation();
  const rate = ratePerUsd(per100);
  const bad = cur === "USD" && rate == null && (showBad || per100.trim() !== "");
  return (
    <div className="rounded-2xl border border-line bg-surface-1 p-3" data-pfx-bar>
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs font-bold text-ink-muted"><Coins size={13} /> {t("pfx.cur")}</span>
        <div className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label={t("pfx.cur")}>
          {(["IQD", "USD"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={cur === c} disabled={locked && cur !== c} data-pfx-cur={c}
              onClick={() => { if (cur === c) return; playTap(); onCur(c); }}
              className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition disabled:opacity-40",
                cur === c ? (c === "USD" ? "bg-success-600 text-white shadow-soft" : "bg-brand-600 text-white shadow-soft") : "text-ink-muted hover:text-ink")}>
              {c === "IQD" ? t("pfx.iqd") : <span className="inline-flex items-center gap-0.5"><DollarSign size={12} strokeWidth={3} />{t("pfx.usd")}</span>}
            </button>
          ))}
        </div>
        {cur === "USD" && (
          <label className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
            {t("pfx.per100")}
            <input dir="ltr" inputMode="decimal" className={cn("input h-9 w-32 font-mono", bad && "border-danger-400")} value={per100} data-pfx-rate
              onChange={(e) => onPer100(e.target.value)} placeholder={clinicRate ? String(Math.round(clinicRate * 100)) : "146000"} aria-invalid={bad || undefined} />
          </label>
        )}
      </div>
      {locked && <p className="mt-1.5 text-2xs text-ink-subtle">{t("pfx.locked")}</p>}
      {cur === "USD" && (
        <div className="mt-1.5 space-y-0.5 text-2xs">
          {bad ? (
            <p role="alert" className="font-bold text-danger-600 dark:text-danger-300" data-pfx-ratebad>{t("pfx.rateBad")}</p>
          ) : rate != null ? (
            <p className="font-bold text-ink tabular-nums" data-pfx-rateread>{t("pfx.rateRead", { v: formatNum(rate) })}</p>
          ) : null}
          {clinicRate != null && rate != null && Math.abs(rate - clinicRate) >= 0.0001 && (
            <p className="text-ink-subtle">{t("pfx.clinicRate", { v: formatNum(clinicRate) })}</p>
          )}
          <p className="flex items-start gap-1 text-ink-subtle"><Info size={11} className="mt-0.5 shrink-0" />{t("pfx.how")}</p>
        </div>
      )}
    </div>
  );
}

/* ── عملةُ بيع السطر: تبديلٌ للمادّة الجديدة، وشارةٌ لمادّة الدولار القائمة ─────────────────────────────── */
export function PfxLineCur({ value, onChange }: { value: Cur; onChange?: (c: Cur) => void }) {
  const { t } = useTranslation();
  if (!onChange) {
    return value === "USD" ? (
      <span className="mx-2.5 mb-1 inline-flex items-center gap-0.5 rounded-full bg-success-50 px-1.5 py-0.5 text-2xs font-extrabold text-success-700 dark:bg-success-500/15 dark:text-success-300" data-pfx-linecur="USD">
        <DollarSign size={10} strokeWidth={3} />{t("pfx.sellUsd")}
      </span>
    ) : null;
  }
  return (
    <button type="button" data-pfx-linecur={value} onClick={() => { playTap(); onChange(value === "USD" ? "IQD" : "USD"); }}
      title={t("pfx.sellCurHint")}
      className={cn("mx-2.5 mb-1 inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-2xs font-extrabold transition",
        value === "USD" ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-muted hover:text-ink")}>
      {value === "USD" ? <><DollarSign size={10} strokeWidth={3} />{t("pfx.sellUsd")}</> : t("pfx.sellIqd")}
    </button>
  );
}

/* ── دينارُ مجموع فاتورة الدولار بسعرها ─────────────────────────────────────────────────────────────── */
/** `iqd`: دينارُ الفاتورة المحفوظ (مجموعُ سطورها كما حسبها الخادم) — وإلا تقديرُ المجموع بالسعر قبل الحفظ. */
export function PfxTotals({ totalUsd, rate, iqd }: { totalUsd: number; rate: number | null; iqd?: number }) {
  const { t } = useTranslation();
  if (rate == null) return null;
  return (
    <p className="text-2xs font-bold text-ink-subtle tabular-nums" data-pfx-iqd>
      {t("pfx.iqdAt", { v: money(iqd ?? Math.round(totalUsd * rate)), r: formatNum(rate) })}
    </p>
  );
}

/* ── تسديدُ فاتورة شراء: الدَّينُ بعملته، والمسلَّمُ بعملته ─────────────────────────────────────────────── */

export function PfxPay({ purchase, clinicRate, onDone }: { purchase: Purchase; clinicRate: number | null; onDone: (p: Purchase) => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const debt: Cur = purchase.currency === "USD" ? "USD" : "IQD";
  const due = purchaseDueCur(purchase);
  const [pay, setPay] = useState<Cur>(debt);
  const [amt, setAmt] = useState("");
  const [per100, setPer100] = useState(clinicRate ? String(Math.round(clinicRate * 100)) : "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setAmt(""); setPay(debt); }, [purchase.id, debt]);
  const rate = pay !== debt ? ratePerUsd(per100) : null;
  const handed = Number(decOf(amt.trim(), 2) ?? NaN) / 100;
  const okAmt = Number.isFinite(handed) && handed > 0;
  /** ما ينقص من الدَّين بعملته — كما يحسبه الخادم (purchase_pay_fx). */
  const reduces = useMemo(() => {
    if (!okAmt) return null;
    if (pay === debt) return handed;
    if (rate == null) return null;
    return debt === "USD" ? Math.round((handed / rate) * 100) / 100 : Math.round(handed * rate);
  }, [okAmt, handed, pay, debt, rate]);
  const fmtDebt = (n: number) => (debt === "USD" ? usdOf(n) : money(n));
  const fmtPay = (n: number) => (pay === "USD" ? usdOf(n) : money(n));
  const over = reduces != null && reduces > due + (debt === "USD" ? 0.01 : rate != null ? Math.ceil(rate * 0.01) : 0);
  const canSave = !busy && reduces != null && reduces > 0 && !over;
  /** «سدّد الباقي» بعملةٍ ثانية: المبلغُ الذي يُغلقها (يُقرَّب للأعلى — والخادمُ يقبل زيادةً دون سنتٍ إغلاقاً). */
  const fillDue = () => {
    playTap();
    if (pay === debt) { setAmt(String(due)); return; }
    if (rate == null) return;
    setAmt(debt === "USD" ? String(Math.ceil(due * rate)) : String(Math.ceil((due / rate) * 100) / 100));
  };
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    try {
      const p = await purchaseFx.pay(purchase.id, handed, pay, pay !== debt ? rate : null, method, note.trim() || null, due);
      playSuccess();
      toast.success(t("pfx.paid", { v: fmtPay(handed) }));
      setAmt(""); setNote("");
      onDone(p);
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t));
    } finally {
      setBusy(false);
    }
  };
  if (due <= 0) return null;
  return (
    <div className="space-y-2 rounded-2xl border border-line bg-surface-1 p-3" data-pfx-pay>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-bold text-ink">{t("pfx.payTitle")}</p>
        <p className="text-xs font-bold text-warn-700 tabular-nums dark:text-warn-300" data-pfx-due>{t("pfx.due", { v: fmtDebt(due) })}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-2xs font-bold text-ink-muted">{t("pfx.payIn")}</span>
        <div className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label={t("pfx.payIn")}>
          {(["IQD", "USD"] as const).map((c) => (
            <button key={c} type="button" role="radio" aria-checked={pay === c} data-pfx-paycur={c}
              onClick={() => { if (pay === c) return; playTap(); setPay(c); setAmt(""); }}
              className={cn("rounded-lg px-3 py-1 text-xs font-bold transition", pay === c ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
              {c === "IQD" ? t("pfx.iqd") : t("pfx.usd")}
            </button>
          ))}
        </div>
        {pay !== debt && (
          <label className="flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
            {t("pfx.per100")}
            <input dir="ltr" inputMode="decimal" className="input h-8 w-28 font-mono" value={per100} onChange={(e) => setPer100(e.target.value)} data-pfx-payrate />
          </label>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input dir="ltr" inputMode="decimal" className="input h-10 w-40 font-mono" value={amt} onChange={(e) => setAmt(e.target.value)} data-pfx-amt
          placeholder={pay === "USD" ? "$" : "0"} aria-label={t("pfx.amount")} />
        <button type="button" onClick={fillDue} className="rounded-lg bg-surface-2 px-2 py-1 text-2xs font-bold text-ink-muted hover:text-ink" data-pfx-filldue>
          {t("pfx.fillDue")}
        </button>
        <select className="input h-10 w-auto" value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} aria-label={t("pfx.method")}>
          <option value="cash">{t("pfx.cash")}</option>
          <option value="card">{t("pfx.card")}</option>
          <option value="transfer">{t("pfx.transfer")}</option>
        </select>
      </div>
      <input className="input h-9" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("pfx.note")} />
      {pay !== debt && rate == null && <p role="alert" className="text-2xs font-bold text-danger-600 dark:text-danger-300">{t("pfx.rateBad")}</p>}
      {amt.trim() !== "" && !okAmt && <p role="alert" className="text-2xs font-bold text-danger-600 dark:text-danger-300">{t("pfx.amountBad")}</p>}
      {reduces != null && (
        <p className={cn("text-2xs font-bold tabular-nums", over ? "text-danger-600 dark:text-danger-300" : "text-ink")} data-pfx-reduces role={over ? "alert" : undefined}>
          {over ? t("pfx.over", { v: fmtDebt(due) }) : t("pfx.reduces", { v: fmtDebt(Math.min(reduces, due)), left: fmtDebt(Math.max(0, Math.round((due - reduces) * 100) / 100)) })}
        </p>
      )}
      <Button size="sm" onClick={() => void save()} disabled={!canSave} data-pfx-save>
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}{t("pfx.paySave")}
      </Button>
    </div>
  );
}
