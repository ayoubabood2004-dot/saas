import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle, BadgePercent, Banknote, CreditCard, ArrowLeftRight, CheckCircle2, Printer, RotateCcw, Trash2, User, Wallet,
} from "lucide-react";
import type { DeliveryOrder, ForgiveReason, Invoice, InvoiceForgiveness, InvoiceItem, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride, ownerAccountFrom } from "@/lib/managerOverride";
import { useInvoicePrinter } from "./usePrintInvoice";
import { invoiceNo } from "@/lib/invoiceNo";
import { cn, money, formatDate, formatNum, dateLocale } from "@/lib/utils";
import { displayCustomerName } from "@/lib/customerName";
import { dueOf, paidOf, grossOf, round2 } from "@/lib/debt";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import {
  forgiveActor, forgiveCaps, forgiveDueOf, forgivePreview, validateForgive, validateVoid, profitOverstated, hasOpenDelivery,
  forgiveAccount, approverOf, FORGIVE_TOL, ABOVE_CAP_NOTE_MIN, FORGIVE_NOTE_MAX, VOID_REASON_MAX, type ForgiveActor,
} from "@/lib/debtForgive";
import { REASONS, reasonKey } from "@/lib/forgiveText";
import { settlementsOf } from "@/lib/settlementFeed";
import { staffRoster } from "@/lib/staffNames";
import { expectedServerClinic } from "@/lib/workspaceClinic";

/* ============================================================================
 * «خصم على الدين» (0241) — النافذةُ وسجلُّها ونوافذُ التأكيد التي تمسّ الدين.
 *
 * طلبُ المالك: **كلُّ شيءٍ محسوبٌ وظاهرٌ قبل الحفظ** — ربحُ الفاتورة ونسبتُه، وما دفعه
 * الزبونُ وما بقي عليه بكلّ فواتيره، وما خُصم له قبلُ، وما يُستعمل من سقف الربح. والحسابُ
 * كلُّه من debtForgive.ts (مرآةُ forgive_invoice_debt حرفاً): ما تقول عنه النافذةُ «مسموح»
 * لا يرفضه الخادم، وما فوق السقف يُقال قبل أن يُطلب سببٌ وإقرار.
 *
 * وحسابُ الزبون **يحجب الحفظ** حتى يكتمل: صورةٌ ناقصة تُصدَّق («ما خصمنا له قبل») أخطرُ من
 * انتظار — فالفشلُ «أعد المحاولة» لا لوحةٌ نصفُ فارغة.
 *
 * النصوصُ بنطاق fgv المملوك (hot-paths.json): هذه الوحدةُ لا تُستورد ثابتاً أبداً — تُحمَّل
 * بـpage(…, ["fgv"]) من الفاتورة والمرتجع، فتصل نصوصُها معها لا مع كلّ صفحة.
 * ==========================================================================*/

const PAY_ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: ArrowLeftRight };
const PAY_KEY: Record<PaymentMethod, string> = { cash: "retail.payCash", card: "retail.payCard", transfer: "retail.payTransfer" };
const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

/** رمزُ رفض الدالّة من خطئها (P0001: الرسالةُ الرمز، والتلميحُ العربيّ بـhint). */
const codeOf = (e: unknown): string => String((e as { message?: unknown } | null)?.message ?? "");
const pctText = (n: number | null): string => formatNum(n == null || !Number.isFinite(n) ? 0 : Math.round(n));
const timeOf = (iso: string, lang: string) => `${formatDate(iso, lang, true)} · ${new Date(iso).toLocaleTimeString(lang === "ar" ? dateLocale() : "en-GB", { hour: "2-digit", minute: "2-digit" })}`;
const hasCustomer = (inv: Invoice) => !!((inv.customer_name ?? "").trim() || (inv.customer_phone ?? "").trim());
const customerLabel = (inv: Invoice) => displayCustomerName(inv.customer_name) || (inv.customer_phone ?? "").trim();
/** «مرتجع» كما تختمه الدالّةُ سطرَ الاستهلاك (بيانات لا نصّ واجهة). */
const CONSUMED_BY_RETURN = "\u0645\u0631\u062A\u062C\u0639";

/** الطالبُ كما يراه الخادم: الدورُ الأساس، والمفتاحُ حيٌّ إن رُفع أو كان الجهازُ مقفولاً بحساب المدير
 *  (`ownerAccountFrom`: كشكٌ مفتوحٌ بالرمز محلّياً ليس «صاحب العيادة من حسابه»). */
function useForgiveActor(): { actor: ForgiveActor; ownerOk: boolean } {
  const { baseRole } = usePermissions();
  const ov = useOverride();
  const ownerOk = ownerAccountFrom(ov.deviceLocked, ov.active, baseRole === "manager");
  return { actor: forgiveActor({ base: baseRole, pin: ov.active || (baseRole === "manager" && ov.deviceLocked) }), ownerOk };
}

