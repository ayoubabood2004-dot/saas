import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import { Store, ShoppingCart, ReceiptText, BarChart3, HandCoins, Bike, PawPrint, ArrowRight, Wallet, RotateCcw, Clock, RefreshCw } from "lucide-react";
import type { Product, Invoice } from "@/types";
import { useAuth } from "@/contexts/AuthContext";
import { useEntitlements } from "@/lib/entitlements";
import { usePermissions } from "@/hooks/usePermissions";
import { useOverride, capLockedFrom } from "@/lib/managerOverride";
import { useNavFolded } from "@/lib/navFold";
import { Skeleton, Button, useToast } from "@/components/ui";
import { cn, formatTime } from "@/lib/utils";
import { withTimeout } from "@/lib/errors";
import { getCached, setCached, isFresh, cachedAt, patchCached } from "@/lib/swrCache";
import { RETURN_STALE_MS, RETRY_AFTER_FAIL_MS, POLL_MS } from "@/lib/freshness";
import { useRevalidateOnReturn } from "@/hooks/useRevalidateOnReturn";
import { patchSellableList, type FreshPatch } from "@/lib/freshSale";
import { loadRetailSnap, retailKey, type RetailSnap } from "@/lib/prefetchData";
import { playTap } from "@/lib/sounds";
import { SaleBuilder, type RetailPrefill } from "@/components/retail/SaleBuilder";
import { bridgeFromParams } from "@/lib/retailBridge";
import { getPosV2, getCashReconcile } from "@/lib/settings";
import { CashReconcile } from "@/components/retail/CashReconcile";
import { InvoicesPanel } from "@/components/retail/InvoicesPanel";
import { DebtsPanel } from "@/components/retail/DebtsPanel";
import { DeliveryPanel } from "@/components/retail/DeliveryPanel";
import { ReportsPanel } from "@/components/retail/ReportsPanel";
import { ReturnsPanel } from "@/components/retail/ReturnsPanel";

type Tab = "sell" | "invoices" | "returns" | "debts" | "delivery" | "reports";


