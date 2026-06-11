-- ============================================================================
-- VetPassport — 0005: multi-role accounts.
-- A single auth.users row can hold BOTH workspaces (clinic + owner) via a roles[]
-- array, so the same email never needs a second signup.
-- Idempotent. Apply AFTER 0001–0004 (Supabase → SQL Editor → Run).
-- ============================================================================

-- 1) Account-type array on the profile ('owner' and/or 'clinic').
alter table profiles add column if not exists roles text[] not null default '{}';

-- Backfill from the existing single role: owner -> {owner}, any staff -> {clinic}.
update profiles
set roles = case when role = 'owner' then array['owner'] else array['clinic'] end
where roles is null or roles = '{}';

-- 2) Re-create the signup trigger so it also seeds `roles` from the signup metadata.
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  meta_role text := coalesce(new.raw_user_meta_data->>'role', 'owner');
  acct text := case when meta_role = 'owner' then 'owner' else 'clinic' end;
begin
  insert into public.profiles (id, full_name, email, role, phone, city, roles)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
    new.email,
    coalesce(meta_role::user_role, 'owner'),
    nullif(new.raw_user_meta_data->>'phone',''),
    nullif(new.raw_user_meta_data->>'city',''),
    array[acct]
  )
  on conflict (id) do nothing;
  return new;
end $$;

-- 3) Append an account role to the CURRENT user's own profile (secure: keyed by
--    auth.uid(), so a user can only modify themselves). Dedupes. Returns new roles.
--    The app calls this after a user signs in to "add the other workspace" — no
--    second auth.users row, so unique-email never blocks it.
create or replace function add_my_role(p_role text) returns text[]
language plpgsql security definer set search_path = public as $$
declare
  result text[];
begin
  if p_role not in ('owner','clinic') then
    raise exception 'invalid role: %', p_role;
  end if;
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  update public.profiles
    set roles = (select array(select distinct unnest(coalesce(roles, '{}') || array[p_role])))
    where id = auth.uid()
    returning roles into result;
  return result;
end $$;

revoke all on function add_my_role(text) from public, anon;
grant execute on function add_my_role(text) to authenticated;
