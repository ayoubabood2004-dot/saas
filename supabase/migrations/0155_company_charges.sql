-- ============================================================================
-- ٠١٥٥ — ما تطلبه الشركةُ ولا فاتورةَ له
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- دفترُ المورّدين يعرف رقماً واحداً: مجموعُ فواتير الشراء ناقصَ ما سُدّد. وهذا
-- صحيحٌ وناقص. فالشركةُ تطلب العيادةَ بأشياءَ لا فاتورةَ شراءٍ لها أصلاً: أجرةُ
-- نقلٍ على حساب العيادة، وفرقُ سعرٍ اتُّفق عليه بعد التسليم، وبضاعةٌ تالفةٌ
-- حُسبت على العيادة، ورصيدٌ قديمٌ مُرحَّلٌ من دفترٍ ورقيّ قبل النظام.
--
-- فيبقى الرقمُ الظاهر بالشاشة أقلَّ مما تطلبه الشركةُ فعلاً، والطبيبُ يعرف
-- الفرقَ ويحفظه بورقةٍ أو برأسه. ثم يجي يوم الحساب فيختلفان — لا لأن أحدهما
-- كاذب، بل لأن نصفَ الحقيقة كان خارج النظام.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- مطالبةٌ يدويّةٌ صفٌّ مستقلّ، لا فاتورةُ شراءٍ وهميّة. والفرقُ ليس شكلياً:
-- فاتورةُ الشراء تُدخل بضاعةً وتحرّك مخزوناً وكلفةً وربحاً، والمطالبةُ مالٌ
-- بذمّةٍ بلا صنفٍ واحد. فلو زُرعت فاتورةً لَلوّثت المخزونَ والتقاريرَ معاً.
-- ولذلك تُجمع على الدين وحده، ولا تمسّ مخزوناً ولا ربحاً.
--
-- وكلُّ حقولها اختياريةٌ إلا المبلغ: التاريخُ يفترض اليومَ، والسببُ والملاحظةُ
-- تُتركان فارغتين إن شاء. لأن المطالبةَ تُقيَّد لحظةَ سماعِها بالهاتف — ولو
-- اشترطنا سبباً مكتوباً لتُركت غيرَ مقيَّدةٍ أصلاً، وهذا أسوأُ من سببٍ ناقص.
--
-- ── التسوية ──────────────────────────────────────────────────────────────
-- المطالبةُ تُطوى بـ`settled_at` لا تُحذف: «كم كانت تطلبنا وسدّدنا» سؤالٌ
-- يُسأل بعد شهور، وصفٌّ محذوفٌ لا يجيب. والحذفُ يبقى للخطأ بالإدخال وحده.
--
-- إضافيةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0154.
-- ============================================================================

create table if not exists company_charges (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) on delete cascade default auth_clinic(),
  company_id  uuid not null references companies(id) on delete cascade,
  -- المبلغ وحده إلزاميّ، وموجبٌ دائماً: المطالبةُ تزيد الدين ولا تنقصه.
  -- والتنقيصُ تسديدٌ، وله بابُه بدفتر الدفعات لا هنا.
  amount      numeric not null check (amount > 0),
  reason      text check (reason is null or char_length(reason) <= 200),
  note        text check (note is null or char_length(note) <= 500),
  -- تاريخُ المطالبة بيوم بغداد لا بيوم الخادم: القاعدةُ تعمل بـUTC، فـ
  -- `current_date` يتأخّر ثلاثَ ساعاتٍ كلَّ ليلة — مطالبةٌ تُقيَّد العاشرةَ
  -- مساءً تُكتب بتاريخ الأمس. درسٌ مدفوعٌ ثمنُه بـ0154.
  charged_at  date not null default (now() at time zone 'Asia/Baghdad')::date,
  settled_at  timestamptz,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index if not exists company_charges_company_idx
  on company_charges(company_id, charged_at desc);
-- المفتاحُ الأجنبيّ يحتاج فهرسَه وإلا صار حذفُ عيادةٍ مسحاً كاملاً للجدول.
create index if not exists company_charges_clinic_idx
  on company_charges(clinic_id, charged_at desc);

alter table company_charges enable row level security;

-- قراءةٌ وكتابةٌ للعيادة صاحبةِ الصفّ. و`(select auth_clinic())` بالقوسين لا
-- عاريةً: النداءُ العاري يُقيَّم صفّاً صفّاً (initplan) بدل مرّةٍ واحدة.
drop policy if exists company_charges_clinic_all on company_charges;
create policy company_charges_clinic_all on company_charges for all
  using      (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

drop trigger if exists audit_all on company_charges;
create trigger audit_all after insert or update or delete on company_charges
  for each row execute function audit_change();
