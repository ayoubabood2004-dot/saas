import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Barcode, Package, Trash2, Search,
  TrendingUp, AlertTriangle, CalendarClock, Pencil, PackagePlus, Boxes, Layers,
} from "lucide-react";
import type { Product, ProductCategory } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";
import { ExpiryInput } from "@/components/ExpiryInput";
import { Combobox } from "@/components/Combobox";
import { subcategoriesOf } from "@/lib/promotions";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { cn, formatDate, money } from "@/lib/utils";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";

const LOW_STOCK = 5;
const daysUntil = (iso?: string | null) => (iso ? Math.floor((new Date(iso).getTime() - Date.now()) / 86400000) : null);
/** A product's reorder level — its own min_stock if set, else the default. */
const lowThreshold = (p: Product) => (p.min_stock && p.min_stock > 0 ? p.min_stock : LOW_STOCK);

/**
 * Inventory — dedicated stock management: products, add/edit, low-stock & expiry
 * alerts. Point-of-sale lives in the separate "Retail & Sales" module.
 */
export function Inventory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id; // shared workspace id (manager's id for staff)
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  const mounted = useRef(true);
  const load = async () => {
    try {
      const p = await withTimeout(repo.listProducts(clinicId), 15000);
      if (!mounted.current) return;
      setProducts(p);
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

  const lowStock = products.filter((p) => p.stock <= lowThreshold(p)).length;
  const expiringSoon = products.filter((p) => { const d = daysUntil(p.expiry_date); return d != null && d >= 0 && d <= 30; }).length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Boxes size={24} /></span>
        <div>
          <h1 className="font-display text-2xl font-extrabold text-ink">{t("pos.title", "Inventory")}</h1>
          <p className="text-sm text-ink-subtle">{t("pos.subtitle", "Stock, products & low-stock alerts — for this clinic only.")}</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Kpi icon={Package} tone="brand" label={t("pos.products", "Products")} value={String(products.length)} />
        <Kpi icon={AlertTriangle} tone={lowStock ? "warn" : "success"} label={t("pos.lowStock", "Low stock")} value={String(lowStock)} />
        <Kpi icon={CalendarClock} tone={expiringSoon ? "warn" : "success"} label={t("pos.expiringSoon", "Expiring ≤30d")} value={String(expiringSoon)} />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : (
        <InventoryTab products={products} clinicId={clinicId} onChanged={load} />
      )}
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

      <ProductModal open={adding || !!editing} product={editing} clinicId={clinicId} subcategories={subcategoriesOf(products)} onClose={() => { setAdding(false); setEditing(null); }} onSaved={() => { setAdding(false); setEditing(null); onChanged(); }} />
    </div>
  );
}

