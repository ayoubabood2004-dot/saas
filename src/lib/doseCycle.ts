// ============================================================================
// Dose-cycle sync — makes the case boards reflect the flowsheet.
//
// The boards (الاستقبال kanban + سجلات العيادة "الحالات الحالية") colour a case
// card by its admission's `last_completed_at` + `cycle_hours`: freshly completed
// → calm "done" tint; window elapsed → the amber "dose due" prompt returns.
//
// This helper is called after ANY flowsheet mutation (give / undo / add /
// delete a dose) and re-derives that admission stamp from today's doses:
//   • ALL of today's doses given  → stamp = the latest given time
//   • any dose pending today      → stamp cleared (the case is due again)
//   • nothing scheduled today     → leave the stamp alone (the plain cycle
//     timer — e.g. a 48h cycle set on the board — keeps governing)
// Best-effort: a failure here never blocks the dose action itself.
// ============================================================================
import { repo } from "./repo";
import { localISO } from "./utils";

export async function syncDoseCycleForPet(petId: string): Promise<void> {
  try {
    const [treatments, admissions] = await Promise.all([
      repo.listTreatments(petId),
      repo.listAdmissionsForPet(petId),
    ]);
    const adm = admissions.find(
      (a) => a.status === "active" && (a.kind === "treatment" || a.kind === "treatment_boarding"),
    );
    if (!adm) return;
    const today = localISO();
    const todayTx = treatments.filter((tx) => tx.day === today);
    if (todayTx.length === 0) return;
    const allGiven = todayTx.every((tx) => !!tx.administered_at);
    if (allGiven) {
      // Stamp with the LATEST given time (not "now") so a later undo→redo of an
      // early dose doesn't quietly stretch the cycle window.
      const times = todayTx.map((tx) => tx.administered_at as string).sort();
      const last = times[times.length - 1];
      if (adm.last_completed_at !== last) await repo.updateAdmission(adm.id, { last_completed_at: last });
    } else if (adm.last_completed_at) {
      // A dose is pending today (undone or newly added) → the case is due again.
      await repo.updateAdmission(adm.id, { last_completed_at: null });
    }
  } catch {
    /* board tint is best-effort — never block the dose action */
  }
}
