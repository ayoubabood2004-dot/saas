-- ============================================================================
-- ٠٢٥٥ — متوسّطُ الكلفة المتحرّك: ما يخرج من المخزن يُكلَّف بما كلّف فعلاً، لا بآخر فاتورة شراء
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- • كلفةُ المادّة كانت «سعرَ الشراء» وحده، وكلُّ شراءٍ يكتب فوقه سعرَه (record_purchase/update_purchase،
--   0214): عشرُ علبٍ بألف ثمّ عشرٌ بألفٍ ومئتين ⇒ العشرون كلُّها بألفٍ ومئتين لحظةَ وصول الثانية،
--   فالربحُ يتبع آخرَ فاتورةٍ لا ما بالرفّ. ومنذ 0252 هذا الرقمُ نفسُه كلفةُ المستهلكات وسندِ التلف
--   والجرد (stock_unit_cost)، وسطرُ المادّة بالكاشير كلفتُه ما يرسله الجهاز منه.
-- • وتعديلُ فاتورة شراءٍ قديمة يعيد سعرَها «آخرَ سعر» (0214 يعيد تطبيق كلّ سطر)، فتنقلب كلفةُ الرفّ
--   كلُّه بتصحيح فاتورةٍ عمرُها شهر.
-- • ومادّةٌ كلفتُها مجهولة (سعرُ شرائها صفر) لو دخلت المتوسّطَ بوزنها لنصّفت أوّلَ كلفةٍ حقيقية:
--   ١٠ بلا كلفة + ١٠ بـ١٢٠٠ ⇒ ٦٠٠ — كلفةٌ لم يدفعها أحد.
--
-- ── القرار (المالك، ٣١/١٠: «المتوسط لكل شي») ───────────────────────────────
-- • المتوسّطُ المتحرّك لكلّ ما يخرج — المستهلكات والتلف والجرد **وبيعُ المواد بالكاشير** — من يوم
--   هذه الهجرة، للعيادات كلّها بلا مفتاحٍ لكلّ عيادة.
-- • «سعر الشراء» يبقى آخرَ سعر شراءٍ كما هو؛ والمتوسّطُ عمودٌ جديد يكتبه الخادمُ وحده.
-- • الفواتيرُ القديمة لا تُعاد كتابتُها أبداً: كلفةُ كلّ سطرٍ لقطتُه يومَ بيعه.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- * products.avg_cost numeric(24,6) ≥ 0، فارغٌ = «يتبع سعرَ الشراء» (بلا تعبئةٍ لما قبل اليوم)، و
--   stock_unit_cost(p) = greatest(coalesce(avg_cost, purchase_price, 0), 0): مصدرُ الكلفة الواحد منذ
--   0252 — فالوصفةُ ومعاينتُها وملخّصُها وسندُ التلف تتبع المتوسّطَ بلا سطرٍ آخر.
-- * دوالٌّ نقيّةٌ دقيقة بستّ منازل (_cons_round_div، والمرآةُ src/lib/avgCost.ts): _avg_base لأساس الكلفة،
--   _avg_receive للاستلام، _avg_variance لفرقه، _avg_adjust لتعديل فاتورة الشراء، _avg_merge للدمج.
--   القواعد: المجّانيُّ والكلفةُ الصفرية لا يخفّضان؛ ووحداتٌ بلا كلفةٍ معروفة (صفرٌ أو سالب) لا وزنَ لها
--   (فالأوّلُ الحقيقيّ كلفتُه)؛ ورصيدٌ ≤ ٠ يأخذ كلفةَ الاستلام، والسالبُ يُكتب فرقُه (−s)·(c − a) مالاً
--   بـpurchase_effects.cost_variance — وحداتٌ صُرفت والرصيدُ سالب بكلفةٍ غير كلفتها تُرى.
-- * record_purchase (نصُّ 0253 حرفاً وفوقه أسطرٌ معلَّمة): المتوسّطُ بنفس الـSET الذي يرفع الرصيد —
--   والـSET يرى الصفَّ القديم — والمادّةُ الجديدة بكلفتها، والكشفُ يحمل المتوسّطَ وفرقَ الكلفة.
-- * update_purchase (نصُّ 0253 + معلَّم): إعادةُ التطبيق لا تمسّ المتوسّط؛ لكلّ مادّةٍ لقطتُها عند أوّل
--   لمس، ثمّ _avg_adjust مرّةً بعد الحلقة — الرصيدُ الحاضر يُعاد تقييمُه، والفواتيرُ الصادرة بكلفتها.
-- * والشراءُ وتعديلُه يقفلان موادَّهما بالمعرّف بجملةٍ واحدة قبل أوّل سطر (السطورُ القديمة، وما يحمل معرّفَه من
--   الجديدة، وما يُطابَق بالباركود أو بالاسم بمطابقة الحلقة نفسِها): كانا يقفلان بترتيب الفاتورة، والبيعةُ والسندُ والجردُ
--   بالمعرّف — ترتيبان متعاكسان انسداد. والحلقةُ تطابق كما كانت؛ ومادّةٌ يولدها سطرٌ سابق تُقفل بسطرها (صفُّها هي).
-- * والمجهولُ لا يُكتب فوق المتوسّط المخزَّن (الشراءُ وتعديلُه): متوسّطٌ صفرٌ صريح (تصحيحُ المدير) أساسُه «مجهول»
--   (_avg_base)، فكان استلامٌ مجّانيّ أو بلا كمية يمحوه إلى null فترجع الكلفةُ لسعر الشراء — الآن يبقى صفراً. والمدفوعُ
--   على الصفر الصريح كما كان (صفرٌ ثمّ ٥ بـ٨٠٠ ⇒ ٨٠٠: سؤالٌ للمالك، لا يُغيَّر هنا).
-- * وفرقُ الكلفة الذي يُقرَّب صفراً لم يقع: _avg_variance فارغٌ لا ٠٫٠٠ (−٢ بـ١٠٠٠ ثمّ ١٠ بـ١٠٠٠)، ومرآتُه
--   receiveVarianceCents بالقاعدة نفسِها (avgCost.ts، وcost-parity يطابقهما).
-- * products_guard_avg يرفض أيضاً التجميعَ بكتابةٍ مباشرة (pooled من غير true إلى true، للمسجَّل وحده): pool_direct
--   «الصفحة عندك نسخة قديمة…» — نسخةٌ قديمةٌ بالمتصفّح كانت تصفّر رصيدَ مادّةٍ سالبة تحت «مجمّع» (−٢ على حوضٍ ٥ ⇒ صفرٌ
--   والحوضُ ٥ لا ٣)، أو تُخفي رصيدَها الموجب أو السالب تحته بلا لمسه. pool_product وكلُّ دالّة مالكٍ تمرّ، والشاشةُ الحاليّة
--   لا تقلبه إلا بها. **ونافذةُ النشر**: الواجهةُ الحيّة اليوم (HEAD) تقلبه بالكتابة المباشرة — نموذجُ المادّة لرصيدٍ ≤ ٠،
--   وتعديلُ المجموعة لكلّ عضو — فمن تطبيق 0255 حتى تنزل الواجهةُ الجديدة يُرفض لها التجميعُ pool_direct و«حدّثها» لا يُصلحه
--   (التحديثُ يجيب النسخةَ نفسَها). فالواجهةُ تُنشر بعد 0255 مباشرةً؛ والرفضُ نفسُه صحيح: تلك الكتابةُ هي محوُ العجز.
-- * products_trash_consumption (نصُّ 0254 + معلَّم): الدمجُ (بطريقيه) يزن كلفتَي المادّتين الحيّتين قبل
--   حذف التوأم. وفكُّ الدمج لا يمسّ الأصل، والتوأمُ يرجع بلقطته (restore_product كما هو).
-- * stock_count_submit (نصُّ 0217 + معلَّم): لقطةُ كلفة الجرد stock_unit_cost لا سعرُ الشراء، وموادُّ العدّ
--   تُقفل بالمعرّف بجملةٍ واحدة قبل الحلقة (كانت بترتيب السطور — ترتيبان متعاكسان انسداد).
-- * البيع: retail_checkout (نصُّ 0252 + معلَّم) يكلّف كلَّ سطرِ مادّةٍ بالخادم (_product_line_cost):
--   round(الكلفة، 2) للعلبة والكيلو، و_cons_round_div(الكلفة، units_per_box، 2) للوحدة الصغيرة —
--   ومادّةٌ لا يعرفها الخادم أو من الحقل بكلفة الجهاز كما اليوم. والتعديلُ (edit_invoice_lines_unguarded،
--   0252 + معلَّم): سطرُ المادّة الجديد بكلفة الخادم، والقائمُ (معرّفُ سطرٍ قديمٍ بنفس المادّة) بكلفته.
-- * products_guard_avg (invoker، للمسجَّل وحده كنمط 0162): الإدراجُ بلا متوسّط (نسخُ مادّةٍ لا ينسخه)،
--   والكتابةُ المباشرة عليه تُرفض avg_cost_frozen، والتجميعُ المباشر pool_direct (أدناه). والتصحيحُ product_cost_reset
--   للمدير وحده، ويدقّقه محفّزُ المنتجات كأيّ تعديل.
-- * purchase_effect_snap (0211 + معلَّم): صورةُ الكشف تحمل avg_cost (ولا تدخل changed: تتبدّل بكلّ شراء
--   كالرصيد).
-- * verify_consumption_wiring (0252 + معلَّم): تمسك جسماً من السبعة رجع بلا علامة 0255، ومحفّزَ الحارس.
-- * مخزنُ الحقل خارج المتوسّط كلّه: لا يُحسب له ولا يُصحَّح، وسطرُه بالكاشير بكلفة الجهاز.
--
-- ── قرارٌ بالقياس: الرصيدُ الأوّل بإشارته بـ_avg_adjust (لا max(s0,0) كما بالتصميم §10) ────────
-- بلا حصرٍ (0253) صار الرصيدُ السالب حقيقياً، وأشيعُ تعديلٍ لفاتورة شراء تصحيحُ كميةٍ كُتبت ناقصة:
-- ٢ بدل ٢٠ بنفس الكلفة c، والبيعُ أنزل الرصيدَ إلى −٥. بـmax(s0,0): V = ١٨c على ١٣ علبة ⇒ ١٫٣٨٥c
-- — كلفةٌ أعلى ٣٨٪ ولا شيءَ تغيّر بالكلفة. بالإشارة: V = −٥c − ٢c + ٢٠c = ١٣c ⇒ c بالضبط. والقاعدةُ
-- التي تمسكه: كلفةٌ واحدة بكلّ السطور ⇒ المتوسّطُ هو هي، مهما كانت إشارةُ الرصيد.
--
-- ── المقيس (الحزمةُ المحلّية، ٣١/١٠، سلسلةُ التصميم §10 بالأرقام) ─────────────────
--   ١٠ علب بـ١٠٠٠ (بلا متوسّط) + شراء ١٠ بـ١٢٠٠ ⇒ ١١٠٠ (الرصيد ٢٠، وسعرُ الشراء ١٢٠٠)؛ صرفُ ٤ بخدمةٍ وصفتُها
--     علبة ⇒ كلفةُ السطر ١١٠٠٫٠٠ وCOGS ٤٤٠٠٫٠٠؛ شراء ٥ بـ١٣٠٠ ⇒ 24100/21 = ١١٤٧٫٦١٩٠٤٨؛ تعديلُ فاتورة الـ١٢٠٠
--     إلى ١٢٥٠ ⇒ 24600.000008/21 = ١١٧١٫٤٢٨٥٧٢؛ صرفُ ١ ⇒ ١١٧١٫٤٣، وترجيعُه يردّ الرصيدَ ولا يمسّ المتوسّطَ ولا
--     كلفةَ الفاتورة.
--   أساسٌ مجهول (١٠ بصفر) + ١٠ بـ١٢٠٠ ⇒ ١٢٠٠ لا ٦٠٠؛ أساسٌ سالب −٢ بـ١٠٠٠ + ١٠ بـ١٣٠٠ ⇒ ١٣٠٠ وفرقٌ ٦٠٠٫٠٠؛
--     ٥ مجّاناً على ٢٠ بـ١٢٠٠ ⇒ ١٢٠٠؛ سطران لمادّةٍ بفاتورة ⇒ ١١٥٠ ثمّ ١٣٣٣٫٣٣٣٣٣٣؛ وسعرُ شراءٍ سالب + مجّانيّ ⇒
--     الشراءُ يُحفظ والمتوسّطُ مجهول.
--   الدمج: (١٠ بـ١٠٠٠) + (٣٠ بـ٢٠٠٠) ⇒ ١٧٥٠؛ توأمٌ بلا كلفةٍ أو برصيدٍ سالب لا وزنَ له؛ «رتّب المخزن» (١٠ بـ١٠٠٠)
--     + (٥ بـ١٣٠٠) ⇒ ١١٠٠؛ والفكُّ والحذفُ ثمّ الاسترجاعُ لا تمسّ المتوسّط.
--   البيع: علبةٌ بمتوسّط ١١٧١٫٤٢٨٥٧٢ ⇒ ١١٧١٫٤٣ (والجهازُ أرسل ٥)، سرنجة (١٠٠ بالعلبة بـ٢٥٬٠٠٠) ⇒ ٢٥٠٫٠٠،
--     أمبولة (٣ بالعلبة) ⇒ ٣٩٠٫٤٨، ومرجَّعٌ بالسلّة ⇒ ١١٧١٫٤٣، والحقلُ ومادّةُ عيادةٍ أخرى بكلفة الجهاز؛ والتعديل:
--     القائمُ يبقى بما يحمله (٧٫٠٠) والجديدُ بكلفة الخادم (٨٠٠٫٠٠).
--   تصحيحُ كميةٍ ٢ ← ٢٠ بنفس الكلفة على رصيد −٥ ⇒ المتوسّطُ يبقى ١٠٠٠ (وmax(s0,0) كان سيعطي ١٣٨٤٫٦١٥٣٨٥).
--   المرآة (avgCost.ts وproductLineCostCents) فلساً بفلس: ١٦٬٦٦١ حالة؛ والفرقُ حيث قُصد وحده — ٥٠٢ حالةَ تعديلٍ
--     برصيدٍ أوّلَ سالب، وأساسٌ من سعر شراءٍ سالب.
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- القاعدةُ الحيّة لا تُقاس من هنا، فالهجرةُ تقيسها بنفسها: `_drift_assert` (0252) لكلّ دالّةٍ تُعاد —
-- جسمُها الحيُّ ببصمة مصدرها بالمستودع، أو بعلامتنا (إعادةُ هذه الهجرة)، وإلا رفضٌ قبل أيّ بناء
-- (درسُ 0241). والبصماتُ يفحصها `scripts/redefine-fingerprint.mjs`، والعلاماتُ verify_consumption_wiring().
-- والحرّاسُ كلُّها قبل أوّل بناء، فالرفضُ لا يترك نصفَ هجرةٍ ما دامت تُطبَّق طلباً واحداً؛ وباليد:
-- `psql -1 -v ON_ERROR_STOP=1`.
--
-- تُطبَّق بعد 0252 و0253 و0254 (تتحقّق منها أوّلاً) **وقبل الواجهة** (الشريحة د: avgc)، والواجهةُ بعدها مباشرةً
-- (نافذةُ pool_direct أعلاه). بعدها مباشرةً يتغيّر ربحُ ما يُباع من مواد — هذا هو القرار، لا أثرٌ جانبيّ. إضافيةٌ وتُعاد
-- بلا أثرٍ ثانٍ (عمودان بـif not exists، وقيدٌ بكتلةٍ محروسة، ودوالُّ، ومحفّزٌ يُسقط قبل إنشائه).
-- أعِد تطبيق 0252–0255 بعد أي إعادةٍ لـ0066/0171/0184/0197/0203/0214/0216/0217/0241/0242.
-- وإعادةُ 0252 أو 0253 أو 0254 وحدها بعد هذه تُرجع أجسامَها لنصوصها (أجسامُنا تحمل علاماتها فيمرّ
-- حارسُها) — أعِد 0255 بعدها؛ وverify_consumption_wiring() تقول متى. وبعد 0252 وحدها الفحصُ نفسُه نصُّها: يقول
-- «verify_consumption_wiring(): lacks» بعلامتنا حتى تُعاد 0255، والرجوعُ 0252 ثمّ 0253 و0254 و0255 بترتيبها.
--
-- تراجع:
--   • فوريّ — الكلفةُ ترجع لسعر الشراء بكلّ مكان، والمتوسّطُ يبقى يُحفظ من الشراء ليومٍ يعود فيه:
--       create or replace function public.stock_unit_cost(p public.products) returns numeric
--       language sql immutable set search_path = public as
--       $$ select greatest(coalesce(p.purchase_price, 0), 0)::numeric $$;
--     وسطرُ المادّة بالكاشير يبقى مكلَّفاً بالخادم لكن بسعر الشراء (= ما كان يرسله الجهاز). والفواتيرُ
--     القديمة لا تُمسّ بأيّ تراجع.
--     والشاشاتُ تقرأ avg_cost نفسَه (بطاقةُ قيمة المخزون، الراكد، AvgCostNote، معاينةُ الكاشير، معاينةُ الجرد)
--     فتبقى تعرض المتوسّطَ بعد هذا التراجع حتى تُبدَّل هي أيضاً.
--   • كامل — أعِد **أجسامَ الدوالّ وحدها** حرفاً من مصادرها بصلاحياتها هنا: retail_checkout
--     وedit_invoice_lines_unguarded وverify_consumption_wiring وstock_unit_cost من 0252، record_purchase
--     وupdate_purchase من 0253، stock_count_submit من 0217، products_trash_consumption من 0254،
--     purchase_effect_snap من 0211؛ ثمّ:
--       drop trigger if exists products_guard_avg on public.products;
--       drop function if exists public.products_guard_avg();
--       drop function if exists public.product_cost_reset(uuid, numeric);
--       drop function if exists public._product_line_cost(uuid, uuid, numeric, numeric, numeric);
--       drop function if exists public._avg_base(numeric, numeric);
--       drop function if exists public._avg_receive(numeric, numeric, numeric, numeric);
--       drop function if exists public._avg_variance(numeric, numeric, numeric, numeric);
--       drop function if exists public._avg_adjust(numeric, numeric, numeric, numeric, numeric, numeric);
--       drop function if exists public._avg_merge(numeric, numeric, numeric, numeric);
--     والعمودان (products.avg_cost، purchase_effects.cost_variance) وقيدُهما يبقون ولا يضرّون.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه من 0252 و0253 و0254، ثمّ الحارسُ لكلّ دالّةٍ تُعاد — قبل أيّ بناء ─────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public._cons_round_div(numeric,numeric,integer)') is null
     or to_regprocedure('public.stock_unit_cost(public.products)') is null
     or to_regprocedure('public._stock_post(uuid,uuid,numeric,text)') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف ومصدرُ الكلفة والترحيلُ منها';
  end if;
  -- 0253 لا دالّةَ جديدةَ لها: علامتُها بجسم الشراء (وبجسمنا بعد هذه الهجرة — نصُّها مصدرُه).
  if position('-- +0253' in coalesce((select p.prosrc from pg_proc p
                                       where p.oid = to_regprocedure('public.record_purchase(jsonb,jsonb)')), '')) = 0 then
    raise exception 'needs_0253' using hint = 'طبّق 0253 قبل هالهجرة — شراؤها بلا حصرٍ هو النصّ الذي تبني عليه';
  end if;
  if to_regprocedure('public.stock_waste_submit(jsonb,boolean,jsonb)') is null then
    raise exception 'needs_0254' using hint = 'طبّق 0254 قبل هالهجرة — طيُّ الدمج بسندات التلف منها';
  end if;
