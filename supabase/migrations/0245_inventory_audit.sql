-- ============================================================================
-- ٠٢٤٥ — فحصُ المخزن: ما وجده جردُ «ابن الهيثم» باليد، تراه كلُّ عيادةٍ بنفسها
--
-- ── لماذا ────────────────────────────────────────────────────────────────
-- جردٌ كامل لعيادةٍ واحدة (١٬١٠١ مادة، ١٨/١٠) بسكربتاتٍ يدوية وجد: ٩٩ مادةً بلا
-- باركود و١٦٠ رمزاً مكتوباً باليد (مصدرُ التوائم الأوّل)، و١٧ مكرّرة أغلبُها توأمُ
-- «رقمِ رفٍّ» لمادةٍ مسجّلةٍ بباركود المصنع، وكميّتين مستحيلتين قيمتُهما ١١٦ مليوناً
-- من ١٧٧ (حقيبةٌ برصيد ١٠٬٠٠٠، وويسكاس ١٬٧٢٨ مغلّفاً كُتبت علباً)، و٥٣٦ بلا شركة،
-- و٢٩٠ راكدة. التقريرُ نسخةٌ واحدة لعيادةٍ واحدة بيومٍ واحد — وهذه الدالّةُ تجعله
-- نظرةً دائمة: تحسب الشيءَ نفسَه لعيادة المُستدعي ساعةَ يطلبه.
--
-- ── الخطُّ الأحمر ────────────────────────────────────────────────────────
-- قراءةٌ فقط (`stable`، لا كتابةَ بأيّ جدول ولا سجلّ). لا زرَّ إصلاحٍ جماعيّ ولا
-- دمجَ تلقائيّ: بياناتُ العيادة تبقى كما أدخلها أصحابُها، والإصلاحُ يدويٌّ مادةً
-- مادة بطريقه الموجود بالتطبيق (الواجهة تقول الطريق لكلّ نوع). و«مكرّرٌ محتمل»
-- يُعرض «افحص» لا «ادمج»: مقيسٌ أن ٣٤ مجموعةً بنفس الاسم أغلبُها نكهاتٌ مختلفة
-- بباركوداتِ مصنعٍ مختلفة — والقرارُ لمن يرى العلبة.
--
-- ── تُكمل 0168 ولا تكرّرها ───────────────────────────────────────────────
-- `verify_barcode_health()` تبقى لما تعرفه (توأم، مستعير، عربيّ، إكسل، فارغ)،
-- والصفحةُ تناديهما معاً. فهنا: «بلا باركود» = الحقلُ فارغٌ خامّاً (الفارغُ بعد
-- التطبيع لـ0168)، والرمزُ العربيّ وشكلُ إكسل يُتركان لها (`inv_code_kind` = skip).
--
-- ── الأنواع (kind / why) ─────────────────────────────────────────────────
--   no_code        الأساسيُّ فارغٌ خامّاً ولا إضافيَّ يُمسح (الفارغُ والمشوَّه لا يُعدّان).
--   hand_code      رمزٌ مكتوبٌ باليد: short (أقلّ من ٨)، length (أرقامٌ بطولٍ ليس
--                  GTIN)، check (طولُ GTIN ورقمُ التحقق خطأ)، pattern (تحققٌ سليم
--                  وتسلسلُ ٧، أو ستّةٌ من رقمٍ غير الصفر، أو ستّةُ أصفارٍ بأوّله، أو عشرةٌ بأيّ
--                  موضع — مقيسٌ: 6901234567892 و15666666 وأخواتها. والأصفارُ بالوسط دون العشرة
--                  لا تُعدّ: بادئةٌ تنتهي بأصفارٍ ورقمُ مادةٍ 00000 تصنعها بباركودٍ حقيقيّ (UPC
--                  كوكاكولا 049000000443 بستّة)؛ و«نمطٌ» كاذبٌ يصير «رفّاً» فيُقترح دمجُه بغيره)، internal (٢٠–٢٩
--                  بـ١٣ رقماً وليس بسجلّ مولّد العيادة)، ean8_prefix (EAN-8 هو أوّلُ ثمانيةٍ
--                  من EAN-13 مادةٍ أخرى). ومادةٌ أحدُ رموزها الإضافية باركودُ مصنعٍ سليم لا
--                  تُعدّ: المسحُ يجدها. ومادةٌ فرغ أساسيُّها تُحكم بأوّل إضافيٍّ يُمسح (لا الفارغ ولا المشوَّه).
--   dup_twin       نفسُ الاسم (search_norm، مرآةُ searchable) وفيها صفٌّ «رفّ» (بلا رمز
--                  أو رمزٌ باليد) وصفٌّ بباركود مصنع — النمطُ المقيس. why: shelf/factory/other.
--   dup_name       نفسُ الاسم بلا ذلك النمط (رموزٌ مختلفة أو فارغة) — «افحص».
--   impossible     رصيدٌ يحتاج أكثرَ من سنةٍ ليُباع بمعدّل نافذته (أو لا بيعَ بالمدّة وعمرُها ≥ ٧ أيام) **و**:
--                  value  قيمتُه ≥ ١٠٠ × وسيطِ قيم مواد العيادة (مقيسٌ على الإنتاج: يلتقط
--                         الحقيبةَ والويسكاس وحدهما من ١١٠١، ومادةً واحدة بعيادةٍ أخرى،
--                         وصفراً بعيادة ٥٨ مادة — حيث «٥٪ من المجموع» كان يلتقط أربعاً)؛
--                  units  مادةٌ بوحدةٍ فرعية: (الرصيدُ + كلُّ ما بيع) مضاعَفٌ تامّ لعدد
--                         الوحدات بالعلبة، ≥ عشرة أضعافه — عددُ وحداتٍ كُتب علباً.
--                         (مقيسٌ: صفٌّ واحد بكلّ العيادات — الويسكاس.)
--   never_sold     رصيدٌ ولا بيعَ قطّ، وعمرُ المادة ≥ ٣٠ يوماً.          days = العمر
--   stopped        رصيدٌ وآخرُ بيعٍ قبل أكثر من ٣٠ يوماً.               days = منذ آخر بيع
--   slow           بيعت بآخر ٣٠ يوماً، وعمرُها ≥ ٣٠ يوماً، ورصيدُها يكفي > ١٨٠ يوماً بمعدّل
--                  نافذتها. days = الكفاية. (والمستحيلُ لا يُعدّ راكداً: يُصلَّح رقمُه أوّلاً.)
--   zero_sold      رصيدُ البيع (الصفّ + حوضُ قسمه، `sellable.ts`) صفرٌ أو أقلّ، وبيعت
--                  بآخر ٣٠ يوماً.                                          qty = مبيعُ ٣٠ يوماً
--   no_company     بلا شركة. why = hint حين تشترك مع موادّ شركةٍ **واحدة** بأوّل ٧ أرقام
--                  من باركود المصنع — والشركةُ المقترحة بـcompany_id/company_name.
--   prefix_split   أوّلُ ٧ أرقام (بادئةُ المصنع) على موادّ بشركتين فأكثر. grp = البادئة.
--
-- ── المدّة ───────────────────────────────────────────────────────────────
-- (p_from, p_to) نافذةُ معدّل البيع (٧–٤٠٠ يوم)، و**كلُّ حسابٍ نسبيّ يُقاس من p_to**
-- لا من now(): «آخر ٣٠ يوماً» و«العمر» و«منذ آخر بيع». فالدالّةُ تحسب ما تحسبه
-- مرآتُها (`src/lib/inventoryAudit.ts`) حرفاً بحرف على قالبٍ ثابت (audit-parity).
-- البيعُ كتعريف report_top_products: فواتيرُ العيادة غيرُ المردودة، والصافي بسطور
-- الإرجاع السالبة، وبمكافئ العلبة (`coalesce(stock_qty, qty)`) لأن الرصيدَ بالعلب.
-- والجمعُ بالقاعدة (قاعدةُ 0149) — لا سطرَ فاتورةٍ يعبر للمتصفّح.
-- والكفايةُ بالأيام سقفُها ٣٦٥٠٠ (مئةُ سنة): رصيدٌ خياليّ (باركودٌ لُصق بخانة الرصيد) ومبيعٌ
-- بجزءٍ من ألف كانا يتجاوزان int فيُسقطان الفحصَ كلَّه للعيادة — ساعةَ أحوجِ ما تكون إليه.
--
-- **نافذةُ كلّ مادة** (`ve`) = أقلُّ المدّة وعمرِها، وعمرُها من أقدمِ إنشائها وأوّلِ بيعٍ لها (الدمجُ
-- ينقل إلى الباقي بيعاً أقدمَ منه) — وأقلُّها يومٌ واحد. فالمعدّلُ مبيعُ المدّة ÷ ما عاشته منها: مادةٌ
-- عمرُها ١٥ يوماً تبيع واحدةً يومياً برصيد ٤٠ كانت تُقسَّم على ٩٠ فتُقال «تكفي ٢٤٠ يوماً — بطيئة»
-- وتُطبع «بطيء» على ورقة الجرد مع نصيحة الإرجاع. مقيسٌ بـ«ابن الهيثم» (١٨/١٠، ٩٠ يوماً): البطيئة
-- ٢٢٢ ⇒ ١٣٩ (١٥٨ بالنافذة وحدها، ثم شرطُ العمر). و«البطيئة» تحتاج عمراً ≥ ٣٠ يوماً كـnever_sold:
-- أقلُّ منه لا معدّلَ يُحكم به.
-- و«لا بيعَ بالمدّة» في المستحيل يحتاج عمراً ≥ ٧ أيام (أقصرُ مدّةٍ تقبلها الدالّة) لا ٣٠: بضاعةٌ
-- وصلت أمس بقيمةٍ كبيرة ليست «مستحيلة» بعد، لكن مقيسٌ أن هذا الفرعَ بكلّ العيادات (١٩/١٠) يلتقط
-- مادةً واحدة — حقيبةُ ابن الهيثم، ١٠٠ مليون، ٥٦٪ من قيمة المخزن، عمرُها ٢٥ يوماً يومَ الجرد بلا
-- بيعةٍ قطّ. شرطُ الثلاثين كان يُخفيها حتى ٢٣/١٠، وهي أكبرُ ما وجده الجرد.
--
-- ── النداء ───────────────────────────────────────────────────────────────
-- الواجهةُ تنادي `report_inventory_audit_json(p_days)` مرّةً واحدة: مصفوفةٌ واحدة من لقطةٍ واحدة.
-- أثقلُ عيادةٍ ~١٦٠٠ ملاحظة فوق سقف الصفوف (ألف)، وصفحاتٌ بإزاحةٍ تعيد الحسابَ كلَّه لكلّ
-- صفحة، وتغيّرٌ بينها يزيح الصفوف فيتكرّر صفٌّ أو يسقط. الجدولُ يبقى للحزمة والمرآة.
-- و**النافذةُ بساعة الخادم** (`now()`) لا بساعة الجهاز: حاسوبٌ متأخّرٌ خمسةَ أيام كان يُسقط
-- آخرَ خمسة أيام بيعٍ بصمت (فتصير موادُّ تُباع «وقفت» أو «ما انباعت»). فالواجهةُ ترسل عددَ الأيام وحده.
--
-- ── الصلاحية ─────────────────────────────────────────────────────────────
-- `security definer` بمسارٍ مثبَّت، للمدير والطبيب وحدهما، ومحصورةٌ بـ`auth_clinic()`
-- (فالمشغّلُ الداخلُ عيادةً يراها كمديرها — 0151 — ولا أثرَ: لا كتابة). وموظّفُ
-- التصوير مرفوضٌ بالدور الأساس هنا، و**ليست بقائمة `api_gate`** (0222/0233) فالبوّابةُ
-- ترفضه قبلها — طبقتان. لا جدولَ جديد فلا سياجَ جديد. ولا تُمنح لـanon.
-- و`is_photographer()` تُسأل بـexecute إن وُجدت: تراجعُ 0222 الموثَّق يحذفها (ومعها المصوّرون
-- يُعلَّقون)، ونداءٌ ثابتٌ كان سيُسقط الفحصَ لكلّ عيادةٍ بعده بـ42883.
--
-- لا نصَّ عربيَّ بالمخرَج (كـ0168): kind/why لاتينيان، والشرحُ والطريقُ بـt() بالواجهة.
--
-- تراجع: drop function report_inventory_audit_json(int);
--        drop function report_inventory_audit(timestamptz, timestamptz);
--        drop function inv_code_kind(text); drop function inv_gtin_ok(text);
--        والواجهةُ القديمة لا تناديها.
-- تُطبَّق بعد 0244. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

