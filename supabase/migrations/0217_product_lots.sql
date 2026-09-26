-- ============================================================================
-- ٠٢١٧ — الدفعات: لكلّ كميةٍ تاريخُها وشركتُها ويومُ شرائها (طلبُ المالك، ٢٦/٩)
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- للمادة تاريخُ انتهاءٍ واحد، والعيادةُ تشتري نفسَ المادة مرّاتٍ قبل أن تنفد
-- الأولى. فعشرُ علبٍ تنتهي بعد شهر وعشرون بعد سبعة أشهر تُرى «٣٠ تنتهي بعد
-- شهر» أو «٣٠ بعد سبعة» — وكلاهما كذب. والمقيس (الإنتاج، ٢٦/٩): ٢٬٧٨٥ مادةً على
-- الرفّ، ١٬٩٨٦ منها لم تدخل بفاتورة شراءٍ قطّ، وصفرُ سطرِ شراءٍ عليه تاريخ.
--
-- ── التصميم: حارسٌ واحدٌ لا خمسةَ عشرَ باباً ──────────────────────────────
-- الرصيدُ يتغيّر من أبوابٍ كثيرة (بيع، مرتجع، متجر، جرد، دمج، استرجاع، تعديلٌ
-- باليد، تعديلُ فاتورةٍ يمسح سطورها ويعيدها). تعليمُ كلِّ بابٍ الدفعات يترك باباً
-- ينساها. فـ`products.stock` يبقى الحقيقةَ، و`product_lots` تفصيلُه، ومحفّزٌ
-- **مؤجَّلٌ لآخر المعاملة** (`lots_reconcile`) يُعيد التطابق: مجموعُ الدفعات = الرصيد.
--   • نقص ⇐ يُسحب من **الأقرب انتهاءً غيرِ المنتهي** أوّلاً (قرارُ المالك)، ثمّ
--     المنتهي — البيعُ لا يُفترض أنه من علبةٍ فاتت. والجردُ بسبب «منتهي» بالعكس.
--   • زيادةٌ بلا فاتورة (مرتجع، تصحيح) ⇐ لأقرب دفعةٍ صالحةٍ فيها رصيد؛ وإلا دفعةٌ
--     «تعديل» بتاريخ المادة إن لم يفُت.
--   • الشراءُ يصنع دفعتَه بتاريخ السطر وشركته ويوم الفاتورة (محفّزٌ على السطور،
--     مفتاحُه الفاتورة+المادة فيصمد لمسح السطور وإعادتها بالتعديل).
-- والتأجيلُ مقصود: تعديلُ الفاتورة يمرّ بسالبٍ وسطيّ، والحارسُ يحكم على النهاية.
--
-- ── تاريخُ المادة صار مشتقّاً (قرارُ المالك) ─────────────────────────────
-- `products.expiry_date` = أقربُ تاريخٍ لدفعةٍ فيها رصيد. فكلُّ ما يقرؤه (تحذيرُ
-- البيع، المتجر 0212، الكتم 0210، الوسم 0214، المراقبة) يبقى صحيحاً بلا مساس.
-- وتعديلُه باليد (نموذجُ المادة) يُترجم لتعديل الدفعة التي يمثّلها.
--
-- ── ما يوجد اليوم ─────────────────────────────────────────────────────────
-- كلُّ رصيدٍ قائمٍ يصير «دفعةً افتتاحية» بكميته وتاريخ مادته ويوم إنشائها.
-- لا يضيع شيء ولا تُعيد العيادةُ إدخالَ شيء، وتقسّمها إن عرفت تواريخها.
--
-- خارجها: المجمَّعة (رصيدُها بحوض القسم) ومخزنُ الحقل (0191).
-- تراجع: drop trigger products_lots_sync on products; drop trigger products_lot_expiry on
--   products; drop trigger purchase_items_lots on purchase_items; والجدولُ يبقى ولا يضرّ.
-- تُطبَّق بعد 0216. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

