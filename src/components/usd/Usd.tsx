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
import type { Invoice, InvoiceItem } from "@/types";
import { Button, useToast } from "@/components/ui";
import { Modal } from "@/components/Modal";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatDate, formatNum, formatTime, uuid } from "@/lib/utils";
import { usdApi, type UsdMethod, type UsdRate, type UsdSettlement } from "@/lib/usdApi";
import { shouldReleaseRef } from "@/lib/errors";
import { centsOf, farFrom, iqdOf, per100Of, previewSettle, rate1e4Of, rateOfPer100, rateOk, settleRefusal, USD_ROUND_STEPS, usdText } from "@/lib/usdMath";
import { usdDraftProblem, type UsdBlockers, type UsdDraft } from "@/lib/usdProduct";
import { subUsdComputed } from "@/lib/dualPrice";
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

/* ══ ٢) حقولُ السعر بنموذج المادّة (المسودّةُ بيد النموذج — usdProduct.ts) ══════════════════════════════
 * ثلاثُ طرق (0282): بالدينار وحده، **بالدينار والدولار** (المادّةُ دينارٌ بكلّ آلته — الوحدةُ الفرعية والكراتين — ولها سعرٌ بالدولار
 * يختاره السطرُ بالبيع)، وبالدولار وحده (0264: بيعُ الدولار ودَينُه بالدولار، بلا وحدةٍ فرعية ولا وزنٍ ولا حوض). */
