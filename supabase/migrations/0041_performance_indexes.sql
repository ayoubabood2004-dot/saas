-- 0041 · Performance & scale hygiene (safe, additive).
-- From the Supabase performance advisor: cover unindexed foreign keys (faster
-- joins + cascade deletes) and drop two duplicate indexes (wasted space + write
-- cost). Unused-index drops are intentionally NOT done here — at low row counts
-- the planner prefers seq scans, so "unused" is unreliable; revisit at scale.

-- Covering indexes for foreign keys
create index if not exists clinic_services_category_id_idx on public.clinic_services (category_id);
create index if not exists invites_accepted_by_idx        on public.invites (accepted_by);
create index if not exists invoice_items_product_id_idx    on public.invoice_items (product_id);
create index if not exists profiles_clinic_id_idx          on public.profiles (clinic_id);
create index if not exists reminders_pet_id_idx            on public.reminders (pet_id);
create index if not exists staff_user_id_idx               on public.staff (user_id);

-- Drop duplicate indexes (each is identical to a kept sibling)
drop index if exists public.appt_clinic_idx;  -- kept: appointments_clinic_idx
drop index if exists public.rem_clinic_idx;   -- kept: reminders_clinic_idx
