-- 0038 · Therapeutic boarding (الفندقة العلاجية)
-- A new admission kind for pets that are BOARDING in the clinic AND under active
-- medical care at the same time. Extends the existing admission_kind enum.
--
-- Note: ADD VALUE cannot run inside a transaction block on older Postgres, and the
-- value must exist before any row uses it — so this is its own standalone migration.

alter type admission_kind add value if not exists 'treatment_boarding';
