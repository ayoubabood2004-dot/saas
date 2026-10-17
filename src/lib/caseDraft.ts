/* ============================================================================
 * caseDraft — شكلُ نموذج «حالة جديدة» كما يُحفظ مسودّةً (formDraft.ts)، وقواعدُه:
 * متى يُعدّ فارغاً (فلا يُعرض)، وكيف يخفّ حين يمتلئ التخزين، وما يُقال عنه بالعرض.
 * نقيٌّ بلا React — يفحصه case-draft-test.
 * ==========================================================================*/
import type { Species, Sex } from "@/types";
import { isEmptyIntake, type IntakeDraft } from "./intake";
import { searchable } from "./utils";

export type Disposition = "log" | "boarding" | "boardingCare" | "record";
export type Health = "healthy" | "sick";

export interface AnimalDraft {
  key: string;
  photo: string | null;
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  dob: string;
  weight: string;
  color: string;
  microchip: string;
  allergies: string;
  notes: string;
  health: Health;
  diagnosis: string;
  disp: Disposition;
  cage: string;
  addMeds: boolean;
  /** معلوماتُ الحالة (intake.ts) — التشخيصُ فيها يُقرأ من health/diagnosis أعلاه لا مكرَّراً. */
  intake: IntakeDraft;
}

export interface OwnerFields { name: string; phone: string; email: string; governorate: string; area: string }

/** تبويبُ «حيوان موجود (برقم تسلسلي)». الحيوانُ نفسُه لا يُحفظ — يُبحث برقمه عند الاسترجاع. */
export interface SerialDraft {
  serial: string;
  found: boolean;
  admittedOn: string;
  disp: Disposition;
  cage: string;
  addMeds: boolean;
  health: Health;
  diagnosis: string;
  intake: IntakeDraft;
}

export interface CaseDraft {
  v: 1;
  entry: "new" | "serial";
  step: number;
  admittedOn: string;
  ownerCollapsed: boolean;
  owner: OwnerFields;
  animals: AnimalDraft[];
  serial: SerialDraft;
}

export const emptyOwner = (): OwnerFields => ({ name: "", phone: "", email: "", governorate: "", area: "" });

/** هل كتب أحدٌ شيئاً بهذا الحيوان؟ (النوعُ والجنس افتراضيّان — اختيارُهما وحده ليس عملاً يُحفظ.) */
export function animalHasContent(a: AnimalDraft): boolean {
  return !!(a.name.trim() || a.breed.trim() || a.dob || a.weight || a.color.trim() || a.microchip.trim()
    || a.allergies.trim() || a.notes.trim() || a.diagnosis.trim() || a.cage.trim() || a.photo || !isEmptyIntake(a.intake));
}

function serialHasContent(s: SerialDraft): boolean {
  return !!(s.serial.trim() || s.diagnosis.trim() || s.cage.trim() || !isEmptyIntake(s.intake));
}

/** فارغة = لا شيء كُتب. بياناتُ مالكٍ جاءت جاهزةً من السجلّ (`baseline`) ليست كتابة. */
export function caseDraftIsEmpty(d: CaseDraft, baseline: OwnerFields = emptyOwner()): boolean {
  const ownerTyped = (Object.keys(baseline) as (keyof OwnerFields)[]).some((k) => (d.owner[k] ?? "").trim() !== (baseline[k] ?? "").trim());
  return !ownerTyped && !d.animals.some(animalHasContent) && !serialHasContent(d.serial);
}

/** التخزينُ ممتلئ: نفس المسودّة بلا الصور (أثقلُ ما فيها). */
export const lightenCaseDraft = (d: CaseDraft): CaseDraft => ({ ...d, animals: d.animals.map((a) => ({ ...a, photo: null })) });

/**
 * هل تصف هذه المسودّةُ الحالةَ التي انحفظت للتوّ؟ نفسُ المالك (اسمُه أو هاتفُه) وكلُّ حيوانٍ
 * مسمّى فيها من المحفوظين. الطرفان يمرّان من `searchable` (همزة/ة/ى/أرقام)، والهاتفُ بأرقامه.
 * مسودّةُ مالكٍ آخر أو حيوانٍ آخر تبقى — هي حالةٌ أخرى ما انحفظت.
 */
export function draftIsSavedCase(d: CaseDraft, owner: OwnerFields, savedNames: string[]): boolean {
  const n = (s: string | null | undefined) => searchable(s ?? "").trim();
  const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
  const nameHit = !!n(d.owner?.name) && n(d.owner?.name) === n(owner.name);
  const phoneHit = digits(d.owner?.phone).length >= 6 && digits(d.owner?.phone) === digits(owner.phone);
  if (!nameHit && !phoneHit) return false;
  const saved = new Set(savedNames.map(n).filter(Boolean));
  return (d.animals ?? []).map((a) => n(a.name)).filter(Boolean).every((x) => saved.has(x));
}

/**
 * «وُجد الحيوان» بمسودّة الرقم التسلسليّ: فقط والمربّعُ ما زال يحمل رقمَ الحيوان المعروض.
 * عُدِّل المربّعُ بعد البحث ⇒ «لم يوجد» — الاسترجاعُ لا يبحث وحده عن رقمٍ لم يؤكّده الطبيب
 * فيعلّق ملاحظاتِ حيوانٍ على آخر (تدقيقٌ عدائيّ).
 */
export function serialFound(text: string, petSerial: string | number | null | undefined, initial: Pick<SerialDraft, "found" | "serial">, notFound: boolean): boolean {
  if (petSerial != null) return text.trim() !== "" && text.trim() === String(petSerial).trim();
  return initial.found && text === initial.serial && !notFound;
}

/** ما يُقال بالعرض: المالك، وأسماءُ الحيوانات، ورقمُ التسلسل إن كان. */
export function caseDraftWho(d: CaseDraft): { owner: string; animals: string[]; serial: string } {
  return {
    owner: d.owner.name.trim() || d.owner.phone.trim(),
    animals: d.animals.map((a) => a.name.trim()).filter(Boolean),
    serial: d.serial.serial.trim(),
  };
}
