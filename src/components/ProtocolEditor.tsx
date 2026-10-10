import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X, Plus, Trash2, Check, Search } from "lucide-react";
import type { Species, TaskType } from "@/types";
import {
  saveStored, newProtocolId, TASK_LABEL_FALLBACK,
  type StoredProtocol, type StoredStep,
} from "@/lib/protocols";
import { DRUG_BY_ID, matchMonograph, type Monograph } from "@/lib/vetFormulary";
import { MedPicker } from "@/components/meds/MedPicker";
import { TASK_META } from "@/lib/flowsheet";
import { formatNum, cn } from "@/lib/utils";
import { playTap, playSuccess } from "@/lib/sounds";

/* ============================================================================
 * ProtocolEditor — العيادة تبني بروتوكولها بنفسها.
 *
 * ── ما يُكتب وما لا يُكتب ────────────────────────────────────────────────
 * الطبيب يختار **أي دواء** من الدليل، ولا يُسأل عن جرعته. الجرعة تبقى تُشتقّ
 * لحظةَ التطبيق من نافذة النوع ووزن الحيوان — تماماً كالبروتوكولات المدمجة.
 * وسؤاله عنها هنا كان سيجمّد رقماً بملفٍّ لا يُراجَع، ويخلق نسخةً ثانيةً من
 * الحقيقة تتخلّف عن الدليل بصمت.
 *
 * فما يبنيه الطبيب هو **التركيب**: أي أدوية، وأي رعاية، وكم مرّةً باليوم،
 * وكم يوماً. وهذا وحده ما يتكرّر بين حالةٍ وحالة.
 * ==========================================================================*/

/* كل ما يقبله النظام — لا الشائعَ وحده. النقصُ هنا يعني مريضاً لا يستطيع
 * الطبيب أن يبني له بروتوكولاً أصلاً، ولا أن يرى لماذا. */
const SPECIES: { id: Species; emoji: string }[] = [
  { id: "dog", emoji: "🐕" },
  { id: "cat", emoji: "🐈" },
  { id: "bird", emoji: "🐦" },
  { id: "rabbit", emoji: "🐇" },
  { id: "horse", emoji: "🐎" },
  { id: "cow", emoji: "🐄" },
  { id: "other", emoji: "🐾" },
];

const CARE_TYPES: Exclude<TaskType, "drug">[] = ["fluid", "vitals", "feed", "elim", "nurse", "lab"];