end $$;

select public._drift_assert('public.retail_checkout(jsonb,jsonb)', '4fcd03a6343892a2d79c8ba9e54821bf', '-- +0255');
select public._drift_assert('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', 'e71d84141fed847a310103853692c3ae', '-- +0255');
select public._drift_assert('public.record_purchase(jsonb,jsonb)', '9655ba1cd0700e47ef01c59ecbc47fff', '-- +0255');
select public._drift_assert('public.update_purchase(uuid,jsonb,jsonb)', '7323a2102de68087ee5b83f18346c7cb', '-- +0255');
select public._drift_assert('public.stock_count_submit(jsonb)', '49f84bfc1c8bc2531bbb9aa4a2206867', '-- +0255');
select public._drift_assert('public.products_trash_consumption()', '7ed7617366bd7f298c0f27507eb30ca1', '-- +0255');
select public._drift_assert('public.purchase_effect_snap(public.products)', '451eacfc09d5e506be83c8dc53a1af8d', '-- +0255');
select public._drift_assert('public.verify_consumption_wiring()', 'a526b1e9bd63741f882d04c2d5bf24c8', '-- +0255');

-- ── ١) العمودان ──────────────────────────────────────────────────────────
-- المتوسّطُ لوحدة المخزون (العلبة، أو الكيلو للموزون) بستّ منازل. فارغٌ = لم يمرّ بالمادّة شراءٌ منذ
-- اليوم، فكلفتُها سعرُ شرائها كما كانت. لا تعبئةَ لما قبل اليوم: أكثرُ الرفّ لم يدخل بفاتورة (0217).
alter table public.products add column if not exists avg_cost numeric(24,6);
do $$ begin
  alter table public.products add constraint products_avg_cost_nonneg check (avg_cost >= 0);
