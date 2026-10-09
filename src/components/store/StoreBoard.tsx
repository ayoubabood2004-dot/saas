import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Camera, CheckSquare, Eye, EyeOff, FolderInput, ImageOff, Images, Layers, ListOrdered, Loader2, Maximize2,
  MonitorSmartphone, RotateCw, ScanLine, Search, Sparkles, Square, Tag, Wand2, X,
} from "lucide-react";
import type { PhotoProduct, PriceReviewRow, StorePublishResult, StoreSection, SuggestedProduct } from "@/types";
import { repo } from "@/lib/repo";
import { useAuth } from "@/contexts/AuthContext";
import { usePermissions } from "@/hooks/usePermissions";
import { useBarcodeScanner } from "@/hooks/useBarcodeScanner";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { localISO } from "@/lib/utils";
import { cn, formatNum, money } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { Button, Skeleton, useToast } from "@/components/ui";
import { ImageLightbox } from "@/components/ImageLightbox";
import {
  BOARD_FILTERS, QUIET_WHEN_ZERO, boardCounts, findByScan, hasPhoto, inFilter, isExpired, isOut, matchesQuery,
  progress, readiness, sortBoard, type BoardFilter, type BoardSort,
} from "@/lib/storeBoard";
import { thumbOf, type ImageMeta } from "@/lib/productPhoto";
import { usePhotoFlow } from "./usePhotoFlow";
import { ProductSheet, PhotoDetails } from "./ProductSheet";
import { SectionsPanel } from "./SectionsPanel";
import { PriceReview } from "./PriceReview";
import { CustomerPreview } from "./CustomerPreview";
import { CameraScan, cameraScanSupported } from "./CameraScan";
import { missText, publishToast } from "./publishToast";

/* ============================================================================
 * لوحةُ المتجر والصور (0229) — شاشةُ المصوّر، وتشكيلةُ المتجر للمدير، بنسخةٍ واحدة.
 *
 * ── لماذا لوحةٌ واحدة ─────────────────────────────────────────────────────
 * كانت شاشتان: «صور المنتجات» (صوّر فقط) و«تشكيلة المتجر» (انشر، سعّر، وصف).
 * المقيسُ بالإنتاج (٩/١٠): المصوّرُ صوّر ٣٤ منتجاً بيومين، ٢١ منها بقيت غيرَ
 * منشورة، وصفرُ نشرٍ أو وصفٍ أو سعر — الشغلُ يقف عند الصورة لأن ما بعدها
 * بشاشةٍ ثانية. هنا كلُّ منتجٍ بطاقةٌ تقول حالَه بلمحة، ومنها يكمّله.
 *
 * ── وما يحكم الأرقام ────────────────────────────────────────────────────
 * العدّادُ والتصفيةُ والنشرُ الجماعيّ من تعريفٍ واحد (`storeBoard.ts`)، والنشرُ
 * بالخادم (`store_publish`) يقول ما تخطّاه ولماذا — لا نجاحَ نصفيّاً صامتاً.
 * والقائمةُ الفاشلةُ حالةٌ تُقال مع «أعد المحاولة»، لا «ماكو منتجات» عن خطأ.
 * ==========================================================================*/

const PAGE = 48;
type View = "products" | "sections" | "prices";

