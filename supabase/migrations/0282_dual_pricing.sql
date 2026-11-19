-- ============================================================================
-- ٠٢٨٢ — المادّةُ بسعرين (دينار ودولار)، والسطرُ يختار عملتَه بشاشة البيع، والفاتورةُ بالدينار بسعر صرف اليوم
--
-- بلاغُ المالك (١٩/١١): «لمن أفعّل وحدات فرعية وأني مفعّل سعر الدولار يكلي السعر ما يتناسب مع الوحدات الفرعية» — ثمّ: «أريد الدكتور
-- يسعّر المنتج بالرقمين ويبيع بالرقمين». وقراراتُه بسؤال:
--   • سعرُ الوحدة الفرعية بالدولار **يحسبه السستم ويتغيّر** (سعرُ العلبة بالدولار ÷ عددها، ويُكتب بيد الدكتور إن أراد).
--   • الدكتورُ يكتب للمادّة سعراً بالدينار وسعراً بالدولار، وبشاشة البيع **يختار لكلّ سطر** (كارتونٌ بالدولار وعلبٌ بالدينار من المادّة
--     نفسِها مثلاً)، و**الفاتورةُ تصدر بالدينار** — سطرُ الدولار يُحوَّل بسعر صرف اليوم ويُذكر سعرُه بالدولار والسعرُ داخل الفاتورة.
--   • سطرٌ بالدولار **لمادّةٍ لها السعران وحدها** — لا تحويلَ تلقائيّ لمادّةٍ بلا سعر دولار.
--   • المادّةُ «بالدولار وحده» (0264) تبقى كما هي — بيعُ الدولار ودَينُه بالدولار — والدكتورُ يضيف لها ديناراً إن أراد.
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- 0264 جعل عملةَ المادّة **إمّا** ديناراً **أو** دولاراً: مادّةُ الدولار تُخفي سعرَ الدينار وتُباع ببيع الدولار وحده (دَينٌ بالدولار)،
-- وممنوعٌ عليها الوزنُ والوحدةُ الفرعيةُ والحوض (`products_usd_ok` — «المرحلة الأولى»). فعيادةٌ تريد علبةً بعشر لترات بسعر دولار
-- تصطدم بالقيد، ولا تقدر تبيع المادّةَ نفسَها مرّةً بالدينار ومرّةً بالدولار.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- • **المادّةُ بسعرين** = `price_currency = 'IQD'` (فكلُّ آلة الدينار تعمل: الوحدةُ الفرعية، الكراتين، الحوض، المتوسّط، المتجر) و
--   `sell_price_usd` ليس فارغاً. لا قيدَ جديد: `products_usd_ok` يمنع على مادّة **الدولار وحده** وحدها.
--   – `products.sub_unit_price_usd`: سعرُ الوحدة الفرعية بالدولار؛ **الفارغُ = سعرُ العلبة بالدولار ÷ عددها** (بمنزلتين) — بلا NOT NULL
--     (الاسترجاعُ يقرأ لقطاتٍ قديمة بـjsonb_populate_record، درسُ 0259).
--   – سعرُ الكارتون بالدولار مفتاحٌ بخانته (`packs[].sell_price_usd`)، والفارغُ = سعرُ العلبة بالدولار × عددها.
-- • `retail_checkout_fx(items, meta, charges)` — البابُ الواحد لبيعةٍ فيها سطرُ دولار (definer):
--   – بلا سطر دولار ⇒ `retail_checkout` (أو `retail_checkout_doses` بجرعات) **كما هو حرفاً** — لا مسَّ للبيعة اليومية.
--   – سطرُ الدولار (`price_currency: 'USD'`، `unit_price_usd`): مادّةٌ من المخزن بالسعرين، لا بالوزن، بيعٌ لا راجع، والعيادةُ مفعّلة
--     وسعرُها اليوم **هو الذي رآه الجهاز** (`fx_rate_id` ⇒ `usd_rate_changed`)، ولا تاريخٌ سابق (سعرُ ذاك اليوم غير معروف).
--   – **الخادمُ يحسب الدينار**: سعرُ الوحدة = `_usd_iqd(usd, rate, 1)` (دينارٌ كامل، كبيع الدولار 0264) — والجهازُ يرسل ما حسبه بالمرآة
--     نفسِها (`iqdOf`) فيُطابَق، وغيرُ المطابق يُرفض (`dual_price_mismatch`) لا يُبدَّل بصمت: المجموعُ والدفعُ بالجهاز بنيا عليه.
--   – ثمّ `retail_checkout` بالسطور الدينارية كما هي (الكلفةُ والمخزنُ والاستهلاكُ والدَّينُ بالدينار — الدفترُ واحد)، وبالمعاملة
--     نفسِها يُختم `unit_price_usd` على سطر الدولار و`fx_rate` على الفاتورة — **وعملتُها دينار**: قارئو فاتورة الدولار (0264) لا يرونها.
--   – الختمُ بالمادّة والكمية والسعر والوحدة: سطرٌ لكلّ (مادّة، مستوى) بالسلّة فلا لبس؛ وما لم يُختم يُسقط البيعةَ كلَّها (`dual_stamp`).
--   – الإعادةُ بالمرجع ترجع الفاتورةَ كما ثبتت (قبل كلّ شيء، وبعد retail_checkout إن سبقته إعادةٌ متزامنة).
-- • `dual_pricing_ready()` — الواجهةُ تسألها قبل أن تعرض «$» على السطر (قاعدةٌ قبلها ⇒ لا خيار، لا «تعذّر»).
--
-- حدودٌ معلنة: تعديلُ أسطر الفاتورة بعد البيع (edit_invoice_lines) يعيد كتابتَها بالدينار فيسقط عنها ختمُ الدولار (المبلغُ كما هو)؛
-- والمرتجعُ عليها بالدينار. والوزنُ بالدولار غيرُ مدعوم.
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق قبل الواجهة — والواجهةُ قبلها لا تعرض خيارَ الدولار على السطر ولا سعرَ الوحدة الفرعية بالدولار.
-- تراجع: drop function retail_checkout_fx(jsonb, jsonb, uuid[]); drop function dual_pricing_ready(); (العمودُ يبقى — فارغٌ = محسوب).
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._usd_ctx(uuid)') is null
     or to_regprocedure('public.retail_checkout_doses(jsonb,jsonb,uuid[])') is null then
    raise exception 'needs_0269' using hint = 'طبّق 0264 (الدولار) و0269 (الجرعات) قبل هالهجرة';
  end if;
