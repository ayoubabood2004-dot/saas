-- ============================================================================
-- ٠١٤٦ — لا يُفلت منتج: كلُّ طريقٍ يُخرج صفّاً من `products` يمرّ بالسلّة أوّلاً
--
-- ── ما كشفته المراجعة العميقة ─────────────────────────────────────────────
-- ١) 0145 نزلت على الإنتاج بصلاحية المُستدعي، وسلّةُ المحذوفات عليها سياسةُ
--    قراءةٍ فقط — فأوّلُ حذفٍ حقيقي كان سيُرفض بسياسة الصفوف («new row violates
--    row-level security»). فشلٌ آمن (لا يُحذف شيء) لكنه فشل. الدوالّ هنا
--    بصلاحية المُعرِّف مع فحصٍ صريح للعيادة والدور — والسلّة تبقى بلا سياسة كتابة.
-- ٢) ثلاثةُ طرقٍ أخرى تحذف من `products` ولا تمرّ بالسلّة: دمجُ التوائم (0144)،
--    و«رجّع كل قطعة لمكانها» (0117)، والحذفُ المباشر عبر PostgREST من نسخةٍ
--    قديمةٍ محفوظةٍ بمتصفّح (سياسة `products_write` تسمح به). فالحارسُ صار
--    **محفّزاً قبل الحذف** على الجدول نفسه: أيُّ صفٍّ يخرج، بأي طريق، يُصوَّر
--    في السلّة قبل أن يخرج. من ينسى السلّة لا يستطيع أن ينساها.
-- ٣) الدمجُ صار قابلاً للفكّ: صورةُ النسخة ومعرّفاتُ سطورها تُحفظ مع
--    `merged_into`، والاسترجاع يردّ رصيدَها ورمزَها وسطورَها من الأصل.
-- ============================================================================

alter table products_trash add column if not exists merged_into uuid;
-- باركودُ الأصل لحظةَ الدمج: لو كان بلا باركود وورث باركودَ النسخة، يردّه عند الفكّ.
alter table products_trash add column if not exists keep_barcode text;

-- ── ١) الحارس: قبل أي حذف ──────────────────────────────────────────────────
create or replace function products_trash_capture()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
begin
  -- الدالّةُ التي تحذف (delete_product / merge / tidy) سجّلت الصفَّ بتفاصيله قبلنا.
  if exists (select 1 from products_trash where id = old.id) then return old; end if;
  -- حذفُ الحساب نفسه (cascade من auth.users): لا صاحبَ للسلّة والمفتاحُ يرفض — نمرّ.
  if old.clinic_id is null or not exists (select 1 from auth.users where id = old.clinic_id) then return old; end if;

  select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = old.id;
  select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = old.id;
  select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = old.id;
  select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = old.id and qty > 0;

  insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock)
  values (old.id, old.clinic_id, to_jsonb(old), v_inv, v_pur, v_bar, v_sold, coalesce(old.stock, 0))
  on conflict (id) do nothing;
  return old;
end $$;

drop trigger if exists products_trash_guard on products;
create trigger products_trash_guard
  before delete on products
  for each row execute function products_trash_capture();

-- ── ٢) الحذف الصريح — بصلاحية المُعرِّف وفحصٍ صريح ─────────────────────────
create or replace function delete_product(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_p products;
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[];
  v_sold numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;

  select * into v_p from products where id = p_id and clinic_id = v_clinic for update;
  if v_p.id is null then raise exception 'product not found'; end if;

  select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = p_id;
  select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = p_id;
  select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = p_id;
  select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = p_id and qty > 0;

  insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into)
  values (v_p.id, v_p.clinic_id, to_jsonb(v_p), v_inv, v_pur, v_bar, v_sold, coalesce(v_p.stock, 0), nullif(btrim(p_reason), ''), auth.uid(), null)
  on conflict (id) do update
    set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids,
        purchase_item_ids = excluded.purchase_item_ids, barcode_ids = excluded.barcode_ids,
        sold_qty = excluded.sold_qty, stock = excluded.stock, reason = excluded.reason,
        deleted_by = auth.uid(), deleted_at = now(), merged_into = null;

  update invoice_items      set product_id = null where product_id = p_id;
  update purchase_items     set product_id = null where product_id = p_id;
  update generated_barcodes set product_id = null where product_id = p_id;
  delete from products where id = p_id;
  return jsonb_build_object('id', v_p.id, 'sold_qty', v_sold, 'stock', coalesce(v_p.stock, 0));
end $$;
revoke all on function delete_product(uuid, text) from public, anon;
grant execute on function delete_product(uuid, text) to authenticated;