create table if not exists public.product_lots (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null references auth.users(id) on delete cascade,
  product_id    uuid not null references public.products(id) on delete cascade,
  qty           numeric not null default 0 check (qty between 0 and 1000000000),
  received_qty  numeric not null default 0 check (received_qty between 0 and 1000000000),
  expiry_date   date,
  received_at   timestamptz not null default now(),
  source        text not null check (source in ('opening', 'purchase', 'added', 'adjust')),
  purchase_id   uuid references public.purchases(id) on delete set null,
  company_name  text,
  note          text check (char_length(note) <= 200),
  -- تاريخٌ صحّحته العيادةُ بيدها (lot_edit أو نموذجُ المادة): تعديلُ الفاتورة بعدها لا يكتب فوقه.
  expiry_fixed  boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.product_lots add column if not exists expiry_fixed boolean not null default false;
create index if not exists product_lots_product_idx on public.product_lots (product_id);
-- كاملان لا جزئيّان: فهرسُ المفتاح الأجنبيّ يخدم حذفَ العيادة وتصفيرَ الفاتورة (set null).
create index if not exists product_lots_clinic_idx on public.product_lots (clinic_id, expiry_date);
-- دفعةٌ واحدةٌ لكلّ مادةٍ بكلّ فاتورة (NULL متمايزة: الافتتاحيةُ واليدويةُ بلا فاتورة كثيرة).
create unique index if not exists product_lots_purchase_uq on public.product_lots (purchase_id, product_id);

alter table public.product_lots enable row level security;
drop policy if exists product_lots_select on public.product_lots;
create policy product_lots_select on public.product_lots
  for select using (clinic_id = (select auth_clinic()));
revoke insert, update, delete, truncate on table public.product_lots from anon, authenticated;
revoke all on table public.product_lots from anon;
grant select on table public.product_lots to authenticated;
comment on table public.product_lots is
  'الدفعات (0217): تفصيلُ products.stock بتاريخ الانتهاء والشركة ويوم الشراء. مجموعُها = الرصيد دائماً (lots_reconcile المؤجَّل). تُكتب من الدوالّ وحدها.';

-- ── ١) تاريخُ المادة = أقربُ دفعةٍ فيها رصيد ──────────────────────────────
create or replace function public.lots_refresh_expiry(p_product uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min  date;
  v_any  boolean;
begin
  -- الأقربُ **الصالح** أوّلاً: دفعةٌ منتهيةٌ باقيةٌ على الرف لا تُلبس البضاعةَ الجديدة ثوبَ
  -- المنتهي (المتجرُ كان سيخفي المادةَ كلَّها والبيعُ يسأل عن كلّ علبة). المنتهيةُ تبقى
  -- ظاهرةً بدفعتها — بالمراقبة والدفعات — ويُرفع تاريخُها للمادة إن لم يبقَ غيرُها.
  select coalesce(min(expiry_date) filter (where expiry_date >= current_date), min(expiry_date)), bool_or(true)
    into v_min, v_any
    from product_lots where product_id = p_product and qty > 0;
  -- بلا دفعةٍ فيها رصيد: يبقى آخرُ تاريخ (مادةٌ نافدة لا تُنبَّه أصلاً).
  if coalesce(v_any, false) then
    update products set expiry_date = v_min
     where id = p_product and expiry_date is distinct from v_min;
  end if;
end $$;
revoke all on function public.lots_refresh_expiry(uuid) from public, anon, authenticated;

-- ── ٢) الحارس: مجموعُ الدفعات = الرصيد ───────────────────────────────────
create or replace function public.lots_reconcile(p_product uuid, p_expired_first boolean default false)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p       record;
  v_sum   numeric;
  v_diff  numeric;
  v_need  numeric;
  v_take  numeric;
  r       record;
  v_head  uuid;
