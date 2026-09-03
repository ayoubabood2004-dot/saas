-- ============================================================================
-- ٠١٥١ — لوحةُ المنصّة: مشغّلٌ يدخل أيَّ عيادة، ومراقبةٌ عبر كل العيادات
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- مشغّلُ المنصّة (is_platform_admin من 0054) كان يرى الاشتراكات وحدها. طبيبٌ
-- يتصل «المنتج ما يبين» أو «الراتب طلع غلط» فلا سبيلَ إلا أن يشرح بالهاتف أو
-- يرسل كلمةَ سرّه. ولا نظرةَ واحدة تقول أيُّ عيادةٍ حيّةٌ الآن وأيُّها تعبت.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- «يدخل بهويّته لا بهويّة الطبيب»: صفٌّ واحد بـ`platform_sessions` يقول أيَّ
-- عيادةٍ يعمل بها المشغّلُ الآن، و`auth_clinic()` تقرأه **أوّلاً** — فكلُّ سياسة
-- صفوفٍ وكلُّ دالّةٍ وكلُّ قيمةٍ افتراضية `clinic_id` تعمل كأنه من كادر تلك
-- العيادة بدور مدير، بلا مسارٍ ثانٍ يُنسى. ولا أثرَ على غير المشغّل: الشرطُ
-- الأوّل `is_platform_admin()` (بريدُ الرمز) فصفُّ الجلسة وحده لا يمنح شيئاً.
--
-- ── الأثر ────────────────────────────────────────────────────────────────
-- بالاتفاق مع العيادات الدخولُ طبيعيٌّ بلا أثرٍ عندها: لا سطرَ بسجلّ حركاتها،
-- و`platform_session_log` يقرأه المشغّلُ وحده (سجلٌّ داخليّ لمن دخل أين ومتى).
-- الحركاتُ أثناء الدخول تمرّ بمحفّزات التدقيق العادية بمعرّف المشغّل.
--
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0150.
-- ============================================================================

-- ── ١) الجلسة الحالية والسجلّ ──────────────────────────────────────────────
create table if not exists platform_sessions (
  admin_id      uuid primary key references auth.users(id) on delete cascade,
  acting_clinic uuid not null,
  reason        text,
  started_at    timestamptz not null default now()
);
alter table platform_sessions enable row level security;
-- لا سياسات عمداً: تُقرأ وتُكتب من دوالّ المُعرِّف وحدها.

create table if not exists platform_session_log (
  id            bigint generated always as identity primary key,
  admin_id      uuid not null,
  admin_email   text,
  acting_clinic uuid not null,
  reason        text,
  entered_at    timestamptz not null default now(),
  left_at       timestamptz
);
create index if not exists platform_session_log_clinic_idx on platform_session_log(acting_clinic, entered_at desc);
alter table platform_session_log enable row level security;
drop policy if exists platform_session_log_read on platform_session_log;
-- المشغّلُ وحده يقرأه.
create policy platform_session_log_read on platform_session_log for select
  using ((select is_platform_admin()));

-- ── ٢) العيادةُ التي يعمل بها المشغّلُ الآن (null لغيره ولمن لم يدخل) ─────
create or replace function platform_acting_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select case when is_platform_admin()
              then (select acting_clinic from platform_sessions where admin_id = auth.uid())
         end
$$;
revoke all on function platform_acting_clinic() from public, anon;
grant execute on function platform_acting_clinic() to authenticated;

-- ── ٣) auth_clinic / auth_role_base / auth_role تعرف الجلسة ─────────────────
-- نفسُ منطق 0020 و0072 و0048 حرفياً، مع فرعٍ أوّل للمشغّل.
create or replace function auth_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    platform_acting_clinic(),
    (select clinic_id from memberships
       where user_id = auth.uid() and status = 'active' and clinic_id <> auth.uid()
       order by created_at limit 1),
    (select clinic_id from memberships
       where user_id = auth.uid() and status = 'active'
       order by created_at limit 1),
    auth.uid()
  );
$$;
grant execute on function auth_clinic() to authenticated, anon;

create or replace function auth_role_base() returns text
language sql stable security definer set search_path = public as $$
  select case
    when platform_acting_clinic() is not null then 'manager'
    else coalesce(
      (select role from memberships
         where user_id = auth.uid() and status = 'active' and clinic_id = auth_clinic()
         limit 1),
      'manager')
  end;
$$;

-- staff_elevations من 0048 (المفتاح المؤقّت للمدير) — الجدولُ موجود، نعيد الدالّة فقط.
create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from staff_elevations
                 where user_id = auth.uid() and until > now()) then 'manager'
    else auth_role_base()
  end;
$$;
grant execute on function auth_role_base(), auth_role() to authenticated, anon;

