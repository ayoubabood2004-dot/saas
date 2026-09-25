import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Barcode, Plus, Search, Building2, ShoppingBag, PackageCheck, Sparkles, ListChecks, AlertTriangle,
  Wallet, CalendarClock, X, ScanLine, FolderTree, SlidersHorizontal, ChevronDown,
  UserRound, Phone, HandCoins, Pencil,
} from "lucide-react";
import type { Product, Company, CompanySection, Purchase, PurchaseItem, PurchasePayment, PurchaseDraftLine, PurchaseMeta, ProductCategory, PaymentMethod } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { Modal } from "@/components/Modal";
import { PurchasePicker, type PickedLine } from "@/components/inventory/PurchasePicker";
import { Combobox } from "@/components/Combobox";
import { Button, Badge, useToast, Skeleton, Dialog } from "@/components/ui";
import { cn, money, formatDate, formatNum, localISO, normalizeAr, normalizeCode, matchCode, searchable, groupKey, normGroupName, invNormName } from "@/lib/utils";
import { sellPriceToSend, purchaseBlockers } from "@/lib/purchaseIntent";
import { withTimeout, describeDbError } from "@/lib/errors";
import { codeIndex, excelArtifact, looksLayoutMangled, rescueScan, matchTruncatedCode, stripAim } from "@/lib/productCodes";
import { createScanAssembler } from "@/lib/scanBuffer";
import { playTap, playSuccess, playWarning } from "@/lib/sounds";
import { staggerContainer, staggerItem } from "@/lib/motion";
import { openPurchasePrint, purchaseNo } from "@/lib/purchasePrint";
import { PurchaseLog } from "@/components/inventory/PurchaseLog";
import { PurchaseReceipt } from "@/components/inventory/PurchaseReceipt";
import { getClinicLogo, getClinicSocials, getClinicName } from "@/lib/settings";
import { Printer } from "lucide-react";

/** Canonical company-name helpers (kept in sync with Inventory.tsx). */
/* مستوردان من `@/lib/utils` — نسخةٌ محلّيةٌ ثانية هي ما جعل توسيعَ أحدهما
 * لا يصل الآخر. راجع رأس `groupKey`. */
const normName = normGroupName;
/** ونفسُ المفتاح حرفاً بحرف — نسختان تفترقان تجمعان فواتيرَ شركةٍ بمجموعتين. */
const normKey = groupKey;

const CATEGORY_KEYS: ProductCategory[] = ["medicine", "food", "accessories", "consumables", "other"];
const PAY_METHODS: PaymentMethod[] = ["cash", "card", "transfer"];

/** One editable line in the purchase builder. */
type Line = {
  key: string;
  product_id: string | null; // set when matched to an existing product
  barcode: string;
  /** الصنف المختار للمنتج الجديد — فارغ = «بدون صنف». */
  section_id: string;
  name: string;
  category: string;
  qty: string;
  purchase_price: string;
  sell_price: string;
  min_stock: string;
  /** New batch expiry (ISO yyyy-mm-dd). Blank = keep the product's current one. */
  expiry: string;
};

let LINE_SEQ = 0;
const blankLine = (patch: Partial<Line> = {}): Line => ({
  key: `l${++LINE_SEQ}`, product_id: null, barcode: "", name: "", category: "", section_id: "",
  qty: "", purchase_price: "", sell_price: "", min_stock: "", expiry: "", ...patch,
});

/** Prefill a line from an existing product (a restock). */
/* كان هنا مُطبِّعٌ محلّيّ يشيل الفراغات والأرقام العربية وحدها — كُتب قبل أن
 * يصير للتطبيع مصدرٌ واحد (0164). وبقاؤه بعد الدفعة ١ خلق العطلَ الذي أُصلح
 * هنا: **الاستعلامُ يُطبَّع بشيء والفهرسُ بُني بشيءٍ آخر**. `codeIndex` يبني
 * مفاتيحَه بـ`matchCode` (خفيٌّ محذوف، فارسيةٌ مترجَمة، حالةٌ مطويّة)، وهذا
 * كان يسأله بمفتاحٍ أضعف — فمسحةُ `W90` أو `۸۶۸۰۵۴۳` أو رمزٌ فيه علامةُ اتجاه
 * لا تلقى المنتجَ القائم، فيمرّ سطرُ الشراء بلا `product_id`. وهو المسارُ
 * نفسُه الذي فُتحت له G1: يفشل بصمتٍ ويبدو أنه يعمل.
 *
 * والقاعدةُ من هنا فصاعداً: **المطابقةُ بـ`matchCode` والحفظُ بـ`normalizeCode`**.
 * خلطُهما يكتب الرمزَ مطويَّ الحالة بمخزن العيادة — والخطُّ الأحمر الأوّل يمنع
 * إعادةَ كتابة رمزٍ مخزون. */

/* **خانةُ سعر البيع تبقى فارغة عمداً.** كانت تُعبّأ بسعر المنتج، فكلُّ سطرٍ
 * يرجّع القيمةَ نفسَها إلى الخادم ⇒ أيُّ تغييرٍ صار بعد تحميل الشاشة يُدهس.
 * والخادمُ فيه بوّابةٌ أصلاً (`case when v_sell > 0`): الفارغُ = «لا تلمس».
 * و`purchase_price` **يبقى معبّأً** — هو رقمُ الفاتورة نفسِه ومنه الإجماليُّ
 * ودفترُ المورّد؛ تفريغُه يكسر الحساب بصمت. والسعرُ الحاليُّ يُعرض تلميحاً. */
const lineFromProduct = (p: Product, barcode: string): Line => blankLine({
  product_id: p.id, barcode: barcode || (p.barcode ?? ""), name: p.name,
  category: p.category ?? "", qty: "", purchase_price: String(p.purchase_price ?? ""),
  sell_price: "", min_stock: p.min_stock ? String(p.min_stock) : "",
});

const statusTone = (s?: string): "success" | "warn" | "danger" => (s === "paid" ? "success" : s === "partial" ? "warn" : "danger");