exception when duplicate_object then null; end $$;
comment on column public.products.avg_cost is
  'متوسّطُ الكلفة المتحرّك لوحدة المخزون (0255) — فارغٌ يتبع purchase_price. يكتبه الخادمُ وحده: الشراءُ وتعديلُه والدمجُ وproduct_cost_reset؛ والكتابةُ المباشرة من المتصفّح تُرفض (products_guard_avg).';

-- فرقُ الكلفة حين يستلم الشراءُ على رصيدٍ سالب: وحداتٌ خرجت بكلفة a وكلّفت c — (−s)·(c − a) فلساً.
-- فارغٌ حين لا يقع (الرصيدُ ≥ ٠، أو الكلفةُ قبله مجهولة، أو سطرٌ بلا كمية/كلفة، أو مادّةٌ جديدة).
alter table public.purchase_effects add column if not exists cost_variance numeric(24,2);
comment on column public.purchase_effects.cost_variance is
  'فرقُ الكلفة (0255): استلامٌ على رصيدٍ سالب s بمتوسّطٍ معروف a وكلفة c يصفّر المتوسّطَ إلى c، والوحداتُ التي خرجت والرصيدُ سالب كلّفت (−s)·(c − a) غيرَ ما حُسب لها. فارغٌ حين لا يقع.';

-- ── ٢) الحسابُ الدقيق — نقيّةٌ بستّ منازل، ومرآتُها src/lib/avgCost.ts فلساً بفلس ───────────
-- أساسُ الكلفة قبل الاستلام أو الدمج أو التعديل: المتوسّط، وإلا سعرُ الشراء — والصفرُ والسالبُ مجهول
-- (سعرُ شراءٍ سالب بياناتٌ تالفة، وكلفتُه بـstock_unit_cost صفرٌ أصلاً؛ ولو مرّ سالباً لكتبه استلامٌ مجّانيّ
-- متوسّطاً فرفضه القيدُ وسقط الشراءُ كلُّه). لا يقرأ stock_unit_cost عمداً: التراجعُ الفوريّ يعيدها لسعر
-- الشراء، والمتوسّطُ يبقى يُحفظ على أساسه هو.
create or replace function public._avg_base(a numeric, pp numeric) returns numeric
language sql immutable set search_path = public as $$
  select nullif(greatest(coalesce(a, pp), 0), 0)
$$;
revoke all on function public._avg_base(numeric, numeric) from public, anon, authenticated;

-- s، q بوحدة المخزون (٣ منازل)؛ a، c لوحدة المخزون (a فارغ = مجهول)؛ والقسمةُ الوحيدة _cons_round_div.
-- الاستلام: كميةٌ ≤ ٠ أو كلفةٌ ≤ ٠ ⇒ a (المجّانيُّ لا يخفّض، والصفرُ «بلا سعر» كما يقرؤه الشراء)؛ a
-- مجهولٌ أو ≤ ٠ ⇒ c (وحداتٌ بلا كلفةٍ معروفة لا وزنَ لها)؛ رصيدٌ ≤ ٠ ⇒ c؛ وإلا (s·a + q·c)/(s + q).
create or replace function public._avg_receive(s numeric, a numeric, q numeric, c numeric) returns numeric
language sql immutable set search_path = public as $$
  select case
           when coalesce(q, 0) <= 0 or coalesce(c, 0) <= 0 then a
           when a is null or a <= 0 then c
           when coalesce(s, 0) <= 0 then c
           else public._cons_round_div(s * a + q * c, s + q, 6)
         end