set lock_timeout = '5s';

-- ── ١) رقمُ التحقق لـGTIN-8/12/13/14 ────────────────────────────────────────
-- الأوزانُ من اليمين: الرقمُ الذي يسبق رقمَ التحقق ×٣ ثم ×١ بالتناوب. و`case`
-- يحرس التحويل: `and` لا يضمن ترتيبَ التقييم، و`::int` على حرفٍ يرمي.
create or replace function public.inv_gtin_ok(v text)
returns boolean
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when coalesce(v, '') ~ '^[0-9]+$' and length(v) in (8, 12, 13, 14) then
      (10 - (select sum(substr(v, length(v) - i, 1)::int * (case when i % 2 = 1 then 3 else 1 end))
               from generate_series(1, length(v) - 1) as i) % 10) % 10 = right(v, 1)::int
    else false
  end
$function$;

-- ── ٢) شكلُ الرمز — مرآتُه `codeKind` بـinventoryAudit.ts ──────────────────
-- none | skip (عربيّ/إكسل — لـ0168) | short | alnum | length | check | internal |
-- pattern | ean8 | gtin. والترتيبُ مقصود: «internal» قبل «pattern» لأن مولّدنا يبدأ
-- بـ2000000000008 (عشرةُ أصفار) وهو سليمٌ إن كان بسجلّ العيادة.
create or replace function public.inv_code_kind(v text)
returns text
language sql
immutable
set search_path to 'public'
as $function$
  select case
    when n = '' then 'none'
    when n ~ '[ء-ي]'
      or raw ~ '^[0-9]+(\.[0-9]+)?[Ee][+-]?[0-9]+$'
      or raw ~ '^[0-9]{6,}\.0+$' then 'skip'
    when length(n) < 8 then 'short'
    when n !~ '^[0-9]+$' then 'alnum'
    when length(n) not in (8, 12, 13, 14) then 'length'
    when not inv_gtin_ok(n) then 'check'
    when length(n) = 13 and left(n, 1) = '2' then 'internal'
    when n ~ '([1-9])\1{5}' or n ~ '^0{6}' or n ~ '0{10}'
      or n ~ '(0123456|1234567|2345678|3456789|6543210|7654321|8765432|9876543)' then 'pattern'
    when length(n) = 8 then 'ean8'
    else 'gtin'
  end
  from (select inv_norm_code(v) as n, coalesce(v, '') as raw) s
