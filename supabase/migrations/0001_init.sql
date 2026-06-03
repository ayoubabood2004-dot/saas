-- VetPassport — initial schema (Pet Digital Passport + portable QR chart)
-- Apply with the Supabase CLI or the apply_migration tool once a project exists.

create extension if not exists "pgcrypto";

-- Roles ---------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('owner','doctor','reception','admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type species as enum ('dog','cat','horse','cow','bird','rabbit','other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type sex as enum ('male','female','unknown');
exception when duplicate_object then null; end $$;

do $$ begin
  create type vax_status as enum ('administered','scheduled','overdue');
exception when duplicate_object then null; end $$;

do $$ begin
  create type media_kind as enum ('photo','xray','ultrasound','lab','document');
exception when duplicate_object then null; end $$;

-- Clinics -------------------------------------------------------------------
create table if not exists clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  city text,
  phone text,
  -- Clinics that hold this key may decrypt/scan universal passports.
  subscribed boolean not null default true,
  created_at timestamptz not null default now()
);

-- Profiles (1:1 with auth.users) --------------------------------------------
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  email text not null,
  role user_role not null default 'owner',
  phone text,
  clinic_id uuid references clinics(id),
  created_at timestamptz not null default now()
);

-- Pets ----------------------------------------------------------------------
create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  species species not null default 'dog',
  breed text,
  sex sex not null default 'unknown',
  dob date,
  microchip_id text,
  color text,
  photo_url text,
  current_weight_kg numeric(6,2),
  nutrition_profile text,
  allergies text[] default '{}',
  -- Portable identity encoded in the QR; unique and shareable across clinics.
  passport_token text not null unique default ('PET-' || upper(substr(replace(gen_random_uuid()::text,'-',''),1,10))),
  created_at timestamptz not null default now()
);
create index if not exists pets_owner_idx on pets(owner_id);
create index if not exists pets_token_idx on pets(passport_token);

-- Weight logs ---------------------------------------------------------------
create table if not exists weight_logs (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  weight_kg numeric(6,2) not null,
  measured_at date not null default current_date
);
create index if not exists weight_pet_idx on weight_logs(pet_id);

-- Vaccinations --------------------------------------------------------------
create table if not exists vaccinations (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  name text not null,
  status vax_status not null default 'scheduled',
  due_date date,
  administered_at date,
  dose_number int default 1,
  doses_total int default 1,
  lot_number text,
  administered_by text,
  notes text
);
create index if not exists vax_pet_idx on vaccinations(pet_id);

-- Media vault ---------------------------------------------------------------
create table if not exists media_items (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  kind media_kind not null default 'photo',
  url text not null,
  caption text,
  created_at timestamptz not null default now()
);
create index if not exists media_pet_idx on media_items(pet_id);

-- Medical visits (SOAP) -----------------------------------------------------
create table if not exists medical_visits (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  clinic_id uuid references clinics(id),
  clinic_name text not null,
  doctor_name text not null,
  visit_date date not null default current_date,
  subjective text,
  objective text,
  assessment text not null,
  plan text,
  treatments text[] default '{}',
  notes text,
  created_at timestamptz not null default now()
);
create index if not exists visits_pet_idx on medical_visits(pet_id);

-- Treatment sheet (multi-day / inpatient continued treatment) -----------------
create table if not exists treatment_entries (
  id uuid primary key default gen_random_uuid(),
  pet_id uuid not null references pets(id) on delete cascade,
  day date not null default current_date,
  doctor text,                 -- doctor treating the patient that day
  medication text not null,    -- type of medication
  time text not null,          -- time of administration, e.g. '08:00'
  amount text not null,        -- dose / quantity
  observations text,           -- daily note on the animal's condition
  created_at timestamptz not null default now()
);
create index if not exists treatment_pet_idx on treatment_entries(pet_id);

-- Row Level Security --------------------------------------------------------
alter table profiles enable row level security;
alter table pets enable row level security;
alter table weight_logs enable row level security;
alter table vaccinations enable row level security;
alter table media_items enable row level security;
alter table medical_visits enable row level security;
alter table treatment_entries enable row level security;

-- Helper: is the current user clinic staff?
create or replace function is_clinic_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from profiles p
    where p.id = auth.uid() and p.role in ('doctor','reception','admin')
  );
$$;

-- Profiles: a user manages only their own profile.
drop policy if exists profiles_self on profiles;
create policy profiles_self on profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- Pets: owners manage their pets; clinic staff can read any pet
-- (the universal passport — continuity of care across clinics).
drop policy if exists pets_owner on pets;
create policy pets_owner on pets
  for all using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists pets_staff_read on pets;
create policy pets_staff_read on pets
  for select using (is_clinic_staff());

-- Child records inherit pet visibility.
-- Owners: full access to their pet's records. Staff: read + insert (clinical work).
do $$
declare tbl text;
begin
  foreach tbl in array array['weight_logs','vaccinations','media_items','medical_visits','treatment_entries']
  loop
    execute format('drop policy if exists %1$s_owner on %1$s;', tbl);
    execute format($f$
      create policy %1$s_owner on %1$s for all
        using (exists (select 1 from pets p where p.id = %1$s.pet_id and p.owner_id = auth.uid()))
        with check (exists (select 1 from pets p where p.id = %1$s.pet_id and p.owner_id = auth.uid()));
    $f$, tbl);

    execute format('drop policy if exists %1$s_staff_read on %1$s;', tbl);
    execute format('create policy %1$s_staff_read on %1$s for select using (is_clinic_staff());', tbl);

    execute format('drop policy if exists %1$s_staff_write on %1$s;', tbl);
    execute format('create policy %1$s_staff_write on %1$s for insert with check (is_clinic_staff());', tbl);
  end loop;
end $$;

-- Auto-create a profile row when a new auth user signs up.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'owner')
  )
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
