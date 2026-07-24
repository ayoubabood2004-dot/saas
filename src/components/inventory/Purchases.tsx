import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Barcode, Plus, Search, Building2, ShoppingBag, PackageCheck, Sparkles,
  Wallet, CalendarClock, X, ScanLine, FolderTree, SlidersHorizontal, ChevronDown,
} from "lucide-react";
import type { Product, Company, CompanySection, Purchase, PurchaseItem, PurchaseDraftLine, PurchaseMeta, ProductCategory, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";
import { Combobox } from "@/components/Combobox";
import { Button, Badge, useToast, Skeleton } from "@/components/ui";
import { cn, money, formatDate, localISO } from "@/lib/utils";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { openPurchasePrint, purchaseNo } from "@/lib/purchasePrint";
import { getClinicLogo, getClinicSocials, getClinicName } from "@/lib/settings";
import { Printer } from "lucide-react";

/** Canonical company-name helpers (kept in sync with Inventory.tsx). */
const normName = (s: string) => s.trim().replace(/\s+/g, " ").normalize("NFC");
const normKey = (s: string) => normName(s).toLowerCase();

const CATEGORY_KEYS: ProductCategory[] = ["medicine", "food", "accessories", "consumables", "other"];
const PAY_METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

/** One editable line in the purchase builder. */
type Line = {
  key: string;
  product_id: string | null; // set when matched to an existing product
  barcode: string;
  name: string;
  category: string;
  qty: string;
  purchase_price: string;
  sell_price: string;
  min_stock: string;
};

let LINE_SEQ = 0;
const blankLine = (patch: Partial<Line> = {}): Line => ({
  key: `l${++LINE_SEQ}`, product_id: null, barcode: "", name: "", category: "",
  qty: "", purchase_price: "", sell_price: "", min_stock: "", ...patch,
});

/** Prefill a line from an existing product (a restock). */
const lineFromProduct = (p: Product, barcode: string): Line => blankLine({
  product_id: p.id, barcode: barcode || (p.barcode ?? ""), name: p.name,
  category: p.category ?? "", qty: "", purchase_price: String(p.purchase_price ?? ""),
  sell_price: String(p.sell_price ?? ""), min_stock: p.min_stock ? String(p.min_stock) : "",
});

const statusTone = (s?: string): "success" | "warn" | "danger" => (s === "paid" ? "success" : s === "partial" ? "warn" : "danger");

/* ============================ Purchases tab ============================ */
export function PurchasesTab({ products, companies, sections, clinicId, onChanged }: {
  products: Product[]; companies: Company[]; sections?: CompanySection[]; clinicId?: string; onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  const [building, setBuilding] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [q, setQ] = useState("");
  const mounted = useRef(true);

  const load = async () => {
    try {
      const rows = await withTimeout(repo.listPurchases(clinicId), 15000);
      if (mounted.current) setPurchases(rows);
    } catch { /* keep prior list */ }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const ql = q.trim().toLowerCase();
  const shown = ql ? purchases.filter((p) => (p.company_name ?? "").toLowerCase().includes(ql) || (p.reference ?? "").toLowerCase().includes(ql)) : purchases;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("purchase.search", "ابحث بالشركة أو رقم الفاتورة…")} />
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setBuilding(true); }}>{t("purchase.new", "فاتورة شراء")}</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><ShoppingBag size={26} /></span>
          <p className="text-ink-subtle">{purchases.length === 0 ? t("purchase.empty", "لا توجد فواتير شراء بعد. سجّل أول فاتورة ونزّل بضاعتها على المخزون دفعة وحدة.") : t("purchase.noMatch", "لا توجد فاتورة مطابقة.")}</p>
          {purchases.length === 0 && <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setBuilding(true); }}>{t("purchase.new", "فاتورة شراء")}</Button>}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {shown.map((p) => (
            <motion.button key={p.id} variants={staggerItem} onClick={() => { playTap(); setViewing(p); }} className="card flex w-full items-center gap-3 p-3.5 text-start transition hover:shadow-raised">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ShoppingBag size={20} /></span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-bold text-ink">
                  <Building2 size={13} className="shrink-0 text-ink-subtle" />
                  {p.company_name || t("purchase.noCompany", "بدون شركة")}
                  {p.reference && <span className="chip shrink-0 bg-surface-2 font-mono text-2xs text-ink-muted">#{p.reference}</span>}
                </p>
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-subtle">
                  <span className="flex items-center gap-1"><CalendarClock size={11} /> {formatDate(p.purchased_at, i18n.language)}</span>
                  <span className="flex items-center gap-1"><PackageCheck size={11} /> {t("purchase.units", { n: p.item_count, defaultValue: "{{n}} قطعة" })}</span>
                </div>
              </div>
              <div className="text-end">
                <p className="text-sm font-bold text-ink tabular-nums">{money(p.total)}</p>
                <Badge tone={statusTone(p.status)}>{t(`purchase.status.${p.status ?? "paid"}`, p.status ?? "paid")}</Badge>
              </div>
            </motion.button>
          ))}
        </motion.div>
      )}

      <PurchaseBuilderModal
        open={building}
        products={products}
        companies={companies}
        sections={sections}
        clinicId={clinicId}
        onClose={() => setBuilding(false)}
        onSaved={() => { setBuilding(false); void load(); onChanged(); }}
      />

      <PurchaseDetailModal purchase={viewing} onClose={() => setViewing(null)} />
    </div>
  );
}

