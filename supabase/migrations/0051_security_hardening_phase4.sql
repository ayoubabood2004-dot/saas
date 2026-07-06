-- ============================================================================
-- doctorVet — 0051: Security hardening — Phase 4 (deep red-team follow-ups).
--
-- Closes what four adversarial passes found after 0049/0050:
--
--  A) LAST cross-tenant path: brute-forcing a leftover LEGACY short invite code
--     within its 24h window (+ an email_mismatch/invalid response oracle, + a
--     concurrent-redeem race). Fix: hard-expire every legacy short code NOW,
--     return one opaque error, and row-lock the invite on redeem.
--
--  B) INSIDER FRAUD via direct PostgREST writes: the invoices / invoice_items /
--     products policies were `for all` with NO role check, so any staff member
--     (even reception/groomer) could — with the public anon key — DELETE a sale,
--     zero a debt, forge revenue, or fabricate stock, bypassing the app's
--     (client-only) permission model. Fix: DB-enforce it — freeze the money
--     columns for non-managers, managers-only delete, inventory writes limited
--     to manager/vet, invoice_items writes to managers (the checkout RPC is
--     SECURITY DEFINER and bypasses RLS, so real sales are unaffected).
--
--  C) INTEGRITY: refund/delete double-restock race (concurrent calls credited
--     stock twice) → make the status flip atomic / lock the row. And a checkout
--     accepting negative qty/price/stock_qty → a NOT-VALID check constraint.
--
--  D) Money RPCs defaulted to PUBLIC execute → revoke from anon.
--
-- Additive, idempotent, and behaviour-preserving for the app's real flows.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- A) Invites: kill legacy short codes, opaque error, lock on redeem.
-- ---------------------------------------------------------------------------
-- Legacy codes are 'VET-'+6 chars (len 10); new 0050 codes are 'VET-'+32 (len 36).
-- Anything shorter than the new format is expired immediately (no 24h window).
update invites set expires_at = now()
  where status = 'pending' and length(code) < 20;

create or replace function accept_invite(p_code text default null, p_confirm boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_inv      invites;
  v_email    text := lower(coalesce((select email from auth.users where id = auth.uid()), ''));
  v_name     text;
  v_pname    text;
  v_is_owner boolean;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'error', 'not_authenticated');
  end if;

  -- Row-lock the matched invite so two concurrent redeems can't both consume a
  -- single code-only invite.
  select * into v_inv from invites
   where status = 'pending'
     and (expires_at is null or expires_at > now())
     and ( (p_code is not null and upper(code) = upper(p_code))
        or (p_code is null and email is not null and lower(email) = v_email) )
   order by created_at desc
   limit 1
   for update;

  if v_inv.id is null then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_used');
  end if;

  -- Email-locked invite redeemed by the wrong account: return the SAME opaque
  -- error as a miss, so the response can't be used to confirm a code is valid.
  if v_inv.email is not null and v_inv.email <> '' and lower(v_inv.email) <> v_email then
    return jsonb_build_object('ok', false, 'error', 'invalid_or_used');
  end if;

  select coalesce(full_name, email) into v_name from profiles where id = v_inv.clinic_id;

  v_is_owner := v_inv.clinic_id <> auth.uid() and (
       exists (select 1 from memberships where user_id = auth.uid() and clinic_id = auth.uid())
       or exists (select 1 from pets where clinic_id = auth.uid())
     );

  if v_is_owner and not coalesce(p_confirm, false) then
    return jsonb_build_object('ok', false, 'error', 'confirm_owner_join', 'clinic_name', v_name);
  end if;

  insert into memberships (user_id, clinic_id, role, status)
  values (auth.uid(), v_inv.clinic_id, v_inv.role, 'active')
  on conflict (user_id, clinic_id)
    do update set role = excluded.role, status = 'active';

  update invites
     set status = 'accepted', accepted_by = auth.uid(), accepted_at = now()
   where id = v_inv.id;

  v_pname := (select coalesce(nullif(full_name, ''), email) from profiles where id = auth.uid());
  update staff
     set status = 'active', user_id = auth.uid(),
         email = coalesce(nullif(email, ''), nullif(v_email, '')),
         name  = coalesce(nullif(v_pname, ''), nullif(email, ''), name),
         join_date = coalesce(join_date, current_date)
   where clinic_id = v_inv.clinic_id and invite_code = v_inv.code;

  if not found then
    insert into staff (clinic_id, user_id, name, email, role, status, invite_code, join_date)
    values (v_inv.clinic_id, auth.uid(),
            coalesce(nullif(v_pname, ''), nullif(v_email, ''), 'موظف'),
            nullif(v_email, ''), v_inv.role, 'active', v_inv.code, current_date);
  end if;

  return jsonb_build_object('ok', true, 'clinic_id', v_inv.clinic_id, 'role', v_inv.role, 'clinic_name', v_name);
end $$;
grant execute on function accept_invite(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- B) DB-enforced RBAC on the money/inventory tables.
--    (Real sales run through SECURITY DEFINER RPCs that bypass RLS, so these
--     policies only constrain DIRECT client writes.)
-- ---------------------------------------------------------------------------

