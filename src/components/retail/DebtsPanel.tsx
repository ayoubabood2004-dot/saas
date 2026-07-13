import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Search, HandCoins, User, Phone, CalendarClock, Coins, Users,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2, Wallet, ChevronLeft,
  ArrowRight, Receipt, BookUser, ReceiptText,
} from "lucide-react";
import type { Invoice, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, Badge, useToast } from "@/components/ui";
import { InvoiceDetail } from "@/components/retail/InvoicesPanel";
import { invoiceNo } from "@/lib/invoicePrint";
import { phoneDigits } from "@/lib/phone";
import { cn, formatDate, formatNum, money } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { paidOf, dueOf, paymentStatusOf, isDebt, round2 } from "@/lib/debt";

const PAY_OPTIONS: { value: PaymentMethod; icon: typeof Banknote; key: string; def: string }[] = [
  { value: "cash", icon: Banknote, key: "retail.payCash", def: "نقدي" },
  { value: "card", icon: CreditCard, key: "retail.payCard", def: "بطاقة ائتمان" },
  { value: "transfer", icon: ArrowLeftRight, key: "retail.payTransfer", def: "حوالة بنكية" },
];

/** One debtor's consolidated account (دفتر العميل): every unpaid sale grouped
 *  under the same customer (matched by phone, else name). */
interface Ledger {
  key: string;
  name: string;
  phone: string | null;
  debts: Invoice[];
  total: number;   // sum of grand totals
  paid: number;    // sum paid so far
  due: number;     // outstanding balance
  oldest: string;  // ISO of the oldest open debt
}

/** سجل الديون — a per-customer debt notebook. The top level lists every debtor with
 *  their TOTAL balance; opening one shows their personal ledger of debts, and each
 *  debt drills into the full invoice. Installments are recorded with "تسديد دفعة". */
