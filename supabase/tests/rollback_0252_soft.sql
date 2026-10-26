-- ============================================================================
-- تراجعُ 0252 الليّن — **لا يُنزَّل مع الهجرات**. يُشغَّل يدوياً (محرّر SQL بدور postgres) إن لزم
-- إيقافُ خصم المستهلكات عند البيع بعد النشر. ويُجرَّب بآخر `run.sh` كي لا يكون ورقاً.
--
-- ما يفعله: يعيد retail_checkout بنصّ 0242 **حرفاً** وبصلاحياتها (لا منحَ لـanon، والتنفيذُ للمسجَّل).
-- فالبيعةُ بعده لا تخطّط ولا تخصم ولا تكتب دفتراً ولا تخطّياً، وكلفةُ سطر الخدمة كلفةُ الجهاز كما كانت.
--
-- ما يُبقيه عمداً:
--   • محفّزاتُ العكس الأربعة والجداول: فاتورةٌ بيعت قبل التراجع تُرجَّع وتُحذف وتُعدَّل فتردّ موادَّها
--     بالضبط — إسقاطُها يترك موادَّ مخصومةً لبيعاتٍ لم تعد.
--   • التعديلُ بربطه (edit_invoice_lines_unguarded من 0252): التعديلُ يحذف السطورَ ويعيدها، ومحفّزُ
--     الحذف يردّ الموادّ — وبلا الربط تُردّ الموادُّ وكلفتُها باقيةٌ بـunit_cost الذي يعيده الجهاز.
--     **لا يُعاد التعديلُ لنصّ 0241 ما دام بـinvoice_consumption صفّ.**
--   • product_movements وقراءاتُ الوصفة: لا تكتب شيئاً.
--
-- بعده: verify_consumption_wiring() تقول «retail_checkout: lacks …» — هذا المقصود. وللرجوع: أعِد 0252 ثمّ 0253
-- و0254 و0255 **بترتيبها** (كما يفعل _m0252 بالحزمة) — ترجع الخصمَ (حارسُ 0252 يعرف نصَّ 0242 ببصمته) والفحصَ صفراً.
-- و0252 وحدها لا تكفي: تُرجع أجسامَ 0255 (البيعة والتعديل وطيّ الدمج وstock_unit_cost) لنصّها، والفحصُ يقول
-- «verify_consumption_wiring(): lacks» بعلامة 0255 حتى تُعاد 0254 ثمّ 0255.
-- والإلغاءُ الكامل لـ0252 بترويسة الهجرة نفسها، حين يكون الدفترُ فارغاً وحده.
-- ============================================================================

set lock_timeout = '5s';

