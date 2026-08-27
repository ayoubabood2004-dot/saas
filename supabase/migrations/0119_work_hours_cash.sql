-- 0119: دوام العيادة وصيغة الساعة ونافذة الأدوية ومطابقة الصندوق
--
-- أعمدة جديدة على clinic_prefs (نفس نمط بقية التفضيلات — صف واحد لكل عيادة
-- يتزامن عبر الأجهزة، والواجهة تعمل قبل الهجرة بالمرآة المحلية):
--   work_hours     نص JSON: {"am":{"from":"09:00","to":"14:00"},"pm":{...}|null}
--   clock_format   "12" أو "24" — عرض الساعة فقط، التخزين يبقى 24
--   dose_window    نص JSON: نافذة إعطاء الأدوية المخصصة (فارغ = حسب الدوام)
--   cash_reconcile تفعيل زر مطابقة الصندوق اليومية
--   cash_confirms  نص JSON: آخر تأكيدات المطابقة (يوم + دوام + مبالغ + مَن ومتى)

alter table public.clinic_prefs add column if not exists work_hours text;
alter table public.clinic_prefs add column if not exists clock_format text;
alter table public.clinic_prefs add column if not exists dose_window text;
alter table public.clinic_prefs add column if not exists cash_reconcile boolean not null default false;
alter table public.clinic_prefs add column if not exists cash_confirms text;
