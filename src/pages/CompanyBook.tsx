import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { ArrowRight, BookOpen, Building2, HandCoins, History, Lock, Printer, Scale, Undo2 } from "lucide-react";
import type { Company, CompanyCharge, CompanyEntry, PaymentMethod, Purchase, PurchasePayment } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride } from "@/lib/managerOverride";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { PurchaseDetailModal } from "@/components/inventory/Purchases";
import { buildCompanyLedger, curOfEntry, curOfPurchase, payableOf, previewPay, type LedgerCur, type LedgerRow } from "@/lib/companyLedger";
import { purchaseFx } from "@/lib/purchaseFxApi";
import { per100Text, ratePerUsd, usdOf } from "@/lib/purchaseFxMath";
import { describeDbError, withTimeout } from "@/lib/errors";
import { cn, formatDate, formatNum, localISO, money } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";

/* ============================================================================
 * دفترُ الشركة — جدولُها الخاصّ (طلبُ المالك: «كل شركة يكون الها جدولها الخاص»).
 *
 * كلُّ حركةٍ برقمها وتاريخها وبيانها، و«علينا» و«سدّدنا» والرصيدُ بعد كلّ سطر —
 * مثل كشف حسابٍ محاسبيّ. الحسابُ كلُّه بـ`companyLedger.ts` النقيّة المفحوصة؛
 * والكتابةُ من دوالّ 0224 (التوزيعُ بالقاعدة بمعاملةٍ واحدة، والإلغاءُ ختمٌ لا محو).
 *
 * وتفشل كاملةً أو تعمل كاملة: دفترٌ ينقصه الرصيدُ السابق أو دفعاتُ الفواتير يقول
 * رصيداً كاذباً يُصدَّق — فأيُّ مصدرٍ يتعثّر يعرض «تعذّر — أعد المحاولة».
 *
 * والعملتان (0274) دفتران: مفتاحٌ يختار الدينارَ أو الدولار، وكلُّ رقمٍ بعملة دفتره — لا يُجمع دولارٌ على دينار؛ والرصيدُ الآخر
 * يُقال بجانبه. والتسديدُ يختار ما يُسلَّم (دينار أو دولار) بسعره، والرصيدُ السابق والتسويةُ بعملة الدفتر.
 * ========================================================================= */

type Tab = "moves" | "invoices";
type Data = { company: Company; purchases: Purchase[]; payments: PurchasePayment[]; entries: CompanyEntry[]; charges: CompanyCharge[] };
const METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

