# سلامةُ المخزن — تدقيقُ ٢٢/١١ وما بعده

> **لمن**: كلُّ جلسةٍ تلمس المخزن. اقرأ `CLAUDE.md` و`memory/state.md` قبلها.
> **الشكوى** (المالك، ٢٢/١١): «الأعداد تتغيّر — يا إمّا ما يلكون المنتج مع أنهم متأكّدين ضايفيه، أو العدد أقلّ أو أكثر من اللازم، أو يلكوه مخلص».
> **الطريقة**: عشرةُ مدقّقين بالتوازي على الأجسام الحيّة (بيع، عكس، شراء، جرد وتلف، رؤية المادّة، طابور وأجهزة، وحدات وتعبئة،
> دفتر وتتبّع، كتّابٌ آخرون، تزامن)، ثمّ لكلّ بندٍ مُتحقّقان مستقلّان يحاولان نفيه: تتبّعُ الشِفرة، وإمكانُ الوصول من الواجهة.
> كثيرٌ منها أُعيد إنتاجُه على PGlite بنصوص الدوالّ الحيّة. ٤١ بنداً بعد الدمج: ٣٨ مؤكَّداً، واثنان كامنان (F18، F39)،
> وواحدٌ منفيّ (F40)؛ ثمّ جولةُ ثغراتٍ بـ٢٥ بنداً (§٣ب).

---

## ١) الجذورُ الخمسة — لماذا «الأرقام تتغيّر»

| الجذر | الشكلُ عند الطبيب | البنود |
|---|---|---|
| **كتابةٌ تُعاد بعد جوابٍ ضائع** — نتُّ الموبايل يُسقط الجوابَ بعد أن ثبت الطلب، والشاشةُ تقول «حاول من جديد» | الرصيدُ **أكثر** (شراءٌ ودفعةٌ ومرتجعٌ مرّتين) أو **أقلّ/أكثر** (سلّةٌ عُدّلت بين المحاولتين) | F01 F06 F13 F14 |
| **شاشةٌ بائتة تُقرأ حقيقة** — المخزنُ المفتوح من الصبح، وقائمةٌ يُخفيها فلترٌ أو سقف | «**ما نلكاها**» فتُدخل توأماً، و«**مخلص**» عن مادّةٍ اشتُريت | F22 F27 F28 F31 F33 |
| **رقمٌ بلا مصدرٍ يُرى** — لا شيءَ سجّل لماذا تغيّر الرصيد؛ الحركاتُ تخمّن بفاتورةٍ «خلال ٤ ثوانٍ»، والطبيبُ لا يقرؤها أصلاً | «**تغيّر وحده**» — والسببُ الحقيقيّ (مرتجع، ترجيع، دمج، جرد، تعديل يدوي) يظهر «تعديل يدوي أو جرد» | F19 F23 F29 F36 F37 F38 F39 |
| **معرّفٌ قديمٌ لمادّةٍ دُمجت أو حُذفت** — كتّابٌ لا يتبعون الدمج | عجزٌ بلا سبب: راجعٌ لا يرجع، جرعةٌ لا تُخصم، جردٌ يُبطَل | F05 F08 F09 F10 F11 F17 F20 F30 |
| **تقريبُ المفرد لثلاث منازل بكلّ سطر** — حبّةٌ من علبة ٦ = ٠٫١٦٧ | «**رصيده صفر**» والحبّةُ بالرفّ، أو حبّاتٌ وهميّة؛ واقتراحُ الطلبية يعدّ الحبّةَ علبة | F04 F32 F33 F34 F35 |

---

## ٢) ما أُصلح (فرع `claude/inventory-system-improvement-636e97`)

**الخادم**
- **0287** — `purchase_record_once` / `lot_add_once` / `return_invoice_items_once`: مرجعُ محاولة (rpc_refs، 0136) يُحجز قبل أيّ كتابة،
  وبصمةُ الطلب: الإعادةُ بنفس الطلب تُرجع الأولى، وطلبٌ تغيّر بعد أن ثبتت يُرفض باسمه (`*_ref_changed`). تلفّ الدوالَّ الحيّة ولا تمسّ أجسامَها.
- **0287** — **دفترُ الرصيد `stock_ledger`**: محفّزٌ بعد كلّ إدراجٍ وتعديلٍ وحذفٍ على products (والحوض) يكتب الفرقَ وقبله وبعده ومَن
  و**الدالّةَ الكاتبة من مكدّس النداء** (`pg_context`؛ أوّلُ اسمٍ معروف من الخارج، وdirect للكتابة المباشرة). دائمٌ بلا كنس، ونقطةُ بدءٍ
  لكلّ مادّة ساعةَ التطبيق، و`verify_stock_ledger()` يقول أيَّ كتابةٍ مرّت بلا المحفّز. يقرؤه المديرُ ومن يملك «إدارة المخزون».
- **0288** — `credit_stock` يتبع الدمجَ ويرفض المحذوف؛ الدمجُ يأخذ ربطَ «سعر الجرعة» والجرعاتِ المعلَّقة والجردَ المعلَّق؛ ترجيعُ فاتورةِ
  جرعاتٍ أو حذفُها يُرجعها معلَّقة؛ `product_sales_rate` بوحدة الرصيد بلا المرجَعة.

**الواجهة**
- «حفظ» فاتورة الشراء: قفلٌ متزامن (لا ضغطتين أثناء سؤال الأسعار)، ومرجعٌ لكلّ فاتورةٍ مفتوحة، وشركةٌ وُلدت لها لا تُحذف عن فشلٍ مجهول المصير.
- «أضف دفعة» و«المرتجع» بمرجعٍ لكلّ نموذج.
- السلّةُ تُقفل والدفعةُ معلَّقةُ المصير (الإعادةُ تُرجع الفاتورةَ الأولى كما هي — تعديلٌ بينهما كان يُطبع ولا يُخصم).
- المخزنُ يتحدّث وحده (المنتجات والشركات)، وورقةُ الجرد تُجلب من الخادم لحظةَ الضغط.
- «لقينا N مادة بس مخفية بشريحة …» بدل «لا نتائج مطابقة».
- بحثُ الجرد: الرمزُ المطابقُ أوّلاً، و«وN غيرها»، وما وُجد ولا يُعدّ هنا يُرى بسببه.
- المفرداتُ الكاملة بتسامح التقريب (`wholeSubUnits`): الحبّةُ الأخيرة لا تُرفض، والقسمةُ التامّة تبقى صارمة.
- الرصيدُ الكسريّ يُعرض بكسوره (٠٫٤ لا «٠»)، واللوحةُ لا تعدّ المجمَّعة «نفدت».
- «حركات المادة» من الدفتر بنوعها الحقيقيّ ومَن وفاتورتها وصفحاتٍ؛ والقديمُ قبل الدفتر بطلبٍ وبعلامة «تقديري»؛ والفشلُ يُقال؛
  ومادّةٌ بلا صفٍّ بعد تقول «ما تغيّر رصيدها من وقت ما بدأ السجل الدقيق».

**ما أمسكته المراجعةُ قبل الدفع** (مراجعةٌ ذاتية + الحزمة الكاملة)
- `isRefChanged` كانت لا تطابق أبداً: الخادمُ يرفع `*_ref_changed` بالرمز P0001 والاسمُ بالرسالة، والفحصُ قرأ الرمزَ وحده —
  فالشاشةُ لا تُغلق ولا تقرأ ما ثبت. صُحّح، وfreshness-test يفحصه بشكل خطأ PostgREST الحقيقيّ (والقديمُ يسقط فيه).
- رفضُ الدمج حين على المادّتين ما ينتظر يسمّي ما على التوأم بنوعه («سند تلف» / «جرد» / كلاهما) لا «جرد أو سند» عامّةً.
- محفّزُ الدفتر لا يفتح نقطةَ حفظٍ إلا لتغييرِ رصيدٍ حقيقيّ (رفعُ أسعارٍ على مئات المواد يمرّ بلا كلفة).
- فحوصٌ قديمة بقسم 0254 كانت تثبّت العيب نفسَه (الجردُ المعلَّق يُفرَغ بالدمج فتبطله الموافقة) — حُدّثت بسببها، والجديدُ يثبت
  أن عجزَ رفّ التوأم يبقى عجزاً بعد الدمج.
