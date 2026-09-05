-- 0159 — سياسةُ تحديث التوصيل كانت تستعلم من جدولها فتُسقط كلَّ تحديث
--
-- الجذر: 0157 كتبت `delivery_orders_update` بـ`with check` فيه
--
--     (select d.collected_at from delivery_orders d where d.id = delivery_orders.id)
--
-- وبوستغريس يرفض سياسةً تقرأ الجدولَ الذي تحميه: لتطبيق السياسة على الاستعلام
-- الفرعيّ لازم يطبّق السياسةَ نفسها من جديد، فيقطع الحلقةَ بخطأ
-- `42P17 infinite recursion detected in policy for relation "delivery_orders"`.
-- الخطأ يقع عند **إعادة كتابة الاستعلام**، لا عند تقييم الشرط — فلا ينفع أن
-- الفرعَ الأوّل `auth_role() = 'manager'` صحيح، ولا أن الطلب لسائق.
--
-- الأثر بالإنتاج (مقيسٌ من سجلّ الخادم): من لحظة تطبيق 0157 (2026-09-05
-- 10:06 UTC) كلُّ `PATCH /rest/v1/delivery_orders` رجع 500 — أربعَ عشرةَ مرّة
-- بعيادتين خلال ثلاث ساعات. والواجهةُ كانت تبلع الخطأ (`maybe()` تطبعه
-- بالكونسول وترجع «لا صفّ») فتقول «تم الاستلام» والطلبُ باقٍ مكانه: بمسار
-- السائق سُدِّدت الفاتورةُ (`settle_invoice` نجح) ثم فشل ختمُ الطلب، فبقي
-- «بالطريق» وماله مقبوض؛ وبالإرجاع رُدَّت الفاتورة وبقي الطلب «قيد التجهيز».
--
-- لماذا ما أمسكته الحزمة: تجري كـsuperuser، وsuperuser يتجاوز RLS فلا تُعاد
-- كتابةُ السياسة أصلاً. فحصُ 0159 بالحزمة يشغّل التحديثَ بدور `authenticated`
-- (انظر `_rls_try` بـrun.sh) — أوّلُ فحصٍ يمرّ من السياسات فعلاً.
--
-- الإصلاح: القاعدةُ نفسها («ختمُ التحصيل وتبديلُ الحامل على طلب شركةٍ للمدير
-- وحده») تنتقل إلى محفّزٍ قبل التحديث. المحفّز يرى OLD وNEW مباشرةً فلا يحتاج
-- استعلاماً فرعياً على الجدول، ويرفض بـ`raise … using hint` فتصل الجملةُ
-- العربية للشاشة (`describeDbError` يلتقط hint مع P0001). والسياسةُ ترجع
-- لشرط العيادة وحده.

-- ── ١) الحارس محفّزاً ──────────────────────────────────────────────────────
create or replace function delivery_orders_guard_company()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_company boolean;
begin
  -- بلا هويّة (SQL editor، دالّةٌ خلفية) لا شيءَ يُحرَس: RLS ما تشمل هؤلاء أصلاً،
  -- والمحفّز لا يجب أن يكون أشدَّ من السياسة التي يحلّ محلّها.
  if auth.uid() is null then return new; end if;
  if coalesce(auth_role(), '') = 'manager' then return new; end if;

  -- الحاملُ القديم أو الجديد شركة؟ (تبديلُ شركةٍ إلى سائقٍ ثم الختمُ كان
  -- التفافاً بخطوتين — فيُحرَس الطرفان.)
  select exists (
    select 1 from couriers c
     where c.id in (old.courier_id, new.courier_id) and c.kind = 'company')
    into v_company;
  if not v_company then return new; end if;

  if new.collected_at is distinct from old.collected_at
     or new.courier_id is distinct from old.courier_id then
    raise exception 'company_order_frozen'
      using hint = 'طلبات شركات التوصيل: تسجيلُ التحصيل أو تبديلُ الشركة للمدير وحده — من «تحصيل» بقسم الشركات.';
  end if;
  return new;
end $$;

drop trigger if exists delivery_orders_before_update_guard on delivery_orders;
create trigger delivery_orders_before_update_guard
  before update on delivery_orders
  for each row execute function delivery_orders_guard_company();

-- ── ٢) السياسة بلا استعلامٍ على جدولها ────────────────────────────────────
drop policy if exists delivery_orders_update on delivery_orders;
create policy delivery_orders_update on delivery_orders
  for update
  using      (clinic_id = (select auth_clinic()))
  with check (clinic_id = (select auth_clinic()));

-- ── ٣) إصلاحُ ما تركته الساعاتُ الثلاث نصفَ منجَز ────────────────────────
-- محصورٌ زمنياً بما بعد تطبيق 0157 على الإنتاج؛ قبله كانت التحديثات تمرّ.
-- تُعاد بلا أثرٍ ثانٍ: بعد الإصلاح لا صفٌّ يطابق الشرطين.
--
-- (أ) الإرجاع: `refundInvoice` نجح ثم فشل `status = 'returned'`. الفاتورة
--     مردودة والمخزون راجع، والطلب وحده بقي «قيد التجهيز/بالطريق».
update delivery_orders o
   set status = 'returned',
       returned_at = coalesce(o.returned_at, i.refunded_at, now())
  from invoices i
 where i.id = o.invoice_id
   and i.status = 'refunded'
   and o.status in ('preparing', 'out')
   and i.refunded_at >= '2026-09-05 10:06:00+00';

-- (ب) استلامُ نقد السائق: `settle_invoice` سدّد الفاتورةَ كاملةً ثم فشل ختمُ
--     الطلب. المالُ مقبوضٌ ومسجَّل، والطلبُ وحده بقي «بالطريق». يُختم بوقت
--     آخر دفعةٍ — وهو ما كانت الواجهة ستكتبه لحظتَها.
update delivery_orders o
   set status = 'delivered',
       delivered_at = coalesce(o.delivered_at, p.at),
       collected_at = p.at
  from invoices i,
       couriers c,
       lateral (
         -- الأرجل تُكتب بـ`settle_invoice` (0061) بمفتاح `at` نصّاً بتوقيت UTC.
         select max((e->>'at')::timestamptz) as at
           from jsonb_array_elements(coalesce(i.payment_details, '[]'::jsonb)) e
          where e ? 'at'
       ) p
 where i.id = o.invoice_id
   and c.id = o.courier_id
   and o.status = 'out'
   and c.kind = 'driver'
   and i.status <> 'refunded'
   and i.total > 0
   and round(i.amount_paid - i.total, 2) >= 0
   and p.at >= '2026-09-05 10:06:00+00';
