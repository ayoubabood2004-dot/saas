-- ============================================================================
-- doctorVet — 0068: opt-in UI font scaling (حجم الخط).
--
-- One boolean on clinic_prefs. Off by default: only clinics that flip it on in
-- Settings → حجم الخط get the size picker. The chosen size itself is a
-- per-device preference (localStorage) — small-laptop screens pick a size that
-- reads well THERE without affecting other devices; only the enable flag is
-- clinic-wide.
-- Additive + idempotent — safe on any existing database.
-- ============================================================================

alter table clinic_prefs
  add column if not exists font_scale_enabled boolean not null default false;
