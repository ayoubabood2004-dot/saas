-- ============================================================================
-- ٠٢٤٢ — «تاريخ المبيع»: فاتورةٌ نُسيت تُسجَّل بيومها — لا بيوم إدخالها، ولا بلا أثر
--
-- ── المقيس (الإنتاج ١٧/١٠، عدٌّ بلا أسماء) ─────────────────────────────────
-- • لا طريقَ رسميّاً اليوم: شاشةُ البيع تختم «هسّة» دائماً. والطريقُ غيرُ الرسميّ مفتوح:
--   سياسةُ invoices_update تسمح لكلّ كادر العيادة، ومحفّزُ المال (invoices_guard_money) لا يجمّد
--   created_at — فموظّفُ استقبالٍ يقدر ينقل بيعةَ اليوم النقدية لأمس بطلبٍ واحد، فيقلّ «النقدُ
--   المتوقّع» بصندوق اليوم بمبلغها. لم يحدث (صفرُ تحديثٍ لـcreated_at بسجلّ التدقيق منذ ٢٣/٨)،
--   لكنّ بابَ تأريخٍ رسميّاً بشرطٍ وبجانبه بابٌ بلا شرط = لا شرط. فيُغلق الجانبيّ معه.
-- • مَن يبيع (٣٠ يوماً): ٤٤٥٤ فاتورة من حساب صاحب العيادة، ٧١٨ من مدير، ١١ من طبيب. فـ«المدير
--   وحده» لا يحرم أحداً يبيع اليوم — والخطرُ الحسابُ المشترك على الاستقبال (درسُ الحذف):
--   الشرطُ بالخادم auth_role() = 'manager' (المفتاحُ الحيّ يرفع)، والواجهةُ تطلب المفتاحَ على
--   جهازٍ مقفول.
-- • البنودُ تحمل تاريخَ فاتورتها (0133؛ الفرقُ المقيس كلُّه سطورُ تعديلٍ لاحقة 0110) — فالبيعةُ
--   المؤرَّخة تختم الاثنين معاً، وإلا نزلت فاتورةُ أمس ببنودٍ تقرؤها تحليلاتُ اليوم.
-- • حركاتُ المادة (0207) تسمّي «بيع» بمقارنة لحظة الفاتورة بلحظة تغيّر الرصيد (٤ ثوانٍ) —
--   فاتورةٌ بيومٍ سابق كانت تُسمّى «تعديل». تُقارن الآن بلحظة الإدخال.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- • created_at = لحظةُ البيع (اليومُ المختار)، وrecorded_at = لحظةُ الإدخال الحقيقية — تُكتب
--   للمؤرَّخة وحدها. فكلُّ ما يقرأ created_at (التقارير 0149، receipt_legs بسِيَقٍ بلا `at`، دفترُ
--   الزبون، الصندوق) يرى البيعةَ بيومها بلا تعديلٍ واحد، وصندوقُ اليوم لا يتضخّم.
-- • ودفعتُها بيومها مضمونةٌ بالخادم: سِيَقُ البيعة المؤرَّخة تُكتب **بلا `at`** فتُؤرَّخ بالفاتورة —
--   ساقٌ تحمل «هسّة» كانت ستنزل بمقبوضات اليوم وتُرسم «تسديد دفعة» (0240).
-- • الشرطُ بالخادم لا بالواجهة: المدير (أو مفتاحُه الحيّ)، لا مشغّلُ المنصّة (كـ0241: سطرُ مالٍ يسمّي
--   شخصاً من كادر العيادة)، ويومٌ **قبل** اليوم بتوقيت الجهاز، ولا أقدم من ٧ أيام. التوقيتُ يُرسل
--   كـp_tz بتقارير 0149، والمجهولُ يسقط لبغداد.
-- • البابُ الجانبيّ يُغلق: created_at وrecorded_at لا يُكتبان مباشرةً بدور authenticated أبداً
--   (ولا من المدير — لا شاشةَ تكتبهما، ولا شيءَ بالواجهة يُدرج فاتورةً مباشرةً). محفّزٌ invoker
--   كـ0162؛ الدوالُّ (definer) تمرّ.
-- • الإعادةُ بنفس المرجع (0135) تُرجع الأولى كما هي — قبل أيّ فحصٍ للتاريخ: جوابٌ ضاع بعد منتصف
--   الليل لا يتحوّل رفضاً لبيعةٍ ثبتت.
-- • التدقيقُ يسمّيها: audit_kind ⇒ sale_backdated (مرآتُه activityKinds.ts)، وسطرُه يحمل يومَ البيع
--   `sold_at` — audit_change تحفظ لإدراجٍ قائمةً ثابتة، وrecorded_at كان خارجها (مقيسٌ على نصّ الإنتاج).
--
-- ── ما لا تفعله ──────────────────────────────────────────────────────────
-- • لا تمسّ المخزون: الخصمُ من الرصيد الحاليّ — البضاعةُ خرجت فعلاً والرصيدُ الحاليّ زائدٌ بها.
-- • لا تمسّ صفّاً قائماً، ولا تُؤرِّخ مرتجعاً (retail_return) ولا طلبَ توصيل.
--
-- تُطبَّق بعد 0241 **وقبل الواجهة**. إضافيةٌ وتُعاد بلا أثرٍ ثانٍ.
-- تراجع: أعد retail_checkout (0156)، product_movements (0207)، audit_change (0226)، audit_kind (0241) حرفاً؛ ثم
--        drop trigger if exists invoices_dates_guard on invoices; drop function if exists invoices_guard_dates();
--        والعمودُ يبقى (لا يقرؤه شيءٌ قديم، وإسقاطُه يمحو أثرَ التأريخ عن فواتيره).
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) العمود: متى أُدخلت فعلاً — فارغٌ = أُدخلت بلحظتها ──────────────────────
alter table invoices add column if not exists recorded_at timestamptz;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'invoices_recorded_after_chk') then
    alter table invoices add constraint invoices_recorded_after_chk
      check (recorded_at is null or recorded_at >= created_at);
  end if;
