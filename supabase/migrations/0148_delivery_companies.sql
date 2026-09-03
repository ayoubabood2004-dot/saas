-- ============================================================================
-- ٠١٤٨ — شركاتُ التوصيل: ذمّةٌ تُحصَّل بعد حين، كاملةً أو على دفعات
--
-- ── الحاجة ───────────────────────────────────────────────────────────────
-- السائقُ يرجع بالمساء ويسلّم النقد، فالطلبُ «مستلم» والفلوس تدخل الصندوق
-- بضغطةٍ واحدة (0069). أما شركةُ التوصيل فتسلّم الزبونَ اليوم وتحاسب العيادة
-- بعد أسبوعٍ أو شهر، وربما على دفعات. الجدولُ القديم لا يفرّق: «استلمنا
-- الفلوس» كان الطريقَ الوحيد لإغلاق الطلب، فإمّا يُسجَّل نقدٌ لم يصل، أو
-- يبقى الطلب «بالطريق» شهراً.
--
-- ── النموذج ──────────────────────────────────────────────────────────────
--   • couriers.kind: 'driver' (سائق — يسلّم النقدَ فوراً) أو 'company'.
--   • delivery_orders.collected_at: متى وصل نقدُ هذا الطلب فعلاً. للسائق =
--     لحظةُ الاستلام؛ لطلبات الشركة يبقى فارغاً حتى تُحاسِب.
--   • courier_settlements: كلُّ تحصيلٍ من شركة — المبلغ والطريقة والملاحظة،
--     وأيُّ الطلبات سُدّدت به (allocations).
--   • courier_settle(): يوزّع المبلغَ على طلبات الشركة المسلَّمة غير المحصَّلة
--     الأقدمَ فالأقدم، عبر settle_invoice **نفسها** — فالمالُ يدخل بتاريخ
--     وصوله ويظهر بتقارير اليوم، ولا طريقَ ماليٍّ جديد.
--
-- الطلباتُ المسلَّمة القديمة كانت تُسدَّد لحظةَ الاستلام، فتُختم collected_at
-- بتاريخ تسليمها — لا ذمّةٌ تُخترع بأثرٍ رجعيّ. إضافيّ ويُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

alter table couriers add column if not exists kind text not null default 'driver';
do $c$ begin
  alter table couriers add constraint couriers_kind_chk check (kind in ('driver','company'));
exception when duplicate_object then null; end $c$;

alter table delivery_orders add column if not exists collected_at timestamptz;
update delivery_orders set collected_at = coalesce(collected_at, delivered_at, now())
 where status = 'delivered' and collected_at is null;
create index if not exists delivery_orders_uncollected_idx
  on delivery_orders(courier_id, delivered_at) where status = 'delivered' and collected_at is null;

create table if not exists courier_settlements (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  courier_id  uuid not null references couriers(id) on delete cascade,
  amount      numeric not null check (amount > 0),
  method      text not null default 'cash',
  note        text,
  allocations jsonb not null default '[]',
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
create index if not exists courier_settlements_courier_idx on courier_settlements(courier_id, created_at desc);
create index if not exists courier_settlements_clinic_idx  on courier_settlements(clinic_id, created_at desc);

alter table courier_settlements enable row level security;
drop policy if exists courier_settlements_read on courier_settlements;
create policy courier_settlements_read on courier_settlements for select
  using (clinic_id = (select auth_clinic()));
-- لا سياسةَ كتابة: كلُّ تحصيلٍ من الدالّة، فلا مبلغَ بلا توزيعٍ على طلبات.

create or replace function courier_settle(p_courier uuid, p_amount numeric, p_method text default 'cash', p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_c      couriers;
  v_left   numeric := round(coalesce(p_amount, 0), 2);
  v_paid   numeric := 0;
  v_due    numeric;
  v_pay    numeric;
  v_n      int := 0;
  v_alloc  jsonb := '[]'::jsonb;
  v_owed   numeric;
  o        record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_left <= 0 then raise exception 'amount must be positive'; end if;
  select * into v_c from couriers where id = p_courier and clinic_id = v_clinic for update;
  if v_c.id is null then raise exception 'courier not found'; end if;

  for o in
    select d.id, d.invoice_id from delivery_orders d
     where d.clinic_id = v_clinic and d.courier_id = p_courier
       and d.status = 'delivered' and d.collected_at is null
     order by d.delivered_at nulls last, d.created_at
     for update
  loop
    select round(total - amount_paid, 2) into v_due from invoices
     where id = o.invoice_id and clinic_id = v_clinic and status <> 'refunded';
    if v_due is null or v_due <= 0 then
      -- سُدّدت من مكانٍ آخر (سجلّ الديون مثلاً) — تُختم ولا تُحسب.
      update delivery_orders set collected_at = now() where id = o.id;
      continue;
    end if;
    exit when v_left <= 0;
    v_pay := least(v_due, v_left);
    perform settle_invoice(o.invoice_id, v_pay, coalesce(nullif(p_method, ''), 'cash'));
    if v_pay >= v_due - 0.005 then
      update delivery_orders set collected_at = now() where id = o.id;
    end if;
    v_alloc := v_alloc || jsonb_build_object('order_id', o.id, 'invoice_id', o.invoice_id, 'amount', v_pay);
    v_left := round(v_left - v_pay, 2);
    v_paid := round(v_paid + v_pay, 2);
    v_n := v_n + 1;
  end loop;

  if v_paid <= 0 then raise exception 'nothing to collect'; end if;

  insert into courier_settlements (clinic_id, courier_id, amount, method, note, allocations)
  values (v_clinic, p_courier, v_paid, coalesce(nullif(p_method, ''), 'cash'), nullif(btrim(p_note), ''), v_alloc);

  select coalesce(sum(round(i.total - i.amount_paid, 2)), 0) into v_owed
    from delivery_orders d join invoices i on i.id = d.invoice_id
   where d.clinic_id = v_clinic and d.courier_id = p_courier
     and d.status = 'delivered' and d.collected_at is null and i.status <> 'refunded';

  return jsonb_build_object('settled', v_paid, 'orders', v_n, 'unallocated', v_left, 'remaining_owed', v_owed);
end $$;
revoke all on function courier_settle(uuid, numeric, text, text) from public, anon;
grant execute on function courier_settle(uuid, numeric, text, text) to authenticated;
