-- ============================================================================
-- ٠٢٣٩ — تصنيفاتُ العيادة للأدوية: «مسكنات القطط»، «أدوية الحساسية»… (قرارُ المالك D4، ١٤/١٠)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- المنتقي يعرف تقسيمين: «★ أدويتي» (قائمةٌ واحدةٌ مرتّبة) والعائلاتُ الأربعَ عشرة الثابتة
-- (قيدُ CHECK بـ0229). والعيادةُ تفكّر بمجموعاتها هي — «مسكنات القطط» فيها مضادُّ التهاب ومخدّرٌ
-- خفيف من عائلتين، والدواءُ نفسُه بأكثر من مجموعة. فإمّا «أدويتي» بمئة دواء تُمسح بالإصبع، وإمّا
-- عائلةٌ لا تقول ما تقوله العيادة. والمطلوبُ (D4): تصنيفاتٌ بأسماء العيادة، مجموعةٌ واحدةٌ لكلّ
-- عيادة يعدّلها الكادرُ السريريّ عدا المصوّر، الدواءُ بأكثر من تصنيف، والعائلاتُ تبقى تحتها؛
-- «أدرج من القائمة» و«اكتب بإيدي» داخل التصنيف؛ الشيلُ من تصنيفٍ لا يؤرشف الدواء؛ ترتيبٌ
-- للتصنيفات وللأدوية داخلها؛ أرشفةٌ واسترجاع، لا حذف.
--
-- ── الشكل (سُنّةُ 0233 بجداولها، و0229 بصلاحياتها) ────────────────────────
-- • `clinic_drug_groups` (تصنيف) و`clinic_drug_group_items` (عضوية) بمفتاحٍ مركّب (clinic_id,
--   …) لا يعبر عيادة: دواءٌ من عيادةٍ أخرى لا يدخل تصنيفاً ولو عُرف معرّفُه (FK 23503).
-- • لا حذفَ للتصنيف (لا صلاحيةَ ولا سياسة) — أرشفةٌ تُسترجَع (درسُ 0145). والعضويةُ تُحذف: هي
--   «شيله من التصنيف» والدواءُ نفسُه باقٍ.
-- • دواءٌ مؤرشف تبقى عضويّاتُه نائمةً وتصحو مع استرجاعه — `clinic_drugs_list` يرجعها كلَّها
--   (فالمرآةُ تطابق صفّاً صفّاً) والإخفاءُ بنموذج القراءة.
-- • الكتابةُ بابٌ واحد: `clinic_drugs_apply` نفسُها بعملياتٍ جديدة، بنفس القفل والختم والمعاملة.
--   و«اكتب بإيدي واحفظه بالتصنيف» دفعةٌ واحدة `[put, member_add]`: `put` يُطوى على صفٍّ حيٍّ
--   بنفس المفتاح فيُسجَّل **اسمٌ مستعار** (معرّفُه المؤقّت ⇒ معرّفُ الصفّ) وتقرأه العملياتُ
--   بعده — بلاه كان `member_add` يُرفض drug_row_gone على دواءٍ موجود.
-- • invoker كـ0229: السياساتُ شرطُ ملكيّةٍ وحده (0159/0162) لا تقرأ جدولَها، والتجميدُ والسقفُ
--   والاسمُ بمحفّزاتٍ تحرس `current_user = 'authenticated'`، وسياجُ المصوّر (0222) يغلقها عليه.
-- • التدقيقُ نوعُه «إعدادات» (`audit_kind`: clinic%): إنشاءُ التصنيف وتسميتُه وأرشفتُه، وإضافةُ
--   الدواء وشيلُه. النقلُ لا يكتب سطراً.
-- • مرآتُها `applyAll` بـsrc/lib/medIndex.ts سطراً بسطر (الاسمُ المستعار، ترتيبُ الرفض، الموضع)،
--   ويقارنهما `clinic-drugs-parity` بهذه الحزمة.
--
-- ⚠ الفهرسُ الفريد على `search_norm(name)`: أيُّ هجرةٍ تعيد تعريفَ `search_norm` لازم تكتب
--   `reindex index public.clinic_drug_groups_name_uq` (db-guard: norm-reindex) — كـ0229 و0233.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. الواجهاتُ القديمة لا ترسل العملياتِ الجديدة، وتقرأ `rows` كما كانت.
-- تُطبَّق بعد 0238.
-- تراجع: أعد clinic_drugs_list() وclinic_drugs_apply(uuid, jsonb) من 0229؛ ثم
--   drop table clinic_drug_group_items; drop table clinic_drug_groups;
--   drop function clinic_drug_groups_guard(), clinic_drug_group_items_guard();
--   alter table clinic_drugs drop constraint clinic_drugs_clinic_id_uq;
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) مفتاحُ (العيادة، الدواء) — تشير إليه العضويةُ فلا تعبر عيادة ─────────────
do $$
begin
  if not exists (select 1 from pg_constraint
                  where conname = 'clinic_drugs_clinic_id_uq' and conrelid = 'public.clinic_drugs'::regclass) then
    alter table public.clinic_drugs add constraint clinic_drugs_clinic_id_uq unique (clinic_id, id);
  end if;
