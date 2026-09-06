-- ============================================================================
-- 0163 — دوالُّ الخزن الداخلية كانت تُنادى من أي حساب، وأخرى من بلا حساب
--
-- مستشارُ Supabase الأمنيّ (٦ أيلول ٢٠٢٦): ٥٢ دالّةً SECURITY DEFINER تُنفَّذ
-- بدور `anon`، و١٢٠ بدور `authenticated`. أكثرُها يحرس نفسَه بـauth.uid()/
-- auth_clinic() فيرجع بلا شيء لمن لا هويّةَ له — لكن اثنتين لا تحرسان نفسَهما
-- أصلاً لأنهما مساعدتان داخليّتان لدوالّ البيع والإرجاع:
--
--   deduct_stock_pooled(p_product, p_qty, p_clinic)   تُنقص المخزون
--   credit_stock(p_product, p_qty, p_clinic)           تزيده
--
-- تأخذان العيادةَ **معامِلاً** وتكتبان بصلاحية المالك بلا سؤال. أي حسابٍ على
-- المنصّة — أو بلا حساب للأولى — كان يقدر ينادي
-- `/rest/v1/rpc/deduct_stock_pooled` بمعرّف منتجِ عيادةٍ أخرى فيُنقص رصيدَها،
-- أو `credit_stock` فيرفعه. الواجهة لا تناديهما أبداً (pos_checkout/
-- retail_return… تنادينهما من داخل القاعدة بهويّة المالك، وهذه لا تحتاج منحاً).
-- فيُسحب التنفيذُ منهما عن anon وauthenticated وpublic — ويبقى للمالك.
--
-- وباقي دوالّ العيادة (التسديد، الشراء، الرمز السرّي، التصدير، الكادر…) لا
-- شأنَ لـ`anon` بها: تُسحب منها عن anon وحده. ولا تُمَسّ:
--   · دوالُّ الهويّة التي تناديها السياسات (auth_clinic، auth_role،
--     auth_role_base، is_clinic_staff، has_permission، is_platform_admin،
--     can_access_pet_media): السياسةُ تُقيَّم بدور الطالب، وسحبُها عن anon
--     يقلب «لا صفوف» إلى «permission denied» على كل صفحةٍ عامّة.
--   · دوالُّ الصفحات العامّة بطبيعتها: بوّابةُ المالك (portal_*)، المتجرُ
--     (store_*)، الدليلُ (clinic_directory، clinic_staff_public،
--     doctor_busy_slots)، رحلةُ الزبون (track_journey، react_journey)،
--     ورسائلُ الأجهزة برمزها (ingest_device_message).
--   · دوالُّ المحفّزات (returns trigger): لا تُنادى عبر PostgREST أصلاً.
--
-- ومعها خمسُ دوالٍّ بمسارِ بحثٍ قابلٍ للتبديل (function_search_path_mutable)
-- تُثبَّت على public.
--
-- تراجع: grant execute on function … to anon, authenticated (بالاسم).
-- ============================================================================

-- ── ١) المساعدتان الداخليّتان: للمالك وحده ──────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('deduct_stock_pooled', 'credit_stock')
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', r.sig);
  end loop;
end $$;

-- ── ٢) دوالُّ العيادة لا تُنادى بلا هويّة ────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f' and p.prosecdef
       and p.prorettype not in ('trigger'::regtype, 'event_trigger'::regtype)
       and p.proname not in (
         -- هويّةٌ تناديها السياسات
         'auth_clinic', 'auth_role', 'auth_role_base', 'is_clinic_staff',
         'has_permission', 'is_platform_admin', 'can_access_pet_media',
         -- صفحاتٌ عامّة بطبيعتها
         'portal_logout', 'portal_me', 'portal_pet', 'portal_request_code', 'portal_verify_code',
         'store_catalog', 'store_front', 'store_place_order',
         'clinic_directory', 'clinic_staff_public', 'doctor_busy_slots',
         'track_journey', 'react_journey', 'ingest_device_message')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    -- امتيازُ anon يأتي من PUBLIC (الافتراضيّ لكل دالّة)، فسحبُه عن anon وحده
    -- لا يغيّر شيئاً: يُسحب عن PUBLIC ويُعاد منحُه لمن يحتاجه بالاسم.
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- ── ٣) مسارُ بحثٍ ثابت للمساعدات الخمس ─────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.prokind = 'f'
       and p.proname in ('quota_period_end', 'quota_period_start', 'phone_key', 'inv_norm_code', 'inv_norm_name')
       and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public', r.sig);
  end loop;
end $$;
