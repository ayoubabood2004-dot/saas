-- ============================================================================
-- 0288 — الراجعُ الإكسباير: دفعةٌ بتاريخها وزبونها وكلفتها، ومن دَينه أوّلاً، والبيعُ منها بكلفتها
--
-- طلبُ المالك (٢٣/١١): «لمن نسوي راجع بشاشة المبيعات اكو خيار انه راجع اكسباير — شوكت خلص الاكسباير مالته — ويختار الدكتور
-- اسم الزبون، ولو كانت المادة عليه دين يكون مسحوب من دينه… وبالمخزن يكتبلي هاي رجعت من عنده كمية بهذا التاريخ… ولمن ابيع يكتبلي
-- تريد تبيع من الاكسباير اول لو من الجديد… وأحدد الراجع قطعة لو كارتونة». وقراراتُه: الدَّينُ من فاتورة المادّة (وما زاد يسدّد أقدمَ دَينه،
-- وما زاد بعدها نقدٌ)؛ وسعرُ البيع من الدفعة سعرُ المادّة ويُغيَّر — **والربحُ صحيح**؛ والرصيدُ ينحسب ويُسأل وقتَ البيع. الخطة: docs/expired-return-plan.md.
--
-- الحساب (لماذا لا خسارةَ وهميّة): علبةٌ بيعت بـP وكلفتُها C ورجعت بنسبة ⇒ قيمةُ الراجع V. الفاتورةُ الأصلية تنقص العلبةَ (−P، −C) ويُضاف
-- «سطرُ أثر» بلا مادّة سعرُه P − V وكلفتُه C − T، حيث T = min(V, C) كلفةُ الدفعة — فربحُها لا يتغيّر، والدَّينُ ينزل V بالضبط (الدَّينُ أوّلاً
-- ثمّ الخصمُ على الدين ثمّ النقد — حسابُ return_invoice_items حرفاً). والدفعةُ بكلفة T، فبيعُها بـV ربحُه صفر.
--
--  • `product_lots`: مصدرٌ `return` وأعمدتُه (الكلفة، الزبون، النسبة، الفاتورة، اللحظة).
--  • `lots_reconcile` (حارسُ الانجراف على 0217): البيعُ العاديّ يأخذ من دفعة الراجع آخراً، والزيادةُ لا تُضاف لها.
--  • `return_expired(items, meta)` بمرجع إعادة — يقرّر الفاتورةَ بنفسه بمفتاح الزبون (cust_key).
--  • `retail_checkout_lots(items, meta, usd, charges)`: البيعةُ كما هي، ثمّ سطرُ الدفعة بكلفتها والدفعةُ تنقص — بالمعاملة نفسِها.
--  • `return_lots_ready()` سؤالُ القدرة للواجهة.
-- خارجها (تُرفض بجملة): فاتورةُ الدولار ومادّتُه، والمجمَّعةُ بحوض القسم، والدَّينُ القديم.
-- إضافيّةٌ: الواجهةُ القديمة تعمل عليها كما هي. وتُعاد بلا أثرٍ ثانٍ.
-- تراجع: أعِد lots_reconcile من 0217؛ drop function return_expired/retail_checkout_lots/return_lots_ready؛ والأعمدةُ تبقى ولا تضرّ.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
  if to_regprocedure('public.lots_reconcile(uuid,boolean)') is null then
    raise exception 'needs_0217' using hint = 'طبّق 0217 (الدفعات) قبل هالهجرة';
  end if;
  if to_regprocedure('public.mixed_checkout(jsonb,jsonb,jsonb,uuid[])') is null then
    raise exception 'needs_0283' using hint = 'طبّق 0283 (الفاتورة بمجموعين) قبل هالهجرة';
  end if;
end $$;

-- ── ١) دفعةُ الراجع ───────────────────────────────────────────────────────────────────────────
alter table public.product_lots add column if not exists unit_cost numeric;
alter table public.product_lots add column if not exists return_from text;
alter table public.product_lots add column if not exists return_key text;
alter table public.product_lots add column if not exists return_pct integer;
alter table public.product_lots add column if not exists return_invoice uuid;
alter table public.product_lots add column if not exists returned_at timestamptz;
do $$
declare c text;
begin
  -- قيدُ المصدر القديم (0217، باسمٍ ولّده بوستغريس) يُستبدل بقيدٍ يعرف `return` — بالاسم الذي نكتبه هنا فتُعاد بلا أثر.
  for c in select conname from pg_constraint
            where conrelid = 'public.product_lots'::regclass and contype = 'c'
              and pg_get_constraintdef(oid) like '%source%' and pg_get_constraintdef(oid) like '%opening%'
  loop
    execute format('alter table public.product_lots drop constraint %I', c);
  end loop;
end $$;
alter table public.product_lots add constraint product_lots_source_check
  check (source in ('opening', 'purchase', 'added', 'adjust', 'return'));
alter table public.product_lots drop constraint if exists product_lots_return_ok;
alter table public.product_lots add constraint product_lots_return_ok
  check (source <> 'return' or (unit_cost is not null and unit_cost >= 0 and return_pct between 1 and 100 and returned_at is not null));
alter table public.product_lots drop constraint if exists product_lots_return_from_len;
alter table public.product_lots add constraint product_lots_return_from_len check (return_from is null or char_length(return_from) <= 120);
create index if not exists product_lots_return_idx on public.product_lots (clinic_id, product_id) where source = 'return' and qty > 0;