export function UsdPriceFields({ value, onChange, blockers, showProblems, onEnabled, sub }: {
  value: UsdDraft; onChange: (d: UsdDraft) => void; blockers: UsdBlockers; showProblems: boolean;
  /** النموذجُ لا يرسل حقلاً بالدولار إلا بعد أن يعرف أن الميزة مفعّلة (قاعدةٌ قبل 0264 لا تعرف الأعمدة). */
  onEnabled: (on: boolean) => void;
  /** الوحدةُ الفرعية كما بالنموذج — لسعرها بالدولار بالطريقة الثانية (فارغٌ = العلبةُ ÷ العدد). */
  sub?: { on: boolean; per: number; name: string; ready: boolean };
}) {
  const { t } = useTranslation();
  const { state, failed, reload } = useUsdState();
  useEffect(() => { onEnabled(!!state?.enabled); }, [state?.enabled, onEnabled]);
  if (!state?.enabled && !value.on && !value.dual) return null;
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
  const what = [blockers.weight && t("usd.prod.bWeight"), blockers.sub && t("usd.prod.bSub"), blockers.pooled && t("usd.prod.bPooled")].filter(Boolean).join("، ");
  const mode: "iqd" | "dual" | "usd" = value.on ? "usd" : value.dual ? "dual" : "iqd";
  const pick = (m: typeof mode) => { if (m === mode) return; playTap(); onChange({ ...value, on: m === "usd", dual: m === "dual" }); };
  /* الحسابُ نفسُه الذي يبيع به الكاشير (`subUsdComputed` بالسنت) — العائمُ هنا قال 0.57 عن علبة 1.15$ بمفردين والبيعُ 0.58، ومكتوبٌ 0.57
   * عمداً يساوي «المحسوب» فيُحفظ تلقائياً ويُباع 0.58 (مراجعة 0282). */
  const subAutoText = sub?.on ? subUsdComputed(value.sell, sub.per) : "";
  /* «دينار + دولار» لا يُعرض قبل أن تعرفه القاعدة (0282): سعرٌ يُكتب قبلها يمسحه تنظيفُها أوّلَ تطبيق. ومادّةٌ تُقرأ «بسعرين» قبلها تبقى
   * على اختيارها (لا يختفي ما هو مختار). */
  const dualOk = !!sub?.ready || mode === "dual";
  return (
    <div className={cn("rounded-2xl border p-3", mode !== "iqd" ? "border-success-200 bg-success-50/50 dark:border-success-500/30 dark:bg-success-500/10" : "border-line")} data-usd-fields>
      <span className="flex items-center gap-1.5 text-sm font-bold text-ink"><DollarSign size={15} className="text-success-600" /> {t("usd.prod.modeLabel")}</span>
      <div role="radiogroup" className={cn("mt-2 grid gap-1 rounded-xl bg-surface-2 p-1", dualOk ? "grid-cols-3" : "grid-cols-2")} data-usd-mode={mode}>
        {(["iqd", "dual", "usd"] as const).filter((m) => m !== "dual" || dualOk).map((m) => (
          <button key={m} type="button" role="radio" aria-checked={mode === m} data-usd-modebtn={m} onClick={() => pick(m)}
            className={cn("rounded-lg px-1.5 py-1.5 text-xs font-bold transition", mode === m ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted hover:text-ink")}>
            {t(m === "iqd" ? "usd.prod.modeIqd" : m === "dual" ? "usd.prod.modeDual" : "usd.prod.modeUsd")}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-2xs text-ink-subtle">{t(mode === "usd" ? "usd.prod.toggleHint" : mode === "dual" ? "usd.prod.dualHint" : "usd.prod.iqdHint")}</p>
      {mode !== "iqd" && (
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
          {mode === "dual" && sub?.on && sub.ready && (
            <label className="block">
              <span className="label">{t("usd.prod.subUsd", { sub: sub.name.trim() || t("usd.prod.subWord") })}</span>
              {/* الحسابُ ينزل بالخانة ويبقى محسوباً ما دام يساويه (قرارُ المالك ١٦/١١ للكارتون، و١٩/١١ للمفرد). */}
              <input data-usd-sub className={cn("input tabular-nums", showProblems && problem === "sub" && "border-danger-400")} dir="ltr" inputMode="decimal" placeholder="0.00"
                value={value.sub.trim() ? value.sub : subAutoText}
                onChange={(e) => { const v = e.target.value; onChange({ ...value, sub: v.trim() === subAutoText ? "" : v }); }} />
              {!value.sub.trim() && subAutoText && <span className="mt-0.5 block text-2xs text-ink-subtle" data-usd-subauto>{t("usd.prod.subAuto", { v: subAutoText, n: formatNum(sub.per) })}</span>}
            </label>
          )}
          <p className="text-2xs text-ink-muted">
            {sell != null && r ? t("usd.prod.approx", { v: iqd(iqdOf(sell, r.rate1e4, 1)) }) : !r ? t("usd.prod.noRate") : null}
            {sell != null && buy != null && <> · {t("usd.prod.profit", { v: usdIso(sell - buy) })}</>}
          </p>
          {problem === "blocked" && <p className="rounded-lg bg-danger-50 p-2 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-usd-blocked>{mode === "usd" ? t(dualOk ? "usd.prod.blocked" : "usd.prod.blockedIqd", { what }) : t("usd.prod.blockedDual")}</p>}
          {showProblems && problem === "sell" && <p className="text-xs font-semibold text-danger-600">{t("usd.prod.needSell")}</p>}
          {showProblems && problem === "buy" && <p className="text-xs font-semibold text-danger-600">{t("usd.prod.badBuy")}</p>}
          {showProblems && problem === "sub" && <p className="text-xs font-semibold text-danger-600">{t("usd.prod.badSub")}</p>}
          {mode === "usd" && <p className="text-2xs text-ink-subtle">{t("usd.prod.noStore")}</p>}
        </div>
      )}
    </div>
  );
}

/* ══ ٣) التسديدُ بالدينار ══════════════════════════════════════════════════════════════════════════ */
const METHODS: UsdMethod[] = ["cash", "card", "transfer"];
export function UsdSettleDialog({ invoice, onClose, onSettled }: { invoice: Invoice | null; onClose: () => void; onSettled: () => void }) {
  const { t, i18n } = useTranslation();
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
  /* 0286 (قرارُ المالك ٢١/١١): «الدكتور يشوف بيش جان الدولار بذاك اليوم ويكدر من يمه يحدد اذا راح يبيع بنفس السعر او يغير لاي سعر».
   * فسعرُ يوم البيع (على الفاتورة) وسعرُ اليوم زرّان، والخانةُ لأيّ سعر — بلا مديرٍ ولا سبب؛ والسعرُ المختار يُختم على التسديد. */
  const saleRate = rate1e4Of(invoice?.fx_rate ?? null);
  const salePer100 = saleRate != null && rateOk(saleRate) ? String(per100Of(saleRate)) : "";
  const [savingRate, setSavingRate] = useState(false);
  /** السعرُ البعيد (>٢٠٪ عن سعر يوم البيع وسعر اليوم) أُكِّد لهذا النصّ بعينه — تغييرُه يُسقط التأكيد (مراجعة 0286: «15000» بدل «150000»). */
  const [farAck, setFarAck] = useState<string | null>(null);
  const freshRate = useCallback(() => {
    // السعرُ يُسأل عند كلّ فتح (المخبأُ دقيقة): سعرُ أمس بخانةٍ مملوءةٍ كان يُسدَّد به وهو يبدو «سعر اليوم». وبلا سعرٍ بالعيادة: سعرُ يوم البيع.
    setPer100("");
    refreshUsdState().then((st) => setPer100(st.rate ? String(per100Of(st.rate.rate1e4)) : salePer100), () => setPer100(salePer100));
  }, [salePer100]);
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
  const isSaleRate = rate != null && saleRate != null && rate === saleRate;
  const isTodayRate = !!today && rate != null && rate === today.rate1e4;
  const pv = cents != null && rate != null && rateOk(rate)
    ? previewSettle({ usdCents: cents, rate1e4: rate, step, totalUsdCents: totalUsd, paidUsdCents: paidUsd, totalIqd: centsOfNum(invoice.total) / 100n, paidIqd: centsOfNum(invoice.amount_paid ?? 0) / 100n })
    : null;
  const refusal = pv && cents != null ? settleRefusal(cents, due, pv.received) : cents == null || cents <= 0n ? "usd_amount" : null;
  const closes = pv != null && cents != null && cents >= due;
  // سعرُ اليوم القديم (مو من اليوم) يُسأل عنه قبل أن يُسدَّد به — أمّا سعرٌ يختاره الطبيب (يوم البيع أو غيره) فهو قرارُه.
  const blocked = busy || !state?.enabled || !pv || !!refusal || (stale && isTodayRate) || (typeof navigator !== "undefined" && navigator.onLine === false);
  /* صفرٌ زائدٌ أو ناقص كان يحرسه «للمدير وبسبب»؛ بعد 0286 يُسأل: سعرٌ بعيدٌ عن الاثنين بأكثر من ٢٠٪ يحتاج ضغطةً ثانية بعد أن يُقال. */
  const far = rate != null && rateOk(rate) && farFrom(rate, [saleRate, today?.rate1e4]);
  const farPending = far && farAck !== per100.trim();
  /** «خلّيه سعر اليوم»: السعرُ المكتوب يصير سعرَ العيادة اليوم (0286: لكلّ الكادر) — من نافذة التسديد بلا الإعدادات. */
  const makeToday = async () => {
    if (savingRate || rate == null || !rateOk(rate) || isTodayRate) return;
    if (farPending) { playWarning(); setFarAck(per100.trim()); return; }   // تُقال الجملةُ أوّلاً، والضغطةُ الثانية تكتب
    setSavingRate(true);
    try {
      await usdApi.setRate(per100, null);
      playSuccess();
      toast.success(t("usd.set.rateSaved", { v: iqd(per100Of(rate)) }));
      await refreshUsdState().catch(() => undefined);
      reload();
    } catch (e) { playWarning(); toast.error(usdErrorText(e, t)); }
    finally { setSavingRate(false); }
  };
  const submit = async () => {
    if (blocked) return;
    if (farPending) { playWarning(); setFarAck(per100.trim()); return; }
    setBusy(true);
    const fresh = !sent;
    setSent(true);
    try {
      // الملاحظةُ تُرسل ما دامت خانتُها ظاهرة (سعرٌ غيرُ سعر اليوم) — نصٌّ كُتب ثمّ اختفت خانتُه لا يُحفظ بالخفاء.
      await usdApi.settle(invoice.id, usd, per100, method, usdText(due).replace(/[$,]/g, ""), other && reason.trim() ? reason : null, ref);
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
        {stale && today && isTodayRate && <StaleRateBanner rate={today} onAck={ack} />}
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
            <input data-usd-rate className={cn("input tabular-nums", other && !isSaleRate && "border-warn-400")} dir="ltr" inputMode="decimal" value={per100} onChange={(e) => setPer100(e.target.value)} />
            <span className={cn("mt-1 block text-2xs", isTodayRate || isSaleRate ? "text-ink-subtle" : "font-semibold text-warn-700 dark:text-warn-300")} data-usd-ratekind>
              {rate == null || !rateOk(rate) ? t("usd.err.usd_rate_bad") : isSaleRate ? t("usd.settle.rateSale") : isTodayRate ? t("usd.settle.rateToday") : t("usd.settle.rateMine")}
            </span>
          </label>
        </div>
        {/* سعرُ يوم البيع وسعرُ اليوم زرّان فوق الخانة — الطبيبُ يشوف الاثنين ويختار، أو يكتب غيرَهما. */}
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("usd.settle.rate")}>
          {salePer100 && (
            <button type="button" data-usd-rate-sale aria-pressed={isSaleRate} onClick={() => { playTap(); setPer100(salePer100); }}
              className={cn("rounded-xl border px-3 py-1.5 text-xs font-bold transition", isSaleRate ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "border-line text-ink-muted hover:bg-surface-2")}>
              {t("usd.settle.pickSale", { v: iqd(per100Of(saleRate!)), d: formatDate(invoice.created_at, i18n.language) })}
            </button>
          )}
          {today && (
            <button type="button" data-usd-rate-today aria-pressed={isTodayRate} onClick={() => { playTap(); setPer100(String(per100Of(today.rate1e4))); }}
              className={cn("rounded-xl border px-3 py-1.5 text-xs font-bold transition", isTodayRate ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-200" : "border-line text-ink-muted hover:bg-surface-2")}>
              {t("usd.settle.pickToday", { v: iqd(per100Of(today.rate1e4)) })}
            </button>
          )}
          {rate != null && rateOk(rate) && !isTodayRate && state?.enabled && (
            <button type="button" data-usd-rate-maketoday disabled={savingRate} onClick={() => { playTap(); void makeToday(); }}
              className="rounded-xl px-2 py-1.5 text-xs font-bold text-brand-600 hover:underline disabled:opacity-50">
              {savingRate ? <Loader2 size={12} className="inline animate-spin" /> : t("usd.settle.makeToday")}
            </button>
          )}
        </div>
        {other && <input data-usd-reason className="input" placeholder={t("usd.settle.note")} value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />}
        {far && (
          <p role="alert" data-usd-far className={cn("rounded-xl border p-2.5 text-xs font-semibold", farPending ? "border-warn-300 bg-warn-50 text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" : "border-line text-ink-muted")}>
            {t("usd.settle.far", { v: iqd(per100Of(rate!)), one: formatNum(Number(rate!) / 10_000) })}
          </p>
        )}
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
          {t(pending ? "usd.settle.retry" : far && farAck === per100.trim() ? "usd.settle.farGo" : "usd.settle.confirm", { v: pv ? iqd(pv.received) : "—" })}
        </Button>
        <UsdSettlementList invoice={invoice} onChanged={onSettled} />
      </div>
    </Modal>
  );
}

/* ── التسديداتُ وإلغاؤها (للمدير وبسبب — الخادمُ يقرّر، والزرُّ يُرى لمن يقدر) ─────────────────────────── */
/** دفعةٌ بمعاملة البيع نفسِها (usd_checkout تسدّد بعد الإدراج بنفس now()): ختمُها لا يتجاوز إنشاءَ الفاتورة — وثوانٍ للتجريبيّ (ساعةُ الجهاز). */
export const atSaleOf = (at: string, created: string): boolean => {
  const a = Date.parse(at), c = Date.parse(created);
  return Number.isFinite(a) && Number.isFinite(c) && a - c <= 5_000;
};
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
              {/* 0286: ما دُفع ساعةَ البيع (بنفس معاملتها) ليس «تسديداً بعدها» — يُقال كذلك. */}
              {atSaleOf(s.at, invoice.created_at)
                ? <span className="rounded bg-success-50 px-1.5 py-0.5 font-bold text-success-700 dark:bg-success-500/15 dark:text-success-300" data-usd-atsale>{t("usd.settle.atSale")}</span>
                : <span className="text-ink-subtle">{t(`usd.method.${s.method}`)} · {formatDate(s.at, i18n.language)} {formatTime(s.at, i18n.language)}</span>}
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


/* ══ ٥) البيعةُ بمجموعين: نصفُ الدولار داخل فاتورة الدينار (0286 — طلبُ المالك ٢١/١١: «صف واحد للبيعة») ══════════════════
 * الفاتورتان (R وR~usd) تُفتحان نافذةً واحدة: سطورُ الدينار ومجاميعُها كما هي، وتحتها سطورُ الدولار بالدولار ولوحتُها (المسدَّد،
 * الباقي، «سدّد بالدولار» بسعر يوم البيع أو اليوم أو أيّ سعر، والتسديدات). السطورُ تُجلب بالنافذة الأمّ (تُطبع معها). */
export function UsdTwinSection({ twin, items, onRetry, canDelete, onChanged, onDeleted }: {
  /** null = ما عُرف بعدُ هل للبيعة نصفٌ بالدولار (سؤالُ المرجع فشل) — يُقال ويُعاد، ولا يُحكم «بلا دولار». */
  twin: Invoice | null; items: InvoiceItem[] | null | "failed"; onRetry: () => void;
  canDelete: boolean; onChanged: () => void; onDeleted: () => void;
}) {
  const { t } = useTranslation();
  if (!twin) return (
    <div role="alert" className="flex flex-wrap items-center gap-2 rounded-2xl border border-warn-200 p-3 text-xs dark:border-warn-500/30" data-usd-twin-lookup-failed>
      <span className="min-w-0 flex-1 font-semibold text-warn-800 dark:text-warn-200">{t("usd.twin.lookupFailed")}</span>
      <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />} onClick={() => { playTap(); onRetry(); }}>{t("usd.retry")}</Button>
    </div>
  );
  return (
    <div className="space-y-2" data-usd-twin>
      <p className="flex items-center gap-2 text-xs font-bold text-ink-muted"><UsdChip /> {t("usd.twin.title")}</p>
      <div className="rounded-2xl border border-success-200 dark:border-success-500/30">
        {items === null ? (
          <div className="grid place-items-center p-4"><Loader2 size={16} className="animate-spin text-ink-subtle" /></div>
        ) : items === "failed" ? (
          <div role="alert" className="flex flex-wrap items-center gap-2 p-3 text-xs" data-usd-twin-failed>
            <span className="min-w-0 flex-1 font-semibold text-danger-700 dark:text-danger-300">{t("usd.twin.itemsFailed")}</span>
            <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />} onClick={() => { playTap(); onRetry(); }}>{t("usd.retry")}</Button>
          </div>
        ) : (
          <div className="divide-y divide-line">
            {items.map((it) => (
              <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{it.name}</p>
                  <p className="text-xs text-ink-subtle">{formatNum(it.qty)}{it.unit_label ? ` ${it.unit_label}` : ""} × <bdi dir="ltr">{usdText(centsOfNum(it.unit_price_usd))}</bdi></p>
                </div>
                <span className="text-sm font-bold tabular-nums text-ink"><bdi dir="ltr">{usdText(centsOfNum(it.unit_price_usd) * centsOfNum(it.qty) / 100n)}</bdi></span>
              </div>
            ))}
          </div>
        )}
      </div>
      <UsdInvoicePanel invoice={twin} canDelete={canDelete} onChanged={onChanged} onDeleted={onDeleted} />
      {/* الترجيعُ والحذفُ بأسفل النافذة لفاتورة الدينار — نصفُ الدولار يُسدَّد ويُحذف من لوحته (مراجعة 0286: «حذفتُ البيعة» وبقي دولارُها). */}
      <p className="text-2xs text-ink-subtle" data-usd-twin-note>{t("usd.twin.partNote")}</p>
    </div>
  );
}
