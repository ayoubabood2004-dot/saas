-- ============================================================================
-- ٠٢٢٩ — «أدويتي»: قائمةُ العيادة الواحدة بترتيبها (طلبُ المالك، ٩/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- ثلاثةُ أنصافِ قوائم ولا قائمة واحدة:
--   • بابُ «أدويتي» بمنتقي الأدوية = آخرُ عشرةٍ استُعملت **على هذا الجهاز**
--     (`vp_recent_drugs`، مفتاحٌ واحدٌ للمتصفّح كلّه، مشتركٌ بين العيادات)؛
--   • «المفضّلة» (0221) لكلّ طبيبٍ بروحه — ٦ صفوفٍ من طبيبين بكلّ الإنتاج؛
--   • «أدوية العيادة» (0021) بلا ترتيبٍ ولا فريد، تُحذف بـ`ilike` وتُعاد من مرآة
--     جهازٍ آخر — ٤٦ صفّاً بعشر عيادات.
-- ولا واحدةٌ منها تحمل ترتيباً، والمالكُ يريد قائمةً **واحدةً للعيادة** يرتّبها
-- بالسحب، وتظهر بنفس الترتيب بكلّ شاشةٍ يُختار فيها دواء.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `clinic_drugs`: صفٌّ لكلّ دواءٍ قالت العيادةُ عنه شيئاً. «أدويتي» علَمٌ عليه
--   (`in_mine`) وموضع (`pos`) — لا يقول شيئاً عن المخزن. وصفٌّ حيٌّ واحد لكلّ اسمٍ
--   بمفتاح `search_norm` (مرآةُ `searchable()` — الطرفان من نفس الدالّة).
-- • لا حذفَ أبداً — لا صلاحيةَ ولا سياسة: الأرشفةُ والاسترجاع (درسُ 0145).
-- • الكتابةُ بابٌ واحد `clinic_drugs_apply(p_clinic, p_ops)`: عملياتٌ نسبيّة («بعد
--   فلان»)، والموضعُ **يحسبه الخادم** تحت قفلٍ استشاريٍّ للعيادة — جهازان يسحبان
--   معاً يتسلسلان، ولا يكتب أحدُهما ترتيباً قديماً فوق الآخر. ومرآتُها `applyOps`
--   بـ`src/lib/medIndex.ts`، ويفحص تطابقَهما `clinic-drugs-parity` بهذه الحزمة.
-- • السياساتُ شرطُ ملكيّةٍ وحده (0159/0162)، والتجميدُ بمحفّز، وسياجُ المصوّر (0222)
--   — كلُّ الكادر يعدّل عدا المصوّر، كـ«أدوية العيادة» اليوم (جوابُ المالك ١).
-- • التدقيقُ على المحتوى (الاسم، العائلة، النجمة، الأرشفة) — السحبُ لا يكتب سطراً.
-- • `clinic_drugs_suggest(p_days)`: قراءةٌ وحدها — أكثرُ ما استعملته العيادةُ آخرَ
--   ٩٠ يوماً لزرّ «ضيف الأدوية…»، ولا يضيف شيئاً بنفسه (جوابُ المالك ٣).
--
-- ⚠ الفهرسُ الفريد على `search_norm(name)`: أيُّ هجرةٍ تعيد تعريفَ `search_norm` لازم
--   تكتب `reindex index public.clinic_drugs_name_uq` (db-guard: norm-reindex) — وإلا
--   بقي الفهرسُ بمفاتيح الدالّة القديمة فيدخل التوأمُ أو يُرفض اسمٌ سليم، بصمت.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ؛ الواجهاتُ القديمة لا تراها. تُطبَّق بعد 0228 وقبل 0230.
-- تراجع: drop function clinic_drugs_suggest(int); drop function clinic_drugs_apply(uuid, jsonb);
--   drop function clinic_drugs_list(); drop table clinic_drugs; drop function clinic_drugs_guard();
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) الجدول ─────────────────────────────────────────────────────────────
create table if not exists public.clinic_drugs (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  -- النصُّ الوحيد الذي يُكتب بالسجلّات: اسمُ الكتالوج كما هو («Amoxicillin 250mg»).
  name        text not null check (char_length(btrim(name)) between 1 and 120),
  family      text not null default 'other'
              check (family in ('antibiotics','analgesics','anesthetics','antiparasitics','antifungals','steroids','gi','cardiac','endocrine','derm','fluids','emergency','vitamins','other')),
  in_mine     boolean not null default false,
  pos         bigint,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clinic_drugs_pos_ck  check (in_mine = (pos is not null)),
  constraint clinic_drugs_arch_ck check (archived_at is null or not in_mine)
);
comment on table public.clinic_drugs is
  'أدوية العيادة و«أدويتي» (0229): صفٌّ لكلّ دواء، و«أدويتي» علَمٌ وموضع. لا يُحذف — يُؤرشف. الكتابة عبر clinic_drugs_apply.';