export function CompanyBook() {
  const { id = "" } = useParams();
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const { can, role } = usePermissions();
  const { stockLocked } = useOverride();
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [missing, setMissing] = useState(false);
  const [failed, setFailed] = useState(false);
  const [tab, setTab] = useState<Tab>("moves");
  const [modal, setModal] = useState<null | "pay" | "opening" | "adjust">(null);
  const [voiding, setVoiding] = useState<LedgerRow | null>(null);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  /* 0274: دفترُ أيّ عملة يُعرض، وهل تعرف القاعدةُ العملتين والعيادةُ مفعّلة (سعرُها اقتراحاً للتسديد). */
  const [cur, setCur] = useState<LedgerCur>("IQD");
  const [fx, setFx] = useState<{ ok: boolean; clinicRate: number | null }>({ ok: false, clinicRate: null });
  useEffect(() => {
    let alive = true;
    Promise.all([purchaseFx.ready(), import("@/lib/usdApi").then((m) => m.usdApi.state())])
      .then(([ready, st]) => { if (alive) setFx({ ok: ready && st.enabled, clinicRate: st.rate ? Number(st.rate.rate) : null }); })
      .catch(() => { if (alive) setFx({ ok: false, clinicRate: null }); }); /* swallow-ok: فحصُ قدرةٍ — فشلُه يُبقي الدفترَ بالدينار كما كان */
    return () => { alive = false; };
  }, []);

  const load = useCallback(async () => {
    setFailed(false);
    try {
      const [companies, purchases, entries, charges] = await withTimeout(Promise.all([
        repo.listCompanies(clinicId),
        repo.listPurchases(clinicId),
        repo.listCompanyEntries(clinicId),
        repo.listCompanyCharges(clinicId),
      ]), 20000);
      const company = companies.find((c) => c.id === id);
      if (!company) { setMissing(true); return; }
      const mine = purchases.filter((p) => p.company_id === id);
      const payments = await withTimeout(repo.listPaymentsForPurchases(mine.map((p) => p.id)), 20000);
      setData({ company, purchases: mine, payments, entries: entries.filter((e) => e.company_id === id), charges: charges.filter((c) => c.company_id === id) });
    } catch (e) {
      setFailed(true);
      toast.error(t("cbook.loadFailed", "تعذّر تحميل دفتر الشركة — أعد المحاولة."), e instanceof Error ? e.message : undefined);
    }
  }, [clinicId, id, t, toast]);
  useEffect(() => { void load(); }, [load]);

  const L = useMemo(() => (data ? buildCompanyLedger(data, cur) : null), [data, cur]);
  /** الدفترُ الآخر — رصيدُه يُقال بجانب هذا، ولا يُجمع عليه. */
  const Lother = useMemo(() => (data ? buildCompanyLedger(data, cur === "USD" ? "IQD" : "USD") : null), [data, cur]);
  const hasUsd = !!data && (data.purchases.some((p) => curOfPurchase(p) === "USD") || data.entries.some((e) => curOfEntry(e) === "USD"));
  const showCur = fx.ok || hasUsd;
  /** المبالغُ بعملة الدفتر المعروض. */
  const fm = (n: number) => (cur === "USD" ? usdOf(n) : money(n));
  const fmOther = (n: number) => (cur === "USD" ? money(n) : usdOf(n));
  const isManager = role === "manager";
  const canPay = isManager || role === "veterinarian";

  if (!can("manageInventory") || stockLocked) {
    return (
      <div className="mx-auto grid max-w-md place-items-center px-4 py-20 text-center">
        <Lock size={32} className="mb-3 text-ink-subtle" />
        <p className="text-sm text-ink-muted">{t("cbook.noAccess", "دفتر الشركات لمن عنده صلاحية إدارة المخزن. راجع مدير العيادة.")}</p>
      </div>
    );
  }

  const kindLabel = (r: LedgerRow) => ({
    opening: t("cbook.kOpening", "رصيد سابق (قبل السستم)"),
    purchase: t("cbook.kPurchase", "فاتورة شراء"),
    upfront: t("cbook.kUpfront", "دُفع وقت الشراء"),
    payment: t("cbook.kPayment", "تسديد على فاتورة"),
    accountPay: t("cbook.kAccountPay", "تسديد على الحساب"),
    adjustCredit: t("cbook.kAdjustCredit", "تسوية — مبلغ علينا"),
    adjustDebit: t("cbook.kAdjustDebit", "تسوية — خصم من الشركة"),
    charge: t("cbook.kCharge", "مطالبة بلا فاتورة"),
    chargeSettled: t("cbook.kChargeSettled", "تسوية مطالبة"),
  })[r.kind];
  const methodLabel = (m: PaymentMethod | null) => (m ? t(`pay.${m}`, m) : "");
  /** 0274: تسديدٌ سُلّم بعملةٍ غير عملة الدَّين — ما سُلّم وسعرُه. */
  const handedText = (r: LedgerRow): string => {
    const e = r.entryId ? data?.entries.find((x) => x.id === r.entryId) : undefined;
    if (!e?.pay_currency || e.handed == null || e.pay_currency === cur) return "";
    return t("cbook.handed", { v: e.pay_currency === "USD" ? usdOf(e.handed) : money(e.handed), r: e.fx_rate ? formatNum(e.fx_rate) : "—" });
  };
  const allocText = (r: LedgerRow) => [
    r.toOpening ? t("cbook.allocOpening", { v: fm(r.toOpening), defaultValue: "للرصيد السابق {{v}}" }) : "",
    ...(r.alloc ?? []).map((a) => t("cbook.allocInvoice", { ref: a.ref ? `\u2068#${a.ref}\u2069` : "", v: fm(a.amount), defaultValue: "فاتورة {{ref}}: {{v}}" })),
  ].filter(Boolean).join(" · ");

  const print = () => {
    if (!data || !L) return;
    const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const head = [t("cbook.colNo", "#"), t("cbook.colDate", "التاريخ"), t("cbook.colDesc", "البيان"), t("cbook.colRef", "المرجع"), t("cbook.colCredit", "علينا"), t("cbook.colDebit", "سدّدنا"), t("cbook.colBalance", "الرصيد")];
    const body = L.rows.map((r) => `<tr class="${r.voided ? "v" : ""}"><td>${r.no}</td><td>${esc(formatDate(r.day, lang, true))}</td><td>${esc([kindLabel(r), r.note ?? "", allocText(r), r.voided ? t("cbook.voidedShort", { reason: r.voided.reason ?? "", defaultValue: "ملغاة: {{reason}}" }) : ""].filter(Boolean).join(" — "))}</td><td>${esc(r.ref ? `#${r.ref}` : "")}</td><td>${r.credit ? esc(fm(r.credit)) : ""}</td><td>${r.debit ? esc(fm(r.debit)) : r.voided ? esc(fm(r.amount)) : ""}</td><td>${esc(fm(r.balance))}</td></tr>`).join("");
    const html = `<!doctype html><html dir="${i18n.dir()}" lang="${lang}"><head><meta charset="utf-8"><title>${esc(data.company.name)}</title>
<style>body{font-family:system-ui,sans-serif;margin:24px;color:#111}h1{font-size:20px;margin:0 0 4px}p{margin:0 0 12px;color:#555;font-size:12px}
table{width:100%;border-collapse:collapse;font-size:12px}th,td{border:1px solid #ccc;padding:5px 6px;text-align:start}th{background:#f2f4f7}
td:nth-child(n+5){font-variant-numeric:tabular-nums;white-space:nowrap}tr.v td{color:#999;text-decoration:line-through}tfoot td{font-weight:700;background:#f8f9fb}</style></head>
<body><h1>${esc(t("cbook.printTitle", { name: data.company.name, defaultValue: "كشف حساب — {{name}}" }))}</h1><p>${esc(t("cbook.printAsOf", { d: formatDate(localISO(), lang, true), defaultValue: "لغاية {{d}}" }))}</p>
<table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody>
<tfoot><tr><td colspan="4">${esc(t("cbook.total", "المجموع"))}</td><td>${esc(fm(L.totals.credit))}</td><td>${esc(fm(L.totals.debit))}</td><td>${esc(fm(L.totals.balance))}</td></tr></tfoot></table>
<script>window.onload=()=>window.print()</script></body></html>`;
    const w = window.open("", "_blank", "width=900,height=940");
    if (!w) { toast.error(t("cbook.printBlocked", "المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة.")); return; }
    w.document.open(); w.document.write(html); w.document.close();
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-6" data-company-book={id}>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link to="/inventory?view=ledger" className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted hover:text-ink" aria-label={t("cbook.back", "رجوع للديون")}>
          <ArrowRight size={18} className="ltr:rotate-180" />
        </Link>
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Building2 size={22} /></span>
        <div className="me-auto min-w-0">
          <h1 className="truncate font-display text-2xl font-extrabold text-ink">{data?.company.name ?? t("cbook.title", "دفتر الشركة")}</h1>
          <p className="text-sm text-ink-subtle">{t("cbook.sub", "دفتر الشركة — كل حركة برقمها وتاريخها والرصيد بعدها")}</p>
        </div>
        {L && <Button variant="secondary" size="sm" leftIcon={<Printer size={15} />} onClick={() => { playTap(); print(); }}>{t("cbook.print", "طباعة الكشف")}</Button>}
      </div>

      {missing ? (
        <div className="card p-10 text-center text-sm text-ink-muted">{t("cbook.missing", "هاي الشركة مو موجودة — يمكن انحذفت أو انطوت بشركة ثانية.")}</div>
      ) : failed && !data ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center" data-loadfailed>
          <BookOpen size={26} className="text-danger-500" />
          <p className="text-sm text-ink-muted">{t("cbook.loadFailedBody", "تعذّر تحميل الدفتر — ما نعرض رصيداً ناقصاً. أعد المحاولة.")}</p>
          <Button variant="secondary" onClick={() => { playTap(); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : !data || !L ? (
        <div className="space-y-3"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-72 rounded-2xl" /></div>
      ) : (
        <>
          {/* الخلاصة: رقمٌ واحد كبير، ومنه ثلاثة */}
          <div className="card mb-4 flex flex-wrap items-center gap-x-8 gap-y-3 p-4" data-book-summary>
            <div>
              <p className="text-xs font-bold text-ink-subtle">{t("cbook.balance", "الرصيد — علينا للشركة")}</p>
              <p data-book-balance className={cn("font-display text-3xl font-extrabold tabular-nums", L.totals.balance > 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400")}>{fm(L.totals.balance)}</p>
              {/* الرصيدُ بالعملة الثانية يُقال بجانبه ولا يُجمع عليه (0274). */}
              {showCur && Lother && Lother.totals.balance !== 0 && (
                <button type="button" data-book-otherbal onClick={() => { playTap(); setCur(cur === "USD" ? "IQD" : "USD"); }}
                  className="mt-0.5 text-xs font-bold text-ink-muted underline-offset-2 hover:underline">
                  {t(cur === "USD" ? "cbook.otherIqd" : "cbook.otherUsd", { v: fmOther(Lother.totals.balance) })}
                </button>
              )}
            </div>
            <dl className="flex flex-wrap gap-x-6 gap-y-1 text-sm">
              <div><dt className="text-2xs text-ink-subtle">{t("cbook.ofInvoices", "منها فواتير")}</dt><dd className="font-bold tabular-nums text-ink">{fm(L.totals.invoiceDue)}</dd></div>
              <div><dt className="text-2xs text-ink-subtle">{t("cbook.ofOpening", "رصيد سابق")}</dt><dd className="font-bold tabular-nums text-ink">{fm(L.totals.poolDue)}</dd></div>
              {L.totals.chargesDue > 0 && <div><dt className="text-2xs text-ink-subtle">{t("cbook.ofCharges", "مطالبات")}</dt><dd className="font-bold tabular-nums text-ink">{fm(L.totals.chargesDue)}</dd></div>}
            </dl>
            <div className="ms-auto flex flex-wrap gap-2">
              {canPay && payableOf(L.totals.invoiceDue, L.totals.poolDue) > 0 && (
                <Button size="sm" leftIcon={<HandCoins size={15} />} data-book-pay onClick={() => { playTap(); setModal("pay"); }}>{t("cbook.pay", "تسديد على الحساب")}</Button>
              )}
              {isManager && !L.hasOpening && (
                <Button size="sm" variant="secondary" leftIcon={<History size={15} />} data-book-opening onClick={() => { playTap(); setModal("opening"); }}>{t("cbook.addOpening", "رصيد سابق")}</Button>
              )}
              {isManager && (
                <Button size="sm" variant="secondary" leftIcon={<Scale size={15} />} data-book-adjust onClick={() => { playTap(); setModal("adjust"); }}>{t("cbook.addAdjust", "تسوية")}</Button>
              )}
            </div>
          </div>

          {showCur && (
            <div role="radiogroup" aria-label={t("cbook.curLabel")} className="mb-3 me-2 inline-flex rounded-2xl bg-surface-2 p-1" data-book-cur>
              {(["IQD", "USD"] as LedgerCur[]).map((c) => (
                <button key={c} role="radio" aria-checked={cur === c} data-book-curbtn={c} onClick={() => { if (cur === c) return; playTap(); setCur(c); }}
                  className={cn("rounded-xl px-4 py-1.5 text-sm font-bold transition", cur === c ? (c === "USD" ? "bg-success-600 text-white shadow-soft" : "bg-surface-1 text-ink shadow-soft") : "text-ink-muted hover:text-ink")}>
                  {c === "USD" ? t("cbook.curUsd") : t("cbook.curIqd")}
                </button>
              ))}
            </div>
          )}
          <div role="tablist" className="mb-3 inline-flex rounded-2xl bg-surface-2 p-1">
            {([["moves", t("cbook.tabMoves", "الحركات")], ["invoices", t("cbook.tabInvoices", "الفواتير")]] as [Tab, string][]).map(([k, label]) => (
              <button key={k} role="tab" aria-selected={tab === k} data-book-tab={k} onClick={() => { playTap(); setTab(k); }}
                className={cn("rounded-xl px-4 py-1.5 text-sm font-bold transition", tab === k ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted hover:text-ink")}>{label}</button>
            ))}
          </div>

          {tab === "moves" ? (
            L.rows.length === 0 ? (
              <div className="card p-10 text-center text-sm text-ink-muted">{t("cbook.empty", "ماكو حركات بعد. إذا عليكم دين قديم لهاي الشركة من قبل السستم، سجّله «رصيد سابق».")}</div>
            ) : (
              <>
              {/* الهاتف: كلُّ حركةٍ بطاقةٌ صغيرة والرصيدُ ظاهرٌ بجنبها — الجدولُ العريض
                  كان يخفي عمودَ الرصيد خلف التمرير، وهو أهمُّ ما بالسطر. */}
              <ul className="card divide-y divide-line sm:hidden" data-book-list>
                {L.rows.map((r) => (
                  <li key={r.key} data-book-mrow={r.kind} className={cn("flex items-start gap-3 px-3 py-2.5", r.voided && "text-ink-subtle")}>
                    <span className="mt-0.5 w-5 shrink-0 text-2xs tabular-nums text-ink-subtle">{r.no}</span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm font-bold", r.voided ? "line-through" : "text-ink")}>{kindLabel(r)}</p>
                      <p className="text-2xs text-ink-subtle">{formatDate(r.day, lang, true)}{r.ref && <> · <bdi dir="ltr">#{r.ref}</bdi></>}{r.method && <> · {methodLabel(r.method)}</>}</p>
                      {r.kind === "accountPay" && !r.voided && allocText(r) && <p className="text-2xs text-ink-muted">{allocText(r)}</p>}
                      {r.kind === "accountPay" && handedText(r) && <p className="text-2xs text-ink-muted" data-book-handed>{handedText(r)}</p>}
                      {r.voided && <p className="text-2xs font-bold text-danger-600 dark:text-danger-400">{t("cbook.voided", { reason: r.voided.reason ?? "", d: formatDate(r.voided.at, lang, true), defaultValue: "ملغاة {{d}}: {{reason}}" })}</p>}
                    </div>
                    <div className="shrink-0 text-end">
                      <p className={cn("text-sm font-bold tabular-nums", r.voided ? "line-through" : r.credit ? "text-danger-700 dark:text-danger-300" : "text-success-700 dark:text-success-300")}>
                        {r.credit ? "+" : "−"}{fm(r.credit || r.debit || r.amount)}
                      </p>
                      <p className="text-2xs tabular-nums text-ink-muted">{t("cbook.balanceShort", { v: fm(r.balance), defaultValue: "الرصيد {{v}}" })}</p>
                    </div>
                    {isManager && r.entryId && !r.voided && (
                      <button type="button" onClick={() => { playTap(); setVoiding(r); }}
                        className="grid h-7 w-7 shrink-0 place-items-center rounded-lg text-ink-subtle hover:text-danger-600" aria-label={t("cbook.void", "إلغاء الحركة")}>
                        <Undo2 size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              <div className="card hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[760px] text-sm" data-book-table>
                  <thead className="bg-surface-2 text-2xs font-bold uppercase tracking-wide text-ink-subtle">
                    <tr>
                      <th className="px-3 py-2 text-start">{t("cbook.colNo", "#")}</th>
                      <th className="px-3 py-2 text-start">{t("cbook.colDate", "التاريخ")}</th>
                      <th className="px-3 py-2 text-start">{t("cbook.colDesc", "البيان")}</th>
                      <th className="px-3 py-2 text-start">{t("cbook.colRef", "المرجع")}</th>
                      <th className="px-3 py-2 text-end">{t("cbook.colCredit", "علينا")}</th>
                      <th className="px-3 py-2 text-end">{t("cbook.colDebit", "سدّدنا")}</th>
                      <th className="px-3 py-2 text-end">{t("cbook.colBalance", "الرصيد")}</th>
                      <th className="px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {L.rows.map((r) => {
                      const inv = r.purchaseId ? data.purchases.find((p) => p.id === r.purchaseId) : null;
                      return (
                        <tr key={r.key} data-book-row={r.kind} data-voided={r.voided ? "1" : undefined}
                          className={cn("align-top", r.voided && "text-ink-subtle", inv && r.kind === "purchase" && "cursor-pointer hover:bg-surface-2/60")}
                          onClick={inv && r.kind === "purchase" ? () => { playTap(); setViewing(inv); } : undefined}>
                          <td className="px-3 py-2 tabular-nums text-ink-subtle">{r.no}</td>
                          <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(r.day, lang, true)}</td>
                          <td className="px-3 py-2">
                            <p className={cn("font-bold", r.voided ? "line-through" : "text-ink")}>
                              {kindLabel(r)}{r.method && <span className="ms-1.5 text-2xs font-semibold text-ink-subtle">· {methodLabel(r.method)}</span>}
                            </p>
                            {r.note && <p className="text-2xs text-ink-muted">{r.note}</p>}
                            {r.kind === "accountPay" && !r.voided && allocText(r) && <p className="text-2xs text-ink-muted" data-book-alloc>{allocText(r)}</p>}
                            {r.kind === "accountPay" && handedText(r) && <p className="text-2xs text-ink-muted" data-book-handed>{handedText(r)}</p>}
                            {r.voided && <p className="text-2xs font-bold text-danger-600 dark:text-danger-400">{t("cbook.voided", { reason: r.voided.reason ?? "", d: formatDate(r.voided.at, lang, true), defaultValue: "ملغاة {{d}}: {{reason}}" })}</p>}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2 font-mono text-2xs text-ink-muted">{r.ref && <bdi dir="ltr">#{r.ref}</bdi>}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums text-danger-700 dark:text-danger-300">{r.credit ? fm(r.credit) : r.voided && r.amount && r.kind !== "accountPay" && r.kind !== "adjustDebit" ? <s>{fm(r.amount)}</s> : ""}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-end tabular-nums text-success-700 dark:text-success-300">{r.debit ? fm(r.debit) : r.voided && (r.kind === "accountPay" || r.kind === "adjustDebit") ? <s>{fm(r.amount)}</s> : ""}</td>
                          <td className="whitespace-nowrap px-3 py-2 text-end font-bold tabular-nums text-ink">{fm(r.balance)}</td>
                          <td className="px-2 py-2 text-end">
                            {isManager && r.entryId && !r.voided && (
                              <button type="button" data-book-void={r.entryId} onClick={(e) => { e.stopPropagation(); playTap(); setVoiding(r); }}
                                className="grid h-7 w-7 place-items-center rounded-lg text-ink-subtle hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/10" aria-label={t("cbook.void", "إلغاء الحركة")}>
                                <Undo2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-surface-2 font-bold">
                    <tr>
                      <td className="px-3 py-2" colSpan={4}>{t("cbook.total", "المجموع")}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{fm(L.totals.credit)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{fm(L.totals.debit)}</td>
                      <td className="px-3 py-2 text-end tabular-nums">{fm(L.totals.balance)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
              </>
            )
          ) : (
            <div className="card overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm" data-book-invoices>
                <thead className="bg-surface-2 text-2xs font-bold uppercase tracking-wide text-ink-subtle">
                  <tr>
                    <th className="px-3 py-2 text-start">{t("cbook.colDate", "التاريخ")}</th>
                    <th className="px-3 py-2 text-start">{t("cbook.colRef", "المرجع")}</th>
                    <th className="px-3 py-2 text-end">{t("cbook.colTotal", "الإجمالي")}</th>
                    <th className="px-3 py-2 text-end">{t("cbook.colPaid", "المدفوع")}</th>
                    <th className="px-3 py-2 text-end">{t("cbook.colDue", "الباقي")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {data.purchases.filter((p) => curOfPurchase(p) === cur).length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-8 text-center text-ink-muted">{t("cbook.noInvoices", "ماكو فواتير شراء لهاي الشركة.")}</td></tr>
                  )}
                  {data.purchases.filter((p) => curOfPurchase(p) === cur).sort((a, b) => b.purchased_at.localeCompare(a.purchased_at)).map((p) => {
                    const due = L.dueByPurchase.get(p.id) ?? 0;
                    return (
                      <tr key={p.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => { playTap(); setViewing(p); }}>
                        <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(p.purchased_at, lang, true)}</td>
                        <td className="px-3 py-2 font-mono text-2xs text-ink-muted">{p.reference ? <bdi dir="ltr">#{p.reference}</bdi> : "—"}</td>
                        <td className="px-3 py-2 text-end tabular-nums">{fm(cur === "USD" ? Number(p.total_usd ?? 0) : p.total)}</td>
                        <td className="px-3 py-2 text-end tabular-nums">{fm(cur === "USD" ? Number(p.paid_usd ?? 0) : (p.amount_paid ?? p.total))}</td>
                        <td className={cn("px-3 py-2 text-end font-bold tabular-nums", due > 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400")}>{due > 0 ? fm(due) : "✓"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          <PayModal open={modal === "pay"} onClose={() => setModal(null)} data={data} poolDue={L.totals.poolDue} invoiceDue={L.totals.invoiceDue}
            cur={cur} fx={fx} onDone={() => { setModal(null); void load(); }} />
          <OpeningModal open={modal === "opening"} onClose={() => setModal(null)} companyId={id} cur={cur} viaFx={fx.ok || cur === "USD"} onDone={() => { setModal(null); void load(); }} />
          <AdjustModal open={modal === "adjust"} onClose={() => setModal(null)} companyId={id} cur={cur} viaFx={fx.ok || cur === "USD"} onDone={() => { setModal(null); void load(); }} />
          <VoidModal row={voiding} label={voiding ? kindLabel(voiding) : ""} fm={fm} onClose={() => setVoiding(null)} onDone={() => { setVoiding(null); void load(); }} />
          <PurchaseDetailModal purchase={viewing} onClose={() => setViewing(null)} onChanged={() => void load()} />
        </>
      )}
    </div>
  );
}

/* ── النوافذ ─────────────────────────────────────────────────────────────── */

function DateField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="label">{t("cbook.date", "التاريخ")}</label>
      <input type="date" className="input" dir="ltr" value={value} max={localISO()} min="2000-01-01" onChange={(e) => onChange(e.target.value)} data-book-date />
    </div>
  );
}

function AmountField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <label className="label">{t("cbook.amount", "المبلغ")}</label>
      <input type="number" inputMode="decimal" min="0" step="any" className="input text-lg font-bold tabular-nums" dir="ltr" value={value} onChange={(e) => onChange(e.target.value)} autoFocus data-book-amount />
    </div>
  );
}

/** تسديدٌ على الحساب: يقول التوزيعَ قبل الحفظ، والقاعدةُ توزّع بمعاملةٍ واحدة. */
function PayModal({ open, onClose, data, poolDue, invoiceDue, cur, fx, onDone }: {
  open: boolean; onClose: () => void; data: Data; poolDue: number; invoiceDue: number;
  /** عملةُ الدَّين (الدفترُ المعروض)، وهل تعرف القاعدةُ العملتين (0274) وسعرُ العيادة اقتراحاً. */
  cur: LedgerCur; fx: { ok: boolean; clinicRate: number | null }; onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const max = payableOf(invoiceDue, poolDue);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localISO());
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  /* 0274: ما يُسلَّم بعملته — الدَّينُ بعملته ينقص بالسعر. */
  const viaFx = fx.ok || cur === "USD";
  const [payCur, setPayCur] = useState<LedgerCur>(cur);
  const [per100, setPer100] = useState("");
  useEffect(() => {
    if (open) { setAmount(String(max)); setDate(localISO()); setMethod("cash"); setNote(""); setPayCur(cur); setPer100(per100Text(fx.clinicRate)); }
  }, [open, max, cur, fx.clinicRate]);
  const fmD = (n: number) => (cur === "USD" ? usdOf(n) : money(n));
  const fmP = (n: number) => (payCur === "USD" ? usdOf(n) : money(n));
  const handed = Number(amount) || 0;
  const rate = payCur !== cur ? ratePerUsd(per100) : null;
  /** ما ينقص من الدَّين بعملته — كما يحسبه company_pay_fx. */
  const amt = payCur === cur ? handed : rate == null ? 0 : cur === "USD" ? Math.round((handed / rate) * 100) / 100 : Math.round(handed * rate);
  const pv = previewPay(amt, poolDue, data.purchases.filter((p) => curOfPurchase(p) === cur));
  const tol = cur === "USD" ? 0.01 : payCur !== cur && rate != null ? Math.ceil(rate * 0.01) : 0.005;
  const over = amt > max + tol;

  const save = async () => {
    if (busy) return;
    if (payCur !== cur && rate == null) { toast.error(t("cbook.rateBad")); return; }
    if (!(amt > 0)) { toast.error(t("cbook.amountRequired", "اكتب مبلغاً أكبر من صفر.")); return; }
    if (over) { toast.error(t("cbook.overPay", { v: fmD(max), defaultValue: "المبلغ أكبر من دين الشركة ({{v}})." })); return; }
    setBusy(true);
    try {
      const r = viaFx
        ? await purchaseFx.companyPay(data.company.id, cur, handed, payCur, rate, method, date, note.trim() || null)
        : await repo.companyPay(data.company.id, amt, method, date, note.trim() || null);
      playSuccess();
      toast.success(r.to_opening > 0 && r.invoices > 0
        ? t("cbook.paid", { v: fmD(amt), n: r.invoices, defaultValue: "انسدّ {{v}} — على {{n}} فاتورة والباقي للرصيد السابق" })
        : r.to_opening > 0
          ? t("cbook.paidOpening", { v: fmD(amt), defaultValue: "انسدّ {{v}} من الرصيد السابق" })
          : t("cbook.paidInvoices", { v: fmD(amt), n: r.invoices, defaultValue: "انسدّ {{v}} على {{n}} فاتورة" }));
      onDone();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t("cbook.payTitle", { name: data.company.name, defaultValue: "تسديد على الحساب — {{name}}" })}>
      <div className="space-y-4" data-book-paymodal>
        {viaFx && (
          <div className="flex flex-wrap items-center gap-2" data-book-paycur>
            <span className="text-xs font-bold text-ink-muted">{t("cbook.payIn")}</span>
            <div className="flex rounded-xl bg-surface-2 p-0.5" role="radiogroup" aria-label={t("cbook.payIn")}>
              {(["IQD", "USD"] as LedgerCur[]).map((c) => (
                <button key={c} type="button" role="radio" aria-checked={payCur === c} data-book-paycurbtn={c}
                  onClick={() => { if (payCur === c) return; playTap(); setPayCur(c); setAmount(""); }}
                  className={cn("rounded-lg px-3 py-1.5 text-xs font-bold transition", payCur === c ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
                  {c === "USD" ? t("cbook.curUsd") : t("cbook.curIqd")}
                </button>
              ))}
            </div>
            {payCur !== cur && (
              <label className="flex items-center gap-1.5 text-xs font-bold text-ink-muted">
                {t("cbook.per100")}
                <input dir="ltr" inputMode="decimal" className="input h-9 w-32 font-mono" value={per100} onChange={(e) => setPer100(e.target.value)} data-book-payrate />
              </label>
            )}
          </div>
        )}
        <AmountField value={amount} onChange={setAmount} />
        {payCur !== cur && (
          rate == null
            ? <p role="alert" className="text-xs font-bold text-danger-600 dark:text-danger-300">{t("cbook.rateBad")}</p>
            : handed > 0 && <p className="text-xs font-bold text-ink tabular-nums" data-book-reduces>{t("cbook.reduces", { h: fmP(handed), v: fmD(amt) })}</p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <DateField value={date} onChange={setDate} />
          <div>
            <label className="label">{t("cbook.method", "طريقة الدفع")}</label>
            <div className="flex gap-1.5">
              {METHODS.map((m) => (
                <button key={m} type="button" onClick={() => { playTap(); setMethod(m); }}
                  className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold transition", method === m ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>{t(`pay.${m}`, m)}</button>
              ))}
            </div>
          </div>
        </div>
        <div>
          <label className="label">{t("cbook.note", "ملاحظة")}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("cbook.payNotePh", "مثلاً: سلّمناها للمندوب")} />
        </div>
        <div className="rounded-2xl bg-surface-2 p-3 text-sm" data-book-preview>
          <p className="mb-1.5 text-xs font-bold text-ink-muted">{t("cbook.previewTitle", "راح تتوزّع هيچ (الأقدم أولاً):")}</p>
          {over ? (
            <p className="font-bold text-danger-600 dark:text-danger-400">{t("cbook.overPay", { v: fmD(max), defaultValue: "المبلغ أكبر من دين الشركة ({{v}})." })}</p>
          ) : (
            <ul className="space-y-0.5 tabular-nums">
              {pv.toOpening > 0 && <li>{t("cbook.allocOpening", { v: fmD(pv.toOpening), defaultValue: "للرصيد السابق {{v}}" })}</li>}
              {pv.alloc.map((a) => <li key={a.purchaseId}>{t("cbook.allocInvoice", { ref: a.ref ? `\u2068#${a.ref}\u2069` : "", v: fmD(a.amount), defaultValue: "فاتورة {{ref}}: {{v}}" })}</li>)}
            </ul>
          )}
        </div>
        <Button className="w-full" size="lg" loading={busy} disabled={over} leftIcon={<HandCoins size={17} />} onClick={() => void save()} data-book-paysave>
          {t("cbook.payDo", { v: fmP(handed), defaultValue: "سدّد {{v}}" })}
        </Button>
      </div>
    </Modal>
  );
}

function OpeningModal({ open, onClose, companyId, cur, viaFx, onDone }: {
  open: boolean; onClose: () => void; companyId: string;
  /** عملةُ الدفتر المعروض (0274) — والرصيدُ السابق واحدٌ لكلّ عملة؛ وبالعملتين يمرّ من بابهما (القديمُ يرى أيَّ سابقٍ «موجود»). */
  cur: LedgerCur; viaFx: boolean; onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setAmount(""); setDate(localISO()); setNote(""); } }, [open]);
  const save = async () => {
    if (busy) return;
    const amt = Number(amount) || 0;
    if (!(amt > 0)) { toast.error(t("cbook.amountRequired", "اكتب مبلغاً أكبر من صفر.")); return; }
    setBusy(true);
    try {
      if (viaFx) await purchaseFx.opening(companyId, cur, amt, date, note.trim() || null);
      else await repo.addCompanyOpening(companyId, amt, date, note.trim() || null);
      playSuccess();
      toast.success(t("cbook.openingSaved", { v: cur === "USD" ? usdOf(amt) : money(amt), defaultValue: "انسجّل الرصيد السابق {{v}}" }));
      onDone();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`${t("cbook.openingTitle", "رصيد سابق — دين من قبل السستم")}${cur === "USD" ? " · $" : ""}`}>
      <div className="space-y-4" data-book-openingmodal>
        <p className="text-sm text-ink-muted">{t("cbook.openingHelp", "الدين الي جان عليكم لهاي الشركة قبل ما تبدون بالسستم، بتاريخه. يتسجّل مرة وحدة، وأول تسديد على الحساب يروح له قبل الفواتير.")}</p>
        <AmountField value={amount} onChange={setAmount} />
        <DateField value={date} onChange={setDate} />
        <div>
          <label className="label">{t("cbook.note", "ملاحظة")}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("cbook.openingNotePh", "مثلاً: من الدفتر الورقي")} />
        </div>
        <Button className="w-full" size="lg" loading={busy} leftIcon={<History size={17} />} onClick={() => void save()} data-book-openingsave>{t("cbook.save", "حفظ")}</Button>
      </div>
    </Modal>
  );
}

function AdjustModal({ open, onClose, companyId, cur, viaFx, onDone }: {
  open: boolean; onClose: () => void; companyId: string; cur: LedgerCur; viaFx: boolean; onDone: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [dir, setDir] = useState<"debit" | "credit">("debit");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(localISO());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setDir("debit"); setAmount(""); setDate(localISO()); setNote(""); } }, [open]);
  const save = async () => {
    if (busy) return;
    const amt = Number(amount) || 0;
    if (!(amt > 0)) { toast.error(t("cbook.amountRequired", "اكتب مبلغاً أكبر من صفر.")); return; }
    if (!note.trim()) { toast.error(t("cbook.reasonRequired", "اكتب السبب.")); return; }
    setBusy(true);
    try {
      if (viaFx) await purchaseFx.adjust(companyId, cur, dir, amt, date, note.trim());
      else await repo.addCompanyAdjust(companyId, dir, amt, date, note.trim());
      playSuccess();
      toast.success(t("cbook.adjustSaved", "انسجّلت التسوية"));
      onDone();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title={`${t("cbook.adjustTitle", "تسوية")}${cur === "USD" ? " · $" : ""}`}>
      <div className="space-y-4" data-book-adjustmodal>
        <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-surface-2 p-1">
          {([["debit", t("cbook.adjDebit", "خصم من الشركة (ينقص الدين)")], ["credit", t("cbook.adjCredit", "مبلغ علينا (يزيد الدين)")]] as ["debit" | "credit", string][]).map(([k, label]) => (
            <button key={k} type="button" aria-pressed={dir === k} onClick={() => { playTap(); setDir(k); }}
              className={cn("rounded-xl px-2 py-2 text-xs font-bold transition", dir === k ? "bg-surface-1 text-ink shadow-soft" : "text-ink-muted hover:text-ink")}>{label}</button>
          ))}
        </div>
        <AmountField value={amount} onChange={setAmount} />
        <DateField value={date} onChange={setDate} />
        <div>
          <label className="label">{t("cbook.reason", "السبب")}</label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("cbook.adjustNotePh", "مثلاً: خصم كمية، فرق سعر، أجرة نقل")} />
        </div>
        <Button className="w-full" size="lg" loading={busy} leftIcon={<Scale size={17} />} onClick={() => void save()}>{t("cbook.save", "حفظ")}</Button>
      </div>
    </Modal>
  );
}

/** الإلغاءُ يقول ماذا يفعل قبل أن يفعله — لا `window.confirm` يُقبل بلا قراءة. */
function VoidModal({ row, label, fm, onClose, onDone }: { row: LedgerRow | null; label: string; fm: (n: number) => string; onClose: () => void; onDone: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (row) setReason(""); }, [row]);
  if (!row) return null;
  const save = async () => {
    if (busy || !row.entryId) return;
    if (!reason.trim()) { toast.error(t("cbook.reasonRequired", "اكتب السبب.")); return; }
    setBusy(true);
    try {
      await repo.voidCompanyEntry(row.entryId, reason.trim());
      playSuccess();
      toast.success(t("cbook.voidDone", "انلغت الحركة — باقية بالدفتر مشطوبة"));
      onDone();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={t("cbook.voidTitle", "إلغاء حركة")}>
      <div className="space-y-4" data-book-voidmodal>
        <div className="rounded-2xl bg-danger-50 p-3 text-sm dark:bg-danger-500/10">
          <p className="font-bold text-ink">{label} — {fm(row.amount)} · {formatDate(row.day, i18n.language, true)}</p>
          <p className="mt-1 text-ink-muted">
            {row.kind === "accountPay"
              ? t("cbook.voidPayHelp", "المبلغ يرجع دين على الفواتير الي انسدّت منه وعلى الرصيد السابق. الحركة تبقى بالدفتر مشطوبة بسببها.")
              : t("cbook.voidHelp", "الحركة تبقى بالدفتر مشطوبة بسببها، وما تحسب بالرصيد.")}
          </p>
        </div>
        <div>
          <label className="label">{t("cbook.reason", "السبب")}</label>
          <input className="input" value={reason} onChange={(e) => setReason(e.target.value)} autoFocus placeholder={t("cbook.voidReasonPh", "مثلاً: انكتبت مرتين")} data-book-voidreason />
        </div>
        <Button className="w-full" size="lg" variant="danger" loading={busy} leftIcon={<Undo2 size={17} />} onClick={() => void save()} data-book-voidsave>{t("cbook.voidDo", "ألغِ الحركة")}</Button>
      </div>
    </Modal>
  );
}

