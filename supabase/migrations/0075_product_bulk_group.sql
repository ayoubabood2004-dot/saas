-- ============================================================================
-- doctorVet — 0075: مجموعة الإضافة الجماعية للمنتجات.
-- منتجات أُنشئت معاً من «إضافة عدة باركودات دفعة واحدة» تحمل نفس bulk_group،
-- فيمكن فتحها وتعديلها كمجموعة واحدة (أسعار/تصنيف مشتركة + صفوف فردية).
-- Additive + idempotent.
-- ============================================================================
alter table products add column if not exists bulk_group text;
create index if not exists products_bulk_group_idx on products(bulk_group) where bulk_group is not null;
