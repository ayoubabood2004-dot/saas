-- ============================================================================
-- 0264 — الدولار (م١): موادّ مسعّرة بالدولار، ودَينٌ بالدولار، وتسديدٌ بالدينار بسعر اليوم
--
-- الطلب (المالك، ٧–٨/١١ — docs/usd-plan.md، والقراراتُ الثمانية أقرّها كما أوصت الخطة): عيادةٌ بمكتب جملة تبيع بالدولار
-- وبالدَّين، والدولارُ يتغيّر كلَّ يوم، والزبونُ يسدّد بالدينار بسعر يوم التسديد أو بسعرٍ متّفق.
--
-- الجذرُ الذي يُبنى عليه: كلُّ قارئ مالٍ بالنظام يقرأ أعمدةَ الدينار نفسها (`total`، `amount_paid`، سِيَقُ `payment_details`).
-- فلا يتغيّر معنى عمودٍ قائم:
--  • الفاتورةُ الدولارية فاتورةٌ عاديّة **بالدينار بسعر يوم البيع** — وبجانبها `currency='USD'` و`fx_rate` و`total_usd`
--    و`paid_usd`: مصدرُ الدَّين. فكلُّ تقريرٍ قائم يراها صحيحةً بلا تعديل.
--  • البيعُ يمرّ من `retail_checkout` **كما هي** (المخزونُ والتكرارُ والكادر من دالّةٍ مفحوصة لا نسخة): `usd_checkout` تحسب
--    الدينارَ بنفسها من سعر القاعدة — لا من الجهاز — ثمّ تختم الأعمدةَ الدولارية والكلفةَ بالدولار.
--  • التسديدُ يقسم ما دخل الدرج: *حصّةُ الفاتورة* بنسبتها المخزّنة (وحين يُغلقها: باقي الدينار بالضبط — فتُغلق بالعملتين)،
--    و*فرقُ الصرف* ساقٌ ثانية معلَّمة `kind:'fx'` لا تدخل `amount_paid`. فالدرجُ والجيوبُ وتقاريرُ القبض (تجمع السِيَق) تراه
--    بلا مسّ؛ و«الباقي» (`amount_paid`) لا يتغيّر به.
--  • **بابٌ واحد**: محفّزٌ يرفض أيَّ كتابةِ مالٍ على فاتورةٍ دولارية ما لم تفتحه دالّةٌ دولارية (`doctorvet.usd_door`، محلّيٌّ
--    للمعاملة) — فالتسديدُ بالدينار والتصحيحُ والخصمُ والمرتجعُ والتعديلُ والإلغاءُ تُرفض بكلمةٍ عربية، ولو من جهازٍ قديم.
--    ومادّةٌ دولارية بفاتورةٍ دينارية تُرفض كذلك (لا تُباع بسعر دينارٍ قديم بصمت).
--  • قارئتان تُعدَّلان معلَنتين (بحارس الانجراف على جسميهما الحاليّين): `receipt_legs` (الربحُ المحقَّق: ساقُ الفرق ربحُها كلُّها)
--    و`report_pnl` (سطر «فرق سعر الصرف»).
--
-- مطفأةٌ لكلّ عيادة (`clinic_prefs.usd_enabled`)، وإضافيّةٌ كلُّها: الواجهةُ القديمة تعمل عليها كما هي. وتُعاد بلا أثرٍ ثانٍ.
-- تراجع (الواجهةُ أوّلاً): أطفئ المفتاحَ؛ ثمّ إن لزم — أعِد receipt_legs/report_receipts_*/report_pnl من 0149/0256،
--   drop trigger invoices_usd_door on invoices; drop trigger invoice_items_usd_door on invoice_items;
--   drop function usd_checkout/settle_invoice_usd/void_usd_settlement/delete_usd_invoice/fx_rate_set/_usd_*;
--   والأعمدةُ والجدولان يبقون ولا يضرّون (الفواتيرُ الدولارية المسجّلة تبقى مقروءةً بالدينار).
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) الحارس: الدوالُّ التي تُعاد هنا بجسمها الحاليّ (بصمةُ الشِفرة بلا تعليق ولا مسافة — 0252) ──────────────
select public._drift_assert('public.receipt_legs()', '8ecc58ceb25815277ce491cbd103043f', '-- +0264');
select public._drift_assert('public.report_receipts_daily(timestamptz,timestamptz,text)', '727b360076ee0bef661d59ad8ece01f5', '-- +0264');
select public._drift_assert('public.report_receipts_total(timestamptz,timestamptz)', '842f7919f7633856efdfaf7ac25e9c48', '-- +0264');
select public._drift_assert('public.report_pnl(timestamptz,timestamptz,text)', 'ede01413b921832eb57c7637e8199b96', '-- +0264');
select public._drift_assert('public._price_scope_products(uuid,jsonb)', 'ef0312bc1f924e0ef12b19680bec0159', '-- +0264');

-- ── ١) المفتاح والتقريب ───────────────────────────────────────────────────────────────────────────────
alter table public.clinic_prefs add column if not exists usd_enabled boolean not null default false;
-- قرار ٥: التحويلُ لأقرب ٢٥٠ دينار (عادةُ السوق)؛ والفرقُ الصغير يدخل «فرق الصرف» فلا يضيع.
alter table public.clinic_prefs add column if not exists usd_round_step integer not null default 250;
alter table public.clinic_prefs drop constraint if exists clinic_prefs_usd_round_step;
alter table public.clinic_prefs add constraint clinic_prefs_usd_round_step check (usd_round_step in (1, 50, 100, 250, 500, 1000));

-- ── ٢) سعرُ الصرف: إضافةٌ فقط — التصحيحُ سطرٌ جديد، والتاريخُ كلُّه يبقى ─────────────────────────────────────────
create table if not exists public.clinic_fx_rates (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  -- دينار للدولار الواحد. الحدّان يمسكان الخلطَ بين «سعر ١٠٠ دولار» و«سعر الدولار»: ١٤٦٠ صحيح، ١٤٫٦ و١٤٦٬٠٠٠ لا.
  rate        numeric(14,4) not null check (rate >= 100 and rate <= 100000),
  note        text check (char_length(coalesce(note, '')) <= 200),
  set_by      uuid default auth.uid(),
  -- clock_timestamp لا now(): «آخرُ سعر» بالترتيب، وسعران بمعاملةٍ واحدة يتشاركان now() فيصير الأخيرُ قرعةً بالمعرّف.
  created_at  timestamptz not null default clock_timestamp()
);
alter table public.clinic_fx_rates alter column created_at set default clock_timestamp();
create index if not exists clinic_fx_rates_clinic on public.clinic_fx_rates (clinic_id, created_at desc);
alter table public.clinic_fx_rates enable row level security;
drop policy if exists clinic_fx_rates_read on public.clinic_fx_rates;
create policy clinic_fx_rates_read on public.clinic_fx_rates for select using (clinic_id = (select auth_clinic()));
revoke all on table public.clinic_fx_rates from public, anon, authenticated;
grant select on table public.clinic_fx_rates to authenticated;
select public.photographer_fence_table('clinic_fx_rates');

