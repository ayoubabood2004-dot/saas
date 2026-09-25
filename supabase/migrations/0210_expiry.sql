-- ============================================================================
-- ٠٢١٠ — الانتهاء يوقف النزف (م١، docs/expiry-plan.md الموجتان ١–٢)
--
-- ── المقيس (الإنتاج، ٢٥/٩) ───────────────────────────────────────────────
-- ٢٧ مادةً منتهيةً وما زالت على الرفّ بثلاث عيادات = ١٬٣٨٢٬٩٦٨ د.ع بسعر الشراء،
-- و٥١ تنتهي خلال ٩٠ يوماً ≈ ٣٫٥ مليون. ١٥٧٠ من ٣٠٠١ منتجاً لها تاريخ — العياداتُ
-- **تُدخل** التواريخ؛ الناقصُ من يقرؤها بوقتها. وشاشةُ البيع كانت عمياءَ عنها تماماً.
--
-- ── ثلاثةُ أشياء ─────────────────────────────────────────────────────────
-- ١) مُدّتا التنبيه بيد العيادة (`clinic_prefs`): مدةُ إرجاع المورّد (٩٠) — المندوبُ
--    يقبل القريبَ من الانتهاء ضمن مدةٍ متّفقٍ عليها، وبعدها الخسارةُ نهائية فإنذارُ
--    الثلاثين وحدَه متأخّر — والحرجة (٣٠). NOT NULL بافتراضٍ ثابت: كلُّ صفٍّ قائمٍ
--    يأخذ ٩٠/٣٠ بلا إعادة كتابة، ولا null يعني «افتراضي». ولا فحصَ «الحرجة ≤ الإرجاع»
--    عبرَ العمودين: كتابتان منفصلتان تنقضانه لحظةً فيرتدّ خطأً — يُقصّ بالمتصفّح
--    ويُكتبان بنداءٍ واحد (`setExpiryWindows`).
-- ٢) `products.expiry_ack`: **التاريخُ** الذي كُتم عنده التنبيه. مكتومٌ ما دام يساوي
--    `expiry_date`، فأيُّ تغيّرٍ له (شراءُ وجبة: coalesce بـ0205، طيّ: greatest بـ0184،
--    تعديل) يرفع الكتمَ بلا محفّز ولا منطقٍ مكرّرٍ بالتجريبيّ. **وnullable بلا
--    افتراض عمداً**: `restore_product` يعيد اللقطةَ بـ`jsonb_populate_record`، فمفتاحٌ
--    غائبٌ من لقطةٍ أقدم يصير NULL لا الافتراض — وعمودٌ NOT NULL كان سيجعل كلَّ صفٍّ
--    بسلّة المحذوفات غيرَ قابلٍ للاسترجاع (مقيسٌ على نسخة 0197 الحقيقية). والكتابةُ
--    بسياسة `products_write` القائمة (مدير/بيطريّ) — لا دالّةَ جديدة.
-- ٣) `audit_kind`: حدثُ «بيع منتهٍ بعد تأكيدٍ بالاسم» (`sale.expired`) نوعٌ باسمه
--    `sale_expired` — كان كلُّ حدثٍ عميلٍ مجهول يُصنَّف «طباعة». ما سواه كما بـ0209 حرفاً.
-- ============================================================================

alter table public.clinic_prefs add column if not exists expiry_return_days integer not null default 90
  check (expiry_return_days between 1 and 730);
alter table public.clinic_prefs add column if not exists expiry_critical_days integer not null default 30
  check (expiry_critical_days between 1 and 730);
comment on column public.clinic_prefs.expiry_return_days is 'مدة إرجاع المورّد بالأيام — التنبيه يبدأ قبل الانتهاء بها (افتراضي 90)';
comment on column public.clinic_prefs.expiry_critical_days is 'حدّ الانتهاء الحرج بالأيام (افتراضي 30)';

alter table public.products add column if not exists expiry_ack date;
comment on column public.products.expiry_ack is 'تاريخ الانتهاء الذي كُتم عنده التنبيه — مكتوم ما دام = expiry_date. NULL = غير مكتوم. nullable عمداً (استرجاع اللقطات القديمة)';

create or replace function audit_kind(p_entity text, p_action text, p_details jsonb) returns text
language sql immutable set search_path = public as $$
  with c as (
    select coalesce((select array_agg(k) from jsonb_object_keys(coalesce(p_details->'__changed','{}'::jsonb)) k
                      where k not in ('updated_at','created_at','id','clinic_id')), '{}'::text[]) as ch
  )
  select case
    when p_entity = 'login' then 'login'
    when p_entity = 'client' then case
      when coalesce(p_details->>'event','') like 'override.%' then 'override'
      when coalesce(p_details->>'event','') like 'report.%' then 'export'
      when coalesce(p_details->>'event','') = 'sale.expired' then 'sale_expired'
      else 'print' end
    when p_entity = 'invoices' then case
      when p_action = 'INSERT' then 'sale'
      when p_action = 'DELETE' then 'sale_delete'
      when p_details->'__changed'->'status'->>1 = 'refunded' then 'refund'
      when not (p_details ? '__changed') and p_details->>'status' = 'refunded' then 'refund'
      when 'amount_paid' = any(c.ch) or 'payment_details' = any(c.ch) then 'payment'
      else 'sale_edit' end
    when p_entity = 'invoice_items' then 'sale_line'
    when p_action = 'UPDATE' and p_entity in ('products','purchases','purchase_payments','company_sections')
         and cardinality(c.ch) > 0 and c.ch <@ array['company_id','company_name','section_id']::text[] then 'relink'
    when p_entity = 'products' then case
      when p_action = 'INSERT' then 'product_add'
      when p_action = 'DELETE' then 'product_delete'
      when 'stock' = any(c.ch) then 'stock'
      else 'product_edit' end
    when p_entity in ('purchases','purchase_items') then 'purchase'
    when p_entity = 'purchase_payments' then 'supplier_pay'
    when p_entity in ('companies','company_sections','generated_barcodes') then 'inventory'
    when p_entity = 'expenses' then 'expense'
    when p_entity in ('delivery_orders','couriers','courier_settlements') then 'delivery'
    when p_entity = 'pets' then 'pet'
    when p_entity in ('admissions','clinic_visits','medical_visits','surgeries','care_entries','pet_problems','pet_movements') then 'case'
    when p_entity = 'treatment_entries' then 'dose'
    when p_entity = 'vaccinations' then 'vaccine'
    when p_entity in ('pet_notes','media_items','weight_logs','lab_results') then 'medical'
    when p_entity in ('appointments','reminders','journeys','journey_events') then 'booking'
    when p_entity = 'wa_messages' then 'message'
    when p_entity in ('store_orders','store_profiles') then 'store'
    when p_entity in ('staff','memberships','invites','branches') then 'team'
    when p_entity like 'payroll%' or p_entity in ('payslips','payslip_lines','staff_comp','staff_loans','staff_loan_events','staff_recurring') then 'payroll'
    when p_entity like 'clinic%' or p_entity in ('wa_accounts','lab_device_links') then 'settings'
    else 'other' end
  from c
$$;
