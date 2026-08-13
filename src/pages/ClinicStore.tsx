// ============================================================================
// «المتجر الإلكتروني» — مركز قيادة ستور العيادة العام.
//
// ثلاث شاشات بسكشن واحد:
//   • الطلبات   — صندوق وارد حي: الطلب الجديد يوصل بجرس وعداد، والدكتور يقبل
//                 (يولّد فاتورة عبر محرك البيع الموجود → المخزون ينسحب هنا
//                 حصراً، ويدخل الطلب خط التوصيل) أو يرفض برسالة واتساب مهذبة.
//   • التشكيلة  — أي منتجات تظهر بالمتجر: مفتاح عرض/إخفاء لكل منتج + وصف
//                 تسويقي + تعديل سعر مباشر (نفس sell_price مال الكاشير).
//   • الإعدادات — تفعيل المتجر، الرابط المميز (slug)، النبذة، أجرة التوصيل،
//                 الحد الأدنى، ولوحة مشاركة الرابط (نسخ/فتح/واتساب/بايو).
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { sendWhatsApp, quotaMessage } from "@/lib/quotas";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingBag, Inbox, Boxes, Settings2, Check, X, Phone, MessageCircle, MapPin,
  Copy, ExternalLink, Sparkles, Link2, AlertTriangle, CheckCircle2, Clock,
  Search, Eye, EyeOff, Pencil, TrendingUp, Truck, PackageX, RefreshCw, StickyNote,
} from "lucide-react";
import type { CheckoutItem, Product, SaleMeta, StoreOrder, StoreProfile } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { matchStaffToUser } from "@/lib/staffNames";
import { bumpStoreOrders, useStoreOrderCount } from "@/lib/storeOrdersLive";
import { requestNotifyPermission } from "@/lib/bookingRequests";
import { normalizeSlug, isValidSlug, storeUrl, categoryLook } from "@/lib/storeLib";
import { branchStore } from "@/lib/branchStore";
import { waNumber } from "@/lib/phone";
import { getDialCode } from "@/lib/settings";
import { withTimeout } from "@/lib/errors";
import { playTap, playSuccess, playWarning, playAchievement } from "@/lib/sounds";
import { Button, Badge, Skeleton, useToast } from "@/components/ui";
import { cn, money, formatNum, formatDate } from "@/lib/utils";

type Tab = "orders" | "catalog" | "settings";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** رسالة خطأ إنسانية مختصرة من أي استثناء. */
const errMsg = (e: unknown) => (e instanceof Error && e.message ? e.message : "خطأ غير متوقع — جرب من جديد");

/** «قبل 5 دقائق» — عمر الطلب بصيغة إنسانية مختصرة. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return "الآن";
  if (mins < 60) return `قبل ${formatNum(mins)} دقيقة`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `قبل ${formatNum(hrs)} ساعة`;
  return `قبل ${formatNum(Math.floor(hrs / 24))} يوم`;
}

export function ClinicStore() {
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const [tab, setTab] = useState<Tab>("orders");

  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [profile, setProfile] = useState<StoreProfile | null | undefined>(undefined); // undefined = يتحمّل
  const newCount = useStoreOrderCount();

  const load = async () => {
    try {
      const [o, p, pr] = await Promise.all([
        repo.listStoreOrders(300),
        repo.listProducts(clinicId),
        repo.getStoreProfile(),
      ]);
      setOrders(o); setProducts(p); setProfile(pr);
    } catch {
      setOrders((x) => x ?? []); setProducts((x) => x ?? []); setProfile((x) => (x === undefined ? null : x));
    }
  };
  useEffect(() => {
    void load();
    requestNotifyPermission(); // حتى إشعار «طلب جديد» يشتغل بالمتصفح
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // العداد الحي ارتفع (طلب وصل ونحن بالصفحة) → حدّث القائمة فوراً.
  useEffect(() => { if (orders !== null) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [newCount]);

  const TABS: { id: Tab; label: string; icon: typeof Inbox; badge?: number }[] = [
    { id: "orders", label: "الطلبات", icon: Inbox, badge: newCount },
    { id: "catalog", label: "تشكيلة المتجر", icon: Boxes },
    { id: "settings", label: "الإعدادات والرابط", icon: Settings2 },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <div className="mb-5 flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-brand-grad text-white shadow-soft"><ShoppingBag size={24} /></span>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-extrabold text-ink">المتجر الإلكتروني</h1>
          <p className="text-sm text-ink-subtle">ستور عام لعيادتك — الزبون يطلب برابطك، وأنت تقبل وتوصّل.</p>
        </div>
        {profile?.enabled && profile.slug && (
          <a href={storeUrl(profile.slug)} target="_blank" rel="noreferrer"
            className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-success-300 bg-success-50 px-3.5 py-2 text-xs font-extrabold text-success-700 transition hover:bg-success-100 dark:border-success-500/40 dark:bg-success-500/15 dark:text-success-200">
            <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success-400 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-success-500" /></span>
            متجرك شغّال <ExternalLink size={13} />
          </a>
        )}
      </div>

      <div className="mb-4 flex gap-1 rounded-2xl border border-line bg-surface-1 p-1">
        {TABS.map(({ id, label, icon: Icon, badge }) => (
          <button key={id} onClick={() => { playTap(); setTab(id); }}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              tab === id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
            <Icon size={16} /> {label}
            {!!badge && badge > 0 && (
              <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-2xs font-bold",
                tab === id ? "bg-white text-brand-700" : "bg-danger-500 text-white animate-pulse")}>{badge}</span>
            )}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {tab === "orders"
            ? <OrdersTab orders={orders} products={products} profile={profile ?? null} clinicId={clinicId} reload={load} goSettings={() => setTab("settings")} />
            : tab === "catalog"
              ? <CatalogTab products={products} reload={load} storeOn={!!profile?.enabled} />
              : <SettingsTab profile={profile} products={products} onSaved={(p) => { setProfile(p); }} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ============================== الطلبات ============================== */