-- ── ٣) المادّة والفاتورة وأسطرُها ───────────────────────────────────────────────────────────────────────
alter table public.products add column if not exists price_currency text not null default 'IQD';
alter table public.products add column if not exists sell_price_usd numeric(14,2);
alter table public.products add column if not exists purchase_price_usd numeric(14,2);
alter table public.products drop constraint if exists products_usd_ok;
-- م١: المادّةُ الدولارية بلا وزنٍ ولا وحدةٍ فرعية ولا حوضٍ ولا كراتين — كلُّها أسعارٌ مشتقّة تُصمَّم بالدولار في م٢.
alter table public.products add constraint products_usd_ok check (
  price_currency in ('IQD', 'USD')
  and (sell_price_usd is null or sell_price_usd >= 0)
  and (purchase_price_usd is null or purchase_price_usd >= 0)
  and (price_currency = 'IQD' or (
        not coalesce(sold_by_weight, false) and not coalesce(has_sub_unit, false) and not coalesce(pooled, false)
        and coalesce(jsonb_array_length(case when jsonb_typeof(packs) = 'array' then packs end), 0) = 0)));

alter table public.invoices add column if not exists currency text not null default 'IQD';
alter table public.invoices add column if not exists fx_rate numeric(14,4);
alter table public.invoices add column if not exists total_usd numeric(14,2);
alter table public.invoices add column if not exists paid_usd numeric(14,2);
alter table public.invoices add column if not exists discount_usd numeric(14,2);
alter table public.invoices drop constraint if exists invoices_usd_ok;
alter table public.invoices add constraint invoices_usd_ok check (
  currency in ('IQD', 'USD')
  and (currency = 'IQD' or (fx_rate > 0 and total_usd >= 0 and paid_usd >= 0 and paid_usd <= total_usd)));

alter table public.invoice_items add column if not exists unit_price_usd numeric(14,2);
alter table public.invoice_items add column if not exists unit_cost_usd numeric(14,2);

-- ── ٤) التسديدات بالدولار: مصدرُ وصل التسديد وإلغائه ─────────────────────────────────────────────────────────
create table if not exists public.usd_settlements (
  id           uuid primary key default gen_random_uuid(),
  clinic_id    uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  invoice_id   uuid not null references public.invoices(id) on delete cascade,
  usd          numeric(14,2) not null check (usd > 0),
  rate         numeric(14,4) not null check (rate > 0),
  rate_note    text check (char_length(coalesce(rate_note, '')) <= 200),
  received     numeric(14,2) not null,   -- ما دخل الدرجَ بالدينار
  share        numeric(14,2) not null,   -- حصّةُ الفاتورة (تدخل amount_paid)
  fx           numeric(14,2) not null,   -- received − share: ربحٌ (+) أو خسارة (−) فرق صرف
  method       text not null check (method in ('cash', 'card', 'transfer')),
  at           timestamptz not null default now(),
  by_user      uuid default auth.uid(),
  client_ref   text,
  voided_at    timestamptz,
  voided_by    uuid,
  void_reason  text check (char_length(coalesce(void_reason, '')) <= 200)
);
create index if not exists usd_settlements_invoice on public.usd_settlements (invoice_id);
create index if not exists usd_settlements_clinic on public.usd_settlements (clinic_id, at desc);
create unique index if not exists usd_settlements_ref on public.usd_settlements (clinic_id, client_ref) where client_ref is not null;
alter table public.usd_settlements enable row level security;
drop policy if exists usd_settlements_read on public.usd_settlements;
create policy usd_settlements_read on public.usd_settlements for select using (clinic_id = (select auth_clinic()));
revoke all on table public.usd_settlements from public, anon, authenticated;
grant select on table public.usd_settlements to authenticated;
select public.photographer_fence_table('usd_settlements');

-- ── ٥) الحسابُ الصِّرف — مرآتُه src/lib/usdMath.ts، ويطابقهما usd-parity حالةً بحالة ───────────────────────────
-- دولار × سعر ⇒ دينار، لأقرب خطوة (نصفٌ للأعلى؛ والمبالغُ موجبةٌ هنا كلُّها).
create or replace function public._usd_iqd(p_usd numeric, p_rate numeric, p_step integer) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(p_step, 1) <= 1 then round(p_usd * p_rate, 0)
              else round(p_usd * p_rate / p_step, 0) * p_step end
$$;
-- «سعر ١٠٠ دولار» (كما يقوله السوق) ⇒ سعرُ الدولار الواحد بأربع منازل.
create or replace function public._usd_rate_of(p_per100 numeric) returns numeric
language sql immutable set search_path = public as $$
  select round(p_per100 / 100.0, 4)
$$;
-- حصّةُ الفاتورة بالدينار لتسديد p_usd: بنسبتها المخزّنة (total ÷ total_usd) لا بسعرها، ولا تتجاوز باقيها؛
-- وحين يُغلقها التسديدُ (p_usd = باقي الدولار) هي باقي الدينار بالضبط — فالإغلاقُ بالعملتين معاً مهما تراكم التقريب.
create or replace function public._usd_share(p_usd numeric, p_due_usd numeric, p_due_iqd numeric, p_total_usd numeric, p_total_iqd numeric)
returns numeric language sql immutable set search_path = public as $$
  select case
           when p_usd >= p_due_usd then greatest(p_due_iqd, 0)
           when coalesce(p_total_usd, 0) <= 0 then 0
           else least(greatest(round(p_usd * p_total_iqd / p_total_usd, 0), 0), greatest(p_due_iqd, 0))
         end
$$;
revoke all on function public._usd_iqd(numeric, numeric, integer) from public, anon;
revoke all on function public._usd_rate_of(numeric) from public, anon;
revoke all on function public._usd_share(numeric, numeric, numeric, numeric, numeric) from public, anon;
grant execute on function public._usd_iqd(numeric, numeric, integer) to authenticated;
grant execute on function public._usd_rate_of(numeric) to authenticated;
grant execute on function public._usd_share(numeric, numeric, numeric, numeric, numeric) to authenticated;

-- العيادةُ مفعّلة؟ وما سعرُها الآن وخطوتُها؟
create or replace function public._usd_ctx(p_clinic uuid, out enabled boolean, out rate_id uuid, out rate numeric, out rate_at timestamptz, out step integer)
language sql stable security definer set search_path = public as $$
  select coalesce((select cp.usd_enabled from clinic_prefs cp where cp.clinic_id = p_clinic), false),
         r.id, r.rate, r.created_at,
         coalesce((select cp.usd_round_step from clinic_prefs cp where cp.clinic_id = p_clinic), 250)
    from (select 1) one
    left join lateral (select x.id, x.rate, x.created_at from clinic_fx_rates x
                        where x.clinic_id = p_clinic order by x.created_at desc, x.id desc limit 1) r on true
$$;
revoke all on function public._usd_ctx(uuid) from public, anon, authenticated;

-- ── ٦) البابُ الواحد ─────────────────────────────────────────────────────────────────────────────────────
create or replace function public._usd_door_open() returns boolean
language sql stable set search_path = public as $$
  select coalesce(current_setting('doctorvet.usd_door', true), '') = 'on'
$$;

