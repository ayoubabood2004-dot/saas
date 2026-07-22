import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Barcode, Package, Trash2, Search, Building2, Plus, ChevronLeft, ArrowRight, ArrowLeft,
  TrendingUp, AlertTriangle, CalendarClock, Pencil, PackagePlus, Boxes, Layers, Wallet, ShoppingBag, FolderTree,
} from "lucide-react";
import type { Product, ProductCategory, Company, CompanySection } from "@/types";
import { PurchasesTab, PurchaseBuilderModal } from "@/components/inventory/Purchases";
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

/** Canonical company name: trim, collapse internal whitespace, NFC-normalize
 *  (so visually-identical Arabic/Latin names don't split into two companies). */
const normName = (s: string) => s.trim().replace(/\s+/g, " ").normalize("NFC");
/** Case-insensitive match key for a company name. */
const normKey = (s: string) => normName(s).toLowerCase();

type View = "products" | "companies" | "purchases";

/**
 * Inventory — dedicated stock management: products, companies (الشركات),
 * add/edit, low-stock & expiry alerts. Point-of-sale lives in "Retail & Sales".
 */
export function Inventory() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id; // shared workspace id (manager's id for staff)
  const [products, setProducts] = useState<Product[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [sections, setSections] = useState<CompanySection[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<View>("products");

  const mounted = useRef(true);
  const load = async () => {
    try {
      const [p, c, s] = await Promise.all([
        withTimeout(repo.listProducts(clinicId), 15000),
        withTimeout(repo.listCompanies(clinicId), 15000).catch(() => [] as Company[]),
        withTimeout(repo.listCompanySections(undefined, clinicId), 15000).catch(() => [] as CompanySection[]),
      ]);
      if (!mounted.current) return;
      setProducts(p);
      setCompanies(c);
      setSections(s);
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

  // Pooled products carry no per-barcode count (they sell from the section pool),
  // so a stock of 0 is expected — never flag them as low stock.
  const lowStock = products.filter((p) => !p.pooled && p.stock <= lowThreshold(p)).length;
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
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={Package} tone="brand" label={t("pos.products", "Products")} value={String(products.length)} />
        <Kpi icon={Building2} tone="accent" label={t("pos.companies", "الشركات")} value={String(companies.length)} />
        <Kpi icon={AlertTriangle} tone={lowStock ? "warn" : "success"} label={t("pos.lowStock", "Low stock")} value={String(lowStock)} />
        <Kpi icon={CalendarClock} tone={expiringSoon ? "warn" : "success"} label={t("pos.expiringSoon", "Expiring ≤30d")} value={String(expiringSoon)} />
      </div>

      {/* Inventory value (قيمة المخزون) — cost, retail, expected profit; includes pooled. */}
      {!loading && <InventoryValueCard products={products} sections={sections} />}

      {/* View switch — products · companies (الشركات) · purchases (المشتريات) */}
      <div className="mb-4 inline-flex flex-wrap rounded-2xl bg-surface-2 p-1">
        <ViewTab active={view === "products"} icon={Package} label={t("pos.tabProducts", "المنتجات")} onClick={() => { playTap(); setView("products"); }} />
        <ViewTab active={view === "companies"} icon={Building2} label={t("pos.tabCompanies", "الشركات")} onClick={() => { playTap(); setView("companies"); }} />
        <ViewTab active={view === "purchases"} icon={ShoppingBag} label={t("pos.tabPurchases", "المشتريات")} onClick={() => { playTap(); setView("purchases"); }} />
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : view === "products" ? (
        <InventoryTab products={products} companies={companies} sections={sections} clinicId={clinicId} onChanged={load} />
      ) : view === "companies" ? (
        <CompaniesTab products={products} companies={companies} sections={sections} clinicId={clinicId} onChanged={load} />
      ) : (
        <PurchasesTab products={products} companies={companies} clinicId={clinicId} onChanged={load} />
      )}
    </div>
  );
}

function ViewTab({ active, icon: Icon, label, onClick }: { active: boolean; icon: typeof Package; label: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition",
        active ? "bg-surface-1 text-brand-700 shadow-soft dark:text-brand-200" : "text-ink-muted hover:text-ink",
      )}
    >
      <Icon size={16} /> {label}
    </button>
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

/* ---------------- Inventory value (قيمة المخزون) ---------------- */
/** Worth of the stock on hand — tracked products (stock × price) PLUS an estimate
 *  of each section's pooled (legacy) units valued at the average price of that
 *  section's barcodes (prices within a section are typically close). */
function computeInventoryValue(products: Product[], sections: CompanySection[]) {
  let trackedCost = 0, trackedRetail = 0;
  for (const p of products) {
    trackedCost += (p.stock || 0) * (p.purchase_price || 0);
    trackedRetail += (p.stock || 0) * (p.sell_price || 0);
  }
  let pooledCost = 0, pooledRetail = 0;
  for (const sec of sections) {
    const pool = sec.pooled_stock || 0;
    if (pool <= 0) continue;
    const inSec = products.filter((p) => p.section_id === sec.id);
    if (!inSec.length) continue;
    const avgBuy = inSec.reduce((s, p) => s + (p.purchase_price || 0), 0) / inSec.length;
    const avgSell = inSec.reduce((s, p) => s + (p.sell_price || 0), 0) / inSec.length;
    pooledCost += pool * avgBuy;
    pooledRetail += pool * avgSell;
  }
  const cost = trackedCost + pooledCost;
  const retail = trackedRetail + pooledRetail;
  return { cost, retail, profit: retail - cost, pooledCost, pooledRetail, hasPooled: pooledCost > 0 || pooledRetail > 0 };
}

function InventoryValueCard({ products, sections }: { products: Product[]; sections: CompanySection[] }) {
  const { t } = useTranslation();
  const v = useMemo(() => computeInventoryValue(products, sections), [products, sections]);
  return (
    <div className="card mb-5 overflow-hidden p-0">
      <div className="flex items-center gap-2 border-b border-line px-5 py-3">
        <span className="grid h-8 w-8 place-items-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Wallet size={16} /></span>
        <h3 className="text-sm font-bold text-ink">{t("pos.invValueTitle", "قيمة المخزون")}</h3>
        <span className="ms-auto text-2xs text-ink-subtle">{t("pos.invValueSub", "قيمة البضاعة الموجودة الآن")}</span>
      </div>
      <div className="grid grid-cols-1 divide-y divide-line sm:grid-cols-3 sm:divide-x sm:divide-y-0 rtl:sm:divide-x-reverse">
        <ValueCell label={t("pos.invValueCost", "رأس المال (شراء)")} value={money(Math.round(v.cost))} tone="ink" />
        <ValueCell label={t("pos.invValueRetail", "قيمة البيع")} value={money(Math.round(v.retail))} tone="brand" />
        <ValueCell label={t("pos.invValueProfit", "الربح المتوقع")} value={money(Math.round(v.profit))} tone="success" />
      </div>
      {v.hasPooled && (
        <div className="flex items-center gap-1.5 border-t border-line bg-surface-2/50 px-5 py-2.5 text-xs text-ink-subtle">
          <Layers size={13} className="shrink-0 text-brand-500" />
          {t("pos.invValueEstimated", { cost: money(Math.round(v.pooledCost)), retail: money(Math.round(v.pooledRetail)), defaultValue: "منها تقديري (مخزون مجمّع): {{cost}} شراء · {{retail}} بيع" })}
        </div>
      )}
    </div>
  );
}

function ValueCell({ label, value, tone }: { label: string; value: string; tone: "ink" | "brand" | "success" }) {
  const c = tone === "brand" ? "text-brand-600 dark:text-brand-300" : tone === "success" ? "text-success-600 dark:text-success-300" : "text-ink";
  return (
    <div className="px-5 py-4">
      <p className="text-xs text-ink-subtle">{label}</p>
      <p className={cn("mt-0.5 font-display text-xl font-extrabold tabular-nums", c)}>{value}</p>
    </div>
  );
}

/* ---------------- Shared product row ---------------- */
function ProductRow({ p, companyName, onEdit, onRemove }: { p: Product; companyName?: string; onEdit: () => void; onRemove: () => void }) {
  const { t, i18n } = useTranslation();
  const exp = daysUntil(p.expiry_date);
  const expired = exp != null && exp < 0;
  const expiringSoon = exp != null && exp >= 0 && exp <= 30;
  return (
    <motion.div variants={staggerItem} className="card flex items-center gap-3 p-3">
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-surface-2 text-ink-subtle"><Package size={20} /></span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 truncate text-sm font-semibold text-ink">
          {p.name}
          {companyName && <span className="chip shrink-0 bg-accent-50 text-2xs font-semibold text-accent-700 dark:bg-accent-500/15 dark:text-accent-200"><Building2 size={11} /> {companyName}</span>}
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
      {p.pooled ? (
        <Badge tone="brand"><Layers size={12} /> {t("pos.pooledItem", "مجمّع")}</Badge>
      ) : (
        <Badge tone={p.stock === 0 ? "danger" : p.stock <= lowThreshold(p) ? "warn" : "neutral"}>
          {t("pos.qtyStock", { n: p.stock, defaultValue: "{{n}} in stock" })}
        </Badge>
      )}
      <button onClick={onEdit} aria-label={t("common.edit", "Edit")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={16} /></button>
      <button onClick={onRemove} aria-label={t("common.delete", "Remove")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={16} /></button>
    </motion.div>
  );
}

/* ---------------- Products tab ---------------- */
function InventoryTab({ products, companies, sections, clinicId, onChanged }: { products: Product[]; companies: Company[]; sections: CompanySection[]; clinicId?: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [editing, setEditing] = useState<Product | null>(null);
  const [adding, setAdding] = useState(false);
  const [q, setQ] = useState("");

  const companyName = useMemo(() => {
    const m = new Map(companies.map((c) => [c.id, c.name]));
    return (id?: string | null) => (id ? m.get(id) : undefined);
  }, [companies]);

  const ql = q.trim().toLowerCase();
  const shown = ql
    ? products.filter((p) => p.name.toLowerCase().includes(ql) || (p.barcode ?? "").includes(ql) || (companyName(p.company_id) ?? "").toLowerCase().includes(ql))
    : products;

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
          {shown.map((p) => (
            <ProductRow key={p.id} p={p} companyName={companyName(p.company_id)} onEdit={() => { playTap(); setEditing(p); }} onRemove={() => remove(p)} />
          ))}
        </motion.div>
      )}

      <ProductModal
        open={adding || !!editing}
        product={editing}
        companies={companies}
        sections={sections}
        clinicId={clinicId}
        subcategories={subcategoriesOf(products)}
        onClose={() => { setAdding(false); setEditing(null); }}
        onSaved={() => { setAdding(false); setEditing(null); onChanged(); }}
      />
    </div>
  );
}

function ProductModal({ open, product, companies, sections, clinicId, subcategories, defaultCompanyName, defaultSectionName, onClose, onSaved }: {
  open: boolean; product: Product | null; companies: Company[]; sections: CompanySection[]; clinicId?: string; subcategories: string[];
  defaultCompanyName?: string; defaultSectionName?: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const blank = { barcode: "", name: "", company: "", section: "", category: "", subcategory: "", purchase_price: "", sell_price: "", stock: "", min_stock: "", expiry_date: "", pooled: false, has_sub_unit: false, sub_unit_name: "", units_per_box: "", sub_unit_price: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const barcodeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const saveRef = useRef<HTMLButtonElement>(null);
  // Companies/sections created inline during THIS modal session — merged into the
  // lookup so a retry after a failed save reuses the one just made (the props
  // lists only refresh after onSaved).
  const createdRef = useRef<Company[]>([]);
  const createdSecRef = useRef<CompanySection[]>([]);

  const companyNameOf = (id?: string | null) => (id ? companies.find((c) => c.id === id)?.name ?? "" : "");
  const sectionNameOf = (id?: string | null) => (id ? sections.find((s) => s.id === id)?.name ?? "" : "");

  useEffect(() => {
    if (!open) return;
    createdRef.current = [];
    createdSecRef.current = [];
    if (product) {
      setF({
        barcode: product.barcode ?? "", name: product.name,
        company: companyNameOf(product.company_id), section: sectionNameOf(product.section_id),
        category: product.category ?? "",
        subcategory: product.subcategory ?? "",
        purchase_price: String(product.purchase_price), sell_price: String(product.sell_price),
        stock: String(product.stock), min_stock: product.min_stock ? String(product.min_stock) : "",
        expiry_date: product.expiry_date ?? "",
        pooled: !!product.pooled,
        has_sub_unit: !!product.has_sub_unit,
        sub_unit_name: product.sub_unit_name ?? "",
        units_per_box: product.units_per_box ? String(product.units_per_box) : "",
        sub_unit_price: product.sub_unit_price != null ? String(product.sub_unit_price) : "",
      });
    } else {
      setF({ ...blank, company: defaultCompanyName ?? "", section: defaultSectionName ?? "" });
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
    // A company/section we create as a side effect of THIS save — rolled back if
    // the product write then fails, so no empty orphan is left behind.
    let createdCompany: Company | null = null;
    let createdSection: CompanySection | null = null;
    try {
      // Resolve the typed company name → id: reuse an existing/just-created
      // company (normalized, case-insensitive) or create a new one. Empty → none.
      let company_id: string | null = null;
      const typed = normName(f.company);
      if (typed) {
        const key = typed.toLowerCase();
        const existing = [...companies, ...createdRef.current].find((c) => normKey(c.name) === key);
        if (existing) {
          company_id = existing.id;
        } else {
          createdCompany = await repo.createCompany({ name: typed, note: null, clinic_id: clinicId ?? null });
          createdRef.current.push(createdCompany);
          company_id = createdCompany.id;
        }
      }
      // Resolve the section (صنف) WITHIN the resolved company. Only meaningful
      // when a company is set; reuse/create the same way as the company.
      let section_id: string | null = null;
      const secTyped = normName(f.section);
      if (company_id && secTyped) {
        const key = secTyped.toLowerCase();
        const existing = [...sections, ...createdSecRef.current].find((s) => s.company_id === company_id && normKey(s.name) === key);
        if (existing) {
          section_id = existing.id;
        } else {
          createdSection = await repo.createCompanySection({ company_id, name: secTyped, clinic_id: clinicId ?? null });
          createdSecRef.current.push(createdSection);
          section_id = createdSection.id;
        }
      }
      // "Pooled" (added without a count) only makes sense inside a section — it
      // draws from that section's pool. Force stock to 0 when pooled.
      const pooled = f.pooled && section_id != null;
      const payload = {
        barcode: f.barcode.trim() || null,
        name: f.name.trim(),
        company_id,
        section_id,
        pooled,
        category: (f.category || null) as ProductCategory | null,
        subcategory: f.subcategory.trim() || null,
        purchase_price: Number(f.purchase_price) || 0,
        sell_price: Number(f.sell_price) || 0,
        stock: pooled ? 0 : Math.max(0, Math.round((Number(f.stock) || 0) * 1000) / 1000),
        min_stock: Math.max(0, Math.round(Number(f.min_stock) || 0)),
        expiry_date: f.expiry_date || null,
        has_sub_unit: subUnitOn,
        sub_unit_name: subUnitOn ? (f.sub_unit_name.trim() || "وحدة") : null,
        units_per_box: subUnitOn ? unitsPerBox : null,
        sub_unit_price: subUnitOn ? (Number(f.sub_unit_price) || 0) : null,
      };
      // Flipping an existing TRACKED product to pooled would drop its real count
      // to 0 — fold that stock into the section pool first so nothing is lost.
      if (product && pooled && !product.pooled && (product.stock || 0) > 0 && section_id) {
        const sec = [...sections, ...createdSecRef.current].find((s) => s.id === section_id);
        const cur = sec?.pooled_stock ?? 0;
        await repo.updateCompanySection(section_id, { pooled_stock: Math.round((cur + (product.stock || 0)) * 1000) / 1000 });
      }
      if (product) await repo.updateProduct(product.id, payload);
      else await repo.createProduct({ ...payload, clinic_id: clinicId ?? null });
      playSuccess();
      onSaved();
    } catch (e) {
      // Undo a section/company created only for this now-failed product. If the
      // cleanup fails, keep it in the ref so a retry reuses it (no duplicate).
      if (createdSection) {
        const cs = createdSection;
        try { await repo.deleteCompanySection(cs.id); createdSecRef.current = createdSecRef.current.filter((s) => s.id !== cs.id); }
        catch { /* best effort */ }
      }
      if (createdCompany) {
        const cc = createdCompany;
        try { await repo.deleteCompany(cc.id); createdRef.current = createdRef.current.filter((c) => c.id !== cc.id); }
        catch { /* best effort */ }
      }
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
        {/* Company (الشركة) — pick an existing one or create a new one by typing. */}
        <div>
          <label className="label flex items-center gap-1"><Building2 size={12} /> {t("pos.company", "الشركة")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
          <Combobox
            value={f.company}
            onChange={(v) => set({ company: v, section: "" })}
            options={companies.map((c) => c.name)}
            placeholder={t("pos.companyPh", "اختر شركة أو أنشئ واحدة…")}
            icon={<Building2 size={16} />}
            createLabel={(v) => t("pos.companyCreate", { value: v, defaultValue: `إنشاء شركة “${v}”` })}
          />
        </div>
        {/* Section (الصنف) — a group INSIDE the chosen company. Only when a company is set. */}
        {f.company.trim() && (() => {
          const co = [...companies, ...createdRef.current].find((c) => normKey(c.name) === normKey(f.company));
          const secOptions = co ? sections.filter((s) => s.company_id === co.id).map((s) => s.name) : [];
          return (
            <div>
              <label className="label flex items-center gap-1"><FolderTree size={12} /> {t("pos.section", "الصنف")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
              <Combobox
                value={f.section}
                onChange={(v) => set({ section: v })}
                options={secOptions}
                placeholder={t("pos.sectionPh", "اختر صنفاً أو أنشئ واحداً…")}
                icon={<FolderTree size={16} />}
                createLabel={(v) => t("pos.sectionCreate", { value: v, defaultValue: `إنشاء صنف “${v}”` })}
              />
            </div>
          );
        })()}
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
        {/* Pooled (add without a count) — only inside a section. The item then
            sells from the section's shared pool instead of its own stock. */}
        {f.section.trim() && (
          <div className="rounded-xl border border-line bg-surface-2/40 p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-ink">
                <Layers size={16} className="text-brand-600" /> {t("pos.pooledToggle", "بدون كمية — ضمن مخزون الصنف المجمّع")}
              </span>
              <button
                type="button" role="switch" aria-checked={f.pooled}
                onClick={() => { playTap(); set({ pooled: !f.pooled }); }}
                className={cn("relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition", f.pooled ? "bg-brand-600" : "bg-surface-3")}
              >
                <span className={cn("inline-block h-5 w-5 transform rounded-full bg-white shadow transition", f.pooled ? "ltr:translate-x-5 rtl:-translate-x-5" : "ltr:translate-x-0.5 rtl:-translate-x-0.5")} />
              </button>
            </div>
            <p className="mt-1 text-2xs text-ink-subtle">{t("pos.pooledHint", "لا نعرف كميته بالضبط — يُباع من مخزون الصنف المجمّع حتى يجيه شراء بكمية محددة.")}</p>
          </div>
        )}
        <div className={cn("grid gap-3", f.pooled && f.section.trim() ? "grid-cols-1" : "grid-cols-2")}>
          {!(f.pooled && f.section.trim()) && (
          <div>
            <label className="label">{t("pos.stock", "Stock")}</label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input" value={f.stock} onChange={(e) => set({ stock: e.target.value })} placeholder="0" />
          </div>
          )}
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

/* ---------------- Companies tab (الشركات) ---------------- */
type CompanyStats = { count: number; units: number; value: number };

function statsBy(products: Product[], pred: (p: Product) => boolean): CompanyStats {
  let count = 0, units = 0, value = 0;
  for (const p of products) {
    if (!pred(p)) continue;
    count += 1;
    units += p.stock || 0;
    value += (p.stock || 0) * (p.sell_price || 0);
  }
  return { count, units, value };
}
const statsFor = (products: Product[], companyId: string) => statsBy(products, (p) => p.company_id === companyId);

function CompaniesTab({ products, companies, sections, clinicId, onChanged }: { products: Product[]; companies: Company[]; sections: CompanySection[]; clinicId?: string; onChanged: () => void }) {
  const { t } = useTranslation();
  const [q, setQ] = useState("");
  const [adding, setAdding] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Always derive the selected company from the live list so edits/reloads reflect.
  const selected = selectedId ? companies.find((c) => c.id === selectedId) ?? null : null;

  if (selected) {
    return (
      <CompanyDetail
        company={selected}
        products={products}
        companies={companies}
        sections={sections}
        clinicId={clinicId}
        onBack={() => setSelectedId(null)}
        onChanged={onChanged}
      />
    );
  }

  const ql = q.trim().toLowerCase();
  const shown = ql ? companies.filter((c) => c.name.toLowerCase().includes(ql)) : companies;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("pos.searchCompanies", "ابحث عن شركة…")} />
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setAdding(true); }}>{t("pos.addCompany", "أضف شركة")}</Button>
      </div>

      {shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-accent-50 text-accent-500 dark:bg-accent-500/15"><Building2 size={26} /></span>
          <p className="text-ink-subtle">{companies.length === 0 ? t("pos.noCompanies", "لا توجد شركات بعد. أنشئ أول شركة ثم أضف باركوداتها.") : t("pos.noCompanyMatch", "لا توجد شركة بهذا الاسم.")}</p>
          {companies.length === 0 && <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setAdding(true); }}>{t("pos.addCompany", "أضف شركة")}</Button>}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((c) => {
            const s = statsFor(products, c.id);
            return (
              <motion.button
                key={c.id}
                variants={staggerItem}
                onClick={() => { playTap(); setSelectedId(c.id); }}
                className="card group flex flex-col gap-3 p-4 text-start transition hover:shadow-raised"
              >
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent-grad text-white shadow-soft"><Building2 size={22} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-base font-bold text-ink">{c.name}</p>
                    {c.note ? <p className="truncate text-xs text-ink-subtle">{c.note}</p> : <p className="text-xs text-ink-subtle">{t("pos.companyProducts", { n: s.count, defaultValue: "{{n}} منتج" })}</p>}
                  </div>
                  <ChevronLeft size={18} className="shrink-0 text-ink-subtle transition group-hover:text-brand-600 rtl:rotate-0 ltr:rotate-180" />
                </div>
                <div className="grid grid-cols-3 gap-2 border-t border-line pt-3">
                  <Stat icon={Barcode} label={t("pos.barcodesShort", "باركود")} value={String(s.count)} />
                  <Stat icon={Package} label={t("pos.unitsShort", "قطعة")} value={String(s.units)} />
                  <Stat icon={Wallet} label={t("pos.valueShort", "قيمة")} value={money(s.value)} />
                </div>
              </motion.button>
            );
          })}
        </motion.div>
      )}

      <CompanyModal open={adding} company={null} companies={companies} clinicId={clinicId} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); onChanged(); }} />
    </div>
  );
}

