import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart, User, Phone, Tag, Percent,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2, Printer, Sparkles, TrendingUp, Package, PawPrint, X,
  Stethoscope, Pencil,
} from "lucide-react";
import type { Product, Invoice, InvoiceItem, CheckoutItem, SaleMeta, PaymentMethod, DiscountType, Customer, Service, ServiceCatalog } from "@/types";
import { repo, resolveDiscount } from "@/lib/repo";
import { getServiceCatalog } from "@/lib/services";
import { computePromotions, getPromoRules } from "@/lib/promotions";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { Button, useToast } from "@/components/ui";
import { ServiceQuickSelect } from "./ServiceQuickSelect";
import { useInvoicePrinter } from "./usePrintInvoice";
import { invoiceNo } from "@/lib/invoicePrint";
import { cn, money, IQD } from "@/lib/utils";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/** A unified cart line — a physical product OR a non-barcode service. The price is an
 *  editable override; services carry product_id=null + zero cost so they flow through
 *  the normal checkout/invoice/analytics pipeline alongside products. */
interface Line {
  id: string; // "p:<productId>" | "s:<serviceId>"
  kind: "product" | "service";
  name: string;
  barcode: string | null;
  unit_price: number; // editable
  unit_cost: number; // product purchase price; 0 for services
  qty: number;
  stock: number | null; // product stock cap; null = unlimited (service)
  product_id: string | null;
  subcategory: string | null; // product subcategory, for Mix & Match promotions
}

const PAY_METHODS: { value: PaymentMethod; icon: typeof Banknote; key: string; def: string }[] = [
  { value: "cash", icon: Banknote, key: "retail.cash", def: "Cash" },
  { value: "card", icon: CreditCard, key: "retail.card", def: "Card" },
  { value: "transfer", icon: ArrowLeftRight, key: "retail.transfer", def: "Transfer" },
];

/** Customer/pet handed over from an animal record to pre-fill the sale (the "bridge"). */
export interface RetailPrefill { name: string; phone: string; pet: string }

