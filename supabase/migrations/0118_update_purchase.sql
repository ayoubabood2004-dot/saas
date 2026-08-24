-- ============================================================================
-- doctorVet — 0118: تعديل فاتورة الشراء بعد حفظها.
--
-- الطبيب يسجّل فاتورة، وبعد ساعة يكتشف سطراً ناقصاً أو كميةً غلط. قبل هذا
-- الملف كان الحل الوحيد «سجّل فاتورة ثانية» — فيتشوّه السجل ويتضاعف الدين.
--
-- update_purchase تعيد بناء الفاتورة بأمانٍ على المخزون:
--   ١) تسحب كميات سطورها القديمة من المخزون (ما نزل يُرفع).
--   ٢) تعيد تنزيل السطور الجديدة بنفس مطابقة 0117 الذكية: الباركود الموحَّد
--      يرصّد القطعة بمكانها، والاسم احتياطاً يتعلّم الباركود، والجديد فعلاً
--      يهبط بالصنف المختار.
--   ٣) تستبدل سطور الفاتورة وتعيد حساب الإجمالي والحالة — والمدفوع يبقى كما
--      سُدِّد (مقصوصاً على الإجمالي الجديد) فلا يضيع تسديد ولا يُختلق.
--
-- السطر الذي لم يتغيّر أثره الصافي على المخزون صفر — التعديل ليس هدماً.
-- ============================================================================

create or replace function update_purchase(p_purchase uuid, p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_purchase purchases;
  v_company  uuid;
  it         jsonb;
  old_it     record;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  select * into v_purchase from purchases
   where id = p_purchase and clinic_id = v_clinic
   for update;
  if not found then raise exception 'purchase not found'; end if;
  v_company := v_purchase.company_id;

  -- ── ١) اعكس أثر السطور القديمة على المخزون ثم أزلها ──
  for old_it in
    select product_id, qty from purchase_items
     where purchase_id = p_purchase and clinic_id = v_clinic and product_id is not null
  loop
    update products
       set stock = greatest(0, coalesce(stock, 0) - coalesce(old_it.qty, 0))
     where id = old_it.product_id and clinic_id = v_clinic;
  end loop;
  delete from purchase_items where purchase_id = p_purchase and clinic_id = v_clinic;

  -- ── ٢) نزّل السطور الجديدة — نفس مطابقة record_purchase v3 حرفياً ──
  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;

    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> ''
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    if v_pid is not null then
      update products set
        stock          = greatest(0, coalesce(stock, 0) + v_qty),
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic;
      if not found then v_pid := null; end if;
    end if;

    if v_pid is null then
      v_sec := nullif(it->>'section_id','')::uuid;
      if v_sec is not null then
        select id into v_sec from company_sections
         where id = v_sec and clinic_id = v_clinic
           and (v_company is null or company_id = v_company)
         limit 1;
      end if;

      insert into products (clinic_id, company_id, section_id, barcode, name, category,
                            purchase_price, sell_price, stock, min_stock, expiry_date)
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
      returning id into v_pid;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (p_purchase, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);
  end loop;

  -- ── ٣) رأس الفاتورة: إجمالي جديد، والمدفوع الحقيقي يبقى مقصوصاً عليه ──
  v_total := round(v_total, 2);
  v_paid  := least(coalesce(nullif(p_meta->>'amount_paid','')::numeric,
                            coalesce(v_purchase.amount_paid, v_purchase.total)),
                   v_total);
  v_paid  := greatest(v_paid, 0);

  update purchases set
    total          = v_total,
    item_count     = round(v_count)::int,
    amount_paid    = v_paid,
    status         = case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end,
    reference      = coalesce(nullif(p_meta->>'reference',''), reference),
    payment_method = coalesce(nullif(p_meta->>'payment_method',''), payment_method),
    supplier_name  = case when p_meta ? 'supplier_name'  then nullif(p_meta->>'supplier_name','')  else supplier_name  end,
    supplier_phone = case when p_meta ? 'supplier_phone' then nullif(p_meta->>'supplier_phone','') else supplier_phone end,
    notes          = case when p_meta ? 'notes'          then nullif(p_meta->>'notes','')          else notes          end,
    purchased_at   = coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, purchased_at)
  where id = p_purchase and clinic_id = v_clinic
  returning * into v_purchase;

  return v_purchase;
end $$;

revoke all on function update_purchase(uuid, jsonb, jsonb) from public, anon;
grant execute on function update_purchase(uuid, jsonb, jsonb) to authenticated;

-- ============================================================================
-- VERIFY:
--   عدّل فاتورةً من الواجهة وراقب: مخزون السطر غير المتغيّر لا يتحرك،
--   والمعدَّل يتحرك بفرقه فقط، والإجمالي والحالة يتحدّثان.
-- ============================================================================