$function$;

revoke all on function public.inv_gtin_ok(text) from public, anon;
revoke all on function public.inv_code_kind(text) from public, anon;
grant execute on function public.inv_gtin_ok(text) to authenticated;
grant execute on function public.inv_code_kind(text) to authenticated;

-- ── ٣) الفحص ────────────────────────────────────────────────────────────────
create or replace function public.report_inventory_audit(p_from timestamptz, p_to timestamptz)
returns table (
  kind text, why text, product_id uuid, product_name text, code text, grp text,
  stock numeric, value numeric, qty numeric, days int,
  company_id uuid, company_name text)
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare
  v_clinic uuid := auth_clinic();
  v_role   text := auth_role();
  v_days   numeric;
  v_30     timestamptz;
  v_pho    boolean := false;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  -- الدورُ الأساس للمصوّر: رفعُ PIN المدير لا يفتحها له (0222). وبـexecute: تراجعُ 0222 يحذف
  -- الدالّة، ونداءٌ ثابتٌ يُحلَّل ساعةَ التنفيذ فيرمي 42883 لكلّ مُستدعٍ بعده.
  if to_regprocedure('public.is_photographer()') is not null then
    execute 'select public.is_photographer()' into v_pho;
  end if;
  if v_role is null or v_role not in ('manager', 'veterinarian') or coalesce(v_pho, false) then
    raise exception 'forbidden: inventory role required' using errcode = '42501';
  end if;
  if p_from is null or p_to is null or p_to <= p_from
     or p_to - p_from < interval '7 days' or p_to - p_from > interval '400 days' then
    raise exception 'bad range: 7..400 days' using errcode = '22023';
  end if;
  v_days := extract(epoch from (p_to - p_from)) / 86400.0;
  -- ٧٢٠ ساعة لا «30 days»: الفترةُ بالأيام على timestamptz تتبع توقيتَ الجلسة الصيفيّ،
  -- فتختلف ساعةً عن المرآة (ملّي ثانية ثابتة) بمنطقةٍ لها صيف.
  v_30   := p_to - make_interval(hours => 720);

  return query
  with
  -- مخزنُ العيادة وحده (لا مخزنَ الحقل — 0191)، وشكلُ رمز كلّ مادة مرّةً واحدة. والرمزُ
  -- المحكومُ (`ec`) الأساسيّ، أو أوّلُ إضافيٍّ **يُمسح** إن فرغ الأساسيُّ بالتطبيع: مسحُ رقمِ
  -- الرفّ من النموذج ينقله للإضافيّات (keepOldCode)، فكانت المادةُ تختفي من الفحص كأنها صُلّحت.
  -- والإضافيُّ المشوَّه (عربيّ/إكسل — skip) لا يُحكم: 0168 لا تقرأ الإضافيّات، فاختيارُه كان
  -- يُخفي المادةَ عن الاثنين؛ ومادةٌ لم يبقَ لها رمزٌ يُمسح «بلا باركود».
  p0 as (
    select pr.*,
           coalesce(case when inv_norm_code(pr.barcode) <> '' then pr.barcode end,
                    (select a.c from unnest(coalesce(pr.alt_codes, '{}')) with ordinality a(c, o)
                      where inv_code_kind(a.c) not in ('none', 'skip') order by a.o limit 1),
                    pr.barcode) as ec
      from products pr
     where pr.clinic_id = v_clinic and pr.farm_id is null
  ),
  p as materialized (
    select pr.id, pr.name, pr.barcode, pr.ec, pr.alt_codes, pr.company_id, pr.section_id,
           coalesce(pr.stock, 0) as stock,
           greatest(coalesce(pr.stock, 0), 0) * greatest(coalesce(pr.purchase_price, 0), 0) as value,
           pr.created_at, pr.has_sub_unit, pr.units_per_box,
           inv_norm_code(pr.ec) as n,
           inv_code_kind(pr.ec) as ck,
           search_norm(pr.name) as nn,
           exists (select 1 from unnest(coalesce(pr.alt_codes, '{}')) a(c)
                    where inv_code_kind(a.c) in ('gtin', 'ean8')) as alt_factory,
           case when coalesce(cs.pooled_stock, 0) > 0 then cs.pooled_stock else 0 end as pool
      from p0 pr
      left join company_sections cs on cs.id = pr.section_id
  ),
  gen as (
    select distinct inv_norm_code(g.barcode) as n
      from generated_barcodes g
     where g.clinic_id = v_clinic and coalesce(g.barcode, '') <> ''
  ),
  -- صافي البيع بمكافئ العلبة — تعريفُ report_top_products، ومن p_to إلى الوراء.
  s as (
    select it.product_id as pid,
           sum(coalesce(it.stock_qty, it.qty)) filter (where i.created_at >= p_from) as w,
           sum(coalesce(it.stock_qty, it.qty)) filter (where i.created_at >= v_30) as q30,
           sum(coalesce(it.stock_qty, it.qty)) as total,
           min(i.created_at) filter (where coalesce(it.stock_qty, it.qty) > 0) as first_at,
           max(i.created_at) filter (where coalesce(it.stock_qty, it.qty) > 0) as last_at
      from invoice_items it
      join invoices i on i.id = it.invoice_id
     where i.clinic_id = v_clinic
       and coalesce(i.status, 'paid') <> 'refunded'
       and it.product_id is not null
       and i.created_at <= p_to
     group by it.product_id
  ),
  -- لكلّ مادة: سببُ «باليد» إن وُجد، وهل هي «مصنع» أو «رفّ».
  c as materialized (
    select p.*,
           coalesce(s.w, 0) as w, coalesce(s.q30, 0) as q30, coalesce(s.total, 0) as total, s.last_at,
           -- العمرُ من أقدمِ الإنشاء وأوّلِ بيع (least يتجاهل الغائب): بلا بيعٍ هو عمرُ الإنشاء كما كان.
           floor(extract(epoch from (p_to - least(p.created_at, s.first_at))) / 86400.0)::int as age,
           case
             when p.alt_factory then null
             when p.ck in ('short', 'length', 'check', 'pattern') then p.ck
             when p.ck = 'internal' and not exists (select 1 from gen where gen.n = p.n) then 'internal'
             when p.ck = 'ean8' and exists (
               select 1 from p o where o.id <> p.id and length(o.n) = 13 and o.n ~ '^[0-9]+$' and left(o.n, 8) = p.n)
               then 'ean8_prefix'
           end as hand
      from p left join s on s.pid = p.id
  ),
  f as materialized (
    select c.*,
           (coalesce(c.barcode, '') = '' and not exists (
              select 1 from unnest(coalesce(c.alt_codes, '{}')) a(x) where inv_code_kind(a.x) not in ('none', 'skip'))) as no_code,
           (c.ck in ('gtin', 'ean8') and c.hand is null) as factory
      from c
  ),
  -- `ve` نافذةُ المعدّل لكلّ مادة: المدّة، أو عمرُها إن كانت أحدثَ منها (يومٌ أقلُّه) — الترويسة.
  g as (
    select f.*,
           (f.no_code or f.hand is not null) as shelf,
           least(v_days, greatest(f.age, 1)::numeric) as ve
      from f
  ),
  -- المجموعات بالاسم المطويّ (حرفان فأكثر).
  names as (
    select g.nn, count(*) as k, bool_or(g.shelf) as any_shelf, bool_or(g.factory) as any_factory
      from g where length(g.nn) >= 2 group by g.nn having count(*) > 1
  ),
  -- المستحيل: وسيطُ القيم الموجبة، والكفايةُ بنافذة المادة > ٣٦٥ يوماً، أو لا بيعَ بالمدّة وعمرُها
  -- ≥ ٧ أيام. والفرعان منفصلان بـw: بلا «w > 0» كان الثاني صادقاً لكلّ صافٍ صفرٍ أو سالب فيلغي شرطَ العمر.
  med as (select percentile_cont(0.5) within group (order by g.value) as m from g where g.value > 0),
  imp as (
    select g.id,
           case when g.has_sub_unit and coalesce(g.units_per_box, 0) > 1
                 and round(g.stock + g.total, 3) >= 10 * g.units_per_box
                 and mod(round(g.stock + g.total, 3), g.units_per_box) = 0
                then 'units' else 'value' end as why
      from g, med
     where g.stock > 0
       and ((g.w <= 0 and g.age >= 7) or (g.w > 0 and g.stock * g.ve > 365 * g.w))
       and ((med.m is not null and g.value >= 100 * med.m)
            or (g.has_sub_unit and coalesce(g.units_per_box, 0) > 1
                and round(g.stock + g.total, 3) >= 10 * g.units_per_box
                and mod(round(g.stock + g.total, 3), g.units_per_box) = 0))
  ),
  -- بادئةُ المصنع: أوّلُ ٧ أرقام من EAN-13 مصنعٍ سليم.
  pre as (
    select g.id, left(g.n, 7) as pfx, g.company_id
      from g where g.factory and length(g.n) = 13
  ),
  pfx as (
    select pre.pfx, count(distinct pre.company_id) as ncos, min(pre.company_id::text)::uuid as only_co
      from pre group by pre.pfx
  ),
  out as (
    select 'no_code'::text as kind, null::text as why, g.id, null::text as grp, null::numeric as qty,
           null::int as days, null::uuid as co
      from g where g.no_code
    union all
    select 'hand_code', g.hand, g.id, null, null, null, null
      from g where g.hand is not null
    union all
    select case when nm.any_shelf and nm.any_factory then 'dup_twin' else 'dup_name' end,
           case when nm.any_shelf and nm.any_factory then
             case when g.shelf then 'shelf' when g.factory then 'factory' else 'other' end end,
           g.id, g.nn, null, null, null
      from g join names nm on nm.nn = g.nn
    union all
    select 'impossible', imp.why, g.id, null,
           case when imp.why = 'units' then round(g.stock + g.total, 3) end,
           case when g.w > 0 then least(floor(g.stock * g.ve / g.w), 36500)::int end, null
      from g join imp on imp.id = g.id
    union all
    select 'never_sold', null, g.id, null, null, g.age, null
      from g where g.stock > 0 and g.last_at is null and g.age >= 30
       and not exists (select 1 from imp where imp.id = g.id)
    union all
    select 'stopped', null, g.id, null, null,
           floor(extract(epoch from (p_to - g.last_at)) / 86400.0)::int, null
      from g where g.stock > 0 and g.last_at < v_30
       and not exists (select 1 from imp where imp.id = g.id)
    union all
    select 'slow', null, g.id, null, g.w,
           case when g.w > 0 then least(floor(g.stock * g.ve / g.w), 36500)::int end, null
      from g where g.stock > 0 and g.last_at >= v_30 and g.age >= 30
       and (g.w <= 0 or g.stock * g.ve > 180 * g.w)
       and not exists (select 1 from imp where imp.id = g.id)
    union all
    select 'zero_sold', null, g.id, null, g.q30,
           case when g.last_at is not null then floor(extract(epoch from (p_to - g.last_at)) / 86400.0)::int end, null
      from g where g.stock + g.pool <= 0 and g.q30 > 0
    union all
    select 'no_company', case when x.only_co is not null then 'hint' end, g.id,
           case when x.only_co is not null then left(g.n, 7) end, null, null, x.only_co
      from g
      left join pfx x on g.factory and length(g.n) = 13 and x.pfx = left(g.n, 7) and x.ncos = 1
     where g.company_id is null
    union all
    select 'prefix_split', null, pre.id, pre.pfx, null, null, pre.company_id
      from pre join pfx on pfx.pfx = pre.pfx
     where pfx.ncos >= 2 and pre.company_id is not null
  )
  select o.kind, o.why, g.id, g.name, g.ec, o.grp,
         g.stock, g.value, o.qty, o.days,
         coalesce(o.co, case when o.kind <> 'no_company' then g.company_id end),
         co.name
    from out o
    join g on g.id = o.id
    left join companies co on co.id = coalesce(o.co, case when o.kind <> 'no_company' then g.company_id end)
   order by o.kind, o.grp nulls first, g.name, g.id;
