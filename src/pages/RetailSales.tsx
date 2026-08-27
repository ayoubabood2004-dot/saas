import { useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Store, ShoppingCart, ReceiptText, BarChart3, HandCoins, Bike, PawPrint, ArrowRight, Wallet, RotateCcw } from "lucide-react";
import type { Product, Invoice, Species } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/lib/entitlements";
import { useNavFolded } from "@/lib/navFold";
import { Skeleton } from "@/components/ui";
import { cn } from "@/lib/utils";
import { withTimeout } from "@/lib/errors";
import { getCached, setCached, isFresh } from "@/lib/swrCache";
import { loadRetailSnap, retailKey, type RetailSnap } from "@/lib/prefetchData";
import { playTap } from "@/lib/sounds";
import { SaleBuilder, type RetailPrefill } from "@/components/retail/SaleBuilder";
import { getPosV2, getCashReconcile } from "@/lib/settings";
import { CashReconcile } from "@/components/retail/CashReconcile";
import { InvoicesPanel } from "@/components/retail/InvoicesPanel";
import { DebtsPanel } from "@/components/retail/DebtsPanel";
import { DeliveryPanel } from "@/components/retail/DeliveryPanel";
import { ReportsPanel } from "@/components/retail/ReportsPanel";
import { ReturnsPanel } from "@/components/retail/ReturnsPanel";

type Tab = "sell" | "invoices" | "returns" | "debts" | "delivery" | "reports";

/** Valid Species values — guards the `species` bridge param against tampered URLs. */
const SPECIES_SET = new Set<string>(["dog", "cat", "horse", "cow", "bird", "rabbit", "other"]);

