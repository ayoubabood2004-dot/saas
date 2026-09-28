-- ============================================================================
-- ٠٢١٩ — الأقفاصُ صفوفٌ لا رسمة (إعادةُ البناء، `docs/cages-rebuild-plan.md`)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- «الأقفاص وترتيبُها تعبر من عيادةٍ للأخرى». التخطيطُ كلُّه كان نصّاً واحداً في
-- `clinic_prefs.cage_layout`، فكلُّ تعديلٍ حفظُ رسمةٍ كاملة بشرط رقم نسخةٍ
-- (0195/0204) — وأرقامُ النسخ بالإنتاج كلُّها ١–٢، فرسمةُ عيادةٍ بُنيت على مرآةِ
-- جهازٍ مسمومة (عيادةٌ أخرى، أو مشغّلٌ انقلبت جلستُه) تمرّ من الباب الشرعيّ
-- **كاملةً وبصمت**. كلُّ آلة المرايا والنسخ والتعارضات وُجدت لتخدم الرسمةَ الواحدة،
-- وهي نفسُها طريقُ العبور. (التدقيق الكامل: `docs/cages-plan.md`.)
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `cage_rooms` و`cages`: كلُّ غرفةٍ وكلُّ قفصٍ صفٌّ **مختومٌ بعيادته**، وسياساتُها
--   شرطُ ملكيّةٍ وحده (درسُ 0159/0162). أسوأُ كتابةٍ ضالّة بعد اليوم تمسّ صفّاً واحداً
--   بأرض كاتبها — استبدالُ تخطيطِ عيادةٍ كاملاً صار مستحيلاً بالبنية.
-- • `cage_layout_apply(p_clinic, p_ops)`: الكتابةُ الوحيدة، دفعةُ عملياتٍ على صفوفٍ
--   بعينها **بمعاملةٍ واحدة**. `p_clinic` هي العيادةُ التي قرأ منها المتصفّحُ ما يعدّله
--   (يأخذها من `my_workspace()` لحظةَ الترطيب) — فإن تبدّلت هويّةُ الجلسة بعدها
--   (انقضاءُ جلسة المشغّل 0170، خروجُه، تبويبٌ قديم) تُرفض الدفعةُ كلُّها بصوت.
--   وتحديثُ صفٍّ لم يعد موجوداً يُرفض (`cage_row_gone`) لا يُعاد خلقُه.
-- • `admissions.cage_id`: الإقامةُ تشير للقفص **بمعرّفه**. النصُّ القديم `cage` يبقى
--   ما تقرؤه الشاشاتُ وورقةُ الجولة، والقاعدةُ تشتقّ منه المعرّفَ عند كلّ كتابة
--   (فالحزمُ القديمة بالمتصفّحات تبقى تعمل)، وتمرّيه عند إعادة تسمية القفص — فلا
--   رقعَ إقاماتٍ من المتصفّح تُطلق وتُنسى بعد اليوم.
-- • إشغالٌ واحد: فهرسٌ فريد جزئيّ + رفضٌ مسمّى (`cage_occupied` باسم الساكن).
--
-- تراجع: الجداولُ والعمودُ إضافيّة، والتخطيطُ القديم لا يُمسّ هنا (0220 تقطعه).
-- تُطبَّق بعد 0218. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

