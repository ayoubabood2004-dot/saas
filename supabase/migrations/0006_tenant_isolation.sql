-- ============================================================================
-- VetPassport — 0006: STRICT multi-tenant isolation by clinic_id.
--
-- Before this, RLS granted read access via a blanket is_clinic_staff() check, so
-- ANY clinic could read EVERY clinic's patients & records (cross-tenant leak).
--
-- Now: every clinical record carries clinic_id (= the clinic's auth.users id,
-- auto-stamped on insert via `default auth.uid()`), and a clinic can only
-- SELECT/INSERT/UPDATE/DELETE rows where clinic_id = auth.uid().
--   * Owners keep full access to their OWN pets' records (history travels with
--     the owner via the existing *_owner policies).
--   * The "universal passport" scan still works for OWNER-created pets only
--     (clinic_id IS NULL + shared_with_clinic), so a clinic's own walk-in
--     patients are NEVER exposed to other clinics.
--
-- Idempotent. Apply AFTER 0001–0005 (Supabase → SQL Editor → Run).
-- ============================================================================

-- 1) PETS --------------------------------------------------------------------
alter table pets add column if not exists clinic_id uuid references auth.users(id);
alter table pets alter column clinic_id set default auth.uid();

-- Backfill: clinic walk-ins were created with owner_id = the clinic's account.
update pets p set clinic_id = p.owner_id
where p.clinic_id is null
  and exists (
    select 1 from profiles pr
    where pr.id = p.owner_id
      and (pr.role <> 'owner' or 'clinic' = any(coalesce(pr.roles, '{}')))
  );
create index if not exists pets_clinic_idx on pets(clinic_id);

-- Drop the leaky blanket-staff read; add clinic-scoped access.
drop policy if exists pets_staff_read on pets;
drop policy if exists pets_staff_write on pets;
drop policy if exists pets_clinic_all on pets;
create policy pets_clinic_all on pets for all
  using (clinic_id = auth.uid())
  with check (clinic_id = auth.uid());

-- (pets_owner from 0001 stays: owners manage their own pets.)
-- Universal passport: a clinic may READ an OWNER-shared pet only. The
-- `clinic_id is null` guard means clinic walk-in patients are never exposed.
drop policy if exists pets_shared_read on pets;
create policy pets_shared_read on pets for select
  using (clinic_id is null and shared_with_clinic is true and is_clinic_staff());

-- 2) CLINICAL CHILD TABLES (clinic-created medical records) -------------------
do $$
declare tbl text;
begin
  foreach tbl in array array['weight_logs','vaccinations','media_items','medical_visits','treatment_entries']
  loop
    execute format('alter table %I add column if not exists clinic_id uuid references auth.users(id)', tbl);
    execute format('alter table %I alter column clinic_id set default auth.uid()', tbl);
    execute format('update %1$s c set clinic_id = (select p.clinic_id from pets p where p.id = c.pet_id) where c.clinic_id is null', tbl);
    execute format('create index if not exists %1$s_clinic_idx on %1$s(clinic_id)', tbl);

    -- remove the leaky blanket-staff policies
    execute format('drop policy if exists %1$s_staff_read on %1$s', tbl);
    execute format('drop policy if exists %1$s_staff_write on %1$s', tbl);

    -- clinic: full access to ITS OWN records only (the *_owner policy from 0001
    -- still gives the pet's owner access to their own pet's records).
    execute format('drop policy if exists %1$s_clinic_all on %1$s', tbl);
    execute format('create policy %1$s_clinic_all on %1$s for all using (clinic_id = auth.uid()) with check (clinic_id = auth.uid())', tbl);
  end loop;
end $$;

-- 3) ADMISSIONS (boarding / treatment cases) --------------------------------
-- 0002 gave admissions a clinic_id referencing clinics(id) that the app never
-- populates (always null). Repoint it at auth.users for tenant isolation.
alter table admissions drop column if exists clinic_id;
alter table admissions add column if not exists clinic_id uuid references auth.users(id);
alter table admissions alter column clinic_id set default auth.uid();
update admissions a set clinic_id = (select p.clinic_id from pets p where p.id = a.pet_id) where a.clinic_id is null;
create index if not exists adm_clinic_idx on admissions(clinic_id);

drop policy if exists adm_staff on admissions;
drop policy if exists admissions_clinic_all on admissions;
create policy admissions_clinic_all on admissions for all
  using (clinic_id = auth.uid())
  with check (clinic_id = auth.uid());
-- adm_owner_read (owner can read their pet's admissions) from 0002 stays.

-- Note: appointments & reminders are owner-centric (booked against a doctor, not
-- a clinic account) and are not clinic_id-scoped here — tighten in a follow-up
-- once the booking flow records a target clinic.
