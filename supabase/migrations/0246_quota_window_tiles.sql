-- ============================================================================
-- 0246 — نافذةُ الحصّة الشهرية تتلاصق بلا فجوةٍ ولا تداخل، والآنُ داخلها دائماً
--
-- 0105 تحسب «الشهرَ الجاري» quota_start + N شهراً، وN من age(now(), quota_start)،
-- والنهايةَ (البداية + شهر). وكلاهما يخون عيادةً بدأت حصّتُها يوم ٢٩ أو ٣٠ أو ٣١:
--
--   ١) النهايةُ تُحسب من بدايةٍ مقصوصة: بدايةُ ٢٨ شباط + شهر = ٢٨ آذار، والتجديدُ
--      الحقيقيّ ٣١ آذار. فـperiod_end ماضٍ من ١ إلى ٣ أيام قبل كلّ تجديد يقع بعد
--      شهرٍ قصير — العدُّ فيها صحيح والتاريخُ كاذب (وهو الذي أطفأ الواتساب على
--      آيفون حتى صحّحت quotas.ts قراءتَه).
--   ٢) age() تستلف أيامَ شهر البداية، فيومَ الذكرى المقصوصة (٢٨ شباط، ٣٠ نيسان…)
--      لا تتقدّم N إلا بمنتصف ليل UTC: من ساعة الذكرى حتى منتصف الليل لا يتصفّر
--      العدّاد. يعدّ الشهرَ الماضي كلَّه مع ما بعد الذكرى، فعيادةٌ استنفدت حصّتها
--      تُمنع ساعاتٍ بعد بدء شهرها الجديد، وما تضيفه فيها يُحسب على الشهرين.
--
-- مقيسٌ بـPGlite (كلُّ بداية بأيام ٢٨–٣١ من ٢٠٢٦ بساعة ١٠:٠٠، كلَّ ساعة لـ٢٤ شهراً):
-- يوم ٢٨ سليم؛ ٢٩ ≈ يومٌ بالسنة خارج النافذة؛ ٣٠ ≈ يومان؛ ٣١ ≈ تسعةٌ ونصف — منها
-- ساعاتُ العدّاد المتأخّر (٢) من الذكرى حتى منتصف ليل UTC، بطولٍ يتبع ساعة البداية.
-- وبالإنتاج (١٩/١٠، عدٌّ للقراءة): ٥ اشتراكاتٍ لها quota_start ولا واحدةَ بيوم ٢٨–٣١،
-- لكنّ كلَّ تفعيلٍ يكتب quota_start = now()، فأوّلُ تفعيلٍ بيوم ٢٩–٣١ يقع فيها.
--
-- ── التعريف ─────────────────────────────────────────────────────────────────
-- الذكرى k = quota_start + k شهر، **من الأصل دائماً** لا من الذكرى السابقة، فيقصّها
-- بوستغريس لآخر يوم الشهر ويرجع لليوم الأصليّ بعده (٣١ ك٢ + ١ = ٢٨ شباط، + ٢ = ٣١ آذار).
-- والنافذةُ k = [الذكرى k، الذكرى k+1). كلُّ ذكرى بشهرٍ بعد سابقتها، فالذكرياتُ متزايدة
-- تماماً والنوافذُ تتلاصق. وk = فرقُ الأشهر بالتقويم، ناقصَ واحد إن لم تحلّ ذكرى هذا الشهر
-- بعد — بلا age() ولا استلاف. واشتراكٌ مستقبليّ كما كان: [quota_start، +شهر).
--
-- والحسابُ بـUTC صراحةً: هو توقيتُ جلسة الإنتاج نفسُه (مقيس، بلا تجاوزٍ لأيّ دور)، فلا
-- تتحرّك حدودُ أيّ عيادة، ولا تتبدّل النتيجةُ بتوقيت جلسةٍ أخرى. فنسختا (البداية، اللحظة)
-- ثابتتان حقّاً (immutable) وتُفحصان بأيّ لحظة. ونسختا المعامل الواحد — التي تناديها
-- clinic_quota_usage وenforce_pet_limit وadmin_list_subscriptions — غلافٌ على now()،
-- و`stable` لا `immutable`: دالّةٌ تقرأ now() ليست ثابتة، ووسمُها ثابتةً يأذن للمخطِّط
-- بطيّ نتيجتها مرّةً واحدة.
--
-- لا شيء يُكتب ولا يُحذف. نصُّ العدّ بالدوالّ الثلاث (>= period_start) كما هو؛ يتغيّر أن
-- البدايةَ صحيحةٌ من ساعة الذكرى المقصوصة، وأن period_end تاريخُ التجديد الحقيقيّ.
--
-- تراجع: أعد تعريفَي 0105 ثم `alter function … set search_path = public` (كما 0163)،
-- ثم drop function quota_period_start(timestamptz, timestamptz),
--                  quota_period_end(timestamptz, timestamptz).
-- ============================================================================

/** بدايةُ نافذة الحصّة التي تحوي اللحظة p_at. */
create or replace function quota_period_start(p_start timestamptz, p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select case
    when p_start is null then '-infinity'::timestamptz
    else (s + make_interval(months => k)) at time zone 'UTC'
  end
  from (select s, greatest(0, n - (s + make_interval(months => n) > a)::int) as k
          from (select s, a, ((extract(year from a) - extract(year from s)) * 12
                              + extract(month from a) - extract(month from s))::int as n
                  from (select p_start at time zone 'UTC' as s, p_at at time zone 'UTC' as a) t) u) v;
$$;

/** نهايتُها = الذكرى التالية — تعرضها الواجهة «يتجدد بتاريخ …». */
create or replace function quota_period_end(p_start timestamptz, p_at timestamptz)
returns timestamptz
language sql
immutable
set search_path = public
as $$
  select (s + make_interval(months => k + 1)) at time zone 'UTC'
  from (select s, greatest(0, n - (s + make_interval(months => n) > a)::int) as k
          from (select s, a, ((extract(year from a) - extract(year from s)) * 12
                              + extract(month from a) - extract(month from s))::int as n
                  from (select p_start at time zone 'UTC' as s, p_at at time zone 'UTC' as a) t) u) v;
$$;

create or replace function quota_period_start(p_start timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$ select quota_period_start(p_start, now()) $$;

create or replace function quota_period_end(p_start timestamptz)
returns timestamptz
language sql
stable
set search_path = public
as $$ select quota_period_end(p_start, now()) $$;

grant execute on function quota_period_start(timestamptz, timestamptz) to authenticated;
grant execute on function quota_period_end(timestamptz, timestamptz) to authenticated;
grant execute on function quota_period_start(timestamptz) to authenticated;
grant execute on function quota_period_end(timestamptz) to authenticated;