$$;
revoke all on function public._avg_receive(numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- فرقُ الاستلام على رصيدٍ سالب، فلساً (النصفُ بعيداً عن الصفر): يقع حين يصفّر _avg_receive متوسّطاً
-- معروفاً — كميةٌ وكلفةٌ موجبتان، وa > 0، وs < 0 — وإلا فارغ. سالبٌ حين تنزل الكلفة. وفرقٌ يُقرَّب صفراً لم يقع:
-- فارغٌ لا ٠٫٠٠ (−٢ بـ١٠٠٠ ثمّ ١٠ بـ١٠٠٠، أو فرقُ فلسٍ يُقرَّب صفراً) — «فارغٌ حين لا يقع» كالرصيد غير السالب.
-- ومرآتُه receiveVarianceCents (avgCost.ts) بالقاعدة نفسِها، وcost-parity يطابقهما.
create or replace function public._avg_variance(s numeric, a numeric, q numeric, c numeric) returns numeric
language sql immutable set search_path = public as $$
  select case when coalesce(q, 0) > 0 and coalesce(c, 0) > 0 and a > 0 and s < 0
              then nullif(public._cons_round_div(-s * (c - a), 1, 2), 0) end
$$;
revoke all on function public._avg_variance(numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- تعديلُ فاتورة الشراء: s0/a0 لقطةُ المادّة عند أوّل لمس، v_old/v_new قيمتا سطورها القديمة والجديدة
-- (Σ q·c بالضبط)، s1 الرصيدُ بعد إعادة التطبيق، c_last آخرُ كلفةٍ موجبة بسطورها الجديدة.
-- s1 ≤ ٠ ⇒ a0؛ وإلا V = s0·a0 − v_old + v_new (a0 معروف)، وV > ٠ ⇒ V/s1؛ وإلا coalesce(c_last, a0).
-- و**s0 بإشارته** (انظر الرأس): الرصيدُ السالب وحداتٌ خرجت بكلفة a0، فكلفةٌ واحدة بكلّ السطور تبقى هي.
create or replace function public._avg_adjust(s0 numeric, a0 numeric, v_old numeric, v_new numeric, s1 numeric, c_last numeric)
returns numeric
language sql immutable set search_path = public as $$
  select case
           when coalesce(s1, 0) <= 0 then a0
           when a0 is not null and coalesce(s0, 0) * a0 - coalesce(v_old, 0) + coalesce(v_new, 0) > 0
             then public._cons_round_div(coalesce(s0, 0) * a0 - coalesce(v_old, 0) + coalesce(v_new, 0), s1, 6)
           else coalesce(c_last, a0)
         end
$$;
revoke all on function public._avg_adjust(numeric, numeric, numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- الدمج: 1 الأصلُ الباقي، 2 التوأم. وزنُ كلٍّ max(رصيده، 0) بين المعروفَين (> 0) وحدهما؛ معروفٌ واحد ⇒
-- هو؛ لا معروف ⇒ a1. ومعروفان بلا وزن (رصيداهما ≤ ٠) ⇒ a1 — لا قسمةَ على صفر.
create or replace function public._avg_merge(s1 numeric, a1 numeric, s2 numeric, a2 numeric) returns numeric
language sql immutable set search_path = public as $$
  select case
           when a1 > 0 and a2 > 0 then
             (case when greatest(coalesce(s1, 0), 0) + greatest(coalesce(s2, 0), 0) = 0 then a1
                   else public._cons_round_div(greatest(coalesce(s1, 0), 0) * a1 + greatest(coalesce(s2, 0), 0) * a2,
                                               greatest(coalesce(s1, 0), 0) + greatest(coalesce(s2, 0), 0), 6) end)
           when a2 > 0 then a2
           else a1
         end
$$;
revoke all on function public._avg_merge(numeric, numeric, numeric, numeric) from public, anon, authenticated;

-- ── ٣) مصدرُ الكلفة الواحد يقرأ المتوسّط ─────────────────────────────────────
-- لوحدة المخزون؛ وللوحدة الصغيرة بـ§3.3 (0252). والمتوسّطُ صفرٌ صريح كلفةٌ لا «مجهول» (coalesce لا
-- nullif) — كما تقرؤه المرآةُ stockUnitCost. والتراجعُ الفوريّ إعادةُ هذا السطر بسعر الشراء (الرأس).
create or replace function public.stock_unit_cost(p public.products) returns numeric
language sql immutable set search_path = public as
$$ select greatest(coalesce(p.avg_cost, p.purchase_price, 0), 0)::numeric $$;
revoke all on function public.stock_unit_cost(public.products) from public, anon;
grant execute on function public.stock_unit_cost(public.products) to authenticated;   -- نقيّة: قرّاءُ الصلاحية (0252) ينادونها

-- كلفةُ سطرِ مادّةٍ بالبيعة (§A4): مادّةٌ حيّةٌ بهذه العيادة ليست من الحقل ⇒ الخادمُ يكلّفها — بوحدتها
-- الصغيرة إن كان لها واحدةٌ وstock_qty حاضرة و|stock_qty| ≠ |qty| (الكميتان بثلاث منازل كما تُحفظان)،
-- وإلا بالعلبة/الكيلو؛ وغيرُها بكلفة الجهاز كما اليوم. موجبٌ أو مرجَّعٌ بالسلّة: نفسُ الكلفة لوحدته.
-- تُنادى من البيعة (الحلقتين) والتعديل وحدهما — والصفوفُ مقفولةٌ قبلها، فالحلقتان تريان القيمةَ نفسها.
create or replace function public._product_line_cost(p_clinic uuid, p_product uuid, p_qty numeric, p_stock_qty numeric, p_device numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare v_p products;
begin
  if p_product is null then return p_device; end if;
  select * into v_p from products where id = p_product and clinic_id = p_clinic;
  if not found or v_p.farm_id is not null then return p_device; end if;
  if coalesce(v_p.has_sub_unit, false) and coalesce(v_p.units_per_box, 0) > 0
     and p_stock_qty is not null and abs(round(p_stock_qty, 3)) <> abs(round(coalesce(p_qty, 0), 3)) then
    return public._cons_round_div(public.stock_unit_cost(v_p), v_p.units_per_box, 2);
  end if;
  return round(public.stock_unit_cost(v_p), 2);
end $$;
revoke all on function public._product_line_cost(uuid, uuid, numeric, numeric, numeric) from public, anon, authenticated;

-- ── ٤) المتوسّطُ يكتبه الخادمُ وحده، والتجميعُ يمرّ من pool_product وحدها ─────────────────────
-- نمطُ 0162: المحفّزُ يحرس الكتابةَ المباشرة من المتصفّح (`current_user = 'authenticated'`) وحدها، ودوالُّ
-- المالك (الشراءُ وتعديلُه والدمجُ والتصحيح وpool_product) تمرّ — ولهذا هو invoker: definer يجعل current_user مالكَه
-- دائماً فيبطل الشرط. الإدراجُ بلا متوسّط: مادّةٌ جديدة متوسّطُها مجهول، ونسخُ مادّةٍ قائمة لا ينسخه.
-- والتجميعُ (pooled من غير true إلى true) بكتابةٍ مباشرة يُرفض pool_direct: نسخٌ قديمةٌ محفوظةٌ بالمتصفّح (النموذجُ قبل
-- الجولة الثالثة يقلبه مباشرةً حين يكون الرصيدُ ≤ ٠، وتعديلُ المجموعة لكلّ عضوٍ بأيّ رصيد) تكتب pooled = true وstock = 0 —
-- مادّةٌ عند −٢ على حوضٍ ٥ تصير صفراً تحت «مجمّع» والحوضُ ٥ لا ٣ (قيسَ). pool_product تنقل الرصيدَ كلَّه ولو سالباً (0253)،
-- والشاشةُ الحاليّة لا تقلبه إلا بها. وإبقاءُ المجمَّع مجمَّعاً وفكُّه (false) يمرّان كما كانا.
create or replace function public.products_guard_avg()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user <> 'authenticated' then return new; end if;
  if tg_op = 'INSERT' then
    new.avg_cost := null;
    return new;
  end if;
  if new.avg_cost is distinct from old.avg_cost then
    raise exception 'avg_cost_frozen'
      using hint = 'متوسط الكلفة يتحدّث من فواتير الشراء بس — للتصحيح: "صحّح المتوسط" من نموذج المادة';
  end if;
  if old.pooled is distinct from true and new.pooled then
    raise exception 'pool_direct'
      using hint = 'الصفحة عندك نسخة قديمة — حدّثها، وبعدين شغّل «بدون كمية» للمادة من جديد';
  end if;
  return new;
end $$;
revoke all on function public.products_guard_avg() from public, anon, authenticated;
drop trigger if exists products_guard_avg on public.products;
create trigger products_guard_avg before insert or update on public.products
  for each row execute function public.products_guard_avg();

-- تصحيحُ المتوسّط: المديرُ وحده (ومفتاحُه الحيّ)، والمصوّرُ أبداً (0245). رقمٌ ≥ ٠ بستّ منازل أقصى، أو
-- فارغٌ = «يتبع سعرَ الشراء» من جديد. ومخزنُ الحقل لا متوسّطَ له. محفّزُ المنتجات يدقّق التغيير كأيّ
-- تعديل، وما لم يتغيّر لا يُكتب. is_photographer تُسأل بـexecute: تراجعُ 0222 يحذفها، ونداءٌ ثابتٌ يرمي.
create or replace function public.product_cost_reset(p_id uuid, p_cost numeric)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_ph     boolean := false;
  v_p      products;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if coalesce(v_ph, false) or coalesce(auth_role(), '') <> 'manager' then
    raise exception 'cost_reset_forbidden' using hint = 'تصحيح المتوسط للمدير وحده — افتح وضع المدير';
  end if;
  -- numeric(24,6): ستُّ منازل وأقلُّ من ١٠^١٨ — وNaN أكبرُ من كلّ رقمٍ بترتيب numeric فيُرفض هنا.
  if p_cost is not null and (p_cost < 0 or p_cost >= 1000000000000000000 or p_cost <> round(p_cost, 6)) then
    raise exception 'cost_reset_bad' using hint = 'اكتب رقم ٠ أو أكثر، لحد ٦ مراتب بعد الفاصلة';
  end if;
  select * into v_p from products where id = p_id and clinic_id = v_clinic for update;
  if not found then
    raise exception 'cost_reset_product_missing' using hint = 'المادة مو موجودة بمخزن العيادة — حدّث الصفحة';
  end if;
  if v_p.farm_id is not null then
    raise exception 'cost_reset_farm' using hint = 'مادة الحقل كلفتها سعر شرائها — ما إلها متوسط ينصحّح';
  end if;
  if v_p.avg_cost is distinct from p_cost then
    update products set avg_cost = p_cost where id = p_id and clinic_id = v_clinic
    returning * into v_p;
  end if;
  return jsonb_build_object('id', v_p.id, 'avg_cost', v_p.avg_cost, 'purchase_price', v_p.purchase_price);
end $$;
revoke all on function public.product_cost_reset(uuid, numeric) from public, anon;
grant execute on function public.product_cost_reset(uuid, numeric) to authenticated;

-- ── ٥) صورةُ الكشف — نصُّ 0211 حرفاً وفوقه المتوسّط ──────────────────────────────
-- «كان» و«صار» يقولان المتوسّطَ أيضاً؛ وchanged لا تذكره (purchase_effect_changed كما هي): يتبدّل بكلّ
-- شراءٍ كالرصيد، والكشفُ يسمّي المفاجأةَ لا المطلوب. صلاحيتُها كما كانت للمسجَّل، وanon لا.
create or replace function public.purchase_effect_snap(p public.products) returns jsonb
language sql immutable set search_path = public as $$
  select case when p.id is null then null else jsonb_build_object(
    'name', p.name, 'barcode', p.barcode, 'stock', p.stock,
    'purchase_price', p.purchase_price, 'sell_price', p.sell_price,
    'min_stock', p.min_stock, 'expiry_date', p.expiry_date, 'category', p.category,
-- -0255     'company_id', p.company_id, 'section_id', p.section_id, 'pooled', p.pooled) end
    'company_id', p.company_id, 'section_id', p.section_id, 'pooled', p.pooled,       -- +0255
    'avg_cost', p.avg_cost) end                                                       -- +0255