-- ── ٢) المطابقة: البيعُ العاديّ لا يأخذ من دفعة الراجع قبل غيرها، والزيادةُ لا تُضاف لها ─────────────────
select public._drift_assert('public.lots_reconcile(uuid,boolean)', 'fb9d3eefe161bc7658468c4b828d73d5', '-- +0288');

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
-- -0288        order by (case when p_expired_first
       order by (source = 'return' and not p_expired_first),   -- دفعةُ الراجع آخرَ ما يأخذه البيعُ العاديّ -- +0288
                (case when p_expired_first   -- +0288
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
       and source <> 'return'   -- الزيادةُ (مرتجعٌ عاديّ، تصحيح) لا تُضاف لدفعة راجعٍ إكسباير -- +0288
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

-- ── ٣) الراجعُ الإكسباير ────────────────────────────────────────────────────────────────────────
-- السطر: { product_id, unit: box|sub|pack, pack_id?, qty (بوحدته), pct (١–١٠٠), expiry_date, unit_price (سعرُ الوحدة بالجهاز —
-- يُقرأ حين لا فاتورة) }. وmeta: { client_ref, customer_name, customer_phone, method, note }.
-- الفاتورةُ: الأحدثُ لمفتاح الزبون فيها سطرٌ للمادّة يكفي — وما عليها دَينٌ أوّلاً؛ لا دولار ولا مرجَعة ولا دَين قديم ولا طلبَ توصيلٍ بالطريق
-- (المندوبُ يحصّل مجموعَها). بلا زبونٍ أو بلا فاتورة: سحبٌ «مرتجع» كراجع اليوم.
-- والمالُ كلُّه بطريقة الشاشة (meta.method): الساقُ السالبة على الفاتورة، وتسديدُ أقدم دَينه بما زاد، وسحبُ «مرتجع» — بطريقةٍ واحدة،
-- فالجيبُ لا يتحرّك بالتسديد (نقدٌ يخرج ونقدٌ يدخل). كانت الساقُ بطريقة الفاتورة الغالبة والتسديدُ بطريقة الشاشة: بطاقةٌ −٢٠٬٠٠٠ لم تخرج،
-- ونقدٌ +١٥٬٠٠٠ لم يدخل (مراجعةٌ عدائيّة).
-- والرصيدُ تحت الصفر (البيعُ قبل الجرد، 0253): الدفعاتُ مجموعُها greatest(الرصيد، ٠) — فما يسدّ العجزَ لا يدخل دفعة؛ كلفتُه لا تنتقل
-- إليها (T بنسبة ما دخلها)، فخسارتُه تبقى بالفاتورة صادقة — لا كلفةٌ تختفي من الفاتورة ولا تظهر بدفعة.
create or replace function public.return_expired(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_ref     text := nullif(btrim(coalesce(p_meta->>'client_ref', '')), '');
  v_name    text := nullif(btrim(coalesce(p_meta->>'customer_name', '')), '');
  v_phone   text := nullif(btrim(coalesce(p_meta->>'customer_phone', '')), '');
  v_note    text := nullif(left(btrim(coalesce(p_meta->>'note', '')), 120), '');
  v_pm      text := case lower(coalesce(p_meta->>'method', 'cash'))
                      when 'card' then 'card' when 'transfer' then 'transfer' when 'bank' then 'transfer' else 'cash' end;
  v_method  text;   -- طريقةُ السحب (expenses): bank لا transfer
  v_dial    text;
  v_key     text;
  v_hit     jsonb := '[]'::jsonb;   -- أزواجُ (اسم، رقم) تحت مفتاح الزبون
  v_out     jsonb;
  it        jsonb;
  p         products;
  v_unit    text;
  v_qty     numeric;
  v_pct     integer;
  v_exp     date;
  v_uret    numeric;   -- وحدةُ الراجع بوحدة المخزن
  v_rs      numeric;   -- الكميةُ بوحدة المخزن
  v_pack    jsonb;
  v_inv     invoices;
  li        invoice_items;
  v_r       numeric;
  v_uline   numeric;   -- وحدةُ سطر الفاتورة بوحدة المخزن
  v_rl      numeric;   -- الراجعُ بوحدة سطر الفاتورة
  v_oldv    numeric;
  v_newv    numeric;
  v_oldc    numeric;
  v_newc    numeric;
  v_nq      numeric;
  v_ns      numeric;
  v_V       numeric;   -- قيمةُ الراجع (تنزل من الدَّين أو تُعاد)
  v_T       numeric;   -- كلفةُ الراجع كلِّه = min(V, كلفته)
  v_lotq    numeric;   -- ما يدخل الدفعة (ما فوق العجز)
  v_Tl      numeric;   -- كلفةُ ما يدخل الدفعة
  v_invs    uuid[] := '{}';
  v_lines   jsonb := '[]'::jsonb;
  v_free    numeric := 0;
  v_cash    numeric := 0;
  v_debt    numeric := 0;
  v_left    numeric;
  d         invoices;
  v_pay     numeric;
  v_subtotal numeric; v_cost numeric; v_total numeric; v_paid numeric;
  v_forg_old numeric; v_forg_new numeric; v_back numeric; v_details jsonb; v_pos numeric; v_stamp text;
  v_iid     uuid;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  v_method := case v_pm when 'transfer' then 'bank' else v_pm end;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'expired_empty' using hint = 'ما في شي يرجع.';
  end if;
  if v_ref is not null then
    select result into v_out from rpc_refs where clinic_id = v_clinic and fn = 'return_expired' and client_ref = v_ref;
    if v_out is not null then return v_out; end if;
    -- المرجعُ نفسُه ثبت راجعاً خالصاً (الشاشةُ بدّلت الوضعَ بعد نتيجةٍ مجهولة): لا يُسجَّل مرّةً ثانية بطريقٍ آخر.
    if exists (select 1 from rpc_refs where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref) then
      raise exception 'expired_ref_used' using hint = 'هالإرجاع انسجّل راجع عادي — صفّر السلّة وشوف السحوبات.';
    end if;
  end if;
  begin
    if v_ref is not null then
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'return_expired', v_ref);
    end if;
    select cp.dial_code into v_dial from clinic_prefs cp where cp.clinic_id = v_clinic;
    v_key := case when v_name is not null or v_phone is not null then cust_key(v_phone, v_name, v_dial) end;
    -- الأزواجُ تحت المفتاح مرّةً — نهجُ customer_key_invoices (0270): cust_key لكلّ زوجٍ لا لكلّ فاتورة، ولا لكلّ سطر.
    if v_key is not null then
      select coalesce(jsonb_agg(jsonb_build_array(pr.nm, pr.ph)), '[]'::jsonb) into v_hit
        from (select distinct i.customer_name as nm, i.customer_phone as ph
                from invoices i
               where i.clinic_id = v_clinic
                 and (coalesce(btrim(i.customer_name), '') <> '' or coalesce(btrim(i.customer_phone), '') <> '')) pr
       where cust_key(pr.ph, pr.nm, v_dial) = v_key;
    end if;

    -- منتجاتُ السلّة تُقفل بالمعرّف قبل أيّ كتابة — ترتيبُ البيع (0252)، لا ترتيبُ السطور.
    perform 1 from products
     where clinic_id = v_clinic
       and id in (select nullif(e->>'product_id', '')::uuid from jsonb_array_elements(p_items) e)
     order by id
     for update;

    for it in select * from jsonb_array_elements(p_items) loop
      v_unit := coalesce(nullif(it->>'unit', ''), 'box');
      v_qty  := round(coalesce(nullif(it->>'qty', '')::numeric, 0), 3);
      v_pct  := coalesce(nullif(it->>'pct', '')::integer, 100);
      v_exp  := nullif(it->>'expiry_date', '')::date;
      if v_qty <= 0 then raise exception 'expired_qty' using hint = 'اكتب كمية الراجع.'; end if;
      if v_pct < 1 or v_pct > 100 then raise exception 'expired_pct' using hint = 'نسبة الراجع بين ١ و١٠٠.'; end if;
      if v_exp is null then raise exception 'expired_date' using hint = 'اكتب شوكت خلص الإكسباير.'; end if;
      select * into p from products where id = nullif(it->>'product_id', '')::uuid and clinic_id = v_clinic for update;
      if not found then raise exception 'expired_product' using hint = 'المادة ما موجودة بالمخزن.'; end if;
      if coalesce(p.price_currency, 'IQD') = 'USD' then
        raise exception 'expired_usd' using hint = '«' || p.name || '» بالدولار — راجعها الإكسباير بمرحلة مرتجع الدولار.';
      end if;
      if coalesce(p.pooled, false) or p.farm_id is not null then
        raise exception 'expired_pooled' using hint = '«' || p.name || '» رصيدها بحوض القسم — رجّعها من «المرتجع».';
      end if;
      v_pack := null;
      if v_unit = 'sub' then
        if not coalesce(p.has_sub_unit, false) or coalesce(p.units_per_box, 0) < 2 then
          raise exception 'expired_unit' using hint = '«' || p.name || '» ما إلها وحدة مفردة.';
        end if;
        v_uret := 1.0 / p.units_per_box;
      elsif v_unit = 'pack' then
        select k into v_pack from jsonb_array_elements(coalesce(p.packs, '[]'::jsonb)) k where k->>'id' = it->>'pack_id' limit 1;
        if v_pack is null or coalesce((v_pack->>'per')::numeric, 0) < 2 then
          raise exception 'expired_unit' using hint = '«' || p.name || '» ما بيها هالكارتون — حدّث القائمة.';
        end if;
        v_uret := (v_pack->>'per')::numeric;
      elsif v_unit = 'box' then
        v_uret := 1;
      else
        raise exception 'expired_unit' using hint = 'وحدة الراجع: علبة أو قطعة أو كارتون.';
      end if;
      v_rs := round(v_qty * v_uret, 3);
      if v_rs <= 0 then raise exception 'expired_qty' using hint = 'الكمية أصغر من وحدة المخزن.'; end if;

      -- الفاتورة: الأحدثُ لمفتاح الزبون فيها سطرُ المادّة يكفي — ما عليها دَينٌ أوّلاً
      v_inv := null; li := null;
      if jsonb_array_length(v_hit) > 0 then
        select i.* into v_inv
          from invoices i
          join jsonb_array_elements(v_hit) h on i.customer_name is not distinct from (h->>0) and i.customer_phone is not distinct from (h->>1)
         where i.clinic_id = v_clinic and coalesce(i.status, 'paid') <> 'refunded'
           and coalesce(i.sale_kind, 'retail') <> 'opening' and coalesce(i.currency, 'IQD') = 'IQD'
           and not exists (select 1 from delivery_orders dl
                            where dl.invoice_id = i.id and (dl.status in ('preparing', 'out') or (dl.status = 'delivered' and dl.collected_at is null)))
           and exists (select 1 from invoice_items ii
                        where ii.invoice_id = i.id and ii.clinic_id = v_clinic and ii.product_id = p.id
                          and coalesce(ii.stock_qty, ii.qty) >= v_rs - 0.0005 and coalesce(ii.pooled_qty, 0) = 0 and ii.qty > 0)
         order by (i.total - coalesce(i.amount_paid, i.total) > 0.005) desc, i.created_at desc, i.id desc
         limit 1
         for update of i;
      end if;

      if v_inv.id is not null then
        select * into li from invoice_items ii
         where ii.invoice_id = v_inv.id and ii.clinic_id = v_clinic and ii.product_id = p.id
           and coalesce(ii.stock_qty, ii.qty) >= v_rs - 0.0005 and coalesce(ii.pooled_qty, 0) = 0 and ii.qty > 0
         order by coalesce(ii.stock_qty, ii.qty) desc, ii.id
         limit 1
         for update;
        -- الراجعُ بوحدة السطر نفسِه (شريطٌ من سطر شرائط = ١ بالضبط): التحويلُ عبر وحدة المخزن المقرَّبة كان يترك ٦٫٠٠١ شريطاً ويردّ ٩٩٩
        -- بدل ١٠٠٠ (مراجعةٌ عدائيّة). وحدةُ السطر من نسبته: علبة (١)، مفرد (١ ÷ عدده)، كارتون (عددُه).
        v_r := coalesce(li.stock_qty, li.qty) / li.qty;
        v_uline := case when abs(v_r - 1) < 0.0005 then 1
                        when v_r < 1 and coalesce(p.units_per_box, 0) >= 2 then 1.0 / p.units_per_box
                        else v_r end;
        v_rl := least(round(v_qty * v_uret / v_uline, 3), li.qty);
        v_oldv := li.line_total;
        v_oldc := round(li.qty * li.unit_cost, 2);
        if v_rl >= li.qty - 0.0005 then
          v_nq := 0; v_ns := 0; v_newv := 0; v_newc := 0;
          delete from invoice_items where id = li.id;
        else
          v_nq := round(li.qty - v_rl, 3);
          v_ns := case when li.stock_qty is null then null else round(li.stock_qty * v_nq / li.qty, 3) end;
          v_newv := round(v_nq * li.unit_price, 2);
          v_newc := round(v_nq * li.unit_cost, 2);
          update invoice_items set qty = v_nq, stock_qty = v_ns, line_total = v_newv where id = li.id;
        end if;
        v_V := round((v_oldv - v_newv) * v_pct / 100.0, 2);
        v_T := least(v_V, v_oldc - v_newc);
      else
        -- بلا فاتورة: سعرُ الوحدة بالجهاز (كراجع اليوم)، والكلفةُ min(القيمة، كلفةُ المخزن)
        v_V := round(abs(coalesce(nullif(it->>'unit_price', '')::numeric, 0)) * v_qty * v_pct / 100.0, 2);
        v_T := least(v_V, round(coalesce(stock_unit_cost(p), 0) * v_rs, 2));
        v_free := v_free + v_V;
      end if;

      -- ما يدخل الدفعة: ما فوق عجز الرصيد (الدفعاتُ مجموعُها greatest(الرصيد، ٠))، وكلفتُه بنسبته.
      v_lotq := case when coalesce(p.stock, 0) >= 0 then v_rs else greatest(coalesce(p.stock, 0) + v_rs, 0) end;
      v_Tl := case when v_lotq >= v_rs then v_T else round(v_T * v_lotq / v_rs, 2) end;

      if v_inv.id is not null then
        -- سطرُ الأثر: ما لم يرجع للزبون من قيمة الراجع، وكلفتُه ما لم ينتقل للدفعة — فربحُ الفاتورة لا يتغيّر. وراجعٌ كاملٌ (١٠٠٪) بلا
        -- باقٍ لا سطرَ له — إلا فاتورةً ما بقي فيها سطر: يبقى أثرُها بصفر (فاتورةٌ بلا أسطر لا تُقرأ بسجلّ الفواتير ولا تُطبع).
        -- ويومُه يومُ فاتورته (0133): تقاريرُ السطور بالمدّة تقرأ سطورَ الفاتورة بيومها.
        if (v_oldv - v_newv) - v_V > 0 or (v_oldc - v_newc) - v_Tl > 0
           or not exists (select 1 from invoice_items where invoice_id = v_inv.id and clinic_id = v_clinic) then
          insert into invoice_items (invoice_id, clinic_id, product_id, name, qty, unit_price, unit_cost, line_total, stock_qty, unit_label, service_id, created_at)
          values (v_inv.id, v_clinic, null,
                  left(p.name || ' — راجع إكسباير ' || trim(trailing '.' from trim(trailing '0' from v_qty::text))
                       || case v_unit when 'sub' then ' ' || coalesce(nullif(btrim(p.sub_unit_name), ''), 'قطعة')
                                      when 'pack' then ' ' || coalesce(nullif(btrim(v_pack->>'name'), ''), 'كارتون') else '' end
                       || case when v_pct < 100 then ' (' || v_pct || '%)' else '' end, 200),
                  1, (v_oldv - v_newv) - v_V, (v_oldc - v_newc) - v_Tl, (v_oldv - v_newv) - v_V, 0, null, null, v_inv.created_at);
        end if;
        if not (v_inv.id = any(v_invs)) then v_invs := v_invs || v_inv.id; end if;
      end if;

      -- المخزن: الرصيدُ يزيد، والدفعةُ تحمل ما فوق العجز بتاريخه (المطابقةُ المؤجَّلة تجد المجموعَ مطابقاً)
      update products set stock = round(coalesce(stock, 0) + v_rs, 3) where id = p.id and clinic_id = v_clinic;
      if v_lotq > 0 then
        insert into product_lots (clinic_id, product_id, qty, received_qty, expiry_date, received_at, source, note,
                                  unit_cost, return_from, return_key, return_pct, return_invoice, returned_at)
        values (v_clinic, p.id, v_lotq, v_lotq, v_exp, now(), 'return', v_note,
                round(v_Tl / v_lotq, 6), left(coalesce(v_name, v_phone), 120), v_key, v_pct, v_inv.id, now());
      end if;
      v_lines := v_lines || jsonb_build_object('product_id', p.id, 'name', p.name, 'stock_qty', v_rs, 'value', v_V,
                                               'cost', v_Tl, 'lot_qty', v_lotq, 'invoice_id', v_inv.id);
    end loop;

    -- ── الفواتير: إعادةُ الحساب كـreturn_invoice_items (الدَّينُ أوّلاً، ثمّ الخصمُ على الدين، ثمّ النقد) ──────────
    foreach v_iid in array v_invs loop
      select * into v_inv from invoices where id = v_iid for update;
      select coalesce(sum(line_total), 0), coalesce(sum(round(qty * unit_cost, 2)), 0)
        into v_subtotal, v_cost
        from invoice_items where invoice_id = v_iid and clinic_id = v_clinic;
      v_total := greatest(round(v_subtotal - greatest(coalesce(v_inv.discount, 0), 0), 2), 0);
      v_paid  := coalesce(v_inv.amount_paid, v_inv.total);
      v_forg_old := coalesce(v_inv.forgiven, 0);
      v_forg_new := least(v_forg_old, greatest(0, v_total - v_paid));
      v_total    := round(v_total - v_forg_new, 2);
      v_back     := greatest(round(v_paid - v_total, 2), 0);
      v_debt     := v_debt + greatest(0, round((v_inv.total - v_paid) - greatest(0, v_total - v_paid + v_back), 2));
      v_details  := coalesce(v_inv.payment_details, '[]'::jsonb);
      if v_back > 0 then
        select coalesce(sum((e->>'amount')::numeric), 0) into v_pos
          from jsonb_array_elements(v_details) e where (e->>'amount')::numeric > 0;
        if v_pos < v_paid then
          v_details := v_details || jsonb_build_object('method', coalesce(v_inv.payment_method, v_pm), 'amount', v_paid - v_pos,
            'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
        end if;
        v_details := v_details || jsonb_build_object('method', v_pm, 'amount', -v_back,
          'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'), 'note', 'راجع إكسباير');
        v_cash := v_cash + v_back;
      end if;
      if v_forg_new < v_forg_old then
        perform invoice_forgiveness_consume(v_clinic, v_iid, v_forg_old - v_forg_new, 'مرتجع', v_inv.total, v_paid);
      end if;
      v_stamp := 'راجع إكسباير ' || to_char(now(), 'YYYY-MM-DD') || ': '
              || to_char(coalesce(v_inv.total, 0), 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
              || case when v_back > 0 then ' · أُعيد ' || to_char(v_back, 'FM999,999,990.99') else '' end
              || case when v_note is not null then ' · ' || v_note else '' end;
      update invoices set
        subtotal = v_subtotal, total = v_total, forgiven = v_forg_new, cost_total = v_cost,
        profit = round(v_total - v_cost, 2),
        item_count = greatest(0, coalesce((select round(sum(qty)) from invoice_items where invoice_id = v_iid and clinic_id = v_clinic), 0)),
        amount_paid = greatest(round(v_paid - v_back, 2), 0),
        payment_details = v_details,
        payment_method = coalesce((select e->>'method' from jsonb_array_elements(v_details) e
                                    where (e->>'amount')::numeric > 0 order by (e->>'amount')::numeric desc limit 1),
                                  v_inv.payment_method),
        notes = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
       where id = v_iid;
    end loop;

    -- ── بلا فاتورة: سحبٌ «مرتجع» كراجع اليوم ─────────────────────────────────────────────────
    if v_free > 0 then
      insert into expenses (clinic_id, amount, description, category, method, spent_at)
      values (v_clinic, v_free,
              left('راجع إكسباير' || case when v_name is not null then ' — ' || v_name else '' end
                   || case when v_note is not null then ' (' || v_note || ')' else '' end, 200),
              'مرتجع', v_method, now());
      v_cash := v_cash + v_free;
    end if;

    -- ── ما خرج والزبونُ عليه دَين: يُسدَّد به أقدمُ دَينه — بطريقة الشاشة نفسِها (يخرج ويدخل بالجيب نفسِه فلا يتحرّك) ──────────
    -- والصفوفُ تُقفل بالقراءة: تسديدٌ متزامن بين القراءة والتسديد كان يُسقط فرقَه — لا نقداً ولا دَيناً (مراجعةٌ عدائيّة).
    if v_cash > 0 and jsonb_array_length(v_hit) > 0 then
      v_left := v_cash;
      for d in
        select i.* from invoices i
          join jsonb_array_elements(v_hit) h on i.customer_name is not distinct from (h->>0) and i.customer_phone is not distinct from (h->>1)
         where i.clinic_id = v_clinic and coalesce(i.status, 'paid') <> 'refunded' and coalesce(i.currency, 'IQD') = 'IQD'
           and i.total - coalesce(i.amount_paid, i.total) > 0.005
           and not exists (select 1 from delivery_orders dl
                            where dl.invoice_id = i.id and (dl.status in ('preparing', 'out') or (dl.status = 'delivered' and dl.collected_at is null)))
         order by i.created_at, i.id
         for update of i
      loop
        exit when v_left <= 0;
        v_pay := least(v_left, round(d.total - coalesce(d.amount_paid, d.total), 2));
        perform settle_invoice(d.id, v_pay, v_pm);
        v_left := v_left - v_pay;
        v_debt := v_debt + v_pay;
      end loop;
      v_cash := v_left;
    end if;

    v_out := jsonb_build_object('lines', v_lines, 'invoices', to_jsonb(v_invs), 'debt', v_debt, 'cash', v_cash,
                                'customer', coalesce(v_name, v_phone));
    if v_ref is not null then
      update rpc_refs set result = v_out where clinic_id = v_clinic and fn = 'return_expired' and client_ref = v_ref;
    end if;
  exception when unique_violation then
    if v_ref is null then raise; end if;
    select result into v_out from rpc_refs where clinic_id = v_clinic and fn = 'return_expired' and client_ref = v_ref;
    if v_out is null then raise; end if;
    return v_out;
  end;
  return v_out;
end $$;
revoke all on function public.return_expired(jsonb, jsonb) from public, anon;
grant execute on function public.return_expired(jsonb, jsonb) to authenticated;

-- ── ٤) البيعُ من دفعة الراجع: البيعةُ كما هي، ثمّ السطرُ بكلفة الدفعة والدفعةُ تنقص — بالمعاملة نفسِها ─────────────
-- السطرُ الذي يحمل `lot_id` (دفعةَ راجعٍ للمادّة نفسِها) يُطابَق بسطر الفاتورة (المادّة والكمية وكميةُ المخزن)، فكلفتُه كلفةُ الدفعة
-- وربحُه منها. والإعادةُ بالمرجع ترجع البيعةَ كما ثبتت بلا نقصٍ ثانٍ (rpc_refs: lot_sale).
create or replace function public.retail_checkout_lots(p_items jsonb, p_meta jsonb default '{}'::jsonb,
                                                       p_usd jsonb default null, p_charges uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(coalesce(p_meta->>'client_ref', '')), '');
  v_res    jsonb;
  v_inv    invoices;
  it       jsonb;
  l        product_lots;
  li       invoice_items;
  v_done   uuid[] := '{}';
  v_sq     numeric;
  v_q      numeric;
  v_uc     numeric;
  v_delta  numeric := 0;
  v_any    boolean := false;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if v_ref is null then raise exception 'lot_ref' using hint = 'البيعة تحتاج مرجعاً.'; end if;
  if p_usd is not null and jsonb_typeof(p_usd) = 'array' and jsonb_array_length(p_usd) > 0 then
    v_res := mixed_checkout(p_items, p_usd, p_meta, p_charges);
  elsif p_charges is not null then
    v_res := jsonb_build_object('iqd', to_jsonb(retail_checkout_doses(p_items, p_meta, p_charges)), 'usd', null);
  else
    v_res := jsonb_build_object('iqd', to_jsonb(retail_checkout(p_items, p_meta)), 'usd', null);
  end if;
  if v_res->'iqd' is null or jsonb_typeof(v_res->'iqd') <> 'object' then return v_res; end if;

  -- مرّةً واحدة لكلّ مرجع: الإعادةُ لا تنقص الدفعةَ ثانيةً
  if exists (select 1 from rpc_refs where clinic_id = v_clinic and fn = 'lot_sale' and client_ref = v_ref) then
    select * into v_inv from invoices where id = (v_res->'iqd'->>'id')::uuid;
    return jsonb_set(v_res, '{iqd}', to_jsonb(v_inv));
  end if;
  select * into v_inv from invoices where id = (v_res->'iqd'->>'id')::uuid and clinic_id = v_clinic for update;
  -- فاتورةٌ ثبتت قبل هذه المعاملة بلا ختم الدفعة (محاولةٌ سبقت بطريقٍ آخر) ⇒ ما باعته باعته من الرفّ العاديّ: لا نُنقص الدفعةَ عن
  -- بيعةٍ لم تأخذ منها. والجديدةُ = أُدرجت بهذه المعاملة (فكرةُ 0272).
  if coalesce(v_inv.recorded_at, v_inv.created_at) < now() then return v_res; end if;
  insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'lot_sale', v_ref);
  for it in select * from jsonb_array_elements(p_items) loop
    if nullif(it->>'lot_id', '') is null then continue; end if;
    v_q  := round(coalesce(nullif(it->>'qty', '')::numeric, 0), 3);
    v_sq := round(coalesce(nullif(it->>'stock_qty', '')::numeric, v_q), 3);
    if v_q <= 0 or v_sq <= 0 then raise exception 'lot_line' using hint = 'سطرُ الإكسباير بيع لا راجع.'; end if;
    select * into l from product_lots
     where id = (it->>'lot_id')::uuid and clinic_id = v_clinic and source = 'return' for update;
    if not found or l.product_id <> nullif(it->>'product_id', '')::uuid then
      raise exception 'lot_gone' using hint = 'دفعة الإكسباير ما عادت موجودة — حدّث القائمة.';
    end if;
    if l.qty < v_sq - 0.0005 then
      raise exception 'lot_short' using hint = 'الباقي من الإكسباير ' || trim(trailing '.' from trim(trailing '0' from l.qty::text)) || ' بس.';
    end if;
    select * into li from invoice_items ii
     where ii.invoice_id = v_inv.id and ii.clinic_id = v_clinic and ii.product_id = l.product_id
       and ii.qty = v_q and coalesce(ii.stock_qty, ii.qty) = v_sq and not (ii.id = any(v_done))
       and round(ii.unit_price, 2) = round(coalesce(nullif(it->>'unit_price', '')::numeric, 0), 2)
     order by ii.id limit 1 for update;
    if not found then raise exception 'lot_line' using hint = 'ما لكينا سطرَ الإكسباير بالفاتورة.'; end if;
    v_uc := round(coalesce(l.unit_cost, 0) * v_sq / v_q, 2);
    v_delta := v_delta + round(v_q * v_uc, 2) - round(li.qty * li.unit_cost, 2);
    update invoice_items set unit_cost = v_uc where id = li.id;
    update product_lots set qty = round(qty - v_sq, 3), updated_at = now() where id = l.id;
    v_done := v_done || li.id;
    v_any := true;
  end loop;
  if v_any then
    update invoices set cost_total = round(coalesce(cost_total, 0) + v_delta, 2),
                        profit = round(coalesce(profit, 0) - v_delta, 2)
     where id = v_inv.id returning * into v_inv;
    -- الكلفةُ جزءٌ من البيعة نفسِها لا تعديلٌ بعدها: محفّزُ التدقيق كتب للتحديثين «تعديل بيعة» و«سطر» بسجلّ الحركات بجانب «بيع»
    -- (فخُّ 0283 بعينه — مراجعةٌ عدائيّة). سطورُ هذه المعاملة لهذه الفاتورة وسطورِها تُشال، ويبقى سطرُ الإدراج «بيع».
    delete from audit_log
     where clinic_id = v_clinic and action = 'UPDATE' and created_at = now()
       and ((entity = 'invoices' and entity_id = v_inv.id::text)
            or (entity = 'invoice_items' and entity_id in (select x::text from unnest(v_done) x)));
  end if;
  return jsonb_set(v_res, '{iqd}', to_jsonb(v_inv));
