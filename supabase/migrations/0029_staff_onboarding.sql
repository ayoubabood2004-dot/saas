-- ============================================================================
-- doctorVet — 0029: staff onboarding so invited teammates appear in the roster.
--
-- Problem: accept_invite() created a `memberships` row (access) but NEVER a
-- `staff` row, while Staff Management lists the `staff` table — so invited staff
-- could log in yet stayed invisible to the admin (and unmanageable).
--
-- Fix:
--  • staff.status gains a 'pending' state (invited, not yet joined).
--  • staff gains user_id (link to the auth user) + invite_code (link to the invite).
--  • A trigger mirrors every new invite into a PENDING staff row, so the invitee
--    shows in the dashboard the moment they're invited.
--  • accept_invite() promotes that row to 'active' (and stamps user_id) on first
--    login — or inserts a fresh active row for legacy invites.
--  • Revoking an invite removes its still-pending roster row.
-- Clinic-isolated by existing RLS; functions are SECURITY DEFINER. Idempotent.
-- ============================================================================

-- 1) Allow the new 'pending' status.
alter table staff drop constraint if exists staff_status_check;
alter table staff add constraint staff_status_check check (status in ('pending','active','suspended'));

-- 2) Link columns.
alter table staff add column if not exists user_id     uuid references auth.users(id);
alter table staff add column if not exists invite_code text;
create index if not exists staff_invite_code_idx on staff (invite_code);

-- 3) Mirror a pending roster row whenever a manager creates an invite.
create or replace function on_invite_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Skip if a row already exists for this exact invite (idempotent re-inserts).
  if exists (select 1 from staff where clinic_id = new.clinic_id and invite_code = new.code) then
    return new;
  end if;
  insert into staff (clinic_id, name, email, role, status, invite_code)
  values (
    new.clinic_id,
    coalesce(nullif(new.email, ''), 'دعوة ' || new.code),
    nullif(new.email, ''),
    new.role,
    'pending',
    new.code
  );
  return new;
end $$;

drop trigger if exists trg_invite_created on invites;
create trigger trg_invite_created after insert on invites
  for each row execute function on_invite_created();

-- 4) Drop the still-pending roster row when an invite is revoked.
create or replace function on_invite_revoked() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'revoked' and coalesce(old.status, '') <> 'revoked' then
    delete from staff
     where clinic_id = new.clinic_id and invite_code = new.code and status = 'pending';
  end if;
  return new;
end $$;

drop trigger if exists trg_invite_revoked on invites;
create trigger trg_invite_revoked after update on invites
  for each row execute function on_invite_revoked();

-- 5) accept_invite — same as 0026, plus it promotes the roster row to active.
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
     and ( (p_code is not null and upper(code) = upper(p_code))
        or (p_code is null and email is not null and lower(email) = v_email) )
   order by created_at desc
   limit 1;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_used');
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

  -- Promote the pending roster row to active (the invitee's own display name &
  -- email take over the placeholder); insert a fresh active row for legacy invites.
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
