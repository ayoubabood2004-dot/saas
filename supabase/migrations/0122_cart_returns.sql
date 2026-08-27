-- ============================================================================
-- doctorVet — 0122: الراجع داخل السلة (أسطر سالبة بفاتورة البيع)
--
-- ── الحالة من الميدان ─────────────────────────────────────────────────────
-- زبون يجي بعد يومين: يرجع شامبو بألف، ويشتري طعاماً بخمسة آلاف. الكاشير
-- يريدها عمليةً واحدة: يدگّ باركود الراجع فينزل بالسالب، ثم باركود المشترى،
-- فيدفع الزبون **الفرق** (٤٠٠٠) — لا عمليتان ولا حسبةٌ بالورقة.
--
-- ── ما الذي كان يمنعها ────────────────────────────────────────────────────
-- `deduct_stock_pooled` تُرجع صفراً لأي كميةٍ ≤ 0 (حارسٌ صحيح: الخصم لا
-- يكون سالباً). فسطرٌ سالب كان يمرّ بالفاتورة بلا أن يرجع للمخزون شيء —
-- أي فاتورةٌ صادقة ومخزونٌ كاذب. الحلّ ليس إضعاف الحارس بل مسارٌ ثانٍ
-- صريح: كميةٌ موجبة ⇒ خصم، وسالبة ⇒ **ردّ**.
--
-- الردّ يذهب كلّه لرصيد المنتج المعروف (لا لمخزون القسم المجمّع): سطر
-- السلة الراجع لا يعرف من أي جيبٍ خرجت القطعة أصلاً، وردُّها للرصيد
-- المعروف هو الأصدق — القسم المجمّع احتياطٌ لمجهول العدّ، ودفعُ مجهولٍ
-- إليه يزيد الغموض. الإرجاع المربوط بفاتورةٍ (0121) يعرف التقسيم فيحترمه.
--
-- والإجمالي السالب مرفوض كما كان: `greatest(0, …)` باقٍ. الواجهة تمنع
-- الحفظ إذا زاد الراجع على المشترى وتحوّل الكاشير لتبويب «المرتجع» حيث
-- يخرج النقد بقيدٍ صحيح.
--
-- إضافيّة وقابلة لإعادة التشغيل. تُطبَّق بعد 0066.
-- ============================================================================

-- ردّ كميةٍ لرصيد المنتج المعروف. مرآةٌ لـdeduct_stock_pooled بنفس حرّاسها.
create or replace function credit_stock(p_product uuid, p_qty numeric, p_clinic uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_product is null or coalesce(p_qty, 0) <= 0 then return; end if;
  update products set stock = round(coalesce(stock, 0) + p_qty, 3)
   where id = p_product and clinic_id = p_clinic;
end $$;

revoke all on function credit_stock(uuid, numeric, uuid) from public, anon;

-- retail_checkout — نسخة 0066 حرفياً، وفيها فرقٌ واحد: السطر السالب يَرُدّ
-- بدل أن يخصم. كل ما عداه (الخصم، السعر النهائي، سِيَق الدفع، الأعمدة) كما هو.
create or replace function retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  it         jsonb;
  v_qty      numeric(14,3);
  v_stockq   numeric(14,3);
  v_fp       numeric(14,3);
  v_subtotal numeric(14,2) := 0;
  v_cost     numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_dtype    text    := nullif(p_meta->>'discount_type','');
  v_dinput   numeric(12,2) := coalesce(nullif(p_meta->>'discount_value','')::numeric, 0);
  v_discount numeric(14,2) := 0;
  v_total    numeric(14,2);
  v_final    numeric(14,2) := nullif(p_meta->>'final_total','')::numeric;
  v_paid     numeric(14,2);
  v_details  jsonb := case
                        when jsonb_typeof(p_meta->'payment_details') = 'array'
                             and jsonb_array_length(p_meta->'payment_details') > 0
                        then p_meta->'payment_details'
                        else null
                      end;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    v_subtotal := v_subtotal + v_qty * (it->>'unit_price')::numeric;
    v_cost     := v_cost     + v_qty * (it->>'unit_cost')::numeric;
    v_count    := v_count    + v_qty;
  end loop;

  if v_final is not null then
    v_total    := greatest(0, v_final);
    v_discount := greatest(0, v_subtotal - v_total);
    v_dtype    := case when v_discount > 0 then 'fixed' else null end;
  elsif v_dtype = 'percent' then
    v_discount := round(v_subtotal * least(greatest(v_dinput, 0), 100) / 100.0, 2);
    v_total    := greatest(0, v_subtotal - v_discount);
  elsif v_dtype = 'fixed' then
    v_discount := least(greatest(v_dinput, 0), v_subtotal);
    v_total    := greatest(0, v_subtotal - v_discount);
  else
    v_discount := 0; v_dtype := null;
    v_total    := greatest(0, v_subtotal);
  end if;

  v_paid := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);

  insert into invoices (clinic_id, subtotal, discount, discount_type, total, amount_paid, cost_total, profit,
                        item_count, customer_name, customer_phone, pet_name, payment_method, payment_details, staff_id, notes, status)
  values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_paid, v_cost, v_total - v_cost,
          round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
          nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''), v_details,
          nullif(p_meta->>'staff_id','')::uuid, nullif(p_meta->>'notes',''), 'paid')
  returning * into v_invoice;

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty    := (it->>'qty')::numeric;
    v_stockq := coalesce(nullif(it->>'stock_qty','')::numeric, v_qty);
    v_fp     := 0;
    if nullif(it->>'product_id','') is not null then
      if v_stockq > 0 then
        v_fp := deduct_stock_pooled((it->>'product_id')::uuid, v_stockq, v_clinic);
      elsif v_stockq < 0 then
        -- سطر راجع: القطعة ترجع لرصيد المنتج المعروف.
        perform credit_stock((it->>'product_id')::uuid, -v_stockq, v_clinic);
      end if;
    end if;
    insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label)
    values (
      v_invoice.id, v_clinic,
      nullif(it->>'product_id','')::uuid,
      coalesce(it->>'name', 'Item'),
      it->>'barcode',
      v_qty,
      (it->>'unit_price')::numeric,
      (it->>'unit_cost')::numeric,
      v_qty * (it->>'unit_price')::numeric,
      v_stockq,
      v_fp,
      nullif(it->>'unit_label','')
    );
  end loop;

  return v_invoice;
end $$;

revoke all on function retail_checkout(jsonb, jsonb) from public, anon;
grant execute on function retail_checkout(jsonb, jsonb) to authenticated;
