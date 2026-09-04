-- ============================================================================
-- ٠١٥٦ — بيعُ الجملة يُعلَن بالبيانات لا بالشاشة وحدها
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- شاشةُ البيع بالجملة تبيع بسعر الشراء. وهذا وحده — بلا علامةٍ بالقاعدة —
-- ينتج فاتورةً **لا تُفرَّق عن فاتورة تجزئةٍ بيعت رخيصة**، لا بمحفّزِ التدقيق
-- ولا بدوالِّ التقارير ولا بعينِ قارئٍ يفتّش الصفَّ بعد سنة.
--
-- والأثرُ مركَّب: `retail_checkout` تجمّد الربحَ لحظةَ الإدراج (total - cost)،
-- فبيعُ الجملة بالكلفة يجعله صفراً بالبناء، وسالباً بأوّل خصمٍ أو عرضٍ أو
-- تدوير. ثم تخلطه كلُّ مجاميع 0149 — الإيصالاتُ اليومية، وترتيبُ المنتجات،
-- وأداءُ الموظّفين، وهامشُ العيادة بلوحة التقارير — بلا حقلٍ واحدٍ يُرشَّح به.
-- فيبدو أن العيادةَ تخسر، والسببُ أنها باعت بالجملة عمداً.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- العلامةُ تنزل مع الميزة لا بعدها. عمودٌ واحد على الفاتورة يقول نوعَها، تكتبه
-- الدالّةُ نفسها بنفس المعاملة التي تكتب البنود — لا نداءٌ ثانٍ بعد النجاح،
-- لأن نداءً ثانياً يفشل فيترك فاتورةَ جملةٍ بلا علامةٍ إلى الأبد.
--
-- والافتراضُ retail والمجهولُ يسقط إليه: عميلٌ قديم لا يرسل الحقل يعمل كما هو
-- حرفاً بحرف، وصفوفُ التاريخ كلُّها تجزئةٌ وهي كذلك فعلاً.
--
-- ── ما لا تفعله ──────────────────────────────────────────────────────────
-- لا تغيّر تسعيراً ولا خصماً ولا مخزوناً ولا ربحاً محسوباً، ولا تلمس صفّاً
-- قائماً. عمودٌ بافتراضٍ ودالّةٌ تكتبه. إضافيةٌ وتُعاد بلا أثرٍ ثانٍ.
-- تُطبَّق بعد 0155.
--
-- ── التراجع ──────────────────────────────────────────────────────────────
--   alter table invoices drop column if exists sale_kind;
--   ثم أعِد نصَّ الدالّة من 0135 كما هو.
-- ============================================================================

alter table invoices add column if not exists sale_kind text not null default 'retail';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_sale_kind_chk') then
    alter table invoices add constraint invoices_sale_kind_chk
      check (sale_kind in ('retail', 'wholesale'));
  end if;
end $$;

-- ترشيحُ الجملة من التجزئة يجري على مدّةٍ دائماً (0149)، فالفهرسُ مركَّبٌ على
-- العيادة والنوع والتاريخ لا على النوع وحده. وجزئيٌّ لأن التجزئة هي الغالبية
-- الساحقة — فهرسةُ كلِّ فاتورةٍ لتمييز القليل كلفةٌ بلا مقابل.
create index if not exists invoices_sale_kind_idx
  on invoices (clinic_id, sale_kind, created_at desc)
  where sale_kind <> 'retail';

-- ــــ الدالّة: نصُّ 0135 نفسه، وزيادتُه سطرُ إعلانٍ وعمودٌ بالإدراج ــــ
create or replace function retail_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
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
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  -- إعادةٌ لبيعةٍ سُجّلت سلفاً: تُرجَع كما هي، بلا فاتورةٍ ثانية ولا خصمٍ ثانٍ.
  if v_ref is not null then
    select * into v_invoice from invoices
     where clinic_id = v_clinic and client_ref = v_ref;
    if found then return v_invoice; end if;
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
                          staff_id, notes, status, client_ref, sale_kind)
    values (v_clinic, v_subtotal, v_discount, v_dtype, v_total, v_paid, v_cost, v_total - v_cost,
            round(v_count)::int, nullif(p_meta->>'customer_name',''), nullif(p_meta->>'customer_phone',''),
            nullif(p_meta->>'pet_name',''), nullif(p_meta->>'payment_method',''), v_details,
            nullif(p_meta->>'staff_id','')::uuid, nullif(p_meta->>'notes',''), 'paid', v_ref, v_kind)
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
