-- ============================================================================
-- ٠٢٤٧ — حقلُ المشغّل: مساحةُ دواجن له وحده، مفصولةٌ عن عيادته، يدخلها بضغطة
--
-- ── الطلب (المالك ٢١/١٠) ─────────────────────────────────────────────────
-- «اريد خيار افوت لحقل الدواجن بلا ما اروح اسوي تفعيل خاص وينلغي تفعيلي —
--  كأنما الحقل مالتي مفصول عن العيادة، حتى اكدر بسهولة اشوف شنو ديصير
--  وبسهولة اضيف اعداداتي».
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- الباقةُ صفٌّ واحد لكلّ مساحة عمل (`subscriptions.clinic_id` مفتاحٌ أساس)،
-- وباقةُ الحقل ليست ترقيةً بل باقةٌ أخرى (entitlements.ts: لا باقةَ عيادةٍ
-- تُدرج `farm`). فرؤيةُ الحقل من حساب المشغّل تعني **استبدالَ** باقته:
-- المقيس (الإنتاج، قراءةً): ٢١/٩ الساعة ١٥:٢٥ صار حسابُه «حقل» وأنشأ حقلاً
-- (قاعةٌ ودفعةٌ ومادّة)، و١٦:٥٧ أعاد «سوبر» سنوياً — فاختفى الحقلُ ببياناته
-- وهو باقٍ بعيادته. صفرُ مساحاتٍ بباقة الحقل على المنصّة كلّها.
--
-- ── ما تفعله ─────────────────────────────────────────────────────────────
-- مساحةٌ ثانيةٌ للمشغّل بباقة الحقل، يدخلها **بنفس طريق** «ادخل العيادة»
-- (0151): `platform_enter` إليها، فتعمل كلُّ سياسةٍ ودالّةٍ وقيمةٍ افتراضية
-- كأنه مديرُها — بلا مسارٍ ثانٍ — ويُخرج منها بنفس زرّ «اخرج». عيادتُه
-- وباقتُها لا تُمسّان أبداً.
--
-- ١) `platform_workspaces`: لكلّ مشغّلٍ مساحتُه (حقلٌ واحد الآن).
-- ٢) `platform_farm_enter()`: تُنشئ المساحةَ أوّلَ مرّة، وتثبّت باقتَها «حقل»
--    حتى ٢٠٩٩ **بكلّ دخول** (فإلغاؤها من لوحة الاشتراكات لا يدوم)، ثم تدخلها.
-- ٣) `platform_workspace_ids()`: أيُّ المساحات للمشغّلين — لتُعزل عن نبض
--    العيادات وعدّها بالواجهة (المشغّلُ يقرأ أرقامَ زبائنه، لا أرقامَه هو).
--
-- ── لماذا حسابٌ بـauth.users ─────────────────────────────────────────────
-- كلُّ `clinic_id` بالنظام مفتاحٌ أجنبيّ إلى `auth.users(id)` (0006، 0007،
-- 0191…)، و`platform_enter` تشترط وجوده هناك. فالمساحةُ حسابٌ لا يدخله أحد:
-- كلمةُ سرٍّ فارغة، وبريدٌ بنطاق `.invalid` (لا يُسلَّم بالتعريف)، ومحظورٌ إلى
-- ٢٩٩٩. والحقولُ النصّيةُ التي يقرؤها GoTrue تُكتب '' لا null: الإنتاجُ كلُّه
-- هكذا (مقيس: صفرُ صفوفٍ بـconfirmation_token فارغ)، وnull فيها يُسقط قائمةَ
-- المستخدمين بلوحة سوبابيس («converting NULL to string is unsupported»).
-- ومحفّزُ `handle_new_user` يكتب له ملفّاً بدور «owner» لأن البيانات الوصفية بلا
-- دور — **عمداً**: دليلُ العيادات العامّ (0078، حجزُ أصحاب الحيوانات) يعرض كلَّ
-- ملفٍّ بدور admin أو clinic، فلو أخذ دورَ عيادةٍ لظهر «حقلي» للناس.
--
-- ── ما لا تفعله ──────────────────────────────────────────────────────────
-- • لا تمسّ auth_clinic/auth_role_base ولا platform_enter (CLAUDE.md §٣).
-- • لا تنقل حقلَ ٢١/٩ من عيادته — نقلُ بياناتٍ بين عيادتين قرارُ المالك.
-- • لا تضيف أثراً عند أيّ عيادة: الدخولُ يُسجَّل بسجلّ جلسات المشغّل وحده.
--
-- تُطبَّق قبل الواجهة (الواجهةُ تنادي الدالّتين). إضافيةٌ وتُعاد بلا أثرٍ ثانٍ.
-- تراجع: drop function platform_farm_enter(), platform_workspace_ids();
--         (والجدولُ والحسابُ يبقيان بلا ضرر؛ حذفُ الحساب يحذف بياناتِ الحقل كلَّها).
-- ============================================================================

