/* ============================================================================
 * الدولار (0264) — مالكُ النطاق `usd`: كلُّ نصٍّ بالدولار هنا أو برفيقه (UsdSale.tsx)، وكلُّ شاشةٍ تحمّل ما ترسمه
 * بـ`page(() => import("@/components/usd/Usd").then(…), ["usd"])` — لا استيرادَ ثابتاً (النصفُ الباردُ ممتلئ والإقلاعُ على سقفه).
 *
 * الحسابُ كلُّه من usdMath.ts (مرآةُ الخادم المفحوصة بـusd-parity): الشاشةُ تعاين ما سيكتبه الخادمُ ديناراً بدينار،
 * وترسل ما رأته (معرّفَ السعر، وباقيَ الدولار) فيرفض الخادمُ ما تغيّر بعدها. والدولارُ لا يُجمع على دينارٍ أبداً.
 * ========================================================================= */
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Ban, CheckCircle2, Coins, DollarSign, History, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { Invoice } from "@/types";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatDate, formatNum, formatTime, uuid } from "@/lib/utils";
import { usdApi, type UsdMethod, type UsdRate, type UsdSettlement } from "@/lib/usdApi";
import { shouldReleaseRef } from "@/lib/errors";
import { centsOf, iqdOf, per100Of, previewSettle, rateOfPer100, rateOk, settleRefusal, USD_ROUND_STEPS, usdText } from "@/lib/usdMath";
import { usdDraftProblem, type UsdBlockers, type UsdDraft } from "@/lib/usdProduct";
export { UsdSaleSheet } from "./UsdSale";
import { centsOfNum, iqd, isToday, refreshUsdState, StaleRateBanner, stampText, UsdChip, usdErrorText, usdIso, useStaleRate, useUsdState } from "./usdShared";
export { refreshUsdState, useUsdState, usdErrorText, UsdChip } from "./usdShared";

