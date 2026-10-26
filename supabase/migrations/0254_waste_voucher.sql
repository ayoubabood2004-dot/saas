-- ============================================================================
-- ٠٢٥٤ — سندُ التلف: يُسجَّل على أيّ رصيد، ويُطبَّق فرقاً بالضبط بلا حصر، ولا يضيع بدمجٍ ولا حذف،
--        ويتذكّر الفاتورةَ التي عُبّي منها
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- • موافقةُ الجرد (stock_count_decide، 0217:608) تحصر بصفر: `greatest(old + فرق, 0)`، والفرقُ
--   المسجَّل (applied_delta، :621) يُحسب من المحصور، والسحبُ (:639) لا يُكتب إلا لفرقٍ سالب.
--   والاستهلاكُ (0252) يجعل السالبَ روتيناً: عدٌّ معلَّقٌ «النظام ٠٫٠٤٠ والمعدود ٠٫٠٢٠» ثم خدمةٌ أنزلت
--   الرصيدَ إلى −٠٫٠١٠ ⇒ الموافقةُ **ترفعه** إلى صفر (+٠٫٠١٠) ولا تكتب خسارة — والتالفُ الحقيقيّ يختفي
--   والرصيدُ الوهميّ يظهر (هوّتا M1/B2).
-- • والتلفُ لا يُكتب إلا عدّاً: «المعدود = الرصيد − التالف» لا يُمثَّل على رصيدٍ ناقص أو سالب
--   (`counted_qty` ≥ ٠، 0216:80) — فالعجزُ يصير «زيادة» بالعدّ التالي (M2). وما دون ٠٫٠٠١ لا يُكتب
--   أصلاً: ١٠ مل من مكعّب ٢٠ لتراً = ٠٫٠٠٠٥ — سندُ «سجّلها هدر» بعد ترجيع خدمةٍ يُسقطه (M16).
-- • ودمجُ المادّة أو حذفُها يُفرغ `product_id` بسطر الجرد المعلَّق (0216:76)، والموافقةُ تُبطله (void،
--   0217:600) — تلفٌ ينتظر المديرَ (اليوم: عدٌّ بسبب «تالف») يضيع وخسارتُه لا تُكتب أبداً (M11).
-- • وسندُ «سجّلها هدر» بعد ترجيع خدمةٍ يُعبّأ من الفاتورة، والسندُ لا يعرف من أيّ فاتورةٍ ولا من أيّ ترجيعٍ
--   عُبّي: ترجيعٌ ثانٍ على الفاتورة نفسها (مرتجعٌ جزئيّ ثمّ ترجيع، أو تعديلان) أو رابطٌ فُتح مرّتين يعبّي
--   ما سُجّل هدراً ثانيةً — فيُشطب مرّتين بعد الموافقة.
--
-- ── القرار (المالك، ٣١/١٠) ────────────────────────────────────────────────
-- • لا منعَ ولا حصر: الرصيدُ ينزل سالباً، والموافقةُ تقول أيَّ مادّةٍ بقيت تحت الصفر (negatives).
-- • سندُ التلف يكتبه أيُّ موظف (الواجهةُ تحرسه بـmanageInventory، والمصوّرُ لا)، ويوافق عليه المديرُ
--   وحده كالجرد اليوم؛ و«سجّل وطبّق» فوراً للمدير وحده (waste_needs_manager).
-- • الاستعمالُ الداخليّ (كفوف التنظيف) يُسجَّل «تالف» بملاحظة — لا سببَ جديد.
-- • ترجيعُ خدمةٍ انسوت لا يكتب خسارةً تلقائية (0252): الشاشةُ تعرض هذا السندَ معبّأً، والمديرُ يقرّر.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- * السندُ صفٌّ بـstock_counts بـ`source = 'waste'` مكتوبٌ **فرقاً**: system_qty = المقدارُ التالف d
--   بوحدة المخزون بالضبط (٩ منازل)، counted_qty = ٠. فكلُّ قيدٍ قائم يصحّ (المعدودُ بين ٠ و1e9،
--   والفرقُ يفرض السبب)، وكلُّ قارئٍ للفرق يرى −d (الموافقة، report_stock_losses، diffValue بالشاشة)،
--   والسندُ يصحّ على −٠٫٠٢. ومعلَّقٌ واحدٌ لكلّ مادّة يجمع الجردَ والسند (الفهرسُ وفحصُ العدّ نفسه) —
--   فلا ينتظر جردٌ وسندٌ معاً فتُحسب العلبةُ المكسورةُ مرّتين. والأعمدةُ: entered_qty/entered_unit
--   (كما كُتبت)، unit_label (لقطةُ الوحدة الصغيرة)، posted (ما كتبته الموافقةُ بالرصيد عبر المرحَّل).
-- * stock_waste_submit(lines, apply, meta): ١–٥٠ سطراً لموادَّ مختلفة، كلُّ مادّةٍ مقفولةٌ بالمعرّف،
--   وكلُّ رفضٍ برمزه وتلميحه — وفوق الرصيد «أكّد مرّة ثانية» (ack_over) لا منع. مرجعُ الجهاز
--   (client_ref) عبر rpc_refs (0136): الإعادةُ ترجع النتيجةَ الأولى ولا تسجّل ولا تسحب مرّتين.
-- * stock_count_decide (نصُّ 0217 حرفاً وفوقه أسطرٌ معلَّمة): الجردُ يطبّق فرقَه **بلا حصر**
--   (round(old + فرق, 3))؛ والسندُ يُرحَّل −d بالضبط عبر `_stock_post(…, 'external')` (المرحَّل يحمل
--   ما دون ٠٫٠٠١ كاستهلاك 0252، والثابتُ يبقى بـext_in/ext_out) بلا تحديثٍ مباشر للمادّة، وفرقُه
--   المسجَّل −d حرفاً. والسحبُ كما هو: «سحب مخزن» بطريقة stock، والسندُ يُكتب بما أُدخل ووحدته
--   («Lyse ×2 مل»). والنتيجةُ تزيد مفتاحاً واحداً: negatives. وموادُّ نصّ السحب وnegatives بترتيب البايت
--   (collate "C") ثمّ المعرّف: الترتيبُ الافتراضيّ يتبع لغةَ القاعدة، فنصُّ سحبٍ واحد كان يُكتب بترتيبين.
-- * stock_count_state (نصُّ 0216 وسطرٌ واحد): السندُ ليس عدّاً — لا يجعل المادّةَ «معدودةً اليوم».
-- * products_trash_consumption (نصُّ 0252 وفوقه أسطرٌ معلَّمة): الدمجُ ينقل سنداتِ التوأم كلَّها
--   لأصله قبل حذفه — ويرفض أوّلاً (merge_waste_pending) إن كان للتوأم سندٌ معلَّق وللأصل جردٌ أو سندٌ
--   معلَّق. وproducts_waste_guard قبل الحذف: مادّةٌ عليها سندٌ معلَّق لا تُحذف حتى يبتّ المدير
--   (product_waste_pending) — والجردُ المعلَّق كما اليوم (المفتاحُ يُفرغه والموافقةُ تُبطله).
-- * السندُ يتذكّر فاتورتَه: stock_counts.source_invoice وsource_batches — سطرٌ عُبّي من فاتورةٍ رجعت
--   موادُّها يحفظ مرجعَها ودفعاتِ الترجيع التي عُبّي منها (at_us = _cons_at_us لأحداث دفترها، تصاعدياً،
--   وكلتاهما لسطرٍ من فعلين بنافذة إشعارٍ واحدة)، ومادّتَه لحظةَ تسجيله (source_product: حذفُ المادّة يُفرغ
--   product_id ولا يُفرغها). وstock_waste_submit يرفض مرجعاً لا يطابق الدفتر (waste_source_bad، والدفعاتُ فوق
--   المئة منه) ومطالبةً ثانية بما سُجّل من الفاتورة معلَّقاً أو مطبَّقاً (waste_source_taken — قاعدةُ الشاشة نفسُها،
--   فتبويبٌ ثانٍ أو جهازٌ ثانٍ بعد «سجّل وطبّق» لا يشطب مرّتين) قبل أيّ كتابة، والإعادةُ بنفس client_ref ترجع
--   النتيجةَ الأولى كما هي.
-- * invoice_consumption_get (نصُّ 0252 حرفاً وفوقه أسطرٌ معلَّمة — ومنه by_weight للمواصفة والمادّة السالبة): waste =
--   سطورُ السند المسجّلة من الفاتورة، معلَّقةً أو مطبَّقة، بدفعاتها — فالشاشةُ لا تعبّي ما سُجّل. ومادّتُها كمادّة
--   المواصفات: طيُّ الدمج ينقل سنداتِ التوأم للأصل بأيّ حالةٍ كما ينقل الدفتر، والفكُّ لا يردّ هذا ولا ذاك.
--
-- ── المقيس (الحزمةُ المحلّية، ٣١/١٠ و١/١١، كلُّ حالةٍ على صفٍّ جديد) ─────────────
--   سرنجة ٥cc عند ٠٫٠٤٠ (علبة ١٠٠ بـ٢٥٬٠٠٠): سندُ ٢ سرنجة معلَّق، خمسُ حُقنٍ ⇒ −٠٫٠١٠، الموافقة:
--     الرصيدُ −٠٫٠٣٠، الفرقُ −٠٫٠٢، سحبٌ ٥٠٠٫٠٠ «سحب مخزن — تالف: سرنجة 5cc ×2 سرنجة»،
--     وتقريرُ الخسائر ٠٫٠٢ / ٥٠٠٫٠٠، وnegatives تسمّيها، و«عدّ اليوم» لا يراه.
--   كفوفٌ عند −٠٫٠٦٠ (١٢٬٥٠٠): سندُ نصف علبة ⇒ waste_exceeds_stock، وبالتأكيد ⇒ −٠٫٥٦٠ و٦٬٢٥٠٫٠٠.
--   ١٠ مل Diluent (٢٠٬٠٠٠ مل بـ١٥٠٬٠٠٠): d = ٠٫٠٠٠٥، المرحَّلُ ext_in ٠٫٠٠٠٥، السحبُ ٧٥٫٠٠، والثابتُ صحيح.
--   جردٌ «٠٫٠٤٠ ⇒ ٠٫٠٢٠» معلَّق ثم استهلاكٌ إلى −٠٫٠١٠: قبلُ ٠ وفرقٌ +٠٫٠١٠ بلا خسارة · بعدُ −٠٫٠٣٠
--     وخسارةُ ٠٫٠٢ × الكلفة.
--   فاتورةٌ رجعت موادُّها بمرتجعين (دفعتان): سطرُ Diluent من الاثنتين (أُرسلتا معكوستين) يُحفظ تصاعدياً
--     وwaste يقولهما بأعداد moves نفسها؛ المرفوضُ يسقط من waste والمطبَّقُ يبقى؛ وخمسةٌ وعشرون مرجعاً تالفاً
--     ⇒ waste_source_bad بلا صفٍّ ولا مرجعٍ محجوز، والإعادةُ بنفس client_ref ترجع الأولى ولو صار مرجعُها مرفوضاً.
--   الدمجُ ينقل المعلَّقَ والمطبَّق للأصل كالمواصفات، والفكُّ لا يردّ أيّاً منهما. أمّا حذفُ المادّة (لا دمجُها)
--     فيُفرغ product_id بالمطبَّق (0216: on delete set null) والمواصفةُ تحفظ معرّفَها، ويبقى فارغاً بعد الاسترجاع —
--     فالقارئُ يقول مادّتَه من source_product (٢/١١، أدناه).
--   (٢/١١) مرتجعٌ واحد، والمحلولُ منه «سجّل وطبّق» ثمّ الرابطُ نفسُه من تبويبٍ ثانٍ ومن جهاز الاستقبال: كان يُقبل مرّتين
--     (مطبَّقان وسحبان ٧٥٫٠٠ لعشرة مل رجعت مرّة، ومعلَّقٌ ثالث) ⇒ waste_source_taken بلا أثر. والفاتورةُ كلُّها (رابطٌ بلا
--     دفعات) مرّتين: الثانيةُ تُرفض، ودفعةٌ رجعت بعد سندها تُقبل، والمرفوضُ يُطالب به من جديد. وكفوفٌ مطبَّقةٌ حُذفت ثمّ
--     استرجعت: كان waste يقولها null فتُعبّأ ثانيةً ويقبلها الخادم (سحبان ١٠٠٫٠٠) ⇒ تُقال بمادّتها وتُرفض. و١٠١ دفعةً
--     ⇒ waste_source_bad قبل الحلقة (٢٤٬٠٠٠ دفعة كانت تمسك قفلَ المادّة ٤٫٤ ثانية).
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- القاعدةُ الحيّة لا تُقاس من هنا، فالهجرةُ تقيسها بنفسها: `_drift_assert` (0252) لكلّ دالّةٍ تُعاد —
-- جسمُها الحيُّ ببصمة مصدرها بالمستودع، أو بعلامتنا (إعادةُ هذه الهجرة)، وإلا رفضٌ قبل أيّ بناء
-- (درسُ 0241). والبصماتُ يفحصها `scripts/redefine-fingerprint.mjs`، والعلاماتُ وproducts_waste_guard
-- تفحصها verify_consumption_wiring() (0252) على القاعدة متى وُجدت stock_waste_submit — والقارئُ بعلامتنا
-- متى وُجد stock_counts.source_invoice. والحرّاسُ كلُّها قبل أوّل بناء، فالرفضُ لا يترك نصفَ هجرةٍ ما
-- دامت تُطبَّق طلباً واحداً؛ وباليد: `psql -1 -v ON_ERROR_STOP=1`.
--
-- تُطبَّق بعد 0252 (حارسُها و_stock_post والمرحَّل و_cons_at_us منها)، وهي مستقلّةٌ عن 0253، **وقبل
-- الواجهة** (مظلمةً: لا شاشةَ تنادي stock_waste_submit بعد، وwaste بالقارئ بشكله من 0252 — [] حتى يُسجَّل
-- سندٌ بمرجع؛ والجردُ وحده يتغيّر — بلا حصر). إضافيةٌ وتُعاد بلا أثرٍ ثانٍ (أعمدةٌ بـif not exists، وقيودٌ
-- بكتلٍ محروسة، وفهرسٌ بـif not exists، ودوالُّ ومحفّزٌ يُسقط قبل إنشائه).
-- أعِد تطبيق 0252–0255 بعد أي إعادةٍ لـ0066/0171/0184/0197/0203/0214/0216/0217/0241/0242.
-- وإعادةُ 0254 وحدها بعد 0255 تُرجع طيَّ الدمج لنصّ 0254 (جسمُ 0255 يحمل علامتَنا فيمرّ الحارس) —
-- أعِد 0255 بعدها. وإعادةُ 0252 وحدها بعد هذه تُرجع القارئَ لـwaste [] وطيَّ الدمج بلا نقل السندات — أعِد
-- 0253–0255 بعدها (verify_consumption_wiring() تقول الاثنين: «lacks -- +0254»).
--
-- تراجع (السنداتُ المعلَّقة يبتّ بها المديرُ **أوّلاً**: موافقةُ 0217 تقرؤها جرداً فتحصرها). و0255 إن
-- نزلت تُتراجع **قبلها** تراجعَها الكامل: تحتاج stock_waste_submit (needs_0254)، وطيُّها مبنيٌّ على نصّ
-- 0254 فحارسُها لا يقبل نصَّ 0252 بعد هذا التراجع. ثمّ:
--   أعِد **أجسامَ الدوالّ الثلاث وحدها** حرفاً من مصادرها — stock_count_decide من 0217 وstock_count_state
--   من 0216 (لا الملفّين كلّهما: 0217 يعيد الدفعات الافتتاحية وstock_count_submit قديمة)، وطيَّ الدمج
--   products_trash_consumption من 0252 — بصلاحياتها هنا (الأوليان للمسجَّل، والمحفّزُ بلا منح)؛ ثم:
--     drop trigger if exists products_waste_guard on public.products;
--     drop function if exists public.products_waste_guard();
--     drop function if exists public.stock_waste_submit(jsonb, boolean, jsonb);
--   والأعمدةُ الثمانية وقيودُها وفهرساها تبقى ولا تضرّ (لا يقرؤها شيءٌ قديم)، وinvoice_consumption_get يبقى
--   بنصّه هنا: يقرأ أعمدةً باقية، والسنداتُ المسجّلة تبقى تُرى فلا يُعبّأ ما سُجّل. ومن يعيده لنصّ 0252
--   يُسقط معه source_invoice وsource_batches وsource_product — وإلا قالت verify_consumption_wiring()
--   «lacks -- +0254» عن القارئ. وتقولها عن الثلاث ما دامت stock_waste_submit موجودة — احذفها أوّلاً.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه من 0252، ثمّ الحارسُ لكلّ دالّةٍ تُعاد — قبل أيّ بناء ─────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public._stock_post(uuid,uuid,numeric,text)') is null
     or to_regprocedure('public._cons_at_us(timestamptz)') is null
     or to_regclass('public.product_stock_carry') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف والترحيلُ الدقيق ودفعاتُ الدفتر منها';
  end if;
