-- ============================================================================
-- doctorVet — 0045: activity log covers EVERYTHING (التفاصيل المملة).
--
-- Extends 0044 with:
--   1. Triggers on the remaining tables: invoice line items (what exactly was
--      sold, item by item), WhatsApp sends, the clinic row (identity/settings)
--      and every clinic_* configuration table (services, promos, custom meds &
--      vaccines, breeds, areas, vital ranges, prefs).
--   2. log_client_event(): lets the app record meaningful CLIENT-side actions
--      that never touch a table — printing an invoice or a report, exporting
--      Excel/CSV, printing a consent form. SECURITY DEFINER inserts into
--      audit_log directly (clients still have no direct INSERT — rows can't
--      be forged with arbitrary entity/actor values).
--
-- Additive & idempotent; the trigger never blocks real writes (see 0018).
-- Apply AFTER 0044.
-- ============================================================================

-- 1) Remaining tables → full coverage.
do $$
declare t text;
begin
  foreach t in array array[
    'invoice_items', 'wa_messages', 'clinics',
    'clinic_service_categories', 'clinic_services', 'clinic_promos',
    'clinic_meds', 'clinic_vaccines', 'clinic_breeds', 'clinic_areas',
    'clinic_vital_ranges', 'clinic_prefs'
  ] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists audit_all on %I', t);
      execute format('create trigger audit_all after insert or update or delete on %I for each row execute function audit_change()', t);
    end if;
  end loop;
end $$;

-- 2) Client-side events (prints/exports) — constrained, non-forgeable shape.
create or replace function log_client_event(p_event text, p_details jsonb default '{}'::jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth_clinic() is null then return; end if; -- clinic staff only
  insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
  values (
    auth_clinic(), auth.uid(), 'CLIENT', 'client', null,
    coalesce(p_details, '{}'::jsonb) || jsonb_build_object('event', left(coalesce(p_event, ''), 64))
  );
exception when others then
  null; -- best-effort: a failed log must never surface to the user
end $$;
revoke all on function log_client_event(text, jsonb) from public;
grant execute on function log_client_event(text, jsonb) to authenticated;
