import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Store, ShoppingCart, ReceiptText, BarChart3, HandCoins } from "lucide-react";
import type { Product, Invoice, Species } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/errors";
import { getCached, setCached } from "@/lib/swrCache";
import { playTap } from "@/lib/sounds";
import { SaleBuilder, type RetailPrefill } from "@/components/retail/SaleBuilder";
import { InvoicesPanel } from "@/components/retail/InvoicesPanel";
import { DebtsPanel } from "@/components/retail/DebtsPanel";
import { ReportsPanel } from "@/components/retail/ReportsPanel";

type Tab = "sell" | "invoices" | "debts" | "reports";

/** Valid Species values — guards the `species` bridge param against tampered URLs. */
const SPECIES_SET = new Set<string>(["dog", "cat", "horse", "cow", "bird", "rabbit", "other"]);

export function RetailSales() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id; // shared workspace id (manager's id for staff)
  const [tab, setTab] = useState<Tab>("sell");

  // Stale-while-revalidate: paint the last snapshot instantly on return.
  type Snap = { products: Product[]; invoices: Invoice[] };
  const cacheKey = `retail:${clinicId ?? "anon"}`;
  const seed = getCached<Snap>(cacheKey);
  const [products, setProducts] = useState<Product[]>(seed?.products ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(seed?.invoices ?? []);
  const [loading, setLoading] = useState(!seed);

  // The "bridge": an animal record handed us a customer + pet via the URL. Capture it
  // into state (so it survives the URL cleanup + the initial data load), jump to the
  // sell tab, then strip the query string so a refresh/tab-switch won't re-apply it.
  const [params, setParams] = useSearchParams();
  const [prefill, setPrefill] = useState<RetailPrefill | null>(null);
  useEffect(() => {
    const customer = params.get("customer") ?? "";
    const phone = params.get("phone") ?? "";
    const pet = params.get("pet") ?? "";
    const petId = params.get("petId") ?? "";
    // Validate against the known set — never blind-cast a tampered/stale query string.
    const rawSpecies = params.get("species");
    const species = rawSpecies && SPECIES_SET.has(rawSpecies) ? (rawSpecies as Species) : undefined;
    if (customer || phone || pet) {
      setPrefill({ name: customer, phone, pet, petId: petId || undefined, species });
      setTab("sell");
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const mounted = useRef(true);
  const load = async () => {
    try {
      const [p, inv] = await withTimeout(Promise.all([repo.listProducts(clinicId), repo.listInvoices(clinicId)]), 15000);
      if (!mounted.current) return;
      setProducts(p);
      setInvoices(inv);
      setCached<Snap>(cacheKey, { products: p, invoices: inv });
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
    { id: "debts", label: t("retail.debtsTab", "سجل الديون"), icon: HandCoins },
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
            <SaleBuilder products={products} clinicId={clinicId} onSold={load} prefill={prefill} />
          ) : tab === "invoices" ? (
            <InvoicesPanel invoices={invoices} clinicId={clinicId} onChanged={load} />
          ) : tab === "debts" ? (
            <DebtsPanel invoices={invoices} clinicId={clinicId} onChanged={load} />
          ) : (
            <ReportsPanel invoices={invoices} clinicId={clinicId} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
