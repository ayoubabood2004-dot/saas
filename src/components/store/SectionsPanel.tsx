import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Archive, ArchiveRestore, ArrowDown, ArrowUp, ChevronDown, ChevronsUp, ImageOff, Layers, Pencil, Plus, RotateCw, Search, X,
} from "lucide-react";
import type { PhotoProduct, StoreSection } from "@/types";
import { repo } from "@/lib/repo";
import { productImageUrl } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { refreshMyPermissions } from "@/lib/staff";
import { refusedByRole } from "@/lib/storePrice";
import { useAuth } from "@/contexts/AuthContext";
import { cn, formatNum, money } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { Button, Dialog, useToast } from "@/components/ui";
import { SECTION_NAME_MAX, matchesQuery, moveInOrder, sectionNameProblem } from "@/lib/storeBoard";
import { thumbOf, type ImageMeta } from "@/lib/productPhoto";
import { publishToast } from "./publishToast";

/* ============================================================================
 * الأقسامُ والترتيب (0229) — العيادةُ تنشئ أقسامَها وتدرج فيها ما تريد وترتّبه.
 *
 * كلُّ ترتيبٍ يُرسل **القائمةَ كاملةً** بترتيبها الجديد: الخادمُ يرفضها إن تغيّر ما
 * فيها من جهازٍ آخر (`sections_stale` / `order_stale`) بدل أن يرتّب نصفاً ويترك
 * الباقي — فالشاشةُ تعيد القراءةَ وتقول «حدّث وأعد». والقسمُ يُؤرشف ولا يُحذف:
 * منتجاتُه تبقى مربوطةً به، والاسترجاعُ يعيده كما كان.
 *
 * و«منتجات أخرى» عند الزبون = المنشورُ بلا قسمٍ نشط، لكنّ **ترتيبَها** (قسمٌ فارغ بالخادم)
 * لِما بلا قسمٍ أصلاً وحده: المربوطُ بقسمٍ مؤرشف ترتيبُه ترتيبُ قسمه — ترقيمُه هنا كان يمحو
 * ترتيبَ القسم فيرجع مخلوطاً حين يُسترجع، والخادمُ صار يرفضه (`order_stale`). فيُعرض وحدَه
 * بلا أسهم، ويُفتح ويُنقل لقسمٍ نشط كغيره.
 * ==========================================================================*/

const byShelf = (a: PhotoProduct, b: PhotoProduct) =>
  (a.store_sort ?? Number.MAX_SAFE_INTEGER) - (b.store_sort ?? Number.MAX_SAFE_INTEGER) || a.name.localeCompare(b.name, "ar") || a.id.localeCompare(b.id);

