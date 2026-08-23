import i18n from "@/i18n";
import type { DoseRoute, Pet, Species, TaskType } from "@/types";
import {
  DRUG_BY_ID, doseFor, calcDose, isBannedFor, allergyHit,
  type Monograph, type Route, type DoseAlert,
} from "./vetFormulary";
import { pad2, TASK_META } from "./flowsheet";
import { getCareProtocolsRaw, setCareProtocolsRaw } from "./settings";

/* ============================================================================
 * protocols — «البروتوكولات الجاهزة»: حالةٌ شائعة تُكتب بضغطة بدل عشر.
 *
 * ── المشكلة ──────────────────────────────────────────────────────────────
 * الحالات المتكرّرة تُكتب يدوياً كل مرة. التهاب أمعاءٍ حاد عند كلبٍ يعني
 * سوائل ومضادَّ قيءٍ ومضادَّ حيويٍّ ومثبّطَ حمضٍ وقياسَ حرارةٍ ومتابعةَ أكلٍ
 * وإخراج — تسعةُ صفوفٍ بأوقاتها. كتابتها تأخذ دقائق، وتحت الضغط يُنسى منها
 * سطر. والنسيان هنا ليس بطئاً بل **نقصَ علاج**.
 *
 * ── القرار المعماري: البروتوكول يحمل التركيب، والدليل يحمل الأرقام ───────
 * لا جرعةَ مكتوبةً بهذا الملف. البروتوكول يقول «ماروبيتانت» فقط، والجرعة
 * تُقرأ لحظةَ التطبيق من `vetFormulary` بنافذة النوع نفسه ووزن هذا الحيوان.
 *
 * وهذا مقصود: لو كُتبت الجرعة هنا لصار للحقيقة نسختان — واحدةٌ بالدليل
 * تُراجَع وتُصحَّح، وواحدةٌ مجمّدةٌ بالبروتوكول لا يعلم أحدٌ أنها تخلّفت.
 * وبنظامٍ دوائي نسختان من الجرعة أخطر من غياب البروتوكول كلّه.
 *
 * ── وما ليس بروتوكولاً ───────────────────────────────────────────────────
 * هذه **مسوّدةٌ تُراجَع**، لا أمرٌ يُنفَّذ. تُعرَض كاملةً قبل الكتابة، ويُحذف
 * منها ما لا يناسب، ولا تُطبَّق إلا بضغطةٍ ثانية. والتنبيهات المانعة (منعٌ
 * بالنوع أو حساسيةٌ مسجّلة) تُعرَض قبل ذلك كلّه.
 * ==========================================================================*/

/** بندٌ دوائي: يشير لمونوغراف بالدليل، والجرعةُ تُشتقّ عند التطبيق. */
export interface DrugStep {
  kind: "drug";
  /** معرّف الدواء بـ`FORMULARY`. */
  drug: string;
  /** طريقٌ يُفضَّل — يُتجاهَل إن لم يدعمه المونوغراف لهذا النوع. */
  prefer?: Route;
  /** كم يوماً يستمرّ. الافتراضي مدّة البروتوكول. */
  days?: number;
  note?: () => string;
}

/** بندٌ غير دوائي: سوائل، قياس، تغذية، إخراج، تمريض، مختبر. */
export interface CareStep {
  kind: "care";
  type: Exclude<TaskType, "drug">;
  label: () => string;
  /** كم مرّةً باليوم — تُوزَّع على ساعات اليوم بالتساوي. */
  perDay: number;
  amount?: () => string;
  route?: DoseRoute;
  days?: number;
  note?: () => string;
}

export type ProtocolStep = DrugStep | CareStep;

export interface Protocol {
  id: string;
  /** الاسم المعروض — دالّةٌ تتبع اللغة الجارية. */
  name: () => string;
  /** متى يُستعمل — سطرٌ يقرأه الطبيب قبل الاختيار. */
  indication: () => string;
  /** الأنواع التي يصلح لها. الفارغ يعني كل نوع. */
  species: Species[];
  /** مدّة البروتوكول بالأيام. */
  days: number;
  steps: ProtocolStep[];
  /** تحذيرٌ يُعرَض دائماً مع هذا البروتوكول. */
  caution?: () => string;
}

