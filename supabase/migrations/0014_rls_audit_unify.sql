-- ============================================================================
-- doctorVet — 0014: RLS audit, unification & leak closure.
--
-- GOALS
--   1) Single source of truth for tenancy: auth_clinic(). Every clinic-scoped
--      table now uses the SAME rule —  clinic_id = auth_clinic()  — instead of
--      a mix of inlined auth.uid() and blanket is_clinic_staff() checks.
--   2) Close the two remaining cross-tenant LEAKS flagged in 0002/0006:
--        • appointments.appt_staff  → was: is_clinic_staff()  (any clinic, all rows)
--        • reminders.rem_staff      → was: is_clinic_staff()  (any clinic, all rows)
--      Both are now isolated by clinic_id like every other table.
--   3) Provide a safe, RLS-respecting one-call data export per clinic.
--
-- New columns added since 0006 (pets.owner_governorate/owner_area · 0011,
-- products.subcategory · 0012, medical_visits.patient_age_months · 0013) need
-- NO new policy: column data is already protected by their table's clinic
-- policy below. NOTE: "promotions" live in the browser (localStorage), not in
-- Postgres, so there is no promos table to secure here.
--
-- Idempotent. Apply AFTER 0001–0013 (Supabase → SQL Editor → Run).
-- ============================================================================

-- 0) TENANCY HELPER -----------------------------------------------------------
-- The clinic id for the current request. Today a clinic IS its own auth.users
-- row, so this is auth.uid(). When real staff sub-accounts arrive, change ONLY
-- this function (e.g. `select clinic_id from profiles where id = auth.uid()`)
-- and every policy below inherits the new rule automatically.
create or replace function auth_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select auth.uid();
$$;
grant execute on function auth_clinic() to authenticated, anon;

-- 1) UNIFY EVERY CLINIC-SCOPED TABLE TO  clinic_id = auth_clinic() ------------
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
-- (The owner-side policies — pets_owner, <child>_owner, adm_owner_read,
--  pets_shared_read — are unchanged: an owner still reaches their OWN pet's
--  records, and the universal-passport scan only exposes owner-shared pets.)

-- 2) APPOINTMENTS — close the leak ------------------------------------------
-- Old clinic_id referenced the unused clinics() table and was never populated.
-- Repoint it at auth.users and isolate by clinic.
alter table appointments drop column if exists clinic_id;
alter table appointments add column clinic_id uuid references auth.users(id) default auth.uid();
update appointments a
  set clinic_id = (select p.clinic_id from pets p where p.id = a.pet_id)
  where a.clinic_id is null;
create index if not exists appt_clinic_idx on appointments(clinic_id);

drop policy if exists appt_staff on appointments;
drop policy if exists appt_clinic_all on appointments;
create policy appt_clinic_all on appointments for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());
-- appt_owner (owner manages their own pet's appointments) from 0002 stays.

-- 3) REMINDERS — close the leak ---------------------------------------------
alter table reminders drop column if exists clinic_id;
alter table reminders add column clinic_id uuid references auth.users(id) default auth.uid();
-- Backfill clinic-scoped reminders (owner_id is null) from their pet's clinic.
update reminders r
  set clinic_id = (select p.clinic_id from pets p where p.id = r.pet_id)
  where r.clinic_id is null and r.owner_id is null and r.pet_id is not null;
create index if not exists rem_clinic_idx on reminders(clinic_id);

drop policy if exists rem_staff on reminders;
drop policy if exists rem_clinic_all on reminders;
create policy rem_clinic_all on reminders for all
  using (owner_id is null and clinic_id = auth_clinic())
  with check (owner_id is null and clinic_id = auth_clinic());
-- rem_owner (owner manages their own reminders) from 0002 stays.

-- 4) SAFE PER-CLINIC EXPORT --------------------------------------------------
-- One call returns ALL of the caller's clinic data as a single JSON document,
-- strictly scoped to auth_clinic() — a clinic can extract its own database
-- easily, and can NEVER read another clinic's rows.
--   SQL:  select export_clinic_data();
--   JS :  const { data } = await supabase.rpc('export_clinic_data');
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
-- 5) VERIFICATION — run these AFTER applying; each must return ZERO rows.
-- ----------------------------------------------------------------------------
-- (a) Any clinic-scoped table still missing RLS?
--   select relname from pg_class
--   where relname in ('pets','weight_logs','vaccinations','media_items',
--     'medical_visits','treatment_entries','admissions','products','invoices',
--     'invoice_items','appointments','reminders') and relrowsecurity = false;
--
-- (b) Any surviving blanket is_clinic_staff() policy (potential leak)?
--   select schemaname, tablename, policyname
--   from pg_policies
--   where (qual ilike '%is_clinic_staff%' or with_check ilike '%is_clinic_staff%')
--     and tablename in ('appointments','reminders');
--
-- (c) Orphan rows with no clinic owner (invisible / un-isolated)?
--   select 'pets' t, count(*) from pets where clinic_id is null and owner_id is null
--   union all select 'invoices', count(*) from invoices where clinic_id is null;
-- ============================================================================
