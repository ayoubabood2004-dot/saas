/* ============================================================================
 * حذفُ الحيوان و«الحيوانات المحذوفة» (0290) — بسجلّ المرضى.
 *
 * كان زرُّ الحذف لكلّ الكادر، وتأكيدُه «متأكّد؟» بلا ذكرِ ما يُمحى، والحذفُ نهائيّاً يأخذ زياراتِ الحيوان ولقاحاتِه وطبلتَه
 * ومرفقاتِه معه. الآن:
 *  • النافذةُ تسأل الخادمَ ما سيُرفع (pet_delete_preview) وتقوله جدولاً جدولاً بالعدد — والجرعاتِ المعطاةَ التي لم تُبَع
 *    (تختفي من البيع حتى يرجع)، والإقامةَ الجارية — ولا زرَّ حذفٍ قبل أن تصل المعاينة.
 *  • الحذفُ لمن يحكم له الخادم (`allowed`)؛ والشاشةُ تُخفي الزرَّ لغيره أصلاً، والحكمُ الأخير للخادم.
 *  • «الحيوانات المحذوفة» تُرجع الحيوانَ بكلّ ما رُفع بنفس المعرّفات. وقائمةٌ فشل جلبُها تقول «أعد المحاولة» لا «ماكو».
 * النصوصُ بنطاق ptr المملوك (hot-paths.json): القطعةُ كسولةٌ من سجلّ المرضى بـpage(…, ["ptr"]).
 * ========================================================================= */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, ArchiveRestore, Loader2, RotateCcw, Trash2 } from "lucide-react";
import type { DeletedPet, Pet, PetDeletePreview } from "@/types";
import { repo } from "@/lib/repo";
import { listPetTrash, petDeletePreview, petTrashMissing, restorePet } from "@/lib/petTrashApi";
import { describeDbError } from "@/lib/errors";
import { useSubscription } from "@/lib/subscription";
import { formatDate } from "@/lib/utils";
import { playSuccess, playTap } from "@/lib/sounds";
import { Button, Dialog, useToast } from "@/components/ui";

/** ترتيبُ العرض: الأثقلُ أوّلاً (ما يقرأ الطبيبُ قبل أن يضغط). */
const ORDER = [
  "clinic_visits", "medical_visits", "treatment_entries", "vaccinations", "admissions", "media_items", "lab_results",
  "surgeries", "pet_prescriptions", "pet_case_reports", "pet_notes", "pet_problems", "care_entries", "weight_logs",
  "appointments", "reminders", "journeys", "journey_events",
];
const rank = (k: string) => { const i = ORDER.indexOf(k); return i < 0 ? ORDER.length : i; };
const lines = (counts: Record<string, number>) =>
  Object.entries(counts).filter(([, n]) => n > 0).sort(([a], [b]) => rank(a) - rank(b) || a.localeCompare(b));

type Load = { s: "loading" } | { s: "ready"; p: PetDeletePreview } | { s: "missing" } | { s: "failed"; msg: string };

