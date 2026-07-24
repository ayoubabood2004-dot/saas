-- ============================================================================
-- doctorVet — 0070: per-animal movement log (سجل حركات الحيوان).
--
-- An append-only event trail answering, with exact timestamps: when did the
-- animal ENTER the clinic, when did it LEAVE, and when did it MOVE between
-- sections (علاج يومي ⇄ فندقة ⇄ فندقة علاجية) or change cage.
--
-- Captured by a SERVER trigger on admissions, so every path that touches an
-- admission (new case, kanban drag on the Master calendar, discharge from the
-- records page, re-admission from the pet record) is logged atomically — no
-- client can forget to write the event. Rescheduling admitted_on (a date edit
-- on the month grid) is deliberately NOT a movement.
--
-- Additive + idempotent — safe on any existing database. Includes a one-time
-- backfill so existing admissions show their entry/exit history immediately.
-- ============================================================================

create table if not exists pet_movements (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null references auth.users(id) default auth_clinic(),
  pet_id       uuid not null,
  admission_id uuid,
  at           timestamptz not null default now(),
  event        text not null check (event in ('admitted','discharged','transferred','cage_changed')),
  from_kind    text,
  to_kind      text,
  from_cage    text,
  to_cage      text,
  created_at   timestamptz not null default now()
);

create index if not exists pet_movements_pet_idx on pet_movements(pet_id, at desc);
create index if not exists pet_movements_clinic_idx on pet_movements(clinic_id, at desc);

alter table pet_movements enable row level security;
drop policy if exists pet_movements_select on pet_movements;
create policy pet_movements_select on pet_movements
  for select using (clinic_id = auth_clinic());
-- No client INSERT/UPDATE/DELETE policies: rows are written ONLY by the
-- security-definer trigger below — the trail cannot be forged or edited.

create or replace function log_admission_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into pet_movements (clinic_id, pet_id, admission_id, event, to_kind, to_cage)
    values (new.clinic_id, new.pet_id, new.id, 'admitted', new.kind, new.cage);
  elsif tg_op = 'UPDATE' then
    -- Entry / exit transitions.
    if old.status = 'active' and new.status = 'discharged' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, from_kind)
      values (new.clinic_id, new.pet_id, new.id, 'discharged', new.kind);
    elsif old.status = 'discharged' and new.status = 'active' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, to_kind, to_cage)
      values (new.clinic_id, new.pet_id, new.id, 'admitted', new.kind, new.cage);
    end if;
    -- Section-to-section move (only meaningful while the stay is live).
    if new.kind is distinct from old.kind and new.status = 'active' and old.status = 'active' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, from_kind, to_kind)
      values (new.clinic_id, new.pet_id, new.id, 'transferred', old.kind, new.kind);
    end if;
    -- Cage move.
    if new.cage is distinct from old.cage and new.status = 'active' and old.status = 'active' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, from_cage, to_cage)
      values (new.clinic_id, new.pet_id, new.id, 'cage_changed', old.cage, new.cage);
    end if;
  end if;
  return new;
end $$;

drop trigger if exists movements_log on admissions;
create trigger movements_log after insert or update on admissions
  for each row execute function log_admission_movement();

-- ---------------------------------------------------------------------------
-- One-time backfill: existing admissions get their entry (and exit) events at
-- the recorded dates, so the per-animal history isn't empty on day one.
-- Idempotent: guarded by NOT EXISTS on (admission, event).
insert into pet_movements (clinic_id, pet_id, admission_id, at, event, to_kind, to_cage)
select a.clinic_id, a.pet_id, a.id, a.admitted_on::timestamptz, 'admitted', a.kind, a.cage
from admissions a
where not exists (select 1 from pet_movements m where m.admission_id = a.id and m.event = 'admitted');

insert into pet_movements (clinic_id, pet_id, admission_id, at, event, from_kind)
select a.clinic_id, a.pet_id, a.id, a.discharged_on::timestamptz, 'discharged', a.kind
from admissions a
where a.discharged_on is not null
  and not exists (select 1 from pet_movements m where m.admission_id = a.id and m.event = 'discharged');
