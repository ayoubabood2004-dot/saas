-- ============================================================================
-- doctorVet — 0014: RLS audit, unification & leak closure — NON-DESTRUCTIVE.
--
-- This version removes NOTHING: no DROP COLUMN, no DROP TABLE, no DELETE.
-- It only: creates a helper function, enables RLS, replaces security policies,
-- drops the OLD foreign-key constraint on two never-populated columns (a
-- constraint is not data), sets defaults, fills empty values, and adds indexes.
-- Client data (pets, owners, invoices, visits…) is never touched.
--
-- Idempotent. Apply AFTER 0001–0013 (Supabase → SQL Editor → Run).
-- ============================================================================

-- 0) TENANCY HELPER — single source of truth for "which clinic am I?".
create or replace function auth_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select auth.uid();
$$;
grant execute on function auth_clinic() to authenticated, anon;

-- 1) UNIFY EVERY CLINIC-SCOPED TABLE TO  clinic_id = auth_clinic().
--    (Only replaces policies — no data is removed.)
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'pets','weight_logs','vaccinations','media_items','medical_visits',
    'treatment_entries','admissions','products','invoices','invoice_items'
  ]
  loop
    execute format('alter table %I enable row level security', tbl);
    execute format('drop policy if exists %1$s_clinic_all on %1$s', tbl);
    execute format(
      'create policy %1$s_clinic_all on %1$s for all
         using (clinic_id = auth_clinic())
         with check (clinic_id = auth_clinic())', tbl);
  end loop;
end $$;

-- 2) APPOINTMENTS & REMINDERS — close the cross-clinic leak WITHOUT dropping
--    the column. We only remove the old foreign-key (it pointed at the unused
--    `clinics` table) so the column can hold the clinic's auth id, then repoint
--    the default and fill any empty values from the pet's clinic.
do $$
declare t text; c text;
begin
  foreach t in array array['appointments','reminders']
  loop
    for c in
      select con.conname
      from pg_constraint con
      join pg_attribute a on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
      where con.conrelid = t::regclass and con.contype = 'f' and a.attname = 'clinic_id'
    loop
      execute format('alter table %I drop constraint %I', t, c);
    end loop;
    execute format('alter table %I alter column clinic_id set default auth.uid()', t);
    execute format(
      'update %1$s x set clinic_id = (select p.clinic_id from pets p where p.id = x.pet_id)
         where x.clinic_id is null and x.pet_id is not null', t);
    execute format('create index if not exists %1$s_clinic_idx on %1$s(clinic_id)', t);
  end loop;
end $$;

drop policy if exists appt_staff on appointments;
drop policy if exists appt_clinic_all on appointments;
create policy appt_clinic_all on appointments for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());
-- appt_owner (owner manages their own pet's appointments) from 0002 stays.

drop policy if exists rem_staff on reminders;
drop policy if exists rem_clinic_all on reminders;
create policy rem_clinic_all on reminders for all
  using (owner_id is null and clinic_id = auth_clinic())
  with check (owner_id is null and clinic_id = auth_clinic());
-- rem_owner (owner manages their own reminders) from 0002 stays.

-- 3) SAFE PER-CLINIC EXPORT — returns ONLY the caller's clinic data as JSON.
create or replace function export_clinic_data() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'clinic_id',    auth_clinic(),
    'exported_at',  now(),
    'pets',              coalesce((select jsonb_agg(to_jsonb(t)) from pets              t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'medical_visits',    coalesce((select jsonb_agg(to_jsonb(t)) from medical_visits    t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'vaccinations',      coalesce((select jsonb_agg(to_jsonb(t)) from vaccinations      t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'treatment_entries', coalesce((select jsonb_agg(to_jsonb(t)) from treatment_entries t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'weight_logs',       coalesce((select jsonb_agg(to_jsonb(t)) from weight_logs       t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'media_items',       coalesce((select jsonb_agg(to_jsonb(t)) from media_items       t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'admissions',        coalesce((select jsonb_agg(to_jsonb(t)) from admissions        t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'appointments',      coalesce((select jsonb_agg(to_jsonb(t)) from appointments      t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'reminders',         coalesce((select jsonb_agg(to_jsonb(t)) from reminders         t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'products',          coalesce((select jsonb_agg(to_jsonb(t)) from products          t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'invoices',          coalesce((select jsonb_agg(to_jsonb(t)) from invoices          t where t.clinic_id = auth_clinic()), '[]'::jsonb),
    'invoice_items',     coalesce((select jsonb_agg(to_jsonb(t)) from invoice_items     t where t.clinic_id = auth_clinic()), '[]'::jsonb)
  );
$$;
grant execute on function export_clinic_data() to authenticated;

-- ============================================================================
-- VERIFICATION (run after; each must return ZERO rows):
--   select tablename, policyname from pg_policies
--   where (qual ilike '%is_clinic_staff%' or with_check ilike '%is_clinic_staff%')
--     and tablename in ('appointments','reminders');
-- ============================================================================
