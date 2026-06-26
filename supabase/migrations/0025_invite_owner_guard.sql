-- ============================================================================
-- doctorVet — 0025: protect clinic owners from accidentally joining another clinic.
--
-- PROBLEM: accept_invite() blindly created a membership. Because auth_clinic()
-- prefers an *invited* clinic over your own, a clinic OWNER who clicked another
-- clinic's invite link would have their active workspace switch to that clinic:
-- their own data would VANISH from view (RLS hides it — it is NOT deleted) and
-- new records would be stamped with the other clinic's id. This was fully
-- recoverable but alarming and dangerous.
--
-- FIX:
--   1) Guard accept_invite — refuse if the caller already owns a clinic (has a
--      self-membership or any data under their own id). Their data stays put.
--   2) leave_clinic() — remove the caller's membership in another clinic, so
--      auth_clinic() falls back to their own clinic and everything reappears.
-- Idempotent. Apply AFTER 0001–0024.
-- ============================================================================

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

  -- 🛡️ Safety guard: a clinic owner cannot join another clinic (would hide their
  -- own workspace). Detected by a self-membership OR existing data under own id.
  if v_inv.clinic_id <> auth.uid() and (
       exists (select 1 from memberships where user_id = auth.uid() and clinic_id = auth.uid())
       or exists (select 1 from pets where clinic_id = auth.uid())
     ) then
    return jsonb_build_object('ok', false, 'error', 'already_clinic_owner');
  end if;

  insert into memberships (user_id, clinic_id, role, status)
  values (auth.uid(), v_inv.clinic_id, v_inv.role, 'active')
  on conflict (user_id, clinic_id)
    do update set role = excluded.role, status = 'active';

  update invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;

  select coalesce(full_name, email) into v_name from profiles where id = v_inv.clinic_id;

  return jsonb_build_object('ok', true, 'clinic_id', v_inv.clinic_id, 'role', v_inv.role, 'clinic_name', v_name);
end $$;

-- Escape hatch: leave any clinic you joined as staff (keeps your own clinic).
-- Removes only memberships in OTHER clinics, never your own self-membership.
create or replace function leave_clinic(p_clinic uuid default null)
returns jsonb language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;
  delete from memberships
   where user_id = auth.uid()
     and clinic_id <> auth.uid()
     and (p_clinic is null or clinic_id = p_clinic);
  return jsonb_build_object('ok', true);
end $$;

grant execute on function leave_clinic(uuid) to authenticated;

-- VERIFY: as a clinic owner, accept_invite to another clinic now returns
--   { ok:false, error:'already_clinic_owner' }, and your data is untouched.
