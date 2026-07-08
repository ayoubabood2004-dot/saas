import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart, User, Phone, Tag, Percent,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2, Printer, Sparkles, TrendingUp, Package, PawPrint, X,
  Stethoscope, Pencil, Pill, Syringe, CalendarClock, Wallet,
} from "lucide-react";
import type { Product, Invoice, InvoiceItem, CheckoutItem, SaleMeta, PaymentMethod, PaymentSplit, DiscountType, Customer, Service, ServiceCatalog, Species, Pet } from "@/types";
import { repo, resolveDiscount } from "@/lib/repo";
import { phoneDigits } from "@/lib/phone";
import { getServiceCatalog } from "@/lib/services";
import { computePromotions, getPromoRules } from "@/lib/promotions";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/lib/entitlements";
import { Button, useToast } from "@/components/ui";
import { ServiceQuickSelect } from "./ServiceQuickSelect";
import { MedSaleForm } from "./MedSaleForm";
import { CashierSelect } from "@/components/MedicalEntry";
import { useInvoicePrinter } from "./usePrintInvoice";
import { invoiceNo, openInvoicePrint, type PrintFormat } from "@/lib/invoicePrint";
import { getPreSalePrint, getClinicLogo, getClinicSocials, getClinicName } from "@/lib/settings";
import { persistMedicalEntries } from "@/lib/medSync";
import type { MedicalDraft } from "@/components/MedicalEntry";
import { cn, money, currencySymbol } from "@/lib/utils";
import { dueOf, paidOf } from "@/lib/debt";
import { withTimeout, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";

/** A unified cart line — a physical product OR a non-barcode service. The price is an
 *  editable override; services carry product_id=null + zero cost so they flow through
 *  the normal checkout/invoice/analytics pipeline alongside products. */
interface Line {
  id: string; // "p:<productId>" | "s:<serviceId>" | "m:<draftId>"
  kind: "product" | "service" | "med";
  name: string;
  barcode: string | null;
  unit_price: number; // editable
  unit_cost: number; // product purchase price; 0 for services
  qty: number;
  stock: number | null; // product stock IN BOXES (fractional ok); null = unlimited (service / med)
  product_id: string | null;
  subcategory: string | null; // product subcategory, for Mix & Match promotions
  /** Medical draft for a "med" line — synced into the patient's record on checkout. */
  med?: MedicalDraft;
  /** Which patient this line belongs to — a multi-pet sale bills several animals on
   *  ONE invoice, and each med line syncs into ITS OWN pet's medical record. */
  petId?: string | null;
  petName?: string | null;
  /** Fractional sales — this product can be sold whole (box) or by a smaller sub-unit. */
  hasSubUnit?: boolean;
  subUnitName?: string | null;   // e.g. "حبة" / "شريط" / "مل"
  unitsPerBox?: number | null;   // sub-units that fill one box
  boxPrice?: number;             // price of one whole box
  subPrice?: number | null;      // price of one sub-unit
  boxCost?: number;              // purchase price of one whole box
  saleUnit?: "box" | "sub";      // which unit this line is currently sold as
}

/** A cart line's max quantity in its current sale unit, derived from the product's box
 *  stock. Sub-unit sales can go up to (boxes × units-per-box) singles. */
const unitCap = (l: Line): number => {
  if (l.stock == null) return Infinity; // service / medication — uncapped
  if (l.saleUnit === "sub" && l.unitsPerBox && l.unitsPerBox > 0) return Math.floor(l.stock * l.unitsPerBox);
  return Math.floor(l.stock);
};

const PAY_OPTIONS: { value: PaymentMethod; icon: typeof Banknote; key: string; def: string }[] = [
  { value: "cash", icon: Banknote, key: "retail.payCash", def: "نقدي" },
  { value: "card", icon: CreditCard, key: "retail.payCard", def: "بطاقة ائتمان" },
  { value: "transfer", icon: ArrowLeftRight, key: "retail.payTransfer", def: "حوالة بنكية" },
];
const PAY_SEQUENCE: PaymentMethod[] = ["cash", "card", "transfer"];
/** Round to 2 dp, absorbing binary-float drift (0.1 + 0.2 → 0.3, not 0.30000000000000004). */
const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** A YYYY-MM-DD → short date with Western numerals; never throws / never "Invalid Date". */
const prettyShort = (iso: string) => {
  const d = new Date(iso + "T00:00:00");
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
};

/** Customer/pet handed over from an animal record to pre-fill the sale (the "bridge").
 *  petId + species are carried so a sold medication/vaccine can sync into the record. */
export interface RetailPrefill { name: string; phone: string; pet: string; petId?: string; species?: Species }

/** A patient attached to the sale. Several can be attached (e.g. vaccinating all the
 *  owner's animals in one visit) — one is ACTIVE at a time: new medication/vaccine
 *  lines belong to it and the vaccine list follows its species. */
interface SalePet { id: string | null; name: string; species: Species | null }

export function SaleBuilder({ products, clinicId, onSold, prefill }: { products: Product[]; clinicId?: string; onSold: () => void; prefill?: RetailPrefill | null }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const print = useInvoicePrinter();
  const { user } = useAuth();
  const { has } = useEntitlements();
  const canDebt = has("debt"); // البيع بالدين — super plan only (full during trial)

  const [cart, setCart] = useState<Line[]>([]);
  const [browseTab, setBrowseTab] = useState<"products" | "services" | "meds">("products");
  const [catalog] = useState<ServiceCatalog>(() => getServiceCatalog());
  // Doctor-defined Mix & Match offers (clinic-scoped). Loaded once per sale session.
  const [promoRules] = useState(() => getPromoRules());
  const [query, setQuery] = useState("");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  // Patients attached to this sale. The ACTIVE one receives new medication/vaccine
  // lines; more of the owner's animals can be attached to vaccinate them in one visit.
  const [salePets, setSalePets] = useState<SalePet[]>([]);
  const [activePetIdx, setActivePetIdx] = useState(0);
  const activePet: SalePet | null = salePets[Math.min(activePetIdx, salePets.length - 1)] ?? null;
  // "+ حيوان آخر" picker: the clinic's pets, owner's animals surfaced first.
  const [petPickOpen, setPetPickOpen] = useState(false);
  const [petPickAll, setPetPickAll] = useState<Pet[] | null>(null); // null = loading
  const [petPickQ, setPetPickQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [custMatches, setCustMatches] = useState<Customer[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>("percent");
  const [discountValue, setDiscountValue] = useState("");
  // Doctor-set FINAL price: the total to charge outright. The gap from the subtotal
  // becomes an automatic (approximate) discount. Null = compute the total normally.
  const [finalOverride, setFinalOverride] = useState<number | null>(null);
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState("");
  // Payment allocation — one leg by default (full total), expandable into a split, or
  // reduced below the total to save the sale on credit (دفع آجل).
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "cash", amount: 0 }]);
  // Whether the cashier has manually touched the paid amount (stops the auto-pin to total).
  const [paidEdited, setPaidEdited] = useState(false);
  // Explicit "دفع جزئي" mode — the cashier chose partial payment via the button
  // (a manually-typed shortfall still shows the same loud debt panel).
  const [partialMode, setPartialMode] = useState(false);
  // Optional cashier / sales rep (staff id) — attached to the invoice for reports.
  const [cashierId, setCashierId] = useState<string | null>(null);
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
        const cap = unitCap(found);
        return c.map((l) => (l.id === id ? { ...l, qty: Math.min(l.qty + 1, cap) } : l));
      }
      return [...c, factory()];
    });
    flashLine(id);
  };

  const addProduct = (p: Product) =>
    bump(`p:${p.id}`, () => {
      const hasSub = !!p.has_sub_unit && !!p.units_per_box && p.units_per_box > 0;
      const unitsPerBox = p.units_per_box ?? null;
      // No whole box left but singles remain → start the line on the sub-unit.
      const startSub = hasSub && Math.floor(p.stock) < 1;
      const subCost = hasSub && unitsPerBox ? Math.round((p.purchase_price / unitsPerBox) * 100) / 100 : 0;
      return {
        id: `p:${p.id}`, kind: "product", name: p.name, barcode: p.barcode ?? null,
        unit_price: startSub ? (p.sub_unit_price ?? 0) : p.sell_price,
        unit_cost: startSub ? subCost : p.purchase_price,
        qty: 1, stock: p.stock, product_id: p.id, subcategory: p.subcategory ?? null,
        hasSubUnit: hasSub, subUnitName: p.sub_unit_name ?? null, unitsPerBox,
        boxPrice: p.sell_price, subPrice: p.sub_unit_price ?? null, boxCost: p.purchase_price,
        saleUnit: startSub ? "sub" : "box",
      };
    });

  // Switch a product line between selling a whole box and a single sub-unit. The price
  // and cost follow the unit (sub-cost = box cost ÷ units-per-box); qty re-clamps to the
  // new unit's stock cap. Only ever called for units that have at least one available.
  const setSaleUnit = (id: string, unit: "box" | "sub") =>
    setCart((c) => c.map((l) => {
      if (l.id !== id || l.kind !== "product") return l;
      const toSub = unit === "sub" && !!l.unitsPerBox && l.unitsPerBox > 0;
      const unit_price = toSub ? (l.subPrice ?? 0) : (l.boxPrice ?? l.unit_price);
      const unit_cost = toSub && l.unitsPerBox ? Math.round(((l.boxCost ?? 0) / l.unitsPerBox) * 100) / 100 : (l.boxCost ?? l.unit_cost);
      const next: Line = { ...l, saleUnit: toSub ? "sub" : "box", unit_price, unit_cost };
      const cap = unitCap(next);
      return { ...next, qty: Math.min(Math.max(1, l.qty), Math.max(1, cap)) };
    }));

  const addService = (s: Service) =>
    bump(`s:${s.id}`, () => ({ id: `s:${s.id}`, kind: "service", name: s.name, barcode: null, unit_price: s.price, unit_cost: 0, qty: 1, stock: null, product_id: null, subcategory: null }));

  // A medication/vaccine from the "الأدوية" tab — a priced cart line carrying the full
  // medical draft (dose/route/booster/lot) so it can be written into the pet's record.
  const addMedLine = (draft: MedicalDraft, price: number, qty: number) => {
    const id = `m:${draft.id}`; // each draft has a unique uid → always a fresh line
    const unit_price = Math.max(0, Math.round(price * 100) / 100); // same rounding as setPrice
    // The line belongs to the ACTIVE patient — its record receives the sync on checkout.
    setCart((c) => [...c, { id, kind: "med", name: draft.name, barcode: null, unit_price, unit_cost: 0, qty: Math.max(1, qty), stock: null, product_id: null, subcategory: null, med: draft, petId: activePet?.id ?? null, petName: activePet?.name ?? null }]);
    playSuccess();
    flashLine(id);
  };

  const setQty = (id: string, qty: number) =>
    setCart((c) => (qty <= 0 ? c.filter((l) => l.id !== id) : c.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, unitCap(l)) } : l))));

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
    setSalePets(prefill.pet ? [{ id: prefill.petId || null, name: prefill.pet, species: prefill.species || null }] : []);
    setActivePetIdx(0);
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
  // Auto total = subtotal minus promotions + manual discount (clamped to the subtotal).
  const autoTotal = Math.max(0, subtotal - Math.min(subtotal, promoDiscount + manualDiscountAmt));
  // A cashier-pinned final price IS the total — it may sit BELOW the subtotal (a discount)
  // or ABOVE it (a markup / rounding-up / service fee). The gap shows as a discount or surcharge.
  const total = finalOverride != null ? Math.max(0, finalOverride) : autoTotal;
  const discountAmt = Math.max(0, subtotal - total);
  const surchargeAmt = Math.max(0, total - subtotal);
  const profit = total - cost;

  // ---- Payment: full, split, partial (credit), or over-tendered (change due) ----
  const isSplit = payments.length > 1;
  const totalPaid = round2(payments.reduce((s, p) => s + (Number.isFinite(p.amount) ? p.amount : 0), 0));
  const remaining = round2(total - totalPaid); // > 0 → owed later (credit); < 0 → change due
  const isCredit = remaining > 0.01;            // the client still owes a balance
  const change = remaining < -0.005 ? round2(-remaining) : 0; // cash to hand back to the client

  // Until the cashier edits the paid amount, a single leg tracks the live total (paid in full).
  useEffect(() => {
    setPayments((ps) => (!paidEdited && ps.length === 1 && ps[0].amount !== total ? [{ ...ps[0], amount: total }] : ps));
  }, [total, paidEdited]);

  const addPayment = () => {
    playTap();
    setPaidEdited(true);
    setPayments((ps) => {
      const used = new Set(ps.map((p) => p.method));
      const next = PAY_SEQUENCE.find((m) => !used.has(m)) ?? "cash";
      const sum = round2(ps.reduce((s, p) => s + p.amount, 0));
      const due = Math.max(0, round2(total - sum)); // pre-fill the outstanding balance
      return [...ps, { method: next, amount: due }];
    });
  };
  const removePayment = (idx: number) => {
    playTap();
    const next = payments.filter((_, i) => i !== idx);
    setPayments(next);
    // If the split collapsed back to a single leg that already covers the bill, resume
    // auto-tracking the total (so a later cart change can't leave a stale credit balance).
    setPaidEdited(!(next.length === 1 && Math.abs(next[0].amount - total) < 0.01));
  };
  const setPaymentMethod = (idx: number, method: PaymentMethod) =>
    setPayments((ps) => ps.map((p, i) => (i === idx ? { ...p, method } : p)));
  const setPaymentAmount = (idx: number, amount: number) => {
    setPaidEdited(true);
    setPayments((ps) => ps.map((p, i) => (i === idx ? { ...p, amount: Number.isFinite(amount) && amount >= 0 ? amount : 0 } : p)));
  };
  // Top the first leg up so the paid total exactly covers the bill (clears any credit balance).
  const collectFull = () => {
    playTap();
    setPaidEdited(true);
    setPayments((ps) => {
      const others = round2(ps.slice(1).reduce((s, p) => s + p.amount, 0));
      return ps.map((p, i) => (i === 0 ? { ...p, amount: Math.max(0, round2(total - others)) } : p));
    });
  };

  // ---- Explicit partial-payment (credit) mode ------------------------------
  // "دفع جزئي": one obvious button instead of silently typing a lower amount.
  // Entering it pre-fills HALF the bill (the everyday case) — the cashier can
  // then type any amount; the rest is loudly shown as debt before checkout.
  const enterPartial = () => {
    playTap();
    setPartialMode(true);
    setPaidEdited(true);
    setPayments([{ method: payments[0]?.method ?? "cash", amount: Math.max(0, Math.round(total / 2)) }]);
  };
  const exitPartial = () => {
    setPartialMode(false);
    if (payments.length === 1) {
      // Single leg → back to auto-tracking the live total (paid in full).
      playTap();
      setPaidEdited(false);
      setPayments((ps) => [{ ...ps[0], amount: total }]);
    } else {
      // Split → top the first leg up, keep the other legs as entered.
      collectFull();
    }
  };
  const setPaidQuick = (amount: number) => {
    playTap();
    setPaidEdited(true);
    setPayments((ps) => ps.map((p, i) => (i === 0 ? { ...p, amount: Math.max(0, Math.round(amount)) } : p)));
  };
  // The partial panel shows for the explicit mode AND for a manually-typed
  // shortfall, so the debt can never sneak through quietly.
  const partialUi = partialMode || isCredit;
  // A debt must belong to someone — block checkout until the customer is named.
  const needsDebtName = isCredit && !name.trim();

  // ---- Final-price override (acts as an approximate discount) ----------------
  const beginEditTotal = () => { setTotalDraft(String(Math.round(total))); setEditingTotal(true); };
  const commitTotal = () => {
    const v = Number(totalDraft);
    if (!Number.isNaN(v) && v >= 0) { setFinalOverride(Math.max(0, Math.round(v))); setDiscountValue(""); }
    setEditingTotal(false);
  };
  const clearFinalOverride = () => { playTap(); setFinalOverride(null); };

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
    setCart([]); setQuery(""); setDiscountValue(""); setFinalOverride(null); setEditingTotal(false);
    setDiscountType("percent"); setPayments([{ method: "cash", amount: 0 }]); setPaidEdited(false); setPartialMode(false); setDone(null); setLastPrints(0);
    setCashierId(null); setBrowseTab("products");
    // Preserve the patient/customer bridge across "New sale" so repeated per-patient
    // sales keep syncing into the same animal's record; clear it for a plain walk-in.
    if (prefill) {
      setName(prefill.name || ""); setPhone(prefill.phone || "");
      setSalePets(prefill.pet ? [{ id: prefill.petId || null, name: prefill.pet, species: prefill.species || null }] : []);
    } else {
      setName(""); setPhone(""); setSalePets([]);
    }
    setActivePetIdx(0); setPetPickOpen(false); setPetPickQ("");
  };

  // ---- "+ حيوان آخر" — attach another of the clinic's patients to this sale ----
  const openPetPicker = async () => {
    playTap();
    setPetPickOpen((o) => !o);
    if (petPickAll) return; // already loaded this session
    try { setPetPickAll((await repo.listAllPets(clinicId)).filter((p) => p.shared_with_clinic !== false)); }
    catch { setPetPickAll([]); }
  };
  const attachPet = (p: Pet) => {
    playSuccess();
    setSalePets((s) => [...s, { id: p.id, name: p.name, species: p.species ?? null }]);
    setActivePetIdx(salePets.length); // the newly appended pet becomes active
    setPetPickOpen(false); setPetPickQ("");
    // First attachment for a walk-in: adopt the owner as the invoice customer too.
    if (!name.trim() && p.owner_name) setName(p.owner_name);
    if (!phone.trim() && p.owner_phone) setPhone(p.owner_phone);
  };
  const removePet = (idx: number) => {
    playTap();
    setSalePets((s) => s.filter((_, i) => i !== idx));
    setActivePetIdx((a) => Math.max(0, a > idx ? a - 1 : Math.min(a, salePets.length - 2)));
  };
  // Owner's other animals float to the top; the search box covers every patient.
  const petPickList = useMemo(() => {
    if (!petPickAll) return [];
    const attached = new Set(salePets.map((p) => p.id).filter(Boolean));
    const nd = phoneDigits(phone);
    const nm = name.trim().toLowerCase();
    const q = petPickQ.trim().toLowerCase();
    const pool = petPickAll.filter((p) => !attached.has(p.id));
    const isOwners = (p: Pet) =>
      (!!nd && phoneDigits(p.owner_phone ?? "") === nd) || (!!nm && (p.owner_name ?? "").trim().toLowerCase() === nm);
    const filtered = q
      ? pool.filter((p) => p.name.toLowerCase().includes(q) || (p.owner_name ?? "").toLowerCase().includes(q))
      : pool;
    return [...filtered.filter(isOwners), ...filtered.filter((p) => !isOwners(p))].slice(0, 8)
      .map((p) => ({ pet: p, owners: isOwners(p) }));
  }, [petPickAll, salePets, phone, name, petPickQ]);

  // ---- Opt-in pro-forma print (BEFORE the sale) ----------------------------
  // Some customers want the bill on paper before deciding to pay. Clinics turn
  // this on in Settings → خيارات الكاشير; it prints the LIVE CART only — no
  // invoice row is created, stock is untouched, and the page carries a loud
  // "فاتورة أولية" badge so it can never pass for a real receipt.
  const preSaleEnabled = getPreSalePrint();
  const printPreSale = (format: PrintFormat) => {
    if (cart.length === 0) return;
    playTap();
    const petNames = Array.from(new Set(salePets.map((p) => p.name.trim()).filter(Boolean)));
    const multiPet = petNames.length > 1;
    const draftItems: InvoiceItem[] = cart.map((l) => ({
      id: `draft-${l.id}`, invoice_id: "draft", clinic_id: clinicId ?? null,
      product_id: l.product_id, name: multiPet && l.petName ? `${l.name} — ${l.petName}` : l.name, barcode: l.barcode,
      qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost, line_total: l.qty * l.unit_price,
      unit_label: l.kind === "product" && l.hasSubUnit ? (l.saleUnit === "sub" ? (l.subUnitName || t("retail.unitSingle")) : t("retail.unitBox")) : null,
    }));
    const draft: Invoice = {
      id: "draft", clinic_id: clinicId ?? null,
      customer_name: name.trim() || null, customer_phone: phone.trim() || null,
      pet_name: petNames.length ? petNames.join(" + ") : null,
      subtotal, discount: discountAmt, discount_type: null,
      payment_method: null, payment_details: null,
      // Nothing is owed on paper yet — marking it fully "paid" keeps the
      // paid/balance-due rows off a document that precedes any payment.
      total, amount_paid: total, cost_total: cost, profit, item_count: units,
      status: "paid", created_at: new Date().toISOString(),
    };
    const socials = getClinicSocials();
    const ok = openInvoicePrint(draft, draftItems, {
      clinicName: getClinicName() || user?.full_name || "doctorVet",
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      format,
      lang: i18n.language,
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      preSale: true,
    });
    if (!ok) { playWarning(); toast.error(t("retail.popupBlocked", "Allow pop-ups to print"), t("retail.popupBlockedHint", "Your browser blocked the print window — enable pop-ups for this site.")); }
    else void repo.logClientEvent("invoice.preprint", { total, items: cart.length, format }); // activity trail
  };

  const checkout = async () => {
    if (cart.length === 0 || busy) return;
    setBusy(true);
    try {
      const items: CheckoutItem[] = cart.map((l) => {
        // Sub-unit sale → deduct the precise box fraction (e.g. 5 of 20 pills = 0.25 box);
        // rounded to 3 decimals to keep stock free of binary-float drift.
        const isSub = l.kind === "product" && l.saleUnit === "sub" && !!l.unitsPerBox && l.unitsPerBox > 0;
        const stock_qty = l.product_id == null ? 0
          : isSub ? Math.round((l.qty / (l.unitsPerBox as number)) * 1000) / 1000
          : l.qty;
        const unit_label = l.kind === "product" && l.hasSubUnit
          ? (isSub ? (l.subUnitName || t("retail.unitSingle")) : t("retail.unitBox"))
          : null;
        return {
          product_id: l.product_id, name: l.name, barcode: l.barcode,
          qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost,
          stock_qty, unit_label,
        };
      });
      // Payment legs received today. Anything tendered ABOVE the total is change handed
      // back, so the recorded legs are trimmed to sum to the total (largest leg first) —
      // revenue-by-method stays accurate and amount_paid never exceeds the bill.
      let legs: PaymentSplit[] = payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: round2(p.amount) }));
      let over = round2(legs.reduce((s, p) => s + p.amount, 0) - total);
      if (over > 0.005) {
        legs = legs.slice().sort((a, b) => b.amount - a.amount);
        for (let i = 0; i < legs.length && over > 0.005; i++) {
          const cut = Math.min(legs[i].amount, over);
          legs[i] = { ...legs[i], amount: round2(legs[i].amount - cut) };
          over = round2(over - cut);
        }
        legs = legs.filter((p) => p.amount > 0);
      }
      const paidToday = round2(legs.reduce((s, p) => s + p.amount, 0)); // = min(total, tendered)
      const primary: PaymentMethod | null = legs.length ? legs.reduce((best, p) => (p.amount > best.amount ? p : best), legs[0]).method : null;
      // Every attached patient goes on the invoice (prints under "الحيوان: …").
      const petNames = Array.from(new Set(salePets.map((p) => p.name.trim()).filter(Boolean)));
      const meta: SaleMeta = {
        customer_name: name.trim() || null,
        customer_phone: phone.trim() || null,
        pet_name: petNames.length ? petNames.join(" + ") : null,
        // The client computes the authoritative final price (promotions + manual discount
        // + any manual final-price override, which may be a markup); the server records it.
        final_total: total,
        payment_method: primary,
        payment_details: legs.length ? legs : null,
        amount_paid: paidToday,
        staff_id: cashierId,
      };
      const invoice = await withTimeout(repo.retailCheckout(items, meta), 12000);
      // Med lines grouped per patient — each pet's record gets ITS OWN entries.
      const medByPet = new Map<string, MedicalDraft[]>();
      for (const l of cart) {
        if (l.kind !== "med" || !l.med || !l.petId) continue;
        const arr = medByPet.get(l.petId) ?? []; arr.push(l.med); medByPet.set(l.petId, arr);
      }
      // Snapshot the lines for instant printing (services + products, with overrides).
      // With several pets on one bill, each med line is labelled with its animal.
      const multiPet = petNames.length > 1;
      const invItems: InvoiceItem[] = cart.map((l) => ({
        id: `tmp-${l.id}`, invoice_id: invoice.id, clinic_id: clinicId ?? null,
        product_id: l.product_id, name: multiPet && l.petName ? `${l.name} — ${l.petName}` : l.name, barcode: l.barcode,
        qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost, line_total: l.qty * l.unit_price,
        unit_label: l.kind === "product" && l.hasSubUnit ? (l.saleUnit === "sub" ? (l.subUnitName || t("retail.unitSingle")) : t("retail.unitBox")) : null,
      }));
      playSuccess();
      // Show the completion screen immediately — the sale is final. The medical-record
      // sync runs AFTER, time-bounded and non-fatal, so its latency can never freeze
      // the receipt/print UI even if Supabase stalls mid-flow.
      setDone({ invoice, items: invItems });
      onSold();
      // Mirror medication/vaccine lines into each known patient's record —
      // administered dose, scheduled booster (→ reminders), treatment-sheet rows —
      // exactly as if entered from the record. One call per pet on the bill.
      if (medByPet.size) {
        try {
          await withTimeout(
            Promise.all(Array.from(medByPet, ([pid, drafts]) => persistMedicalEntries(pid, user?.full_name, drafts))),
            12000,
          );
        } catch (e) { toast.error(t("retail.medSyncFailed", "تم تسجيل البيع، لكن تعذّر تحديث السجل الطبي للحيوان"), e instanceof Error ? e.message : undefined); }
      }
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
            <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-ink-muted">
              <span className="flex items-center gap-1 text-success-600"><TrendingUp size={14} /> {t("retail.profit", "Profit")} {money(done.invoice.profit)}</span>
              {done.invoice.customer_name && <span className="flex items-center gap-1"><User size={14} /> {done.invoice.customer_name}</span>}
              {done.invoice.pet_name && <span className="flex items-center gap-1"><PawPrint size={14} /> {done.invoice.pet_name}</span>}
            </div>
            {dueOf(done.invoice) > 0.01 && (
              <div className="rounded-xl border border-warn-200 bg-warn-50 px-3 py-2 text-sm dark:border-warn-500/30 dark:bg-warn-500/10">
                <div className="flex items-center justify-between text-warn-700 dark:text-warn-300">
                  <span className="font-semibold">{t("retail.creditSaleSaved", "بيع آجل — دين على العميل")}</span>
                  <span className="font-bold tabular-nums">{money(dueOf(done.invoice))}</span>
                </div>
                <p className="mt-0.5 text-2xs text-ink-subtle">{t("retail.paidOfTotal", { paid: money(paidOf(done.invoice)), total: money(done.invoice.total), defaultValue: "مدفوع {{paid}} من {{total}} · يظهر في سجل الديون" })}</p>
              </div>
            )}
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
        {/* Bridge context — which animal(s) this sale is for. Several of the owner's
            pets can be attached; the highlighted one receives new med/vaccine lines. */}
        {salePets.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }}
            className="relative rounded-2xl border border-brand-200 bg-brand-50 px-3.5 py-2.5 text-sm dark:border-brand-500/30 dark:bg-brand-500/10">
            <div className="flex flex-wrap items-center gap-2">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-600 text-white"><PawPrint size={15} /></span>
              <span className="font-medium text-brand-800 dark:text-brand-200">{t("retail.saleFor", "البيع لـ")}</span>
              {salePets.map((p, i) => {
                const active = i === Math.min(activePetIdx, salePets.length - 1);
                return (
                  <span
                    key={(p.id ?? "x") + i}
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold transition",
                      active
                        ? "border-transparent bg-brand-600 text-white shadow-soft"
                        : "border-brand-300/60 bg-surface-1 text-brand-700 hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20",
                    )}
                  >
                    <button onClick={() => { playTap(); setActivePetIdx(i); }} className="inline-flex items-center gap-1">
                      <PawPrint size={11} /> {p.name}
                    </button>
                    {salePets.length > 1 && (
                      <button onClick={() => removePet(i)} aria-label={t("common.remove", "إزالة")} className={cn("grid h-4 w-4 place-items-center rounded-full transition", active ? "hover:bg-white/25" : "hover:bg-brand-200/60 dark:hover:bg-brand-500/30")}>
                        <X size={10} />
                      </button>
                    )}
                  </span>
                );
              })}
              <button
                onClick={() => void openPetPicker()}
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-brand-400/70 px-2.5 py-1 text-xs font-bold text-brand-700 transition hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20"
              >
                <Plus size={12} /> {t("retail.addAnotherPet", "حيوان آخر")}
              </button>
              {salePets.length > 1 && (
                <span className="text-2xs text-brand-700/70 dark:text-brand-300/70">{t("retail.activePetHint", "الأدوية واللقاحات الجديدة تُسجَّل على المحدد")}</span>
              )}
              <button onClick={() => { setSalePets([]); setPetPickOpen(false); }} aria-label={t("common.dismiss", "Dismiss")} className="ms-auto grid h-6 w-6 shrink-0 place-items-center rounded-full text-brand-700/70 transition hover:bg-brand-100 dark:text-brand-300 dark:hover:bg-brand-500/20"><X size={14} /></button>
            </div>

            {/* Owner's other animals first; the search covers every patient in the clinic */}
            {petPickOpen && (
              <div className="mt-2.5 rounded-xl border border-line bg-surface-1 p-2 shadow-raised">
                <div className="relative mb-1.5">
                  <Search size={13} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-2.5 rtl:right-2.5" />
                  <input
                    className="w-full rounded-lg bg-surface-2 py-1.5 text-xs text-ink outline-none placeholder:text-ink-subtle ltr:pl-8 ltr:pr-2 rtl:pr-8 rtl:pl-2"
                    value={petPickQ} onChange={(e) => setPetPickQ(e.target.value)}
                    placeholder={t("retail.petSearchPh", "ابحث باسم الحيوان أو المالك…")}
                  />
                </div>
                {petPickAll === null ? (
                  <p className="px-2 py-3 text-center text-xs text-ink-subtle">{t("common.loading", "جارٍ التحميل…")}</p>
                ) : petPickList.length === 0 ? (
                  <p className="px-2 py-3 text-center text-xs text-ink-subtle">{t("retail.noMorePets", "لا توجد حيوانات أخرى مطابقة.")}</p>
                ) : (
                  <div className="max-h-52 space-y-0.5 overflow-y-auto">
                    {petPickList.map(({ pet: p, owners }) => (
                      <button
                        key={p.id}
                        onClick={() => attachPet(p)}
                        className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-start transition hover:bg-surface-2"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300"><PawPrint size={13} /></span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-1.5 text-xs font-bold text-ink">
                            {p.name}
                            <span className="font-normal text-ink-subtle">· {t(`pet.species.${p.species}`, p.species)}</span>
                            {owners && <span className="chip bg-success-50 text-[10px] font-semibold text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("retail.sameOwner", "نفس المالك")}</span>}
                          </span>
                          {p.owner_name && <span className="block truncate text-2xs text-ink-subtle">{p.owner_name}</span>}
                        </span>
                        <Plus size={13} className="shrink-0 text-brand-600" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
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

          {/* Cashier / sales rep — optional; recorded on the invoice for staff reports */}
          <div className="mt-3 border-t border-line pt-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted">
              <Stethoscope size={14} className="text-brand-600" /> {t("retail.cashier", "موظف المبيعات / الكاشير")}
              <span className="text-2xs font-normal text-ink-subtle">· {t("retail.optional", "optional")}</span>
            </label>
            <CashierSelect value={cashierId} onChange={setCashierId} />
          </div>
        </div>

        {/* Products | Services | Medications toggle */}
        <div className="inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1">
          {([
            { v: "products", label: t("retail.products", "Products"), icon: <Package size={15} /> },
            { v: "services", label: t("retail.services", "Services"), icon: <Stethoscope size={15} /> },
            { v: "meds", label: t("retail.meds", "الأدوية"), icon: <Pill size={15} /> },
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
                  // A sub-unit product is only "out" when not even one single can be sold.
                  const subAvail = !!p.has_sub_unit && !!p.units_per_box && p.units_per_box > 0;
                  const out = subAvail ? p.stock * (p.units_per_box as number) < 1 : p.stock <= 0;
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
        ) : browseTab === "services" ? (
          <ServiceQuickSelect catalog={catalog} onPick={addService} flashId={flash} />
        ) : (
          <MedSaleForm species={activePet?.species ?? undefined} onAddLine={addMedLine} />
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
                        {l.kind === "med" && (
                          l.med?.kind === "vaccination"
                            ? <span className="chip shrink-0 bg-success-50 text-2xs font-medium text-success-700 dark:bg-success-500/15 dark:text-success-200"><Syringe size={10} className="me-0.5 inline" />{t("retail.vaccine", "لقاح")}</span>
                            : <span className="chip shrink-0 bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"><Pill size={10} className="me-0.5 inline" />{t("retail.medication", "دواء")}</span>
                        )}
                        {l.kind === "med" && l.petName && (
                          <span className="chip shrink-0 bg-surface-2 text-2xs font-medium text-ink-muted"><PawPrint size={10} className="me-0.5 inline" />{l.petName}</span>
                        )}
                      </p>
                      {l.kind === "med" && l.med && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-2xs text-ink-subtle">
                          {l.med.kind === "vaccination"
                            ? (l.med.nextDue
                                ? <><CalendarClock size={11} className="shrink-0 text-success-600" /> {t("retail.nextDose", "الجرعة القادمة")}: {prettyShort(l.med.nextDue)}{l.med.lot ? ` · Lot ${l.med.lot}` : ""}</>
                                : <>{t("retail.givenToday", "تُعطى اليوم")}{l.med.lot ? ` · Lot ${l.med.lot}` : ""}</>)
                            : <>{l.med.family} · {l.med.dosage}</>}
                        </p>
                      )}
                      <div className="mt-0.5 flex items-center gap-1 text-xs text-ink-subtle">
                        <PriceEdit value={l.unit_price} onChange={(v) => setPrice(l.id, v)} />
                        <span>
                          {l.kind === "product" && l.hasSubUnit
                            ? `/ ${l.saleUnit === "sub" ? (l.subUnitName || t("retail.unitSingle", "مفرد")) : t("retail.unitBox", "علبة")}`
                            : t("pos.each", "each")}
                        </span>
                      </div>
                      {/* Sale unit — sell the whole box or a single sub-unit (fractional stock) */}
                      {l.kind === "product" && l.hasSubUnit && (
                        <div className="mt-1 inline-flex items-center gap-0.5 rounded-lg border border-line p-0.5">
                          {([
                            { u: "box", label: t("retail.unitBox", "علبة") },
                            { u: "sub", label: l.subUnitName || t("retail.unitSingle", "مفرد") },
                          ] as const).map(({ u, label }) => {
                            const disabled = unitCap({ ...l, saleUnit: u }) < 1;
                            return (
                              <button
                                key={u} type="button" disabled={disabled}
                                onClick={() => { playTap(); setSaleUnit(l.id, u); }}
                                className={cn("rounded-md px-2 py-0.5 text-2xs font-bold transition",
                                  l.saleUnit === u ? "bg-brand-600 text-white"
                                    : disabled ? "cursor-not-allowed text-ink-subtle/40"
                                      : "text-ink-muted hover:bg-surface-2")}
                              >
                                {label}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { playTap(); setQty(l.id, l.qty - 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Minus size={14} /></button>
                      <span className="w-6 text-center text-sm font-bold tabular-nums text-ink">{l.qty}</span>
                      <button onClick={() => { playTap(); if (l.qty < unitCap(l)) setQty(l.id, l.qty + 1); else { playWarning(); toast.error(t("retail.maxStock", "No more in stock")); } }} className="grid h-7 w-7 place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3"><Plus size={14} /></button>
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
                <button onClick={() => setDiscountType("fixed")} className={cn("grid h-8 px-2 place-items-center text-2xs font-bold", discountType === "fixed" ? "bg-brand-600 text-white" : "bg-surface-1 text-ink-muted hover:bg-surface-2")} aria-label="Fixed">{currencySymbol()}</button>
              </div>
              <input type="number" min="0" step="1" inputMode="numeric" value={discountValue} onChange={(e) => { setDiscountValue(e.target.value); setFinalOverride(null); }} placeholder="0" className="input h-8 w-24 px-2 py-0 text-end text-sm" />
            </div>
          </div>

          {/* Payment — full, split across methods, or partial (credit / دفع آجل) */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
                <Wallet size={13} /> {t("retail.payment", "الدفع")}
                {isSplit && <span className="chip bg-brand-50 text-2xs font-medium text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">{t("retail.split", "دفع مجزأ")}</span>}
              </span>
              {payments.length < PAY_SEQUENCE.length && (
                <button onClick={addPayment} className="inline-flex items-center gap-1 text-2xs font-semibold text-brand-600 transition hover:text-brand-700">
                  <Plus size={12} /> {t("retail.addPayment", "إضافة طريقة دفع أخرى")}
                </button>
              )}
            </div>

            {/* ONE obvious choice: pay in full, or pay part and record the rest as
                debt. Credit selling (البيع بالدين) is a super-plan feature — for
                other plans the toggle is hidden, so every sale is paid in full. */}
            {canDebt && (
              <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-line bg-surface-2 p-1">
                <button
                  onClick={exitPartial}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-bold transition",
                    !partialUi ? "bg-surface-1 text-success-700 shadow-card dark:text-success-300" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t("retail.payFull", "💵 دفع كامل")}
                </button>
                <button
                  onClick={enterPartial}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-bold transition",
                    partialUi ? "bg-surface-1 text-warn-700 shadow-card dark:text-warn-300" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t("retail.payPartial", "🧾 دفع جزئي — الباقي دين")}
                </button>
              </div>
            )}

            {payments.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <div className="relative flex-1">
                  <select
                    value={p.method}
                    onChange={(e) => { playTap(); setPaymentMethod(i, e.target.value as PaymentMethod); }}
                    className="input h-9 w-full appearance-none py-0 ps-8 pe-2 text-sm font-semibold"
                  >
                    {PAY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{t(o.key, o.def)}</option>)}
                  </select>
                  {(() => { const Icon = PAY_OPTIONS.find((o) => o.value === p.method)?.icon ?? Banknote; return <Icon size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-2.5 rtl:right-2.5" />; })()}
                </div>
                <input
                  type="number" min="0" step="1" inputMode="decimal"
                  value={p.amount === 0 ? "" : String(p.amount)}
                  onChange={(e) => setPaymentAmount(i, e.target.value === "" ? 0 : Number(e.target.value))}
                  placeholder="0"
                  className="input h-9 w-24 px-2 py-0 text-end text-sm font-bold tabular-nums"
                />
                {isSplit && (
                  <button onClick={() => removePayment(i)} aria-label={t("common.delete", "إزالة")} className="grid h-9 w-7 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600"><X size={14} /></button>
                )}
              </div>
            ))}

            {/* Partial mode: quick amounts + a LOUD "this becomes debt" panel. */}
            {partialUi && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="text-2xs font-semibold text-ink-subtle">{t("retail.paysNow", "يدفع الآن:")}</span>
                  <button onClick={() => setPaidQuick(total / 2)} className="rounded-full border border-line bg-surface-1 px-3 py-1 text-2xs font-bold text-ink-muted transition hover:border-warn-300 hover:text-warn-700">{t("retail.half", "النصف")}</button>
                  <button onClick={() => setPaidQuick(total / 4)} className="rounded-full border border-line bg-surface-1 px-3 py-1 text-2xs font-bold text-ink-muted transition hover:border-warn-300 hover:text-warn-700">{t("retail.quarter", "الربع")}</button>
                  <button onClick={exitPartial} className="ms-auto rounded-full px-2 py-1 text-2xs font-semibold text-success-600 transition hover:text-success-700">{t("retail.collectFull", "تحصيل كامل المبلغ")}</button>
                </div>
                <div className="overflow-hidden rounded-xl border border-warn-200 dark:border-warn-500/30">
                  <div className="space-y-1 bg-warn-50/60 px-3 py-2.5 text-sm dark:bg-warn-500/10">
                    <div className="flex items-center justify-between text-ink-muted">
                      <span>{t("retail.paysNowLabel", "يدفع الآن")}</span>
                      <span className="font-bold tabular-nums text-ink">{money(totalPaid)}</span>
                    </div>
                    <div className="flex items-center justify-between font-display text-base font-extrabold text-warn-700 dark:text-warn-300">
                      <span>🧾 {t("retail.recordedAsDebt", "يُسجَّل دين")}</span>
                      <span className="tabular-nums">{money(Math.max(0, remaining))}</span>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-2 text-2xs font-semibold",
                    needsDebtName
                      ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300"
                      : "bg-surface-2 text-ink-muted",
                  )}>
                    {needsDebtName
                      ? t("retail.debtNeedsName", "⚠️ اكتب اسم الزبون (خانة «العميل» أعلاه) حتى يُسجَّل الدين باسمه")
                      : isCredit
                        ? t("retail.debtOnName", { name: name.trim(), defaultValue: "الدين سيُسجَّل باسم: {{name}} · يظهر في سجل الديون" })
                        : t("retail.noDebtYet", "قلّل «المبلغ المدفوع» أو اختر النصف/الربع — الباقي يُسجَّل ديناً تلقائياً")}
                  </div>
                </div>
              </>
            )}

            {/* Split / over-tendered calculator (non-credit cases). */}
            {!partialUi && (isSplit || change > 0) && (
              <div className="space-y-0.5 rounded-xl bg-surface-2 px-3 py-2 text-xs">
                <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.grandTotal", "إجمالي الفاتورة")}</span><span className="tabular-nums">{money(total)}</span></div>
                <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.amountReceived", "المبلغ المستلم")}</span><span className="tabular-nums">{money(totalPaid)}</span></div>
                <div className="flex items-center justify-between font-bold text-success-600">
                  <span>{change > 0 ? t("retail.changeDue", "الباقي") : t("retail.remaining", "المتبقي")}</span>
                  <span className="tabular-nums">{money(change > 0 ? change : Math.abs(remaining))}</span>
                </div>
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className="flex items-center justify-between text-ink-muted"><span>{t("retail.subtotal", "Subtotal")}</span><span className="tabular-nums">{money(subtotal)}</span></div>
            {finalOverride != null ? (
              /* Manual final price → a derived discount OR a surcharge (markup) line. */
              <>
                {discountAmt > 0 && (
                  <div className="flex items-center justify-between text-success-600">
                    <span className="flex items-center gap-1.5"><Tag size={13} className="shrink-0" />{t("retail.finalPriceDiscount", "خصم (سعر نهائي)")}</span>
                    <span className="shrink-0 tabular-nums">-{money(discountAmt)}</span>
                  </div>
                )}
                {surchargeAmt > 0 && (
                  <div className="flex items-center justify-between text-warn-600">
                    <span className="flex items-center gap-1.5"><Tag size={13} className="shrink-0" />{t("retail.finalPriceSurcharge", "زيادة (سعر نهائي)")}</span>
                    <span className="shrink-0 tabular-nums">+{money(surchargeAmt)}</span>
                  </div>
                )}
              </>
            ) : (
              <>
                {/* One distinct row per triggered Mix & Match offer, by the doctor's custom name. */}
                {promos.map((p) => (
                  <div key={p.ruleId} className="flex items-center justify-between text-success-600">
                    <span className="flex items-center gap-1.5 truncate"><Sparkles size={13} className="shrink-0" />{t("retail.promoLabel", { name: p.name, defaultValue: "Offer: {{name}}" })}</span>
                    <span className="shrink-0 tabular-nums">-{money(p.discount)}</span>
                  </div>
                ))}
                {manualDiscountAmt > 0 && <div className="flex items-center justify-between text-success-600"><span>{t("retail.discount", "Discount")}</span><span className="tabular-nums">-{money(manualDiscountAmt)}</span></div>}
              </>
            )}
            <div className="flex items-center justify-between">
              <span className="font-display font-bold text-ink">{t("retail.total", "Total")}</span>
              {editingTotal ? (
                <div className="flex items-center gap-1">
                  <span className="text-2xs font-bold text-ink-subtle">{currencySymbol()}</span>
                  <input
                    autoFocus type="number" min="0" step="1" inputMode="numeric" value={totalDraft}
                    onChange={(e) => setTotalDraft(e.target.value)}
                    onBlur={commitTotal}
                    onKeyDown={(e) => { if (e.key === "Enter") commitTotal(); if (e.key === "Escape") setEditingTotal(false); }}
                    className="w-28 rounded-lg border border-brand-400 bg-surface-1 px-2 py-1 text-end font-display text-lg font-extrabold tabular-nums text-ink outline-none"
                  />
                </div>
              ) : (
                <button
                  type="button" onClick={beginEditTotal} title={t("retail.editTotal", "تعديل السعر النهائي")}
                  className="inline-flex items-center gap-1.5 rounded-lg px-1.5 font-display text-xl font-extrabold tabular-nums text-ink underline decoration-dotted decoration-brand-400 underline-offset-4 transition hover:bg-brand-50 dark:hover:bg-brand-500/15"
                >
                  {money(total)} <Pencil size={13} className="text-ink-subtle" />
                </button>
              )}
            </div>
            {finalOverride != null && (
              <div className="flex items-center justify-end gap-1.5 text-2xs text-brand-600">
                <span>{t("retail.finalPriceManual", "سعر نهائي محدّد يدوياً")}</span>
                <button onClick={clearFinalOverride} className="rounded-full px-1.5 font-semibold underline decoration-dotted underline-offset-2 hover:text-brand-700">{t("retail.resetAuto", "إلغاء")}</button>
              </div>
            )}
            <div className="flex items-center justify-end gap-1 text-2xs text-success-600"><TrendingUp size={11} /> {t("retail.profit", "Profit")} {money(profit)}</div>
          </div>

          {preSaleEnabled && (
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" disabled={cart.length === 0} leftIcon={<Printer size={15} />} onClick={() => printPreSale("a4")} data-presale="a4">
                {t("retail.preSaleA4", "فاتورة أولية A4")}
              </Button>
              <Button variant="secondary" size="sm" disabled={cart.length === 0} leftIcon={<Printer size={15} />} onClick={() => printPreSale("thermal")} data-presale="thermal">
                {t("retail.preSaleThermal", "فاتورة أولية 80mm")}
              </Button>
            </div>
          )}
          <Button className="w-full" size="lg" disabled={cart.length === 0 || needsDebtName} loading={busy} onClick={checkout} leftIcon={<CheckCircle2 size={18} />}>
            {isCredit
              ? `${t("retail.completePartial", "إتمام البيع")} · ${t("retail.paysNowLabel", "يدفع الآن")} ${money(totalPaid)} · ${t("retail.debtShort", "دين")} ${money(remaining)}`
              : change > 0
                ? `${t("retail.complete", "إصدار الفاتورة")} · ${t("retail.changeDue", "الباقي")} ${money(change)}`
                : `${t("retail.complete", "إصدار الفاتورة")} · ${money(total)}`}
          </Button>
          {needsDebtName && (
            <p className="text-center text-2xs font-semibold text-danger-600">{t("retail.debtNameGate", "لا يمكن تسجيل دين بلا اسم — اكتب اسم الزبون أولاً")}</p>
          )}
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
