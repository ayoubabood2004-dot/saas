-- ============================================================================
-- 0065 — Company sections (أصناف) — a group level inside a company
-- The middle level of Company → Section → Barcode. A clinic creates named
-- sections under a company, then files barcodes/products into a section. A
-- product links to at most one section via products.section_id (and that section
-- belongs to the product's company). Deleting a section keeps its products —
-- they just lose the link (ON DELETE SET NULL). Deleting a company cascades its
-- sections away and nulls the products' section link. Additive + clinic-isolated.
-- Apply AFTER 0063 (companies).
-- ============================================================================

create table if not exists company_sections (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  company_id  uuid not null references companies(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now()
);

create index if not exists company_sections_company_idx on company_sections(company_id, name);
create index if not exists company_sections_clinic_idx  on company_sections(clinic_id);

alter table company_sections enable row level security;
-- Read within the clinic; writes limited to manager + vet (manageInventory),
-- matching products_write (0051) and companies_write (0063).
drop policy if exists company_sections_select on company_sections;
drop policy if exists company_sections_write  on company_sections;
create policy company_sections_select on company_sections for select using (clinic_id = auth_clinic());
create policy company_sections_write  on company_sections for all
  using      (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'))
  with check (clinic_id = auth_clinic() and auth_role() in ('manager','veterinarian'));

-- Log to audit_log like every other clinic-scoped table.
drop trigger if exists audit_all on company_sections;
create trigger audit_all after insert or update or delete on company_sections
  for each row execute function audit_change();

-- Link a product to its section inside the company. Nullable; on section delete
-- the product stays, its section link is cleared.
alter table products add column if not exists section_id uuid
  references company_sections(id) on delete set null;

create index if not exists products_section_idx on products(section_id);
