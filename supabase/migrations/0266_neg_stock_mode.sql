-- ============================================================================
-- 0266 — البيعُ قبل الجرد: وضعٌ مؤقّت تبيع فيه العيادةُ الجديدة تحت الصفر حتى تجرد موادَّها
--
-- الطلب (المالك، ١١/١١): عياداتٌ جديدة نُقلت موادُّها ولم تجرد بعد تريد أن تبيع ولو نزل الرصيدُ تحت الصفر حتى
-- تجرد — «بتفعيلٍ صارم من الإعدادات»، وبلا أخطاءٍ حسابيةٍ تتراكم، وإطفاؤه بعد الجرد لا يمسّ المخزنَ ولا الأرقام.
-- (البحثُ والمراجعاتُ الأربع والقرارات: docs/neg-stock-plan.md)
--
-- الجذرُ الذي يُبنى عليه (مقيسٌ قبل التصميم):
--  • الخادمُ يبيع تحت الصفر لكلّ عيادةٍ أصلاً (0253: لا منعَ ولا حصر — قرارُ المالك ٣١/١٠)، و«رصيده صفر» منعٌ بالواجهة
--    وحدها. فالوضعُ هنا حالةٌ يقرؤها الجهازُ ويحكم الخادمُ بانتهائها بساعته، **ولا دالّةَ مخزنٍ ولا مالٍ تقرؤها**: تشغيلُه
--    وإطفاؤه وانتهاؤه لا يكتب صفَّ مادّةٍ ولا جردٍ ولا فاتورة — فما صار بعد الجرد يبقى كما هو.
--  • **الدفترُ هو الحالة** (neg_stock_log): آخرُ سطرٍ للعيادة يقول مفعّلٌ أو لا، وحتى متى، ومن متى. لا عمودَ بالإعدادات:
--    سياسةُ clinic_prefs تسمح لكلّ الكادر بالتحديث **والحذف** (0161) — حذفُ الصفّ كان سيطفئه بلا سطرٍ بالسجلّ، ومحفّزٌ
--    جديدٌ هناك يجري مع كلّ حفظِ إعداداتٍ لكلّ عيادة (صنفُ 0162). جدولٌ قراءةٌ فقط تكتبه neg_stock_set وحدها: الحالةُ
--    والتاريخُ لا يختلفان أبداً.
--  • «صارم»: يشغّله مديرُ العيادة بدوره **الأساس** أو مشغّلُ المنصّة الداخلُ عليها — لا رفعُ مفتاحٍ بعشر دقائق يفتح وضعاً
--    يعيش أسابيع — وبإقرارٍ صريح (p_ack)، ومربوطاً بالعيادة التي تراها الشاشة (p_clinic: تبويبُ مشغّلٍ قديم كان سيطفئ
--    عيادةً غيرَها). ومدّتُه ١–٣٠ يوماً تنتهي **ليلاً** (الثالثة فجراً بعد آخر يومٍ بتوقيت العيادة — لا بنصّ الدوام)،
--    والتمديدُ لا يقصّر، وسقفُ الفترة ٦٠ يوماً من بدايتها (والإطفاءُ ثمّ التشغيلُ خلال ٣٠ يوماً لا يصفّرها) إلا للمشغّل.
--  • **المادّةُ التي انعدّت تخرج من الوضع**: عدٌّ مطابقٌ أو موافَقٌ عليه يعني رصيداً موثوقاً — فلا تُباع تحت الصفر بعده
--    حتى يُسجَّل شراؤها. فالوضعُ يضيق مع الجرد وحده، ولا تُباع بضاعةٌ وصلت قبل إدخال فاتورتها على مادّةٍ معدودة (فرقُ
--    كلفةٍ لا يُسجَّل — purchase_effects.cost_variance لا يقرؤه تقرير).
--  • **الكلفة**: سطرُ البيع يُكلَّف بالخادم ويُجمَّد بفاتورته للأبد. مادّةٌ كلفةُ سطرها صفر (stock_unit_cost صفر، أو مفردٌ
--    تقريبُه صفر) تُباع تحت الصفر ربحاً كاملاً لا يصحّحه جردٌ ولا شراء — فالوضعُ لا يرفعها. neg_stock_check يحكم بها
--    بـ_product_line_cost نفسِها وبالكمّيتين كما سترسلهما البيعة (مقيسٌ: سعرُ ٤ لعلبة ألف حبّة = حبّةٌ بصفر).
--  • **الجرد**: البيعُ بين كتابة العدد وتسجيله كان يرجع زيادةً وهمية (اللقطةُ لحظةَ التسجيل) تصير «عجزاً» بالجرد التالي —
--    كلفةٌ مرّتين بسحبٍ لا يُحذف. stock_count_submit_seen تقارن رصيدَ كلّ سطرٍ بما رآه العادُّ لحظةَ الكتابة (seen)
--    تحت القفل نفسِه وتردّ count_moved بلا أثر، وإلا تنادي stock_count_submit كما هي (محروسةٌ ببصمة 0255 — لا تُمسّ).
-- إضافيّةٌ كلُّها، ولا تُعيد تعريفَ دالّةٍ قائمة، وتُعاد بلا أثرٍ ثانٍ. تراجع (الواجهةُ أوّلاً): drop function
-- neg_stock_set/neg_stock_state/neg_stock_report/neg_stock_counted/neg_stock_check/stock_count_submit_seen و_neg_stock_* (والفترة)؛
-- ثمّ drop table neg_stock_log.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) الدفتر = الحالة ─────────────────────────────────────────────────────────────────────────────────────
-- لكلّ تشغيلٍ وتمديد: بدايةُ الفترة (since) ونهايتُها (until). الإطفاءُ سطرٌ بلا نهاية. والختمُ clock_timestamp لا now():
-- سطران بمعاملةٍ واحدة يتشاركان now() فيصير «الأخير» قرعةً بالمعرّف (درسُ clinic_fx_rates، 0264).
create table if not exists public.neg_stock_log (
  id             uuid primary key default gen_random_uuid(),
  clinic_id      uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  at             timestamptz not null default clock_timestamp(),
  action         text not null check (action in ('on', 'extend', 'off')),
  since          timestamptz,
  until          timestamptz,
  by_user        uuid,
  by_name        text,
  note           text check (note is null or char_length(note) <= 200),
  negatives      int,
  never_counted  int,
  zero_cost      int,
  pending        int,
  constraint neg_stock_log_shape check ((action = 'off') = (until is null) and (action = 'off' or since is not null))
);
create index if not exists neg_stock_log_clinic_idx on public.neg_stock_log (clinic_id, at desc, id desc);
comment on table public.neg_stock_log is
  'البيعُ قبل الجرد (0266): الدفترُ هو الحالة — آخرُ سطرٍ للعيادة. لا يُعدَّل ولا يُحذف؛ الكتابةُ من neg_stock_set وحدها. '
  'by_user/by_name فارغان لمشغّل المنصّة (0151).';
