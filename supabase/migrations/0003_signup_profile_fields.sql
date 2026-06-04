-- VetPassport — 0003: capture phone + city at signup and store them on the profile.
-- Idempotent. Apply AFTER 0001 and 0002 (Supabase → SQL Editor → Run).

alter table profiles add column if not exists city text;

-- Re-create the signup trigger so it also reads phone + city from the signup metadata.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, email, role, phone, city)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'owner'),
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'city','')
  )
  on conflict (id) do nothing;
  return new;
end $$;
