-- ============================================================================
-- ٠٢٥٣ — حقيقةُ الرصيد: لا حصرَ صامتاً — العجزُ يبقى ظاهراً، والعكسُ لا يخترع بضاعة
--
-- ── الجذر ───────────────────────────────────────────────────────────────
-- عشرُ دوالّ تحصر الرصيدَ بصفرٍ أو تبلع سالبَه أو تقرأه بلا قفل، كُتبت لعالَمٍ لا يكون فيه السالبُ روتيناً.
-- والحصرُ هناك ليس حارساً: هو **رصيدٌ وهميّ** يُكتب بصمتٍ ثمّ يظهر يومَ العكس.
-- • `deduct_stock_pooled` (0066:47) تأخذ من رصيد المادّة ما دام موجباً، ثمّ من حوض القسم،
--   وما زاد **يُرمى**. والسطرُ يحفظ `stock_qty` كاملاً، وكلُّ عكسٍ يردّ `stock_qty − pooled_qty`
--   (الترجيعُ والحذف 0066، والمرتجعُ وتعديلُ البنود 0241) — فما رُمي يعود للرفّ قطعةً لم تكن.
--   طلبُ متجرٍ قُبل والمادّةُ صفر (`store_accept_order` لا يسأل عن الرصيد، 0212) ثمّ رُجِّع ⇒ +١.
-- • `record_purchase` (0214:362): `greatest(0, stock + qty)` — شراءٌ أصغرُ من العجز يمحوه كلَّه.
-- • `update_purchase` (0214:211): حصرةٌ أخيرة «سالبٌ ⇒ صفر» — قطعُ الفاتورة تحت ما صُرف يُخفي الصرف.
-- • `restore_product` (0197:534): فكُّ الدمج بأرضيّة صفر — الأصلُ ٢ والتوأمُ ٣، بيع ٦ ⇒ −١،
--   والفكُّ يجعل الأصلَ صفراً والتوأمَ ٣: المجموعُ ٣ وهو −١.
-- • `inventory_tidy_uncat` (0184:219): حصرتان — التوأمُ السالبُ يُطوى فيضيع عجزُه، وفكُّه يطرح
--   سالباً فيزيد الأصل. ويقرأ التوأمَ من لقطة اللفّة بلا قفل (0184:153) ثمّ يطوي ذلك الرصيد: بيعةٌ للتوأم
--   تُثبَّت بينهما تضيع (الأصلُ يأخذ رصيدَ ما قبلها)، وتوأمٌ حذفته شاشةٌ أخرى يُطوى بلقطته فيرجع رصيدُه للأصل،
--   وتوأمٌ صنّفته شاشةٌ أخرى (أو طوته لحوض صنف) أثناء اللفّة يُحذف ويُضمّ لأصلٍ بصنفٍ آخر.
-- • `pool_product` (0171:52): طيُّ مادّةٍ للحوض يعطيه `greatest(0, stock)` ويصفّر الصفّ — مادّةٌ عند −٢
--   تُطوى فيصير العجزُ صفراً (+٢ بضاعةٌ لم تكن). يصلها نموذجٌ فُتح والرصيدُ موجب ثمّ بيعت بعده (0253: البيعُ
--   ينزل سالباً)، أو مادّةٌ مجمَّعةٌ فرغ حوضُها فنزل صفُّها.
-- • `restore_company` (0203:106) و`restore_company_section` (0197:444): فكُّ طيّ الشركة أو الصنف يطرح من حوض
--   الباقي ما أضافه الطيُّ بأرضيّة صفر، ويعيد للمطويّ حوضَه كاملاً — فما بيع من الحوض المدموج يرجع للرفّ، وعجزُ مادّةٍ
--   طُويت إليه (هنا) يُمحى عند الفكّ: ما يحفظه طيُّ المادّة يضيع بفكّ الشركة.
-- • `return_invoice_items` (0241:1063): `v_ret_stock`/`v_ret_pool` تُحسبان لسطر المنتج وحده وتبقيان
--   لسطر الخدمة بعده — مرتجعٌ جزئيٌّ مختلط يكتب `stock_qty` سالباً على كميةٍ موجبة فيُرفض كلُّه
--   بـ23514 (`invoice_items_nonneg`، 0133). والتجريبيُّ سليمٌ منه. ومرتجعٌ لا يرجّع مدخلٌ منه شيئاً (كمياتُه ≤ ٠،
--   أو تُقرَّب صفراً كـ٠٫٠٠٠٤) يمرّ بلا حركة ويختم «مرتجع» بملاحظات الفاتورة — وعلى فاتورةٍ مجموعُها فوق سطورها
--   يردّ الفرقَ نقداً (لا تصله الشاشة: ترسل ما فوق الصفر مقرَّباً لثلاث منازل).
-- • `delete_invoice` (0066) والمرتجع (0241) يردّان الرصيدَ بترتيب السطور، والبيعُ (0252) يقفل
--   بالمعرّف — ترتيبان متعاكسان على نفس الصفوف انسداد.
--
-- ── القرار (المالك، ٣١/١٠) ────────────────────────────────────────────────
-- لا منعَ ولا حصر: الرصيدُ ينزل سالباً، والنقصُ يُسجَّل ويُقال. والاستهلاكُ (0252) يجعل السالبَ
-- روتيناً، فكلُّ حصرٍ هنا يقلب عجزاً حقيقياً رصيداً وهمياً — يذهب بنفس الموجة **قبل** أن توجد
-- وصفةٌ واحدة. والكاشيرُ ما زال يرفض سطرَ مادّةٍ عند ≤ ٠ بصوت (الواجهةُ لا تتغيّر هنا).
--
-- ── المقيس (الحزمةُ المحلّية بنصّ 0066 الحقيقيّ، ٣١/١٠) ──────────────────────
-- كلُّ حالةٍ على صفٍّ جديد، مرّةً بالنصوص الحالية (0066/0171/0184/0197/0203/0214/0241) ومرّةً بعد 0253:
--   مادّةٌ بصفر، سطرٌ بواحد ثمّ ترجيع:          قبلُ ٠ ثمّ ١ (قطعةٌ لم تكن)     · بعدُ −١ ثمّ ٠
--   كفوفٌ عند −٠٫٠٦٠، سطرٌ بواحد ثمّ ترجيع:     قبلُ −٠٫٠٦٠ ثمّ ٠٫٩٤٠           · بعدُ −١٫٠٦٠ ثمّ −٠٫٠٦٠
--   رصيدٌ ٠٫٥ وحوضٌ ٠٫٢، بيعُ ١ ثمّ ترجيع:        قبلُ ٠ ثمّ ٠٫٨ (+٠٫٣ وهميّة)    · بعدُ −٠٫٣ ثمّ ٠٫٥، والحوضُ ٠٫٢ بالحالتين
--   مادّةٌ بصفر، سطرٌ بواحد ثمّ حذفُ الفاتورة:    قبلُ ١                          · بعدُ ٠
--   شراءُ ٠٫٠٢ على −٠٫٠٤:                        قبلُ ٠                          · بعدُ −٠٫٠٢
--   شراءُ ١، صرفُ ٠٫٨، تعديلُ الفاتورة إلى ٠٫٥:   قبلُ «كان ٠٫٢ صار ٠»            · بعدُ «كان ٠٫٢ صار −٠٫٣»
--   مرتجعٌ جزئيّ: سطرُ مادّةٍ ثمّ سطرُ خدمة:       قبلُ 23514 والمرتجعُ كلُّه يُرفض · بعدُ يمرّ، وstock_qty الخدمة صفر
--   أصلٌ ٢ + توأمٌ ٣، بيعُ ٦، فكُّ الدمج:           قبلُ ٠ و٣ = ٣                   · بعدُ −٤ و٣ = −١
--   «رتّب المخزن»: أصلٌ ٣ + توأمٌ −١، ثمّ فكُّه:     قبلُ ٣ ثمّ ٤ و−١ = ٣            · بعدُ ٢ ثمّ ٣ و−١ = ٢
--   «رتّب المخزن» وبيعةٌ للتوأم أثناء اللفّة (٤ ← ٣): قبلُ الأصلُ ٥ + ٤ = ٩، وفكُّه ٥ و٤ · بعدُ ٥ + ٣ = ٨، وفكُّه ٥ و٣
--   «رتّب المخزن» وتوأمٌ (٦) حُذف أثناء اللفّة:       قبلُ الأصلُ ١ + ٦ = ٧ والحذفُ صار طيّاً · بعدُ ١، والمحذوفُ بالمحذوفات
--   طيٌّ للحوض: مادّةٌ عند −٢ وحوضٌ ٥:              قبلُ الحوضُ ٥ والصفُّ ٠ (+٢)     · بعدُ الحوضُ ٣ والصفُّ ٠
--   طيٌّ للحوض: مادّةٌ عند −٢ وحوضٌ ١:              قبلُ الحوضُ ١ (+٢)               · بعدُ الحوضُ −١ (يُقال ببطاقة الصنف)
--   مرتجعٌ مداخلُه ٠ و−١:                           قبلُ يمرّ ويختم «مرتجع … ٣٬٤٠٠ ← ٣٬٤٠٠» · بعدُ «nothing to return» ولا يُكتب شيء
--   مرتجعٌ مدخلُه ٠٫٠٠٠٤ (يُقرَّب صفراً):             قبلُ يمرّ ويختم مثلَه، وعلى فاتورةٍ بـ٣٩٠٠ فوق سطورٍ بـ٣٤٠٠ يجعلها
--                                                    ٣٤٠٠ ويردّ ٥٠٠ نقداً · بعدُ «nothing to return» ولا يُكتب شيء
--   «رتّب المخزن» وتوأمٌ صنّفته شاشةٌ أخرى أثناء اللفّة: قبلُ يُحذف ويُضمّ لأصلٍ بصنفٍ آخر · بعدُ يبقى بصنفه (kept)
--   طيُّ شركةٍ (حوضُها ٢ على ٠)، ثمّ مادّةٌ عند −٣ للحوض المدموج، ثمّ الفكّ: قبلُ الحوضان ٠ و٢ (+٣) · بعدُ −٣ و٢،
--                                                    والمجموعُ −١ قبل الفكّ وبعده
--   طيُّ شركةٍ (٢ على ٠)، وبيعُ ٢ من الحوض المدموج، ثمّ الفكّ: قبلُ ٠ و٢ (+٢: المبيعُ رجع للرفّ) · بعدُ −٢ و٢
--   طيُّ صنفٍ بصنفٍ من شركته، والحالةُ الأولى نفسُها:  قبلُ ٠ و٢ (+٣)                   · بعدُ −٣ و٢
-- والقيودُ مقيسة: لا CHECK على `company_sections.pooled_stock` ولا على رصيد صفٍّ مجمَّع (0065/0066/0217)، ولا
-- محفّزَ يرفضهما — والبيعُ نفسُه (0253) يترك صفَّ المجمَّع سالباً حين يفرغ حوضُه.
-- والإنتاجُ لا يُقاس من هنا: قِس قبل النشر كم مادّةً رصيدُها ≤ ٠ اليوم — خطُّ أساسِ «السالبُ جديد».
--
-- ── ما تفعله — كلُّ دالّةٍ نصُّ مصدرها حرفاً وفوقه أسطرٌ معلَّمة (`-- +0253` / `-- -0253 …`) ──
-- ١) deduct_stock_pooled (0066): الحوضُ يأخذ ما زاد على الرصيد الموجب كما كان، والرصيدُ يعطي
--    الباقي `p_qty − v_frompool` ولو صار سالباً — فما يردّه العكسُ هو ما خرج منه بالضبط. وتبقى
--    داخليّةً: لا تُنادى من anon ولا authenticated (0163).
-- ٢) record_purchase (0214): `greatest(least(stock,0), stock + qty)` — العجزُ الأكبرُ من الشراء يبقى
--    ظاهراً. والمادّةُ الجديدة كما هي.
-- ٣) update_purchase (0214): تُشال الحصرةُ الأخيرة، ويبقى تصحيحُ «صار» بـpurchase_effects (effect-blind)
--    فيقول الإيصالُ «الرصيد كان ٠٫٢، صار −٠٫٣».
-- ٤) return_invoice_items (0241): قفلُ منتجات الفاتورة بالمعرّف بعد قفلها مباشرةً، وتصفيرُ
--    `v_ret_stock`/`v_ret_pool` أوّلَ كلِّ لفّةٍ بالمرتجع الجزئيّ، و«nothing to return» (رفضُ المصفوفة الفارغة نفسُه)
--    حين لا يرجّع مدخلٌ واحدٌ شيئاً. وما يرجّعه المدخلُ هو ما تحسبه الدالّةُ نفسُها — كميتُه مقرَّبةً لثلاث منازل ومحدودةً
--    بسطره (`v_ret`) لا الخامّ: ما رجّع صفراً يُتخطّى بلا كتابةٍ ولا عدّ. والرفضُ بعد اللفّة وقبل أيّ كتابة، فترتيبُ
--    الأخطاء الأخرى (22P02، item not found) كما كان.
-- ٥) delete_invoice (0066): نفسُ القفل بعد قفل الفاتورة.
-- ٦) restore_product (0197): فكُّ الدمج بلا أرضيّة — الأصلُ −٤ والتوأمُ ٣، والمجموعُ −١ كما كان.
-- ٧) inventory_tidy_uncat (0184): الأصلُ = رصيدُه + رصيدُ التوأم كلُّه، والحصرتان تذهبان. والأصلُ والتوأمُ
--    يُقفلان بالمعرّف (ترتيبُ البيع، 0252) قبل أن يُقرأ ما يُطوى، والتوأمُ يُقرأ من جديد بعد القفل: لقطتُه
--    بسلّة المحذوفات ورصيدُه المطويُّ وما يطرحه الفكُّ (0197) رقمٌ واحد. وتوأمٌ اختفى قبل القفل يُتخطّى، وأصلٌ
--    اختفى يُبقي توأمَه (kept). وشرطُ اللفّة نفسُه يُعاد على ما قُفل: توأمٌ صار له صنفٌ قبل دوره (صنّفته شاشةٌ أخرى،
--    أو طوته لحوض) لم يعد «بلا صنف» فيبقى (kept). وبلا تزامن القراءةُ من جديد هي اللقطةُ نفسُها: لا يتغيّر شيء.
-- ٨) pool_product (0171): الرصيدُ ينتقل للحوض كلُّه ولو سالباً، فالمجموعُ (الحوضُ + الصفّ) قبل الطيّ هو بعده.
--    والحوضُ ينزل تحت الصفر حين يكون أصغرَ من العجز — لا قيدَ يمنعه (مقيس)، والبيعُ لا يسحب من حوضٍ ≤ ٠.
--    والعجزُ للحوض لا للصفّ: الطيُّ معناه «عددُ هذه المادّة صار من عدد الصنف»، والحوضُ يُعرض ويُعدَّل ببطاقة
--    الصنف حيث طُويت، أمّا رصيدُ الصفّ المجمَّع فلا تعرضه قائمةُ المخزون ولا بطاقةُ الصنف (شارة «مجمّع» وحدها).
-- ٩) restore_company (0203) وrestore_company_section (0197): الفكُّ يطرح من حوض الباقي ما أضافه الطيُّ بالضبط ولو
--    صار سالباً، ويعيد للمطويّ حوضَه — فما جرى على الحوض المدموج بعد الطيّ (بيعٌ منه، أو مادّةٌ سالبةٌ طُويت إليه) يبقى
--    على الباقي، والمجموعُ قبل الفكّ هو بعده. نظيرُ فكّ دمج المادّة (٦)، وما سواه حرفاً.
-- والصلاحياتُ كما هي حرفاً (لا توسيع): التسعُ للمسجَّل، والخصمُ داخليٌّ بلا منح.
--
-- ── الحارسُ قبل أيّ تعريف ─────────────────────────────────────────────────
-- القاعدةُ الحيّة لا تُقاس من هنا، فالهجرةُ تقيسها بنفسها: `_drift_assert` (0252) لكلّ دالّةٍ
-- تُعاد — جسمُها الحيُّ ببصمة مصدرها بالمستودع، أو بعلامتنا (إعادةُ هذه الهجرة)، وإلا رفضٌ بلا
-- أثر (درسُ 0241: نسخةٌ حيّةٌ غيرُ نسخة المستودع دُهست بصمت). والبصماتُ يفحصها
-- `scripts/redefine-fingerprint.mjs`. والحرّاسُ كلُّها قبل أوّل تعريف، فالرفضُ لا يترك نصفَ هجرة
-- ما دامت تُطبَّق طلباً واحداً (apply_migration)؛ وباليد: `psql -1 -v ON_ERROR_STOP=1` — psql بلاهما
-- يكمل بعد الخطأ.
--
-- تُطبَّق بعد 0252 (حارسُها و`_invoice_lock_products` منها) **وقبل الواجهة**.
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ (تعريفاتُ دوالّ وتعليقاتٌ وصلاحيات، والحارسُ يقبل علامتَه).
-- أعِد تطبيق 0252–0255 بعد أي إعادةٍ لـ0066/0171/0184/0197/0203/0214/0216/0217/0241/0242.
-- وإعادةُ 0253 وحدها بعد 0255 تُرجع الشراءَ لنصّ 0253 (جسمُ 0255 يحمل علامتَنا فيمرّ الحارس) — أعِد 0255 بعدها.
-- تراجع (إن أساءت 0253 نفسُها، و**لا وصفةَ حيّة**: الحصرُ يرجع حيث صار السالبُ روتيناً). و0255 إن نزلت تُتراجع
-- **قبلها** تراجعَها الكامل (رأسُ 0255): شراؤها مبنيٌّ على نصّ 0253 وحارسُها needs_0253 يقرأ علامتَنا بجسم الشراء،
-- فإعادتُها بعد هذا التراجع تُرفض — وتركُها نازلةً فوقه يُبقي البيعَ يُكلَّف بمتوسّطٍ لا يحرّكه شراءٌ بعد اليوم. ثمّ:
--   أعِد **تعريفَ الدالّة وحده** حرفاً من مصدره — لا الملفَّ كلَّه (0066 يعيد retail_checkout قديمةً،
--   و0241 يدهس تعديلَ البنود من 0252، و0197 يعيد طيَّ الشركات وفكَّها لنصٍّ أقدم من 0198/0201/0203):
--     deduct_stock_pooled وdelete_invoice من 0066 (بلا سطر drop)، record_purchase وupdate_purchase
--     من 0214، return_invoice_items من 0241، restore_product وrestore_company_section من 0197، inventory_tidy_uncat
--     من 0184، pool_product من 0171 (الملفُّ دالّتُها وصلاحياتُها وتعليقُها وحدها)، restore_company من 0203 (الملفُّ
--     دالّتُها وصلاحياتُها وحدها)؛
--   والصلاحياتُ كما هنا.
-- ============================================================================

