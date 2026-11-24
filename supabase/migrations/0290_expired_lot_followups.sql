-- ============================================================================
-- 0290 — الراجعُ الإكسباير بعد نزوله: دفترُ الرصيد يسمّيه، والتلفُ والجردُ يكلّفان دفعتَه بكلفتها (٢٤/١١)
--
-- طلبُ المالك بعد 0289: «حل سالفة اسم الحركة» و«سوّي الي تشوفه صحيح بالأسعار — أهم شي ما يسوّيلنا كوارث».
--
-- ١) دفترُ الرصيد (0287) يعرف كتّابَه بالاسم، و`return_expired` (0289) ليس منهم: الكاتبُ صار أوّلَ ما بالمكدّس والنوعُ «other»
--    فقالت «حركات المادة» «عملية بالنظام (return_expired)» عن راجعٍ رجع للرفّ. يُضاف للقائمتين: الكاتبُ return_expired والنوعُ return.
--    النوعُ يُحسب لحظةَ القراءة (stock_ledger_of) من الكاتب المخزَّن — فصفوفُ ما قبل الهجرة تُقرأ «إرجاعاً» بلا كتابةٍ عليها.
--
-- ٢) دفعةُ الراجع تحمل كلفتَها (`product_lots.unit_cost` = ما رجع للزبون ÷ الكمية، 0289)، والفاتورةُ القديمة أبقت باقي الكلفة
--    (C − T) على سطر أثرها. وسندُ التلف («منتهي» يأخذ من المنتهي أوّلاً — دفعةَ الراجع) والجردُ كانا يكلّفان ما نقص بلقطة
--    `stock_unit_cost` (المتوسّط): علبةٌ رجعت بـ١٠٬٠٠٠ ومتوسّطُ مادّتها ١٤٬٠٠٠ تُتلف ⇒ سحبُ مخزن ١٤٬٠٠٠ — والـ٤٬٠٠٠ محسوبةٌ أصلاً
--    بالفاتورة: خسارةٌ مرّتين. الآن موافقةُ السطر (stock_count_decide، نصُّ 0254 حرفاً وفوقه أسطرٌ معلَّمة) تقيس ما أخذه من
--    دفعات الراجع **فعلاً** (ما نقص من كلّ دفعةٍ بين قبل الموافقة وبعدها، دفعةً دفعة لا الصافي — عدُّ الدفعة اليدويّ ومطابقةُ
--    lots_reconcile معاً؛ الصافي بكلفتين يطلع سالباً حين يرفع العدُّ دفعةً وينزل أخرى) وتكتب
--    كلفةَ السطر: ما أُخذ منها بكلفته والباقي بلقطته (`unit_cost`، ستّ منازل كاللقطة). فالسحبُ وتقريرُ الخسائر (Σ −فرق × كلفة)
--    يقرآن الرقمَ نفسَه. وما لا يمسّ دفعةَ راجع يبقى كما كان حرفاً، والمعلَّقُ لا يتغيّر قبل موافقته.
--    • أخذَ منها أكثرَ من الخسارة (دفعاتٌ لم تطابق الرصيدَ قبلها): الكلفةُ معدّلُ ما أُخذ منها — لا خسارةً بلا مادّة.
--    • ما يُباع منها بالكاشير بكلفتها منذ 0289 (retail_checkout_lots) — لا يُمسّ.
--
-- إعادةُ التطبيق: الحارسُ يقبل نصَّ المصدر ببصمته أو جسماً يحمل علامتَنا. وأقسامُ الحزمة التي تعيد 0254 وحدها تُرجع
-- stock_count_decide لنصّها — أعِد 0290 بعدها (كما تعيد 0289 بعد 0217).
-- تراجع: أعِد الأجسامَ الثلاثة حرفاً من مصادرها (_stock_ledger_source و_stock_ledger_kind من 0287، وstock_count_decide من
-- 0254) بصلاحياتها هناك، و`drop function if exists public.stock_count_preview(uuid[]);` (الشاشةُ تحسب بلقطتها حين تغيب). لا أعمدةَ ولا جداول.
--
-- ٣) معاينةُ الموافقة (stock_count_preview): الموافقةُ نفسُها داخل معاملةٍ فرعية تُلغى — الشاشةُ تعرض ما سيُكتب لا لقطةَ السطر.
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public.return_expired(jsonb,jsonb)') is null
     or to_regprocedure('public._stock_ledger_kind(text,text,text,numeric)') is null
     or to_regprocedure('public.stock_waste_submit(jsonb,boolean,jsonb)') is null then
    raise exception 'needs_0289' using hint = 'طبّق 0254 و0287 و0289 قبل هالهجرة';
  end if;
