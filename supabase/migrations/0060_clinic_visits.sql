-- ============================================================================
-- 0060 — Clinic Visits (الزيارات)
-- A self-contained encounter opened each time the pet comes to the clinic.
-- Routine visits (checkup/grooming/…) are quick; an "illness" visit carries the
-- full clinical workspace and a day-by-day treatment plan. Notes and treatment
-- rows created during a visit link back to it via visit_id (additive, nullable
-- — nothing existing changes).
-- ============================================================================

create table if not exists clinic_visits (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references pets(id) on delete cascade,
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  kind        text not null default 'illness'
              check (kind in ('illness','checkup','grooming','vaccination','followup','other')),
  reason      text,
  status      text not null default 'open' check (status in ('open','ended')),
  condition   text,                       -- CaseOutcome id at intake
  opened_at   timestamptz not null default now(),
  ended_at    timestamptz,
  opened_by   text,
  ended_by    text,
  outcome     text,                       -- CaseOutcome id on end
  summary     text,                       -- closing note
  created_at  timestamptz not null default now()
);

create index if not exists clinic_visits_pet_idx on clinic_visits(pet_id, opened_at desc);
create index if not exists clinic_visits_clinic_idx on clinic_visits(clinic_id);

alter table clinic_visits enable row level security;
drop policy if exists clinic_visits_clinic_all on clinic_visits;
create policy clinic_visits_clinic_all on clinic_visits for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- Link notes + treatment-sheet rows to their visit.
alter table pet_notes        add column if not exists visit_id uuid references clinic_visits(id) on delete set null;
alter table treatment_entries add column if not exists visit_id uuid references clinic_visits(id) on delete set null;
alter table treatment_entries add column if not exists edited boolean not null default false;

create index if not exists pet_notes_visit_idx on pet_notes(visit_id);
create index if not exists treatment_entries_visit_idx on treatment_entries(visit_id);