set lock_timeout = '5s';

-- ── ٠) ما تحتاجه من 0252، ثمّ الحارسُ لكلّ دالّةٍ تُعاد — قبل أيّ تعريف ─────────────
do $$
begin
  if to_regprocedure('public._drift_assert(text,text,text)') is null
     or to_regprocedure('public._invoice_lock_products(uuid,uuid,uuid[])') is null then
    raise exception 'needs_0252' using hint = 'طبّق 0252 قبل هالهجرة — حارسُ الانحراف وقفلُ منتجات الفاتورة منها';
  end if;
end $$;

select public._drift_assert('public.deduct_stock_pooled(uuid,numeric,uuid)', 'd88ea06cf6fa966ee88c9de7570cf548', '-- +0253');
select public._drift_assert('public.record_purchase(jsonb,jsonb)', '51f94edb16e2837f287ee8e80c103935', '-- +0253');
select public._drift_assert('public.update_purchase(uuid,jsonb,jsonb)', '044b1e49c3a9842658bd26f83959d6bb', '-- +0253');
select public._drift_assert('public.return_invoice_items(uuid,jsonb,text,text)', '8e5d2b1ce5342775f0d1d8acb6ceade5', '-- +0253');
select public._drift_assert('public.delete_invoice(uuid)', 'f75d9e1467c1b2fbb6920655014c2b9c', '-- +0253');
select public._drift_assert('public.restore_product(uuid)', 'e0c80bbe6552b21e81af23fe8a997a4b', '-- +0253');
select public._drift_assert('public.inventory_tidy_uncat()', '78c883b943926dd3e1bcf30f0d42fd5e', '-- +0253');
select public._drift_assert('public.pool_product(uuid,uuid)', '7a24d76fdcd7e4940272ec9efde6e7d9', '-- +0253');
select public._drift_assert('public.restore_company(uuid)', '901f0d78c4631ae67af7e2cd729796fe', '-- +0253');
select public._drift_assert('public.restore_company_section(uuid)', 'a768a797ef1be87260c0e772b93206a6', '-- +0253');