export function DebtsPanel({ invoices, onChanged }: { invoices: Invoice[]; clinicId?: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [q, setQ] = useState("");
  const [openKey, setOpenKey] = useState<string | null>(null);

  // Group every live debt (not refunded, still owing) under its customer.
  const ledgers = useMemo<Ledger[]>(() => {
    const map = new Map<string, Ledger>();
    for (const inv of invoices.filter(isDebt)) {
      const phone = (inv.customer_phone ?? "").trim() || null;
      const name = (inv.customer_name ?? "").trim();
      // A stable identity: phone wins; else a named customer; else this one anonymous sale.
      const key = phone ? `p:${phoneDigits(phone)}` : name ? `n:${name.toLowerCase()}` : `i:${inv.id}`;
      const g = map.get(key) ?? { key, name, phone, debts: [], total: 0, paid: 0, due: 0, oldest: inv.created_at };
      g.debts.push(inv);
      g.total = round2(g.total + inv.total);
      g.paid = round2(g.paid + paidOf(inv));
      g.due = round2(g.due + dueOf(inv));
      if (inv.created_at < g.oldest) g.oldest = inv.created_at;
      if (!g.name && name) g.name = name;
      if (!g.phone && phone) g.phone = phone;
      map.set(key, g);
    }
    // Biggest balances first — the accounts that need attention.
    return [...map.values()].sort((a, b) => b.due - a.due);
  }, [invoices]);

  const filtered = useMemo(() => {
    const ql = q.trim().toLowerCase();
    if (!ql) return ledgers;
    return ledgers.filter((g) => (g.name ?? "").toLowerCase().includes(ql) || (g.phone ?? "").includes(ql));
  }, [ledgers, q]);

  const outstanding = useMemo(() => round2(ledgers.reduce((s, g) => s + g.due, 0)), [ledgers]);

  // ── Level 2: one customer's notebook ──
  const open = openKey ? ledgers.find((g) => g.key === openKey) ?? null : null;
  if (openKey) {
    return <CustomerLedger ledger={open} onBack={() => setOpenKey(null)} onChanged={onChanged} />;
  }

  // ── Level 1: debtors list ──
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="card flex items-center gap-3 p-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><Coins size={20} /></span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-ink tabular-nums">{money(outstanding)}</p>
            <p className="truncate text-xs text-ink-subtle">{t("retail.outstandingTotal", "إجمالي الديون المستحقة")}</p>
          </div>
        </div>
        <div className="card flex items-center gap-3 p-3.5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Users size={20} /></span>
          <div className="min-w-0">
            <p className="truncate text-lg font-bold text-ink tabular-nums">{formatNum(ledgers.length)}</p>
            <p className="truncate text-xs text-ink-subtle">{t("retail.debtorsCount2", "عدد العملاء المدينين")}</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
        <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("retail.searchDebts", "ابحث باسم العميل أو الهاتف…")} />
      </div>

      {filtered.length === 0 ? (
        <div className="card grid place-items-center p-12 text-center text-ink-subtle">
          <HandCoins size={30} className="mb-2 opacity-40" />
          {ledgers.length === 0 ? t("retail.noDebts", "لا توجد ديون — كل الفواتير مسدّدة بالكامل.") : t("retail.noDebtMatch", "لا توجد ديون مطابقة لبحثك.")}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {filtered.map((g) => (
            <motion.button
              key={g.key} variants={staggerItem} onClick={() => { playTap(); setOpenKey(g.key); }}
              className="card flex w-full items-center gap-3 p-3.5 text-start transition hover:border-warn-300 hover:shadow-raised"
            >
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><BookUser size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-ink">
                  {g.name || t("retail.walkIn", "عميل نقدي")}
                  <Badge tone="warn">{t("retail.debtsN", { n: g.debts.length, defaultValue: "{{n}} ديون" })}</Badge>
                </p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                  {g.phone && <span className="flex items-center gap-1" dir="ltr"><Phone size={11} /> {g.phone}</span>}
                  <span className="flex items-center gap-1"><CalendarClock size={11} /> {t("retail.since", "منذ")} {formatDate(g.oldest, i18n.language)}</span>
                </div>
              </div>
              <div className="text-end">
                <p className="text-2xs text-ink-subtle">{t("retail.owesYou", "عليه")}</p>
                <p className="font-display text-lg font-extrabold tabular-nums text-warn-600 dark:text-warn-300">{money(g.due)}</p>
              </div>
              <ChevronLeft size={18} className="shrink-0 text-ink-subtle ltr:rotate-180" />
            </motion.button>
          ))}
        </motion.div>
      )}
    </div>
  );
}