alter table public.neg_stock_log enable row level security;
drop policy if exists neg_stock_log_read on public.neg_stock_log;
create policy neg_stock_log_read on public.neg_stock_log for select to authenticated using (clinic_id = (select auth_clinic()));
revoke all on table public.neg_stock_log from public, anon, authenticated;
grant select on table public.neg_stock_log to authenticated;
-- سياجُ موظّف التصوير (0222): بعد السياسة — يسيّج ما له سياسةٌ قائمة.
select public.photographer_fence_table('neg_stock_log');

-- ── ٢) أدواتٌ داخلية ────────────────────────────────────────────────────────────────────────────────────────
-- آخرُ سطرٍ للعيادة (أو لا شيء).
create or replace function public._neg_stock_last(p_clinic uuid)
returns public.neg_stock_log language sql stable security definer set search_path = public as $$
  select l.* from public.neg_stock_log l where l.clinic_id = p_clinic order by l.at desc, l.id desc limit 1
$$;
revoke all on function public._neg_stock_last(uuid) from public, anon, authenticated;

-- «معدودة»: عدٌّ (لا سندُ تلف) مطابقٌ أو وافق عليه المدير — رصيدُها صار موثوقاً. والمعلَّقُ ليس بعد (الرصيدُ لا يتصحّح
-- قبل الموافقة)، والمرفوضُ والملغى ليسا عدّاً.
create or replace function public._neg_stock_is_counted(p_clinic uuid, p_product uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.stock_counts c
                  where c.clinic_id = p_clinic and c.product_id = p_product
                    and c.source = 'count' and c.status in ('matched', 'approved'))