-- صفٌّ حيٌّ واحد لكلّ اسمٍ بالعيادة، بنفس تطبيع searchable() بالواجهة.
-- ⚠ إعادةُ تعريف search_norm ⇒ reindex index public.clinic_drugs_name_uq (db-guard).
create unique index if not exists clinic_drugs_name_uq
  on public.clinic_drugs (clinic_id, search_norm(name)) where archived_at is null;
-- فهرسُ مفتاح العيادة (كاملٌ لا جزئيّ — db-guard) وترتيبُ «أدويتي».
create index if not exists clinic_drugs_clinic_pos_idx on public.clinic_drugs (clinic_id, pos);

-- ── ٢) الحارس: الاسم، السقف، والأعمدةُ المجمَّدة ──────────────────────────────
-- invoker: يحرس ما تقدر السياسةُ أن تكتبه ولا يشدّ أكثر منها؛ والتجميدُ لدور
-- authenticated وحده (الهجرةُ ودوالُّ المالك تمرّ) — بمحفّزٍ لا بسياسة (0162).
-- عدُّ جدوله داخل محفّزٍ مسموح؛ السياسةُ وحدها لا تقرأ جدولَها.
create or replace function public.clinic_drugs_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.name := btrim(coalesce(new.name, ''), E' \t\r\n');
  if search_norm(new.name) = '' or char_length(new.name) > 120 then
    raise exception 'clinic_drugs_bad_name' using hint = 'اسم الدواء لازم يكون بين حرف و١٢٠ حرفاً.';
  end if;

  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.created_at := now();
      new.updated_at := now();
    end if;
    if new.archived_at is null then
      perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || new.clinic_id::text, 0));
      if (select count(*) from clinic_drugs d where d.clinic_id = new.clinic_id and d.archived_at is null) >= 400 then
        raise exception 'clinic_drugs_full' using hint = 'وصلت ٤٠٠ دواء — أرشف دواء ما تستعمله أوّلاً';
      end if;
    end if;
    return new;
  end if;

  if current_user = 'authenticated'
     and (new.id is distinct from old.id or new.clinic_id is distinct from old.clinic_id
          or new.created_at is distinct from old.created_at) then
    raise exception 'clinic_drugs_frozen' using hint = 'هوية الدواء وعيادته ما تتغيّر';
  end if;
  -- الاسترجاعُ يُفحص كالإضافة: الأرشفةُ تُفرغ مكاناً كما يقول التلميح، فلا يعود فوق السقف.
  if old.archived_at is not null and new.archived_at is null then
    perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || new.clinic_id::text, 0));
    if (select count(*) from clinic_drugs d where d.clinic_id = new.clinic_id and d.archived_at is null) >= 400 then
      raise exception 'clinic_drugs_full' using hint = 'وصلت ٤٠٠ دواء — أرشف دواء ما تستعمله أوّلاً';
    end if;
  end if;
  if (new.name, new.family, new.in_mine, new.archived_at) is distinct from (old.name, old.family, old.in_mine, old.archived_at) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
drop trigger if exists clinic_drugs_guard on public.clinic_drugs;
create trigger clinic_drugs_guard before insert or update on public.clinic_drugs
  for each row execute function public.clinic_drugs_guard();

-- ── ٣) السياسات: ملكيّةٌ وحدها، ملفوفةٌ للتخطيط، ولا واحدةَ تقرأ جدولَها ───────
alter table public.clinic_drugs enable row level security;
drop policy if exists clinic_drugs_select on public.clinic_drugs;
create policy clinic_drugs_select on public.clinic_drugs
  for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drugs_insert on public.clinic_drugs;
create policy clinic_drugs_insert on public.clinic_drugs
  for insert to authenticated with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drugs_update on public.clinic_drugs;
create policy clinic_drugs_update on public.clinic_drugs
  for update to authenticated using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
-- لا سياسةَ حذفٍ ولا صلاحيتَه: الصفُّ لا يختفي (الإنتاجُ يمنح الجديدَ كلَّ شيءٍ افتراضاً).
revoke all on table public.clinic_drugs from public, anon, authenticated;
grant select, insert, update on table public.clinic_drugs to authenticated;
select public.photographer_fence_table('clinic_drugs');

