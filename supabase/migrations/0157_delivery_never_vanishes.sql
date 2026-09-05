-- ============================================================================
-- ٠١٥٧ — سجلُّ التوصيل لا يختفي، والتحصيلُ الغلط يُفَكّ لا يُزوَّر
--
-- ── المشكلة ──────────────────────────────────────────────────────────────
-- التحصيلُ من شركات التوصيل يصير بعد فتراتٍ طويلة، فالسجلُّ يجب أن يصمد شهوراً.
-- وثلاثةُ طرقٍ كانت تُفقده أو تُفسده:
--
--   ١) `delivery_orders.invoice_id … on delete cascade` (0069). فحذفُ فاتورةٍ
--      يمحو طلبَ التوصيل معها **نهائياً**: شركةٌ عليها طلبٌ من شهرين يختفي
--      سطرُها من الكشف ومعه المبلغُ المطلوب — بلا سلّةٍ ولا أثر. وهذا عكسُ ما
--      فُعل بالمنتجات تماماً (0145/0146): هناك صار الحذفُ طيّاً، وهنا بقي محواً.
--
--   ٢) `courier_settlements.courier_id … on delete cascade` (0148). فحذفُ صفِّ
--      شركةٍ يمحو **كلَّ تحصيلاتها** بالتتالي، و`delivery_orders.courier_id …
--      on delete set null` يفصل تاريخَها كلَّه عنها. الواجهةُ تؤرشف ولا تحذف
--      (لا `deleteCourier` بـrepo أصلاً) — لكنَّ سياسةَ `couriers_write` هي
--      `for all`، فأيُّ نداءٍ مباشرٍ أو سكربتٍ أو نسخةٍ قديمة يقدر أن يحذف.
--      والحمايةُ التي تعتمد على أن الواجهةَ لا تعرض الزرَّ ليست حماية.
--
--   ٣) تحصيلٌ سُجِّل بالمبلغ الغلط لا سبيلَ لتصحيحه: `courier_settle` تكتب
--      الدفعةَ بالفواتير وتختم الطلبات، ولا مقابلَ لها يفكّ. فالعلاجُ الوحيد
--      المتاح كان تزويرَ رقمٍ آخر ليوازنه — أي إفسادَ دفترين بدل واحد.
--
-- ── المبدأ ───────────────────────────────────────────────────────────────
-- «الاختفاءُ يُمنع، والخطأُ يُفَكّ.» المنعُ بالقاعدة لا بالواجهة، والفكُّ
-- **إضافةٌ لا حذف**: صفُّ التحصيل يبقى ويُوسَم مفكوكاً، وعكسُ الدفعة يُكتب
-- ساقاً جديدةً بـ`payment_details` لا مسحاً لساقٍ قديمة. فالدفترُ يقرأ ما صار
-- وما انفكّ معاً، ولا يُقرأ يوماً كأن شيئاً لم يكن.
--
-- ── الأثر ────────────────────────────────────────────────────────────────
-- إضافيةٌ خالصة: جدولان جديدان، ومحفّزان يمنعان، ودالّةُ فكٍّ جديدة. ولا صفَّ
-- قائمٌ يُحذف ولا يُعدَّل، ولا دالّةَ مالٍ قائمة تُمَسّ — `courier_settle`
-- و`settle_invoice` و`refund_invoice` كما هي حرفاً. تُعاد بلا أثرٍ ثانٍ.
-- تُطبَّق بعد 0156.
-- ============================================================================

-- ── ١) سلّةُ طلبات التوصيل: صورةٌ قبل أن يأخذها التتالي ────────────────────
create table if not exists delivery_orders_trash (
  id           uuid primary key,
  clinic_id    uuid not null,
  row          jsonb not null,
  invoice_id   uuid,
  courier_id   uuid,
  reason       text,
  deleted_by   uuid default auth.uid(),
  deleted_at   timestamptz not null default now()
);
alter table delivery_orders_trash enable row level security;
-- بلا وسمِ `RLS-DENY-ALL-BY-DESIGN`: الجدولُ **له** سياسةُ قراءةٍ أدناه، فليس
-- محجوباً. والوسمُ يُسكت `verify_rls_coverage` (0152) عن الجدول للأبد — فلو
-- أُسقطت سياسةُ القراءة يوماً لبقي الحارسُ صامتاً عن جدولٍ صار بلا حماية.
comment on table delivery_orders_trash is
  'صورةُ طلبِ توصيلٍ خرج بأي طريق (تتالي حذفِ فاتورة، أو حذفٌ مباشر). تُقرأ '
  'بالعيادة عبر delivery_orders_trash_read، ولا تُكتب إلا من محفّز '
  'delivery_orders_snapshot بصلاحية المُعرِّف — سياسةُ كتابةٍ هنا تسمح بتزوير '
  'تاريخِ تحصيل.';