create or replace function public.invoices_usd_door() returns trigger
language plpgsql set search_path = public as $$
begin
  if _usd_door_open() then return coalesce(new, old); end if;
  if tg_op = 'INSERT' then
    if new.currency = 'USD' then
      raise exception 'usd_door' using errcode = 'P0001', hint = 'فاتورةُ الدولار تنسجل من بيع الدولار وحده.';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.currency = 'USD' then
      raise exception 'usd_door' using errcode = 'P0001',
        hint = 'فاتورةُ الدولار تنحذف من زرّها («حذف فاتورة الدولار») — بعد إلغاء تسديداتها.';
    end if;
    return old;
  end if;
  -- UPDATE: المالُ وحده محروس — الاسمُ والملاحظةُ والحيوانُ يتعدّلون كما بأيّ فاتورة.
  if (old.currency = 'USD' or new.currency is distinct from old.currency)
     and (new.currency, new.fx_rate, new.total_usd, new.paid_usd, new.discount_usd,
          new.total, new.subtotal, new.discount, new.discount_type, new.amount_paid, new.payment_details,
          new.forgiven, new.status, new.cost_total, new.profit, new.item_count)
         is distinct from
         (old.currency, old.fx_rate, old.total_usd, old.paid_usd, old.discount_usd,
          old.total, old.subtotal, old.discount, old.discount_type, old.amount_paid, old.payment_details,
          old.forgiven, old.status, old.cost_total, old.profit, old.item_count) then
    raise exception 'usd_door' using errcode = 'P0001',
      hint = 'هاي فاتورة دولار — تسديدُها وإلغاءُ تسديدها من «تسديد الدولار»؛ والخصمُ والمرتجعُ والتعديلُ عليها بالمرحلة الجاية.';
  end if;
  return new;
end $$;
drop trigger if exists invoices_usd_door on public.invoices;
create trigger invoices_usd_door before insert or update or delete on public.invoices
  for each row execute function public.invoices_usd_door();

create or replace function public.invoice_items_usd_door() returns trigger
language plpgsql set search_path = public as $$
declare v_cur text; v_pc text;
begin
  if _usd_door_open() then return new; end if;
  select currency into v_cur from invoices where id = new.invoice_id;
  if tg_op = 'INSERT' then
    if v_cur = 'USD' then
      raise exception 'usd_door' using errcode = 'P0001', hint = 'أسطرُ فاتورة الدولار تنكتب من بيع الدولار وحده.';
    end if;
    if new.product_id is not null then
      select price_currency into v_pc from products where id = new.product_id;
      if v_pc = 'USD' then
        raise exception 'usd_product_in_iqd' using errcode = 'P0001',
          hint = '«' || coalesce(new.name, '') || '» سعرها بالدولار — تنباع ببيع الدولار، مو بفاتورة دينار. حدّث الصفحة.';
      end if;
    end if;
    return new;
  end if;
  -- UPDATE: إعادةُ ربط السطر بمادّة (الدمج، 0144) مسموحة؛ المالُ على فاتورة دولار لا.
  if v_cur = 'USD'
     and (new.qty, new.unit_price, new.unit_cost, new.line_total, new.unit_price_usd, new.unit_cost_usd)
         is distinct from (old.qty, old.unit_price, old.unit_cost, old.line_total, old.unit_price_usd, old.unit_cost_usd) then
    raise exception 'usd_door' using errcode = 'P0001', hint = 'أسطرُ فاتورة الدولار ما تتعدّل بالمرحلة الأولى.';
  end if;
  return new;
end $$;
drop trigger if exists invoice_items_usd_door on public.invoice_items;
create trigger invoice_items_usd_door before insert or update on public.invoice_items
  for each row execute function public.invoice_items_usd_door();

-- ── ٧) سعرُ الصرف: للمدير (قرار ٣)، بلا المشغّل (سطرُ مالٍ يسمّي شخصاً من كادرها) ─────────────────────────────
create or replace function public.fx_rate_set(p_per100 numeric, p_note text default null)
returns public.clinic_fx_rates language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_ctx record; v_rate numeric; v_row clinic_fx_rates;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.'; end if;
  if platform_acting_clinic() is not null then
    raise exception 'usd_operator' using hint = 'مشغّلُ المنصّة ما يحدّد سعرَ دولار العيادة — صاحبُها أو مديرُها.';
  end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'usd_rate_manager' using errcode = '42501', hint = 'سعرُ الدولار يحدّده المدير — افتح وضعَ المدير برمزه.';
  end if;
  v_rate := _usd_rate_of(p_per100);
  if v_rate is null or v_rate < 100 or v_rate > 100000 then
    raise exception 'usd_rate_bad' using hint = 'اكتب سعرَ ١٠٠ دولار بالدينار (مثلاً ١٤٦٠٠٠).';
  end if;
  insert into clinic_fx_rates (clinic_id, rate, note, set_by)
  values (v_clinic, v_rate, nullif(btrim(coalesce(p_note, '')), ''), auth.uid())
  returning * into v_row;
  return v_row;
end $$;
revoke all on function public.fx_rate_set(numeric, text) from public, anon;
grant execute on function public.fx_rate_set(numeric, text) to authenticated;

-- ── ٧ب) الحالُ للشاشات، والمفتاح ────────────────────────────────────────────────────────────────────────
-- usd_state: ما تحتاجه الشاشات بجوابٍ واحد — مفعّل؟ وخطوةُ التقريب، وآخرُ سعر (معرّفُه يُرسَل مع البيع فيرفض الخادمُ سعراً
-- تغيّر). بصلاحية المُستدعي: سياستا الجدولين تحكمان (المصوّرُ لا يرى ⇒ «مطفأ»). والسعرُ نصٌّ لا عدد — لا عائمَ بالطريق.
create or replace function public.usd_state() returns jsonb
language sql stable security invoker set search_path = public as $$
  select jsonb_build_object(
    'enabled', coalesce((select cp.usd_enabled from clinic_prefs cp where cp.clinic_id = (select auth_clinic())), false),
    'step', coalesce((select cp.usd_round_step from clinic_prefs cp where cp.clinic_id = (select auth_clinic())), 250),
    'rate', (select jsonb_build_object('id', x.id, 'rate', x.rate::text, 'note', x.note, 'set_by', x.set_by, 'created_at', x.created_at)
               from clinic_fx_rates x where x.clinic_id = (select auth_clinic())
              order by x.created_at desc, x.id desc limit 1))
$$;
revoke all on function public.usd_state() from public, anon;
grant execute on function public.usd_state() to authenticated;

