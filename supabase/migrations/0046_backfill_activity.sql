-- ============================================================================
-- doctorVet — 0046: BACKFILL the activity log from existing data (last 30 days).
--
-- The triggers (0018/0044/0045) only record from the moment they're installed.
-- This one-off reconstructs the "added X" trail for the previous month from the
-- rows that already exist — every table carries its creation timestamp.
--
-- What it can recover:  INSERT-type events, at their true time, incl. invoice
--                       line items (joined through their invoice's date).
-- What it can't:        old edits/deletes and old prints/exports (left no
--                       trace), and usually WHO did it (actor stays null; the
--                       UI falls back to the row's cashier/doctor name).
--
-- Idempotent: each block skips rows already present in audit_log, and any
-- missing table/column aborts just its own block silently. Safe to re-run.
-- ============================================================================

-- Simple tables: clinic_id + id + created_at.
do $$
declare t text;
begin
  foreach t in array array[
    'pets', 'admissions', 'treatment_entries', 'vaccinations', 'medical_visits',
    'invoices', 'products', 'media_items', 'pet_notes', 'reminders',
    'appointments', 'weight_logs', 'branches'
  ] loop
    if to_regclass(t) is null then continue; end if;
    begin
      execute format($f$
        insert into audit_log (clinic_id, actor, action, entity, entity_id, details, created_at)
        select s.clinic_id, null, 'INSERT', %L, s.id::text, to_jsonb(s.*), s.created_at
        from %I s
        where s.created_at >= now() - interval '30 days'
          and not exists (
            select 1 from audit_log a
            where a.entity = %L and a.action = 'INSERT' and a.entity_id = s.id::text
          )
      $f$, t, t, t);
    exception when others then null; -- table shape differs → skip it, keep going
    end;
  end loop;
end $$;

-- Invoice line items: no own timestamp — take the invoice's.
do $$ begin
  insert into audit_log (clinic_id, actor, action, entity, entity_id, details, created_at)
  select it.clinic_id, null, 'INSERT', 'invoice_items', it.id::text, to_jsonb(it.*), i.created_at
  from invoice_items it
  join invoices i on i.id = it.invoice_id
  where i.created_at >= now() - interval '30 days'
    and not exists (
      select 1 from audit_log a
      where a.entity = 'invoice_items' and a.action = 'INSERT' and a.entity_id = it.id::text
    );
exception when others then null;
end $$;

-- WhatsApp sends: timestamped by sent_at.
do $$ begin
  insert into audit_log (clinic_id, actor, action, entity, entity_id, details, created_at)
  select w.clinic_id, null, 'INSERT', 'wa_messages', w.id::text, to_jsonb(w.*), w.sent_at
  from wa_messages w
  where w.sent_at >= now() - interval '30 days'
    and not exists (
      select 1 from audit_log a
      where a.entity = 'wa_messages' and a.action = 'INSERT' and a.entity_id = w.id::text
    );
exception when others then null;
end $$;