end $$;

select public._drift_assert('public.stock_count_decide(uuid[],boolean)', '2ed820e2f49de184fa9b606c2ae9f13e', '-- +0254');
select public._drift_assert('public.stock_count_state()', 'f3eb84d7952ba6ce0099679bd0e90601', '-- +0254');
select public._drift_assert('public.products_trash_consumption()', '0dc88673dbdbd6e6fb95c5d576986d40', '-- +0254');
select public._drift_assert('public.invoice_consumption_get(uuid[])', '5b33e0eb915538897cf01a929a34fa26', '-- +0254');

-- ── ١) السندُ صفُّ جرد مكتوبٌ فرقاً ─────────────────────────────────────────
-- source بافتراضٍ ثابت: إضافتُه تعديلٌ بالكتالوج لا إعادةُ كتابةٍ للجدول، وكلُّ صفٍّ قائم «جرد».
alter table public.stock_counts add column if not exists source       text not null default 'count';
alter table public.stock_counts add column if not exists entered_qty  numeric(24,3);
alter table public.stock_counts add column if not exists entered_unit text;
alter table public.stock_counts add column if not exists unit_label   text;
alter table public.stock_counts add column if not exists posted       numeric(24,3);

do $$ begin
  alter table public.stock_counts add constraint stock_counts_source_chk check (source in ('count', 'waste'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stock_counts add constraint stock_counts_waste_unit_chk
    check (entered_unit is null or entered_unit in ('stock', 'sub'));
exception when duplicate_object then null; end $$;
-- شكلُ السند: تالفٌ أو منتهٍ، بملاحظة، فرقاً موجباً على معدودٍ صفر، وبلا عدٍّ بالدفعة. و`is not null`
-- صريحةٌ قبل كلّ مقارنة: القيدُ يمرّ على NULL، فسندٌ بلا سببٍ أو بلا كمية كان سيمرّ.
do $$ begin
  alter table public.stock_counts add constraint stock_counts_waste_shape
    check (source <> 'waste' or (reason is not null and reason in ('damaged', 'expired') and counted_qty = 0
           and system_qty > 0 and note is not null and entered_qty is not null and entered_qty > 0
           and entered_unit is not null and lot_counts is null));
exception when duplicate_object then null; end $$;

comment on column public.stock_counts.source is
  'count = جرد، waste = سندُ تلف (0254). السندُ فرقٌ لا عدّ: system_qty = المقدارُ التالف بوحدة المخزون بالضبط، counted_qty = 0.';
comment on column public.stock_counts.entered_qty is 'سندُ التلف (0254): الكميةُ كما كُتبت، بوحدة entered_unit.';
comment on column public.stock_counts.entered_unit is 'سندُ التلف (0254): stock (العلبة، أو الكغم للموزون) أو sub (الوحدةُ الصغيرة).';
comment on column public.stock_counts.unit_label is 'سندُ التلف (0254): اسمُ الوحدة الصغيرة لحظةَ التسجيل — يُكتب بنصّ السحب.';
comment on column public.stock_counts.posted is
  'سندُ التلف (0254): ما كتبته الموافقةُ بالرصيد عبر المرحَّل (٣ منازل). المقدارُ الدقيق −applied_delta.';

-- ── ١ب) السندُ يتذكّر فاتورتَه ──────────────────────────────────────────────
-- سطرٌ عُبّي من فاتورةٍ رجعت موادُّها («سجّلها هدر» بإشعار الترجيع) يحفظ مرجعَها ودفعاتِ الترجيع التي
-- عُبّي منها — فيرجع بـwaste بالقارئ (أدناه) ولا يُعبّأ سندٌ ثانٍ لما سُجّل. الدفعةُ at_us لأحداث دفترها
-- (_cons_at_us: التعبيرُ الواحد الذي تقرؤها به الشاشة وتقارنها بالتساوي). وسطرٌ من دفعتين (فعلان بنافذة
-- إشعارٍ واحدة) يحفظ الاثنتين: حفظُ أحدثهما وحدها كان يترك رابطاً لاحقاً بالأقدم يعبّي الموادَّ نفسَها
-- ثانيةً — فتُشطب مرّتين بعد الموافقة. ليّنان بلا مفتاح (الفاتورةُ قد تُحذف ويبقى دفترُها)، وللسند وحده.
alter table public.stock_counts add column if not exists source_invoice uuid;
alter table public.stock_counts add column if not exists source_batches bigint[];
-- ومادّةُ السطر لحظةَ تسجيله (source_product): product_id يُفرغه حذفُ المادّة (0216: on delete set null) ولا يردّه
-- استرجاعُها، والمواصفةُ تحفظ معرّفَها — فسطرٌ مطبَّقٌ لمادّةٍ حُذفت ثمّ رجعت كان يُقرأ بلا مادّة، فتعبّيه الشاشةُ ثانيةً
-- ويقبله الخادم (شطبٌ مرّتين). ليّنٌ بلا مفتاح، يتبع الدمجَ كدفتر الفاتورة (products_trash_consumption)، ولا يُفرغه حذف.
alter table public.stock_counts add column if not exists source_product uuid;

do $$ begin
  alter table public.stock_counts add constraint stock_counts_source_waste_only
    check (source = 'waste' or (source_invoice is null and source_batches is null));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stock_counts add constraint stock_counts_source_batches_invoice
    check (source_batches is null or source_invoice is not null);
exception when duplicate_object then null; end $$;
-- غيرُ فارغة، ببعدٍ واحد، بلا NULL، وكلُّها > ٠ — و`is null` صريحةٌ أوّلاً: القيدُ يمرّ على NULL، فمصفوفةٌ
-- فيها NULL كانت ستمرّ بـ`0 < all (…)` وحده. والترتيبُ وعدمُ التكرار يكتبهما stock_waste_submit ويفرضهما القارئ.
do $$ begin
  alter table public.stock_counts add constraint stock_counts_source_batches_shape
    check (source_batches is null
           or (coalesce(array_ndims(source_batches), 0) = 1 and cardinality(source_batches) > 0
               and array_position(source_batches, null) is null and 0 < all (source_batches)));
exception when duplicate_object then null; end $$;
-- والمادّةُ مع الفاتورة لا بدونها: سطرٌ بمرجعٍ يحمل مادّتَه، وبلا مرجعٍ بلاها.
do $$ begin
  alter table public.stock_counts add constraint stock_counts_source_with_product
    check ((source_invoice is null) = (source_product is null));
exception when duplicate_object then null; end $$;
-- قراءةُ waste بالفاتورة (invoice_consumption_get) وفحصُ المطالبة الثانية (stock_waste_submit): السندُ المعبّأ من فاتورةٍ وحده.
create index if not exists stock_counts_source_invoice_idx on public.stock_counts (source_invoice)
  where source_invoice is not null;
-- ونقلُ الدمج بالمادّة (products_trash_consumption) — لكلّ مادّةٍ تُحذف أو تُطوى: السطورُ المعبّأةُ من فاتورةٍ وحدها.
create index if not exists stock_counts_source_product_idx on public.stock_counts (source_product)
  where source_product is not null;

comment on column public.stock_counts.source_invoice is
  'سندُ التلف (0254): الفاتورةُ التي عُبّي منها السطر بعد ترجيع موادّها — مرجعٌ ليّن بلا مفتاح (الفاتورةُ قد تُحذف ويبقى دفترُها). يقرؤه invoice_consumption_get (waste) فلا يُعبّأ ما سُجّل ثانيةً. فارغٌ للمكتوب باليد وللجرد.';
comment on column public.stock_counts.source_batches is
  'سندُ التلف (0254): دفعاتُ الترجيع التي عُبّي منها السطر — at_us (_cons_at_us لأحداث دفتر تلك الفاتورة لهذه المادّة)، تصاعدياً بلا تكرار، وكلُّها لا أحدثُها. فارغٌ (null) لسطرٍ عُبّي من الفاتورة كلّها (رابطٌ بلا دفعات).';
comment on column public.stock_counts.source_product is
  'سندُ التلف (0254): مادّةُ السطر المعبّأ من فاتورة لحظةَ تسجيله — مرجعٌ ليّن بلا مفتاح، يتبع الدمجَ كدفتر الفاتورة ولا يُفرغه الحذف (product_id يُفرغه، 0216). به يقول القارئُ مادّةَ السطر (waste.product_id) ويرفض stock_waste_submit مطالبةً ثانية ولو حُذفت المادّةُ واسترجِعت. فارغٌ للمكتوب باليد وللجرد.';
comment on table public.stock_counts is
  'الجردُ الدوريّ (0216) وسندُ التلف (0254): سطرٌ لكلّ مادةٍ انعدّت أو تلفت، والسندُ المعبّأ من فاتورةٍ يحمل مرجعَها ودفعاتِها ومادّتَه. يُكتب من stock_count_submit/decide وstock_waste_submit وحدها؛ الفرقُ لا يمسّ الرصيد إلا بموافقة المدير.';

-- ── ٢) الموافقة — نصُّ 0217 حرفاً وفوقه أسطرٌ معلَّمة ─────────────────────
-- الجردُ بفرقه بلا حصر؛ والسندُ −d بالضبط عبر المرحَّل (المادّةُ مقفولةٌ قبلُ بالمعرّف، فالمرحَّلُ
-- بعدها كترتيب كلّ كاتب)؛ والسحبُ كما كان؛ والنتيجةُ تقول ما بقي تحت الصفر.
create or replace function public.stock_count_decide(p_ids uuid[], p_approve boolean)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_uid    uuid := auth.uid();
  v_name   text;
  r        record;
  v_old    numeric;
  v_new    numeric;
  v_done   uuid[] := '{}';
  n_ok     int := 0;
  n_rej    int := 0;
  n_void   int := 0;
  v_reason text;
  v_label  text;
  v_amt    numeric;
  v_items  text;
  v_exp    uuid;
  v_out    jsonb := '[]'::jsonb;
  lc       jsonb;
  -- 0254: ما كتبه ترحيلُ السند بالرصيد، والموادُّ التي بقيت تحت الصفر بعد الموافقة -- +0254
  v_posted numeric; -- +0254
  v_neg    jsonb; -- +0254
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  if auth_role() is distinct from 'manager' then
    -- P0001 (الافتراضي) لا 42501: الواجهةُ تعرض الـhint العربيّ لرفضٍ مقصودٍ وحده.
    raise exception 'count_needs_manager'
      using hint = 'الموافقة على فرق الجرد للمدير وحده — افتح وضع المدير';
  end if;
  if p_ids is null or cardinality(p_ids) = 0 or p_approve is null then
    raise exception 'count_nothing' using hint = 'ما اخترت ولا سطر';
  end if;
  -- مشغّلُ المنصّة داخلٌ بهويّته (0151): لا اسمَ له بسجلّ العيادة.
  v_name := case when is_platform_admin() then null else coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid)) end;

  -- الأقفالُ بترتيب العدّ نفسه (المادةُ ثمّ سطرُها) — وإلا تعانق عدٌّ وموافقةٌ لنفس المادة.
  perform 1 from products
   where clinic_id = v_clinic
     and id in (select c.product_id from stock_counts c where c.id = any(p_ids) and c.clinic_id = v_clinic and c.status = 'pending')
   order by id
   for update;

  for r in select * from stock_counts
            where id = any(p_ids) and clinic_id = v_clinic and status = 'pending'
            order by counted_at, id
            for update
  loop
    if not p_approve then
      update stock_counts set status = 'rejected', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
       where id = r.id;
      n_rej := n_rej + 1;
      continue;
    end if;

    select stock into v_old from products where id = r.product_id and clinic_id = v_clinic for update;
    if not found then
      update stock_counts set status = 'void', decided_by = v_uid, decided_by_name = v_name, decided_at = now()
       where id = r.id;
      n_void := n_void + 1;
      continue;
    end if;
    -- **الفرقُ لا الرقم**: ما بيع بين العدّ والموافقة يبقى مبيعاً.
