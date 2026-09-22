-- ============================================================================
-- ٠٢٠٥ — تعديلُ فاتورةِ شراءٍ لا يخترع بضاعة، والشراءُ يفكّ صفةَ «مجمّع»
--
-- ── ما قاسته الحزمة، وما سبقه من الإنتاج ────────────────────────────────
-- `update_purchase` تهدم أثرَ السطور القديمة ثمّ تبني الجديدة. والهدمُ كان:
--     stock = greatest(0, coalesce(stock,0) - old_qty)
-- والحصرُ بصفرٍ هنا **خطأٌ بمكانه**: هو صحيحٌ عن الرصيد النهائيّ، وكاذبٌ عن
-- خطوةٍ وسطى. فلو بيعَ جزءٌ من الكمية قبل التعديل، الحصرُ يبلع الفرقَ ثمّ
-- تُضاف الكميةُ كاملةً، فيقفز الرصيدُ فوق حقيقته.
--
--   اشترى ٥٠ · باع ٤٥ ⇒ الرصيد ٥
--   عدّل الفاتورة بلا تغييرِ كمية:  greatest(0, 5-50) = 0  ثمّ  0+50 = 50
--   ⇒ الرصيد ٥٠ وهو ٥. **خمسٌ وأربعون قطعةً اخترعها النظام، بصمت.**
--
-- **ووقعت بالإنتاج**: سجلُّ التدقيق، 2026-09-16 09:22:25، «رمل جاك 20 لتر»:
-- `stock [14,0]` ثمّ `[0,15]` — الرصيدُ صار ١٥ وهو ١٤، والمستخدمُ ما غيّر
-- كميةً أصلاً. وبنفس الفاتورة «رمل ميو 5 لتر» [266→26] ثمّ [26→266] سليمةٌ
-- لأن رصيدَها كان أكبرَ من الكمية. **فالعطبُ يظهر حصراً بالموادّ التي بيع
-- أكثرُها** — أي أسرعِ الموادّ حركةً، وأكثرِها فلوساً.
--
-- والتعرّض المقيس: ١٩ فاتورةَ شراءٍ عُدِّلت بـ١٨٠ يوماً.
--
-- ── ولماذا لم تمسكها فحوصُنا ─────────────────────────────────────────────
-- لأن النسخةَ التجريبية تطابقه حرفاً بحرف (`Math.max(0, …)` بـrepo.ts)، وفحوصُ
-- المنطق تجري عليها. **مرآةٌ تعكس العطبَ لا تكشفه** — فالفحصُ الجديد بالحزمة
-- يشغّل الدالّةَ نفسَها على بوستغريس حقيقيّ.
--
-- ── العلاج ──────────────────────────────────────────────────────────────
-- العكسُ **بلا حصر** (يُسمح للرصيد أن ينزل سالباً داخل المعاملة وحدها)، ثمّ
-- الإضافةُ بلا حصر، ثمّ **حصرةٌ واحدة بالنهاية** على ما لمسته الفاتورةُ وحدَه.
-- فالحسابُ يصير `الرصيد + (الجديد − القديم)` وهو المقصود، والحصرُ يبقى حارساً
-- على النتيجة: بضاعةٌ ما وصلت لا تبقى بالرفّ.
-- ولا عمودَ `stock` عليه قيدُ `check` فالسالبُ الوسطيُّ يمرّ (مقيسٌ على الإنتاج).
--
-- ── ومعه: `pooled` يُطفأ كما يطفئه التجريبيّ ─────────────────────────────
-- `repo.ts` يطفئ `existing.pooled = false` عند الترصيد — «كميةٌ استُلمت تجعل
-- المنتجَ معدوداً، فيخرج من حوض قسمه المجهول». والخادمُ **لا يذكر pooled
-- أبداً** (grep على 0166 يرجع صفراً). انحرافٌ صامتٌ بين المرآة وأصلها.
-- المقيس: ٠ من ٢٨٧١ منتجاً `pooled = true` اليوم ⇒ **لا ضررَ واقعاً الآن**،
-- ولذلك تنزل هنا سطراً لا هجرةً وحدَها. لكنها لغمٌ لا يُترك: `freshSale.ts`
-- يعطي المجمَّعَ سقفاً لا نهائياً (`if (p.pooled) return Infinity`) — فمنتجٌ
-- مجمَّعٌ اشترته عيادةٌ يبقى يُباع بلا حدٍّ للأبد.
--
-- ما **لا** تفعله هذه الهجرة: لا تمنع سطرين لنفس المادة بفاتورة (قرارُ المالك
-- بالدفعة السابقة: قد تكونان دفعتين مقصودتين — فتُرى ولا تُرفض)، ولا تلمس
-- المطابقةَ ولا الأسعارَ ولا إنشاءَ المنتجات.
--
-- تراجع: أعِد تنزيل 0166.
-- تُطبَّق بعد 0204. وتُعاد بلا أثرٍ ثانٍ (تعريفُ دالّةٍ وحده).
-- ============================================================================

