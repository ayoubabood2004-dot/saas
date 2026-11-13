-- ============================================================================
-- ٠٢٦٨ — التصنيفاتُ الأساسيّة للأدوية بيد العيادة: تسمية، وإخفاء، وترتيبٌ واحد مع تصنيفاتها
--
-- طلبُ المالك (١٣/١١): «أدوية العيادة وتقسيماتها داخل الإعدادات، والعيادة تتحكّم بكلّ شيء حتى بالتصنيفات الثابتة وترتيبها».
-- كانت العائلاتُ الأربعَ عشرة ثابتةً بالشِفرة (FAMILIES، medIndex.ts) بترتيبٍ ثابت بعد تصنيفات العيادة (0239) — لا تُسمّى ولا تُخفى
-- ولا تُرتَّب. وقرارُ المالك: التصنيفُ الأساسيّ المحذوف **ينخفي ويّا أدويته ويرجعون إذا رجّعته**.
--
-- ── التصميم: العائلةُ صفٌّ بتصنيفات العيادة ──────────────────────────────────
-- `clinic_drug_groups.family`: صفٌّ لكلّ عائلة (تبذره `clinic_drug_families_seed` حين تفتح العيادةُ الإعدادات) — فالترتيبُ قائمةٌ واحدة
-- بأوامر 0239 نفسِها (group_move)، والتسميةُ group_edit، والإخفاءُ group_archive، والإرجاعُ group_restore؛ بلا أمرٍ جديد ولا إعادةِ
-- تعريف clinic_drugs_apply. أعضاءُ العائلة بعائلة الدواء (لا عضويةَ يدوية: محفّزٌ يرفضها)، واسمُها «مفتاحُها» حتى تسمّيه العيادة
-- (الواجهةُ تترجم المفتاح). وعيادةٌ لم تُبذر: العرضُ كما كان (العائلاتُ بعد التصنيفات بترتيبها الثابت).
-- والسقفُ (٦٠ تصنيفاً حيّاً) يعدّ العائلةَ الظاهرة — إخفاؤها يفرغ مكاناً كما يقول التلميح — ولا يمنع بذرها؛ وإرجاعُها كإرجاع أيّ تصنيف.
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- clinic_drug_groups_guard وclinic_drugs_list نصُّ 0239 حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0268`، وحارسُ الانجراف قبل التعريف.
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: أعد الدالّتين من 0239 حرفاً؛ والعمودُ وصفوفُ العائلات تبقى (القائمةُ لا تقولها فتعود الواجهةُ كما كانت).
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regclass('public.clinic_drug_groups') is null then
    raise exception 'needs_0239' using hint = 'طبّق 0239 (تصنيفات الأدوية) و0252 (حارس الانحراف) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.clinic_drug_groups_guard()', '940fa3cbe482f742b1f9515148c8a13b', '-- +0268');
select public._drift_assert('public.clinic_drugs_list()', 'fb8749c9af8b62ef77e9213d20e31948', '-- +0268');

-- ── ١) العمود ───────────────────────────────────────────────────────────────
alter table public.clinic_drug_groups add column if not exists family text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'clinic_drug_groups_family_ck' and conrelid = 'public.clinic_drug_groups'::regclass) then
    alter table public.clinic_drug_groups add constraint clinic_drug_groups_family_ck check (family is null or family in
      ('antibiotics','analgesics','anesthetics','antiparasitics','antifungals','steroids','gi','cardiac','endocrine','derm','fluids','emergency','vitamins','other'));
  end if;
end $$;
create unique index if not exists clinic_drug_groups_family_uq on public.clinic_drug_groups (clinic_id, family) where family is not null;
comment on column public.clinic_drug_groups.family is
  'عائلةٌ أساسيّة (0268): صفٌّ يحمل اسمَها (مفتاحُها حتى تسمّيه العيادة) وموضعَها وإخفاءَها؛ أعضاؤه بعائلة الدواء لا بالعضوية.';

-- ── ٢) الحارس: العائلةُ ثابتةٌ على صفّها، ولا تمنعها السقوف ─────────────────
create or replace function public.clinic_drug_groups_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.name := btrim(regexp_replace(coalesce(new.name, ''), E'[ \t\r\n]+', ' ', 'g'));
  if search_norm(new.name) = '' or char_length(new.name) > 40 then
    raise exception 'drug_group_bad_name' using hint = 'اسم التصنيف لازم يكون بين حرف و٤٠ حرفاً.';
  end if;

  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.created_at := now();
      new.updated_at := now();
    end if;
-- -0268     if new.archived_at is null then
    if new.archived_at is null and new.family is null then   -- +0268
      perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || new.clinic_id::text, 0));
      if (select count(*) from clinic_drug_groups g where g.clinic_id = new.clinic_id and g.archived_at is null) >= 60 then
        raise exception 'drug_groups_full' using hint = 'وصلت ٦٠ تصنيفاً — أرشف تصنيف ما تستعمله أوّلاً.';
      end if;
    end if;
    return new;
  end if;

  if current_user = 'authenticated'
     and (new.id is distinct from old.id or new.clinic_id is distinct from old.clinic_id
          or new.created_at is distinct from old.created_at) then
    raise exception 'drug_group_frozen' using hint = 'هوية التصنيف وعيادته ما تتغيّر';
  end if;
  -- 0268: التصنيفُ الأساسيّ يبقى عائلتَه — لا يصير تصنيفاً خاصّاً ولا عائلةً أخرى (أعضاؤه بعائلتهم).   -- +0268
  if new.family is distinct from old.family then   -- +0268
    raise exception 'drug_group_family_frozen' using hint = 'التصنيف الأساسي ما يتحوّل — سمّه أو أخفيه بس';   -- +0268
  end if;   -- +0268
  -- الاسترجاعُ يُفحص كالإنشاء: الأرشفةُ تُفرغ مكاناً كما يقول التلميح، فلا يعود فوق السقف.
  if old.archived_at is not null and new.archived_at is null then
    perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || new.clinic_id::text, 0));
    if (select count(*) from clinic_drug_groups g where g.clinic_id = new.clinic_id and g.archived_at is null) >= 60 then
      raise exception 'drug_groups_full' using hint = 'وصلت ٦٠ تصنيفاً — أرشف تصنيف ما تستعمله أوّلاً.';
    end if;
  end if;
  if (new.name, new.archived_at) is distinct from (old.name, old.archived_at) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;-- (المحفّزُ نفسُه من 0239 — تعريفُه لا يتغيّر.)

-- ── ٣) لا عضويةَ يدوية بعائلة: أعضاؤها بعائلة الدواء ───────────────────────
create or replace function public.clinic_drug_group_items_family()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if exists (select 1 from clinic_drug_groups g where g.id = new.group_id and g.family is not null) then
    raise exception 'drug_group_builtin' using hint = 'هذا تصنيف أساسي: أدويتُه حسب عائلتها — غيّر عائلة الدواء بدل ما تضيفه';
  end if;
  return new;
end $$;
revoke all on function public.clinic_drug_group_items_family() from public, anon, authenticated;
drop trigger if exists clinic_drug_group_items_family on public.clinic_drug_group_items;
create trigger clinic_drug_group_items_family before insert or update on public.clinic_drug_group_items
  for each row execute function public.clinic_drug_group_items_family();

-- ── ٤) البذر: صفٌّ لكلّ عائلة، بعد تصنيفات العيادة وبترتيب الواجهة ──────────
create or replace function public.clinic_drug_families_seed(p_clinic uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_pos    bigint;
  v_n      integer := 0;
  k        text;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'clinic_switched' using hint = 'تبدّلت العيادة على هذا الجهاز — حدّث الصفحة. ما انحفظ شي.';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || v_clinic::text, 0));
  select coalesce(max(g.pos), 0) into v_pos from clinic_drug_groups g where g.clinic_id = v_clinic and g.archived_at is null;
  foreach k in array array['antibiotics','analgesics','anesthetics','antiparasitics','antifungals','steroids',
                           'gi','cardiac','endocrine','derm','fluids','emergency','vitamins','other'] loop
    if not exists (select 1 from clinic_drug_groups g where g.clinic_id = v_clinic and g.family = k) then
      v_pos := v_pos + 1024;
      insert into clinic_drug_groups (clinic_id, name, family, pos) values (v_clinic, k, k, v_pos);
      v_n := v_n + 1;
    end if;
  end loop;
  return v_n;
end $$;
revoke all on function public.clinic_drug_families_seed(uuid) from public, anon;
grant execute on function public.clinic_drug_families_seed(uuid) to authenticated;

-- ── ٥) القائمةُ تقول العائلة ─────────────────────────────────────────────
create or replace function public.clinic_drugs_list()
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  return jsonb_build_object(
    'clinic', v_clinic,
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'name', d.name, 'family', d.family, 'in_mine', d.in_mine, 'pos', d.pos,
               'archived_at', d.archived_at, 'created_at', d.created_at, 'updated_at', d.updated_at)
             order by d.in_mine desc, d.pos, d.created_at, d.id)
        from clinic_drugs d
       where d.clinic_id = v_clinic), '[]'::jsonb),
    'groups', coalesce((
      select jsonb_agg(jsonb_build_object(
-- -0268                'id', g.id, 'name', g.name, 'pos', g.pos, 'archived_at', g.archived_at,
               'id', g.id, 'name', g.name, 'family', g.family, 'pos', g.pos, 'archived_at', g.archived_at,   -- +0268
               'created_at', g.created_at, 'updated_at', g.updated_at)
             order by (g.archived_at is not null), g.pos, g.archived_at desc, g.id)
        from clinic_drug_groups g
       where g.clinic_id = v_clinic), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object('group_id', i.group_id, 'drug_id', i.drug_id, 'pos', i.pos)
             order by i.group_id, i.pos, i.drug_id)
        from clinic_drug_group_items i
       where i.clinic_id = v_clinic), '[]'::jsonb));
end $$;
revoke all on function public.clinic_drugs_list() from public, anon;
grant execute on function public.clinic_drugs_list() to authenticated;
revoke all on function public.clinic_drug_groups_guard() from public, anon, authenticated;

reset lock_timeout;
