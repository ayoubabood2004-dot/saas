-- ============================================================================
-- ٠١٥٢ — مركزُ الحركات: القاعدةُ تصنّف وتجمع وتقلّب الصفحات، والشاشةُ تعرض
--
-- ── المقيس ───────────────────────────────────────────────────────────────
-- ٣٦ ألف سطر تدقيق بالشهر عبر العيادات (٦٤١ بايت للسطر). الصفحةُ كانت تنزّل
-- آخرَ ٥٠٠ سطرٍ كاملةً بتفاصيلها وتفلتر بالمتصفّح: لا تسأل «كم بيعة أمس»
-- بل تنزّل السجلَّ وتعدّ. وعيادةٌ عندها ٣٠٠ سطرٍ باليوم لا يوصل «أمس» أصلاً.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- «الطبيبُ يسأل بالنوع والوقت، لا بالجدول والفعل». فكلُّ سطرٍ يُصنَّف إلى نوعٍ
-- واحد (بيع، مرتجع، تسديد، إضافة منتج، تعديل مخزون، حذف، جرعة…) بدالّةٍ
-- واحدة `audit_kind`، والمرآةُ نفسُها بالواجهة (activityKinds.ts) تفحصها
-- الحزمة. ثم:
--   • activity_summary: عدٌّ بالنوع والوقت (يوم أو ساعة) — الرسمُ والعدّادات.
--   • activity_page:    صفحةٌ بالمؤشّر بمختصرٍ لا بالتفاصيل كلّها.
--   • activity_actors:  من عمل كم — فلترُ الموظف.
-- كلُّها بصلاحية المُستدعي: سياسةُ audit_manager_read تبقى الحارس.
--
-- ── التغطية ──────────────────────────────────────────────────────────────
-- جداولٌ بمعرّف عيادة كانت بلا محفّز: الحالاتُ المفتوحة، التحاليل، الرعاية،
-- تحصيلاتُ التوصيل، تعديلاتُ الرواتب، الملصقات… تُلحق هنا (بحراسة الوجود).
-- والمحفّزُ يعرف حقولاً تعريفيةً أكثر ليسمّي أحداثها.
-- ============================================================================

-- ── ١) التغطية: محفّزٌ على كل جدولٍ عيادةٍ كان بلا محفّز ───────────────────
do $$
declare t text;
begin
  foreach t in array array[
    'clinic_visits','care_entries','lab_results','courier_settlements','payroll_adjustments',
    'staff_recurring','staff_loan_events','pet_problems','pet_movements','journeys',
    'clinic_notes','generated_barcodes','wa_accounts','lab_device_links'
  ] loop
    if to_regclass(t) is not null and not exists (
      select 1 from pg_trigger g join pg_class c on c.oid = g.tgrelid
      where c.relname = t and g.tgname = 'audit_all' and not g.tgisinternal
    ) then
      execute format('create trigger audit_all after insert or update or delete on %I for each row execute function audit_change()', t);
    end if;
  end loop;
end $$;

-- ── ٢) المحفّز يعرف حقولاً تعريفيةً أكثر (نفس 0139، القائمةُ وحدها اتّسعت) ──
create or replace function audit_change() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_raw jsonb; v_old_raw jsonb; v_new jsonb; v_old jsonb; v_src jsonb; v_out jsonb; v_chg jsonb;
  keep constant text[] := array[
    'name','pet_name','pet_id','kind','outcome','status','medication','amount',
    'administered_at','vaccine','doctor_name','doctor','weight_kg','total',
    'customer_name','stock','qty','line_total','title','text','owner_name',
    'reminder_type','label','staff_id',
    -- 0152: ما يسمّي أحداثَ الجداول الجديدة — قليلٌ عمداً: سطرُ التعديل يبقى
    -- أصغرَ من اللقطة بأربع مرّات (فحصُ 0139)، والفرقُ `__changed` يحمل الباقي.
    'test','test_name','reason','category','company_name','courier_name',
    'event','ref','format','role','species'
  ];
begin
  begin
    v_new_raw := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
    v_old_raw := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
    if v_new_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_new from jsonb_each(v_new_raw) as e(key, value);
    end if;
    if v_old_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_old from jsonb_each(v_old_raw) as e(key, value);
    end if;
    v_src := coalesce(v_new, v_old);
    if TG_OP = 'DELETE' then
      v_out := v_old;
    else
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_out
        from jsonb_each(v_src) as e(key, value)
       where e.key = any (keep) and e.value <> 'null'::jsonb;
    end if;
    if TG_OP = 'UPDATE' then
      select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k)) into v_chg
        from jsonb_object_keys(v_new_raw) as k
       where (v_new_raw -> k) is distinct from (v_old_raw -> k);
      if v_chg is not null then v_out := v_out || jsonb_build_object('__changed', v_chg); end if;
    end if;
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (coalesce(nullif(v_src->>'clinic_id','')::uuid, auth_clinic()), auth.uid(), TG_OP, TG_TABLE_NAME, (v_src->>'id'), v_out);
  exception when others then
    null; -- التدقيق لا يجوز أن يمنع العملية الأصلية أبداً
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $function$;
revoke execute on function public.audit_change() from anon, authenticated;

-- ── ٣) التصنيف: سطرٌ خام → نوعٌ واحد (مرآة activityKinds.ts) ───────────────
create or replace function audit_kind(p_entity text, p_action text, p_details jsonb) returns text
language sql immutable set search_path = public as $$
  with c as (
    select coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_details->'__changed','{}'::jsonb)) k
                      where k not in ('updated_at','created_at','id','clinic_id')), '{}'::text[]) as ch
  )
  select case
    when p_entity = 'login' then 'login'
    when p_entity = 'client' then case
      when coalesce(p_details->>'event','') like 'override.%' then 'override'
      when coalesce(p_details->>'event','') like 'report.%' then 'export'
      else 'print' end
    when p_entity = 'invoices' then case
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity = 'expenses' then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