-- ── ١) الجداول ─────────────────────────────────────────────────────────────
-- الأعمدةُ ممسوحةٌ من `LayoutRoom`/`LayoutCage` بـ`src/lib/cageLayout.ts` حرفاً.
create table if not exists public.cage_rooms (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  legacy_id   text,
  name        text not null check (char_length(btrim(name)) between 1 and 60),
  x           integer not null default 0 check (abs(x) <= 1000),
  z           integer not null default 0 check (abs(z) <= 1000),
  w           integer not null default 1 check (w between 1 and 50),
  d           integer not null default 1 check (d between 1 and 50),
  door_side   text check (door_side in ('front','back','left','right')),
  door_at     integer check (door_at >= 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cage_rooms_clinic_idx on public.cage_rooms (clinic_id);

create table if not exists public.cages (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  room_id     uuid not null references public.cage_rooms(id) on delete restrict,
  code        text not null check (char_length(btrim(code)) between 1 and 24),
  x           integer not null default 0 check (abs(x) <= 1000),
  z           integer not null default 0 check (abs(z) <= 1000),
  color       text check (color is null or char_length(color) <= 24),
  facing      smallint not null default 0 check (facing between 0 and 3),
  level       smallint not null default 0 check (level between 0 and 1),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists cages_clinic_idx on public.cages (clinic_id);
create index if not exists cages_room_idx on public.cages (room_id);
-- الرمزُ واحدٌ بالعيادة بنفس تطبيع المتصفّح (`trim().toLowerCase()`)، وخليّةٌ واحدة
-- لكلّ قفصٍ بطابقه. المقيسُ بالإنتاج (٢٧/٩): صفرُ توائم وصفرُ خلايا مزدوجة.
create unique index if not exists cages_code_uq on public.cages (clinic_id, lower(btrim(code)));
create unique index if not exists cages_cell_uq on public.cages (clinic_id, x, z, level);

alter table public.admissions add column if not exists cage_id uuid references public.cages(id) on delete set null;
-- فهرسٌ كامل للمفتاح الأجنبي (db-guard لا يقبل الجزئيَّ تغطيةً)، والجزئيُّ هو القفل.
create index if not exists adm_cage_idx on public.admissions (cage_id);
create unique index if not exists adm_one_active_per_cage
  on public.admissions (cage_id) where status = 'active' and cage_id is not null;

-- ── ٢) RLS: ملكيّةٌ وحدها ──────────────────────────────────────────────────
alter table public.cage_rooms enable row level security;
alter table public.cages enable row level security;
drop policy if exists cage_rooms_select on public.cage_rooms;
create policy cage_rooms_select on public.cage_rooms
  for select using (clinic_id = (select auth_clinic()));
drop policy if exists cage_rooms_insert on public.cage_rooms;
create policy cage_rooms_insert on public.cage_rooms
  for insert with check (clinic_id = (select auth_clinic()));
drop policy if exists cage_rooms_update on public.cage_rooms;
create policy cage_rooms_update on public.cage_rooms
  for update using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
drop policy if exists cage_rooms_delete on public.cage_rooms;
create policy cage_rooms_delete on public.cage_rooms
  for delete using (clinic_id = (select auth_clinic()));
revoke all on table public.cage_rooms from anon;
grant select, insert, update, delete on table public.cage_rooms to authenticated;

drop policy if exists cages_select on public.cages;
create policy cages_select on public.cages
  for select using (clinic_id = (select auth_clinic()));
drop policy if exists cages_insert on public.cages;
create policy cages_insert on public.cages
  for insert with check (clinic_id = (select auth_clinic()));
drop policy if exists cages_update on public.cages;
create policy cages_update on public.cages
  for update using (clinic_id = (select auth_clinic())) with check (clinic_id = (select auth_clinic()));
drop policy if exists cages_delete on public.cages;
create policy cages_delete on public.cages
  for delete using (clinic_id = (select auth_clinic()));
revoke all on table public.cages from anon;
grant select, insert, update, delete on table public.cages to authenticated;

-- ── ٣) حرّاسُ الصفوف (invoker: يحرسون ما تقدر السياسةُ أن تكتبه، ولا يشدّون أكثر) ──
create or replace function public.cage_rooms_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if (select count(*) from cage_rooms where clinic_id = new.clinic_id) >= 40 then
      raise exception 'too_many_rooms' using hint = 'وصلتوا سقف الغرف (٤٠) — احذفوا غرفة ما تستعملوها قبل ما تضيفون.';
    end if;
  else
    if current_user = 'authenticated' and new.clinic_id is distinct from old.clinic_id then
      raise exception 'clinic_frozen' using hint = 'صفوف الأقفاص ما تنتقل بين عيادات.';
    end if;
    -- تصغيرٌ يقصّ أقفاصاً (أو تحريكٌ يُخرجها) يُرفض — والمتصفّحُ يمنعه محلّياً؛ هذا
    -- لجهازٍ أضاف قفصاً بالخلايا نفسها بنفس اللحظة.
    if (new.x, new.z, new.w, new.d) is distinct from (old.x, old.z, old.w, old.d)
       and exists (select 1 from cages c where c.room_id = new.id
                    and not (c.x >= new.x and c.x < new.x + new.w and c.z >= new.z and c.z < new.z + new.d)) then
      raise exception 'room_cuts_cages' using hint = 'الغرفة ما تصغر وبالمساحة المقصوصة أقفاص — انقلها أو احذفها أوّلاً.';
    end if;
    new.updated_at := now();
  end if;
  return new;
end $$;
drop trigger if exists cage_rooms_guard on public.cage_rooms;
create trigger cage_rooms_guard before insert or update on public.cage_rooms
  for each row execute function public.cage_rooms_guard();

create or replace function public.cages_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_room_clinic uuid; v_inside boolean;
begin
  if tg_op = 'UPDATE' then
    if current_user = 'authenticated' and new.clinic_id is distinct from old.clinic_id then
      raise exception 'clinic_frozen' using hint = 'صفوف الأقفاص ما تنتقل بين عيادات.';
    end if;
    new.updated_at := now();
  elsif (select count(*) from cages where clinic_id = new.clinic_id) >= 400 then
    raise exception 'too_many_cages' using hint = 'وصلتوا سقف الأقفاص (٤٠٠) — احذفوا قفصاً ما تستعملوه قبل ما تضيفون.';
  end if;
  -- الغرفةُ من نفس العيادة. بصلاحية المُستدعي: غرفةُ عيادةٍ أخرى **غيرُ مرئية** فتُرفض.
  -- والقفصُ داخل حدودها: جهازٌ صغّر الغرفة وجهازٌ ثانٍ أضاف قفصاً بالخلايا المقصوصة
  -- بنفس اللحظة = قفصٌ خارج كلّ غرفة، لا يُرسم ولا يُحفظ بعده شيء. يُرفض بالاسم.
  select r.clinic_id, (new.x >= r.x and new.x < r.x + r.w and new.z >= r.z and new.z < r.z + r.d)
    into v_room_clinic, v_inside
    from cage_rooms r where r.id = new.room_id;
  if v_room_clinic is null or v_room_clinic <> new.clinic_id then
    raise exception 'room_cross_clinic' using hint = 'الغرفة مو من نفس العيادة — حدّث الصفحة.';
  end if;
  if not v_inside then
    raise exception 'cage_outside_room' using hint = 'القفص ' || btrim(new.code) || ' صار خارج حدود غرفته — حدّث اللوحة، يمكن الغرفة تصغّرت من جهاز ثاني.';
  end if;
  -- رفضٌ مسمّى قبل رمز القيد العاري (الفهرسان خلفه للسباق).
  if tg_op = 'INSERT' or lower(btrim(new.code)) <> lower(btrim(old.code)) then
    if exists (select 1 from cages c where c.clinic_id = new.clinic_id and c.id <> new.id
                and lower(btrim(c.code)) = lower(btrim(new.code))) then
      raise exception 'code_twin' using hint = 'الرقم ' || btrim(new.code) || ' مستعمل بقفص ثاني — القفص له رقم واحد.';
    end if;
    -- قفصٌ مسكون يأخذ رقماً مكتوباً على راقدٍ غير مربوط = راقدان بنفس الرقم، واللوحةُ
    -- تعرض واحداً ويختفي الثاني «كأنه ما كان». يُرفض بالاسم.
    if tg_op = 'UPDATE'
       and exists (select 1 from admissions a where a.cage_id = new.id and a.status = 'active')
       and exists (select 1 from admissions a where a.clinic_id = new.clinic_id and a.status = 'active'
                    and a.cage_id is null and lower(btrim(coalesce(a.cage, ''))) = lower(btrim(new.code))) then
      raise exception 'code_held_by_orphan'
        using hint = 'الرقم ' || btrim(new.code) || ' مكتوب على حيوان راقد ما مربوط بقفص — ضمّه لغرفة أوّلاً أو اختر رقماً ثانياً.';
    end if;
  end if;
  if tg_op = 'INSERT' or (new.x, new.z, new.level) is distinct from (old.x, old.z, old.level) then
    if exists (select 1 from cages c where c.clinic_id = new.clinic_id and c.id <> new.id
                and c.x = new.x and c.z = new.z and c.level = new.level) then
      raise exception 'cage_cell_taken' using hint = 'بهذي الخانة قفص من قبل — حدّث اللوحة، يمكن انضاف من جهاز ثاني.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists cages_guard on public.cages;
create trigger cages_guard before insert or update on public.cages
  for each row execute function public.cages_guard();

-- حذفُ قفصٍ مسكون يُرفض لكلّ عميلٍ كان (اللوحة، المجسّم، حزمةٌ قديمة) — لا لمن تذكّر.
create or replace function public.cages_delete_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare v_name text;
begin
  select coalesce(p.name, 'حيوان') into v_name
    from admissions a left join pets p on p.id = a.pet_id
   where a.cage_id = old.id and a.status = 'active'
   limit 1;
  if found then
    raise exception 'cage_occupied_delete'
      using hint = 'القفص ' || old.code || ' بيه ' || v_name || ' — انقله أو طلّعه قبل الحذف.';
  end if;
  return old;
end $$;
drop trigger if exists cages_delete_guard on public.cages;
create trigger cages_delete_guard before delete on public.cages
  for each row execute function public.cages_delete_guard();

create or replace function public.cage_rooms_delete_guard()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from cages where room_id = old.id) then
    raise exception 'room_not_empty' using hint = 'فرّغ الغرفة من أقفاصها أوّلاً.';
  end if;
  return old;
