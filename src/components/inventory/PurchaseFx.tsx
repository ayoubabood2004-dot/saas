/* ============================================================================
 * الشراءُ بالعملتين (0274) — قطعُ الشاشة بنطاقها المملوك `pfx` (النصفُ البارد على سقفه). فاتورةُ الشراء (Purchases.tsx) وصفحةُ
 * الشركة تحمّلانها بـpage(…, ["pfx"]) ولا تستوردانها ثابتاً (i18n-owned-guard). الحسابُ بالخادم (0274) ومرآتِه (demoPurchaseFx)،
 * وهنا ما يُرى: عملةُ الفاتورة وسعرُها، وعملةُ بيع السطر، ودينارُ المجموع، ونافذةُ التسديد بالعملتين — وكيف انحسبت الفاتورةُ
 * الجديدة (كلُّها/جزء/دَين) لكلّ فاتورة، بأيّ عملة، وأجورُها الإضافية (0276: توصيل، نقل… على الشركة أو لغيرها).
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Coins, DollarSign, Info, Loader2, Plus, Truck, X } from "lucide-react";
import type { PaymentMethod, Purchase, PurchasePayment } from "@/types";
import { Button, useToast } from "@/components/ui";
import { cn, formatNum, money } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { decOf } from "@/lib/usdMath";
import { purchaseFx, type Cur } from "@/lib/purchaseFxApi";
import { purchaseDueCur, ratePerUsd, usdOf, type PaidMode } from "@/lib/purchaseFxMath";
import { CHARGES_MAX, CHARGE_LABEL_MAX, chargesOf, type ChargeDraft, type ChargePayee } from "@/lib/purchaseCharges";

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

/* ── فاتورةٌ جديدة: كيف انحسبت — كلُّها، أو جزءٌ مكتوب، أو كلُّها دَين ───────────────────────────────────────
 * ثلاثةُ اختياراتٍ صريحة بلا افتراض. كان الجزءُ خانةً تحت «عليها دَين» والفراغُ فيها يُرسل المجموعَ مدفوعاً — فالزرُّ يقول دَيناً
 * والفاتورةُ تُحفظ «مدفوعة» ودَينُ الشركة يضيع. الآن الجزءُ اختيارٌ وحده، ومبلغُه إلزاميّ (الحفظُ يقف ويقولها هنا: `ask`). */
export function PfxPaid({ mode, onMode, amount, onAmount, total, fmt, ask }: {
  mode: PaidMode | null; onMode: (m: PaidMode) => void; amount: string; onAmount: (v: string) => void;
  /** مجموعُ ما يُدان للشركة بعملة الفاتورة. */
  total: number; fmt: (n: number) => string;
  /** الحفظُ ضُغط والاختيارُ ناقص. */
  ask?: boolean;
}) {
  const { t } = useTranslation();
  const paid = mode === "part" ? Math.max(0, Math.min(total, Number(amount) || 0)) : mode === "full" ? total : 0;
  const partEmpty = mode === "part" && !(paid > 0);
  const opts: { m: PaidMode; label: string; on: string }[] = [
    { m: "full", label: t("pfx.paidFull"), on: "bg-success-600 text-white shadow-soft" },
    { m: "part", label: t("pfx.paidPart"), on: "bg-brand-600 text-white shadow-soft" },
    { m: "debt", label: t("pfx.paidDebt"), on: "bg-warn-600 text-white shadow-soft" },
  ];
  return (
    <div data-pfx-paid={mode ?? "none"}>
      <div className="flex gap-1.5" role="radiogroup" aria-label={t("pfx.paidHow")}>
        {opts.map((o) => (
          <button key={o.m} type="button" role="radio" aria-checked={mode === o.m} data-pfx-paid-mode={o.m}
            onClick={() => { playTap(); onMode(o.m); }}
            className={cn("flex-1 rounded-xl px-1.5 py-2 text-xs font-bold transition",
              mode === o.m ? o.on : "bg-surface-2 text-ink-muted hover:text-ink",
              ask && mode === null && "ring-2 ring-danger-400")}>
            {o.label}
          </button>
        ))}
      </div>
      {mode === null && ask && (
        <p role="alert" className="mt-1 text-2xs font-bold text-danger-600 dark:text-danger-300" data-pfx-paid-pick>{t("pfx.paidPick")}</p>
      )}
      {mode === "part" && (
        <>
          <input type="number" inputMode="decimal" min="0" step="any" className={cn("input mt-1.5", ask && partEmpty && "border-danger-400")}
            value={amount} onChange={(e) => onAmount(e.target.value)} placeholder={t("pfx.paidHowMuch")} aria-label={t("pfx.paidHowMuch")}
            aria-invalid={(ask && partEmpty) || undefined} data-pfx-paid-amt autoFocus />
          {partEmpty ? (
            ask ? <p role="alert" className="mt-1 text-2xs font-bold text-danger-600 dark:text-danger-300" data-pfx-paid-need>{t("pfx.paidNeedAmt")}</p> : null
          ) : paid >= total ? (
            <p className="mt-1 text-2xs text-ink-subtle" data-pfx-paid-all>{t("pfx.paidAllTyped")}</p>
          ) : (
            <p className="mt-1 text-2xs font-bold text-warn-700 dark:text-warn-300 tabular-nums" data-pfx-paid-left>{t("pfx.paidRemains", { v: fmt(total - paid) })}</p>
          )}
        </>
      )}
      {mode === "debt" && total > 0 && (
        <p className="mt-1 text-2xs font-bold text-warn-700 dark:text-warn-300 tabular-nums" data-pfx-paid-debt>{t("pfx.paidAllDebt", { v: fmt(total) })}</p>
      )}
      {mode === "full" && total > 0 && <p className="mt-1 text-2xs text-ink-subtle">{t("pfx.paidNone")}</p>}
    </div>
  );
}

