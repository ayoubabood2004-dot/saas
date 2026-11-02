-- ============================================================================
-- ٠٢٥٦ — الأرباح والخسائر شهراً بشهر: القاعدةُ تجمع، والمتصفّحُ يعرض — بلا تعريفٍ جديدٍ لأيّ رقم
--
-- ── الجذر ────────────────────────────────────────────────────────────────
-- الأرقامُ كلُّها موجودةٌ ومتفرّقة: ربحُ المبيعات بالتقارير (Σ profit لفواتير المدّة غير المرجّعة، بيوم البيع)،
-- وكلفةُ مستهلكات الخدمات بدفتر 0252، والتلفُ والسحوباتُ بجداولها (0216، 0227). ولا صفحةَ تضعها بسطورٍ منفصلة
-- لشهرٍ واحد — فمن يريد «ربح الشهر بعد المصاريف» يجمعها بيده من ثلاث شاشات، أو يطرح المشتريات وهي مخزنٌ لا مصروف
-- (مشكلةُ الـ١٠ ملايين: كفوفُ عشرة أشهر تُطرح بشهر شرائها).
--
-- ── القرار (المالك، ٢/١١: «ابنيها بالطريقة العادية مالتنا لا تغير شيء منها») ─────────────
-- كلُّ سطرٍ قراءةٌ لما يُسجَّل اليوم، بتعريفه القائم:
-- • المبيعات والكلفة وربحُ المبيعات: فواتيرُ المدّة بيوم البيع (created_at) غيرُ المرجّعة — Σ total وΣ cost_total
--   وΣ profit، كتبويب «المال» بالتقارير حرفاً (AnalyticsHub: invInRange ثمّ status <> refunded). فربحُ المبيعات هنا هو
--   «صافي الربح» هناك. والخصمُ على الدين (0241) والمرتجعُ المربوط (0121) يُنزلان الفاتورةَ نفسَها يومَ بيعها — داخلَها.
-- • الكلفةُ مقسومة: المواد المباعة Σ round(qty × unit_cost, 2) لسطور المادّة؛ مستهلكاتُ الخدمات Σ value بدفتر 0252
--   لفواتير المدّة؛ والباقي «كلفة الخدمات الثابتة وغيرها». و«تسويات فواتير قديمة» = ربحٌ مسجَّل − (مبيعات − كلفة):
--   صفرٌ لكلّ فاتورةٍ يكتبها كاتبٌ اليوم (profit = total − cost_total)، ويُرى إن خالف صفٌّ قديم — لا يُطمس بغيره.
-- • السحوباتُ بجداولها كما يجمعها bucketOf (expenseCategoryRules.ts) حرفاً: التصنيفُ بمعرّفه، ثمّ «سحب مخزن» بطريقته
--   stock، ثمّ نصوصُ النظام بـinv_norm_group (مرتجع، payroll، payroll_loan، سحب مخزن)، وإلا «بدون تصنيف» — بيوم spent_at.
--   كلُّ جدولٍ يُقرَّب لفلسٍ بشهره (amount عمودٌ بلا مقياس)، والمجموعُ مجموعُ الجداول المقرَّبة: السطورُ تُجمع على الشاشة.
--   والمرتجعُ بلا فاتورة (0132، «مرتجع») سطرُه بنفسه: فلوسٌ رجعت والبضاعةُ للرفّ وكلفتُها لم تُسجَّل — الواجهةُ تقولها.
-- • الصافي = ربحُ المبيعات − مجموعُ السحوبات. والمشترياتُ خارجه: مخزنٌ يُكلَّف حين يُباع أو يُصرف (0252/0255). كيف
--   تُعامَل كمياتُ الشراء الكبيرة قرارٌ مؤجَّلٌ للمالك — هذه الهجرة لا تقرّره.
-- • الشهرُ بتوقيت الجهاز (p_tz؛ اسمٌ لا يعرفه pg_timezone_names ⇒ بغداد، كـ0242)، والمدّةُ مغلقةٌ بطرفيها كتقارير 0149،
--   وحدُّها ٤٠٠ يوم — تقريرٌ عن سنواتٍ يُقسَم ولا يمسح الجداولَ كلَّها بنداءٍ واحد.
--
-- ── الصلاحية ─────────────────────────────────────────────────────────────
-- definer لا invoker: سحوباتٌ لا يقرؤها دورٌ بسياستها كانت سترجع صفراً بصمت، فيصير الصافي منفوخاً — قائمةٌ ناقصة
-- تُصدَّق. فالدالّةُ تقرأ كلَّ شيءٍ بعيادة auth_clinic() وحدها (بالنصّ: clinic_id = v_clinic بكلّ جدول)، وتسأل
-- staff_can('viewProfits') بنفسها — المدير، أو من أعطاه المديرُ الإذنَ صراحةً، نفسُ قالب الواجهة — والمصوّرُ أبداً
-- (بالدور الأساس، 0222؛ تُسأل بـexecute لأن تراجعَ 0222 يحذفها). ومشغّلُ المنصّة داخلَ عيادة يقرأ كمديرٍ بلا أثر (0151).
--
-- ── المرآة ───────────────────────────────────────────────────────────────
-- src/lib/pnl.ts (computePnl) تحسب الشيءَ نفسَه بالفلس الصحيح للتجريبيّ، وتطابقُهما الحزمةُ بقالبٍ مولَّد (pnl-parity).
--
-- إضافيّةٌ وتُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0255 (تقرأ invoice_consumption من 0252)، **وقبل الواجهة**.
-- تراجع: drop function if exists public.report_pnl(timestamptz, timestamptz, text);
-- ============================================================================

