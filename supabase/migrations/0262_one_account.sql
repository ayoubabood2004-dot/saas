-- ============================================================================
-- 0262 — البطاقةُ والتحويل حسابٌ واحد (خيارُ العيادة)، والسحبُ «من الحساب»
--
-- المشكلة (بلاغُ المالك، ٦/١١): أغلبُ الأطبّاء يستلمون البطاقةَ والتحويلَ على
-- **نفس الحساب البنكيّ**. استلم ٢٥٠٠ بطاقة و١٥٠٠ تحويل، فيرى بحسابه ٤٠٠٠ ويسحبها
-- «من البطاقة» — والتقريرُ يقول: البطاقةُ صافيها −١٥٠٠ والتحويلُ +١٥٠٠. المجموعُ صحيح
-- والتقسيمةُ كذب: الجيبان بالشاشة اثنان وبالواقع واحد.
--
-- الدفاع:
--  • `clinic_prefs.one_account` (افتراضيُّه **نعم** — حالُ أغلب العيادات):
--    الشاشةُ تعرض جيبين، الدرج (نقد) والحساب (بطاقة + تحويل). خيارُ **عرض** لا يغيّر صفّاً:
--    السحوباتُ القديمة تبقى بما سُجّلت به (card / bank)، وتُجمع بجيب الحساب لحظةَ العرض —
--    فالأشهرُ الماضية تُقرأ صحيحةً بلا ترحيل، وإطفاءُ الخيار يرجّع العرضَ القديم حرفاً.
--  • `expenses.method` يقبل `account` — سحبٌ «من الحساب» يُكتب **كما حصل**: لا بطاقة ولا
--    تحويل. كتابتُه `bank` كانت تخميناً صامتاً يظهر على التحويل لو فُصل الحسابان يوماً؛ أمّا
--    `account` فالشاشةُ المفصولة تعرض مدّتَه بالحساب مجموعاً وتقول لماذا (لا تقسّم ما لا يُعرف).
--
-- بلا دالّةٍ ولا سياسةٍ جديدة: عمودٌ على جدولٍ مسيَّجٍ أصلاً، وقيدٌ يتّسع. ويُعاد بلا أثرٍ ثانٍ.
-- تراجع (الواجهةُ أوّلاً — وإلا أرسلت `account` لقيدٍ لا يعرفه):
--   update expenses set method = 'bank' where method = 'account';
--   alter table expenses drop constraint expenses_method_check;
--   alter table expenses add constraint expenses_method_check check (method in ('cash','card','bank','stock'));
--   alter table clinic_prefs drop column one_account;
-- ============================================================================

alter table public.clinic_prefs
  add column if not exists one_account boolean not null default true;

-- القيدُ كما عرّفته 0216 + `account`. يُعاد بنفس الاسم (drop if exists ثمّ add) فلا يتكرّر.
alter table public.expenses drop constraint if exists expenses_method_check;
alter table public.expenses add constraint expenses_method_check
  check (method in ('cash', 'card', 'bank', 'stock', 'account'));