begin
  select id, clinic_id, stock, pooled, farm_id, expiry_date, created_at into p
    from products where id = p_product;
  if not found or p.farm_id is not null then
    return;
  end if;
  -- صارت مجمَّعة: رصيدُها بحوض القسم، ودفعاتُها القديمة رصيدٌ وهميّ بالمراقبة.
  if coalesce(p.pooled, false) then
    delete from product_lots where product_id = p_product;
    return;
  end if;

  -- دفعةُ شراءٍ شيلت مادتُها من الفاتورة (تعديل) — كميتُها لم تُستلَم أصلاً.
  delete from product_lots l
   where l.product_id = p_product and l.source = 'purchase'
     and not exists (select 1 from purchase_items pi where pi.purchase_id = l.purchase_id and pi.product_id = l.product_id);

  select coalesce(sum(qty), 0) into v_sum from product_lots where product_id = p_product;
  v_diff := greatest(coalesce(p.stock, 0), 0) - v_sum;

  if v_diff < 0 then
    v_need := -v_diff;
    for r in
      select id, qty from product_lots
       where product_id = p_product and qty > 0
       order by (case when p_expired_first
                      then not (expiry_date is not null and expiry_date < current_date)
                      else (expiry_date is not null and expiry_date < current_date) end),
                expiry_date nulls last, received_at, id
       for update
    loop
      v_take := least(r.qty, v_need);
      update product_lots set qty = qty - v_take, updated_at = now() where id = r.id;
      v_need := v_need - v_take;
      exit when v_need <= 0;
    end loop;
  elsif v_diff > 0 then
    select id into v_head from product_lots
     where product_id = p_product and qty > 0
       and (expiry_date is null or expiry_date >= current_date)
     order by expiry_date nulls last, received_at, id
     limit 1
     for update;
    if v_head is not null then
      update product_lots set qty = qty + v_diff, updated_at = now() where id = v_head;
    elsif not exists (select 1 from product_lots where product_id = p_product) then
      -- أوّلُ رصيدٍ للمادة: دفعةٌ افتتاحيةٌ بتاريخها **كما هو** — ولو فات: تاريخٌ منتهٍ
      -- يبقى تنبيهاً، ومسحُه كان يُخرج المادةَ من قائمة المنتهي (أمسكه فحصُ 0212).
      insert into product_lots (clinic_id, product_id, qty, received_qty, expiry_date, received_at, source)
      values (p.clinic_id, p_product, v_diff, v_diff, p.expiry_date, coalesce(p.created_at, now()), 'opening');
    else
      -- رصيدٌ جديدٌ بعد نفاد دفعاته، بلا فاتورة: بضاعةٌ أخرى. تاريخُ المادة إن لم يفُت
      -- (نموذجُ المادة يكتبه مع الرصيد)، وإلا بلا تاريخ — لا نُلصق بها تاريخَ دفعةٍ خلصت.
      insert into product_lots (clinic_id, product_id, qty, received_qty, expiry_date, received_at, source)
      values (p.clinic_id, p_product, v_diff, v_diff,
              (case when p.expiry_date >= current_date then p.expiry_date end), now(), 'adjust');
    end if;
  end if;

  perform lots_refresh_expiry(p_product);
end $$;
revoke all on function public.lots_reconcile(uuid, boolean) from public, anon, authenticated;

-- definer: الدوالُّ الداخلية ممنوعةٌ على `authenticated`، والمحفّزُ يجري بدوره حين يحفظ
-- التطبيقُ مادةً (أمسكه التدقيقُ العدائيّ: الحزمةُ تمنح الكلَّ فلم ترَه).
create or replace function public.products_lots_sync()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform lots_reconcile(new.id);
  return null;
end $$;
drop trigger if exists products_lots_sync on public.products;
-- **مؤجَّل**: يحكم على نهاية المعاملة لا على خطواتها (تعديلُ الفاتورة يمرّ بسالبٍ وسطيّ).
create constraint trigger products_lots_sync
  after insert or update of stock on public.products
  deferrable initially deferred
  for each row execute function public.products_lots_sync();

