-- ============================================================================
-- 0169 — «رتّب المخزن» يطوي التوأم ويدفن رموزه: الوراثةُ تلحق بالطيّ
--
-- الجذر: `inventory_tidy_uncat` (0167) بعد أن تحذف التوأم، تحديثُها الوحيد
-- للهدف هو:
--     barcode = coalesce(nullif(barcode,''), dup.barcode)
-- فلا `dup.alt_codes` تُورَّث، ولا `dup.barcode` يُحفظ إضافياً حين يكون
-- للهدف باركودٌ أصلاً. وهذا **عكسُ** `merge_products` (0144) حرفياً — وهو
-- النموذج الصحيح: «رموزُ النسخة تلحق بالأصل: الأساسيُّ والإضافية».
--
-- الأثر: هدفٌ له باركودُه لا يرث شيئاً من توأمه المطويّ ⇒ أوّلُ مسحةٍ لباركود
-- المصنع بعد «رتّب المخزن»: «مو موجود بمخزنك» ⇒ إعادةُ إدخال ⇒ توأمٌ جديد —
-- نفسُ الدورة التي بُني التحصينُ كلُّه لقطعها، من بابٍ اسمُه «ترتيب».
-- و`product_by_code` لا تقرأ سلّةَ المحذوفات، فالرمزُ المدفون يرجع فارغاً.
--
-- المقيس قبل التطبيق (٩ أيلول ٢٠٢٦): الزرُّ **لم يُضغط ولا مرّة** بالإنتاج
-- (صفرُ صفوفٍ بـproducts_trash لها merged_into)، ولو ضُغط اليوم على المنصّة
-- كلِّها لانطوى **منتجٌ واحد** ولا يخسر رموزاً إضافية. فالعلّةُ كامنةٌ لا
-- مشتعلة — وهذه الهجرة تسدّها قبل أوّل ضغطة.
--
-- الإصلاح: نفسُ منطق `merge_products` حرفياً، مع فحصِ ملكيةٍ قبل الضمّ
-- (نظيرُ `attach_product_code`): رمزٌ صار لمنتجٍ ثالثٍ لا يُسرق منه.
-- ولا يُمَسّ ما عدا ذلك: الحذفُ يبقى طيّاً بسلّةٍ كما هو، والنقلُ كما هو.
--
-- تراجع: أعد تعريف الدالّة من 0167 — ويعود دفنُ الرموز.
-- ============================================================================

create or replace function public.inventory_tidy_uncat()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_clinic uuid := auth_clinic(); v_role text := auth_role(); dup record; v_target uuid; v_merged int := 0; v_kept int := 0;
        v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
        v_tgt_barcode text; v_codes text[];
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then raise exception 'forbidden: inventory role required'; end if;
  for dup in select * from products where clinic_id = v_clinic and section_id is null order by created_at loop
    v_target := null;
    if coalesce(dup.barcode,'') <> '' then
      select id into v_target from products where clinic_id = v_clinic and id <> dup.id and section_id is not null
        and coalesce(barcode,'') <> '' and inv_norm_code(barcode) = inv_norm_code(dup.barcode) order by created_at limit 1;
    end if;
    if v_target is null and length(inv_norm_name(dup.name)) >= 2 then
      select id into v_target from products where clinic_id = v_clinic and id <> dup.id and section_id is not null
        and company_id is not distinct from dup.company_id and inv_norm_name(name) = inv_norm_name(dup.name) order by created_at limit 1;
    end if;
    if v_target is null then v_kept := v_kept + 1; continue; end if;
    select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = dup.id;
    select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = dup.id and qty > 0;
    insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
    values (dup.id, v_clinic, to_jsonb(dup), v_inv, v_pur, v_bar, v_sold, coalesce(dup.stock, 0), null, auth.uid(), v_target,
            (select nullif(barcode, '') from products where id = v_target))
    on conflict (id) do update
      set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids, purchase_item_ids = excluded.purchase_item_ids,
          barcode_ids = excluded.barcode_ids, sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
          deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;
    -- النقلُ أوّلاً: المفاتيحُ الأجنبية `on delete set null`، فحذفُ التوأم قبل
    -- النقل يُفرّغ product_id فتضيع الروابط ولا يبقى ما يُنقَل.
    update purchase_items     set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update invoice_items      set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update generated_barcodes set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;

    /* ── الوراثةُ تُحسب **قبل** الحذف والصفُّ حيّ، وتُكتب بعده ──────────────
     * الحسابُ قبل الحذف لأن `dup` لقطةٌ بيدنا، والكتابةُ بعده لأن كتابةَ
     * الباركود والصفّان حيّان تخرق الفهرسَ الفريد (23505) فتُلغي العمليةَ
     * كلَّها — وهذا سببُ ترتيب 0167 الأصليّ، نُبقيه.
     *
     * ونفسُ منطق `merge_products` (0144) حرفاً بحرف: الأساسيُّ والإضافية
     * تلحق بالأصل، بلا فارغٍ ولا مكرَّرٍ ولا ما يساوي باركودَ الهدف. */
    select nullif(barcode, '') into v_tgt_barcode from products where id = v_target and clinic_id = v_clinic;
    select coalesce(alt_codes, '{}') into v_codes from products where id = v_target and clinic_id = v_clinic;
    if coalesce(dup.barcode, '') <> ''
       and inv_norm_code(dup.barcode) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''))
       and not exists (select 1 from unnest(v_codes) c where inv_norm_code(c) = inv_norm_code(dup.barcode)) then
      v_codes := v_codes || dup.barcode;
    end if;
    if dup.alt_codes is not null and dup.alt_codes <> '{}' then
      select coalesce(array_agg(distinct c), '{}') into v_codes
        from unnest(v_codes || dup.alt_codes) as c
       where c is not null and c <> ''
         and inv_norm_code(c) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''));
    end if;
    /* ولا يُسرق رمزٌ صار لمنتجٍ ثالث — نظيرُ فحص `attach_product_code`.
     * (الهدفُ والتوأمُ مستثنيان: الأوّل مالكٌ، والثاني على وشك الحذف.) */
    if v_codes is not null and v_codes <> '{}' then
      select coalesce(array_agg(c), '{}') into v_codes
        from unnest(v_codes) as c
       where not exists (
         select 1 from products o
          where o.clinic_id = v_clinic and o.id <> v_target and o.id <> dup.id
            and (inv_norm_code(o.barcode) = inv_norm_code(c)
                 or exists (select 1 from unnest(coalesce(o.alt_codes,'{}')) x where inv_norm_code(x) = inv_norm_code(c))));
    end if;

    delete from products where id = dup.id and clinic_id = v_clinic;
    update products set stock = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
      barcode = coalesce(nullif(barcode,''), dup.barcode),
      alt_codes = coalesce(v_codes, '{}'),
      expiry_date = coalesce(expiry_date, dup.expiry_date)
    where id = v_target and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;
  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end $function$;

comment on function public.inventory_tidy_uncat() is
  'يطوي غيرَ المصنَّف بمصنَّفٍ يطابقه (رمزاً ثم اسماً+شركة). الطيُّ يورّث '
  'رموزَ المطويّ كلَّها — الأساسيَّ والإضافية — بنفس منطق merge_products، '
  'بعد إسقاط ما صار لمنتجٍ ثالث. قبل 0169 كانت الرموزُ تُدفن مع التوأم '
  'فترجع مسحةُ باركود المصنع «غير موجود» والمادّةُ بالمخزن.';