const DOG_CAT: Species[] = ["dog", "cat"];

/* ── المكتبة ──────────────────────────────────────────────────────────────
 * بروتوكولاتٌ تغطّي ما يدخل عيادةَ الحيوانات الصغيرة يومياً. كلٌّ منها
 * **تركيبٌ** لا جرعات: أي دواءٍ وأي رعاية وبأي تواتر. والأرقام من الدليل.  */
export const PROTOCOLS: Protocol[] = [
  {
    id: "gastroenteritis",
    name: () => i18n.t("proto.gastro", "التهاب معدة وأمعاء حاد"),
    indication: () => i18n.t("proto.gastroWhen", "قيء وإسهال حاد بلا دم، الحيوان واعٍ ويشرب"),
    species: DOG_CAT,
    days: 3,
    steps: [
      { kind: "care", type: "fluid", perDay: 4, route: "sc", label: () => i18n.t("proto.sFluids", "سوائل داعمة"), amount: () => i18n.t("proto.sFluidsAmt", "حسب الجفاف") },
      { kind: "drug", drug: "maropitant", prefer: "SC" },
      { kind: "drug", drug: "metronidazole", prefer: "PO" },
      { kind: "drug", drug: "famotidine", prefer: "SC" },
      { kind: "care", type: "vitals", perDay: 3, label: () => i18n.t("proto.sTemp", "الحرارة") },
      { kind: "care", type: "feed", perDay: 3, label: () => i18n.t("proto.sFeed", "تغذية تدريجية") },
      { kind: "care", type: "elim", perDay: 3, label: () => i18n.t("proto.sElim", "متابعة الإخراج") },
    ],
  },
  {
    id: "parvo",
    name: () => i18n.t("proto.parvo", "بارفو — رعاية داعمة"),
    indication: () => i18n.t("proto.parvoWhen", "جرو بإسهال دموي وقيء، والفحص السريع إيجابي"),
    species: ["dog"],
    days: 5,
    caution: () => i18n.t("proto.parvoCaution", "عزلٌ تامّ عن باقي الأقفاص. الرعاية الداعمة هي العلاج — لا يوجد مضادٌّ للفيروس."),
    steps: [
      { kind: "care", type: "fluid", perDay: 6, route: "iv", label: () => i18n.t("proto.sFluidsIV", "سوائل وريدية"), amount: () => i18n.t("proto.sFluidsAmt", "حسب الجفاف") },
      { kind: "drug", drug: "maropitant", prefer: "SC" },
      // الفمويّ لا يصلح لجروٍ يتقيّأ، والمونوغراف لا يوثّق الوريدي لهذا
      // المركّب — فتحت الجلد هو المدعوم فعلاً، لا افتراضاً يسقط عليه.
      { kind: "drug", drug: "amoxi-clav", prefer: "SC" },
      { kind: "drug", drug: "metronidazole", prefer: "IV" },
      { kind: "care", type: "vitals", perDay: 6, label: () => i18n.t("proto.sTemp", "الحرارة") },
      { kind: "care", type: "elim", perDay: 6, label: () => i18n.t("proto.sElim", "متابعة الإخراج") },
      { kind: "care", type: "feed", perDay: 4, label: () => i18n.t("proto.sFeedSmall", "تغذية قليلة متكرّرة") },
    ],
  },
  {
    id: "postop",
    name: () => i18n.t("proto.postop", "ما بعد العملية"),
    indication: () => i18n.t("proto.postopWhen", "بعد أي جراحة — تسكين ومضاد حيوي ومتابعة جرح"),
    species: DOG_CAT,
    days: 3,
    steps: [
      { kind: "drug", drug: "meloxicam", prefer: "SC" },
      { kind: "drug", drug: "tramadol", prefer: "PO" },
      { kind: "drug", drug: "amoxi-clav", prefer: "SC" },
      { kind: "care", type: "vitals", perDay: 4, label: () => i18n.t("proto.sTemp", "الحرارة") },
      { kind: "care", type: "nurse", perDay: 2, label: () => i18n.t("proto.sWound", "فحص الجرح والضماد") },
      { kind: "care", type: "feed", perDay: 2, label: () => i18n.t("proto.sFeed", "تغذية تدريجية") },
    ],
  },
  {
    id: "abscess",
    name: () => i18n.t("proto.abscess", "خرّاج أو جرح ملوّث"),
    indication: () => i18n.t("proto.abscessWhen", "خرّاج مفتوح أو جرح عضّة — بعد التنظيف والتصريف"),
    species: DOG_CAT,
    days: 5,
    steps: [
      { kind: "drug", drug: "amoxi-clav", prefer: "PO" },
      { kind: "drug", drug: "meloxicam", prefer: "PO" },
      { kind: "care", type: "nurse", perDay: 2, label: () => i18n.t("proto.sDressing", "تنظيف وتغيير ضماد") },
      { kind: "care", type: "vitals", perDay: 2, label: () => i18n.t("proto.sTemp", "الحرارة") },
    ],
  },
  {
    id: "flutd",
    name: () => i18n.t("proto.flutd", "انسداد مجرى البول — قط"),
    indication: () => i18n.t("proto.flutdWhen", "قط ذكر يجهد بلا بول — بعد القسطرة والتفريغ"),
    species: ["cat"],
    days: 3,
    caution: () => i18n.t("proto.flutdCaution", "افحص البوتاسيوم والكلى قبل أي مضاد التهاب. حالة طارئة تُراقَب ساعةً بساعة."),
    steps: [
      { kind: "care", type: "fluid", perDay: 6, route: "iv", label: () => i18n.t("proto.sFluidsIV", "سوائل وريدية") },
      { kind: "drug", drug: "buprenorphine", prefer: "IV" },
      { kind: "care", type: "elim", perDay: 6, label: () => i18n.t("proto.sUrine", "قياس البول المُخرَج"), amount: () => i18n.t("proto.sUrineAmt", "مل") },
      { kind: "care", type: "vitals", perDay: 6, label: () => i18n.t("proto.sTemp", "الحرارة") },
      { kind: "care", type: "lab", perDay: 1, label: () => i18n.t("proto.sRenal", "كلى وشوارد") },
    ],
  },
  {
    id: "respiratory",
    name: () => i18n.t("proto.resp", "التهاب تنفّسي"),
    indication: () => i18n.t("proto.respWhen", "سعال وإفرازات وحرارة — التهاب قصبات أو رئة"),
    species: DOG_CAT,
    days: 7,
    steps: [
      { kind: "drug", drug: "doxycycline", prefer: "PO" },
      { kind: "care", type: "vitals", perDay: 3, label: () => i18n.t("proto.sTempResp", "الحرارة ومعدّل التنفّس") },
      { kind: "care", type: "nurse", perDay: 2, label: () => i18n.t("proto.sNebul", "تنظيف الأنف/بخّار") },
    ],
  },
  {
    id: "dehydration",
    name: () => i18n.t("proto.dehyd", "جفاف — إنعاش بالسوائل"),
    indication: () => i18n.t("proto.dehydWhen", "جفاف بلا سبب واضح بعد — حتى يتّضح التشخيص"),
    species: DOG_CAT,
    days: 2,
    steps: [
      { kind: "care", type: "fluid", perDay: 6, route: "iv", label: () => i18n.t("proto.sFluidsIV", "سوائل وريدية") },
      { kind: "care", type: "vitals", perDay: 6, label: () => i18n.t("proto.sTemp", "الحرارة") },
      { kind: "care", type: "elim", perDay: 4, label: () => i18n.t("proto.sElim", "متابعة الإخراج") },
    ],
  },
  {
    id: "deworm",
    name: () => i18n.t("proto.deworm", "تخلّص من الديدان"),
    indication: () => i18n.t("proto.dewormWhen", "برنامج دوري أو ديدان مرئية بالبراز"),
    species: DOG_CAT,
    days: 1,
    steps: [
      { kind: "drug", drug: "praziquantel", prefer: "PO" },
      { kind: "drug", drug: "pyrantel", prefer: "PO" },
    ],
  },
];

