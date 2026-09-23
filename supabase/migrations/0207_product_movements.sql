-- ============================================================================
-- ٠٢٠٧ — حركاتُ المادة: «ليش رصيدها هيچي؟» بجوابٍ واحد
--
-- ── لماذا ───────────────────────────────────────────────────────────────
-- العياداتُ لم تسأل «شنو صار بالفاتورة». سألت **«وين راحت البضاعة؟»**
-- و«المنتج اختفى» — وهما سؤالان عن **المادة** لا عن الفاتورة. والبياناتُ
-- موجودةٌ كلُّها، لكنها مبعثرةٌ بثلاثة جداول ومخلوطةٌ بكلّ حركات العيادة.
--
-- ── وثلاثةُ قياساتٍ قرّرت الشكل ─────────────────────────────────────────
-- ١) **الاشتقاقُ من الشراء والبيع وحدَهما كاذب.** جمعتُ `purchase_items` ناقص
--    `invoice_items` لكلّ منتج وقارنتُه بالرصيد: **٢٢٥١ من ٢٨٧١ لا توازن**،
--    بفارقٍ معدّلُه ٤٥. والسبب: **٢٠٥٦ منها لم تُشترَ بفاتورةٍ قطّ** — رصيدُها
--    كُتب يدوياً يوم أُنشئ المنتج أو عُدّل بالجرد. فدفترٌ مبنيٌّ على الفواتير
--    وحدَها يروي قصّةً ناقصة عن ٧٨٪ من المخزن — و«قائمةٌ ناقصة أخطرُ من خطأ
--    ظاهر» (CLAUDE.md).
--
-- ٢) **فالأرقامُ تُؤخذ من `audit_log` لا تُحسب.** محفّزُ 0139 يحفظ لكلّ تغييرٍ
--    `__changed.stock = [كان, صار]` — قيمتان دقيقتان لا تخمين. فالخطُّ الزمنيُّ
--    يعرضهما كما هما، ولا يجمع شيئاً من عنده.
--
-- ٣) **و«لماذا» تُعرف بالمقارنة الزمنية**: من ٨٩٧٠ تغييرَ رصيد، **٨٠٢٢ يقابلها
--    بيعٌ و١٣٠ شراءٌ بنفس اللحظة = ٩١٪ تُسمّى بثقة**. والباقي لا يُخمَّن —
--    يُقال «تعديل» وكفى. تسميةٌ كاذبةٌ أسوأُ من «ما أعرف».
--
-- ── وما لا تدّعيه هذه الدالّة ───────────────────────────────────────────
-- `audit_log` يُكنس (٩٠ يوماً للضجيج و٣٦٥ للمال والمخزون — 0129). فما قبل ذلك
-- **لا سجلَّ له**، والشاشةُ تقولها صراحةً بدل أن توحي بأن القائمة كاملة.
-- و٥٢٠ منتجاً من غير الموازنة أقدمُ من نافذة السجل أصلاً.
--
-- ── الصلاحية ────────────────────────────────────────────────────────────
-- `security invoker` عمداً: سياسةُ `audit_log` قراءةٌ للمدير وحده، فالدالّةُ
-- ترث ذلك ولا تفتح باباً جانبياً. ولا `definer` هنا — لا تكتب شيئاً.
--
-- تراجع: drop function if exists public.product_movements(uuid, int);
-- تُطبَّق بعد 0206، وتُعاد بلا أثرٍ ثانٍ (تعريفُ دالّةٍ وحده).
-- ============================================================================