export function SaleBuilder({ products, clinicId, onSold, prefill }: { products: Product[]; clinicId?: string; onSold: () => void; prefill?: RetailPrefill | null }) {
  const { t } = useTranslation();
  const toast = useToast();
  const print = useInvoicePrinter();

  const [cart, setCart] = useState<Line[]>([]);
  const [browseTab, setBrowseTab] = useState<"products" | "services">("products");
  const [catalog] = useState<ServiceCatalog>(() => getServiceCatalog());
  // Doctor-defined Mix & Match offers (clinic-scoped). Loaded once per sale session.
  const [promoRules] = useState(() => getPromoRules());
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [petContext, setPetContext] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [custMatches, setCustMatches] = useState<Customer[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [done, setDone] = useState<{ invoice: Invoice; items: InvoiceItem[] } | null>(null);
  const [lastPrints, setLastPrints] = useState(0);

  const flashLine = (id: string) => { setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 600); };

  // Add (or increment) a line; products are capped at their stock.
  const bump = (id: string, factory: () => Line) => {
    setCart((c) => {
      const found = c.find((l) => l.id === id);
      if (found) {
        const cap = found.stock != null ? found.stock : Infinity;
        return c.map((l) => (l.id === id ? { ...l, qty: Math.min(l.qty + 1, cap) } : l));
      }
      return [...c, factory()];
    });
    flashLine(id);
  };

  const addProduct = (p: Product) =>
    bump(`p:${p.id}`, () => ({ id: `p:${p.id}`, kind: "product", name: p.name, barcode: p.barcode ?? null, unit_price: p.sell_price, unit_cost: p.purchase_price, qty: 1, stock: p.stock, product_id: p.id, subcategory: p.subcategory ?? null }));

  const addService = (s: Service) =>
    bump(`s:${s.id}`, () => ({ id: `s:${s.id}`, kind: "service", name: s.name, barcode: null, unit_price: s.price, unit_cost: 0, qty: 1, stock: null, product_id: null, subcategory: null }));

  const setQty = (id: string, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => (l.id === id ? { ...l, qty: l.stock != null ? Math.min(qty, l.stock) : qty } : l))));

  const setPrice = (id: string, price: number) =>
    setCart((c) => c.map((l) => (l.id === id ? { ...l, unit_price: Math.max(0, Math.round(price * 100) / 100) } : l)));

  const removeLine = (id: string) => setCart((c) => c.filter((l) => l.id !== id));

  useBarcodeScanner(async (code) => {
    if (done) return;
    const product = await repo.getProductByBarcode(code, clinicId);
    if (!product) { playWarning(); toast.error(t("pos.notFound", "No product matches that barcode"), code); return; }
    playSuccess();
    addProduct(product);
    setQuery(""); // clear any scanned digits that landed in the focused search box
  });

  // The bridge: a doctor clicked "Sell items" inside an animal record. Auto-fill the
  // customer, surface the pet context, and focus the scan field for a zero-click flow.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.name) setName(prefill.name);
    if (prefill.phone) setPhone(prefill.phone);
    setPetContext(prefill.pet || null);
    setDone(null);
    const id = window.setTimeout(() => searchRef.current?.focus(), 160);
    return () => window.clearTimeout(id);
  }, [prefill]);

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const cost = cart.reduce((s, l) => s + l.qty * l.unit_cost, 0);
  const units = cart.reduce((s, l) => s + l.qty, 0);
  // Dynamic Mix & Match offers, evaluated against the live cart.
  const { applied: promos, totalDiscount: promoDiscount } = useMemo(() => computePromotions(cart, promoRules), [cart, promoRules]);
  // Manual (percent/fixed) discount entered at the till, on top of any promotions.
  const manualDiscountAmt = resolveDiscount(subtotal, discountType, Number(discountValue) || 0);
  // Combined deduction, never more than the subtotal.
  const discountAmt = Math.min(subtotal, promoDiscount + manualDiscountAmt);
  const total = Math.max(0, subtotal - discountAmt);
  const profit = total - cost;

  const ql = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const base = ql ? products.filter((p) => p.name.toLowerCase().includes(ql) || (p.barcode ?? "").includes(ql)) : products;
    return base.slice(0, 24);
  }, [products, ql]);

  // Existing-customer search (name or phone).
  const custTimer = useRef<number | null>(null);
  const runCustSearch = (qName: string, qPhone: string) => {
    const q = (qPhone || qName).trim();
    if (custTimer.current) window.clearTimeout(custTimer.current);
    if (q.length < 1) { setCustMatches([]); return; }
    custTimer.current = window.setTimeout(async () => {
      try { setCustMatches(await repo.searchCustomers(q, clinicId)); } catch { setCustMatches([]); }
    }, 180);
  };

  const pickCustomer = (c: Customer) => { setName(c.name); setPhone(c.phone); setCustOpen(false); setCustMatches([]); playTap(); };

  const reset = () => {
    setCart([]); setQuery(""); setName(""); setPhone(""); setDiscountValue("");
    setDiscountType("percent"); setPayment("cash"); setDone(null); setLastPrints(0);
    setPetContext(null); setBrowseTab("products");
  };

  const checkout = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    try {
      const items: CheckoutItem[] = cart.map((l) => ({
        product_id: l.product_id, name: l.name, barcode: l.barcode,
        qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost,
      }));
      const meta: SaleMeta = {
        customer_name: name.trim() || null,
        customer_phone: phone.trim() || null,
        pet_name: petContext?.trim() || null,
        // Promotions + manual discount are folded into one server-side fixed amount so
        // the recorded total/profit exactly match the till (the server clamps to subtotal).
        discount_type: discountAmt > 0 ? "fixed" : null,
        discount_value: discountAmt > 0 ? discountAmt : 0,
        payment_method: payment,
      };
      const invoice = await withTimeout(repo.retailCheckout(items, meta), 12000);
      // Snapshot the lines for instant printing (services + products, with overrides).
      const invItems: InvoiceItem[] = cart.map((l) => ({
        id: `tmp-${l.id}`, invoice_id: invoice.id, clinic_id: clinicId ?? null,
        product_id: l.product_id, name: l.name, barcode: l.barcode,
        qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost, line_total: l.qty * l.unit_price,
      }));
      playSuccess();
      setDone({ invoice, items: invItems });
      onSold();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  // ---- Sale complete screen -------------------------------------------------
  if (done) {
    return (
      <motion.div initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto max-w-md">
        <div className="card overflow-hidden p-0 text-center">
          <div className="bg-brand-grad p-6 text-white">
            <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.05 }} className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-white/20 backdrop-blur">
              <CheckCircle2 size={36} />
            </motion.span>
            <h3 className="mt-3 font-display text-xl font-extrabold">{t("retail.saleComplete", "Sale complete")}</h3>
            <p className="text-sm text-white/85">{invoiceNo(done.invoice.id)}</p>
          </div>
          <div className="space-y-4 p-5">
            <div className="flex items-end justify-center gap-2">
              <span className="font-display text-4xl font-extrabold text-ink tabular-nums">{money(done.invoice.total)}</span>
            </div>
            <div className="flex items-center justify-center gap-4 text-sm text-ink-muted">
              <span className="flex items-center gap-1 text-success-600"><TrendingUp size={14} /> {t("retail.profit", "Profit")} {money(done.invoice.profit)}</span>
              {done.invoice.customer_name && <span className="flex items-center gap-1"><User size={14} /> {done.invoice.customer_name}</span>}
            </div>
            {lastPrints > 0 && <p className="text-xs text-ink-subtle">{t("retail.printedTimes", { n: lastPrints, defaultValue: "Printed {{n}}×" })}</p>}
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={() => print(done.invoice, "a4", { items: done.items, onCounted: setLastPrints })}>
                {t("retail.printA4", "Print A4")}
              </Button>
              <Button variant="secondary" leftIcon={<Printer size={16} />} onClick={() => print(done.invoice, "thermal", { items: done.items, onCounted: setLastPrints })}>
                {t("retail.printReceipt", "Receipt 80mm")}
              </Button>
            </div>
            <Button className="w-full" size="lg" leftIcon={<Sparkles size={16} />} onClick={() => { playTap(); reset(); }}>
              {t("retail.newSale", "New sale")}
            </Button>
          </div>
        </div>
      </motion.div>
    );
  }

  // ---- Builder --------------------------------------------------------------
  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,380px]">
      {/* LEFT — customer + products/services */}
      <div className="space-y-4">
        {/* Bridge context — which animal this sale is for (from the medical record) */}
        {petContext && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2.5 rounded-2xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm dark:border-brand-500/30 dark:bg-brand-500/10">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><PawPrint size={15} /></span>
            <span className="flex-1 font-medium text-brand-800 dark:text-brand-200">{t("retail.saleForPet", { pet: petContext, defaultValue: "Sale for {{pet}}" })}</span>
            <button onClick={() => setPetContext(null)} aria-label={t("common.dismiss", "Dismiss")} className="grid h-6 w-6 place-items-center rounded-full text-brand-700/70 transition hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20"><X size={14} /></button>
          </motion.div>
        )}
        {/* Customer */}
        <div className="card p-4">
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink"><User size={16} /> {t("retail.customer", "Customer")} <span className="text-xs font-normal text-ink-subtle">· {t("retail.optional", "optional")}</span></div>
          <div className="relative grid gap-2 sm:grid-cols-2">
            <div className="relative">
              <User size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
              <input
                className="input ltr:pl-9 rtl:pr-9" value={name} placeholder={t("retail.custName", "Name")}
                onChange={(e) => { setName(e.target.value); runCustSearch(e.target.value, phone); setCustOpen(true); }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 150)}
              />
            </div>
            <div className="relative">
              <Phone size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
              <input
                className="input ltr:pl-9 rtl:pr-9" value={phone} placeholder={t("retail.custPhone", "Phone")} inputMode="tel"
                onChange={(e) => { setPhone(e.target.value); runCustSearch(name, e.target.value); setCustOpen(true); }}
                onFocus={() => setCustOpen(true)}
                onBlur={() => setTimeout(() => setCustOpen(false), 150)}
              />
            </div>
            {custOpen && custMatches.length > 0 && (
              <div className="absolute top-full z-20 mt-1 w-full overflow-hidden rounded-2xl border border-line bg-surface-1 shadow-raised">
                {custMatches.map((c, i) => (
                  <button key={i} onMouseDown={(e) => e.preventDefault()} onClick={() => pickCustomer(c)} className="flex w-full items-center gap-3 px-3 py-2.5 text-start transition hover:bg-surface-2">
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><User size={15} /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{c.name || t("retail.walkIn", "Walk-in")}</span>
                      {c.phone && <span className="block truncate text-xs text-ink-subtle">{c.phone}</span>}
                    </span>
                    <span className="shrink-0 text-2xs text-ink-subtle">{t("retail.visitsN", { n: c.visits, defaultValue: "{{n}} visits" })}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Products | Services toggle */}
        <div className="inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          {([
            { v: "products", label: t("retail.products", "Products"), icon: <Package size={15} /> },
            { v: "services", label: t("retail.services", "Services"), icon: <Stethoscope size={15} /> },
          ] as const).map((o) => (
            <button
              key={o.v}
              onClick={() => { playTap(); setBrowseTab(o.v); }}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition",
                browseTab === o.v ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}
            >
              {o.icon}{o.label}
            </button>
          ))}
        </div>

        {browseTab === "products" ? (
          <>
            {/* Product search + scan */}
            <div className="relative">
              <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
              <input ref={searchRef} className="input ltr:pl-9 rtl:pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("retail.searchProducts", "Search or scan a product…")} />
              <span className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1 text-2xs text-ink-subtle ltr:right-3 rtl:left-3"><Barcode size={13} /> {t("retail.scanReady", "scan ready")}</span>
            </div>

            {/* Product grid */}
            {shown.length === 0 ? (
              <div className="card grid place-items-center p-10 text-center text-sm text-ink-subtle">
                <Package size={28} className="mb-2 opacity-40" />
                {ql ? t("retail.noMatch", "No products match.") : t("retail.noProducts", "No products in inventory yet.")}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {shown.map((p) => {
                  const out = p.stock <= 0;
                  return (
                    <button
                      key={p.id} disabled={out} onClick={() => { playTap(); addProduct(p); }}
                      className={cn(
                        "group relative flex flex-col rounded-2xl border p-3 text-start transition",
                        out ? "cursor-not-allowed border-line bg-surface-2 opacity-50"
                          : flash === `p:${p.id}` ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15"
                            : "border-line bg-surface-1 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10",
                      )}
                    >
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-subtle group-hover:bg-white/60 dark:group-hover:bg-surface-1"><Package size={17} /></span>
                      <span className="mt-2 line-clamp-2 min-h-[2.2rem] text-xs font-semibold leading-tight text-ink">{p.name}</span>
                      <span className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-bold text-ink tabular-nums">{money(p.sell_price)}</span>
                        <span className={cn("text-2xs", out ? "text-danger-600" : "text-ink-subtle")}>{out ? t("retail.out", "out") : t("retail.nLeft", { n: p.stock, defaultValue: "{{n}} left" })}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <ServiceQuickSelect catalog={catalog} onPick={addService} flashId={flash} />
        )}
      </div>

      {/* RIGHT — cart */}
      <div className="card flex max-h-[78vh] flex-col p-0 lg:sticky lg:top-4">
        <div className="flex items-center justify-between border-b border-line p-4">
          <span className="flex items-center gap-2 font-display font-bold text-ink"><ShoppingCart size={18} /> {t("retail.cart", "Cart")} {units > 0 && <span className="chip bg-brand-50 text-2xs text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{units}</span>}</span>
          {cart.length > 0 && <button onClick={() => { playTap(); setCart([]); }} className="text-xs text-ink-subtle transition hover:text-danger-600">{t("common.clear", "Clear")}</button>}
        </div>

        <div className="flex-1 overflow-auto p-2">
          {cart.length === 0 ? (
            <div className="grid h-40 place-items-center px-6 text-center text-sm text-ink-subtle">{t("retail.cartEmpty", "Add products to start a sale.")}</div>
          ) : (
            <div className="space-y-1.5">
              <AnimatePresence initial={false}>
                {cart.map((l) => (
                  <motion.div key={l.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className={cn("flex items-center gap-2 rounded-2xl border p-2.5", flash === l.id ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15" : "border-line bg-surface-1")}>
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-1.5 truncate text-sm font-semibold text-ink">
                        {l.name}
                        {l.kind === "service" && <span className="chip shrink-0 bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("retail.service", "Service")}</span>}
                      </p>
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-subtle">
                        <PriceEdit value={l.unit_price} onChange={(v) => setPrice(l.id, v)} />
                        <span>{t("pos.each", "each")}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { playTap(); setQty(l.id, l.qty - 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Minus size={14} /></button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums text-ink">{l.qty}</span>
                      <button onClick={() => { playTap(); if (l.stock == null || l.qty < l.stock) setQty(l.id, l.qty + 1); else { playWarning(); toast.error(t("retail.maxStock", "No more in stock")); } }} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Plus size={14} /></button>
                    </div>
                    <span className="w-16 text-end text-sm font-bold tabular-nums text-ink">{money(l.qty * l.unit_price)}</span>
                    <button onClick={() => removeLine(l.id)} aria-label={t("common.delete", "Remove")} className="grid h-7 w-7 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Discount + payment + totals */}
        <div className="border-t border-line p-4 space-y-3">
          {/* Discount */}
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-xs font-semibold text-ink-muted"><Tag size={13} /> {t("retail.discount", "Discount")}</span>
            <div className="ms-auto flex items-center gap-1.5">
              <div className="flex overflow-hidden rounded-lg border border-line">
                <button onClick={() => setDiscountType("percent")} className={cn("grid h-8 w-8 place-items-center text-xs", discountType === "percent" ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted hover:bg-surface-2")} aria-label="Percent"><Percent size={14} /></button>
                <button onClick={() => setDiscountType("fixed")} className={cn("grid h-8 px-2 place-items-center text-2xs font-bold", discountType === "fixed" ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted hover:bg-surface-2")} aria-label="Fixed">{IQD}</button>
              </div>
              <input type="number" min="0" step="1" inputMode="numeric" value={discountValue} onChange={(e) => setDiscountValue(e.target.value)} placeholder="0" className="input h-8 w-24 px-2 py-0 text-end text-sm" />
            </div>
          </div>

          {/* Payment */}
          <div className="grid grid-cols-3 gap-1.5">
            {PAY_METHODS.map(({ value, icon: Icon, key, def }) => (
              <button key={value} onClick={() => { playTap(); setPayment(value); }}
                className={cn("flex flex-col items-center gap-1 rounded-xl border py-2 text-2xs font-semibold transition",
                  payment === value ? "border-brand-400 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>
                <Icon size={16} /> {t(key, def)}
              </button>
            ))}
          </div>

          {/* Totals */}
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.subtotal", "Subtotal")}</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {/* One distinct row per triggered Mix & Match offer, by the doctor's custom name. */}
            {promos.map((p) => (
              <div key={p.ruleId} className="flex items-center justify-between text-success-600">
                <span className="flex items-center gap-1.5 truncate"><Sparkles size={13} className="shrink-0" />{t("retail.promoLabel", { name: p.name, defaultValue: "Offer: {{name}}" })}</span>
                <span className="shrink-0 tabular-nums">-{money(p.discount)}</span>
              </div>
            ))}
            {manualDiscountAmt > 0 && <div className="flex items-center justify-between text-success-600"><span>{t("retail.discount", "Discount")}</span><span className="tabular-nums">-{money(manualDiscountAmt)}</span></div>}
            <div className="flex items-center justify-between"><span className="font-display font-bold text-ink">{t("retail.total", "Total")}</span><span className="font-display text-xl font-extrabold text-ink tabular-nums">{money(total)}</span></div>
            <div className="flex items-center justify-end gap-1 text-2xs text-success-600"><TrendingUp size={11} /> {t("retail.profit", "Profit")} {money(profit)}</div>
          </div>

          <Button className="w-full" size="lg" disabled={cart.length === 0} loading={busy} onClick={checkout} leftIcon={<CheckCircle2 size={18} />}>
            {t("retail.complete", "Complete sale")} · {money(total)}
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Inline click-to-edit price — the crux of the per-sale override. Edits only this
 *  cart line's price; the service's default in Settings is never touched. */
function PriceEdit({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const commit = () => {
    const n = Number(draft);
    if (!Number.isNaN(n) && n >= 0) onChange(n);
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        autoFocus type="number" min="0" step="1" inputMode="numeric" value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") setEditing(false); }}
        className="w-16 rounded-md border border-brand-400 bg-surface-1 px-1.5 py-0.5 text-xs font-bold tabular-nums text-ink outline-none"
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => { setDraft(String(Math.round(value))); setEditing(true); }}
      title={t("retail.editPrice", "Edit price")}
      className="inline-flex items-center gap-1 rounded-md px-1 font-bold tabular-nums text-brand-700 underline decoration-dotted underline-offset-2 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15"
    >
      {money(value)} <Pencil size={10} className="opacity-60" />
    </button>
  );
}
