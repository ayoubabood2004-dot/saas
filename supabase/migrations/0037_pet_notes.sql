-- ============================================================================
-- doctorVet — 0037: clinical / progress notes (سجل الملاحظات السريرية).
--
-- A notebook-style free-text feed on the patient record. Each note auto-stamps
-- the clinic (RLS), the author, and the exact time. author_name is denormalized
-- so the timeline renders the staff name with no join. Clinic-isolated via the
-- standard clinic_id = auth_clinic() policy. Additive & idempotent. Apply AFTER 0036.
-- ============================================================================

create table if not exists pet_notes (
  id          uuid primary key default gen_random_uuid(),
  pet_id      uuid not null references pets(id) on delete cascade,
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  -- The acting user who wrote the note (accountability). No hard FK to staff so a
  -- note never fails to save when the author has no staff row yet.
  author_id   uuid default auth.uid(),
  author_name text,
  note_text   text not null,
  created_at  timestamptz not null default now()
);

create index if not exists pet_notes_pet_idx on pet_notes(pet_id, created_at desc);
create index if not exists pet_notes_clinic_idx on pet_notes(clinic_id);

alter table pet_notes enable row level security;
drop policy if exists pet_notes_clinic_all on pet_notes;
create policy pet_notes_clinic_all on pet_notes for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());
