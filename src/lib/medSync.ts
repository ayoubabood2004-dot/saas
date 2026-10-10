// Shared persistence for the unified Medical-Entry drafts (medications +
// vaccinations). Used by the patient record (PetPassport) AND the retail sale's
// "الأدوية" tab, so selling a vaccine/medication writes the SAME records into the
// animal's file — an administered dose, a scheduled booster (which then surfaces
// in the reminders feed), and treatment-sheet rows — exactly as if entered from
// the medical record. Pure data layer (no React); dual-adapter via repo.
import { repo } from "./repo";
import { localISO } from "./utils";
import { syncDoseCycleForPet } from "./doseCycle";
import { historyRows } from "./backdate";
import { pendingToConsume, sameVaccine } from "./vaxNext";
import type { Vaccination } from "@/types";
import type { MedicalDraft } from "@/components/MedicalEntry";

const ROUTE_LABEL: Record<string, string> = { injection: "Injection", tablet: "Tablet", liquid: "Syrup" };

/**
 * Persist a batch of medical drafts to a patient's record:
 *  • vaccination → an administered vaccination today (+ a scheduled booster row
 *    when a next-due date was set, which the reminders widget then picks up).
 *  • medication → a treatment-sheet row for today.
 * Throws on the first failure so callers can surface it and keep their draft.
 */
export async function persistMedicalEntries(
  petId: string,
  doctorName: string | undefined,
  entries: MedicalDraft[],
): Promise<void> {
  const now = new Date();
  const nowISO = now.toISOString();
  const today = localISO(now); // LOCAL date (not UTC) so the treatment-sheet day is correct in UTC+3
  const hhmm = now.toTimeString().slice(0, 5);
  for (const e of entries) {
    // Planned/prescription items are saved un-administered so they show in the record
    // as "مُخطّط / Planned" until the doctor marks them given.
    const given = e.administered !== false;
    if (e.kind === "vaccination") {
      if (e.history?.length) {
        // سجلٌّ سابق: جرعةٌ معطاةٌ بيومها لكلّ تاريخ، ثم الموعدُ القادم (backdate.ts).
        // لا طبيبَ معطٍ ولا تشغيلة — العيادةُ ما أعطتها بالضرورة، والورقُ نادراً يذكرها.
        // بجملةٍ واحدة: فشلٌ بالنصّ لا يترك نصفَ سجلٍّ تكرّره إعادةُ المحاولة.
        await repo.addVaccinations(historyRows(e.name, e.history, e.nextDue, today).map((row) => ({ pet_id: petId, ...row })));
        continue;
      }
      if (given) {
        // الجرعةُ المستحقّة لنفس اللقاح **هي** هذه (vaxNext.ts): تُقلب معطاةً بدل صفٍّ ثانٍ —
        // كان «انعطى اليوم» يكتب جرعةً جديدة ويترك المستحقّةَ معلّقةً للأبد (نحو ١١٢ بالإنتاج):
        // تذكيرٌ كاذبٌ للزبون وعلامةٌ حمراء على لقاحٍ انعطى. القراءةُ إن فشلت ⇒ الكتابةُ القديمة
        // (لا يُمنع البيعُ عند الكاشير بسبب قراءة)، وإن سبقنا جهازٌ ثانٍ للمستحقّة ⇒ صفٌّ جديد.
        let series: Vaccination[] | null = null;
        try { series = await repo.listVaccinations(petId); } catch { series = null; }
        const due = series ? pendingToConsume(series, e.name, today) : null;
        let consumed = false;
        if (due) {
          try {
            await repo.administerVaccination(due.id, { administered_at: today, administered_by: doctorName, lot_number: e.lot });
            consumed = true;
          } catch (err) {
            if ((err as { code?: string } | null)?.code !== "no_row_updated") throw err;
          }
        }
        // العمودُ `date`: اليومُ المحلّيّ لا `toISOString()` — وإلا فلقاحٌ بعد منتصف الليل ببغداد
        // ينكتب بيوم غرينتش (أمس).
        if (!consumed) {
          await repo.addVaccination({
            pet_id: petId, name: e.name, status: "administered",
            administered_at: today, due_date: null,
            lot_number: e.lot, administered_by: doctorName,
          });
        }
        // A scheduled booster becomes its own pending item — actioned later via the record's
        // administer dialog (which asks for the next one) and surfaced in the reminders feed.
        // وموعدٌ بنفس اليوم محجوزٌ أصلاً لنفس اللقاح لا يُكرَّر.
        const dup = !!e.nextDue && !!series?.some((v) => v.id !== due?.id && v.status !== "administered"
          && sameVaccine(v.name, e.name) && (v.due_date ?? "").slice(0, 10) === e.nextDue);
        if (e.nextDue && !dup) {
          await repo.addVaccination({
            pet_id: petId, name: e.name, status: "scheduled",
            administered_at: null, due_date: e.nextDue,
          });
        }
      } else {
        // Planned only: a single scheduled dose (no "given today" record). Defaults to
        // today when no future date was picked, so it still surfaces in the record.
        await repo.addVaccination({
          pet_id: petId, name: e.name, status: "scheduled",
          administered_at: null, due_date: e.nextDue ?? today,
          lot_number: e.lot,
        });
      }
    } else {
      await repo.addTreatment({
        pet_id: petId, day: today, medication: e.name, time: hhmm, amount: e.dosage,
        // null administered_at → the flowsheet renders it as a planned/pending dose.
        administered_at: given ? nowISO : null,
        administered_by: given ? doctorName : undefined, doctor: doctorName,
        // The doctor's note for this drug shows on the treatment card; falls back to route · family.
        observations: e.note?.trim() || `${ROUTE_LABEL[e.route]} · ${e.family}`,
      });
    }
  }
  // Reflect the new flowsheet state on the case boards (green "done" tint / amber due).
  await syncDoseCycleForPet(petId);
}
