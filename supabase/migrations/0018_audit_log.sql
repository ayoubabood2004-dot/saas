-- ============================================================================
-- doctorVet — 0018: audit log (who did what, when) — safe & non-blocking.
--
-- Captures high-signal events only: all changes to access tables (memberships,
-- invites, staff) + destructive deletes on clinical/financial tables. The
-- trigger swallows any error, so auditing can NEVER block the real operation.
-- Additive — existing data/behaviour untouched. Apply AFTER 0001–0017.
-- ============================================================================

create table if not exists audit_log (
  id         bigint generated always as identity primary key,
  clinic_id  uuid,
  actor      uuid,                 -- auth.uid() of who did it
  action     text,                 -- INSERT | UPDATE | DELETE
  entity     text,                 -- table name
  entity_id  text,                 -- affected row id
  details    jsonb,                -- snapshot of the row
  created_at timestamptz not null default now()
);
create index if not exists audit_clinic_idx on audit_log(clinic_id, created_at desc);

-- Defensive trigger: logs the change but never raises, so it can't block writes.
create or replace function audit_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare v jsonb;
begin
  begin
    v := case when TG_OP = 'DELETE' then to_jsonb(OLD) else to_jsonb(NEW) end;
    insert into audit_log (clinic_id, actor, action, entity, entity_id, details)
    values (
      coalesce(nullif(v->>'clinic_id','')::uuid, auth_clinic()),
      auth.uid(), TG_OP, TG_TABLE_NAME, (v->>'id'), v
    );
  exception when others then
    null; -- auditing must never break the underlying operation
  end;
  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end $$;

-- Attach triggers only to tables that exist (idempotent, order-independent).
do $$
declare t text;
begin
  -- Access/role changes → log every operation.
  foreach t in array array['memberships','invites','staff'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists audit_all on %I', t);
      execute format('create trigger audit_all after insert or update or delete on %I for each row execute function audit_change()', t);
    end if;
  end loop;
  -- Destructive deletes on clinical/financial tables → log deletions.
  foreach t in array array['invoices','pets','medical_visits','products'] loop
    if to_regclass(t) is not null then
      execute format('drop trigger if exists audit_del on %I', t);
      execute format('create trigger audit_del after delete on %I for each row execute function audit_change()', t);
    end if;
  end loop;
end $$;

-- Only a clinic's manager can read its audit trail.
alter table audit_log enable row level security;
drop policy if exists audit_manager_read on audit_log;
create policy audit_manager_read on audit_log for select
  using (clinic_id = auth_clinic() and auth_role() = 'manager');

-- (Inserts happen via the SECURITY DEFINER trigger, which bypasses RLS — so no
--  insert policy is needed and clients can never forge or tamper with log rows.)
