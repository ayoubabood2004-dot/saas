import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Receipt, ChevronDown, RotateCcw } from "lucide-react";
import type { Pet, Invoice, InvoiceItem } from "@/types";
import { repo } from "@/lib/repo";
import { phoneDigits } from "@/lib/phone";
import { money, cn } from "@/lib/utils";

/**
 * Mini sales history for a pet's profile (clinic-staff view). Invoices aren't
 * linked to a pet in the schema, so we match the owner: invoice.customer_phone
 * ↔ pet.owner_phone (the bill is raised to the owner). Self-contained fetch via
 * the existing repo (RLS scopes it to the clinic) — no query library.
 * Western numerals for dates/prices; all labels Arabic.
 */
export function PetSalesWidget({ pet }: { pet: Pet }) {
  const { t } = useTranslation();
  const ownerKey = phoneDigits(pet.owner_phone ?? "");
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [items, setItems] = useState<InvoiceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    let alive = true;
    if (!ownerKey) { setLoaded(true); return; }
    Promise.all([repo.listInvoices(), repo.listAllInvoiceItems()])
      .then(([inv, it]) => { if (alive) { setInvoices(inv); setItems(it); } })
      .catch(() => { /* empty state covers it */ })
      .finally(() => { if (alive) setLoaded(true); });
    return () => { alive = false; };
  }, [ownerKey]);

  const rows = useMemo(() => {
    if (!ownerKey) return [];
    const byInvoice = new Map<string, InvoiceItem[]>();
    for (const it of items) { const a = byInvoice.get(it.invoice_id) ?? []; a.push(it); byInvoice.set(it.invoice_id, a); }
    return invoices
      .filter((i) => phoneDigits(i.customer_phone ?? "") === ownerKey)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .map((inv) => ({ inv, names: (byInvoice.get(inv.id) ?? []).map((x) => x.name) }));
  }, [invoices, items, ownerKey]);

  const totalSpend = useMemo(
    () => rows.filter((r) => (r.inv.status ?? "paid") !== "refunded").reduce((s, r) => s + r.inv.total, 0),
    [rows],
  );

  const shown = showAll ? rows : rows.slice(0, 5);
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB");

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-center gap-2.5 border-b border-line bg-gradient-to-br from-brand-500/10 to-success-500/10 px-4 py-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-soft"><Receipt size={17} /></span>
        <h3 className="font-display font-bold text-ink">{t("petSales.title")}</h3>
        {rows.length > 0 && (
          <span className="chip ms-auto bg-surface-1 text-2xs font-bold text-ink-muted tabular-nums" title={t("petSales.totalSpend")}>{money(totalSpend)}</span>
        )}
      </div>

      {!loaded ? (
        <div className="space-y-2 p-3">{Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-surface-2" />)}</div>
      ) : rows.length === 0 ? (
        <div className="grid place-items-center px-4 py-8 text-center">
          <Receipt size={26} className="mb-2 text-ink-subtle/40" />
          <p className="text-sm text-ink-subtle">{t("petSales.empty")}</p>
        </div>
      ) : (
        <>
          <ul className={cn("divide-y divide-line", showAll && "max-h-64 overflow-y-auto [scrollbar-width:thin]")}>
            {shown.map(({ inv, names }) => {
              const refunded = (inv.status ?? "paid") === "refunded";
              const summary = names.length ? names.join("، ") : t("petSales.items", { n: inv.item_count });
              return (
                <li key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                      <span className="truncate">{summary}</span>
                      {refunded && <span className="chip shrink-0 inline-flex items-center gap-0.5 bg-danger-50 text-2xs font-medium text-danger-600 dark:bg-danger-500/15 dark:text-danger-300"><RotateCcw size={10} /> {t("retail.refunded", "مُرتجع")}</span>}
                    </p>
                    <p className="text-2xs text-ink-subtle" dir="ltr">{fmtDate(inv.created_at)}</p>
                  </div>
                  <span className={cn("shrink-0 font-display font-bold tabular-nums", refunded ? "text-ink-subtle line-through" : "text-ink")}>{money(inv.total)}</span>
                </li>
              );
            })}
          </ul>
          {rows.length > 5 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="flex w-full items-center justify-center gap-1.5 border-t border-line py-2.5 text-xs font-semibold text-brand-600 transition hover:bg-surface-2"
            >
              {showAll ? t("petSales.showLess") : t("petSales.showAll", { n: rows.length })}
              <ChevronDown size={14} className={cn("transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </>
      )}
    </div>
  );
}
