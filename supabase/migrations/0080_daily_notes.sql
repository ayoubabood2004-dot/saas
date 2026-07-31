-- 0080 — Sticky daily notes on the clinic dashboard.
-- One shared note pad per clinic per calendar day (the whole team reads/writes
-- the same note). Clinic-isolated by the unified clinic_id = auth_clinic() rule.

create table if not exists clinic_notes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  note_date   date not null,
  content     text not null default '',
  updated_by  text,
  updated_at  timestamptz not null default now(),
  unique (clinic_id, note_date)
);

create index if not exists clinic_notes_day_idx on clinic_notes(clinic_id, note_date);

alter table clinic_notes enable row level security;
drop policy if exists clinic_notes_all on clinic_notes;
create policy clinic_notes_all on clinic_notes for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());