/* ============================ Detail + print ============================ */
function PurchaseDetailModal({ purchase, onClose }: { purchase: Purchase | null; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!purchase) { setItems([]); return; }
    let alive = true;
    setLoading(true);
    repo.listPurchaseItems(purchase.id)
      .then((rows) => { if (alive) setItems(rows); })
      .catch(() => { if (alive) setItems([]); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [purchase]);

  if (!purchase) return null;
  const paid = purchase.amount_paid != null ? purchase.amount_paid : purchase.total;
  const due = Math.max(0, purchase.total - paid);

  const print = () => {
    const socials = getClinicSocials();
    const ok = openPurchasePrint(purchase, items, {
      clinicName: getClinicName() || user?.full_name || "doctorVet",
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      lang: i18n.language,
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
    });
    if (!ok) toast.error(t("retail.popupBlocked", "فعّل النوافذ المنبثقة للطباعة"));
    else void repo.logClientEvent("purchase.print", { ref: purchaseNo(purchase.id) });
  };

  return (
    <Modal open={!!purchase} onClose={onClose} title={`${t("purchase.new", "فاتورة شراء")} · ${purchaseNo(purchase.id)}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-bold text-ink"><Building2 size={14} className="text-ink-subtle" /> {purchase.company_name || t("purchase.noCompany", "بدون شركة")}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-xs text-ink-subtle">
              <span className="flex items-center gap-1"><CalendarClock size={11} /> {formatDate(purchase.purchased_at, i18n.language)}</span>
              {purchase.reference && <span className="font-mono">#{purchase.reference}</span>}
            </p>
          </div>
          <Badge tone={statusTone(purchase.status)}>{t(`purchase.status.${purchase.status ?? "paid"}`, purchase.status ?? "paid")}</Badge>
        </div>

        {loading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-12 rounded-xl" />)}</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-line">
            <table className="w-full text-sm">
              <thead className="bg-surface-2 text-xs text-ink-subtle">
                <tr>
                  <th className="p-2.5 text-start font-semibold">{t("purchase.item", "الصنف")}</th>
                  <th className="p-2.5 text-end font-semibold">{t("purchase.qty", "الكمية")}</th>
                  <th className="p-2.5 text-end font-semibold">{t("pos.purchasePrice", "الشراء")}</th>
                  <th className="p-2.5 text-end font-semibold">{t("purchase.lineTotal", "الإجمالي")}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => (
                  <tr key={it.id} className="border-t border-line">
                    <td className="p-2.5">
                      <p className="font-semibold text-ink">{it.name}</p>
                      {it.barcode && <p className="font-mono text-2xs text-ink-subtle">{it.barcode}</p>}
                    </td>
                    <td className="p-2.5 text-end tabular-nums">{it.qty}</td>
                    <td className="p-2.5 text-end tabular-nums">{money(it.purchase_price)}</td>
                    <td className="p-2.5 text-end font-bold tabular-nums">{money((it.qty || 0) * (it.purchase_price || 0))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="ms-auto w-full max-w-xs space-y-1.5 text-sm">
          <div className="flex items-center justify-between font-bold text-ink"><span>{t("purchase.grandTotal", "الإجمالي")}</span><span className="tabular-nums">{money(purchase.total)}</span></div>
          <div className="flex items-center justify-between text-ink-muted"><span>{t("purchase.paid", "المدفوع")}</span><span className="tabular-nums">{money(paid)}</span></div>
          {due > 0 && <div className="flex items-center justify-between font-semibold text-danger-600"><span>{t("purchase.due", "المتبقّي")}</span><span className="tabular-nums">{money(due)}</span></div>}
        </div>

        {purchase.notes && <p className="rounded-xl border border-line bg-surface-1 p-3 text-sm text-ink-muted"><strong>{t("purchase.notes", "ملاحظات")}:</strong> {purchase.notes}</p>}

        <Button className="w-full" leftIcon={<Printer size={16} />} onClick={print}>{t("purchase.print", "طباعة الفاتورة")}</Button>
      </div>
    </Modal>
  );
}

/* ============================ Builder ============================ */
export function PurchaseBuilderModal({ open, products, companies, sections, clinicId, defaultCompanyName, onClose, onSaved }: {
  open: boolean; products: Product[]; companies: Company[]; sections?: CompanySection[]; clinicId?: string; defaultCompanyName?: string;
  onClose: () => void; onSaved: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [company, setCompany] = useState("");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(localISO());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState(""); // blank = paid in full
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  // Matched (restock) lines render COMPACT — barcode, name, where it lives, and
  // ONE required field: the count. This set holds lines the user expanded to
  // optionally adjust prices/alerts.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const scanRef = useRef<HTMLInputElement>(null);
  const createdRef = useRef<Company[]>([]);

  const byBarcode = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) if (p.barcode) m.set(p.barcode, p);
    return m;
  }, [products]);

  useEffect(() => {
    if (!open) return;
    createdRef.current = [];
    setCompany(defaultCompanyName ?? "");
    setReference(""); setNotes(""); setPurchasedAt(localISO());
    setPayMethod("cash"); setAmountPaid(""); setScan("");
    setLines([blankLine()]);
    setExpandedKeys(new Set());
    setTimeout(() => scanRef.current?.focus(), 90);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patchLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  // When a barcode is typed into a line, auto-fill from an existing product.
  const onBarcode = (key: string, code: string) => {
    const clean = code.replace(/\s/g, "");
    const match = clean ? byBarcode.get(clean) : undefined;
    setLines((ls) => ls.map((l) => {
      if (l.key !== key) return l;
      if (match) return { ...lineFromProduct(match, clean), key: l.key, qty: l.qty };
      // No match. If this line was previously matched to a product, editing the
      // barcode to a new code starts a CLEAN new-product entry — don't carry the
      // old product's name/prices over into a mislabeled duplicate.
      if (l.product_id) return blankLine({ key: l.key, barcode: clean, qty: l.qty });
      return { ...l, barcode: clean, product_id: null };
    }));
  };

  // Top scan box: scan/type a barcode → add (or focus) a line for it.
  const scanAdd = () => {
    const code = scan.replace(/\s/g, "").trim();
    if (!code) return;
    const match = byBarcode.get(code);
    setLines((ls) => {
      // Merge into an existing line with the same barcode if present.
      const existing = ls.find((l) => l.barcode === code);
      if (existing) return ls.map((l) => (l.key === existing.key ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      const fresh = match ? { ...lineFromProduct(match, code), qty: "1" } : blankLine({ barcode: code, qty: "1" });
      // Drop a leading empty line so the list stays clean.
      const base = ls.length === 1 && !ls[0].barcode && !ls[0].name ? [] : ls;
      return [...base, fresh];
    });
    setScan("");
    playTap();
    scanRef.current?.focus();
  };

  const validLines = lines.filter((l) => (l.name.trim() || l.barcode.trim()) && Number(l.qty) > 0);
  const total = validLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.purchase_price) || 0), 0);
  const totalUnits = validLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  const paidNum = amountPaid.trim() === "" ? total : Math.max(0, Math.min(total, Number(amountPaid) || 0));
  const status = paidNum >= total ? "paid" : paidNum <= 0 ? "unpaid" : "partial";

  const resolveCompanyId = async (): Promise<{ id: string | null; created: Company | null; name: string }> => {
    const typed = normName(company);
    if (!typed) return { id: null, created: null, name: "" };
    const key = typed.toLowerCase();
    const existing = [...companies, ...createdRef.current].find((c) => normKey(c.name) === key);
    if (existing) return { id: existing.id, created: null, name: existing.name };
    const created = await repo.createCompany({ name: typed, note: null, clinic_id: clinicId ?? null });
    createdRef.current.push(created);
    return { id: created.id, created, name: created.name };
  };

  const save = async () => {
    if (busy) return;
    if (validLines.length === 0) { toast.error(t("purchase.needLine", "أضف صنفاً واحداً على الأقل بكمية أكبر من صفر")); return; }
    setBusy(true);
    let createdCompany: Company | null = null;
    try {
      const co = await resolveCompanyId();
      createdCompany = co.created;
      const draft: PurchaseDraftLine[] = validLines.map((l) => ({
        product_id: l.product_id,
        barcode: l.barcode.trim() || null,
        name: l.name.trim() || l.barcode.trim(),
        category: (l.category || null) as ProductCategory | null,
        qty: Number(l.qty) || 0,
        purchase_price: Number(l.purchase_price) || 0,
        sell_price: Number(l.sell_price) || 0,
        min_stock: l.min_stock.trim() === "" ? null : Math.max(0, Math.round(Number(l.min_stock) || 0)),
        expiry_date: null,
      }));
      const meta: PurchaseMeta = {
        company_id: co.id,
        company_name: co.name || null,
        reference: reference.trim() || null,
        amount_paid: amountPaid.trim() === "" ? undefined : paidNum,
        payment_method: payMethod,
        notes: notes.trim() || null,
        purchased_at: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
        staff_id: user?.id ?? null,
      };
      await repo.recordPurchase(draft, meta);
      playSuccess();
      onSaved();
    } catch (e) {
      if (createdCompany) {
        const cc = createdCompany;
        try { await repo.deleteCompany(cc.id); createdRef.current = createdRef.current.filter((c) => c.id !== cc.id); } catch { /* best effort */ }
      }
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="full" title={t("purchase.new", "فاتورة شراء")}>
      <div className="space-y-4">
        {/* Supplier + reference + date */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label flex items-center gap-1"><Building2 size={12} /> {t("pos.company", "الشركة")}</label>
            <Combobox
              value={company}
              onChange={setCompany}
              options={companies.map((c) => c.name)}
              placeholder={t("pos.companyPh", "اختر شركة أو أنشئ واحدة…")}
              icon={<Building2 size={16} />}
              createLabel={(v) => t("pos.companyCreate", { value: v, defaultValue: `إنشاء شركة “${v}”` })}
            />
          </div>
          <div>
            <label className="label">{t("purchase.reference", "رقم فاتورة المورّد")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
            <input className="input font-mono" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="—" />
          </div>
          <div>
            <label className="label">{t("purchase.date", "تاريخ الاستلام")}</label>
            <input type="date" className="input" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
          </div>
        </div>

        {/* Fast scan/add */}
        <div className="rounded-2xl border border-brand-100 bg-brand-50/50 p-3 dark:border-brand-500/20 dark:bg-brand-500/10">
          <label className="label flex items-center gap-1.5 text-brand-700 dark:text-brand-200"><ScanLine size={14} /> {t("purchase.scanAddFast", "امسح الباركود واكتب العدد فقط — المنتج المعروف يذهب لمكانه (شركته وصنفه وأسعاره) تلقائياً")}</label>
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Barcode size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
              <input
                ref={scanRef}
                className="input font-mono ltr:pl-9 rtl:pr-9"
                value={scan}
                onChange={(e) => setScan(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanAdd(); } }}
                placeholder={t("pos.scanOrType", "امسح أو اكتب…")}
              />
            </div>
            <Button variant="secondary" onClick={scanAdd}>{t("common.add", "إضافة")}</Button>
          </div>
        </div>

        {/* Lines */}
        <div className="space-y-2">
          {lines.map((l, idx) => {
            const matched = !!l.product_id;
            const product = matched ? products.find((p) => p.id === l.product_id) : undefined;
            // FAST restock row: the product is already known and already filed —
            // show where it lives + the stock jump, and ask ONLY for the count.
            if (matched && product && !expandedKeys.has(l.key)) {
              const coName = product.company_id ? companies.find((c) => c.id === product.company_id)?.name : undefined;
              const secName = product.section_id ? (sections ?? []).find((s) => s.id === product.section_id)?.name : undefined;
              const qtyN = Number(l.qty) || 0;
              return (
                <div key={l.key} className="rounded-2xl border border-success-200 bg-success-50/40 p-3 dark:border-success-500/25 dark:bg-success-500/5">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <span className="chip shrink-0 bg-success-100 text-2xs font-semibold text-success-700 dark:bg-success-500/20 dark:text-success-200"><PackageCheck size={11} /> {t("purchase.restock", "موجود · تحديث مخزون")}</span>
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm font-bold text-ink">
                        {l.name}
                        {coName && <span className="chip shrink-0 bg-accent-50 text-2xs font-semibold text-accent-700 dark:bg-accent-500/15 dark:text-accent-200"><Building2 size={11} /> {coName}</span>}
                        {secName && <span className="chip shrink-0 bg-brand-50 text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"><FolderTree size={11} /> {secName}</span>}
                      </p>
                      <p className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-subtle">
                        {l.barcode && <span className="flex items-center gap-1 font-mono"><Barcode size={10} /> {l.barcode}</span>}
                        <span className="tabular-nums">
                          {t("purchase.stockJump", { from: product.stock ?? 0, to: (product.stock ?? 0) + qtyN, defaultValue: "المخزون: {{from}} ← {{to}}" })}
                        </span>
                        <span>{t("pos.buy", "شراء")} {money(Number(l.purchase_price) || 0)} · {t("pos.sell", "بيع")} {money(Number(l.sell_price) || 0)}</span>
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div>
                        <label className="label text-2xs">{t("purchase.qty", "الكمية المستلمة")}</label>
                        <input
                          type="number" inputMode="numeric" min="0" step="1"
                          className="input h-10 w-24 text-center text-base font-extrabold tabular-nums"
                          value={l.qty}
                          onChange={(e) => patchLine(l.key, { qty: e.target.value })}
                          onFocus={(e) => e.target.select()}
                          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); scanRef.current?.focus(); } }}
                          placeholder="0"
                        />
                      </div>
                      <button
                        onClick={() => { playTap(); setExpandedKeys((s) => new Set(s).add(l.key)); }}
                        title={t("purchase.editOptional", "تعديل الأسعار (اختياري)")}
                        aria-label={t("purchase.editOptional", "تعديل الأسعار (اختياري)")}
                        className="mt-4 grid h-9 w-9 place-items-center rounded-xl text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600"
                      >
                        <SlidersHorizontal size={15} />
                      </button>
                      <button onClick={() => { playTap(); removeLine(l.key); }} aria-label={t("common.delete", "حذف")} className="mt-4 grid h-9 w-9 place-items-center rounded-xl text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><X size={15} /></button>
                    </div>
                  </div>
                </div>
              );
            }
            return (
              <div key={l.key} className={cn("rounded-2xl border p-3", matched ? "border-success-200 bg-success-50/40 dark:border-success-500/25 dark:bg-success-500/5" : "border-line bg-surface-1")}>
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-xs font-bold text-ink-subtle">
                    {t("purchase.lineN", { n: idx + 1, defaultValue: "صنف {{n}}" })}
                    {matched
                      ? <span className="chip bg-success-100 text-2xs font-semibold text-success-700 dark:bg-success-500/20 dark:text-success-200"><PackageCheck size={11} /> {t("purchase.restock", "موجود · تحديث مخزون")}</span>
                      : (l.barcode || l.name) ? <span className="chip bg-brand-50 text-2xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-200"><Sparkles size={11} /> {t("purchase.newItem", "منتج جديد")}</span> : null}
                  </span>
                  <span className="flex items-center gap-1">
                    {matched && expandedKeys.has(l.key) && (
                      <button onClick={() => { playTap(); setExpandedKeys((s) => { const n = new Set(s); n.delete(l.key); return n; }); }} aria-label={t("purchase.collapse", "طيّ")} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2 hover:text-brand-600"><ChevronDown size={15} className="rotate-180" /></button>
                    )}
                    <button onClick={() => { playTap(); removeLine(l.key); }} aria-label={t("common.delete", "حذف")} className="grid h-7 w-7 place-items-center rounded-full text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><X size={15} /></button>
                  </span>
                </div>
                <div className="grid gap-2 sm:grid-cols-12">
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("pos.barcode", "الباركود")}</label>
                    <input className="input font-mono text-sm" dir="ltr" value={l.barcode} onChange={(e) => onBarcode(l.key, e.target.value)} placeholder="—" />
                  </div>
                  <div className="sm:col-span-4">
                    <label className="label text-2xs">{t("pos.name", "الاسم")}</label>
                    <input className="input text-sm" value={l.name} onChange={(e) => patchLine(l.key, { name: e.target.value })} placeholder={t("pos.namePh", "اسم المنتج")} readOnly={matched} />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="label text-2xs">{t("pos.category", "الفئة")}</label>
                    <select className="input text-sm" value={l.category} onChange={(e) => patchLine(l.key, { category: e.target.value })}>
                      <option value="">—</option>
                      {CATEGORY_KEYS.map((c) => <option key={c} value={c}>{t(`pos.cat.${c}`)}</option>)}
                    </select>
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("purchase.qty", "الكمية المستلمة")}</label>
                    <input type="number" inputMode="numeric" min="0" step="1" className="input text-sm font-bold" value={l.qty} onChange={(e) => patchLine(l.key, { qty: e.target.value })} placeholder="0" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("pos.purchasePrice", "سعر الشراء")}</label>
                    <input type="number" inputMode="numeric" min="0" step="1" className="input text-sm" value={l.purchase_price} onChange={(e) => patchLine(l.key, { purchase_price: e.target.value })} placeholder="0" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("pos.sellPrice", "سعر البيع")}</label>
                    <input type="number" inputMode="numeric" min="0" step="1" className="input text-sm" value={l.sell_price} onChange={(e) => patchLine(l.key, { sell_price: e.target.value })} placeholder="0" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("pos.minStock", "تنبيه المخزون")}</label>
                    <input type="number" inputMode="numeric" min="0" step="1" className="input text-sm" value={l.min_stock} onChange={(e) => patchLine(l.key, { min_stock: e.target.value })} placeholder="0" />
                  </div>
                  <div className="flex items-end sm:col-span-3">
                    <div className="w-full rounded-xl bg-surface-2 px-3 py-2 text-center">
                      <p className="text-2xs text-ink-subtle">{t("purchase.lineTotal", "إجمالي الصنف")}</p>
                      <p className="text-sm font-bold text-ink tabular-nums">{money((Number(l.qty) || 0) * (Number(l.purchase_price) || 0))}</p>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          <button onClick={() => { playTap(); setLines((ls) => [...ls, blankLine()]); }} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line py-3 text-sm font-semibold text-ink-muted transition hover:border-brand-300 hover:text-brand-600">
            <Plus size={16} /> {t("purchase.addLine", "أضف صنفاً")}
          </button>
        </div>

        {/* Payment + notes */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <label className="label">{t("purchase.payMethod", "طريقة الدفع")}</label>
            <div className="flex gap-1.5">
              {PAY_METHODS.map((m) => (
                <button key={m} onClick={() => { playTap(); setPayMethod(m); }}
                  className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold transition", payMethod === m ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {t(`pay.${m}`, m)}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="label flex items-center gap-1"><Wallet size={12} /> {t("purchase.amountPaid", "المدفوع للمورّد")} <span className="font-normal text-ink-subtle">{t("purchase.paidHint", "(فارغ = مدفوع كامل)")}</span></label>
            <input type="number" inputMode="numeric" min="0" step="1" className="input" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={money(total)} />
          </div>
          <div>
            <label className="label">{t("purchase.notes", "ملاحظات")}</label>
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="—" />
          </div>
        </div>

        {/* Summary + save */}
        <div className="sticky bottom-0 -mx-1 flex flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-1/95 p-3 backdrop-blur">
          <div className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
            <Summary label={t("purchase.itemsCount", "أصناف")} value={String(validLines.length)} />
            <Summary label={t("purchase.unitsLabel", "قطعة")} value={String(totalUnits)} />
            <Summary label={t("purchase.grandTotal", "الإجمالي")} value={money(total)} strong />
            <div className="flex flex-col">
              <span className="text-2xs text-ink-subtle">{t("purchase.settle", "الحالة")}</span>
              <Badge tone={statusTone(status)}>{t(`purchase.status.${status}`, status)}</Badge>
            </div>
          </div>
          <Button size="lg" loading={busy} disabled={validLines.length === 0} leftIcon={<PackageCheck size={18} />} onClick={save}>
            {t("purchase.save", "حفظ وتنزيل على المخزون")}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Summary({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex flex-col">
      <span className="text-2xs text-ink-subtle">{label}</span>
      <span className={cn("tabular-nums", strong ? "text-lg font-extrabold text-ink" : "text-sm font-bold text-ink")}>{value}</span>
    </div>
  );
}