end;
$function$;

revoke all on function public.report_inventory_audit(timestamptz, timestamptz) from public, anon;
grant execute on function public.report_inventory_audit(timestamptz, timestamptz) to authenticated;

-- ── ٤) النداءُ الواحد ────────────────────────────────────────────────────────
-- مصفوفةٌ واحدة من لقطةٍ واحدة (انظر الترويسة). invoker: الصلاحيةُ والعيادةُ تفحصهما الدالّةُ
-- التي تحتها بنفسها، وهذه لا تقرأ جدولاً. والترتيبُ ثابتٌ بالنوع ثم المادة.
-- والنافذةُ تنتهي بـnow() الخادم (الترويسة)، وتبدأ قبلها بـp_days × ٢٤ ساعة — ساعاتٌ لا «أيام»
-- لأن فترةَ الأيام تتبع صيفَ توقيت الجلسة فتصير المدّةُ ٨٩٫٩٦ يوماً. والمدى (٧–٤٠٠) تفحصه التي تحتها.
-- والصيغةُ الأولى (from, to من ساعة الجهاز) تُحذف: لم تنزل للإنتاج، وبقاؤها بابٌ للساعة الخاطئة.
drop function if exists public.report_inventory_audit_json(timestamptz, timestamptz);
create or replace function public.report_inventory_audit_json(p_days int)
returns jsonb
language sql
stable
security invoker
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.kind, x.product_id), '[]'::jsonb)
    from public.report_inventory_audit(now() - make_interval(hours => p_days * 24), now()) x
