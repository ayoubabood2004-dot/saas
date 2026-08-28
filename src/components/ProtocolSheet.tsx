import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { X, ChevronLeft, AlertTriangle, ShieldAlert, Trash2, Check, Plus, Pencil } from "lucide-react";
import type { Pet, TreatmentEntry } from "@/types";
import {
  protocolsFor, allProtocols, fitsSpecies, buildDraft, draftAlerts, draftSummary,
  isCustom, readStored, deleteStored,
  type Protocol, type StoredProtocol,
} from "@/lib/protocols";
import { ProtocolEditor } from "@/components/ProtocolEditor";
import { TASK_META, routeShort } from "@/lib/flowsheet";
import { formatNum, cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";

/* ============================================================================
 * ProtocolSheet — اختيار بروتوكولٍ جاهز، ثم **مراجعته سطراً سطراً** قبل كتابته.
 *
 * ── لماذا خطوتان لا واحدة ────────────────────────────────────────────────
 * زرٌّ واحد يكتب تسعة أوامر دفعةً واحدة يوفّر دقائق، ويخلق خطراً: أوامرُ لم
 * يقرأها أحد تدخل ورقة العلاج باسم الطبيب. فالبروتوكول هنا **مسوّدة**:
 * تُعرَض كاملةً بأسمائها وجرعاتها وأوقاتها، ويُحذف منها ما لا يناسب هذا
 * الحيوان، ولا تُكتب إلا بضغطةٍ ثانية واعية.
 *
 * وهذا ليس احتياطاً زائداً: البروتوكول قالبٌ لحالةٍ نمطية، والحيوان الذي
 * أمامك ليس نمطياً — له وزنه وكليتاه وما يتناوله أصلاً.
 * ==========================================================================*/

export function ProtocolSheet({ pet, petName, todayISO, onClose, onApply }: {
  pet: Pet | undefined;
  petName: string;
  todayISO: string;
  onClose: () => void;
  /** البروتوكول المختار يُسلَّم مع صفوفه — ليلتقط المُطبِّق لقطةَ هويّته
   *  (اسم/استطباب/تحذير) في علامة ⟦P⟧ فتعرف الطبلة أيَّ بروتوكولٍ يمشي عليها. */
  onApply: (rows: Omit<TreatmentEntry, "id" | "created_at">[], proto: Protocol) => void;
}) {
  const { t } = useTranslation();
  const [chosen, setChosen] = useState<Protocol | null>(null);
  /** ما حُذف من المسوّدة — بالمفتاح، فالإعادة ممكنة بلا إعادة بناء. */
  const [dropped, setDropped] = useState<Set<string>>(new Set());
  /** المحرِّر: `null` مغلق · `{}` بروتوكولٌ جديد · بروتوكولٌ مخزَّن للتعديل. */
  const [editing, setEditing] = useState<StoredProtocol | "new" | null>(null);
  /** يُبدَّل بعد كل حفظٍ أو حذف حتى تُقرأ القائمة من الإعدادات من جديد. */
  const [rev, setRev] = useState(0);

  /**
   * القائمة **لا تُخفي شيئاً** — تُرتِّب فقط.
   *
   * كانت تُرشَّح بالنوع ترشيحاً قاطعاً، فمريضٌ ليس كلباً ولا قطاً يفتح شاشةً
   * فارغة تماماً؛ والأسوأ أن بروتوكولاً يبنيه الطبيب لطائرٍ كان يُحفَظ بنوعٍ
   * لا يطابقه فيختفي فور حفظه — «سوّيت إضافة وما لقيت البروتوكول».
   *
   * فصار ما يخصّ النوع أولاً، وما عداه أسفلَه تحت عنوانه: يُرى ويُستعمَل
   * بقرار الطبيب. الترشيح الصامت يُخفي عملَ صاحبه، والترتيب يكفي.
   */
  const fit = useMemo(() => protocolsFor(pet?.species), [pet?.species, rev]);
  const others = useMemo(
    () => allProtocols().filter((p) => !fitsSpecies(p, pet?.species)),
    [pet?.species, rev],
  );
  const list = fit;
  const draft = useMemo(
    () => (chosen ? buildDraft(chosen, pet, todayISO) : []),
    [chosen, pet, todayISO],
  );
  const kept = useMemo(() => draft.filter((d) => !dropped.has(d.stepKey)), [draft, dropped]);
  const alerts = useMemo(() => draftAlerts(kept, pet), [kept, pet]);
  const sum = useMemo(() => draftSummary(kept), [kept]);

  /**
   * تُعرَض **بنوداً** لا صفوفاً: بروتوكولٌ من ثلاثة أيام يولّد خمسين صفّاً،
   * وسردُها يصنع قائمةً لا تُقرأ ولا تُراجَع — وهي المراجعة كلُّ غرض الشاشة.
   * فالبند سطرٌ واحد يحمل اسمه وجرعته وأوقاته وعدد أيامه.
   */
  const steps = useMemo(() => {
    const m = new Map<string, { head: typeof kept[number]; times: string[]; days: Set<string> }>();
    for (const d of kept) {
      const g = m.get(d.stepKey);
      if (g) { if (!g.times.includes(d.time)) g.times.push(d.time); g.days.add(d.day); }
      else m.set(d.stepKey, { head: d, times: [d.time], days: new Set([d.day]) });
    }
    return [...m.values()].map((g) => ({ ...g, times: g.times.sort() }));
  }, [kept]);

  const blocking = alerts.some((a) => a.blocking);

  const apply = () => {
    if (!kept.length || !chosen) return;
    playSuccess();
    onApply(kept.map((d) => ({
      pet_id: "", visit_id: null, day: d.day, time: d.time,
      medication: d.medication, amount: d.amount,
      task_type: d.task_type, route: d.route,
      observations: d.observations, administered_at: null, administered_by: null,
    } as unknown as Omit<TreatmentEntry, "id" | "created_at">)), chosen);
  };

  return (
    <div className="fixed inset-0 z-50 grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div data-protosheet onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-1 shadow-raised sm:max-w-2xl sm:rounded-3xl">

        {/* ── الرأس ─────────────────────────────────────────────────────── */}
        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
          {chosen && (
            <button type="button" data-protoback onClick={() => { playTap(); setChosen(null); setDropped(new Set()); }}
              className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2">
              <ChevronLeft size={20} className="rtl:rotate-180" />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-extrabold text-ink">
              {chosen ? chosen.name() : t("proto.title", "بروتوكول جاهز")}
            </div>
            <div className="truncate text-2xs text-ink-muted">{petName}</div>
          </div>
          <button type="button" data-protoclose onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2">
            <X size={20} />
          </button>
        </div>

        {/* ── ١) اختيار البروتوكول ──────────────────────────────────────── */}
        {!chosen && (
          <div className="min-h-0 flex-1 overflow-y-auto p-3">
            {/* بناء بروتوكول العيادة — أوّل الصفّ: الطبيب يبني ما يشبه عمله */}
            <button type="button" data-protonew onClick={() => { playTap(); setEditing("new"); }}
              className="mb-2 flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-brand-300 bg-brand-50/50 p-3 text-2xs font-extrabold text-brand-700 transition hover:bg-brand-50 dark:bg-brand-500/10 dark:text-brand-300"
              style={{ minHeight: 52 }}>
              <Plus size={16} /> {t("proto.new", "بروتوكول جديد")}
            </button>

            {!fit.length && (
              <p data-protononefit className="mb-2 rounded-2xl bg-surface-2 px-3 py-2.5 text-center text-2xs font-bold text-ink-muted">
                {t("proto.noneForSpecies", "ما في بروتوكول مخصّص لنوع هذا المريض — ابنِ واحداً، أو استعمل من الأسفل.")}
              </p>
            )}

            <div className="grid gap-2">
              {list.map((p) => {
                const mine = isCustom(p);
                return (
                  <div key={p.id} className="flex items-stretch gap-1">
                    <button type="button" data-protopick={p.id}
                      onClick={() => { playTap(); setChosen(p); setDropped(new Set()); }}
                      className="min-w-0 flex-1 rounded-2xl border border-line bg-surface-1 p-3 text-start transition hover:border-brand-300 hover:bg-surface-2"
                      style={{ minHeight: 56 }}>
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-sm font-extrabold text-ink">{p.name()}</span>
                        {mine && (
                          <span className="shrink-0 rounded-full bg-brand-100 px-1.5 text-[10px] font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                            {t("proto.mine", "عيادتي")}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 text-2xs leading-snug text-ink-muted">{p.indication()}</div>
                      <div className="mt-1 text-[10px] font-bold text-ink-subtle">
                        {t("proto.nDays", { n: formatNum(p.days), defaultValue: "{{n}} أيام" })}
                        {" · "}
                        {t("proto.nSteps", { n: formatNum(p.steps.length), defaultValue: "{{n}} بنداً" })}
                      </div>
                    </button>

                    {/* المدمجة لا تُعدَّل ولا تُحذف — هي مرجعٌ مشترك بين العيادات */}
                    {mine && (
                      <div className="flex shrink-0 flex-col gap-1">
                        <button type="button" data-protoedit={p.id}
                          onClick={() => { playTap(); setEditing(readStored().find((s) => s.id === p.id) ?? "new"); }}
                          className="grid flex-1 w-11 place-items-center rounded-xl border border-line text-ink-muted transition hover:border-brand-300 hover:text-brand-600">
                          <Pencil size={15} />
                        </button>
                        <button type="button" data-protodelete={p.id}
                          onClick={() => { playTap(); deleteStored(p.id); setRev((r) => r + 1); }}
                          className="grid flex-1 w-11 place-items-center rounded-xl border border-line text-ink-subtle transition hover:border-danger-300 hover:text-danger-600">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* أنواعٌ أخرى — تُعرَض ولا تُخفى: ما بناه الطبيب لا يختفي أبداً،
                ويبقى القرارُ قرارَه إن شاء أن يستعمله على هذا المريض. */}
            {others.length > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center gap-2 text-[10px] font-black text-ink-subtle">
                  <span className="h-px flex-1 bg-line" />
                  {t("proto.otherSpecies", "لأنواع أخرى")}
                  <span className="h-px flex-1 bg-line" />
                </div>
                <div className="grid gap-2">
                  {others.map((p) => (
                    <div key={p.id} className="flex items-stretch gap-1 opacity-70">
                      <button type="button" data-protopick={p.id} data-protoother
                        onClick={() => { playTap(); setChosen(p); setDropped(new Set()); }}
                        className="min-w-0 flex-1 rounded-2xl border border-dashed border-line bg-surface-1 p-3 text-start transition hover:border-brand-300 hover:opacity-100"
                        style={{ minHeight: 56 }}>
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-sm font-extrabold text-ink">{p.name()}</span>
                          {isCustom(p) && (
                            <span className="shrink-0 rounded-full bg-brand-100 px-1.5 text-[10px] font-black text-brand-700 dark:bg-brand-500/20 dark:text-brand-300">
                              {t("proto.mine", "عيادتي")}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 text-2xs leading-snug text-ink-muted">{p.indication()}</div>
                      </button>
                      {isCustom(p) && (
                        <div className="flex shrink-0 flex-col gap-1">
                          <button type="button" data-protoedit={p.id}
                            onClick={() => { playTap(); setEditing(readStored().find((s) => s.id === p.id) ?? "new"); }}
                            className="grid w-11 flex-1 place-items-center rounded-xl border border-line text-ink-muted transition hover:border-brand-300 hover:text-brand-600">
                            <Pencil size={15} />
                          </button>
                          <button type="button" data-protodelete={p.id}
                            onClick={() => { playTap(); deleteStored(p.id); setRev((r) => r + 1); }}
                            className="grid w-11 flex-1 place-items-center rounded-xl border border-line text-ink-subtle transition hover:border-danger-300 hover:text-danger-600">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ٢) مراجعة المسوّدة ────────────────────────────────────────── */}
        {chosen && (
          <>
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              {chosen.caution && (
                <div data-protocaution className="mb-2 flex items-start gap-2 rounded-2xl border border-warn-300 bg-warn-50 p-2.5 text-2xs font-semibold leading-snug text-warn-800 dark:border-warn-500/40 dark:bg-warn-500/10 dark:text-warn-200">
                  <AlertTriangle size={15} className="mt-px shrink-0" />
                  <span>{chosen.caution()}</span>
                </div>
              )}

              {alerts.map((a) => (
                <div key={a.id} data-protoalert
                  className="mb-2 flex items-start gap-2 rounded-2xl border border-danger-300 bg-danger-50 p-2.5 text-2xs font-bold leading-snug text-danger-800 dark:border-danger-500/40 dark:bg-danger-500/10 dark:text-danger-200">
                  <ShieldAlert size={15} className="mt-px shrink-0" />
                  <span>{a.title}{a.detail ? ` — ${a.detail}` : ""}</span>
                </div>
              ))}

              {!draft.length && (
                <p className="p-6 text-center text-2xs text-ink-muted">
                  {t("proto.empty", "ما في بندٌ من هذا البروتوكول يصلح لهذا الحيوان.")}
                </p>
              )}

              {/* بنود البروتوكول — كلٌّ منها يُحذف بضغطة، بكل أيامه وأوقاته */}
              <div className="grid gap-1.5">
                {steps.map(({ head, times, days }) => {
                  const tm = TASK_META[head.task_type];
                  return (
                    <div key={head.stepKey} data-protorow
                      className="flex items-center gap-2 rounded-xl border border-line bg-surface-1 p-2">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-black text-ink-muted"
                        aria-label={tm.ar()}>{tm.glyph}</span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-extrabold text-ink">{head.medication}</div>
                        <div className="flex flex-wrap items-center gap-x-1.5 text-[10px] text-ink-muted">
                          {head.amount && <span className="font-bold">{head.amount}</span>}
                          {head.route && <span className="rounded bg-surface-2 px-1 font-bold">{routeShort(head.route)}</span>}
                          <span className="tabular-nums" dir="ltr">{times.join(" · ")}</span>
                          {days.size > 1 && (
                            <span className="font-bold text-ink-subtle">{t("proto.xDays", { n: formatNum(days.size), defaultValue: "× {{n}} أيام" })}</span>
                          )}
                        </div>
                      </div>
                      <button type="button" data-protodrop={head.stepKey}
                        onClick={() => { playTap(); setDropped((s) => new Set(s).add(head.stepKey)); }}
                        title={t("proto.drop", "احذف هذا البند")}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ── التذييل: الحصيلة ثم الكتابة ───────────────────────────── */}
            <div className="shrink-0 border-t border-line p-3">
              <div data-protosummary className="mb-2 text-center text-2xs font-bold text-ink-muted">
                {t("proto.summary", { o: formatNum(sum.orders), d: formatNum(sum.drugs), y: formatNum(sum.days), defaultValue: "{{o}} أمراً · {{d}} أدوية · {{y}} أيام" })}
              </div>
              <button type="button" data-protoapply disabled={!kept.length || blocking}
                onClick={apply}
                className={cn("btn w-full", blocking ? "btn-ghost" : "btn-primary", "disabled:opacity-50")}
                style={{ minHeight: 52 }}>
                <Check size={17} />
                {blocking
                  ? t("proto.blocked", "امنع — فيه حساسية مسجّلة")
                  : t("proto.apply", { n: formatNum(kept.length), defaultValue: "اكتب {{n}} أمراً" })}
              </button>
            </div>
          </>
        )}
      </div>

      {editing && (
        <ProtocolEditor
          initial={editing === "new" ? undefined : editing}
          petSpecies={pet?.species}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); setRev((r) => r + 1); }}
        />
      )}
    </div>
  );
}