-- ── ٤) الدخول والخروج والسياق ───────────────────────────────────────────────
create or replace function platform_enter(p_clinic uuid, p_reason text default null) returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare v_name text; v_email text;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_clinic is null or p_clinic = auth.uid() then raise exception 'bad_clinic'; end if;
  if not exists (select 1 from auth.users where id = p_clinic) then raise exception 'clinic_not_found'; end if;
  select clinic_name into v_name from clinic_prefs where clinic_id = p_clinic;
  select u.email::text into v_email from auth.users u where u.id = auth.uid();
  -- جلسةٌ سابقة مفتوحة تُقفل أوّلاً — سجلٌّ بلا فجوة.
  update platform_session_log set left_at = now() where admin_id = auth.uid() and left_at is null;
  insert into platform_sessions (admin_id, acting_clinic, reason, started_at)
    values (auth.uid(), p_clinic, nullif(btrim(p_reason), ''), now())
    on conflict (admin_id) do update set acting_clinic = excluded.acting_clinic, reason = excluded.reason, started_at = now();
  insert into platform_session_log (admin_id, admin_email, acting_clinic, reason)
    values (auth.uid(), v_email, p_clinic, nullif(btrim(p_reason), ''));
  return jsonb_build_object('ok', true, 'clinic_id', p_clinic, 'clinic_name', v_name);
end $$;
revoke all on function platform_enter(uuid, text) from public, anon;
grant execute on function platform_enter(uuid, text) to authenticated;

create or replace function platform_leave() returns jsonb
language plpgsql volatile security definer set search_path = public as $$
declare v_clinic uuid;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  select acting_clinic into v_clinic from platform_sessions where admin_id = auth.uid();
  if v_clinic is null then return jsonb_build_object('ok', true, 'was_acting', false); end if;
  delete from platform_sessions where admin_id = auth.uid();
  update platform_session_log set left_at = now() where admin_id = auth.uid() and left_at is null;
  return jsonb_build_object('ok', true, 'was_acting', true, 'clinic_id', v_clinic);
end $$;
revoke all on function platform_leave() from public, anon;
grant execute on function platform_leave() to authenticated;

create or replace function platform_context() returns jsonb
language sql stable security definer set search_path = public as $$
  select case when is_platform_admin() then
    coalesce(
      (select jsonb_build_object(
                'acting', s.acting_clinic,
                'clinic_name', (select cp.clinic_name from clinic_prefs cp where cp.clinic_id = s.acting_clinic),
                'since', s.started_at, 'reason', s.reason)
         from platform_sessions s where s.admin_id = auth.uid()),
      jsonb_build_object('acting', null))
  else jsonb_build_object('acting', null) end
$$;
revoke all on function platform_context() from public, anon;
grant execute on function platform_context() to authenticated;