- فحوصٌ جديدة بسلوكها مع طفراتٍ تُمسك: بحثُ الجرد (waste-tab-test، وجولةٌ على الشِفرة القديمة يسقط فيها كلُّ جديد)، وشاشةُ
  الدفتر (avg-cost-note-test: النوع، مَن، الصفحات، الممنوع، الفشلُ والإعادة، الفارغ).

**ومراجعةٌ عدائيّة مستقلّة للتغيير كلِّه** (أربعةُ مراجعين، لكلٍّ مُفنِّدٌ مستقلّ): ١٧ بنداً، أُكّد أغلبُها وصُلّح قبل الدفع:
- **قفلُ السلّة كان ناقصاً**: كاتباتٌ مباشرة لا تمرّ من bump (علبة ↔ مفرد، إعادةُ الوزن من السطر، نسبةُ الراجع، سعرُ ما قبل الرفع،
  «مسح»، سطرُ «دواء»، ورقةُ المستهلكات، وتسعيرُ الراجع حين يصل) — كلُّها مقفولة الآن، والقفلُ يقرأ المرجعَ من الـref (إضافةٌ بدأت قبل
  الفشل كانت تكمل داخله). والإرجاعُ الخالص المرفوضُ رفضاً حاسماً يحرّر مرجعَه ويقول تلميحَ الخادم (كان يُقفل على ما لم يُسجَّل).
- **الجلبُ الخلفيّ للمنتجات والشركات** كان يقتلع التبويبَ بنافذته المفتوحة عند فشلٍ واحد، ويعيد تعبئةَ «تعديل شركة» و«تعديل / جرد»
  فوق ما كُتب: الآن شريطُ العمر بدل شاشة الفشل، ولا جلبَ تحت نافذةٍ مفتوحة، والنافذتان تُعبّآن بالمعرّف.
- **تسامحُ المفرد** كان يصنع حبّةً ليست بالرفّ حين تقرّب الخطوةُ للأسفل (علبتا ٣٠) — صار للتقريب للأعلى وحده.
- **«قبل السجل الدقيق»** للمدير وحده (سجلُّ التدقيق له)، ونافذةُ الـ٢٠٠ تُقال بدل «ماكو حركات».
- **الدمجُ والجرعات**: المختومةُ تتبع الدمجَ أيضاً (ترجيعُها بعده كان يُرجعها باسم الميّت فتُباع بلا خصم)، وقاعدةُ المفرد (أصلٌ بلا مفرد
  لا يأخذ جرعةً بالمفرد)، وأقفالُ الجرعات بلا انتظار (بيعُ جرعةٍ جارٍ يرفض الدمجَ باسمه بدل قفلٍ متشابك).
- **الدفتر**: القفلُ المتشابكُ لا يُبلع (كانت الكتابةُ تثبت بلا صفّها)، وverify يرى رصيداً بلا صفٍّ أو قبل أوّل صفّ، والتراجعُ بترتيبٍ يعمل،
  وcredit_stock يقفل صفَّه ويسمع تحديثَه. وحفظُ الشراء «جارٍ» من أوّل الضغطة (كان يُغلق النموذجُ وسؤالُ الأسعار بالطريق).

---

## ٣) مؤكَّدٌ وباقٍ — بالترتيب المقترح

| # | البند | لماذا بعدُ | الحجم |
|---|---|---|---|
| F04 | **الجذرُ الخادميّ لتقريب المفرد**: خصمُ المفرد بالضبط عبر `_stock_post` (المرحَّلُ بتسع منازل) وتخزينُه على السطر للعكس | يمسّ retail_checkout وكلَّ عاكس — موجةٌ وحدها بفحص تطابق | كبير |
| F02 F03 | فاتورةُ التبديل (سطرُ «راجع» سالب): التعديلُ يُسقطه، والإرجاعُ الكامل يعكسه — القطعةُ الراجعة تُخصم ثانيةً | إعادةُ تعريف edit_invoice_lines_unguarded وreturn_invoice_items | متوسّط |
| F25 | الشراءُ يطابق صفوفَ مخزن الحقل (`farm_id`) — الرصيدُ ينزل حيث لا تراه العيادة | record/update_purchase (جسمان كبيران) | متوسّط |
| F09 | عكسُ بيعٍ ومادّتُه بالمحذوفات لا يردّ شيئاً، والاسترجاعُ يُرجع الرصيدَ القديم | كلُّ العاكسات: «اتبع سلّة المحذوفات» كـ_stock_post | متوسّط |
| F41 | تعديلُ فاتورةٍ/طلبٍ من لقطةٍ قديمة يُلغي مرتجعاً حصل بعد الفتح | بصمةُ «ما رآه المحرّر» على edit_invoice_lines | صغير |
| F26 | «رتّب المخزن» يطوي أصنافاً مختلفةً بنفس الاسم (باركوداتٌ مختلفة، مجموعة) بلا معاينة | inventory_tidy_uncat + معاينة | متوسّط |
| F15 | تعديلُ فاتورة شراءٍ يعيد سطرَ مادّةٍ محذوفة رصيداً جديداً | update_purchase بهويّة السطر | متوسّط |
| F21 | عدُّ الدفعات المطابقُ بالمجموع يُحفظ «مطابق» وتضيع تصحيحاتُ الدفعات | stock_count_submit | صغير |
| F24 | «تعديل / جرد» حوضِ الصنف بلا مقارنة (والمجمَّعُ غيرُ مستعمل اليوم) | مقارنةٌ بالمرئيّ | صغير |
| F28 | مادّةٌ أُضيفت بلا نت تختفي من القائمة حتى تُرفع (وقد تبقى بالرفّ) | دمجُ الطابور بالقائمة + تنبيهٌ عند الخروج | متوسّط |
| F08 F17 F30 F12 F07 | معرّفاتٌ قديمة بالمتجر والشراء، وسلاسلُ استرجاعٍ ودمج | نفسُ «المحلِّل الواحد» | صغار |
| F34 F35 | راجعُ المفرد بالعلبة فقط، ومفردُ سطرٍ قديمٍ بعد تغيّر عدد العلبة | واجهةُ البيع | صغار |
| F18 | **كامن**: تعديلُ فاتورة شراءٍ قديمة (ولو لسعر مادّةٍ أخرى) يطفئ «مجمّع» عن مادّةٍ جُمّعت بعدها، فتُعرض «نفد» والكاشيرُ يبيع من الحوض | الوصولُ نُفي (لا فرقَ بالرصيد)؛ update_purchase يُبقي pooled كما هو | صغير |
| قاعدةُ تشغيل | **لا تُعِد 0255 وحدها بعد 0288**: ترجع الدمجَ لنصّها بصمت، وفحصُ التوصيل لا يراها لأن 0255 تعيد تعريفَه هو أيضاً (المراجعة نفت «سجّلها بالفحص» لهذا) — أعِد 0288 بعدها | قاعدة، لا شِفرة | — |
| مراجعة | المرآةُ التجريبية (repoDemo) لا تعكس سلوكَ 0288 (الراجعُ بعد الدمج، إرجاعُ الجرعات بالترجيع، نقلُ الجرد بالدمج) | عياداتُ التجربة وحدها | متوسّط |
| مراجعة | قفلُ السلّة يغطّي السطور؛ الخصمُ وطريقةُ الدفع والدفعُ معلَّق تبقى قابلةً للتعديل (الإيصالُ يأخذ المجموعَ من الخادم فلا يكذب، لكنّ التعديلَ لا يسري) | يُقال بجملة أو يُقفل | صغير |

ونُفي **F40** (استرجاعُ قسمٍ طُوي هدفُه بعد طيّه): الثغرةُ بالشِفرة ولا شاشةَ تبلغها — `merge_company_sections` بلا نداءٍ من الواجهة، و`merge_companies` يحذف الشركةَ التي يتبعها القسم.