end $$;

-- ── ٢) التصنيفات ─────────────────────────────────────────────────────────
create table if not exists public.clinic_drug_groups (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name        text not null check (char_length(btrim(name)) between 1 and 40),
  pos         bigint,
  archived_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint clinic_drug_groups_pos_ck check ((archived_at is null) = (pos is not null)),
  constraint clinic_drug_groups_clinic_id_uq unique (clinic_id, id)
);
comment on table public.clinic_drug_groups is
  'تصنيفاتُ العيادة للأدوية (0239): اسمٌ بالعيادة وموضع. لا يُحذف — يُؤرشف. الكتابة عبر clinic_drugs_apply.';

-- تصنيفٌ حيٌّ واحد لكلّ اسمٍ بالعيادة، بنفس تطبيع searchable() بالواجهة.
-- ⚠ إعادةُ تعريف search_norm ⇒ reindex index public.clinic_drug_groups_name_uq (db-guard).
create unique index if not exists clinic_drug_groups_name_uq
  on public.clinic_drug_groups (clinic_id, search_norm(name)) where archived_at is null;
create index if not exists clinic_drug_groups_pos_ix
  on public.clinic_drug_groups (clinic_id, pos) where archived_at is null;

-- ── ٣) العضوية: دواءٌ بتصنيف، بموضعه داخله ──────────────────────────────────
create table if not exists public.clinic_drug_group_items (
  id        uuid primary key default gen_random_uuid(),
  clinic_id uuid not null default auth_clinic(),
  group_id  uuid not null,
  drug_id   uuid not null,
  pos       bigint not null,
  added_at  timestamptz not null default now(),
  constraint clinic_drug_group_items_uq unique (group_id, drug_id),
  constraint clinic_drug_group_items_group_fk foreign key (clinic_id, group_id)
    references public.clinic_drug_groups (clinic_id, id) on delete cascade,
  constraint clinic_drug_group_items_drug_fk foreign key (clinic_id, drug_id)
    references public.clinic_drugs (clinic_id, id) on delete cascade
);
comment on table public.clinic_drug_group_items is
  'عضويةُ دواءٍ بتصنيف (0239). شيلُها لا يؤرشف الدواء؛ ودواءٌ مؤرشف تبقى عضويّاتُه نائمةً حتى يُسترجع.';
create index if not exists clinic_drug_group_items_group_ix
  on public.clinic_drug_group_items (clinic_id, group_id, pos);
-- مفتاحُ الدواء الأجنبيّ يُفحص بالعمودين معاً (المساواةُ على الاثنين) — الفهرسُ يبدأ بالدواء.
create index if not exists clinic_drug_group_items_drug_ix
  on public.clinic_drug_group_items (drug_id, clinic_id);

