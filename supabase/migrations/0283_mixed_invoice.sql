-- ============================================================================
-- ٠٢٨٣ — فاتورةٌ بمجموعين: سطورُ الدينار تُجمع بالدينار وسطورُ الدولار بالدولار، وكلٌّ يُدفع ويُدان بعملته
--
-- بلاغُ المالك (٢٠/١١) بعد 0282: «مو هذا قصدي — أريد تسعيرين بنفس الوقت، مو الدولار والعراقي نفس الرقم». 0282 حوّل سطرَ الدولار
-- لدينارٍ بسعر الصرف فخرجت الفاتورةُ كلُّها دينار. وقراراتُه بسؤال:
--   • **فاتورةٌ بمجموعين**: سطورُ الدينار مجموعُها بالدينار، وسطورُ الدولار مجموعُها بالدولار — لا تحويل؛ والزبونُ يدفع كلَّ واحدٍ بعملته
--     والدَّينُ يبقى بعملته.
--   • **دفعةٌ جزئيّة بالدولار ساعةَ البيع** والباقي دَينٌ بالدولار؛ ويُسدَّد بعدها **بسعر يومه** يكتبه الدكتور (بابُ التسديد القائم، 0264،
--     يأخذ سعرَ الصرف لكلّ تسديد) — وسعرُ يوم البيع محفوظٌ على الفاتورة (`fx_rate`).
--   • **خصمٌ لكلّ عملة**.
--
-- ── التصميم: فاتورتان مربوطتان بمرجعٍ واحد، تُطبعان ورقةً واحدة ────────────────────────────────────────
-- فاتورةُ الدولار (0264) فيها كلُّ ما تحتاجه سطورُ الدولار: الدَّينُ بالدولار، والتسديدُ بسعر يومه وفرقُ صرفه ساقٌ معلَّمة، والتقاريرُ
-- والأرباحُ والخسائرُ ودفترُ الزبون تعرفها. ففاتورةٌ «بمجموعين» = فاتورةُ دينارٍ عادية لسطور الدينار + فاتورةُ دولارٍ لسطور الدولار،
-- بمعاملةٍ واحدة وبمرجعٍ واحد: مرجعُ الدينار `R` ومرجعُ الدولار `R~usd` — الربطُ بالمرجع لا بعمودٍ يُحدَّث بعد البيع (تحديثُ فاتورةٍ
-- يُكتب بسجلّ الحركات «تعديلاً»). فاتورةٌ واحدة بعملتين كانت تعني إعادةَ بناء الدَّين والتسديد والمرتجع وكلّ تقرير.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • `usd_checkout` يبيع **المادّةَ بسعرين** (0282: دينار + `sell_price_usd`) — بالعلبة والمفرد (`{sub: true}`) والكارتون — لا بالوزن.
--   كلفتُها ما حسبته `retail_checkout` (متوسّطُ الدينار، 0255) لا آخرُ شراءٍ بالدولار × اليوم؛ ومادّةُ «الدولار وحده» كما كانت حرفاً.
--   ودفعةٌ جزئيّة ساعةَ البيع بعلَم `partial_ok` وحده (بيعُ الدولار القديم: نقدٌ كامل أو دَين كما كان).
-- • `mixed_checkout(p_iqd, p_usd, p_meta, p_charges)` — بيعةٌ فيها سطرُ دولار (definer): فاتورةُ الدينار بـretail_checkout (أو
--   retail_checkout_doses بجرعات) كما هي، ثمّ فاتورةُ الدولار بـusd_checkout، بالمعاملة نفسِها — رفضُ أيّ نصفٍ يُرجع النصفين.
--   والإعادةُ بالمرجع ترجع الاثنتين كما ثبتتا (وبجرعاتٍ تمرّ من بابها: جرعةٌ نزلت بعد محاولةٍ مجهولة تُقال، درسُ مراجعة 0282).
-- • `mixed_checkout_ready()` — الواجهةُ تسألها قبل أن تجمع سطرَ الدولار بالدولار.
--
-- ── الحارسُ قبل أيّ تعريف ──────────────────────────────────────────────────────────────────────────
-- usd_checkout نصُّ 0272 حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0283` (والمستبدَلُ بـ`-- -0283`)، وحارسُ الانجراف على بصمة شِفرة 0272.
--
-- حدودٌ معلنة: المرتجعُ والتعديلُ على فاتورة الدولار بالمرحلة الجاية (كما كانا)؛ وبيعٌ بيومٍ سابق أو بالجملة أو بالتوصيل بلا سطر دولار.
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة — والواجهةُ قبلها تبيع سطرَ الدولار كما بـ0282.
-- تراجع: أعد usd_checkout حرفاً من 0272 (والصلاحياتُ كما هنا)، و drop function mixed_checkout(jsonb, jsonb, jsonb, uuid[]);
-- drop function mixed_checkout_ready(); — ما بيع قبل التراجع محفوظٌ بفاتورتيه.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه، ثمّ الحارس — قبل أيّ تعريف ───────────────────────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
  if to_regprocedure('public.usd_pack_sale_ready()') is null then
    raise exception 'needs_0272' using hint = 'طبّق 0272 (كارتونُ الدولار) قبل هالهجرة';
  end if;
  if to_regprocedure('public.dual_pricing_ready()') is null then
    raise exception 'needs_0282' using hint = 'طبّق 0282 (المادّةُ بسعرين) قبل هالهجرة';
  end if;
end $$;
select public._drift_assert('public.usd_checkout(jsonb,jsonb)', '5bcb6698e5ecc7c335bddd8dde1c5e9f', '-- +0283');

-- ── ١) البيعُ بالدولار يعرف المادّةَ بسعرين والدفعةَ الجزئيّة ──────────────────────────────────────────
create or replace function public.usd_checkout(p_items jsonb, p_meta jsonb default '{}'::jsonb)
returns public.invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_ctx     record;
  v_ref     text := nullif(btrim(p_meta->>'client_ref'), '');
  v_inv     invoices;
  it        jsonb;
  p         products;
  v_qty     numeric;
  v_uusd    numeric;
  v_uiqd    numeric;
  v_sub_usd numeric := 0;
  v_sub_iqd numeric := 0;
  v_dusd    numeric;
  v_diqd    numeric;
  v_tusd    numeric;
  v_tiqd    numeric;
  v_pusd    numeric;
  v_paid    boolean;
  v_method  text := coalesce(nullif(p_meta->>'payment_method', ''), 'cash');
  v_lines   jsonb := '[]'::jsonb;
  v_costs   jsonb := '{}'::jsonb;
-- -0272   v_seen    uuid[] := '{}';
  v_seen    text[] := '{}';   -- +0272
  v_cost    numeric := 0;
  r         record;
  v_pack    jsonb;   -- +0272
  v_per     integer;   -- +0272
  v_key     text;   -- +0272
  v_dual    boolean;   -- +0283
  v_sub     boolean;   -- +0283
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — من الإعدادات.'; end if;
  if v_ref is not null then
    select * into v_inv from invoices where clinic_id = v_clinic and client_ref = v_ref;
    if found then return v_inv; end if;   -- إعادةٌ آمنة: ضغطتان أو ردٌّ ضائع = فاتورةٌ واحدة
  end if;
  if nullif(btrim(p_meta->>'sale_at'), '') is not null then
    raise exception 'usd_backdate' using hint = 'فاتورةُ الدولار بيومٍ سابق ما تنسجل بالمرحلة الأولى — سعرُ ذاك اليوم غير معروف.';
  end if;
  if v_ctx.rate_id is null then
    raise exception 'usd_no_rate' using hint = 'حدّد سعرَ الدولار اليوم أوّلاً (الإعدادات › الدولار).';
  end if;
  if nullif(p_meta->>'fx_rate_id', '') is distinct from v_ctx.rate_id::text then
    raise exception 'usd_rate_changed' using hint = 'سعرُ الدولار تغيّر — حدّث وشوف المجموع الجديد قبل البيع.';
  end if;
  if v_method not in ('cash', 'card', 'transfer') then raise exception 'usd_method' using hint = 'طريقةُ الدفع: نقد أو بطاقة أو تحويل.'; end if;
  if jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then raise exception 'empty cart'; end if;

  for it in select * from jsonb_array_elements(p_items) loop
    select * into p from products where id = nullif(it->>'product_id', '')::uuid and clinic_id = v_clinic;
    if not found then
      raise exception 'usd_mixed' using hint = 'فاتورةُ الدولار موادُّها بالدولار وحدها — الخدماتُ والموادُّ بالدينار بفاتورةٍ ثانية.';
    end if;
-- -0283     if p.price_currency <> 'USD' then
    -- 0283: المادّةُ بسعرين (دينار + سعر بيعٍ بالدولار، 0282) تُباع بالدولار أيضاً — بالعلبة والمفرد والكارتون — لا بالوزن.   -- +0283
    v_dual := coalesce(p.price_currency, 'IQD') = 'IQD' and p.sell_price_usd is not null and not coalesce(p.sold_by_weight, false);   -- +0283
    if p.price_currency <> 'USD' and not v_dual then   -- +0283
      raise exception 'usd_mixed' using hint = '«' || p.name || '» سعرها بالدينار — بفاتورةٍ ثانية.';
    end if;
    -- 0272: سطرُ كارتون {pack_id, pack_per}: الكارتونُ محفوظٌ على المادّة بعدده كما رآه الجهاز (غيرُه pack_changed — شاشةٌ بائتة)،   -- +0272
    -- وما يُخصم qty × per علبة، والسعرُ الافتراضيّ سعرُ الكارتون المكتوب بعملة المادّة (الدولار) وإلا العلبةُ × العدد.   -- +0272
    v_pack := null;   -- +0272
    v_per := 1;   -- +0272
    if nullif(it->>'pack_id', '') is not null then   -- +0272
      -- packs قد تكون jsonb 'null' (يقبلها _pkg_packs_ok) — jsonb_array_elements عليها يرمي بدل pack_changed.   -- +0272
      select value into v_pack from jsonb_array_elements(case when jsonb_typeof(p.packs) = 'array' then p.packs else '[]'::jsonb end)   -- +0272
       where value->>'id' = it->>'pack_id' limit 1;   -- +0272
      if v_pack is null or jsonb_typeof(v_pack->'per') is distinct from 'number' or (v_pack->>'per')::numeric < 2   -- +0272
         or (v_pack->>'per')::numeric <> trunc((v_pack->>'per')::numeric)   -- +0272
         or (nullif(it->>'pack_per', '') is not null and (it->>'pack_per')::numeric is distinct from (v_pack->>'per')::numeric) then   -- +0272
        raise exception 'pack_changed' using hint = 'الكارتون تغيّر أو انشال من المادة من جهاز ثاني — حدّث القائمة وامسحه من جديد';   -- +0272
      end if;   -- +0272
      v_per := (v_pack->>'per')::integer;   -- +0272
    end if;   -- +0272
    v_key := p.id::text || ':' || v_per;   -- +0272
    -- 0283: سطرُ المفرد {sub: true} لمادّةٍ بسعرين لها وحدةٌ فرعية بعددٍ ≥ ٢ — وما يُخصم qty ÷ العدد (بثلاث منازل كبيع الدينار).   -- +0283
    v_sub := v_dual and coalesce(nullif(it->>'sub', '')::boolean, false);   -- +0283
    if v_sub and (v_pack is not null or not coalesce(p.has_sub_unit, false) or coalesce(p.units_per_box, 0) < 2) then   -- +0283
      raise exception 'sub_changed' using hint = '«' || p.name || '» ما إلها وحدة فرعية هسّه — حدّث القائمة وأضفها من جديد.';   -- +0283
    end if;   -- +0283
    if v_sub then v_key := p.id::text || ':s'; end if;   -- +0283
-- -0272     if p.id = any(v_seen) then
    if v_key = any(v_seen) then   -- +0272
      raise exception 'usd_duplicate_line' using hint = '«' || p.name || '» مكرّرة بالسلّة — اجمعها بسطرٍ واحد.';
    end if;
-- -0272     v_seen := v_seen || p.id;
    v_seen := v_seen || v_key;   -- +0272
    v_qty := (it->>'qty')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'usd_qty' using hint = 'كميةُ «' || p.name || '» لازم أكبر من صفر — المرتجعُ بالدولار بالمرحلة الجاية.';
    end if;
    if v_qty <> trunc(v_qty) then   -- لا وزنَ ولا وحدةً فرعية للدولار (products_usd_ok)، فالكسرُ غلطُ إدخال
      raise exception 'usd_qty' using hint = 'كميةُ «' || p.name || '» عددٌ صحيح — مادّةُ الدولار ما تنباع بالكسر.';
    end if;
-- -0272     v_uusd := round(coalesce(nullif(it->>'unit_price_usd', '')::numeric, p.sell_price_usd), 2);
-- -0283     v_uusd := round(coalesce(nullif(it->>'unit_price_usd', '')::numeric,   -- +0272
-- -0283                              coalesce((v_pack->>'sell_price')::numeric, p.sell_price_usd * v_per)), 2);   -- +0272
    -- 0283: كارتونُ المادّة بسعرين سعرُه بالدولار بمفتاحه (sell_price بالدينار)، والمفردُ مكتوبُه وإلا العلبةُ ÷ العدد.   -- +0283
    v_uusd := round(coalesce(nullif(it->>'unit_price_usd', '')::numeric,   -- +0283
                             case when v_sub then coalesce(p.sub_unit_price_usd, round(p.sell_price_usd / p.units_per_box, 2))   -- +0283
                                  when v_dual then coalesce((v_pack->>'sell_price_usd')::numeric, p.sell_price_usd * v_per)   -- +0283
                                  else coalesce((v_pack->>'sell_price')::numeric, p.sell_price_usd * v_per) end), 2);   -- +0283
    if v_uusd is null or v_uusd < 0 then
      raise exception 'usd_no_price' using hint = '«' || p.name || '» ما إلها سعر بالدولار — حدّده من المخزون.';
    end if;
    -- قيمةُ السطر بالدينار الكامل لا بخطوة التقريب (خطّةُ §٩: line_iqd = round(line_usd × rate)): خطوةُ ٢٥٠ على سعر
    -- الوحدة كانت تبيع ١٠٠ × ٠٫٤٠$ بسعر ١٤٦٠ بـ٥٠٬٠٠٠ بدل ٥٨٬٤٠٠. الخطوةُ للنقد الذي يُستلم (التسديد) والفرقُ «فرق صرف».
    v_uiqd := _usd_iqd(v_uusd, v_ctx.rate, 1);
    v_sub_usd := v_sub_usd + round(v_qty * v_uusd, 2);
    v_sub_iqd := v_sub_iqd + v_qty * v_uiqd;
    -- السطرُ كما تأخذه retail_checkout: service_id صريحٌ null (غيابُه = «جهازٌ ما تحدّث» يُصنَّف بالاسم، 0252).
    v_lines := v_lines || jsonb_build_object(
-- -0272       'product_id', p.id, 'name', p.name, 'barcode', p.barcode, 'qty', v_qty, 'stock_qty', v_qty,
-- -0283       'product_id', p.id, 'name', p.name, 'barcode', p.barcode, 'qty', v_qty, 'stock_qty', v_qty * v_per, 'unit_label', v_pack->>'name',   -- +0272
      'product_id', p.id, 'name', p.name, 'barcode', p.barcode, 'qty', v_qty,   -- +0283
      'stock_qty', case when v_sub then round(v_qty / p.units_per_box, 3) else v_qty * v_per end,   -- +0283
      'unit_label', case when v_sub then nullif(btrim(p.sub_unit_name), '') else v_pack->>'name' end,   -- +0283
      'unit_price', v_uiqd, 'unit_cost', 0, 'service_id', null);
    -- كلفةُ الدولار (آخرُ سعر شراءٍ بالدولار) × سعر يوم البيع؛ وبلاها تبقى كلفةُ الخادم التي حسبتها retail_checkout
    -- (stock_unit_cost، 0255) — صفرٌ هنا كان يبيع مادّةً محوّلةً معروفةَ الكلفة بربحٍ كامل.
-- -0272     v_costs := v_costs || jsonb_build_object(p.id::text, jsonb_build_object(
    v_costs := v_costs || jsonb_build_object(v_key, jsonb_build_object(   -- +0272
-- -0272       'usd', v_uusd, 'cost_usd', p.purchase_price_usd,
-- -0283       'usd', v_uusd, 'cost_usd', p.purchase_price_usd * v_per,   -- +0272
-- -0272       'cost_iqd', case when p.purchase_price_usd is not null then round(p.purchase_price_usd * v_ctx.rate, 2) end));
-- -0283       'cost_iqd', case when p.purchase_price_usd is not null then round(p.purchase_price_usd * v_per * v_ctx.rate, 2) end));   -- +0272
      -- 0283: مادّةٌ بسعرين رصيدُها ومتوسّطُها بالدينار (0255) — كلفتُها ما حسبته retail_checkout، لا آخرُ شراءٍ بالدولار × اليوم.   -- +0283
      'usd', v_uusd, 'cost_usd', case when not v_dual then p.purchase_price_usd * v_per end,   -- +0283
      'cost_iqd', case when not v_dual and p.purchase_price_usd is not null then round(p.purchase_price_usd * v_per * v_ctx.rate, 2) end));   -- +0283
  end loop;

  v_dusd := least(greatest(round(coalesce(nullif(p_meta->>'discount_usd', '')::numeric, 0), 2), 0), v_sub_usd);
  -- خصمٌ كامل (بالدولار = المجموع) يأخذ الدينارَ كلَّه: دينارُ السطور مقرَّبٌ وحدةً وحدة فلا يساوي تقليبَ المجموع، وكان يُبقي
  -- ديناراً أو اثنين على فاتورةٍ صفرٍ بالدولار — مغلقةٍ بعملةٍ ومفتوحةٍ بالأخرى ولا تُسدَّد أبداً (أمسكه usd-parity).
  v_diqd := case when v_dusd >= v_sub_usd then v_sub_iqd else least(_usd_iqd(v_dusd, v_ctx.rate, 1), v_sub_iqd) end;
  v_tusd := v_sub_usd - v_dusd;
  v_tiqd := greatest(v_sub_iqd - v_diqd, 0);
  v_pusd := round(coalesce(nullif(p_meta->>'paid_usd', '')::numeric, 0), 2);
  if v_pusd = 0 then v_paid := false;
  elsif v_pusd = v_tusd then v_paid := true;
  elsif v_pusd > 0 and v_pusd < v_tusd and coalesce(nullif(p_meta->>'partial_ok', '')::boolean, false) then v_paid := true;   -- +0283
  else
    raise exception 'usd_partial_at_sale' using hint = 'البيعُ بالدولار نقداً كاملاً أو دَيناً — الدفعةُ الجزئية تنسجل «تسديد» بعد البيع.';
  end if;

  perform set_config('doctorvet.usd_door', 'on', true);
  v_inv := retail_checkout(v_lines, jsonb_strip_nulls(jsonb_build_object(
    'customer_name', p_meta->>'customer_name', 'customer_phone', p_meta->>'customer_phone',
    'pet_name', p_meta->>'pet_name', 'staff_id', p_meta->>'staff_id', 'notes', p_meta->>'notes',
    -- الدَّينُ بلا طريقة دفع (كبيع الدينار الآجل): فاتورةٌ بلا سِيَقٍ وطريقتُها «نقد» يقرؤها تبويبُ المال مقبوضةً كلَّها
    -- يومَ البيع (paymentsOf)، ثمّ تختفي من يومها بأوّل تسديد. النقدُ تختمه ساقُ التسديد بعد قليل.
    'client_ref', v_ref, 'sale_kind', p_meta->>'sale_kind', 'payment_method', case when v_paid then v_method end,
    'discount_type', case when v_diqd > 0 then 'fixed' end, 'discount_value', case when v_diqd > 0 then v_diqd end,
    'amount_paid', 0)));   -- النقدُ يُسجَّل تسديداً كاملاً بعد الختم (أدناه)

  if v_inv.currency = 'USD' then   -- سباقُ ضغطتين على نفس client_ref: الأولى ختمتها
    perform set_config('doctorvet.usd_door', 'off', true);
    return v_inv;
  end if;
  -- مجموعُ retail_checkout هو ما حسبناه هنا (ومرآتُه cartTotals) — فرقٌ بينهما يعني أن أحدَهما تغيّر بلا الآخر.
  if v_inv.total is distinct from round(v_tiqd, 2) then
    raise exception 'usd_total_mismatch' using hint = 'مجموعُ الفاتورة بالدينار (' || v_inv.total || ') غيرُ المحسوب (' || v_tiqd || ') — ما انحفظ شي.';
  end if;

  -- الختم: الكلفةُ بالدولار × سعر يوم البيع (م١: آخرُ سعر شراء بالدولار)، والأعمدةُ الدولارية.
-- -0272   for r in select ii.id, ii.product_id, ii.qty, ii.unit_cost from invoice_items ii where ii.invoice_id = v_inv.id loop
  -- السطرُ بمفتاحه (المادّة:العدد): علبةٌ وكارتونٌ من المادّة نفسِها سطران (0272) — مفتاحُ المادّة وحده كان يختم الكارتونَ بكلفة العلبة.   -- +0272
  for r in select ii.id, ii.qty, ii.unit_cost,   -- +0272
-- -0283                   ii.product_id::text || ':' || coalesce(round(ii.stock_qty / nullif(ii.qty, 0))::integer, 1) as k   -- +0272
                  ii.product_id::text || ':' || case when ii.stock_qty < ii.qty then 's'   -- +0283
                    else coalesce(round(ii.stock_qty / nullif(ii.qty, 0))::integer, 1)::text end as k   -- +0283
             from invoice_items ii where ii.invoice_id = v_inv.id loop   -- +0272
    update invoice_items
-- -0272        set unit_price_usd = (v_costs->(r.product_id::text)->>'usd')::numeric,
       set unit_price_usd = (v_costs->(r.k)->>'usd')::numeric,   -- +0272
-- -0272            unit_cost_usd  = (v_costs->(r.product_id::text)->>'cost_usd')::numeric,
           unit_cost_usd  = (v_costs->(r.k)->>'cost_usd')::numeric,   -- +0272
-- -0272            unit_cost      = coalesce((v_costs->(r.product_id::text)->>'cost_iqd')::numeric, r.unit_cost)
           unit_cost      = coalesce((v_costs->(r.k)->>'cost_iqd')::numeric, r.unit_cost)   -- +0272
     where id = r.id;
-- -0272     v_cost := v_cost + r.qty * coalesce((v_costs->(r.product_id::text)->>'cost_iqd')::numeric, r.unit_cost);
    v_cost := v_cost + r.qty * coalesce((v_costs->(r.k)->>'cost_iqd')::numeric, r.unit_cost);   -- +0272
  end loop;
  update invoices
     set currency = 'USD', fx_rate = v_ctx.rate, total_usd = v_tusd, discount_usd = v_dusd,
         paid_usd = 0,
         cost_total = round(v_cost, 2), profit = total - round(v_cost, 2)
   where id = v_inv.id
   returning * into v_inv;
  perform set_config('doctorvet.usd_door', 'off', true);
  -- البيعُ نقداً = دَينٌ يُسدَّد كاملاً بسعر البيع بالمعاملة نفسِها: الدرجُ يستلم الدينارَ لأقرب خطوة (قرار ٥)، وما بينه وبين
  -- قيمة الفاتورة (بالدينار الكامل) سِيقُ «فرق صرف» بيومه — لا يضيع ولا يُخترع. ووصلُه صفٌّ بـusd_settlements كأيّ تسديد.
  if v_paid and v_tusd > 0 then
-- -0283     perform settle_invoice_usd(v_inv.id, v_tusd, v_ctx.rate * 100, v_method, v_tusd, null, null);
    perform settle_invoice_usd(v_inv.id, v_pusd, v_ctx.rate * 100, v_method, v_tusd, null, null);   -- +0283
    select * into v_inv from invoices where id = v_inv.id;
  end if;
  return v_inv;
end $$;

revoke all on function public.usd_checkout(jsonb, jsonb) from public, anon;
grant execute on function public.usd_checkout(jsonb, jsonb) to authenticated;

-- ── ٢) فاتورةٌ بمجموعين: فاتورتان بمعاملةٍ واحدة ومرجعٍ واحد ──────────────────────────────────────────
create or replace function public.mixed_checkout(p_iqd jsonb, p_usd jsonb, p_meta jsonb default '{}'::jsonb, p_charges uuid[] default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_meta   jsonb := coalesce(p_meta, '{}'::jsonb);
  v_ref    text := nullif(btrim(coalesce(p_meta, '{}'::jsonb)->>'client_ref'), '');
  v_uref   text;
  v_a      invoices;
  v_b      invoices;
  v_dose   boolean := p_charges is not null and cardinality(p_charges) > 0;
  v_iqd    jsonb := coalesce(p_iqd, '[]'::jsonb);
  v_imeta  jsonb;
  v_umeta  jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if v_ref is null then
    raise exception 'mixed_ref' using hint = 'البيعة تحتاج مرجع — حدّث الصفحة وعيد البيع.';
  end if;
  if jsonb_typeof(v_iqd) <> 'array' or jsonb_typeof(coalesce(p_usd, 'null'::jsonb)) <> 'array' then
    raise exception 'mixed_shape' using hint = 'سطور البيعة مو بالشكل المتوقّع — حدّث الصفحة وعيد البيع.';
  end if;
  if jsonb_array_length(p_usd) = 0 then
    raise exception 'mixed_no_usd' using hint = 'ماكو سطر بالدولار — هاي بيعة دينار عادية. حدّث الصفحة.';
  end if;
  if coalesce(v_meta->>'sale_kind', 'retail') = 'wholesale' then
    raise exception 'mixed_wholesale' using hint = 'الجملة بالدينار وحده — رجّع سطور الدولار للدينار.';
  end if;
  v_uref := v_ref || '~usd';
  -- فاتورةُ الدينار: البيعةُ كما هي بلا مفاتيح الدولار. وفاتورةُ الدولار: الزبونُ والملاحظةُ نفسُهما، ومرجعُها مرجعُ البيعة ~usd.
  v_imeta := v_meta - 'fx_rate_id' - 'discount_usd' - 'paid_usd' - 'usd_method' - 'partial_ok';
  v_umeta := jsonb_strip_nulls(jsonb_build_object(
    'client_ref', v_uref, 'fx_rate_id', v_meta->>'fx_rate_id',
    'customer_name', v_meta->>'customer_name', 'customer_phone', v_meta->>'customer_phone', 'pet_name', v_meta->>'pet_name',
    'staff_id', v_meta->>'staff_id', 'notes', v_meta->>'notes', 'sale_kind', v_meta->>'sale_kind', 'sale_at', v_meta->>'sale_at',
    'payment_method', coalesce(nullif(v_meta->>'usd_method', ''), 'cash'),
    'discount_usd', v_meta->>'discount_usd', 'paid_usd', v_meta->>'paid_usd', 'partial_ok', true));

  -- إعادةٌ بالمرجع: الفاتورتان كما ثبتتا. وبجرعاتٍ تمرّ فاتورةُ الدينار من بابها — جرعةٌ نزلت بعد محاولةٍ مجهولة المصير
  -- تُقال (dose_charge_late) بدل «انباعت» وهي معلَّقة.
  select * into v_a from invoices where clinic_id = v_clinic and client_ref = v_ref;
  select * into v_b from invoices where clinic_id = v_clinic and client_ref = v_uref;
  if v_a.id is not null or v_b.id is not null then
    if v_a.id is not null and v_dose then
      v_a := retail_checkout_doses(v_iqd, v_imeta, p_charges);
    end if;
    return jsonb_build_object('iqd', case when v_a.id is not null then to_jsonb(v_a) end,
                              'usd', case when v_b.id is not null then to_jsonb(v_b) end);
  end if;

  -- الدينارُ أوّلاً ثمّ الدولار، بالمعاملة نفسِها: رفضُ الدولار (سعرُ صرفٍ تغيّر، دفعةٌ أكبر من المجموع…) يُرجع الدينارَ معه.
  if jsonb_array_length(v_iqd) > 0 then
    if v_dose then v_a := retail_checkout_doses(v_iqd, v_imeta, p_charges);
    else v_a := retail_checkout(v_iqd, v_imeta); end if;
  elsif v_dose then
    raise exception 'mixed_shape' using hint = 'جرعات الطبلة بالدينار — رجّعها للسلّة وعيد البيع.';
  end if;
  v_b := usd_checkout(p_usd, v_umeta);
  return jsonb_build_object('iqd', case when v_a.id is not null then to_jsonb(v_a) end, 'usd', to_jsonb(v_b));
end $$;
revoke all on function public.mixed_checkout(jsonb, jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.mixed_checkout(jsonb, jsonb, jsonb, uuid[]) to authenticated;

-- ── ٣) سؤالُ الواجهة ──────────────────────────────────────────────────────────────────────────────
create or replace function public.mixed_checkout_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select to_regprocedure('public.mixed_checkout(jsonb,jsonb,jsonb,uuid[])') is not null
$$;
revoke all on function public.mixed_checkout_ready() from public, anon;
grant execute on function public.mixed_checkout_ready() to authenticated;
