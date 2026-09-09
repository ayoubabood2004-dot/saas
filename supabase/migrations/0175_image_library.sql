-- ============================================================================
-- ٠١٧٥ — مكتبة صور المنصّة: يبنيها المالك، ويختار منها الدكتور
--
-- قرار المالك بحرفه (٩ أيلول، docs/store-plan.md): لا يريد الدكاترة يغذّون
-- المكتبة — هو يرفعها من لوحته مقسّمةً شركةً وصنفاً، والعيادات منتقٍ قراءةً
-- فقط. الاختيار يكتب `path` في `products.image_path` — مرجعٌ لملفٍ واحد
-- يخدم كل العيادات، لا نسخة.
--
-- `company`/`section` نصّان حرّان لا مفتاحان أجنبيان: «الكتلوج النموذجي»
-- يعيش بالشِفرة لا بجداول منصّة، وربطُ المكتبة بجداول عيادةٍ ما يخلط
-- ملكيّتين. التنظيم ملك المشغّل وينضبط من شاشته.
--
-- الكتابة (الجدول وملفات `library/` بالمخزن) بشرط `is_platform_admin()` —
-- نفس حارس اللوحة (0151): صفُّ جلسةٍ أو دورٌ لا يكفيان، البريد المرمّز وحده.
-- والشرط داخل `(select …)` لا نداءً عارياً — قاعدة rls-initplan التي يحرسها
-- db-guard على كل سياسةٍ جديدة.
--
-- حذفُ صورةٍ مستعملة لا يمسّ منتجات العيادات (المنصّة لا تكتب بأرض غيرها —
-- درس 0153): يبقى مسارُهم معلّقاً والبطاقة تسقط لرمز الفئة بالواجهة. العدّ
-- قبل الحذف من `image_library_usage` كي يقرّر المشغّل وهو يرى الرقم.
--
-- تُعاد بلا أثرٍ ثانٍ، وأجزاء storage ملفوفةٌ بحارس وجودٍ لحزمة الفحص.
-- تُطبَّق بعد 0174.
-- ============================================================================

create table if not exists image_library (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) between 1 and 120),
  company    text,
  section    text,
  barcode    text,
  path       text not null,
  updated_at timestamptz not null default now()
);

comment on table image_library is
  'مكتبة صور المنتجات بمستوى المنصّة (0175): الكتابة للمشغّل وحده، والعيادات تقرأ وتختار. path يُنسخ إلى products.image_path عند الاختيار.';

alter table image_library enable row level security;

drop policy if exists image_library_read on image_library;
create policy image_library_read on image_library
  for select to authenticated using (true);

drop policy if exists image_library_insert on image_library;
create policy image_library_insert on image_library
  for insert to authenticated with check ((select is_platform_admin()));

drop policy if exists image_library_update on image_library;
create policy image_library_update on image_library
  for update to authenticated
  using ((select is_platform_admin())) with check ((select is_platform_admin()));

drop policy if exists image_library_delete on image_library;
create policy image_library_delete on image_library
  for delete to authenticated using ((select is_platform_admin()));

-- ── ملفات المكتبة بالمخزن: مجلد `library/` كتابتُه للمشغّل وحده ────────────
-- سياساتُ 0174 (مجلدُ العيادة) permissive فتُضاف هذه بجنبها بشرط OR.
do $$
begin
  if to_regclass('storage.objects') is not null then
    drop policy if exists product_images_library_insert on storage.objects;
    create policy product_images_library_insert on storage.objects
      for insert to authenticated
      with check (bucket_id = 'product-images'
                  and (storage.foldername(name))[1] = 'library'
                  and (select is_platform_admin()));

    drop policy if exists product_images_library_update on storage.objects;
    create policy product_images_library_update on storage.objects
      for update to authenticated
      using (bucket_id = 'product-images'
             and (storage.foldername(name))[1] = 'library'
             and (select is_platform_admin()))
      with check (bucket_id = 'product-images'
                  and (storage.foldername(name))[1] = 'library'
                  and (select is_platform_admin()));

    drop policy if exists product_images_library_delete on storage.objects;
    create policy product_images_library_delete on storage.objects
      for delete to authenticated
      using (bucket_id = 'product-images'
             and (storage.foldername(name))[1] = 'library'
             and (select is_platform_admin()));
  end if;
end $$;

-- ── كم منتجاً (بكل العيادات) يستعمل هذه الصورة؟ ──────────────────────────
-- definer لأن المشغّل لا يرى منتجات العيادات بسياساتها — والعدُّ رقمٌ مجرّد
-- لا يكشف بياناتِ عيادة. الحارس داخل الدالّة لا بالواجهة (قاعدة 0145).
create or replace function public.image_library_usage(p_path text)
returns integer
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not is_platform_admin() then
    raise exception 'forbidden: platform admin required';
  end if;
  return (select count(*)::int from products where image_path = p_path);
end;
$$;

revoke all on function public.image_library_usage(text) from public, anon;
grant execute on function public.image_library_usage(text) to authenticated;