-- ── ٤) المختصر: ما تحتاجه الشاشة لتسمّي الحدث، لا الصفَّ كلَّه ─────────────
create or replace function activity_brief(p_details jsonb) returns jsonb
language sql immutable set search_path = public as $$
  select case when p_details is null then null else
    coalesce((select jsonb_object_agg(k, v) from jsonb_each(p_details) e(k, v) where k <> '__changed' and length(v::text) <= 200), '{}'::jsonb)
    || case when p_details ? '__changed' then jsonb_build_object('__changed',
         coalesce((select jsonb_object_agg(k, v) from (
            select k, v from jsonb_each(p_details->'__changed') e(k, v)
             where k not in ('updated_at','created_at','id','clinic_id') and length(v::text) <= 300
             limit 8) s), '{}'::jsonb))
       else '{}'::jsonb end
  end
$$;

-- ── ٥) الملخّص: كم حركةً من كل نوع بكل يومٍ أو ساعة ───────────────────────
create or replace function activity_summary(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad', p_bucket text default 'day')
returns table (bucket timestamptz, kind text, n bigint)
language sql stable security invoker set search_path = public as $$
  select (date_trunc(case when p_bucket = 'hour' then 'hour' else 'day' end, x.created_at at time zone p_tz) at time zone p_tz) as bucket,
         x.kind, count(*)
  from (
    select a.created_at, audit_kind(a.entity, a.action, a.details) as kind
      from audit_log a where a.clinic_id = auth_clinic() and a.created_at >= p_from and a.created_at < p_to
    union all
    select l.created_at, 'login' from login_events l where l.clinic_id = auth_clinic() and l.created_at >= p_from and l.created_at < p_to
  ) x
  group by 1, 2
  order by 1, 2
$$;
revoke all on function activity_summary(timestamptz, timestamptz, text, text) from public, anon;
grant execute on function activity_summary(timestamptz, timestamptz, text, text) to authenticated;

-- ── ٦) الصفحة: بالمؤشّر (الوقت، المصدر، المعرّف)، بمختصرٍ لا بتفاصيل ──────
drop function if exists activity_page(timestamptz, timestamptz, text[], uuid, text, timestamptz, text, bigint, int);
create function activity_page(p_from timestamptz, p_to timestamptz,
                              p_kinds text[] default null, p_actor uuid default null, p_q text default null,
                              p_before timestamptz default null, p_before_src text default null, p_before_id bigint default null,
                              p_limit int default 50)
returns table (id bigint, src text, created_at timestamptz, actor uuid, actor_name text, kind text, action text, entity text, entity_id text, brief jsonb)
language sql stable security invoker set search_path = public as $$
  with x as (
    select a.id, 'a'::text as src, a.created_at, a.actor, a.action, a.entity, a.entity_id, a.details,
           audit_kind(a.entity, a.action, a.details) as kind
      from audit_log a where a.clinic_id = auth_clinic() and a.created_at >= p_from and a.created_at < p_to
    union all
    select l.id, 'l', l.created_at, l.user_id, 'LOGIN', 'login', null,
           jsonb_build_object('__actor', coalesce(nullif(btrim(l.name), ''), l.email)), 'login'
      from login_events l where l.clinic_id = auth_clinic() and l.created_at >= p_from and l.created_at < p_to
  )
  select x.id, x.src, x.created_at, x.actor, coalesce(st.name, x.details->>'__actor') as actor_name,
         x.kind, x.action, x.entity, x.entity_id, activity_brief(x.details) as brief
  from x
  left join lateral (select s.name from staff s where s.user_id = x.actor and s.clinic_id = auth_clinic() limit 1) st on true
  where (p_kinds is null or x.kind = any(p_kinds))
    and (p_actor is null or x.actor = p_actor)
    and (coalesce(search_norm(p_q), '') = ''
         or search_norm(x.details::text) like '%' || search_norm(p_q) || '%'
         or search_norm(st.name) like '%' || search_norm(p_q) || '%')
    and (p_before is null
         or (x.created_at, x.src, x.id) < (p_before, coalesce(p_before_src, 'z'), coalesce(p_before_id, 9223372036854775807)))
  order by x.created_at desc, x.src desc, x.id desc
  limit least(greatest(coalesce(p_limit, 50), 1), 200)
$$;
revoke all on function activity_page(timestamptz, timestamptz, text[], uuid, text, timestamptz, text, bigint, int) from public, anon;
grant execute on function activity_page(timestamptz, timestamptz, text[], uuid, text, timestamptz, text, bigint, int) to authenticated;

-- ── ٧) من عمل كم — فلترُ الموظف ────────────────────────────────────────────
create or replace function activity_actors(p_from timestamptz, p_to timestamptz)
returns table (actor uuid, name text, n bigint)
language sql stable security invoker set search_path = public as $$
  select a.actor, coalesce(st.name, a.actor::text) as name, count(*) as n
  from audit_log a
  left join lateral (select s.name from staff s where s.user_id = a.actor and s.clinic_id = auth_clinic() limit 1) st on true
  where a.clinic_id = auth_clinic() and a.created_at >= p_from and a.created_at < p_to and a.actor is not null
  group by a.actor, st.name
  order by n desc
$$;
revoke all on function activity_actors(timestamptz, timestamptz) from public, anon;
grant execute on function activity_actors(timestamptz, timestamptz) to authenticated;