end $$;
revoke all on function public.retail_checkout_lots(jsonb, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.retail_checkout_lots(jsonb, jsonb, jsonb, uuid[]) to authenticated;

-- ── ٥) نموذجُ المادّة لا يكتب تاريخَه فوق دفعة الراجع (حارسُ الانجراف على 0217) ───────────────────────────────────
-- دفعةُ الراجع وحدها فيها رصيد ⇒ تاريخُ المادّة تاريخُها (lots_refresh_expiry)، وتعديلُ تاريخ المادّة بنموذجها كان يكتب فوقه (مقيسٌ بالمراجعة:
-- ٢٠٢٦-١٠-٠١ صار ٢٠٢٨-٠١-٠١ مختوماً expiry_fixed) — فيضيع «شوكت خلص» الذي كتبه الطبيب عند الراجع.
select public._drift_assert('public.lots_user_expiry(uuid,date,date)', '6bd2792fc62845ac8b76da07758c90fc', '-- +0288');

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
-- -0288   update product_lots set expiry_date = p_new, expiry_fixed = true, updated_at = now()
-- -0288    where product_id = p_product and qty > 0 and expiry_date is not distinct from p_old;
  update product_lots set expiry_date = p_new, expiry_fixed = true, updated_at = now()   -- +0288
   where product_id = p_product and qty > 0 and expiry_date is not distinct from p_old and source <> 'return';   -- +0288
  get diagnostics v_n = row_count;
  -- التاريخُ القديم لا يطابق دفعةً بعينها ودفعةٌ وحيدةٌ فيها رصيد: هي المقصودة.
