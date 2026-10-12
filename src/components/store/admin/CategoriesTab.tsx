import { useMemo, useState, type MutableRefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, Eye, EyeOff, Loader2, MoreHorizontal, Plus, RotateCcw, Tags, Trash2 } from "lucide-react";
import type { Product, StoreCatIcon } from "@/types";
import { Modal } from "@/components/Modal";
import { Button, Skeleton, useToast } from "@/components/ui";
import { useStoreCats } from "@/lib/storeCats";
import { isListed, NAME_MAX, type CatRow } from "@/lib/storeCatIndex";
import { catGlyph } from "@/lib/storeLib";
import { describeDbError } from "@/lib/errors";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { cn, formatNum, localISO, uuid } from "@/lib/utils";
import { IconGrid } from "./IconGrid";
import { SortList } from "./SortList";
import { CategoryChecklist } from "./CategoryChecklist";

/* ============================================================================
 * «التصنيفات» — تبويبُ «المتجر الإلكتروني» (متجر v1، O2/O3). رفيقُ ClinicStore (نطاق cat).
 *
 * تصنيفاتُ العيادة بترتيبها: تُسمّى وتُخفى وتُشال (أرشفةٌ تُرجَع من «المحذوفة» — لا حذف) ويُضاف
 * غيرُها، ويُرتَّب بالسحب (الحاسوب) أو بالأسهم (الهاتف). والمصوّرُ يرى القائمةَ ويفتح أيَّ تصنيفٍ
 * يؤشّر موادَّه — بلا بنيةٍ ولا ترتيب (والخادمُ يرفض بـ42501 على أيّ حال).
 * والإزالةُ تُقال بورقةٍ داخل التطبيق تشرح ماذا يصير — لا نافذةَ متصفّحٍ تُقبل بلا قراءة.
 * ==========================================================================*/

export type LeaveGuard = MutableRefObject<((proceed: () => void) => boolean) | null>;

