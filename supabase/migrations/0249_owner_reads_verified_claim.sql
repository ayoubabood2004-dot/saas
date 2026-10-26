-- ============================================================================
-- ٠٢٤٩ — صاحبُ الحيوان يقرأ سجلَّ العيادة ولا يكتبه، ويطالب برقمٍ أكّده الخادم
--
-- ── الثغرة الأولى: المطالبةُ برقمٍ لم يُثبَت ─────────────────────────────
-- `claim_pets_by_phone` (0077) تربط بحساب المُنادي كلَّ حيوانٍ رقمُ صاحبه يطابق
-- `profiles.phone`، ما لم يكن مربوطاً بحساب مالكٍ آخر. وتعليقُها يقول «رقمُه
-- المؤكَّد» — ولا تأكيدَ هناك: الرقمُ نصٌّ كتبه المُنادي بيده.
--   • محفّزُ إنشاء الحساب ينسخه من بيانات التسجيل التي يرسلها المتصفّح (0005، ثم 0248)؛
--   • `profiles_self_update` يتركه يبدّله متى شاء؛
--   • `profiles_guard_identity` (0162) تجمّد الدورَ والأدوارَ والعيادةَ والبريد — لا الهاتف.
-- فمن سجّل برقم زبونٍ لعيادةٍ أخذ حيواناتِه بسجلّاتها، وصار صاحبُها الحقيقيّ «مربوطاً
-- بغيره» فلا يقدر يطالب بها. ومع الثغرة الثانية تحت: يعدّل لقاحاتِها ويحذفها.
--
-- التصليح: المفتاحُ رقمُ الدخول الذي أكّدته GoTrue برمز رسالة — `auth.users.phone` مع
-- `phone_confirmed_at` — والملفُّ الشخصيّ لا يُقرأ أصلاً. لا يُجمَّد `profiles.phone`: الدالّةُ
-- لم تعد تراه، وهو رقمُ العيادة المعروض بالمتجر والرحلة والبوّابة (0095/0098/0158) فيبقى يُعدَّل.
-- ونتيجتُه بصراحة: مزوّدُ الرسائل غيرُ مفعّلٍ بعد (0158، 0248) فلا حسابَ اليوم برقمٍ مؤكَّد —
-- المطالبةُ بالرقم تربط صفراً حتى يُفعَّل. وهذا هو الصحيح: الربطُ بلا إثباتٍ هو الثغرة نفسُها.
--
-- والربطُ الذي وقع قبل اليوم **لا يُفكّ هنا**: لا تعرف الهجرةُ أيَّه سرقةٌ وأيَّه صاحبُه الحقيقيّ،
-- وفكُّ ربطٍ صحيح يُخفي حيوانَ مالكٍ عنه بصمت. `owner_links_unverified()` تعدّه للمشغّل
-- (حيوانُ عيادةٍ مربوطٌ بحساب مالكٍ رقمُه المؤكَّد لا يطابق رقمَ الحيوان)، والقرارُ للمالك.
--
-- ── الثغرة الثانية: المالكُ يكتب السجلَّ الطبيّ للعيادة ─────────────────────
-- حلقةُ 0001 منحت `<t>_owner … for all` على weight_logs وvaccinations وmedia_items
-- وmedical_visits وtreatment_entries، و0004 زادت `media_items_owner_write`، ولم تضيّقها
-- هجرةٌ بعدها. فحسابُ صاحب الحيوان يُدرج ويعدّل ويحذف لقاحاتِ العيادة وزياراتِها
-- وجرعاتِ علاجها لحيوانه من الواجهة البرمجيّة — والشاشةُ وحدها كانت تمنع.
-- مسحُ `src/` (لوحةُ المالك، PetPassport، الوزن، الوسائط، الطابور) وجد كتابةً واحدةً للمالك:
-- صورةٌ من تبويب الوسائط بـPetPassport (`uploadMedia`، نوعُ photo). صفُّها يأخذ `clinic_id`
-- من قيمته الافتراضية `auth_clinic()` = حسابُ المالك نفسه (0151) — فهو صفُّ مساحته، تسمح به
-- `media_items_clinic_all` بلا أيّ سياسةٍ للمالك. وكلُّ زرِّ كتابةٍ غيرِه خلف دور العيادة.
-- فالمالكُ يأخذ قراءةً وحدها، و`media_items_owner_write` تسقط: لا تمنح شيئاً لا تمنحه سياسةُ
-- المساحة إلا الكتابةَ بعيادةٍ غيرِ مساحته — وهي الثغرة.
--
-- والسياسةُ تُطابَق **بشرطها لا باسمها**: كلُّ سياسةٍ متساهلة غيرِ قراءة على الخمسة تمنح
-- بملكيّة الحيوان (`owner_id`) تُسقط وتُدوَّن — فاسمٌ لم نتوقّعه بالإنتاج لا يبقى ثغرةً صامتة.
-- و`verify_owner_read_only()` ترجع ما بقي، وتُسأل بالحزمة وعلى الإنتاج بعد التطبيق.
--
-- ── وما يمحو السجلَّ من بابٍ آخر ──────────────────────────────────────────
-- الجداولُ الخمسة `on delete cascade` إلى `pets`، و`pets.owner_id` إلى `profiles` كذلك (0001)،
-- والتسلسلُ يجري بصلاحية مالك الجدول فلا تراه RLS. و`pets_owner` (0001، `for all`) تترك
-- المالكَ يحذف حيوانَ العيادة، و`profiles_self_delete` (0049) تتركه يحذف ملفَّه — فيذهب
-- الحيوانُ ولقاحاتُه وزياراتُه معاً، وتضييقُ الخمسة وحده لا يمنع شيئاً. فمحفّزان:
--   • `pets_guard_clinic_record`: حيوانٌ عيادتُه غيرُ مساحة المُنادي (لا يصله إلا من
--     `pets_owner`) لا يُحذف، ولا تتبدّل عيادتُه ولا رقمُه التسلسليّ ولا رمزُ جوازه؛
--   • `profiles_guard_clinic_pets`: ملفٌّ مربوطٌ بحيوان عيادةٍ لا يحذفه صاحبُه.
-- وكلاهما يحرس `current_user = 'authenticated'` وحده كمحفّز 0162 — دوالُّ المالك تمرّ.
--
-- ── برهانُ 0128 ───────────────────────────────────────────────────────────
-- `verify_rls_equivalence()` تثبت أن لا سياسةَ تغيّرت منذ لفّ 0128 إلا باللفّ. وهذه
-- الهجرةُ تغيّر سياساتٍ قصداً، فتُدوَّن كلُّ واحدةٍ بـ`rls_policy_superseded` مع سببها، والبرهانُ
-- يستثني المدوَّن وحده — فيبقى صفراً لكلّ ما عداه، ولا يُمسّ `rls_policy_backup`.
--
-- تُطبَّق قبل الواجهة (ولا تحتاج الواجهةُ تغييراً). إضافيةٌ وتُعاد بلا أثرٍ ثانٍ.
-- قبل التطبيق: استعلامُ القياس بالدفعة (السياساتُ الحيّة كما هي، وعددُ الربط المشكوك).
-- ============================================================================

