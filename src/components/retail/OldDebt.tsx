/* ============================================================================
 * الديونُ القديمة (0271) — «دين قديم» بسجلّ الديون وبملفّ الزبون، وشارةُ «دين سابق» أينما يظهر.
 *
 * طلبُ المالك: «من داخل الديون أضيف ديون قديمة على ناس أني أطلبهم: شنو وليش وشكد وشوكت، بالدولار أو بالعراقي». الدينُ القديم
 * فاتورةٌ معلَّمة (sale_kind = "opening") بلا موادّ — ليس بيعاً بأيّ تقرير، وتسديدُه بالأزرار الحاليّة يدخل الدرجَ بيومه.
 *
 *  • الزرُّ للمدير (أو مفتاحِه الحيّ) — والقاعدةُ ترفض غيرَه أيضاً (old_debt_manager): الإخفاءُ راحةٌ لا حارس.
 *  • الزبونُ بخانتَي الاسم والرقم نفسَيهما وبحثِهما (CustomerSearch، كالبيع و«حالة جديدة») — فلا يصير الزبونُ زبونين؛
 *    ومن ملفّ الزبون يُكتب على زبونه وحده (الخانتان مقفولتان: الرقمُ هويّة).
 *  • مرجعُ إعادةٍ واحد للنافذة: رفضٌ حاسمٌ يحرّره، والنتيجةُ المجهولة (الشبكة) تقفل النافذةَ على «أعد المحاولة» بالمرجع
 *    نفسِه — الإعادةُ تُرجع الدينَ نفسَه لا ديناً ثانياً (shouldReleaseRef).
 *  • الدولار إن كان مفعّلاً وبسعر: يُكتب المبلغُ بالدولار، والخادمُ يحسب دينارَه بسعر اليوم.
 *
 * النصوصُ بنطاقٍ مملوك `odebt` (hot-paths.json): النصفُ البارد على سقفه و`retail` حارّ. القطعةُ كسولةٌ من كلّ مستعمل
 * بـpage(…, ["odebt"]).
 * ========================================================================= */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { History, Coins, RotateCcw, AlertTriangle, CalendarClock, NotebookPen } from "lucide-react";
import type { CustomerHit, Invoice } from "@/types";
import { Modal } from "@/components/Modal";
import { Button, useToast } from "@/components/ui";
import { useCustomerSearch, CustomerDropdown, type CustField } from "@/components/retail/CustomerSearch";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride, capLockedFrom } from "@/lib/managerOverride";
import { addOldDebt, isOldDebtAbsent, type OldDebtCurrency } from "@/lib/oldDebtApi";
import { canonDec, centsOf } from "@/lib/usdMath";
import { getActiveClinicId } from "@/lib/clinics";
import { describeDbError, shouldReleaseRef } from "@/lib/errors";
import { cn, formatDate, formatNum, money, uid } from "@/lib/utils";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* محاولةٌ مجهولةُ المصير تعيش بالجلسة لا بالنافذة: إغلاقُها وفتحُها كان يولّد مرجعاً جديداً فيُكتب الدينُ مرّتين.
 * بالعيادة (مفتاحُها المحلّيّ) — مرجعٌ معلَّقٌ لعيادةٍ لا يُعاد بأخرى. */
type Pending = { ref: string; name: string; phone: string; what: string; why: string; amount: string; currency: OldDebtCurrency; date: string };
const pendKey = () => `vp_odebt_pending_${getActiveClinicId()}`;
const readPending = (): Pending | null => {
  try { const v = JSON.parse(sessionStorage.getItem(pendKey()) || "null") as Pending | null; return v && typeof v.ref === "string" ? v : null; } catch { return null; }
};
const writePending = (p: Pending | null) => {
  try { if (p) sessionStorage.setItem(pendKey(), JSON.stringify(p)); else sessionStorage.removeItem(pendKey()); } catch { /* swallow-ok: بلا تخزين تبقى النافذةُ مقفولةً ما دامت مفتوحة */ }
};

