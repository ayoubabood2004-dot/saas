-- ============================================================================
-- doctorVet — 0030: record the cashier / sales rep on each invoice.
--
-- invoices gains staff_id (the staff member who made the sale), set from the POS
-- "موظف المبيعات / الكاشير" dropdown. Optional/nullable; vital for future staff
-- performance reports. retail_checkout now persists it from p_meta.
-- Clinic-isolated by existing RLS. Additive & idempotent. Apply AFTER 0029.
-- ============================================================================

alter table invoices add column if not exists staff_id uuid;

create or replace function retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  it         jsonb;
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_count    integer := 0;
  v_dtype    text    := nullif(p_meta->>'discount_type','');
  v_dinput   numeric(12,2) := coalesce(nullif(p_meta->>'discount_value','')::numeric, 0);
  v_discount numeric(12,2) := 0;
  v_total    numeric(12,2);
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_subtotal := v_subtotal + (it->>'qty')::int * (it->>'unit_price')::numeric;
    v_cost     := v_cost     + (it->>'qty')::int * (it->>'unit_cost')::numeric;
    v_count    := v_count    + (it->>'qty')::int;
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
          v_count, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
          nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''),
          nullif(p_meta->>'staff_id','')::uuid, 'paid')
  returning * into v_invoice;

  for it in select * from jsonb_array_elements(p_items) loop
    insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total)
    values (
      v_invoice.id, v_clinic,
      nullif(it->>'product_id','')::uuid,
      coalesce(it->>'name', 'Item'),
      it->>'barcode',
      (it->>'qty')::int,
      (it->>'unit_price')::numeric,
      (it->>'unit_cost')::numeric,
      (it->>'qty')::int * (it->>'unit_price')::numeric
    );
    if nullif(it->>'product_id','') is not null then
      update products set stock = greatest(0, stock - (it->>'qty')::int)
      where id = (it->>'product_id')::uuid and clinic_id = v_clinic;
    end if;
  end loop;

  return v_invoice;
end $$;