### ٣ب) الموجةُ التالية — جولةُ الثغرات (ناقدُ اكتمالٍ ثمّ خمسةُ مدقّقين على ما لم يُغطَّ، ولكلّ بندٍ مُتحقّقان)

| # | البند | التحقّق |
|---|---|---|
| G01 | **تبويبُ «تطعيم» بالكاشير يبيع اللقاحَ المخزَّن سطراً بلا مادّة — لا خصمَ أبداً**: الرصيدُ أكثرُ من الثلاجة، والجردُ يكتبها «عجزاً» | مؤكَّد (عالٍ) |
| G02 | «دواء» بالكاشير يتجاهل ربطَ الدواء بالمادّة (الإعدادات، 0269) — الجرعةُ لا تُخصم بأيّ مكان | مؤكَّد |
| G03 | دواءٌ مخزَّن باسمٍ غير اسم الكتالوج يُباع بلا مادّة (المنتقي يقرأ تصنيفَ «دواء» ورصيداً موجباً وحدهما، والشراءُ يترك التصنيفَ فارغاً) | مؤكَّد |
| G04 | الجرعاتُ المعطاة المربوطة لا تخرج من الرصيد حتى تُباع؛ جردٌ بينهما يجعل البيعَ يخصمها مرّتين | مؤكَّد |
| G05 | مادّةُ جرعةٍ صارت «الدولار وحده» توقف خصمَ جرعاتها بصمت | مؤكَّد (منخفض) |
| G06 | **لا عمليةَ «رجّعتها للشركة»**: كلُّ حيلةٍ (تعديلُ الشراء، سطرٌ سالب، جرد) تُفسد دفتراً آخر | مؤكَّد (عالٍ) |
| G07 | سطرُ شراءٍ سالب (مرتجعٌ للشركة) يُقبل و**يزيد** الرصيد | مؤكَّد (عالٍ) |
| G08 | تعديلُ الشراء الأصليّ لتسجيل مرتجع يقصّ المدفوعَ بصمت ويرفع متوسّطَ الباقي | مؤكَّد |
| G09 | «كشف الإرجاع» وقائمةُ الواتساب وقيمةُ «قرب الانتهاء» على مستوى المادّة لا الوجبة | مؤكَّد |
| G10 | البونصُ («١٠+٢») بلا خانة — كلُّ طرقه تكتب العددَ الصحيح؛ ينقصه مفهومٌ لا رقم | منفيّ |
| G11 | **تبديلُ وحدة المادّة بالنموذج** (بالوزن، المفرد، عدد العلبة) يعيد تسميةَ الرصيد والمتوسّط والتاريخ بلا تحويلٍ ولا تنبيه | مؤكَّد (عالٍ) |
| G12 | «تعديل المجموعة كاملة» يطفئ المفردَ لكلّ أعضائها بصمت | مؤكَّد (عالٍ) |
| G13 | إطفاءُ المفرد يعطّل روابطَ الجرعات بالمفرد بصمت | مؤكَّد |
| G14 | دمجُ توأمين بوحدتين مختلفتين يجمع كيلواتٍ على علب ويخلط كلفتيهما | مؤكَّد |
| G15 | **حروفُ اللوحات الأخرى (ی ک گ ڤ پ چ ە ھ، وZWNJ) لا يطبّعها أيُّ طرف**: مادّةٌ كُتبت بلوحةٍ فارسيّة أو كرديّة تُقرأ «ما موجودة» من لوحةٍ عربيّة | مؤكَّد (عالٍ) |
| G16 | الشراءُ يطابق السطرَ بلا باركود بالاسم بتطبيعٍ أضعف من البحث: سطرٌ بلوحةٍ أخرى يولد مادّةً توأماً | مؤكَّد (عالٍ) |
| G17 | تبويبُ «الأدوية» يبيع دواءً مخزَّناً بلا مادّة حين يُكتب بالحروف الأخرى (لا خصمَ وكلفةٌ صفر) | مؤكَّد |
| G18 | محفّزُ حساب الجرعات يطابق الدواءَ بـsearch_norm: جرعةٌ كُتبت بالحروف الأخرى لا تُحسب ولا تُخصم | مؤكَّد |
| G19 | كلُّ كاشفِ توائم (شارةُ الجرد، فحصُ المخزن، زرُّ الدمج، استعلامُ §٥ #٦) أعمى عن التوائم بالحروف الأخرى | مؤكَّد |
| G20 | الشركاتُ والأصنافُ تنشقّ بالحروف الأخرى (الشركةُ نفسُها مرّتين) | كامن (منخفض) |
| G21 | **المحذوفةُ لا يلقاها أيُّ باحث**: الماسحُ يقول «أضفها» والبحثُ «لا نتائج» بلا إشارةٍ للمحذوفات، فتولد توأماً؛ والاسترجاعُ بعده يعدّها مرّتين — وبلا استرجاعٍ «رصيده صفر» والعلبُ بالرفّ | مؤكَّد (عالٍ) |
| G22 | الدمجُ يمسح اسمَ التوأم: البحثُ بالاسم القديم «لا نتائج»، والشراءُ بالاسم بلا باركود يعيد التوأمَ فيرجع الانشقاقُ الذي صلّحه الدمج | مؤكَّد |
| G23 | الدمجُ بضغطةِ صفٍّ خلف `window.confirm` (النمطُ الممنوع بعد حادثة الحذف) ويقول «ما ينرجع» والمحذوفاتُ ترجعه — إرجاعاً جزئيّاً (المتوسّطُ والوصفاتُ وما بِيع بينهما لا يرجع)، فالنصُّ الجديد لا يَعِد بإرجاعٍ كامل | مؤكَّد (الوصولُ منخفض) |
| G24 | خاناتُ الكاشير تقول «ما عاد موجود» بلا اسم عن مادّةٍ دُمجت (بدل أن تتبع أصلَها) أو أُضيفت للتوّ من جهازٍ آخر — و«شيله» ثمّ «احفظ» يُسقطها من الخانة للعيادة كلّها | مؤكَّد (منخفض) |
| G25 | ستّةُ منتقين ثانويّين بالمطابق القديم (سقفٌ صامت، لا تقديمَ للرمز المطابق): بـ«سعر الجرعة» رمزُ رفٍّ من رقمين يُخفي المادّةَ فيُربط شبيهٌ أو لا شيء | مؤكَّد (منخفض) |

المجموع: ٢٣ مؤكَّداً، وكامنٌ واحد (G20)، ومنفيٌّ واحد (G10). الترتيبُ المقترح: ما يطابق الشكوى حرفاً أوّلاً — «ما نلكاها» (G21، G15، G16،
G22) و«العدد أكثر» (G01، G04) — ثمّ الوحدة (G11، G12) ونافذةُ الدمج (G23)، ثمّ مرتجعُ الشركة (G06–G08) بقرارٍ منك على شكله.
وتطبيعُ الحروف (G15) يمرّ بالطرفين معاً كدرس `searchable`/`search_norm` (§٣ بـCLAUDE.md): بالواجهة والقاعدة بدالّةٍ واحدة لكلٍّ ومرآةٍ
مفحوصة، وإلا صار تطبيعُ طرفٍ واحد أسوأ من لا تطبيع. و`search_norm` داخلةٌ بثلاثة فهارس فريدة (0229، 0233، 0239) وبمفتاحٍ مخزَّن (0280):
تغييرُها يعيد بناءَها، واسمان كانا مختلفَين وصارا متساويَين يُفشلان الفهرسَ الفريد — يُعدّان بالإنتاج قبل الهجرة.

---

## ٤) قراراتٌ للمالك

1. **تعديلُ الرصيد من نموذج المادّة** (F23): صار مرئياً بالدفتر باسم فاعله («تعديل يدوي»). يبقى مباشراً، أم يمرّ بموافقة المدير
   كالجرد (قرارُك ٢٦/٩: «لا فرقَ يمسّ الرصيد بلا موافقة»)؟
2. **باركودُ العلبة الممسوح بالشراء** على مادّةٍ لها رمزٌ آخر (F16): يُضاف رمزاً إضافياً تلقائياً (فلا يقول الكاشيرُ «ما ينعرف» ولا يُدخل توأم)؟
   — نافذةُ الربط بالكاشير أُلغيت بقرارك؛ هذا ربطٌ صريحٌ من شخصٍ يحمل العلبة.
3. **من يقرأ «حركات المادة»**: صار المديرُ ومن يملك «إدارة المخزون» (الطبيبُ افتراضاً) — الطبيبُ هو من يعدّ ويشكو.

---

## ٥) قياسٌ بالإنتاج (قراءةٌ فقط — SQL Editor)

كلُّ صفوف المعاملة الواحدة بسجلّ التدقيق تحمل **نفس** `created_at` (= now() للمعاملة). فما كُتب مع تغيير الرصيد بنفس اللحظة يقول ما الذي غيّره.
قبل 0287 هذا أدقُّ ما يُقاس؛ وبعدها `stock_ledger` يقولها مباشرةً.

**ابدأ بـ٠ (الملخّص)**: سطرٌ لكلّ قياسٍ ليس صفراً لكلّ عيادة، بمعناه بالعربي. قِيس على PGlite بقالبٍ لكلّ قياس (حالةٌ تُعدّ وحالاتٌ لا تُعدّ)،
ثمّ بمراجعةٍ عدائيّة بثلاث عدسات أمسكت ٢٦ عيباً بالقياس نفسِه وصُلّحت كلُّها (٢٣/١١). أثقلُها:
- **دفعةٌ بنفس لحظة التعديل ليست دائماً «أضف دفعة»**: `products_lots_sync` (0217) يكتب دفعةَ `opening`/`adjust` بالمعاملة نفسِها
  حين يُرفع رصيدٌ من الصفر أو تحته أو وكلُّ دفعاته منتهية — فاستثناءُ أيِّ دفعةٍ بنفس اللحظة كان يُخفي **التعديلَ اليدويّ الذي يهمّ**
  («رصيده صفر والحبّة بالرفّ» ⇒ «زيد رصيده»). الاستثناءُ لـ`source = 'added'` وحدها.
- **الاسترجاعُ يحذف صفَّ المحذوفات**: الحذفُ الذي رجع لا يُرى بـ`products_trash` — يُقرأ من التدقيق (DELETE ومادّتُه حيّة).
- **اسمٌ يطابق اليوم لم يكن يطابق ساعةَ البيع**: سطرُ «دواء» بِيع قبل أن تُضاف مادّتُه ليس «انباع وما نقص» — المادّةُ أقدمُ من السطر.
- **`service_id` لا يُقرأ قبل 0252**: سطرُ خدمةٍ اسمُها اسمُ مادّة يُعدّ وحدَه (`unlinked_svc_named_90d`) لا مع التسريب.
- **النسخةُ الزائدة تُعدّ مرّة**: ثلاثُ حفظاتٍ نسختان زائدتان، لا ثلاثةُ أزواج؛ ودفعتان بتاريخَي انتهاءٍ مختلفين استلامٌ صحيح.

```sql
-- ٠) الملخّص: لكلّ عيادة ما حصل فعلاً من أسباب «الأرقام تتغيّر» وكم مرّة. قراءةٌ فقط (SQL Editor) — لا يكتب شيئاً.
--    سطرٌ لكلّ قياسٍ ليس صفراً؛ وأوّلُ سطرين لكلّ عيادة حجمُها (عددُ الموادّ وتغييراتُ الرصيد) للمقارنة. clinic = أوّلُ ٨ محارف من معرّفها.
--    قِيس على PGlite بقالبٍ لكلّ قياس (حالةٌ تُعدّ وحالاتٌ لا تُعدّ) ثمّ بمراجعةٍ عدائيّة بثلاث عدسات (٢٣/١١) صُلّح كلُّ ما أمسكته.
with
fold as (              -- حروفُ اللوحات الأخرى ← العربية، والمحارفُ الخفيّة تُحذف (G15): ی ێ ک ڪ گ ھ ە پ چ ڤ ژ ۆ ڵ ڕ
  select U&'\06CC\06CE\06A9\06AA\06AF\06BE\06D5\067E\0686\06A4\0698\06C6\06B5\0695\200B\200C\200D\200E\200F\2060\FEFF\061C\00AD\202A\202B\202C\202D\202E\2066\2067\2068\2069' src,
         U&'\064A\064A\0643\0643\0643\0647\0647\0628\062C\0641\0632\0648\0644\0631' dst),
clin as (select clinic_id, count(*) items from products where farm_id is null group by 1),
-- ── الأعراض: ما يراه الطبيب ─────────────────────────────────────────────────────────────
neg_now as (           -- انباعت أكثر مما بالنظام (البيعُ تحت الصفر مسموحٌ بالخادم منذ 0253)
  select clinic_id, count(*) n from products
   where farm_id is null and not coalesce(pooled, false) and stock < 0 group by 1),
stock_ev as (          -- تغييراتُ الرصيد بالتدقيق آخر ٣٠ يوماً (المعرّفُ يُحوَّل بحذر: سطرٌ شاذّ لا يُسقط القياس)
  select a.clinic_id, a.created_at, a.details->'__changed'->'stock' st,
         case when a.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then a.entity_id::uuid end pid
    from audit_log a
   where a.entity = 'products' and a.action = 'UPDATE' and a.details->'__changed' ? 'stock'
     and a.created_at > now() - interval '30 days'),
changes as (select clinic_id, count(*) n from stock_ev group by 1),
went_neg as (
  select clinic_id, count(*) n from stock_ev
   where jsonb_typeof(st->0) = 'number' and jsonb_typeof(st->1) = 'number'
     and (st->>0)::numeric >= 0 and (st->>1)::numeric < 0 group by 1),
pill as (              -- رصيدُ المفرد بكسور حبّة: تقريبُ كلّ سطرٍ لثلاث منازل (F04) — الخزنُ نفسُه يسمح بـ٠٫٠٠٠٥ علبة
  select clinic_id, count(*) n,
         count(*) filter (where stock > 0 and stock * units_per_box < 1 - 0.0005 * units_per_box) n_lt1
    from products
   where farm_id is null and not coalesce(pooled, false) and has_sub_unit and not sold_by_weight and units_per_box >= 2
     and abs(stock * units_per_box - round(stock * units_per_box)) > 0.0005 * units_per_box + 0.000001
   group by 1),
counted as (           -- الجردُ آخر ٦٠ يوماً: ما لقاه العادُّ مقابلَ النظام (بلا سندات التلف)
  select clinic_id, count(*) filter (where counted_qty < system_qty) short, count(*) filter (where counted_qty > system_qty) over_
    from stock_counts
   where coalesce(source, 'count') = 'count' and status <> 'void' and counted_at > now() - interval '60 days'
   group by 1),
-- ── الجذر ١: كتابةٌ تُعاد بعد جوابٍ ضائع (0287 يمنعها) — كلُّ نسخةٍ زائدة تُعدّ مرّةً واحدة ───────────
psig as (              -- ما وضعته الفاتورةُ على الرفّ (الإعادةُ ترسل السطورَ نفسَها)
  select purchase_id, string_agg(search_norm(name) || 'x' || qty::text, ',' order by search_norm(name), qty) sig
    from purchase_items group by 1),
buy_x2 as (            -- الشركةُ بمعرّفها أو باسمها المحفوظ (الفشلُ كان يحذف الشركةَ الجديدة فيصير معرّفُ الأولى فارغاً)
  select a.clinic_id, count(*) n
    from purchases a
   where exists (select 1 from purchases b
                  where b.clinic_id = a.clinic_id and b.id <> a.id
                    and b.created_at < a.created_at and a.created_at - b.created_at < interval '10 minutes'
                    and b.total = a.total and b.item_count = a.item_count
                    and b.reference is not distinct from a.reference
                    and (b.company_id = a.company_id
                         or search_norm(coalesce(b.company_name, b.supplier_name, '')) = search_norm(coalesce(a.company_name, a.supplier_name, '')))
                    and (select s.sig from psig s where s.purchase_id = b.id) is not distinct from (select s.sig from psig s where s.purchase_id = a.id))
   group by 1),
lot_x2 as (            -- الإعادةُ ترسل التاريخَ والملاحظةَ نفسَهما؛ دفعتان بتاريخين مختلفين استلامٌ صحيح
  select a.clinic_id, count(*) n
    from product_lots a
   where a.source = 'added'
     and exists (select 1 from product_lots b
                  where b.clinic_id = a.clinic_id and b.product_id = a.product_id and b.id <> a.id
                    and b.source = 'added' and b.received_qty = a.received_qty
                    and b.expiry_date is not distinct from a.expiry_date and b.note is not distinct from a.note
                    and b.created_at < a.created_at and a.created_at - b.created_at < interval '2 minutes')
   group by 1),
ret_tx as (            -- مرتجعٌ على فاتورة (return_invoice_items): تعديلٌ يختم «مرتجع YYYY-MM-DD: …» ويُنقص item_count
  select clinic_id, entity_id inv, created_at,
         (details->'__changed'->'item_count'->>0)::numeric - (details->'__changed'->'item_count'->>1)::numeric dq
    from audit_log
   where entity = 'invoices' and action = 'UPDATE' and created_at > now() - interval '90 days'
     and details->'__changed' ? 'notes' and details->'__changed' ? 'item_count'
     and jsonb_typeof(details->'__changed'->'item_count'->0) = 'number'
     and jsonb_typeof(details->'__changed'->'item_count'->1) = 'number'
     and (details->'__changed'->'notes'->>1) ~ U&'(^|\000A)\0645\0631\062A\062C\0639 [0-9]{4}-[0-9]{2}-[0-9]{2}: [^\000A]*$'),
ret_x2 as (
  select a.clinic_id, count(*) n from ret_tx a
   where exists (select 1 from ret_tx b where b.clinic_id = a.clinic_id and b.inv = a.inv and b.dq = a.dq
                   and b.created_at < a.created_at and a.created_at - b.created_at < interval '2 minutes')
   group by 1),
-- ── الجذر ٣: رقمٌ بلا مصدر ─────────────────────────────────────────────────────────────────
manual as (            -- معاملةٌ لم تكتب بالتدقيق غيرَ صفّ المادّة. «أضف دفعة» تُستثنى بدفعتها 'added' وحدها:
                       -- دفعاتُ 'opening'/'adjust' يكتبها lots_reconcile بالمعاملة نفسِها حين يُرفع رصيدٌ من الصفر — وهذا يدويّ
  select e.clinic_id,
         count(*) filter (where exists (select 1 from products p where p.id = e.pid)) n,
         count(*) filter (where not exists (select 1 from products p where p.id = e.pid)) n_gone
    from stock_ev e
   where not exists (select 1 from audit_log b where b.clinic_id = e.clinic_id and b.created_at = e.created_at
                      and not (b.entity = 'products' and b.action = 'UPDATE'))
     and not exists (select 1 from product_lots l where l.product_id = e.pid and l.created_at = e.created_at and l.source = 'added')
     and not exists (select 1 from products p where p.id = e.pid and p.farm_id is not null)
   group by 1),
-- ── الجذر ٤: محذوفٌ أو مدموج ───────────────────────────────────────────────────────────────
trash60 as (
  select clinic_id,
         count(*) filter (where merged_into is null) deleted,
         count(*) filter (where merged_into is null and stock > 0) deleted_stock,
         count(*) filter (where merged_into is null and stock < 0) deleted_neg,
         count(*) filter (where merged_into is not null) merged
    from products_trash where deleted_at > now() - interval '60 days' group by 1),
restored60 as (        -- الاسترجاعُ يحذف صفَّ المحذوفات؛ التدقيقُ يُبقي الحذفَ والمادّةُ عادت بمعرّفها
  select d.clinic_id, count(distinct d.entity_id) n
    from audit_log d
   where d.entity = 'products' and d.action = 'DELETE' and d.created_at > now() - interval '60 days'
     and exists (select 1 from products p
                  where p.id = case when d.entity_id ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then d.entity_id::uuid end)
   group by 1),
twins as (             -- توائمُ بالاسم كما يطبّعه البحثُ اليوم
  select clinic_id, count(*) n from (
    select clinic_id from products where farm_id is null and not coalesce(pooled, false)
     group by clinic_id, search_norm(name) having count(*) > 1) g group by 1),
live as (
  select clinic_id, id, created_at, search_norm(name) k, nullif(inv_norm_code(barcode), '') code
    from products where farm_id is null),
tr as (
  select id, clinic_id, deleted_at, merged_into, stock, search_norm(row->>'name') k,
         nullif(inv_norm_code(row->>'barcode'), '') code
    from products_trash),
readd_ids as (         -- G21: حُذفت ثمّ وُلدت مادّةٌ حيّة باسمها أو برمزها بعد الحذف
  select t.id, t.clinic_id, t.stock from tr t
    join live p on p.clinic_id = t.clinic_id and p.k = t.k and p.created_at > t.deleted_at
   where t.merged_into is null
  union
  select t.id, t.clinic_id, t.stock from tr t
    join live p on p.clinic_id = t.clinic_id and p.code = t.code and p.created_at > t.deleted_at
   where t.merged_into is null),
readded as (select clinic_id, count(*) n, count(*) filter (where stock > 0) n_stock from readd_ids group by 1),
regrown as (           -- G22: دُمجت ثمّ وُلدت مادّةٌ حيّة باسمها القديم
  select t.clinic_id, count(distinct t.id) n from tr t
    join live p on p.clinic_id = t.clinic_id and p.k = t.k and p.created_at > t.deleted_at and p.id <> t.merged_into
   where t.merged_into is not null group by 1),
merge_units as (       -- G14: دمجٌ بين وحدتين (كيلو على علب، أو عددُ علبةٍ آخر) والتوأمُ عليه رصيد — يُقارَن بوحدة الباقي اليوم
  select t.clinic_id, count(*) n
    from products_trash t join products k on k.id = t.merged_into
   where t.merged_into is not null and t.deleted_at > now() - interval '60 days' and t.stock <> 0
     and (coalesce((t.row->>'sold_by_weight')::boolean, false) <> coalesce(k.sold_by_weight, false)
          or coalesce((t.row->>'has_sub_unit')::boolean, false) <> coalesce(k.has_sub_unit, false)
          or (coalesce(k.has_sub_unit, false) and (t.row->>'units_per_box')::numeric is distinct from k.units_per_box))
   group by 1),
-- ── حروفُ اللوحات الأخرى (G15/G16) ────────────────────────────────────────────────────────────
kbd as (
  select p.clinic_id, search_norm(p.name) k, translate(search_norm(normalize(p.name, NFKC)), f.src, f.dst) kx,
         p.name ~ U&'[\06CC\06CE\06A9\06AA\06AF\06BE\06D5\067E\0686\06A4\0698\06C6\06B5\0695\200B-\200F\2060\061C\00AD\202A-\202E\2066-\2069\00A0\202F\FB50-\FDFF\FE70-\FEFF]' other
    from products p cross join fold f where p.farm_id is null and not coalesce(p.pooled, false)),
kbd_n as (select clinic_id, count(*) filter (where other) names from kbd group by 1),
kbd_tw as (            -- توائمُ لا يراها البحثُ إلا بطيّ هذه الحروف
  select clinic_id, count(*) n from (
    select clinic_id from kbd group by clinic_id, kx having count(distinct k) > 1) g group by 1),
-- ── انباع وما نقص (G01 «تطعيم»، G17 «الأدوية» بحروفٍ أخرى، G02 دواءٌ مربوط) ──────────────────────────
pk_fold as (           -- اسمُ المادّة مطويّاً، وأوّلُ ظهورٍ له (بما فيه نسخٌ سابقة بالمحذوفات)
  select p.clinic_id, translate(search_norm(normalize(p.name, NFKC)), f.src, f.dst) kx, min(p.created_at) first_at
    from products p cross join fold f where p.farm_id is null group by 1, 2),
tr_first as (
  select t.clinic_id, translate(search_norm(normalize(t.row->>'name', NFKC)), f.src, f.dst) kx,
         min((t.row->>'created_at')::timestamptz) first_at
    from products_trash t cross join fold f group by 1, 2),
svc_k as (
  select distinct s.clinic_id, translate(search_norm(normalize(s.name, NFKC)), f.src, f.dst) kx
    from clinic_services s cross join fold f),
trash_lines as (       -- سطرٌ بِيع ثمّ حُذفت مادّتُه فقد معرّفَها (on delete set null) — ليس من هذا
  select unnest(invoice_item_ids) id from products_trash where deleted_at > now() - interval '90 days'),
unlinked as (          -- سطرُ بيعٍ بلا مادّةٍ ولا خدمة، اسمُه اسمُ مادّةٍ كانت موجودةً ساعةَ البيع
  select i.clinic_id,
         count(*) filter (where s.kx is null) n,
         round(coalesce(sum(ii.qty) filter (where s.kx is null), 0), 3) qty,
         count(*) filter (where s.kx is not null) n_svc
    from invoice_items ii join invoices i on i.id = ii.invoice_id
    cross join fold f
    cross join lateral (select translate(search_norm(normalize(ii.name, NFKC)), f.src, f.dst) kx) l
    join pk_fold pk on pk.clinic_id = i.clinic_id and pk.kx = l.kx
    left join tr_first tf on tf.clinic_id = i.clinic_id and tf.kx = l.kx
    left join svc_k s on s.clinic_id = i.clinic_id and s.kx = l.kx
   where ii.product_id is null and ii.service_id is null and ii.qty > 0
     and i.created_at > now() - interval '90 days'
     and coalesce(i.status, 'paid') <> 'refunded' and coalesce(i.sale_kind, '') <> 'opening'
     and least(pk.first_at, tf.first_at) <= i.created_at
     and not exists (select 1 from trash_lines tl where tl.id = ii.id)
     -- تعديلُ الفاتورة يعيد إدراجَ سطورها بمعرّفاتٍ جديدة: سطرُ مادّةٍ حُذفت قبل التعديل ليس من هذا
     and not (ii.created_at > i.created_at + interval '1 minute'
              and exists (select 1 from tr t where t.clinic_id = i.clinic_id and t.merged_into is null
                            and t.k = search_norm(ii.name) and t.deleted_at < ii.created_at))
   group by 1),
drug_unlinked as (     -- G02: دواءٌ رُبط بمادّة بالإعدادات (0269) وبِيع من تبويب «الأدوية» سطراً بلا مادّة بعد الربط
  select i.clinic_id, count(*) n
    from invoice_items ii join invoices i on i.id = ii.invoice_id
    join (select clinic_id, search_norm(name) k, min(updated_at) since from clinic_drugs
           where product_id is not null group by 1, 2) d
      on d.clinic_id = i.clinic_id and d.k = search_norm(ii.name) and i.created_at > d.since
   where ii.product_id is null and ii.service_id is null and ii.qty > 0 and i.created_at > now() - interval '90 days'
     and coalesce(i.status, 'paid') <> 'refunded' and coalesce(i.sale_kind, '') <> 'opening'
   group by 1),
-- ── الشراء والوحدة والجرعات ─────────────────────────────────────────────────────────────────
neg_buy as (           -- G07: سطرُ شراءٍ بسعرٍ سالب يُضيف عددَه للرصيد (مرتجعٌ للشركة أو خصمٌ كُتب سطراً)
  select pi.clinic_id, count(*) n,
         count(*) filter (where not exists (select 1 from purchase_items x where x.product_id = pi.product_id and x.purchase_price > 0)) n_disc
    from purchase_items pi where pi.purchase_price < 0 and pi.qty > 0 group by 1),
flips as (             -- G11: وحدةُ مادّةٍ عليها رصيد تبدّلت بالنموذج (وزن/مفرد/عدد العلبة)، آخر ٩٠ يوماً
  select a.clinic_id,
         count(*) filter (where not (a.details->'__changed' ? 'stock')) n,
         count(*) filter (where a.details->'__changed' ? 'stock') n_restocked
    from audit_log a
   where a.entity = 'products' and a.action = 'UPDATE' and a.created_at > now() - interval '90 days'
     and a.details->'__changed' ?| array['sold_by_weight', 'has_sub_unit', 'units_per_box']
     and coalesce((a.details->'__changed'->'stock'->>0)::numeric, (a.details->>'stock')::numeric, 0) <> 0
   group by 1),
doses as (             -- G04: جرعاتٌ أُعطيت من مادّةٍ مربوطة (حيّة، أو دُمجت فرصيدُها عند الباقي)
  select d.clinic_id,
         count(*) filter (where d.status = 'pending') n,
         count(*) filter (where d.status = 'pending' and d.given_at < now() - interval '7 days') n_old,
         count(*) filter (where d.status = 'billed' and (i.id is null or i.status = 'refunded')) n_reverted
    from dose_charges d left join invoices i on i.id = d.invoice_id
   where d.product_id is not null and d.stock_qty > 0
     and (exists (select 1 from products p where p.id = d.product_id)
          or exists (select 1 from products_trash t where t.id = d.product_id and t.merged_into is not null))
   group by 1),
dose_dead as (         -- جرعاتٌ أُعطيت بعد أن ذهبت مادّتُها المربوطة للمحذوفات (قبل 0288 الربطُ لا يتبع الدمج)
  select dr.clinic_id, count(*) n
    from clinic_drugs dr
    join products_trash t on t.id = dr.product_id and t.clinic_id = dr.clinic_id
    join treatment_entries e on e.clinic_id = dr.clinic_id and coalesce(e.bill, false)
                            and e.administered_at > t.deleted_at and search_norm(e.medication) = search_norm(dr.name)
   where dr.archived_at is null
   group by 1),
s as (
  select c.clinic_id, left(c.clinic_id::text, 8) clinic, c.items,
         coalesce(ch.n, 0) changes, coalesce(nn.n, 0) neg_now, coalesce(wn.n, 0) went_neg,
         coalesce(pl.n, 0) pill, coalesce(pl.n_lt1, 0) pill_lt1, coalesce(ct.short, 0) c_short, coalesce(ct.over_, 0) c_over,
         coalesce(b2.n, 0) buy_x2, coalesce(l2.n, 0) lot_x2, coalesce(rx.n, 0) ret_x2,
         coalesce(m.n, 0) manual, coalesce(m.n_gone, 0) manual_gone,
         coalesce(t.deleted, 0) deleted, coalesce(t.deleted_stock, 0) deleted_stock, coalesce(t.deleted_neg, 0) deleted_neg,
         coalesce(t.merged, 0) merged, coalesce(rs.n, 0) restored, coalesce(tw.n, 0) twins,
         coalesce(ra.n, 0) readded, coalesce(ra.n_stock, 0) readded_stock, coalesce(rg.n, 0) regrown, coalesce(mu.n, 0) merge_units,
         coalesce(kn.names, 0) kbd_names, coalesce(kt.n, 0) kbd_twins,
         coalesce(u.n, 0) unlinked, coalesce(u.qty, 0) unlinked_qty, coalesce(u.n_svc, 0) unlinked_svc, coalesce(du.n, 0) drug_unlinked,
         coalesce(nb.n, 0) neg_buy, coalesce(nb.n_disc, 0) neg_buy_disc, coalesce(f.n, 0) flips, coalesce(f.n_restocked, 0) flips_restocked,
         coalesce(d.n, 0) doses, coalesce(d.n_old, 0) doses_old, coalesce(d.n_reverted, 0) doses_reverted, coalesce(dd.n, 0) dose_dead
    from clin c
    left join changes ch on ch.clinic_id = c.clinic_id     left join neg_now nn on nn.clinic_id = c.clinic_id
    left join went_neg wn on wn.clinic_id = c.clinic_id    left join pill pl on pl.clinic_id = c.clinic_id
    left join counted ct on ct.clinic_id = c.clinic_id     left join buy_x2 b2 on b2.clinic_id = c.clinic_id
    left join lot_x2 l2 on l2.clinic_id = c.clinic_id      left join ret_x2 rx on rx.clinic_id = c.clinic_id
    left join manual m on m.clinic_id = c.clinic_id        left join trash60 t on t.clinic_id = c.clinic_id
    left join restored60 rs on rs.clinic_id = c.clinic_id  left join twins tw on tw.clinic_id = c.clinic_id
    left join readded ra on ra.clinic_id = c.clinic_id     left join regrown rg on rg.clinic_id = c.clinic_id
    left join merge_units mu on mu.clinic_id = c.clinic_id left join kbd_n kn on kn.clinic_id = c.clinic_id
    left join kbd_tw kt on kt.clinic_id = c.clinic_id      left join unlinked u on u.clinic_id = c.clinic_id
    left join drug_unlinked du on du.clinic_id = c.clinic_id left join neg_buy nb on nb.clinic_id = c.clinic_id
    left join flips f on f.clinic_id = c.clinic_id         left join doses d on d.clinic_id = c.clinic_id
    left join dose_dead dd on dd.clinic_id = c.clinic_id)
select s.clinic, v.ord as "#", v.measure, v.value, v.meaning
  from s cross join lateral (values
    ( 1, 'items',                  s.items::numeric,           'عدد المواد'),
    ( 2, 'stock_changes_30d',      s.changes::numeric,         'تغييرات الرصيد آخر ٣٠ يوم — للمقارنة'),
    ( 3, 'neg_stock_now',          s.neg_now::numeric,         'مواد رصيدها تحت الصفر هسه: انباعت أكثر مما بالنظام'),
    ( 4, 'went_neg_30d',           s.went_neg::numeric,        'مرّات نزل فيها رصيد مادة تحت الصفر (٣٠ يوم)'),
    ( 5, 'pill_drift',             s.pill::numeric,            'مواد بالحبّة رصيدها بكسور حبّة (تقريب)'),
    ( 6, 'pill_drift_lt1',         s.pill_lt1::numeric,        'منها أقل من حبّة: «رصيده صفر» وممكن الحبّة بالرف'),
    ( 7, 'counted_short_60d',      s.c_short::numeric,         'جرد لكى أقل من النظام (٦٠ يوم)'),
    ( 8, 'counted_over_60d',       s.c_over::numeric,          'جرد لكى أكثر من النظام (٦٠ يوم)'),
    ( 9, 'buy_x2',                 s.buy_x2::numeric,          'فاتورة شراء انحفظت مرّتين — الرصيد زاد مرّتين'),
    (10, 'lot_x2',                 s.lot_x2::numeric,          '«أضف دفعة» انحفظت مرّتين'),
    (11, 'return_x2_90d',          s.ret_x2::numeric,          'مرتجع على فاتورة انحفظ مرّتين (٩٠ يوم)'),
    (12, 'manual_30d',             s.manual::numeric,          'تعديل رصيد يدوي من نموذج المادة (٣٠ يوم)'),
    (13, 'manual_gone_30d',        s.manual_gone::numeric,     'تعديل يدوي — أو «أضف دفعة» — على مادة انحذفت أو اندمجت بعده'),
    (14, 'deleted_60d',            s.deleted::numeric,         'مواد انحذفت (٦٠ يوم)'),
    (15, 'deleted_stock_60d',      s.deleted_stock::numeric,   'منها انحذفت وعليها رصيد'),
    (16, 'deleted_neg_60d',        s.deleted_neg::numeric,     'منها انحذفت ورصيدها تحت الصفر'),
    (17, 'merged_60d',             s.merged::numeric,          'مواد اندمجت بغيرها (٦٠ يوم)'),
    (18, 'restored_60d',           s.restored::numeric,        'انحذفت أو اندمجت ثمّ رجعت (٦٠ يوم)'),
    (19, 'twins',                  s.twins::numeric,           'توائم بنفس الاسم هسه'),
    (20, 'readded',                s.readded::numeric,         'انحذفت ثمّ انضافت من جديد باسمها أو رمزها (G21)'),
    (21, 'readded_had_stock',      s.readded_stock::numeric,   'منها المحذوفة جان عليها رصيد'),
    (22, 'regrown_after_merge',    s.regrown::numeric,         'اندمجت ثمّ انولدت من جديد باسمها القديم (G22)'),
    (23, 'merge_unit_mismatch_60d', s.merge_units::numeric,    'دمج بين وحدتين مختلفتين وعليها رصيد (G14)'),
    (24, 'kbd_names',              s.kbd_names::numeric,       'أسماء بحروف كيبورد فارسي أو كردي أو محارف مخفية (G15)'),
    (25, 'kbd_twins',              s.kbd_twins::numeric,       'توائم ما يشوفها البحث إلا بطيّ هذي الحروف (G15/G16)'),
    (26, 'unlinked_lines_90d',     s.unlinked::numeric,        'سطور بيع بلا مادة واسمها اسم مادة بالمخزن — انباعت وما نقصت (G01/G17)'),
    (27, 'unlinked_qty_90d',       s.unlinked_qty::numeric,    'كمّيتها بوحدة السطر'),
    (28, 'unlinked_svc_named_90d', s.unlinked_svc::numeric,    'مثلها واسمها اسم خدمة أيضاً — راجعها'),
    (29, 'drug_lines_unlinked_90d', s.drug_unlinked::numeric,  'دواء مربوط بمادة انباع من تبويب الأدوية بلا خصم (G02)'),
    (30, 'neg_buy_lines',          s.neg_buy::numeric,         'سطر شراء بسعر سالب — زاد الرصيد بدل ما ينقصه (G07)'),
    (31, 'neg_buy_discount_like',  s.neg_buy_disc::numeric,    'منها لمادة ما انشرت بسعر موجب أبداً: خصم انكتب كسطر'),
    (32, 'unit_flips_90d',         s.flips::numeric,           'تبدّلت وحدة مادة عليها رصيد وبقى الرقم نفسه (G11)'),
    (33, 'unit_flips_restocked_90d', s.flips_restocked::numeric, 'تبدّلت وحدتها وانكتب رصيدها بنفس الحفظة — راجع الكلفة'),
    (34, 'doses_unsold',           s.doses::numeric,           'جرعات انطت من مادة مربوطة ولسه ما انباعت — الرصيد أعلى بيها (G04)'),
    (35, 'doses_unsold_7d',        s.doses_old::numeric,       'منها أقدم من أسبوع'),
    (36, 'doses_reverted',         s.doses_reverted::numeric,  'جرعات انباعت ثمّ انرجعت فاتورتها: رجع الرصيد والدواء انعطى'),
    (37, 'doses_dead_link',        s.dose_dead::numeric,       'جرعات انطت بعد ما انحذفت أو اندمجت مادتها المربوطة — ما تنخصم')
  ) v(ord, measure, value, meaning)
 where v.ord <= 2 or v.value <> 0
 order by (s.neg_now + s.buy_x2 + s.lot_x2 + s.ret_x2 + s.manual + s.deleted_stock + s.restored + s.readded + s.regrown + s.kbd_twins
           + s.unlinked + s.drug_unlinked + s.neg_buy + s.flips + s.doses + s.doses_reverted + s.dose_dead) desc, s.clinic, v.ord;

-- ١) من أين تأتي تغييراتُ الرصيد؟ آخر ٣٠ يوماً، لكلّ عيادة
with ev as (
  select a.id, a.clinic_id, a.created_at, a.actor, a.entity_id,
         (a.details->'__changed'->'stock'->>0)::numeric as f, (a.details->'__changed'->'stock'->>1)::numeric as t
    from audit_log a
   where a.entity = 'products' and a.action = 'UPDATE' and a.details->'__changed' ? 'stock'
     and a.created_at > now() - interval '30 days'
), shaped as (
  select ev.*, coalesce((select string_agg(distinct b.entity || ':' || b.action, ',') from audit_log b
                          where b.clinic_id = ev.clinic_id and b.created_at = ev.created_at
                            and not (b.entity = 'products' and b.action = 'UPDATE')),
                        case when exists (select 1 from product_lots l where l.product_id::text = ev.entity_id
                                           and l.created_at = ev.created_at and l.source = 'added') then 'lot_add'
                             else 'products-only' end) as tx
    from ev)
select left(clinic_id::text, 8) as clinic, tx, count(*) as changes, count(distinct entity_id) as products,
       round(coalesce(sum(t - f) filter (where t > f), 0), 3) as added, round(coalesce(sum(t - f) filter (where t < f), 0), 3) as removed,
       count(distinct actor) as actors
  from shaped group by 1, 2 order by 1, 3 desc;

-- ٢) التعديلُ اليدويّ للرصيد (معاملةٌ لم تكتب غيرَ صفّ المادّة) — مَن وكم، آخر ٣٠ يوماً
with ev as (
  select a.clinic_id, a.created_at, a.actor, a.entity_id, a.details->'__changed' as ch,
         (a.details->'__changed'->'stock'->>0)::numeric as f, (a.details->'__changed'->'stock'->>1)::numeric as t
    from audit_log a
   where a.entity = 'products' and a.action = 'UPDATE' and a.details->'__changed' ? 'stock'
     and a.created_at > now() - interval '30 days')
select left(ev.clinic_id::text, 8) as clinic, coalesce(s.name, left(ev.actor::text, 8)) as who, count(*) as edits,
       count(distinct ev.entity_id) as products, count(*) filter (where ev.t > ev.f) as raised, count(*) filter (where ev.t < ev.f) as lowered
  from ev left join lateral (select st.name from staff st where st.user_id = ev.actor and st.clinic_id = ev.clinic_id limit 1) s on true
 where not exists (select 1 from audit_log b where b.clinic_id = ev.clinic_id and b.created_at = ev.created_at
                    and not (b.entity = 'products' and b.action = 'UPDATE'))
   and not exists (select 1 from product_lots l where l.product_id::text = ev.entity_id
                    and l.created_at = ev.created_at and l.source = 'added')   -- «أضف دفعة» ليست يدوية
 group by 1, 2 order by 1, 3 desc;

-- ٣) شراءٌ مرّتين (نفسُ الشركة والمجموع وعددُ السطور خلال ١٠ دقائق) — ضغطةٌ ثانية بعد جوابٍ ضائع (قبل 0287)
select left(a.clinic_id::text, 8) as clinic, count(*) as suspected_double_purchases
  from purchases a join purchases b on b.clinic_id = a.clinic_id and b.id <> a.id
   and b.company_id is not distinct from a.company_id and b.total = a.total and b.item_count = a.item_count
   and b.created_at > a.created_at and b.created_at - a.created_at < interval '10 minutes'
 group by 1 order by 2 desc;

-- ٤) «أضف دفعة» مرّتين لنفس المادّة بنفس الكمية خلال دقيقتين
select left(a.clinic_id::text, 8) as clinic, count(*) as suspected_double_adds, round(sum(a.received_qty), 3) as extra_qty
  from product_lots a join product_lots b on b.clinic_id = a.clinic_id and b.product_id = a.product_id and b.source = 'added'
   and b.received_qty = a.received_qty and b.created_at < a.created_at and a.created_at - b.created_at < interval '2 minutes'
 where a.source = 'added' group by 1 order by 2 desc;

-- ٥) موادُّ «اختفت»: حُذفت أو دُمجت آخر ٦٠ يوماً، وكم منها كان عليه رصيد
select left(t.clinic_id::text, 8) as clinic, case when t.merged_into is not null then 'merged' else 'deleted' end as how,
       count(*) as n, count(*) filter (where t.stock <> 0) as with_stock, round(sum(t.stock), 3) as stock_total
  from products_trash t where t.deleted_at > now() - interval '60 days' group by 1, 2 order by 1, 3 desc;

-- ٦) توائمُ بالاسم (الشراءُ يدخل صفّاً والبيعُ يطلع من الثاني)
select left(clinic_id::text, 8) as clinic, count(*) as twin_groups, sum(n) as rows_in_twins
  from (select clinic_id, search_norm(name) k, count(*) n from products
         where farm_id is null and not coalesce(pooled, false) group by 1, 2 having count(*) > 1) g
 group by 1 order by 2 desc;

-- ٧) بعد 0287: هل مرّت كتابةٌ بلا الدفتر؟ لكلّ العيادات (المتوقَّع: صفرُ صفوف) — حسابُ verify_stock_ledger نفسُه بلا هويّة عيادة
--    (الدالّةُ تسأل auth_clinic، والـSQL Editor بلا جلسة)
with t as (
  select l.clinic_id, l.product_id, l.section_id, l.delta,
         case when row_number() over (partition by l.product_id, l.section_id order by l.id) = 1 and l.op = 'checkpoint'
              then coalesce(l.qty_after, 0) else 0 end as base
    from stock_ledger l
), agg as (
  select clinic_id, product_id, section_id, sum(base) + sum(delta) as q from t group by 1, 2, 3
), drift as (
  select a.clinic_id from agg a left join products p on p.id = a.product_id left join company_sections cs on cs.id = a.section_id
   where a.q is distinct from coalesce(case when a.product_id is not null then p.stock else cs.pooled_stock end, 0)
  union all  -- رصيدٌ بلا أيّ صفّ
  select p.clinic_id from products p where coalesce(p.stock, 0) <> 0 and not exists (select 1 from stock_ledger l where l.product_id = p.id)
  union all
  select s.clinic_id from company_sections s where coalesce(s.pooled_stock, 0) <> 0 and not exists (select 1 from stock_ledger l where l.section_id = s.id)
)
select left(clinic_id::text, 8) as clinic, count(*) as drifted from drift group by 1 order by 2 desc;
```

---

## ٦) الطريقُ لمخزنٍ «ما يضيع بيه شي» — بعد الإصلاحات أعلاه

1. **الدفترُ أساسُ كلّ شيء (نزل بـ0287)**: كلُّ رقمٍ له سطرٌ يقول مَن وبأيّ عملية. التالي فوقه: «رصيدُ المادّة في يومٍ ما»
   (من نقطة البدء + الفروق)، وتنبيهٌ يوميّ إن قال `verify_stock_ledger` شيئاً.
2. **الجردُ الدوريّ الصغير**: «عدّ اليوم ٥ مواد» بالأعلى قيمةً والأقدم عدّاً والأكثر حركةً يدوية — كلُّ مادّةٍ تُعدّ مرّةً بالشهر بلا يومِ جردٍ معطِّل.
3. **لا رقمَ يُكتب بيد بلا سبب**: تعديلُ الرصيد بالنموذج يصير «جرداً» بسببٍ وموافقة (قرارك ١)، والخسارةُ تُسجَّل سحباً بيومها.
4. **تقريرُ الفروق الأسبوعيّ للمدير**: ما تغيّر يدوياً، وما رجع بلا فاتورة، وما حُذف ودُمج، ومن فعله — من الدفتر لا من التخمين.
5. **باركودٌ واحد لكلّ علبة**: ربطُ رمز المصنع عند الاستلام (قرارك ٢) + فحصُ التوائم الشهريّ مع «ادمجها» بمعاينة.
6. **المفردُ بالضبط** (F04): خصمٌ بلا تقريب — نهايةُ «رصيده صفر» والحبّاتِ الوهميّة.
7. **الوجباتُ والانتهاء (FEFO) ومسحُ GS1** (خطةُ `inventory-vnext-plan.md` م٣–م٤): المسحةُ تعبّي الانتهاء والوجبة، والبيعُ يقترح الأقربَ انتهاءً.
8. **حدودُ الصلاحيات**: الحذفُ والدمجُ و«رتّب المخزن» للمدير بمعاينةٍ تسمّي ما سيحدث — لا زرَّ يطوي العيادةَ كلَّها بضغطة.
9. **وضعُ «بلا نت» صادق**: ما انحفظ بالجهاز يظهر بالقائمة بشارة «بانتظار الرفع»، والخروجُ يُنبّه إن بقي شيء.
10. **قياسٌ قبل التشخيص دائماً**: كلُّ شكوى مخزنٍ تُسأل أوّلاً بالدفتر (`stock_ledger_of`) قبل أيّ تخمين.
