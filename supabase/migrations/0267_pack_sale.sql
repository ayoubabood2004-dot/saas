-- ============================================================================
-- ٠٢٦٧ — البيعُ بالكارتون: كلفةُ سطر الكارتون، والبحثُ برمز أيّ مستوى
--
-- بلاغُ المالك (١٢/١١): «دكتور كلّي باركود الكارتون ما ينمسح بقارئ الباركود». مقيسٌ بالمتصفّح: الكارتونُ معرَّفٌ على مادّته
-- (0259، م١)، ومسحُه بشاشة البيع يقول «الباركود … مو موجود بمخزنك — إذا المادّة عندك أضفها من المخزون» — والمادّةُ موجودة،
-- والإضافةُ يرفضها حارسُ المستويات (الرمزُ لكارتونها). م١ علّمت المخزنَ الكارتونَ ووقفت قبل البيع (الخطّة §٧ م٣).
--
-- ── ما يحتاجه الخادمُ ليبيع كارتوناً — سطرٌ واحد ─────────────────────────────
-- سطرُ الكارتون كما ترسله الشاشة: qty = عددُ الكراتين، unit_price = سعرُ الكارتون، stock_qty = العددُ × علبُ الكارتون، وunit_label
-- اسمُه. والبيعةُ (retail_checkout 0255) تنقص الرصيدَ بـstock_qty كما تفعل للمفرد اليوم، والمرتجعُ على الفاتورة يردّ بنسبة
-- stock_qty ÷ qty (return_invoice_items 0253)، والحذفُ يردّ stock_qty، وتعديلُ الفاتورة (DeliveryEditDialog) يحفظ النسبة —
-- كلُّها تعرف الكارتون بلا سطرٍ جديد. **الكلفةُ وحدها لا تعرفه**: `_product_line_cost` ترى |stock_qty| ≠ |qty| فتقول «مفرد» لمادّةٍ
-- لها وحدةٌ صغرى (المتوسّط ÷ عددها) أو «علبة» لغيرها (المتوسّط) — كارتونٌ بـ٢٤ علبة يُكلَّف علبةً واحدةً أو أقلّ، والربحُ يُنفخ
-- بكلفة ٢٣ علبة على كلّ كارتون. فالفرعُ الجديد قبلهما: سطرٌ **يطابق كارتوناً محفوظاً على المادّة** (|stock_qty| = per × |qty|
-- بثلاث منازل، كما تُحفظ الكميتان) كلفتُه round(stock_unit_cost × per, 2) — كلفةُ ما خرج من الرفّ فعلاً (الخطّة §٦). والكارتونُ من
-- الصفّ المحفوظ لا من رقمٍ يرسله الجهاز: سطرٌ أكبرُ من كميته لا يطابق كارتوناً (حُذف أو تبدّل عددُه بعد ما نزل بشاشةٍ بائتة) يُرفض
-- `pack_changed` بجملته — فرعا 0255 كانا سيكلّفانه علبةً أو مفرداً (مراجعةٌ عدائيّة). ولا تداخلَ مع المفرد: stock_qty = الكميةُ ÷ عددِه
-- (أصغرُ منها، وأكبرُ لعددٍ < ١ وحده فيُعفى)، والعلبةُ والكيلو stock_qty = الكمية، والكارتونُ (per ≥ ٢، قيدُ 0259) أكبرُ منها دائماً.
-- وهي نفسُها ما تكلّف به البيعةُ وتعديلُ الفاتورة وحكمُ «كلفتُها صفر» بالبيع قبل الجرد (0266) — نداءٌ واحد يعرف الكارتون للثلاثة.
--
-- ── الواجهةُ تسأل قبل أن تبيع ────────────────────────────────────────────────
-- `pack_sale_ready()`: جسمُ `_product_line_cost` الحيّ يحمل فرعَنا (بشِفرته لا بتعليقه)؟ (نمطُ purchase_discount_ready، 0260): إعادةُ 0255 وحدها بعد
-- هالهجرة تُرجع الجسمَ لنصّها (حارسُها يمرّ) — فكارتونٌ يُباع يُكلَّف علبة. والشاشةُ بلا «نعم» تقول «البيعُ بالكارتون يحتاج تحديث
-- القاعدة» ولا تُنزل سطرَ كارتون.
--
-- ── البحثُ برمز الكارتون أو المغلّف ──────────────────────────────────────────
-- `product_level_by_code(code)`: موادُّ العيادة (بصلاحية المُستدعي — السياساتُ تحصرها) التي يحمل كارتونُها أو مغلّفُها الرمزَ بعد
-- التطبيع (`product_level_codes`، 0259 — نفسُ ما يقرؤه الحارس). للقائمة البائتة وحدها: كارتونٌ عُرّف من جهازٍ آخر بعد ما فُتحت شاشةُ
-- البيع كان يُقال عنه «مو موجود — أضفه» (بابُ التوائم). limit 2 كـproduct_by_code: الثاني إشارةُ التباسٍ لا نتيجة. والحقلُ خارجها.
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- `_product_line_cost` نصُّ 0255 حرفاً وفوقه أسطرٌ معلَّمة بـ`-- +0267`، وحارسُ الانجراف على بصمة شِفرة 0255 (`_drift_assert`،
-- 0252) قبل التعريف — قاعدةٌ نسختُها غيرُ نسخة المستودع ترفض الهجرةَ بـdrift_body بدل أن تُدهس.
--
-- تُطبَّق بعد 0259 و0255 **وقبل الواجهة**. إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تراجع: أعد تعريفَ `_product_line_cost` وحده حرفاً من 0255
-- (والصلاحياتُ كما هنا) — فيقول pack_sale_ready «لا» والشاشةُ تقف عن بيع الكارتون؛ وما بيع قبل التراجع كلفتُه محفوظةٌ بسطره.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه، ثمّ الحارس — قبل أيّ تعريف ───────────────────────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public._product_line_cost(uuid,uuid,numeric,numeric,numeric)') is null then
    raise exception 'needs_0255' using hint = 'طبّق 0252–0255 قبل هالهجرة — حارسُ الانحراف وكلفةُ السطر منها';
  end if;
  if to_regprocedure('public.product_level_codes(public.products)') is null then
    raise exception 'needs_0259' using hint = 'طبّق 0259 (التعبئة) قبل هالهجرة — الكراتينُ ورموزُها منها';
  end if;