-- ── ٣) الشراءُ يصنع دفعتَه ────────────────────────────────────────────────
create or replace function public.lots_from_purchase(p_purchase uuid, p_product uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  p      record;
  v_pur  record;
  v_recv numeric;
  v_exp  date;
  v_lot  record;
begin
  if p_purchase is null or p_product is null then return; end if;
  select id, clinic_id, pooled, farm_id, expiry_date into p from products where id = p_product;
  if not found or coalesce(p.pooled, false) or p.farm_id is not null then return; end if;
  select id, purchased_at, created_at, company_name into v_pur from purchases where id = p_purchase;
  if not found then return; end if;
  -- السطران للمادة نفسها بفاتورةٍ واحدة دفعةٌ واحدة (0205 تجمعهما على الرصيد كذلك).
  select coalesce(sum(qty), 0), max(expiry_date) into v_recv, v_exp
    from purchase_items where purchase_id = p_purchase and product_id = p_product;
  -- سطرٌ بلا تاريخ يرث تاريخَ المادة كما كان الشراءُ يفعل قبل الدفعات (record_purchase
  -- تُبقيه) — لا دفعةٌ بلا تاريخٍ تُسقط التنبيهَ حين تخلص المؤرَّخةُ قبلها.
  -- **ولا يرث تاريخاً فات**: بضاعةٌ جديدةٌ لا تصل منتهيةً على الورق. الأحدثُ من دفعاتها
  -- الصالحة أقربُ للواقع (إعادةُ شراءِ الصنف نفسه)، ثمّ تاريخُ المادة إن لم يفُت.
  v_exp := coalesce(v_exp,
    (select max(expiry_date) from product_lots where product_id = p_product and qty > 0 and expiry_date >= current_date),
    (case when p.expiry_date >= current_date then p.expiry_date end));
  select * into v_lot from product_lots where purchase_id = p_purchase and product_id = p_product for update;
  if found then
    -- تعديلُ الفاتورة: الفرقُ على المستلَم يُطبَّق على الباقي، وما بيع منها يبقى مبيعاً.
    update product_lots
       set qty = greatest(qty + (v_recv - received_qty), 0), received_qty = v_recv,
           expiry_date = case when expiry_fixed then expiry_date else coalesce(v_exp, expiry_date) end,
           company_name = v_pur.company_name, updated_at = now()
     where id = v_lot.id;
  elsif v_recv > 0 then
    insert into product_lots (clinic_id, product_id, qty, received_qty, expiry_date, received_at, source, purchase_id, company_name)
    values (p.clinic_id, p_product, v_recv, v_recv, v_exp, coalesce(v_pur.purchased_at, v_pur.created_at, now()),
            'purchase', p_purchase, v_pur.company_name);
  end if;
end $$;
revoke all on function public.lots_from_purchase(uuid, uuid) from public, anon, authenticated;

create or replace function public.lots_move_purchase(p_purchase uuid, p_from uuid, p_to uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_from record;
begin
  select * into v_from from product_lots where purchase_id = p_purchase and product_id = p_from for update;
  if not found or p_to is null then return; end if;
  -- دمجُ التوأمين (0144/0184) ينقل سطورَ الشراء: الدفعةُ تنتقل بباقيها، لا تُبنى من جديد
  -- بكامل المستلَم (وإلا سحب الحارسُ الفرقَ من أقرب دفعات الباقية فأخفى ما ينتهي قريباً).
  if exists (select 1 from product_lots where purchase_id = p_purchase and product_id = p_to) then
    update product_lots t set qty = t.qty + v_from.qty, received_qty = t.received_qty + v_from.received_qty, updated_at = now()
     where t.purchase_id = p_purchase and t.product_id = p_to;
    delete from product_lots where id = v_from.id;
  else
    update product_lots set product_id = p_to, clinic_id = (select clinic_id from products where id = p_to), updated_at = now()
     where id = v_from.id;
  end if;
end $$;
revoke all on function public.lots_move_purchase(uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.purchase_items_lots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id and old.product_id is not null then
    perform lots_move_purchase(new.purchase_id, old.product_id, new.product_id);
  end if;
  perform lots_from_purchase(new.purchase_id, new.product_id);
  return null;
end $$;
drop trigger if exists purchase_items_lots on public.purchase_items;
create trigger purchase_items_lots
  after insert or update of qty, expiry_date, product_id on public.purchase_items
  for each row execute function public.purchase_items_lots();

-- ── ٤) تعديلُ تاريخ المادة باليد = تعديلُ الدفعة التي يمثّلها ──────────────
create or replace function public.lots_user_expiry(p_product uuid, p_old date, p_new date)
returns date
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n   int;
  v_min date;
  v_any boolean;
begin
  -- يناديه محفّزٌ يجري بدور التطبيق: يفحص العيادةَ بنفسه (مادةُ عيادةٍ أخرى لا تُلمس دفعاتُها).
  if not exists (select 1 from products where id = p_product and clinic_id = auth_clinic()) then
    return p_new;
  end if;
  update product_lots set expiry_date = p_new, expiry_fixed = true, updated_at = now()
   where product_id = p_product and qty > 0 and expiry_date is not distinct from p_old;
  get diagnostics v_n = row_count;
  -- التاريخُ القديم لا يطابق دفعةً بعينها ودفعةٌ وحيدةٌ فيها رصيد: هي المقصودة.
  if v_n = 0 and (select count(*) from product_lots where product_id = p_product and qty > 0) = 1 then
    update product_lots set expiry_date = p_new, expiry_fixed = true, updated_at = now() where product_id = p_product and qty > 0;
  end if;
  select coalesce(min(expiry_date) filter (where expiry_date >= current_date), min(expiry_date)), bool_or(true)
    into v_min, v_any from product_lots where product_id = p_product and qty > 0;
  return case when coalesce(v_any, false) then v_min else p_new end;
end $$;
revoke all on function public.lots_user_expiry(uuid, date, date) from public, anon;
grant execute on function public.lots_user_expiry(uuid, date, date) to authenticated;

create or replace function public.products_lot_expiry()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  -- طلباتُ التطبيق وحدها: الدوالُّ (definer) تكتب التاريخَ المشتقّ بهويّة مالكها فتمرّ.
  if current_user <> 'authenticated' or new.expiry_date is not distinct from old.expiry_date then
    return new;
  end if;
  new.expiry_date := lots_user_expiry(new.id, old.expiry_date, new.expiry_date);
  return new;
end $$;
drop trigger if exists products_lot_expiry on public.products;
create trigger products_lot_expiry
  before update of expiry_date on public.products
  for each row execute function public.products_lot_expiry();

-- ── ٥) أفعالُ العيادة على الدفعات (صلاحيةُ products_write نفسُها) ─────────
create or replace function public.lot_add(p_product uuid, p_qty numeric, p_expiry date, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  p        record;
  v_id     uuid;
begin
  if v_clinic is null or auth_role() is distinct from 'manager' and auth_role() is distinct from 'veterinarian' then
    raise exception 'lot_forbidden' using hint = 'الدفعات لمن يعدّل المخزن (المدير أو الطبيب)';
  end if;
  if p_qty is null or not (p_qty > 0 and p_qty <= 1000000000) then
    raise exception 'lot_bad_qty' using hint = 'الكمية لازم تكون أكثر من صفر';
  end if;
  select id, clinic_id, pooled, farm_id into p from products where id = p_product and clinic_id = v_clinic for update;
  if not found or coalesce(p.pooled, false) or p.farm_id is not null then
    raise exception 'lot_product_missing' using hint = 'المادة ما موجودة بمخزن العيادة (أو رصيدها بالقسم)';
  end if;
  insert into product_lots (clinic_id, product_id, qty, received_qty, expiry_date, source, note)
  values (v_clinic, p_product, p_qty, p_qty, p_expiry, 'added', left(nullif(btrim(coalesce(p_note, '')), ''), 200))
  returning id into v_id;
  update products set stock = coalesce(stock, 0) + p_qty where id = p_product and clinic_id = v_clinic;
  perform lots_refresh_expiry(p_product);
  return v_id;
end $$;
revoke all on function public.lot_add(uuid, numeric, date, text) from public, anon;
grant execute on function public.lot_add(uuid, numeric, date, text) to authenticated;

-- تصحيحُ تاريخ دفعة، أو فصلُ جزءٍ منها بتاريخٍ آخر (الافتتاحيةُ غالباً خليطُ تواريخ).
-- الرصيدُ لا يتغيّر بأيّهما.
create or replace function public.lot_edit(p_lot uuid, p_expiry date, p_split_qty numeric default null)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  l        record;
  v_id     uuid;
begin
  if v_clinic is null or auth_role() is distinct from 'manager' and auth_role() is distinct from 'veterinarian' then
    raise exception 'lot_forbidden' using hint = 'الدفعات لمن يعدّل المخزن (المدير أو الطبيب)';
  end if;
  select * into l from product_lots where id = p_lot and clinic_id = v_clinic for update;
  if not found then
    raise exception 'lot_missing' using hint = 'الدفعة ما موجودة — حدّث الصفحة';
  end if;
  if p_split_qty is null or p_split_qty >= l.qty then
    update product_lots set expiry_date = p_expiry, expiry_fixed = true, updated_at = now() where id = l.id;
    v_id := l.id;
  else
    if not (p_split_qty > 0) then
      raise exception 'lot_bad_qty' using hint = 'الكمية لازم تكون أكثر من صفر';
    end if;
    update product_lots set qty = qty - p_split_qty, updated_at = now() where id = l.id;
    insert into product_lots (clinic_id, product_id, qty, received_qty, expiry_date, received_at, source, purchase_id, company_name, note, expiry_fixed)
    values (v_clinic, l.product_id, p_split_qty, p_split_qty, p_expiry, l.received_at,
            (case when l.source = 'purchase' then 'adjust' else l.source end), null, l.company_name, l.note, true)
    returning id into v_id;
  end if;
  perform lots_refresh_expiry(l.product_id);
  return v_id;
end $$;
revoke all on function public.lot_edit(uuid, date, numeric) from public, anon;
grant execute on function public.lot_edit(uuid, date, numeric) to authenticated;

-- ── ٦) ما يوجد اليوم: دفعةٌ افتتاحيةٌ لكلّ رصيد ───────────────────────────
insert into public.product_lots (clinic_id, product_id, qty, received_qty, expiry_date, received_at, source)
select p.clinic_id, p.id, p.stock, p.stock, p.expiry_date, coalesce(p.created_at, now()), 'opening'
  from public.products p
 where coalesce(p.stock, 0) > 0 and not coalesce(p.pooled, false) and p.farm_id is null
   and not exists (select 1 from public.product_lots l where l.product_id = p.id);

-- ── ٧) الجردُ بالدفعة (0216 + سطورُ دفعات) ────────────────────────────────
alter table public.stock_counts add column if not exists lot_counts jsonb;
comment on column public.stock_counts.lot_counts is
  'عدُّ كلّ دفعة (0217): [{lot_id, expiry_date, system, counted}] — يُطبَّق على دفعاته بالموافقة. NULL = عدٌّ للمادة كلّها.';

