-- 0078 — Real booking: clinic directory + public staff roster.
-- Owners book at REAL clinics with the clinic's REAL team (إدارة الكادر) instead
-- of the old hardcoded demo doctors, and the appointment carries the clinic's id
-- so it lands in that clinic's reception (policy appt_clinic_all from 0014).
-- Both functions expose only safe, deliberately-public columns.

-- Directory of clinic workspaces an owner can book at (name/city/phone only).
-- plpgsql (not language sql) so the optional clinic_members exclusion compiles
-- even on databases where that table was never created — the branch that
-- references it only runs when the table actually exists.
create or replace function public.clinic_directory()
returns table (id uuid, name text, city text, phone text)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if to_regclass('public.clinic_members') is not null then
    -- workspace owners only — an invited staff member's personal profile is not a clinic
    return query
    select p.id, p.full_name, p.city, p.phone
    from profiles p
    where ('clinic' = any(coalesce(p.roles, '{}'::text[])) or p.role = 'admin')
      and not exists (
        select 1 from clinic_members cm
        where cm.user_id = p.id and cm.clinic_id <> p.id and cm.status = 'active'
      )
    order by p.full_name;
  else
    return query
    select p.id, p.full_name, p.city, p.phone
    from profiles p
    where ('clinic' = any(coalesce(p.roles, '{}'::text[])) or p.role = 'admin')
    order by p.full_name;
  end if;
end;
$$;

revoke all on function public.clinic_directory() from public;
grant execute on function public.clinic_directory() to authenticated;

-- Active team of one clinic (bookable people): id/name/role/specialty only.
create or replace function public.clinic_staff_public(p_clinic uuid)
returns table (id uuid, name text, role text, specialty text)
language sql
security definer
set search_path = public
stable
as $$
  select s.id, s.name, s.role, s.specialty
  from staff s
  where s.clinic_id = p_clinic
    and s.status = 'active'
  order by case s.role when 'veterinarian' then 0 when 'manager' then 1 else 2 end, s.name;
$$;

revoke all on function public.clinic_staff_public(uuid) from public;
grant execute on function public.clinic_staff_public(uuid) to authenticated;
