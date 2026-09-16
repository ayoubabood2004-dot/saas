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
  Search, Eye, EyeOff, Pencil, TrendingUp, Truck, PackageX, RefreshCw, StickyNote, BellRing, Camera, ImagePlus, Loader2,
} from "lucide-react";
import type { Product, StoreOrder, StoreProfile, SuggestedProduct } from "@/types";
import { useTranslation } from "react-i18next";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { bumpStoreOrders, useStoreOrderCount, storeAlertsState, enableStoreAlerts, noteStoreProfile } from "@/lib/storeOrdersLive";
import { normalizeSlug, isValidSlug, slugCandidates, storeUrl, categoryLook, productImageUrl, shelfLook, shelfMonogram } from "@/lib/storeLib";
import { prepareUpload } from "@/lib/image";
import { ImageLibraryPicker } from "@/components/inventory/ImageLibraryPicker";
import { searchable } from "@/lib/utils";
import { waNumber } from "@/lib/phone";
import { getDialCode, getClinicName } from "@/lib/settings";
import { withTimeout, describeUploadError, describeDbError } from "@/lib/errors";
import { playTap, playSuccess, playWarning, playAchievement } from "@/lib/sounds";
import { Button, Badge, Skeleton, useToast } from "@/components/ui";
import { cn, money, formatNum, formatDate, currencySymbol } from "@/lib/utils";

type Tab = "orders" | "catalog" | "settings";
/** تصفياتُ التشكيلة — مشتركةٌ لأن لوحةَ الجاهزية بتبويبٍ آخرَ تفتحها. */
type CatFilter = "all" | "shown" | "hidden" | "nophoto" | "noprice" | "nostock" | "nodesc";


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

/** سقفُ سجلّ الطلبات المعروض — يُقال بالعدد أسفلَه، لا يُقصّ بصمت (ع٤). */
const STORE_LOG_CAP = 30;
/** نافذةُ الطلبات المجلوبة. الأرقامُ المبنيّةُ عليها **تقولها بعنوانها** —
 *  والاسمُ واحدٌ كي لا ينفصل العنوانُ عن الجلب عند أوّلِ تعديل. */
const ORDERS_WINDOW = 300;

