-- ============================================================================
-- doctorVet — 0023: WhatsApp campaign send log.
--
-- Records every WhatsApp message the clinic prepares/sends from the Campaigns
-- page, so the team has a shared contact history ("last contacted" per client)
-- and the ephemeral in-page "sent" state is no longer lost on refresh.
-- Multi-tenant: clinic_id DEFAULTs to auth_clinic() and RLS restricts every row
-- to the caller's clinic. Additive & idempotent. Apply AFTER 0001–0022.
-- ============================================================================

create table if not exists wa_messages (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  pet_id        uuid references pets(id) on delete set null,
  owner_name    text,
  owner_phone   text,
  reminder_type text,                 -- 'birthday' | 'vaccine' | 'deworming' | 'manual'…
  sent_by       uuid default auth.uid(),
  sent_at       timestamptz not null default now()
);

create index if not exists wa_messages_clinic_idx on wa_messages(clinic_id);
create index if not exists wa_messages_pet_idx     on wa_messages(pet_id);
create index if not exists wa_messages_phone_idx   on wa_messages(owner_phone);

alter table wa_messages enable row level security;
alter table wa_messages force row level security;
drop policy if exists wa_messages_clinic_all on wa_messages;
create policy wa_messages_clinic_all on wa_messages for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- VERIFY (run as a clinic user): returns only YOUR clinic's send history.
--   select pet_id, owner_phone, reminder_type, sent_at from wa_messages order by sent_at desc;
