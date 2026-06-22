-- ============================================================================
-- doctorVet — 0021: clinic configuration tables (normalized, multi-tenant).
--
-- Until now the clinic's CONFIG catalogues lived only in the browser's
-- localStorage, so they never synced across staff or devices and were lost on a
-- cache clear. This migrates them to Supabase as normalized per-catalog tables:
--   • clinic_service_categories / clinic_services  (billable services + prices)
--   • clinic_promos                                (mix & match promotions)
--   • clinic_breeds                                (custom breeds per species)
--   • clinic_meds                                  (clinic medication catalogue)
--   • clinic_vaccines                              (clinic vaccine catalogue)
--   • clinic_areas                                 (custom governorate → area)
--   • clinic_vital_ranges                          (clinic vital-range overrides)
--   • clinic_prefs                                 (default dial code, 1 row/clinic)
--   • pets.vital_ranges (jsonb)                    (per-animal range overrides)
--
-- Every table is multi-tenant: clinic_id DEFAULTS to auth_clinic() (the shared
-- workspace — managers AND their staff resolve to the same id) and RLS restricts
-- all access to  clinic_id = auth_clinic(). Additive & idempotent — no existing
-- data is touched. Apply AFTER 0001–0020 (Supabase → SQL Editor → Run).
-- ============================================================================

-- Helper: enable RLS + a single clinic-scoped "all" policy on a config table.
do $$
declare t text;
begin
  -- 1) SERVICE CATEGORIES -----------------------------------------------------
  create table if not exists clinic_service_categories (
    id         uuid primary key default gen_random_uuid(),
    clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    name       text not null,
    created_at timestamptz not null default now()
  );

  -- 2) SERVICES ---------------------------------------------------------------
  create table if not exists clinic_services (
    id          uuid primary key default gen_random_uuid(),
    clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    category_id uuid not null references clinic_service_categories(id) on delete cascade,
    name        text not null,
    price       numeric(12,2) not null default 0,
    created_at  timestamptz not null default now()
  );

  -- 3) PROMOTIONS -------------------------------------------------------------
  create table if not exists clinic_promos (
    id           uuid primary key default gen_random_uuid(),
    clinic_id    uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    name         text not null,
    subcategory  text not null,
    qty          integer not null default 1,
    bundle_price numeric(12,2) not null default 0,
    active       boolean not null default true,
    created_at   timestamptz not null default now()
  );

  -- 4) BREEDS -----------------------------------------------------------------
  create table if not exists clinic_breeds (
    id         uuid primary key default gen_random_uuid(),
    clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    species    text not null,
    name       text not null,
    created_at timestamptz not null default now()
  );

  -- 5) MEDICATIONS ------------------------------------------------------------
  create table if not exists clinic_meds (
    id         uuid primary key default gen_random_uuid(),
    clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    name       text not null,
    type       text not null default 'Other',
    created_at timestamptz not null default now()
  );

  -- 6) VACCINES ---------------------------------------------------------------
  create table if not exists clinic_vaccines (
    id         uuid primary key default gen_random_uuid(),
    clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    name       text not null,
    scientific text not null default '',
    created_at timestamptz not null default now()
  );

  -- 7) AREAS (custom governorate → area) --------------------------------------
  create table if not exists clinic_areas (
    id           uuid primary key default gen_random_uuid(),
    clinic_id    uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    governorate  text not null,
    area         text,                       -- null = a custom governorate with no area yet
    created_at   timestamptz not null default now()
  );

  -- 8) VITAL-RANGE OVERRIDES (clinic level) -----------------------------------
  create table if not exists clinic_vital_ranges (
    clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
    species    text not null,
    vital_key  text not null,
    min_val    numeric not null,
    max_val    numeric not null,
    primary key (clinic_id, species, vital_key)
  );

  -- 9) PREFERENCES (single row per clinic) ------------------------------------
  create table if not exists clinic_prefs (
    clinic_id  uuid primary key references auth.users(id) on delete cascade default auth_clinic(),
    dial_code  text not null default '+964',
    updated_at timestamptz not null default now()
  );

  -- Indexes + RLS for every clinic-scoped table.
  foreach t in array array[
    'clinic_service_categories','clinic_services','clinic_promos','clinic_breeds',
    'clinic_meds','clinic_vaccines','clinic_areas','clinic_vital_ranges','clinic_prefs'
  ] loop
    execute format('create index if not exists %1$s_clinic_idx on %1$s(clinic_id)', t);
    execute format('alter table %I enable row level security', t);
    execute format('alter table %I force row level security', t);
    execute format('drop policy if exists %1$s_clinic_all on %1$s', t);
    execute format(
      'create policy %1$s_clinic_all on %1$s for all
         using (clinic_id = auth_clinic())
         with check (clinic_id = auth_clinic())', t);
  end loop;
end $$;

-- 10) PER-PET vital-range overrides → a column on the pet row (clinic_id is the
--     pet's, so the existing pets RLS already isolates it). Replaces the old
--     global localStorage `vp_pet_ranges` (which leaked across clinics).
alter table pets add column if not exists vital_ranges jsonb not null default '{}'::jsonb;

-- ============================================================================
-- VERIFY (run as a clinic user): each returns only YOUR clinic's rows.
--   select count(*) from clinic_services;
--   select * from clinic_prefs;       -- one row, your dial code
-- ============================================================================
