-- ============================================================================
-- ٠١٧٣ — الصيغةُ الأسبقُ تغلب، والحرفُ يُقاس بالحرف لا بترتيب المقارنة
--
-- 0172 نزلت قبل ساعةٍ من هذه، ولم تصلها واجهةٌ منشورة بعد. أمسكت المراجعةُ
-- الخصميّة عليها عطلَين، والأوّلُ منهما يبيع منتجاً غيرَ الذي تبيعه الشاشة.
--
-- ── (١) الاتحادُ على الصيغ يكسر حتميّةَ «نفسُ الرمز نفسُ المنتج» ─────────
-- 0172 كانت تطابق `= any(v_vars)` — اتحاداً على **كلّ** الصيغ — ثم ترتّب
-- بالأقدم. والواجهة (`rescueScan`) تمشي الصيغَ **واحدةً واحدة بترتيبها**
-- وتقف عند أوّل صيغةٍ لها مطابقةٌ واحدة. فالطرفان يختاران مختلفَين.
--
-- المقيسُ بزوجِ UPC-A/EAN-13 — وهو الزوجُ الذي يصنعه الماسحُ نفسُه:
--   w1 = «045496830434»   أُنشئ ٢٠٢٦-٠١-٠٤
--   w2 = «0045496830434»  أُنشئ ٢٠٢٦-٠١-٠٢
--   المسحة: «]c1045496830434»  ⇒ الصيغُ بالترتيب: [045496830434, 0045496830434]
--   الواجهة  ⇒ w1 (أوّلُ صيغةٍ لها مطابقةٌ واحدة، بلا التباس)
--   0172     ⇒ w2 (الاتحادُ يجمعهما، والأقدمُ يفوز) + صرخةُ «رمزٌ ملتبس»
-- فنفسُ العلبة تبيع مادّةً إن حسمتها القائمةُ المحمّلة وأخرى إن حسمها الخادم،
-- ومعها إنذارُ التباسٍ كاذب على مسارٍ نظيف. وهذا نقضٌ للثابت الخامس بالعقد.
--
-- الإصلاح: تُنتقى **أوّلُ صيغةٍ لها مطابقة** بترتيب `inv_code_variants`، ثم
-- تُرجع صفوفُها وحدها (بسقف صفَّين كما كان). فيتطابق الطرفان بالبناء لا بالحظّ.
-- و`limit 2` يبقى إشارةَ التباسٍ **داخل الصيغة الواحدة**، وهو المعنى الصحيح.
--
-- ── (٢) `between 'a' and 'z'` رهنُ ترتيبِ المقارنة لا محارفِ ASCII ───────
-- الواجهةُ تختبر `[A-Za-z]` و`\d` — ASCII قطعاً. والقاعدةُ كانت تختبر
-- `between 'a' and 'z'`، وذاك يتبع collation: بـ`en_US.UTF-8` تقع «é» داخل
-- المدى. فيقشّر الخادمُ رأساً لا تقشّره الواجهة — انحرافُ مرآةٍ صامت، وهو
-- الصنفُ الذي تحرّمه CLAUDE.md §٣ بالنصّ. تصير الاختباراتُ عضويّةً بالمحارف:
-- `strpos` على سلسلةٍ صريحة، و`translate` لفحص «أرقامٌ فقط».
--
-- وحارسٌ يمنع رجوعَها: `scripts/code-norm-parity.mjs` صار يولّد
-- `_code_variants_fixture` كما يولّد فحصَ التطبيع، و`run.sh` يقارن مجموعةَ
-- القاعدة بمجموعة الواجهة على مئةِ قيمةٍ ونيّف. مرآةٌ بلا فحصٍ تنحرف.
--
-- لا صفَّ يُمَسّ. قراءةٌ فقط، وبصلاحية المُستدعي كما كانت.
-- تراجع: أعد تعريفَي 0172 — وسيعود اختيارُ منتجٍ غيرِ الذي تختاره الشاشة.
-- ============================================================================

