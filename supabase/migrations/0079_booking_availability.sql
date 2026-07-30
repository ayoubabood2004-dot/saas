-- 0079 — Booking availability: let an OWNER see which slots are actually busy.
-- RLS (rightly) hides other people's appointments from owners, but that made the
-- owner-side slot picker blind: it only saw the owner's own bookings, so two
-- customers could book the same doctor at the same time. This RPC exposes ONLY
-- (doctor_id, scheduled_at) pairs — no patient, pet, or clinic details — which
-- is exactly the information a booking calendar needs and nothing more.

create or replace function public.doctor_busy_slots(p_doctors text[], p_from timestamptz, p_to timestamptz)
returns table (doctor_id text, scheduled_at timestamptz)
language sql
security definer
set search_path = public
stable
as $$
  select a.doctor_id, a.scheduled_at
  from appointments a
  where a.doctor_id = any(p_doctors)
    and a.scheduled_at >= p_from
    and a.scheduled_at <= p_to
    and a.status <> 'cancelled';
$$;

revoke all on function public.doctor_busy_slots(text[], timestamptz, timestamptz) from public;
grant execute on function public.doctor_busy_slots(text[], timestamptz, timestamptz) to authenticated;