end $$;
drop trigger if exists cage_rooms_delete_guard on public.cage_rooms;
create trigger cage_rooms_delete_guard before delete on public.cage_rooms
  for each row execute function public.cage_rooms_delete_guard();

-- ── ٤) الإقامةُ ↔ القفص ────────────────────────────────────────────────────
-- «مرآةٌ خادمية»: حين تكتب القاعدةُ نفسُها نصَّ الإقامة (تسميةُ قفص) أو معرّفَها
-- (ربطُ يتيم) ترفع علماً **محصوراً بالمعاملة** يتخطّاه الاشتقاقُ وسجلُّ الحركات —
-- الحيوانُ لم يتحرّك، فلا حركةَ «من ١٠١ إلى ~a3f…» بسجلّه. (نمطُ علم 0204.)

-- القفصُ انولد أو تبدّل رقمُه ⇒ نصُّ ساكنه يتبعه، ويتيمٌ يحمل رقمَه يُربط به.
create or replace function public.cages_sync_admissions()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform set_config('vp.cage_mirror', '1', true);
  if tg_op = 'UPDATE' then
    update admissions set cage = new.code
     where cage_id = new.id and status = 'active' and cage is distinct from new.code;
  end if;
  if not exists (select 1 from admissions where cage_id = new.id and status = 'active') then
    update admissions set cage_id = new.id
     where id = (select a.id from admissions a
                  where a.clinic_id = new.clinic_id and a.status = 'active' and a.cage_id is null
                    and lower(btrim(coalesce(a.cage, ''))) = lower(btrim(new.code))
                  order by a.admitted_on, a.created_at, a.id
                  limit 1);
  end if;
  perform set_config('vp.cage_mirror', '', true);
  return null;
