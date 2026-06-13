import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Store, ShoppingCart, ReceiptText, BarChart3 } from "lucide-react";
import type { Product, Invoice } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/errors";
import { playTap } from "@/lib/sounds";
import { SaleBuilder } from "@/components/retail/SaleBuilder";
import { InvoicesPanel } from "@/components/retail/InvoicesPanel";
import { ReportsPanel } from "@/components/retail/ReportsPanel";

type Tab = "sell" | "invoices" | "reports";

export function RetailSales() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clinicId = user?.id;
  const [tab, setTab] = useState<Tab>("sell");
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(true);
  const load = async () => {
    try {
      const [p, inv] = await withTimeout(Promise.all([repo.listProducts(clinicId), repo.listInvoices(clinicId)]), 15000);
      if (!mounted.current) return;
      setProducts(p);
      setInvoices(inv);
    } catch {
      /* a hung/failed query still clears the skeleton below */
    } finally {
      if (mounted.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: "sell", label: t("retail.newSaleTab", "New sale"), icon: ShoppingCart },
    { id: "invoices", label: t("retail.invoicesTab", "Invoices"), icon: ReceiptText },
    { id: "reports", label: t("retail.reportsTab", "Reports"), icon: BarChart3 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Store size={24} /></span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("retail.title", "Retail & Sales")}</h1>
          <p className="text-sm text-ink-subtle">{t("retail.subtitle", "Walk-in sales, invoicing & receipts — for this clinic only.")}</p>
        </div>
      </div>

      <div className="mb-4 flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { playTap(); setTab(id); }}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              tab === id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {loading ? (
            <div className="grid gap-4 lg:grid-cols-[1fr,380px]">
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          ) : tab === "sell" ? (
            <SaleBuilder products={products} clinicId={clinicId} onSold={load} />
          ) : tab === "invoices" ? (
            <InvoicesPanel invoices={invoices} clinicId={clinicId} onChanged={load} />
          ) : (
            <ReportsPanel invoices={invoices} clinicId={clinicId} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
