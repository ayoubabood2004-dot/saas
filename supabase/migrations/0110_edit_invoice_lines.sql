-- ============================================================================
-- 0110 — تعديل أصناف فاتورة قائمة (edit_invoice_lines)
--
-- الحاجة من الميدان: زبون التوصيل يتصل بعد دقائق من خروج الطلب ليضيف صنفاً أو
-- يغيّر كمية. بلا هذه الدالة كان الطبيب مضطراً لإرجاع الفاتورة وإنشاء غيرها —
-- فيتبدّل رقم الفاتورة التي يحملها السواق، ويتلوّث سجل المبيعات بفاتورة ملغاة.
--
-- القاعدة الحاكمة: **لا ينزلق مخزون ولا نقد**. التعديل ليس تفاضلياً (هشّ)، بل:
--   ١) عكسٌ كامل لكل سطر قائم بنفس تقسيمه (حصّة القسم المشترك تعود للقسم،
--      والباقي لرصيد المنتج) — نفس منطق refund_invoice حرفياً (0066).
--   ٢) حذف الأسطر القديمة، ثم خصم الأسطر الجديدة بنفس منطق retail_checkout
--      (المخزون المعروف أولاً ثم مخزون القسم)، مع رفض أي كمية تتجاوز المتاح.
--   ٣) المدفوع (amount_paid) لا يُلمَس أبداً — نقد الزبون ليس رقماً يُعاد حسابه.
--      يُعاد حساب الإجمالي والربح، ويُحدَّث مستحقّ السواق = الإجمالي − المدفوع.
--
-- الذرّية مقصودة: انقطاع الشبكة بمنتصف التعديل كان سيترك مخزوناً منقوصاً
-- وفاتورة بمبلغ قديم. دالة واحدة = معاملة واحدة = إمّا كلّه أو لا شيء.
--
-- فاتورة مرتجعة لا تُعدَّل: سجلّها مغلق، والطريق الصحيح إرجاعٌ جديد.
-- ============================================================================

create or replace function edit_invoice_lines(p_invoice uuid, p_lines jsonb, p_note text default null)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  v_old_total numeric(12,2);
  v_old_count int;
  v_new_count int;
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_items    numeric(12,3) := 0;
  v_paid     numeric(12,2);
  v_discount numeric(12,2);
  v_total    numeric(12,2);
  v_stamp    text;
  r          record;
  l          record;
  v_stock_qty numeric(12,3);
  v_from_stock numeric(12,3);
  v_from_pool  numeric(12,3);
  v_avail      numeric(12,3);
  v_prod       products;
  v_pool       numeric(12,3);
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty invoice';
  end if;

  v_old_total := coalesce(v_invoice.total, 0);
  select count(*) into v_old_count from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ١) العكس الكامل: نفس تقسيم refund_invoice بالضبط ────────────────────
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

  delete from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ٢) إعادة الخصم: المعروف أولاً ثم مخزون القسم (نفس retail_checkout) ──
  for l in
    select
      nullif(e->>'product_id','')::uuid            as product_id,
      coalesce(e->>'name','')                      as name,
      nullif(e->>'barcode','')                     as barcode,
      coalesce((e->>'qty')::numeric, 0)            as qty,
      coalesce((e->>'unit_price')::numeric, 0)     as unit_price,
      coalesce((e->>'unit_cost')::numeric, 0)      as unit_cost,
      nullif(e->>'unit_label','')                  as unit_label,
      coalesce((e->>'stock_qty')::numeric, null)   as stock_qty_in
    from jsonb_array_elements(p_lines) as e
  loop
    if l.qty <= 0 then continue; end if;
    -- كمية المخزون المسحوبة: تُمرَّر صراحةً لبيع الأجزاء، وإلا فهي الكمية نفسها.
    v_stock_qty := round(coalesce(l.stock_qty_in, l.qty), 3);
    v_from_pool := 0;
    v_from_stock := 0;

    if l.product_id is not null then
      select * into v_prod from products where id = l.product_id and clinic_id = v_clinic;
      if found then
        v_pool := 0;
        if v_prod.section_id is not null then
          select coalesce(pooled_stock, 0) into v_pool from company_sections
            where id = v_prod.section_id and clinic_id = v_clinic;
        end if;
        v_avail := round(coalesce(v_prod.stock, 0) + coalesce(v_pool, 0), 3);
        if v_stock_qty > v_avail + 0.0005 then
          raise exception 'not enough stock: %', l.name;
        end if;
        v_from_stock := least(v_stock_qty, greatest(coalesce(v_prod.stock, 0), 0));
        if v_from_stock > 0 then
          update products set stock = round(stock - v_from_stock, 3)
            where id = l.product_id and clinic_id = v_clinic;
        end if;
        if v_stock_qty - v_from_stock > 0 and v_prod.section_id is not null then
          v_from_pool := least(v_stock_qty - v_from_stock, greatest(coalesce(v_pool, 0), 0));
          if v_from_pool > 0 then
            update company_sections set pooled_stock = round(pooled_stock - v_from_pool, 3)
              where id = v_prod.section_id and clinic_id = v_clinic;
          end if;
        end if;
      end if;
    end if;

    insert into invoice_items (clinic_id, invoice_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label)
    values (v_clinic, p_invoice, l.product_id, l.name, l.barcode, l.qty, l.unit_price, l.unit_cost,
            round(l.qty * l.unit_price, 2), v_stock_qty, v_from_pool, l.unit_label);

    v_subtotal := v_subtotal + round(l.qty * l.unit_price, 2);
    v_cost     := v_cost     + round(l.qty * l.unit_cost, 2);
    v_items    := v_items    + l.qty;
    v_new_count := coalesce(v_new_count, 0) + 1;
  end loop;

  if coalesce(v_new_count, 0) = 0 then raise exception 'empty invoice'; end if;

  -- ─── ٣) إعادة الحساب: المدفوع لا يُمَس، وأجرة التوصيل سطرٌ محسوب أصلاً ───
  v_discount := greatest(coalesce(v_invoice.discount, 0), 0);
  v_total    := greatest(round(v_subtotal - v_discount, 2), 0);
  v_paid     := coalesce(v_invoice.amount_paid, 0);

  -- ختم سبب التعديل داخل الفاتورة: يبقى ملازماً لها ويظهر بطباعتها. سجل
  -- الحركات يلتقط الفعل نفسه آلياً عبر محفّزات 0018/0044.
  v_stamp := 'تعديل ' || to_char(now(), 'YYYY-MM-DD') || ': '
          || v_old_count || '→' || v_new_count || ' سطر · '
          || to_char(v_old_total, 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when coalesce(btrim(p_note), '') <> '' then ' · ' || left(btrim(p_note), 120) else '' end;

  update invoices set
    subtotal   = v_subtotal,
    total      = v_total,
    cost_total = v_cost,
    profit     = round(v_total - v_cost, 2),
    item_count = v_items,
    notes      = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_invoice;

  -- مستحقّ السواق يتبع الإجمالي الجديد فوراً — لا يجمع مبلغاً قديماً أبداً.
  update delivery_orders
     set cod_amount = greatest(round(v_total - v_paid, 2), 0)
   where invoice_id = p_invoice and clinic_id = v_clinic
     and status in ('preparing', 'out');

  return v_invoice;
end $$;

revoke all on function edit_invoice_lines(uuid, jsonb, text) from public, anon;
grant execute on function edit_invoice_lines(uuid, jsonb, text) to authenticated;
