-- ============================================================================
-- 0265 — حالةُ الحقل (م١): عيادةٌ تستلم حقلَ دواجنٍ كاملاً كحالة
--
-- الطلب (المالك، ١٠/١١ — docs/field-cases-plan.md، والتوصياتُ الثمانية بقسمها ٣ اعتُمدت بـ«طيب كمل»):
-- عياداتٌ تشتغل على الدواجن تستلم حقلاً كاملاً: نوعه وعدده ونافقه، وتشريحه طيراً طيراً، وبرنامج تحصينه
-- المخطَّط والمنجَز، وطبلةُ علاجٍ يطبّقها المربي، وأيامُ زياراته وما انشاف بكلّ زيارة.
--
-- الجذرُ الذي تُبنى عليه: كلُّ جدولٍ طبّيٍّ عندنا pet_id NOT NULL (القطيعُ عشرون ألفَ طيرٍ بصفٍّ واحد لا
-- يدخلها)، ونظامُ الحقول القائم (0191–0193، باقة farm) دفترُ صاحب الحقل يصرف من مخزنه بالكلفة — لا عيادةٌ
-- تبيع. فالحالةُ جداولُ flock_* جديدة كلُّها، ولا جدولَ قائمٌ يُمسّ:
--  • الحقلُ زبونُ العيادة (cust_key من رقمه واسمه)، والوجبةُ هي الحالة: قطيعٌ واحد من الوصول إلى البيع.
--  • **الكتابةُ من دوالّها وحدها** (definer، تسأل staff_can بنفسها، ومرجعٌ من الجهاز لا يكرّر)، والجداولُ
--    قراءةٌ فقط لمن بالعيادة: فلا «نصفُ زيارة» محفوظة، ولا نافقٌ يُعدّ مرّتين، ولا كتابةٌ تتجاوز الدور.
--  • العمرُ بحساب الطبيب العراقيّ: يومُ الوصول = عمر يوم واحد (_flock_age) — قرارُ المالك ١.
--  • «لا تبيع قبل» = آخرُ يومِ علاجٍ أُعطي + أيامُ السحب + ١ (العلاجُ بالماء طولَ النهار) — قرارُ المالك ٥.
--    وسحبٌ فارغٌ بسطر دواء = «غير معروف» يُقال بصوت لا صفر (معنى 0193). والطبلةُ المُرسَلة تُعدَّل بنسخةٍ
--    تُوقف القديمة بيومها، فدواءٌ أُعطي من القديمة لا يسقط من السحب.
--  • لا جدولَ جرعاتٍ ولا فتراتِ سحبٍ مدمج: الطبيبُ يكتب من العلبة (الدراسةُ السابقة، الجزء الخامس).
-- إضافيّةٌ كلُّها، وتُعاد بلا أثرٍ ثانٍ. تراجع (الواجهةُ أوّلاً): drop function flock_* و_flock_* ثمّ
-- drop table flock_* — لا جدولَ قائمٌ تغيّر.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) الجداول ─────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.flock_farms (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name         text not null check (length(btrim(name)) between 1 and 120),
  owner_name   text check (owner_name is null or length(owner_name) <= 120),
  owner_phone  text check (owner_phone is null or length(owner_phone) <= 40),
  cust_key     text,
  governorate  text check (governorate is null or length(governorate) <= 60),
  area         text check (area is null or length(area) <= 120),
  houses_count int  check (houses_count is null or houses_count between 1 and 200),
  note         text check (note is null or length(note) <= 2000),
  archived     boolean not null default false,
  created_at   timestamptz not null default now(),
  created_by   uuid,
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index if not exists flock_farms_clinic_idx on public.flock_farms (clinic_id, cust_key);
comment on table public.flock_farms is
  'حقلُ دواجنٍ زبونٌ للعيادة (0265) — يبقى من وجبةٍ لوجبة. cust_key من رقم صاحبه (أو اسمه) كهويّة الزبون بالفواتير.';

create table if not exists public.flock_cases (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  farm_id       uuid not null references public.flock_farms(id) on delete cascade,
  kind          text not null check (kind in ('broiler','layer','breeder','other')),
  breed         text check (breed is null or length(breed) <= 60),
  hatchery      text check (hatchery is null or length(hatchery) <= 120),
  placed_on     date not null,
  placed_count  int  not null check (placed_count between 1 and 10000000),
  vet_id        uuid,
  status        text not null default 'open' check (status in ('open','closed')),
  closed_on     date,
  close_reason  text check (close_reason is null or close_reason in ('sold','depleted','transferred','other')),
  sold_count    int check (sold_count is null or sold_count between 0 and 10000000),
  sold_avg_kg   numeric check (sold_avg_kg is null or (sold_avg_kg > 0 and sold_avg_kg < 100)),
  note          text check (note is null or length(note) <= 4000),
  client_ref    text check (client_ref is null or length(client_ref) <= 80),
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint flock_cases_closed_chk check ((status = 'open') = (closed_on is null)),
  constraint flock_cases_close_after check (closed_on is null or closed_on >= placed_on)
);
create index if not exists flock_cases_clinic_idx on public.flock_cases (clinic_id, status);
create index if not exists flock_cases_farm_idx on public.flock_cases (farm_id);
create unique index if not exists flock_cases_ref_uq on public.flock_cases (clinic_id, client_ref) where client_ref is not null;
comment on table public.flock_cases is
  'حالةُ الحقل = الوجبة (0265): قطيعٌ واحد من وصوله (placed_on، وعمرُه يومَها ١) إلى إغلاقه.';

create table if not exists public.flock_houses (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null default auth_clinic(),
  case_id       uuid not null references public.flock_cases(id) on delete cascade,
  label         text not null check (length(btrim(label)) between 1 and 40),
  placed_count  int  not null check (placed_count between 1 and 10000000),
  position      int  not null default 0 check (position between 0 and 199)
);
create index if not exists flock_houses_case_idx on public.flock_houses (case_id, position);

create table if not exists public.flock_mortality (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  case_id     uuid not null references public.flock_cases(id) on delete cascade,
  house_id    uuid references public.flock_houses(id) on delete cascade,
  on_date     date not null,
  days        int  not null default 1 check (days between 1 and 60),
  dead        int  not null default 0 check (dead between 0 and 10000000),
  culled      int  not null default 0 check (culled between 0 and 10000000),
  source      text not null default 'staff' check (source in ('visit','staff','farmer')),
  visit_id    uuid,
  note        text check (note is null or length(note) <= 1000),
  client_ref  text check (client_ref is null or length(client_ref) <= 80),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists flock_mortality_case_idx on public.flock_mortality (case_id, on_date);
create index if not exists flock_mortality_house_idx on public.flock_mortality (house_id);
create unique index if not exists flock_mortality_ref_uq on public.flock_mortality (clinic_id, client_ref) where client_ref is not null;
comment on table public.flock_mortality is
  'النافقُ والفرز (0265): صفٌّ يغطّي days يوماً تنتهي بـon_date — يومٌ واحد غالباً، أو «منذ آخر زيارة». لا يتداخل صفّان لنفس القاعة (الدالّةُ تمنع)، والتراكميّ لا يتجاوز المُدخَل.';

create table if not exists public.flock_visits (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null default auth_clinic(),
  case_id        uuid not null references public.flock_cases(id) on delete cascade,
  at             timestamptz not null,
  kind           text not null default 'routine' check (kind in ('routine','complaint','followup')),
  quick          boolean not null default false,
  vet_id         uuid,
  flock          jsonb not null default '{}'::jsonb check (jsonb_typeof(flock) = 'object'),
  signs          text[] not null default '{}',
  env            jsonb not null default '{}'::jsonb check (jsonb_typeof(env) = 'object'),
  dx             text check (dx is null or length(dx) <= 1000),
  dx_codes       text[] not null default '{}',
  dx_status      text check (dx_status is null or dx_status in ('suspected','confirmed')),
  notifiable     boolean not null default false,
  advice         text check (advice is null or length(advice) <= 4000),
  notes          text check (notes is null or length(notes) <= 4000),
  trend          text check (trend is null or trend in ('better','same','worse')),
  next_visit_on  date,
  compliance     jsonb not null default '{}'::jsonb check (jsonb_typeof(compliance) = 'object'),
  client_ref     text check (client_ref is null or length(client_ref) <= 80),
  created_at     timestamptz not null default now(),
  created_by     uuid,
  updated_at     timestamptz not null default now(),
  updated_by     uuid
);
create index if not exists flock_visits_case_idx on public.flock_visits (case_id, at desc);
create unique index if not exists flock_visits_ref_uq on public.flock_visits (clinic_id, client_ref) where client_ref is not null;

create table if not exists public.flock_necropsy (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic(),
  case_id    uuid not null references public.flock_cases(id) on delete cascade,
  visit_id   uuid not null references public.flock_visits(id) on delete cascade,
  bird_no    int  not null check (bird_no between 1 and 50),
  source     text check (source is null or source in ('dead','cull','sacrificed')),
  weight_g   numeric check (weight_g is null or (weight_g > 0 and weight_g < 20000)),
  findings   text[] not null default '{}',
  scores     jsonb not null default '{}'::jsonb check (jsonb_typeof(scores) = 'object'),
  note       text check (note is null or length(note) <= 1000),
  constraint flock_necropsy_bird_uq unique (visit_id, bird_no)
);
create index if not exists flock_necropsy_case_idx on public.flock_necropsy (case_id);
comment on table public.flock_necropsy is
  'التشريحُ طيراً طيراً (0265): findings رموزٌ ثابتة (عضو.آفة) تُترجم عند العرض — لا نصٌّ يتبدّل بتبديل اللغة.';

create table if not exists public.flock_vax_programs (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name        text not null check (length(btrim(name)) between 1 and 80),
  kind        text not null check (kind in ('broiler','layer','breeder','other')),
  steps       jsonb not null default '[]'::jsonb check (jsonb_typeof(steps) = 'array'),
  archived    boolean not null default false,
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index if not exists flock_vax_programs_clinic_idx on public.flock_vax_programs (clinic_id, kind);
comment on table public.flock_vax_programs is
  'برنامجُ تحصينٍ تكتبه العيادة (0265) — لا قالبَ يُشحن بلا طبيب دواجنٍ يراجعه (قرارُ المالك ٦).';

create table if not exists public.flock_vax (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null default auth_clinic(),
  case_id       uuid not null references public.flock_cases(id) on delete cascade,
  vaccine       text not null check (length(btrim(vaccine)) between 1 and 120),
  disease       text check (disease is null or length(disease) <= 120),
  route         text not null default 'water' check (route in ('water','spray','eye','sc','im','wing','feed','other')),
  planned_age   int  check (planned_age is null or planned_age between 1 and 800),
  status        text not null default 'planned' check (status in ('planned','given','skipped')),
  given_on      date,
  given_by      text check (given_by is null or given_by in ('vet','farmer','hatchery','other')),
  batch_no      text check (batch_no is null or length(batch_no) <= 60),
  birds_count   int  check (birds_count is null or birds_count between 1 and 10000000),
  take_ok       boolean,
  note          text check (note is null or length(note) <= 1000),
  skip_reason   text check (skip_reason is null or length(skip_reason) <= 300),
  from_program  uuid,
  visit_id      uuid,
  created_at    timestamptz not null default now(),
  created_by    uuid,
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  constraint flock_vax_given_chk check ((status = 'given') = (given_on is not null)),
  constraint flock_vax_planned_chk check (status <> 'planned' or planned_age is not null)
);
create index if not exists flock_vax_case_idx on public.flock_vax (case_id, planned_age);

create table if not exists public.flock_treatments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  case_id     uuid not null references public.flock_cases(id) on delete cascade,
  visit_id    uuid,
  title       text check (title is null or length(title) <= 200),
  start_on    date not null,
  status      text not null default 'active' check (status in ('active','done','stopped','replaced')),
  stopped_on  date,
  version     int  not null default 1 check (version between 1 and 1000),
  supersedes  uuid,
  sent_at     timestamptz,
  printed_at  timestamptz,
  note        text check (note is null or length(note) <= 2000),
  client_ref  text check (client_ref is null or length(client_ref) <= 80),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  constraint flock_treatments_stop_chk check ((status in ('stopped','replaced')) = (stopped_on is not null))
);
create index if not exists flock_treatments_case_idx on public.flock_treatments (case_id, start_on desc);
create unique index if not exists flock_treatments_ref_uq on public.flock_treatments (clinic_id, client_ref) where client_ref is not null;
comment on table public.flock_treatments is
  'الطبلة (0265): جدولُ أيامٍ يطبّقه المربي. ما انبعث أو انطبع لا يتعدّل — تعديلُه نسخةٌ جديدة (supersedes) والقديمةُ «replaced» موقوفةٌ بيوم الجديدة.';

create table if not exists public.flock_treatment_lines (
  id                    uuid primary key default gen_random_uuid(),
  clinic_id             uuid not null default auth_clinic(),
  treatment_id          uuid not null references public.flock_treatments(id) on delete cascade,
  position              int  not null default 0 check (position between 0 and 49),
  day_from              int  not null check (day_from between 1 and 90),
  day_to                int  not null check (day_to between 1 and 90),
  product_id            uuid,
  product_name          text not null check (length(btrim(product_name)) between 1 and 160),
  kind                  text not null default 'med' check (kind in ('med','vitamin','electrolyte','disinfectant','other')),
  dose_amount           numeric check (dose_amount is null or (dose_amount > 0 and dose_amount < 1000000)),
  dose_unit             text check (dose_unit is null or dose_unit in ('g','ml','mg','tab','dose')),
  dose_per              text check (dose_per is null or dose_per in ('liter','1000_birds','kg_bw','bird','total')),
  strength_pct          numeric check (strength_pct is null or (strength_pct > 0 and strength_pct <= 100)),
  hours                 int  check (hours is null or hours between 1 and 24),
  route                 text not null default 'water' check (route in ('water','feed','spray','sc','im','eye','other')),
  withdrawal_meat_days  int  check (withdrawal_meat_days is null or withdrawal_meat_days between 0 and 120),
  withdrawal_egg_days   int  check (withdrawal_egg_days is null or withdrawal_egg_days between 0 and 120),
  note                  text check (note is null or length(note) <= 500),
  constraint flock_lines_days_chk check (day_to >= day_from),
  constraint flock_lines_dose_chk check ((dose_amount is null) = (dose_unit is null) and (dose_amount is null) = (dose_per is null)),
  constraint flock_lines_pos_uq unique (treatment_id, position)
);
comment on column public.flock_treatment_lines.withdrawal_meat_days is
  'من العلبة. فارغٌ بسطر دواء = «غير معروف» (يُقال بالأحمر على الطبلة والحالة)، وصفرٌ = «بلا سحب» صراحةً — معنى 0193.';

create table if not exists public.flock_media (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  case_id     uuid not null references public.flock_cases(id) on delete cascade,
  visit_id    uuid,
  bird_no     int  check (bird_no is null or bird_no between 1 and 50),
  kind        text not null default 'photo' check (kind in ('photo','lab','doc')),
  path        text not null check (path ~ '^flock/[0-9a-f-]{36}/[^/]{1,200}$'),
  caption     text check (caption is null or length(caption) <= 300),
  created_at  timestamptz not null default now(),
  created_by  uuid,
  constraint flock_media_path_case check (split_part(path, '/', 2) = case_id::text)
);
create index if not exists flock_media_case_idx on public.flock_media (case_id, created_at);

-- ── ٢) القراءة لمن بالعيادة، والكتابةُ من الدوالّ وحدها ───────────────────────────────────────────────
alter table public.flock_farms            enable row level security;
alter table public.flock_cases            enable row level security;
alter table public.flock_houses           enable row level security;
alter table public.flock_mortality        enable row level security;
alter table public.flock_visits           enable row level security;
alter table public.flock_necropsy         enable row level security;
alter table public.flock_vax_programs     enable row level security;
alter table public.flock_vax              enable row level security;
alter table public.flock_treatments       enable row level security;
alter table public.flock_treatment_lines  enable row level security;
alter table public.flock_media            enable row level security;

drop policy if exists flock_farms_read on public.flock_farms;
create policy flock_farms_read on public.flock_farms for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_cases_read on public.flock_cases;
create policy flock_cases_read on public.flock_cases for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_houses_read on public.flock_houses;
create policy flock_houses_read on public.flock_houses for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_mortality_read on public.flock_mortality;
create policy flock_mortality_read on public.flock_mortality for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_visits_read on public.flock_visits;
create policy flock_visits_read on public.flock_visits for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_necropsy_read on public.flock_necropsy;
create policy flock_necropsy_read on public.flock_necropsy for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_vax_programs_read on public.flock_vax_programs;
create policy flock_vax_programs_read on public.flock_vax_programs for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_vax_read on public.flock_vax;
create policy flock_vax_read on public.flock_vax for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_treatments_read on public.flock_treatments;
create policy flock_treatments_read on public.flock_treatments for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_treatment_lines_read on public.flock_treatment_lines;
create policy flock_treatment_lines_read on public.flock_treatment_lines for select to authenticated using (clinic_id = (select auth_clinic()));
drop policy if exists flock_media_read on public.flock_media;
create policy flock_media_read on public.flock_media for select to authenticated using (clinic_id = (select auth_clinic()));

-- لا كتابةَ مباشرة: لا سياسةَ كتابةٍ أصلاً، والمنحُ قراءةٌ وحدها (المنحُ الافتراضيّ بسوبابيس يعطي الكلّ).
revoke all on public.flock_farms, public.flock_cases, public.flock_houses, public.flock_mortality, public.flock_visits,
              public.flock_necropsy, public.flock_vax_programs, public.flock_vax, public.flock_treatments,
              public.flock_treatment_lines, public.flock_media from anon, authenticated;
grant select on public.flock_farms, public.flock_cases, public.flock_houses, public.flock_mortality, public.flock_visits,
                public.flock_necropsy, public.flock_vax_programs, public.flock_vax, public.flock_treatments,
                public.flock_treatment_lines, public.flock_media to authenticated;

-- سياجُ موظّف التصوير (0222): كلُّ جدولٍ بسياسات يحتاج سياجَه، وإلا أسقطت verify_photographer_fence الحزمة.
select public.photographer_fence_table('flock_farms');
select public.photographer_fence_table('flock_cases');
select public.photographer_fence_table('flock_houses');
select public.photographer_fence_table('flock_mortality');
select public.photographer_fence_table('flock_visits');
select public.photographer_fence_table('flock_necropsy');
select public.photographer_fence_table('flock_vax_programs');
select public.photographer_fence_table('flock_vax');
select public.photographer_fence_table('flock_treatments');
select public.photographer_fence_table('flock_treatment_lines');
select public.photographer_fence_table('flock_media');

-- ── ٣) الحسابُ الصِّرف (مرآتُه src/lib/flockMath.ts — يطابقه flock-parity بالحزمة) ─────────────────────
-- العمرُ بحساب الطبيب: يومُ الوصول = ١. واليومُ يومُ بغداد لا غرينتش (درسُ 0223).
create or replace function public._flock_age(p_placed date, p_on date) returns int
language sql immutable parallel safe set search_path = public as $$
  select case when p_placed is null or p_on is null then null else (p_on - p_placed) + 1 end
