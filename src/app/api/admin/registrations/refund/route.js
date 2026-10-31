import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import {
  createPayMongoRefund,
  getPayMongoRefund,
  getPayMongoTestSecret,
  verifyPayMongoPayment,
} from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";

function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("Payment processing is not configured.");
  const { supabaseUrl } = getSupabaseEnv();
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

async function saveRefundStatus(serviceClient, registrationId, refundId, status) {
  const { data, error } = await serviceClient.rpc("set_event_ticket_refund_status", {
    p_registration_id: registrationId,
    p_refund_id: refundId,
    p_refund_status: status,
  });
  if (error) {
    console.error("Could not save event ticket refund status", error);
    throw new Error("Could not update the registration after processing its refund.");
  }
  if (!data) throw new Error("The refund status changed before it could be saved.");
}

export async function POST(request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return Response.json({ error: "Invalid request origin." }, { status: 403 });
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "A valid JSON request is required." }, { status: 400 });
  }
  const registrationId = typeof body?.registrationId === "string" ? body.registrationId : "";
  const action = body?.action;
  const reason = typeof body?.reason === "string" ? body.reason.trim() : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(registrationId)
    || !["issue", "check"].includes(action)) {
    return Response.json({ error: "A valid registration and refund action are required." }, { status: 400 });
  }
  if (action === "issue" && (!reason || reason.length > 500)) {
    return Response.json({ error: "A refund reason of 1 to 500 characters is required." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError?.name !== "AuthSessionMissingError" && authError) throw authError;
  if (!user) return Response.json({ error: "Sign in with an organizer account to manage refunds." }, { status: 401 });

  let serviceClient;
  try {
    getPayMongoTestSecret();
    serviceClient = createServiceClient();
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Refund processing is not configured.",
    }, { status: 503 });
  }

  if (action === "issue") {
    const { data: paymentRows, error: beginError } = await supabase.rpc("admin_begin_event_ticket_refund", {
      p_registration_id: registrationId,
      p_refund_reason: reason,
    });
    if (beginError) return Response.json({ error: beginError.message }, { status: 400 });
    const payment = paymentRows?.[0];
    if (!payment?.payment_id || !Number.isSafeInteger(Number(payment.amount))) {
      return Response.json({ error: "A verified PayMongo payment is required before refunding." }, { status: 409 });
    }

    try {
      await verifyPayMongoPayment({
        paymentId: payment.payment_id,
        amount: Number(payment.amount),
        currency: payment.currency,
      });
    } catch (error) {
      const { error: saveError } = await serviceClient.rpc("set_event_ticket_refund_status", {
        p_registration_id: registrationId,
        p_refund_id: null,
        p_refund_status: "failed",
      });
      if (saveError) console.error("Could not release unverified event ticket refund request", saveError);
      return Response.json({
        error: error instanceof Error ? error.message : "PayMongo could not verify the payment.",
      }, { status: 502 });
    }

    let refund;
    try {
      refund = await createPayMongoRefund({
        paymentId: payment.payment_id,
        amount: Number(payment.amount),
        currency: payment.currency,
        notes: `Registration ${registrationId}: ${reason}`,
      });
    } catch (error) {
      if (error?.refundRequestRejected) {
        const { error: saveError } = await serviceClient.rpc("set_event_ticket_refund_status", {
          p_registration_id: registrationId,
          p_refund_id: null,
          p_refund_status: "failed",
        });
        if (saveError) console.error("Could not release rejected event ticket refund request", saveError);
      }
      return Response.json({
        error: error instanceof Error
          ? error.refundRequestRejected
            ? error.message
            : `${error.message} Leave the refund pending and check its status before retrying.`
          : "Refund outcome could not be verified. Leave the refund pending and check its status before retrying.",
      }, { status: 502 });
    }
    try {
      const verifiedRefund = await getPayMongoRefund(refund.id, {
        paymentId: payment.payment_id,
        amount: Number(payment.amount),
        currency: payment.currency,
      });
      await saveRefundStatus(serviceClient, registrationId, verifiedRefund.id, verifiedRefund.status);
      return Response.json({ status: verifiedRefund.status });
    } catch (error) {
      return Response.json({
        error: error instanceof Error ? error.message : "Could not verify the PayMongo refund.",
      }, { status: 502 });
    }
  }

  const { data: refundRows, error: detailsError } = await supabase.rpc("admin_get_event_ticket_refund", {
    p_registration_id: registrationId,
  });
  if (detailsError) return Response.json({ error: detailsError.message }, { status: 400 });
  const details = refundRows?.[0];
  if (details?.refund_status !== "pending" || !details.refund_id || !details.payment_id) {
    return Response.json({ status: details?.refund_status || "none" });
  }

  let refund;
  try {
    refund = await getPayMongoRefund(details.refund_id, {
      paymentId: details.payment_id,
      amount: Number(details.amount),
      currency: details.currency,
    });
  } catch (error) {
    return Response.json({
      error: error instanceof Error ? error.message : "Could not check the PayMongo refund.",
    }, { status: 502 });
  }
  await saveRefundStatus(serviceClient, registrationId, refund.id, refund.status);
  return Response.json({ status: refund.status });
}
