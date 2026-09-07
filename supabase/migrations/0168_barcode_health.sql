-- ============================================================================
-- ٠١٦٨ — صحّةُ الباركودات: مراقبةٌ دائمة لا فحصَ مرّة (C1)
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- الحرّاسُ التي نزلت (0164–0167) تمنع الخطأ **من اليوم فصاعداً**: التطبيعُ
-- موحَّد، والمطابقةُ تقرأ الرموزَ الإضافية، والتوأمُ مرفوضٌ عند الكتابة. لكنّ
-- ما دخل قبلها باقٍ كما هو — والخطُّ الأحمر الأوّل يمنع «التنظيف» الجماعيّ:
-- بياناتُ العيادة تبقى كما أدخلها أصحابُها، والإصلاحُ وقتَ المطابقة.
--
-- فالباقي أن **تُرى**. عيادةٌ لا تعرف أن عندها رمزَين متوأمَين لا تصلحهما،
-- وتظلّ تشتكي «المادة تختفي». وهذه الدالّةُ تعرض ما هو قائمٌ الآن — قراءةً
-- فقط، بلا زرِّ إصلاحٍ جماعيّ، والإرشادُ اليدويُّ لكلّ نوعٍ بالواجهة.
--
-- ── الأنواع الخمسة ───────────────────────────────────────────────────────
--   twin       رمزٌ (مطبَّعاً) على أكثر من منتج **بلا صاحبٍ أوحد**: أساسيٌّ عند
--              اثنين فأكثر، أو إضافيٌّ عند اثنين وليس أساسياً عند أحد. المسحةُ
--              هنا تختار بلا قاعدة، والعلاجُ الدمج.
--   alt_owned  رمزٌ إضافيٌّ عند منتج، وهو **الأساسيّ** لمنتجٍ واحدٍ غيره. هذا
--              مُحسَمٌ لا ملتبس: 0166 يقدّم الأساسيَّ، فالمسحةُ تذهب لصاحبها
--              الأصيل و«المستعير» لا يُلقى بهذا الرمز أبداً — يُبلَّغ صاحبُ
--              المخزن لأن ظاهرَه أنه يملكه. ويُعرض المستعيرُ وحده لا الصاحب.
--
--   وهما قسمةٌ لا تتداخل: عددُ من يملكه أساسياً ≠ ١ ⇒ توأم، و= ١ ⇒ استعارة.
--   (أوّلُ صياغةٍ جعلت `alt_owned` شرطَها «ليس بالتوائم» — وكلُّ رمزٍ مستعارٍ
--    توأمٌ بذلك التعريف، ففرعٌ ميّتٌ لا يُنتج صفّاً أبداً. أمسكه بناءُ فحصِ
--    الحزمة قبل أن يشحن: فحصٌ يطلب من كلّ نوعٍ صفّاً يكشف نوعاً مستحيلاً.)
--   arabic     باركودٌ فيه حروفٌ عربية — الغالبُ أن الكيبورد كان عربياً وقت
--              المسح (G7). حالةٌ حقيقية بالإنتاج كانت رمزَ QR لرابط.
--   excel      شكلٌ علميّ (`1.23E+12`) أو ذيلُ `.0` — أفسده إكسل عند اللصق،
--              والأصلُ **لا يُسترجع** منه.
--   empty      رمزٌ غيرُ فارغٍ خامّاً ويصير فارغاً بعد التطبيع: كلُّه محارفُ
--              اتجاهٍ أو مسافات. يبدو موجوداً ولا يُطابق شيئاً أبداً.
--
-- ── الصلاحية ─────────────────────────────────────────────────────────────
-- `security definer` بمسارٍ مثبَّت، وللمدير والطبيب وحدهما، ومحصورةٌ بعيادة
-- المُستدعي (`auth_clinic()`) — فلا ترى عيادةٌ رموزَ أخرى أبداً. ولا تُمنح
-- لـ`anon` (0163: من يقدر ينادي ماذا).
--
-- ── لماذا لا نصَّ عربياً بالمخرَج ─────────────────────────────────────────
-- ترجع `kind` وحده، والشرحُ والإرشادُ من `t()` بالواجهة. جملةٌ تُبنى بالقاعدة
-- لا تمرّ بحارس الترجمة ولا تُترجَم يومَ تُترجَم الواجهة — والأساسُ الإنكليزية.
-- ولنفس السبب أسماءُ الأعمدة لاتينية (بخلاف `verify_rls_coverage` 0160 التي
-- تُقرأ بـpsql ولا تصل واجهةً).
--
-- ولا تكتب شيئاً: `stable`. تُطبَّق بعد 0167.
-- ============================================================================