/* ============================ Purchases tab ============================ */
export function PurchasesTab({ products, companies, sections, clinicId, onChanged }: {
  products: Product[]; companies: Company[]; sections?: CompanySection[]; clinicId?: string; onChanged: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [loading, setLoading] = useState(true);
  /** فشلَ آخرُ جلب؟ — «تعذّر» لا «لا توجد فواتير». */
  const [failed, setFailed] = useState(false);
  const [building, setBuilding] = useState(false);
  const [viewing, setViewing] = useState<Purchase | null>(null);
  const [editing, setEditing] = useState<{ purchase: Purchase; items: PurchaseItem[] } | null>(null);
  const [q, setQ] = useState("");
  /** «شركات» = فاتورة كبيرة لكل شركة تتدرج تحتها فواتيرها (الافتراضي — به يُعرف
   *  منين نشتري أكثر) · «بطاقات» = القائمة المسطّحة · «سجل الحركات» = أيام ← بضاعة. */
  const [mode, setMode] = useState<"co" | "cards" | "log">("co");
  const [openCo, setOpenCo] = useState<string | null>(null);
  const mounted = useRef(true);

  /* «احتفظ بالقائمة السابقة» صحيحٌ بالتحديثات، وكاذبٌ بأول تحميل: «السابق»
   * حينها قائمةٌ فارغة — فيرى المديرُ «لا توجد فواتير» وديوناً صفراً عن خطأِ
   * خادم، ويصدّق: نفسُ صنف حادثة `listCouriers` الموثّقة بـCLAUDE.md — قائمةٌ
   * فارغةٌ عن خطأ تقلب معنى المال. فالتمييزُ صار صريحاً: فشلٌ بلا قائمةٍ سابقة
   * يعرض «تعذّر — أعد المحاولة»، وفشلٌ فوق قائمةٍ قائمة يُبقيها ويقول ذلك. */
  const load = async () => {
    try {
      const rows = await withTimeout(repo.listPurchases(clinicId), 15000);
      if (mounted.current) { setPurchases(rows); setFailed(false); }
    } catch (e) {
      if (!mounted.current) return;
      setFailed(true);
      if (purchases.length > 0) toast.error(t("purchase.refreshFailed", "تعذّر تحديث الفواتير — المعروض قد يكون قديماً"), e instanceof Error ? e.message : undefined);
    }
    finally { if (mounted.current) setLoading(false); }
  };
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => { mounted.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // مطبَّعٌ كبقية الشاشات: «شركه الامل» تلقى «شركة الأمل»، و«٢٠٠١» تلقى «2001».
  const ql = searchable(q.trim());
  const shown = ql ? purchases.filter((p) => searchable(p.company_name ?? "").includes(ql) || searchable(p.reference ?? "").includes(ql) || searchable(p.supplier_name ?? "").includes(ql)) : purchases;

  /* «الفاتورة الكبيرة» لكل شركة: كل فواتيرها مجموعةً — الإجمالي والدين وعدد
   * الفواتير وآخر شراء — مرتبةً بالأكثر شراءً، فيُعرف بالجرد منين نأخذ أكثر. */
  const companyGroups = useMemo(() => {
    const m = new Map<string, { name: string; rows: Purchase[]; total: number; due: number }>();
    for (const p of shown) {
      const key = p.company_id ?? normKey(p.company_name ?? "");
      const g = m.get(key) ?? { name: p.company_name || "", rows: [], total: 0, due: 0 };
      g.rows.push(p);
      g.total += p.total || 0;
      g.due += Math.max(0, (p.total || 0) - (p.amount_paid ?? p.total ?? 0));
      if (!g.name && p.company_name) g.name = p.company_name;
      m.set(key, g);
    }
    const all = [...m.entries()].map(([key, g]) => ({ key, ...g }));
    const grand = all.reduce((s, g) => s + g.total, 0);
    return all
      .map((g) => ({ ...g, share: grand > 0 ? g.total / grand : 0 }))
      .sort((a, b) => b.total - a.total);
  }, [shown]);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("purchase.search", "ابحث بالشركة أو رقم الفاتورة…")} />
        </div>
        <div className="inline-flex items-center gap-0.5 rounded-full border border-line bg-surface-2 p-0.5">
          <button type="button" onClick={() => { playTap(); setMode("co"); }}
            className={cn("rounded-full px-3 py-1.5 text-2xs font-bold transition", mode === "co" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
            {t("purchase.viewCompanies", "شركات")}
          </button>
          <button type="button" onClick={() => { playTap(); setMode("cards"); }}
            className={cn("rounded-full px-3 py-1.5 text-2xs font-bold transition", mode === "cards" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
            {t("purchase.viewCards", "بطاقات")}
          </button>
          <button type="button" onClick={() => { playTap(); setMode("log"); }}
            className={cn("rounded-full px-3 py-1.5 text-2xs font-bold transition", mode === "log" ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
            {t("purchase.viewLog", "سجل الحركات")}
          </button>
        </div>
        <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setBuilding(true); }}>{t("purchase.new", "فاتورة شراء")}</Button>
      </div>

      {loading ? (
        <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : failed && purchases.length === 0 ? (
        /* «تعذّر» لا «لا توجد فواتير»: الفرقُ أن الأولى تدعو لإعادة المحاولة
         * والثانية تدعو لتسجيل فاتورةٍ موجودةٍ أصلاً — وتُصدَّق فتُسجَّل مرّتين. */
        <div className="card flex flex-col items-center gap-3 p-10 text-center" data-loadfailed>
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-danger-50 text-danger-500 dark:bg-danger-500/15"><ShoppingBag size={26} /></span>
          <p className="text-ink-subtle">{t("purchase.loadFailed", "تعذّر تحميل الفواتير — ما نعرف إذا عندك فواتير أو لا. أعد المحاولة.")}</p>
          <Button variant="secondary" onClick={() => { playTap(); setLoading(true); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      ) : shown.length === 0 ? (
        <div className="card flex flex-col items-center gap-3 p-10 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-brand-50 text-brand-500 dark:bg-brand-500/15"><ShoppingBag size={26} /></span>
          <p className="text-ink-subtle">{purchases.length === 0 ? t("purchase.empty", "لا توجد فواتير شراء بعد. سجّل أول فاتورة ونزّل بضاعتها على المخزون دفعة وحدة.") : t("purchase.noMatch", "لا توجد فاتورة مطابقة.")}</p>
          {purchases.length === 0 && <Button leftIcon={<Plus size={16} />} onClick={() => { playTap(); setBuilding(true); }}>{t("purchase.new", "فاتورة شراء")}</Button>}
        </div>
      ) : mode === "log" ? (
        <PurchaseLog purchases={shown} />
      ) : mode === "co" ? (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {companyGroups.map((g) => {
            const isOpen = openCo === g.key;
            return (
              <motion.div key={g.key} variants={staggerItem} className="card overflow-hidden p-0">
                <button
                  type="button"
                  data-cogroup
                  onClick={() => { playTap(); setOpenCo(isOpen ? null : g.key); }}
                  className="flex w-full items-center gap-3 p-3.5 text-start transition hover:bg-surface-2/60"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><Building2 size={20} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{g.name || t("purchase.noCompany", "بدون شركة")}</p>
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-subtle">
                      <span className="flex items-center gap-1"><ShoppingBag size={11} /> {t("purchase.invCount", { n: g.rows.length, defaultValue: "{{n}} فاتورة" })}</span>
                      <span className="flex items-center gap-1"><CalendarClock size={11} /> {t("purchase.lastBuy", { d: formatDate(g.rows[0]?.purchased_at, i18n.language), defaultValue: "آخر شراء {{d}}" })}</span>
                      <span className="tabular-nums">{t("purchase.shareOfSpend", { v: Math.round(g.share * 100), defaultValue: "{{v}}٪ من مشترياتك" })}</span>
                    </div>
                    {/* شريط الحصة: طوله = نصيب الشركة من كل صرف المشتريات */}
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.max(3, Math.round(g.share * 100))}%` }} />
                    </div>
                  </div>
                  <div className="shrink-0 text-end">
                    <p className="text-sm font-extrabold text-ink tabular-nums">{money(g.total)}</p>
                    {g.due > 0 && <p className="text-xs font-bold text-danger-600 tabular-nums dark:text-danger-400">{t("purchase.dueShort", { v: money(g.due), defaultValue: "عليه {{v}}" })}</p>}
                    <ChevronDown size={15} className={cn("ms-auto mt-0.5 text-ink-subtle transition", isOpen && "rotate-180")} />
                  </div>
                </button>
                {isOpen && (
                  <div className="space-y-2 border-t border-line bg-surface-2/40 p-2.5" data-cogroupbody>
                    {g.rows.map((p) => <PurchaseRow key={p.id} p={p} onOpen={() => setViewing(p)} />)}
                  </div>
                )}
              </motion.div>
            );
          })}
        </motion.div>
      ) : (
        <motion.div variants={staggerContainer} initial="initial" animate="animate" className="space-y-2">
          {shown.map((p) => (
            <motion.div key={p.id} variants={staggerItem}>
              <PurchaseRow p={p} onOpen={() => setViewing(p)} />
            </motion.div>
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

      <PurchaseBuilderModal
        open={!!editing}
        products={products}
        companies={companies}
        sections={sections}
        clinicId={clinicId}
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={() => { setEditing(null); void load(); onChanged(); }}
      />

      <PurchaseDetailModal
        purchase={viewing}
        onClose={() => setViewing(null)}
        onChanged={() => { void load(); onChanged(); }}
        onEdit={(p, items) => { setViewing(null); setEditing({ purchase: p, items }); }}
      />
    </div>
  );
}

/** بطاقة فاتورة واحدة — تُستعمل بالقائمة المسطّحة وداخل فاتورة الشركة الكبيرة. */
function PurchaseRow({ p, onOpen }: { p: Purchase; onOpen: () => void }) {
  const { t, i18n } = useTranslation();
  return (
    <button type="button" onClick={() => { playTap(); onOpen(); }} className="card flex w-full items-center gap-3 p-3.5 text-start transition hover:shadow-raised">
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
          {p.supplier_name && <span className="flex items-center gap-1"><UserRound size={11} /> {p.supplier_name}</span>}
        </div>
      </div>
      <div className="text-end">
        <p className="text-sm font-bold text-ink tabular-nums">{money(p.total)}</p>
        {(() => { const d = Math.max(0, p.total - (p.amount_paid ?? p.total)); return d > 0
          ? <p className="text-xs font-bold text-danger-600 tabular-nums dark:text-danger-400">{t("purchase.dueShort", { v: money(d), defaultValue: "عليه {{v}}" })}</p>
          : <Badge tone={statusTone(p.status)}>{t(`purchase.status.${p.status ?? "paid"}`, p.status ?? "paid")}</Badge>; })()}
      </div>
    </button>
  );
}

/* ============================ Detail + print ============================ */
/** فاتورة شراء كاملة: البضاعة + المورّد + سجل التسديدات + تسديد دفعة.
 *  Exported — «دفتر الديون» في المخزون يفتح نفس النافذة. */
export function PurchaseDetailModal({ purchase: purchaseProp, onClose, onChanged, onEdit }: { purchase: Purchase | null; onClose: () => void; onChanged?: () => void; onEdit?: (purchase: Purchase, items: PurchaseItem[]) => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [items, setItems] = useState<PurchaseItem[]>([]);
  const [payments, setPayments] = useState<PurchasePayment[]>([]);
  const [loading, setLoading] = useState(false);
  // التسديد يحدّث الفاتورة — نعرض نسخة محلية تعكس الدفعات فوراً.
  const [purchase, setPurchase] = useState<Purchase | null>(purchaseProp);
  const [settling, setSettling] = useState(false);
  const [payAmount, setPayAmount] = useState("");
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [payNote, setPayNote] = useState("");
  const [payBusy, setPayBusy] = useState(false);
  // قبل ترحيل 0076 لا يوجد settle_purchase — نخفي زر التسديد بدل فشل صامت.
  const [ledgerOk, setLedgerOk] = useState<boolean | null>(null);

  useEffect(() => {
    setPurchase(purchaseProp);
    setSettling(false); setPayAmount(""); setPayMethod("cash"); setPayNote("");
    if (!purchaseProp) { setItems([]); setPayments([]); return; }
    let alive = true;
    setLoading(true);
    Promise.all([
      repo.listPurchaseItems(purchaseProp.id).catch(() => [] as PurchaseItem[]),
      repo.listPurchasePayments(purchaseProp.id).catch(() => [] as PurchasePayment[]),
      repo.supportsSupplierLedger().catch(() => true),
    ])
      .then(([rows, pays, ok]) => { if (alive) { setItems(rows); setPayments(pays); setLedgerOk(ok); } })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [purchaseProp]);

  if (!purchase) return null;
  const paid = purchase.amount_paid != null ? purchase.amount_paid : purchase.total;
  const due = Math.max(0, purchase.total - paid);

  const settle = async () => {
    if (payBusy) return;
    const amt = Math.min(Number(payAmount) || 0, due);
    if (amt <= 0) { toast.error(t("purchase.settleAmount", "أدخل مبلغاً أكبر من صفر")); return; }
    setPayBusy(true);
    try {
      const updated = await repo.settlePurchase(purchase.id, amt, payMethod, payNote.trim() || null);
      if (updated) setPurchase(updated);
      const pays = await repo.listPurchasePayments(purchase.id).catch(() => payments);
      setPayments(pays);
      setSettling(false); setPayAmount(""); setPayNote("");
      playSuccess();
      toast.success(t("purchase.settled", { v: money(amt), defaultValue: "سُدِّد {{v}} من دين هذه الفاتورة" }));
      onChanged?.();
    } catch (e) {
      playWarning();
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    } finally {
      setPayBusy(false);
    }
  };

  const print = () => {
    const ok = openPurchasePrint(purchase, items, printOptions(user, i18n.language));
    if (!ok) toast.error(t("retail.popupBlocked", "فعّل النوافذ المنبثقة للطباعة"));
    else void repo.logClientEvent("purchase.print", { ref: purchaseNo(purchase.id) });
  };

  return (
    <Modal open={!!purchase} onClose={onClose} title={`${t("purchase.new", "فاتورة شراء")} · ${purchaseNo(purchase.id)}`}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-surface-2 p-3.5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 truncate font-bold text-ink"><Building2 size={14} className="text-ink-subtle" /> {purchase.company_name || t("purchase.noCompany", "بدون شركة")}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-ink-subtle">
              <span className="flex items-center gap-1"><CalendarClock size={11} /> {formatDate(purchase.purchased_at, i18n.language)}</span>
              {purchase.reference && <span className="font-mono">#{purchase.reference}</span>}
              {purchase.supplier_name && <span className="flex items-center gap-1"><UserRound size={11} /> {purchase.supplier_name}</span>}
              {purchase.supplier_phone && <span className="flex items-center gap-1 font-mono" dir="ltr"><Phone size={11} /> {purchase.supplier_phone}</span>}
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

        {/* تسديد الدين — يظهر فقط عندما يوجد متبقٍّ والترحيل 0076 مفعَّل */}
        {due > 0 && ledgerOk && (
          settling ? (
            <div className="space-y-3 rounded-2xl border border-brand-200 bg-brand-50/50 p-3.5 dark:border-brand-500/25 dark:bg-brand-500/10">
              <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><HandCoins size={15} className="text-brand-600" /> {t("purchase.settleTitle", "تسديد دفعة من الدين")}</p>
              <div className="grid gap-2 sm:grid-cols-3">
                <div>
                  <label className="label text-2xs">{t("purchase.settleAmountLbl", "المبلغ")}</label>
                  <input type="number" inputMode="numeric" min="0" step="1" className="input font-bold tabular-nums" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} placeholder={money(due)} autoFocus />
                </div>
                <div>
                  <label className="label text-2xs">{t("purchase.payMethod", "طريقة الدفع")}</label>
                  <div className="flex gap-1">
                    {(["cash", "card", "transfer"] as PaymentMethod[]).map((m) => (
                      <button key={m} onClick={() => { playTap(); setPayMethod(m); }} className={cn("flex-1 rounded-xl px-1.5 py-2 text-xs font-bold transition", payMethod === m ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>{t(`pay.${m}`, m)}</button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="label text-2xs">{t("purchase.notes", "ملاحظات")}</label>
                  <input className="input" value={payNote} onChange={(e) => setPayNote(e.target.value)} placeholder="—" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" loading={payBusy} leftIcon={<HandCoins size={15} />} onClick={settle}>{t("purchase.settleDo", "سدّد")}</Button>
                <Button size="sm" variant="secondary" onClick={() => { playTap(); setPayAmount(String(due)); }}>{t("purchase.settleAll", { v: money(due), defaultValue: "المبلغ كامل ({{v}})" })}</Button>
                <Button size="sm" variant="ghost" onClick={() => { playTap(); setSettling(false); }}>{t("common.cancel", "إلغاء")}</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="w-full border-danger-200 text-danger-700 hover:bg-danger-50 dark:text-danger-300" leftIcon={<HandCoins size={16} />} onClick={() => { playTap(); setSettling(true); setPayAmount(String(due)); }}>
              {t("purchase.settleOpen", { v: money(due), defaultValue: "تسديد الدين — المتبقّي {{v}}" })}
            </Button>
          )
        )}

        {/* سجل التسديدات — كل دفعة انسدّت على هذه الفاتورة */}
        {payments.length > 0 && (
          <div className="overflow-hidden rounded-2xl border border-line">
            <p className="flex items-center gap-1.5 bg-surface-2 p-2.5 text-xs font-bold text-ink-muted"><HandCoins size={13} /> {t("purchase.paymentsLog", "سجل التسديدات")}</p>
            {payments.map((pp) => (
              <div key={pp.id} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 border-t border-line p-2.5 text-xs">
                <span className="font-bold text-ink tabular-nums">{money(pp.amount)}</span>
                <span className="text-ink-subtle">{formatDate(pp.paid_at, i18n.language)}</span>
                {pp.method && <span className="chip bg-surface-2 text-2xs text-ink-muted">{t(`pay.${pp.method}`, pp.method)}</span>}
                {pp.note && <span className="text-ink-subtle">{pp.note}</span>}
              </div>
            ))}
          </div>
        )}

        {purchase.notes && <p className="rounded-xl border border-line bg-surface-1 p-3 text-sm text-ink-muted"><strong>{t("purchase.notes", "ملاحظات")}:</strong> {purchase.notes}</p>}

        <div className="flex flex-col gap-2 sm:flex-row">
          {/* تعديل الفاتورة: نسيت سطراً؟ كمية غلط؟ — يفتح البنّاء بنفس السطور
              والمخزون يتحرك بالفرق فقط عند الحفظ. */}
          {onEdit && !loading && (
            <Button variant="secondary" className="flex-1" data-editpurchase leftIcon={<Pencil size={16} />} onClick={() => { playTap(); onEdit(purchase, items); }}>
              {t("purchase.editTitle", "تعديل فاتورة شراء")}
            </Button>
          )}
          <Button className="flex-1" leftIcon={<Printer size={16} />} onClick={print}>{t("purchase.print", "طباعة الفاتورة")}</Button>
        </div>
      </div>
    </Modal>
  );
}

/** ترويسةُ طباعة فاتورة الشراء — موضعٌ واحد لنافذة التفاصيل ولكشف ما بعد الحفظ. */
function printOptions(user: { full_name?: string | null; phone?: string | null } | null | undefined, lang: string) {
  const socials = getClinicSocials();
  return {
    clinicName: getClinicName() || user?.full_name || "doctorVet",
    clinicPhone: user?.phone ?? null,
    brand: "doctorVet",
    lang,
    logoUrl: getClinicLogo(),
    facebook: socials.facebook || null,
    instagram: socials.instagram || null,
  };
}

/* ============================ Builder ============================ */
/** وضعا عمل: فاتورة جديدة، أو **تعديل** فاتورة محفوظة (editing) — التعديل يستورد
 *  سطورها، يثبّت شركتها، ويحفظ عبر updatePurchase فيتحرك المخزون بالفرق فقط. */
export function PurchaseBuilderModal({ open, products, companies, sections, clinicId, defaultCompanyName, editing, onClose, onSaved }: {
  open: boolean; products: Product[]; companies: Company[]; sections?: CompanySection[]; clinicId?: string; defaultCompanyName?: string;
  editing?: { purchase: Purchase; items: PurchaseItem[] } | null;
  onClose: () => void; onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [company, setCompany] = useState("");
  const [reference, setReference] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [supplierPhone, setSupplierPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [purchasedAt, setPurchasedAt] = useState(localISO());
  const [payMethod, setPayMethod] = useState<PaymentMethod>("cash");
  const [amountPaid, setAmountPaid] = useState("");
  /* لا افتراضَ: المستخدمُ يقول إن كانت مدفوعةً كاملةً أو عليها دَين. `null`
   * تعني «ما اختار بعد» فيُوقَف الحفظ — والخطأُ هنا كان باتّجاهٍ واحدٍ دائماً. */
  const [paidMode, setPaidMode] = useState<"full" | "debt" | null>(null);
  const [lines, setLines] = useState<Line[]>([blankLine()]);
  const [scan, setScan] = useState("");
  const [busy, setBusy] = useState(false);
  /* بعد الحفظ النافذةُ **ما تنطوي** — تنقلب لكشف ما صار بالمخزن (م٢). والقائمةُ
   * خلفها تُحدَّث عند الإغلاق الصريح (`onSaved`)، لا عند الحفظ. */
  const [saved, setSaved] = useState<Purchase | null>(null);
  // Matched (restock) lines render COMPACT — barcode, name, where it lives, and
  // ONE required field: the count. This set holds lines the user expanded to
  // optionally adjust prices/alerts.
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);
  /** مجمِّعُ المسحة لهذا الحقل — يحكم على Tab: ماسحٌ أم إنسانٌ يتنقّل. */
  const scanAsm = useRef(createScanAssembler());
  const createdRef = useRef<Company[]>([]);

  /* الفهرسُ من `productCodes` لا مكتوباً هنا: الأساسيُّ والإضافيُّ معاً وبقاعدةِ
   * أولويةٍ واحدة، مفحوصةٍ بـ`products-test`. مسحُ باركود المصنع على بضاعةٍ
   * داخلة يلقى المادّةَ ولو كان رمزُها الأساسيّ رقمَ رفّ — فلا يُنشأ توأمٌ
   * برصيدٍ مقسوم. */
  const byBarcode = useMemo(() => codeIndex(products), [products]);

  useEffect(() => {
    if (!open) return;
    createdRef.current = [];
    setSaved(null);
    if (editing) {
      const p = editing.purchase;
      setCompany(p.company_name ?? "");
      setReference(p.reference ?? "");
      setSupplierName(p.supplier_name ?? "");
      setSupplierPhone(p.supplier_phone ?? "");
      setNotes(p.notes ?? "");
      setPurchasedAt((p.purchased_at ?? "").slice(0, 10) || localISO());
      setPayMethod((p.payment_method as PaymentMethod) ?? "cash");
      setAmountPaid(p.amount_paid != null ? String(p.amount_paid) : "");
      setLines(editing.items.map((it) => blankLine({
        product_id: it.product_id ?? null,
        barcode: it.barcode ?? "",
        name: it.name,
        category: it.category ?? "",
        qty: String(it.qty ?? ""),
        purchase_price: it.purchase_price ? String(it.purchase_price) : "",
        /* وبالتعديل كذلك: لقطةُ `purchase_items` سعرُ يومِ الفاتورة، وإرجاعُها
         * يدهس سعرَ الرفّ اليوم بسعرٍ عمرُه شهر. تُعرض تلميحاً لا قيمةً. */
        sell_price: "",
      })));
    } else {
      setCompany(defaultCompanyName ?? "");
      setReference(""); setSupplierName(""); setSupplierPhone(""); setNotes(""); setPurchasedAt(localISO());
      setPayMethod("cash"); setAmountPaid(""); setPaidMode(null);
      setLines([blankLine()]);
    }
    setScan("");
    setExpandedKeys(new Set());
    setTimeout(() => scanRef.current?.focus(), 90);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  /* بوضع التعديل: كمية السطر القديمة داخل المخزون أصلاً — قفزة المخزون تُحسب
   * من الرصيد بعد عكسها، فلا يظهر رقم مضاعف مضلِّل. */
  const origQty = useMemo(() => {
    const m = new Map<string, number>();
    for (const it of editing?.items ?? []) {
      if (it.product_id) m.set(it.product_id, (m.get(it.product_id) ?? 0) + (it.qty || 0));
    }
    return m;
  }, [editing]);

  const patchLine = (key: string, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const removeLine = (key: string) => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== key) : ls));

  // When a barcode is typed into a line, auto-fill from an existing product.
  const onBarcode = (key: string, code: string) => {
    // المطابقةُ بمفتاحِ الفهرس، والمحفوظُ بالسطر رمزُ العيادة كما كتبته.
    const hit = matchCode(code);
    const clean = normalizeCode(code);
    const match = hit ? byBarcode.get(hit) : undefined;
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
  /* -- مطابقة بالاسم: «رويال» تلگي «Royal Canin…» و«اموكس» تلگي «أموكسيسيلين» --
   * الموظف بالمخزن أغلب وقته يعرف الاسم مو الباركود، وكتابة اسم موجود يجب أن
   * تسحب المنتج بمكانه (شركته وأسعاره) بدل ما تخلق نسخة مكررة عمياء. */
  const nameIndex = useMemo(() => products.map((p) => ({ p, key: normalizeAr(p.name) })), [products]);
  const findByName = (text: string): Product[] => {
    const q = normalizeAr(normName(text));
    if (q.length < 2) return [];
    return nameIndex.filter((x) => x.key.includes(q)).map((x) => x.p).slice(0, 6);
  };

  /** أضف منتجاً معروفاً كسطر (أو زد كمية سطره الموجود) — من المسح أو الاقتراح. */
  const addProductLine = (p: Product) => {
    setLines((ls) => {
      const existing = ls.find((l) => l.product_id === p.id);
      if (existing) return ls.map((l) => (l.key === existing.key ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      const base = ls.length === 1 && !ls[0].barcode && !ls[0].name ? [] : ls;
      return [...base, { ...lineFromProduct(p, p.barcode ?? ""), qty: "1" }];
    });
    setScan("");
    playTap();
    scanRef.current?.focus();
  };

  /** دفعةٌ من المنتقي: سطرٌ لكلّ منتج، والقائمُ منها **يُجمَع** لا يُكرَّر.
   *  والدمجُ بنفس قاعدة الماسح (`addProductLine`) كي لا يكون للشاشة سلوكان. */
  const addPickedLines = (picks: PickedLine[]) => {
    if (!picks.length) return;
    setLines((ls) => {
      let base = ls.length === 1 && !ls[0].barcode && !ls[0].name ? [] : ls.slice();
      for (const { product, qty } of picks) {
        /* **والعددُ المكتوبُ بالمنتقي هو عددُ السطر، لا زيادةٌ عليه.** الحقلُ
         * يبدأ بما هو الآن بالفاتورة، فما يكتبه المستخدم هو ما يصير — بلا
         * حسابٍ ذهنيّ. (والماسحُ يبقى بالجمع: كلُّ مسحةٍ قطعة.) */
        const i = base.findIndex((l) => l.product_id === product.id);
        if (i >= 0) { base[i] = { ...base[i], qty: String(qty) }; continue; }
        /* **وتبنّي سطرٍ غيرِ مطابق**: سطرٌ كُتب باركودُه بلا أن يُطابَق منتجاً
         * (لصقٌ من إكسل، أو رمزٌ بصيغةٍ أخرى) — اختيارُ منتجه من القائمة يربطه
         * به بدل أن يصنع سطراً ثانياً لنفس المادّة، فيبقى عددُه المكتوب. */
        const codes = new Set([product.barcode, ...(product.alt_codes ?? [])].filter(Boolean).map((c) => matchCode(c as string)));
        const j = base.findIndex((l) => !l.product_id && l.barcode.trim() && codes.has(matchCode(l.barcode)));
        if (j >= 0) {
          const kept = Number(base[j].qty) || 0;
          base[j] = { ...lineFromProduct(product, base[j].barcode), key: base[j].key, qty: String(kept > 0 ? kept : qty) };
          continue;
        }
        base = [...base, { ...lineFromProduct(product, product.barcode ?? ""), qty: String(qty) }];
      }
      return base;
    });
    playTap();
    toast.success(t("purchase.pickAdded", "انضافت {{n}} مادة للفاتورة — دقّق الأسعار لو تغيّرت", { n: picks.length }));
    scanRef.current?.focus();
  };

  /* **سطران لنفس المادّة يُقالان — ولا يُمنعان.**
   *
   * `record_purchase` تحلّ كلَّ سطرٍ وحدَه ثمّ `stock = stock + qty` لكلٍّ —
   * فسطران يحلّان لنفس المنتج يُضيفان مرّتين، بلا خطأٍ ولا تنبيه. والمقيسُ
   * بالإنتاج: **خمسُ فواتيرَ** فيها ذلك فعلاً (إحداها خمسةُ سطورٍ بنفس
   * الباركود، ٥٠ لكلٍّ).
   *
   * **ولا يُمنع**: ١٤٣ + ١٥٤ لنفس المادّة بفاتورةٍ واحدة قد تكون دفعتين
   * مقصودتين. فالرفضُ يكسر عملاً قائماً، والصمتُ يُضاعف رصيداً. الحلُّ أن
   * يُرى: شارةٌ بالسطر تقول «نفس المادّة بسطرٍ ثانٍ» ومجموعَها. */
  const dupOf = useMemo(() => {
    const byKey = new Map<string, { keys: string[]; total: number }>();
    for (const l of lines) {
      const k = l.product_id ? `p:${l.product_id}`
        : l.barcode.trim() ? `c:${matchCode(l.barcode)}`
        : l.name.trim() ? `n:${searchable(l.name)}` : "";
      if (!k) continue;
      const cur = byKey.get(k) ?? { keys: [], total: 0 };
      cur.keys.push(l.key); cur.total += Number(l.qty) || 0;
      byKey.set(k, cur);
    }
    const m = new Map<string, number>();
    for (const g of byKey.values()) if (g.keys.length > 1) for (const key of g.keys) m.set(key, g.total);
    return m;
  }, [lines]);

  /** ما هو الآن بالفاتورة — يُعرض بالمنتقي فلا يُضاف مرّتين بلا علم. */
  const inInvoice = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of lines) if (l.product_id) m.set(l.product_id, (m.get(l.product_id) ?? 0) + (Number(l.qty) || 0));
    return m;
  }, [lines]);

  const scanAdd = () => {
    const raw = scan.trim();
    if (!raw) return;
    // شكلُ إكسل يُردّ قبل أن يصير سطراً (G8). وهنا الضررُ أوضحُ منه بنموذج
    // المنتج: فحصُ «يشبه باركوداً» أدناه لا يقبل `.` و`+`، فالصيغةُ العلمية
    // تسقط إلى فرعِ **الاسم** — فيُنشأ منتجٌ اسمه «1.23E+12» بمخزن العيادة.
    if (excelArtifact(raw)) {
      playWarning();
      toast.error(t("pos.excelCode", "هذا شكل إكسل مشوّه — الرقم الأصلي ضاع"),
        t("pos.excelCodeHint", "رجّع عمود الباركود إلى «نص» بإكسل وأعد اللصق. مثال العطب: 1.23E+12"));
      return;
    }
    const hit = matchCode(raw);
    // باركود أولاً، وإلا اسم: مطابقة تامة، أو مرشح وحيد لا لبس فيه.
    let match = byBarcode.get(hit);
    /* طبقاتُ النجدة نفسُها التي بشاشة البيع — كانت هذه الشاشةُ عمياءَ عنها،
     * فماسحٌ مضبوطٌ على AIM أو GTIN-14 يُنشئ **توأماً** بكلّ استلامِ بضاعة:
     * البيعُ تنقذه `rescueScan` فيبيع من الأصل، والأصلُ يبقى صفراً وكلُّ مسحةِ
     * بيعٍ تقول «رصيده صفر» — دورةُ «المنتج اختفى» من بابها الذي بقي مفتوحاً. */
    if (!match) {
      const r = rescueScan(products, raw);
      if (r) {
        match = r.product;
        toast.toast({ tone: "info", title: t("pos.scanRescuedPurchase", "«{{name}}» — طابق بصيغة {{code}}", { name: r.product.name, code: r.via }) });
      }
    }
    if (!match) {
      const cut = matchTruncatedCode(products, raw);
      if (cut) {
        match = cut;
        toast.toast({ tone: "info", title: t("pos.scanHealedPurchase", "الماسح بلع أوّل الباركود — طابقناه بـ«{{name}}»", { name: cut.name }) });
      }
    }
    if (!match) {
      const cands = findByName(raw);
      const exact = cands.find((p) => normalizeAr(p.name) === normalizeAr(normName(raw)));
      match = exact ?? (cands.length === 1 ? cands[0] : undefined);
    }
    if (match) { addProductLine(match); return; }
    // مسحةٌ بكيبوردٍ عربيّ (G7): نقولها ولا نمنع — قد يكون اسماً عربياً حقيقياً.
    // ولذلك الشرطُ ضيّق: ما يقرأ بعكسه رمزاً أو رابطاً لا كلمة (looksLayoutMangled).
    const mangled = looksLayoutMangled(raw);
    if (mangled) {
      playWarning();
      toast.toast({
        tone: "warn",
        title: t("pos.arabicCode", "الباركود فيه أحرف عربية — الغالب الكيبورد كان عربياً وقت المسح. بدّل اللغة وأعد المسح."),
        description: t("pos.arabicCodeReads", "بالعكس يقرأ: {{fix}}", { fix: mangled }),
      });
    }
    setLines((ls) => {
      // Merge into an existing line with the same barcode if present.
      const existing = ls.find((l) => matchCode(l.barcode) === hit && hit);
      if (existing) return ls.map((l) => (l.key === existing.key ? { ...l, qty: String((Number(l.qty) || 0) + 1) } : l));
      /* بادئةُ AIM تُقشَّر صراحةً قبل الحكم: `]C1` فيها `]` فتسقط بفحص «يشبه
       * باركوداً» إلى فرع **الاسم** — فيُنشأ منتجٌ اسمُه «]C16221…» بمخزن
       * العيادة. رمزٌ لا يصير اسماً أبداً. */
      const aimless = stripAim(raw);
      const looksBarcode = /^[0-9A-Za-z_-]+$/.test(aimless);
      const fresh = looksBarcode
        ? blankLine({ barcode: normalizeCode(aimless), qty: "1" })
        : blankLine({ name: normName(raw), qty: "1" });
      // Drop a leading empty line so the list stays clean.
      const base = ls.length === 1 && !ls[0].barcode && !ls[0].name ? [] : ls;
      return [...base, fresh];
    });
    setScan("");
    playTap();
    scanRef.current?.focus();
  };

  /** اقتراحات حية وأنت تكتب بصندوق الإدخال — منتج موجود يظهر اسمه فوراً. */
  const scanSuggestions = useMemo(() => {
    const raw = scan.trim();
    if (raw.length < 2 || byBarcode.get(matchCode(raw))) return [];
    return findByName(raw);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scan, nameIndex]);

  /* أصناف الشركة المختارة — بها يُعرض منتقي الصنف للسطر الجديد، فتهبط
   * القطعة الجديدة بمكانها من أول يوم بدل بطاقة «بدون صنف». */
  const companySections = useMemo(() => {
    const key = normKey(normName(company));
    if (!key) return [] as CompanySection[];
    /* ومعها ما صُنع بهذه الجلسة: شركةٌ أُنشئت تواً كانت تظهر بلا أصناف. */
    const co = [...companies, ...createdRef.current].find((c) => normKey(c.name) === key);
    return co ? (sections ?? []).filter((x) => x.company_id === co.id) : [];
  }, [company, companies, sections]);

  const validLines = lines.filter((l) => (l.name.trim() || l.barcode.trim()) && Number(l.qty) > 0);
  const total = validLines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.purchase_price) || 0), 0);
  const totalUnits = validLines.reduce((s, l) => s + (Number(l.qty) || 0), 0);
  /* للفراغ دلالتان بهذه الشاشة (م٤): بالإنشاء «مدفوعٌ كامل»، وبالتعديل «يبقى
   * المدفوعُ كما هو» — والتسمية أسفلَه تقولهما بالنصّ، و`amount_paid` تُرسَل
   * `undefined` بالتعديل فعلاً. لكنّ الشارة كانت تُشتقّ بدلالة الإنشاء وحدها،
   * فمسحُ الخانة بفاتورةٍ مدينة يعرض «مدفوعة» — شارةٌ تكذب على دَينٍ قائم. */
  const paidNum = amountPaid.trim() !== ""
    ? Math.max(0, Math.min(total, Number(amountPaid) || 0))
    : editing ? Math.max(0, Math.min(total, editing.purchase.amount_paid ?? total)) : total;
  const status = paidNum >= total ? "paid" : paidNum <= 0 ? "unpaid" : "partial";

  const resolveCompanyId = async (): Promise<{ id: string | null; created: Company | null; name: string }> => {
    const typed = normName(company);
    if (!typed) return { id: null, created: null, name: "" };
    /* **الطرفان من نفس الدالّة** — نفسُ عطب شاشة المخزون حرفياً، وهذا المسارُ
       الثاني الذي كان يولّد شركاتٍ توائمَ عند حفظ فاتورة شراء. */
    const key = normKey(typed);
    const existing = [...companies, ...createdRef.current].find((c) => normKey(c.name) === key);
    if (existing) return { id: existing.id, created: null, name: existing.name };
    /* بحثٌ بالخادم ثم إنشاء — نفسُ سبب شاشة المخزون: قائمةُ المتصفّح قد تكون
       قديمة. ولا يُعدّ «منشأً» (فيُتراجع عنه) إلا ما وُلد تواً. */
    const co = await repo.ensureCompany(typed, clinicId ?? null);
    const isNew = !companies.some((c) => c.id === co.id)
      && !!co.created_at && Date.now() - new Date(co.created_at).getTime() < 15_000;
    if (!companies.some((c) => c.id === co.id)) createdRef.current.push(co);
    return { id: co.id, created: isNew ? co : null, name: co.name };
  };

  /* **الخروجُ يسأل قبل ما يضيّع.** كان Esc أو ضغطةٌ على الستارة تطوي الفاتورةَ
   * كلَّها بلا كلمة، و`useEffect([open])` يصفّر السطورَ عند إعادة الفتح —
   * فبضاعةٌ وصلت تُعاد كتابتُها من الذاكرة. ولا `window.confirm`: تأكيدُ
   * المتصفّح يُقبل بلا قراءة، وهي حادثةٌ موثّقة بهذا المشروع. */
  const [askLeave, setAskLeave] = useState(false);
  const filledCount = lines.filter((l) => l.name.trim() || l.barcode.trim() || Number(l.qty) > 0).length;
  const confirmClose = () => {
    if (busy) return false;                 // حفظٌ جارٍ: لا يُقطع
    if (filledCount === 0) return true;     // فاتورةٌ فارغة تُغلق بلا سؤال
    setAskLeave(true);
    return false;
  };

  const printSaved = async (p: Purchase) => {
    try {
      const its = await repo.listPurchaseItems(p.id);
      const ok = openPurchasePrint(p, its, printOptions(user, i18n.language));
      if (!ok) toast.error(t("retail.popupBlocked", "فعّل النوافذ المنبثقة للطباعة"));
      else void repo.logClientEvent("purchase.print", { ref: purchaseNo(p.id) });
    } catch (e) {
      toast.error(describeDbError(e, t), e instanceof Error ? e.message : undefined);
    }
  };

  const save = async () => {
    if (busy) return;
    if (validLines.length === 0) { toast.error(t("purchase.needLine", "أضف صنفاً واحداً على الأقل بكمية أكبر من صفر")); return; }
    /* **وسطرٌ بلا كمية كان يسقط بصمت.** `validLines` يصفّي `qty > 0`، و`save`
     * ما كان يعترض إلا لو سقطت السطورُ **كلُّها** — ففاتورةٌ بأربعين سطراً
     * وثلاثةٌ منها بلا عدد تُحفظ بسبعةٍ وثلاثين، والبضاعةُ وصلت ولم تُسجَّل.
     * ويزداد الاحتمالُ بالمنتقي (تؤشّر خمسة عشر، تنسى عدداً). فيُقال بالاسم
     * ويُرفض الحفظ — «الصمتُ يُصدَّق» (CLAUDE.md). */
    const blank = lines.filter((l) => (l.name.trim() || l.barcode.trim()) && !(Number(l.qty) > 0));
    if (blank.length) {
      playWarning();
      toast.error(
        t("purchase.blankQty", "{{n}} سطر بلا عدد — ما راح ينحفظ", { n: blank.length }),
        t("purchase.blankQtyWhich", "اكتب العدد أو احذف السطر: {{names}}",
          { names: blank.slice(0, 5).map((l) => l.name.trim() || l.barcode.trim()).join(t("common.listSep", "، ")) + (blank.length > 5 ? "…" : "") }),
      );
      return;
    }
    if (!editing && paidMode === null) {
      playWarning();
      toast.error(
        t("purchase.needPaidMode", "قول شلون انحسبت الفاتورة"),
        t("purchase.needPaidModeHow", "اختر «دفعناها كلّها» أو «عليها دَين» — الفراغ كان ينسجّل مدفوعة ويضيع دَين الشركة."),
      );
      return;
    }

    /* **رمزٌ معلّقٌ بصندوق المسح.** `scanAdd` تُنادى من Enter ومن زرّ «إضافة»
     * وحدَهما — فمن يمسح ثمّ يضغط «حفظ» مباشرةً (والماسحُ بعضُه لا يرسل Enter)
     * يفقد آخرَ مسحةٍ بلا كلمة. والحارسُ هنا لأن `save` هي آخرُ باب. */
    if (scan.trim()) {
      playWarning();
      toast.toast({
        tone: "warn",
        title: t("purchase.pendingScan", "كتبت شي بصندوق المسح وما ضفته: {{code}}", { code: scan.trim() }),
        description: t("purchase.pendingScanHow", "اضغط «إضافة» لو Enter لو امسحه، وإذا ما تريده امسح الصندوق."),
      });
      return;
    }

    /* **منتجٌ جديدٌ بسعر بيعٍ صفر يُباع ببلاش.** فرعُ الإنشاء بالخادم يمرّر
     * السعرَ خامّاً بلا بوّابة `case when > 0` — فتفريغُ الخانة (وهو الصواب
     * للقائم) يصير خطراً على الجديد. والحكمُ يمرّ من `invNormName` نفسِها التي
     * يطابق بها الخادم، فما يرصّده على منتجٍ قائمٍ بالاسم لا يُحسب جديداً ولا
     * يُوقَف — إنذارٌ كاذبٌ يتعلّم المستخدمُ تجاهلَه. */
    const blockers = purchaseBlockers(validLines, products);
    if (blockers.length) {
      playWarning();
      const zero = blockers.filter((b) => b.kind === "zero_sell");
      const numeric = blockers.filter((b) => b.kind === "numeric_name");
      toast.error(
        zero.length
          ? t("purchase.newZeroSell", "مادة جديدة بسعر بيع فاضي — إذا انحفظت راح تنباع ببلاش")
          : t("purchase.newNumericName", "اسم المادة رقم مو اسم — ما راح تلگيها بالبحث بعدين"),
        t("purchase.blockerWhich", "اكتب {{what}} لـ: {{names}}", {
          what: zero.length ? t("pos.sellPrice", "سعر البيع") : t("pos.name", "الاسم"),
          names: (zero.length ? zero : numeric).slice(0, 5).map((b) => b.label).join(t("common.listSep", "، "))
            + ((zero.length ? zero : numeric).length > 5 ? "…" : ""),
        }),
      );
      return;
    }
    // سطرٌ ملصوقٌ من إكسل لا يمرّ بصندوق المسح، فالحارسُ يتكرّر هنا (G8):
    // الرقمُ الأصليّ لا يُسترجع من الصيغة العلمية، فالرفضُ قبل الحفظ لا بعده.
    const bad = validLines.find((l) => excelArtifact(l.barcode));
    if (bad) {
      playWarning();
      toast.error(t("pos.excelCode", "هذا شكل إكسل مشوّه — الرقم الأصلي ضاع"),
        t("purchase.excelCodeLine", "بسطر «{{name}}» الرمز {{code}} — رجّع عمود الباركود إلى «نص» بإكسل وأعد اللصق.",
          { name: bad.name.trim() || bad.barcode, code: bad.barcode }));
      return;
    }
    // وأحرفٌ عربية بالرمز تُقال ولا تمنع (G7) — قد تكون مقصودةً بالنادر.
    const mang = validLines.find((l) => looksLayoutMangled(l.barcode));
    if (mang) {
      playWarning();
      toast.toast({
        tone: "warn",
        title: t("pos.arabicCode", "الباركود فيه أحرف عربية — الغالب الكيبورد كان عربياً وقت المسح. بدّل اللغة وأعد المسح."),
        description: t("pos.arabicCodeReads", "بالعكس يقرأ: {{fix}}", { fix: looksLayoutMangled(mang.barcode) }),
      });
    }
    setBusy(true);
    let createdCompany: Company | null = null;
    try {
      const co = editing
        ? { id: editing.purchase.company_id, created: null, name: editing.purchase.company_name ?? "" }
        : await resolveCompanyId();
      createdCompany = co.created;
      const draft: PurchaseDraftLine[] = validLines.map((l) => ({
        product_id: l.product_id,
        // مطبَّعاً كما يحفظ createProduct (G12): المطابقةُ الخادمية تطبّع
        // أصلاً، وهذا يصلح **المخزون** الجديد — القديمُ لا يُلمس.
        barcode: normalizeCode(l.barcode) || null,
        name: l.name.trim() || l.barcode.trim(),
        section_id: l.section_id || null,
        category: (l.category || null) as ProductCategory | null,
        qty: Number(l.qty) || 0,
        purchase_price: Number(l.purchase_price) || 0,
        // الفارغُ صفرٌ، والصفرُ عقدٌ مع الخادم: «لا تلمس سعرَ البيع».
        sell_price: sellPriceToSend(l.sell_price),
        min_stock: l.min_stock.trim() === "" ? null : Math.max(0, Math.round(Number(l.min_stock) || 0)),
        expiry_date: l.expiry.trim() || null,
      }));
      const meta: PurchaseMeta = {
        company_id: co.id,
        company_name: co.name || null,
        reference: reference.trim() || null,
        /* الجديدةُ ترسل رقماً **دائماً** (الاختيارُ صريح)، والتعديلُ يبقى على
         * عقده: `undefined` تعني «أبقِ المدفوع كما هو». */
        amount_paid: editing ? (amountPaid.trim() === "" ? undefined : paidNum) : (paidMode === "debt" ? paidNum : total),
        payment_method: payMethod,
        supplier_name: supplierName.trim() || null,
        supplier_phone: supplierPhone.trim() || null,
        notes: notes.trim() || null,
        purchased_at: purchasedAt ? new Date(purchasedAt).toISOString() : undefined,
        staff_id: user?.id ?? null,
      };
      const done = editing
        ? await repo.updatePurchase(editing.purchase.id, draft, meta)
        : await repo.recordPurchase(draft, meta);
      playSuccess();
      setSaved(done);
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

  if (saved) {
    return (
      <Modal open={open} onClose={onSaved} dismissible={false} size="wide"
        title={`${t("purchase.new", "فاتورة شراء")} · ${purchaseNo(saved.id)}`}>
        <PurchaseReceipt purchaseId={saved.id} companyId={saved.company_id ?? null} companyName={saved.company_name} companies={companies}
          mode="fresh" onClose={onSaved} onPrint={() => void printSaved(saved)} />
      </Modal>
    );
  }

  return (
    <Modal open={open} onClose={onClose} size="full" confirmClose={confirmClose}
      title={editing ? `${t("purchase.editTitle", "تعديل فاتورة شراء")} · ${purchaseNo(editing.purchase.id)}` : t("purchase.new", "فاتورة شراء")}>
      <div className="space-y-4">
        {/* Supplier + reference + date */}
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="sm:col-span-1">
            <label className="label flex items-center gap-1"><Building2 size={12} /> {t("pos.company", "الشركة")}</label>
            {editing ? (
              /* الفاتورة تبقى بشركتها — تغيير الشركة يعني فاتورة أخرى لا تعديلاً */
              <input className="input" value={company || t("purchase.noCompany", "بدون شركة")} readOnly disabled />
            ) : (
            <Combobox
              value={company}
              onChange={setCompany}
              options={companies.map((c) => c.name)}
              placeholder={t("pos.companyPh", "اختر شركة أو أنشئ واحدة…")}
              icon={<Building2 size={16} />}
              createLabel={(v) => t("pos.companyCreate", { value: v, defaultValue: `إنشاء شركة “${v}”` })}
            />
            )}
          </div>
          <div>
            <label className="label">{t("purchase.reference", "رقم فاتورة المورّد")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
            <input className="input font-mono" dir="ltr" value={reference} onChange={(e) => setReference(e.target.value)} placeholder="—" />
          </div>
          <div>
            <label className="label">{t("purchase.date", "تاريخ الاستلام")}</label>
            <input type="date" className="input" value={purchasedAt} onChange={(e) => setPurchasedAt(e.target.value)} />
          </div>
          <div>
            <label className="label flex items-center gap-1"><UserRound size={12} /> {t("purchase.supplierName", "اسم المورّد / المندوب")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
            <input className="input" value={supplierName} onChange={(e) => setSupplierName(e.target.value)} placeholder={t("purchase.supplierNamePh", "مثال: أبو علي — مندوب الشركة")} />
          </div>
          <div>
            <label className="label flex items-center gap-1"><Phone size={12} /> {t("purchase.supplierPhone", "هاتف المورّد")} <span className="font-normal text-ink-subtle">{t("pos.companyHint", "(اختياري)")}</span></label>
            <input className="input font-mono" dir="ltr" inputMode="tel" value={supplierPhone} onChange={(e) => setSupplierPhone(e.target.value)} placeholder="07xxxxxxxxx" />
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
                /* Enter يُضيف دائماً (إنساناً كان أو ماسحاً). وTab **للماسح
                 * وحده**: نغذّي المجمِّعَ نفسَه الذي تستعمله شاشة البيع بأزمان
                 * الضغطات، فإن قال «هذي دفعةُ ماسح» أضفنا ومنعنا قفزَ التركيز.
                 * وبلا هذا كانت العيادةُ ذاتُ ماسح Tab تبيع بالكاشير ولا تقدر
                 * تستلم بضاعة: كلُّ مسحةٍ هنا تضيع بلا سطرٍ وبلا رسالة. */
                onKeyDown={(e) => {
                  const scanned = scanAsm.current.feed(e.key, e.timeStamp);
                  if (e.key === "Enter") { e.preventDefault(); scanAdd(); return; }
                  if (e.key === "Tab" && scanned) { e.preventDefault(); scanAdd(); }
                }}
                placeholder={t("pos.scanOrTypeName", "امسح الباركود أو اكتب اسم المنتج…")}
              />
            </div>
            <Button variant="secondary" onClick={scanAdd}>{t("common.add", "إضافة")}</Button>
            {/* ولمن ما يريد يدكّ الباركودات واحداً واحداً: قائمةُ منتجاته. */}
            <Button variant="secondary" leftIcon={<ListChecks size={16} />} onClick={() => { playTap(); setPickerOpen(true); }} data-pickopen>
              {t("purchase.pickOpen", "اختر من القائمة")}
            </Button>
          </div>
          {/* منتجات موجودة تطابق المكتوب — ضغطة تسحب المنتج بمكانه وأسعاره */}
          {scanSuggestions.length > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className="text-2xs font-bold text-success-700 dark:text-success-300">{t("purchase.foundExisting", "موجود عندك:")}</span>
              {scanSuggestions.map((p) => (
                <button key={p.id} type="button" onClick={() => addProductLine(p)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-success-300 bg-surface-1 px-2.5 py-1 text-2xs font-bold text-ink transition hover:bg-success-50 dark:border-success-500/30 dark:hover:bg-success-500/10">
                  <PackageCheck size={11} className="text-success-600 dark:text-success-300" />
                  {p.name}
                  <span className="font-mono text-[10px] text-ink-subtle" dir="ltr">{p.barcode ?? ""}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {pickerOpen && (
          <PurchasePicker
            open
            products={products}
            companies={companies}
            sections={sections ?? []}
            companyName={company}
            inInvoice={inInvoice}
            onClose={() => setPickerOpen(false)}
            onPick={addPickedLines}
          />
        )}

        {/* الخروجُ يسأل — نافذةٌ حقيقيةٌ تقول العدد، لا تأكيدُ متصفّحٍ يُقبل بلا قراءة */}
        <Dialog
          open={askLeave}
          onClose={() => setAskLeave(false)}
          size="sm"
          title={t("purchase.leaveTitle", "تطلع وتضيّع السطور؟")}
          description={t("purchase.leaveBody", "بالفاتورة {{n}} سطر ما انحفظت.", { n: filledCount })}
          footer={
            <div className="flex flex-wrap justify-end gap-2">
              <Button variant="secondary" onClick={() => setAskLeave(false)}>{t("purchase.leaveStay", "لا، ارجع")}</Button>
              <Button variant="danger" onClick={() => { setAskLeave(false); onClose(); }}>{t("purchase.leaveGo", "إي، طلّعني")}</Button>
            </div>
          }
        />

        {/* Lines */}
        <div className="space-y-2">
          {lines.map((l, idx) => {
            const matched = !!l.product_id;
            const product = matched ? products.find((p) => p.id === l.product_id) : undefined;
            /* السعرُ الحاليُّ على الرفّ — تلميحةً لا قيمة. يُقرأ من المنتج المطابَق،
             * وإلا من منتجٍ يطابقه **الخادمُ بالاسم** (الفرعُ الذي لا تعرفه الشاشة). */
            const sellRef = product ?? (!l.product_id && l.name.trim()
              ? products.find((p) => invNormName(p.name) === invNormName(l.name))
              : undefined);
            const sellNow = sellRef ? Number(sellRef.sell_price ?? 0) || null : null;
            const dupTotal = dupOf.get(l.key);
            const dupBadge = dupTotal != null ? (
              <span className="chip shrink-0 bg-warn-50 text-2xs font-bold text-warn-800 dark:bg-warn-500/15 dark:text-warn-200">
                <AlertTriangle size={10} /> {t("purchase.dupLine", "نفس المادة بسطر ثاني — المجموع {{n}}", { n: formatNum(dupTotal) })}
              </span>
            ) : null;
            // FAST restock row: the product is already known and already filed —
            // show where it lives + the stock jump, and ask ONLY for the count.
            if (matched && product && !expandedKeys.has(l.key)) {
              const coName = product.company_id ? companies.find((c) => c.id === product.company_id)?.name : undefined;
              const secName = product.section_id ? (sections ?? []).find((s) => s.id === product.section_id)?.name : undefined;
              const qtyN = Number(l.qty) || 0;
              const baseStock = Math.max(0, (product.stock ?? 0) - (editing ? origQty.get(product.id) ?? 0 : 0));
              return (
                <div key={l.key} className="rounded-2xl border border-success-200 bg-success-50/40 p-3 dark:border-success-500/25 dark:bg-success-500/5">
                  {dupBadge && <div className="mb-1.5">{dupBadge}</div>}
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
                          {t("purchase.stockJump", { from: baseStock, to: baseStock + qtyN, defaultValue: "المخزون: {{from}} ← {{to}}" })}
                        </span>
                        {/* سعرُ البيع المعروضُ هو **سعرُ الرفّ** لا خانةُ السطر — الخانةُ
                          * تبقى فارغةً قصداً، وعرضُ صفرٍ مكانها كذبٌ بالاتجاه المعاكس. */}
                        <span>
                          {t("pos.buy", "شراء")} {money(Number(l.purchase_price) || 0)} · {t("pos.sell", "بيع")}{" "}
                          {money(sellPriceToSend(l.sell_price) || Number(product.sell_price) || 0)}
                          {sellPriceToSend(l.sell_price) > 0
                            ? ` ${t("purchase.sellNew", "(جديد)")}`
                            : ` ${t("purchase.sellSame", "(ما راح يتغيّر)")}`}
                        </span>
                        {product.expiry_date && <span className="flex items-center gap-1"><CalendarClock size={10} /> {t("purchase.currentExpiry", { d: product.expiry_date.slice(0, 10), defaultValue: "الانتهاء الحالي {{d}}" })}</span>}
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
                    {/* الاسم المكتوب يطابق منتجاً موجوداً؟ اعرضه — ضغطة تحوّل السطر
                        لإعادة تعبئة بدل ما ينخلق توأم أعمى بنفس الاسم. */}
                    {!matched && l.name.trim().length >= 2 && (() => {
                      const sugg = findByName(l.name).slice(0, 4);
                      if (!sugg.length) return null;
                      return (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {sugg.map((p) => (
                            <button key={p.id} type="button"
                              onClick={() => { playTap(); setLines((ls) => ls.map((x) => (x.key === l.key ? { ...lineFromProduct(p, p.barcode ?? ""), key: x.key, qty: x.qty || "1" } : x))); }}
                              className="inline-flex items-center gap-1 rounded-full border border-success-300 bg-success-50/60 px-2 py-0.5 text-[10px] font-bold text-success-800 transition hover:bg-success-100 dark:border-success-500/30 dark:bg-success-500/10 dark:text-success-200">
                              <PackageCheck size={10} /> {t("purchase.useExisting", "موجود:")} {p.name}
                            </button>
                          ))}
                        </div>
                      );
                    })()}
                  </div>
                  {!matched && companySections.length > 0 && (
                    <div className="sm:col-span-3">
                      <label className="label text-2xs">{t("purchase.sectionIn", "الصنف داخل الشركة")}</label>
                      <select className="input text-sm" data-linesection value={l.section_id}
                        onChange={(e) => patchLine(l.key, { section_id: e.target.value })}>
                        <option value="">{t("pos.uncategorized", "بدون صنف")}</option>
                        {companySections.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                      </select>
                    </div>
                  )}
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
                    {/* التلميحةُ تحمل السعرَ الحاليّ، والقيمةُ تبقى فارغةً حتى يكتب. */}
                    <input type="number" inputMode="numeric" min="0" step="1" className="input text-sm"
                      value={l.sell_price} onChange={(e) => patchLine(l.key, { sell_price: e.target.value })}
                      placeholder={sellNow != null
                        ? t("purchase.sellKeep", "{{v}} — اتركها فارغة", { v: formatNum(sellNow) })
                        : "0"} />
                    {sellNow != null && sellPriceToSend(l.sell_price) > 0 && sellPriceToSend(l.sell_price) !== sellNow && (
                      <div className="mt-1 text-2xs font-bold text-warn-700 dark:text-warn-300">
                        {t("purchase.sellWillChange", "راح يتغيّر سعر البيع: {{from}} ← {{to}}",
                          { from: formatNum(sellNow), to: formatNum(sellPriceToSend(l.sell_price)) })}
                      </div>
                    )}
                    {sellNow != null && sellPriceToSend(l.sell_price) <= 0 && (
                      <div className="mt-1 text-2xs text-ink-subtle">
                        {t("purchase.sellUnchanged", "سعر البيع ما راح يتغيّر")}
                      </div>
                    )}
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("pos.minStock", "تنبيه المخزون")}</label>
                    <input type="number" inputMode="numeric" min="0" step="1" className="input text-sm" value={l.min_stock} onChange={(e) => patchLine(l.key, { min_stock: e.target.value })} placeholder="0" />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="label text-2xs">{t("purchase.batchExpiry", "انتهاء الوجبة الجديدة")} <span className="font-normal text-ink-subtle">{t("purchase.batchExpiryHint", "(اختياري — فارغ يبقي القديم)")}</span></label>
                    <input type="date" className="input text-sm" value={l.expiry} onChange={(e) => patchLine(l.key, { expiry: e.target.value })} />
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
            {/* **الفراغُ كان يعني «مدفوعةٌ كاملة» بصمت** — وخطؤه باتّجاهٍ واحد
              * دائماً: دَينُ العيادة يُبخَس، ودفترُ المورّد يقول «ما عليها شي».
              * فصار سؤالاً صريحاً بدل افتراض. ووضعُ التعديل يبقى كما هو:
              * الفاتورةُ لها مدفوعٌ مسجَّلٌ فعلاً، والفراغُ يعني «لا تغيّره». */}
            <label className="label flex items-center gap-1"><Wallet size={12} /> {t("purchase.amountPaid", "المدفوع للمورّد")}
              {editing && <span className="font-normal text-ink-subtle">{t("purchase.paidHintEdit", "(فارغ = يبقى المدفوع كما هو)")}</span>}
            </label>
            {editing ? (
              <input type="number" inputMode="numeric" min="0" step="1" className="input" value={amountPaid} onChange={(e) => setAmountPaid(e.target.value)} placeholder={money(editing.purchase.amount_paid ?? total)} />
            ) : (
              <>
                <div className="flex gap-1.5">
                  <button type="button" onClick={() => { playTap(); setPaidMode("full"); setAmountPaid(""); }}
                    className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold transition", paidMode === "full" ? "bg-success-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                    {t("purchase.paidFull", "دفعناها كلّها")}
                  </button>
                  <button type="button" onClick={() => { playTap(); setPaidMode("debt"); }}
                    className={cn("flex-1 rounded-xl px-2 py-2 text-xs font-bold transition", paidMode === "debt" ? "bg-warn-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                    {t("purchase.paidDebt", "عليها دَين")}
                  </button>
                </div>
                {paidMode === "debt" && (
                  <>
                    <input type="number" inputMode="numeric" min="0" step="1" className="input mt-1.5" value={amountPaid}
                      onChange={(e) => setAmountPaid(e.target.value)} placeholder={t("purchase.paidHowMuch", "شكَد دفعنا هسّه؟")} />
                    <div className="mt-1 text-2xs font-bold text-warn-700 dark:text-warn-300">
                      {t("purchase.paidRemains", "الباقي على العيادة: {{v}}", { v: money(Math.max(0, total - paidNum)) })}
                    </div>
                  </>
                )}
                {paidMode === "full" && total > 0 && (
                  <div className="mt-1 text-2xs text-ink-subtle">{t("purchase.paidNone", "ما راح ينسجّل دَين لهذي الفاتورة")}</div>
                )}
              </>
            )}
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
            {editing ? t("purchase.saveEdit", "حفظ التعديلات") : t("purchase.save", "حفظ وتنزيل على المخزون")}
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
