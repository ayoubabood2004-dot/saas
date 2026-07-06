-- ============================================================================
-- doctorVet — 0050: Security hardening — Phase 3.
--
-- Closes the two serious issues the deep review found that 0049 did not cover:
--
--  A) INVITE-CODE ENUMERATION → cross-tenant takeover. Invite codes were
--     'VET-' + 6 hex chars (~24 bits) with NO expiry and NO throttle. A fresh
--     attacker account (which owns no clinic, so it passes the owner-guard)
--     could brute-force the pending-invite pool and join any clinic — as
--     manager if it guessed a manager invite. Fix: 128-bit codes for new
--     invites + a 72h expiry enforced in accept_invite + expire the legacy
--     short-code pending invites quickly.
--
--  B) ELEVATION → PERMANENT SELF-PROMOTION. auth_role() reports 'manager'
--     during a 10-minute PIN elevation, and 0049's memberships write policy +
--     the staff roster policy were gated on auth_role(). So an elevated
--     receptionist could rewrite their OWN membership/staff role to manager and
--     keep it after the elevation expired. Fix: gate the role-defining writes
--     (memberships, staff) on auth_role_BASE() — the REAL role — so a temporary
--     elevation can view manager screens but can never make itself permanent.
--
-- Additive, idempotent, behaviour-preserving for the app.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) Invites: widen the code, add an expiry, enforce it on redeem.
-- ---------------------------------------------------------------------------
alter table invites
  add column if not exists expires_at timestamptz not null default (now() + interval '72 hours');

-- New codes: full 128-bit random token (was ~24 bits) → enumeration infeasible.
alter table invites
  alter column code set default ('VET-' || upper(replace(gen_random_uuid()::text, '-', '')));

-- Legacy short-code invites still pending: give real invitees a short window,
-- then they auto-expire (caps the brute-force window on the old 24-bit codes).
update invites
  set expires_at = now() + interval '24 hours'
  where status = 'pending' and expires_at > now() + interval '24 hours';

-- Re-create accept_invite with the SAME body plus an expiry filter on the match.
create or replace function accept_invite(p_code text default null, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv      invites;
  v_email    text := lower(coalesce((select email from auth.users where id = auth.uid()), ''));
  v_name     text;
  v_pname    text;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  select * into v_inv from invites
   where status = 'pending'
     and (expires_at is null or expires_at > now())      -- 🔒 expiry enforced
     and ( (p_code is not null and upper(code) = upper(p_code))
        or (p_code is null and email is not null and lower(email) = v_email) )
   order by created_at desc
   limit 1;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_used');
  end if;

  if v_inv.email is not null and v_inv.email <> '' and lower(v_inv.email) <> v_email then
    return jsonb_build_object('ok', false, 'error', 'email_mismatch');
  end if;

  select coalesce(full_name, email) into v_name from profiles where id = v_inv.clinic_id;

  v_is_owner := v_inv.clinic_id <> auth.uid() and (
       exists (select 1 from memberships where user_id = auth.uid() and clinic_id = auth.uid())
       or exists (select 1 from pets where clinic_id = auth.uid())
     );

  if v_is_owner and not coalesce(p_confirm, false) then
    return jsonb_build_object('ok', false, 'error', 'confirm_owner_join', 'clinic_name', v_name);
  end if;

  insert into memberships (user_id, clinic_id, role, status)
  values (auth.uid(), v_inv.clinic_id, v_inv.role, 'active')
  on conflict (user_id, clinic_id)
    do update set role = excluded.role, status = 'active';

  update invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;

  v_pname := (select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid());
  update staff
     set status    = 'active',
         user_id   = auth.uid(),
         email     = coalesce(nullif(email, ''), nullif(v_email, '')),
         name      = coalesce(nullif(v_pname, ''), nullif(email, ''), name),
         join_date = coalesce(join_date, current_date)
   where clinic_id = v_inv.clinic_id and invite_code = v_inv.code;

  if not found then
    insert into staff (clinic_id, user_id, name, email, role, status, invite_code, join_date)
    values (v_inv.clinic_id, auth.uid(),
            coalesce(nullif(v_pname, ''), nullif(v_email, ''), 'موظف'),
            nullif(v_email, ''), v_inv.role, 'active', v_inv.code, current_date);
  end if;

  return jsonb_build_object('ok', true, 'clinic_id', v_inv.clinic_id, 'role', v_inv.role, 'clinic_name', v_name);
end $$;

grant execute on function accept_invite(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- B) Freeze the role-defining tables to the REAL manager role, not the
--    elevation-aware one — so a 10-minute PIN elevation can never write itself
--    a permanent manager role.
-- ---------------------------------------------------------------------------

-- memberships: was gated on auth_role() (true during elevation). Re-gate on base.
drop policy if exists memberships_manager_update on memberships;
drop policy if exists memberships_manager_delete on memberships;

create policy memberships_manager_update on memberships
  for update
  using      (clinic_id = auth_clinic() and auth_role_base() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role_base() = 'manager');

create policy memberships_manager_delete on memberships
  for delete
  using (clinic_id = auth_clinic() and auth_role_base() = 'manager');

-- invites: creating/managing invites also defines who gets in — real managers only.
drop policy if exists invites_manager_all on invites;
create policy invites_manager_all on invites for all
  using      (clinic_id = auth_clinic() and auth_role_base() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role_base() = 'manager');

-- staff roster: any member may READ it (cashier pickers, doctor lists), but only
-- a REAL manager may INSERT/UPDATE/DELETE — this closes the "receptionist sets
-- their own staff.role='manager' to unlock the manager UI" path too. Legit joins
-- write staff via the SECURITY DEFINER accept_invite (which bypasses RLS).
drop policy if exists staff_clinic_all on staff;
drop policy if exists staff_select on staff;
drop policy if exists staff_manager_write on staff;

create policy staff_select on staff
  for select using (clinic_id = auth_clinic());

create policy staff_manager_insert on staff
  for insert with check (clinic_id = auth_clinic() and auth_role_base() = 'manager');

create policy staff_manager_update on staff
  for update
  using      (clinic_id = auth_clinic() and auth_role_base() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role_base() = 'manager');

create policy staff_manager_delete on staff
  for delete using (clinic_id = auth_clinic() and auth_role_base() = 'manager');