end $$;
drop trigger if exists cages_sync_admissions on public.cages;
create trigger cages_sync_admissions after insert or update of code on public.cages
  for each row execute function public.cages_sync_admissions();

-- الإقامةُ: المعرّفُ **يُشتقّ** من النصّ الذي كتبه العميل، لا يُكتب مباشرة.
-- فكلُّ مسارٍ قائم (حالةٌ جديدة، سحبةُ اللوحة، المجسّم، حزمةٌ قديمة) يمرّ من بابٍ
-- واحد، والإشغالُ يُفحص هنا بالاسم قبل أن يصل الفهرسَ الفريد.
create or replace function public.admissions_cage_link()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_code text;
  v_id   uuid;
  v_name text;
begin
  if coalesce(current_setting('vp.cage_mirror', true), '') = '1' then return new; end if;

  -- الاشتقاقُ عند كلّ كتابةٍ للنصّ **وعند عودة الإقامة نشطة**: إقامةٌ خرجت قبل 0219
  -- معرّفُها فارغ ونصُّها باقٍ، وسحبةُ الكانبان تعيدها بلا لمس النصّ — فبلا هذا
  -- تعود بقفصٍ مسكونٍ ولا يراها فحصُ الإشغال ولا الفهرسُ الفريد (أمسكه التدقيق).
  if tg_op = 'INSERT' or new.cage is distinct from old.cage
     or (old.status is distinct from 'active' and new.status = 'active') then
    v_code := nullif(btrim(coalesce(new.cage, '')), '');
    v_id := null;
    if v_code is not null then
      select c.id into v_id from cages c
       where c.clinic_id = new.clinic_id and lower(btrim(c.code)) = lower(v_code);
    end if;
    -- نقلُ ساكنٍ مربوطٍ إلى رقمٍ غير مرسوم يُرفض: هذا ما تفعله حزمةٌ قديمة تعيد تسمية
    -- قفصٍ فترقّع ساكنَه ثم يُرفض حفظُ رسمتها (0220) — فيبقى الحيوانُ على رقمٍ لا قفصَ له.
    if v_id is null and v_code is not null and tg_op = 'UPDATE' and old.cage_id is not null
       and new.status = 'active' and current_user = 'authenticated' then
      raise exception 'cage_not_drawn'
        using hint = 'القفص ' || v_code || ' ما مرسوم بغرفة الأقفاص — حدّث الصفحة واختر قفصاً مرسوماً.';
    end if;
    -- رمزٌ لا يطابق قفصاً مرسوماً = يتيمٌ **مرئيّ** (شريطُ «بلا قفص»)، لا رفض:
    -- عيادةٌ لم ترسم أقفاصَها بعدُ تكتب أرقامَها بيدها.
    new.cage_id := v_id;
  elsif new.cage_id is distinct from old.cage_id and new.cage_id is not null
        and current_user = 'authenticated' then
    -- المعرّفُ بلا نصّ = بابٌ جانبيّ يفكّ المرآة. تفريغُه (حذفُ قفصٍ ⇒ set null) مسموح.
    raise exception 'cage_id_direct_write'
      using hint = 'القفص يتحدّد برقمه — حدّث الصفحة وجرّب من غرفة الأقفاص.';
  end if;

  -- إعادةُ تفعيل إقامةٍ مُخرَجة (سحبةُ الكانبان)، **أو حالةٌ جديدة** بقفصٍ مسكون: ترجع
  -- «بلا قفص» لا تستولي عليه، ولا تُفشل الكتابةَ نفسَها. الحالةُ الجديدة كانت ترفض فيُعاد
  -- الحفظُ بعد أن انكتب ملفُّ الحيوان فيتكرّر (أمسكه التدقيق)؛ والشاشةُ تفحص قبلها.
  if new.status = 'active' and new.cage_id is not null
     and (tg_op = 'INSERT' or old.status is distinct from 'active')
     and exists (select 1 from admissions a where a.cage_id = new.cage_id and a.status = 'active' and a.id <> new.id) then
    new.cage_id := null;
    new.cage := null;
  end if;

  if new.status = 'active' and new.cage_id is not null
     and (tg_op = 'INSERT' or new.cage_id is distinct from old.cage_id or old.status <> 'active') then
    select coalesce(p.name, 'حيوان') into v_name
      from admissions a left join pets p on p.id = a.pet_id
     where a.cage_id = new.cage_id and a.status = 'active' and a.id <> new.id
     limit 1;
    if found then
      raise exception 'cage_occupied'
        using detail = json_build_object('pet_name', v_name, 'cage_code', coalesce(btrim(new.cage), ''))::text,
              hint = 'القفص ' || coalesce(btrim(new.cage), '') || ' بيه ' || v_name || ' — اختر قفصاً ثانياً، أو انقله أوّلاً.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists admissions_cage_link on public.admissions;
