-- 0082 — Rescue orphaned owner bookings.
-- Before the clinic_id fix, owner-created appointments defaulted clinic_id to
-- the OWNER's auth id, so no clinic could ever see them (appt_clinic_all).
-- Re-point every such appointment at the clinic that owns the booked pet.

update appointments a
   set clinic_id = p.clinic_id
  from pets p
 where p.id = a.pet_id
   and p.clinic_id is not null
   and (a.clinic_id is null or a.clinic_id = a.owner_id);
