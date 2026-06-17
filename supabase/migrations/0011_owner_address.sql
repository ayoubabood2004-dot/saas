-- ============================================================================
-- doctorVet — 0011: hierarchical owner address (Governorate → Area).
-- Adds two nullable columns to `pets` so the New Case registration form can store
-- the local Iraqi address model captured by the dependent Governorate/Area
-- comboboxes. Apply AFTER 0001–0010. Safe to re-run.
-- ============================================================================

alter table pets add column if not exists owner_governorate text;
alter table pets add column if not exists owner_area text;
