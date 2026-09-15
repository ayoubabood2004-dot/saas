-- ============================================================================
-- ٠١٨٢ — ترتيبُ الكتلوج يصير حاسماً، والمختارُ يتصدّر من الخادم
--
-- الجذر: `order by p.category nulls last, p.name` **ليس ترتيباً حاسماً**.
-- منتجان بنفس الفئة ونفس الاسم (حالةٌ شائعةٌ عند تكرار المُدخَل، ومقيسةٌ
-- عندنا: ٢٨١ منتجاً برموزٍ يدوية) يرجعان بترتيبٍ يقرّره بوستغريس كما يشاء —
-- فيختلف بين نداءٍ وآخر. والصفحةُ الثانية تُطلب بـ`offset`، فبندُ العتبةِ ذاتُه
-- قد يتكرّر أو يُقفَز فوقه. المقيس: «عرض المزيد» علِق ٨–٩ من ٣٠ محاولة.
--
-- وأخطرُ منه أن الواجهة تُسقِط المكرّرات دفاعياً ثم ترفع `hasMore` عن
-- `more.length > 0` — فصفحةٌ كلُّها مكرّرات تُبقي الرايةَ مرفوعةً والإزاحةَ
-- نفسَها: **نداءٌ لا نهائيّ** على دالّةٍ عامّة نزعت 0178 حاجزَها. الصمّامُ
-- بالواجهة (`added > 0`)، والمفتاحُ الحاسم هنا: `p.id` آخرَ مفاتيح الفرز.
--
-- و«المختارُ يتصدّر» (البند ١٦): الواجهةُ كانت تعلّمه داخل الشبكة بلا أن
-- يتقدّم، لأن ترتيبَ الخادم لا يعرفه. صار `store_featured desc` قبل الفئة.
--
-- **وما لا يدخل الترتيبَ عمداً: التوفّر.** اقتُرح `(stock > 0) desc` أوّلاً،
-- وقياسُه كشف أنه يحوّل خللَ عرضٍ إلى **قائمةٍ ناقصة**: التوفّرُ محسوبٌ من
-- `p.stock` ومن `company_sections.pooled_stock`، فبيعةٌ واحدةٌ أثناء تصفّح
-- الزبون تقلب مرتبةَ المنتج فيقفز فوق العتبة ويسقط من الصفحة التالية صامتاً.
-- مُجرَّب: ١٠ من ١٠ محاولات. بينما (category, name, id) يفقد صفراً. فالنافدُ
-- يُميَّز بالواجهة بلا تحريك: «قائمةٌ ناقصة أخطرُ من خطأٍ ظاهر».
--
-- ولا فهرسَ معه: لا يُفهرَس تعبيرٌ فوق جدولٍ مجموع (left join)، وبأكبر عيادةٍ
-- ٩٥٥ منتجاً الفرزُ مجّانيّ. فهرسٌ ميّتٌ كلفةُ كتابةٍ بلا مكسبِ قراءة.
--
-- نسخةٌ حرفية من 0178 عدا سطر الفرز. تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0181.
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
  order by coalesce(p.store_featured, false) desc, p.category nulls last, p.name, p.id
  limit least(greatest(coalesce(p_limit, 60), 1), 100)
  offset greatest(coalesce(p_offset, 0), 0);
$$;

revoke all on function public.store_catalog(text, int, int) from public, anon;
grant execute on function public.store_catalog(text, int, int) to anon, authenticated;