create or replace function public.update_purchase(p_purchase uuid, p_lines jsonb, p_meta jsonb default '{}'::jsonb)
returns purchases
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_purchase purchases;
  v_company  uuid;
  it         jsonb;
  old_it     record;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
  -- كلُّ منتجٍ لمسته هذه الفاتورة — قديمِها وجديدِها. الحصرةُ النهائية عليه
  -- وحدَه: لا نمرّ على مخزن العيادة كلِّه، ولا نصحّح سالباً صنعه غيرُنا.
  v_touched  uuid[] := '{}';
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  select * into v_purchase from purchases
   where id = p_purchase and clinic_id = v_clinic
   for update;
  if not found then raise exception 'purchase not found'; end if;
  v_company := v_purchase.company_id;

  -- ── ١) اعكس أثر السطور القديمة — **بلا حصر** ──
  -- الحصرُ هنا كان يخترع بضاعةً (انظر الرأس). السالبُ الوسطيُّ مقصود، وتُغلقه
  -- الحصرةُ النهائية بعد بناء السطور الجديدة.
  for old_it in
    select product_id, qty from purchase_items
     where purchase_id = p_purchase and clinic_id = v_clinic and product_id is not null
  loop
    update products
       set stock = coalesce(stock, 0) - coalesce(old_it.qty, 0)
     where id = old_it.product_id and clinic_id = v_clinic;
    v_touched := v_touched || old_it.product_id;
  end loop;
  delete from purchase_items where purchase_id = p_purchase and clinic_id = v_clinic;

  -- ── ٢) نزّل السطور الجديدة — نفس مطابقة record_purchase حرفياً ──
  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;

    -- الأساسيُّ أو أحدُ الإضافية، والأساسيُّ يغلب (0166) — كما بـrecord_purchase.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic
         and ( (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
               or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                           where inv_norm_code(a) = v_code) )
       order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '') desc,
                (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    if v_pid is not null then
      update products set
        stock          = coalesce(stock, 0) + v_qty,   -- بلا حصر؛ الحصرةُ بالنهاية
        -- كميةٌ استُلمت تجعل المنتجَ معدوداً، فيخرج من حوض قسمه المجهول —
        -- كما يفعل التجريبيُّ منذ البداية. والحوضُ نفسُه لا يُمَسّ.
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic;
      if not found then v_pid := null; else v_touched := v_touched || v_pid; end if;
    end if;

    if v_pid is null then
      v_sec := nullif(it->>'section_id','')::uuid;
      if v_sec is not null then
        select id into v_sec from company_sections
         where id = v_sec and clinic_id = v_clinic
           and (v_company is null or company_id = v_company)
         limit 1;
      end if;

      insert into products (clinic_id, company_id, section_id, barcode, name, category,
                            purchase_price, sell_price, stock, min_stock, expiry_date)
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
      returning id into v_pid;
      v_touched := v_touched || v_pid;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (p_purchase, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);
  end loop;

  -- ── ٢·٥) الحصرةُ الوحيدة: على ما لمسته الفاتورةُ وحدَه ──
  -- بضاعةٌ سُحبت من الفاتورة ولم تعد تغطّي ما بيع ⇒ الرصيدُ صفرٌ لا سالب.
  update products set stock = 0
   where clinic_id = v_clinic and id = any (v_touched) and coalesce(stock, 0) < 0;

  -- ── ٣) رأس الفاتورة: إجمالي جديد، والمدفوع الحقيقي يبقى مقصوصاً عليه ──
  v_total := round(v_total, 2);
  v_paid  := least(coalesce(nullif(p_meta->>'amount_paid','')::numeric,
                            coalesce(v_purchase.amount_paid, v_purchase.total)),
                   v_total);
  v_paid  := greatest(v_paid, 0);

  update purchases set
    total          = v_total,
    item_count     = round(v_count)::int,
    amount_paid    = v_paid,
    status         = case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end,
    reference      = coalesce(nullif(p_meta->>'reference',''), reference),
    payment_method = coalesce(nullif(p_meta->>'payment_method',''), payment_method),
    supplier_name  = case when p_meta ? 'supplier_name'  then nullif(p_meta->>'supplier_name','')  else supplier_name  end,
    supplier_phone = case when p_meta ? 'supplier_phone' then nullif(p_meta->>'supplier_phone','') else supplier_phone end,
    notes          = case when p_meta ? 'notes'          then nullif(p_meta->>'notes','')          else notes          end,
    purchased_at   = coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, purchased_at)
  where id = p_purchase and clinic_id = v_clinic
  returning * into v_purchase;

  return v_purchase;