drop policy if exists delivery_orders_trash_read on delivery_orders_trash;
create policy delivery_orders_trash_read on delivery_orders_trash
  for select using (clinic_id = (select auth_clinic()));

create index if not exists delivery_orders_trash_clinic_idx
  on delivery_orders_trash(clinic_id, deleted_at desc);

-- ── ٢) الفاتورةُ لا تأخذ طلبَها معها ───────────────────────────────────────
-- المحفّزُ على `delivery_orders` نفسِها لا على `invoices`: فهو يصوّر الصفَّ أيّاً
-- كان الطريقُ الذي أخرجه (تتالي حذفِ الفاتورة، أو حذفٌ مباشر، أو سكربت) — وهذا
-- نفسُ درسِ 0146 حرفياً: الحمايةُ توضع على الجدول الذي يُفقد لا على أحد طرقه.
create or replace function delivery_orders_snapshot()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into delivery_orders_trash (id, clinic_id, row, invoice_id, courier_id, reason)
  values (old.id, old.clinic_id, to_jsonb(old), old.invoice_id, old.courier_id,
          case when old.collected_at is null and old.status = 'delivered'
               then 'حُذف وعليه ذمّةٌ غير محصَّلة' else null end)
  -- **أوّلُ صورةٍ هي الصورة.** الكتابةُ فوقها تجعل الشاهدَ قابلاً للتزوير:
  -- يكفي أن يُنشئ أحدُهم طلباً بمعرّفِ صفٍّ بالسلّة ثم يحذفه، فتُداس الصورةُ
  -- الأصلية بأخرى فارغة. وسلّةٌ تُزوَّر أسوأُ من غيابها لأنها تُصدَّق.
  on conflict (id) do nothing;
  return old;
end $$;

drop trigger if exists delivery_orders_before_delete on delivery_orders;
create trigger delivery_orders_before_delete
  before delete on delivery_orders
  for each row execute function delivery_orders_snapshot();

-- ومنعُ الحذف من جذره: فاتورةٌ عليها طلبُ توصيلٍ بذمّةٍ غير محصَّلة لا تُحذف.
-- الرسالةُ تقول ماذا يمنع لا «forbidden» مجرّدة — الخطأُ الغامض يُعاد، والمفهومُ
-- يُعالَج.
create or replace function invoices_block_delete_with_open_delivery()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_n int;
begin
  -- الشرطُ **نفسُ** تعريف «بذمّة» بالنظام (`isOwed` بـsrc/lib/courierLedger.ts،
  -- ومعادلةُ `courier_settle` بـ0148): مسلَّمٌ، غيرُ مختوم، فاتورتُه ليست
  -- مردودة، والمتبقّي موجب. وشرطٌ من عندي أوسعُ منه يقفل فواتيرَ لا ذمّةَ
  -- عليها: طلبٌ مدفوعٌ مقدَّماً بالكامل `collected_at` فيه فارغٌ بحقّ — لأنه
  -- لا شيءَ يُحصَّل — فتُمنع فاتورتُه من الحذف للأبد بلا مخرج.
  select count(*) into v_n
    from delivery_orders d
    join invoices i on i.id = d.invoice_id
   where d.invoice_id = old.id
     and d.status = 'delivered'
     and d.collected_at is null
     and i.status <> 'refunded'
     and round(i.total - i.amount_paid, 2) > 0.009;
  if v_n > 0 then
    raise exception 'invoice_has_open_delivery'
      using hint = 'هذه الفاتورة عليها طلبُ توصيلٍ لم يُحصَّل بعد. حصِّله أو أرجِعه أولاً — حذفُها الآن يمحو المبلغَ المطلوب من الشركة.';
  end if;
  return old;
end $$;

drop trigger if exists invoices_before_delete_delivery on invoices;
create trigger invoices_before_delete_delivery
  before delete on invoices
  for each row execute function invoices_block_delete_with_open_delivery();

