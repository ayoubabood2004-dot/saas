-- ============================================================================
-- doctorVet — 0055: lock down billing function grants.
--
-- Postgres grants EXECUTE to PUBLIC by default on new functions. The per-role
-- REVOKEs in 0053/0054 removed anon/authenticated but NOT PUBLIC, so anon could
-- still reach these SECURITY DEFINER functions via PostgREST. Most self-gate
-- (is_platform_admin / admin_* / set_usd_rate), but apply_subscription_payment
-- has NO internal check and must be service_role-only — otherwise anyone could
-- grant a clinic free paid time. Revoke PUBLIC everywhere and re-grant only the
-- intended role.
--
-- Idempotent. Apply AFTER 0054.
-- ============================================================================

revoke all on function apply_subscription_payment(uuid, text, text, int) from public, anon, authenticated;
grant execute on function apply_subscription_payment(uuid, text, text, int) to service_role;

revoke all on function get_or_init_subscription() from public, anon;
grant execute on function get_or_init_subscription() to authenticated;

revoke all on function is_platform_admin() from public, anon;
grant execute on function is_platform_admin() to authenticated;

revoke all on function set_usd_rate(numeric) from public, anon;
grant execute on function set_usd_rate(numeric) to authenticated;

revoke all on function admin_activate_subscription(text, text, text, int) from public, anon;
grant execute on function admin_activate_subscription(text, text, text, int) to authenticated;

revoke all on function admin_list_subscriptions() from public, anon;
grant execute on function admin_list_subscriptions() to authenticated;