create or replace function public.stock_count_submit(p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_uid     uuid := auth.uid();
  v_name    text;
  l         jsonb;
  v_pid     uuid;
  v_p       record;
  v_counted numeric;
  v_diff    numeric;
  v_reason  text;
  v_note    text;
  n_match   int := 0;
  n_pending int := 0;
  -- 0217: عدٌّ بالدفعة
  lc        jsonb;
  v_lid     uuid;
  v_lc      numeric;
  v_l       record;
  v_lots    jsonb;
  v_lsum    numeric;
  v_lsys    numeric;
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'count_empty' using hint = 'ماكو سطور بالعدّ';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'count_too_many' using hint = 'أكثر من ٢٠٠ مادة بمرّة — قسّم العدّ';
  end if;
  -- مشغّلُ المنصّة داخلٌ بهويّته (0151): لا اسمَ له بسجلّ العيادة.
  v_name := case when is_platform_admin() then null else coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid)) end;

  for l in select value from jsonb_array_elements(p_lines) loop
    begin
      v_pid := (l->>'product_id')::uuid;
      v_counted := (l->>'counted')::numeric;
    exception when others then
      raise exception 'count_bad_line' using hint = 'سطرٌ بالعدّ ناقص أو رقمه غلط';
    end;
    if v_counted is null or not (v_counted between 0 and 1000000000) then
      raise exception 'count_bad_qty' using hint = 'العدد لازم يكون صفر أو أكثر';
    end if;

    select id, name, stock, purchase_price, pooled into v_p
      -- مخزنُ الحقل (0191) خارج: له جردُه بصفحته، ولا يختلط بمال العيادة.
      from products where id = v_pid and clinic_id = v_clinic and farm_id is null
      for update;
    if not found then
      raise exception 'count_product_missing' using hint = 'مادةٌ بالعدّ ما موجودة بمخزن العيادة — حدّث الصفحة';
    end if;
    if coalesce(v_p.pooled, false) then
      raise exception 'count_pooled'
        using hint = format('«%s» رصيدها بمخزون القسم — تنعدّ من «تعديل / جرد» القسم', v_p.name);
    end if;

    -- 0217: عدٌّ بالدفعة — كلُّ دفعةٍ بعددها، والمادةُ = مجموعُ المعدود + ما لم يُعدّ من دفعاتها.
    v_lots := null;
    if jsonb_typeof(l->'lots') = 'array' and jsonb_array_length(l->'lots') > 0 then
      v_lots := '[]'::jsonb; v_lsum := 0; v_lsys := 0;
      for lc in select value from jsonb_array_elements(l->'lots') loop
        begin
          v_lid := (lc->>'lot_id')::uuid;
          v_lc := (lc->>'counted')::numeric;
        exception when others then
          raise exception 'count_bad_line' using hint = 'سطرٌ بالعدّ ناقص أو رقمه غلط';
        end;
        if v_lc is null or not (v_lc between 0 and 1000000000) then
          raise exception 'count_bad_qty' using hint = 'العدد لازم يكون صفر أو أكثر';
        end if;
        if v_lots @> jsonb_build_array(jsonb_build_object('lot_id', v_lid)) then
          raise exception 'count_bad_line' using hint = 'دفعةٌ مكرّرة بنفس العدّ';
        end if;
        select id, qty, expiry_date into v_l from product_lots
         where id = v_lid and product_id = v_pid and clinic_id = v_clinic;
        if not found then
          raise exception 'count_lot_missing' using hint = format('«%s»: دفعةٌ بالعدّ ما موجودة — حدّث الصفحة', v_p.name);
        end if;
        v_lots := v_lots || jsonb_build_array(jsonb_build_object('lot_id', v_lid, 'expiry_date', v_l.expiry_date, 'system', v_l.qty, 'counted', v_lc));
        v_lsum := v_lsum + v_lc;
        v_lsys := v_lsys + v_l.qty;
      end loop;
      v_counted := v_lsum + greatest(coalesce(v_p.stock, 0) - v_lsys, 0);
    end if;

    v_diff := v_counted - coalesce(v_p.stock, 0);
    v_reason := nullif(btrim(coalesce(l->>'reason', '')), '');
    v_note := left(nullif(btrim(coalesce(l->>'note', '')), ''), 200);
    if v_diff = 0 then
      v_reason := null;
    elsif v_diff < 0 and (v_reason is null or v_reason not in ('damaged', 'expired', 'shortage', 'entry_error')) then
      raise exception 'count_reason'
        using hint = format('«%s» ناقصة — اختر السبب: تالف، منتهي، عجز، أو خطأ إدخال', v_p.name);
    elsif v_diff > 0 and (v_reason is null or v_reason not in ('found', 'entry_error')) then
      raise exception 'count_reason'
        using hint = format('«%s» زايدة — اختر السبب: لقينا زيادة، أو خطأ إدخال', v_p.name);
    end if;

    -- معلَّقٌ ينتظر المدير لا يُلغيه عدٌّ جديد: عدٌّ «مطابق» من موظفٍ آخر كان سيمحو
    -- النقصَ قبل أن يراه أحد. المديرُ يوافق أو يرفض، ثمّ تُعدّ المادةُ من جديد.
    if exists (select 1 from stock_counts where clinic_id = v_clinic and product_id = v_pid and status = 'pending') then
      raise exception 'count_already_pending'
        using hint = format('«%s» عدّها أحد وتنتظر موافقة المدير — يوافق أو يرفض أوّلاً', v_p.name);
    end if;

    insert into stock_counts (clinic_id, product_id, product_name, system_qty, counted_qty, unit_cost,
                              reason, note, status, counted_by, counted_by_name, lot_counts)
    values (v_clinic, v_pid, v_p.name, coalesce(v_p.stock, 0), v_counted,
            greatest(coalesce(v_p.purchase_price, 0), 0), v_reason, v_note,
            (case when v_diff = 0 then 'matched' else 'pending' end), v_uid, v_name, v_lots);
    if v_diff = 0 then n_match := n_match + 1; else n_pending := n_pending + 1; end if;
  end loop;

  return jsonb_build_object('matched', n_match, 'pending', n_pending);