$$;
revoke all on function public.purchase_effect_snap(public.products) from public, anon;
grant execute on function public.purchase_effect_snap(public.products) to authenticated;

-- ── ٦) تسجيلُ الشراء — نصُّ 0253 حرفاً، والمتوسّطُ بنفس الـSET ───────────────────────────
-- أساسُ الاستلام _avg_base(avg_cost, purchase_price): متوسّطُ المادّة، وإلا سعرُ شرائها، والصفرُ
-- والسالبُ مجهول. المادّةُ مقفولةٌ قبل صورتها (القفلُ نفسُه الذي يأخذه التحديثُ بعد سطرين — لا ترتيبَ جديد)،
-- فالفرقُ يُحسب من الصفّ الذي يراه الـSET. ومخزنُ الحقل لا يُحسب له متوسّط.
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
                   public._avg_base(v_before.avg_cost, v_before.purchase_price), v_qty, v_cost);   -- +0255
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
                               then coalesce(public._avg_receive(coalesce(stock, 0), public._avg_base(avg_cost, purchase_price), v_qty, v_cost),   -- +0255
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
              (case when v_cost > 0 then v_cost end))                                 -- +0255
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
comment on function public.record_purchase(jsonb, jsonb) is
  'تسجيلُ فاتورةِ شراء (0166، و0205 pooled)، وتكتب منذ 0211 كشفَ ما فعلته بكلّ سطرٍ بـpurchase_effects (op=record). ومنذ 0253 لا تمحو عجزاً أكبرَ من الشراء: greatest(least(stock,0), stock + qty). ومنذ 0255 تحرّك متوسّطَ الكلفة (_avg_receive بنفس الـSET) وتكتب فرقَه على الرصيد السالب (cost_variance).';

-- ── ٧) تعديلُ الشراء — نصُّ 0253 حرفاً، والمتوسّطُ مرّةً بعد الحلقة ─────────────────────────
-- إعادةُ التطبيق لا تمسّ المتوسّط. أوّلُ لمسٍ لكلّ مادّة (سطرُها القديم، أو الجديد لمادّةٍ لم تكن
-- بالفاتورة، أو ولادتُها بالتعديل) يقفلها ويصوّر s0 وa0؛ وقيمةُ السطور بكلفتها والصفريُّ منها بـa0
-- (المجّانيُّ لا يخفّض — كالاستلام). ثمّ _avg_adjust بالرصيد النهائيّ، و«صار» بالكشف يقول النتيجة.
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
                   'vo', (select coalesce(sum(coalesce(pi.qty, 0) * (case when pi.purchase_price > 0 then pi.purchase_price else v_a0 end)), 0)   -- +0255
                            from purchase_items pi                                    -- +0255
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
                 's0', coalesce(v_after.stock, 0), 'a0', (case when v_cost > 0 then v_cost end),   -- +0255
                 'vo', 0, 'vn', 0, 'cl', (case when v_cost > 0 then v_cost end)));    -- +0255
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
                       + v_qty * coalesce((case when v_cost > 0 then v_cost end), ((v_avg -> v_pid::text) ->> 'a0')::numeric, 0),   -- +0255
                 'cl', coalesce((case when v_cost > 0 then v_cost end), ((v_avg -> v_pid::text) ->> 'cl')::numeric)));   -- +0255
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
revoke all on function public.update_purchase(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.update_purchase(uuid, jsonb, jsonb) to authenticated;
comment on function public.update_purchase(uuid, jsonb, jsonb) is
  'تعديلُ فاتورةِ شراء: يعكس السطورَ القديمة بلا حصرٍ ثمّ يبني الجديدة (0205)، ومنذ 0253 بلا حصرةٍ أخيرة. ويكتب منذ 0211 كشفَ ما فعله بـpurchase_effects (op=update). ومنذ 0255 يعيد تقييمَ الرصيد الحاضر بالمتوسّط (_avg_adjust مرّةً لكلّ مادّة بعد الحلقة)، والفواتيرُ الصادرة تبقى بكلفتها.';

-- ── ٨) الجرد — نصُّ 0217 حرفاً، ولقطةُ الكلفة من مصدرها الواحد ───────────────────────────
create or replace function public.stock_count_submit(p_lines jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic  uuid := auth_clinic();
  v_uid     uuid := auth.uid();
  v_name    text;
  l         jsonb;
  v_pid     uuid;
  v_p       record;
  v_counted numeric;
  v_diff    numeric;
  v_reason  text;
  v_note    text;
  n_match   int := 0;
  n_pending int := 0;
  -- 0217: عدٌّ بالدفعة
  lc        jsonb;
  v_lid     uuid;
  v_lc      numeric;
  v_l       record;
  v_lots    jsonb;
  v_lsum    numeric;
  v_lsys    numeric;
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'count_empty' using hint = 'ماكو سطور بالعدّ';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'count_too_many' using hint = 'أكثر من ٢٠٠ مادة بمرّة — قسّم العدّ';
  end if;
  -- مشغّلُ المنصّة داخلٌ بهويّته (0151): لا اسمَ له بسجلّ العيادة.
  v_name := case when is_platform_admin() then null else coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid)) end;

  -- 0255: موادُّ العدّ كلُّها تُقفل بالمعرّف بجملةٍ واحدة قبل الحلقة — كالبيعة وسند التلف والموافقة. الحلقةُ   -- +0255
  -- كانت تقفل بترتيب السطور، فعدّان (أو عدٌّ وسند تلف) على مادّتين مشتركتين بترتيبين متعاكسين ينسدّان.   -- +0255
  -- والمعرّفُ غيرُ الصريح لا يُلمس هنا: الحلقةُ ترفضه بـcount_bad_line كما كانت (أو تقفله هي إن قبله uuid).   -- +0255
  perform 1 from products                                                             -- +0255
   where clinic_id = v_clinic and farm_id is null                                     -- +0255
     and id in (select (x->>'product_id')::uuid from jsonb_array_elements(p_lines) x   -- +0255
                 where x->>'product_id' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')   -- +0255
   order by id for update;                                                            -- +0255

  for l in select value from jsonb_array_elements(p_lines) loop
    begin
      v_pid := (l->>'product_id')::uuid;
      v_counted := (l->>'counted')::numeric;
    exception when others then
      raise exception 'count_bad_line' using hint = 'سطرٌ بالعدّ ناقص أو رقمه غلط';
    end;
    if v_counted is null or not (v_counted between 0 and 1000000000) then
      raise exception 'count_bad_qty' using hint = 'العدد لازم يكون صفر أو أكثر';
    end if;

    select id, name, stock, purchase_price, pooled into v_p
      -- مخزنُ الحقل (0191) خارج: له جردُه بصفحته، ولا يختلط بمال العيادة.
      from products where id = v_pid and clinic_id = v_clinic and farm_id is null
      for update;
    if not found then
      raise exception 'count_product_missing' using hint = 'مادةٌ بالعدّ ما موجودة بمخزن العيادة — حدّث الصفحة';
    end if;
    if coalesce(v_p.pooled, false) then
      raise exception 'count_pooled'
        using hint = format('«%s» رصيدها بمخزون القسم — تنعدّ من «تعديل / جرد» القسم', v_p.name);
    end if;

    -- 0217: عدٌّ بالدفعة — كلُّ دفعةٍ بعددها، والمادةُ = مجموعُ المعدود + ما لم يُعدّ من دفعاتها.
    v_lots := null;
    if jsonb_typeof(l->'lots') = 'array' and jsonb_array_length(l->'lots') > 0 then
      v_lots := '[]'::jsonb; v_lsum := 0; v_lsys := 0;
      for lc in select value from jsonb_array_elements(l->'lots') loop
        begin
          v_lid := (lc->>'lot_id')::uuid;
          v_lc := (lc->>'counted')::numeric;
        exception when others then
          raise exception 'count_bad_line' using hint = 'سطرٌ بالعدّ ناقص أو رقمه غلط';
        end;
        if v_lc is null or not (v_lc between 0 and 1000000000) then
          raise exception 'count_bad_qty' using hint = 'العدد لازم يكون صفر أو أكثر';
        end if;
        if v_lots @> jsonb_build_array(jsonb_build_object('lot_id', v_lid)) then
          raise exception 'count_bad_line' using hint = 'دفعةٌ مكرّرة بنفس العدّ';
        end if;
        select id, qty, expiry_date into v_l from product_lots
         where id = v_lid and product_id = v_pid and clinic_id = v_clinic;
        if not found then
          raise exception 'count_lot_missing' using hint = format('«%s»: دفعةٌ بالعدّ ما موجودة — حدّث الصفحة', v_p.name);
        end if;
        v_lots := v_lots || jsonb_build_array(jsonb_build_object('lot_id', v_lid, 'expiry_date', v_l.expiry_date, 'system', v_l.qty, 'counted', v_lc));
        v_lsum := v_lsum + v_lc;
        v_lsys := v_lsys + v_l.qty;
      end loop;
      v_counted := v_lsum + greatest(coalesce(v_p.stock, 0) - v_lsys, 0);
    end if;

    v_diff := v_counted - coalesce(v_p.stock, 0);
    v_reason := nullif(btrim(coalesce(l->>'reason', '')), '');
    v_note := left(nullif(btrim(coalesce(l->>'note', '')), ''), 200);
    if v_diff = 0 then
      v_reason := null;
    elsif v_diff < 0 and (v_reason is null or v_reason not in ('damaged', 'expired', 'shortage', 'entry_error')) then
      raise exception 'count_reason'
        using hint = format('«%s» ناقصة — اختر السبب: تالف، منتهي، عجز، أو خطأ إدخال', v_p.name);
    elsif v_diff > 0 and (v_reason is null or v_reason not in ('found', 'entry_error')) then
      raise exception 'count_reason'
        using hint = format('«%s» زايدة — اختر السبب: لقينا زيادة، أو خطأ إدخال', v_p.name);
    end if;

    -- معلَّقٌ ينتظر المدير لا يُلغيه عدٌّ جديد: عدٌّ «مطابق» من موظفٍ آخر كان سيمحو
    -- النقصَ قبل أن يراه أحد. المديرُ يوافق أو يرفض، ثمّ تُعدّ المادةُ من جديد.
    if exists (select 1 from stock_counts where clinic_id = v_clinic and product_id = v_pid and status = 'pending') then
      raise exception 'count_already_pending'
        using hint = format('«%s» عدّها أحد وتنتظر موافقة المدير — يوافق أو يرفض أوّلاً', v_p.name);
    end if;

    insert into stock_counts (clinic_id, product_id, product_name, system_qty, counted_qty, unit_cost,
                              reason, note, status, counted_by, counted_by_name, lot_counts)
    values (v_clinic, v_pid, v_p.name, coalesce(v_p.stock, 0), v_counted,
-- -0255             greatest(coalesce(v_p.purchase_price, 0), 0), v_reason, v_note,
            -- 0255: لقطةُ الكلفة من مصدرها الواحد (المتوسّطُ، وإلا سعرُ الشراء) — كسند التلف (0254).   -- +0255
            (select public.stock_unit_cost(p) from products p where p.id = v_pid and p.clinic_id = v_clinic), v_reason, v_note,   -- +0255
            (case when v_diff = 0 then 'matched' else 'pending' end), v_uid, v_name, v_lots);
    if v_diff = 0 then n_match := n_match + 1; else n_pending := n_pending + 1; end if;
  end loop;

  return jsonb_build_object('matched', n_match, 'pending', n_pending);
end $$;
revoke all on function public.stock_count_submit(jsonb) from public, anon;
grant execute on function public.stock_count_submit(jsonb) to authenticated;

-- ── ٩) الدمجُ يزن الكلفتين — نصُّ 0254 حرفاً وفوقه أسطرٌ معلَّمة ─────────────────────────
-- المحفّزُ يجري بعد كتابة merged_into وقبل حذف التوأم وقبل أن يتحرّك رصيدُ الأصل (0184) — فالمادّتان
-- حيّتان برصيدَيهما قبل الدمج. والمحفّزُ نفسُه من 0252 (لا يُعاد إنشاؤه).
create or replace function public.products_trash_consumption()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c product_stock_carry; v_keep text;
        v_kp products; v_tw products; v_avg numeric;                                  -- +0255
