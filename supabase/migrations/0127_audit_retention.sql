-- ============================================================================
-- doctorVet — 0127: احتفاظ سجلّ التدقيق ٣٠ يوماً — كنسٌ يشتغل فعلاً
--
-- الفخّ القائم: `purge_activity_log()` مكتوبةٌ هيچي —
--     delete from audit_log where clinic_id = auth_clinic() and created_at < …
-- وهي تشتغل اليوم فقط لأن العميل يناديها وهو مسجَّلُ الدخول، فتنظّف **عيادةً
-- واحدة**: عيادة اللي فتح صفحة السجلّ. أما لو جدولناها بـ pg_cron فما بيها
-- جلسةُ مستخدم، و`auth_clinic()` ترجّع NULL، و`clinic_id = NULL` ما تساوي
-- شيئاً أبداً — فتنحذف **صفر صفوف** بصمت، كل ليلة، بلا خطأ ولا تنبيه.
-- كنسٌ يبدو شغّالاً وما ينظّف — وهذا أسوأ من كنسٍ معطَّل معروف.
--
-- الجديد: دالّةٌ بلا فلتر عيادة، تكنس بشرط العمر وحده، فتصلح للجدولة.
--
-- ماذا يُحذف بالضبط: صفوف `audit_log` الأقدم من ٣٠ يوماً — وهي **أثرُ** من
-- عدّل ماذا ومتى، لا البيانات نفسها. الحيوانات والفواتير والمخزون والأوزان
-- والوصفات ما تنمسّ ولا بصفّ. هذا الجدول أكبر جدولٍ بالقاعدة (٢٤ ميغا من
-- ٢٢ ألف صفّ) وينمو ١٤٠٠ صفّ يومياً — نصف جيغا بالسنة لو تُرك.
--
-- الأمان: الدالّة SECURITY DEFINER (تحذف عبر كل العيادات) فتُنزَع صلاحية
-- تنفيذها عن `anon` و`authenticated`. ما ينفّذها إلا الجدولةُ أو مالك القاعدة.
-- بدون هذا النزع يقدر أي مستخدمٍ مسجَّل يمسح آثار كل العيادات بندبةٍ واحدة.
--
-- ولا نلمس `purge_activity_log()` القديمة: العميل ينادي اسمها عند فتح صفحة
-- السجلّ، وحذفها يكسر الصفحة. تبقى تشتغل كما هي (تنظيف عيادةِ الزائر).
--
-- تراجع:
--   select cron.unschedule('doctorvet-purge-audit');
--   drop function if exists public.purge_audit_log(int);
--   drop function if exists public.audit_log_preview(int);
-- ============================================================================

-- 1) معاينةٌ جافّة — تُقرأ قبل أي حذف، وما تحذف شيئاً.
--    ترجّع: كم صفّاً سينحذف، وأقدم تاريخ، وكم يبقى.
create or replace function public.audit_log_preview(p_days int default 30)
returns table (would_delete bigint, would_keep bigint, oldest timestamptz, newest timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where created_at <  now() - make_interval(days => p_days)),
    count(*) filter (where created_at >= now() - make_interval(days => p_days)),
    min(created_at),
    max(created_at)
  from public.audit_log;
$$;

-- 2) الكنس نفسه — بشرط العمر وحده، فيشتغل بلا جلسةِ مستخدم.
create or replace function public.purge_audit_log(p_days int default 30)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare n bigint;
begin
  -- حارسٌ ضدّ الخطأ المطبعيّ: صفرٌ أو سالب يعني «امسح كل شيء».
  if p_days is null or p_days < 7 then
    raise exception 'purge_audit_log: مدّة الاحتفاظ لازم ٧ أيام فأكثر (وصلت %)', p_days;
  end if;

  delete from public.audit_log
  where created_at < now() - make_interval(days => p_days);

  get diagnostics n = row_count;
  return n;
end $$;

-- 3) النزع — الخطوة التي بدونها تصير الدالّة ثغرة، لا ميزة.
revoke all on function public.purge_audit_log(int)  from public, anon, authenticated;
revoke all on function public.audit_log_preview(int) from public, anon, authenticated;

-- ============================================================================
-- الجدولة — خطوةٌ يدويّةٌ مقصودة، تُنفَّذ **بعد** قراءة المعاينة.
--
-- pg_cron متاحٌ بسوبابيس وغيرُ مثبَّت عندنا. التثبيت والجدولة يحتاجان صلاحية
-- عالية فما ننفّذهما ضمن الهجرة تلقائياً — كنسٌ مجدوَل ينطلق بلا ما ينتبه له
-- أحدٌ خطأ. الخطوات، بالترتيب:
--
--   -- أ) شوف شنو راح ينحذف قبل ما ينحذف:
--   select * from public.audit_log_preview(30);
--
--   -- ب) إذا الرقم منطقيّ، ثبّت الإضافة:
--   create extension if not exists pg_cron;
--
--   -- ج) جدولها ٣:٢٠ فجراً بتوقيت UTC (خارج دوام العيادات في العراق):
--   select cron.schedule(
--     'doctorvet-purge-audit', '20 3 * * *',
--     $cron$ select public.purge_audit_log(30); $cron$
--   );
--
--   -- د) تأكّد إنها انجدولت:
--   select jobname, schedule, active from cron.job;
--
--   -- هـ) وبعد أول ليلة، تأكّد إنها اشتغلت وشنو رجّعت:
--   select status, return_message, start_time
--     from cron.job_run_details
--    where jobid = (select jobid from cron.job where jobname = 'doctorvet-purge-audit')
--    order by start_time desc limit 5;
--
-- خطوة (هـ) هي بالضبط ما كان ناقصاً بالمرّة الأولى: الكنس القديم ما فشل —
-- نجح وحذف صفراً. القراءة تكشف الفرق.
-- ============================================================================
