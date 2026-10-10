import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { DndContext, useDraggable, useDroppable, type DragEndEvent, type DragOverEvent, type DragStartEvent } from "@dnd-kit/core";
import { Check, Plus, Search, ShieldAlert, Star, X } from "lucide-react";
import type { MedicineStock } from "@/types";
import {
  FAMILIES, freePicked, pickedFrom, pickerKeyAction, drugKey,
  type FamilyKey, type MedIndex, type MedItem, type PickedMed,
} from "@/lib/medIndex";
import { useClinicDrugs, loadMedicineStock, loadRecentMeds, refreshIfStale, isDrugError, getDrugsState } from "@/lib/clinicDrugs";
import { getActiveClinicId } from "@/lib/clinics";
import { useSubscription } from "@/lib/subscription";
import { pushModal, removeModal } from "@/lib/modalStack";
import { describeDbError } from "@/lib/errors";
import { cn, formatNum, searchable, uuid } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { useToast } from "@/components/ui";
import { MyMedsBoard, MedDragOverlay, dropIndex, dropOp, medCollision, pressOnly, useMedSensors, type DragData, type DropData } from "./MyMedsBoard";
import type { MedPickerProps } from "./MedPicker";
import { useMedIndex } from "./MedPickerData";

/* ============================================================================
 * MedPickerSheet — ورقةُ المنتقي (كسولة). بوابةٌ بطبقة z-80 فوق أيّ نافذة.
 *
 *  • كلُّ دواءٍ مرّةً واحدة، بلا سقف: العائلاتُ أقسامٌ بترتيبٍ ثابت و«أخرى» آخرُها،
 *    والرفُّ يقفز إليها؛ وما بالمخزن بلا توأمٍ عدسةٌ بآخرها. لا «الكل» — والبحثُ يغطّيه.
 *  • «أدويتي» أوّلاً: قسمٌ بالهاتف والآيباد العموديّ، وعمودٌ ثابتٌ ≥١٠٢٤.
 *  • النجمةُ والسحبُ يكتبان بالخادم (clinic_drugs_apply) — والفتحُ لا يكتب شيئاً أبداً.
 *  • Escape أثناء السحب يمرّ (dnd-kit يلغيه)، ثم يغلق البحث، ثم الورقة — والنافذةُ
 *    المضيفة لا تُغلق معها: الورقةُ بمكدّس النوافذ (`pushModal`).
 *  • لا autoFocus: الكيبورد لا يطلع إلا بضغطة العدسة أو بحقل «ما لكيته؟».
 * ==========================================================================*/

const VIEW_KEY = () => `vp_medpicker_view_${getActiveClinicId() || "default"}`;
type Section = "mine" | FamilyKey | "stock";

function useWide(): boolean {
  const q = "(min-width: 1024px)";
  const [wide, setWide] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.(q).matches);
  useEffect(() => {
    const m = window.matchMedia?.(q);
    if (!m) return;
    const on = () => setWide(m.matches);
    m.addEventListener?.("change", on);
    return () => m.removeEventListener?.("change", on);
  }, []);
  return wide;
}

