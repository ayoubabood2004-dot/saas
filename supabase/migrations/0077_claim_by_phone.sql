-- 0077 — Phone-as-identity auto-claim.
-- An owner account automatically LINKS every pet registered under its own phone
-- number (across all clinics). Linking only sets owner_id; the clinic's stored
-- customer name/phone/email (اسم المراجع) are never overwritten — blank name/email
-- may be filled. Pets already linked to another real owner account are skipped.

-- Canonical phone key: digits only, international prefixes and leading zeros
-- stripped, Eastern-Arabic digits translated — mirrors src/lib/phone.ts phoneKey().
create or replace function public.phone_key(p text)
returns text
language sql
immutable
as $$
  select regexp_replace(
           regexp_replace(
             regexp_replace(
               regexp_replace(
                 translate(coalesce(p, ''), '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789'),
                 '\D', '', 'g'),
               '^00', ''),
             '^964', ''),
           '^0+', '');
$$;

create or replace function public.claim_pets_by_phone(p_name text default null, p_email text default null)
returns setof public.pets
language plpgsql
security definer
set search_path = public
as $$
declare
  v_key text;
begin
  if auth.uid() is null then
    return;
  end if;

  -- Owner accounts only — clinic/staff accounts must not bulk-link customer pets
  -- to themselves even when phone numbers coincide.
  if not exists (
    select 1 from profiles pr
     where pr.id = auth.uid()
       and (pr.role = 'owner' or (pr.roles is not null and 'owner' = any(pr.roles)))
  ) then
    return;
  end if;

  -- The matching number is ALWAYS the caller's profile phone (server-side truth),
  -- never a client-supplied value — an account can only claim its own number.
  select phone_key(pr.phone) into v_key from profiles pr where pr.id = auth.uid();
  if v_key is null or length(v_key) < 8 then
    return;
  end if;

  return query
  update pets p
     set owner_id = auth.uid(),
         owner_name = case
           when (p.owner_name is null or btrim(p.owner_name) in ('', '—')) and p_name is not null and btrim(p_name) <> ''
           then btrim(p_name) else p.owner_name end,
         owner_email = case
           when (p.owner_email is null or btrim(p.owner_email) = '') and p_email is not null and btrim(p_email) <> ''
           then btrim(p_email) else p.owner_email end
   where p.owner_id is distinct from auth.uid()
     and phone_key(p.owner_phone) = v_key
     -- never steal a pet already linked to another real owner account
     and not exists (
       select 1 from profiles pr2
        where pr2.id = p.owner_id
          and (pr2.role = 'owner' or (pr2.roles is not null and 'owner' = any(pr2.roles)))
     )
  returning p.*;
end;
$$;

revoke all on function public.claim_pets_by_phone(text, text) from public;
grant execute on function public.claim_pets_by_phone(text, text) to authenticated;
