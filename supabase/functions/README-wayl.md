# Wayl payment gateway — deployment

Two Edge Functions power the subscription checkout. The Wayl **secret key never
touches the browser** — it lives only in the function secrets.

## 1. Apply the migration
Run `supabase/migrations/0053_subscriptions.sql` in the Supabase SQL editor
(after 0052). It creates `subscriptions`, `billing_orders`, and the RPCs.

## 2. Set the secrets
```
supabase secrets set WAYL_API_KEY="<your NEW Wayl key>"
supabase secrets set WAYL_WEBHOOK_SECRET="<any long random string, 10-255 chars>"
supabase secrets set APP_URL="https://doctorvet.vet"
# optional:
supabase secrets set WAYL_ENV="live"        # or "test"
supabase secrets set WAYL_USD_RATE="1535"   # USD→IQD rate; update when the market moves
supabase secrets set WAYL_BASE="https://api.thewayl.com"
```

## 3. Deploy the functions
```
supabase functions deploy wayl-create-link --no-verify-jwt
supabase functions deploy wayl-webhook --no-verify-jwt
```
BOTH deploy with `--no-verify-jwt`. The platform JWT gate rejects the browser's
CORS preflight (OPTIONS has no JWT), so `wayl-create-link` must disable it and
authenticate INTERNALLY instead (it calls `auth.getUser()` and 401s if the
caller isn't signed in). `wayl-webhook` disables it because Wayl can't send a
Supabase JWT; it is secured by the shared secret **and** by independently
re-verifying every order against Wayl before granting paid time.

The webhook URL Wayl calls is:
`https://<project-ref>.supabase.co/functions/v1/wayl-webhook`
(sent automatically on every link we create — no dashboard config needed).

## Flow
1. Clinic picks a plan → app calls `wayl-create-link` → gets the hosted URL → redirects.
2. Clinic pays on Wayl → redirected back to `/subscribe?paid=1`.
3. Wayl calls `wayl-webhook` → we re-verify with `GET /api/v1/links/{ref}` →
   on `Complete` we extend the subscription via `apply_subscription_payment`.
