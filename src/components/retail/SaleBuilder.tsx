import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  Search, Barcode, Plus, Minus, Trash2, ShoppingCart, User, Phone, Tag, Percent, BadgePercent,
  Banknote, CreditCard, ArrowLeftRight, CheckCircle2, Printer, Sparkles, TrendingUp, Package, PawPrint, X,
  Stethoscope, Pencil, Pill, Syringe, CalendarClock, Wallet, StickyNote, Bike, UserCheck, AlertTriangle, Undo2,
  ChevronUp, ChevronDown, PanelLeftClose, PanelLeftOpen, Scale,
} from "lucide-react";
import type { Product, Invoice, InvoiceItem, CheckoutItem, SaleMeta, PaymentMethod, PaymentSplit, DiscountType, Customer, Service, ServiceCatalog, Species, Pet, Courier } from "@/types";
import { repo, resolveDiscount } from "@/lib/repo";
import { matchStaffToUser, resolveStaffName } from "@/lib/staffNames";
import { phoneDigits } from "@/lib/phone";
import { getServiceCatalog, findServiceByBarcode } from "@/lib/services";
import { computePromotions, getPromoRules } from "@/lib/promotions";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/lib/entitlements";
import { Button, useToast } from "@/components/ui";
import { ServiceQuickSelect } from "./ServiceQuickSelect";
import { QtyPad } from "./QtyPad";
import { WeightPicker } from "./WeightPicker";
import { MedSaleForm } from "./MedSaleForm";
import { CashierSelect } from "@/components/MedicalEntry";
import { useInvoicePrinter } from "./usePrintInvoice";
import { invoiceNo, openInvoicePrint, type PrintFormat } from "@/lib/invoicePrint";
import { getPreSalePrint, getResizableCart, getPosV2, getClinicLogo, getClinicSocials, getClinicName, getDeliveryZones, getQtyPromos, type QtyPromo } from "@/lib/settings";
import { branchStore } from "@/lib/branchStore";
import { useNavFolded, setNavFolded } from "@/lib/navFold";
import { persistMedicalEntries } from "@/lib/medSync";
import type { MedicalDraft } from "@/components/MedicalEntry";
import { cn, money, currencySymbol, formatNum, fmtKg } from "@/lib/utils";
import { splitCustomerField } from "@/lib/customerName";
import { dueOf, paidOf } from "@/lib/debt";
import { withTimeout, describeDbError, isNetworkError, isTimeoutError } from "@/lib/errors";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { matchSurgeryService, isSurgeryCategoryName, surgeryByRef, type SurgeryServiceMatch } from "@/lib/surgeryCatalog";

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
  /** سطر **راجع** (0122): الزبون رجّع هذي القطعة — قيمتها تُطرح من الحساب
   *  والقطعة ترجع للمخزون بنفس الفاتورة. المفتاح `r:` يفصله عن سطر البيع
   *  لنفس المنتج، فيقدر الكاشير يرجّع واحدة ويبيع ثنتين بعملية واحدة. */
  ret?: boolean;
  /** معرّف الخدمة بالكتالوج — تحتاجه عروض الخدمات لتعرف السطر أي خدمة هو
   *  (id السطر نصّ مركّب، وأسطر المختبر تحمل شكلاً آخر). */
  serviceId?: string | null;
  /** خدمة من تصنيف "عمليات/جراحة" — تُسجَّل كعملية باسمها مهما اختلفت اللهجة. */
  surgeryCat?: boolean;
  /** مرجع عملية من «مكتبة العمليات» — تعريف قاطع للنوع مهما تغيّر الاسم. */
  surgeryRef?: string | null;
  /** Fractional sales — this product can be sold whole (box) or by a smaller sub-unit. */
  hasSubUnit?: boolean;
  subUnitName?: string | null;   // e.g. "حبة" / "شريط" / "مل"
  unitsPerBox?: number | null;   // sub-units that fill one box
  boxPrice?: number;             // price of one whole box
  subPrice?: number | null;      // price of one sub-unit
  boxCost?: number;              // purchase price of one whole box
  saleUnit?: "box" | "sub";      // which unit this line is currently sold as
  /** يُباع بالوزن (كتلة، 0124): `qty` هو الوزن بالكيلو (كسريّ)، و`unit_price`
   *  سعرُ الكيلو الواحد. السعر يُحسب خطياً: نصف كيلو نصفُ السعر. المخزون كسريٌّ
   *  بالكيلو. حصريّ مقابل الوحدات الفرعية. */
  byWeight?: boolean;
  perKgPrice?: number;           // price of one whole kilo (the catalog sell_price)
  perKgCost?: number;            // purchase price of one kilo
}

/** A cart line's max quantity in its current sale unit, derived from the product's box
 *  stock. Sub-unit sales can go up to (boxes × units-per-box) singles. */
