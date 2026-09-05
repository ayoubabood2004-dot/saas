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
-- مشغّلُ المنصّة: كاذبٌ افتراضاً كما بالإنتاج لغير المشغّل، ويُرفع بمفتاحٍ
-- يملكه الفحص — كي نفحص الحارسَ **والطريقَ المسموح** كليهما. ومفتاحٌ بجدولٍ
-- لا بإعدادِ جلسة: `set` يطبع وسمَه بمخرج psql فيلتصق بالنتيجة ويفسد المقارنة.
create table if not exists _dvtest_flags (admin boolean not null default false);
insert into _dvtest_flags (admin) select false where not exists (select 1 from _dvtest_flags);
create or replace function is_platform_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select admin from _dvtest_flags limit 1), false) $$;
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
create table if not exists staff (id uuid primary key default gen_random_uuid(), clinic_id uuid, name text);
create table if not exists products (id uuid primary key default gen_random_uuid(), clinic_id uuid, stock numeric(14,3) default 0, name text, barcode text);
create table if not exists invoices (id uuid primary key default gen_random_uuid(), clinic_id uuid, created_at timestamptz not null default now());
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
create table if not exists generated_barcodes (id uuid primary key default gen_random_uuid(), product_id uuid references products(id) on delete set null);
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

-- شكلُ ما تلمسه 0144 (دمج التوائم): أعمدةُ المنتج التي تُجمع أو تُقارَن، ومفاتيحُ
-- الفواتير التي تُعاد إلى الأصل. بدونها لا يُفحص الدمج، وما لا يُفحص لا يُصدَّق.
alter table products add column if not exists pooled      boolean not null default false;
-- 0146: «رجّع كل قطعة لمكانها» (0117) يقرأ الصنفَ والشركة ويطبّع بدالّتي 0117.
alter table products add column if not exists section_id  uuid;
alter table products add column if not exists company_id  uuid;
alter table products add column if not exists created_at  timestamptz not null default now();
alter table generated_barcodes add column if not exists clinic_id uuid;
create or replace function inv_norm_code(t text) returns text language sql immutable
as $$ select regexp_replace(translate(coalesce(t,''), '٠١٢٣٤٥٦٧٨٩', '0123456789'), '\s', '', 'g') $$;
create or replace function inv_norm_name(t text) returns text language sql immutable
as $$ select lower(regexp_replace(coalesce(t,''), '\s+', '', 'g')) $$;
alter table products add column if not exists min_stock   numeric;
alter table products add column if not exists expiry_date date;
alter table purchase_items add column if not exists product_id uuid references products(id) on delete set null;

-- شكلُ ما تلمسه 0142: الدورةُ بحالتها وشهرها، والقسيمةُ بدفعها ومصروفها،
-- ودالّتا الصلاحية من 0112. بدونها لا تنزل الهجرة أصلاً، وما لا ينزل لا يُفحص.
alter table payroll_runs add column if not exists clinic_id uuid;
alter table payroll_runs add column if not exists period    date;
alter table payroll_runs add column if not exists status    text default 'draft';
alter table payroll_runs add column if not exists paid_at   timestamptz;
alter table payslips     add column if not exists clinic_id  uuid;
alter table payslips     add column if not exists run_id     uuid references payroll_runs(id);
alter table payslips     add column if not exists paid_at    timestamptz;
alter table payslips     add column if not exists pay_method text;
alter table payslips     add column if not exists expense_id uuid;

create or replace function payroll_is_admin() returns boolean
language sql stable as $$ select coalesce((select admin from _dvtest_flags limit 1), true) $$;

create or replace function payroll_my_staff_ids() returns setof uuid
language sql stable as $$ select id from staff where false $$;
create table if not exists staff_loan_events (id uuid primary key default gen_random_uuid(), clinic_id uuid);

