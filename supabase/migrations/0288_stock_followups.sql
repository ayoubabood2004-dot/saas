-- ============================================================================
-- ٠٢٨٨ — ما يُرجَع يصل مادّتَه الحيّة، والدمجُ يأخذ معه ما يتبع المادّة، والجرعةُ المرجَعة ترجع معلَّقة،
--        ومعدّلُ البيع بالعلبة لا بوحدة السطر
--
-- ── الجذر (تدقيق ٢٢/١١ بعشرة مدقّقين، كلُّ بندٍ أكّده مُتحقّقان مستقلّان على الأجسام الحيّة) ───────────────
-- ١) **credit_stock (0122) تحديثٌ عارٍ بالمعرّف**: لا يسأل هل كُتب صفّ، ولا يتبع products_trash.merged_into. فـ«راجع» لمادّةٍ
--    دُمجت بتوأمها (قائمةُ الكاشير أقدمُ من الدمج، أو مرتجعٌ بالطابور رُفع بعده) يكتب سحبَ «مرتجع» من الدرج ويقول «رجع للمخزن»
--    ولا يزيد شيئاً: النقدُ خرج والرفُّ أكثرُ بقطعة. ومادّةٌ بالمحذوفات مثلُها. و_stock_post (0252) وold_debt_return (0273)
--    يتبعان الدمج ويرفضان المحذوف — هذه لا.
-- ٢) **الدمجُ لا يأخذ ما جاء بعد 0255 ولا الجرد المعلَّق**: products_trash_consumption ينقل الوصفاتِ والدفترَ وسنداتِ التلف
--    للأصل، لكنّ ربطَ «سعر الجرعة» (clinic_drugs.product_id، 0269) والجرعاتِ المعلَّقة (dose_charges) وُلدا بعده فبقيا على
--    التوأم المحذوف — فكلُّ جرعةٍ بعد «رتّب المخزن» أو «دمج» تُباع بلا خصم (أو لا تُحسب أصلاً)، والأصلُ أكثرُ من الرفّ بجرعة.
--    وعدُّ الجرد المعلَّق (stock_counts.product_id «on delete set null») يفرغ فتبطله الموافقةُ بصمت: «انعتمد ٠» والعجزُ لا يُطبَّق.
-- ٣) **ترجيعُ فاتورةِ جرعاتٍ أو حذفُها يردّ الدواءَ للرفّ والجرعةُ «انحسبت»**: retail_checkout_doses تختم dose_charges
--    بفاتورتها، ولا شيءَ بالترجيع ولا الحذف يمسّها — فالدواءُ المحقون يرجع رصيداً، والجرعةُ لا تعود معلَّقة فلا تُباع ثانيةً
--    (حذفُ الفاتورة «لأعيدها بالاسم الصحيح» يُسقط الجرعات منها للأبد، والرصيدُ أكثرُ بها).
-- ٤) **معدّلُ البيع (product_sales_rate، 0215) يجمع qty بوحدة السطر**: الحبّةُ والمل والكارتونُ يُعدّون علبةً، والفاتورةُ
--    المرجَعة تُحسب مبيعاً — فاقتراحُ الطلب يطلب ٦٦ علبة عن ٦٠ حبّة، و«ينفد بعد ٥ أيام» عن ١٥٠ يوماً، والكارتونُ لا يُقترح أبداً.
--    pos_product_sales (0279) يجمع stock_qty ويستثني المرجَعة أصلاً — والاثنان كانا يختلفان.
--
-- ── ما تفعله — كلُّ دالّةٍ نصُّ مصدرها حرفاً وفوقه أسطرٌ معلَّمة (`-- +0288` / `-- -0288 …`)، وحارسُ الانحراف قبلها ──
-- أ) credit_stock (0122): يتبع merged_into (حتى ٢٠ قفزة، كـ_stock_post) للأصل الحيّ؛ والمحذوفةُ بلا دمج ترفض باسمها
--    (`return_product_deleted` — «رجّعها من المحذوفات أوّلاً») والمجهولةُ `return_product_gone`. فالراجعُ يُرفض كلُّه قبل أن
--    يُكتب سحبُه، لا يخرج نقدٌ بلا قطعة. والسطرُ السالب بالبيعة كما كان (مفتاحُ السطر الأجنبيّ يرفض المعرّفَ الميّت بصوتٍ أصلاً).
-- ب) products_trash_consumption (0255): ربطُ سعر الجرعة يتبع التوأم، والجرعاتُ المعلَّقة كذلك (ومخصومُها يُعاد حسابُه بمفرد
--    الأصل إن اختلف عددُ مفرداته)، وكلُّ أسطر الجرد (لا سنداتُ التلف وحدها) — ومعلَّقان على المادّتين يُرفض الدمجُ بالاسم كما
--    كان للتلف (الفهرسُ «معلَّقٌ واحد لكلّ مادّة» يجمع الجردَ والسند).
-- ج) جديد: محفّزٌ بعد ترجيع الفاتورة أو حذفها يُرجع جرعاتِها المختومة معلَّقةً (والجرعةُ التي أُلغي إعطاؤها: ملغاة) — فالثابتُ
--    «المخصومُ = المحسوب» يبقى: ردُّ الدواء للرفّ يعني الجرعةُ تنتظر البيعَ من جديد.
-- د) product_sales_rate (0215): الصافي بوحدة الرصيد (stock_qty، والسطرُ القديمُ بلا عمود: qty)، والمرجَعةُ خارجه.
--
-- تُطبَّق بعد 0287 (وكلُّ المصادر قبلها)، وقبل الواجهة أو بعدها سواء (لا دالّةَ جديدةَ تناديها الواجهة).
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ (تعريفاتُ دوالّ ومحفّزٌ يُعاد، والحارسُ يقبل علامتَه).
-- تراجع: أعِد تعريفَ كلّ دالّةٍ وحدَه حرفاً من مصدره — credit_stock من 0122، products_trash_consumption من 0255،
--   product_sales_rate من 0215 — والصلاحياتُ كما هنا؛ و:
--   drop trigger if exists invoices_dose_reopen on public.invoices; drop function if exists public._dose_charges_reopen();
-- ============================================================================

set lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف منها';
  end if;
  if to_regclass('public.dose_charges') is null then
    raise exception 'needs_0269' using hint = 'طبّق 0269 (حساب الجرعات) قبل هالهجرة';
  end if;
end $$;

-- الحرّاسُ كلُّها قبل أوّل تعريف: الرفضُ لا يترك نصفَ هجرة.
select public._drift_assert('public.credit_stock(uuid,numeric,uuid)', 'cf0ea437ef8b67214346d578037ed721', '-- +0288');
select public._drift_assert('public.products_trash_consumption()', 'e78fbeedbd45387535adf98e7205c8ae', '-- +0288');
select public._drift_assert('public.product_sales_rate(integer)', 'de74cfcb53598607e1e7bb06148b5da7', '-- +0288');

-- ── أ) الراجعُ يصل مادّتَه الحيّة أو يُرفض باسمها ─────────────────────────────────────────
create or replace function public.credit_stock(p_product uuid, p_qty numeric, p_clinic uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_product; v_t products_trash; v_hops int := 0; -- +0288
begin
  if p_product is null or coalesce(p_qty, 0) <= 0 then return; end if;
  -- 0288: مادّةٌ دُمجت يُتبع أصلُها (كـ_stock_post)، والمحذوفةُ تُرفض باسمها — لا «رجع للمخزن» عن تحديثٍ لم يمسّ صفّاً. -- +0288
  loop -- +0288
    -- بقفلٍ لا بسؤالٍ عارٍ (كـ_stock_post): دمجٌ أو حذفٌ يُثبت بين السؤال والتحديث كان يترك التحديثَ بلا صفّ بصمت (مراجعة ٢٢/١١). -- +0288
    perform 1 from products where id = v_id and clinic_id = p_clinic for update; -- +0288
    exit when found; -- +0288
    select * into v_t from products_trash where id = v_id and clinic_id = p_clinic; -- +0288
    if not found or v_hops >= 20 then -- +0288
      raise exception 'return_product_gone' using hint = 'المادّة ما عادت موجودة بالمخزن — حدّث الشاشة وأعد الإرجاع'; -- +0288
    end if; -- +0288
    if v_t.merged_into is null then -- +0288
      raise exception 'return_product_deleted' using hint = format( -- +0288
        '«%s» بالمحذوفات — رجّعها من «المحذوفات» أوّلاً ثمّ سجّل الراجع', coalesce(v_t."row"->>'name', '')); -- +0288
    end if; -- +0288
    v_id := v_t.merged_into; v_hops := v_hops + 1; -- +0288
  end loop; -- +0288
  update products set stock = round(coalesce(stock, 0) + p_qty, 3)
-- -0288    where id = p_product and clinic_id = p_clinic;
   where id = v_id and clinic_id = p_clinic; -- +0288
  if not found then -- +0288
    raise exception 'return_product_gone' using hint = 'المادّة ما عادت موجودة بالمخزن — حدّث الشاشة وأعد الإرجاع'; -- +0288
  end if; -- +0288
end $$;
revoke all on function public.credit_stock(uuid, numeric, uuid) from public, anon, authenticated;

-- ── ب) الدمجُ يأخذ ربطَ الجرعة والجرعاتِ المعلَّقة والجرد ───────────────────────────────────
create or replace function public.products_trash_consumption()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c product_stock_carry; v_keep text;
        v_kp products; v_tw products; v_avg numeric;                                  -- +0255
        v_sub boolean; -- +0288
