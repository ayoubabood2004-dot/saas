-- 0109: شاشة البيع الجديدة — تفعيل اختياري لكل عيادة.
-- إعادة بناء شاشة الكاشير (سلة ثابتة، حقول مطويّة، شبكة تتنفّس) تُجرَّب بقرار
-- العيادة قبل أن تُعمَّم. عمود منطقي واحد على صف التفضيلات المتزامن.
alter table public.clinic_prefs add column if not exists pos_v2 boolean not null default false;