end $$;
select public._drift_assert('public._product_line_cost(uuid,uuid,numeric,numeric,numeric)', '9542a0e82e9121fe454a633f3e268dca', '-- +0267');

-- ── ١) كلفةُ السطر تعرف الكارتون ─────────────────────────────────────────────
create or replace function public._product_line_cost(p_clinic uuid, p_product uuid, p_qty numeric, p_stock_qty numeric, p_device numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_p products;
        v_per numeric;   -- +0267
begin
  if p_product is null then return p_device; end if;
  select * into v_p from products where id = p_product and clinic_id = p_clinic;
  if not found or v_p.farm_id is not null then return p_device; end if;
  -- سطرُ كارتون: |stock_qty| = per × |qty| لكارتونٍ محفوظٍ على المادّة ⇒ كلفةُ ما خرج من الرفّ (المتوسّط × per).   -- +0267
  if p_stock_qty is not null and round(coalesce(p_qty, 0), 3) <> 0 and jsonb_typeof(v_p.packs) = 'array' then   -- +0267
    select (k->>'per')::numeric into v_per   -- +0267
      from jsonb_array_elements(v_p.packs) k   -- +0267
     where jsonb_typeof(k->'per') = 'number' and (k->>'per')::numeric >= 2   -- +0267
       and round((k->>'per')::numeric * abs(round(p_qty, 3)), 3) = abs(round(p_stock_qty, 3))   -- +0267
     limit 1;   -- +0267
    if v_per is not null then return round(public.stock_unit_cost(v_p) * v_per, 2); end if;   -- +0267
  end if;   -- +0267
  -- وسطرٌ أكبرُ من كميته لا يطابق كارتوناً محفوظاً: كارتونٌ تبدّل عددُه أو انشال بعد ما نزل بشاشةٍ بائتة. لا علبةَ ولا كيلو بهذا الشكل،   -- +0267
  -- ولا مفرد (stock_qty = الكميةُ ÷ عددِه — أكبرُ منها لعددٍ < ١ وحده، فيُعفى). فرعا 0255 كانا يكلّفانه علبةً أو مفرداً (ربحٌ منفوخ   -- +0267
  -- بكلفة ما بقي من علبه، والرصيدُ ينقص بعددٍ قديم) — فيُرفض بجملته، والشاشةُ تحدّث قائمتَها.   -- +0267
  if p_stock_qty is not null and round(coalesce(p_qty, 0), 3) <> 0 and abs(round(p_stock_qty, 3)) > abs(round(p_qty, 3))   -- +0267
     and not (coalesce(v_p.has_sub_unit, false) and coalesce(v_p.units_per_box, 0) > 0   -- +0267
              and abs(round(p_stock_qty, 3)) * v_p.units_per_box <= abs(round(p_qty, 3)) + v_p.units_per_box * 0.001) then   -- +0267
    raise exception 'pack_changed' using hint = 'الكارتون تغيّر أو انشال من المادة من جهاز ثاني — حدّث القائمة وامسحه من جديد';   -- +0267
  end if;   -- +0267
  if coalesce(v_p.has_sub_unit, false) and coalesce(v_p.units_per_box, 0) > 0
     and p_stock_qty is not null and abs(round(p_stock_qty, 3)) <> abs(round(coalesce(p_qty, 0), 3)) then
    return public._cons_round_div(public.stock_unit_cost(v_p), v_p.units_per_box, 2);
  end if;
  return round(public.stock_unit_cost(v_p), 2);
end $$;
revoke all on function public._product_line_cost(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;

-- ── ٢) سؤالُ الواجهة: الجسمُ الحيّ يعرف الكارتون؟ ─────────────────────────────
-- pg_proc مقروءٌ للجميع: invoker. ويُسأل **عن الشِفرة لا التعليق**: أداةٌ تحذف التعليقات (طُبّقت بها هجراتٌ قديمة — CLAUDE.md،
-- «البصمةُ بصمةُ الشِفرة») كانت ستُطفئ البيعَ بالكارتون للأبد لو سُئلت علامةُ `-- +0267`. وجسمُ 0255 لا يحمل هذا السطر.
create or replace function public.pack_sale_ready() returns boolean
language sql stable security invoker set search_path = public as $$
  select exists (select 1 from pg_proc p
                  where p.oid = to_regprocedure('public._product_line_cost(uuid,uuid,numeric,numeric,numeric)')
                    and position('jsonb_array_elements(v_p.packs)' in p.prosrc) > 0
                    and position('pack_changed' in p.prosrc) > 0)
$$;
revoke all on function public.pack_sale_ready() from public, anon;
grant execute on function public.pack_sale_ready() to authenticated;

-- ── ٣) المادّةُ برمز كارتونها أو مغلّفها ─────────────────────────────────────
create or replace function public.product_level_by_code(p_code text)
returns setof products
language sql stable security invoker set search_path = public as $$
  select p.* from products p
   where p.farm_id is null
     and coalesce(inv_norm_code(p_code), '') <> ''
     and (coalesce(p.sub_codes, '{}') <> '{}' or (jsonb_typeof(p.packs) = 'array' and jsonb_array_length(p.packs) > 0))
     and exists (select 1 from product_level_codes(p) c where c.level <> 'box' and c.norm = inv_norm_code(p_code))
   order by p.created_at asc, p.id
   limit 2
$$;
comment on function public.product_level_by_code(text) is
  'مادّةٌ برمز كارتونها أو مغلّفها (0267) — للقائمة البائتة بشاشة البيع والشراء. بصلاحية المُستدعي، والحقلُ خارجها، '
  'وlimit 2: الثاني إشارةُ التباس. العلبةُ لـproduct_by_code كما كانت.';
revoke all on function public.product_level_by_code(text) from public, anon;
grant execute on function public.product_level_by_code(text) to authenticated;

reset lock_timeout;
