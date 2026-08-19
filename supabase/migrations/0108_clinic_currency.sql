-- 0108: عملة العيادة ودولتها — تُختار الدولة عند إنشاء الحساب فيشتغل النظام
-- داخلياً بعملتها (ريال سعودي، درهم، …) بدل افتراض الدينار للجميع.
-- عمودان نصيّان بسيطان على clinic_prefs (نفس صف التفضيلات المتزامن؛ RLS قائمة).
alter table public.clinic_prefs add column if not exists currency text;
alter table public.clinic_prefs add column if not exists country  text;