-- -0254     v_new := greatest(coalesce(v_old, 0) + (r.counted_qty - r.system_qty), 0);
    -- 0254: **ولا حصر** — جردٌ معلَّقٌ وافق بعد استهلاكٍ أنزل الرصيدَ تحت فرقه كان يرفعه ولا يكتب -- +0254
    -- خسارة (هوّتا M1/B2). الفرقُ يُطبَّق كلُّه ولو سالباً، بثلاث منازل (منازلُ الرصيد): الفرقُ المسجَّل -- +0254
    -- أدناه = ما تغيّر بالرصيد فعلاً. -- +0254
    v_new := round(coalesce(v_old, 0) + (r.counted_qty - r.system_qty), 3); -- +0254
    -- 0217: عدٌّ بالدفعة يُطبَّق على دفعاته بعينها، ثمّ الرصيد، ثمّ الحارسُ فوراً — وبسبب
    -- «منتهي» يُسحب من المنتهي أوّلاً (لا من الصالح كما بالبيع).
    if jsonb_typeof(r.lot_counts) = 'array' then
      for lc in select value from jsonb_array_elements(r.lot_counts) loop
        update product_lots
           set qty = greatest(qty + ((lc->>'counted')::numeric - (lc->>'system')::numeric), 0), updated_at = now()
         where id = (lc->>'lot_id')::uuid and product_id = r.product_id and clinic_id = v_clinic;
      end loop;
    end if;
