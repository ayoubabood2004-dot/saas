-- ============================================================================
-- doctorVet — 0128: نداءُ الهويّة مرّةً بالاستعلام، لا مرّةً بكل صفّ
--
-- كل سياسةٍ عندنا تقول تقريباً: `clinic_id = auth_clinic()`. تبدو رخيصة، وهي
-- أغلى شيءٍ بالقاعدة:
--
--   * `auth_clinic()` معرَّفة SECURITY DEFINER — وبوستغريس **ما يدمج** دالّةً
--     كهذي بالخطة أبداً، فما ينفع تفاؤله المعتاد.
--   * وجسمُها ليس `select auth.uid()` كما بدأت: من هجرة 0016 صارت استعلاماً
--     على `memberships` فيه `order by created_at limit 1`.
--   * وكونها STABLE ما يعني إنها تُحفَظ: بوستغريس ما يخزّن نتيجة الدالّة
--     المستقرّة بين الصفوف — يعيد تنفيذها لكل صفّ يفحصه.
--
-- الحاصل: قراءة ألف فاتورة = **ألف استعلامِ عضوية** قبل أن يرجع أي صفّ. وهذا
-- هو السبب الأول للبطء تحت الحمل، أكبر من أي فهرسٍ ناقص.
--
-- العلاج سطرٌ واحد: `(select auth_clinic())`. القوس يحوّل النداء إلى InitPlan —
-- بوستغريس ينفّذه **مرّةً واحدة** قبل المسح ويستعمل الناتج ثابتاً. من ألفٍ إلى
-- واحد، بلا تغيير معنى: الدالّة تعتمد على جلسة المستخدم وحدها، فقيمتها ثابتة
-- طول الاستعلام أصلاً. رفعُها خارج الحلقة **تكافؤٌ رياضيّ**، لا مقايضة.
--
-- **ولا صفّ بيانات ينمسّ**، ولا تتغيّر رؤية أحد: نفس الشرط، نفس القيمة، نفس
-- الصفوف — وقتُ حسابها وحده هو ما تغيّر.
--
-- لماذا نكتبها من كتلوج القاعدة لا بقائمةٍ مكتوبة بيدنا: السياسات تراكمت عبر
-- ١٢٨ هجرة، وبعضها مولَّدٌ داخل حلقات `format()`، فأي قائمةٍ نكتبها راح تنسى
-- شيئاً. هذي الهجرة تقرأ `pg_policies` الحيّة وتصلّح كل ما تلقاه — الموجودَ
-- اليوم وما فات الجرد.
--
-- (نزلت على الإنتاج 2026-08-30 فلفّت **116** سياسة — والقراءة الساكنة للهجرات
-- كانت تعدّ 43 فقط. الفرق سياساتٌ مولَّدة بحلقات أو مكتوبة من اللوحة، وهو
-- بالضبط ما كانت قائمةٌ مكتوبة بيدنا راح تفوّته.)
--
-- شبكة الأمان: كل سياسة تُنسَخ نصّاً كما هي إلى `rls_policy_backup` **قبل**
-- تعديلها، ودالّةُ `restore_rls_policies()` ترجّعها حرفاً بحرف.
--
-- تراجع:  select public.restore_rls_policies();
-- ============================================================================

-- 1) شبكة الأمان: النسخة الأصلية، بالقاعدة نفسها، قبل أي تعديل ---------------
create table if not exists public.rls_policy_backup (
  id          bigint generated always as identity primary key,
  taken_at    timestamptz not null default now(),
  migration   text        not null,
  schemaname  text        not null,
  tablename   text        not null,
  policyname  text        not null,
  permissive  text,
  roles       text[],
  cmd         text,
  qual        text,
  with_check  text
);
alter table public.rls_policy_backup enable row level security;
-- بلا أي سياسة: ما يوصلها إلا مالك القاعدة. نسخةُ الأمان ما تنقرأ من التطبيق.
revoke all on table public.rls_policy_backup from anon, authenticated;

-- 2) اللفّ: يفكّ اللفّ القائم أولاً (فيصير قابلاً لإعادة التشغيل) ثم يلفّ -----
create or replace function public._wrap_auth_calls(e text) returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  fn  text;
  pat text;
  fns text[] := array[
    'auth.uid', 'auth.jwt', 'auth.role',
    'auth_clinic', 'auth_role', 'is_clinic_staff', 'is_platform_admin', 'has_permission'
  ];
begin
  if e is null then return null; end if;

  foreach fn in array fns loop
    pat := replace(fn, '.', '\.');

    -- أ) فكّ الملفوف أصلاً: `( SELECT f(…) AS alias)` ← `f(…)`
    --    بدونها تنلفّ الدالّة مرّتين لو انعادت الهجرة.
    e := regexp_replace(e, '\(\s*SELECT\s+(' || pat || '\([^()]*\))(\s+AS\s+[a-zA-Z_]+)?\s*\)', '\1', 'gi');

    -- ب) لفّ كل نداءٍ عارٍ. النظرة-للخلف تمنع مطابقة اسمٍ ينتهي بنفس الحروف
    --    (مثل `clinic_auth_clinic()` لو وُجد يوماً).
    e := regexp_replace(e, '(?<![\w.])(' || pat || '\([^()]*\))', '(select \1)', 'g');
  end loop;

  return e;
end $$;

