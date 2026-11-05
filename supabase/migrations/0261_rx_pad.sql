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
-- • المصوّرُ مسيَّجٌ من الجدولين (photographer_fence_table)، والتدقيقُ يكتب الراجيتةَ وإلغاءَها وتعديلَ التصميم.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. لا يقرؤها شيءٌ قديم. تراجع:
--   drop table if exists public.pet_prescriptions;
--   drop table if exists public.clinic_rx_pad;
--   drop function if exists public.pet_prescriptions_guard();
--   drop function if exists public.clinic_rx_pad_touch();
--   drop function if exists public._rx_pad_ok(jsonb);
-- ============================================================================

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
  if (new.clinic_id, new.pet_id, new.visit_id, new.author_id, new.doctor_name, new.pet_name, new.fields, new.body, new.issued_at, new.created_at)
     is distinct from (old.clinic_id, old.pet_id, old.visit_id, old.author_id, old.doctor_name, old.pet_name, old.fields, old.body, old.issued_at, old.created_at) then
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
drop policy if exists pet_prescriptions_insert on public.pet_prescriptions;
create policy pet_prescriptions_insert on public.pet_prescriptions for insert to authenticated
  with check (clinic_id = (select auth_clinic()));
drop policy if exists pet_prescriptions_update on public.pet_prescriptions;
create policy pet_prescriptions_update on public.pet_prescriptions for update to authenticated
  using (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));
-- لا حذف: لا سياسةَ ولا صلاحية.
revoke all on table public.pet_prescriptions from public, anon, authenticated;
grant select, insert, update on table public.pet_prescriptions to authenticated;
select public.photographer_fence_table('pet_prescriptions');

drop trigger if exists audit_all on public.pet_prescriptions;
create trigger audit_all after insert or update of voided_at on public.pet_prescriptions
  for each row execute function audit_change();
