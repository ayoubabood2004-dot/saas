/* ============================================================================
 * قلمُ «حالة اللقاحات» (المدير): تعديلُ اللقاح أو حذفُه من ملفّ الحيوان (طلبُ المالك ٣/١١).
 *
 * سطرُ البطاقة لقاحٌ بكلّ جرعاته (يُجمع بالاسم مطويّاً كما تجمعه البطاقة)، فالنافذةُ تفتح اللقاحَ كلَّه:
 *  • الاسمُ يتغيّر بكلّ جرعاته معاً — اسمٌ مكتوبٌ غلط يُصحَّح مرّةً لا جرعةً جرعة.
 *  • كلُّ جرعةٍ تُعدَّل بحالتها: المعطاةُ تاريخُ إعطائها (يومٌ محلّيّ، لا بالمستقبل) وتشغيلتُها وملاحظتُها،
 *    والمجدولةُ موعدُها — والحالةُ تتبع الموعد (statusForDue، كـ«غيّر الموعد»: فات ⇒ متأخرة، قادم ⇒ مجدولة).
 *  • الحذفُ جرعةً أو اللقاحَ كلَّه — **بتأكيدٍ داخل النافذة يقول ماذا يُحذف** (لا window.confirm يُقبل بلا قراءة، 0145).
 *
 * والكتابةُ بشرط أنها كما فُتحت (vaxEditApi): جرعةٌ أعطاها طبيبٌ من جهازٍ ثانٍ والنافذةُ مفتوحة لا يرجع قلمُ المدير
 * يكتبها مجدولة — يُقال «تغيّرت» ويُعاد التحميل. والحذفُ للمدير بالقاعدة (0257)، لا بإخفاء الزرّ وحده.
 *
 * النصوصُ بنطاق vxed المملوك (hot-paths.json): القطعةُ كسولةٌ من ملفّ الحيوان بـpage(…, ["vxed"]).
 * ========================================================================= */
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pencil, Trash2, AlertTriangle, Check } from "lucide-react";
import type { Vaccination } from "@/types";
import { Button, Dialog, useToast } from "@/components/ui";
import { cn, formatDate, localISO } from "@/lib/utils";
import { describeDbError } from "@/lib/errors";
import { validDue } from "@/lib/vaccineDue";
import { playSuccess, playTap, playWarning } from "@/lib/sounds";
import { vaxEditApi } from "@/lib/vaxEditApi";
import { draftOf, dosePatch, groupVaccines, sameDraft, validGiven, type VaxDraft } from "@/lib/vaxEdit";

const ST_KEY = { administered: "vxed.st.administered", scheduled: "vxed.st.scheduled", overdue: "vxed.st.overdue" } as const;

type Confirm = { kind: "dose"; id: string } | { kind: "all" } | null;