-- 2ب) هل تحتاج السياسة عملاً أصلاً؟ ------------------------------------------
--
-- ما نقارن النصّ قبل وبعد: بوستغريس يخزّن السياسة بصيغته هو
-- (`( SELECT auth_clinic() AS auth_clinic)`) لا بصيغتنا (`(select auth_clinic())`)،
-- فالمقارنة النصّية تقول «تغيّرت» كل مرّة حتى لو الملفوف ملفوفٌ سلفاً — فتنعاد
-- الكتابة وتتكدّس نسخُ أمانٍ زائدة ويطلع عددٌ كاذب. الفحص الصحيح: نشيل كل
-- نداءٍ ملفوف، وإذا بقي نداءٌ عارٍ فهي تحتاج عملاً.
create or replace function public._needs_wrap(e text) returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare fn text; pat text; bare text;
  fns text[] := array['auth.uid','auth.jwt','auth.role','auth_clinic','auth_role','is_clinic_staff','is_platform_admin','has_permission'];
begin
  if e is null then return false; end if;
  bare := e;
  -- نمسح الملفوف حتى ما ينحسب
  foreach fn in array fns loop
    pat := replace(fn, '.', '\.');
    bare := regexp_replace(bare, '\(\s*SELECT\s+' || pat || '\([^()]*\)(\s+AS\s+[a-zA-Z_]+)?\s*\)', '@', 'gi');
  end loop;
  -- وشنو بقي عارياً؟
  foreach fn in array fns loop
    pat := replace(fn, '.', '\.');
    if bare ~ ('(?<![\w.])' || pat || '\(') then return true; end if;
  end loop;
  return false;
end $$;

-- 3) المعاينة: قبل/بعد لكل سياسة راح تتغيّر — تُقرأ قبل التنفيذ --------------
create or replace function public.preview_rls_initplan()
returns table (tablename text, policyname text, kind text, before_txt text, after_txt text)
language sql
stable
set search_path = public
as $$
  select p.tablename::text, p.policyname::text, k.kind, k.b, public._wrap_auth_calls(k.b)
  from pg_policies p
  cross join lateral (values ('using', p.qual), ('check', p.with_check)) as k(kind, b)
  where p.schemaname = 'public'
    and public._needs_wrap(k.b)
  order by 1, 2, 3;
$$;

-- 4) التنفيذ: ALTER POLICY وحدها — ما نحذف سياسةً ولا ننشئ وحدة ---------------
--    ALTER تحافظ على الاسم والجدول والأمر والأدوار؛ التعبير وحده يتغيّر.
--    فما تمرّ ولا لحظةٌ يكون فيها الجدول بلا سياسة — ولا ثغرةَ رؤيةٍ ولو لمللي.
do $$
declare
  p        record;
  new_q    text;
  new_c    text;
  sql      text;
  n_done   int := 0;
begin
  for p in
    select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    from pg_policies
    where schemaname = 'public'
      and tablename <> 'rls_policy_backup'
    order by tablename, policyname
  loop
    new_q := public._wrap_auth_calls(p.qual);
    new_c := public._wrap_auth_calls(p.with_check);

    -- ما نلمس سياسةً ما تحتاج تعديلاً — والفحص على النداء العاري لا على النصّ
    continue when not public._needs_wrap(p.qual)
              and not public._needs_wrap(p.with_check);

    -- النسخة الأصلية أولاً — قبل ALTER، لا بعدها
    insert into public.rls_policy_backup
      (migration, schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check)
    values ('0128', p.schemaname, p.tablename, p.policyname, p.permissive, p.roles, p.cmd, p.qual, p.with_check);

    sql := format('alter policy %I on %I.%I', p.policyname, p.schemaname, p.tablename);
    if new_q is not null then sql := sql || format(' using (%s)', new_q); end if;
    if new_c is not null then sql := sql || format(' with check (%s)', new_c); end if;

    execute sql;
    n_done := n_done + 1;
  end loop;

  raise notice 'db: انلفّت % سياسة. للتراجع: select public.restore_rls_policies();', n_done;
end $$;

-- 5) التراجع: يرجّع النصّ الأصليّ حرفاً بحرف من النسخة ------------------------
create or replace function public.restore_rls_policies(p_migration text default '0128')
returns int
language plpgsql
volatile
security definer
set search_path = public
as $$
declare b record; sql text; n int := 0;
begin
  for b in
    select distinct on (schemaname, tablename, policyname) *
    from public.rls_policy_backup
    where migration = p_migration
    order by schemaname, tablename, policyname, taken_at asc   -- أقدم نسخة = الأصل
  loop
    if not exists (
      select 1 from pg_policies
      where schemaname = b.schemaname and tablename = b.tablename and policyname = b.policyname
    ) then
      raise notice 'db: تخطّي %.% — السياسة ما عادت موجودة', b.tablename, b.policyname;
      continue;
    end if;
    sql := format('alter policy %I on %I.%I', b.policyname, b.schemaname, b.tablename);
    if b.qual       is not null then sql := sql || format(' using (%s)', b.qual); end if;
    if b.with_check is not null then sql := sql || format(' with check (%s)', b.with_check); end if;
    execute sql;
    n := n + 1;
  end loop;
  return n;
end $$;

revoke all on function public.restore_rls_policies(text) from public, anon, authenticated;
revoke all on function public.preview_rls_initplan()     from public, anon, authenticated;
