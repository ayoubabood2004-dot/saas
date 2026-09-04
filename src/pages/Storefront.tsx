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
  CheckCircle2, PawPrint, Truck, ShieldCheck, Store, ArrowRight, Loader2, PackageX,
} from "lucide-react";
import type { StoreCatalogItem, StoreFrontInfo } from "@/types";
import { repo } from "@/lib/repo";
import { categoryLook, isValidCustomerPhone } from "@/lib/storeLib";
import { preferArabicForVisitor } from "@/lib/portal";
import { waNumber } from "@/lib/phone";
import { celebrate } from "@/lib/celebrate";
import { playTap, playSuccess, playWarning, playAchievement } from "@/lib/sounds";
import { cn, money, formatNum } from "@/lib/utils";

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
  const [state, setState] = useState<"loading" | "closed" | "open">("loading");
  const [front, setFront] = useState<StoreFrontInfo | null>(null);
  const [catalog, setCatalog] = useState<StoreCatalogItem[]>([]);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string>("all");
  const [cart, setCart] = useState<CartLine[]>(() => loadCart(slug));
  const [sheet, setSheet] = useState<"none" | "cart" | "checkout">("none");
  const [placed, setPlaced] = useState<{ order_no: string; total: number } | null>(null);
  // الكاتلوج يتحمّل بصفحات (٦٠ بالطلب): أول رسم خفيف على موبايل بطيء،
  // و«عرض المزيد» يجيب الباقي. hasMore = آخر صفحة رجعت ممتلئة.
  const PAGE = 60;
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

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
      } catch { if (alive) setState("closed"); }
    })();
    return () => { alive = false; };
  }, [slug]);

  const loadMore = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const more = await repo.storeCatalogPublic(slug, PAGE, catalog.length);
      // إزالة أي تكرار دفاعياً (منتج انضاف بين الصفحتين يزحزح الترتيب).
      setCatalog((cur) => {
        const seen = new Set(cur.map((x) => x.id));
        return [...cur, ...more.filter((x) => !seen.has(x.id))];
      });
      setHasMore(more.length === PAGE);
    } catch { setHasMore(false); }
    finally { setLoadingMore(false); }
  };

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
    const ql = q.trim().toLowerCase();
    return catalog.filter((c) =>
      (cat === "all" || (c.category ?? "other") === cat) &&
      (!ql || c.name.toLowerCase().includes(ql) || (c.subcategory ?? "").toLowerCase().includes(ql) || (c.descr ?? "").toLowerCase().includes(ql)));
  }, [catalog, q, cat]);

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
  if (state === "closed" || !front) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-surface p-6">
        <div className="flex max-w-sm flex-col items-center gap-3 text-center">
          <span className="grid h-16 w-16 place-items-center rounded-3xl bg-surface-2 text-ink-subtle"><Store size={30} /></span>
          <h1 className="font-display text-xl font-extrabold text-ink">المتجر مغلق حالياً</h1>
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
          <h1 className="font-display text-2xl font-extrabold text-ink">وصل طلبك! 🎉</h1>
          <div className="w-full rounded-2xl border border-line bg-surface-1 p-4">
            <p className="text-xs text-ink-subtle">رقم طلبك</p>
            <p className="font-mono text-2xl font-extrabold tracking-wider text-brand-600">{placed.order_no}</p>
            <p className="mt-2 border-t border-line pt-2 text-sm font-bold text-ink">{money(placed.total)} <span className="text-xs font-normal text-ink-subtle">— الدفع عند الاستلام</span></p>
          </div>
          <p className="text-sm leading-relaxed text-ink-muted">{front.name} راح تأكد طلبك وتتواصل وياك قريباً. احتفظ برقم الطلب.</p>
          {front.whatsapp && (
            <a href={`https://wa.me/${waNumber(front.whatsapp, "+964")}?text=${encodeURIComponent(waMsg)}`} target="_blank" rel="noreferrer"
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#25D366] px-4 py-3 text-sm font-extrabold text-white transition active:scale-[0.98]">
              <MessageCircle size={17} /> راسل العيادة بالواتساب
            </a>
          )}
          <button onClick={() => { playTap(); setPlaced(null); }} className="flex items-center gap-1.5 text-sm font-bold text-brand-600">
            <ArrowRight size={15} className="rtl:rotate-180" /> رجوع للمتجر
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
      <header className="relative overflow-hidden bg-brand-grad px-4 pb-8 pt-8 text-white">
        <div className="pointer-events-none absolute -end-8 -top-8 h-40 w-40 rounded-full bg-white/10" />
        <div className="pointer-events-none absolute -bottom-10 start-10 h-32 w-32 rounded-full bg-white/10" />
        <div className="relative mx-auto flex max-w-3xl items-center gap-4">
          {front.logo_url
            ? <img src={front.logo_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-white object-contain p-1 shadow-raised" />
            : <span className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-white/15 shadow-raised"><PawPrint size={30} /></span>}
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-bold uppercase tracking-widest text-white/70">متجر العيادة</p>
            <h1 className="truncate font-display text-2xl font-extrabold">{front.name}</h1>
            {front.bio && <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-white/85">{front.bio}</p>}
          </div>
        </div>
        <div className="relative mx-auto mt-4 flex max-w-3xl flex-wrap items-center gap-2 text-2xs font-bold">
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1"><Truck size={12} /> {fee > 0 ? `توصيل ${money(fee)}` : "توصيل — يحدد عند التأكيد"}</span>
          {minOrder > 0 && <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1">الحد الأدنى {money(minOrder)}</span>}
          <span className="flex items-center gap-1 rounded-full bg-white/15 px-2.5 py-1"><ShieldCheck size={12} /> الدفع عند الاستلام</span>
          <span className="ms-auto flex items-center gap-1.5">
            {front.whatsapp && (
              <a href={`https://wa.me/${waNumber(front.whatsapp, "+964")}`} target="_blank" rel="noreferrer" aria-label="واتساب"
                className="grid h-8 w-8 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"><MessageCircle size={15} /></a>
            )}
            {front.phone && (
              <a href={`tel:${front.phone}`} aria-label="اتصال" className="grid h-8 w-8 place-items-center rounded-full bg-white/15 transition hover:bg-white/25"><Phone size={15} /></a>
            )}
          </span>
        </div>

        {/* بابُ المالك (0154): الرابطُ العام نفسه يوصله لملفّ حيوانه — لا رابطَ
            ثانٍ تدزّه العيادة، ولا حسابَ يُنشأ. زرٌّ واحد بأعلى الصفحة. */}
        <Link to={`/p/${slug}`} onClick={() => playTap()}
          className="relative mx-auto mt-4 flex max-w-3xl items-center justify-between gap-3 rounded-2xl bg-white/15 px-4 py-3 backdrop-blur transition hover:bg-white/25 active:scale-[0.99]">
          <span className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/20"><PawPrint size={18} /></span>
            <span className="min-w-0">
              <span className="block text-sm font-extrabold leading-tight">{t("portal.cta", "شوف حيواناتي")}</span>
              <span className="block text-2xs leading-tight text-white/80">{t("portal.ctaSub", "اللقاحات، العلاج، وحالته الآن")}</span>
            </span>
          </span>
          <ArrowRight size={17} className="shrink-0 rotate-180" />
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
            <div className="flex gap-1.5 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <CatChip active={cat === "all"} onClick={() => { playTap(); setCat("all"); }} label="الكل" emoji="✨" />
              {cats.map((c) => {
                const look = categoryLook(c);
                return <CatChip key={c} active={cat === c} onClick={() => { playTap(); setCat(c); }} label={look.label} emoji={look.emoji} />;
              })}
            </div>
          )}
        </div>
      </div>

      {/* الكاتلوج */}
      <main className="mx-auto max-w-3xl px-4 py-4">
        {catalog.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle">
            <PackageX size={30} className="opacity-40" />
            <p className="text-sm font-semibold">المتجر يرتّب رفوفه — ارجع قريباً 🐾</p>
          </div>
        ) : shown.length === 0 ? (
          <div className="grid place-items-center gap-2 py-16 text-center text-ink-subtle">
            <Search size={26} className="opacity-40" />
            <p className="text-sm font-semibold">ما لكينا شيء مطابق</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {shown.map((p, i) => {
              const look = categoryLook(p.category);
              const inCart = qtyOf(p.id);
              return (
                <motion.div key={p.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.03, 0.3) }}
                  className={cn("relative flex flex-col overflow-hidden rounded-2xl border bg-surface-1 transition",
                    inCart > 0 ? "border-brand-400 shadow-raised" : "border-line",
                    !p.available && "opacity-60")}>
                  <div className={cn("grid h-24 place-items-center bg-gradient-to-br text-4xl", look.grad)}>
                    {look.emoji}
                  </div>
                  {!p.available && (
                    <span className="absolute start-2 top-2 rounded-full bg-ink/70 px-2 py-0.5 text-2xs font-bold text-white">نافد حالياً</span>
                  )}
                  <div className="flex flex-1 flex-col gap-1 p-3">
                    <p className="line-clamp-2 text-sm font-bold leading-snug text-ink">{p.name}</p>
                    {p.descr && <p className="line-clamp-2 text-2xs leading-relaxed text-ink-subtle">{p.descr}</p>}
                    {p.subcategory && <span className="self-start rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-subtle">{p.subcategory}</span>}
                    <div className="mt-auto flex items-center justify-between pt-1.5">
                      <p className="font-display text-sm font-extrabold tabular-nums text-brand-600">{money(p.price)}</p>
                      {!p.available ? (
                        <span className="text-2xs font-bold text-ink-subtle">غير متاح</span>
                      ) : inCart === 0 ? (
                        <button onClick={() => add(p.id)} aria-label={`أضف ${p.name}`}
                          className="grid h-9 w-9 place-items-center rounded-xl bg-brand-600 text-white shadow-soft transition hover:bg-brand-700 active:scale-90">
                          <Plus size={17} />
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5 rounded-xl bg-brand-50 p-1 dark:bg-brand-500/15">
                          <button onClick={() => { playTap(); setQty(p.id, inCart - 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-white text-brand-700 shadow-soft transition active:scale-90 dark:bg-surface-1">
                            <Minus size={14} />
                          </button>
                          <span className="w-5 text-center text-sm font-extrabold tabular-nums text-brand-700 dark:text-brand-300">{formatNum(inCart)}</span>
                          <button onClick={() => add(p.id)} className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white shadow-soft transition active:scale-90">
                            <Plus size={14} />
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
        {hasMore && (
          <button onClick={() => void loadMore()} disabled={loadingMore}
            className="mt-4 w-full rounded-2xl border border-line bg-surface-1 py-3 text-sm font-bold text-ink-muted transition hover:text-ink disabled:opacity-50">
            {loadingMore ? "جاري التحميل…" : "عرض المزيد من المنتجات"}
          </button>
        )}
        <p className="mt-8 flex items-center justify-center gap-1.5 text-2xs text-ink-subtle"><PawPrint size={12} /> متجر مقدَّم من doctorVet</p>
      </main>

      {/* شريط السلة العائم */}
      <AnimatePresence>
        {units > 0 && sheet === "none" && (
          <motion.button initial={{ y: 80 }} animate={{ y: 0 }} exit={{ y: 80 }} transition={{ type: "spring", damping: 22 }}
            onClick={() => { playTap(); setSheet("cart"); }}
            className="fixed inset-x-4 bottom-4 z-30 mx-auto flex max-w-3xl items-center gap-3 rounded-2xl bg-brand-600 px-4 py-3.5 text-white shadow-raised transition active:scale-[0.99]">
            <span className="relative">
              <ShoppingCart size={20} />
              <span className="absolute -end-2 -top-2 grid h-5 min-w-5 place-items-center rounded-full bg-white px-1 text-2xs font-extrabold text-brand-700">{formatNum(units)}</span>
            </span>
            <span className="flex-1 text-start text-sm font-extrabold">عرض السلة</span>
            <span className="font-display text-base font-extrabold tabular-nums">{money(subtotal)}</span>
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
                  cart={cart} byId={byId} subtotal={subtotal} fee={fee} total={total}
                  underMin={underMin} minOrder={minOrder}
                  setQty={setQty} onClose={() => setSheet("none")} onCheckout={() => { playTap(); setSheet("checkout"); }} />
              ) : (
                <CheckoutSheet
                  slug={slug} cart={cart} subtotal={subtotal} fee={fee} total={total}
                  onBack={() => setSheet("cart")}
                  onPlaced={(r) => { setCart([]); setSheet("none"); setPlaced(r); playAchievement(); celebrate(); }} />
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function CatChip({ active, onClick, label, emoji }: { active: boolean; onClick: () => void; label: string; emoji: string }) {
  return (
    <button onClick={onClick}
      className={cn("flex shrink-0 items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold transition",
        active ? "bg-brand-600 text-white shadow-soft" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>
      <span>{emoji}</span> {label}
    </button>
  );
}

/* ------------------------------- السلة ------------------------------- */

function CartSheet({ cart, byId, subtotal, fee, total, underMin, minOrder, setQty, onClose, onCheckout }: {
  cart: CartLine[]; byId: Map<string, StoreCatalogItem>;
  subtotal: number; fee: number; total: number; underMin: boolean; minOrder: number;
  setQty: (id: string, qty: number) => void; onClose: () => void; onCheckout: () => void;
}) {
  return (
    <div dir="rtl">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="flex items-center gap-2 font-display text-lg font-extrabold text-ink"><ShoppingCart size={19} className="text-brand-600" /> سلتك</h2>
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
                    <span className="w-5 text-center text-sm font-extrabold tabular-nums text-ink">{formatNum(l.qty)}</span>
                    <button onClick={() => { playTap(); setQty(l.id, l.qty + 1); }} className="grid h-7 w-7 place-items-center rounded-lg bg-brand-600 text-white transition active:scale-90"><Plus size={13} /></button>
                  </div>
                  <p className="w-20 shrink-0 text-end text-sm font-extrabold tabular-nums text-ink">{money(p.price * l.qty)}</p>
                </div>
              );
            })}
          </div>
          <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-sm">
            <p className="flex justify-between text-ink-muted"><span>المجموع</span><span className="tabular-nums">{money(subtotal)}</span></p>
            {fee > 0 && <p className="flex justify-between text-ink-muted"><span>التوصيل</span><span className="tabular-nums">{money(fee)}</span></p>}
            <p className="flex justify-between font-display text-base font-extrabold text-ink"><span>الكلي</span><span className="tabular-nums">{money(total)}</span></p>
          </div>
          {underMin && (
            <p className="mt-2 rounded-xl bg-warn-50 px-3 py-2 text-xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">
              الحد الأدنى للطلب {money(minOrder)} — ضيف {money(minOrder - subtotal)} بعد.
            </p>
          )}
          <button onClick={onCheckout} disabled={underMin}
            className="mt-3 w-full rounded-2xl bg-brand-600 py-3.5 text-sm font-extrabold text-white shadow-soft transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50">
            إتمام الطلب — الدفع عند الاستلام
          </button>
        </>
      )}
    </div>
  );
}

/* ------------------------------ الإتمام ------------------------------ */

function CheckoutSheet({ slug, cart, subtotal, fee, total, onBack, onPlaced }: {
  slug: string; cart: CartLine[]; subtotal: number; fee: number; total: number;
  onBack: () => void; onPlaced: (r: { order_no: string; total: number }) => void;
}) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [note, setNote] = useState("");
  const [trap, setTrap] = useState(""); // honeypot — الإنسان ما يشوفه ولا يعبيه
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => { const t = setTimeout(() => nameRef.current?.focus(), 250); return () => clearTimeout(t); }, []);

  const valid = name.trim().length >= 2 && isValidCustomerPhone(phone);

  const submit = async () => {
    if (busy) return;
    setErr(null);
    if (trap.trim()) return; // بوت عبّى الفخ — نتجاهله بصمت
    if (name.trim().length < 2) { setErr("اكتب اسمك الكامل."); playWarning(); return; }
    if (!isValidCustomerPhone(phone)) { setErr("رقم الهاتف غير صحيح — مثال: 07901234567"); playWarning(); return; }
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
        <h2 className="font-display text-lg font-extrabold text-ink">معلوماتك للتوصيل</h2>
        <button onClick={onBack} className="flex items-center gap-1 text-xs font-bold text-brand-600"><ArrowRight size={14} className="rtl:rotate-180" /> رجوع للسلة</button>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-ink-subtle">بلا تسجيل وبلا حسابات — بس اسمك ورقمك وعنوانك، والعيادة تتواصل وياك للتأكيد.</p>
      <div className="space-y-2.5">
        <input ref={nameRef} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="اسمك الكامل *" className="input" />
        <input dir="ltr" inputMode="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} placeholder="* 07xxxxxxxxx" className="input text-left" />
        <div className="relative">
          <MapPin size={15} className="pointer-events-none absolute end-3 top-3 text-ink-subtle" />
          <textarea rows={2} value={address} maxLength={300} onChange={(e) => setAddress(e.target.value)} placeholder="عنوانك للتوصيل (المنطقة، أقرب نقطة دالة…)" className="input min-h-[3.5rem] resize-y pe-9 text-sm" />
        </div>
        <textarea rows={2} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} placeholder="ملاحظات إضافية (اختياري)" className="input min-h-[2.5rem] resize-y text-sm" />
        {/* فخ البوتات — مخفي عن البشر تماماً */}
        <input value={trap} onChange={(e) => setTrap(e.target.value)} tabIndex={-1} autoComplete="off" aria-hidden="true"
          className="absolute -z-10 h-0 w-0 opacity-0" placeholder="company" />
      </div>
      <div className="mt-3 space-y-1 rounded-2xl bg-surface-2 p-3 text-sm">
        <p className="flex justify-between text-ink-muted"><span>{formatNum(cart.reduce((s, l) => s + l.qty, 0))} منتج</span><span className="tabular-nums">{money(subtotal)}</span></p>
        {fee > 0 && <p className="flex justify-between text-ink-muted"><span>التوصيل</span><span className="tabular-nums">{money(fee)}</span></p>}
        <p className="flex justify-between font-display text-base font-extrabold text-ink"><span>الكلي عند الاستلام</span><span className="tabular-nums">{money(total)}</span></p>
      </div>
      {err && <p className="mt-2 rounded-xl bg-danger-50 px-3 py-2 text-xs font-bold text-danger-600 dark:bg-danger-500/15 dark:text-danger-300">{err}</p>}
      <button onClick={() => void submit()} disabled={busy || !valid}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl bg-brand-600 py-3.5 text-sm font-extrabold text-white shadow-soft transition hover:bg-brand-700 active:scale-[0.99] disabled:opacity-50">
        {busy ? <Loader2 size={17} className="animate-spin" /> : <CheckCircle2 size={17} />}
        {busy ? "يرسل طلبك…" : "أرسل الطلب 🚀"}
      </button>
      <p className="mt-2 flex items-center justify-center gap-1 text-2xs text-ink-subtle"><ShieldCheck size={12} /> الدفع نقداً عند الاستلام — ما ندفعك تدفع شيء الآن</p>
    </div>
  );
}