create or replace function public.report_pnl(p_from timestamptz, p_to timestamptz, p_tz text default 'Asia/Baghdad')
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_ph     boolean := false;
  v_can    boolean := false;
  v_tz     text;
  v_out    jsonb;
begin
  if v_clinic is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;
  -- كلاهما من 0222 ويُسألان بـexecute (كـservice_recipe_set، 0252): تراجعُ 0222 يحذفهما، ونداءٌ ثابتٌ يرمي «لا توجد»
  -- بدل الجواب. وبلا staff_can لا قالبَ أذونات بالقاعدة — فالمديرُ وحده، كما كان قبل 0222.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_ph;
  end if;
  if to_regprocedure('public.staff_can(text)') is not null then
    execute 'select public.staff_can($1)' into v_can using 'viewProfits';
  else
    v_can := coalesce(auth_role(), '') = 'manager';
  end if;
  if coalesce(v_ph, false) or not coalesce(v_can, false) then
    raise exception 'pnl_forbidden' using errcode = '42501',
      hint = 'تقرير الأرباح والخسائر لمن يشوف الأرباح — اطلبه من المدير';
  end if;
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'pnl_range' using hint = 'اختر مدّة صحيحة — البداية قبل النهاية';
  end if;
  if p_to - p_from > interval '400 days' then
    raise exception 'pnl_range_long' using hint = 'المدّة أطول من سنة وشهر — قسّمها لفترتين';
  end if;
  -- اسمُ التوقيت المعتمد كما يكتبه pg_timezone_names (بلا حساسية حروف)، وإلا بغداد — كـpnlTz بالمرآة.
  select z.name into v_tz from pg_timezone_names z where lower(z.name) = lower(btrim(coalesce(p_tz, ''))) limit 1;
  v_tz := coalesce(v_tz, 'Asia/Baghdad');

  with inv as (
    select i.id, coalesce(i.total, 0) as total, coalesce(i.profit, 0) as profit, coalesce(i.cost_total, 0) as cost_total,
           to_char(i.created_at at time zone v_tz, 'YYYY-MM') as m
      from invoices i
     where i.clinic_id = v_clinic and coalesce(i.status, 'paid') <> 'refunded'
       and i.created_at >= p_from and i.created_at <= p_to
  ),
  inv_m as (
    select m, count(*)::int as n, sum(total) as revenue, sum(cost_total) as cogs, sum(profit) as gross
      from inv group by m
  ),
  prod_m as (
    select v.m, sum(round(coalesce(ii.qty, 0) * coalesce(ii.unit_cost, 0), 2)) as c
      from inv v
      join invoice_items ii on ii.invoice_id = v.id and ii.clinic_id = v_clinic
     where ii.product_id is not null
     group by v.m
  ),
  mat_m as (
    select v.m, sum(c.value) as c
      from inv v
      join invoice_consumption c on c.invoice_id = v.id and c.clinic_id = v_clinic
     group by v.m
  ),
  ex as (
    select to_char(e.spent_at at time zone v_tz, 'YYYY-MM') as m,
           case when e.category_id is not null then 'cat'
                when e.method = 'stock' then 'stock'
                when inv_norm_group(e.category) = inv_norm_group('مرتجع') then 'returns'
                when inv_norm_group(e.category) = inv_norm_group('payroll') then 'payroll'
                when inv_norm_group(e.category) = inv_norm_group('payroll_loan') then 'payroll_loan'
                when inv_norm_group(e.category) = inv_norm_group('سحب مخزن') then 'stock'
                else 'none' end as b,
           e.category_id as cid, e.amount
      from expenses e
     where e.clinic_id = v_clinic and e.spent_at >= p_from and e.spent_at <= p_to
  ),
  ex_m as (   -- كلُّ جدولٍ بشهره مقرَّبٌ لفلس
    select m, b, cid, round(sum(amount), 2) as a from ex group by m, b, cid
  ),
  months as (
    select m from inv_m union select m from ex_m
  ),
  cat_ord as (   -- ترتيبُ groupWithdrawals: بإنشاء التصنيف ثمّ بمعرّفه، والمجهولُ بعدها
    select x.cid, c.name, c.created_at
      from (select distinct cid from ex_m where b = 'cat') x
      left join expense_categories c on c.id = x.cid and c.clinic_id = v_clinic
  ),
  rows as (
    select ms.m,
           coalesce(i.n, 0) as n, coalesce(i.revenue, 0) as revenue, coalesce(i.cogs, 0) as cogs,
           coalesce(i.gross, 0) as gross, coalesce(p.c, 0) as cp, coalesce(t.c, 0) as cm,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'stock'), 0)        as stock,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'returns'), 0)      as returns,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll'), 0)      as payroll,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'payroll_loan'), 0) as loan,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m and x.b = 'none'), 0)         as none,
           coalesce((select sum(x.a) from ex_m x where x.m = ms.m), 0)                          as ex_total
      from months ms
      left join inv_m  i on i.m = ms.m
      left join prod_m p on p.m = ms.m
      left join mat_m  t on t.m = ms.m
  )
  select jsonb_build_object(
    'months', coalesce((
      select jsonb_agg(jsonb_build_object(
               'month', r.m, 'invoices', r.n, 'revenue', r.revenue, 'cogs', r.cogs,
               'cogs_products', r.cp, 'cogs_materials', r.cm, 'cogs_other', r.cogs - r.cp - r.cm,
               'gross', r.gross, 'adjust', r.gross - (r.revenue - r.cogs),
               'stock_loss', r.stock, 'returns', r.returns, 'payroll', r.payroll, 'payroll_loan', r.loan,
               'uncategorized', r.none,
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', x.a)
                                   order by o.created_at nulls last, o.cid)
                    from ex_m x join cat_ord o on o.cid = x.cid
                   where x.m = r.m and x.b = 'cat'), '[]'::jsonb),
               'expenses', r.ex_total, 'net', r.gross - r.ex_total)
             order by r.m)
        from rows r), '[]'::jsonb),
    'total', (
      select jsonb_build_object(
               'invoices', coalesce(sum(r.n), 0), 'revenue', coalesce(sum(r.revenue), 0), 'cogs', coalesce(sum(r.cogs), 0),
               'cogs_products', coalesce(sum(r.cp), 0), 'cogs_materials', coalesce(sum(r.cm), 0),
               'cogs_other', coalesce(sum(r.cogs - r.cp - r.cm), 0),
               'gross', coalesce(sum(r.gross), 0), 'adjust', coalesce(sum(r.gross - (r.revenue - r.cogs)), 0),
               'stock_loss', coalesce(sum(r.stock), 0), 'returns', coalesce(sum(r.returns), 0),
               'payroll', coalesce(sum(r.payroll), 0), 'payroll_loan', coalesce(sum(r.loan), 0),
               'uncategorized', coalesce(sum(r.none), 0),
               'categories', coalesce((
                  select jsonb_agg(jsonb_build_object('id', o.cid, 'name', o.name, 'amount', s.a)
                                   order by o.created_at nulls last, o.cid)
                    from (select cid, sum(a) as a from ex_m where b = 'cat' group by cid) s
                    join cat_ord o on o.cid = s.cid), '[]'::jsonb),
               'expenses', coalesce(sum(r.ex_total), 0), 'net', coalesce(sum(r.gross - r.ex_total), 0))
        from rows r))
    into v_out;
  return v_out;
end $$;
revoke all on function public.report_pnl(timestamptz, timestamptz, text) from public, anon;
grant execute on function public.report_pnl(timestamptz, timestamptz, text) to authenticated;
comment on function public.report_pnl(timestamptz, timestamptz, text) is
  'الأرباح والخسائر شهراً بشهر (0256): مبيعاتُ المدّة بيوم البيع وكلفتُها مقسومة، ثمّ السحوباتُ بجداولها، ثمّ الصافي. لمن له viewProfits، والمصوّرُ أبداً. مرآتُه src/lib/pnl.ts.';
