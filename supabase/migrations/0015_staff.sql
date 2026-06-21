-- ============================================================================
-- doctorVet — 0015: clinic staff (mini-HR) table, clinic-isolated.
-- Backs the Staff Management module. Isolated by the unified tenancy rule
-- clinic_id = auth_clinic() (see 0014). Creating the table touches no existing
-- data. Apply AFTER 0001–0014 (Supabase → SQL Editor → Run). Safe to re-run.
-- ============================================================================

create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth.uid(),
  name        text not null,
  email       text,
  phone       text,
  role        text not null default 'receptionist'
              check (role in ('manager','veterinarian','receptionist','groomer')),
  specialty   text,
  join_date   date default current_date,
  status      text not null default 'active'
              check (status in ('active','suspended')),
  bio         text,
  avatar      text,
  created_at  timestamptz not null default now()
);

create index if not exists staff_clinic_idx on staff(clinic_id);

alter table staff enable row level security;
drop policy if exists staff_clinic_all on staff;
create policy staff_clinic_all on staff for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());