-- ── ٥) نبضُ العيادات — نظرةٌ واحدة: مَن حيّ الآن، ومبيعُ اليوم، والديون، والمخزون ──
-- تغييرُ أعمدة RETURNS TABLE يستوجب DROP قبل CREATE.
drop function if exists platform_pulse();
create function platform_pulse()
returns table (
  clinic_id uuid, clinic_name text, email text,
  plan text, period_end timestamptz, trial_end timestamptz,
  members int, online_now int,
  invoices_today int, sales_today numeric, invoices_7d int, sales_7d numeric,
  open_debt_count int, open_debt_total numeric,
  products int, zero_stock int, pending_deliveries int,
  audit_24h int, last_login timestamptz, last_invoice timestamptz, last_activity timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
declare v_today date := (now() at time zone 'Asia/Baghdad')::date;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  return query
  with ids as (
    select m.clinic_id from memberships m
    union select cp.clinic_id from clinic_prefs cp
    union select s.clinic_id from subscriptions s
    -- عيادةٌ باعت ولم تُسجَّل بغيرها (حساباتٌ قديمة) — لا تسقط من النبض.
    union select distinct i.clinic_id from invoices i where i.clinic_id is not null
  ),
  mc as (select m.clinic_id, count(*) filter (where m.status = 'active')::int as members from memberships m group by m.clinic_id),
  pr as (select p.clinic_id, count(*)::int as online_now from staff_presence p where p.last_seen > now() - interval '3 minutes' group by p.clinic_id),
  ic as (
    select i.clinic_id,
           count(*) filter (where (i.created_at at time zone 'Asia/Baghdad')::date = v_today and coalesce(i.status,'paid') <> 'refunded')::int as invoices_today,
           coalesce(sum(i.total) filter (where (i.created_at at time zone 'Asia/Baghdad')::date = v_today and coalesce(i.status,'paid') <> 'refunded'), 0) as sales_today,
           count(*) filter (where i.created_at > now() - interval '7 days' and coalesce(i.status,'paid') <> 'refunded')::int as invoices_7d,
           coalesce(sum(i.total) filter (where i.created_at > now() - interval '7 days' and coalesce(i.status,'paid') <> 'refunded'), 0) as sales_7d,
           count(*) filter (where coalesce(i.status,'paid') <> 'refunded' and coalesce(i.amount_paid, i.total) < i.total - 0.01)::int as open_debt_count,
           coalesce(sum(i.total - coalesce(i.amount_paid, i.total)) filter (where coalesce(i.status,'paid') <> 'refunded' and coalesce(i.amount_paid, i.total) < i.total - 0.01), 0) as open_debt_total,
           max(i.created_at) as last_invoice
    from invoices i group by i.clinic_id
  ),
  pc as (select p.clinic_id, count(*)::int as products, count(*) filter (where coalesce(p.stock, 0) <= 0)::int as zero_stock
         from products p group by p.clinic_id),
  dc as (select d.clinic_id, count(*)::int as pending from delivery_orders d where d.status in ('preparing','out') group by d.clinic_id),
  ac as (select a.clinic_id, count(*)::int as audit_24h from audit_log a where a.created_at > now() - interval '24 hours' group by a.clinic_id),
  lc as (select l.clinic_id, max(l.created_at) as last_login from login_events l group by l.clinic_id)
  select ids.clinic_id, cp.clinic_name, u.email::text,
         s.plan, s.current_period_end, s.trial_ends_at,
         coalesce(mc.members, 0), coalesce(pr.online_now, 0),
         coalesce(ic.invoices_today, 0), coalesce(ic.sales_today, 0), coalesce(ic.invoices_7d, 0), coalesce(ic.sales_7d, 0),
         coalesce(ic.open_debt_count, 0), coalesce(ic.open_debt_total, 0),
         coalesce(pc.products, 0), coalesce(pc.zero_stock, 0), coalesce(dc.pending, 0),
         coalesce(ac.audit_24h, 0), lc.last_login, ic.last_invoice,
         greatest(lc.last_login, ic.last_invoice)
  from ids
  left join clinic_prefs  cp on cp.clinic_id = ids.clinic_id
  left join auth.users    u  on u.id = ids.clinic_id
  left join subscriptions s  on s.clinic_id = ids.clinic_id
  left join mc on mc.clinic_id = ids.clinic_id
  left join pr on pr.clinic_id = ids.clinic_id
  left join ic on ic.clinic_id = ids.clinic_id
  left join pc on pc.clinic_id = ids.clinic_id
  left join dc on dc.clinic_id = ids.clinic_id
  left join ac on ac.clinic_id = ids.clinic_id
  left join lc on lc.clinic_id = ids.clinic_id
  order by greatest(lc.last_login, ic.last_invoice) desc nulls last, cp.clinic_name nulls last;
end $$;
revoke all on function platform_pulse() from public, anon;
grant execute on function platform_pulse() to authenticated;

-- ── ٦) الحركةُ والدخولُ عبر العيادات ────────────────────────────────────────
-- الترتيبُ العامّ بالوقت يخدمه audit_log_created_idx من 0125.
drop function if exists platform_activity(int, uuid);
create function platform_activity(p_limit int default 100, p_clinic uuid default null)
returns table (
  id bigint, clinic_id uuid, clinic_name text, actor uuid, actor_name text,
  action text, entity text, entity_id text, details jsonb, created_at timestamptz
)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  return query
  select a.id, a.clinic_id, cp.clinic_name, a.actor,
         coalesce(st.name, u.email::text) as actor_name,
         a.action, a.entity, a.entity_id, a.details, a.created_at
  from audit_log a
  left join clinic_prefs cp on cp.clinic_id = a.clinic_id
  left join lateral (select s.name from staff s where s.user_id = a.actor and s.clinic_id = a.clinic_id limit 1) st on true
  left join auth.users u on u.id = a.actor
  where (p_clinic is null or a.clinic_id = p_clinic)
  order by a.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
revoke all on function platform_activity(int, uuid) from public, anon;
grant execute on function platform_activity(int, uuid) to authenticated;

drop function if exists platform_logins(int);
create function platform_logins(p_limit int default 100)
returns table (clinic_id uuid, clinic_name text, user_id uuid, email text, name text, created_at timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  return query
  select l.clinic_id, cp.clinic_name, l.user_id, l.email, l.name, l.created_at
  from login_events l
  left join clinic_prefs cp on cp.clinic_id = l.clinic_id
  order by l.created_at desc
  limit least(greatest(coalesce(p_limit, 100), 1), 500);
end $$;
revoke all on function platform_logins(int) from public, anon;
grant execute on function platform_logins(int) to authenticated;
