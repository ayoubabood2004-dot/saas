-- ============================================================================
-- 0064 — Purchases (المشتريات) — restocking from a company
-- A purchase invoice records goods RECEIVED from a supplier company. Saving one
-- bulk-updates inventory in a single atomic RPC:
--   • an existing barcode  → its product's stock += qty and prices refresh
--   • a new barcode        → a new product is created under the company
-- and stores a printable purchase record (+ its received lines). Additive &
-- clinic-isolated; nothing existing changes. Apply AFTER 0063 (companies).
-- ============================================================================

create table if not exists purchases (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references auth.users(id) default auth_clinic(),
  company_id     uuid references companies(id) on delete set null,
  company_name   text,                       -- snapshot (survives company rename/delete)
  reference      text,                       -- supplier's own invoice number
  total          numeric(14,2) not null default 0,
  item_count     integer not null default 0, -- total units received
  amount_paid    numeric(14,2),              -- paid to supplier so far (null = paid in full)
  payment_method text,
  status         text not null default 'paid' check (status in ('paid','partial','unpaid')),
  notes          text,
  purchased_at   timestamptz not null default now(),
  staff_id       uuid,
  created_at     timestamptz not null default now()
);

create table if not exists purchase_items (
  id             uuid primary key default gen_random_uuid(),
  purchase_id    uuid not null references purchases(id) on delete cascade,
  clinic_id      uuid not null references auth.users(id) default auth_clinic(),
  product_id     uuid references products(id) on delete set null,
  barcode        text,
  name           text not null,
  category       text,
  qty            numeric(14,3) not null default 0,
  purchase_price numeric(12,2) not null default 0,
  sell_price     numeric(12,2) not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists purchases_clinic_idx      on purchases(clinic_id, purchased_at desc);
create index if not exists purchases_company_idx      on purchases(company_id);
create index if not exists purchase_items_purchase_idx on purchase_items(purchase_id);
create index if not exists purchase_items_product_idx  on purchase_items(product_id);

alter table purchases      enable row level security;
alter table purchase_items enable row level security;

-- Read within the clinic; writes limited to manager + vet (manageInventory), the
-- same gate as products_write (0051) and companies_write (0063). Direct writes
-- are rarely used — the record_purchase RPC below does the real work.
drop policy if exists purchases_select on purchases;
drop policy if exists purchases_write  on purchases;
create policy purchases_select on purchases for select using (clinic_id = auth_clinic());
create policy purchases_write  on purchases for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

drop policy if exists purchase_items_select on purchase_items;
drop policy if exists purchase_items_write  on purchase_items;
create policy purchase_items_select on purchase_items for select using (clinic_id = auth_clinic());
create policy purchase_items_write  on purchase_items for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

-- Log to audit_log (the manager سجل الحركات) like every other clinic-scoped table.
drop trigger if exists audit_all on purchases;
create trigger audit_all after insert or update or delete on purchases
  for each row execute function audit_change();
drop trigger if exists audit_all on purchase_items;
create trigger audit_all after insert or update or delete on purchase_items
  for each row execute function audit_change();

-- ----------------------------------------------------------------------------
-- record_purchase — one atomic transaction: resolve/restock each line, create
-- the purchase + its items, and return the purchase. Mirrors retail_checkout's
-- shape (security definer so the inventory writes run under the RPC).
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

  -- Totals first (so status can be derived before the header insert).
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

    -- No explicit product? Match an existing one by barcode within the clinic.
    if v_pid is null and nullif(it->>'barcode','') is not null then
      select id into v_pid from products
       where clinic_id = v_clinic and barcode = it->>'barcode'
       limit 1;
    end if;

    if v_pid is not null then
      -- Restock an existing product: add qty, refresh prices, fill blanks.
      update products set
        stock          = greatest(0, coalesce(stock, 0) + v_qty),
        purchase_price = v_cost,
        sell_price     = v_sell,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company)
      where id = v_pid and clinic_id = v_clinic;
    else
      -- A brand-new barcode becomes a new product under this company.
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
