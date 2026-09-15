-- ============================================================================
-- ٠١٨١ — لفُّ نداءات auth_clinic() بالسياسات، وتثبيتُ مسارِ محفّظِ الحالة
--
-- سياسةٌ تنادي `auth_clinic()` عاريةً تُعيد تقييمَ الدالّة **لكلّ صفّ** بدل
-- مرّةٍ واحدة لكلّ استعلام؛ ولفُّها بـ`(select ...)` يجعلها InitPlan يُحسب
-- مرّة. 0128 لفّت ما كان قائماً يومَها، وما جاء بعدها وُلد عارياً.
--
-- المقيسُ على الإنتاج (١٥ أيلول) **سبعُ سياسات**، لا أربع كما قال التقرير:
--   • أربعٌ من 0158 — portal_settings_clinic_all · portal_sessions_clinic_read
--     · portal_sessions_clinic_revoke · portal_login_log_clinic_read
--   • وثلاثٌ من 0174 على storage.objects — product_images_insert/update/delete
--     (و`product_images_select` وحدها ملفوفة: كُتبت بـ0179 بعد الدرس).
-- وثلاثُ 0095 ملفوفةٌ بالإنتاج فعلاً — لأن 0128 جرت مرّةً — لكنّ مصدرَها كان
-- عارياً، فإعادةُ تنزيلها كانت **تفكُّ اللفَّ بصمت** وتكدّس نسخةً ثانيةً
-- بـrls_policy_backup. صُحّحت الثلاثُ (و0158 و0174 معها) **من المنبع** بنفس
-- هذه الدفعة، فلا تعود الدورةُ تدور. وهذه الهجرة للقاعدة التي نزلت عليها
-- النسخُ القديمة سلفاً.
--
-- ومحفّزُ `store_orders_guard_status` (0176) كان المحفّزَ الوحيد بالنظام بلا
-- `search_path` مثبَّت — مقيسٌ بالإنتاج: prosecdef=false و proconfig فارغ.
-- يبقى invoker (نمط 0162: يحرس ما يكتبه `authenticated` ولا يشدّ أكثرَ من
-- السياسة)، ويُثبَّت مسارُه وحده.
--
-- لا أثرَ سلوكيّاً على أيّ عيادة: نفسُ الشرط، نفسُ القرار — كلفةُ تقييمٍ أقلّ.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0180.
-- ============================================================================

-- ── ١) بوّابةُ المالك (0158) ───────────────────────────────────────────────
drop policy if exists portal_settings_clinic_all on portal_settings;
create policy portal_settings_clinic_all on portal_settings for all
  using      (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

drop policy if exists portal_sessions_clinic_read on portal_sessions;
create policy portal_sessions_clinic_read on portal_sessions for select
  using (clinic_id = (select auth_clinic()));

drop policy if exists portal_sessions_clinic_revoke on portal_sessions;
create policy portal_sessions_clinic_revoke on portal_sessions for update
  using      (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

drop policy if exists portal_login_log_clinic_read on portal_login_log;
create policy portal_login_log_clinic_read on portal_login_log for select
  using (clinic_id = (select auth_clinic()));

-- ── ٢) دلوُ صور المنتجات (0174) ───────────────────────────────────────────
-- داخل حارسٍ لأن حزمةَ الفحص بلا مخطّط storage (نفسُ نمط 0179).
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice '0181: لا مخطّط storage — تُتخطّى سياساتُ الدلو (حزمةُ الفحص)';
    return;
  end if;

  drop policy if exists product_images_insert on storage.objects;
  create policy product_images_insert on storage.objects
    for insert to authenticated
    with check (bucket_id = 'product-images'
                and (storage.foldername(name))[1] = (select auth_clinic())::text);

  drop policy if exists product_images_update on storage.objects;
  create policy product_images_update on storage.objects
    for update to authenticated
    using (bucket_id = 'product-images'
           and (storage.foldername(name))[1] = (select auth_clinic())::text)
    with check (bucket_id = 'product-images'
                and (storage.foldername(name))[1] = (select auth_clinic())::text);

  drop policy if exists product_images_delete on storage.objects;
  create policy product_images_delete on storage.objects
    for delete to authenticated
    using (bucket_id = 'product-images'
           and (storage.foldername(name))[1] = (select auth_clinic())::text);
end $$;

-- ── ٣) مسارُ محفّظِ حالة الطلب (0176) ─────────────────────────────────────
create or replace function store_orders_guard_status()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status is distinct from old.status then
    if old.status <> 'new' or new.status not in ('accepted', 'rejected', 'cancelled') then
      raise exception 'store_order_status_locked'
        using hint = 'قرار الطلب نهائي: طلبٌ ' ||
          case old.status when 'accepted' then 'مقبولٌ وانفوتر' when 'rejected' then 'مرفوض' else 'ملغى' end ||
          ' ما يرجع «جديد» ولا يتقرّر مرتين. إذا صار خطأ، عالجه بمرتجعٍ من شاشة المبيعات.';
    end if;
    new.decided_at := now();
  end if;
  return new;
end $$;
