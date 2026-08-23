-- ============================================================================
-- 0115 — ورقة العلاج: المهمة بدل الجرعة
--
-- الطبلة اليوم تعرف الأدوية وحدها: كل صف دواءٌ بوقتٍ وكمية. لكن الحيوان
-- الراقد ليس مجموعة جرعات — هو كائنٌ يأكل ويبول وتُقاس حرارته وتجري سوائله
-- وتُغيَّر ضماداته. ورقة العلاج الحقيقية بأي عيادة تحمل هذه الصفوف كلها،
-- ولذلك تحمل هذه الهجرة الجدول من «جرعة» إلى «مهمة».
--
-- أربعة أعمدة، كلها اختيارية وبقيمٍ افتراضية آمنة — فالصفوف القديمة تبقى
-- صحيحة تماماً وتُقرأ أدويةً كما كانت:
--
--   task_type      نوع المهمة. الافتراضي 'drug' فالتاريخ كله يبقى كما هو.
--   route          طريق الإعطاء (وريدي/عضلي/تحت الجلد/فموي/موضعي/استنشاق).
--                  أحد «حقوق الدواء الخمسة» — وغيابه يعني أن المنفّذ يخمّن.
--   result         القيمة المسجَّلة عند الإنجاز: «٣٩٫٦» للحرارة، «٨٠٪»
--                  للتغذية، «٣٤٠ مل» للسوائل. الدواء لا يحتاجها (علامة صح
--                  تكفيه)، وغيرُه لا يُنجَز بعلامةٍ أصلاً بل بقيمة تُقرأ.
--   missed_reason  لماذا فاتت. سطرٌ واحد يفتح ورقة تسليم الوردية كاملةً،
--                  ويحمي العيادة عند المساءلة: «فاتت» بلا سبب اتهام، و«فاتت
--                  لأن الحيوان كان بالتصوير» توثيق.
-- ============================================================================

alter table treatment_entries add column if not exists task_type text not null default 'drug';
alter table treatment_entries add column if not exists route text;
alter table treatment_entries add column if not exists result text;
alter table treatment_entries add column if not exists missed_reason text;

-- القيم المسموحة تُحرَس بالقيد لا بالتطبيق وحده: صفٌّ بنوعٍ مجهول يكسر
-- عرض الورقة صامتاً، وكشفه عند الكتابة أرخص من مطاردته عند القراءة.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'treatment_entries_task_type_chk'
  ) then
    alter table treatment_entries
      add constraint treatment_entries_task_type_chk
      check (task_type in ('drug','fluid','vitals','feed','elim','nurse','lab'));
  end if;
end $$;

-- ورقة اليوم تُقرأ بالمريض واليوم معاً — والفهرس الحالي على pet_id وحده.
create index if not exists treatment_pet_day_idx on treatment_entries(pet_id, day);
