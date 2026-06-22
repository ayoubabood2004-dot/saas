-- ============================================================================
-- doctorVet — 0017: staff invites (email + code), with a safe accept RPC.
--
-- A manager creates an invite (by email or by a short code) carrying the role.
-- The new user accepts it via accept_invite(), a SECURITY DEFINER function that
-- creates their membership — so no service_role key or admin API is needed, and
-- a not-yet-member user can still redeem an invite without broad table access.
--
-- Additive & safe: new table + function only. Existing login/data untouched.
-- Apply AFTER 0001–0016. Idempotent.
-- ============================================================================

create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  email       text,                       -- optional (email invites)
  role        text not null default 'receptionist'
              check (role in ('manager','veterinarian','receptionist','groomer')),
  code        text not null unique default ('VET-' || upper(substr(md5(gen_random_uuid()::text), 1, 6))),
  status      text not null default 'pending' check (status in ('pending','accepted','revoked')),
  created_at  timestamptz not null default now(),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz
);
create index if not exists invites_clinic_idx on invites(clinic_id);
create index if not exists invites_code_idx on invites(code);

-- RLS: only a clinic's manager manages that clinic's invites.
alter table invites enable row level security;
drop policy if exists invites_manager_all on invites;
create policy invites_manager_all on invites for all
  using (clinic_id = auth_clinic() and auth_role() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role() = 'manager');

-- Redeem an invite by code (or by the caller's email if no code given).
-- Creates the membership for the current user and marks the invite accepted.
create or replace function accept_invite(p_code text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv   invites;
  v_email text := lower(coalesce((select email from auth.users where id = auth.uid()), ''));
  v_name  text;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_inv from invites
   where status = 'pending'
     and ( (p_code is not null and upper(code) = upper(p_code))
        or (p_code is null and email is not null and lower(email) = v_email) )
   order by created_at desc
   limit 1;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_used');
  end if;

  insert into memberships (user_id, clinic_id, role, status)
  values (auth.uid(), v_inv.clinic_id, v_inv.role, 'active')
  on conflict (user_id, clinic_id)
    do update set role = excluded.role, status = 'active';

  update invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;

  select coalesce(name, email) into v_name from profiles where id = v_inv.clinic_id;

  return jsonb_build_object('ok', true, 'clinic_id', v_inv.clinic_id, 'role', v_inv.role, 'clinic_name', v_name);
end $$;

grant execute on function accept_invite(text) to authenticated;
