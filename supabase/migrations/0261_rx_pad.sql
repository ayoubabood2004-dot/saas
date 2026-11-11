-- ============================================================================
-- ٠٢٦١ — راجيتةُ العيادة: تصميمُها مرّةً بالإعدادات، وكلُّ راجيتةٍ انطبعت تبقى بسجلّ الحيوان
--
-- طلبُ المالك (٥/١١): «لكلّ عيادة صورةُ راجيتتها، ومن سجلّ الحيوان أدوس راجيتة فتنزل معلوماتُ الحيوان
-- عليها وأكتب ما أريد». بالإعدادات يُرتَّب شكلُها: مكانُ الشعار وكيف يصير علامةً مائية، وأسماءُ الدكاترة
-- كما نريد، وشعارُ دائرة البيطرة ثابت، والدوامُ وأرقامُ التواصل تنزل وحدها، و«Rx».
--
-- • clinic_rx_pad — صفٌّ واحدٌ لكلّ عيادة: التصميمُ jsonb (قالبٌ مرسوم أو صورةُ راجيتتها خلفيةً وخاناتٌ
--   فوقها). الصورُ **مساراتٌ بالدلو** لا بايتات: `_rx_pad_ok` يرفض أيَّ نصٍّ يبدأ بـ`data:` (درسُ 0190 —
--   شعارٌ ببايتاته داخل القاعدة ثقّل كلَّ قراءة). يكتبه كادرُ العيادة كما يكتب clinic_prefs (الواجهةُ تقصره
--   على من يملك «إدارة الإعدادات»)، وupdated_at يختمه الخادم: الحفظُ بشرط «كما فُتح» — تعديلٌ من جهازٍ
--   ثانٍ لا يُداس بصمت. لا حذف: «رجّع الافتراضيّ» كتابةٌ لا حذف.
-- • pet_prescriptions — كلُّ راجيتةٍ انطبعت: ما كُتب فيها (النصّ، وخاناتُ المريض كما انطبعت، والدكتور).
--   **لا تتعدّل بعد كتابتها** (ورقةٌ بيد الزبون): المحفّزُ يجمّد كلَّ عمود ويقبل الإلغاءَ وحده — مرّةً، للمدير
--   (`auth_role()`: المدير، صاحبُ العيادة، مفتاحُ المدير الحيّ، المشغّلُ داخلها)، والخادمُ يختم لحظتَه ومَن.
--   ولا حذف (لا سياسةَ ولا صلاحية): ما انطبع لا يختفي من السجلّ — «اختفى كأنه ما كان» = حُذف (0145).
--   والمحفّزُ يحرس `current_user = 'authenticated'` وحده فلا يشدّ أكثر من السياسة (0162)، فهو invoker.
--   وحذفُ الحيوان يحذف راجيتاتِه بالمفتاح الأجنبيّ (كملاحظاته ولقاحاته).
-- • المصوّرُ مسيَّجٌ من الجدولين (photographer_fence_table)، والتدقيقُ يكتب الراجيتةَ وإلغاءَها وتعديلَ التصميم —
--   وحذفَها مع حيوانها بلقطتها كاملة (كملاحظاته ولقاحاته: «اختفى كأنه ما كان» = حُذف)، والإلغاءَ حين يتغيّر وحده
--   (تحديثٌ يكتب العمودَ بقيمته لا يقول «ألغى»). ونوعُها بسجلّ الحركات «ملف طبي» (audit_kind، بحارس الانجراف).
--   و«كاملة» بمعنى 0139: كلُّ الأعمدة لا قائمةُ الإبقاء — ونصٌّ أطولُ من ~٢٠٠٠ حرف يُحفظ بطوله وحده كأيّ جدولٍ مدقَّق
--   (audit_change)، والسجلُّ يُكنس بعد ٩٠ يوماً (purge_audit_log)؛ النصُّ الكامل بالجدول ما دام الحيوان.
--
-- وaudit_kind تعرّفها هجراتٌ قبلها (0242 آخرُها): إعادةُ تطبيق أيٍّ منها تُرجع الراجيتةَ «أخرى» بالفلتر. والعلاجُ: أعد تعريفَ
-- audit_kind من 0242 (تعريفُه وحده، كما بالتراجع) ثمّ 0261 — حارسُها يمرّ على نصّ 0242 حرفاً وعلى علامتها، ويرفض غيرَهما
-- (drift_body): إعادةُ 0261 مباشرةً بعد 0233 أو 0241 تُرفض (مقيس). العرضُ وحده يتأثّر: النوعُ يُحسب عند القراءة لا يُخزَّن.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. لا يقرؤها شيءٌ قديم. تراجع:
--   drop table if exists public.pet_prescriptions;
--   drop table if exists public.clinic_rx_pad;
--   drop function if exists public.pet_prescriptions_guard();
--   drop function if exists public.clinic_rx_pad_touch();
--   drop function if exists public._rx_pad_ok(jsonb);
--   وأعد audit_kind حرفاً من 0242 (تعريفُه وحده) — سطرُ الراجيتة يرجع «أخرى».
-- ============================================================================

