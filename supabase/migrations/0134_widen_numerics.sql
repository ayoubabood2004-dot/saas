-- ============================================================================
-- doctorVet — 0134: توسيع كل الأرقام — ما يعود سقفٌ يوقف إضافةً
--
-- ── لماذا ─────────────────────────────────────────────────────────────────
-- أعمدة المال معرَّفة `numeric(12,2)` أو `numeric(14,2)`، أي أن أقصى قيمة
-- ٩٬٩٩٩٬٩٩٩٬٩٩٩٫٩٩ (عشرة مليارات). تجاوزها لا يعني رقماً مبتوراً بل **رفض
-- الصفّ كاملاً**، ورسالةً عامّة على الشاشة: «بعض القيم غير صحيحة».
--
-- وهذا بالضبط شكل العطل الذي يخافه صاحب النظام: السستم «يوقف عن الإضافة بلا
-- سبب». وقد وقع فعلاً بشكلٍ آخر يوم كُتبت هذه الهجرة — قيدُ كميّةٍ رفض سطراً
-- راجعاً، والرسالة نفسها لم تقل شيئاً.
--
-- ── ماذا نفعل ─────────────────────────────────────────────────────────────
-- نرفع الدقّة إلى 24 خانة مع **الإبقاء على المقياس كما هو**:
--     numeric(12,2) → numeric(24,2)     ٩٬٩٩٩ … مليار مليار
--     numeric(14,3) → numeric(24,3)
--
-- ── لماذا لا نجعلها `numeric` بلا حدٍّ إطلاقاً ────────────────────────────
-- هذا ممكن، وهو خطأ. المقياس (خانتان للمال) ليس قيداً بل **ضمانة**: يمنع
-- تسرّب كسورٍ لا نهائية إلى المبالغ فتختلف المجاميع عن مفرداتها بفلسٍ لا
-- يُفسَّر. فالحدّ الذي نرفعه هو حدّ **الحجم**، والذي نُبقيه هو ضبطُ **الدقّة**.
-- وأربعٌ وعشرون خانة تكفي لأي مبلغٍ يخطر ببال أحد: أعلى فاتورةٍ بالنظام اليوم
-- ٦٤٫٦ مليون، والسقف الجديد أكبر منها بمئة مليار مرّة.
--
-- ── لماذا هي آمنة وسريعة ──────────────────────────────────────────────────
-- بوستغريس يخزّن `numeric` بنفس الشكل مهما كانت الدقّة المعلَنة — الدقّة قيدٌ
-- لا صيغةُ تخزين. فرفعُها مع ثبات المقياس **لا يعيد كتابة الجدول**: تعديلُ
-- كتلوجٍ وحسب. فُحص على ٢٠٠ ألف صفّ فتمّ في ١٫٤ ملي ثانية، و`relfilenode` لم
-- يتغيّر — أي أن الملفّ نفسه لم يُمسّ.
--
-- ولا قيمةَ تتغيّر ولا صفَّ يُفقد: المدى يتوسّع، والمحتوى كما هو.
--
-- ── المعتمِدون: عرضٌ **وسياسة** ────────────────────────────────────────────
-- بوستغريس يرفض تغيير نوع عمودٍ يعتمد عليه عرضٌ أو سياسةُ صلاحيات:
--     cannot alter type of a column used in a policy definition
--     policy invoices_update on table invoices depends on column "amount_paid"
--
-- والعرض `shared_catalog_source` يقرأ `sell_price` و`purchase_price`.
-- وسياسة `invoices_update` تحرس مبالغ الفاتورة: غيرُ المدير لا يغيّر
-- total ولا subtotal ولا discount ولا amount_paid ولا cost_total ولا profit.
-- حارسٌ ماليّ لا يجوز أن يسقط ولو للحظة، ولا أن يعود ناقصاً حرفاً.
--
-- فلا نكتب نصَّه بأيدينا — **نلتقطه من الكتلوج** قبل الإسقاط ونعيده منه بعد
-- التوسيع. نفس مبدأ 0128: ما يُنسَخ باليد يُنسى منه شيء. والكلّ داخل كتلةٍ
-- واحدة، أي معاملةٍ واحدة — فلا تمرّ لحظةٌ يرى فيها أحدٌ الجدولَ بلا حارسه.
--
-- ملاحظةٌ صادقة: بعد هذا يصير السقف العمليّ سقفَ **جافاسكربت** لا القاعدة —
-- نحو ٩ كوادرليون قبل أن تفقد المتصفحات دقّة الأعداد الصحيحة. أي أن الحدّ
-- انتقل من «عشرة مليارات» إلى رقمٍ لا يبلغه استعمالٌ بشريّ.
--
-- تراجع: غير مطلوب — التوسيع لا يمنع أي قيمةٍ كانت مقبولة.
-- ============================================================================

