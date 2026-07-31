-- 0081 — Booking lifecycle: the «الحجوزات» hub distinguishes customers who
-- ATTENDED from those who booked and never showed up. Adds the no_show status.
-- (Postgres 12+ allows ADD VALUE inside a transaction — safe in the SQL Editor.)

alter type appointment_status add value if not exists 'no_show';
