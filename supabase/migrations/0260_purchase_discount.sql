-- ============================================================================
-- ٠٢٦٠ — خصمُ الشركة على فاتورة الشراء
--
-- طلبُ المالك (٤/١١): «مكانٌ للخصم في حال لو الشركة سوّتلنا خصم». الخصمُ على رأس الفاتورة (مبلغاً — والشاشةُ تحوّل النسبةَ
-- إليه بـresolveDiscount نفسِها التي بشاشة البيع)، ويصير بثلاثة مواضع كلٌّ بمعناه:
--   • **ما يُدفع وما يُدان** (`purchases.total`) صافٍ بعد الخصم: دفترُ الشركة (0224) وقائمةُ الشركات وتسديدُ الدَّين و`amount_paid`
--     وحالةُ الفاتورة تقرأ `total` كما كانت — فتقول رقمَ الشركة حرفاً بلا سطرٍ واحدٍ فيها. والمجموعُ قبل الخصم = total + discount.
--   • **كلفةُ البضاعة**: كلُّ سطرٍ يحمل نصيبَه من الخصم بنسبة قيمته — `_purchase_unit_cost(c, صافي، مجموع)` = c × صافي ÷ مجموع
--     بستّ منازل (القسمةُ الواحدة _cons_round_div) — فيدخل المتوسّطُ المتحرّك (0255) بما كلّفت الوحدةُ فعلاً، والربحُ يقول الحقيقة.
--     بلا هذا كانت الكلفةُ تُكتب أعلى من المدفوع والربحُ أقلَّ منه بالخصم كلِّه، على كلّ بيعةٍ من الوجبة.
--   • **ورقةُ الشركة**: `purchase_items.purchase_price` و«آخرُ سعر شراء» على المادة تبقى السعرَ المكتوبَ بالفاتورة (كما بورقتها) —
--     مساعدُ تسعير لا دفتر (0255)، والطباعةُ والتفاصيلُ تقول «المجموع الفرعي · الخصم · الصافي».
--
-- ── التعديلُ يعكس ما أدخلته الفاتورةُ بالضبط ──────────────────────────────────
-- `update_purchase` يعيد تقييمَ المتوسّط من قيمتي السطور القديمة والجديدة (0255). فالقديمةُ بنسبة الفاتورة **كما حُفظت**
-- (total صافٍ، والمجموعُ قبله total + discount — العددان اللذان قسم بهما الاستلامُ يومَها)، والجديدةُ بنسبتها الجديدة.
-- ومجموعُ السطور الجديدة يُحسب قبل الحلقة بتقريبها نفسِه (numeric(14,2) سطراً سطراً) — النسبةُ تلزم كلَّ سطرٍ داخلها.
-- وجهازٌ ما تحدّث (بلا مفتاح `discount`) يُبقي خصمَ الفاتورة كما حُفظ، مقصوصاً على مجموعها الجديد — «غيابُ المفتاح جهازٌ قديم»
-- (0252)، لا «صفر»: الشاشةُ القديمة لا ترى الخصمَ فلا تقصد محوه.
--
-- ── الحدود ──────────────────────────────────────────────────────────────────
-- سالبٌ أو غائبٌ صفر، وأكبرُ من المجموع يُقصّ عليه (فاتورةٌ صافيها صفر: كلفتُها صفرٌ فـ«المجّانيُّ لا يخفّض المتوسّط» كما قرّرته 0255).
-- وسطرٌ بلا سعر (صفر) يبقى بلا سعر — لا نصيبَ له من خصمٍ ولا من مجموع. والحقلُ (الدواجن) خارج المتوسّط كما كان.
-- والبيعُ والمرتجعُ والجردُ لا تُمسّ: تقرأ الكلفةَ من مصدرها الواحد (stock_unit_cost ← avg_cost).
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- record_purchase وupdate_purchase نصُّ 0255 حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0260` (والمستبدَلُ بـ`-- -0260 <الأصل>`)، وحارسُ
-- الانجراف على بصمة شِفرة 0255 لكلٍّ منهما (`_drift_assert`، 0252) — والحرّاسُ قبل أوّل تعريف، فالرفضُ لا يترك نصفَ هجرة ما دامت
-- تُطبَّق طلباً واحداً (SQL Editor). والعلاماتُ القديمة (`-- +0253`، `-- +0255`) باقيةٌ بالنصّ فـverify_consumption_wiring كما هي.
--
-- تُطبَّق بعد 0255 **وقبل الواجهة** (الواجهةُ تسأل عن العمود قبل أن تعرض الخصم). إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع:
--   أعد **تعريفَ الدالّتين وحده** حرفاً من 0255 (لا الملفَّ كلَّه) والصلاحياتُ كما هنا؛ والعمودُ يبقى (لا يقرؤه شيءٌ قديم) —
--   وفاتورةٌ فيها خصمٌ قبل التراجع يبقى صافيها total كما هو.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه من 0252/0255، ثمّ الحارسُ لكلّ دالّةٍ تُعاد — قبل أيّ تعريف ─────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public._avg_receive(numeric,numeric,numeric,numeric)') is null then
    raise exception 'needs_0255' using hint = 'طبّق 0252–0255 قبل هالهجرة — حارسُ الانحراف والمتوسّطُ المتحرّك منها';
  end if;
end $$;
select public._drift_assert('public.record_purchase(jsonb,jsonb)', '0035f4b19199f70f96de359b9529de17', '-- +0260');
select public._drift_assert('public.update_purchase(uuid,jsonb,jsonb)', '640de1f39ec9bd7df08b7aad2d0150a2', '-- +0260');
select public._drift_assert('public.verify_consumption_wiring()', '95723cf0f565455ce9515ca61c037333', '-- +0260');

-- ── ١) العمود ───────────────────────────────────────────────────────────────
alter table public.purchases add column if not exists discount numeric not null default 0;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'purchases_discount_ok' and conrelid = 'public.purchases'::regclass) then
    alter table public.purchases add constraint purchases_discount_ok check (discount >= 0);
  end if;
end $$;
comment on column public.purchases.discount is
  'خصمُ الشركة على الفاتورة (0260) مبلغاً. total صافٍ بعده (ما يُدفع ويُدان)، والمجموعُ قبله total + discount، وكلُّ سطرٍ يحمل نصيبَه بنسبة قيمته إلى كلفة المتوسّط (_purchase_unit_cost).';

-- ── ٢) نصيبُ السطر من الخصم — نقيّةٌ بستّ منازل، ومرآتُها purchaseUnitCostU (src/lib/avgCost.ts) فلساً بفلس (cost-parity) ──
-- c كلفةُ الوحدة كما كُتبت، net الصافي، gross المجموعُ قبل الخصم. بلا خصمٍ (net ≥ gross، أو gross ≤ 0، أو net غائب) أو بلا سعر
-- (c ≤ 0) ⇒ c كما هي؛ وإلا c × max(net, 0) ÷ gross.
create or replace function public._purchase_unit_cost(c numeric, net numeric, gross numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(c, 0) > 0 and coalesce(gross, 0) > 0 and coalesce(net, gross) < gross
              then public._cons_round_div(c * greatest(net, 0), gross, 6)
              else c end
$$;
revoke all on function public._purchase_unit_cost(numeric, numeric, numeric) from public, anon, authenticated;

-- ── ٣) إعادةُ الكتابة — نصُّ 0255 حرفاً وفوقه أسطرٌ معلَّمة (redefine-fingerprint) ─────────────

-- ── ٣أ) الاستلام — نصُّ 0255 حرفاً، والخصمُ من رأس الفاتورة ونصيبُ كلّ سطرٍ منه بكلفته ─────────────────
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
  -- 0211: الكشف — كيف لُقيت المادة، وكيف كانت، وكيف صارت.
  v_line     int := 0;
  v_how      text;
  v_before   products;
  v_after    products;
  v_bj       jsonb;
  -- 0255: فرقُ الكلفة حين يستلم السطرُ على رصيدٍ سالبٍ بمتوسّطٍ معروف (purchase_effects.cost_variance).   -- +0255
  v_var      numeric;                                                                 -- +0255
  -- 0260: المجموعُ قبل الخصم، والخصمُ مقصوصاً عليه، وكلفةُ الوحدة للمتوسّط بعد نصيبها منه.   -- +0260
  v_gross    numeric(14,2);   -- +0260
  v_disc     numeric(14,2) := 0;   -- +0260
  v_ucost    numeric;   -- +0260
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
  -- 0260: الخصمُ من رأس الفاتورة: ما يُدفع وما يُدان (total) صافٍ، والمجموعُ قبله يُحفظ بفرقهما (discount). سالبٌ أو غائبٌ صفر،   -- +0260
  -- وأكبرُ من المجموع يُقصّ عليه، ومجموعٌ ≤ صفر (سطرٌ بسعرٍ سالب — كان يُقبل) بلا خصم: القصُّ عليه كان يكتب خصماً سالباً   -- +0260
  -- فيرفضه القيدُ ويسقط شراءٌ كان يمرّ. والمدفوعُ والحالةُ أدناه على الصافي كما كانا على المجموع.   -- +0260
  v_gross := v_total;   -- +0260
  v_disc  := case when v_gross > 0 then least(greatest(coalesce(nullif(p_meta->>'discount','')::numeric, 0), 0), v_gross) else 0 end;   -- +0260
  v_total := v_gross - v_disc;   -- +0260

  v_paid   := least(greatest(coalesce(nullif(p_meta->>'amount_paid','')::numeric, v_total), 0), v_total);
  v_status := case when v_paid >= v_total then 'paid' when v_paid <= 0 then 'unpaid' else 'partial' end;

  insert into purchases (clinic_id, company_id, company_name, reference, total, item_count,
                         amount_paid, payment_method, status, supplier_name, supplier_phone,
-- -0260                          notes, purchased_at, staff_id)
                         notes, purchased_at, staff_id, discount)   -- +0260
  values (v_clinic, v_company, nullif(p_meta->>'company_name',''), nullif(p_meta->>'reference',''),
          round(v_total, 2), round(v_count)::int, v_paid, nullif(p_meta->>'payment_method',''), v_status,
          nullif(p_meta->>'supplier_name',''), nullif(p_meta->>'supplier_phone',''),
          nullif(p_meta->>'notes',''), coalesce(nullif(p_meta->>'purchased_at','')::timestamptz, now()),
-- -0260           nullif(p_meta->>'staff_id','')::uuid)
          nullif(p_meta->>'staff_id','')::uuid, v_disc)   -- +0260
  returning * into v_purchase;

  -- 0255: موادُّ السطور كلُّها تُقفل مرّةً بالمعرّف قبل أوّل سطر — ترتيبُ البيعة والسند والجرد نفسُه، فشراءٌ [ب، أ]   -- +0255
  -- وبيعةٌ أو جردٌ [أ، ب] لا ينسدّان (كان السطرُ يقفل مادّتَه بترتيب الفاتورة). ما يحمل معرّفَه بمعرّفه، وما يُطابَق   -- +0255
  -- بالباركود أو بالاسم بالمطابقة نفسِها التي تجريها الحلقة (الباركودُ الموحَّد والرموزُ الإضافية، ثمّ الاسم) — كان يُقفل   -- +0255
  -- بسطره، فشراءٌ [باركود ب، معرّف أ] وبيعةٌ [أ، ب] ينسدّان (40P01). والحلقةُ تطابق ثانيةً كما كانت (السلوكُ نفسُه):   -- +0255
  -- مادّةٌ يولدها سطرٌ سابق، أو تُدرج بين الجملتين، تُقفل بسطرها كما كانت — ولا قفلَ يضيع.   -- +0255
  perform 1 from products                                                             -- +0255
   where clinic_id = v_clinic                                                         -- +0255
     and id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x   -- +0255
                 where x->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'   -- +0255
                union                                                                 -- +0255
                select coalesce(                                                      -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and inv_norm_code(x->>'barcode') <> ''   -- +0255
                             and ((inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '')   -- +0255
                                  or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a   -- +0255
                                              where inv_norm_code(a) = inv_norm_code(x->>'barcode')))   -- +0255
                           order by (inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '') desc,   -- +0255
                                    (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1),                                                  -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and length(inv_norm_name(x->>'name')) >= 2   -- +0255
                             and inv_norm_name(x->>'name') <> 'item' and inv_norm_name(p.name) = inv_norm_name(x->>'name')   -- +0255
                           order by (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1))                                                  -- +0255
                  from jsonb_array_elements(p_lines) x                                -- +0255
                 where nullif(x->>'product_id','') is null)                           -- +0255
   order by id for update;                                                            -- +0255

  for it in select * from jsonb_array_elements(p_lines) loop
    v_qty  := coalesce(nullif(it->>'qty','')::numeric, 0);
    v_cost := coalesce(nullif(it->>'purchase_price','')::numeric, 0);
    -- 0260: كلفةُ الوحدة للمتوسّط بعد نصيبها من الخصم (v_total هنا صافٍ)؛ والمكتوبُ (v_cost) يبقى للسطر ولآخر سعر شراء.   -- +0260
    v_ucost := public._purchase_unit_cost(v_cost, v_total, v_gross);   -- +0260
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;
    v_var  := null;                                                                   -- +0255

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
      if v_pid is not null then
        v_how := case when exists (select 1 from products where id = v_pid and clinic_id = v_clinic
                                     and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
                      then 'barcode' else 'alt_code' end;
      end if;
    end if;

    -- مطابقةُ الاسم احتياطاً: القطعة المسجّلة بلا باركود تُشترى باسمها فتُرصَّد
    -- بمكانها **وتتعلّم** الباركود الممسوح — بدل توأمٍ أعمى بـ«بدون صنف».
    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then v_how := 'name'; end if;
    end if;

    if v_pid is not null then
      -- 0255: المادّةُ مقفولةٌ قبل صورتها — فالفرقُ والمتوسّطُ يُحسبان من الصفّ نفسِه الذي يحدّثه الـSET.   -- +0255
      perform 1 from products where id = v_pid and clinic_id = v_clinic for update;   -- +0255
      select * into v_before from products where id = v_pid and clinic_id = v_clinic;
      if found then v_bj := purchase_effect_snap(v_before); end if;
      if v_before.id is not null and v_before.farm_id is null then                    -- +0255
        v_var := public._avg_variance(coalesce(v_before.stock, 0),                    -- +0255
-- -0260                    public._avg_base(v_before.avg_cost, v_before.purchase_price), v_qty, v_cost);   -- +0255
                   public._avg_base(v_before.avg_cost, v_before.purchase_price), v_qty, v_ucost);   -- +0260
      end if;                                                                         -- +0255
      update products set
-- -0253         stock          = greatest(0, coalesce(stock, 0) + v_qty),
        -- 0253: عجزٌ أكبرُ من الشراء يبقى ظاهراً (−٠٫٠٤ + ٠٫٠٢ = −٠٫٠٢ لا صفر)، والموجبُ كما كان. -- +0253
        stock          = greatest(least(coalesce(stock, 0), 0), coalesce(stock, 0) + v_qty), -- +0253
        -- 0255: المتوسّطُ المتحرّك (مخزنُ الحقل خارجه) — والـSET يرى الصفَّ القديم: رصيدَه وأساسَ كلفته   -- +0255
        -- (_avg_base: متوسّطُه، وإلا سعرُ شرائه، والصفرُ مجهول) قبل هذا الاستلام.    -- +0255
        -- والمجهولُ (null) لا يُكتب فوق المخزَّن: سطرٌ مجّانيٌّ أو بلا كمية يرجع الأساسَ، والأساسُ لمتوسّطٍ صفرٍ صريح (تصحيحُ   -- +0255
        -- المدير) مجهول — فكان ٥ مجّاناً تمحو الصفرَ وتعيد الكلفةَ لسعر الشراء. القاعدةُ للمدفوع كما هي (صفرٌ ثمّ ٥ بـ٨٠٠ ⇒ ٨٠٠).   -- +0255
        avg_cost       = (case when farm_id is null                                   -- +0255
-- -0260                                then coalesce(public._avg_receive(coalesce(stock, 0), public._avg_base(avg_cost, purchase_price), v_qty, v_cost),   -- +0255
                               then coalesce(public._avg_receive(coalesce(stock, 0), public._avg_base(avg_cost, purchase_price), v_qty, v_ucost),   -- +0260
                                             avg_cost)                                -- +0255
                               else avg_cost end),                                    -- +0255
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
      where id = v_pid and clinic_id = v_clinic
      returning * into v_after;
      if not found then v_pid := null; v_how := null; v_bj := null; end if;
      if v_pid is null then v_var := null; end if;                                    -- +0255
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
-- -0255                             purchase_price, sell_price, stock, min_stock, expiry_date)
                            purchase_price, sell_price, stock, min_stock, expiry_date, avg_cost)   -- +0255
      values (v_clinic, v_company, v_sec, nullif(it->>'barcode',''), coalesce(nullif(it->>'name',''), 'Item'),
              nullif(it->>'category',''), v_cost, v_sell, greatest(0, v_qty),
-- -0255               coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date)
              coalesce(nullif(it->>'min_stock','')::int, 0), nullif(it->>'expiry_date','')::date,   -- +0255
              -- 0255: المادّةُ الجديدة تبدأ بكلفة سطرها (وبلا كلفةٍ: مجهولة — تتبع سعرَ الشراء)   -- +0255
-- -0260               (case when v_cost > 0 then v_cost end))                                 -- +0255
              (case when v_ucost > 0 then v_ucost end))   -- +0260
      returning * into v_after;
      v_pid := v_after.id;
    end if;

    -- 0214: تاريخُ هذه الوجبة مع سطرها — للأبد، مهما تبدّل تاريخُ المنتج بعدها.
    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price, expiry_date)
    values (v_purchase.id, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell, coalesce(nullif(it->>'expiry_date','')::date, nullif(it->>'batch_expiry','')::date));

    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
-- -0255                                   outcome, matched_by, qty, before, after, changed)
                                  outcome, matched_by, qty, before, after, changed, cost_variance)   -- +0255
    values (v_clinic, v_purchase.id, 'record', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
-- -0255             v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)), v_var);   -- +0255
  end loop;

  return v_purchase;
end $function$;
revoke all on function public.record_purchase(jsonb, jsonb) from public, anon;
grant execute on function public.record_purchase(jsonb, jsonb) to authenticated;

-- ── ٣ب) التعديل — نصُّ 0255 حرفاً، والقديمُ بنسبة خصمه كما حُفظ والجديدُ بنسبته ─────────────────────────
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
  -- 0211: الكشف. `v_orig` صورةُ كلِّ منتجٍ **قبل التعديل** (قبل عكس السطور القديمة)
  -- فيقول الكشفُ «كان ٥ صار ٥» لا «كان −٤٥ صار ٥». و`v_oldq` كمياتُ السطور القديمة،
  -- و`v_seen` ما رجع بالسطور الجديدة — والباقي من `v_orig` مادّةٌ **شيلت** من الفاتورة.
  v_line     int := 0;
  v_how      text;
  v_before   products;
  v_after    products;
  v_bj       jsonb;
  v_orig     jsonb := '{}';
  v_oldq     jsonb := '{}';
  v_seen     uuid[] := '{}';
  v_k        text;
  -- 0255: متوسّطُ كلّ مادّةٍ لمستها الفاتورة: لقطتُها عند أوّل لمس (s0 الرصيد، a0 أساسُ الكلفة)، وقيمتا   -- +0255
  -- سطورها القديمة والجديدة (vo، vn؛ الصفريُّ بـa0)، وآخرُ كلفةٍ موجبة (cl) — يُحسب مرّةً بعد الحلقة.   -- +0255
  v_avg      jsonb := '{}';                                                           -- +0255
  v_ap       products;                                                                -- +0255
  v_a0       numeric;                                                                 -- +0255
  v_ak       text;                                                                    -- +0255
  v_made     boolean;                                                                 -- +0255
  v_was      numeric;                                                                 -- +0255
  v_now      numeric;                                                                 -- +0255
  -- 0260: المجموعُ الجديد قبل الخصم (v_gross)، والخصم (v_disc)، وكلفةُ الوحدة للمتوسّط بعد نصيبها (v_ucost)، وسطرُ الجمع المسبق.   -- +0260
  v_gross    numeric(14,2) := 0;   -- +0260
  v_disc     numeric(14,2) := 0;   -- +0260
  v_ucost    numeric;   -- +0260
  v_q2       numeric(14,3);   -- +0260
  v_c2       numeric(12,2);   -- +0260
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
  -- 0260: المجموعُ الجديد قبل الخصم — قبل الحلقة وبتقريبها نفسِه (numeric(14,3) × numeric(12,2) يُجمع بمنزلتين سطراً سطراً)، لأن   -- +0260
  -- نسبةَ الخصم تلزم كلَّ سطرٍ داخلها. ومفتاحٌ غائب (جهازٌ ما تحدّث) يُبقي خصمَ الفاتورة كما حُفظ، مقصوصاً على مجموعها الجديد.   -- +0260
  for it in select * from jsonb_array_elements(p_lines) loop   -- +0260
    v_q2 := coalesce(nullif(it->>'qty','')::numeric, 0);   -- +0260
    v_c2 := coalesce(nullif(it->>'purchase_price','')::numeric, 0);   -- +0260
    v_gross := v_gross + v_q2 * v_c2;   -- +0260
  end loop;   -- +0260
  v_disc := case when v_gross > 0   -- +0260
                 then least(greatest(case when p_meta ? 'discount' then coalesce(nullif(p_meta->>'discount','')::numeric, 0)   -- +0260
                                          else coalesce(v_purchase.discount, 0) end, 0), v_gross)   -- +0260
                 else 0 end;   -- +0260
  -- 0255: موادُّ الفاتورة — سطورُها القديمة والجديدةُ كلُّها — تُقفل مرّةً بالمعرّف قبل أوّل عكس (ترتيبُ البيعة والسند   -- +0255
  -- والجرد نفسُه؛ كان العكسُ ثمّ السطرُ الجديد يقفلان بترتيب الفاتورة): ما يحمل معرّفَه بمعرّفه، وما يُطابَق بالباركود   -- +0255
  -- أو بالاسم بمطابقة الحلقة نفسِها (كانت تُقفل بسطرها: [باركود ب، معرّف أ] مع بيعة [أ، ب] انسداد). والحلقةُ تطابق ثانيةً   -- +0255
  -- كما كانت؛ ومادّةٌ يولدها سطرٌ سابق أو تُدرج بين الجملتين تُقفل بسطرها كما كانت.   -- +0255
  perform 1 from products                                                             -- +0255
   where clinic_id = v_clinic                                                         -- +0255
     and id in (select pi.product_id from purchase_items pi                           -- +0255
                 where pi.purchase_id = p_purchase and pi.clinic_id = v_clinic and pi.product_id is not null   -- +0255
                union                                                                 -- +0255
                select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x   -- +0255
                 where x->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'   -- +0255
                union                                                                 -- +0255
                select coalesce(                                                      -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and inv_norm_code(x->>'barcode') <> ''   -- +0255
                             and ((inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '')   -- +0255
                                  or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a   -- +0255
                                              where inv_norm_code(a) = inv_norm_code(x->>'barcode')))   -- +0255
                           order by (inv_norm_code(p.barcode) = inv_norm_code(x->>'barcode') and coalesce(p.barcode,'') <> '') desc,   -- +0255
                                    (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1),                                                  -- +0255
                         (select p.id from products p                                 -- +0255
                           where p.clinic_id = v_clinic and length(inv_norm_name(x->>'name')) >= 2   -- +0255
                             and inv_norm_name(x->>'name') <> 'item' and inv_norm_name(p.name) = inv_norm_name(x->>'name')   -- +0255
                           order by (p.company_id = v_company) desc nulls last, (p.section_id is not null) desc, p.created_at   -- +0255
                           limit 1))                                                  -- +0255
                  from jsonb_array_elements(p_lines) x                                -- +0255
                 where nullif(x->>'product_id','') is null)                           -- +0255
   order by id for update;                                                            -- +0255

  -- ── ١) اعكس أثر السطور القديمة — **بلا حصر** ──
  -- الحصرُ هنا كان يخترع بضاعةً (انظر الرأس). السالبُ الوسطيُّ مقصود، وتُغلقه
  -- الحصرةُ النهائية بعد بناء السطور الجديدة.
  -- 0253: ولا حصرةَ نهائية بعد اليوم (انظر ٢·٥) — الرصيدُ النهائيُّ يبقى كما هو ولو سالباً. -- +0253
  for old_it in
    select product_id, qty from purchase_items
     where purchase_id = p_purchase and clinic_id = v_clinic and product_id is not null
  loop
    -- 0255: أوّلُ لمسٍ للمادّة: تُقفل قبل صورتها (العكسُ تحتها يقفلها أصلاً — لا ترتيبَ جديد)، وتُحفظ   -- +0255
    -- s0 وa0 وقيمةُ سطورها القديمة كلِّها بكلفة كلٍّ منها (والصفريُّ بـa0). الحقلُ والغائبةُ: تُتخطّى.   -- +0255
    if not (v_avg ? old_it.product_id::text) then                                     -- +0255
      select * into v_ap from products where id = old_it.product_id and clinic_id = v_clinic for update;   -- +0255
      if v_ap.id is not null and v_ap.farm_id is null then                            -- +0255
        v_a0 := public._avg_base(v_ap.avg_cost, v_ap.purchase_price);                 -- +0255
        v_avg := v_avg || jsonb_build_object(old_it.product_id::text, jsonb_build_object(   -- +0255
                   's0', coalesce(v_ap.stock, 0), 'a0', v_a0, 'vn', 0, 'cl', null,    -- +0255
-- -0260                    'vo', (select coalesce(sum(coalesce(pi.qty, 0) * (case when pi.purchase_price > 0 then pi.purchase_price else v_a0 end)), 0)   -- +0255
                   -- 0260: السطورُ القديمة بكلفة استلامها: نصيبُها من خصم الفاتورة كما حُفظ (total صافٍ، والمجموعُ total + discount)،   -- +0260
                   -- والصفرُ (سطرٌ مجّانيّ، أو خصمٌ أكل السطرَ كلَّه) بالأساس كما استلمه _avg_receive — فالعكسُ ما أدخله الاستلامُ بالضبط.   -- +0260
                   'vo', (select coalesce(sum(coalesce(pi.qty, 0) * (case when u.c > 0 then u.c else v_a0 end)), 0)   -- +0260
-- -0260                             from purchase_items pi                                    -- +0255
                            from purchase_items pi   -- +0260
                            cross join lateral (select public._purchase_unit_cost(pi.purchase_price, v_purchase.total,   -- +0260
                                                       v_purchase.total + coalesce(v_purchase.discount, 0)) as c) u   -- +0260
                           where pi.purchase_id = p_purchase and pi.clinic_id = v_clinic and pi.product_id = old_it.product_id)));   -- +0255
      else                                                                            -- +0255
        v_avg := v_avg || jsonb_build_object(old_it.product_id::text, jsonb_build_object('skip', true));   -- +0255
      end if;                                                                         -- +0255
    end if;                                                                           -- +0255
    if not (v_orig ? old_it.product_id::text) then
      select * into v_before from products where id = old_it.product_id and clinic_id = v_clinic;
      if found then v_orig := v_orig || jsonb_build_object(old_it.product_id::text, purchase_effect_snap(v_before)); end if;
    end if;
    v_oldq := v_oldq || jsonb_build_object(old_it.product_id::text,
                coalesce((v_oldq->>old_it.product_id::text)::numeric, 0) + coalesce(old_it.qty, 0));
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
    v_ucost := public._purchase_unit_cost(v_cost, v_gross - v_disc, v_gross);   -- 0260: نصيبُ السطر من الخصم الجديد   -- +0260
    v_sell := coalesce(nullif(it->>'sell_price','')::numeric, 0);
    v_pid  := nullif(it->>'product_id','')::uuid;
    v_code := inv_norm_code(it->>'barcode');
    v_name := inv_norm_name(it->>'name');
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;
    v_made  := false;                                                                 -- +0255
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
      if v_pid is not null then
        v_how := case when exists (select 1 from products where id = v_pid and clinic_id = v_clinic
                                     and inv_norm_code(barcode) = v_code and coalesce(barcode,'') <> '')
                      then 'barcode' else 'alt_code' end;
      end if;
    end if;

    if v_pid is null and length(v_name) >= 2 and v_name <> 'item' then
      select id into v_pid from products
       where clinic_id = v_clinic and inv_norm_name(name) = v_name
       order by (company_id = v_company) desc nulls last,
                (section_id is not null) desc, created_at
       limit 1;
      if v_pid is not null then v_how := 'name'; end if;
    end if;

    if v_pid is not null then
      -- 0255: مادّةٌ لم تلمسها السطورُ القديمة: أوّلُ لمسها هنا — تُقفل وتُصوَّر قبل سطرها.   -- +0255
      if not (v_avg ? v_pid::text) then                                               -- +0255
        select * into v_ap from products where id = v_pid and clinic_id = v_clinic for update;   -- +0255
        if v_ap.id is not null then                                                   -- +0255
          v_avg := v_avg || jsonb_build_object(v_pid::text, (case when v_ap.farm_id is not null then jsonb_build_object('skip', true)   -- +0255
                     else jsonb_build_object('s0', coalesce(v_ap.stock, 0), 'a0', public._avg_base(v_ap.avg_cost, v_ap.purchase_price),   -- +0255
                                             'vo', 0, 'vn', 0, 'cl', null) end));     -- +0255
        end if;                                                                       -- +0255
      end if;                                                                         -- +0255
      -- «كان» = صورتُه قبل التعديل كلِّه لأوّل سطرٍ يلمسه؛ وسطرٌ ثانٍ لنفس المادّة
      -- يرى ما تركه الأوّل (الحقيقةُ بالتسلسل).
      if v_orig ? v_pid::text and not (v_pid = any (v_seen)) then
        v_bj := v_orig->(v_pid::text);
      else
        select * into v_before from products where id = v_pid and clinic_id = v_clinic;
        if found then v_bj := purchase_effect_snap(v_before); end if;
      end if;
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
      where id = v_pid and clinic_id = v_clinic
      returning * into v_after;
      if not found then v_pid := null; v_how := null; v_bj := null; else v_touched := v_touched || v_pid; end if;
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
      returning * into v_after;
      v_pid := v_after.id;
      v_touched := v_touched || v_pid;
      -- 0255: مادّةٌ وُلدت بهذا التعديل: سطرُها أوّلُ لمسها — رصيدُها وكلفتُه أساسٌ لما بعده (كاستلامٍ على لا شيء).   -- +0255
      v_avg := v_avg || jsonb_build_object(v_pid::text, jsonb_build_object(           -- +0255
-- -0260                  's0', coalesce(v_after.stock, 0), 'a0', (case when v_cost > 0 then v_cost end),   -- +0255
                 's0', coalesce(v_after.stock, 0), 'a0', (case when v_ucost > 0 then v_ucost end),   -- +0260
-- -0260                  'vo', 0, 'vn', 0, 'cl', (case when v_cost > 0 then v_cost end)));    -- +0255
                 'vo', 0, 'vn', 0, 'cl', (case when v_ucost > 0 then v_ucost end)));   -- +0260
      v_made := true;                                                                 -- +0255
    end if;

    -- 0214: تاريخُ **هذه الوجبة** يُحفظ مع سطرها. وبالتعديل يرسل المتصفّحُ تاريخَها
    -- المحفوظ بـ`batch_expiry` — يُحفظ للسطر ولا يلمس تاريخَ المنتج (وجبةٌ أحدث قد
    -- تكون غيّرته بعدها، وإعادةُ حفظ فاتورةٍ قديمة كانت سترجعه للقديم).
    insert into purchase_items (purchase_id, clinic_id, product_id, barcode, name, category,
                                qty, purchase_price, sell_price, expiry_date)
    values (p_purchase, v_clinic, v_pid, nullif(it->>'barcode',''),
            coalesce(nullif(it->>'name',''), 'Item'), nullif(it->>'category',''),
            v_qty, v_cost, v_sell, coalesce(nullif(it->>'expiry_date','')::date, nullif(it->>'batch_expiry','')::date));

    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, p_purchase, 'update', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
    v_seen := v_seen || v_pid;
    -- 0255: قيمةُ السطر بكلفته (والصفريُّ بـa0) وآخرُ كلفةٍ موجبة — إلا سطراً وَلّد مادّتَه (قيمتُه بأساسها).   -- +0255
    if not v_made and (v_avg ? v_pid::text) and not coalesce(((v_avg -> v_pid::text) ->> 'skip')::boolean, false) then   -- +0255
      v_avg := jsonb_set(v_avg, array[v_pid::text], (v_avg -> v_pid::text) || jsonb_build_object(   -- +0255
                 'vn', ((v_avg -> v_pid::text) ->> 'vn')::numeric                     -- +0255
-- -0260                        + v_qty * coalesce((case when v_cost > 0 then v_cost end), ((v_avg -> v_pid::text) ->> 'a0')::numeric, 0),   -- +0255
                       + v_qty * coalesce((case when v_ucost > 0 then v_ucost end), ((v_avg -> v_pid::text) ->> 'a0')::numeric, 0),   -- +0260
-- -0260                  'cl', coalesce((case when v_cost > 0 then v_cost end), ((v_avg -> v_pid::text) ->> 'cl')::numeric)));   -- +0255
                 'cl', coalesce((case when v_ucost > 0 then v_ucost end), ((v_avg -> v_pid::text) ->> 'cl')::numeric)));   -- +0260
    end if;                                                                           -- +0255
  end loop;

  -- ── ٢·٤) 0255: المتوسّطُ مرّةً لكلّ مادّة بعد إعادة التطبيق كلِّها، بالرصيد النهائيّ s1:   -- +0255
  -- _avg_adjust(s0, a0, vo, vn, s1, cl). الرصيدُ الحاضر وحده يُعاد تقييمُه، والفواتيرُ الصادرة بكلفتها،   -- +0255
  -- وما لم يتغيّر لا يُكتب (لا سطرَ تدقيقٍ فارغ). المادّةُ مقفولةٌ من أوّل لمس.      -- +0255
  -- والمجهولُ (null) لا يُكتب فوق المخزَّن — كالاستلام: أساسُ متوسّطٍ صفرٍ صريح مجهول، فسطورٌ مجّانيةٌ (أو رصيدٌ ≤ ٠)   -- +0255
  -- كانت تمحو الصفرَ وتعيد الكلفةَ لسعر الشراء؛ وكلفةٌ موجبة بالسطور تبقى تُكتب (coalesce(c_last, a0)) كما كانت.   -- +0255
  for v_ak in select k from jsonb_object_keys(v_avg) k loop                           -- +0255
    continue when coalesce(((v_avg -> v_ak) ->> 'skip')::boolean, false);             -- +0255
    select p.avg_cost,                                                                -- +0255
           coalesce(public._avg_adjust(((v_avg -> v_ak) ->> 's0')::numeric, ((v_avg -> v_ak) ->> 'a0')::numeric,   -- +0255
                                       ((v_avg -> v_ak) ->> 'vo')::numeric, ((v_avg -> v_ak) ->> 'vn')::numeric,   -- +0255
                                       coalesce(p.stock, 0), ((v_avg -> v_ak) ->> 'cl')::numeric),   -- +0255
                    p.avg_cost)                                                       -- +0255
      into v_was, v_now                                                               -- +0255
      from products p where p.id = v_ak::uuid and p.clinic_id = v_clinic;             -- +0255
    if found and v_now is distinct from v_was then                                    -- +0255
      update products set avg_cost = v_now where id = v_ak::uuid and clinic_id = v_clinic;   -- +0255
    end if;                                                                           -- +0255
  end loop;                                                                           -- +0255
  -- 0255: «صار» بالكشف يقول المتوسّطَ النهائيّ (صورةُ السطر داخل الحلقة سبقته).      -- +0255
  update purchase_effects e set after = e.after || jsonb_build_object('avg_cost', p.avg_cost)   -- +0255
    from products p                                                                   -- +0255
   where e.purchase_id = p_purchase and e.clinic_id = v_clinic and e.op = 'update'    -- +0255
     and e.created_at = now() and p.id = e.product_id and p.clinic_id = v_clinic and e.after is not null;   -- +0255
  -- ── ٢·٥) 0253: لا حصرة. قطعُ فاتورةٍ تحت ما صُرف منها يترك الرصيدَ سالباً ويُقال: اشترى ١ -- +0253
  -- وصُرف ٠٫٨ ثمّ عُدّلت إلى ٠٫٥ ⇒ −٠٫٣. الحصرةُ كانت تمحو العجزَ فيبدو المصروفُ كأنه لم يُصرف. -- +0253
-- -0253   -- ── ٢·٥) الحصرةُ الوحيدة: على ما لمسته الفاتورةُ وحدَه ──
-- -0253   -- بضاعةٌ سُحبت من الفاتورة ولم تعد تغطّي ما بيع ⇒ الرصيدُ صفرٌ لا سالب.
-- -0253   update products set stock = 0
-- -0253    where clinic_id = v_clinic and id = any (v_touched) and coalesce(stock, 0) < 0;

  -- 0211: «صار» يُقال بعد الحصرة لا قبلها — سالبٌ وسطيٌّ لم يوجد خارج المعاملة.
  -- 0253: والتصحيحُ باقٍ بلا حصرة: «صار» سالبٌ يُكتب بالرصيد النهائيّ — وسطيٌّ لسطرين لنفس المادّة -- +0253
  -- يصير النهائيّ، والنهائيُّ السالبُ يبقى كما هو فيقول الإيصالُ «كان ٠٫٢ صار −٠٫٣». -- +0253
  update purchase_effects e set after = purchase_effect_snap(p)
    from products p
   where e.purchase_id = p_purchase and e.clinic_id = v_clinic and e.op = 'update'
     and e.created_at = now() and p.id = e.product_id and p.clinic_id = v_clinic
     and coalesce((e.after->>'stock')::numeric, 0) < 0;

  -- 0211: مادّةٌ كانت بالفاتورة وشيلت منها — رصيدُها نقص، ويُقال.
  for v_k in select k from jsonb_object_keys(v_orig) k where not (k::uuid = any (v_seen)) loop
    v_line := v_line + 1;
    select * into v_after from products where id = v_k::uuid and clinic_id = v_clinic;
    insert into purchase_effects (clinic_id, purchase_id, op, line_no, product_id, product_name, barcode_in,
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, p_purchase, 'update', v_line, v_k::uuid,
            coalesce(v_after.name, v_orig->v_k->>'name', 'Item'), null,
            'removed', null, -coalesce((v_oldq->>v_k)::numeric, 0),
            v_orig->v_k, purchase_effect_snap(v_after), '{}');
  end loop;

  -- ── ٣) رأس الفاتورة: إجمالي جديد، والمدفوع الحقيقي يبقى مقصوصاً عليه ──
  v_total := round(v_total, 2);
  v_total := v_total - v_disc;        -- 0260: صافٍ — والمدفوعُ والحالةُ عليه كما كانا على المجموع   -- +0260
  v_paid  := least(coalesce(nullif(p_meta->>'amount_paid','')::numeric,
                            coalesce(v_purchase.amount_paid, v_purchase.total)),
                   v_total);
  v_paid  := greatest(v_paid, 0);

  update purchases set
    total          = v_total,
    discount       = v_disc,   -- +0260
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
revoke all on function public.update_purchase(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_purchase(uuid, jsonb, jsonb) to authenticated;
comment on function public.update_purchase(uuid, jsonb, jsonb) is
  'تعديلُ فاتورةِ شراء: يعكس السطورَ القديمة بلا حصرٍ ثمّ يبني الجديدة (0205)، ومنذ 0253 بلا حصرةٍ أخيرة. ويكتب منذ 0211 كشفَ ما فعله بـpurchase_effects (op=update). ومنذ 0255 يعيد تقييمَ الرصيد الحاضر بالمتوسّط (_avg_adjust مرّةً لكلّ مادّة بعد الحلقة)، والفواتيرُ الصادرة تبقى بكلفتها. ومنذ 0260 خصمُ الشركة: total صافٍ، والقديمُ بنسبة خصمه كما حُفظ والجديدُ بنسبته، وجهازٌ بلا مفتاح discount يُبقي الخصمَ كما كان.';

-- ── ٤) فحصُ التوصيل — نصُّ 0255 حرفاً وفوقه مجموعتا 0259 و0260 ─────────────────────────────────────
-- إعادةُ 0253 وحدها بعد هالهجرة تُرجع الشراءَ (بلا خصم) والاسترجاعَ والترتيبَ (بلا تعبئة) لنصّها، وعلامةُ 0253 فيه —
-- فحارسُها يمرّ ومجموعتُها نظيفة. مجموعتا 0259 و0260 تقولانها. (وإعادةُ 0255 وحدها تُرجع هذا الفحصَ لنصّها معها —
-- فذاك يمسكه الجهاز: الخصمُ المرسَل يُقارَن بما رجع.)
create or replace function public.verify_consumption_wiring()
returns table (problem text)
language sql stable security invoker set search_path = public as $$
  with need(sig, txt) as (values
    ('public.retail_checkout(jsonb,jsonb)',                  '-- +0252'),
    ('public.retail_checkout(jsonb,jsonb)',                  '_consumption_plan('),
    ('public.retail_checkout(jsonb,jsonb)',                  '_consumption_apply('),
    ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', '-- +0252'),
    ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', '_consumption_relink('),
    ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', '_invoice_lock_products('),
    ('public.edit_invoice_lines(uuid,jsonb,text)',           'edit_invoice_lines_unguarded('),
    ('public.product_movements(uuid,integer)',               '-- +0252'),
    ('public.product_movements(uuid,integer)',               'invoice_consumption')
  ),
  grp(mig, sig) as (values
    ('0253', 'public.deduct_stock_pooled(uuid,numeric,uuid)'),
    ('0253', 'public.record_purchase(jsonb,jsonb)'),
    ('0253', 'public.update_purchase(uuid,jsonb,jsonb)'),
    ('0253', 'public.return_invoice_items(uuid,jsonb,text,text)'),
    ('0253', 'public.delete_invoice(uuid)'),
    ('0253', 'public.restore_product(uuid)'),
    ('0253', 'public.inventory_tidy_uncat()'),
    ('0253', 'public.pool_product(uuid,uuid)'),
    ('0253', 'public.restore_company(uuid)'),
    ('0253', 'public.restore_company_section(uuid)'),
    ('0254', 'public.stock_count_decide(uuid[],boolean)'),
    ('0254', 'public.stock_count_state()'),
-- -0255     ('0254', 'public.products_trash_consumption()')
    ('0254', 'public.products_trash_consumption()'),                                  -- +0255
    ('0255', 'public.retail_checkout(jsonb,jsonb)'),                                  -- +0255
    ('0255', 'public.edit_invoice_lines_unguarded(uuid,jsonb,text)'),                 -- +0255
    ('0255', 'public.record_purchase(jsonb,jsonb)'),                                  -- +0255
    ('0255', 'public.update_purchase(uuid,jsonb,jsonb)'),                             -- +0255
    ('0255', 'public.stock_count_submit(jsonb)'),                                     -- +0255
    ('0255', 'public.products_trash_consumption()'),                                  -- +0255
-- -0260     ('0255', 'public.purchase_effect_snap(products)')                                 -- +0255
    ('0255', 'public.purchase_effect_snap(products)'),   -- +0260
    -- 0259: الطيُّ والاسترجاعُ والترتيبُ يحملون التعبئة — إعادةُ 0253 وحدها تُرجع الاسترجاعَ والترتيبَ لنصّها، وعلامتُها فيه.   -- +0260
    ('0259', 'public.merge_products(uuid,uuid)'),   -- +0260
    ('0259', 'public.restore_product(uuid)'),   -- +0260
    ('0259', 'public.inventory_tidy_uncat()'),   -- +0260
    -- 0260: خصمُ الشركة — إعادةُ 0253 وحدها تُرجع الشراءَ لنصّها (بلا خصم)، وعلامتُها فيه.   -- +0260
    ('0260', 'public.record_purchase(jsonb,jsonb)'),   -- +0260
    ('0260', 'public.update_purchase(uuid,jsonb,jsonb)')   -- +0260
  ),
  src as (
    select g.mig, g.sig, (select p.prosrc from pg_proc p where p.oid = to_regprocedure(g.sig)) as body from grp g
  ),
  landed as (
    select distinct s.mig from src s where position('-- +' || s.mig in coalesce(s.body, '')) > 0
    union
    select '0254' where to_regprocedure('public.stock_waste_submit(jsonb,boolean,jsonb)') is not null
    union                                                                             -- +0255
    select '0255' where to_regprocedure('public.product_cost_reset(uuid,numeric)') is not null   -- +0255
    union   -- +0260
    select '0259' where to_regprocedure('public.product_level_codes(public.products)') is not null   -- +0260
    union   -- +0260
    select '0260' where to_regprocedure('public._purchase_unit_cost(numeric,numeric,numeric)') is not null   -- +0260
  ),
  trg(tg, tbl, mig) as (values
    ('invoice_items_consumption_del', 'invoice_items', '0252'),
    ('invoice_items_consumption_qty', 'invoice_items', '0252'),
    ('invoices_consumption_status',   'invoices',      '0252'),
    ('products_trash_consumption',    'products_trash', '0252'),
-- -0255     ('products_waste_guard',          'products',      '0254')
    ('products_waste_guard',          'products',      '0254'),                       -- +0255
    ('products_guard_avg',            'products',      '0255')                        -- +0255
  )
  select n.sig || case when to_regprocedure(n.sig) is null then ': missing' else ': lacks ' || n.txt end
    from need n
   where to_regprocedure(n.sig) is null
      or position(n.txt in (select p.prosrc from pg_proc p where p.oid = to_regprocedure(n.sig))) = 0
  union all
  select s.sig || case when s.body is null then ': missing' else ': lacks -- +' || s.mig end
    from src s
   where s.mig in (select mig from landed) and position('-- +' || s.mig in coalesce(s.body, '')) = 0
  union all
  select s.sig || ': lacks _invoice_lock_products('
    from src s
   where s.mig = '0253' and s.mig in (select mig from landed)
     and s.sig in ('public.return_invoice_items(uuid,jsonb,text,text)', 'public.delete_invoice(uuid)')
     and s.body is not null and position('_invoice_lock_products(' in s.body) = 0
  union all
  select format('trigger %s on %s: %s', t.tg, t.tbl, case when g.oid is null then 'missing' else 'disabled' end)
    from trg t
    left join pg_trigger g on g.tgname = t.tg and g.tgrelid = to_regclass('public.' || t.tbl) and not g.tgisinternal
   where (t.mig = '0252' or t.mig in (select mig from landed))
     and (g.oid is null or g.tgenabled not in ('O', 'A'))
  union all
  -- قارئُ هذه الهجرة تعيده 0254 فتملأ waste من أعمدتها (stock_counts.source_invoice): نزلت أعمدتُها والقارئُ
  -- بلا علامتها ⇒ إعادةُ 0252 وحدها بعد 0254 أرجعت waste [] لكلّ فاتورة، فسندُ الهدر يُعبّأ ثانيةً بما سُجّل.
  select 'public.invoice_consumption_get(uuid[]): lacks -- +0254'
   where exists (select 1 from pg_attribute a
                  where a.attrelid = to_regclass('public.stock_counts') and a.attname = 'source_invoice' and not a.attisdropped)
     and position('-- +0254' in coalesce((select p.prosrc from pg_proc p
                                           where p.oid = to_regprocedure('public.invoice_consumption_get(uuid[])')), '')) = 0
  union all
  -- وهذا الفحصُ نفسُه: 0255 تعيده بمجموعتها (أجسامُها السبعة ومحفّزُها). نزلت 0255 (product_cost_reset منها) والفحصُ الحيُّ
  -- بلا علامتها ⇒ إعادةُ 0252 وحدها بعدها: البيعةُ والتعديلُ وطيُّ الدمج وstock_unit_cost رجعت لنصّها، ونصُّ 0252 لا يعرف
  -- مجموعتها — فيقول نفسَه حتى تُعاد 0255 (لا «نظيف» بعد 0252 ثمّ 0254 وحدهما). العلامةُ تُبنى بـformat: حرفُها هنا يُسكته.
  select format('public.verify_consumption_wiring(): lacks -- +%s', '0255')
   where to_regprocedure('public.product_cost_reset(uuid,numeric)') is not null
     and position(format('-- +%s', '0255') in coalesce((select p.prosrc from pg_proc p
                                                         where p.oid = to_regprocedure('public.verify_consumption_wiring()')), '')) = 0
  order by 1
$$;
revoke all on function public.verify_consumption_wiring() from public, anon, authenticated;

-- ── ٥) سؤالُ الواجهة: هل جسما الشراء الحيّان يعرفان الخصم؟ ────────────────────────────────────────────
-- العمودُ وحده لا يكفي جواباً: إعادةُ 0255 وحدها بعد هالهجرة تُرجع الشراءَ وتعديلَه لنصّها (حارسُها يمرّ — علامتُها
-- فيه) ويبقى العمود — فخصمٌ يُرسَل يُبلع بصمت والإجماليُّ مجموعٌ لا صافٍ، وفحصُ التوصيل يرجع لنصّها معها فلا يقوله.
-- فالواجهةُ تسأل الجسمَين نفسَيهما (علامتُنا بنصّهما) وتُخفي خانةَ الخصم إن لم يعرفاه. pg_proc مقروءٌ للجميع: invoker.
-- والعلامةُ تُبنى بـformat — لا حرفَ لها بنصّ هذه الدالّة.
create or replace function public.purchase_discount_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select count(*) = 2 from pg_proc p
   where p.oid in (to_regprocedure('public.record_purchase(jsonb,jsonb)'), to_regprocedure('public.update_purchase(uuid,jsonb,jsonb)'))
     and position(format('-- +%s', '0260') in p.prosrc) > 0
$$;
revoke all on function public.purchase_discount_ready() from public, anon;
grant execute on function public.purchase_discount_ready() to authenticated;

reset lock_timeout;