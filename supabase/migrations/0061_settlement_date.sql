-- ============================================================================
-- doctorVet — 0061: date each debt settlement on the day it is collected.
--
-- Problem: settle_invoice appended a payment leg { method, amount } with no date,
-- so the money reports (Z-Report / سجل الحركات) attributed a settlement to the
-- ORIGINAL invoice day instead of the day the cash was actually received. When a
-- clinic collects an old debt today, it should show up in TODAY's movements.
--
-- Fix: append an `at` timestamp (now()) to the settlement leg. The original
-- checkout legs stay dateless and fall back to the invoice's own created_at, so
-- same-day sales are unaffected. Additive & idempotent — re-defines the function
-- only. Apply AFTER 0035.
-- ============================================================================

create or replace function settle_invoice(p_invoice uuid, p_amount numeric, p_method text default 'cash')
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_inv     invoices;
  v_add     numeric(14,2);
  v_details jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;

  v_add := least(greatest(coalesce(p_amount, 0), 0), v_inv.total - v_inv.amount_paid);
  if v_add > 0 then
    v_details := coalesce(v_inv.payment_details, '[]'::jsonb)
                 || jsonb_build_object(
                      'method', coalesce(nullif(p_method, ''), 'cash'),
                      'amount', v_add,
                      -- The collection timestamp: this is what dates the settlement on
                      -- its own day in the money reports.
                      'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
                    );
    update invoices
      set amount_paid     = v_inv.amount_paid + v_add,
          payment_details = v_details,
          -- Keep payment_method as the dominant (largest) leg — matches the demo adapter.
          payment_method  = (select e->>'method' from jsonb_array_elements(v_details) e
                             order by (e->>'amount')::numeric desc limit 1)
    where id = p_invoice and clinic_id = v_clinic
    returning * into v_inv;
  end if;

  return v_inv;
end $$;
