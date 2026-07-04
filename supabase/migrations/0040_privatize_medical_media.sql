-- 0040 · Security hardening — Phase 3: privatise medical-media.
--
-- Run ONLY after the signed-URL app code (commit 4fc28db) is deployed, so the
-- client mints signed URLs instead of relying on public object URLs.
--
-- 1) Convert stored PUBLIC urls to bare storage paths (<pet_id>/<uuid>.<ext>) —
--    the app now stores paths and signs them on read; legacy full-URL rows are
--    migrated here so they keep working.
-- 2) Make the bucket private → medical images are no longer readable by anyone
--    who merely has the URL; access requires a short-lived signed URL, which is
--    only issued to the pet's clinic staff or owner (RLS from migration 0039).

update media_items
set url = regexp_replace(url, '^.*/medical-media/', '')
where url like '%/medical-media/%';

update storage.buckets
set public = false
where id = 'medical-media';
