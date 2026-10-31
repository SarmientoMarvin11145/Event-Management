import { createClient } from "@supabase/supabase-js";
import { verifyPayMongoWebhook } from "@/lib/paymongo";
import { getSupabaseEnv } from "@/lib/supabase-env";

export async function POST(request) {
  const webhookSecret = process.env.PAYMONGO_WEBHOOK_SECRET;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!webhookSecret || !serviceRoleKey) {
    return Response.json({ error: "Payment webhook is not configured." }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyPayMongoWebhook(rawBody, request.headers.get("paymongo-signature"), webhookSecret)) {
    return Response.json({ error: "Invalid PayMongo webhook signature." }, { status: 401 });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid webhook payload." }, { status: 400 });
  }

  const webhookEvent = payload?.data;
  if (webhookEvent?.type !== "checkout_session.payment.paid") {
    return Response.json({ received: true });
  }
  if (webhookEvent.livemode !== false) {
    return Response.json({ error: "Only PayMongo test-mode payments are accepted." }, { status: 400 });
  }

  const session = webhookEvent.data;
  const attributes = session?.attributes;
  const { supabaseUrl } = getSupabaseEnv();
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const payment = Array.isArray(attributes?.payments)
    ? attributes.payments.find((item) => item?.attributes?.status === "paid")
    : null;
  const paymentAttributes = payment?.attributes;
  const referenceNumber = attributes?.reference_number;
  const amount = paymentAttributes?.amount;
  const currency = paymentAttributes?.currency;
  const paymentMethod = paymentAttributes?.source?.type
    || paymentAttributes?.payment_method_used
    || paymentAttributes?.payment_method_details?.type
    || null;

  if (
    typeof session?.id !== "string" ||
    typeof payment?.id !== "string" ||
    typeof referenceNumber !== "string" ||
    !Number.isSafeInteger(amount) ||
    typeof currency !== "string"
  ) {
    return Response.json({ error: "Incomplete PayMongo payment event." }, { status: 400 });
  }

  const { data, error } = await serviceClient.rpc("complete_paymongo_payment", {
    p_reference_number: referenceNumber,
    p_checkout_session_id: session.id,
    p_payment_id: payment.id,
    p_amount: amount,
    p_currency: currency,
    p_payment_method: paymentMethod,
  });
  if (error) {
    console.error("Unable to apply PayMongo payment", error);
    return Response.json({ error: "Could not apply the payment to the order." }, { status: 500 });
  }
  if (!data) {
    console.error("PayMongo payment did not match a pending order", { referenceNumber, sessionId: session.id });
    return Response.json({ received: true, applied: false });
  }

  return Response.json({ received: true });
}
