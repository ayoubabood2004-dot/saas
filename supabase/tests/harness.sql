-- محاكاة بيئة سوبابيس بالقدر الذي تحتاجه هجرات 0125–0128
create schema if not exists auth;
create table if not exists auth.users (id uuid primary key);

create or replace function auth.uid() returns uuid
language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
create or replace function auth.jwt() returns jsonb
language sql stable as $$ select '{}'::jsonb $$;

do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;

-- ملفّات ودالّات الهوية كما هي بالنظام
create table if not exists profiles (id uuid primary key, role text, roles text[]);
create table if not exists memberships (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, clinic_id uuid, role text, status text, created_at timestamptz default now()
);

create or replace function auth_clinic() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select clinic_id from memberships where user_id = auth.uid() and status = 'active' order by created_at limit 1),
    auth.uid());
$$;
create or replace function auth_role() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from memberships where user_id = auth.uid() and status='active' order by created_at limit 1), 'manager');
$$;
create or replace function is_clinic_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles p where p.id = auth.uid() and p.role in ('doctor','reception','admin'));
$$;
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$ select false $$;
create or replace function has_permission(cap text) returns boolean
language sql stable security definer set search_path = public as $$ select true $$;

-- الجداول التي تلمسها الموجة
create table if not exists pets (
  id uuid primary key default gen_random_uuid(),
  name text, owner_id uuid, clinic_id uuid default auth.uid(),
  serial text, passport_token text unique, shared_with_clinic boolean,
  created_at timestamptz default now()
);
create unique index if not exists pets_serial_idx on pets(serial) where serial is not null;

create table if not exists clinics (id uuid primary key default gen_random_uuid());
create table if not exists companies (id uuid primary key default gen_random_uuid());
create table if not exists staff (id uuid primary key default gen_random_uuid(), clinic_id uuid);
create table if not exists products (id uuid primary key default gen_random_uuid(), clinic_id uuid);
create table if not exists invoices (id uuid primary key default gen_random_uuid(), clinic_id uuid);
create table if not exists medical_visits (id uuid primary key default gen_random_uuid(), pet_id uuid references pets(id), clinic_id uuid);
create table if not exists appointments (id uuid primary key default gen_random_uuid(), clinic_id uuid references clinics(id), scheduled_at timestamptz);
create table if not exists reminders (id uuid primary key default gen_random_uuid(), clinic_id uuid references clinics(id));
create table if not exists purchases (id uuid primary key default gen_random_uuid());
create table if not exists purchase_items (id uuid primary key default gen_random_uuid(), clinic_id uuid, purchase_id uuid references purchases(id));
create table if not exists staff_presence (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users(id));
create table if not exists surgeries (id uuid primary key default gen_random_uuid(), visit_id uuid references medical_visits(id));
create table if not exists purchase_payments (id uuid primary key default gen_random_uuid(), company_id uuid references companies(id));
create table if not exists lab_device_links (id uuid primary key default gen_random_uuid(), token text unique);
create index if not exists lab_device_links_token_idx on lab_device_links(token);
create table if not exists lab_device_inbox (id uuid primary key default gen_random_uuid(), link_id uuid references lab_device_links(id));
create table if not exists generated_barcodes (id uuid primary key default gen_random_uuid(), product_id uuid references products(id));
create table if not exists store_orders (id uuid primary key default gen_random_uuid(), invoice_id uuid references invoices(id));
create table if not exists journeys (id uuid primary key default gen_random_uuid(), pet_id uuid references pets(id), status text);
create index if not exists journeys_pet_idx on journeys(pet_id) where status = 'active';
create table if not exists wa_accounts (id uuid primary key default gen_random_uuid());
create table if not exists wa_inbox (id uuid primary key default gen_random_uuid(), account_id uuid references wa_accounts(id));
create table if not exists payroll_runs (id uuid primary key default gen_random_uuid());
create table if not exists staff_recurring (id uuid primary key default gen_random_uuid(), staff_id uuid references staff(id));
create table if not exists payslips (id uuid primary key default gen_random_uuid(), staff_id uuid references staff(id));
create table if not exists payslip_lines (id uuid primary key default gen_random_uuid(), clinic_id uuid);
create table if not exists staff_loans (id uuid primary key default gen_random_uuid(), staff_id uuid references staff(id));
create table if not exists staff_loan_events (id uuid primary key default gen_random_uuid(), clinic_id uuid);

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  clinic_id uuid, actor uuid, action text, entity text, entity_id text,
  details jsonb, created_at timestamptz not null default now()
);
create index if not exists audit_clinic_idx on audit_log(clinic_id, created_at desc);

-- سياسات بنفس أشكال النظام الحقيقي، بنداءات عارية
alter table pets enable row level security;
alter table medical_visits enable row level security;
alter table profiles enable row level security;
alter table invoices enable row level security;

create policy pets_clinic_all on pets for all
  using (clinic_id = auth_clinic()) with check (clinic_id = auth_clinic());
create policy pets_owner on pets for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy pets_shared_read on pets for select
  using (clinic_id is null and shared_with_clinic is true and is_clinic_staff());
create policy visits_owner on medical_visits for all
  using (exists (select 1 from pets p where p.id = medical_visits.pet_id and p.owner_id = auth.uid()))
  with check (exists (select 1 from pets p where p.id = medical_visits.pet_id and p.owner_id = auth.uid()));
create policy visits_clinic_all on medical_visits for all
  using (clinic_id = auth_clinic()) with check (clinic_id = auth_clinic());
create policy profiles_self_select on profiles for select using (id = auth.uid());
create policy profiles_self_insert on profiles for insert with check (id = auth.uid());
create policy invoices_perm on invoices for all
  using (clinic_id = auth_clinic() and has_permission('pos.sell'))
  with check (clinic_id = auth_clinic() and has_permission('pos.sell'));