-- ── ٠) الحارسُ قبل أيّ تعريف: audit_kind تُعاد كتابتُها، فنسختُها بالقاعدة لازم نسخةُ 0242 ──────────────
-- (نصُّ 0242 حرفاً وفوقه سطرٌ معلَّمٌ بـ`-- +0261`؛ الحارسُ من 0252.) الرفضُ هنا قبل أيّ جدول، فلا نصفَ هجرة.
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
end $$;
select public._drift_assert('public.audit_kind(text,text,jsonb)', '7ea37a8dd21573b59e42102e9d015633', '-- +0261');

-- ── ١) تصميمُ الراجيتة ────────────────────────────────────────────────────────
-- شكلُ التصميم: كائنٌ صغير بلا بايتاتِ صور. الشكلُ التفصيليّ (المقاسات والمواضع والألوان) تنظّفه الواجهةُ
-- عند كلّ قراءة (rxLayout.cleanRxPad) — فتصميمٌ كتبته نسخةٌ أحدث أو أقدم يُقرأ ولا يُسقط الطباعة.
create or replace function public._rx_pad_ok(p jsonb) returns boolean
language sql immutable set search_path = public as $$
  select jsonb_typeof(p) = 'object' and octet_length(p::text) <= 24000
     and position('"data:' in lower(p::text)) = 0
$$;
-- القيدُ يناديها بصلاحية من يكتب (درسُ 0258: سحبُها من authenticated يُفشل كلَّ حفظ). دالّةٌ صِرفةٌ بلا قراءة.
revoke all on function public._rx_pad_ok(jsonb) from public, anon;
grant execute on function public._rx_pad_ok(jsonb) to authenticated;

create table if not exists public.clinic_rx_pad (
  clinic_id  uuid primary key default auth_clinic(),
  config     jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  constraint clinic_rx_pad_config check (public._rx_pad_ok(config))
);

-- updated_at ومَن يختمهما الخادم (لا الجهاز): شرطُ الكتابة «كما فُتح» يقارن به. والصفُّ لا ينتقل لعيادةٍ أخرى.
create or replace function public.clinic_rx_pad_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.clinic_id := old.clinic_id;
  end if;
  return new;
end $$;
revoke all on function public.clinic_rx_pad_touch() from public, anon, authenticated;
drop trigger if exists clinic_rx_pad_touch on public.clinic_rx_pad;
create trigger clinic_rx_pad_touch before insert or update on public.clinic_rx_pad
  for each row execute function public.clinic_rx_pad_touch();

alter table public.clinic_rx_pad enable row level security;
-- سياسةٌ لكلّ أمرٍ لا `for all`: الحذفُ بلا سياسة، فلا يمرّ ولو مُنح (الحزمةُ تمنح كلَّ شيء بقسم 0159).
drop policy if exists clinic_rx_pad_select on public.clinic_rx_pad;
create policy clinic_rx_pad_select on public.clinic_rx_pad for select to authenticated
  using (clinic_id = (select auth_clinic()));
drop policy if exists clinic_rx_pad_insert on public.clinic_rx_pad;
create policy clinic_rx_pad_insert on public.clinic_rx_pad for insert to authenticated
  with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_rx_pad_update on public.clinic_rx_pad;
create policy clinic_rx_pad_update on public.clinic_rx_pad for update to authenticated
  using (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));
-- ولا صلاحيةَ حذف: الإنتاجُ يمنح الجديدَ كلَّ شيءٍ افتراضاً، فالنزعُ صريح.
revoke all on table public.clinic_rx_pad from public, anon, authenticated;
grant select, insert, update on table public.clinic_rx_pad to authenticated;
select public.photographer_fence_table('clinic_rx_pad');

drop trigger if exists audit_all on public.clinic_rx_pad;
create trigger audit_all after insert or update of config on public.clinic_rx_pad
  for each row execute function audit_change();