end $$;

select public._drift_assert('public._stock_ledger_source(text)', 'e79fbae059a0cb823ca829bfe1664bb4', '-- +0290');
select public._drift_assert('public._stock_ledger_kind(text,text,text,numeric)', '177ce1cad9a71922004acaa2855b0a6b', '-- +0290');
select public._drift_assert('public.stock_count_decide(uuid[],boolean)', '8b6d879140fce7e74815fce90e797028', '-- +0290');

-- ── ١) دفترُ الرصيد يعرف الراجعَ الإكسباير — نصُّ 0287 حرفاً وفوقه سطران معلَّمان ─────────────────────

create or replace function public._stock_ledger_source(p_chain text)
returns text
language sql immutable set search_path = public as $$
  select coalesce(
    (select u.n from unnest(string_to_array(coalesce(p_chain, ''), '>')) with ordinality as u(n, ord)
      where u.n = any (array[
        'stock_count_decide', 'stock_count_submit', 'stock_count_submit_seen', 'stock_waste_submit',
        'merge_products', 'inventory_tidy_uncat', 'restore_product', 'delete_product',
        'pool_product', 'restore_company', 'restore_company_section', 'merge_companies', 'merge_company_sections',
        'poultry_consume', 'poultry_unconsume',
        'purchase_record_once', 'record_purchase', 'record_purchase_fx', 'update_purchase', 'update_purchase_fx',
        'lot_add_once', 'lot_add',
        'retail_checkout', 'retail_checkout_fx', 'retail_checkout_doses', 'mixed_checkout', 'usd_checkout', 'pos_checkout', 'store_accept_order',
        'return_invoice_items_once', 'return_invoice_items', 'retail_return', 'credit_stock', 'old_debt_return',
        'return_expired',   -- 0289: الراجعُ الإكسباير — باسمه ولو نوديت من غلاف -- +0290
        'refund_invoice', 'delete_invoice', 'edit_invoice_lines', 'edit_invoice_lines_unguarded'])
      order by u.ord limit 1),
    nullif(split_part(coalesce(p_chain, ''), '>', 1), ''),
    'direct')
$$;
revoke all on function public._stock_ledger_source(text) from public, anon, authenticated;

create or replace function public._stock_ledger_kind(p_op text, p_source text, p_chain text, p_delta numeric)
returns text
language sql immutable set search_path = public as $$
  -- الترتيبُ قرار: عملياتُ المادّة نفسِها (جرد، دمج، حذف، طيّ، شراء) قبل فحص المستهلكات — دمجٌ يطوي مرحَّلَ
  -- المستهلكات (products_trash_consumption ⇒ _stock_post) يبقى «دمجاً» لا «مستهلكات».
  select case
    when p_op = 'checkpoint' then 'checkpoint'
    when p_source = 'direct' then (case when p_op = 'insert' then 'open' when p_op = 'delete' then 'delete' else 'manual' end)
    when p_source in ('stock_count_decide', 'stock_count_submit', 'stock_count_submit_seen') then 'count'
    when p_source = 'stock_waste_submit' then 'waste'
    when p_source in ('merge_products', 'inventory_tidy_uncat') then 'merge'
    when p_source = 'restore_product' then 'restore'
    when p_source = 'delete_product' then 'delete'
    when p_source in ('pool_product', 'restore_company', 'restore_company_section', 'merge_companies', 'merge_company_sections') then 'pool'
    when p_source in ('poultry_consume', 'poultry_unconsume') then 'farm'
    when p_source in ('record_purchase', 'record_purchase_fx', 'purchase_record_once') then 'purchase'
    when p_source in ('update_purchase', 'update_purchase_fx') then 'purchase_edit'
    when p_source in ('lot_add', 'lot_add_once') then 'lot'
    -- 0289: الراجعُ الإكسباير رجع للرفّ — «إرجاع» (كان «other» فقالت الشاشةُ «عملية بالنظام»). قبل فحص المستهلكات: -- +0290
    -- عمليةُ المادّة نفسِها كالجرد والشراء. -- +0290
    when p_source = 'return_expired' then 'return' -- +0290
    when coalesce(p_chain, '') ~ '(_stock_post|consumption)' then (case when p_delta > 0 then 'consume_return' else 'consume' end)
    when p_source in ('retail_checkout', 'retail_checkout_fx', 'retail_checkout_doses', 'mixed_checkout', 'usd_checkout',
                      'pos_checkout', 'store_accept_order') then (case when p_delta > 0 then 'return' else 'sale' end)
    when p_source in ('return_invoice_items', 'return_invoice_items_once', 'retail_return', 'credit_stock', 'old_debt_return') then 'return'
    when p_source = 'refund_invoice' then 'refund'
    when p_source = 'delete_invoice' then 'invoice_delete'
    when p_source in ('edit_invoice_lines', 'edit_invoice_lines_unguarded') then 'invoice_edit'
    else 'other'
  end
