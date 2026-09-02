-- ============================================================================
-- doctorVet — 0141: الباركود لا يضيّع المنتج
--
-- ── الشكوى ───────────────────────────────────────────────────────────────
-- أكبر عيادة: «ندخل مادة ونبيع منها، وبعد فترة ما نلكاها — كأنها ما دخلت من
-- الأساس — فنرجع ندخلها». وقياسُ القاعدة أثبت أن **ولا مادة انحذفت**: ٩١٦
-- إضافة ناقص ٥ حذف يساوي ٩١١ منتجاً موجوداً، وهو عددُهم بالضبط.
--
-- ── فالمادة موجودة، والمسحُ لا يجدها. ولماذا ─────────────────────────────
-- المنتج يُدخَل أوّلاً برقمِ رفٍّ يدويّ قصير (247)، ثم يُمسح بعد أيام باركودُ
-- المصنع الحقيقي (6972748378670) — فلا يتطابقان، فيقول النظام «غير موجود»،
-- فيُعاد إدخال المادة. هذا مقيسٌ لا مفترَض: زوجُ «سبري حشرات خارجية/خارجيه»
-- الأولُ برمزِ 247 والثاني بباركود المصنع، بفارقِ ثلاثة أيام.
--
-- والنطاق: **١٥١ منتجاً (١٧٪) بتلك العيادة** محفوظٌ برمزٍ يدويٍّ قصير — أي
-- ١٥١ قنبلةً موقوتة، كلٌّ تنفجر عند أوّل مسحةٍ للباركود الحقيقي.
--
-- ── وثلاثةُ كواسرَ صامتة بالمخزون ────────────────────────────────────────
--   • علامةُ اتجاهٍ غير مرئية: صفٌّ باركودُه يبدو «8989» بالشاشة وأوّلُ محرفٍ
--     فيه علامةُ اتجاه — فمسحةُ 8989 لا تطابقه أبداً ولا أحدَ يرى السبب.
--   • أرقامٌ شرقية (٢٣٨) تُكتب بلوحةٍ عربية والماسحُ يُخرج (238).
--   • مسافاتٌ من لصقٍ أو من ماسحٍ يُلحق فراغاً.
--
-- ── العلاج: رمزٌ واحدٌ لا يكفي ───────────────────────────────────────────
-- المنتج بالواقع له أكثرُ من رمز: رقمُ الرفّ الذي كتبته العيادة، وباركودُ
-- المصنع، وربما باركودُ عبوةٍ ثانية لنفس الصنف. فبدل أن نُجبر العيادة على
-- اختيارِ واحد (فتخسر الآخر)، يقبل المنتجُ **رموزاً إضافية**، ويبقى عمودُ
-- `barcode` كما هو رمزَه الأساسيَّ الذي يُطبع ويُعرض.
--
-- فحين تفشل مسحة، تعرض الشاشة «اربطه بمنتجٍ موجود» بدل «غير موجود» وحدها —
-- فيُضاف الباركودُ الجديد للمنتج القائم، ويبقى رصيدُه وتاريخُه مكانَهما.
--
-- ── ولا صفَّ يُدمج ولا رمزَ يُفقد ────────────────────────────────────────
-- تنظيفُ المخزون يمسّ **شكلَ** الرمز لا قيمته: يشيل ما لا يُرى ويوحّد الأرقام.
-- وصفٌّ نظيفُه محجوزٌ لمنتجٍ آخر بنفس العيادة **لا يُلمَس أبداً** — التنظيف
-- لا يجوز أن يكسر قيد التفرّد ولا أن يخلط منتجَين.
--
-- تراجع:
--   drop function if exists product_by_code(text), attach_product_code(uuid,text);
--   alter table products drop column if exists alt_codes;
--   (والرموزُ المنظَّفة تبقى — تنظيفُها إصلاحٌ لا ضرر منه)
-- ============================================================================

-- ── ١) الرموز الإضافية ───────────────────────────────────────────────────
alter table products add column if not exists alt_codes text[] not null default '{}';

