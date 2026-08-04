// ============================================================================
// حاسبة السوائل — maintenance + deficit + ongoing losses → ml/hr → drops/min.
//
// Fluid rate was the one number on the treatment sheet nobody could compute in
// the app: the plan said "سوائل وريدية" and the rate lived in the doctor's head
// (or on the bag with a marker). This turns it into arithmetic the sheet owns.
//
// Every figure is standard small-animal fluid therapy, kept conservative and
// explicit so the doctor can check each term rather than trust a total:
//   • Maintenance — allometric 132·kg^0.75 (dog) / 80·kg^0.75 (cat) ml/day,
//     which is what keeps small patients from being badly over-dosed by the
//     simple per-kg rule. (Plumb's / BSAVA; the linear 40–60 ml/kg/day rule is
//     offered as a cross-check.)
//   • Deficit  — %dehydration × BW(kg) × 10 = ml, replaced over a chosen window.
//   • Ongoing  — vomiting/diarrhoea/polyuria, estimated ml/day.
//   • Shock    — a SEPARATE bolus track, never blended into the maintenance rate.
//
// Final judgement always stays with the veterinarian.
// ============================================================================
import type { Species } from "@/types";

/** Drip-set calibration — drops per millilitre printed on the giving set. */
export type DropFactor = 10 | 15 | 20 | 60;
export const DROP_FACTORS: { value: DropFactor; label: string }[] = [
  { value: 10, label: "10 نقطة/مل (طقم كبار)" },
  { value: 15, label: "15 نقطة/مل" },
  { value: 20, label: "20 نقطة/مل (شائع)" },
  { value: 60, label: "60 نقطة/مل (مايكرو — للصغار)" },
];

/**
 * Daily maintenance requirement in ml/day.
 *
 * Allometric, not linear, because the per-kg requirement FALLS as the animal
 * gets bigger. Against the flat 60 ml/kg/day rule the two curves cross at
 * roughly 23 kg: below it the linear rule UNDER-estimates (a 2 kg cat needs
 * ~135 ml/day, the rule says 120), above it the rule OVER-estimates (a 50 kg
 * dog needs ~2480, the rule says 3000). Small patients are the ones who get
 * short-changed and large ones the ones who get volume-overloaded.
 */
export function maintenanceMlPerDay(weightKg: number, species?: Species): number {
  if (!(weightKg > 0)) return 0;
  const k = species === "cat" ? 80 : 132;
  return k * Math.pow(weightKg, 0.75);
}

/** The simple per-kg rule, for cross-checking the allometric number. */
export function linearMaintenanceMlPerDay(weightKg: number, mlPerKgPerDay = 60): number {
  return weightKg > 0 ? weightKg * mlPerKgPerDay : 0;
}

/** Dehydration deficit in ml: % × kg × 10. */
export function deficitMl(weightKg: number, dehydrationPct: number): number {
  if (!(weightKg > 0) || !(dehydrationPct > 0)) return 0;
  return dehydrationPct * weightKg * 10;
}

/** Shock bolus volume — a separate, fast track. Give in quarters and reassess. */
export function shockBolusMl(weightKg: number, species?: Species): { total: number; quarter: number; mlPerKg: number } {
  const mlPerKg = species === "cat" ? 55 : 90;
  const total = weightKg > 0 ? weightKg * mlPerKg : 0;
  return { total, quarter: total / 4, mlPerKg };
}

export interface FluidPlanInput {
  weightKg: number;
  species?: Species;
  /** Clinical dehydration estimate, 0–12 %. */
  dehydrationPct?: number;
  /** Hours to replace the deficit over — 24 is routine, 6–12 when unwell. */
  replaceOverHours?: number;
  /** Estimated ongoing losses (vomit / diarrhoea / polyuria) in ml/day. */
  ongoingMlPerDay?: number;
  dropFactor?: DropFactor;
}

export interface FluidPlan {
  maintenanceMlDay: number;
  deficitMlTotal: number;
  /** The share of the deficit that lands in each of the first 24 hours. */
  deficitMlPerHour: number;
  ongoingMlDay: number;
  /** What actually runs during the replacement window. */
  rateMlPerHour: number;
  /** The rate once the deficit is paid off — maintenance + ongoing only. */
  maintenanceRateMlPerHour: number;
  totalFirst24hMl: number;
  dropsPerMinute: number;
  secondsPerDrop: number;
  /** Guard rails worth surfacing next to the number. */
  warnings: string[];
}

/** How fast is too fast: the routine safe ceiling for maintenance-type fluids. */
const MAX_SAFE_ML_KG_HR = 10;
/** Cats with occult heart disease are the classic fluid-overload death. */
const CAT_CAUTION_ML_KG_HR = 6;