-- ── ١) دفترُ ما تغيّر قصداً بعد 0128 ─────────────────────────────────────────
create table if not exists public.rls_policy_superseded (
  schemaname text        not null default 'public',
  tablename  text        not null,
  policyname text        not null,
  migration  text        not null,
  why        text        not null,
  cmd        text,
  qual       text,
  with_check text,
  at         timestamptz not null default now(),
  primary key (schemaname, tablename, policyname)
);
alter table public.rls_policy_superseded enable row level security;
revoke all on table public.rls_policy_superseded from anon, authenticated;
comment on table public.rls_policy_superseded is
  'RLS-DENY-ALL-BY-DESIGN — دفترُ السياسات التي غيّرتها هجرةٌ قصداً بعد لفِّ 0128، بنصّها '
  'قبل التغيير وسببه. verify_rls_equivalence() تستثني ما فيه وحده. لا يقرؤه التطبيق.';

create or replace function public.verify_rls_equivalence(p_migration text default '0128')
returns table (
  سياسات_انفحصت   bigint,
  ضاعت             bigint,
  تغير_شرطها       bigint,
  تغيرت_صلاحياتها  bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with orig as (
    select distinct on (schemaname, tablename, policyname)
           schemaname, tablename, policyname, cmd, roles, permissive, qual, with_check
    from public.rls_policy_backup b
    where migration = p_migration
      -- ما غيّرته هجرةٌ لاحقة قصداً ليس سؤالَ هذا البرهان: سطرُه بالدفتر بنصّه وسببه.
      and not exists (select 1 from public.rls_policy_superseded s
                       where s.schemaname = b.schemaname and s.tablename = b.tablename
                         and s.policyname = b.policyname)
    order by schemaname, tablename, policyname, taken_at asc
  )
  select
    count(*),
    count(*) filter (where p.policyname is null),
    count(*) filter (where p.policyname is not null and (
         public._wrap_auth_calls(o.qual)       is distinct from public._wrap_auth_calls(p.qual)
      or public._wrap_auth_calls(o.with_check) is distinct from public._wrap_auth_calls(p.with_check))),
    count(*) filter (where p.policyname is not null and (
         p.cmd            is distinct from o.cmd
      or p.roles::text    is distinct from o.roles::text
      or p.permissive     is distinct from o.permissive))
  from orig o
  left join pg_policies p
    on p.schemaname = o.schemaname
   and p.tablename  = o.tablename
   and p.policyname = o.policyname;
$$;
revoke all on function public.verify_rls_equivalence(text) from public, anon, authenticated;

-- ── ٢) المطالبةُ برقم الدخول المؤكَّد وحده ──────────────────────────────────
create or replace function public.claim_pets_by_phone(p_name text default null, p_email text default null)
returns setof public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if auth.uid() is null then
    return;
  end if;

  -- حساباتُ المالكين وحدها — حسابُ عيادةٍ لا يربط حيواناتِ زبائنها بنفسه ولو تطابق الرقم.
  if not exists (
    select 1 from profiles pr
     where pr.id = auth.uid()
       and (pr.role = 'owner' or (pr.roles is not null and 'owner' = any(pr.roles)))
  ) then
    return;
  end if;

  -- الرقمُ الذي أكّدته GoTrue برمز رسالة — لا `profiles.phone` (نصٌّ يكتبه صاحبه بيده).
  -- بلا تأكيدٍ لا مطالبة: لا رجوعَ للملفّ الشخصيّ ولا لقيمةٍ من المتصفّح.
  select phone_key(u.phone) into v_key
    from auth.users u
   where u.id = auth.uid()
     and u.phone_confirmed_at is not null;
  if v_key is null or length(v_key) < 8 then
    return;
  end if;

  return query
  update pets p
     set owner_id = auth.uid(),
         owner_name = case
           when (p.owner_name is null or btrim(p.owner_name) in ('', '—')) and p_name is not null and btrim(p_name) <> ''
           then btrim(p_name) else p.owner_name end,
         owner_email = case
           when (p.owner_email is null or btrim(p.owner_email) = '') and p_email is not null and btrim(p_email) <> ''
           then btrim(p_email) else p.owner_email end
   where p.owner_id is distinct from auth.uid()
     and phone_key(p.owner_phone) = v_key
     -- لا يُسحب حيوانٌ مربوطٌ بحساب مالكٍ آخر — ولو كان ذلك الربطُ من قبل هذه الهجرة.
     and not exists (
       select 1 from profiles pr2
        where pr2.id = p.owner_id
          and (pr2.role = 'owner' or (pr2.roles is not null and 'owner' = any(pr2.roles)))
     )
  returning p.*;
