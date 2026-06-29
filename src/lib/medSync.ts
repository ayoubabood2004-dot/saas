// Shared persistence for the unified Medical-Entry drafts (medications +
// vaccinations). Used by the patient record (PetPassport) AND the retail sale's
// "الأدوية" tab, so selling a vaccine/medication writes the SAME records into the
// animal's file — an administered dose, a scheduled booster (which then surfaces
// in the reminders feed), and treatment-sheet rows — exactly as if entered from
// the medical record. Pure data layer (no React); dual-adapter via repo.
import { repo } from "./repo";
import { localISO } from "./utils";
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
    if (e.kind === "vaccination") {
      // The dose given today.
      await repo.addVaccination({
        pet_id: petId, name: e.name, status: "administered",
        administered_at: nowISO, due_date: null,
        lot_number: e.lot, administered_by: doctorName,
      });
      // A scheduled booster becomes its own pending item — actioned later via
      // "Administer booster" and surfaced in the dashboard reminders feed.
      if (e.nextDue) {
        await repo.addVaccination({
          pet_id: petId, name: e.name, status: "scheduled",
          administered_at: null, due_date: e.nextDue,
        });
      }
    } else {
      await repo.addTreatment({
        pet_id: petId, day: today, medication: e.name, time: hhmm, amount: e.dosage,
        administered_at: nowISO, administered_by: doctorName, doctor: doctorName,
        // The doctor's note for this drug shows on the treatment card; falls back to route · family.
        observations: e.note?.trim() || `${ROUTE_LABEL[e.route]} · ${e.family}`,
      });
    }
  }
}
