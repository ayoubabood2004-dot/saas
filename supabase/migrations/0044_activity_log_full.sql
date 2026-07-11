-- ============================================================================
-- doctorVet — 0044: FULL clinic activity log (سجل الحركات) + 30-day retention.
--
-- Builds on 0018 (audit_log table + defensive audit_change() trigger + the
-- manager-only read policy). This migration:
--   1. Attaches the audit trigger to EVERY clinical/financial/operational
--      table for INSERT + UPDATE + DELETE — so the manager sees every action:
--      who added a pet, gave a dose, recorded a vaccine, made/updated a sale,
--      changed stock, uploaded an X-ray, moved a case, added a reminder…
--   2. Adds purge_activity_log(): deletes the calling clinic's rows older
--      than 30 days. The app calls it (fire-and-forget) whenever the manager
--      opens the log page — the trail stays one month deep, no cron needed.
--
-- Additive & idempotent. The trigger swallows its own errors (see 0018), so
-- logging can NEVER block or slow a real operation. Apply AFTER 0001–0043.
-- ============================================================================

-- 1) Full coverage: every operation on the day-to-day tables.
do $$
declare t text;
begin
  foreach t in array array[
    'pets', 'admissions', 'treatment_entries', 'vaccinations', 'medical_visits',
    'invoices', 'products', 'media_items', 'pet_notes', 'branches',
    'reminders', 'appointments', 'weight_logs'
  ] loop
    if to_regclass(t) is not null then
      -- Upgrade any delete-only trigger from 0018 to full coverage.
      execute format('drop trigger if exists audit_del on %I', t);
      execute format('drop trigger if exists audit_all on %I', t);
      execute format('create trigger audit_all after insert or update or delete on %I for each row execute function audit_change()', t);
    end if;
  end loop;
end $$;

-- 2) Retention: keep one month, drop the rest — scoped to the caller's clinic.
create or replace function purge_activity_log() returns void
language sql security definer set search_path = public as $$
  delete from audit_log
  where clinic_id = auth_clinic()
    and created_at < now() - interval '30 days';
$$;
revoke all on function purge_activity_log() from public;
grant execute on function purge_activity_log() to authenticated;
