-- ============================================================================
-- doctorVet — 0121: المرتجع (return_invoice_items)
--
-- ── الحالة من الميدان ─────────────────────────────────────────────────────
-- زبون يرجع بعد يومين بقنينة من ثلاث اشتراها. قبل هذه الدالة كان أمام
-- الكاشير طريقان أحلاهما مُرّ: إرجاع الفاتورة كاملةً (يلغي بيعاً صحيحاً
-- ويلوّث سجل الزبون)، أو تجاهل السستم وإخراج النقد بلا أثر (فينكسر الصندوق
-- والمخزون معاً). المرتجع الجزئي هو الحقيقة اليومية للبيع، فيلزمه مسار أول.
--
-- ── ثلاث حقائق تتحرك معاً — بمعاملة واحدة ─────────────────────────────────
--   ١) المخزون: الكمية الراجعة تعود بنفس تقسيمها وقت البيع — حصة القسم
--      المشترك للقسم (نسبياً من pooled_qty) والباقي لرصيد المنتج، ببيع
--      الأجزاء تعود بمكافئ العلبة (stock_qty/qty لكل وحدة).
--   ٢) الفاتورة: كمية السطر تنقص (أو يُحذف إن رجع كله)، ويُعاد حساب
--      المجموع والكلفة والربح وعدد القطع — الخصم الثابت يبقى كما هو.
--   ٣) النقد: ما يُعاد فعلاً للزبون = ما دفعه فوق الإجمالي الجديد
--      (بيعة آجلة برصيد أقل من الإجمالي الجديد ⇒ لا نقد يخرج، الدين ينقص
--      وحده). يُسجَّل سطرَ تحصيلٍ سالباً بنفس آلية تصحيح التحصيل (0113)،
--      فينقص من جيب الدفع نفسه ويصدق الصندوق واليوم معاً.
--
-- إرجاع كل الأصناف = إرجاع الفاتورة كاملةً: نفس دلالات refund_invoice
-- حرفياً (الحالة refunded والأسطر تبقى كما طُبعت) حتى لا تتفرع الحقيقة
-- لنسختين — التقارير القائمة كلها تفهم refunded أصلاً.
--
-- p_returns: [{"item_id": "...", "qty": 1}, …] — الكمية الراجعة من كل سطر.
-- إضافيّة وقابلة لإعادة التشغيل. تُطبَّق بعد 0113.
-- ============================================================================