function Stat({ icon: Icon, label, value }: { icon: typeof Package; label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="flex items-center gap-1 text-2xs text-ink-subtle"><Icon size={11} /> {label}</p>
      <p className="truncate text-sm font-bold text-ink tabular-nums">{value}</p>
    </div>
  );
}

/** Sentinel for the "no section" (بدون صنف) bucket inside a company. */
const UNCAT = "__uncat__";

function CompanyDetail({ company, products, companies, sections, clinicId, onBack, onChanged }: {
  company: Company; products: Product[]; companies: Company[]; sections: CompanySection[]; clinicId?: string; onBack: () => void; onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [editingCo, setEditingCo] = useState(false);
  const [purchasing, setPurchasing] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [editingSection, setEditingSection] = useState<CompanySection | null>(null);
  // Which section is open (a section id, or the UNCAT bucket). null = sections overview.
  const [openSectionId, setOpenSectionId] = useState<string | null>(null);

  const Back = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;
  const mine = products.filter((p) => p.company_id === company.id);
  const mySections = sections.filter((s) => s.company_id === company.id);
  const uncatProducts = mine.filter((p) => !p.section_id);
  const s = statsFor(products, company.id);

  const pooledTotal = mySections.reduce((n, sec) => n + (sec.pooled_stock ?? 0), 0);
  const removeCompany = async () => {
    // Deleting a company removes its sections too — which would erase any pooled
    // (legacy) counts they hold. Warn loudly and require an explicit confirmation.
    const msg = pooledTotal > 0
      ? t("pos.confirmDeleteCompanyPooled", { name: company.name, sections: mySections.length, n: pooledTotal, defaultValue: "حذف شركة \"{{name}}\"؟\n\nتحذير: فيها {{sections}} صنف ومخزون مجمّع مقداره {{n}} — هذا العدد سيُحذف نهائياً. المنتجات تبقى لكن بدون شركة ولا مخزون مجمّع.\n\nمتأكد؟" })
      : t("pos.confirmDeleteCompany", { name: company.name, defaultValue: "حذف شركة \"{{name}}\"؟ ستبقى المنتجات لكن بدون شركة." });
    if (!window.confirm(msg)) return;
    try { await repo.deleteCompany(company.id); playSuccess(); onChanged(); onBack(); }
    catch (e) { toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
  };

  // Drilled into a specific section (or the uncategorized bucket).
  const openSection = openSectionId === UNCAT ? UNCAT : mySections.find((x) => x.id === openSectionId) ?? null;
  if (openSectionId && (openSection === UNCAT || openSection)) {
    return (
      <SectionProducts
        company={company}
        section={openSection === UNCAT ? null : openSection}
        products={products}
        companies={companies}
        sections={sections}
        clinicId={clinicId}
        onBack={() => setOpenSectionId(null)}
        onEditSection={openSection !== UNCAT && openSection ? () => setEditingSection(openSection) : undefined}
        onChanged={onChanged}
      >
        {editingSection && (
          <SectionModal open company={company} section={editingSection} sections={sections} clinicId={clinicId} onClose={() => setEditingSection(null)} onSaved={() => { setEditingSection(null); onChanged(); }} />
        )}
      </SectionProducts>
    );
  }

  return (
    <div className="space-y-4">
      <button onClick={() => { playTap(); onBack(); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition hover:text-brand-600">
        <Back size={16} /> {t("pos.backToCompanies", "كل الشركات")}
      </button>

      {/* Company header */}
      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-accent-grad text-white shadow-soft"><Building2 size={28} /></span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate font-display text-xl font-extrabold text-ink">{company.name}</h2>
          {company.note && <p className="truncate text-sm text-ink-subtle">{company.note}</p>}
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-subtle">
            <span>{t("pos.companySections", { n: mySections.length, defaultValue: "{{n}} صنف" })}</span>
            <span>·</span>
            <span>{t("pos.companyProducts", { n: s.count, defaultValue: "{{n}} منتج" })}</span>
            <span>·</span>
            <span className="font-semibold text-ink-muted">{money(s.value)}</span>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => { playTap(); setEditingCo(true); }} aria-label={t("common.edit", "Edit")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={16} /></button>
          <button onClick={removeCompany} aria-label={t("common.delete", "Delete")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><Trash2 size={16} /></button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-ink-muted">{t("pos.sections", "الأصناف")}</p>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="secondary" leftIcon={<ShoppingBag size={15} />} onClick={() => { playTap(); setPurchasing(true); }}>{t("purchase.new", "فاتورة شراء")}</Button>
          <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => { playTap(); setAddingSection(true); }}>{t("pos.addSection", "أضف صنف")}</Button>
        </div>
      </div>

      {mySections.length === 0 && uncatProducts.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><FolderTree size={26} /></span>
          <p className="text-ink-subtle">{t("pos.noSections", "لا توجد أصناف بعد. أنشئ صنفاً (مثلاً دراي فود) ثم أضف باركوداته.")}</p>
          <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setAddingSection(true); }}>{t("pos.addSection", "أضف صنف")}</Button>
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {mySections.map((sec) => {
            const base = statsBy(products, (p) => p.section_id === sec.id);
            // Section total units include the pooled (legacy) count.
            const st = { ...base, units: base.units + (sec.pooled_stock ?? 0) };
            return (
              <SectionCard key={sec.id} icon={FolderTree} title={sec.name} stats={st} onOpen={() => { playTap(); setOpenSectionId(sec.id); }} onEdit={() => { playTap(); setEditingSection(sec); }} />
            );
          })}
          {uncatProducts.length > 0 && (
            <SectionCard
              icon={Package}
              title={t("pos.uncategorized", "بدون صنف")}
              muted
              stats={statsBy(products, (p) => p.company_id === company.id && !p.section_id)}
              onOpen={() => { playTap(); setOpenSectionId(UNCAT); }}
            />
          )}
        </motion.div>
      )}

      {/* Edit company */}
      <CompanyModal open={editingCo} company={company} companies={companies} clinicId={clinicId} onClose={() => setEditingCo(false)} onSaved={() => { setEditingCo(false); onChanged(); }} />

      {/* Add / edit a section */}
      <SectionModal open={addingSection} company={company} section={null} sections={sections} clinicId={clinicId} onClose={() => setAddingSection(false)} onSaved={() => { setAddingSection(false); onChanged(); }} />
      {editingSection && !openSectionId && (
        <SectionModal open company={company} section={editingSection} sections={sections} clinicId={clinicId} onClose={() => setEditingSection(null)} onSaved={() => { setEditingSection(null); onChanged(); }} />
      )}

      {/* Purchase invoice pre-filled with this company */}
      <PurchaseBuilderModal open={purchasing} products={products} companies={companies} clinicId={clinicId} defaultCompanyName={company.name} onClose={() => setPurchasing(false)} onSaved={() => { setPurchasing(false); onChanged(); }} />
    </div>
  );
}

function SectionCard({ icon: Icon, title, stats, muted, onOpen, onEdit }: { icon: typeof Package; title: string; stats: CompanyStats; muted?: boolean; onOpen: () => void; onEdit?: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="card group relative flex flex-col gap-3 p-4">
      <button onClick={onOpen} className="flex items-center gap-3 text-start">
        <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-white shadow-soft", muted ? "bg-slate-400 dark:bg-slate-600" : "bg-brand-grad")}><Icon size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-bold text-ink">{title}</p>
          <p className="text-xs text-ink-subtle">{t("pos.companyProducts", { n: stats.count, defaultValue: "{{n}} منتج" })}</p>
        </div>
        <ChevronLeft size={18} className="shrink-0 text-ink-subtle transition group-hover:text-brand-600 rtl:rotate-0 ltr:rotate-180" />
      </button>
      <button onClick={onOpen} className="grid grid-cols-3 gap-2 border-t border-line pt-3 text-start">
        <Stat icon={Barcode} label={t("pos.barcodesShort", "باركود")} value={String(stats.count)} />
        <Stat icon={Package} label={t("pos.unitsShort", "قطعة")} value={String(stats.units)} />
        <Stat icon={Wallet} label={t("pos.valueShort", "قيمة")} value={money(stats.value)} />
      </button>
      {onEdit && (
        <button onClick={onEdit} aria-label={t("common.edit", "Edit")} className="absolute end-3 top-3 grid h-7 w-7 place-items-center rounded-full text-ink-subtle opacity-0 transition hover:bg-surface-2 hover:text-brand-600 group-hover:opacity-100"><Pencil size={14} /></button>
      )}
    </div>
  );
}

/** Products inside one section (or the uncategorized bucket) of a company. */
function SectionProducts({ company, section, products, companies, sections, clinicId, onBack, onEditSection, onChanged, children }: {
  company: Company; section: CompanySection | null; products: Product[]; companies: Company[]; sections: CompanySection[];
  clinicId?: string; onBack: () => void; onEditSection?: () => void; onChanged: () => void; children?: ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [addingProduct, setAddingProduct] = useState(false);
  const [poolOpen, setPoolOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const Back = i18n.dir() === "rtl" ? ArrowRight : ArrowLeft;
  const mine = section
    ? products.filter((p) => p.section_id === section.id)
    : products.filter((p) => p.company_id === company.id && !p.section_id);
  const title = section ? section.name : t("pos.uncategorized", "بدون صنف");
  const pool = section?.pooled_stock ?? 0;
  const trackedUnits = mine.reduce((n, p) => n + (p.pooled ? 0 : p.stock || 0), 0);
  const estTotal = pool + trackedUnits;

  const removeProduct = async (p: Product) => {
    if (!window.confirm(t("pos.confirmDelete", { name: p.name, defaultValue: "Remove \"{{name}}\" from inventory?" }))) return;
    try { await repo.deleteProduct(p.id); playSuccess(); onChanged(); }
    catch (e) { toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined); }
  };

  return (
    <div className="space-y-4">
      <button onClick={() => { playTap(); onBack(); }} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ink-muted transition hover:text-brand-600">
        <Back size={16} /> {company.name}
      </button>

      <div className="card flex flex-wrap items-center gap-4 p-5">
        <span className={cn("grid h-12 w-12 shrink-0 place-items-center rounded-2xl text-white shadow-soft", section ? "bg-brand-grad" : "bg-slate-400 dark:bg-slate-600")}>{section ? <FolderTree size={24} /> : <Package size={24} />}</span>
        <div className="min-w-0 flex-1">
          <p className="text-2xs font-semibold uppercase tracking-wide text-ink-subtle">{company.name}</p>
          <h2 className="truncate font-display text-xl font-extrabold text-ink">{title}</h2>
        </div>
        {section && onEditSection && (
          <button onClick={() => { playTap(); onEditSection(); }} aria-label={t("common.edit", "Edit")} className="grid h-9 w-9 place-items-center rounded-full text-ink-subtle transition hover:bg-brand-50 hover:text-brand-600"><Pencil size={16} /></button>
        )}
        <Button size="sm" leftIcon={<PackagePlus size={15} />} onClick={() => { playTap(); setAddingProduct(true); }}>{t("pos.addBarcode", "أضف باركود")}</Button>
      </div>

      {/* Pooled (legacy) stock for the section — the "we have ~N of these but don't
          know the per-barcode split" total. Editable (a stock-count / جرد). */}
      {section && (
        <div className="card flex flex-wrap items-center gap-4 p-4">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><Layers size={20} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-ink">{t("pos.pooledStock", "المخزون المجمّع للصنف")}</p>
            <p className="text-xs text-ink-subtle">{t("pos.pooledStockHint", "عدد تقديري مجهول التوزيع — يُخصم منه أولاً عند البيع.")}</p>
          </div>
          <div className="text-end">
            <p className="text-2xl font-extrabold text-brand-600 tabular-nums dark:text-brand-300">{pool}</p>
            {trackedUnits > 0 && <p className="text-2xs text-ink-subtle">{t("pos.estTotal", { n: estTotal, defaultValue: "الإجمالي التقديري {{n}}" })}</p>}
          </div>
          <Button size="sm" variant="secondary" leftIcon={<Pencil size={15} />} onClick={() => { playTap(); setPoolOpen(true); }}>{t("pos.setPool", "تعديل / جرد")}</Button>
        </div>
      )}

      {mine.length === 0 ? (
        <div className="card p-10 text-center text-ink-subtle">{t("pos.noCompanyBarcodes", "لا توجد باركودات في هذا الصنف بعد. أضف أول باركود.")}</div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {mine.map((p) => (
            <ProductRow key={p.id} p={p} onEdit={() => { playTap(); setEditing(p); }} onRemove={() => removeProduct(p)} />
          ))}
        </motion.div>
      )}

      {/* Add/edit a product filed under this company + section */}
      <ProductModal
        open={addingProduct || !!editing}
        product={editing}
        companies={companies}
        sections={sections}
        clinicId={clinicId}
        subcategories={subcategoriesOf(products)}
        defaultCompanyName={company.name}
        defaultSectionName={section ? section.name : ""}
        onClose={() => { setAddingProduct(false); setEditing(null); }}
        onSaved={() => { setAddingProduct(false); setEditing(null); onChanged(); }}
      />
      {section && <SetPoolModal open={poolOpen} section={section} onClose={() => setPoolOpen(false)} onSaved={() => { setPoolOpen(false); onChanged(); }} />}
      {children}
    </div>
  );
}

/** Set / adjust a section's pooled (legacy) stock total — a stock-count (جرد). */
function SetPoolModal({ open, section, onClose, onSaved }: { open: boolean; section: CompanySection; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [val, setVal] = useState("");
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setVal(String(section.pooled_stock ?? 0));
    setTimeout(() => ref.current?.select(), 80);
  }, [open, section]);

  const save = async () => {
    if (busy) return;
    const n = Math.max(0, Math.round((Number(val) || 0) * 1000) / 1000);
    setBusy(true);
    try {
      await repo.updateCompanySection(section.id, { pooled_stock: n });
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
    <Modal open={open} onClose={onClose} title={t("pos.setPoolTitle", "المخزون المجمّع — {{name}}", { name: section.name })}>
      <div className="space-y-3">
        <p className="text-sm text-ink-subtle">{t("pos.setPoolBody", "حدّد العدد الكلي التقديري لبضاعة هذا الصنف. البيع يخصم منه أولاً، والشراء بكمية محددة يبدأ التتبّع الدقيق.")}</p>
        <div>
          <label className="label flex items-center gap-1"><Layers size={12} /> {t("pos.pooledStock", "المخزون المجمّع للصنف")}</label>
          <input ref={ref} type="number" inputMode="numeric" min="0" step="1" className="input text-lg font-bold" value={val} onChange={(e) => setVal(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} placeholder="0" />
        </div>
        <Button className="mt-1 w-full" loading={busy} onClick={save}>{t("common.save", "Save")}</Button>
      </div>
    </Modal>
  );
}

/** Create / edit a section (صنف) inside a company. */
function SectionModal({ open, company, section, sections, clinicId, onClose, onSaved }: {
  open: boolean; company: Company; section: CompanySection | null; sections: CompanySection[]; clinicId?: string; onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(section?.name ?? "");
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open, section]);

  const save = async () => {
    if (!name.trim() || busy) return;
    // No two sections with the same (normalized) name inside one company.
    const key = normKey(name);
    if (sections.some((s) => s.company_id === company.id && s.id !== section?.id && normKey(s.name) === key)) {
      toast.error(t("pos.sectionDup", "يوجد صنف بهذا الاسم في هذه الشركة"));
      return;
    }
    setBusy(true);
    try {
      if (section) await repo.updateCompanySection(section.id, { name: normName(name) });
      else await repo.createCompanySection({ company_id: company.id, name: normName(name), clinic_id: clinicId ?? null });
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
    <Modal open={open} onClose={onClose} title={section ? t("pos.editSection", "تعديل الصنف") : t("pos.addSection", "أضف صنف")}>
      <div className="space-y-3">
        <p className="text-sm text-ink-subtle">{t("pos.sectionInCompany", { name: company.name, defaultValue: "داخل شركة {{name}}" })}</p>
        <div>
          <label className="label flex items-center gap-1"><FolderTree size={12} /> {t("pos.sectionName", "اسم الصنف")}</label>
          <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} placeholder={t("pos.sectionNamePh", "مثال: دراي فود، معلبات، أدوية")} />
        </div>
        <Button className="mt-1 w-full" disabled={!name.trim()} loading={busy} onClick={save}>{t("common.save", "Save")}</Button>
      </div>
    </Modal>
  );
}

function CompanyModal({ open, company, companies, clinicId, onClose, onSaved }: { open: boolean; company: Company | null; companies: Company[]; clinicId?: string; onClose: () => void; onSaved: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const [name, setName] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setName(company?.name ?? "");
    setNote(company?.note ?? "");
    setTimeout(() => nameRef.current?.focus(), 80);
  }, [open, company]);

  const save = async () => {
    if (!name.trim() || busy) return;
    // Block a second company with the same (normalized) name — otherwise the
    // product→company name lookup can't tell them apart and stats fragment.
    const key = normKey(name);
    if (companies.some((c) => c.id !== company?.id && normKey(c.name) === key)) {
      toast.error(t("pos.companyDup", "توجد شركة بهذا الاسم بالفعل"));
      return;
    }
    setBusy(true);
    try {
      const payload = { name: normName(name), note: note.trim() || null };
      if (company) await repo.updateCompany(company.id, payload);
      else await repo.createCompany({ ...payload, clinic_id: clinicId ?? null });
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
    <Modal open={open} onClose={onClose} title={company ? t("pos.editCompany", "تعديل الشركة") : t("pos.addCompany", "أضف شركة")}>
      <div className="space-y-3">
        <div>
          <label className="label flex items-center gap-1"><Building2 size={12} /> {t("pos.companyName", "اسم الشركة")}</label>
          <input ref={nameRef} className="input" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") save(); }} placeholder={t("pos.companyNamePh", "مثال: Royal Canin")} />
        </div>
        <div>
          <label className="label">{t("pos.companyNote", "ملاحظة")} <span className="font-normal text-ink-subtle">{t("pos.companyNoteHint", "(اختياري — الوكيل، الهاتف…)")}</span></label>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("pos.companyNotePh", "الوكيل الرسمي، رقم المندوب…")} />
        </div>
        <Button className="mt-1 w-full" disabled={!name.trim()} loading={busy} onClick={save}>{t("common.save", "Save")}</Button>
      </div>
    </Modal>
  );
}