/* ============================================================================
 * القسمُ داخل الفاتورة: زرُّ الخصم + سجلُّه (مع الملغى والمستهلَك) + الإلغاء.
 * ==========================================================================*/
export function ForgiveSection({ invoice, items, itemsOk, canForgive, canVoid, onUpdated }: {
  invoice: Invoice; items: InvoiceItem[];
  /** سطورُ الفاتورة وصلت فعلاً: فشلُ جلبها يجعل `items` فارغةً فيختفي تحذيرُ «مواد بلا سعر شراء» (الإشارةُ
   *  الوحيدة أن الربحَ منفوخ) ويُطبع وصلٌ بلا سطور — فالخصمُ ينتظرها. */
  itemsOk: boolean;
  canForgive: boolean; canVoid: boolean; onUpdated: (inv: Invoice) => void;
}) {
  const { t, i18n } = useTranslation();
  const [rows, setRows] = useState<InvoiceForgiveness[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [names, setNames] = useState<Map<string, string>>(() => new Map());
  const [open, setOpen] = useState(false);
  const [voiding, setVoiding] = useState<InvoiceForgiveness | null>(null);

  // الدفترُ يُعاد كلّما تغيّر ما يغيّره (خصم، إلغاء، مرتجع، تسديد) — والفشلُ يُقال لا يُعرض فراغاً.
  const stamp = `${invoice.id}|${invoice.forgiven ?? 0}|${invoice.total}|${invoice.amount_paid ?? ""}|${tick}`;
  const withCustomer = hasCustomer(invoice);
  useEffect(() => {
    if (!withCustomer) { setRows([]); setFailed(false); return; }
    let alive = true;
    setFailed(false);
    repo.listInvoiceForgiveness([invoice.id])
      .then((r) => { if (alive) setRows(r); })
      .catch(() => { if (alive) { setRows(null); setFailed(true); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stamp, withCustomer]);

  // مَن وافق: created_by معرّفُ الحساب، والكادرُ يحمل userId — وصاحبُ العيادة بلا صفّ كادر: حسابُه معرّفُ العيادة.
  const [clinicId, setClinicId] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void staffRoster().then((list) => {
      if (!alive) return;
      const m = new Map<string, string>();
      for (const s of list) if (s.userId) m.set(s.userId, s.name);
      setNames(m);
    });
    void expectedServerClinic().then((c) => { if (alive) setClinicId(c); }); // لا ترمي: تقع على المفتاح
    return () => { alive = false; };
  }, []);
  const who = (id: string | null, rowClinic?: string | null) => {
    const a = approverOf(id, id ? names.get(id) : null, rowClinic ?? clinicId);
    return a.kind === "name" ? a.name : a.kind === "owner" ? t("fgv.owner") : "—";
  };

  const list = rows ?? [];
  return (
    <div className="space-y-2" data-forgive-section>
      {failed && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 text-xs dark:border-danger-500/30 dark:bg-danger-500/10" data-forgive-histfail>
          <AlertTriangle size={14} className="shrink-0 text-danger-600" />
          <span className="min-w-0 flex-1 font-semibold text-danger-700 dark:text-danger-300">{t("fgv.hist.failed")}</span>
          <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry")}</Button>
        </div>
      )}

      {list.length > 0 && (
        <div className="space-y-1.5 rounded-xl border border-warn-200 bg-warn-50/50 p-2.5 dark:border-warn-500/30 dark:bg-warn-500/10" data-forgive-history>
          <p className="flex items-center gap-1.5 text-2xs font-bold text-warn-700 dark:text-warn-200"><BadgePercent size={13} /> {t("fgv.hist.title")}</p>
          {list.map((r) => {
            if (r.kind === "consumed") {
              const amt = money(Math.abs(Number(r.amount) || 0));
              return (
                <div key={r.id} className="flex items-start justify-between gap-2 text-2xs text-ink-muted" data-forgive-row="consumed">
                  <span>{(r.note ?? "").startsWith(CONSUMED_BY_RETURN) ? t("fgv.hist.byReturn", { amount: amt }) : t("fgv.hist.byEdit", { amount: amt })}</span>
                  <span className="shrink-0 tabular-nums text-ink-subtle">{timeOf(r.created_at, i18n.language)}</span>
                </div>
              );
            }
            const voided = !!r.voided_at;
            const rk = reasonKey(r.reason_code);
            return (
              <div key={r.id} className={cn("rounded-lg bg-surface-1 p-2 text-2xs", r.above_cap && !voided && "ring-1 ring-danger-300 dark:ring-danger-500/40")} data-forgive-row={voided ? "voided" : "live"}>
                <div className="flex items-start justify-between gap-2">
                  <div className={cn("min-w-0 space-y-0.5", voided && "text-ink-subtle line-through")}>
                    <p className="flex flex-wrap items-center gap-1.5 font-semibold text-ink">
                      <span className="tabular-nums text-warn-700 dark:text-warn-300">−{money(Number(r.amount) || 0)}</span>
                      {rk && <span>{t(rk)}</span>}
                      {r.via_pin && <span className="chip bg-surface-2 text-2xs text-ink-muted">{t("fgv.hist.pin")}</span>}
                      {r.above_cap && <span className="chip bg-danger-50 text-2xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("fgv.hist.above")}</span>}
                    </p>
                    <p className="text-ink-subtle">
                      {timeOf(r.created_at, i18n.language)} · {t("fgv.hist.by", { who: who(r.created_by, r.clinic_id) })}
                      {Number(r.pay_amount) > 0 && <> · {t("fgv.hist.withPay", { amount: money(Number(r.pay_amount)) })}</>}
                    </p>
                    {r.note && <p className="whitespace-pre-wrap break-words text-ink-muted">{r.note}</p>}
                  </div>
                  {canVoid && !voided && (
                    <button type="button" data-forgive-void={r.id} onClick={() => { playTap(); setVoiding(r); }}
                      className="shrink-0 rounded-md border border-line bg-surface-2 px-2 py-0.5 text-2xs font-semibold text-danger-600 transition hover:border-danger-300">
                      {t("fgv.hist.cancel")}
                    </button>
                  )}
                </div>
                {voided && (
                  <p className="mt-1 text-2xs font-semibold text-danger-700 dark:text-danger-300">
                    {t("fgv.hist.voided", { who: who(r.voided_by, r.clinic_id), why: r.void_reason ?? "—" })}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {canForgive && (
        <Button variant="secondary" className="w-full" leftIcon={<BadgePercent size={16} />} data-forgive-open disabled={!itemsOk}
          onClick={() => { playTap(); setOpen(true); }}>
          {t("fgv.btn")}
        </Button>
      )}

      {open && (
        <ForgiveDialog invoice={invoice} items={items} itemsOk={itemsOk} onClose={() => setOpen(false)}
          onDone={(u) => { onUpdated(u); setTick((n) => n + 1); }} />
      )}
      {voiding && (
        <VoidSheet invoice={invoice} entry={voiding} onClose={() => setVoiding(null)}
          onDone={(u) => { setVoiding(null); onUpdated(u); setTick((n) => n + 1); }} />
      )}
    </div>
  );
}

/* ============================================================================
 * النافذة.
 * ==========================================================================*/
type Loaded = { pct: number; invoices: Invoice[]; ledger: InvoiceForgiveness[]; orders: DeliveryOrder[] };

export function ForgiveDialog({ invoice, items, itemsOk, onClose, onDone }: {
  invoice: Invoice; items: InvoiceItem[]; itemsOk: boolean; onClose: () => void; onDone: (updated: Invoice) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const print = useInvoicePrinter();
  const { actor, ownerOk } = useForgiveActor();

  const [data, setData] = useState<Loaded | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const [mode, setMode] = useState<"settle" | "only">("settle");
  const [payStr, setPayStr] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [amtStr, setAmtStr] = useState("");
  const [amtTouched, setAmtTouched] = useState(false);
  const [reason, setReason] = useState<ForgiveReason | null>(null);
  const [note, setNote] = useState("");
  const [ack, setAck] = useState(false);
  const [busy, setBusy] = useState(false);
  const [serverErr, setServerErr] = useState<string | null>(null);
  const [done, setDone] = useState<Invoice | null>(null);

  // النسبةُ تُقرأ طازجةً من الخادم (لا من مرآة الإعدادات)، وحسابُ الزبون كاملاً، وطلباتُ التوصيل
  // (قاعدةُ «المَدينُ الشركة») — والفاتورةُ نفسُها من نفس الجلب، فالمتبقّي المعروض هو الحاليّ.
  useEffect(() => {
    let alive = true;
    setData(null);
    setLoadFailed(false);
    // الإقرارُ بخسارةٍ لرقمٍ بعينه: بعد إعادة القراءة (due_changed، تغيّرُ النسبة) قد تتغيّر الخسارة — يُقَرّ من جديد.
    setAck(false);
    (async () => {
      try {
        const [pct, invoices, orders] = await Promise.all([
          repo.forgiveProfitPct(),
          repo.customerInvoices(invoice.customer_phone ?? null, invoice.customer_name ?? null),
          repo.listDeliveryOrders(),
        ]);
        const ids = [...new Set([...invoices.map((i) => i.id), invoice.id])];
        const ledger = await repo.listInvoiceForgiveness(ids);
        if (alive) setData({ pct, invoices, ledger, orders });
      } catch {
        if (alive) setLoadFailed(true);
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);

  const cur: Invoice = (data?.invoices.find((i) => i.id === invoice.id)) ?? invoice;
  const pct = data?.pct ?? null;
  const dueShown = forgiveDueOf(cur);
  const payNum = mode === "settle" ? Math.max(0, Number(payStr) || 0) : 0;
  const caps = forgiveCaps(cur, pct, payNum);
  // تلقائياً: بالتسوية «نخصم الباقي» بعد ما يُدفع؛ وبـ«خصم فقط» لا مبلغَ حتى يُختار — لا خصمَ كاملٌ بالخطأ.
  const autoAmt = mode === "settle" && caps.pay > 0 ? caps.due : 0;
  const amtNum = amtTouched ? Number(amtStr) || 0 : autoAmt;
  const preview = forgivePreview(caps, amtNum);
  const openDelivery = data ? hasOpenDelivery(data.orders, cur.id) : false;
  const check = validateForgive({
    actor, inv: cur, openDelivery, pct, amount: amtNum, reason, note, expectDue: dueShown, pay: payNum, confirmLoss: ack,
  });
  const overstated = profitOverstated(items);

  // حسابُ الزبون — الحيُّ وحده (المرجعةُ لا دينَ عليها ولا مشتريات)، و«الباقي عليه» بلا ما بذمّة التوصيل
  // (قاعدةُ DebtsPanel حرفاً): رقمٌ أكبرُ من دينه الحقيقيّ يفاوض المديرُ عليه فيخصم أكثر.
  const account = useMemo(() => {
    if (!data) return null;
    const live = data.invoices.filter((i) => (i.status ?? "paid") !== "refunded");
    let last: { at: string; amount: number } | null = null;
    for (const i of live) for (const s of settlementsOf(i, data.ledger)) if (!last || s.at > last.at) last = { at: s.at, amount: s.amount };
    return { ...forgiveAccount(data.invoices, data.ledger, data.orders), last };
  }, [data]);

  const name = customerLabel(cur);
  const profitBase = caps.profitBase;
  const gross = grossOf(cur);
  const cost = Number.isFinite(Number(cur.cost_total)) && cur.cost_total != null ? Number(cur.cost_total) : round2(gross - profitBase);
  const capLeft = Math.max(0, round2(caps.capTotal - caps.forgiven));

  const submit = async () => {
    if (!check.ok || busy || !data || !itemsOk) return;
    setBusy(true);
    setServerErr(null);
    try {
      const updated = await repo.forgiveInvoiceDebt(cur.id, {
        amount: check.amount, reason: check.reason, note: check.note, expectDue: dueShown,
        pay: check.pay > 0 ? check.pay : 0, method: check.pay > 0 ? method : null, confirmLoss: check.aboveCap ? ack : false,
      });
      playSuccess();
      toast.success(t("fgv.ok", { after: money(dueOf(updated)) }));
      setDone(updated);
      onDone(updated);
    } catch (e) {
      playWarning();
      const msg = describeDbError(e, t);
      setServerErr(msg);
      toast.error(msg);
      const code = codeOf(e);
      // النسبةُ أو الفاتورةُ تغيّرت تحتنا: نعيد قراءتهما — الحفظُ ينتظر الصورةَ الجديدة.
      if (["above_profit_needs_owner", "confirm_loss_required", "due_changed"].some((c) => code.includes(c))) setTick((n) => n + 1);
    } finally { setBusy(false); }
  };

  /* ---- بعد الحفظ: الخلاصة وعرضُ الوصل ---- */
  if (done) {
    const afterPrint = (n: number) => onDone({ ...done, print_count: n });
    return (
      <Modal open onClose={onClose} title={t("fgv.title", { no: invoiceNo(cur.id) })}>
        <div className="space-y-3 p-1" data-forgive-done>
          <div className="flex items-start gap-2 rounded-xl bg-success-50 p-3 text-sm font-semibold text-success-700 dark:bg-success-500/10 dark:text-success-300">
            <CheckCircle2 size={18} className="mt-0.5 shrink-0" /> {t("fgv.ok", { after: money(dueOf(done)) })}
          </div>
          <p className="text-xs text-ink-muted">{t("fgv.printOffer")}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" leftIcon={<Printer size={16} />} data-forgive-print="thermal"
              onClick={() => { void print(done, "thermal", { items, onCounted: afterPrint }); }}>{t("retail.printReceipt")}</Button>
            <Button variant="secondary" leftIcon={<Printer size={16} />} data-forgive-print="a4"
              onClick={() => { void print(done, "a4", { items, onCounted: afterPrint }); }}>{t("retail.printA4")}</Button>
          </div>
          <Button className="w-full" onClick={onClose}>{t("common.done")}</Button>
        </div>
      </Modal>
    );
  }

  const field = (label: string, value: string, tone?: string) => (
    <div className="flex items-center justify-between gap-2">
      <span className="text-ink-muted">{label}</span>
      <span className={cn("font-semibold tabular-nums text-ink", tone)}>{value}</span>
    </div>
  );
  const loss = preview.loss;
  // «تسوية» بدفعةٍ تسدّ الباقي كلَّه: لا خصمَ يبقى ليُقبل — تُقال بسببها لا «اكتب مبلغ أكبر من صفر».
  const payClears = mode === "settle" && caps.dueBefore > FORGIVE_TOL && payNum >= caps.dueBefore - FORGIVE_TOL;
  const errText = (() => {
    if (!itemsOk) return t("fgv.itemsWait");
    if (check.ok || !data) return null;
    if (payClears) return t("fgv.payClears");
    if (check.code === "above_due") return t("fgv.err.above_due", { due: money(check.due ?? caps.due) });
    // فوق السقف يُشرح باللوحة الحمراء نفسها — لا يُكرَّر سطراً.
    if (check.code === "above_profit_needs_owner" || check.code === "confirm_loss_required" || (check.code === "note_required" && check.aboveCap)) return null;
    return t(`fgv.err.${check.code}`);
  })();
  // نسبةُ هذا الخصم من ربح البيعة، ومعها المجموعُ (preview.pctOfProfit) إن سبقه خصم — الشريطُ تحتها تراكميّ،
  // و«٣٣٪» وحدَها عن خصمٍ ثانٍ تُخفي أن الربحَ كلَّه ذهب.
  const shareOfProfit = profitBase > 0 ? (preview.amount / profitBase) * 100 : null;
  const shareText = shareOfProfit == null ? t("fgv.lineNoProfit")
    : caps.forgiven > FORGIVE_TOL ? t("fgv.lineShareCum", { pct: pctText(shareOfProfit), total: pctText(preview.pctOfProfit) })
    : t("fgv.lineShare", { pct: pctText(shareOfProfit) });
  // الهامشُ على «الإجمالي» نفسِه المعروض بالبطاقة (قيمةُ البضاعة) — لا على المبلغ بعد الخصم.
  const marginOfGross = gross > 0 ? (preview.profitAfter / gross) * 100 : null;
  const what = caps.pay > 0
    ? t("fgv.sumPay", { amount: money(caps.pay), method: t(PAY_KEY[method]), discount: money(preview.amount) })
    : t("fgv.sumOnly", { discount: money(preview.amount) });

  // شريطُ السقف: ما استُعمل قبل، وهذا الخصمُ داخل الباقي، وما يفيض عنه (أحمر).
  const barMax = Math.max(caps.capTotal, caps.forgiven + preview.amount, 0.01);
  const wUsed = Math.min(caps.forgiven, barMax) / barMax * 100;
  const inCap = Math.max(0, Math.min(preview.amount, capLeft));
  const wThis = inCap / barMax * 100;
  const wOver = Math.max(0, preview.amount - inCap) / barMax * 100;

  return (
    <Modal open onClose={onClose} title={t("fgv.title", { no: invoiceNo(cur.id) })} size="wide">
      <div className="space-y-3.5 p-1" data-forgive-dialog>
        {/* ── الفاتورة ── */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1 rounded-xl border border-line bg-surface-2 p-3 text-xs" data-forgive-inv>
            <p className="mb-1 flex items-center gap-1.5 text-2xs font-bold text-ink-muted"><Wallet size={13} /> {t("fgv.inv.title")}</p>
            {field(t("fgv.inv.gross"), money(gross))}
            {field(t("fgv.inv.cost"), money(cost))}
            {field(t("fgv.inv.profit"), `${money(profitBase)} · ${t("fgv.inv.profitPct", { p: pctText(gross > 0 ? (profitBase / gross) * 100 : null) })}`, profitBase > 0 ? "text-success-700 dark:text-success-300" : "text-danger-600")}
            {field(t("fgv.inv.paid"), money(paidOf(cur)))}
            {field(t("fgv.inv.due"), money(dueShown), "text-warn-700 dark:text-warn-300")}
            {field(t("fgv.inv.prior"), caps.forgiven > 0 ? money(caps.forgiven) : t("fgv.inv.none"))}
          </div>

          {/* ── الزبون: يحجب الحفظ حتى يكتمل ── */}
          <div className="space-y-1 rounded-xl border border-line bg-surface-2 p-3 text-xs" data-forgive-cust>
            <p className="mb-1 flex items-center gap-1.5 text-2xs font-bold text-ink-muted"><User size={13} /> {t("fgv.cust.title")} · <span className="text-ink">{name}</span></p>
            {loadFailed ? (
              <div className="space-y-2" data-forgive-custfail>
                <p className="text-danger-700 dark:text-danger-300">{t("fgv.cust.failed")}</p>
                <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={13} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry")}</Button>
              </div>
            ) : !account ? (
              <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-4 rounded" />)}</div>
            ) : (
              <>
                {field(t("fgv.cust.invoices"), formatNum(account.count))}
                {field(t("fgv.cust.bought"), money(account.bought))}
                {field(t("fgv.cust.paid"), money(account.paid))}
                {field(t("fgv.cust.due"), money(account.due), "text-warn-700 dark:text-warn-300")}
                {account.courierDue > FORGIVE_TOL && field(t("fgv.cust.courier"), money(account.courierDue), "text-ink-muted")}
                {field(t("fgv.cust.prior"), account.priorCount > 0
                  ? t("fgv.cust.priorVal", { n: formatNum(account.priorCount), amount: money(account.priorGranted) })
                    + (account.priorBack > FORGIVE_TOL ? ` · ${t("fgv.cust.priorBack", { amount: money(account.priorBack) })}` : "")
                  : t("fgv.inv.none"))}
                {field(t("fgv.cust.lastPay"), account.last ? t("fgv.cust.lastPayVal", { amount: money(account.last.amount), date: formatDate(account.last.at, i18n.language, true) }) : t("fgv.cust.noPay"))}
              </>
            )}
          </div>
        </div>

        {overstated && (
          <p className="flex items-start gap-1.5 rounded-xl bg-warn-50 p-2.5 text-2xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-300" data-forgive-nocost>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" /> {t("fgv.inv.noCost")}
          </p>
        )}

        {/* ── الطريقة ── */}
        <div className="flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
          {(["settle", "only"] as const).map((m) => (
            <button key={m} type="button" data-forgive-mode={m}
              onClick={() => { playTap(); setMode(m); setAmtTouched(false); setAmtStr(""); setAck(false); }}
              className={cn("flex-1 rounded-xl px-3 py-2 text-xs font-bold transition", mode === m ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2")}>
              {t(`fgv.mode.${m}`)}
            </button>
          ))}
        </div>

        {mode === "settle" && (
          <div className="space-y-1.5">
            <label className="label">{t("fgv.pay")}</label>
            <div className="flex flex-wrap items-center gap-2">
              <input className="input h-11 w-36 text-end font-bold tabular-nums" inputMode="decimal" data-forgive-pay
                value={payStr} onChange={(e) => { setPayStr(e.target.value.replace(/[^\d.]/g, "")); setAck(false); }} placeholder="0" />
              {METHODS.map((m) => {
                const Icon = PAY_ICON[m];
                return (
                  <button key={m} type="button" data-forgive-method={m} onClick={() => { playTap(); setMethod(m); }}
                    className={cn("inline-flex items-center gap-1 rounded-xl border px-2.5 py-2 text-xs font-bold transition",
                      method === m ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted")}>
                    <Icon size={13} /> {t(PAY_KEY[m])}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── المبلغ ── */}
        <div className="space-y-1.5">
          <label className="label">{t("fgv.amount")}</label>
          <input className="input h-11 text-end font-bold tabular-nums" inputMode="decimal" data-forgive-amount
            value={amtTouched ? amtStr : autoAmt > 0 ? String(autoAmt) : ""}
            onChange={(e) => { setAmtTouched(true); setAmtStr(e.target.value.replace(/[^\d.]/g, "")); setAck(false); }} placeholder="0" />
          <div className="flex flex-wrap gap-1.5">
            {caps.allowedWithin > 0 && caps.allowedWithin < caps.due && (
              <button type="button" data-forgive-chip="cap" className="chip bg-surface-2 text-2xs text-ink-muted transition hover:text-ink"
                onClick={() => { playTap(); setAmtTouched(true); setAmtStr(String(caps.allowedWithin)); setAck(false); }}>
                {t("fgv.chipCap", { amount: money(caps.allowedWithin) })}
              </button>
            )}
            {caps.due > 0 && (
              <button type="button" data-forgive-chip="all" className="chip bg-surface-2 text-2xs text-ink-muted transition hover:text-ink"
                onClick={() => { playTap(); setAmtTouched(true); setAmtStr(String(caps.due)); setAck(false); }}>
                {t("fgv.chipAll", { amount: money(caps.due) })}
              </button>
            )}
          </div>
          {data && (
            <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs font-semibold leading-relaxed text-ink" data-forgive-live>
              {[
                shareText,
                t("fgv.lineProfit", { profit: money(preview.profitAfter), margin: pctText(marginOfGross) }),
                t("fgv.lineDue", { before: money(caps.dueBefore), after: money(preview.dueAfter) }),
              ].join(" · ")}
            </p>
          )}
        </div>

        {/* ── سقفُ الربح ── */}
        {data && (
          <div className="space-y-1 rounded-xl border border-line p-2.5" data-forgive-cap>
            <p className="text-2xs font-bold text-ink-muted">{t("fgv.cap.title", { pct: formatNum(caps.pct) })}</p>
            <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-3">
              <span className="h-full bg-warn-400" style={{ width: `${wUsed}%` }} />
              <span className="h-full bg-brand-500" style={{ width: `${wThis}%` }} />
              <span className="h-full bg-danger-500" style={{ width: `${wOver}%` }} />
            </div>
            <div className="flex flex-wrap justify-between gap-x-3 text-2xs tabular-nums text-ink-subtle">
              <span>{t("fgv.cap.used", { amount: money(caps.forgiven) })}</span>
              <span>{t("fgv.cap.allowed", { amount: money(Math.max(0, caps.capTotal)) })}</span>
              <span>{t("fgv.cap.left", { amount: money(capLeft) })}</span>
            </div>
          </div>
        )}

        {/* ── فوق السقف: صاحبُ العيادة من حسابه + ملاحظة + إقرار ── */}
        {data && preview.amount > 0 && preview.aboveCap && (
          <div className="space-y-2 rounded-xl border border-danger-300 bg-danger-50 p-3 text-xs dark:border-danger-500/40 dark:bg-danger-500/10" data-forgive-above>
            <p className="flex items-start gap-1.5 font-bold text-danger-700 dark:text-danger-300">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              {loss > 0 ? t("fgv.above.loss", { amount: money(loss) }) : t("fgv.above.over", { pct: formatNum(caps.pct) })}
            </p>
            {!ownerOk ? (
              <p className="font-semibold text-danger-700 dark:text-danger-300" data-forgive-ownerneeded>{t("fgv.above.owner")}</p>
            ) : (
              <label className="flex items-start gap-2 font-semibold text-danger-700 dark:text-danger-200">
                <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} data-forgive-ack />
                {loss > 0 ? t("fgv.above.ack", { amount: money(loss) }) : t("fgv.above.ackOver")}
              </label>
            )}
          </div>
        )}

        {/* ── السبب والملاحظة ── */}
        <div className="space-y-1.5">
          <label className="label">{t("fgv.reason")} <span className="text-2xs font-normal text-ink-subtle">{t("fgv.required")}</span></label>
          <div className="flex flex-wrap gap-1.5">
            {REASONS.map((r) => (
              <button key={r.code} type="button" data-forgive-reason={r.code} onClick={() => { playTap(); setReason(r.code); }}
                className={cn("chip text-2xs transition", reason === r.code ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                {t(r.key)}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1">
          <label className="label">
            {t("fgv.note")}{" "}
            {(reason === "other" || preview.aboveCap) && <span className="text-2xs font-normal text-ink-subtle">{t("fgv.required")}</span>}
          </label>
          <textarea className="input min-h-[64px] py-2" maxLength={FORGIVE_NOTE_MAX} data-forgive-note
            value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("fgv.notePh")} />
          {preview.aboveCap && ownerOk && note.trim().length < ABOVE_CAP_NOTE_MIN && (
            <p className="text-2xs font-semibold text-danger-600">{t("fgv.above.noteMin")}</p>
          )}
        </div>

        {/* ── الخلاصة وزرٌّ واحد ── */}
        {data && check.ok && itemsOk && (
          <p className="rounded-xl border border-brand-200 bg-brand-50 p-2.5 text-xs font-bold text-brand-800 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-200" data-forgive-summary>
            {t("fgv.summary", { name, what, after: money(preview.dueAfter) })}
          </p>
        )}
        {errText && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300" data-forgive-err>{errText}</p>}
        {serverErr && <p className="rounded-lg bg-danger-50 p-2 text-2xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300" data-forgive-servererr>{serverErr}</p>}
        <Button className="w-full" style={{ minHeight: 48 }} disabled={!data || !check.ok || !itemsOk} loading={busy} onClick={() => void submit()} data-forgive-save
          leftIcon={<CheckCircle2 size={17} />}>
          {t("fgv.save")}
        </Button>
      </div>
    </Modal>
  );
}

/* ============================================================================
 * إلغاءُ خصمٍ بسبب — الدينُ يرجع، والسطرُ يبقى مشطوباً.
 * ==========================================================================*/
export function VoidSheet({ invoice, entry, onClose, onDone }: {
  invoice: Invoice; entry: InvoiceForgiveness; onClose: () => void; onDone: (updated: Invoice) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { actor } = useForgiveActor();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const amount = Number(entry.amount) || 0;
  const before = dueOf(invoice);
  const after = round2(before + amount);
  // الطلبُ المفتوح يرفضه الخادمُ بتلميحه — لا تُجلب الطلباتُ هنا لسطرٍ واحد.
  const check = validateVoid({ actor, reason, entry, inv: invoice, openDelivery: false });

  const submit = async () => {
    if (!check.ok || busy) return;
    setBusy(true);
    setErr(null);
    try {
      const updated = await repo.voidInvoiceForgiveness(entry.id, check.reason);
      playSuccess();
      toast.success(t("fgv.void.ok"));
      onDone(updated);
    } catch (e) {
      playWarning();
      const msg = describeDbError(e, t);
      setErr(msg);
      toast.error(msg);
    } finally { setBusy(false); }
  };

  return (
    <Modal open onClose={onClose} title={t("fgv.void.title")}>
      <div className="space-y-3 p-1" data-forgive-voidsheet>
        {/* على مَن وأيُّ فاتورة — تأكيدُ مالٍ يسمّي صاحبه. */}
        <p className="flex items-center gap-1.5 text-xs font-semibold text-ink" data-forgive-voidwho>
          <User size={13} className="shrink-0 text-ink-muted" /> {customerLabel(invoice) || "—"} <span className="font-mono text-2xs text-ink-subtle">{invoiceNo(invoice.id)}</span>
        </p>
        <p className="rounded-xl bg-warn-50 p-2.5 text-xs font-semibold text-warn-700 dark:bg-warn-500/10 dark:text-warn-200">
          {t("fgv.void.body", { amount: money(amount), before: money(before), after: money(after) })}
        </p>
        <div>
          <label className="label">{t("fgv.void.reason")} <span className="text-2xs font-normal text-ink-subtle">{t("fgv.required")}</span></label>
          <input className="input" value={reason} maxLength={VOID_REASON_MAX} autoFocus data-forgive-voidreason
            onChange={(e) => setReason(e.target.value)} />
        </div>
        {/* حقلٌ حرّ لا قائمة: «اختار السبب» عن سببٍ قصير لا يقول ما المطلوب — الحدُّ يُقال. */}
        {!check.ok && reason.trim() !== "" && <p className="text-2xs font-semibold text-warn-700 dark:text-warn-300">{check.code === "reason_required" ? t("fgv.void.min") : t(`fgv.err.${check.code}`)}</p>}
        {err && <p className="rounded-lg bg-danger-50 p-2 text-2xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">{err}</p>}
        <div className="flex gap-2">
          <Button variant="danger" className="flex-1" disabled={!check.ok} loading={busy} onClick={() => void submit()} data-forgive-voidsave>
            {t("fgv.void.save")}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}

/* ============================================================================
 * تأكيدُ المرتجع والترجيع والحذف — بالشاشة لا بنافذة المتصفّح (لا window.confirm للمال).
 * ما يخرج من الرفّ والدرج والدَّين مكتوبٌ قبل الضغطة: «الدين ٧٠ ← ٤٠ · ترجع للرف: …».
 * ==========================================================================*/
export interface ReturnSheetProps {
  mode: "refund" | "return" | "delete";
  invoice: Invoice;
  lines: { name: string; qty: number }[];
  /** ما يرجع للزبون من الدرج. */
  back: number;
  dueBefore: number;
  dueAfter: number;
  /** ما يُستهلك من «خصم على الدين» قبل أيّ نقد (0241). */
  consumed: number;
  busy: boolean;
  onConfirm: () => void;
  onClose: () => void;
}
export function ReturnSheet({ mode, invoice, lines, back, dueBefore, dueAfter, consumed, busy, onConfirm, onClose }: ReturnSheetProps) {
  const { t } = useTranslation();
  const title = mode === "delete" ? t("fgv.ret.titleDelete") : mode === "refund" ? t("fgv.ret.titleRefund") : t("fgv.ret.titleReturn");
  const showDebt = dueBefore > 0.005 || dueAfter > 0.005;
  return (
    <Modal open onClose={onClose} title={`${title} · ${invoiceNo(invoice.id)}`}>
      <div className="space-y-3 p-1" data-return-sheet={mode}>
        {/* الزبونُ باسمه: فاتورتان متشابهتان بالبحث — الرقمُ وحده لا يمسك الخطأ قبل أن يتحرّك المخزنُ والنقد. */}
        {hasCustomer(invoice) && (
          <p className="flex items-center gap-1.5 text-xs font-semibold text-ink" data-return-sheet-cust>
            <User size={13} className="shrink-0 text-ink-muted" /> {customerLabel(invoice)}
          </p>
        )}
        {mode === "delete" && (
          <p className="flex items-start gap-1.5 rounded-xl bg-danger-50 p-2.5 text-xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
            <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {t("fgv.ret.deleteBody")}
          </p>
        )}
        {mode !== "delete" && lines.length > 0 && (
          <div className="rounded-xl border border-line bg-surface-2 p-2.5 text-xs">
            <p className="mb-1 text-2xs font-bold text-ink-muted">{t("fgv.ret.shelf")}</p>
            <ul className="space-y-0.5">
              {lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2"><span className="min-w-0 truncate text-ink">{l.name}</span><span className="shrink-0 tabular-nums text-ink-muted">× {formatNum(l.qty)}</span></li>
              ))}
            </ul>
          </div>
        )}
        {mode !== "delete" && (
          <div className="space-y-1 rounded-xl border border-warn-300 bg-warn-50 p-2.5 text-xs font-semibold dark:border-warn-500/40 dark:bg-warn-500/10" data-return-sheet-money>
            {showDebt && <p className="text-warn-700 dark:text-warn-200" data-return-sheet-debt>{t("fgv.ret.debt", { before: money(dueBefore), after: money(dueAfter) })}</p>}
            {consumed > 0.005 && <p className="text-ink-muted">{t("fgv.ret.eats", { amount: money(consumed) })}</p>}
            <p className="text-warn-700 dark:text-warn-200" data-return-sheet-back>{back > 0.005 ? t("fgv.ret.back", { amount: money(back) }) : t("fgv.ret.noBack")}</p>
          </div>
        )}
        <div className="flex gap-2">
          <Button variant={mode === "delete" ? "danger" : "primary"} className="flex-1" loading={busy} onClick={onConfirm} data-return-sheet-ok
            leftIcon={mode === "delete" ? <Trash2 size={16} /> : <RotateCcw size={16} />}>
            {mode === "delete" ? t("fgv.ret.okDelete") : t("fgv.ret.ok")}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("common.cancel")}</Button>
        </div>
      </div>
    </Modal>
  );
}