export function ProtocolEditor({ initial, petSpecies, onClose, onSaved }: {
  /** بروتوكولٌ يُحرَّر — أو `undefined` لبناء واحدٍ جديد. */
  initial?: StoredProtocol;
  /** نوع المريض المفتوح — البروتوكول الجديد يبدأ به. */
  petSpecies?: Species;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [indication, setIndication] = useState(initial?.indication ?? "");
  /* الافتراضي **نوع المريض الذي بين يديك** لا «كلب وقط» ثابتين: طبيبٌ يبني
   * بروتوكولاً وهو واقفٌ عند طائرٍ كان يحفظه لكلبٍ وقط، فيختفي من أمامه فور
   * حفظه — «سوّيت إضافة وما لقيت البروتوكول». */
  const [species, setSpecies] = useState<Species[]>(
    initial?.species ?? (petSpecies ? [petSpecies] : ["dog", "cat"]),
  );
  const [days, setDays] = useState(initial?.days ?? 3);
  const [steps, setSteps] = useState<StoredStep[]>(initial?.steps ?? []);
  const [q, setQ] = useState("");
  /* المنتقي الموحَّد بوضع «الموثَّق جرعتُه»: الأدويةُ الثمانيةُ والخمسون كلُّها — والبندُ
   * يحفظ معرّفَ الدليل كما كان، فالجرعةُ تُشتقّ لحظةَ التطبيق. */
  const [pickerOpen, setPickerOpen] = useState(false);
  const valid = name.trim().length > 0 && steps.length > 0;
  /** ما كُتب بالحقل ويعرفه الدليل — يُعرض فوق «خارج الدليل» كما كانت نتائجُ بحثه تُعرض. */
  const typedMono = q.trim().length >= 2 ? matchMonograph(q.trim()) : undefined;

  const addDrug = (d: Monograph) => {
    playTap();
    setSteps((s) => (s.some((x) => x.kind === "drug" && x.ref === d.id) ? s : [...s, { kind: "drug", ref: d.id }]));
    setQ("");
  };

  /** دواءٌ لا يعرفه الدليل — يُقبَل باسمه، وكميتُه تُكتب باليد. */
  const addFreeDrug = () => {
    const label = q.trim();
    if (!label) return;
    playTap();
    setSteps((s) => [...s, { kind: "drug", ref: "", label, amount: "", perDay: 2 }]);
    setQ("");
  };

  const setAmount = (i: number, v: string) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, amount: v } : x)));
  const addCare = (type: Exclude<TaskType, "drug">) => {
    playTap();
    setSteps((s) => [...s, { kind: "care", ref: type, label: TASK_META[type].ar(), perDay: 3 }]);
  };
  const drop = (i: number) => { playTap(); setSteps((s) => s.filter((_, j) => j !== i)); };
  const setPerDay = (i: number, n: number) =>
    setSteps((s) => s.map((x, j) => (j === i ? { ...x, perDay: Math.max(1, Math.min(12, n)) } : x)));

  const save = () => {
    if (!valid) return;
    playSuccess();
    const p: StoredProtocol = {
      id: initial?.id ?? newProtocolId(),
      name: name.trim(),
      indication: indication.trim(),
      species,
      days: Math.max(1, Math.min(30, days)),
      steps,
    };
    saveStored(p);
    onSaved();
  };

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end bg-ink/40 p-0 sm:place-items-center sm:p-4" onClick={onClose}>
      <div data-protoeditor onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-surface-1 shadow-raised sm:max-w-2xl sm:rounded-3xl">

        <div className="flex shrink-0 items-center gap-2 border-b border-line px-4 py-3">
          <div className="min-w-0 flex-1 text-sm font-extrabold text-ink">
            {initial ? t("proto.edit", "تعديل بروتوكول") : t("proto.new", "بروتوكول جديد")}
          </div>
          <button type="button" data-protoeditclose onClick={onClose}
            className="grid h-11 w-11 place-items-center rounded-full text-ink-muted transition hover:bg-surface-2">
            <X size={20} />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
          {/* الهوية */}
          <input data-protoname value={name} onChange={(e) => setName(e.target.value)}
            placeholder={t("proto.namePh", "اسم البروتوكول — مثلاً: إسهال جراوي")}
            className="w-full rounded-2xl border border-line bg-surface-1 px-3 text-sm font-bold text-ink outline-none focus:border-brand-400"
            style={{ minHeight: 48 }} />
          <input data-protoind value={indication} onChange={(e) => setIndication(e.target.value)}
            placeholder={t("proto.indPh", "متى يُستعمل؟ سطر واحد")}
            className="w-full rounded-2xl border border-line bg-surface-1 px-3 text-2xs text-ink outline-none focus:border-brand-400"
            style={{ minHeight: 44 }} />

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-2xs font-extrabold text-ink-muted">{t("proto.forSpecies", "لأي نوع؟")}</span>
            {SPECIES.map((s) => {
              const on = species.includes(s.id);
              return (
                <button key={s.id} type="button" data-protospecies={s.id}
                  onClick={() => { playTap(); setSpecies((cur) => on ? cur.filter((x) => x !== s.id) : [...cur, s.id]); }}
                  className={cn("grid h-11 w-11 place-items-center rounded-full border text-lg transition",
                    on ? "border-brand-500 bg-brand-50 dark:bg-brand-500/15" : "border-line bg-surface-2 opacity-50")}>
                  {s.emoji}
                </button>
              );
            })}
            <span className="ms-auto text-2xs font-extrabold text-ink-muted">{t("proto.forDays", "كم يوماً؟")}</span>
            <input data-protodays type="number" min={1} max={30} value={days}
              onChange={(e) => setDays(Number(e.target.value) || 1)}
              className="w-16 rounded-xl border border-line bg-surface-1 px-2 text-center text-sm font-bold text-ink outline-none focus:border-brand-400"
              style={{ minHeight: 44 }} />
          </div>

          {/* الأدوية — الجرعة لا تُسأل، تُشتقّ. الدليلُ كلُّه بالمنتقي الموحَّد («أدويتي» أوّلاً). */}
          <div className="rounded-2xl border border-line bg-surface-2/50 p-2">
            <button type="button" data-protodrugpick onClick={() => { playTap(); setPickerOpen(true); }}
              className="flex w-full items-center gap-2 rounded-xl bg-surface-1 px-2.5 text-start text-sm font-bold text-ink-muted transition hover:text-ink" style={{ minHeight: 46 }}>
              <Search size={15} className="shrink-0 text-ink-subtle" />
              <span className="min-w-0 flex-1 truncate">{t("proto.drugPh", "أضِف دواءً من الدليل…")}</span>
              <Plus size={14} className="shrink-0 text-brand-600" />
            </button>
            <MedPicker open={pickerOpen} onClose={() => setPickerOpen(false)} mode="single" only="dosable" freeText="off" stock="hide"
              species={petSpecies ?? null}
              onPick={(m) => { const d = m.monographId ? DRUG_BY_ID.get(m.monographId) : undefined; if (d) addDrug(d); setPickerOpen(false); }} />
            {/* دواءٌ خارج الدليل يبقى ممكناً — باسمه وكميتُه تُكتب باليد. */}
            <div className="mt-1.5 flex items-center gap-2 rounded-xl bg-surface-1 px-2.5" style={{ minHeight: 44 }}>
              <input data-protodrugq value={q} onChange={(e) => setQ(e.target.value)}
                placeholder={t("mymeds.newNamePh", "اسم الدواء كما تكتبه")}
                className="min-w-0 flex-1 bg-transparent text-2xs text-ink outline-none" />
            </div>

            {/* اسمٌ مكتوبٌ يعرفه الدليل يُضاف **من الدليل** (معرّفُه، والجرعةُ تُشتقّ والمنعُ بالنوع
                يُفحص) — كان الحقلُ الظاهر يعرض «خارج الدليل» وحده، فـ«Permethrin» تُحفظ بكميةٍ يدوية
                وتُكتب لقطٍّ بلا منعٍ ولا جرعة. */}
            {typedMono && (
              <button type="button" data-protodrughit={typedMono.id} onClick={() => addDrug(typedMono)}
                className="mt-1.5 flex w-full items-center gap-2 rounded-xl bg-surface-1 px-2.5 py-2 text-start transition hover:bg-brand-50 dark:hover:bg-brand-500/10"
                style={{ minHeight: 44 }}>
                <Plus size={14} className="shrink-0 text-brand-600" />
                <span className="min-w-0 flex-1 truncate text-2xs font-extrabold text-ink">
                  {t("mymeds.protoHit", { d: typedMono.ar, defaultValue: "أضِف «{{d}}» من الدليل — الجرعة تُحسب من الوزن" })}
                </span>
                <span className="shrink-0 truncate text-[10px] text-ink-subtle" dir="ltr">{typedMono.en}</span>
              </button>
            )}

            {/* الدليل ثمانيةٌ وخمسون دواءً ورفُّ العيادة أوسع — فاسمٌ لا يعرفه
                يُقبَل بدل أن يوقف البروتوكول، بشرط أن تُكتب كميته باليد. */}
            {q.trim().length >= 2 && (
              <button type="button" data-protofreedrug onClick={addFreeDrug}
                className="mt-1.5 flex w-full items-center gap-2 rounded-xl border border-dashed border-line px-2.5 py-2 text-start text-ink-muted transition hover:border-brand-300 hover:text-ink"
                style={{ minHeight: 44 }}>
                <Plus size={14} className="shrink-0" />
                <span className="min-w-0 flex-1 truncate text-2xs font-bold">
                  {t("proto.freeDrug", { d: q.trim(), defaultValue: "أضِف «{{d}}» — دواء خارج الدليل، تكتب كميته بنفسك" })}
                </span>
              </button>
            )}
            <div className="mt-1.5 flex flex-wrap gap-1">
              {CARE_TYPES.map((ct) => (
                <button key={ct} type="button" data-protoaddcare={ct} onClick={() => addCare(ct)}
                  className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-1 px-2.5 py-1.5 text-2xs font-bold text-ink-muted transition hover:border-brand-300 hover:text-ink"
                  style={{ minHeight: 40 }}>
                  <span className="font-black">{TASK_META[ct].glyph}</span> {TASK_META[ct].ar()}
                </button>
              ))}
            </div>
          </div>

          {/* البنود */}
          {!steps.length && (
            <p className="p-4 text-center text-2xs text-ink-muted">
              {t("proto.noSteps", "ما في بنود بعد — أضِف دواءً أو مهمّة رعاية من فوق.")}
            </p>
          )}
          <div className="grid gap-1.5">
            {steps.map((st, i) => {
              const drug = st.kind === "drug" ? DRUG_BY_ID.get(st.ref) : undefined;
              const tm = st.kind === "care" ? TASK_META[st.ref as Exclude<TaskType, "drug">] : TASK_META.drug;
              return (
                <div key={`${st.kind}-${st.ref}-${i}`} data-protostep
                  className="flex items-center gap-2 rounded-xl border border-line bg-surface-1 p-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-2 text-sm font-black text-ink-muted">
                    {tm.glyph}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-extrabold text-ink">
                      {drug ? drug.ar : st.label || TASK_LABEL_FALLBACK(st.ref)}
                    </div>
                    <div className="text-[10px] text-ink-subtle">
                      {st.kind === "care"
                        ? t("proto.timesDay", { n: formatNum(st.perDay ?? 1), defaultValue: "{{n}} مرات باليوم" })
                        : drug
                          ? t("proto.doseAuto", "الجرعة تُحسب من الوزن عند التطبيق")
                          : t("proto.doseManual", "خارج الدليل — اكتب الكمية")}
                    </div>
                  </div>
                  {/* الدواء الخارج عن الدليل يحمل كميته نصّاً: لا نافذةَ تُشتقّ منها */}
                  {st.kind === "drug" && !drug && (
                    <input value={st.amount ?? ""} data-protofreeamount
                      onChange={(e) => setAmount(i, e.target.value)}
                      placeholder={t("proto.amountPh", "الكمية")}
                      className="w-24 shrink-0 rounded-lg border border-line bg-surface-1 px-2 text-center text-xs font-bold text-ink outline-none focus:border-brand-400"
                      style={{ minHeight: 38 }} />
                  )}
                  {st.kind === "care" && (
                    <input type="number" min={1} max={12} value={st.perDay ?? 1} data-protoperday
                      onChange={(e) => setPerDay(i, Number(e.target.value) || 1)}
                      className="w-14 shrink-0 rounded-lg border border-line bg-surface-1 px-1 text-center text-xs font-bold text-ink outline-none focus:border-brand-400"
                      style={{ minHeight: 38 }} />
                  )}
                  <button type="button" data-protostepdrop={i} onClick={() => drop(i)}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-ink-subtle transition hover:bg-danger-50 hover:text-danger-600">
                    <Trash2 size={15} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>

        <div className="shrink-0 border-t border-line p-3">
          {/* زرٌّ باهتٌ بلا سبب يُقرأ كعطل: «ضغطت وما انحفظ». فالناقص يُقال. */}
          {!valid && (
            <p data-protowhy className="mb-2 text-center text-2xs font-bold text-warn-700 dark:text-warn-300">
              {!name.trim()
                ? t("proto.needName", "اكتب اسم البروتوكول أولاً")
                : t("proto.needSteps", "أضِف بنداً واحداً على الأقل — دواءً أو مهمّة رعاية")}
            </p>
          )}
          <button type="button" data-protosave disabled={!valid} onClick={save}
            className="btn btn-primary w-full disabled:opacity-50" style={{ minHeight: 52 }}>
            <Check size={17} /> {t("proto.save", "احفظ البروتوكول")}
          </button>
        </div>
      </div>
    </div>
  );
}
