-- ============================================================================
-- ٠١٩٣ — فترةُ السحب: دواءٌ دخل القطيع، ولحمٌ لا يُذبح قبل تاريخ
--
-- ── لماذا هذه أوّلاً، قبل أيّ مؤشّرِ أداء ─────────────────────────────────
-- حين يُعطى مضادٌّ حيويّ لقطيعٍ يُذبح بعد أسبوعين، **يوجد تاريخٌ قبله لا يجوز
-- الذبح**؛ مخالفتُه بقايا دواءٍ بلحمٍ يأكله الناس. والمدى من يومٍ إلى نحو
-- ثلاثين حسب المادّة (`docs/poultry-study.md`، الجزء الخامس). ولا برنامجَ
-- دواجنَ مسحناه يمسك هذا — يمسكه نظامٌ بيطريّ بطبيعته.
--
-- ── والقاعدةُ الملزمة: نحن لا نعرف، والعلبةُ تعرف ───────────────────────
-- فلا جدولَ أدويةٍ مدمجٌ بالشِفرة يقول «هذا سحبُه خمسة». رقمٌ خاطئٌ هنا لا
-- يُخطئ بشاشة — يُخطئ بلحمٍ يُباع. الرقمُ يُقرأ من العلبة ويُدخَل عند الصرف.
--
-- ── ثلاثُ حالاتٍ لا حالتان — وهنا خالفنا الدراسة عمداً ──────────────────
-- الدراسةُ قالت «إلزاميّاً». والإلزامُ بحقلٍ لا يعرفه المُدخِل يولّد رقماً
-- مخترعاً، و`CLAUDE.md` يقولها: «رقمٌ مخترعٌ أسوأ من خانةٍ فارغة» — وهنا
-- أسوأُ بما لا يُقاس، لأن رقماً مخترعاً **يُطمئن**. فالحالاتُ ثلاث:
--   • عددٌ ≥ ١  ⇒ تاريخُ الأمان = يومُ الصرف + العدد.
--   • صفر       ⇒ «ماكو فترةُ سحب» — قولٌ صريحٌ (فيتامين، مطهّرُ ماء).
--   • NULL      ⇒ «مجهولة» — والدفعةُ تقول «فترةُ سحبٍ مجهولة» بصوتٍ عالٍ.
-- والمجهولُ هو **الافتراض**: كلُّ سطرِ دواءٍ نزل قبل هذه الهجرة NULL، فيصرخ
-- ولا يصمت. صمتٌ هنا معناه «آمن» وهو أخطرُ ما يمكن أن نقوله.
--
-- ── ولا نمنع الإغلاق ────────────────────────────────────────────────────
-- الدفعةُ تُغلق لأسبابٍ غيرِ الذبح (نفوقٌ كاسح، بيعٌ لحقلٍ آخر). فالقاعدةُ
-- تحسب وتقول، والشاشةُ تطلب تأكيداً مكتوباً. منعٌ قاطعٌ يدفع المستخدمَ
-- لإغلاقها بطريقٍ ملتوٍ — فلا نعرف أصلاً أنه ذبح مبكّراً.
--
-- ── ولماذا تُحذف الدالّتان وتُعاد ───────────────────────────────────────
-- `poultry_consume` تكسب وسيطاً، و`poultry_cycle_stats` تكسب عمودين. إضافةُ
-- وسيطٍ بقيمةٍ افتراضية تُنشئ **توقيعاً ثانياً** يراه PostgREST التباساً
-- (PGRST203)، وتوسيعُ `returns table` ممنوعٌ بـ`create or replace` (درس 0096).
-- فحذفٌ وإنشاءٌ **بمعاملةٍ واحدة** (درس 0180): لا لحظةَ تكون فيها مفقودة.
--
-- تراجع: أعد تنزيل 0191 و0192 (تعيدان التوقيعَين القديمين).
-- تُطبَّق بعد 0192. وتنزل بـ`supabase/tests/run.sh`.
-- ============================================================================

-- ── ١) العمود ────────────────────────────────────────────────────────────
-- مئةٌ وعشرون سقفاً: أطولُ فترةِ سحبٍ بالمراجع نحو ثلاثين يوماً، والسقفُ يمسك
-- إدخالاً بالساعات أو بالخطأ (٩٠٠) قبل أن يصير تاريخَ أمانٍ بعد سنتين.
alter table poultry_use add column if not exists withdrawal_days integer;
do $wd$
begin
  if not exists (select 1 from pg_constraint where conname = 'poultry_use_withdrawal_chk') then
    alter table poultry_use add constraint poultry_use_withdrawal_chk
      check (withdrawal_days is null or (withdrawal_days >= 0 and withdrawal_days <= 120));
  end if;