-- ── ٤) الحارسان: الاسم، السقف، والأعمدةُ المجمَّدة ────────────────────────────
-- invoker: يحرس ما تقدر السياسةُ أن تكتبه ولا يشدّ أكثر منها؛ والتجميدُ لدور authenticated
-- وحده (الهجرةُ ودوالُّ المالك تمرّ) — بمحفّزٍ لا بسياسة (0162). عدُّ جدوله داخل محفّزٍ مسموح.
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
    if new.archived_at is null then
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
end $$;
drop trigger if exists clinic_drug_groups_guard on public.clinic_drug_groups;
create trigger clinic_drug_groups_guard before insert or update on public.clinic_drug_groups
  for each row execute function public.clinic_drug_groups_guard();

create or replace function public.clinic_drug_group_items_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if current_user = 'authenticated' then
      new.added_at := now();
    end if;
    -- السقفُ يعدّ النائمَ أيضاً (عضويةُ دواءٍ مؤرشف): يصحو مع استرجاعه بلا فحصٍ ثانٍ.
    perform pg_advisory_xact_lock(hashtextextended('clinic_drugs:' || new.clinic_id::text, 0));
    if (select count(*) from clinic_drug_group_items i where i.clinic_id = new.clinic_id) >= 2000 then
      raise exception 'drug_members_full' using hint = 'وصلت ٢٠٠٠ عضوية — شيل أدوية من تصنيفات ما تستعملها.';
    end if;
    return new;
  end if;
  if current_user = 'authenticated'
     and (new.id is distinct from old.id or new.clinic_id is distinct from old.clinic_id
          or new.group_id is distinct from old.group_id or new.drug_id is distinct from old.drug_id
          or new.added_at is distinct from old.added_at) then
    raise exception 'drug_group_frozen' using hint = 'هوية التصنيف وعيادته ما تتغيّر';
  end if;
  return new;
end $$;
drop trigger if exists clinic_drug_group_items_guard on public.clinic_drug_group_items;
create trigger clinic_drug_group_items_guard before insert or update on public.clinic_drug_group_items
  for each row execute function public.clinic_drug_group_items_guard();

-- ── ٥) السياسات: ملكيّةٌ وحدها، ملفوفةٌ للتخطيط، ولا واحدةَ تقرأ جدولَها ───────
alter table public.clinic_drug_groups enable row level security;
drop policy if exists clinic_drug_groups_select on public.clinic_drug_groups;
create policy clinic_drug_groups_select on public.clinic_drug_groups
  for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_groups_insert on public.clinic_drug_groups;
create policy clinic_drug_groups_insert on public.clinic_drug_groups
  for insert to authenticated with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_groups_update on public.clinic_drug_groups;
create policy clinic_drug_groups_update on public.clinic_drug_groups
  for update to authenticated using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
-- لا سياسةَ حذفٍ ولا صلاحيتَه للتصنيف: يُؤرشف ولا يختفي.
revoke all on table public.clinic_drug_groups from public, anon, authenticated;
grant select, insert, update on table public.clinic_drug_groups to authenticated;

alter table public.clinic_drug_group_items enable row level security;
drop policy if exists clinic_drug_group_items_select on public.clinic_drug_group_items;
create policy clinic_drug_group_items_select on public.clinic_drug_group_items
  for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_group_items_insert on public.clinic_drug_group_items;
create policy clinic_drug_group_items_insert on public.clinic_drug_group_items
  for insert to authenticated with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_group_items_update on public.clinic_drug_group_items;
create policy clinic_drug_group_items_update on public.clinic_drug_group_items
  for update to authenticated using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
drop policy if exists clinic_drug_group_items_delete on public.clinic_drug_group_items;
create policy clinic_drug_group_items_delete on public.clinic_drug_group_items
  for delete to authenticated using (clinic_id = (select auth_clinic()));
revoke all on table public.clinic_drug_group_items from public, anon, authenticated;
grant select, insert, update, delete on table public.clinic_drug_group_items to authenticated;

select public.photographer_fence_table('clinic_drug_groups'), public.photographer_fence_table('clinic_drug_group_items');

