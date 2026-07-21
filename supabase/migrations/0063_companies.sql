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
-- Read within the clinic; writes limited to manager + vet (the roles that carry
-- manageInventory), matching products_write in 0051 so a receptionist cannot
-- create/rename/delete a company (and thus cannot indirectly null a product's
-- company_id via the ON DELETE SET NULL link below).
drop policy if exists companies_clinic_all on companies;
drop policy if exists companies_select on companies;
drop policy if exists companies_write on companies;

create policy companies_select on companies
  for select using (clinic_id = auth_clinic());

create policy companies_write on companies
  for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

-- Mirror every other clinic-scoped table: log INSERT/UPDATE/DELETE to audit_log
-- (the manager سجل الحركات), so company activity is captured in production the
-- same way the demo adapter records it.
drop trigger if exists audit_all on companies;
create trigger audit_all after insert or update or delete on companies
  for each row execute function audit_change();

-- Link a product to its company. Nullable; on company delete the product stays,
-- its link is cleared.
alter table products add column if not exists company_id uuid
  references companies(id) on delete set null;

create index if not exists products_company_idx on products(company_id);
