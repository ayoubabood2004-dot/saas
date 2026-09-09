-- ============================================================================
-- ٠١٧٢ — الخادمُ يعرف صيغَ الماسح كما تعرفها الواجهة (س٥)
--
-- ── ما كان يحدث ──────────────────────────────────────────────────────────
-- طبقاتُ نجدة المسحة أربع، وكلُّها تدور على **القائمة المحمّلة بالمتصفّح**:
-- `findByCode` ثم `rescueScan` (صيغُ AIM والأصفار) ثم `matchTruncatedCode`.
-- والخادمُ لا يُسأل إلا بالرمز **كما وصل** — و`product_by_code` (0165) تطابق
-- بمساواةِ `inv_norm_code` وحدها: لا قشرَ لرأس AIM ولا صيغَ أصفار.
--
-- فمنتجٌ أُدخل بجهازٍ آخرَ قبل قليل (ليس بلقطة الشاشة أصلاً) ومُسح بماسحٍ
-- مضبوطٍ على AIM أو GTIN-14 يخيب بالطبقات الأربع كلِّها: القائمةُ لا تعرفه،
-- والخادمُ سُئل بالرمز الملبَّس. والنتيجةُ «مو موجود بمخزنك» عن مادّةٍ على
-- الرفّ — ومنها قرارُ «أُعيد إدخالها» الذي يصنع التوأمَ ويقسم الرصيد.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- الصيغُ تُحسب **داخل** القاعدة بنفس قواعد `scanVariants` بالواجهة:
--   · رأسُ AIM: `]` + حرف + رقم — ثلاثةُ محارفٍ تُقشَّر؛
--   · GTIN-14 بصفرٍ ⇒ EAN-13، وEAN-13 بصفرٍ ⇒ UPC-A، وUPC-A ⇒ EAN-13 بصفر،
--     وEAN-8 بصفر؛
--   · وثلاثُ خطواتٍ متتالية لا خطوةٌ واحدة، فسلسلةُ «AIM ثم 14 ثم 13» تكتمل.
-- ولا مسخَ تخطيطٍ عربيّ هنا: خريطتُه بيانات واجهةٍ (`arabicLayout.ts`)، ونسخُها
-- بالقاعدة نسختان تفترقان — وهي تُجرَّب بالواجهة قبل أن يُسأل الخادم أصلاً.
--
-- ── والصيغُ **لا** تُخلط بالمطابقة الحرفية ──────────────────────────────
-- الاستعلامُ استعلامان: الحرفيُّ أوّلاً بترتيب 0165 نفسِه بلا حرفٍ واحد يتغيّر،
-- ولا يُسأل عن الصيغ إلا إذا رجع **فارغاً**. والسبب أن `limit 2` إشارةُ التباسٍ
-- تصرخ بها الواجهة: لو خُلطت الصيغُ بالحرفيّ لصار رمزٌ يطابق صاحبَه حرفياً
-- ويطابق آخرَ بصيغةٍ ⇒ «رمزٌ ملتبس» على مسارٍ كان سليماً. الحرفيُّ يغلب
-- التخمين، دائماً.
--
-- ── لا صفَّ يُمَسّ ───────────────────────────────────────────────────────
-- قراءةٌ فقط. الدالّةُ بصلاحية المُستدعي كما كانت، فسياساتُ الصفوف تحصرها
-- بعيادة الطالب — والصيغُ لا توسّع ما يُرى، توسّع ما يُسأل عنه.
--
-- تراجع: أعد تعريف 0165 لـ`product_by_code`، واحذف الدالّتين المساعدتين.
-- ============================================================================