const localYMD = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** رموزُ الخادم (ومرآتِه التجريبية بلا تلميح) بجملها، وغيرُها كما يشرحها describeDbError. */
function errText(e: unknown, t: TFunction): string {
  const msg = String((e as { message?: string } | null)?.message ?? "");
  if (isOldDebtAbsent(e)) return t("odebt.err.absent");
  for (const c of ["manager", "customer", "what", "long", "amount", "date", "currency", "ref"] as const) {
    if (msg.includes(`old_debt_${c}`)) return t(`odebt.err.${c}`);
  }
  if (msg.includes("usd_disabled") || msg.includes("usd_no_rate")) return t("odebt.err.usd");
  if (msg.includes("operator_not_allowed")) return t("odebt.err.operator");
  return describeDbError(e, t);
}

/** المديرُ (أو مفتاحُه الحيّ) وجهازٌ غيرُ مقفول — حكمُ أزرار الحذف نفسُه. */
function useCanOldDebt(): boolean {
  const { role } = usePermissions();
  const ov = useOverride();
  return !capLockedFrom(ov.deviceLocked, ov.active, role === "manager");
}

/* ─────────────────────────────── الزرّ ─────────────────────────────── */
export function OldDebtButton({ prefill, onAdded, full }: {
  prefill?: { name: string | null; phone: string | null } | null;
  onAdded?: (inv: Invoice) => void;
  full?: boolean;
}) {
  const { t } = useTranslation();
  const can = useCanOldDebt();
  const [open, setOpen] = useState(false);
  if (!can) return null;
  return (
    <>
      <Button variant="secondary" size={full ? "md" : "sm"} className={cn(full && "w-full")} leftIcon={<History size={15} />}
        onClick={() => { playTap(); setOpen(true); }} data-odebt-open>
        {prefill ? t("odebt.addFor") : t("odebt.add")}
      </Button>
      {open && <OldDebtDialog prefill={prefill ?? null} onClose={() => setOpen(false)} onAdded={(inv) => { setOpen(false); onAdded?.(inv); }} />}
    </>
  );
}

/* ─────────────────────────────── النافذة ─────────────────────────────── */
type UsdInfo = { state: "loading" } | { state: "off" } | { state: "failed" } | { state: "on"; per100: number };