-- ── ١) الخصمُ من الرصيد ثمّ الحوض — نصُّ 0066 حرفاً، والرصيدُ يعطي ما لم يعطه الحوض ──────
create or replace function public.deduct_stock_pooled(p_product uuid, p_qty numeric, p_clinic uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare
  v_sec       uuid;
  v_stock     numeric(14,3);
  v_pool      numeric(14,3);
  v_fromstock numeric(14,3) := 0;
  v_frompool  numeric(14,3) := 0;
  v_rem       numeric(14,3);
begin
  if p_product is null or coalesce(p_qty, 0) <= 0 then return 0; end if;
  -- Known/tracked stock first — lock the product row.
  select stock, section_id into v_stock, v_sec from products
   where id = p_product and clinic_id = p_clinic for update;
  if not found then return 0; end if;
  v_fromstock := least(p_qty, greatest(0, coalesce(v_stock, 0)));
  -- 0253: الرصيدُ لا يُخصم هنا بما كان موجباً وحده (والباقي كان يُرمى) — يُخصم تحت، بعد الحوض. -- +0253
-- -0253   if v_fromstock > 0 then
-- -0253     update products set stock = greatest(0, stock - v_fromstock)
-- -0253      where id = p_product and clinic_id = p_clinic;
-- -0253   end if;
  v_rem := p_qty - v_fromstock;
  -- Only the shortfall draws on the section pool (the unknown legacy reserve).
  if v_rem > 0 and v_sec is not null then
    select pooled_stock into v_pool from company_sections
     where id = v_sec and clinic_id = p_clinic for update;
    if v_pool is not null and v_pool > 0 then
      v_frompool := least(v_rem, v_pool);
      update company_sections set pooled_stock = greatest(0, pooled_stock - v_frompool)
       where id = v_sec and clinic_id = p_clinic;
    end if;
  end if;
  -- 0253: الرصيدُ يعطي ما لم يعطه الحوض ولو صار سالباً. السطرُ يحفظ stock_qty كاملاً، والعكسُ يردّ -- +0253
  -- stock_qty − pooled_qty — فما كان يُرمى هنا كان يعود للرفّ قطعةً لم تكن. والحوضُ كما كان: -- +0253
  -- يأخذ ما زاد على الرصيد الموجب وحده، وما يرجّعه هو حصّتُه. -- +0253
  if p_qty - v_frompool > 0 then -- +0253
    update products set stock = coalesce(stock, 0) - (p_qty - v_frompool) -- +0253
     where id = p_product and clinic_id = p_clinic; -- +0253
  end if; -- +0253
  return v_frompool;
end $$;
revoke all on function public.deduct_stock_pooled(uuid, numeric, uuid) from public, anon, authenticated;
comment on function public.deduct_stock_pooled(uuid, numeric, uuid) is
  'خصمُ سطرِ مادّة: الحوضُ يأخذ ما زاد على الرصيد الموجب، والرصيدُ يعطي الباقي ولو سالباً (0253 — كان يُرمى). ترجع حصّةَ الحوض لـpooled_qty. داخليّة: لا تُنادى من anon ولا authenticated.';

-- ── ٢) تسجيلُ الشراء — نصُّ 0214 حرفاً، والعجزُ الأكبرُ من الشراء يبقى ظاهراً ──────────────
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
    v_line := v_line + 1;
    v_how  := case when v_pid is not null then 'id' end;
    v_bj   := null;
    v_after := null;

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
      select * into v_before from products where id = v_pid and clinic_id = v_clinic;
      if found then v_bj := purchase_effect_snap(v_before); end if;
      update products set