const unitCap = (l: Line): number => {
  // الراجع لا يقيّده المخزون: الزبون يرجّع ما اشتراه سابقاً، والرصيد الحالي
  // لا علاقة له بكم قطعةً بيده.
  if (l.ret) return Infinity;
  if (l.stock == null) return Infinity; // service / medication — uncapped
  // بالوزن: الرصيد كسريٌّ بالكيلو والوزن كسريّ — لا تُقرِّب السقف للأسفل.
  if (l.byWeight) return l.stock;
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
export interface RetailPrefill {
  name: string; phone: string; pet: string; petId?: string; species?: Species;
  /** بند خدمة يُضاف للسلة جاهزاً (مثل «تعداد الدم CBC» القادم من المختبر). */
  service?: string;
  /** نتيجة المختبر التي فتحت هذا البيع — تتعلم «مفوترة» تلقائياً عند الإتمام. */
  labId?: string;
}

/** A patient attached to the sale. Several can be attached (e.g. vaccinating all the
 *  owner's animals in one visit) — one is ACTIVE at a time: new medication/vaccine
 *  lines belong to it and the vaccine list follows its species. */
interface SalePet { id: string | null; name: string; species: Species | null }

/* --------------------- Draft persistence (walk-in cart) -------------------
 * The in-progress sale — cart, customer and discount — survives navigating
 * away and back, so the doctor can go look something up and return without
 * losing it. Keyed per clinic; cleared on checkout or "New sale". Per-patient
 * sales (opened with a prefill) are intentionally NOT persisted as a walk-in
 * draft. */
interface SaleDraft {
  cart: Line[]; name: string; phone: string; salePets: SalePet[];
  notes?: string;
  discountType: DiscountType; discountValue: string; finalOverride: number | null; cashierId: string | null;
  /** عروض الكمية المفعّلة يدوياً بالزر الأحمر — lineId → ruleId. */
  /** العروض المفعّلة — بمعرّف القاعدة (كانت بمعرّف السطر قبل 0102). */
  promoOn?: string[];
}
const saleDraftKey = (clinicId?: string) => `vp_sale_draft_${clinicId ?? "default"}`;
function loadSaleDraft(clinicId?: string): SaleDraft | null {
  try { const raw = localStorage.getItem(saleDraftKey(clinicId)); return raw ? (JSON.parse(raw) as SaleDraft) : null; } catch { return null; }
}
function saveSaleDraft(clinicId: string | undefined, d: SaleDraft): void {
  try {
    const empty = d.cart.length === 0 && !d.name.trim() && !d.phone.trim() && d.salePets.length === 0 && !(d.notes ?? "").trim();
    if (empty) localStorage.removeItem(saleDraftKey(clinicId));
    else localStorage.setItem(saleDraftKey(clinicId), JSON.stringify(d));
  } catch { /* ignore */ }
}
function clearSaleDraft(clinicId?: string): void { try { localStorage.removeItem(saleDraftKey(clinicId)); } catch { /* ignore */ } }

/* --------------------- Resizable cart (سلة قابلة لتغيير الحجم) ---------------
 * Opt-in from Settings → خيارات الكاشير. On wide (lg+) screens the cart column
 * grows/shrinks by dragging the handle on its inner edge; the chosen width is a
 * per-device preference. Pointer events cover mouse + touch + pen; double-click
 * (or Home on the keyboard) resets to the default width. */
const CART_W_DEFAULT = 380;
const CART_W_MIN = 300;
const CART_W_MAX = 720;
const CART_W_KEY = "vp_cart_width";
/** Keep the cart between its hard bounds AND leave the products pane usable.
 *
 *  The reserved budget for "sidebar + chrome + products" was a FLAT 700px —
 *  correct on desktops, fatal on iPad landscape: at 1024px it capped the cart
 *  to 324px, i.e. **below where it already was**, so dragging and the +/‑
 *  buttons visibly did nothing and the feature read as broken. The reserve now
 *  scales with the screen (45% of it, up to the old 700px), so the cart can
 *  always reach ~55% of any lg viewport — v2's own layout goes to 64%. */
function clampCartWidth(w: number): number {
  const reserve = typeof window !== "undefined" ? Math.min(700, Math.round(window.innerWidth * 0.45)) : 0;
  const viewportCap = typeof window !== "undefined" ? Math.max(CART_W_MIN, window.innerWidth - reserve) : CART_W_MAX;
  return Math.round(Math.min(CART_W_MAX, viewportCap, Math.max(CART_W_MIN, w)));
}
function loadCartWidth(fallback: number): number {
  // The stored PREFERENCE is bounded to the hard limits only — the viewport cap
  // is a display concern (gridStyle/apply clamp per paint), so a width chosen on
  // a big screen survives sessions spent on a smaller one.
  try {
    const raw = Number(localStorage.getItem(CART_W_KEY));
    if (Number.isFinite(raw) && raw > 0) return Math.min(CART_W_MAX, Math.max(CART_W_MIN, Math.round(raw)));
  } catch { /* ignore */ }
  return fallback;
}
function saveCartWidth(w: number): void {
  try { localStorage.setItem(CART_W_KEY, String(w)); } catch { /* ignore */ }
}

/** Reactive `min-width: 1024px` (Tailwind lg) — resizing only exists on wide screens. */
function useIsLg(): boolean {
  const [isLg, setIsLg] = useState(() => typeof window !== "undefined" && window.matchMedia("(min-width: 1024px)").matches);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setIsLg(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return isLg;
}

/** Drag state + handlers for the cart width. RTL-aware: dragging the handle
 *  toward the products pane always makes the cart wider.
 *
 *  Perf: pointer moves write the width STRAIGHT to a CSS variable on the grid
 *  element (no React state) — the 1000+-node sale tree (and its framer-motion
 *  layout animations) re-renders only once, at drag end, not 60×/second. */
function useCartResize(enabled: boolean, defaultW: number = CART_W_DEFAULT) {
  const { i18n } = useTranslation();
  const isLg = useIsLg();
  const gridRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(() => loadCartWidth(defaultW)); // committed PREFERENCE (persisted)
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ id: number; startX: number; startW: number; moved: boolean } | null>(null);
  const widthPref = useRef(width); // ref mirror of the committed preference
  const liveW = useRef(width); // the width currently painted (display-clamped)
  const dragEndAt = useRef(0); // suppress the dblclick fired by two quick drags

  // While dragging: freeze text selection & keep the resize cursor everywhere.
  useEffect(() => {
    if (!dragging) return;
    const prevSelect = document.body.style.userSelect;
    const prevCursor = document.body.style.cursor;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    return () => {
      document.body.style.userSelect = prevSelect;
      document.body.style.cursor = prevCursor;
    };
  }, [dragging]);

  const active = enabled && isLg;

  /** Paint a width now (CSS var, no re-render) and remember it. */
  const apply = (w: number) => {
    liveW.current = w;
    gridRef.current?.style.setProperty("--cart-w", `${w}px`);
  };
  /** Commit = the user CHOSE this width: re-render with it + persist it. */
  const commit = (w: number) => {
    apply(w);
    widthPref.current = w;
    setWidth(w);
    saveCartWidth(w);
  };

  // The handle can vanish MID-drag (window resized below lg, setting toggled):
  // abandon the drag cleanly so the body cursor/selection unfreeze and the last
  // painted width still gets persisted.
  useEffect(() => {
    if (active) return;
    if (drag.current) {
      drag.current = null;
      setDragging(false);
      setWidth(liveW.current);
      saveCartWidth(liveW.current);
    }
  }, [active]);

  // Window shrinks after the width was chosen → clamp the DISPLAYED width so
  // the products pane never collapses — but never persist that clamp: the saved
  // preference survives, and re-growing the window restores it automatically.
  useEffect(() => {
    if (!active) return;
    const onResize = () => {
      if (drag.current) return; // live drags clamp per-move already
      apply(clampCartWidth(widthPref.current));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (drag.current) return; // one pointer owns the drag — ignore extra touches
    if (e.button !== 0 && e.pointerType === "mouse") return; // primary button only
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { id: e.pointerId, startX: e.clientX, startW: liveW.current, moved: false };
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    const delta = e.clientX - d.startX;
    if (Math.abs(delta) > 3) d.moved = true;
    // RTL: cart sits at the inline-end (left); its inner edge moves RIGHT (+x) to widen.
    // LTR: mirrored — the inner edge moves LEFT (−x) to widen.
    apply(clampCartWidth(d.startW + (i18n.dir() === "rtl" ? delta : -delta)));
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    if (d.moved) dragEndAt.current = Date.now();
    drag.current = null;
    setDragging(false);
    commit(liveW.current);
  };
  const reset = () => {
    // Two quick REAL drags register as a double-click; that synthetic dblclick
    // lands within a few ms of the second drag's pointerup — swallow only that,
    // so a genuine double-tap (no movement) still resets.
    if (Date.now() - dragEndAt.current < 150) return;
    commit(clampCartWidth(defaultW));
    playTap();
  };
  /** تكبير/تصغير بضغطة — للآيباد والأصابع: زرّان بترويسة السلة يوصلان لنفس
   *  commit الذي يوصله السحب، فلا يعتمد تغيير الحجم على إصابة مقبضٍ رفيع. */
  const nudge = (dir: 1 | -1) => {
    commit(clampCartWidth(liveW.current + dir * 80));
    playTap();
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // "Wider" is always the arrow pointing INTO the products pane.
    const rtl = i18n.dir() === "rtl";
    const nudge = (dir: 1 | -1) => commit(clampCartWidth(liveW.current + dir * 24));
    if (e.key === "ArrowRight") { e.preventDefault(); nudge(rtl ? 1 : -1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); nudge(rtl ? -1 : 1); }
    else if (e.key === "Home") { e.preventDefault(); reset(); }
  };

  return {
    active, width, dragging, gridRef, nudge,
    // The grid reads the LIVE width from the CSS var; React re-seeds the var on
    // re-renders with the DISPLAY-clamped preference (never wider than the
    // current viewport allows, never persisted).
    gridStyle: active ? ({ gridTemplateColumns: "minmax(0,1fr) var(--cart-w)", "--cart-w": `${clampCartWidth(width)}px` } as React.CSSProperties) : undefined,
    handleProps: { onPointerDown, onPointerMove, onPointerUp: endDrag, onPointerCancel: endDrag, onDoubleClick: reset, onKeyDown },
  };
}

/** The grab handle riding the cart's inner edge (inside the grid gap). */
function CartResizeHandle({ dragging, width, handleProps }: { dragging: boolean; width: number; handleProps: React.HTMLAttributes<HTMLDivElement> }) {
  const { t } = useTranslation();
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("retail.cartResize", "تغيير عرض السلة")}
      aria-valuemin={CART_W_MIN}
      aria-valuemax={CART_W_MAX}
      aria-valuenow={width}
      tabIndex={0}
      title={t("retail.cartResizeHint", "اسحب لتغيير عرض السلة — نقرة مزدوجة للإرجاع")}
      /* منطقة الإمساك ٢٨ بكسل — القديمة (١٦) كانت أضيق من إصبعٍ على آيباد،
         فيسحب الطبيب «جنب» المقبض ولا يتغيّر شيء ويظن الميزة معطّلة. */
      className="group absolute -start-5 top-0 z-10 hidden h-full w-7 cursor-col-resize touch-none items-center justify-center outline-none lg:flex"
      {...handleProps}
    >
      <span
        className={cn(
          "h-20 w-1.5 rounded-full transition-all group-hover:h-28 group-hover:w-2 group-focus-visible:ring-2 group-focus-visible:ring-brand-400",
          dragging ? "h-32 w-2 bg-brand-500" : "bg-line-strong group-hover:bg-brand-400",
        )}
      />
    </div>
  );
}

export function SaleBuilder({ products, clinicId, onSold, prefill }: { products: Product[]; clinicId?: string; onSold: () => void; prefill?: RetailPrefill | null }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const print = useInvoicePrinter();
  const { user } = useAuth();
  const { has } = useEntitlements();
  const canDebt = has("debt"); // البيع بالدين — super plan only (full during trial)

  // Restore an unfinished walk-in sale (see SaleDraft). Read ONCE on mount.
  const [draft0] = useState(() => (prefill ? null : loadSaleDraft(clinicId)));

  const [cart, setCart] = useState<Line[]>(draft0?.cart ?? []);
  const [browseTab, setBrowseTab] = useState<"products" | "services" | "meds">("products");
  /* شاشة البيع الجديدة (0109) — تفعيل اختياري لكل عيادة. تُقرأ مرة عند الرسم:
   * تبديلها من الإعدادات يعيد تحميل الصفحة، فلا حاجة لمراقبة حيّة. */
  const posV2 = getPosV2();
  /* وضع التركيز — الشريط المطويّ يوسّع السلة حيّاً (بلا إعادة تحميل). */
  const navFolded = useNavFolded();
  /* الحقول الاختيارية (عميل · بائع · ملاحظة) مطويّة افتراضياً بالشاشة الجديدة:
   * البيع النقدي السريع لا يحتاجها، وهي كانت تأكل ٣٧١px فوق شبكة المنتجات. */
  const [detailsOpen, setDetailsOpen] = useState(false);
  /* لوح السلة على الشاشات الضيّقة — يُفتح من الشريط الملتصق بالأسفل. */
  const [cartSheet, setCartSheet] = useState(false);
  /* أدوات الدفع (خصم · طريقة دفع · فاتورة أولية) مطويّة: كانت تحتل ٣٢٤px من
   * السلة بينما الأصناف ٢٨٥px — والبيع النقدي الغالب لا يلمسها إطلاقاً. */
  const [payTools, setPayTools] = useState(false);
  /* كثافة تكيّفية: مع تجاوز سبعة أصناف يرشّق السطر تلقائياً (سعر الوحدة يُخفى
   * وأزرار الكمية تصغر قليلاً) فترتفع سعة السلة من ٨ أصناف مرئية إلى ١٢+ —
   * «يشوف كل المنتجات الي يضيفهن شكد ما جانن». تبقى الأهداف فوق حدّ اللمس. */
  const denseCart = posV2 && cart.length > 7;
  /* السلة العريضة تنقسم عمودين: العرض وحده لا يُظهر صنفاً واحداً إضافياً —
   * الذي يُظهر الأصناف هو الارتفاع. فعند ٦٢٠px فأكثر يصير كل صفٍّ نصف عرض
   * ويتضاعف عدد الأصناف المرئية فعلياً. القياس من العنصر نفسه لا من النافذة:
   * السلة قابلة للسحب وعرضها ليس دالّة ثابتة بعرض الشاشة. */
  const cartBoxRef = useRef<HTMLDivElement | null>(null);
  const [cartW, setCartW] = useState(0);
  const cartCols2 = posV2 && cartW >= 620 && cart.length > 6;
  /* ارتفاع منطقة البيع يُقاس فعلياً من موضعها على الشاشة بدل تخمين ارتفاع
   * الترويسة: أي تغيّر بالترويسة أو حجم الخط لا يعيد كسر التخطيط. */
  const posRootRef = useRef<HTMLDivElement | null>(null);
  const [posH, setPosH] = useState<string | undefined>(undefined);
  const [catalog] = useState<ServiceCatalog>(() => getServiceCatalog());
  // Doctor-defined Mix & Match offers (clinic-scoped). Loaded once per sale session.
  const [promoRules] = useState(() => getPromoRules());
  // عروض الكمية «كل N قطع خصم X» — التطبيق يدوي بالزر الأحمر بجانب السطر.
  const [qtyRules] = useState<QtyPromo[]>(() => getQtyPromos().filter((r) => r.active));
  const [promoOn, setPromoOn] = useState<string[]>(draft0?.promoOn ?? []);
  const [query, setQuery] = useState("");
  const [name, setName] = useState(draft0?.name ?? "");
  const [phone, setPhone] = useState(draft0?.phone ?? "");
  // Patients attached to this sale. The ACTIVE one receives new medication/vaccine
  // lines; more of the owner's animals can be attached to vaccinate them in one visit.
  const [salePets, setSalePets] = useState<SalePet[]>(draft0?.salePets ?? []);
  const [saleNotes, setSaleNotes] = useState(draft0?.notes ?? "");
  const [activePetIdx, setActivePetIdx] = useState(0);
  const activePet: SalePet | null = salePets[Math.min(activePetIdx, salePets.length - 1)] ?? null;
  // "+ حيوان آخر" picker: the clinic's pets, owner's animals surfaced first.
  const [petPickOpen, setPetPickOpen] = useState(false);
  const [petPickAll, setPetPickAll] = useState<Pet[] | null>(null); // null = loading
  const [petPickQ, setPetPickQ] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [custMatches, setCustMatches] = useState<Customer[]>([]);
  const [custOpen, setCustOpen] = useState(false);
  const [discountType, setDiscountType] = useState<DiscountType>(draft0?.discountType ?? "percent");
  const [discountValue, setDiscountValue] = useState(draft0?.discountValue ?? "");
  // Doctor-set FINAL price: the total to charge outright. The gap from the subtotal
  // becomes an automatic (approximate) discount. Null = compute the total normally.
  const [finalOverride, setFinalOverride] = useState<number | null>(draft0?.finalOverride ?? null);
  const [editingTotal, setEditingTotal] = useState(false);
  const [totalDraft, setTotalDraft] = useState("");
  // Tracks the subtotal that a manual final price was anchored to, so that
  // adding/removing items afterwards shifts the final price by the SAME delta —
  // the doctor's discount amount stays fixed and a newly added item is charged
  // in full, instead of being silently swallowed by the frozen final price.
  const prevSubtotalRef = useRef(0);
  // Payment allocation — one leg by default (full total), expandable into a split, or
  // reduced below the total to save the sale on credit (دفع آجل).
  const [payments, setPayments] = useState<PaymentSplit[]>([{ method: "cash", amount: 0 }]);
  // Whether the cashier has manually touched the paid amount (stops the auto-pin to total).
  const [paidEdited, setPaidEdited] = useState(false);
  // Explicit "دفع جزئي" mode — the cashier chose partial payment via the button
  // (a manually-typed shortfall still shows the same loud debt panel).
  const [partialMode, setPartialMode] = useState(false);
  // ---- Delivery mode (توصيل — الدفع عند الاستلام) --------------------------
  // The sale ships with a courier: stock is deducted now, but the money enters
  // the system only when the courier hands it over (see the التوصيل tab).
  const [deliveryOn, setDeliveryOn] = useState(false);
  const [dCouriers, setDCouriers] = useState<Courier[] | null>(null); // null = not loaded yet
  const [dCourierId, setDCourierId] = useState("");
  // منطقة التوصيل — من قائمة العيادة (الإعدادات ← مناطق التوصيل). اختيار
  // المنطقة يملأ الأجرة تلقائياً (وتبقى قابلة للتعديل) وينحفظ على الطلب.
  const [dZone, setDZone] = useState("");
  const [dAddress, setDAddress] = useState("");
  const [dFee, setDFee] = useState("");
  const [dFeeToClinic, setDFeeToClinic] = useState(false);
  // Optional cashier / sales rep (staff id) — attached to the invoice for reports.
  const [cashierId, setCashierId] = useState<string | null>(draft0?.cashierId ?? null);

  // البائع الافتراضي = الموظف المسجّل دخوله حالياً (يُطابَق مع صف الكادر ماله
  // بمعرّف الحساب أو الإيميل) — فكل فاتورة تنحسب لصاحبها من دون أي ضغطة.
  // مسودة محفوظة أو اختيار يدوي سابق يبقيان مقدَّمين على التلقائي.
  useEffect(() => {
    if (cashierId) return;
    let alive = true;
    void matchStaffToUser(user?.id, user?.email).then((m) => {
      if (alive && m) setCashierId((c) => c ?? m.id);
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  /* ---- المضاعِف: «اكتب ٢٠ ثم امسح» -------------------------------------
   * عشرون قطعة من صنف واحد كانت تكلّف عشرين مسحة أو عشرين ضغطة. المضاعِف
   * يجعلها مسحةً واحدة. مبدآن يحكمانه:
   *   • لا يُسلَّح بمجرّد كتابة أرقام أبداً — الماسح نفسه «يكتب» أرقاماً،
   *     وحقل البحث كذلك. التسليح بفعلٍ صريح: «٢٠*» بالبحث، أو نجمة/× من
   *     الكيبورد خارج الحقول، أو زر ×N باللمس.
   *   • لا يبقى معلّقاً بصمت: شارة بارزة، وEsc يلغيه، ويُطفأ وحده بعد ١٥
   *     ثانية — مضاعِفٌ منسيّ يعني فاتورةً غلط. */
  const [mult, setMult] = useState<number | null>(null);
  const [multPad, setMultPad] = useState(false);
  const [qtyPadFor, setQtyPadFor] = useState<string | null>(null);
  /** منتقي الوزن مفتوح على منتج كتلة (0124): البيع أو الراجع يُختار بالكيلو. */
  const [weightFor, setWeightFor] = useState<{ p: Product; ret: boolean } | null>(null);
  /* مرجعُ البيعة الجارية — يُنشأ عند أول محاولة ويُمسح عند التصفير. مرجعٌ لا
   * حالة: تغيّره لا يعيد الرسم، وقيمته لازمة داخل المعالج لا بالعرض. */
  const saleRefRef = useRef<string | null>(null);
  const [done, setDone] = useState<{ invoice: Invoice; items: InvoiceItem[] } | null>(null);
  const [lastPrints, setLastPrints] = useState(0);
  /** وضع الراجع: كل باركود يُمسح وهو مُفعَّل ينزل سطراً سالباً. */
  const [retMode, setRetMode] = useState(false);
  // Opt-in resizable cart (Settings → خيارات الكاشير) — drag the cart edge on lg+.
  // بالشاشة المتطورة الافتراضي يطابق عرضها التصميمي (~46% من الشاشة) لا 380
  // بكسل القديمة — تفعيل التحجيم ما ينبغي أن «يصغّر» سلة الكاشير المتطور.
  const cartResize = useCartResize(
    getResizableCart(),
    posV2 && typeof window !== "undefined" ? Math.round(window.innerWidth * 0.46) : CART_W_DEFAULT,
  );

  const flashLine = (id: string) => { setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 600); };

  /** استهلاك المضاعِف المعلّق: يُقرأ مرة واحدة ثم يعود لواحد فوراً — مضاعِف
   *  يبقى بعد استعماله هو أخطر من عدم وجوده أصلاً. */
  const takeMult = (): number => {
    const n = mult && mult > 0 ? Math.floor(mult) : 1;
    if (mult != null) setMult(null);
    return n;
  };

  /* «اكتب الرقم وامسح» — بلا أي مفتاح تسليح.
   * حقل البحث فيه رقم مجرّد (٢..٩٩٩) وقت المسح ⇒ الرقم كمية لا كلمة بحث.
   *
   * لماذا **عند المسح فقط** ولا يُطبَّق على ضغطة بطاقة المنتج: «رمل ٢٠ كغم»
   * اسمٌ حقيقي، ومن يكتب ٢٠ ليبحث عنه ثم يضغط النتيجة يقصد صنفاً واحداً لا
   * عشرين. أمّا من رفع الماسح فقد حسم أمره: الرقم الذي كتبه كمية. وللّمس
   * مدخلُه الصريح (زر ×N) الذي يعمل على البطاقات أيضاً.
   * والسقف ٩٩٩ يترك البحث بالباركود الرقمي الطويل يعمل كما هو. */
  const queryMult = (): number | null => {
    const m = /^(\d{1,3})$/.exec(query.trim());
    if (!m) return null;
    const n = Number(m[1]);
    return n >= 2 ? n : null;
  };
  /** الكمية المطبَّقة على مسحة: المضاعِف الصريح أولاً، وإلا رقم حقل البحث.
   *
   *  الماسح **يكتب داخل حقل البحث** حين يكون مركّزاً — وهذا هو الحال الطبيعي
   *  بالكاشير. فالطبيب يكتب «٢٠» ثم يمسح، فيصير محتوى الحقل «209001» لا «٢٠»،
   *  والنمط الرقمي المجرّد يفشل فتنزل قطعة واحدة. هذا بالضبط ما اشتكى منه.
   *  العلاج: نقشّر رمز الباركود من ذيل الحقل، فما يتبقّى هو ما كتبه الإنسان.
   *  (وإن كان الحقل غير مركّز فلا ذيل نقشّره، ويبقى المسار الأول صحيحاً.)
   *
   *  القراءة هنا والاستهلاك بعد نجاح المطابقة — مسحةٌ لباركود مجهول يجب ألّا
   *  تبتلع الرقم الذي كتبه الطبيب. */
  const peekScanMult = (code: string): number => {
    if (mult != null && mult >= 2) return Math.floor(mult);
    const q = query.trim();
    const bare = code.trim();
    const typed = bare && q.endsWith(bare) ? q.slice(0, q.length - bare.length).trim() : q;
    const m = /^(\d{1,3})$/.exec(typed);
    const n = m ? Number(m[1]) : 0;
    return n >= 2 ? n : 1;
  };

  // Add (or increment) a line; products are capped at their stock.
  // n = الكمية المضافة (١ افتراضاً، أو المضاعِف المعلّق). السطر الموجود **يجمع**
  // لا يُستبدل: هذا سلوك المسح المعتاد، ومخالفته تفاجئ الكاشير بصمت.
  const bump = (id: string, factory: () => Line, n = 1) => {
    // القصّ يُحسب **قبل** التحديث لا داخله: مُحدِّث setCart يُنفَّذ لاحقاً عند
    // إعادة الرسم، فقراءة نتيجته فوراً كانت تُسكِت رسالة «المتوفّر ١٧ فقط».
    const existing = cart.find((l) => l.id === id);
    const base = existing ?? factory();
    const cap = unitCap(base);
    const want = (existing?.qty ?? 0) + n;
    setCart((c) => (c.some((l) => l.id === id)
      // الحساب من الحالة الحيّة: مسحتان متلاحقتان لا تفقد إحداهما.
      ? c.map((l) => (l.id === id ? { ...l, qty: Math.min(l.qty + n, unitCap(l)) } : l))
      : [...c, { ...base, qty: Math.max(1, Math.min(n, cap)) }]));
    // نغمة مختلفة للإضافة بالجملة: الأذن أسرع من العين وقت الزحمة، والفرق بين
    // «واحدة» و«عشرين» يجب أن يُسمع لا أن يُقرأ.
    if (n > 1) window.setTimeout(() => playTap(), 90);
    // السقف يُبلَّغ ولا يُبتلع: «طلبت ٢٠ والمتوفّر ١٧» أوضح من رقمٍ يظهر ناقصاً.
    if (n > 1 && Number.isFinite(cap) && want > cap) {
      playWarning();
      toast.error(t("retail.multClamped", { n: formatNum(cap), defaultValue: "المتوفّر {{n}} فقط — أُضيف المتاح" }));
    }
    flashLine(id);
  };

  /** وضع «الراجع»: الباركود المدگوگ ينزل سطراً سالباً بدل سطر بيع. */
  const addReturn = (p: Product, n = takeMult()) =>
    bump(`r:${p.id}`, () => ({
      id: `r:${p.id}`, kind: "product", name: p.name, barcode: p.barcode ?? null,
      unit_price: p.sell_price, unit_cost: p.purchase_price,
      qty: 1, stock: null, product_id: p.id, subcategory: p.subcategory ?? null,
      ret: true,
    }), n);

  // منتج يُباع بالوزن (كتلة): لا يُضاف بمسحةٍ واحدة — يفتح منتقي الوزن ليُختار
  // الكيلو فيُحسب السعر خطياً. المضاعِف لا معنى له هنا (الوزن يُختار بيده).
  const addWeightLine = (p: Product, kg: number, ret: boolean) => {
    const id = ret ? `r:${p.id}` : `p:${p.id}`;
    const qty = Math.round(kg * 1000) / 1000;
    const line: Line = {
      id, kind: "product", name: p.name, barcode: p.barcode ?? null,
      unit_price: p.sell_price, unit_cost: p.purchase_price,
      qty, stock: ret || p.pooled ? null : p.stock,
      product_id: p.id, subcategory: p.subcategory ?? null,
      byWeight: true, perKgPrice: p.sell_price, perKgCost: p.purchase_price, ret: ret || undefined,
    };
    // الوزن يُستبدل لا يُجمَع: الكاشير يختار الوزن الكلّي، فإعادة الفتح تعدّله.
    // لكن **سعر الكيلو المعدَّل بيد الكاشير يبقى**: تعديلُ الوزن لا يجوز أن
    // يعيد السعر بهدوءٍ لسعر الكتلوج — تلك فلوسٌ تتغيّر بلا أن يطلبها أحد.
    setCart((c) => (c.some((l) => l.id === id)
      ? c.map((l) => (l.id === id ? { ...l, ...line, unit_price: l.unit_price, unit_cost: l.unit_cost } : l))
      : [...c, line]));
    playSuccess();
    flashLine(id);
  };

  const addProduct = (p: Product, n = takeMult()) => {
    if (p.sold_by_weight) { playTap(); setWeightFor({ p, ret: retMode }); return; }
    return retMode ? addReturn(p, n) : bump(`p:${p.id}`, () => {
      const hasSub = !!p.has_sub_unit && !!p.units_per_box && p.units_per_box > 0;
      const unitsPerBox = p.units_per_box ?? null;
      // No whole box left but singles remain → start the line on the sub-unit.
      const startSub = hasSub && Math.floor(p.stock) < 1;
      const subCost = hasSub && unitsPerBox ? Math.round((p.purchase_price / unitsPerBox) * 100) / 100 : 0;
      return {
        id: `p:${p.id}`, kind: "product", name: p.name, barcode: p.barcode ?? null,
        unit_price: startSub ? (p.sub_unit_price ?? 0) : p.sell_price,
        unit_cost: startSub ? subCost : p.purchase_price,
        // A pooled (legacy, unknown-count) product sells from its section pool —
        // it has no own per-barcode count, so leave the cart line UNCAPPED (the
        // server deducts tracked-then-pool and clamps). Capping it at its 0 stock
        // is what collapsed a second scan to qty 0.
        qty: 1, stock: p.pooled ? null : p.stock, product_id: p.id, subcategory: p.subcategory ?? null,
        hasSubUnit: hasSub, subUnitName: p.sub_unit_name ?? null, unitsPerBox,
        boxPrice: p.sell_price, subPrice: p.sub_unit_price ?? null, boxCost: p.purchase_price,
        saleUnit: startSub ? "sub" : "box",
      };
    }, n);
  };

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

  const addService = (s: Service, n = takeMult()) => {
    // الخدمة تُنسب للحيوان النشط — خدمة "عملية" تسجَّل تلقائياً في طبلته عند الإتمام.
    const catName = catalog.categories.find((c) => c.id === s.category_id)?.name ?? null;
    bump(`s:${s.id}`, () => ({ id: `s:${s.id}`, kind: "service", name: s.name, barcode: null, unit_price: s.price, unit_cost: s.cost ?? 0, qty: 1, stock: null, product_id: null, subcategory: null, serviceId: s.id, petId: activePet?.id ?? null, petName: activePet?.name ?? null, surgeryCat: isSurgeryCategoryName(catName), surgeryRef: s.surgery_ref ?? null }), n);
  };

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

  const removeLine = (id: string) => {
    setCart((c) => c.filter((l) => l.id !== id));
    // سطر انحذف → عرضه المفعّل يروح وياه (لا يبقى بالمسودة).
    // السطر انحذف → أي عرض ما عاد مؤهلاً ينطفئ لوحده بإعادة الحساب أدناه.
  };

  /** تسليح المضاعِف — من الكيبورد أو من اللوحة اللمسية، بنفس الحارس. */
  const armMult = (n: number) => {
    const v = Math.floor(n);
    if (!Number.isFinite(v) || v < 2) { setMult(null); return; }
    playTap();
    setMult(Math.min(v, 9999));
  };

  /* مضاعِف منسيّ = فاتورة غلط. يُطفأ وحده بعد ١٥ ثانية من التسليح. */
  useEffect(() => {
    if (mult == null) return;
    const id = window.setTimeout(() => setMult(null), 15000);
    return () => window.clearTimeout(id);
  }, [mult]);

  /* التسليح من الكيبورد خارج الحقول: أرقام ثم نجمة/×. الأرقام السريعة
   * (< 25ms بينها) تُهمَل عمداً — تلك يد الماسح لا يد الإنسان. */
  useEffect(() => {
    if (done) return;
    let buf = "";
    let last = 0;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMult((m) => (m == null ? m : null)); return; }
      const el = document.activeElement as HTMLElement | null;
      const inField = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (inField || e.ctrlKey || e.metaKey || e.altKey) return;
      const now = Date.now();
      const gap = now - last;
      last = now;
      if (e.key >= "0" && e.key <= "9") {
        if (gap < 25) { buf = ""; return; }   // دفقة ماسح
        if (gap > 3000) buf = "";             // كتابة قديمة منسية
        buf = (buf + e.key).slice(-4);
        return;
      }
      if (e.key === "*" || e.key === "x" || e.key === "X" || e.key === "×") {
        const n = Number(buf);
        buf = "";
        if (n >= 2) { e.preventDefault(); armMult(n); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  useBarcodeScanner(async (code) => {
    if (done) return;
    const n = peekScanMult(code);
    const product = await repo.getProductByBarcode(code, clinicId);
    if (product) {
      playSuccess();
      addProduct(product, n);
      if (mult != null) setMult(null);
      setQuery(""); // clear any scanned digits that landed in the focused search box
      return;
    }
    // ما طابق منتجاً → جرّب الخدمات: العيادة تصنع باركود لخدماتها المتكررة
    // (فحص عام، CBC…) وتطبعه بنفسها، فتنباع بمسحة بدل تنقّل بين التصنيفات.
    const svc = findServiceByBarcode(code);
    if (svc) {
      playSuccess();
      addService(svc, n);
      if (mult != null) setMult(null);
      setQuery("");
      return;
    }
    playWarning();
    // باركود مجهول: نقشّر رمزه من الحقل فقط — ما كتبه الطبيب (كمية أو بحث)
    // يبقى بمكانه، ولا تتلوّث خانة البحث بأرقام مسحةٍ فاشلة.
    setQuery((q) => (code && q.endsWith(code) ? q.slice(0, q.length - code.length) : q));
    toast.error(t("pos.notFoundAny", "ماكو منتج ولا خدمة بهذا الباركود"), code);
    // اللوحة مفتوحة = الأرقام تخصّها؛ مسحةٌ تدخل صنفاً خلف نافذة مفتوحة تربك.
    // منتقي الوزن مثلها: مسحةٌ وهو مفتوح كانت تبدّل المنتج تحت يد الطبيب أو
    // تنزل سطراً خلف الورقة بلا أن يراه.
  }, { disabled: multPad || !!qtyPadFor || !!weightFor });

  // The bridge: a doctor clicked "Sell items" inside an animal record. Auto-fill the
  // customer, surface the pet context, and focus the scan field for a zero-click flow.
  useEffect(() => {
    if (!prefill) return;
    if (prefill.name) setName(prefill.name);
    if (prefill.phone) setPhone(prefill.phone);
    setSalePets(prefill.pet ? [{ id: prefill.petId || null, name: prefill.pet, species: prefill.species || null }] : []);
    setActivePetIdx(0);
    setDone(null);
    // بند المختبر: التحليل ينزل بالسلة جاهزاً بسعره من كتالوج الخدمات (إن وُجد
    // اسم مطابق أو قريب) — والكاشير يعدّل السعر بحرية مثل أي بند خدمة.
    if (prefill.service) {
      const label = prefill.service;
      const lineId = `s:lab:${prefill.labId ?? label}`;
      // طابق التحليل مع خدمة الكتالوج مال العيادة نفسها — وإذا لكيناها ناخذ
      // اسمها وسعرها كما حددهما الدكتور بالضبط (تطابق تام أولاً، وإلا أعلى
      // تقاطع كلمات مع أفضلية خدمات تصنيف «المختبر»).
      const catalog = getServiceCatalog();
      const labCatIds = new Set(catalog.categories.filter((c) => /مختبر|تحاليل|مختبرات/.test(c.name)).map((c) => c.id));
      const tok = (x: string) => x.toLowerCase().replace(/[()\u064B-\u065F،.\-]/g, " ").split(/\s+/).filter((w) => w.length >= 2);
      const want = new Set(tok(label));
      let best: { s: Service; score: number } | null = null;
      for (const svc of catalog.services) {
        if (svc.name.trim() === label.trim()) { best = { s: svc, score: 999 }; break; }
        let score = tok(svc.name).filter((w) => want.has(w)).length;
        if (score > 0 && labCatIds.has(svc.category_id)) score += 0.5;
        if (score > 0 && (!best || score > best.score)) best = { s: svc, score };
      }
      setCart((c) => c.some((l) => l.id === lineId) ? c : [...c, {
        id: lineId, kind: "service", name: best ? best.s.name : label, barcode: null,
        unit_price: best ? best.s.price : 0, unit_cost: best?.s.cost ?? 0,
        qty: 1, stock: null, product_id: null, subcategory: null, serviceId: best ? best.s.id : null,
        petId: prefill.petId ?? null, petName: prefill.pet || null, surgeryCat: false, surgeryRef: null,
      }]);
    }
    const id = window.setTimeout(() => searchRef.current?.focus(), 160);
    return () => window.clearTimeout(id);
  }, [prefill]);

  /* الحساب يقرأ الراجع سالباً: قيمة المشترى ناقص قيمة الراجع = ما يدفعه
   * الزبون فعلاً. سطرٌ راجع بألف مع شراءٍ بخمسة ⇒ يدفع أربعة. */
  const sign = (l: Line) => (l.ret ? -1 : 1);
  const subtotal = cart.reduce((s, l) => s + sign(l) * l.qty * l.unit_price, 0);
  const cost = cart.reduce((s, l) => s + sign(l) * l.qty * l.unit_cost, 0);
  /** قيمة الراجع بالسلة (موجبة للعرض) وعدد أسطره. */
  const retValue = cart.reduce((s, l) => s + (l.ret ? l.qty * l.unit_price : 0), 0);
  const retLines = cart.filter((l) => l.ret).length;
  /** الراجع أكبر من المشترى ⇒ نقدٌ يخرج، وهذا ليس بيعاً: يُمنع الحفظ هنا
   *  ويُحوَّل الكاشير لتبويب «المرتجع» حيث يخرج المال بقيدٍ صحيح. */
  const netNegative = subtotal < -0.005;
  /* إرجاعٌ خالص: كل سطرٍ بالسلة راجع، ولا شيء يُباع بالمقابل. هذا وحده يمرّ
   * بمسار الإرجاع (0132)؛ أما السلة المختلطة السالبة فتبقى ممنوعة — بيعةٌ
   * ونصفُ إرجاعٍ بقيدٍ واحد محاسبةٌ غامضة، ومكانها تبويب «المرتجع». */
  const pureReturn = cart.length > 0 && cart.every((l) => l.ret);
  const returnValue = round2(retValue);
  // عدّ الأصناف: سطر الوزن قطعةٌ واحدة (كيسٌ واحد)، لا نصفُ صنف — كسرُ الكيلو
  // يخصّ السعر لا العدد.
  const units = cart.reduce((s, l) => s + (l.byWeight ? 1 : l.qty), 0);
  // Dynamic Mix & Match offers, evaluated against the live cart.
  const { applied: promos, totalDiscount: promoDiscount } = useMemo(() => computePromotions(cart, promoRules), [cart, promoRules]);

  // ---- عروض الكمية — تُحسب **مجمّعة** عبر كل الأسطر المشمولة ------------------
  // الفكرة الجوهرية: الزبون الي أخذ ثلاث قطع من ثلاثة أصناف مختلفة دفع ثمن
  // ثلاث قطع، فيستحق العرض تماماً مثل من أخذ ثلاثاً من صنف واحد. الحساب القديم
  // (سطر لوحده) كان يفوّت هذي الحالة كلياً.
  // القطع = علب كاملة: بيع المفرد بالحبة/الشريط خارج العرض عمداً حتى لا تُحسب
  // ثلاث حبات كثلاث قطع.
  const promoLines = (r: QtyPromo): Line[] => cart.filter((l) => {
    if (r.kind === "service") return l.kind === "service" && (!r.ids.length || (l.serviceId ? r.ids.includes(l.serviceId) : false));
    // سطر الوزن خارج العروض القِطعية عمداً: كميّته كيلواتٌ لا قطع، فـ«كل ٣
    // قطع خصم» كانت تقرأ ٣ كغ دراي فود كأنها ثلاث قطع فتخصم بلا استحقاق —
    // وتقرأ نصف كيلو كنصف قطعة. عرض الكتلة يكون بالسعر لا بالعدّ.
    if (l.kind !== "product" || l.saleUnit === "sub" || l.byWeight) return false;
    return !r.ids.length || (l.product_id ? r.ids.includes(l.product_id) : false);
  });

  /** ما الذي يعطيه هذا العرض على السلة الحالية؟ null = غير مؤهل بعد. */
  const promoHit = (r: QtyPromo): { off: number; groups: number; lines: Line[]; units: number } | null => {
    const lines = promoLines(r);
    const units = lines.reduce((n, l) => n + l.qty, 0);
    const groups = Math.floor(units / r.qty);
    if (groups < 1) return null;
    const pooled = lines.reduce((n, l) => n + l.qty * l.unit_price, 0);
    let off: number;
    if (r.mode === "bundle") {
      // «أي ٣ بـس»: المجموعة تأخذ أغلى القطع (وهذا ما يتوقعه الزبون ويفعله
      // السوق). نفرد الأسطر لقطع مفردة حتى يصح الاختيار عبر أصناف مختلفة.
      const each: number[] = [];
      for (const l of lines) for (let i = 0; i < l.qty; i++) each.push(l.unit_price);
      each.sort((a, b) => b - a);
      const covered = each.slice(0, groups * r.qty).reduce((a, b) => a + b, 0);
      off = covered - groups * r.bundlePrice;
    } else {
      off = groups * r.off;
    }
    off = Math.min(pooled, Math.max(0, round2(off)));
    if (off <= 0) return null;
    return { off, groups, lines, units };
  };

  /** كل العروض المؤهلة الآن — مع خصم كل واحد. */
  const promoHits = useMemo(
    () => qtyRules.map((r) => ({ rule: r, hit: promoHit(r) })).filter((x): x is { rule: QtyPromo; hit: NonNullable<ReturnType<typeof promoHit>> } => !!x.hit),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [cart, qtyRules],
  );
  const qtyOffTotal = round2(promoHits.filter((x) => promoOn.includes(x.rule.id)).reduce((n, x) => n + x.hit.off, 0));
  const togglePromo = (id: string) => {
    setPromoOn((cur) => {
      if (cur.includes(id)) { playTap(); return cur.filter((x) => x !== id); }
      playSuccess(); setFinalOverride(null); return [...cur, id];
    });
  };

  // Manual (percent/fixed) discount entered at the till, on top of any promotions.
  const manualDiscountAmt = resolveDiscount(subtotal, discountType, Number(discountValue) || 0);
  // Auto total = subtotal minus promotions + manual discount (clamped to the subtotal).
  const autoTotal = Math.max(0, subtotal - Math.min(subtotal, promoDiscount + qtyOffTotal + manualDiscountAmt));
  // A cashier-pinned final price IS the total — it may sit BELOW the subtotal (a discount)
  // or ABOVE it (a markup / rounding-up / service fee). The gap shows as a discount or surcharge.
  const total = finalOverride != null ? Math.max(0, finalOverride) : autoTotal;
  const discountAmt = Math.max(0, subtotal - total);
  const surchargeAmt = Math.max(0, total - subtotal);
  const profit = total - cost;

  // When the cart changes while a manual final price is active, move the final
  // price by the same amount the subtotal moved — so the discount/surcharge the
  // doctor set stays constant and any item added after the price was fixed is
  // billed at full price (not absorbed into the discount). CRITICAL: without
  // this, adding a product after setting the final total gives it away for free.
  useEffect(() => {
    const prev = prevSubtotalRef.current;
    prevSubtotalRef.current = subtotal;
    if (finalOverride == null || subtotal === prev) return;
    setFinalOverride((fo) => (fo == null ? null : Math.max(0, Math.round(fo + (subtotal - prev)))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subtotal]);

  // Persist the in-progress sale so it survives leaving and coming back — for a
  // walk-in AND for a sale started from a case record (the prefill's customer /
  // pet get saved too, so navigating away no longer drops them). A FRESH prefill
  // entry still starts clean (see draft0's load guard); this only saves what the
  // sale currently holds.
  useEffect(() => {
    saveSaleDraft(clinicId, { cart, name, phone, salePets, notes: saleNotes, discountType, discountValue, finalOverride, cashierId, promoOn });
  }, [clinicId, cart, name, phone, salePets, saleNotes, discountType, discountValue, finalOverride, cashierId, promoOn]);

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

  // ---- Delivery (توصيل) mode switches --------------------------------------
  const enterDelivery = () => {
    playTap();
    setPartialMode(false);
    setDeliveryOn(true);
    setPaidEdited(true);
    // COD default: nothing received now — the payment row becomes "المدفوع مقدماً".
    setPayments([{ method: "cash", amount: 0 }]);
    if (dCouriers === null) repo.listCouriers(clinicId).then(setDCouriers).catch(() => setDCouriers([]));
  };
  const setPaidQuick = (amount: number) => {
    playTap();
    setPaidEdited(true);
    setPayments((ps) => ps.map((p, i) => (i === 0 ? { ...p, amount: Math.max(0, Math.round(amount)) } : p)));
  };
  // The partial panel shows for the explicit mode AND for a manually-typed
  // shortfall, so the debt can never sneak through quietly. Delivery mode has
  // its own panel — the COD balance is expected, not a quiet debt.
  const partialUi = !deliveryOn && (partialMode || isCredit);
  // A debt must belong to someone — block checkout until the customer is named.
  // A delivery order likewise always needs a customer name.
  const needsDebtName = (isCredit || deliveryOn) && !name.trim();

  // Delivery fee — collected at the door on top of the goods. When the clinic
  // keeps it, it's added to the invoice as a service line (= real revenue).
  const deliveryFee = deliveryOn ? Math.max(0, Number(dFee) || 0) : 0;
  const feeToClinic = deliveryOn && dFeeToClinic && deliveryFee > 0;
  const effTotal = round2(total + (feeToClinic ? deliveryFee : 0));
  // What the courier must hand back to the clinic when he returns.
  const codAmount = round2(Math.max(0, effTotal - totalPaid));

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
    saleRefRef.current = null;   // بيعةٌ جديدة ⇒ مرجعٌ جديد
    clearSaleDraft(clinicId);
    setCart([]); setQuery(""); setDiscountValue(""); setFinalOverride(null); setEditingTotal(false);
    setDiscountType("percent"); setPayments([{ method: "cash", amount: 0 }]); setPaidEdited(false); setPartialMode(false); setDone(null); setLastPrints(0);
    setPromoOn([]);
    setCashierId(null); setBrowseTab("products"); setSaleNotes("");
    setDeliveryOn(false); setDCourierId(""); setDZone(""); setDAddress(""); setDFee(""); setDFeeToClinic(false);
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

  useEffect(() => {
    if (!posV2 || typeof ResizeObserver === "undefined") return;
    const el = cartBoxRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setCartW(Math.round(entries[0].contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [posV2]);

  useEffect(() => {
    if (!posV2) return;
    /* الارتفاع يُشتقّ من الهندسة الفعلية: موضع المنطقة + الحشوات السفلية التي
     * يضيفها هيكل التطبيق وحاوية الصفحة. النسخة السابقة كانت تصحّح نفسها
     * بالتجربة وتُراكم الطرح، فتنهار الشاشة أحياناً (٣ من ٧ تشغيلات) وتترك
     * ٤٣٠px فارغة — التحقّق الآلي على ست شاشات هو من كشف اللاحتمية. */
    const calc = () => {
      const el = posRootRef.current;
      if (!el) return;
      const px = (v: string | undefined) => (v ? parseFloat(v) || 0 : 0);
      const top = el.getBoundingClientRect().top;
      let below = 0;
      for (let n: HTMLElement | null = el; n && n !== document.body; n = n.parentElement) {
        below += px(getComputedStyle(n).paddingBottom);
        below += px(getComputedStyle(n).marginBottom);
      }
      const bar = window.innerWidth < 1024 ? 8 : 8; // فسحة بصرية أدنى
      setPosH(`${Math.max(360, Math.round(window.innerHeight - top - below - bar))}px`);
    };
    calc();
    const raf = requestAnimationFrame(calc);
    window.addEventListener("resize", calc);
    const ro = new ResizeObserver(calc);
    ro.observe(document.documentElement);
    if (posRootRef.current?.parentElement) ro.observe(posRootRef.current.parentElement);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", calc); ro.disconnect(); };
  }, [posV2]);

  /* اختصارات الكاشير المحترف (الشاشة الجديدة): «/» للبحث و«F2» لإتمام البيع —
   * الكاشير السريع لا يريد أن يترك لوحة المفاتيح لكل عملية. */
  useEffect(() => {
    if (!posV2) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
      if (e.key === "/" && !typing) { e.preventDefault(); setBrowseTab("products"); searchRef.current?.focus(); return; }
      if (e.key === "F2") { e.preventDefault(); if (cart.length > 0 && !needsDebtName && !busy) void checkout(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const printPreSale = async (format: PrintFormat) => {
    if (cart.length === 0) return;
    playTap();
    // الطبعة الأولية تطلع باسم البائع المحدد حالياً (إن وُجد).
    const sellerName = await resolveStaffName(cashierId).catch(() => null);
    const petNames = Array.from(new Set(salePets.map((p) => p.name.trim()).filter(Boolean)));
    const multiPet = petNames.length > 1;
    const draftItems: InvoiceItem[] = cart.map((l) => ({
      id: `draft-${l.id}`, invoice_id: "draft", clinic_id: clinicId ?? null,
      product_id: l.product_id,
      name: `${l.ret ? `${t("retail.retPrefix", "راجع")} — ` : ""}${multiPet && l.petName ? `${l.name} — ${l.petName}` : l.name}`,
      barcode: l.barcode,
      qty: sign(l) * l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost, line_total: sign(l) * l.qty * l.unit_price,
      unit_label: l.byWeight ? t("retail.unitKg", "كغ") : l.kind === "product" && l.hasSubUnit ? (l.saleUnit === "sub" ? (l.subUnitName || t("retail.unitSingle")) : t("retail.unitBox")) : null,
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
    const ok = await openInvoicePrint(draft, draftItems, {
      clinicName: getClinicName() || user?.full_name || "doctorVet",
      clinicPhone: user?.phone ?? null,
      brand: "doctorVet",
      format,
      lang: i18n.language,
      logoUrl: getClinicLogo(),
      facebook: socials.facebook || null,
      instagram: socials.instagram || null,
      preSale: true,
      sellerName,
    });
    if (!ok) { playWarning(); toast.error(t("retail.popupBlocked", "Allow pop-ups to print"), t("retail.popupBlockedHint", "Your browser blocked the print window — enable pop-ups for this site.")); }
    else void repo.logClientEvent("invoice.preprint", { total, items: cart.length, format }); // activity trail
  };

  /* الإرجاع الخالص — لا فاتورة. البضاعة ترجع للرصيد، والمال يُسجَّل سحباً
   * منفصلاً لكل صنف (هجرة 0132). الذرّيّة على الخادم: يقعان معاً أو لا شيء. */
  /* مرجعُ هذه المحاولة: يولَد مرّةً ويبقى عبر كل إعادة، ولا يتبدّل إلا بـ
   * `reset()` — أي بسلّةٍ جديدة. به تتعرّف القاعدة على الطلب المعاد فتُرجع
   * ما سجّلته أوّل مرّة بدل أن تسجّل ثانيةً (0135 للبيع، 0136 للإرجاع). */
  const ensureRef = () => {
    if (!saleRefRef.current) saleRefRef.current = `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    return saleRefRef.current;
  };

  const doReturn = async () => {
    if (!pureReturn || busy) return;
    if (returnValue <= 0) { playWarning(); return; }
    setBusy(true);
    try {
      const items: CheckoutItem[] = cart.map((l) => {
        const isSub = l.kind === "product" && l.saleUnit === "sub" && !!l.unitsPerBox && l.unitsPerBox > 0;
        const stock_qty = l.product_id == null ? 0
          : isSub ? Math.round((l.qty / (l.unitsPerBox as number)) * 1000) / 1000
          : l.qty;
        return {
          product_id: l.product_id, name: l.name, barcode: l.barcode,
          qty: l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost,
          stock_qty, unit_label: l.byWeight ? t("retail.unitKg", "كغ") : null,
        };
      });
      const cust = splitCustomerField(name);
      /* ونفسُ حِرز البيعة للإرجاع (0136) — والخطر هنا أقسى: إعادةٌ بلا مرجع
       * تزيد المخزون مرّتين وتسحب من الصندوق مرّتين. */
      const res = await withTimeout(repo.retailReturn(items, {
        method: payments[0]?.method ?? "cash",
        customer_name: cust.name || null,
        note: saleNotes.trim() || null,
        client_ref: ensureRef(),
      }), 12000);
      playSuccess();
      toast.success(t("retail.retDone", { amount: money(res.total), n: formatNum(res.lines), defaultValue: "انسجّل الإرجاع: {{n}} صنف رجع للمخزن، و{{amount}} انسحبت من الصندوق" }));
      reset();
      onSold();
    } catch (e) {
      playWarning();
      // ومهلةُ الواجهة تسبق طابورَ المستودع: النداء بعده طائر، فالإعادة هي
      // الحلّ — ومأمونةٌ بمرجعها (0136)، فلا مخزونَ يُزاد مرّتين.
      const unsure = isNetworkError(e) || isTimeoutError(e);
      toast.error(
        unsure ? t("retail.retRetrySafe", "ما وصل الإرجاع — السلّة محفوظة، جرّب مرّة ثانية. ما راح ينسجّل مرّتين")
               : t("retail.retFailed", "ما انسجّل الإرجاع"),
        e instanceof Error ? e.message : undefined,
      );
    } finally { setBusy(false); }
  };

  const checkout = async () => {
    if (cart.length === 0 || busy) return;
    ensureRef();
    setBusy(true);
    try {
      const items: CheckoutItem[] = cart.map((l) => {
        // Sub-unit sale → deduct the precise box fraction (e.g. 5 of 20 pills = 0.25 box);
        // rounded to 3 decimals to keep stock free of binary-float drift.
        const isSub = l.kind === "product" && l.saleUnit === "sub" && !!l.unitsPerBox && l.unitsPerBox > 0;
        const stock_qty = l.product_id == null ? 0
          : isSub ? Math.round((l.qty / (l.unitsPerBox as number)) * 1000) / 1000
          : l.qty;
        const unit_label = l.byWeight ? t("retail.unitKg", "كغ")
          : l.kind === "product" && l.hasSubUnit
          ? (isSub ? (l.subUnitName || t("retail.unitSingle")) : t("retail.unitBox"))
          : null;
        // سطر راجع ⇒ كميةٌ سالبة بالفاتورة وردٌّ للمخزون (0122). الاسم يحمل
        // كلمة «راجع» فتقرأها الفاتورة المطبوعة والتقارير بلا أي تفسير.
        const s = l.ret ? -1 : 1;
        return {
          product_id: l.product_id,
          name: l.ret ? `${t("retail.retPrefix", "راجع")} — ${l.name}` : l.name,
          barcode: l.barcode,
          qty: s * l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost,
          stock_qty: s * stock_qty, unit_label,
        };
      });
      // Delivery fee kept by the clinic → a real service line on the invoice, so
      // revenue/profit reports include it with zero special-casing.
      if (feeToClinic) {
        items.push({ product_id: null, name: t("retail.deliveryFeeLine", "أجرة توصيل"), barcode: null, qty: 1, unit_price: deliveryFee, unit_cost: 0, stock_qty: 0, unit_label: null });
      }
      // Payment legs received today. Anything tendered ABOVE the total is change handed
      // back, so the recorded legs are trimmed to sum to the total (largest leg first) —
      // revenue-by-method stays accurate and amount_paid never exceeds the bill.
      let legs: PaymentSplit[] = payments.filter((p) => p.amount > 0).map((p) => ({ method: p.method, amount: round2(p.amount) }));
      let over = round2(legs.reduce((s, p) => s + p.amount, 0) - effTotal);
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
      // اسمٌ أُلصق به رقم طويل (هاتف/بطاقة) يُفصل قبل الحفظ: النص للاسم
      // والرقم لخانة الهاتف إن كانت فارغة — فلا يتلوث دفتر الديون بأسماء
      // بذيولٍ رقمية.
      const cust = splitCustomerField(name);
      const meta: SaleMeta = {
        customer_name: cust.name || null,
        customer_phone: phone.trim() || cust.phone || null,
        pet_name: petNames.length ? petNames.join(" + ") : null,
        // The client computes the authoritative final price (promotions + manual discount
        // + any manual final-price override, which may be a markup); the server records it.
        // In delivery mode this includes the clinic-kept delivery fee line.
        final_total: effTotal,
        payment_method: primary,
        payment_details: legs.length ? legs : null,
        amount_paid: paidToday,
        staff_id: cashierId,
        notes: saleNotes.trim() || null,
        client_ref: saleRefRef.current,
      };
      const invoice = await withTimeout(repo.retailCheckout(items, meta), 12000);
      // Delivery order wrapping the invoice: stock is already deducted; the COD
      // balance stays OUT of revenue until the courier hands it over. A failure
      // here never voids the sale — the invoice stands and the order can be
      // recreated; the cashier is told explicitly.
      if (deliveryOn) {
        try {
          const nowISO = new Date().toISOString();
          await repo.createDeliveryOrder({
            clinic_id: clinicId ?? null,
            invoice_id: invoice.id,
            branch_id: branchStore.branchForWrite(),
            courier_id: dCourierId || null,
            customer_name: cust.name || null,
            customer_phone: phone.trim() || cust.phone || null,
            zone: dZone || null,
            address: dAddress.trim() || null,
            note: null,
            delivery_fee: deliveryFee,
            fee_to_clinic: feeToClinic,
            // Derive the COD from the invoice the server ACTUALLY recorded (it
            // may round the client total) — the courier figure and the invoice
            // due must never disagree by a fils.
            cod_amount: round2(Math.max(0, invoice.total - (invoice.amount_paid ?? paidToday))),
            prepaid: invoice.amount_paid ?? paidToday,
            status: dCourierId ? "out" : "preparing",
            dispatched_at: dCourierId ? nowISO : null,
            delivered_at: null,
            returned_at: null,
          });
        } catch {
          playWarning();
          toast.error(t("retail.deliveryOrderFail", "الفاتورة انحفظت لكن تعذّر إنشاء طلب التوصيل — أنشئه من تبويب التوصيل"));
        }
      }
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
        product_id: l.product_id,
        name: `${l.ret ? `${t("retail.retPrefix", "راجع")} — ` : ""}${multiPet && l.petName ? `${l.name} — ${l.petName}` : l.name}`,
        barcode: l.barcode,
        qty: sign(l) * l.qty, unit_price: l.unit_price, unit_cost: l.unit_cost, line_total: sign(l) * l.qty * l.unit_price,
        unit_label: l.byWeight ? t("retail.unitKg", "كغ") : l.kind === "product" && l.hasSubUnit ? (l.saleUnit === "sub" ? (l.subUnitName || t("retail.unitSingle")) : t("retail.unitBox")) : null,
      }));
      if (feeToClinic) {
        invItems.push({
          id: "tmp-dfee", invoice_id: invoice.id, clinic_id: clinicId ?? null,
          product_id: null, name: t("retail.deliveryFeeLine", "أجرة توصيل"), barcode: null,
          qty: 1, unit_price: deliveryFee, unit_cost: 0, line_total: deliveryFee, unit_label: null,
        });
      }
      playSuccess();
      // Show the completion screen immediately — the sale is final. The medical-record
      // sync runs AFTER, time-bounded and non-fatal, so its latency can never freeze
      // the receipt/print UI even if Supabase stalls mid-flow.
      setDone({ invoice, items: invItems });
      clearSaleDraft(clinicId); // sale is final — drop the saved draft
      // بيع قادم من المختبر؟ علّم النتيجة «مفوترة» تلقائياً — الحلقة انغلقت.
      if (prefill?.labId) void repo.setLabBilled(prefill.labId, true).catch(() => {});
      // الاتجاه المعاكس: خدمة من تصنيف «المختبر» بيعت لحيوان معروف → سجل
      // «بانتظار النتائج» يصعد للمختبر والطبلة فوراً، معلَّم مفوتر من البداية.
      try {
        const catalog = getServiceCatalog();
        const labCatIds = new Set(catalog.categories.filter((c) => /مختبر|تحاليل|مختبرات/.test(c.name)).map((c) => c.id));
        for (const l of cart) {
          if (l.kind !== "service" || !l.petId || l.id.startsWith("s:lab:")) continue;
          const sid = l.id.startsWith("s:") ? l.id.slice(2) : "";
          const svc = catalog.services.find((x) => x.id === sid);
          const isLab = (svc && labCatIds.has(svc.category_id)) || /تحليل|CBC|كيمياء|مسحة|زراع/i.test(l.name);
          if (!isLab) continue;
          void repo.addLabResult({
            pet_id: l.petId, visit_id: null, panel_id: "ordered", panel_label: l.name,
            kind: "descriptive", values: null, snap_test_id: null, snap_result: null,
            notes: "بيع من المبيعات — النتائج لم تُسجَّل بعد. سجّلها من زر «تسجيل تحاليل».",
            photo_url: null, doctor: user?.full_name ?? null, billed: true,
            taken_at: new Date().toISOString(),
          }).catch(() => {});
        }
      } catch { /* مزامنة إضافية — لا تعطل البيع أبداً */ }
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
      // عمليات مباعة من الكاشير (خدمة اسمها يطابق الكتالوج الجراحي) تصعد
      // تلقائياً إلى طبلة الحيوان وسجل عملياته — مثل الأدوية واللقاحات تماماً.
      const surgeryLines = cart
        .map((l) => {
          if (l.kind !== "service") return { l, m: null };
          // الأولوية: مرجع «مكتبة العمليات» (تعريف قاطع) ← مطابقة الاسم
          // والمرادفات ← قاعدة تصنيف "عمليات" كشبكة أمان أخيرة.
          const m = surgeryByRef(l.surgeryRef)
            ?? matchSurgeryService(l.name)
            ?? (l.surgeryCat ? ({ name: l.name, category: "العمليات الجراحية" } as SurgeryServiceMatch) : null);
          return { l, m };
        })
        .filter((x): x is { l: Line; m: SurgeryServiceMatch } => !!x.m);
      if (surgeryLines.length) {
        const fallbackPet = salePets.find((p) => p.id)?.id ?? null;
        let synced = 0;
        let openedNewChart = false;
        try {
          // عمليات كل حيوان تُجمع سوية: طبلة واحدة لكل حيوان في الفاتورة.
          const byPet = new Map<string, SurgeryServiceMatch[]>();
          for (const { l, m } of surgeryLines) {
            const pid = l.petId ?? fallbackPet;
            if (!pid) continue;
            const arr = byPet.get(pid) ?? [];
            arr.push(m);
            byPet.set(pid, arr);
          }
          await withTimeout(
            Promise.all(Array.from(byPet, async ([pid, matches]) => {
              // الطبلة المفتوحة إن وُجدت — وإلا تُفتَح طبلة جديدة للعملية فوراً.
              // طبلة مسدودة (علاج منتهٍ) لا تُستعمل أبداً: البيع بعد السد يفتح جديدة.
              let visitId: string | null = null;
              try { visitId = (await repo.listClinicVisitsForPet(pid)).find((v) => v.status === "open")?.id ?? null; } catch { /* optional */ }
              if (!visitId) {
                try {
                  const v = await repo.addClinicVisit({
                    pet_id: pid, kind: "illness", status: "open", condition: "under_treatment",
                    reason: matches[0].name.split("—")[0].trim() || matches[0].name,
                    opened_at: new Date().toISOString(), opened_by: user?.full_name ?? null,
                  });
                  visitId = v.id;
                  openedNewChart = true;
                } catch { /* الطبلة اختيارية — العملية تُسجَّل على ملف الحيوان بكل الأحوال */ }
              }
              for (const m of matches) {
                const followup = m.followupDays
                  ? (() => { const d = new Date(); d.setDate(d.getDate() + m.followupDays!); return d.toISOString().slice(0, 10); })()
                  : null;
                await repo.addSurgery({
                  pet_id: pid, visit_id: visitId, name: m.name, category: m.category,
                  performed_at: new Date().toISOString(), surgeon: user?.full_name ?? null,
                  anesthesia: null, duration_min: null, outcome: "success",
                  approach: null, suture_pattern: null, suture_material: null, suture_size: null,
                  notes: `سُجّلت تلقائياً من فاتورة البيع ${invoiceNo(invoice.id)}`,
                  followup_on: followup,
                });
                synced++;
              }
            })),
            12000,
          );
          if (synced) {
            toast.success(openedNewChart
              ? t("retail.surgerySyncedNew", "سُجّلت العملية وفُتحت طبلة جديدة للحيوان 🔪")
              : t("retail.surgerySynced", "سُجّلت العملية تلقائياً في طبلة الحيوان وسجل العمليات 🔪"));
          }
        } catch { /* non-fatal: the sale is already recorded */ }
      }
      // The doctor's invoice note is ALSO filed into every attached patient's
      // clinical notes (سجل الحيوان → الملاحظات), keyed by pet id. This makes the
      // note appear in the animal's record reliably — cloud-backed and independent
      // of the invoice-notes column, so it shows even before that migration is run.
      const notedPets = salePets.filter((p) => p.id);
      if (saleNotes.trim() && notedPets.length) {
        const text = `🧾 ${t("retail.notesLabel", "ملاحظات")} — ${saleNotes.trim()}`;
        try {
          await withTimeout(
            Promise.all(notedPets.map((p) => repo.addPetNote({ pet_id: p.id as string, note_text: text, author_name: user?.full_name ?? null }))),
            12000,
          );
        } catch { /* non-fatal: the sale is already recorded */ }
      }
    } catch (e) {
      playWarning();
      /* البيعة ما تدخل الطابور — نتيجتُها يعتمد عليها ما بعدها (الوصل وطلب
       * التوصيل والسجلّ الطبّي). فالتعويض إعادةُ محاولةٍ بيد الكاشير، وقد
       * صارت مأمونة: السلّة باقية ومرجعُها ثابت، فالقاعدة تعرف الطلب المعاد
       * (0135) وتُرجع نفس الفاتورة بدل أن تسجّل ثانيةً وتخصم المخزون مرّتين.
       * ونقولها له صراحةً — خوفُه من الازدواج هو ما يجعله يتردّد. */
      // والمهلة كالانقطاع سواء: كلتاهما تترك الكاشير لا يدري هل وصلت. بل
      // المهلة أخطر — الخادم قد يكون سجّل فعلاً والجواب تأخّر.
      const unsure = isNetworkError(e) || isTimeoutError(e);
      toast.error(
        unsure ? t("retail.saleRetrySafe", "ما وصلت البيعة — السلّة محفوظة، جرّب مرّة ثانية. ما راح تنسجّل مرّتين")
            : describeDbError(e, t),
        e instanceof Error ? e.message : undefined,
      );
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
    <div
      ref={(el) => {
        posRootRef.current = el;
        (cartResize.gridRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      }}
      className={cn(
        "grid gap-4",
        // السلة هي بطل الشاشة لا الشبكة: على الضيّقة تحتل النصف السفلي ثابتةً
        // مفتوحةً (لا شريط مطويّ)، وعلى الواسعة عموداً بـ٤٠٪ من العرض بخطٍّ
        // كبير مقروء من وقفة الكاشير. الشبكة تخدم السلة لا العكس.
        posV2
          ? cn("min-h-0 lg:grid-rows-1",
              // وضع التركيز: الشريط مطويّ فالمساحة المتحرّرة تذهب كاملةً للسلة
              // (٦٤٪ بدل ٤٦٪ وسقف ١٢٠٠px بدل ٧٢٠) — لا لهامشٍ فارغ.
              navFolded ? "lg:grid-cols-[minmax(0,1fr),clamp(560px,64%,1200px)]" : "lg:grid-cols-[minmax(0,1fr),clamp(460px,46%,720px)]",
              // السلة الممتلئة تأخذ ثلثي الشاشة بالوضع العمودي؛ الشبكة تحتفظ
              // بحدّ أدنى يكفي صفّين. السقف الجامد ٥٢٪ كان يخنقها مهما امتلأت.
              denseCart ? "grid-rows-[minmax(9rem,1fr),minmax(0,68%)]" : "grid-rows-[minmax(0,1fr),minmax(0,52%)]")
          : "lg:grid-cols-[1fr,380px]",
      )}
      // Opt-in resizable cart: on lg+ the cart column takes the dragged width
      // (live CSS var while dragging — see useCartResize).
      style={posV2 ? { ...cartResize.gridStyle, height: posH } : cartResize.gridStyle}
    >
      {/* LEFT — customer + products/services */}
      <div className={cn(posV2 ? "flex min-h-0 flex-col gap-3" : "space-y-4")}>
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
        {/* تفاصيل البيع الاختيارية — بالشاشة الجديدة سطر واحد يُفتح بضغطة بدل
            بطاقة دائمة كانت تدفع شبكة المنتجات ٣٧١px للأسفل. */}
        {posV2 && !detailsOpen && (
          <button
            type="button" data-saledetails
            onClick={() => { playTap(); setDetailsOpen(true); }}
            className="flex w-full shrink-0 items-center gap-2 rounded-2xl border border-dashed border-line-strong bg-surface-1 px-3.5 py-2 text-start text-xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink"
          >
            <Plus size={14} className="shrink-0 text-brand-600" />
            {name.trim()
              ? t("retail.detailsFor", { name: name.trim(), defaultValue: "البيع لـ{{name}} — تعديل التفاصيل" })
              : t("retail.addDetails", "عميل · بائع · ملاحظة")}
            {saleNotes.trim() && <StickyNote size={12} className="text-brand-600" />}
            {cashierId && <UserCheck size={12} className="text-success-600" />}
          </button>
        )}
        {/* Customer */}
        <div className={cn("card p-4", posV2 && "shrink-0", posV2 && !detailsOpen && "hidden")}>
          <div className="mb-3 flex items-center gap-2 text-sm font-bold text-ink">
            <User size={16} /> {t("retail.customer", "Customer")} <span className="text-xs font-normal text-ink-subtle">· {t("retail.optional", "optional")}</span>
            {posV2 && (
              <button type="button" onClick={() => { playTap(); setDetailsOpen(false); }} className="ms-auto grid h-7 w-7 place-items-center rounded-lg text-ink-subtle transition hover:bg-surface-2 hover:text-ink" aria-label={t("common.close", "إغلاق")}>
                <X size={15} />
              </button>
            )}
          </div>
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

          {/* موظف المبيعات (البائع) — يتثبّت تلقائياً على المسجّل دخوله؛ يظهر
              بالفاتورة المطبوعة وسجل الفواتير وتقارير أداء الموظفين. */}
          <div className="mt-3 border-t border-line pt-3">
            <label className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted">
              <UserCheck size={14} className="text-brand-600" /> {t("retail.cashier", "موظف المبيعات (البائع)")}
            </label>
            <CashierSelect value={cashierId} onChange={setCashierId} />
            {cashierId ? (
              <p className="mt-1 flex items-center gap-1 text-2xs text-success-600">
                <CheckCircle2 size={11} className="shrink-0" /> {t("retail.sellerOnInvoice", "تنحسب الفاتورة لهذا الموظف وتطلع باسمه بالطباعة والتقارير.")}
              </p>
            ) : posV2 ? null : (
              // تحذير دائم = تحذير مُهمَل. بالشاشة الجديدة ينتقل للحظة الإتمام
              // داخل السلة، حيث يعني شيئاً فعلاً.
              <p className="mt-1 flex items-center gap-1 text-2xs font-semibold text-warn-600">
                <AlertTriangle size={11} className="shrink-0" /> {t("retail.noSellerHint", "بلا بائع محدد — حدّد منو باع حتى تنحسب الفاتورة إله بالتقارير.")}
              </p>
            )}
          </div>

          {/* Doctor's note on the invoice — surfaces in the pet's record. */}
          <div className="mt-3 border-t border-line pt-3">
            <label htmlFor="sale-notes" className="mb-1.5 flex items-center gap-1.5 text-xs font-bold text-ink-muted">
              <StickyNote size={14} className="text-brand-600" /> {t("retail.saleNotes", "ملاحظات الطبيب على الفاتورة")}
              <span className="text-2xs font-normal text-ink-subtle">· {t("retail.optional", "optional")}</span>
            </label>
            <textarea
              id="sale-notes"
              rows={2}
              value={saleNotes}
              maxLength={500}
              onChange={(e) => setSaleNotes(e.target.value)}
              placeholder={t("retail.saleNotesPh", "مثال: الحالة تحتاج مراجعة بعد أسبوع…")}
              className="input min-h-[2.5rem] resize-y py-2 text-sm leading-relaxed"
            />
            {!posV2 && <p className="mt-1 text-2xs text-ink-subtle">{t("retail.saleNotesHint", "تظهر داخل خانة الملاحظات في سجل الحيوان وعلى الفاتورة المطبوعة.")}</p>}
          </div>
        </div>

        {/* وضع الراجع — زرٌّ واحد يقلب معنى كل باركود يُمسح بعده.
            لونه كهرماني صارخ وشريطٌ يعلو الشاشة كلها حين يكون فعّالاً: كاشيرٌ
            نسي أنه بوضع الراجع يبيع بالسالب، وهذا أسوأ من أي خطأٍ آخر. */}
        <div className={cn("flex flex-wrap items-center gap-2", posV2 && "shrink-0")}>
          <button
            type="button"
            data-retmode
            aria-pressed={retMode}
            onClick={() => { playTap(); setRetMode((v) => !v); }}
            className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-sm font-extrabold transition",
              retMode
                ? "border-amber-500 bg-amber-500 text-white shadow-soft"
                : "border-line bg-surface-1 text-ink-muted hover:border-amber-300 hover:text-amber-700")}
            style={{ minHeight: 40 }}
          >
            <Undo2 size={16} /> {t("retail.retMode", "راجع")}
          </button>
          {retMode && (
            <span data-retmodebar className="flex flex-1 items-center gap-1.5 rounded-xl bg-amber-50 px-3 py-2 text-2xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              <AlertTriangle size={14} className="shrink-0" />
              {t("retail.retModeOn", "وضع الراجع فعّال — كل باركود تمسحه ينزل بالسالب ويتقاص من حساب الزبون. اضغط «راجع» مرة ثانية للرجوع للبيع.")}
            </span>
          )}
        </div>

        {/* Products | Services | Medications toggle */}
        <div className={cn("inline-flex w-full items-center gap-1 rounded-full border border-line bg-surface-2 p-1", posV2 && "shrink-0")}>
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
          // منطقة التصفّح: البحث ثابت والشبكة وحدها تمرّر داخلياً (التصميم أ).
          <div className={cn(posV2 ? "flex min-h-0 flex-1 flex-col gap-3" : "contents")}>
            {/* Product search + scan + مضاعِف الكمية */}
            <div className={cn("flex items-center gap-2", posV2 && "shrink-0")}>
              <div className="relative flex-1">
                <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input
                  ref={searchRef} data-possearch className="input ltr:pl-9 rtl:pr-9" value={query}
                  onChange={(e) => {
                    // «٢٠*» بحقل البحث = تسليح فوري. الطريق الأسرع لمن يده على
                    // الكيبورد أصلاً، وبلا اختصارٍ خفيّ يحتاج تعليماً.
                    const m = /^(\d{1,4})\s*[*xX×]$/.exec(e.target.value.trim());
                    if (m) { armMult(Number(m[1])); setQuery(""); return; }
                    setQuery(e.target.value);
                  }}
                  placeholder={t("retail.searchProducts", "Search or scan a product…")}
                />
                <span className="pointer-events-none absolute top-1/2 flex -translate-y-1/2 items-center gap-1 text-2xs text-ink-subtle ltr:right-3 rtl:left-3"><Barcode size={13} /> {t("retail.scanReady", "scan ready")}</span>
              </div>
              {/* المدخل اللمسي للمضاعِف — الآيباد بلا كيبورد لا يبقى بلا حلّ */}
              <button
                data-multpad type="button"
                onClick={() => { playTap(); setMultPad(true); }}
                title={t("retail.multBtn", "كمية بالجملة — اكتب العدد ثم امسح")}
                aria-label={t("retail.multBtn", "كمية بالجملة — اكتب العدد ثم امسح")}
                className={cn(
                  "grid h-11 shrink-0 place-items-center rounded-2xl border font-display text-base font-extrabold tabular-nums transition",
                  mult != null
                    ? "border-brand-500 bg-brand-600 px-3 text-white shadow-soft"
                    : "w-12 border-line bg-surface-2 text-ink-muted hover:border-brand-300 hover:text-brand-700",
                )}
              >
                ×{mult != null ? formatNum(mult) : ""}
              </button>
            </div>

            {/* «اكتب الرقم وامسح»: الرقم المكتوب يُعلَن **قبل** المسح لا بعده —
                الطبيب يقرأ ما سيحدث قبل أن يحدث، فلا مفاجأة بالفاتورة. */}
            {mult == null && queryMult() != null && (
              <div data-multhint className={cn(
                "flex items-center gap-2 rounded-2xl border border-dashed border-brand-400 bg-brand-50/70 px-3.5 py-2 dark:border-brand-500/50 dark:bg-brand-500/10",
                posV2 && "shrink-0",
              )}>
                <Barcode size={16} className="shrink-0 text-brand-600 dark:text-brand-300" />
                <span className="text-xs font-bold text-brand-800 dark:text-brand-200">
                  {t("retail.multFromQuery", { n: formatNum(queryMult() ?? 0), defaultValue: "امسح الباركود الآن — يُضاف ×{{n}} دفعة واحدة" })}
                </span>
              </div>
            )}

            {/* شارة المضاعِف المعلّق — بارزة عمداً: لا يُنسى ولا يُلغى بالصدفة */}
            {mult != null && (
              <button
                data-multbadge type="button"
                onClick={() => { playTap(); setMult(null); }}
                className={cn(
                  "flex items-center gap-2.5 rounded-2xl border-2 border-brand-400 bg-brand-50 px-3.5 py-2 text-start dark:border-brand-500/50 dark:bg-brand-500/15",
                  posV2 && "shrink-0",
                )}
              >
                <span className="font-display text-2xl font-extrabold tabular-nums text-brand-700 dark:text-brand-200">×{formatNum(mult)}</span>
                <span className="min-w-0 flex-1 text-xs font-bold text-brand-800 dark:text-brand-200">{t("retail.multArmed", "امسح الباركود أو اضغط الصنف — تُضاف بهذه الكمية")}</span>
                <X size={16} className="shrink-0 text-brand-700/70 dark:text-brand-300/70" />
              </button>
            )}

            {/* Product grid */}
            {shown.length === 0 ? (
              <div className="card grid place-items-center p-10 text-center text-sm text-ink-subtle">
                <Package size={28} className="mb-2 opacity-40" />
                {ql ? t("retail.noMatch", "No products match.") : t("retail.noProducts", "No products in inventory yet.")}
              </div>
            ) : (
              // الأعمدة تتنفّس: auto-fill بعرض بطاقة أدنى بدل عدد مثبّت — شاشة
              // ١٦٠٠px تعرض ستة أعمدة بدل ثلاثة، والآيباد ثلاثة بدل اثنين.
              <div
                className={cn("grid gap-2", posV2 ? "min-h-0 flex-1 overflow-y-auto pb-1" : "grid-cols-2 sm:grid-cols-3")}
                style={posV2 ? { gridTemplateColumns: "repeat(auto-fill, minmax(8rem, 1fr))", gridAutoRows: "min-content" } : undefined}
              >
                {shown.map((p) => {
                  // A sub-unit product is only "out" when not even one single can be sold.
                  // Pooled products are never "out" here — they sell from the section pool.
                  const subAvail = !!p.has_sub_unit && !!p.units_per_box && p.units_per_box > 0;
                  const out = p.pooled ? false : subAvail ? p.stock * (p.units_per_box as number) < 1 : p.stock <= 0;
                  const byWeight = !!p.sold_by_weight;
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
                      <span className="grid h-9 w-9 place-items-center rounded-xl bg-surface-2 text-ink-subtle group-hover:bg-white/60 dark:group-hover:bg-surface-1">{byWeight ? <Scale size={17} /> : <Package size={17} />}</span>
                      <span className="mt-2 line-clamp-2 min-h-[2.2rem] text-xs font-semibold leading-tight text-ink">{p.name}</span>
                      <span className="mt-1 flex items-center justify-between">
                        <span className="text-sm font-bold text-ink tabular-nums">{money(p.sell_price)}{byWeight ? <span className="text-2xs font-medium text-ink-subtle">{t("retail.perKgShort", "/كغ")}</span> : ""}</span>
                        <span className={cn("text-2xs", out ? "text-danger-600" : "text-ink-subtle")}>{out ? t("retail.out", "out") : byWeight ? t("retail.wKg", { n: fmtKg(p.stock), defaultValue: "{{n}} كغ" }) : t("retail.nLeft", { n: p.stock, defaultValue: "{{n}} left" })}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : browseTab === "services" ? (
          <ServiceQuickSelect catalog={catalog} onPick={addService} flashId={flash} />
        ) : (
          <MedSaleForm species={activePet?.species ?? undefined} onAddLine={addMedLine} petId={activePet?.id ?? null} petName={activePet?.name ?? null} />
        )}
      </div>

      {/* RIGHT — cart. بالشاشة الجديدة: عمود كامل الارتفاع على الشاشات الواسعة،
          ويُستبدل على الضيّقة بشريط ملتصق + لوح منزلق (لا يغادر الشاشة أبداً). */}
      <div ref={cartBoxRef} className={cn(
        "card relative flex flex-col p-0",
        posV2
          ? cn("min-h-0 lg:h-full lg:max-h-none", cartSheet
              && "fixed inset-x-2 bottom-2 top-14 z-40 max-h-none overflow-hidden shadow-raised lg:static lg:inset-auto lg:z-auto lg:shadow-none")
          : "max-h-[78vh] lg:sticky lg:top-4",
      )}>
        {cartResize.active && <CartResizeHandle dragging={cartResize.dragging} width={cartResize.width} handleProps={cartResize.handleProps} />}
        <div className={cn("flex items-center justify-between border-b border-line", posV2 ? "px-3.5 py-2" : "p-4")}>
          <span className={cn("flex items-center gap-2 font-display font-bold text-ink", posV2 && "text-lg")}>
            <ShoppingCart size={posV2 ? 22 : 18} /> {t("retail.cart", "Cart")}
            {units > 0 && <span className={cn("chip bg-brand-600 font-black text-white", posV2 ? "text-xs" : "text-2xs bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300")}>{units}</span>}
          </span>
          <span className="flex items-center gap-2">
            {cart.length > 0 && <button onClick={() => { playTap(); setCart([]); }} className="text-xs text-ink-subtle transition hover:text-danger-600">{t("common.clear", "Clear")}</button>}
            {posV2 && cartResize.active && (
              /* تكبير/تصغير السلة بضغطة — البديل المضمون للسحب على الآيباد:
                 نفس مسار الحفظ، فالعرض المختار يبقى محفوظاً بالجهاز. */
              <span className="hidden items-center gap-1 lg:flex">
                <button
                  data-cartnarrow
                  onClick={() => cartResize.nudge(-1)}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3"
                  title={t("retail.cartNarrow", "تصغير السلة")}
                  aria-label={t("retail.cartNarrow", "تصغير السلة")}
                >
                  <Minus size={18} />
                </button>
                <button
                  data-cartwiden
                  onClick={() => cartResize.nudge(1)}
                  className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3"
                  title={t("retail.cartWiden", "تكبير السلة")}
                  aria-label={t("retail.cartWiden", "تكبير السلة")}
                >
                  <Plus size={18} />
                </button>
              </span>
            )}
            {posV2 && (
              /* طيّ شريط التنقّل من داخل الكاشير: الطبيب واقف بالبيع، وإرساله
                 للإعدادات ليكسب مساحةً هو نفسه ما يجعله لا يكسبها أبداً. */
              <button
                data-navfoldpos
                onClick={() => { playTap(); setNavFolded(!navFolded); }}
                className="hidden h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3 lg:grid"
                aria-pressed={navFolded}
                title={navFolded ? t("nav.unfold", "توسيع الشريط") : t("nav.fold", "طيّ الشريط — مساحة أكبر للشاشة")}
                aria-label={navFolded ? t("nav.unfold", "توسيع الشريط") : t("nav.fold", "طيّ الشريط — مساحة أكبر للشاشة")}
              >
                {navFolded ? <PanelLeftOpen size={19} className="rtl:rotate-180" /> : <PanelLeftClose size={19} className="rtl:rotate-180" />}
              </button>
            )}
            {posV2 && (
              // تكبير السلة لملء الشاشة (خصم · طرق دفع · تفاصيل)، والرجوع للنصف.
              <button
                data-cartexpand
                onClick={() => { playTap(); setCartSheet(!cartSheet); }}
                className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-ink-muted transition hover:bg-surface-3 lg:hidden"
                aria-label={cartSheet ? t("common.close", "إغلاق") : t("retail.expandCart", "تكبير السلة")}
              >
                {cartSheet ? <ChevronDown size={20} /> : <ChevronUp size={20} />}
              </button>
            )}
          </span>
        </div>

        <div className={cn("flex-1 overflow-auto", posV2 ? "min-h-[9.5rem] basis-40 p-2" : "p-2")}>
          {cart.length === 0 ? (
            <div className={cn("grid place-items-center px-6 text-center text-ink-subtle", posV2 ? "h-full min-h-[8rem] text-base" : "h-40 text-sm")}>{t("retail.cartEmpty", "Add products to start a sale.")}</div>
          ) : (
            <div className={cn(
              cartCols2 ? "grid grid-cols-2 items-start" : "",
              cartCols2 ? (denseCart ? "gap-1" : "gap-1.5") : (denseCart ? "space-y-1" : "space-y-1.5"),
            )}>
              <AnimatePresence initial={false}>
                {cart.map((l) => (
                  <motion.div key={l.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                    className={cn("flex items-center rounded-2xl border", posV2 ? (denseCart ? "gap-1.5 px-2 py-1" : "gap-2 px-2.5 py-1.5") : "gap-2 p-2.5",
                      l.ret ? "border-amber-400 bg-amber-50/70 dark:border-amber-500/40 dark:bg-amber-500/10"
                        : flash === l.id ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15" : "border-line bg-surface-1")}>
                    <div className="min-w-0 flex-1">
                      <p className={cn("flex items-center gap-1.5 truncate font-bold text-ink", posV2 ? "text-base leading-tight" : "text-sm font-semibold")}>
                        {l.ret && <span data-retchip className="chip shrink-0 bg-amber-500 text-2xs font-black text-white"><Undo2 size={10} className="me-0.5 inline" />{t("retail.retChip", "راجع")}</span>}
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
                      {/* سعر الوحدة بنفس سطر الاسم بالشاشة الجديدة: سطرٌ واحد
                          للصنف يعني ضِعف عدد الأصناف المرئية بنفس المساحة. */}
                      <div className={cn("items-center gap-1 text-xs text-ink-subtle", denseCart ? "hidden" : "flex", posV2 ? "-mt-0.5" : "mt-0.5")}>
                        <PriceEdit value={l.unit_price} onChange={(v) => setPrice(l.id, v)} />
                        <span className="truncate">
                          {l.byWeight
                            ? t("retail.perKgShort", "/كغ")
                            : l.kind === "product" && l.hasSubUnit
                            ? `/ ${l.saleUnit === "sub" ? (l.subUnitName || t("retail.unitSingle", "مفرد")) : t("retail.unitBox", "علبة")}`
                            : t("pos.each", "each")}
                        </span>
                      </div>
                      {/* عرض الكمية: الزر الأحمر يبقى بجانب السطر عندما يكون
                          العرض على هذا السطر وحده — وهذا هو الشكل المألوف.
                          العروض المجمّعة (عدة أصناف) مكانها الشريط فوق الحساب،
                          لأن خصماً واحداً موزّعاً على ثلاثة أسطر لا يصح أن يظهر
                          ثلاث مرات. */}
                      {(() => {
                        const x = promoHits.find((h) => h.hit.lines.length === 1 && h.hit.lines[0].id === l.id);
                        if (!x) return null;
                        const on = promoOn.includes(x.rule.id);
                        return on ? (
                          <button
                            type="button"
                            onClick={() => togglePromo(x.rule.id)}
                            title={t("retail.qtyPromoUndo", "إلغاء خصم العرض")}
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-success-100 px-2 py-0.5 text-2xs font-black text-success-700 transition hover:bg-success-200 dark:bg-success-500/20 dark:text-success-300"
                          >
                            <BadgePercent size={11} /> {t("retail.qtyPromoOn", { n: money(x.hit.off), defaultValue: "عرض مفعّل −{{n}}" })} <X size={10} />
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => togglePromo(x.rule.id)}
                            title={x.rule.name || t("retail.qtyPromoHint", { q: formatNum(x.rule.qty), n: money(x.hit.off), defaultValue: "كل {{q}} قطع خصم {{n}}" })}
                            className="mt-1 inline-flex items-center gap-1 rounded-full bg-danger-600 px-2 py-0.5 text-2xs font-black text-white shadow-soft transition hover:bg-danger-700 active:scale-95"
                          >
                            <BadgePercent size={11} /> {t("retail.qtyPromoBtn", { n: money(x.hit.off), defaultValue: "خصم −{{n}}" })}
                          </button>
                        );
                      })()}
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
                    {/* أهداف لمس ١١×١١ (44px) بالشاشة الجديدة — معيار WCAG 2.5.5
                        للأفعال الأساسية؛ ٧×٧ القديمة كانت تنتج تعديلات كمية بالغلط. */}
                    {l.byWeight ? (
                      // سطر بالوزن: لا عدّاد ±١ — ضغطة تفتح منتقي الوزن ليُعدَّل الكيلو.
                      <button
                        data-weightopen type="button"
                        onClick={() => {
                          playTap();
                          const prod = products.find((x) => x.id === l.product_id);
                          if (prod) setWeightFor({ p: prod, ret: !!l.ret });
                        }}
                        title={t("retail.weightEdit", "عدّل الوزن")}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg bg-surface-2 px-2.5 font-bold tabular-nums text-ink transition hover:bg-surface-3",
                          posV2 ? (denseCart ? "h-9 text-sm" : "h-11 text-base") : "h-7 text-sm",
                        )}
                      >
                        <Scale size={posV2 ? (denseCart ? 14 : 16) : 13} className="shrink-0 opacity-70" />
                        {t("retail.wKg", { n: fmtKg(l.qty), defaultValue: "{{n}} كغ" })}
                      </button>
                    ) : (
                    <div className="flex items-center gap-1">
                      <button data-qtyminus onClick={() => { playTap(); setQty(l.id, l.qty - 1); }} className={cn("grid place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3", posV2 ? (denseCart ? "h-9 w-9" : "h-11 w-11") : "h-7 w-7")}><Minus size={posV2 ? (denseCart ? 15 : 18) : 14} /></button>
                      {/* الرقم نفسه زر: ضغطة تفتح لوحة الأرقام فتُكتب ٢٠ مرة
                          واحدة بدل عشرين ضغطة على «+». */}
                      <button
                        data-qtyopen type="button"
                        onClick={() => { playTap(); setQtyPadFor(l.id); }}
                        title={t("retail.qtyPadTitle", "كمية الصنف")}
                        className={cn(
                          "rounded-lg text-center font-bold tabular-nums text-ink transition hover:bg-surface-2",
                          posV2 ? (denseCart ? "h-9 w-9 text-base" : "h-11 w-11 text-base") : "h-7 w-7 text-sm",
                        )}
                      >
                        {formatNum(l.qty)}
                      </button>
                      <button data-qtyplus onClick={() => { playTap(); if (l.qty < unitCap(l)) setQty(l.id, l.qty + 1); else { playWarning(); toast.error(t("retail.maxStock", "No more in stock")); } }} className={cn("grid place-items-center rounded-lg bg-surface-2 text-ink-muted transition hover:bg-surface-3", posV2 ? (denseCart ? "h-9 w-9" : "h-11 w-11") : "h-7 w-7")}><Plus size={posV2 ? (denseCart ? 15 : 18) : 14} /></button>
                    </div>
                    )}
                    {/* whitespace-nowrap حاسم: «25,000 د.ع» كان يلتفّ سطرين داخل
                        عرض ضيّق فيضخّم كل صفّ ١٨px — أي ثلاثة أصناف أقل بالشاشة. */}
                    <span data-linetotal={l.id} className={cn("shrink-0 whitespace-nowrap text-end font-extrabold tabular-nums", posV2 ? (denseCart ? "text-sm" : "text-base") : "w-16 text-sm font-bold",
                      l.ret ? "text-amber-700 dark:text-amber-300" : "text-ink")}>
                      {l.ret ? `− ${money(l.qty * l.unit_price)}` : money(l.qty * l.unit_price)}
                    </span>
                    <button onClick={() => removeLine(l.id)} aria-label={t("common.delete", "Remove")} className={cn("grid place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600", posV2 ? (denseCart ? "h-9 w-9" : "h-11 w-11") : "h-7 w-7")}><Trash2 size={posV2 ? (denseCart ? 15 : 17) : 14} /></button>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>

        {/* Discount + payment + totals */}
        <div className={cn("border-t border-line", posV2 ? "shrink-0 space-y-2 p-3" : "p-4 space-y-3")}>
          {/* شريط الأدوات: خصم · دفع · طباعة أولية — مطويّ افتراضياً حتى تبقى
              المساحة للأصناف. ملخّصه يظهر بالسطر فلا تختفي معلومة مهمة. */}
          {posV2 && (
            <button
              type="button" data-paytools
              onClick={() => { playTap(); setPayTools((v) => !v); }}
              className="flex w-full items-center gap-2 rounded-xl bg-surface-2 px-3 py-1.5 text-2xs font-bold text-ink-muted transition hover:bg-surface-3"
            >
              <Tag size={12} className="shrink-0" />
              {manualDiscountAmt > 0
                ? t("retail.toolsWithDiscount", { n: money(manualDiscountAmt), defaultValue: "خصم {{n}} · أدوات الدفع" })
                : t("retail.tools", "الخصم وطرق الدفع")}
              {isCredit && <span className="chip bg-warn-50 text-[10px] font-black text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">{t("retail.creditShort", "آجل")}</span>}
              {deliveryOn && <span className="chip bg-sky-50 text-[10px] font-black text-sky-700 dark:bg-sky-500/15 dark:text-sky-200">{t("retail.deliveryShort", "توصيل")}</span>}
              {!cashierId && cart.length > 0 && (
                <span data-nosellerchip className="chip bg-warn-50 text-[10px] font-black text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">
                  <AlertTriangle size={10} className="me-0.5 inline" />{t("retail.noSellerChip", "بلا بائع")}
                </span>
              )}
              {payTools ? <ChevronDown size={14} className="ms-auto shrink-0" /> : <ChevronUp size={14} className="ms-auto shrink-0" />}
            </button>
          )}
          {/* Discount — يظهر بالشاشات الواسعة دائماً، وبالضيّقة عند تكبير السلة:
              نصف الشاشة السفلي مخصّص لما يشتريه الزبون فعلاً لا لأدوات نادرة. */}
          <div className={cn("items-center gap-2", posV2 && !payTools ? "hidden" : "flex")}>
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
          <div className={cn("space-y-1.5", posV2 && !payTools && "hidden")}>
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

            {/* ONE obvious choice: pay in full, pay part (rest = debt), or ship it
                with a courier (COD — money enters when the cash comes back).
                Credit selling (البيع بالدين) is a super-plan feature — for other
                plans the toggles are hidden, so every sale is paid in full. */}
            {canDebt && (
              <div className="grid grid-cols-3 gap-1.5 rounded-xl border border-line bg-surface-2 p-1">
                <button
                  onClick={() => { setDeliveryOn(false); exitPartial(); }}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-bold transition",
                    !partialUi && !deliveryOn ? "bg-surface-1 text-success-700 shadow-card dark:text-success-300" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t("retail.payFull", "💵 دفع كامل")}
                </button>
                <button
                  onClick={() => { setDeliveryOn(false); enterPartial(); }}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-bold transition",
                    partialUi ? "bg-surface-1 text-warn-700 shadow-card dark:text-warn-300" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t("retail.payPartial", "🧾 دفع جزئي")}
                </button>
                <button
                  onClick={enterDelivery}
                  className={cn(
                    "rounded-lg px-2 py-2 text-xs font-bold transition",
                    deliveryOn ? "bg-surface-1 text-sky-700 shadow-card dark:text-sky-300" : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t("retail.payDelivery", "🛵 توصيل")}
                </button>
              </div>
            )}

            {/* Delivery details — courier, address, fee. The COD balance is shown
                loudly; it enters the system only when the courier hands it over. */}
            {deliveryOn && (
              <div className="space-y-2 rounded-xl border border-sky-200 bg-sky-50/60 p-3 dark:border-sky-500/30 dark:bg-sky-500/10">
                <p className="flex items-center gap-1.5 text-xs font-bold text-sky-800 dark:text-sky-200">
                  <Bike size={14} /> {t("retail.deliveryTitle", "توصيل — الدفع عند الاستلام")}
                </p>
                <select className="input h-9 w-full py-0 text-sm" value={dCourierId} onChange={(e) => { playTap(); setDCourierId(e.target.value); }}>
                  <option value="">{t("retail.deliveryNoCourier", "اختيار السائق لاحقاً (يبقى قيد التجهيز)")}</option>
                  {(dCouriers ?? []).filter((c) => c.active).map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` — ${c.phone}` : ""}</option>)}
                </select>
                {/* لوين طالع الطلب؟ — مناطق العيادة، واختيار المنطقة يملأ أجرتها تلقائياً */}
                {getDeliveryZones().length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-2xs font-bold text-ink-muted">{t("retail.deliveryZone", "المنطقة:")}</span>
                    {getDeliveryZones().map((z) => {
                      const active = dZone === z.name;
                      return (
                        <button key={z.name} type="button"
                          onClick={() => {
                            playTap();
                            if (active) { setDZone(""); return; }
                            setDZone(z.name);
                            if (z.fee > 0) setDFee(String(Math.round(z.fee)));
                          }}
                          className={cn("rounded-full border px-2.5 py-1 text-2xs font-bold transition",
                            active
                              ? "border-sky-500 bg-sky-600 text-white shadow-soft"
                              : "border-sky-200 bg-surface-1 text-ink-muted hover:border-sky-400 hover:text-sky-700 dark:border-sky-500/30")}>
                          {z.name}{z.fee > 0 ? ` · ${money(z.fee)}` : ""}
                        </button>
                      );
                    })}
                  </div>
                )}
                <input className="input h-9 text-sm" value={dAddress} onChange={(e) => setDAddress(e.target.value)} placeholder={t("retail.deliveryAddressPh", "العنوان: أقرب نقطة دالة…")} />
                <div className="flex items-center gap-2">
                  <input type="number" min="0" step="1" inputMode="numeric" className="input h-9 w-28 px-2 py-0 text-end text-sm font-bold tabular-nums" value={dFee} onChange={(e) => setDFee(e.target.value)} placeholder="0" />
                  <span className="text-xs font-semibold text-ink-muted">{t("retail.deliveryFee", "أجرة التوصيل")}</span>
                  {deliveryFee > 0 && (
                    <label className="ms-auto inline-flex cursor-pointer items-center gap-1.5 text-2xs font-semibold text-ink-muted">
                      <input type="checkbox" checked={dFeeToClinic} onChange={(e) => { playTap(); setDFeeToClinic(e.target.checked); }} className="h-4 w-4 accent-sky-600" />
                      {t("retail.deliveryFeeToClinic", "الأجرة للعيادة (تُضاف للفاتورة)")}
                    </label>
                  )}
                </div>
                <div className="space-y-1 rounded-lg bg-surface-1/80 px-3 py-2 text-sm dark:bg-surface-1/40">
                  <div className="flex items-center justify-between text-ink-muted">
                    <span>{t("retail.deliveryCollectAtDoor", "يُحصَّل من الزبون عند الباب")}</span>
                    <span className="font-bold tabular-nums text-ink">{money(round2(codAmount + (feeToClinic ? 0 : deliveryFee)))}</span>
                  </div>
                  <div className="flex items-center justify-between font-display text-base font-extrabold text-sky-700 dark:text-sky-300">
                    <span>{t("retail.deliveryCourierOwes", "يُسلِّم السائق للعيادة")}</span>
                    <span className="tabular-nums">{money(codAmount)}</span>
                  </div>
                  {totalPaid > 0 && (
                    <div className="flex items-center justify-between text-2xs text-ink-subtle">
                      <span>{t("retail.deliveryPrepaid", "مدفوع مقدماً في العيادة")}</span>
                      <span className="tabular-nums">{money(totalPaid)}</span>
                    </div>
                  )}
                </div>
                <p className="text-2xs text-ink-subtle">{t("retail.deliveryPrepaidHint", "إذا دفع الزبون جزءاً مقدماً اكتبه في خانة الدفع أدناه — وإلا اتركها 0.")}</p>
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

          {/* شريط العروض المجمّعة: عرض واحد يشمل عدة أسطر لا مكان له بجانب سطر
              بعينه — فيظهر هنا فوق الحساب، ويقول بالضبط شنو تحقق وشكد يوفّر. */}
          {promoHits.some((x) => x.hit.lines.length > 1) && (
            <div className="mb-2 space-y-1.5 rounded-2xl border border-danger-200 bg-danger-50/60 p-2.5 dark:border-danger-500/25 dark:bg-danger-500/10">
              <p className="flex items-center gap-1.5 text-2xs font-black text-danger-700 dark:text-danger-300">
                <BadgePercent size={12} /> {t("retail.promoStrip", "عروض متاحة على هذي السلة")}
              </p>
              {promoHits.filter((x) => x.hit.lines.length > 1).map(({ rule, hit }) => {
                const on = promoOn.includes(rule.id);
                return (
                  <button
                    key={rule.id}
                    type="button"
                    onClick={() => togglePromo(rule.id)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-start transition active:scale-[0.99]",
                      on ? "bg-success-100 text-success-800 dark:bg-success-500/20 dark:text-success-200" : "bg-danger-600 text-white shadow-soft hover:bg-danger-700",
                    )}
                  >
                    <BadgePercent size={13} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate text-2xs font-black">
                      {rule.name || (rule.mode === "bundle"
                        ? t("retail.promoBundleLbl", { q: formatNum(rule.qty), defaultValue: "أي {{q}} بسعر العرض" })
                        : t("retail.promoOffLbl", { q: formatNum(rule.qty), defaultValue: "كل {{q}} خصم" }))}
                      <span className="ms-1.5 font-bold opacity-80">
                        {t("retail.promoUnits", { n: formatNum(hit.units), defaultValue: "({{n}} بالسلة)" })}
                      </span>
                    </span>
                    <span className="shrink-0 text-2xs font-black tabular-nums">
                      {on ? t("retail.promoApplied", { n: money(hit.off), defaultValue: "مفعّل −{{n}}" }) : `−${money(hit.off)}`}
                    </span>
                    {on && <X size={11} className="shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}

          {/* Totals */}
          <div className="space-y-1 border-t border-line pt-3 text-sm">
            <div className={cn("items-center justify-between text-ink-muted", posV2 && !payTools ? "hidden" : "flex")}><span>{t("retail.subtotal", "Subtotal")}</span><span className="tabular-nums">{money(subtotal)}</span></div>
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
                {qtyOffTotal > 0 && (
                  <div className="flex items-center justify-between text-success-600">
                    <span className="flex items-center gap-1.5 truncate"><BadgePercent size={13} className="shrink-0" />{t("retail.qtyPromoRow", "خصم عرض الكمية")}</span>
                    <span className="shrink-0 tabular-nums">-{money(qtyOffTotal)}</span>
                  </div>
                )}
                {manualDiscountAmt > 0 && <div className="flex items-center justify-between text-success-600"><span>{t("retail.discount", "Discount")}</span><span className="tabular-nums">-{money(manualDiscountAmt)}</span></div>}
              </>
            )}
            <div className={cn("flex items-center justify-between", posV2 && "pt-1")}>
              <span className={cn("font-display font-bold text-ink", posV2 && "text-lg")}>{t("retail.total", "Total")}</span>
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
                  className={cn("inline-flex items-center gap-1.5 rounded-lg px-1.5 font-display font-extrabold tabular-nums text-ink underline decoration-dotted decoration-brand-400 underline-offset-4 transition hover:bg-brand-50 dark:hover:bg-brand-500/15", posV2 ? "text-3xl" : "text-xl")}
                >
                  {money(total)} <Pencil size={posV2 ? 15 : 13} className="text-ink-subtle" />
                </button>
              )}
            </div>
            {finalOverride != null && (
              <div className="flex items-center justify-end gap-1.5 text-2xs text-brand-600">
                <span>{t("retail.finalPriceManual", "سعر نهائي محدّد يدوياً")}</span>
                <button onClick={clearFinalOverride} className="rounded-full px-1.5 font-semibold underline decoration-dotted underline-offset-2 hover:text-brand-700">{t("retail.resetAuto", "إلغاء")}</button>
              </div>
            )}
            {feeToClinic && (
              <div className="flex items-center justify-between text-sky-700 dark:text-sky-300">
                <span className="flex items-center gap-1.5"><Bike size={13} className="shrink-0" /> {t("retail.deliveryFeeLine", "أجرة توصيل")}</span>
                <span className="tabular-nums">+{money(deliveryFee)} = <b>{money(effTotal)}</b></span>
              </div>
            )}
            <div className={cn("items-center justify-end gap-1 text-2xs text-success-600", posV2 && !payTools ? "hidden" : "flex")}><TrendingUp size={11} /> {t("retail.profit", "Profit")} {money(profit)}</div>
          </div>

          {preSaleEnabled && (
            <div className={cn("grid-cols-2 gap-2", posV2 && !payTools ? "hidden" : "grid")}>
              <Button variant="secondary" size="sm" disabled={cart.length === 0} leftIcon={<Printer size={15} />} onClick={() => printPreSale("a4")} data-presale="a4">
                {t("retail.preSaleA4", "فاتورة أولية A4")}
              </Button>
              <Button variant="secondary" size="sm" disabled={cart.length === 0} leftIcon={<Printer size={15} />} onClick={() => printPreSale("thermal")} data-presale="thermal">
                {t("retail.preSaleThermal", "فاتورة أولية 80mm")}
              </Button>
            </div>
          )}
          {/* الراجع بالسلة — سطرٌ يقول ما الذي طُرح وكم صار يدفع فعلاً */}
          {retLines > 0 && (
            <div data-retsummary className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800 dark:bg-amber-500/15 dark:text-amber-200">
              <span className="flex items-center gap-1.5"><Undo2 size={13} /> {t("retail.retInCart", { n: formatNum(retLines), defaultValue: "راجع ({{n}})" })}</span>
              <span className="tabular-nums">− {money(retValue)}</span>
            </div>
          )}
          {/* إرجاعٌ خالص: السلة كلها راجع — فمسارٌ خاصٌّ بدل منعٍ أعمى.
              المال يخرج سحباً بصنفه واسمه ووقته (0132)، ولا تُخترع فاتورة. */}
          {pureReturn ? (
            <div data-purereturn className="space-y-2 rounded-2xl border-2 border-warn-300 bg-warn-50 p-3 dark:border-warn-500/40 dark:bg-warn-500/10">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-sm font-black text-warn-800 dark:text-warn-200">
                  <Undo2 size={15} /> {t("retail.pureReturn", "إرجاع للزبون")}
                </span>
                <span className="font-display text-xl font-black tabular-nums text-warn-800 dark:text-warn-200">{money(returnValue)}</span>
              </div>
              <p className="text-2xs font-bold text-warn-700 dark:text-warn-300">
                {t("retail.pureReturnWhy", "البضاعة ترجع للمخزن، والمبلغ ينسجّل بالسحوبات باسم كل صنف ووقته.")}
              </p>
              {/* من وين تطلع الفلوس — نفس خيارات الدفع، فالصندوق يطابق */}
              <div className="grid grid-cols-3 gap-1.5">
                {PAY_OPTIONS.map((o) => {
                  const on = (payments[0]?.method ?? "cash") === o.value;
                  return (
                    <button
                      key={o.value} type="button" data-retmethod={o.value}
                      onClick={() => { playTap(); setPayments([{ method: o.value, amount: 0 }]); }}
                      className={cn("flex h-11 items-center justify-center gap-1.5 rounded-xl border-2 text-2xs font-extrabold transition",
                        on ? "border-warn-500 bg-warn-100 text-warn-800 dark:bg-warn-500/25 dark:text-warn-100"
                           : "border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}
                    >
                      <o.icon size={14} /> {t(o.key, o.def)}
                    </button>
                  );
                })}
              </div>
              <Button
                className="w-full bg-warn-600 text-white hover:bg-warn-700" size="lg" data-doreturn
                disabled={returnValue <= 0} loading={busy} onClick={doReturn} leftIcon={<Undo2 size={18} />}
              >
                {t("retail.confirmReturn", "تأكيد الإرجاع")} · {money(returnValue)}
              </Button>
            </div>
          ) : netNegative && (
            <p data-retnegative className="rounded-xl bg-danger-50 px-3 py-2 text-center text-2xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">
              {t("retail.retNegative", "الراجع أكبر من المشترى — هذا إرجاع لا بيع: كمّل من تبويب «المرتجع» حتى يخرج النقد للزبون بقيدٍ صحيح.")}
            </p>
          )}
          {!pureReturn && (
          <Button className={cn("w-full", posV2 && "shrink-0")} style={posV2 ? { minHeight: 48 } : undefined} size="lg" disabled={cart.length === 0 || needsDebtName || netNegative} loading={busy} onClick={checkout} leftIcon={deliveryOn ? <Bike size={18} /> : <CheckCircle2 size={18} />}>
            {deliveryOn
              ? `${t("retail.completeDelivery", "إرسال للتوصيل")} · ${t("retail.codShort", "يُحصَّل")} ${money(codAmount)}`
              : isCredit
                ? `${t("retail.completePartial", "إتمام البيع")} · ${t("retail.paysNowLabel", "يدفع الآن")} ${money(totalPaid)} · ${t("retail.debtShort", "دين")} ${money(remaining)}`
                : change > 0
                  ? `${t("retail.complete", "إصدار الفاتورة")} · ${t("retail.changeDue", "الباقي")} ${money(change)}`
                  : `${t("retail.complete", "إصدار الفاتورة")} · ${money(total)}`}
          </Button>
          )}
          {posV2 && !cashierId && cart.length > 0 && payTools && (
            <button
              type="button" data-noseller
              onClick={() => { playTap(); setCartSheet(false); setDetailsOpen(true); }}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-warn-50 px-3 py-1.5 text-2xs font-bold text-warn-700 transition hover:bg-warn-100 dark:bg-warn-500/10 dark:text-warn-200"
            >
              <AlertTriangle size={12} className="shrink-0" /> {t("retail.noSellerHint", "بلا بائع محدد — حدّد منو باع حتى تنحسب الفاتورة إله بالتقارير.")}
            </button>
          )}
          {needsDebtName && (
            <p className="text-center text-2xs font-semibold text-danger-600">
              {deliveryOn
                ? t("retail.deliveryNameGate", "التوصيل يحتاج اسم الزبون — اكتبه في خانة «العميل» أعلاه")
                : t("retail.debtNameGate", "لا يمكن تسجيل دين بلا اسم — اكتب اسم الزبون أولاً")}
            </p>
          )}
        </div>
      </div>

      {/* لا شريط سلة مطويّ بعد اليوم: السلة نفسها هي نصف الشاشة السفلي وتبقى
          مفتوحة بأصنافها وإجماليها وزر إتمامها — «الأساسي هو السلة». */}
      {/* ظِل خلف لوح السلة المفتوح */}
      {/* لوحة كمية سطر قائم */}
      {qtyPadFor && (() => {
        const l = cart.find((x) => x.id === qtyPadFor);
        if (!l) return null;
        return (
          <QtyPad
            open title={t("retail.qtyPadTitle", "كمية الصنف")} hint={l.name}
            initial={l.qty} max={unitCap(l)}
            onClose={() => setQtyPadFor(null)}
            onSubmit={(n) => { setQty(l.id, n); setQtyPadFor(null); playSuccess(); }}
          />
        );
      })()}

      {/* منتقي الوزن (كتلة، 0124) */}
      {weightFor && (() => {
        const { p, ret } = weightFor;
        const lineId = ret ? `r:${p.id}` : `p:${p.id}`;
        const line = cart.find((l) => l.id === lineId);
        const current = line?.qty ?? 0;
        // سعر الكيلو المعروض هو سعر السطر إن عدّله الكاشير — لا سعر الكتلوج،
        // وإلا اختلفت أسعار المربّعات عن السعر الذي سيُحسب فعلاً.
        const perKg = line?.byWeight ? line.unit_price : p.sell_price;
        // الراجع بلا سقف؛ المنتج المجمّع يخصم من مخزون القسم فلا سقف محلّي له.
        const stockKg = ret || p.pooled ? Infinity : (p.stock ?? 0);
        return (
          // المفتاح يجبر إعادة التركيب عند تبديل المنتج: بلا هذا كانت مسوّدةُ
          // منتجٍ سابق تبقى مسلَّحةً على منتجٍ جديد بسعرٍ ومخزونٍ مختلفَين.
          <WeightPicker
            key={lineId}
            open name={p.name} perKg={perKg} stockKg={stockKg} current={current} ret={ret}
            onClose={() => setWeightFor(null)}
            onSubmit={(kg) => { addWeightLine(p, kg, ret); setWeightFor(null); }}
          />
        );
      })()}

      {/* لوحة تسليح المضاعِف قبل المسح */}
      <QtyPad
        open={multPad}
        title={t("retail.multPadTitle", "كمية بالجملة")}
        hint={t("retail.multPadHint", "اكتب العدد، ثم امسح الباركود أو اضغط الصنف — يُضاف بهذه الكمية دفعة واحدة")}
        submitLabel={t("retail.multPadDone", "جهّز الكمية")}
        onClose={() => setMultPad(false)}
        onSubmit={(n) => { armMult(n); setMultPad(false); }}
      />

      {posV2 && cartSheet && (
        <button
          type="button" aria-label={t("common.close", "إغلاق")}
          onClick={() => setCartSheet(false)}
          className="fixed inset-0 z-30 bg-ink/40 backdrop-blur-[1px] lg:hidden"
        />
      )}
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