$$;
create or replace function public._flock_today() returns date
language sql stable set search_path = public as $$
  select (now() at time zone 'Asia/Baghdad')::date
$$;
-- مَن كتب: المستخدم — وفارغٌ لمشغّل المنصّة داخل عيادة زبون (اتفاقُ 0151: لا أثرَ له عندها).
create or replace function public._flock_actor() returns uuid
language sql stable set search_path = public as $$
  select case when public.platform_acting_clinic() is null then auth.uid() end
$$;
revoke all on function public._flock_age(date, date) from public, anon;
revoke all on function public._flock_today() from public, anon;
revoke all on function public._flock_actor() from public, anon;
grant execute on function public._flock_age(date, date) to authenticated;
grant execute on function public._flock_today() to authenticated;
grant execute on function public._flock_actor() to authenticated;

-- الصلاحية بالقدرات القائمة (قرارُ المالك ٣): فتحُ حالةٍ ونافقٌ مبلَّغ = addPets؛ الزيارةُ والتشريح والطبلة
-- والتحصين = editMedical؛ البرامج = manageSettings. والرفضُ يقول السببَ بالاسم — لا «انتهت الجلسة»
-- (درسُ سجلّ السوّاق: 42501 كان يُقرأ جلسةً منتهية).
create or replace function public._flock_can(p_cap text) returns uuid
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if not staff_can(p_cap) then
    raise exception 'flock_forbidden' using errcode = '42501', hint =
      (case p_cap when 'editMedical'    then 'الزيارة والتشريح والطبلة والتحصين للطبيب والمدير.'
                  when 'manageSettings' then 'برامجُ التحصين يعدّلها المدير.'
                  else 'هذا الحساب ما عنده صلاحية على حالات الحقول.' end);
  end if;
  return v_clinic;
end $$;
revoke all on function public._flock_can(text) from public, anon;
grant execute on function public._flock_can(text) to authenticated;

-- وجبةٌ مقفولةٌ للكتابة: من عيادتي، ومفتوحة (إلا ما يُسمح على المغلقة صراحةً).
create or replace function public._flock_case_for_write(p_case uuid, p_clinic uuid, p_open boolean default true)
returns public.flock_cases
language plpgsql security definer set search_path = public as $$
declare c flock_cases;
begin
  select * into c from flock_cases where id = p_case and clinic_id = p_clinic for update;
  if not found then raise exception 'flock_case_missing' using hint = 'حالةُ الحقل مو موجودة بعيادتك.'; end if;
  if p_open and c.status <> 'open' then
    raise exception 'flock_case_closed' using hint = 'الوجبة مغلقة — افتحها من جديد حتى تعدّل.';
  end if;
  return c;
end $$;
revoke all on function public._flock_case_for_write(uuid, uuid, boolean) from public, anon, authenticated;