begin
  if new.merged_into = new.id then return null; end if;
  if not exists (select 1 from auth.users u where u.id = new.clinic_id) then return null; end if;
  select p.name into v_keep from products p where p.id = new.merged_into and p.clinic_id = new.clinic_id;
  -- 0254: سنداتُ التلف تتبع التوأمَ إلى أصله قبل حذفه — ومعلَّقان على مادّةٍ واحدة يُرفضان بالاسم. -- +0254
-- -0288   if exists (select 1 from stock_counts w -- +0254
-- -0288               where w.product_id = new.id and w.clinic_id = new.clinic_id and w.source = 'waste' and w.status = 'pending') then -- +0254
  -- 0288: والجردُ المعلَّق كذلك (كان يفرغ مادّتُه بالحذف فتبطله الموافقةُ بصمت) — الفهرسُ «معلَّقٌ واحد» يجمعهما. -- +0288
  if exists (select 1 from stock_counts w -- +0288
              where w.product_id = new.id and w.clinic_id = new.clinic_id and w.status = 'pending') then -- +0288
    perform 1 from products where clinic_id = new.clinic_id and id in (new.id, new.merged_into) order by id for update; -- +0254
    if exists (select 1 from stock_counts w -- +0254
                where w.product_id = new.merged_into and w.clinic_id = new.clinic_id and w.status = 'pending') then -- +0254
      raise exception 'merge_waste_pending' using hint = format( -- +0254
-- -0288         '«%s» عليها سند تلف ينتظر، و«%s» عليها جرد أو سند ينتظر — خلّي المدير يبتّ بيهم قبل الدمج', -- +0254
-- -0288         coalesce(new."row"->>'name', ''), coalesce(v_keep, '')); -- +0254
        -- ما على التوأم بنوعه (سندٌ، أو جرد، أو كلاهما) — لا «جرد أو سند» عامّةً عمّا يُعرف. -- +0288
        '«%s» عليها %s ينتظر، و«%s» عليها جرد أو سند ينتظر — خلّي المدير يبتّ بيهم قبل الدمج', -- +0288
        coalesce(new."row"->>'name', ''), -- +0288
        (select case when bool_and(w.source = 'waste') then 'سند تلف' when bool_or(w.source = 'waste') then 'جرد وسند تلف' else 'جرد' end -- +0288
           from stock_counts w where w.product_id = new.id and w.clinic_id = new.clinic_id and w.status = 'pending'), -- +0288
        coalesce(v_keep, '')); -- +0288
    end if; -- +0254
  end if; -- +0254
  -- 0255: متوسّطُ الأصل يزن كلفتَي المادّتين الحيّتين قبل حذف التوأم (_avg_merge: المعروفةُ وحدها، بوزن   -- +0255
  -- max(الرصيد، 0)) — ومخزنُ الحقل خارجه. ويُكتب حين يغيّر أساسَ كلفة الأصل وحده: توأمٌ بلا رصيدٍ أو بلا   -- +0255
  -- كلفةٍ معروفة لا يمسّه، وأصلٌ يتبع سعرَ شرائه ولم يتغيّر يبقى يتبعه. والمادّتان بالمعرّف أوّلاً   -- +0255
  -- (merge_products وinventory_tidy_uncat قفلتاهما قبل السلّة — الثاني منذ 0253 — والقفلُ ثانيةً بنفس الترتيب لا يضرّ). -- +0255
  perform 1 from products where clinic_id = new.clinic_id and id in (new.id, new.merged_into) order by id for update;   -- +0255
  select * into v_kp from products where id = new.merged_into and clinic_id = new.clinic_id;   -- +0255
  select * into v_tw from products where id = new.id and clinic_id = new.clinic_id;   -- +0255
  if v_kp.id is not null and v_tw.id is not null and v_kp.farm_id is null and v_tw.farm_id is null then   -- +0255
    v_avg := public._avg_merge(coalesce(v_kp.stock, 0), public._avg_base(v_kp.avg_cost, v_kp.purchase_price),   -- +0255
                               coalesce(v_tw.stock, 0), public._avg_base(v_tw.avg_cost, v_tw.purchase_price));   -- +0255
    if v_avg is distinct from public._avg_base(v_kp.avg_cost, v_kp.purchase_price) then   -- +0255
      update products set avg_cost = v_avg where id = new.merged_into and clinic_id = new.clinic_id;   -- +0255
    end if;                                                                           -- +0255
  end if;                                                                             -- +0255
  update stock_counts set product_id = new.merged_into -- +0254