function OrdersTab({ orders, products, profile, clinicId, reload, goSettings }: {
  orders: StoreOrder[] | null; products: Product[] | null; profile: StoreProfile | null;
  clinicId?: string; reload: () => Promise<void>; goSettings: () => void;
}) {
  const { user } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<StoreOrder | null>(null);

  const prodById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const fresh = (orders ?? []).filter((o) => o.status === "new");
  const decided = (orders ?? []).filter((o) => o.status !== "new");
  const today = new Date().toDateString();
  const acceptedToday = decided.filter((o) => o.status === "accepted" && o.decided_at && new Date(o.decided_at).toDateString() === today).length;
  const storeRevenue = decided.filter((o) => o.status === "accepted").reduce((s, o) => s + o.total, 0);
  const decideRate = decided.length ? Math.round((decided.filter((o) => o.status === "accepted").length / decided.length) * 100) : null;

  /** القبول = لحظة الحقيقة: فاتورة عبر محرك البيع الموجود (المخزون ينسحب هنا
   *  حصراً — بنفس منطق الوحدات الجزئية والمخزون المجمّع) ثم طلب توصيل بخط
   *  التوصيل المجرب، ثم يُختم طلب المتجر «مقبول» بمرجع الفاتورة. */
  const accept = async (o: StoreOrder) => {
    if (busy) return;
    setBusy(o.id);
    try {
      const items: CheckoutItem[] = o.items.map((it) => {
        const p = prodById.get(it.product_id);
        return {
          // منتج انحذف بعد الطلب → بند خدمة بلا سحب مخزون بدل فشل FK.
          product_id: p ? it.product_id : null,
          name: it.name, barcode: p?.barcode ?? null,
          qty: it.qty, unit_price: it.price, unit_cost: p?.purchase_price ?? 0,
          stock_qty: p ? it.qty : 0, unit_label: null,
        };
      });
      // أجرة التوصيل إيراد للعيادة (الدكتور يوصّل بنفسه) → بند خدمة حقيقي
      // على الفاتورة حتى تدخل التقارير بلا أي حالة خاصة.
      if (o.delivery_fee > 0) {
        items.push({ product_id: null, name: "أجرة توصيل", barcode: null, qty: 1, unit_price: o.delivery_fee, unit_cost: 0, stock_qty: 0, unit_label: null });
      }
      const staffM = await matchStaffToUser(user?.id, user?.email).catch(() => null);
      const meta: SaleMeta = {
        customer_name: o.customer_name, customer_phone: o.customer_phone, pet_name: null,
        final_total: o.total, payment_method: null, payment_details: null,
        amount_paid: 0, // COD — الفلوس تدخل عند التسليم عبر شاشة التوصيل
        staff_id: staffM?.id ?? null,
        notes: `طلب متجر ${o.order_no}${o.note ? ` — ${o.note}` : ""}`,
      };
      const invoice = await withTimeout(repo.retailCheckout(items, meta), 12000);
      try {
        await repo.createDeliveryOrder({
          clinic_id: clinicId ?? null,
          invoice_id: invoice.id,
          branch_id: branchStore.branchForWrite(),
          courier_id: null,
          customer_name: o.customer_name,
          customer_phone: o.customer_phone,
          address: o.address ?? null,
          note: o.note ?? null,
          delivery_fee: o.delivery_fee,
          fee_to_clinic: o.delivery_fee > 0,
          cod_amount: round2(Math.max(0, invoice.total - (invoice.amount_paid ?? 0))),
          prepaid: invoice.amount_paid ?? 0,
          status: "preparing",
          dispatched_at: null, delivered_at: null, returned_at: null,
        });
      } catch {
        playWarning();
        toast.error("الفاتورة انولدت لكن طلب التوصيل ما انسجل", "سجّله يدوياً من المبيعات ← التوصيل. الطلب نفسه مقبول وصحيح.");
      }
      await repo.updateStoreOrder(o.id, { status: "accepted", invoice_id: invoice.id, decided_at: new Date().toISOString() });
      playAchievement();
      toast.success(`قبلت الطلب ${o.order_no} ✅`, "انولدت فاتورته وانسحب المخزون، وتلكاه جاهز بشاشة التوصيل.");
      bumpStoreOrders();
      await reload();
    } catch (e) {
      playWarning();
      toast.error("تعذّر قبول الطلب", errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const reject = async (o: StoreOrder) => {
    if (busy) return;
    setBusy(o.id);
    try {
      await repo.updateStoreOrder(o.id, { status: "rejected", decided_at: new Date().toISOString() });
      playTap();
      toast.success(`رفضت الطلب ${o.order_no}`, "ما انسحب أي مخزون. تكدر تخبر الزبون بزر واتساب.");
      setConfirmReject(null);
      bumpStoreOrders();
      await reload();
    } catch (e) {
      playWarning();
      toast.error("تعذّر رفض الطلب", errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  // الإرسال يمرّ بنقطة الاختناق: تفحص حصة الرسائل وتسجّلها. الرابط المباشر
  // كان يتخطّى الاثنين، فالعدّاد ما يشوف رسائل المتجر أصلاً.
  const waSend = (o: StoreOrder, msg: string) => {
    playTap();
    void sendWhatsApp({ phone: waNumber(o.customer_phone, getDialCode()), text: msg, ownerName: o.customer_name ?? null, ownerPhone: o.customer_phone ?? null, kind: "store" })
      .catch((e) => { const m = quotaMessage(e); if (m) toast.error(m); });
  };

  if (orders === null) {
    return <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-2xl" />)}</div>;
  }

  return (
    <div className="space-y-5">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi icon={Inbox} tone="danger" label="طلبات بانتظارك" value={String(fresh.length)} pulse={fresh.length > 0} />
        <Kpi icon={CheckCircle2} tone="success" label="مقبولة اليوم" value={String(acceptedToday)} />
        <Kpi icon={TrendingUp} tone="brand" label="مبيعات المتجر (المقبولة)" value={money(storeRevenue)} />
        <Kpi icon={Sparkles} tone="accent" label="نسبة القبول" value={decideRate === null ? "—" : `${formatNum(decideRate)}٪`} />
      </div>

      {/* متجر مو مفعّل بعد */}
      {!profile?.enabled && (
        <button onClick={() => { playTap(); goSettings(); }} className="card flex w-full items-center gap-3 border-warn-300 bg-warn-50/60 p-4 text-start transition hover:bg-warn-50 dark:border-warn-500/40 dark:bg-warn-500/10">
          <AlertTriangle size={20} className="shrink-0 text-warn-600" />
          <span className="text-sm font-semibold text-warn-700 dark:text-warn-200">متجرك بعده مو مفعّل — افتح «الإعدادات والرابط»، اختر رابطك المميز وفعّله حتى توصلك الطلبات.</span>
        </button>
      )}

      {/* الطلبات الجديدة */}
      <section>
        <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-ink">
          <Inbox size={18} className="text-brand-600" /> طلبات جديدة
          {fresh.length > 0 && <Badge tone="danger">{fresh.length}</Badge>}
        </h2>
        {fresh.length === 0 ? (
          <div className="card grid place-items-center gap-1 p-10 text-center">
            <PackageX size={28} className="opacity-30" />
            <p className="text-sm font-semibold text-ink-muted">ما اكو طلبات جديدة حالياً</p>
            <p className="text-xs text-ink-subtle">لما يطلب زبون من متجرك يوصلك الطلب هنا فوراً — مع جرس وإشعار.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {fresh.map((o) => (
              <motion.div key={o.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                className="card relative overflow-hidden border-brand-300 p-4 shadow-raised dark:border-brand-500/40">
                <span className="absolute inset-x-0 top-0 h-1 bg-brand-grad" />
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs font-bold text-brand-600">{o.order_no}</span>
                      <span className="flex items-center gap-1 text-2xs text-ink-subtle"><Clock size={11} /> {ago(o.created_at)}</span>
                    </div>
                    <p className="mt-1 text-base font-extrabold text-ink">{o.customer_name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-muted">
                      <span className="flex items-center gap-1" dir="ltr">{o.customer_phone}</span>
                      {o.address && <span className="flex items-center gap-1"><MapPin size={12} /> {o.address}</span>}
                    </div>
                    {o.note && <p className="mt-1.5 flex items-start gap-1 text-xs text-ink-muted"><StickyNote size={12} className="mt-0.5 shrink-0" /> {o.note}</p>}
                  </div>
                  <div className="text-end">
                    <p className="font-display text-xl font-extrabold text-ink tabular-nums">{money(o.total)}</p>
                    {o.delivery_fee > 0 && <p className="text-2xs text-ink-subtle">منها توصيل {money(o.delivery_fee)}</p>}
                  </div>
                </div>

                {/* البنود + فحص التوفر الحي مقابل مخزون اليوم */}
                <div className="mt-3 overflow-hidden rounded-xl border border-line">
                  {o.items.map((it, i) => {
                    const p = prodById.get(it.product_id);
                    const short = p ? p.stock < it.qty && !p.pooled : !p;
                    return (
                      <div key={i} className={cn("flex items-center gap-2 px-3 py-2 text-sm", i > 0 && "border-t border-line")}>
                        <span className="text-base">{categoryLook(p?.category).emoji}</span>
                        <span className="min-w-0 flex-1 truncate font-semibold text-ink">{it.name}</span>
                        {short && (
                          <span className="flex shrink-0 items-center gap-1 rounded-full bg-warn-50 px-2 py-0.5 text-2xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">
                            <AlertTriangle size={10} /> {p ? `المتوفر ${formatNum(p.stock)} فقط` : "المنتج انحذف"}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-ink-muted">×{formatNum(it.qty)}</span>
                        <span className="w-24 shrink-0 text-end text-xs font-bold tabular-nums text-ink">{money(it.total)}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={() => void accept(o)} loading={busy === o.id} leftIcon={<Check size={15} />}>
                    قبول — فوترة وسحب مخزون
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { playTap(); setConfirmReject(o); }} disabled={busy === o.id} leftIcon={<X size={15} />}>
                    رفض
                  </Button>
                  <button type="button" onClick={() => waSend(o, `مرحباً ${o.customer_name} 🌟 وصلنا طلبك ${o.order_no} من متجرنا وراح نأكده ونجهزه هسة. المجموع ${money(o.total)} — الدفع عند الاستلام.`)}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-success-700 transition hover:bg-success-50 dark:text-success-300 dark:hover:bg-success-500/10">
                    <MessageCircle size={14} /> واتساب
                  </button>
                  <a href={`tel:${o.customer_phone}`} className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-2 text-xs font-bold text-ink-muted transition hover:bg-surface-2">
                    <Phone size={14} /> اتصال
                  </a>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </section>

      {/* السجل */}
      {decided.length > 0 && (
        <section>
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-ink"><RefreshCw size={16} className="text-ink-subtle" /> سجل الطلبات</h2>
          <div className="space-y-2">
            {decided.slice(0, 30).map((o) => (
              <div key={o.id} className="card flex items-center gap-3 p-3">
                <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                  o.status === "accepted" ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" : "bg-danger-50 text-danger-500 dark:bg-danger-500/15 dark:text-danger-300")}>
                  {o.status === "accepted" ? <Truck size={17} /> : <X size={17} />}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                    {o.customer_name}
                    <span className="font-mono text-2xs font-normal text-ink-subtle">{o.order_no}</span>
                    <Badge tone={o.status === "accepted" ? "success" : "danger"}>{o.status === "accepted" ? "مقبول" : "مرفوض"}</Badge>
                  </p>
                  <p className="text-2xs text-ink-subtle">{formatDate(o.created_at, "ar")} · {formatNum(o.items.length)} بند</p>
                </div>
                {o.status === "rejected" && (
                  <button type="button" onClick={() => waSend(o, `مرحباً ${o.customer_name} 🙏 نعتذر — ما كدرنا نلبي طلبك ${o.order_no} حالياً. تشرفنا بأي طلب ثاني.`)}
                    title="اعتذار واتساب"
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-success-600 transition hover:bg-success-50 dark:hover:bg-success-500/10">
                    <MessageCircle size={15} />
                  </button>
                )}
                <p className="w-24 shrink-0 text-end font-display text-sm font-bold tabular-nums text-ink">{money(o.total)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* تأكيد الرفض */}
      <AnimatePresence>
        {confirmReject && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setConfirmReject(null)}>
            <motion.div initial={{ scale: 0.94, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, y: 10 }}
              className="card w-full max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
              <h3 className="font-display text-lg font-bold text-ink">رفض الطلب {confirmReject.order_no}؟</h3>
              <p className="mt-1 text-sm text-ink-muted">ما راح ينسحب أي مخزون ولا تنولد فاتورة. بعد الرفض يظهر زر اعتذار واتساب بالسجل.</p>
              <div className="mt-4 flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmReject(null)}>تراجع</Button>
                <Button variant="danger" size="sm" loading={busy === confirmReject.id} onClick={() => void reject(confirmReject)}>رفض الطلب</Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================== التشكيلة ============================== */

function CatalogTab({ products, reload, storeOn }: { products: Product[] | null; reload: () => Promise<void>; storeOn: boolean }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [descId, setDescId] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [priceId, setPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");

  const list = useMemo(() => {
    const ql = q.trim().toLowerCase();
    const base = (products ?? []).filter((p) => !ql || p.name.toLowerCase().includes(ql) || (p.subcategory ?? "").toLowerCase().includes(ql));
    // المعروضة أولاً حتى يشوف الدكتور تشكيلته بلمحة.
    return [...base.filter((p) => p.store_visible), ...base.filter((p) => !p.store_visible)];
  }, [products, q]);
  const shownCount = (products ?? []).filter((p) => p.store_visible).length;

  const toggle = async (p: Product) => {
    if (busyId) return;
    setBusyId(p.id);
    try {
      await repo.updateProduct(p.id, { store_visible: !p.store_visible });
      p.store_visible ? playTap() : playSuccess();
      await reload();
    } catch (e) { playWarning(); toast.error("تعذّر التحديث", errMsg(e)); }
    finally { setBusyId(null); }
  };

  const saveDesc = async (p: Product) => {
    setDescId(null);
    const val = descDraft.trim() || null;
    if (val === (p.store_desc ?? null)) return;
    try { await repo.updateProduct(p.id, { store_desc: val }); playSuccess(); await reload(); }
    catch (e) { playWarning(); toast.error("تعذّر حفظ الوصف", errMsg(e)); }
  };

  const savePrice = async (p: Product) => {
    setPriceId(null);
    const v = Number(priceDraft);
    if (!Number.isFinite(v) || v < 0 || v === p.sell_price) return;
    try { await repo.updateProduct(p.id, { sell_price: Math.round(v * 100) / 100 }); playSuccess(); await reload(); }
    catch (e) { playWarning(); toast.error("تعذّر تعديل السعر", errMsg(e)); }
  };

  if (products === null) {
    return <div className="space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search size={16} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
          <input className="input ltr:pl-9 rtl:pr-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="ابحث بالمنتجات…" />
        </div>
        <span className={cn("rounded-full px-3 py-1.5 text-xs font-bold",
          shownCount > 0 ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-200" : "bg-warn-50 text-warn-700 dark:bg-warn-500/15 dark:text-warn-200")}>
          {formatNum(shownCount)} منتج معروض بالمتجر
        </span>
      </div>

      {storeOn && shownCount === 0 && (
        <div className="card flex items-center gap-3 border-warn-300 bg-warn-50/60 p-4 dark:border-warn-500/40 dark:bg-warn-500/10">
          <AlertTriangle size={18} className="shrink-0 text-warn-600" />
          <p className="text-sm font-semibold text-warn-700 dark:text-warn-200">متجرك مفعّل بس فارغ — فعّل «عرض» على المنتجات الي تريد الزبائن يشوفوها.</p>
        </div>
      )}

      {list.length === 0 ? (
        <div className="card grid place-items-center p-10 text-sm text-ink-subtle">ما اكو منتجات مطابقة.</div>
      ) : (
        <div className="space-y-2">
          {list.map((p) => {
            const look = categoryLook(p.category);
            const out = p.stock <= 0 && !p.pooled;
            return (
              <div key={p.id} className={cn("card flex flex-wrap items-center gap-3 p-3 transition", p.store_visible && "border-brand-300 dark:border-brand-500/40")}>
                <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-xl", look.grad)}>{look.emoji}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-ink-subtle">
                    <span>{look.label}{p.subcategory ? ` · ${p.subcategory}` : ""}</span>
                    <span className={cn(out && "font-bold text-danger-500")}>{out ? "نافد" : `المخزون: ${formatNum(p.stock)}`}</span>
                  </div>
                  {/* الوصف التسويقي */}
                  {descId === p.id ? (
                    <input autoFocus value={descDraft} maxLength={120} onChange={(e) => setDescDraft(e.target.value)}
                      onBlur={() => void saveDesc(p)} onKeyDown={(e) => { if (e.key === "Enter") void saveDesc(p); if (e.key === "Escape") setDescId(null); }}
                      placeholder="وصف قصير يشوفه الزبون (اختياري)…" className="input mt-1.5 h-8 text-xs" />
                  ) : (
                    <button onClick={() => { playTap(); setDescId(p.id); setDescDraft(p.store_desc ?? ""); }}
                      className="mt-1 flex items-center gap-1 text-2xs text-ink-subtle transition hover:text-brand-600">
                      <Pencil size={10} /> {p.store_desc || "أضف وصفاً يشوفه الزبون…"}
                    </button>
                  )}
                </div>
                {/* السعر — نفس سعر الكاشير، تعديل مباشر */}
                {priceId === p.id ? (
                  <input autoFocus type="number" inputMode="decimal" value={priceDraft} onChange={(e) => setPriceDraft(e.target.value)}
                    onBlur={() => void savePrice(p)} onKeyDown={(e) => { if (e.key === "Enter") void savePrice(p); if (e.key === "Escape") setPriceId(null); }}
                    className="input h-9 w-28 text-end text-sm font-bold" />
                ) : (
                  <button onClick={() => { playTap(); setPriceId(p.id); setPriceDraft(String(p.sell_price)); }}
                    title="اضغط لتعديل السعر" className="group flex items-center gap-1 rounded-lg px-2 py-1 transition hover:bg-surface-2">
                    <span className="font-display text-sm font-extrabold tabular-nums text-ink">{money(p.sell_price)}</span>
                    <Pencil size={11} className="text-ink-subtle opacity-0 transition group-hover:opacity-100" />
                  </button>
                )}
                {/* مفتاح العرض */}
                <button onClick={() => void toggle(p)} disabled={busyId === p.id}
                  className={cn("flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-extrabold transition active:scale-95",
                    p.store_visible
                      ? "bg-brand-600 text-white shadow-soft"
                      : "border border-line text-ink-muted hover:bg-surface-2")}>
                  {p.store_visible ? <><Eye size={14} /> معروض</> : <><EyeOff size={14} /> مخفي</>}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ============================== الإعدادات ============================== */

function SettingsTab({ profile, products, onSaved }: {
  profile: StoreProfile | null | undefined; products: Product[] | null;
  onSaved: (p: StoreProfile) => void;
}) {
  const toast = useToast();
  const [slug, setSlug] = useState(profile?.slug ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [fee, setFee] = useState(profile?.delivery_fee ? String(profile.delivery_fee) : "");
  const [minOrder, setMinOrder] = useState(profile?.min_order ? String(profile.min_order) : "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? "");
  const [enabled, setEnabled] = useState(profile?.enabled ?? false);
  const [saving, setSaving] = useState(false);
  const [slugState, setSlugState] = useState<"idle" | "checking" | "ok" | "taken" | "invalid">("idle");
  const [copied, setCopied] = useState(false);
  const checkTimer = useRef<number | null>(null);

  // صفحة انفتحت والملف لسه يتحمّل ثم وصل → زرع القيم مرة واحدة.
  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || profile === undefined || profile === null) return;
    seeded.current = true;
    setSlug(profile.slug); setBio(profile.bio ?? ""); setEnabled(profile.enabled);
    setFee(profile.delivery_fee ? String(profile.delivery_fee) : "");
    setMinOrder(profile.min_order ? String(profile.min_order) : "");
    setWhatsapp(profile.whatsapp ?? "");
  }, [profile]);

  const onSlugInput = (raw: string) => {
    const s = normalizeSlug(raw);
    setSlug(s);
    setCopied(false);
    if (checkTimer.current) window.clearTimeout(checkTimer.current);
    if (!s || !isValidSlug(s)) { setSlugState(s ? "invalid" : "idle"); return; }
    if (profile && s === profile.slug) { setSlugState("ok"); return; }
    setSlugState("checking");
    checkTimer.current = window.setTimeout(async () => {
      try { setSlugState((await repo.checkStoreSlug(s)) ? "ok" : "taken"); }
      catch { setSlugState("idle"); /* الفحص فشل — الحفظ نفسه راح يحسم */ }
    }, 450);
  };

  const suggest = () => {
    playTap();
    const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 4);
    onSlugInput(`vet-${rand}`);
  };

  const save = async (nextEnabled?: boolean) => {
    const s = normalizeSlug(slug);
    if (!isValidSlug(s)) { playWarning(); toast.error("الرابط غير صالح", "3–30: حروف إنكليزية صغيرة وأرقام وشرطات، مثل happy-paws"); return; }
    setSaving(true);
    try {
      const saved = await repo.saveStoreProfile({
        slug: s,
        enabled: nextEnabled ?? enabled,
        bio: bio.trim() || null,
        delivery_fee: Math.max(0, Number(fee) || 0),
        min_order: Math.max(0, Number(minOrder) || 0),
        whatsapp: whatsapp.trim() || null,
      });
      setEnabled(saved.enabled);
      onSaved(saved);
      playSuccess();
      toast.success(saved.enabled ? "متجرك شغّال 🎉" : "انحفظت الإعدادات", saved.enabled ? "انسخ الرابط وحطه ببايو صفحاتك." : undefined);
    } catch (e) {
      playWarning();
      const msg = e instanceof Error ? e.message : "";
      toast.error("تعذّر الحفظ", msg === "slug_taken" ? "هذا الرابط محجوز لعيادة ثانية — جرب غيره." : msg === "slug_invalid" ? "صيغة الرابط غير صالحة." : errMsg(e));
      if (msg === "slug_taken") setSlugState("taken");
    } finally {
      setSaving(false);
    }
  };

  const url = isValidSlug(slug) ? storeUrl(slug) : null;
  const shownCount = (products ?? []).filter((p) => p.store_visible).length;

  const copy = async () => {
    if (!url) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); playSuccess(); setTimeout(() => setCopied(false), 2000); }
    catch { toast.error("تعذّر النسخ — انسخه يدوياً"); }
  };

  if (profile === undefined) return <Skeleton className="h-96 rounded-2xl" />;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
      <div className="space-y-4">
        {/* التفعيل */}
        <div className="card flex items-center gap-3 p-4">
          <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-2xl", enabled ? "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-300" : "bg-surface-2 text-ink-subtle")}>
            <ShoppingBag size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-ink">{enabled ? "المتجر شغّال — الزبائن يشوفوه هسة" : "المتجر مطفّي"}</p>
            <p className="text-xs text-ink-subtle">{enabled ? "أي زبون يفتح رابطك يشوف منتجاتك ويرسل طلب." : "فعّله حتى يصير رابطك حي ويستقبل الطلبات."}</p>
          </div>
          <button
            onClick={() => { playTap(); const next = !enabled; setEnabled(next); void save(next); }}
            disabled={saving || !isValidSlug(normalizeSlug(slug))}
            className={cn("relative h-8 w-14 shrink-0 rounded-full transition disabled:opacity-40", enabled ? "bg-success-500" : "bg-line-strong")}
            aria-label="تفعيل المتجر">
            <span className={cn("absolute top-1 h-6 w-6 rounded-full bg-white shadow transition-all", enabled ? "start-7" : "start-1")} />
          </button>
        </div>

        {/* الرابط */}
        <div className="card space-y-3 p-4">
          <label className="flex items-center gap-1.5 text-xs font-bold text-ink-muted"><Link2 size={14} className="text-brand-600" /> رابط متجرك المميز</label>
          <div className="flex items-center gap-2">
            <span dir="ltr" className="shrink-0 rounded-lg bg-surface-2 px-2 py-2 font-mono text-xs text-ink-subtle">/s/</span>
            <input dir="ltr" value={slug} onChange={(e) => onSlugInput(e.target.value)} placeholder="happy-paws"
              className="input flex-1 font-mono lowercase" maxLength={30} />
            <Button size="sm" variant="outline" onClick={suggest} leftIcon={<Sparkles size={14} />}>اقترح</Button>
          </div>
          {slugState === "invalid" && slug && <p className="text-2xs font-semibold text-warn-600">3–30: حروف إنكليزية صغيرة وأرقام وشرطات فقط (مثل: happy-paws).</p>}
          {slugState === "checking" && <p className="text-2xs text-ink-subtle">جاري فحص التوفر…</p>}
          {slugState === "ok" && <p className="flex items-center gap-1 text-2xs font-semibold text-success-600"><CheckCircle2 size={12} /> الرابط متاح إلك.</p>}
          {slugState === "taken" && <p className="flex items-center gap-1 text-2xs font-semibold text-danger-500"><X size={12} /> محجوز لعيادة ثانية — جرب غيره.</p>}
        </div>

        {/* الإعدادات */}
        <div className="card space-y-3 p-4">
          <div>
            <label className="mb-1 block text-xs font-bold text-ink-muted">نبذة المتجر (يشوفها الزبون تحت اسم عيادتك)</label>
            <textarea rows={2} value={bio} maxLength={200} onChange={(e) => setBio(e.target.value)}
              placeholder="مثال: مستلزمات وأغذية حيواناتكم الأليفة — توصيل لباب البيت 🐾" className="input min-h-[2.5rem] resize-y text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-bold text-ink-muted">أجرة التوصيل (د.ع)</label>
              <input type="number" inputMode="numeric" min={0} value={fee} onChange={(e) => setFee(e.target.value)} placeholder="0 = مجاني" className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-ink-muted">الحد الأدنى للطلب (د.ع)</label>
              <input type="number" inputMode="numeric" min={0} value={minOrder} onChange={(e) => setMinOrder(e.target.value)} placeholder="0 = بلا حد" className="input" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold text-ink-muted">واتساب استلام الطلبات (اختياري)</label>
            <input dir="ltr" inputMode="tel" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="07xxxxxxxxx" className="input" />
            <p className="mt-1 text-2xs text-ink-subtle">يظهر للزبون كزر تواصل. إذا فارغ نستعمل هاتف حسابك.</p>
          </div>
          <Button onClick={() => void save()} loading={saving} className="w-full">حفظ الإعدادات</Button>
        </div>
      </div>

      {/* لوحة المشاركة */}
      <div className="space-y-4">
        <div className="card overflow-hidden p-0">
          <div className="bg-brand-grad p-4 text-white">
            <p className="flex items-center gap-2 font-display text-base font-extrabold"><Sparkles size={17} /> شارك متجرك</p>
            <p className="mt-0.5 text-xs text-white/85">حط الرابط ببايو الانستغرام والفيسبوك — الزبون يضغط ويطلب مباشرة.</p>
          </div>
          <div className="space-y-3 p-4">
            <div dir="ltr" className="truncate rounded-xl border border-dashed border-line bg-surface-2 px-3 py-2.5 font-mono text-xs text-ink">
              {url ?? "اختر رابطاً أولاً…"}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" variant="outline" disabled={!url} onClick={() => void copy()} leftIcon={copied ? <Check size={14} /> : <Copy size={14} />}>
                {copied ? "انتسخ!" : "نسخ الرابط"}
              </Button>
              <Button size="sm" variant="outline" disabled={!url || !enabled} onClick={() => { playTap(); if (url) window.open(url, "_blank"); }} leftIcon={<ExternalLink size={14} />}>
                معاينة المتجر
              </Button>
            </div>
            {url && (
              <a href={`https://wa.me/?text=${encodeURIComponent(`🛍️ متجرنا صار أونلاين! تصفح منتجاتنا واطلب توصيل لباب البيت:\n${url}`)}`}
                target="_blank" rel="noreferrer"
                className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2.5 text-xs font-extrabold text-white transition hover:brightness-95 active:scale-[0.98]">
                <MessageCircle size={15} /> شارك بالواتساب
              </a>
            )}
          </div>
        </div>

        {/* جاهزية المتجر */}
        <div className="card space-y-2.5 p-4">
          <p className="font-display text-sm font-bold text-ink">جاهزية متجرك</p>
          <ReadyRow ok={isValidSlug(normalizeSlug(slug))} label="رابط مميز محفوظ" />
          <ReadyRow ok={shownCount > 0} label={shownCount > 0 ? `${formatNum(shownCount)} منتج معروض` : "أضف منتجات للتشكيلة"} />
          <ReadyRow ok={enabled} label="المتجر مفعّل" />
          <p className="border-t border-line pt-2 text-2xs leading-relaxed text-ink-subtle">
            الطلب يوصلك «جديد» — ولا ينسحب أي مخزون إلا لما تقبله بنفسك. القبول يولّد فاتورة COD ويرسل الطلب لشاشة التوصيل.
          </p>
        </div>
      </div>
    </div>
  );
}

function ReadyRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-xs font-semibold", ok ? "text-success-600" : "text-ink-subtle")}>
      {ok ? <CheckCircle2 size={14} /> : <span className="grid h-3.5 w-3.5 place-items-center rounded-full border-2 border-line-strong" />}
      {label}
    </p>
  );
}

function Kpi({ icon: Icon, tone, label, value, pulse }: { icon: typeof Inbox; tone: "brand" | "success" | "accent" | "danger"; label: string; value: string; pulse?: boolean }) {
  const tones: Record<string, string> = {
    brand: "bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300",
    success: "bg-success-50 text-success-600 dark:bg-success-500/15 dark:text-success-200",
    accent: "bg-accent-50 text-accent-600 dark:bg-accent-500/15 dark:text-accent-300",
    danger: "bg-danger-50 text-danger-500 dark:bg-danger-500/15 dark:text-danger-300",
  };
  return (
    <div className="card flex items-center gap-3 p-3.5">
      <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl", tones[tone], pulse && "animate-pulse")}><Icon size={20} /></span>
      <div className="min-w-0">
        <p className="font-display text-lg font-extrabold leading-tight text-ink tabular-nums">{value}</p>
        <p className="truncate text-2xs text-ink-subtle">{label}</p>
      </div>
    </div>
  );
}