/* ── بروتوكولات العيادة ────────────────────────────────────────────────────
 * الثمانيةُ أعلاه مكتوبةٌ بالكود: مراجَعةٌ ومترجَمة وتصل كل عيادة. وما تبنيه
 * العيادة لنفسها يُخزَّن بإعداداتها — ولا يمكن أن يكون دوالَّ ترجمة، فهو نصٌّ
 * كتبه الطبيب بلغته. ولذلك شكلان: `Protocol` للمعروض، و`StoredProtocol`
 * لما يُحفَظ ويُقرأ من JSON.
 *
 * والمخصَّص يحمل تركيبه نفسه — أسماء أدويةٍ من الدليل لا جرعاتٍ مجمَّدة —
 * فتبقى القاعدة قائمةً: مصدرُ الرقم واحد.                                    */

export interface StoredStep {
  kind: "drug" | "care";
  /** للدواء: معرّفه بالدليل. للرعاية: نوع المهمّة. */
  ref: string;
  /** اسمٌ معروض لبنود الرعاية — الدواء يأخذ اسمه من الدليل. */
  label?: string;
  prefer?: Route;
  perDay?: number;
  days?: number;
}

export interface StoredProtocol {
  id: string;
  name: string;
  indication: string;
  species: Species[];
  days: number;
  steps: StoredStep[];
}