-- رمزٌ ثابت (عضو.آفة أو علامة): حروفٌ صغيرة وأرقامٌ وشَرطة، ونقطةٌ واحدة اختيارية.
create or replace function public._flock_codes(p jsonb, p_max int) returns text[]
language plpgsql immutable set search_path = public as $$
declare v text[] := '{}'; e jsonb;
begin
  if p is null or jsonb_typeof(p) = 'null' then return v; end if;
  if jsonb_typeof(p) <> 'array' then raise exception 'flock_codes' using hint = 'قائمةُ الرموز مو قائمة.'; end if;
  for e in select * from jsonb_array_elements(p) loop
    if jsonb_typeof(e) <> 'string' or (e #>> '{}') !~ '^[a-z][a-z0-9_]{0,30}(\.[a-z0-9_]{1,30})?$' then
      raise exception 'flock_codes' using hint = 'رمزٌ غير مفهوم: ' || left(e::text, 40);
    end if;
    if not ((e #>> '{}') = any(v)) then v := v || (e #>> '{}'); end if;
  end loop;
  if coalesce(array_length(v, 1), 0) > p_max then raise exception 'flock_codes' using hint = 'رموزٌ أكثر من المسموح.'; end if;
  return v;
end $$;
revoke all on function public._flock_codes(jsonb, int) from public, anon, authenticated;

-- نصٌّ اختياريّ مقصوص: فارغٌ ⇒ null، وأطولُ من الحدّ ⇒ رفضٌ بالاسم لا قصٌّ صامت.
create or replace function public._flock_txt(p text, p_max int, p_what text) returns text
language plpgsql immutable set search_path = public as $$
declare v text := nullif(btrim(coalesce(p, '')), '');
begin
  if v is not null and length(v) > p_max then
    raise exception 'flock_too_long' using hint = p_what || ' أطول من ' || p_max || ' حرف.';
  end if;
  return v;
end $$;
revoke all on function public._flock_txt(text, int, text) from public, anon, authenticated;

-- ── ٤) الإحصاء: العمر، النافق، الإنذار، التحصين، السحب، الزيارة الجاية ────────────────────────────────
-- invoker: يقرأ بسياسة القارئ نفسه. ويحسب على وجبةٍ واحدة (القائمةُ تناديه لكلّ مفتوحة).
create or replace function public._flock_stats(p_case uuid) returns jsonb
language plpgsql stable security invoker set search_path = public as $$
declare
  c          flock_cases;
  v_today    date := _flock_today();
  v_ref      date;
  v_dead     bigint;
  v_culled   bigint;
  v_week1    numeric;
  v_week1_rec boolean;
  v_alert    boolean := false;
  v_alert_hs uuid[];
  v_peak     numeric;
  v_nextvax  jsonb;
  v_vax_over int;
  v_vax_soon int;
  v_safe_m   date;
  v_safe_e   date;
  v_unk_m    boolean;
  v_unk_e    boolean;
  v_active   int;
  v_lastv    record;
  v_threshold constant numeric := 0.25;   -- ٪ يومياً، يومين متتاليين بالقاعة (الخطّة §١١-ج)
begin
  select * into c from flock_cases where id = p_case;
  if not found then return null; end if;
  v_ref := coalesce(c.closed_on, v_today);

  select coalesce(sum(m.dead), 0), coalesce(sum(m.culled), 0) into v_dead, v_culled
    from flock_mortality m where m.case_id = p_case;

  -- النافقُ يوماً بيوم بالقاعة: صفٌّ يغطّي أياماً يتوزّع عليها بالتساوي.
  with spread as (
    select m.house_id, (g.d)::date as day, (m.dead + m.culled)::numeric / m.days as loss
      from flock_mortality m
      cross join lateral generate_series(m.on_date - (m.days - 1), m.on_date, interval '1 day') as g(d)
     where m.case_id = p_case
  ), per_day as (
    select house_id, day, sum(loss) as loss from spread group by house_id, day
  ), cap as (
    select h.id as house_id, h.placed_count::numeric as placed from flock_houses h where h.case_id = p_case
    union all
    select null::uuid, c.placed_count::numeric
     where not exists (select 1 from flock_houses h where h.case_id = p_case)
  ), daily as (
    select p.house_id, p.day, p.loss,
           cap.placed - coalesce(sum(p.loss) over (partition by p.house_id order by p.day
                                                   rows between unbounded preceding and 1 preceding), 0) as alive_start
      from per_day p join cap on cap.house_id is not distinct from p.house_id
  ), pct as (
    select house_id, day, case when alive_start > 0 then loss * 100 / alive_start end as pct from daily
  )
  -- إنذارٌ = يومان متتاليان فوق العتبة بنفس القاعة، آخرُهما خلال آخر ثلاثة أيام. يومٌ بلا تسجيل «غير معروف»
  -- لا صفر ولا عالٍ — فلا يُكمل سلسلة.
  select coalesce(bool_or(a.day between v_ref - 2 and v_ref and a.pct >= v_threshold and b.pct >= v_threshold), false),
         array_agg(distinct a.house_id)
            filter (where a.day between v_ref - 2 and v_ref and a.pct >= v_threshold and b.pct >= v_threshold
                      and a.house_id is not null),
         max(a.pct) filter (where a.day between v_ref - 6 and v_ref)
    into v_alert, v_alert_hs, v_peak
    from pct a left join pct b on b.house_id is not distinct from a.house_id and b.day = a.day - 1;
  -- كلُّ قاعةٍ تُنذر، بترتيب القاعات — لا «أوّلُ واحدة»: قاعتان بخطرٍ والإنذارُ يسمّي واحدة قائمةٌ ناقصة
  -- تُصدَّق (وكان اختيارُ الواحدة بين متعادلَين يومَ الإنذار نفسِه بلا ترتيب — أمسكه فحصُ التطابق).
  select coalesce(array_agg(h.id order by h.position, h.id), '{}') into v_alert_hs
    from flock_houses h where h.case_id = p_case and h.id = any(coalesce(v_alert_hs, '{}'));

  -- الأسبوعُ الأوّل: عمر ١–٧ (الأيامُ الموزَّعة داخله وحدها).
  select coalesce(sum((m.dead + m.culled)::numeric / m.days *
           greatest(0, least(m.on_date, c.placed_on + 6) - greatest(m.on_date - (m.days - 1), c.placed_on) + 1)), 0)
           * 100 / c.placed_count,
         coalesce(bool_or(m.on_date - (m.days - 1) <= c.placed_on + 6), false)
    into v_week1, v_week1_rec
    from flock_mortality m where m.case_id = p_case;

  -- التحصينُ الجاي، والمتأخّر، واليوم/باكر (التاريخُ = الوصول + العمر − ١).
  select to_jsonb(x) into v_nextvax from (
    select v.id, v.vaccine, v.route, v.planned_age as age, c.placed_on + (v.planned_age - 1) as due_on
      from flock_vax v where v.case_id = p_case and v.status = 'planned'
     order by v.planned_age, v.vaccine limit 1) x;
  select count(*) filter (where c.placed_on + (v.planned_age - 1) < v_today),
         count(*) filter (where c.placed_on + (v.planned_age - 1) between v_today and v_today + 1)
    into v_vax_over, v_vax_soon
    from flock_vax v where v.case_id = p_case and v.status = 'planned';

  -- السحب: كلُّ سطرِ دواءٍ **انعطى منه شيء** — آخرُ يومٍ له = أصغرُ (نهايته المخطَّطة، يوم إيقاف طبلته)،
  -- وما بدأ بعد الإيقاف ما انعطى. والنسخةُ المستبدَلة موقوفةٌ بيوم الجديدة فتبقى بالحساب.
  with given as (
    select l.withdrawal_meat_days as wm, l.withdrawal_egg_days as we,
           t.start_on + (l.day_from - 1) as first_day,
           least(t.start_on + (l.day_to - 1), coalesce(t.stopped_on, t.start_on + (l.day_to - 1))) as last_day
      from flock_treatment_lines l join flock_treatments t on t.id = l.treatment_id
     where t.case_id = p_case and l.kind = 'med'
  )
  select max(last_day + wm + 1), max(last_day + we + 1), coalesce(bool_or(wm is null), false), coalesce(bool_or(we is null), false)
    into v_safe_m, v_safe_e, v_unk_m, v_unk_e
    from given where last_day >= first_day;

  select count(*) into v_active from flock_treatments t
   where t.case_id = p_case and t.status = 'active'
     and exists (select 1 from flock_treatment_lines l where l.treatment_id = t.id
                  and t.start_on + (l.day_to - 1) >= v_today);

  select v.at, v.trend, v.next_visit_on into v_lastv
    from flock_visits v where v.case_id = p_case order by v.at desc limit 1;

  return jsonb_build_object(
    'age', _flock_age(c.placed_on, v_ref),
    'ref_on', v_ref,
    'placed', c.placed_count,
    'dead', v_dead,
    'culled', v_culled,
    'alive', c.placed_count - v_dead - v_culled,
    'cum_pct', round((v_dead + v_culled)::numeric * 100 / c.placed_count, 2),
    'week1_pct', round(v_week1, 2),
    'week1_recorded', v_week1_rec,
    'week1_done', _flock_age(c.placed_on, v_ref) >= 7,
    'mortality_alert', v_alert,
    'alert_houses', to_jsonb(v_alert_hs),
    'peak_pct_7d', round(v_peak, 2),
    'next_vax', v_nextvax,
    'vax_overdue', v_vax_over,
    'vax_soon', v_vax_soon,
    'safe_meat_from', v_safe_m,
    'safe_egg_from', v_safe_e,
    'withdrawal_unknown', v_unk_m,
    'egg_withdrawal_unknown', v_unk_e,
    'in_withdrawal', v_safe_m is not null and v_safe_m > v_today,
    'active_treatments', v_active,
    'last_visit_at', v_lastv.at,
    'last_trend', v_lastv.trend,
    'next_visit_on', v_lastv.next_visit_on,
    'visit_overdue', c.status = 'open' and v_lastv.next_visit_on is not null and v_lastv.next_visit_on < v_today
  );
end $$;
revoke all on function public._flock_stats(uuid) from public, anon;
grant execute on function public._flock_stats(uuid) to authenticated;

-- ── ٥) القراءات ───────────────────────────────────────────────────────────────────────────────────────
-- قائمةُ الحقول: صفٌّ لكلّ وجبة بالحالة المطلوبة، بحقلها وإحصائها — بنداءٍ واحد بلا N+1.
create or replace function public.flock_board(p_status text default 'open', p_limit int default 300)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(x.row order by x.sort_at desc), '[]'::jsonb)
    from (
      select jsonb_build_object(
               'case', to_jsonb(c) - 'client_ref',
               'farm', jsonb_build_object('id', f.id, 'name', f.name, 'owner_name', f.owner_name,
                                          'owner_phone', f.owner_phone, 'area', f.area, 'governorate', f.governorate),
               'houses', (select count(*) from flock_houses h where h.case_id = c.id),
               'stats', _flock_stats(c.id)) as row,
             coalesce(c.closed_on::timestamptz, c.created_at) as sort_at
        from flock_cases c join flock_farms f on f.id = c.farm_id
       where c.clinic_id = (select auth_clinic())
         and (p_status = 'all' or c.status = p_status)
       order by coalesce(c.closed_on::timestamptz, c.created_at) desc
       limit greatest(1, least(coalesce(p_limit, 300), 1000))
    ) x
$$;
revoke all on function public.flock_board(text, int) from public, anon;
grant execute on function public.flock_board(text, int) to authenticated;

-- الحالةُ كاملةً بلقطةٍ واحدة: الوجبة وحقلها وقاعاتها ونافقها وزياراتها وتشريحها وتحصينها وطبلاتها وصورها وإحصاؤها.
create or replace function public.flock_case_bundle(p_case uuid)
returns jsonb language sql stable security invoker set search_path = public as $$
  select case when c.id is null then null else jsonb_build_object(
    'case',       to_jsonb(c) - 'client_ref',
    'farm',       (select to_jsonb(f) from flock_farms f where f.id = c.farm_id),
    'houses',     coalesce((select jsonb_agg(to_jsonb(h) order by h.position, h.label) from flock_houses h where h.case_id = c.id), '[]'::jsonb),
    'mortality',  coalesce((select jsonb_agg(to_jsonb(m) - 'client_ref' order by m.on_date desc, m.created_at desc) from flock_mortality m where m.case_id = c.id), '[]'::jsonb),
    'visits',     coalesce((select jsonb_agg(to_jsonb(v) - 'client_ref' order by v.at desc) from flock_visits v where v.case_id = c.id), '[]'::jsonb),
    'necropsy',   coalesce((select jsonb_agg(to_jsonb(n) order by n.visit_id, n.bird_no) from flock_necropsy n where n.case_id = c.id), '[]'::jsonb),
    'vax',        coalesce((select jsonb_agg(to_jsonb(v) order by v.planned_age nulls last, v.given_on, v.created_at) from flock_vax v where v.case_id = c.id), '[]'::jsonb),
    'treatments', coalesce((select jsonb_agg(to_jsonb(t) - 'client_ref' || jsonb_build_object('lines',
                      coalesce((select jsonb_agg(to_jsonb(l) order by l.position) from flock_treatment_lines l where l.treatment_id = t.id), '[]'::jsonb))
                    order by t.start_on desc, t.version desc) from flock_treatments t where t.case_id = c.id), '[]'::jsonb),
    'media',      coalesce((select jsonb_agg(to_jsonb(md) order by md.created_at desc) from flock_media md where md.case_id = c.id), '[]'::jsonb),
    'stats',      _flock_stats(c.id)
  ) end
  from (select 1) one left join flock_cases c on c.id = p_case and c.clinic_id = (select auth_clinic())
$$;
revoke all on function public.flock_case_bundle(uuid) from public, anon;
grant execute on function public.flock_case_bundle(uuid) to authenticated;

-- حقولُ زبونٍ بعينه (من «حالة جديدة»): بمفتاح الزبون نفسِه (cust_key — رقمُه أو اسمُه)، وأيُّها بيه وجبةٌ مفتوحة.
create or replace function public.flock_farms_for(p_phone text, p_name text)
returns jsonb language sql stable security invoker set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('farm', to_jsonb(f),
           'open_case', (select c.id from flock_cases c where c.farm_id = f.id and c.status = 'open' limit 1))
           order by f.created_at desc), '[]'::jsonb)
    from flock_farms f
   where f.clinic_id = (select auth_clinic()) and not f.archived
     and f.cust_key = public.cust_key(p_phone, p_name)
$$;
revoke all on function public.flock_farms_for(text, text) from public, anon;
grant execute on function public.flock_farms_for(text, text) to authenticated;