-- -0254     update products set stock = v_new where id = r.product_id and clinic_id = v_clinic;
    -- 0254: السندُ فرقٌ لا عدّ — d بالضبط عبر المرحَّل (ما دون ٠٫٠٠١ يحمله كالاستهلاك) لا تحديثاً -- +0254
    -- مباشراً، والجردُ برقمه كما كان. -- +0254
    v_posted := null; -- +0254
    if r.source = 'waste' then -- +0254
      select k.o_posted into v_posted -- +0254
        from public._stock_post(v_clinic, r.product_id, r.system_qty - r.counted_qty, 'external') k; -- +0254
    else -- +0254
      update products set stock = v_new where id = r.product_id and clinic_id = v_clinic; -- +0254
    end if; -- +0254
    perform lots_reconcile(r.product_id, r.reason = 'expired');
    update stock_counts
-- -0254        set status = 'approved', applied_delta = v_new - coalesce(v_old, 0),
       set status = 'approved', -- +0254
           applied_delta = (case when r.source = 'waste' then r.counted_qty - r.system_qty -- +0254
                                 else v_new - coalesce(v_old, 0) end), -- +0254
           posted = v_posted, -- +0254
           decided_by = v_uid, decided_by_name = v_name, decided_at = now()
     where id = r.id;
    v_done := v_done || r.id;
    n_ok := n_ok + 1;
  end loop;

  -- سحبٌ لكلّ سببِ خسارة، بموادّه بالضبط وبسعر الشراء. خطأُ الإدخال والزيادةُ لا سحبَ لهما.
  for v_reason in
    select distinct c.reason from stock_counts c
     where c.id = any(v_done) and c.reason in ('damaged', 'expired', 'shortage')
     order by 1
  loop
    v_label := (case v_reason when 'damaged' then 'تالف' when 'expired' then 'منتهي' else 'عجز' end);
    select sum(-c.applied_delta * c.unit_cost),
-- -0254            string_agg(format('%s ×%s', c.product_name, trim_scale(-c.applied_delta)), '، ' order by c.product_name)
           -- 0254: السندُ بما كُتب ووحدته («Lyse ×2 مل»)، والجردُ بفرقه كما كان -- +0254
           -- وبترتيب البايت (collate "C") ثمّ المادّة: الترتيبُ الافتراضيّ يتبع لغةَ القاعدة (C بالحزمة، ولغةُ الخادم بالإنتاج) -- +0254
           -- فيُكتب «kit ×1، Lyse ×1» بقاعدةٍ و«Lyse ×1، kit ×1» بأخرى — والمرآةُ التجريبية بالبايت. والمادّةُ تفصل اسمين متساويين. -- +0254
           string_agg((case when c.source = 'waste' -- +0254
                            then format('%s ×%s%s', c.product_name, trim_scale(c.entered_qty), coalesce(' ' || c.unit_label, '')) -- +0254
                            else format('%s ×%s', c.product_name, trim_scale(-c.applied_delta)) end), -- +0254
                      '، ' order by c.product_name collate "C", c.product_id) -- +0254
      into v_amt, v_items
      from stock_counts c
     where c.id = any(v_done) and c.reason = v_reason and c.applied_delta < 0 and c.unit_cost > 0;
    v_amt := round(coalesce(v_amt, 0), 2);
    continue when v_amt <= 0;
    insert into expenses (clinic_id, amount, description, category, method, staff_id, spent_at)
    values (v_clinic, v_amt, left(format('سحب مخزن — %s: %s', v_label, v_items), 1000),
            'سحب مخزن', 'stock', v_uid, now())
    returning id into v_exp;
    update stock_counts set expense_id = v_exp
     where id = any(v_done) and reason = v_reason and applied_delta < 0 and unit_cost > 0;
    v_out := v_out || jsonb_build_object('reason', v_reason, 'amount', v_amt, 'expense_id', v_exp);
  end loop;

  -- 0254: كلُّ مادّةٍ وافقنا عليها وبقيت تحت الصفر — تُقال بالشاشة («سجّل فاتورة الشراء أو سوّ جرد»)، بالبايت ثمّ المعرّف. -- +0254
  select coalesce(jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'stock', p.stock) -- +0254
                            order by p.name collate "C", p.id), '[]'::jsonb) -- +0254
    into v_neg -- +0254
    from products p -- +0254
   where p.clinic_id = v_clinic and p.stock < 0 -- +0254
     and p.id in (select c.product_id from stock_counts c where c.id = any(v_done) and c.clinic_id = v_clinic); -- +0254