/** اسمٌ احتياطي لبند رعايةٍ فقد تسميته — لا يُعرَض معرّفٌ خام للطبيب. */
export const TASK_LABEL_FALLBACK = (ref: string): string => {
  const tm = (TASK_META as Record<string, { ar: () => string } | undefined>)[ref];
  return tm ? tm.ar() : ref;
};

const CUSTOM_PREFIX = "custom-";
export const isCustom = (p: Protocol): boolean => p.id.startsWith(CUSTOM_PREFIX);
export const newProtocolId = (): string => `${CUSTOM_PREFIX}${Math.random().toString(36).slice(2, 9)}`;

/** المخزَّن → المعروض. النصوص تُلَفّ بدوالَّ ثابتة: لا ترجمة لما كتبه الطبيب. */
export function inflate(s: StoredProtocol): Protocol {
  return {
    id: s.id,
    name: () => s.name,
    indication: () => s.indication,
    species: s.species ?? [],
    days: Math.max(1, Math.min(30, s.days || 1)),
    steps: (s.steps ?? []).map<ProtocolStep>((st) =>
      st.kind === "drug"
        ? { kind: "drug", drug: st.ref, prefer: st.prefer, days: st.days }
        : {
            kind: "care", type: (st.ref as CareStep["type"]) || "nurse",
            label: () => st.label || st.ref, perDay: st.perDay ?? 1, days: st.days,
          }),
  };
}

/** يقرأ بروتوكولات العيادة من الإعدادات — الفاسد يُتجاهَل لا يُسقط الباقي. */
export function customProtocols(): Protocol[] {
  try {
    const raw = getCareProtocolsRaw();
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown;
    if (!Array.isArray(arr)) return [];
    return arr
      .filter((x): x is StoredProtocol => !!x && typeof x === "object" && typeof (x as StoredProtocol).id === "string")
      .filter((x) => (x.name ?? "").trim() && Array.isArray(x.steps) && x.steps.length > 0)
      .map(inflate);
  } catch { return []; }
}

export function readStored(): StoredProtocol[] {
  try {
    const raw = getCareProtocolsRaw();
    const arr = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(arr) ? (arr as StoredProtocol[]) : [];
  } catch { return []; }
}

/** يحفظ بروتوكولاً جديداً أو يستبدل واحداً بمعرّفه. */
export function saveStored(p: StoredProtocol) {
  const list = readStored().filter((x) => x.id !== p.id);
  list.push(p);
  setCareProtocolsRaw(JSON.stringify(list));
}

export function deleteStored(id: string) {
  const list = readStored().filter((x) => x.id !== id);
  setCareProtocolsRaw(list.length ? JSON.stringify(list) : null);
}

/** كل البروتوكولات: ما بنته العيادة أولاً — فهو الأقرب لعملها. */
export const allProtocols = (): Protocol[] => [...customProtocols(), ...PROTOCOLS];

