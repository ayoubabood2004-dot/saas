-- ============================================================================
-- ٠١٧٩ — دلو صور المنتجات كان بلا سياسة SELECT، فما ارتفعت صورةٌ واحدة
--
-- العلّة (مكتشَفةٌ بتدقيقٍ شامل، ومُثبَتةٌ ثلاث مرّات):
--   ١) تجربةٌ على بوستغريس ١٦ بنسخةٍ حرفية من سياسات 0174 وبدور `authenticated`:
--      الإدراجُ الذي يرسله storage-api عند `upsert: true` —
--      `insert … on conflict (bucket_id,name) do update` — يفشل بـ42501
--      «new row violates row-level security policy» **حتى والجدول فارغ**،
--      لأن `on conflict` و`returning` يحتاجان صلاحيةَ SELECT. وبإضافة سياسة
--      SELECT وحدها نجح الرفعُ والحذفُ معاً، **والعزلُ بقي صامداً**: عيادةٌ
--      أخرى تحاول الكتابة بمجلّدنا ما زالت تُرفض بـ42501.
--   ٢) والحذفُ أسوأ: بلا SELECT لا يرى الصفَّ فيرجع `DELETE 0` **بلا خطأ** —
--      فتقول الشاشةُ «شيلت الصورة» ولا شيءَ حُذف. صمتٌ يُصدَّق، وهو الصنفُ
--      الذي عضّنا مراراً.
--   ٣) والقرينةُ من الإنتاج نفسه: دلو `medical-media` **عنده** سياسة SELECT
--      وفيه ملفاتٌ مرفوعة منذ حزيران، ودلو `product-images` بلا SELECT وفيه
--      **صفرُ ملفات** وصفرُ منتجٍ بـ`image_path` من أصل ٢٦٨٤ — بعد يومين من
--      نزول الميزة على عياداتٍ حيّة.
--
-- القراءةُ العامّة للزوّار تمرّ من مسار الدلو العام ولا تحتاج سياسة؛ هذه
-- للمستخدم المسجَّل وحده كي تنجح كتابتُه على مجلّده. والقصُّ كما هو: مجلّدُ
-- العيادة أو مجلّدُ المكتبة المشترك — ولا شيءَ غيرَهما.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0178.
-- ============================================================================

do $$
begin
  -- الحزمةُ المحلّية بلا مخطّط storage — نفسُ حارس 0174 حرفياً.
  if to_regclass('storage.objects') is null then
    raise notice '0179: لا مخطّط storage — تُتخطّى (حزمةُ الفحص)';
    return;
  end if;

  drop policy if exists product_images_select on storage.objects;

  -- `(select auth_clinic())` لا نداءً عارياً: الشرطُ يُقيَّم مرّةً لا لكلّ صفّ
  -- (درسُ rls-initplan، ويمسكه db-guard).
  create policy product_images_select on storage.objects
    for select to authenticated
    using (
      bucket_id = 'product-images'
      and (
        (storage.foldername(name))[1] = (select auth_clinic())::text
        or (storage.foldername(name))[1] = 'library'
      )
    );
end $$;
