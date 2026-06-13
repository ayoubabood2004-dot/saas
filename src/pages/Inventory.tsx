import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Barcode, Package, ShoppingCart, Plus, Minus, Trash2, Search, Receipt,
  TrendingUp, AlertTriangle, CalendarClock, Pencil, PackagePlus, Boxes, ScanLine,
} from "lucide-react";
import type { Product, Invoice, CartLine, CheckoutItem, ProductCategory } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { Modal } from "@/components/Modal";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";

type Tab = "pos" | "inventory" | "sales";
const LOW_STOCK = 5;

const money = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const daysUntil = (iso?: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86400000) : null);
/** A product's reorder level — its own min_stock if set, else the default. */
const lowThreshold = (p: Product) => (p.min_stock && p.min_stock > 0 ? p.min_stock : LOW_STOCK);

export function Inventory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("pos");
  const [products, setProducts] = useState<Product[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(true);
  const load = async () => {
    try {
      const [p, inv] = await withTimeout(Promise.all([repo.listProducts(user?.id), repo.listInvoices(user?.id)]), 15000);
      if (!mounted.current) return;
      setProducts(p);
      setInvoices(inv);
    } catch {
      /* hung/failed query — finally still clears the skeleton */
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

  const lowStock = products.filter((p) => p.stock <= lowThreshold(p)).length;
  const todayProfit = invoices
    .filter((i) => i.created_at.slice(0, 10) === new Date().toISOString().slice(0, 10))
    .reduce((s, i) => s + i.profit, 0);

  const TABS: { id: Tab; label: string; icon: typeof Package }[] = [
    { id: "pos", label: t("pos.tab", "Point of Sale"), icon: ScanLine },
    { id: "inventory", label: t("pos.inventory", "Inventory"), icon: Boxes },
    { id: "sales", label: t("pos.sales", "Sales"), icon: Receipt },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Barcode size={24} /></span>
          <div>
            <h1 className="font-display text-2xl font-extrabold text-ink">{t("pos.title", "Inventory & POS")}</h1>
            <p className="text-sm text-ink-subtle">{t("pos.subtitle", "Stock, barcode checkout & sales — for this clinic only.")}</p>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi icon={Package} tone="brand" label={t("pos.products", "Products")} value={String(products.length)} />
        <Kpi icon={AlertTriangle} tone={lowStock ? "warn" : "success"} label={t("pos.lowStock", "Low stock")} value={String(lowStock)} />
        <Kpi icon={TrendingUp} tone="accent" label={t("pos.todayProfit", "Today's profit")} value={money(todayProfit)} />
      </div>

      {/* Tabs */}
      <div className="mb-4 flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
        {TABS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { playTap(); setTab(id); }}
            className={cn(
              "flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              tab === id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink",
            )}
          >
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {loading ? (
            <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
          ) : tab === "pos" ? (
            <PosTab products={products} clinicId={user?.id} onSold={load} />
          ) : tab === "inventory" ? (
            <InventoryTab products={products} clinicId={user?.id} onChanged={load} />
          ) : (
            <SalesTab invoices={invoices} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

function Kpi({ icon: Icon, tone, label, value }: { icon: typeof Package; tone: "brand" | "warn" | "success" | "accent"; label: string; value: string }) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    warn: "bg-warn-50 text-warn-600 dark:bg-warn-500/15 dark:text-warn-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
    accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300",
  };
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone])}><Icon size={20} /></span>
      <div className="min-w-0">
        <p className="truncate text-lg font-bold text-ink tabular-nums">{value}</p>
        <p className="truncate text-xs text-ink-subtle">{label}</p>
      </div>
    </div>
  );
}