create table if not exists invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid references invoices(id), clinic_id uuid, product_id uuid references products(id) on delete set null,
  name text, barcode text, qty numeric(14,3), unit_price numeric(14,2), unit_cost numeric(14,2),
  line_total numeric(14,2), stock_qty numeric(14,3), pooled_qty numeric(14,3), unit_label text
);
-- 0144: سطرُ الفاتورة يشير إلى منتجٍ — الدمج يعيده إلى الأصل قبل حذف النسخة.
alter table invoice_items  add column if not exists product_id uuid references products(id) on delete set null;

-- قيد 0051 كما هو بالإنتاج — تصلّحه 0131
do $ii$ begin
  alter table invoice_items add constraint invoice_items_nonneg
    check (qty > 0 and unit_price >= 0 and unit_cost >= 0 and coalesce(stock_qty,0) >= 0) not valid;
exception when duplicate_object then null; end $ii$;

create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null default auth_clinic(),
  amount numeric not null check (amount > 0),
  description text not null, category text,
  method text not null default 'cash' check (method in ('cash','card','bank')),
  staff_id uuid default auth.uid(),
  created_at timestamptz not null default now(),
  spent_at timestamptz not null default now()
);

create or replace function credit_stock(p_product uuid, p_qty numeric, p_clinic uuid)
returns void language plpgsql security definer set search_path = public as $cs$
begin
  if p_product is null or coalesce(p_qty,0) <= 0 then return; end if;
  update products set stock = round(coalesce(stock,0) + p_qty, 3)
   where id = p_product and clinic_id = p_clinic;
end $cs$;

-- أعمدة الفاتورة كما بالإنتاج، حتى تشتغل retail_checkout الحقيقية عليها
alter table invoices add column if not exists subtotal      numeric(14,2) not null default 0;
alter table invoices add column if not exists discount      numeric(14,2) not null default 0;
alter table invoices add column if not exists discount_type text;
alter table invoices add column if not exists cost_total    numeric(12,2) not null default 0;
alter table invoices add column if not exists profit        numeric(12,2) not null default 0;
alter table invoices add column if not exists item_count    integer not null default 0;
alter table invoices add column if not exists customer_name text;
alter table invoices add column if not exists customer_phone text;
alter table invoices add column if not exists pet_name      text;
alter table invoices add column if not exists payment_method text;
alter table invoices add column if not exists payment_details jsonb;
alter table invoices add column if not exists staff_id      uuid;
alter table invoices add column if not exists notes         text;
alter table invoices add column if not exists status        text not null default 'paid';

create or replace function deduct_stock_pooled(p_product uuid, p_qty numeric, p_clinic uuid)
returns numeric language plpgsql security definer set search_path = public as $ds$
begin
  update products set stock = round(coalesce(stock,0) - p_qty, 3)
   where id = p_product and clinic_id = p_clinic;
  return 0;
end $ds$;

-- سياسةٌ تحرس مبالغ الفاتورة (نظير invoices_update بالإنتاج): غيرُ المدير
-- لا يغيّر المبالغ. تعتمد على أعمدة numeric — فهي بالضبط ما منع التوسيع
-- هناك، ولم يكن مختبرُنا يغطّيه.
alter table invoices add column if not exists total       numeric(12,2) not null default 0;
alter table invoices add column if not exists amount_paid numeric(14,2) not null default 0;
alter table invoices add column if not exists refunded_at timestamptz;

-- 0148: التوصيل (0069) كما بالإنتاج — سواق/شركات وطلبات، وتسديد الفاتورة (0061).
create table if not exists couriers (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references auth.users(id) default auth_clinic(),
  name text not null, phone text, note text, active boolean not null default true, created_at timestamptz not null default now());
create table if not exists delivery_orders (
  id uuid primary key default gen_random_uuid(), clinic_id uuid not null references auth.users(id) default auth_clinic(),
  invoice_id uuid not null references invoices(id) on delete cascade, courier_id uuid references couriers(id) on delete set null,
  customer_name text, cod_amount numeric(14,2) not null default 0, prepaid numeric(14,2) not null default 0,
  status text not null default 'preparing', created_at timestamptz not null default now(),
  dispatched_at timestamptz, delivered_at timestamptz, returned_at timestamptz);
