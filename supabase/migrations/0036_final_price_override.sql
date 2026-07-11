-- ============================================================================
-- doctorVet — 0036: flexible final price (markup or discount).
--
-- retail_checkout now honors an optional p_meta.final_total: the cashier-set price
-- to charge outright. It becomes the invoice total directly and MAY EXCEED the cart
-- subtotal (a markup / rounding-up / service fee) — the old code always clamped the
-- total at or below subtotal, which silently dropped any markup. The recorded
-- discount is greatest(0, subtotal - final_total); a markup records zero discount and
-- a higher profit. Amount received above the total is treated as change on the client
-- (amount_paid is still clamped to the total here). Re-defined on top of 0035 —
-- fractional sales, split payments and credit/amount_paid all preserved.
-- Additive & idempotent. Apply AFTER 0035.
-- ============================================================================

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
    -- Cashier-set final price wins; it may be above (markup) or below (discount) subtotal.
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

  -- Amount received today (a shortfall = credit; overpayment is change, never above total).
  v_paid := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);

  insert into invoices (clinic_id, subtotal, discount, discount_type, total, amount_paid, cost_total, profit,
                        item_count, customer_name, customer_phone, pet_name, payment_method, payment_details, staff_id, status)
  values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_paid, v_cost, v_total - v_cost,
          round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
          nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''), v_details,
          nullif(p_meta->>'staff_id','')::uuid, 'paid')
  returning * into v_invoice;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty    := (it->>'qty')::numeric;
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