$$;
revoke all on function public._neg_stock_is_counted(uuid, uuid) from public, anon, authenticated;

-- الفترةُ التي سيقع فيها تشغيلٌ أو تمديدٌ الآن: بدايتُها (الجاريةُ إن كان مفعّلاً، أو التي انتهت خلال ٣٠ يوماً — الإطفاءُ ثمّ
-- التشغيلُ لا يصفّرها — وإلا الآن) وسقفُها (٦٠ يوماً منها). بها يحكم neg_stock_set ويعرضها التقرير فتُعطَّل المددُ فوقها.
create or replace function public._neg_stock_period(p_clinic uuid, out since timestamptz, out cap_until timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare r public.neg_stock_log; v_end timestamptz;
begin
  r := public._neg_stock_last(p_clinic);
  if r.id is not null and r.action in ('on', 'extend') and r.until > now() then
    since := r.since;
  else
    v_end := case when r.action = 'off' then r.at else r.until end;
    since := case when r.id is not null and r.since is not null and v_end > now() - interval '30 days' then r.since else now() end;
  end if;
  cap_until := since + interval '60 days';
end $$;
revoke all on function public._neg_stock_period(uuid) from public, anon, authenticated;

-- العدّ: المادّةُ الحيّة بالعيادة — لا المجمَّعة (رصيدُها بحوض قسمها) ولا مخزنُ الحقل (لا يُباع بالكاشير) ولا الدولارية
-- (شاشتُها وكلفتُها بالدولار). negatives تحت الصفر (المعدودةُ معها)؛ never_counted بلا عدٍّ موثوق؛ uncounted_nonpos منها رصيدُها ≤ ٠
-- (هذي تُرفض بالكاشير بعد الإطفاء) وuncounted_neg منها تحت الصفر — لوحةُ الإطفاء تقول «منها N تحت الصفر» عن غير المعدودة وحدها
-- (negatives كانت تعدّ المعدودةَ فقالت «٢ منها ٥»)؛ zero_cost كلفةُ علبتها صفر (القاعدةُ بالعلبة — المفردُ يُحكم بسطره بـneg_stock_check)؛
-- pending عدٌّ ينتظر الموافقة. والـdrop لأن أعمدةَ الخرج تغيّرت (create or replace لا يغيّرها) — لا يعتمد عليها إلا دوالُّ plpgsql هنا.
drop function if exists public._neg_stock_counts(uuid);
create or replace function public._neg_stock_counts(p_clinic uuid,
  out negatives int, out never_counted int, out uncounted_nonpos int, out uncounted_neg int, out zero_cost int, out zero_cost_nonpos int, out pending int)
language sql stable security definer set search_path = public as $$
  with live as (
    select p.*, public.stock_unit_cost(p) as k,
           not exists (select 1 from public.stock_counts c
                        where c.clinic_id = p_clinic and c.product_id = p.id
                          and c.source = 'count' and c.status in ('matched', 'approved')) as uncounted
      from public.products p
     where p.clinic_id = p_clinic and not coalesce(p.pooled, false) and p.farm_id is null
       and coalesce(p.price_currency, 'IQD') <> 'USD')
  select count(*) filter (where coalesce(stock, 0) < 0)::int,
         count(*) filter (where uncounted)::int,
         count(*) filter (where uncounted and coalesce(stock, 0) <= 0)::int,
         count(*) filter (where uncounted and coalesce(stock, 0) < 0)::int,
         count(*) filter (where round(k, 2) <= 0)::int,
         count(*) filter (where round(k, 2) <= 0 and coalesce(stock, 0) <= 0)::int,
         (select count(*) from public.stock_counts c where c.clinic_id = p_clinic and c.source = 'count' and c.status = 'pending')::int
    from live
$$;
revoke all on function public._neg_stock_counts(uuid) from public, anon, authenticated;

-- ── ٣) الحالة: تُسأل عند فتح الكاشير، وكلَّ دقيقةٍ ما دام مفعّلاً، وقبل بيعةٍ فيها ما رفعه الوضع ────────────────
-- ended_at: متى انتهى آخرُ وضع (إطفاءٌ أو انتهاءٌ بالوقت) — لتقول الشاشةُ «انتهى بـ…» لا «رصيده صفر» وحدها.
create or replace function public.neg_stock_state() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); r public.neg_stock_log; v_active boolean;
begin
  if v_clinic is null then
    return jsonb_build_object('clinic_id', null, 'active', false, 'used', false, 'until', null, 'since', null, 'ended_at', null, 'now', now());
  end if;
  r := public._neg_stock_last(v_clinic);
  v_active := r.id is not null and r.action in ('on', 'extend') and r.until > now();
  return jsonb_build_object(
    'clinic_id', v_clinic,
    'active',    v_active,
    'used',      r.id is not null,
    'until',     case when r.action in ('on', 'extend') then r.until end,
    'since',     case when v_active then r.since end,
    'ended_at',  case when r.id is null or v_active then null when r.action = 'off' then r.at else r.until end,
    'now',       now());
