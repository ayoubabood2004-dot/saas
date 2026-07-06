-- ============================================================================
-- doctorVet — 0047: opt-in pre-sale (pro-forma) invoice printing.
--
-- One boolean on clinic_prefs. Off by default: only clinics that flip it on
-- in Settings → خيارات الكاشير see the "فاتورة أولية" print button in the POS.
-- Additive + idempotent — safe on any existing database.
-- ============================================================================

alter table clinic_prefs
  add column if not exists pre_sale_print boolean not null default false;