export function fluidPlan(input: FluidPlanInput): FluidPlan {
  const {
    weightKg, species,
    dehydrationPct = 0,
    replaceOverHours = 24,
    ongoingMlPerDay = 0,
    dropFactor = 20,
  } = input;

  const maintenanceMlDay = maintenanceMlPerDay(weightKg, species);
  const deficitMlTotal = deficitMl(weightKg, dehydrationPct);
  const hours = Math.max(1, Math.min(48, replaceOverHours));
  const deficitMlPerHour = deficitMlTotal / hours;

  const maintenanceRateMlPerHour = (maintenanceMlDay + ongoingMlPerDay) / 24;
  const rateMlPerHour = maintenanceRateMlPerHour + deficitMlPerHour;

  const dropsPerMinute = (rateMlPerHour * dropFactor) / 60;
  const secondsPerDrop = dropsPerMinute > 0 ? 60 / dropsPerMinute : 0;

  const warnings: string[] = [];
  const perKgHr = weightKg > 0 ? rateMlPerHour / weightKg : 0;
  if (perKgHr > MAX_SAFE_ML_KG_HR) {
    warnings.push(`المعدّل ${perKgHr.toFixed(1)} مل/كغ/ساعة — فوق السقف الروتيني (${MAX_SAFE_ML_KG_HR}). وسّع مدة التعويض أو راجع تقدير الجفاف.`);
  } else if (species === "cat" && perKgHr > CAT_CAUTION_ML_KG_HR) {
    warnings.push(`قطة على ${perKgHr.toFixed(1)} مل/كغ/ساعة — القطط تنقلب لوذمة رئة بسرعة (مرض قلب خفي). راقب التنفّس كل ساعة.`);
  }
  if (dehydrationPct > 12) {
    warnings.push("تقدير جفاف فوق ١٢٪ غير واقعي سريرياً — راجع التقدير.");
  }
  if (dehydrationPct >= 8) {
    warnings.push("جفاف شديد — قيّم الصدمة أولاً؛ جرعة الصدمة مسار منفصل مو ضمن هذا المعدّل.");
  }
  if (weightKg > 0 && weightKg < 2 && dropFactor !== 60) {
    warnings.push("حيوان صغير — استعمل طقم مايكرو (٦٠ نقطة/مل) أو مضخّة، الطقم العادي ما يضبط.");
  }
  if (dropsPerMinute > 0 && dropsPerMinute < 1) {
    warnings.push("أقل من نقطة بالدقيقة — استعمل مضخّة سرنجة، العدّ بالنظر ما ينفع هنا.");
  }

  return {
    maintenanceMlDay,
    deficitMlTotal,
    deficitMlPerHour,
    ongoingMlDay: ongoingMlPerDay,
    rateMlPerHour,
    maintenanceRateMlPerHour,
    totalFirst24hMl: maintenanceMlDay + ongoingMlPerDay + Math.min(deficitMlTotal, deficitMlPerHour * 24),
    dropsPerMinute,
    secondsPerDrop,
    warnings,
  };
}

/** Clinical dehydration bands — what the vet actually estimates from. */
export const DEHYDRATION_BANDS: { pct: number; label: string; signs: string }[] = [
  { pct: 0, label: "بلا جفاف", signs: "أغشية رطبة، طيّة جلد ترجع فوراً" },
  { pct: 5, label: "٥٪ — خفيف", signs: "أغشية جافة شوي، طيّة الجلد بطيئة قليلاً" },
  { pct: 7, label: "٧٪ — متوسط", signs: "طيّة جلد واضحة البطء، أغشية جافة، عيون طبيعية" },
  { pct: 10, label: "١٠٪ — شديد", signs: "طيّة جلد تبقى واقفة، عيون غائرة، CRT متأخّر" },
  { pct: 12, label: "١٢٪ — حرج", signs: "علامات صدمة، انهيار دوري — ابدأ بجرعة الصدمة" },
];

/** The fluids a clinic actually hangs. */
export const FLUID_TYPES: { id: string; label: string; note?: string }[] = [
  { id: "lrs", label: "رينغر لاكتات (LRS)", note: "الخيار الروتيني لأغلب الحالات" },
  { id: "nacl09", label: "محلول ملحي ٠٫٩٪", note: "للفرط بوتاسيوم والانسداد البولي" },
  { id: "d5w", label: "دكستروز ٥٪", note: "ماء حر — مو لتعويض الحجم" },
  { id: "lrs-d5", label: "رينغر + دكستروز ٢٫٥٪" },
  { id: "hypertonic", label: "ملحي مرتفع التوتر ٧٫٥٪", note: "إنعاش صدمة بحجم صغير — بجرعة وزمن محسوبين" },
  { id: "hetastarch", label: "غرواني (Hetastarch)", note: "بحذر — مخاطر كلوية وتخثّرية" },
];
