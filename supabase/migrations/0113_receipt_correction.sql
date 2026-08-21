-- ============================================================================
-- doctorVet — 0113: تصحيح التحصيل (قيدٌ عكسي)، وسدّ باب تعديل الفواتير.
--
-- ── الحالة التي أوجدته ─────────────────────────────────────────────────────
-- بيعةٌ سُجّلت «مدفوعة كاملاً» والحقيقة أن نصف المبلغ فقط وصل، والباقي دين.
-- والسؤال: كيف يُصحَّح بلا فتح تعديل الفواتير؟
--
-- ── الجواب: ما بالفاتورة غلط أصلاً ────────────────────────────────────────
-- عندنا حقيقتان منفصلتان: **ما بِيع وبأي سعر** (الفاتورة، وهي صحيحة)،
-- و**كم مالاً وصل** (سجل التحصيل، وهو الخطأ). فالتصحيح لا يمسّ الفاتورة:
-- يضيف سطر تحصيلٍ سالباً. البنود والمجموع ورقم الفاتورة تبقى كما طُبعت
-- للزبون، وينزل amount_paid وحده، فيظهر الدين تلقائياً لأن
-- «الباقي = المجموع − المدفوع». وهذا **أأمن** من التعديل لا أقلّ: يترك أثراً
-- بدل أن يمحو.
--
-- ── لماذا السطر السالب لا سجلّ منفصل ──────────────────────────────────────
-- سندُ دينٍ منفصل يجعل الفاتورة تقول «مدفوعة» وسجلّ الديون يقول «مطلوب» —
-- حقيقتان متناقضتان بمكانين، والتقارير تجمعهما فتَعُدّ الإيراد مرّتين. أما
-- السطر السالب فيعيش داخل نفس المصفوفة التي تقرأها كل التقارير، فينقص
-- من طريقة الدفع نفسها التي دخل منها، ويُصحّح الصندوق واليوم معاً.
--
-- ── (٢) سدّ edit_invoice_lines ────────────────────────────────────────────
-- بُنيت (0110) لتعديل طلبات التوصيل، ونداؤها من الواجهة محصورٌ بشاشة
-- التوصيل — لكن الدالة نفسها كانت ممنوحة لكل موظّف مسجَّل، فأي طلبٍ مصنوع
-- بيدٍ يعدّل بنود أي فاتورة. حارسٌ بالواجهة وحدها ليس حارساً. تُقيَّد هنا
-- بالمدير (بـauth_role() فيمرّ رفع الصلاحية برمز المدير كما بالمصروفات).
--
-- إضافيّة وقابلة لإعادة التشغيل. تُطبَّق بعد 0112.
-- ============================================================================

-- ── ١) تصحيح التحصيل ──────────────────────────────────────────────────────
-- p_amount: المبلغ الذي **لم يصل فعلاً** (موجب). p_method: من أي جيبٍ يُعكَس
-- (نقد/بطاقة/…)؛ غيابه ⇒ الطريقة الغالبة بالفاتورة، لأن العكس يجب أن ينقص
-- الجيب نفسه الذي زاده التسجيل الخاطئ.
create or replace function correct_invoice_receipt(
  p_invoice uuid, p_amount numeric, p_reason text, p_method text default null)
