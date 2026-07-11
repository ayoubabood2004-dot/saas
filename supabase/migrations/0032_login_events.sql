-- ============================================================================
-- doctorVet — 0032: staff login audit trail (for the Reports "سجل دخول المستخدمين").
--
-- A lightweight append-only log of successful sign-ins. clinic_id/user_id default
-- from the session so the client only sends email + display name. Clinic-isolated:
-- only the clinic's manager can read its own login trail. Additive & idempotent.
-- ============================================================================

create table if not exists login_events (
  id         bigint generated always as identity primary key,
  clinic_id  uuid not null default auth_clinic(),
  user_id    uuid default auth.uid(),
  email      text,
  name       text,
  created_at timestamptz not null default now()
);
create index if not exists login_events_clinic_idx on login_events (clinic_id, created_at desc);

alter table login_events enable row level security;

-- Any authenticated user may log their OWN sign-in (clinic_id/user_id are stamped
-- from the session by the column defaults; the check prevents forging another user).
drop policy if exists login_events_insert on login_events;
create policy login_events_insert on login_events
  for insert to authenticated with check (user_id = auth.uid());

-- Only the clinic's manager reads its login trail.
drop policy if exists login_events_read on login_events;
create policy login_events_read on login_events
  for select using (clinic_id = auth_clinic() and auth_role() = 'manager');