end $$;
revoke all on function public.neg_stock_state() from public, anon;
grant execute on function public.neg_stock_state() to authenticated;

-- ── ٤) التقرير: لبطاقة الإعدادات (قبل التشغيل وقبل الإطفاء) ───────────────────────────────────────────────
create or replace function public.neg_stock_report() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic(); c record; pd record;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  select * into c from public._neg_stock_counts(v_clinic);
  select * into pd from public._neg_stock_period(v_clinic);
  -- operator: هل **المستدعي** مشغّلُ المنصّة (لا تاريخَ أحد) — البطاقةُ تُطلق له ما فوق السقف وتطلب ملاحظته.
  return public.neg_stock_state() || jsonb_build_object('period_since', pd.since, 'cap_until', pd.cap_until,
    'operator', platform_acting_clinic() is not null,
    'negatives', c.negatives, 'never_counted', c.never_counted, 'uncounted_nonpos', c.uncounted_nonpos, 'uncounted_neg', c.uncounted_neg,
    'zero_cost', c.zero_cost, 'zero_cost_nonpos', c.zero_cost_nonpos, 'pending', c.pending,
    'log', coalesce((select jsonb_agg(jsonb_build_object(
                               'at', l.at, 'action', l.action, 'since', l.since, 'until', l.until, 'by_name', l.by_name,
                               'note', l.note, 'negatives', l.negatives,
                               'never_counted', l.never_counted, 'pending', l.pending) order by l.at desc, l.id desc)
                       from (select * from public.neg_stock_log x where x.clinic_id = v_clinic
                              order by x.at desc, x.id desc limit 20) l), '[]'::jsonb));
end $$;
revoke all on function public.neg_stock_report() from public, anon;
grant execute on function public.neg_stock_report() to authenticated;

-- ── ٥) المعدودة: يحمّلها الكاشيرُ ما دام الوضعُ مفعّلاً — المعدودةُ لا تُرفع (رصيدُها موثوق) ─────────────────────
create or replace function public.neg_stock_counted() returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare v_clinic uuid := auth_clinic();
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  return coalesce((select jsonb_agg(distinct c.product_id) from public.stock_counts c
                    where c.clinic_id = v_clinic and c.product_id is not null
                      and c.source = 'count' and c.status in ('matched', 'approved')), '[]'::jsonb);
