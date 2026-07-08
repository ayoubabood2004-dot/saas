-- ============================================================================
-- doctorVet — 0053: subscriptions & billing (Wayl payment gateway).
--
-- Two tables:
--   • subscriptions   — ONE row per clinic: its trial/paid window. The clinic
--                       can only READ its own row; every write goes through a
--                       SECURITY DEFINER path or the service role (the Wayl
--                       webhook / admin activation) — a clinic must never be
--                       able to extend its own paid period from the client.
--   • billing_orders  — an audit row per Wayl payment link we create, so a
--                       webhook can be matched back to a clinic + plan and
--                       replays are idempotent.
--
-- The subscription STATUS (trialing / active / expired / locked) is derived on
-- the client from these timestamps (see src/lib/subscription.ts) — the DB only
-- stores the facts (trial end, period end, ever-paid), never a mutable status.
--
-- Additive & idempotent. Apply AFTER 0052.
-- ============================================================================

create table if not exists subscriptions (
  clinic_id          uuid primary key references auth.users(id) on delete cascade default auth_clinic(),
  plan               text,                                   -- 'basic'|'advanced'|'super' (null during a pure trial)
  period             text,                                   -- 'monthly'|'annual'
  trial_ends_at      timestamptz not null default (now() + interval '14 days'),
  current_period_end timestamptz,                            -- when the PAID window ends (null = never paid)
  was_subscriber     boolean not null default false,         -- ever paid → read-only (not full lock) on expiry
  updated_at         timestamptz not null default now()
);

alter table subscriptions enable row level security;

-- A clinic reads ONLY its own subscription. No client insert/update/delete —
-- writes come from get_or_init_subscription() (definer) or the service role.
drop policy if exists subscriptions_select on subscriptions;
create policy subscriptions_select on subscriptions
  for select using (clinic_id = auth_clinic());

-- ---------------------------------------------------------------------------
-- billing_orders: one row per payment link. clinic_id/plan/amount are pinned
-- server-side when the link is created (the client never states the price), so
-- the webhook can trust them.
-- ---------------------------------------------------------------------------
create table if not exists billing_orders (
  reference_id  text primary key,                            -- our unique id, sent to Wayl as referenceId
  clinic_id     uuid not null references auth.users(id) on delete cascade,
  plan          text not null,
  period        text not null,
  months        int  not null,
  usd           numeric not null,
  amount_iqd    numeric not null,
  status        text not null default 'created',             -- created|complete|cancelled|failed
  wayl_id       text,                                        -- Wayl's link id
  created_at    timestamptz not null default now(),
  completed_at  timestamptz
);

create index if not exists billing_orders_clinic_idx on billing_orders(clinic_id, created_at desc);

alter table billing_orders enable row level security;

drop policy if exists billing_orders_select on billing_orders;
create policy billing_orders_select on billing_orders
  for select using (clinic_id = auth_clinic());

-- ---------------------------------------------------------------------------
-- get_or_init_subscription(): returns the caller-clinic's row, creating the
-- trial row on first touch. SECURITY DEFINER so the insert bypasses the
-- write-blocking RLS, but it can only ever act on auth_clinic() — never another
-- tenant. The client calls this on load to read its own state.
-- ---------------------------------------------------------------------------
create or replace function get_or_init_subscription()
returns subscriptions
language plpgsql
security definer
set search_path = public, auth
as $$
declare r subscriptions;
begin
  select * into r from subscriptions where clinic_id = auth_clinic();
  if not found then
    insert into subscriptions (clinic_id) values (auth_clinic())
      on conflict (clinic_id) do nothing;
    select * into r from subscriptions where clinic_id = auth_clinic();
  end if;
  return r;
end $$;

revoke all on function get_or_init_subscription() from public, anon;
grant execute on function get_or_init_subscription() to authenticated;

-- ---------------------------------------------------------------------------
-- apply_subscription_payment(): extend a clinic's paid window by N months and
-- flag it as a (former) subscriber. Restricted to the service_role ONLY — it
-- is called from the Wayl webhook Edge Function (which runs with the service
-- key) after the payment is independently re-verified against Wayl. Stacks onto
-- an unexpired period so early renewals don't lose remaining days.
-- ---------------------------------------------------------------------------
create or replace function apply_subscription_payment(p_clinic uuid, p_plan text, p_period text, p_months int)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare base timestamptz;
begin
  insert into subscriptions (clinic_id) values (p_clinic) on conflict (clinic_id) do nothing;
  select greatest(coalesce(current_period_end, now()), now()) into base
    from subscriptions where clinic_id = p_clinic;
  update subscriptions
     set plan = p_plan,
         period = p_period,
         current_period_end = base + make_interval(months => p_months),
         was_subscriber = true,
         updated_at = now()
   where clinic_id = p_clinic;
end $$;

-- Lock this down: only the service role (Edge Functions) may activate paid time.
revoke all on function apply_subscription_payment(uuid, text, text, int) from public, anon, authenticated;
grant execute on function apply_subscription_payment(uuid, text, text, int) to service_role;
