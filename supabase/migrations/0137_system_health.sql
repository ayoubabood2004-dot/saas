-- ============================================================================
-- doctorVet — 0137: الأسقف تُقاس، فلا يفاجئنا سقفٌ بلغناه ونحن نايمون
--
-- ── لماذا ─────────────────────────────────────────────────────────────────
-- رفعنا حدود النظام (0134) وأغلقنا مسالكَ الضياع (0135–0136 والطابور). لكن
-- بقي نوعٌ من الأسقف **لا يُرفَع أبداً**، لأنه ليس منّا: سقفُ المزوّد وسقفُ
-- الجهاز — حجمُ القاعدة بالباقة، وعددُ الاتصالات، ومهلةُ الاستعلام.
--
-- وهذه لا تُصلَّح بهجرة، بل **تُرى قبل أن تُبلَغ**. والفرق بين إزعاجٍ ليومٍ
-- واحد وكارثةٍ أن تعرف وأنت على ٨٠٪ لا وأنت على ١٠٠٪: على ٨٠٪ عندك شهرٌ
-- لترقّي الباقة أو تكنس؛ وعلى ١٠٠٪ العيادات واقفة الآن.
--
-- ── وأخطرُها ما يحرس الحارس ───────────────────────────────────────────────
-- كنسُ التدقيق مجدولٌ بـpg_cron. ولو مات ذلك الجدول — أُعيد إنشاء المشروع،
-- أو أُلغيت المهمّة سهواً، أو تعثّرت مراراً — فلا شيء يشتكي: الجدول يكبر
-- بهدوء حتى يبلع الباقة. فنقيس **عمرَ أقدم صفّ** لا حجمَ الجدول: لو تجاوز
-- ٣٦٥ يوماً فالكنس ميّت، مهما بدا الحجم معقولاً اليوم. وكذلك مراجعُ النداءات
-- (0136) بسقف سبعة أيام.
--
-- أي أن هذه الدالّة تراقب المراقِبين، لا الأرقامَ وحدها.
--
-- ── المعايير بأسماء لاتينية ──────────────────────────────────────────────
-- المفاتيح ثابتةٌ لاتينية، والنصُّ المعروض يُترجَم بالواجهة بلغة المستخدم —
-- نفس قاعدة رسائل القيود: المعرّف للآلة، والجملة للإنسان بلغته.
--
-- ── والصلاحية ─────────────────────────────────────────────────────────────
-- ترى القاعدة كلَّها عبر كل العيادات، فهي لمشغّل المنصّة وحده. والحارس داخل
-- الدالّة لا بالمنح فقط: `security definer` تعني أن المنح وحده لا يكفي.
--
-- تراجع: drop function if exists system_health(int);
-- ============================================================================

create or replace function system_health(p_db_cap_mb int default 500)
returns table (
  metric  text,      -- معرّفٌ ثابت، تترجمه الواجهة
  value   numeric,   -- المستهلَك
  ceiling numeric,   -- السقف
  unit    text,      -- bytes | count | seconds | days
  pct     numeric    -- النسبة، مقرّبة لخانةٍ واحدة
)
language plpgsql
stable
security definer
set search_path to 'public', 'pg_catalog'
as $function$
declare
  v_cap_bytes numeric := p_db_cap_mb::numeric * 1024 * 1024;
  v_maxconn   numeric := coalesce(nullif(current_setting('max_connections', true), '')::numeric, 60);
  v_raw       text;
  v_timeout_s numeric;
