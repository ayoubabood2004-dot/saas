-- ============================================================================
-- ٠١٨٤ — الصورةُ تُحمى بالدلو، وتُورَّث بالطيّ، ولا تُدفن مع التوأم
--
-- **النافذةُ كانت تُغلق وقد بدأت تُغلق فعلاً.** الخطّةُ كُتبت والدلوُ فارغ.
-- القياسُ اليوم: ملفٌّ واحدٌ بـ`product-images` رُفع أمس، ومنتجٌ واحدٌ
-- يشير إليه. فهذه هجرةُ إعداداتٍ لا هجرةُ بيانات — لو تأخّرت لصارت الثانية.
--
-- ثلاثةُ أشياء:
--
-- ١) **الدلوُ بلا سقفٍ ولا نوع.** `product-images` اليوم
--    `file_size_limit = null` و`allowed_mime_types = null` — أي أنّ أيَّ
--    ملفٍّ بأيّ حجم يُقبل: PDF، فيديو، أرشيف. ومقابله `medical-media`
--    بخمسةَ عشرَ ميغا وستّةِ أنواعٍ منذ اليوم الأوّل. والواجهةُ لا تحمي:
--    `prepareUpload` تمرّر غيرَ الصور **كما هي** عمداً (تقاريرُ المختبر
--    PDF تحتاج ذلك) — فمن اختار PDF بمنتقي صورةِ المنتج رفعه ونجح، وبقيت
--    البطاقةُ فارغةً بلا خطأ.
--
--    والقرينةُ من الإنتاج على أنّ الاسمَ يكذب: الملفُّ الوحيد اسمُه
--    `‹عيادة›/‹منتج›.webp` ونوعُه المخزَّن `image/jpeg`. الاسمُ ثابتٌ
--    بالشِفرة والمحتوى جاءَ من `prepareUpload` (JPEG دائماً) — فالامتدادُ
--    زخرفةٌ لا وصف. تُصلَح بالواجهة بنفس النافذة.
--
-- ٢) **الصورةُ تُدفن مع التوأم.** `merge_products` و`inventory_tidy_uncat`
--    تورّثان الرصيدَ والرموزَ والصلاحية — ولا تورّثان `image_path` ولا
--    `store_desc`. فدمجُ منتجٍ مصوَّرٍ في منتجٍ بلا صورة يُطيّر الصورة:
--    الصفُّ يذهب لسلّة المحذوفات ومعه مسارُه، والباقي يبقى بلا شيء.
--    اليومَ صفرُ عمليةِ دمجٍ على منتجٍ مصوَّر — فالإصلاحُ مجّانيّ، وغداً
--    يحتاج مسحاً لسلّة المحذوفات.
--
--    و**الظهورُ بالمتجر لا يُورَّث**: وراثتُه تنشر منتجاً لم يُنشَر عمداً.
--    النشرُ فعلٌ يُقصد لا يُستنتَج.
--
-- ٣) الترتيبُ داخل الهجرة: الدلوُ أوّلاً — فحتى لو تأخّرت الواجهةُ ساعةً،
--    رفعُ PDF يُرفض بالخادم بدل أن يُقبل ويُصدَّق. والرسالةُ العربية
--    تنزل بالواجهة بنفس النافذة (`describeUploadError`).
--
-- والبدنان أدناه **نسختان حرفيّتان** من 0146 و0169 عدا سطرَي الوراثة.
-- قِيسا قبل النسخ: سطورُ الإنتاج لكلتيهما مطابقةٌ لما بالمستودع سطراً
-- بسطر (درسُ 0183: لا يُلصَق بدنٌ فوق دالّةٍ حيّةٍ قبل أن يُقاس انحرافُها).
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0183.
-- ============================================================================

-- ── ١) الدلو: سقفُ حجمٍ وقائمةُ أنواع ──────────────────────────────────────
-- بحارس `to_regclass` كما 0174 و0179: الحزمةُ المحلّية بلا مخطّط storage.
-- والسقفُ ٢ ميغا لأن `prepareUpload` تنزل بالصورة إلى ٨٠٠ بكسل بجودة ٠٫٧٢
-- (الملفُّ الحيُّ الوحيد ٤٤ كيلو) — فالسقفُ حارسُ سوءِ نيّةٍ لا حارسُ استعمال.
do $$
begin
  if to_regclass('storage.buckets') is null then
    raise notice '0184: لا مخطّط storage — تُتخطّى (حزمةُ الفحص)';
    return;
  end if;
  update storage.buckets
     set allowed_mime_types = array['image/jpeg','image/png','image/webp'],
         file_size_limit    = 2097152
   where id = 'product-images';
