-- ============================================================================
-- 0066 — Pooled (legacy/opening) stock at the section level
-- Migrating clinics often know only a LUMP total per group, not a per-barcode
-- count. This adds:
--   • company_sections.pooled_stock — the section's aggregate legacy units
--   • products.pooled               — a barcode added WITHOUT a count (unknown
--                                     quantity; sells from its section pool)
--   • invoice_items.pooled_qty      — how much of a sold line came from the pool
--                                     (so refunds/voids credit the exact split back)
-- Selling a barcode uses its own KNOWN/tracked stock FIRST, then falls back to
-- its section pool (the unknown legacy reserve). A purchase gives a barcode a
-- real count and flips it to tracked (pooled=false); the pool is never touched
-- by a purchase, so the total (pool + Σ tracked) is always conserved — including
-- across refunds and deletions. Apply AFTER 0063–0065. Additive & idempotent.
-- ============================================================================

alter table company_sections add column if not exists pooled_stock numeric(14,3) not null default 0;
alter table products         add column if not exists pooled       boolean       not null default false;
alter table invoice_items    add column if not exists pooled_qty   numeric(14,3) not null default 0;

-- ----------------------------------------------------------------------------
-- deduct_stock_pooled — remove p_qty from a product, KNOWN-first: sell the
-- product's own tracked stock first, then fall back to its section's pool, and
-- RETURN how much came from the pool (so the caller records it on the invoice
-- line for exact refunds). Internal helper (called only from the checkout RPCs).
-- ----------------------------------------------------------------------------
create or replace function deduct_stock_pooled(p_product uuid, p_qty numeric, p_clinic uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_sec       uuid;
  v_stock     numeric(14,3);
  v_pool      numeric(14,3);
  v_fromstock numeric(14,3) := 0;
  v_frompool  numeric(14,3) := 0;
  v_rem       numeric(14,3);
begin
  if p_product is null or coalesce(p_qty, 0) <= 0 then return 0; end if;
  -- Known/tracked stock first — lock the product row.
  select stock, section_id into v_stock, v_sec from products
   where id = p_product and clinic_id = p_clinic for update;
  if not found then return 0; end if;
  v_fromstock := least(p_qty, greatest(0, coalesce(v_stock, 0)));
  if v_fromstock > 0 then
    update products set stock = greatest(0, stock - v_fromstock)
     where id = p_product and clinic_id = p_clinic;
  end if;
  v_rem := p_qty - v_fromstock;
  -- Only the shortfall draws on the section pool (the unknown legacy reserve).
  if v_rem > 0 and v_sec is not null then
    select pooled_stock into v_pool from company_sections
     where id = v_sec and clinic_id = p_clinic for update;
    if v_pool is not null and v_pool > 0 then
      v_frompool := least(v_rem, v_pool);
      update company_sections set pooled_stock = greatest(0, pooled_stock - v_frompool)
       where id = v_sec and clinic_id = p_clinic;
    end if;
  end if;
  return v_frompool;
end $$;

-- ----------------------------------------------------------------------------
-- pos_checkout — pool-aware (redefined on top of 0020). The per-line deduction
-- now drains the pool first and records the pooled part on the invoice line.
-- ----------------------------------------------------------------------------
create or replace function pos_checkout(p_items jsonb) returns invoices
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_invoice invoices;
  it jsonb;
  v_total numeric(12,2) := 0;
  v_cost  numeric(12,2) := 0;
  v_count integer := 0;
  v_fp    numeric(14,3);
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_total := v_total + (it->>'qty')::int * (it->>'unit_price')::numeric;
    v_cost  := v_cost  + (it->>'qty')::int * (it->>'unit_cost')::numeric;
    v_count := v_count + (it->>'qty')::int;
  end loop;

  insert into invoices (clinic_id, total, cost_total, profit, item_count)
  values (v_clinic, v_total, v_cost, v_total - v_cost, v_count)
  returning * into v_invoice;

  for it in select * from jsonb_array_elements(p_items) loop
    v_fp := 0;
    if nullif(it->>'product_id','') is not null then
      v_fp := deduct_stock_pooled((it->>'product_id')::uuid, (it->>'qty')::numeric, v_clinic);
    end if;
    insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, pooled_qty)
    values (
      v_invoice.id, v_clinic,
      nullif(it->>'product_id','')::uuid,
      coalesce(it->>'name', 'Item'),
      it->>'barcode',
      (it->>'qty')::int,
      (it->>'unit_price')::numeric,
      (it->>'unit_cost')::numeric,
      (it->>'qty')::int * (it->>'unit_price')::numeric,
      v_fp
    );
  end loop;

  return v_invoice;