-- -0254   return jsonb_build_object('approved', n_ok, 'rejected', n_rej, 'void', n_void, 'withdrawals', v_out);
  return jsonb_build_object('approved', n_ok, 'rejected', n_rej, 'void', n_void, 'withdrawals', v_out, -- +0254
                            'negatives', v_neg); -- +0254
end $$;
revoke all on function public.stock_count_decide(uuid[], boolean) from public, anon;
grant execute on function public.stock_count_decide(uuid[], boolean) to authenticated;

-- ── ٣) «عدّ اليوم» — نصُّ 0216 وسطرٌ واحد ─────────────────────────────────
create or replace function public.stock_count_state()
returns table (product_id uuid, last_counted_at timestamptz, last_diff_at timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select c.product_id, max(c.counted_at),
         max(c.counted_at) filter (where c.counted_qty <> c.system_qty and c.status in ('pending', 'approved'))
    from stock_counts c
   where c.clinic_id = (select auth_clinic())
     and c.product_id is not null
     and c.status <> 'void'
     and c.source = 'count' -- 0254: السندُ ليس عدّاً — لا يجعل المادّةَ «معدودةً اليوم» -- +0254
   group by c.product_id
$$;
revoke all on function public.stock_count_state() from public, anon;
grant execute on function public.stock_count_state() to authenticated;

-- ── ٤) سندُ التلف ─────────────────────────────────────────────────────────
-- أيُّ موظفٍ يسجّل (والمصوّرُ لا)، و«طبّق فوراً» للمدير وحده. الترتيب: العيادةُ والمصوّر ← شكلُ السطور
-- ← الإعادةُ (**قبل** فحص الدور كالبيعة 0242: سندٌ طُبّق وضاع جوابُه لا يُرفض عند إعادته) ← الدور ←
-- حجزُ المرجع (قبل أيّ قفل: نسخةٌ متزامنة تنتظره ثمّ تقرأ نتيجتَه، لا «معلَّقٌ ينتظر» عن سندها نفسه)
-- ← قفلُ كلّ موادّ السند بالمعرّف ← فحصُ السطور كلّها بترتيبها، والرفضُ القاطعُ قبل «أكّد مرّة ثانية»
-- (تأكيدٌ ثمّ رفضٌ لسطرٍ آخر ضغطةٌ ضائعة) ← الإدراجُ ← الموافقةُ بنفس المعاملة إن طُلبت.
-- ومرجعُ السطر (src_invoice/src_batches: الفاتورةُ ودفعاتُ ترجيعها) يُفحص بسطره بعد كميته وقبل «معلَّقٌ
-- ينتظر» — كلُّ رفضٍ waste_source_bad بلا أثر — ويُحفظ مرتّباً. والإعادةُ قبله: نتيجتُها الأولى كما هي، ولو
-- تغيّر الدفترُ أو المادّةُ بعدها (طيُّ الدمج ينقل أحداثَ التوأم فلا تطابق مادّتَه القديمة).
-- والمقدارُ d بوحدة المخزون بالضبط: الكميةُ للعلبة، و`_cons_round_div(qty, units_per_box, 9)` للصغيرة —
-- فعشرةُ مل من مكعّبٍ عشرين لتراً تُكتب ٠٫٠٠٠٥ ولا تسقط. وكلفةُ الوحدة لقطةٌ بلحظة التسجيل
-- (stock_unit_cost: سعرُ الشراء اليوم، والمتوسطُ بـ0255) — كالجرد.
create or replace function public.stock_waste_submit(p_lines jsonb, p_apply boolean default false, p_meta jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  c_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  c_dec    constant text := '^\s*[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?\s*$';
  v_clinic uuid := auth_clinic();
  v_uid    uuid := auth.uid();
  v_ph     boolean := false;
  v_apply  boolean := coalesce(p_apply, false);
  -- مرجعُ المحاولة: يولّده الجهاز مرّةً، ويثبت عبر كل إعادة.
  v_ref    text := nullif(btrim(p_meta->>'client_ref'), '');
  v_name   text;
  v_out    jsonb;
  v_con    text;
  l        jsonb;
  v_raw    text;
  v_lock   uuid[] := '{}';
  v_seen   uuid[] := '{}';
  v_p      products;
  v_u      text;
  v_q      numeric;
  v_d      numeric;
  v_reason text;
  v_note   text;
  v_lbl    text;
  v_over   text;
  v_ok     jsonb := '[]'::jsonb;
  v_e      jsonb;
  v_pname  text;
  v_id     uuid;
  v_ids    uuid[] := '{}';
  v_lines  jsonb := '[]'::jsonb;
  v_dec    jsonb;
  v_left   int;
  -- مرجعُ السطر: الفاتورةُ ودفعاتُها (تُفحص ثمّ تُرتَّب)، وما يُقرأ منها عنصراً عنصراً
  v_si     uuid;
  v_sb     bigint[];
  v_x      jsonb;
  v_n      numeric;
  v_bad    boolean;
begin
  if v_clinic is null or v_uid is null then
    raise exception 'no_clinic' using errcode = '42501';
  end if;
  -- الدورُ الأساس للمصوّر (0222)، وبـexecute: تراجعُ 0222 يحذف الدالّة، ونداءٌ ثابتٌ يرمي 42883 (0245).
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if coalesce(v_ph, false) then
    raise exception 'waste_forbidden' using hint = 'حساب التصوير ما يسجّل تلف — سجّله من حساب الكادر';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'waste_empty' using hint = 'ماكو سطور بسند التلف';
  end if;
  if jsonb_array_length(p_lines) > 50 then
    raise exception 'waste_too_many' using hint = 'أكثر من ٥٠ مادة بسندٍ واحد — قسّم السند';
  end if;

  -- إعادةٌ لسندٍ سُجّل سلفاً: تُرجَع نتيجتُه كما هي، بلا سطرٍ ثانٍ ولا سحبٍ ثانٍ.
  if v_ref is not null then
    select result into v_out from rpc_refs
     where clinic_id = v_clinic and fn = 'stock_waste_submit' and client_ref = v_ref;
    if v_out is not null then return v_out; end if;
  end if;

  if v_apply and auth_role() is distinct from 'manager' then
    raise exception 'waste_needs_manager' using hint = 'تطبيق التلف فوراً للمدير — أرسله للمدير';
  end if;

  -- مشغّلُ المنصّة داخلٌ بهويّته (0151): لا اسمَ له بسجلّ العيادة، ولا معرّفَ بـcounted_by (كـ0208/0227).
  v_name := case when is_platform_admin() then null else coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid)) end;

  -- كتلةٌ بمعالج (0136): خرقُ مرجعنا = نسخةٌ متزامنة سبقتنا فنُرجع نتيجتها؛ وخرقُ «معلَّقٌ واحدٌ
  -- لكلّ مادّة» = جردٌ أو سندٌ سبقنا عليها — يُقال برمزه لا بـ23505 خامّ.
  begin
    if v_ref is not null then
      insert into rpc_refs (clinic_id, fn, client_ref) values (v_clinic, 'stock_waste_submit', v_ref);
    end if;

    -- كلُّ موادّ السند بالمعرّف، مرّةً واحدة — ترتيبُ الموافقة والاستهلاك نفسه.
    for l in select x from jsonb_array_elements(p_lines) x loop
      v_raw := case when jsonb_typeof(l) = 'object' and jsonb_typeof(l->'product_id') = 'string'
                    then btrim(l->>'product_id') end;
      if v_raw ~* c_uuid then v_lock := v_lock || v_raw::uuid; end if;
    end loop;
    perform 1 from products where clinic_id = v_clinic and id = any(v_lock) order by id for update;

    for l in select x from jsonb_array_elements(p_lines) x loop
      v_raw := case when jsonb_typeof(l) = 'object' and jsonb_typeof(l->'product_id') = 'string'
                    then btrim(l->>'product_id') end;
      v_p := null;
      if v_raw ~* c_uuid then
        select * into v_p from products where id = v_raw::uuid and clinic_id = v_clinic;
      end if;
      if v_p.id is null then
        raise exception 'waste_product_missing' using hint = 'مادةٌ ما موجودة بمخزن العيادة — حدّث الصفحة';
      end if;
      if coalesce(v_p.pooled, false) then
        raise exception 'waste_pooled' using hint = format('«%s» رصيدها بمخزون القسم — ما تنسجل هنا', v_p.name);
      end if;
      if v_p.farm_id is not null then
        raise exception 'waste_farm' using hint = format('«%s» رصيدها بمخزون الحقل — ما تنسجل هنا', v_p.name);
      end if;
      if v_p.id = any(v_seen) then
        raise exception 'waste_duplicate' using hint = format('«%s» مكرّرة بالسند — اجمعها بسطر واحد', v_p.name);
      end if;
      v_seen := v_seen || v_p.id;
      v_reason := case when jsonb_typeof(l->'reason') = 'string' then btrim(l->>'reason') end;
      if v_reason is null or v_reason not in ('damaged', 'expired') then
        raise exception 'waste_reason' using hint = 'اختر السبب: تالف أو منتهي';
      end if;
      v_note := left(nullif(btrim(coalesce(l->>'note', '')), ''), 200);
      if v_note is null then
        raise exception 'waste_note' using hint = 'اكتب شنو صار (مثلاً: وگعت وانكسرت)';
      end if;
      v_u := case when jsonb_typeof(l->'unit') is null or jsonb_typeof(l->'unit') = 'null' or l->>'unit' = '' then 'stock'
                  when jsonb_typeof(l->'unit') = 'string' then l->>'unit' end;
      v_q := case when jsonb_typeof(l->'qty') in ('number', 'string') and (l->>'qty') ~ c_dec then (l->>'qty')::numeric end;
      if v_u is null or v_u not in ('stock', 'sub')
         or v_q is null or v_q <= 0 or v_q > 1000000 or v_q <> round(v_q, 3)
         or (v_u = 'sub' and not (coalesce(v_p.has_sub_unit, false) and coalesce(v_p.units_per_box, 0) > 0)) then
        raise exception 'waste_bad_qty' using hint = format('«%s»: اكتب الكمية التالفة صح', v_p.name);
      end if;
      v_d := case when v_u = 'sub' then public._cons_round_div(v_q, v_p.units_per_box, 9) else v_q end;
      if v_d <= 0 then
        raise exception 'waste_bad_qty' using hint = format('«%s»: اكتب الكمية التالفة صح', v_p.name);
      end if;
      -- مرجعُ السطر: سطرٌ عُبّي من فاتورةٍ رجعت موادُّها يحمل src_invoice (نصُّ معرّف) وsrc_batches (أعدادٌ صحيحة:
      -- at_us لدفعات الترجيع). الشكلُ أوّلاً — دفعاتٌ بلا فاتورة، فاتورةٌ ليست معرّفاً، دفعاتٌ ليست مصفوفةً غيرَ
      -- فارغةٍ من أعدادٍ صحيحةٍ موجبة بلا تكرار (نصٌّ من أرقامٍ وحدها يُقبل، والكسرُ لا) — ثمّ فاتورةٌ لا تعرفها
      -- العيادة (لا صفَّ فاتورة ولا دفتر: المحذوفةُ يبقى دفترُها)، ثمّ دفعةٌ بلا حدثٍ لهذه المادّة بهذه الفاتورة
      -- بالميكروثانية نفسها (_cons_at_us وحدها — عائمٌ أو تعبيرٌ ثانٍ يفتح الشطبَ المزدوج بصمت). وسطرٌ بلا مرجع
      -- (مكتوبٌ باليد، أو الحقلان null) بلا شيء.
      v_si := null; v_sb := null;
      v_bad := coalesce(jsonb_typeof(l->'src_batches'), 'null') <> 'null'
               and coalesce(jsonb_typeof(l->'src_invoice'), 'null') = 'null';
      if not v_bad and coalesce(jsonb_typeof(l->'src_invoice'), 'null') <> 'null' then
        if jsonb_typeof(l->'src_invoice') = 'string' and btrim(l->>'src_invoice') ~* c_uuid then
          v_si := btrim(l->>'src_invoice')::uuid;
        else
          v_bad := true;
        end if;
      end if;
      if not v_bad and coalesce(jsonb_typeof(l->'src_batches'), 'null') <> 'null' then
        if jsonb_typeof(l->'src_batches') <> 'array' then
          v_bad := true;
        elsif jsonb_array_length(l->'src_batches') = 0 then
          v_bad := true;
        elsif jsonb_array_length(l->'src_batches') > 100 then
          -- رابطُ الإشعار يحمل دفعاتٍ معدودة (فعلٌ لكلّ ترجيع): الطويلةُ تُرفض قبل حلقتها — الحلقةُ تربيعيّة والموادُّ مقفولة.
          v_bad := true;
        else
          v_sb := '{}';
          for v_x in select x from jsonb_array_elements(l->'src_batches') x loop
            v_n := case when jsonb_typeof(v_x) = 'number' then (v_x #>> '{}')::numeric
                        when jsonb_typeof(v_x) = 'string' and (v_x #>> '{}') ~ '^[0-9]{1,19}$' then (v_x #>> '{}')::numeric end;
            if v_n is null or v_n <= 0 or v_n <> trunc(v_n) or v_n > 9223372036854775807 then
              v_bad := true;
              exit;
            end if;
            if v_n::bigint = any(v_sb) then
              v_bad := true;
              exit;
            end if;
            v_sb := v_sb || v_n::bigint;
          end loop;
        end if;
      end if;
      if v_bad then
        raise exception 'waste_source_bad'
          using hint = format('«%s»: رابط الفاتورة بهالسطر مو مضبوط — ارجع للفاتورة وعبّي السند منها من جديد', v_p.name);
      end if;
      if v_si is not null
         and not exists (select 1 from invoices i where i.id = v_si and i.clinic_id = v_clinic)
         and not exists (select 1 from invoice_consumption c where c.invoice_id = v_si and c.clinic_id = v_clinic) then
        raise exception 'waste_source_bad'
          using hint = format('«%s»: الفاتورة اللي انعبّى منها السطر مو بهالعيادة — ارجع للفاتورة وعبّي السند منها من جديد', v_p.name);
      end if;
      if v_sb is not null and exists (
           select 1 from unnest(v_sb) b
            where not exists (select 1 from invoice_consumption c
                               where c.clinic_id = v_clinic and c.invoice_id = v_si and c.product_id = v_p.id
                                 and public._cons_at_us(c.created_at) = b)) then
        raise exception 'waste_source_bad'
          using hint = format('«%s» ما رجعت من هالفاتورة بالترجيع اللي بالرابط — ارجع للفاتورة وعبّي السند منها من جديد', v_p.name);
      end if;
      select array_agg(b order by b) into v_sb from unnest(v_sb) b;   -- تصاعدياً (null يبقى null)
      -- مطالبةٌ ثانية بما سُجّل: سطرٌ معلَّقٌ أو مطبَّقٌ من هالفاتورة لهالمادّة (مادّتُه كما يقولها القارئ: product_id، وإن
      -- أفرغه حذفٌ فـsource_product) يحمل دفعةً من دفعات السطر — أو عُبّي من الفاتورة كلّها وسُجّل بعد أقدمها أو بمللّيها
      -- (شملها، بالمللي كما تقيسه الشاشة) — أو أيُّ سطرٍ منها والسطرُ نفسُه من الفاتورة كلّها. قاعدةُ الشاشة نفسُها
      -- (WasteTab: planFromInvoice)، وهنا لأن الشاشة تقرأ waste مرّةً عند فتح الرابط: تبويبٌ ثانٍ أو جهازٌ ثانٍ أو مسودّةٌ
      -- قديمة بعد «سجّل وطبّق» (لا معلَّقَ يمنعها) كانت تشطب الموادَّ نفسَها مرّتين بسحبين. والمرفوضُ والملغى لا يُعدّان؛
      -- والمادّةُ مقفولةٌ بالمعرّف قبل الحلقة، فسندٌ متزامنٌ عليها يُرى بعد انتظار قفله (لقطةٌ جديدة لكلّ جملة).
      if v_si is not null and exists (
           select 1 from stock_counts w
            where w.clinic_id = v_clinic and w.source = 'waste' and w.status in ('pending', 'approved')
              and w.source_invoice = v_si and coalesce(w.product_id, w.source_product) = v_p.id
              and (v_sb is null or w.source_batches && v_sb
                   or (w.source_batches is null
                       and public._cons_at_us(w.counted_at) / 1000 >= (select min(b) from unnest(v_sb) b) / 1000))) then
        raise exception 'waste_source_taken'
          using hint = format('«%s» انسجلت هدر قبل من هالفاتورة — ما تنسجل مرّة ثانية', v_p.name);
      end if;
      -- معلَّقٌ واحدٌ لكلّ مادّة، جرداً كان أو سنداً — قبل «أكّد»: رفضٌ قاطعٌ لا يُسأل عنه مرّتين.
      if exists (select 1 from stock_counts c where c.clinic_id = v_clinic and c.product_id = v_p.id and c.status = 'pending') then
        raise exception 'waste_already_pending'
          using hint = format('«%s» عليها جرد أو سند تلف ينتظر موافقة المدير — يوافق أو يرفض أوّلاً', v_p.name);
      end if;
      -- فوق الرصيد بالنظام: حارسُ خطأ الكتابة لا منع — الشاشةُ تسأل وتعيد الإرسال بـack_over.
      -- والرقمان بالوحدة التي كُتبت («رصيدها ١ سرنجة وانت كاتب ٢ سرنجة»).
      v_lbl := case when v_u = 'sub' then coalesce(' ' || nullif(btrim(v_p.sub_unit_name), ''), '') else '' end;
      if v_over is null and v_d > greatest(coalesce(v_p.stock, 0), 0)
         and not (case when jsonb_typeof(l->'ack_over') = 'boolean' then (l->>'ack_over')::boolean else false end) then
        v_over := format('«%s» رصيدها بالنظام %s%s وانت كاتب تلف %s%s — إذا صحيح أكّد مرّة ثانية', v_p.name,
                         trim_scale((case when v_u = 'sub' then round(coalesce(v_p.stock, 0) * v_p.units_per_box, 3)
                                          else coalesce(v_p.stock, 0) end)), v_lbl, trim_scale(v_q), v_lbl);
      end if;
      v_ok := v_ok || jsonb_build_array(jsonb_build_object(
        'p', v_p.id, 'n', v_p.name, 'q', v_q, 'u', v_u, 'd', v_d, 'r', v_reason, 'note', v_note,
        'l', (case when v_u = 'sub' then nullif(btrim(v_p.sub_unit_name), '') end),
        'k', public.stock_unit_cost(v_p), 's', coalesce(v_p.stock, 0),
        'si', v_si, 'sb', to_jsonb(v_sb)));
    end loop;
    if v_over is not null then
      raise exception 'waste_exceeds_stock' using hint = v_over;
    end if;

    for v_e in select x from jsonb_array_elements(v_ok) x loop
      v_pname := v_e->>'n';
      insert into stock_counts (clinic_id, product_id, product_name, system_qty, counted_qty, unit_cost,
                                reason, note, status, counted_by, counted_by_name,
                                source, entered_qty, entered_unit, unit_label, source_invoice, source_batches, source_product)
      values (v_clinic, (v_e->>'p')::uuid, v_e->>'n', (v_e->>'d')::numeric, 0, (v_e->>'k')::numeric,
              v_e->>'r', v_e->>'note', 'pending', (case when platform_acting_clinic() is null then v_uid end), v_name,
              'waste', (v_e->>'q')::numeric, v_e->>'u', v_e->>'l', (v_e->>'si')::uuid,
              (select array_agg(x::bigint order by x::bigint)
                 from jsonb_array_elements_text(nullif(v_e->'sb', 'null'::jsonb)) x),
              (case when v_e->>'si' is not null then (v_e->>'p')::uuid end))
      returning id into v_id;
      v_ids := v_ids || v_id;
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'product_id', (v_e->>'p')::uuid, 'name', v_e->>'n', 'stock_now', (v_e->>'s')::numeric,
        'stock_after', (v_e->>'s')::numeric - (v_e->>'d')::numeric));
    end loop;

    if v_apply then
      v_dec := public.stock_count_decide(v_ids, true);
    end if;
    select count(*)::int into v_left from stock_counts c
     where c.id = any(v_ids) and c.clinic_id = v_clinic and c.status = 'pending';
    v_out := jsonb_build_object('pending', v_left, 'ids', to_jsonb(v_ids), 'decided', v_dec, 'lines', v_lines);

    if v_ref is not null then
      update rpc_refs set result = v_out
       where clinic_id = v_clinic and fn = 'stock_waste_submit' and client_ref = v_ref;
    end if;
  exception when unique_violation then
    get stacked diagnostics v_con = constraint_name;
    if v_con = 'stock_counts_one_pending' then
      raise exception 'waste_already_pending'
        using hint = format('«%s» عليها جرد أو سند تلف ينتظر موافقة المدير — يوافق أو يرفض أوّلاً', coalesce(v_pname, ''));
    end if;
    -- لا نبلع كل خرقٍ فريد: إن لم يكن مرجعُنا هو السبب، فالخطأ حقيقيّ ويُرفع.
    if v_ref is null then raise; end if;
    select result into v_out from rpc_refs
     where clinic_id = v_clinic and fn = 'stock_waste_submit' and client_ref = v_ref;
    if v_out is null then raise; end if;
    return v_out;
  end;

  return v_out;