returns invoices language plpgsql security definer set search_path = public as $$
declare
  v_clinic  uuid := auth_clinic();
  v_inv     invoices;
  v_cut     numeric(14,2);
  v_method  text;
  v_details jsonb;
  v_pos     numeric(14,2);
  v_who     text;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  -- عملية مالية عادية كالمصروفات ⇒ auth_role() لا auth_role_base(): رفع
  -- الصلاحية برمز المدير مقصودٌ أن يغطّي تصحيحات الصندوق على جهاز مشترك.
  if auth_role() <> 'manager' then raise exception 'not allowed'; end if;

  select * into v_inv from invoices where id = p_invoice and clinic_id = v_clinic;
  if not found then raise exception 'invoice not found'; end if;
  if v_inv.status = 'refunded' then raise exception 'invoice refunded'; end if;

  -- سببٌ إلزامي: قيدٌ عكسيّ بلا سبب هو بابٌ للتهرّب لا أثرٌ للمراجعة.
  if length(coalesce(btrim(p_reason), '')) < 3 then raise exception 'reason required'; end if;

  -- الباقي يصير ديناً، والدين يحتاج صاحباً. بيعةٌ بلا زبون لا يُلاحَق دينها،
  -- فالتصحيح عليها يخلق مطلوباً بلا مَدين — ونرفضه بدل أن ننتجه.
  v_who := coalesce(nullif(btrim(v_inv.customer_name), ''), nullif(btrim(v_inv.customer_phone), ''));
  if v_who is null then raise exception 'customer required'; end if;

  -- لا يُعكَس أكثر مما سُجّل واصلاً.
  v_cut := round(coalesce(p_amount, 0)::numeric, 2);
  if v_cut <= 0 then raise exception 'bad amount'; end if;
  if v_cut > v_inv.amount_paid then raise exception 'above collected'; end if;

  v_method := coalesce(
    nullif(btrim(p_method), ''),
    (select e->>'method' from jsonb_array_elements(coalesce(v_inv.payment_details, '[]'::jsonb)) e
      where (e->>'amount')::numeric > 0 order by (e->>'amount')::numeric desc limit 1),
    v_inv.payment_method, 'cash');

  v_details := coalesce(v_inv.payment_details, '[]'::jsonb);

  -- البيعة النقدية البسيطة تُخزَّن **بلا سجلّ سِيَق**: التقارير تشتقّ منها
  -- ساقاً ضمنية بكامل المدفوع ما دامت المصفوفة فارغة. ولو أضفنا السالب فوق
  -- الفراغ لسقطت تلك الضمنية — فيبقى بالسجلّ سالبٌ وحده، ويقرأ الصندوق
  -- مبلغاً سالباً. فنُثبّت الأصل صراحةً أولاً، ثم نعكس عليه.
  select coalesce(sum((e->>'amount')::numeric), 0) into v_pos
    from jsonb_array_elements(v_details) e where (e->>'amount')::numeric > 0;
  if v_pos < v_inv.amount_paid then
    v_details := v_details || jsonb_build_object(
      'method', coalesce(v_inv.payment_method, v_method),
      'amount', v_inv.amount_paid - v_pos,
      'at', to_char(v_inv.created_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));
  end if;

  v_details := v_details
    || jsonb_build_object(
         'method', v_method,
         -- الإشارة السالبة هي ما يميّز التصحيح: لا حاجة لعَلَمٍ إضافي.
         'amount', -v_cut,
         'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
         'note', btrim(p_reason));

  update invoices
     set amount_paid     = greatest(0, v_inv.amount_paid - v_cut),
         payment_details = v_details,
         -- الطريقة المعروضة تبقى الغالبة من السطور **الموجبة** وحدها.
         payment_method  = coalesce((select e->>'method' from jsonb_array_elements(v_details) e
                                      where (e->>'amount')::numeric > 0
                                      order by (e->>'amount')::numeric desc limit 1),
                                    v_inv.payment_method)
   where id = p_invoice and clinic_id = v_clinic
   returning * into v_inv;

  return v_inv;
end $$;

revoke all on function correct_invoice_receipt(uuid, numeric, text, text) from public, anon;
grant execute on function correct_invoice_receipt(uuid, numeric, text, text) to authenticated;

-- ── ٢) تعديل بنود الفاتورة: للمدير وحده ───────────────────────────────────
-- منطق 0110 **لا يُكرَّر ولا يُعاد كتابته**: يُعاد تسميته إلى اسمٍ داخليّ
-- تُسحب منه كل منح التنفيذ، ثم تصير الواجهة العامة غلافاً يفحص أولاً وينادي
-- ثانياً. فأي مسارٍ لا يمرّ بالفحص لا يملك صلاحية تنفيذ أصلاً.
--
-- والكتلة كلّها مشروطة بوجود 0110: عيادةٌ لم تطبّقها بعد يجب ألّا يُنشأ عندها
-- غلافٌ ينادي دالّةً غير موجودة — فيتعطّل تعديل التوصيل بلا سبب.
do $$
begin
  if to_regprocedure('edit_invoice_lines_unguarded(uuid, jsonb, text)') is null
     and to_regprocedure('edit_invoice_lines(uuid, jsonb, text)') is not null then
    execute 'alter function edit_invoice_lines(uuid, jsonb, text) rename to edit_invoice_lines_unguarded';
    execute 'revoke all on function edit_invoice_lines_unguarded(uuid, jsonb, text) from public, anon, authenticated';
  end if;

  if to_regprocedure('edit_invoice_lines_unguarded(uuid, jsonb, text)') is not null then
    execute $fn$
      create or replace function edit_invoice_lines(p_invoice uuid, p_lines jsonb, p_note text default null)
      returns invoices language plpgsql security definer set search_path = public as $body$
      begin
        if auth_clinic() is null then raise exception 'not authenticated'; end if;
        -- الحارس الغائب سابقاً: تعديل بنود فاتورة يغيّر الإيراد والمخزون معاً.
        if auth_role() <> 'manager' then raise exception 'not allowed'; end if;
        return edit_invoice_lines_unguarded(p_invoice, p_lines, p_note);
      end $body$;
    $fn$;
    execute 'revoke all on function edit_invoice_lines(uuid, jsonb, text) from public, anon';
    execute 'grant execute on function edit_invoice_lines(uuid, jsonb, text) to authenticated';
  end if;
end $$;

-- ============================================================================
-- VERIFY:
--   -- كمدير، على فاتورة باسم زبون:
--   select amount_paid, total from invoices where id = '<INV>';
--   select correct_invoice_receipt('<INV>', 50000, 'الزبون دفع النص بس');
--   select amount_paid, total - amount_paid as due from invoices where id = '<INV>';
--   select jsonb_pretty(payment_details) from invoices where id = '<INV>';
--   -- كغير مدير: الاستدعاء نفسه يرفع not allowed.
-- ============================================================================
