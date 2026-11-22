-- ============================================================================
-- 0287: تقاريرُ الحالة المطبوعة — «شنو نطى للزبون آخر مرّة، وشنو عدّل» (طلبُ المالك ٢٢/١١)
--
-- ورقةُ الحالة (تقريرُ الفندقة، الفندقة العلاجية، الحالة والعلاج — بطاقةُ القفص و«الملخّص») يعدّل الطبيبُ كلَّ كلمةٍ
-- فيها قبل الطباعة. قرارُ المالك: «ويضلّ الورقة الشكل الي عدّله محفوظ، بحيث يعرف بعد فترة هو شنو عدّل وشنو نطى
-- للزبون آخر مرّة». فكلُّ طباعةٍ صفٌّ هنا:
--   • `sheet` — الورقةُ كما انطبعت بعد التعديل (نموذجُها المنظَّم لا HTML: يُعاد رسمُه مُهرَّباً دائماً).
--   • `edits` — ما غيّره الطبيبُ عن نصّ النظام، سطراً سطراً: [{k, from, to, label}]. نصُّ النظام الأصليّ يُستعاد
--     منها، فلا يُخزَّن مرّتين.
--
-- الصفُّ **لا يتعدّل ولا يُحذف** (ما انطبع انطبع — كالراجيتة 0261): لا صلاحيةَ تحديثٍ ولا حذف، والمحفّزُ يختم
-- الكاتبَ واللحظة من الخادم ويرفض أيَّ تحديثٍ لو مُنحت صلاحيتُه يوماً. وحذفُ الحيوان يحذفها بالمفتاح الأجنبيّ
-- (وحذفُه نفسُه مُدقَّقٌ بلقطته). ولا سطرَ بسجلّ الحركات: الجدولُ نفسُه سجلُّ الطباعة (مَن، ومتى، وماذا)،
-- وتصنيفُ كيانٍ جديد بسجلّ الحركات يحتاج إعادةَ تعريف audit_kind تحت حارس الانجراف — خارجَ هذا الطلب.
--
-- المعرّفُ من الجهاز (يُختم لحظةَ الطباعة): ردٌّ ضاع ثمّ «احفظها» ⇒ 23505 ⇒ الواجهةُ تعدّها محفوظة — لا صفٌّ ثانٍ
-- لورقةٍ واحدة (والصفُّ لا يُحذف، فالمكرّرُ كان يبقى أبداً).
--
-- تُعاد بلا أثرٍ ثانٍ. والمصوّرُ مسيَّج (photographer_fence_table) إن وُجدت دالّتُه.
-- التحقّق بعد اللصق: select count(*) from pg_policies where tablename = 'pet_case_reports';  ⇒ 4 (قراءة، إدخال، وسياجاهما)
-- ============================================================================

create table if not exists public.pet_case_reports (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null default auth_clinic(),
  pet_id       uuid not null references public.pets(id) on delete cascade,
  -- الإقامةُ التي انطبع عنها التقرير (بطاقةُ القفص). بلا مفتاحٍ أجنبيّ: التقريرُ يبقى ولو حُذفت الإقامة.
  admission_id uuid,
  scope        text not null default 'stay',
  paper        text not null default 'a4',
  title        text not null default '',
  sheet        jsonb not null,
  edits        jsonb not null default '[]'::jsonb,
  author_id    uuid default auth.uid(),
  author_name  text,
  created_at   timestamptz not null default now(),
  constraint pet_case_reports_scope check (scope in ('stay', 'all')),
  constraint pet_case_reports_paper check (paper in ('a4', 'a5', 'letter')),
  constraint pet_case_reports_title check (char_length(title) <= 200),
  constraint pet_case_reports_sheet check (jsonb_typeof(sheet) = 'object' and octet_length(sheet::text) <= 600000),
  constraint pet_case_reports_edits check (jsonb_typeof(edits) = 'array' and octet_length(edits::text) <= 300000),
  constraint pet_case_reports_author check (char_length(coalesce(author_name, '')) <= 120)
);
-- ملفُّ الحيوان يقرؤها بالأحدث أوّلاً — والفهرسُ نفسُه فهرسُ المفتاح الأجنبيّ (db-guard).
create index if not exists pet_case_reports_pet on public.pet_case_reports (pet_id, created_at desc);

-- الختمُ من الخادم، والتجميد: الكاتبُ ولحظتُه لا تُقبلان من الجهاز، وما انطبع لا يتعدّل.
-- invoker لا definer (كمحفّزات 0162): يحرس طلبَ `authenticated` وحده، ودوالُّ المالك تمرّ.
create or replace function public.pet_case_reports_guard() returns trigger
language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.author_id := auth.uid();
    new.created_at := now();
    return new;
  end if;
  raise exception 'case_report_frozen' using errcode = 'P0001',
    hint = 'التقرير بعد ما انطبع ما يتعدّل — اطبع تقريراً جديداً';
end $$;
revoke all on function public.pet_case_reports_guard() from public, anon, authenticated;
drop trigger if exists pet_case_reports_guard on public.pet_case_reports;
create trigger pet_case_reports_guard before insert or update on public.pet_case_reports
  for each row execute function public.pet_case_reports_guard();

alter table public.pet_case_reports enable row level security;
drop policy if exists pet_case_reports_select on public.pet_case_reports;
create policy pet_case_reports_select on public.pet_case_reports for select to authenticated
  using (clinic_id = (select auth_clinic()));
-- والحيوانُ يراه الكاتبُ نفسُه (سياساتُ pets): المفتاحُ الأجنبيّ لا يمرّ من RLS — جلسةٌ تبدّلت عيادتُها والنافذةُ
-- مفتوحة كانت تودع التقريرَ بمساحةٍ لا ترى حيوانَه (درسُ 0261).
drop policy if exists pet_case_reports_insert on public.pet_case_reports;
create policy pet_case_reports_insert on public.pet_case_reports for insert to authenticated
  with check (clinic_id = (select auth_clinic())
              and exists (select 1 from public.pets p where p.id = pet_case_reports.pet_id));
-- لا تحديثَ ولا حذف: لا سياسةَ ولا صلاحية.
revoke all on table public.pet_case_reports from public, anon, authenticated;
grant select, insert on table public.pet_case_reports to authenticated;

-- سياجُ المصوّر (0222) — تحت وجود دالّته: تراجعُ 0222 يحذفها، وإعادةُ هذه بعده لا تسقط.
do $$
begin
  if to_regprocedure('public.photographer_fence_table(text)') is not null then
    perform public.photographer_fence_table('pet_case_reports');
  end if;
end $$;