export function SectionsPanel({ rows, sections, failed, reload, onSections, onRows, onOpen }: {
  rows: PhotoProduct[];
  sections: StoreSection[];
  failed: boolean;
  reload: () => Promise<void>;
  onSections: (s: StoreSection[]) => void;
  onRows: (ids: string[], patch: (x: PhotoProduct) => Partial<PhotoProduct>) => void;
  onOpen: (id: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [rename, setRename] = useState<{ id: string; v: string } | null>(null);
  const [pickFor, setPickFor] = useState<StoreSection | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const active = useMemo(() => sections.filter((s) => !s.archived_at).sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name, "ar")), [sections]);
  const archived = useMemo(() => sections.filter((s) => !!s.archived_at), [sections]);
  const activeIds = useMemo(() => new Set(active.map((s) => s.id)), [active]);
  // قسمٌ فارغ ⇒ المنشورُ **بلا قسمٍ أصلاً** (store_section_id == null) — نفسُ ما يقبله ترتيبُ الخادم.
  const inSection = (id: string | null) => rows.filter((p) => (id ? p.store_section_id === id : p.store_section_id == null && p.store_visible)).sort(byShelf);
  // المنشورُ المربوطُ بقسمٍ مؤرشف: يطلع للزبون تحت «منتجات أخرى»، وترتيبُه يرجع ويّا قسمه.
  const parked = rows.filter((p) => p.store_visible && p.store_section_id != null && !activeIds.has(p.store_section_id)).sort(byShelf);
  const nameOf = (id: string | null | undefined) => sections.find((s) => s.id === id)?.name ?? "";

  const fail = async (e: unknown) => {
    playWarning();
    toast.error(t("sb.saveFailed", "ما انحفظ — أعد المحاولة"), describeDbError(e, t));
    // إذنٌ سُحب والشاشةُ مفتوحة: الخبيئةُ تُجدَّد فلا تبقى أزرارٌ يرفضها الخادم.
    if (refusedByRole(e)) void refreshMyPermissions(user?.email);
    await reload();
  };
  const run = async (key: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(key);
    try { await fn(); } catch (e) { await fail(e); } finally { setBusy(null); }
  };

  const problem = name.trim() ? sectionNameProblem(name, sections) : null;
  const problemText = (p: ReturnType<typeof sectionNameProblem>) =>
    p === "dup" ? t("sb.sec.dup", "أكو قسم بنفس الاسم (يمكن مؤرشف)")
      : p === "long" ? t("sb.sec.long", "الاسم أطول من {{n}} حرف", { n: SECTION_NAME_MAX })
        : p === "empty" ? t("sb.sec.empty", "اكتب اسم القسم") : "";

  const add = () => run("add", async () => {
    if (!name.trim() || problem) return;
    const s = await repo.saveStoreSection(null, name.trim());
    onSections([...sections, s]);
    setName("");
    setOpen(s.id);
    playSuccess();
    toast.success(t("sb.sec.added", "انضاف قسم «{{name}}»", { name: s.name }), t("sb.sec.addedHint", "هسه أضف له منتجات."));
  });
  const saveRename = () => run("ren", async () => {
    if (!rename) return;
    const p = sectionNameProblem(rename.v, sections, rename.id);
    if (p) { playWarning(); toast.error(problemText(p)); return; }
    const s = await repo.saveStoreSection(rename.id, rename.v.trim());
    onSections(sections.map((x) => (x.id === s.id ? s : x)));
    setRename(null);
    playSuccess();
  });
  const move = (id: string, to: "up" | "down") => run(`mv:${id}`, async () => {
    const ids = moveInOrder(active.map((s) => s.id), id, to);
    onSections(sections.map((s) => (s.archived_at ? s : { ...s, sort: ids.indexOf(s.id) + 1 })));
    await repo.reorderStoreSections(ids);
    playTap();
  });
  const archive = (s: StoreSection, on: boolean) => run(`ar:${s.id}`, async () => {
    await repo.archiveStoreSection(s.id, on);
    playTap();
    toast.success(on
      ? t("sb.sec.archived", "انأرشف «{{name}}» — منتجاته صارت تحت «منتجات أخرى» وترجع وياه لمن ترجّعه", { name: s.name })
      : t("sb.sec.restored", "رجع «{{name}}» ومنتجاته وياه", { name: s.name }));
    await reload();
  });
  const moveProduct = (sec: string | null, id: string, to: "up" | "down" | "top") => run(`p:${id}`, async () => {
    const ids = moveInOrder(inSection(sec).map((p) => p.id), id, to);
    onRows(ids, (x) => ({ store_sort: ids.indexOf(x.id) + 1 }));
    await repo.reorderSectionProducts(sec, ids);
    playTap();
  });
  const removeFrom = (p: PhotoProduct) => run(`p:${p.id}`, async () => {
    await repo.assignStoreSection([p.id], null);
    onRows([p.id], () => ({ store_section_id: null, store_sort: null }));
    playTap();
  });
  const assign = (p: PhotoProduct, sec: string) => run(`p:${p.id}`, async () => {
    await repo.assignStoreSection([p.id], sec);
    playSuccess();
    await reload();
  });

  if (failed) {
    return (
      <div className="rounded-2xl border border-danger-200 bg-danger-50 p-5 text-center dark:border-danger-500/30 dark:bg-danger-500/10">
        <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{t("sb.sec.failed", "ما وصلنا للأقسام — المشكلة بالاتصال.")}</p>
        <Button className="mt-3" size="sm" variant="secondary" onClick={() => { playTap(); void reload(); }}><RotateCw size={14} /> {t("common.retry", "أعد المحاولة")}</Button>
      </div>
    );
  }

  const unsectioned = inSection(null);

  return (
    <div className="space-y-4" data-sections-panel>
      <div className="card space-y-2 p-4">
        <p className="flex items-center gap-2 text-sm font-extrabold text-ink"><Layers size={17} className="text-brand-600" /> {t("sb.sec.title", "أقسام متجرك")}</p>
        <p className="text-xs text-ink-subtle">{t("sb.sec.hint", "سوّي أقسام مثل «أكل قطط» و«شامبو» وأدرج بيها منتجاتك. الزبون يشوف شريط الأقسام بأعلى المتجر بنفس ترتيبك — والقسم الفارغ ما يطلع له.")}</p>
        <div className="flex gap-2">
          <input value={name} maxLength={SECTION_NAME_MAX + 5} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }}
            placeholder={t("sb.sec.namePh", "اسم القسم الجديد…")} className="input h-11 flex-1" data-section-name />
          <Button onClick={() => void add()} loading={busy === "add"} disabled={!name.trim() || !!problem} leftIcon={<Plus size={16} />} data-section-add>
            {t("sb.sec.add", "أضف قسم")}
          </Button>
        </div>
        {problem && <p className="text-2xs font-semibold text-danger-600">{problemText(problem)}</p>}
      </div>

      {active.length === 0 ? (
        <p className="py-8 text-center text-sm font-semibold text-ink-subtle">{t("sb.sec.noneYet", "ما عندك أقسام بعد — أوّل قسم تسوّيه يطلع هنا.")}</p>
      ) : (
        <div className="space-y-2">
          {active.map((s, i) => {
            const items = inSection(s.id);
            const shown = items.filter((p) => p.store_visible).length;
            const isOpen = open === s.id;
            return (
              <div key={s.id} className="card overflow-hidden" data-section-row={s.id}>
                <div className="flex flex-wrap items-center gap-2 p-3">
                  <div className="flex flex-col">
                    <button type="button" disabled={i === 0 || !!busy} onClick={() => void move(s.id, "up")} aria-label={t("sb.up", "لفوق")}
                      className="grid h-6 w-7 place-items-center rounded-md text-ink-subtle hover:bg-surface-2 disabled:opacity-30"><ArrowUp size={14} /></button>
                    <button type="button" disabled={i === active.length - 1 || !!busy} onClick={() => void move(s.id, "down")} aria-label={t("sb.down", "لجوّه")}
                      className="grid h-6 w-7 place-items-center rounded-md text-ink-subtle hover:bg-surface-2 disabled:opacity-30"><ArrowDown size={14} /></button>
                  </div>
                  {rename?.id === s.id ? (
                    <input autoFocus value={rename.v} maxLength={SECTION_NAME_MAX + 5} onChange={(e) => setRename({ id: s.id, v: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter") void saveRename(); if (e.key === "Escape") setRename(null); }}
                      onBlur={() => void saveRename()} className="input h-9 min-w-0 flex-1" />
                  ) : (
                    <button type="button" onClick={() => { playTap(); setOpen(isOpen ? null : s.id); }} className="flex min-w-0 flex-1 items-center gap-2 text-start">
                      <span className="truncate text-sm font-extrabold text-ink">{s.name}</span>
                      <span className="shrink-0 text-2xs text-ink-subtle tabular-nums">
                        {t("sb.sec.counts", "{{n}} منتج · {{s}} منشور", { n: formatNum(items.length), s: formatNum(shown) })}
                      </span>
                      <ChevronDown size={15} className={cn("ms-auto shrink-0 text-ink-subtle transition", isOpen && "rotate-180")} />
                    </button>
                  )}
                  <button type="button" onClick={() => { playTap(); setRename({ id: s.id, v: s.name }); }} aria-label={t("sb.sec.rename", "غيّر الاسم")}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted hover:text-ink"><Pencil size={13} /></button>
                  <button type="button" onClick={() => void archive(s, true)} disabled={!!busy} aria-label={t("sb.sec.archive", "أرشف")} title={t("sb.sec.archive", "أرشف")}
                    className="grid h-8 w-8 place-items-center rounded-lg border border-line text-ink-muted hover:text-warn-700"><Archive size={13} /></button>
                </div>
                {isOpen && (
                  <div className="space-y-1.5 border-t border-line bg-surface-2/40 p-3">
                    <Button size="sm" variant="secondary" onClick={() => { playTap(); setPickFor(s); }} leftIcon={<Plus size={14} />} data-section-pick>
                      {t("sb.sec.addProducts", "أضف منتجات لهذا القسم")}
                    </Button>
                    {items.length === 0 ? (
                      <p className="py-3 text-center text-xs text-ink-subtle">{t("sb.sec.empty2", "القسم فارغ — الزبون ما يشوفه لحد ما تضيف له منتج منشور.")}</p>
                    ) : items.map((p, j) => (
                      <ProductLine key={p.id} p={p} busy={busy === `p:${p.id}`} first={j === 0} last={j === items.length - 1}
                        onOpen={() => onOpen(p.id)} onUp={() => void moveProduct(s.id, p.id, "up")} onDown={() => void moveProduct(s.id, p.id, "down")}
                        onTop={() => void moveProduct(s.id, p.id, "top")} onRemove={() => void removeFrom(p)} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* المنشورُ بلا قسم — يطلع للزبون آخرَ المتجر تحت «منتجات أخرى». */}
      {unsectioned.length + parked.length > 0 && (
        <div className="card space-y-1.5 p-3" data-unsectioned>
          <p className="text-sm font-extrabold text-ink">{t("sb.sec.others", "منشور بلا قسم ({{n}})", { n: formatNum(unsectioned.length + parked.length) })}</p>
          <p className="text-2xs text-ink-subtle">{t("sb.sec.othersHint", "يطلع للزبون آخر المتجر تحت «منتجات أخرى». اختر قسم لكل واحد أو رتّبهم هنا.")}</p>
          {unsectioned.map((p, j) => (
            <ProductLine key={p.id} p={p} busy={busy === `p:${p.id}`} first={j === 0} last={j === unsectioned.length - 1}
              onOpen={() => onOpen(p.id)} onUp={() => void moveProduct(null, p.id, "up")} onDown={() => void moveProduct(null, p.id, "down")}
              onTop={() => void moveProduct(null, p.id, "top")}
              assign={active.length > 0 ? (sec) => void assign(p, sec) : undefined} sections={active} />
          ))}
          {parked.map((p) => (
            <ProductLine key={p.id} p={p} busy={busy === `p:${p.id}`} first last onOpen={() => onOpen(p.id)}
              note={t("sb.sec.fromArchived", "من قسم مؤرشف «{{name}}» — ترتيبه يرجع ويّا قسمه", { name: nameOf(p.store_section_id) })}
              assign={active.length > 0 ? (sec) => void assign(p, sec) : undefined} sections={active} />
          ))}
        </div>
      )}

      {archived.length > 0 && (
        <div className="space-y-2">
          <button type="button" onClick={() => { playTap(); setShowArchived((v) => !v); }} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-ink">
            <ChevronDown size={14} className={cn("transition", showArchived && "rotate-180")} /> {t("sb.sec.archivedList", "المؤرشفة ({{n}})", { n: formatNum(archived.length) })}
          </button>
          {showArchived && archived.map((s) => (
            <div key={s.id} className="flex items-center gap-2 rounded-2xl border border-dashed border-line p-3">
              <span className="flex-1 truncate text-sm font-semibold text-ink-muted">{s.name}</span>
              <span className="text-2xs text-ink-subtle">{t("sb.sec.counts1", "{{n}} منتج", { n: formatNum(rows.filter((p) => p.store_section_id === s.id).length) })}</span>
              <Button size="sm" variant="outline" onClick={() => void archive(s, false)} loading={busy === `ar:${s.id}`} leftIcon={<ArchiveRestore size={14} />}>
                {t("sb.sec.restore", "رجّعه")}
              </Button>
            </div>
          ))}
        </div>
      )}

      {pickFor && (
        <PickDialog section={pickFor} rows={rows} sections={active} onClose={() => setPickFor(null)}
          onDone={async () => { setPickFor(null); await reload(); }} />
      )}
    </div>
  );
}

/** سطرُ منتجٍ بقسم. بلا `onUp/onDown/onTop` ⇒ لا أسهم (ترتيبُه ليس هنا — من قسمٍ مؤرشف) و`note` تقول لماذا. */
function ProductLine({ p, busy, first, last, onOpen, onUp, onDown, onTop, onRemove, assign, sections, note }: {
  p: PhotoProduct; busy: boolean; first: boolean; last: boolean;
  onOpen: () => void; onUp?: () => void; onDown?: () => void; onTop?: () => void; onRemove?: () => void;
  assign?: (sec: string) => void; sections?: StoreSection[]; note?: string;
}) {
  const { t } = useTranslation();
  const src = productImageUrl(thumbOf(p.image_path, p.image_meta as ImageMeta | null)) ?? productImageUrl(p.image_path);
  return (
    <div className={cn("flex items-center gap-2 rounded-xl border border-line bg-surface-1 p-2", busy && "opacity-60", note && "border-dashed")} data-section-product={p.id}>
      {onUp && onDown && onTop && (
        <div className="flex shrink-0 items-center">
          <button type="button" disabled={first || busy} onClick={onTop} aria-label={t("sb.top", "خلّيه الأول")} title={t("sb.top", "خلّيه الأول")}
            className="grid h-8 w-7 place-items-center rounded-md text-ink-subtle hover:bg-surface-2 disabled:opacity-30"><ChevronsUp size={14} /></button>
          <button type="button" disabled={first || busy} onClick={onUp} aria-label={t("sb.up", "لفوق")}
            className="grid h-8 w-7 place-items-center rounded-md text-ink-subtle hover:bg-surface-2 disabled:opacity-30"><ArrowUp size={14} /></button>
          <button type="button" disabled={last || busy} onClick={onDown} aria-label={t("sb.down", "لجوّه")}
            className="grid h-8 w-7 place-items-center rounded-md text-ink-subtle hover:bg-surface-2 disabled:opacity-30"><ArrowDown size={14} /></button>
        </div>
      )}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-2 text-start">
        <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
          {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff size={16} className="text-ink-subtle" />}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-ink">{p.name}</span>
          <span className="flex items-center gap-1.5 text-2xs text-ink-subtle">
            <span className={cn("font-bold", p.store_visible ? "text-success-700 dark:text-success-300" : "text-ink-subtle")}>
              {p.store_visible ? t("sb.badge.shown", "منشور") : t("sb.badge.hidden", "مخفي")}
            </span>
            {(Number(p.sell_price) || 0) > 0 && <span className="tabular-nums">{money(Number(p.sell_price))}</span>}
          </span>
          {note && <span className="block truncate text-2xs text-ink-subtle" data-parked-note>{note}</span>}
        </span>
      </button>
      {assign && sections && (
        <select defaultValue="" onChange={(e) => { if (e.target.value) assign(e.target.value); }} disabled={busy} aria-label={t("sb.sec.moveTo", "انقله لقسم")}
          className="h-8 max-w-[8rem] shrink-0 rounded-lg border border-line bg-surface-1 px-2 text-2xs font-semibold text-ink-muted">
          <option value="">{t("sb.sec.moveTo", "انقله لقسم")}</option>
          {sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
      )}
      {onRemove && (
        <button type="button" onClick={onRemove} disabled={busy} aria-label={t("sb.sec.removeFrom", "طلّعه من القسم")} title={t("sb.sec.removeFrom", "طلّعه من القسم")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-subtle hover:bg-surface-2 hover:text-danger-600"><X size={14} /></button>
      )}
    </div>
  );
}

/** صفحةُ المنتقي: ما يُرسم بالمرّة — والباقي يُقال بعدده ويُفتح بزرّ، لا يُقصّ بصمت. */
const PICK_PAGE = 200;

/** «أضف منتجات»: بحثٌ بالاسم والباركود والشركة، وكلُّ منتجٍ بحاله، واختيارٌ متعدّد —
 *  والمضافُ الجاهزُ يُنشر بنفس الضغطة إن أراد (قسمٌ بلا منشورٍ لا يطلع للزبون). */
function PickDialog({ section, rows, sections, onClose, onDone }: {
  section: StoreSection; rows: PhotoProduct[]; sections: StoreSection[];
  onClose: () => void; onDone: () => Promise<void>;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [pick, setPick] = useState<Set<string>>(new Set());
  const [publish, setPublish] = useState(true);
  const [busy, setBusy] = useState(false);
  const [limit, setLimit] = useState(PICK_PAGE);
  const secName = new Map(sections.map((s) => [s.id, s.name]));
  /* كان القصُّ عند ٢٠٠ بلا كلمة: بعيادةٍ بألف منتج، المخفيُّ بلا صورة (يُرتَّب آخراً) لا يُلقى بالتمرير
   * ولا يقول أحدٌ إنّ القائمةَ مقصوصة — «ما موجود» عن منتجٍ بالرفّ. الآن العددُ يُقال والباقي يُفتح. */
  const all = useMemo(() => rows.filter((p) => p.store_section_id !== section.id && matchesQuery(p, q))
    .sort((a, b) => Number(b.store_visible) - Number(a.store_visible) || Number(!!b.image_path) - Number(!!a.image_path) || a.name.localeCompare(b.name, "ar")),
  [rows, q, section.id]);
  const list = all.slice(0, limit);
  const save = async () => {
    const ids = [...pick];
    if (!ids.length || busy) return;
    setBusy(true);
    let moved = false;
    try {
      const r = await repo.assignStoreSection(ids, section.id);
      moved = true;
      playSuccess();
      toast.success(t("sb.moved", "انتقل {{n}} منتج إلى «{{name}}»", { n: formatNum(r.changed), name: section.name }));
      if (publish) {
        const hidden = ids.filter((id) => !rows.find((p) => p.id === id)?.store_visible);
        /* النقلُ ثبت بالخادم قبل النشر: فشلُ النشر يُقال وحدَه (لا «ما انحفظ» عن نقلٍ صار)،
         * والشاشةُ تُعاد قراءتُها على كلّ حال — وإلا بقيت تعرض الأقسامَ القديمة. */
        if (hidden.length) {
          try { publishToast(toast, t, await repo.storePublish(hidden, true), true); }
          catch (e) {
            playWarning();
            toast.error(t("sb.sec.pubAfterMove", "انتقلت للقسم — بس النشر ما صار. انشرها من اللوحة."), describeDbError(e, t));
            if (refusedByRole(e)) void refreshMyPermissions(user?.email);
          }
        }
      }
      await onDone();
    } catch (e) {
      playWarning();
      toast.error(t("sb.saveFailed", "ما انحفظ — أعد المحاولة"), describeDbError(e, t));
      if (refusedByRole(e)) void refreshMyPermissions(user?.email);
      if (moved) await onDone();
    }
    finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={() => { if (!busy) onClose(); }} size="lg" title={t("sb.sec.pickTitle", "أضف منتجات إلى «{{name}}»", { name: section.name })}>
      <div className="space-y-3">
        <div className="relative">
          <Search size={16} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setLimit(PICK_PAGE); }} placeholder={t("sb.search", "ابحث بالاسم أو الباركود أو الشركة")} className="input h-11 w-full ps-9" />
        </div>
        {all.length > list.length && (
          <p className="text-2xs font-semibold text-ink-subtle" data-pick-capped>
            {t("sb.sec.shownOf", "معروض {{n}} من {{total}} — اكتب للبحث", { n: formatNum(list.length), total: formatNum(all.length) })}
          </p>
        )}
        <div className="max-h-[50vh] space-y-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-ink-subtle">{t("sb.p.none", "ماكو منتجات بهذا البحث.")}</p>
          ) : list.map((p) => {
            const src = productImageUrl(thumbOf(p.image_path, p.image_meta as ImageMeta | null)) ?? productImageUrl(p.image_path);
            const other = p.store_section_id ? secName.get(p.store_section_id) : null;
            return (
              <label key={p.id} className={cn("flex cursor-pointer items-center gap-2.5 rounded-xl border p-2 transition hover:bg-surface-2",
                pick.has(p.id) ? "border-brand-400 bg-brand-50/50 dark:bg-brand-500/10" : "border-line")}>
                <input type="checkbox" checked={pick.has(p.id)} disabled={busy} className="h-4 w-4 shrink-0 accent-brand-600"
                  onChange={(e) => setPick((prev) => { const n = new Set(prev); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })} />
                <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-surface-2">
                  {src ? <img src={src} alt="" loading="lazy" className="h-full w-full object-contain" /> : <ImageOff size={16} className="text-ink-subtle" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-ink">{p.name}</span>
                  <span className="flex flex-wrap gap-x-2 text-2xs text-ink-subtle">
                    <span className={p.store_visible ? "font-bold text-success-700 dark:text-success-300" : ""}>{p.store_visible ? t("sb.badge.shown", "منشور") : t("sb.badge.hidden", "مخفي")}</span>
                    {!p.image_path && <span className="font-bold text-warn-700 dark:text-warn-200">{t("sb.noPhoto", "بلا صورة")}</span>}
                    {other && <span>{t("sb.sec.inOther", "بقسم «{{name}}» — ينتقل", { name: other })}</span>}
                  </span>
                </span>
                {(Number(p.sell_price) || 0) > 0 && <span className="shrink-0 text-xs font-bold tabular-nums text-ink">{money(Number(p.sell_price))}</span>}
              </label>
            );
          })}
          {all.length > list.length && (
            <Button className="w-full" size="sm" variant="outline" onClick={() => { playTap(); setLimit((n) => n + PICK_PAGE); }} data-pick-more>
              {t("sb.p.more", "اعرض الباقي ({{n}})", { n: formatNum(all.length - list.length) })}
            </Button>
          )}
        </div>
        <label className="flex items-center gap-2 text-xs font-semibold text-ink-muted">
          <input type="checkbox" checked={publish} onChange={(e) => setPublish(e.target.checked)} className="h-4 w-4 accent-brand-600" />
          {t("sb.sec.alsoPublish", "وانشر الجاهز منها (عليه صورة وسعر)")}
        </label>
        <Button className="w-full" onClick={() => void save()} loading={busy} disabled={!pick.size}>
          {t("sb.sec.addPicked", "أضف المختار ({{n}})", { n: formatNum(pick.size) })}
        </Button>
      </div>
    </Dialog>
  );
}
