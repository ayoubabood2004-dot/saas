// ============================================================================
// Edge Function: wayl-webhook
//
// Wayl calls this URL when a payment link changes status. We do NOT trust the
// webhook body — we independently re-verify the order straight from Wayl
// (GET /api/v1/links/{referenceId}) before granting any paid time. Only when
// Wayl itself reports the order Complete do we extend the clinic's subscription.
// Idempotent: a replayed webhook for an already-activated order is a no-op.
//
// Deploy WITHOUT JWT verification (Wayl can't send a Supabase JWT):
//   supabase functions deploy wayl-webhook --no-verify-jwt
//
// Required secrets: WAYL_API_KEY, WAYL_WEBHOOK_SECRET
// Optional: WAYL_BASE (default https://api.thewayl.com)
// ============================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("method_not_allowed", { status: 405 });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const WAYL_KEY = Deno.env.get("WAYL_API_KEY");
  const WEBHOOK_SECRET = Deno.env.get("WAYL_WEBHOOK_SECRET");
  const WAYL_BASE = Deno.env.get("WAYL_BASE") ?? "https://api.thewayl.com";
  if (!WAYL_KEY || !WEBHOOK_SECRET) return new Response("not_configured", { status: 500 });

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* some webhooks send form data — fall through */ }

  // A light authenticity check on the shared secret (header or body), if present.
  const presentedSecret = req.headers.get("x-wayl-webhook-secret")
    ?? (typeof body.webhookSecret === "string" ? body.webhookSecret : null);
  if (presentedSecret && presentedSecret !== WEBHOOK_SECRET) {
    return new Response("bad_secret", { status: 401 });
  }

  // Pull our reference id out of whatever shape Wayl sent.
  const referenceId = (body.referenceId ?? (body.data as Record<string, unknown> | undefined)?.referenceId) as string | undefined;
  if (!referenceId) return new Response("no_reference", { status: 400 });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Match it to the order we recorded when the link was created.
  const { data: order } = await admin
    .from("billing_orders").select("*").eq("reference_id", referenceId).maybeSingle();
  if (!order) return new Response("ok", { status: 200 });          // not ours → ignore
  if (order.status === "complete") return new Response("ok", { status: 200 }); // already done → idempotent

  // Re-verify with Wayl directly — the ONLY source we trust for "paid".
  const verify = await fetch(`${WAYL_BASE}/api/v1/links/${referenceId}`, {
    headers: { "X-WAYL-AUTHENTICATION": WAYL_KEY },
  });
  const vBody = await verify.json().catch(() => ({}));
  const status = (vBody?.data?.status ?? "") as string;

  if (status !== "Complete" && status !== "Delivered") {
    // Not paid (yet). Record the terminal-failure states; leave pending ones alone.
    if (["Cancelled", "Rejected", "Returned"].includes(status)) {
      await admin.from("billing_orders").update({ status: "cancelled" }).eq("reference_id", referenceId);
    }
    return new Response("ok", { status: 200 });
  }

  // Paid & verified → extend the subscription and close the order (idempotently).
  const { error: rpcErr } = await admin.rpc("apply_subscription_payment", {
    p_clinic: order.clinic_id, p_plan: order.plan, p_period: order.period, p_months: order.months,
  });
  if (rpcErr) return new Response("activation_failed", { status: 500 });

  await admin.from("billing_orders")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("reference_id", referenceId);

  return new Response("ok", { status: 200 });
});