end $$;

-- **مرّةً واحدة، أوّلَ تطبيق** (العمودُ غائب): مادّةٌ حُوّلت من «الدولار وحده» للدينار بقي عليها سعرُ دولارها القديم (`usdPatch` قبل 0282
-- كان يرسل العملةَ وحدها) — سعرٌ ما كان يُقرأ، وصار يعني «بسعرين». يُمسح سعرُ البيع بالدولار عن موادّ الدينار مرّةً، فلا تصير مادّةٌ
-- «بسعرين» بلا قرار. (سعرُ الشراء بالدولار يبقى: آخرُ شراءٍ بالدولار 0274 يكتبه بحقّ.) والإعادةُ لا تمسّ شيئاً: العمودُ موجود.
do $$
begin
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'products' and column_name = 'sub_unit_price_usd') then
    update public.products set sell_price_usd = null
     where coalesce(price_currency, 'IQD') = 'IQD' and sell_price_usd is not null;
  end if;
end $$;
alter table public.products add column if not exists sub_unit_price_usd numeric(14,2);
alter table public.products drop constraint if exists products_sub_usd_ok;
alter table public.products add constraint products_sub_usd_ok check (sub_unit_price_usd is null or sub_unit_price_usd >= 0);

create or replace function public.dual_pricing_ready() returns boolean
language sql stable set search_path = public as $$ select true $$;
revoke all on function public.dual_pricing_ready() from public, anon;
grant execute on function public.dual_pricing_ready() to authenticated;