begin
  if new.merged_into = new.id then return null; end if;
  if not exists (select 1 from auth.users u where u.id = new.clinic_id) then return null; end if;
  select p.name into v_keep from products p where p.id = new.merged_into and p.clinic_id = new.clinic_id;
  -- 0254: سنداتُ التلف تتبع التوأمَ إلى أصله قبل حذفه — ومعلَّقان على مادّةٍ واحدة يُرفضان بالاسم. -- +0254
  if exists (select 1 from stock_counts w -- +0254
              where w.product_id = new.id and w.clinic_id = new.clinic_id and w.source = 'waste' and w.status = 'pending') then -- +0254
    perform 1 from products where clinic_id = new.clinic_id and id in (new.id, new.merged_into) order by id for update; -- +0254
    if exists (select 1 from stock_counts w -- +0254
                where w.product_id = new.merged_into and w.clinic_id = new.clinic_id and w.status = 'pending') then -- +0254
      raise exception 'merge_waste_pending' using hint = format( -- +0254
        '«%s» عليها سند تلف ينتظر، و«%s» عليها جرد أو سند ينتظر — خلّي المدير يبتّ بيهم قبل الدمج', -- +0254
        coalesce(new."row"->>'name', ''), coalesce(v_keep, '')); -- +0254
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
   where product_id = new.id and clinic_id = new.clinic_id and source = 'waste' -- +0254
     and exists (select 1 from products k where k.id = new.merged_into and k.clinic_id = new.clinic_id); -- +0254
  -- ومادّةُ السطر المعبّأ من فاتورة تتبعه كدفتر الفاتورة (بلا شرط) — ولو أفرغ حذفٌ سابقٌ product_id: القارئُ يقولها. -- +0254
  update stock_counts set source_product = new.merged_into -- +0254
   where source_product = new.id and clinic_id = new.clinic_id; -- +0254
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

-- ── ١٠) البيعة — نصُّ 0252 حرفاً، وسطرُ المادّة بكلفة الخادم بالحلقتين ────────────────────
-- الخطّةُ (0252) قفلت كلَّ مادّةٍ بالسلّة قبل الحلقة الأولى، والبيعةُ لا تحرّك متوسّطاً ولا سعراً —
-- فالحلقتان تريان الكلفةَ نفسها: cost_total صحيحٌ لحظةَ إدراج الفاتورة، والسطرُ يُدرج بها.
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
  -- 0252: خطّةُ المستهلكات (_consumption_plan)، وسطرُها، وكلفةُ السطر، ومعرّفاتُ السطور المدرجة. -- +0252
  v_plan     jsonb;                                                                  -- +0252
  v_pl       jsonb;                                                                  -- +0252
  v_n        int := 0;                                                               -- +0252
  v_uc       numeric;                                                                -- +0252
  v_item     uuid;                                                                   -- +0252
  v_ids      jsonb := '{}'::jsonb;                                                   -- +0252
  v_ap       record;                                                                 -- +0252
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

  -- 0252: خطّةُ المستهلكات — بعد فحص الإعادة وكتلة التأريخ وقبل أيّ كتابة: كلُّ رفضٍ فيها بلا أثر، -- +0252
  -- وتقفل كلَّ مادّةٍ تمسّها السلّة بالمعرّف. السطرُ المخطَّط كلفتُه من الخادم لا من الجهاز. -- +0252
  v_plan := _consumption_plan(v_clinic, p_items);                                     -- +0252

  for it in select * from jsonb_array_elements(p_items) loop
    v_qty := (it->>'qty')::numeric;
    v_subtotal := v_subtotal + v_qty * (it->>'unit_price')::numeric;