$function$;

revoke all on function public.report_inventory_audit_json(int) from public, anon;
grant execute on function public.report_inventory_audit_json(int) to authenticated;

comment on function public.report_inventory_audit(timestamptz, timestamptz) is
  'فحصُ مخزن العيادة الحالية (0245) — قراءةٌ فقط، بلا إصلاحٍ جماعيّ ولا دمجٍ تلقائيّ '
  '(الخطّ الأحمر: بياناتُ العيادة تبقى كما أدخلها أصحابُها). تُكمل verify_barcode_health '
  '(0168) ولا تكرّرها. kind/why لاتينيان والشرحُ بالواجهة؛ مرآتُها src/lib/inventoryAudit.ts '
  'ويطابقهما audit-parity بالحزمة. للمدير والطبيب، وليست بقائمة api_gate.';
comment on function public.report_inventory_audit_json(int) is
  'report_inventory_audit (0245) لآخر p_days يوماً بساعة الخادم — مصفوفةً واحدة بنداءٍ واحد، لقطةٌ '
  'واحدة بلا صفحاتٍ تُزيحها الكتابات. الصلاحيةُ والمدى من الدالّة التي تحتها.';
comment on function public.inv_code_kind(text) is
  'شكلُ رمز المنتج للفحص (0245): none/skip/short/alnum/length/check/internal/pattern/ean8/gtin. '
  'مرآتُه codeKind بـsrc/lib/inventoryAudit.ts — أيُّ تعديلٍ هنا يقابله تعديلٌ هناك.';
comment on function public.inv_gtin_ok(text) is
  'رقمُ تحقق GTIN-8/12/13/14 (0245) — مرآتُه gtinOk بـsrc/lib/inventoryAudit.ts.';