end $$;

-- ── ٢) الطيُّ يورّث الصورةَ والوصف ─────────────────────────────────────────
-- ── ٤) دمجُ التوائم يصوّر النسخةَ قبل طيّها ─────────────────────────────────
create or replace function merge_products(p_keep uuid, p_drop uuid)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_keep products;
  v_drop products;
  v_codes text[];
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;
  if p_keep is null or p_drop is null then raise exception 'both products are required'; end if;
  if p_keep = p_drop then raise exception 'cannot merge a product into itself'; end if;

  select * into v_keep from products where id = p_keep and clinic_id = v_clinic for update;
  if v_keep.id is null then raise exception 'product to keep not found'; end if;
  select * into v_drop from products where id = p_drop and clinic_id = v_clinic for update;
  if v_drop.id is null then raise exception 'product to drop not found'; end if;
  if v_keep.pooled or v_drop.pooled then
    raise exception 'pooled products cannot be merged'; end if;

  -- الصورة أوّلاً — بسطورها كما هي الآن، قبل أن تنتقل للأصل.
  select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = p_drop;
  select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = p_drop;
  select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = p_drop;
  select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = p_drop and qty > 0;
  insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
  values (v_drop.id, v_drop.clinic_id, to_jsonb(v_drop), v_inv, v_pur, v_bar, v_sold, coalesce(v_drop.stock, 0), null, auth.uid(), p_keep, nullif(v_keep.barcode, ''))
  on conflict (id) do update
    set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids,
        purchase_item_ids = excluded.purchase_item_ids, barcode_ids = excluded.barcode_ids,
        sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
        deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;

  v_codes := coalesce(v_keep.alt_codes, '{}');
  if v_drop.barcode is not null and v_drop.barcode <> ''
     and v_drop.barcode is distinct from v_keep.barcode
     and not (v_codes @> array[v_drop.barcode]) then
    v_codes := v_codes || v_drop.barcode;
  end if;
  if v_drop.alt_codes is not null then
    select array_agg(distinct x) into v_codes
      from unnest(v_codes || v_drop.alt_codes) as x
     where x is not null and x <> '' and x is distinct from v_keep.barcode;
  end if;

  update invoice_items      set product_id = p_keep where product_id = p_drop;
  update purchase_items     set product_id = p_keep where product_id = p_drop;
  update generated_barcodes set product_id = p_keep where product_id = p_drop;

    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
  update products
     set stock     = coalesce(stock, 0) + coalesce(v_drop.stock, 0),
         alt_codes = coalesce(v_codes, '{}'),
         image_path = coalesce(nullif(image_path, ''), nullif(v_drop.image_path, '')),
         store_desc = coalesce(nullif(store_desc, ''), nullif(v_drop.store_desc, '')),
         min_stock = greatest(coalesce(min_stock, 0), coalesce(v_drop.min_stock, 0)),
         expiry_date = case when expiry_date is null then v_drop.expiry_date
                            when v_drop.expiry_date is null then expiry_date
                            else greatest(expiry_date, v_drop.expiry_date) end
   where id = p_keep
   returning * into v_keep;

  delete from products where id = p_drop;
  return v_keep;
end $$;
revoke all on function merge_products(uuid, uuid) from public, anon;
grant execute on function merge_products(uuid, uuid) to authenticated;

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
    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
    update products set stock = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
      barcode = coalesce(nullif(barcode,''), dup.barcode),
      alt_codes = coalesce(v_codes, '{}'),
      expiry_date = coalesce(expiry_date, dup.expiry_date),
      image_path = coalesce(nullif(image_path, ''), nullif(dup.image_path, '')),
      store_desc = coalesce(nullif(store_desc, ''), nullif(dup.store_desc, ''))
    where id = v_target and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;
  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end $function$;
revoke all on function public.inventory_tidy_uncat() from public, anon;
grant execute on function public.inventory_tidy_uncat() to authenticated;

comment on function merge_products(uuid, uuid) is
  'يدمج توأماً بأصلٍ: الرصيدُ يُجمع، والرموزُ تلحق، والصلاحيةُ أبعدُها — '
  'ومنذ 0184 الصورةُ والوصفُ يملآن فراغَ الأصل بـcoalesce ولا يزيحان ما '
  'فيه. الظهورُ بالمتجر لا يُورَّث: النشرُ فعلٌ يُقصد لا يُستنتَج.';
