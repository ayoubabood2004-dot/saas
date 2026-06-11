-- ============================================================================
-- Medical media vault: dedicated Supabase Storage bucket + access policies.
-- Run this in the Supabase SQL editor (or via `supabase db push`).
-- Files are uploaded to the 'medical-media' bucket under <pet_id>/<uuid>.<ext>,
-- and a row in media_items links the public URL to the pet (FK pet_id).
-- ============================================================================

-- 1) The bucket (public read so getPublicUrl works; object names are UUIDs).
insert into storage.buckets (id, name, public)
values ('medical-media', 'medical-media', true)
on conflict (id) do update set public = excluded.public;

-- 2) Storage object policies (scoped to this bucket).
drop policy if exists "medical_media_read" on storage.objects;
create policy "medical_media_read" on storage.objects
  for select using (bucket_id = 'medical-media');

drop policy if exists "medical_media_insert" on storage.objects;
create policy "medical_media_insert" on storage.objects
  for insert to authenticated with check (bucket_id = 'medical-media');

drop policy if exists "medical_media_update" on storage.objects;
create policy "medical_media_update" on storage.objects
  for update to authenticated
  using (bucket_id = 'medical-media') with check (bucket_id = 'medical-media');

drop policy if exists "medical_media_delete" on storage.objects;
create policy "medical_media_delete" on storage.objects
  for delete to authenticated using (bucket_id = 'medical-media');

-- 3) media_items: clinic staff already have read/write policies (0001). Add
--    owner-side policies so a pet owner can view and add media for their pets.
drop policy if exists media_items_owner_read on media_items;
create policy media_items_owner_read on media_items
  for select using (
    exists (select 1 from pets p where p.id = media_items.pet_id and p.owner_id = auth.uid())
  );

drop policy if exists media_items_owner_write on media_items;
create policy media_items_owner_write on media_items
  for insert with check (
    exists (select 1 from pets p where p.id = media_items.pet_id and p.owner_id = auth.uid())
  );