-- ── ٦) الكتابة: فتحُ الحالة ─────────────────────────────────────────────────────────────────────────────
-- p = {client_ref, farm: {id} | {name, owner_name, owner_phone, governorate, area, houses_count, note},
--      case: {kind, breed, hatchery, placed_on, placed_count, vet_id, note},
--      houses: [{label, placed_count}], vax: [{vaccine, disease, route, age, at_hatchery, from_program}]}
create or replace function public.flock_case_open(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('addPets');
  v_actor  uuid := _flock_actor();
  v_ref    text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_f      flock_farms;
  v_c      flock_cases;
  v_fp     jsonb := coalesce(p->'farm', '{}'::jsonb);
  v_cp     jsonb := coalesce(p->'case', '{}'::jsonb);
  v_name   text;
  v_key    text;
  v_kind   text := v_cp->>'kind';
  v_placed date;
  v_count  int;
  v_hsum   bigint;
  v_bad    boolean;
  h        jsonb;
  s        jsonb;
  i        int := 0;
  v_age    int;
  v_route  text;
begin
  if v_ref is not null then
    select * into v_c from flock_cases where clinic_id = v_clinic and client_ref = v_ref;
    if found then
      return jsonb_build_object('case', to_jsonb(v_c) - 'client_ref',
                                'farm', (select to_jsonb(f) from flock_farms f where f.id = v_c.farm_id), 'replayed', true);
    end if;
  end if;

  -- الحقل: موجودٌ بمعرّفه، أو جديدٌ لا يكرّر حقلاً لنفس الزبون بنفس الاسم (تطبيعٌ بالطرفين).
  if nullif(v_fp->>'id', '') is not null then
    select * into v_f from flock_farms where id = (v_fp->>'id')::uuid and clinic_id = v_clinic for update;
    if not found or v_f.archived then raise exception 'flock_farm_missing' using hint = 'الحقل مو موجود بعيادتك.'; end if;
  else
    v_name := _flock_txt(v_fp->>'name', 120, 'اسم الحقل');
    if v_name is null then raise exception 'flock_farm_name' using hint = 'اكتب اسم الحقل (أو منطقته).'; end if;
    v_key := public.cust_key(v_fp->>'owner_phone', v_fp->>'owner_name');
    perform pg_advisory_xact_lock(hashtextextended('flock_farm:' || v_clinic::text || ':' || coalesce(v_key, ''), 0));
    if exists (select 1 from flock_farms f where f.clinic_id = v_clinic and not f.archived
                  and f.cust_key is not distinct from v_key and public.cust_norm(f.name) = public.cust_norm(v_name)) then
      raise exception 'flock_farm_twin' using hint = 'هذا الحقل مسجّل لهذا الزبون — اختاره من حقوله.';
    end if;
    insert into flock_farms (clinic_id, name, owner_name, owner_phone, cust_key, governorate, area, houses_count, note,
                             created_by, updated_by)
    values (v_clinic, v_name, _flock_txt(v_fp->>'owner_name', 120, 'اسم صاحب الحقل'),
            _flock_txt(v_fp->>'owner_phone', 40, 'رقم صاحب الحقل'), v_key,
            _flock_txt(v_fp->>'governorate', 60, 'المحافظة'), _flock_txt(v_fp->>'area', 120, 'المنطقة'),
            nullif(v_fp->>'houses_count', '')::int, _flock_txt(v_fp->>'note', 2000, 'الملاحظة'), v_actor, v_actor)
    returning * into v_f;
  end if;

  if exists (select 1 from flock_cases c where c.farm_id = v_f.id and c.status = 'open') then
    raise exception 'flock_open_exists' using hint = 'هذا الحقل بيه وجبة مفتوحة — افتحها، أو أغلقها قبل وجبة جديدة.';
  end if;
  if v_kind is null or v_kind not in ('broiler','layer','breeder','other') then
    raise exception 'flock_kind' using hint = 'اختر نوع القطيع: لحم، بيّاض، أمّهات.';
  end if;
  v_placed := nullif(v_cp->>'placed_on', '')::date;
  if v_placed is null or v_placed > _flock_today() + 7 or v_placed < _flock_today() - 800 then
    raise exception 'flock_placed_on' using hint = 'تاريخُ وصول الأفراخ غير صحيح.';
  end if;

  -- القاعات: إن وُجدت فالعددُ مجموعُها — رقمٌ واحدٌ لا رقمان يختلفان.
  if jsonb_typeof(p->'houses') = 'array' and jsonb_array_length(p->'houses') > 0 then
    if jsonb_array_length(p->'houses') > 200 then raise exception 'flock_houses' using hint = 'القاعات أكثر من ٢٠٠.'; end if;
    select sum(nullif(e->>'placed_count', '')::bigint), coalesce(bool_or(coalesce(nullif(e->>'placed_count', '')::bigint, 0) < 1), true)
      into v_hsum, v_bad from jsonb_array_elements(p->'houses') e;
    if v_bad or v_hsum is null or v_hsum > 10000000 then
      raise exception 'flock_houses' using hint = 'اكتب عدد الطيور بكلّ قاعة.';
    end if;
    v_count := v_hsum;
  else
    v_count := nullif(v_cp->>'placed_count', '')::int;
  end if;
  if v_count is null or v_count < 1 or v_count > 10000000 then
    raise exception 'flock_count' using hint = 'اكتب عدد الطيور المُدخَلة.';
  end if;

  insert into flock_cases (clinic_id, farm_id, kind, breed, hatchery, placed_on, placed_count, vet_id, note, client_ref,
                           created_by, updated_by)
  values (v_clinic, v_f.id, v_kind, _flock_txt(v_cp->>'breed', 60, 'السلالة'), _flock_txt(v_cp->>'hatchery', 120, 'الفقّاسة'),
          v_placed, v_count, nullif(v_cp->>'vet_id', '')::uuid, _flock_txt(v_cp->>'note', 4000, 'الملاحظة'), v_ref,
          v_actor, v_actor)
  returning * into v_c;

  if jsonb_typeof(p->'houses') = 'array' then
    for h in select * from jsonb_array_elements(p->'houses') loop
      insert into flock_houses (clinic_id, case_id, label, placed_count, position)
      values (v_clinic, v_c.id, coalesce(_flock_txt(h->>'label', 40, 'اسم القاعة'), 'قاعة ' || (i + 1)),
              (h->>'placed_count')::int, i);
      i := i + 1;
    end loop;
  end if;

  -- برنامجُ التحصين المنسوخ لهذه الوجبة، وما انعطى بالفقّاسة منجَزٌ بيوم الوصول.
  if jsonb_typeof(p->'vax') = 'array' then
    if jsonb_array_length(p->'vax') > 60 then raise exception 'flock_vax' using hint = 'خطواتُ التحصين أكثر من ٦٠.'; end if;
    for s in select * from jsonb_array_elements(p->'vax') loop
      v_age := coalesce(nullif(s->>'age', '')::int, 1);
      v_route := coalesce(nullif(s->>'route', ''), 'water');
      if v_age < 1 or v_age > 800 then raise exception 'flock_vax' using hint = 'عمرُ التحصين بين ١ و٨٠٠.'; end if;
      if v_route not in ('water','spray','eye','sc','im','wing','feed','other') then
        raise exception 'flock_vax' using hint = 'طريقةُ التحصين غير معروفة.';
      end if;
      if _flock_txt(s->>'vaccine', 120, 'اسم اللقاح') is null then
        raise exception 'flock_vax' using hint = 'اكتب اسم اللقاح بكلّ خطوة.';
      end if;
      if coalesce((s->>'at_hatchery')::boolean, false) then
        insert into flock_vax (clinic_id, case_id, vaccine, disease, route, planned_age, status, given_on, given_by,
                               from_program, created_by, updated_by)
        values (v_clinic, v_c.id, _flock_txt(s->>'vaccine', 120, 'اسم اللقاح'), _flock_txt(s->>'disease', 120, 'المرض'),
                v_route, 1, 'given', v_placed, 'hatchery', nullif(s->>'from_program', '')::uuid, v_actor, v_actor);
      else
        insert into flock_vax (clinic_id, case_id, vaccine, disease, route, planned_age, from_program, created_by, updated_by)
        values (v_clinic, v_c.id, _flock_txt(s->>'vaccine', 120, 'اسم اللقاح'), _flock_txt(s->>'disease', 120, 'المرض'),
                v_route, v_age, nullif(s->>'from_program', '')::uuid, v_actor, v_actor);
      end if;
    end loop;
  end if;

  return jsonb_build_object('case', to_jsonb(v_c) - 'client_ref', 'farm', to_jsonb(v_f), 'replayed', false);
end $$;
revoke all on function public.flock_case_open(jsonb) from public, anon;
grant execute on function public.flock_case_open(jsonb) to authenticated;

-- تعديلُ الوجبة (لا القاعات — تُفتح كما هي، وتعديلُها بـم٢): النوعُ والسلالةُ والفقّاسة والوصولُ والعددُ والملاحظة.
create or replace function public.flock_case_update(p_case uuid, p jsonb, p_expect timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('addPets');
  c        flock_cases := _flock_case_for_write(p_case, v_clinic, false);
  v_placed date := coalesce(nullif(p->>'placed_on', '')::date, c.placed_on);
  v_count  int  := coalesce(nullif(p->>'placed_count', '')::int, c.placed_count);
  v_kind   text := coalesce(nullif(p->>'kind', ''), c.kind);
  v_lost   bigint;
begin
  if p_expect is not null and c.updated_at <> p_expect then
    raise exception 'flock_changed' using hint = 'الوجبة تعدّلت من جهازٍ ثاني — حدّث الصفحة.';
  end if;
  if v_kind not in ('broiler','layer','breeder','other') then raise exception 'flock_kind' using hint = 'نوعُ القطيع غير معروف.'; end if;
  if v_placed > _flock_today() + 7 or v_placed < _flock_today() - 800
     or exists (select 1 from flock_mortality m where m.case_id = c.id and m.on_date - (m.days - 1) < v_placed)
     or exists (select 1 from flock_visits v where v.case_id = c.id and (v.at at time zone 'Asia/Baghdad')::date < v_placed) then
    raise exception 'flock_placed_on' using hint = 'تاريخُ الوصول بعد نافقٍ أو زيارةٍ مسجّلة — أو غير صحيح.';
  end if;
  if exists (select 1 from flock_houses h where h.case_id = c.id) then
    v_count := c.placed_count;                         -- مجموعُ القاعات هو العدد
  end if;
  select coalesce(sum(dead + culled), 0) into v_lost from flock_mortality where case_id = c.id;
  if v_count < 1 or v_count > 10000000 or v_lost > v_count then
    raise exception 'flock_count' using hint = 'العدد أقلّ من النافق المسجّل (' || v_lost || ').';
  end if;
  update flock_cases set
    kind = v_kind,
    breed = case when p ? 'breed' then _flock_txt(p->>'breed', 60, 'السلالة') else breed end,
    hatchery = case when p ? 'hatchery' then _flock_txt(p->>'hatchery', 120, 'الفقّاسة') else hatchery end,
    placed_on = v_placed, placed_count = v_count,
    vet_id = case when p ? 'vet_id' then nullif(p->>'vet_id', '')::uuid else vet_id end,
    note = case when p ? 'note' then _flock_txt(p->>'note', 4000, 'الملاحظة') else note end,
    updated_at = now(), updated_by = _flock_actor()
  where id = c.id returning * into c;
  return to_jsonb(c) - 'client_ref';
end $$;
revoke all on function public.flock_case_update(uuid, jsonb, timestamptz) from public, anon;
grant execute on function public.flock_case_update(uuid, jsonb, timestamptz) to authenticated;

-- الإغلاق وإعادةُ الفتح (الطبيب والمدير). البيعُ قبل «لا تبيع قبل» أو بسحبٍ غير معروف يُرفض ما لم يؤكَّد بالاسم.
create or replace function public.flock_case_close(p_case uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  c        flock_cases := _flock_case_for_write(p_case, v_clinic, true);
  v_on     date := coalesce(nullif(p->>'closed_on', '')::date, _flock_today());
  v_reason text := coalesce(nullif(p->>'reason', ''), 'sold');
  v_st     jsonb;
  v_ok     boolean := coalesce((p->>'confirm_withdrawal')::boolean, false);
begin
  if v_reason not in ('sold','depleted','transferred','other') then raise exception 'flock_close' using hint = 'سببُ الإغلاق غير معروف.'; end if;
  if v_on < c.placed_on or v_on > _flock_today() then raise exception 'flock_close' using hint = 'تاريخُ الإغلاق غير صحيح.'; end if;
  v_st := _flock_stats(c.id);
  if v_reason = 'sold' and not v_ok then
    if (v_st->>'safe_meat_from') is not null and v_on < (v_st->>'safe_meat_from')::date then
      raise exception 'flock_withdrawal_active' using hint = 'ممنوع البيع قبل ' || (v_st->>'safe_meat_from') || ' — فترةُ سحب دواء.';
    end if;
    if coalesce((v_st->>'withdrawal_unknown')::boolean, false) then
      raise exception 'flock_withdrawal_unknown' using hint = 'بطبلاتها دواءٌ فترةُ سحبه غير مكتوبة — تأكّد من العلبة.';
    end if;
  end if;
  update flock_cases set status = 'closed', closed_on = v_on, close_reason = v_reason,
         sold_count = nullif(p->>'sold_count', '')::int, sold_avg_kg = nullif(p->>'sold_avg_kg', '')::numeric,
         updated_at = now(), updated_by = _flock_actor()
   where id = c.id returning * into c;
  return to_jsonb(c) - 'client_ref';
end $$;
revoke all on function public.flock_case_close(uuid, jsonb) from public, anon;
grant execute on function public.flock_case_close(uuid, jsonb) to authenticated;

create or replace function public.flock_case_reopen(p_case uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  c        flock_cases := _flock_case_for_write(p_case, v_clinic, false);
begin
  if c.status = 'open' then return to_jsonb(c) - 'client_ref'; end if;
  if exists (select 1 from flock_cases o where o.farm_id = c.farm_id and o.status = 'open' and o.id <> c.id) then
    raise exception 'flock_open_exists' using hint = 'الحقل بيه وجبة مفتوحة غيرها.';
  end if;
  update flock_cases set status = 'open', closed_on = null, close_reason = null, sold_count = null, sold_avg_kg = null,
         updated_at = now(), updated_by = _flock_actor()
   where id = c.id returning * into c;
  return to_jsonb(c) - 'client_ref';
end $$;
revoke all on function public.flock_case_reopen(uuid) from public, anon;
grant execute on function public.flock_case_reopen(uuid) to authenticated;

-- تعديلُ الحقل نفسِه (اسمه وصاحبه ومكانه)، أو أرشفتُه حين لا وجبةَ مفتوحة بيه.
create or replace function public.flock_farm_save(p jsonb, p_expect timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('addPets');
  f        flock_farms;
  v_name   text;
  v_key    text;
begin
  select * into f from flock_farms where id = nullif(p->>'id', '')::uuid and clinic_id = v_clinic for update;
  if not found then raise exception 'flock_farm_missing' using hint = 'الحقل مو موجود بعيادتك.'; end if;
  if p_expect is not null and f.updated_at <> p_expect then
    raise exception 'flock_changed' using hint = 'الحقل تعدّل من جهازٍ ثاني — حدّث الصفحة.';
  end if;
  v_name := coalesce(case when p ? 'name' then _flock_txt(p->>'name', 120, 'اسم الحقل') end, f.name);
  v_key := public.cust_key(case when p ? 'owner_phone' then p->>'owner_phone' else f.owner_phone end,
                           case when p ? 'owner_name' then p->>'owner_name' else f.owner_name end);
  if exists (select 1 from flock_farms o where o.clinic_id = v_clinic and not o.archived and o.id <> f.id
                and o.cust_key is not distinct from v_key and public.cust_norm(o.name) = public.cust_norm(v_name)) then
    raise exception 'flock_farm_twin' using hint = 'حقلٌ بنفس الاسم لنفس الزبون موجود.';
  end if;
  if coalesce((p->>'archived')::boolean, false) and exists (select 1 from flock_cases c where c.farm_id = f.id and c.status = 'open') then
    raise exception 'flock_open_exists' using hint = 'أغلق وجبة الحقل قبل أرشفته.';
  end if;
  update flock_farms set
    name = v_name,
    owner_name = case when p ? 'owner_name' then _flock_txt(p->>'owner_name', 120, 'اسم صاحب الحقل') else owner_name end,
    owner_phone = case when p ? 'owner_phone' then _flock_txt(p->>'owner_phone', 40, 'رقم صاحب الحقل') else owner_phone end,
    cust_key = v_key,
    governorate = case when p ? 'governorate' then _flock_txt(p->>'governorate', 60, 'المحافظة') else governorate end,
    area = case when p ? 'area' then _flock_txt(p->>'area', 120, 'المنطقة') else area end,
    houses_count = case when p ? 'houses_count' then nullif(p->>'houses_count', '')::int else houses_count end,
    note = case when p ? 'note' then _flock_txt(p->>'note', 2000, 'الملاحظة') else note end,
    archived = coalesce((p->>'archived')::boolean, archived),
    updated_at = now(), updated_by = _flock_actor()
  where id = f.id returning * into f;
  return to_jsonb(f);
end $$;
revoke all on function public.flock_farm_save(jsonb, timestamptz) from public, anon;
grant execute on function public.flock_farm_save(jsonb, timestamptz) to authenticated;

-- ── ٧) النافق: لا تداخلَ بنفس القاعة، ولا تراكميَّ فوق المُدخَل ────────────────────────────────────────
-- داخليّة: تكتب صفاً واحداً بعد الفحوص (الوجبةُ مقفولةٌ عند المنادي). تُنادى من الحفظ المستقلّ ومن الزيارة.
create or replace function public._flock_mortality_put(c public.flock_cases, p jsonb, p_id uuid, p_visit uuid, p_source text)
returns public.flock_mortality
language plpgsql security definer set search_path = public as $$
declare
  v_house  uuid := nullif(p->>'house_id', '')::uuid;
  v_on     date := coalesce(nullif(p->>'on_date', '')::date, _flock_today());
  v_days   int  := coalesce(nullif(p->>'days', '')::int, 1);
  v_dead   int  := coalesce(nullif(p->>'dead', '')::int, 0);
  v_culled int  := coalesce(nullif(p->>'culled', '')::int, 0);
  v_has_h  boolean := exists (select 1 from flock_houses h where h.case_id = c.id);
  v_cap    bigint;
  v_lost   bigint;
  m        flock_mortality;
begin
  if v_has_h and (v_house is null or not exists (select 1 from flock_houses h where h.id = v_house and h.case_id = c.id)) then
    raise exception 'flock_house' using hint = 'اختر القاعة.';
  end if;
  if not v_has_h then v_house := null; end if;
  if v_days < 1 or v_days > 60 or v_dead < 0 or v_culled < 0 then
    raise exception 'flock_mortality_bad' using hint = 'الأعداد أو الأيام غير صحيحة.';
  end if;
  if v_on > _flock_today() or v_on - (v_days - 1) < c.placed_on then
    raise exception 'flock_mortality_date' using hint = 'أيامُ النافق قبل وصول الأفراخ أو بعد اليوم.';
  end if;
  if exists (select 1 from flock_mortality o
              where o.case_id = c.id and o.house_id is not distinct from v_house and o.id is distinct from p_id
                and daterange(o.on_date - (o.days - 1), o.on_date, '[]') && daterange(v_on - (v_days - 1), v_on, '[]')) then
    raise exception 'flock_mortality_overlap' using hint = 'هذي الأيام مسجّل بيها نافق — عدّل التسجيل الموجود بدل ما تضيف.';
  end if;
  v_cap := case when v_house is null then c.placed_count else (select placed_count from flock_houses where id = v_house) end;
  select coalesce(sum(o.dead + o.culled), 0) into v_lost from flock_mortality o
   where o.case_id = c.id and o.house_id is not distinct from v_house and o.id is distinct from p_id;
  if v_lost + v_dead + v_culled > v_cap then
    raise exception 'flock_mortality_over' using hint = 'النافقُ التراكميّ يتجاوز عدد الطيور (' || v_cap || ').';
  end if;
  if p_id is null then
    insert into flock_mortality (clinic_id, case_id, house_id, on_date, days, dead, culled, source, visit_id, note,
                                 client_ref, created_by, updated_by)
    values (c.clinic_id, c.id, v_house, v_on, v_days, v_dead, v_culled, p_source, p_visit,
            _flock_txt(p->>'note', 1000, 'ملاحظة النافق'), nullif(btrim(coalesce(p->>'client_ref', '')), ''),
            _flock_actor(), _flock_actor())
    returning * into m;
  else
    update flock_mortality set house_id = v_house, on_date = v_on, days = v_days, dead = v_dead, culled = v_culled,
           note = _flock_txt(p->>'note', 1000, 'ملاحظة النافق'), updated_at = now(), updated_by = _flock_actor()
     where id = p_id returning * into m;
  end if;
  return m;
end $$;
revoke all on function public._flock_mortality_put(public.flock_cases, jsonb, uuid, uuid, text) from public, anon, authenticated;

-- «نافق اليوم» وتعديلُه: p = {id?, expect_updated_at?, case_id, house_id?, on_date, days, dead, culled, source, note, client_ref}
create or replace function public.flock_mortality_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('addPets');
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_ref    text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  v_src    text := coalesce(nullif(p->>'source', ''), 'staff');
  c        flock_cases;
  m        flock_mortality;
begin
  if v_id is null and v_ref is not null then
    select * into m from flock_mortality where clinic_id = v_clinic and client_ref = v_ref;
    if found then return to_jsonb(m) - 'client_ref' || jsonb_build_object('replayed', true); end if;
  end if;
  if v_src not in ('staff','farmer') then raise exception 'flock_mortality_bad' using hint = 'مصدرُ النافق غير معروف.'; end if;
  if v_id is not null then
    select * into m from flock_mortality where id = v_id and clinic_id = v_clinic;
    if not found then raise exception 'flock_mortality_missing' using hint = 'تسجيلُ النافق مو موجود.'; end if;
    if m.visit_id is not null then
      raise exception 'flock_mortality_visit' using hint = 'هذا النافق مسجّل من زيارة — عدّله من الزيارة.';
    end if;
    if nullif(p->>'expect_updated_at', '') is not null and m.updated_at <> (p->>'expect_updated_at')::timestamptz then
      raise exception 'flock_changed' using hint = 'تعدّل من جهازٍ ثاني — حدّث الصفحة.';
    end if;
    c := _flock_case_for_write(m.case_id, v_clinic, true);
  else
    c := _flock_case_for_write(nullif(p->>'case_id', '')::uuid, v_clinic, true);
  end if;
  m := _flock_mortality_put(c, p, v_id, null, v_src);
  return to_jsonb(m) - 'client_ref' || jsonb_build_object('replayed', false);
end $$;
revoke all on function public.flock_mortality_save(jsonb) from public, anon;
grant execute on function public.flock_mortality_save(jsonb) to authenticated;

create or replace function public.flock_mortality_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('addPets');
  m        flock_mortality;
begin
  select * into m from flock_mortality where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'flock_mortality_missing' using hint = 'تسجيلُ النافق مو موجود.'; end if;
  if m.visit_id is not null then raise exception 'flock_mortality_visit' using hint = 'هذا النافق مسجّل من زيارة — عدّله من الزيارة.'; end if;
  perform _flock_case_for_write(m.case_id, v_clinic, true);
  delete from flock_mortality where id = p_id;
end $$;
revoke all on function public.flock_mortality_delete(uuid) from public, anon;
grant execute on function public.flock_mortality_delete(uuid) to authenticated;

-- ── ٨) الزيارة: ذرّيّة — الزيارةُ ونافقُها وتشريحُها وتحصيناتُها بمعاملةٍ واحدة ───────────────────────────
-- p = {id?, expect_updated_at?, client_ref, case_id, at, kind, quick, flock{}, signs[], env{}, dx, dx_codes[], dx_status,
--      notifiable, advice, notes, trend, next_visit_on, compliance{},
--      mortality: {house_id?, on_date?, days, dead, culled, note} | [{...}] | null,
--      necropsy: [{bird_no, source, weight_g, findings[], scores{}, note}],
--      vax_given: [{id, given_on?, given_by, batch_no, birds_count, take_ok, note}],
--      vax_new: [{vaccine, disease, route, given_by, batch_no, birds_count, take_ok, note}]}
create or replace function public.flock_visit_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  v_actor  uuid := _flock_actor();
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_ref    text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  c        flock_cases;
  v        flock_visits;
  v_at     timestamptz := coalesce(nullif(p->>'at', '')::timestamptz, now());
  v_day    date;
  v_kind   text := coalesce(nullif(p->>'kind', ''), 'routine');
  v_trend  text := nullif(p->>'trend', '');
  v_dxs    text := nullif(p->>'dx_status', '');
  v_flock  jsonb := '{}'::jsonb;
  v_env    jsonb := '{}'::jsonb;
  v_comp   jsonb := coalesce(p->'compliance', '{}'::jsonb);
  e        jsonb;
  k        text;
  b        jsonb;
  v_no     int;
  v_src    text;
  v_vx     flock_vax;
  v_route  text;
  v_by     text;
  v_morts  jsonb;
begin
  if v_id is null and v_ref is not null then
    select * into v from flock_visits where clinic_id = v_clinic and client_ref = v_ref;
    if found then return jsonb_build_object('visit', to_jsonb(v) - 'client_ref', 'replayed', true); end if;
  end if;
  if v_id is not null then
    select * into v from flock_visits where id = v_id and clinic_id = v_clinic;
    if not found then raise exception 'flock_visit_missing' using hint = 'الزيارة مو موجودة.'; end if;
    if nullif(p->>'expect_updated_at', '') is not null and v.updated_at <> (p->>'expect_updated_at')::timestamptz then
      raise exception 'flock_changed' using hint = 'الزيارة تعدّلت من جهازٍ ثاني — حدّث الصفحة.';
    end if;
    c := _flock_case_for_write(v.case_id, v_clinic, true);
  else
    c := _flock_case_for_write(nullif(p->>'case_id', '')::uuid, v_clinic, true);
  end if;

  v_day := (v_at at time zone 'Asia/Baghdad')::date;
  if v_day < c.placed_on or v_at > now() + interval '10 minutes' then
    raise exception 'flock_visit_date' using hint = 'وقتُ الزيارة قبل وصول الأفراخ أو بالمستقبل.';
  end if;
  if v_kind not in ('routine','complaint','followup') then raise exception 'flock_visit_bad' using hint = 'نوعُ الزيارة غير معروف.'; end if;
  if v_trend is not null and v_trend not in ('better','same','worse') then raise exception 'flock_visit_bad' using hint = 'حالُ الحقل غير معروف.'; end if;
  if v_dxs is not null and v_dxs not in ('suspected','confirmed') then raise exception 'flock_visit_bad' using hint = 'حالُ التشخيص غير معروف.'; end if;
  if nullif(p->>'next_visit_on', '') is not null and (p->>'next_visit_on')::date < v_day then
    raise exception 'flock_visit_bad' using hint = 'الزيارة الجاية قبل هذي الزيارة.';
  end if;

  -- القطيعُ اليوم: مفاتيحُ معروفة بأنواعها وحدودها — لا كائنٌ حرّ يحمل ما يشاء.
  if jsonb_typeof(p->'flock') = 'object' then
    for k, e in select * from jsonb_each(p->'flock') loop
      if jsonb_typeof(e) = 'null' then continue; end if;
      if k = 'feed_phase' then
        if (e #>> '{}') not in ('prestarter','starter','grower','finisher','withdrawal','layer','other') then
          raise exception 'flock_visit_bad' using hint = 'مرحلةُ العلف غير معروفة.'; end if;
        v_flock := v_flock || jsonb_build_object(k, e #>> '{}');
      elsif k in ('feed_source','note') then
        v_flock := v_flock || jsonb_build_object(k, _flock_txt(e #>> '{}', case when k = 'note' then 500 else 120 end, 'نصّ القطيع'));
      elsif k in ('feed_kg_day','water_l_day','avg_weight_g','temp_c','humidity_pct','alive_est','sample_n') then
        if jsonb_typeof(e) <> 'number' then raise exception 'flock_visit_bad' using hint = 'رقمٌ غير صحيح بالقطيع: ' || k; end if;
        if (k in ('feed_kg_day','water_l_day','alive_est','sample_n') and ((e #>> '{}')::numeric < 0 or (e #>> '{}')::numeric > 10000000))
           or (k = 'avg_weight_g' and ((e #>> '{}')::numeric <= 0 or (e #>> '{}')::numeric >= 20000))
           or (k = 'temp_c' and ((e #>> '{}')::numeric < -20 or (e #>> '{}')::numeric > 60))
           or (k = 'humidity_pct' and ((e #>> '{}')::numeric < 0 or (e #>> '{}')::numeric > 100)) then
          raise exception 'flock_visit_bad' using hint = 'رقمٌ خارج حدوده بالقطيع: ' || k;
        end if;
        v_flock := v_flock || jsonb_build_object(k, (e #>> '{}')::numeric);
      else
        raise exception 'flock_visit_bad' using hint = 'خانةٌ غير معروفة بالقطيع: ' || left(k, 40);
      end if;
    end loop;
  end if;
  -- البيئة: بندٌ ⇒ جيّد/مقبول/سيّئ.
  if jsonb_typeof(p->'env') = 'object' then
    for k, e in select * from jsonb_each(p->'env') loop
      if k !~ '^[a-z][a-z0-9_]{0,30}$' or (e #>> '{}') not in ('good','fair','poor') then
        raise exception 'flock_visit_bad' using hint = 'بندُ بيئةٍ غير مفهوم: ' || left(k, 40);
      end if;
      v_env := v_env || jsonb_build_object(k, e #>> '{}');
    end loop;
    if (select count(*) from jsonb_object_keys(v_env)) > 30 then raise exception 'flock_visit_bad' using hint = 'بنودُ البيئة أكثر من ٣٠.'; end if;
  end if;
  if jsonb_typeof(v_comp) <> 'object' or length(v_comp::text) > 8000 then
    raise exception 'flock_visit_bad' using hint = 'تطبيقُ الطبلة غير مفهوم.';
  end if;

  if v_id is null then
    insert into flock_visits (clinic_id, case_id, at, kind, quick, vet_id, flock, signs, env, dx, dx_codes, dx_status,
                              notifiable, advice, notes, trend, next_visit_on, compliance, client_ref, created_by, updated_by)
    values (v_clinic, c.id, v_at, v_kind, coalesce((p->>'quick')::boolean, false), coalesce(nullif(p->>'vet_id', '')::uuid, v_actor),
            v_flock, _flock_codes(p->'signs', 60), v_env, _flock_txt(p->>'dx', 1000, 'التشخيص'), _flock_codes(p->'dx_codes', 12),
            v_dxs, coalesce((p->>'notifiable')::boolean, false), _flock_txt(p->>'advice', 4000, 'التوصيات'),
            _flock_txt(p->>'notes', 4000, 'الملاحظات'), v_trend, nullif(p->>'next_visit_on', '')::date, v_comp, v_ref,
            v_actor, v_actor)
    returning * into v;
  else
    update flock_visits set at = v_at, kind = v_kind, quick = coalesce((p->>'quick')::boolean, quick), flock = v_flock,
           signs = _flock_codes(p->'signs', 60), env = v_env, dx = _flock_txt(p->>'dx', 1000, 'التشخيص'),
           dx_codes = _flock_codes(p->'dx_codes', 12), dx_status = v_dxs, notifiable = coalesce((p->>'notifiable')::boolean, false),
           advice = _flock_txt(p->>'advice', 4000, 'التوصيات'), notes = _flock_txt(p->>'notes', 4000, 'الملاحظات'),
           trend = v_trend, next_visit_on = nullif(p->>'next_visit_on', '')::date, compliance = v_comp,
           updated_at = now(), updated_by = v_actor
     where id = v.id returning * into v;
  end if;

  -- نافقُ الزيارة: يُستبدل كلُّه (صفوفُ هذه الزيارة وحدها) — صفٌّ لكلّ قاعة، أو صفٌّ واحد.
  if p ? 'mortality' then
    delete from flock_mortality where visit_id = v.id;
    v_morts := case jsonb_typeof(p->'mortality') when 'array' then p->'mortality' when 'object' then jsonb_build_array(p->'mortality') else '[]'::jsonb end;
    for e in select * from jsonb_array_elements(v_morts) loop
      perform _flock_mortality_put(c, e || jsonb_build_object('on_date', coalesce(nullif(e->>'on_date', ''), v_day::text), 'client_ref', null),
                                   null, v.id, 'visit');
    end loop;
  end if;

  -- التشريح: يُستبدل كلُّه لهذه الزيارة.
  if p ? 'necropsy' then
    delete from flock_necropsy where visit_id = v.id;
    if jsonb_typeof(p->'necropsy') = 'array' then
      if jsonb_array_length(p->'necropsy') > 50 then raise exception 'flock_necropsy' using hint = 'أكثرُ من ٥٠ طيراً بزيارةٍ واحدة.'; end if;
      for b in select * from jsonb_array_elements(p->'necropsy') loop
        v_no := nullif(b->>'bird_no', '')::int;
        v_src := nullif(b->>'source', '');
        if v_no is null or v_no < 1 or v_no > 50 then raise exception 'flock_necropsy' using hint = 'رقمُ الطير بين ١ و٥٠.'; end if;
        if v_src is not null and v_src not in ('dead','cull','sacrificed') then raise exception 'flock_necropsy' using hint = 'مصدرُ الطير غير معروف.'; end if;
        if jsonb_typeof(coalesce(b->'scores', '{}'::jsonb)) <> 'object' or length(coalesce(b->'scores', '{}'::jsonb)::text) > 2000 then
          raise exception 'flock_necropsy' using hint = 'درجاتُ التشريح غير مفهومة.';
        end if;
        -- النوعُ قبل التحويل بـCASE: OR بجملةٍ واحدة لا يضمن ترتيبَ التقييم فيُحوِّل نصّاً إلى رقم.
        if exists (select 1 from jsonb_each(coalesce(b->'scores', '{}'::jsonb)) s
                    where s.key !~ '^[a-z][a-z0-9_]{0,30}(\.[a-z0-9_]{1,30})?$'
                       or case when jsonb_typeof(s.value) <> 'number' then true
                               else (s.value #>> '{}')::numeric not between 0 and 200 end) then
          raise exception 'flock_necropsy' using hint = 'درجاتُ التشريح غير مفهومة.';
        end if;
        insert into flock_necropsy (clinic_id, case_id, visit_id, bird_no, source, weight_g, findings, scores, note)
        values (v_clinic, c.id, v.id, v_no, v_src, nullif(b->>'weight_g', '')::numeric, _flock_codes(b->'findings', 80),
                coalesce(b->'scores', '{}'::jsonb), _flock_txt(b->>'note', 1000, 'ملاحظة الطير'));
      end loop;
    end if;
  end if;

  -- تحصيناتٌ انعطت بهذه الزيارة: من البرنامج (بمعرّفها)، أو خارج البرنامج (جديدة).
  if jsonb_typeof(p->'vax_given') = 'array' then
    for e in select * from jsonb_array_elements(p->'vax_given') loop
      select * into v_vx from flock_vax where id = nullif(e->>'id', '')::uuid and case_id = c.id for update;
      if not found then raise exception 'flock_vax_missing' using hint = 'تحصينٌ مو من برنامج هذي الوجبة.'; end if;
      v_by := coalesce(nullif(e->>'given_by', ''), 'vet');
      if v_by not in ('vet','farmer','hatchery','other') then raise exception 'flock_vax' using hint = 'منو أعطى التحصين؟'; end if;
      if coalesce(nullif(e->>'given_on', '')::date, v_day) not between c.placed_on and _flock_today() then
        raise exception 'flock_vax' using hint = 'يومُ التحصين قبل الوصول أو بعد اليوم.';
      end if;
      update flock_vax set status = 'given', given_on = coalesce(nullif(e->>'given_on', '')::date, v_day), given_by = v_by,
             batch_no = _flock_txt(e->>'batch_no', 60, 'رقم وجبة اللقاح'), birds_count = nullif(e->>'birds_count', '')::int,
             take_ok = (e->>'take_ok')::boolean, note = coalesce(_flock_txt(e->>'note', 1000, 'ملاحظة التحصين'), note),
             skip_reason = null, visit_id = v.id, updated_at = now(), updated_by = v_actor
       where id = v_vx.id;
    end loop;
  end if;
  if jsonb_typeof(p->'vax_new') = 'array' then
    for e in select * from jsonb_array_elements(p->'vax_new') loop
      v_route := coalesce(nullif(e->>'route', ''), 'water');
      v_by := coalesce(nullif(e->>'given_by', ''), 'vet');
      if v_route not in ('water','spray','eye','sc','im','wing','feed','other') or v_by not in ('vet','farmer','hatchery','other')
         or _flock_txt(e->>'vaccine', 120, 'اسم اللقاح') is null then
        raise exception 'flock_vax' using hint = 'اكتب اللقاح وطريقته ومنو أعطاه.';
      end if;
      insert into flock_vax (clinic_id, case_id, vaccine, disease, route, planned_age, status, given_on, given_by, batch_no,
                             birds_count, take_ok, note, visit_id, created_by, updated_by)
      values (v_clinic, c.id, _flock_txt(e->>'vaccine', 120, 'اسم اللقاح'), _flock_txt(e->>'disease', 120, 'المرض'), v_route,
              _flock_age(c.placed_on, coalesce(nullif(e->>'given_on', '')::date, v_day)), 'given',
              coalesce(nullif(e->>'given_on', '')::date, v_day), v_by, _flock_txt(e->>'batch_no', 60, 'رقم وجبة اللقاح'),
              nullif(e->>'birds_count', '')::int, (e->>'take_ok')::boolean, _flock_txt(e->>'note', 1000, 'ملاحظة التحصين'),
              v.id, v_actor, v_actor);
    end loop;
  end if;

  return jsonb_build_object('visit', to_jsonb(v) - 'client_ref', 'replayed', false);
end $$;
revoke all on function public.flock_visit_save(jsonb) from public, anon;
grant execute on function public.flock_visit_save(jsonb) to authenticated;

-- ── ٩) الطبلة: ما انبعث أو انطبع لا يتعدّل — نسخةٌ جديدة توقف القديمة بيومها ──────────────────────────────
-- p = {id?, expect_updated_at?, client_ref, case_id, visit_id, title, start_on, note,
--      lines: [{day_from, day_to, product_id, product_name, kind, dose_amount, dose_unit, dose_per, strength_pct, hours,
--               route, withdrawal_meat_days, withdrawal_egg_days, note}]}
create or replace function public.flock_treatment_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  v_actor  uuid := _flock_actor();
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_ref    text := nullif(btrim(coalesce(p->>'client_ref', '')), '');
  c        flock_cases;
  t        flock_treatments;
  o        flock_treatments;
  v_start  date := nullif(p->>'start_on', '')::date;
  l        jsonb;
  i        int := 0;
  v_pid    uuid;
  v_kind   text;
  v_route  text;
  v_amt    numeric;
  v_unit   text;
  v_per    text;
begin
  -- المرجعُ لكلّ حفظةٍ من الجهاز (جديدةً أو نسخةً لمُرسَلة): إعادتُها بعد انقطاعٍ ترجع ما انحفظ أوّلاً — لا نسخةً ثالثة.
  if v_ref is not null then
    select * into t from flock_treatments where clinic_id = v_clinic and client_ref = v_ref;
    if found then
      return to_jsonb(t) - 'client_ref' || jsonb_build_object('replayed', true, 'lines',
        coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from flock_treatment_lines x where x.treatment_id = t.id), '[]'::jsonb));
    end if;
  end if;
  if v_id is not null then
    select * into o from flock_treatments where id = v_id and clinic_id = v_clinic for update;
    if not found then raise exception 'flock_treatment_missing' using hint = 'الطبلة مو موجودة.'; end if;
    if nullif(p->>'expect_updated_at', '') is not null and o.updated_at <> (p->>'expect_updated_at')::timestamptz then
      raise exception 'flock_changed' using hint = 'الطبلة تعدّلت من جهازٍ ثاني — حدّث الصفحة.';
    end if;
    if o.status = 'replaced' then raise exception 'flock_treatment_replaced' using hint = 'هذي نسخةٌ قديمة — عدّل الأحدث.'; end if;
    c := _flock_case_for_write(o.case_id, v_clinic, true);
  else
    c := _flock_case_for_write(nullif(p->>'case_id', '')::uuid, v_clinic, true);
  end if;

  v_start := coalesce(v_start, case when o.id is not null and o.sent_at is null and o.printed_at is null then o.start_on end, _flock_today());
  if v_start < c.placed_on or v_start > _flock_today() + 30 then
    raise exception 'flock_treatment_date' using hint = 'بدايةُ الطبلة قبل وصول الأفراخ أو بعيدة.';
  end if;
  if jsonb_typeof(p->'lines') <> 'array' or jsonb_array_length(p->'lines') < 1 or jsonb_array_length(p->'lines') > 30 then
    raise exception 'flock_treatment_lines' using hint = 'الطبلة تحتاج سطراً واحداً على الأقلّ (٣٠ أقصى).';
  end if;

  if o.id is not null and o.sent_at is null and o.printed_at is null then
    -- ما انبعثت ولا انطبعت: تُعدَّل بمكانها.
    update flock_treatments set title = _flock_txt(p->>'title', 200, 'عنوان الطبلة'), start_on = v_start,
           note = _flock_txt(p->>'note', 2000, 'ملاحظة الطبلة'), updated_at = now(), updated_by = v_actor
     where id = o.id returning * into t;
    delete from flock_treatment_lines where treatment_id = t.id;
  else
    if o.id is not null then
      -- انبعثت: نسخةٌ جديدة، والقديمةُ موقوفةٌ بيوم بداية الجديدة (شاملاً — دواءُ ذلك الصبح يبقى بالسحب).
      if v_start < o.start_on then
        raise exception 'flock_treatment_date' using hint = 'النسخة الجديدة تبدأ قبل القديمة.';
      end if;
      update flock_treatments set status = 'replaced',
             stopped_on = case when o.status = 'stopped' then least(o.stopped_on, v_start) else v_start end,
             updated_at = now(), updated_by = v_actor
       where id = o.id;
    end if;
    insert into flock_treatments (clinic_id, case_id, visit_id, title, start_on, version, supersedes, note, client_ref,
                                  created_by, updated_by)
    values (v_clinic, c.id, coalesce(nullif(p->>'visit_id', '')::uuid, o.visit_id), _flock_txt(p->>'title', 200, 'عنوان الطبلة'),
            v_start, coalesce(o.version, 0) + 1, o.id, _flock_txt(p->>'note', 2000, 'ملاحظة الطبلة'),
            v_ref, v_actor, v_actor)
    returning * into t;
  end if;

  for l in select * from jsonb_array_elements(p->'lines') loop
    v_pid := nullif(l->>'product_id', '')::uuid;
    if v_pid is not null and not exists (select 1 from products pr where pr.id = v_pid and pr.clinic_id = v_clinic and pr.farm_id is null) then
      raise exception 'flock_treatment_product' using hint = 'مادّةٌ مو من مخزن العيادة.';
    end if;
    v_kind := coalesce(nullif(l->>'kind', ''), 'med');
    v_route := coalesce(nullif(l->>'route', ''), 'water');
    v_amt := nullif(l->>'dose_amount', '')::numeric;
    v_unit := nullif(l->>'dose_unit', '');
    v_per := nullif(l->>'dose_per', '');
    if v_kind not in ('med','vitamin','electrolyte','disinfectant','other')
       or v_route not in ('water','feed','spray','sc','im','eye','other')
       or (v_unit is not null and v_unit not in ('g','ml','mg','tab','dose'))
       or (v_per is not null and v_per not in ('liter','1000_birds','kg_bw','bird','total'))
       or ((v_amt is null) <> (v_unit is null)) or ((v_amt is null) <> (v_per is null))
       or (v_amt is not null and (v_amt <= 0 or v_amt >= 1000000)) then
      raise exception 'flock_treatment_line' using hint = 'سطرُ ' || (i + 1) || ': الجرعة أو وحدتها أو طريقتها غير صحيحة.';
    end if;
    if coalesce(nullif(l->>'day_from', '')::int, 0) < 1 or coalesce(nullif(l->>'day_to', '')::int, 0) < coalesce(nullif(l->>'day_from', '')::int, 0)
       or (l->>'day_to')::int > 90 then
      raise exception 'flock_treatment_line' using hint = 'سطرُ ' || (i + 1) || ': الأيام غير صحيحة.';
    end if;
    if _flock_txt(l->>'product_name', 160, 'اسم المادّة') is null then
      raise exception 'flock_treatment_line' using hint = 'سطرُ ' || (i + 1) || ': اكتب اسم المادّة.';
    end if;
    insert into flock_treatment_lines (clinic_id, treatment_id, position, day_from, day_to, product_id, product_name, kind,
                                       dose_amount, dose_unit, dose_per, strength_pct, hours, route, withdrawal_meat_days,
                                       withdrawal_egg_days, note)
    values (v_clinic, t.id, i, (l->>'day_from')::int, (l->>'day_to')::int, v_pid, _flock_txt(l->>'product_name', 160, 'اسم المادّة'),
            v_kind, v_amt, v_unit, v_per, nullif(l->>'strength_pct', '')::numeric, nullif(l->>'hours', '')::int, v_route,
            nullif(l->>'withdrawal_meat_days', '')::int, nullif(l->>'withdrawal_egg_days', '')::int,
            _flock_txt(l->>'note', 500, 'ملاحظة السطر'));
    i := i + 1;
  end loop;

  return to_jsonb(t) - 'client_ref' || jsonb_build_object('replayed', false, 'lines',
    coalesce((select jsonb_agg(to_jsonb(x) order by x.position) from flock_treatment_lines x where x.treatment_id = t.id), '[]'::jsonb));
end $$;
revoke all on function public.flock_treatment_save(jsonb) from public, anon;
grant execute on function public.flock_treatment_save(jsonb) to authenticated;

-- ختمُ الإرسال والطباعة (أيُّ كادرٍ يفتح الحالة)، والإيقافُ والإكمال (الطبيب والمدير).
create or replace function public.flock_treatment_mark(p_id uuid, p_what text, p_on date default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can(case when p_what in ('sent','printed') then 'addPets' else 'editMedical' end);
  t        flock_treatments;
  v_on     date := coalesce(p_on, _flock_today());
begin
  select * into t from flock_treatments where id = p_id and clinic_id = v_clinic for update;
  if not found then raise exception 'flock_treatment_missing' using hint = 'الطبلة مو موجودة.'; end if;
  if t.status = 'replaced' then raise exception 'flock_treatment_replaced' using hint = 'هذي نسخةٌ قديمة.'; end if;
  perform _flock_case_for_write(t.case_id, v_clinic, p_what not in ('sent','printed'));
  if p_what = 'sent' then
    update flock_treatments set sent_at = coalesce(sent_at, now()) where id = t.id returning * into t;
  elsif p_what = 'printed' then
    update flock_treatments set printed_at = coalesce(printed_at, now()) where id = t.id returning * into t;
  elsif p_what = 'stop' then
    if t.status <> 'active' then raise exception 'flock_treatment_state' using hint = 'الطبلة مو فعّالة.'; end if;
    if v_on < t.start_on - 1 or v_on > _flock_today() then raise exception 'flock_treatment_date' using hint = 'يومُ الإيقاف غير صحيح.'; end if;
    update flock_treatments set status = 'stopped', stopped_on = v_on, updated_at = now(), updated_by = _flock_actor()
     where id = t.id returning * into t;
  elsif p_what = 'done' then
    if t.status <> 'active' then raise exception 'flock_treatment_state' using hint = 'الطبلة مو فعّالة.'; end if;
    update flock_treatments set status = 'done', updated_at = now(), updated_by = _flock_actor() where id = t.id returning * into t;
  elsif p_what = 'resume' then
    if t.status not in ('stopped','done') then raise exception 'flock_treatment_state' using hint = 'الطبلة فعّالة أصلاً.'; end if;
    update flock_treatments set status = 'active', stopped_on = null, updated_at = now(), updated_by = _flock_actor()
     where id = t.id returning * into t;
  else
    raise exception 'flock_treatment_state' using hint = 'فعلٌ غير معروف.';
  end if;
  return to_jsonb(t) - 'client_ref';
end $$;
revoke all on function public.flock_treatment_mark(uuid, text, date) from public, anon;
grant execute on function public.flock_treatment_mark(uuid, text, date) to authenticated;

-- ── ١٠) التحصين: بندٌ يُخطَّط ويُنجز أو يُترك، وبرنامجُ العيادة ─────────────────────────────────────────────
-- p = {id?, expect_updated_at?, case_id, vaccine, disease, route, planned_age, status, given_on, given_by, batch_no,
--      birds_count, take_ok, note, skip_reason}
create or replace function public.flock_vax_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  v_actor  uuid := _flock_actor();
  v_id     uuid := nullif(p->>'id', '')::uuid;
  c        flock_cases;
  x        flock_vax;
  v_status text := coalesce(nullif(p->>'status', ''), 'planned');
  v_route  text := coalesce(nullif(p->>'route', ''), 'water');
  v_age    int  := nullif(p->>'planned_age', '')::int;
  v_on     date := nullif(p->>'given_on', '')::date;
  v_by     text := nullif(p->>'given_by', '');
  v_skip   text := _flock_txt(p->>'skip_reason', 300, 'سبب الترك');
begin
  if v_id is not null then
    select * into x from flock_vax where id = v_id and clinic_id = v_clinic for update;
    if not found then raise exception 'flock_vax_missing' using hint = 'التحصين مو موجود.'; end if;
    if nullif(p->>'expect_updated_at', '') is not null and x.updated_at <> (p->>'expect_updated_at')::timestamptz then
      raise exception 'flock_changed' using hint = 'التحصين تعدّل من جهازٍ ثاني — حدّث الصفحة.';
    end if;
    c := _flock_case_for_write(x.case_id, v_clinic, true);
  else
    c := _flock_case_for_write(nullif(p->>'case_id', '')::uuid, v_clinic, true);
  end if;
  if v_status not in ('planned','given','skipped') or v_route not in ('water','spray','eye','sc','im','wing','feed','other') then
    raise exception 'flock_vax' using hint = 'حالةُ التحصين أو طريقتُه غير معروفة.';
  end if;
  if v_age is not null and (v_age < 1 or v_age > 800) then raise exception 'flock_vax' using hint = 'عمرُ التحصين بين ١ و٨٠٠.'; end if;
  if v_status = 'planned' and v_age is null then raise exception 'flock_vax' using hint = 'اكتب عمر التحصين المخطَّط.'; end if;
  if v_status = 'given' then
    v_on := coalesce(v_on, _flock_today());
    if v_on < c.placed_on or v_on > _flock_today() then raise exception 'flock_vax' using hint = 'يومُ التحصين قبل الوصول أو بعد اليوم.'; end if;
    v_by := coalesce(v_by, 'vet');
    if v_by not in ('vet','farmer','hatchery','other') then raise exception 'flock_vax' using hint = 'منو أعطى التحصين؟'; end if;
  else
    v_on := null; v_by := null;
  end if;
  if v_status = 'skipped' and v_skip is null then raise exception 'flock_vax' using hint = 'اكتب سبب ترك التحصين.'; end if;
  if _flock_txt(p->>'vaccine', 120, 'اسم اللقاح') is null then raise exception 'flock_vax' using hint = 'اكتب اسم اللقاح.'; end if;

  if v_id is null then
    insert into flock_vax (clinic_id, case_id, vaccine, disease, route, planned_age, status, given_on, given_by, batch_no,
                           birds_count, take_ok, note, skip_reason, created_by, updated_by)
    values (v_clinic, c.id, _flock_txt(p->>'vaccine', 120, 'اسم اللقاح'), _flock_txt(p->>'disease', 120, 'المرض'), v_route,
            coalesce(v_age, _flock_age(c.placed_on, v_on)), v_status, v_on, v_by, _flock_txt(p->>'batch_no', 60, 'رقم وجبة اللقاح'),
            nullif(p->>'birds_count', '')::int, (p->>'take_ok')::boolean, _flock_txt(p->>'note', 1000, 'ملاحظة التحصين'),
            case when v_status = 'skipped' then v_skip end, v_actor, v_actor)
    returning * into x;
  else
    update flock_vax set vaccine = _flock_txt(p->>'vaccine', 120, 'اسم اللقاح'), disease = _flock_txt(p->>'disease', 120, 'المرض'),
           route = v_route, planned_age = coalesce(v_age, planned_age), status = v_status, given_on = v_on, given_by = v_by,
           batch_no = case when v_status = 'given' then _flock_txt(p->>'batch_no', 60, 'رقم وجبة اللقاح') end,
           birds_count = case when v_status = 'given' then nullif(p->>'birds_count', '')::int end,
           take_ok = case when v_status = 'given' then (p->>'take_ok')::boolean end,
           note = _flock_txt(p->>'note', 1000, 'ملاحظة التحصين'),
           skip_reason = case when v_status = 'skipped' then v_skip end,
           visit_id = case when v_status = 'given' then visit_id end,
           updated_at = now(), updated_by = v_actor
     where id = x.id returning * into x;
  end if;
  return to_jsonb(x);
end $$;
revoke all on function public.flock_vax_save(jsonb) from public, anon;
grant execute on function public.flock_vax_save(jsonb) to authenticated;

-- حذفُ بندٍ مخطَّطٍ لم يُنجَز — المنجَزُ تاريخٌ لا يُمحى (يرجع «مخطَّط» بالتعديل إن كان خطأ).
create or replace function public.flock_vax_delete(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  x        flock_vax;
begin
  select * into x from flock_vax where id = p_id and clinic_id = v_clinic for update;
  if not found then raise exception 'flock_vax_missing' using hint = 'التحصين مو موجود.'; end if;
  if x.status = 'given' then raise exception 'flock_vax_given' using hint = 'تحصينٌ منجَز ما ينحذف — رجّعه «مخطَّط» إن كان خطأ.'; end if;
  perform _flock_case_for_write(x.case_id, v_clinic, true);
  delete from flock_vax where id = p_id;
end $$;
revoke all on function public.flock_vax_delete(uuid) from public, anon;
grant execute on function public.flock_vax_delete(uuid) to authenticated;

-- برنامجُ العيادة: p = {id?, name, kind, steps: [{age, vaccine, disease, route}], archived}
create or replace function public.flock_program_save(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('manageSettings');
  v_actor  uuid := _flock_actor();
  v_id     uuid := nullif(p->>'id', '')::uuid;
  v_kind   text := coalesce(nullif(p->>'kind', ''), 'broiler');
  v_steps  jsonb := '[]'::jsonb;
  s        jsonb;
  r        flock_vax_programs;
begin
  if v_kind not in ('broiler','layer','breeder','other') then raise exception 'flock_kind' using hint = 'نوعُ القطيع غير معروف.'; end if;
  if _flock_txt(p->>'name', 80, 'اسم البرنامج') is null then raise exception 'flock_program' using hint = 'اكتب اسم البرنامج.'; end if;
  if jsonb_typeof(p->'steps') <> 'array' or jsonb_array_length(p->'steps') > 40 then
    raise exception 'flock_program' using hint = 'خطواتُ البرنامج قائمةٌ لا تزيد على ٤٠.';
  end if;
  for s in select * from jsonb_array_elements(p->'steps') loop
    if nullif(s->>'age', '')::int is null or (s->>'age')::int < 1 or (s->>'age')::int > 800
       or _flock_txt(s->>'vaccine', 120, 'اسم اللقاح') is null
       or coalesce(nullif(s->>'route', ''), 'water') not in ('water','spray','eye','sc','im','wing','feed','other') then
      raise exception 'flock_program' using hint = 'كلُّ خطوة: عمرٌ بين ١ و٨٠٠، واسمُ لقاح، وطريقة.';
    end if;
    v_steps := v_steps || jsonb_build_array(jsonb_build_object(
      'age', (s->>'age')::int, 'vaccine', _flock_txt(s->>'vaccine', 120, 'اسم اللقاح'),
      'disease', _flock_txt(s->>'disease', 120, 'المرض'), 'route', coalesce(nullif(s->>'route', ''), 'water'),
      'at_hatchery', coalesce((s->>'at_hatchery')::boolean, false)));
  end loop;
  if v_id is null then
    insert into flock_vax_programs (clinic_id, name, kind, steps, created_by, updated_by)
    values (v_clinic, _flock_txt(p->>'name', 80, 'اسم البرنامج'), v_kind, v_steps, v_actor, v_actor)
    returning * into r;
  else
    update flock_vax_programs set name = _flock_txt(p->>'name', 80, 'اسم البرنامج'), kind = v_kind, steps = v_steps,
           archived = coalesce((p->>'archived')::boolean, archived), updated_at = now(), updated_by = v_actor
     where id = v_id and clinic_id = v_clinic returning * into r;
    if not found then raise exception 'flock_program' using hint = 'البرنامج مو موجود.'; end if;
  end if;
  return to_jsonb(r);
end $$;
revoke all on function public.flock_program_save(jsonb) from public, anon;
grant execute on function public.flock_program_save(jsonb) to authenticated;

-- ── ١١) الصور: صفٌّ لكلّ ملفّ بمجلّد flock/<الوجبة>/ ──────────────────────────────────────────────────────
create or replace function public.flock_media_add(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('addPets');
  c        flock_cases := _flock_case_for_write(nullif(p->>'case_id', '')::uuid, v_clinic, false);
  r        flock_media;
begin
  if coalesce(p->>'path', '') !~ ('^flock/' || c.id::text || '/[^/]{1,200}$') then
    raise exception 'flock_media' using hint = 'مسارُ الملفّ مو لهذي الوجبة.';
  end if;
  if coalesce(nullif(p->>'kind', ''), 'photo') not in ('photo','lab','doc') then raise exception 'flock_media' using hint = 'نوعُ الملفّ غير معروف.'; end if;
  insert into flock_media (clinic_id, case_id, visit_id, bird_no, kind, path, caption, created_by)
  values (v_clinic, c.id, nullif(p->>'visit_id', '')::uuid, nullif(p->>'bird_no', '')::int, coalesce(nullif(p->>'kind', ''), 'photo'),
          p->>'path', _flock_txt(p->>'caption', 300, 'وصف الصورة'), _flock_actor())
  returning * into r;
  return to_jsonb(r);
end $$;
revoke all on function public.flock_media_add(jsonb) from public, anon;
grant execute on function public.flock_media_add(jsonb) to authenticated;

create or replace function public.flock_media_remove(p_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := _flock_can('editMedical');
  r        flock_media;
begin
  delete from flock_media where id = p_id and clinic_id = v_clinic returning * into r;
  if not found then raise exception 'flock_media' using hint = 'الملفّ مو موجود.'; end if;
  return to_jsonb(r);
end $$;
revoke all on function public.flock_media_remove(uuid) from public, anon;
grant execute on function public.flock_media_remove(uuid) to authenticated;

-- مَن يقرأ/يرفع ملفّاتِ وجبةٍ بالدلو: كادرُ عيادتها. (اسمُ المجلّد الثاني هو معرّفُ الوجبة.)
create or replace function public.can_access_flock_media(p_case text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from flock_cases c where c.id::text = p_case and c.clinic_id = auth_clinic())
$$;
revoke all on function public.can_access_flock_media(text) from public, anon;
grant execute on function public.can_access_flock_media(text) to authenticated;

-- سياساتُ الدلو (medical-media، مجلّد flock/<الوجبة>/): بجانب سياسات مجلّد الحيوان (0039) لا بدلها. والحزمةُ بلا
-- مخطّط storage (لا دلوَ هناك) فتُنشأ حين يوجد وحدَه — ودالّةُ الإذن نفسُها مفحوصةٌ بالحزمة.
do $$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists flock_media_read on storage.objects';
    execute 'drop policy if exists flock_media_insert on storage.objects';
    execute 'drop policy if exists flock_media_delete on storage.objects';
    execute $p$create policy flock_media_read on storage.objects for select to authenticated
      using (bucket_id = 'medical-media' and (storage.foldername(name))[1] = 'flock'
             and public.can_access_flock_media((storage.foldername(name))[2]))$p$;
    execute $p$create policy flock_media_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'medical-media' and (storage.foldername(name))[1] = 'flock'
                  and public.can_access_flock_media((storage.foldername(name))[2]))$p$;
    execute $p$create policy flock_media_delete on storage.objects for delete to authenticated
      using (bucket_id = 'medical-media' and (storage.foldername(name))[1] = 'flock'
             and public.can_access_flock_media((storage.foldername(name))[2]))$p$;
  end if;
end $$;
