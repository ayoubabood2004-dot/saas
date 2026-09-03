-- ============================================================================
-- ٠١٤٤ — دمجُ توأمين: نسخةٌ تُطوى في أصلها بلا أن يضيع رصيدٌ ولا فاتورة
--
-- ── الشكوى (بأكثر من عيادة) ──────────────────────────────────────────────
-- «ندخل المادة، ونبيع منها، وبعد فترة ما نلقاها فنرجع ندخلها». والقياس قال:
-- ولا مادة انحذفت — ١٬٣٢٨ حركةً بثلاثة أيام وكلُّ صفٍّ باقٍ. المادةُ موجودة،
-- لكن **تحت رمزٍ آخر**: ٢٨١ منتجاً بأربع عيادات رمزُه يدويّ قصير (`00`، `247`،
-- `w90`)، فيُمسح باركودُ المصنع فلا يُطابق، فتُعاد المادة بصفٍّ جديد — وينقسم
-- رصيدُها وتاريخُها على اثنين.
--
-- 0141 أوقف تكوينَ توائمَ **جديدة** عند المسح (ربطُ الرمز بالقائم). وهذي
-- الهجرة تعالج **القائمة** منها: تطوي النسخةَ في الأصل.
--
-- ── ما يعنيه الدمج ───────────────────────────────────────────────────────
--   • الرصيد يُجمع (كلاهما بضاعةٌ حقيقية على الرفّ).
--   • رمزُ النسخة يصير رمزاً إضافياً للأصل، فمسحُه غداً يلقى الأصل.
--   • فواتيرُ البيع والشراء وملصقاتُ الباركود تُعاد إلى الأصل — لا تُترك
--     تشير إلى معرّفٍ سيُحذف (المفاتيح الأجنبية تُصفِّر product_id عند الحذف،
--     وتصفيرُه يعني تقريرَ مبيعاتٍ يفقد صنفَه).
--   • ثم تُحذف النسخة.
-- كلُّه بمعاملةٍ واحدة: إمّا يكتمل أو لا يمسّ شيئاً.
--
-- ── ما لا يُدمَج ─────────────────────────────────────────────────────────
-- منتجان من عيادتين، أو الأصلُ ونفسُه، أو نسخةٌ مجمَّعة (pooled) — الرصيدُ
-- المجمَّع بالقسم لا بالمنتج، وجمعُه مع رصيدٍ مفرد يخلط طبقتين.
--
-- بصلاحية المُستدعي عمداً: سياساتُ الصفوف تكفل أن ما نراه منتجُ عيادتنا.
-- ============================================================================

create or replace function merge_products(p_keep uuid, p_drop uuid)
returns products
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_keep products;
  v_drop products;
  v_codes text[];
begin
  if p_keep is null or p_drop is null then raise exception 'both products are required'; end if;
  if p_keep = p_drop then raise exception 'cannot merge a product into itself'; end if;

  -- القفلُ على الصفّين: بيعٌ يمرّ بالأثناء لا يجوز أن يُنقص رصيداً نحن نجمعه.
  select * into v_keep from products where id = p_keep for update;
  if v_keep.id is null then raise exception 'product to keep not found'; end if;
  select * into v_drop from products where id = p_drop for update;
  if v_drop.id is null then raise exception 'product to drop not found'; end if;

  if v_keep.clinic_id is distinct from v_drop.clinic_id then
    raise exception 'products belong to different clinics'; end if;
  if v_keep.pooled or v_drop.pooled then
    raise exception 'pooled products cannot be merged'; end if;

  -- رموزُ النسخة تلحق بالأصل: الأساسيُّ والإضافية، بلا تكرارٍ لما عنده أصلاً.
  v_codes := coalesce(v_keep.alt_codes, '{}');
  if v_drop.barcode is not null and v_drop.barcode <> ''
     and v_drop.barcode is distinct from v_keep.barcode
     and not (v_codes @> array[v_drop.barcode]) then
    v_codes := v_codes || v_drop.barcode;
  end if;
  if v_drop.alt_codes is not null then
    select array_agg(distinct c) into v_codes
      from unnest(v_codes || v_drop.alt_codes) as c
     where c is not null and c <> '' and c is distinct from v_keep.barcode;
  end if;

  -- تاريخُ النسخة يعود للأصل قبل حذفها — وإلا صفّرت المفاتيحُ الأجنبية
  -- product_id وضاع الصنفُ من تقارير المبيعات والمشتريات.
  update invoice_items   set product_id = p_keep where product_id = p_drop;
  update purchase_items  set product_id = p_keep where product_id = p_drop;
  update generated_barcodes set product_id = p_keep where product_id = p_drop;

  -- الرصيدُ يُجمع؛ وحدُّ التنبيه والصلاحية الأبعد يبقيان (لا نُنقص حِمايةً).
  update products
     set stock     = coalesce(stock, 0) + coalesce(v_drop.stock, 0),
         alt_codes = coalesce(v_codes, '{}'),
         min_stock = greatest(coalesce(min_stock, 0), coalesce(v_drop.min_stock, 0)),
         expiry_date = case when expiry_date is null then v_drop.expiry_date
                            when v_drop.expiry_date is null then expiry_date
                            else greatest(expiry_date, v_drop.expiry_date) end
   where id = p_keep
   returning * into v_keep;

  -- والرمزُ الأساسي لازم يبقى فريداً بالعيادة: النسخةُ تُحذف بعد نقل رمزها،
  -- فلا يبقى صفّان بنفس الباركود لحظةً واحدة خارج المعاملة.
  delete from products where id = p_drop;

  return v_keep;
end $$;
revoke all on function merge_products(uuid, uuid) from public, anon;
grant execute on function merge_products(uuid, uuid) to authenticated;