-- -0253         stock          = greatest(0, coalesce(stock, 0) + v_qty),
        -- 0253: عجزٌ أكبرُ من الشراء يبقى ظاهراً (−٠٫٠٤ + ٠٫٠٢ = −٠٫٠٢ لا صفر)، والموجبُ كما كان. -- +0253
        stock          = greatest(least(coalesce(stock, 0), 0), coalesce(stock, 0) + v_qty), -- +0253
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
                                  outcome, matched_by, qty, before, after, changed)
    values (v_clinic, v_purchase.id, 'record', v_line, v_pid, coalesce(v_after.name, nullif(it->>'name',''), 'Item'),
            nullif(it->>'barcode',''),
            case when v_how is null then 'created' else 'matched' end, v_how, v_qty,
            v_bj, purchase_effect_snap(v_after), purchase_effect_changed(v_bj, purchase_effect_snap(v_after)));
  end loop;

  return v_purchase;
end $function$;
revoke all on function public.record_purchase(jsonb, jsonb) from public, anon;
grant execute on function public.record_purchase(jsonb, jsonb) to authenticated;
comment on function public.record_purchase(jsonb, jsonb) is
  'تسجيلُ فاتورةِ شراء (0166، و0205 pooled)، وتكتب منذ 0211 كشفَ ما فعلته بكلّ سطرٍ بـpurchase_effects (op=record). ومنذ 0253 لا تمحو عجزاً أكبرَ من الشراء: greatest(least(stock,0), stock + qty).';

-- ── ٣) تعديلُ الشراء — نصُّ 0214 حرفاً بلا الحصرة الأخيرة ─────────────────────────────
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
  -- 0253: ولا حصرةَ نهائية بعد اليوم (انظر ٢·٥) — الرصيدُ النهائيُّ يبقى كما هو ولو سالباً. -- +0253
  for old_it in
    select product_id, qty from purchase_items
     where purchase_id = p_purchase and clinic_id = v_clinic and product_id is not null
  loop
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
  end loop;

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
  'تعديلُ فاتورةِ شراء: يعكس السطورَ القديمة بلا حصرٍ ثمّ يبني الجديدة (0205)، ومنذ 0253 بلا حصرةٍ أخيرة — قطعٌ تحت ما صُرف يبقى سالباً ظاهراً. ويكتب منذ 0211 كشفَ ما فعله بـpurchase_effects (op=update): «كان» قبل التعديل كلِّه، و«صار» الرصيدُ النهائيّ، والمشالُ سطرُ removed.';

