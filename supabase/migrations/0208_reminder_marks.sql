-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ 0208 — علاماتُ التذكير على الخادم: «أُرسلت» و«تمّ التذكير» تعبر الأجهزة    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- شكوى المالك: «التذكيرات المتأخرة حتى لو يدزون رسائل فيها تضل متأخرة وما تروح».
--
-- المقيس قبل الكتابة (٢٠٢٦-٠٩-٢٤): لا كيانَ للتذكير أصلاً — مركزُ التذكيرات يبني صفوفَه
-- عند كلّ رسمٍ من ستّة مصادر (اللقاحات، الديدان، متابعات العمليات، المواعيد، اليدويّ،
-- أعياد الميلاد)، و**حالةُ كلّ صفٍّ لا تُحفظ إلا بمتصفّح الجهاز** (`vp_rem_sent`،
-- `vp_rem_outcome`). والجسرُ الوحيد العابر للأجهزة سجلُّ الواتساب مطابَقاً بـ«الحيوان +
-- النوع» — ومنذ c3680c1 (٢٠٢٦-٠٨-٢٢) تُسجَّل رسائلُ التذكير من صفحة الحملات بنوع
-- `manual` دائماً، فلا تطابق شيئاً. بالإنتاج: ٢٢٢ صفّاً أحمرَ بـ١٢ عيادة، ١٣٩ منها أُرسلت
-- لنفس الحيوان ضمن نافذة موعدها.
--
-- العلامةُ مربوطةٌ بـ(مفتاح الصفّ، تاريخ الاستحقاق) عمداً — كالعلامة المحلية التي
-- تحلّ محلَّها: يتجدّد الموعد (جرعةٌ جديدة، تكرارٌ يدويّ) فلا تنطبق العلامةُ القديمة،
-- ويظهر الموعدُ الجديد وحدَه. وهذا هو «الخطوةُ التالية» بلا اختلاق شيء.
--
-- **ولا أثرَ سريريّ**: «تمّ التذكير» لا يكتب «أُعطيت الجرعة» — ذاك سجلٌّ طبّيّ يراه
-- صاحبُ الحيوان ببوّابته، ويُكتب من مدخل الجرعة وحدَه. العلامةُ تخصّ التذكيرَ لا الحيوان.
--
-- و**لا أثرَ لمشغّل المنصّة** (0151): `marked_by` يُترك فارغاً حين يعمل المشغّلُ داخل
-- العيادة، كما اتُّفق مع العيادات.

create table if not exists reminder_marks (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  -- مفتاحُ الصفّ كما يبنيه مركزُ التذكيرات: vax-<id> · srg-<id> · apt-<id> · rem-<id> · bday-<petId>
  row_key    text not null check (length(row_key) between 3 and 120),
  due_date   date not null,
  state      text not null check (state in ('sent', 'done')),
  -- متى أُرسلت رسالتُه (إن أُرسلت). منفصلٌ عن الحالة: «تمّ التذكير» فوق «أُرسلت» يُبقيه،
  -- فالتراجعُ عن «تمّ» يعيد الصفَّ «أُرسلت» لا أحمرَ كأنه لم يُرسَل قطّ.
  sent_at    timestamptz,
  marked_at  timestamptz not null default now(),
  -- مَن كتب آخرَ مرّة — يختمه المحفّزُ أدناه بكلّ إدراجٍ **وتحديث**. القيمةُ الافتراضية لا
  -- تجري على التحديث، فكان «تمّ» فوق «أُرسلت» يُنسب لمن أرسل لا لمن ضغط.
  marked_by  uuid,
  constraint reminder_marks_one unique (clinic_id, row_key, due_date)
);

-- الختم: المستخدمُ الحاليّ — **إلا مشغّلَ المنصّة داخل العيادة** (0151): فارغٌ، لا أثرَ له
-- عندها كما اتُّفق. بصلاحية المُستدعي: لا يقرأ ولا يكتب جدولاً آخر.
create or replace function public.reminder_marks_stamp()
returns trigger
language plpgsql
set search_path to 'public'
as $function$
begin
  new.marked_by := case when platform_acting_clinic() is null then auth.uid() end;
  return new;
end $function$;

drop trigger if exists reminder_marks_stamp on reminder_marks;
create trigger reminder_marks_stamp
  before insert or update on reminder_marks
  for each row execute function public.reminder_marks_stamp();

-- القراءةُ محدودةٌ بالتاريخ (الشاشةُ لا تحتاج علاماتِ مواعيدَ مضى عليها أكثر من ٤ أشهر).
create index if not exists reminder_marks_clinic_due_idx on reminder_marks (clinic_id, due_date);

alter table reminder_marks enable row level security;
drop policy if exists reminder_marks_rw on reminder_marks;
create policy reminder_marks_rw on reminder_marks
  for all to authenticated
  using (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

revoke all on reminder_marks from anon;
grant select, insert, update, delete on reminder_marks to authenticated;

comment on table reminder_marks is
  'حالةُ التذكير المشتركة بين الأجهزة: sent (أُرسلت) أو done (تمّ التذكير) لصفٍّ بتاريخ استحقاقه. '
  'لا أثرَ سريريّاً: لا تعني أن الجرعة أُعطيت.';