$$;
revoke all on function public._stock_ledger_kind(text, text, text, numeric) from public, anon;
grant execute on function public._stock_ledger_kind(text, text, text, numeric) to authenticated;

-- ── ٢) التلفُ والجردُ يكلّفان ما أخذاه من دفعة الراجع بكلفتها — نصُّ 0254 حرفاً وفوقه أسطرٌ معلَّمة ─────────────────────
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
  -- 0254: ما كتبه ترحيلُ السند بالرصيد، والموادُّ التي بقيت تحت الصفر بعد الموافقة -- +0254
  v_posted numeric; -- +0254
  v_neg    jsonb; -- +0254
  -- 0290: دفعاتُ الراجع للمادّة قبل الموافقة (لكلّ دفعة: كميتُها وكلفتُها)، وما نقص منها بعدها (كميةً وقيمة)، وخسارةُ السطر وكلفتُه -- +0290
  v_ret0   jsonb; -- +0290
  v_tq     numeric; -- +0290
  v_tc     numeric; -- +0290
  v_loss   numeric; -- +0290
  v_cost   numeric; -- +0290
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
-- -0254     v_new := greatest(coalesce(v_old, 0) + (r.counted_qty - r.system_qty), 0);
    -- 0254: **ولا حصر** — جردٌ معلَّقٌ وافق بعد استهلاكٍ أنزل الرصيدَ تحت فرقه كان يرفعه ولا يكتب -- +0254
    -- خسارة (هوّتا M1/B2). الفرقُ يُطبَّق كلُّه ولو سالباً، بثلاث منازل (منازلُ الرصيد): الفرقُ المسجَّل -- +0254
    -- أدناه = ما تغيّر بالرصيد فعلاً. -- +0254
    v_new := round(coalesce(v_old, 0) + (r.counted_qty - r.system_qty), 3); -- +0254
    -- 0217: عدٌّ بالدفعة يُطبَّق على دفعاته بعينها، ثمّ الرصيد، ثمّ الحارسُ فوراً — وبسبب
    -- «منتهي» يُسحب من المنتهي أوّلاً (لا من الصالح كما بالبيع).
    -- 0290: دفعاتُ الراجع قبل أيّ مسٍّ بالدفعات (العدُّ بالدفعة ثمّ المطابقة) — ما نقص من كلٍّ منها بعدُ أخذه هذا السطر. -- +0290
    -- دفعةً دفعة لا بالصافي: العدُّ بالدفعة قد يرفع دفعةً وينزل أخرى، والصافي بكلفتين يطلع سالباً (فيرفض القيدُ الموافقةَ كلَّها) -- +0290
    -- أو يقاصّ علبةً لُقيت بدفعةٍ بعلبٍ ضاعت بغيرها. -- +0290
    select coalesce(jsonb_object_agg(id::text, jsonb_build_array(qty, unit_cost)), '{}'::jsonb) into v_ret0 -- +0290
      from product_lots where product_id = r.product_id and source = 'return'; -- +0290
    if jsonb_typeof(r.lot_counts) = 'array' then
      for lc in select value from jsonb_array_elements(r.lot_counts) loop
        update product_lots
           set qty = greatest(qty + ((lc->>'counted')::numeric - (lc->>'system')::numeric), 0), updated_at = now()
         where id = (lc->>'lot_id')::uuid and product_id = r.product_id and clinic_id = v_clinic;
      end loop;
    end if;