end;
$$;

-- وanon صراحةً: الامتيازاتُ الافتراضية بسوبابيس تمنحه كلَّ دالّةٍ جديدة، و`from public` لا تنزعها.
revoke all on function public.claim_pets_by_phone(text, text) from public, anon;
grant execute on function public.claim_pets_by_phone(text, text) to authenticated;

-- ── ٣) الربطُ القائم: يُعدّ ولا يُفكّ ─────────────────────────────────────────
-- حيوانُ عيادةٍ (عيادتُه ليست حسابَ مالكه) مربوطٌ بحساب مالكٍ ليس له رقمٌ مؤكَّدٌ يطابق
-- رقمَ الحيوان. يشمل ربطاً صحيحاً بالرقم التسلسليّ أو برقمٍ تبدّل — فهو قائمةُ مراجعة لا حكم.
create or replace function public.owner_links_unverified()
returns table (pet_id uuid, clinic_id uuid, owner_id uuid, pet_phone text, verified_phone text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.clinic_id, p.owner_id, p.owner_phone,
         case when u.phone_confirmed_at is not null then u.phone end
    from pets p
    join profiles pr on pr.id = p.owner_id
    left join auth.users u on u.id = p.owner_id
   where (pr.role = 'owner' or (pr.roles is not null and 'owner' = any(pr.roles)))
     and p.clinic_id is not null
     and p.clinic_id <> p.owner_id
     and (u.phone_confirmed_at is null
          or phone_key(u.phone) is distinct from phone_key(p.owner_phone))
   order by p.clinic_id, p.owner_id;
$$;
-- بياناتُ زبائن كلِّ العيادات: للمشغّل من لوحة القاعدة وحده.
revoke all on function public.owner_links_unverified() from public, anon, authenticated;

-- ── ٤) المالكُ يقرأ السجلَّ الطبيّ ولا يكتبه ──────────────────────────────────
do $$
declare
  t text;
  r record;