-- -0288    where product_id = new.id and clinic_id = new.clinic_id and source = 'waste' -- +0254
   where product_id = new.id and clinic_id = new.clinic_id -- +0288
     and exists (select 1 from products k where k.id = new.merged_into and k.clinic_id = new.clinic_id); -- +0254
  -- ومادّةُ السطر المعبّأ من فاتورة تتبعه كدفتر الفاتورة (بلا شرط) — ولو أفرغ حذفٌ سابقٌ product_id: القارئُ يقولها. -- +0254
  update stock_counts set source_product = new.merged_into -- +0254
   where source_product = new.id and clinic_id = new.clinic_id; -- +0254
  -- 0288: ربطُ «سعر الجرعة» يتبع التوأم (بابُه يحرس `authenticated` وحده، وهذا محفّزٌ بصاحب الدالّة)، والجرعاتُ المعلَّقة -- +0288
  -- معه — ومخصومُ المفرد يُعاد بمفرد الأصل حين يختلف عددُه (المخصومُ بوحدة الرصيد كـ_dose_plan، بثلاث منازل). -- +0288
  if v_kp.id is not null and v_tw.id is not null then -- +0288
    -- جرعةٌ بالمفرد تتبع أصلاً يُباع بالمفرد وحده (شرطُ clinic_drug_billing_set و_product_line_cost): أصلٌ بلا مفرد كان يكلّف كلَّ -- +0288
    -- حبّةٍ بالعلبة (ربحٌ سالب). فالربطُ بالمفرد يبقى على التوأم (يُباع بسعره بلا مخزنٍ كما قبل)، وجرعتُه بلا مادّة — مراجعة ٢٢/١١. -- +0288
    v_sub := coalesce(v_kp.has_sub_unit, false) and coalesce(v_kp.units_per_box, 0) > 0; -- +0288
    update clinic_drugs set product_id = new.merged_into -- +0288
     where product_id = new.id and clinic_id = new.clinic_id and (dose_unit is distinct from 'sub' or v_sub); -- +0288
    -- أقفالُ الجرعات بلا انتظار: بيعُ جرعاتٍ يقفلها ثمّ المادّة، والدمجُ بالعكس — فجرعةٌ تُباع الآن ترفض الدمجَ باسمها لا قفلاً متشابكاً. -- +0288
    begin -- +0288
      perform 1 from dose_charges d -- +0288
       where d.product_id = new.id and d.clinic_id = new.clinic_id and d.status in ('pending', 'billed') for update nowait; -- +0288
    exception when lock_not_available then -- +0288
      raise exception 'merge_dose_busy' using hint = 'فيه بيع جرعة جاري على هالمادة — أعد الدمج بعد شوي'; -- +0288
    end; -- +0288
    -- والمختومةُ معها (لا المعلَّقةُ وحدها): ترجيعُ فاتورتها بعد الدمج يردّ الدواءَ للأصل ويُرجعها معلَّقة — باسم التوأم الميّت كانت -- +0288
    -- تُباع بلا خصم والأصلُ أكثرُ من الرفّ بجرعة (مراجعة ٢٢/١١). -- +0288
    update dose_charges d -- +0288
       set product_id = case when d.dose_unit = 'sub' and not v_sub then null else new.merged_into end, -- +0288
           stock_qty = case when d.dose_unit = 'sub' and not v_sub then null -- +0288
                            when d.dose_unit = 'sub' and v_kp.units_per_box is distinct from v_tw.units_per_box -- +0288
                            then round(coalesce(d.dose_qty, 1) / v_kp.units_per_box, 3) else d.stock_qty end -- +0288
     where d.product_id = new.id and d.clinic_id = new.clinic_id and d.status in ('pending', 'billed'); -- +0288
  end if; -- +0288
  update clinic_service_recipe_items
     set product_id = new.merged_into, product_name = coalesce(v_keep, product_name), updated_at = now()
   where product_id = new.id and clinic_id = new.clinic_id;
  update invoice_consumption set product_id = new.merged_into where product_id = new.id and clinic_id = new.clinic_id;
  update invoice_consumption_skips set product_id = new.merged_into where product_id = new.id and clinic_id = new.clinic_id;
  if exists (select 1 from product_stock_carry k where k.product_id = new.id and k.clinic_id = new.clinic_id) then