-- ── ١) خطوةُ توليدٍ واحدة: قشرُ AIM وصيغُ الأصفار ─────────────────────────
-- الشرطُ على المحرف الثاني `between 'a' and 'z'` وحده لأن `inv_norm_code` تخفض
-- الحالة قبل أن يصل النصُّ هنا. وطولُ ٤ فأكثر: قشرُ ثلاثةٍ من ثلاثةٍ يعطي فراغاً.
create or replace function public.inv_code_step(v text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select array_remove(array[
    case when length(v) >= 4 and left(v, 1) = ']'
              and substring(v from 2 for 1) between 'a' and 'z'
              and substring(v from 3 for 1) between '0' and '9'
         then substring(v from 4) end,
    case when v ~ '^[0-9]+$' and length(v) in (8, 13, 14) and left(v, 1) = '0'
         then substring(v from 2) end,
    case when v ~ '^[0-9]+$' and length(v) = 12
         then '0' || v end
  ], null);
$function$;

comment on function public.inv_code_step(text) is
  'خطوةُ توليدٍ واحدة لصيغِ رمزٍ ممسوح: قشرُ رأس AIM، وصيغُ أصفار GTIN/UPC/EAN. '
  'مرآةُ فرعَي scanVariants بالواجهة — أيُّ تغييرٍ هنا يوازيه تغييرٌ هناك.';

-- ── ٢) كلُّ الصيغ: ثلاثُ خطواتٍ متتالية ────────────────────────────────────
-- ثلاثٌ تكفي أطولَ سلسلةٍ واقعية: «]c1» + ١٤ رقماً بصفرين ⇒ قشرٌ ⇒ ١٣ ⇒ ١٢.
create or replace function public.inv_code_variants(p_code text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  with n  as (select inv_norm_code(p_code) as c),
       l1 as (select unnest(inv_code_step(c)) as c from n),
       l2 as (select unnest(inv_code_step(c)) as c from l1),
       l3 as (select unnest(inv_code_step(c)) as c from l2),
       every as (select c from n union select c from l1 union select c from l2 union select c from l3)
  select coalesce(array_agg(distinct c), '{}'::text[])
    from every
   where c is not null and c <> '';
$function$;

comment on function public.inv_code_variants(text) is
  'الصيغُ المعقولة لرمزٍ ممسوح، شاملةً الرمزَ المطبَّع نفسَه. للقراءة فقط.';

-- ── ٣) الاستدعاء: الحرفيُّ أوّلاً، والصيغُ عند خيبته وحدها ────────────────
create or replace function public.product_by_code(p_code text)
returns setof products
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_norm text;
  v_vars text[];
  v_n    integer;
begin
  if p_code is null or p_code = '' then return; end if;
  v_norm := inv_norm_code(p_code);

  -- (أ) الحرفيّ — ترتيبُ 0165 حرفاً بحرف: خامٌّ للأساسيّ، ثم مطبَّعٌ له، ثم الأقدم.
  -- و`coalesce(..., false)` لازمة: `barcode = p_code` تكون NULL بلا باركود،
  -- و`desc` يضع NULL أوّلاً — فكان صفٌّ بلا باركود يتصدّر تطابقاً حقيقياً.
  return query
    select p.* from products p
     where p.barcode = p_code
        or p.alt_codes @> array[p_code]
        or inv_norm_code(p.barcode) = v_norm
        or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                    where inv_norm_code(a) = v_norm)
     order by coalesce(p.barcode = p_code, false) desc,
              (inv_norm_code(p.barcode) = v_norm) desc,
              p.created_at asc
     limit 2;

  get diagnostics v_n = row_count;
  if v_n > 0 then return; end if;

  -- (ب) خاب الحرفيّ: صيغُ الماسح. والرمزُ المطبَّع مستثنىً — جُرِّب للتوّ.
  v_vars := array_remove(inv_code_variants(p_code), v_norm);
  if array_length(v_vars, 1) is null then return; end if;

  return query
    select p.* from products p
     where inv_norm_code(p.barcode) = any(v_vars)
        or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                    where inv_norm_code(a) = any(v_vars))
     order by (inv_norm_code(p.barcode) = any(v_vars)) desc,
              p.created_at asc
     limit 2;
end
$function$;

comment on function public.product_by_code(text) is
  'استدعاءُ منتجٍ برمزه — حتميُّ الترتيب (خامٌّ ثم مطبَّعٌ ثم الأقدم). وعند خيبةِ '
  'الحرفيّ وحدها تُجرَّب صيغُ الماسح (رأسُ AIM، أصفارُ GTIN/UPC) بـ0172. '
  'limit 2 عمداً: الصفُّ الثاني إشارةُ التباسٍ تعرضها الواجهة، لا نتيجةٌ تُباع.';

revoke all on function public.inv_code_step(text) from public, anon;
revoke all on function public.inv_code_variants(text) from public, anon;
grant execute on function public.inv_code_step(text) to authenticated, service_role;
grant execute on function public.inv_code_variants(text) to authenticated, service_role;
revoke all on function public.product_by_code(text) from public, anon;
grant execute on function public.product_by_code(text) to authenticated, service_role;
