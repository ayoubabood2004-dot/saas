import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer, ShoppingBag, PackageCheck, Wallet, HandCoins, Building2 } from "lucide-react";
import type { Purchase, PurchaseItem } from "@/types";
import { repo } from "@/lib/repo";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { cn, money, formatDate } from "@/lib/utils";
import { playTap } from "@/lib/sounds";
import { openCompanyStatementPrint } from "@/lib/purchasePrint";
import { getClinicLogo, getClinicName, getClinicSocials } from "@/lib/settings";

/* ============================================================================
 * كشف الشركة — كل ما اشترته العيادة من مورّد واحد بشاشة واحدة:
 * أرقام الخلاصة، ثم «البضاعة المشتراة» مجمَّعة (نفس الصنف عبر كل الفواتير
 * صف واحد بكميته الكلية وآخر كلفة وإجماليه)، ثم الفواتير نفسها، مع طباعة
 * كشف A4 كامل بنفس هوية أوراق العيادة.
 * ==========================================================================*/

export interface StatementGroup {
  name: string;
  note?: string | null;
  supplier?: string | null;
  supplierPhone?: string | null;
  invoices: Purchase[];
  total: number;
  paid: number;
  due: number;
}

type Agg = { key: string; name: string; barcode: string | null; qty: number; amount: number; lastCost: number; lastAt: string; invs: Set<string> };

