import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Building2, CalendarDays, ChevronDown, HandCoins, Loader2, PackageCheck,
  ShoppingBag, UserRound, UnfoldVertical, Barcode as BarcodeIcon, RotateCw, ClipboardList,
} from "lucide-react";
import type { Purchase, PurchaseItem } from "@/types";
import { repo } from "@/lib/repo";
import { Badge } from "@/components/ui";
import { money, formatNum, formatTime, localISO, cn } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { PurchaseReceipt } from "@/components/inventory/PurchaseReceipt";

/**
 * سجل حركات فواتير الشراء — الجواب الحرفي على «شنو اشتريت بهاليوم؟».
 *
 * الفواتير مجمّعة بأيامها: رأس اليوم يقول چم فاتورة وشگد صرف وشگد باقي دين،
 * وكل فاتورة تنفتح على بضاعتها بالضبط: الصنف، الكمية، سعر الشراء، والإجمالي.
 * العناصر تتحمّل عند أول فتح وتنخزن — و«توسيع الكل» يفتح اليوم كاملاً.
 *
 * نفس المكوّن يخدم مكانين: تبويب «المشتريات» بالمخزون، وتبويب «فواتير
 * الشراء» بالتقارير (حيث تحدد الفترة أيام الشراء بالضبط).
 */