begin
  foreach t in array array['weight_logs','vaccinations','media_items','medical_visits','treatment_entries']
  loop
    continue when to_regclass('public.' || t) is null;

    -- كلُّ متساهلةٍ غيرِ قراءة تمنح بملكيّة الحيوان تُسقط — بشرطها لا باسمها. وقارئةُ 0004
    -- (`media_items_owner_read`) بنفس شرط `<t>_owner` تُطوى فيه باسمها: لا نطوي قراءةً لا نعرفها.
    -- تُدوَّن كلٌّ قبل الإسقاط بنصّها كما كان.
    for r in
      select p.policyname, p.cmd, p.qual, p.with_check
        from pg_policies p
       where p.schemaname = 'public' and p.tablename = t and p.permissive = 'PERMISSIVE'
         and ((p.cmd <> 'SELECT'
               and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%owner_id%')
              or p.policyname = 'media_items_owner_read')
    loop
      insert into public.rls_policy_superseded (tablename, policyname, migration, why, cmd, qual, with_check)
      values (t, r.policyname, '0249',
              case when r.cmd = 'SELECT'
                   then 'قراءةُ المالك نفسُها مطويّةٌ في ' || t || '_owner'
                   else 'كتابةُ المالك على سجلّ العيادة الطبيّ — صارت قراءةً وحدها (' || t || '_owner)' end,
              r.cmd, r.qual, r.with_check)
      on conflict (schemaname, tablename, policyname) do nothing;
      execute format('drop policy %I on public.%I', r.policyname, t);
    end loop;

    if not exists (select 1 from pg_policies p
                    where p.schemaname = 'public' and p.tablename = t and p.policyname = t || '_owner') then
      execute format(
        'create policy %I on public.%I for select using '
        '(exists (select 1 from public.pets p where p.id = %I.pet_id and p.owner_id = (select auth.uid())))',
        t || '_owner', t, t);
    end if;

    -- السياجُ: أوامرُ الجدول القائمة مسيَّجةٌ أصلاً بسياسة العيادة `for all`؛ النداءُ يُنشئ
    -- ما ينقص ولا يلمس القائم (0222) — فإن كان بالإنتاج جدولٌ بلا سياج أمرٍ يُسدّ هنا.
    perform public.photographer_fence_table(t);
  end loop;
end $$;

-- ما بقي يمنح المالكَ كتابةً على الخمسة — يجب أن يرجع فارغاً، بالحزمة وعلى الإنتاج.
create or replace function public.verify_owner_read_only()
returns table (tablename name, policyname name, cmd text)
language sql
stable
security definer
set search_path = public
as $$
  select p.tablename, p.policyname, p.cmd
    from pg_policies p
   where p.schemaname = 'public'
     and p.tablename in ('weight_logs','vaccinations','media_items','medical_visits','treatment_entries')
     and p.permissive = 'PERMISSIVE'
     and p.cmd <> 'SELECT'
     and (coalesce(p.qual, '') || ' ' || coalesce(p.with_check, '')) like '%owner_id%'
   order by 1, 2;
$$;
revoke all on function public.verify_owner_read_only() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from public.verify_owner_read_only()) then
    raise exception 'owner_write_policy_left: %',
      (select string_agg(tablename || '.' || policyname || ':' || cmd, ', ') from public.verify_owner_read_only());
  end if;
