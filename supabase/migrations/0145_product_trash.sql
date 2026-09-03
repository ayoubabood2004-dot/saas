-- ============================================================================
-- ٠١٤٥ — الحذفُ يصير طيّاً لا محواً: سلّةُ محذوفاتٍ واسترجاع
--
-- ── ما وقع (بعيادتين) ────────────────────────────────────────────────────
-- «مادة مُدخَلة بالباركود الصحيح، بايعين منها أكثر من نسخة، وفجأة اختفت كأنها
-- ما كانت». وسجلُّ التدقيق يقول ما لا يقوله أحدٌ بالعيادة: **حُذفت** من زرّ
-- الحذف، على حساب الصندوق المشترك، حذفاً منفرداً بلا كتاباتٍ أخرى بنفس الدقيقة.
-- «دراي فود رويال اس او» بالاسمر بعد ٧ مبيعات، و«سانك اناابا تونا» بابن الهيثم
-- ورصيدُه ٩٩.
--
-- لا أحدَ يتذكّر لأن الزرّ بالصفّ جنبَ التعديل بحجم أصبع، وتأكيدُه نافذةُ
-- متصفّحٍ عامّة تُقبل بلا قراءة، والحذفُ **نهائي**: الصفُّ يُمحى، وسطورُ الفواتير
-- تفقد صنفَها (المفتاح الأجنبي يصفّر product_id)، فيصير المنتج «كأنه ما كان».
--
-- ── العلاج ───────────────────────────────────────────────────────────────
-- الحذفُ لا يُمنع — للعيادة حقُّ تنظيف مخزنها — لكنه يصير **قابلاً للرجوع**:
--   ١) قبل الحذف تُحفظ صورةُ الصفّ كاملةً، ومعرّفاتُ سطور الفواتير والمشتريات
--      والملصقات التي كانت تشير إليه، ومَن حذف ولماذا، وكم انباع منه.
--   ٢) الاسترجاع يُعيد الصفَّ **بنفس معرّفه** ويُرجع السطورَ إليه — فتقارير
--      المبيعات تستعيد صنفَها كما كان.
--   ٣) الواجهة تقول الحقيقة قبل التأكيد: «هذا المنتج انباع ٧ مرّات ورصيده ٩٩».
--
-- ما لم يُغيَّر: الجدولُ `products` كما هو، وكلُّ من يقرأه كما هو. السلّةُ جدولٌ
-- مستقلّ، فلا يتأثّر مسحٌ ولا بحثٌ ولا تقرير.
-- ============================================================================

create table if not exists products_trash (
  id           uuid primary key,                       -- معرّف المنتج نفسه، ليُستعاد به
  clinic_id    uuid not null references auth.users(id) on delete cascade,
  row          jsonb not null,                         -- صورة الصفّ لحظة الحذف
  invoice_item_ids  uuid[] not null default '{}',
  purchase_item_ids uuid[] not null default '{}',
  barcode_ids       uuid[] not null default '{}',
  sold_qty     numeric not null default 0,             -- ما انباع منه — يُعرض للتأكيد وبالسلّة
  stock        numeric not null default 0,
  reason       text,
  deleted_by   uuid default auth.uid(),
  deleted_at   timestamptz not null default now()
);
create index if not exists products_trash_clinic_idx on products_trash(clinic_id, deleted_at desc);

alter table products_trash enable row level security;
drop policy if exists products_trash_read on products_trash;
create policy products_trash_read on products_trash for select
  using (clinic_id = (select auth_clinic()));

-- ── الحذف: طيٌّ بصورةٍ كاملة ───────────────────────────────────────────────
create or replace function delete_product(p_id uuid, p_reason text default null)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_p products;
  v_inv uuid[]; v_pur uuid[]; v_bar uuid[];
  v_sold numeric;
begin
  select * into v_p from products where id = p_id for update;
  if v_p.id is null then raise exception 'product not found'; end if;

  select coalesce(array_agg(id), '{}') into v_inv from invoice_items  where product_id = p_id;
  select coalesce(array_agg(id), '{}') into v_pur from purchase_items where product_id = p_id;
  select coalesce(array_agg(id), '{}') into v_bar from generated_barcodes where product_id = p_id;
  select coalesce(sum(qty), 0) into v_sold from invoice_items where product_id = p_id and qty > 0;

  insert into products_trash (id, clinic_id, row, invoice_item_ids, purchase_item_ids, barcode_ids, sold_qty, stock, reason)
  values (v_p.id, v_p.clinic_id, to_jsonb(v_p), v_inv, v_pur, v_bar, v_sold, coalesce(v_p.stock, 0), nullif(btrim(p_reason), ''))
  on conflict (id) do update
    set row = excluded.row, invoice_item_ids = excluded.invoice_item_ids,
        purchase_item_ids = excluded.purchase_item_ids, barcode_ids = excluded.barcode_ids,
        sold_qty = excluded.sold_qty, stock = excluded.stock, reason = excluded.reason,
        deleted_by = auth.uid(), deleted_at = now();

  -- فكُّ الإشارات صراحةً لا اتكالاً على «on delete set null» — المعرّفات محفوظة
  -- فوق، والاسترجاع يعيدها. هكذا لا تعتمد الدالّة على شكل المفتاح الأجنبي.
  update invoice_items      set product_id = null where product_id = p_id;
  update purchase_items     set product_id = null where product_id = p_id;
  update generated_barcodes set product_id = null where product_id = p_id;
  delete from products where id = p_id;
  return jsonb_build_object('id', v_p.id, 'sold_qty', v_sold, 'stock', coalesce(v_p.stock, 0));
end $$;
revoke all on function delete_product(uuid, text) from public, anon;
grant execute on function delete_product(uuid, text) to authenticated;

-- ── الاسترجاع: نفسُ المعرّف، ونفسُ السطور ──────────────────────────────────
create or replace function restore_product(p_id uuid)
returns products
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_t products_trash;
  v_p products;
begin
  select * into v_t from products_trash where id = p_id for update;
  if v_t.id is null then raise exception 'not in trash'; end if;
  if exists (select 1 from products where id = p_id) then
    raise exception 'product already exists'; end if;

  -- الباركود لازم يبقى فريداً: لو أُدخل المنتج من جديد بنفس الباركود أثناء
  -- غيابه، لا نكسر القيد — نستعيد الصفّ بلا باركود ونترك للمستخدم ربطه.
  if (v_t.row->>'barcode') is not null and exists (
       select 1 from products where clinic_id = v_t.clinic_id and barcode = v_t.row->>'barcode') then
    v_t.row := v_t.row - 'barcode';
  end if;

  insert into products select * from jsonb_populate_record(null::products, v_t.row)
  returning * into v_p;

  update invoice_items      set product_id = p_id where id = any(v_t.invoice_item_ids)  and product_id is null;
  update purchase_items     set product_id = p_id where id = any(v_t.purchase_item_ids) and product_id is null;
  update generated_barcodes set product_id = p_id where id = any(v_t.barcode_ids)       and product_id is null;

  delete from products_trash where id = p_id;
  return v_p;
end $$;
revoke all on function restore_product(uuid) from public, anon;
grant execute on function restore_product(uuid) to authenticated;
