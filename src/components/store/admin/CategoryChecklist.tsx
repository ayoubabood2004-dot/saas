import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { ArrowRight, ListOrdered, Search, Sparkles, X } from "lucide-react";
import type { Product } from "@/types";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { checklistOpen, diffOps, useStoreCats } from "@/lib/storeCats";
import { isListed, type CatRow } from "@/lib/storeCatIndex";
import { cardImagePath, catGlyph, categoryLook, productImageUrl, shelfLook, shelfMonogram } from "@/lib/storeLib";
import { catError } from "./catErrors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatNum, localISO, searchable } from "@/lib/utils";
import { SortList } from "./SortList";
import type { LeaveGuard } from "./CategoriesTab";

/* ============================================================================
 * قائمةُ تأشير تصنيف (O3) — رفيقةُ «المتجر الإلكتروني».
 *
 * «خلّي المصوّر يفتح أيَّ تصنيف ويسوّي اختيار: الموجودة مؤشَّرة والباقي لا». فالقائمةُ **كلُّ**
 * موادّ العيادة (الحقولُ خارجها): الأعضاءُ أوّلاً بترتيب العيادة ثم الباقي بالاسم — والترتيبُ
 * **يُجمَّد** لحظةَ الفتح فلا ينطّ صفٌّ تحت الإصبع حين يُؤشَّر. والحفظُ **نداءٌ واحد** (إضافةٌ
 * وإزالةٌ ذرّيتان)، والعدُّ بالتذييل يقول ما سيُكتب قبل كتابته.
 *
 * والرسمُ ١٠٠ صفّ ثم «عرض المزيد» مع «١٠٠ من ١١٠١» — قائمةٌ ناقصةٌ تُعرض كاملةً كذبةٌ تُصدَّق
 * (CLAUDE.md). والمغادرةُ بتغييرٍ لم يُحفظ تسأل بورقةٍ داخل التطبيق، لا بنافذة متصفّح.
 * ==========================================================================*/

const PAGE = 100;
type Show = "all" | "on" | "off";