create or replace function public.verify_barcode_health()
returns table (kind text, product_id uuid, product_name text, code text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  if v_role is null or v_role not in ('manager','veterinarian') then
    raise exception 'forbidden: inventory role required';
  end if;

  return query
  -- كلُّ رموز العيادة بمكانٍ واحد: الأساسيُّ والإضافيّ، مطبَّعَين.
  with codes as (
    select p.id, p.name, p.barcode as raw, inv_norm_code(p.barcode) as norm, true as is_primary
      from products p
     where p.clinic_id = v_clinic and coalesce(p.barcode, '') <> ''
    union all
    select p.id, p.name, a.code, inv_norm_code(a.code), false
      from products p, unnest(coalesce(p.alt_codes, '{}')) as a(code)
     where p.clinic_id = v_clinic and coalesce(a.code, '') <> ''
  ),
  -- لكلّ رمزٍ مطبَّع: كم منتجاً يحمله، وكم منهم يحمله **أساسياً**.
  spread as (
    select norm,
           count(distinct id) as n_all,
           count(distinct id) filter (where is_primary) as n_prim
      from codes where norm <> '' group by norm
  )
  -- ١) توأمٌ مطبَّع: مشتَرَكٌ بلا صاحبٍ أوحد
  select 'twin'::text, c.id, c.name, c.raw
    from codes c join spread s on s.norm = c.norm
   where s.n_all > 1 and s.n_prim <> 1

  union all
  -- ٢) رمزٌ إضافيٌّ صاحبُه الأصيل غيرُه — ويُعرض المستعيرُ وحده
  select 'alt_owned'::text, c.id, c.name, c.raw
    from codes c join spread s on s.norm = c.norm
   where s.n_all > 1 and s.n_prim = 1 and not c.is_primary
     -- ومنتجٌ كتب رمزَه الأساسيَّ بإضافيّاته أيضاً ليس مستعيراً من نفسه.
     and not exists (select 1 from codes o where o.norm = c.norm and o.is_primary and o.id = c.id)

  union all
  -- ٣) حروفٌ عربية بالباركود
  select 'arabic'::text, p.id, p.name, p.barcode
    from products p
   where p.clinic_id = v_clinic and p.barcode ~ '[ء-ي]'

  union all
  -- ٤) شكلُ إكسل
  select 'excel'::text, p.id, p.name, p.barcode
    from products p
   where p.clinic_id = v_clinic
     and (p.barcode ~ '^[0-9]+(\.[0-9]+)?[Ee][+-]?[0-9]+$' or p.barcode ~ '^[0-9]{6,}\.0+$')

  union all
  -- ٥) رمزٌ يفرغ بعد التطبيع
  select 'empty'::text, p.id, p.name, p.barcode
    from products p
   where p.clinic_id = v_clinic
     and coalesce(p.barcode, '') <> '' and inv_norm_code(p.barcode) = ''

  order by 1, 3;
end;
$function$;

revoke all on function public.verify_barcode_health() from public, anon;
grant execute on function public.verify_barcode_health() to authenticated;

comment on function public.verify_barcode_health() is
  'صحّةُ باركودات العيادة الحالية — قراءةٌ فقط، بلا إصلاحٍ جماعيّ (الخط الأحمر '
  'الأوّل: بياناتُ العيادة تبقى كما أدخلها أصحابُها). خمسةُ أنواع بـkind: twin، '
  'alt_owned، arabic، excel، empty — وشرحُ كلٍّ منها بالواجهة لا هنا.';
