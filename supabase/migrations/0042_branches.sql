-- 0042 · Multi-branch, Phase 1 (STRICTLY ADDITIVE — zero existing rows touched).
--
-- A branch is a location INSIDE the clinic tenant. The audited security
-- boundary is unchanged: every table still isolates on clinic_id = auth_clinic().
-- branch_id is an intra-clinic organisational dimension, never an access
-- boundary — so this migration cannot introduce cross-tenant leaks.
--
-- NULL-means-main semantics: existing admissions keep branch_id NULL and the
-- app always reads NULL as "الفرع الرئيسي". No backfill, no UPDATE of any
-- existing row — a single-branch clinic is byte-for-byte unaffected.

-- ── The branches catalogue ──────────────────────────────────────────────────
create table if not exists public.branches (
  id         uuid primary key default gen_random_uuid(),
  clinic_id  uuid not null default auth_clinic() references auth.users(id) on delete cascade,
  name       text not null,
  address    text,
  phone      text,
  is_main    boolean not null default false,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists branches_clinic_idx on public.branches (clinic_id);
-- At most ONE main branch per clinic (partial unique index).
create unique index if not exists branches_one_main_per_clinic
  on public.branches (clinic_id) where is_main;

alter table public.branches enable row level security;

-- Every staff member of the clinic can SEE its branches (needed for the
-- switcher); only managers can create/rename/manage them.
drop policy if exists branches_clinic_read   on public.branches;
drop policy if exists branches_manager_insert on public.branches;
drop policy if exists branches_manager_update on public.branches;
drop policy if exists branches_manager_delete on public.branches;

create policy branches_clinic_read on public.branches
  for select to authenticated
  using (clinic_id = auth_clinic());

create policy branches_manager_insert on public.branches
  for insert to authenticated
  with check (clinic_id = auth_clinic() and auth_role() = 'manager');

create policy branches_manager_update on public.branches
  for update to authenticated
  using      (clinic_id = auth_clinic() and auth_role() = 'manager')
  with check (clinic_id = auth_clinic() and auth_role() = 'manager');

create policy branches_manager_delete on public.branches
  for delete to authenticated
  using (clinic_id = auth_clinic() and auth_role() = 'manager');

-- ── Admissions gain an OPTIONAL branch ──────────────────────────────────────
-- ON DELETE SET NULL: removing a branch can never delete or orphan a case —
-- its rows simply fall back to the main branch (NULL). Data is unloseable.
alter table public.admissions
  add column if not exists branch_id uuid references public.branches(id) on delete set null;

create index if not exists admissions_branch_idx on public.admissions (branch_id);

-- ── Intra-clinic integrity guard ────────────────────────────────────────────
-- RLS already blocks cross-tenant reads/writes; this additionally stops a row
-- from being mis-tagged with a branch that belongs to ANOTHER clinic (the
-- clinic_id check in RLS alone would not catch that).
create or replace function public.assert_branch_matches_clinic()
returns trigger
language plpgsql security definer set search_path to 'public'
as $$
begin
  if new.branch_id is not null and not exists (
    select 1 from branches b
    where b.id = new.branch_id
      and b.clinic_id = coalesce(new.clinic_id, auth_clinic())
  ) then
    raise exception 'branch % does not belong to this clinic', new.branch_id;
  end if;
  return new;
end $$;
revoke execute on function public.assert_branch_matches_clinic() from anon, authenticated;

drop trigger if exists admissions_branch_guard on public.admissions;
create trigger admissions_branch_guard
  before insert or update of branch_id on public.admissions
  for each row execute function public.assert_branch_matches_clinic();