/* ── الأجورُ الإضافية (0276): كلُّ أجرةٍ باسمها ومبلغها ولمن — «على الشركة» تنضاف لدَينها، و«دفعناها لغيرهم» (السائق) خارجه ───────
 * وكيف تُحسب إعدادُ العيادة (`mode`) يُقال تحت القائمة — الخادمُ يختمه على الفاتورة. وسطرٌ ناقص يُقال بمكانه (`ask` رقمُه). */
export function PfxCharges({ rows, onRows, mode, ask, fmt, sums }: {
  rows: ChargeDraft[]; onRows: (rows: ChargeDraft[]) => void;
  mode: "cost" | "expense";
  /** رقمُ السطر الناقص (1-based) حين ضُغط الحفظ، أو 0. */
  ask: number;
  fmt: (n: number) => string;
  /** مجموعا القائمة بعملة الفاتورة (draftSums — حسابُ النموذج نفسُه). */
  sums: { company: number; other: number };
}) {
  const { t } = useTranslation();
  const set = (i: number, patch: Partial<ChargeDraft>) => onRows(rows.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const names = t("pfx.chSuggest").split("|").map((x) => x.trim()).filter(Boolean);
  return (
    <div className="space-y-2 border-t border-line pt-2.5" data-pfx-charges={mode}>
      <dt className="flex items-center justify-between gap-2 text-ink-muted">
        <span className="inline-flex items-center gap-1"><Truck size={13} /> {t("pfx.chTitle")}</span>
        <button type="button" data-pfx-charge-add disabled={rows.length >= CHARGES_MAX}
          onClick={() => { playTap(); onRows([...rows, { label: "", amount: "", payee: "company" }]); }}
          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-brand-700 transition hover:bg-surface-2 disabled:opacity-40 dark:text-brand-300">
          <Plus size={13} /> {t("pfx.chAdd")}
        </button>
      </dt>
      <dd className="space-y-2">
        {rows.map((r, i) => (
          <div key={i} data-pfx-charge-row={i + 1}
            className={cn("space-y-1.5 rounded-xl border p-2", ask === i + 1 ? "border-danger-400" : "border-line")}>
            <div className="flex items-center gap-1.5">
              <input className="input h-9 min-w-0 flex-1 text-sm" list="pfx-charge-names" value={r.label} maxLength={CHARGE_LABEL_MAX}
                onChange={(e) => set(i, { label: e.target.value })} placeholder={t("pfx.chLabel")} aria-label={t("pfx.chLabel")} data-pfx-charge-label />
              <input type="number" inputMode="decimal" min="0" step="any" className="input h-9 w-28 text-sm font-bold tabular-nums"
                value={r.amount} onChange={(e) => set(i, { amount: e.target.value })} onFocus={(e) => e.target.select()}
                placeholder="0" aria-label={t("pfx.chAmount")} data-pfx-charge-amount />
              <button type="button" aria-label={t("pfx.chRemove")} data-pfx-charge-remove
                onClick={() => { playTap(); onRows(rows.filter((_, k) => k !== i)); }}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-ink-muted transition hover:bg-surface-2 hover:text-danger-600">
                <X size={15} />
              </button>
            </div>
            <div className="flex gap-1" role="radiogroup" aria-label={t("pfx.chWho")}>
              {(["company", "other"] as ChargePayee[]).map((w) => (
                <button key={w} type="button" role="radio" aria-checked={r.payee === w} data-pfx-charge-payee={w}
                  onClick={() => { if (r.payee !== w) { playTap(); set(i, { payee: w }); } }}
                  className={cn("flex-1 rounded-lg px-1.5 py-1.5 text-2xs font-bold transition",
                    r.payee === w ? (w === "company" ? "bg-warn-600 text-white" : "bg-brand-600 text-white") : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {w === "company" ? t("pfx.chCompany") : t("pfx.chOther")}
                </button>
              ))}
            </div>
            {ask === i + 1 && <p role="alert" className="text-2xs font-bold text-danger-600 dark:text-danger-300" data-pfx-charge-bad>{t("pfx.chBad")}</p>}
          </div>
        ))}
        {rows.length > 0 && (
          <div className="space-y-1 text-xs">
            {sums.company > 0 && (
              <p className="flex items-baseline justify-between gap-2 font-bold text-ink" data-pfx-charge-company>
                <span>{t("pfx.chOnCompany")}</span><bdi className="tabular-nums">+{fmt(sums.company)}</bdi>
              </p>
            )}
            {sums.other > 0 && (
              <p className="flex items-baseline justify-between gap-2 text-ink-muted" data-pfx-charge-other>
                <span>{t("pfx.chPaidOther")}</span><bdi className="tabular-nums">{fmt(sums.other)}</bdi>
              </p>
            )}
            <p className="flex items-start gap-1 text-2xs text-ink-subtle" data-pfx-charge-mode={mode}>
              <Info size={11} className="mt-0.5 shrink-0" />{mode === "cost" ? t("pfx.chModeCost") : t("pfx.chModeExpense")}
            </p>
          </div>
        )}
        <datalist id="pfx-charge-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
      </dd>
    </div>
  );
}

/** أجورُ فاتورةٍ محفوظة بتفاصيلها: `part="company"` قبل الصافي (داخله)، و`part="other"` بعد المتبقّي (خارجه) ومعها كيف حُسبت. */
export function PfxChargeLines({ purchase, fmt, part }: { purchase: Purchase; fmt: (n: number) => string; part: "company" | "other" }) {
  const { t } = useTranslation();
  const ch = chargesOf(purchase);
  if (!ch.list.length) return null;
  if (part === "company") {
    return (
      <>
        {ch.list.filter((x) => x.payee === "company").map((x, i) => (
          <div key={i} className="flex items-center justify-between text-ink-muted" data-pdcharge="company">
            <span className="min-w-0 truncate">{x.label}</span><bdi className="tabular-nums">+{fmt(x.amount)}</bdi>
          </div>
        ))}
      </>
    );
  }
  return (
    <div className="space-y-1 border-t border-line pt-1.5 text-xs" data-pdcharges-other>
      {ch.list.filter((x) => x.payee === "other").map((x, i) => (
        <div key={i} className="flex items-center justify-between text-ink-muted" data-pdcharge="other">
          <span className="min-w-0 truncate">{x.label} · {t("pfx.chOther")}</span><bdi className="tabular-nums">{fmt(x.amount)}</bdi>
        </div>
      ))}
      {ch.mode && <p className="text-2xs text-ink-subtle" data-pdcharge-mode={ch.mode}>{ch.mode === "cost" ? t("pfx.chStampCost") : t("pfx.chStampExpense")}</p>}
    </div>
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
  // سعرُ العيادة يصل بعد التركيب (فحصُ القدرة كسول): يُكتب بالخانة ما دامت فارغة — لا يدوس ما كتبه الطبيب.
  useEffect(() => { if (clinicRate) setPer100((v) => (v.trim() === "" ? String(Math.round(clinicRate * 100)) : v)); }, [clinicRate]);
  /* 0275: دَينُ الدولار يُسدَّد بسعر يومه دائماً (ولو سُلّم دولاراً) — منه دينارُ الدفعة وفرقُ صرفها؛ ودَينُ الدينار يحتاج السعرَ حين
   * يُسلَّم دولاراً وحده. */
  const needRate = pay !== debt || debt === "USD";
  const rate = needRate ? ratePerUsd(per100) : null;
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
  const canSave = !busy && reduces != null && reduces > 0 && !over && (!needRate || rate != null);
  /** دَينُ الدولار: ما تكلّفه الدفعةُ بالدينار يومَها، وحصّتُها بدينار يوم الشراء، وفرقُهما (كما يحسبه الخادم — 0275). */
  const costIqd = debt === "USD" && rate != null && okAmt ? (pay === "IQD" ? handed : Math.round(handed * rate)) : null;
  const dueIqd = Math.max(0, purchase.total - (purchase.amount_paid ?? purchase.total));
  const shareIqd = debt === "USD" && reduces != null
    ? (reduces >= due ? dueIqd : Math.min(dueIqd, Math.round((Math.min(reduces, due) * purchase.total) / (Number(purchase.total_usd) || 1)))) : null;
  const fxPrev = costIqd != null && shareIqd != null ? shareIqd - costIqd : null;
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
      const p = await purchaseFx.pay(purchase.id, handed, pay, needRate ? rate : null, method, note.trim() || null, due);
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
        {needRate && (
          <label className="flex items-center gap-1.5 text-2xs font-bold text-ink-muted">
            {debt === "USD" ? t("pfx.dayRate") : t("pfx.per100")}
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
      {needRate && rate == null && <p role="alert" className="text-2xs font-bold text-danger-600 dark:text-danger-300">{t("pfx.rateBad")}</p>}
      {amt.trim() !== "" && !okAmt && <p role="alert" className="text-2xs font-bold text-danger-600 dark:text-danger-300">{t("pfx.amountBad")}</p>}
      {reduces != null && (
        <p className={cn("text-2xs font-bold tabular-nums", over ? "text-danger-600 dark:text-danger-300" : "text-ink")} data-pfx-reduces role={over ? "alert" : undefined}>
          {over ? t("pfx.over", { v: fmtDebt(due) }) : t("pfx.reduces", { v: fmtDebt(Math.min(reduces, due)), left: fmtDebt(Math.max(0, Math.round((due - reduces) * 100) / 100)) })}
        </p>
      )}
      {!over && costIqd != null && fxPrev != null && (
        <p className="text-2xs font-bold tabular-nums text-ink-muted" data-pfx-fxprev>
          {t("pfx.costIqd", { v: money(costIqd) })}{" · "}
          <span className={fxPrev >= 0 ? "text-success-700 dark:text-success-300" : "text-danger-600 dark:text-danger-300"}>
            {fxPrev >= 0 ? t("pfx.fxGain", { v: money(fxPrev) }) : t("pfx.fxLoss", { v: money(-fxPrev) })}
          </span>
        </p>
      )}
      <Button size="sm" onClick={() => void save()} disabled={!canSave} data-pfx-save>
        {busy ? <Loader2 size={14} className="animate-spin" /> : null}{t("pfx.paySave")}
      </Button>
    </div>
  );
}

/* ── فاتورةُ الدولار: بشكد اشترينا الدولار وبشكد سدّدناه (0275) ───────────────────────────────────────────── */
/** دفعاتُها المعروفُ فرقُها: دولارُها بسعر يوم الشراء (حصّتُها المحجوزة)، وما كلّفت يومَ التسديد، والفرقُ ربحاً أو خسارة. */
export function PfxFxSummary({ purchase, payments }: { purchase: Purchase; payments: PurchasePayment[] }) {
  const { t } = useTranslation();
  if (purchase.currency !== "USD") return null;
  const known = payments.filter((p) => p.fx != null);
  if (!known.length) return null;
  const usd = Math.round(known.reduce((s, p) => s + Number(p.usd ?? 0), 0) * 100) / 100;
  const booked = known.reduce((s, p) => s + Number(p.amount), 0);
  const fx = Math.round(known.reduce((s, p) => s + Number(p.fx), 0) * 100) / 100;
  return (
    <div className="space-y-0.5 rounded-xl bg-surface-2 p-3 text-xs tabular-nums" data-pfx-fxsum>
      <p className="text-ink-muted">{t("pfx.sumBought", { u: usdOf(usd), r: formatNum(Number(purchase.fx_rate) || 0), v: money(booked) })}</p>
      <p className="text-ink-muted">{t("pfx.sumPaid", { v: money(Math.round((booked - fx) * 100) / 100) })}</p>
      <p className={cn("font-bold", fx >= 0 ? "text-success-700 dark:text-success-300" : "text-danger-600 dark:text-danger-300")}>
        {fx >= 0 ? t("pfx.fxGain", { v: money(fx) }) : t("pfx.fxLoss", { v: money(-fx) })}
      </p>
    </div>
  );
}
