-- 0085 — طريقة السحب بسجل المصروفات: نقدي / بطاقة / حوالة بنكية.
-- الدكتور يسجل منين انسحبت الفلوس؛ الصفوف القديمة كلها كانت نقداً بحكم
-- تعريف السجل الأصلي، فالافتراضي cash يحافظ على معناها كما هو.
alter table expenses
  add column if not exists method text not null default 'cash'
  check (method in ('cash', 'card', 'bank'));
