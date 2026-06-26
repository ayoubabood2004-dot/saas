-- ============================================================================
-- doctorVet — 0026: clinic-owner invite join = ALLOW WITH STRONG WARNING.
--
-- Supersedes 0025's hard block. A clinic owner MAY join another clinic, but only
-- after an explicit confirmation, because it switches their active workspace
-- (auth_clinic) and temporarily HIDES their own clinic's data (RLS — never
-- deleted). They can restore everything anytime via leave_clinic().
--
-- accept_invite gains a p_confirm flag: if the caller already owns a clinic and
-- hasn't confirmed, it returns { ok:false, error:'confirm_owner_join',
-- clinic_name } so the UI can warn; calling again with p_confirm=true proceeds.
-- NO data is ever modified or deleted in this flow. Idempotent. Apply AFTER 0025.
-- ============================================================================

-- Drop the previous single-arg signature so the two-arg version is unambiguous.
drop function if exists accept_invite(text);

create or replace function accept_invite(p_code text default null, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv      invites;
  v_email    text := lower(coalesce((select email from auth.users where id = auth.uid()), ''));
  v_name     text;
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

  -- Does the caller already own a clinic? (self-membership OR data under own id)
  v_is_owner := v_inv.clinic_id <> auth.uid() and (
       exists (select 1 from memberships where user_id = auth.uid() and clinic_id = auth.uid())
       or exists (select 1 from pets where clinic_id = auth.uid())
     );

  -- Strong-warning gate: an owner must explicitly confirm the workspace switch.
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

  return jsonb_build_object('ok', true, 'clinic_id', v_inv.clinic_id, 'role', v_inv.role, 'clinic_name', v_name);
end $$;

-- Recovery path (also defined in 0025; repeated here so 0026 is self-sufficient):
-- leave_clinic() deletes ONLY the membership in another clinic, never your data,
-- so your own clinic becomes active again and every record reappears intact.
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