-- ── ٢) الراجيتاتُ المطبوعة ────────────────────────────────────────────────────
create table if not exists public.pet_prescriptions (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  pet_id      uuid not null references public.pets(id) on delete cascade,
  -- الحالةُ التي كُتبت منها (إن كُتبت من صفحة الحالة). بلا مفتاحٍ أجنبيّ: الراجيتةُ تبقى ولو تغيّرت الحالة.
  visit_id    uuid,
  author_id   uuid default auth.uid(),
  doctor_name text,
  pet_name    text,
  -- خاناتُ المريض كما انطبعت: {date, name, owner, age, weight, kind} — الورقةُ لا تتغيّر إن تغيّر الملفّ بعدها.
  fields      jsonb not null default '{}'::jsonb,
  body        text not null,
  issued_at   timestamptz not null default now(),
  created_at  timestamptz not null default now(),
  voided_at   timestamptz,
  voided_by   uuid,
  void_reason text,
  constraint pet_prescriptions_body check (char_length(btrim(body)) between 1 and 8000),
  constraint pet_prescriptions_fields check (jsonb_typeof(fields) = 'object' and octet_length(fields::text) <= 4000),
  constraint pet_prescriptions_names check (char_length(coalesce(doctor_name, '')) <= 120 and char_length(coalesce(pet_name, '')) <= 120),
  constraint pet_prescriptions_reason check (char_length(coalesce(void_reason, '')) <= 200)
);
-- سجلُّ الحيوان يقرؤها بالأحدث أوّلاً — والفهرسُ نفسُه فهرسُ المفتاح الأجنبيّ (db-guard).
create index if not exists pet_prescriptions_pet on public.pet_prescriptions (pet_id, issued_at desc);

-- التجميد: الإدخالُ يُختم بالخادم (الكاتبُ ولحظتُه، ولا راجيتةَ تولد ملغاة)، والتعديلُ إلغاءٌ وحده — مرّةً، للمدير.
create or replace function public.pet_prescriptions_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.issued_at := now();
    new.created_at := now();
    new.voided_at := null;
    new.voided_by := null;
    new.void_reason := null;
    return new;
  end if;
  if old.voided_at is not null then
    if new is distinct from old then
      raise exception 'rx_voided' using errcode = 'P0001',
        hint = 'هذه الراجيتة ملغاة — ما تتعدّل ولا يرجع إلغاؤها';
    end if;
    return new;
  end if;
  -- الصفُّ كلُّه إلا أعمدةَ الإلغاء — ومنه المعرّف (تبديلُه كان يمرّ بلا سطر تدقيق ويُيتّم سطرَ كتابتها)،
  -- وكلُّ عمودٍ يُضاف بعدُ مجمَّدٌ من أوّل يوم بلا تعديلٍ هنا.
  if (to_jsonb(new) - array['voided_at', 'voided_by', 'void_reason'])
     is distinct from (to_jsonb(old) - array['voided_at', 'voided_by', 'void_reason']) then
    raise exception 'rx_frozen' using errcode = 'P0001',
      hint = 'الراجيتة بعد ما انطبعت ما تتعدّل — اكتب راجيتة جديدة';
  end if;
  if new.voided_at is null then
    if (new.voided_by, new.void_reason) is distinct from (old.voided_by, old.void_reason) then
      raise exception 'rx_frozen' using errcode = 'P0001',
        hint = 'الراجيتة بعد ما انطبعت ما تتعدّل — اكتب راجيتة جديدة';
    end if;
    return new;
  end if;
  if (select public.auth_role()) is distinct from 'manager' then
    raise exception 'rx_void_manager' using errcode = '42501',
      hint = 'إلغاء الراجيتة للمدير';
  end if;
  new.voided_at := now();
  new.voided_by := auth.uid();
  new.void_reason := nullif(btrim(coalesce(new.void_reason, '')), '');
  return new;
end $$;
revoke all on function public.pet_prescriptions_guard() from public, anon, authenticated;
drop trigger if exists pet_prescriptions_guard on public.pet_prescriptions;
create trigger pet_prescriptions_guard before insert or update on public.pet_prescriptions
  for each row execute function public.pet_prescriptions_guard();

alter table public.pet_prescriptions enable row level security;
drop policy if exists pet_prescriptions_select on public.pet_prescriptions;
create policy pet_prescriptions_select on public.pet_prescriptions for select to authenticated
  using (clinic_id = (select auth_clinic()));