-- invoices: everyone in the clinic reads; only managers create/delete; a
-- non-manager UPDATE may touch operational fields (payment method, contact) but
-- NOT the money columns — those must equal their stored values.
drop policy if exists invoices_clinic_all on invoices;
drop policy if exists invoices_select on invoices;
drop policy if exists invoices_insert on invoices;
drop policy if exists invoices_update on invoices;
drop policy if exists invoices_delete on invoices;

create policy invoices_select on invoices
  for select using (clinic_id = auth_clinic());

create policy invoices_insert on invoices
  for insert with check (clinic_id = auth_clinic() and auth_role() = 'manager');

create policy invoices_update on invoices
  for update
  using (clinic_id = auth_clinic())
  with check (
    clinic_id = auth_clinic()
    and (
      auth_role() = 'manager'
      or (
            total       is not distinct from (select i.total       from invoices i where i.id = invoices.id)
        and subtotal    is not distinct from (select i.subtotal    from invoices i where i.id = invoices.id)
        and discount    is not distinct from (select i.discount    from invoices i where i.id = invoices.id)
        and amount_paid is not distinct from (select i.amount_paid from invoices i where i.id = invoices.id)
        and cost_total  is not distinct from (select i.cost_total  from invoices i where i.id = invoices.id)
        and profit      is not distinct from (select i.profit      from invoices i where i.id = invoices.id)
        and item_count  is not distinct from (select i.item_count  from invoices i where i.id = invoices.id)
        and status      is not distinct from (select i.status      from invoices i where i.id = invoices.id)
      )
    )
  );

create policy invoices_delete on invoices
  for delete using (clinic_id = auth_clinic() and auth_role() = 'manager');

-- invoice_items: read within the clinic; direct writes managers-only (the
-- checkout RPC inserts them as definer, so normal sales are unaffected).
drop policy if exists invoice_items_clinic_all on invoice_items;
drop policy if exists invoice_items_select on invoice_items;
drop policy if exists invoice_items_write on invoice_items;

create policy invoice_items_select on invoice_items
  for select using (clinic_id = auth_clinic());

create policy invoice_items_write on invoice_items
  for all
  using      (clinic_id = auth_clinic() and auth_role() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role() = 'manager');

-- products: read within the clinic; inventory writes limited to manager + vet
-- (the two base roles that carry manageInventory), matching the app's UI gate.
drop policy if exists products_clinic_all on products;
drop policy if exists products_select on products;
drop policy if exists products_write on products;

create policy products_select on products
  for select using (clinic_id = auth_clinic());

create policy products_write on products
  for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

-- ---------------------------------------------------------------------------
-- C) Integrity: atomic refund/delete + non-negative line guard.
-- ---------------------------------------------------------------------------

-- refund: claim the row by flipping status atomically; only the winner restocks.
create or replace function refund_invoice(p_invoice uuid)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_invoice invoices;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  update invoices set status = 'refunded', refunded_at = now()
    where id = p_invoice and clinic_id = v_clinic and status is distinct from 'refunded'
    returning * into v_invoice;
  if not found then
    select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic;
    if not found then raise exception 'invoice not found'; end if;
    return v_invoice; -- already refunded → no double restock
  end if;
  for r in select product_id, qty, stock_qty from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
    if r.product_id is not null then
      update products set stock = stock + coalesce(r.stock_qty, r.qty) where id = r.product_id and clinic_id = v_clinic;
    end if;
  end loop;
  return v_invoice;
end $$;

-- delete: lock the row first so a concurrent delete blocks then finds nothing.
create or replace function delete_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_status text;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if auth_role() <> 'manager' then raise exception 'forbidden: managers only'; end if;
  select status into v_status from invoices where id = p_invoice and clinic_id = v_clinic for update;
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

-- Reject negative/zero cart lines regardless of caller. NOT VALID so the
-- migration never fails on pre-existing rows; it applies to all new writes.
do $$ begin
  alter table invoice_items
    add constraint invoice_items_nonneg
    check (qty > 0 and unit_price >= 0 and unit_cost >= 0 and coalesce(stock_qty, 0) >= 0) not valid;
exception when duplicate_object then null;
end $$;

-- ---------------------------------------------------------------------------
-- D) Money RPCs: revoke the default PUBLIC execute; grant only to authenticated.
-- ---------------------------------------------------------------------------
do $$
declare f text;
begin
  foreach f in array array[
    'retail_checkout(jsonb, jsonb)', 'pos_checkout(jsonb, jsonb)',
    'settle_invoice(uuid, numeric)', 'refund_invoice(uuid)',
    'delete_invoice(uuid)', 'bump_invoice_prints(uuid)'
  ] loop
    begin
      execute format('revoke execute on function %s from anon, public', f);
      execute format('grant execute on function %s to authenticated', f);
    exception when others then null; -- signature differs → skip
    end;
  end loop;
end $$;