end $$;
revoke all on function public.stock_waste_submit(jsonb, boolean, jsonb) from public, anon;
grant execute on function public.stock_waste_submit(jsonb, boolean, jsonb) to authenticated;

-- ── ٥) الدمجُ لا يُضيّع سنداً — نصُّ 0252 حرفاً وفوقه أسطرٌ معلَّمة ───────────────
-- الدمجُ (merge_products، inventory_tidy_uncat) يكتب merged_into بالمحذوفات قبل حذف التوأم (0184):
-- سنداتُ التوأم كلُّها تنتقل لأصله هنا، فالمعلَّقُ يوافَق عليه على الأصل والمعتمدُ يبقى تاريخاً معه —
-- ولا يُفرغها المفتاحُ عند الحذف. وللتوأم سندٌ معلَّق وللأصل معلَّقٌ (جردٌ أو سند): رفضٌ قبل أيّ نقل،
-- لا خرقُ «معلَّقٍ واحد» بلا اسم. والمادّتان تُقفلان بالمعرّف قبل السؤال (الترتيبُ نفسه).
create or replace function public.products_trash_consumption()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_c product_stock_carry; v_keep text;
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
    -- المادّتان بالمعرّف قبل المرحَّل (inventory_tidy_uncat لا يقفل التوأم قبل السلّة)
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

