-- ============================================================================
-- ٠١٨٥ — قمعُ المتجر يُقاس: أربعةُ أحداثٍ وقيدٌ يتّسع لها، ودالّةُ قمعٍ **جديدة**
--
-- الجذر: الموجاتُ الستُّ أصلحت متجراً **لا أحدَ فتحه**. والقياسُ على الإنتاج:
-- العياداتُ الثلاثُ اللاتي يصنعن ١١٩٢ من ١١٩٤ فاتورةً أسبوعياً عندها صفرُ
-- منتجٍ معروض وصفرُ صفٍّ بـ`store_profiles` — وكلُّهنّ على باقةٍ مدفوعةٍ
-- فعّالة. فلا الباقةُ حاجزٌ ولا الصلاحية، والسؤالُ «أين نخسرهم» بلا جواب.
--
-- ولا يُبنى جوابٌ على ادّعاء: `landing_events` حيٌّ ويشتغل (٣٠٨ صفوف)، وقمعُ
-- صفحة الهبوط مقاسٌ منذ 0114. ينقصه قمعُ **المتجر** وحدَه.
--
-- **وخطّةُ ت١ قالت إنّ هذا «لا يحتاج هجرةً» لأن «قيدَ الجدول على `device`
-- وحده». وهذا خطأ.** 0114 وضعت قيداً على `event` كذلك وبنصٍّ صريح: «الحصر
-- بمكانين مقصود: القيد هنا يحمي حتى لو نُشرت الدالة بخطأ». ولولا قياسُ
-- الإنتاج لشُحنت أربعةُ أحداثٍ **ترفضها القاعدة**، و`api/track.ts` يبلع فشلَ
-- الإدراج بتصميمه («القياس لا يُسقط تجربة الزائر») — فيصير عندنا قياسٌ يقيس
-- صفراً، وتُبنى عليه بنودُ الجزء الثالث كلُّها وهي تدّعي أنها صارت تُكذَّب.
--
-- ولا تُلمس `landing_funnel`: تغييرُ نوعِ المُرجَع لدالّةٍ قائمة يرمي
-- `cannot change return type` (درسُ 0096) — فالقمعُ الجديد **دالّةٌ ثانية**.
--
-- الخصوصيةُ كما هي: لا كوكيز، ولا IP محفوظ، وبصمةُ اليوم تتبدّل كلَّ منتصف
-- ليل. و`meta` يحمل `slug` المتجر فقط — اسمُ رفٍّ عام، لا بيانَ زبون.
--
-- تُعاد بلا أثرٍ ثانٍ. تُطبَّق بعد 0184.
-- ============================================================================

-- ── ١) القيدُ يتّسع للأحداث الأربعة ────────────────────────────────────────
-- الحذفُ والإضافةُ بمعاملةٍ واحدة: قيدٌ يُحذف وإضافتُه تفشل يترك الجدولَ
-- مفتوحاً لأيّ نصّ — وهو أسوأُ من القيد الضيّق (درسُ 0180).
begin;
alter table landing_events drop constraint if exists landing_events_event_check;
alter table landing_events add constraint landing_events_event_check
  check (event in (
    -- قمعُ صفحة الهبوط (0114) — كما هو، بلا حذفِ اسمٍ واحد.
    'page_view', 'cta_click', 'signup_start', 'signup_done', 'trial_start',
    -- وقمعُ المتجر (0185): زارَ ⇒ أضاف ⇒ فتح السلّة ⇒ طلب.
    'store_view', 'store_add', 'store_checkout_open', 'store_order'
  ));
commit;

comment on constraint landing_events_event_check on landing_events is
  'قائمةٌ مغلقة، **مرآتُها بـapi/track.ts** (ثابت EVENTS) — والطرفان يُفحصان '
  'بـscripts/track-parity.mjs. إضافةُ اسمٍ بطرفٍ واحد تُسقط الحدثَ بصمت: '
  'القاعدةُ ترفض، ودالّةُ الحافة تبلع الفشلَ بتصميمها، فيبدو القياسُ شغّالاً '
  'وهو يقيس صفراً.';

-- ── ٢) قمعُ المتجر — دالّةٌ **جديدة** لا توسيعُ القائمة ────────────────────
create or replace function store_funnel(p_days int default 30)
returns table (
  day date, viewers bigint, adders bigint, checkouts bigint, orders bigint
) language sql stable security definer set search_path = public as $$
  select
    (at at time zone 'utc')::date                                        as day,
    -- الزائرُ يُعدّ **مميّزاً** (بصمةُ يومه)، والباقي أحداثٌ: من زار مرّتين
    -- زائرٌ واحد، ومن أضاف صنفين فعلان. خلطُهما يقلب معنى النسبة.
    count(distinct visitor_day) filter (where event = 'store_view')       as viewers,
    count(distinct visitor_day) filter (where event = 'store_add')        as adders,
    count(distinct visitor_day) filter (where event = 'store_checkout_open') as checkouts,
    count(*) filter (where event = 'store_order')                         as orders
  from landing_events
  where is_platform_admin()
    and event in ('store_view', 'store_add', 'store_checkout_open', 'store_order')
    and at >= now() - make_interval(days => greatest(1, least(365, coalesce(p_days, 30))))
  group by 1
  order by 1 desc;
$$;
revoke all on function store_funnel(int) from public, anon;
grant execute on function store_funnel(int) to authenticated;

comment on function store_funnel(int) is
  'قمعُ المتجر لمشغّل المنصّة: زار ⇒ أضاف ⇒ فتح السلّة ⇒ طلب. الزائرُ والمضيفُ '
  'وفاتحُ السلّة يُعدّون مميّزين ببصمة اليوم، والطلبُ حدثٌ يُعدّ كما هو. '
  'دالّةٌ ثانيةٌ لا توسيعٌ لـlanding_funnel: تغييرُ نوعِ المُرجَع يرمي '
  'cannot change return type (درسُ 0096).';

-- ============================================================================
-- VERIFY (كمشغّل المنصّة):  select * from store_funnel(30);
-- VERIFY (كعيادة عادية):   يرجع صفرَ صفوف — أرقامُ السوق ليست لها.
-- ============================================================================
