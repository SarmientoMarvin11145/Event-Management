import { createClient } from "@supabase/supabase-js";
import { verifyPayMongoWebhook } from "@/lib/paymongo";
import { sendSendGridEmail } from "@/lib/sendgrid";
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

  const { data: transaction, error: transactionError } = await serviceClient
    .from("payment_transactions")
    .select("id, user_id, payment_type, plan_tier, amount, currency, status, events(title, start_date)")
    .eq("reference_number", referenceNumber)
    .maybeSingle();
  if (transactionError) {
    console.error("Unable to load PayMongo transaction email details", transactionError);
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

  if (transaction?.status === "pending") {
    const { data: authUserResult, error: authUserError } = await serviceClient.auth.admin.getUserById(transaction.user_id);
    if (authUserError) {
      console.error("Unable to load payment recipient", authUserError);
    } else if (authUserResult.user?.email) {
      const isEventTicket = transaction.payment_type === "event_ticket";
      let shouldSend = true;
      if (isEventTicket) {
        const { data: settings, error: settingsError } = await serviceClient
          .from("attendee_settings")
          .select("notification_preferences")
          .eq("user_id", transaction.user_id)
          .maybeSingle();
        if (settingsError) {
          console.error("Unable to load payment email preferences", settingsError);
          shouldSend = false;
        } else {
          shouldSend = settings?.notification_preferences?.registration_confirmations !== false;
        }
      }

      if (shouldSend) {
        const event = Array.isArray(transaction.events) ? transaction.events[0] : transaction.events;
        const paidAmount = new Intl.NumberFormat("en-PH", {
          style: "currency",
          currency: transaction.currency,
        }).format(Number(transaction.amount) / 100);
        const subject = isEventTicket
          ? `KURO ticket confirmed: ${event?.title || "Event"}`
          : `KURO ${transaction.plan_tier} plan payment confirmed`;
        const text = isEventTicket
          ? `Your payment of ${paidAmount} was confirmed and your registration for ${event?.title || "the event"} is confirmed.${event?.start_date ? `\nEvent date: ${new Intl.DateTimeFormat("en-PH", { dateStyle: "long", timeStyle: "short", timeZone: "Asia/Manila" }).format(new Date(event.start_date))}` : ""}\n\nYour ticket details are available in your KURO workspace.`
          : `Your payment of ${paidAmount} was confirmed. Your KURO ${transaction.plan_tier} account plan is now active for one month.`;
        try {
          await sendSendGridEmail({ to: authUserResult.user.email, subject, text });
        } catch (emailError) {
          console.error("Unable to send PayMongo confirmation email", emailError);
        }
      }
    }
  }

  return Response.json({ received: true });
}
