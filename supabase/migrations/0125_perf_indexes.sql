-- ============================================================================
-- doctorVet — 0125: فهارس المفاتيح الأجنبية + فهرس عمر سجلّ التدقيق
--
-- الموجة الأولى: **إضافةٌ صرفة**. ما بيها UPDATE ولا DELETE ولا ALTER لعمود،
-- فما تقدر — ميكانيكياً — تغيّر صفّاً واحداً من بيانات أي عيادة. أسوأ ما يصير
-- لو غلطنا: فهرسٌ زائد يُحذَف بسطر.
--
-- لماذا: مفتاحٌ أجنبيّ بلا فهرسٍ يبدأ بعموده يخلّي بوستغريس يمسح الجدول الابن
-- **كاملاً** عند كل حذفٍ أو تحديثٍ للأب، وهو ماسكٌ قفلاً. اليوم الجداول صغيرة
-- فما ينلاحظ؛ ومع النمو يصير حذفُ شركةٍ واحدة يقفل جدول المشتريات ثوانيَ.
--
-- ملاحظة `journeys(pet_id)`: موجودٌ فهرسٌ **جزئيّ** عليه (where status='active')
-- وهذا لا يخدم فحص المفتاح الأجنبي — الفحص يشمل الصفوف المنتهية أيضاً. فنضيف
-- فهرساً كاملاً بجانبه.
--
-- لماذا بلا CONCURRENTLY: هي تمنع قفل الكتابة، لكنها **ما تشتغل داخل معاملة**
-- ومحرّر SQL بسوبابيس يلفّ النصّ بمعاملة، فتفشل اللصقة كلها. وأكبر جدولٍ عندنا
-- اليوم ٢٢ ألف صفّ — بناء الفهرس عليه أجزاءُ ثانية. القفل أقصر من نبضة، فالبناء
-- العاديّ هو الصحيح لحجم اليوم. (لو تجاوز جدولٌ مليونَ صفّ لاحقاً، تُبنى
-- فهارسه بـ CONCURRENTLY كلٌّ بأمرٍ منفصل.)
--
-- إضافيّة وقابلة لإعادة التشغيل: كل فهرسٍ `if not exists`، والحلقة تتخطّى أي
-- جدولٍ أو عمودٍ غير موجود بدل أن تفشل.
--
-- تراجع: drop index if exists <الاسم>;  — لكل فهرسٍ بالقائمة أدناه.
-- ============================================================================

-- تُكتب أوامرَ صريحة لا حلقةً مولِّدة: حارس القاعدة (scripts/db-guard.mjs)
-- يقرأ نصّ الهجرات، وما يقدر يشوف فهرساً ينولد داخل `execute format(…)` —
-- فيبقى يشتكي من مفتاحٍ صار مفهرساً فعلاً. الصريح يُقرأ ويُراجَع ويُعدّ.

create index if not exists appt_clinic_idx           on appointments (clinic_id);
create index if not exists reminders_clinic_idx      on reminders (clinic_id);
create index if not exists purchase_items_clinic_idx on purchase_items (clinic_id);
create index if not exists staff_presence_user_idx   on staff_presence (user_id);
create index if not exists surgeries_visit_idx       on surgeries (visit_id);
create index if not exists purchase_pay_company_idx  on purchase_payments (company_id);
create index if not exists lab_inbox_link_idx        on lab_device_inbox (link_id);
create index if not exists genbarcode_product_idx    on generated_barcodes (product_id);
create index if not exists store_orders_invoice_idx  on store_orders (invoice_id);
create index if not exists journeys_pet_all_idx      on journeys (pet_id);
create index if not exists wa_inbox_account_idx      on wa_inbox (account_id);
create index if not exists staff_recurring_staff_idx on staff_recurring (staff_id);
create index if not exists payslips_staff_idx        on payslips (staff_id);
create index if not exists payslip_lines_clinic_idx  on payslip_lines (clinic_id);
create index if not exists staff_loans_staff_idx     on staff_loans (staff_id);
create index if not exists staff_loan_events_clinic_idx on staff_loan_events (clinic_id);

-- عمر سجلّ التدقيق: الفهرس القائم (clinic_id, created_at) ما يخدم كنسَ
-- الاحتفاظ، لأن الكنس يمسح كل العيادات بشرط العمر وحده — فيبقى مسحاً كاملاً.
create index if not exists audit_log_created_idx     on audit_log (created_at);

-- الفهرس المكرَّر الوحيد الذي أكّده مستشار سوبابيس على القاعدة الحيّة:
-- `lab_device_links_token_idx` نسخةٌ طبق الأصل من الفهرس الضمنيّ لقيد UNIQUE
-- على نفس العمود — كلفةُ كتابةٍ مضاعفة بلا أي مكسبِ قراءة.
--
-- نحذف هذا وحده. الحارس (scripts/db-guard.mjs) يشير إلى ثلاثةٍ آخرين تبدو
-- مكرَّرة بقراءة الهجرات (pets_token_idx، invites_code_idx، clinic_notes_day_idx)
-- لكن المستشار الحيّ ما أكّدها، فنتركها: فهرسٌ زائد كلفتُه كتابةٌ أبطأ قليلاً،
-- وحذفُ فهرسٍ مستعمَل كلفتُه استعلامٌ يزحف. الشكّ يرجّح الإبقاء.
do $$
begin
  if exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'lab_device_links_token_idx'
  ) and exists (
    -- لا نحذفه إلا إذا كان القيد الفريد فعلاً موجوداً يغطّي نفس العمود
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'lab_device_links_token_key'
  ) then
    drop index if exists public.lab_device_links_token_idx;
    raise notice 'db: انحذف الفهرس المكرَّر lab_device_links_token_idx';
  end if;
end $$;