-- usd_prefs_set: المفتاحُ وخطوةُ التقريب للمدير (والمشغّلُ يفعّلها لعيادةٍ طلبت — لا مالَ يُكتب باسم أحد). والإطفاءُ يُرفض ما دامت
-- مادّةٌ بالدولار أو دَينٌ بالدولار مفتوح: البيعُ والتسديدُ بالدولار يسألان المفتاحَ، فإطفاؤه كان يجمّد موادَّ على الرفّ وديوناً
-- لا تُسدَّد. فالترتيبُ: تُحوَّل الموادُّ للدينار وتُسدَّد الديونُ، ثمّ يُطفأ.
create or replace function public.usd_prefs_set(p_enabled boolean, p_step integer default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_ctx record; v_prod int; v_debt int;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'usd_prefs_manager' using errcode = '42501', hint = 'تفعيلُ الدولار وخطوتُه للمدير — افتح وضعَ المدير برمزه.';
  end if;
  if p_step is not null and p_step not in (1, 50, 100, 250, 500, 1000) then
    raise exception 'usd_step_bad' using hint = 'خطوةُ التقريب: ١ أو ٥٠ أو ١٠٠ أو ٢٥٠ أو ٥٠٠ أو ١٬٠٠٠ دينار.';
  end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if p_enabled is false and v_ctx.enabled then
    select count(*) into v_prod from products where clinic_id = v_clinic and price_currency = 'USD';
    select count(*) into v_debt from invoices
     where clinic_id = v_clinic and currency = 'USD' and coalesce(status, 'paid') <> 'refunded' and total_usd > paid_usd;
    if v_prod > 0 or v_debt > 0 then
      raise exception 'usd_in_use' using hint = 'بالعيادة ' || v_prod || ' مادّة بالدولار و' || v_debt
        || ' دَين بالدولار مفتوح — حوّل الموادَّ للدينار وسدّد الديونَ أوّلاً، ثمّ أطفئ.';
    end if;
  end if;
  insert into clinic_prefs (clinic_id, usd_enabled, usd_round_step)
  values (v_clinic, coalesce(p_enabled, false), coalesce(p_step, 250))
  on conflict (clinic_id) do update
    set usd_enabled = coalesce(p_enabled, clinic_prefs.usd_enabled),
        usd_round_step = coalesce(p_step, clinic_prefs.usd_round_step);
  return usd_state();
end $$;
revoke all on function public.usd_prefs_set(boolean, integer) from public, anon;
grant execute on function public.usd_prefs_set(boolean, integer) to authenticated;

-- ── ٨) البيعُ بالدولار ───────────────────────────────────────────────────────────────────────────────────
-- p_items: [{product_id, qty, unit_price_usd}] — الاسمُ والباركودُ والكلفةُ من القاعدة، والدينارُ يحسبه الخادم.
-- p_meta:  {fx_rate_id, paid_usd (صفر أو الكامل), payment_method, discount_usd, customer_name, customer_phone, pet_name,
--           staff_id, notes, client_ref, sale_kind}
create or replace function public.usd_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_ctx     record;
  v_ref     text := nullif(btrim(p_meta->>'client_ref'), '');
  v_inv     invoices;
  it        jsonb;
  p         products;
  v_qty     numeric;
  v_uusd    numeric;
  v_uiqd    numeric;
  v_sub_usd numeric := 0;
  v_sub_iqd numeric := 0;
  v_dusd    numeric;
  v_diqd    numeric;
  v_tusd    numeric;
  v_tiqd    numeric;
  v_pusd    numeric;
  v_paid    boolean;
  v_method  text := coalesce(nullif(p_meta->>'payment_method', ''), 'cash');
  v_lines   jsonb := '[]'::jsonb;
  v_costs   jsonb := '{}'::jsonb;
  v_seen    uuid[] := '{}';
  v_cost    numeric := 0;
  r         record;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.'; end if;
  if v_ref is not null then
    select * into v_inv from invoices where clinic_id = v_clinic and client_ref = v_ref;
    if found then return v_inv; end if;   -- إعادةٌ آمنة: ضغطتان أو ردٌّ ضائع = فاتورةٌ واحدة
  end if;
  if nullif(btrim(p_meta->>'sale_at'), '') is not null then
    raise exception 'usd_backdate' using hint = 'فاتورةُ الدولار بيومٍ سابق ما تنسجل بالمرحلة الأولى — سعرُ ذاك اليوم غير معروف.';
  end if;
  if v_ctx.rate_id is null then
    raise exception 'usd_no_rate' using hint = 'حدّد سعرَ الدولار اليوم أوّلاً (الإعدادات › الدولار).';
  end if;
  if nullif(p_meta->>'fx_rate_id', '') is distinct from v_ctx.rate_id::text then
    raise exception 'usd_rate_changed' using hint = 'سعرُ الدولار تغيّر — حدّث وشوف المجموع الجديد قبل البيع.';
  end if;
  if v_method not in ('cash', 'card', 'transfer') then raise exception 'usd_method' using hint = 'طريقةُ الدفع: نقد أو بطاقة أو تحويل.'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = nullif(it->>'product_id', '')::uuid and clinic_id = v_clinic;
    if not found then
      raise exception 'usd_mixed' using hint = 'فاتورةُ الدولار موادُّها بالدولار وحدها — الخدماتُ والموادُّ بالدينار بفاتورةٍ ثانية.';
    end if;
    if p.price_currency <> 'USD' then
      raise exception 'usd_mixed' using hint = '«' || p.name || '» سعرها بالدينار — بفاتورةٍ ثانية.';
    end if;
    if p.id = any(v_seen) then
      raise exception 'usd_duplicate_line' using hint = '«' || p.name || '» مكرّرة بالسلّة — اجمعها بسطرٍ واحد.';
    end if;
    v_seen := v_seen || p.id;
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'usd_qty' using hint = 'كميةُ «' || p.name || '» لازم أكبر من صفر — المرتجعُ بالدولار بالمرحلة الجاية.';
    end if;
    if v_qty <> trunc(v_qty) then   -- لا وزنَ ولا وحدةً فرعية للدولار (products_usd_ok)، فالكسرُ غلطُ إدخال
      raise exception 'usd_qty' using hint = 'كميةُ «' || p.name || '» عددٌ صحيح — مادّةُ الدولار ما تنباع بالكسر.';
    end if;
    v_uusd := round(coalesce(nullif(it->>'unit_price_usd', '')::numeric, p.sell_price_usd), 2);
    if v_uusd is null or v_uusd < 0 then
      raise exception 'usd_no_price' using hint = '«' || p.name || '» ما إلها سعر بالدولار — حدّده من المخزون.';
    end if;
    -- قيمةُ السطر بالدينار الكامل لا بخطوة التقريب (خطّةُ §٩: line_iqd = round(line_usd × rate)): خطوةُ ٢٥٠ على سعر
    -- الوحدة كانت تبيع ١٠٠ × ٠٫٤٠$ بسعر ١٤٦٠ بـ٥٠٬٠٠٠ بدل ٥٨٬٤٠٠. الخطوةُ للنقد الذي يُستلم (التسديد) والفرقُ «فرق صرف».
    v_uiqd := _usd_iqd(v_uusd, v_ctx.rate, 1);
    v_sub_usd := v_sub_usd + round(v_qty * v_uusd, 2);
    v_sub_iqd := v_sub_iqd + v_qty * v_uiqd;
    -- السطرُ كما تأخذه retail_checkout: service_id صريحٌ null (غيابُه = «جهازٌ ما تحدّث» يُصنَّف بالاسم، 0252).
    v_lines := v_lines || jsonb_build_object(
      'product_id', p.id, 'name', p.name, 'barcode', p.barcode, 'qty', v_qty, 'stock_qty', v_qty,
      'unit_price', v_uiqd, 'unit_cost', 0, 'service_id', null);
    v_costs := v_costs || jsonb_build_object(p.id::text, jsonb_build_object(
      'usd', v_uusd, 'cost_usd', coalesce(p.purchase_price_usd, 0),
      'cost_iqd', round(coalesce(p.purchase_price_usd, 0) * v_ctx.rate, 2)));
  end loop;

  v_dusd := least(greatest(round(coalesce(nullif(p_meta->>'discount_usd', '')::numeric, 0), 2), 0), v_sub_usd);
  -- خصمٌ كامل (بالدولار = المجموع) يأخذ الدينارَ كلَّه: دينارُ السطور مقرَّبٌ وحدةً وحدة فلا يساوي تقليبَ المجموع، وكان يُبقي
  -- ديناراً أو اثنين على فاتورةٍ صفرٍ بالدولار — مغلقةٍ بعملةٍ ومفتوحةٍ بالأخرى ولا تُسدَّد أبداً (أمسكه usd-parity).
  v_diqd := case when v_dusd >= v_sub_usd then v_sub_iqd else least(_usd_iqd(v_dusd, v_ctx.rate, 1), v_sub_iqd) end;
  v_tusd := v_sub_usd - v_dusd;
  v_tiqd := greatest(v_sub_iqd - v_diqd, 0);
  v_pusd := round(coalesce(nullif(p_meta->>'paid_usd', '')::numeric, 0), 2);
  if v_pusd = 0 then v_paid := false;
  elsif v_pusd = v_tusd then v_paid := true;
  else
    raise exception 'usd_partial_at_sale' using hint = 'البيعُ بالدولار نقداً كاملاً أو دَيناً — الدفعةُ الجزئية تنسجل «تسديد» بعد البيع.';
  end if;

  perform set_config('doctorvet.usd_door', 'on', true);
  v_inv := retail_checkout(v_lines, jsonb_strip_nulls(jsonb_build_object(
    'customer_name', p_meta->>'customer_name', 'customer_phone', p_meta->>'customer_phone',
    'pet_name', p_meta->>'pet_name', 'staff_id', p_meta->>'staff_id', 'notes', p_meta->>'notes',
    'client_ref', v_ref, 'sale_kind', p_meta->>'sale_kind', 'payment_method', v_method,
    'discount_type', case when v_diqd > 0 then 'fixed' end, 'discount_value', case when v_diqd > 0 then v_diqd end,
    'amount_paid', 0)));   -- النقدُ يُسجَّل تسديداً كاملاً بعد الختم (أدناه)

  if v_inv.currency = 'USD' then   -- سباقُ ضغطتين على نفس client_ref: الأولى ختمتها
    perform set_config('doctorvet.usd_door', 'off', true);
    return v_inv;
  end if;
  -- مجموعُ retail_checkout هو ما حسبناه هنا (ومرآتُه cartTotals) — فرقٌ بينهما يعني أن أحدَهما تغيّر بلا الآخر.
  if v_inv.total is distinct from round(v_tiqd, 2) then
    raise exception 'usd_total_mismatch' using hint = 'مجموعُ الفاتورة بالدينار (' || v_inv.total || ') غيرُ المحسوب (' || v_tiqd || ') — ما انحفظ شي.';
  end if;

  -- الختم: الكلفةُ بالدولار × سعر يوم البيع (م١: آخرُ سعر شراء بالدولار)، والأعمدةُ الدولارية.
  for r in select ii.id, ii.product_id, ii.qty from invoice_items ii where ii.invoice_id = v_inv.id loop
    update invoice_items
       set unit_price_usd = (v_costs->(r.product_id::text)->>'usd')::numeric,
           unit_cost_usd  = (v_costs->(r.product_id::text)->>'cost_usd')::numeric,
           unit_cost      = (v_costs->(r.product_id::text)->>'cost_iqd')::numeric
     where id = r.id;
    v_cost := v_cost + r.qty * (v_costs->(r.product_id::text)->>'cost_iqd')::numeric;
  end loop;
  update invoices
     set currency = 'USD', fx_rate = v_ctx.rate, total_usd = v_tusd, discount_usd = v_dusd,
         paid_usd = 0,
         cost_total = round(v_cost, 2), profit = total - round(v_cost, 2)
   where id = v_inv.id
   returning * into v_inv;
  perform set_config('doctorvet.usd_door', 'off', true);
  -- البيعُ نقداً = دَينٌ يُسدَّد كاملاً بسعر البيع بالمعاملة نفسِها: الدرجُ يستلم الدينارَ لأقرب خطوة (قرار ٥)، وما بينه وبين
  -- قيمة الفاتورة (بالدينار الكامل) سِيقُ «فرق صرف» بيومه — لا يضيع ولا يُخترع. ووصلُه صفٌّ بـusd_settlements كأيّ تسديد.
  if v_paid and v_tusd > 0 then
    perform settle_invoice_usd(v_inv.id, v_tusd, v_ctx.rate * 100, v_method, v_tusd, null, null);
    select * into v_inv from invoices where id = v_inv.id;
  end if;
  return v_inv;