-- ── ٣) صفُّ الحامل لا يُحذف — يُؤرشَف ─────────────────────────────────────
-- الأرشفةُ (`active = false`) تُبقي التاريخَ كلَّه وتُخفي الاسمَ من القوائم،
-- وهي ما تفعله الواجهةُ أصلاً. الحذفُ يمحو التحصيلاتِ بالتتالي ويفصل الطلبات —
-- فيُمنع بصوتٍ عالٍ ويُقال البديل.
create or replace function couriers_block_delete()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_s int; v_o int;
begin
  select count(*) into v_s from courier_settlements where courier_id = old.id;
  select count(*) into v_o from delivery_orders     where courier_id = old.id;
  raise exception 'courier_delete_blocked'
    using hint = 'ما ينحذف حامل التوصيل — يُؤرشف. حذفُه يمحو ' || v_s ||
                 ' تحصيلاً ويفصل ' || v_o ||
                 ' طلباً عن صاحبها، وما يرجع شي. سكّره من «سجل السواق» بدل الحذف: '
                 || 'الاسم ينخفي من القوائم والتاريخ يبقى كامل.';
end $$;

drop trigger if exists couriers_before_delete on couriers;
create trigger couriers_before_delete
  before delete on couriers
  for each row execute function couriers_block_delete();

-- ── ٣٫٥) ختمُ «محصَّل» لا يُكتب بالإيد على طلبِ شركة ──────────────────────
-- `delivery_orders_write` (0069) كانت `for all` بفحصِ العيادة وحده: لا دورَ ولا
-- عمودَ محميّ. وهي **الشاذّةُ** بين جداول مالِ التوصيل — `invoices` تُجمّد
-- `amount_paid` لغير المدير، و`courier_settlements` قراءةٌ فقط، و`couriers`
-- لمدير/طبيب. فأيُّ موظّفٍ كان يقدر بطلبٍ واحد:
--
--     PATCH /delivery_orders?id=eq.X   { "collected_at": "الآن" }
--
-- فيختفي الطلبُ من «المطلوب الآن» بلا أن يدخل ديناراً أيَّ فاتورة — وذمّةُ
-- الشركة تُمحى بصمت. وبالعكس: يمسحه فيرجع الطلبُ بالذمّة بلا ردِّ المبلغ، أي
-- يلتفّ على `courier_unsettle` وحارسِ المدير الذي فيها.
--
-- والتجميدُ الشامل ممنوع: بمسار **السائق** يختم الكاشيرُ العاديُّ هذا العمودَ
-- بنفسه بعد أن يقبض النقد (`deliver()` بـDeliveryPanel) — وهو شغلُ كلِّ يوم.
-- فالتجميدُ **مشروطٌ بنوع الحامل**: حرٌّ للسائق، ومقفلٌ للشركة.
--
-- ويُجمَّد معه `courier_id` على طلبات الشركات: بدونه يُلتَفّ بخطوتين (بدّل
-- الحاملَ إلى سائق، ثم اختم). ونقلُ ذمّةٍ من شركةٍ لأخرى قرارُ مالٍ أصلاً.
drop policy if exists delivery_orders_write on delivery_orders;

create policy delivery_orders_insert on delivery_orders
  for insert with check (clinic_id = (select auth_clinic()));

create policy delivery_orders_delete on delivery_orders
  for delete using (clinic_id = (select auth_clinic()));

create policy delivery_orders_update on delivery_orders
  for update
  using (clinic_id = (select auth_clinic()))
  with check (
    clinic_id = (select auth_clinic())
    and (
      (select auth_role()) = 'manager'
      -- طلبٌ ليس لشركة (سائق، أو بلا حامل بعد) → المسارُ اليوميّ كما هو.
      or not exists (
        select 1 from couriers c
         where c.id = delivery_orders.courier_id and c.kind = 'company')
      -- أو طلبُ شركةٍ لم يتغيّر فيه العمودان المحميّان.
      or (
        collected_at is not distinct from
          (select d.collected_at from delivery_orders d where d.id = delivery_orders.id)
        and courier_id is not distinct from
          (select d.courier_id from delivery_orders d where d.id = delivery_orders.id)
      )
    )
  );

-- ── ٤) فكُّ التحصيل ───────────────────────────────────────────────────────
alter table courier_settlements add column if not exists reversed_at     timestamptz;
alter table courier_settlements add column if not exists reversed_by     uuid;
alter table courier_settlements add column if not exists reversed_reason text;

/**
 * يفكُّ تحصيلاً سُجِّل بالغلط: يردّ المبالغ إلى الفواتير، ويعيد الطلباتِ إلى
 * الذمّة، ويسِمُ صفَّ التحصيل مفكوكاً — **ولا يحذف شيئاً**.
 *
 * ولا يُعكَس بمسحِ ساقِ الدفع من `payment_details`: تُضاف ساقٌ سالبةٌ موسومةٌ
 * بمعرّف التحصيل. فالفاتورةُ تحكي قصّتَها كاملة — دُفع ثم رُدّ — ويبقى فحصُ
 * التطابق قادراً على مطابقة المجموع فلساً بفلس.
 */
