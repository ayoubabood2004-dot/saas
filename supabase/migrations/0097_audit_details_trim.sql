-- ============================================================================
-- 0097 · تقليم سجل التدقيق — القيم الضخمة لا تُنسخ حرفياً
--
-- audit_change() كانت تخزن to_jsonb(الصف كاملاً) بعمود details. أي عمود نصي
-- ضخم (شعار العيادة data-URL، صورة موظف، أو أي عمود صور مستقبلي على المنتجات)
-- ينسخ نفسه كاملاً بسجل التدقيق مع كل INSERT/UPDATE/DELETE — تغيير سعر واحد
-- كان سينسخ صورة كاملة. نستبدل كل قيمة تتجاوز ٢٠٤٨ حرفاً بعلامة مختصرة:
-- السجل يبقى يقول «العمود تغيّر» بلا أن يحمل المحتوى نفسه.
-- ============================================================================

create or replace function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v jsonb;
begin
  begin
    v := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
    -- تقليم القيم الضخمة (المستوى الأعلى يكفي — الأعمدة النصية هي مصدر الحجم).
    select coalesce(jsonb_object_agg(
             e.key,
             case when length(e.value::text) > 2048
                  then to_jsonb('[كبير: ' || length(e.value::text) || ' حرف]')
                  else e.value end), '{}'::jsonb)
      into v
      from jsonb_each(v) as e(key, value);
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (
      coalesce(nullif(v->>'clinic_id','')::uuid, auth_clinic()),
      auth.uid(), TG_OP, TG_TABLE_NAME, (v->>'id'), v
    );
  exception when others then
    null; -- auditing must never break the underlying operation
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;

revoke execute on function public.audit_change() from anon, authenticated;