end $$;

-- ----------------------------------------------------------------------------
-- retail_checkout — pool-aware (redefined on top of 0062; every prior feature —
-- fractional sub-units, split payments, credit/amount_paid, final-price override,
-- notes — preserved). Only the per-line stock decrement now drains the pool first
-- and records the pooled part on the invoice line.
-- ----------------------------------------------------------------------------
create or replace function retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  it         jsonb;
  v_qty      numeric(14,3);
  v_stockq   numeric(14,3);
  v_fp       numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_cost     numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_dtype    text    := nullif(p_meta->>'discount_type','');
  v_dinput   numeric(12,2) := coalesce(nullif(p_meta->>'discount_value','')::numeric, 0);
  v_discount numeric(14,2) := 0;
  v_total    numeric(14,2);
  v_final    numeric(14,2) := nullif(p_meta->>'final_total','')::numeric;
  v_paid     numeric(14,2);
  v_details  jsonb := case
                        when jsonb_typeof(p_meta->'payment_details') = 'array'
                             and jsonb_array_length(p_meta->'payment_details') > 0
                        then p_meta->'payment_details'
                        else null
                      end;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    v_subtotal := v_subtotal + v_qty * (it->>'unit_price')::numeric;
    v_cost     := v_cost     + v_qty * (it->>'unit_cost')::numeric;
    v_count    := v_count    + v_qty;
  end loop;

  if v_final is not null then
    v_total    := greatest(0, v_final);
    v_discount := greatest(0, v_subtotal - v_total);
    v_dtype    := case when v_discount > 0 then 'fixed' else null end;
  elsif v_dtype = 'percent' then
    v_discount := round(v_subtotal * least(greatest(v_dinput, 0), 100) / 100.0, 2);
    v_total    := greatest(0, v_subtotal - v_discount);
  elsif v_dtype = 'fixed' then
    v_discount := least(greatest(v_dinput, 0), v_subtotal);
    v_total    := greatest(0, v_subtotal - v_discount);
  else
    v_discount := 0; v_dtype := null;
    v_total    := greatest(0, v_subtotal);
  end if;

  v_paid := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);

  insert into invoices (clinic_id, subtotal, discount, discount_type, total, amount_paid, cost_total, profit,
                        item_count, customer_name, customer_phone, pet_name, payment_method, payment_details, staff_id, notes, status)
  values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_paid, v_cost, v_total - v_cost,
          round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
          nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''), v_details,
          nullif(p_meta->>'staff_id','')::uuid, nullif(p_meta->>'notes',''), 'paid')
  returning * into v_invoice;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty    := (it->>'qty')::numeric;
    v_stockq := coalesce(nullif(it->>'stock_qty','')::numeric, v_qty);
    v_fp     := 0;
    if nullif(it->>'product_id','') is not null then
      v_fp := deduct_stock_pooled((it->>'product_id')::uuid, v_stockq, v_clinic);
    end if;
    insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label)
    values (
      v_invoice.id, v_clinic,
      nullif(it->>'product_id','')::uuid,
      coalesce(it->>'name', 'Item'),
      it->>'barcode',
      v_qty,
      (it->>'unit_price')::numeric,
      (it->>'unit_cost')::numeric,
      v_qty * (it->>'unit_price')::numeric,
      v_stockq,
      v_fp,
      nullif(it->>'unit_label','')
    );
  end loop;

  return v_invoice;
end $$;