-- ── ٤) التدقيق: المحتوى وحده — نقلُ الموضع لا يكتب سطراً ────────────────────
drop trigger if exists audit_all on public.clinic_drugs;
create trigger audit_all after insert or update of name, family, in_mine, archived_at on public.clinic_drugs
  for each row execute function audit_change();

-- ── ٥) القراءة: العيادةُ كما يراها الخادم + كلُّ صفوفها ──────────────────────
-- الختمُ (`clinic`) هو ما ترسله كلُّ كتابةٍ بعدها: تبدّلت الجلسةُ بينهما ⇒ تُرفض.
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
  return jsonb_build_object('clinic', v_clinic, 'rows', coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', d.id, 'name', d.name, 'family', d.family, 'in_mine', d.in_mine, 'pos', d.pos,
             'archived_at', d.archived_at, 'created_at', d.created_at, 'updated_at', d.updated_at)
           order by d.in_mine desc, d.pos, d.created_at, d.id)
      from clinic_drugs d
     where d.clinic_id = v_clinic), '[]'::jsonb));
end $$;
revoke all on function public.clinic_drugs_list() from public, anon;
grant execute on function public.clinic_drugs_list() to authenticated;

-- ── ٦) الكتابة: بابٌ واحد، بالترتيب، بمعاملةٍ واحدة ──────────────────────────
-- p_ops: [{op, id, ...}] — op واحدٌ من:
--   put {id, name, family, mine, after?}  صفٌّ حيٌّ بنفس المفتاح ⇒ نجمةٌ (أو نقلٌ إن كان
--                                          بـ«أدويتي» وحمل «بعد») ولا تسميةَ ولا صنف؛ وإلا إدراج
--   unmine {id}        خارج «أدويتي» (غائبٌ أو خارجٌ أصلاً = لا شيء)
--   move {id, after}   الصفُّ و«بعد» كلاهما حيٌّ بـ«أدويتي»، وإلا drug_row_gone
--   edit {id, name?, family?}             التوأمُ ⇒ drug_exists باسمه
--   archive {id}       يخرج من كلّ القوائم والسجلّاتُ تبقى بيه (المؤرشفُ لا شيء)
--   restore {id}       يرجع خارج «أدويتي»؛ التوأمُ الحيّ ⇒ drug_exists
-- «بعد»: غائبٌ = آخرُ القائمة، null = أوّلُها، معرّفٌ = منتصفُ الفجوة بعده؛ وفجوةٌ أقلُّ
-- من ٢ ترقّم «أدويتي» كلَّها ×١٠٢٤ ثم يُعاد الحساب. الترقيمُ يكتب `pos` وحده.
create or replace function public.clinic_drugs_apply(p_clinic uuid, p_ops jsonb)
returns jsonb
language plpgsql
volatile
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  o        jsonb;
  v_op     text;
  v_id     uuid;
  v_name   text;
  v_fam    text;
  v_key    text;
  v_mine   boolean;
  v_exists boolean;
  v_was    boolean;
  v_place  boolean;
  v_self   uuid;
  v_has    boolean;
  v_after  uuid;
  v_pos    bigint;
  v_apos   bigint;
  v_next   bigint;
  v_try    int;
  v_twin   text;
  r        record;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'clinic_switched' using hint = 'تبدّلت العيادة على هذا الجهاز — حدّث الصفحة. ما انحفظ شي.';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  if jsonb_array_length(p_ops) > 200 then
    raise exception 'too_many_ops' using hint = 'تعديلات كثيرة بطلب واحد — حدّث الصفحة وجرّب أقل.';
  end if;

  -- جهازان بنفس العيادة يتسلسلان: الموضعُ يُحسب على آخر ما كُتب لا على لقطةٍ قديمة.
  perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || v_clinic::text, 0));

  for o in select e.value from jsonb_array_elements(p_ops) with ordinality as e(value, i) order by e.i loop
    v_op := o->>'op';
    v_id := nullif(o->>'id', '')::uuid;
    if v_id is null or jsonb_typeof(o) <> 'object' then
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;
    v_place := false; v_self := null; v_has := false; v_after := null; v_exists := false; v_was := false;

    -- (أ) ما يحتاجه كلُّ أمرٍ قبل أن يكتب
    if v_op = 'put' then
      v_name := btrim(coalesce(o->>'name', ''), E' \t\r\n');
      v_key := search_norm(v_name);
      v_mine := coalesce((o->>'mine')::boolean, false);
      v_has := (o ? 'after');
      v_after := nullif(o->>'after', '')::uuid;
      select d.id, d.in_mine into r from clinic_drugs d
       where d.clinic_id = v_clinic and d.archived_at is null and v_key <> '' and search_norm(d.name) = v_key
       for update;
      v_exists := found;
      if v_exists then
        v_was := r.in_mine;
        if v_mine and (not r.in_mine or v_has) then v_place := true; v_self := r.id; end if;
      else
        v_place := v_mine;
      end if;
    elsif v_op = 'move' then
      perform 1 from clinic_drugs d
       where d.id = v_id and d.clinic_id = v_clinic and d.in_mine and d.archived_at is null
       for update;
      if not found then
        raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_place := true; v_self := v_id; v_has := true; v_after := nullif(o->>'after', '')::uuid;
    end if;

    -- (ب) الموضع — مرآتُه slot() بـmedIndex.ts
    if v_place then
      for v_try in 1..2 loop
        if not v_has then
          select coalesce(max(d.pos), 0) + 1024 into v_pos from clinic_drugs d
           where d.clinic_id = v_clinic and d.in_mine and d.id is distinct from v_self;
          exit;
        elsif v_after is null then
          select coalesce(min(d.pos), 1024) - 1024 into v_pos from clinic_drugs d
           where d.clinic_id = v_clinic and d.in_mine and d.id is distinct from v_self;
          exit;
        end if;
        select d.pos into v_apos from clinic_drugs d
         where d.id = v_after and d.clinic_id = v_clinic and d.in_mine and d.archived_at is null;
        if not found or v_after = v_self then
          raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
        end if;
        select min(d.pos) into v_next from clinic_drugs d
         where d.clinic_id = v_clinic and d.in_mine and d.id is distinct from v_self and d.pos > v_apos;
        if v_next is null then v_pos := v_apos + 1024; exit; end if;
        if v_next - v_apos >= 2 then v_pos := floor((v_apos + v_next)::numeric / 2)::bigint; exit; end if;
        if v_try = 2 then
          raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
        end if;
        -- فجوةٌ أقلُّ من ٢: «أدويتي» كلُّها ×١٠٢٤ بترتيبها (pos ثم id) — pos وحده فلا سطرَ تدقيق.
        update clinic_drugs d set pos = s.rn * 1024
          from (select x.id, row_number() over (order by x.pos, x.id) as rn
                  from clinic_drugs x where x.clinic_id = v_clinic and x.in_mine) s
         where d.id = s.id and d.pos is distinct from s.rn * 1024;
      end loop;
    end if;

    -- (ج) الكتابة
    if v_op = 'put' then
      if not v_exists then
        insert into clinic_drugs (id, clinic_id, name, family, in_mine, pos)
        values (v_id, v_clinic, v_name, coalesce(nullif(o->>'family', ''), 'other'), v_mine, case when v_mine then v_pos end);
      elsif v_place and v_was then
        update clinic_drugs set pos = v_pos where id = v_self;
      elsif v_place then
        update clinic_drugs set in_mine = true, pos = v_pos where id = v_self;
      end if;

    elsif v_op = 'unmine' then
      update clinic_drugs set in_mine = false, pos = null
       where id = v_id and clinic_id = v_clinic and in_mine;

    elsif v_op = 'move' then
      update clinic_drugs set pos = v_pos where id = v_id;

    elsif v_op = 'edit' then
      perform 1 from clinic_drugs d where d.id = v_id and d.clinic_id = v_clinic and d.archived_at is null for update;
      if not found then
        raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_name := case when jsonb_typeof(o->'name') = 'string' then btrim(o->>'name', E' \t\r\n') end;
      v_fam := nullif(o->>'family', '');
      begin
        update clinic_drugs set name = coalesce(v_name, name), family = coalesce(v_fam, family)
         where id = v_id and clinic_id = v_clinic and archived_at is null
           and (name, family) is distinct from (coalesce(v_name, name), coalesce(v_fam, family));
      exception when unique_violation then
        select d.name into v_twin from clinic_drugs d
         where d.clinic_id = v_clinic and d.archived_at is null and d.id <> v_id and search_norm(d.name) = search_norm(v_name)
         order by d.created_at, d.id limit 1;
        raise exception 'drug_exists' using hint = format('الدواء موجود: «%s» — استعمله بدل ما تضيف نسخة ثانية.', coalesce(v_twin, v_name));
      end;

    elsif v_op = 'archive' then
      update clinic_drugs set archived_at = now(), in_mine = false, pos = null
       where id = v_id and clinic_id = v_clinic and archived_at is null;

    elsif v_op = 'restore' then
      select d.name, d.archived_at into r from clinic_drugs d where d.id = v_id and d.clinic_id = v_clinic for update;
      if not found then
        raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
      end if;
      if r.archived_at is not null then
        begin
          update clinic_drugs set archived_at = null where id = v_id;
        exception when unique_violation then
          select d.name into v_twin from clinic_drugs d
           where d.clinic_id = v_clinic and d.archived_at is null and d.id <> v_id and search_norm(d.name) = search_norm(r.name)
           order by d.created_at, d.id limit 1;
          raise exception 'drug_exists' using hint = format('الدواء موجود: «%s» — استعمله بدل ما تضيف نسخة ثانية.', coalesce(v_twin, r.name));
        end;
      end if;

    else
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;
  end loop;

  return clinic_drugs_list();
