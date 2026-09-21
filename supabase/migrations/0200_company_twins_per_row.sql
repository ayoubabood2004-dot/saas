-- ============================================================================
-- ٠٢٠٠ — «شنو راح ينتقل» يصدق مهما اختارت العيادةُ الباقي
--
-- ── ما قيس بالمتصفّح ────────────────────────────────────────────────────
-- نافذةُ الطيّ تعرض أعدادَ ما ينتقل، وتحسبها `company_twins()` مقابلَ
-- **الباقية المقترحة وحدَها** (`keep_id` = الأقدم). والنافذةُ تسمح للعيادة أن
-- تختار صفّاً آخر ليبقى — وعندها تبقى الأعدادُ كما هي وهي **كاذبة**: بمجموعة
-- الفحص، إبقاءُ الأقدم ينقل منتجَين وصنفَين، وإبقاءُ الثاني ينقل منتجاً واحداً
-- وصنفاً واحداً. الشاشةُ تقول «٢ / ٢» بالحالتين.
--
-- ورقمٌ يُبنى عليه قرارُ طيٍّ لا يجوز أن يكذب — وهو نفسُ سببِ وجود أعمدة
-- `moving_*` أصلاً (0197): «قل ما ينتقل لا ما بالمجموعة».
--
-- ── العلاج ──────────────────────────────────────────────────────────────
-- تُضاف `rows_detail`: عددُ ما يحمله **كلُّ صفٍّ** بالمجموعة على حدة. فتحسب
-- الشاشةُ المنقولَ لأيّ باقٍ تختاره (مجموعُ الآخرين)، بلا نداءٍ ثانٍ للخادم
-- عند كلّ ضغطة. والأعمدةُ القديمة تبقى بدلالتها (فحصُ الحزمة يعتمدها،
-- والواجهةُ القديمة تسقط إليها إن لم تنزل هذه الهجرة بعد).
--
-- **لا `create or replace`**: بوستغريس يرفض تغييرَ نوع الرجوع — نفسُ فخّ 0096
-- و0191 و0197. والحذفُ قبل الإنشاء يجعل الهجرات تُعاد بأيّ ترتيب.
--
-- تراجع: أعِد تنزيل 0197 (تعريفُها هناك بلا العمود الجديد).
-- تُطبَّق بعد 0199.
-- ============================================================================

drop function if exists public.company_twins();
create function public.company_twins()
returns table (
  norm text, keep_id uuid, keep_name text, rows integer,
  ids uuid[], products integer, purchases integer,
  sections integer, charges integer, payments integer,
  moving_products integer, moving_purchases integer, moving_sections integer,
  moving_charges integer, moving_payments integer, pool_moving numeric,
  rows_detail jsonb)
language sql
security invoker
set search_path = public
as $$
  with mine as (
    select id, name, created_at, inv_norm_group(name) k
      from companies where clinic_id = auth_clinic()
  ), g as (
    select k, count(*)::int n, array_agg(id order by created_at) ids,
           (array_agg(id order by created_at))[1] keep_id,
           (array_agg(name order by created_at))[1] keep_name
      from mine group by k having count(*) > 1
  ), m as (
    select g.*, (select array_agg(x) from unnest(g.ids) x where x <> g.keep_id) drop_ids from g
  )
  select m.k, m.keep_id, m.keep_name, m.n, m.ids,
         (select count(*)::int from products p where p.company_id = any (m.ids)),
         (select count(*)::int from purchases p where p.company_id = any (m.ids)),
         (select count(*)::int from company_sections s where s.company_id = any (m.ids)),
         (select count(*)::int from company_charges c where c.company_id = any (m.ids)),
         (select count(*)::int from purchase_payments y where y.company_id = any (m.ids)),
         (select count(*)::int from products p where p.company_id = any (m.drop_ids)),
         (select count(*)::int from purchases p where p.company_id = any (m.drop_ids)),
         (select count(*)::int from company_sections s where s.company_id = any (m.drop_ids)),
         (select count(*)::int from company_charges c where c.company_id = any (m.drop_ids)),
         (select count(*)::int from purchase_payments y where y.company_id = any (m.drop_ids)),
         (select coalesce(sum(s.pooled_stock), 0) from company_sections s where s.company_id = any (m.drop_ids)),
         -- **لكلّ صفٍّ على حدة**: به تحسب الشاشةُ المنقولَ لأيّ باقٍ تختاره.
         (select jsonb_agg(jsonb_build_object(
                   'id', x,
                   'name', (select c.name from companies c where c.id = x),
                   'products', (select count(*) from products p where p.company_id = x),
                   'purchases', (select count(*) from purchases p where p.company_id = x),
                   'sections', (select count(*) from company_sections s where s.company_id = x),
                   'charges', (select count(*) from company_charges c where c.company_id = x),
                   'payments', (select count(*) from purchase_payments y where y.company_id = x),
                   'pool', (select round(coalesce(sum(s.pooled_stock), 0), 3) from company_sections s where s.company_id = x))
                 order by array_position(m.ids, x))
            from unnest(m.ids) x)
    from m order by m.n desc, m.k;
$$;

revoke all on function public.company_twins() from public, anon;
grant execute on function public.company_twins() to authenticated;

comment on function public.company_twins() is
  'مجموعاتُ الشركات المتكرّرة بالعيادة (0196، ووسّعها 0197 ثم 0200): أعدادُ المجموعة، وأعدادُ ما ينتقل للباقية المقترحة، و`rows_detail` لكلّ صفٍّ على حدة كي تصدق الشاشةُ مهما اختارت العيادةُ الباقي.';