end $$;
comment on column invoices.recorded_at is
  'لحظةُ إدخال فاتورةٍ سُجّلت بيومٍ سابق (0242) — created_at يومُ البيع. فارغٌ = أُدخلت بلحظتها.';

-- ── ٢) البيعة: نصُّ 0156 حرفاً، وزيادتُه لحظةُ البيع وشرطُها ────────────────────
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

-- ── ٣) البابُ الجانبيّ: تاريخُ الفاتورة لا يُكتب مباشرةً ──────────────────────
-- invoker عمداً (درسُ 0162): يحرس current_user = 'authenticated' وحده، فدوالُّ المالك (البيعة،
-- التعديل، المرتجع) تمرّ، والرفضُ بتلميحٍ عربيّ لا بصمت.
create or replace function public.invoices_guard_dates()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    -- لا شيءَ بالواجهة يُدرج فاتورةً مباشرةً (البيعُ كلُّه retail_checkout) — فإدراجٌ بتاريخٍ
    -- غير الآن أو بختم إدخالٍ هو تأريخٌ يتجاوز شرطَه. خمسُ دقائق تبتلع فرقَ الساعات.
    if new.recorded_at is not null or abs(extract(epoch from (new.created_at - now()))) > 300 then
      raise exception 'invoice_date_frozen'
        using hint = 'تاريخُ الفاتورة يُكتب عند البيع وحده — لفاتورةٍ نُسيت: «تاريخ المبيع» بشاشة البيع (للمدير).';
    end if;
  elsif new.created_at is distinct from old.created_at or new.recorded_at is distinct from old.recorded_at then
    raise exception 'invoice_date_frozen'
      using hint = 'تاريخُ الفاتورة يُكتب عند البيع وحده — لفاتورةٍ نُسيت: «تاريخ المبيع» بشاشة البيع (للمدير).';
  end if;
  return new;
end $$;
drop trigger if exists invoices_dates_guard on invoices;
create trigger invoices_dates_guard before insert or update on invoices
  for each row execute function public.invoices_guard_dates();