create or replace function return_invoice_items(
  p_invoice uuid, p_returns jsonb, p_method text default null, p_note text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_inv      invoices;
  v_method   text;
  v_details  jsonb;
  v_pos      numeric(14,2);
  v_back     numeric(14,2);
  v_paid     numeric(14,2);
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_items    numeric(12,3) := 0;
  v_count    int := 0;
  v_total    numeric(12,2);
  v_stamp    text;
  v_full     boolean := true;
  r          record;
  it         invoice_items;
  v_ret      numeric(12,3);
  v_per      numeric(14,6);
  v_ret_stock numeric(12,3);
  v_ret_pool  numeric(12,3);
  v_section  uuid;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_returns is null or jsonb_typeof(p_returns) <> 'array' or jsonb_array_length(p_returns) = 0 then
    raise exception 'nothing to return';
  end if;

  -- هل هذا إرجاعٌ كامل؟ كل سطرٍ بالفاتورة مطلوبٌ إرجاع كامل كميته.
  for it in select * from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
    select coalesce((e->>'qty')::numeric, 0) into v_ret
      from jsonb_array_elements(p_returns) e where e->>'item_id' = it.id::text limit 1;
    if coalesce(v_ret, 0) + 0.0005 < it.qty then v_full := false; end if;
  end loop;

  if v_full then
    -- إرجاع كامل ⇒ نفس دلالات refund_invoice: استرجاع مخزون كل الأسطر
    -- وقلب الحالة، والأسطر تبقى كما طُبعت للزبون.
    for r in
      select ii.product_id, ii.qty, ii.stock_qty, ii.pooled_qty, p.section_id
        from invoice_items ii
        left join products p on p.id = ii.product_id and p.clinic_id = v_clinic
       where ii.invoice_id = p_invoice and ii.clinic_id = v_clinic
    loop
      if r.product_id is not null then
        if coalesce(r.pooled_qty, 0) > 0 and r.section_id is not null then
          update company_sections set pooled_stock = pooled_stock + r.pooled_qty
            where id = r.section_id and clinic_id = v_clinic;
          update products set stock = stock + (coalesce(r.stock_qty, r.qty) - r.pooled_qty)
            where id = r.product_id and clinic_id = v_clinic;
        else
          update products set stock = stock + coalesce(r.stock_qty, r.qty)
            where id = r.product_id and clinic_id = v_clinic;
        end if;
      end if;
    end loop;
    update invoices set status = 'refunded', refunded_at = now()
      where id = p_invoice and clinic_id = v_clinic
      returning * into v_inv;
    return v_inv;
  end if;

  -- ── إرجاع جزئي: سطراً سطراً ────────────────────────────────────────────
  for r in
    select
      nullif(e->>'item_id','')::uuid       as item_id,
      coalesce((e->>'qty')::numeric, 0)    as ret_qty
    from jsonb_array_elements(p_returns) e
  loop
    if r.item_id is null or r.ret_qty <= 0 then continue; end if;
    select * into it from invoice_items
      where id = r.item_id and invoice_id = p_invoice and clinic_id = v_clinic for update;
    if not found then raise exception 'item not found'; end if;
    v_ret := least(round(r.ret_qty, 3), it.qty);

    -- المخزون: بنفس نسب البيع — المسحوب لكل وحدة، وحصة القسم نسبية.
    if it.product_id is not null then
      v_per := case when it.qty > 0 and it.stock_qty is not null then it.stock_qty / it.qty else 1 end;
      v_ret_stock := round(v_ret * v_per, 3);
      v_ret_pool  := round(coalesce(it.pooled_qty, 0) * v_ret / it.qty, 3);
      if v_ret_pool > 0 then
        select p.section_id into v_section from products p
          where p.id = it.product_id and p.clinic_id = v_clinic;
        if v_section is not null then
          update company_sections set pooled_stock = pooled_stock + v_ret_pool
            where id = v_section and clinic_id = v_clinic;
        else
          v_ret_pool := 0; -- المنتج فقد قسمه — الكل لرصيده
        end if;
      end if;
      update products set stock = round(stock + (v_ret_stock - v_ret_pool), 3)
        where id = it.product_id and clinic_id = v_clinic;
    end if;

    if v_ret + 0.0005 >= it.qty then
      delete from invoice_items where id = it.id and clinic_id = v_clinic;
    else
      update invoice_items set
        qty        = round(it.qty - v_ret, 3),
        line_total = round((it.qty - v_ret) * it.unit_price, 2),
        stock_qty  = case when it.stock_qty is null then null else round(it.stock_qty - v_ret_stock, 3) end,
        pooled_qty = case when it.pooled_qty is null then null else round(it.pooled_qty - v_ret_pool, 3) end
      where id = it.id and clinic_id = v_clinic;
    end if;
  end loop;

  -- إعادة الحساب من الأسطر الباقية — الخصم الثابت يبقى كما هو.
  select coalesce(sum(line_total), 0), coalesce(sum(round(qty * unit_cost, 2)), 0),
         coalesce(sum(qty), 0), count(*)
    into v_subtotal, v_cost, v_items, v_count
    from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;
  if v_count = 0 then raise exception 'nothing left'; end if; -- الكامل عولج فوق

  v_total := greatest(round(v_subtotal - greatest(coalesce(v_inv.discount, 0), 0), 2), 0);
  v_paid  := coalesce(v_inv.amount_paid, v_inv.total);
  -- النقد الخارج فعلاً: ما دفعه فوق الإجمالي الجديد. بيعة آجلة ⇒ الدين ينقص وحده.
  v_back  := greatest(round(v_paid - v_total, 2), 0);

  v_details := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_back > 0 then
    v_method := coalesce(
      nullif(btrim(p_method), ''),
      (select e->>'method' from jsonb_array_elements(v_details) e
        where (e->>'amount')::numeric > 0 order by (e->>'amount')::numeric desc limit 1),
      v_inv.payment_method, 'cash');
    -- تثبيت الساق الضمنية قبل السالب — نفس درس 0113 حرفياً.
    select coalesce(sum((e->>'amount')::numeric), 0) into v_pos
      from jsonb_array_elements(v_details) e where (e->>'amount')::numeric > 0;
    if v_pos < v_paid then
      v_details := v_details || jsonb_build_object(
        'method', coalesce(v_inv.payment_method, v_method),
        'amount', v_paid - v_pos,
        'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    v_details := v_details || (jsonb_build_object(
        'method', v_method, 'amount', -v_back,
        'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      || jsonb_build_object('note', left('مرتجع' || case when coalesce(btrim(p_note), '') <> '' then ': ' || btrim(p_note) else '' end, 120)));
  end if;

  v_stamp := 'مرتجع ' || to_char(now(), 'YYYY-MM-DD') || ': '
          || to_char(coalesce(v_inv.total, 0), 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when v_back > 0 then ' · أُعيد نقداً ' || to_char(v_back, 'FM999,999,990.99') else '' end
          || case when coalesce(btrim(p_note), '') <> '' then ' · ' || left(btrim(p_note), 120) else '' end;

  update invoices set
    subtotal        = v_subtotal,
    total           = v_total,
    cost_total      = v_cost,
    profit          = round(v_total - v_cost, 2),
    item_count      = v_items,
    amount_paid     = greatest(round(v_paid - v_back, 2), 0),
    payment_details = v_details,
    payment_method  = coalesce((select e->>'method' from jsonb_array_elements(v_details) e
                                 where (e->>'amount')::numeric > 0
                                 order by (e->>'amount')::numeric desc limit 1),
                               v_inv.payment_method),
    notes           = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_inv;

  return v_inv;
end $$;

revoke all on function return_invoice_items(uuid, jsonb, text, text) from public, anon;
grant execute on function return_invoice_items(uuid, jsonb, text, text) to authenticated;
