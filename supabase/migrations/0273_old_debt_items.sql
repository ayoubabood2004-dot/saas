-- ============================================================================
-- ٠٢٧٣ — موادُّ الدين القديم: «شنو أخذ» سطراً سطراً (من المخزن أو بالاسم)، بلا خصمٍ من المخزن، ومرتجعُها صحيح
--
-- طلبُ المالك (١٦/١١): «يكدر بشكل اختياري يضيف شنو المواد الي أخذها الزبون — بشكل مباشر أو من مواد موجودة بالمخزن (ما
-- ينقص شيء من المخزن بس يعرف انو هي من نفس المادة) — حتى لو بعد فترة جا رجّعها يعرف انو احنا بايعين هاي الكمية بهاي الفترة،
-- واذا رجعت ترجع بشكل صحيح».
--
-- ── لماذا جدولٌ لا أسطرُ فاتورة ───────────────────────────────────────────────────────────────────────
-- أسطرُ invoice_items يقرؤها كلُّ قارئٍ مبيعاً: الأكثرُ مبيعاً، حركاتُ المادّة، الاستهلاك، الدفعات، فحصُ التطابق، المرتجعُ العاديّ
-- (return_invoice_items يعيد حسابَ الفاتورة من أسطرها ويكلّفها). والدينُ القديم ليس بيعاً (قرارُ المالك، 0271) والرفُّ لم يخرج منه
-- شيءٌ بالنظام — فأسطرُه بجدولٍ وحده (old_debt_items) لا يقرؤه قارئُ مبيعات، وحارسُ «لا أسطر» (0271) يبقى كما هو.
--
-- ── الكتابة: old_debt_add_items (definer) ──────────────────────────────────────────────────────────────
-- تنادي old_debt_add نفسَها (المديرُ، المرجعُ، الزبونُ، التاريخُ، العملة — بلا نسخةٍ ثانية) ثمّ تكتب الأسطرَ بالمعاملة نفسِها:
-- فشلُ سطرٍ يُسقط الدينَ كلَّه. سطرُ المخزن: المادّةُ من مخزن العيادة (لا الحقل) واسمُها من الصفّ لا من الجهاز؛ سطرٌ بالاسم: اسمُه
-- كما كُتب. الكميةُ موجبة، والسعرُ (بعملة الدين) صفرٌ فأكثر، ومجموعُ الأسطر ≤ مبلغِ الدين (الباقي «غيرها»: خدمة، علاج).
-- و«شنو» الفارغ يُكتب من الأسطر. والمرجعُ نفسُه يُرجع الدينَ نفسَه بأسطره (لا أسطرَ ثانية).
--
-- ── المرتجع: old_debt_return (definer) ─────────────────────────────────────────────────────────────────
-- لكلّ الكادر كمرتجع الفاتورة (لا المشغّل — سطرُ مالٍ يسمّي العيادة، 0151)، وبمرجع إعادة (old_debt_returns): ردٌّ ضائع ثمّ إعادة =
-- مرتجعٌ واحد. سطراً سطراً: لا أكثر من الباقي (ما رجع قبلُ محسوب)، والمادّةُ ترجع **للرفّ** (الزبونُ رجّعها فعلاً) — وإن اندمجت فلأصلها
-- (products_trash.merged_into)، وإن حُذفت يُرفض بجملة (رجّعها من المحذوفات أوّلاً) لا رصيدٌ يضيع بصمت. والمالُ بقاعدة 0121/0241
-- حرفاً: الدينُ ينقص أوّلاً، ثمّ الخصمُ (يُستهلك قبل أيّ نقد)، ولا نقدَ يخرج إلا بما دُفع فوق الباقي — ساقٌ سالبة «مرتجع» بيومه.
-- ودينُ الدولار: الأسطرُ تُكتب (بالدولار)، والمرتجعُ عليه بمرحلة مرتجع الدولار (كلُّ فاتورة دولار — 0264) فيُرفض بجملة.
-- الحارس (invoices_opening_guard، نصُّ 0271 وفوقه أسطرٌ معلَّمة): الإجماليُّ يتحرّك ببابٍ واحد (`doctorvet.opening_return`، محلّيٌّ
-- للمعاملة) ولا يزيد، وما سواه ثابتٌ كما كان؛ وحذفُ دينٍ رجع منه شيءٌ يُرفض (يمحو أثرَ ما رجع للرفّ).
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0271 وقبل الواجهة. تراجع: أعد invoices_opening_guard حرفاً من 0271؛ drop function
--   old_debt_return(uuid, jsonb, text, text, text)؛ drop function old_debt_add_items(text, text, text, text, numeric, text, date, text, jsonb)؛
--   drop table old_debt_returns؛ drop table old_debt_items.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.old_debt_add(text,text,text,text,numeric,text,date,text)') is null
     or to_regprocedure('public.invoice_forgiveness_consume(uuid,uuid,numeric,text,numeric,numeric)') is null
     or to_regprocedure('public.photographer_fence_table(text)') is null
     or to_regclass('public.products_trash') is null then
    raise exception 'needs_0271' using hint = 'طبّق 0146 (المحذوفات) و0222 (سياج المصوّر) و0241 (الخصم) و0271 (الديون القديمة) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.invoices_opening_guard()', '2400bd1ecff6bd2212e9dae592a42af8', '-- +0273');