export function StoreBoard({ mode, initialFilter, canSuggest = false, storeSlug = null, storeOn = false, onChanged }: {
  /** photos: شاشةُ المصوّر (تبدأ بـ«بلا صورة»)؛ store: تشكيلةُ المتجر. */
  mode: "photos" | "store";
  initialFilter?: BoardFilter;
  /** «انشر أكثر ما تبيع» — مبنيٌّ على المبيعات، للكادر لا للمصوّر. */
  canSuggest?: boolean;
  storeSlug?: string | null;
  storeOn?: boolean;
  /** شيءٌ تغيّر بالخادم — الأبُ يعرف أن قراءته القديمة صارت قديمة. */
  onChanged?: () => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const { can, role, baseRole } = usePermissions();
  const clinicId = user?.clinic_id ?? user?.id ?? null;
  const canStore = can("manageStore");
  const canPhotos = canStore || can("manageProductPhotos");
  // السعرُ سعرُ الكاشير: للمدير والطبيب والمصوّر (0228) — المصوّرُ من store_set_price وحدها.
  const canPrice = canStore && (role === "manager" || role === "veterinarian" || baseRole === "photographer");
  const priceViaStore = baseRole === "photographer";

  const [rows, setRows] = useState<PhotoProduct[] | "loading" | "error">("loading");
  const [sections, setSections] = useState<StoreSection[]>([]);
  const [sectionsFailed, setSectionsFailed] = useState(false);
  const [view, setView] = useState<View>("products");
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<BoardFilter>(initialFilter ?? (mode === "photos" ? "nophoto" : "all"));
  const [secFilter, setSecFilter] = useState<string | "all" | "none">("all");
  const [sort, setSort] = useState<BoardSort>(mode === "photos" ? "work" : "work");
  const [shown, setShown] = useState(PAGE);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [sheetId, setSheetId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<PhotoProduct | null>(null);
  const [scanOpen, setScanOpen] = useState(false);
  const [preview, setPreview] = useState(false);
  const [seq, setSeq] = useState<{ ids: string[]; i: number; done: number } | null>(null);
  const [moveOpen, setMoveOpen] = useState(false);
  const [prices, setPrices] = useState<Map<string, PriceReviewRow> | null>(null);
  const today = localISO();

  useEffect(() => { if (initialFilter) setFilter(initialFilter); }, [initialFilter]);

  const load = useCallback(async () => {
    setRows((r) => (Array.isArray(r) ? r : "loading"));
    try {
      const [pp, ss] = await Promise.all([
        repo.listPhotoProducts(),
        canStore ? repo.listStoreSections().then((x) => { setSectionsFailed(false); return x; }).catch(() => { setSectionsFailed(true); return null; }) : Promise.resolve([] as StoreSection[]),
      ]);
      setRows(pp);
      if (ss) setSections(ss);
    } catch { setRows((r) => (Array.isArray(r) ? r : "error")); }
  }, [canStore]);
  useEffect(() => { if (canPhotos) void load(); }, [canPhotos, load]);

  const list = Array.isArray(rows) ? rows : [];
  const byId = useMemo(() => new Map(list.map((p) => [p.id, p])), [list]);
  const activeSections = useMemo(() => sections.filter((s) => !s.archived_at).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ar")), [sections]);
  const activeIds = useMemo(() => new Set(activeSections.map((s) => s.id)), [activeSections]);
  const secOrder = useMemo(() => new Map(activeSections.map((s, i) => [s.id, i])), [activeSections]);
  const counts = useMemo(() => boardCounts(list, today, activeIds), [list, today, activeIds]);
  const prog = useMemo(() => progress(list), [list]);

  const patch = useCallback((id: string, p: Partial<PhotoProduct>) => {
    setRows((r) => (Array.isArray(r) ? r.map((x) => (x.id === id ? { ...x, ...p } : x)) : r));
    onChanged?.();
  }, [onChanged]);
  const patchMany = useCallback((ids: Iterable<string>, p: (x: PhotoProduct) => Partial<PhotoProduct>) => {
    const set = new Set(ids);
    setRows((r) => (Array.isArray(r) ? r.map((x) => (set.has(x.id) ? { ...x, ...p(x) } : x)) : r));
    onChanged?.();
  }, [onChanged]);

  const flow = usePhotoFlow({
    clinicId,
    onApplied: (id, path, meta) => patch(id, { image_path: path, image_meta: meta }),
  });

  const visible = useMemo(() => {
    const base = list.filter((p) => inFilter(p, filter, today, activeIds)
      && (secFilter === "all" || (secFilter === "none" ? !(p.store_section_id && activeIds.has(p.store_section_id)) : p.store_section_id === secFilter))
      && matchesQuery(p, q));
    return sortBoard(base, sort, today, secOrder);
  }, [list, filter, secFilter, q, sort, today, activeIds, secOrder]);

  /* ── المسح: الماسحُ اليدويّ (لوحة مفاتيح) دائماً، والكاميرا حيث يدعمها المتصفّح ── */
  const onScan = useCallback((code: string) => {
    setScanOpen(false);
    const hit = findByScan(list, code);
    if (hit) { playSuccess(); setSheetId(hit.id); return; }
    playWarning();
    // المجهولُ يُقال بالرمز كما وصل — لا نافذةَ ربطٍ (قرارُ المالك بعد «amino acide»).
    toast.error(t("sb.scan.unknown", "الرمز {{code}} مو لمنتج بالمخزون", { code }),
      t("sb.scan.unknownHint", "إذا المادة موجودة، المدير يضيف الرمز لها من المخزون."));
  }, [list, toast, t]);
  useBarcodeScanner(onScan, { disabled: !!sheetId || scanOpen || !!seq || preview || !!zoom });

  /* ── النشر والإخفاء — نداءٌ واحدٌ بالخادم، والمحلّيُّ يتبع حكمَه ── */
  const publish = async (ids: string[], on: boolean): Promise<StorePublishResult | null> => {
    if (!ids.length) return null;
    const r = await repo.storePublish(ids, on);
    const target = list.filter((p) => ids.includes(p.id));
    // الخادمُ يقول كم تغيّر وكم تُخطّي بكلّ سبب؛ والمحلّيُّ يطبّق نفسَ الشروط على نفس الصفوف.
    const ok = new Set(target.filter((p) => !on || readiness(p, today).ok).map((p) => p.id));
    patchMany(ok, () => ({ store_visible: on }));
    return r;
  };
  const bulkPublish = async (on: boolean, ids = [...picked]) => {
    if (bulkBusy || !ids.length) return;
    setBulkBusy(true);
    try {
      const r = await publish(ids, on);
      if (r) publishToast(toast, t, r, on);
      setPicked(new Set());
    } catch (e) { playWarning(); toast.error(t("sb.publishFailed", "ما انحفظ النشر — أعد المحاولة"), describeDbError(e, t)); await load(); }
    finally { setBulkBusy(false); }
  };
  const publishReady = () => {
    const ids = list.filter((p) => inFilter(p, "ready", today)).map((p) => p.id);
    void bulkPublish(true, ids);
  };
  const bulkMove = async (sectionId: string | null) => {
    const ids = [...picked];
    setMoveOpen(false);
    if (bulkBusy || !ids.length) return;
    setBulkBusy(true);
    try {
      const r = await repo.assignStoreSection(ids, sectionId);
      patchMany(ids, () => ({ store_section_id: sectionId, store_sort: null }));
      playSuccess();
      const name = sectionId ? activeSections.find((s) => s.id === sectionId)?.name ?? "" : t("sb.sec.none", "بلا قسم");
      toast.success(t("sb.moved", "انتقل {{n}} منتج إلى «{{name}}»", { n: formatNum(r.changed), name }));
      setPicked(new Set());
      await load();
    } catch (e) { playWarning(); toast.error(t("sb.moveFailed", "ما انتقلت — أعد المحاولة"), describeDbError(e, t)); }
    finally { setBulkBusy(false); }
  };

  /* ── أسعارُ المراجعة: تُجلب مرّةً حين تُطلب (شاشةُ الأسعار أو البطاقة) ── */
  const loadPrices = useCallback(async () => {
    try {
      const rows2 = await repo.storePriceReview();
      setPrices(new Map(rows2.map((r) => [r.product_id, r])));
    } catch { setPrices(null); throw new Error("price_review_failed"); }
  }, []);

  /* ── التصويرُ المتتابع: صفُّ ما بلا صورة بترتيب الشاشة، ومنتجٌ بعد منتج ── */
  const startSeq = () => {
    const ids = visible.filter((p) => !hasPhoto(p)).map((p) => p.id);
    if (!ids.length) return;
    playTap();
    setSeq({ ids, i: 0, done: 0 });
  };
  const seqNext = (shot: boolean) => setSeq((s) => (s ? { ...s, i: s.i + 1, done: s.done + (shot ? 1 : 0) } : s));

  if (!canPhotos) {
    return <p className="mx-auto max-w-xl px-4 py-16 text-center text-sm font-bold text-ink-muted">{t("sb.p.noAccess", "هاي الصفحة لمن عنده صلاحية صور المنتجات. راجع مدير العيادة.")}</p>;
  }

  const sheetRow = sheetId ? byId.get(sheetId) ?? null : null;
  const seqRow = seq && seq.i < seq.ids.length ? byId.get(seq.ids[seq.i]) ?? null : null;
  const pct = prog.total ? Math.round((prog.done / prog.total) * 100) : 0;
  const filterLabel: Record<BoardFilter, string> = {
    nophoto: t("sb.f.nophoto", "بلا صورة"),
    shownNoPhoto: t("sb.f.shownNoPhoto", "منشور بلا صورة"),
    ready: t("sb.f.ready", "جاهز للنشر"),
    photo: t("sb.f.photo", "بصورة"),
    shown: t("sb.f.shown", "منشور"),
    hidden: t("sb.f.hidden", "مخفي"),
    noprice: t("sb.f.noprice", "منشور بلا سعر"),
    nodesc: t("sb.f.nodesc", "منشور بلا وصف"),
    nosection: t("sb.f.nosection", "منشور بلا قسم"),
    out: t("sb.f.out", "منشور ونافد"),
    expired: t("sb.f.expired", "منشور ومنتهي"),
    belowCost: t("sb.f.belowCost", "تحت الكلفة"),
    featHidden: t("sb.f.featHidden", "مميّز ومخفي"),
    all: t("sb.f.all", "الكل"),
  };
  const storeOnly: ReadonlySet<BoardFilter> = new Set(["shownNoPhoto", "ready", "shown", "hidden", "noprice", "nodesc", "nosection", "out", "expired", "belowCost", "featHidden"]);
  const filters = BOARD_FILTERS.filter((f) => (canStore || !storeOnly.has(f))
    && (f !== "nosection" || activeSections.length > 0)
    && (!QUIET_WHEN_ZERO.has(f) || counts[f] > 0 || filter === f));

  return (
    <div className="space-y-4" data-store-board>
      {/* ── الرأس: التقدّمُ بالرقم والشريط ── */}
      {canStore && Array.isArray(rows) && (
        <div className="card space-y-2 p-4" data-board-progress>
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <p className="font-display text-base font-extrabold text-ink">
              {t("sb.progress", "المنشور بصورة: {{done}} من {{total}}", { done: formatNum(prog.done), total: formatNum(prog.total) })}
            </p>
            <span className="text-xs text-ink-subtle tabular-nums">{t("sb.progressAll", "{{n}} منتج بلا صورة بالمخزون", { n: formatNum(counts.nophoto) })}</span>
            <button type="button" onClick={() => { playTap(); setPreview(true); }}
              className="ms-auto inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-bold text-ink-muted transition hover:text-brand-600" data-customer-preview>
              <MonitorSmartphone size={14} /> {t("sb.preview", "شوف المتجر كزبون")}
            </button>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct}>
            <div className="h-full rounded-full bg-brand-grad transition-all duration-500" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      {/* ── تبديلُ الشاشة: المنتجات / الأقسام / الأسعار ── */}
      {canStore && (
        <div className="flex gap-1 rounded-2xl border border-line bg-surface-1 p-1" role="tablist">
          {([
            ["products", t("sb.v.products", "المنتجات"), Images],
            ["sections", t("sb.v.sections", "الأقسام والترتيب"), Layers],
            ["prices", t("sb.v.prices", "مراجعة الأسعار"), Tag],
          ] as const).map(([id, label, Icon]) => (
            <button key={id} type="button" role="tab" aria-selected={view === id} onClick={() => { playTap(); setView(id); }}
              className={cn("flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2 text-xs font-bold transition sm:text-sm",
                view === id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:bg-surface-2 hover:text-ink")}>
              <Icon size={15} /> {label}
            </button>
          ))}
        </div>
      )}

      {rows === "loading" ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : rows === "error" ? (
        <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
          <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("sb.p.failed", "ما وصلنا للمنتجات — المشكلة بالاتصال. ما ضاع شي.")}</p>
          <Button className="mt-3" size="sm" variant="secondary" onClick={() => { playTap(); void load(); }}><RotateCw size={14} /> {t("common.retry", "أعد المحاولة")}</Button>
        </div>
      ) : view === "sections" && canStore ? (
        <SectionsPanel rows={list} sections={sections} failed={sectionsFailed} reload={load}
          onSections={setSections} onRows={(ids, p) => patchMany(ids, p)} onOpen={(id) => setSheetId(id)} />
      ) : view === "prices" && canStore ? (
        <PriceReview rows={list} prices={prices} loadPrices={loadPrices} canPrice={canPrice} priceViaStore={priceViaStore}
          onPatch={patch} onOpen={(id) => setSheetId(id)} />
      ) : (
        <>
          {/* ── البحثُ والمسحُ والترتيب ── */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1">
              <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input value={q} onChange={(e) => { setQ(e.target.value); setShown(PAGE); }} data-board-search
                placeholder={t("sb.search", "ابحث بالاسم أو الباركود أو الشركة")} className="input h-11 w-full pe-9 ps-9" />
              {q && (
                <button type="button" onClick={() => { setQ(""); setShown(PAGE); }} aria-label={t("common.clear", "مسح")}
                  className="absolute end-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-ink-subtle hover:bg-surface-2"><X size={14} /></button>
              )}
            </div>
            {cameraScanSupported() && (
              <button type="button" onClick={() => { playTap(); setScanOpen(true); }} data-board-scan
                className="inline-flex h-11 items-center gap-1.5 rounded-2xl border border-line bg-surface-1 px-3 text-sm font-bold text-ink-muted transition hover:text-brand-600">
                <ScanLine size={16} /> {t("sb.scanBtn", "امسح")}
              </button>
            )}
            <select value={sort} onChange={(e) => { playTap(); setSort(e.target.value as BoardSort); }} aria-label={t("sb.sort", "الترتيب")}
              className="h-11 rounded-2xl border border-line bg-surface-1 px-3 text-sm font-semibold text-ink-muted outline-none">
              <option value="work">{t("sb.sortWork", "الشغل الناقص أولاً")}</option>
              {canStore && <option value="shelf">{t("sb.sortShelf", "مثل ترتيب المتجر")}</option>}
              <option value="name">{t("sb.sortName", "بالاسم")}</option>
            </select>
          </div>

          {/* ── التصفيات بعدّاداتها ── */}
          <div className="flex flex-wrap items-center gap-1.5" data-board-filters>
            {filters.map((f) => {
              const warn = (f === "shownNoPhoto" || f === "noprice" || f === "out" || f === "expired" || f === "belowCost" || f === "featHidden") && counts[f] > 0;
              return (
                <button key={f} type="button" onClick={() => { playTap(); setFilter(f); setShown(PAGE); setPicked(new Set()); }} data-filter={f}
                  className={cn("flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition",
                    filter === f ? "bg-brand-600 text-white" : "border border-line bg-surface-1 text-ink-muted hover:bg-surface-2",
                    filter !== f && warn && "border-warn-300 text-warn-700 dark:border-warn-500/40 dark:text-warn-200",
                    filter !== f && f === "ready" && counts.ready > 0 && "border-success-300 text-success-700 dark:border-success-500/40 dark:text-success-200")}>
                  {filterLabel[f]}
                  <span className={cn("tabular-nums", filter === f ? "text-white/80" : "text-ink-subtle")}>{formatNum(counts[f])}</span>
                </button>
              );
            })}
          </div>

          {/* ── الأقسام ── */}
          {canStore && activeSections.length > 0 && (
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" data-board-sections>
              {([["all", t("sb.sec.all", "كل الأقسام")], ...activeSections.map((s) => [s.id, s.name] as const), ["none", t("sb.sec.none", "بلا قسم")]] as Array<readonly [string, string]>).map(([id, name]) => (
                <button key={id} type="button" onClick={() => { playTap(); setSecFilter(id); setShown(PAGE); }}
                  className={cn("shrink-0 rounded-xl px-3 py-1.5 text-xs font-bold transition",
                    secFilter === id ? "bg-ink text-surface-1" : "bg-surface-2 text-ink-muted hover:text-ink")}>
                  {name}
                </button>
              ))}
            </div>
          )}

          {/* ── أفعالٌ سريعة: انشر كلّ الجاهز، صوّر بالتتابع، انشر أكثر ما تبيع ── */}
          <div className="flex flex-wrap gap-2">
            {canStore && counts.ready > 0 && (
              <Button size="sm" onClick={publishReady} loading={bulkBusy} leftIcon={<Wand2 size={15} />} data-publish-ready>
                {t("sb.publishReady", "انشر كل الجاهز ({{n}})", { n: formatNum(counts.ready) })}
              </Button>
            )}
            {visible.some((p) => !hasPhoto(p)) && (
              <Button size="sm" variant="secondary" onClick={startSeq} leftIcon={<Camera size={15} />} data-seq-start>
                {t("sb.seqStart", "صوّر بالتتابع ({{n}})", { n: formatNum(visible.filter((p) => !hasPhoto(p)).length) })}
              </Button>
            )}
            {canSuggest && canStore && <SuggestButton list={list} onPublish={(ids) => bulkPublish(true, ids)} />}
          </div>

          {/* ── الاختيار الجماعيّ ── */}
          {canStore && visible.length > 0 && (
            <div className={cn("card flex flex-wrap items-center gap-2 p-2.5", picked.size > 0 && "sticky top-2 z-20 border-brand-300 shadow-raised dark:border-brand-500/40")}>
              <button type="button" onClick={() => { playTap(); setPicked(picked.size === visible.length ? new Set() : new Set(visible.map((p) => p.id))); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-line px-3 py-1.5 text-xs font-semibold text-ink transition hover:bg-surface-2">
                {picked.size === visible.length ? <CheckSquare size={14} /> : <Square size={14} />}
                {picked.size === visible.length ? t("sb.pickNone", "ألغِ الاختيار") : t("sb.pickAll", "اختر الظاهر ({{n}})", { n: formatNum(visible.length) })}
              </button>
              <span className="text-xs text-ink-subtle tabular-nums">
                {picked.size > 0 ? t("sb.picked", "مختار: {{n}}", { n: formatNum(picked.size) }) : t("sb.pickHint", "اختر منتجات لتنشرها أو تنقلها مرة وحدة")}
              </span>
              {picked.size > 0 && (
                <div className="ms-auto flex flex-wrap gap-1.5">
                  <button type="button" disabled={bulkBusy} onClick={() => void bulkPublish(true)}
                    className="inline-flex items-center gap-1 rounded-xl bg-brand-600 px-3 py-1.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40">
                    {bulkBusy ? <Loader2 size={13} className="animate-spin" /> : <Eye size={13} />} {t("sb.bulkShow", "انشر")}
                  </button>
                  <button type="button" disabled={bulkBusy} onClick={() => void bulkPublish(false)}
                    className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-ink transition active:scale-95 disabled:opacity-40">
                    <EyeOff size={13} /> {t("sb.bulkHide", "اخفِ")}
                  </button>
                  {activeSections.length > 0 && (
                    <div className="relative">
                      <button type="button" disabled={bulkBusy} onClick={() => { playTap(); setMoveOpen((o) => !o); }}
                        className="inline-flex items-center gap-1 rounded-xl border border-line px-3 py-1.5 text-xs font-bold text-ink transition active:scale-95 disabled:opacity-40" data-bulk-move>
                        <FolderInput size={13} /> {t("sb.bulkMove", "انقل لقسم")}
                      </button>
                      {moveOpen && (
                        <div className="absolute end-0 top-full z-30 mt-1 max-h-72 w-56 overflow-y-auto rounded-2xl border border-line bg-surface-1 p-1 shadow-raised">
                          {activeSections.map((s) => (
                            <button key={s.id} type="button" onClick={() => void bulkMove(s.id)}
                              className="block w-full truncate rounded-xl px-3 py-2 text-start text-sm font-semibold text-ink hover:bg-surface-2">{s.name}</button>
                          ))}
                          <button type="button" onClick={() => void bulkMove(null)}
                            className="block w-full rounded-xl px-3 py-2 text-start text-sm text-ink-muted hover:bg-surface-2">{t("sb.sec.none", "بلا قسم")}</button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── الشبكة ── */}
          {visible.length === 0 ? (
            <p className="py-16 text-center text-sm font-bold text-ink-subtle">
              {filter === "nophoto" && !q ? t("sb.p.allDone", "كل المنتجات عدها صور ✓") : t("sb.p.none", "ماكو منتجات بهذا البحث.")}
            </p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" data-board-grid>
              {visible.slice(0, shown).map((p) => (
                <BoardCard key={p.id} p={p} today={today} canStore={canStore} sectionName={p.store_section_id && activeIds.has(p.store_section_id) ? activeSections[secOrder.get(p.store_section_id)!]?.name ?? null : null}
                  picked={picked.has(p.id)} busy={flow.busyId === p.id}
                  onPick={canStore ? () => setPicked((prev) => { const n = new Set(prev); n.has(p.id) ? n.delete(p.id) : n.add(p.id); return n; }) : undefined}
                  onOpen={() => { playTap(); setSheetId(p.id); }}
                  onZoom={() => { playTap(); setZoom(p); }}
                  onCamera={() => flow.openCamera(p)}
                  onAlbum={() => flow.openAlbum(p)}
                  onToggle={canStore ? () => void (async () => {
                    try { const r = await publish([p.id], !p.store_visible); if (r) publishToast(toast, t, r, !p.store_visible, true); }
                    catch (e) { playWarning(); toast.error(t("sb.publishFailed", "ما انحفظ النشر — أعد المحاولة"), describeDbError(e, t)); }
                  })() : undefined} />
              ))}
            </div>
          )}
          {visible.length > shown && (
            <div className="text-center">
              <Button variant="secondary" onClick={() => { playTap(); setShown((n) => n + PAGE); }}>
                <ListOrdered size={15} /> {t("sb.p.more", { n: formatNum(visible.length - shown), defaultValue: "اعرض الباقي ({{n}})" })}
              </Button>
            </div>
          )}
        </>
      )}

      {flow.ui}

      {sheetRow && (
        <ProductSheet row={sheetRow} sections={activeSections} canStore={canStore} canPrice={canPrice} priceViaStore={priceViaStore}
          today={today} flow={flow} price={prices?.get(sheetRow.id) ?? null}
          onClose={() => setSheetId(null)} onPatch={patch} onPublish={publish} />
      )}

      {zoom && productImageUrl(zoom.image_path) && (
        <ImageLightbox src={productImageUrl(zoom.image_path)!} caption={zoom.name} onClose={() => setZoom(null)}
          details={<PhotoDetails path={zoom.image_path ?? null} meta={zoom.image_meta ?? null} />} />
      )}

      <CameraScan open={scanOpen} onClose={() => setScanOpen(false)} onCode={onScan} />

      {preview && (
        <CustomerPreview rows={list} sections={activeSections} today={today} storeSlug={storeOn ? storeSlug : null} onClose={() => setPreview(false)} />
      )}

      {/* ── التصويرُ المتتابع ── */}
      {seq && (
        <SeqPanel seq={seq} row={seqRow} onStop={() => setSeq(null)}
          onCamera={(p) => flow.openCamera(p, () => seqNext(true))}
          onAlbum={(p) => flow.openAlbum(p, () => seqNext(true))}
          onSkip={() => { playTap(); seqNext(false); }} busy={!!seqRow && flow.busyId === seqRow.id} />
      )}
    </div>
  );
}

/* ============================== البطاقة ============================== */

function BoardCard({ p, today, canStore, sectionName, picked, busy, onPick, onOpen, onZoom, onCamera, onAlbum, onToggle }: {
  p: PhotoProduct; today: string; canStore: boolean; sectionName: string | null; picked: boolean; busy: boolean;
  onPick?: () => void; onOpen: () => void; onZoom: () => void; onCamera: () => void; onAlbum: () => void; onToggle?: () => void;
}) {
  const { t } = useTranslation();
  const thumb = thumbOf(p.image_path, p.image_meta as ImageMeta | null);
  const full = productImageUrl(p.image_path);
  const src = productImageUrl(thumb) ?? full;
  const r = readiness(p, today, canStore);
  const expired = isExpired(p, today);
  const out = isOut(p);
  return (
    <div data-photo-card={p.id} className={cn("card relative flex flex-col overflow-hidden transition", busy && "opacity-60",
      picked && "ring-2 ring-brand-400", p.store_visible && canStore && "border-brand-300 dark:border-brand-500/40")}>
      <button type="button" onClick={full ? onZoom : onCamera} className="relative grid aspect-square place-items-center bg-surface-2"
        aria-label={full ? t("sb.zoom", "كبّر الصورة") : t("sb.p.shoot", "صوّر")}>
        {src
          ? <img src={src} alt={p.name} loading="lazy" className="h-full w-full object-contain"
              onError={(e) => { if (full && e.currentTarget.src !== full) e.currentTarget.src = full; }} />
          : <span className="flex flex-col items-center gap-1 text-ink-subtle"><ImageOff size={30} aria-hidden /><span className="text-2xs font-bold">{t("sb.noPhoto", "بلا صورة")}</span></span>}
        {busy && <span className="absolute inset-0 grid place-items-center bg-surface-1/60"><Loader2 size={22} className="animate-spin text-brand-600" /></span>}
        {full && <span className="absolute bottom-1.5 end-1.5 grid h-7 w-7 place-items-center rounded-full bg-black/45 text-white"><Maximize2 size={13} /></span>}
        {/* الحالُ بلمحة */}
        {canStore && (
          <span className="absolute start-1.5 top-1.5 flex flex-wrap gap-1">
            <span className={cn("rounded-full px-2 py-0.5 text-2xs font-extrabold",
              p.store_visible ? "bg-success-600 text-white" : "bg-black/50 text-white")}>
              {p.store_visible ? t("sb.badge.shown", "منشور") : t("sb.badge.hidden", "مخفي")}
            </span>
            {p.store_featured && <span className="rounded-full bg-warn-500 px-1.5 py-0.5 text-2xs font-extrabold text-white" title={t("sb.badge.featured", "مميّز")}>★</span>}
          </span>
        )}
      </button>
      {onPick && (
        <button type="button" onClick={onPick} aria-pressed={picked} aria-label={t("sb.pickOne", "اختر {{name}}", { name: p.name })}
          className={cn("absolute end-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-lg border transition",
            picked ? "border-brand-600 bg-brand-600 text-white" : "border-white/70 bg-black/30 text-white")}>
          {picked ? <CheckSquare size={15} /> : <Square size={15} />}
        </button>
      )}
      <button type="button" onClick={onOpen} className="flex flex-1 flex-col gap-1 p-2.5 text-start">
        <p className="line-clamp-2 text-sm font-extrabold leading-snug text-ink" title={p.name}>{p.name}</p>
        <p className="truncate text-2xs text-ink-subtle" dir="auto">{[p.company_name, p.barcode].filter(Boolean).join(" · ") || "—"}</p>
        {canStore && (
          <div className="mt-auto flex flex-wrap items-center gap-1 pt-1">
            <span className={cn("font-display text-sm font-extrabold tabular-nums", (Number(p.sell_price) || 0) > 0 ? "text-ink" : "text-danger-600")}>
              {(Number(p.sell_price) || 0) > 0 ? money(Number(p.sell_price)) : t("sb.noPrice", "بلا سعر")}
            </span>
            {sectionName && <span className="truncate rounded-md bg-surface-2 px-1.5 py-0.5 text-2xs font-bold text-ink-muted">{sectionName}</span>}
            {p.below_cost && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-2xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("sb.belowCost", "تحت الكلفة")}</span>}
            {expired && <span className="rounded-md bg-danger-50 px-1.5 py-0.5 text-2xs font-bold text-danger-700 dark:bg-danger-500/15 dark:text-danger-300">{t("sb.expired", "منتهي")}</span>}
            {out && !expired && <span className="rounded-md bg-warn-50 px-1.5 py-0.5 text-2xs font-bold text-warn-700 dark:bg-warn-500/15 dark:text-warn-200">{t("sb.out", "نافد")}</span>}
          </div>
        )}
        {canStore && !p.store_visible && (
          <p className={cn("text-2xs font-bold", r.ok ? "text-success-700 dark:text-success-300" : "text-warn-700 dark:text-warn-200")}>
            {r.ok ? t("sb.readyLine", "جاهز للنشر ✓") : t("sb.missingLine", "ناقصه: {{what}}", { what: r.missing.map((m) => missText(t, m)).join(t("sb.sep", "، ")) })}
          </p>
        )}
        {canStore && p.store_visible && !p.store_desc && (
          <p className="text-2xs text-ink-subtle">{t("sb.noDescLine", "بلا وصف — اضغط وأضفه")}</p>
        )}
      </button>
      <div className="flex gap-1 border-t border-line p-1.5">
        <button type="button" disabled={busy} onClick={onCamera} data-photo-upload={p.id}
          className="inline-flex h-9 flex-1 items-center justify-center gap-1 rounded-xl bg-brand-600 px-2 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50">
          <Camera size={14} /> {full ? t("sb.p.replace", "بدّل") : t("sb.p.shoot", "صوّر")}
        </button>
        <button type="button" disabled={busy} onClick={onAlbum} data-photo-gallery={p.id}
          title={t("sb.p.gallery", "من الألبوم")} aria-label={t("sb.p.gallery", "من الألبوم")}
          className="grid h-9 w-9 place-items-center rounded-xl border border-line text-ink-muted transition hover:text-brand-600 disabled:opacity-50">
          <Images size={15} />
        </button>
        {onToggle && (
          <button type="button" disabled={busy} onClick={onToggle} data-card-toggle={p.id}
            title={p.store_visible ? t("sb.hideOne", "اخفِ من المتجر") : t("sb.showOne", "انشر بالمتجر")}
            aria-label={p.store_visible ? t("sb.hideOne", "اخفِ من المتجر") : t("sb.showOne", "انشر بالمتجر")}
            className={cn("grid h-9 w-9 place-items-center rounded-xl border transition disabled:opacity-50",
              p.store_visible ? "border-success-300 bg-success-50 text-success-700 dark:border-success-500/40 dark:bg-success-500/15 dark:text-success-200" : "border-line text-ink-muted hover:text-brand-600")}>
            {p.store_visible ? <Eye size={15} /> : <EyeOff size={15} />}
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================== التصوير المتتابع ============================== */

function SeqPanel({ seq, row, onStop, onCamera, onAlbum, onSkip, busy }: {
  seq: { ids: string[]; i: number; done: number }; row: PhotoProduct | null; busy: boolean;
  onStop: () => void; onCamera: (p: PhotoProduct) => void; onAlbum: (p: PhotoProduct) => void; onSkip: () => void;
}) {
  const { t } = useTranslation();
  const finished = seq.i >= seq.ids.length;
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 p-3 sm:inset-x-auto sm:end-4 sm:bottom-4 sm:w-96" data-seq-panel>
      <div className="card space-y-3 border-brand-300 p-4 shadow-raised dark:border-brand-500/40">
        <div className="flex items-center gap-2">
          <Camera size={18} className="text-brand-600" />
          <p className="flex-1 text-sm font-extrabold text-ink">{t("sb.seq.title", "التصوير المتتابع")}</p>
          <span className="text-xs font-bold tabular-nums text-ink-subtle">{formatNum(Math.min(seq.i + 1, seq.ids.length))} / {formatNum(seq.ids.length)}</span>
          <button type="button" onClick={onStop} aria-label={t("common.close", "إغلاق")} className="grid h-8 w-8 place-items-center rounded-full text-ink-subtle hover:bg-surface-2"><X size={16} /></button>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div className="h-full bg-brand-grad transition-all" style={{ width: `${Math.round((Math.min(seq.i, seq.ids.length) / seq.ids.length) * 100)}%` }} />
        </div>
        {finished || !row ? (
          <div className="space-y-2 text-center">
            <p className="text-sm font-bold text-ink">{t("sb.seq.done", "خلصت القائمة — صوّرت {{n}} منتج", { n: formatNum(seq.done) })}</p>
            <Button size="sm" onClick={onStop}>{t("common.close", "إغلاق")}</Button>
          </div>
        ) : (
          <>
            <div>
              <p className="text-lg font-extrabold leading-snug text-ink">{row.name}</p>
              <p className="text-xs text-ink-subtle" dir="auto">{[row.company_name, row.barcode].filter(Boolean).join(" · ") || "—"}</p>
            </div>
            <div className="flex gap-2">
              <Button className="flex-1" onClick={() => onCamera(row)} loading={busy} leftIcon={<Camera size={16} />} data-seq-shoot>{t("sb.p.shoot", "صوّر")}</Button>
              <Button variant="outline" onClick={() => onAlbum(row)} disabled={busy} leftIcon={<Images size={16} />}>{t("sb.p.gallery", "من الألبوم")}</Button>
              <Button variant="ghost" onClick={onSkip} disabled={busy}>{t("sb.seq.skip", "تخطّى")}</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ============================== انشر أكثر ما تبيع ============================== */

/* «انشر أكثرَ ما تبيع» (0187) — مؤشَّرةٌ مسبقاً والدكتورُ يشطب. والنشرُ من `store_publish`
 * بشروطه: الأعلى مبيعاً بلا صورة يُتخطّى ويُقال — ويصير بقائمة المصوّر «بلا صورة». */
function SuggestButton({ list, onPublish }: { list: PhotoProduct[]; onPublish: (ids: string[]) => Promise<void> }) {
  const { t } = useTranslation();
  const [state, setState] = useState<"idle" | "loading" | "open" | "error">("idle");
  const [rows, setRows] = useState<SuggestedProduct[]>([]);
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const photo = new Map(list.map((p) => [p.id, hasPhoto(p)]));
  const open = async () => {
    playTap(); setState("loading");
    try {
      const r = await repo.suggestStoreProducts(40);
      setRows(r); setPick(new Set(r.filter((x) => photo.get(x.id) ?? !!x.image_path).map((x) => x.id))); setState("open");
    } catch { setState("error"); }
  };
  if (state !== "open") {
    return (
      <Button size="sm" variant="outline" onClick={() => void open()} loading={state === "loading"} leftIcon={<Sparkles size={15} />}>
        {state === "error" ? t("sb.sug.suggestFailed", "ما وصلنا للسيرفر — اضغط لإعادة المحاولة") : t("sb.sug.suggestTitle", "انشر أكثرَ ما تبيع")}
      </Button>
    );
  }
  return (
    <div className="card w-full space-y-3 p-4">
      <div className="flex items-center gap-2">
        <Sparkles size={18} className="text-brand-600" />
        <b className="flex-1 text-sm font-bold text-ink">{t("sb.sug.suggestTitle", "انشر أكثرَ ما تبيع")}</b>
        <button type="button" onClick={() => setState("idle")} aria-label={t("common.close", "إغلاق")}><X size={16} /></button>
      </div>
      {rows.length === 0 ? (
        <p className="py-4 text-center text-sm text-ink-subtle">{t("sb.sug.suggestEmpty", "ما اكو اقتراح — يا إمّا الأعلى مبيعاً منشورٌ أصلاً، يا إمّا بلا سعر أو نافد.")}</p>
      ) : (
        <>
          <div className="max-h-72 space-y-1.5 overflow-y-auto">
            {rows.map((r) => {
              const has = photo.get(r.id) ?? !!r.image_path;
              return (
                <label key={r.id} className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-line p-2 hover:bg-surface-2">
                  <input type="checkbox" checked={pick.has(r.id)} disabled={busy}
                    onChange={(e) => setPick((prev) => { const n = new Set(prev); e.target.checked ? n.add(r.id) : n.delete(r.id); return n; })}
                    className="h-4 w-4 shrink-0 accent-brand-600" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-ink">{r.name}</span>
                    <span className="block text-2xs text-ink-subtle">
                      {/* الفئةُ تُعرض عمداً: الأدويةُ أوّلُ ما يشطبه الدكتور. */}
                      {r.category ? t(`pos.cat.${r.category}`, r.category) : t("sb.sug.noCategory", "بلا فئة")} · {t("sb.sug.soldQty", "انباع {{n}}", { n: formatNum(Math.round(r.qty_sold)) })}
                      {!has && <> · <b className="text-warn-700 dark:text-warn-200">{t("sb.sugNoPhoto", "بلا صورة — ما ينتشر قبل يتصوّر")}</b></>}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-bold tabular-nums text-ink">{money(r.sell_price)}</span>
                </label>
              );
            })}
          </div>
          <Button className="w-full" disabled={!pick.size} loading={busy} leftIcon={<Eye size={15} />}
            onClick={async () => { setBusy(true); try { await onPublish([...pick]); setState("idle"); } finally { setBusy(false); } }}>
            {t("sb.sug.suggestPublish", "انشر المؤشَّر ({{n}})", { n: formatNum(pick.size) })}
          </Button>
        </>
      )}
    </div>
  );
}
