-- ============================================================================
-- doctorVet — 0022: fix medical_visits.clinic_id foreign key.
--
-- ROOT CAUSE of "Couldn't save — please try again." when saving an assessment:
-- medical_visits was the ONLY clinical table that defined
--   clinic_id uuid references clinics(id)
-- back in 0001. Migration 0006 repointed every other clinical table's clinic_id
-- at auth.users(id) using `add column if not exists`, which was a NO-OP for
-- medical_visits (the column already existed) — so its FK still references the
-- legacy `clinics` table. Meanwhile 0006/0014/0020 set the column DEFAULT to
-- auth.uid()/auth_clinic() (an auth.users id). Result: every INSERT into
-- medical_visits defaults clinic_id to an auth.users id that does NOT exist in
-- `clinics`, violating medical_visits_clinic_id_fkey and rejecting the row.
--
-- This repoints the FK at auth.users(id), exactly like admissions was fixed in
-- 0006. Additive, idempotent, no data loss. Apply AFTER 0001–0021.
-- ============================================================================

do $$
declare c text;
begin
  -- 1) Drop ANY foreign key currently on medical_visits.clinic_id (the legacy
  --    → clinics(id) one), regardless of its constraint name.
  for c in
    select con.conname
    from pg_constraint con
    join pg_attribute a
      on a.attrelid = con.conrelid and a.attnum = any(con.conkey)
    where con.conrelid = 'medical_visits'::regclass
      and con.contype = 'f'
      and a.attname = 'clinic_id'
  loop
    execute format('alter table medical_visits drop constraint %I', c);
  end loop;
end $$;

-- 2) Heal existing rows so the new FK validates: set clinic_id to the pet's
--    clinic (an auth.users id). Legacy clinics-table ids and NULLs are corrected;
--    rows whose pet has no clinic become NULL (allowed by the FK).
update medical_visits v
   set clinic_id = p.clinic_id
  from pets p
 where p.id = v.pet_id
   and v.clinic_id is distinct from p.clinic_id;

-- 3) Re-point at auth.users(id) and confirm the shared-workspace default, so
--    medical_visits matches every other clinical table.
alter table medical_visits
  add constraint medical_visits_clinic_id_fkey
  foreign key (clinic_id) references auth.users(id);

alter table medical_visits alter column clinic_id set default auth_clinic();

-- VERIFY (run as a clinic user): inserting a visit should now succeed and the
-- row's clinic_id should equal auth_clinic().
--   insert into medical_visits (pet_id, clinic_name, doctor_name, assessment)
--     values ('<some pet id of yours>', '', 'Dr', 'test') returning clinic_id;
