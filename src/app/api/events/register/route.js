import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase-server";
import { createPayMongoCheckout, isPayMongoCheckoutUrl } from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";
import { isFeatureEnabled } from "@/lib/features";

function getServiceClient() {
  const { supabaseUrl } = getSupabaseEnv();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured for payment processing.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function normalizedDetails(body) {
  return {
    eventId: typeof body?.eventId === "string" ? body.eventId : "",
    planId: typeof body?.planId === "string" ? body.planId : "",
    quantity: Number(body?.quantity),
    fullName: typeof body?.fullName === "string" ? body.fullName.trim() : "",
    email: typeof body?.email === "string" ? body.email.trim() : "",
    phone: typeof body?.phone === "string" ? body.phone.trim() : "",
    address: typeof body?.address === "string" ? body.address.trim() : "",
    seatIds: Array.isArray(body?.seatIds) ? body.seatIds : [],
  };
}

function isValidDetails(details) {
  return details.eventId.length <= 64
    && details.planId.length <= 64
    && details.seatIds.length <= 20
    && details.seatIds.every((seatId) => typeof seatId === "string" && seatId.length <= 24)
    && Number.isInteger(details.quantity)
    && details.quantity >= 1
    && details.quantity <= 20
    && details.fullName.length >= 1
    && details.fullName.length <= 120
    && details.email.length <= 254
    && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(details.email)
    && details.phone.length >= 7
    && details.phone.length <= 40
    && details.address.length <= 500;
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
  const details = normalizedDetails(body);
  if (!details.eventId || !details.planId || !isValidDetails(details)) {
    return Response.json({ error: "Check your contact details and ticket selection." }, { status: 400 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError?.name !== "AuthSessionMissingError" && authError) throw authError;
  if (!user) return Response.json({ error: "Sign in to register for an event." }, { status: 401 });

  const args = {
    p_event_id: details.eventId,
    p_plan_id: details.planId,
    p_quantity: details.quantity,
    p_full_name: details.fullName,
    p_email: details.email,
    p_phone: details.phone,
    p_address: details.address || null,
    p_seat_ids: details.seatIds,
  };

  const { data: planData, error: planError } = await supabase.rpc("get_event_ticket_plans", {
    p_event_id: details.eventId,
  });
  if (planError) throw new Error(`Unable to verify the selected ticket plan: ${planError.message}`, { cause: planError });
  const plan = planData?.find((item) => item.id === details.planId);
  if (!plan) return Response.json({ error: "This ticket plan is no longer available." }, { status: 409 });

  if (Number(plan.price) === 0) {
    const { data: registrationId, error } = await supabase.rpc("register_for_event_ticket_plan", args);
    if (error) return Response.json({ error: error.message }, { status: 400 });
    return Response.json({ registrationId }, { status: 201 });
  }

  if (!(await isFeatureEnabled("payment-gateway"))) {
    return Response.json({ error: "Paid checkout is currently disabled." }, { status: 503 });
  }
  if (!process.env.PAYMONGO_SECRET_KEY?.startsWith("sk_test_")) {
    return Response.json({ error: "Configure a PayMongo test secret key to enable checkout." }, { status: 503 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return Response.json({ error: "Payment processing is not configured on the server." }, { status: 503 });
  }

  const serviceClient = getServiceClient();
  const { data: orderRows, error: orderError } = await serviceClient.rpc("create_paymongo_event_ticket_order", {
    p_user_id: user.id,
    ...args,
  });
  if (orderError) return Response.json({ error: orderError.message }, { status: 400 });
  const order = orderRows?.[0];
  if (!order) return Response.json({ error: "Could not prepare this payment." }, { status: 500 });
  if (order.checkout_url) {
    if (!isPayMongoCheckoutUrl(order.checkout_url)) {
      return Response.json({ error: "The saved checkout URL is invalid." }, { status: 500 });
    }
    return Response.json({ checkoutUrl: order.checkout_url });
  }

  let checkout;
  try {
    checkout = await createPayMongoCheckout({
      order: { ...order, payment_type: "event_ticket" },
      origin,
    });
  } catch (error) {
    const { error: updateError } = await serviceClient.rpc("set_paymongo_order_terminal_status", {
      p_reference_number: order.reference_number,
      p_checkout_session_id: null,
      p_status: "failed",
    });
    if (updateError) console.error("Unable to release failed event payment reservation", updateError);
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
    return Response.json({ error: "The checkout was created but could not be saved. Contact support before retrying." }, { status: 500 });
  }
  return Response.json({ checkoutUrl: checkout.checkoutUrl });
}