-- ── ٤) المرتجعُ الجزئيّ — نصُّ 0241 حرفاً، والقفلُ بالمعرّف وتصفيرُ اللفّة ──────────────────
create or replace function public.return_invoice_items(
  p_invoice uuid, p_returns jsonb, p_method text default null, p_note text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic   uuid := auth_clinic();
  v_inv      invoices;
  v_method   text;
  v_details  jsonb;
  v_pos      numeric(14,2);
  v_back     numeric(14,2);
  v_paid     numeric(14,2);
  v_subtotal numeric(12,2) := 0;
  v_cost     numeric(12,2) := 0;
  v_items    numeric(12,3) := 0;
  v_count    int := 0;
  v_total    numeric(12,2);
  v_stamp    text;
  v_full     boolean := true;
  r          record;
  it         invoice_items;
  v_ret      numeric(12,3);
  v_per      numeric(14,6);
  v_ret_stock numeric(12,3);
  v_ret_pool  numeric(12,3);
  v_section  uuid;
  v_forg_old numeric;
  v_forg_new numeric;
  v_n        int := 0; -- 0253: مداخلُ المرتجع الجزئيّ التي رجّعت شيئاً -- +0253
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;

  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  -- 0253: منتجاتُ الفاتورة تُقفل بالمعرّف قبل أوّل كتابةٍ على رصيد — بترتيب البيع (0252) لا بترتيب -- +0253
  -- السطور: ترتيبان متعاكسان على نفس الصفوف انسداد. -- +0253
  perform _invoice_lock_products(v_clinic, p_invoice, '{}'::uuid[]); -- +0253
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;
  if p_returns is null or jsonb_typeof(p_returns) <> 'array' or jsonb_array_length(p_returns) = 0 then
    raise exception 'nothing to return';
  end if;

  -- هل هذا إرجاعٌ كامل؟ كل سطرٍ بالفاتورة مطلوبٌ إرجاع كامل كميته.
  for it in select * from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic loop
    select coalesce((e->>'qty')::numeric, 0) into v_ret
      from jsonb_array_elements(p_returns) e where e->>'item_id' = it.id::text limit 1;
    if coalesce(v_ret, 0) + 0.0005 < it.qty then v_full := false; end if;
  end loop;

  if v_full then
    -- إرجاع كامل ⇒ نفس دلالات refund_invoice: استرجاع مخزون كل الأسطر
    -- وقلب الحالة، والأسطر تبقى كما طُبعت للزبون.
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
    update invoices set status = 'refunded', refunded_at = now()
      where id = p_invoice and clinic_id = v_clinic
      returning * into v_inv;
    return v_inv;
  end if;

  -- ── إرجاع جزئي: سطراً سطراً ────────────────────────────────────────────
  for r in
    select
      nullif(e->>'item_id','')::uuid       as item_id,
      coalesce((e->>'qty')::numeric, 0)    as ret_qty
    from jsonb_array_elements(p_returns) e
  loop
    -- 0253: صفرٌ أوّلَ كلِّ لفّة. سطرُ خدمةٍ بعد سطر منتجٍ كان يرث حصّتَه، فيُكتب stock_qty سالباً -- +0253
    -- على كميةٍ موجبة ويُرفض المرتجعُ كلُّه (23514، invoice_items_nonneg). -- +0253
    v_ret_stock := 0; v_ret_pool := 0; -- +0253
    if r.item_id is null or r.ret_qty <= 0 then continue; end if;
    select * into it from invoice_items
      where id = r.item_id and invoice_id = p_invoice and clinic_id = v_clinic for update;
    if not found then raise exception 'item not found'; end if;
    v_ret := least(round(r.ret_qty, 3), it.qty);
    -- 0253: ما يُعدّ هو ما يرجع فعلاً — الكميةُ مقرَّبةً ومحدودةً بسطرها، لا الخامّ: ٠٫٠٠٠٤ تتخطّى «≤ ٠» وترجّع صفراً، -- +0253
    -- وكانت تختم «مرتجع» وتعيد المجموعَ من السطور (فاتورةٌ مجموعُها فوق سطورها تردّ الفرقَ نقداً) بلا شيءٍ راجع. -- +0253
    -- وما رجّع صفراً لا يلمس سطرَه ولا مادّتَه. -- +0253
    if v_ret = 0 then continue; end if; -- +0253
    v_n := v_n + 1; -- +0253

    -- المخزون: بنفس نسب البيع — المسحوب لكل وحدة، وحصة القسم نسبية.
    if it.product_id is not null then
      v_per := case when it.qty > 0 and it.stock_qty is not null then it.stock_qty / it.qty else 1 end;
      v_ret_stock := round(v_ret * v_per, 3);
      v_ret_pool  := round(coalesce(it.pooled_qty, 0) * v_ret / it.qty, 3);
      if v_ret_pool > 0 then
        select p.section_id into v_section from products p
          where p.id = it.product_id and p.clinic_id = v_clinic;
        if v_section is not null then
          update company_sections set pooled_stock = pooled_stock + v_ret_pool
            where id = v_section and clinic_id = v_clinic;
        else
          v_ret_pool := 0; -- المنتج فقد قسمه — الكل لرصيده
        end if;
      end if;
      update products set stock = round(stock + (v_ret_stock - v_ret_pool), 3)
        where id = it.product_id and clinic_id = v_clinic;
    end if;

    if v_ret + 0.0005 >= it.qty then
      delete from invoice_items where id = it.id and clinic_id = v_clinic;
    else
      update invoice_items set
        qty        = round(it.qty - v_ret, 3),
        line_total = round((it.qty - v_ret) * it.unit_price, 2),
        stock_qty  = case when it.stock_qty is null then null else round(it.stock_qty - v_ret_stock, 3) end,
        pooled_qty = case when it.pooled_qty is null then null else round(it.pooled_qty - v_ret_pool, 3) end
      where id = it.id and clinic_id = v_clinic;
    end if;
  end loop;
  -- 0253: ولا مدخلَ رجّع شيئاً (كلُّ كميةٍ ≤ ٠ أو تُقرَّب صفراً، أو بلا سطر) ⇒ «nothing to return» — نفسُ رفض المصفوفة الفارغة -- +0253
  -- حرفاً (رمزٌ واحد لمعنى واحد). كان يمرّ بلا حركةٍ ويختم «مرتجع» بملاحظات الفاتورة ويعيد كتابةَ مجاميعها. -- +0253
  -- واللفّةُ لم تكتب شيئاً قبله، والشاشةُ لا تصله (ترسل ما فوق الصفر وحده، ReturnsPanel). -- +0253
  if v_n = 0 then raise exception 'nothing to return'; end if; -- +0253

  -- إعادة الحساب من الأسطر الباقية — الخصم الثابت يبقى كما هو.
  select coalesce(sum(line_total), 0), coalesce(sum(round(qty * unit_cost, 2)), 0),
         coalesce(sum(qty), 0), count(*)
    into v_subtotal, v_cost, v_items, v_count
    from invoice_items where invoice_id = p_invoice and clinic_id = v_clinic;
  if v_count = 0 then raise exception 'nothing left'; end if; -- الكامل عولج فوق

  v_total := greatest(round(v_subtotal - greatest(coalesce(v_inv.discount, 0), 0), 2), 0);
  v_paid  := coalesce(v_inv.amount_paid, v_inv.total);
  -- 0241: الخصمُ على الدين يُستهلك قبل أيّ نقد — لا يخرج نقدٌ إلا حين ينزل المجموعُ تحت المدفوع.
  v_forg_old := coalesce(v_inv.forgiven, 0);
  v_forg_new := least(v_forg_old, greatest(0, v_total - v_paid));
  v_total    := round(v_total - v_forg_new, 2);
  -- النقد الخارج فعلاً: ما دفعه فوق الإجمالي الجديد. بيعة آجلة ⇒ الدين ينقص وحده.
  v_back  := greatest(round(v_paid - v_total, 2), 0);

  v_details := coalesce(v_inv.payment_details, '[]'::jsonb);
  if v_back > 0 then
    v_method := coalesce(
      nullif(btrim(p_method), ''),
      (select e->>'method' from jsonb_array_elements(v_details) e
        where (e->>'amount')::numeric > 0 order by (e->>'amount')::numeric desc limit 1),
      v_inv.payment_method, 'cash');
    -- تثبيت الساق الضمنية قبل السالب — نفس درس 0113 حرفياً.
    select coalesce(sum((e->>'amount')::numeric), 0) into v_pos
      from jsonb_array_elements(v_details) e where (e->>'amount')::numeric > 0;
    if v_pos < v_paid then
      v_details := v_details || jsonb_build_object(
        'method', coalesce(v_inv.payment_method, v_method),
        'amount', v_paid - v_pos,
        'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
    end if;
    v_details := v_details || (jsonb_build_object(
        'method', v_method, 'amount', -v_back,
        'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
      || jsonb_build_object('note', left('مرتجع' || case when coalesce(btrim(p_note), '') <> '' then ': ' || btrim(p_note) else '' end, 120)));
  end if;

  v_stamp := 'مرتجع ' || to_char(now(), 'YYYY-MM-DD') || ': '
          || to_char(coalesce(v_inv.total, 0), 'FM999,999,990.99') || ' ← ' || to_char(v_total, 'FM999,999,990.99')
          || case when v_back > 0 then ' · أُعيد نقداً ' || to_char(v_back, 'FM999,999,990.99') else '' end
          || case when coalesce(btrim(p_note), '') <> '' then ' · ' || left(btrim(p_note), 120) else '' end;

  if v_forg_new < v_forg_old then
    perform invoice_forgiveness_consume(v_clinic, p_invoice, v_forg_old - v_forg_new, 'مرتجع', v_inv.total, v_paid);
  end if;

  update invoices set
    subtotal        = v_subtotal,
    total           = v_total,
    forgiven        = v_forg_new,
    cost_total      = v_cost,
    profit          = round(v_total - v_cost, 2),
    item_count      = v_items,
    amount_paid     = greatest(round(v_paid - v_back, 2), 0),
    payment_details = v_details,
    payment_method  = coalesce((select e->>'method' from jsonb_array_elements(v_details) e
                                 where (e->>'amount')::numeric > 0
                                 order by (e->>'amount')::numeric desc limit 1),
                               v_inv.payment_method),
    notes           = case when coalesce(notes, '') = '' then v_stamp else notes || E'\n' || v_stamp end
  where id = p_invoice and clinic_id = v_clinic
  returning * into v_inv;

  return v_inv;
end $$;
revoke all on function public.return_invoice_items(uuid, jsonb, text, text) from public, anon;
grant execute on function public.return_invoice_items(uuid, jsonb, text, text) to authenticated;

-- ── ٥) حذفُ الفاتورة — نصُّ 0066 حرفاً، والقفلُ بالمعرّف ─────────────────────────────────
create or replace function public.delete_invoice(p_invoice uuid)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_status text;
  r record;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if auth_role() <> 'manager' then raise exception 'forbidden: managers only'; end if;
  select status into v_status from invoices where id = p_invoice and clinic_id = v_clinic for update;
  if not found then raise exception 'invoice not found'; end if;
  -- 0253: منتجاتُ الفاتورة تُقفل بالمعرّف قبل أوّل ردٍّ للرصيد وقبل الحذف المتتالي لسطورها — -- +0253
  -- بترتيب البيع (0252) لا بترتيب السطور. -- +0253
  perform _invoice_lock_products(v_clinic, p_invoice, '{}'::uuid[]); -- +0253
  if v_status is distinct from 'refunded' then
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
  end if;
  delete from invoices where id = p_invoice and clinic_id = v_clinic;
end $$;
revoke all on function public.delete_invoice(uuid) from public, anon;
grant execute on function public.delete_invoice(uuid) to authenticated;

-- ── ٦) استرجاعُ المحذوف وفكُّ الدمج — نصُّ 0197 حرفاً، والفكُّ بلا أرضيّة ───────────────────
create or replace function public.restore_product(p_id uuid)
returns products
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_t      products_trash;
  v_p      products;
  v_keep   products;
  v_code   text;
  c        text;
  v_alts   jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then raise exception 'forbidden: inventory role required'; end if;
  select * into v_t from products_trash where id = p_id and clinic_id = v_clinic for update;
  if v_t.id is null then raise exception 'not in trash'; end if;
  if exists (select 1 from products where id = p_id) then raise exception 'product already exists'; end if;
  v_code := v_t.row->>'barcode';

  if v_t.merged_into is not null then
    select * into v_keep from products where id = v_t.merged_into and clinic_id = v_clinic for update;
    if v_keep.id is not null then
      update products
-- -0253          set stock = greatest(0, coalesce(stock, 0) - coalesce(v_t.stock, 0)),
         -- 0253: بلا أرضيّة. الأصلُ ٢ والتوأمُ ٣ وبيع ٦ ⇒ −١؛ والفكُّ: الأصلُ −٤ والتوأمُ ٣ -- +0253
         -- (المجموعُ −١ كما كان — الأرضيّةُ كانت تجعله ٣). -- +0253
         set stock = coalesce(stock, 0) - coalesce(v_t.stock, 0), -- +0253
             alt_codes = array_remove(coalesce(alt_codes, '{}'), v_code),
             barcode = case when v_t.keep_barcode is null and v_code is not null and barcode = v_code then null else barcode end
       where id = v_keep.id;
      for c in select jsonb_array_elements_text(coalesce(v_t.row->'alt_codes', '[]'::jsonb)) loop
        update products set alt_codes = array_remove(coalesce(alt_codes, '{}'), c) where id = v_keep.id;
      end loop;
    end if;
  end if;

  if jsonb_typeof(v_t.row->'alt_codes') = 'array' then
    select coalesce(jsonb_agg(a.code), '[]'::jsonb) into v_alts
      from jsonb_array_elements_text(v_t.row->'alt_codes') as a(code)
     where not exists (
       select 1 from products o
        where o.clinic_id = v_t.clinic_id
          and o.id <> p_id
          and (inv_norm_code(o.barcode) = inv_norm_code(a.code)
               or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) x
                           where inv_norm_code(x) = inv_norm_code(a.code))));
    v_t.row := jsonb_set(v_t.row, '{alt_codes}', v_alts);
  end if;

  -- الحارسُ يقرأ الطرفين (0167): رمزٌ صار **إضافياً** لغيره يمنع الإدراج مثلما
  -- يمنعه أساسيُّ غيره. وبلا هذا يرفض المحفّزُ الإدراجَ فتستحيل الاستعادةُ رأساً.
  if v_code is not null and exists (
       select 1 from products o
        where o.clinic_id = v_t.clinic_id
          and ( inv_norm_code(o.barcode) = inv_norm_code(v_code)
                or exists (select 1 from unnest(coalesce(o.alt_codes, '{}')) x
                            where inv_norm_code(x) = inv_norm_code(v_code)) )) then
    v_t.row := v_t.row - 'barcode';
  end if;

  /* **لقطةٌ أيتمَها طيٌّ أو حذف** (0197): الصورةُ قد تحمل شركةً أو صنفاً لم
     يعد موجوداً — دمجُ شركاتٍ، أو حذفُ صنفٍ، أو حذفٌ من نسخةٍ قديمة. والإدراجُ
     عندها يخرق المفتاحَ الأجنبيّ (23503) فتصير الاستعادةُ **مستحيلةً للأبد**
     والعيادةُ ترى المنتجَ بتبويب المحذوفات وتضغط «استرجاع» فيرجع خطأٌ خام.
     `merge_companies` تعيد توجيهَ اللقطة بنفسها؛ وهذا شبكةُ الأمان الأخيرة
     لكلّ طريقٍ آخر — المنتجُ يرجع بلا شركةٍ أفضلَ من ألّا يرجع أبداً. */
  if (v_t.row->>'company_id') is not null
     and not exists (select 1 from companies where id = (v_t.row->>'company_id')::uuid
                                             and clinic_id = v_t.clinic_id) then
    v_t.row := jsonb_set(v_t.row, '{company_id}', 'null'::jsonb);
  end if;
  if (v_t.row->>'section_id') is not null
     and not exists (select 1 from company_sections where id = (v_t.row->>'section_id')::uuid
                                                    and clinic_id = v_t.clinic_id) then
    v_t.row := jsonb_set(v_t.row, '{section_id}', 'null'::jsonb);
  end if;

  insert into products select * from jsonb_populate_record(null::products, v_t.row) returning * into v_p;
  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)  and (product_id is null or product_id = v_t.merged_into);
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids) and (product_id is null or product_id = v_t.merged_into);
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)       and (product_id is null or product_id = v_t.merged_into);
  delete from products_trash where id = p_id;
  return v_p;