create trigger admissions_cage_link before insert or update on public.admissions
  for each row execute function public.admissions_cage_link();

-- سجلُّ الحركات (0070) كما هو حرفاً، إلا أنّ مرآةَ الخادم ليست حركة.
create or replace function public.log_admission_movement() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into pet_movements (clinic_id, pet_id, admission_id, event, to_kind, to_cage)
    values (new.clinic_id, new.pet_id, new.id, 'admitted', new.kind, new.cage);
  elsif tg_op = 'UPDATE' then
    if old.status = 'active' and new.status = 'discharged' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, from_kind)
      values (new.clinic_id, new.pet_id, new.id, 'discharged', new.kind);
    elsif old.status = 'discharged' and new.status = 'active' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, to_kind, to_cage)
      values (new.clinic_id, new.pet_id, new.id, 'admitted', new.kind, new.cage);
    end if;
    if new.kind is distinct from old.kind and new.status = 'active' and old.status = 'active' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, from_kind, to_kind)
      values (new.clinic_id, new.pet_id, new.id, 'transferred', old.kind, new.kind);
    end if;
    if new.cage is distinct from old.cage and new.status = 'active' and old.status = 'active'
       and coalesce(current_setting('vp.cage_mirror', true), '') <> '1' then
      insert into pet_movements (clinic_id, pet_id, admission_id, event, from_cage, to_cage)
      values (new.clinic_id, new.pet_id, new.id, 'cage_changed', old.cage, new.cage);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists movements_log on public.admissions;
