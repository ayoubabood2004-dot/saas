/* ============================================================================
 * خاناتُ الطبيب بشاشة البيع (0258) — الشريطُ، والشبكةُ، والمحرّر.
 *
 * بجانب «المنتجات · الخدمات · الأدوية» خاناتٌ يصنعها الطبيبُ لنفسه (لا يراها غيرُه، وتتبعه لأيّ جهاز): يختار ما فيها من
 * منتجاتٍ وخدمات، ويقرّر لكلّ بطاقةٍ شكلَها (مربّع، أو مستطيل بعرض عمودين)، وحجمَ البطاقات، والصورَ.
 *
 * • الضغطُ على البطاقة يمرّ من **طريق البيع نفسِه** (tapProduct / addService بـSaleBuilder): الطزاجةُ وسؤالُ الخادم
 *   والمضاعِفُ والرصيدُ كلُّها كما بشبكة المنتجات — الخانةُ واجهةٌ لا طريقُ بيعٍ ثانٍ.
 * • منتجٌ نافدٌ باهتٌ **ويُضغط** (يسأل الخادم ويقول لماذا)، ومنتجٌ لم يعد موجوداً (حُذف أو طُوي بتوأمه) لا يُعرض للبيع —
 *   يُقال عددُه تحت الشبكة ويُرى بالمحرّر «ما عاد موجود» ليشيله الطبيب. الغائبُ ليس صفراً.
 * • الحذفُ بتأكيدٍ داخل النافذة يقول ماذا يُحذف (لا window.confirm). والحفظُ بشرط أنها كما فُتحت (pos_tab_stale).
 *
 * النصوصُ بنطاق ptab المملوك (hot-paths.json): القطعةُ كسولةٌ من SaleBuilder بـpage(…, ["ptab"]) — retail حارّ والبارد ممتلئ.
 * ========================================================================= */
import { useMemo, useState, type CSSProperties } from "react";
import { useTranslation } from "react-i18next";
import {
  Plus, Pencil, Package, Stethoscope, Scale, Trash2, ChevronUp, ChevronDown, X, Search, Square, RectangleHorizontal,
  AlertTriangle, RotateCcw, Image as ImageIcon, LayoutGrid,
} from "lucide-react";
import type { Product, Service } from "@/types";
import { Button, Dialog, useToast } from "@/components/ui";
import { cn, money, formatNum, searchable, normalizeCode } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cardImagePath, productImageUrl } from "@/lib/storeLib";
import { posTabsApi } from "@/lib/posTabsApi";
import {
  TAB_LIMITS, TILE_MIN, addItem, cleanTabName, draftProblem, hasItem, moveItem, nextSort, removeItemAt, resolveItems,
  sameDraft, setAllShapes, setShapeAt, type PosTab, type PosTabDraft, type ResolvedItem, type TileShape, type TileSize,
} from "@/lib/posTabs";

