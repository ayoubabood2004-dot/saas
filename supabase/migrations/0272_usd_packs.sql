-- ============================================================================
-- ٠٢٧٢ — الكارتونُ لمادّة الدولار: سعرُه بالدولار، ويُباع ببيع الدولار بعلبه — وثغرةُ تعديل الطلب تُغلق بالخادم
--
-- طلبُ المالك (١٥/١١): «لمن نسوّي سعر الدولار ونفعّل سعر الكارتونة يضل سعر الكارتونة يقرا بالدينار». وقرارُه (١٦/١١): سعرُ كارتون
-- الدولار **يحسبه السستم** (سعرُ العلبة بالدولار × العدد) ويُغيَّر. الخطّة: docs/usd-phase2-plan.md (وم١: docs/usd-plan.md).
--
-- ── المادّة ─────────────────────────────────────────────────────────────────────────────────────────
-- أسعارُ الكارتون (packs[].sell_price/purchase_price، 0259) **بعملة المادّة**: لمادّة الدولار بالدولار، وفارغُها محسوبٌ من سعر العلبة
-- بالدولار × العدد. فقيدُ products_usd_ok يُرخى عن الكراتين وحدها (الوزنُ والوحدةُ الفرعيةُ والحوضُ ممنوعةٌ كما كانت).
-- وتبديلُ عملة المادّة وأسعارُ كارتونها **مكتوبةٌ** بالعملة القديمة كما هي ⇒ يُرفض (`pack_price_currency`): ١٨٬٠٠٠ دينار تُقرأ
-- ١٨٬٠٠٠$ بصمت. الشاشةُ تمسحها عند التبديل (تصير تلقائية)، وجهازٌ ما تحدّث يُرفض بجملة. (محفّزٌ invoker على `authenticated` وحده
-- كعُرف 0162 — دوالُّ المالك تمرّ.)
--
-- ── البيع: usd_checkout يعرف سطرَ الكارتون ──────────────────────────────────────────────────────────────
-- سطرٌ {product_id, qty, unit_price_usd, pack_id, pack_per}: الكارتونُ محفوظٌ على المادّة بعدده كما رآه الجهاز (وإلا pack_changed —
-- شاشةٌ بائتة)، وstock_qty = qty × per، وunit_label اسمُه، وكلفتُه سعرُ شراء العلبة بالدولار × per × سعر اليوم. والتكرارُ بمفتاح
-- (المادّة:العدد) لا المادّة: علبةٌ وكارتونٌ من المادّة نفسِها سطران؛ والختمُ بعد retail_checkout بالمفتاح نفسِه (المادّةُ وحدها كانت
-- ستختم الكارتونَ بكلفة العلبة). retail_checkout يعرف الكارتونَ المحفوظ أصلاً (0267: _product_line_cost) فيخصم علبَه.
-- `usd_pack_sale_ready()`: جسمُ usd_checkout الحيّ يعرف الكارتون (بشِفرته) — الشاشةُ بلا «نعم» لا تُرسل سطرَ كارتون (جسمُ 0264 كان
-- سيبيعه علبةً بسعر كارتون).
--
-- ── ثغرةُ تعديل الطلب (جردُ ١٦/١١) ─────────────────────────────────────────────────────────────────────
-- بابُ أسطر الفاتورة (0264) يرفض مادّةَ الدولار بفاتورة دينار **جديدة** ويُمرّرها لقائمة — لأن edit_invoice_lines يحذف السطورَ ويعيدها،
-- ومادّةٌ حُوّلت للدولار بعد بيعها كانت ستقفل تعديلَ بيعتها. فمرّ معها كلُّ إدراجٍ جديد: تعديلُ طلب توصيل أضاف مادّةَ دولارٍ بسعر دينارها
-- (صفرٌ لمادّةٍ أُنشئت بالدولار). الآن: حذفُ سطرِ مادّة دولار من فاتورة دينار يُسجَّل بالمعاملة (`doctorvet.usd_relines`، محلّيٌّ لها)،
-- والإدراجُ بفاتورةٍ قائمة يمرّ لما حُذف منها وحده.
--
-- ── الحارسُ قبل أيّ تعريف ──────────────────────────────────────────────────────────────────────────
-- usd_checkout وinvoice_items_usd_door نصُّ 0264 حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0272`، وحارسُ الانجراف على بصمة شِفرة 0264 قبل
-- التعريف (`_drift_assert`، 0252) — قاعدةٌ نسختُها غيرُ نسخة المستودع ترفض الهجرةَ بـdrift_body بدل أن تُدهس.
--
-- تُطبَّق بعد 0264 و0267 **وقبل الواجهة**. إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: أعد تعريفَ الدالّتين حرفاً من 0264 (والصلاحياتُ كما
-- هنا) — فيقول usd_pack_sale_ready «لا» والشاشةُ تقف عن بيع كارتون الدولار؛ وما بيع قبل التراجع محفوظٌ بسطره. والقيدُ يبقى مرخًى.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه، ثمّ الحارس — قبل أيّ تعريف ───────────────────────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
  if to_regprocedure('public.usd_checkout(jsonb,jsonb)') is null then
    raise exception 'needs_0264' using hint = 'طبّق 0264 (الدولار) قبل هالهجرة';
  end if;
  if to_regprocedure('public.pack_sale_ready()') is null then
    raise exception 'needs_0267' using hint = 'طبّق 0267 (البيع بالكارتون) قبل هالهجرة — كلفةُ سطر الكارتون منها';
  end if;
end $$;
select public._drift_assert('public.usd_checkout(jsonb,jsonb)', '16258ce535a18f244a32974a05c5238e', '-- +0272');
select public._drift_assert('public.invoice_items_usd_door()', '9f1cc7cefe6591fee974a2b79d02cac2', '-- +0272');

-- ── ١) المادّة: الكراتين مسموحةٌ للدولار، والوزنُ والوحدةُ الفرعيةُ والحوضُ كما كانت ─────────────────────
alter table public.products drop constraint if exists products_usd_ok;
alter table public.products add constraint products_usd_ok check (
  price_currency in ('IQD', 'USD')
  and (sell_price_usd is null or sell_price_usd >= 0)
  and (purchase_price_usd is null or purchase_price_usd >= 0)
  and (price_currency = 'IQD' or (
        not coalesce(sold_by_weight, false) and not coalesce(has_sub_unit, false) and not coalesce(pooled, false))));

-- ── ٢) تبديلُ العملة لا يقلب أسعارَ الكارتون المكتوبة ─────────────────────────────────────────────────────
-- كارتونٌ سعرُه مكتوبٌ (بيعاً أو شراءً) ولم يتغيّر بالتحديث نفسِه والعملةُ تبدّلت ⇒ رفض. الفارغُ محسوبٌ فيتبع العملةَ الجديدة وحده.
create or replace function public.products_pack_currency_guard() returns trigger
language plpgsql set search_path = public as $$
declare v_name text;
begin
  if current_user <> 'authenticated' then return new; end if;
  if new.price_currency is not distinct from old.price_currency then return new; end if;
  if jsonb_typeof(new.packs) <> 'array' or jsonb_typeof(old.packs) <> 'array' then return new; end if;
  select n.value->>'name' into v_name
    from jsonb_array_elements(new.packs) n
    join jsonb_array_elements(old.packs) o on o.value->>'id' = n.value->>'id'
   where (n.value->>'sell_price' is not null and n.value->>'sell_price' = o.value->>'sell_price')
      or (n.value->>'purchase_price' is not null and n.value->>'purchase_price' = o.value->>'purchase_price')
   limit 1;
  if v_name is not null then
    raise exception 'pack_price_currency' using errcode = 'P0001',
      hint = 'سعر «' || v_name || '» مكتوب بالعملة القديمة — امسحه (يصير تلقائي) أو اكتبه بالعملة الجديدة، وبعدين بدّل العملة.';
  end if;
  return new;
end $$;
revoke all on function public.products_pack_currency_guard() from public, anon, authenticated;
drop trigger if exists products_pack_currency_guard on public.products;
create trigger products_pack_currency_guard before update of price_currency, packs on public.products
  for each row execute function public.products_pack_currency_guard();

-- ── ٣) البيعُ بالدولار يعرف الكارتون ─────────────────────────────────────────────────────────────────
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
    if p.price_currency <> 'USD' then
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
    v_uusd := round(coalesce(nullif(it->>'unit_price_usd', '')::numeric,   -- +0272
                             coalesce((v_pack->>'sell_price')::numeric, p.sell_price_usd * v_per)), 2);   -- +0272
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
      'product_id', p.id, 'name', p.name, 'barcode', p.barcode, 'qty', v_qty, 'stock_qty', v_qty * v_per, 'unit_label', v_pack->>'name',   -- +0272
      'unit_price', v_uiqd, 'unit_cost', 0, 'service_id', null);
    -- كلفةُ الدولار (آخرُ سعر شراءٍ بالدولار) × سعر يوم البيع؛ وبلاها تبقى كلفةُ الخادم التي حسبتها retail_checkout
    -- (stock_unit_cost، 0255) — صفرٌ هنا كان يبيع مادّةً محوّلةً معروفةَ الكلفة بربحٍ كامل.
-- -0272     v_costs := v_costs || jsonb_build_object(p.id::text, jsonb_build_object(
    v_costs := v_costs || jsonb_build_object(v_key, jsonb_build_object(   -- +0272
-- -0272       'usd', v_uusd, 'cost_usd', p.purchase_price_usd,
      'usd', v_uusd, 'cost_usd', p.purchase_price_usd * v_per,   -- +0272
-- -0272       'cost_iqd', case when p.purchase_price_usd is not null then round(p.purchase_price_usd * v_ctx.rate, 2) end));
      'cost_iqd', case when p.purchase_price_usd is not null then round(p.purchase_price_usd * v_per * v_ctx.rate, 2) end));   -- +0272
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
                  ii.product_id::text || ':' || coalesce(round(ii.stock_qty / nullif(ii.qty, 0))::integer, 1) as k   -- +0272
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
    perform settle_invoice_usd(v_inv.id, v_tusd, v_ctx.rate * 100, v_method, v_tusd, null, null);
    select * into v_inv from invoices where id = v_inv.id;
  end if;
  return v_inv;
end $$;
revoke all on function public.usd_checkout(jsonb, jsonb) from public, anon;
grant execute on function public.usd_checkout(jsonb, jsonb) to authenticated;

-- سؤالُ الواجهة: الجسمُ الحيّ يعرف سطرَ الكارتون؟ (بشِفرته لا بتعليقه — أداةٌ تحذف التعليقات طُبّقت بها هجراتٌ قديمة.)
create or replace function public.usd_pack_sale_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from pg_proc p
                  where p.oid = to_regprocedure('public.usd_checkout(jsonb,jsonb)')
                    and position('pack_per' in p.prosrc) > 0
                    and position('v_qty * v_per' in p.prosrc) > 0)
$$;
revoke all on function public.usd_pack_sale_ready() from public, anon;
grant execute on function public.usd_pack_sale_ready() to authenticated;

-- ── ٤) بابُ أسطر الفاتورة: إعادةُ ما حُذف وحدها ──────────────────────────────────────────────────────
create or replace function public.invoice_items_usd_door() returns trigger
language plpgsql set search_path = public as $$
declare v_cur text; v_old text; v_pc text; v_new boolean;
begin
  if _usd_door_open() then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    -- حذفُ سطرٍ من فاتورة دولار مباشرةً (المديرُ يملك invoice_items_write) كان يُنقص الفاتورةَ بلا رصيدٍ ولا دولار.
    if (select currency from invoices where id = old.invoice_id) = 'USD' then
      raise exception 'usd_door' using errcode = 'P0001', hint = 'أسطرُ فاتورة الدولار تنحذف مع فاتورتها من «حذف فاتورة الدولار».';
    end if;
    -- 0272: سطرُ مادّة دولارٍ يُحذف من فاتورة دينار (edit_invoice_lines يحذف السطورَ كلَّها ويعيدها) يُسجَّل بالمعاملة: إعادتُه تمرّ   -- +0272
    -- وحدها. كان الإدراجُ بفاتورةٍ قائمة يمرّ لأيّ مادّة — فتعديلُ طلب توصيل أضاف مادّةَ دولارٍ جديدة بسعر دينارها (صفر).   -- +0272
    if old.product_id is not null and (select price_currency from products where id = old.product_id) = 'USD' then   -- +0272
      perform set_config('doctorvet.usd_relines',   -- +0272
        coalesce(current_setting('doctorvet.usd_relines', true), '') || old.invoice_id::text || ':' || old.product_id::text || ',', true);   -- +0272
    end if;   -- +0272
    return old;
  end if;
  select currency, coalesce(recorded_at, created_at) >= now() into v_cur, v_new from invoices where id = new.invoice_id;
  if tg_op = 'INSERT' then
    if v_cur = 'USD' then
      raise exception 'usd_door' using errcode = 'P0001', hint = 'أسطرُ فاتورة الدولار تنكتب من بيع الدولار وحده.';
    end if;
    -- مادّةُ الدولار بفاتورة دينار **جديدة** (بيعٌ من جهازٍ بسعرٍ قديم) تُرفض. أمّا فاتورةٌ قائمة قبل هذه المعاملة (تعديلُ
    -- سطورها يحذفها ويعيدها — edit_invoice_lines) فتمرّ: مادّةٌ حُوّلت للدولار بعد بيعها كانت تقفل تعديلَ طلب توصيلٍ مفتوح
    -- وبيعتِها القديمة بـ«حدّث الصفحة» والتحديثُ لا يصلحها. والجديدةُ = أُدرجت بهذه المعاملة (created_at أو recorded_at = now()).
-- -0272     if new.product_id is not null and coalesce(v_new, true) then
    if new.product_id is not null   -- +0272
       and (coalesce(v_new, true)   -- +0272
            or position(new.invoice_id::text || ':' || new.product_id::text || ',' in coalesce(current_setting('doctorvet.usd_relines', true), '')) = 0) then   -- +0272
      select price_currency into v_pc from products where id = new.product_id;
      if v_pc = 'USD' then
        raise exception 'usd_product_in_iqd' using errcode = 'P0001',
          hint = '«' || coalesce(new.name, '') || '» سعرها بالدولار — تنباع ببيع الدولار، مو بفاتورة دينار. حدّث الصفحة.';
      end if;
    end if;
    return new;
  end if;
  -- UPDATE: إعادةُ ربط السطر بمادّة (الدمج، 0144) مسموحة؛ المالُ على فاتورة دولار لا، ولا نقلُ سطرٍ منها أو إليها.
  select currency into v_old from invoices where id = old.invoice_id;
  if (v_cur = 'USD' or v_old = 'USD')
     and (new.invoice_id, new.qty, new.unit_price, new.unit_cost, new.line_total, new.unit_price_usd, new.unit_cost_usd)
         is distinct from (old.invoice_id, old.qty, old.unit_price, old.unit_cost, old.line_total, old.unit_price_usd, old.unit_cost_usd) then
    raise exception 'usd_door' using errcode = 'P0001', hint = 'أسطرُ فاتورة الدولار ما تتعدّل بالمرحلة الأولى.';
  end if;
  return new;
end $$;
revoke all on function public.invoice_items_usd_door() from public, anon, authenticated;
-- المحفّزُ نفسُه كما بـ0264 (create or replace للدالّة يكفي؛ الإعادةُ هنا تجعل الهجرةَ تامّةً وحدها).
drop trigger if exists invoice_items_usd_door on public.invoice_items;
create trigger invoice_items_usd_door before insert or update or delete on public.invoice_items
  for each row execute function public.invoice_items_usd_door();

reset lock_timeout;