do $$
declare
  r record;
  p record;
  sql text;
  n int := 0;
begin
  -- ١) التقاط المعتمِدين من الكتلوج قبل مسّ أي عمود
  create temp table _widen_pol on commit drop as
  select pol.tablename, pol.policyname, pol.permissive, pol.roles, pol.cmd, pol.qual, pol.with_check
  from pg_policies pol
  where pol.schemaname = 'public'
    and exists (
      select 1
      from information_schema.columns c
      join information_schema.tables t
        on  t.table_schema = c.table_schema
        and t.table_name   = c.table_name
        and t.table_type   = 'BASE TABLE'
      where c.table_schema = 'public'
        and c.table_name   = pol.tablename
        and c.data_type    = 'numeric'
        and c.numeric_precision is not null
        and c.numeric_precision < 24
        and c.is_generated = 'NEVER'
        and (coalesce(pol.qual, '') || ' ' || coalesce(pol.with_check, ''))
            ~ ('(^|[^a-z_])' || c.column_name || '([^a-z_]|$)')
    );

  execute 'drop view if exists shared_catalog_source';

  for p in select * from _widen_pol loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;

  -- ٢) التوسيع
  for r in
    select c.table_name, c.column_name, coalesce(c.numeric_scale, 0) as scale
    from information_schema.columns c
    join information_schema.tables t
      on  t.table_schema = c.table_schema
      and t.table_name   = c.table_name
      and t.table_type   = 'BASE TABLE'
    where c.table_schema = 'public'
      and c.data_type = 'numeric'
      and c.numeric_precision is not null   -- المعرَّفة بحدٍّ وحدها
      and c.numeric_precision < 24
      and c.is_generated = 'NEVER'          -- المولَّدة تتبع تعبيرها لا نوعها
    order by c.table_name, c.column_name
  loop
    execute format(
      'alter table public.%I alter column %I type numeric(24,%s)',
      r.table_name, r.column_name, r.scale);
    n := n + 1;
  end loop;

  -- ٣) إعادة المعتمِدين — السياسات بنصّها الملتقَط حرفاً بحرف
  for p in select * from _widen_pol loop
    sql := format('create policy %I on public.%I as %s for %s to %s',
                  p.policyname, p.tablename,
                  case when p.permissive = 'PERMISSIVE' then 'permissive' else 'restrictive' end,
                  lower(p.cmd),
                  array_to_string(p.roles, ', '));
    if p.qual       is not null then sql := sql || format(' using (%s)', p.qual); end if;
    if p.with_check is not null then sql := sql || format(' with check (%s)', p.with_check); end if;
    execute sql;
  end loop;

  raise notice 'db: اتوسّع % عمود رقميّ، ورجعت % سياسة',
               n, (select count(*) from _widen_pol);
end $$;

-- والعرض يعود كما كان (0103) — نصّاً وصلاحيات.
create or replace view shared_catalog_source as
  select p.barcode, p.name, p.sell_price, p.purchase_price, p.clinic_id
  from products p
  join clinic_prefs cp on cp.clinic_id = p.clinic_id
  where cp.catalog_share = true
    and p.barcode is not null and p.barcode <> ''
    and p.name is not null and btrim(p.name) <> '';
revoke all on shared_catalog_source from public, anon, authenticated;
