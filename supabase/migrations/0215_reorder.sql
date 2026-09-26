-- ============================================================================
-- ٠٢١٥ — اقتراحُ الطلب (م٥، docs/inventory-vnext-plan.md)
--
-- ── المقيس (الإنتاج، ٢٦/٩) ───────────────────────────────────────────────
-- ٧ عياداتٍ باعت ١٬٨٥١ مادةً بآخر ٣٠ يوماً، و**٤٢١ منها الآن عند نقطة إعادة الطلب
-- أو تحتها** (رصيدٌ ≤ معدّلُ البيع اليوميّ × ٧ أيام + حدُّ التنبيه). والطلبُ اليومَ
-- من الذاكرة: يُكتشف النفادُ حين يطلبه زبون. و٧٠٦ من المبيعة بلا شركة — فالاقتراحُ
-- مجمَّعٌ بالشركة وبمجموعة «بدون شركة» لا يُسقطها.
--
-- ── ما تضيفه ─────────────────────────────────────────────────────────────
-- ١) `clinic_prefs.reorder_lead_days`: المهلةُ بين الطلب ووصول البضاعة (افتراضي ٧) —
--    بيد العيادة (١..٩٠). NOT NULL بافتراضٍ ثابت: كلُّ صفٍّ قائمٍ يأخذ ٧ بلا كتابة.
-- ٢) `product_sales_rate(p_days)`: صافي المبيع لكلّ مادةٍ بآخر p_days (٧..١٨٠) —
--    المرتجعُ (سطورٌ سالبة) يُطرح، والصافي لا ينزل تحت صفر. **يجمع بالقاعدة** (قاعدةُ
--    0149: لا قراءةَ لجداول المال بلا مدّة، والمجاميعُ من الخادم) — ألفُ سطرٍ لا يعبر.
--    invoker مع شرط العيادة بنصّه (سياسةُ invoice_items تحكم فوقه).
--
-- الحسابُ نفسُه (نقطةُ إعادة الطلب والكميةُ المقترحة) نقيٌّ بالمتصفّح (`src/lib/reorder.ts`)
-- مفحوصٌ بسلوكه — القاعدةُ تعطي المعدّل، والقرارُ اقتراحٌ يعدّله المستخدم لا أمر.
--
-- تراجع: drop function product_sales_rate(int); والعمودُ يبقى ولا يضرّ.
-- تُطبَّق بعد 0214. وتُعاد بلا أثرٍ ثانٍ.
-- ============================================================================

alter table public.clinic_prefs add column if not exists reorder_lead_days integer not null default 7
  check (reorder_lead_days between 1 and 90);
comment on column public.clinic_prefs.reorder_lead_days is 'مهلةُ وصول الطلبية بالأيام — لحساب نقطة إعادة الطلب (0215، افتراضي 7)';

create or replace function public.product_sales_rate(p_days int default 30)
returns table (product_id uuid, sold numeric)
language sql
stable
security invoker
set search_path = public
as $$
  select ii.product_id, greatest(sum(ii.qty), 0)
    from invoice_items ii
   where ii.clinic_id = (select auth_clinic())
     and ii.product_id is not null
     and ii.created_at >= now() - make_interval(days => least(greatest(coalesce(p_days, 30), 7), 180))
   group by ii.product_id
$$;
revoke all on function public.product_sales_rate(int) from public, anon;
grant execute on function public.product_sales_rate(int) to authenticated;
comment on function public.product_sales_rate(int) is
  'صافي المبيع لكلّ مادةٍ بآخر p_days (٧..١٨٠) — لاقتراح الطلب (0215). المرتجعُ يُطرح والصافي لا ينزل تحت صفر.';
