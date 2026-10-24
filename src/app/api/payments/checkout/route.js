import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createPayMongoCheckout, isPayMongoCheckoutUrl } from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { isFeatureEnabled } from "@/lib/features";

function getServiceClient() {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured for payment processing.");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export async function POST(request) {
  if (!process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_test_")) {
    return Response.json({ error: "Configure a PayMongo test secret key to enable checkout." }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Payment processing is not configured on the server." }, { status: 503 });
  }

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

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError?.name !== "AuthSessionMissingError" && authError) throw authError;
  if (!user) return Response.json({ error: "Sign in to continue." }, { status: 401 });

  if (!(await isFeatureEnabled("payment-gateway"))) {
    return Response.json({ error: "Paid checkout is currently disabled." }, { status: 503 });
  }

  const serviceClient = getServiceClient();
  let orderResult;
  let paymentType;
  if (body?.type === "event_ticket" && typeof body.eventId === "string") {
    paymentType = "event_ticket";
    orderResult = await serviceClient.rpc("create_paymongo_event_order", {
      p_user_id: user.id,
      p_event_id: body.eventId,
    });
  } else if (
    body?.type === "organization_subscription" &&
    typeof body.organizationId === "string" &&
    typeof body.planTier === "string"
  ) {
    paymentType = "organization_subscription";
    orderResult = await serviceClient.rpc("create_paymongo_subscription_order", {
      p_user_id: user.id,
      p_organization_id: body.organizationId,
      p_plan_tier: body.planTier,
    });
  } else {
    return Response.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  if (orderResult.error) {
    console.error("Unable to prepare PayMongo order", orderResult.error);
    return Response.json({ error: orderResult.error.message }, { status: 400 });
  }
  const order = orderResult.data?.[0];
  if (!order) {
    return Response.json({ error: "Could not prepare this payment." }, { status: 500 });
  }

  if (order.checkout_url) {
    if (!isPayMongoCheckoutUrl(order.checkout_url)) {
      return Response.json({ error: "The saved checkout URL is invalid." }, { status: 500 });
    }
    return Response.json({ checkoutUrl: order.checkout_url });
  }

  let checkout;
  try {
    checkout = await createPayMongoCheckout({
      order: { ...order, payment_type: paymentType },
      origin,
    });
  } catch (error) {
    const { error: updateError } = await serviceClient
      .from("payment_transactions")
      .update({ status: "failed" })
      .eq("id", order.order_id)
      .eq("status", "pending");
    if (updateError) {
      console.error("Unable to mark failed PayMongo order", updateError);
    }
    if (order.registration_id) {
      const { error: registrationError } = await serviceClient
        .from("registrations")
        .update({ status: "cancelled" })
        .eq("id", order.registration_id)
        .eq("status", "pending");
      if (registrationError) {
        console.error("Unable to release failed event ticket reservation", registrationError);
      }
    }
    return Response.json(
      { error: error instanceof Error ? error.message : "PayMongo checkout failed." },
      { status: 502 },
    );
  }

  const { error: saveError } = await serviceClient.rpc("save_paymongo_checkout_session", {
    p_order_id: order.order_id,
    p_checkout_session_id: checkout.checkoutSessionId,
    p_checkout_url: checkout.checkoutUrl,
  });
  if (saveError) {
    console.error("Unable to save PayMongo checkout session", saveError);
    return Response.json({ error: "The checkout was created but could not be saved. Please contact support before retrying." }, { status: 500 });
  }

  return Response.json({ checkoutUrl: checkout.checkoutUrl });
}
