-- VetPassport — 0002: sync the database with the current app data model.
-- Adds appointments / admissions / reminders tables, the newer pet & treatment
-- columns, and Row-Level-Security for the new tables.
-- Idempotent — safe to run more than once. Apply AFTER 0001_init.sql
-- (Supabase Dashboard → SQL Editor → paste → Run).

-- New enums -----------------------------------------------------------------
do $$ begin create type admission_kind as enum ('treatment','boarding');
exception when duplicate_object then null; end $$;

do $$ begin create type admission_status as enum ('active','discharged');
exception when duplicate_object then null; end $$;

do $$ begin create type service_type as enum ('consultation','vaccination','surgery','telehealth','home');
exception when duplicate_object then null; end $$;

do $$ begin create type appointment_status as enum ('requested','confirmed','checked_in','in_room','done','cancelled');
exception when duplicate_object then null; end $$;

do $$ begin create type event_category as enum
  ('appointment','medication','vaccine','recheck','grooming','feeding','boarding','reminder');
exception when duplicate_object then null; end $$;

-- Pets: columns added since 0001 -------------------------------------------
alter table pets add column if not exists serial text;
alter table pets add column if not exists shared_with_clinic boolean not null default true;
alter table pets add column if not exists owner_name text;
alter table pets add column if not exists owner_phone text;
alter table pets add column if not exists owner_email text;
alter table pets add column if not exists distinctive_markings text;
alter table pets add column if not exists adopted_on date;
alter table pets add column if not exists neuter_status text default 'unknown';
alter table pets add column if not exists contacts jsonb not null default '[]'::jsonb;
alter table pets add column if not exists diet jsonb;
create unique index if not exists pets_serial_idx on pets(serial) where serial is not null;

-- Treatment entries: flowsheet "given" fields ------------------------------
alter table treatment_entries add column if not exists administered_at timestamptz;
alter table treatment_entries add column if not exists administered_by text;

-- Appointments --------------------------------------------------------------
create table if not exists appointments (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  owner_id uuid references profiles(id) on delete set null,
  clinic_id uuid references clinics(id),
  doctor_id text,
  doctor_name text not null,
  service service_type not null default 'consultation',
  status appointment_status not null default 'requested',
  scheduled_at timestamptz not null,
  duration_min int not null default 20,
  symptoms text,
  checkin_weight_kg numeric(6,2),
  triage_score int,
  created_at timestamptz not null default now()
);
create index if not exists appt_pet_idx on appointments(pet_id);
create index if not exists appt_owner_idx on appointments(owner_id);
create index if not exists appt_sched_idx on appointments(scheduled_at);

-- Admissions (boarding / continued-treatment cases) ------------------------
create table if not exists admissions (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  clinic_id uuid references clinics(id),
  kind admission_kind not null,
  status admission_status not null default 'active',
  admitted_on date not null default current_date,
  discharged_on date,
  reason text,
  cage text,
  cycle_hours int default 24,
  last_completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists adm_pet_idx on admissions(pet_id);

-- Reminders (unified events feed) ------------------------------------------
create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references profiles(id) on delete cascade,  -- null = clinic-scoped
  clinic_id uuid references clinics(id),
  pet_id uuid references pets(id) on delete cascade,
  pet_name text,
  category event_category not null default 'reminder',
  title text not null,
  date date not null,
  time text,
  recurring text default 'none',
  enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists rem_owner_idx on reminders(owner_id);

-- Row-Level Security for the new tables ------------------------------------
alter table appointments enable row level security;
alter table admissions  enable row level security;
alter table reminders   enable row level security;

-- Appointments: an owner sees their own; clinic staff manage all.
drop policy if exists appt_owner on appointments;
create policy appt_owner on appointments for all
  using (owner_id = auth.uid()
         or exists (select 1 from pets p where p.id = appointments.pet_id and p.owner_id = auth.uid()))
  with check (owner_id = auth.uid()
         or exists (select 1 from pets p where p.id = appointments.pet_id and p.owner_id = auth.uid()));
drop policy if exists appt_staff on appointments;
create policy appt_staff on appointments for all
  using (is_clinic_staff()) with check (is_clinic_staff());

-- Admissions: clinic staff manage; an owner can read their pet's.
drop policy if exists adm_staff on admissions;
create policy adm_staff on admissions for all
  using (is_clinic_staff()) with check (is_clinic_staff());
drop policy if exists adm_owner_read on admissions;
create policy adm_owner_read on admissions for select
  using (exists (select 1 from pets p where p.id = admissions.pet_id and p.owner_id = auth.uid()));

-- Reminders: owners manage their own; staff manage clinic-scoped ones.
drop policy if exists rem_owner on reminders;
create policy rem_owner on reminders for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists rem_staff on reminders;
create policy rem_staff on reminders for all
  using (is_clinic_staff() and owner_id is null)
  with check (is_clinic_staff() and owner_id is null);

-- NOTE: the staff policies above let ANY clinic staff touch ANY clinic's rows.
-- For strict multi-clinic isolation, tighten them later to compare clinic_id
-- against (select clinic_id from profiles where id = auth.uid()).
