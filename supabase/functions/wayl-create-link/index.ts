// ============================================================================
// Edge Function: wayl-create-link
//
// Called from the app when a clinic chooses a plan. Runs on the server so the
// Wayl SECRET KEY never reaches the browser. It:
//   1. authenticates the caller (their Supabase JWT) → the clinic id, from
//      auth_clinic() asked as the caller;
//   2. prices the plan SERVER-SIDE from plan_prices (the client never states
//      the amount);
//   3. records a billing_orders row (service role);
//   4. asks Wayl to create a payment link;
//   5. returns the hosted payment URL for the browser to redirect to.
//
// Deploy WITHOUT the platform JWT gate (verify_jwt = false): that gate rejects
// the browser's CORS preflight (OPTIONS carries no JWT), which breaks the call.
// Auth is still enforced HERE — asUser.auth.getUser() validates the caller's
// token and 401s if it's missing/invalid.
//
// Required secrets (supabase secrets set …):
//   WAYL_API_KEY, WAYL_WEBHOOK_SECRET, APP_URL
// Optional: WAYL_BASE (default https://api.thewayl.com), WAYL_ENV (live|test),
//           WAYL_USD_RATE (default 1535)
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  // supabase-js attaches apikey + x-client-info on every functions.invoke — the
  // preflight MUST allow them or the browser blocks the follow-up POST.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WAYL_KEY = Deno.env.get("WAYL_API_KEY");
  const WEBHOOK_SECRET = Deno.env.get("WAYL_WEBHOOK_SECRET");
  const APP_URL = Deno.env.get("APP_URL") ?? "https://doctorvet.vet";
  const WAYL_BASE = Deno.env.get("WAYL_BASE") ?? "https://api.thewayl.com";
  const WAYL_ENV = Deno.env.get("WAYL_ENV") ?? "live";

  if (!WAYL_KEY || !WEBHOOK_SECRET) return json({ error: "server_not_configured" }, 500);

  // 1) Authenticate the caller and resolve their clinic id.
  const authHeader = req.headers.get("Authorization") ?? "";
  const asUser = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userErr } = await asUser.auth.getUser();
  if (userErr || !userData?.user) return json({ error: "unauthorized" }, 401);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);
  // The clinic = auth_clinic(), asked AS THE CALLER — the function the
  // subscription row on the subscribe screen is keyed by (get_or_init_subscription),
  // operator-inside-a-clinic included. Reading memberships here a second way drifted
  // from it: .maybeSingle() errors on two rows (an owner who is also staff elsewhere),
  // so the payment fell back to the caller's own id, and suspended rows counted.
  // No answer = no order: a fallback id would credit a workspace nobody chose.
  const { data: clinicData, error: clinicErr } = await asUser.rpc("auth_clinic");
  if (clinicErr || typeof clinicData !== "string" || !clinicData) {
    return json({ error: "clinic_unresolved", detail: clinicErr?.message }, 503);
  }
  const clinicId: string = clinicData;

  // 2) Validate + price the plan server-side.
  let payload: { plan?: string; period?: string };
  try { payload = await req.json(); } catch { return json({ error: "bad_request" }, 400); }
  const plan = String(payload.plan ?? "");
  const period = payload.period === "annual" ? "annual" : "monthly";

  // The price = the plan_prices row (0104) — the row the plans screen shows and
  // the operator edits. A price table kept here drifted from it (super charged
  // $78 / $936 after plans.ts moved it to $100 / $1000; operator edits never
  // reached the charge). No row = not for sale; a failed read = no charge at a
  // guessed price.
  const { data: priceRow, error: priceErr } = await admin
    .from("plan_prices").select("monthly_usd,annual_usd").eq("plan", plan).maybeSingle();
  if (priceErr) return json({ error: "price_unavailable", detail: priceErr.message }, 503);
  if (!priceRow) return json({ error: "unknown_plan" }, 400);
  const usd = Number(period === "annual" ? priceRow.annual_usd : priceRow.monthly_usd);
  if (!Number.isFinite(usd) || usd <= 0) return json({ error: "price_unavailable" }, 503);

  // Live USD→IQD rate from app_config (admin-editable), falling back to env/default.
  const { data: cfg } = await admin.from("app_config").select("value").eq("key", "usd_rate").maybeSingle();
  const RATE = Number(cfg?.value) || Number(Deno.env.get("WAYL_USD_RATE") ?? "1535");

  const months = period === "annual" ? 12 : 1;
  const amountIqd = Math.max(1000, Math.round(usd * RATE));
  const referenceId = crypto.randomUUID();

  // A human label for the checkout line — Wayl shows it on the payment page.
  const planName: Record<string, string> = { basic: "العادية", advanced: "المطورة", super: "السوبر" };
  const lineLabel = `اشتراك doctorVet — الباقة ${planName[plan] ?? plan} (${period === "annual" ? "سنوي" : "شهري"})`;

  // 3) Record the pending order (trusted amount/clinic live here, not in the client).
  const { error: insErr } = await admin.from("billing_orders").insert({
    reference_id: referenceId, clinic_id: clinicId, plan, period, months,
    usd, amount_iqd: amountIqd, status: "created",
  });
  if (insErr) return json({ error: "order_failed", detail: insErr.message }, 500);

  // 4) Ask Wayl to create the payment link.
  const waylRes = await fetch(`${WAYL_BASE}/api/v1/links`, {
    method: "POST",
    headers: { "X-WAYL-AUTHENTICATION": WAYL_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      env: WAYL_ENV,
      referenceId,
      total: amountIqd,
      currency: "IQD",
      // A single line item whose amount equals `total`. Wayl rejects links with
      // "missing fields" when no breakdown is supplied, and requires the sum of
      // line items to equal the total when present — so one item = the total.
      lineItem: [{ label: lineLabel, amount: amountIqd, type: "increase" }],
      customParameter: `${clinicId}|${plan}|${period}|${months}`,
      webhookUrl: `${SUPABASE_URL}/functions/v1/wayl-webhook`,
      webhookSecret: WEBHOOK_SECRET,
      redirectionUrl: `${APP_URL}/subscribe?paid=1&ref=${referenceId}`,
    }),
  });

  const waylBody = await waylRes.json().catch(() => ({}));
  if (!waylRes.ok || !waylBody?.data?.url) {
    await admin.from("billing_orders").update({ status: "failed" }).eq("reference_id", referenceId);
    // Surface Wayl's field-level errors too (its `message` alone is often the
    // generic "Whoops, missing fields"), so the exact culprit is visible.
    const fields = waylBody?.errors ? ` — ${JSON.stringify(waylBody.errors)}` : "";
    const detail = `${waylBody?.message ?? `HTTP ${waylRes.status}`}${fields}`;
    return json({ error: "wayl_failed", detail }, 502);
  }

  await admin.from("billing_orders").update({ wayl_id: waylBody.data.id }).eq("reference_id", referenceId);

  // 5) Hand the hosted payment URL back to the browser to redirect to.
  return json({ url: waylBody.data.url, referenceId });
});
