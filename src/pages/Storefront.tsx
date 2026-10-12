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
import {
  ShoppingCart, Plus, Minus, Search, MapPin, Phone, MessageCircle, X,
  CheckCircle2, PawPrint, Truck, ShieldCheck, Store, ArrowRight, ArrowLeft, Loader2, PackageX,
} from "lucide-react";
import type { StoreCatalogItem, StoreFrontInfo } from "@/types";
import { storeApi, readStoreBoot, pagePainted } from "@/lib/storeApi";
import { cardImagePath, catGlyph, isValidCustomerPhone, mergeKnown, orderShelf, productImageUrl, shelfLook, shelfLabel, shelfMonogram, lastOrderKey } from "@/lib/storeLib";
import { useLayers } from "@/lib/storeLayers";
import { ZoomViewer } from "@/components/store/ZoomViewer";
import { preferArabicForVisitor } from "@/lib/portal";
import { waNumber } from "@/lib/phone";
import { celebrate } from "@/lib/celebrate";
import { playTap, playSuccess, playWarning, playAchievement } from "@/lib/sounds";
import { cn, money, formatNum, searchable } from "@/lib/utils";
import { track } from "@/lib/track";

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

/** عنوانُ التبويب بموضعٍ واحد — تكتبه البذرةُ والنداءُ كلاهما. */
const pageTitle = (name: string) => `${name} — المتجر`;

/* ── الرفوف (متجر v1) ────────────────────────────────────────────────────
 * رفٌّ لكلّ رقاقة: «الكل» (store_catalog) وكلُّ تصنيفٍ (store_catalog_in — التصفيةُ بالخادم).
 * كلٌّ بصفحاته: الأولى ٢٤، ثم ٦٠ بـ«عرض المزيد»، والتقدّمُ بما **وصل**. والعددُ لا يُقال إلا
 * لرفٍّ كامل، و«ما لكينا» لا تُقال قبل أن يكتمل — قائمةٌ ناقصةٌ تُصدَّق (CLAUDE.md). */
interface Shelf { rows: StoreCatalogItem[]; loaded: boolean; hasMore: boolean; loading: boolean; failed: boolean }
const BLANK: Shelf = { rows: [], loaded: false, hasMore: false, loading: false, failed: false };
/** صورةُ البطاقة مصغّرتُها؛ وإن فشلت **فمرّةً واحدة** للكاملة، ثم تختفي فتظهر البلاطةُ تحتها. */
const swapOnce = (full: string | null) => (e: React.SyntheticEvent<HTMLImageElement>) => {
  const el = e.currentTarget;
  if (full && el.dataset.fb !== "1" && el.src !== full) { el.dataset.fb = "1"; el.src = full; } else el.hidden = true;
};

/**
 * يُبقي عنصراً مركَّباً حتى تنتهي حركةُ خروجه — بديلُ `AnimatePresence` بلا مكتبة.
 *
 * حركةُ الدخول وحدَها تكفيها CSS: العنصرُ يُركَّب فتجري. أما الخروجُ فلا —
 * العنصرُ يُفكّ فورَ انقلاب الشرط فلا يبقى شيءٌ ليتحرّك. فنؤخّر الفكَّ بقدر
 * الحركة، ونعلّم الخروجَ بصفٍّ ثانٍ.
 *
 * و`ms` هنا **مرآةُ مدّة الحركة** بـtailwind.config (٢٠٠ms للخروج): أطولُ منها
 * يترك طبقةً شفّافةً تبتلع الضغطات، وأقصرُ يقطع الحركة بمنتصفها.
 */
function useExit(open: boolean, ms = 200) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setLeaving(false); setMounted(true); return; }
    if (!mounted) return;
    setLeaving(true);
    const t = window.setTimeout(() => { setMounted(false); setLeaving(false); }, ms);
    return () => window.clearTimeout(t);
  }, [open, mounted, ms]);
  return { mounted, leaving };
}

