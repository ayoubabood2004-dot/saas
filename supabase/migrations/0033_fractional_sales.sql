-- ============================================================================
-- doctorVet — 0033: fractional sales / unit of measure.
--
-- A product can now be sold either as a whole BOX (the base stock unit) or as a
-- smaller SUB-UNIT (e.g. a single pill "حبة", a strip "شريط", a millilitre "مل").
-- The clinic enters how many sub-units fill one box (units_per_box) and the price
-- of one sub-unit (sub_unit_price). When a sub-unit is sold the till deducts the
-- precise fraction from stock — selling 5 pills from a 20-pill box removes 0.25
-- of a box, so stock becomes fractional.
--
-- products gains:  has_sub_unit, sub_unit_name, units_per_box, sub_unit_price
-- products.stock becomes numeric so it can hold fractional boxes (e.g. 9.75).
-- invoice_items gains: stock_qty (box-equivalent deducted, for exact refunds) and
--                      unit_label (the unit shown on the receipt: علبة / حبة …);
--                      qty widens to numeric so any sale unit fits.
-- retail_checkout / refund_invoice / delete_invoice updated to deduct & return the
-- box-equivalent (stock_qty), falling back to qty for legacy rows / whole-box sales.
--
-- Additive & idempotent. Clinic-isolated by existing RLS. Apply AFTER 0032.
-- ============================================================================

-- PRODUCT COLUMNS ------------------------------------------------------------
alter table products add column if not exists has_sub_unit   boolean not null default false;
alter table products add column if not exists sub_unit_name  text;
alter table products add column if not exists units_per_box  numeric(12,3);
alter table products add column if not exists sub_unit_price numeric(12,2);

-- Stock can now hold fractional boxes (existing integer values are preserved).
alter table products alter column stock type numeric(14,3);

-- INVOICE-ITEM COLUMNS -------------------------------------------------------
-- stock_qty: how much of a box this line removed from stock (0.25 for 5/20 pills).
--            Null on legacy rows / plain box sales → callers fall back to qty.
-- unit_label: the unit the customer bought, snapshotted for the receipt.
alter table invoice_items add column if not exists stock_qty  numeric(14,3);
alter table invoice_items add column if not exists unit_label text;
alter table invoice_items alter column qty type numeric(14,3);

-- RETAIL CHECKOUT (fraction-aware) -------------------------------------------
-- p_items: [{product_id,name,barcode,qty,unit_price,unit_cost,stock_qty?,unit_label?}]
-- p_meta:  {customer_name,customer_phone,pet_name,discount_type,discount_value,payment_method,staff_id}
create or replace function retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  it         jsonb;
  v_qty      numeric(14,3);
  v_stockq   numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_cost     numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_dtype    text    := nullif(p_meta->>'discount_type','');
  v_dinput   numeric(12,2) := coalesce(nullif(p_meta->>'discount_value','')::numeric, 0);
  v_discount numeric(14,2) := 0;
  v_total    numeric(14,2);
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    v_subtotal := v_subtotal + v_qty * (it->>'unit_price')::numeric;
    v_cost     := v_cost     + v_qty * (it->>'unit_cost')::numeric;
    v_count    := v_count    + v_qty;
  end loop;

  if v_dtype = 'percent' then
    v_discount := round(v_subtotal * least(greatest(v_dinput, 0), 100) / 100.0, 2);
  elsif v_dtype = 'fixed' then
    v_discount := least(greatest(v_dinput, 0), v_subtotal);
  else
    v_discount := 0;
    v_dtype := null;
  end if;
  v_total := greatest(0, v_subtotal - v_discount);

  insert into invoices (clinic_id, subtotal, discount, discount_type, total, cost_total, profit,
                        item_count, customer_name, customer_phone, pet_name, payment_method, staff_id, status)
  values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_cost, v_total - v_cost,
          round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
          nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''),
          nullif(p_meta->>'staff_id','')::uuid, 'paid')
  returning * into v_invoice;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty    := (it->>'qty')::numeric;
    -- Box-equivalent to remove from stock; the client computes the fraction for
    -- sub-unit sales (qty / units_per_box). Legacy/box rows fall back to qty.
    v_stockq := coalesce(nullif(it->>'stock_qty','')::numeric, v_qty);
    insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, unit_label)
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
      nullif(it->>'unit_label','')
    );
    if nullif(it->>'product_id','') is not null then
      update products set stock = greatest(0, stock - v_stockq)
      where id = (it->>'product_id')::uuid and clinic_id = v_clinic;
    end if;
  end loop;

  return v_invoice;
end $$;

-- REFUND (returns the box-equivalent to stock) -------------------------------
create or replace function refund_invoice(p_invoice uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_invoice invoices;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.status = 'refunded' then return v_invoice; end if;

  for r in select product_id, qty, stock_qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
    if r.product_id is not null then
      update products set stock = stock + coalesce(r.stock_qty, r.qty) where id = r.product_id and clinic_id = v_clinic;
    end if;
  end loop;

  update invoices set status = 'refunded', refunded_at = now()
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_invoice;
  return v_invoice;
end $$;

-- HARD DELETE (returns the box-equivalent unless already refunded) ------------
create or replace function delete_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_status text;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select status into v_status from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;

  if v_status is distinct from 'refunded' then
    for r in select product_id, qty, stock_qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
      if r.product_id is not null then
        update products set stock = stock + coalesce(r.stock_qty, r.qty) where id = r.product_id and clinic_id = v_clinic;
      end if;
    end loop;
  end if;

  delete from invoices where id = p_invoice and clinic_id = v_clinic;
end $$;
