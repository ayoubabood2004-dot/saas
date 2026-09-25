-- ============================================================================
-- ٠٢٠٩ — نقلٌ بين شركتين ليس شراءً: نوعُ «relink» بمركز الحركات
--
-- ── المقيس (الإنتاج، قراءةٌ فقط) ─────────────────────────────────────────
-- يومُ طيّ الشركات التوائم (٢١/٩) كتب بسجلّ التدقيق ٩١ تعديلَ منتجٍ مفتاحُه
-- `company_id` وحدَه، و٤٤ مفتاحُه `section_id` وحدَه، و٩ تعديلاتِ فاتورة شراءٍ
-- مفتاحُها `company_id` وحدَه. بمئةٍ وعشرين يوماً: ١٦٦ منتجاً و١٦ فاتورةً و٣
-- أصناف — كلُّها تغيّر فيها **رابطُ الشركة أو الصنف ولا شيءَ غيرُه**.
--
-- و`audit_kind()` كان يسمّي سطرَ `purchases` كلَّه «purchase»، فالشاشةُ ترسم
-- الفاتورةَ القديمة المنقولة بأيقونة الشراء وجملةِ «فاتورة شراء — {الشركة}
-- ({المبلغ})» — كأنّ شراءً جديداً حصل. والمنتجاتُ «تعديل منتج» بلا تغييرٍ يُرى.
--
-- ── القاعدة ──────────────────────────────────────────────────────────────
-- يُصنَّف **بما تغيّر لا بمن غيّره**: تعديلٌ على منتجٍ أو فاتورةِ شراءٍ أو دفعةِ
-- مورّدٍ أو صنف، كلُّ مفاتيحه (بلا الضجيج) من {company_id, company_name,
-- section_id} ⇒ «relink». فهو صادقٌ للطيّ وللاسترجاع ولحذف الشركة (الرابطُ
-- يُفكّ) ولمن غيّر شركةَ فاتورته بيده — بكلّها تغيّر الرابطُ وحدَه، لا المالُ ولا
-- المخزون. وأيُّ مفتاحٍ آخر معه (الاسم، المخزون، المبلغ) يُبقي النوعَ القديم: من
-- قياس ٢١/٩ تسعةُ تعديلاتٍ غيّرت الاسمَ مع الشركة — تعديلاتُ مستخدمٍ حقيقية —
-- وتبقى «تعديل منتج».
--
-- ولا يمسّ سطراً مخزَّناً: التصنيفُ عند القراءة، فالسطورُ القديمة تُسمّى صحيحاً
-- من لحظة النزول. والمرآةُ بـ`activityKinds.ts`، والحالاتُ بـ`activity-cases.json`
-- تفحص الطرفين. ما سواها كما بـ0152 حرفاً.
-- ============================================================================

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