begin
  if not is_platform_admin() then
    raise exception 'not allowed';
  end if;

  -- مهلةُ دور التطبيق لا مهلةُ جلستنا: سوبابيس يضبطها على الدور، والذي يهمّنا
  -- هو ما يقتل استعلامَ العيادة لا استعلامَنا نحن. وتُخزَّن نصّاً بوحدةٍ
  -- متغيّرة ('2min'، '120s'، '120000ms'، أو رقمٌ عارٍ يعني ملي ثانية) —
  -- فنفكّها صراحةً بدل قسمةٍ ذكيّة تُخطئ بحالةٍ واحدة بصمت.
  select split_part(s, '=', 2) into v_raw
  from pg_db_role_setting r, unnest(r.setconfig) s
  where r.setrole = 'authenticated'::regrole and s like 'statement_timeout=%'
  limit 1;

  v_timeout_s := case
    when v_raw is null      then 120                                        -- ما ضُبطت: افتراضُ سوبابيس
    when v_raw ~ 'ms$'      then (regexp_replace(v_raw, '\D', '', 'g'))::numeric / 1000
    when v_raw ~ 'min$'     then (regexp_replace(v_raw, '\D', '', 'g'))::numeric * 60
    when v_raw ~ 's$'       then (regexp_replace(v_raw, '\D', '', 'g'))::numeric
    when v_raw ~ '^\d+$'    then v_raw::numeric / 1000                      -- بلا وحدة = ملي ثانية
    else 120 end;

  return query
  with m(metric, value, ceiling, unit) as (
    -- ١) حجم القاعدة بالباقة. بلوغُه يوقف الكتابة على كل العيادات معاً.
    select 'db_size', pg_database_size(current_database())::numeric, v_cap_bytes, 'bytes'
    -- ٢) الاتصالات. بلوغُها يرفض اتصالاً جديداً — أي «التطبيق ما يفتح».
    union all
    select 'connections', (select count(*)::numeric from pg_stat_activity), v_maxconn, 'count'
    -- ٣) أطولُ استعلامٍ شغّال الآن مقابل المهلة. اقترابُه يعني تقريراً على
    --    وشك أن يُقتل بمنتصفه.
    union all
    select 'longest_query',
           coalesce((select max(extract(epoch from (now() - query_start)))::numeric
                     from pg_stat_activity
                     where state = 'active' and query_start is not null
                       and pid <> pg_backend_pid()), 0),
           v_timeout_s, 'seconds'
    -- ٤) سجلّ التدقيق: أسرعُ الجداول نمواً، ونصفُ القاعدة يوم قِيس أوّلَ مرّة.
    union all
    select 'audit_log_size',
           coalesce(pg_total_relation_size(to_regclass('public.audit_log'))::numeric, 0),
           v_cap_bytes, 'bytes'
    -- ٥) **تأخُّرُ الكنس** — نبضُ الجدولة، وأهمُّ رقمٍ هنا.
    --
    --    ولا نقيس «عمرَ أقدم صفّ»: الاحتفاظ مُتدرّج (٩٠ يوماً للحركة اليومية،
    --    و٣٦٥ لأثر المال — هجرة 0129)، فأقدمُ صفٍّ يقترب من السنة **بالتصميم**
    --    ويبقى هناك. مقياسٌ كهذا يصرخ كل يوم بعد السنة الأولى، فيُطفأ ويُهمَل،
    --    فلا يُسمَع يوم يصير الصراخ حقيقياً.
    --
    --    فنقيس بدلَه: كم يوماً **تجاوز** أقدمُ صفٍّ نافذتَه هو. الكنس يوميّ،
    --    فالصحيح صفرٌ أو قريبٌ منه مهما كبر عمرُ النظام؛ والرقم لا يتحرّك إلا
    --    إذا توقّفت الجدولة فعلاً. سبعةُ أيامٍ سقفاً = أسبوعٌ بلا كنس.
    union all
    select 'audit_purge_lag',
           coalesce((select max(greatest(0,
                       extract(epoch from (now() - created_at)) / 86400
                       - case when entity is not null and entity = any (array[
                           'invoices','invoice_items','purchases','purchase_items',
                           'purchase_payments','expenses','products','delivery_orders','store_orders'])
                         then 365 else 90 end))::numeric
                     from audit_log), 0),
           7, 'days'
    -- ٦) ونفسُه لمراجع النداءات (0136): نافذتها سبعة أيام.
    union all
    select 'rpc_refs_purge_lag',
           coalesce((select max(greatest(0,
                       extract(epoch from (now() - created_at)) / 86400 - 7))::numeric
                     from rpc_refs), 0),
           7, 'days'
    -- ٧) بئرُ الأرقام التسلسلية للحيوانات (0126): ٩٠ ألفاً بخمس خانات
    --    و٩٠٠ ألف بستّ. نضوبُها لا يُفشل شيئاً (الدالّة تنتقل لصيغة 'P…')
    --    لكنه يغيّر شكلَ الأرقام، فيُرى قبل أن يُفاجئ.
    union all
    select 'pet_serials', (select count(*)::numeric from pets), 990000, 'count'
  )
  select m.metric, m.value, m.ceiling, m.unit,
         round(case when m.ceiling > 0 then m.value * 100 / m.ceiling else 0 end, 1)
  from m
  order by 5 desc;   -- الأقربُ للسقف أوّلاً
end $function$;

revoke all on function system_health(int) from public, anon;
grant execute on function system_health(int) to authenticated;