export default function MedPickerSheet(p: MedPickerProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const modalId = useId();
  const wide = useWide();
  const drugs = useClinicDrugs();
  const { access } = useSubscription();
  const readOnly = access === "readonly";
  const canWrite = !readOnly && drugs.status === "ready";
  const showStock = p.stock !== "hide";
  const freeText = p.freeText ?? "oneOff";

  const [stock, setStock] = useState<MedicineStock[]>([]);
  const [recent, setRecent] = useState<string[] | null>([]);
  const [recentFailed, setRecentFailed] = useState(false);
  const [searchOn, setSearchOn] = useState(false);
  const [q, setQ] = useState("");
  const [section, setSection] = useState<Section | null>(null);
  const [confirmBanned, setConfirmBanned] = useState<string | null>(null);
  const [added, setAdded] = useState(0);
  const [freeOpen, setFreeOpen] = useState(false);
  const [dragging, setDragging] = useState<MedItem | null>(null);
  const [hint, setHint] = useState<{ id: string; after: boolean } | null>(null);
  const [live, setLive] = useState("");
  const justDragged = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const opened = useRef(false);

  /* البيانات: القائمةُ (تُقرأ من جديد إن كانت أقدمَ من ٣٠ث)، والمخزن، والأخيرة. لا كتابة. */
  useEffect(() => {
    void refreshIfStale();
    let alive = true;
    if (showStock) loadMedicineStock().then((s) => { if (alive) setStock(s); }).catch(() => { if (alive) setStock([]); /* swallow-ok: الشاراتُ تغيب ولا تنفي — المنتقي يعمل بلاها */ });
    const getRecent = () => loadRecentMeds().then((r) => { if (alive) { setRecent(r); setRecentFailed(false); } }).catch(() => { if (alive) setRecentFailed(true); });
    void getRecent();
    return () => { alive = false; };
  }, [showStock]);

  /* العدسةُ ضُغطت = طلبُ الكيبورد؛ وقبلها لا حقلَ مركَّزاً أبداً. */
  useEffect(() => { if (searchOn) searchRef.current?.focus(); }, [searchOn]);

  /* بمكدّس النوافذ: Esc النافذةِ المضيفة لا تُغلقها ما دام المنتقي فوقها. */
  useEffect(() => { pushModal(modalId); return () => removeModal(modalId); }, [modalId]);

  /* Escape بالفقاعة على المستند: أثناء السحب **يمرّ** بلا منعٍ ولا إيقاف فيلغيه dnd-kit. */
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const act = pickerKeyAction({ key: e.key, dragging: !!dragging, searchOn });
      if (act === "pass") return;
      e.preventDefault();
      e.stopPropagation();
      if (act === "closeSearch") { setSearchOn(false); setQ(""); return; }
      p.onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [dragging, searchOn, p]);

  const ix = useMedIndex({
    rows: drugs.rows, stock: showStock ? stock : undefined, recent: recent ?? undefined,
    species: p.species ?? null, only: p.only, stockMode: showStock ? "show" : "hide",
  });
  const mineIds = ix.mine.map((x) => x.drugId as string);
  const mineReady = drugs.status === "ready";

  /* أوّلُ عرض: آخرُ بابٍ بهذا الجهاز والعيادة إن لم يكن فارغاً، وإلا «أدويتي»، وإلا أوّلُ عائلة. */
  useEffect(() => {
    if (opened.current || drugs.status === "loading" || drugs.status === "idle") return;
    opened.current = true;
    let want: Section | null = null;
    try { const v = localStorage.getItem(VIEW_KEY()); if (v) want = v as Section; } catch { /* per-device convenience */ }
    const nonEmpty = (s: Section | null) => !!s && (s === "mine" ? ix.mine.length > 0 : s === "stock" ? ix.stockLens.length > 0 : ix.families.some((f) => f.key === s));
    const pick: Section | null = nonEmpty(want) ? want : ix.mine.length ? "mine" : (ix.families[0]?.key ?? null);
    if (pick) requestAnimationFrame(() => jump(pick, false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drugs.status]);

  const jump = (s: Section, remember = true) => {
    setSection(s);
    if (remember) { try { localStorage.setItem(VIEW_KEY(), s); } catch { /* per-device convenience */ } }
    if (s === "mine" && wide) return;
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-medsection="${s}"]`);
    if (el && scrollRef.current) scrollRef.current.scrollTo({ top: el.offsetTop - 8, behavior: "smooth" });
  };

  const announce = (msg: string) => setLive(msg);
  const fail = (e: unknown) => {
    playWarning();
    const code = (e as { code?: string } | null)?.code;
    toast.error(code === "not_ready" ? t("mymeds.notReady", "لحظة — «أدويتي» ما وصلت بعد") : describeDbError(e, t));
  };

  /* ── الاختيار ───────────────────────────────────────────────────────── */
  const selected = (m: PickedMed) => !!p.isSelected?.(m);
  const pick = (it: MedItem, via?: "mine" | "recent") => {
    if (Date.now() - justDragged.current < 250) return;   // نقرةٌ بعد إفلات ليست اختياراً
    const m = pickedFrom(it, via);
    if (p.mode === "multi" && selected(m)) { playTap(); p.onUnpick?.(m); return; }
    if (it.banned && confirmBanned !== it.key) { playWarning(); setConfirmBanned(it.key); return; }
    setConfirmBanned(null);
    playTap();
    p.onPick?.(m);
    setAdded((n) => n + 1);
  };

  /* ── النجمة ─────────────────────────────────────────────────────────── */
  const star = async (it: MedItem) => {
    if (!canWrite) return;
    playTap();
    if (it.inMine && it.drugId) {
      const i = mineIds.indexOf(it.drugId);
      const prev = i > 0 ? mineIds[i - 1] : null;
      try {
        await drugs.unstar(it.drugId);
        toast.toast({
          tone: "info", title: t("mymeds.unstarred", { name: it.label, defaultValue: "{{name}} انشال من أدويتي" }),
          action: { label: t("mymeds.undo", "تراجع"), onClick: () => { void undoUnstar(it, prev); } },
        });
      } catch (e) { fail(e); }
      return;
    }
    try {
      await drugs.star({ drugId: it.drugId, name: it.name, family: it.base === "stock" ? "other" : it.family });
      playSuccess();
      toast.success(t("mymeds.starred", { name: it.label, n: formatNum(ix.mine.length + 1), defaultValue: "{{name}} انضاف لأدويتي · رقم {{n}}" }));
    } catch (e) { fail(e); }
  };
  /* «تراجع»: يرجع بعد جاره القديم — وجارٌ شالته جهازٌ آخر ⇒ بآخر القائمة لا رفض. */
  const undoUnstar = async (it: MedItem, prev: string | null) => {
    try { await drugs.star({ drugId: it.drugId, name: it.name, family: it.family }, prev); playSuccess(); }
    catch (e) {
      if (isDrugError(e, "drug_row_gone")) { try { await drugs.star({ drugId: it.drugId, name: it.name, family: it.family }); playSuccess(); return; } catch (e2) { fail(e2); return; } }
      fail(e);
    }
  };

  /* ── السحب ──────────────────────────────────────────────────────────── */
  const sensors = useMedSensors();
  const onDragStart = (e: DragStartEvent) => {
    const d = e.active.data.current as DragData | undefined;
    if (!d) return;
    setDragging(d.item);
    playTap();
    announce(t("mymeds.annLift", { name: d.item.label, defaultValue: "رفعت {{name}}" }));
  };
  const onDragOver = (e: DragOverEvent) => {
    const at = e.over ? dropIndex(mineIds, e.active, e.over) : undefined;
    if (at == null || !mineIds.length) { setHint(null); return; }
    setHint(at >= mineIds.length ? { id: mineIds[mineIds.length - 1], after: true } : { id: mineIds[at], after: false });
  };
  const endDrag = () => { setDragging(null); setHint(null); justDragged.current = Date.now(); };
  const onDragEnd = async (e: DragEndEvent) => {
    const d = e.active.data.current as DragData | undefined;
    endDrag();
    if (!d || !canWrite) return;
    const op = dropOp(mineIds, e, uuid);
    if (!op) return;
    try {
      await drugs.apply([op]);
      playSuccess();
      const after = op.op === "put" || op.op === "move" ? op.after : undefined;
      const total = op.op === "put" ? mineIds.length + 1 : mineIds.length;
      const pos = after === undefined ? total : after === null ? 1 : mineIds.filter((x) => x !== op.id).indexOf(after) + 2;
      announce(t("mymeds.annPos", { name: d.item.label, pos: formatNum(pos), total: formatNum(total), defaultValue: "{{name}} بالمكان {{pos}} من {{total}}" }));
    } catch (err) { fail(err); }
  };

  /* ── العرض ──────────────────────────────────────────────────────────── */
  const searching = searchOn && searchable(q).length > 0;
  const results = searching ? ix.search(q) : [];
  const dragOutside = !!dragging && !dragging.inMine;

  const mineBoard = (
    <MyMedsBoard items={ix.mine} mode="pick" readOnly={!canWrite} draggingId={dragging?.drugId ?? null} hint={hint}
      onTap={(it) => pick(it, "mine")} onUnstar={(it) => void star(it)}
      onMove={(it, after) => { void drugs.move(it.drugId as string, after).catch(fail); }} announce={announce}
      empty={<MineEmpty status={drugs.status} onRetry={drugs.retry} />} />
  );

  const tile = (it: MedItem) => (
    <Tile key={it.key} it={it} selected={selected(pickedFrom(it))} confirming={confirmBanned === it.key}
      dragDisabled={!canWrite} starDisabled={!canWrite} onPick={() => pick(it)} onStar={() => void star(it)}
      onBack={() => setConfirmBanned(null)} />
  );

  return createPortal(
    <div className="fixed inset-0 z-[80] flex flex-col justify-end no-print" role="dialog" aria-modal="true" aria-label={p.title ?? t("mymeds.pickTitle", "اختر الدواء")} data-medpicker={p.mode}>
      <button type="button" aria-label={t("common.close", "إغلاق")} onClick={p.onClose} className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]" />
      <motion.div initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ duration: 0.16 }}
        className="relative mx-auto flex h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-t-4xl border border-b-0 border-line bg-surface-1 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-raised">
        <div className="mx-auto my-2 h-1.5 w-12 shrink-0 rounded-full bg-line" />
        <DndContext sensors={sensors} collisionDetection={medCollision} onDragStart={onDragStart} onDragOver={onDragOver}
          onDragEnd={(e) => void onDragEnd(e)} onDragCancel={() => { endDrag(); announce(t("mymeds.annCancel", "أُلغي السحب")); }}
          accessibility={{
            announcements: {
              onDragStart: ({ active }) => t("mymeds.annLift", { name: (active.data.current as DragData | undefined)?.item.label ?? "", defaultValue: "رفعت {{name}}" }),
              onDragOver: () => undefined,
              onDragEnd: () => undefined,
              onDragCancel: () => t("mymeds.annCancel", "أُلغي السحب"),
            },
            screenReaderInstructions: { draggable: t("mymeds.dragHelp", "اضغط مطوّلاً واسحب لـ«أدويتي»، أو استعمل ★") },
          }}>
          {/* الرأس: العنوان، العدسة، الإغلاق */}
          <div className="flex shrink-0 items-center gap-2 px-3 pb-2">
            <p className="min-w-0 flex-1 truncate text-base font-black text-ink">{p.title ?? t("mymeds.pickTitle", "اختر الدواء")}</p>
            <button type="button" data-medsearch onClick={() => { playTap(); setSearchOn((v) => !v); if (searchOn) setQ(""); }}
              aria-label={t("mymeds.searchPh", "دوّر بالاسم — عربي أو إنكليزي أو اسم تجاري")}
              className={cn("grid h-11 w-11 place-items-center rounded-2xl transition", searchOn ? "bg-brand-600 text-white" : "text-ink-muted hover:bg-surface-2")}>
              <Search size={19} />
            </button>
            <button type="button" onClick={p.onClose} aria-label={t("common.close", "إغلاق")} className="grid h-11 w-11 place-items-center rounded-full text-ink-subtle transition hover:bg-surface-2"><X size={19} /></button>
          </div>
          {searchOn && (
            <div className="shrink-0 px-3 pb-2">
              {/* الحقلُ يظهر بضغطة العدسة — والضغطةُ نفسُها طلبُ الكيبورد. */}
              <input ref={searchRef} value={q} onChange={(e) => setQ(e.target.value)} data-medsearch-input
                onKeyDown={(e) => { if (e.key === "Enter" && results[0]) { e.preventDefault(); pick(results[0]); } }}
                placeholder={t("mymeds.searchPh", "دوّر بالاسم — عربي أو إنكليزي أو اسم تجاري")} className="input h-12 w-full text-sm font-bold" />
            </div>
          )}

          {/* «الأخيرة» — من علاجات العيادة نفسها */}
          {!searching && (recentFailed ? (
            <p className="shrink-0 px-3 pb-2 text-2xs font-bold text-ink-subtle">
              {t("mymeds.recentFail", "ما وصلنا للأخيرة")} · <button type="button" className="font-black text-brand-600 underline" onClick={() => { setRecentFailed(false); void loadRecentMeds(true).then(setRecent).catch(() => setRecentFailed(true)); }}>{t("common.retry", "إعادة المحاولة")}</button>
            </p>
          ) : ix.recent.length > 0 && (
            <div className="flex shrink-0 items-center gap-1.5 overflow-x-auto px-3 pb-2" data-medrecent>
              <span className="shrink-0 text-2xs font-black text-ink-subtle">{t("mymeds.recent", "الأخيرة")}</span>
              {ix.recent.map((it) => <RecentChip key={it.key} it={it} selected={selected(pickedFrom(it, "recent"))} dragDisabled={!canWrite} onPick={() => pick(it, "recent")} />)}
            </div>
          ))}

          {(readOnly || drugs.status === "switched") && (
            <p className="mx-3 mb-2 shrink-0 rounded-xl bg-warn-50 px-3 py-2 text-2xs font-bold text-warn-700 dark:bg-warn-500/10 dark:text-warn-300">
              {drugs.status === "switched" ? t("mymeds.switched", "تبدّلت العيادة على هذا الجهاز — حدّث الصفحة.") : t("mymeds.readOnly", "الاشتراك منتهي — «أدويتي» للقراءة بس: لا نجمة ولا ترتيب.")}
            </p>
          )}

          <div className="flex min-h-0 flex-1 gap-2 px-3">
            {/* الرفّ */}
            {!searching && (
              <nav className="w-[120px] shrink-0 space-y-1 overflow-y-auto pb-2 md:w-40" data-medrail-nav aria-label={t("mymeds.railAria", "العائلات")}>
                <RailItem id="mine" label={`★ ${t("mymeds.mine", "أدويتي")}`} n={ix.mine.length} active={section === "mine"} glow={dragOutside} onClick={() => jump("mine")} drop />
                {ix.families.map((f) => (
                  <RailItem key={f.key} id={f.key} label={t(`mymeds.fam.${f.key}`)} n={f.count} active={section === f.key} onClick={() => jump(f.key)} famCount />
                ))}
                {showStock && ix.stockLens.length > 0 && (
                  <RailItem id="stock" label={t("mymeds.inStock", "بالمخزون")} n={ix.stockLens.length} active={section === "stock"} onClick={() => jump("stock")} famCount />
                )}
              </nav>
            )}

            {/* البلاطات */}
            <div ref={scrollRef} className="relative min-h-0 min-w-0 flex-1 space-y-4 overflow-y-auto overflow-x-hidden pb-24" data-medscroll>
              {searching ? (
                results.length ? (
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{results.map(tile)}</div>
                ) : (
                  <p className="py-10 text-center text-sm font-bold text-ink-subtle">{t("mymeds.noResults", "ماكو دواء بهالاسم — اكتبه من «ما لكيته؟»")}</p>
                )
              ) : (
                <>
                  {!wide && (
                    <section data-medsection="mine">
                      <SectionHead label={`★ ${t("mymeds.mine", "أدويتي")}`} n={ix.mine.length} />
                      {mineBoard}
                    </section>
                  )}
                  {FAMILIES.filter((k) => ix.byFamily.get(k)?.length).map((k) => (
                    <section key={k} data-medsection={k}>
                      <SectionHead label={t(`mymeds.fam.${k}`)} n={ix.byFamily.get(k)!.length} />
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ix.byFamily.get(k)!.map(tile)}</div>
                      {k === "other" && showStock && ix.stockLens.length > 0 && (
                        <button type="button" onClick={() => jump("stock")} className="mt-2 text-2xs font-black text-brand-600 underline">
                          {t("mymeds.stockMore", { n: formatNum(ix.stockLens.length), defaultValue: "+ {{n}} بالمخزون ← بالمخزون" })}
                        </button>
                      )}
                    </section>
                  ))}
                  {showStock && ix.stockLens.length > 0 && (
                    <section data-medsection="stock">
                      <SectionHead label={t("mymeds.inStock", "بالمخزون")} n={ix.stockLens.length} />
                      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{ix.stockLens.map(tile)}</div>
                    </section>
                  )}
                </>
              )}
              {dragOutside && <DropBar label={t("mymeds.dropHere", "أفلت هنا ← ★ أدويتي")} />}
            </div>

            {/* عمود «أدويتي» — ظاهرٌ دائماً ≥١٠٢٤ */}
            {wide && (
              <aside className="flex w-60 shrink-0 flex-col overflow-y-auto pb-24" data-medsection="mine">
                <SectionHead label={`★ ${t("mymeds.mine", "أدويتي")}`} n={ix.mine.length} />
                {mineBoard}
              </aside>
            )}
          </div>

          <MedDragOverlay item={dragging} />
        </DndContext>

        {/* الذيل: «ما لكيته؟» و«تم» */}
        {(freeText !== "off" || p.mode === "multi") && (
          <div className="shrink-0 border-t border-line px-3 pt-2">
            {freeOpen ? (
              <FreeCard mode={freeText} index={ix} defaultFamily={section && section !== "mine" && section !== "stock" ? section : "other"}
                canSave={canWrite && mineReady}
                onUse={(it) => { setFreeOpen(false); pick(it); }}
                onOneOff={(m) => { setFreeOpen(false); playTap(); p.onPick?.(m); setAdded((n) => n + 1); }}
                onSave={async (name, family) => {
                  try {
                    await drugs.addCustom({ name, family, mine: true });
                    playSuccess();
                    setFreeOpen(false);
                    const key = drugKey(name);
                    const row = getDrugsState().view.find((r) => r.archived_at == null && drugKey(r.name) === key);
                    p.onPick?.({ ...freePicked(name, family), source: "mine", drugId: row?.id });
                    setAdded((n) => n + 1);
                  } catch (e) { fail(e); }
                }}
                onCancel={() => setFreeOpen(false)} />
            ) : (
              <div className="flex items-center gap-2">
                {freeText !== "off" && (
                  <button type="button" data-medfree onClick={() => { playTap(); setFreeOpen(true); }} className="inline-flex items-center gap-1 text-2xs font-bold text-ink-muted underline transition hover:text-ink">
                    <Plus size={13} /> {t("mymeds.notFound", "ما لكيته؟ اكتبه")}
                  </button>
                )}
                {p.mode === "multi" && (
                  <button type="button" data-meddone onClick={p.onClose}
                    className="ms-auto flex h-12 min-w-[140px] items-center justify-center gap-2 rounded-2xl bg-brand-600 px-4 text-base font-black text-white shadow-soft transition hover:bg-brand-700">
                    <Check size={19} /> {added > 0 ? t("mymeds.doneN", { n: formatNum(added), defaultValue: "تم · {{n}}" }) : t("common.done", "تم")}
                  </button>
                )}
              </div>
            )}
          </div>
        )}
        <p className="sr-only" aria-live="polite" data-medlive>{live}</p>
      </motion.div>
    </div>,
    document.body,
  );
}

/* ── أجزاء ─────────────────────────────────────────────────────────────── */

function SectionHead({ label, n }: { label: string; n: number }) {
  return (
    <p className="sticky top-0 z-10 mb-1.5 flex items-center gap-2 bg-surface-1/95 py-1 text-xs font-black text-ink-muted backdrop-blur">
      <span className="truncate">{label}</span><span className="tabular-nums opacity-70">{formatNum(n)}</span>
    </p>
  );
}

function RailItem({ id, label, n, active, onClick, glow, drop, famCount }: {
  id: string; label: string; n: number; active: boolean; onClick(): void; glow?: boolean; drop?: boolean; famCount?: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `rail-${id}`, data: { kind: "end" } satisfies DropData, disabled: !drop });
  return (
    <button ref={drop ? setNodeRef : undefined} type="button" onClick={() => { playTap(); onClick(); }} data-medrail={id}
      {...(famCount ? { "data-medfam-count": n } : {})}
      className={cn("flex min-h-12 w-full items-center gap-1 rounded-2xl px-2.5 text-start text-xs font-bold transition",
        active ? "bg-brand-600 text-white shadow-soft" : "bg-surface-2 text-ink-muted hover:bg-surface-3",
        glow && "ring-2 ring-brand-400 ring-offset-1 ring-offset-surface-1", isOver && "bg-brand-500 text-white")}>
      <span className="min-w-0 flex-1 leading-tight">{label}</span>
      <span className="shrink-0 text-2xs font-black tabular-nums opacity-70">{formatNum(n)}</span>
    </button>
  );
}

function DropBar({ label }: { label: string }) {
  const { setNodeRef, isOver } = useDroppable({ id: "mine-bar", data: { kind: "end" } satisfies DropData });
  return (
    <div ref={setNodeRef} data-meddropbar
      className={cn("sticky bottom-2 z-20 mx-auto flex h-14 items-center justify-center rounded-2xl border-2 border-dashed px-4 text-sm font-black shadow-raised transition",
        isOver ? "border-brand-500 bg-brand-600 text-white" : "border-brand-400 bg-surface-1 text-brand-700 dark:text-brand-300")}>
      {label}
    </div>
  );
}

function MineEmpty({ status, onRetry }: { status: string; onRetry(): void }) {
  const { t } = useTranslation();
  if (status === "error") {
    return (
      <p className="rounded-2xl border border-dashed border-line px-3 py-4 text-center text-2xs font-bold text-ink-subtle">
        {t("mymeds.loadFail", "ما وصلنا لأدويتك — المشكلة بالاتصال، ما انمسحت")} · <button type="button" onClick={onRetry} className="font-black text-brand-600 underline">{t("common.retry", "إعادة المحاولة")}</button>
      </p>
    );
  }
  if (status === "loading" || status === "idle") return <p className="py-4 text-center text-sm font-bold text-ink-subtle" aria-busy>…</p>;
  return <p className="rounded-2xl border border-dashed border-line px-3 py-4 text-center text-2xs font-bold text-ink-subtle">{t("mymeds.mineEmpty", "أدويتي فاضية — اضغط ★ على أي دواء أو اسحبه هنا")}</p>;
}

function Tile({ it, selected, confirming, dragDisabled, starDisabled, onPick, onStar, onBack }: {
  it: MedItem; selected: boolean; confirming: boolean; dragDisabled: boolean; starDisabled: boolean;
  onPick(): void; onStar(): void; onBack(): void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: `tile:${it.key}`, data: { kind: "tile", item: it } satisfies DragData, disabled: dragDisabled });
  /* الفأرةُ واللمسُ وحدهما يبدآن السحب — Space/Enter على البلاطة تعني «اختر». */
  const press = pressOnly(listeners);
  if (confirming && it.banned) {
    return (
      <div className="rounded-2xl border-2 border-danger-300 bg-danger-50 p-2.5 dark:border-danger-500/40 dark:bg-danger-500/10">
        <p className="flex items-start gap-1.5 text-2xs font-bold leading-snug text-danger-700 dark:text-danger-300"><ShieldAlert size={14} className="mt-0.5 shrink-0" />{it.banned}</p>
        <div className="mt-2 flex gap-1.5">
          <button type="button" onClick={() => { playTap(); onBack(); }} className="h-11 flex-1 rounded-xl bg-surface-1 text-xs font-extrabold text-ink-muted">{t("common.back", "رجوع")}</button>
          <button type="button" onClick={onPick} className="h-11 flex-1 rounded-xl bg-danger-600 text-xs font-extrabold text-white">{t("mymeds.addAnyway", "أضفه رغم التحذير")}</button>
        </div>
      </div>
    );
  }
  return (
    <div ref={setNodeRef} className={cn("relative", isDragging && "opacity-30")}>
      <button type="button" data-medtile={it.key} onClick={onPick} {...press}
        className={cn("relative min-h-[72px] w-full touch-manipulation select-none rounded-2xl border-2 p-2.5 pe-12 text-start transition [-webkit-touch-callout:none] active:scale-[0.98]",
          selected ? "border-success-500 bg-success-700 text-white"
            : it.banned ? "border-danger-300 bg-danger-50 text-danger-700 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-300"
              : "border-line bg-surface-2 hover:border-brand-300")}>
        <span className={cn("block truncate text-base font-black", selected ? "text-white" : "text-ink")}>{it.label}</span>
        {it.sub && <span className={cn("block truncate text-2xs font-semibold", selected ? "text-white" : "text-ink-muted")} dir="auto">{it.sub}</span>}
        <span className="mt-1 flex flex-wrap gap-1 text-[10px] font-black">
          {selected ? <span className="rounded-full bg-white/20 px-1.5 py-0.5">{t("mymeds.added", "أُضيف ✓")}</span>
            : it.banned ? <span className="rounded-full bg-danger-100 px-1.5 py-0.5 text-danger-700 dark:bg-danger-500/20 dark:text-danger-300">{t("mymeds.badgeBanned", "ممنوع")}</span>
              : it.dosed ? <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("mymeds.badgeDosed", "جرعة جاهزة")}</span>
                : <span className="rounded-full bg-surface-1 px-1.5 py-0.5 text-ink-muted">{t("mymeds.badgeNoDose", "بلا جرعة موثّقة")}</span>}
          {it.stock != null && !selected && <span className="rounded-full bg-success-50 px-1.5 py-0.5 text-success-700 dark:bg-success-500/15 dark:text-success-300">{t("mymeds.badgeStock", { n: formatNum(it.stock), defaultValue: "بالمخزون · {{n}}" })}</span>}
        </span>
      </button>
      <button type="button" data-medstar={it.key} aria-pressed={it.inMine} disabled={starDisabled} onClick={onStar}
        aria-label={it.inMine ? t("mymeds.starOff", "شيله من أدويتي") : t("mymeds.starOn", "ضيفه لأدويتي")}
        title={it.inMine ? t("mymeds.starOff", "شيله من أدويتي") : t("mymeds.starOn", "ضيفه لأدويتي")}
        className={cn("absolute end-0.5 top-0.5 grid h-11 w-11 place-items-center rounded-full transition disabled:opacity-40",
          it.inMine ? "text-warn-500" : selected ? "text-white/70 hover:text-white" : "text-ink-subtle hover:text-warn-500")}>
        <Star size={19} fill={it.inMine ? "currentColor" : "none"} />
      </button>
    </div>
  );
}

function RecentChip({ it, selected, dragDisabled, onPick }: { it: MedItem; selected: boolean; dragDisabled: boolean; onPick(): void }) {
  const { setNodeRef, listeners } = useDraggable({ id: `recent:${it.key}`, data: { kind: "tile", item: it } satisfies DragData, disabled: dragDisabled || it.base === "recent" });
  return (
    <button ref={setNodeRef} type="button" data-medrecent-chip={it.key} onClick={onPick}
      {...pressOnly(listeners)}
      className={cn("h-10 shrink-0 touch-manipulation select-none rounded-full border px-3 text-xs font-bold transition [-webkit-touch-callout:none]",
        selected ? "border-success-500 bg-success-700 text-white" : "border-line bg-surface-2 text-ink hover:border-brand-300")}>
      {it.label}
    </button>
  );
}

/* «ما لكيته؟ اكتبه» — الاسمُ وحده يفتح الكيبورد، والعائلةُ إلزامية، والتوأمُ يُقال قبل الحفظ. */
function FreeCard({ mode, index, defaultFamily, canSave, onUse, onOneOff, onSave, onCancel }: {
  mode: "offer" | "oneOff" | "off"; index: MedIndex; defaultFamily: FamilyKey; canSave: boolean;
  onUse(it: MedItem): void; onOneOff(m: PickedMed): void; onSave(name: string, family: FamilyKey): Promise<void>; onCancel(): void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [family, setFamily] = useState<FamilyKey>(defaultFamily);
  const [busy, setBusy] = useState(false);
  const clean = name.trim();
  const twin = clean ? index.byKey.get(searchable(clean)) : undefined;
  const ok = clean.length > 1 && !twin;
  return (
    <div className="space-y-2" data-medfreecard>
      <div className="flex items-center gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("mymeds.newNamePh", "اسم الدواء كما تكتبه")} className="input h-12 min-w-0 flex-1 text-sm font-bold" data-medfree-name />
        <button type="button" onClick={onCancel} aria-label={t("common.cancel", "إلغاء")} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-ink-subtle hover:bg-surface-2"><X size={18} /></button>
      </div>
      <div className="flex gap-1 overflow-x-auto pb-1" role="radiogroup" aria-label={t("mymeds.family", "العائلة")}>
        {FAMILIES.map((k) => (
          <button key={k} type="button" role="radio" aria-checked={family === k} onClick={() => setFamily(k)} data-medfree-fam={k}
            className={cn("h-9 shrink-0 rounded-full border px-3 text-2xs font-black transition", family === k ? "border-brand-500 bg-brand-600 text-white" : "border-line bg-surface-2 text-ink-muted")}>
            {t(`mymeds.fam.${k}`)}
          </button>
        ))}
      </div>
      {twin ? (
        <div className="flex items-center gap-2 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          <span className="min-w-0 flex-1 truncate">{t("mymeds.exists", { name: twin.label, defaultValue: "موجود: {{name}}" })}</span>
          <button type="button" onClick={() => onUse(twin)} className="h-9 shrink-0 rounded-xl bg-brand-600 px-3 text-xs font-black text-white">{t("mymeds.useIt", "استعمله")}</button>
        </div>
      ) : (
        <div className="flex gap-2">
          <button type="button" disabled={!ok} onClick={() => onOneOff(freePicked(clean, family))} data-medfree-oneoff
            className="h-12 flex-1 rounded-2xl border border-line bg-surface-2 text-sm font-black text-ink disabled:opacity-40">{t("mymeds.oneOff", "هالمرة بس")}</button>
          {mode === "offer" && (
            <button type="button" disabled={!ok || !canSave || busy} data-medfree-save
              onClick={async () => { setBusy(true); try { await onSave(clean, family); } finally { setBusy(false); } }}
              className="h-12 flex-1 rounded-2xl bg-brand-600 text-sm font-black text-white disabled:opacity-40">{t("mymeds.saveMine", "احفظه بأدويتي")}</button>
          )}
        </div>
      )}
    </div>
  );
}
