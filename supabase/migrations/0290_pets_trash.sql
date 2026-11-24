-- ============================================================================
-- ٠٢٩٠ — حذفُ الحيوان: لصاحب الصلاحية وحده، ويرجع كما كان
--
-- ── ما كان ───────────────────────────────────────────────────────────────
-- زرُّ الحذف بسجلّ المرضى لكلّ الكادر (لا فحصَ دورٍ بالواجهة ولا بالقاعدة —
-- سياسةُ `pets_clinic_all` لكلّ أمرٍ)، وتأكيدُه «متأكّد؟» بلا ذكرِ ما يُمحى، والحذفُ
-- **نهائيّ**: المفاتيحُ الأجنبية `on delete cascade` تمحو مع الحيوان زياراتِه ولقاحاتِه
-- وطبلتَه وإقاماتِه ومواعيدَه ومرفقاتِه وراجيتاتِه — وإجراءاتُ المفاتيح لا تمرّ من RLS
-- (0257). والواجهةُ تمحو ملفّاتِ المرفقات من الدلو قبلها. وسطورُ التدقيق غيرُ الماليّة
-- تُكنس بعد ٩٠ يوماً (0241)، فيختفي حتى أثرُ الحذف. «اختفى كأنه ما كان» = حُذف — وهذا
-- ما علّمنا إيّاه المخزنُ (0145/0146).
--
-- ── العلاج (نمطُ 0146) ─────────────────────────────────────────────────────
--   ١) الصلاحية: `deletePets` بـstaff_can — المديرُ دائماً (وصاحبُ العيادة، ومفتاحُ المدير
--      الحيّ، والمشغّلُ داخلها: 0151)، وغيرُه بمنحٍ صريحٍ من المدير. محفّزٌ invoker
--      (`pets_delete_guard`) يرفض حذفاً مباشراً من PostgREST لغيرهم **بصوت** (42501) —
--      سياسةُ حذفٍ مقيِّدة كانت تمرّ على صفرِ صفوفٍ بلا خطأ فتقول الواجهةُ القديمة «انحذف».
--   ٢) الطيّ: محفّزٌ قبل الحذف (`pets_trash_guard`) يصوّر الحيوانَ **وكلَّ صفٍّ يتسلسل معه**
--      بـ`pets_trash` — بأيّ طريقٍ خرج (delete_pet، حذفٌ مباشر من نسخةٍ قديمة، سطرُ SQL).
--      والصفوفُ التي يُفرغ الحذفُ عمودَها (`on delete set null`، مثلُ رسائل الواتساب) تُحفظ
--      معرّفاتُها ليُعاد ربطُها.
--   ٣) الاسترجاع (`restore_pet`) يعيد الحيوانَ وصفوفَه **بنفس المعرّفات**: ما لا يتبعه بمفتاح
--      (الفواتير، معلَّقاتُ الجرعات 0269، سجلُّ الحركات) يرجع إليه وحده.
--   ٤) المعاينة (`pet_delete_preview`) تعدّ ما سيُرفع جدولاً جدولاً — النافذةُ تقوله بالاسم.
--
-- ── لا يُفلت جدول ─────────────────────────────────────────────────────────
-- القائمةُ (`_pets_trash_spec`) صريحة وبترتيب الاسترجاع، لكنّ ما يُصوَّر يُقرأ من الكتالوج:
-- كلُّ مفتاحٍ أجنبيٍّ بـ`cascade` إلى الحيوان أو إلى جدولٍ يُصوَّر. مفتاحٌ تضيفه هجرةٌ لاحقة
-- ولا تضيفه هنا ⇒ `verify_pets_trash()` تسمّيه، **والحذفُ يُرفض** (`pet_trash_uncovered`)
-- لا يمحو بصمت. تُسأل على الإنتاج بعد كلّ هجرة كـverify_photographer_fence: صفرُ صفوف.
--
-- ── ما يحدث بالاسترجاع ولا يُترك ──────────────────────────────────────────
-- الإدخالُ يُطلق محفّزاتِ الجداول كأنها جديدة. فالدالّةُ definer (محفّزاتُ الختم
-- `current_user = 'authenticated'` تمرّ فيبقى ختمُ الكاتب واللحظة كما كان)، ومعلَّقُ جرعةٍ
-- (0269) يجد معلَّقَه القديم بالمعرّف نفسِه فلا يُضاعَف — وما يولّده الاسترجاعُ بمعاملته من
-- معلَّقٍ أو «دخل» بسجلّ الحركات يُرفع قبل أن تنتهي (ليس حدثاً: الإقامةُ لم تبدأ اليوم).
-- وحصّةُ الخطة (0104) تبقى: استرجاعٌ يتجاوزها يُرفض بـpet_limit_reached كأيّ إدخال.
-- وما تغيّر أثناء الغياب: مفتاحٌ `set null` غاب هدفُه يُفرغ (ما يفعله المخطّطُ نفسُه حين
-- يغيب الأب)، والرقمُ أو رمزُ الجواز إن أخذه غيرُه يُولَّد جديداً؛ وغيرُ ذلك يُرفض بصوت.
--
-- ── ما لا يتغيّر ──────────────────────────────────────────────────────────
-- `pets` وكلُّ قارئه كما هما؛ لا عمودَ جديد ولا سياسة. ملفّاتُ المرفقات تبقى بالدلو
-- (الواجهةُ الجديدة لا تمحوها) ليرجع الحيوانُ بصوره. والمالُ لا يُمسّ.
-- السلّةُ لا تُكنس — كنسُها قرارُ المالك.
--
-- تُطبَّق بعد 0289، وتُعاد بلا أثرٍ ثانٍ. تراجع:
--   drop trigger if exists pets_trash_guard on public.pets;
--   drop trigger if exists pets_delete_guard on public.pets;
--   drop function if exists public.delete_pet(uuid, text), public.restore_pet(uuid),
--     public.pet_delete_preview(uuid), public.pets_trash_capture(), public.pets_delete_guard(),
--     public.verify_pets_trash(), public._pets_trash_collect(uuid, boolean),
--     public._pets_trash_insert(text, text, jsonb), public._pets_trash_fks(),
--     public._pets_trash_spec(), public.pet_delete_allowed();
--   (والجدولُ `pets_trash` يبقى — فيه ما حُذف.)
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) السلّة ───────────────────────────────────────────────────────────────
create table if not exists public.pets_trash (
  id              uuid primary key,                 -- معرّفُ الحيوان نفسُه، ليُستعاد به
  clinic_id       uuid not null references auth.users(id) on delete cascade,
  pet_name        text,
  owner_name      text,
  owner_phone     text,
  species         text,
  serial          text,
  row             jsonb not null,                   -- صفُّ الحيوان لحظةَ الحذف
  children        jsonb not null default '{}'::jsonb,   -- {"جدول": [صفوف…]}
  relinks         jsonb not null default '[]'::jsonb,   -- [{schema, tbl, col, rows: [[id, الأب]…]}]
  counts          jsonb not null default '{}'::jsonb,   -- {"جدول": عدد}
  reason          text,
  deleted_by      uuid,
  deleted_by_name text,
  deleted_at      timestamptz not null default now(),
  constraint pets_trash_reason check (char_length(coalesce(reason, '')) <= 300)
);
comment on table public.pets_trash is
  'حيوانٌ حُذف بكلّ ما تسلسل معه (0290): يُعاد بنفس المعرّفات من restore_pet. قراءةٌ وحدها — الكتابةُ من المحفّز والدالّتين.';
