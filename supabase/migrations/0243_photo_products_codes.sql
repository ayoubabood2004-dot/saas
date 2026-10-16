-- ============================================================================
-- ٠٢٤٣ — باركوداتُ المنتج بتشكيلة المتجر: الرموزُ الإضافية تصل للمصوّر كما يصله الأساسيّ
--
-- ── لماذا ───────────────────────────────────────────────────────────────
-- المصوّرُ (والطبيبُ) يفتحان منتجاً بتشكيلة المتجر ليصوّراه، والعلبةُ بيدهما — فالباركودُ هو ما
-- يربط العلبةَ بالصفّ. `photo_products` (0228) تعطي الرمزَ الأساسيّ وحده، والمنتجُ بالواقع له
-- عدّةُ رموز (CLAUDE.md: رقمُ الرفّ وباركودُ المصنع): مسحُ باركود المصنع على مادّةٍ رمزُها الأساسيّ
-- رقمُ رفّ يقول «ما لكيت» والمادّةُ موجودة — نفسُ كذبة «المنتج اختفى» بشاشةٍ أخرى. والطبيبُ يقرأ
-- صفَّ المنتج كاملاً (alt_codes معه)، فالبحثُ بالمتجر كان سيتّفق للطبيب ويختلف للمصوّر.
--
-- ── المقيس (الإنتاج ١٧/١٠) ──────────────────────────────────────────────
-- ٨ منتجاتٍ من ٣٤٣٢ لها رموزٌ إضافية، و٢٧١ بلا باركودٍ أصلاً؛ مصوّران بعيادةٍ واحدة.
--
-- ── ما لا تفعله ──────────────────────────────────────────────────────────
-- لا توسّع سياجاً ولا بوّابة: نفسُ الدالّة (اسمُها بقائمة api_gate منذ 0222)، ونفسُ الصفوف، ومفتاحٌ
-- واحدٌ زائد بنفس حساسية `barcode` الذي تعطيه أصلاً. لا سعرَ شراءٍ ولا شيءَ من الحسابات.
--
-- تُطبَّق بعد 0242. إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: أعد photo_products من 0228 حرفاً.
-- ============================================================================

create or replace function public.photo_products()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_store  boolean;
begin
  if v_clinic is null then
    raise exception 'not_authenticated' using hint = 'سجّل دخولك من جديد.';
  end if;
  -- الإذنُ من staff_can وحدها (المديرُ نعم، وقالبُ الطبيب يشمل الإذنين): إطفاءُ المدير
  -- لإذنِ طبيبٍ يُحترم بالخادم لا بالواجهة وحدها.
  v_store := staff_can('manageStore');
  if not (v_store or staff_can('manageProductPhotos')) then
    raise exception 'not_authorized' using errcode = '42501', hint = 'ما عندك صلاحية على صور المنتجات.';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
             'id', p.id, 'name', p.name, 'barcode', p.barcode,
             -- 0243: الرموزُ الإضافية مع الأساسيّ — بنفس حساسيته، ولكلّ من يرى الأساسيّ.
             'alt_codes', coalesce(to_jsonb(p.alt_codes), '[]'::jsonb),
             'category', p.category,
             'subcategory', p.subcategory, 'company_id', p.company_id, 'company_name', c.name,
             'image_path', p.image_path, 'store_visible', coalesce(p.store_visible, false),
             'store_featured', coalesce(p.store_featured, false), 'store_desc', p.store_desc,
             -- السعرُ والرصيدُ لمن يدير المتجر؛ المصوّرُ وحده لا يحتاجهما.
             'sell_price', case when v_store then p.sell_price end,
             'stock', case when v_store then p.stock end,
             -- 0228: المجمَّعُ (رصيدُه بحوض قسمه) والانتهاءُ.
             'pooled', case when v_store then coalesce(p.pooled, false) end,
             'expiry_date', case when v_store then p.expiry_date end)
           order by p.name)
      from products p left join companies c on c.id = p.company_id
     where p.clinic_id = v_clinic and p.farm_id is null), '[]'::jsonb);
end $$;
revoke all on function public.photo_products() from public, anon;
grant execute on function public.photo_products() to authenticated;