-- ── ٦) التدقيق: الإنشاءُ والتسميةُ والأرشفة، والإضافةُ والشيل — النقلُ لا يكتب سطراً ──
drop trigger if exists audit_all on public.clinic_drug_groups;
create trigger audit_all after insert or update of name, archived_at on public.clinic_drug_groups
  for each row execute function audit_change();
drop trigger if exists audit_all on public.clinic_drug_group_items;
create trigger audit_all after insert or delete on public.clinic_drug_group_items
  for each row execute function audit_change();

-- ── ٧) القراءة: الصفوف كما كانت + التصنيفات + كلُّ العضويات (والنائمةُ منها) ──────
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
               'id', g.id, 'name', g.name, 'pos', g.pos, 'archived_at', g.archived_at,
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

-- ── ٨) الكتابة: بابٌ واحد، بالترتيب، بمعاملةٍ واحدة — وعملياتُ التصنيف ─────────
-- عملياتُ 0229 كما هي (put/unmine/move/edit/archive/restore)، ومعها:
--   group_create {id, name, after?}  معرّفٌ قائمٌ بالعيادة ⇒ لا شيء (إعادةُ إرسال)؛ ثم الاسم، ثم
--                                     التوأمُ الحيّ (drug_group_exists باسمه)، ثم السقف (٦٠)
--   group_edit {id, name}            حيٌّ وإلا drug_group_gone؛ نفسُ الاسم ⇒ لا شيء
--   group_move {id, after}           حيٌّ و«بعد» حيٌّ، وإلا drug_group_gone
--   group_archive {id}               يخرج من المنتقي، وأدويتُه وعضويّاتُه تبقى (المؤرشفُ لا شيء)
--   group_restore {id}               يرجع بآخر القائمة؛ التوأمُ ⇒ drug_group_exists، والسقف
--   member_add {group, id, after?}   التصنيفُ حيٌّ وإلا drug_group_gone، والدواءُ حيٌّ بالعيادة وإلا
--                                     drug_row_gone؛ عضوٌ أصلاً ⇒ «بعد» تنقله وغيابُها لا شيء
--   member_remove {group, id}        غائبةٌ ⇒ لا شيء — والدواءُ نفسُه لا يُمسّ
--   member_move {group, id, after}   العضويةُ و«بعد» كلاهما بالتصنيف، وإلا drug_row_gone
-- معرّفُ دواءٍ (id/after) طُوي بـput سابقٍ بنفس الدفعة يُقرأ بمعرّف الصفّ (الاسمُ المستعار).
-- «بعد»: غائبٌ = آخرُ القائمة، null = أوّلُها، معرّفٌ = منتصفُ الفجوة بعده؛ وفجوةٌ أقلُّ من ٢
-- ترقّم القائمةَ كلَّها ×١٠٢٤ ثم يُعاد الحساب (العضويةُ تعدّ النائمة). الترقيمُ يكتب `pos` وحده.
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
  v_gplace boolean;
  v_iplace boolean;
  v_self   uuid;
  v_has    boolean;
  v_after  uuid;
  v_group  uuid;
  v_pos    bigint;
  v_apos   bigint;
  v_next   bigint;
  v_try    int;
  v_twin   text;
  v_alias  jsonb := '{}'::jsonb;
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
    -- دواءٌ طُوي بـput سابقٍ بنفس الدفعة ⇒ معرّفُ صفّه (لا لمعرّف put نفسه ولا للتصنيف).
    if v_op not in ('put', 'group_create', 'group_edit', 'group_move', 'group_archive', 'group_restore') then
      v_id := coalesce((v_alias ->> v_id::text)::uuid, v_id);
    end if;
    v_place := false; v_gplace := false; v_iplace := false; v_self := null; v_has := false; v_after := null;
    v_exists := false; v_was := false; v_group := null;

    -- (أ) ما يحتاجه كلُّ أمرٍ قبل أن يكتب
    if v_op = 'put' then
      v_name := btrim(coalesce(o->>'name', ''), E' \t\r\n');
      v_key := search_norm(v_name);
      v_mine := coalesce((o->>'mine')::boolean, false);
      v_has := (o ? 'after');
      v_after := nullif(o->>'after', '')::uuid;
      v_after := coalesce((v_alias ->> v_after::text)::uuid, v_after);
      select d.id, d.in_mine into r from clinic_drugs d
       where d.clinic_id = v_clinic and d.archived_at is null and v_key <> '' and search_norm(d.name) = v_key
       for update;
      v_exists := found;
      if v_exists then
        v_was := r.in_mine;
        -- الاسمُ المستعار: ما بعده بالدفعة يقرأ معرّفَ الصفّ (احفظه بالتصنيف = put ثم member_add).
        if r.id <> v_id then v_alias := v_alias || jsonb_build_object(v_id::text, r.id::text); end if;
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
      v_place := true; v_self := v_id; v_has := true;
      v_after := nullif(o->>'after', '')::uuid;
      v_after := coalesce((v_alias ->> v_after::text)::uuid, v_after);
    elsif v_op = 'group_create' then
      perform 1 from clinic_drug_groups g where g.id = v_id and g.clinic_id = v_clinic;
      if found then continue; end if;   -- إعادةُ إرسالٍ لنفس المعرّف: لا شيء
      v_name := btrim(regexp_replace(coalesce(o->>'name', ''), E'[ \t\r\n]+', ' ', 'g'));
      if search_norm(v_name) = '' or char_length(v_name) > 40 then
        raise exception 'drug_group_bad_name' using hint = 'اسم التصنيف لازم يكون بين حرف و٤٠ حرفاً.';
      end if;
      select g.name into v_twin from clinic_drug_groups g
       where g.clinic_id = v_clinic and g.archived_at is null and search_norm(g.name) = search_norm(v_name)
       order by g.created_at, g.id limit 1;
      if found then
        raise exception 'drug_group_exists' using hint = format('التصنيف موجود: «%s» — استعمله بدل ما تسوّي نسخة ثانية.', v_twin);
      end if;
      if (select count(*) from clinic_drug_groups g where g.clinic_id = v_clinic and g.archived_at is null) >= 60 then
        raise exception 'drug_groups_full' using hint = 'وصلت ٦٠ تصنيفاً — أرشف تصنيف ما تستعمله أوّلاً.';
      end if;
      v_gplace := true; v_has := (o ? 'after'); v_after := nullif(o->>'after', '')::uuid;
    elsif v_op = 'group_edit' then
      select g.name into r from clinic_drug_groups g
       where g.id = v_id and g.clinic_id = v_clinic and g.archived_at is null for update;
      if not found then
        raise exception 'drug_group_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_name := btrim(regexp_replace(coalesce(o->>'name', ''), E'[ \t\r\n]+', ' ', 'g'));
      if v_name = r.name then continue; end if;   -- نفسُ الاسم: لا شيء
      if search_norm(v_name) = '' or char_length(v_name) > 40 then
        raise exception 'drug_group_bad_name' using hint = 'اسم التصنيف لازم يكون بين حرف و٤٠ حرفاً.';
      end if;
      select g.name into v_twin from clinic_drug_groups g
       where g.clinic_id = v_clinic and g.archived_at is null and g.id <> v_id and search_norm(g.name) = search_norm(v_name)
       order by g.created_at, g.id limit 1;
      if found then
        raise exception 'drug_group_exists' using hint = format('التصنيف موجود: «%s» — استعمله بدل ما تسوّي نسخة ثانية.', v_twin);
      end if;
    elsif v_op = 'group_move' then
      perform 1 from clinic_drug_groups g
       where g.id = v_id and g.clinic_id = v_clinic and g.archived_at is null for update;
      if not found then
        raise exception 'drug_group_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_gplace := true; v_self := v_id; v_has := true; v_after := nullif(o->>'after', '')::uuid;
    elsif v_op = 'group_restore' then
      select g.name, g.archived_at into r from clinic_drug_groups g
       where g.id = v_id and g.clinic_id = v_clinic for update;
      if not found then
        raise exception 'drug_group_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      if r.archived_at is null then continue; end if;   -- حيٌّ أصلاً: لا شيء
      select g.name into v_twin from clinic_drug_groups g
       where g.clinic_id = v_clinic and g.archived_at is null and g.id <> v_id and search_norm(g.name) = search_norm(r.name)
       order by g.created_at, g.id limit 1;
      if found then
        raise exception 'drug_group_exists' using hint = format('التصنيف موجود: «%s» — استعمله بدل ما تسوّي نسخة ثانية.', v_twin);
      end if;
      if (select count(*) from clinic_drug_groups g where g.clinic_id = v_clinic and g.archived_at is null) >= 60 then
        raise exception 'drug_groups_full' using hint = 'وصلت ٦٠ تصنيفاً — أرشف تصنيف ما تستعمله أوّلاً.';
      end if;
      v_gplace := true; v_self := v_id; v_has := false;
    elsif v_op in ('member_add', 'member_move') then
      v_group := nullif(o->>'group', '')::uuid;
      perform 1 from clinic_drug_groups g
       where g.id = v_group and g.clinic_id = v_clinic and g.archived_at is null;
      if not found then
        raise exception 'drug_group_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
      end if;
      v_after := nullif(o->>'after', '')::uuid;
      v_after := coalesce((v_alias ->> v_after::text)::uuid, v_after);
      perform 1 from clinic_drug_group_items i
       where i.clinic_id = v_clinic and i.group_id = v_group and i.drug_id = v_id for update;
      v_exists := found;
      if v_op = 'member_add' then
        perform 1 from clinic_drugs d where d.id = v_id and d.clinic_id = v_clinic and d.archived_at is null;
        if not found then
          raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
        end if;
        v_has := (o ? 'after');
        if v_exists and not v_has then continue; end if;   -- عضوٌ أصلاً: لا شيء
        v_iplace := true; v_self := case when v_exists then v_id end;
      else
        if not v_exists then
          raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
        end if;
        v_iplace := true; v_self := v_id; v_has := true;
      end if;
    end if;

    -- (ب) موضعُ «أدويتي» — مرآتُه slot() بـmedIndex.ts
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

    -- (ب٢) موضعُ التصنيف بين التصنيفات الحيّة — مرآتُه groupSlot() بـmedIndex.ts
    if v_gplace then
      for v_try in 1..2 loop
        if not v_has then
          select coalesce(max(g.pos), 0) + 1024 into v_pos from clinic_drug_groups g
           where g.clinic_id = v_clinic and g.archived_at is null and g.id is distinct from v_self;
          exit;
        elsif v_after is null then
          select coalesce(min(g.pos), 1024) - 1024 into v_pos from clinic_drug_groups g
           where g.clinic_id = v_clinic and g.archived_at is null and g.id is distinct from v_self;
          exit;
        end if;
        select g.pos into v_apos from clinic_drug_groups g
         where g.id = v_after and g.clinic_id = v_clinic and g.archived_at is null;
        if not found or v_after = v_self then
          raise exception 'drug_group_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
        end if;
        select min(g.pos) into v_next from clinic_drug_groups g
         where g.clinic_id = v_clinic and g.archived_at is null and g.id is distinct from v_self and g.pos > v_apos;
        if v_next is null then v_pos := v_apos + 1024; exit; end if;
        if v_next - v_apos >= 2 then v_pos := floor((v_apos + v_next)::numeric / 2)::bigint; exit; end if;
        if v_try = 2 then
          raise exception 'drug_group_gone' using hint = 'التصنيف ما عاد موجود أو تغيّر من جهاز ثاني — رجّعناه مثل ما بالخادم، عيد المحاولة.';
        end if;
        update clinic_drug_groups g set pos = s.rn * 1024
          from (select x.id, row_number() over (order by x.pos, x.id) as rn
                  from clinic_drug_groups x where x.clinic_id = v_clinic and x.archived_at is null) s
         where g.id = s.id and g.pos is distinct from s.rn * 1024;
      end loop;
    end if;

    -- (ب٣) موضعُ الدواء داخل التصنيف — بين كلّ عضوياته والنائمةُ منها؛ مرآتُه itemSlot()
    if v_iplace then
      for v_try in 1..2 loop
        if not v_has then
          select coalesce(max(i.pos), 0) + 1024 into v_pos from clinic_drug_group_items i
           where i.clinic_id = v_clinic and i.group_id = v_group and i.drug_id is distinct from v_self;
          exit;
        elsif v_after is null then
          select coalesce(min(i.pos), 1024) - 1024 into v_pos from clinic_drug_group_items i
           where i.clinic_id = v_clinic and i.group_id = v_group and i.drug_id is distinct from v_self;
          exit;
        end if;
        select i.pos into v_apos from clinic_drug_group_items i
         where i.clinic_id = v_clinic and i.group_id = v_group and i.drug_id = v_after;
        if not found or v_after = v_self then
          raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
        end if;
        select min(i.pos) into v_next from clinic_drug_group_items i
         where i.clinic_id = v_clinic and i.group_id = v_group and i.drug_id is distinct from v_self and i.pos > v_apos;
        if v_next is null then v_pos := v_apos + 1024; exit; end if;
        if v_next - v_apos >= 2 then v_pos := floor((v_apos + v_next)::numeric / 2)::bigint; exit; end if;
        if v_try = 2 then
          raise exception 'drug_row_gone' using hint = 'تغيّرت القائمة من جهاز ثاني — رجّعناها مثل ما بالخادم، عيد المحاولة.';
        end if;
        update clinic_drug_group_items i set pos = s.rn * 1024
          from (select x.id, row_number() over (order by x.pos, x.drug_id) as rn
                  from clinic_drug_group_items x where x.clinic_id = v_clinic and x.group_id = v_group) s
         where i.id = s.id and i.pos is distinct from s.rn * 1024;
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

    elsif v_op = 'group_create' then
      begin
        insert into clinic_drug_groups (id, clinic_id, name, pos) values (v_id, v_clinic, v_name, v_pos);
      exception when unique_violation then
        -- المعرّفُ لعيادةٍ أخرى (لا تراه هذه الجلسة): طلبٌ لا يُفهم، لا تصنيفٌ يُسرق.
        raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
      end;

    elsif v_op = 'group_edit' then
      update clinic_drug_groups set name = v_name where id = v_id and clinic_id = v_clinic;

    elsif v_op = 'group_move' then
      update clinic_drug_groups set pos = v_pos where id = v_id;

    elsif v_op = 'group_archive' then
      update clinic_drug_groups set archived_at = now(), pos = null
       where id = v_id and clinic_id = v_clinic and archived_at is null;

    elsif v_op = 'group_restore' then
      update clinic_drug_groups set archived_at = null, pos = v_pos where id = v_id;

    elsif v_op = 'member_add' then
      if v_exists then
        update clinic_drug_group_items set pos = v_pos
         where clinic_id = v_clinic and group_id = v_group and drug_id = v_id;
      else
        insert into clinic_drug_group_items (clinic_id, group_id, drug_id, pos) values (v_clinic, v_group, v_id, v_pos);
      end if;

    elsif v_op = 'member_remove' then
      delete from clinic_drug_group_items
       where clinic_id = v_clinic and group_id = nullif(o->>'group', '')::uuid and drug_id = v_id;

    elsif v_op = 'member_move' then
      update clinic_drug_group_items set pos = v_pos
       where clinic_id = v_clinic and group_id = v_group and drug_id = v_id;

    else
      raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
    end if;
  end loop;

  return clinic_drugs_list();
end $$;
revoke all on function public.clinic_drugs_apply(uuid, jsonb) from public, anon;
grant execute on function public.clinic_drugs_apply(uuid, jsonb) to authenticated;