-- -0254     update products set stock = v_new where id = r.product_id and clinic_id = v_clinic;
    -- 0254: السندُ فرقٌ لا عدّ — d بالضبط عبر المرحَّل (ما دون ٠٫٠٠١ يحمله كالاستهلاك) لا تحديثاً -- +0254
    -- مباشراً، والجردُ برقمه كما كان. -- +0254
    v_posted := null; -- +0254
    if r.source = 'waste' then -- +0254
      select k.o_posted into v_posted -- +0254
        from public._stock_post(v_clinic, r.product_id, r.system_qty - r.counted_qty, 'external') k; -- +0254
    else -- +0254
      update products set stock = v_new where id = r.product_id and clinic_id = v_clinic; -- +0254
    end if; -- +0254
    perform lots_reconcile(r.product_id, r.reason = 'expired');
    -- 0290: كلفةُ الخسارة — ما أخذه السطرُ من دفعات الراجع بكلفتها (ما رجع للزبون؛ باقي الكلفة على فاتورته منذ 0289) -- +0290
    -- والباقي بلقطته كما كان. أخذَ منها أكثرَ من خسارته (دفعاتٌ لم تطابق الرصيدَ قبله) ⇒ معدّلُ ما أُخذ. والزيادةُ -- +0290
    -- وما لا يمسّ دفعةَ راجعٍ بلقطته حرفاً. ستُّ منازل كاللقطة (stock_unit_cost). -- +0290
    v_cost := r.unit_cost; -- +0290
    select coalesce(sum(t.d), 0), coalesce(sum(t.d * t.c), 0) into v_tq, v_tc -- +0290
      from (select greatest((e.value->>0)::numeric - coalesce(l.qty, 0), 0) as d, coalesce((e.value->>1)::numeric, 0) as c -- +0290
              from jsonb_each(v_ret0) e left join product_lots l on l.id = (e.key)::uuid) t; -- +0290
    v_loss := -(case when r.source = 'waste' then r.counted_qty - r.system_qty else v_new - coalesce(v_old, 0) end); -- +0290
    if v_loss > 0 and v_tq > 0 then -- +0290
      v_cost := round(case when v_tq >= v_loss then v_tc / v_tq -- +0290
                           else (v_tc + (v_loss - v_tq) * r.unit_cost) / v_loss end, 6); -- +0290
    end if; -- +0290
    update stock_counts
-- -0254        set status = 'approved', applied_delta = v_new - coalesce(v_old, 0),
-- -0290        set status = 'approved', -- +0254
       set status = 'approved', unit_cost = v_cost, -- +0254 -- +0290
           applied_delta = (case when r.source = 'waste' then r.counted_qty - r.system_qty -- +0254
                                 else v_new - coalesce(v_old, 0) end), -- +0254
           posted = v_posted, -- +0254
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
-- -0254            string_agg(format('%s ×%s', c.product_name, trim_scale(-c.applied_delta)), '، ' order by c.product_name)
           -- 0254: السندُ بما كُتب ووحدته («Lyse ×2 مل»)، والجردُ بفرقه كما كان -- +0254
           -- وبترتيب البايت (collate "C") ثمّ المادّة: الترتيبُ الافتراضيّ يتبع لغةَ القاعدة (C بالحزمة، ولغةُ الخادم بالإنتاج) -- +0254
           -- فيُكتب «kit ×1، Lyse ×1» بقاعدةٍ و«Lyse ×1، kit ×1» بأخرى — والمرآةُ التجريبية بالبايت. والمادّةُ تفصل اسمين متساويين. -- +0254
           string_agg((case when c.source = 'waste' -- +0254
                            then format('%s ×%s%s', c.product_name, trim_scale(c.entered_qty), coalesce(' ' || c.unit_label, '')) -- +0254
                            else format('%s ×%s', c.product_name, trim_scale(-c.applied_delta)) end), -- +0254
                      '، ' order by c.product_name collate "C", c.product_id) -- +0254
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

  -- 0254: كلُّ مادّةٍ وافقنا عليها وبقيت تحت الصفر — تُقال بالشاشة («سجّل فاتورة الشراء أو سوّ جرد»)، بالبايت ثمّ المعرّف. -- +0254
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'stock', p.stock) -- +0254
                            order by p.name collate "C", p.id), '[]'::jsonb) -- +0254
    into v_neg -- +0254
    from products p -- +0254
   where p.clinic_id = v_clinic and p.stock < 0 -- +0254
     and p.id in (select c.product_id from stock_counts c where c.id = any(v_done) and c.clinic_id = v_clinic); -- +0254