export function PurchaseLog({ purchases }: { purchases: Purchase[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  /* `error` حالةٌ باسمها: كان الفشلُ يشيل المفتاحَ فيرجع لشرط «loading || !its» نفسِه —
   * دوّارةٌ تدور للأبد بلا كلمةٍ ولا زرّ إعادة. */
  const [items, setItems] = useState<Record<string, PurchaseItem[] | "loading" | "error">>({});
  const [open, setOpen] = useState<Set<string>>(new Set());
  /** الفواتيرُ المفتوحُ كشفُها — «شنو صار بالمخزن» يُقرأ بعد أسبوع (0211). */
  const [fx, setFx] = useState<Set<string>>(new Set());

  const loadItems = async (purchaseId: string, force = false) => {
    const cur = items[purchaseId];
    if (cur && !(force && cur === "error")) return;
    setItems((m) => ({ ...m, [purchaseId]: "loading" }));
    try {
      const rows = await repo.listPurchaseItems(purchaseId);
      setItems((m) => ({ ...m, [purchaseId]: rows }));
    } catch {
      setItems((m) => ({ ...m, [purchaseId]: "error" }));
    }
  };
  const toggleFx = (id: string) => {
    playTap();
    setFx((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const toggle = (id: string) => {
    playTap();
    setOpen((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else { n.add(id); void loadItems(id); }
      return n;
    });
  };

  /** فتح/طي كل فواتير يوم واحد دفعة وحدة. */
  const toggleDay = (ids: string[]) => {
    playTap();
    setOpen((s) => {
      const n = new Set(s);
      const allOpen = ids.every((id) => n.has(id));
      for (const id of ids) {
        if (allOpen) n.delete(id);
        else { n.add(id); void loadItems(id); }
      }
      return n;
    });
  };

  // تجميع بالأيام — الأحدث أولاً، وكل يوم بمجاميعه المالية.
  const days = useMemo(() => {
    const byDay = new Map<string, Purchase[]>();
    for (const p of purchases) {
      const day = (p.purchased_at || p.created_at || "").slice(0, 10);
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day)!.push(p);
    }
    return [...byDay.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .map(([day, rows]) => ({
        day,
        rows: rows.sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || "")),
        total: rows.reduce((s, p) => s + (p.total || 0), 0),
        paid: rows.reduce((s, p) => s + (p.amount_paid ?? p.total ?? 0), 0),
        units: rows.reduce((s, p) => s + (p.item_count || 0), 0),
      }));
  }, [purchases]);

  const todayISO = localISO();
  const dayLabel = (day: string) => {
    if (day === todayISO) return t("purchase.log.today", "اليوم");
    const d = new Date(`${day}T00:00:00`);
    const yest = new Date(); yest.setDate(yest.getDate() - 1);
    if (day === localISO(yest)) return t("purchase.log.yesterday", "أمس");
    return d.toLocaleDateString(lang === "ar" ? "ar-EG-u-nu-latn" : "en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  };

  if (purchases.length === 0) {
    return (
      <div className="card flex flex-col items-center gap-3 p-10 text-center">
        <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><ShoppingBag size={26} /></span>
        <p className="text-ink-subtle">{t("purchase.log.empty", "ماكو فواتير شراء بهاي الفترة.")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {days.map(({ day, rows, total, paid, units }) => {
        const due = Math.max(0, total - paid);
        const ids = rows.map((r) => r.id);
        const allOpen = ids.every((id) => open.has(id));
        return (
          <section key={day} className="overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-card">
            {/* رأس اليوم — متى اشتريت وشگد، بنظرة */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-line bg-gradient-to-l from-brand-50/70 to-transparent px-3.5 py-2.5 dark:from-brand-500/10">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-100 text-brand-600 dark:bg-brand-500/20 dark:text-brand-300"><CalendarDays size={17} /></span>
              <div className="min-w-0">
                <h3 className="text-sm font-extrabold text-ink">{dayLabel(day)}</h3>
                <p className="text-2xs text-ink-subtle">
                  {t("purchase.log.dayCounts", { n: formatNum(rows.length), u: formatNum(units), defaultValue: "{{n}} فاتورة · {{u}} قطعة · صرفت" })} <span className="font-bold tabular-nums text-ink-muted">{money(total)}</span>
                  {due > 0 && <span className="font-bold text-danger-600 dark:text-danger-300"> · {t("purchase.log.debt", { v: money(due), defaultValue: "دين {{v}}" })}</span>}
                </p>
              </div>
              <button type="button" onClick={() => toggleDay(ids)}
                className="ms-auto inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 px-2.5 py-1 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink">
                <UnfoldVertical size={12} /> {allOpen ? t("purchase.log.collapseAll", "طي الكل") : t("purchase.log.expandAll", "توسيع الكل")}
              </button>
            </div>

            <div className="divide-y divide-line/60">
              {rows.map((p) => {
                const isOpen = open.has(p.id);
                const its = items[p.id];
                const pPaid = p.amount_paid ?? p.total ?? 0;
                const pDue = Math.max(0, (p.total || 0) - pPaid);
                return (
                  <div key={p.id}>
                    {/* سطر الفاتورة */}
                    <button type="button" onClick={() => toggle(p.id)}
                      className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3.5 py-2.5 text-start transition hover:bg-surface-2/50">
                      <ChevronDown size={15} className={cn("shrink-0 text-ink-subtle transition-transform", isOpen && "rotate-180")} />
                      <span className="w-14 shrink-0 text-2xs font-bold tabular-nums text-ink-subtle">{p.purchased_at ? formatTime(p.purchased_at, lang) : "—"}</span>
                      <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
                        <span className="flex items-center gap-1 text-sm font-bold text-ink"><Building2 size={13} className="text-ink-subtle" /> {p.company_name || t("purchase.noCompany", "بدون شركة")}</span>
                        {p.supplier_name && <span className="flex items-center gap-1 text-2xs text-ink-subtle"><UserRound size={11} /> {p.supplier_name}</span>}
                        {p.reference && <span className="chip bg-surface-2 font-mono text-2xs text-ink-muted">#{p.reference}</span>}
                      </span>
                      <span className="flex items-center gap-1 text-2xs text-ink-subtle"><PackageCheck size={11} /> {t("purchase.log.pieces", { n: formatNum(p.item_count || 0), defaultValue: "{{n}} قطعة" })}</span>
                      <span className="text-sm font-black tabular-nums text-ink">{money(p.total || 0)}</span>
                      <Badge tone={p.status === "paid" ? "success" : p.status === "partial" ? "warn" : "danger"}>
                        {p.status === "paid" ? t("purchase.log.paid", "مدفوعة") : p.status === "partial" ? t("purchase.log.remaining", { v: money(pDue), defaultValue: "باقي {{v}}" }) : t("purchase.log.fullDebt", "آجلة بالكامل")}
                      </Badge>
                    </button>

                    {/* بضاعة الفاتورة بالضبط */}
                    {isOpen && (
                      <div className="bg-surface-2/40 px-3.5 pb-3 ps-12">
                        {its === "error" ? (
                          <p className="flex flex-wrap items-center gap-2 py-2 text-xs text-ink-muted">
                            {t("purchase.log.loadFailed", "ما وصلنا للخادم —")}
                            <button type="button" onClick={() => { playTap(); void loadItems(p.id, true); }}
                              className="inline-flex items-center gap-1 font-bold text-brand-700 hover:underline dark:text-brand-300">
                              <RotateCw size={12} /> {t("purchase.receipt.retry", "جرّب مرّة ثانية")}
                            </button>
                          </p>
                        ) : its === "loading" || !its ? (
                          <div className="py-3 text-center"><Loader2 size={15} className="mx-auto animate-spin text-ink-subtle" /></div>
                        ) : its.length === 0 ? (
                          <p className="py-2 text-2xs text-ink-subtle">{t("purchase.log.noItems", "ماكو أصناف مسجلة على هاي الفاتورة.")}</p>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full min-w-[520px] text-xs">
                              <thead>
                                <tr className="text-start text-2xs text-ink-subtle">
                                  <th className="py-1.5 pe-2 text-start font-bold">{t("purchase.log.colItem", "الصنف")}</th>
                                  <th className="py-1.5 pe-2 text-start font-bold">{t("purchase.log.colBarcode", "الباركود")}</th>
                                  <th className="py-1.5 pe-2 text-center font-bold">{t("purchase.log.colQty", "الكمية")}</th>
                                  <th className="py-1.5 pe-2 text-center font-bold">{t("purchase.log.colCost", "سعر الشراء")}</th>
                                  <th className="py-1.5 pe-2 text-center font-bold">{t("purchase.log.colSell", "سعر البيع المكتوب")}</th>
                                  <th className="py-1.5 text-end font-bold">{t("purchase.log.colTotal", "الإجمالي")}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {its.map((it) => (
                                  <tr key={it.id} className="border-t border-line/50">
                                    <td className="py-1.5 pe-2 font-bold text-ink">{it.name}</td>
                                    <td className="py-1.5 pe-2 font-mono text-2xs text-ink-subtle" dir="ltr">{it.barcode ? <span className="inline-flex items-center gap-1"><BarcodeIcon size={10} /> {it.barcode}</span> : "—"}</td>
                                    <td className="py-1.5 pe-2 text-center font-bold tabular-nums">{formatNum(it.qty)}</td>
                                    <td className="py-1.5 pe-2 text-center tabular-nums text-ink-muted">{money(it.purchase_price || 0)}</td>
                                    {/* صفرٌ = «ما كُتب» (الخادمُ لا يلمس سعرَ الرفّ به) — شرطةٌ لا «٠ د.ع». */}
                                    <td className="py-1.5 pe-2 text-center tabular-nums text-ink-muted">{(it.sell_price || 0) > 0 ? money(it.sell_price) : "—"}</td>
                                    <td className="py-1.5 text-end font-extrabold tabular-nums text-ink">{money((it.qty || 0) * (it.purchase_price || 0))}</td>
                                  </tr>
                                ))}
                                <tr className="border-t border-line">
                                  <td colSpan={5} className="py-1.5 pe-2 text-2xs font-bold text-ink-subtle">{t("purchase.log.invoiceTotal", "إجمالي الفاتورة")}{pPaid < (p.total || 0) ? ` — ${t("purchase.log.paidPart", { v: money(pPaid), defaultValue: "المدفوع {{v}}" })}` : ""}</td>
                                  <td className="py-1.5 text-end font-black tabular-nums text-ink">{money(p.total || 0)}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        {p.notes && <p className="mt-1.5 flex items-center gap-1 text-2xs text-ink-subtle"><HandCoins size={11} /> {p.notes}</p>}
                        <button type="button" onClick={() => toggleFx(p.id)} aria-expanded={fx.has(p.id)}
                          className="mt-2 inline-flex items-center gap-1 text-2xs font-bold text-brand-700 hover:underline dark:text-brand-300">
                          <ClipboardList size={12} /> {t("purchase.log.effects", "شنو صار بالمخزن من هاي الفاتورة")}
                          <ChevronDown size={12} className={cn("transition-transform", fx.has(p.id) ? "rotate-180" : "rtl:rotate-90 ltr:-rotate-90")} />
                        </button>
                        {fx.has(p.id) && (
                          <div className="mt-2 rounded-2xl border border-line bg-surface-1 p-3">
                            <PurchaseReceipt purchaseId={p.id} companyId={p.company_id ?? null} companyName={p.company_name} mode="view" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