export function RetailSales() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { has } = useEntitlements();
  const navFolded = useNavFolded();
  const clinicId = user?.clinic_id ?? user?.id; // shared workspace id (manager's id for staff)
  const [tab, setTab] = useState<Tab>("sell");

  // Stale-while-revalidate: paint the last snapshot instantly (seeded by the
  // page's own load() or the idle background-warmer — same key + shape).
  const cacheKey = retailKey(clinicId);
  const seed = getCached<RetailSnap>(cacheKey);
  const [products, setProducts] = useState<Product[]>(seed?.products ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(seed?.invoices ?? []);
  const [loading, setLoading] = useState(!seed);

  // The "bridge": an animal record handed us a customer + pet via the URL. Capture it
  // into state (so it survives the URL cleanup + the initial data load), jump to the
  // sell tab, then strip the query string so a refresh/tab-switch won't re-apply it.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const [prefill, setPrefill] = useState<RetailPrefill | null>(null);
  /* مطابقة الصندوق — خيار تفعيلي من الإعدادات (زر بنهاية كل دوام). */
  const [cashRecOpen, setCashRecOpen] = useState(false);
  // من فتح المبيعات من سجل حيوان؟ نحفظ هويته حتى نرجّعه بضغطة بعد ما ننظّف الرابط.
  const [returnPet, setReturnPet] = useState<{ id: string; name: string } | null>(null);
  useEffect(() => {
    const customer = params.get("customer") ?? "";
    const phone = params.get("phone") ?? "";
    const pet = params.get("pet") ?? "";
    const petId = params.get("petId") ?? "";
    // Validate against the known set — never blind-cast a tampered/stale query string.
    const rawSpecies = params.get("species");
    const species = rawSpecies && SPECIES_SET.has(rawSpecies) ? (rawSpecies as Species) : undefined;
    // جسر المختبر: التحليل يوصل كبند خدمة جاهز + معرف النتيجة حتى تتفوتر تلقائياً.
    const service = params.get("service") ?? "";
    const labId = params.get("labId") ?? "";
    if (customer || phone || pet || service) {
      setPrefill({ name: customer, phone, pet, petId: petId || undefined, species, service: service || undefined, labId: labId || undefined });
      setTab("sell");
      if (petId) setReturnPet({ id: petId, name: pet || customer || "الحالة" });
      setParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  const mounted = useRef(true);
  const load = async () => {
    try {
      const snap = await withTimeout(loadRetailSnap(clinicId), 15000);
      if (!mounted.current) return;
      setProducts(snap.products);
      setInvoices(snap.invoices);
      setCached<RetailSnap>(cacheKey, snap);
    } catch {
      /* a hung/failed query still clears the skeleton below */
    } finally {
      if (mounted.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    if (!isFresh(cacheKey, 20_000)) void load(); // skip refetch when fresh (< 20s)
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The debts ledger is a super-plan feature (البيع بالدين) — hidden otherwise.
  const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: "sell", label: t("retail.newSaleTab", "New sale"), icon: ShoppingCart },
    { id: "invoices", label: t("retail.invoicesTab", "Invoices"), icon: ReceiptText },
    { id: "returns", label: t("retail.returnsTab", "المرتجع"), icon: RotateCcw },
    ...(has("debt") ? [{ id: "debts" as Tab, label: t("retail.debtsTab", "سجل الديون"), icon: HandCoins }] : []),
    ...(has("debt") ? [{ id: "delivery" as Tab, label: t("retail.deliveryTab", "التوصيل"), icon: Bike }] : []),
    { id: "reports", label: t("retail.reportsTab", "Reports"), icon: BarChart3 },
  ];

  // شاشة البيع الجديدة تختصر ترويسة الصفحة أثناء البيع: كل بكسل فوق شبكة
  // المنتجات يُدفع من رصيد الكاشير. الشرح يبقى بالتبويبات الأخرى.
  const compactChrome = getPosV2() && tab === "sell";
  // وضع التركيز: طيّ الشريط بلا رفع سقف العرض (1152px) يعطي صفراً على شاشة
  // المكتب — المساحة المتحرّرة تُهدر بهامشين. فالسقف يُرفع مع الطيّ، بشاشة
  // البيع وحدها: بقية التبويبات جداولٌ يؤذيها العرض اللانهائي.
  const wideSell = compactChrome && navFolded;

  return (
    <div className={cn("mx-auto px-4", wideSell ? "max-w-none" : "max-w-6xl",
      // شاشة البيع تلغي فسحة شريط التنقّل السفلي (pb-20 بالهيكل): لا شيء
      // يشغلها هنا، وكانت تسرق ٨٠px من ارتفاع السلة على الأجهزة اللوحية.
      compactChrome ? "py-3 -mb-20 lg:mb-0" : "py-6")}>
      <div className={cn("flex items-center gap-3", compactChrome ? "mb-2.5" : "mb-5")}>
        <span className={cn("grid place-items-center rounded-2xl bg-brand-grad text-white shadow-soft", compactChrome ? "h-9 w-9" : "h-11 w-11")}><Store size={compactChrome ? 19 : 24} /></span>
        <div>
          <h1 className={cn("font-display font-extrabold text-ink", compactChrome ? "text-lg" : "text-2xl")}>{t("retail.title", "Retail & Sales")}</h1>
          {!compactChrome && <p className="text-sm text-ink-subtle">{t("retail.subtitle", "Walk-in sales, invoicing & receipts — for this clinic only.")}</p>}
        </div>
        {getCashReconcile() && (
          <button
            type="button"
            data-cashrec-open
            onClick={() => { playTap(); setCashRecOpen(true); }}
            className={cn("inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300", returnPet ? "" : "ms-auto")}
          >
            <Wallet size={15} /> {t("cashrec.openBtn", "مطابقة الصندوق")}
          </button>
        )}
        {returnPet && (
          <button
            type="button"
            onClick={() => { playTap(); navigate(`/pet/${returnPet.id}`); }}
            className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3.5 py-2 text-xs font-extrabold text-brand-700 transition hover:bg-brand-100 active:scale-95 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300"
            title={`رجوع لسجل ${returnPet.name}`}
          >
            <PawPrint size={15} /> رجوع لسجل {returnPet.name}
            <ArrowRight size={15} className="rtl:rotate-180" />
          </button>
        )}
      </div>

      <div className={cn("flex gap-1 rounded-2xl border border-line bg-surface-1 p-1", compactChrome ? "mb-2.5" : "mb-4")}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { playTap(); setTab(id); }}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition", compactChrome ? "py-1.5" : "py-2.5",
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
          ) : tab === "returns" ? (
            <ReturnsPanel invoices={invoices} onChanged={load} />
          ) : tab === "debts" ? (
            <DebtsPanel invoices={invoices} clinicId={clinicId} onChanged={load} onOpenDelivery={() => setTab("delivery")} />
          ) : tab === "delivery" ? (
            <DeliveryPanel invoices={invoices} clinicId={clinicId} onChanged={load} />
          ) : (
            <ReportsPanel invoices={invoices} clinicId={clinicId} />
          )}
        </motion.div>
      </AnimatePresence>

      <CashReconcile open={cashRecOpen} onClose={() => setCashRecOpen(false)} />
    </div>
  );
}