end $$;
revoke all on function public.neg_stock_counted() from public, anon;
grant execute on function public.neg_stock_counted() to authenticated;

-- ── ٦) حكمُ البيعة: قبل بيعةٍ فيها سطورٌ رفعها الوضعُ فوق رصيدها — سطراً سطراً بالخادم ───────────────────────────
-- p_lines: [{product_id, qty, stock_qty}] كما سترسلها البيعة. يرجع ما لا يُباع تحت الصفر الآن ولماذا:
-- off (الوضعُ مطفأ أو انتهى)، gone (المادّةُ ما عادت بالعيادة)، not_lifted (مجمَّعة/حقل/دولار)، counted (انعدّت — رصيدُها
-- موثوق)، zero_cost (كلفةُ سطرها صفر بـ_product_line_cost نفسِها التي ستكتبها البيعة). قراءةٌ وحدها — لا يكتب شيئاً.
create or replace function public.neg_stock_check(p_clinic uuid, p_lines jsonb) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  c_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_clinic uuid := auth_clinic();
  r        public.neg_stock_log;
  v_active boolean;
  l        jsonb;
  v_pid    uuid;
  v_p      public.products;
  v_qty    numeric;
  v_sq     numeric;
  v_why    text;
  v_out    jsonb := '[]'::jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'neg_stock_clinic_changed' using hint = 'تبدّلت العيادة من وقت ما فتحت الصفحة — حدّث الصفحة.';
  end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) > 500 then
    raise exception 'neg_stock_bad' using hint = 'سطورُ الفحص ناقصة أو كثيرة.';
  end if;
  r := public._neg_stock_last(v_clinic);
  v_active := r.id is not null and r.action in ('on', 'extend') and r.until > now();
  for l in select value from jsonb_array_elements(p_lines) loop
    v_why := null;
    if coalesce(l->>'product_id', '') !~* c_uuid then
      v_why := 'gone';
    else
      v_pid := (l->>'product_id')::uuid;
      begin
        v_qty := coalesce((l->>'qty')::numeric, 1);
        v_sq  := (l->>'stock_qty')::numeric;
      exception when others then
        raise exception 'neg_stock_bad' using hint = 'سطرٌ بالفحص رقمه غلط.';
      end;
      select * into v_p from public.products where id = v_pid and clinic_id = v_clinic;
      if not found then v_why := 'gone';
      elsif not v_active then v_why := 'off';
      elsif coalesce(v_p.pooled, false) or v_p.farm_id is not null or coalesce(v_p.price_currency, 'IQD') = 'USD' then v_why := 'not_lifted';
      elsif public._neg_stock_is_counted(v_clinic, v_pid) then v_why := 'counted';
      elsif coalesce(public._product_line_cost(v_clinic, v_pid, v_qty, v_sq, -1), -1) <= 0 then v_why := 'zero_cost';
      end if;
    end if;
    if v_why is not null then
      v_out := v_out || jsonb_build_array(jsonb_build_object('product_id', l->>'product_id', 'why', v_why,
        'name', case when v_why <> 'gone' then v_p.name end, 'stock', case when v_why <> 'gone' then v_p.stock end));
    end if;
  end loop;
  return jsonb_build_object('clinic_id', v_clinic, 'active', v_active,
    'until', case when r.action in ('on', 'extend') then r.until end, 'now', now(), 'refused', v_out);
end $$;
revoke all on function public.neg_stock_check(uuid, jsonb) from public, anon;
grant execute on function public.neg_stock_check(uuid, jsonb) to authenticated;