create trigger movements_log after insert or update on public.admissions
  for each row execute function public.log_admission_movement();

-- ── ٥) «شنو صار» تبقى مجابة: التدقيقُ قفصاً قفصاً ─────────────────────────
drop trigger if exists audit_all on public.cage_rooms;
create trigger audit_all after insert or update or delete on public.cage_rooms
  for each row execute function audit_change();
drop trigger if exists audit_all on public.cages;
create trigger audit_all after insert or update or delete on public.cages
  for each row execute function audit_change();

-- ── ٦) الكتابةُ الوحيدة: دفعةُ عملياتٍ على صفوفٍ بعينها ────────────────────
-- invoker: كلُّ سطرٍ يمرّ من RLS والحرّاس كأنه كتابةٌ مباشرة، والدالّةُ تضيف
-- ثلاثةً لا تقدر عليها السياسة: ختمُ الهويّة، والذرّية، وترقيمٌ بمرحلتين.
--
-- p_ops: [{op, id, ...}] — op واحدٌ من:
--   room_insert/room_update {id,name,x,z,w,d,door_side,door_at}
--   room_delete {id}
--   cage_insert/cage_update {id,room_id,code,x,z,color,facing,level}
--   cage_delete {id}
-- الترتيب: حذفُ أقفاص ← غرف (إدراج/تحديث) ← أرقامٌ مؤقتة لما يتبدّل رقمُه ←
-- تحديثُ أقفاص ← إدراجُ أقفاص ← حذفُ غرف. فتبادلُ رقمين (١٠١↔١٠٢) لا يصطدم
-- بالفهرس الفريد في منتصفه، والغرفةُ لا تُحذف قبل أقفاصها.
create or replace function public.cage_layout_apply(p_clinic uuid, p_ops jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  o jsonb;
  n integer;
  v_done integer := 0;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if p_clinic is null or p_clinic <> v_clinic then
    raise exception 'clinic_switched'
      using hint = 'تبدّلت العيادة على هذا الجهاز من وقت ما فتحت الأقفاص — حدّث الصفحة. ما انحفظ شي.';
  end if;
  if p_ops is null or jsonb_typeof(p_ops) <> 'array' then
    raise exception 'bad_ops' using hint = 'طلبٌ غير مفهوم — حدّث الصفحة.';
  end if;
  if jsonb_array_length(p_ops) > 1000 then
    raise exception 'too_many_ops' using hint = 'تعديلات كثيرة بطلب واحد — حدّث الصفحة وجرّب أقل.';
  end if;

  -- ١) حذفُ أقفاص (المسكونُ يرفضه حارسُه بالاسم). صفٌّ حُذف من قبل = لا شيء.
  for o in select value from jsonb_array_elements(p_ops) where value->>'op' = 'cage_delete' loop
    delete from cages where id = (o->>'id')::uuid and clinic_id = v_clinic;
    get diagnostics n = row_count; v_done := v_done + n;
  end loop;

  -- ٢) الغرف.
  for o in select value from jsonb_array_elements(p_ops) where value->>'op' = 'room_insert' loop
    insert into cage_rooms (id, name, x, z, w, d, door_side, door_at)
    values ((o->>'id')::uuid, btrim(o->>'name'), (o->>'x')::integer, (o->>'z')::integer,
            (o->>'w')::integer, (o->>'d')::integer, nullif(o->>'door_side', ''), (o->>'door_at')::integer);
    v_done := v_done + 1;
  end loop;
  for o in select value from jsonb_array_elements(p_ops) where value->>'op' = 'room_update' loop
    update cage_rooms
       set name = btrim(o->>'name'), x = (o->>'x')::integer, z = (o->>'z')::integer,
           w = (o->>'w')::integer, d = (o->>'d')::integer,
           door_side = nullif(o->>'door_side', ''), door_at = (o->>'door_at')::integer
     where id = (o->>'id')::uuid and clinic_id = v_clinic;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'cage_row_gone' using hint = 'غرفة انحذفت أو تغيّرت من جهاز ثاني — حدّثنا اللوحة، عيد تعديلك.';
    end if;
    v_done := v_done + 1;
  end loop;

  -- ٣) أرقامٌ مؤقتة لكلّ قفصٍ يتبدّل رقمُه (≤ ٢٤ حرفاً كقيد الطول).
  update cages c
     set code = '~' || substr(md5(c.id::text), 1, 16)
    from (select (value->>'id')::uuid id, btrim(value->>'code') code
            from jsonb_array_elements(p_ops) where value->>'op' = 'cage_update') u
   where c.id = u.id and c.clinic_id = v_clinic and lower(btrim(c.code)) <> lower(u.code);

  -- ٤) تحديثُ الأقفاص.
  for o in select value from jsonb_array_elements(p_ops) where value->>'op' = 'cage_update' loop
    update cages
       set room_id = (o->>'room_id')::uuid, code = btrim(o->>'code'),
           x = (o->>'x')::integer, z = (o->>'z')::integer,
           color = nullif(o->>'color', ''), facing = coalesce((o->>'facing')::smallint, 0),
           level = coalesce((o->>'level')::smallint, 0)
     where id = (o->>'id')::uuid and clinic_id = v_clinic;
    get diagnostics n = row_count;
    if n = 0 then
      raise exception 'cage_row_gone' using hint = 'قفص انحذف أو تغيّر من جهاز ثاني — حدّثنا اللوحة، عيد تعديلك.';
    end if;
    v_done := v_done + 1;
  end loop;

  -- ٥) إدراجُ الأقفاص.
  for o in select value from jsonb_array_elements(p_ops) where value->>'op' = 'cage_insert' loop
    insert into cages (id, room_id, code, x, z, color, facing, level)
    values ((o->>'id')::uuid, (o->>'room_id')::uuid, btrim(o->>'code'), (o->>'x')::integer, (o->>'z')::integer,
            nullif(o->>'color', ''), coalesce((o->>'facing')::smallint, 0), coalesce((o->>'level')::smallint, 0));
    v_done := v_done + 1;
  end loop;

  -- ٦) حذفُ الغرف (بعد أقفاصها).
  for o in select value from jsonb_array_elements(p_ops) where value->>'op' = 'room_delete' loop
    delete from cage_rooms where id = (o->>'id')::uuid and clinic_id = v_clinic;
    get diagnostics n = row_count; v_done := v_done + n;
  end loop;

  return jsonb_build_object('ok', true, 'applied', v_done);
end $$;
revoke all on function public.cage_layout_apply(uuid, jsonb) from public, anon;
grant execute on function public.cage_layout_apply(uuid, jsonb) to authenticated;

comment on table public.cage_rooms is
  'غرف الأقفاص (0219): صفٌّ لكلّ غرفة مختومٌ بعيادته. الكتابة عبر cage_layout_apply.';
comment on table public.cages is
  'الأقفاص (0219): صفٌّ لكلّ قفص مختومٌ بعيادته، الرقم واحد بالعيادة والخلية واحدة بطابقها.';
comment on column public.admissions.cage_id is
  'القفص بمعرّفه (0219) — يُشتقّ من نصّ cage بالخادم، لا يُكتب من المتصفّح مباشرة.';
comment on function public.cage_layout_apply(uuid, jsonb) is
  'الكتابة الوحيدة لتخطيط الأقفاص (0219): دفعة عمليات على صفوف بمعاملة واحدة، بختم العيادة التي قُرئ منها.';