/** البروتوكولات التي تصلح لهذا النوع. */
export const protocolsFor = (species: Species | undefined): Protocol[] =>
  allProtocols().filter((p) => !p.species.length || !species || p.species.includes(species));

export const protocolById = (id: string): Protocol | undefined =>
  allProtocols().find((p) => p.id === id);

/* ── الأوقات ───────────────────────────────────────────────────────────────
 * تُوزَّع الجرعات على ساعات النهار بالتساوي ابتداءً من الثامنة. ومرّةٌ واحدة
 * باليوم تعني الثامنة صباحاً لا منتصف الليل — الجرعة تُعطى حين يوجد أحد. */
const DAY_START = 8;

export function spreadTimes(perDay: number): string[] {
  const n = Math.max(1, Math.min(12, Math.round(perDay)));
  if (n === 1) return [`${pad2(DAY_START)}:00`];
  const gap = 24 / n;
  return Array.from({ length: n }, (_, i) => `${pad2(Math.round(DAY_START + i * gap) % 24)}:00`)
    .sort();
}

/** طريق الدليل («SC») → طريق الورقة («sc»). ما لا يقابله شيء يُترك فارغاً. */
const ROUTE_DOWN: Partial<Record<Route, DoseRoute>> = {
  PO: "po", IV: "iv", IM: "im", SC: "sc", topical: "topical",
};

/** الطريق المختار: المفضَّل إن دعمه المونوغراف، وإلا أول ما يدعمه. */
function routeFor(drug: Monograph, species: Species, prefer?: Route): DoseRoute | null {
  const win = doseFor(drug, species);
  const routes = win?.routes ?? [];
  const pick = (prefer && routes.includes(prefer) ? prefer : routes[0]) as Route | undefined;
  return (pick && ROUTE_DOWN[pick]) ?? null;
}

/**
 * الكمية المكتوبة بالصفّ — تُشتقّ من الدليل ووزن الحيوان.
 *
 * بلا وزنٍ لا رقم: يُكتب المدى الموثَّق نصّاً («١٥ ملغم/كغ») ويُترك للطبيب
 * أن يحسبه. وكتابةُ رقمٍ مخترَع هنا أسوأ من تركه — لأنه يُقرأ لاحقاً كأنه
 * محسوب.
 */
export function amountFor(drug: Monograph, species: Species, weightKg: number | null | undefined): string {
  const win = doseFor(drug, species);
  if (!win) return "";
  if (!weightKg || weightKg <= 0) {
    return i18n.t("proto.perKg", { n: win.typical, defaultValue: "{{n}} ملغم/كغ" });
  }
  const strength = drug.strengths?.[0];
  const c = calcDose({ mgPerKg: win.typical, weightKg, strength, solid: drug.solid, freq: win.freq });
  if (drug.solid && c.tabletsLabel) return c.tabletsLabel;
  if (c.mlRounded) return i18n.t("proto.ml", { n: c.mlRounded, defaultValue: "{{n}} مل" });
  return i18n.t("proto.mg", { n: Math.round(c.mg), defaultValue: "{{n}} ملغم" });
}

/** صفٌّ مقترَح — يُعرَض للمراجعة قبل أن يصير أمراً. */
export interface DraftOrder {
  /** مفتاحٌ محلي للصفّ الواحد. */
  key: string;
  /**
   * مفتاح **البند** الذي وُلِّد منه هذا الصفّ — واحدٌ لكل أيامه وأوقاته.
   *
   * الحذف يجري بهذا لا بمفتاح الصفّ: البروتوكول يمتدّ أياماً والورقة تعرض
   * اليوم وحده، فحذف جرعة اليوم كان يترك جرعات الغد قائمةً بلا وسيلةٍ
   * لإزالتها — والتنبيه يبقى معلّقاً بحقّ. والطبيب حين يحذف «ترامادول» يعني
   * الدواء كلّه لا حصّته من هذه الساعة.
   */
  stepKey: string;
  task_type: TaskType;
  medication: string;
  amount: string;
  route: DoseRoute | null;
  time: string;
  day: string;
  observations: string | null;
  /** الدواء الذي اشتُقّ منه — لفحص السلامة والعرض. */
  drugId?: string;
}