end $$;

-- ── ٥) حيوانُ العيادة لا يُحذف ولا يُنقل من حساب مالكه ─────────────────────────
-- حيوانٌ عيادتُه غيرُ مساحة المُنادي وغيرُ حسابه لا يصله بالكتابة إلا من `pets_owner`.
-- منه: يُعدَّل ما يخصّ المالك، ولا يُحذف (التسلسلُ يمحو سجلَّ العيادة)، ولا تتبدّل
-- عيادتُه ولا رقمُه التسلسليّ ولا رمزُ جوازه. ما يعدّله المالكُ فعلاً من PetPassport ولوحته
-- (الاسم، الصورة، الهويّة، الغذاء، جهات الاتصال، المشاركة، رقمُه وبريدُه) لا يُمسّ؛ ولا شاشةَ
-- مالكٍ تحذف حيواناً. invoker يحرس `authenticated` وحده (0162) — دوالُّ المالك والمطالبةُ تمرّ.
create or replace function public.pets_guard_clinic_record()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return coalesce(new, old);
  end if;
  if old.clinic_id is null
     or old.clinic_id = (select auth.uid())
     or old.clinic_id = (select auth_clinic()) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'pet_clinic_record'
      using hint = 'هذا الحيوان مسجَّلٌ بعيادة، وحذفُه يمحو سجلَّها الطبيّ — يُحذف من العيادة نفسها.';
  end if;
  if new.clinic_id      is distinct from old.clinic_id
  or new.serial         is distinct from old.serial
  or new.passport_token is distinct from old.passport_token then
    raise exception 'pet_clinic_record'
      using hint = 'عيادةُ الحيوان ورقمُه ورمزُ جوازه لا تُعدَّل من حساب المالك.';
  end if;
  return new;
end $$;

-- دالّةُ محفّز: لا تُنادى من الواجهة (كـ0039 لـhandle_new_user)، والمحفّزُ لا يحتاج الامتياز ليجري.
revoke execute on function public.pets_guard_clinic_record() from public, anon, authenticated;

drop trigger if exists pets_guard_clinic_record on public.pets;
create trigger pets_guard_clinic_record
  before update or delete on public.pets
  for each row execute function public.pets_guard_clinic_record();

-- ملفُّ مالكٍ مربوطٌ بحيوان عيادة لا يحذفه صاحبُه: `pets.owner_id` يتسلسل بالحذف إلى
-- الحيوان ثم إلى سجلّه. حذفُ الحساب نفسِه (auth.users) طريقُ المشغّل لا يمرّ من هنا.
create or replace function public.profiles_guard_clinic_pets()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then
    return old;
  end if;
  if exists (select 1 from pets p
              where p.owner_id = old.id
                and p.clinic_id is not null
                and p.clinic_id <> old.id) then
    raise exception 'profile_has_clinic_pets'
      using hint = 'حسابٌ مربوطٌ بحيواناتٍ مسجَّلةٍ بعيادة — حذفُه يمحو سجلَّها الطبيّ.';
  end if;
  return old;
end $$;

revoke execute on function public.profiles_guard_clinic_pets() from public, anon, authenticated;

drop trigger if exists profiles_guard_clinic_pets on public.profiles;
create trigger profiles_guard_clinic_pets
  before delete on public.profiles
  for each row execute function public.profiles_guard_clinic_pets();
