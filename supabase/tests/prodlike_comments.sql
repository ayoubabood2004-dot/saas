-- ============================================================================
-- قالبُ الإنتاج قبل 0252: الدوالُّ التي تعيد 0252–0255 كتابتَها **بشِفرة المستودع حرفاً وتعليقاتٍ غائبة**.
--
-- قيس على الإنتاج (٣/١١): ١٢ دالّةً من ١٧ بصمتُها النصّيّة غيرُ نصّ المستودع، وكلُّها تُعاد بإعادة بناء جسم مصدرها
-- بحذف التعليق — سطراً كاملاً (update_purchase، return_invoice_items)، أو كلَّه (الباقي)، أو بنصّ مسودّةٍ أقدم
-- (pool_product: «حيّاً» بلا تشديد، و«تعديلَ جهازٍ آخر.» بسطرٍ واحد). فرفض 0252 أوّلَ تطبيقٍ بـdrift_body.
-- الحزمةُ تنزل 0252–0255 فوق هذه الحالة — كما ستنزل بالإنتاج — لا فوق نصّ المستودع الذي لا يوجد هناك.
--
-- والحذفُ هنا **بتعبيراتٍ نمطية مستقلّة** عن _drift_code (التي يفحصها هذا القالب): سطرُ تعليقٍ كامل، ثمّ تعليقٌ بآخر
-- سطرٍ بعد مسافة وبلا ' بعده (فلا يُلمس '-- +%s' داخل نصّ). الصلاحياتُ والمالكُ تبقى (create or replace).
-- ============================================================================
create schema if not exists dvtest;
create table if not exists dvtest.prodlike (sig text primary key, how text, before_fp text, after_fp text);
truncate dvtest.prodlike;

do $$
declare r record; v_def text; v_new text; v_fp text;
begin
  for r in select * from (values
      ('public.retail_checkout(jsonb,jsonb)', 'all'),
      ('public.edit_invoice_lines_unguarded(uuid,jsonb,text)', 'all'),
      ('public.product_movements(uuid,integer)', 'all'),
      ('public.deduct_stock_pooled(uuid,numeric,uuid)', 'all'),
      ('public.record_purchase(jsonb,jsonb)', 'all'),
      ('public.update_purchase(uuid,jsonb,jsonb)', 'lines'),
      ('public.return_invoice_items(uuid,jsonb,text,text)', 'lines'),
      ('public.restore_product(uuid)', 'all'),
      ('public.pool_product(uuid,uuid)', 'draft'),
      ('public.restore_company_section(uuid)', 'all'),
      ('public.stock_count_decide(uuid[],boolean)', 'all'),
      ('public.stock_count_submit(jsonb)', 'all')) v(sig, how)
  loop
    select md5(regexp_replace(prosrc, '[ \t\n\r\f\v]', '', 'g')) into v_fp from pg_proc where oid = to_regprocedure(r.sig);
    v_def := pg_get_functiondef(to_regprocedure(r.sig));
    v_new := case r.how
      when 'lines' then regexp_replace(v_def, '^[ \t]*--[^\n]*$', '', 'gn')
      when 'all'   then regexp_replace(regexp_replace(v_def, '^[ \t]*--[^\n]*$', '', 'gn'), '[ \t]+--[^\n'']*$', '', 'gn')
      else regexp_replace(regexp_replace(v_def, '\*\*حيّاً\*\*', 'حيّاً'), 'تعديلَ\s*\n\s*-- جهازٍ آخر بصمت\.', 'تعديلَ جهازٍ آخر.')
    end;
    execute v_new;
    insert into dvtest.prodlike values (r.sig, r.how, v_fp,
      (select md5(regexp_replace(prosrc, '[ \t\n\r\f\v]', '', 'g')) from pg_proc where oid = to_regprocedure(r.sig)));
  end loop;
end $$;