export function ClinicStore() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const clinicId = user?.clinic_id ?? user?.id;
  const [tab, setTab] = useState<Tab>("orders");
  /* التصفيةُ بالأب: «١ بلا سعر» بلوحة الإعدادات تفتح التشكيلةَ مصفّاةً عليه.
   * سطرٌ يقول عدداً ولا يوصّل إليه يترك الدكتورَ يبحث يدوياً بتسعِمئة صنف. */
  const [catFilter, setCatFilter] = useState<CatFilter>("all");
  const goCatalog = (f: CatFilter) => { setCatFilter(f); setTab("catalog"); };

  const [orders, setOrders] = useState<StoreOrder[] | null>(null);
  const [newOrders, setNewOrders] = useState<StoreOrder[] | null>(null);
  const [products, setProducts] = useState<Product[] | null>(null);
  const [profile, setProfile] = useState<StoreProfile | null | undefined>(undefined); // undefined = يتحمّل
  const newCount = useStoreOrderCount();
  /* فشلُ الجلب كان يضع قوائمَ فارغة بلا حالةِ خطأ ولا توست ولا إعادة — فيقول
   * الصندوقُ «لا طلبات» عن زبونٍ طلب وينتظر التأكيد، ولا أحد يتصل به. وهذا
   * المكانُ الوحيد الذي يستقبل مبيعاتِ الإنترنت. */
  const [failed, setFailed] = useState(false);

  const load = async () => {
    try {
      const [o, nw, p, pr] = await Promise.all([
        repo.listStoreOrders(ORDERS_WINDOW),
        // صندوقُ «الجديد» بلا سقف: الشارةُ تعدّ بالخادم، فلو بقي الصندوقُ
        // مقصوصاً ناقضته — «١ بانتظارك» و«ما اكو طلبات» بنفس الشاشة.
        repo.listNewStoreOrders(),
        repo.listProducts(clinicId),
        repo.getStoreProfile(),
      ]);
      setOrders(o); setNewOrders(nw); setProducts(p); setProfile(pr);
      // الجرسُ يعرف من هنا بلا رحلةٍ ثانية — وينطفئ فوراً لو أُطفئ المتجر.
      noteStoreProfile(pr);
      setFailed(false);
    } catch {
      // ما نكذب بقوائمَ فارغة: إمّا بياناتٌ سابقة تبقى، أو تُقال الحقيقة.
      setFailed(true);
      setProfile((x) => (x === undefined ? null : x));
    }
  };
  useEffect(() => {
    void load();
    /* لا طلبَ إذنٍ تلقائيّ عند الفتح: نافذةٌ تقفز بلا سياقٍ تُرفض بلا قراءة —
     * وسفاري تتجاهلها بلا إيماءة — فيُحرق الخيارُ إلى الأبد. صار بزرٍّ صريح. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // العداد الحي ارتفع (طلب وصل ونحن بالصفحة) → حدّث القائمة فوراً.
  useEffect(() => { if (orders !== null) void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [newCount]);

  const TABS: { id: Tab; label: string; icon: typeof Inbox; badge?: number }[] = [
    // عدُّ الخادم ما دام الصندوقُ يتحمّل؛ وبعدها **الصندوقُ هو الشارة** — فلا
    // يبقى رقمان لشيءٍ واحد يختلفان أمام عين الدكتور.
    { id: "orders", label: "الطلبات", icon: Inbox, badge: newOrders ? newOrders.length : newCount },
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

      {failed && (
        <div className="mb-4 rounded-2xl border border-danger-200 bg-danger-50 p-4 text-center dark:border-danger-500/30 dark:bg-danger-500/10" data-storefailed>
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">
            {orders === null
              ? t("pos.storeOrdersFailed", "تعذّر تحميل الطلبات — ما نعرف إذا وصلك طلب أو لا. أعد المحاولة.")
              : t("pos.storeRefreshFailed", "آخر تحديث فشل — المعروض قد يكون قديماً.")}
          </p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => { playTap(); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {tab === "orders"
            ? <OrdersTab orders={orders} newOrders={newOrders} products={products} profile={profile ?? null} reload={load} goSettings={() => setTab("settings")} goCatalog={goCatalog} />
            : tab === "catalog"
              ? <CatalogTab products={products} reload={load} storeOn={!!profile?.enabled} filter={catFilter} setFilter={setCatFilter} />
              : <SettingsTab profile={profile} products={products} goCatalog={goCatalog} onSaved={(p) => { setProfile(p); noteStoreProfile(p); }} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/* ============================== الطلبات ============================== */

/* `clinicId` و`user` ما عادا لازمين هنا: بناءُ الفاتورة ونسبتُها انتقلا
 * للخادم (0183)، والدالّةُ تفحص العيادةَ والدورَ بنفسها. */
function OrdersTab({ orders, newOrders, products, profile, reload, goSettings, goCatalog }: {
  orders: StoreOrder[] | null; newOrders: StoreOrder[] | null;
  products: Product[] | null; profile: StoreProfile | null;
  reload: () => Promise<void>; goSettings: () => void; goCatalog: (f: CatFilter) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmReject, setConfirmReject] = useState<StoreOrder | null>(null);

  const prodById = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  /* «الجديد» من قائمته الخاصّة **بلا سقف** لا من تصفيةِ آخر ٣٠٠ بكلّ الحالات:
   * طلبٌ جديدٌ وراءه ثلاثُمئةِ قرارٍ أحدثُ منه كان يسقط من الصندوق كلّياً —
   * لا يُعرض ولا يُقبل ولا يُرفض، والزبونُ ينتظر مكالمةً لن تأتي. */
  const fresh = newOrders ?? (orders ?? []).filter((o) => o.status === "new");
  const [alerts, setAlerts] = useState(storeAlertsState());
  const decided = (orders ?? []).filter((o) => o.status !== "new");
  /* والمبتوتُ يبقى مقصوصاً بالنافذة — وهذا مقبولٌ لأنه سجلٌّ يُقرأ لا صندوقٌ
   * يُعمل منه. لكنّ الأرقامَ المبنيّةَ عليه **تقول نافذتَها**: «مبيعات المتجر»
   * من مجموعٍ مقصوصٍ بعنوانٍ مطلق كانت تُنقِص المبلغَ وتبدو حقيقةً كاملة. */
  const capped = (orders ?? []).length >= ORDERS_WINDOW;
  const shownCount = (products ?? []).filter((p) => p.store_visible).length;
  const today = new Date().toDateString();
  const acceptedToday = decided.filter((o) => o.status === "accepted" && o.decided_at && new Date(o.decided_at).toDateString() === today).length;
  const storeRevenue = decided.filter((o) => o.status === "accepted").reduce((s, o) => s + o.total, 0);
  const decideRate = decided.length ? Math.round((decided.filter((o) => o.status === "accepted").length / decided.length) * 100) : null;

  /** القبول = لحظة الحقيقة: فاتورة عبر محرك البيع الموجود (المخزون ينسحب هنا
   *  حصراً — بنفس منطق الوحدات الجزئية والمخزون المجمّع) ثم طلب توصيل بخط
   *  التوصيل المجرب، ثم يُختم طلب المتجر «مقبول» بمرجع الفاتورة. */
  /** القبول = لحظةُ الحقيقة، ونداءٌ واحد (0183).
   *
   *  كان ثلاثَ رحلات: فاتورةٌ ثم صفُّ توصيلٍ ثم ختمُ الطلب — وكلُّ حدٍّ بينها
   *  نقطةُ انكسار. نجحت الفاتورةُ وفشل الختمُ ⇒ الطلبُ «جديد» والبضاعةُ خرجت.
   *  نجح الختمُ وفشل التوصيلُ ⇒ طلبٌ «مقبول» بلا صفِّ توصيلٍ لا يراه أحد.
   *  صارت معاملةً واحدة بالخادم: الثلاثةُ تقع أو لا يقع شيء. والدالّة تفحص
   *  العيادةَ والدورَ بنفسها (درسُ 0145) لأنها definer تتجاوز RLS. */
  /** أجرةُ التوصيل لكلّ طلبٍ — تُكتب بلحظة القبول (0189).
   *  المقيس: ٥٢٣ صفَّ توصيلٍ من ٥٢٣ **بلا منطقة**، وإحدى عشرةَ قيمةَ أجرةٍ
   *  بين صفرٍ و١٥ ألفاً. فالتسعيرُ بالمكالمة، ورقمٌ ثابتٌ بالإعدادات لا يصفه. */
  const [feeDraft, setFeeDraft] = useState<Record<string, string>>({});

  const accept = async (o: StoreOrder) => {
    if (busy) return;
    setBusy(o.id);
    try {
      // فارغٌ ⇒ لا وسيط ⇒ أجرةُ الطلب كما وقعت. ومكتوبٌ ⇒ يغلب، ولو صفراً.
      const raw = feeDraft[o.id];
      const fee = raw !== undefined && raw.trim() !== "" ? Math.max(0, Number(raw) || 0) : null;
      const r = await withTimeout(repo.acceptStoreOrder(o.id, null, fee), 15000);
      playAchievement();
      toast.success(
        r.already
          ? t("pos.storeAcceptAlready", "الطلب {{no}} كان مقبولاً أصلاً", { no: o.order_no })
          : t("pos.storeAcceptOk", "قبلت الطلب {{no}} ✅", { no: o.order_no }),
        t("pos.storeAcceptOkHint", "انولدت فاتورته وانسحب المخزون، وتلكاه جاهز بشاشة التوصيل."));
      setFeeDraft((d) => { const n = { ...d }; delete n[o.id]; return n; });
      bumpStoreOrders();
      await reload();
    } catch (e) {
      playWarning();
      toast.error(t("pos.storeAcceptFail", "تعذّر قبول الطلب"), describeDbError(e, t));
    } finally {
      setBusy(null);
    }
  };

  const reject = async (o: StoreOrder) => {
    if (busy) return;
    setBusy(o.id);
    try {
      await repo.updateStoreOrder(o.id, { status: "rejected" });
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
        <Kpi icon={Inbox} tone="danger" label={t("pos.kpiPending", "طلبات بانتظارك")} value={String(fresh.length)} pulse={fresh.length > 0} />
        <Kpi icon={CheckCircle2} tone="success" label={capped ? t("pos.kpiAcceptedTodayWindow", "مقبولة اليوم (ضمن آخر {{n}})", { n: ORDERS_WINDOW }) : t("pos.kpiAcceptedToday", "مقبولة اليوم")} value={String(acceptedToday)} />
        <Kpi icon={TrendingUp} tone="brand" label={capped ? t("pos.kpiRevenueWindow", "مبيعات المتجر (آخر {{n}} طلب)", { n: ORDERS_WINDOW }) : t("pos.kpiRevenue", "مبيعات المتجر (المقبولة)")} value={money(storeRevenue)} />
        {/* «نسبةُ القبول» نسبةٌ — النافذةُ تُختصر منها بسطاً ومقاماً، فتقديرُها
            على آخر ٣٠٠ تقديرٌ نزيه. لا تُوسَم، ووسمُها ضجيج. */}
        <Kpi icon={Sparkles} tone="accent" label={t("pos.kpiAcceptRate", "نسبة القبول")} value={decideRate === null ? "—" : `${formatNum(decideRate)}٪`} />
      </div>

      {/* ── مسارُ التفعيل: ثلاثُ خطواتٍ مرقَّمة ───────────────────────────
          كانت لافتةً واحدةً تقول «متجرك مو مفعّل — افتح الإعدادات». وهي صادقةٌ
          وغيرُ كافية: تقول **أين** تذهب ولا تقول **ماذا تفعل** ولا كم بقي.
          فالعيادةُ تفتح الإعدادات، ترى حقولاً، وتخرج.

          والترتيبُ مقصود: الرابطُ أوّلاً (بلا رابطٍ لا متجر)، ثمّ البضاعةُ
          (متجرٌ مفعَّلٌ فارغٌ أسوأُ من مطفأ — الزبونُ يدخل ويرى رفّاً خالياً
          فلا يعود)، والتفعيلُ آخِراً. وكلُّ خطوةٍ تفتح فعلَها مباشرةً. */}
      {!(profile?.enabled && shownCount > 0) && (
        <div className="card space-y-3 p-4">
          <p className="font-display text-sm font-bold text-ink">{t("cat.setupTitle", "خلّي متجرك يشتغل — ٣ خطوات")}</p>
          <SetupStep n={1} done={!!profile?.slug}
            label={profile?.slug ? t("cat.setupLinkDone", "رابطك: {{s}}", { s: profile.slug }) : t("cat.setupLink", "اختر رابط متجرك")}
            cta={t("cat.setupOpenSettings", "الإعدادات")} onGo={goSettings} />
          <SetupStep n={2} done={shownCount > 0}
            label={shownCount > 0 ? t("cat.setupShownDone", "{{n}} منتج معروض", { n: formatNum(shownCount) }) : t("cat.setupShown", "انشر منتجاتك — «انشر أكثر ما تبيع» يجهّزها بضغطة")}
            cta={t("cat.setupOpenCatalog", "التشكيلة")} onGo={() => goCatalog(shownCount > 0 ? "shown" : "hidden")} />
          <SetupStep n={3} done={!!profile?.enabled}
            label={profile?.enabled ? t("cat.setupOnDone", "المتجر مفعّل ويستقبل طلبات") : t("cat.setupOn", "فعّل المتجر حتى توصلك الطلبات")}
            cta={t("cat.setupOpenSettings", "الإعدادات")} onGo={goSettings} />
          {profile?.enabled && shownCount === 0 && (
            <p className="rounded-xl bg-warn-50/60 p-2.5 text-2xs leading-relaxed text-warn-700 dark:bg-warn-500/10 dark:text-warn-200">
              {t("cat.setupEmptyWarn", "متجرك مفعّل بس فارغ — الزبون اللي يفتح الرابط راح يشوف رفّاً خالياً وما يرجع. انشر منتجاتك أول.")}
            </p>
          )}
        </div>
      )}

      {/* جرسُ التنبيه: يُطلب الإذنُ بضغطةٍ لا عند الإقلاع. الشارةُ والصوتُ
          يعملان بلا إذنٍ أصلاً — هذا يضيف إشعارَ النظام والتبويبُ بالخلف. */}
      {profile?.enabled && alerts === "default" && (
        <div className="card flex flex-wrap items-center gap-3 p-4">
          <BellRing size={19} className="shrink-0 text-brand-600" />
          <span className="flex-1 text-sm font-semibold text-ink">{t("storeBell.ask", "خلّي التنبيه يوصلك حتى لو التطبيق بتبويب ثاني")}</span>
          <Button size="sm" onClick={async () => { playTap(); setAlerts(await enableStoreAlerts()); }}>
            {t("storeBell.enable", "شغّل التنبيه")}
          </Button>
        </div>
      )}
      {profile?.enabled && alerts === "denied" && (
        <p className="text-2xs text-ink-muted">{t("storeBell.denied", "تنبيه النظام مرفوض من إعدادات المتصفّح — الشارة والصوت شغّالين على كل حال.")}</p>
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
                      {/* التقادم يُرى (0176): طلبٌ منسيٌّ بالليل يصرخ بالصبح — بلا حذفٍ تلقائي، القرار للعيادة. */}
                      {(Date.now() - new Date(o.created_at).getTime()) > 24 * 3600_000 ? (
                        <span className="rounded-full bg-warn-100 px-2 py-0.5 text-2xs font-bold text-warn-700 dark:bg-warn-500/20 dark:text-warn-200">{t("track.staleDay", "صارله يوم بلا قرار")}</span>
                      ) : (Date.now() - new Date(o.created_at).getTime()) > 6 * 3600_000 ? (
                        <span className="rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-muted">{t("track.staleHours", "صارله فوق ٦ ساعات")}</span>
                      ) : null}
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

                {/* أجرةُ التوصيل لهذا الطلب — تُحسم بلحظة القبول (0189).
                    المقيس: ٥٢٣ صفَّ توصيلٍ من ٥٢٣ بلا منطقةٍ مسعَّرة، وإحدى
                    عشرةَ قيمةَ أجرةٍ بين صفرٍ و١٥ ألفاً — التسعيرُ بالمكالمة.
                    وفارغٌ يعني «كما وقع الطلب»، لا صفراً. */}
                <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl bg-surface-2 p-2.5">
                  <Truck size={15} className="shrink-0 text-ink-subtle" />
                  <label className="text-xs font-semibold text-ink-muted" htmlFor={`fee-${o.id}`}>
                    {t("pos.acceptFee", "أجرة التوصيل")}
                  </label>
                  <input id={`fee-${o.id}`} type="number" inputMode="numeric" min={0} disabled={busy === o.id}
                    value={feeDraft[o.id] ?? ""} onChange={(e) => setFeeDraft((d) => ({ ...d, [o.id]: e.target.value }))}
                    placeholder={o.delivery_fee > 0 ? String(o.delivery_fee) : t("pos.acceptFeeNone", "بلا أجرة")}
                    className="input h-8 w-28 text-xs" />
                  <span className="text-2xs text-ink-subtle">
                    {t("pos.acceptFeeHint", "اتركه فارغاً ليبقى كما وصل الطلب")}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
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
          <h2 className="mb-2 flex items-center gap-2 font-display text-lg font-bold text-ink"><RefreshCw size={16} className="text-ink-subtle" /> {t("pos.ordersLog", "سجل الطلبات")}{decided.length > STORE_LOG_CAP && (
              // و«من {total}» نفسُها مقصوصةٌ بالنافذة — فتُقال «+٣٠٠» لا رقماً
              // يبدو مجموعاً كاملاً. عنوانٌ صادقٌ نصفَ صدقٍ أسوأ من لا عنوان.
              <span className="text-xs font-normal text-ink-subtle">{t("pos.logCap", "آخر {{n}} من {{total}}", { n: STORE_LOG_CAP, total: capped ? `${ORDERS_WINDOW}+` : decided.length })}</span>
            )}</h2>
          <div className="space-y-2">
            {decided.slice(0, STORE_LOG_CAP).map((o) => (
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

function CatalogTab({ products, reload, storeOn, filter, setFilter }: {
  products: Product[] | null; reload: () => Promise<void>; storeOn: boolean;
  filter: CatFilter; setFilter: (f: CatFilter) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [descId, setDescId] = useState<string | null>(null);
  const [descDraft, setDescDraft] = useState("");
  const [priceId, setPriceId] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  /* الصورةُ تُضاف من هنا لا من المخزون: هذا مكانُ الدكتور حين يفكّر بمتجره،
   * والتنقّلُ لشاشةٍ أخرى لكلّ منتجٍ هو ما كان يمنعه من إكمال الصور أصلاً. */
  const [photoFor, setPhotoFor] = useState<Product | null>(null);
  const [libFor, setLibFor] = useState<Product | null>(null);
  /* «انشر أكثرَ ما تبيع» (ت٣): بعد أن فُتح بابُ النشر الجماعيّ يبقى سؤالُ
   * الدكتور — **أيَّ أربعين من تسعِمئة؟** والاجتهادُ أمام تسعِمئة صنفٍ هو
   * نفسُه الحاجزُ بشكلٍ آخر. والمقيسُ أنّ أعلى ٤٠ منتجاً تصنع ٩٠٪ و٤٣٪ و٣٦٪
   * من إيراد الثلاثِ الكبار — فالجوابُ استعلامٌ لا اجتهاد. */
  const [suggest, setSuggest] = useState<SuggestedProduct[] | null>(null);
  const [suggestState, setSuggestState] = useState<"idle" | "loading" | "open" | "error">("idle");
  const [suggestPick, setSuggestPick] = useState<Set<string>>(new Set());
  /** الاختيارُ المتعدّد — مفتاحُ النشر الجماعيّ. */
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  const [sort, setSort] = useState<"smart" | "name" | "priceDesc" | "priceAsc">("smart");
  const fileRef = useRef<HTMLInputElement>(null);

  const all = products ?? [];
  const noPhotoCount = all.filter((p) => !p.image_path).length;
  const shownCount = all.filter((p) => p.store_visible).length;
  const hiddenCount = all.length - shownCount;
  /* ما ينقص **المعروضَ** — نفسُ أعداد لوحة الجاهزية بالإعدادات، من نفس التعريف. */
  const shownRows = all.filter((p) => p.store_visible);
  const noPriceShown = shownRows.filter((p) => (p.sell_price ?? 0) <= 0).length;
  const noStockShown = shownRows.filter((p) => p.stock <= 0 && !p.pooled).length;
  const noDescShown = shownRows.filter((p) => !p.store_desc).length;

  const list = useMemo(() => {
    const ql = searchable(q);
    let base = all.filter((p) => !ql || searchable(p.name).includes(ql) || searchable(p.subcategory).includes(ql));
    if (filter === "shown") base = base.filter((p) => p.store_visible);
    else if (filter === "hidden") base = base.filter((p) => !p.store_visible);
    else if (filter === "nophoto") base = base.filter((p) => !p.image_path);
    // ثلاثُ تصفياتٍ جديدةٍ تقابل سطورَ لوحة الجاهزية — وعلى **المعروض** وحدَه:
    // «بلا سعر» عن منتجٍ مخفيٍّ ليس عيباً بالمتجر، بل صنفٌ لم يُنشَر بعد.
    else if (filter === "noprice") base = base.filter((p) => p.store_visible && (p.sell_price ?? 0) <= 0);
    else if (filter === "nostock") base = base.filter((p) => p.store_visible && p.stock <= 0 && !p.pooled);
    else if (filter === "nodesc") base = base.filter((p) => p.store_visible && !p.store_desc);
    const arr = [...base];
    if (sort === "name") arr.sort((a, b) => a.name.localeCompare(b.name, "ar"));
    else if (sort === "priceDesc") arr.sort((a, b) => b.sell_price - a.sell_price);
    else if (sort === "priceAsc") arr.sort((a, b) => a.sell_price - b.sell_price);
    else {
      /* «الترتيب الذكي»: المعروضُ أوّلاً ليرى تشكيلتَه بلمحة، وداخلَه
       * الناقصُ صورةً قبل المكتمل — فالعملُ الباقي يتصدّر بلا أن يبحث عنه. */
      const rank = (p: Product) => (p.store_visible ? 0 : 2) + (p.image_path ? 1 : 0);
      arr.sort((a, b) => rank(a) - rank(b));
    }
    return arr;
  }, [all, q, filter, sort]);

  /** نجمة المختارات (0177) — علمٌ على المنتج، بلا أثرٍ على البيع الداخلي. */
  const toggleFeatured = async (p: Product) => {
    if (busyId) return;
    setBusyId(p.id);
    try {
      await repo.updateProduct(p.id, { store_featured: !p.store_featured });
      p.store_featured ? playTap() : playSuccess();
      await reload();
    } catch (e) { playWarning(); toast.error(t("sf.featFailed", "تعذّر تحديث المختارات"), errMsg(e)); }
    finally { setBusyId(null); }
  };
  /** رفعُ صورةٍ من هنا مباشرة — نفسُ مسار المخزون حرفياً: ضغطٌ ثم حفظٌ للمسار. */
  const uploadFor = async (p: Product, file: File) => {
    setBusyId(p.id);
    try {
      const prepared = await prepareUpload(file, { maxDim: 800, quality: 0.72 });
      const old = p.image_path ?? null;
      const path = await repo.uploadProductImage(p.clinic_id ?? null, p.id, prepared);
      await repo.updateProduct(p.id, { image_path: path });
      // المسارُ صار فريداً لكلّ رفعة (البند ٩)، فالقديمُ لم يعد يُطمَس بالجديد —
      // يُحذف بعد أن ينجح تحويلُ المرجع، وبعده وحده. `repo` تتكفّل بالمشترَك.
      if (old && old !== path) void repo.deleteProductImage(p.clinic_id ?? null, p.id, old);
      playSuccess();
      await reload();
    } catch (e) { playWarning(); toast.error(describeUploadError(e, t)); }
    finally { setBusyId(null); setPhotoFor(null); }
  };
  const pickFromLib = async (p: Product, path: string) => {
    setBusyId(p.id);
    try {
      const old = p.image_path ?? null;
      await repo.updateProduct(p.id, { image_path: path });
      // الانتقالُ لصورة مكتبةٍ يترك ملفَّ العيادة القديمَ يتيماً لو لم يُحذف.
      if (old && old !== path) void repo.deleteProductImage(p.clinic_id ?? null, p.id, old);
      playSuccess(); await reload();
    }
    catch (e) { playWarning(); toast.error(t("pos.photoSaveFailed", "تعذّر حفظ الصورة"), errMsg(e)); }
    finally { setBusyId(null); setLibFor(null); setPhotoFor(null); }
  };
  const clearPhoto = async (p: Product) => {
    setBusyId(p.id);
    try {
      const old = p.image_path ?? null;
      await repo.updateProduct(p.id, { image_path: null });
      // ملفُّ المكتبة مشتركٌ بين العيادات — يُفكّ الربطُ ولا يُحذف (repo تتكفّل).
      if (old) void repo.deleteProductImage(p.clinic_id ?? null, p.id, old);
      playTap(); await reload();
    } catch (e) { playWarning(); toast.error(t("pos.photoSaveFailed", "تعذّر حفظ الصورة"), errMsg(e)); }
    finally { setBusyId(null); setPhotoFor(null); }
  };

  /** نشرٌ/إخفاءٌ — نداءٌ واحدٌ للخادم ثمّ **تحديثٌ محلّيّ بلا `reload()`**.
   *
   *  كانت كلُّ ضغطةٍ تتبعها إعادةُ تحميلٍ كاملة: طلباتٌ + منتجاتٌ (٦٩١ ك.ب
   *  لأكبر عيادةٍ حيّة) + ملفُّ المتجر. فأربعون منتجاً ≈ ٢٧ ميغا، و`busyId`
   *  بينها تُسقط أيَّ ضغطةٍ ثانيةٍ **بصمت** — فيضغط الدكتورُ ولا يصير شيء. */
  const applyVisible = async (ids: string[], on: boolean) => {
    if (!ids.length) return;
    const r = await repo.setStoreVisible(ids, on);
    // الصفوفُ تُحدَّث بمكانها: الخادمُ حَكَمٌ على ما تبدّل، والمعروضُ يتبعه بلا رحلة.
    const done = new Set(ids);
    for (const p of all) if (done.has(p.id) && (on ? (p.sell_price ?? 0) > 0 : true)) p.store_visible = on;
    if (r.skipped_no_price > 0) {
      // «قائمةٌ ناقصة أخطرُ من خطأ ظاهر» — المتخطَّى يُقال بعدده وسببه.
      toast.error(
        t("cat.bulkSkipped", "انتشر {{n}} — و{{s}} بلا سعر ما انتشرن", { n: r.changed, s: r.skipped_no_price }),
        t("cat.bulkSkippedWhy", "منتجٌ بسعر صفر يطلبه الزبون مجّاناً. حطّ له سعراً وانشره."),
      );
    }
    return r;
  };

  const toggle = async (p: Product) => {
    if (busyId || bulkBusy) return;
    setBusyId(p.id);
    const next = !p.store_visible;
    try {
      await applyVisible([p.id], next);
      next ? playSuccess() : playTap();
    } catch (e) { playWarning(); toast.error(t("cat.updateFailed", "تعذّر التحديث"), errMsg(e)); await reload(); }
    finally { setBusyId(null); }
  };

  const openSuggest = async () => {
    playTap();
    setSuggestState("loading");
    try {
      const rows = await repo.suggestStoreProducts(40);
      setSuggest(rows);
      // **مؤشَّرةٌ مسبقاً والدكتورُ يشطب**: القائمةُ اقتراحٌ مدروس، والشطبُ
      // أرخصُ من التأشير أربعين مرّة. والأدويةُ أوّلُ ما يُشطب — ولهذا تُعرض
      // الفئةُ بكلّ سطرٍ لا الاسمُ وحدَه.
      setSuggestPick(new Set(rows.map((r) => r.id)));
      setSuggestState("open");
    } catch {
      // لا قائمةَ فارغةٌ عن فشل: «ما عندك مبيعات تستحقّ النشر» كذبةٌ تُصدَّق.
      setSuggestState("error");
    }
  };

  const publishSuggested = async () => {
    const ids = [...suggestPick];
    if (!ids.length || bulkBusy) return;
    setBulkBusy(true);
    try {
      const r = await applyVisible(ids, true);
      const done = new Set(ids);
      setSuggest((rows) => (rows ?? []).filter((x) => !done.has(x.id)));
      setSuggestPick(new Set());
      if (r && r.changed > 0 && r.skipped_no_price === 0) {
        playSuccess();
        toast.success(t("cat.bulkShown", "انتشر {{n}} منتجاً بالمتجر", { n: r.changed }));
      }
      if (!suggest || suggest.length <= ids.length) setSuggestState("idle");
    } catch (e) {
      playWarning();
      toast.error(t("cat.bulkFailed", "ما انتشرت — أعد المحاولة"), errMsg(e));
      await reload();
    } finally { setBulkBusy(false); }
  };

  /** النشرُ الجماعيّ — البندُ الذي وقفت عنده الثلاثُ الكبار. */
  const bulk = async (on: boolean) => {
    if (bulkBusy || busyId) return;
    const ids = [...picked];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const r = await applyVisible(ids, on);
      setPicked(new Set());
      if (r && r.changed > 0 && r.skipped_no_price === 0) {
        playSuccess();
        toast.success(on
          ? t("cat.bulkShown", "انتشر {{n}} منتجاً بالمتجر", { n: r.changed })
          : t("cat.bulkHidden", "انخفى {{n}} منتجاً", { n: r.changed }));
      } else if (r && r.changed === 0 && r.skipped_no_price === 0) {
        playTap();
        toast.toast({ tone: "info", title: t("cat.bulkNothing", "ما تغيّر شي — كانوا هيچي أصلاً") });
      }
    } catch (e) {
      playWarning();
      toast.error(t("cat.bulkFailed", "ما انتشرت — أعد المحاولة"), errMsg(e));
      // فشلٌ جماعيّ: نعيد القراءة كي لا تبقى الشاشةُ على ظنٍّ لا يطابق الخادم.
      await reload();
    } finally { setBulkBusy(false); }
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
        <select value={sort} onChange={(e) => { playTap(); setSort(e.target.value as typeof sort); }} data-catsort
          aria-label={t("cat.sort", "الترتيب")}
          className="shrink-0 rounded-full border border-line bg-surface-1 px-3 py-1.5 text-xs font-semibold text-ink-muted outline-none">
          <option value="smart">{t("cat.sortSmart", "الترتيب الذكي")}</option>
          <option value="name">{t("cat.sortName", "بالاسم")}</option>
          <option value="priceDesc">{t("cat.sortPriceDesc", "الأغلى أولاً")}</option>
          <option value="priceAsc">{t("cat.sortPriceAsc", "الأرخص أولاً")}</option>
        </select>
      </div>

      {/* تصفيةٌ بضغطة — و«بلا صورة» هي المقصودة: الدكتور يشوف ما ينقصه ويكمّله
          من مكانه بلا ما يفتح المخزون منتجاً منتجاً. */}
      <div className="flex flex-wrap items-center gap-1.5" data-catfilter>
        {/* الثلاثةُ الأخيرةُ تظهر **حين يكون فيها شيء** — وإلا صارت أربعَ أزرارٍ
            صفريّةٍ تزاحم الشاشة. وظهورُها لازمٌ لا تجميل: لوحةُ الجاهزية تفتح
            هذه التصفيات، فبلا زرٍّ يقابلها يرى الدكتورُ قائمةً مصفّاةً ولا
            يعرف لماذا ولا كيف يرجع. */}
        {([
          ["all", t("cat.fAll", "الكل"), all.length],
          ["shown", t("cat.fShown", "معروض"), shownCount],
          ["hidden", t("cat.fHidden", "مخفي"), hiddenCount],
          ["nophoto", t("cat.fNoPhoto", "بلا صورة"), noPhotoCount],
          ...(noPriceShown > 0 || filter === "noprice" ? [["noprice", t("cat.fNoPrice", "بلا سعر"), noPriceShown] as const] : []),
          ...(noStockShown > 0 || filter === "nostock" ? [["nostock", t("cat.fNoStock", "نافد"), noStockShown] as const] : []),
          ...(noDescShown > 0 || filter === "nodesc" ? [["nodesc", t("cat.fNoDesc", "بلا وصف"), noDescShown] as const] : []),
        ] as const).map(([id, label, n]) => (
          <button key={id} onClick={() => { playTap(); setFilter(id); }}
            className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
              filter === id ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2",
              (id === "nophoto" || id === "noprice" || id === "nostock" || id === "nodesc")
                && filter !== id && n > 0 && "border-warn-300 text-warn-700 dark:border-warn-500/40 dark:text-warn-200")}>
            {label}
            <span className={cn("tabular-nums", filter === id ? "text-white/80" : "text-ink-subtle")}>{formatNum(n)}</span>
          </button>
        ))}
      </div>

      {/* «انشر أكثرَ ما تبيع» — يُعرض حين لا تكون تشكيلتُه جاهزةً بعد.
          والحدُّ الصريح: **الدالّةُ تقترح ولا تكتب** — لا نشرَ بلا ضغطة.
          النشرُ يُعلن سعراً ووعداً بالعلن، وهو قرارُ العيادة لا المنصّة. */}
      {suggestState !== "open" && (
        <button type="button" onClick={() => void openSuggest()} disabled={suggestState === "loading"}
          className="card flex w-full items-center gap-3 border-brand-300 bg-brand-50/60 p-4 text-start transition hover:bg-brand-50 disabled:opacity-60 dark:border-brand-500/40 dark:bg-brand-500/10">
          {suggestState === "loading" ? <Loader2 size={20} className="shrink-0 animate-spin text-brand-600" /> : <Sparkles size={20} className="shrink-0 text-brand-600" />}
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-ink">{t("cat.suggestTitle", "انشر أكثرَ ما تبيع")}</span>
            <span className="block text-xs text-ink-subtle">
              {suggestState === "error"
                ? t("cat.suggestFailed", "ما وصلنا للسيرفر — اضغط لإعادة المحاولة")
                : t("cat.suggestHint", "نجيب لك الأعلى مبيعاً بآخر ٩٠ يوم — مؤشَّرة، وتشطب الي ما تريده.")}
            </span>
          </span>
        </button>
      )}

      {suggestState === "open" && (
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles size={18} className="shrink-0 text-brand-600" />
            <b className="text-sm font-bold text-ink">{t("cat.suggestTitle", "انشر أكثرَ ما تبيع")}</b>
            <span className="text-xs text-ink-subtle tabular-nums">
              {t("cat.suggestPicked", "{{n}} من {{m}}", { n: formatNum(suggestPick.size), m: formatNum((suggest ?? []).length) })}
            </span>
            <button type="button" onClick={() => { playTap(); setSuggestState("idle"); }} className="ms-auto" aria-label={t("sf.close", "إغلاق")}><X size={16} /></button>
          </div>

          {(suggest ?? []).length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-subtle">
              {t("cat.suggestEmpty", "ما اكو اقتراح — يا إمّا الأعلى مبيعاً منشورٌ أصلاً، يا إمّا بلا سعر أو نافد.")}
            </p>
          ) : (
            <>
              <div className="max-h-80 space-y-1.5 overflow-y-auto">
                {(suggest ?? []).map((r) => (
                  <label key={r.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line p-2 transition hover:bg-surface-2">
                    <input type="checkbox" checked={suggestPick.has(r.id)} disabled={bulkBusy}
                      onChange={(e) => setSuggestPick((prev) => { const n = new Set(prev); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })}
                      className="h-4 w-4 shrink-0 accent-brand-600" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                      {/* الفئةُ تُعرض عمداً: الأدويةُ أوّلُ ما يشطبه الدكتور. */}
                      <span className="block text-2xs text-ink-subtle">
                        {r.category || t("cat.noCategory", "بلا فئة")} · {t("cat.soldQty", "انباع {{n}}", { n: formatNum(Math.round(r.qty_sold)) })}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-bold tabular-nums text-ink">{money(r.sell_price)}</span>
                  </label>
                ))}
              </div>
              <button type="button" disabled={!suggestPick.size || bulkBusy} onClick={() => void publishSuggested()}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-bold text-white transition active:scale-95 disabled:opacity-40">
                {bulkBusy ? <Loader2 size={15} className="animate-spin" /> : <Eye size={15} />}
                {t("cat.suggestPublish", "انشر المؤشَّر ({{n}})", { n: formatNum(suggestPick.size) })}
              </button>
            </>
          )}
        </div>
      )}

      {/* شريطُ النشر الجماعيّ — يظهر بالاختيار وحدَه فلا يزاحم الشاشةَ بلا داعٍ.
          «اختر الكل» يقصد **المعروضَ بالتصفية الحالية** لا الجدولَ كلَّه: من
          صفّى «مخفي» وضغط «انشر» يقصد ما يراه، لا تسعَمئة صنفٍ لا يعرفها. */}
      {list.length > 0 && (
        <div className="card flex flex-wrap items-center gap-2 p-3">
          <button type="button" onClick={() => { playTap(); setPicked(picked.size === list.length ? new Set() : new Set(list.map((p) => p.id))); }}
            className="rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-2">
            {picked.size === list.length && list.length > 0
              ? t("cat.pickNone", "ألغِ الاختيار")
              : t("cat.pickAll", "اختر المعروض ({{n}})", { n: list.length })}
          </button>
          <span className="text-xs text-ink-subtle tabular-nums">
            {picked.size > 0 ? t("cat.picked", "مختار: {{n}}", { n: formatNum(picked.size) }) : t("cat.pickHint", "اختر منتجات لتنشرها دفعةً واحدة")}
          </span>
          <div className="ms-auto flex gap-2">
            <button type="button" disabled={!picked.size || bulkBusy} onClick={() => void bulk(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40">
              {bulkBusy ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
              {t("cat.bulkShow", "انشر المختار")}
            </button>
            <button type="button" disabled={!picked.size || bulkBusy} onClick={() => void bulk(false)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-ink transition active:scale-95 disabled:opacity-40">
              <EyeOff size={14} /> {t("cat.bulkHide", "اخفِ المختار")}
            </button>
          </div>
        </div>
      )}

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
              <div key={p.id} className={cn("card flex flex-wrap items-center gap-3 p-3 transition",
                p.store_visible && "border-brand-300 dark:border-brand-500/40",
                picked.has(p.id) && "ring-2 ring-brand-400")}>
                <input type="checkbox" checked={picked.has(p.id)} disabled={bulkBusy}
                  aria-label={t("cat.pickOne", "اختر {{name}}", { name: p.name })}
                  onChange={(e) => {
                    playTap();
                    setPicked((prev) => { const n = new Set(prev); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; });
                  }}
                  className="h-4 w-4 shrink-0 accent-brand-600" />
                {/* المصغّرةُ نفسُها هي الزرّ: يرى ما عنده ويضغط ليكمّله — بدل رمزِ
                    فئةٍ لا يقول شيئاً عن المنتج ولا يفتح شيئاً. */}
                <button type="button" onClick={() => { playTap(); setPhotoFor(photoFor?.id === p.id ? null : p); }}
                  disabled={busyId === p.id} data-catphoto
                  title={p.image_path ? t("cat.photoEdit", "بدّل صورة المنتج") : t("cat.photoAdd", "أضف صورة للمنتج")}
                  className={cn("group relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border transition active:scale-95",
                    p.image_path ? "border-line" : "border-dashed border-line-strong",
                    photoFor?.id === p.id && "ring-2 ring-brand-400")}>
                  {p.image_path
                    ? <img src={productImageUrl(p.image_path) ?? ""} alt="" className="h-full w-full object-contain p-0.5" onError={(e) => { e.currentTarget.hidden = true; }} />
                    : <span className={cn("flex h-full w-full items-center justify-center text-sm font-bold", shelfLook(p.name).tile, shelfLook(p.name).ink)}>
                        {shelfMonogram(p.name)}
                      </span>}
                  <span className="absolute inset-0 grid place-items-center bg-ink/55 text-white opacity-0 transition group-hover:opacity-100">
                    {p.image_path ? <Camera size={15} /> : <ImagePlus size={15} />}
                  </span>
                </button>
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
                {/* نجمة المختارات (0177) — تظهر فقط للمعروض: مخفيٌّ مميّزٌ تناقض. */}
                {p.store_visible && (
                  <button onClick={() => void toggleFeatured(p)} disabled={busyId === p.id} data-featstar
                    title={p.store_featured ? t("sf.featOff", "شيله من المختارات") : t("sf.featOn", "خلّيه بصفّ المختارات أعلى المتجر")}
                    className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full transition active:scale-95",
                      p.store_featured ? "bg-warn-100 text-warn-700 dark:bg-warn-500/20 dark:text-warn-200" : "border border-line text-ink-subtle hover:bg-surface-2")}>
                    <Sparkles size={15} />
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

                {/* أفعالُ الصورة — شريطٌ يفتح داخل الصفّ نفسه، فلا يضيع مكانُ
                    الدكتور بالقائمة وهو يكمّل صورةً بعد صورة. */}
                {photoFor?.id === p.id && (
                  <div className="flex w-full flex-wrap items-center gap-2 border-t border-line pt-3">
                    <Button type="button" size="sm" variant="secondary" leftIcon={<Camera size={14} />} loading={busyId === p.id}
                      onClick={() => { playTap(); fileRef.current?.click(); }}>
                      {t("pos.photoPick", "صوّر بنفسك أو اختر ملفاً")}
                    </Button>
                    <Button type="button" size="sm" variant="secondary" leftIcon={<Boxes size={14} />}
                      onClick={() => { playTap(); setLibFor(p); }} data-catlib>
                      {t("pos.photoFromLib", "اختر من المكتبة")}
                    </Button>
                    {p.image_path && (
                      <button type="button" className="text-2xs font-bold text-warn-700 hover:underline dark:text-warn-200"
                        onClick={() => void clearPhoto(p)}>{t("pos.photoRemove", "شيل الصورة")}</button>
                    )}
                    <span className="text-2xs text-ink-muted">{t("pos.photoHint", "تنضغط تلقائياً وتظهر ببطاقة متجرك الإلكتروني.")}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <input ref={fileRef} type="file" accept="image/*" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && photoFor) void uploadFor(photoFor, f); e.target.value = ""; }} />
      <ImageLibraryPicker open={!!libFor} onClose={() => setLibFor(null)}
        onPick={(row) => { if (libFor) void pickFromLib(libFor, row.path); }} />
    </div>
  );
}

/* ============================== الإعدادات ============================== */

function SettingsTab({ profile, products, goCatalog, onSaved }: {
  profile: StoreProfile | null | undefined; products: Product[] | null;
  goCatalog: (f: CatFilter) => void;
  onSaved: (p: StoreProfile) => void;
}) {
  const toast = useToast();
  const { t } = useTranslation();
  const [slug, setSlug] = useState(profile?.slug ?? "");
  const [bio, setBio] = useState(profile?.bio ?? "");
  const [fee, setFee] = useState(profile?.delivery_fee ? String(profile.delivery_fee) : "");
  const [minOrder, setMinOrder] = useState(profile?.min_order ? String(profile.min_order) : "");
  const [whatsapp, setWhatsapp] = useState(profile?.whatsapp ?? "");
  const [enabled, setEnabled] = useState(profile?.enabled ?? false);
  /* أعدادُ ما ينقص **المعروضَ** — لا كلَّ المخزن: عيبُ المتجر بما يراه الزبون. */
  const shownAll = (products ?? []).filter((p) => p.store_visible);
  const noPriceCount = shownAll.filter((p) => (p.sell_price ?? 0) <= 0).length;
  const noStockCount = shownAll.filter((p) => p.stock <= 0 && !p.pooled).length;
  const noPhotoShown = shownAll.filter((p) => !p.image_path).length;
  const noDescCount = shownAll.filter((p) => !p.store_desc).length;
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

  const [suggesting, setSuggesting] = useState(false);

  /** اقتراحُ رابطٍ **باسم العيادة** — والعشوائيُّ آخرُ الخيارات لا أوّلُها.
   *
   *  كان الزرُّ يعطي `vet-` + أربعةِ أحرفٍ عشوائية دائماً، ولذلك المتجرُ
   *  الوحيدُ القائم اسمُه `vet-0en2`. والسببُ أعمقُ من كسلِ الزرّ: أسماءُ
   *  العيادات الأربعِ ذواتِ المخزون الحقيقيّ **عربيّةٌ خالصة**، و`normalizeSlug`
   *  تنتج منها `""`. فالرابطُ من الاسم كان **مستحيلاً لا مُهمَلاً**.
   *
   *  ويُفحص توفّرُ كلِّ مرشّحٍ بـ`checkStoreSlug` القائمة — فلا يُقترَح محجوز. */
  const suggest = async () => {
    if (suggesting) return;
    playTap();
    setSuggesting(true);
    try {
      for (const cand of slugCandidates(getClinicName())) {
        try { if (await repo.checkStoreSlug(cand)) { onSlugInput(cand); return; } }
        catch { break; }   // فشلُ الفحص: لا نكمل بحثاً أعمى — ننزل للعشوائيّ
      }
      // كلُّ المرشّحين محجوزٌ أو الاسمُ لا ينتج شيئاً ⇒ العشوائيُّ آخِراً.
      const rand = Math.random().toString(36).replace(/[^a-z0-9]/g, "").slice(0, 4);
      onSlugInput(`vet-${rand}`);
    } finally { setSuggesting(false); }
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
            <Button size="sm" variant="outline" disabled={suggesting} onClick={() => void suggest()} leftIcon={suggesting ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}>{t("cat.suggestSlug", "اقترح")}</Button>
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
              <label className="mb-1 block text-xs font-bold text-ink-muted">أجرة التوصيل ({currencySymbol()})</label>
              {/* كان النصُّ «٠ = مجاني» — و**الواجهةُ العامّةُ تعرض عكسَه**: `feeKnown =
                  fee > 0` فالصفرُ يطلع «يتحدد بالتأكيد». فحقلٌ يكذب على الدكتور
                  بما يراه زبونُه. والمقيسُ يؤيّد المعنى الثاني: ٥٢٣ صفَّ توصيلٍ
                  بلا منطقةٍ مسعَّرة — التسعيرُ بالمكالمة، والأجرةُ تُحسم بالقبول. */}
              <input type="number" inputMode="numeric" min={0} value={fee} onChange={(e) => setFee(e.target.value)}
                placeholder={t("cat.feeZero", "0 = يتحدد عند التأكيد")} className="input" />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-ink-muted">الحد الأدنى للطلب ({currencySymbol()})</label>
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

        {/* جاهزية المتجر — **صادقةٌ بالعدد**، وكلُّ سطرٍ يفتح تصفيتَه.
            كانت ثلاثةَ سطورٍ عامّة تقول «١٣ منتج معروض» وتسكت عن أنّ ثلاثةً
            منها نافدةٌ وواحداً بلا سعرٍ وثلاثةَ عشرَ بلا صورة. «جاهز» بهذا
            المعنى ادّعاءٌ، والدكتورُ يكتشفه من شكوى زبون. */}
        <div className="card space-y-2.5 p-4">
          <p className="font-display text-sm font-bold text-ink">{t("cat.ready", "جاهزية متجرك")}</p>
          <ReadyRow ok={isValidSlug(normalizeSlug(slug))} label={t("cat.readyLink", "رابط مميز محفوظ")} />
          <ReadyRow ok={shownCount > 0}
            label={shownCount > 0 ? t("cat.readyShown", "{{n}} منتج معروض", { n: formatNum(shownCount) }) : t("cat.readyAddProducts", "أضف منتجات للتشكيلة")}
            onGo={() => goCatalog(shownCount > 0 ? "shown" : "hidden")} />
          <ReadyRow ok={enabled} label={t("cat.readyOn", "المتجر مفعّل")} />

          {/* ما ينقص المعروضَ نفسَه — لا يُعرض سطرٌ عن صفر. */}
          {noPriceCount > 0 && (
            <ReadyRow ok={false} warn label={t("cat.readyNoPrice", "{{n}} معروض بلا سعر — ما راح يظهر للزبون", { n: formatNum(noPriceCount) })}
              onGo={() => goCatalog("noprice")} />
          )}
          {noStockCount > 0 && (
            <ReadyRow ok={false} warn label={t("cat.readyNoStock", "{{n}} معروض نافد", { n: formatNum(noStockCount) })}
              onGo={() => goCatalog("nostock")} />
          )}
          {noPhotoShown > 0 && (
            <ReadyRow ok={false} label={t("cat.readyNoPhoto", "{{n}} معروض بلا صورة", { n: formatNum(noPhotoShown) })}
              onGo={() => goCatalog("nophoto")} />
          )}
          {noDescCount > 0 && (
            <ReadyRow ok={false} label={t("cat.readyNoDesc", "{{n}} معروض بلا وصف", { n: formatNum(noDescCount) })}
              onGo={() => goCatalog("nodesc")} />
          )}
          <p className="border-t border-line pt-2 text-2xs leading-relaxed text-ink-subtle">
            الطلب يوصلك «جديد» — ولا ينسحب أي مخزون إلا لما تقبله بنفسك. القبول يولّد فاتورة COD ويرسل الطلب لشاشة التوصيل.
          </p>
        </div>
      </div>
    </div>
  );
}

function SetupStep({ n, done, label, cta, onGo }: { n: number; done: boolean; label: string; cta: string; onGo: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <span className={cn("grid h-6 w-6 shrink-0 place-items-center rounded-full text-2xs font-bold",
        done ? "bg-success-500 text-white" : "bg-brand-600 text-white")}>
        {done ? <Check size={13} /> : formatNum(n)}
      </span>
      <span className={cn("min-w-0 flex-1 text-xs font-semibold", done ? "text-success-700 dark:text-success-200" : "text-ink")}>{label}</span>
      {!done && (
        <button type="button" onClick={() => { playTap(); onGo(); }}
          className="shrink-0 rounded-xl bg-brand-600 px-3 py-1.5 text-2xs font-bold text-white transition active:scale-95">{cta}</button>
      )}
    </div>
  );
}

function ReadyRow({ ok, label, warn, onGo }: { ok: boolean; label: string; warn?: boolean; onGo?: () => void }) {
  const body = (
    <>
      {ok ? <CheckCircle2 size={14} className="shrink-0" />
          : warn ? <AlertTriangle size={14} className="shrink-0" />
          : <span className="grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border-2 border-line-strong" />}
      <span className="min-w-0 flex-1 text-start">{label}</span>
      {onGo && <ExternalLink size={12} className="shrink-0 opacity-50" />}
    </>
  );
  const cls = cn("flex w-full items-center gap-2 text-xs font-semibold",
    ok ? "text-success-600" : warn ? "text-warn-700 dark:text-warn-200" : "text-ink-subtle",
    onGo && "rounded-lg transition hover:bg-surface-2");
  // سطرٌ يقول عدداً ويوصّل إليه: الدكتورُ ما يبحث يدوياً بتسعِمئة صنف.
  return onGo
    ? <button type="button" onClick={() => { playTap(); onGo(); }} className={cls}>{body}</button>
    : <p className={cls}>{body}</p>;
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