-- ── ١) الخطوةُ تختبر المحارفَ لا ترتيبَ المقارنة ─────────────────────────
create or replace function public.inv_code_step(v text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  select array_remove(array[
    -- رأسُ AIM: `]` + حرفٌ لاتينيّ + رقم. و`inv_norm_code` تخفض الحالة قبلها.
    case when length(v) >= 4 and left(v, 1) = ']'
              and strpos('abcdefghijklmnopqrstuvwxyz', substring(v from 2 for 1)) > 0
              and strpos('0123456789', substring(v from 3 for 1)) > 0
         then substring(v from 4) end,
    -- «أرقامٌ فقط» بلا صنفِ محارفَ رهنِ الترتيب: انزع الأرقامَ فإن بقي شيءٌ فلا.
    case when v <> '' and translate(v, '0123456789', '') = ''
              and length(v) in (8, 13, 14) and left(v, 1) = '0'
         then substring(v from 2) end,                                    -- GTIN-14/EAN-13/EAN-8 بصفر
    case when v <> '' and translate(v, '0123456789', '') = ''
              and length(v) = 12
         then '0' || v end                                                -- UPC-A → EAN-13 مخزون بصفر
  ], null);
$function$;

comment on function public.inv_code_step(text) is
  'خطوةُ توليدٍ واحدة لصيغِ رمزٍ ممسوح: قشرُ رأس AIM، وصيغُ أصفار GTIN/UPC/EAN. '
  'مرآةُ فرعَي scanVariants بالواجهة — يحرس تطابقَهما _code_variants_fixture '
  'بحزمة run.sh. اختباراتُ المحارف عضويّةٌ لا رهنَ ترتيبِ مقارنةٍ (0173).';

-- ── ٢) وترتيبُ الصيغ هو ترتيبُ توليدها، لا ترتيبُ حروفها ─────────────────
-- `array_agg(distinct c)` **يرتّب بالقيمة** — فمجموعةُ «]c1045496830434» كانت
-- تخرج [0045496830434, 045496830434] لأن «00» تسبق «04» أبجدياً، بينما تولّدها
-- الواجهةُ [045496830434, 0045496830434] (قشرُ الرأس أوّلاً، ثم صفرُ الاثنتَي
-- عشرة). فينتقي الطرفان صيغتَين مختلفتَين ⇒ منتجَين مختلفَين. أي أن ترتيبَ
-- التوليد **جزءٌ من العقد** لا تفصيلَ عرض: `rescueScan` تقف عند أوّل صيغةٍ
-- مصيبة، فمن يرتّب غيرَ ترتيبها يبيع غيرَ ما تبيع.
-- فالترتيبُ يُحمل صراحةً: مستوى الاتّساع أوّلاً ثم موضعُ التوليد داخله، وأوّلُ
-- ظهورٍ يحكم. و`inv_code_step` تُرجع ثلاثةَ عناصرَ فأقلّ فلا تتداخل المراتب.
create or replace function public.inv_code_variants(p_code text)
returns text[]
language sql
immutable
set search_path to 'public'
as $function$
  with n as (select inv_norm_code(p_code) as c),
       l1 as (select t.v as c, t.ord as o1
                from n, unnest(inv_code_step(n.c)) with ordinality as t(v, ord)),
       l2 as (select t.v as c, l1.o1, t.ord as o2
                from l1, unnest(inv_code_step(l1.c)) with ordinality as t(v, ord)),
       l3 as (select t.v as c, l2.o1, l2.o2, t.ord as o3
                from l2, unnest(inv_code_step(l2.c)) with ordinality as t(v, ord)),
       every as (
         select c, 0::bigint as ord from n
         union all select c, 1000 + o1 * 100                    from l1
         union all select c, 2000 + o1 * 100 + o2 * 10          from l2
         union all select c, 3000 + o1 * 100 + o2 * 10 + o3     from l3
       ),
       firsts as (
         select c, min(ord) as ord from every
          where c is not null and c <> ''
          group by c
       )
  select coalesce(array_agg(c order by ord), '{}'::text[]) from firsts;
$function$;

comment on function public.inv_code_variants(text) is
  'الصيغُ المعقولة لرمزٍ ممسوح، شاملةً الرمزَ المطبَّع نفسَه، **بترتيب توليدها** '
  'لا بترتيب حروفها (0173): الترتيبُ جزءٌ من العقد لأن الانتقاء يقف عند أوّل '
  'صيغةٍ مصيبة. للقراءة فقط.';
-- ── ٣) الاستدعاء: أوّلُ صيغةٍ لها مطابقة، لا اتحادٌ على الصيغ ─────────────
create or replace function public.product_by_code(p_code text)
returns setof products
language plpgsql
stable
set search_path to 'public'
as $function$
declare
  v_norm text;
  v_vars text[];
  v_pick text;
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

  -- أوّلُ صيغةٍ لها مطابقة **بترتيبها** — نظيرُ `rescueScan` بالواجهة تماماً.
  select t.v into v_pick
    from unnest(v_vars) with ordinality as t(v, ord)
   where exists (
     select 1 from products p
      where inv_norm_code(p.barcode) = t.v
         or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                     where inv_norm_code(a) = t.v))
   order by t.ord
   limit 1;
  if v_pick is null then return; end if;

  -- وصفوفُ تلك الصيغة وحدها: `limit 2` التباسٌ **داخلها**، لا خلطُ صيغتَين.
  return query
    select p.* from products p
     where inv_norm_code(p.barcode) = v_pick
        or exists (select 1 from unnest(coalesce(p.alt_codes, '{}')) a
                    where inv_norm_code(a) = v_pick)
     order by (inv_norm_code(p.barcode) = v_pick) desc,
              p.created_at asc
     limit 2;
end
$function$;

comment on function public.product_by_code(text) is
  'استدعاءُ منتجٍ برمزه — حتميُّ الترتيب (خامٌّ ثم مطبَّعٌ ثم الأقدم). وعند خيبةِ '
  'الحرفيّ وحدها تُجرَّب صيغُ الماسح، **صيغةً صيغةً بترتيبها** كما تفعل '
  'rescueScan بالواجهة (0173) — لا اتحاداً عليها يبيع غيرَ ما تبيعه الشاشة. '
  'limit 2 عمداً: الصفُّ الثاني إشارةُ التباسٍ تعرضها الواجهة، لا نتيجةٌ تُباع.';

revoke all on function public.inv_code_step(text) from public, anon;
revoke all on function public.inv_code_variants(text) from public, anon;
grant execute on function public.inv_code_variants(text) to authenticated, service_role;
grant execute on function public.inv_code_step(text) to authenticated, service_role;
revoke all on function public.product_by_code(text) from public, anon;
grant execute on function public.product_by_code(text) to authenticated, service_role;
