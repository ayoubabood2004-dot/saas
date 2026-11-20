/* ============================================================================
 * أرشيفُ الأدوية (0280) — بالإعدادات تحت «أدويتي».
 *
 * طلبُ المالك (١٨/١١): «عيادة تريد تأرشف الأدوية الموجودة وترتّب أدويتها بنفسها — سويلي النظام متطوّر»، وقراراه: **الاثنين** (زرٌّ يخفي
 * قائمةَ النظام كلَّها + أرشفةُ دواءٍ وحده أو بالتحديد الجماعيّ، والترجيعُ من «المؤرشفة»)، و**كلُّ الكادر** عدا المصوّر.
 *  • ثلاثُ بطاقات: قائمةُ النظام (ظاهرة/مخفيّة بجملةٍ تعدّ ما يختفي وما يبقى)، و«اختر أدوية للأرشفة» (بحثٌ وعائلةٌ وتحديد)، و«المؤرشفة»
 *    بقائمةٍ واحدة (من النظام بالاسم، وما أضافته العيادة بصفّه، وما أخفاه زرُّ القائمة) تُرجَع واحدةً واحدة أو بالتحديد.
 *  • كلُّ أرشفةٍ بجملةٍ تسمّي ما يختفي وعددَه — لا window.confirm يُقبل بلا قراءة — وكلُّ ترجيعٍ بلا سؤال (لا يضيّع شيئاً).
 *  • الحسابُ كلُّه صِرف (`drugArchive.ts`): ما يُخفى (`hiddenBy`)، وخطّتا الأرشفة والترجيع؛ والشاشةُ تعرض وتنادي.
 *  • والمخزنُ يدخل الحساب: دواءٌ على الرفّ لا يُخفيه زرُّ القائمة — فالفهرسُ هنا بالمخزن، وفشلُه يُقال سطراً.
 * النصوصُ بنطاق darc المملوك (hot-paths.json): القطعةُ كسولةٌ من الإعدادات بـpage(…, ["darc"]).
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Archive, ArchiveRestore, Check, EyeOff, Eye, ListChecks, Loader2, Search, Star, X } from "lucide-react";
import type { MedicineStock } from "@/types";
import { useToast } from "@/components/ui";
import { useClinicDrugs, loadMedicineStock } from "@/lib/clinicDrugs";
import { drugKey, FAMILIES, type FamilyKey, type MedItem } from "@/lib/medIndex";
import { archivedEntries, archivePlan, isSystem, restorePlan, type ArchivedEntry } from "@/lib/drugArchive";
import { useSubscription } from "@/lib/subscription";
import { describeDbError } from "@/lib/errors";
import { cn, formatNum, searchable, uuid } from "@/lib/utils";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { useMedIndex } from "./MedPickerData";

const SHOW_FIRST = 60;

export function DrugArchivePanel() {
  const { t } = useTranslation();
  const toast = useToast();
  const drugs = useClinicDrugs();
  const a = drugs.archiveState;
  const { access } = useSubscription();
  const canWrite = access !== "readonly" && drugs.status === "ready";
  const [stock, setStock] = useState<MedicineStock[] | null>(null);
  const [stockFailed, setStockFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    loadMedicineStock().then((s) => { if (alive) setStock(s); }, () => { if (alive) setStockFailed(true); });
    return () => { alive = false; };
  }, []);
  const ix = useMedIndex({
    rows: drugs.rows, stock: stock ?? undefined, stockMode: "show", formulary: "all",
    groups: drugs.allGroups, items: drugs.items, showHidden: true,
  });
  const famLabel = (k: FamilyKey) => ix.famName.get(k) ?? t(`mymeds.fam.${k}`);

  /* ما يُؤرشف: من النظام، أو ما أضافته العيادة بصفّه — لا المخزنُ وحده ولا «الأخيرة». */
  const archivable = useMemo(() => ix.all.filter((it) => isSystem(it) || (it.base === "custom" && !!it.drugId)), [ix]);
  const visible = useMemo(() => archivable.filter((it) => !it.hiddenBy), [archivable]);
  const entries = useMemo(() => archivedEntries(a, drugs.rows,
    archivable.filter((it) => it.hiddenBy === "catalog").map((it) => ({ key: it.key, name: it.name })), drugKey), [a, drugs.rows, archivable]);
  /* زرُّ القائمة: ما يختفي = من النظام بلا صفٍّ حيّ ولا رصيد (ولم يُخفَ بالاسم)، وما يبقى = الظاهرُ غيرُه. */
  const offWouldHide = visible.filter((it) => isSystem(it) && !it.drugId && it.products.length === 0).length;
  /* وما بالمخزن وحده (بلا اسمٍ بالنظام) يبقى أيضاً — يُعدّ ولا يُؤرشف من هنا. */
  const stockOnly = ix.all.filter((it) => it.base === "stock").length;
  const offKeeps = visible.length - offWouldHide + stockOnly;
  const systemCount = archivable.filter(isSystem).length;

  const [busy, setBusy] = useState(false);
  const [catAsk, setCatAsk] = useState(false);
  const [picking, setPicking] = useState(false);
  const [q, setQ] = useState("");
  const [fam, setFam] = useState<FamilyKey | null>(null);
  const [sel, setSel] = useState<ReadonlySet<string>>(() => new Set());
  const [askArchive, setAskArchive] = useState(false);
  const [rq, setRq] = useState("");
  const [rsel, setRsel] = useState<ReadonlySet<string>>(() => new Set());
  const [showAll, setShowAll] = useState(false);

  const fail = (e: unknown) => { playWarning(); toast.error(describeDbError(e, t)); };
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(false); }
  };
  const toggle = (set: (f: (s: ReadonlySet<string>) => ReadonlySet<string>) => void, k: string) =>
    set((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });

  /* ── التحديد للأرشفة ── */
  const nq = searchable(q.trim());
  const shown = visible.filter((it) => (!fam || it.family === fam) && (!nq || it.hay.includes(nq)));
  const famsPresent = FAMILIES.filter((f) => visible.some((it) => it.family === f));
  const picked = visible.filter((it) => sel.has(it.key));
  const doArchive = () => run(async () => {
    const plan = archivePlan(picked);
    await drugs.hideNames(plan.hideNames);
    await drugs.applyChunked(plan.archiveIds.map((id) => ({ op: "archive" as const, id })));
    playSuccess();
    toast.success(t("darc.archived", { n: formatNum(picked.length) }));
    setSel(new Set()); setAskArchive(false);
  });

  /* ── المؤرشفة ── */
  const nrq = searchable(rq.trim());
  const rshown = entries.filter((e) => !nrq || searchable(e.name).includes(nrq) || (ix.byKey.get(e.key)?.hay.includes(nrq) ?? false));
  /* ما أرشفته العيادةُ بيدها قائمةٌ قصيرة تُرى كلُّها؛ وما أخفاه زرُّ القائمة (قد يكون مئة) مجموعةٌ مطويّة — والبحثُ يفتحها. */
  const ownShown = rshown.filter((e) => e.kind !== "catalog");
  const offShown = rshown.filter((e) => e.kind === "catalog");
  const offTotal = entries.filter((e) => e.kind === "catalog").length;
  const [offOpen, setOffOpen] = useState(false);
  const offList = showAll || nrq ? offShown : offShown.slice(0, SHOW_FIRST);
  const rpicked = entries.filter((e) => rsel.has(`${e.kind}:${e.key}`));
  const doRestore = (list: readonly ArchivedEntry[]) => run(async () => {
    const plan = restorePlan(list);
    await drugs.unhideNames(plan.unhideNames);
    await drugs.applyChunked([
      ...plan.restoreIds.map((id) => ({ op: "restore" as const, id })),
      ...plan.keepNames.map((name) => ({ op: "put" as const, id: uuid(), name, family: ix.byKey.get(drugKey(name))?.family ?? "other", mine: false })),
    ]);
    playSuccess();
    toast.success(t("darc.restored", { n: formatNum(list.length) }));
    setRsel(new Set());
  });

  const srcOf = (e: ArchivedEntry) => (e.kind === "name" ? t("darc.srcSystem") : e.kind === "row" ? t("darc.srcClinic") : t("darc.srcOff"));
  const labelOf = (name: string, key: string) => ix.byKey.get(key)?.label ?? name;
  const entryRow = (e: ArchivedEntry, badge: boolean) => {
    const k = `${e.kind}:${e.key}`;
    return (
      <li key={k} className="flex min-h-12 items-center gap-2 px-3 text-ink-muted" data-darc-entry={e.name} data-darc-kind={e.kind}>
        <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" checked={rsel.has(k)} onChange={() => toggle(setRsel, k)} aria-label={labelOf(e.name, e.key)} />
        <span className="min-w-0 flex-1 truncate text-sm font-bold" dir="auto">{labelOf(e.name, e.key)}</span>
        {badge && <span className="hidden shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-2xs sm:inline">{srcOf(e)}</span>}
        <button type="button" disabled={!canWrite || busy} onClick={() => void doRestore([e])} data-darc-restore={e.name}
          className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-surface-2 px-3 text-xs font-black text-brand-700 disabled:opacity-50 dark:text-brand-300">
          <Check size={13} />{t("darc.restore")}
        </button>
      </li>
    );
  };

  if (drugs.status === "error" && !drugs.rows.length) {
    return <p className="mt-5 text-xs font-bold text-danger-600" data-darc-failed>{t("darc.failed")} · <button type="button" onClick={drugs.retry} className="underline">{t("darc.retry")}</button></p>;
  }

  return (
    <div className="mt-6 space-y-3 border-t border-line pt-5" data-darc>
      <div>
        <h3 className="flex items-center gap-1.5 text-sm font-black text-ink"><Archive size={16} className="text-brand-600" />{t("darc.title")}</h3>
        <p className="mt-1 text-xs text-ink-subtle">{t("darc.subtitle")}</p>
        {access === "readonly" && <p className="mt-1 text-2xs font-bold text-warn-700 dark:text-warn-300">{t("darc.readOnly")}</p>}
        {stockFailed && <p className="mt-1 text-2xs font-bold text-warn-700 dark:text-warn-300" data-darc-stockfail>{t("darc.stockFail")}</p>}
      </div>

      {/* ── قائمةُ النظام ── */}
      {a.ready && (
        <div className={cn("rounded-2xl border p-3.5", a.off ? "border-warn-300 bg-warn-50 dark:border-warn-500/40 dark:bg-warn-500/10" : "border-line bg-surface-1")} data-darc-catalog={a.off ? "off" : "on"}>
          <div className="flex flex-wrap items-center gap-2">
            {a.off ? <EyeOff size={16} className="text-warn-700 dark:text-warn-300" /> : <Eye size={16} className="text-brand-600" />}
            <p className="min-w-0 flex-1 text-sm font-bold text-ink">
              {a.off ? t("darc.catOff", { n: formatNum(visible.length + stockOnly) }) : t("darc.catOn", { n: formatNum(systemCount) })}
            </p>
            {a.off ? (
              <button type="button" disabled={!canWrite || busy} data-darc-catshow
                onClick={() => run(async () => { await drugs.setCatalogOff(false); playSuccess(); toast.success(t("darc.catShown")); })}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface-1 px-3 text-xs font-black text-brand-700 disabled:opacity-50 dark:text-brand-300">
                <Eye size={14} />{t("darc.catShow")}
              </button>
            ) : !catAsk && (
              <button type="button" disabled={!canWrite || busy} data-darc-cathide onClick={() => { playTap(); setCatAsk(true); }}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-black text-warn-700 disabled:opacity-50 dark:text-warn-300">
                <EyeOff size={14} />{t("darc.catHide")}
              </button>
            )}
          </div>
          {a.off && <p className="mt-1.5 text-2xs text-ink-muted">{t("darc.catOffHint")}</p>}
          {!a.off && catAsk && (
            <div className="mt-2.5 rounded-xl border-2 border-warn-300 bg-warn-50 p-3 dark:border-warn-500/40 dark:bg-warn-500/10" data-darc-catask>
              <p className="text-sm font-bold text-ink">{t("darc.catAsk", { hide: formatNum(offWouldHide), keep: formatNum(offKeeps) })}</p>
              {/* لا يبقى شيء: المنتقي يصير فارغاً — يُقال قبل الضغط لا يُكتشف عند المريض. */}
              {offKeeps === 0 && <p className="mt-1.5 text-xs font-black text-danger-600" data-darc-catnone>{t("darc.catAskNone")}</p>}
              <div className="mt-2 flex gap-2">
                <button type="button" onClick={() => setCatAsk(false)} className="h-11 flex-1 rounded-xl bg-surface-1 text-sm font-bold text-ink-muted">{t("darc.cancel")}</button>
                <button type="button" disabled={!canWrite || busy} data-darc-catyes
                  onClick={() => run(async () => { await drugs.setCatalogOff(true); playSuccess(); toast.success(t("darc.catHidden")); setCatAsk(false); })}
                  className="h-11 flex-1 rounded-xl bg-warn-600 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="mx-auto animate-spin" /> : t("darc.catYes")}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── اختر أدوية للأرشفة ── */}
      {a.ready && (
        <div className="rounded-2xl border border-line bg-surface-1 p-3.5" data-darc-pick>
          <button type="button" disabled={!canWrite} onClick={() => { playTap(); setPicking((v) => !v); setAskArchive(false); }} data-darc-pickopen
            className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-surface-2 px-3 text-xs font-black text-brand-700 disabled:opacity-50 dark:text-brand-300">
            {picking ? <X size={14} /> : <ListChecks size={14} />}{picking ? t("darc.pickClose") : t("darc.pickOpen")}
          </button>
          {picking && (
            <div className="mt-3 space-y-2">
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("darc.searchPh")} aria-label={t("darc.searchPh")} data-darc-search
                  className="input h-11 w-full text-sm ltr:pl-9 rtl:pr-9" />
              </div>
              <div className="flex gap-1 overflow-x-auto pb-1" role="radiogroup" aria-label={t("darc.fams")}>
                {[null, ...famsPresent].map((f) => (
                  <button key={f ?? "all"} type="button" role="radio" aria-checked={fam === f} onClick={() => setFam(f)}
                    className={cn("shrink-0 rounded-full px-3 py-1.5 text-2xs font-bold", fam === f ? "bg-brand-600 text-white" : "bg-surface-2 text-ink-muted")}>
                    {f ? famLabel(f) : t("darc.allFams")}
                  </button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-2 text-2xs">
                <button type="button" onClick={() => setSel((s) => new Set([...s, ...shown.map((it) => it.key)]))} data-darc-selall
                  className="rounded-lg bg-surface-2 px-2.5 py-1.5 font-bold text-brand-700 dark:text-brand-300">{t("darc.selectAll", { n: formatNum(shown.length) })}</button>
                {sel.size > 0 && <button type="button" onClick={() => setSel(new Set())} className="rounded-lg bg-surface-2 px-2.5 py-1.5 font-bold text-ink-muted">{t("darc.clearSel")}</button>}
              </div>
              <ul className="max-h-[22rem] divide-y divide-line overflow-y-auto rounded-xl border border-line" data-darc-list>
                {shown.length === 0 && <li className="px-3 py-4 text-center text-xs text-ink-subtle">{t("darc.noMatch")}</li>}
                {shown.map((it: MedItem) => (
                  <li key={it.key}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-2 px-3 py-1.5" data-darc-item={it.name}>
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-brand-600" checked={sel.has(it.key)} onChange={() => toggle(setSel, it.key)} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-ink" dir="auto">{it.label}</span>
                        {it.sub && <span className="block truncate text-2xs text-ink-subtle" dir="auto">{it.sub}</span>}
                      </span>
                      {it.inMine && <Star size={13} className="shrink-0 fill-warn-400 text-warn-400" aria-label={t("darc.inMine")} />}
                      <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-2xs text-ink-muted">{isSystem(it) ? t("darc.srcSystem") : t("darc.srcClinic")}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {sel.size > 0 && !askArchive && (
                <button type="button" disabled={!canWrite || busy} onClick={() => { playTap(); setAskArchive(true); }} data-darc-archivesel
                  className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-warn-600 text-sm font-black text-white disabled:opacity-50">
                  <Archive size={15} />{t("darc.archiveSel", { n: formatNum(picked.length) })}
                </button>
              )}
              {askArchive && picked.length > 0 && (
                <div className="rounded-xl border-2 border-warn-300 bg-warn-50 p-3 dark:border-warn-500/40 dark:bg-warn-500/10" data-darc-archiveask>
                  <p className="text-sm font-bold text-ink">{t("darc.archiveAsk", {
                    n: formatNum(picked.length), names: picked.slice(0, 5).map((it) => it.label).join(t("darc.sep")),
                    more: picked.length > 5 ? t("darc.more", { n: formatNum(picked.length - 5) }) : "",
                  })}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" onClick={() => setAskArchive(false)} className="h-11 flex-1 rounded-xl bg-surface-1 text-sm font-bold text-ink-muted">{t("darc.cancel")}</button>
                    <button type="button" disabled={!canWrite || busy} onClick={() => void doArchive()} data-darc-archiveyes
                      className="h-11 flex-1 rounded-xl bg-warn-600 text-sm font-black text-white disabled:opacity-50">{busy ? <Loader2 size={15} className="mx-auto animate-spin" /> : t("darc.archiveYes")}</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── المؤرشفة ── */}
      <div className="rounded-2xl border border-line bg-surface-1 p-3.5" data-darc-archived>
        <p className="text-xs font-black text-ink-muted">{t("darc.archivedTitle", { n: formatNum(entries.length) })}</p>
        {entries.length === 0 ? (
          <p className="mt-2 text-2xs text-ink-subtle" data-darc-archived-empty>{drugs.status === "ready" ? t("darc.archivedEmpty") : "…"}</p>
        ) : (
          <div className="mt-2 space-y-2">
            {entries.length > 8 && (
              <div className="relative">
                <Search size={15} className="pointer-events-none absolute top-1/2 -translate-y-1/2 text-ink-subtle ltr:left-3 rtl:right-3" />
                <input value={rq} onChange={(e) => setRq(e.target.value)} placeholder={t("darc.searchPh")} aria-label={t("darc.searchPh")} data-darc-rsearch
                  className="input h-11 w-full text-sm ltr:pl-9 rtl:pr-9" />
              </div>
            )}
            {rpicked.length > 0 && (
              <button type="button" disabled={!canWrite || busy} onClick={() => void doRestore(rpicked)} data-darc-restoresel
                className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-xl bg-brand-600 text-sm font-black text-white disabled:opacity-50">
                {busy ? <Loader2 size={15} className="animate-spin" /> : <ArchiveRestore size={15} />}{t("darc.restoreSel", { n: formatNum(rpicked.length) })}
              </button>
            )}
            {rshown.length === 0 && <p className="px-3 py-3 text-center text-xs text-ink-subtle">{t("darc.noMatch")}</p>}
            {ownShown.length > 0 && (
              <ul className="divide-y divide-line rounded-xl border border-dashed border-line" data-darc-own>{ownShown.map((e) => entryRow(e, true))}</ul>
            )}
            {offTotal > 0 && (offShown.length > 0 || !nrq) && (
              <div className="rounded-xl border border-dashed border-warn-300 dark:border-warn-500/40" data-darc-offgroup>
                <button type="button" onClick={() => { playTap(); setOffOpen((v) => !v); }} aria-expanded={offOpen || !!nrq} data-darc-offtoggle
                  className="flex min-h-11 w-full items-center gap-2 px-3 text-start text-xs font-black text-warn-700 dark:text-warn-300">
                  <EyeOff size={14} className="shrink-0" />
                  <span className="min-w-0 flex-1">{t("darc.offGroup", { n: formatNum(nrq ? offShown.length : offTotal) })}</span>
                  <span className="shrink-0 text-2xs font-bold underline">{offOpen || nrq ? t("darc.offHideList") : t("darc.offShowList")}</span>
                </button>
                {(offOpen || !!nrq) && (
                  <>
                    <ul className="divide-y divide-line border-t border-dashed border-line">{offList.map((e) => entryRow(e, false))}</ul>
                    {!showAll && !nrq && offShown.length > SHOW_FIRST && (
                      <button type="button" onClick={() => setShowAll(true)} className="px-3 py-2 text-2xs font-bold text-brand-700 underline dark:text-brand-300">{t("darc.showAll", { n: formatNum(offShown.length) })}</button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
