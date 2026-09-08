-- ============================================================================
-- 0171 — تحويلُ منتجٍ متتبَّع إلى «مجمَّع»: كتابتان بلا ذرّية ⇒ ازدواجُ رصيدٍ صامت
--
-- الجذر (Inventory.tsx): عند الطيّ يُنفَّذ أوّلاً
--     updateCompanySection(section_id, { pooled_stock: cur + product.stock })
-- ثم `updateProduct` بـ`stock = 0`. و`rollbackGrouping` بالـcatch تُرجع الشركةَ
-- والصنفَ المنشأين فقط — **لا شيء يُنقص الحوض**. فنجاحُ الأولى وفشلُ الثانية
-- يعني بضاعةً تُعدّ مرّتين: بحوض الصنف وبرصيد المنتج معاً — بقيمة المخزون
-- وببطاقة الصنف. وازدواجٌ صامتٌ أسوأ من خسارةٍ ظاهرة.
--
-- وعلّةٌ ثانية: `cur` يُقرأ من `props` قديمة، فيدوس تعديلَ حوضٍ متزامناً من
-- جهازٍ آخر (آخرُ كاتبٍ يفوز على قراءةٍ بائتة).
--
-- الإصلاح: عمليةٌ واحدة بمعاملةٍ واحدة تقرأ الحوضَ الحيَّ بـ`for update`:
-- إمّا يُضاف الرصيدُ للحوض ويُصفَّر بالمنتج معاً، أو لا شيء.
--
-- ولأنها تكتب بجدولٍ سياستُه قراءةٌ لغير المدير، فهي `security definer` وتفحص
-- العيادةَ والدورَ بنفسها (CLAUDE.md §٣).
--
-- تراجع: drop function pool_product(uuid, uuid);
-- ============================================================================

create or replace function public.pool_product(p_product uuid, p_section uuid)
returns products
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_stock  numeric;
  v_pool   numeric;
  v_out    products;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;

  -- القفلُ على المنتج أوّلاً ثم الصنف — ترتيبٌ ثابتٌ يمنع التشابك.
  select stock into v_stock from products
   where id = p_product and clinic_id = v_clinic for update;
  if not found then raise exception 'product_not_found'; end if;

  -- الحوضُ يُقرأ **حيّاً** لا من لقطةِ المتصفّح: قراءةٌ بائتة تدوس تعديلَ
  -- جهازٍ آخر بصمت.
  select coalesce(pooled_stock, 0) into v_pool from company_sections
   where id = p_section and clinic_id = v_clinic for update;
  if not found then raise exception 'section_not_found'; end if;

  update company_sections
     set pooled_stock = round(v_pool + greatest(0, coalesce(v_stock, 0)), 3)
   where id = p_section and clinic_id = v_clinic;

  update products
     set pooled = true, section_id = p_section, stock = 0
   where id = p_product and clinic_id = v_clinic
  returning * into v_out;

  return v_out;
end $function$;

revoke all on function public.pool_product(uuid, uuid) from public, anon;
grant execute on function public.pool_product(uuid, uuid) to authenticated;

comment on function public.pool_product(uuid, uuid) is
  'يطوي رصيدَ منتجٍ متتبَّع إلى حوض صنفه ويصفّره بالمنتج — بمعاملةٍ واحدة. '
  'كانت الواجهةُ تكتبهما على مرحلتين، فنجاحُ الأولى وفشلُ الثانية يعدّ '
  'البضاعةَ مرّتين. ويقرأ الحوضَ بـfor update فلا يدوس تعديلاً متزامناً.';