create index if not exists pets_trash_clinic_idx on public.pets_trash (clinic_id, deleted_at desc);

alter table public.pets_trash enable row level security;
drop policy if exists pets_trash_read on public.pets_trash;
create policy pets_trash_read on public.pets_trash for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.pets_trash from public, anon, authenticated;
grant select on table public.pets_trash to authenticated;
-- السياجُ من 0222 (تراجعُها يحذف دالّتَه — فإعادةُ هذه بعده لا تفشل). verify_photographer_fence يمسك الغيابَ بالإنتاج.
do $$
begin
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('pets_trash');
  end if;
end $$;

-- ── ٢) الصلاحية ─────────────────────────────────────────────────────────────
-- staff_can تُسأل بـexecute: تراجعُ 0222 يحذفها (كـlibrary_can_write، 0285)، وبلاها المديرُ وحده.
create or replace function public.pet_delete_allowed()
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v boolean := false;
begin
  if auth.uid() is null then return false; end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v using 'deletePets';
    return coalesce(v, false);
  end if;
  return coalesce(auth_role() = 'manager', false);
end $$;
revoke all on function public.pet_delete_allowed() from public, anon;
grant execute on function public.pet_delete_allowed() to authenticated;

-- ── ٣) ما يُصوَّر، وبأيّ ترتيبٍ يرجع ─────────────────────────────────────────
-- الآباءُ قبل الأبناء: زيارةُ العيادة قبل ما يشير إليها (الملاحظات، الطبلة، العمليات)،
-- والرحلةُ قبل أحداثها. verify_pets_trash تفحص الترتيبَ على الكتالوج.
create or replace function public._pets_trash_spec()
returns table (ord int, tbl text, col text, parent text)
language sql
immutable
set search_path = public
as $$
  values
    ( 10, 'clinic_visits',     'pet_id',     'pets'),
    ( 20, 'medical_visits',    'pet_id',     'pets'),
    ( 30, 'admissions',        'pet_id',     'pets'),
    ( 40, 'appointments',      'pet_id',     'pets'),
    ( 50, 'reminders',         'pet_id',     'pets'),
    ( 60, 'weight_logs',       'pet_id',     'pets'),
    ( 70, 'vaccinations',      'pet_id',     'pets'),
    ( 80, 'media_items',       'pet_id',     'pets'),
    ( 90, 'treatment_entries', 'pet_id',     'pets'),
    (100, 'pet_notes',         'pet_id',     'pets'),
    (110, 'surgeries',         'pet_id',     'pets'),
    (120, 'lab_results',       'pet_id',     'pets'),
    (130, 'pet_problems',      'pet_id',     'pets'),
    (140, 'care_entries',      'pet_id',     'pets'),
    (150, 'journeys',          'pet_id',     'pets'),
    (160, 'journey_events',    'journey_id', 'journeys'),
    (170, 'pet_prescriptions', 'pet_id',     'pets'),
    (180, 'pet_case_reports',  'pet_id',     'pets')