export function CompanyStatementModal({ group, onClose, onOpenInvoice }: {
  group: StatementGroup | null;
  onClose: () => void;
  onOpenInvoice: (p: Purchase) => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [items, setItems] = useState<Map<string, PurchaseItem[]> | null>(null);

  useEffect(() => {
    if (!group) { setItems(null); return; }
    let alive = true;
    (async () => {
      const m = new Map<string, PurchaseItem[]>();
      // جلب سطور الفواتير على دفعات صغيرة — عشرات الفواتير تبقى سلسة
      const ids = group.invoices.map((p) => p.id);
      for (let i = 0; i < ids.length; i += 6) {
        const chunk = ids.slice(i, i + 6);
        const rows = await Promise.all(chunk.map((id) => repo.listPurchaseItems(id).catch(() => [] as PurchaseItem[])));
        chunk.forEach((id, j) => m.set(id, rows[j]));
        if (!alive) return;
      }
      if (alive) setItems(m);
    })();
    return () => { alive = false; };
  }, [group]);

  const goods = useMemo<Agg[]>(() => {
    if (!group || !items) return [];
    const agg = new Map<string, Agg>();
    const ordered = [...group.invoices].sort((a, b) => (a.purchased_at || "").localeCompare(b.purchased_at || ""));
    for (const p of ordered) {
      for (const it of items.get(p.id) ?? []) {
        const key = it.product_id ?? (it.barcode ? `b:${it.barcode}` : `n:${it.name.trim().toLowerCase()}`);
        let a = agg.get(key);
        if (!a) { a = { key, name: it.name, barcode: it.barcode ?? null, qty: 0, amount: 0, lastCost: it.purchase_price, lastAt: "", invs: new Set() }; agg.set(key, a); }
        a.qty += it.qty;
        a.amount += it.qty * it.purchase_price;
        a.invs.add(p.id);
        const at = p.purchased_at || p.created_at || "";
        if (at >= a.lastAt) { a.lastAt = at; a.lastCost = it.purchase_price; a.name = it.name; }
      }
    }
    return [...agg.values()].sort((a, b) => b.amount - a.amount);
  }, [group, items]);

  const units = goods.reduce((s, a) => s + a.qty, 0);

  const print = () => {
    if (!group || !items) return;
    playTap();
    const socials = getClinicSocials();
    const ok = openCompanyStatementPrint(
      {
        companyName: group.name,
        supplier: group.supplier,
        supplierPhone: group.supplierPhone,
        note: group.note ?? null,
        invoices: group.invoices,
        itemsByPurchase: items,
      },
      {
        clinicName: getClinicName() || "doctorVet",
        lang: i18n.language,
        logoUrl: getClinicLogo(),
        facebook: socials.facebook,
        instagram: socials.instagram,
      },
    );
    if (!ok) toast.error(t("print.blocked", "المتصفح منع نافذة الطباعة — اسمح بالنوافذ المنبثقة وحاول مجدداً"));
  };

  return (
    <Modal open={!!group} onClose={onClose} title={group ? `كشف ${group.name}` : ""} size="wide">
      {group && (
        <div className="space-y-4" data-statement>
          {/* الخلاصة */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            <Kpi icon={ShoppingBag} label={t("purchase.invCountL", "الفواتير")} value={String(group.invoices.length)} />
            <Kpi icon={PackageCheck} label={t("purchase.unitsL", "القطع")} value={items ? String(units) : "…"} />
            <Kpi icon={Building2} label={t("purchase.grandTotal", "الإجمالي")} value={money(group.total)} />
            <Kpi icon={HandCoins} label={t("purchase.kpiPaid2", "المسدَّد")} value={money(group.paid)} tone="success" />
            <Kpi icon={Wallet} label={t("purchase.due", "المتبقّي")} value={group.due > 0 ? money(group.due) : "✓"} tone={group.due > 0 ? "danger" : "success"} />
          </div>

          <Button className="w-full sm:w-auto" leftIcon={<Printer size={16} />} disabled={!items} onClick={print} data-printstmt>
            {t("purchase.printStatement", "طباعة كشف الشركة")}
          </Button>

          {/* البضاعة المشتراة — مجمَّعة عبر كل الفواتير */}
          <div>
            <h3 className="mb-1.5 text-sm font-extrabold text-ink">{t("purchase.goodsFrom", "البضاعة المشتراة من الشركة")}</h3>
            {!items ? (
              <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 rounded-xl" />)}</div>
            ) : goods.length === 0 ? (
              <p className="rounded-xl bg-surface-2 p-4 text-center text-xs text-ink-subtle">{t("purchase.noGoods", "ما في سطور بضاعة محفوظة بهذه الفواتير.")}</p>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-xs">
                  <thead className="bg-surface-2 text-2xs text-ink-subtle">
                    <tr>
                      <th className="p-2.5 text-start font-bold">{t("purchase.item", "الصنف")}</th>
                      <th className="p-2.5 text-end font-bold">{t("purchase.totalQty", "الكمية الكلية")}</th>
                      <th className="p-2.5 text-end font-bold">{t("purchase.lastCost", "آخر سعر شراء")}</th>
                      <th className="p-2.5 text-end font-bold">{t("purchase.amount", "الإجمالي")}</th>
                      <th className="p-2.5 text-end font-bold">{t("purchase.inInv", "بكم فاتورة")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {goods.map((a) => (
                      <tr key={a.key} className="border-t border-line">
                        <td className="p-2.5">
                          <p className="font-bold text-ink">{a.name}</p>
                          {a.barcode && <p className="font-mono text-2xs text-ink-subtle" dir="ltr">{a.barcode}</p>}
                        </td>
                        <td className="p-2.5 text-end font-bold tabular-nums text-ink">{a.qty}</td>
                        <td className="p-2.5 text-end tabular-nums text-ink-muted">{money(a.lastCost)}</td>
                        <td className="p-2.5 text-end font-bold tabular-nums text-ink">{money(a.amount)}</td>
                        <td className="p-2.5 text-end tabular-nums text-ink-muted">{a.invs.size}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* الفواتير */}
          <div>
            <h3 className="mb-1.5 text-sm font-extrabold text-ink">{t("purchase.invList", "الفواتير")}</h3>
            <div className="space-y-1.5">
              {[...group.invoices].sort((a, b) => (b.purchased_at || "").localeCompare(a.purchased_at || "")).map((p) => {
                const paid = p.amount_paid ?? p.total;
                const due = Math.max(0, p.total - paid);
                return (
                  <button key={p.id} type="button" onClick={() => { playTap(); onOpenInvoice(p); }}
                    className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-xl bg-surface-2 p-2.5 text-start transition hover:bg-surface-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-ink">
                        {formatDate(p.purchased_at, i18n.language)}
                        {p.reference && <span className="ms-2 font-mono text-2xs text-ink-subtle">#{p.reference}</span>}
                      </p>
                      <p className="text-2xs text-ink-subtle">{t("purchase.units", { n: p.item_count, defaultValue: "{{n}} قطعة" })} · {t("purchase.tapGoods", "اضغط لعرض بضاعتها وطباعتها")}</p>
                    </div>
                    <div className="text-end">
                      <p className="text-xs font-bold tabular-nums text-ink">{money(p.total)}</p>
                      <p className={cn("text-2xs font-bold tabular-nums", due > 0 ? "text-danger-600 dark:text-danger-400" : "text-success-600 dark:text-success-400")}>
                        {due > 0 ? t("purchase.dueShort", { v: money(due), defaultValue: "عليه {{v}}" }) : t("purchase.paidFull", "مسدَّدة")}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );
}

function Kpi({ icon: Icon, label, value, tone }: { icon: typeof Wallet; label: string; value: string; tone?: "success" | "danger" }) {
  return (
    <div className="rounded-xl border border-line bg-surface-1 p-2.5 text-center">
      <Icon size={14} className={cn("mx-auto mb-1", tone === "danger" ? "text-danger-500" : tone === "success" ? "text-success-500" : "text-brand-500")} />
      <p className={cn("text-sm font-extrabold tabular-nums", tone === "danger" ? "text-danger-600 dark:text-danger-400" : "text-ink")}>{value}</p>
      <p className="text-2xs font-bold text-ink-subtle">{label}</p>
    </div>
  );
}