/** نافذةُ الحذف: تسمّي ما يُرفع بالعدد، وتحذف بسببٍ اختياريّ. */
export function PetDeleteDialog({ pet, onClose, onDeleted }: { pet: Pet; onClose: () => void; onDeleted: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [load, setLoad] = useState<Load>({ s: "loading" });
  const [tick, setTick] = useState(0);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoad({ s: "loading" });
    petDeletePreview(pet.id).then(
      (p) => { if (alive) setLoad({ s: "ready", p }); },
      (e) => { if (alive) setLoad(petTrashMissing(e) ? { s: "missing" } : { s: "failed", msg: describeDbError(e, t) }); },
    );
    return () => { alive = false; };
  }, [pet.id, tick, t]);

  const name = (load.s === "ready" ? load.p.name : null) ?? pet.name;
  const owner = (load.s === "ready" ? load.p.owner_name : null) ?? pet.owner_name ?? "";
  const canDelete = load.s === "ready" && load.p.allowed && !busy;

  const confirm = async () => {
    if (!canDelete) return;
    setBusy(true);
    try {
      await repo.deletePet(pet.id, reason.trim() || null);
      playSuccess();
      toast.success(t("ptr.deleted", { name, defaultValue: "{{name}} moved to Deleted pets" }));
      onDeleted(pet.id);
    } catch (e) {
      toast.error(t("ptr.deleteFailed", "Couldn't delete."), describeDbError(e, t));
      setBusy(false);
    }
  };

  return (
    <Dialog
      open
      onClose={() => { if (!busy) onClose(); }}
      title={t("ptr.title", { name, defaultValue: "Delete {{name}}?" })}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>{t("common.cancel", "Cancel")}</Button>
          <Button variant="danger" onClick={confirm} loading={busy} disabled={!canDelete} leftIcon={<Trash2 size={16} />} data-pettrash-confirm="">
            {t("ptr.confirm", { name, defaultValue: "Delete {{name}}" })}
          </Button>
        </>
      }
    >
      <div className="space-y-3 text-sm" data-pettrash-dialog="">
        {owner && <p className="text-ink-muted">{t("ptr.owner", { owner, defaultValue: "Owner: {{owner}}" })}</p>}

        {load.s === "loading" && (
          <p className="flex items-center gap-2 text-ink-subtle"><Loader2 size={15} className="animate-spin" /> {t("ptr.counting", "Counting what will be removed…")}</p>
        )}
        {load.s === "missing" && <p className="text-warn-700 dark:text-warn-300" data-pettrash-missing="">{t("ptr.needsUpdate", "Deleting needs a database update first — ask support.")}</p>}
        {load.s === "failed" && (
          <div className="space-y-2">
            <p className="text-danger-600 dark:text-danger-300">{t("ptr.countFailed", "Couldn't count what will be removed.")} {load.msg}</p>
            <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "Retry")}</Button>
          </div>
        )}

        {load.s === "ready" && (
          <>
            {!load.p.allowed && (
              <p className="rounded-xl bg-danger-50 px-3 py-2 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300" data-pettrash-forbidden="">
                {t("ptr.notAllowed", "Deleting pets is for the manager, or staff given «Delete pets».")}
              </p>
            )}
            {lines(load.p.counts).length > 0 ? (
              <div>
                <p className="mb-1.5 font-semibold text-ink">{t("ptr.willRemove", "This removes the pet and everything recorded for it:")}</p>
                <ul className="divide-y divide-line/60 rounded-xl border border-line" data-pettrash-lines="">
                  {lines(load.p.counts).map(([k, n]) => (
                    <li key={k} className="flex items-center justify-between gap-3 px-3 py-1.5" data-pettrash-line={k}>
                      <span className="text-ink">{t(`ptr.t.${k}`, k)}</span>
                      <span className="font-semibold tabular-nums text-ink">{n.toLocaleString(i18n.language)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-ink">{t("ptr.onlyFile", "Nothing else is recorded for this pet — only its file is removed.")}</p>
            )}
            {load.p.active_admission && (
              <p className="flex items-start gap-2 text-warn-700 dark:text-warn-300"><AlertTriangle size={15} className="mt-0.5 shrink-0" /> {t("ptr.admitted", "It's admitted now — its stay leaves the boarding board.")}</p>
            )}
            {load.p.pending_charges > 0 && (
              <p className="flex items-start gap-2 text-warn-700 dark:text-warn-300" data-pettrash-pending="">
                <AlertTriangle size={15} className="mt-0.5 shrink-0" />
                {t("ptr.pending", { n: load.p.pending_charges, defaultValue: "Unbilled given doses ({{n}}) leave the sale screen until it's restored." })}
              </p>
            )}
            <p className="text-ink-muted">{t("ptr.keeps", "Invoices and payments are not touched, and attached files stay stored.")}</p>
            <p className="text-ink-muted">{t("ptr.restorable", "Everything comes back exactly as it was from «Deleted pets».")}</p>
            {load.p.allowed && (
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-ink-muted">{t("ptr.reason", "Reason (optional)")}</span>
                <input className="input" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder={t("ptr.reasonPh", "e.g. registered twice")} />
              </label>
            )}
          </>
        )}
      </div>
    </Dialog>
  );
}

type TrashLoad = { s: "loading" } | { s: "ready"; rows: DeletedPet[] } | { s: "missing" } | { s: "failed"; msg: string };

/** زرُّ «الحيوانات المحذوفة» ونافذتُها: القائمةُ بمن حذف ومتى ولماذا، و«رجّعه» بكلّ ما رُفع. */
export function PetTrashEntry({ onRestored }: { onRestored: (id: string) => void }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [load, setLoad] = useState<TrashLoad>({ s: "loading" });
  const [tick, setTick] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  // الاسترجاعُ لا يمرّ من وكيل repo (بوّابةُ القراءة فقط) — فاشتراكٌ منتهٍ يُقفل الزرَّ هنا كأرشيف الأدوية.
  const readOnly = useSubscription().access === "readonly";

  useEffect(() => {
    if (!open) return;
    let alive = true;
    setLoad({ s: "loading" });
    listPetTrash().then(
      (rows) => { if (alive) setLoad({ s: "ready", rows }); },
      (e) => { if (alive) setLoad(petTrashMissing(e) ? { s: "missing" } : { s: "failed", msg: describeDbError(e, t) }); },
    );
    return () => { alive = false; };
  }, [open, tick, t]);

  const restore = async (row: DeletedPet) => {
    if (busyId || readOnly) return;
    setBusyId(row.id);
    try {
      await restorePet(row.id);
      playSuccess();
      toast.success(t("ptr.restored", { name: row.pet_name ?? "", defaultValue: "{{name}} is back with all its records" }));
      setLoad((l) => (l.s === "ready" ? { s: "ready", rows: l.rows.filter((r) => r.id !== row.id) } : l));
      onRestored(row.id);
    } catch (e) {
      toast.error(t("ptr.restoreFailed", "Couldn't restore."), describeDbError(e, t));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => { playTap(); setOpen(true); }}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-muted transition hover:text-brand-600 dark:hover:text-brand-300"
        data-pettrash-open=""
      >
        <ArchiveRestore size={14} /> {t("ptr.open", "Deleted pets")}
      </button>
      <Dialog open={open} onClose={() => { if (!busyId) setOpen(false); }} title={t("ptr.open", "Deleted pets")} size="lg"
        footer={<Button variant="ghost" onClick={() => setOpen(false)} disabled={!!busyId}>{t("common.close", "Close")}</Button>}>
        <div className="space-y-3 text-sm" data-pettrash-list="">
          <p className="text-ink-muted">{t("ptr.listHint", "Restoring brings the pet back with its visits, vaccines, treatment and files — the same records.")}</p>
          {load.s === "loading" && <p className="flex items-center gap-2 text-ink-subtle"><Loader2 size={15} className="animate-spin" /> {t("ptr.listLoading", "Loading…")}</p>}
          {load.s === "missing" && <p className="text-warn-700 dark:text-warn-300">{t("ptr.needsUpdate", "Deleting needs a database update first — ask support.")}</p>}
          {load.s === "failed" && (
            <div className="space-y-2">
              <p className="text-danger-600 dark:text-danger-300">{t("ptr.listFailed", "Couldn't load deleted pets.")} {load.msg}</p>
              <Button size="sm" variant="secondary" leftIcon={<RotateCcw size={14} />} onClick={() => { playTap(); setTick((n) => n + 1); }}>{t("common.retry", "Retry")}</Button>
            </div>
          )}
          {load.s === "ready" && load.rows.length === 0 && <p className="text-ink-subtle">{t("ptr.empty", "No deleted pets.")}</p>}
          {load.s === "ready" && load.rows.length > 0 && (
            <ul className="divide-y divide-line rounded-2xl border border-line">
              {load.rows.map((r) => {
                const total = Object.values(r.counts).reduce((a, n) => a + n, 0);
                return (
                  <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5" data-pettrash-row={r.id}>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-ink">{r.pet_name || "—"}{r.owner_name ? <span className="font-normal text-ink-muted"> · {r.owner_name}</span> : null}</p>
                      <p className="text-2xs text-ink-subtle">
                        {t("ptr.deletedAt", { date: formatDate(r.deleted_at, i18n.language), defaultValue: "Deleted {{date}}" })}
                        {" · "}
                        {r.deleted_by_name ? t("ptr.by", { name: r.deleted_by_name, defaultValue: "by {{name}}" }) : t("ptr.byManager", "by the clinic manager")}
                        {" · "}
                        {t("ptr.records", { n: total, defaultValue: "Records: {{n}}" })}
                      </p>
                      {r.reason && <p className="text-2xs text-ink-muted">{t("ptr.reasonLine", { reason: r.reason, defaultValue: "Reason: {{reason}}" })}</p>}
                    </div>
                    <Button size="sm" variant="secondary" leftIcon={<ArchiveRestore size={14} />} loading={busyId === r.id} disabled={readOnly || (!!busyId && busyId !== r.id)}
                      onClick={() => { playTap(); void restore(r); }} data-pettrash-restore={r.id}>
                      {t("ptr.restore", "Restore")}
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </Dialog>
    </>
  );
}
