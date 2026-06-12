-- ============================================================================
-- VetPassport — 0008: product categories + reorder level.
-- Idempotent. Apply AFTER 0007 (Supabase → SQL Editor → Run).
-- ============================================================================

alter table products add column if not exists category text
  check (category is null or category in ('medicine','food','accessories','consumables','other'));

-- Reorder level: stock at or below this triggers a low-stock warning.
alter table products add column if not exists min_stock integer not null default 0;
