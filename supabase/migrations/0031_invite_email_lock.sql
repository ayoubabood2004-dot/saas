-- ============================================================================
-- doctorVet — 0031: قفل دعوة البريد على بريدها المحدّد + ضمان الاستخدام لمرة واحدة.
--
-- المشكلة: accept_invite كانت تطابق الدعوة بالرمز فقط، فأي بريد يقدر يستعمل رابط
-- دعوة مُوجّهة لبريد معيّن. الإصلاح: إذا كانت الدعوة موجّهة لبريد (email غير فارغ)،
-- فيجب أن يطابق بريدُ الحساب الذي يقبلها — وإلا تُرفض دون أن "تُستهلك" (تبقى pending
-- للشخص الصحيح). الاستخدام لمرة واحدة مضمون أصلاً: أول قبول ناجح يحوّل الحالة إلى
-- 'accepted' فلا يقدر أي حساب آخر إعادة استخدامها.
-- دعوات الرمز فقط (بلا بريد) تبقى مفتوحة لحامل الرمز (أول من يستخدمه) ولمرة واحدة.
-- آمنة لإعادة التشغيل (create or replace). شغّلها بعد 0029/0030.
-- ============================================================================

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

  -- 🔒 قفل البريد: دعوة موجّهة لبريد معيّن لا يقبلها إلا صاحب ذلك البريد. الرفض هنا
  -- يحدث قبل أي تعديل، فالدعوة تبقى pending للشخص الصحيح (لا تُستهلك بمحاولة خاطئة).
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

  -- أول قبول ناجح: ينشئ العضوية ويحوّل الدعوة إلى 'accepted' → لا إعادة استخدام.
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
