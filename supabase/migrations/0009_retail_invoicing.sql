-- ============================================================================
-- VetPassport — 0009: Retail & advanced invoicing.
-- Extends invoices with walk-in customer, discount, payment method, print
-- tracking and refund status. Adds RPCs for a richer checkout, refund (with
-- inventory restock), hard-delete (with restock) and print counting.
-- All clinic-isolated (clinic_id = auth.uid()). Apply AFTER 0001–0008.
-- ============================================================================

-- INVOICE COLUMNS ------------------------------------------------------------
alter table invoices add column if not exists customer_name  text;
alter table invoices add column if not exists customer_phone text;
alter table invoices add column if not exists subtotal       numeric(12,2) not null default 0;
alter table invoices add column if not exists discount       numeric(12,2) not null default 0;
alter table invoices add column if not exists discount_type  text;                              -- 'percent' | 'fixed' | null
alter table invoices add column if not exists payment_method text;                              -- 'cash' | 'card' | 'transfer' | null
alter table invoices add column if not exists print_count    integer       not null default 0;
alter table invoices add column if not exists status         text          not null default 'paid'; -- 'paid' | 'refunded'
alter table invoices add column if not exists refunded_at    timestamptz;

-- Existing rows had no discount: their subtotal equals their total.
update invoices set subtotal = total where subtotal = 0 and total <> 0;

-- RETAIL CHECKOUT ------------------------------------------------------------
-- Like pos_checkout but captures customer + discount + payment, and computes
-- the discount server-side so totals/profit can't be tampered with.
-- p_items: [{product_id,name,barcode,qty,unit_price,unit_cost}]
-- p_meta:  {customer_name,customer_phone,discount_type,discount_value,payment_method}
create or replace function retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth.uid();
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
                        item_count, customer_name, customer_phone, payment_method, status)
  values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_cost, v_total - v_cost,
          v_count, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
          nullif(p_meta->>'payment_method',''), 'paid')
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

-- REFUND ---------------------------------------------------------------------
-- Marks the invoice refunded and returns its units to stock (idempotent).
create or replace function refund_invoice(p_invoice uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth.uid();
  v_invoice invoices;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.status = 'refunded' then return v_invoice; end if;

  for r in select product_id, qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
    if r.product_id is not null then
      update products set stock = stock + r.qty where id = r.product_id and clinic_id = v_clinic;
    end if;
  end loop;

  update invoices set status = 'refunded', refunded_at = now()
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_invoice;
  return v_invoice;
end $$;

-- HARD DELETE ----------------------------------------------------------------
-- Admin "this was a mistake" removal. Restocks (unless already refunded), then
-- deletes the invoice; invoice_items cascade.
create or replace function delete_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth.uid();
  v_status text;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select status into v_status from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;

  if v_status is distinct from 'refunded' then
    for r in select product_id, qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
      if r.product_id is not null then
        update products set stock = stock + r.qty where id = r.product_id and clinic_id = v_clinic;
      end if;
    end loop;
  end if;

  delete from invoices where id = p_invoice and clinic_id = v_clinic;
end $$;

-- PRINT COUNTER --------------------------------------------------------------
create or replace function bump_invoice_prints(p_invoice uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth.uid(); v_count integer;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  update invoices set print_count = print_count + 1
  where id = p_invoice and clinic_id = v_clinic
  returning print_count into v_count;
  return coalesce(v_count, 0);
end $$;

-- GRANTS ---------------------------------------------------------------------
revoke all on function retail_checkout(jsonb, jsonb) from public, anon;
revoke all on function refund_invoice(uuid)          from public, anon;
revoke all on function delete_invoice(uuid)          from public, anon;
revoke all on function bump_invoice_prints(uuid)     from public, anon;
grant execute on function retail_checkout(jsonb, jsonb) to authenticated;
grant execute on function refund_invoice(uuid)          to authenticated;
grant execute on function delete_invoice(uuid)          to authenticated;
grant execute on function bump_invoice_prints(uuid)     to authenticated;
