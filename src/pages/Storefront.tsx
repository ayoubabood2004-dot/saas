// ============================================================================
// الستور العام — /s/:slug — الصفحة الي يفتحها الزبون من رابط البايو.
//
// صفحة قائمة بذاتها بلا أي تسجيل: هوية العيادة + كاتلوج المنتجات المنشورة +
// سلة حية + إتمام طلب كضيف (اسم/هاتف/عنوان) — دفع عند الاستلام حصراً.
// كل البيانات توصل عبر دوال RPC العامة الآمنة (0095): أعمدة عرض منتقاة،
// أسعار من القاعدة، ومضاد إغراق بالسيرفر. حقل honeypot مخفي يصطاد البوتات
// الغبية قبل ما توصل للسيرفر أصلاً.
//
// موبايل أولاً — زوار البايو كلهم من التلفون.
// ============================================================================
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AnimatePresence, motion } from "framer-motion";
import {
  ShoppingCart, Plus, Minus, Search, MapPin, Phone, MessageCircle, X,
  CheckCircle2, PawPrint, Truck, ShieldCheck, Store, ArrowRight, ArrowLeft, Loader2, PackageX,
} from "lucide-react";
import type { StoreCatalogItem, StoreFrontInfo } from "@/types";
import { repo } from "@/lib/repo";
import { categoryLook, isValidCustomerPhone, productImageUrl, shelfLook, shelfLabel } from "@/lib/storeLib";
import { preferArabicForVisitor } from "@/lib/portal";
import { waNumber } from "@/lib/phone";
import { celebrate } from "@/lib/celebrate";
import { playTap, playSuccess, playWarning, playAchievement } from "@/lib/sounds";
import { cn, money, formatNum, searchable } from "@/lib/utils";

interface CartLine { id: string; qty: number }

const cartKey = (slug: string) => `vp_store_cart_${slug}`;
function loadCart(slug: string): CartLine[] {
  try { const raw = localStorage.getItem(cartKey(slug)); if (raw) return (JSON.parse(raw) as CartLine[]).filter((l) => l.qty > 0); } catch { /* ignore */ }
  return [];
}
function saveCart(slug: string, cart: CartLine[]) {
  try { cart.length ? localStorage.setItem(cartKey(slug), JSON.stringify(cart)) : localStorage.removeItem(cartKey(slug)); } catch { /* ignore */ }
}

/** رسائل أخطاء السيرفر → عربي إنساني. */
const ERROR_MSG: Record<string, string> = {
  closed: "المتجر مغلق حالياً.",
  bad_name: "اكتب اسمك الكامل (حرفين على الأقل).",
  bad_phone: "رقم الهاتف غير صحيح — تأكد منه.",
  bad_input: "في حقل طويل زيادة عن اللازم.",
  bad_items: "صار تغيير بالمنتجات — حدّث الصفحة وجرب من جديد.",
  rate_limited: "وصلت الحد الأقصى للطلبات اليوم — تواصل مع العيادة مباشرة.",
  min_order: "طلبك أقل من الحد الأدنى للمتجر.",
};