-- ── ٦) الحذفُ لا يُضيّع سنداً ───────────────────────────────────────────────
-- قبل أيّ حذفٍ لمادّة، بأيّ طريق (delete_product، كتابةٌ مباشرة من نسخةٍ قديمة): سندٌ معلَّقٌ عليها
-- يُرفض حذفُها حتى يبتّ المدير — وإلا أفرغ المفتاحُ product_id فأبطلته الموافقة وضاعت خسارتُه.
-- والدمجُ لا يصله: طيُّ المحذوفات نقل سنداتِ التوأم قبل حذفه. وحسابٌ حُذف (cascade): لا شيء (0146:35).
create or replace function public.products_waste_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.clinic_id is null or not exists (select 1 from auth.users u where u.id = old.clinic_id) then return old; end if;
  if exists (select 1 from stock_counts c
              where c.product_id = old.id and c.clinic_id = old.clinic_id and c.source = 'waste' and c.status = 'pending') then
    raise exception 'product_waste_pending'
      using hint = format('«%s» عليها سند تلف ينتظر المدير — يوافق عليه أو يرفضه قبل الحذف', coalesce(old.name, ''));
  end if;
  return old;
end $$;
revoke all on function public.products_waste_guard() from public, anon, authenticated;
drop trigger if exists products_waste_guard on public.products;
create trigger products_waste_guard before delete on public.products
  for each row execute function public.products_waste_guard();