end $$;
revoke all on function public.usd_checkout(jsonb, jsonb) from public, anon;
grant execute on function public.usd_checkout(jsonb, jsonb) to authenticated;

-- ── ٩) التسديدُ بالدينار بسعر اليوم (أو بسعرٍ متّفق: للمدير وبسبب — قرار ٤) ─────────────────────────────────────
create or replace function public.settle_invoice_usd(
  p_invoice uuid, p_usd numeric, p_per100 numeric, p_method text default 'cash',
  p_expect_due_usd numeric default null, p_note text default null, p_client_ref text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ctx    record;
  v_inv    invoices;
  v_set    usd_settlements;
  v_rate   numeric;
  v_usd    numeric := round(coalesce(p_usd, 0), 2);
  v_due    numeric;
  v_dueiqd numeric;
  v_recv   numeric;
  v_share  numeric;
  v_fx     numeric;
  v_method text := coalesce(nullif(p_method, ''), 'cash');
  v_ref    text := nullif(btrim(coalesce(p_client_ref, '')), '');
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_at     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_id     uuid := gen_random_uuid();
  v_legs   jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.'; end if;
  if v_ref is not null then
    select * into v_set from usd_settlements where clinic_id = v_clinic and client_ref = v_ref;
    if found then
      select * into v_inv from invoices where id = v_set.invoice_id;
      return jsonb_build_object('invoice', to_jsonb(v_inv), 'settlement', to_jsonb(v_set));
    end if;
  end if;
  if v_method not in ('cash', 'card', 'transfer') then raise exception 'usd_method' using hint = 'طريقةُ الدفع: نقد أو بطاقة أو تحويل.'; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.currency <> 'USD' then raise exception 'usd_not_usd' using hint = 'هاي فاتورة دينار — تسديدُها العادي.'; end if;
  if coalesce(v_inv.status, 'paid') = 'refunded' then raise exception 'invoice refunded'; end if;
  v_due := v_inv.total_usd - v_inv.paid_usd;
  if p_expect_due_usd is not null and abs(round(p_expect_due_usd, 2) - v_due) > 0.004 then
    raise exception 'usd_due_changed' using hint = 'باقي الفاتورة تغيّر من جهازٍ ثاني (صار ' || v_due || '$) — راجع المبلغ.';
  end if;
  if v_usd <= 0 then raise exception 'usd_amount' using hint = 'اكتب مبلغَ التسديد بالدولار.'; end if;
  if v_usd > v_due then
    raise exception 'usd_over' using hint = 'المبلغ أكبر من باقي الفاتورة (' || v_due || '$).';
  end if;
  v_rate := _usd_rate_of(p_per100);
  if v_rate is null or v_rate < 100 or v_rate > 100000 then
    raise exception 'usd_rate_bad' using hint = 'اكتب سعرَ ١٠٠ دولار بالدينار (مثلاً ١٤٦٠٠٠).';
  end if;
  if v_ctx.rate_id is null or v_rate <> v_ctx.rate then
    if coalesce(auth_role(), '') <> 'manager' or v_note is null then
      raise exception 'usd_rate_override' using errcode = '42501',
        hint = 'التسديدُ بسعرٍ غير سعر اليوم يحتاج المدير وسبباً مكتوباً.';
    end if;
  end if;
  v_recv := _usd_iqd(v_usd, v_rate, v_ctx.step);
  -- تسديدٌ جزئيّ يطلع صفراً بالخطوة بلا معنى فيُرفض؛ أمّا الإغلاقُ فيمرّ ولو بصفر (باقٍ أصغرُ من نصف خطوة): بلاه تبقى
  -- الفاتورةُ مفتوحةً أبداً بسنتاتٍ لا تُدفع. حصّتُه باقي الدينار وفرقُه سالبُها.
  if v_recv <= 0 and v_usd < v_due then raise exception 'usd_too_small' using hint = 'المبلغ أصغر من أصغر دفعة بالدينار.'; end if;
  v_dueiqd := v_inv.total - coalesce(v_inv.amount_paid, 0);
  v_share := _usd_share(v_usd, v_due, v_dueiqd, v_inv.total_usd, v_inv.total);
  v_fx := v_recv - v_share;

  insert into usd_settlements (id, clinic_id, invoice_id, usd, rate, rate_note, received, share, fx, method, by_user, client_ref)
  values (v_id, v_clinic, v_inv.id, v_usd, v_rate, v_note, v_recv, v_share, v_fx, v_method, auth.uid(), v_ref)
  returning * into v_set;

  v_legs := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_share <> 0 then
    v_legs := v_legs || jsonb_build_object('method', v_method, 'amount', v_share, 'at', v_at,
                                           'usd', v_usd, 'rate', v_rate, 'settlement_id', v_id);
  end if;
  if v_fx <> 0 then
    v_legs := v_legs || jsonb_build_object('method', v_method, 'amount', v_fx, 'at', v_at, 'kind', 'fx', 'settlement_id', v_id);
  end if;
  perform set_config('doctorvet.usd_door', 'on', true);
  update invoices
     set amount_paid = coalesce(amount_paid, 0) + v_share,
         paid_usd = paid_usd + v_usd,
         status = case when paid_usd + v_usd >= total_usd then 'paid' else 'partial' end,
         payment_details = v_legs,
         payment_method = (select e->>'method' from jsonb_array_elements(v_legs) e
                            where coalesce(e->>'kind', '') <> 'fx'
                            order by (e->>'amount')::numeric desc limit 1)
   where id = v_inv.id
   returning * into v_inv;
  perform set_config('doctorvet.usd_door', 'off', true);
  return jsonb_build_object('invoice', to_jsonb(v_inv), 'settlement', to_jsonb(v_set));
end $$;
revoke all on function public.settle_invoice_usd(uuid, numeric, numeric, text, numeric, text, text) from public, anon;
grant execute on function public.settle_invoice_usd(uuid, numeric, numeric, text, numeric, text, text) to authenticated;

-- ── ١٠) إلغاءُ تسديدٍ غلط: للمدير وبسبب؛ يُعكس بيوم الإلغاء — الأيّامُ المغلقة لا تُعاد كتابتُها ────────────────
create or replace function public.void_usd_settlement(p_settlement uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_set    usd_settlements;
  v_inv    invoices;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_at     text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_legs   jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if coalesce(auth_role(), '') <> 'manager' then
    raise exception 'usd_void_manager' using errcode = '42501', hint = 'إلغاءُ التسديد للمدير — افتح وضعَ المدير برمزه.';
  end if;
  if v_reason is null then raise exception 'usd_void_reason' using hint = 'اكتب سببَ الإلغاء.'; end if;
  select * into v_set from usd_settlements where id = p_settlement and clinic_id = v_clinic for update;
  if not found then raise exception 'usd_settlement_missing' using hint = 'التسديد مو موجود.'; end if;
  if v_set.voided_at is not null then raise exception 'usd_already_void' using hint = 'هالتسديد ملغى من قبل.'; end if;
  select * into v_inv from invoices where id = v_set.invoice_id and clinic_id = v_clinic for update;
  v_legs := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_set.share <> 0 then
    v_legs := v_legs || jsonb_build_object('method', v_set.method, 'amount', -v_set.share, 'at', v_at,
                                           'reversal_of', v_set.id, 'note', v_reason);
  end if;
  if v_set.fx <> 0 then
    v_legs := v_legs || jsonb_build_object('method', v_set.method, 'amount', -v_set.fx, 'at', v_at, 'kind', 'fx',
                                           'reversal_of', v_set.id, 'note', v_reason);
  end if;
  perform set_config('doctorvet.usd_door', 'on', true);
  update invoices
     set amount_paid = coalesce(amount_paid, 0) - v_set.share, paid_usd = paid_usd - v_set.usd, payment_details = v_legs,
         status = case when paid_usd - v_set.usd <= 0 then 'unpaid' else 'partial' end
   where id = v_inv.id
   returning * into v_inv;
  perform set_config('doctorvet.usd_door', 'off', true);
  update usd_settlements set voided_at = now(), voided_by = auth.uid(), void_reason = v_reason
   where id = v_set.id returning * into v_set;
  return jsonb_build_object('invoice', to_jsonb(v_inv), 'settlement', to_jsonb(v_set));
end $$;
revoke all on function public.void_usd_settlement(uuid, text) from public, anon;
grant execute on function public.void_usd_settlement(uuid, text) to authenticated;

-- ── ١١) حذفُ فاتورةٍ دولارية غلط: بلا تسديدٍ حيّ، ثمّ delete_invoice نفسُها (المخزونُ يرجع من دالّةٍ مفحوصة) ──────────
create or replace function public.delete_usd_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v_inv invoices;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.currency <> 'USD' then raise exception 'usd_not_usd' using hint = 'هاي فاتورة دينار — حذفُها العادي.'; end if;
  if exists (select 1 from usd_settlements s where s.invoice_id = p_invoice and s.voided_at is null) then
    raise exception 'usd_delete_settled' using hint = 'على هالفاتورة تسديدات — ألغِها أوّلاً ثمّ احذف.';
  end if;
  -- مدفوعةٌ نقداً ساعةَ البيع: حذفُها يُسقط قبضَها من يومه كأيّ فاتورة نقدٍ تُحذف (السلوكُ القائم لـdelete_invoice).
  perform set_config('doctorvet.usd_door', 'on', true);
  perform delete_invoice(p_invoice);
  perform set_config('doctorvet.usd_door', 'off', true);