-- ── ١) الجدولان ────────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.old_debt_items (
  id            uuid primary key default gen_random_uuid(),
  clinic_id     uuid not null default auth_clinic(),
  invoice_id    uuid not null references public.invoices(id) on delete cascade,
  product_id    uuid,
  name          text not null,
  qty           numeric not null,
  unit_price    numeric not null default 0,
  unit_price_usd numeric,
  returned_qty  numeric not null default 0,
  created_at    timestamptz not null default now(),
  constraint old_debt_items_shape check (
    char_length(btrim(name)) between 1 and 120 and qty > 0 and qty < 1000000
    and unit_price >= 0 and unit_price < 10000000000 and (unit_price_usd is null or (unit_price_usd >= 0 and unit_price_usd < 1000000000))
    and returned_qty >= 0 and returned_qty <= qty)
);
create index if not exists old_debt_items_invoice on public.old_debt_items (invoice_id);
create index if not exists old_debt_items_product on public.old_debt_items (clinic_id, product_id) where product_id is not null;
comment on table public.old_debt_items is
  'موادُّ الدين القديم (0273): ما أخذه الزبونُ قبل النظام — من المخزن (product_id، مرجعٌ ليّن بلا مفتاح: المادّةُ تُطوى وتُسترجع بمعرّفها) '
  'أو بالاسم. لا تُنقص المخزن، وليست مبيعاً بأيّ قارئ. returned_qty ما رجع منها (old_debt_return). الكتابةُ من الدالّتين وحدهما.';

create table if not exists public.old_debt_returns (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null default auth_clinic(),
  invoice_id  uuid not null references public.invoices(id) on delete cascade,
  client_ref  text,
  lines       jsonb not null default '[]'::jsonb,
  value       numeric not null default 0,
  cash_back   numeric not null default 0,
  note        text,
  created_at  timestamptz not null default now(),
  created_by  uuid default auth.uid(),
  constraint old_debt_returns_note check (char_length(coalesce(note, '')) <= 200)
);
create index if not exists old_debt_returns_invoice on public.old_debt_returns (invoice_id);
create unique index if not exists old_debt_returns_ref on public.old_debt_returns (clinic_id, client_ref) where client_ref is not null;
comment on table public.old_debt_returns is
  'مرتجعاتُ الدين القديم (0273): سطرٌ لكلّ مرتجع — ما رجع (lines) وقيمتُه وما خرج نقداً — ومرجعُ الإعادة (ردٌّ ضائع ثمّ إعادة = مرتجعٌ واحد).';

alter table public.old_debt_items enable row level security;
drop policy if exists old_debt_items_read on public.old_debt_items;
create policy old_debt_items_read on public.old_debt_items for select to authenticated
  using (clinic_id = (select auth_clinic()));
alter table public.old_debt_returns enable row level security;
drop policy if exists old_debt_returns_read on public.old_debt_returns;
create policy old_debt_returns_read on public.old_debt_returns for select to authenticated
  using (clinic_id = (select auth_clinic()));