end $$;
revoke all on function public.clinic_drugs_apply(uuid, jsonb) from public, anon;
grant execute on function public.clinic_drugs_apply(uuid, jsonb) to authenticated;

-- ── ٧) الاقتراح: أكثرُ ما استعملته العيادة — قراءةٌ وحدها ──────────────────────
-- صفوفُ العلاج (الخطة، سجلُّ الحيوان، تبويبُ «الأدوية» بالبيع لحيوانٍ معروف) وسطورُ
-- البيع لمنتجاتِ صنف «دواء»، آخرَ p_days يوماً (١…٣٦٥)، بالمفتاح نفسه. الكتابةُ الأكثرُ
-- استعمالاً هي الاسم. وما بـ«أدويتي» أو مؤرشفٌ لا يُقترح (المؤرشفُ قرارُ العيادة).
-- لا يضيف شيئاً: الواجهةُ تعرض القائمةَ بمربّعاتٍ وتضيف ما يُعلَّم بضغطة «أضف» (put).
create or replace function public.clinic_drugs_suggest(p_days int default 90)
returns jsonb
language plpgsql
stable
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_days   int := greatest(1, least(coalesce(p_days, 90), 365));
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة — سجّل دخول من جديد.';
  end if;
  return coalesce((
    with used as (
      select btrim(t.medication) as nm, t.created_at as at
        from treatment_entries t
       where t.clinic_id = v_clinic
         and t.day >= current_date - v_days
         and coalesce(t.task_type, 'drug') = 'drug'
      union all
      select btrim(i.name), i.created_at
        from invoice_items i
        join products p on p.id = i.product_id
       where i.clinic_id = v_clinic and p.clinic_id = v_clinic and p.category = 'medicine'
         and i.qty > 0 and i.created_at >= now() - make_interval(days => v_days)
    ), spell as (
      select search_norm(u.nm) as k, u.nm, count(*) as c, max(u.at) as last_at
        from used u where search_norm(u.nm) <> ''
       group by 1, 2
    ), grp as (
      select s.k, sum(s.c)::int as n, max(s.last_at) as last_at,
             (array_agg(s.nm order by s.c desc, s.last_at desc, s.nm))[1] as nm
        from spell s group by s.k
    ), best as (
      select g.* from grp g
       where not exists (select 1 from clinic_drugs d
                          where d.clinic_id = v_clinic and search_norm(d.name) = g.k
                            and (d.in_mine or d.archived_at is not null))
       order by g.n desc, g.last_at desc, g.nm
       limit 40
    )
    select jsonb_agg(jsonb_build_object('name', t.nm, 'n', t.n) order by t.n desc, t.last_at desc, t.nm) from best t
  ), '[]'::jsonb);
end $$;
revoke all on function public.clinic_drugs_suggest(int) from public, anon;
grant execute on function public.clinic_drugs_suggest(int) to authenticated;

comment on function public.clinic_drugs_apply(uuid, jsonb) is
  'الكتابة الوحيدة لـ«أدويتي» (0229): عمليات نسبيّة بمعاملة واحدة، والموضع يحسبه الخادم تحت قفل العيادة. مرآتها applyOps بـmedIndex.ts.';
comment on function public.clinic_drugs_suggest(int) is
  'أكثر الأدوية استعمالاً بالعيادة آخر p_days يوماً (0229) — قراءة وحدها لزرّ الاقتراح، لا تضيف شيئاً.';
