-- ============================================================================
-- VetPassport — 0007: Inventory & Point-of-Sale.
-- products / invoices / invoice_items, each isolated per clinic (clinic_id =
-- the clinic's auth.users id, auto-stamped). Apply AFTER 0001–0006.
-- ============================================================================

-- PRODUCTS -------------------------------------------------------------------
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references auth.users(id) default auth.uid(),
  barcode text,
  name text not null,
  purchase_price numeric(12,2) not null default 0,
  sell_price numeric(12,2) not null default 0,
  stock integer not null default 0,
  expiry_date date,
  created_at timestamptz not null default now()
);
create index if not exists products_clinic_idx on products(clinic_id);
-- A barcode is unique within a clinic (fast scan lookup, no overwrites).
create unique index if not exists products_clinic_barcode_idx
  on products(clinic_id, barcode) where barcode is not null;

-- INVOICES -------------------------------------------------------------------
create table if not exists invoices (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references auth.users(id) default auth.uid(),
  total numeric(12,2) not null default 0,       -- revenue
  cost_total numeric(12,2) not null default 0,  -- cost of goods
  profit numeric(12,2) not null default 0,      -- total - cost_total
  item_count integer not null default 0,        -- units sold
  created_at timestamptz not null default now()
);
create index if not exists invoices_clinic_idx on invoices(clinic_id);

-- INVOICE ITEMS --------------------------------------------------------------
create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references invoices(id) on delete cascade,
  clinic_id uuid not null references auth.users(id) default auth.uid(),
  product_id uuid references products(id) on delete set null,
  name text not null,          -- snapshot at sale time
  barcode text,
  qty integer not null default 1,
  unit_price numeric(12,2) not null default 0,
  unit_cost numeric(12,2) not null default 0,
  line_total numeric(12,2) not null default 0
);
create index if not exists invoice_items_invoice_idx on invoice_items(invoice_id);
create index if not exists invoice_items_clinic_idx on invoice_items(clinic_id);

-- STRICT RLS — a clinic only ever sees its own inventory & sales ------------
alter table products enable row level security;
alter table invoices enable row level security;
alter table invoice_items enable row level security;

drop policy if exists products_clinic_all on products;
create policy products_clinic_all on products for all
  using (clinic_id = auth.uid()) with check (clinic_id = auth.uid());

drop policy if exists invoices_clinic_all on invoices;
create policy invoices_clinic_all on invoices for all
  using (clinic_id = auth.uid()) with check (clinic_id = auth.uid());

drop policy if exists invoice_items_clinic_all on invoice_items;
create policy invoice_items_clinic_all on invoice_items for all
  using (clinic_id = auth.uid()) with check (clinic_id = auth.uid());

-- ATOMIC CHECKOUT ------------------------------------------------------------
-- One transaction: create the invoice + its items and decrement stock. Totals
-- and profit are computed server-side so they can't be tampered with.
-- p_items: [{product_id, name, barcode, qty, unit_price, unit_cost}]
create or replace function pos_checkout(p_items jsonb) returns invoices
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth.uid();
  v_invoice invoices;
  it jsonb;
  v_total numeric(12,2) := 0;
  v_cost  numeric(12,2) := 0;
  v_count integer := 0;
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

revoke all on function pos_checkout(jsonb) from public, anon;
grant execute on function pos_checkout(jsonb) to authenticated;