-- ── ٤) حركاتُ المادة: نصُّ 0207 حرفاً إلا لحظةَ مقارنة الفاتورة ──────────────────
-- تغيّرُ الرصيد يحدث لحظةَ الإدخال، وفاتورةٌ مؤرَّخة لحظتُها يومُ البيع — فتُقارن بـrecorded_at
-- إن وُجد. بلا هذا تُسمّى البيعةُ المؤرَّخة «تعديلاً» مجهولاً.
create or replace function public.product_movements(p_product uuid, p_limit int default 100)
returns table (
  at         timestamptz,
  kind       text,      -- open | purchase | purchase_edit | sale | return | adjust
  from_qty   numeric,
  to_qty     numeric,
  delta      numeric,
  ref_id     uuid,      -- معرّفُ الفاتورة التي فسّرت الحركة، وإلا فارغ
  actor_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    -- تغييراتُ الرصيد كما سجّلها المحفّز: كان ← صار، بلا حسابٍ من عندنا.
    select a.id, a.created_at, a.actor,
           (a.details->'__changed'->'stock'->>0)::numeric as f,
           (a.details->'__changed'->'stock'->>1)::numeric as t
      from audit_log a
     where a.clinic_id = auth_clinic()
       and a.entity = 'products' and a.action = 'UPDATE'
       and a.entity_id = p_product::text
       and a.details->'__changed' ? 'stock'
    union all
    -- الميلاد: الرصيدُ الذي وُلد به المنتج.
    select a.id, a.created_at, a.actor, null::numeric, (a.details->>'stock')::numeric
      from audit_log a
     where a.clinic_id = auth_clinic()
       and a.entity = 'products' and a.action = 'INSERT'
       and a.entity_id = p_product::text
  ),
  named as (
    select ev.id, ev.created_at, ev.actor, ev.f, ev.t,
           case
             when ev.f is null           then 'open'
             when pu.id  is not null     then 'purchase'
             when ped.id is not null     then 'purchase_edit'
             when inv.id is not null     then (case when coalesce(ev.t,0) >= coalesce(ev.f,0) then 'return' else 'sale' end)
             else 'adjust'
           end as kind,
           coalesce(pu.id, ped.id, inv.id) as ref_id
      from ev
      -- **النافذةُ أربعُ ثوانٍ**: الحفظُ الواحد يكتب صفَّ الفاتورة وصفوفَ المنتجات بمعاملةٍ واحدة.
      left join lateral (
        select p.id from purchases p
         where p.clinic_id = auth_clinic()
           and abs(extract(epoch from (p.created_at - ev.created_at))) < 4
           and exists (select 1 from purchase_items pi where pi.purchase_id = p.id and pi.product_id = p_product)
         order by abs(extract(epoch from (p.created_at - ev.created_at))) limit 1
      ) pu on true
      left join lateral (
        select (b.entity_id)::uuid as id from audit_log b
         where b.clinic_id = auth_clinic() and b.entity = 'purchases' and b.action = 'UPDATE'
           and abs(extract(epoch from (b.created_at - ev.created_at))) < 4
           and exists (select 1 from purchase_items pi
                        where pi.purchase_id = (b.entity_id)::uuid and pi.product_id = p_product)
         order by abs(extract(epoch from (b.created_at - ev.created_at))) limit 1
      ) ped on true
      -- 0242: لحظةُ الإدخال لا يومُ البيع — المؤرَّخةُ يتغيّر رصيدُها حين تُدخل.
      left join lateral (
        select i.id from invoices i
         where i.clinic_id = auth_clinic()
           and abs(extract(epoch from (coalesce(i.recorded_at, i.created_at) - ev.created_at))) < 4
           and exists (select 1 from invoice_items ii where ii.invoice_id = i.id and ii.product_id = p_product)
         order by abs(extract(epoch from (coalesce(i.recorded_at, i.created_at) - ev.created_at))) limit 1
      ) inv on true
  )
  -- **وتُطوى الخطوةُ الوسطى** (عكسُ فاتورةٍ يكتب صفّين بنفس اللحظة).
  select n.created_at,
         min(n.kind),
         (array_agg(n.f order by n.id))[1],
         (array_agg(n.t order by n.id desc))[1],
         (array_agg(n.t order by n.id desc))[1] - coalesce((array_agg(n.f order by n.id))[1], 0),
         n.ref_id,
         coalesce(min(st.name), '')
    from named n
    left join lateral (
      select s.name from staff s where s.user_id = n.actor and s.clinic_id = auth_clinic() limit 1
    ) st on true
   group by n.created_at, n.ref_id
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;
revoke all on function public.product_movements(uuid, int) from public, anon;
grant execute on function public.product_movements(uuid, int) to authenticated;

-- ── ٥) سطرُ التدقيق يحمل الختم: نسخةُ 0226 حرفاً إلا سطرين ──────────────────────
-- المحفّزُ يحفظ لإدراجٍ قائمةَ `keep` وحدها، وrecorded_at خارجها — فكان audit_kind (أدناه) لا يراه
-- أبداً، و«بيعةٌ بيومٍ سابق» تُسمّى «بيع» بسجلّ الحركات (مقيسٌ على نصّ الإنتاج قبل الكتابة).
-- والسطرُ يُختم بلحظة الإدخال، فالمؤرَّخةُ تحمل يومَ بيعها `sold_at` — بلاه يقول السجلُّ «بيعةٌ
-- بيومٍ سابق» ولا يقول أيّ يوم.
create or replace function audit_change() returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_new_raw jsonb; v_old_raw jsonb; v_new jsonb; v_old jsonb; v_src jsonb; v_out jsonb; v_chg jsonb;
  keep constant text[] := array[
    'name','pet_name','pet_id','kind','outcome','status','medication','amount',
    'administered_at','vaccine','doctor_name','doctor','weight_kg','total',
    'customer_name','stock','qty','line_total','title','text','owner_name',
    'reminder_type','label','staff_id',
    -- 0152: ما يسمّي أحداثَ الجداول الجديدة — قليلٌ عمداً: سطرُ التعديل يبقى
    -- أصغرَ من اللقطة بأربع مرّات (فحصُ 0139)، والفرقُ `__changed` يحمل الباقي.
    'test','test_name','reason','category','company_name','courier_name',
    'event','ref','format','role','species',
    -- 0242: ختمُ إدخال الفاتورة المؤرَّخة (لا يوجد بغير الفواتير، وفارغُه يُسقَط).
    'recorded_at'
  ];