export function CategoryChecklist({ cat, products, productsFailed, onRetryProducts, canEdit, guard, onBack }: {
  cat: CatRow;
  /** موادُّ العيادة خارج الحقول — null = لم تصل بعد (أو فشلت: `productsFailed`). ليست «صفرَ مواد». */
  products: Product[] | null;
  productsFailed: boolean;
  onRetryProducts: () => void;
  canEdit: boolean;
  guard: LeaveGuard;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const navigate = useNavigate();
  const cats = useStoreCats();
  const members = cats.membersOf(cat.id);
  const base = useMemo(() => new Set(members), [members]);
  const [add, setAdd] = useState<Set<string>>(() => new Set());
  const [drop, setDrop] = useState<Set<string>>(() => new Set());
  const [q, setQ] = useState("");
  const [show, setShow] = useState<Show>("all");
  const [limit, setLimit] = useState(PAGE);
  const [saving, setSaving] = useState(false);
  const [ordering, setOrdering] = useState(false);
  const [bannerOff, setBannerOff] = useState(false);
  const [pending, setPending] = useState<(() => void) | null>(null);

  /* التغييرُ نسبيٌّ للمؤكَّد: لقطةٌ جديدة (رجوعٌ للتبويب، جهازٌ ثانٍ) لا تمحو ما أشّرته. */
  const added = [...add].filter((id) => !base.has(id));
  const removed = [...drop].filter((id) => base.has(id));
  const dirty = added.length + removed.length > 0;
  const on = (id: string) => (base.has(id) && !drop.has(id)) || add.has(id);
  const set = (id: string, v: boolean) => {
    setAdd((s) => { const n = new Set(s); if (v && !base.has(id)) n.add(id); else n.delete(id); return n; });
    setDrop((s) => { const n = new Set(s); if (!v && base.has(id)) n.add(id); else n.delete(id); return n; });
  };
  const setMany = (ids: string[]) => ids.forEach((id) => set(id, true));

  /* الترتيبُ المجمَّد ولافتةُ البذرة: يُحسبان **مرّةً حين تصل المنتجات** (checklistOpen) — الأعضاءُ
   * بترتيبهم ثم الباقي بالاسم. ومادّةٌ تصل بعدها (إعادةُ تحميل) تُلحق بالآخر. */
  const opened = useRef<{ order: string[]; seedPool: string[] } | null>(null);
  if (!opened.current && products) opened.current = checklistOpen(members, products, cat.seed_key);
  const list = useMemo(() => products ?? [], [products]);
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const order = useMemo(() => {
    const o = opened.current;
    if (!o) return [];
    const known = new Set(o.order);
    o.order = [...o.order.filter((id) => byId.has(id)), ...list.filter((p) => !known.has(p.id)).map((p) => p.id)];
    return o.order;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byId]);

  /* صنفُ المخزون باسمه بالمخزون نفسِه (pos.cat.*، باللغتين) — لا `categoryLook().label`: ذاك نصُّ واجهة
   * الزبون العربيةِ وحدها، فكان يُحشر عربياً داخل جملةٍ إنكليزية («Tick all items of kind: أدوية»). */
  const kindName = (k: string | null) => t(`pos.cat.${k}`, categoryLook(k).label);

  const today = localISO();
  const ql = searchable(q);
  const rows = order.filter((id) => {
    const p = byId.get(id) as Product;
    if (ql && !searchable(p.name).includes(ql) && !searchable(p.subcategory).includes(ql)) return false;
    return show === "all" || (show === "on" ? on(id) : !on(id));
  });
  const nOn = order.filter(on).length;

  /* اختيارٌ سريع بصنف المخزون، ولافتةُ البذرة: موادُّ صنفُها صنفُ هذا التصنيف وليست فيه. */
  const kinds = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of list) if (p.category) m.set(p.category, (m.get(p.category) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [list]);
  /* اللافتةُ تُحسب **لحظةَ الفتح** على المؤكَّد وتبقى بمكانها: كانت تتبع التأشير، فشطبُ مادّةٍ من
   * الصنف يُظهرها فوق القائمة فينزل كلُّ صفٍّ تحت الإصبع، والضغطةُ التالية تقع على الصفّ الخطأ
   * (قيس بالمتصفّح: «شلت ١ وأضفت ٢» صارت «أضفت ١»). العددُ وحده يتبع التأشير. */
  const seedPool = opened.current?.seedPool ?? [];
  const missing = seedPool.filter((id) => !on(id));

  const save = async (): Promise<boolean> => {
    if (!dirty || saving) return true;
    const a = added.length, r = removed.length;
    setSaving(true);
    try {
      // المؤكَّدُ ناقصاً ما شِلته زائداً ما أضفته — لا «ما تراه الشاشة»: عضوٌ لا تعرضه هذه
      // القائمة (مادّةُ حقلٍ، أو لم تصل بقائمة المصوّر) كان حسابُه من الشاشة سيشيله بصمت.
      await cats.apply(diffOps(cat.id, base, new Set([...[...base].filter((id) => !drop.has(id)), ...added])));
      setAdd(new Set()); setDrop(new Set());
      playSuccess();
      toast.success(t("cat.checkSaved", "انحفظ — أضفت {{a}} وشلت {{r}}", { a: formatNum(a), r: formatNum(r) }));
      return true;
    } catch (e) {
      playWarning();
      toast.error(t("cat.saveFailed", "ما انحفظ"), catError(e, t));
      return false;
    } finally { setSaving(false); }
  };
  const discard = () => { setAdd(new Set()); setDrop(new Set()); };

  /* المغادرة: الأبُ يسأل (تبويبٌ آخر)، والرجوعُ يسأل، وروابطُ التطبيق تسأل — بورقة. */
  const ask = (proceed: () => void): boolean => {
    if (!dirty) return true;
    setPending(() => proceed);
    return false;
  };
  useEffect(() => {
    guard.current = ask;
    return () => { guard.current = null; };
  });
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || a.closest("[data-catcheck]")) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin) return;
      e.preventDefault(); e.stopPropagation();
      setPending(() => () => navigate(url.pathname + url.search + url.hash));
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [dirty, navigate]);

  const back = () => { if (ask(onBack)) onBack(); };
  const chip = (id: Show, label: string) => (
    <button type="button" onClick={() => { playTap(); setShow(id); setLimit(PAGE); }}
      className={cn("rounded-full px-3 py-1.5 text-xs font-semibold transition",
        show === id ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2")}>{label}</button>
  );
  const shown = rows.slice(0, limit);

  return (
    <div className="space-y-3 pb-2" data-catcheck>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => { playTap(); back(); }} aria-label={t("cat.back", "رجوع")} data-catback
          className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition hover:bg-surface-2">
          <ArrowRight size={18} className="ltr:rotate-180" />
        </button>
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl">{catGlyph(cat.icon)}</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-base font-extrabold text-ink">{cat.name}</p>
          {products
            ? <p className="text-2xs text-ink-subtle tabular-nums">{t("cat.checkCount", "{{n}} مادة مؤشّرة من {{m}}", { n: formatNum(nOn), m: formatNum(order.length) })}</p>
            : <span className="mt-1 block h-3 w-28 animate-pulse rounded bg-surface-2" data-countsloading />}
        </div>
        {canEdit && products && base.size > 1 && (
          <Button size="sm" variant={ordering ? "primary" : "outline"} leftIcon={<ListOrdered size={14} />} disabled={dirty}
            title={dirty ? t("cat.orderAfterSave", "احفظ التأشير أوّلاً") : undefined}
            onClick={() => { playTap(); setOrdering((v) => !v); }} data-catorder>
            {ordering ? t("cat.orderDone", "خلص الترتيب") : t("cat.orderItems", "رتّب")}
          </Button>
        )}
      </div>

      {cats.status === "error" && (
        /* قراءةٌ ثانيةٌ فشلت (رجوعٌ للتطبيق بشبكةٍ متعثّرة): المؤشَّرُ آخرُ ما وصل — يُقال ويُعاد،
           والحفظُ ما زال يمرّ بختم آخر قراءةٍ نجحت (storeCats.isStamped). */
        <div className="flex items-center gap-2 rounded-2xl border border-warn-300 bg-warn-50/60 p-3 text-xs font-semibold text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-200" data-catstale>
          <span className="min-w-0 flex-1">{t("cat.staleWarn", "آخر تحديث فشل — المعروض قد يكون قديماً.")}</span>
          <button type="button" className="underline" onClick={() => { playTap(); cats.retry(); }}>{t("common.retry", "إعادة المحاولة")}</button>
        </div>
      )}

      {!products ? (
        /* المنتجاتُ لم تصل (أو فشلت): لا قائمةَ تُرسم ولا ترتيبَ يُجمَّد — «ما اكو مواد» عن قائمةٍ لم تصل
           كذبةٌ تُصدَّق، وتأشيرٌ عليها يُبنى على لا شيء. */
        productsFailed ? (
          <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10" data-itemsfailed>
            <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("cat.itemsFailed", "ما وصلت قائمة المواد — الأعداد ما تنعرف. أعد المحاولة.")}</p>
            <Button size="sm" variant="secondary" onClick={() => { playTap(); onRetryProducts(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
          </div>
        ) : (
          <div className="space-y-1.5">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-[4.5rem] rounded-2xl" />)}</div>
        )
      ) : ordering ? (
        <ItemOrder catId={cat.id} ids={members.filter((id) => byId.has(id))} byId={byId} />
      ) : (
        <>
          {!bannerOff && seedPool.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-300 bg-brand-50/60 p-3 dark:border-brand-500/40 dark:bg-brand-500/10" data-seedbanner>
              <Sparkles size={16} className="shrink-0 text-brand-600" />
              <span className="min-w-0 flex-1 text-xs font-semibold text-ink">
                {t("cat.seedBanner", "مواد صنفها {{name}} وما بهذا التصنيف ({{n}}) — أضفها", { name: kindName(cat.seed_key), n: formatNum(missing.length) })}
              </span>
              <Button size="sm" disabled={!missing.length} onClick={() => { playTap(); setMany(missing); }}>{t("cat.seedAdd", "أشّرها")}</Button>
              <button type="button" onClick={() => setBannerOff(true)} aria-label={t("cat.dismiss", "إخفاء")} className="text-ink-subtle"><X size={15} /></button>
            </div>
          )}

          <div className="relative">
            <Search size={15} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input className="input ps-9" value={q} onChange={(e) => { setQ(e.target.value); setLimit(PAGE); }} placeholder={t("cat.checkSearch", "دوّر بالمواد…")} />
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {chip("all", t("cat.showAll", "الكل"))}
            {chip("on", t("cat.showOn", "المختار ({{n}})", { n: formatNum(nOn) }))}
            {chip("off", t("cat.showOff", "غير المختار"))}
            {kinds.length > 0 && (
              <select value="" onChange={(e) => { const k = e.target.value; if (k) { playTap(); setMany(list.filter((p) => p.category === k).map((p) => p.id)); } }}
                aria-label={t("cat.quickPickLabel", "حدّد كل مواد صنف")} data-quickpick
                className="ms-auto max-w-[60%] rounded-full border border-line bg-surface-1 px-3 py-1.5 text-xs font-semibold text-ink-muted outline-none">
                <option value="">{t("cat.quickPickLabel", "حدّد كل مواد صنف")}…</option>
                {kinds.map(([k, n]) => <option key={k} value={k}>{t("cat.quickPick", "حدّد كل مواد صنف: {{name}} ({{n}})", { name: kindName(k), n: formatNum(n) })}</option>)}
              </select>
            )}
          </div>

          {rows.length === 0 ? (
            <div className="card grid place-items-center p-8 text-sm text-ink-subtle">{t("cat.checkEmpty", "ما اكو مواد مطابقة.")}</div>
          ) : (
            <div className="space-y-1.5">
              {shown.map((id) => {
                const p = byId.get(id) as Product;
                const v = on(id);
                const changed = v !== base.has(id);
                return (
                  <label key={id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-2xl border bg-surface-1 p-2 transition hover:bg-surface-2",
                    v ? "border-brand-300 dark:border-brand-500/40" : "border-line", changed && "ring-2 ring-accent-300")} data-checkrow>
                    <input type="checkbox" checked={v} onChange={(e) => set(id, e.target.checked)} className="h-5 w-5 shrink-0 accent-brand-600" />
                    <Thumb p={p} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink" dir="auto">{p.name}</span>
                      {!isListed(p, today) && <span className="mt-0.5 inline-block rounded-full bg-surface-2 px-2 py-0.5 text-2xs font-bold text-ink-subtle">{t("cat.notListed", "مخفي بالمتجر")}</span>}
                    </span>
                  </label>
                );
              })}
              {rows.length > shown.length && (
                <div className="flex flex-col items-center gap-1.5 pt-1">
                  <p className="text-2xs text-ink-subtle tabular-nums">{t("cat.partial", "{{n}} من {{m}}", { n: formatNum(shown.length), m: formatNum(rows.length) })}</p>
                  <Button size="sm" variant="outline" onClick={() => setLimit((n) => n + PAGE)} data-checkmore>{t("cat.more", "عرض المزيد")}</Button>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {dirty && !ordering && (
        <div className="sticky bottom-0 z-20 -mx-1 flex items-center gap-2 rounded-2xl border border-line bg-surface-1/95 p-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-raised backdrop-blur" data-checkfooter>
          <Button className="flex-1" onClick={() => void save()} loading={saving} data-checksave>
            {t("cat.saveDiff", "احفظ — أضفت {{a}} وشلت {{r}}", { a: formatNum(added.length), r: formatNum(removed.length) })}
          </Button>
          <Button variant="outline" onClick={() => { playTap(); discard(); }} data-checkundo>{t("cat.undo", "تراجع")}</Button>
        </div>
      )}

      <Modal open={!!pending} onClose={() => setPending(null)} title={t("cat.leaveTitle", "عندك تغييرات ما انحفظت")}>
        <div className="space-y-3" data-leavesheet>
          <p className="text-sm text-ink">{t("cat.leaveBody", "أضفت {{a}} وشلت {{r}} بـ«{{name}}» وما حفظتها.", { a: formatNum(added.length), r: formatNum(removed.length), name: cat.name })}</p>
          <Button className="w-full" loading={saving} onClick={async () => { const go = pending; if (await save()) { setPending(null); go?.(); } }}>{t("cat.leaveSave", "احفظ وكمّل")}</Button>
          <Button className="w-full" variant="danger" onClick={() => { const go = pending; discard(); setPending(null); go?.(); }}>{t("cat.leaveDrop", "اترك التغييرات")}</Button>
          <Button className="w-full" variant="outline" onClick={() => setPending(null)}>{t("cat.leaveStay", "ارجع للقائمة")}</Button>
        </div>
      </Modal>
    </div>
  );
}

function Thumb({ p }: { p: Product }) {
  if (!p.image_path) {
    const look = shelfLook(p.name);
    return <span className={cn("grid h-14 w-14 shrink-0 place-items-center rounded-xl text-sm font-bold", look.tile, look.ink)}>{shelfMonogram(p.name)}</span>;
  }
  return (
    <img src={productImageUrl(cardImagePath(p.image_path)) ?? ""} alt="" loading="lazy"
      className="h-14 w-14 shrink-0 rounded-xl border border-line bg-white object-contain p-0.5"
      onError={(e) => { const u = productImageUrl(p.image_path); if (u && e.currentTarget.src !== u) e.currentTarget.src = u; else e.currentTarget.hidden = true; }} />
  );
}

/** ترتيبُ موادّ التصنيف كما يراها الزبون — للمدير والطبيب؛ كلُّ نقلٍ عمليةٌ واحدة. */
function ItemOrder({ catId, ids, byId }: { catId: string; ids: string[]; byId: Map<string, Product> }) {
  const { t } = useTranslation();
  const toast = useToast();
  const cats = useStoreCats();
  return (
    <div className="space-y-2" data-itemorder>
      <p className="text-xs text-ink-subtle">{t("cat.orderHint", "بهذا الترتيب تطلع المواد للزبون داخل التصنيف.")}</p>
      <SortList ids={ids}
        onMove={(id, after) => {
          cats.apply([{ op: "move_item", cat: catId, id, after }]).catch((e) => { playWarning(); toast.error(t("cat.saveFailed", "ما انحفظ"), catError(e, t)); });
        }}
        row={(id, { handle, arrows }) => {
          const p = byId.get(id) as Product;
          return (
            <div className="card flex items-center gap-2 p-2">
              {handle}
              {arrows}
              <Thumb p={p} />
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink" dir="auto">{p.name}</span>
            </div>
          );
        }} />
    </div>
  );
}