/* ══ ١) بطاقةُ الإعدادات ══════════════════════════════════════════════════════════════════════════ */
export function UsdSettingsCard() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { state, failed, reload } = useUsdState();
  const [rates, setRates] = useState<UsdRate[] | null | "failed">(null);
  const [per100, setPer100] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState<null | "toggle" | "rate" | "step">(null);
  const loadRates = useCallback(() => { setRates(null); usdApi.rates(8).then(setRates, () => setRates("failed")); }, []);
  useEffect(() => { if (state?.enabled) loadRates(); }, [state?.enabled, loadRates]);

  const typed = rateOfPer100(per100);
  const typedOk = rateOk(typed);
  const run = async (kind: "toggle" | "rate" | "step", f: () => Promise<unknown>, ok: string) => {
    if (busy) return;
    setBusy(kind);
    try { await f(); await refreshUsdState(); playSuccess(); toast.success(ok); }
    catch (e) { playWarning(); toast.error(usdErrorText(e, t)); }
    finally { setBusy(null); }
  };

  if (failed) {
    return (
      <div className="card mb-4 flex items-center gap-3 p-5" data-usd-card>
        <p className="flex-1 text-sm text-ink-subtle">{t("usd.set.loadFailed")}</p>
        <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={reload}>{t("usd.retry")}</Button>
      </div>
    );
  }
  if (!state) return <div className="card mb-4 grid place-items-center p-6 text-ink-subtle" data-usd-card><Loader2 size={16} className="animate-spin" /></div>;

  const on = state.enabled;
  const r = state.rate;
  return (
    <div className="card mb-4 p-5" data-usd-card>
      <h2 className="mb-3 flex items-center gap-2 font-bold text-ink"><DollarSign size={18} className="text-success-600" /> {t("usd.set.title")}</h2>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{t("usd.set.toggle")}</p>
          <p className="mt-0.5 text-xs text-ink-subtle">{t(on ? "usd.set.on" : "usd.set.off")}</p>
        </div>
        <button role="switch" aria-checked={on} aria-label={t("usd.set.toggle")} disabled={!!busy} data-usd-toggle className="mt-0.5 shrink-0"
          onClick={() => run("toggle", () => usdApi.setPrefs(!on), t(on ? "usd.set.turnedOff" : "usd.set.turnedOn"))}>
          <span className={cn("relative block h-6 w-11 rounded-full transition-colors", on ? "bg-success-600" : "border border-line bg-surface-3")}>
            <span className={cn("absolute start-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform", on && "translate-x-5 rtl:-translate-x-5")} />
          </span>
        </button>
      </div>

      {on && (
        <div className="mt-4 space-y-4">
          {/* السعرُ الحاليّ: رقمُ المئة كما يقوله السوق، والدولارُ الواحد تحته */}
          <div className={cn("rounded-2xl border p-4", r && isToday(r.created_at) ? "border-success-200 bg-success-50/60 dark:border-success-500/30 dark:bg-success-500/10" : "border-warn-200 bg-warn-50/60 dark:border-warn-500/30 dark:bg-warn-500/10")} data-usd-rate-now>
            <p className="text-2xs font-semibold text-ink-subtle">{t("usd.set.rateNow")}</p>
            {r ? (
              <>
                <p className="font-display text-3xl font-extrabold tabular-nums text-ink" dir="ltr">{iqd(per100Of(r.rate1e4))}</p>
                <p className="mt-0.5 text-xs text-ink-muted">{t("usd.set.perUsd", { v: formatNum(Number(r.rate1e4) / 10_000) })} · {t("usd.set.setAt", { when: stampText(r.created_at, i18n.language, t) })}</p>
                {!isToday(r.created_at) && <p className="mt-1 text-xs font-semibold text-warn-700 dark:text-warn-300">{t("usd.set.stale")}</p>}
              </>
            ) : <p className="mt-1 text-sm font-semibold text-warn-700 dark:text-warn-300">{t("usd.set.noRate")}</p>}
          </div>

          <form className="space-y-2" onSubmit={(e) => { e.preventDefault(); if (typedOk) run("rate", async () => { await usdApi.setRate(per100, note); setPer100(""); setNote(""); loadRates(); }, t("usd.set.rateSaved", { v: iqd(per100Of(typed!)) })); }}>
            <label className="label" htmlFor="usd-per100">{t("usd.set.newRate")}</label>
            <div className="flex flex-wrap items-center gap-2">
              <input id="usd-per100" data-usd-per100 className="input w-44 tabular-nums" dir="ltr" inputMode="decimal" placeholder="146,000" value={per100} onChange={(e) => setPer100(e.target.value)} />
              <Button type="submit" size="sm" loading={busy === "rate"} disabled={!typedOk}>{t("usd.set.saveRate")}</Button>
              {per100.trim() !== "" && (
                <span className={cn("text-xs font-semibold", typedOk ? "text-ink-muted" : "text-danger-600")}>
                  {typedOk ? t("usd.set.preview", { v: formatNum(Number(typed) / 10_000) }) : t("usd.err.usd_rate_bad")}
                </span>
              )}
            </div>
            <input className="input" placeholder={t("usd.set.notePh")} value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
          </form>

          <div>
            <label className="label" htmlFor="usd-step">{t("usd.set.step")}</label>
            <select id="usd-step" data-usd-step className="input w-56" value={state.step} disabled={!!busy}
              onChange={(e) => { const v = Number(e.target.value); run("step", () => usdApi.setPrefs(null, v), t("usd.set.stepSaved")); }}>
              {USD_ROUND_STEPS.map((s) => <option key={s} value={s}>{s === 1 ? t("usd.set.stepOne") : t("usd.set.stepN", { v: formatNum(s) })}</option>)}
            </select>
            <p className="mt-1 text-2xs text-ink-subtle">{t("usd.set.stepHint", { v: formatNum(state.step) })}</p>
          </div>

          <div>
            <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><History size={13} /> {t("usd.set.history")}</p>
            {rates === "failed" ? (
              <button type="button" className="text-xs font-semibold text-brand-600" onClick={loadRates}>{t("usd.retry")}</button>
            ) : rates === null ? <Loader2 size={14} className="animate-spin text-ink-subtle" /> : (
              <ul className="divide-y divide-line rounded-xl border border-line text-xs" data-usd-history>
                {rates.map((x) => (
                  <li key={x.id} className="flex items-center gap-3 px-3 py-2">
                    <span className="font-bold tabular-nums text-ink" dir="ltr">{iqd(per100Of(x.rate1e4))}</span>
                    <span className="min-w-0 flex-1 truncate text-ink-subtle">{x.note}</span>
                    <span className="shrink-0 text-ink-subtle">{stampText(x.created_at, i18n.language, t)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      <p className="mt-4 text-2xs leading-relaxed text-ink-subtle">{t("usd.set.note")}</p>
    </div>
  );
}

/* ══ ٢) حقولُ السعر بنموذج المادّة (المسودّةُ بيد النموذج — usdProduct.ts) ══════════════════════════════ */
export function UsdPriceFields({ value, onChange, blockers, showProblems, onEnabled }: {
  value: UsdDraft; onChange: (d: UsdDraft) => void; blockers: UsdBlockers; showProblems: boolean;
  /** النموذجُ لا يرسل حقلاً بالدولار إلا بعد أن يعرف أن الميزة مفعّلة (قاعدةٌ قبل 0264 لا تعرف الأعمدة). */
  onEnabled: (on: boolean) => void;
}) {
  const { t } = useTranslation();
  const { state, failed, reload } = useUsdState();
  useEffect(() => { onEnabled(!!state?.enabled); }, [state?.enabled, onEnabled]);
  if (!state?.enabled && !value.on) return null;
  if (!state) {
    // مادّةُ دولار وإعداداتُ الدولار ما وصلت: النموذجُ لا يرسل أسعارَها (قد تكون الميزةُ غائبة) — يُقال لا يُحفظ بصمت.
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-warn-200 bg-warn-50 p-3 text-xs font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-usd-fields data-usd-notready>
        <span className="min-w-0 flex-1">{t("usd.prod.notReady")}</span>
        {failed ? <Button size="sm" variant="secondary" onClick={reload}>{t("usd.retry")}</Button> : <Loader2 size={14} className="animate-spin" />}
      </div>
    );
  }
  const r = state?.rate ?? null;
  const sell = centsOf(value.sell), buy = centsOf(value.buy);
  const problem = usdDraftProblem(value, blockers);
  const what = [blockers.weight && t("usd.prod.bWeight"), blockers.sub && t("usd.prod.bSub"), blockers.pooled && t("usd.prod.bPooled"), blockers.packs && t("usd.prod.bPacks")].filter(Boolean).join("، ");
  return (
    <div className={cn("rounded-2xl border p-3", value.on ? "border-success-200 bg-success-50/50 dark:border-success-500/30 dark:bg-success-500/10" : "border-line")} data-usd-fields>
      <label className="flex cursor-pointer items-start justify-between gap-3">
        <span className="min-w-0">
          <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><DollarSign size={15} className="text-success-600" /> {t("usd.prod.toggle")}</span>
          <span className="mt-0.5 block text-2xs text-ink-subtle">{t("usd.prod.toggleHint")}</span>
        </span>
        <input type="checkbox" data-usd-on className="mt-1 h-4 w-4 accent-success-600" checked={value.on} onChange={(e) => { playTap(); onChange({ ...value, on: e.target.checked }); }} />
      </label>
      {value.on && (
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="label">{t("usd.prod.buy")}</span>
              <input data-usd-buy className="input tabular-nums" dir="ltr" inputMode="decimal" placeholder="0.00" value={value.buy} onChange={(e) => onChange({ ...value, buy: e.target.value })} />
            </label>
            <label className="block">
              <span className="label">{t("usd.prod.sell")}</span>
              <input data-usd-sell className={cn("input tabular-nums", showProblems && problem === "sell" && "border-danger-400")} dir="ltr" inputMode="decimal" placeholder="0.00" value={value.sell} onChange={(e) => onChange({ ...value, sell: e.target.value })} />
            </label>
          </div>
          <p className="text-2xs text-ink-muted">
            {sell != null && r ? t("usd.prod.approx", { v: iqd(iqdOf(sell, r.rate1e4, 1)) }) : !r ? t("usd.prod.noRate") : null}
            {sell != null && buy != null && <> · {t("usd.prod.profit", { v: usdIso(sell - buy) })}</>}
          </p>
          {problem === "blocked" && <p className="rounded-lg bg-danger-50 p-2 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-usd-blocked>{t("usd.prod.blocked", { what })}</p>}
          {showProblems && problem === "sell" && <p className="text-xs font-semibold text-danger-600">{t("usd.prod.needSell")}</p>}
          {showProblems && problem === "buy" && <p className="text-xs font-semibold text-danger-600">{t("usd.prod.badBuy")}</p>}
          <p className="text-2xs text-ink-subtle">{t("usd.prod.noStore")}</p>
        </div>
      )}
    </div>
  );
}

/* ══ ٣) التسديدُ بالدينار ══════════════════════════════════════════════════════════════════════════ */
const METHODS: UsdMethod[] = ["cash", "card", "transfer"];
export function UsdSettleDialog({ invoice, onClose, onSettled }: { invoice: Invoice | null; onClose: () => void; onSettled: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const { state, failed, reload } = useUsdState();
  const { stale, ack } = useStaleRate(state?.rate ?? null);
  const [usd, setUsd] = useState("");
  const [per100, setPer100] = useState("");
  const [reason, setReason] = useState("");
  const [method, setMethod] = useState<UsdMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState(uuid);
  /** أُرسل بهذا المرجع شيءٌ نتيجتُه مجهولة؟ تُقفل الخاناتُ والإعادةُ بالمرجع نفسِه وحدها — مبلغٌ تغيّر ثمّ إعادةٌ كانت ترجع التسديدَ
   *  الأوّل بـ«انسجل» عن مبلغٍ غيرِ الذي كُتب. */
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);
  const totalUsd = centsOfNum(invoice?.total_usd), paidUsd = centsOfNum(invoice?.paid_usd);
  const due = totalUsd - paidUsd;
  const freshRate = useCallback(() => {
    // السعرُ يُسأل عند كلّ فتح (المخبأُ دقيقة): سعرُ أمس بخانةٍ مملوءةٍ كان يُرفض «يحتاج المدير وسبب» — أو يُسدَّد به بسبب.
    setPer100("");
    refreshUsdState().then((st) => setPer100(st.rate ? String(per100Of(st.rate.rate1e4)) : ""), () => { /* failed يقولها */ });
  }, []);
  useEffect(() => {
    if (!invoice) return;
    setUsd(usdText(due).replace(/[$,]/g, "")); setReason(""); setMethod("cash"); setRef(uuid()); setSent(false); setPending(false);
    freshRate();
  }, [invoice?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!invoice) return null;
  const step = state?.step ?? 250;
  const cents = centsOf(usd);
  const rate = rateOfPer100(per100);
  const today = state?.rate ?? null;
  const other = !!today && rate != null && rate !== today.rate1e4;
  const pv = cents != null && rate != null && rateOk(rate)
    ? previewSettle({ usdCents: cents, rate1e4: rate, step, totalUsdCents: totalUsd, paidUsdCents: paidUsd, totalIqd: centsOfNum(invoice.total) / 100n, paidIqd: centsOfNum(invoice.amount_paid ?? 0) / 100n })
    : null;
  const refusal = pv && cents != null ? settleRefusal(cents, due, pv.received) : cents == null || cents <= 0n ? "usd_amount" : null;
  const closes = pv != null && cents != null && cents >= due;
  const blocked = busy || !state?.enabled || !today || !pv || !!refusal || (other && !reason.trim()) || stale || (typeof navigator !== "undefined" && navigator.onLine === false);
  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    const fresh = !sent;
    setSent(true);
    try {
      await usdApi.settle(invoice.id, usd, per100, method, usdText(due).replace(/[$,]/g, ""), other ? reason : null, ref);
      playSuccess();
      toast.success(t("usd.settle.done"));
      onSettled();
    } catch (e) {
      playWarning();
      toast.error(usdErrorText(e, t));
      if (shouldReleaseRef(fresh, e)) setSent(false); else setPending(true);
      const code = (e as Error)?.message;
      // الباقي تغيّر من جهازٍ ثانٍ: الفاتورةُ هنا قديمة — تُغلق النافذةُ وتُقرأ من جديد. والسعرُ تغيّر: يُسأل ثانيةً.
      if (code === "usd_due_changed") onSettled();
      else if (code === "usd_rate_changed" || code === "usd_rate_override") freshRate();
    } finally { setBusy(false); }
  };

  return (
    <Modal open={!!invoice} onClose={onClose} title={t("usd.settle.title")}>
      <div className="space-y-4" data-usd-settle>
        <div className="rounded-2xl bg-surface-2 p-4 text-center">
          <p className="text-2xs font-semibold text-ink-subtle">{t("usd.settle.due")}</p>
          <p className="font-display text-3xl font-extrabold tabular-nums text-warn-600 dark:text-warn-300" dir="ltr">{usdText(due)}</p>
          <p className="mt-1 text-2xs text-ink-subtle">{t("usd.settle.saleValue", { v: iqd(centsOfNum(invoice.total) / 100n - centsOfNum(invoice.amount_paid ?? 0) / 100n), r: formatNum(invoice.fx_rate ?? 0) })}</p>
        </div>
        {failed && <div className="flex items-center gap-2 text-sm text-danger-600"><span className="flex-1">{t("usd.set.loadFailed")}</span><Button size="sm" variant="secondary" onClick={reload}>{t("usd.retry")}</Button></div>}
        {state && !state.enabled && <p className="rounded-lg bg-danger-50 p-2 text-sm text-danger-700">{t("usd.err.usd_disabled")}</p>}
        {state?.enabled && !today && <p className="rounded-lg bg-warn-50 p-2 text-sm text-warn-700">{t("usd.err.usd_no_rate")}</p>}
        {stale && today && <StaleRateBanner rate={today} onAck={ack} />}
        {pending && <p className="rounded-xl border border-warn-200 bg-warn-50 p-3 text-sm text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-usd-pending>{t("usd.settle.pending")}</p>}

        <fieldset disabled={pending} className="min-w-0 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="label">{t("usd.settle.amount")}</span>
            <input data-usd-amount className="input tabular-nums" dir="ltr" inputMode="decimal" value={usd} onChange={(e) => setUsd(e.target.value)} />
            <button type="button" className="mt-1 text-2xs font-bold text-brand-600" onClick={() => { playTap(); setUsd(usdText(due).replace(/[$,]/g, "")); }}>{t("usd.settle.all")}</button>
          </label>
          <label className="block">
            <span className="label">{t("usd.settle.rate")}</span>
            <input data-usd-rate className={cn("input tabular-nums", other && "border-warn-400")} dir="ltr" inputMode="decimal" value={per100} onChange={(e) => setPer100(e.target.value)} />
            <span className={cn("mt-1 block text-2xs", other ? "font-semibold text-warn-700 dark:text-warn-300" : "text-ink-subtle")}>{other ? t("usd.settle.rateOther") : t("usd.settle.rateToday")}</span>
          </label>
        </div>
        {other && <input data-usd-reason className="input" placeholder={t("usd.settle.reason")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
        <div className="flex gap-1.5" role="radiogroup">
          {METHODS.map((m) => (
            <button key={m} type="button" role="radio" aria-checked={method === m} onClick={() => { playTap(); setMethod(m); }}
              className={cn("flex-1 rounded-xl border px-3 py-2 text-sm font-bold transition", method === m ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "border-line text-ink-muted hover:bg-surface-2")}>
              {t(`usd.method.${m}`)}
            </button>
          ))}
        </div>
        </fieldset>

        {pv && cents != null && rate != null && (
          <div className="space-y-1 rounded-2xl border border-line p-3 text-sm" data-usd-preview>
            <p className="font-bold text-ink" dir="auto">{t("usd.settle.drawer", { usd: usdIso(cents), r: formatNum(Number(rate) / 10_000), v: iqd(pv.received) })}</p>
            <p className="text-ink-muted">{t("usd.settle.share", { v: iqd(pv.share) })}
              {pv.fx !== 0n && <> · <span className={pv.fx > 0n ? "font-semibold text-success-700 dark:text-success-300" : "font-semibold text-danger-600"}>{pv.fx > 0n ? t("usd.settle.fxGain", { v: iqd(pv.fx) }) : t("usd.settle.fxLoss", { v: iqd(-pv.fx) })}</span></>}
            </p>
            {pv.received === 0n && closes && <p className="text-2xs text-warn-700 dark:text-warn-300">{t("usd.settle.zeroCash")}</p>}
            {refusal ? <p className="font-semibold text-danger-600">{t(`usd.err.${refusal}`)}</p>
              : closes ? <p className="flex items-center gap-1 font-semibold text-success-700 dark:text-success-300"><CheckCircle2 size={14} /> {t("usd.settle.closes")}</p>
              : <p className="font-semibold text-warn-700 dark:text-warn-300">{t("usd.settle.left", { v: usdIso(pv.dueAfterCents) })}</p>}
          </div>
        )}
        <Button className="w-full" loading={busy} disabled={blocked} leftIcon={<Coins size={16} />} onClick={submit} data-usd-settle-go>
          {t(pending ? "usd.settle.retry" : "usd.settle.confirm", { v: pv ? iqd(pv.received) : "—" })}
        </Button>
        <UsdSettlementList invoice={invoice} onChanged={onSettled} />
      </div>
    </Modal>
  );
}

/* ── التسديداتُ وإلغاؤها (للمدير وبسبب — الخادمُ يقرّر، والزرُّ يُرى لمن يقدر) ─────────────────────────── */
export function UsdSettlementList({ invoice, onChanged, canVoid = true }: { invoice: Invoice; onChanged: () => void; canVoid?: boolean }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [rows, setRows] = useState<UsdSettlement[] | null | "failed">(null);
  const [voiding, setVoiding] = useState<string | null>(null);
  const [why, setWhy] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => { setRows(null); usdApi.settlements([invoice.id]).then(setRows, () => setRows("failed")); }, [invoice.id]);
  useEffect(load, [load, invoice.paid_usd]);
  if (rows === "failed") return <button type="button" className="text-xs font-semibold text-brand-600" onClick={load}>{t("usd.retry")}</button>;
  if (rows === null) return <Loader2 size={14} className="animate-spin text-ink-subtle" />;
  if (rows.length === 0) return null;
  const doVoid = async (id: string) => {
    if (busy || !why.trim()) return;
    setBusy(true);
    try { await usdApi.voidSettlement(id, why); playSuccess(); toast.success(t("usd.settle.voidDone")); setVoiding(null); setWhy(""); load(); onChanged(); }
    catch (e) { playWarning(); toast.error(usdErrorText(e, t)); }
    finally { setBusy(false); }
  };
  return (
    <div data-usd-settlements>
      <p className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted"><History size={13} /> {t("usd.settle.history")}</p>
      <ul className="divide-y divide-line rounded-xl border border-line text-xs">
        {rows.map((s) => (
          <li key={s.id} className={cn("px-3 py-2", s.voided_at && "opacity-60")}>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span className={cn("font-bold tabular-nums text-ink", s.voided_at && "line-through")} dir="auto">
                {t("usd.settle.row", { usd: usdIso(centsOfNum(s.usd)), r: formatNum(s.rate), v: iqd(s.received) })}
              </span>
              {s.fx !== 0 && <span className={s.fx > 0 ? "text-success-700 dark:text-success-300" : "text-danger-600"}>{t("usd.settle.fxRow", { v: (s.fx > 0 ? "+" : "−") + iqd(Math.abs(s.fx)) })}</span>}
              <span className="text-ink-subtle">{t(`usd.method.${s.method}`)} · {formatDate(s.at, i18n.language)} {formatTime(s.at, i18n.language)}</span>
              {s.rate_note && <span className="text-ink-subtle">«{s.rate_note}»</span>}
              {canVoid && !s.voided_at && voiding !== s.id && (
                <button type="button" className="ms-auto inline-flex items-center gap-1 font-bold text-danger-600" onClick={() => { playTap(); setVoiding(s.id); setWhy(""); }}><Ban size={12} /> {t("usd.settle.void")}</button>
              )}
            </div>
            {s.voided_at && <p className="mt-0.5 text-danger-600">{t("usd.settle.voided", { why: s.void_reason ?? "" })}</p>}
            {voiding === s.id && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input h-8 min-w-0 flex-1 text-xs" autoFocus placeholder={t("usd.settle.voidReason")} value={why} maxLength={200} onChange={(e) => setWhy(e.target.value)} />
                <Button size="sm" variant="danger" loading={busy} disabled={!why.trim()} onClick={() => doVoid(s.id)}>{t("usd.settle.voidConfirm")}</Button>
                <button type="button" className="text-ink-muted" onClick={() => setVoiding(null)}>{t("usd.cancel")}</button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ══ ٤) فاتورةُ الدولار بتفاصيل الفاتورة: الدولارُ أوّلاً، والتسديدُ وإلغاؤه والحذفُ من هنا ═══════════════════ */
export function UsdInvoicePanel({ invoice, canDelete, onChanged, onDeleted }: { invoice: Invoice; canDelete: boolean; onChanged: () => void; onDeleted: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [settling, setSettling] = useState(false);
  const [askDel, setAskDel] = useState(false);
  const [busy, setBusy] = useState(false);
  const total = centsOfNum(invoice.total_usd), paid = centsOfNum(invoice.paid_usd), due = total - paid;
  const refunded = (invoice.status ?? "paid") === "refunded";
  const del = async () => {
    if (busy) return;
    setBusy(true);
    try { await usdApi.deleteInvoice(invoice.id); playSuccess(); toast.success(t("usd.inv.deleted")); onDeleted(); }
    catch (e) { playWarning(); toast.error(usdErrorText(e, t)); }
    finally { setBusy(false); }
  };
  return (
    <div className="space-y-3 rounded-2xl border border-success-200 bg-success-50/40 p-3 dark:border-success-500/30 dark:bg-success-500/5" data-usd-invoice>
      <div className="flex items-center gap-2"><UsdChip /><span className="text-xs text-ink-muted">{t("usd.inv.rate", { r: formatNum(invoice.fx_rate ?? 0) })}</span></div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div><p className="text-2xs text-ink-subtle">{t("usd.inv.total")}</p><p className="font-display text-lg font-extrabold tabular-nums text-ink" dir="ltr">{usdText(total)}</p></div>
        <div><p className="text-2xs text-ink-subtle">{t("usd.inv.paid")}</p><p className="font-display text-lg font-extrabold tabular-nums text-success-700 dark:text-success-300" dir="ltr">{usdText(paid)}</p></div>
        <div><p className="text-2xs text-ink-subtle">{t("usd.inv.due")}</p><p className={cn("font-display text-lg font-extrabold tabular-nums", due > 0n ? "text-warn-600 dark:text-warn-300" : "text-ink-subtle")} dir="ltr">{usdText(due)}</p></div>
      </div>
      <p className="text-center text-2xs text-ink-subtle">{t("usd.inv.iqd", { v: iqd(centsOfNum(invoice.total) / 100n) })}</p>
      {!refunded && due > 0n && <Button className="w-full" leftIcon={<Coins size={16} />} onClick={() => { playTap(); setSettling(true); }} data-usd-settle-open>{t("usd.settle.btn")}</Button>}
      <UsdSettlementList invoice={invoice} onChanged={onChanged} />
      <p className="text-2xs text-ink-subtle">{t("usd.inv.locked")}</p>
      {canDelete && (askDel ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-danger-50 p-2 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
          <span className="min-w-0 flex-1">{t("usd.inv.deleteAsk")}</span>
          <Button size="sm" variant="danger" loading={busy} onClick={del}>{t("usd.inv.delete")}</Button>
          <button type="button" className="text-ink-muted" onClick={() => setAskDel(false)}>{t("usd.cancel")}</button>
        </div>
      ) : (
        <button type="button" className="inline-flex items-center gap-1 text-xs font-bold text-danger-600" onClick={() => { playTap(); setAskDel(true); }} data-usd-delete><Trash2 size={13} /> {t("usd.inv.delete")}</button>
      ))}
      <UsdSettleDialog invoice={settling ? invoice : null} onClose={() => setSettling(false)} onSettled={() => { setSettling(false); onChanged(); }} />
    </div>
  );
}

/* ══ ٥) سطرُ الدين بدفتر الزبون: الباقي بالدولار وزرُّ التسديد ══════════════════════════════════════════ */
export function UsdDebtActions({ invoice, onChanged }: { invoice: Invoice; onChanged: () => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" leftIcon={<Coins size={15} />} onClick={() => { playTap(); setOpen(true); }} data-usd-debt-settle>{t("usd.settle.btn")}</Button>
      <UsdSettleDialog invoice={open ? invoice : null} onClose={() => setOpen(false)} onSettled={() => { setOpen(false); onChanged(); }} />
    </>
  );
}