-- -0288   if v_n = 0 and (select count(*) from product_lots where product_id = p_product and qty > 0) = 1 then
-- -0288     update product_lots set expiry_date = p_new, expiry_fixed = true, updated_at = now() where product_id = p_product and qty > 0;
  if v_n = 0 and (select count(*) from product_lots where product_id = p_product and qty > 0 and source <> 'return') = 1 then   -- +0288
    update product_lots set expiry_date = p_new, expiry_fixed = true, updated_at = now()   -- +0288
     where product_id = p_product and qty > 0 and source <> 'return';   -- +0288
  end if;
  select coalesce(min(expiry_date) filter (where expiry_date >= current_date), min(expiry_date)), bool_or(true)
    into v_min, v_any from product_lots where product_id = p_product and qty > 0;
  return case when coalesce(v_any, false) then v_min else p_new end;
end $$;
revoke all on function public.lots_user_expiry(uuid, date, date) from public, anon;
grant execute on function public.lots_user_expiry(uuid, date, date) to authenticated;

-- ── ٦) الراجعُ الخالص لا يُعيد مرجعاً ثبت راجعاً إكسباير (حارسُ الانجراف على 0136) ─────────────────────────────────
-- الشاشةُ تولّد المرجعَ مرّةً للسلّة؛ راجعٌ إكسباير نتيجتُه مجهولة ثمّ «مو إكسباير» وإعادةٌ = retail_return بالمرجع نفسِه: الرصيدُ يزيد مرّتين
-- والنقدُ يخرج مرّتين (rpc_refs مفتاحُه الدالّةُ والمرجع). والعكسُ يرفضه return_expired نفسُه (expired_ref_used).
select public._drift_assert('public.retail_return(jsonb,jsonb)', 'b8a68e097c2958134d1f74abe8c5fdf1', '-- +0288');