end $$;
revoke all on function public.stock_count_submit(jsonb) from public, anon;
grant execute on function public.stock_count_submit(jsonb) to authenticated;

create or replace function public.stock_count_decide(p_ids uuid[], p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_uid    uuid := auth.uid();
  v_name   text;
  r        record;
  v_old    numeric;
  v_new    numeric;
  v_done   uuid[] := '{}';
  n_ok     int := 0;
  n_rej    int := 0;
  n_void   int := 0;
  v_reason text;
  v_label  text;
  v_amt    numeric;
  v_items  text;
  v_exp    uuid;
  v_out    jsonb := '[]'::jsonb;
  lc       jsonb;
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  if auth_role() is distinct from 'manager' then
    -- P0001 (الافتراضي) لا 42501: الواجهةُ تعرض الـhint العربيّ لرفضٍ مقصودٍ وحده.
    raise exception 'count_needs_manager'
      using hint = 'الموافقة على فرق الجرد للمدير وحده — افتح وضع المدير';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or p_approve is null then
    raise exception 'count_nothing' using hint = 'ما اخترت ولا سطر';
  end if;
  -- مشغّلُ المنصّة داخلٌ بهويّته (0151): لا اسمَ له بسجلّ العيادة.
  v_name := case when is_platform_admin() then null else coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid)) end;

  -- الأقفالُ بترتيب العدّ نفسه (المادةُ ثمّ سطرُها) — وإلا تعانق عدٌّ وموافقةٌ لنفس المادة.
  perform 1 from products
   where clinic_id = v_clinic
     and id in (select c.product_id from stock_counts c where c.id = any(p_ids) and c.clinic_id = v_clinic and c.status = 'pending')
   order by id
   for update;

  for r in select * from stock_counts
            where id = any(p_ids) and clinic_id = v_clinic and status = 'pending'
            order by counted_at, id
            for update
  loop
    if not p_approve then
      update stock_counts set status = 'rejected', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
       where id = r.id;
      n_rej := n_rej + 1;
      continue;
    end if;

    select stock into v_old from products where id = r.product_id and clinic_id = v_clinic for update;
    if not found then
      update stock_counts set status = 'void', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
       where id = r.id;
      n_void := n_void + 1;
      continue;
    end if;
    -- **الفرقُ لا الرقم**: ما بيع بين العدّ والموافقة يبقى مبيعاً.
    v_new := greatest(coalesce(v_old, 0) + (r.counted_qty - r.system_qty), 0);
    -- 0217: عدٌّ بالدفعة يُطبَّق على دفعاته بعينها، ثمّ الرصيد، ثمّ الحارسُ فوراً — وبسبب
    -- «منتهي» يُسحب من المنتهي أوّلاً (لا من الصالح كما بالبيع).
    if jsonb_typeof(r.lot_counts) = 'array' then
      for lc in select value from jsonb_array_elements(r.lot_counts) loop
        update product_lots
           set qty = greatest(qty + ((lc->>'counted')::numeric - (lc->>'system')::numeric), 0), updated_at = now()
         where id = (lc->>'lot_id')::uuid and product_id = r.product_id and clinic_id = v_clinic;
      end loop;
    end if;
    update products set stock = v_new where id = r.product_id and clinic_id = v_clinic;
    perform lots_reconcile(r.product_id, r.reason = 'expired');
    update stock_counts
       set status = 'approved', applied_delta = v_new - coalesce(v_old, 0),
           decided_by = v_uid, decided_by_name = v_name, decided_at = now()
     where id = r.id;
    v_done := v_done || r.id;
    n_ok := n_ok + 1;
  end loop;

  -- سحبٌ لكلّ سببِ خسارة، بموادّه بالضبط وبسعر الشراء. خطأُ الإدخال والزيادةُ لا سحبَ لهما.
  for v_reason in
    select distinct c.reason from stock_counts c
     where c.id = any(v_done) and c.reason in ('damaged', 'expired', 'shortage')
     order by 1
  loop
    v_label := (case v_reason when 'damaged' then 'تالف' when 'expired' then 'منتهي' else 'عجز' end);
    select sum(-c.applied_delta * c.unit_cost),
           string_agg(format('%s ×%s', c.product_name, trim_scale(-c.applied_delta)), '، ' order by c.product_name)
      into v_amt, v_items
      from stock_counts c
     where c.id = any(v_done) and c.reason = v_reason and c.applied_delta < 0 and c.unit_cost > 0;
    v_amt := round(coalesce(v_amt, 0), 2);
    continue when v_amt <= 0;
    insert into expenses (clinic_id, amount, description, category, method, staff_id, spent_at)
    values (v_clinic, v_amt, left(format('سحب مخزن — %s: %s', v_label, v_items), 1000),
            'سحب مخزن', 'stock', v_uid, now())
    returning id into v_exp;
    update stock_counts set expense_id = v_exp
     where id = any(v_done) and reason = v_reason and applied_delta < 0 and unit_cost > 0;
    v_out := v_out || jsonb_build_object('reason', v_reason, 'amount', v_amt, 'expense_id', v_exp);
  end loop;

  return jsonb_build_object('approved', n_ok, 'rejected', n_rej, 'void', n_void, 'withdrawals', v_out);
end $$;
revoke all on function public.stock_count_decide(uuid[], boolean) from public, anon;
grant execute on function public.stock_count_decide(uuid[], boolean) to authenticated;