export function VaccineEditSheet({ vaccines, initialKey, petName, onClose, onSaved }: {
  /** كلُّ لقاحات الحيوان. */
  vaccines: Vaccination[];
  /** اللقاحُ المفتوح (مفتاحُه)، أو "" = أوّلُ لقاح. */
  initialKey: string;
  petName?: string;
  onClose: () => void;
  /** أيُّ كتابةٍ حصلت أو تبيّن أن الصفَّ تغيّر: الأبُ يعيد التحميل. */
  onSaved: () => void;
}) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const today = localISO();
  const groups = useMemo(() => groupVaccines(vaccines), [vaccines]);
  /* اللقاحُ المفتوح بمعرّفات جرعاته لا باسمه: تغييرُ الاسم يغيّر مفتاحَ التجميع، وجرعاتُه هي هي — فالنافذةُ تبقى عليه
     بعد إعادة التحميل، لا تقفز للقاحٍ آخر. */
  const [sel, setSel] = useState<string[]>(() => ((initialKey && groups.find((g) => g.key === initialKey)) || groups[0])?.doses.map((v) => v.id) ?? []);
  const group = groups.find((g) => g.doses.some((v) => sel.includes(v.id))) ?? null;
  const [name, setName] = useState(group?.name ?? "");
  /** لكلّ جرعة: ما كانت عليه بالقاعدة لحظةَ فتحها (base) وما بالحقول (cur). */
  const [drafts, setDrafts] = useState<Record<string, { base: VaxDraft; cur: VaxDraft }>>({});
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [busy, setBusy] = useState<string | null>(null);

  // لقاحٌ انحذف كلُّه: إلى الأوّل الباقي، أو تُغلق إن ما بقي شيء.
  useEffect(() => {
    if (group) return;
    if (groups.length === 0) { onClose(); return; }
    setSel(groups[0].doses.map((v) => v.id));
  }, [group, groups, onClose]);
  // نسخةٌ جديدة من القاعدة: جرعةٌ لم تتغيّر هناك تبقى بما كُتب فيها (حفظُ جرعةٍ لا يمسح المكتوب بأختها)،
  // وما تغيّر هناك يُعاد من القاعدة — لا يُرسَل فوقه ما كُتب على نسخةٍ قديمة.
  useEffect(() => {
    setDrafts((prev) => Object.fromEntries((group?.doses ?? []).map((v) => {
      const base = draftOf(v);
      const p = prev[v.id];
      return [v.id, p && sameDraft(p.base, base) ? p : { base, cur: base }];
    })));
  }, [group]);
  useEffect(() => { setName(group?.name ?? ""); }, [group?.name]);
  useEffect(() => { setConfirm(null); }, [group?.key]);

  if (!group) return null;

  const fail = (e: unknown) => {
    playWarning();
    if ((e as { code?: string } | null)?.code === "no_row_updated") {
      toast.error(t("vxed.gone"));
      onSaved();
    } else {
      toast.error(describeDbError(e, t));
    }
  };
  const run = async (tag: string, fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(tag);
    try { await fn(); } catch (e) { fail(e); } finally { setBusy(null); }
  };

  const ids = group.doses.map((v) => v.id);
  const nameClean = name.trim();
  const nameOk = nameClean.length > 0 && nameClean.length <= 80;
  const nameChanged = nameClean !== group.name;
  const saveName = () => run("name", async () => {
    const n = await vaxEditApi.edit(ids, { name: nameClean }, {});
    playSuccess();
    toast.success(n < ids.length
      ? t("vxed.partial", { n, m: ids.length })
      : t("vxed.nameSaved", { name: nameClean }));
    onSaved();
  });

  const doseLabel = (v: Vaccination) => (v.dose_number ? t("vxed.dose", { n: v.dose_number }) : t("vxed.doseNoNum"));
  const whenText = (v: Vaccination) => {
    const d = draftOf(v).date;
    if (!d) return t("vxed.whenNone");
    return v.status === "administered"
      ? t("vxed.whenGiven", { date: formatDate(d, i18n.language) })
      : t("vxed.whenDue", { date: formatDate(d, i18n.language) });
  };

  const removeAll = () => run("all", async () => {
    // الجرعاتُ بمعرّفاتها كما رآها المدير — لا بالاسم: البطاقةُ تجمع «rabies » مع «Rabies»، وشرطُ اسمٍ واحد كان يُبقي أختَها.
    const n = await vaxEditApi.remove(ids, {});
    playSuccess();
    toast.success(n < ids.length ? t("vxed.partial", { n, m: ids.length }) : t("vxed.allDeleted", { name: group.name }));
    onSaved();
  });

  return (
    <Dialog open onClose={onClose} size="md"
      title={t("vxed.title")}
      description={petName ? `${petName} · ${t("vxed.managerOnly")}` : t("vxed.managerOnly")}
      footer={<Button variant="ghost" onClick={onClose}>{t("common.close")}</Button>}>
      <div className="space-y-4" data-vxed>
        {groups.length > 1 && (
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t("vxed.pick")}>
            {groups.map((g) => (
              <button key={g.key} type="button" role="tab" aria-selected={g.key === group.key}
                onClick={() => { playTap(); setSel(g.doses.map((v) => v.id)); }}
                className={cn("max-w-[14rem] truncate rounded-full border px-3 py-1 text-xs font-bold transition",
                  g.key === group.key ? "border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300"
                    : "border-line bg-surface-2 text-ink-muted hover:text-ink")}>
                {g.name}
              </button>
            ))}
          </div>
        )}

        {/* الاسم — بكلّ جرعاته */}
        <div className="space-y-1.5">
          <label className="text-xs font-bold text-ink-muted" htmlFor="vxed-name">{t("vxed.nameLabel")}</label>
          <div className="flex gap-2">
            <input id="vxed-name" data-vxed-name className="input min-w-0 flex-1" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            <Button size="sm" leftIcon={<Pencil size={14} />} disabled={!nameOk || !nameChanged || !!busy} loading={busy === "name"}
              onClick={() => void saveName()} data-vxed-savename>{t("vxed.saveName")}</Button>
          </div>
          <p className="text-2xs text-ink-subtle">{nameOk ? t("vxed.nameHint", { n: ids.length }) : t("vxed.badName")}</p>
        </div>

        {/* الجرعات */}
        <div className="space-y-2">
          {group.doses.map((v) => {
            const d = drafts[v.id]?.cur ?? draftOf(v);
            const given = v.status === "administered";
            const dateOk = given ? validGiven(d.date, today) : validDue(d.date, today);
            const patch = dateOk ? dosePatch(v, d, today) : {};
            const dirty = Object.keys(patch).length > 0;
            const set = (k: keyof VaxDraft, val: string) =>
              setDrafts((all) => ({ ...all, [v.id]: { base: all[v.id]?.base ?? draftOf(v), cur: { ...(all[v.id]?.cur ?? draftOf(v)), [k]: val } } }));
            const confirming = confirm?.kind === "dose" && confirm.id === v.id;
            return (
              <div key={v.id} data-vxed-dose={v.id} className="rounded-2xl border border-line p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="text-sm font-bold text-ink">{doseLabel(v)}</span>
                  <span className={cn("chip text-2xs font-bold",
                    given ? "bg-success-50 text-success-700 dark:bg-success-500/15 dark:text-success-300"
                      : v.status === "overdue" ? "bg-danger-50 text-danger-700 dark:bg-danger-500/15 dark:text-danger-300"
                        : "bg-orange-50 text-orange-700 dark:bg-orange-500/15 dark:text-orange-300")}>
                    {t(ST_KEY[v.status])}
                  </span>
                  <button type="button" data-vxed-del={v.id} title={t("vxed.deleteDose")} aria-label={t("vxed.deleteDose")}
                    onClick={() => { playTap(); setConfirm(confirming ? null : { kind: "dose", id: v.id }); }}
                    className="ms-auto grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600 dark:hover:bg-danger-500/15">
                    <Trash2 size={15} />
                  </button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="space-y-1">
                    <span className="text-2xs font-bold text-ink-muted">{given ? t("vxed.givenOn") : t("vxed.dueOn")}</span>
                    <input type="date" dir="ltr" value={d.date} max={given ? today : undefined} data-vxed-date={v.id}
                      onChange={(e) => set("date", e.target.value)}
                      className="input w-full [color-scheme:light] dark:[color-scheme:dark]" />
                  </label>
                  {given && (
                    <label className="space-y-1">
                      <span className="text-2xs font-bold text-ink-muted">{t("vxed.lot")}</span>
                      <input dir="ltr" value={d.lot} maxLength={60} onChange={(e) => set("lot", e.target.value)} className="input w-full" />
                    </label>
                  )}
                  <label className="space-y-1 sm:col-span-2">
                    <span className="text-2xs font-bold text-ink-muted">{t("vxed.notes")}</span>
                    <input value={d.notes} maxLength={300} onChange={(e) => set("notes", e.target.value)} className="input w-full" />
                  </label>
                </div>
                {!dateOk && d.date && (
                  <p className="mt-1.5 text-2xs font-bold text-danger-600 dark:text-danger-400">{given ? t("vxed.badGiven") : t("vxed.badDue")}</p>
                )}
                {confirming ? (
                  <div role="alert" className="mt-2 space-y-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 dark:border-danger-500/30 dark:bg-danger-500/10">
                    <p className="flex items-start gap-1.5 text-xs font-semibold text-danger-700 dark:text-danger-300">
                      <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                      {t("vxed.confirmDose", { dose: doseLabel(v), name: v.name, when: whenText(v) })}
                    </p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="danger" loading={busy === `del:${v.id}`} disabled={!!busy} data-vxed-confirm={v.id}
                        onClick={() => void run(`del:${v.id}`, async () => {
                          await vaxEditApi.remove([v.id], { status: v.status, name: v.name });
                          playSuccess(); toast.success(t("vxed.deleted")); onSaved();
                        })}>{t("vxed.deleteForever")}</Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>{t("vxed.keep")}</Button>
                    </div>
                  </div>
                ) : dirty && (
                  <div className="mt-2 flex justify-end">
                    <Button size="sm" leftIcon={<Check size={14} />} loading={busy === `save:${v.id}`} disabled={!!busy} data-vxed-save={v.id}
                      onClick={() => void run(`save:${v.id}`, async () => {
                        await vaxEditApi.edit([v.id], patch, { status: v.status, name: v.name });
                        playSuccess(); toast.success(t("vxed.saved")); onSaved();
                      })}>{t("vxed.save")}</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* حذفُ اللقاح كلِّه */}
        <div className="border-t border-line pt-3">
          {confirm?.kind === "all" ? (
            <div role="alert" className="space-y-2 rounded-xl border border-danger-200 bg-danger-50 p-2.5 dark:border-danger-500/30 dark:bg-danger-500/10">
              <p className="flex items-start gap-1.5 text-xs font-semibold text-danger-700 dark:text-danger-300">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                {petName
                  ? t("vxed.confirmAll", { name: group.name, n: ids.length, pet: petName })
                  : t("vxed.confirmAllNoPet", { name: group.name, n: ids.length })}
              </p>
              <div className="flex gap-2">
                <Button size="sm" variant="danger" loading={busy === "all"} disabled={!!busy} data-vxed-confirm-all
                  onClick={() => void removeAll()}>{t("vxed.deleteForever")}</Button>
                <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>{t("vxed.keep")}</Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" leftIcon={<Trash2 size={14} />} data-vxed-del-all
              className="text-danger-600 hover:bg-danger-50 dark:text-danger-400 dark:hover:bg-danger-500/15"
              onClick={() => { playTap(); setConfirm({ kind: "all" }); }}>
              {t("vxed.deleteAll", { n: ids.length })}
            </Button>
          )}
        </div>
      </div>
    </Dialog>
  );
}