end $function$;
revoke all on function public.restore_product(uuid) from public, anon;
grant execute on function public.restore_product(uuid) to authenticated;

-- ── ٧) «رتّب المخزن» — نصُّ 0184 حرفاً، والأصلُ يأخذ رصيدَ التوأم كلَّه ────────────────────
create or replace function public.inventory_tidy_uncat()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_clinic uuid := auth_clinic(); v_role text := auth_role(); dup record; v_target uuid; v_merged int := 0; v_kept int := 0;
        v_inv uuid[]; v_pur uuid[]; v_bar uuid[]; v_sold numeric;
        v_tgt_barcode text; v_codes text[];
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then raise exception 'forbidden: inventory role required'; end if;
  for dup in select * from products where clinic_id = v_clinic and section_id is null order by created_at loop
    v_target := null;
    if coalesce(dup.barcode,'') <> '' then
      select id into v_target from products where clinic_id = v_clinic and id <> dup.id and section_id is not null
        and coalesce(barcode,'') <> '' and inv_norm_code(barcode) = inv_norm_code(dup.barcode) order by created_at limit 1;
    end if;
    if v_target is null and length(inv_norm_name(dup.name)) >= 2 then
      select id into v_target from products where clinic_id = v_clinic and id <> dup.id and section_id is not null
        and company_id is not distinct from dup.company_id and inv_norm_name(name) = inv_norm_name(dup.name) order by created_at limit 1;
    end if;
    if v_target is null then v_kept := v_kept + 1; continue; end if;
    -- 0253: الأصلُ والتوأمُ يُقفلان بالمعرّف (ترتيبُ البيع 0252 ومحفّزِ الطيّ) قبل قراءة ما يُطوى، والتوأمُ يُقرأ -- +0253
    -- من جديد: اللفّةُ قرأته من لقطتها بلا قفل، فبيعةٌ له تُثبَّت بينهما كانت تضيع (الأصلُ يأخذ رصيدَ ما قبلها -- +0253
    -- وسلّةُ المحذوفات تحفظه، فالفكُّ يرجعه كما كان). وتوأمٌ اختفى (طواه أو حذفه غيرُنا) يُتخطّى — لقطتُه كانت -- +0253
    -- تُطوى ثانيةً فيرجع رصيدُ المحذوف للأصل؛ وأصلٌ اختفى يُبقي توأمَه. وشرطُ اللفّة (بلا صنف) يُعاد على ما قُفل: -- +0253
    -- توأمٌ صنّفته شاشةٌ أخرى أو طوته لحوضٍ قبل دوره صار مادّةً بصنفها — طيُّه كان يحذفها ويضمّها لأصلٍ بصنفٍ آخر. -- +0253
    perform 1 from products where clinic_id = v_clinic and id in (dup.id, v_target) order by id for update; -- +0253
    select * into dup from products where id = dup.id and clinic_id = v_clinic; -- +0253
    if not found then continue; end if; -- +0253
    if dup.section_id is not null then v_kept := v_kept + 1; continue; end if; -- +0253
    if not exists (select 1 from products where id = v_target and clinic_id = v_clinic) then v_kept := v_kept + 1; continue; end if; -- +0253
    select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = dup.id;
    select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = dup.id;
    select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = dup.id and qty > 0;
    insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason, deleted_by, merged_into, keep_barcode)
    values (dup.id, v_clinic, to_jsonb(dup), v_inv, v_pur, v_bar, v_sold, coalesce(dup.stock, 0), null, auth.uid(), v_target,
            (select nullif(barcode, '') from products where id = v_target))
    on conflict (id) do update
      set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids, purchase_item_ids = excluded.purchase_item_ids,
          barcode_ids = excluded.barcode_ids, sold_qty = excluded.sold_qty, stock = excluded.stock, reason = null,
          deleted_by = auth.uid(), deleted_at = now(), merged_into = excluded.merged_into, keep_barcode = excluded.keep_barcode;
    -- النقلُ أوّلاً: المفاتيحُ الأجنبية `on delete set null`، فحذفُ التوأم قبل
    -- النقل يُفرّغ product_id فتضيع الروابط ولا يبقى ما يُنقَل.
    update purchase_items     set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update invoice_items      set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;
    update generated_barcodes set product_id = v_target where product_id = dup.id and clinic_id = v_clinic;

    /* ── الوراثةُ تُحسب **قبل** الحذف والصفُّ حيّ، وتُكتب بعده ──────────────
     * الحسابُ قبل الحذف لأن `dup` لقطةٌ بيدنا، والكتابةُ بعده لأن كتابةَ
     * الباركود والصفّان حيّان تخرق الفهرسَ الفريد (23505) فتُلغي العمليةَ
     * كلَّها — وهذا سببُ ترتيب 0167 الأصليّ، نُبقيه.
     *
     * ونفسُ منطق `merge_products` (0144) حرفاً بحرف: الأساسيُّ والإضافية
     * تلحق بالأصل، بلا فارغٍ ولا مكرَّرٍ ولا ما يساوي باركودَ الهدف. */
    select nullif(barcode, '') into v_tgt_barcode from products where id = v_target and clinic_id = v_clinic;
    select coalesce(alt_codes, '{}') into v_codes from products where id = v_target and clinic_id = v_clinic;
    if coalesce(dup.barcode, '') <> ''
       and inv_norm_code(dup.barcode) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''))
       and not exists (select 1 from unnest(v_codes) c where inv_norm_code(c) = inv_norm_code(dup.barcode)) then
      v_codes := v_codes || dup.barcode;
    end if;
    if dup.alt_codes is not null and dup.alt_codes <> '{}' then
      select coalesce(array_agg(distinct c), '{}') into v_codes
        from unnest(v_codes || dup.alt_codes) as c
       where c is not null and c <> ''
         and inv_norm_code(c) is distinct from inv_norm_code(coalesce(v_tgt_barcode, ''));
    end if;
    /* ولا يُسرق رمزٌ صار لمنتجٍ ثالث — نظيرُ فحص `attach_product_code`.
     * (الهدفُ والتوأمُ مستثنيان: الأوّل مالكٌ، والثاني على وشك الحذف.) */
    if v_codes is not null and v_codes <> '{}' then
      select coalesce(array_agg(c), '{}') into v_codes
        from unnest(v_codes) as c
       where not exists (
         select 1 from products o
          where o.clinic_id = v_clinic and o.id <> v_target and o.id <> dup.id
            and (inv_norm_code(o.barcode) = inv_norm_code(c)
                 or exists (select 1 from unnest(coalesce(o.alt_codes,'{}')) x where inv_norm_code(x) = inv_norm_code(c))));
    end if;

    delete from products where id = dup.id and clinic_id = v_clinic;
    -- ── الوراثةُ: الصورةُ والوصفُ يملآن فراغَ الأصل ولا يزيحان ما فيه ──
    -- الأصلُ بلا صورةٍ والتوأمُ له صورة ⇒ الصورةُ تنتقل. وبالعكس تبقى صورةُ
    -- الأصل. `coalesce` لا `greatest`: آخرُ ما يُرى ليس أصدقَ، والمالكُ هو
    -- الباقي. و**الظهورُ بالمتجر لا يُورَّث** بقرارٍ صريح: وراثتُه تنشر
    -- منتجاً لم يُنشَر عمداً، والنشرُ فعلٌ يُقصد لا يُستنتَج.