-- ----------------------------------------------------------------------------
-- refund_invoice — pool-aware (redefined on top of 0051). Credit the pooled part
-- of each line back to the section pool and the rest to the product's stock, so a
-- refund exactly reverses the pool-first sale. Legacy lines (pooled_qty 0) behave
-- as before (all to stock).
-- ----------------------------------------------------------------------------
create or replace function refund_invoice(p_invoice uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_invoice invoices;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  update invoices set status = 'refunded', refunded_at = now()
    where id = p_invoice and clinic_id = v_clinic and status is distinct from 'refunded'
    returning * into v_invoice;
  if not found then
    select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic;
    if not found then raise exception 'invoice not found'; end if;
    return v_invoice; -- already refunded → no double restock
  end if;
  for r in
    select ii.product_id, ii.qty, ii.stock_qty, ii.pooled_qty, p.section_id
      from invoice_items ii
      left join products p on p.id = ii.product_id and p.clinic_id = v_clinic
     where ii.invoice_id = p_invoice and ii.clinic_id = v_clinic
  loop
    if r.product_id is not null then
      if coalesce(r.pooled_qty, 0) > 0 and r.section_id is not null then
        update company_sections set pooled_stock = pooled_stock + r.pooled_qty
          where id = r.section_id and clinic_id = v_clinic;
        update products set stock = stock + (coalesce(r.stock_qty, r.qty) - r.pooled_qty)
          where id = r.product_id and clinic_id = v_clinic;
      else
        update products set stock = stock + coalesce(r.stock_qty, r.qty)
          where id = r.product_id and clinic_id = v_clinic;
      end if;
    end if;
  end loop;
  return v_invoice;
end $$;

-- ----------------------------------------------------------------------------
-- delete_invoice — pool-aware (redefined on top of 0051). Same reversal as refund
-- when the invoice wasn't already refunded.
-- ----------------------------------------------------------------------------
create or replace function delete_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_status text;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if auth_role() <> 'manager' then raise exception 'forbidden: managers only'; end if;
  select status into v_status from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_status is distinct from 'refunded' then
    for r in
      select ii.product_id, ii.qty, ii.stock_qty, ii.pooled_qty, p.section_id
        from invoice_items ii
        left join products p on p.id = ii.product_id and p.clinic_id = v_clinic
       where ii.invoice_id = p_invoice and ii.clinic_id = v_clinic
    loop
      if r.product_id is not null then
        if coalesce(r.pooled_qty, 0) > 0 and r.section_id is not null then
          update company_sections set pooled_stock = pooled_stock + r.pooled_qty
            where id = r.section_id and clinic_id = v_clinic;
          update products set stock = stock + (coalesce(r.stock_qty, r.qty) - r.pooled_qty)
            where id = r.product_id and clinic_id = v_clinic;
        else
          update products set stock = stock + coalesce(r.stock_qty, r.qty)
            where id = r.product_id and clinic_id = v_clinic;
        end if;
      end if;
    end loop;
  end if;
  delete from invoices where id = p_invoice and clinic_id = v_clinic;
end $$;

-- ----------------------------------------------------------------------------
-- record_purchase — redefined on top of 0064 to flip a restocked product to
-- TRACKED (pooled=false): once it has a real received count it's no longer part
-- of the unknown pool. (The section pool itself is deliberately left untouched.)
-- ----------------------------------------------------------------------------
create or replace function record_purchase(p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_company  uuid := nullif(p_meta->>'company_id','')::uuid;
  v_purchase purchases;
  it         jsonb;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_status   text;
  v_pid      uuid;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;
  end loop;

  v_paid   := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);
  v_status := case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end;

  insert into purchases (clinic_id, company_id, company_name, reference, total, item_count,
                         amount_paid, payment_method, status, notes, purchased_at, staff_id)
  values (v_clinic, v_company, nullif(p_meta->>'company_name',''), nullif(p_meta->>'reference',''),
          round(v_total, 2), round(v_count)::int, v_paid, nullif(p_meta->>'payment_method',''), v_status,
          nullif(p_meta->>'notes',''), coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, now()),
          nullif(p_meta->>'staff_id','')::uuid)
  returning * into v_purchase;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;

    if v_pid is null and nullif(it->>'barcode','') is not null then
      select id into v_pid from products
       where clinic_id = v_clinic and barcode = it->>'barcode'
       limit 1;
    end if;

    if v_pid is not null then
      update products set
        stock          = greatest(0, coalesce(stock, 0) + v_qty),
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company)
      where id = v_pid and clinic_id = v_clinic;
      if not found then v_pid := null; end if;
    end if;

    if v_pid is null then
      insert into products (clinic_id, company_id, barcode, name, category,
                            purchase_price, sell_price, stock, min_stock, expiry_date, pooled)
      values (v_clinic, v_company, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date, false)
      returning id into v_pid;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (v_purchase.id, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);
  end loop;

  return v_purchase;
end $$;

grant execute on function record_purchase(jsonb, jsonb) to authenticated;