/* ── الشريط ──────────────────────────────────────────────────────────────── */
export function PosTabPills({ tabs, failed, activeId, compact, onPick, onNew, onRetry }: {
  tabs: PosTab[] | null; failed: boolean; activeId: string | null; compact?: boolean;
  onPick: (id: string) => void; onNew: () => void; onRetry: () => void;
}) {
  const { t } = useTranslation();
  const pad = compact ? "px-2.5 py-1.5 text-xs" : "px-4 py-2 text-sm";
  if (failed) {
    return (
      <button type="button" data-ptab-failed onClick={() => { playTap(); onRetry(); }} title={t("ptab.failed")}
        className={cn("inline-flex shrink-0 items-center gap-1 rounded-full font-semibold text-danger-600 hover:bg-danger-50 dark:hover:bg-danger-500/15", pad)}>
        <RotateCcw size={14} /> <span className="max-w-[9rem] truncate">{t("ptab.failed")}</span>
      </button>
    );
  }
  return (
    <>
      {(tabs ?? []).map((tab) => (
        <button key={tab.id} type="button" data-ptab={tab.id} onClick={() => { playTap(); onPick(tab.id); }}
          className={cn("inline-flex max-w-[11rem] shrink-0 items-center gap-1.5 rounded-full font-semibold transition", pad,
            activeId === tab.id ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
          <LayoutGrid size={15} className="shrink-0" /><span className="truncate">{tab.name}</span>
        </button>
      ))}
      {tabs && (
        <button type="button" data-ptab-new onClick={() => { playTap(); onNew(); }} title={t("ptab.new")} aria-label={t("ptab.new")}
          className={cn("inline-flex shrink-0 items-center gap-1 rounded-full font-semibold text-brand-700 transition hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/15", pad)}>
          <Plus size={15} />{tabs.length === 0 && <span>{t("ptab.new")}</span>}
        </button>
      )}
    </>
  );
}

/* ── البطاقة ─────────────────────────────────────────────────────────────── */
function TileImage({ path, className }: { path: string; className?: string }) {
  const [step, setStep] = useState(0);   // ٠ المصغّرة، ١ الأصل، ٢ لا صورة
  const src = step === 0 ? productImageUrl(cardImagePath(path)) : step === 1 ? productImageUrl(path) : null;
  if (!src) return <span className={cn("grid place-items-center bg-surface-2 text-ink-subtle", className)}><Package size={18} /></span>;
  return <img src={src} alt="" loading="lazy" decoding="async" draggable={false} onError={() => setStep((s) => s + 1)}
    className={cn("bg-surface-2 object-cover", className)} />;
}

function Tile({ r, images, listPrice, flash, preview, onProduct, onService }: {
  r: Exclude<ResolvedItem, { kind: "missing" }>; images: boolean; listPrice: (p: Product) => number; flash?: string | null; preview?: boolean;
  onProduct?: (p: Product) => void; onService?: (s: Service) => void;
}) {
  const { t } = useTranslation();
  const wide = r.item.shape === "wide";
  let name: string, price: number, out = false, badge: string, img: string | null = null, Icon = Package, fkey: string;
  if (r.kind === "product") {
    const p = r.product;
    const subAvail = !!p.has_sub_unit && !!p.units_per_box && p.units_per_box > 0;
    out = p.pooled ? false : subAvail ? p.stock * (p.units_per_box as number) < 1 : p.stock <= 0;
    name = p.name; price = listPrice(p); img = images && p.image_path ? p.image_path : null;
    Icon = p.sold_by_weight ? Scale : Package;
    badge = out ? t("ptab.out") : t("ptab.left", { n: formatNum(p.stock) });
    fkey = `p:${p.id}`;
  } else {
    name = r.service.name; price = r.service.price; Icon = Stethoscope; badge = t("ptab.service"); fkey = `s:${r.service.id}`;
  }
  const lit = !preview && flash === fkey;
  const tap = () => {
    if (preview) return;
    playTap();
    if (r.kind === "product") onProduct?.(r.product); else onService?.(r.service);
  };
  /* بلا صورة: مساحتُها نفسُها بلونٍ خفيف وأيقونةٍ أكبر — المنتجُ محايد والخدمةُ بلون العلامة، فيُعرفان من بعيد. */
  const visual = img
    ? <TileImage path={img} className={wide ? "h-full w-1/2 shrink-0 rounded-s-2xl" : "min-h-0 w-full flex-1 rounded-t-2xl"} />
    : <span className={cn("grid place-items-center", wide ? "h-full w-1/3 shrink-0" : "min-h-0 w-full flex-1",
        r.kind === "service" ? "bg-brand-50/70 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300" : "bg-surface-2/70 text-ink-subtle")}>
        <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface-1 shadow-soft"><Icon size={22} /></span>
      </span>;
  return (
    <button type="button" data-ptile={fkey} data-shape={r.item.shape} data-out={out || undefined} onClick={tap} tabIndex={preview ? -1 : undefined}
      title={out ? `${name} — ${t("ptab.outHint")}` : name}
      className={cn("group relative flex overflow-hidden rounded-2xl border text-start transition",
        wide ? "col-span-2 aspect-[2/1] flex-row" : "aspect-square flex-col",
        preview ? "cursor-default" : "",
        out ? "border-line bg-surface-2 opacity-60 hover:opacity-90"
          : lit ? "border-brand-400 bg-brand-50 dark:bg-brand-500/15"
            : "border-line bg-surface-1 hover:border-brand-300 hover:bg-brand-50 dark:hover:bg-brand-500/10")}>
      {visual}
      <span className={cn("flex min-w-0 flex-col justify-end gap-0.5 p-2", wide ? "flex-1" : "w-full shrink-0")}>
        <span className={cn("font-semibold leading-tight text-ink", wide ? "line-clamp-3 text-sm" : "line-clamp-2 text-xs")}>{name}</span>
        <span className="flex items-center justify-between gap-1">
          <span className="text-sm font-bold tabular-nums text-ink">{money(price)}</span>
          <span className={cn("truncate text-2xs", out ? "text-danger-600" : "text-ink-subtle")}>{badge}</span>
        </span>
      </span>
    </button>
  );
}

/* ── الشبكة ─────────────────────────────────────────────────────────────── */
export function PosTabGrid({ tab, products, services, listPrice, flash, gridZoom, posV2, preview, onProduct, onService, onEdit }: {
  tab: Pick<PosTab, "name" | "tile_size" | "show_images" | "items">; products: Product[]; services: Service[];
  listPrice: (p: Product) => number; flash?: string | null; gridZoom?: number; posV2?: boolean; preview?: boolean;
  onProduct?: (p: Product) => void; onService?: (s: Service) => void; onEdit?: () => void;
}) {
  const { t } = useTranslation();
  const resolved = useMemo(() => resolveItems(tab.items, products, services), [tab.items, products, services]);
  const live = resolved.filter((r): r is Exclude<ResolvedItem, { kind: "missing" }> => r.kind !== "missing");
  const missing = resolved.length - live.length;
  const style: CSSProperties = {
    gridTemplateColumns: `repeat(auto-fill, minmax(${TILE_MIN[tab.tile_size]}, 1fr))`, gridAutoFlow: "dense",
    ...(gridZoom && gridZoom !== 1 ? { zoom: gridZoom } : {}),
  };
  return (
    <div data-ptab-grid className={cn(posV2 && !preview ? "flex min-h-0 flex-1 flex-col gap-2" : "space-y-2")}>
      {onEdit && (
        <div className="flex shrink-0 items-center gap-2">
          <span className="min-w-0 flex-1 truncate font-display text-sm font-bold text-ink">{tab.name}</span>
          <Button size="sm" variant="ghost" leftIcon={<Pencil size={14} />} onClick={() => { playTap(); onEdit(); }} data-ptab-edit>{t("ptab.edit")}</Button>
        </div>
      )}
      {live.length === 0 ? (
        <div className="card grid place-items-center p-8 text-center text-sm text-ink-subtle">
          <LayoutGrid size={26} className="mb-2 opacity-40" />{preview ? t("ptab.previewEmpty") : t("ptab.empty")}
        </div>
      ) : (
        <div className={cn("grid gap-2", posV2 && !preview && "min-h-0 flex-1 overflow-y-auto pb-1")} style={style}>
          {live.map((r, i) => (
            <Tile key={`${r.item.k}:${r.item.id}:${i}`} r={r} images={tab.show_images} listPrice={listPrice} flash={flash} preview={preview}
              onProduct={onProduct} onService={onService} />
          ))}
        </div>
      )}
      {missing > 0 && !preview && (
        <p data-ptab-missing className="shrink-0 rounded-lg bg-surface-2 px-2.5 py-1.5 text-2xs text-ink-subtle">{t("ptab.missingN", { n: formatNum(missing) })}</p>
      )}
    </div>
  );
}

/* ── المحرّر ─────────────────────────────────────────────────────────────── */
const SIZE_OPTS: { v: TileSize; key: string }[] = [{ v: "sm", key: "ptab.sm" }, { v: "md", key: "ptab.md" }, { v: "lg", key: "ptab.lg" }];

export function PosTabEditor({ tab, tabs, products, services, listPrice, onClose, onSaved }: {
  /** null = خانةٌ جديدة. */
  tab: PosTab | null; tabs: PosTab[]; products: Product[]; services: Service[]; listPrice: (p: Product) => number;
  onClose: () => void;
  /** الخانةُ بعد الحفظ، أو null بعد الحذف — أو "reload" حين تبيّن أنها تغيّرت من جهازٍ ثانٍ. */
  onSaved: (r: PosTab | null | "reload") => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const base: PosTabDraft = useMemo(() => tab
    ? { name: tab.name, tile_size: tab.tile_size, show_images: tab.show_images, items: tab.items, sort: tab.sort }
    : { name: "", tile_size: "md", show_images: true, items: [], sort: nextSort(tabs) }, [tab, tabs]);
  const [d, setD] = useState<PosTabDraft>(base);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<"save" | "del" | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  const set = (p: Partial<PosTabDraft>) => setD((x) => ({ ...x, ...p }));

  const problem = draftProblem(d);
  const atLimit = !tab && tabs.length >= TAB_LIMITS.tabs;
  const dirty = !sameDraft(d, base);
  const resolved = useMemo(() => resolveItems(d.items, products, services), [d.items, products, services]);

  // البحثُ: الاسمُ بـsearchable والرمزُ بـnormalizeCode — الطرفان بنفس الدالّة.
  const results = useMemo(() => {
    const raw = q.trim();
    if (!raw) return [] as { k: "p" | "s"; id: string; name: string; price: number; img: string | null }[];
    // والرمزُ يُطابَق بالباركود والرموز الإضافية (alt_codes) كما يقرؤها المسح.
    const ql = searchable(raw), codeKey = normalizeCode(raw);
    const ps = products.filter((p) => searchable(p.name).includes(ql)
        || (!!codeKey && [p.barcode, ...(p.alt_codes ?? [])].some((c) => !!c && normalizeCode(c) === codeKey)))
      .slice(0, 25).map((p) => ({ k: "p" as const, id: p.id, name: p.name, price: listPrice(p), img: p.image_path ?? null }));
    const ss = services.filter((s) => searchable(s.name).includes(ql)).slice(0, 15)
      .map((s) => ({ k: "s" as const, id: s.id, name: s.name, price: s.price, img: null }));
    return [...ps, ...ss];
  }, [q, products, services, listPrice]);

  const fail = (e: unknown) => {
    playWarning();
    if ((e as { code?: string } | null)?.code === "pos_tab_stale") { toast.error(t("ptab.stale")); onSaved("reload"); }
    else toast.error(describeDbError(e, t));
  };
  const save = async () => {
    if (problem || atLimit || busy) return;
    setBusy("save");
    try {
      const out = tab ? await posTabsApi.update(tab.id, d, tab.updated_at) : await posTabsApi.create(d);
      playSuccess();
      toast.success(tab ? t("ptab.saved") : t("ptab.created", { name: out.name }));
      onSaved(out);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };
  const remove = async () => {
    if (!tab || busy) return;
    setBusy("del");
    try {
      await posTabsApi.remove(tab.id, tab.updated_at);
      playSuccess(); toast.success(t("ptab.deleted"));
      onSaved(null);
    } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const shapeBtn = (on: boolean, shape: TileShape, onClick: () => void) => (
    <button type="button" onClick={() => { playTap(); onClick(); }} aria-pressed={on} title={t(shape === "sq" ? "ptab.shapeSq" : "ptab.shapeWide")}
      className={cn("grid h-8 w-8 place-items-center rounded-lg border transition",
        on ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300" : "border-line text-ink-subtle hover:text-ink")}>
      {shape === "sq" ? <Square size={15} /> : <RectangleHorizontal size={16} />}
    </button>
  );

  return (
    <Dialog open onClose={onClose} size="lg" title={tab ? t("ptab.titleEdit") : t("ptab.titleNew")}
      footer={
        <div className="flex w-full flex-wrap items-center gap-2">
          <Button onClick={() => void save()} loading={busy === "save"} disabled={!!problem || atLimit || !!busy || (!!tab && !dirty)} data-ptab-save>
            {tab ? t("ptab.save") : t("ptab.create")}
          </Button>
          <Button variant="ghost" onClick={onClose}>{t("common.cancel")}</Button>
          {tab && !confirmDel && (
            <Button variant="ghost" className="ms-auto text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/15"
              leftIcon={<Trash2 size={14} />} onClick={() => { playTap(); setConfirmDel(true); }} data-ptab-del>{t("ptab.del")}</Button>
          )}
        </div>
      }>
      <div className="space-y-4" data-ptab-editor>
        {atLimit && <p className="rounded-xl bg-warn-50 px-3 py-2 text-xs font-bold text-warn-800 dark:bg-warn-500/15 dark:text-warn-200">{t("ptab.tooMany", { n: TAB_LIMITS.tabs })}</p>}
        {confirmDel && tab && (
          <div role="alert" className="space-y-2 rounded-xl border border-danger-200 bg-danger-50 p-3 dark:border-danger-500/30 dark:bg-danger-500/10">
            <p className="flex items-start gap-1.5 text-xs font-semibold text-danger-700 dark:text-danger-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />{t("ptab.delConfirm", { name: tab.name, n: formatNum(tab.items.length) })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="danger" loading={busy === "del"} disabled={!!busy} onClick={() => void remove()} data-ptab-del-yes>{t("ptab.delYes")}</Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmDel(false)}>{t("ptab.keep")}</Button>
            </div>
          </div>
        )}

        {/* الاسم والشكل العامّ */}
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1">
            <span className="text-xs font-bold text-ink-muted">{t("ptab.name")}</span>
            <input className="input w-full" data-ptab-name value={d.name} maxLength={TAB_LIMITS.name} placeholder={t("ptab.namePh")}
              onChange={(e) => set({ name: e.target.value })} />
            {problem === "name" && d.name && <span className="block text-2xs font-bold text-danger-600">{t("ptab.badName", { n: TAB_LIMITS.name })}</span>}
          </label>
          <div className="space-y-1">
            <span className="text-xs font-bold text-ink-muted">{t("ptab.size")}</span>
            <div className="flex gap-1 rounded-full border border-line bg-surface-2 p-1">
              {SIZE_OPTS.map((o) => (
                <button key={o.v} type="button" data-ptab-size={o.v} onClick={() => { playTap(); set({ tile_size: o.v }); }}
                  className={cn("flex-1 rounded-full px-2 py-1.5 text-xs font-semibold transition", d.tile_size === o.v ? "bg-brand-600 text-white shadow-soft" : "text-ink-muted hover:text-ink")}>
                  {t(o.key)}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" data-ptab-images className="h-4 w-4 accent-brand-600" checked={d.show_images} onChange={(e) => set({ show_images: e.target.checked })} />
            <ImageIcon size={15} className="text-ink-subtle" />{t("ptab.images")}
          </label>
          {d.items.length > 1 && (
            <span className="ms-auto flex gap-1.5">
              <Button size="sm" variant="ghost" leftIcon={<Square size={13} />} onClick={() => set({ items: setAllShapes(d.items, "sq") })}>{t("ptab.allSq")}</Button>
              <Button size="sm" variant="ghost" leftIcon={<RectangleHorizontal size={14} />} onClick={() => set({ items: setAllShapes(d.items, "wide") })}>{t("ptab.allWide")}</Button>
            </span>
          )}
        </div>

        {/* العناصر بترتيبها */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-ink-muted">{t("ptab.items", { n: formatNum(d.items.length), max: TAB_LIMITS.items })}</p>
          {d.items.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line px-3 py-3 text-center text-xs text-ink-subtle">{t("ptab.noItems")}</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto pe-1">
              {resolved.map((r, i) => {
                const name = r.kind === "product" ? r.product.name : r.kind === "service" ? r.service.name : t("ptab.missing");
                return (
                  <li key={`${r.item.k}:${r.item.id}`} data-ptab-item={`${r.item.k}:${r.item.id}`}
                    className={cn("flex items-center gap-2 rounded-xl border border-line px-2 py-1.5", r.kind === "missing" && "bg-surface-2 opacity-70")}>
                    {r.kind === "product" && r.product.image_path
                      ? <TileImage path={r.product.image_path} className="h-8 w-8 shrink-0 rounded-lg" />
                      : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-subtle">
                          {r.kind === "service" ? <Stethoscope size={15} /> : r.kind === "missing" ? <AlertTriangle size={15} /> : <Package size={15} />}
                        </span>}
                    <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{name}</span>
                    {shapeBtn(r.item.shape === "sq", "sq", () => set({ items: setShapeAt(d.items, i, "sq") }))}
                    {shapeBtn(r.item.shape === "wide", "wide", () => set({ items: setShapeAt(d.items, i, "wide") }))}
                    <button type="button" title={t("ptab.up")} aria-label={t("ptab.up")} disabled={i === 0} onClick={() => set({ items: moveItem(d.items, i, -1) })}
                      className="grid h-8 w-7 place-items-center rounded-lg text-ink-subtle hover:text-ink disabled:opacity-30"><ChevronUp size={16} /></button>
                    <button type="button" title={t("ptab.down")} aria-label={t("ptab.down")} disabled={i === d.items.length - 1} onClick={() => set({ items: moveItem(d.items, i, 1) })}
                      className="grid h-8 w-7 place-items-center rounded-lg text-ink-subtle hover:text-ink disabled:opacity-30"><ChevronDown size={16} /></button>
                    <button type="button" title={t("ptab.remove")} aria-label={t("ptab.remove")} data-ptab-rm={`${r.item.k}:${r.item.id}`}
                      onClick={() => set({ items: removeItemAt(d.items, i) })}
                      className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15"><X size={15} /></button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* الإضافة */}
        <div className="space-y-1.5">
          <p className="text-xs font-bold text-ink-muted">{t("ptab.addTitle")}</p>
          <div className="relative">
            <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
            <input className="input w-full ltr:pl-9 rtl:pr-9" data-ptab-search value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("ptab.searchPh")} />
          </div>
          {q.trim() && (results.length === 0 ? (
            <p className="px-1 text-xs text-ink-subtle">{t("ptab.noResults")}</p>
          ) : (
            <ul className="max-h-56 space-y-1 overflow-y-auto pe-1">
              {results.map((x) => {
                const inTab = hasItem(d.items, x.k, x.id);
                const full = d.items.length >= TAB_LIMITS.items;
                return (
                  <li key={`${x.k}:${x.id}`} className="flex items-center gap-2 rounded-xl px-2 py-1 hover:bg-surface-2">
                    {x.img ? <TileImage path={x.img} className="h-8 w-8 shrink-0 rounded-lg" />
                      : <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-ink-subtle">{x.k === "s" ? <Stethoscope size={15} /> : <Package size={15} />}</span>}
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold text-ink">{x.name}</span>
                      <span className="block text-2xs text-ink-subtle">{x.k === "s" ? t("ptab.service") : t("ptab.product")} · <span className="tabular-nums">{money(x.price)}</span></span>
                    </span>
                    <Button size="sm" variant={inTab ? "ghost" : "secondary"} disabled={inTab || full} data-ptab-add={`${x.k}:${x.id}`}
                      leftIcon={inTab ? undefined : <Plus size={14} />} onClick={() => { playTap(); set({ items: addItem(d.items, x.k, x.id) }); }}>
                      {inTab ? t("ptab.added") : t("ptab.add")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          ))}
          {d.items.length >= TAB_LIMITS.items && <p className="text-2xs font-bold text-warn-700 dark:text-warn-300">{t("ptab.itemsLimit", { n: TAB_LIMITS.items })}</p>}
        </div>

        {/* المعاينة — كما تظهر بشاشة البيع */}
        <div className="space-y-1.5 border-t border-line pt-3">
          <p className="text-xs font-bold text-ink-muted">{t("ptab.preview")}</p>
          <PosTabGrid tab={{ ...d, name: cleanTabName(d.name) }} products={products} services={services} listPrice={listPrice} preview />
        </div>
      </div>
    </Dialog>
  );
}