-- -0254   return jsonb_build_object('approved', n_ok, 'rejected', n_rej, 'void', n_void, 'withdrawals', v_out);
  return jsonb_build_object('approved', n_ok, 'rejected', n_rej, 'void', n_void, 'withdrawals', v_out, -- +0254
                            'negatives', v_neg); -- +0254
end $$;
revoke all on function public.stock_count_decide(uuid[], boolean) from public, anon;
grant execute on function public.stock_count_decide(uuid[], boolean) to authenticated;

-- ── ٣) معاينةُ الموافقة: ما ستكتبه الموافقةُ حرفاً — بالموافقة نفسِها داخل معاملةٍ فرعية تُلغى ─────────────────────
-- شاشةُ الجرد كانت تحسب السحبَ بلقطة كلّ سطر، والموافقةُ صارت تكلّف ما تأخذه من دفعة الراجع بكلفتها (أعلاه) — فلا يوافق المديرُ
-- على رقمٍ ويُسجَّل غيرُه (StockCount.tsx). لا نسخةَ ثانيةً من الحساب: تُنادى stock_count_decide نفسُها ثمّ يُرمى استثناءٌ برمزٍ
-- خاصّ فيُلغى كلُّ ما كتبته (الرصيد، الدفعات، السحوبات، الدفتر، التدقيق، وأقفالُ الصفوف معها)، والمتغيّراتُ تبقى. invoker: الموافقةُ
-- تسأل الدورَ بنفسها (المديرُ وحده)، والقراءةُ بعدها بسياسة الجدول. وأيُّ رفضٍ منها (no_clinic، count_needs_manager…) يصل كما هو.
create or replace function public.stock_count_preview(p_ids uuid[])
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_out   jsonb;
  v_costs jsonb;
begin
  begin
    v_out := public.stock_count_decide(p_ids, true);
    select coalesce(jsonb_object_agg(c.id::text, c.unit_cost), '{}'::jsonb) into v_costs
      from stock_counts c
     where c.id = any(p_ids) and c.status = 'approved' and c.decided_at = now();
    raise exception using errcode = 'P0D90', message = 'stock_count_preview_undo';
  exception when sqlstate 'P0D90' then
    null;
  end;
  -- معرّفُ السحب لصفٍّ أُلغي ليس معرّفاً: يُشال.
  return (v_out - 'withdrawals') || jsonb_build_object(
    'withdrawals', coalesce((select jsonb_agg(w - 'expense_id') from jsonb_array_elements(v_out->'withdrawals') w), '[]'::jsonb),
    'costs', v_costs);
end $$;
revoke all on function public.stock_count_preview(uuid[]) from public, anon;
grant execute on function public.stock_count_preview(uuid[]) to authenticated;
comment on function public.stock_count_preview(uuid[]) is
  'معاينةُ موافقة الجرد/التلف (0290): نتيجةُ stock_count_decide نفسِها (السحوباتُ بأسبابها) وكلفةُ كلّ سطرٍ كما ستُكتب — داخل معاملةٍ فرعية تُلغى، فلا يتغيّر شيء.';
