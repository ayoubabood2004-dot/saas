-- ============================================================================
-- ٠٢٤٤ — مشغّلُ المنصّة لا يظهر «متصلاً» بكادر عيادةٍ دخلها
--
-- ── الشكوى (المالك ١٨/١٠) ────────────────────────────────────────────────
-- اسمُ المشغّل يطلع بـ«متصل الآن» و«آخر ظهور» بإدارة الكادر عند العيادات بعد كلّ صيانة،
-- فيشوّش على الإدارة — وخصوصاً العيادات التي تعتمد الحضورَ والانصراف.
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- presence_beat (0072) يكتب بعيادة auth_clinic()، و0151 جعلت auth_clinic() للمشغّل الداخل
-- عيادةَ الزبون — فنبضتُه كلَّ دقيقة تُسجَّل صفّاً بحضور تلك العيادة، ويبقى بعد خروجه «آخر ظهور».
-- وهذا يخالف اتفاقَ 0151 نفسه: «لا أثرَ للدخول عند العيادة». ويضخّم أيضاً online_now بنبض المنصّة.
--
-- ── المقيس (الإنتاج ١٨/١٠، قراءةً) ──────────────────────────────────────
-- ٦ صفوف حضور للمشغّل بـ٦ عيادات زبائن (آخرُها ١٤/١٠)، وصفرُ صفوفٍ له بجدول staff.
--
-- ── ما تفعله ─────────────────────────────────────────────────────────────
-- ١) presence_beat لا تكتب شيئاً ما دام المشغّلُ داخل عيادة (platform_acting_clinic() غيرُ فارغة).
--    بعيادته هو تنبض كما كانت.
-- ٢) تمسح ما كُتب سابقاً: صفُّ حضورٍ للمشغّل بعيادةٍ دخلها (من platform_session_log).
--
-- ── ما لا تفعله ──────────────────────────────────────────────────────────
-- • لا تمسّ auth_clinic/auth_role_base (فرعُ المشغّل فيها يبقى كما هو).
-- • لا تمسّ حضورَ الكادر الحقيقيّ، ولا حضورَ المشغّل بعيادته.
-- • لا تضيف أثراً للدخول عند العيادة.
--
-- تُطبَّق قبل الواجهة. إضافيةٌ وتُعاد بلا أثرٍ ثانٍ (المسحُ لا يجد شيئاً بالمرّة الثانية).
-- تراجع: أعد presence_beat من 0072 حرفاً.
-- ============================================================================

create or replace function presence_beat(p_name text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  -- المشغّلُ داخل عيادة زبون: لا حضورَ باسمه عندها (اتفاقُ 0151: لا أثرَ للدخول).
  if platform_acting_clinic() is not null then return; end if;
  insert into staff_presence (clinic_id, user_id, name, role, last_seen)
  values (auth_clinic(), auth.uid(), p_name, auth_role_base(), now())
  on conflict (clinic_id, user_id) do update
    set last_seen = now(),
        name = coalesce(excluded.name, staff_presence.name),
        role = excluded.role;
end $$;
grant execute on function presence_beat(text) to authenticated;

-- ما كُتب قبلها: صفُّ المشغّل بعيادةٍ دخلها، لا بعيادته.
delete from staff_presence p
 where p.clinic_id <> p.user_id
   and exists (select 1 from platform_session_log l
                where l.admin_id = p.user_id and l.acting_clinic = p.clinic_id);