-- بحثُ المسح يقرأ العمودَين، فالفهرس لازمٌ وإلا صار مسحاً كاملاً بكل مسحة.
create index if not exists products_alt_codes_idx on products using gin (alt_codes);

-- ── ٢) تنظيف الرموز المخزونة ─────────────────────────────────────────────
-- translate بسلسلةِ بدائلَ أقصر **يحذف** الزائد — فهذي تشيل المحارف غير
-- المرئية والمسافة، وتلك توحّد الأرقام الشرقية والفارسية.
do $$
declare v_fixed int;
begin
  if exists (select 1 from information_schema.columns
              where table_schema='public' and table_name='products' and column_name='barcode') then
    with cleaned as (
      select id, clinic_id, barcode,
             translate(
               translate(barcode, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
               E'​‌‍‎‏‪‫‬‭‮⁦⁧⁨⁩﻿ \t\n\r', '')
             as clean
        from products
       where barcode is not null and barcode <> '')
    update products p set barcode = c.clean
      from cleaned c
     where p.id = c.id
       and c.clean <> c.barcode          -- ما تغيّر شكلُه لا يُكتب
       and c.clean <> ''                 -- ولا نمحو رمزاً بالكامل
       and not exists (                  -- ولا ندمج منتجَين بغلطة تنظيف
         select 1 from products o
          where o.clinic_id is not distinct from c.clinic_id
            and o.barcode = c.clean and o.id <> c.id);
    get diagnostics v_fixed = row_count;
    if v_fixed > 0 then raise notice 'db: cleaned % barcode(s)', v_fixed; end if;
  end if;
end $$;

-- ── ٣) المسح يقرأ الرمزَين ───────────────────────────────────────────────
-- بصلاحية المُستدعي عمداً: سياساتُ الصفوف تحصر النتيجة بعيادته وحدها، فلا
-- حاجة لتجاوزها — وتجاوزُها هنا كان سيفتح بابَ قراءةِ منتجات عيادةٍ أخرى.
-- وحدُّ الصفَّين يكشف الالتباس بدل أن يبلعه: صفٌّ يُضاف، وصفّان يُعرضان
-- ليختار الطبيب.
create or replace function product_by_code(p_code text)
returns setof products
language sql
stable
security invoker
set search_path = public
as $$
  select * from products
   where p_code is not null and p_code <> ''
     and (barcode = p_code or alt_codes @> array[p_code])
   limit 2;
$$;
revoke all on function product_by_code(text) from public, anon;
grant execute on function product_by_code(text) to authenticated;

-- ── ٤) ربطُ رمزٍ بمنتجٍ قائم ─────────────────────────────────────────────
-- هذا ما يوقف دورةَ إعادة الإدخال: مسحةٌ فاشلة تصير ربطاً لا منتجاً جديداً.
create or replace function attach_product_code(p_product uuid, p_code text)
returns products
language plpgsql
security invoker
set search_path = public
as $$
declare v_p products; v_code text := btrim(coalesce(p_code, ''));
begin
  if v_code = '' then raise exception 'empty code'; end if;

  -- سياساتُ الصفوف تكفلُ أن ما نراه هو منتجُ عيادتنا وحدها.
  select * into v_p from products where id = p_product;
  if v_p.id is null then raise exception 'product not found'; end if;

  -- رمزٌ يشير لمنتجٍ آخر لا يُنقل بصمت — الطبيب لازم يعرف أنه مأخوذ.
  if exists (select 1 from products o
              where o.id <> p_product
                and (o.barcode = v_code or o.alt_codes @> array[v_code])) then
    raise exception 'code already belongs to another product';
  end if;

  -- الرمزُ الأساسي يبقى كما هو؛ الجديدُ ينضاف بجانبه ولا يمحوه.
  if v_p.barcode = v_code or v_p.alt_codes @> array[v_code] then return v_p; end if;
  update products set alt_codes = alt_codes || v_code
   where id = p_product returning * into v_p;
  return v_p;
end $$;
revoke all on function attach_product_code(uuid, text) from public, anon;
grant execute on function attach_product_code(uuid, text) to authenticated;