-- -0252     v_cost     := v_cost     + v_qty * (it->>'unit_cost')::numeric;
    v_n  := v_n + 1;                                                                  -- +0252
    v_pl := v_plan->'lines'->(v_n::text);                                             -- +0252
    v_uc := case when coalesce((v_pl->>'planned')::boolean, false) then (v_pl->>'uc')::numeric   -- +0252
                 else (it->>'unit_cost')::numeric end;                                -- +0252
    -- 0255: سطرُ المادّة (موجباً أو مرجَّعاً بالسلّة) بكلفة الخادم: متوسّطُ المادّة لعلبتها أو لوحدتها   -- +0255
    -- الصغيرة — وكلفةُ الجهاز تبقى لمادّةٍ لا يعرفها الخادم أو من الحقل (_product_line_cost).   -- +0255
    if nullif(it->>'product_id','') is not null then                                  -- +0255
      v_uc := _product_line_cost(v_clinic, nullif(it->>'product_id','')::uuid, v_qty, -- +0255
                                 nullif(it->>'stock_qty','')::numeric, (it->>'unit_cost')::numeric);   -- +0255
    end if;                                                                           -- +0255
    v_cost     := v_cost     + v_qty * v_uc;                                          -- +0252
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

    v_n := 0;                                                                         -- +0252
    for it in select * from jsonb_array_elements(p_items) loop
      v_qty    := (it->>'qty')::numeric;
      v_n  := v_n + 1;                                                                -- +0252
      v_pl := v_plan->'lines'->(v_n::text);                                           -- +0252
      v_uc := case when coalesce((v_pl->>'planned')::boolean, false) then (v_pl->>'uc')::numeric   -- +0252
                   else (it->>'unit_cost')::numeric end;                              -- +0252
      -- 0255: نفسُ كلفة الحلقة الأولى — المادّةُ مقفولةٌ من الخطّة، والبيعةُ لا تحرّك متوسّطاً.   -- +0255
      if nullif(it->>'product_id','') is not null then                                -- +0255
        v_uc := _product_line_cost(v_clinic, nullif(it->>'product_id','')::uuid, v_qty,   -- +0255
                                   nullif(it->>'stock_qty','')::numeric, (it->>'unit_cost')::numeric);   -- +0255
      end if;                                                                         -- +0255
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
-- -0252       insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, created_at)
      insert into invoice_items (invoice_id, clinic_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, created_at, service_id)   -- +0252
      values (
        v_invoice.id, v_clinic,
        nullif(it->>'product_id','')::uuid,
        coalesce(it->>'name', 'Item'),
        it->>'barcode',
        v_qty,
        (it->>'unit_price')::numeric,
-- -0252         (it->>'unit_cost')::numeric,
        v_uc,                                                                         -- +0252
        v_qty * (it->>'unit_price')::numeric,
        v_stockq,
        v_fp,
        nullif(it->>'unit_label',''),
-- -0252         v_invoice.created_at
-- -0252       );
        v_invoice.created_at,                                                         -- +0252
        nullif(v_pl->>'svc','')::uuid                                                 -- +0252
      ) returning id into v_item;                                                     -- +0252
      v_ids := v_ids || jsonb_build_object(v_n::text, jsonb_build_object('i', v_item, 'q', v_qty));   -- +0252
    end loop;
    -- 0252: الاستهلاكُ بعد آخر سطر — كلُّ سطور المواد خصمت قبله — وبنفس الكتلة: خرقُ الإعادة -- +0252
    -- المتزامنة يتراجع عن الدفتر والتخطّي والمرحَّل والرصيد معاً. ثم تخطّياتُ السطور (source 'none'). -- +0252
    for v_ap in select l.key::int as n, l.value as pl                                 -- +0252
                  from jsonb_each(coalesce(v_plan->'lines', '{}'::jsonb)) l           -- +0252
                 where coalesce((l.value->>'planned')::boolean, false)                -- +0252
                 order by 1 loop                                                      -- +0252
      perform _consumption_apply(v_clinic, v_invoice.id, (v_ids->(v_ap.n::text)->>'i')::uuid,   -- +0252
                                 (v_ids->(v_ap.n::text)->>'q')::numeric, v_ap.pl);    -- +0252
    end loop;                                                                         -- +0252
    insert into invoice_consumption_skips (clinic_id, invoice_id, item_id, service_id, line_name, line_qty, note, source,   -- +0252
                                           created_by)                                -- +0252
    select v_clinic, v_invoice.id, (v_ids->(s->>'n')->>'i')::uuid, nullif(s->>'svc','')::uuid,   -- +0252
           coalesce(s->>'name', 'Item'), (v_ids->(s->>'n')->>'q')::numeric, s->>'note', 'none',   -- +0252
           (case when platform_acting_clinic() is null then auth.uid() end)           -- +0252
      from jsonb_array_elements(coalesce(v_plan->'line_skips', '[]'::jsonb)) s;       -- +0252
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

-- ── ١١) التعديل — نصُّ 0252 حرفاً، والسطرُ الجديد بكلفة الخادم ──────────────────────────
-- سطرُ مادّةٍ يعود بمعرّف سطرٍ قديمٍ بنفس المادّة يبقى بالكلفة التي يحملها (DeliveryEditDialog يرسل كلفتَه
-- المحفوظة): الفاتورةُ القديمة لا تُعاد كتابتُها. وما سواه سطرٌ جديد بكلفة الخادم كالبيعة. داخليّةٌ بلا منح.
create or replace function public.edit_invoice_lines_unguarded(p_invoice uuid, p_lines jsonb, p_note text default null)
returns invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic   uuid := auth_clinic();
  v_invoice  invoices;
  v_old_total numeric(12,2);
  v_old_count int;
  v_new_count int;
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_items    numeric(12,3) := 0;
  v_paid     numeric(12,2);
  v_discount numeric(12,2);
  v_total    numeric(12,2);
  v_stamp    text;
  r          record;
  l          record;
  v_stock_qty numeric(12,3);
  v_from_stock numeric(12,3);
  v_from_pool  numeric(12,3);
  v_avail      numeric(12,3);
  v_prod       products;
  v_pool       numeric(12,3);
  v_forg_old   numeric;
  v_forg_new   numeric;
  -- 0252: خدمةُ كلّ سطرٍ قبل الحذف، والسطرُ المدرج، والروابطُ (قديم ← جديد)، ومعرّفاتُ المصدر. -- +0252
  v_old_svc    jsonb;                                                                -- +0252
  v_new_item   uuid;                                                                 -- +0252
  v_relinks    jsonb := '[]'::jsonb;                                                 -- +0252
  v_seen       uuid[] := '{}';                                                       -- +0252
  v_rl         jsonb;                                                                -- +0252
  -- 0255: مادّةُ كلّ سطرٍ قبل الحذف، وكلفةُ السطر المعاد.                            -- +0255
  v_old_prod   jsonb;                                                                 -- +0255
  v_uc         numeric;                                                               -- +0255
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  -- 0241: قفلُ الصفّ — التعديلُ يكتب forgiven من قراءته، فلا يسبقه خصمٌ من جهازٍ آخر.
  select * into v_invoice from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  if v_invoice.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'empty invoice';
  end if;

  -- 0252: منتجاتُ الفاتورة (سطورُها ودفترُها) ومنتجاتُ السطور الجديدة تُقفل بالمعرّف قبل أوّل كتابةٍ -- +0252
  -- على رصيد — بترتيب البيعة، لا بترتيب السطور. -- +0252
  perform _invoice_lock_products(v_clinic, p_invoice,                                -- +0252
    (select coalesce(array_agg((e->>'product_id')::uuid), '{}'::uuid[])               -- +0252
       from jsonb_array_elements(p_lines) e where nullif(e->>'product_id','') is not null));   -- +0252

  v_old_total := coalesce(v_invoice.total, 0);
  select count(*) into v_old_count from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ١) العكس الكامل: نفس تقسيم refund_invoice بالضبط ────────────────────
  for r in
    select ii.product_id, ii.qty, ii.stock_qty, ii.pooled_qty, p.section_id
      from invoice_items ii
      left join products p on p.id = ii.product_id and p.clinic_id = v_clinic
     where ii.invoice_id = p_invoice and ii.clinic_id = v_clinic
  loop
    if r.product_id is not null then
      if coalesce(r.pooled_qty, 0) > 0 and r.section_id is not null then
        update company_sections set pooled_stock = pooled_stock + r.pooled_qty
          where id = r.section_id and clinic_id = v_clinic;
        update products set stock = stock + (coalesce(r.stock_qty, r.qty) - r.pooled_qty)
          where id = r.product_id and clinic_id = v_clinic;
      else
        update products set stock = stock + coalesce(r.stock_qty, r.qty)
          where id = r.product_id and clinic_id = v_clinic;
      end if;
    end if;
  end loop;

  -- 0252: خدمةُ كلّ سطرٍ قبل حذفه — السطرُ المعاد يرثها بمعرّفه، وإلا ضاع ما يربطه بوصفته. -- +0252
  select coalesce(jsonb_object_agg(id::text, service_id), '{}'::jsonb) into v_old_svc   -- +0252
    from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic and service_id is not null;   -- +0252
  -- 0255: ومادّةُ كلّ سطرِ مادّة — سطرٌ يعود بمعرّفه ومادّتِه يبقى بالكلفة التي يحملها (الفاتورةُ القديمة   -- +0255
  -- لا تُعاد كتابتُها)، وما سواه سطرٌ جديد كلفتُه من الخادم.                         -- +0255
  select coalesce(jsonb_object_agg(id::text, product_id), '{}'::jsonb) into v_old_prod   -- +0255
    from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic and product_id is not null;   -- +0255
  delete from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;

  -- ─── ٢) إعادة الخصم: المعروف أولاً ثم مخزون القسم (نفس retail_checkout) ──
  for l in
    select
      nullif(e->>'product_id','')::uuid            as product_id,
      coalesce(e->>'name','')                      as name,
      nullif(e->>'barcode','')                     as barcode,
-- -0252       coalesce((e->>'qty')::numeric, 0)            as qty,
      round(coalesce((e->>'qty')::numeric, 0), 3)  as qty,                            -- +0252
      coalesce((e->>'unit_price')::numeric, 0)     as unit_price,
      coalesce((e->>'unit_cost')::numeric, 0)      as unit_cost,
      nullif(e->>'unit_label','')                  as unit_label,