export function Storefront() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "closed" | "error" | "open">("loading");
  /** إعادة محاولة التحميل الأول: يزيد فيعيد تشغيل مؤثّر الجلب. */
  const [tries, setTries] = useState(0);
  const [front, setFront] = useState<StoreFrontInfo | null>(null);
  const [catalog, setCatalog] = useState<StoreCatalogItem[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>(() => loadCart(slug));
  const [sheet, setSheet] = useState<"none" | "cart" | "checkout">("none");
  /** ورقة تفاصيل منتج (المرحلة ٣): صورة كبيرة ووصف كامل وعدّاد كمية. */
  const [detail, setDetail] = useState<StoreCatalogItem | null>(null);
  const [sort, setSort] = useState<"default" | "priceAsc" | "priceDesc">("default");
  const [placed, setPlaced] = useState<{ order_no: string; total: number } | null>(null);
  // الكاتلوج يتحمّل بصفحات (٦٠ بالطلب): أول رسم خفيف على موبايل بطيء،
  // و«عرض المزيد» يجيب الباقي. hasMore = آخر صفحة رجعت ممتلئة.
  /* أوّلُ صفحةٍ أخفُّ (٢٤) لأن الزائرَ يدفع بايتاتِها قبل أن يرى منتجاً، ثمّ
   * صفحاتٌ أكبر لمن يكمّل — فالكلفةُ على من طلبها لا على كلّ من فتح الرابط. */
  const PAGE = 24;
  const PAGE_MORE = 60;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  /** فشلَ جلبُ صفحةٍ تالية؟ — كان يُخفي الزرَّ نهائياً فتبدو التشكيلةُ منتهية. */
  const [moreFailed, setMoreFailed] = useState(false);

  /* لغةُ الزائر: هذه الصفحة عربيةٌ صلبةٌ عمداً (زبائنُ عيادةٍ عراقية)، فلو
   * بقيت لغةُ الواجهة على الإنكليزية الافتراضية لظهر كلُّ نصٍّ يمرّ من `t(`
   * إنكليزياً وسط صفحةٍ عربية — وهذا ما حصل فعلاً لزرّ «شوف حيواناتي». */
  useEffect(() => { preferArabicForVisitor(); }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [f, c] = await Promise.all([repo.storeFrontPublic(slug), repo.storeCatalogPublic(slug, PAGE, 0)]);
        if (!alive) return;
        if (!f) { setState("closed"); return; }
        setFront(f); setCatalog(c); setHasMore(c.length === PAGE); setState("open");
        document.title = `${f.name} — المتجر`;
      } catch {
        /* فشلُ الجلب غير «المتجر مسكّر»: شاشةُ «مغلق» على خطأ شبكةٍ عابر تكذب
         * على الزبون فيصدّق ويروح — القاعدة: خطأٌ ظاهر و«أعد المحاولة». */
        if (alive) setState("error");
      }
    })();
    return () => { alive = false; };
  }, [slug, tries]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await repo.storeCatalogPublic(slug, PAGE_MORE, catalog.length);
      // إزالة أي تكرار دفاعياً (منتج انضاف بين الصفحتين يزحزح الترتيب).
      setCatalog((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...more.filter((x) => !seen.has(x.id))];
      });
      /* التقدّمُ بما **وصل** لا بما طُلب — نفسُ درس `allPages`: صفحةٌ ناقصة عن
       * سقفٍ خادميٍّ أقلَّ من PAGE كانت تُقرأ «انتهت التشكيلة». */
      setHasMore(more.length > 0);
      setMoreFailed(false);
    } catch {
      // إخفاءُ الزرّ يجعل الفشلَ يبدو نهايةَ التشكيلة — نُبقيه ونقول «تعذّر».
      setMoreFailed(true);
    }
    finally { setLoadingMore(false); }
  };

  /* بحثٌ فوق كتالوجٍ جزئيّ يحكم «ما لكينا شيء» على ما حُمّل وحده. فقبل إعلان
   * الخيبة نُنزل بقيةَ الصفحات — لا حكمَ نهائياً فوق قائمةٍ ناقصة. */
  const searching = q.trim().length > 0;
  useEffect(() => {
    if (!searching || !hasMore || loadingMore || moreFailed) return;
    void loadMore();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, hasMore, loadingMore, moreFailed]);

  useEffect(() => { saveCart(slug, cart); }, [slug, cart]);

  const byId = useMemo(() => new Map(catalog.map((c) => [c.id, c])), [catalog]);
  // سلة محفوظة من زيارة سابقة: نظّفها من أي منتج انسحب من الكاتلوج.
  useEffect(() => {
    if (state !== "open") return;
    setCart((c) => c.filter((l) => byId.get(l.id)?.available));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const cats = useMemo(() => {
    const seen = new Set<string>();
    for (const c of catalog) seen.add(c.category ?? "other");
    return Array.from(seen);
  }, [catalog]);

  const shown = useMemo(() => {
    /* الطرفان يمرّان من `searchable`: من يكتب «ادويه» يلقى «أدوية»، ومن يكتب
     * «٢٤٧» يلقى «247». تطبيعُ طرفٍ واحد أسوأ من لا تطبيع — يفشل بصمتٍ ويبدو
     * أنه يعمل، فيرى الزبونُ «ما لكينا» عن بضاعةٍ على الرفّ ويصدّقها. */
    const ql = searchable(q);
    const list = catalog.filter((c) =>
      (cat === "all" || (c.category ?? "other") === cat) &&
      (!ql || searchable(c.name).includes(ql) || searchable(c.subcategory).includes(ql) || searchable(c.descr).includes(ql)));
    /* ترتيبٌ واحدٌ يحكم الشبكة كلَّها:
     *   • النافدُ آخِراً **دائماً** — يبقى ظاهراً (إخفاؤه يجعل التشكيلة تبدو
     *     أصغر ويدفع الزبونَ يدوّر على شيءٍ رآه أمس) لكنه لا يتصدّر الرفّ.
     *   • والمختارُ أوّلاً حين لا بحثَ ولا فئةَ ولا فرزَ سعر — فبحثُ الزبون
     *     أولى من تسويقنا. */
    const rank = (x: StoreCatalogItem) => (x.available ? 0 : 1);
    const arr = [...list];
    if (sort === "priceAsc") arr.sort((a, b) => rank(a) - rank(b) || a.price - b.price);
    else if (sort === "priceDesc") arr.sort((a, b) => rank(a) - rank(b) || b.price - a.price);
    else arr.sort((a, b) => rank(a) - rank(b) || Number(!!b.featured) - Number(!!a.featured));
    return arr;
  }, [catalog, q, cat, sort]);

  /** مختارات العيادة (0177): تظهر أعلى الكتلوج بلا بحثٍ ولا فئةٍ منتقاة —
   *  بحثُ الزبون أولى من تسويقنا. */
  const qtyOf = (id: string) => cart.find((l) => l.id === id)?.qty ?? 0;
  const setQty = (id: string, qty: number) => {
    setCart((c) => {
      const next = qty <= 0 ? c.filter((l) => l.id !== id) : c.some((l) => l.id === id) ? c.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, 99) } : l)) : [...c, { id, qty: Math.min(qty, 99) }];
      return next;
    });
  };
  const add = (id: string) => { playTap(); setQty(id, qtyOf(id) + 1); };

  const units = cart.reduce((s, l) => s + l.qty, 0);
  const subtotal = Math.round(cart.reduce((s, l) => s + (byId.get(l.id)?.price ?? 0) * l.qty, 0) * 100) / 100;
  const fee = front?.delivery_fee ?? 0;
  /* أجرةُ صفرٍ عندنا تعني «ما تحدّدت» لا «مجّانية» (الهيرو يقولها منذ البداية).
   * فمصدرٌ واحدٌ لهذا المعنى يقرؤه الهيرو والسلة والإتمام — وإلا تناقضت الشاشات. */
  const feeKnown = fee > 0;
  const total = Math.round((subtotal + fee) * 100) / 100;
  const minOrder = front?.min_order ?? 0;
  const underMin = minOrder > 0 && subtotal < minOrder;

  /* ------------------------------ الحالات ------------------------------ */
  if (state === "loading") {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface">
        <div className="flex flex-col items-center gap-3 text-ink-subtle">
          <Loader2 size={30} className="animate-spin text-brand-600" />
          <p className="text-sm font-semibold">يفتح المتجر…</p>
        </div>
      </div>
    );
  }
  if (state === "error") {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center" data-storeloadfailed>
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-warn-100 text-warn-700 dark:bg-warn-500/10 dark:text-warn-300"><Store size={30} /></span>
          <h1 className="font-display text-xl font-bold text-ink">{t("sf.loadFailedTitle")}</h1>
          <p className="text-sm leading-relaxed text-ink-subtle">{t("sf.loadFailedBody")}</p>
          <button type="button" onClick={() => { setState("loading"); setTries((n) => n + 1); }}
            className="mt-2 rounded-2xl bg-brand-600 px-6 py-2.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700">
            {t("sf.retry")}
          </button>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle"><PawPrint size={14} /> doctorVet</p>
        </div>
      </div>
    );
  }
  if (state === "closed" || !front) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-surface-2 text-ink-subtle"><Store size={30} /></span>
          <h1 className="font-display text-xl font-bold text-ink">المتجر مغلق حالياً</h1>
          <p className="text-sm leading-relaxed text-ink-subtle">الرابط غير صحيح أو العيادة موقفة متجرها مؤقتاً. تأكد من الرابط أو ارجع بعدين.</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-ink-subtle"><PawPrint size={14} /> doctorVet</p>
        </div>
      </div>
    );
  }

  /* ---------------------------- نجاح الطلب ---------------------------- */
  if (placed) {
    const waMsg = `مرحباً 👋 أرسلت طلباً من متجركم — رقم الطلب ${placed.order_no}`;
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface p-6">
        <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="flex w-full max-w-sm flex-col items-center gap-4 text-center">
          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", delay: 0.15 }}
            className="grid h-20 w-20 place-items-center rounded-full bg-success-500 text-white shadow-raised">
            <CheckCircle2 size={44} />
          </motion.span>
          <h1 className="font-display text-2xl font-bold text-ink">وصل طلبك! 🎉</h1>
          <div className="w-full rounded-2xl border border-line bg-surface-1 p-4">
            <p className="text-xs text-ink-subtle">رقم طلبك</p>
            <p className="font-mono text-2xl font-bold tracking-wider text-brand-600">{placed.order_no}</p>
            <p className="mt-2 border-t border-line pt-2 text-sm font-bold text-ink">{money(placed.total)} <span className="text-xs font-normal text-ink-subtle">— الدفع عند الاستلام</span></p>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">{front.name} راح تأكد طلبك وتتواصل وياك قريباً. احتفظ برقم الطلب.</p>
          <a href={`/s/${slug}/track?no=${encodeURIComponent(placed.order_no)}`} data-tracklink
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-brand-300 bg-surface-1 px-4 py-3 text-sm font-bold text-brand-700 transition active:scale-[0.98] dark:border-brand-500/40 dark:text-brand-300">
            <Search size={16} /> {t("track.title", "تتبّع طلبك")}
          </a>
          {front.whatsapp && (
            <a href={`https://wa.me/${waNumber(front.whatsapp, "+964")}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-bold text-white transition active:scale-[0.98]">
              <MessageCircle size={17} /> راسل العيادة بالواتساب
            </a>
          )}
          <button onClick={() => { playTap(); setPlaced(null); }} className="flex items-center gap-1.5 text-sm font-bold text-brand-600">
            <ArrowRight size={15} /> رجوع للمتجر
          </button>
          <p className="mt-3 flex items-center gap-1.5 text-2xs text-ink-subtle"><PawPrint size={12} /> متجر مقدَّم من doctorVet</p>
        </motion.div>
      </div>
    );
  }

  /* ------------------------------ المتجر ------------------------------ */
  return (
    <div dir="rtl" className="min-h-screen bg-surface pb-28">
      {/* الهيرو */}
      {/* الهويّةُ شريطٌ لا لافتة. المقيس قبلَ هذا: هيرو ٣٠٩ بكسل + لاصقٌ ١٠٩ +
          صفُّ مختارات ١٩٤ ⇒ أوّلُ بطاقةٍ عند y=644 بشاشةٍ ارتفاعُها ٨٤٤ — أي
          متجرٌ يفتحه الزبون فلا يرى بضاعةً حتى يمرّر. وأُسقط التدرّجُ بثلاث
          محطاتٍ ودائرتا الزجاج فوقه: أشهرُ توقيعٍ لقالبٍ مجّانيّ، ولا يُستبدل
          بزخرفةٍ أخرى بل بلونٍ واحدٍ هادئ يترك البضاعةَ هي البطل. */}
      <header className="bg-brand-700 px-4 pb-3 pt-4 text-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          {front.logo_url
            ? <img src={front.logo_url} alt="" width={80} height={80} className="h-11 w-11 shrink-0 rounded-xl bg-white object-contain p-0.5" />
            : <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/15"><PawPrint size={22} /></span>}
          <div className="min-w-0 flex-1">
            {/* اسمٌ بسطرين لا `truncate`: «عيادة الرحمة البيطرية» على ٣٦٠ بكسل
                بعد اللوغو وزرَّي الاتصال لا تسع سطراً واحداً. */}
            <h1 className="line-clamp-2 font-display text-lg font-bold leading-tight">{front.name}</h1>
          </div>
          <span className="flex shrink-0 items-center gap-1.5">
            {front.whatsapp && (
              <a href={`https://wa.me/${waNumber(front.whatsapp, "+964")}`} target="_blank" rel="noreferrer" aria-label="واتساب"
                className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25"><MessageCircle size={17} /></a>
            )}
            {front.phone && (
              <a href={`tel:${front.phone}`} aria-label="اتصال" className="grid h-10 w-10 place-items-center rounded-xl bg-white/15 transition hover:bg-white/25"><Phone size={17} /></a>
            )}
          </span>
        </div>
        {/* سطرُ الطمأنينة: ثلاثُ حقائقَ يحتاجها زبونُ الدفع عند الاستلام، بسطرٍ
            واحدٍ لا شاراتٍ تلتفّ سطرين وتكسر محاذاةَ أزرار الاتصال. */}
        <div className="mx-auto mt-2.5 flex max-w-3xl items-center gap-3 border-t border-white/15 pt-2 text-xs">
          <span className="flex items-center gap-1"><ShieldCheck size={13} /> {t("sf.cod", "الدفع عند الاستلام")}</span>
          <span className="flex items-center gap-1"><Truck size={13} /> {feeKnown ? money(fee) : t("sf.tbd", "يتحدد بالتأكيد")}</span>
          {minOrder > 0 && <span className="text-white/80">{t("sf.minOrder", "الحد الأدنى")} {money(minOrder)}</span>}
        </div>

        {/* بابُ المالك (0154): الرابطُ العام نفسه يوصله لملفّ حيوانه — لا رابطَ
            ثانٍ تدزّه العيادة، ولا حسابَ يُنشأ. زرٌّ واحد بأعلى الصفحة. */}
        {/* بابُ المالك يبقى — لكن بسطرٍ واحدٍ لا بطاقةً بارتفاع ٦٠: هذه صفحةُ
            شراءٍ قبل كلّ شيء. والسهمُ يشير **يساراً** لأنه تقدّمٌ لا رجوع (وبالعربية
            القراءةُ من اليمين، فسهمُ الرجوع يمينٌ وسهمُ التقدّم يسار). */}
        <Link to={`/p/${slug}`} onClick={() => playTap()}
          className="mx-auto mt-2 flex max-w-3xl items-center gap-2 text-xs font-semibold text-white/90 transition hover:text-white">
          <PawPrint size={14} className="shrink-0" />
          <span>{t("portal.cta", "شوف حيواناتي")}</span>
          <ArrowLeft size={14} className="shrink-0" />
        </Link>
      </header>

      {/* البحث والتصنيفات — لاصقة */}
      <div className="sticky top-0 z-20 border-b border-line bg-surface/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto max-w-3xl space-y-2.5">
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute end-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر على منتج…"
              className="w-full rounded-2xl border border-line bg-surface-1 py-2.5 pe-9 ps-4 text-sm text-ink outline-none transition focus:border-brand-400" />
          </div>
          {cats.length > 1 && (
            /* الفرزُ خرج من حاوية التمرير: كان بـ`ms-auto` **داخلها** وشريطُ
               التمرير مخفيّ، فقِيس عند x=−210 — عنصرُ تحكّمٍ لا يعرف أحدٌ بوجوده
               غيرُ موجود. صار سطراً مستقلاً يظهر حين يستحقّ الكتلوجُ فرزاً. */
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <CatChip active={cat === "all"} onClick={() => { playTap(); setCat("all"); }} label={t("sf.all", "الكل")} />
              {cats.map((c) => {
                const look = categoryLook(c);
                return <CatChip key={c} active={cat === c} onClick={() => { playTap(); setCat(c); }} label={look.label} />;
              })}
            </div>
          )}
          {catalog.length > 8 && (
            <div className="flex items-center justify-between gap-2 text-2xs">
              <span className="font-semibold text-ink-muted">{formatNum(shown.length)} {t("sf.results", "منتج")}</span>
              <select value={sort} onChange={(e) => { playTap(); setSort(e.target.value as typeof sort); }} data-storesort
                aria-label={t("sf.sortDefault", "الترتيب المعتاد")}
                className="shrink-0 rounded-lg border border-line bg-surface-1 px-2 py-1 text-2xs font-semibold text-ink-muted outline-none">
                <option value="default">{t("sf.sortDefault", "الترتيب المعتاد")}</option>
                <option value="priceAsc">{t("sf.sortCheap", "الأرخص أولاً")}</option>
                <option value="priceDesc">{t("sf.sortExp", "الأغلى أولاً")}</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* الكاتلوج */}
      <main className="mx-auto max-w-3xl px-4 py-4">
        {/* صفُّ «مختاراتنا» المنفصل أُلغي: مقيسٌ أن كلَّ مختارٍ يظهر مرّتين
            (٣ من ٣ بتجربةٍ حيّة) بثمنِ ١٩٤ بكسل تدفع أوّلَ منتجٍ خارجَ الشاشة.
            الميزةُ نفسُها بقيت — المختارُ يتصدّر الشبكةَ بشارةٍ داخلها. */}
        {catalog.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle">
            <PackageX size={30} className="opacity-40" />
            <p className="text-sm font-semibold">المتجر يرتّب رفوفه — ارجع قريباً 🐾</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle">
            <Search size={26} className="opacity-40" />
            {/* «ما لكينا» لا تُقال قبل أن تكتمل التشكيلة — ولا تُقال أبداً عن فشلِ جلب. */}
            <p className="text-sm font-semibold">
              {moreFailed ? "تعذّر تحميل بقية التشكيلة — أعد المحاولة" : hasMore || loadingMore ? "نكمّل التشكيلة…" : "ما لكينا شيء مطابق"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((p, i) => {
              const shelf = shelfLook(p.name);
              const hasImg = !!productImageUrl(p.image_path);
              const inCart = qtyOf(p.id);
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-surface-1 transition",
                    inCart > 0 ? "border-brand-400 shadow-raised" : "border-line",
                    !p.available && "opacity-60")}>
                  {/* الصورة فوق رمز الفئة لا بدلَه: فشلُ تحميلها (ملفٌ حُذف، شبكةٌ
                      ضعيفة) يخفيها بـhidden فيبقى الرمزُ تحتها — بطاقةٌ ما تصير فارغة.
                      والضغطة تفتح ورقة التفاصيل (صورة أكبر + الوصف كاملاً). */}
                  {/* نسبةٌ واحدة صارمة بدل ارتفاعٍ ثابت ٩٦ بكسل: بطاقةٌ عرضُها ١٧٣
                      وصورةٌ ٩٦ = ١٫٨:١ مع قصٍّ يقطع رأسَ العلبة وقاعَها — وباسمِ
                      الشركة يعرف الزبونُ المنتج. و`object-contain` فلا يُقصّ شيء. */}
                  <div role="button" tabIndex={0} onClick={() => { playTap(); setDetail(p); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { playTap(); setDetail(p); } }}
                    className={cn("relative grid aspect-square cursor-pointer place-items-center overflow-hidden",
                      hasImg ? "bg-surface-2" : shelf.tile)}>
                    {!hasImg && (
                      <span className={cn("px-2 text-center font-display text-base font-bold leading-tight", shelf.ink)}>
                        {shelfLabel(p.name)}
                      </span>
                    )}
                    {productImageUrl(p.image_path) && (
                      /* تكسيلُ ما هو فوق الطيّة يؤخّر أثقلَ عنصرٍ بالرسم (LCP)
                         بلا أن يوفّر شيئاً — الزائرُ يراه بلا تمرير. */
                      <img src={productImageUrl(p.image_path) as string} alt="" width={400} height={400}
                        loading={i < 4 ? "eager" : "lazy"} fetchPriority={i < 4 ? "high" : undefined}
                        className="absolute inset-0 h-full w-full object-contain p-1.5"
                        onError={(e) => { e.currentTarget.hidden = true; }} />
                    )}
                  </div>
                  {!p.available ? (
                    <span className="absolute start-2 top-2 rounded-lg bg-ink/75 px-2 py-0.5 text-2xs font-semibold text-white">{t("sf.out", "نافد حالياً")}</span>
                  ) : p.featured ? (
                    /* المختارُ يتصدّر الشبكةَ ويُعلَّم داخلها — لا صفّاً ثانياً يكرّره. */
                    <span className="absolute start-2 top-2 rounded-lg bg-surface-1/95 px-2 py-0.5 text-2xs font-semibold text-ink-muted shadow-soft">{t("sf.pick", "اختيار العيادة")}</span>
                  ) : null}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{p.name}</p>
                    {p.descr && <p className="line-clamp-2 text-2xs leading-relaxed text-ink-subtle">{p.descr}</p>}
                    {p.subcategory && <span className="self-start rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">{p.subcategory}</span>}
                    {/* خانةُ فعلٍ ثابتة ٨٤ بكسل: زرُّ «+» يتبدّل عدّاداً بنفس العرض،
                        فالسعرُ ما يقفز سطراً ثانياً لحظةَ ما يضيف الزبون للسلة. */}
                    <div className="mt-auto grid grid-cols-[minmax(0,1fr)_84px] items-center gap-2 pt-1.5">
                      <p className="font-display text-base font-bold tabular-nums text-ink">{money(p.price)}</p>
                      {!p.available ? (
                        <span className="justify-self-end text-2xs font-semibold text-ink-muted">{t("sf.out", "نافد حالياً")}</span>
                      ) : inCart === 0 ? (
                        <button onClick={() => add(p.id)} aria-label={`أضف ${p.name}`}
                          className="grid h-11 w-11 justify-self-end place-items-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 active:scale-90">
                          <Plus size={19} />
                        </button>
                      ) : (
                        /* أهدافُ لمسٍ ٣٦ بكسل بدل ٢٨: إصبعٌ حقيقيّ على شبكةٍ من عمودين. */
                        <div className="flex h-11 w-[84px] items-center justify-between rounded-xl border border-brand-400 px-1">
                          <button onClick={() => { playTap(); setQty(p.id, inCart - 1); }} aria-label="أنقص"
                            className="grid h-9 w-9 place-items-center rounded-lg text-brand-700 transition active:scale-90 dark:text-brand-300">
                            <Minus size={16} />
                          </button>
                          <span className="min-w-4 text-center text-sm font-bold tabular-nums text-brand-700 dark:text-brand-300">{formatNum(inCart)}</span>
                          <button onClick={() => add(p.id)} aria-label="زد"
                            className="grid h-9 w-9 place-items-center rounded-lg text-brand-700 transition active:scale-90 dark:text-brand-300">
                            <Plus size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
        {(hasMore || moreFailed) && (
          <button onClick={() => { setMoreFailed(false); void loadMore(); }} disabled={loadingMore}
            className="mt-4 w-full rounded-2xl border border-line bg-surface-1 py-3 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-50">
            {loadingMore ? "جاري التحميل…" : moreFailed ? "تعذّر التحميل — أعد المحاولة" : "عرض المزيد من المنتجات"}
          </button>
        )}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-2xs text-ink-subtle"><PawPrint size={12} /> متجر مقدَّم من doctorVet</p>
      </main>

      {/* ورقة تفاصيل المنتج (المرحلة ٣): صورة أكبر + الوصف كاملاً + عدّاد */}
      {detail && (() => {
        const look = categoryLook(detail.category);
        const img = productImageUrl(detail.image_path);
        const n = qtyOf(detail.id);
        return (
          <div className="fixed inset-0 z-40" data-detailsheet>
            <div className="absolute inset-0 bg-ink/40" onClick={() => setDetail(null)} />
            <motion.div initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
              className="absolute inset-x-0 bottom-0 mx-auto max-w-3xl rounded-t-3xl bg-surface-1 p-4 pb-6 shadow-raised">
              <div className={cn("relative grid h-52 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br text-6xl", look.grad)}>
                {look.emoji}
                {img && <img src={img} alt="" className="absolute inset-0 h-full w-full object-cover" onError={(e) => { e.currentTarget.hidden = true; }} />}
                <button onClick={() => { playTap(); setDetail(null); }} aria-label={t("sf.close", "إغلاق")}
                  className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-white"><X size={16} /></button>
              </div>
              <h2 className="mt-3 text-base font-bold leading-snug text-ink">{detail.name}</h2>
              {detail.subcategory && <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">{detail.subcategory}</span>}
              {detail.descr && <p className="mt-2 max-h-32 overflow-y-auto text-sm leading-relaxed text-ink-muted">{detail.descr}</p>}
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="font-display text-lg font-bold tabular-nums text-brand-600">{money(detail.price)}</p>
                {!detail.available ? (
                  <span className="text-sm font-bold text-ink-subtle">{t("sf.out", "نافد حالياً")}</span>
                ) : n === 0 ? (
                  <button onClick={() => add(detail.id)} className="rounded-2xl bg-brand-600 px-6 py-3 text-sm font-bold text-white transition active:scale-95">
                    {t("sf.addToCart", "أضف للسلة")}
                  </button>
                ) : (
                  <div className="flex items-center gap-2 rounded-2xl bg-brand-50 p-1.5 dark:bg-brand-500/15">
                    <button onClick={() => { playTap(); setQty(detail.id, n - 1); }} className="grid h-9 w-9 place-items-center rounded-xl bg-white text-brand-700 shadow-soft transition active:scale-90 dark:bg-surface-1"><Minus size={15} /></button>
                    <span className="w-6 text-center text-base font-bold tabular-nums text-brand-700 dark:text-brand-300">{formatNum(n)}</span>
                    <button onClick={() => add(detail.id)} className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white transition active:scale-90"><Plus size={15} /></button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        );
      })()}

      {/* شريط السلة العائم */}
      <AnimatePresence>
        {units > 0 && sheet === "none" && (
          <motion.button initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", damping: 22 }}
            onClick={() => { playTap(); setSheet("cart"); }}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3.5 text-white shadow-raised transition active:scale-[0.99]">
            <span className="relative">
              <ShoppingCart size={20} />
              <span className="absolute -end-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-2xs font-bold text-brand-700">{formatNum(units)}</span>
            </span>
            {/* الرقمُ المعروض هو الرقمُ المدفوع (لا المجموع الفرعي): زبونٌ يشوف
                ٤٢٬٠٠٠ بالشريط ثم يُطلب منه ٤٥٬٠٠٠ عند الباب يحسّ أنه انخدع. */}
            <span className="flex-1 text-start">
              <span className="block text-sm font-bold leading-tight">{t("sf.viewCart", "عرض السلة")}</span>
              <span className="block text-2xs leading-tight text-white/80">{feeKnown ? t("sf.dueOnDelivery", "الكلي عند الاستلام") : t("sf.dueEstimate", "الكلي التقديري — التوصيل يتحدد بالتأكيد")}</span>
            </span>
            <span className="font-display text-base font-bold tabular-nums">{money(total)}</span>
          </motion.button>
        )}
      </AnimatePresence>

      {/* لوحة السلة / الإتمام */}
      <AnimatePresence>
        {sheet !== "none" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40" onClick={() => setSheet("none")}>
            <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 26, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-3xl overflow-y-auto rounded-t-3xl bg-surface-1 p-4 shadow-raised">
              {sheet === "cart" ? (
                <CartSheet
                  cart={cart} byId={byId} subtotal={subtotal} fee={fee} feeKnown={feeKnown} total={total}
                  underMin={underMin} minOrder={minOrder}
                  setQty={setQty} onClose={() => setSheet("none")} onCheckout={() => { playTap(); setSheet("checkout"); }} />
              ) : (
                <CheckoutSheet
                  slug={slug} cart={cart} subtotal={subtotal} fee={fee} feeKnown={feeKnown} total={total}
                  onBack={() => setSheet("cart")}
                  onPlaced={(r) => {
                    setCart([]); setSheet("none"); setPlaced(r); playAchievement(); celebrate();
                    // رقم آخر طلب يُحفظ محلياً: صفحة التتبّع تعبّيه تلقائياً لو رجع الزبون بعدين.
                    try { localStorage.setItem("vp_store_last_order", r.order_no); } catch { /* ignore */ }
                  }} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CatChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button onClick={onClick}
      className={cn("shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition",
        active ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>
      {label}
    </button>
  );
}

/* ------------------------------- السلة ------------------------------- */

function CartSheet({ cart, byId, subtotal, fee, feeKnown, total, underMin, minOrder, setQty, onClose, onCheckout }: {
  cart: CartLine[]; byId: Map<string, StoreCatalogItem>;
  subtotal: number; fee: number; feeKnown: boolean; total: number; underMin: boolean; minOrder: number;
  setQty: (id: string, qty: number) => void; onClose: () => void; onCheckout: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div dir="rtl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-bold text-ink"><ShoppingCart size={19} className="text-brand-600" /> سلتك</h2>
        <button onClick={onClose} aria-label="إغلاق" className="grid h-8 w-8 place-items-center rounded-full bg-surface-2 text-ink-muted"><X size={16} /></button>
      </div>
      {cart.length === 0 ? (
        <p className="py-10 text-center text-sm text-ink-subtle">سلتك فارغة.</p>
      ) : (
        <>
          <div className="space-y-2">
            {cart.map((l) => {
              const p = byId.get(l.id);
              if (!p) return null;
              const look = categoryLook(p.category);
              return (
                <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                  <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br text-lg", look.grad)}>{look.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-ink">{p.name}</p>
                    <p className="text-2xs tabular-nums text-ink-subtle">{money(p.price)} للواحد</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => { playTap(); setQty(l.id, l.qty - 1); }} className="grid h-7 w-7 place-items-center rounded-lg border border-line text-ink-muted transition active:scale-90"><Minus size={13} /></button>
                    <span className="w-5 text-center text-sm font-bold tabular-nums text-ink">{formatNum(l.qty)}</span>
                    <button onClick={() => { playTap(); setQty(l.id, l.qty + 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white transition active:scale-90"><Plus size={13} /></button>
                  </div>
                  <p className="w-20 shrink-0 text-end text-sm font-bold tabular-nums text-ink">{money(p.price * l.qty)}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <p className="flex justify-between text-ink-muted"><span>المجموع</span><span className="tabular-nums">{money(subtotal)}</span></p>
            {/* سطرُ التوصيل يُعرض **دائماً**: إخفاؤه عند الصفر يخلّي الزبون يحسب
                أن ما يراه هو ما يدفع، ثم تُضاف الأجرةُ عند الباب. */}
            <p className="flex justify-between text-ink-muted">
              <span>{t("sf.delivery", "توصيل")}</span>
              <span className="tabular-nums">{feeKnown ? money(fee) : t("sf.tbd", "يتحدد بالتأكيد")}</span>
            </p>
            <p className="flex justify-between font-display text-base font-bold text-ink">
              <span>{feeKnown ? t("sf.dueOnDelivery", "الكلي عند الاستلام") : t("sf.dueEstimate", "الكلي التقديري — التوصيل يتحدد بالتأكيد")}</span>
              <span className="tabular-nums">{money(total)}</span>
            </p>
          </div>
          {underMin && (
            <p className="mt-2 rounded-xl bg-warn-50 px-3 py-2 text-xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">
              الحد الأدنى للطلب {money(minOrder)} — ضيف {money(minOrder - subtotal)} بعد.
            </p>
          )}
          <button onClick={onCheckout} disabled={underMin}
            className="mt-3 w-full rounded-2xl bg-brand-600 py-3.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50">
            إتمام الطلب — الدفع عند الاستلام
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------ الإتمام ------------------------------ */

function CheckoutSheet({ slug, cart, subtotal, fee, feeKnown, total, onBack, onPlaced }: {
  slug: string; cart: CartLine[]; subtotal: number; fee: number; feeKnown: boolean; total: number;
  onBack: () => void; onPlaced: (r: { order_no: string; total: number }) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState(""); // honeypot — الإنسان ما يشوفه ولا يعبيه
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => nameRef.current?.focus(), 250); return () => clearTimeout(t); }, []);

  /* العنوان إلزاميّ: طلبُ توصيلٍ بلا وجهة ناقصٌ بتعريفه، وكان يُقبل فيصير
   * كلُّ طلبيةٍ مكالمةً إضافية — والعيادة تتصل للتأكيد على كلّ حال. */
  const valid = name.trim().length >= 2 && isValidCustomerPhone(phone) && address.trim().length >= 8;

  const submit = async () => {
    if (busy) return;
    setErr(null);
    if (trap.trim()) return; // بوت عبّى الفخ — نتجاهله بصمت
    if (name.trim().length < 2) { setErr("اكتب اسمك الكامل."); playWarning(); return; }
    if (!isValidCustomerPhone(phone)) { setErr("رقم الهاتف غير صحيح — مثال: 07901234567"); playWarning(); return; }
    if (address.trim().length < 8) { setErr(t("sf.addrNeeded", "اكتب عنوانك — المنطقة وأقرب نقطة دالة حتى يلكاك المندوب.")); playWarning(); return; }
    setBusy(true);
    try {
      const res = await repo.placeStoreOrder(slug,
        { name: name.trim(), phone: phone.trim(), address: address.trim(), note: note.trim() },
        cart.map((l) => ({ product_id: l.id, qty: l.qty })));
      if (!res.ok) {
        setErr(res.error === "min_order" && res.min_order != null
          ? `الحد الأدنى للطلب ${money(res.min_order)}.`
          : ERROR_MSG[res.error ?? ""] ?? "صار خطأ — جرب من جديد.");
        playWarning();
        return;
      }
      playSuccess();
      onPlaced({ order_no: res.order_no ?? "—", total: res.total ?? total });
    } catch {
      setErr("تعذّر إرسال الطلب — تأكد من الإنترنت وجرب من جديد.");
      playWarning();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div dir="rtl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-display text-lg font-bold text-ink">معلوماتك للتوصيل</h2>
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-brand-600"><ArrowRight size={14} /> رجوع للسلة</button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-subtle">بلا تسجيل وبلا حسابات — بس اسمك ورقمك وعنوانك، والعيادة تتواصل وياك للتأكيد.</p>
      <div className="space-y-2.5">
        <input ref={nameRef} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل *" className="input" />
        <input dir="ltr" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="* 07xxxxxxxxx" className="input text-left" />
        <div className="relative">
          <MapPin size={15} className="pointer-events-none absolute end-3 top-3 text-ink-subtle" />
          <textarea rows={2} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} placeholder={t("sf.addrPh", "عنوانك للتوصيل * (المنطقة، أقرب نقطة دالة…)")} className="input min-h-[3.5rem] resize-y pe-9 text-sm" />
        </div>
        <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات إضافية (اختياري)" className="input min-h-[2.5rem] resize-y text-sm" />
        {/* فخ البوتات — مخفي عن البشر تماماً */}
        <input value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
          className="absolute -z-10 h-0 w-0 opacity-0" placeholder="company" />
      </div>
      <div className="mt-3 space-y-1 rounded-2xl bg-surface-2 p-3 text-sm">
        <p className="flex justify-between text-ink-muted"><span>{formatNum(cart.reduce((s, l) => s + l.qty, 0))} منتج</span><span className="tabular-nums">{money(subtotal)}</span></p>
        <p className="flex justify-between text-ink-muted">
          <span>{t("sf.delivery", "توصيل")}</span>
          <span className="tabular-nums">{feeKnown ? money(fee) : t("sf.tbd", "يتحدد بالتأكيد")}</span>
        </p>
        <p className="flex justify-between font-display text-base font-bold text-ink">
          <span>{feeKnown ? t("sf.dueOnDelivery", "الكلي عند الاستلام") : t("sf.dueEstimate", "الكلي التقديري — التوصيل يتحدد بالتأكيد")}</span>
          <span className="tabular-nums">{money(total)}</span>
        </p>
      </div>
      {err && <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs font-bold text-danger-600 dark:bg-danger-500/15 dark:text-danger-300">{err}</p>}
      <button onClick={() => void submit()} disabled={busy || !valid}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 text-sm font-bold text-white shadow-soft transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
        {busy ? "يرسل طلبك…" : "أرسل الطلب 🚀"}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1 text-2xs text-ink-subtle"><ShieldCheck size={12} /> الدفع نقداً عند الاستلام — ما ندفعك تدفع شيء الآن</p>
    </div>
  );
}