-- -0253     update products set stock = greatest(0, coalesce(stock,0) + greatest(0, coalesce(dup.stock,0))),
    -- 0253: رصيدُ التوأم كلُّه ولو سالباً. الحصرتان كانتا تمحوان عجزَه، ثمّ يطرحه الفكُّ (0197) فيزيد -- +0253
    -- الأصلُ بما لم يكن: ٣ + (−١) كان ٣ وفكُّه ٤، وهو ٢ وفكُّه ٣. -- +0253
    update products set stock = coalesce(stock,0) + coalesce(dup.stock,0), -- +0253
      barcode = coalesce(nullif(barcode,''), dup.barcode),
      alt_codes = coalesce(v_codes, '{}'),
      expiry_date = coalesce(expiry_date, dup.expiry_date),
      image_path = coalesce(nullif(image_path, ''), nullif(dup.image_path, '')),
      store_desc = coalesce(nullif(store_desc, ''), nullif(dup.store_desc, ''))
    where id = v_target and clinic_id = v_clinic;
    v_merged := v_merged + 1;
  end loop;
  return jsonb_build_object('merged', v_merged, 'kept', v_kept);
end $function$;
revoke all on function public.inventory_tidy_uncat() from public, anon;
grant execute on function public.inventory_tidy_uncat() to authenticated;

-- ── ٨) طيُّ مادّةٍ لحوض صنفها — نصُّ 0171 حرفاً، والرصيدُ ينتقل كلُّه ولو سالباً ─────────────────
create or replace function public.pool_product(p_product uuid, p_section uuid)
returns products
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_stock  numeric;
  v_pool   numeric;
  v_out    products;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required'; end if;

  -- القفلُ على المنتج أوّلاً ثم الصنف — ترتيبٌ ثابتٌ يمنع التشابك.
  select stock into v_stock from products
   where id = p_product and clinic_id = v_clinic for update;
  if not found then raise exception 'product_not_found'; end if;

  -- الحوضُ يُقرأ **حيّاً** لا من لقطةِ المتصفّح: قراءةٌ بائتة تدوس تعديلَ
  -- جهازٍ آخر بصمت.
  select coalesce(pooled_stock, 0) into v_pool from company_sections
   where id = p_section and clinic_id = v_clinic for update;
  if not found then raise exception 'section_not_found'; end if;

  update company_sections
-- -0253      set pooled_stock = round(v_pool + greatest(0, coalesce(v_stock, 0)), 3)
     -- 0253: الرصيدُ ينتقل للحوض كلُّه ولو سالباً — المجموعُ (الحوضُ + الصفّ) قبل الطيّ هو نفسُه بعده. -- +0253
     -- الحصرُ كان يمحو العجز: مادّةٌ عند −٢ على حوضٍ ٥ ⇒ الحوضُ ٥ والصفُّ صفر (+٢ لم تكن)، والآن ٣. -- +0253
     -- وحوضٌ أصغرُ من العجز ينزل تحت الصفر ويُقال ببطاقة الصنف؛ والبيعُ لا يسحب من حوضٍ ≤ ٠. -- +0253
     set pooled_stock = round(v_pool + coalesce(v_stock, 0), 3) -- +0253
   where id = p_section and clinic_id = v_clinic;

  update products
     set pooled = true, section_id = p_section, stock = 0
   where id = p_product and clinic_id = v_clinic
  returning * into v_out;

  return v_out;
end $function$;
revoke all on function public.pool_product(uuid, uuid) from public, anon;
grant execute on function public.pool_product(uuid, uuid) to authenticated;
comment on function public.pool_product(uuid, uuid) is
  'يطوي رصيدَ منتجٍ متتبَّع إلى حوض صنفه ويصفّره بالمنتج — بمعاملةٍ واحدة (0171)، ويقرأ الحوضَ بـfor update فلا يدوس تعديلاً متزامناً. ومنذ 0253 بلا حصر: الرصيدُ ينتقل كلُّه ولو سالباً، فالمجموعُ (الحوضُ + الصفّ) لا يتغيّر بالطيّ، والحوضُ قد ينزل تحت الصفر.';

