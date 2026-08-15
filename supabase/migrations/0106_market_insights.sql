-- ============================================================================
-- 0106 — حركة السوق: كم تُدخل العيادات فعلاً، وعلى أي أساس نضبط الحدود
--
-- المشكلة التي تحلّها: حدود الاشتراك (٢٥ حيوان؟ ٥٠؟ ١٠٠؟) كانت تُختار تخميناً.
-- الرقم الصحيح لا يُخترع، يُقرأ من سلوك العيادات نفسها: إذا العيادة الوسطى
-- تضيف ١٨ حيواناً بالشهر، فحدّ ٢٥ يخدم أكثر من نصف السوق بلا شكوى، وحدّ ١٠
-- يخنق الجميع.
--
-- دالتان بقصد التقسيم:
--   • admin_clinic_volumes(days)  — صف لكل عيادة بأحجامها داخل نافذة. منها
--     تُحسب المئينات والمحاكاة بالواجهة (أي حدّ يخدم كم عيادة؟) — إبقاؤها
--     مفصّلة يعطي مرونة أكبر من إرجاع مئينات جاهزة.
--   • admin_market_monthly(months) — إجماليات المنصّة شهراً بشهر: هل السوق
--     يكبر أم يهدأ؟ رقم واحد بالشهر لا يكفي للحكم، والاتجاه هو ما يهم.
--
-- «العيادة النشطة» = التي أدخلت شيئاً واحداً على الأقل بالنافذة. عيادة مسجّلة
-- وما لمست النظام تشوّه المتوسطات لو حُسبت، فتُستبعد من المئينات وتُعدّ منفصلة.
-- ============================================================================

/** أحجام الإدخال لكل عيادة داخل آخر p_days يوماً. */
create or replace function admin_clinic_volumes(p_days int default 30)
returns table (
  clinic_id uuid,
  clinic_name text,
  email text,
  plan text,
  pets int,        -- حيوانات جديدة سُجّلت
  cases int,       -- حالات (طبلات) فُتحت
  invoices int,    -- فواتير بيع
  wa int,          -- رسائل واتساب أرسلتها العيادة
  revenue numeric, -- مجموع مبيعاتها (يقيس حجم العيادة تجارياً)
  active_days int, -- كم يوماً مختلفاً لمست فيه النظام — يفرّق الجاد عن المجرّب
  first_seen timestamptz
)
language sql
security definer
set search_path = public, auth
stable
as $$
  with win as (select now() - make_interval(days => greatest(1, coalesce(p_days, 30))) as t0),
  ids as (
    select cp.clinic_id from clinic_prefs cp
    union select s.clinic_id from subscriptions s
    union select m.clinic_id from memberships m
  )
  select ids.clinic_id,
         cp.clinic_name,
         u.email::text,
         s.plan,
         (select count(*)::int from pets p
           where p.clinic_id = ids.clinic_id and p.created_at >= (select t0 from win)),
         (select count(*)::int from clinic_visits v
           where v.clinic_id = ids.clinic_id and v.opened_at >= (select t0 from win)),
         (select count(*)::int from invoices i
           where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)),
         (select count(*)::int from wa_messages w
           where w.clinic_id = ids.clinic_id and w.sent_at >= (select t0 from win)),
         (select coalesce(sum(i.total), 0) from invoices i
           where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)),
         -- الأيام الفريدة التي فيها أي إدخال: عيادة تشتغل ٢٠ يوماً بالشهر
         -- مختلفة جوهرياً عن عيادة أدخلت نفس العدد بيوم واحد ثم اختفت.
         (select count(distinct d)::int from (
            select date_trunc('day', p.created_at) d from pets p
              where p.clinic_id = ids.clinic_id and p.created_at >= (select t0 from win)
            union
            select date_trunc('day', v.opened_at) from clinic_visits v
              where v.clinic_id = ids.clinic_id and v.opened_at >= (select t0 from win)
            union
            select date_trunc('day', i.created_at) from invoices i
              where i.clinic_id = ids.clinic_id and i.created_at >= (select t0 from win)
          ) days),
         (select min(x) from (
            select min(p.created_at) x from pets p where p.clinic_id = ids.clinic_id
            union all
            select min(v.opened_at) from clinic_visits v where v.clinic_id = ids.clinic_id
            union all
            select min(i.created_at) from invoices i where i.clinic_id = ids.clinic_id
          ) f)
  from ids
  left join clinic_prefs  cp on cp.clinic_id = ids.clinic_id
  left join auth.users    u  on u.id         = ids.clinic_id
  left join subscriptions s  on s.clinic_id  = ids.clinic_id;
$$;
revoke all on function admin_clinic_volumes(int) from public, anon;
grant execute on function admin_clinic_volumes(int) to authenticated;

/** إجماليات المنصّة شهراً بشهر — الاتجاه لا اللقطة. */
create or replace function admin_market_monthly(p_months int default 6)
returns table (
  month date,
  clinics_active int,   -- عيادات أدخلت شيئاً هذا الشهر
  pets int,
  cases int,
  invoices int,
  wa int,
  revenue numeric
)
language sql
security definer
set search_path = public, auth
stable
as $$
  with months as (
    select date_trunc('month', now())::date - make_interval(months => g)::interval as m
    from generate_series(0, greatest(1, least(coalesce(p_months, 6), 36)) - 1) g
  ),
  b as (select m::date as m0, (m + interval '1 month')::date as m1 from months)
  select b.m0,
         (select count(distinct c)::int from (
            select p.clinic_id c from pets p where p.created_at >= b.m0 and p.created_at < b.m1
            union select v.clinic_id from clinic_visits v where v.opened_at >= b.m0 and v.opened_at < b.m1
            union select i.clinic_id from invoices i where i.created_at >= b.m0 and i.created_at < b.m1
          ) act),
         (select count(*)::int from pets p where p.created_at >= b.m0 and p.created_at < b.m1),
         (select count(*)::int from clinic_visits v where v.opened_at >= b.m0 and v.opened_at < b.m1),
         (select count(*)::int from invoices i where i.created_at >= b.m0 and i.created_at < b.m1),
         (select count(*)::int from wa_messages w where w.sent_at >= b.m0 and w.sent_at < b.m1),
         (select coalesce(sum(i.total), 0) from invoices i where i.created_at >= b.m0 and i.created_at < b.m1)
  from b
  order by b.m0;
$$;
revoke all on function admin_market_monthly(int) from public, anon;
grant execute on function admin_market_monthly(int) to authenticated;

-- الفهارس التي تجعل هذا كله رخيصاً بدل مسح الجداول كاملة.
create index if not exists pets_created_idx        on pets(created_at desc);
create index if not exists clinic_visits_opened_idx on clinic_visits(opened_at desc);
create index if not exists invoices_created_idx     on invoices(created_at desc);
create index if not exists wa_messages_sent_idx     on wa_messages(sent_at desc);