create or replace function public.retail_checkout_fx(p_items jsonb, p_meta jsonb default '{}'::jsonb, p_charges uuid[] default null)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_ref    text := nullif(btrim(coalesce(p_meta, '{}'::jsonb)->>'client_ref'), '');
  v_ctx    record;
  v_inv    invoices;
  v_items  jsonb := '[]'::jsonb;
  v_marks  jsonb := '[]'::jsonb;
  it       jsonb;
  m        jsonb;
  p        products;
  v_qty    numeric;
  v_usd    numeric;
  v_iqd    numeric;
  v_dose   boolean := p_charges is not null and cardinality(p_charges) > 0;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;

  -- بلا سطر دولار: البيعةُ كما هي حرفاً.
  if not exists (select 1 from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) e
                  where upper(coalesce(e->>'price_currency', 'IQD')) = 'USD') then
    if v_dose then return retail_checkout_doses(p_items, p_meta, p_charges); end if;
    return retail_checkout(p_items, p_meta);
  end if;

  -- إعادةٌ بالمرجع: الفاتورةُ كما ثبتت (بختمها) — لا حسابَ ثانٍ ولا ختمٌ ثانٍ.
  if v_ref is not null then
    select * into v_inv from invoices where clinic_id = v_clinic and client_ref = v_ref;
    if found then return v_inv; end if;
  end if;

  select * into v_ctx from _usd_ctx(v_clinic);
  if not v_ctx.enabled then raise exception 'usd_disabled' using hint = 'الدولار مو مفعّل بهالعيادة — بيع السطر بالدينار، أو فعّله من الإعدادات.'; end if;
  if nullif(btrim(coalesce(p_meta, '{}'::jsonb)->>'sale_at'), '') is not null then
    raise exception 'usd_backdate' using hint = 'بيعةٌ بيومٍ سابق ما بيها سطر بالدولار — سعرُ صرف ذاك اليوم غير معروف. بيعها بالدينار.';
  end if;
  if v_ctx.rate_id is null then
    raise exception 'usd_no_rate' using hint = 'حدّد سعرَ الدولار اليوم أوّلاً (الإعدادات › الدولار).';
  end if;
  if nullif(p_meta->>'fx_rate_id', '') is distinct from v_ctx.rate_id::text then
    raise exception 'usd_rate_changed' using hint = 'سعرُ الدولار تغيّر — حدّث وشوف المجموع الجديد قبل البيع.';
  end if;

  for it in select value from jsonb_array_elements(p_items) loop
    if upper(coalesce(it->>'price_currency', 'IQD')) <> 'USD' then
      v_items := v_items || jsonb_build_array(it - 'price_currency' - 'unit_price_usd');
      continue;
    end if;
    select * into p from products where id = nullif(it->>'product_id', '')::uuid and clinic_id = v_clinic;
    if not found then
      raise exception 'dual_not_product' using hint = 'سطرُ الدولار لازم يكون مادّة من المخزن — الخدماتُ بالدينار.';
    end if;
    if coalesce(p.price_currency, 'IQD') <> 'IQD' then
      raise exception 'dual_usd_only' using hint = '«' || p.name || '» سعرها بالدولار وحده — تنباع ببيع الدولار. حدّث الصفحة.';
    end if;
    if p.sell_price_usd is null then
      raise exception 'dual_no_usd' using hint = '«' || p.name || '» ما إلها سعر بالدولار — حدّده من المخزون، أو بيعها بالدينار.';
    end if;
    if coalesce(p.sold_by_weight, false) then
      raise exception 'dual_weight' using hint = '«' || p.name || '» تنباع بالوزن — بالدينار وحده.';
    end if;
    v_qty := nullif(it->>'qty', '')::numeric;
    if v_qty is null or v_qty <= 0 then
      raise exception 'dual_qty' using hint = 'سطرُ «' || p.name || '» بالدولار لازم يكون بيع — الراجعُ بالدينار.';
    end if;
    v_usd := round(nullif(it->>'unit_price_usd', '')::numeric, 2);
    if v_usd is null or v_usd < 0 then
      raise exception 'dual_no_price' using hint = 'سطرُ «' || p.name || '» بالدولار بلا سعر — حدّث الصفحة.';
    end if;
    v_iqd := _usd_iqd(v_usd, v_ctx.rate, 1);
    if nullif(it->>'unit_price', '')::numeric is distinct from v_iqd then
      raise exception 'dual_price_mismatch'
        using hint = 'سعرُ «' || p.name || '» بالدينار ما يطابق ' || v_usd || '$ بسعر اليوم (' || v_iqd || ') — حدّث الصفحة وعيد البيع.';
    end if;
    v_items := v_items || jsonb_build_array(it - 'price_currency' - 'unit_price_usd');
    v_marks := v_marks || jsonb_build_array(jsonb_build_object(
      'product_id', p.id, 'qty', v_qty, 'unit_price', v_iqd, 'unit_label', nullif(it->>'unit_label', ''), 'usd', v_usd, 'name', p.name));
  end loop;

  if v_dose then v_inv := retail_checkout_doses(v_items, p_meta, p_charges);
  else v_inv := retail_checkout(v_items, p_meta); end if;
  -- إعادةٌ متزامنة سبقتنا وختمت: فاتورتُها كما هي.
  if v_inv.fx_rate is not null then return v_inv; end if;

  for m in select value from jsonb_array_elements(v_marks) loop
    update invoice_items set unit_price_usd = (m->>'usd')::numeric
     where ctid = (select ii.ctid from invoice_items ii
                    where ii.invoice_id = v_inv.id and ii.clinic_id = v_clinic
                      and ii.product_id = (m->>'product_id')::uuid
                      and ii.qty = (m->>'qty')::numeric
                      and ii.unit_price = (m->>'unit_price')::numeric
                      and coalesce(ii.unit_label, '') = coalesce(m->>'unit_label', '')
                      and ii.unit_price_usd is null
                    limit 1);
    if not found then
      raise exception 'dual_stamp' using hint = 'ما انختم سعر الدولار على «' || (m->>'name') || '» — ما انحفظ شي، جرّب مرّة ثانية.';
    end if;
  end loop;
  update invoices set fx_rate = v_ctx.rate where id = v_inv.id and clinic_id = v_clinic returning * into v_inv;
  return v_inv;
end $$;
revoke all on function public.retail_checkout_fx(jsonb, jsonb, uuid[]) from public, anon;
grant execute on function public.retail_checkout_fx(jsonb, jsonb, uuid[]) to authenticated;