-- ── ٧) القارئ يملأ waste — نصُّ 0252 حرفاً وفوقه أسطرٌ معلَّمة ─────────────────────────
-- 0252 تكتب waste [] لكلّ فاتورة (الشكلُ ثابتٌ من يومها) لأن أعمدتَه هنا: سطورُ السند المسجّلة من الفاتورة
-- (source_invoice) بحالتها ودفعاتها. بصلاحية المُنادي كما كان: سياسةُ stock_counts للعيادة ترى سنداتِ عيادته،
-- وسياجُ المصوّر (0222) لا يرى منها شيئاً — والبوّابةُ ترفض له القارئَ أصلاً.
create or replace function public.invoice_consumption_get(p_invoice_ids uuid[])
returns jsonb language plpgsql stable security invoker set search_path = public as $$
declare v_clinic uuid := auth_clinic(); v jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if coalesce(cardinality(p_invoice_ids), 0) > 50 then
    raise exception 'too_many' using hint = 'أكثر من ٥٠ فاتورة بطلبٍ واحد — قسّم الطلب';
  end if;
  with ids as (
    select distinct x as id from unnest(coalesce(p_invoice_ids, '{}'::uuid[])) x where x is not null
  ),
  known as (
    select ids.id from ids
     where exists (select 1 from invoices i where i.id = ids.id and i.clinic_id = v_clinic)
        or exists (select 1 from invoice_consumption c where c.invoice_id = ids.id and c.clinic_id = v_clinic)
        or exists (select 1 from invoice_consumption_skips k where k.invoice_id = ids.id and k.clinic_id = v_clinic)
  ),
  ev as (
    select c.* from invoice_consumption c join known on known.id = c.invoice_id where c.clinic_id = v_clinic
  ),
  sp as (
    select e.invoice_id, e.item_id, e.spec_id,
           (array_agg(e.product_id order by e.created_at desc, e.id desc))[1] as product_id,
           (array_agg(e.product_name order by e.created_at, e.id))[1] as product_name,
           (array_agg(e.unit order by e.created_at, e.id))[1] as unit,
           (array_agg(e.unit_label order by e.created_at, e.id))[1] as unit_label,
           (array_agg(e.per_qty order by e.created_at, e.id))[1] as per_qty,
           (array_agg(e.per_div order by e.created_at, e.id))[1] as per_div,
           (array_agg(e.source order by e.created_at, e.id))[1] as source,
           (array_agg(e.note order by e.created_at desc, e.id desc))[1] as note,
           sum(e.qty) as live_qty, sum(e.value) as live_value, sum(e.shortfall) as shortfall,
           max(e.line_qty) as peak_line, min(e.created_at) as first_at,
           jsonb_agg(jsonb_build_object('at_us', public._cons_at_us(e.created_at), 'qty', e.qty)
                     order by e.created_at, e.id) as moves
      from ev e group by e.invoice_id, e.item_id, e.spec_id
  ),
  -- by_weight: products.sold_by_weight لحظةَ القراءة للمادّة التي تُقرأ بها المواصفة (product_id: الدمجُ نقل مواصفاتِ
  -- التوأم لأصله) — حيّةً، وإلا صورةُ الأصل الحيّ إن كانت بالمحذوفات مدموجةً (merged_into)، وإلا صورتُها هي بالمحذوفات،
  -- وnull لمادّةٍ ذهبت كلّياً. الواجهةُ تقول به «كغ» لا «علبة» (وحدةُ مخزون الموزون الكيلو)؛ وصورةٌ أقدمُ من العمود (0124)
  -- بلا المفتاح: false، افتراضُه يومها. والانضمامُ بالمفتاح الأساسيّ (products.id، products_trash.id): لا يكرّر مواصفة.
  items as (
    select s.invoice_id, s.item_id,
           jsonb_agg(jsonb_build_object(
             'spec_id', s.spec_id, 'product_id', s.product_id, 'product_name', s.product_name, 'unit', s.unit,
             'unit_label', s.unit_label, 'per_qty', s.per_qty, 'per_div', s.per_div,
             'live_qty', s.live_qty, 'live_value', s.live_value,
             'restored_qty', greatest(public._cons_round_div(s.peak_line * s.per_qty, s.per_div, 9) - s.live_qty, 0),
             'shortfall', s.shortfall, 'note', s.note, 'source', s.source, 'moves', s.moves,
             'by_weight', (case when p.id is not null then p.sold_by_weight
                                when pk.id is not null then pk.sold_by_weight
                                when t.id is not null then coalesce((t."row"->>'sold_by_weight')::boolean, false) end))
             order by s.first_at, s.product_name collate "C", s.spec_id) as specs
      from sp s
      left join products p on p.id = s.product_id and p.clinic_id = v_clinic
      left join products_trash t on p.id is null and t.id = s.product_id and t.clinic_id = v_clinic
      left join products pk on t.merged_into is not null and pk.id = t.merged_into and pk.clinic_id = v_clinic
     group by s.invoice_id, s.item_id
  ),
  by_inv as (
    select i.invoice_id, jsonb_object_agg(i.item_id::text, i.specs) as items from items i group by i.invoice_id
  ),
  sk as (
    select k.invoice_id, jsonb_agg(jsonb_build_object(
             'item_id', k.item_id, 'note', k.note, 'product_id', k.product_id, 'product_name', k.product_name,
             'qty', k.qty, 'unit', k.unit, 'line_name', k.line_name, 'source', k.source)
             order by k.created_at, k.item_id, k.product_name collate "C") as skips
      from invoice_consumption_skips k join known on known.id = k.invoice_id
     where k.clinic_id = v_clinic
     group by k.invoice_id
  ),
  -- 0254: سطورُ سند الهدر المسجّلة من الفاتورة، معلَّقةً أو مطبَّقة (المرفوضُ والملغى لا يُعدّان) — فلا -- +0254
  -- تعبّي الشاشةُ ما سُجّل. batches دفعاتُ السطر تصاعدياً بلا تكرار (أعدادٌ صحيحة كما خزّنها السند)، -- +0254
  -- وnull لسطرٍ عُبّي من الفاتورة كلّها؛ وcounted_at كما يكتبه to_jsonb (بإزاحته). ومادّتُه كمادّة -- +0254
  -- المواصفات: طيُّ الدمج ينقل سنداتِ التوأم للأصل بأيّ حالةٍ كما ينقل الدفتر (products_trash_consumption)؛ -- +0254
  -- وحذفُ المادّة (لا دمجُها) يُفرغ product_id بالسند (0216: on delete set null) والمواصفةُ تحفظ معرّفَها — فالمادّةُ -- +0254
  -- source_product حينها (مادّةُ السطر لحظةَ تسجيله، تتبع الدمج ولا يُفرغها حذف): بعد الاسترجاع تطابق المواصفة. -- +0254
  wst as ( -- +0254
    select w.source_invoice as invoice_id, -- +0254
           jsonb_agg(jsonb_build_object( -- +0254
             'id', w.id, 'product_id', coalesce(w.product_id, w.source_product), -- +0254
             'batches', (select jsonb_agg(z.b order by z.b) from (select distinct unnest(w.source_batches) as b) z), -- +0254
             'status', w.status, 'qty', w.entered_qty, 'unit', w.entered_unit, 'counted_at', w.counted_at) -- +0254
             order by w.counted_at, w.id) as waste -- +0254
      from stock_counts w join known on known.id = w.source_invoice -- +0254
     where w.clinic_id = v_clinic and w.source = 'waste' and w.status in ('pending', 'approved') -- +0254
     group by w.source_invoice -- +0254
  ), -- +0254
  touched as (
    select ii.invoice_id, ii.product_id from invoice_items ii join known on known.id = ii.invoice_id
     where ii.clinic_id = v_clinic and ii.product_id is not null
    union
    select e.invoice_id, e.product_id from ev e
  ),
  neg as (
    select t.invoice_id, jsonb_agg(jsonb_build_object('product_id', p.id, 'name', p.name, 'stock', p.stock,
                                                      'by_weight', p.sold_by_weight)
                                   order by p.name collate "C", p.id) as negatives
      from touched t join products p on p.id = t.product_id and p.clinic_id = v_clinic
     where p.stock < 0
     group by t.invoice_id
  )
  select coalesce(jsonb_object_agg(k.id::text, jsonb_build_object(
           'items', coalesce(b.items, '{}'::jsonb),
           'skips', coalesce(sk.skips, '[]'::jsonb),
           'negatives', coalesce(ng.negatives, '[]'::jsonb),
           'now_us', public._cons_at_us(now()),
-- -0254            'waste', '[]'::jsonb)), '{}'::jsonb)
           'waste', coalesce(ws.waste, '[]'::jsonb))), '{}'::jsonb) -- +0254
    into v
    from known k
    left join by_inv b on b.invoice_id = k.id
    left join sk on sk.invoice_id = k.id
    left join wst ws on ws.invoice_id = k.id -- +0254
    left join neg ng on ng.invoice_id = k.id;
  return v;
end $$;
revoke all on function public.invoice_consumption_get(uuid[]) from public, anon;
grant execute on function public.invoice_consumption_get(uuid[]) to authenticated;

reset lock_timeout;
