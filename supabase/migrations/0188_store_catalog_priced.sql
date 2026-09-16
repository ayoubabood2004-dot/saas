-- ============================================================================
-- ٠١٨٨ — الكتلوجُ لا يعرض منتجاً بلا سعر
--
-- 0186 منعت **نشرَ** منتجٍ بسعرٍ ≤ ٠. ويبقى بابٌ ثانٍ: منتجٌ نُشر وهو مسعَّرٌ
-- ثمّ صُفّر سعرُه لاحقاً (تعديلٌ بالمخزون، أو استيرادٌ يكتب صفراً). فيبقى
-- معروضاً بالمتجر، و`store_place_order` تسعّر **من القاعدة** (وهو الصحيح) —
-- فيخرج السطرُ بصفرٍ ويُقبل الطلبُ مجّاناً.
--
-- المقيسُ اليوم: صفرُ منتجٍ **معروضٍ** بسعرٍ ≤ ٠ عند كلّ العيادات — فالبابُ
-- مفتوحٌ ولم يدخل منه أحدٌ بعد. وهذا أرخصُ وقتٍ لإغلاقه.
--
-- **والاختفاءُ لا يكون صامتاً**: لوحةُ «جاهزية متجرك» تقول «١ بلا سعر» وتفتح
-- التصفيةَ المقابلة. الشرطُ وحدَه كان سيُخفي منتجاً بلا تفسير — والقاعدةُ
-- عندنا أنّ النقصَ يُقال لا يُصدَّق.
--
-- والبدنُ نسخةٌ حرفيّة من 0182 عدا سطرَ الشرط.
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0187.
-- ============================================================================

create or replace function public.store_catalog(p_slug text, p_limit int default 60, p_offset int default 0)
returns table (id uuid, name text, category text, subcategory text, price numeric, descr text, available boolean, image_path text, featured boolean)
language sql
security definer
set search_path = public
stable
as $$
  select p.id, p.name, p.category::text, p.subcategory, p.sell_price, p.store_desc,
         (p.stock > 0 or coalesce(cs.pooled_stock, 0) > 0) as available,
         p.image_path,
         coalesce(p.store_featured, false)
  from store_profiles sp
  join products p on p.clinic_id = sp.clinic_id and p.store_visible
  left join company_sections cs on cs.id = p.section_id
  where sp.slug = lower(trim(p_slug)) and sp.enabled
    -- سعرٌ ≤ ٠ لا يُعرض: الطلبُ يسعّر من القاعدة فيُقبل مجّاناً (مرآةُ 0186).
    and coalesce(p.sell_price, 0) > 0
  order by coalesce(p.store_featured, false) desc, p.category nulls last, p.name, p.id
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

comment on function public.store_catalog(text, int, int) is
  'كتلوجُ المتجر العام. الترتيبُ حاسمٌ بـp.id آخِراً (0182)، والتوفّرُ **خارجَ** '
  'الفرز عمداً وإلا صارت قائمةً ناقصة. ومنذ 0188: سعرٌ ≤ ٠ لا يُعرض — '
  'store_place_order تسعّر من القاعدة فالصفرُ يُباع مجّاناً. واختفاؤه يُقال '
  'بلوحة «جاهزية متجرك» لا يُترك بلا تفسير.';