create or replace function public.retail_return(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  it jsonb; v_qty numeric(14,3); v_stockq numeric(14,3);
  v_price numeric(14,2); v_amount numeric(14,2); v_name text; v_method text;
  v_who  text := nullif(btrim(p_meta->>'customer_name'), '');
  v_note text := nullif(btrim(p_meta->>'note'), '');
  v_total numeric(14,2) := 0; v_lines int := 0;
  -- مرجعُ المحاولة: يولّده الجهاز مرّةً، ويثبت عبر كل إعادة.
  v_ref  text := nullif(btrim(p_meta->>'client_ref'), '');
  v_out  jsonb;
begin
  if v_clinic is null then raise exception 'no clinic'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'no items';
  end if;

  -- إعادةٌ لإرجاعٍ سُجّل سلفاً: تُرجَع نتيجتُه كما هي، بلا مخزونٍ يُزاد ثانيةً
  -- ولا سحبٍ يُسجَّل ثانية.
  if v_ref is not null then
    select result into v_out from rpc_refs
     where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref;
    if v_out is not null then return v_out; end if;
    -- 0288: المرجعُ نفسُه ثبت راجعاً إكسباير (الشاشةُ بدّلت الوضعَ بعد نتيجةٍ مجهولة) — لا يُسجَّل ثانيةً راجعاً خالصاً.   -- +0288
    if exists (select 1 from rpc_refs where clinic_id = v_clinic and fn = 'return_expired' and client_ref = v_ref) then   -- +0288
      raise exception 'return_ref_used' using hint = 'هالإرجاع انسجّل راجع إكسباير — صفّر السلّة وشوف الفاتورة والدفعات.';   -- +0288
    end if;   -- +0288
  end if;

  v_method := case lower(coalesce(p_meta->>'method','cash'))
                when 'card' then 'card'
                when 'transfer' then 'bank'
                when 'bank' then 'bank'
                else 'cash' end;

  -- كتلةٌ بمعالج: خرقُ الفهرس الفريد يعني أن نسخةً متزامنة سبقتنا، فيتراجع
  -- كل ما كتبناه (المخزون والسحوبات) ونُرجع نتيجتها هي.
  begin
    -- حجزُ المرجع أوّلاً — قبل أن نمسّ مخزوناً أو خزنة.
    if v_ref is not null then
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'retail_return', v_ref);
    end if;

    for it in select * from jsonb_array_elements(p_items) loop
      v_qty := abs(coalesce(nullif(it->>'qty','')::numeric, 0));
      if v_qty = 0 then continue; end if;
      v_stockq := abs(coalesce(nullif(it->>'stock_qty','')::numeric, v_qty));
      v_price  := abs(coalesce(nullif(it->>'unit_price','')::numeric, 0));
      v_name   := coalesce(nullif(btrim(it->>'name'), ''), 'صنف');
      v_amount := round(v_qty * v_price, 2);

      if nullif(it->>'product_id','') is not null then
        perform credit_stock((it->>'product_id')::uuid, v_stockq, v_clinic);
      end if;

      if v_amount > 0 then
        insert into expenses (clinic_id, amount, description, category, method, spent_at)
        values (v_clinic, v_amount,
          'راجع: ' || v_name
            || case when v_qty <> 1 then ' × ' || trim(trailing '.' from trim(trailing '0' from v_qty::text)) else '' end
            || case when v_who  is not null then ' — ' || v_who  else '' end
            || case when v_note is not null then ' (' || v_note || ')' else '' end,
          'مرتجع', v_method, now());
        v_total := v_total + v_amount;
      end if;
      v_lines := v_lines + 1;
    end loop;

    if v_lines = 0 then raise exception 'no items'; end if;
    v_out := jsonb_build_object('total', v_total, 'lines', v_lines, 'method', v_method);

    if v_ref is not null then
      update rpc_refs set result = v_out
       where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref;
    end if;
  exception when unique_violation then
    -- لا نبلع كل خرقٍ فريد: إن لم يكن مرجعُنا هو السبب، فالخطأ حقيقيّ ويُرفع.
    if v_ref is null then raise; end if;
    select result into v_out from rpc_refs
     where clinic_id = v_clinic and fn = 'retail_return' and client_ref = v_ref;
    if v_out is null then raise; end if;
    return v_out;
  end;

  return v_out;
end $function$;
revoke all on function public.retail_return(jsonb, jsonb) from public, anon;
grant execute on function public.retail_return(jsonb, jsonb) to authenticated;

create or replace function public.return_lots_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select to_regprocedure('public.return_expired(jsonb,jsonb)') is not null
     and to_regprocedure('public.retail_checkout_lots(jsonb,jsonb,jsonb,uuid[])') is not null
$$;
revoke all on function public.return_lots_ready() from public, anon;
grant execute on function public.return_lots_ready() to authenticated;