end $function$;

comment on function public.update_purchase(uuid, jsonb, jsonb) is
  'تعديلُ فاتورةِ شراء: يعكس السطورَ القديمة **بلا حصرٍ بصفر** ثمّ يبني الجديدة ثمّ يحصر السالبَ مرّةً واحدة على ما لمسه (0205) — الحصرُ الوسطيُّ كان يخترع رصيداً بالموادّ التي بيع أكثرُها. ويفكّ `pooled` كما يفعل التجريبيّ.';


-- ── ومثلُها `record_purchase`: `pooled` وحدَه ────────────────────────────
-- لا تُلمس هنا حسابيةُ الرصيد: الشراءُ الجديد `stock + qty` بكميةٍ غيرِ سالبة،
-- فالحصرُ بصفرٍ فيه لا أثرَ له. المضافُ سطرٌ واحد — وإعادةُ التعريف كاملةً
-- لأن بوستغريس لا يعدّل دالّةً جزئياً. والنصُّ بقيّتُه من 0166 حرفاً بحرف.
create or replace function public.record_purchase(p_lines jsonb, p_meta jsonb DEFAULT '{}'::jsonb)
 returns purchases
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_clinic   uuid := auth_clinic();
  v_role     text := auth_role();
  v_company  uuid := nullif(p_meta->>'company_id','')::uuid;
  v_purchase purchases;
  it         jsonb;
  v_qty      numeric(14,3);
  v_cost     numeric(12,2);
  v_sell     numeric(12,2);
  v_total    numeric(14,2) := 0;
  v_count    numeric(14,3) := 0;
  v_paid     numeric(14,2);
  v_status   text;
  v_pid      uuid;
  v_sec      uuid;
  v_code     text;
  v_name     text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then raise exception 'empty purchase'; end if;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_total := v_total + v_qty * v_cost;
    v_count := v_count + v_qty;
  end loop;

  v_paid   := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);
  v_status := case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end;

  insert into purchases (clinic_id, company_id, company_name, reference, total, item_count,
                         amount_paid, payment_method, status, supplier_name, supplier_phone,
                         notes, purchased_at, staff_id)
  values (v_clinic, v_company, nullif(p_meta->>'company_name',''), nullif(p_meta->>'reference',''),
          round(v_total, 2), round(v_count)::int, v_paid, nullif(p_meta->>'payment_method',''), v_status,
          nullif(p_meta->>'supplier_name',''), nullif(p_meta->>'supplier_phone',''),
          nullif(p_meta->>'notes',''), coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, now()),
          nullif(p_meta->>'staff_id','')::uuid)
  returning * into v_purchase;

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');

    -- المطابقة بالباركود **الموحَّد**: ٥٣٩١ و5391 قطعةٌ واحدة. والرموزُ
    -- الإضافية تُقرأ معه (0166) — المنتجُ له رمزٌ واحد بالنظام وعدّةُ رموزٍ
    -- بالواقع. وعند التعدد يغلب **الأساسيّ** ثم قطعةُ الشركة نفسها ثم
    -- المصنَّفة ثم الأقدم.
    if v_pid is null and v_code <> '' then
      select id into v_pid from products
       where clinic_id = v_clinic
         and ( (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
               or exists (select 1 from unnest(coalesce(alt_codes, '{}')) a
                           where inv_norm_code(a) = v_code) )
       order by (inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '') desc,
                (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    -- مطابقةُ الاسم احتياطاً: القطعة المسجّلة بلا باركود تُشترى باسمها فتُرصَّد
    -- بمكانها **وتتعلّم** الباركود الممسوح — بدل توأمٍ أعمى بـ«بدون صنف».
    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
    end if;

    if v_pid is not null then
      update products set
        stock          = greatest(0, coalesce(stock, 0) + v_qty),
        -- كميةٌ استُلمت تجعل المنتجَ معدوداً فيخرج من حوض قسمه المجهول —
        -- كما يفعل التجريبيُّ (`repo.ts`) منذ البداية. الحوضُ نفسُه لا يُمَسّ.
        pooled         = false,
        purchase_price = case when v_cost > 0 then v_cost else purchase_price end,
        sell_price     = case when v_sell > 0 then v_sell else sell_price end,
        min_stock      = coalesce(nullif(it->>'min_stock','')::int, min_stock),
        expiry_date    = coalesce(nullif(it->>'expiry_date','')::date, expiry_date),
        category       = coalesce(nullif(it->>'category',''), category),
        company_id     = coalesce(company_id, v_company),
        -- تعلُّم الباركود: القطعة بلا باركودٍ تكسبه من أول مسحة — ولا يُستبدل
        -- باركودٌ قائم أبداً.
        barcode        = coalesce(nullif(barcode,''), nullif(it->>'barcode',''))
      where id = v_pid and clinic_id = v_clinic;
      if not found then v_pid := null; end if;
    end if;

    if v_pid is null then
      -- الصنف المختار للقطعة الجديدة — يُقبل فقط إن كان صنفاً حقيقياً بهذه
      -- العيادة ولهذه الشركة، وإلا سقط بصمتٍ إلى «بدون صنف».
      v_sec := nullif(it->>'section_id','')::uuid;
      if v_sec is not null then
        select id into v_sec from company_sections
         where id = v_sec and clinic_id = v_clinic
           and (v_company is null or company_id = v_company)
         limit 1;
      end if;

      insert into products (clinic_id, company_id, section_id, barcode, name, category,
                            purchase_price, sell_price, stock, min_stock, expiry_date)
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
      returning id into v_pid;
    end if;

    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price)
    values (v_purchase.id, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell);
  end loop;

  return v_purchase;
end $function$;

comment on function public.record_purchase(jsonb, jsonb) is
  'تسجيلُ فاتورةِ شراء (0166)، وأضافت 0205 `pooled = false` عند الترصيد — انحرافٌ كان بين الخادم ومرآته التجريبية.';