-- ── ٧) البابُ الواحد: تشغيل / تمديد / إطفاء ──────────────────────────────────────────────────────────────────
-- p_clinic: العيادةُ التي تراها الشاشة — غيرُها يُرفض (neg_stock_clinic_changed). p_days ١–٣٠: النهايةُ الثالثة فجراً بعد
-- آخر يومٍ بتوقيت العيادة (p_tz، وغيرُ المفهوم بغداد). والتمديدُ لا يقصّر (الأبعدُ من الحالية والجديدة)، والبدايةُ كما هي.
-- البدايةُ تُحمل لتشغيلٍ بعد إطفاءٍ أو انتهاءٍ خلال ٣٠ يوماً، فالإطفاءُ والتشغيلُ لا يصفّران سقفَ الـ٦٠ يوماً (المشغّلُ فوقه).
-- الإقرارُ (p_ack) شرطٌ للتشغيل والتمديد بالخادم لا بالشاشة وحدها، والمشغّلُ يكتب ملاحظةً للعيادة (لا اسمَ له بالسجلّ — 0151).
-- إطفاءُ غيرِ المفعّل لا شيء (لا سطر). والإطفاءُ مقبولٌ وبالعيادة موادُّ سالبة: الشاشةُ تقولها قبله، والسطرُ يعدّها.
create or replace function public.neg_stock_set(p_clinic uuid, p_on boolean, p_days integer default null,
  p_ack boolean default false, p_note text default null, p_tz text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_uid    uuid := auth.uid();
  v_op     boolean := platform_acting_clinic() is not null;
  v_note   text := nullif(btrim(coalesce(p_note, '')), '');
  v_tz     text := coalesce(nullif(btrim(coalesce(p_tz, '')), ''), 'Asia/Baghdad');
  r        public.neg_stock_log;
  v_active boolean;
  v_today  date;
  v_new    timestamptz;
  v_until  timestamptz;
  v_since  timestamptz;
  v_cap    timestamptz;
  v_action text;
  v_name   text;
  c        record;
begin
  if v_clinic is null or v_uid is null then raise exception 'not authenticated' using errcode = '42501'; end if;
  if p_clinic is distinct from v_clinic then
    raise exception 'neg_stock_clinic_changed' using hint = 'تبدّلت العيادة من وقت ما فتحت الصفحة — حدّث الصفحة.';
  end if;
  if coalesce(auth_role_base(), '') <> 'manager' then
    raise exception 'neg_stock_manager' using errcode = '42501',
      hint = 'البيعُ قبل الجرد يشغّله ويطفّيه مديرُ العيادة من حسابه — مفتاحُ المدير المؤقّت ما يكفي لوضعٍ يعيش أيّاماً.';
  end if;
  if p_on is null then raise exception 'neg_stock_bad' using hint = 'اختر: تشغيل أو إطفاء.'; end if;
  if v_note is not null and char_length(v_note) > 200 then
    raise exception 'neg_stock_note' using hint = 'الملاحظةُ ٢٠٠ حرف أقصى.';
  end if;
  -- تسلسلٌ لكلّ عيادة: ضغطتان متزامنتان (جهازان، أو مديرٌ ومشغّل) لا تقرآن الحالةَ نفسَها فتكتبان فوق بعض.
  perform pg_advisory_xact_lock(hashtextextended('neg_stock:' || v_clinic::text, 0));
  r := public._neg_stock_last(v_clinic);
  v_active := r.id is not null and r.action in ('on', 'extend') and r.until > now();

  if p_on then
    if not coalesce(p_ack, false) then
      raise exception 'neg_stock_ack' using hint = 'أكّد أوّلاً إنك فاهم: المادة تنباع حتى لو رصيدها صفر، والرصيد ينزل تحت الصفر لحد الجرد.';
    end if;
    if p_days is null or p_days < 1 or p_days > 30 then
      raise exception 'neg_stock_days' using hint = 'المدّةُ من يوم إلى ٣٠ يوماً — وتنمدّ بعدها إذا احتجت.';
    end if;
    if v_op and v_note is null then
      raise exception 'neg_stock_note_required' using hint = 'اكتب للعيادة ليش شغّلته (مثلاً: «بطلب العيادة — قبل الجرد الأوّل»).';
    end if;
    -- توقيتٌ مجهول يسقط لبغداد — كالبيعة المؤرَّخة (0242)، لا رفضٌ بسبب جهاز.
    begin
      v_today := (now() at time zone v_tz)::date;
    exception when others then
      v_tz := 'Asia/Baghdad';
      v_today := (now() at time zone v_tz)::date;
    end;
    v_new := ((v_today + p_days + 1)::timestamp + interval '3 hours') at time zone v_tz;
    -- فترةٌ جارية، أو انتهت خلال ٣٠ يوماً، تُكمَل لا تُصفَّر: البدايةُ بدايتُها (_neg_stock_period).
    select pd.since, pd.cap_until into v_since, v_cap from public._neg_stock_period(v_clinic) pd;
    if v_active then
      v_until := greatest(r.until, v_new);
      v_action := 'extend';
      if v_until = r.until then return public.neg_stock_state(); end if;   -- لا يقصّر ولا يُكتب ما لم يتغيّر
    else
      v_until := v_new;
      v_action := 'on';
    end if;
    if not v_op and v_until > v_cap then
      raise exception 'neg_stock_too_long'
        using hint = 'البيعُ قبل الجرد مؤقّت: أقصاه ٦٠ يوماً من بدايته (' || to_char(v_since at time zone v_tz, 'YYYY-MM-DD')
                     || ') — كمّلوا الجرد. وللتمديد بعدها كلّموا الدعم.';
    end if;
  else
    if not v_active then return public.neg_stock_state(); end if;
    v_action := 'off';
    v_since := r.since;
    v_until := null;
  end if;

  -- اسمُ من شغّله بلحظته (كسطر الجرد، 0255): لا اسمَ للمشغّل (0151) — يُقرأ «مدير العيادة».
  v_name := case when v_op then null else coalesce(
    (select nullif(btrim(s.name), '') from staff s where s.user_id = v_uid and s.clinic_id = v_clinic limit 1),
    (select nullif(btrim(p.full_name), '') from profiles p where p.id = v_uid)) end;
  select * into c from public._neg_stock_counts(v_clinic);
  insert into public.neg_stock_log (clinic_id, action, since, until, by_user, by_name, note,
                                    negatives, never_counted, zero_cost, pending)
  values (v_clinic, v_action, v_since, v_until, case when v_op then null else v_uid end, v_name, v_note,
          c.negatives, c.never_counted, c.zero_cost, c.pending);
  return public.neg_stock_state();
end $$;
revoke all on function public.neg_stock_set(uuid, boolean, integer, boolean, text, text) from public, anon;
grant execute on function public.neg_stock_set(uuid, boolean, integer, boolean, text, text) to authenticated;

-- ── ٨) الجرد: العددُ يُسجَّل على الرصيد الذي رآه العادُّ ─────────────────────────────────────────────────────
-- p_lines كسطور stock_count_submit، وكلُّ سطرٍ يحمل seen: رصيدَ المادّة لحظةَ كتابة عددها (وseen_pool: حوضَ قسمها، لمادّةٍ رصيدُها
-- ≤ ٠ بقسم — تُباع من الحوض وصفُّها ثابت). تُقفل الموادُّ بالمعرّف بجملةٍ
-- واحدة وبالترتيب نفسِه (0255)، وسطرٌ تحرّك رصيدُه بعد الكتابة (بيعٌ، شراء، استهلاك) يردّ count_moved بأسمائها ومعرّفاتها
-- (detail) بلا أثر — يُعاد عدُّها؛ وإلا تُنادى stock_count_submit كما هي، تحت القفل نفسِه فلا يتحرّك شيءٌ بينهما.
create or replace function public.stock_count_submit_seen(p_lines jsonb) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  c_uuid   constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  v_clinic uuid := auth_clinic();
  v_moved  jsonb := '[]'::jsonb;
  v_names  text[] := '{}';
  x        record;