$$;
revoke all on function public._pets_trash_spec() from public, anon, authenticated;

-- كلُّ مفتاحٍ أجنبيٍّ إلى الحيوان أو إلى جدولٍ بالقائمة — كما هو بالكتالوج الآن.
-- `ord` = مدخلُ القائمة المطابق (الجدول والعمود والأب معاً)، وإلا فارغ.
create or replace function public._pets_trash_fks()
returns table (child_schema text, child text, col text, parent text, action text, ord int,
               uuid_id boolean, ncols int, conname text)
language sql
stable
set search_path = public, pg_catalog
as $$
  with spec as (select * from public._pets_trash_spec())
  select cn.nspname::text, cr.relname::text, a.attname::text, pr.relname::text, c.confdeltype::text, s.ord,
         exists (select 1 from pg_attribute i
                  where i.attrelid = c.conrelid and i.attname = 'id' and not i.attisdropped
                    and i.atttypid = 'uuid'::regtype),
         cardinality(c.conkey), c.conname::text
    from pg_constraint c
    join pg_class pr on pr.oid = c.confrelid
    join pg_namespace pn on pn.oid = pr.relnamespace
    join pg_class cr on cr.oid = c.conrelid
    join pg_namespace cn on cn.oid = cr.relnamespace
    left join pg_attribute a on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
    left join spec s on cn.nspname = 'public' and s.tbl = cr.relname::text
                    and s.col = a.attname::text and s.parent = pr.relname::text
   where c.contype = 'f'
     and pn.nspname = 'public'
     and (pr.relname = 'pets' or pr.relname in (select spec.tbl from spec))
$$;
revoke all on function public._pets_trash_fks() from public, anon, authenticated;

-- ما يُفلت من السلّة لو حُذف حيوانٌ الآن — صفرُ صفوفٍ هو المطلوب.
create or replace function public.verify_pets_trash()
returns setof text
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  select format('%s.%s.%s → %s (%s): %s', f.child_schema, f.child, coalesce(f.col, '?'), f.parent, f.conname, w.why)
    from public._pets_trash_fks() f
    cross join lateral (select case
        when f.ncols <> 1 and f.action in ('c', 'n', 'd') then 'مفتاحٌ بأكثر من عمود'
        when f.action = 'd' then 'set default لا يُعاد ربطُه'
        when f.action = 'c' and f.ord is null then 'cascade ولا يُصوَّر — أضفه لـ_pets_trash_spec'
        when f.action in ('c', 'n') and not f.uuid_id then 'بلا معرّف uuid اسمُه id'
      end as why) w
   where w.why is not null
  union all
  -- الترتيب: صفٌّ يُعاد قبل أبيه يُرفض بمفتاحه.
  select format('%s.%s → %s: يرجع قبل أبيه بالقائمة', f.child, f.col, f.parent)
    from public._pets_trash_fks() f
    join public._pets_trash_spec() c on c.tbl = f.child
    join public._pets_trash_spec() p on p.tbl = f.parent
   where f.child_schema = 'public' and c.ord <= p.ord
