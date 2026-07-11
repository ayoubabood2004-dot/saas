-- 0043 · Discharge outcome (strictly additive — zero existing rows touched).
--
-- When a case leaves the clinic, staff can record HOW it left:
--   'recovered' → عايش / تعافى        'deceased' → متوفى
-- NULL = not specified (every existing row stays NULL and keeps working).
--
-- pets.deceased mirrors a fatal outcome onto the animal itself so the rest of
-- the app can behave respectfully — e.g. birthday greetings and reminders are
-- suppressed for deceased pets.

alter table public.admissions
  add column if not exists outcome text
  check (outcome in ('recovered', 'deceased'));

alter table public.pets
  add column if not exists deceased boolean not null default false;
