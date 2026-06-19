-- ============================================================================
-- doctorVet — 0013: patient age snapshot on medical visits.
-- Adds a nullable `patient_age_months` column to `medical_visits` so each visit
-- records how old the patient was at that moment (computed from the pet's DOB).
-- Apply AFTER 0001–0012. Safe to re-run.
-- ============================================================================

alter table medical_visits add column if not exists patient_age_months integer;
