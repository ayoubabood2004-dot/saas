-- ============================================================================
-- doctorVet — 0052: clinic expenses ledger (سجل المصروفات).
--
-- Money-OUT records: supply purchases, utilities, rent, salaries, petty cash…
-- Append-only financial ledger, clinic-isolated the same way pet_notes (0037)
-- is: clinic_id defaults to auth_clinic() and every policy pins it to the
-- caller's clinic. Because an expense directly reduces reported profit and has
-- NO SECURITY DEFINER RPC in front of it (unlike invoices, whose real writes go
-- through the checkout RPC), the DIRECT client write IS the only path — so, in
-- the spirit of 0051's anti-insider-fraud hardening, recording and deleting are
-- gated to managers. The gate uses the elevation-aware auth_role() (not
-- auth_role_base()), so a Manager-Override PIN elevation (0048) can record an
-- expense too — expenses are an ordinary money operation, not a role-defining
-- write, so base-role gating (reserved for memberships/staff/invites in 0050)
-- is not needed here.
--
-- The audit_change() trigger (0018) is attached for full INSERT/UPDATE/DELETE
-- coverage, matching how 0044 wires every financial table into the activity log.
--
-- Additive & idempotent. Apply AFTER 0051.
-- ============================================================================

create table if not exists expenses (
  id          uuid primary key default gen_random_uuid(),
  -- Standard tenant stamp: same shape/mechanism as pet_notes.clinic_id (0037).
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  amount      numeric not null check (amount > 0),
  description text not null,
  category    text,                                   -- nullable: free-form bucket
  -- The acting/attributed staff member. Soft reference only (no hard FK to
  -- staff) so recording an expense never fails when the actor has no staff row —
  -- same reasoning as pet_notes.author_id. Auto-stamped for accountability.
  staff_id    uuid default auth.uid(),
  created_at  timestamptz not null default now(),     -- when it was recorded
  spent_at    timestamptz not null default now()      -- when the money actually left
);

-- Newest-first listing per clinic (required composite) + a spent_at variant for
-- date-of-spend financial reports.
create index if not exists expenses_clinic_created_idx on expenses(clinic_id, created_at desc);
create index if not exists expenses_clinic_spent_idx   on expenses(clinic_id, spent_at desc);

-- ---------------------------------------------------------------------------
-- RLS. SELECT is open to any clinic member (consistent with the invoices /
-- invoice_items / products SELECT policies in 0051, and so expenses surface in
-- financial reports). Recording + deleting are managers-only via the
-- elevation-aware auth_role().
--
-- No UPDATE policy → the ledger is append-only; to correct an entry a manager
-- deletes and re-adds it (every step lands in the activity log). Add a
-- manager-gated UPDATE policy here if in-place edits are ever needed.
--
-- (To instead let ANY clinic member record an expense — e.g. front-desk petty
--  cash — while keeping deletion managers-only, replace the expenses_insert
--  WITH CHECK with just `clinic_id = auth_clinic()`.)
-- ---------------------------------------------------------------------------
alter table expenses enable row level security;

drop policy if exists expenses_select on expenses;
create policy expenses_select on expenses
  for select using (clinic_id = auth_clinic());

drop policy if exists expenses_insert on expenses;
create policy expenses_insert on expenses
  -- staff_id is pinned to the caller so a hand-crafted API insert can't forge the
  -- attribution onto another staff member (it defaults to auth.uid() anyway).
  for insert with check (clinic_id = auth_clinic() and auth_role() = 'manager' and staff_id = auth.uid());

drop policy if exists expenses_delete on expenses;
create policy expenses_delete on expenses
  for delete using (clinic_id = auth_clinic() and auth_role() = 'manager');

-- ---------------------------------------------------------------------------
-- Activity log: full INSERT/UPDATE/DELETE coverage via the shared, defensive
-- audit_change() trigger (0018) — attached the same idempotent way as every
-- financial table in 0044. The trigger swallows its own errors, so logging can
-- never block or slow an expense write. audit_change() reads clinic_id straight
-- off the row, so the clinic scoping in the log is automatic.
-- ---------------------------------------------------------------------------
do $$ begin
  if to_regclass('expenses') is not null then
    execute 'drop trigger if exists audit_all on expenses';
    execute 'create trigger audit_all after insert or update or delete on expenses for each row execute function audit_change()';
  end if;
end $$;
