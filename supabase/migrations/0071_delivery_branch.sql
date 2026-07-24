-- ============================================================================
-- doctorVet — 0071: branch link for delivery orders.
--
-- Multi-branch clinics: a delivery order is stamped with the branch it was
-- dispatched from (NULL = main/unassigned, mirroring admissions.branch_id from
-- 0042), and the التوصيل board filters by the active branch like the rest of
-- the app. Additive + idempotent — safe on any existing database.
-- ============================================================================

alter table delivery_orders
  add column if not exists branch_id uuid references branches(id) on delete set null;

create index if not exists delivery_orders_branch_idx on delivery_orders(branch_id);