revoke all on table public.old_debt_items from anon, authenticated;
revoke all on table public.old_debt_returns from anon, authenticated;
grant select on table public.old_debt_items to authenticated;
grant select on table public.old_debt_returns to authenticated;
select public.photographer_fence_table('old_debt_items');
select public.photographer_fence_table('old_debt_returns');

-- ── ٢) الحارس: المرتجعُ وحده يحرّك الإجماليّ (ولا يزيده)، والحذفُ بعد مرتجعٍ يُرفض ────────────────────────────
create or replace function public.invoices_opening_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.sale_kind = 'opening' then
      if coalesce(current_setting('doctorvet.opening_door', true), '') <> 'on' then
        raise exception 'opening_door' using errcode = 'P0001', hint = 'الدينُ القديم ينسجل من «دين قديم» بسجلّ الديون وحده (للمدير).';
      end if;
      new.cost_total := 0;
      new.profit := 0;
      new.item_count := 0;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.sale_kind = 'opening' and (coalesce(old.amount_paid, 0) > 0.005
       or (jsonb_typeof(old.payment_details) = 'array' and jsonb_array_length(old.payment_details) > 0)) then
      raise exception 'opening_delete_settled' using errcode = 'P0001',
        hint = 'على هذا الدين تسديد — حذفُه يمحو قبضاً انحسب بيومه. اخصم الباقي («خصم على الدين») بدل الحذف.';
    end if;
    -- 0273: مادّةٌ رجعت منه للرفّ — حذفُه يمحو أثرَ ما رجع (الرصيدُ زاد بسببه). -- +0273
    if old.sale_kind = 'opening' and exists (select 1 from old_debt_items d where d.invoice_id = old.id and d.returned_qty > 0) then -- +0273
      raise exception 'opening_delete_returned' using errcode = 'P0001', -- +0273
        hint = 'من هذا الدين رجعت مادّة للمخزن — حذفُه يمحو أثرَ ما رجع. اخصم الباقي («خصم على الدين») بدل الحذف.'; -- +0273
    end if; -- +0273
    return old;
  end if;
  if (new.sale_kind = 'opening') is distinct from (old.sale_kind = 'opening') then
    raise exception 'opening_kind_frozen' using errcode = 'P0001', hint = 'الدينُ القديم يبقى ديناً قديماً، والبيعُ يبقى بيعاً.';
  end if;
  if old.sale_kind <> 'opening' then
    return new;
  end if;
  if new.status is distinct from old.status then
    raise exception 'opening_no_refund' using errcode = 'P0001',
      hint = 'الدينُ القديم ما يترجّع — ما بيه بضاعة. للغلط: احذفه (إذا ما عليه تسديد) أو اخصم الباقي.';
  end if;
  -- 0273: بابُ المرتجع (old_debt_return): الإجماليُّ ومخصومُه ومجموعُه يتحرّكون — نزولاً وحده — وما سواها ثابت. -- +0273
  if coalesce(current_setting('doctorvet.opening_return', true), '') = 'on' -- +0273
     and round(coalesce(new.total, 0) + coalesce(new.forgiven, 0), 2) <= round(coalesce(old.total, 0) + coalesce(old.forgiven, 0), 2) -- +0273
     and (new.discount, new.discount_type, new.opening_what, new.opening_why, new.currency, new.fx_rate, new.total_usd) -- +0273
         is not distinct from (old.discount, old.discount_type, old.opening_what, old.opening_why, old.currency, old.fx_rate, old.total_usd) then -- +0273
    new.cost_total := 0; -- +0273
    new.profit := 0; -- +0273
    new.item_count := 0; -- +0273
    return new; -- +0273
  end if; -- +0273
  if round(coalesce(new.total, 0) + coalesce(new.forgiven, 0), 2) is distinct from round(coalesce(old.total, 0) + coalesce(old.forgiven, 0), 2)
     or (new.subtotal, new.discount, new.discount_type, new.opening_what, new.opening_why, new.currency, new.fx_rate, new.total_usd)
        is distinct from (old.subtotal, old.discount, old.discount_type, old.opening_what, old.opening_why, old.currency, old.fx_rate, old.total_usd) then
    raise exception 'opening_amount_frozen' using errcode = 'P0001',
      hint = 'مبلغُ الدين القديم وما هو ما يتعدّلان — احذفه وسجّله من جديد (إذا ما عليه تسديد)، أو اخصم الفرق.';
  end if;
  new.cost_total := 0;
  new.profit := 0;
  new.item_count := 0;
  return new;