function OldDebtDialog({ prefill, onClose, onAdded }: {
  prefill: { name: string | null; phone: string | null } | null;
  onClose: () => void;
  onAdded: (inv: Invoice) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const cs = useCustomerSearch();
  /* محاولةٌ مجهولةٌ سابقة (أُغلقت النافذةُ عليها) ترجع كما أُرسلت ومقفولةً على الإعادة — أيّاً كان الزبونُ الذي فُتحت له. */
  const [pend] = useState(readPending);
  const locked = !!prefill || !!pend;
  const [name, setName] = useState(pend?.name ?? prefill?.name ?? "");
  const [phone, setPhone] = useState(pend?.phone ?? prefill?.phone ?? "");
  const [what, setWhat] = useState(pend?.what ?? "");
  const [why, setWhy] = useState(pend?.why ?? "");
  const [amount, setAmount] = useState(pend?.amount ?? "");
  const [currency, setCurrency] = useState<OldDebtCurrency>(pend?.currency ?? "IQD");
  const today = localYMD();
  const [date, setDate] = useState(pend?.date ?? today);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** نتيجةُ محاولةٍ مجهولة (الشبكة): النافذةُ تُقفل على «أعد المحاولة» بالمرجع نفسِه — لا تعديلَ يرسل ديناً ثانياً. */
  const [pinned, setPinned] = useState(!!pend);
  const ref = useRef(pend?.ref ?? uid("odebt"));
  const [usd, setUsd] = useState<UsdInfo>({ state: "loading" });

  useEffect(() => {
    let live = true;
    import("@/lib/usdApi")
      .then((m) => m.usdApi.state())
      .then((s) => { if (live) setUsd(s.enabled && s.rate ? { state: "on", per100: Number(s.rate.rate) * 100 } : { state: "off" }); })
      .catch(() => { if (live) setUsd({ state: "failed" }); });
    return () => { live = false; };
  }, []);

  const cents = centsOf(amount);
  // المعلَّقةُ تُعاد كما أُرسلت (والخادمُ يُرجع ما ثبت بمرجعها) — لا تُحجب بفحص اليوم ولا بحال الدولار الآن.
  const ok = pinned || ((name.trim() !== "" || phone.trim() !== "") && what.trim() !== "" && cents != null && cents > 0n
    && date !== "" && date <= today && !(currency === "USD" && usd.state !== "on"));

  const pick = (h: CustomerHit) => {
    playTap();
    cs.close();
    setName(h.name ?? "");
    setPhone(h.phone ?? "");
  };
  const keys = (field: CustField) => (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      if (cs.open && cs.rows.length > 0) { e.preventDefault(); cs.move(e.key === "ArrowDown" ? 1 : -1); }
      return;
    }
    if (e.key === "Escape") { if (cs.open) { e.preventDefault(); cs.close(); } return; }
    if (e.key === "Enter" && cs.field === field) {
      const h = cs.highlighted();
      if (h) { e.preventDefault(); pick(h); }
    }
  };

  const save = async () => {
    if (busy || !ok) return;
    setBusy(true); setErr(null);
    const fresh = !pinned;
    try {
      const inv = await addOldDebt({
        name: name.trim() || null, phone: phone.trim() || null, what: what.trim(), why: why.trim() || null,
        amount: canonDec(amount, 2), currency, date: date === today ? null : date, clientRef: ref.current,
      });
      playSuccess();
      const shown = currency === "USD" ? `$${formatNum(Number(inv.total_usd ?? 0))}` : money(inv.total);
      toast.success(t("odebt.saved", { amount: shown, client: inv.customer_name || inv.customer_phone || "—" }));
      writePending(null);
      onAdded(inv);
    } catch (e) {
      playWarning();
      if (shouldReleaseRef(fresh, e)) { ref.current = uid("odebt"); setPinned(false); writePending(null); }
      else {
        setPinned(true);
        writePending({ ref: ref.current, name, phone, what, why, amount, currency, date });
      }
      setErr(errText(e, t));
    } finally {
      setBusy(false);
    }
  };

  const field = "block text-xs font-bold text-ink-muted mb-1";
  return (
    <Modal open onClose={() => { if (!busy) onClose(); }} title={t("odebt.title")}>
      <div className="space-y-3.5" data-odebt-dialog>
        <p className="rounded-xl bg-surface-2 p-3 text-xs leading-relaxed text-ink-muted">{t("odebt.intro")}</p>

        <fieldset disabled={pinned || busy} className="space-y-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="relative">
              <label className={field}>{t("odebt.name")}</label>
              <input className="input w-full" value={name} readOnly={locked} maxLength={80} data-odebt-name
                onChange={(e) => { setName(e.target.value); if (!locked) cs.type("name", e.target.value); }}
                onFocus={() => { if (!locked) cs.focus("name", name); }} onBlur={cs.blur} onKeyDown={keys("name")} />
              {!locked && cs.field === "name" && <CustomerDropdown cs={cs} onPick={pick} newLabel={t("odebt.newCustomer")} />}
            </div>
            <div className="relative">
              <label className={field}>{t("odebt.phone")}</label>
              <input className="input w-full" dir="ltr" inputMode="tel" value={phone} readOnly={locked} maxLength={40} data-odebt-phone
                onChange={(e) => { setPhone(e.target.value); if (!locked) cs.type("phone", e.target.value); }}
                onFocus={() => { if (!locked) cs.focus("phone", phone); }} onBlur={cs.blur} onKeyDown={keys("phone")} />
              {!locked && cs.field === "phone" && <CustomerDropdown cs={cs} onPick={pick} newLabel={t("odebt.newCustomer")} />}
            </div>
          </div>

          <div>
            <label className={field}>{t("odebt.what")}</label>
            <input className="input w-full" value={what} onChange={(e) => setWhat(e.target.value)} maxLength={200}
              placeholder={t("odebt.whatPh")} data-odebt-what />
          </div>
          <div>
            <label className={field}>{t("odebt.why")}</label>
            <textarea className="input min-h-[84px] w-full resize-y" value={why} onChange={(e) => setWhy(e.target.value)} maxLength={500} data-odebt-why />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label className={field}>{t("odebt.amount")}</label>
              <input className="input w-full text-end font-bold tabular-nums" inputMode="decimal" dir="ltr" value={amount}
                onChange={(e) => setAmount(e.target.value)} placeholder="0" data-odebt-amount />
            </div>
            <div className="sm:col-span-1">
              <label className={field}>{t("odebt.currency")}</label>
              <div className="flex gap-1 rounded-xl border border-line bg-surface-1 p-1">
                {(["IQD", "USD"] as const).map((c) => (
                  <button key={c} type="button" data-odebt-cur={c}
                    disabled={c === "USD" && usd.state !== "on"}
                    onClick={() => { playTap(); setCurrency(c); }}
                    className={cn("flex-1 rounded-lg px-2 py-1.5 text-sm font-bold transition disabled:opacity-40",
                      currency === c ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-surface-2")}>
                    {c === "IQD" ? t("odebt.iqd") : t("odebt.usd")}
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-1">
              <label className={field}>{t("odebt.date")}</label>
              <input type="date" className="input w-full" value={date} max={today} min="2000-01-01"
                onChange={(e) => setDate(e.target.value)} data-odebt-date />
            </div>
          </div>
          {currency === "USD" && usd.state === "on" && (
            <p className="text-2xs text-ink-subtle" data-odebt-usdnote>{t("odebt.usdNote", { rate: formatNum(usd.per100) })}</p>
          )}
          {usd.state === "failed" && <p className="text-2xs text-ink-subtle">{t("odebt.usdFailed")}</p>}
          {date !== "" && date < today && (
            <p className="flex items-center gap-1.5 text-2xs text-ink-subtle"><CalendarClock size={12} /> {t("odebt.dated", { day: formatDate(`${date}T12:00:00`, i18n.language, true) })}</p>
          )}
        </fieldset>

        {err && (
          <p role="alert" className="flex items-start gap-1.5 rounded-xl bg-danger-50 p-2.5 text-sm font-bold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-odebt-err>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" /> <span className="min-w-0 flex-1">{err}</span>
          </p>
        )}
        {pinned && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300" data-odebt-pinned>{t("odebt.unknown")}</p>}

        <div className="flex flex-wrap gap-2">
          <Button className="flex-1" loading={busy} disabled={!ok} onClick={save} data-odebt-save
            leftIcon={pinned ? <RotateCcw size={16} /> : <Coins size={16} />}>
            {pinned ? t("odebt.retry") : t("odebt.save")}
          </Button>
          <Button variant="secondary" disabled={busy} onClick={() => { playTap(); onClose(); }}>{t("odebt.cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────────── الشارة ─────────────────────────────── */
/** «دين سابق: شنو» — وبـ`full`: «ليش» وقاعدتا الغلط (لا ترجيع؛ حذفٌ قبل التسديد وإلا خصم). يومُ الكتابة يقوله رأسُ
 *  الفاتورة (شارةُ «سُجّلت لاحقاً»، 0242). */
export function OldDebtNote({ invoice, full }: { invoice: Invoice; full?: boolean }) {
  const { t } = useTranslation();
  const what = (invoice.opening_what ?? "").trim();
  const settled = (invoice.payment_details ?? []).length > 0 || (Number(invoice.amount_paid) || 0) > 0.005;
  const chip = (
    <span className="chip inline-flex max-w-full items-center gap-1 bg-violet-50 text-2xs font-bold text-violet-700 dark:bg-violet-500/15 dark:text-violet-300" data-odebt-tag>
      <History size={11} className="shrink-0" /> <span className="truncate">{what ? t("odebt.tagWhat", { what }) : t("odebt.tag")}</span>
    </span>
  );
  if (!full) return chip;
  return (
    <div className="space-y-1.5 rounded-xl border border-violet-200 bg-violet-50/60 p-3 text-sm dark:border-violet-500/30 dark:bg-violet-500/10" data-odebt-detail>
      <div>{chip}</div>
      {invoice.opening_why && (
        <p className="flex items-start gap-1.5 whitespace-pre-wrap text-xs text-ink [overflow-wrap:anywhere]"><NotebookPen size={13} className="mt-0.5 shrink-0 text-ink-subtle" /> {invoice.opening_why}</p>
      )}
      <p className="text-2xs leading-relaxed text-ink-muted">{settled ? t("odebt.noDelete") : t("odebt.rules")}</p>
    </div>
  );
}