-- ── ٩) فكُّ طيّ الشركة — نصُّ 0203 حرفاً، وحوضُ الباقي يُطرح منه ما أُضيف بلا أرضيّة ──────────────────────
create or replace function public.restore_company(p_id uuid)
returns companies
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_t      companies_trash;
  v_row    companies;
  v_sec    jsonb;
  v_moved  numeric;
  v_sid    uuid;
  v_union  text;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'الاسترجاعُ للمدير والطبيب.';
  end if;
  select * into v_t from companies_trash where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'not_in_trash' using hint = 'ما لكينا صورةً لهذه الشركة.'; end if;
  if exists (select 1 from companies where id = p_id) then
    raise exception 'already_there' using hint = 'الشركةُ موجودةٌ أصلاً.';
  end if;
  -- **الوجهةُ لازم تكون قائمة**: بلا هذا يمرّ الاسترجاعُ فارغاً ويقول «تمّ».
  if v_t.merged_into is not null
     and not exists (select 1 from companies where id = v_t.merged_into and clinic_id = v_clinic) then
    raise exception 'no_merge_target'
      using hint = 'الشركةُ الي انطوت بيها محذوفة — استرجعها أوّلاً من المحذوفات، وبعدين هذي.';
  end if;

  insert into companies select * from jsonb_populate_record(null::companies, v_t.row);
  select * into v_row from companies where id = p_id;

  if v_t.merged_into is not null then
    update products set company_id = p_id
     where id = any (v_t.product_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update purchases set company_id = p_id, company_name = coalesce(v_t.row->>'name', company_name)
     where id = any (v_t.purchase_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update purchase_payments set company_id = p_id
     where id = any (v_t.payment_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update company_charges set company_id = p_id
     where id = any (v_t.charge_ids) and clinic_id = v_clinic and company_id = v_t.merged_into;
    update products_trash set row = jsonb_set(row, '{company_id}', to_jsonb(p_id::text))
     where clinic_id = v_clinic and (row->>'company_id')::uuid = v_t.merged_into
       and (row->>'id')::uuid = any (v_t.product_ids);

    v_union := nullif(btrim(case
        when btrim(coalesce(v_t.keep_note, '')) = btrim(coalesce(v_t.row->>'note', ''))
          then coalesce(v_t.keep_note, v_t.row->>'note')
        else concat_ws(E'\n', nullif(btrim(v_t.keep_note), ''), nullif(btrim(v_t.row->>'note'), ''))
      end), '');
    update companies set note = v_t.keep_note
     where id = v_t.merged_into and clinic_id = v_clinic
       and note is not distinct from v_union;
  else
    update products          set company_id = p_id where id = any (v_t.product_ids)  and clinic_id = v_clinic and company_id is null;
    update purchases         set company_id = p_id where id = any (v_t.purchase_ids) and clinic_id = v_clinic and company_id is null;
    update purchase_payments set company_id = p_id where id = any (v_t.payment_ids)  and clinic_id = v_clinic and company_id is null;
    insert into company_charges
    select (jsonb_populate_record(null::company_charges, c || jsonb_build_object('company_id', p_id::text))).*
      from jsonb_array_elements(coalesce(v_t.charges, '[]'::jsonb)) c
     where (c->>'clinic_id')::uuid = v_clinic
    on conflict (id) do nothing;
  end if;

  for v_sec in select * from jsonb_array_elements(coalesce(v_t.sections, '[]'::jsonb)) loop
    v_moved := coalesce((v_sec->>'pooled_moved')::numeric, 0);
    v_sid   := (v_sec->>'id')::uuid;
    if (v_sec->>'folded_into') is not null then
      if not exists (select 1 from company_sections where id = v_sid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = v_sid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      if v_moved <> 0 then
-- -0253         update company_sections set pooled_stock = round(greatest(0, coalesce(pooled_stock, 0) - v_moved), 3)
        -- 0253: الباقي ناقصَ ما أضافه الطيُّ بالضبط ولو صار سالباً، والمطويُّ يرجع بحوضه (تحت). ما جرى على الحوض المدموج -- +0253
        -- بعد الطيّ — بيعٌ منه، أو مادّةٌ سالبةٌ طُويت إليه (pool_product، هنا) — يبقى على الباقي: الأرضيّةُ كانت تردّه بضاعةً لم -- +0253
        -- تكن. حوضٌ ٢ طُوي على ٠ وبيع منه ٢: الفكُّ كان يكتب ٠ و٢ فرجع المبيعُ للرفّ، والآن −٢ و٢ والمجموعُ قبل الفكّ هو بعده. -- +0253
        update company_sections set pooled_stock = round(coalesce(pooled_stock, 0) - v_moved, 3) -- +0253
         where id = (v_sec->>'folded_into')::uuid and clinic_id = v_clinic;
        update company_sections set pooled_stock = v_moved
         where id = v_sid and clinic_id = v_clinic;
      end if;
      update products set section_id = v_sid
       where clinic_id = v_clinic and section_id = (v_sec->>'folded_into')::uuid
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
      delete from company_sections_trash
       where id = v_sid and clinic_id = v_clinic
         and exists (select 1 from company_sections where id = v_sid);
    elsif v_t.merged_into is not null then
      update company_sections set company_id = p_id
       where id = v_sid and clinic_id = v_clinic and company_id = v_t.merged_into;
    else
      if not exists (select 1 from company_sections where id = v_sid) then
        insert into company_sections
        select * from jsonb_populate_record(null::company_sections,
          (select row from company_sections_trash where id = v_sid and clinic_id = v_clinic))
        on conflict (id) do nothing;
      end if;
      update products set section_id = v_sid
       where clinic_id = v_clinic and section_id is null
         and id = any (coalesce((select array_agg((x)::uuid) from jsonb_array_elements_text(v_sec->'product_ids') x), '{}'));
      delete from company_sections_trash where id = v_sid and clinic_id = v_clinic;
    end if;
  end loop;

  delete from company_merges where from_id = p_id and clinic_id = v_clinic;
  delete from companies_trash where id = p_id and clinic_id = v_clinic;
  return v_row;
end $$;

revoke all on function public.restore_company(uuid) from public, anon;
grant execute on function public.restore_company(uuid) to authenticated;
comment on function public.restore_company(uuid) is
  'يعيد شركةً من السلّة بنفس معرّفها (0197، ووسّعها 0198): ما انتقل يعود بشرط أنه ما زال حيث تركه الطيّ، وما محاه التتالي (المطالباتُ والأصنافُ بحوضها) يُعاد إنشاؤه من الصورة. ويرفض الفكَّ ووجهتُه محذوفة (0203). ومنذ 0253 يطرح من حوض الباقي ما أضافه الطيُّ بلا أرضيّة: ما بيع من الحوض المدموج أو طُوي إليه عجزاً يبقى على الباقي ولو سالباً، والمجموعُ قبل الفكّ هو بعده.';

-- ── ١٠) فكُّ طيّ الصنف — نصُّ 0197 حرفاً، والطرحُ نفسُه بلا أرضيّة ────────────────────────────────────────
create or replace function public.restore_company_section(p_id uuid)
returns company_sections
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_t      company_sections_trash;
  v_row    company_sections;
begin
  if v_clinic is null then raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.'; end if;
  if v_role not in ('manager', 'veterinarian') then
    raise exception 'forbidden' using hint = 'الاسترجاعُ للمدير والطبيب.';
  end if;
  select * into v_t from company_sections_trash where id = p_id and clinic_id = v_clinic;
  if not found then raise exception 'not_in_trash' using hint = 'ما لكينا صورةً لهذا الصنف.'; end if;
  if exists (select 1 from company_sections where id = p_id) then
    raise exception 'already_there' using hint = 'الصنفُ موجودٌ أصلاً.';
  end if;
  -- شركتُه لازم تكون قائمة — وإلا فالمفتاحُ الأجنبيُّ يرمي بلا رسالةٍ مفهومة.
  if v_t.company_id is not null and not exists (select 1 from companies where id = v_t.company_id and clinic_id = v_clinic) then
    raise exception 'no_company' using hint = 'شركةُ هذا الصنف محذوفة — استرجعها أوّلاً.';
  end if;
  insert into company_sections select * from jsonb_populate_record(null::company_sections, v_t.row);
  select * into v_row from company_sections where id = p_id;
  if v_t.folded_into is not null and v_t.pooled_moved <> 0 then
-- -0253     update company_sections set pooled_stock = round(greatest(0, coalesce(pooled_stock, 0) - v_t.pooled_moved), 3)
    -- 0253: بلا أرضيّة كفكّ الشركة (٩) — الباقي ناقصَ ما أُضيف إليه بالضبط ولو سالباً، والمجموعُ قبل الفكّ هو بعده. -- +0253
    update company_sections set pooled_stock = round(coalesce(pooled_stock, 0) - v_t.pooled_moved, 3) -- +0253
     where id = v_t.folded_into and clinic_id = v_clinic;
  end if;
  update products set section_id = p_id
   where id = any (v_t.product_ids) and clinic_id = v_clinic
     and (v_t.folded_into is null or section_id = v_t.folded_into);
  delete from company_sections_trash where id = p_id and clinic_id = v_clinic;
  return v_row;
end $$;

revoke all on function public.restore_company_section(uuid) from public, anon;
grant execute on function public.restore_company_section(uuid) to authenticated;
comment on function public.restore_company_section(uuid) is
  'يعيد صنفاً من السلّة بنفس معرّفه (0197)، وإن كان مطويّاً بصنفٍ آخر طرح من حوض الباقي ما أُضيف إليه وردّ منتجاتِه. ومنذ 0253 بلا أرضيّة: الباقي ناقصَ ما أُضيف بالضبط ولو سالباً.';

reset lock_timeout;
