-- ============================================================================
-- doctorVet — 0067: opt-in resizable POS cart (سلة قابلة لتغيير الحجم).
--
-- One boolean on clinic_prefs. Off by default: only clinics that flip it on in
-- Settings → خيارات الكاشير get the drag handle on the sale cart's edge. The
-- chosen width itself is a per-device preference (localStorage) — only the
-- enable flag is clinic-wide.
-- Additive + idempotent — safe on any existing database.
-- ============================================================================

alter table clinic_prefs
  add column if not exists resizable_cart boolean not null default false;