/* ------------------------- Level 2: customer notebook ------------------------- */
function CustomerLedger({ ledger, onBack, onChanged }: { ledger: Ledger | null; onBack: () => void; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const [settling, setSettling] = useState<Invoice | null>(null);
  const [detail, setDetail] = useState<Invoice | null>(null);

  const BackBtn = (
    <button onClick={() => { playTap(); onBack(); }} className="inline-flex items-center gap-1.5 text-sm font-bold text-ink-muted transition hover:text-ink">
      <ArrowRight size={16} className="ltr:rotate-180" /> {t("retail.backToDebtors", "كل العملاء المدينين")}
    </button>
  );

  // Every debt just got settled → the account is clear.
  if (!ledger) {
    return (
      <div className="space-y-4">
        {BackBtn}
        <div className="card grid place-items-center p-12 text-center">
          <CheckCircle2 size={34} className="mb-2 text-success-500" />
          <p className="font-bold text-ink">{t("retail.customerCleared", "تم تسديد كل ديون هذا العميل")}</p>
        </div>
      </div>
    );
  }

  // A running account reads oldest-first, like a paper ledger.
  const debts = [...ledger.debts].sort((a, b) => a.created_at.localeCompare(b.created_at));

  return (
    <div className="space-y-4">
      {BackBtn}

      {/* Notebook header — who + how much */}
      <div className="card overflow-hidden p-0">
        <div className="flex items-center gap-3 border-b border-line bg-gradient-to-br from-warn-500/10 to-brand-500/10 px-4 py-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-warn-600 text-white shadow-soft"><BookUser size={24} /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-lg font-bold text-ink">{ledger.name || t("retail.walkIn", "عميل نقدي")}</p>
            {ledger.phone && <p className="flex items-center gap-1 text-sm text-ink-subtle" dir="ltr"><Phone size={12} /> {ledger.phone}</p>}
          </div>
          <div className="text-end">
            <p className="text-2xs font-semibold text-ink-subtle">{t("retail.totalOwed", "إجمالي الدين")}</p>
            <p className="font-display text-2xl font-extrabold tabular-nums text-warn-600 dark:text-warn-300">{money(ledger.due)}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 divide-x divide-line rtl:divide-x-reverse">
          <Stat label={t("retail.grandTotalAll", "إجمالي الفواتير")} value={money(ledger.total)} />
          <Stat label={t("retail.paidSoFar", "المدفوع")} value={money(ledger.paid)} tone="success" />
          <Stat label={t("retail.openDebts", "ديون مفتوحة")} value={formatNum(debts.length)} />
        </div>
      </div>

      {/* The debts — tap any row for the full invoice */}
      <div className="space-y-2">
        {debts.map((inv) => {
          const due = dueOf(inv);
          const status = paymentStatusOf(inv);
          return (
            <div key={inv.id} className="card overflow-hidden p-0">
              <button
                onClick={() => { playTap(); setDetail(inv); }}
                className="flex w-full items-center gap-3 p-3.5 text-start transition hover:bg-surface-2"
                title={t("retail.tapForInvoice", "اضغط لعرض الفاتورة كاملة")}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300"><ReceiptText size={18} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                    <span className="font-mono text-2xs text-ink-subtle">{invoiceNo(inv.id)}</span>
                    <Badge tone={status === "unpaid" ? "danger" : "warn"}>
                      {status === "unpaid" ? t("retail.statusUnpaid", "آجل بالكامل") : t("retail.statusPartial", "دفع جزئي")}
                    </Badge>
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
                    <span className="flex items-center gap-1"><CalendarClock size={11} /> {formatDate(inv.created_at, i18n.language)}</span>
                    <span>{t("retail.grandTotal", "إجمالي الفاتورة")}: <span className="font-semibold tabular-nums text-ink">{money(inv.total)}</span></span>
                    <span>{t("retail.paidSoFar", "المدفوع")}: <span className="font-semibold tabular-nums text-success-600">{money(paidOf(inv))}</span></span>
                  </div>
                </div>
                <div className="text-end">
                  <p className="text-2xs text-ink-subtle">{t("retail.remainingDue", "المبلغ المتبقي")}</p>
                  <p className="font-display text-lg font-extrabold tabular-nums text-warn-600 dark:text-warn-300">{money(due)}</p>
                </div>
                <Receipt size={16} className="shrink-0 text-ink-subtle" />
              </button>
              <div className="flex items-center justify-end gap-2 border-t border-line bg-surface-1 px-3 py-2">
                <Button size="sm" variant="secondary" leftIcon={<Receipt size={15} />} onClick={() => { playTap(); setDetail(inv); }}>
                  {t("retail.invoiceDetails", "تفاصيل الفاتورة")}
                </Button>
                <Button size="sm" leftIcon={<Coins size={15} />} onClick={() => { playTap(); setSettling(inv); }}>
                  {t("retail.settle", "تسديد دفعة")}
                </Button>
              </div>
            </div>
          );
        })}
      </div>

      <SettleModal invoice={settling} onClose={() => setSettling(null)} onSettled={() => { setSettling(null); onChanged(); }} />
      <InvoiceDetail invoice={detail} onClose={() => setDetail(null)} onChanged={onChanged} setOpen={setDetail} />
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "success" }) {
  return (
    <div className="px-3 py-2.5 text-center">
      <p className={cn("font-display text-base font-bold tabular-nums", tone === "success" ? "text-success-600" : "text-ink")}>{value}</p>
      <p className="mt-0.5 text-2xs text-ink-subtle">{label}</p>
    </div>
  );
}

function SettleModal({ invoice, onClose, onSettled }: { invoice: Invoice | null; onClose: () => void; onSettled: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);

  const due = invoice ? dueOf(invoice) : 0;
  // The installment cannot exceed the outstanding balance (float-safe).
  const pay = Math.max(0, Math.min(due, round2(Number(amount) || 0)));
  const after = round2(due - pay);
  const settlesFully = after <= 0.01;

  // Reset the form whenever a different debt is opened (default to paying the full balance).
  useEffect(() => {
    if (!invoice) return;
    const d = dueOf(invoice);
    setAmount(d > 0 ? String(d) : "");
    setMethod("cash");
  }, [invoice]);

  const submit = async () => {
    if (!invoice || busy || pay <= 0) return;
    setBusy(true);
    try {
      await repo.settleInvoice(invoice.id, pay, method);
      playSuccess();
      onSettled();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={!!invoice} onClose={onClose} title={t("retail.settleTitle", "تسديد دين")}>
      {invoice && (
        <div className="space-y-4">
          <div className="rounded-xl bg-surface-2 p-3 text-sm">
            <div className="flex items-center gap-2 font-semibold text-ink"><User size={14} /> {invoice.customer_name || t("retail.walkIn", "عميل نقدي")}</div>
            <div className="mt-2 space-y-1">
              <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.grandTotal", "إجمالي الفاتورة")}</span><span className="tabular-nums">{money(invoice.total)}</span></div>
              <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.paidSoFar", "المدفوع")}</span><span className="tabular-nums text-success-600">{money(paidOf(invoice))}</span></div>
              <div className="flex items-center justify-between font-bold text-warn-600"><span>{t("retail.remainingDue", "المبلغ المتبقي")}</span><span className="tabular-nums">{money(due)}</span></div>
            </div>
          </div>

          <div>
            <label className="label">{t("retail.settleQuestion", "كم يدفع العميل اليوم؟")}</label>
            <div className="flex items-center gap-2">
              <input
                autoFocus type="number" min="0" step="1" inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
                placeholder="0"
                className="input flex-1 text-end font-bold tabular-nums"
              />
              <div className="relative w-40">
                <select value={method} onChange={(e) => setMethod(e.target.value as PaymentMethod)} className="input w-full appearance-none py-0 ps-8 pe-2 text-sm font-semibold h-[42px]">
                  {PAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key, o.def)}</option>)}
                </select>
                {(() => { const Icon = PAY_OPTIONS.find((o) => o.value === method)?.icon ?? Banknote; return <Icon size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-2.5 rtl:right-2.5" />; })()}
              </div>
            </div>
            <div className="mt-1.5 flex gap-1.5">
              {[0.5, 1].map((frac) => (
                <button key={frac} onClick={() => { playTap(); setAmount(String(round2(due * frac))); }}
                  className="rounded-lg border border-line bg-surface-1 px-2.5 py-1 text-2xs font-semibold text-ink-muted transition hover:bg-surface-2">
                  {frac === 1 ? t("retail.payFull", "كامل المتبقي") : t("retail.payHalf", "نصف المتبقي")}
                </button>
              ))}
            </div>
          </div>

          <div className={cn("flex items-center justify-between rounded-xl px-3 py-2 text-sm font-bold",
            settlesFully ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200" : "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-300")}>
            <span className="flex items-center gap-1.5">
              {settlesFully ? <CheckCircle2 size={15} /> : <Wallet size={15} />}
              {settlesFully ? t("retail.willSettle", "ستُسدَّد الفاتورة بالكامل") : t("retail.afterPayment", "المتبقي بعد الدفع")}
            </span>
            {!settlesFully && <span className="tabular-nums">{money(after)}</span>}
          </div>

          <Button className="w-full" size="lg" disabled={pay <= 0} loading={busy} onClick={submit} leftIcon={<Coins size={18} />}>
            {t("retail.confirmSettle", "تسجيل الدفعة")} · {money(pay)}
          </Button>
        </div>
      )}
    </Modal>
  );
}