begin
  begin
    v_new_raw := case when TG_OP = 'DELETE' then null else to_jsonb(NEW) end;
    v_old_raw := case when TG_OP = 'INSERT' then null else to_jsonb(OLD) end;
    if v_new_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_new from jsonb_each(v_new_raw) as e(key, value);
    end if;
    if v_old_raw is not null then
      select coalesce(jsonb_object_agg(e.key, case when length(e.value::text) > 2048 then to_jsonb('[large:' || length(e.value::text) || ']') else e.value end), '{}'::jsonb)
        into v_old from jsonb_each(v_old_raw) as e(key, value);
    end if;
    v_src := coalesce(v_new, v_old);
    if TG_OP = 'DELETE' then
      v_out := v_old;
    else
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into v_out
        from jsonb_each(v_src) as e(key, value)
       where e.key = any (keep) and e.value <> 'null'::jsonb;
    end if;
    -- 0242: بيعةٌ بيومٍ سابق تحمل يومَها — لحظةُ السطر لحظةُ الإدخال لا البيع.
    if TG_OP = 'INSERT' and TG_TABLE_NAME = 'invoices' and nullif(v_src->>'recorded_at', '') is not null then
      v_out := v_out || jsonb_build_object('sold_at', v_src->'created_at');
    end if;
    if TG_OP = 'UPDATE' then
      select jsonb_object_agg(k, jsonb_build_array(v_old -> k, v_new -> k)) into v_chg
        from jsonb_object_keys(v_new_raw) as k
       where (v_new_raw -> k) is distinct from (v_old_raw -> k);
      if v_chg is not null then v_out := v_out || jsonb_build_object('__changed', v_chg); end if;
      -- 0226: رفعُ الأسعار يكتب سطرَه الواحد بـprice_changes — لا ألفَ «تعديل منتج».
      if v_chg is not null and TG_TABLE_NAME in ('products', 'clinic_services')
         and not exists (select 1 from jsonb_object_keys(v_chg) k where k not in ('sell_price', 'sub_unit_price', 'price'))
         and public._price_change_live() then
        return NEW;
      end if;
    end if;
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (coalesce(nullif(v_src->>'clinic_id','')::uuid, auth_clinic()), auth.uid(), TG_OP, TG_TABLE_NAME, (v_src->>'id'), v_out);
  exception when others then
    null; -- التدقيق لا يجوز أن يمنع العملية الأصلية أبداً
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $function$;
revoke execute on function public.audit_change() from anon, authenticated;

-- ── ٦) التدقيق: نسخةُ 0241 حرفاً إلا فرعَ إدراج الفاتورة (مرآتُه activityKinds.ts) ──────
create or replace function audit_kind(p_entity text, p_action text, p_details jsonb) returns text
language sql immutable set search_path = public as $$
  with c as (
    select coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_details->'__changed','{}'::jsonb)) k
                      where k not in ('updated_at','created_at','id','clinic_id')), '{}'::text[]) as ch
  )
  select case
    when p_entity = 'login' then 'login'
    when p_entity = 'client' then case
      when coalesce(p_details->>'event','') like 'override.%' then 'override'
      when coalesce(p_details->>'event','') like 'report.%' then 'export'
      when coalesce(p_details->>'event','') = 'sale.expired' then 'sale_expired'
      else 'print' end
    when p_entity = 'invoices' then case
      -- 0242: بيعةٌ بيومٍ سابق تُسمّى باسمها — لحظةُ الإدخال بسطر التدقيق، ويومُ البيع بالفاتورة.
      when p_action = 'INSERT' and nullif(p_details->>'recorded_at', '') is not null then 'sale_backdated'
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_entity = 'invoice_forgiveness' then case
      when p_action = 'UPDATE' then 'debt_forgive_void'
      -- الاستهلاكُ أثرُ مرتجعٍ أو تعديلٍ (وقد يكتبه الاستقبال) — ليس خصماً أعطاه أحد.
      when coalesce(p_details->>'kind', '') = 'consumed' then 'sale_edit'
      else 'debt_forgive' end
    when p_action = 'UPDATE' and p_entity in ('products','purchases','purchase_payments','company_sections')
         and cardinality(c.ch) > 0 and c.ch <@ array['company_id','company_name','section_id']::text[] then 'relink'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity = 'price_changes' then 'price_change'
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity in ('expenses','expense_categories') then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles','store_categories','store_category_items') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;

reset lock_timeout;
