-- ============================================================================
-- ٠١٩٢ — استهلاكُ الحقل: يخرج من المخزن ويُقيَّد بالدفعة، معاً أو لا شيء
--
-- ── لماذا دالّةٌ لا كتابتان ─────────────────────────────────────────────
-- تسجيلُ «دخل الحقلَ اليوم ٨٠٠ كغم علف» كتابتان: خصمٌ من `products.stock`
-- وسطرٌ بـ`poultry_use`. وبلا ذرّيّةٍ يقع أحدُ عطبين، وكلاهما صامت:
--   • نجحَ الخصمُ وفشل السطر ⇒ علفٌ اختفى من المخزن بلا أن يعرف أحدٌ أين ذهب.
--   • نجح السطرُ وفشل الخصم ⇒ كلفةٌ على الدفعة وبضاعةٌ تُعدّ مرّتين.
-- وهذا درسُ 0171 حرفياً («ازدواجٌ صامتٌ أسوأ من خسارةٍ ظاهرة») — فمعاملةٌ
-- واحدةٌ تقرأ الرصيدَ الحيَّ بـ`for update`.
--
-- ── الكلفةُ بسعر الشراء، بقرار المالك ───────────────────────────────────
-- «ما صار ربح على المنتج، استخدمه للحقل مالته، يعني صارت صرفية». فلا سعرَ
-- بيعٍ ولا هامش: `unit_cost = purchase_price` لحظةَ الصرف، وتُجمَّد بالسطر —
-- تغيّرُ سعرِ الشراء غداً لا يعيد كتابةَ كلفةِ أمس.
--
-- ── والرصيدُ يُترك يسلب عمداً ───────────────────────────────────────────
-- لو رفضنا الصرفَ حين لا يكفي الرصيد، لمنعنا الدكتورَ من تسجيل ما **حصل
-- فعلاً** لأن رقمَنا متأخّر — والدفترُ اليوميّ هو الحقيقة لا مخزوننا. ولو
-- قصصناه عند صفرٍ لضاع النقصُ بصمت. فيُسجَّل كما وقع، ويُرجَّع `shortfall`
-- كي تقولها الشاشةُ بصوت: «سجّلنا ٨٠٠ والمخزنُ كان ٥٠٠ — راجع المخزن».
-- رصيدٌ سالبٌ ظاهرٌ يُصلَّح، ونقصٌ مطموسٌ يُصدَّق.
--
-- ── الصلاحية ────────────────────────────────────────────────────────────
-- `security definer` لأنها تكتب بـ`products` (سياستُها كتابةٌ للمدير والطبيب)،
-- فتفحص العيادةَ والدورَ **بنفسها** — درس 0145: دالّةٌ بصلاحية المُستدعي كانت
-- تُرفض بـRLS أوّلَ نداء، والحزمةُ superuser فلا تمسكها.
--
-- تراجع: drop function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text);
-- تُطبَّق بعد 0191.
-- ============================================================================

create or replace function public.poultry_consume(
  p_cycle   uuid,
  p_kind    text,
  p_product uuid,
  p_name    text,
  p_qty     numeric,
  p_unit    text default null,
  p_on_date date default null,
  p_note    text default null
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

  select * into v_cycle from poultry_cycles where id = p_cycle and clinic_id = v_clinic;
  if not found then
    raise exception 'no_cycle' using hint = 'الدفعةُ غيرُ موجودة.';
  end if;
  -- دفعةٌ مغلقةٌ لا تُصرف عليها: كلفةٌ تُضاف بعد الجرد تُغيّر حصيلةً قيلت.
  if v_cycle.status <> 'active' then
    raise exception 'cycle_closed' using hint = 'الدفعةُ مغلقة — افتح دفعةً جديدة.';
  end if;

  if p_product is not null then
    -- `for update` يقفل الصفَّ حتى نهاية المعاملة: جهازان يصرفان معاً لا
    -- يقرآن نفسَ الرصيد القديم (نفسُ علّة 0171 الثانية).
    select * into v_prod from products where id = p_product and clinic_id = v_clinic for update;
    if not found then
      raise exception 'no_product' using hint = 'المادّةُ غيرُ موجودة بالمخزن.';
    end if;
    -- المادّةُ لازم تكون من مخزن **هذا الحقل**: صرفُ علبةِ قططٍ على دفعة
    -- دجاجٍ يفسد كلفةَ الدورة وقيمةَ مخزن العيادة معاً.
    if v_prod.farm_id is distinct from v_cycle.farm_id then
      raise exception 'not_farm_stock' using hint = 'المادّةُ ليست من مخزن هذا الحقل.';
    end if;
    v_cost  := coalesce(v_prod.purchase_price, 0);
    v_short := greatest(0, p_qty - coalesce(v_prod.stock, 0));
    update products set stock = coalesce(stock, 0) - p_qty where id = p_product;
  end if;

  insert into poultry_use (clinic_id, cycle_id, on_date, kind, product_id, name, qty, unit, unit_cost, line_cost, note)
  values (v_clinic, p_cycle, v_date, p_kind, p_product,
          coalesce(nullif(btrim(p_name), ''), v_prod.name, 'مادّة'),
          -- الوحدةُ من المُستدعي وحدَه: قراءةُ عمودٍ من `products` هنا تربط
          -- الدالّةَ بشكلٍ يختلف بين الحزمة والإنتاج، فتُفحص على غير ما تعمل.
          p_qty, p_unit, v_cost, round(v_cost * p_qty, 2), p_note)
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'use', to_jsonb(v_row),
    'stock_after', case when p_product is null then null else coalesce(v_prod.stock, 0) - p_qty end,
    'shortfall', v_short
  );
end $$;

revoke all on function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text) from public, anon;
grant execute on function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text) to authenticated;

comment on function public.poultry_consume(uuid, text, uuid, text, numeric, text, date, text) is
  'صرفٌ من مخزن الحقل على دفعة (0192): خصمٌ وسطرُ كلفةٍ بمعاملةٍ واحدة، بسعر الشراء، ويُرجّع النقصَ ليُقال بصوت.';

-- وحذفُ سطرٍ يرجّع بضاعتَه: تصحيحُ خطأِ إدخالٍ لا يترك رصيداً منقوصاً للأبد.
create or replace function public.poultry_unconsume(p_use uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := coalesce(auth_role(), '');
  v_use    poultry_use;
begin
  if v_clinic is null then raise exception 'no_clinic'; end if;
  if v_role not in ('manager','veterinarian') then
    raise exception 'not_allowed' using hint = 'حذفُ صرفٍ للمدير والطبيب.';
  end if;
  select * into v_use from poultry_use where id = p_use and clinic_id = v_clinic;
  if not found then return jsonb_build_object('ok', false, 'error', 'not_found'); end if;
  if v_use.product_id is not null then
    update products set stock = coalesce(stock, 0) + v_use.qty
     where id = v_use.product_id and clinic_id = v_clinic;
  end if;
  delete from poultry_use where id = p_use;
  return jsonb_build_object('ok', true, 'returned', v_use.qty);
end $$;

revoke all on function public.poultry_unconsume(uuid) from public, anon;
grant execute on function public.poultry_unconsume(uuid) to authenticated;