export function RetailSales() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { has } = useEntitlements();
  const { can } = usePermissions();
  const ov = useOverride();
  /* تبويبُ التقارير يعرض إيرادَ اليوم وصافيَ الربح ومبيعاتِ كلِّ موظّف. كان
     ظاهراً بلا شرطٍ أبداً — لموظّف الاستقبال وللجهاز المقفول معاً. */
  const reportsLocked = capLockedFrom(ov.deviceLocked, ov.active, can("viewReports"));
  const navFolded = useNavFolded();
  const clinicId = user?.clinic_id ?? user?.id; // shared workspace id (manager's id for staff)
  const [tab, setTab] = useState<Tab>("sell");

  // Stale-while-revalidate: paint the last snapshot instantly (seeded by the
  // page's own load() or the idle background-warmer — same key + shape).
  const cacheKey = retailKey(clinicId);
  const seed = getCached<RetailSnap>(cacheKey);
  const [products, setProducts] = useState<Product[]>(seed?.products ?? []);
  const [invoices, setInvoices] = useState<Invoice[]>(seed?.invoices ?? []);
  const [loading, setLoading] = useState(!seed);
  /** فشلَ آخرُ تحميل؟ الصندوقُ يقول ذلك بدل أن يعرض رفّاً فارغاً. */
  const [failed, setFailed] = useState(false);

  // The "bridge": an animal record handed us a customer + pet via the URL. Capture it
  // into state (so it survives the URL cleanup + the initial data load), jump to the
  // sell tab, then strip the query string so a refresh/tab-switch won't re-apply it.
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  /* الجسرُ يُقرأ **بأوّل رسم** (retailBridge.ts): قراءتُه بأثرٍ كانت تترك شاشةَ البيع
   * تُرسم مرّةً بلا جسر فتقرأ مسودّةَ الزبون السابق، ثم يهبط الجسرُ فوق سلّته. */
  const bridge0 = useRef(bridgeFromParams(params));
  /** رابطُ الجسر الذي أخذه أوّلُ رسم — أثرُ الرابط ينظّفه ولا يعيد ختمَه (ولو شُغّل
   *  الأثرُ مرّتين بوضع التطوير). */
  const seededKey = useRef<string | null>(bridge0.current ? params.toString() : null);
  const [prefill, setPrefill] = useState<RetailPrefill | null>(() => bridge0.current?.prefill ?? null);
  /* هل نزل الجسرُ على الشاشة؟ يعيش هنا لا بداخلها: تبديلُ تبويبٍ يُزيل شاشةَ البيع
   * ويعيدها (AnimatePresence)، فكان الجسرُ يُعاد ختمُه على سلّةٍ فارغة — تضيع سلّةُ
   * بيعةٍ فُتحت من سجلّ حيوان، ويرجع الزبونُ بعد مسحه. ينزل مرّةً، والمسودّةُ بعدها. */
  const [prefillApplied, setPrefillApplied] = useState(false);
  /* مطابقة الصندوق — خيار تفعيلي من الإعدادات (زر بنهاية كل دوام). */
  const [cashRecOpen, setCashRecOpen] = useState(false);
  // من فتح المبيعات من سجل حيوان؟ نحفظ هويته حتى نرجّعه بضغطة بعد ما ننظّف الرابط.
  const [returnPet, setReturnPet] = useState<{ id: string; name: string } | null>(() => bridge0.current?.returnPet ?? null);
  useEffect(() => {
    const b = bridgeFromParams(params);
    if (!b) { seededKey.current = null; return; }
    if (seededKey.current === params.toString()) {
      // أوّلُ رسمٍ أخذه سلفاً — يبقى تنظيفُ الرابط كي لا يُعاد بتحديثٍ أو تبديل تبويب.
      setParams({}, { replace: true });
      return;
    }
    setPrefillApplied(false);
    setPrefill(b.prefill);
    setTab("sell");
    if (b.returnPet) setReturnPet(b.returnPet);
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params]);

  /* فشلُ جلب الأصناف وحدَه: الأرقامُ ناقصةٌ (رصيدُ المجمَّع ساقط) لا خاطئة —
   * فتُعرض مع شارةٍ تقولها بدل أن يبدو رصيدُ المجمَّع صفراً بثقة. */
  const [sectionsFailed, setSectionsFailed] = useState(false);
  /* ---- طزاجةُ القائمة (خطة الطزاجة، ط١ + ط٣) -----------------------------
   * `snapAt` وقتُ جلب اللقطة المعروضة؛ و`staleFail` «فشل آخرُ تحديثٍ والقائمةُ
   * معروضة» — فتُقال بعمرها وزرِّ تحديثٍ بالمكان، لا بصمت. */
  const [snapAt, setSnapAt] = useState<number | undefined>(() => cachedAt(cacheKey));
  const [staleFail, setStaleFail] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  /** بيعةٌ جارية بـSaleBuilder — لا تُستبدل القائمةُ تحت يد الكاشير. */
  const busyRef = useRef(false);
  /** جلبٌ قائم — ظهورُ التاب وعودةُ النت قد يتزامنان، فلا جلبان معاً. */
  const inflightRef = useRef(0);
  const retryTimer = useRef<number | null>(null);
  /** محاولةٌ تلقائيةٌ **واحدة** لكلّ سلسلةِ فشل — لا حلقةَ تطرق خادماً متعَباً. */
  const retriedRef = useRef(false);
  const mounted = useRef(true);
  /** بدايةُ طلب اللقطة المعروضة. الجلباتُ تتراكب (كلَّ ٥ دقائق، بعد البيعة، الزرّ،
   *  ٣٠ث بعد فشل) وتصل بأيّ ترتيب: جلبٌ بدأ قبل البيعة ووصل بعد جلبها كان يكتب رصيدَ
   *  ما قبل البيعة فوقها **ويُختم طازجاً** — فلا شريطَ ولا سؤالَ ٦٠ ثانية، والكرتُ
   *  يعرض قطعةً بيعت. فالأحدثُ **طلباً** يفوز، والختمُ بوقت الطلب لا الوصول. */
  const shownFrom = useRef<number>(cachedAt(cacheKey) ?? 0);
  /** `true` إن وصلت قائمةٌ طازجة — فزرُّ التحديث يقول ما حصل لا ما يُتمنّى. */
  const load = async (): Promise<boolean> => {
    const startedAt = Date.now();
    inflightRef.current++;
    try {
      const snap = await withTimeout(loadRetailSnap(clinicId), 15000);
      if (!mounted.current) return false;
      if (startedAt < shownFrom.current) return true; // ما بعده وصل — لا يكتب فوقه
      shownFrom.current = startedAt;
      setProducts(snap.products);
      setInvoices(snap.invoices);
      setSectionsFailed(!!snap.sectionsFailed);
      setCached<RetailSnap>(cacheKey, snap, startedAt);
      setSnapAt(startedAt);
      setFailed(false);
      setStaleFail(false);
      retriedRef.current = false;
      // نجاحٌ بأيّ طريق (زرٌّ، عودةُ تاب) يُلغي محاولةً مجدولة — لا جلبَ زائدٌ بعد ٣٠ث.
      if (retryTimer.current != null) { window.clearTimeout(retryTimer.current); retryTimer.current = null; }
      return true;
    } catch {
      // القائمةُ الناقصة أخطرُ من الخطأ الظاهر: الصندوقُ يمسح الباركود فلا يلقاه،
      // فيستنتج البائع أن المادة غير مُدخَلة ويعيد إدخالها — ويصير للمادة رصيدان.
      //
      // لكنّ شاشةَ الفشل تحلّ محلّ شاشة البيع كلِّها. و`load` تُنادى **بعد كلّ
      // بيعة** (onSold)، فتحديثٌ متأخّرٌ على نتٍ ضعيف كان يقتلع إيصالَ البيعة
      // من تحت يد الكاشير وهو يطبعه — والمسودّةُ مُسِحت أصلاً. فما دام بيدنا
      // قائمةٌ صالحة نُبقيها: الخطرُ المقصود أعلاه هو القائمةُ **الفارغة**.
      //
      // **نُبقيها ولا نصمت.** الصمتُ الكامل كان يخفي أن الأرقامَ قديمة: قائمةُ
      // الصبح تُعرض ظهراً والكاشير يصدّق «رصيده صفر» عن مادةٍ على الرفّ، والحلُّ
      // الوحيد الذي يعرفه F5. فالقائمةُ تبقى بعمرها وزرِّ تحديثٍ بالمكان (ط٣).
      if (!mounted.current) return false;
      // فشلُ جلبٍ بدأ قبل المعروض لا يعني شيئاً: ما بعده وصل ناجحاً.
      if (startedAt < shownFrom.current) return false;
      /* وشاشةُ الفشل الكاملة لأوّل تحميلٍ وحده — **لا لقطةَ بيدنا أصلاً**. كان الشرطُ
       * «القائمةُ فارغة»، فعيادةٌ بلا منتجاتٍ (تبيع خدماتٍ وأدوية) يُقتلع إيصالُها أو
       * نافذةُ تسديد دينٍ وسطَ الكتابة لأنّ جلبَ الخلفية (كلَّ ٥ دقائق، عودةُ التاب)
       * تعثّر. لقطةٌ فارغةٌ جاءت من نجاحٍ صادقة؛ فتُقال بعمرها كغيرها. */
      if (cachedAt(cacheKey) == null) setFailed(true);
      else setStaleFail(true);
      scheduleRetry();
      return false;
    } finally {
      inflightRef.current--;
      if (mounted.current) setLoading(false);
    }
  };
  // المؤقّتُ والمستمعون يقرؤون آخرَ نسخةٍ من `load` — لا نسخةَ أوّل رسم.
  const loadRef = useRef(load);
  loadRef.current = load;
  /* محاولةٌ تلقائيةٌ واحدة بعد ٣٠ث من الفشل، والتابُ ظاهر: رعشةُ نتٍ قصيرة تُصلح
   * نفسَها بلا ضغطة. والثانيةُ لا تُجدوَل — الشريطُ وزرُّه وعودةُ التاب تكفي. */
  const scheduleRetry = () => {
    if (retriedRef.current || retryTimer.current != null) return;
    retryTimer.current = window.setTimeout(() => {
      retryTimer.current = null;
      if (!mounted.current || document.visibilityState !== "visible") return;
      /* ولا وسطَ بيعةٍ ولا فوق جلبٍ قائم — كحراسة العودة (ط١) تماماً. كانت المحاولةُ
       * تُطلق أثناء checkout فتقرأ رصيدَ ما قبل البيعة. وما يُفوَّت لا يضيع: إتمامُ
       * البيعة يجلب (`onSold`)، والجلبُ القائمُ يقول نتيجتَه، ولا يُحسب هذا محاولة. */
      if (busyRef.current || inflightRef.current > 0) return;
      retriedRef.current = true;
      void loadRef.current();
    }, RETRY_AFTER_FAIL_MS);
  };
  useEffect(() => {
    mounted.current = true;
    if (!isFresh(cacheKey, 20_000)) void load(); // skip refetch when fresh (< 20s)
    return () => {
      mounted.current = false;
      if (retryTimer.current != null) window.clearTimeout(retryTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ط١: التابُ الراجع يسأل عن عمر قائمته. كان التحديثُ عند الفتح وبعد البيعة
   * وحدهما — فتابٌ مفتوحٌ من الصبح بلا بيع يبيع بقائمة الصبح. */
  useRevalidateOnReturn(() => { void loadRef.current(); }, RETURN_STALE_MS, {
    key: cacheKey,
    isBusy: () => busyRef.current || inflightRef.current > 0,
    // ط٥ (قرار المالك): والتابُ الظاهرُ يُسأل كلَّ ٥ دقائق — كاشيرٌ يحدّق بالشاشة لا «يرجع».
    pollMs: POLL_MS,
  });
  /* والتبويبُ يُقفَل والدفعُ بالطريق: تبديلُه يُزيل شاشةَ البيع (AnimatePresence) قبل أن
   * يعود الجواب، فتقرأ الشاشةُ الجديدة المسودّةَ بمرجعها المعلَّق — ثم يكمل الطلبُ القديم
   * ويمسحها، وتعيد مزامنةُ الرصيد كتابتَها سلّةً «حيّة» بمرجعٍ مستعمَل. */
  const [saleBusy, setSaleBusy] = useState(false);
  const onBusyChange = useCallback((b: boolean) => { busyRef.current = b; setSaleBusy(b); }, []);

  /** التحديثُ بالمكان — من الشريط أو من زرّ رسالة «ما وصلنا الخادم». */
  const refreshNow = useCallback(async () => {
    setRefreshing(true);
    try {
      // ما يُقال إلا ما حصل: الشريطُ يبقى إن فشل، والنجاحُ يُقال بسطر.
      if (await loadRef.current()) toast.success(t("pos.refreshedNow", "القائمة تحدّثت"));
    } finally {
      if (mounted.current) setRefreshing(false);
    }
  }, [t, toast]);

  /** جوابٌ طازجٌ من الخادم (ط٢) يرقّع القائمةَ واللقطةَ — **بلا تجديد عمرها**: صفٌّ
   *  واحدٌ طازج لا يجعل بقيّةَ القائمة طازجة. والصفُّ يدخل **برصيد الكاشير** (الصفُّ +
   *  حوضُ قسمه) كبقيّة القائمة: الخامُّ وحده كان يكتب على الكرت رقماً أدنى من المبيع.
   *  والصفُّ الغائب يُرفع، والمطويُّ يحلّ محلَّه باقيه. */
  const patchRow = useCallback((patch: FreshPatch) => {
    setProducts((list) => patchSellableList(list, patch));
    patchCached<RetailSnap>(cacheKey, (s) => ({ ...s, products: patchSellableList(s.products, patch) }));
  }, [cacheKey]);

  // The debts ledger is a super-plan feature (البيع بالدين) — hidden otherwise.
  const TABS: { id: Tab; label: string; icon: typeof Store }[] = [
    { id: "sell", label: t("retail.newSaleTab", "New sale"), icon: ShoppingCart },
    { id: "invoices", label: t("retail.invoicesTab", "Invoices"), icon: ReceiptText },
    { id: "returns", label: t("retail.returnsTab", "المرتجع"), icon: RotateCcw },
    ...(has("debt") ? [{ id: "debts" as Tab, label: t("retail.debtsTab", "سجل الديون"), icon: HandCoins }] : []),
    ...(has("debt") ? [{ id: "delivery" as Tab, label: t("retail.deliveryTab", "التوصيل"), icon: Bike }] : []),
    ...(reportsLocked ? [] : [{ id: "reports" as Tab, label: t("retail.reportsTab", "Reports"), icon: BarChart3 }]),
  ];

  /* يقفل الجهازُ والتقاريرُ مفتوحةٌ أمامه: التبويبُ يختفي من الشريط، والمحتوى
     لازم يختفي معه — وإلا بقيت اللوحةُ مرسومةً بلا تبويبٍ يوصل إليها. */
  useEffect(() => {
    if (tab === "reports" && reportsLocked) setTab("sell");
  }, [tab, reportsLocked]);

  // شاشة البيع الجديدة تختصر ترويسة الصفحة أثناء البيع: كل بكسل فوق شبكة
  // المنتجات يُدفع من رصيد الكاشير. الشرح يبقى بالتبويبات الأخرى.
  const compactChrome = getPosV2() && tab === "sell";
  // وضع التركيز: طيّ الشريط بلا رفع سقف العرض (1152px) يعطي صفراً على شاشة
  // المكتب — المساحة المتحرّرة تُهدر بهامشين. فالسقف يُرفع مع الطيّ، بشاشة
  // البيع وحدها: بقية التبويبات جداولٌ يؤذيها العرض اللانهائي.
  const wideSell = compactChrome && navFolded;

  return (
    <div className={cn("mx-auto px-4", wideSell ? "max-w-none" : "max-w-6xl",
      // شاشة البيع تلغي فسحة شريط التنقّل السفلي (pb-20 بالهيكل): لا شيء
      // يشغلها هنا، وكانت تسرق ٨٠px من ارتفاع السلة على الأجهزة اللوحية.
      compactChrome ? "py-3 -mb-20 lg:mb-0" : "py-6")}>
      <div className={cn("flex items-center gap-3", compactChrome ? "mb-2.5" : "mb-5")}>
        <span className={cn("grid place-items-center rounded-2xl bg-brand-grad text-white shadow-soft", compactChrome ? "h-9 w-9" : "h-11 w-11")}><Store size={compactChrome ? 19 : 24} /></span>
        <div>
          <h1 className={cn("font-display font-extrabold text-ink", compactChrome ? "text-lg" : "text-2xl")}>{t("retail.title", "Retail & Sales")}</h1>
          {!compactChrome && <p className="text-sm text-ink-subtle">{t("retail.subtitle", "Walk-in sales, invoicing & receipts — for this clinic only.")}</p>}
        </div>
        {getCashReconcile() && (
          <button
            type="button"
            data-cashrec-open
            onClick={() => { playTap(); setCashRecOpen(true); }}
            className={cn("inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-extrabold text-emerald-700 transition hover:bg-emerald-100 active:scale-95 dark:border-emerald-500/40 dark:bg-emerald-500/15 dark:text-emerald-300", returnPet ? "" : "ms-auto")}
          >
            <Wallet size={15} /> {t("cashrec.openBtn", "مطابقة الصندوق")}
          </button>
        )}
        {returnPet && (
          <button
            type="button"
            onClick={() => { playTap(); navigate(`/pet/${returnPet.id}`); }}
            className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-brand-300 bg-brand-50 px-3.5 py-2 text-xs font-extrabold text-brand-700 transition hover:bg-brand-100 active:scale-95 dark:border-brand-500/40 dark:bg-brand-500/15 dark:text-brand-300"
            title={`رجوع لسجل ${returnPet.name || "الحالة"}`}
          >
            <PawPrint size={15} /> رجوع لسجل {returnPet.name || "الحالة"}
            <ArrowRight size={15} className="rtl:rotate-180" />
          </button>
        )}
      </div>

      <div className={cn("flex gap-1 rounded-2xl border border-line bg-surface-1 p-1", compactChrome ? "mb-2.5" : "mb-4")}>
        {TABS.map(({ id, label, icon: Icon }) => (
          <button key={id} onClick={() => { playTap(); setTab(id); }} disabled={saleBusy && id !== tab} data-tablocked={saleBusy && id !== tab ? "" : undefined}
            className={cn("flex flex-1 items-center justify-center gap-2 rounded-xl px-3 text-sm font-semibold transition disabled:cursor-wait disabled:opacity-40", compactChrome ? "py-1.5" : "py-2.5",
              tab === id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
            <Icon size={16} /> {label}
          </button>
        ))}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.18 }}>
          {loading ? (
            <div className="grid gap-4 lg:grid-cols-[1fr,380px]">
              <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-2xl" />)}</div>
              <Skeleton className="h-80 rounded-2xl" />
            </div>
          ) : failed ? (
            /* يحلّ محلّ التبويب كلّه — فلا يُعرض فشلُ التحميل كرفٍّ فارغ. */
            <div className="card space-y-4 p-10 text-center">
              <p className="mx-auto max-w-md text-ink-subtle">{t("pos.loadFailed", "تعذّر تحميل المخزن. المشكلة بالاتصال ولا شيء ضاع — أعد المحاولة قبل أن تضيف أي مادة.")}</p>
              <Button leftIcon={<RotateCcw size={16} />} onClick={() => { playTap(); setLoading(true); void load(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
            </div>
          ) : (
            <>
              {staleFail && tab !== "reports" && (
                /* ط٣: فشلُ التحديث فوق قائمةٍ معروضة يُقال — بعمرها وزرٍّ بالمكان.
                   كان يُبلَع بصمتٍ متعمَّد، فقائمةُ الصبح تُعرض ظهراً ولا أحدَ
                   يعرف، والعلاجُ الوحيد المعروف F5 يمسح السلّة. **وبكلّ تبويبٍ
                   يعرض اللقطةَ نفسها**: الديونُ والتوصيلُ والمرتجعُ والفواتير تُبنى
                   منها، وكان الشريطُ بالبيع وحده — فيُقال لزبونٍ دينُه قبل تسديده. */
                <div className="mb-3 flex items-center gap-2 rounded-xl border border-warn-200 bg-warn-50 px-3 py-1.5 text-xs font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-stalestrip>
                  <Clock size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    {t("pos.staleStrip", "المعروض من {{time}} — تعذّر التحديث", { time: snapAt ? formatTime(new Date(snapAt).toISOString(), i18n.language) : "—" })}
                  </span>
                  <Button size="sm" variant="secondary" data-stalerefresh loading={refreshing} leftIcon={<RefreshCw size={14} />} onClick={() => { playTap(); void refreshNow(); }}>
                    {t("pos.refreshNow", "حدّث")}
                  </Button>
                </div>
              )}
              {tab === "sell" ? (
                <>
                  {sectionsFailed && (
                    /* أرقامٌ ناقصة تُقال ناقصة: رصيدُ المخزون المجمَّع ساقطٌ من الحساب،
                       فيبدو المتاحُ أقلَّ من الحقيقة وسقفُ السلّة أدنى. */
                    <div className="mb-3 rounded-xl border border-warn-200 bg-warn-50 px-3 py-2 text-xs font-semibold text-warn-800 dark:border-warn-500/30 dark:bg-warn-500/10 dark:text-warn-200" data-sectionsfailed>
                      {t("pos.pooledStockFailed", "تعذّر جلب المخزون المجمّع — أرقام الرصيد ناقصة. أعد التحميل قبل ما تعتمد عليها.")}
                    </div>
                  )}
                  <SaleBuilder products={products} clinicId={clinicId} onSold={load} prefill={prefill}
                    onFreshRow={patchRow} onRefresh={() => void refreshNow()} onBusyChange={onBusyChange}
                    prefillApplied={prefillApplied} onPrefillApplied={() => setPrefillApplied(true)}
                    onCustomerCleared={() => { setPrefill(null); setPrefillApplied(false); setReturnPet(null); }} />
                </>
              ) : tab === "invoices" ? (
                <InvoicesPanel invoices={invoices} clinicId={clinicId} onChanged={load} />
              ) : tab === "returns" ? (
                <ReturnsPanel invoices={invoices} onChanged={load} />
              ) : tab === "debts" ? (
                <DebtsPanel invoices={invoices} clinicId={clinicId} onChanged={load} onOpenDelivery={() => setTab("delivery")} />
              ) : tab === "delivery" ? (
                <DeliveryPanel invoices={invoices} clinicId={clinicId} onChanged={load} />
              ) : tab === "reports" && !reportsLocked ? (
                <ReportsPanel />
              ) : (
                /* الفرعُ الأخير كان `<ReportsPanel />` بلا شرط: أيُّ قيمةِ تبويبٍ
                   لا تطابق ما سبق ترسم التقارير. فصار صريحاً — ولا شيءَ يسقط عليها. */
                <SaleBuilder products={products} clinicId={clinicId} onSold={load} prefill={prefill}
                  onFreshRow={patchRow} onRefresh={() => void refreshNow()} onBusyChange={onBusyChange}
                    prefillApplied={prefillApplied} onPrefillApplied={() => setPrefillApplied(true)}
                    onCustomerCleared={() => { setPrefill(null); setPrefillApplied(false); setReturnPet(null); }} />
              )}
            </>
          )}
        </motion.div>
      </AnimatePresence>

      <CashReconcile open={cashRecOpen} onClose={() => setCashRecOpen(false)} />
    </div>
  );
}
