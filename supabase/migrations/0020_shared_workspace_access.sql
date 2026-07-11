-- ============================================================================
-- doctorVet — 0020: shared-workspace data access for team members.
--
-- THE PROBLEM: invited staff could log in but saw NO patients / inventory, and
-- anything they created vanished. Two backend causes:
--
--   (A) auth_clinic() picked the EARLIEST membership by created_at. A user who
--       is both an (old) clinic account AND staff elsewhere resolved to their
--       OWN (empty) clinic instead of the clinic that invited them — the exact
--       opposite of what the app's frontend does (it prefers the invited clinic).
--
--   (B) Every clinic-scoped table still DEFAULTED clinic_id to auth.uid() (the
--       personal user id) — set back in 0006. So when a receptionist created a
--       pet, the row was stamped with the RECEPTIONIST's id, which (1) failed the
--       RLS with_check (clinic_id = auth_clinic()) and was rejected, or (2) became
--       invisible to the rest of the team.
--
-- THE FIX (non-destructive, idempotent):
--   1. auth_clinic() now PREFERS the clinic you were invited to (clinic_id <>
--      your own id), matching the frontend. Managers/legacy accounts are
--      unchanged (they only have a self-membership → still their own id).
--   2. clinic_id now DEFAULTS to auth_clinic() on every clinic-scoped table, so
--      any staff member's inserts are tied to the shared clinic automatically.
--   3. An OPTIONAL, guarded backfill recovers rows a staff member created during
--      the broken window (stamped with their personal id) — see the bottom.
--
-- Apply AFTER 0001–0019 (Supabase → SQL Editor → Run). Existing single-account
-- clinics behave EXACTLY as before.
-- ============================================================================

-- 1) auth_clinic(): prefer the clinic you were INVITED to over your own. ------
create or replace function auth_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    -- (a) a clinic you joined as staff (clinic_id is someone else's id)
    (select clinic_id from memberships
       where user_id = auth.uid() and status = 'active' and clinic_id <> auth.uid()
       order by created_at limit 1),
    -- (b) otherwise your own clinic (manager / legacy self-membership)
    (select clinic_id from memberships
       where user_id = auth.uid() and status = 'active'
       order by created_at limit 1),
    -- (c) no membership at all → legacy single-account behaviour
    auth.uid()
  );
$$;
grant execute on function auth_clinic() to authenticated, anon;

-- 2) Stamp NEW rows with the SHARED clinic, not the personal user id. ---------
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'pets','weight_logs','vaccinations','media_items','medical_visits',
    'treatment_entries','admissions','products','invoices','invoice_items',
    'appointments','reminders'
  ]
  loop
    if to_regclass(tbl) is not null then
      execute format('alter table %I alter column clinic_id set default auth_clinic()', tbl);
    end if;
  end loop;
end $$;

-- 2b) POS RPCs operated on auth.uid() (the personal id) — so a staff member's
--     checkout/refund ran against an EMPTY product set and stamped invoices with
--     their own id. Redefine them to use the SHARED clinic (auth_clinic()).
create or replace function pos_checkout(p_items jsonb) returns invoices
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
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
    for r in select product_id, qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
      if r.product_id is not null then
        update products set stock = stock + r.qty where id = r.product_id and clinic_id = v_clinic;
      end if;
    end loop;
  end if;

  delete from invoices where id = p_invoice and clinic_id = v_clinic;
end $$;

create or replace function bump_invoice_prints(p_invoice uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_count integer;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  update invoices set print_count = print_count + 1
  where id = p_invoice and clinic_id = v_clinic
  returning print_count into v_count;
  return coalesce(v_count, 0);
end $$;

-- ============================================================================
-- 3) OPTIONAL recovery — re-home rows a staff member created BEFORE this fix.
--
--    These got stamped with the staff member's personal id. We move them to the
--    clinic that staff member belongs to. GUARDED so it ONLY touches users who
--    are PURELY staff (they have an invited membership and NO self-membership),
--    so an independent clinic's own data is never moved.
--
--    First DIAGNOSE (read-only) — how many such rows exist per table:
--
--    select 'pets' as t, count(*) from pets p
--      join memberships m on m.user_id = p.clinic_id and m.clinic_id <> m.user_id
--      and m.status='active'
--      where not exists (select 1 from memberships s
--                        where s.user_id=m.user_id and s.clinic_id=s.user_id);
--
--    Then, if the counts look right, run the backfill:
-- ----------------------------------------------------------------------------
do $$
declare tbl text;
begin
  foreach tbl in array array[
    'pets','weight_logs','vaccinations','media_items','medical_visits',
    'treatment_entries','admissions','products','invoices','invoice_items',
    'appointments','reminders'
  ]
  loop
    if to_regclass(tbl) is not null then
      execute format($f$
        update %1$s t
           set clinic_id = m.clinic_id
          from memberships m
         where m.user_id = t.clinic_id
           and m.clinic_id <> m.user_id          -- an invited (non-self) membership
           and m.status = 'active'
           and t.clinic_id <> m.clinic_id
           and not exists (                        -- ...and NOT an independent clinic
             select 1 from memberships s
              where s.user_id = m.user_id and s.clinic_id = s.user_id)
      $f$, tbl);
    end if;
  end loop;
end $$;

-- ============================================================================
-- VERIFY (run as the invited staff member, e.g. via the app):
--   select auth_clinic();                  -- must equal the MANAGER's clinic id
--   select count(*) from pets;             -- must now show the clinic's patients
-- ============================================================================
