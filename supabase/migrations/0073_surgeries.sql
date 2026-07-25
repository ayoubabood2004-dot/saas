-- ============================================================================
-- doctorVet — 0073: سجل العمليات الجراحية (Surgeries).
--
-- One clinic-isolated table: a surgery performed on a pet, recorded from
-- inside the case sheet (الطبلة). Carries the scientific detail an operative
-- note needs — procedure name (any language), approach, suture pattern /
-- material / size, anesthesia, duration, outcome, notes and an optional
-- follow-up date (suture removal / recheck). Shown in the case sheet, the
-- pet's record, and counted per-month in قسم الطبلات.
--
-- Additive + idempotent — safe on any existing database.
-- ============================================================================

create table if not exists surgeries (
  id              uuid primary key default gen_random_uuid(),
  clinic_id       uuid not null references auth.users(id) default auth_clinic(),
  pet_id          uuid not null references pets(id) on delete cascade,
  visit_id        uuid references clinic_visits(id) on delete set null,
  name            text not null,
  category        text,
  performed_at    timestamptz not null default now(),
  surgeon         text,
  anesthesia      text,
  duration_min    integer,
  outcome         text check (outcome is null or outcome in ('success','complications','critical')),
  approach        text,
  suture_pattern  text,
  suture_material text,
  suture_size     text,
  notes           text,
  followup_on     date,
  created_at      timestamptz not null default now()
);

create index if not exists surgeries_clinic_idx on surgeries(clinic_id, performed_at desc);
create index if not exists surgeries_pet_idx    on surgeries(pet_id, performed_at desc);

alter table surgeries enable row level security;
drop policy if exists surgeries_select on surgeries;
drop policy if exists surgeries_write  on surgeries;

create policy surgeries_select on surgeries
  for select using (clinic_id = auth_clinic());

-- Surgery notes are clinical records — vets and managers write them.
create policy surgeries_write on surgeries
  for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

drop trigger if exists audit_all on surgeries;
create trigger audit_all after insert or update or delete on surgeries
  for each row execute function audit_change();