end $wd$;

comment on column poultry_use.withdrawal_days is
  'فترةُ السحب بالأيام كما تقولها العلبة (0193). NULL = مجهولة — وهي الافتراضُ '
  'لكلّ ما سبق، وتصرخ بالشاشة ولا تُطمئن. صفرٌ = «ماكو فترةُ سحب» قولاً صريحاً.';

-- فهرسُ سطور الدواء وحدَها: `poultry_cycle_stats` تسأل عن أقصى تاريخِ أمانٍ
-- بكلّ فتحةِ دفعة، والدفعةُ الواحدة قد تحمل مئاتِ سطورِ العلف.
create index if not exists poultry_use_med_idx on poultry_use(cycle_id) where kind = 'med';

-- ── ٢) الصرفُ يحمل الرقم ────────────────────────────────────────────────
begin;

-- الحذفُ يستهدف **التوقيعَ القديم** (ثمانيةُ وسائط) وحدَه، و`or replace` تتكفّل
-- بإعادة التنزيل: بلا الأولى يبقى توقيعان (PGRST203 على كلّ صرف)، وبلا الثانية
-- يفشل الملفُّ حين يُعاد.
drop function if exists public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text);

create or replace function public.poultry_consume(
  p_cycle      uuid,
  p_kind       text,
  p_product    uuid,
  p_name       text,
  p_qty        numeric,
  p_unit       text default null,
  p_on_date    date default null,
  p_note       text default null,
  p_withdrawal integer default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_cycle  poultry_cycles;
  v_prod   products;
  v_cost   numeric := 0;
  v_short  numeric := 0;
  v_row    poultry_use;
  v_date   date := coalesce(p_on_date, current_date);
  v_wd     integer := p_withdrawal;
begin
  if v_clinic is null then
    raise exception 'no_clinic' using hint = 'لا عيادةَ للجلسة.';
  end if;
  if v_role not in ('manager','veterinarian') then
    raise exception 'not_allowed' using hint = 'صرفُ مخزن الحقل للمدير والطبيب.';
  end if;
  if p_kind not in ('feed','med','service','other') then
    raise exception 'bad_kind' using hint = 'نوعُ الصرف غيرُ معروف.';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'bad_qty' using hint = 'الكمّيةُ لازم أكبر من صفر.';
  end if;
  if p_product is null and coalesce(btrim(p_name), '') = '' then
    raise exception 'bad_name' using hint = 'اكتب اسمَ الخدمة أو اختر مادّةً من المخزن.';
  end if;
  -- فترةُ السحب لسطر الدواء وحدَه. رقمٌ على كيس علفٍ لا معنى له، ولو مرّ
  -- لدفع تاريخَ الأمان بلا سبب — فيُهمَل صامتاً لا يُرفض: ليست غلطةَ المستخدم.
  if p_kind <> 'med' then v_wd := null; end if;
  if v_wd is not null and (v_wd < 0 or v_wd > 120) then
    raise exception 'bad_withdrawal' using hint = 'فترةُ السحب بالأيام (٠–١٢٠) كما تقولها العلبة.';
  end if;

  select * into v_cycle from poultry_cycles where id = p_cycle and clinic_id = v_clinic;
  if not found then
    raise exception 'no_cycle' using hint = 'الدفعةُ غيرُ موجودة.';
  end if;
  if v_cycle.status <> 'active' then
    raise exception 'cycle_closed' using hint = 'الدفعةُ مغلقة — افتح دفعةً جديدة.';
  end if;

  if p_product is not null then
    select * into v_prod from products where id = p_product and clinic_id = v_clinic for update;
    if not found then
      raise exception 'no_product' using hint = 'المادّةُ غيرُ موجودة بالمخزن.';
    end if;
    if v_prod.farm_id is distinct from v_cycle.farm_id then
      raise exception 'not_farm_stock' using hint = 'المادّةُ ليست من مخزن هذا الحقل.';
    end if;
    v_cost  := coalesce(v_prod.purchase_price, 0);
    v_short := greatest(0, p_qty - coalesce(v_prod.stock, 0));
    update products set stock = coalesce(stock, 0) - p_qty where id = p_product;
  end if;

  insert into poultry_use (clinic_id, cycle_id, on_date, kind, product_id, name, qty, unit, unit_cost, line_cost, note, withdrawal_days)
  values (v_clinic, p_cycle, v_date, p_kind, p_product,
          coalesce(nullif(btrim(p_name), ''), v_prod.name),
          p_qty, p_unit, v_cost, round(v_cost * p_qty, 2), p_note, v_wd)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'use', to_jsonb(v_row),
    'stock_after', case when p_product is null then null else coalesce(v_prod.stock, 0) - p_qty end,
    'shortfall', v_short,
    -- تاريخُ أمانِ هذا السطر وحدَه: تقوله الشاشةُ فورَ الصرف («آمن من ٢٩ أيلول»)
    -- بدل أن ينتظر المستخدمُ إعادةَ تحميلِ ترويسة الدفعة.
    'safe_from', case when v_wd is null then null else to_char(v_date + v_wd, 'YYYY-MM-DD') end
  );