create index if not exists delivery_orders_courier_idx on delivery_orders(courier_id);
-- كما بالإنتاج (0069): RLS مفعّلة. بلاها كانت سياساتُ 0157 تُنشأ بلا أثر، فمرّت
-- سياسةٌ تستعلم من جدولها بالحزمة وأسقطت كلَّ تحديثٍ بالإنتاج (0159).
alter table delivery_orders enable row level security;
drop policy if exists delivery_orders_select on delivery_orders;
create policy delivery_orders_select on delivery_orders for select using (clinic_id = auth_clinic());
create or replace function settle_invoice(p_invoice uuid, p_amount numeric, p_method text default 'cash')
returns invoices language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_inv invoices; v_add numeric(14,2); v_details jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;
  v_add := least(greatest(coalesce(p_amount, 0), 0), v_inv.total - v_inv.amount_paid);
  if v_add > 0 then
    v_details := coalesce(v_inv.payment_details, '[]'::jsonb)
      || jsonb_build_object('method', coalesce(nullif(p_method, ''), 'cash'), 'amount', v_add, 'at', now());
    update invoices set amount_paid = v_inv.amount_paid + v_add, payment_details = v_details
     where id = p_invoice and clinic_id = v_clinic returning * into v_inv;
  end if;
  return v_inv;
end $$;
create policy invoices_update on invoices for update
  using (clinic_id = (select auth_clinic()))
  with check (
    clinic_id = (select auth_clinic())
    and ((select auth_role()) = 'manager'
         or (not (total is distinct from (select i.total from invoices i where i.id = invoices.id))
             and not (amount_paid is distinct from (select i.amount_paid from invoices i where i.id = invoices.id))))
  );

create table if not exists clinic_prefs (
  clinic_id uuid primary key, catalog_share boolean not null default false
);
alter table products add column if not exists barcode text;
alter table products add column if not exists name text;
alter table products add column if not exists sell_price numeric(12,2) default 0;
alter table products add column if not exists purchase_price numeric(12,2) default 0;
create or replace view shared_catalog_source as
  select p.barcode, p.name, p.sell_price, p.purchase_price, p.clinic_id
  from products p join clinic_prefs cp on cp.clinic_id = p.clinic_id
  where cp.catalog_share = true and p.barcode is not null and p.barcode <> ''
    and p.name is not null and btrim(p.name) <> '';

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

-- عيادةُ الفحوص موجودةٌ بـauth.users: بالإنتاج `clinic_id` هو معرّفُ مالكِ
-- العيادة نفسه، وجداولٌ عدّة تشير إليه بمفتاحٍ أجنبيّ. المخطّط كان يزرع
-- منتجاتٍ وعضوياتٍ بمعرّفٍ لا وجود له بالجدول الأصل — فمرّت لأن جداولها بلا
-- مفتاح، حتى جاء جدولٌ بمفتاحٍ فانكشف النقص. نسدّه هنا لا بإسقاط المفتاح.
insert into auth.users(id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222')
on conflict do nothing;

-- 0151: لوحةُ المنصّة — الجداولُ التي تقرأها platform_pulse/activity/logins كما بالإنتاج.
alter table staff add column if not exists user_id uuid;
alter table clinic_prefs add column if not exists clinic_name text;
alter table staff_presence add column if not exists clinic_id uuid;
alter table staff_presence add column if not exists last_seen timestamptz not null default now();
create table if not exists staff_elevations (user_id uuid primary key, clinic_id uuid not null, until timestamptz not null);
create table if not exists login_events (
  id bigint generated always as identity primary key, clinic_id uuid not null, user_id uuid,
  email text, name text, created_at timestamptz not null default now());
create table if not exists subscriptions (
  clinic_id uuid primary key, plan text, period text, trial_ends_at timestamptz,
  current_period_end timestamptz, was_subscriber boolean not null default false);
-- مشغّلُ الفحص — حسابٌ ثالث لا عيادةَ له.
insert into auth.users(id) values ('33333333-3333-3333-3333-333333333333') on conflict do nothing;
alter table auth.users add column if not exists email text;
