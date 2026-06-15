-- ============================================================================
-- doctorVet — 0010: per-visit Patient Condition triage.
-- Adds a nullable `condition` column to medical_visits so the Medical Entry
-- workflow can record the doctor's assessment (excellent / good / critical)
-- alongside the clinical notes. Apply AFTER 0001–0009. Safe to re-run.
-- ============================================================================

alter table medical_visits add column if not exists condition text;

-- Validate the enum-like values (nullable allowed).
alter table medical_visits drop constraint if exists medical_visits_condition_chk;
alter table medical_visits add constraint medical_visits_condition_chk
  check (condition is null or condition in ('excellent', 'good', 'critical'));