export function CategoriesTab({ products, guard }: {
  /** منتجاتُ العيادة (الحقولُ تُستثنى هنا). null = تتحمّل. */
  products: Product[] | null;
  /** يسأله الأبُ قبل أن يغادر (تبويبٌ آخر): false = الورقةُ فُتحت والانتقالُ معلَّق. */
  guard: LeaveGuard;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const cats = useStoreCats();
  const [openId, setOpenId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newIcon, setNewIcon] = useState<StoreCatIcon>("tag");
  const [editing, setEditing] = useState<CatRow | null>(null);
  const [editName, setEditName] = useState("");
  const [editIcon, setEditIcon] = useState<StoreCatIcon>("tag");
  const [archiving, setArchiving] = useState<CatRow | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [busy, setBusy] = useState(false);

  const mine = useMemo(() => (products ?? []).filter((p) => !p.farm_id), [products]);
  const byId = useMemo(() => new Map(mine.map((p) => [p.id, p])), [mine]);
  const today = localISO();
  const counts = (id: string) => {
    const ids = cats.membersOf(id).filter((pid) => byId.has(pid));
    return { n: ids.length, listed: ids.filter((pid) => isListed(byId.get(pid) as Product, today)).length };
  };

  /** كلُّ كتابةٍ: تُطبَّق فوراً، والرفضُ يُقال بالعربية ويرجع ما على الشاشة (storeCats). */
  const run = async (ops: Parameters<typeof cats.apply>[0], ok?: string): Promise<boolean> => {
    setBusy(true);
    try {
      await cats.apply(ops);
      playSuccess();
      if (ok) toast.success(ok);
      return true;
    } catch (e) {
      playWarning();
      toast.error(t("cat.saveFailed", "ما انحفظ"), describeDbError(e, t));
      return false;
    } finally { setBusy(false); }
  };

  const open = cats.live.find((c) => c.id === openId) ?? null;
  if (openId && open) {
    return (
      <CategoryChecklist cat={open} products={mine} canEdit={cats.canEdit} guard={guard}
        onBack={() => setOpenId(null)} />
    );
  }

  if (cats.status === "idle" || (cats.status === "loading" && !cats.live.length && !cats.seeded)) {
    return <div className="space-y-2" data-storecats>{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-2xl" />)}</div>;
  }
  if (cats.status === "switched") {
    return (
      <div className="card p-6 text-center text-sm font-semibold text-warn-700 dark:text-warn-200" data-storecats>
        {t("cat.switched", "تبدّلت العيادة — حدّث الصفحة. ما انحفظ شي.")}
      </div>
    );
  }
  if (cats.status === "error" && !cats.live.length && !cats.seeded) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-danger-200 bg-danger-50 p-6 text-center dark:border-danger-500/30 dark:bg-danger-500/10" data-storecats>
        <p className="text-sm font-semibold text-danger-700 dark:text-danger-300">{describeDbError(cats.error, t)}</p>
        <Button size="sm" variant="secondary" onClick={() => { playTap(); cats.retry(); }}>{t("common.retry", "إعادة المحاولة")}</Button>
      </div>
    );
  }

  if (!cats.seeded) {
    return (
      <div className="card space-y-3 p-5" data-storecats>
        <p className="flex items-center gap-2 font-display text-base font-extrabold text-ink"><Tags size={18} className="text-brand-600" /> {t("cat.introTitle", "رفوف متجرك")}</p>
        <p className="text-sm leading-relaxed text-ink-muted">{t("cat.introBody", "الزبون يتصفح متجرك برفوف (تصنيفات) ترتّبها إنت. نبدأ لك بخمسة من أصناف مخزنك — أدوية، أغذية، مستلزمات، مستهلكات، منوعات — بموادها، وتكدر تسمّيها وتخفيها وتشيلها وتضيف غيرها. والمادة تكدر تكون بأكثر من تصنيف.")}</p>
        {cats.canEdit ? (
          <Button onClick={() => void run([{ op: "init" }], t("cat.initDone", "انضافت التصنيفات"))} loading={busy} data-catinit>
            {t("cat.init", "ابدأ بالتصنيفات")}
          </Button>
        ) : (
          <p className="text-xs font-semibold text-ink-subtle">{t("cat.initByManager", "المدير أو الطبيب يبدأ التصنيفات — بعدها تكدر تؤشّر مواد أي تصنيف.")}</p>
        )}
      </div>
    );
  }

  const ids = cats.live.map((c) => c.id);
  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    if (await run([{ op: "create", id: uuid(), name, icon: newIcon }], t("cat.created", "انضاف التصنيف"))) {
      setNewName(""); setNewIcon("tag"); setCreating(false);
    }
  };
  const saveEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name) return;
    if (name === editing.name && editIcon === editing.icon) { setEditing(null); return; }
    if (await run([{ op: "edit", id: editing.id, name, icon: editIcon }], t("cat.edited", "انحفظ التصنيف"))) setEditing(null);
  };

  return (
    <div className="space-y-4" data-storecats>
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="font-display text-base font-extrabold text-ink">{t("cat.catsTitle", "تصنيفات المتجر")}</p>
          <p className="text-xs text-ink-subtle">
            {cats.canEdit
              ? t("cat.catsHint", "بهذا الترتيب يشوفها الزبون. اضغط تصنيفاً لتؤشّر مواده.")
              : t("cat.catsHintPhoto", "اضغط أي تصنيف لتؤشّر مواده — التسمية والترتيب للمدير والطبيب.")}
          </p>
        </div>
        {cats.saving && <Loader2 size={16} className="animate-spin text-ink-subtle" aria-label={t("cat.saving", "يحفظ…")} />}
        {cats.canEdit && !creating && (
          <Button size="sm" leftIcon={<Plus size={15} />} onClick={() => { playTap(); setCreating(true); }} data-catnew>{t("cat.newCat", "تصنيف جديد")}</Button>
        )}
      </div>

      {cats.status === "error" && (
        <div className="flex items-center gap-2 rounded-2xl border border-warn-300 bg-warn-50/60 p-3 text-xs font-semibold text-warn-700 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-200">
          <span className="min-w-0 flex-1">{t("cat.staleWarn", "آخر تحديث فشل — المعروض قد يكون قديماً.")}</span>
          <button type="button" className="underline" onClick={() => cats.retry()}>{t("common.retry", "إعادة المحاولة")}</button>
        </div>
      )}

      {creating && (
        <div className="card space-y-3 p-4" data-catcreate>
          <input className="input" autoFocus value={newName} maxLength={NAME_MAX} onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void create(); if (e.key === "Escape") setCreating(false); }}
            placeholder={t("cat.namePh", "اسم التصنيف — مثلاً: عروض، قطط، طيور")} />
          <IconGrid value={newIcon} onChange={setNewIcon} />
          <div className="flex gap-2">
            <Button className="flex-1" onClick={() => void create()} loading={busy} disabled={!newName.trim()}>{t("cat.addCat", "أضف التصنيف")}</Button>
            <Button variant="outline" onClick={() => { setCreating(false); setNewName(""); }}>{t("common.cancel", "إلغاء")}</Button>
          </div>
        </div>
      )}

      {cats.live.length === 0 ? (
        <div className="card grid place-items-center p-8 text-sm text-ink-subtle">{t("cat.noCats", "ما اكو تصنيفات — أضف تصنيفاً، أو رجّع واحداً من المحذوفة.")}</div>
      ) : (
        <SortList ids={ids} disabled={!cats.canEdit || busy}
          onMove={(id, after) => void run([{ op: "move", id, after }])}
          row={(id, { handle, arrows }) => {
            const c = cats.live.find((x) => x.id === id) as CatRow;
            const k = counts(id);
            /* الإخفاءُ والتعديلُ — بسطر الصفّ بالحاسوب، وبسطرٍ ثانٍ مع الأسهم بالهاتف (٣٧٥ لا يتّسع
               لاسمٍ وعدٍّ وستّةِ أزرار بسطرٍ واحد: كان الاسمُ يُقصّ لحرفٍ واحد). */
            const tools = (
              <>
                <button type="button" disabled={busy} onClick={() => void run([{ op: "hide", id, hidden: !c.hidden }])} data-cathide
                  aria-label={c.hidden ? t("cat.show", "أظهره للزبون") : t("cat.hide", "اخفِه عن الزبون")}
                  className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full border transition active:scale-95",
                    c.hidden ? "border-warn-300 text-warn-700 dark:text-warn-200" : "border-line text-ink-muted hover:bg-surface-2")}>
                  {c.hidden ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
                <button type="button" onClick={() => { playTap(); setEditing(c); setEditName(c.name); setEditIcon(c.icon); }} data-catmenu
                  aria-label={t("cat.menu", "تعديل")}
                  className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-line text-ink-muted transition hover:bg-surface-2">
                  <MoreHorizontal size={16} />
                </button>
              </>
            );
            return (
              <div className={cn("card p-2.5", c.hidden && "opacity-70")} data-catrow>
                <div className="flex items-center gap-2">
                  {handle}
                  <button type="button" onClick={() => { playTap(); setOpenId(id); }} data-catopen
                    className="flex min-w-0 flex-1 items-center gap-2.5 rounded-xl p-1 text-start transition hover:bg-surface-2">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-xl">{catGlyph(c.icon)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold text-ink">{c.name}</span>
                      <span className="block text-2xs text-ink-subtle tabular-nums">
                        {t("cat.counts", "{{n}} مادة · {{m}} يشوفها الزبون", { n: formatNum(k.n), m: formatNum(k.listed) })}
                        {c.hidden && <b className="ms-1.5 text-warn-700 dark:text-warn-200">{t("cat.hiddenBadge", "مخفي عن الزبون")}</b>}
                      </span>
                    </span>
                    <ChevronLeft size={16} className="shrink-0 text-ink-subtle rtl:rotate-0 ltr:rotate-180" />
                  </button>
                  {cats.canEdit && <span className="hidden shrink-0 items-center gap-2 sm:flex">{tools}</span>}
                </div>
                {cats.canEdit && (
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 sm:hidden" data-catrowtools>
                    {arrows}
                    <span className="flex items-center gap-2">{tools}</span>
                  </div>
                )}
              </div>
            );
          }} />
      )}

      {cats.archived.length > 0 && (
        <div className="space-y-2" data-catarchived>
          <button type="button" onClick={() => { playTap(); setShowArchived((v) => !v); }}
            className="flex items-center gap-1.5 text-xs font-bold text-ink-muted hover:text-ink">
            <Trash2 size={13} /> {t("cat.archivedTitle", "المحذوفة ({{n}})", { n: formatNum(cats.archived.length) })}
          </button>
          {showArchived && cats.archived.map((c) => (
            <div key={c.id} className="card flex items-center gap-2.5 p-2.5 opacity-80">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-surface-2 text-lg">{catGlyph(c.icon)}</span>
              <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">{c.name}</span>
              {cats.canEdit && (
                <Button size="sm" variant="outline" disabled={busy} leftIcon={<RotateCcw size={14} />} data-catrestore
                  onClick={() => void run([{ op: "restore", id: c.id }], t("cat.restored", "رجع التصنيف — بآخر القائمة"))}>
                  {t("cat.restore", "رجّعه")}
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* تعديل: الاسم والأيقونة، ومنه «شيل» */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title={t("cat.editTitle", "تعديل التصنيف")}>
        {editing && (
          <div className="space-y-4" data-catedit>
            <div>
              <label className="mb-1 block text-xs font-bold text-ink-muted">{t("cat.nameLabel", "الاسم")}</label>
              <input className="input" value={editName} maxLength={NAME_MAX} onChange={(e) => setEditName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void saveEdit(); }} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-bold text-ink-muted">{t("cat.iconLabel", "الأيقونة")}</label>
              <IconGrid value={editIcon} onChange={setEditIcon} />
            </div>
            <Button className="w-full" onClick={() => void saveEdit()} loading={busy} disabled={!editName.trim()}>{t("cat.save", "احفظ")}</Button>
            <button type="button" onClick={() => { playTap(); setArchiving(editing); setEditing(null); }} data-catarchive
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-danger-200 px-3 py-2.5 text-sm font-bold text-danger-600 transition hover:bg-danger-50 dark:border-danger-500/30 dark:hover:bg-danger-500/10">
              <Trash2 size={15} /> {t("cat.archive", "شيل التصنيف…")}
            </button>
          </div>
        )}
      </Modal>

      {/* «شيل»: ورقةٌ تقول ماذا يصير — لا window.confirm */}
      <Modal open={!!archiving} onClose={() => setArchiving(null)} title={t("cat.archiveTitle", "تشيل «{{name}}»؟", { name: archiving?.name ?? "" })}>
        {archiving && (
          <div className="space-y-4" data-catarchivesheet>
            <p className="text-sm leading-relaxed text-ink">{t("cat.archiveBody", "تنشال من المتجر وتقدر ترجعها من المحذوفة — المواد تبقى بمكانها")}</p>
            <div className="flex gap-2">
              <Button variant="danger" className="flex-1" loading={busy} data-catarchiveok
                onClick={async () => { if (await run([{ op: "archive", id: archiving.id }], t("cat.archived", "انشال — تلكاه بالمحذوفة"))) setArchiving(null); }}>
                {t("cat.archiveOk", "شيل")}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => setArchiving(null)}>{t("cat.archiveNo", "لا، خلّيه")}</Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