-- ── ٣) الاسترجاع — ويفكّ الدمج إن كان الصفُّ قد طُوي بدمج ──────────────────
create or replace function restore_product(p_id uuid)
returns products
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_t products_trash;
  v_p products;
  v_keep products;
  v_code text;
  c text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;

  select * into v_t from products_trash where id = p_id and clinic_id = v_clinic for update;
  if v_t.id is null then raise exception 'not in trash'; end if;
  if exists (select 1 from products where id = p_id) then
    raise exception 'product already exists'; end if;
  v_code := v_t.row->>'barcode';

  -- فكُّ الدمج: الأصلُ يردّ ما أخذه — الرصيدَ، ورمزَ النسخة من رموزه الإضافية،
  -- والباركودَ إن كان قد ورثه لأنه كان بلا باركود.
  if v_t.merged_into is not null then
    select * into v_keep from products where id = v_t.merged_into and clinic_id = v_clinic for update;
    if v_keep.id is not null then
      update products
         set stock = greatest(0, coalesce(stock, 0) - coalesce(v_t.stock, 0)),
             alt_codes = array_remove(coalesce(alt_codes, '{}'), v_code),
             barcode = case when v_t.keep_barcode is null and v_code is not null and barcode = v_code then null else barcode end
       where id = v_keep.id;
      for c in select jsonb_array_elements_text(coalesce(v_t.row->'alt_codes', '[]'::jsonb)) loop
        update products set alt_codes = array_remove(coalesce(alt_codes, '{}'), c) where id = v_keep.id;
      end loop;
    end if;
  end if;

  -- الباركود لازم يبقى فريداً: لو أُدخل من جديد أثناء الغياب نستعيد بلاه.
  if v_code is not null and exists (
       select 1 from products where clinic_id = v_t.clinic_id and barcode = v_code) then
    v_t.row := v_t.row - 'barcode';
  end if;

  insert into products select * from jsonb_populate_record(null::products, v_t.row)
  returning * into v_p;

  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)
     and (product_id is null or product_id = v_t.merged_into);
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids)
     and (product_id is null or product_id = v_t.merged_into);
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)
     and (product_id is null or product_id = v_t.merged_into);

  delete from products_trash where id = p_id;
  return v_p;
end $$;
revoke all on function restore_product(uuid) from public, anon;
grant execute on function restore_product(uuid) to authenticated;

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

  update products
     set stock     = coalesce(stock, 0) + coalesce(v_drop.stock, 0),
         alt_codes = coalesce(v_codes, '{}'),
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

-- ── ٥) «رجّع كل قطعة لمكانها» (0117) يصوّر التوأمَ قبل طيّه ──────────────────
create or replace function inventory_tidy_uncat()
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  dup      record;
  v_target uuid;
  v_merged int := 0;
  v_kept   int := 0;
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;

  for dup in
    select * from products
     where clinic_id = v_clinic and section_id is null
     order by created_at
  loop
    v_target := null;

    if coalesce(dup.barcode,'') <> '' then
      select id into v_target from products
       where clinic_id = v_clinic and id <> dup.id and section_id is not null
         and coalesce(barcode,'') <> ''
         and inv_norm_code(barcode) = inv_norm_code(dup.barcode)
       order by created_at limit 1;
    end if;

    if v_target is null and length(inv_norm_name(dup.name)) >= 2 then
      select id into v_target from products
       where clinic_id = v_clinic and id <> dup.id and section_id is not null
         and company_id is not distinct from dup.company_id
         and inv_norm_name(name) = inv_norm_name(dup.name)
       order by created_at limit 1;
    end if;

    if v_target is null then
      v_kept := v_kept + 1;
      continue;
    end if;

    -- الصورة قبل الطيّ (0146): يُفكّ الدمج من تبويب المحذوفات لو طُوي ما لا يجب.
    select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = dup.id;
    select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = dup.id and qty > 0;
    insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
    values (dup.id, v_clinic, to_jsonb(dup), v_inv, v_pur, v_bar, v_sold, coalesce(dup.stock, 0), null, auth.uid(), v_target,
            (select nullif(barcode, '') from products where id = v_target))
    on conflict (id) do update
      set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids,
          purchase_item_ids = excluded.purchase_item_ids, barcode_ids = excluded.barcode_ids,
          sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
          deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;

    update products set
      stock       = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
      barcode     = coalesce(nullif(barcode,''), dup.barcode),
      expiry_date = coalesce(expiry_date, dup.expiry_date)
    where id = v_target and clinic_id = v_clinic;

    update purchase_items      set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update invoice_items       set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update generated_barcodes  set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;

    delete from products where id = dup.id and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;

  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end $$;
revoke all on function inventory_tidy_uncat() from public, anon;
grant execute on function inventory_tidy_uncat() to authenticated;
