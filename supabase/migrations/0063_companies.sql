-- ============================================================================
-- 0063 — Companies (الشركات) — inventory grouping
-- A "company" is a supplier/brand section inside inventory. The clinic creates a
-- company (naming it whatever they like), then files barcodes/products under it.
-- A product links to at most one company via products.company_id. Deleting a
-- company keeps its products — they simply lose the (now-gone) link
-- (ON DELETE SET NULL), so no stock is ever lost. Additive + clinic-isolated —
-- nothing existing changes.
-- ============================================================================

create table if not exists companies (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  name        text not null,
  note        text,
  created_at  timestamptz not null default now()
);

create index if not exists companies_clinic_idx on companies(clinic_id, name);

alter table companies enable row level security;
drop policy if exists companies_clinic_all on companies;
create policy companies_clinic_all on companies for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());

-- Link a product to its company. Nullable; on company delete the product stays,
-- its link is cleared.
alter table products add column if not exists company_id uuid
  references companies(id) on delete set null;

create index if not exists products_company_idx on products(company_id);