/* ---------------- Point of Sale ---------------- */
function PosTab({ products, clinicId, onSold }: { products: Product[]; clinicId?: string; onSold: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);

  const addProduct = (p: Product) => {
    setCart((c) => {
      const found = c.find((l) => l.product.id === p.id);
      if (found) return c.map((l) => (l.product.id === p.id ? { ...l, qty: l.qty + 1 } : l));
      return [...c, { product: p, qty: 1 }];
    });
    setFlash(p.id);
    setTimeout(() => setFlash((f) => (f === p.id ? null : f)), 600);
  };

  // Global barcode scanner — no input focus needed.
  useBarcodeScanner(async (code) => {
    const product = await repo.getProductByBarcode(code, clinicId);
    if (!product) { playWarning(); toast.error(t("pos.notFound", "No product matches that barcode"), code); return; }
    playSuccess();
    addProduct(product);
  });

  const setQty = (id: string, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l.product.id !== id) : c.map((l) => (l.product.id === id ? { ...l, qty } : l))));

  const subtotal = cart.reduce((s, l) => s + l.qty * l.product.sell_price, 0);
  const profit = cart.reduce((s, l) => s + l.qty * (l.product.sell_price - l.product.purchase_price), 0);
  const units = cart.reduce((s, l) => s + l.qty, 0);

  const ql = query.trim().toLowerCase();
  const matches = ql
    ? products.filter((p) => p.name.toLowerCase().includes(ql) || (p.barcode ?? "").includes(ql)).slice(0, 6)
    : [];

  const checkout = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    try {
      const items: CheckoutItem[] = cart.map((l) => ({
        product_id: l.product.id, name: l.product.name, barcode: l.product.barcode ?? null,
        qty: l.qty, unit_price: l.product.sell_price, unit_cost: l.product.purchase_price,
      }));
      const invoice = await withTimeout(repo.checkout(items), 12000);
      playSuccess();
      toast.success(t("pos.sold", { total: money(invoice.total), defaultValue: "Sale complete — {{total}}" }), t("pos.profitMade", { profit: money(invoice.profit), defaultValue: "Profit {{profit}}" }));
      setCart([]);
      setQuery("");
      onSold();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
      {/* Scan + search */}
      <div className="space-y-4">
        <div className="card flex flex-col items-center gap-2 border-dashed border-brand-300 bg-brand-50/40 p-6 text-center dark:border-brand-500/40 dark:bg-brand-500/5">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-600 text-white"><Barcode size={26} /></span>
          <p className="font-display font-bold text-ink">{t("pos.scanReady", "Scan a barcode to add it")}</p>
          <p className="text-xs text-ink-muted">{t("pos.scanHint", "Point the scanner anywhere on this screen — no need to click first.")}</p>
        </div>

        <div>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
            <input className="input ltr:pl-9 rtl:pr-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("pos.searchAdd", "Or search a product to add manually…")} />
          </div>
          {matches.length > 0 && (
            <div className="mt-2 space-y-1.5">
              {matches.map((p) => (
                <button key={p.id} onClick={() => { playTap(); addProduct(p); }} className="flex w-full items-center gap-3 rounded-2xl border border-line bg-surface-1 p-2.5 text-start transition hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-subtle"><Package size={17} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                    <span className="block truncate text-xs text-ink-subtle">{money(p.sell_price)} · {t("pos.inStock", { n: p.stock, defaultValue: "{{n}} in stock" })}</span>
                  </span>
                  <Plus size={16} className="shrink-0 text-brand-600" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Cart */}
      <div className="card flex max-h-[70vh] flex-col p-0">
        <div className="flex items-center justify-between border-b border-line p-4">
          <span className="flex items-center gap-2 font-display font-bold text-ink"><ShoppingCart size={18} /> {t("pos.cart", "Cart")}</span>
          {cart.length > 0 && <button onClick={() => setCart([])} className="text-xs text-ink-subtle transition hover:text-danger-600">{t("common.clear", "Clear")}</button>}
        </div>

        <div className="flex-1 overflow-auto p-2">
          {cart.length === 0 ? (
            <div className="grid h-40 place-items-center px-4 text-center text-sm text-ink-subtle">{t("pos.cartEmpty", "Scan or add products to start a sale.")}</div>
          ) : (
            <div className="space-y-1.5">
              {cart.map((l) => (
                <div key={l.product.id} className={cn("flex items-center gap-2 rounded-2xl border p-2.5 transition", flash === l.product.id ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15" : "border-line bg-surface-1")}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-ink">{l.product.name}</p>
                    <p className="text-xs text-ink-subtle">{money(l.product.sell_price)} {t("pos.each", "each")}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { playTap(); setQty(l.product.id, l.qty - 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Minus size={14} /></button>
                    <span className="w-7 text-center text-sm font-bold tabular-nums text-ink">{l.qty}</span>
                    <button onClick={() => { playTap(); setQty(l.product.id, l.qty + 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Plus size={14} /></button>
                  </div>
                  <span className="w-16 text-end text-sm font-bold tabular-nums text-ink">{money(l.qty * l.product.sell_price)}</span>
                  <button onClick={() => setQty(l.product.id, 0)} aria-label={t("common.delete", "Remove")} className="grid h-7 w-7 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={14} /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-line p-4">
          <div className="mb-1 flex items-center justify-between text-sm text-ink-muted"><span>{t("pos.items", { n: units, defaultValue: "{{n}} items" })}</span><span className="flex items-center gap-1 text-success-600"><TrendingUp size={13} /> {money(profit)}</span></div>
          <div className="mb-3 flex items-center justify-between"><span className="font-display font-bold text-ink">{t("pos.total", "Total")}</span><span className="font-display text-xl font-extrabold text-ink tabular-nums">{money(subtotal)}</span></div>
          <Button className="w-full" size="lg" disabled={cart.length === 0} loading={busy} onClick={checkout}>{t("pos.complete", "Complete sale")}</Button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Inventory ---------------- */
function InventoryTab({ products, clinicId, onChanged }: { products: Product[]; clinicId?: string; onChanged: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const ql = q.trim().toLowerCase();
  const shown = ql ? products.filter((p) => p.name.toLowerCase().includes(ql) || (p.barcode ?? "").includes(ql)) : products;

  const remove = async (p: Product) => {
    if (!window.confirm(t("pos.confirmDelete", { name: p.name, defaultValue: "Remove \"{{name}}\" from inventory?" }))) return;
    try { await repo.deleteProduct(p.id); playSuccess(); onChanged(); }
    catch (e) { toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pos.searchInv", "Search products…")} />
        </div>
        <Button leftIcon={<PackagePlus size={16} />} onClick={() => { playTap(); setAdding(true); }}>{t("pos.addProduct", "Add product")}</Button>
      </div>

      {shown.length === 0 ? (
        <div className="card p-10 text-center text-ink-subtle">{t("pos.noProducts", "No products yet. Add your first one.")}</div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {shown.map((p) => {
            const exp = daysUntil(p.expiry_date);
            const expired = exp != null && exp < 0;
            const expiringSoon = exp != null && exp >= 0 && exp <= 30;
            return (
              <motion.div key={p.id} variants={staggerItem} className="card flex items-center gap-3 p-3">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-subtle"><Package size={20} /></span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate text-sm font-semibold text-ink">
                    {p.name}
                    {p.category && <span className="chip shrink-0 bg-surface-2 text-2xs font-medium text-ink-muted">{t(`pos.cat.${p.category}`)}</span>}
                  </p>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-subtle">
                    {p.barcode && <span className="flex items-center gap-1 font-mono"><Barcode size={11} /> {p.barcode}</span>}
                    <span>{t("pos.buy", "Buy")} {money(p.purchase_price)}</span>
                    <span className="font-semibold text-ink-muted">{t("pos.sell", "Sell")} {money(p.sell_price)}</span>
                    {p.expiry_date && (
                      <span className={cn("flex items-center gap-1", expired ? "text-danger-600" : expiringSoon ? "text-warn-600" : "")}>
                        <CalendarClock size={11} /> {formatDate(p.expiry_date, i18n.language)}
                        {expired ? ` · ${t("pos.expired", "expired")}` : expiringSoon ? ` · ${t("pos.soon", "soon")}` : ""}
                      </span>
                    )}
                  </div>
                </div>
                <Badge tone={p.stock === 0 ? "danger" : p.stock <= lowThreshold(p) ? "warn" : "neutral"}>
                  {t("pos.qtyStock", { n: p.stock, defaultValue: "{{n}} in stock" })}
                </Badge>
                <button onClick={() => { playTap(); setEditing(p); }} aria-label={t("common.edit", "Edit")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={16} /></button>
                <button onClick={() => remove(p)} aria-label={t("common.delete", "Remove")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={16} /></button>
              </motion.div>
            );
          })}
        </motion.div>
      )}

      <ProductModal open={adding || !!editing} product={editing} clinicId={clinicId} onClose={() => { setAdding(false); setEditing(null); }} onSaved={() => { setAdding(false); setEditing(null); onChanged(); }} />
    </div>
  );
}

function ProductModal({ open, product, clinicId, onClose, onSaved }: { open: boolean; product: Product | null; clinicId?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const blank = { barcode: "", name: "", category: "", purchase_price: "", sell_price: "", stock: "", min_stock: "", expiry_date: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setF({
        barcode: product.barcode ?? "", name: product.name, category: product.category ?? "",
        purchase_price: String(product.purchase_price), sell_price: String(product.sell_price),
        stock: String(product.stock), min_stock: product.min_stock ? String(product.min_stock) : "",
        expiry_date: product.expiry_date ?? "",
      });
    } else {
      setF(blank);
      setTimeout(() => barcodeRef.current?.focus(), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, product]);

  const set = (patch: Partial<typeof f>) => setF((s) => ({ ...s, ...patch }));
  const sell = Number(f.sell_price) || 0;
  const profit = sell - (Number(f.purchase_price) || 0);
  const marginPct = sell > 0 ? Math.round((profit / sell) * 100) : 0;
  const hasPrices = f.purchase_price !== "" || f.sell_price !== "";

  const CATEGORIES: { value: ProductCategory; label: string }[] = [
    { value: "medicine", label: t("pos.cat.medicine", "Medicine") },
    { value: "food", label: t("pos.cat.food", "Food") },
    { value: "accessories", label: t("pos.cat.accessories", "Accessories") },
    { value: "consumables", label: t("pos.cat.consumables", "Consumables") },
    { value: "other", label: t("pos.cat.other", "Other") },
  ];

  const save = async () => {
    if (!f.name.trim() || busy) return;
    setBusy(true);
    try {
      const payload = {
        barcode: f.barcode.trim() || null,
        name: f.name.trim(),
        category: (f.category || null) as ProductCategory | null,
        purchase_price: Number(f.purchase_price) || 0,
        sell_price: Number(f.sell_price) || 0,
        stock: Math.max(0, Math.round(Number(f.stock) || 0)),
        min_stock: Math.max(0, Math.round(Number(f.min_stock) || 0)),
        expiry_date: f.expiry_date || null,
      };
      if (product) await repo.updateProduct(product.id, payload);
      else await repo.createProduct({ ...payload, clinic_id: clinicId ?? null });
      playSuccess();
      onSaved();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title={product ? t("pos.editProduct", "Edit product") : t("pos.addProduct", "Add product")}>
      <div className="space-y-3">
        <div>
          <label className="label">{t("pos.barcode", "Barcode")}</label>
          <div className="relative">
            <Barcode size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
            <input
              ref={barcodeRef}
              className="input font-mono ltr:pl-9 rtl:pr-9"
              value={f.barcode}
              onChange={(e) => set({ barcode: e.target.value.replace(/\s/g, "") })}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); nameRef.current?.focus(); } }}
              placeholder={t("pos.scanOrType", "Scan or type…")}
            />
          </div>
        </div>
        <div>
          <label className="label">{t("pos.name", "Product name")}</label>
          <input ref={nameRef} className="input" value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder={t("pos.namePh", "e.g. Royal Canin Maxi Adult 4kg")} />
        </div>
        <div>
          <label className="label">{t("pos.category", "Category")}</label>
          <select className="input" value={f.category} onChange={(e) => set({ category: e.target.value })}>
            <option value="">{t("pos.categoryPick", "Select a category…")}</option>
            {CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("pos.purchasePrice", "Purchase price")}</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={f.purchase_price} onChange={(e) => set({ purchase_price: e.target.value })} placeholder="0.00" />
          </div>
          <div>
            <label className="label">{t("pos.sellPrice", "Sell price")}</label>
            <input type="number" inputMode="decimal" min="0" step="0.01" className="input" value={f.sell_price} onChange={(e) => set({ sell_price: e.target.value })} placeholder="0.00" />
          </div>
        </div>
        {hasPrices && (
          <div className={cn(
            "flex items-center justify-between rounded-xl px-3 py-2",
            profit > 0 ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200"
              : profit < 0 ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-200"
                : "bg-surface-2 text-ink-muted",
          )}>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <TrendingUp size={15} className={profit < 0 ? "rotate-180" : ""} />
              {profit < 0 ? t("pos.lossPerUnit", "Loss per unit") : t("pos.profitPerUnit", "Profit per unit")}
            </span>
            <span className="text-sm font-bold tabular-nums">
              {money(profit)}{sell > 0 ? ` · ${marginPct}%` : ""}
            </span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("pos.stock", "Stock")}</label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="label flex items-center gap-1"><AlertTriangle size={12} /> {t("pos.minStock", "Min. stock alert")}</label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.min_stock} onChange={(e) => set({ min_stock: e.target.value })} placeholder="0" />
          </div>
        </div>
        <div>
          <label className="label">{t("pos.expiry", "Expiry date")}</label>
          <input type="date" className="input" value={f.expiry_date} onChange={(e) => set({ expiry_date: e.target.value })} />
        </div>
        <Button className="mt-1 w-full" disabled={!f.name.trim()} loading={busy} onClick={save}>{t("common.save", "Save")}</Button>
      </div>
    </Modal>
  );
}

/* ---------------- Sales ---------------- */
function SalesTab({ invoices }: { invoices: Invoice[] }) {
  const { t, i18n } = useTranslation();
  const totals = useMemo(() => ({
    revenue: invoices.reduce((s, i) => s + i.total, 0),
    profit: invoices.reduce((s, i) => s + i.profit, 0),
    count: invoices.length,
  }), [invoices]);

  if (invoices.length === 0) return <div className="card p-10 text-center text-ink-subtle">{t("pos.noSales", "No sales yet. Completed checkouts appear here.")}</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Kpi icon={Receipt} tone="brand" label={t("pos.salesCount", "Sales")} value={String(totals.count)} />
        <Kpi icon={ShoppingCart} tone="accent" label={t("pos.revenue", "Revenue")} value={money(totals.revenue)} />
        <Kpi icon={TrendingUp} tone="success" label={t("pos.profit", "Profit")} value={money(totals.profit)} />
      </div>
      <div className="space-y-2">
        {invoices.map((inv) => (
          <div key={inv.id} className="card flex items-center gap-3 p-3.5">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-subtle"><Receipt size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-ink">{t("pos.itemsSold", { n: inv.item_count, defaultValue: "{{n}} items sold" })}</p>
              <p className="text-xs text-ink-subtle">{formatDate(inv.created_at, i18n.language)} · {new Date(inv.created_at).toLocaleTimeString(i18n.language === "ar" ? "ar-EG" : undefined, { hour: "2-digit", minute: "2-digit" })}</p>
            </div>
            <div className="text-end">
              <p className="font-display font-bold text-ink tabular-nums">{money(inv.total)}</p>
              <p className="flex items-center justify-end gap-1 text-xs text-success-600"><TrendingUp size={11} /> {money(inv.profit)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