end $$;
revoke all on function public.delete_usd_invoice(uuid) from public, anon;
grant execute on function public.delete_usd_invoice(uuid) to authenticated;

-- ── ١٢) القارئتان المعلَنتان ─────────────────────────────────────────────────────────────────────────────
-- receipt_legs: ساقُ فرق الصرف (`kind:'fx'`) ربحُها كلُّها — total = profit = مقدارُها، فقسمةُ الربح على القبض تعطيها نفسَها.
create or replace function receipt_legs()
returns table (invoice_id uuid, total numeric, profit numeric, amount numeric, at timestamptz)
language sql stable security invoker set search_path = public as $$
  -- +0264
  with inv as (
    select id, total, profit, created_at, amount_paid, payment_details
      from invoices
     where clinic_id = auth_clinic() and coalesce(status, 'paid') <> 'refunded'
  )
  select i.id,
         case when l->>'kind' = 'fx' then safe_num(l->>'amount') else i.total end,
         case when l->>'kind' = 'fx' then safe_num(l->>'amount') else i.profit end,
         safe_num(l->>'amount'), coalesce(safe_ts(l->>'at'), i.created_at)
    from inv i
    cross join lateral jsonb_array_elements(i.payment_details) l
   where jsonb_typeof(i.payment_details) = 'array' and jsonb_array_length(i.payment_details) > 0
     and abs(coalesce(safe_num(l->>'amount'), 0)) > 0.01
  union all
  select i.id, i.total, i.profit, coalesce(i.amount_paid, i.total), i.created_at
    from inv i
   where (i.payment_details is null or jsonb_typeof(i.payment_details) <> 'array' or jsonb_array_length(i.payment_details) = 0)
     and coalesce(i.amount_paid, i.total) > 0.01
