-- ============================================================================
-- doctorVet — 0024: granular per-staff permission overrides.
--
-- Adds a `permissions` JSONB column to the staff table so a clinic admin can
-- grant/revoke individual capabilities on top of the base role, e.g.
--   { "viewProfits": false, "deleteInvoices": false, "addPets": true }
-- An empty object ({}) means "use the base-role preset" (no overrides). The
-- usePermissions hook resolves the live user's overrides by email match. The
-- column is clinic-isolated by the existing staff RLS (clinic_id = auth_clinic()).
-- Additive, idempotent. Apply AFTER 0001–0023.
-- ============================================================================

alter table staff
  add column if not exists permissions jsonb not null default '{}'::jsonb;

-- VERIFY (as a clinic user): your team rows, with any custom permission overrides.
--   select name, role, permissions from staff order by created_at;