-- -0255     -- المادّتان بالمعرّف قبل المرحَّل (inventory_tidy_uncat لا يقفل التوأم قبل السلّة)
    -- المادّتان بالمعرّف قبل المرحَّل (inventory_tidy_uncat يقفلهما قبل السلّة منذ 0253؛ والقفلُ ثانيةً بنفس الترتيب لا يضرّ) -- +0255
    perform 1 from products where clinic_id = new.clinic_id and id in (new.id, new.merged_into) order by id for update;
    select * into v_c from product_stock_carry where product_id = new.id and clinic_id = new.clinic_id for update;
    if found then
      perform public._stock_post(new.clinic_id, new.merged_into, v_c.carry, 'fold');
      update product_stock_carry
         set ext_in = ext_in + v_c.ext_in, ext_out = ext_out + v_c.ext_out, updated_at = now()
       where product_id = new.merged_into and clinic_id = new.clinic_id;
      delete from product_stock_carry where product_id = new.id and clinic_id = new.clinic_id;
    end if;
  end if;
  return null;
end $$;
revoke all on function public.products_trash_consumption() from public, anon, authenticated;

-- ── ج) ترجيعُ فاتورةِ الجرعات أو حذفُها يُرجعها معلَّقة ─────────────────────────────────────
-- بعد الترجيع (الحالةُ تصير refunded) أو الحذف: جرعاتُها المختومة ترجع «معلَّقة» ما دام الإعطاءُ قائماً (الدواءُ رجع للرفّ
-- بعكس السطر، فالجرعةُ تنتظر البيعَ من جديد — حذفُ فاتورةٍ «لأعيدها» يجدها بالسلّة)، وملغاةٌ إن أُلغي إعطاؤها.
-- بلا `update of status` (عمودٌ يُربط بالمحفّز يمنع تغيير نوعه — درسُ 0282): الشرطُ بالجسم.
create or replace function public._dose_charges_reopen()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' then
    if not (new.status = 'refunded' and old.status is distinct from 'refunded') then return null; end if;
  end if;
  update dose_charges d
     set status     = case when e.administered_at is not null then 'pending' else 'void' end,
         invoice_id = null,
         billed_at  = null,
         voided_at  = case when e.administered_at is not null then d.voided_at else now() end
    from treatment_entries e
   where d.invoice_id = old.id and d.clinic_id = old.clinic_id and d.status = 'billed'
     and e.id = d.entry_id;
  return null;
end $$;
revoke all on function public._dose_charges_reopen() from public, anon, authenticated;
drop trigger if exists invoices_dose_reopen on public.invoices;
create trigger invoices_dose_reopen after update or delete on public.invoices
  for each row execute function public._dose_charges_reopen();

-- ── د) معدّلُ البيع بوحدة الرصيد، بلا المرجَعة ─────────────────────────────────────────────
create or replace function public.product_sales_rate(p_days int default 30)
returns table (product_id uuid, sold numeric)
language sql
stable
security invoker
set search_path = public
as $$
-- -0288   select ii.product_id, greatest(sum(ii.qty), 0)
-- -0288     from invoice_items ii
-- -0288    where ii.clinic_id = (select auth_clinic())
  select ii.product_id, greatest(sum(coalesce(ii.stock_qty, ii.qty)), 0) -- +0288
    from invoice_items ii join invoices i on i.id = ii.invoice_id -- +0288
   where ii.clinic_id = (select auth_clinic()) and coalesce(i.status, 'paid') <> 'refunded' -- +0288
     and ii.product_id is not null
     and ii.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 7), 180))
   group by ii.product_id
$$;
revoke all on function public.product_sales_rate(int) from public, anon;
grant execute on function public.product_sales_rate(int) to authenticated;
comment on function public.product_sales_rate(int) is
  'صافي المبيع لكلّ مادةٍ بآخر p_days (٧..١٨٠) — لاقتراح الطلب (0215). بوحدة الرصيد (stock_qty) والمرجَعةُ خارجه منذ 0288؛ المرتجعُ يُطرح والصافي لا ينزل تحت صفر.';
