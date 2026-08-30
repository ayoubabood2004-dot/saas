-- ============================================================================
-- doctorVet — 0130: «شنو اختفى؟» — سؤالٌ يُجاب بالحساب لا بالتفتيش
--
-- بعد 0128 صار السؤال المشروع: كيف أتأكّد أن شيئاً لم يختفِ من الواجهة؟
-- والجواب الذي طلبناه أولاً — «افتح الموقع وشوف» — طلبٌ فاشل: مئات الشاشات،
-- وغيابُ صفٍّ واحد من قائمةٍ طويلة لا تراه عينٌ أصلاً. ورميُ ذلك على المستخدم
-- تنازلٌ عن مسؤوليةٍ يقدر عليها الحاسوب وحده.
--
-- والقاعدة تملك جوابه: `rls_policy_backup` يحفظ **النصّ الأصليّ** لكل سياسة
-- قبل لفّها. واللفّ يغيّر **وقت** حساب الشرط لا الشرطَ نفسه — فلو نزعناه عن
-- النسخة الحالية وجب أن يعود النصّ الأصليّ حرفاً بحرف. أي فرقٍ يعني أن شيئاً
-- آخر تغيّر.
--
-- والحيلة أن `_wrap_auth_calls` تنزع ثم تلفّ، فتطبيقها على النصّين يُرجعهما
-- إلى صيغةٍ واحدة إن — وإن فقط — كان الفرق بينهما هو اللفّ وحده.
--
-- ثلاثة أصفارٍ تعني: ما ضاعت سياسة، وما تغيّر شرط، وما تبدّل دور. وبما أن
-- الشروط والأدوار هي هي، فلا صفَّ يقدر يظهر أو يختفي لأحد. برهانٌ لا اطمئنان.
--
-- ويُقرأ بالاتجاهين: فُحص بتغيير شرطٍ عمداً فأمسكه، لا بالحالة السليمة وحدها —
-- فحصٌ لا يقدر أن يفشل لا يُثبت شيئاً.
-- ============================================================================

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
    -- أقدم نسخةٍ لكل سياسة هي الأصل: النسخ تتراكم مع كل إعادة تشغيل،
    -- والتراجعُ نفسه يعتمد على هذا الترتيب.
    select distinct on (schemaname, tablename, policyname)
           schemaname, tablename, policyname, cmd, roles, permissive, qual, with_check
    from public.rls_policy_backup
    where migration = p_migration
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

-- الاستعمال:  select * from public.verify_rls_equivalence();
-- المطلوب: الأعمدة الثلاثة الأخيرة أصفار.
