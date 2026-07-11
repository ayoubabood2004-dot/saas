-- 0028 — Configurable clinic display name.
-- The app previously had no stored clinic name, so printed documents (consent
-- forms, invoices) fell back to the website/brand text ("doctorVet Clinic") or
-- the staff member's personal full_name. This adds a real, per-clinic name to
-- clinic_prefs so the clinic's own name appears on letterheads and legal forms.

alter table clinic_prefs add column if not exists clinic_name text not null default '';
