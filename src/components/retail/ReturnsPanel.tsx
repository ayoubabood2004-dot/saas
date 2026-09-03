import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  RotateCcw, Search, Receipt, Plus, Minus, Wallet, Banknote, CreditCard,
  ArrowLeftRight, CheckCircle2, PackageOpen, AlertTriangle, ChevronRight, Loader2,
} from "lucide-react";
import type { Invoice, InvoiceItem, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { getInvoicesPaged } from "@/lib/settings";
import { Button, useToast } from "@/components/ui";
import { round2, paidOf, dueOf } from "@/lib/debt";
import { cn, money, normalizeAr, formatNum, formatDate } from "@/lib/utils";
import { invoiceNo } from "@/lib/invoicePrint";
import { describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/* ============================================================================
 * المرتجع — تبويب داخل المبيعات.
 *
 * الحقيقة اليومية للبيع: زبون يرجع بعد يومين بقنينة من ثلاث اشتراها. المسار
 * هنا ثلاث ضغطات: لگ الفاتورة ← حدّد شگد رجع من كل صنف ← أكّد. والسستم
 * يحرّك الحقائق الثلاث معاً وبمعاملة واحدة (0121):
 *   · المخزون: الراجع يرجع بنفس تقسيمه وقت البيع (حصة القسم للقسم).
 *   · الفاتورة: تنقص كمياتها ويعاد حساب مجموعها وربحها.
 *   · النقد: ما يخرج فعلاً من الدرج يُسجَّل سطراً سالباً بنفس جيب الدفع —
 *     فيصدق الصندوق ومطابقة نهاية الدوام بلا أي قيد يدوي.
 * إرجاع كل الأصناف = إرجاع الفاتورة كاملةً بدلالاتها المعروفة (refunded).
 * ==========================================================================*/

const PAY_META: { id: PaymentMethod; icon: typeof Banknote }[] = [
  { id: "cash", icon: Banknote },
  { id: "card", icon: CreditCard },
  { id: "transfer", icon: ArrowLeftRight },
];

export function ReturnsPanel({ invoices, onChanged }: { invoices: Invoice[]; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Invoice | null>(null);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [ret, setRet] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  /** الفواتير المرشّحة: غير المرجعة، الأحدث أولاً، ويضيّقها البحث بالاسم
   *  أو الهاتف أو رقم الفاتورة. */
  const localCandidates = useMemo(() => {
    const live = invoices.filter((i) => (i.status ?? "paid") !== "refunded");
    const s = normalizeAr(q.trim().toLowerCase());
    const list = !s ? live : live.filter((i) =>
      normalizeAr((i.customer_name ?? "").toLowerCase()).includes(s)
      || (i.customer_phone ?? "").includes(q.trim())
      || invoiceNo(i.id).toLowerCase().includes(q.trim().toLowerCase()));
    return list.slice(0, 12);
  }, [invoices, q]);

  /* (0150) بالوضع المُصفَّح لقطةُ الصفحة آخرُ ١٥ يوماً فقط؛ زبونٌ يرجع بفاتورةِ
   * شهرٍ لا يجدها المتصفّح — فالبحثُ المكتوب يمرّ بالخادم على كل التاريخ،
   * وبلا بحثٍ تبقى القائمةُ المحلّية (الأحدث). */
  const paged = getInvoicesPaged();
  const serverQ = paged ? q.trim() : "";
  const [remote, setRemote] = useState<Invoice[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchFailed, setSearchFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!serverQ) { setRemote(null); setSearching(false); setSearchFailed(false); return; }
    let alive = true;
    setSearching(true);
    const timer = setTimeout(() => {
      repo.searchInvoices({ q: serverQ, status: "paid", limit: 12 })
        .then((r) => { if (alive) { setRemote(r); setSearchFailed(false); } })
        .catch(() => { if (alive) { setRemote([]); setSearchFailed(true); } })
        .finally(() => { if (alive) setSearching(false); });
    }, 300);
    return () => { alive = false; clearTimeout(timer); };
  }, [serverQ, retry]);
  const candidates = serverQ && remote ? remote : localCandidates;

  const pick = (inv: Invoice) => {
    playTap();
    setPicked(inv);
    setRet({});
    setNote("");
    setLoading(true);
    const dominant = (inv.payment_details ?? []).filter((l) => l.amount > 0).sort((a, b) => b.amount - a.amount)[0]?.method;
    setMethod((dominant ?? inv.payment_method ?? "cash") as PaymentMethod);
    repo.listInvoiceItems(inv.id)
      .then(setItems)
      .catch((e) => toast.error(describeDbError(e, t)))
      .finally(() => setLoading(false));
  };

  const setQty = (id: string, max: number, v: number) =>
    setRet((m) => ({ ...m, [id]: Math.max(0, Math.min(max, Math.round(v * 1000) / 1000)) }));

  /* ── الحساب المعروض قبل التأكيد — نفس معادلة السيرفر حرفياً ── */
  const calc = useMemo(() => {
    if (!picked) return null;
    const retVal = items.reduce((s, it) => s + (ret[it.id] ?? 0) * it.unit_price, 0);
    const full = items.length > 0 && items.every((it) => (ret[it.id] ?? 0) + 0.0005 >= it.qty);
    const subtotalLeft = round2(items.reduce((s, it) => s + (it.qty - (ret[it.id] ?? 0)) * it.unit_price, 0));
    const discount = Math.max(0, Number(picked.discount) || 0);
    const newTotal = full ? 0 : Math.max(0, round2(subtotalLeft - discount));
    const paid = paidOf(picked);
    const back = full ? paid : Math.max(0, round2(paid - newTotal));
    const count = items.reduce((n, it) => n + (ret[it.id] ?? 0), 0);
    return { retVal: round2(retVal), full, newTotal, back, count, due: dueOf(picked) };
  }, [picked, items, ret]);

  const save = async () => {
    if (!picked || !calc || saving || calc.count <= 0) return;
    const msg = calc.full
      ? t("ret.confirmFull", { n: money(calc.back), defaultValue: "إرجاع الفاتورة كاملةً؟ البضاعة كلها ترجع للمخزون وترجّع للزبون {{n}}." })
      : t("ret.confirmPart", { c: formatNum(calc.count), n: money(calc.back), defaultValue: "تأكيد إرجاع {{c}} قطعة؟ ترجع للمخزون فوراً، وترجّع للزبون {{n}}." });
    if (!window.confirm(msg)) return;
    setSaving(true);
    try {
      const lines = items
        .map((it) => ({ item_id: it.id, qty: ret[it.id] ?? 0 }))
        .filter((l) => l.qty > 0);
      await repo.returnInvoiceItems(picked.id, lines, method, note.trim() || null);
      playSuccess();
      toast.success(calc.back > 0
        ? t("ret.doneBack", { n: money(calc.back), defaultValue: "تم الإرجاع — البضاعة رجعت للمخزون، ورجّع للزبون {{n}}" })
        : t("ret.doneNoBack", "تم الإرجاع — البضاعة رجعت للمخزون ونقص دين الفاتورة"));
      setPicked(null);
      setItems([]);
      setRet({});
      onChanged();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setSaving(false); }
  };

  /* ── مرتجعات اليوم — حتى يشوف الكاشير شنو صار بدوامه ── */
  const todayISO = new Date().toLocaleDateString("en-CA");
  const todayReturns = useMemo(() => {
    const out: { inv: Invoice; amount: number; full: boolean }[] = [];
    for (const inv of invoices) {
      if ((inv.status ?? "paid") === "refunded" && (inv.refunded_at ?? "").slice(0, 10) === todayISO) {
        out.push({ inv, amount: inv.total, full: true });
        continue;
      }
      // مطابقة ختم «مرتجع» (مهارب يونيكود — بيانات لا نص واجهة).
      const backToday = (inv.payment_details ?? [])
        .filter((l) => l.amount < 0 && (l.note ?? "").startsWith("\u0645\u0631\u062A\u062C\u0639") && (l.at ?? "").slice(0, 10) === todayISO)
        .reduce((s, l) => s + Math.abs(l.amount), 0);
      if (backToday > 0) out.push({ inv, amount: round2(backToday), full: false });
    }
    return out.sort((a, b) => (b.inv.refunded_at ?? b.inv.created_at).localeCompare(a.inv.refunded_at ?? a.inv.created_at)).slice(0, 8);
  }, [invoices, todayISO]);

  useEffect(() => { setQ(""); }, [picked]);

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,400px]">
      {/* ── اليسار: اختيار الفاتورة ثم أصنافها ── */}
      <div className="space-y-3">
        {!picked ? (
          <>
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
              <input data-retsearch className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t("ret.searchPh", "دوّر الفاتورة — اسم الزبون، هاتفه، أو رقم الفاتورة…")} />
            </div>
            {paged && (
              <p className="flex items-center gap-1.5 text-2xs text-ink-subtle" data-rethint>
                {searching && <Loader2 size={11} className="animate-spin" />}
                {t("retail.retSearchServerHint", "Type a name, phone or invoice number — search covers the whole history")}
              </p>
            )}
            <div className="space-y-2">
              {searchFailed && serverQ ? (
                <div className="card flex flex-col items-center gap-2 p-8 text-center" data-retfailed>
                  <p className="text-sm text-ink-subtle">{t("retail.invoicesLoadFailed", "Could not load invoices. It is a connection problem and no invoice is lost — try again.")}</p>
                  <Button size="sm" variant="secondary" onClick={() => { playTap(); setRetry((n) => n + 1); }}>{t("common.retry", "Retry")}</Button>
                </div>
              ) : candidates.length === 0 ? (
                <div className="card flex flex-col items-center gap-2 p-8 text-center">
                  <RotateCcw size={26} className="text-ink-subtle" />
                  <p className="text-sm text-ink-subtle">{t("ret.noInv", "ماكو فواتير مطابقة — المرجعة أصلاً ما تنعرض هنا.")}</p>
                </div>
              ) : candidates.map((inv) => (
                <button key={inv.id} data-retinv={inv.id} onClick={() => pick(inv)}
                  className="card flex w-full flex-wrap items-center gap-3 p-3 text-start transition hover:border-brand-300 hover:shadow-raised">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Receipt size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-2 text-sm font-extrabold text-ink">
                      {(inv.customer_name ?? "").trim() || t("rpt.walkIn", "عميل نقدي")}
                      <span className="chip bg-surface-2 font-mono text-2xs text-ink-muted">{invoiceNo(inv.id)}</span>
                    </span>
                    <span className="block text-2xs text-ink-subtle">
                      {formatDate(inv.created_at, i18n.language)} · {formatNum(inv.item_count)} {t("ret.pieces", "قطعة")}
                    </span>
                  </span>
                  <span className="text-sm font-extrabold tabular-nums text-ink">{money(inv.total)}</span>
                  <ChevronRight size={15} className="shrink-0 text-ink-subtle rtl:rotate-180" />
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="card p-4">
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <button type="button" data-retback onClick={() => { playTap(); setPicked(null); }}
                className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3">
                <ChevronRight size={17} className="ltr:rotate-180" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-extrabold text-ink">
                  {(picked.customer_name ?? "").trim() || t("rpt.walkIn", "عميل نقدي")}
                  <span className="ms-2 font-mono text-2xs font-bold text-ink-subtle">{invoiceNo(picked.id)}</span>
                </p>
                <p className="text-2xs text-ink-subtle">{formatDate(picked.created_at, i18n.language)} · {t("ret.invTotal", { n: money(picked.total), defaultValue: "إجماليها {{n}}" })}</p>
              </div>
              <Button size="sm" variant="secondary" data-retall
                onClick={() => { playTap(); setRet(Object.fromEntries(items.map((it) => [it.id, it.qty]))); }}>
                {t("ret.allBtn", "إرجاع الكل")}
              </Button>
            </div>

            {loading ? (
              <p className="p-6 text-center text-sm text-ink-subtle">{t("common.loading", "جارٍ التحميل…")}</p>
            ) : (
              <div className="space-y-1.5">
                {items.map((it) => {
                  const r = ret[it.id] ?? 0;
                  return (
                    <div key={it.id} data-retline={it.id}
                      className={cn("flex flex-wrap items-center gap-2 rounded-2xl border p-2.5",
                        r > 0 ? "border-warn-300 bg-warn-50/60 dark:border-warn-500/40 dark:bg-warn-500/10" : "border-line bg-surface-1")}>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-ink">
                          {it.name}
                          {it.unit_label && <span className="ms-1.5 text-2xs font-normal text-ink-subtle">({it.unit_label})</span>}
                        </p>
                        <p className="text-2xs text-ink-subtle tabular-nums">
                          {t("ret.soldLine", { q: formatNum(it.qty), p: money(it.unit_price), defaultValue: "المباع {{q}} × {{p}}" })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="me-1 text-2xs font-bold text-ink-subtle">{t("ret.retQty", "الراجع:")}</span>
                        <button data-retminus onClick={() => { playTap(); setQty(it.id, it.qty, r - 1); }} disabled={r <= 0}
                          className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3 disabled:opacity-40"><Minus size={17} /></button>
                        <input data-retqty inputMode="decimal" value={r}
                          onChange={(e) => setQty(it.id, it.qty, Number(e.target.value.replace(/[^\d.]/g, "")) || 0)}
                          className={cn("h-11 w-14 rounded-xl border text-center text-base font-bold tabular-nums",
                            r > 0 ? "border-warn-400 bg-surface-1 text-warn-700 dark:text-warn-300" : "border-line bg-surface-1 text-ink")} />
                        <button data-retplus onClick={() => { playTap(); setQty(it.id, it.qty, r + 1); }} disabled={r >= it.qty}
                          className="grid h-11 w-11 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3 disabled:opacity-40"><Plus size={17} /></button>
                      </div>
                      <span className="w-24 shrink-0 text-end text-sm font-extrabold tabular-nums text-ink">{r > 0 ? money(r * it.unit_price) : "—"}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── اليمين: خلاصة الإرجاع والتأكيد ── */}
      <div className="space-y-3">
        <div className="card p-4">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-extrabold text-ink">
            <RotateCcw size={16} className="text-warn-600" /> {t("ret.sumTitle", "خلاصة المرتجع")}
          </h3>
          {!picked || !calc ? (
            <p className="rounded-xl bg-surface-2 p-4 text-center text-xs text-ink-subtle">{t("ret.pickFirst", "اختر فاتورة من القائمة أولاً.")}</p>
          ) : (
            <div className="space-y-2.5">
              <Row label={t("ret.rowPieces", "القطع الراجعة")} value={formatNum(calc.count)} />
              <Row label={t("ret.rowValue", "قيمة الراجع")} value={money(calc.retVal)} />
              <Row label={t("ret.rowNewTotal", "إجمالي الفاتورة بعد")} value={money(calc.newTotal)} />
              <div className="rounded-2xl border border-warn-300 bg-warn-50 p-3 dark:border-warn-500/40 dark:bg-warn-500/10">
                <p className="text-2xs font-bold text-warn-700 dark:text-warn-300">{t("ret.backLabel", "يرجع للزبون من الصندوق")}</p>
                <p data-retbackamount className="font-display text-2xl font-black tabular-nums text-warn-700 dark:text-warn-300">{money(calc.back)}</p>
                {calc.back === 0 && calc.count > 0 && (
                  <p className="mt-1 text-2xs font-semibold text-ink-muted">{t("ret.noBackHint", "الفاتورة آجلة — ما يخرج نقد، دين الزبون ينقص وحده.")}</p>
                )}
              </div>
              {calc.full && (
                <p className="flex items-start gap-1.5 rounded-xl bg-danger-50 p-2.5 text-2xs font-semibold text-danger-700 dark:bg-danger-500/10 dark:text-danger-300">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {t("ret.fullHint", "كل الأصناف راجعة — الفاتورة كلها راح تنقلب «مرجعة».")}
                </p>
              )}
              {calc.back > 0 && (
                <div>
                  <p className="mb-1.5 text-2xs font-bold text-ink-muted">{t("ret.methodLabel", "يرجع من أي جيب؟")}</p>
                  <div className="flex gap-1.5">
                    {PAY_META.map((m) => (
                      <button key={m.id} type="button" data-retmethod={m.id} onClick={() => { playTap(); setMethod(m.id); }}
                        className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-bold transition",
                          method === m.id ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted")}>
                        <m.icon size={14} /> {m.id === "cash" ? t("ret.pay.cash", "نقد") : m.id === "card" ? t("ret.pay.card", "بطاقة") : t("ret.pay.transfer", "حوالة")}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <input data-retnote className="input" value={note} onChange={(e) => setNote(e.target.value)}
                placeholder={t("ret.notePh", "سبب الإرجاع (اختياري) — ينختم بالفاتورة")} />
              <Button data-retconfirm className="w-full" style={{ minHeight: 48 }} loading={saving}
                disabled={calc.count <= 0} leftIcon={<CheckCircle2 size={17} />} onClick={() => void save()}>
                {t("ret.confirmBtn", "تأكيد الإرجاع")}
              </Button>
              <p className="text-center text-2xs text-ink-subtle">{t("ret.confirmHint", "البضاعة ترجع للمخزون والصندوق ينضبط بنفس الضغطة.")}</p>
            </div>
          )}
        </div>

        {/* مرتجعات اليوم */}
        <div className="card p-4">
          <h3 className="mb-2 flex items-center gap-2 text-sm font-extrabold text-ink">
            <PackageOpen size={15} className="text-ink-muted" /> {t("ret.todayTitle", "مرتجعات اليوم")}
          </h3>
          {todayReturns.length === 0 ? (
            <p className="text-xs text-ink-subtle">{t("ret.todayEmpty", "ماكو مرتجعات اليوم — عساها تبقى هيچ 🤞")}</p>
          ) : (
            <div className="space-y-1.5">
              {todayReturns.map((r) => (
                <div key={r.inv.id} className="flex items-center gap-2 rounded-xl bg-surface-2 px-2.5 py-2 text-xs">
                  <Wallet size={13} className="shrink-0 text-warn-600" />
                  <span className="min-w-0 flex-1 truncate font-semibold text-ink">
                    {(r.inv.customer_name ?? "").trim() || t("rpt.walkIn", "عميل نقدي")}
                    <span className="ms-1.5 font-mono text-2xs text-ink-subtle">{invoiceNo(r.inv.id)}</span>
                  </span>
                  {r.full && <span className="chip bg-danger-50 text-[10px] font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("ret.fullChip", "كاملة")}</span>}
                  <span className="font-extrabold tabular-nums text-warn-700 dark:text-warn-300">− {money(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-ink-muted">{label}</span>
      <span className="font-extrabold tabular-nums text-ink">{value}</span>
    </div>
  );
}
