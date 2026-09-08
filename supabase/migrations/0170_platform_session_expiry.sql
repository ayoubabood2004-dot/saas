-- ============================================================================
-- 0170 — جلسةُ مشغّل المنصّة بلا أجل: عيادةٌ خادميةٌ تتبدّل بصمتٍ وإلى الأبد
--
-- الجذر: `platform_sessions` (0151) بلا عمود أجل — `started_at` وحده —
-- و`platform_acting_clinic()` تقرأ الصفَّ **بلا شرطِ زمن**:
--     select case when is_platform_admin()
--            then (select acting_clinic from platform_sessions where admin_id = auth.uid()) end
-- والمفتاحُ `admin_id` وحده، أي أن الجلسة على مستوى **الحساب لا اللسان**:
-- فكلُّ أجهزة المشغّل وكلُّ ألسنته تصير بعيادة الزبون، وتبقى كذلك للأبد.
--
-- السيناريو: المشغّل دخل عيادةً مساءً ولم يخرج؛ صباحاً — وشريطُ التحذير غائبٌ
-- إن تعثّر نداءُ `platform_context` — يجرّب ميزةً فتهبط ببضاعة عيادة الزبون
-- ودفترها، بدور مدير، وبلا أثرٍ بسجلّها (باتفاق 0151). و`seedOwnClinic` (0153)
-- يحرس بذورَ المُرطِّبات وحدها؛ كتاباتُ المستخدم المباشرة تمرّ.
--
-- الإصلاح: أجلٌ اثنتا عشرة ساعة من آخر دخول. التجديدُ قائمٌ فعلاً
-- (`platform_enter` تكتب `on conflict do update`)، فجلسةُ عملٍ حيّة تتجدّد
-- بكلّ دخول، والمنسيّةُ تنتهي وحدها.
--
-- **ولا تُعاد تعريفُ `auth_clinic`** (CLAUDE.md §٣: تعريفٌ لاحق بلا فرع
-- المنصّة يُسقط اللوحةَ بصمت) — يُعاد تعريفُ `platform_acting_clinic` وحدها،
-- وهي أوّلُ فرعٍ بـ`coalesce` داخل `auth_clinic`. فانتهاءُ الجلسة يُرجع
-- المشغّلَ لعيادته هو بنفس السلسلة القائمة بلا مسارٍ ثانٍ.
--
-- و`platform_context` تقول «انتهت» صراحةً بدل أن تبدو كأن لا جلسةَ أصلاً —
-- فيعرف المشغّلُ لماذا تبدّلت شاشتُه، ويعرف الشريطُ ماذا يعرض.
--
-- ولا يُمَسّ اتفاقُ انعدام الأثر عند العيادة ولا `platform_session_log`.
--
-- تراجع: أعد `platform_acting_clinic` من 0151 (بلا شرط الزمن) — وتعود الجلسةُ
-- أبديةً. والعمودُ الجديد لا يضرّ بقاؤه.
-- ============================================================================

-- أجلٌ صريحٌ بالصفّ لا محسوبٌ بالدالّة وحدها: يُقرأ بلوحة المشغّل، ويسمح
-- بمدّةٍ مختلفة لاحقاً بلا تعديل الدالّة.
alter table platform_sessions add column if not exists expires_at timestamptz;
update platform_sessions set expires_at = started_at + interval '12 hours' where expires_at is null;

comment on column platform_sessions.expires_at is
  'أجلُ الجلسة. `platform_acting_clinic` تتجاهل ما انقضى أجلُه، فترجع عيادةُ '
  'المشغّل نفسِه. يُجدَّد بكلّ platform_enter.';

create or replace function public.platform_acting_clinic()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when is_platform_admin()
              then (select acting_clinic from platform_sessions
                     where admin_id = auth.uid()
                       and coalesce(expires_at, started_at + interval '12 hours') > now())
         end
$function$;

create or replace function public.platform_context()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select case when is_platform_admin() then
    coalesce(
      (select jsonb_build_object(
                -- 'acting' يبقى null حين ينقضي الأجل: هو ما تبني عليه الواجهةُ
                -- والسياساتُ، فلا يجوز أن يقول «داخل» ودالّةُ الهويّة تقول «خارج».
                'acting', case when coalesce(s.expires_at, s.started_at + interval '12 hours') > now()
                               then s.acting_clinic end,
                'expired', coalesce(s.expires_at, s.started_at + interval '12 hours') <= now(),
                'expires_at', coalesce(s.expires_at, s.started_at + interval '12 hours'),
                'clinic_name', (select cp.clinic_name from clinic_prefs cp where cp.clinic_id = s.acting_clinic),
                'since', s.started_at, 'reason', s.reason)
         from platform_sessions s where s.admin_id = auth.uid()),
      jsonb_build_object('acting', null))
  else jsonb_build_object('acting', null) end
$function$;

-- والدخولُ يجدّد الأجل: بلا هذا تبقى الجلسةُ تنتهي بعد اثنتي عشرة ساعةً من
-- **أوّل** دخولٍ مهما تكرّر الدخول، فينقطع المشغّلُ وهو يعمل.
create or replace function public.platform_enter(p_clinic uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'auth'
as $function$
declare v_name text; v_email text;
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  if p_clinic is null or p_clinic = auth.uid() then raise exception 'bad_clinic'; end if;
  if not exists (select 1 from auth.users where id = p_clinic) then raise exception 'clinic_not_found'; end if;
  select clinic_name into v_name from clinic_prefs where clinic_id = p_clinic;
  select u.email::text into v_email from auth.users u where u.id = auth.uid();
  update platform_session_log set left_at = now() where admin_id = auth.uid() and left_at is null;
  insert into platform_sessions (admin_id, acting_clinic, reason, started_at, expires_at)
    values (auth.uid(), p_clinic, nullif(btrim(p_reason), ''), now(), now() + interval '12 hours')
    on conflict (admin_id) do update set acting_clinic = excluded.acting_clinic, reason = excluded.reason,
                                         started_at = now(), expires_at = now() + interval '12 hours';
  insert into platform_session_log (admin_id, admin_email, acting_clinic, reason)
    values (auth.uid(), v_email, p_clinic, nullif(btrim(p_reason), ''));
  return jsonb_build_object('ok', true, 'clinic_id', p_clinic, 'clinic_name', v_name);
end $function$;

revoke all on function public.platform_enter(uuid, text) from public, anon;
grant execute on function public.platform_enter(uuid, text) to authenticated;
