import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Receipt, User, Printer, RotateCcw, Trash2, TrendingUp, Banknote, CreditCard,
  ArrowLeftRight, Package, AlertTriangle, CheckCircle2, Wallet, Pencil, Check, Loader2,
} from "lucide-react";
import type { Invoice, InvoiceItem, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { usePermissions } from "@/hooks/usePermissions";
import { Modal } from "@/components/Modal";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { useInvoicePrinter } from "./usePrintInvoice";
import { invoiceNo } from "@/lib/invoicePrint";
import { cn, formatDate, money, dateLocale } from "@/lib/utils";
import { dueOf, paidOf, isDebt, paymentStatusOf } from "@/lib/debt";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";

const PAY_ICON: Record<PaymentMethod, typeof Banknote> = { cash: Banknote, card: CreditCard, transfer: ArrowLeftRight };
const PAY_KEY: Record<PaymentMethod, string> = { cash: "retail.payCash", card: "retail.payCard", transfer: "retail.payTransfer" };

type StatusFilter = "all" | "paid" | "refunded";

export function InvoicesPanel({ invoices, onChanged }: { invoices: Invoice[]; clinicId?: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const { can } = usePermissions();
  const showProfit = can("viewProfits");
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<StatusFilter>("all");
  const [open, setOpen] = useState<Invoice | null>(null);

  const shown = useMemo(() => {
    const ql = q.trim().toLowerCase();
    return invoices.filter((inv) => {
      if (status !== "all" && (inv.status ?? "paid") !== status) return false;
      if (!ql) return true;
      return (inv.customer_name ?? "").toLowerCase().includes(ql)
        || (inv.customer_phone ?? "").includes(ql)
        || invoiceNo(inv.id).toLowerCase().includes(ql);
    });
  }, [invoices, q, status]);

  const FILTERS: { id: StatusFilter; label: string }[] = [
    { id: "all", label: t("retail.fAll", "All") },
    { id: "paid", label: t("retail.fPaid", "Paid") },
    { id: "refunded", label: t("retail.fRefunded", "Refunded") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("retail.searchInvoices", "Search by customer, phone or invoice #…")} />
        </div>
        <div className="flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
          {FILTERS.map((f) => (
            <button key={f.id} onClick={() => { playTap(); setStatus(f.id); }}
              className={cn("rounded-xl px-3 py-2 text-sm font-semibold transition", status === f.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {shown.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center text-ink-subtle">
          <Receipt size={30} className="mb-2 opacity-40" />
          {invoices.length === 0 ? t("retail.noInvoices", "No invoices yet. Completed sales appear here.") : t("retail.noInvoiceMatch", "No invoices match your filters.")}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {shown.map((inv) => {
            const refunded = (inv.status ?? "paid") === "refunded";
            const PayIcon = inv.payment_method ? PAY_ICON[inv.payment_method] : null;
            return (
              <motion.button key={inv.id} variants={staggerItem} onClick={() => { playTap(); setOpen(inv); }}
                className="card flex w-full items-center gap-3 p-3.5 text-start transition hover:border-brand-300 hover:shadow-raised">
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", refunded ? "bg-danger-50 text-danger-600 dark:bg-danger-500/15 dark:text-danger-300" : "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300")}>
                  <Receipt size={20} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                    {inv.customer_name || t("retail.walkIn", "Walk-in")}
                    <span className="font-mono text-2xs font-normal text-ink-subtle">{invoiceNo(inv.id)}</span>
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 text-xs text-ink-subtle">
                    <span>{formatDate(inv.created_at, i18n.language)} · {new Date(inv.created_at).toLocaleTimeString(i18n.language === "ar" ? dateLocale() : "en-GB", { hour: "2-digit", minute: "2-digit" })}</span>
                    <span>· {t("retail.itemsN", { n: inv.item_count, defaultValue: "{{n}} items" })}</span>
                    {PayIcon && <span className="flex items-center gap-0.5"><PayIcon size={11} /></span>}
                    {(inv.print_count ?? 0) > 0 && <span className="flex items-center gap-0.5"><Printer size={11} /> {inv.print_count}</span>}
                  </div>
                </div>
                {refunded && <Badge tone="danger">{t("retail.refunded", "Refunded")}</Badge>}
                {!refunded && isDebt(inv) && <Badge tone="warn">{t("retail.debtBadge", "دين")}</Badge>}
                <div className="text-end">
                  <p className={cn("font-display font-bold tabular-nums", refunded ? "text-ink-subtle line-through" : "text-ink")}>{money(inv.total)}</p>
                  {!refunded && isDebt(inv)
                    ? <p className="flex items-center justify-end gap-1 text-2xs text-warn-600">{t("retail.remainingDue", "المبلغ المتبقي")} {money(dueOf(inv))}</p>
                    : !refunded && showProfit && <p className="flex items-center justify-end gap-1 text-2xs text-success-600"><TrendingUp size={10} /> {money(inv.profit)}</p>}
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      <InvoiceDetail invoice={open} onClose={() => setOpen(null)} onChanged={onChanged} setOpen={setOpen} />
    </div>
  );
}

function InvoiceDetail({ invoice, onClose, onChanged, setOpen }: {
  invoice: Invoice | null; onClose: () => void; onChanged: () => void; setOpen: (i: Invoice | null) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { can } = usePermissions();
  const canDelete = can("deleteInvoices");
  const print = useInvoicePrinter();
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<"refund" | "delete" | null>(null);
  const [payBusy, setPayBusy] = useState(false);

  // Keyed on the invoice ID, so editing the payment method (same invoice) doesn't
  // needlessly reload the line items.
  const invoiceId = invoice?.id;
  useEffect(() => {
    if (!invoiceId) return;
    let alive = true;
    setLoading(true);
    setItems([]);
    repo.listInvoiceItems(invoiceId)
      .then((r) => { if (alive) setItems(r); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [invoiceId]);

  if (!invoice) return null;
  const refunded = (invoice.status ?? "paid") === "refunded";
  const subtotal = invoice.subtotal ?? invoice.total;
  const discount = invoice.discount ?? 0;
  const PayIcon = invoice.payment_method ? PAY_ICON[invoice.payment_method] : null;
  // Split payment: show each leg when more than one method settled the bill.
  const payLegs = (invoice.payment_details ?? []).filter((p) => p && p.method && Number(p.amount) > 0);
  const isSplit = payLegs.length > 1;

  const refund = async () => {
    if (busy) return;
    if (!window.confirm(t("retail.confirmRefund", "Refund this sale and return its items to stock?"))) return;
    setBusy("refund");
    try {
      const updated = await repo.refundInvoice(invoice.id);
      playSuccess();
      toast.success(t("retail.refundedOk", "Sale refunded — stock restored"));
      onChanged();
      setOpen(updated ?? { ...invoice, status: "refunded" });
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(null); }
  };

  const remove = async () => {
    if (busy) return;
    if (!window.confirm(t("retail.confirmDelete", "Permanently delete this invoice? This cannot be undone."))) return;
    setBusy("delete");
    try {
      await repo.deleteInvoice(invoice.id);
      playSuccess();
      toast.success(t("retail.deletedOk", "Invoice deleted"));
      onChanged();
      onClose();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(null); }
  };

  const afterPrint = (n: number) => { setOpen({ ...invoice, print_count: n }); onChanged(); };

  // Fix a mis-keyed payment method inline: optimistic UI, then persist + reconcile.
  const changePayment = async (method: PaymentMethod) => {
    if (payBusy || invoice.payment_method === method) return;
    setPayBusy(true);
    setOpen({ ...invoice, payment_method: method }); // instant
    try {
      const updated = await repo.setInvoicePaymentMethod(invoice.id, method);
      if (updated) setOpen(updated);
      playSuccess();
      toast.success(t("retail.payMethodUpdated", "تم تحديث طريقة الدفع بنجاح"));
      onChanged();
    } catch (e) {
      setOpen(invoice); // revert
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <Modal open={!!invoice} onClose={onClose} title={invoiceNo(invoice.id)}>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-bold text-ink">
              <User size={17} className="text-ink-subtle" /> {invoice.customer_name || t("retail.walkIn", "Walk-in customer")}
            </p>
            {invoice.customer_phone && <p className="text-sm text-ink-subtle">{invoice.customer_phone}</p>}
            <p className="mt-0.5 text-xs text-ink-subtle">
              {formatDate(invoice.created_at, i18n.language)} · {new Date(invoice.created_at).toLocaleTimeString(i18n.language === "ar" ? dateLocale() : "en-GB", { hour: "2-digit", minute: "2-digit" })}
            </p>
          </div>
          {refunded ? (
            <Badge tone="danger">{t("retail.refunded", "Refunded")}</Badge>
          ) : paymentStatusOf(invoice) === "paid" ? (
            <Badge tone="success"><CheckCircle2 size={12} /> {t("retail.statusPaid", "مدفوعة بالكامل")}</Badge>
          ) : paymentStatusOf(invoice) === "partial" ? (
            <Badge tone="warn">{t("retail.statusPartial", "دفع جزئي")}</Badge>
          ) : (
            <Badge tone="danger">{t("retail.statusUnpaid", "آجل بالكامل")}</Badge>
          )}
        </div>

        {/* Items */}
        <div className="rounded-2xl border border-line">
          {loading ? (
            <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-9 rounded-lg" />)}</div>
          ) : items.length === 0 ? (
            <div className="grid place-items-center p-6 text-sm text-ink-subtle"><Package size={20} className="mb-1 opacity-40" /> {t("retail.noLines", "No line items.")}</div>
          ) : (
            <div className="divide-y divide-line">
              {items.map((it) => (
                <div key={it.id} className="flex items-center gap-3 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-ink">{it.name}</p>
                    <p className="text-xs text-ink-subtle">{it.qty} × {money(it.unit_price)}</p>
                  </div>
                  <span className="text-sm font-bold tabular-nums text-ink">{money(it.line_total)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Totals */}
        <div className="space-y-1 text-sm">
          {discount > 0 && (
            <>
              <div className="flex justify-between text-ink-muted"><span>{t("retail.subtotal", "Subtotal")}</span><span className="tabular-nums">{money(subtotal)}</span></div>
              <div className="flex justify-between text-success-600"><span>{t("retail.discount", "Discount")}{invoice.discount_type === "percent" ? "" : ""}</span><span className="tabular-nums">-{money(discount)}</span></div>
            </>
          )}
          <div className="flex items-center justify-between border-t border-line pt-1.5">
            <span className="font-display font-bold text-ink">{t("retail.total", "Total")}</span>
            <span className="font-display text-xl font-extrabold text-ink tabular-nums">{money(invoice.total)}</span>
          </div>
          {isDebt(invoice) && (
            <div className="space-y-0.5 rounded-lg bg-warn-50 px-2.5 py-1.5 text-xs dark:bg-warn-500/10">
              <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.paidSoFar", "المدفوع")}</span><span className="tabular-nums text-success-600">{money(paidOf(invoice))}</span></div>
              <div className="flex items-center justify-between font-bold text-warn-700 dark:text-warn-300"><span>{t("retail.remainingDue", "المبلغ المتبقي")}</span><span className="tabular-nums">{money(dueOf(invoice))}</span></div>
            </div>
          )}
          <div className="flex items-center justify-between text-xs text-ink-subtle">
            <span className="flex items-center gap-2">
              <span className="text-ink-subtle">{t("retail.payMethodLabel", "طريقة الدفع")}</span>
              {isSplit ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-muted"><Wallet size={13} /> {t("retail.split", "دفع مجزأ")}</span>
              ) : refunded ? (
                <span className="inline-flex items-center gap-1.5 font-semibold text-ink-muted">{PayIcon && <PayIcon size={13} />} {invoice.payment_method ? t(PAY_KEY[invoice.payment_method]) : t("retail.unpaidMethod", "—")}</span>
              ) : (
                <PaymentMethodEditor invoice={invoice} busy={payBusy} onPick={changePayment} />
              )}
            </span>
            <span className="flex items-center gap-1"><Printer size={12} /> {t("retail.printsN", { n: invoice.print_count ?? 0, defaultValue: "prints: {{n}}" })}</span>
          </div>
          {isSplit && (
            <div className="space-y-0.5 rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-muted">
              {payLegs.map((p, i) => {
                const Icon = PAY_ICON[p.method] ?? Banknote;
                return (
                  <div key={i} className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5"><Icon size={11} /> {PAY_KEY[p.method] ? t(PAY_KEY[p.method]) : p.method}</span>
                    <span className="tabular-nums">{money(p.amount)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={() => print(invoice, "a4", { items, onCounted: afterPrint })}>{t("retail.printA4", "Print A4")}</Button>
          <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={() => print(invoice, "thermal", { items, onCounted: afterPrint })}>{t("retail.printReceipt", "Receipt 80mm")}</Button>
        </div>
        <div className="flex items-center gap-2">
          {!refunded && (
            <Button variant="outline" className="flex-1" loading={busy === "refund"} leftIcon={<RotateCcw size={16} />} onClick={refund}>{t("retail.refund", "Refund")}</Button>
          )}
          {canDelete && (
            <Button variant="ghost" className={cn("text-danger-600 hover:bg-danger-50", refunded && "flex-1")} loading={busy === "delete"} leftIcon={<Trash2 size={16} />} onClick={remove}>
              {t("retail.delete", "Delete")}
            </Button>
          )}
        </div>
        {!canDelete && !refunded && (
          <p className="flex items-center gap-1.5 text-2xs text-ink-subtle"><AlertTriangle size={12} /> {t("retail.deleteAdminOnly", "Only clinic admins can permanently delete invoices.")}</p>
        )}
      </div>
    </Modal>
  );
}

/** Inline dropdown to correct an invoice's payment method — a sleek, dark-theme menu
 *  of the 3 methods that opens upward (it sits low in the modal). RTL-aware. */
function PaymentMethodEditor({ invoice, busy, onPick }: { invoice: Invoice; busy: boolean; onPick: (m: PaymentMethod) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDoc); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const cur = invoice.payment_method;
  const CurIcon = cur ? PAY_ICON[cur] : Wallet;
  const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => { playTap(); setOpen((o) => !o); }}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={cn(
          "group inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold transition",
          open ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-2 text-ink-muted hover:border-brand-300 hover:text-ink",
        )}
      >
        <CurIcon size={13} className="text-brand-600" />
        {cur ? t(PAY_KEY[cur]) : t("retail.setMethod", "تحديد الطريقة")}
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Pencil size={11} className="opacity-60 transition group-hover:opacity-100" />}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="listbox"
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14, ease: "easeOut" }}
            className="absolute bottom-full z-50 mb-1.5 min-w-[168px] overflow-hidden rounded-xl border border-line bg-surface-1 p-1 shadow-raised ltr:left-0 rtl:right-0"
          >
            {METHODS.map((m) => {
              const Icon = PAY_ICON[m];
              const active = m === cur;
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => { setOpen(false); onPick(m); }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium transition",
                    active ? "bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
                  )}
                >
                  <Icon size={15} className={active ? "text-brand-600" : "text-ink-subtle"} />
                  <span className="flex-1 text-start">{t(PAY_KEY[m])}</span>
                  {active && <Check size={14} className="text-brand-600" />}
                </button>
              );
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