const addDays = (iso: string, n: number): string => {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/**
 * يبني مسوّدة الأوامر لهذا الحيوان — بلا كتابة، للعرض أولاً.
 *
 * الدواء الممنوع لهذا النوع **لا يُدرَج أصلاً**: عرضُه ثم منعُه يجعل الطبيب
 * يقرأ سطراً لن يُكتب، والقائمة تكذب على نفسها.
 */
export function buildDraft(p: Protocol, pet: Pet | undefined, todayISO: string): DraftOrder[] {
  const species: Species = pet?.species ?? "other";
  const weight = pet?.current_weight_kg;
  const out: DraftOrder[] = [];

  for (const step of p.steps) {
    const days = Math.max(1, Math.min(30, step.days ?? p.days));

    if (step.kind === "drug") {
      const drug = DRUG_BY_ID.get(step.drug);
      if (!drug) continue;
      if (isBannedFor(drug, species)) continue;          // لا يُعرَض ما لن يُكتب
      const win = doseFor(drug, species);
      if (!win) continue;                                 // لا نافذةَ موثّقة لهذا النوع
      const times = spreadTimes(win.freq === 0 ? 1 : 24 / win.freq);
      const amount = amountFor(drug, species, weight);
      const route = routeFor(drug, species, step.prefer);
      const stepKey = `${p.id}-drug-${step.drug}`;
      for (let d = 0; d < days; d++) {
        for (const time of times) {
          out.push({
            key: `${stepKey}-${d}-${time}`, stepKey,
            task_type: "drug", medication: drug.ar, amount, route,
            time, day: addDays(todayISO, d),
            observations: step.note?.() ?? null, drugId: drug.id,
          });
        }
      }
    } else {
      const times = spreadTimes(step.perDay);
      const stepKey = `${p.id}-care-${step.type}-${step.label()}`;
      for (let d = 0; d < days; d++) {
        for (const time of times) {
          out.push({
            key: `${stepKey}-${d}-${time}`, stepKey,
            task_type: step.type, medication: step.label(),
            amount: step.amount?.() ?? "", route: step.route ?? null,
            time, day: addDays(todayISO, d),
            observations: step.note?.() ?? null,
          });
        }
      }
    }
  }
  return out;
}

/**
 * تنبيهات السلامة للبروتوكول كاملاً — **قبل الكتابة**.
 *
 * تُفحص الحساسية المسجّلة بالملف وحدها هنا، لأن المنع بالنوع أُخرِج من
 * المسوّدة أصلاً. والحساسية **لا تُخرِج** البند بل توقفه: قد يكون التسجيل
 * قديماً أو خاطئاً، والقرار للطبيب لا للقائمة.
 */
export function draftAlerts(draft: DraftOrder[], pet: Pet | undefined): DoseAlert[] {
  if (!pet) return [];
  const seen = new Set<string>();
  const out: DoseAlert[] = [];
  for (const row of draft) {
    if (!row.drugId || seen.has(row.drugId)) continue;
    seen.add(row.drugId);
    const drug = DRUG_BY_ID.get(row.drugId);
    if (!drug) continue;
    for (const a of pet.allergies ?? []) {
      const hit = allergyHit(drug, a);
      if (hit) {
        out.push({
          id: `allergy-${drug.id}`, tone: "critical", blocking: true,
          title: i18n.t("proto.aAllergy", { d: drug.ar, defaultValue: "حساسية مسجّلة — {{d}} بهذا البروتوكول" }),
          detail: hit,
        });
        break;
      }
    }
  }
  return out;
}

/** ملخّصٌ يُقرأ بسطر: «٩ أوامر · ٣ أدوية · ٣ أيام». */
export function draftSummary(draft: DraftOrder[]): { orders: number; drugs: number; days: number } {
  return {
    orders: draft.length,
    drugs: new Set(draft.filter((d) => d.drugId).map((d) => d.drugId)).size,
    days: new Set(draft.map((d) => d.day)).size,
  };
}