create or replace function public.product_movements(p_product uuid, p_limit int default 100)
returns table (
  at         timestamptz,
  kind       text,      -- open | purchase | purchase_edit | sale | return | adjust
  from_qty   numeric,
  to_qty     numeric,
  delta      numeric,
  ref_id     uuid,      -- معرّفُ الفاتورة التي فسّرت الحركة، وإلا فارغ
  actor_name text
)
language sql
stable
security invoker
set search_path = public
as $$
  with ev as (
    -- تغييراتُ الرصيد كما سجّلها المحفّز: كان ← صار، بلا حسابٍ من عندنا.
    select a.id, a.created_at, a.actor,
           (a.details->'__changed'->'stock'->>0)::numeric as f,
           (a.details->'__changed'->'stock'->>1)::numeric as t
      from audit_log a
     where a.clinic_id = auth_clinic()
       and a.entity = 'products' and a.action = 'UPDATE'
       and a.entity_id = p_product::text
       and a.details->'__changed' ? 'stock'
    union all
    -- الميلاد: الرصيدُ الذي وُلد به المنتج. **أغلبُ المخزن دخل من هنا لا من
    -- فاتورة** — ٢٠٥٦ من ٢٢٥١ مادّةٍ غيرِ موازنةٍ لم تُشترَ بفاتورةٍ قطّ.
    select a.id, a.created_at, a.actor, null::numeric, (a.details->>'stock')::numeric
      from audit_log a
     where a.clinic_id = auth_clinic()
       and a.entity = 'products' and a.action = 'INSERT'
       and a.entity_id = p_product::text
  ),
  named as (
    select ev.id, ev.created_at, ev.actor, ev.f, ev.t,
           case
             when ev.f is null           then 'open'
             when pu.id  is not null     then 'purchase'
             when ped.id is not null     then 'purchase_edit'
             when inv.id is not null     then (case when coalesce(ev.t,0) >= coalesce(ev.f,0) then 'return' else 'sale' end)
             else 'adjust'
           end as kind,
           coalesce(pu.id, ped.id, inv.id) as ref_id
      from ev
      -- **النافذةُ أربعُ ثوانٍ**: الحفظُ الواحد يكتب صفَّ الفاتورة وصفوفَ
      -- المنتجات بمعاملةٍ واحدة، والفارقُ المقيس أجزاءُ ثانية. توسيعُها يخلط
      -- بيعتين متتاليتين لنفس المادّة، وتضييقُها يُسقط التسمية على خادمٍ مشغول.
      left join lateral (
        select p.id from purchases p
         where p.clinic_id = auth_clinic()
           and abs(extract(epoch from (p.created_at - ev.created_at))) < 4
           and exists (select 1 from purchase_items pi where pi.purchase_id = p.id and pi.product_id = p_product)
         order by abs(extract(epoch from (p.created_at - ev.created_at))) limit 1
      ) pu on true
      -- **وتعديلُ فاتورةٍ قديمة**: لا عمودَ `updated_at` بالجدول (مقيس)، فالأثرُ
      -- الوحيدُ صفُّ تدقيقٍ للفاتورة نفسِها بنفس اللحظة. وبدونه كان التعديلُ
      -- يظهر «تعديلاً مجهولاً» — وهو أخطرُ ما يحتاج المستخدمُ أن يسمّيه.
      left join lateral (
        select (b.entity_id)::uuid as id from audit_log b
         where b.clinic_id = auth_clinic() and b.entity = 'purchases' and b.action = 'UPDATE'
           and abs(extract(epoch from (b.created_at - ev.created_at))) < 4
           and exists (select 1 from purchase_items pi
                        where pi.purchase_id = (b.entity_id)::uuid and pi.product_id = p_product)
         order by abs(extract(epoch from (b.created_at - ev.created_at))) limit 1
      ) ped on true
      left join lateral (
        select i.id from invoices i
         where i.clinic_id = auth_clinic()
           and abs(extract(epoch from (i.created_at - ev.created_at))) < 4
           and exists (select 1 from invoice_items ii where ii.invoice_id = i.id and ii.product_id = p_product)
         order by abs(extract(epoch from (i.created_at - ev.created_at))) limit 1
      ) inv on true
  )
  -- **وتُطوى الخطوةُ الوسطى.** عكسُ فاتورةٍ يكتب صفّين بنفس اللحظة
  -- (١٤ ← ٠ ثمّ ٠ ← ١٥)، وعرضُهما يُخيف بلا سبب: الصفرُ لم يوجد قطّ خارج
  -- المعاملة. فيُعرض ما بدأ به وما انتهى إليه — والفرقُ هو الفرقُ نفسُه.
  select n.created_at,
         min(n.kind),
         (array_agg(n.f order by n.id))[1],
         (array_agg(n.t order by n.id desc))[1],
         (array_agg(n.t order by n.id desc))[1] - coalesce((array_agg(n.f order by n.id))[1], 0),
         n.ref_id,   -- بالتجميع أصلاً، فلا يحتاج تجميعاً (ولا min(uuid) بالقاعدة)
         coalesce(min(st.name), '')
    from named n
    left join lateral (
      select s.name from staff s where s.user_id = n.actor and s.clinic_id = auth_clinic() limit 1
    ) st on true
   group by n.created_at, n.ref_id
   order by n.created_at desc
   limit least(greatest(coalesce(p_limit, 100), 1), 500)
$$;

revoke all on function public.product_movements(uuid, int) from public, anon;
grant execute on function public.product_movements(uuid, int) to authenticated;

comment on function public.product_movements(uuid, int) is
  'خطُّ زمنٍ لرصيد مادّة (0207): الأرقامُ من `__changed.stock` بالتدقيق (كان←صار، لا حساب)، و«لماذا» بمقارنةٍ زمنيةٍ بالفواتير (٩١٪ مقيسة) وما لم يُعرف يبقى «تعديل». وتُطوى خطوةُ العكس الوسطى. `invoker` كي يرث سياسةَ audit_log (المديرُ وحده).';