-- ── ١) مساحاتُ المشغّلين ───────────────────────────────────────────────────
create table if not exists platform_workspaces (
  admin_id   uuid not null references auth.users(id) on delete cascade,
  kind       text not null check (kind = 'farm'),
  clinic_id  uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (admin_id, kind)
);
alter table platform_workspaces enable row level security;
-- `comment on` يأخذ نصّاً حرفياً لا تعبيراً (`||` خطأُ صياغة) — فالأسطرُ نصوصٌ متجاورة.
comment on table platform_workspaces is
  'RLS-DENY-ALL-BY-DESIGN — مساحاتُ عملٍ يملكها مشغّلُ المنصّة (0247). تُكتب '
  'وتُقرأ من platform_farm_enter() وplatform_workspace_ids() وحدهما، وكلتاهما '
  'تشترط is_platform_admin() أوّلاً.';

-- ── ٢) ادخل حقلي ──────────────────────────────────────────────────────────
create or replace function platform_farm_enter() returns jsonb
language plpgsql volatile security definer set search_path = public, auth as $$
declare
  v_admin   uuid := auth.uid();
  v_ws      uuid;
  v_created boolean := false;
  -- «بلا انتهاء» بتاريخٍ لا بـinfinity: statusOf بالواجهة يقرؤه بـnew Date
  -- و'infinity' يصير Invalid Date فتُحسب الباقةُ منتهية.
  c_until   constant timestamptz := '2099-12-31 00:00:00+03';
begin
  if v_admin is null or not is_platform_admin() then raise exception 'not_admin'; end if;
  -- ضغطتان معاً (لسانان) لا تصنعان حسابين.
  perform pg_advisory_xact_lock(hashtext('platform_farm_enter'), hashtext(v_admin::text));

  select w.clinic_id into v_ws from platform_workspaces w where w.admin_id = v_admin and w.kind = 'farm';
  if v_ws is null then
    v_ws := gen_random_uuid();
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, reauthentication_token, phone_change, phone_change_token,
      raw_app_meta_data, raw_user_meta_data, is_super_admin, is_sso_user, is_anonymous,
      banned_until, created_at, updated_at)
    values (
      '00000000-0000-0000-0000-000000000000', v_ws, 'authenticated', 'authenticated',
      'farm-' || replace(v_admin::text, '-', '') || '@workspace.doctorvet.invalid', '',
      '', '', '', '', '', '', '', '',
      jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email'),
                         'doctorvet_workspace', 'farm', 'owner_admin', v_admin),
      -- بلا «role»: الملفُّ يصير owner لا clinic، فلا يظهر بدليل العيادات (رأس الهجرة).
      jsonb_build_object('full_name', 'حقل المشغّل — مساحة عمل لا تُحذف'),
      false, false, false,
      '2999-01-01 00:00:00+00', now(), now());
    insert into platform_workspaces (admin_id, kind, clinic_id) values (v_admin, 'farm', v_ws);
    v_created := true;
  end if;

  -- الاسمُ مرّةً واحدة: بعدها يسمّيه المشغّلُ من إعداداته ولا يُدهس.
  insert into clinic_prefs (clinic_id, clinic_name) values (v_ws, 'حقلي')
    on conflict (clinic_id) do nothing;

  -- الباقةُ تُثبَّت بكلّ دخول: «حقل» حتى ٢٠٩٩. والحصصُ (0104) لا تُمسّ — يجرّبها
  -- المشغّلُ من لوحة الاشتراكات إن شاء.
  insert into subscriptions (clinic_id, plan, period, trial_ends_at, current_period_end, was_subscriber)
    values (v_ws, 'farm', 'annual', now(), c_until, true)
    on conflict (clinic_id) do update
      set plan = 'farm', period = 'annual', was_subscriber = true,
          current_period_end = greatest(coalesce(subscriptions.current_period_end, c_until), c_until),
          updated_at = now()
      where subscriptions.plan is distinct from 'farm'
         or subscriptions.period is distinct from 'annual'
         or not subscriptions.was_subscriber
         or coalesce(subscriptions.current_period_end, '-infinity') < c_until;

  -- نفسُ الدخول الذي يدخل به عيادةَ زبون — فلا مسارَ ثانٍ ينساه تعديلٌ لاحق.
  return platform_enter(v_ws, 'حقلي (الدواجن)')
         || jsonb_build_object('workspace', v_ws, 'created', v_created);
end $$;
revoke all on function platform_farm_enter() from public, anon;
grant execute on function platform_farm_enter() to authenticated;

-- ── ٣) أيُّ المساحات للمشغّلين ──────────────────────────────────────────────
create or replace function platform_workspace_ids() returns jsonb
language plpgsql stable security definer set search_path = public as $$
begin
  if not is_platform_admin() then raise exception 'not_admin'; end if;
  return jsonb_build_object(
    'mine', (select w.clinic_id from platform_workspaces w where w.admin_id = auth.uid() and w.kind = 'farm'),
    'all',  coalesce((select jsonb_agg(w.clinic_id order by w.created_at) from platform_workspaces w), '[]'::jsonb));
end $$;
revoke all on function platform_workspace_ids() from public, anon;
grant execute on function platform_workspace_ids() to authenticated;