-- والحيوانُ يراه الكاتبُ نفسُه (سياساتُ pets: حيواناتُ عيادته والمشتركة): المفتاحُ الأجنبيّ لا يمرّ من RLS، فجلسةٌ تبدّلت
-- عيادتُها والنافذةُ مفتوحة (المشغّلُ بتبويبٍ ثانٍ، عضويةٌ أُوقفت) كانت تودع الراجيتةَ بمساحةٍ لا ترى حيوانَها ولا تُحذف منها.
drop policy if exists pet_prescriptions_insert on public.pet_prescriptions;
create policy pet_prescriptions_insert on public.pet_prescriptions for insert to authenticated
  with check (clinic_id = (select auth_clinic())
              and exists (select 1 from public.pets p where p.id = pet_prescriptions.pet_id));
drop policy if exists pet_prescriptions_update on public.pet_prescriptions;
create policy pet_prescriptions_update on public.pet_prescriptions for update to authenticated
  using (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));
-- لا حذف: لا سياسةَ ولا صلاحية.
revoke all on table public.pet_prescriptions from public, anon, authenticated;
grant select, insert, update on table public.pet_prescriptions to authenticated;
select public.photographer_fence_table('pet_prescriptions');

-- التدقيق: الكتابةُ، والحذفُ بلقطته كاملة (حذفُ الحيوان يحذفها بالمفتاح الأجنبيّ — بلا هذا تختفي بلا أثر، وكلُّ جدولٍ
-- طبيٍّ يتبع الحيوانَ يُدقَّق حذفُه)، والإلغاءُ حين يتغيّر وحده: `update of` يُطلق المحفّزَ لكلّ عمودٍ بقائمة SET ولو بقيمته،
-- فتحديثٌ لا يغيّر شيئاً (يمرّ عمداً) كان يكتب «ألغى راجيتة» عن راجيتةٍ حيّة.
drop trigger if exists audit_all on public.pet_prescriptions;
create trigger audit_all after insert or delete on public.pet_prescriptions
  for each row execute function audit_change();
drop trigger if exists audit_void on public.pet_prescriptions;
create trigger audit_void after update of voided_at on public.pet_prescriptions
  for each row when (old.voided_at is distinct from new.voided_at) execute function audit_change();

-- ── ٣) سجلُّ الحركات: الراجيتةُ «ملف طبي» لا «أخرى» ────────────────────────────────────────
-- نصُّ 0242 حرفاً وفوقه سطرٌ معلَّم (مرآتُه activityKinds.ts، وحالاتُه activity-cases.json تُفحص على الطرفين).
-- كانت كتابتُها وإلغاؤها تقع بمجموعة «الكادر والنظام» وتغيب عن فلتر «ملف طبي». والتصميمُ «إعدادات» من اسمه (clinic%).
create or replace function public.audit_kind(p_entity text, p_action text, p_details jsonb) returns text
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
      when coalesce(p_details->>'event','') = 'sale.expired' then 'sale_expired'
      else 'print' end
    when p_entity = 'invoices' then case
      -- 0242: بيعةٌ بيومٍ سابق تُسمّى باسمها — لحظةُ الإدخال بسطر التدقيق، ويومُ البيع بالفاتورة.
      when p_action = 'INSERT' and nullif(p_details->>'recorded_at', '') is not null then 'sale_backdated'
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_entity = 'invoice_forgiveness' then case
      when p_action = 'UPDATE' then 'debt_forgive_void'
      -- الاستهلاكُ أثرُ مرتجعٍ أو تعديلٍ (وقد يكتبه الاستقبال) — ليس خصماً أعطاه أحد.
      when coalesce(p_details->>'kind', '') = 'consumed' then 'sale_edit'
      else 'debt_forgive' end
    when p_action = 'UPDATE' and p_entity in ('products','purchases','purchase_payments','company_sections')
         and cardinality(c.ch) > 0 and c.ch <@ array['company_id','company_name','section_id']::text[] then 'relink'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity = 'price_changes' then 'price_change'
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity in ('expenses','expense_categories') then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity = 'pet_prescriptions' then 'medical'   -- +0261
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles','store_categories','store_category_items') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;
-- دالّةٌ صِرفة (لا تقرأ جدولاً) تناديها دوالُّ الحركات بصلاحية المُستدعي — فمن anon تُسحب ولـauthenticated تبقى.
revoke all on function public.audit_kind(text, text, jsonb) from public, anon;
grant execute on function public.audit_kind(text, text, jsonb) to authenticated, service_role;
