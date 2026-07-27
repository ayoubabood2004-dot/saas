-- ============================================================================
-- 0076 — Supplier ledger (دفتر فواتير وديون المورّدين)
-- • purchases gains supplier_name / supplier_phone — who delivered the invoice.
-- • purchase_payments logs every settlement leg against a supplier invoice
--   (the running sum stays on purchases.amount_paid, these rows are history).
-- • settle_purchase RPC pays a debt atomically (payment row + header update).
-- • record_purchase re-created to store the supplier fields.
-- Additive & clinic-isolated; apply AFTER 0064 (purchases).
-- ============================================================================

alter table purchases add column if not exists supplier_name  text;
alter table purchases add column if not exists supplier_phone text;

create table if not exists purchase_payments (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  purchase_id uuid not null references purchases(id) on delete cascade,
  company_id  uuid references companies(id) on delete set null,
  amount      numeric(14,2) not null default 0,
  method      text,
  note        text,
  paid_at     timestamptz not null default now(),
  staff_id    uuid,
  created_at  timestamptz not null default now()
);

create index if not exists purchase_payments_purchase_idx on purchase_payments(purchase_id);
create index if not exists purchase_payments_clinic_idx   on purchase_payments(clinic_id, paid_at desc);

alter table purchase_payments enable row level security;

-- Same gate as purchases (0064): read within the clinic, write manager + vet.
drop policy if exists purchase_payments_select on purchase_payments;
drop policy if exists purchase_payments_write  on purchase_payments;
create policy purchase_payments_select on purchase_payments for select using (clinic_id = auth_clinic());
create policy purchase_payments_write  on purchase_payments for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

drop trigger if exists audit_all on purchase_payments;
create trigger audit_all after insert or update or delete on purchase_payments
  for each row execute function audit_change();

-- ----------------------------------------------------------------------------
-- settle_purchase — pay part/all of a supplier debt in one transaction:
-- clamp the amount to the remaining due, append a payment row, bump
-- amount_paid and re-derive status, and return the updated purchase.
-- ----------------------------------------------------------------------------
create or replace function settle_purchase(
  p_purchase uuid,
  p_amount   numeric,
  p_method   text default 'cash',
  p_note     text default null
) returns purchases language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_row    purchases;
  v_paid   numeric(14,2);
  v_due    numeric(14,2);
  v_amt    numeric(14,2);
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;

  select * into v_row from purchases where id = p_purchase and clinic_id = v_clinic for update;
  if not found then raise exception 'purchase not found'; end if;

  v_paid := coalesce(v_row.amount_paid, v_row.total);
  v_due  := greatest(0, v_row.total - v_paid);
  v_amt  := least(greatest(coalesce(p_amount, 0), 0), v_due);
  if v_amt <= 0 then raise exception 'nothing to settle'; end if;

  insert into purchase_payments (clinic_id, purchase_id, company_id, amount, method, note, staff_id)
  values (v_clinic, v_row.id, v_row.company_id, v_amt, nullif(p_method,''), nullif(p_note,''), auth.uid());

  update purchases set
    amount_paid = v_paid + v_amt,
    status      = case when v_paid + v_amt >= total then 'paid'
                       when v_paid + v_amt <= 0 then 'unpaid'
                       else 'partial' end
  where id = v_row.id
  returning * into v_row;

  return v_row;
end $$;

grant execute on function settle_purchase(uuid, numeric, text, text) to authenticated;

-- ----------------------------------------------------------------------------
-- record_purchase — re-created from 0064 with the two supplier columns added
-- to the header insert. Everything else is byte-identical to 0064.
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
                         amount_paid, payment_method, status, supplier_name, supplier_phone,
                         notes, purchased_at, staff_id)
  values (v_clinic, v_company, nullif(p_meta->>'company_name',''), nullif(p_meta->>'reference',''),
          round(v_total, 2), round(v_count)::int, v_paid, nullif(p_meta->>'payment_method',''), v_status,
          nullif(p_meta->>'supplier_name',''), nullif(p_meta->>'supplier_phone',''),
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
                            purchase_price, sell_price, stock, min_stock, expiry_date)
      values (v_clinic, v_company, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
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