end $$;
revoke all on function public.invoices_opening_guard() from public, anon, authenticated;
drop trigger if exists invoices_opening_guard on public.invoices;
create trigger invoices_opening_guard before insert or update or delete on public.invoices
  for each row execute function public.invoices_opening_guard();

-- ── ٣) الكتابة: دينٌ قديم بأسطره ────────────────────────────────────────────────────────────────────────
-- p_items: [{product_id?, name?, qty, price}] — price بعملة الدين (دينار، أو دولار لدين الدولار). نصٌّ عشريّ أو رقم.
create or replace function public.old_debt_add_items(
  p_name text, p_phone text, p_what text, p_why text, p_amount numeric,
  p_currency text, p_date date, p_client_ref text, p_items jsonb)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_cur    text := upper(coalesce(nullif(btrim(coalesce(p_currency, '')), ''), 'IQD'));
  v_what   text := nullif(btrim(regexp_replace(coalesce(p_what, ''), E'[ \t\r\n]+', ' ', 'g')), '');
  v_inv    invoices;
  v_n      int;
  e        jsonb;
  v_pid    uuid;
  v_name   text;
  v_qty    numeric;
  v_price  numeric;
  v_sum    numeric := 0;
  v_names  text[] := '{}';
  v_amount numeric;
  v_ref    text := nullif(btrim(coalesce(p_client_ref, '')), '');
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 or jsonb_array_length(p_items) > 100 then
    raise exception 'old_debt_items' using hint = 'المواد: من ١ إلى ١٠٠ سطر.';
  end if;
  -- إعادةٌ بمرجعٍ ثبت: الدينُ نفسُه بأسطره — قبل أيّ فحص (كـold_debt_add؛ مخزنٌ تبدّل بين المحاولتين لا يرفض ما ثبت).
  if v_ref is not null then
    select * into v_inv from invoices where clinic_id = v_clinic and client_ref = v_ref;
    if found then
      return old_debt_add(p_name, p_phone, p_what, p_why, p_amount, p_currency, p_date, p_client_ref);
    end if;
  end if;
  -- المرورُ الأوّل: الاسمُ من الصفّ (لا من الجهاز) لـ«شنو» إن تُرك فارغاً.
  for e in select * from jsonb_array_elements(p_items) loop
    if jsonb_typeof(e) <> 'object' then
      raise exception 'old_debt_item' using hint = 'سطرُ مادّةٍ غلط — أعد فتح النافذة.';
    end if;
    v_pid := null;
    if nullif(btrim(coalesce(e->>'product_id', '')), '') is not null then
      if (e->>'product_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
        raise exception 'old_debt_item' using hint = 'سطرُ مادّةٍ غلط — أعد فتح النافذة.';
      end if;
      v_pid := (e->>'product_id')::uuid;
      select p.name into v_name from products p where p.id = v_pid and p.clinic_id = v_clinic and p.farm_id is null;
      if not found then
        raise exception 'old_debt_item_product' using hint = 'مادّةٌ بالقائمة مو بمخزنك (يمكن انحذفت) — شيلها أو حدّث الصفحة.';
      end if;
    else
      v_name := nullif(btrim(regexp_replace(coalesce(e->>'name', ''), E'[ \t\r\n]+', ' ', 'g')), '');
      if v_name is null or char_length(v_name) > 120 then
        raise exception 'old_debt_item_name' using hint = 'اكتب اسم كلّ مادّة (لحدّ ١٢٠ حرف).';
      end if;
    end if;
    v_names := v_names || left(btrim(v_name), 120);
  end loop;
  if v_what is null then
    v_what := left(array_to_string(v_names, '، '), 200);
  end if;

  -- الدينُ نفسُه من بابه (المديرُ، الزبونُ، المبلغُ، التاريخُ، العملة) — وما يُرفض بعده يُسقطه معه (معاملةٌ واحدة).
  v_inv := old_debt_add(p_name, p_phone, v_what, p_why, p_amount, p_currency, p_date, p_client_ref);
  select count(*) into v_n from old_debt_items where invoice_id = v_inv.id;
  if v_n > 0 then
    return v_inv;
  end if;
  v_amount := case when v_inv.currency = 'USD' then v_inv.total_usd else v_inv.total + coalesce(v_inv.forgiven, 0) end;

  for e in select * from jsonb_array_elements(p_items) loop
    v_pid := nullif(btrim(coalesce(e->>'product_id', '')), '')::uuid;
    if v_pid is not null then
      select p.name into v_name from products p where p.id = v_pid and p.clinic_id = v_clinic;
    else
      v_name := nullif(btrim(regexp_replace(coalesce(e->>'name', ''), E'[ \t\r\n]+', ' ', 'g')), '');
    end if;
    v_qty := case when btrim(coalesce(e->>'qty', '')) ~ '^[0-9]+(\.[0-9]+)?$' then round(btrim(e->>'qty')::numeric, 3) end;
    v_price := case when btrim(coalesce(e->>'price', '')) ~ '^[0-9]+(\.[0-9]+)?$' then round(btrim(e->>'price')::numeric, 2) end;
    if v_qty is null or v_qty <= 0 or v_qty >= 1000000 then
      raise exception 'old_debt_item_qty' using hint = format('عدد «%s» لازم يكون أكبر من صفر.', left(v_name, 60));
    end if;
    if v_price is null or v_price >= (case when v_inv.currency = 'USD' then 1000000000 else 10000000000 end) then
      raise exception 'old_debt_item_price' using hint = format('سعر «%s» غلط — صفر أو أكثر.', left(v_name, 60));
    end if;
    v_sum := v_sum + round(v_qty * v_price, 2);
    insert into old_debt_items (clinic_id, invoice_id, product_id, name, qty, unit_price, unit_price_usd)
    values (v_clinic, v_inv.id, v_pid, left(v_name, 120), v_qty,
            case when v_inv.currency = 'USD' then _usd_iqd(v_price, v_inv.fx_rate, 1) else v_price end,
            case when v_inv.currency = 'USD' then v_price end);
  end loop;
  if v_sum > v_amount + 0.005 then
    raise exception 'old_debt_items_sum' using hint = format('مجموع المواد (%s) أكبر من مبلغ الدين (%s) — صحّح المبلغ أو الأسعار.',
      rtrim(to_char(v_sum, 'FM999,999,999,990.99'), '.'), rtrim(to_char(v_amount, 'FM999,999,999,990.99'), '.'));
  end if;
  return v_inv;
end $$;
revoke all on function public.old_debt_add_items(text, text, text, text, numeric, text, date, text, jsonb) from public, anon;
grant execute on function public.old_debt_add_items(text, text, text, text, numeric, text, date, text, jsonb) to authenticated;
comment on function public.old_debt_add_items(text, text, text, text, numeric, text, date, text, jsonb) is
  'دينٌ قديم بموادّه (0273): old_debt_add نفسُها ثمّ الأسطرُ بالمعاملة نفسِها — لا تُنقص المخزن، ومجموعُها ≤ المبلغ.';

-- ── ٤) المرتجع ─────────────────────────────────────────────────────────────────────────────────────────
-- p_returns: [{item_id, qty}]. الطريقةُ للنقد الخارج (إن خرج)، والملاحظةُ اختياريّة، والمرجعُ للإعادة.
create or replace function public.old_debt_return(
  p_invoice uuid, p_returns jsonb, p_method text default null, p_note text default null, p_client_ref text default null)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic   uuid := auth_clinic();
  v_ref      text := nullif(btrim(coalesce(p_client_ref, '')), '');
  v_note     text := nullif(btrim(coalesce(p_note, '')), '');
  v_inv      invoices;
  e          jsonb;
  it         old_debt_items;
  v_id       uuid;
  v_q        numeric;
  v_left     numeric;
  v_target   uuid;
  v_hops     int;
  v_val      numeric := 0;
  v_n        int := 0;
  v_lines    jsonb := '[]'::jsonb;
  v_restock  jsonb := '[]'::jsonb;
  r          record;
  v_paid     numeric;
  v_forg_old numeric;
  v_forg_new numeric;
  v_gross    numeric;
  v_total    numeric;
  v_back     numeric;
  v_details  jsonb;
  v_method   text;
  v_pos      numeric;
  v_stamp    text;
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  if platform_acting_clinic() is not null then
    raise exception 'operator_not_allowed' using errcode = '42501',
      hint = 'مشغّلُ المنصّة لا يسجّل مرتجعاً للعيادة — المرتجعُ سطرُ مالٍ يكتبه كادرُها.';
  end if;
  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found or v_inv.sale_kind is distinct from 'opening' then
    raise exception 'old_debt_not_found' using hint = 'الدينُ القديم مو موجود بعيادتك — حدّث الصفحة.';
  end if;
  -- إعادةٌ بمرجعٍ ثبت (بعد القفل: نسخةٌ متزامنة بالمرجع نفسِه تنتظر هنا ثمّ تجده) = المرتجعُ نفسُه، لا مرتجعٌ ثانٍ.
  if v_ref is not null and exists (select 1 from old_debt_returns where clinic_id = v_clinic and client_ref = v_ref) then
    return v_inv;
  end if;
  if v_inv.currency = 'USD' then
    raise exception 'old_debt_return_usd' using errcode = 'P0001',
      hint = 'المرتجعُ على دين الدولار ينزل مع مرتجع فواتير الدولار — للحين: اخصم قيمتَه من الدين («خصم على الدين») ورجّع المادّةَ للمخزن يدوياً.';
  end if;
  if p_returns is null or jsonb_typeof(p_returns) <> 'array' or jsonb_array_length(p_returns) = 0 then
    raise exception 'nothing to return';
  end if;
  if char_length(coalesce(v_note, '')) > 200 then
    raise exception 'old_debt_long' using hint = 'الملاحظة لحدّ ٢٠٠ حرف.';
  end if;

  for e in select * from jsonb_array_elements(p_returns) loop
    if jsonb_typeof(e) <> 'object' or coalesce(e->>'item_id', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'old_debt_return_item' using hint = 'سطرُ المرتجع غلط — حدّث الصفحة.';
    end if;
    v_id := (e->>'item_id')::uuid;
    v_q := case when btrim(coalesce(e->>'qty', '')) ~ '^[0-9]+(\.[0-9]+)?$' then round(btrim(e->>'qty')::numeric, 3) end;
    if v_q is null then
      raise exception 'old_debt_return_item' using hint = 'كمية المرتجع غلط.';
    end if;
    if v_q = 0 then continue; end if;
    select * into it from old_debt_items where id = v_id and invoice_id = p_invoice and clinic_id = v_clinic for update;
    if not found then
      raise exception 'old_debt_return_item' using hint = 'مادّةٌ مو من هذا الدين — حدّث الصفحة.';
    end if;
    v_left := round(it.qty - it.returned_qty, 3);
    if v_q > v_left + 0.0005 then
      raise exception 'old_debt_return_over' using errcode = 'P0001',
        hint = format('من «%s» باقي %s بس — رجع منها قبل. حدّث الصفحة.', left(it.name, 60), trim_scale(v_left)::text);
    end if;
    v_target := null;
    if it.product_id is not null then
      -- المادّةُ نفسُها، أو أصلُها إن اندمجت (سلسلةٌ قصيرة)؛ ومحذوفةٌ بلا أصل ⇒ رفضٌ بجملة لا رصيدٌ يضيع.
      v_target := it.product_id;
      v_hops := 0;
      while not exists (select 1 from products where id = v_target and clinic_id = v_clinic) loop
        v_hops := v_hops + 1;
        select t.merged_into into v_target from products_trash t where t.id = v_target and t.clinic_id = v_clinic;
        if v_target is null or v_hops > 5 then
          raise exception 'old_debt_return_gone' using errcode = 'P0001',
            hint = format('«%s» محذوفة من المخزن — رجّعها من «المحذوفات» أوّلاً، ثمّ سوّ المرتجع.', left(it.name, 60));
        end if;
      end loop;
      v_restock := v_restock || jsonb_build_object('pid', v_target, 'qty', v_q);
    end if;
    update old_debt_items set returned_qty = round(returned_qty + v_q, 3) where id = it.id;
    v_val := v_val + round(v_q * it.unit_price, 2);
    v_n := v_n + 1;
    v_lines := v_lines || jsonb_build_object('item_id', it.id, 'name', it.name, 'qty', v_q,
      'value', round(v_q * it.unit_price, 2), 'product_id', v_target);
  end loop;
  if v_n = 0 then
    raise exception 'nothing to return';
  end if;

  -- الرفّ: بترتيب المعرّف (كالبيعة، 0252) — ترتيبان متعاكسان على صفوفٍ واحدة انسداد.
  for r in select (x->>'pid')::uuid as pid, sum((x->>'qty')::numeric) as q
             from jsonb_array_elements(v_restock) x group by 1 order by 1 loop
    update products set stock = round(stock + r.q, 3) where id = r.pid and clinic_id = v_clinic;
  end loop;

  -- المال: قاعدةُ return_invoice_items (0121 → 0241) حرفاً على المجموع قبل الخصم.
  v_paid     := coalesce(v_inv.amount_paid, 0);
  v_forg_old := coalesce(v_inv.forgiven, 0);
  v_gross    := round(coalesce(v_inv.total, 0) + v_forg_old - v_val, 2);
  if v_gross < 0 then
    raise exception 'old_debt_return_value' using hint = 'قيمةُ المرتجع أكبر من الدين — حدّث الصفحة.';
  end if;
  v_forg_new := least(v_forg_old, greatest(0, v_gross - v_paid));
  v_total    := round(v_gross - v_forg_new, 2);
  v_back     := greatest(round(v_paid - v_total, 2), 0);

  v_details := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_back > 0 then
    v_method := coalesce(
      nullif(btrim(p_method), ''),
      (select x->>'method' from jsonb_array_elements(v_details) x
        where (x->>'amount')::numeric > 0 order by (x->>'amount')::numeric desc limit 1),
      v_inv.payment_method, 'cash');
    select coalesce(sum((x->>'amount')::numeric), 0) into v_pos
      from jsonb_array_elements(v_details) x where (x->>'amount')::numeric > 0;
    if v_pos < v_paid then
      v_details := v_details || jsonb_build_object(
        'method', coalesce(v_inv.payment_method, v_method),
        'amount', v_paid - v_pos,
        'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    v_details := v_details || (jsonb_build_object(
        'method', v_method, 'amount', -v_back,
        'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      || jsonb_build_object('note', left('مرتجع' || case when v_note is not null then ': ' || v_note else '' end, 120)));
  end if;

  v_stamp := 'مرتجع ' || to_char(now() at time zone 'Asia/Baghdad', 'YYYY-MM-DD') || ': '
          || (select string_agg((l->>'name') || ' × ' || trim_scale((l->>'qty')::numeric)::text, '، ') from jsonb_array_elements(v_lines) l)
          || ' · ' || to_char(coalesce(v_inv.total, 0), 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when v_back > 0 then ' · أُعيد نقداً ' || to_char(v_back, 'FM999,999,990.99') else '' end
          || case when v_note is not null then ' · ' || left(v_note, 120) else '' end;

  if v_forg_new < v_forg_old then
    perform invoice_forgiveness_consume(v_clinic, p_invoice, v_forg_old - v_forg_new, 'مرتجع', v_inv.total, v_paid);
  end if;

  perform set_config('doctorvet.opening_return', 'on', true);
  update invoices set
    subtotal        = v_gross,
    total           = v_total,
    forgiven        = v_forg_new,
    amount_paid     = greatest(round(v_paid - v_back, 2), 0),
    payment_details = v_details,
    notes           = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_inv;
  perform set_config('doctorvet.opening_return', 'off', true);

  insert into old_debt_returns (clinic_id, invoice_id, client_ref, lines, value, cash_back, note)
  values (v_clinic, p_invoice, v_ref, v_lines, v_val, v_back, v_note);
  return v_inv;
end $$;
revoke all on function public.old_debt_return(uuid, jsonb, text, text, text) from public, anon;
grant execute on function public.old_debt_return(uuid, jsonb, text, text, text) to authenticated;
comment on function public.old_debt_return(uuid, jsonb, text, text, text) is
  'مرتجعُ موادّ الدين القديم (0273): المادّةُ ترجع للرفّ، والدينُ ينقص أوّلاً ثمّ الخصمُ ثمّ النقد (0121/0241). بمرجع إعادة. الدولارُ بمرحلته.';

reset lock_timeout;
