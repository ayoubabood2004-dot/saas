-- ============================================================================
-- doctorVet — 0114: قياس صفحة الهبوط (الزائر المجهول).
--
-- ── لماذا جدولٌ جديد ولا يكفي ما عندنا ────────────────────────────────────
-- client_events (سجلّ الأحداث القائم) يكتب عبر جلسةٍ مسجَّلة داخل عيادة —
-- أي أنه **لا يرى الزائر المجهول إطلاقاً**، وهو بالضبط من نريد قياسه: من لم
-- يسجّل بعد. فالسؤال «كم زائراً وصلنا وأين انسحبوا؟» لا جواب له اليوم.
--
-- ── الخصوصية بالتصميم لا بالوعد ──────────────────────────────────────────
-- لا كوكيز، ولا معرّف يُخزَّن بجهاز الزائر، ولا عنوان IP محفوظ. التمييز بين
-- الزوّار يتمّ ببصمةٍ مُلحّة **بتاريخ اليوم**: hash(IP + متصفّح + اليوم).
-- ونتيجتها العملية أن البصمة **تتبدّل كل منتصف ليل**، فلا يمكن تتبّع شخصٍ
-- عبر الأيام حتى لو أردنا — وهذا قيدٌ مقصود لا نقص. ما نحتاجه فعلاً هو
-- «كم زائراً مختلفاً اليوم»، لا «أين كان فلان الأسبوع الماضي».
--
-- ── من يكتب ومن يقرأ ─────────────────────────────────────────────────────
-- الكتابة من دالة الحافة وحدها بمفتاح service_role (تتجاوز RLS بامتيازها)،
-- ولا سياسة INSERT لأي دور مستخدم: نقطةٌ عامة مفتوحة للكتابة المباشرة تُملأ
-- بالضجيج بيومٍ واحد. والقراءة لمشغّل المنصّة وحده — أرقام السوق ليست
-- بيانات عيادة.
-- ============================================================================

create table if not exists landing_events (
  id           bigserial primary key,
  at           timestamptz not null default now(),
  -- اسم الحدث من قائمةٍ مغلقة تفرضها دالة الحافة كذلك — الحصر بمكانين
  -- مقصود: القيد هنا يحمي حتى لو نُشرت الدالة بخطأ.
  event        text not null check (event in (
                 'page_view', 'cta_click', 'signup_start', 'signup_done', 'trial_start'
               )),
  path         text,
  -- من أين جاء (نطاق المُحيل فقط، لا الرابط كاملاً بمعاملاته).
  ref_host     text,
  lang         text,
  device       text check (device in ('mobile', 'desktop')),
  -- بصمة اليوم — تُبدَّل كل منتصف ليل بحكم ملح التاريخ.
  visitor_day  text,
  meta         jsonb
);

create index if not exists landing_events_at_idx    on landing_events(at desc);
create index if not exists landing_events_event_idx on landing_events(event, at desc);

alter table landing_events enable row level security;

drop policy if exists landing_events_admin_read on landing_events;
create policy landing_events_admin_read on landing_events for select
  using (is_platform_admin());

-- ── ملخّص القمع: سؤالٌ واحد يجيب على «أين نخسرهم» ─────────────────────────
create or replace function landing_funnel(p_days int default 30)
returns table (
  day date, visitors bigint, cta_clicks bigint, signups_started bigint, signups_done bigint
) language sql stable security definer set search_path = public as $$
  select
    (at at time zone 'utc')::date                                            as day,
    count(distinct visitor_day) filter (where event = 'page_view')           as visitors,
    count(*) filter (where event = 'cta_click')                              as cta_clicks,
    count(*) filter (where event = 'signup_start')                           as signups_started,
    count(*) filter (where event = 'signup_done')                            as signups_done
  from landing_events
  where is_platform_admin()
    and at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  group by 1
  order by 1 desc;
$$;
revoke all on function landing_funnel(int) from public, anon;
grant execute on function landing_funnel(int) to authenticated;

-- ============================================================================
-- VERIFY (كمشغّل المنصّة):
--   select * from landing_funnel(30);
--   select event, count(*) from landing_events group by 1 order by 2 desc;
-- VERIFY (كعيادة عادية): الاستعلامان يرجعان صفر صفوف — أرقام السوق ليست لها.
-- ============================================================================