end $$;

revoke all on function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text, integer) from public, anon;
grant execute on function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text, integer) to authenticated;

comment on function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text, integer) is
  'صرفٌ من مخزن الحقل على دفعة (0192، وفترةُ السحب 0193): خصمٌ وسطرُ كلفةٍ '
  'بمعاملةٍ واحدة، بسعر الشراء، ويُرجّع النقصَ وتاريخَ الأمان ليُقالا بصوت.';

commit;

-- ── ٣) الدفعةُ تعرف تاريخَ أمانها ───────────────────────────────────────
begin;

drop function if exists public.poultry_cycle_stats(uuid);

create function public.poultry_cycle_stats(p_cycle uuid)
returns table (
  placed_count int, dead int, culled int, alive int,
  feed_kg numeric, feed_cost numeric, med_cost numeric, other_cost numeric, chick_cost numeric,
  days int, last_entry date,
  -- أقصى تاريخِ أمانٍ بين سطور الدواء: القطيعُ آمنٌ حين يأمن **آخرُها**.
  safe_from date,
  -- وسطرُ دواءٍ واحدٌ بفترةٍ مجهولة يجعل الدفعةَ كلَّها مجهولة: لا نعرف متى
  -- تأمن، فلا نقول «آمنة».
  withdrawal_unknown boolean
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    c.placed_count,
    coalesce(d.dead, 0),
    coalesce(d.culled, 0),
    c.placed_count - coalesce(d.dead, 0) - coalesce(d.culled, 0),
    coalesce(u.feed_kg, 0),
    coalesce(u.feed_cost, 0),
    coalesce(u.med_cost, 0),
    coalesce(u.other_cost, 0),
    round(coalesce(c.chick_unit_cost, 0) * c.placed_count, 2),
    greatest(0, (coalesce(c.closed_on, current_date) - c.placed_on))::int,
    d.last_entry,
    w.safe_from,
    coalesce(w.unknown, false)
  from poultry_cycles c
  left join lateral (
    select sum(x.dead)::int dead, sum(x.culled)::int culled, max(x.on_date) last_entry
      from poultry_daily x where x.cycle_id = c.id
  ) d on true
  left join lateral (
    select sum(y.qty) filter (where y.kind = 'feed')        feed_kg,
           sum(y.line_cost) filter (where y.kind = 'feed')  feed_cost,
           sum(y.line_cost) filter (where y.kind = 'med')   med_cost,
           sum(y.line_cost) filter (where y.kind not in ('feed','med')) other_cost
      from poultry_use y where y.cycle_id = c.id
  ) u on true
  left join lateral (
    select max(m.on_date + m.withdrawal_days) filter (where m.withdrawal_days is not null) as safe_from,
           bool_or(m.withdrawal_days is null)                                              as unknown
      from poultry_use m where m.cycle_id = c.id and m.kind = 'med'
  ) w on true
  where c.id = p_cycle;
$$;

revoke all on function public.poultry_cycle_stats(uuid) from public, anon;
grant execute on function public.poultry_cycle_stats(uuid) to authenticated;

comment on function public.poultry_cycle_stats(uuid) is
  'مجاميعُ دفعةٍ واحدة (0191): الحيُّ والنفوقُ والعلفُ والكلف، ومعها تاريخُ '
  'أمان الذبح ورايةُ «فترةٌ مجهولة» (0193). invoker — تمرّ من RLS.';

commit;

-- ============================================================================
-- VERIFY:
--   select safe_from, withdrawal_unknown from poultry_cycle_stats('<دفعة>');
--     ⇒ سطرُ دواءٍ بـ٧ أيام يوم ٢٠ أيلول ⇒ 2026-09-27، والمجهولُ false.
--     ⇒ ويكفي سطرٌ واحدٌ بلا رقمٍ ليصير withdrawal_unknown = true.
-- ============================================================================
