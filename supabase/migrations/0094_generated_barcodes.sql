-- ============================================================================
-- doctorVet — 0094: سجل الباركودات المولدة (مولد الباركود الداخلي).
--
-- العيادة تولد باركودات EAN-13 داخلية (بادئة 20 — المدى المحجوز عالمياً
-- للاستخدام الداخلي) لبضاعتها الي بلا باركود، وتطبعها ملصقات.
-- هذا الجدول هو السجل: كل كود مولد، لأي غرض/منتج، منو ولّده ومتى.
--
-- قيد unique(clinic_id, barcode) هو الصمام الأخير ضد التكرار — المولد نفسه
-- يتحقق قبل، بس القاعدة تضمن حتى لو جهازان ولّدا بنفس اللحظة.
--
-- Additive & idempotent. Apply AFTER 0093.
-- ============================================================================

create table if not exists generated_barcodes (
  id          uuid primary key default gen_random_uuid(),
  clinic_id   uuid not null references auth.users(id) default auth_clinic(),
  barcode     text not null,
  label       text,
  product_id  uuid references products(id) on delete set null,
  created_by  text,
  created_at  timestamptz not null default now()
);

create unique index if not exists generated_barcodes_unique on generated_barcodes(clinic_id, barcode);
create index if not exists generated_barcodes_clinic_idx on generated_barcodes(clinic_id, created_at desc);

alter table generated_barcodes enable row level security;

drop policy if exists generated_barcodes_clinic_all on generated_barcodes;
create policy generated_barcodes_clinic_all on generated_barcodes for all
  using (clinic_id = auth_clinic())
  with check (clinic_id = auth_clinic());
