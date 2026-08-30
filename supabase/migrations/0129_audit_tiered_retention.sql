-- ============================================================================
-- doctorVet — 0129: الاحتفاظ بطبقتين — المال يعيش سنة، والباقي تسعين يوماً
--
-- 0127 خلّت الاحتفاظ ٣٠ يوماً لكل شيء بالتساوي، وهذا غلط سويناه بحسن نيّة:
-- سوّى بين أثرِ تعديلِ فاتورة وأثرِ فتحِ صفحة. والأول دليلٌ يُسأل عنه بعد
-- شهور، والثاني ضجيجٌ ينتهي بيومه.
--
-- والكلفة ليست متماثلة أصلاً: تعديل الفواتير والمشتريات **نادر** — بضعة
-- صفوفٍ بالشهر — بينما الحركة اليومية تكتب مئات الصفوف يومياً. فتمديدُ
-- المدّة للجميع يضخّم الضجيج ألف ضعف ليحفظ الدليل، والفصلُ يحفظ الدليل
-- سنةً كاملة بكلفةٍ تكاد لا تُقاس.
--
-- ما الذي يعيش سنة: كل ما يمسّ مالاً أو مخزوناً — الفواتير وبنودها،
-- المشتريات وبنودها ودفعاتها، المصاريف، المنتجات (السعر والرصيد)،
-- وطلبات التوصيل والمتجر. وما عداه تسعون يوماً.
--
-- ملاحظةٌ تخصّ تصحيح التحصيل: أثرُه **ليس هنا أصلاً**. `correct_invoice_receipt`
-- (هجرة 0113) تكتب سطراً سالباً داخل `invoices.payment_details` نفسها — فيه
-- المبلغ والطريقة والوقت والسبب — فهو جزءٌ من الفاتورة لا من دفتر التدقيق،
-- ولا يمسّه أي كنسٍ مهما طال الزمن. الذي يحميه هذا الملفّ هو أثرُ **تعديل
-- البنود** (`edit_invoice_lines`)، وهو وحده الذي كان يعتمد على سجلّ التدقيق.
--
-- التوقيع يبقى `purge_audit_log(int)` صالحاً بنداءٍ واحد، فوظيفةُ pg_cron
-- المجدولة (`select public.purge_audit_log(30)`) تشتغل كما هي بلا تعديل —
-- والرقم الممرَّر يصير مدّةَ الضجيج، والمال له مدّتُه المستقلّة.
--
-- تراجع: أعد تشغيل 0127 (ترجّع الدالّة ذات المدّة الواحدة).
-- ============================================================================

-- التوقيع تغيّر (بارامتر ثانٍ)، فنسقط القديم أولاً — وإلا بقي الاثنان
-- و`purge_audit_log(30)` نادى القديم ذا المدّة الواحدة.
drop function if exists public.purge_audit_log(int);

create or replace function public.purge_audit_log(
  p_days       int default 90,    -- الضجيج اليوميّ
  p_days_money int default 365    -- ما يمسّ مالاً أو مخزوناً
)
returns bigint
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  n_noise bigint;
  n_money bigint;
  money_entities constant text[] := array[
    'invoices', 'invoice_items',
    'purchases', 'purchase_items', 'purchase_payments',
    'expenses', 'products',
    'delivery_orders', 'store_orders'
  ];
begin
  if p_days is null or p_days < 7 then
    raise exception 'purge_audit_log: مدّة الاحتفاظ لازم ٧ أيام فأكثر (وصلت %)', p_days;
  end if;
  -- المال ما ينكنس أقصر من الضجيج بأي حال — حارسٌ ضدّ قلب الرقمين سهواً.
  if p_days_money is null or p_days_money < p_days then
    raise exception 'purge_audit_log: مدّة المال (%) لازم ما تقلّ عن مدّة الباقي (%)', p_days_money, p_days;
  end if;

  -- `entity <> all (…)` وحدها تُسقط الصفوفَ ذات الكيان الفارغ: المقارنة معه
  -- تعطي NULL لا true، فتبقى تلك الصفوف بالجدول للأبد. الفحصُ الصريح يشملها.
  delete from public.audit_log
  where (entity is null or entity <> all (money_entities))
    and created_at < now() - make_interval(days => p_days);
  get diagnostics n_noise = row_count;

  delete from public.audit_log
  where entity = any (money_entities)
    and created_at < now() - make_interval(days => p_days_money);
  get diagnostics n_money = row_count;

  return n_noise + n_money;
end $$;

revoke all on function public.purge_audit_log(int, int) from public, anon, authenticated;

-- المعاينة تتبع نفس القسمة، وتفصّل الطبقتين حتى يُقرأ الأثر قبل حذفه.
create or replace function public.audit_log_preview(
  p_days int default 90, p_days_money int default 365
)
returns table (
  tier text, would_delete bigint, would_keep bigint, oldest timestamptz, newest timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with e as (
    select created_at,
           entity = any (array['invoices','invoice_items','purchases','purchase_items',
                               'purchase_payments','expenses','products',
                               'delivery_orders','store_orders']) as is_money
    from public.audit_log
  )
  select
    case when is_money then 'مال ومخزون' else 'حركة يومية' end,
    count(*) filter (where created_at <  now() - make_interval(days => case when is_money then p_days_money else p_days end)),
    count(*) filter (where created_at >= now() - make_interval(days => case when is_money then p_days_money else p_days end)),
    min(created_at), max(created_at)
  from e group by is_money order by 1;
$$;

revoke all on function public.audit_log_preview(int, int) from public, anon, authenticated;

-- المعاينة القديمة ذات البارامتر الواحد ما عادت تعكس السياسة، فتُسقَط حتى
-- لا يقرأ أحدٌ رقماً صار كاذباً.
drop function if exists public.audit_log_preview(int);

-- الفهرس المركّب يخدم شرطَي الكنس معاً (نوع الكيان ثم العمر)، فالكنس الليلي
-- يمسّ ما سيحذفه وحده بدل مسحٍ كامل.
create index if not exists audit_log_entity_created_idx on audit_log (entity, created_at);