export function Storefront() {
  const { slug = "" } = useParams();
  const { t } = useTranslation();
  const [state, setState] = useState<"loading" | "closed" | "error" | "open">("loading");
  /** إعادة محاولة التحميل الأول: يزيد فيعيد تشغيل مؤثّر الجلب. */
  const [tries, setTries] = useState(0);
  const [front, setFront] = useState<StoreFrontInfo | null>(null);
  /** الرفوف: «all» وكلُّ تصنيفٍ فُتح — بصفحاتها. */
  const [shelves, setShelves] = useState<Record<string, Shelf>>({});
  const shelvesRef = useRef(shelves);
  shelvesRef.current = shelves;
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  /** تصنيفٌ شيل بين فتح الصفحة والضغط عليه (cat_gone): يُقال ويُرجع لـ«الكل». */
  const [catGone, setCatGone] = useState(false);
  const [cart, setCart] = useState<CartLine[]>(() => loadCart(slug));
  /* الطبقاتُ (الورقة، العارض، السلّة، الإتمام) مداخلُ بسجلّ التصفّح — زرُّ الرجوع يُغلقها
   * بالترتيب ولا يُخرج من المتجر (storeLayers). والمنتجُ المفتوح بذاكرة React. */
  const L = useLayers();
  /** ورقة تفاصيل منتج (المرحلة ٣): صورة كبيرة ووصف كامل وعدّاد كمية. */
  const [detail, setDetail] = useState<StoreCatalogItem | null>(null);
  const [sort, setSort] = useState<"default" | "priceAsc" | "priceDesc">("default");
  const [placed, setPlaced] = useState<{ order_no: string; total: number } | null>(null);
  /* أوّلُ صفحةٍ أخفُّ (٢٤) لأن الزائرَ يدفع بايتاتِها قبل أن يرى منتجاً، ثمّ
   * صفحاتٌ أكبر لمن يكمّل — فالكلفةُ على من طلبها لا على كلّ من فتح الرابط. */
  const PAGE = 24;
  /* رفٌّ رسمته الحافةُ ⇒ **لا حركةَ دخول**. البطاقاتُ معروضةٌ صلبةً قبل React،
   * فحركةُ «تلاشٍ من صفر» عند التركيب تُطفئ ما كان ظاهراً ثمّ تعيده — ومضةٌ
   * يراها الزبون. (رُئيت بلقطةٍ عند ٦٠٠ms بشبكةٍ مبطّأة قبل أن يُطفأ.) */
  const noIntro = useRef(pagePainted());
  const PAGE_MORE = 60;

  /* لغةُ الزائر: هذه الصفحة عربيةٌ صلبةٌ عمداً (زبائنُ عيادةٍ عراقية)، فكلُّ
   * نصٍّ يمرّ من `t(` لازم يخرج عربياً — وقد خرج إنكليزياً فعلاً لزرّ «شوف
   * حيواناتي» يومَ كان الافتراضُ إنكليزياً. صار الافتراضُ عربياً فالحالةُ
   * الشائعة مغطّاة، وهذا النداءُ يبقى للحالات التي لا يغطّيها (انظر التعليل
   * بـportal.ts). */
  useEffect(() => { preferArabicForVisitor(); }, []);
  /* إعادةُ تحميلٍ والورقةُ مفتوحة: الطبقاتُ باقيةٌ بالسجلّ والمنتجُ لا — نرجع للأساس، لا ضغطاتِ رجوعٍ ميتة.
   * **مرّةً واحدة** (مرجعٌ يحرسها): StrictMode يشغّل أثرَ التركيب مرّتين بنفس الطبقات القديمة، فكان
   * go(-2) يتكرّر ويُخرج الزبونَ من المتجر كلِّه — قيس بالمتصفّح. */
  const unwound = useRef(false);
  useEffect(() => {
    if (unwound.current || !L.layers.length) return;
    unwound.current = true;
    L.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setShelf = (key: string, next: Partial<Shelf>) =>
    setShelves((s) => ({ ...s, [key]: { ...(s[key] ?? BLANK), ...next } }));

  useEffect(() => {
    let alive = true;
    (async () => {
      /* بذرةُ الحافة: رفٌّ مرسومٌ مع أوّل رسمةٍ بدل دوّامةٍ تنتظر ذهاباً وإياباً
       * (المقيس: ٢٥٠–٦٠٠ms توفَّر، وعلى شبكةٍ ضعيفة أكثر). ولا تُصدَّق نهائياً —
       * المستندُ مخبوءٌ خمسَ دقائق بالحافة — فالنداءُ يمضي بعدها ويستبدلها. */
      const boot = readStoreBoot(slug);
      if (boot && alive) {
        setFront(boot.front);
        setShelf("all", { rows: boot.catalog, loaded: true, hasMore: boot.catalog.length === PAGE });
        setState("open");
        document.title = pageTitle(boot.front.name);
      }
      try {
        const [f, c] = await Promise.all([storeApi.storeFrontPublic(slug), storeApi.storeCatalogPublic(slug, PAGE, 0)]);
        if (!alive) return;
        if (!f) { setState("closed"); return; }
        setFront(f);
        setShelf("all", { rows: c, loaded: true, hasMore: c.length === PAGE, failed: false });
        setState("open");
        document.title = pageTitle(f.name);
        /* القياسُ بعد أن يُفتح المتجرُ فعلاً لا عند تركيب المكوّن: رابطٌ مغلقٌ
         * أو فشلُ شبكةٍ ليس زيارةً، وعدُّه يرفع بسطَ القمع بمن لم يرَ رفّاً.
         * و`once` لأن إعادةَ التصيير ليست زيارةً ثانية. */
        track("store_view", { slug }, true);
      } catch {
        /* فشلُ الجلب غير «المتجر مسكّر»: شاشةُ «مغلق» على خطأ شبكةٍ عابر تكذب
         * على الزبون فيصدّق ويروح — القاعدة: خطأٌ ظاهر و«أعد المحاولة».
         *
         * **إلا إن كانت البذرةُ مرسومة**: عندها الرفُّ المعروض لقطةُ خادمٍ
         * كاملةٌ لا قائمةٌ ناقصة (والقاعدةُ تمنع الناقصةَ لا القديمة)، فمحوُها
         * بشاشة خطأٍ يأخذ من الزبون متجراً يشوفه. وما يبيعه لا يعتمد عليها:
         * `store_place_order` تتحقّق من النشر والسعر لحظةَ الطلب. */
        if (alive && !boot) setState("error");
      }
    })();
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, tries]);

  /** التصنيفُ شيل (أرشفةٌ، إخفاءٌ، أو أُفرغ بين فتح الصفحة والضغطة): يُقال، و«الكل» مكانَه، والرقائقُ تُقرأ من جديد. */
  const onCatGone = (key: string) => {
    setCatGone(true);
    setCat("all");
    setShelves((s) => { const n = { ...s }; delete n[key]; return n; });
    storeApi.storeFrontPublic(slug).then((f) => { if (f) setFront(f); }).catch(() => { /* الرقائقُ القديمة تبقى — والضغطةُ تقول cat_gone */ });
  };

  /** الصفحةُ التالية لرفٍّ (أو الأولى لتصنيفٍ يُفتح). */
  const loadShelf = async (key: string) => {
    const cur = shelvesRef.current[key] ?? BLANK;
    if (cur.loading) return;
    const first = !cur.loaded;
    setShelf(key, { loading: true, failed: false });
    try {
      const limit = first ? PAGE : PAGE_MORE;
      const offset = first ? 0 : cur.rows.length;
      const more = key === "all"
        ? await storeApi.storeCatalogPublic(slug, limit, offset)
        : await storeApi.storeCatalogInPublic(slug, key, limit, offset);
      setShelves((s) => {
        const c = s[key] ?? BLANK;
        // إزالة أي تكرار دفاعياً (منتج انضاف بين الصفحتين يزحزح الترتيب).
        const seen = new Set(c.rows.map((x) => x.id));
        const fresh = more.filter((x) => !seen.has(x.id));
        /* التقدّمُ بما **وصل** لا بما طُلب — نفسُ درس `allPages`: صفحةٌ ناقصة عن
         * سقفٍ خادميٍّ أقلَّ من PAGE كانت تُقرأ «انتهت التشكيلة». و`fresh.length > 0`
         * صمّامٌ لا تجميل: صفحةٌ كلُّها مكرّرات (ترتيبٌ غيرُ حاسم، 0182) كانت تعيد
         * النداءَ نفسَه بلا نهاية على دالّةٍ عامّة. */
        const hasMore = first ? more.length === limit : more.length > 0 && fresh.length > 0;
        return { ...s, [key]: { rows: [...c.rows, ...fresh], loaded: true, hasMore, loading: false, failed: false } };
      });
    } catch (e) {
      if (key !== "all" && (e as Error)?.message === "cat_gone") { onCatGone(key); return; }
      // إخفاءُ الزرّ يجعل الفشلَ يبدو نهايةَ التشكيلة — نُبقيه ونقول «تعذّر».
      setShelf(key, { loading: false, failed: true });
    }
  };

  const pickCat = (key: string) => {
    playTap();
    setCatGone(false);
    setCat(key);
    if (key !== "all") track("store_cat", { slug, c: key }, true);
    if (!(shelvesRef.current[key]?.loaded)) void loadShelf(key);
  };

  const openDetail = (p: StoreCatalogItem) => { playTap(); setDetail(p); L.open("sheet"); };

  const cur = shelves[cat] ?? BLANK;
  const allShelf = shelves.all ?? BLANK;
  /* بحثٌ فوق رفٍّ جزئيّ يحكم «ما لكينا شيء» على ما حُمّل وحده. فقبل إعلان
   * الخيبة نُنزل بقيةَ صفحاتِ **هذا الرفّ** — لا حكمَ نهائياً فوق قائمةٍ ناقصة. */
  const searching = q.trim().length > 0;
  useEffect(() => {
    if (!searching || !cur.loaded || !cur.hasMore || cur.loading || cur.failed) return;
    void loadShelf(cat);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, cat, cur.loaded, cur.hasMore, cur.loading, cur.failed]);
  /* البحثُ يُقاس بعد توقّفٍ (١٫٣ث) بحرفين فأكثر — **مرّةً**، و**بلا نصّ البحث**: القياسُ يسأل
   * «هل يبحثون» لا «عمّا». */
  useEffect(() => {
    if (q.trim().length < 2) return;
    const tm = window.setTimeout(() => track("store_search", { slug }, true), 1300);
    return () => window.clearTimeout(tm);
  }, [q, slug]);

  useEffect(() => { saveCart(slug, cart); }, [slug, cart]);

  /* السلّةُ والمجموعُ والإتمامُ يسعّرون من **كلّ ما وصل** (mergeKnown): مادّةٌ من صفحةٍ
   * ثانيةٍ لتصنيفٍ لم تصلها «الكل» بعد كانت تُسعَّر صفراً وتختفي من السلّة. */
  const byId = useMemo(() => mergeKnown(Object.values(shelves).map((s) => s.rows)), [shelves]);
  const allById = useMemo(() => new Map(allShelf.rows.map((c) => [c.id, c])), [allShelf.rows]);
  /* سلةٌ محفوظةٌ من زيارةٍ سابقة: تُنظَّف ممّا انسحب من الكتلوج — **بعد أن
   * يكتمل رفُّ «الكل» لا قبله**.
   *
   * كانت تجري على `state === "open"`، أي بعد الصفحة الأولى وحدها (٢٤ منتجاً)،
   * فكلُّ سطرِ سلّةٍ منتجُه بالصفحة الثانية يُحذف صامتاً: الزبونُ يعود لسلّةٍ
   * حفظها أمس فيجدها ناقصةً ولا يعرف. والحذفُ الصامتُ يُصدَّق — «قائمةٌ ناقصة
   * أخطرُ من خطأٍ ظاهر». مقيسٌ بمتصفّحٍ حقيقيّ: سلّةٌ من سطرين تصير سطراً. */
  const [cartTrimmed, setCartTrimmed] = useState<string[]>([]);
  useEffect(() => {
    if (state !== "open" || !allShelf.loaded || allShelf.hasMore || allShelf.loading || allShelf.failed) return;
    setCart((c) => {
      const gone = c.filter((l) => !allById.get(l.id)?.available);
      if (!gone.length) return c;
      setCartTrimmed(gone.map((l) => byId.get(l.id)?.name ?? l.id));
      return c.filter((l) => allById.get(l.id)?.available);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, allShelf.loaded, allShelf.hasMore, allShelf.loading, allShelf.failed]);

  /* ── متجر v1 (O1/O2): التصفّحُ برفوف العيادة ─────────────────────────────
   * كان هنا حكمٌ بالامتناع (ت١٢): «لا يُبنى تصفّحُ المتجر على `category`» — والمقيسُ معه:
   * عيادةُ الـ٩٦٢ منتجاً ٨٦٣ منها بلا فئة، فزرٌّ واحدٌ «منوّعات» يحوي ٩٠٪، والفئاتُ خمسٌ
   * مغلقة. كان صحيحاً لعمود المنتج. والجديدُ بقرار المالك (١٢/١٠): التصنيفاتُ **للعيادة**
   * (0233) — تسمّيها وترتّبها وتؤشّر موادَّها (المادّةُ بأكثر من تصنيف)، والرقائقُ من
   * `front.cats` بترتيبها: الحيُّ غيرُ المخفيّ الذي فيه مادّةٌ معروضة. و«الكل» يبقى أوّلاً
   * وفيه ما لا تصنيفَ له. والتصفيةُ بالخادم (store_catalog_in) — لا قائمةٌ جزئيةٌ تُصفّى هنا.
   * والقياسُ بعد ثلاثين يوماً: store_cat وstore_search بـlanding_events (الاستعلامُ بـ
   * docs/store-repair-plan.md) — من أراد نقضَ القرار فليأتِ بقياسٍ لا برأي.
   */
  const shown = useMemo(() => {
    /* الطرفان يمرّان من `searchable`: من يكتب «ادويه» يلقى «أدوية»، ومن يكتب
     * «٢٤٧» يلقى «247». تطبيعُ طرفٍ واحد أسوأ من لا تطبيع — يفشل بصمتٍ ويبدو
     * أنه يعمل، فيرى الزبونُ «ما لكينا» عن بضاعةٍ على الرفّ ويصدّقها. */
    const ql = searchable(q);
    const list = cur.rows.filter((c) =>
      !ql || searchable(c.name).includes(ql) || searchable(c.subcategory).includes(ql) || searchable(c.descr).includes(ql));
    /* النافدُ آخِراً دائماً، والمختارُ يتصدّر «الكل» وحدها — داخل التصنيف ترتيبُ العيادة (orderShelf). */
    return orderShelf(list, { sort, inCategory: cat !== "all" });
  }, [cur.rows, q, cat, sort]);
  const complete = cur.loaded && !cur.hasMore && !cur.loading;

  /** مختارات العيادة (0177): تظهر أعلى الكتلوج بلا بحثٍ ولا فئةٍ منتقاة —
   *  بحثُ الزبون أولى من تسويقنا. */
  const qtyOf = (id: string) => cart.find((l) => l.id === id)?.qty ?? 0;
  const setQty = (id: string, qty: number) => {
    setCart((c) => {
      const next = qty <= 0 ? c.filter((l) => l.id !== id) : c.some((l) => l.id === id) ? c.map((l) => (l.id === id ? { ...l, qty: Math.min(qty, 99) } : l)) : [...c, { id, qty: Math.min(qty, 99) }];
      return next;
    });
  };
  const add = (id: string) => {
    playTap();
    /* الإضافةُ الصريحةُ وحدَها تُقاس: `setQty` تُنادى كذلك من أزرار +/− بالسلّة
     * ومن التشذيب التلقائيّ — وعدُّها كلِّها «إضافات» يضخّم القمعَ بلا معنى.
     * و`once` بالمنتج: من أضاف ثلاثَ علبٍ من نفس الصنف اهتمّ مرّةً واحدة. */
    track("store_add", { slug, id }, true);
    setQty(id, qtyOf(id) + 1);
  };

  const units = cart.reduce((s, l) => s + l.qty, 0);
  /* اللوحةُ من الطبقات لا من حالةٍ داخل React — فزرُّ الرجوع يُغلقها كما تُغلقها X. */
  const sheet: "none" | "cart" | "checkout" = L.has("checkout") ? "checkout" : L.has("cart") ? "cart" : "none";
  const sheetOpen = !!detail && L.has("sheet");
  const zoomOpen = sheetOpen && L.has("zoom") && !!detail?.image_path;
  /* حركاتُ الدخول والخروج بـCSS (ت١١) — `useExit` يؤخّر الفكَّ بقدر الحركة.
   * والشرطان مطابقان لما كان بـ`AnimatePresence` حرفياً: الشريطُ يظهر بسلّةٍ
   * غيرِ فارغةٍ ولوحةٍ مغلقة. و`shownSheet` يحفظ آخرَ لوحةٍ فتحت كي لا تقفزَ
   * المحتوياتُ أثناء الخروج. */
  const bar = useExit(units > 0 && sheet === "none");
  const panel = useExit(sheet !== "none");
  const shownSheet = useRef<"cart" | "checkout">("cart");
  if (sheet !== "none") shownSheet.current = sheet;
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
        <div className="flex w-full max-w-sm animate-scale-in flex-col items-center gap-4 text-center">
          <span className="grid h-20 w-20 animate-pop place-items-center rounded-full bg-success-500 text-white shadow-raised">
            <CheckCircle2 size={44} />
          </span>
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
        </div>
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
            {/* النبذةُ كانت تُحفظ بالإعدادات ولا يراها أحد — سطرانِ تحت الاسم (والحافةُ ترسمها مثلها). */}
            {front.bio && <p className="mt-0.5 line-clamp-2 whitespace-pre-line text-xs leading-snug text-white/85" data-storebio>{front.bio}</p>}
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
          {front.cats.length > 0 && (
            /* رقائقُ رفوف العيادة بترتيبها (0234): «الكل» أوّلاً وفيه ما لا تصنيفَ له. والحافةُ
               ترسم الشريطَ نفسَه بأصنافه (store-paint-guard). والفرزُ سطرٌ مستقلّ تحته: كان
               بـ`ms-auto` داخل حاوية التمرير فقِيس عند x=−210 — عنصرٌ لا يعرف أحدٌ بوجوده. */
            <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" data-catchips>
              <CatChip active={cat === "all"} onClick={() => pickCat("all")} label={t("sf.all", "الكل")} />
              {front.cats.map((c) => (
                <CatChip key={c.id} active={cat === c.id} onClick={() => pickCat(c.id)} label={`${catGlyph(c.icon)} ${c.name}`} />
              ))}
            </div>
          )}
          {allShelf.rows.length > 8 && (
            <div className="flex items-center justify-between gap-2 text-2xs">
              {/* عددٌ فوق رفٍّ ناقص يكذب: «١٢ منتج» عن متجرٍ فيه مئة. يُخفى
                  حتى يكتمل الرفُّ بدل أن يُعرض رقمٌ أصغرُ من الحقيقة. */}
              <span className="font-semibold text-ink-muted">
                {complete ? `${formatNum(shown.length)} ${t("sf.results", "منتج")}` : ""}
              </span>
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
        {/* ما شِيل من السلّة يُقال بالاسم لا يُحذف بصمت: الزبونُ الذي يعود
            لسلّةٍ حفظها أمس يستحقّ أن يعرف لماذا نقصت. */}
        {cartTrimmed.length > 0 && (
          <div data-carttrimmed className="mb-3 flex items-start gap-2 rounded-2xl border border-warn-300 bg-warn-50 px-3 py-2 text-2xs font-semibold text-warn-800">
            <span className="flex-1">{t("sf.cartTrimmed", "انشالت من سلّتك (ما عادت متوفّرة): {{names}}", { names: cartTrimmed.join("، ") })}</span>
            <button type="button" onClick={() => { playTap(); setCartTrimmed([]); }} aria-label={t("sf.close", "إغلاق")} className="shrink-0"><X size={14} /></button>
          </div>
        )}
        {/* صفُّ «مختاراتنا» المنفصل أُلغي: مقيسٌ أن كلَّ مختارٍ يظهر مرّتين
            (٣ من ٣ بتجربةٍ حيّة) بثمنِ ١٩٤ بكسل تدفع أوّلَ منتجٍ خارجَ الشاشة.
            الميزةُ نفسُها بقيت — المختارُ يتصدّر الشبكةَ بشارةٍ داخلها. */}
        {catGone && (
          <div data-catgone className="mb-3 flex items-start gap-2 rounded-2xl border border-warn-300 bg-warn-50 px-3 py-2 text-2xs font-semibold text-warn-800">
            <span className="flex-1">{t("sf.catGone", "التصنيف ما عاد موجود — رجّعناك للكل.")}</span>
            <button type="button" onClick={() => { playTap(); setCatGone(false); }} aria-label={t("sf.close", "إغلاق")} className="shrink-0"><X size={14} /></button>
          </div>
        )}
        {cat === "all" && allShelf.loaded && allShelf.rows.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle">
            <PackageX size={30} className="opacity-40" />
            <p className="text-sm font-semibold">المتجر يرتّب رفوفه — ارجع قريباً 🐾</p>
          </div>
        ) : !cur.loaded ? (
          /* رفُّ تصنيفٍ أوّلَ مرّة: يتحمّل، أو فشل فيُقال ويُعاد — لا قائمةٌ فارغةٌ عن خطأ. */
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle" data-shelfstate>
            {cur.failed ? (
              <>
                <p className="text-sm font-semibold">{t("sf.shelfFailed", "تعذّر تحميل هذا الرف")}</p>
                <button type="button" onClick={() => void loadShelf(cat)} className="rounded-2xl border border-line bg-surface-1 px-5 py-2 text-sm font-bold text-ink-muted">{t("sf.retry")}</button>
              </>
            ) : <Loader2 size={26} className="animate-spin text-brand-600" />}
          </div>
        ) : cat !== "all" && complete && cur.rows.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle" data-catempty>
            <PackageX size={30} className="opacity-40" />
            <p className="text-sm font-semibold">{t("sf.catEmpty", "ما بهذا التصنيف شي حالياً")}</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle">
            <Search size={26} className="opacity-40" />
            {/* «ما لكينا» لا تُقال قبل أن يكتمل الرفّ — ولا تُقال أبداً عن فشلِ جلب. */}
            <p className="text-sm font-semibold">
              {cur.failed ? "تعذّر تحميل بقية التشكيلة — أعد المحاولة" : !complete ? "نكمّل التشكيلة…" : "ما لكينا شيء مطابق"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((p, i) => {
              const shelf = shelfLook(p.name);
              const inCart = qtyOf(p.id);
              return (
                <div key={p.id} style={noIntro.current ? undefined : { animationDelay: `${Math.min(i * 0.03, 0.3)}s` }}
                  className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-surface-1 transition",
                    !noIntro.current && "animate-fade-in",
                    inCart > 0 ? "border-brand-400 shadow-raised" : "border-line",
                    !p.available && "opacity-60")}>
                  {/* الصورة فوق رمز الفئة لا بدلَه: فشلُ تحميلها (ملفٌ حُذف، شبكةٌ
                      ضعيفة) يخفيها بـhidden فيبقى الرمزُ تحتها — بطاقةٌ ما تصير فارغة.
                      والضغطة تفتح ورقة التفاصيل (صورة أكبر + الوصف كاملاً). */}
                  {/* نسبةٌ واحدة صارمة بدل ارتفاعٍ ثابت ٩٦ بكسل: بطاقةٌ عرضُها ١٧٣
                      وصورةٌ ٩٦ = ١٫٨:١ مع قصٍّ يقطع رأسَ العلبة وقاعَها — وباسمِ
                      الشركة يعرف الزبونُ المنتج. و`object-contain` فلا يُقصّ شيء. */}
                  <div role="button" tabIndex={0} onClick={() => openDetail(p)}
                    onKeyDown={(e) => { if (e.key === "Enter") openDetail(p); }}
                    className={cn("relative grid aspect-square cursor-pointer place-items-center overflow-hidden", shelf.tile)}>
                    {/* البلاطةُ **أرضٌ دائمة** لا بديلٌ عند غياب الصورة: كانت
                        تُرسم بشرطٍ يستبعدها متى وُجدت صورة، فصورةٌ تفشل (ملفٌّ
                        حُذف، شبكةٌ ضعيفة) تختفي بـhidden ولا شيءَ تحتها —
                        بطاقةٌ فارغة. والتعليقُ القديم كان يصف العكس. */}
                    <span className={cn("px-2 text-center font-display text-base font-bold leading-tight", shelf.ink)}>
                      {shelfLabel(p.name)}
                    </span>
                    {productImageUrl(cardImagePath(p.image_path)) && (
                      /* المصغّرةُ (cardImagePath — ٤٨٠ بكسل لصورةٍ من المحرّر) لا الكاملة: الشبكةُ
                         كانت تنزّل ١١٢ ك.ب للبطاقة. وتكسيلُ ما فوق الطيّة يؤخّر LCP بلا توفير. */
                      <img src={productImageUrl(cardImagePath(p.image_path)) as string} alt="" width={400} height={400}
                        loading={i < 4 ? "eager" : "lazy"} fetchPriority={i < 4 ? "high" : undefined}
                        className="absolute inset-0 h-full w-full object-contain p-1.5"
                        onError={swapOnce(productImageUrl(p.image_path))} />
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
                </div>
              );
            })}
          </div>
        )}
        {cur.loaded && (cur.hasMore || cur.failed) && (
          <button onClick={() => void loadShelf(cat)} disabled={cur.loading} data-shelfmore
            className="mt-4 w-full rounded-2xl border border-line bg-surface-1 py-3 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-50">
            {cur.loading ? "جاري التحميل…" : cur.failed ? "تعذّر التحميل — أعد المحاولة" : "عرض المزيد من المنتجات"}
          </button>
        )}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-2xs text-ink-subtle"><PawPrint size={12} /> متجر مقدَّم من doctorVet</p>
      </main>

      {/* ورقة تفاصيل المنتج: الصورةُ **الكاملة** مربّعةً حتى ٥٥٪ من الشاشة (كانت ٢٠٨ بكسل)، والمصغّرةُ
          تحتها ريثما تنزل، وضغطةٌ عليها تفتح العارضَ بملء الشاشة. والوصفُ بأسطره كما كُتب (حتى ٢٠٠٠). */}
      {sheetOpen && detail && (() => {
        const shelf = shelfLook(detail.name);
        const img = productImageUrl(detail.image_path);
        const thumb = productImageUrl(cardImagePath(detail.image_path));
        const n = qtyOf(detail.id);
        return (
          <div className="fixed inset-0 z-40" data-detailsheet>
            <div className="absolute inset-0 bg-ink/40" onClick={() => L.close()} />
            <div className="absolute inset-x-0 bottom-0 mx-auto max-h-[96vh] max-w-3xl animate-slide-up overflow-y-auto rounded-t-3xl bg-surface-1 p-4 pb-6 shadow-raised">
              {/* `object-contain` لا `object-cover`: القصُّ كان يقطع رأسَ العلبة
                  وقاعَها — وباسمِ الشركة يعرف الزبونُ المنتج. والبلاطةُ أرضاً. */}
              <div className={cn("relative mx-auto grid aspect-square max-h-[55vh] w-full max-w-[55vh] place-items-center overflow-hidden rounded-2xl", img ? "bg-white" : shelf.tile)} data-sheetimg>
                <span className={cn("px-4 text-center font-display text-2xl font-bold", shelf.ink)}>{shelfLabel(detail.name)}</span>
                {thumb && thumb !== img && <img src={thumb} alt="" className="absolute inset-0 h-full w-full object-contain p-3" onError={(e) => { e.currentTarget.hidden = true; }} />}
                {img && (
                  <button type="button" onClick={() => { playTap(); L.open("zoom"); }} aria-label={t("sf.zoom", "كبّر الصورة")} className="absolute inset-0 cursor-zoom-in" data-zoomopen>
                    <img src={img} alt={detail.name} className="h-full w-full object-contain p-3" onError={(e) => { e.currentTarget.hidden = true; }} />
                  </button>
                )}
                <button onClick={() => { playTap(); L.close(); }} aria-label={t("sf.close", "إغلاق")}
                  className="absolute end-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-ink/60 text-white"><X size={16} /></button>
              </div>
              <h2 className="mt-3 text-base font-bold leading-snug text-ink">{detail.name}</h2>
              {detail.subcategory && <span className="mt-1 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">{detail.subcategory}</span>}
              {detail.descr && <p className="mt-2 max-h-60 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-muted" data-sheetdesc>{detail.descr}</p>}
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
            </div>
          </div>
        );
      })()}

      {/* العارضُ بملء الشاشة — طبقةٌ فوق الورقة: الرجوعُ يُغلقه وحدَه. */}
      {zoomOpen && detail?.image_path && (
        <ZoomViewer src={productImageUrl(detail.image_path) as string} alt={detail.name} onClose={() => L.close()} />
      )}

      {/* شريط السلة العائم */}
      {bar.mounted && (
        <button onClick={() => { playTap(); L.open("cart"); }} data-cartbar
          className={cn("fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3.5 text-white shadow-raised transition active:scale-[0.99]",
            bar.leaving ? "animate-bar-out" : "animate-bar-in")}>
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
        </button>
      )}

      {/* لوحة السلة / الإتمام */}
      {panel.mounted && (
        <div className={cn("fixed inset-0 z-40 bg-black/40", panel.leaving ? "animate-fade-out" : "animate-fade-plain")}
          onClick={() => L.close()}>
          <div onClick={(e) => e.stopPropagation()}
            className={cn("absolute inset-x-0 bottom-0 mx-auto max-h-[88vh] max-w-3xl overflow-y-auto rounded-t-3xl bg-surface-1 p-4 shadow-raised",
              panel.leaving ? "animate-sheet-out" : "animate-sheet-in")}>
            {/* `shownSheet` لا `sheet`: الإغلاق يجعل `sheet` = "none" فوراً بينما
                اللوحةُ ما زالت تنزلق خارجةً — فبـ`sheet` كانت تقفز من «السلة»
                إلى «الإتمام» أمام عين الزبون بآخر ٢٠٠ms. */}
            {shownSheet.current === "cart" ? (
                <CartSheet
                  cart={cart} byId={byId} subtotal={subtotal} fee={fee} feeKnown={feeKnown} total={total}
                  underMin={underMin} minOrder={minOrder}
                  setQty={setQty} onClose={() => L.close()} onCheckout={() => { playTap(); track("store_checkout_open", { slug }, true); L.swap("checkout"); }} />
              ) : (
                <CheckoutSheet
                  slug={slug} cart={cart} subtotal={subtotal} fee={fee} feeKnown={feeKnown} total={total}
                  onBack={() => L.swap("cart")}
                  onPlaced={(r) => {
                    /* الطلبُ وصل: الطبقاتُ تُطوى من السجلّ (go(-عمق)) قبل شاشة النجاح — لا مدخلَ يتسرّب يعيد الزبونَ لسلّةٍ أُفرغت. */
                    setCart([]); L.placed(); setPlaced(r); playAchievement(); celebrate();
                    // رقم آخر طلب يُحفظ محلياً: صفحة التتبّع تعبّيه تلقائياً لو رجع الزبون بعدين.
                    try { localStorage.setItem(lastOrderKey(slug), r.order_no); } catch { /* ignore */ }
                }} />
            )}
          </div>
        </div>
      )}
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
              /* صورةُ المنتج نفسِه لا إيموجي فئته: الزبونُ يتعرّف على العلبة
                 التي اختارها. والبلاطةُ أرضاً تحتها كما بالبطاقة، فلا يصير
                 السطرُ فارغاً إن فشل التحميل. (بقايا `categoryLook` — البند ١٧.) */
              const shelf = shelfLook(p.name);
              const cimg = productImageUrl(cardImagePath(p.image_path));
              return (
                <div key={l.id} className="flex items-center gap-3 rounded-2xl border border-line p-2.5">
                  <span className={cn("relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-xl text-2xs font-bold", shelf.tile, shelf.ink)}>
                    {shelfMonogram(p.name)}
                    {cimg && <img src={cimg} alt="" className="absolute inset-0 h-full w-full object-contain p-0.5" onError={swapOnce(productImageUrl(p.image_path))} />}
                  </span>
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
      const res = await storeApi.placeStoreOrder(slug,
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
      /* آخرُ درجةٍ بالقمع، و**بلا `once`**: من طلب مرّتين طلبان لا واحد — وهو
       * الحدثُ الوحيد بينها الذي يُعدّ فعلاً لا زائراً مميّزاً (`store_funnel`).
       * ولا مبلغَ ولا اسمَ ولا هاتف بالـ`meta`: القياسُ يسأل «كم» لا «مَن». */
      track("store_order", { slug });
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