begin
  if v_clinic is null or auth.uid() is null then raise exception 'no_clinic' using errcode = '42501'; end if;
  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'count_empty' using hint = 'ماكو سطور بالعدّ';
  end if;
  if jsonb_array_length(p_lines) > 200 then
    raise exception 'count_too_many' using hint = 'أكثر من ٢٠٠ مادة بمرّة — قسّم العدّ';
  end if;
  -- سطرٌ بلا seen لا يُتخطّى بصمت: حارسٌ لا يجري على سطرٍ ليس حارساً.
  if exists (select 1 from jsonb_array_elements(p_lines) e
              where jsonb_typeof(e) <> 'object' or jsonb_typeof(e->'seen') is distinct from 'number') then
    raise exception 'count_seen_missing' using hint = 'الصفحة عندك نسخة قديمة — حدّثها وسجّل العدّ من جديد.';
  end if;
  perform 1 from public.products
   where clinic_id = v_clinic and farm_id is null
     and id in (select (e->>'product_id')::uuid from jsonb_array_elements(p_lines) e where e->>'product_id' ~* c_uuid)
   order by id for update;
  -- حوضُ القسم: مادّةٌ رصيدُها ≤ ٠ بقسمٍ له حوض تُباع منه وصفُّها لا يتحرّك (deduct_stock_pooled: الحوضُ يعطي ما فوق الرصيد
  -- الموجب) — فبيعٌ بين الكتابة والإرسال كان يمرّ الحارسَ ويُسجَّل العددُ على رفٍّ نقص. فسطرُها يحمل seen_pool: حوضَ قسمها لحظةَ
  -- الكتابة، ويُقارن به. ورصيدٌ موجب لا يحتاجه: أوّلُ بيعٍ ينقص الصفَّ نفسَه. والأقسامُ لا تُقفل (قفلُها بعد الموادّ يعاكس ترتيبَ
  -- بيعةٍ تقفل مادّةً ثمّ قسمَها) — موادُّ العدّ مقفولة فلا يبيعها أحدٌ الآن، وما باعه غيرُها من الحوض «تحرّك» يُعاد عدُّه (أسلمُ).
  for x in
    select p.id, p.name, round(coalesce(p.stock, 0), 3) as now_stock, round((e->>'seen')::numeric, 3) as seen,
           p.section_id is not null and not coalesce(p.pooled, false) as in_section,
           (select round(coalesce(s.pooled_stock, 0), 3) from public.company_sections s
             where s.id = p.section_id and s.clinic_id = v_clinic) as now_pool,
           case when jsonb_typeof(e->'seen_pool') = 'number' then round((e->>'seen_pool')::numeric, 3) end as seen_pool
      from jsonb_array_elements(p_lines) e
      join public.products p on p.id = (e->>'product_id')::uuid and p.clinic_id = v_clinic
     where e->>'product_id' ~* c_uuid
  loop
    if x.now_stock <> x.seen then
      v_moved := v_moved || to_jsonb(x.id::text);
      if cardinality(v_names) < 5 then v_names := v_names || x.name; end if;
    elsif x.in_section and x.seen <= 0 then
      if x.seen_pool is null then
        raise exception 'count_seen_missing' using hint = 'الصفحة عندك نسخة قديمة — حدّثها وسجّل العدّ من جديد.';
      end if;
      if coalesce(x.now_pool, 0) <> x.seen_pool then
        v_moved := v_moved || to_jsonb(x.id::text);
        if cardinality(v_names) < 5 then v_names := v_names || x.name; end if;
      end if;
    end if;
  end loop;
  if jsonb_array_length(v_moved) > 0 then
    raise exception 'count_moved'
      using hint = '«' || array_to_string(v_names, '»، «') || '»' || case when jsonb_array_length(v_moved) > 5 then ' وغيرها' else '' end
                   || ' — رصيدها تغيّر من وقت ما كتبت العدد (بيع أو شراء). اعدّها مرّة ثانية.',
            detail = v_moved::text;
  end if;
  return public.stock_count_submit(p_lines);
end $$;
revoke all on function public.stock_count_submit_seen(jsonb) from public, anon;
grant execute on function public.stock_count_submit_seen(jsonb) to authenticated;