create or replace function public.retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns invoices
language plpgsql
security definer
set search_path to 'public'
as $function$
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
  -- مرجعُ المحاولة: يولّده الجهاز مرّةً، ويثبت عبر كل إعادة.
  v_ref      text := nullif(btrim(p_meta->>'client_ref'), '');
  -- نوعُ البيع: تجزئة (الافتراض) أو جملة. غيرُ المعروف يسقط إلى تجزئة —
  -- عميلٌ قديم لا يرسل الحقل يبقى يعمل كما هو حرفاً بحرف.
  v_kind     text := case when lower(nullif(btrim(p_meta->>'sale_kind'), '')) = 'wholesale'
                          then 'wholesale' else 'retail' end;
  v_details  jsonb := case
                        when jsonb_typeof(p_meta->'payment_details') = 'array'
                             and jsonb_array_length(p_meta->'payment_details') > 0
                        then p_meta->'payment_details'
                        else null
                      end;
  -- 0242: لحظةُ بيعٍ سابقة (يرسلها الجهاز لفاتورةٍ نُسيت) وتوقيتُه لحساب «اليوم».
  -- غائبةٌ = بيعُ الآن، حرفاً كما كان.
  v_sale_raw text := nullif(btrim(p_meta->>'sale_at'), '');
  v_tz       text := coalesce(nullif(btrim(p_meta->>'sale_tz'), ''), 'Asia/Baghdad');
  v_at       timestamptz;
  v_today    date;
  v_day      date;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  -- إعادةٌ لبيعةٍ سُجّلت سلفاً: تُرجَع كما هي، بلا فاتورةٍ ثانية ولا خصمٍ ثانٍ.
  -- **قبل** فحص التاريخ: بيعةٌ مؤرَّخةٌ ثبتت وضاع جوابُها لا تُرفض عند إعادتها.
  if v_ref is not null then
    select * into v_invoice from invoices
     where clinic_id = v_clinic and client_ref = v_ref;
    if found then return v_invoice; end if;
  end if;

  if v_sale_raw is not null then
    if platform_acting_clinic() is not null then
      raise exception 'backdate_operator_not_allowed'
        using hint = 'مشغّلُ المنصّة لا يسجّل فواتير بيومٍ سابق داخل عيادة — سطرُ مالٍ يسمّي شخصاً من كادرها.';
    end if;
    if coalesce(auth_role(), '') <> 'manager' then
      raise exception 'backdate_not_allowed'
        using hint = 'تسجيلُ فاتورةٍ بيومٍ سابق للمدير — افتح وضعَ المدير برمزه.';
    end if;
    begin
      v_at := v_sale_raw::timestamptz;
    exception when others then
      raise exception 'sale_at_invalid' using hint = 'تاريخُ المبيع مو مفهوم — اختاره من جديد.';
    end;
    -- توقيتٌ مجهول يسقط لبغداد — كتقارير 0149 (p_tz)، لا رفضٌ لبيعةٍ صحيحة بسبب جهاز.
    begin
      v_today := (now() at time zone v_tz)::date;
    exception when others then
      v_tz := 'Asia/Baghdad';
      v_today := (now() at time zone v_tz)::date;
    end;
    v_day := (v_at at time zone v_tz)::date;
    if v_at > now() or v_day >= v_today then
      raise exception 'sale_day_not_past'
        using hint = 'تاريخُ المبيع لازم يومٌ قبل اليوم — فاتورةُ اليوم تنسجّل بدون تاريخ.';
    end if;
    if v_day < v_today - 7 then
      raise exception 'backdate_window'
        using hint = 'أقدمُ يومٍ يُقبل قبل ٧ أيام — فاتورةٌ أقدم تحتاج قرارَ صاحب العيادة.';
    end if;
    -- سِيَقُ البيعة تُؤرَّخ بالفاتورة: ساقٌ بـ`at` «هسّة» كانت تنزل بمقبوضات اليوم.
    if v_details is not null then
      select jsonb_agg(case when jsonb_typeof(l) = 'object' then l - 'at' else l end)
        into v_details
        from jsonb_array_elements(v_details) l;
    end if;
  end if;

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

  -- كتلةٌ بمعالج: خرقُ الفهرس الفريد يعني أن نسخةً متزامنة سبقتنا، فيتراجع
  -- كل ما كتبناه (الفاتورة وبنودها وخصمُ المخزون) ونُرجع فاتورتها هي.
  begin
    insert into invoices (clinic_id, subtotal, discount, discount_type, total, amount_paid, cost_total, profit,
                          item_count, customer_name, customer_phone, pet_name, payment_method, payment_details,
                          staff_id, notes, status, client_ref, sale_kind, created_at, recorded_at)
    values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_paid, v_cost, v_total - v_cost,
            round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
            nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''), v_details,
            nullif(p_meta->>'staff_id','')::uuid, nullif(p_meta->>'notes',''), 'paid', v_ref, v_kind,
            coalesce(v_at, now()), case when v_at is not null then now() end)
    returning * into v_invoice;

    for it in select * from jsonb_array_elements(p_items) loop
      v_qty    := (it->>'qty')::numeric;
      v_stockq := coalesce(nullif(it->>'stock_qty','')::numeric, v_qty);
      v_fp     := 0;
      if nullif(it->>'product_id','') is not null then
        if v_stockq > 0 then
          v_fp := deduct_stock_pooled((it->>'product_id')::uuid, v_stockq, v_clinic);
        elsif v_stockq < 0 then
          perform credit_stock((it->>'product_id')::uuid, -v_stockq, v_clinic);
        end if;
      end if;
      -- البندُ بتاريخ فاتورته (0133) — والمؤرَّخةُ بيومها لا بيوم إدخالها.
      insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, created_at)
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
        nullif(it->>'unit_label',''),
        v_invoice.created_at
      );
    end loop;
  exception when unique_violation then
    -- لا نبلع كل خرقٍ فريد: إن لم يكن مرجعُنا هو السبب، فالخطأ حقيقيّ ويُرفع.
    if v_ref is null then raise; end if;
    select * into v_invoice from invoices
     where clinic_id = v_clinic and client_ref = v_ref;
    if not found then raise; end if;
    return v_invoice;
  end;

  return v_invoice;
end $function$;
revoke all on function public.retail_checkout(jsonb, jsonb) from public, anon;
grant execute on function public.retail_checkout(jsonb, jsonb) to authenticated;

reset lock_timeout;