function ProductModal({ open, product, clinicId, subcategories, onClose, onSaved }: { open: boolean; product: Product | null; clinicId?: string; subcategories: string[]; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const blank = { barcode: "", name: "", category: "", subcategory: "", purchase_price: "", sell_price: "", stock: "", min_stock: "", expiry_date: "", has_sub_unit: false, sub_unit_name: "", units_per_box: "", sub_unit_price: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setF({
        barcode: product.barcode ?? "", name: product.name, category: product.category ?? "",
        subcategory: product.subcategory ?? "",
        purchase_price: String(product.purchase_price), sell_price: String(product.sell_price),
        stock: String(product.stock), min_stock: product.min_stock ? String(product.min_stock) : "",
        expiry_date: product.expiry_date ?? "",
        has_sub_unit: !!product.has_sub_unit,
        sub_unit_name: product.sub_unit_name ?? "",
        units_per_box: product.units_per_box ? String(product.units_per_box) : "",
        sub_unit_price: product.sub_unit_price != null ? String(product.sub_unit_price) : "",
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
    // A sub-unit needs a positive units-per-box to be meaningful; otherwise it's off.
    const unitsPerBox = Math.max(0, Number(f.units_per_box) || 0);
    const subUnitOn = f.has_sub_unit && unitsPerBox > 0;
    if (f.has_sub_unit && unitsPerBox <= 0) {
      toast.error(t("pos.subUnitNeedsCount", "أدخل عدد الوحدات في العلبة (أكبر من صفر)"));
      return;
    }
    setBusy(true);
    try {
      const payload = {
        barcode: f.barcode.trim() || null,
        name: f.name.trim(),
        category: (f.category || null) as ProductCategory | null,
        subcategory: f.subcategory.trim() || null,
        purchase_price: Number(f.purchase_price) || 0,
        sell_price: Number(f.sell_price) || 0,
        stock: Math.max(0, Math.round((Number(f.stock) || 0) * 1000) / 1000),
        min_stock: Math.max(0, Math.round(Number(f.min_stock) || 0)),
        expiry_date: f.expiry_date || null,
        has_sub_unit: subUnitOn,
        sub_unit_name: subUnitOn ? (f.sub_unit_name.trim() || "وحدة") : null,
        units_per_box: subUnitOn ? unitsPerBox : null,
        sub_unit_price: subUnitOn ? (Number(f.sub_unit_price) || 0) : null,
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
        <div>
          <label className="label">{t("pos.subcategory", "Subcategory")} <span className="font-normal text-ink-subtle">{t("pos.subcategoryHint", "(for offers — e.g. canned, litter)")}</span></label>
          <Combobox
            value={f.subcategory}
            onChange={(v) => set({ subcategory: v })}
            options={subcategories}
            placeholder={t("pos.subcategoryPh", "e.g. معلبات, رمل, دراي فود")}
            createLabel={(q) => t("pos.subcategoryCreate", { value: q, defaultValue: `Use “${q}”` })}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t("pos.purchasePrice", "Purchase price")}</label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.purchase_price} onChange={(e) => set({ purchase_price: e.target.value })} placeholder="0" />
          </div>
          <div>
            <label className="label">{t("pos.sellPrice", "Sell price")}</label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.sell_price} onChange={(e) => set({ sell_price: e.target.value })} placeholder="0" />
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

        {/* Sub-unit (fractional) sales — sell the whole box or break it into singles */}
        <div className="rounded-xl border border-line bg-surface-2/40 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-sm font-semibold text-ink">
              <Layers size={16} className="text-brand-600" /> {t("pos.subUnitToggle", "يحتوي على وحدات فرعية (مفرد)")}
            </span>
            <button
              type="button" role="switch" aria-checked={f.has_sub_unit}
              onClick={() => { playTap(); set({ has_sub_unit: !f.has_sub_unit }); }}
              className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition", f.has_sub_unit ? "bg-brand-600" : "bg-surface-3")}
            >
              <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", f.has_sub_unit ? "ltr:translate-x-5 rtl:-translate-x-5" : "ltr:translate-x-0.5 rtl:-translate-x-0.5")} />
            </button>
          </div>
          <p className="mt-1 text-2xs text-ink-subtle">{t("pos.subUnitHint", "بِع العلبة كاملة أو جزّئها (حبة، شريط، مل…) من نفس المخزون.")}</p>
          {f.has_sub_unit && (
            <div className="mt-3 space-y-3">
              <div>
                <label className="label">{t("pos.subUnitName", "اسم الوحدة الفرعية")}</label>
                <input className="input" value={f.sub_unit_name} onChange={(e) => set({ sub_unit_name: e.target.value })} placeholder={t("pos.subUnitNamePh", "مثال: حبة، شريط، مل")} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t("pos.unitsPerBox", "عدد الوحدات في العلبة")}</label>
                  <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.units_per_box} onChange={(e) => set({ units_per_box: e.target.value })} placeholder="مثال: 20" />
                </div>
                <div>
                  <label className="label">{t("pos.subUnitPrice", "سعر الوحدة الواحدة")}</label>
                  <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.sub_unit_price} onChange={(e) => set({ sub_unit_price: e.target.value })} placeholder="0" />
                </div>
              </div>
              {Number(f.units_per_box) > 0 && Number(f.sell_price) > 0 && (
                <p className="rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-muted">
                  {t("pos.subUnitDerived", {
                    box: money(Number(f.sell_price)), n: Number(f.units_per_box),
                    each: money(Math.round((Number(f.sell_price) / Number(f.units_per_box)) * 100) / 100),
                    defaultValue: "سعر العلبة {{box}} ÷ {{n}} ≈ {{each}} للوحدة الواحدة",
                  })}
                </p>
              )}
            </div>
          )}
        </div>

        <div>
          <label className="label">{t("pos.expiry", "Expiry date")} <span className="font-normal text-ink-subtle">{t("pos.expiryHint", "(DD/MM/YYYY)")}</span></label>
          <ExpiryInput
            id="product-expiry"
            value={f.expiry_date}
            onChange={(iso) => set({ expiry_date: iso })}
            onComplete={() => saveRef.current?.focus()}
            invalidLabel={t("pos.expiryInvalid", "Enter a valid date")}
          />
        </div>
        <Button ref={saveRef} className="mt-1 w-full" disabled={!f.name.trim()} loading={busy} onClick={save}>{t("common.save", "Save")}</Button>
      </div>
    </Modal>
  );
}