$$;
revoke all on function receipt_legs() from public, anon;
grant execute on function receipt_legs() to authenticated;

-- الربحُ المحقَّق بالقبض: `total <> 0` لا `> 0` — ساقُ الفرق السالبة (خسارة) total سالب، وربحُها مقدارُها.
-- (السِيَقُ العاديّة total موجبٌ دائماً: لا يتغيّر لها شيء.)
create or replace function report_receipts_daily(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns table (day date, gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
  -- +0264
  select (r.at at time zone p_tz)::date as day,
         round(sum(r.amount), 2) as gross,
         round(sum(case when r.total <> 0 then r.profit * r.amount / r.total else 0 end), 2) as net,
         count(distinct r.invoice_id)::int as invoices
    from receipt_legs() r
   where r.at >= p_from and r.at <= p_to
   group by 1
   order by 1
$$;
revoke all on function report_receipts_daily(timestamptz, timestamptz, text) from public, anon;
grant execute on function report_receipts_daily(timestamptz, timestamptz, text) to authenticated;

create or replace function report_receipts_total(p_from timestamptz, p_to timestamptz)
returns table (gross numeric, net numeric, invoices int)
language sql stable security invoker set search_path = public as $$
  -- +0264
  select coalesce(round(sum(r.amount), 2), 0),
         coalesce(round(sum(case when r.total <> 0 then r.profit * r.amount / r.total else 0 end), 2), 0),
         count(distinct r.invoice_id)::int
    from receipt_legs() r
   where r.at >= p_from and r.at <= p_to
$$;
revoke all on function report_receipts_total(timestamptz, timestamptz) from public, anon;
grant execute on function report_receipts_total(timestamptz, timestamptz) to authenticated;

-- الأرباح والخسائر (0256): سطرٌ «فرق سعر الصرف» (fx) بعد ربح المبيعات، والصافي = الربح + الفرق − السحوبات.
-- الباقي جسمُ 0256 حرفاً (الحارسُ بأعلى الملفّ يتأكّد أن القاعدة عليه قبل الاستبدال).
create or replace function public.report_pnl(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
-- +0264
declare
  v_clinic uuid := auth_clinic();
  v_ph     boolean := false;
  v_can    boolean := false;
  v_tz     text;
  v_out    jsonb;
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- كلاهما من 0222 ويُسألان بـexecute (كـservice_recipe_set، 0252): تراجعُ 0222 يحذفهما، ونداءٌ ثابتٌ يرمي «لا توجد»
  -- بدل الجواب. وبلا staff_can لا قالبَ أذونات بالقاعدة — فالمديرُ وحده، كما كان قبل 0222.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v_can using 'viewProfits';
  else
    v_can := coalesce(auth_role(), '') = 'manager';
  end if;
  if coalesce(v_ph, false) or not coalesce(v_can, false) then
    raise exception 'pnl_forbidden' using errcode = '42501',
      hint = 'تقرير الأرباح والخسائر لمن يشوف الأرباح — اطلبه من المدير';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'pnl_range' using hint = 'اختر مدّة صحيحة — البداية قبل النهاية';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'pnl_range_long' using hint = 'المدّة أطول من سنة وشهر — قسّمها لفترتين';
  end if;
  -- اسمُ التوقيت المعتمد كما يكتبه pg_timezone_names (بلا حساسية حروف)، وإلا بغداد — كـpnlTz بالمرآة.
  select z.name into v_tz from pg_timezone_names z where lower(z.name) = lower(btrim(coalesce(p_tz, ''))) limit 1;
  v_tz := coalesce(v_tz, 'Asia/Baghdad');

  with inv as (
    select i.id, coalesce(i.total, 0) as total, coalesce(i.profit, 0) as profit, coalesce(i.cost_total, 0) as cost_total,
           to_char(i.created_at at time zone v_tz, 'YYYY-MM') as m
      from invoices i
     where i.clinic_id = v_clinic and coalesce(i.status, 'paid') <> 'refunded'
       and i.created_at >= p_from and i.created_at <= p_to
  ),
  inv_m as (
    select m, count(*)::int as n, sum(total) as revenue, sum(cost_total) as cogs, sum(profit) as gross
      from inv group by m
  ),
  prod_m as (
    select v.m, sum(round(coalesce(ii.qty, 0) * coalesce(ii.unit_cost, 0), 2)) as c
      from inv v
      join invoice_items ii on ii.invoice_id = v.id and ii.clinic_id = v_clinic
     where ii.product_id is not null
     group by v.m
  ),
  mat_m as (
    select v.m, sum(c.value) as c
      from inv v
      join invoice_consumption c on c.invoice_id = v.id and c.clinic_id = v_clinic
     group by v.m
  ),
  fx_m as (   -- +0264 فرقُ الصرف: سِيَقُ kind='fx' بشهر يومها (لا بشهر الفاتورة) — على فواتير الدولار وحدها
    select to_char(coalesce(safe_ts(l->>'at'), i.created_at) at time zone v_tz, 'YYYY-MM') as m,
           round(sum(safe_num(l->>'amount')), 2) as fx
      from invoices i
      cross join lateral jsonb_array_elements(case when jsonb_typeof(i.payment_details) = 'array'
                                                   then i.payment_details else '[]'::jsonb end) l
     where i.clinic_id = v_clinic and i.currency = 'USD' and coalesce(i.status, 'paid') <> 'refunded'
       and l->>'kind' = 'fx'
       and coalesce(safe_ts(l->>'at'), i.created_at) >= p_from and coalesce(safe_ts(l->>'at'), i.created_at) <= p_to
     group by 1
  ),
  ex as (
    select to_char(e.spent_at at time zone v_tz, 'YYYY-MM') as m,
           case when e.category_id is not null then 'cat'
                when e.method = 'stock' then 'stock'
                when inv_norm_group(e.category) = inv_norm_group('مرتجع') then 'returns'
                when inv_norm_group(e.category) = inv_norm_group('payroll') then 'payroll'
                when inv_norm_group(e.category) = inv_norm_group('payroll_loan') then 'payroll_loan'
                when inv_norm_group(e.category) = inv_norm_group('سحب مخزن') then 'stock'
                else 'none' end as b,
           e.category_id as cid, e.amount
      from expenses e
     where e.clinic_id = v_clinic and e.spent_at >= p_from and e.spent_at <= p_to
  ),
  ex_m as (   -- كلُّ جدولٍ بشهره مقرَّبٌ لفلس
    select m, b, cid, round(sum(amount), 2) as a from ex group by m, b, cid
  ),
  months as (
    select m from inv_m union select m from ex_m union select m from fx_m
  ),
  cat_ord as (   -- ترتيبُ groupWithdrawals: بإنشاء التصنيف ثمّ بمعرّفه، والمجهولُ بعدها
    select x.cid, c.name, c.created_at
      from (select distinct cid from ex_m where b = 'cat') x
      left join expense_categories c on c.id = x.cid and c.clinic_id = v_clinic
  ),
  rows as (
    select ms.m,
           coalesce(i.n, 0) as n, coalesce(i.revenue, 0) as revenue, coalesce(i.cogs, 0) as cogs,
           coalesce(i.gross, 0) as gross, coalesce(p.c, 0) as cp, coalesce(t.c, 0) as cm, coalesce(f.fx, 0) as fx,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'stock'), 0)        as stock,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'returns'), 0)      as returns,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll'), 0)      as payroll,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll_loan'), 0) as loan,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'none'), 0)         as none,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m), 0)                          as ex_total
      from months ms
      left join inv_m  i on i.m = ms.m
      left join prod_m p on p.m = ms.m
      left join mat_m  t on t.m = ms.m
      left join fx_m   f on f.m = ms.m
  )
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', r.m, 'invoices', r.n, 'revenue', r.revenue, 'cogs', r.cogs,
               'cogs_products', r.cp, 'cogs_materials', r.cm, 'cogs_other', r.cogs - r.cp - r.cm,
               'gross', r.gross, 'adjust', r.gross - (r.revenue - r.cogs),
               'stock_loss', r.stock, 'returns', r.returns, 'payroll', r.payroll, 'payroll_loan', r.loan,
               'uncategorized', r.none,
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', x.a)
                                   order by o.created_at nulls last, o.cid)
                    from ex_m x join cat_ord o on o.cid = x.cid
                   where x.m = r.m and x.b = 'cat'), '[]'::jsonb),
               'fx', r.fx, 'expenses', r.ex_total, 'net', r.gross + r.fx - r.ex_total)
             order by r.m)
        from rows r), '[]'::jsonb),
    'total', (
      select jsonb_build_object(
               'invoices', coalesce(sum(r.n), 0), 'revenue', coalesce(sum(r.revenue), 0), 'cogs', coalesce(sum(r.cogs), 0),
               'cogs_products', coalesce(sum(r.cp), 0), 'cogs_materials', coalesce(sum(r.cm), 0),
               'cogs_other', coalesce(sum(r.cogs - r.cp - r.cm), 0),
               'gross', coalesce(sum(r.gross), 0), 'adjust', coalesce(sum(r.gross - (r.revenue - r.cogs)), 0),
               'stock_loss', coalesce(sum(r.stock), 0), 'returns', coalesce(sum(r.returns), 0),
               'payroll', coalesce(sum(r.payroll), 0), 'payroll_loan', coalesce(sum(r.loan), 0),
               'uncategorized', coalesce(sum(r.none), 0),
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', s.a)
                                   order by o.created_at nulls last, o.cid)
                    from (select cid, sum(a) as a from ex_m where b = 'cat' group by cid) s
                    join cat_ord o on o.cid = s.cid), '[]'::jsonb),
               'fx', coalesce(sum(r.fx), 0), 'expenses', coalesce(sum(r.ex_total), 0),
               'net', coalesce(sum(r.gross + r.fx - r.ex_total), 0))
        from rows r))
    into v_out;
  return v_out;