create or replace function courier_unsettle(p_settlement uuid, p_reason text default null)
returns courier_settlements
language plpgsql security definer set search_path = public as $$
declare
  v_clinic uuid := auth_clinic();
  v_s      courier_settlements;
  v_inv    invoices;
  v_back   numeric(14,2);
  a        jsonb;
begin
  if v_clinic is null then raise exception 'not authenticated'; end if;
  -- المالُ للمدير: نفسُ حارسِ delete_invoice و edit_invoice_lines.
  if auth_role() <> 'manager' then
    raise exception 'forbidden' using hint = 'فكُّ التحصيل للمدير وحده.';
  end if;

  select * into v_s from courier_settlements
   where id = p_settlement and clinic_id = v_clinic for update;
  if v_s.id is null then raise exception 'settlement not found'; end if;
  if v_s.reversed_at is not null then
    raise exception 'already_reversed' using hint = 'هذا التحصيل مفكوكٌ من قبل.';
  end if;

  -- قفلُ الحامل أوّلاً — **نفسُ ترتيب `courier_settle`** (حامل ← طلبات ← فواتير).
  -- بلا هذا يمشي الفكُّ بالاتجاه المعاكس (فواتير ← طلبات) فيتقاطع مع تحصيلٍ
  -- جارٍ لنفس الشركة، ويقف الاثنان بـdeadlock (40P01). ترتيبٌ واحدٌ للأقفال
  -- يمنعه بالبناء لا بالحظّ.
  perform 1 from couriers where id = v_s.courier_id and clinic_id = v_clinic for update;

  for a in select * from jsonb_array_elements(coalesce(v_s.allocations, '[]'::jsonb))
  loop
    select * into v_inv from invoices
     where id = (a->>'invoice_id')::uuid and clinic_id = v_clinic for update;
    if v_inv.id is null then continue; end if;          -- فاتورةٌ اختفت — لا نوقف الفكّ
    if v_inv.status = 'refunded' then continue; end if; -- رُدّت أصلاً، لا نطرح مرّتين

    -- لا نردّ أكثر مما هو مدفوعٌ فعلاً — والنقصُ ليس فكّاً جزئياً صامتاً:
    -- فكٌّ نصفُه يترك الدفترين مختلفين ولا أحد يعرف. نقولها ونرفض.
    v_back := least(round((a->>'amount')::numeric, 2), v_inv.amount_paid);
    if v_back < round((a->>'amount')::numeric, 2) - 0.005 then
      raise exception 'cannot_fully_reverse'
        using hint = 'ما ينفكّ هذا التحصيل: فاتورةٌ منه صار عليها تعديلٌ أو إرجاعٌ بعده، فما بقي فيها ما يكفي لردّ المبلغ كاملاً. راجع الفاتورة أولاً.';
    end if;
    if v_back > 0 then
      update invoices
         set amount_paid = round(amount_paid - v_back, 2),
             -- الطريقةُ هي طريقةُ التحصيل نفسِه لا طريقةٌ مخترَعة: تقاريرُ
             -- المال تُجمّع بـ{cash,card,transfer}، فساقٌ بطريقةٍ ثالثة تسقط
             -- من صندوق اليوم أو تُحسب نقداً بالغلط. ما يميّزها `reversal_of`.
             payment_details = coalesce(payment_details, '[]'::jsonb)
               || jsonb_build_object(
                    'method', coalesce(nullif(btrim(v_s.method), ''), 'cash'),
                    'amount', -v_back,
                    'at', to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
                    'reversal_of', v_s.id
                  )
               -- سببُ الفكّ إن كُتب: نصُّ المستخدم لا ثابتٌ مخترَع، ويُضاف حين
               -- يوجد وحده فلا شرطةٌ خاوية بصفوف التقارير (نمطُ 0113).
               || case when length(coalesce(btrim(p_reason), '')) > 0
                       then jsonb_build_object('note', btrim(p_reason))
                       else '{}'::jsonb end
       where id = v_inv.id and clinic_id = v_clinic;
    end if;

    -- الطلبُ يرجع بالذمّة: هذا ما يعيده لكشف الشركة ولمؤشّر «المطلوب الآن».
    update delivery_orders
       set collected_at = null
     where id = (a->>'order_id')::uuid and clinic_id = v_clinic;
  end loop;

  update courier_settlements
     set reversed_at = now(), reversed_by = auth.uid(),
         reversed_reason = nullif(btrim(p_reason), '')
   where id = p_settlement and clinic_id = v_clinic
   returning * into v_s;
  return v_s;
end $$;

revoke all on function courier_unsettle(uuid, text) from public, anon;
grant execute on function courier_unsettle(uuid, text) to authenticated;