$$;
revoke all on function public.verify_pets_trash() from public, anon, authenticated;

-- ── ٤) الجمع: ما سيُرفع مع الحيوان ──────────────────────────────────────────
-- p_full = الصفوفُ نفسُها (للسلّة)، وإلا العددُ والمعرّفاتُ وحدها (للمعاينة).
create or replace function public._pets_trash_collect(p_pet uuid, p_full boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  f        record;
  v_ids    jsonb := jsonb_build_object('pets', jsonb_build_array(p_pet));
  v_child  jsonb := '{}'::jsonb;
  v_counts jsonb := '{}'::jsonb;
  v_links  jsonb := '[]'::jsonb;
  v_rows   jsonb;
  v_rowids jsonb;
  v_parent uuid[];
  v_own    uuid[];
begin
  for f in select * from public._pets_trash_fks() x where x.action = 'c' and x.ord is not null order by x.ord loop
    v_parent := array(select jsonb_array_elements_text(coalesce(v_ids -> f.parent, '[]'::jsonb))::uuid);
    continue when cardinality(v_parent) = 0;
    if p_full then
      execute format('select coalesce(jsonb_agg(to_jsonb(t) order by t.id), ''[]''::jsonb), coalesce(jsonb_agg(t.id order by t.id), ''[]''::jsonb)
                        from public.%I t where t.%I = any($1)', f.child, f.col)
        into v_rows, v_rowids using v_parent;
    else
      execute format('select coalesce(jsonb_agg(t.id order by t.id), ''[]''::jsonb) from public.%I t where t.%I = any($1)', f.child, f.col)
        into v_rowids using v_parent;
    end if;
    continue when jsonb_array_length(v_rowids) = 0;
    v_ids := v_ids || jsonb_build_object(f.child, v_rowids);
    v_counts := v_counts || jsonb_build_object(f.child, jsonb_array_length(v_rowids));
    if p_full then v_child := v_child || jsonb_build_object(f.child, v_rows); end if;
  end loop;

  -- ما يُفرغ الحذفُ عمودَه ولا يُرفع معه: معرّفُه وأبوه، ليُعاد ربطُه.
  if p_full then
    for f in select * from public._pets_trash_fks() x where x.action = 'n' loop
      v_parent := array(select jsonb_array_elements_text(coalesce(v_ids -> f.parent, '[]'::jsonb))::uuid);
      continue when cardinality(v_parent) = 0;
      v_own := array(select jsonb_array_elements_text(coalesce(v_ids -> f.child, '[]'::jsonb))::uuid);
      execute format('select coalesce(jsonb_agg(jsonb_build_array(t.id, t.%1$I) order by t.id), ''[]''::jsonb)
                        from %2$I.%3$I t where t.%1$I = any($1) and not (t.id = any($2))', f.col, f.child_schema, f.child)
        into v_rows using v_parent, v_own;
      continue when jsonb_array_length(v_rows) = 0;
      v_links := v_links || jsonb_build_array(jsonb_build_object(
        'schema', f.child_schema, 'tbl', f.child, 'col', f.col, 'rows', v_rows));
    end loop;
  end if;

  return jsonb_build_object('children', v_child, 'counts', v_counts, 'relinks', v_links);
end $$;
revoke all on function public._pets_trash_collect(uuid, boolean) from public, anon, authenticated;

-- ── ٥) الحارسان: قبل أيّ حذف ────────────────────────────────────────────────
-- (أ) الصلاحية — invoker لأن `current_user` هو ما يُسأل: طلبُ PostgREST يصل بـ`authenticated`،
--     ودوالُّ المالك (delete_pet تفحص بنفسها) تمرّ. وحيوانُ عيادةٍ أخرى (بوّابةُ المالك) ليس
--     شأنَه — 0249 تحرسه.
create or replace function public.pets_delete_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if current_user = 'authenticated'
     and old.clinic_id is not null
     and old.clinic_id = (select auth_clinic())
     and not public.pet_delete_allowed() then
    raise exception 'pet_delete_forbidden' using errcode = '42501',
      hint = 'حذف الحيوان للمدير، أو لمن عنده صلاحية «حذف الحيوانات».';
  end if;
  return old;
end $$;
revoke all on function public.pets_delete_guard() from public, anon, authenticated;
drop trigger if exists pets_delete_guard on public.pets;
create trigger pets_delete_guard before delete on public.pets
  for each row execute function public.pets_delete_guard();

-- (ب) الصورة — definer: السلّةُ بلا سياسة كتابة، والجمعُ يرى كلَّ صفٍّ لا ما تسمح به RLS.
create or replace function public.pets_trash_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := to_jsonb(old);
  v_bad text;
  v_c   jsonb;
begin
  -- حيوانُ حسابِ مالكٍ بلا عيادة، أو حذفُ الحساب نفسِه (cascade من auth.users): لا صاحبَ للسلّة
  -- والمفتاحُ يرفض — نمرّ (كـ0146).
  if old.clinic_id is null or not exists (select 1 from auth.users u where u.id = old.clinic_id) then
    return old;
  end if;
  select string_agg(x, '; ') into v_bad from public.verify_pets_trash() x;
  if v_bad is not null then
    raise exception 'pet_trash_uncovered' using errcode = 'P0001', detail = v_bad,
      hint = 'الحذف موقوف: بالقاعدة جدولٌ ينمسح ويا الحيوان وما ينحفظ بالمحذوفات — بلّغ الدعم.';
  end if;
  v_c := public._pets_trash_collect(old.id, true);
  insert into public.pets_trash as t (id, clinic_id, pet_name, owner_name, owner_phone, species, serial,
                                      row, children, relinks, counts, reason, deleted_by, deleted_by_name, deleted_at)
  values (old.id, old.clinic_id, v_old->>'name', v_old->>'owner_name', v_old->>'owner_phone', v_old->>'species', v_old->>'serial',
          v_old, v_c->'children', v_c->'relinks', v_c->'counts',
          nullif(left(btrim(coalesce(current_setting('doctorvet.pet_delete_reason', true), '')), 300), ''),
          auth.uid(),
          (select nullif(btrim(s.name), '') from staff s where s.user_id = auth.uid() and s.clinic_id = old.clinic_id limit 1),
          now())
  on conflict (id) do update
    set clinic_id = excluded.clinic_id, pet_name = excluded.pet_name, owner_name = excluded.owner_name,
        owner_phone = excluded.owner_phone, species = excluded.species, serial = excluded.serial,
        row = excluded.row, children = excluded.children, relinks = excluded.relinks, counts = excluded.counts,
        reason = excluded.reason, deleted_by = excluded.deleted_by, deleted_by_name = excluded.deleted_by_name,
        deleted_at = excluded.deleted_at;
  return old;
end $$;
revoke all on function public.pets_trash_capture() from public, anon, authenticated;
drop trigger if exists pets_trash_guard on public.pets;
create trigger pets_trash_guard before delete on public.pets
  for each row execute function public.pets_trash_capture();

-- ── ٦) المعاينة: ما سيُرفع، بالعدد ──────────────────────────────────────────
create or replace function public.pet_delete_preview(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_p       jsonb;
  v_c       jsonb;
  v_pending int := 0;
  v_active  boolean := false;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using errcode = '42501', hint = 'سجّل دخولك من جديد.';
  end if;
  select to_jsonb(p) into v_p from pets p where p.id = p_id and p.clinic_id = v_clinic;
  if v_p is null then
    raise exception 'pet_not_found' using errcode = 'P0002',
      hint = 'الحيوان مو موجود بعيادتك — ربما انحذف من جهاز ثاني. حدّث الصفحة.';
  end if;
  v_c := public._pets_trash_collect(p_id, false);
  -- جرعاتٌ معطاةٌ لم تُبَع (0269): تختفي من البيع ما دام الحيوانُ محذوفاً، وترجع معه.
  if to_regclass('public.dose_charges') is not null then
    execute 'select count(*) from public.dose_charges c where c.clinic_id = $1 and c.pet_id = $2 and c.status = ''pending'''
      into v_pending using v_clinic, p_id;
  end if;
  if to_regclass('public.admissions') is not null then
    execute 'select exists (select 1 from public.admissions a where a.pet_id = $1 and a.status = ''active'')'
      into v_active using p_id;
  end if;
  return jsonb_build_object(
    'id', p_id, 'name', v_p->>'name', 'owner_name', v_p->>'owner_name', 'species', v_p->>'species',
    'serial', v_p->>'serial', 'counts', v_c->'counts', 'pending_charges', v_pending,
    'active_admission', v_active, 'allowed', public.pet_delete_allowed());
end $$;
revoke all on function public.pet_delete_preview(uuid) from public, anon;
grant execute on function public.pet_delete_preview(uuid) to authenticated;

-- ── ٧) الحذف ───────────────────────────────────────────────────────────────
create or replace function public.delete_pet(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_t      public.pets_trash;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using errcode = '42501', hint = 'سجّل دخولك من جديد.';
  end if;
  if not public.pet_delete_allowed() then
    raise exception 'pet_delete_forbidden' using errcode = '42501',
      hint = 'حذف الحيوان للمدير، أو لمن عنده صلاحية «حذف الحيوانات».';
  end if;
  perform 1 from pets p where p.id = p_id and p.clinic_id = v_clinic for update;
  if not found then
    raise exception 'pet_not_found' using errcode = 'P0002',
      hint = 'الحيوان مو موجود بعيادتك — ربما انحذف من جهاز ثاني. حدّث الصفحة.';
  end if;
  perform set_config('doctorvet.pet_delete_reason', left(btrim(coalesce(p_reason, '')), 300), true);
  delete from pets p where p.id = p_id and p.clinic_id = v_clinic;
  perform set_config('doctorvet.pet_delete_reason', '', true);
  -- لا حذفَ بلا صورة: محفّزٌ أُطفئ أو تجاوزه طريقٌ ما ⇒ ترجع المعاملةُ كلُّها.
  select * into v_t from public.pets_trash t where t.id = p_id and t.clinic_id = v_clinic;
  if v_t.id is null then
    raise exception 'pet_trash_missing' using errcode = 'P0001',
      hint = 'ما انحفظت نسخة الحيوان بالمحذوفات، فما انحذف — بلّغ الدعم.';
  end if;
  return jsonb_build_object('id', v_t.id, 'name', v_t.pet_name, 'counts', v_t.counts);
end $$;
revoke all on function public.delete_pet(uuid, text) from public, anon;
grant execute on function public.delete_pet(uuid, text) to authenticated;

-- ── ٨) الاسترجاع ───────────────────────────────────────────────────────────
-- إدخالُ صفوفٍ من صورتها: الأعمدةُ الموجودةُ بالصورة وبالجدول معاً (عمودٌ أُضيف بعد الحذف يأخذ
-- افتراضَه لا null)، و`set null` غاب هدفُه يُفرغ قبل الإدخال. غيرُ ذلك يُرفض بصوت — لا
-- `on conflict do nothing`: صفٌّ يُسقط بصمتٍ قائمةٌ ناقصةٌ تُصدَّق.
create or replace function public._pets_trash_insert(p_schema text, p_tbl text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rel     regclass := format('%I.%I', p_schema, p_tbl)::regclass;
  v_rows    jsonb := p_rows;
  v_cols    text;
  v_missing text[];
  f         record;
begin
  if v_rows is null or jsonb_typeof(v_rows) <> 'array' or jsonb_array_length(v_rows) = 0 then return; end if;
  for f in
    select a.attname::text as col, pn.nspname::text as ps, pr.relname::text as pt, pa.attname::text as pc
      from pg_constraint c
      join pg_attribute a  on a.attrelid = c.conrelid and a.attnum = c.conkey[1]
      join pg_class pr     on pr.oid = c.confrelid
      join pg_namespace pn on pn.oid = pr.relnamespace
      join pg_attribute pa on pa.attrelid = c.confrelid and pa.attnum = c.confkey[1]
     where c.conrelid = v_rel and c.contype = 'f' and c.confdeltype = 'n' and cardinality(c.conkey) = 1
  loop
    execute format('select array_agg(distinct x.v) from (select e->>%L as v from jsonb_array_elements($1) e) x
                     where x.v is not null and not exists (select 1 from %I.%I p where p.%I::text = x.v)', f.col, f.ps, f.pt, f.pc)
      into v_missing using v_rows;
    if v_missing is not null then
      select jsonb_agg(case when e->>f.col = any(v_missing) then jsonb_set(e, array[f.col], 'null'::jsonb) else e end order by n)
        into v_rows from jsonb_array_elements(v_rows) with ordinality as x(e, n);
    end if;
  end loop;
  select string_agg(quote_ident(a.attname), ', ' order by a.attnum) into v_cols
    from pg_attribute a
   where a.attrelid = v_rel and a.attnum > 0 and not a.attisdropped and a.attgenerated = ''
     and (v_rows -> 0) ? a.attname::text;
  execute format('insert into %1$s (%2$s) overriding system value select %2$s from jsonb_populate_recordset(null::%1$s, $1)',
                 v_rel, v_cols)
    using v_rows;
end $$;
revoke all on function public._pets_trash_insert(text, text, jsonb) from public, anon, authenticated;

create or replace function public.restore_pet(p_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_t      public.pets_trash;
  v_row    jsonb;
  k        text;
  s        record;
  e        jsonb;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using errcode = '42501', hint = 'سجّل دخولك من جديد.';
  end if;
  if not public.pet_delete_allowed() then
    raise exception 'pet_restore_forbidden' using errcode = '42501',
      hint = 'استرجاع الحيوان للمدير، أو لمن عنده صلاحية «حذف الحيوانات».';
  end if;
  select * into v_t from public.pets_trash t where t.id = p_id and t.clinic_id = v_clinic for update;
  if v_t.id is null then
    raise exception 'pet_not_in_trash' using errcode = 'P0002',
      hint = 'الحيوان مو بالمحذوفات — ربما رجّعه أحد من جهاز ثاني. حدّث الصفحة.';
  end if;
  if exists (select 1 from pets p where p.id = p_id) then
    raise exception 'pet_exists' using errcode = 'P0001', hint = 'الحيوان موجود أصلاً — حدّث الصفحة.';
  end if;
  -- كلُّ جدولٍ بالصورة يُعرف ويوجد، وإلا رجع الحيوانُ ناقصاً بلا كلمة.
  for k in select jsonb_object_keys(v_t.children) loop
    if not exists (select 1 from public._pets_trash_spec() x where x.tbl = k) or to_regclass(format('public.%I', k)) is null then
      raise exception 'pet_restore_unknown_table' using errcode = 'P0001', detail = k,
        hint = 'نسخة الحيوان فيها جدول ما تعرفه القاعدة الحالية — بلّغ الدعم.';
    end if;
  end loop;

  v_row := v_t.row;
  if v_row->>'serial' is not null and exists (select 1 from pets p where p.serial = v_row->>'serial') then
    v_row := v_row - 'serial';
  end if;
  if v_row->>'passport_token' is not null and exists (select 1 from pets p where p.passport_token = v_row->>'passport_token') then
    v_row := v_row - 'passport_token';
  end if;
  perform public._pets_trash_insert('public', 'pets', jsonb_build_array(v_row));

  for s in select x.tbl from public._pets_trash_spec() x where v_t.children ? x.tbl order by x.ord loop
    perform public._pets_trash_insert('public', s.tbl, v_t.children -> s.tbl);
  end loop;

  for e in select x from jsonb_array_elements(v_t.relinks) x loop
    continue when to_regclass(format('%I.%I', e->>'schema', e->>'tbl')) is null;
    execute format('update %1$I.%2$I t set %3$I = (r->>1)::uuid from jsonb_array_elements($1) r
                     where t.id = (r->>0)::uuid and t.%3$I is null', e->>'schema', e->>'tbl', e->>'col')
      using e->'rows';
  end loop;

  -- ما ولّده الإدخالُ بمعاملته ليس حدثاً: معلَّقُ جرعةٍ لم يكن (دواءٌ تسعّر بعد إعطائها)،
  -- و«دخل» بسجلّ الحركات بلحظة الاسترجاع (الإقامةُ لم تبدأ اليوم).
  if to_regclass('public.dose_charges') is not null then
    execute 'delete from public.dose_charges c where c.pet_id = $1 and c.created_at = now()' using p_id;
  end if;
  if to_regclass('public.pet_movements') is not null then
    execute 'delete from public.pet_movements m where m.pet_id = $1 and m.created_at = now()' using p_id;
  end if;

  delete from public.pets_trash t where t.id = p_id;
  return jsonb_build_object('id', v_t.id, 'name', v_t.pet_name, 'counts', v_t.counts);
end $$;
revoke all on function public.restore_pet(uuid) from public, anon;
grant execute on function public.restore_pet(uuid) to authenticated;