end $$;
revoke all on function public.report_pnl(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.report_pnl(timestamptz, timestamptz, text) to authenticated;

-- ── ١٣) رفعُ الأسعار (0226) يتخطّى مادّةَ الدولار ───────────────────────────────────────────────────────
-- سعرُها بالدولار، ودينارُها (sell_price) لا يُقرأ للبيع — ومادّةٌ حُوّلت من الدينار يبقى فيه سعرُها القديم، فكانت تظهر
-- بمعاينة الرفع وتُرفع بلا معنى. النطاقُ نسخةُ 0226 حرفاً وسطرٌ واحد؛ ومرآتُه productsInScope (priceRaise.ts) يطابقها price-parity.
create or replace function public._price_scope_products(p_clinic uuid, p_spec jsonb)
returns table (id uuid, is_direct boolean)
language sql
stable
security definer
set search_path = public
as $$
  -- +0264
  with s as (
    select coalesce((p_spec->>'products')::boolean, false) as on_,
           _price_jtext(p_spec->'p_categories') as cats,
           _price_juuid(p_spec->'p_companies') as cos,
           _price_juuid(p_spec->'p_sections') as secs,
           _price_juuid(p_spec->'p_ids') as ids,
           coalesce(_price_juuid(p_spec->'p_exclude'), '{}') as ex
  ),
  base as (
    select p.id, p.category, p.company_id, p.section_id, nullif(btrim(p.bulk_group), '') as g
      from products p, s
     where s.on_ and p.clinic_id = p_clinic and p.farm_id is null
       and coalesce(p.price_currency, 'IQD') = 'IQD'   -- 0264: سعرُ مادّة الدولار بالدولار — دينارُها لا يُقرأ فلا يُرفع
  ),
  direct as (
    select b.id, b.g from base b, s
     where (s.cats is null or b.category = any (s.cats))
       -- شركةٌ كاملة أو قسمٌ منها: اتّحادٌ لا تقاطع.
       and ((s.cos is null and s.secs is null)
            or (s.cos is not null and b.company_id = any (s.cos))
            or (s.secs is not null and b.section_id = any (s.secs)))
       and (s.ids is null or b.id = any (s.ids))
  ),
  exg as (select distinct b.g from base b, s where b.id = any (s.ex) and b.g is not null),
  ing as (select distinct d.g from direct d where d.g is not null)
  select b.id, exists (select 1 from direct d where d.id = b.id)
    from base b, s
   where not (b.id = any (s.ex))
     and not exists (select 1 from exg where exg.g = b.g)
     and (exists (select 1 from direct d where d.id = b.id) or exists (select 1 from ing where ing.g = b.g))
$$;
revoke all on function public._price_scope_products(uuid, jsonb) from public, anon, authenticated;

-- ── ١٤) المتجرُ الإلكترونيّ لا يعرض مادّةَ الدولار بالمرحلة ١ ──────────────────────────────────────────────
-- سعرُ الزائر بالدينار يحتاج قراراً (الخطّة §٥): مادّةٌ حُوّلت للدولار وهي منشورة كانت تُعرض بسعر دينارها القديم.
-- فالتحويلُ يُنزلها من المتجر (والنموذجُ يقولها)، ونشرُ مادّةٍ دولارية يُرفض بجملة — لا نشرَ صامتٌ بسعرٍ كاذب.
create or replace function public.products_usd_store() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.price_currency = 'USD' and new.store_visible then
    if tg_op = 'UPDATE' and old.price_currency is distinct from 'USD' then
      new.store_visible := false;
    else
      raise exception 'usd_store' using errcode = 'P0001',
        hint = '«' || coalesce(new.name, '') || '» سعرها بالدولار — مواد الدولار ما تنعرض بالمتجر الإلكتروني بالمرحلة الأولى.';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_usd_store on public.products;
create trigger products_usd_store before insert or update of price_currency, store_visible on public.products
  for each row execute function public.products_usd_store();
