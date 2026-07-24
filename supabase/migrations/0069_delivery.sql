-- ============================================================================
-- doctorVet — 0069: Delivery module (التوصيل — الدفع عند الاستلام).
--
-- Two clinic-isolated tables:
--   • couriers        — the clinic's permanent driver/company registry (سجل السواق).
--   • delivery_orders — one row per COD order, wrapping a retail invoice.
--
-- Money model: the order's invoice is created by the EXISTING checkout with
-- amount_paid = the prepaid portion (often 0), so stock is deducted atomically
-- at dispatch while revenue stays out of the day's numbers. When the courier
-- hands the cash over, the EXISTING settle_invoice RPC records it (stamped with
-- the collection time, so money reports date it on the day it actually arrived)
-- and the order flips to 'delivered'. A returned order refunds the invoice via
-- the EXISTING refund_invoice (pooled-stock-aware restock) and flips to
-- 'returned'. No new money paths — the proven ones are reused.
--
-- Additive + idempotent — safe on any existing database.
-- ============================================================================

create table if not exists couriers (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  name        text not null,
  phone       text,
  note        text,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists couriers_clinic_idx on couriers(clinic_id, name);

alter table couriers enable row level security;
drop policy if exists couriers_select on couriers;
drop policy if exists couriers_write on couriers;

create policy couriers_select on couriers
  for select using (clinic_id = auth_clinic());

-- Writes limited to manager + vet (the roles that manage retail configuration).
create policy couriers_write on couriers
  for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

drop trigger if exists audit_all on couriers;
create trigger audit_all after insert or update or delete on couriers
  for each row execute function audit_change();

-- ----------------------------------------------------------------------------

create table if not exists delivery_orders (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null references auth.users(id) default auth_clinic(),
  invoice_id     uuid not null references invoices(id) on delete cascade,
  courier_id     uuid references couriers(id) on delete set null,
  customer_name  text,
  customer_phone text,
  address        text,
  note           text,
  -- Collected from the customer at the door ON TOP of the goods total.
  delivery_fee   numeric(14,2) not null default 0,
  -- true → the fee is clinic revenue (it was added to the invoice as a service
  -- line, so it's part of cod_amount); false → the courier keeps the fee.
  fee_to_clinic  boolean not null default false,
  -- What the courier owes the clinic on return = the invoice's due at creation.
  cod_amount     numeric(14,2) not null default 0,
  -- Paid in the clinic before dispatch (already inside the invoice's amount_paid).
  prepaid        numeric(14,2) not null default 0,
  status         text not null default 'preparing'
                 check (status in ('preparing','out','delivered','returned')),
  created_at     timestamptz not null default now(),
  dispatched_at  timestamptz,
  delivered_at   timestamptz,
  returned_at    timestamptz
);

create index if not exists delivery_orders_clinic_idx  on delivery_orders(clinic_id, status, created_at desc);
create index if not exists delivery_orders_invoice_idx on delivery_orders(invoice_id);
create index if not exists delivery_orders_courier_idx on delivery_orders(courier_id);

alter table delivery_orders enable row level security;
drop policy if exists delivery_orders_select on delivery_orders;
drop policy if exists delivery_orders_write on delivery_orders;

create policy delivery_orders_select on delivery_orders
  for select using (clinic_id = auth_clinic());

-- Receptionists dispatch orders and record hand-overs too — any clinic staff
-- role may write, mirroring invoices themselves (the money mutations still go
-- through the guarded settle/refund RPCs).
create policy delivery_orders_write on delivery_orders
  for all
  using      (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

drop trigger if exists audit_all on delivery_orders;
create trigger audit_all after insert or update or delete on delivery_orders
  for each row execute function audit_change();