-- -0252       coalesce((e->>'stock_qty')::numeric, null)   as stock_qty_in
      coalesce((e->>'stock_qty')::numeric, null)   as stock_qty_in,                  -- +0252
      case when e->>'id' ~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$' then (e->>'id')::uuid end as src_item   -- +0252
    from jsonb_array_elements(p_lines) as e
  loop
    if l.qty <= 0 then continue; end if;
    -- كمية المخزون المسحوبة: تُمرَّر صراحةً لبيع الأجزاء، وإلا فهي الكمية نفسها.
    v_stock_qty := round(coalesce(l.stock_qty_in, l.qty), 3);
    v_from_pool := 0;
    v_from_stock := 0;

    if l.product_id is not null then
      select * into v_prod from products where id = l.product_id and clinic_id = v_clinic;
      if found then
        v_pool := 0;
        if v_prod.section_id is not null then
          select coalesce(pooled_stock, 0) into v_pool from company_sections
            where id = v_prod.section_id and clinic_id = v_clinic;
        end if;
-- -0252         v_avail := round(coalesce(v_prod.stock, 0) + coalesce(v_pool, 0), 3);
-- -0252         if v_stock_qty > v_avail + 0.0005 then
-- -0252           raise exception 'not enough stock: %', l.name;
-- -0252         end if;
        -- 0252: كالبيعة منذ 0253 (deduct_stock_pooled) بلا رفض: الحوضُ يأخذ ما زاد على الرصيد الموجب، -- +0252
        -- والرصيدُ يعطي الباقي ولو صار سالباً — بكتابةٍ واحدة بعد الحوض، والعكسُ يردّ stock_qty − pooled_qty. -- +0252
        v_from_stock := least(v_stock_qty, greatest(coalesce(v_prod.stock, 0), 0));
-- -0252         if v_from_stock > 0 then
-- -0252           update products set stock = round(stock - v_from_stock, 3)
-- -0252             where id = l.product_id and clinic_id = v_clinic;
-- -0252         end if;
        if v_stock_qty - v_from_stock > 0 and v_prod.section_id is not null then
          v_from_pool := least(v_stock_qty - v_from_stock, greatest(coalesce(v_pool, 0), 0));
          if v_from_pool > 0 then
            update company_sections set pooled_stock = round(pooled_stock - v_from_pool, 3)
              where id = v_prod.section_id and clinic_id = v_clinic;
          end if;
        end if;
        if v_stock_qty - v_from_pool > 0 then                                          -- +0252
          update products set stock = round(coalesce(stock, 0) - (v_stock_qty - v_from_pool), 3)   -- +0252
            where id = l.product_id and clinic_id = v_clinic;                          -- +0252
        end if;                                                                        -- +0252
      end if;
    end if;

    -- 0255: سطرُ مادّةٍ جديد (لا معرّفَ لسطرٍ قائمٍ بنفس المادّة) بكلفة الخادم كالبيعة، والقائمُ بكلفته.   -- +0255
    v_uc := case when l.product_id is null then l.unit_cost                           -- +0255
                 when l.src_item is not null and (v_old_prod->>(l.src_item::text))::uuid = l.product_id then l.unit_cost   -- +0255
                 else _product_line_cost(v_clinic, l.product_id, l.qty, l.stock_qty_in, l.unit_cost) end;   -- +0255
-- -0252     insert into invoice_items (clinic_id, invoice_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label)
    insert into invoice_items (clinic_id, invoice_id, product_id, name, barcode, qty, unit_price, unit_cost, line_total, stock_qty, pooled_qty, unit_label, service_id)   -- +0252
-- -0255     values (v_clinic, p_invoice, l.product_id, l.name, l.barcode, l.qty, l.unit_price, l.unit_cost,
    values (v_clinic, p_invoice, l.product_id, l.name, l.barcode, l.qty, l.unit_price, v_uc,   -- +0255
-- -0252             round(l.qty * l.unit_price, 2), v_stock_qty, v_from_pool, l.unit_label);
            round(l.qty * l.unit_price, 2), v_stock_qty, v_from_pool, l.unit_label,   -- +0252
            case when l.product_id is null then (v_old_svc->>(l.src_item::text))::uuid end)   -- +0252
    returning id into v_new_item;                                                    -- +0252
    -- 0252: سطرُ خدمةٍ بمعرّف سابقه يُربط به — ومعرّفٌ مرّتين يصرف موادَّه مرّتين، فيُرفض بصوت. -- +0252
    if l.product_id is null and l.src_item is not null then                          -- +0252
      if l.src_item = any(v_seen) then                                               -- +0252
        raise exception 'edit_line_twice'                                            -- +0252
          using hint = 'سطر الفاتورة مكرّر بالتعديل — سكّر النافذة وافتحها من جديد';   -- +0252
      end if;                                                                        -- +0252
      v_seen := v_seen || l.src_item;                                                -- +0252
      v_relinks := v_relinks || jsonb_build_array(jsonb_build_object('from', l.src_item, 'to', v_new_item, 'qty', l.qty));   -- +0252
    end if;                                                                          -- +0252

    v_subtotal := v_subtotal + round(l.qty * l.unit_price, 2);
-- -0255     v_cost     := v_cost     + round(l.qty * l.unit_cost, 2);
    v_cost     := v_cost     + round(l.qty * v_uc, 2);                                -- +0255
    v_items    := v_items    + l.qty;
    v_new_count := coalesce(v_new_count, 0) + 1;
  end loop;

  if coalesce(v_new_count, 0) = 0 then raise exception 'empty invoice'; end if;

  -- 0252: الربطُ بعد حلقة الإدراج كلِّها (سطورُ المواد خصمت قبله): كلُّ مواصفةٍ للقديم تُنسخ بقيمها -- +0252
  -- المجمَّدة إلى كمية الجديد، وتخطّياتُه تُكتب عليه تاريخاً. محفّزُ الحذف ردّ القديم إلى صفر. -- +0252
  for v_rl in select x from jsonb_array_elements(v_relinks) x loop                     -- +0252
    perform _consumption_relink(v_clinic, p_invoice, (v_rl->>'from')::uuid, (v_rl->>'to')::uuid, (v_rl->>'qty')::numeric);   -- +0252
  end loop;                                                                          -- +0252

  -- ─── ٣) إعادة الحساب: المدفوع لا يُمَس، وأجرة التوصيل سطرٌ محسوب أصلاً ───
  v_discount := greatest(coalesce(v_invoice.discount, 0), 0);
  v_total    := greatest(round(v_subtotal - v_discount, 2), 0);
  v_paid     := coalesce(v_invoice.amount_paid, 0);
  -- 0241: الخصمُ على الدين لا يبقى أكبرَ من الدين الذي كان يُسقطه — ما نقص يُستهلك.
  v_forg_old := coalesce(v_invoice.forgiven, 0);
  v_forg_new := least(v_forg_old, greatest(0, v_total - v_paid));
  v_total    := round(v_total - v_forg_new, 2);

  -- ختم سبب التعديل داخل الفاتورة: يبقى ملازماً لها ويظهر بطباعتها. سجل
  -- الحركات يلتقط الفعل نفسه آلياً عبر محفّزات 0018/0044.
  v_stamp := 'تعديل ' || to_char(now(), 'YYYY-MM-DD') || ': '
          || v_old_count || '→' || v_new_count || ' سطر · '
          || to_char(v_old_total, 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when coalesce(btrim(p_note), '') <> '' then ' · ' || left(btrim(p_note), 120) else '' end;

  if v_forg_new < v_forg_old then
    perform invoice_forgiveness_consume(v_clinic, p_invoice, v_forg_old - v_forg_new, 'تعديل', v_old_total, v_paid);
  end if;

  update invoices set
    subtotal   = v_subtotal,
    total      = v_total,
    forgiven   = v_forg_new,
    cost_total = v_cost,
    profit     = round(v_total - v_cost, 2),
    item_count = v_items,
    notes      = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_invoice;

  -- مستحقّ السواق يتبع الإجمالي الجديد فوراً — لا يجمع مبلغاً قديماً أبداً.
  update delivery_orders
     set cod_amount = greatest(round(v_total - v_paid, 2), 0)
   where invoice_id = p_invoice and clinic_id = v_clinic
     and status in ('preparing', 'out');

  return v_invoice;
end $$;
revoke all on function public.edit_invoice_lines_unguarded(uuid, jsonb, text) from public, anon, authenticated;

-- ── ١٢) الأسلاك — نصُّ 0252 حرفاً وفوقه مجموعةُ 0255 ───────────────────────────────────
-- verify_consumption_wiring() يجب أن ترجع صفراً. نزلت 0255 (إحدى دوالّها تحمل علامتَها، أو
-- product_cost_reset موجودة) ⇒ أجسامُها السبعة بعلامتها، ومحفّزُ products_guard_avg حاضرٌ مُفعَّل —
-- فإعادةُ 0253 أو 0254 وحدها (تُرجع الشراءَ أو طيَّ الدمج لنصّها، وعلامتُها فيه) تُقال هنا.
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
    ('0255', 'public.purchase_effect_snap(products)')                                 -- +0255
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

reset lock_timeout;
