-- ============================================================================
-- doctorVet — 0035: credit / pay-later sales (نظام الديون والآجل).
--
-- A sale can now be saved even if the client pays less than the total (or nothing
-- today). invoices gains amount_paid — the cumulative amount received so far. A
-- sale is a live debt while amount_paid < total (and it isn't refunded); the
-- balance due is simply total - amount_paid.
--
-- retail_checkout (re-defined on top of 0034 — split payments preserved) now stores
-- amount_paid from p_meta. settle_invoice(p_invoice, p_amount, p_method) records a
-- later installment: it adds to amount_paid (never above the total) and appends a
-- payment leg, so payment_details stays a full history and the Z-Report/pie reflect
-- installments automatically. Additive & idempotent. Apply AFTER 0034.
-- ============================================================================

alter table invoices add column if not exists amount_paid numeric(14,2) not null default 0;

-- Backfill: every pre-existing sale was settled in full under the old (paid-only) flow.
update invoices set amount_paid = total where amount_paid = 0 and total > 0;

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

  if v_dtype = 'percent' then
    v_discount := round(v_subtotal * least(greatest(v_dinput, 0), 100) / 100.0, 2);
  elsif v_dtype = 'fixed' then
    v_discount := least(greatest(v_dinput, 0), v_subtotal);
  else
    v_discount := 0;
    v_dtype := null;
  end if;
  v_total := greatest(0, v_subtotal - v_discount);
  -- Amount received today: default to paid-in-full; a shortfall becomes a credit sale,
  -- an overpayment is clamped to the total.
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

-- SETTLE A DEBT INSTALLMENT ---------------------------------------------------
-- Adds p_amount to amount_paid (clamped so it never exceeds the total) and appends
-- a payment leg. Returns the updated invoice. Refunded invoices cannot be settled.
create or replace function settle_invoice(p_invoice uuid, p_amount numeric, p_method text default 'cash')
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_inv    invoices;
  v_add    numeric(14,2);
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;

  v_add := least(greatest(coalesce(p_amount, 0), 0), v_inv.total - v_inv.amount_paid);
  if v_add > 0 then
    update invoices
      set amount_paid     = v_inv.amount_paid + v_add,
          payment_details = coalesce(v_inv.payment_details, '[]'::jsonb)
                            || jsonb_build_object('method', coalesce(nullif(p_method, ''), 'cash'), 'amount', v_add)
    where id = p_invoice and clinic_id = v_clinic
    returning * into v_inv;
  end if;

  return v_inv;
end $$;
